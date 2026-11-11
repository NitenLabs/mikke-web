// 店主の直し（指示 0049 段3）：① への差分の当て方・印との対応・表示の字数・書き出しの差の検査。
// 純粋な関数だけ（通信・ブラウザ・ファイルを使わない）。tools/edit-ops.test.mjs で確かめる。
// 差分の形と当て方は mikke-desk の src/edit/diff.ts（applyOps）と同じ規則（docs/HANDOFF_0049.md）：
//   { op: "set" | "add" | "remove", path: JSON Pointer, value, doc: "shop"（既定）| "site" }
//   set＝親が在るときに値を置く（無ければ作る）／add＝まだ無いキーを足す（配列は /- で末尾）／remove＝在る物を消す
//   doc:"site" は /elements/<要素ID>/text の set だけ。value は文字列で \n が段落の区切り
import crypto from "node:crypto";
import { applyFormat, getPointer } from "./format.mjs";

export const MAX_OPS = 30;
const OPS = new Set(["set", "add", "remove"]);

export class EditError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** mikke-desk の base_hash と同じ：JSON.stringify(①) の SHA-256（16進） */
export const shopHash = (shop) => crypto.createHash("sha256").update(JSON.stringify(shop)).digest("hex");

// ───────── JSON Pointer

export function parsePointer(p) {
  if (typeof p !== "string" || !p.startsWith("/")) return null;
  const segs = p.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (segs.some((s) => s === "" || s === "__proto__" || s === "constructor" || s === "prototype")) return null;
  return segs;
}
export const toPointer = (segs) => "/" + segs.map((s) => s.replace(/~/g, "~0").replace(/\//g, "~1")).join("/");

export function getAt(root, segs) {
  let cur = root;
  for (const s of segs) {
    if (Array.isArray(cur)) cur = /^\d+$/.test(s) ? cur[Number(s)] : undefined;
    else if (isObj(cur)) cur = has(cur, s) ? cur[s] : undefined;
    else return undefined;
  }
  return cur;
}

const siteTextId = (segs) => (segs.length === 3 && segs[0] === "elements" && segs[2] === "text" ? segs[1] : null);

// ───────── 形の検査（当てる前）

/** op の形だけを確かめる。だめなら EditError */
export function checkOpShape(ops) {
  if (!Array.isArray(ops) || ops.length === 0) throw new EditError("ops", "差分が空か、配列でない");
  if (ops.length > MAX_OPS) throw new EditError("ops", `差分が多すぎる（${ops.length} 件。上限 ${MAX_OPS}）`);
  ops.forEach((o, i) => {
    const at = `差分 ${i + 1}`;
    if (!isObj(o)) throw new EditError("ops", `${at}：形が違う`);
    if (!OPS.has(o.op)) throw new EditError("ops", `${at}：op が違う（${String(o.op)}）`);
    const doc = o.doc ?? "shop";
    if (doc !== "shop" && doc !== "site") throw new EditError("ops", `${at}：doc が違う（${String(o.doc)}）`);
    const segs = parsePointer(o.path);
    if (!segs) throw new EditError("ops", `${at}：path の形が違う（${String(o.path)}）`);
    if (o.op !== "remove" && o.value === undefined) throw new EditError("ops", `${at}：value が無い`);
    if (doc === "site" && (!siteTextId(segs) || o.op !== "set" || typeof o.value !== "string")) {
      throw new EditError("ops", `${at}：site は /elements/<要素ID>/text への文字の set だけ（${o.path}）`);
    }
  });
}

// ───────── 当てる

function applyOne(root, segs, op, value) {
  const parent = getAt(root, segs.slice(0, -1));
  const last = segs[segs.length - 1];
  const where = toPointer(segs);
  if (Array.isArray(parent)) {
    if (op === "add" && last === "-") { parent.push(clone(value)); return; }
    if (!/^\d+$/.test(last) || Number(last) >= parent.length) throw new EditError("path", `配列の位置が無い：${where}`);
    if (op === "remove") parent.splice(Number(last), 1);
    else if (op === "add") parent.splice(Number(last), 0, clone(value));
    else parent[Number(last)] = clone(value);
    return;
  }
  if (!isObj(parent)) throw new EditError("path", `親が無い：${where}`);
  const exists = has(parent, last);
  if (op === "add" && exists) throw new EditError("path", `もう在る：${where}`);
  if (op === "remove") {
    if (!exists) throw new EditError("path", `無い物は消せない：${where}`);
    delete parent[last];
    return;
  }
  parent[last] = clone(value);
}

/**
 * 消す差分（remove）に連れて消す物を足す（0044 の残り）：① の review（確かめ待ち・口コミなどの出所）のうち、
 * 消す所かその下を指す物。残すと validate が「review の場所に値がありません」で落ちる。
 * 配列の中の位置を消す remove は対象にしない（位置がずれるため。今の印では品・載せ方・項目の remove だけ）。
 * 返り：{ ops（元の差分＋足した remove）, added: [{ op, path, because }] }。元の ops は変えない
 */
export function withLinkedRemovals(shop, ops) {
  const added = [];
  const reviews = isObj(shop?.review) ? Object.keys(shop.review) : [];
  const already = new Set((ops ?? []).filter((o) => o?.op === "remove" && (o.doc ?? "shop") === "shop").map((o) => o.path));
  for (const o of ops ?? []) {
    if (!isObj(o) || o.op !== "remove" || (o.doc ?? "shop") !== "shop") continue;
    const segs = parsePointer(o.path);
    if (!segs || segs[0] === "review") continue;
    if (Array.isArray(getAt(shop, segs.slice(0, -1)))) continue;
    const pre = toPointer(segs);
    for (const ptr of reviews) {
      if (ptr !== pre && !ptr.startsWith(pre + "/")) continue;
      const p = toPointer(["review", ptr]);
      if (already.has(p)) continue;
      already.add(p);
      added.push({ op: "remove", path: p, because: o.path });
    }
  }
  return { ops: [...(ops ?? []), ...added.map(({ op, path }) => ({ op, path }))], added };
}

/** 文字（\n 区切り）→ site.json の paragraphs。元の run の飾り（text 以外のキー）は1つ目の run から引き継ぐ */
export function textToParagraphs(text, oldParagraphs = []) {
  const firstRun = oldParagraphs?.[0]?.runs?.[0] ?? {};
  const deco = Object.fromEntries(Object.entries(firstRun).filter(([k]) => k !== "text" && k !== "bind"));
  const paraDeco = Object.fromEntries(Object.entries(oldParagraphs?.[0] ?? {}).filter(([k]) => k !== "runs"));
  return String(text).split("\n").map((t) => ({ ...paraDeco, runs: [{ ...deco, text: t }] }));
}
export const paragraphsToText = (paras) => (paras ?? []).map((p) => (p.runs ?? []).map((r) => r.text ?? "").join("")).join("\n");

/**
 * 差分を当てた写しを返す（元は変えない）。
 * shop の op は ① に、site の op は siteTexts（{要素ID: 文字}）に。site の箱は site.json に在って、連動（bind）の無い文字だけ
 */
export function applyOps(shop, site, ops) {
  checkOpShape(ops);
  const s = clone(shop);
  const texts = {};
  for (const o of ops) {
    const segs = parsePointer(o.path);
    if ((o.doc ?? "shop") === "site") {
      const id = siteTextId(segs);
      const el = site?.elements?.[id];
      if (!el || !Array.isArray(el.paragraphs)) throw new EditError("path", `文字の箱が無い：${id}`);
      if (el.paragraphs.some((p) => (p.runs ?? []).some((r) => r.bind))) throw new EditError("path", `① と連動している箱は site で直さない：${id}`);
      texts[id] = o.value;
      continue;
    }
    applyOne(s, segs, o.op, o.value);
  }
  return { shop: s, texts };
}

/** site.json の写しに文字の箱の差分を当てる */
export function applySiteTexts(site, texts) {
  const out = clone(site);
  for (const [id, text] of Object.entries(texts)) {
    const el = out.elements?.[id];
    if (!el) throw new EditError("path", `文字の箱が無い：${id}`);
    el.paragraphs = textToParagraphs(text, el.paragraphs);
  }
  return out;
}

/**
 * 型の設定（例 wa03.json）の中で、今の文字（段落の配列か1つの文字列）と同じ所を新しい文字に替える。
 * gen が site.json を設定から作り直す店では、ここを直さないと次の gen で戻るため。
 * 1か所だけ一致したときだけ替える。返り：{ config, replaced: [path…], missing: [要素ID…] }
 */
export function applyTextsToGenConfig(config, site, texts) {
  const out = clone(config);
  const replaced = [];
  const missing = [];
  for (const [id, text] of Object.entries(texts)) {
    const oldParas = (site.elements?.[id]?.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text ?? "").join(""));
    const oldJoined = oldParas.join("\n");
    const hits = [];
    (function walk(v, segs) {
      if (Array.isArray(v)) {
        if (v.length === oldParas.length && v.every((x, i) => x === oldParas[i])) hits.push({ segs, kind: "array" });
        else v.forEach((x, i) => walk(x, [...segs, String(i)]));
      } else if (isObj(v)) for (const k of Object.keys(v)) walk(v[k], [...segs, k]);
      else if (typeof v === "string" && v === oldJoined && oldParas.length === 1) hits.push({ segs, kind: "string" });
    })(out, []);
    if (hits.length !== 1) { missing.push(id); continue; }
    const { segs, kind } = hits[0];
    const val = kind === "array" ? String(text).split("\n") : String(text);
    const parent = getAt(out, segs.slice(0, -1));
    parent[segs[segs.length - 1]] = val;
    replaced.push(toPointer(segs));
  }
  return { config: out, replaced, missing };
}

// ───────── 印（data-edit）との対応

/** HTML の data-edit の値を集める（空白区切りで複数） */
export function collectTargets(html) {
  const vals = [...String(html).matchAll(/data-edit="([^"]*)"/g)].map((m) => m[1]);
  return [...new Set(vals.flatMap((v) => v.split(/\s+/)).filter(Boolean))].sort();
}

const startsWith = (segs, pre) => pre.length <= segs.length && pre.every((p, i) => segs[i] === p);

/**
 * 1つの op が触ってよい印のキーの集まり（書き出しの差を許す所）。印が無ければ EditError（印の無い所は当てない）。
 * mikke-desk の resolve（targetForPath）と同じ対応。品の項目を直すときは、その品のカード（item:<ID>）の中も許す（写真の alt など）
 */
export function expectedKeys(op, shop, targets, allOps = []) {
  const T = new Set(targets);
  const segs = parsePointer(op.path);
  const need = (k) => { if (!T.has(k)) throw new EditError("mark", `印の無い所：${k}（${op.path}）`); return k; };
  if ((op.doc ?? "shop") === "site") return [need(`text:${siteTextId(segs)}`)];
  if (segs[0] === "catalog" && segs[1] === "items" && segs[2]) {
    const id = segs[2];
    if (segs.length === 3) {
      let menus;
      if (op.op === "add") {
        menus = allOps.filter((x) => x.op === "add" && isObj(x.value) && x.value.itemId === id && parsePointer(x.path)?.[1] === "placements").map((x) => String(x.value.menuId));
        if (!menus.length) throw new EditError("mark", `新しい品 ${id} を載せる placements の add が無い`);
      } else if (op.op === "remove") {
        menus = Object.values(getAt(shop, ["catalog", "placements"]) ?? {}).filter((p) => isObj(p) && p.itemId === id).map((p) => String(p.menuId));
        if (!menus.length) throw new EditError("mark", `品 ${id} はどの品書きにも載っていない`);
      } else throw new EditError("mark", "品まるごとの set はしない（項目ごとに直す）");
      return [...new Set(menus)].map((m) => need(`list:catalog:${m}`)).concat([`item:${id}`]);
    }
    const f = segs[3];
    if (f === "status" && segs.length === 4) return [need(`item:${id}`)];
    if (!["name", "description", "prices"].includes(f)) throw new EditError("mark", `品の ${f} は直せる所ではない`);
    if (T.has(`item:${id}/${f}`)) return [`item:${id}/${f}`, `item:${id}`];
    if (f === "prices" && T.has(`item:${id}`)) return [`item:${id}`];
    throw new EditError("mark", `印の無い所：item:${id}/${f}`);
  }
  if (segs[0] === "catalog" && segs[1] === "placements" && segs[2]) {
    const id = segs[2];
    let menu = null;
    if (segs.length === 3 && op.op === "add") menu = isObj(op.value) ? op.value.menuId : null;
    else if ((segs.length === 3 && op.op === "remove") || (segs.length === 4 && segs[3] === "order" && op.op === "set")) {
      menu = getAt(shop, ["catalog", "placements", id, "menuId"]);
    } else throw new EditError("mark", "載せ方（placements）は 足す・消す・order だけ");
    if (typeof menu !== "string") throw new EditError("mark", `載せ方 ${id} の品書きが分からない`);
    const keys = [need(`list:catalog:${menu}`)];
    const itemId = segs.length === 3 && op.op === "add" ? op.value.itemId : getAt(shop, ["catalog", "placements", id, "itemId"]);
    if (typeof itemId === "string") keys.push(`item:${itemId}`);
    return keys;
  }
  if (segs[0] === "location" && segs[1] === "geo") throw new EditError("mark", "地図の位置は直さない");
  let best = null;
  for (const t of targets) {
    if (!t.startsWith("shop:")) continue;
    const pre = parsePointer(t.slice(5));
    if (pre && startsWith(segs, pre) && (!best || pre.length > best.length)) best = pre;
  }
  if (!best) throw new EditError("mark", `印の無い所：${op.path}`);
  return [`shop:${toPointer(best)}`];
}

export function expectedKeysAll(ops, shop, targets) {
  return [...new Set(ops.flatMap((o) => expectedKeys(o, shop, targets, ops)))].sort();
}

// ───────── 表示の字数（edit-limits の maxRenderedChars。Worker では測れない所）

/**
 * limits.fields の maxRenderedChars を、site.json の連動（bind）と本物の format で測る。
 * 返り：[{ key, el, format, chars, max, ok, text }]（連動が見つからない上限は el=null・ok=true で記録）
 */
export function checkRenderedLimits(shop, site, limits, refYear) {
  const out = [];
  for (const [key, lim] of Object.entries(limits?.fields ?? {})) {
    if (!key.startsWith("shop:") || typeof lim?.maxRenderedChars !== "number") continue;
    const pre = parsePointer(key.slice(5));
    let found = 0;
    for (const [id, el] of Object.entries(site?.elements ?? {})) {
      for (const p of el.paragraphs ?? []) for (const r of p.runs ?? []) {
        const b = r.bind;
        if (!b || (b.scope ?? "shop") !== "shop") continue;
        const bs = parsePointer(b.path);
        if (!bs || !(startsWith(bs, pre) || startsWith(pre, bs))) continue;
        const v = applyFormat(b.format ?? "plain", getPointer(shop, b.path), { refYear });
        const text = Array.isArray(v) ? v.join("\n") : String(v ?? "");
        const chars = [...text].length;
        found++;
        out.push({ key, el: id, format: b.format ?? "plain", chars, max: lim.maxRenderedChars, ok: chars <= lim.maxRenderedChars, text });
      }
    }
    if (!found) out.push({ key, el: null, format: null, chars: 0, max: lim.maxRenderedChars, ok: true, text: "（連動が見つからない）" });
  }
  return out;
}

// ───────── 書き出しの HTML の差（印の所だけか）

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** 位置・大きさ（作り直しで動いてよい物）として比べない属性 */
const LAYOUT_ATTR = (k) => k === "style" || k === "class" || k.startsWith("data-mh-");

function parseAttrs(s) {
  const a = {};
  for (const m of String(s).matchAll(/([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) a[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return a;
}

/** 書き出しの HTML（自前の emit の物）を木にする。style の中身は比べない（位置は動いてよい）。script は raw に持つ */
export function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<![^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let m;
  const text = (t) => {
    const s = t.replace(/\s+/g, " ").trim();
    if (s) stack[stack.length - 1].children.push({ tag: "#text", text: s });
  };
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index));
    last = re.lastIndex;
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    const node = { tag, attrs: parseAttrs(m[3]), children: [] };
    stack[stack.length - 1].children.push(node);
    if (tag === "style" || tag === "script") {
      const end = html.indexOf(`</${tag}`, re.lastIndex);
      node.raw = tag === "script" ? html.slice(re.lastIndex, end < 0 ? html.length : end) : "";
      const close = end < 0 ? html.length : html.indexOf(">", end) + 1;
      re.lastIndex = last = close;
      continue;
    }
    if (!VOID.has(tag) && !m[4]) stack.push(node);
  }
  text(html.slice(last));
  return root;
}

const marksOf = (n) => (n.attrs?.["data-edit"] ?? "").split(/\s+/).filter(Boolean);
const keyOf = (n) => {
  if (n.tag === "#text") return null;
  const a = n.attrs;
  const k = a["data-el"] ?? a["data-card"] ?? a["data-cel"] ?? a["data-sec"] ?? a.id;
  return k != null ? `${n.tag}[${k}]` : null;
};
const label = (n) => {
  const a = n.attrs ?? {};
  const k = a["data-el"] ?? a["data-card"] ?? a["data-cel"] ?? a["data-sec"] ?? a.id;
  return k ? `${n.tag}[${k}]` : n.tag;
};
const sig = (n) => (n.tag === "#text" ? `#text` : `${n.tag} ${JSON.stringify(Object.entries(n.attrs).filter(([k]) => !LAYOUT_ATTR(k)).sort())}${n.raw != null ? " " + n.raw : ""}`);
const textOf = (n) => (n.tag === "#text" ? n.text : (n.children ?? []).map(textOf).filter(Boolean).join(" "));
const subtreeMarks = (n) => [...marksOf(n), ...(n.children ?? []).flatMap(subtreeMarks)];
const cut = (s, n = 120) => { const a = [...String(s)]; return a.length > n ? a.slice(0, n).join("") + "…" : a.join(""); };

/** 子の並びを鍵（data-el など）で突き合わせる。鍵の無い物は同じ tag の何番目かで */
function align(as, bs) {
  const index = (list) => {
    const map = new Map();
    const count = {};
    for (const n of list) {
      let k = keyOf(n);
      if (!k) { const t = n.tag; count[t] = (count[t] ?? 0) + 1; k = `${t}#${count[t]}`; }
      else { count[k] = (count[k] ?? 0) + 1; if (count[k] > 1) k = `${k}#${count[k]}`; }
      map.set(k, n);
    }
    return map;
  };
  const A = index(as), B = index(bs);
  const pairs = [];
  for (const [k, a] of A) pairs.push([a, B.get(k) ?? null]);
  for (const [k, b] of B) if (!A.has(k)) pairs.push([null, b]);
  return pairs;
}

/**
 * 前と後の HTML を比べ、変わった所を「一番内側の印」ごとにまとめる。
 * 返り：{ changes: [{ kind, where, marks, before, after }], unexpected: [...]（expected の印の外の変化） }
 *   kind：text（文字）・attr（属性。位置・大きさの style・class・data-mh-* は数えない）・added・removed・script
 *   marks：その変化を含む一番内側の印（無ければ []）。added/removed は、その物の中の印も足す
 */
export function diffMarked(beforeHtml, afterHtml, expected) {
  const E = new Set(expected);
  const changes = [];
  // holder：変化を含む一番内側の印つきの要素（前と後）。要点は要素ごとにまとめる
  const walk = (a, b, path, inner, holder) => {
    const pairs = align(a.children ?? [], b.children ?? []);
    for (const [x, y] of pairs) {
      const n = x ?? y;
      const here = `${path}/${label(n)}`;
      const own = marksOf(n);
      const marks = own.length ? own : inner;
      const hold = own.length ? { where: here, a: x, b: y, marks: own } : holder;
      if (!x || !y) {
        const sub = subtreeMarks(n);
        changes.push({ kind: x ? "removed" : "added", where: here, marks: [...new Set([...inner, ...sub])], before: x ? cut(textOf(x)) : "", after: y ? cut(textOf(y)) : "", inner: sub, hold });
        continue;
      }
      if (x.tag === "#text") {
        if (x.text !== y.text) changes.push({ kind: "text", where: path, marks: inner, before: cut(x.text), after: cut(y.text), hold: holder });
        continue;
      }
      if (sig(x) !== sig(y)) {
        changes.push({ kind: x.raw != null && x.raw !== y.raw ? "script" : "attr", where: here, marks, before: cut(sig(x)), after: cut(sig(y)), hold });
      }
      walk(x, y, here, marks, hold);
    }
  };
  walk(parseHtml(beforeHtml), parseHtml(afterHtml), "", [], null);
  // 許す：script 以外で、一番内側の印が expected に在る（added/removed は中の印でもよい）。sec:・photo: は expected に入らないので段の中の印の無い所は許さない
  const allowed = (c) => c.kind !== "script" && (c.marks.some((k) => E.has(k)) || ((c.kind === "added" || c.kind === "removed") && c.inner.some((k) => E.has(k))));
  const unexpected = changes.filter((c) => !allowed(c));
  // 印つきの要素ごとの要点（前と後の文字）。印の外の変化は1件ずつ
  const elements = new Map();
  for (const c of changes) {
    const h = c.hold;
    const k = h ? h.where : `${c.where}#${c.kind}`;
    const e = elements.get(k) ?? (h
      ? { where: h.where, marks: h.marks, kinds: [], before: h.a ? cut(textOf(h.a)) : "", after: h.b ? cut(textOf(h.b)) : "", allowed: true }
      : { where: c.where, marks: c.marks, kinds: [], before: c.before, after: c.after, allowed: true });
    if (!e.kinds.includes(c.kind)) e.kinds.push(c.kind);
    if (!allowed(c)) e.allowed = false;
    elements.set(k, e);
  }
  const strip = ({ inner, hold, ...c }) => c;
  return { changes: changes.map(strip), unexpected: unexpected.map(strip), elements: [...elements.values()] };
}

/** 変わった印の要点（管理画面の「作り直しの結果」に出す） */
export function summarizeChanges(changes, max = 40) {
  return changes.slice(0, max).map((c) => ({ ...(c.kinds ? { kinds: c.kinds, allowed: c.allowed } : { kind: c.kind }), marks: c.marks, where: c.where.split("/").slice(-2).join("/"), before: c.before, after: c.after }));
}

// ───────── 型の検査（waNN-check）の結果の読み分け

/**
 * waNN-check の出力の NG 行を、直しで動いてよい物（設計の高さとの違い・カードの枚数）と、崩れ（はみ出し・重なりなど）に分ける。
 * 型の検査は「型の見本どおりか」も見るので、中身が伸びれば段の高さは設計と違って当然。崩れだけを失敗にする。
 */
export function classifyCheck(stdout) {
  const ng = String(stdout ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("NG "));
  const expected = (l) => /高さ [\d.]+（設計 [\d.]+）$/.test(l) || /: カード \d+ 枚$/.test(l);
  return { problems: ng.filter((l) => !expected(l)), layoutDiffs: ng.filter(expected) };
}
