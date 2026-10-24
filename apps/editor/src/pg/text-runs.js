// 文の一部の見た目（runs）・カーソル位置・書き換え中の範囲の操作と貼り付け
// 線：A1｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- 文の一部の見た目（runs。試験台13）----
// 部品の中身を、見た目つきのひと続きの切れ目の並び [{text,bold?,color?,scale?,font?,link?}] で持つ（PC/SP 共通の中身）。
function normRuns(runs) {
  const out = [];
  const lkEq = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  for (const r of runs) { const t = r.text || ""; if (!t) continue; const last = out[out.length - 1];
    const same = last && !!last.bold === !!r.bold && !!last.italic === !!r.italic && !!last.underline === !!r.underline && (last.color == null ? null : last.color) === (r.color == null ? null : r.color) && (last.scale || 1) === (r.scale || 1) && (last.font || null) === (r.font || null) && lkEq(last.link, r.link);
    if (same) last.text += t; else out.push({ text: t, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(r.underline ? { underline: true } : {}), ...(r.color != null ? { color: r.color } : {}), ...(r.scale && r.scale !== 1 ? { scale: +(+r.scale).toFixed(4) } : {}), ...(r.font ? { font: r.font } : {}), ...(r.link ? { link: clone(r.link) } : {}) });
  }
  return out.length ? out : [{ text: "" }];
}
function splitRunsAt(runs, pos) { const out = []; let o = 0; for (const r of runs) { const len = (r.text || "").length; if (pos > o && pos < o + len) { out.push({ ...r, text: r.text.slice(0, pos - o) }); out.push({ ...r, text: r.text.slice(pos - o) }); } else out.push({ ...r }); o += len; } return out; }
function runsSlice(runs, s, e) { const r = splitRunsAt(splitRunsAt(runs, s), e); const sel = []; let o = 0; for (const run of r) { const len = (run.text || "").length; if (o >= s && o + len <= e && len > 0) sel.push(run); o += len; } return sel; }
function applyRunRange(runs, s, e, fn) { const r = splitRunsAt(splitRunsAt(runs, s), e); let o = 0; for (const run of r) { const len = (run.text || "").length; if (o >= s && o + len <= e && len > 0) fn(run); o += len; } return normRuns(r); }
const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// 編集中の DOM（contenteditable）→ runs。見た目は span の data 属性で持つ（取り出しが正確）。
function domToRuns(root) {
  const out = []; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
  while ((n = walk.nextNode())) { const t = n.data; if (t === "") continue; let bold = false, italic = false, underline = false, color = null, scale = 1, font = null, link = null, p = n.parentNode;
    while (p && p !== root) { if (p.nodeType === 1) { if (p.getAttribute("data-b") === "1" || p.tagName === "B" || p.tagName === "STRONG") bold = true; if (p.getAttribute("data-i") === "1" || p.tagName === "I" || p.tagName === "EM") italic = true; if (p.getAttribute("data-u") === "1" || p.tagName === "U") underline = true; const c = p.getAttribute("data-c"); if (c && color == null) color = c; const sc = p.getAttribute("data-s"); if (sc) scale *= parseFloat(sc) || 1; const f = p.getAttribute("data-font"); if (f && font == null) font = f; const lk = p.getAttribute("data-lk"); if (lk && link == null) { try { link = JSON.parse(lk); } catch (e) {} } } p = p.parentNode; }
    out.push({ text: t, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}), ...(underline ? { underline: true } : {}), ...(color != null ? { color } : {}), ...(Math.abs(scale - 1) > 1e-6 ? { scale: +scale.toFixed(4) } : {}), ...(font ? { font } : {}), ...(link ? { link } : {}) });
  }
  return normRuns(out);
}
function runSpan(r) { const css = TEXT.runStyleCss(r); const da = []; if (r.bold) da.push('data-b="1"'); if (r.italic) da.push('data-i="1"'); if (r.underline) da.push('data-u="1"'); if (r.color != null) da.push('data-c="' + r.color + '"'); if (r.scale && r.scale !== 1) da.push('data-s="' + r.scale + '"'); if (r.font) da.push('data-font="' + r.font + '"'); if (r.link) da.push("data-lk=\"" + escH(JSON.stringify(r.link)) + "\""); if (!css && !da.length) return escH(r.text); return "<span " + da.join(" ") + (css ? ' style="' + css + '"' : "") + ">" + escH(r.text) + "</span>"; }
function runsToEditHtml(runs) { return runs.map(runSpan).join(""); }
function rawRuns(id, R) { R = R || reduce(activeOps()); return R.runsMap[id] ? R.runsMap[id].map((r) => ({ ...r })) : [{ text: rawText(id, R) }]; }
// 編集中の選択を文字オフセット [s,e] で取る
function caretOffsets(root) { const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return null; const rg = sel.getRangeAt(0); if (!root.contains(rg.startContainer) && rg.startContainer !== root) return null;
  const off = (container, offset) => { if (container === root) { let cnt = 0; for (let i = 0; i < offset && i < root.childNodes.length; i++) cnt += (root.childNodes[i].textContent || "").length; return cnt; } let n = 0; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let x; while ((x = walk.nextNode())) { if (x === container) return n + offset; n += x.data.length; } return n; };
  let s = off(rg.startContainer, rg.startOffset), e = off(rg.endContainer, rg.endOffset); if (s > e) { const t = s; s = e; e = t; } return { s, e };
}
function setCaretOffsets(root, s, e) { const nodes = []; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let x; while ((x = walk.nextNode())) nodes.push(x);
  const sel = window.getSelection(); const rg = document.createRange();
  if (!nodes.length) { rg.selectNodeContents(root); rg.collapse(true); sel.removeAllRanges(); sel.addRange(rg); return; }
  let acc = 0, sNode = null, sOff = 0, eNode = null, eOff = 0;
  for (const nd of nodes) { const len = nd.data.length; if (sNode == null && s <= acc + len) { sNode = nd; sOff = s - acc; } if (e <= acc + len) { eNode = nd; eOff = e - acc; break; } acc += len; }
  if (!sNode) { sNode = nodes[nodes.length - 1]; sOff = sNode.data.length; } if (!eNode) { eNode = nodes[nodes.length - 1]; eOff = eNode.data.length; }
  rg.setStart(sNode, Math.max(0, Math.min(sOff, sNode.data.length))); rg.setEnd(eNode, Math.max(0, Math.min(eOff, eNode.data.length))); sel.removeAllRanges(); sel.addRange(rg);
}
// §19b（X22）文字オフセット [s,e] の画面上の矩形（最後の行で測る＝複数行は最終行の下に出す）。選択が外れていても使える。
function rangeRectOf(root, s, e) {
  const nodes = []; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let x; while ((x = walk.nextNode())) nodes.push(x);
  if (!nodes.length) { const r = root.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }
  const rg = document.createRange(); let acc = 0, sNode = null, sOff = 0, eNode = null, eOff = 0;
  for (const nd of nodes) { const len = nd.data.length; if (sNode == null && s <= acc + len) { sNode = nd; sOff = s - acc; } if (e <= acc + len) { eNode = nd; eOff = e - acc; break; } acc += len; }
  if (!sNode) { sNode = nodes[nodes.length - 1]; sOff = sNode.data.length; } if (!eNode) { eNode = nodes[nodes.length - 1]; eOff = eNode.data.length; }
  rg.setStart(sNode, Math.max(0, Math.min(sOff, sNode.data.length))); rg.setEnd(eNode, Math.max(0, Math.min(eOff, eNode.data.length)));
  const rects = rg.getClientRects(); const bb = rg.getBoundingClientRect();
  const last = rects.length ? rects[rects.length - 1] : bb;   // 最後の行
  return { left: bb.left, top: bb.top, right: bb.right, bottom: last.bottom, lastLeft: last.left };
}
function editingSel() { if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; const o = caretOffsets(n); if (o) state.editing.lastSel = o; return o; }
// 道具（上のボタン・欄）に触れると編集中の選択が外れることがあるので、直近の選択（カーソルだけも含む）を覚えておいて使う。
// J9 今の選択が書き換え中の箱の中にあれば、カーソルだけでもそれを使う（前に選んだ範囲を選び直さない）
function liveSel() { const o = editingSel(); if (o) return o; return state.editing && state.editing.lastSel; }
function editingHasSelection() { const o = liveSel(); return !!(o && o.e > o.s); }
const stAtChar = (runs, idx) => { if (idx < 0) return {}; let o = 0; for (const r of runs) { const len = r.text.length; if (idx < o + len) return { bold: r.bold, italic: r.italic, underline: r.underline, color: r.color, scale: r.scale, font: r.font }; o += len; } return {}; };
// 入力（打つ・変換の決定・貼り付け）を runs に取り込む：差分の挿入文字は「前の文字の見た目」を引き継ぐ（PowerPoint）。
function reconcileEdit() {
  if (!state.editing) return; const n = elNode(state.editing.id); if (!n) return;
  const oldRuns = state.editing.runs || rawRuns(state.editing.id); const oldPlain = oldRuns.map((r) => r.text).join("");
  const newPlain = (n.innerText || "").replace(/\n+$/, "");
  if (newPlain === oldPlain || (/\n$/.test(oldPlain) && newPlain === oldPlain.replace(/\n+$/, ""))) return;   // F3 末尾の改行（表示のための <br>）は打った文字の差でない
  const La = oldPlain.length, Lb = newPlain.length, mx = Math.min(La, Lb);
  let p = 0; while (p < mx && oldPlain[p] === newPlain[p]) p++;
  let q = 0; while (q < mx - p && oldPlain[La - 1 - q] === newPlain[Lb - 1 - q]) q++;
  const inserted = newPlain.slice(p, Lb - q);
  let sty = p > 0 ? stAtChar(oldRuns, p - 1) : stAtChar(oldRuns, p);
  // P7・J9 カーソルだけで付けた見た目（次に打つ文字に効く）。打ったら使い終わり（続けて打つ文字は前の文字の見た目を引き継ぐ）
  if (inserted && state.editing.pending) { sty = { ...sty, ...state.editing.pending }; state.editing.pending = null; }
  const before = runsSlice(oldRuns, 0, p), after = runsSlice(oldRuns, La - q, La);
  const mid = inserted ? [{ text: inserted, ...(sty.bold ? { bold: true } : {}), ...(sty.italic ? { italic: true } : {}), ...(sty.underline ? { underline: true } : {}), ...(sty.color != null ? { color: sty.color } : {}), ...(sty.scale && sty.scale !== 1 ? { scale: sty.scale } : {}), ...(sty.font ? { font: sty.font } : {}) }] : [];
  const newRuns = normRuns([...before, ...mid, ...after]);
  state.editing.runs = newRuns; n.innerHTML = runsToEditHtml(newRuns); setCaretOffsets(n, p + inserted.length, p + inserted.length);
}
// 選んだ所だけに見た目を付ける（編集中・選択あり）。commit はしない（書き換えを終えるとき 1 op で記録）。
function applyPartStyle(kind, value) { if (!state.editing) return false; const n = elNode(state.editing.id); if (!n) return false; reconcileEdit(); const o = liveSel(); if (!o || o.e <= o.s) return false;
  let runs = state.editing.runs || domToRuns(n); const { s, e } = o;
  if (kind === "bold") { const cov = runsSlice(runs, s, e); const allBold = cov.length && cov.every((r) => r.bold); runs = applyRunRange(runs, s, e, (r) => { if (allBold) delete r.bold; else r.bold = true; }); }
  else if (kind === "italic" || kind === "underline") { const cov = runsSlice(runs, s, e); const all = cov.length && cov.every((r) => r[kind]); runs = applyRunRange(runs, s, e, (r) => { if (all) delete r[kind]; else r[kind] = true; }); }   // J4 斜体・下線（太字と同じ扱い）
  else if (kind === "color") { runs = applyRunRange(runs, s, e, (r) => { r.color = value; }); }
  else if (kind === "scale") { runs = applyRunRange(runs, s, e, (r) => { if (value === 1) delete r.scale; else r.scale = value; }); }
  else if (kind === "font") { runs = applyRunRange(runs, s, e, (r) => { if (!value) delete r.font; else r.font = value; }); }
  else if (kind === "link") { runs = applyRunRange(runs, s, e, (r) => { if (!value) delete r.link; else r.link = clone(value); }); }
  state.editing.runs = runs; n.innerHTML = runsToEditHtml(runs); setCaretOffsets(n, s, e); liveReflow();
  if (state.editing.mode) flushCheckpoint();   // §23b 打っていた分を先に区切る
  flushCheckpoint();   // §23b 文の一部の見た目を変えたら、それで1区切り
  return true;
}
// §19 書き換え中：範囲を指定してリンク/書体を当てる（自動リンク・貼り付けリンク用）。commit しない。
function applyPartStyleRange(kind, value, s, e) {
  if (!state.editing) return false; const n = elNode(state.editing.id); if (!n || e <= s) return false;
  let runs = state.editing.runs || domToRuns(n);
  if (kind === "link") runs = applyRunRange(runs, s, e, (r) => { if (!value) delete r.link; else r.link = clone(value); });
  else if (kind === "font") runs = applyRunRange(runs, s, e, (r) => { if (!value) delete r.font; else r.font = value; });
  state.editing.runs = runs; n.innerHTML = runsToEditHtml(runs); setCaretOffsets(n, s, e); liveReflow(); return true;
}
const plainLen = (runs) => runs.reduce((a, r) => a + (r.text || "").length, 0);
// §2.5 書き換え中：カーソル直前の URL/メールのトークンを自動リンクにする（空白等を打った直後に呼ぶ）
function autoLinkBeforeCaret() {
  if (!state.editing || composing) return false; const n = elNode(state.editing.id); if (!n) return false;
  const o = caretOffsets(n); if (!o) return false; const caret = o.s;
  const runs = state.editing.runs || domToRuns(n); const plain = runs.map((r) => r.text).join("");
  let end = caret; while (end > 0 && /[\s　]/.test(plain[end - 1])) end--;     // 直前の区切りを飛ばす
  let start = end; while (start > 0 && !/[\s　]/.test(plain[start - 1])) start--;
  if (end <= start) return false;
  const lk = parseAutoLink(plain.slice(start, end)); if (!lk) return false;
  const snapshot = runs.map((r) => clone(r));
  const newRuns = applyRunRange(runs, start, end, (r) => { r.link = clone(lk); });
  state.editing.runs = newRuns; n.innerHTML = runsToEditHtml(newRuns); setCaretOffsets(n, caret, caret);
  state.editing.autoUndo = snapshot; liveReflow(); return true;
}
// §2.5/§2.6 書き換え中の貼り付け：URL/メールだけなら、選択ありは選択をリンク化／選択なしは貼って入れてリンク化
function editingPasteLink(text) {
  if (!state.editing) return false; const n = elNode(state.editing.id); if (!n) return false;
  const lk = parseAutoLink(text); if (!lk) return false;
  reconcileEdit(); const o = liveSel() || caretOffsets(n); if (!o) return false;
  const snapshot = (state.editing.runs || domToRuns(n)).map((r) => clone(r));
  if (o.e > o.s) { applyPartStyleRange("link", lk, o.s, o.e); }
  else { let runs = state.editing.runs || domToRuns(n); const L = plainLen(runs);
    const runsNew = normRuns([...runsSlice(runs, 0, o.s), { text, link: clone(lk) }, ...runsSlice(runs, o.s, L)]);
    state.editing.runs = runsNew; n.innerHTML = runsToEditHtml(runsNew); setCaretOffsets(n, o.s + text.length, o.s + text.length); liveReflow(); }
  state.editing.autoUndo = snapshot; return true;
}
// §19b §5 この編集の中でコピーした文字（見た目・リンクつき）を覚える。貼り付けで引き継ぐ（大きさは貼り先に合わせる＝scale は持ち越さない）。
function captureEditingCopy() {
  if (!state.editing) { state.richClip = null; return; } const n = elNode(state.editing.id); if (!n) return; reconcileEdit();
  const o = liveSel() || caretOffsets(n); if (!o || o.e <= o.s) return;
  const runs = state.editing.runs || domToRuns(n);
  const sel = runsSlice(runs, o.s, o.e).map((r) => { const c = { ...r }; delete c.scale; return c; });
  state.richClip = { plain: sel.map((r) => r.text).join(""), runs: normRuns(sel) };
}
// 貼り付けた文字が「この編集の中でコピーしたもの」と一致したら、見た目・リンクつきで入れる。一致しなければ false（＝文字だけに任せる）。
function editingPasteRich(text) {
  if (!state.editing || !state.richClip || text !== state.richClip.plain) return false;
  const n = elNode(state.editing.id); if (!n) return false; reconcileEdit();
  const o = liveSel() || caretOffsets(n); if (!o) return false;
  const snapshot = (state.editing.runs || domToRuns(n)).map((r) => clone(r));
  let runs = state.editing.runs || domToRuns(n); const L = plainLen(runs);
  const ins = state.richClip.runs.map((r) => clone(r));
  const newRuns = normRuns([...runsSlice(runs, 0, o.s), ...ins, ...runsSlice(runs, o.e, L)]);
  state.editing.runs = newRuns; n.innerHTML = runsToEditHtml(newRuns); setCaretOffsets(n, o.s + text.length, o.s + text.length);
  state.editing.autoUndo = snapshot; liveReflow(); return true;
}
const editingHasAutoUndo = () => !!(state.editing && state.editing.autoUndo);
function editingUndoAutoLink() {
  if (!state.editing || !state.editing.autoUndo) return false; const n = elNode(state.editing.id);
  const runs = normRuns(state.editing.autoUndo); state.editing.autoUndo = null; state.editing.runs = runs;
  if (n) { const caret = (caretOffsets(n) || { s: 0 }).s; n.innerHTML = runsToEditHtml(runs); setCaretOffsets(n, Math.min(caret, plainLen(runs)), Math.min(caret, plainLen(runs))); }
  liveReflow(); return true;
}
// §2.1 Cmd+K など：今の選択 [s,e] を取る（道具に触れても覚えている分を使う）
function editingSelRange() { if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; reconcileEdit(); return liveSel() || null; }
// §19 選択範囲の書体（混在は "__mixed__"、無指定は null）。道具のボタンの名前に使う。
function editingSelFont() {
  if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; const o = liveSel() || caretOffsets(n); if (!o) return null;
  const runs = state.editing.runs || domToRuns(n); const a = o.s, b = Math.max(o.e, o.s + 1); let f, acc = 0;
  for (const r of runs) { const len = r.text.length, s = acc, e = acc + len; if (e > a && s < b) { const rf = r.font || null; if (f === undefined) f = rf; else if (f !== rf) return "__mixed__"; } acc += len; }
  return f === undefined ? null : f;
}
function boxSizePx(id) { const sn = styleNameOf(id); return effSize(sn, state.device, reduce(activeOps()).textStyles[tsKeyOf(id)]).size; }
// 選択の代表の、今の端末での実際の大きさ（px）＝箱の大きさ×倍率
function editingPartSizePx() { if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; const o = liveSel() || caretOffsets(n); if (!o) return null; const runs = state.editing.runs || domToRuns(n); let acc = 0, scale = 1; for (const r of runs) { const len = r.text.length; if (o.s < acc + len) { scale = r.scale || 1; break; } acc += len; } return Math.round(boxSizePx(state.editing.id) * scale); }
const runStyled = (runs) => runs.length > 1 || (runs[0] && (runs[0].bold || runs[0].italic || runs[0].underline || runs[0].color != null || (runs[0].scale && runs[0].scale !== 1) || runs[0].font || runs[0].link));
function hasRuns(id) { const r = reduce(activeOps()).runsMap[id]; return !!(r && runStyled(r)); }
// §2.3 入口：その部品の切れ目の並び
function textRunsApi(part) { if (state.editing && state.editing.id === part) { reconcileEdit(); return (state.editing.runs || []).map((r) => ({ ...r })); } const R = reduce(activeOps()); return R.runsMap[part] ? R.runsMap[part].map((r) => ({ ...r })) : [{ text: rawText(part, R) }]; }

// F3 書き換え中の Enter：改行を "\n" の文字として runs に入れる（Chrome の insertText "\n" は <div><br></div> になり、空行1つが2つ・3つに増えていた）。
// 末尾が改行なら、カーソルを次の行に見せるために <br> を1つ足す（runs には入らない＝reconcileEdit が末尾の改行の差を無視する）。
function a1InsertNewline() {
  if (!state.editing) return false; const n = elNode(state.editing.id); if (!n) return false;
  reconcileEdit(); const o = caretOffsets(n) || state.editing.lastSel; if (!o) return false;
  if (state.editing.mode) flushCheckpoint();
  const runs = state.editing.runs || domToRuns(n); const L = plainLen(runs); const s = Math.min(o.s, L), e = Math.min(o.e, L);
  const st = stAtChar(runs, s > 0 ? s - 1 : 0);
  const nl = { text: "\n", ...(st.bold ? { bold: true } : {}), ...(st.italic ? { italic: true } : {}), ...(st.underline ? { underline: true } : {}), ...(st.color != null ? { color: st.color } : {}), ...(st.scale && st.scale !== 1 ? { scale: st.scale } : {}), ...(st.font ? { font: st.font } : {}) };
  const newRuns = normRuns([...runsSlice(runs, 0, s), nl, ...runsSlice(runs, e, L)]);
  state.editing.runs = newRuns; const plain = newRuns.map((r) => r.text).join("");
  n.innerHTML = runsToEditHtml(newRuns) + (/\n$/.test(plain) ? "<br>" : "");
  setCaretOffsets(n, s + 1, s + 1); state.editing.lastSel = { s: s + 1, e: s + 1 };
  liveReflow(); flushCheckpoint();   // §23b 改行を打ったら区切る
  return true;
}
