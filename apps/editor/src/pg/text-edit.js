// その場書き換え（contenteditable・IME・細かい戻す）
// 線：A1｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- その場書き換え ----
function rawText(id, R) {
  R = R || reduce(activeOps());
  const c = R.secContent[secOf(id)]; const b = bareOf(id);
  if (c) {
    const mB = { F_h0: [0, "heading"], F_b0: [0, "body"], F_h1: [1, "heading"], F_b1: [1, "body"] };
    if (mB[b] && c.blocks) return c.blocks[mB[b][0]][mB[b][1]];
    let m; if ((m = b.match(/^card_(name|desc|price)_(.+)$/)) && c.cards) { const x = c.cards.find((x) => x.id === m[2]); return x ? x[m[1]] : ""; }
    if ((m = b.match(/^row_(name|desc|price)_(.+)$/)) && c.table) { const x = c.table.find((x) => x.id === m[2]); return x ? (x[m[1]] || "") : ""; }
    if (b === "I_kanmi") return c.kanmiLabel || ""; if (b === "I_time") return c.kanmiTime || "";
    // 試験台28：新しいページの文字
    if (b === "logo") return c.logo || ""; if (b === "fname") return c.name || ""; if (b === "faddr") return c.addr || ""; if (b === "fcopy") return c.copy || "";
    if (b === "men" || b === "cen") return c.en || ""; if (b === "mtitle" || b === "ctitle") return c.title || "";
    if (c.groups) {
      if ((m = b.match(/^mg_(.+)$/))) { const g = c.groups.find((x) => x.id === m[1]); return g ? g.name : ""; }
      if ((m = b.match(/^mt_(.+)$/))) { const g = c.groups.find((x) => x.id === m[1]); return g ? (g.time || "") : ""; }
      if ((m = b.match(/^mc_(.+)$/))) { for (const g of c.groups) { const cat = g.cats.find((x) => x.id === m[1]); if (cat) return cat.name; } return ""; }
      if ((m = b.match(/^row_(name|desc|price)_(.+)$/))) { for (const g of c.groups) for (const cat of g.cats) { const x = cat.rows.find((x) => x.id === m[2]); if (x) return x[m[1]] || ""; } return ""; }
    }
    if (c.rows && Array.isArray(c.rows)) {
      if (b === "clead") return c.lead || "";
      if ((m = b.match(/^cl_(.+)$/))) { const r = c.rows.find((x) => x.id === m[1]); return r ? r.label : ""; }
      if ((m = b.match(/^ci_(.+)$/))) { const r = c.rows.find((x) => x.id === m[1]); return r ? r.value : ""; }
    }
  }
  const a = R.adds.find((a) => a.id === id); if (a) return R.editMap[id] != null ? R.editMap[id] : a.text;
  return elNode(id)?.textContent || "";
}
// ===================== §23b 書き換え中の「戻す」を細かくする（記録 0.6：打った分を少しずつ戻す） =====================
let _breakTimer = null;
function clearBreakTimer() { if (_breakTimer) { clearTimeout(_breakTimer); _breakTimer = null; } }
function resetBreakTimer() { clearBreakTimer(); _breakTimer = setTimeout(() => { if (state.editing) flushCheckpoint(); }, 1000); }   // 1秒止まったら区切る
const runsPlain = (runs) => (runs || []).map((r) => r.text).join("");
function diffIndex(a, b) { const m = Math.min(a.length, b.length); let i = 0; while (i < m && a[i] === b[i]) i++; return i; }
function pushOpNoRender(op) { state.restoreUndo = null; state.ops = state.ops.slice(0, state.cursor); state.ops.push(op); state.cursor++; scheduleSave(); if (typeof onRender === "function") onRender(); }   // DOM は既に正しい＝render しない
// 今の書き換えの状態を1区切り（undo の1単位）として記録。前の区切りから変わっていなければ何もしない。
// 変換の境目（開始・確定）。要素の oncomposition* が届かない経路でも、WIRING の document 監視からここを呼ぶ。
function imeBoundary(kind) {
  if (!state.editing) return;
  if (kind === "start") { composing = true; flushCheckpoint(); }
  else { composing = false; reconcileEdit(); liveReflow(); flushCheckpoint(); }
}
function flushCheckpoint() {
  if (!state.editing) return; clearBreakTimer();
  const id = state.editing.id;
  if (state.pendingNewText === id) { state.editing.mode = null; return; }   // 足したばかりの文字は commitEdit で add に焼き込む（1追加=1undo）
  const cur = state.editing.runs || rawRuns(id);
  if (JSON.stringify(cur) === JSON.stringify(state.editing.lastRuns)) { state.editing.mode = null; return; }
  const n = elNode(id); const c = n ? caretOffsets(n) : null;
  const styled = runStyled(cur);
  const op = styled ? { t: "edit", id, runs: clone(cur), _ses: 1 } : { t: "edit", id, text: runsPlain(cur), _ses: 1 };
  op.editCaret = c ? c.e : runsPlain(cur).length;
  pushOpNoRender(op);
  state.editing.lastRuns = clone(cur); state.editing.mode = null;
}
// 入力ごとの区切り判定（変換中でないとき）：打つ↔消すの切り替え・区切り文字（空白・句読点）・改行・1秒止まりで区切る。
function handleEditInput(e) {
  const it = (e && e.inputType) || "";
  const isDelete = /delete/i.test(it);
  const isBreakChar = !!(e && e.data && /[\s　、。，．・,.!?！？;:；：]/.test(e.data));
  const isEnter = /insertParagraph|insertLineBreak/i.test(it);
  const newMode = isDelete ? "del" : "type";
  if (state.editing.mode && state.editing.mode !== newMode) flushCheckpoint();   // 打つ↔消すの切り替えで区切る
  reconcileEdit(); liveReflow();
  state.editing.mode = newMode;
  if (isBreakChar || isEnter) flushCheckpoint();   // 区切り文字・改行を打ったら区切る
  else resetBreakTimer();
}
// 戻す／やり直しで、その区切りの書き換えの状態に入り直す。入り直した所にカーソルを置く（記録 0.6）。
function reenterEditSession(id, caretOff) {
  if (state.editing) { if (state.editing.selWatch) document.removeEventListener("selectionchange", state.editing.selWatch); state.editing = null; }
  clearBreakTimer();
  startEdit(id);   // 今の ops から runs を読み直して書き換えに入る
  const n = elNode(id); if (!n || !state.editing) return;
  const off = Math.max(0, Math.min(caretOff, runsPlain(state.editing.runs).length));
  setCaretOffsets(n, off, off); state.editing.lastSel = { s: off, e: off };
  state.editing.lastRuns = clone(state.editing.runs); state.editing.mode = null;
}
function endEditSilently() {   // 区切りの外へ戻った＝書き換えを静かに抜ける（新しい区切りは作らない）
  if (!state.editing) return; const n = elNode(state.editing.id);
  if (state.editing.selWatch) document.removeEventListener("selectionchange", state.editing.selWatch);
  clearBreakTimer(); state.editing = null;
  if (n) { n.oninput = n.oncompositionstart = n.oncompositionend = n.onkeydown = null; n.removeAttribute("contenteditable"); }
}

function startEdit(id, selectAll) {
  const c = canonId(id); const n = elNode(c); if (!n || !isText(c)) return;
  if (state.editing) commitEdit();
  // X3：書き換えに入ったら、その部品を選んだ状態にする（PowerPoint と同じ）＝上の文字の道具が出る。品・表の中の1件の文字でも同じ。
  state.selectedSection = null; state.selected = new Set([c]);
  const runs = rawRuns(c);
  state.editing = { id: c, runs, lastRuns: clone(runs), mode: null };   // §23b lastRuns＝直前の区切り、mode＝打つ/消す
  catalogEditBegin(c);   // F6・F62 品名・説明の書き換えの知らせ（pg/catalog-ops.js）
  n.innerHTML = runsToEditHtml(runs);         // 見た目つきの切れ目（文の一部の見た目）を見せて編集（§13）
  n.setAttribute("contenteditable", "true");
  n.style.whiteSpace = "pre-wrap"; n.style.wordBreak = "normal"; n.style.outline = "2px solid #06c";
  n.focus();
  const range = document.createRange(); range.selectNodeContents(n); if (!selectAll) range.collapse(false);   // §4（試験台17）足した文字は全選択（打てば置き換わる）
  const selc = window.getSelection(); selc.removeAllRanges(); selc.addRange(range);
  if (selectAll) { const o = caretOffsets(n); if (o) state.editing.lastSel = o; }
  // 道具に触れて選択が外れても使えるよう、選択を覚えておく
  state.editing.selWatch = () => { if (!state.editing) return; const nn = elNode(state.editing.id); if (!nn) return; const o = caretOffsets(nn); if (o) state.editing.lastSel = o; a1SelMoved(); };   // J9 カーソルだけも覚える・P7 動いたら使っていない見た目を捨てる
  document.addEventListener("selectionchange", state.editing.selWatch);
  n.oninput = (e) => { if (composing || (e && e.isComposing)) return; handleEditInput(e); if (typeof onEditInput === "function") onEditInput(e); };  // 変換中は取り込まない（§2.1/§23a）。区切り判定は handleEditInput（§23b）。§19 自動リンクは onEditInput で
  n.oncompositionstart = () => imeBoundary("start");
  n.oncompositionend = () => imeBoundary("end");   // §23b 変換を決めたら1区切り（1変換=1undo）
  n.onkeydown = (e) => { if (e.isComposing || e.keyCode === 229) return;   /* §23a X33 日本語の変換中のキーはページで拾わない（preventDefault もしない） */
    if (/^(Arrow|Home|End|PageUp|PageDown)/.test(e.key)) flushCheckpoint();   // §23b カーソルを動かしたら区切る
    if (e.key === "Escape") { e.preventDefault(); commitEdit(); } };
  refreshSel();   // X3：選択の印と、上の文字の道具を今の状態に更新する（書き換えに入った部品が選ばれている）
}
function liveReflow() { placeAbsolute(); if (typeof onRender === "function") onRender(); }
function commitEdit() {
  if (!state.editing) return; const id = state.editing.id; const n = elNode(id);
  catalogEditEnd(id);   // F6・F62（確定の後に知らせる）
  clearBreakTimer();
  if (n) reconcileEdit();
  const wasNew = state.pendingNewText === id;   // §4（試験台17）この書き換えが「足したばかりの文字」の最初の書き換えか
  if (!wasNew) flushCheckpoint();   // §23b 末尾の打ち分を最後の区切りに（書き換えまるごとを1つにまとめ直さない）
  const runs = (state.editing.runs) || (n ? domToRuns(n) : [{ text: rawText(id) }]);
  if (state.editing.selWatch) document.removeEventListener("selectionchange", state.editing.selWatch);
  state.editing = null; if (n) { n.oninput = n.oncompositionstart = n.oncompositionend = n.onkeydown = null; n.removeAttribute("contenteditable"); }
  const styled = runStyled(runs);
  if (!wasNew) { render(); return; }   // §23b 区切りは既に ops に記録済み。改行規則を当て直して再描画
  if (wasNew) {
    state.pendingNewText = null;
    const plain = runs.map((r) => r.text).join("");
    let ai = -1; for (let i = state.cursor - 1; i >= 0; i--) { if (state.ops[i].t === "add" && state.ops[i].id === id) { ai = i; break; } }
    if (plain.trim() === "") {   // §4 空なら、足したこと自体をなかったことに（履歴にも残さない）
      if (ai >= 0) { state.ops.splice(ai, 1); state.cursor--; }
      state.selected = new Set(); render(); scheduleSave(); return;   // J23 なかったことにしたのも保存する
    }
    if (ai >= 0) { const op = state.ops[ai]; op.text = plain; }   // 素の文字は add に焼き込む（1追加=1undo）
    if (styled) commit({ t: "edit", id, runs }); else { render(); scheduleSave(); }   // J23 見た目なしの初回確定も保存する（commit を通らない道）
    return;
  }
  commit(styled ? { t: "edit", id, runs } : { t: "edit", id, text: (runs[0] ? runs[0].text : "") });  // 改行規則を当て直して再描画
}
function editApi(id, text) { commit({ t: "edit", id: canonId(id), text }); } // 記録つき書き換え（§7 edit）

