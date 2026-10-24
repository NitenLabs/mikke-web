// 大きさを変える（つまみ）
// 線：A2｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- 大きさを変える（§4）。つまみ(data-handle)をつかんで動かす。離した位置で記録する。----
let rz = null;
function contentEdges() { const dw = SPEC.DESIGN_W[state.device]; const CW = state.device === "pc" ? 1326 : 351; return { left: (dw - CW) / 2, right: (dw + CW) / 2 }; }
// 向きと動かした量（設計px）から、変える値を出す。w/h は絶対、padB は文字の下の空き。
// 動かした辺の反対側の辺は動かさない（中央そろえでも左そろえでも同じ＝位置ずれは commitSize が実測で記録する）。
function computeResize(r, ddx, ddy) {
  const s = r.start; const { left: cL, right: cR } = contentEdges(); const MIN = (r.kind === "cards" || r.kind === "table") ? minWidthOf(r.id) : (r.kind === "text" ? a1TextMinW(r.id) : 40); const H = r.handle;   // F2 文字の箱は4文字分・80 以上
  const toLeft = /w/.test(H), toRight = /e/.test(H);
  if (r.kind === "text" && H === "s") return { padB: Math.max(0, Math.round(r.padB0 + ddy)) };  // 下の辺＝文字の下の空き（文字より短くはしない）
  let newW = toRight ? s.w + ddx : toLeft ? s.w - ddx : s.w;
  if (toRight) newW = Math.min(newW, cR - s.x);                 // 右端が中身の右端を越えない（左端を固定＝右へ伸ばす）
  if (toLeft) newW = Math.min(newW, (s.x + s.w) - cL);          // 左端が中身の左端を越えない（右端を固定＝左へ伸ばす）
  newW = Math.max(MIN, Math.round(newW));
  const out = { w: newW };
  if (r.kind === "photo") out.h = Math.round(newW * (s.h / s.w) * 100) / 100;  // 縦横比を保つ
  return out;
}
function beginResize(id, handle, clientX, clientY) { const c = canonId(id); const e = geometry()[c]; if (!e) return false; rz = { id: c, handle, kind: resizableKind(c), sx: clientX, sy: clientY, lx: clientX, ly: clientY, start: { x: e.x, y: e.y, w: e.w, h: e.h }, padB0: (reduce(activeOps()).sizes[c]?.padB) || 0, result: null }; return true; }
// 大きさの結果（つまみの動きから）。§2：動かしている辺だけが、縦の線（左右の端・中身の端）に吸い付く（Alt で切る）。
function resizeResult(r, ddx, ddy, alt) {
  const out = computeResize(r, ddx, ddy); let guides = [];
  if (!alt && out.w != null) { const toRight = /e/.test(r.handle), toLeft = /w/.test(r.handle);
    if (toRight || toLeft) { const { left: cL, right: cR } = contentEdges(); const MIN = r.kind === "text" ? a1TextMinW(r.id) : 40;
      const movingX = toRight ? r.start.x + out.w : (r.start.x + r.start.w) - out.w;
      const { V } = snapTargets(secOf(r.id), new Set([r.id]));
      const best = nearestLine(V.filter((t) => t.kind === "edge"), [{ pos: movingX, kind: "edge" }], (inputMode() === "phone" ? 10 / (window.visualViewport ? window.visualViewport.scale : 1) : 6) / scale);   // §3.2.8 スマホは画面上10px
      if (best) { let nw = toRight ? best.at - r.start.x : (r.start.x + r.start.w) - best.at;
        if (toRight) nw = Math.min(nw, cR - r.start.x); if (toLeft) nw = Math.min(nw, (r.start.x + r.start.w) - cL);
        nw = Math.max(MIN, Math.round(nw)); out.w = nw; if (r.kind === "photo") out.h = Math.round(nw * (r.start.h / r.start.w) * 100) / 100;
        guides = [{ dir: "v", at: +best.at.toFixed(2), kind: best.kind, ref: best.ref }]; } } }
  return { out, guides };
}
function resizeMove(clientX, clientY, alt) { if (!rz) return; rz.lx = clientX; rz.ly = clientY; const { out, guides } = resizeResult(rz, (clientX - rz.sx) / scale, (clientY - rz.sy) / scale, alt); rz.result = out; const n = elNode(rz.id); if (n) { if (out.w != null) n.style.width = out.w + "px"; if (out.h != null) n.style.height = out.h + "px"; if (out.padB != null) n.style.paddingBottom = out.padB + "px"; } setGuides(guides, secOf(rz.id)); }
function endResize() { if (!rz) return; if (Math.abs(rz.lx - rz.sx) <= 0.5 && Math.abs(rz.ly - rz.sy) <= 0.5) { rz = null; clearGuides(); render(); return; } const r = rz; const out = rz.result || computeResize(r, (rz.lx - rz.sx) / scale, (rz.ly - rz.sy) / scale); rz = null; clearGuides(); commitSize(r, out); }
// §4：大きさの記録。縦積みの中は流れが下を押し下げる。M2（塊の外）は大きくして重なっても押し下げない（＝ownerOverlaps）。
// 動かした辺の反対側を固定する位置ずれ dx は、幅を当てたあとの実測から出す（中央そろえ・左そろえの両方で正しい）。
function commitSize(r, out) {
  const id = r.id; const op = { t: "size", device: state.device, id }; if (out.w != null) op.w = out.w; if (out.h != null) op.h = out.h; if (out.padB != null) op.padB = out.padB; commit(op);
  if (out.w != null) { const toLeft = /w/.test(r.handle), toRight = /e/.test(r.handle); const e = geometry()[id];
    if (e && (toLeft || toRight)) { const dx = toLeft ? Math.round((r.start.x + r.start.w) - (e.x + e.w)) : Math.round(r.start.x - e.x); if (dx) { op.dx = dx; render(); } } }
}
// プリセット用：つまみを ddx/ddy（設計px）動かす（alt=true で吸い付きなし）
function programResize(id, handle, ddx, ddy, alt) { const c = canonId(id); const e = geometry()[c]; if (!e) return; const r = { id: c, handle, kind: resizableKind(c), start: { x: e.x, y: e.y, w: e.w, h: e.h }, padB0: (reduce(activeOps()).sizes[c]?.padB) || 0 }; const { out } = resizeResult(r, ddx, ddy, alt); commitSize(r, out); }
function sizesList() { const R = reduce(activeOps()); const out = []; for (const [id, s] of Object.entries(R.sizes || {})) { const o = { part: id }; if (s.w != null) o.w = s.w; if (s.h != null) o.h = s.h; if (s.padB != null) o.padB = s.padB; out.push(o); } return out; }

