// commit・戻す/やり直す・最初の形
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- 履歴 ----
function commit(op) { state.restoreUndo = null; state.ops = state.ops.slice(0, state.cursor); state.ops.push(op); state.cursor++; render(); scheduleSave(); }
// 試験台28：op が効くページ（別ページのことを戻すときは、そのページに移ってから戻す・§2.2）。section ops は op.page、部品の op は secPageMap。
function opPage(op) {
  if (!op) return null;
  if (op.page) return op.page;
  const id = op.id || (op.items && op.items[0] && op.items[0].id) || (op.keys && partIdOfBox(op.keys[0])) || op.sec;
  if (!id) return null;
  const pg = (state.secPageMap || {})[secOf(id)];
  return (pg && pg !== "@region") ? pg : null;
}
const opPartId = (op) => op && (op.id || (op.items && op.items[0] && op.items[0].id) || op.sec) || null;
// 別ページの op を戻す/やり直すとき、そのページに移り、戻した部品を選んだ状態にする（§2.2）
function crossPageFor(op) { const pg = opPage(op); if (pg && pg !== state.page) { state.page = pg; const pid = opPartId(op); state.selected = pid ? new Set([canonId(pid)]) : new Set(); state.selectedSection = null; return true; } return false; }
function undo() {
  if (state.viewing) return;
  if (state.restoreUndo) { const r = state.restoreUndo; state.restoreUndo = null; state.base = r.base; state.ops = r.ops; state.cursor = r.cursor; state.undoBase = r.undoBase; state.secSeq = r.secSeq; state.addSeq = r.addSeq; state.shopBase = r.shopBase; render(); scheduleSave(); return; }   // §22 §6.5「この版を下書きにする」は戻す1回で元の下書き（①・②）へ
  if (state.editing) { reconcileEdit(); flushCheckpoint(); }   // §23b 末尾の打ち分を1区切りにしてから1つ戻す
  if (state.cursor <= state.undoBase) return;   // §23c X34：戻すものが無ければ何もしない（書き換えの状態もカーソルも触らない＝PowerPoint と同じ）。§22 §2.4 開き直した後の「戻す」も undoBase まで（undoBase に着いた後の Cmd+Z も何もしない）
  state.cursor--;
  while (state.ops[state.cursor]._grp && state.cursor > state.undoBase && state.ops[state.cursor - 1]._grp === state.ops[state.cursor]._grp) state.cursor--;   // P16/J17 まとめた操作（_grp）は1回で戻す
  const op = state.ops[state.cursor];
  crossPageFor(op);   // 試験台28：別ページの手直しは、そのページに移って戻す
  render();
  if (op && op.t === "edit" && op._ses) reenterEditSession(op.id, diffIndex(op.runs ? runsPlain(op.runs) : (op.text || ""), rawText(op.id)));   // §23b 戻すと書き換えに入り直し、戻した所にカーソル
  else { if (state.editing) endEditSilently(); a2SelectAfterHistory(op); }   // P22 戻した部品を選ぶ
  scheduleSave();
}
function redo() {
  if (state.viewing || state.restoreUndo) return;
  if (state.editing) { reconcileEdit(); flushCheckpoint(); }
  if (state.cursor >= state.ops.length) return;
  const op = state.ops[state.cursor];
  state.cursor++;
  while (op._grp && state.cursor < state.ops.length && state.ops[state.cursor]._grp === op._grp) state.cursor++;   // P16/J17 まとめた操作（_grp）は1回でやり直す
  crossPageFor(op);   // 試験台28：別ページの手直しのやり直しも、そのページに移る
  render();
  if (op && op.t === "edit" && op._ses) reenterEditSession(op.id, op.editCaret != null ? op.editCaret : rawText(op.id).length);   // §23b やり直しも細かく・入り直す
  else { if (state.editing) endEditSilently(); a2SelectAfterHistory(op); }   // P22 やり直した部品を選ぶ
  scheduleSave();
}
function reset() { state.base = null; state.shopBase = null; state.shopSeq = 0; state.ops = []; state.cursor = 0; state.undoBase = 0; state.restoreUndo = null; state.secSeq = 0; state.addSeq = 0; state.page = "pg_home"; state.selected = new Set(); state.selectedSection = null; state.editing = null; state.secList = defaultSecList(); _versions = initialVersions(); _saveStatus = "saved"; _simErr = false; render(); }

