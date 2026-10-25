// 矢印キーで動かす・削除
// 線：A2｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- 矢印キー・削除（M1 として）----
// §X36 足した部品の矢印キー：place の gap・x を動かす（ドラッグと同じ M2 の記録。geometry から今の位置を測って dx,dy を足す）
function nudgeAddedItem(c, dx, dy, R, g) { const a = R.added.find((x) => x.id === c) || (R.carried || []).find((x) => x.id === c); /* J17 別のセクションへ移した部品も同じ */ const anchor = a ? a.anchor : c; const ab = g[anchor] ? (g[anchor].y + g[anchor].h) : 0; const curY = g[c] ? g[c].y : ab, curX = g[c] ? g[c].x : 0; return { id: c, mode: "M2", anchor, gapY: (curY - ab) + dy, x: curX + dx }; }
function nudge(id, dx, dy) {
  const c = canonId(id); const R = reduce(activeOps());
  if (isFloat(c)) { commit({ t: "move", device: state.device, items: [nudgeAddedItem(c, dx, dy, R, geometry())] }); return; }   // §X36・J17
  if (R.m2[c]) { const ov = R.m2[c]; commit({ t: "move", device: state.device, items: [{ id: c, mode: "M2", anchor: ov.anchor, gapY: ov.gapY, x: ov.x + dx }] }); if (dy) { const ov2 = reduce(activeOps()).m2[c]; commit({ t: "move", device: state.device, items: [{ id: c, mode: "M2", anchor: ov2.anchor, gapY: ov2.gapY + dy, x: ov2.x }] }); } return; }
  const m = R.m1[c] || { dx: 0, dy: 0 };
  commit({ t: "move", device: state.device, items: [{ id: c, mode: "M1", dx: m.dx + dx, dy: m.dy + dy }] });
}
function nudgeSelected(dx, dy) { const ids = [...state.selected].filter(isDraggable); if (!ids.length) return; const R = reduce(activeOps()); const g = geometry(); const items = ids.map((c) => { if (isFloat(c)) return nudgeAddedItem(c, dx, dy, R, g); const m = R.m1[c] || { dx: 0, dy: 0 }; return { id: c, mode: "M1", dx: m.dx + dx, dy: m.dy + dy }; }); commit({ t: "move", device: state.device, items }); }
function deleteSelected() {
  const all = [...state.selected]; const one = all.length === 1 ? all[0] : null;
  if (one && isRepeat(one)) {
    if (secOf(one) === "menu" && menuRowPlc(one)) { menuRowDelete(one); state.selected = new Set(); render(); return; }   // 試験台28 §2.7：お品書き本体の行 → 載せ方を消す（① 連動）
    const b = bareOf(one); if (/^card_/.test(b) || /^c_/.test(b)) cardsDelete(one); else tableDelete(one); state.selected = new Set(); render(); return;   // 試験台26：品の並び・表の1件 → ① 連動
  }
  const ids = all.filter((id) => isDraggable(id) || REPEAT.test(id)); if (!ids.length) return; withDropNotice(() => commit({ t: "del", ids: ids.map(canonId) })); state.selected = new Set(); render();   // J13 まとめて1つの del／J14 並び全体を消して品が消えたら知らせる
}

