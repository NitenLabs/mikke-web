// 品の並びの列・幅、左右の入れ替え
// 線：A4｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// §20 列（品の並び）
const COL_DEFAULT = (device) => device === "pc" ? 3 : 1;
const COL_CHOICES = (device) => device === "pc" ? [2, 3, 4] : [1, 2];
const isCardsGroup = (id) => canonId(id) === "I_cards" || /__I_cards$/.test(canonId(id)) === false && bareOf(id) === "I_cards";
function colsOf(id, device) { device = device || state.device; const c = canonId(id); const m = reduce(activeOps()).colsMap[c]; return (m && m[device] != null) ? m[device] : COL_DEFAULT(device); }
function setCols(id, n) { const c = canonId(id); if (colsOf(c) === n) return; commit({ t: "cols", device: state.device, id: c, n }); }
function colWidthFor(id, n) { const e = geometry()[canonId(id)]; const cardsW = e ? e.w : (state.device === "pc" ? 1326 : 351); return (cardsW - 24 * (n - 1)) / n; }   // 1件の幅＝（並びの幅−24×(n−1)）÷n
function colEnabled(id, n) { return colWidthFor(id, n) >= 120; }   // §2.2.8 1件の幅120未満は押せない
// 見本に乗せている間の仮表示（記録しない）：render がこの上書きを優先する
function setColsPreview(id, n) { state.colsPreview = { id: canonId(id), device: state.device, n }; render(); }
function clearColsPreview() { if (!state.colsPreview) return; state.colsPreview = null; render(); }
// §8 入口：品の並び・表の、設計pxでの 列/幅/x（省けば今の端末）
function listLayout(device) {
  device = device || state.device;
  const grab = () => { const g = geometry(); const R = reduce(activeOps(), device); const out = {};
    if (g["I_cards"]) out.I_cards = { cols: colsOf("I_cards", device), w: +g["I_cards"].w.toFixed(2), x: +g["I_cards"].x.toFixed(2) };
    // §20b §2.4 表の幅は「記録の幅」を返す（描画時クランプで画面上は広がりうるが、記録は変わらない）
    if (g["I_table"]) { const rec = (R.sizes && R.sizes["I_table"] && R.sizes["I_table"].w != null) ? R.sizes["I_table"].w : g["I_table"].w; out.I_table = { w: +rec.toFixed(2), x: +g["I_table"].x.toFixed(2) }; }
    return out; };
  if (device === state.device) return grab();
  const here = state.device; state.device = device; render(); const out = grab(); state.device = here; render(); return out;
}
function colsApi() { return { choices: COL_CHOICES(state.device), current: colsOf("I_cards"), enabled: COL_CHOICES(state.device).map((n) => ({ n, enabled: colEnabled("I_cards", n), w: +colWidthFor("I_cards", n).toFixed(2) })) }; }
// §5 左右を入れ替える（横並びの組＝PC の特集の2つの組の子のとき）
function blockOfPart(id) { const m = bareOf(canonId(id)).match(/^F_[phb](\d)$/); return m ? +m[1] : null; }
function canSwap(id) { if (state.device !== "pc") return false; const c = canonId(id); if (blockOfPart(c) == null) return false; const inst = reduce(activeOps()).secList.find((s) => s.id === secOf(c)); return !!(inst && inst.type === "feature"); }
function swapHoriz(id) { const c = canonId(id); const block = blockOfPart(c); if (block == null) return; const sec = secOf(c); const pfx = isAnchorSec(sec) ? "" : sec + SEP; const clearM1 = ["F_p", "F_h", "F_b"].map((p) => pfx + p + block); commit({ t: "swap", device: state.device, sec, block, clearM1 }); }
// 文字の見た目を元に戻す：箱まるごと（鍵）＋文の一部（この部品の runs）の両方（§2.2）
