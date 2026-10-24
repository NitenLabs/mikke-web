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
// F29・F32 別の端末の手直しも、その端末に切り替える。切り替えたら知らせの文を返す（どこへ移ったか）
function crossPageFor(op) { const pg = opPage(op); const devOnly = op && (["move", "reorder", "zorder", "size", "cols", "swap", "view"].includes(op.t) || (op.t === "tstyle" && op.size != null));   // 端末ごとに効く手直しだけ
  const dev = devOnly && (op.device === "pc" || op.device === "sp") && op.device !== state.device ? op.device : null;
  const where = [];
  if (pg && pg !== state.page) { state.page = pg; where.push(pageLabelOf(pg) + "のページ"); }
  if (dev) { state.device = dev; where.push(dev === "sp" ? "スマホ" : "PC"); }
  if (!where.length) return null;
  const pid = opPartId(op); state.selected = pid ? new Set([canonId(pid)]) : new Set(); state.selectedSection = null; return where.join("・"); }
function crossToast(where, verb) { if (where && typeof window !== "undefined" && window.pgToast) window.pgToast(where + "の手直しを" + verb + "ました"); }
function undo() {
  if (state.viewing) return;
  if (state.restoreUndo) { const r = state.restoreUndo; state.restoreUndo = null; state.base = r.base; state.ops = r.ops; state.cursor = r.cursor; state.undoBase = r.undoBase; state.secSeq = r.secSeq; state.addSeq = r.addSeq; state.shopBase = r.shopBase; render(); scheduleSave(); return; }   // §22 §6.5「この版を下書きにする」は戻す1回で元の下書き（①・②）へ
  if (state.editing) { reconcileEdit(); flushCheckpoint(); }   // §23b 末尾の打ち分を1区切りにしてから1つ戻す
  if (state.cursor <= state.undoBase) return;   // §23c X34：戻すものが無ければ何もしない（書き換えの状態もカーソルも触らない＝PowerPoint と同じ）。§22 §2.4 開き直した後の「戻す」も undoBase まで（undoBase に着いた後の Cmd+Z も何もしない）
  state.cursor--;
  const op = state.ops[state.cursor];
  const where = crossPageFor(op);   // 試験台28：別ページの手直しは、そのページに移って戻す（F32 別の端末も）
  render(); crossToast(where, "戻し");
  if (op && op.t === "edit" && op._ses) reenterEditSession(op.id, diffIndex(op.runs ? runsPlain(op.runs) : (op.text || ""), rawText(op.id)));   // §23b 戻すと書き換えに入り直し、戻した所にカーソル
  else if (state.editing) endEditSilently();
  scheduleSave();
}
function redo() {
  if (state.viewing || state.restoreUndo) return;
  if (state.editing) { reconcileEdit(); flushCheckpoint(); }
  if (state.cursor >= state.ops.length) return;
  const op = state.ops[state.cursor];
  state.cursor++;
  const where = crossPageFor(op);   // 試験台28：別ページの手直しのやり直しも、そのページに移る
  render(); crossToast(where, "やり直し");
  if (op && op.t === "edit" && op._ses) reenterEditSession(op.id, op.editCaret != null ? op.editCaret : rawText(op.id).length);   // §23b やり直しも細かく・入り直す
  else if (state.editing) endEditSilently();
  scheduleSave();
}
function reset() { state.base = null; state.shopBase = null; state.shopSeq = 0; state.ops = []; state.cursor = 0; state.undoBase = 0; state.restoreUndo = null; state.secSeq = 0; state.addSeq = 0; state.page = "pg_home"; state.selected = new Set(); state.selectedSection = null; state.editing = null; state.secList = defaultSecList(); _versions = initialVersions(); _saveStatus = "saved"; _simErr = false; render(); }

