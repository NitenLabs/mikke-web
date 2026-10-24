// ① お店の情報から品の並び・表・お品書きを作る（中身は packages/core/catalog.js）
// 線：A4｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// §2 セクションの並び（ページの組み立て）。今は特集・品の2つ。複製・追加・削除・並べ替えはこの並びを書き換える（試験台14・第2回で操作を足す）。
const defaultSecList = () => [{ id: "feature", type: "feature" }, { id: "items", type: "items" }];
// ===================== 試験台26：① お店の情報（catalog）から品の並び・表を作る =====================
// 品の並び（I_cards）・表（I_table）の中身は、① の下書き（shop.json の catalog まるごと）＋ 並びの設定（② の content[並びID]）から
// 表示のたびに作る（_pg.rows はやめた）。① の下書きの土台は state.shopBase（無ければテンプレ SHOP_JSON）。
const shopTpl = () => JSON.parse(JSON.stringify(SHOP_JSON));
const shopBase = () => (state && state.shopBase ? state.shopBase : SHOP_JSON);
// 品の並び・表・お品書きを ① から作る関数・値段の文字・① の op の畳み方は packages/core/catalog.js（ブラウザでもサーバーでも使う）。
const { CARD_ALIAS, TABLE_ALIAS, REV_CARD, REV_TABLE, cardPartId, tablePartId, itemOfCardPart, itemOfTablePart, fmtAmt, fmtPriceOpt, formatPrices, curMonth, isDisplayable, priceOf, MENU_ORDER, fmtServing, hiddenReason, deriveMenuGroups, deriveGroup, applyShopOps, isShopOp } = CATALOG;
// 並びの設定：テンプレの既定（I_cards＝店頭販売のおすすめ3件／I_table＝甘味処の全品）
function templateSource(gid) { const b = bareOf(gid); if (b === "I_cards") return { menu: "mnu_tento", label: "lbl_recommended", count: 3 }; if (b === "I_table") return { menu: "mnu_kanmi" }; return null; }
const isGroupId = (id) => { const b = bareOf(id); return b === "I_cards" || b === "I_table"; };
// 新しい ID を作る（2.2：英小文字・数字、使い回さない。① の下書きの中の ID の最大から続ける）
const mintShopId = (prefix) => prefix + "_x" + String(++state.shopSeq).padStart(4, "0");
function recomputeShopSeq(shop) {
  let mx = 0; const take = (id) => { const m = /_x(\d+)$/.exec(id || ""); if (m) mx = Math.max(mx, +m[1]); };
  const cat = (shop && shop.catalog) || {};
  for (const id in (cat.items || {})) { take(id); for (const pr of (cat.items[id].prices || [])) take(pr.id); }
  for (const id in (cat.placements || {})) { take(id); for (const pr of (cat.placements[id].prices || [])) take(pr.id); }
  for (const id in (cat.categories || {})) take(id);   // 試験台28 §2.4：足した括り（cat_x…）も使い回さない
  for (const id in (cat.labels || {})) take(id);        // 試験台28 §2.5：足したラベル（lbl_x…）も使い回さない
  state.shopSeq = Math.max(state.shopSeq || 0, mx);
}

