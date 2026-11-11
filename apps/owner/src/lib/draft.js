// 下書き（① shop と ② site＝{draft, theme}）と、画面の項目のつなぎ（SPEC 3章・6章）。純粋。
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

// ---- 表紙の言葉（② の文字の箱 fv_copy。gen で戻らないよう genConfig.fvCopy も）
export function textParagraphs(site, elId) {
  const el = site?.draft?.elements?.[elId];
  return (el?.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text ?? "").join(""));
}
export function setTextParagraphs(site, elId, lines) {
  const s = clone(site);
  const el = s.draft?.elements?.[elId];
  if (!el) return s;
  const ls = lines.map((t) => String(t).trim()).filter(Boolean);
  const keep = el.paragraphs?.[0]?.runs?.[0] ?? {};
  const { text: _t, bind: _b, ...runStyle } = keep;
  el.paragraphs = ls.map((t) => ({ runs: [{ ...runStyle, text: t }] }));
  if (elId === "fv_copy" && s.draft.genConfig) s.draft.genConfig.fvCopy = ls;
  return s;
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
export function setElementPhoto(site, elId, assetId) {
  const s = clone(site);
  const el = s.draft?.elements?.[elId];
  if (el) { el.asset = assetId; el.crop = { fx: 50, fy: 50, zoom: 1 }; }
  return s;
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
  return site?.draft?.elements?.[slot.elId]?.asset ?? slot.assetId;
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
 * ① は shop:<ptr> の下・/catalog/items/<id>/<印のある項目>・品の出し入れ（list の印があるとき）だけ。② は text:<id> の箱・photo の要素・genConfig.fvCopy だけ
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
    const m = /^\/draft\/elements\/([^/]+)/.exec(p);
    if (m && elOk.has(m[1])) continue;
    if (p === "/draft/genConfig/fvCopy" && ed.texts.has("fv_copy")) continue;
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
export function previewTexts(shop, site, ed) {
  const out = {};
  for (const p of ed.shopPtrs) {
    if (p === "/hours") out[`shop:${p}`] = [formatHoursShort(shop.hours)];
    else if (p.startsWith("/story/")) out[`shop:${p}`] = String(getPointer(shop, p) ?? "").split("\n").filter((t) => t.trim());
  }
  for (const id of ed.texts) if (id === "fv_copy") out[`text:${id}`] = textParagraphs(site, id);
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
