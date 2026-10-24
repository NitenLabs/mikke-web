// 入力の種類・試験の窓口（draft・roundTrip）・PG.api（window.__playground）
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// §2（試験台15）：スマホでの編集かどうか。画面幅 600 以下で、指で触る端末（pointer:coarse か maxTouchPoints>0）なら 'phone'。
function inputMode() {
  try {
    const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    const touch = (navigator.maxTouchPoints || 0) > 0;
    return (window.innerWidth <= 600 && (coarse || touch)) ? "phone" : "pc";
  } catch (e) { return "pc"; }
}

// ===================== §24（試験台24）試験の窓口：draft()・roundTrip()・最近使った色 =====================
function draftApi() { return currentDraft(); }   // §2.8 今の形（fold した 4.9＋_pg）
function recentColorsApi() { return state.recentColors.slice(); }
function pushRecentColor(hex) { hex = String(hex).toUpperCase(); state.recentColors = [hex, ...state.recentColors.filter((c) => c !== hex)].slice(0, 5); scheduleSave(); }   // §2.6 色を選んだら「編集の設定」として保存。下書き・版・状態の文字には効かない
// §2.8 roundTrip：画面を変えずに、PC・スマホそれぞれで「土台＋記録の列から描いた形」と「seed(fold(...)) だけから描いた形」を比べる。
function snapForRT(b, ops, dev, sb) {
  state.base = b; state.shopBase = (sb !== undefined ? sb : state.shopBase); state.ops = clone(ops); state.cursor = ops.length; state.device = dev; state.selected = new Set(); state.editing = null; state.viewing = null; state.peek = false;   // 試験台26：① の土台も当てる（② だけでなく ①②の組で round-trip）
  render();
  const g = geometry(); const R = reduce(activeOps(), dev);
  const parts = {}; for (const id in g) { const e = g[id]; parts[id] = { x: +(+e.x).toFixed(2), y: +(+e.y).toFixed(2), w: +(+e.w).toFixed(2), h: +(+e.h).toFixed(2) }; }
  const attr = {};
  const asset = {};
  const scanSlice = (sec, slice) => { const P = (bare) => (sec === "feature" || sec === "items") ? bare : sec + SEP + bare;
    if (slice && slice.blocks) slice.blocks.forEach((bl, i) => { if (bl.photo) asset[P("F_p" + i)] = bl.photo.asset || null; });
    if (slice && slice.cards) slice.cards.forEach((cd) => { if (cd.photo) asset[P("card_photo_" + cd.id)] = cd.photo.asset || null; }); };
  for (const sec in R.secContent) scanSlice(sec, R.secContent[sec]);
  for (const a of R.added) if (a.kind === "photo") asset[a.id] = a.asset || null;
  const runsOf = (id) => R.runsMap[id] ? R.runsMap[id].map((r) => ({ text: r.text, bold: !!r.bold, color: r.color || null, scale: r.scale || 1, font: r.font || null, link: r.link || null })) : null;
  const ids = new Set([...Object.keys(g), ...Object.keys(R.runsMap), ...Object.keys(asset), ...Object.keys(R.brightMap), ...R.clear, ...Object.keys(R.linkMap), ...Object.keys(R.colsMap)]);
  for (const id of ids) attr[id] = { runs: runsOf(id), asset: (id in asset) ? asset[id] : null, view: R.viewAll[id] ? (R.viewAll[id][dev] || null) : null, bright: R.brightMap[id] || 0, link: R.linkMap[id] || null, cols: R.colsMap[id] ? (R.colsMap[id][dev] || null) : null, cleared: R.clear.includes(id) };
  const swap = {}; for (const sec in R.swapMap) swap[sec] = (R.swapMap[sec][dev] || null);
  return { parts, attr, swap };
}
function diffSnap(A, B) {
  const ids = new Set([...Object.keys(A.parts), ...Object.keys(B.parts)]);
  let maxPos = 0, maxSize = 0, worst = null; const onlyA = [], onlyB = [];
  for (const id of ids) { const a = A.parts[id], b = B.parts[id]; if (!a) { onlyB.push(id); continue; } if (!b) { onlyA.push(id); continue; }
    const dp = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)), ds = Math.max(Math.abs(a.w - b.w), Math.abs(a.h - b.h));
    if (dp > maxPos) { maxPos = dp; worst = id; } if (ds > maxSize) maxSize = ds; }
  const aids = new Set([...Object.keys(A.attr), ...Object.keys(B.attr)]); const attrDiff = [];
  for (const id of aids) { const x = A.attr[id] || {}, y = B.attr[id] || {}; const d = [];
    if (JSON.stringify(x.runs || null) !== JSON.stringify(y.runs || null)) d.push("runs");
    if ((x.asset || null) !== (y.asset || null)) d.push("asset");
    if (JSON.stringify(x.view || null) !== JSON.stringify(y.view || null)) d.push("view");
    if ((x.bright || 0) !== (y.bright || 0)) d.push("bright");
    if (JSON.stringify(x.link || null) !== JSON.stringify(y.link || null)) d.push("link");
    if ((x.cols || null) !== (y.cols || null)) d.push("cols");
    if ((x.cleared || false) !== (y.cleared || false)) d.push("cleared");
    if (d.length) attrDiff.push({ id, fields: d }); }
  const swaps = new Set([...Object.keys(A.swap), ...Object.keys(B.swap)]); const swapDiff = [];
  for (const s of swaps) if (JSON.stringify(A.swap[s] || null) !== JSON.stringify(B.swap[s] || null)) swapDiff.push(s);
  return { maxPos: +maxPos.toFixed(2), maxSize: +maxSize.toFixed(2), worst, onlyA, onlyB, attrDiff, swapDiff };
}
function roundTrip() {
  const save = { base: state.base, shopBase: state.shopBase, ops: state.ops, cursor: state.cursor, undoBase: state.undoBase, device: state.device, selected: state.selected, editing: state.editing, viewing: state.viewing, peek: state.peek, secSeq: state.secSeq, addSeq: state.addSeq };
  const curBase = state.base, curOps = clone(activeOps()), curShopBase = state.shopBase, fd = foldToDraft(), fdShop = currentShop();   // 試験台26：① も畳む
  const out = {};
  for (const dev of ["pc", "sp"]) { const A = snapForRT(curBase, curOps, dev, curShopBase); const B = snapForRT(fd, [], dev, fdShop); out[dev] = diffSnap(A, B); }
  state.base = save.base; state.shopBase = save.shopBase; state.ops = save.ops; state.cursor = save.cursor; state.undoBase = save.undoBase; state.device = save.device; state.selected = save.selected; state.editing = save.editing; state.viewing = save.viewing; state.peek = save.peek; state.secSeq = save.secSeq; state.addSeq = save.addSeq;
  render();
  return out;
}

const api = {
  reset, setDevice, geometry, sections, warnings, anchors: anchorsList, inputMode,
  getScale: () => scale, scaleMode: () => SCALE_MODE, relayout,   // §25 試験の窓口（倍率・縮め方・描き直し）
  ops: () => clone(activeOps()), presets, runPreset,
  draft: draftApi, shop: currentShop, roundTrip, recentColors: recentColorsApi, pushRecentColor,   // §24・試験台26 試験の窓口（① の下書き）
  // §24 試験から操作を直に流す窓口（いずれも既存の関数。編集の動きは変えない）
  selectOnly: (id) => selectOnly(canonId(id)), selectMany: (ids) => selectMany(ids), clearSel, selectSection,
  nudge: (id, dx, dy) => nudge(id, dx, dy), nudgeSelected, deleteSelected, duplicate, commitEdit, canUndo: () => (!!state.restoreUndo || state.cursor > state.undoBase), canRedo: () => (!state.restoreUndo && state.cursor < state.ops.length),
  addTextAtPoint: (sec, cx, cy) => addTextAtPoint(sec, cx, cy), addPhotoAtPoint, setBrightness,
  sectionMove, sectionDelete, sectionAdd, sectionDuplicate, sectionList: sectionListApi,
  setPage: (id) => setPage(id), currentPage: () => currentPage(), pages: () => PAGES.map((p) => ({ ...p })),   // 試験台28：ページの移動（Claude.ai の確認用）
  setCols: (id, n) => setCols(id, n), swapHoriz: (id) => swapHoriz(id), bringToFront, sendToBack, secOf: (id) => secOf(id),
  select: (ids) => selectMany(Array.isArray(ids) ? ids : [ids]),
  edit: editApi, resetScope, undo, redo, layoutCount: () => layoutCount,
  setPrices: (id, prices) => setPrices(id, prices), effPrices: (id) => effPricesOf(id),   // 試験台26 値段の箱
  partInfo: (id) => { const i = partInfo(id); return i ? { kind: i.kind, cid: i.cid, gid: i.gid, itemId: i.entry && i.entry._itemId, placementId: i.entry && i.entry._placementId } : null; },
  // 試験台26：① 連動の操作（表・品の並び）／並びの設定／品を選ぶ一覧／案A・C の別
  tableAddRow: (id) => tableAddRow(id), tableDuplicate: (id) => tableDuplicate(id), tableDelete: (id) => tableDelete(id),
  cardsAddExisting: (gid, itemId) => cardsAddExisting(gid, itemId), cardsAddNew: (gid, categoryId) => cardsAddNew(gid, categoryId),
  cardsDuplicate: (id) => cardsDuplicate(id), cardsDelete: (id) => cardsDelete(id),
  itemPicker: (gid) => itemPickerData(gid), listMode: () => LIST_MODE, curSpec: (gid) => clone(curSpec(gid)),
  // 試験台28 §2.4：品の並べ替え（本体＝① の載せ方／おすすめ＝pick）・括りの足す/消す
  menuView: () => menuView(), menuRowPlc: (id) => menuRowPlc(id), menuCatId: (id) => menuCatId(id),
  menuMoveRow: (plcId, destCatId, beforePlcId) => menuMoveRow(plcId, destCatId, beforePlcId),
  cardsMove: (gid, itemId, beforeItemId) => cardsMove(gid, itemId, beforeItemId),
  categoryAdd: (afterCatId) => categoryAdd(afterCatId), categoryDelete: (catId) => categoryDelete(catId), categoryCanDelete: (catId) => categoryCanDelete(catId),
  // 試験台28 §2.5：品を選んだときの道具（販売・出す月・ラベル・メニュー）
  itemCtx: (id) => itemCtx(id), setItemStatus: (id, s) => setItemStatus(id, s), setItemMonths: (id, m) => setItemMonths(id, m),
  setItemLabels: (id, l) => setItemLabels(id, l), addItemLabel: (id, n) => addItemLabel(id, n), setItemMenu: (id, m, on) => setItemMenu(id, m, on), canRemoveMenu: (id, m) => canRemoveMenu(id, m),
  catalogView: () => catalogView(),   // 試験台26 お品書きを見る（① の下書きの差分つき）
  selected: () => [...state.selected],   // 試験台26 試験の窓口（選んでいる部品）
  align: (k) => align(k), canAlign: () => canAlign(),   // §27 配置（揃え・整列）
  beginDrag: (x, y) => beginDrag(x, y), dragMove: (x, y, alt) => dragMove(x, y, alt), endDrag: () => endDrag(),   // §27 等間隔の試験用（client 座標でドラッグ）
  guides: () => guidesList(),
  applyOps, peek: (on) => (on ? peekOn() : peekOff()), zOrder: zOrderList,
  sizes: sizesList, guides: guidesList,
  photos: photosApi, cropState,       // §3 入口（見せる範囲の途中も読める）
  textStyles: textStylesApi,          // §12 入口（今の端末の文字の見た目）
  textSetSize, textStep, textToggleBold, textSetColor, resetTextStyle,  // §12 文字の見た目を変える
  textRuns: textRunsApi,              // §13 入口（文の一部の見た目＝切れ目の並び）
  sectionList: sectionListApi,        // §2 入口（今の並び順のセクション）
  // §19 書体・リンク
  fonts: fontsApi, textSetFont, curFont: (id) => curFontOf(canonId(id)),
  listLayout, setCols, cols: colsApi, colsOf: (id, d) => colsOf(id, d),   // §20 列・幅
  programResize, handlesFor: (id) => handlesFor(canonId(id)), dropTarget,
  links: linksApi, elementLink: elementLinkApi, setElementLink, removeElementLink,
  applyPartStyle, parseExternalLink, parseAutoLink, resolveHref, linkLabel,
  editingHasSelection, editingSelRange, editingSelFont, setPartLinkCommitted,
  editingRangeRect: (s, e) => state.editing ? rangeRectOf(elNode(state.editing.id), s, e) : null,
  captureEditingCopy, editingPasteRich,
  editSelect: (s, e) => { if (!state.editing) return false; const n = elNode(state.editing.id); if (!n) return false; n.focus(); setCaretOffsets(n, s, e); if (typeof onRender === "function") onRender(); return true; },
  startEdit: (id) => startEdit(canonId(id)),
  editingId: () => state.editing && state.editing.id,
  setFixedSections,   // §22 §7 仮の一番上・一番下セクション
  boot, saveState, simulateSaveError, publish, versions,   // §22 §2 保存・§4.3 公開の記録
  hasPendingSave, flushPendingSave, setExternalConflictHandler,   // J25/J26/J28 保存待ち・閉じる直前の書き出し・別タブ衝突
  publishCheck, longTextLimits,   // §22 §4.2 公開前チェック・長い文の目安
  previewMode, publishedGeometry,   // §22 §5 プレビュー
  buildPublishBundle,   // 線 C 公開の一式（pg/publish-bundle.js）
  viewVersion, exitView, restoreVersion, viewingVersion,   // §22 §6 履歴から前の版に戻す
};
return {
  state, render, reset, setDevice, undo, redo, commit, api, reduce, activeOps,
  boot, saveState, simulateSaveError, publish, versions, setFixedSections,   // §22 §2 保存・§4.3 公開・§7（WIRING から使う）
  hasPendingSave, flushPendingSave, setExternalConflictHandler,   // J25/J26/J28 保存待ち・閉じる直前の書き出し・別タブ衝突（WIRING から使う）
  publishCheck, longTextLimits,   // §22 §4.2（WIRING の確認の箱から使う）
  enterPreview, exitPreview, previewMode, publishedGeometry,   // §22 §5 プレビュー（WIRING から使う）
  buildPublishBundle,   // 線 C 公開の一式（pg/publish-bundle.js）
  imeBoundary,   // §23b 変換の境目（WIRING の document 監視から呼ぶ）
  viewVersion, exitView, restoreVersion, viewingVersion,   // §22 §6 履歴（WIRING から使う）
  draft: draftApi, roundTrip, recentColors: recentColorsApi, pushRecentColor,   // §24 試験の窓口・最近使った色（WIRING から使う）
  canUndo: () => !!state.restoreUndo || state.cursor > state.undoBase, canRedo: () => !state.restoreUndo && state.cursor < state.ops.length,
  canonId, isDraggable, isText, REPEAT, groupOf, secOf, elNode, getScale: () => scale, scaleMode: () => SCALE_MODE, isHeadingGroup, inputMode, relayout,
  sectionMove, sectionDelete, sectionAdd, sectionDuplicate, sectionCan,   // §2 セクションの操作
  setPage, currentPage, pages: () => PAGES.map((p) => ({ ...p })), pageOfSec,   // 試験台28：ページの移動
  secMapNow: () => clone(reduce(activeOps()).secMap),
  beginDrag, dragMove, endDrag, cancelDrag, isDragging: () => !!drag, selectOnly, toggleSel, selectMany, clearSel, selectSection, selectInDesignRect, smallHit,
  startEdit, commitEdit, nudge, nudgeSelected, deleteSelected, delPart: (id) => withDropNotice(() => commit({ t: "del", id: canonId(id) })), copySelection, cutSelection, paste, duplicate,
  // 試験台26：① 連動の操作・値段の箱・品を選ぶ一覧・お品書きを見る（WIRING から使う）
  partInfo, effPricesOf, setPrices, tableAddRow, tableDuplicate, tableDelete,
  cardsAddExisting, cardsAddNew, cardsDuplicate, cardsDelete, itemPickerData, catalogView, curSpec, isRepeat, LIST_MODE,
  menuView, menuRowPlc, menuCatId, menuMoveRow, cardsMove, categoryAdd, categoryDelete, categoryCanDelete,   // 試験台28 §2.4：品の並べ替え・括りの足す/消す（WIRING から使う）
  itemCtx, itemIdOfSel, setItemStatus, setItemMonths, setItemLabels, addItemLabel, setItemMenu, canRemoveMenu, menuRowDelete,   // 試験台28 §2.5/§2.7：品を選んだときの道具・行を消す（WIRING から使う）
  resetScope, peekOn, peekOff, addTextAt, anchorsList, classify: (id) => M.classifyDrop(geometry(), id, [id]),
  bringToFront, sendToBack, bringForward, sendBackward, hasOverlapPartner, zOrderList,
  beginResize, resizeMove, endResize, isResizing: () => !!rz, programResize, handlesFor,
  align, canAlign,   // §27 配置（揃え・整列）
  paintPhotos, photosApi, replacePhotoFile, loadImageFile, assetUrl, assetNat,
  setBrightness, brightnessOf, addPhotoAtPoint, addTextAtPoint,   // §3/§4/§5（試験台17）
  beginCrop, cropState, cropPanStart, cropPanBy, cropCornerStart, cropCornerBy, cropZoomTo, cropWheel, cropCommit, cropCancel, isCropping, partChangedFromTemplate,
  quadFile, textFile,
  textSetSize, textStep, textToggleBold, textSetColor, resetTextStyle, textStylesApi, hasTextStyle,
  tsKeyOf, styleNameOf, primaryTextSel, SIZE_LIST,
  applyPartStyle, editingHasSelection, editingPartSizePx, boxSizePx, hasRuns, textRunsApi,   // §13
  // §19 書体・リンク（WIRING から使う）
  textSetFont, curFontOf, fontsApi, fontLabel, FONTS,
  linksApi, elementLinkOf, elementLinkApi, setElementLink, removeElementLink, canElementLink, setPartLinkCommitted,
  resolveHref, linkLabel, linkOpensNewTab, parseExternalLink, parseAutoLink,
  setCols, colsOf, colsApi, colEnabled, setColsPreview, clearColsPreview, listLayout, COL_CHOICES, COL_DEFAULT, colWidthFor, canSwap, swapHoriz, dropTarget,
  storeHas, storeValueText, STORE_KINDS, PAGES, SECTION_LABELS, friendlySec, selTextKeys, liveSel, caretOffsets, setCaretOffsets,
  applyPartStyleRange, autoLinkBeforeCaret, editingPasteLink, editingUndoAutoLink, editingHasAutoUndo, editingSelRange, editingSelFont,
  editingRangeRect: (s, e) => state.editing ? rangeRectOf(elNode(state.editing.id), s, e) : null,
  captureEditingCopy, editingPasteRich,
};
