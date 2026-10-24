// ① お店の情報（shop.json の catalog）から、品の並び・表・お品書きの中身を作る。値段の文字。① の op の畳み方。
// ブラウザ（編集画面）でもサーバー（公開・毎日の描き直し）でも使う。DOM は使わない。
// 元は experiments/layout/playground30/app.js の PG の中（試験台26・28）。中身は1文字も変えていない。
const clone = (o) => JSON.parse(JSON.stringify(o));
// 1件 ID ↔ 品 ID（テンプレの既存部品は別名、それ以外は c_/t_＋品ID）
const CARD_ALIAS = { itm_jonama: "c_jonama", itm_warabi: "c_warabi", itm_dorayaki: "c_dora" };
const TABLE_ALIAS = { itm_warabi: "t_warabi", itm_matcha: "t_matcha" };
const REV_CARD = {}, REV_TABLE = {};
for (const k in CARD_ALIAS) REV_CARD[CARD_ALIAS[k]] = k;
for (const k in TABLE_ALIAS) REV_TABLE[TABLE_ALIAS[k]] = k;
const cardPartId = (itemId) => CARD_ALIAS[itemId] || ("c_" + itemId);
const tablePartId = (itemId) => TABLE_ALIAS[itemId] || ("t_" + itemId);
const itemOfCardPart = (pid) => REV_CARD[pid] || (pid.indexOf("c_") === 0 ? pid.slice(2) : null);
const itemOfTablePart = (pid) => REV_TABLE[pid] || (pid.indexOf("t_") === 0 ? pid.slice(2) : null);
// 価格の文字（3.3・3.4：載せ方の価格があればそれ、なければ品の価格）
const fmtAmt = (n) => Number(n).toLocaleString("en-US");
function fmtPriceOpt(p) { const nm = p.name ? p.name + " " : ""; if (p.type === "market") return nm + "時価"; if (p.type === "ask") return nm + "応相談"; if (p.type === "free") return nm + "無料"; if (p.type === "range") return nm + fmtAmt(p.amount) + "円〜" + fmtAmt(p.amount2) + "円"; if (p.type === "from") return nm + fmtAmt(p.amount) + "円〜"; return nm + fmtAmt(p.amount) + "円"; }
function formatPrices(prices) { if (!prices || !prices.length) return ""; const money = prices.some((p) => ["fixed", "from", "range"].includes(p.type)); return prices.map(fmtPriceOpt).join("／") + (money ? "（税込）" : ""); }
// 表示するか（3.4）：販売中・今月が販売時期に入る（載せ方があることは呼び出し側で保証）
const curMonth = () => new Date().getMonth() + 1;
function isDisplayable(item) { if (!item) return false; if (item.status && item.status !== "onSale") return false; if (item.season && item.season.months && item.season.months.length && !item.season.months.includes(curMonth())) return false; return true; }
function priceOf(shop, itemId, placementId) { const cat = (shop && shop.catalog) || {}; const plc = (placementId && cat.placements) ? cat.placements[placementId] : null; const item = cat.items ? cat.items[itemId] : null; return (plc && plc.prices) ? plc.prices : (item ? item.prices : null); }
// ===================== 試験台28 §2.4：お品書き本体（MENU）を ① から組む =====================
// メニューごと（店頭販売・甘味処）→ 括り（カテゴリ）順 → 品（placement 順）。行は placement 主キー（同じ品が両メニューでも衝突しない）。
// 出ていない品（販売休止・時期外）は hidden（2a は描かない。2b で編集時だけ薄く出す）。名前・説明・価格は ① の品／載せ方から。
const MENU_ORDER = ["mnu_tento", "mnu_kanmi"];
function fmtServing(st) { if (!st || !st.periods || !st.periods.length) return ""; const f = (t) => { const a = String(t).split(":"); let h = +a[0]; let p = ""; if (h >= 24) { p = "翌"; h -= 24; } return p + h + ":" + a[1]; }; let s = st.periods.map((p) => f(p.start) + "〜" + f(p.end)).join("・"); const lo = st.periods.find((p) => p.lastOrder); if (lo) s += "（L.O. " + f(lo.lastOrder) + "）"; return "提供時間 " + s; }
// 出ていない品の理由（編集時だけ薄く添える・§2.4）。販売休止＝「休んでいます」／時期外＝「12〜2月だけ出ます」「3月・5月だけ出ます」。
// F46 出す月の文字：続く月は「12〜2月」（年をまたいでもよい）、飛ぶ月は「3月・5月」、1つなら「11月」。12か月全部は「いつでも」
function fmtMonths(months) {
  const set = new Set((months || []).map(Number).filter((m) => m >= 1 && m <= 12)); if (!set.size) return ""; if (set.size === 12) return "いつでも";
  let start = 1; while (!set.has(start) || set.has(start === 1 ? 12 : start - 1)) start = start % 12 + 1;   // 前の月が無い月から数える（年をまたぐ続きを1つにする）
  const runs = []; let m = start, seen = 0;
  while (seen < 12) { if (set.has(m)) { const a = m; let b = m; while (set.has(b % 12 + 1) && b % 12 + 1 !== a && seen < 12) { b = b % 12 + 1; seen++; } runs.push(a === b ? a + "月" : a + "〜" + b + "月"); m = b; } m = m % 12 + 1; seen++; }
  return runs.join("・");
}
function hiddenReason(it) { if (it.status && it.status !== "onSale") return "休んでいます"; if (it.season && it.season.months && it.season.months.length) return fmtMonths(it.season.months) + "だけ出ます"; return ""; }
function deriveMenuGroups(shop) {
  const cat = (shop && shop.catalog) || {}; const menus = cat.menus || {}, cats = cat.categories || {}, items = cat.items || {}, placements = cat.placements || {};
  return MENU_ORDER.filter((id) => menus[id]).map((menuId) => {
    const mn = menus[menuId]; const g = { id: menuId, _menuId: menuId, name: mn.name || "" };
    if (menuId === "mnu_kanmi" && mn.servingTime) g.time = fmtServing(mn.servingTime);
    const catIds = Object.keys(cats).filter((c) => cats[c].menuId === menuId).sort((a, b) => (cats[a].order || 0) - (cats[b].order || 0));
    g.cats = catIds.map((cid) => {
      const plIds = Object.keys(placements).filter((k) => placements[k].menuId === menuId && placements[k].categoryId === cid).sort((a, b) => (placements[a].order || 0) - (placements[b].order || 0));
      return { id: cid, _catId: cid, name: cats[cid].name || "", rows: plIds.map((pid) => { const p = placements[pid], it = items[p.itemId] || {}; const hidden = !isDisplayable(it); return { id: pid, _itemId: p.itemId, _placementId: pid, name: it.name || "", desc: it.description || "", price: formatPrices(priceOf(shop, p.itemId, pid)), hidden, reason: hidden ? hiddenReason(it) : "" }; }) };
    });
    return g;
  });
}
// 並びの設定を基に、① から品の並び・表の中身を作る。kind="cards"|"table"
function deriveGroup(shop, spec, kind) {
  const cat = (shop && shop.catalog) || {}; const items = cat.items || {}, placements = cat.placements || {}, categories = cat.categories || {};
  const menuId = spec.menu; let entries = [];
  if (spec.pick) { for (const itemId of spec.pick) { const pid = Object.keys(placements).find((k) => placements[k].itemId === itemId && placements[k].menuId === menuId); entries.push({ itemId, placementId: pid }); } }
  else {
    let ks = Object.keys(placements).filter((k) => placements[k].menuId === menuId);
    if (spec.category) ks = ks.filter((k) => placements[k].categoryId === spec.category);
    const co = (cid) => (categories[cid] && categories[cid].order) || 0;
    ks.sort((a, b) => { const pa = placements[a], pb = placements[b]; const d = co(pa.categoryId) - co(pb.categoryId); return d !== 0 ? d : (pa.order || 0) - (pb.order || 0); });
    for (const k of ks) { const p = placements[k]; const it = items[p.itemId]; if (spec.label && !(((it && it.labels) || []).includes(spec.label))) continue; entries.push({ itemId: p.itemId, placementId: k }); }
  }
  entries = entries.filter((e) => isDisplayable(items[e.itemId]));
  if (spec.count != null) entries = entries.slice(0, spec.count);
  return entries.map((e) => { const it = items[e.itemId] || {}; const prices = priceOf(shop, e.itemId, e.placementId); const o = { id: kind === "cards" ? cardPartId(e.itemId) : tablePartId(e.itemId), _itemId: e.itemId, _placementId: e.placementId, _menu: menuId, name: it.name || "", desc: it.description || "", price: formatPrices(prices) }; if (kind === "cards") o.photo = { asset: (it.photos && it.photos[0]) || "" }; return o; });
}
// ① の下書きに catalog 系の op を畳む（clone 済みの shop を直接書き換える）
function applyShopOps(shop, ops) {
  const cat = shop.catalog = shop.catalog || { items: {}, placements: {}, menus: {}, categories: {}, labels: {} };
  for (const op of ops) {
    if (op.t === "shopField") { const it = cat.items[op.itemId]; if (it) it[op.field] = op.value; }
    else if (op.t === "shopPrice") { if (op.target.kind === "placement") { const p = cat.placements[op.target.id]; if (p) p.prices = clone(op.prices); } else { const it = cat.items[op.target.id]; if (it) it.prices = clone(op.prices); } }
    else if (op.t === "shopAdd") { const it = clone(op.item); const iid = it.id; delete it.id; cat.items[iid] = it; if (op.placement) { const pl = clone(op.placement); const pid = pl.id; delete pl.id; cat.placements[pid] = pl; } }   // 品・載せ方は ID をキーにし、中には id を持たない（schema どおり）
    else if (op.t === "shopDel") { if (op.placementId) delete cat.placements[op.placementId]; if (op.alsoItem && op.itemId) delete cat.items[op.itemId]; }
    else if (op.t === "shopLabels") { const it = cat.items[op.itemId]; if (it) it.labels = clone(op.labels); }
    // 試験台28 §2.4：品の並べ替え＝載せ方の括り・順番を書き換える（別の括り・別メニューへも）
    else if (op.t === "shopReorder") { const p = cat.placements[op.placementId]; if (p) { if (op.menuId != null) p.menuId = op.menuId; if (op.categoryId != null) p.categoryId = op.categoryId; p.order = op.order; } }
    // 試験台28 §2.4：括りを足す・消す
    else if (op.t === "shopCatAdd") { cat.categories[op.categoryId] = { menuId: op.menuId, name: op.name, order: op.order }; }
    else if (op.t === "shopCatDel") { delete cat.categories[op.categoryId]; }
    // 試験台28 §2.5：載せるメニューを増やす（既存の品に載せ方を1つ足す）・新しいラベルを作る
    else if (op.t === "shopPlcAdd") { cat.placements[op.placementId] = { itemId: op.itemId, menuId: op.menuId, categoryId: op.categoryId, order: op.order }; }
    else if (op.t === "shopLabelDef") { cat.labels = cat.labels || {}; cat.labels[op.labelId] = { name: op.name, order: op.order }; }
  }
  return shop;
}
const isShopOp = (t) => t === "shopField" || t === "shopPrice" || t === "shopAdd" || t === "shopDel" || t === "shopLabels" || t === "shopReorder" || t === "shopCatAdd" || t === "shopCatDel" || t === "shopPlcAdd" || t === "shopLabelDef";

export { CARD_ALIAS, TABLE_ALIAS, REV_CARD, REV_TABLE, cardPartId, tablePartId, itemOfCardPart, itemOfTablePart, fmtAmt, fmtPriceOpt, formatPrices, curMonth, isDisplayable, priceOf, MENU_ORDER, fmtServing, fmtMonths, hiddenReason, deriveMenuGroups, deriveGroup, applyShopOps, isShopOp };
