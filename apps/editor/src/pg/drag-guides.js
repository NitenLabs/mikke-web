// 目安の線（スマートガイド・等間隔）・押し下げ・両端末の解決・範囲で選ぶ
// 線：A2｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- そろえる・目安の線（§2 スマートガイド）----
let curGuides = [], curGuidesSec = null;
// そろえる相手の線。縦（v＝左端/真ん中/右端・中身の左右中）と横（h＝上端/真ん中/下端）。
// 対象＝テンプレの部品・足した部品・表/品の並びの外枠。品の1件・表の1行の中の部品は対象外（canonId!==id で畳む）。
function snapTargets(sec, exclude) {
  const g = geometry(); const V = [], H = [];
  const { left: cL, right: cR } = contentEdges(); const cC = (cL + cR) / 2;
  V.push({ at: cL, kind: "edge", ref: "@content" }, { at: cC, kind: "center", ref: "@content" }, { at: cR, kind: "edge", ref: "@content" });
  for (const [id, e] of Object.entries(g)) {
    if (exclude.has(id) || secOf(id) !== sec) continue;
    if (canonId(id) !== id) continue;                    // 見出しの組の中・ピルの文字は親に畳む
    if (REPEAT.test(id) || /^row_vline_/.test(id)) continue;   // 品の1件・表の行の中は対象外
    if (!(isDraggable(id) || id === "I_cards" || id === "I_table")) continue;
    V.push({ at: e.x, kind: "edge", ref: id }, { at: e.x + e.w / 2, kind: "center", ref: id }, { at: e.x + e.w, kind: "edge", ref: id });
    H.push({ at: e.y, kind: "edge", ref: id }, { at: e.y + e.h / 2, kind: "center", ref: id }, { at: e.y + e.h, kind: "edge", ref: id });
  }
  return { V, H };
}
// 動かしている線（lines＝[{pos,kind}]）を相手（targets）に合わせる。同じ種類どうし（edge↔edge・center↔center）。画面6px以内で最も近い1本。
// 距離が同じときは、真ん中どうし＞中身（@content）を優先する（部品の端とたまたま重なっても、意図は真ん中・中身へのそろえ＝Z3）。
const tieScore = (x) => (x.kind === "center" ? 2 : 0) + (x.ref === "@content" ? 1 : 0);
function nearestLine(targets, lines, threshDesign) {
  let best = null;
  for (const L of lines) for (const t of targets) { if (t.kind !== L.kind) continue; const ad = Math.abs(t.at - L.pos); if (ad > threshDesign) continue;
    const cand = { d: t.at - L.pos, at: t.at, kind: t.kind, ref: t.ref };
    if (!best || ad < Math.abs(best.d) - 1e-6 || (Math.abs(ad - Math.abs(best.d)) < 1e-6 && tieScore(cand) > tieScore(best))) best = cand; }
  return best;
}
const movingV = (b) => [{ pos: b.x, kind: "edge" }, { pos: b.x + b.w / 2, kind: "center" }, { pos: b.x + b.w, kind: "edge" }];
const movingH = (b) => [{ pos: b.y, kind: "edge" }, { pos: b.y + b.h / 2, kind: "center" }, { pos: b.y + b.h, kind: "edge" }];
// ドラッグ中の箱（box）を縦横それぞれ吸い付かせる。位置は最も近い1本で決め、吸い付いた後に重なる線はすべて目安線にする（PowerPoint は複数本出る）。
function snapBox(sec, box, useV, useH, exclude) {
  const th = (inputMode() === "phone" ? 10 / (window.visualViewport ? window.visualViewport.scale : 1) : 6) / scale; const { V, H } = snapTargets(sec, exclude); const guides = [];   // §3.2.8 スマホは画面上10px（PCは6px）
  const addCoincident = (lines, moving, dir) => { for (const t of lines) for (const L of moving) if (t.kind === L.kind && Math.abs(t.at - L.pos) < 0.5 && !guides.some((gg) => gg.dir === dir && Math.abs(gg.at - t.at) < 0.5 && gg.ref === t.ref)) guides.push({ dir, at: +t.at.toFixed(2), kind: t.kind, ref: t.ref }); };
  const bv = useV ? nearestLine(V, movingV(box), th) : null;
  const bh = useH ? nearestLine(H, movingH(box), th) : null;
  const dx = bv ? bv.d : 0, dy = bh ? bh.d : 0;
  if (bv) addCoincident(V, movingV({ ...box, x: box.x + dx }), "v");
  if (bh) addCoincident(H, movingH({ ...box, y: box.y + dy }), "h");
  return { dx, dy, guides, hitV: !!bv, hitH: !!bh };
}
function setGuides(gs, sec) { curGuides = gs || []; curGuidesSec = sec || null; drawGuides(); }
function clearGuides() { curGuides = []; curGuidesSec = null; document.querySelectorAll(".snap-guide").forEach((n) => n.remove()); }
function drawGuides() {
  document.querySelectorAll(".snap-guide").forEach((n) => n.remove());
  if (!curGuides.length || !curGuidesSec) return; const s = secNode(curGuidesSec); if (!s) return;
  const sh = s.getBoundingClientRect().height / scale, sw = SPEC.DESIGN_W[state.device];
  for (const gg of curGuides) { const n = document.createElement("div"); n.className = "snap-guide";
    if (gg.dir === "v") { n.style.cssText = `position:absolute;left:${gg.at}px;top:0;width:1px;height:${sh}px;background:#f0309a;pointer-events:none;z-index:9`; s.appendChild(n); }
    else if (gg.dir === "h") { n.style.cssText = `position:absolute;left:0;top:${gg.at}px;width:${sw}px;height:1px;background:#f0309a;pointer-events:none;z-index:9`; s.appendChild(n); }
    else if (gg.dir === "eqh") { // 等間隔（横）：空きの両端に短い縦線つきの線
      const x1 = Math.min(gg.x1, gg.x2), x2 = Math.max(gg.x1, gg.x2); n.style.cssText = `position:absolute;left:${x1}px;top:${gg.at}px;width:${x2 - x1}px;height:1px;background:#f0309a;pointer-events:none;z-index:9`; s.appendChild(n);
      for (const tx of [x1, x2]) { const t = document.createElement("div"); t.className = "snap-guide"; t.style.cssText = `position:absolute;left:${tx}px;top:${gg.at - 4}px;width:1px;height:9px;background:#f0309a;pointer-events:none;z-index:9`; s.appendChild(t); } }
    else if (gg.dir === "eqv") { // 等間隔（縦）
      const y1 = Math.min(gg.y1, gg.y2), y2 = Math.max(gg.y1, gg.y2); n.style.cssText = `position:absolute;left:${gg.at}px;top:${y1}px;width:1px;height:${y2 - y1}px;background:#f0309a;pointer-events:none;z-index:9`; s.appendChild(n);
      for (const ty of [y1, y2]) { const t = document.createElement("div"); t.className = "snap-guide"; t.style.cssText = `position:absolute;left:${gg.at - 4}px;top:${ty}px;width:9px;height:1px;background:#f0309a;pointer-events:none;z-index:9`; s.appendChild(t); } }
  }
}
function guidesList() { return curGuides.map((x) => ({ ...x })); }

// ===================== §27 等間隔の目安（スマートガイドの等間隔） =====================
// そろえる相手と同じ部品（§7.2）＝同じセクションの動かせる部品・表/品の並びの外枠。1件/行の中は対象外
function eqPartRects(sec, exclude) {
  const g = geometry(); const out = [];
  for (const id in g) { if (exclude.has(id) || secOf(id) !== sec) continue; if (canonId(id) !== id) continue; if (REPEAT.test(id) || /^row_vline_/.test(id)) continue; if (!(isDraggable(id) || id === "I_cards" || id === "I_table")) continue; out.push({ id, x: g[id].x, y: g[id].y, w: g[id].w, h: g[id].h }); }
  return out;
}
// 1つの軸（horiz=横）での等間隔の候補位置と、その印（そろう2つの空き）を返す
function eqAxisCands(parts, M, horiz) {
  const lo = (p) => horiz ? p.x : p.y, sz = (p) => horiz ? p.w : p.h, hi = (p) => lo(p) + sz(p);
  const pLo = (p) => horiz ? p.y : p.x, pSz = (p) => horiz ? p.h : p.w, pHi = (p) => pLo(p) + pSz(p);
  const inline = parts.filter((p) => pLo(p) < pHi(M) && pHi(p) > pLo(M));   // 動かしている部品と上下（横なら）の範囲が重なる＝同じ行
  const Msz = sz(M); const cands = []; const EPS = 0.01;
  const gapMark = (a, b) => ({ from: a, to: b });   // from・to は（横なら）x 座標。空きの両端
  for (const A of inline) for (const B of inline) { if (A === B || hi(A) > lo(B)) continue;   // (b) A 左・B 右の間に入る
    const pos = (hi(A) + lo(B) - Msz) / 2; const gap = (lo(B) - hi(A) - Msz) / 2;
    if (pos >= hi(A) - EPS && pos + Msz <= lo(B) + EPS && gap >= -EPS) cands.push({ pos, marks: [gapMark(hi(A), pos), gapMark(pos + Msz, lo(B))] }); }
  for (const P1 of inline) for (const P2 of inline) { if (P1 === P2 || hi(P1) > lo(P2)) continue;   // (a) M ... P1 ... P2（M が左端・右側に等間隔）
    const gap12 = lo(P2) - hi(P1); const pos = lo(P1) - Msz - gap12;
    if (pos + Msz <= lo(P1) + EPS && gap12 >= -EPS) cands.push({ pos, marks: [gapMark(pos + Msz, lo(P1)), gapMark(hi(P1), lo(P2))] }); }
  for (const P1 of inline) for (const P2 of inline) { if (P1 === P2 || hi(P2) > lo(P1)) continue;   // (a) P2 ... P1 ... M（M が右端・左側に等間隔）
    const gap21 = lo(P1) - hi(P2); const pos = hi(P1) + gap21;
    if (pos >= hi(P1) - EPS && gap21 >= -EPS) cands.push({ pos, marks: [gapMark(hi(P2), lo(P1)), gapMark(hi(P1), pos)] }); }
  return cands;
}
// 箱 box を等間隔に吸い付かせる。{dx,dxDist,dy,dyDist,marksX,marksY}
function equalSpaceSnap(sec, box, useV, useH, exclude) {
  const th = (inputMode() === "phone" ? 10 / (window.visualViewport ? window.visualViewport.scale : 1) : 6) / scale;
  const parts = eqPartRects(sec, exclude); const res = { dx: 0, dxDist: null, dy: 0, dyDist: null, marksX: [], marksY: [] };
  const pick = (cands, cur) => { let best = null; for (const c of cands) { const d = c.pos - cur; if (Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.d) - 1e-6)) best = { d, marks: c.marks }; } return best; };
  if (useV) { const b = pick(eqAxisCands(parts, box, true), box.x); if (b) { res.dx = b.d; res.dxDist = Math.abs(b.d); const yc = +(box.y + box.h / 2).toFixed(2); res.marksX = b.marks.map((m) => ({ dir: "eqh", x1: +m.from.toFixed(2), x2: +m.to.toFixed(2), at: yc })); } }
  if (useH) { const b = pick(eqAxisCands(parts, box, false), box.y); if (b) { res.dy = b.d; res.dyDist = Math.abs(b.d); const xc = +(box.x + box.w / 2).toFixed(2); res.marksY = b.marks.map((m) => ({ dir: "eqv", y1: +m.from.toFixed(2), y2: +m.to.toFixed(2), at: xc })); } }
  return res;
}

// 足した／貼り付けた部品が text/photo/pill と重なるなら、重ならなくなるまで自分が下がる（§5。line は対象外）。
// 新しい op は作らず、その部品の置き場所を決めている op（add の gap／gapOther、または M2 の move）を書き換える＝1操作=1 undo。
// field："gap"（置いた端末）／"gapOther"（もう一方の端末）。M2 の move があればそちらを優先して gapY を増やす。
function pushDownClear(id, field) {
  field = field || "gap";
  for (let iter = 0; iter < 50; iter++) {
    const g = geometry(); const me = g[id]; if (!me) return;
    // 厳密な重なり判定（warnings は写真の上の文字＝内包を許すが、ここでは内包も「重なり」として下げる）
    let lowest = 0, any = false;
    for (const [oid, e] of Object.entries(g)) {
      if (oid === id || secOf(oid) !== secOf(id)) continue;
      // 障害物＝文字・写真・ボタン、および繰り返す並び全体（I_cards／I_table）。並びに付く部品は並びの下へ出す（並びが縮んでも重ならない）
      const isObstacle = ["text", "photo", "pill"].includes(e.kind) || oid === "I_cards" || oid === "I_table";
      if (!isObstacle) continue;
      const ox = Math.min(me.x + me.w, e.x + e.w) - Math.max(me.x, e.x);
      const oy = Math.min(me.y + me.h, e.y + e.h) - Math.max(me.y, e.y);
      if (ox > 1 && oy > 1) { any = true; lowest = Math.max(lowest, e.y + e.h); }
    }
    if (!any) return;
    const push = (lowest + 16) - me.y; if (push <= 0.5) return;
    let done = false;
    for (let i = state.cursor - 1; i >= 0 && !done; i--) {
      const op = state.ops[i];
      if (op.t === "move" && op.device === state.device) { const it = op.items && op.items.find((x) => x.id === id && x.mode === "M2"); if (it) { it.gapY += push; done = true; } }
      else if (op.t === "add" && op.id === id) { op[field] = (op[field] != null ? op[field] : 16) + push; done = true; }
    }
    if (!done) return;
    render();
  }
}
// 貼り付け・複製した部品を、両端末それぞれで重ならないよう下げる（§5。置き場所は端末ごと）
function resolveBothDevices(ids) {
  const here = state.device, other = here === "pc" ? "sp" : "pc";
  for (const id of ids) pushDownClear(id, "gap");
  state.device = other; render();
  for (const id of ids) pushDownClear(id, "gapOther");
  state.device = here; render();
}

// 範囲選択（矩形は screen 座標→ここでは design 矩形を受ける）
function selectInDesignRect(sec, r) {
  const g = rawGeomOf(sec); const chosen = [];
  for (const [id, e] of Object.entries(g)) { const c = canonId(id); if (!isDraggable(c) || REPEAT.test(id)) continue; if (e.x >= r.x - 0.5 && e.y >= r.y - 0.5 && e.x + e.w <= r.x + r.w + 0.5 && e.y + e.h <= r.y + r.h + 0.5) if (!chosen.includes(c)) chosen.push(c); }
  return chosen;
}

