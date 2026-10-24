// コピー・切り取り・貼り付け・複製
// 線：A3｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- クリップボード ----
function copySelection() {
  const ids = [...state.selected]; if (!ids.length) return;
  if (ids.length === 1 && /^card_/.test(ids[0])) { state.clipboard = { kind: "card", cardId: cardIdOf(ids[0]) }; return; }
  if (ids.length === 1 && /^row_/.test(ids[0])) { state.clipboard = { kind: "row", rowId: cardIdOf(ids[0]) }; return; }
  // 幅は端末ごとのコピー元の幅を使う（§2.3）＝両端末を測って持つ
  const here = state.device, other = here === "pc" ? "sp" : "pc";
  const gHere = geometry();
  state.device = other; render(); const gOther = geometry(); state.device = here; render();
  const Rc = reduce(activeOps());
  // J15 品の並び・表の入れ物（I_cards/I_table）は①に紐づく表示＝素の部品としてコピーしない（空の箱ができる）。中の1件は上の card_/row_ の道で複製する
  const copyable = ids.filter((id) => isDraggable(id) && !/^I_(cards|table)$/.test(bareOf(canonId(id))));
  const parts = copyable.map((id) => ({ id, kind: kindOf(id), text: isText(id) ? rawText(id) : null, runs: Rc.runsMap[id] ? clone(Rc.runsMap[id]) : null, elink: Rc.linkMap[id] || null, asset: kindOf(id) === "photo" ? assetOfPart(id, Rc) : null, brightness: brightnessOf(id), x: gHere[id].x, y: gHere[id].y, w: gHere[id].w, h: gHere[id].h, wOther: gOther[id] ? gOther[id].w : gHere[id].w, hOther: gOther[id] ? gOther[id].h : gHere[id].h }));
  if (parts.length) state.clipboard = { kind: "parts", parts };
}
function cutSelection() { copySelection(); deleteSelected(); }
// §5：貼り付け・複製はコピー元のすぐ下（間隔16）、左端をコピー元にそろえ、コピー元に付いていく。重なれば自分が下がる。
function paste() {
  const cb = state.clipboard; if (!cb) return;
  if (cb.kind === "card") { cardsDuplicate((cb.sec ? cb.sec + SEP : "") + "card_name_" + cb.cardId); return; }   // 試験台26：① 連動の複製
  if (cb.kind === "row") { tableDuplicate((cb.sec ? cb.sec + SEP : "") + "row_name_" + cb.rowId); return; }
  const base = cb.parts[0];
  const targetSec = state.selectedSection || secOf(base.id);
  const moveToOtherSec = targetSec !== secOf(base.id);
  const newIds = [];
  for (let i = 0; i < cb.parts.length; i++) {
    const p = cb.parts[i]; const id = (p.kind === "photo" ? "addp_" : "add_") + (++state.addSeq);
    let anchor, gap, x;
    if (moveToOtherSec) {                             // 別セクション：そのセクションの中身の一番下（間隔16）
      const g = geometry(); let bottomId = HG[targetSec], by = g[HG[targetSec]] ? g[HG[targetSec]].y + g[HG[targetSec]].h : 0;
      for (const [eid, e] of Object.entries(g)) { if (secOf(eid) !== targetSec || !isDraggable(canonId(eid)) || REPEAT.test(eid)) continue; if (e.y + e.h > by) { by = e.y + e.h; bottomId = eid; } }
      anchor = bottomId; gap = 16; x = g[bottomId] ? g[bottomId].x : (state.device === "pc" ? 56 : 20);
    } else if (i === 0) {                             // コピー元のすぐ下（間隔16）、左端そろえ
      anchor = base.id; gap = 16; x = p.x;
    } else {                                          // 複数：1件目との位置関係を保つ
      anchor = base.id; gap = 16 + (p.y - base.y); x = p.x;
    }
    commit({ t: "add", id, section: targetSec, kind: p.kind === "photo" ? "photo" : "text", styleName: styleOf(p.id), asset: p.kind === "photo" ? p.asset : undefined, w: p.w, wOther: p.wOther, h: p.kind === "photo" ? p.h : undefined, hOther: p.kind === "photo" ? p.hOther : undefined, text: p.text || "", anchor, gap, gapOther: gap, placedDevice: state.device, x });
    if (p.brightness) commit({ t: "bright", id, v: p.brightness });   // §2.7（X16）明るさも引き継ぐ
    if (p.runs) commit({ t: "edit", id, runs: clone(p.runs) });        // §19 文の一部の見た目・リンクも引き継ぐ
    if (p.elink) commit({ t: "elink", id, link: clone(p.elink) });     // §19 部品まるごとリンクも引き継ぐ
    newIds.push(id);
  }
  resolveBothDevices(newIds);                           // 両端末それぞれで重なりを自分が下がって解消（§5）
  selectMany(newIds);
}
// 試験台26：品の並び・表の1件の複製は ① 連動（新しい品を作る）。それ以外は従来のコピー＆貼り付け
function duplicate() { const ids = [...state.selected]; const one = ids.length === 1 ? ids[0] : null; if (one && isRepeat(one)) { const b = bareOf(one); if (/^card_/.test(b) || /^c_/.test(b)) cardsDuplicate(one); else tableDuplicate(one); return; } copySelection(); paste(); }
const cardIdOf = (id) => { const b = bareOf(id); return (b.match(/^(?:card|row)_(?:photo|name|desc|price|vline)?_?(.+)$/) || [])[1] || b.replace(/^(?:card|row)_[a-z]+_/, ""); };

