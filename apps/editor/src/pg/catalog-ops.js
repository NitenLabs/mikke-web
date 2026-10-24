// ① 連動の操作（値段・表・品の並び・お品書き・品の道具・お品書きを見る）
// 線：A4｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ===================== 試験台26：① 連動の操作（品の並び・表を触ると ① が変わる） =====================
const pgToastMsg = (msg, undo) => { if (typeof pgToast === "function") pgToast(msg, undo); };
// 選んだパーツの属する並び（cards/table）・1件エントリ・並びID を返す
function partInfo(fullId) {
  const b = bareOf(fullId), sec = secOf(fullId);
  const kind = (/^card_/.test(b) || /^c_/.test(b)) ? "cards" : ((/^row_/.test(b) || /^t_/.test(b)) ? "table" : null);
  if (!kind) return null;
  const cid = cardIdOf(fullId);
  const pfx = (sec === "feature" || sec === "items") ? "" : sec + SEP;
  const R = reduce(activeOps(), "pc"); const c = R.secContent[sec]; let arr = (c && (kind === "cards" ? c.cards : c.table)) || [];
  let entry = arr.find((x) => x.id === cid) || null;
  if (!entry && c && c.groups) { for (const g of c.groups) { for (const ct of (g.cats || [])) { const e = (ct.rows || []).find((x) => x.id === cid); if (e) { entry = e; arr = ct.rows; break; } } if (entry) break; } }   // J19 お品書き本体の行（groups 構造）の価格も値段の箱で編集できるようにする
  return { sec, kind, cid, pfx, gid: pfx + (kind === "cards" ? "I_cards" : "I_table"), entry, arr, R };
}
// 値段の持ち主（載せ方の価格があれば載せ方、なければ品）
function priceOwnerOf(info) { const cat = info.R.effShop.catalog; const plc = (info.entry && info.entry._placementId) ? cat.placements[info.entry._placementId] : null; return (plc && plc.prices) ? { kind: "placement", id: info.entry._placementId } : { kind: "item", id: info.entry && info.entry._itemId }; }
// 値段の箱が読む：今の有効な価格と持ち主・品名
function effPricesOf(fullId) { const info = partInfo(fullId); if (!info || !info.entry) return null; const cat = info.R.effShop.catalog; const own = priceOwnerOf(info); const src = own.kind === "placement" ? cat.placements[own.id] : cat.items[own.id]; return { owner: own, prices: clone((src && src.prices) || []), name: (cat.items[info.entry._itemId] || {}).name || "" }; }
// 値段を決める（その並びのメニューの載せ方の価格、なければ品の価格を書き換える。1操作1undo）
function setPrices(fullId, prices) { const info = partInfo(fullId); if (!info || !info.entry) return false; const own = priceOwnerOf(info); const withIds = (prices || []).map((p) => p.id ? clone(p) : Object.assign({ id: mintShopId("prc") }, p)); commit({ t: "catAct", shops: [{ t: "shopPrice", target: own, prices: withIds }] });
  const elsewhere = itemShownElsewhere(info.entry._itemId, fullId); pgToastMsg("『" + ((curCat().items[info.entry._itemId] || {}).name || "品") + "』の値段を直しました" + (elsewhere ? "。" + elsewhere + "にも出ています" : ""), true); return true; }
// 品がほかのどこに出ているか（知らせの文に使う：「お品書き」「TOPのおすすめの品」）。fromId の部品の場所は除く
function itemShownElsewhere(itemId, fromId) {
  if (!itemId) return ""; const R = reduce(activeOps()); const fromSec = fromId ? secOf(fromId) : null; const where = [];
  for (const inst of (R.allSecs || [])) { if (inst.id === fromSec) continue; const c = R.secContent[inst.id]; if (!c) continue;
    let hit = false; if (inst.type === "menu") { for (const g of (c.groups || [])) for (const ct of (g.cats || [])) for (const row of (ct.rows || [])) if (row._itemId === itemId) hit = true; }
    else if (inst.type === "items") hit = (c.cards || []).some((e) => e._itemId === itemId) || (c.table || []).some((e) => e._itemId === itemId);
    if (!hit) continue; const nm = inst.type === "menu" ? "お品書き" : pageLabelOf(R.secPageMap[inst.id]) + "の" + friendlySec(inst.id); if (!where.includes(nm)) where.push(nm); }
  if (fromSec && secOf(fromId) !== "menu" && !where.includes("お品書き") && curCat().placements && Object.keys(curCat().placements).some((k) => curCat().placements[k].itemId === itemId)) where.unshift("お品書き");   // トップの品は必ずお品書きの品
  return where.join("・");
}
// F45 並びから消えた部品は選択から外す（ページに無い部品を選んだままにしない）
function pruneGoneSelection() { const s = [...state.selected]; const keep = s.filter((id) => !!elNode(id)); if (keep.length !== s.length) { state.selected = new Set(keep); render(); } }
// F62 同じ名前の品がほかにもあるか（止めずに知らせる）
function sameNameItems(itemId) { const cat = curCat(); const it = cat.items[itemId]; const nm = it && (it.name || "").trim(); if (!nm) return []; return Object.keys(cat.items).filter((k) => k !== itemId && (cat.items[k].name || "").trim() === nm); }
// F6・F62 品名・説明をその場で書き換えたときの知らせ（書き換えの始め・終わりは pg/text-edit.js から呼ぶ）
let _a4EditSnap = null;
function itemOfTextPart(fullId) {
  const b = bareOf(fullId); let m;
  if (secOf(fullId) === "menu" && (m = b.match(/^row_(name|desc)_(.+)$/))) { const p = curCat().placements[m[2]]; return p ? { itemId: p.itemId, field: m[1] } : null; }
  if ((m = b.match(/^(?:card|row)_(name|desc)_/))) { const info = partInfo(fullId); return (info && info.entry) ? { itemId: info.entry._itemId, field: m[1] } : null; }
  return null;
}
function catalogEditBegin(id) { _a4EditSnap = null; try { const t = itemOfTextPart(id); if (!t) return; const it = curCat().items[t.itemId] || {}; _a4EditSnap = { id, itemId: t.itemId, field: t.field, before: (t.field === "name" ? it.name : it.description) || "" }; } catch (e) { _a4EditSnap = null; } }
function catalogEditEnd(id) {
  const snap = _a4EditSnap; _a4EditSnap = null; if (!snap || snap.id !== id) return;
  setTimeout(() => { try {
    const it = curCat().items[snap.itemId]; if (!it) return; const now = (snap.field === "name" ? it.name : it.description) || "";
    if (now === snap.before) return;
    const where = itemShownElsewhere(snap.itemId, id); const dup = snap.field === "name" ? sameNameItems(snap.itemId) : [];
    let msg = snap.field === "name" ? "品名を『" + now + "』に直しました" : "『" + (it.name || "品") + "』の説明を直しました";
    if (where) msg += "。" + where + "にも出ています";
    if (dup.length) msg += "（同じ名前の品がほかにもあります）";
    pgToastMsg(msg, false);
  } catch (e) {} }, 0);
}

// ---- catalog を読む補助 ----
const curCat = () => reduce(activeOps(), "pc").effShop.catalog;
const curSpec = (gid) => { const R = reduce(activeOps(), "pc"); return R.sourceResolved[gid] || templateSource(gid); };
const menuName = (mid) => { const m = curCat().menus[mid]; return (m && m.name) || ""; };
const placementsOfItem = (cat, itemId) => Object.keys(cat.placements).filter((k) => cat.placements[k].itemId === itemId);
// 同じメニュー・括りの中で、選んだ載せ方の「すぐ後ろ」に入る order を返す
function orderAfter(cat, menuId, categoryId, afterPlc) {
  const sib = Object.keys(cat.placements).map((k) => cat.placements[k]).filter((p) => p.menuId === menuId && p.categoryId === categoryId);
  const a = afterPlc ? (afterPlc.order || 0) : 0;
  const nexts = sib.map((p) => p.order || 0).filter((o) => o > a).sort((x, y) => x - y);
  return nexts.length ? (a + nexts[0]) / 2 : a + 1;
}
// ---- 表（全部を並べる所）：行を足す・複製・削除 → ① を直す ----
function tableAddRow(fullId) {
  const info = partInfo(fullId); if (!info) return; const cat = info.R.effShop.catalog;
  const sel = info.entry; const spec = curSpec(info.gid); const menuId = (sel && sel._menu) || spec.menu;
  const selPlc = (sel && sel._placementId) ? cat.placements[sel._placementId] : null;
  const categoryId = selPlc ? selPlc.categoryId : (Object.keys(cat.categories).find((c) => cat.categories[c].menuId === menuId));
  const itemId = mintShopId("itm"), plcId = mintShopId("plc");
  const item = { id: itemId, name: "新しい品", status: "onSale" };   // 値段は空のまま（分からない値は書かない）
  const placement = { id: plcId, itemId, menuId, categoryId, order: orderAfter(cat, menuId, categoryId, selPlc) };
  commit({ t: "catAct", shops: [{ t: "shopAdd", item, placement }] });
  return { itemId, partId: tablePartId(itemId), gid: info.gid };
}
function tableDuplicate(fullId) {
  const info = partInfo(fullId); if (!info || !info.entry) return; const cat = info.R.effShop.catalog;
  const srcItemId = info.entry._itemId, srcItem = cat.items[srcItemId]; const srcPlc = info.entry._placementId ? cat.placements[info.entry._placementId] : null;
  const menuId = (info.entry._menu) || (srcPlc && srcPlc.menuId); const categoryId = srcPlc ? srcPlc.categoryId : null;
  const itemId = mintShopId("itm"), plcId = mintShopId("plc");
  const item = clone(srcItem); item.id = itemId;
  if (item.prices) item.prices = item.prices.map((p) => Object.assign(clone(p), { id: mintShopId("prc") }));
  const placement = { id: plcId, itemId, menuId, categoryId, order: orderAfter(cat, menuId, categoryId, srcPlc) };
  if (srcPlc && srcPlc.prices) placement.prices = srcPlc.prices.map((p) => Object.assign(clone(p), { id: mintShopId("prc") }));
  commit({ t: "catAct", shops: [{ t: "shopAdd", item, placement }] });
  afterItemDuplicate(info.pfx + "row_name_" + tablePartId(itemId), item.name);
  return { itemId, partId: tablePartId(itemId) };
}
function tableDelete(fullId) {
  const info = partInfo(fullId); if (!info || !info.entry) return; const cat = info.R.effShop.catalog;
  const itemId = info.entry._itemId, plcId = info.entry._placementId, item = cat.items[itemId];
  const others = placementsOfItem(cat, itemId).filter((k) => k !== plcId);
  const alsoItem = others.length === 0; const name = (item && item.name) || "品";
  commit({ t: "catAct", shops: [{ t: "shopDel", placementId: plcId, itemId, alsoItem }] });
  // §2.7 消すと知らせ＋「戻す」5秒。ほかのメニューに残るときはどこに残るかを括弧で添える
  if (alsoItem) pgToastMsg("『" + name + "』をお品書きから消しました", true);
  else { const om = cat.placements[others[0]]; pgToastMsg("『" + name + "』を" + menuName(info.entry._menu) + "から外しました（" + menuName(om.menuId) + "には残っています）", true); }
  return { alsoItem };
}
// ---- 品の並び（絞り込んで並べる所）：案C（触った並びだけが変わる＝直接選ぶ）に決定（26b） ----
// まだ一度も触っていない並びは絞り込み（① で「おすすめ」を付けた品が自動で出る）のまま。
// 足す・複製・消すを初めてしたとき、その並びは「今出ている品を直接選んだ」並び（pick）に変わる。
const LIST_MODE = "pick";   // 26b：案A（ラベル・件数）はやめた。?list=pick の切り替えも廃止
// 初めて触ったとき、今出ている品で pick を作る
function ensurePickSpec(gid) { const spec = curSpec(gid); if (spec.pick) return clone(spec); const R = reduce(activeOps(), "pc"); const sec = gid.indexOf(SEP) >= 0 ? instTag(gid) : "items"; const c = R.secContent[sec]; const arr = (c && c.cards) || []; return { menu: spec.menu, pick: arr.map((e) => e._itemId) }; }
// 品の並びに、一覧で選んだ品を足す（pick に足す。① は変えない）
function cardsAddExisting(gid, itemId) {
  const cat = curCat(); const item = cat.items[itemId]; const name = (item && item.name) || "品";
  const spec = ensurePickSpec(gid); if (!spec.pick.includes(itemId)) spec.pick.push(itemId); commit({ t: "catAct", src: { gid, spec } });
  if (!isDisplayable(item)) pgToastMsg(name + "は今は並びに出ません（" + outReason(item) + "）");
}
// 新しい品を作って並びに足す（お品書きに新しい品＝ラベルなし、この並びの pick に足す）
function cardsAddNew(gid, categoryId) {
  const spec0 = curSpec(gid); const menuId = spec0.menu; const cat = curCat();
  const itemId = mintShopId("itm"), plcId = mintShopId("plc");
  const item = { id: itemId, name: "新しい品", status: "onSale" };   // 値段は空のまま・おすすめ等の印は付けない
  const placement = { id: plcId, itemId, menuId, categoryId, order: orderAfter(cat, menuId, categoryId, null) };
  const spec = ensurePickSpec(gid); spec.pick.push(itemId); commit({ t: "catAct", shops: [{ t: "shopAdd", item, placement }], src: { gid, spec } });
  return { itemId, partId: cardPartId(itemId) };
}
// F8 品を貼った・複製したら：新しい品を選び、お品書きに新しい品ができたことを知らせる
const _a4DupChain = {};
function afterItemDuplicate(newPart, name) {
  state.selectedSection = null; state.selected = new Set([newPart]); render();
  const cat = curCat(); const n = Object.keys(cat.items).filter((k) => (cat.items[k].name || "").trim() === (name || "").trim()).length;
  pgToastMsg("お品書きに新しい品『" + (name || "品") + "』を作りました" + (n > 1 ? "（同じ名前の品が" + n + "つあります）" : ""), true);
}
function cardsDuplicate(fullId) {
  const info = partInfo(fullId); if (!info || !info.entry) return; const cat = info.R.effShop.catalog;
  const srcItemId = info.entry._itemId, srcItem = cat.items[srcItemId]; const srcPlc = info.entry._placementId ? cat.placements[info.entry._placementId] : null;
  const menuId = (info.entry._menu) || (srcPlc && srcPlc.menuId); const categoryId = srcPlc ? srcPlc.categoryId : null;
  const itemId = mintShopId("itm"), plcId = mintShopId("plc");
  const item = clone(srcItem); item.id = itemId; if (item.prices) item.prices = item.prices.map((p) => Object.assign(clone(p), { id: mintShopId("prc") }));
  // F8 同じ品を続けて貼るときは、前に貼った品のすぐ後ろへ（2回貼っても順が逆にならない）
  const chainKey = info.gid + "|" + srcItemId; const prevCopy = _a4DupChain[chainKey];
  const spec = ensurePickSpec(info.gid); const after = (prevCopy && spec.pick.includes(prevCopy)) ? prevCopy : srcItemId;
  const afterPlcId = after === srcItemId ? (srcPlc && srcPlc.id) : Object.keys(cat.placements).find((k) => cat.placements[k].itemId === after && cat.placements[k].menuId === menuId);
  const afterPlc = (afterPlcId && cat.placements[afterPlcId]) || srcPlc;
  const placement = { id: plcId, itemId, menuId, categoryId: afterPlc ? afterPlc.categoryId : categoryId, order: orderAfter(cat, menuId, afterPlc ? afterPlc.categoryId : categoryId, afterPlc) };
  if (srcPlc && srcPlc.prices) placement.prices = srcPlc.prices.map((p) => Object.assign(clone(p), { id: mintShopId("prc") }));
  const i = spec.pick.indexOf(after); if (i >= 0) spec.pick.splice(i + 1, 0, itemId); else spec.pick.push(itemId);
  commit({ t: "catAct", shops: [{ t: "shopAdd", item, placement }], src: { gid: info.gid, spec } });
  _a4DupChain[chainKey] = itemId;
  afterItemDuplicate(info.pfx + "card_name_" + cardPartId(itemId), item.name);
  return { itemId, partId: cardPartId(itemId) };
}
function cardsDelete(fullId) {
  const info = partInfo(fullId); if (!info || !info.entry) return; const cat = info.R.effShop.catalog;
  const itemId = info.entry._itemId, item = cat.items[itemId]; const name = (item && item.name) || "品";
  const spec = ensurePickSpec(info.gid); const i = spec.pick.indexOf(itemId); if (i >= 0) spec.pick.splice(i, 1); commit({ t: "catAct", src: { gid: info.gid, spec } });
  pgToastMsg("『" + name + "』をこの並びから外しました（お品書きには残っています）", true);
}

// ===================== 試験台28 §2.4：品の並べ替え（お品書き本体）・括りの足す/消す =====================
// お品書き本体（全部を並べる所・4.6）は ① の載せ方そのもの。行をドラッグして並べ替え＝載せ方の括り・順番を書き換える。
// お品書き本体の行 ID（menu__row_{name|desc|price}_{placementId}）→ placementId
function menuRowPlc(fullId) { const m = bareOf(fullId).match(/^row_(?:name|desc|price)_(.+)$/); return m ? m[1] : null; }
// ① から今の括りごとの並び（placement 主キー）を読む（ドラッグの落とし先の計算と試験の窓口）
function menuView() { return deriveMenuGroups(reduce(activeOps(), "pc").effShop); }
// 括りの中の placement を order 順に並べた配列（自分を除ける）
function placementsInCat(cat, menuId, categoryId, exclude) {
  return Object.keys(cat.placements).filter((k) => k !== exclude && cat.placements[k].menuId === menuId && cat.placements[k].categoryId === categoryId)
    .sort((a, b) => (cat.placements[a].order || 0) - (cat.placements[b].order || 0));
}
// 行を destCategoryId の中で beforePlcId の前へ（beforePlcId が null＝括りの最後へ）。別メニューの括りへも移せる。
function menuMoveRow(plcId, destCatId, beforePlcId) {
  const cat = curCat(); const plc = cat.placements[plcId]; const destCat = cat.categories[destCatId];
  if (!plc || !destCat) return false;
  const menuId = destCat.menuId;
  // J39 別のメニューへ移すとき、その品がすでにそのメニューにあるなら二重になる＝移さずに知らせる（表からも消さない）
  if (plc.menuId !== menuId && Object.keys(cat.placements).some((k) => k !== plcId && cat.placements[k].itemId === plc.itemId && cat.placements[k].menuId === menuId)) {
    pgToastMsg("『" + ((cat.items[plc.itemId] || {}).name || "この品") + "』はすでに" + menuName(menuId) + "にあります", false); return false;
  }
  const sibs = placementsInCat(cat, menuId, destCatId, plcId);
  let order;
  if (!beforePlcId || !sibs.includes(beforePlcId)) { order = sibs.length ? (cat.placements[sibs[sibs.length - 1]].order || 0) + 1 : 1; beforePlcId = null; }
  else { const idx = sibs.indexOf(beforePlcId); const at = cat.placements[beforePlcId].order || 0; const prev = idx > 0 ? (cat.placements[sibs[idx - 1]].order || 0) : at - 1; order = (prev + at) / 2; }
  // no-op を避ける：同じ括りで、今の並びの「beforePlcId の前」に既に居るなら commit しない
  if (plc.categoryId === destCatId && plc.menuId === menuId) {
    const cur = placementsInCat(cat, menuId, destCatId, null); const curNext = cur[cur.indexOf(plcId) + 1] || null;
    if ((curNext || null) === (beforePlcId || null)) return false;
  }
  const fromCat = plc.categoryId;
  commit({ t: "catAct", shops: [{ t: "shopReorder", placementId: plcId, menuId, categoryId: destCatId, order }] });
  if (fromCat !== destCatId) pgToastMsg("『" + ((cat.items[plc.itemId] || {}).name || "この品") + "』を「" + (destCat.name || "") + "」に移しました", true);   // F25 別の括りへ移したら知らせ
  return true;
}
// §2.7 お品書き本体の行を消す＝その載せ方（placement）を消す。ほかのメニューに残らなければ品も ① から消える
function menuRowDelete(fullId) {
  const plc = menuRowPlc(fullId); if (!plc) return false;
  const cat = curCat(); const p = cat.placements[plc]; if (!p) return false;
  const itemId = p.itemId, item = cat.items[itemId];
  const others = placementsOfItem(cat, itemId).filter((k) => k !== plc);
  const alsoItem = others.length === 0; const name = (item && item.name) || "品";
  const before = shownItems();
  commit({ t: "catAct", shops: [{ t: "shopDel", placementId: plc, itemId, alsoItem }] });
  // F59 トップの並び・表からも消えたら、どこから消えたかも言う
  const after = shownItems(); const R = reduce(activeOps()); const gone = [];
  for (const k of before.keys()) { if (after.has(k)) continue; const [inst, kind] = k.split(":"); if (kind === "menu") continue; const nm = pageLabelOf(R.secPageMap[inst]) + "の" + friendlySec(inst); if (!gone.includes(nm)) gone.push(nm); }
  const also = gone.length ? "。" + gone.join("・") + "の並びからも消えました" : "";
  if (alsoItem) pgToastMsg("『" + name + "』をお品書きから消しました" + also, true);
  else { const rem = [...new Set(others.map((k) => cat.placements[k].menuId))].map((m) => menuName(m)); pgToastMsg("『" + name + "』を" + menuName(p.menuId) + "から外しました（" + rem.join("・") + "に残っています）" + also, true); }
  pruneGoneSelection();
  return true;
}
// トップのおすすめ等（絞り込んだ並び）の並べ替え＝pick の順番（4.6「触った並びだけ」）。① の載せ方・ラベルは変えない。
function cardsMove(gid, itemId, beforeItemId) {
  const spec = ensurePickSpec(gid); const pick = spec.pick.filter((x) => x !== itemId);
  const idx = beforeItemId ? pick.indexOf(beforeItemId) : -1;
  if (idx < 0) pick.push(itemId); else pick.splice(idx, 0, itemId);
  if (spec.pick.join() === pick.join()) return false;   // no-op
  spec.pick = pick; commit({ t: "catAct", src: { gid, spec } });
  return true;
}
// 括りを足す（afterCatId のすぐ下・同じメニュー）
function categoryAdd(afterCatId) {
  const cat = curCat(); const after = cat.categories[afterCatId]; if (!after) return null;
  const menuId = after.menuId, catId = mintShopId("cat");
  const sibs = Object.keys(cat.categories).filter((c) => cat.categories[c].menuId === menuId).sort((a, b) => (cat.categories[a].order || 0) - (cat.categories[b].order || 0));
  const i = sibs.indexOf(afterCatId); const a = after.order || 0; const next = (i >= 0 && i < sibs.length - 1) ? (cat.categories[sibs[i + 1]].order || 0) : null;
  const order = next == null ? a + 1 : (a + next) / 2;
  commit({ t: "catAct", shops: [{ t: "shopCatAdd", categoryId: catId, menuId, name: "新しい括り", order }] });
  return catId;
}
// 括りに品が残っていれば消せない（§2.4：灰色）
function categoryCanDelete(catId) { const cat = curCat(); return !Object.keys(cat.placements).some((k) => cat.placements[k].categoryId === catId); }
function categoryDelete(catId) { if (!categoryCanDelete(catId)) return false; commit({ t: "catAct", shops: [{ t: "shopCatDel", categoryId: catId }] }); return true; }
// 括りの見出し ID（menu__mc_{categoryId}）→ categoryId
function menuCatId(fullId) { const m = bareOf(fullId).match(/^mc_(.+)$/); return m ? m[1] : null; }

// ===================== 試験台28 §2.5：品を選んだときの道具（販売・出す月・ラベル・載せるメニュー） =====================
// 選んでいる部品 → 品 ID。お品書き本体の行は placement（row_{…}_{plc}）、トップの札・表は partInfo（エイリアス）から。
function itemIdOfSel(fullId) {
  const cat = curCat(); const sec = secOf(fullId); const plc = menuRowPlc(fullId);
  if (sec === "menu" && plc && cat.placements[plc]) return cat.placements[plc].itemId;
  const info = partInfo(fullId); return (info && info.entry) ? info.entry._itemId : null;
}
// 道具が読む：今の品の販売・出す月・ラベル・載っているメニュー
function itemCtx(fullId) {
  const cat = curCat(); const itemId = itemIdOfSel(fullId); if (!itemId || !cat.items[itemId]) return null;
  const it = cat.items[itemId];
  const inMenus = [...new Set(Object.keys(cat.placements).filter((k) => cat.placements[k].itemId === itemId).map((k) => cat.placements[k].menuId))];
  const menus = Object.keys(cat.menus).sort((a, b) => (cat.menus[a].order || 0) - (cat.menus[b].order || 0)).map((mid) => ({ id: mid, name: cat.menus[mid].name || mid, on: inMenus.includes(mid) }));
  const labels = Object.keys(cat.labels || {}).sort((a, b) => ((cat.labels[a].order || 0) - (cat.labels[b].order || 0))).map((lid) => ({ id: lid, name: cat.labels[lid].name || lid, on: ((it.labels) || []).includes(lid) }));
  return { itemId, name: it.name || "", status: it.status || "onSale", months: ((it.season && it.season.months) || []).slice(), labels, menus, menuCount: inMenus.length };
}
// 販売（販売中／休んでいる／終わり）＝品の status。1操作1undo・薄表示は連動（isDisplayable）
// J35-J38：トップの並び・表に出ている品（itemId→名前）。変更の前後で比べ、消えた品を知らせる
function shownItems() { const R = reduce(activeOps()); const m = new Map(); const rm = new Set(R.removedAll || []);   // 鍵は「場所:品ID」＝並びと表で別に数える（片方から消えたら知らせる）。入れ物（I_cards/I_table）ごと消えたときも数える
  for (const inst of (R.allSecs || [])) { const c = R.secContent[inst.id]; if (!c) continue;
    const pfx = (inst.id === "feature" || inst.id === "items") ? "" : inst.id + SEP;
    if (!rm.has(pfx + "I_cards")) for (const row of (c.cards || [])) if (row._itemId) m.set(inst.id + ":cards:" + row._itemId, row.name || row._itemId);
    if (!rm.has(pfx + "I_table")) for (const row of (c.table || [])) if (row._itemId) m.set(inst.id + ":table:" + row._itemId, row.name || row._itemId);
    for (const g of (c.groups || [])) for (const ct of (g.cats || [])) for (const row of (ct.rows || [])) if (row._itemId && !row.hidden) m.set(inst.id + ":menu:" + (row._placementId || row._itemId), row.name || row._itemId); }   // J22 お品書き本体の行も数える
  return m; }
function withDropNotice(fn) { const before = shownItems(); const r = fn(); const after = shownItems();
  const names = [...new Set([...before.keys()].filter((k) => !after.has(k)).map((k) => before.get(k)))];
  if (names.length) pgToastMsg(names.map((n) => "『" + n + "』").join("・") + "が並びに出なくなりました", true); pruneGoneSelection(); return r; }
function setItemStatus(fullId, status) { const id = itemIdOfSel(fullId); if (!id) return false; return withDropNotice(() => { commit({ t: "catAct", shops: [{ t: "shopField", itemId: id, field: "status", value: status }] }); return true; }); }
// 出す月＝品の season.months（空＝いつでも＝season を外す）
function setItemMonths(fullId, months) { const id = itemIdOfSel(fullId); if (!id) return false; const ms = (months || []).slice().sort((a, b) => a - b); const value = ms.length ? { months: ms } : null; return withDropNotice(() => { commit({ t: "catAct", shops: [{ t: "shopField", itemId: id, field: "season", value }] }); return true; }); }
// ラベル＝品の labels（① の labels の ID 配列）
function setItemLabels(fullId, labelIds) { const id = itemIdOfSel(fullId); if (!id) return false; return withDropNotice(() => { commit({ t: "catAct", shops: [{ t: "shopLabels", itemId: id, labels: (labelIds || []).slice() }] }); return true; }); }
// 新しいラベルを作って付ける（お店のラベル＝① の labels に足す＋この品に付ける。戻す1回でまとめて戻る）
function addItemLabel(fullId, name) {
  const id = itemIdOfSel(fullId); if (!id) return null; const cat = curCat(); const it = cat.items[id];
  const nm = String(name == null ? "" : name).trim(); if (!nm) { pgToastMsg("ラベルの名前を入れてください", false); return null; }   // F49
  const same = Object.keys(cat.labels || {}).find((k) => ((cat.labels[k].name || "").trim()) === nm);   // F48 同じ名前のラベルは作らず、あるものを付ける
  if (same) { const cur = ((it.labels) || []).slice(); if (cur.includes(same)) { pgToastMsg("『" + nm + "』はもう付いています", false); return same; } cur.push(same); setItemLabels(fullId, cur); pgToastMsg("『" + nm + "』はもうあるラベルなので、それを付けました", false); return same; }
  const lid = mintShopId("lbl"); const mx = Math.max(0, ...Object.keys(cat.labels || {}).map((k) => cat.labels[k].order || 0));
  const labels = ((it.labels) || []).slice(); labels.push(lid);
  commit({ t: "catAct", shops: [{ t: "shopLabelDef", labelId: lid, name: nm, order: mx + 1 }, { t: "shopLabels", itemId: id, labels }] });
  return lid;
}
// 載せるメニュー：付ける＝そのメニューの一番近い（最初の）括りの最後に載せる／外す＝そのメニューの載せ方を消す（最後の1つは外せない）
function canRemoveMenu(fullId, menuId) { const id = itemIdOfSel(fullId); if (!id) return false; const cat = curCat(); const inMenus = [...new Set(Object.keys(cat.placements).filter((k) => cat.placements[k].itemId === id).map((k) => cat.placements[k].menuId))]; return inMenus.includes(menuId) && inMenus.length > 1; }
function setItemMenu(fullId, menuId, on) {
  const id = itemIdOfSel(fullId); if (!id) return false; const cat = curCat();
  const myInMenu = Object.keys(cat.placements).filter((k) => cat.placements[k].itemId === id && cat.placements[k].menuId === menuId);
  const inMenus = [...new Set(Object.keys(cat.placements).filter((k) => cat.placements[k].itemId === id).map((k) => cat.placements[k].menuId))];
  if (on) {
    if (myInMenu.length) return false;
    const cats = Object.keys(cat.categories).filter((c) => cat.categories[c].menuId === menuId).sort((a, b) => (cat.categories[a].order || 0) - (cat.categories[b].order || 0));
    const categoryId = cats[0]; if (!categoryId) return false;
    const plcId = mintShopId("plc"); const order = orderAfter(cat, menuId, categoryId, null);
    return withDropNotice(() => { commit({ t: "catAct", shops: [{ t: "shopPlcAdd", placementId: plcId, itemId: id, menuId, categoryId, order }] }); return true; });
  }
  if (!myInMenu.length || inMenus.length <= 1) return false;   // 最後の1つは外せない
  return withDropNotice(() => { commit({ t: "catAct", shops: myInMenu.map((k) => ({ t: "shopDel", placementId: k, itemId: id, alsoItem: false })) }); return true; });   // J38 メニューから外して表の行が消えたら知らせる
}
// 品を選ぶ一覧（そのメニューの品を括りごと。今出ている品は選べない扱い、出ない品は理由つき）
function outReason(item) { if (!item) return ""; if (item.status === "paused") return "一時休止中"; if (item.status && item.status !== "onSale") return "販売していません"; if (item.season && item.season.months && item.season.months.length && !item.season.months.includes(curMonth())) return fmtMonths(item.season.months) + "だけ"; return "今は並びに出ません"; }   // F46 出す月の文字
function itemPickerData(gid) {
  const R = reduce(activeOps(), "pc"); const spec = R.sourceResolved[gid] || templateSource(gid); const cat = R.effShop.catalog; const menuId = spec.menu;
  const sec = gid.indexOf(SEP) >= 0 ? instTag(gid) : "items"; const c = R.secContent[sec]; const shown = new Set(((c && c.cards) || []).map((e) => e._itemId));
  const cats = Object.keys(cat.categories).filter((cid) => cat.categories[cid].menuId === menuId).sort((a, b) => (cat.categories[a].order || 0) - (cat.categories[b].order || 0));
  const groups = cats.map((cid) => {
    const plcs = Object.keys(cat.placements).filter((k) => cat.placements[k].menuId === menuId && cat.placements[k].categoryId === cid).sort((a, b) => (cat.placements[a].order || 0) - (cat.placements[b].order || 0));
    const items = plcs.map((k) => { const it = cat.items[cat.placements[k].itemId]; return { itemId: cat.placements[k].itemId, name: (it && it.name) || "", shown: shown.has(cat.placements[k].itemId), displayable: isDisplayable(it), reason: isDisplayable(it) ? "" : outReason(it) }; });
    return { categoryId: cid, name: cat.categories[cid].name, items };
  });
  return { gid, menuId, menuName: menuName(menuId), categories: groups };
}
// ---- お品書きを見る（① の下書きを、公開中①〔無ければ最初の形〕と比べて出す） ----
function itemSig(cat, itemId) {
  const it = cat.items[itemId]; if (!it) return null;
  const plcs = Object.keys(cat.placements).filter((k) => cat.placements[k].itemId === itemId).map((k) => { const p = cat.placements[k]; return { menu: p.menuId, cat: p.categoryId, order: p.order, prices: p.prices || null }; }).sort((a, b) => (a.menu + a.cat).localeCompare(b.menu + b.cat));
  return JSON.stringify({ name: it.name, description: it.description || "", prices: it.prices || null, labels: (it.labels || []).slice().sort(), status: it.status || "", season: it.season || null, plcs });
}
function catalogView() {
  const cur = currentShop().catalog;
  const pub = currentPublished();
  const baseCat = (pub && pub.shop) ? pub.shop.catalog : shopTpl().catalog;
  const R = reduce(activeOps(), "pc");
  const shownCard = {}, shownRow = {};
  for (const inst of R.secList) { if (inst.type !== "items") continue; const pfx = (inst.id === "feature" || inst.id === "items") ? "" : inst.id + SEP; const c = R.secContent[inst.id]; if (!c) continue; for (const e of (c.cards || [])) if (!(e._itemId in shownCard)) shownCard[e._itemId] = pfx + "card_name_" + e.id; for (const e of (c.table || [])) if (!(e._itemId in shownRow)) shownRow[e._itemId] = pfx + "row_name_" + e.id; }
  const labelName = (lid) => (cur.labels[lid] || baseCat.labels[lid] || {}).name || lid;
  // 値段は「そのメニューで出す値段」（載せ方の価格があればそれ、なければ品の価格。3.4）＝その括りの載せ方で見る
  const mkItem = (src, itemId, placementId, state) => { const it = src.items[itemId]; const prices = priceOf({ catalog: src }, itemId, placementId); return { itemId, name: it.name || "", price: formatPrices(prices), labels: (it.labels || []).map(labelName), status: it.status || "", season: (it.season && it.season.months) ? it.season.months : null, display: isDisplayable(it), state, part: shownCard[itemId] || shownRow[itemId] || null }; };
  const menuIds = Object.keys(cur.menus).sort((a, b) => (cur.menus[a].order || 0) - (cur.menus[b].order || 0));
  const menus = menuIds.map((mid) => {
    const cats = Object.keys(cur.categories).filter((c) => cur.categories[c].menuId === mid).sort((a, b) => (cur.categories[a].order || 0) - (cur.categories[b].order || 0));
    const categories = cats.map((cid) => {
      const plcs = Object.keys(cur.placements).filter((k) => cur.placements[k].menuId === mid && cur.placements[k].categoryId === cid).sort((a, b) => (cur.placements[a].order || 0) - (cur.placements[b].order || 0));
      const items = plcs.map((k) => { const itemId = cur.placements[k].itemId; const st = !baseCat.items[itemId] ? "new" : (itemSig(cur, itemId) !== itemSig(baseCat, itemId) ? "changed" : "same"); return mkItem(cur, itemId, k, st); });
      const delPlcs = Object.keys(baseCat.placements).filter((bk) => baseCat.placements[bk].menuId === mid && baseCat.placements[bk].categoryId === cid && baseCat.items[baseCat.placements[bk].itemId] && !Object.keys(cur.placements).some((ck) => cur.placements[ck].itemId === baseCat.placements[bk].itemId && cur.placements[ck].menuId === mid && cur.placements[ck].categoryId === cid));
      const delItems = delPlcs.map((bk) => mkItem(baseCat, baseCat.placements[bk].itemId, bk, "deleted"));
      return { categoryId: cid, name: cur.categories[cid].name, items: items.concat(delItems) };
    });
    return { menuId: mid, name: cur.menus[mid].name || "", categories };
  });
  return { menus };
}
const kindOf = (id) => (/^F_p|^I_.*photo|photo/.test(id) ? "photo" : "text");
const styleOf = (id) => (/_h\d$/.test(id) || id === "F_h0" ? "featHead" : "featBody");

