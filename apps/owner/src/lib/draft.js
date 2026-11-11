// 下書き（① shop と ② site＝{draft, theme}）と、画面の項目のつなぎ（SPEC 3章・6章）。純粋。
// ② は DATA_SPEC 4.9.3 の型の店の形 {draft: {template, sections: {}, content?: {要素ID: 文字 | {asset}}}, theme?}（0065）。
// 元の文字・写真（samples の site.json に当たる物）は下書きに無いので、呼ぶ側（main.js）が下地の HTML から渡す（base）。
import { formatHoursShort, formatPriceAll, getPointer } from "../../../../tools/lib/format.mjs";

const clone = (o) => JSON.parse(JSON.stringify(o));
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 下地の印（data-edit の値の並び）から、直してよい所をまとめる。
 * @param {{edit:string, el?:string, card?:string, cel?:string, item?:string}[]} marks  下地の [data-edit] の要素ごと
 * @returns {{keys:Set<string>, shopPtrs:Set<string>, texts:Set<string>, itemFields:Set<string>, lists:Set<string>, photos:{key, elId?, itemId?, assetId}[]}}
 *   itemFields：どれかの品のカードに印がある項目（同じカードなので全部の品に当てる。値段の無い品のカードには印が出ないため）
 */
export function editableFrom(marks) {
  const keys = new Set(), shopPtrs = new Set(), texts = new Set(), itemFields = new Set(), lists = new Set(), photos = [];
  for (const m of marks) {
    for (const k of String(m.edit).split(/\s+/).filter(Boolean)) {
      keys.add(k);
      if (k.startsWith("shop:")) shopPtrs.add(k.slice(5));
      else if (k.startsWith("text:")) texts.add(k.slice(5));
      else if (k.startsWith("list:")) lists.add(k.slice(5));
      else if (k.startsWith("item:")) { const f = k.split("/")[1]; if (f) itemFields.add(f); }
      else if (k.startsWith("photo:")) {
        const assetId = k.slice(6);
        if (m.cel === "c_ph" && m.item) { itemFields.add("photos"); photos.push({ key: k, itemId: m.item, assetId }); }
        else if (m.el) photos.push({ key: k, elId: m.el, assetId });
      }
    }
  }
  return { keys, shopPtrs, texts, itemFields, lists, photos };
}

// ---- content[要素ID] の出し入れ（何もしていない所・元と同じ値・空の content は書かない。DATA_SPEC 4.9.3）
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function putContent(site, elId, value) {
  const s = clone(site ?? {});
  if (value === undefined && !isObj(s.draft?.content)) return s;
  s.draft ??= {};
  const c = isObj(s.draft.content) ? s.draft.content : {};
  if (value === undefined) delete c[elId];
  else c[elId] = value;
  if (Object.keys(c).length) s.draft.content = c;
  else delete s.draft.content;
  return s;
}

// ---- 表紙の言葉（② の文字の箱 fv_copy）。content[要素ID] は段落を \n でつないだ文字列（見た目の無い文字。DATA_SPEC 4.9.3「文字」）
/** 今の段落。content が無ければ base（元の段落。下地の HTML から） */
export function textParagraphs(site, elId, base = []) {
  const v = site?.draft?.content?.[elId];
  const t = typeof v === "string" ? v
    : Array.isArray(v) ? v.map((r) => (typeof r === "string" ? r : r?.text ?? "")).join("")
    : null;
  return t == null ? [...base] : t.split("\n");
}
/** 段落を content[要素ID] に（trim・空行を落とす）。base（元の段落）と同じなら書かない。gen に戻らないようにするのは作り直しの側（api-source） */
export function setTextParagraphs(site, elId, lines, base = []) {
  const ls = lines.map((t) => String(t).trim()).filter(Boolean);
  const b = base.map((t) => String(t).trim()).filter(Boolean);
  return putContent(site, elId, same(ls, b) ? undefined : ls.join("\n"));
}

// ---- ① の値（JSON Pointer）
export function setPointer(obj, ptr, value) {
  const o = clone(obj);
  const parts = ptr.split("/").slice(1).map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = o;
  for (const k of parts.slice(0, -1)) { if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {}; cur = cur[k]; }
  cur[parts.at(-1)] = value;
  return o;
}
/** 物語（/story/…）を直したら story.draft を外す */
export function setShopValue(shop, ptr, value) {
  const s = setPointer(shop, ptr, value);
  if (ptr.startsWith("/story/") && s.story) delete s.story.draft;
  return s;
}
export { getPointer };

// ---- 写真
/** ② の写真の要素を差し替える：content[要素ID] = {asset}（切り抜きは上げる前に済ませるので持たない）。baseAsset（元の素材）と同じなら書かない */
export function setElementPhoto(site, elId, assetId, baseAsset = null) {
  return putContent(site, elId, assetId === baseAsset ? undefined : { asset: assetId });
}
export function setItemPhoto(shop, itemId, assetId) {
  const s = clone(shop);
  const it = s.catalog?.items?.[itemId];
  if (it) { it.photos = [assetId, ...(it.photos ?? []).slice(1)]; delete it.draft; }
  return s;
}
/** 写真の欄の今の素材 */
export function photoAsset(slot, shop, site) {
  if (slot.itemId) return shop?.catalog?.items?.[slot.itemId]?.photos?.[0] ?? null;
  const v = site?.draft?.content?.[slot.elId];
  return (isObj(v) && typeof v.asset === "string" ? v.asset : null) ?? slot.assetId;
}

// ---- 保存の前の確かめ：印の無い所を変えていないか
const IGNORE = (p) => /\/draft$/.test(p) || p.startsWith("/review/") || p === "/updatedAt";
export function changedPaths(a, b, base = "") {
  if (same(a, b)) return [];
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b) || Array.isArray(a)) return [base || "/"];
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...changedPaths(a[k], b[k], `${base}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`));
  return out;
}
/**
 * 印の無い所の変更（あれば保存しない）。
 * ① は shop:<ptr> の下・/catalog/items/<id>/<印のある項目>・品の出し入れ（list の印があるとき）だけ。② は content の text:<id> の箱・photo の要素だけ
 */
export function outsideEdits(ed, origShop, shop, origSite, site) {
  const bad = [];
  for (const p of changedPaths(origShop, shop)) {
    if (IGNORE(p)) continue;
    if ([...ed.shopPtrs].some((q) => p === q || p.startsWith(q + "/"))) continue;
    const m = /^\/catalog\/items\/([^/]+)(?:\/([^/]+))?/.exec(p);
    if (m && (m[2] ? ed.itemFields.has(m[2]) || m[2] === "draft" : ed.lists.size > 0)) continue;
    if (m && !origShop?.catalog?.items?.[m[1]] && ed.lists.size) continue;   // 足した品
    if (/^\/catalog\/placements\//.test(p) && ed.lists.size) continue;
    bad.push(`①${p}`);
  }
  const elOk = new Set([...ed.texts, ...ed.photos.filter((x) => x.elId).map((x) => x.elId)]);
  for (const p of changedPaths(origSite, site)) {
    const m = /^\/draft\/content\/([^/]+)/.exec(p);
    if (m && elOk.has(m[1].replace(/~1/g, "/").replace(/~0/g, "~"))) continue;
    // content ごと出来た・消えた（片方が無い）：中のキーが全部許す ID なら通す
    if (p === "/draft/content") {
      const keys = [...Object.keys(origSite?.draft?.content ?? {}), ...Object.keys(site?.draft?.content ?? {})];
      if (keys.every((k) => elOk.has(k))) continue;
    }
    bad.push(`②${p}`);
  }
  return bad;
}

/** どちらの下書きを送るか */
export function dirtyKinds(state) {
  const out = [];
  if (!same(state.saved.shop, state.shop)) out.push("shop");
  if (!same(state.saved.site, state.site)) out.push("site");
  return out;
}

/**
 * 409 のときの片付け（SPEC 6章）。
 * choice "theirs"：新しい方を読み込む＝自分の分を backups に残し、current を下書きにする
 * choice "mine"  ：自分の直しで保存する＝相手の分を backups に残し、current.version で自分の分を出し直す
 */
export function resolveConflict(kind, choice, mine, current) {
  if (choice === "theirs") return { backup: { [kind]: mine }, put: null, adopt: { version: current.version, data: current.data } };
  return { backup: { [kind]: current.data }, put: { version: current.version, data: mine }, adopt: null };
}

// ---- その場の見え方（patch.js）に渡す文。キー（data-edit の値）→ 段落の並び
export function previewTexts(shop, site, ed, base = {}) {
  const out = {};
  for (const p of ed.shopPtrs) {
    if (p === "/hours") out[`shop:${p}`] = [formatHoursShort(shop.hours)];
    else if (p.startsWith("/story/")) out[`shop:${p}`] = String(getPointer(shop, p) ?? "").split("\n").filter((t) => t.trim());
  }
  for (const id of ed.texts) if (id === "fv_copy") out[`text:${id}`] = textParagraphs(site, id, base[id] ?? []);
  return out;
}
/** 入れ終わった値段だけ（入れている途中の「円」だけの文を出さない）。金額の要らない時価などはそのまま */
export function completePrices(prices) {
  const ok = (n) => Number.isInteger(n) && n >= 0;
  return (prices ?? []).filter((p) => (p.type === "fixed" || p.type === "from" ? ok(p.amount) : p.type === "range" ? ok(p.amount) && ok(p.max) : true));
}
/** 品の一覧の行の右に出す短い値段（出さない品は「値段なし」） */
export function priceSummary(prices) {
  return (prices ?? []).length ? formatPriceAll(completePrices(prices)) : "値段なし";
}
/** 品のカードに出す文（prices が空＝値段を出さない → 値段の行を消す） */
export function cardTexts(item) {
  return { name: item.name ?? "", description: item.description ?? "", prices: formatPriceAll(completePrices(item.prices)) };
}
