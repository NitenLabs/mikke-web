// 触って作る層 3（動かす・戻す・その場で書き換える）。配置と操作は C3（c3-edit）に委ね、ここは
// 操作の記録（undo/redo つき）→ content/edits への還元 → 描画 → 絶対配置の当てはめ → 選択・ドラッグ・
// その場書き換え・キーボード・クリップボード・戻す だけを持つ。方式は今回の1つだけ（§0-2）。
const PG = (function () {
  const M = C3; // 唯一の方式
  const base = () => JSON.parse(JSON.stringify(CONTENT_JSON));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const S1_ADD = "毎朝炊いた餡を、その日のうちにお出しします。手のひらにのる小さな菓子に、季節のうつろいを写します。四季折々の意匠をお楽しみください。";
  const S2_HEAD = "季節の上生菓子と、その月だけの特別な意匠";

  const HG = { feature: "F_hg", items: "I_hg" };
  const TEMPLATE_DRAG = ["F_hg", "F_p0", "F_h0", "F_b0", "F_p1", "F_h1", "F_b1", "I_hg", "I_divider", "I_kanmi", "I_time"];
  const HG_MEMBERS = { F_lbl: "F_hg", F_h: "F_hg", F_rule: "F_hg", I_lbl: "I_hg", I_h: "I_hg", I_rule: "I_hg" };
  const REPEAT = /^(card_|row_)/;
  const canonId = (id) => HG_MEMBERS[id] || id;
  const isAdded = (id) => /^add_/.test(id);
  const isDraggable = (id) => TEMPLATE_DRAG.includes(canonId(id)) || isAdded(id);
  const isText = (id) => /^F_[hb]\d$|^add_/.test(id) || /^card_(name|desc|price)_/.test(id) || id === "I_kanmi" || id === "I_time";
  const secOf = (id) => { if (id.startsWith("F_")) return "feature"; if (isAdded(id)) { const op = activeOps().find((o) => o.t === "add" && o.id === id); return op ? op.section : "items"; } return "items"; };

  let state = { device: "pc", ops: [], cursor: 0, selected: new Set(), selectedSection: null, editing: null, peek: false, clipboard: null, addSeq: 0 };
  let scale = 1, layoutCount = 0, composing = false;
  let appliedPlace = {}; // id -> {top,left} 直近の絶対配置

  const activeOps = () => state.ops.slice(0, state.cursor);

  // ---- content への文字の反映 ----
  function setContent(content, id, text) {
    const mB = { F_h0: [0, "heading"], F_b0: [0, "body"], F_h1: [1, "heading"], F_b1: [1, "body"] };
    if (mB[id]) { content.feature.blocks[mB[id][0]][mB[id][1]] = text; return true; }
    let m;
    if ((m = id.match(/^card_(name|desc|price)_(.+)$/))) { const card = content.items.cards.find((c) => c.id === m[2]); if (card) card[m[1]] = text; return true; }
    return false;
  }

  // ---- 操作列 → content / edits ----
  function reduce(ops, device, peek) {
    device = device || state.device;
    const content = base();
    const editMap = {}; const adds = []; const removed = new Set();
    const m1 = {}, m2 = {}, clearL = []; const tpl = {};
    const scopeIds = (scope, id) => {
      if (scope === "part") return [canonId(id)];
      const all = [...TEMPLATE_DRAG, ...adds.map((a) => a.id)];
      if (scope === "page") return all;
      return all.filter((x) => secOf(x) === secOf(id));
    };
    for (const op of ops) {
      if (op.t === "edit") editMap[op.id] = op.text;
      else if (op.t === "add") { if (!removed.has(op.id)) adds.push(op); }
      else if (op.t === "del") { removed.add(op.id); for (let i = adds.length - 1; i >= 0; i--) if (adds[i].id === op.id) adds.splice(i, 1); delete m1[op.id]; delete m2[op.id]; }
      else if (op.t === "clear") { if (!clearL.includes(op.id)) clearL.push(op.id); }
      else if (op.t === "unclear") { const i = clearL.indexOf(op.id); if (i >= 0) clearL.splice(i, 1); }
      else if (op.t === "template") Object.assign(tpl, op.v);
      else if (op.t === "addCard") { const i = content.items.cards.findIndex((c) => c.id === op.after); if (i >= 0) content.items.cards.splice(i + 1, 0, clone(op.card)); else content.items.cards.push(clone(op.card)); }
      else if (op.t === "move") { if (op.device === device) for (const it of op.items) { if (it.mode === "M1") { delete m2[it.id]; m1[it.id] = { dx: it.dx, dy: it.dy }; } else { delete m1[it.id]; m2[it.id] = { anchor: it.anchor, gapY: it.gapY, x: it.x }; } } }
      else if (op.t === "resetScope") { if (op.devices.includes(device)) for (const id of scopeIds(op.scope, op.id)) { delete m1[id]; delete m2[id]; } }
    }
    // content に文字を反映（テンプレ・品）
    for (const [id, text] of Object.entries(editMap)) setContent(content, id, text);
    // 足した部品（両端末に存在。位置は端末ごと）
    const added = [];
    for (const a of adds) {
      if (removed.has(a.id)) continue;
      const text = editMap[a.id] != null ? editMap[a.id] : a.text;
      let place;
      if (m2[a.id]) place = { anchor: m2[a.id].anchor, gap: m2[a.id].gapY, x: m2[a.id].x };
      else if (device === a.placedDevice) place = { anchor: a.anchor, gap: a.gap, x: a.x };
      else place = { anchor: a.anchor, gap: a.gap, x: "@left" };
      added.push({ id: a.id, section: a.section, kind: a.kind, styleName: a.styleName || "featBody", w: a.w, text, anchor: place.anchor, gap: place.gap, x: place.x });
      delete m2[a.id];
    }
    // template 部品の m2/remove（added でないもの）
    const remove = [...removed].filter((id) => !isAdded(id));
    // 「元の配置を見る」：手で動かした部品を元（今の中身からのテンプレ位置）に戻して見せる（記録は変えない）
    if (peek) { for (const k in m1) delete m1[k]; for (const k in m2) delete m2[k]; }
    return { content, m1, m2, added, remove, clear: clearL, tpl, adds, editMap };
  }

  function secNode(sec) { return document.getElementById("host_" + sec)?.querySelector("#sec"); }
  function elNode(id) { for (const s of ["feature", "items"]) { const h = document.getElementById("host_" + s); const n = h && h.querySelector('[data-el="' + id + '"]'); if (n) return n; } return null; }

  // ---- 描画 ----
  function render() {
    const R = reduce(activeOps(), state.device, state.peek);
    for (const sec of ["feature", "items"]) {
      const host = document.getElementById("host_" + sec);
      const meas = document.getElementById("meas");
      const boxes = M.collectTextBoxes(R.content, state.device);
      for (const a of R.added) if (a.section === sec && a.kind !== "photo") boxes.push({ key: a.id, styleName: a.styleName, device: state.device, widthPx: a.w, text: a.text });
      const H = TEXT.buildH(boxes, meas, SPEC);
      const edits = { m1: R.m1, m2: R.m2, added: R.added.map((a) => ({ ...a, html: a.kind !== "photo" ? (H.get(a.id)?.html ?? a.text) : undefined })), remove: R.remove, clear: R.clear, template: R.tpl };
      const out = (sec === "feature" ? M.buildFeature : M.buildItems)(R.content, state.device, H, edits);
      host.innerHTML = out.bodyHtml;
      host._padBottom = out.padBottom;
    }
    layoutScale();
    placeAbsolute(R);
    decorate();
    if (typeof onRender === "function") onRender();
  }

  function layoutScale() {
    const dw = SPEC.DESIGN_W[state.device];
    const avail = document.getElementById("stage").clientWidth - 4;
    scale = Math.min(1, avail / dw);
    for (const sec of ["feature", "items"]) {
      const host = document.getElementById("host_" + sec); const s = host.querySelector("#sec"); if (!s) continue;
      s.style.width = dw + "px"; s.style.transformOrigin = "top left"; s.style.transform = "scale(" + scale + ")";
      host.style.width = dw * scale + "px"; host.style.height = s.getBoundingClientRect().height + "px";
    }
  }

  // 絶対配置（M2・足した部品）の top/left を入れ、セクションを必要なら伸ばす（§1.1）。IME 変換中は呼ばない。
  function placeAbsolute(R) {
    R = R || reduce(activeOps());
    layoutCount++;
    appliedPlace = {};
    for (const sec of ["feature", "items"]) {
      const s = secNode(sec); if (!s) continue;
      const flow = rawGeomOf(sec);
      // '@left' の x を、付いていく先の左端で埋める
      const overrides = {};
      for (const [id, ov] of Object.entries(R.m2)) if (secOf(id) === sec) overrides[id] = ov;
      for (const a of R.added) if (a.section === sec) overrides[a.id] = { anchor: a.anchor, gapY: a.gap, x: a.x === "@left" ? (flow[a.anchor]?.x ?? 0) : a.x };
      const placed = M.placeAnchored(flow, overrides);
      const bottoms = {};
      for (const [id, pos] of Object.entries(placed)) {
        const w = s.querySelector('.absitem[data-absid="' + id + '"]'); if (!w) continue;
        w.style.top = pos.top + "px"; w.style.left = pos.left + "px";
        appliedPlace[id] = pos;
        const el = w.querySelector("[data-el]"); const h = el ? el.getBoundingClientRect().height / scale : 0;
        bottoms[id] = pos.top + h;
      }
      // セクション伸長
      const stack = s.querySelector(".stack");
      const templateH = stack ? stack.getBoundingClientRect().height / scale : s.getBoundingClientRect().height / scale;
      const minH = M.sectionMinHeight(templateH, bottoms, document.getElementById("host_" + sec)._padBottom || 0);
      s.style.minHeight = minH + "px";
      document.getElementById("host_" + sec).style.height = s.getBoundingClientRect().height + "px";
    }
  }

  // セクション内の実測（縮小前・#sec 起点）
  function rawGeomOf(sec) {
    const out = {}; const s = secNode(sec); if (!s) return out;
    const sr = s.getBoundingClientRect(); const R = (n) => Math.round((n / scale) * 100) / 100;
    for (const el of s.querySelectorAll("[data-el]")) { const r = el.getBoundingClientRect(); out[el.getAttribute("data-el")] = { x: R(r.left - sr.left), y: R(r.top - sr.top), w: R(r.width), h: R(r.height), kind: el.getAttribute("data-kind") }; }
    return out;
  }
  function geometry() { return { ...rawGeomOf("feature"), ...rawGeomOf("items") }; }
  function sections() {
    const out = {}; let topAcc = 0;
    for (const sec of ["feature", "items"]) { const s = secNode(sec); if (!s) continue; const h = s.getBoundingClientRect().height / scale; out[sec] = { top: +topAcc.toFixed(2), height: +h.toFixed(2) }; topAcc += h; }
    return out;
  }

  function warnings() {
    const g = geometry(); const items = Object.entries(g).filter(([, e]) => ["text", "photo", "pill"].includes(e.kind));
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const [ai, a] = items[i], [bi, b] = items[j]; if (secOf(ai) !== secOf(bi)) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= 1 || oy <= 1) continue;
      const contains = (p, q) => p.x <= q.x + 1 && p.y <= q.y + 1 && p.x + p.w >= q.x + q.w - 1 && p.y + p.h >= q.y + q.h - 1;
      if (contains(a, b) || contains(b, a)) continue;
      overlaps.push({ a: ai, b: bi });
    }
    // はみ出しは横だけ見る（§1.1：下方向はセクションが伸びるので警告しない）
    const overflows = [];
    for (const [id, e] of items) if (e.x < -1 || e.x + e.w > SPEC.DESIGN_W[state.device] + 1) overflows.push({ id, edge: "横" });
    return { overlaps, overflows };
  }

  // ---- 付いていく先の一覧（§7 anchors）----
  function anchorsList() {
    const R = reduce(activeOps()); const out = [];
    for (const [id, m] of Object.entries(R.m1)) out.push({ part: id, partName: M.friendly(id), mode: "M1", dx: m.dx, dy: m.dy });
    for (const [id, ov] of Object.entries(R.m2)) out.push({ part: id, partName: M.friendly(id), mode: "M2", anchor: ov.anchor, anchorName: M.friendly(ov.anchor), gapY: ov.gapY, x: ov.x });
    for (const a of R.added) out.push({ part: a.id, partName: M.friendly(a.id), mode: "M2", anchor: a.anchor, anchorName: M.friendly(a.anchor), gapY: a.gap, x: a.x, added: true });
    return out;
  }

  // ---- 選択・印・付いていく先の表示 ----
  function decorate() {
    const R = reduce(activeOps());
    const manual = new Set([...Object.keys(R.m1), ...Object.keys(R.m2), ...R.clear, ...R.remove]);
    // 足した部品：置いた端末だけ手動印
    for (const a of R.adds) if (!R.remove.includes(a.id)) { const moved = R.m2[a.id] || R.m1[a.id]; if (a.placedDevice === state.device || moved) manual.add(a.id); }
    document.querySelectorAll(".mark-manual,.mark-warn,.mark-sel,.mark-anchor,.anchor-line,.anchor-label").forEach((n) => { if (n.classList.contains("anchor-line") || n.classList.contains("anchor-label")) n.remove(); else n.classList.remove("mark-manual", "mark-warn", "mark-sel", "mark-anchor"); });
    for (const id of manual) { const n = elNode(id); if (n) n.classList.add("mark-manual"); }
    for (const w of warnings().overlaps) [w.a, w.b].forEach((id) => { const n = elNode(id); if (n) n.classList.add("mark-warn"); });
    for (const id of state.selected) { const n = elNode(id); if (n) n.classList.add("mark-sel"); }
    if (!drag && !state.editing) for (const id of state.selected) { const c = canonId(id); if (R.m2[c] || R.added.find((a) => a.id === c && a.placedDevice === state.device)) showAnchorHint(c); }
  }

  function showAnchorHint(id, prospective) {
    const g = geometry(); const part = g[id]; if (!part) return;
    let anchorId, gapY;
    if (prospective) { anchorId = prospective.anchor; gapY = prospective.gapY; }
    else { const R = reduce(activeOps()); const ov = R.m2[id] || R.added.find((a) => a.id === id); if (!ov) return; anchorId = ov.anchor; gapY = ov.gapY ?? ov.gap; }
    const sec = secOf(id); const s = secNode(sec); if (!s) return;
    const a = anchorId === "@section" ? { x: part.x, y: 0, w: part.w, h: 0 } : g[anchorId];
    if (a && anchorId !== "@section") { const an = elNode(anchorId); if (an) an.classList.add("mark-anchor"); }
    const ax = a ? a.x + a.w / 2 : part.x; const aBottom = a ? a.y + a.h : 0;
    const line = document.createElement("div"); line.className = "anchor-line";
    line.style.cssText = `position:absolute;left:${Math.min(ax, part.x + part.w / 2)}px;top:${aBottom}px;width:${Math.max(1, Math.abs((part.x + part.w / 2) - ax))}px;height:${Math.max(1, part.y - aBottom)}px;border-left:2px dashed #06c;pointer-events:none;z-index:5`;
    const label = document.createElement("div"); label.className = "anchor-label"; label.textContent = M.friendly(anchorId) + "の下に付いていきます";
    label.style.cssText = `position:absolute;left:${part.x}px;top:${Math.max(0, part.y - 22)}px;font:12px/1.4 sans-serif;color:#06c;background:#eaf2ff;border:1px solid #06c;border-radius:4px;padding:1px 5px;white-space:nowrap;pointer-events:none;z-index:6`;
    s.appendChild(line); s.appendChild(label);
  }

  // ---- 選択（DOM を作り直さない＝ダブルクリックの対象が入れ替わらない・IME も壊さない）----
  function refreshSel() { decorate(); if (typeof onRender === "function") onRender(); }
  function selectOnly(id) { state.selectedSection = null; state.selected = new Set([canonId(id)]); refreshSel(); }
  function toggleSel(id) { state.selectedSection = null; const c = canonId(id); state.selected.has(c) ? state.selected.delete(c) : state.selected.add(c); refreshSel(); }
  function selectMany(ids) { state.selectedSection = null; state.selected = new Set(ids.map(canonId)); refreshSel(); }
  function clearSel() { state.selected = new Set(); state.selectedSection = null; refreshSel(); }
  function selectSection(sec) { state.selectedSection = sec; state.selected = new Set(); refreshSel(); }

  // ---- 履歴 ----
  function commit(op) { state.ops = state.ops.slice(0, state.cursor); state.ops.push(op); state.cursor++; render(); }
  function undo() { if (state.editing) return; if (state.cursor > 0) { state.cursor--; render(); } }
  function redo() { if (state.editing) return; if (state.cursor < state.ops.length) { state.cursor++; render(); } }
  function reset() { state.ops = []; state.cursor = 0; state.selected = new Set(); state.editing = null; render(); }
  function setDevice(d) { if (state.editing) commitEdit(); state.device = d; render(); }

  // ---- ドラッグ（M1/M2 を離した位置で判定）----
  let drag = null;
  function beginDrag(clientX, clientY) {
    const ids = [...state.selected].filter(isDraggable); if (!ids.length) return false;
    const baseT = {}; for (const id of ids) { const n = elNode(id); baseT[id] = curTranslate(n); }
    drag = { ids, sx: clientX, sy: clientY, lx: clientX, ly: clientY, baseT, origGeom: geometry() }; return true;
  }
  function curTranslate(n) { if (!n) return { tx: 0, ty: 0 }; const t = n.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/); return t ? { tx: +t[1], ty: +t[2] } : { tx: 0, ty: 0 }; }
  function dragMove(clientX, clientY) {
    if (!drag) return; drag.lx = clientX; drag.ly = clientY;
    const dx = (clientX - drag.sx) / scale, dy = (clientY - drag.sy) / scale;
    for (const id of drag.ids) { const n = elNode(id); if (n) n.style.transform = `translate(${drag.baseT[id].tx + dx}px,${drag.baseT[id].ty + dy}px)`; }
    document.querySelectorAll(".anchor-line,.anchor-label,.mark-anchor").forEach((n) => { if (n.classList.contains("mark-anchor")) n.classList.remove("mark-anchor"); else n.remove(); });
    const g = geometry();
    for (const id of drag.ids) { if (classify(g, id) === "M2") { const pr = M.reanchor(g, id, secOf(id)); if (pr) showAnchorHint(id, pr); } }
  }
  function classify(g, id) { if (isAdded(id)) return "M2"; return M.classifyDrop(g, id, drag ? drag.ids : [id], drag ? drag.origGeom : g); }
  function endDrag() {
    if (!drag) return;
    const dx = (drag.lx - drag.sx) / scale, dy = (drag.ly - drag.sy) / scale;
    if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) { drag = null; render(); return; }
    const g = geometry(); const items = [];
    // まず M1/M2 を判定
    const decided = drag.ids.map((id) => ({ id, mode: classify(g, id) }));
    // M2 のものは、元スロットを外した後の見た目から付いていく先を取り直す（H1 を詰め直し後で保つ）
    const anyM2 = decided.some((d) => d.mode === "M2");
    if (anyM2) {
      // 暫定：M2 は今の絶対座標（@abs）で置き、M1 はオフセットで置いて実測 → reanchor
      const tmp = { t: "move", device: state.device, items: decided.map((d) => d.mode === "M1" ? { id: d.id, mode: "M1", dx: Math.round(drag.baseT[d.id].tx + dx), dy: Math.round(drag.baseT[d.id].ty + dy) } : { id: d.id, mode: "M2", anchor: "@abs", gapY: g[d.id].y, x: g[d.id].x }) };
      state.ops = state.ops.slice(0, state.cursor); state.ops.push(tmp); state.cursor++;   // redo 履歴を切る
      render();
      const g2 = geometry();
      const finalItems = decided.map((d) => {
        if (d.mode === "M1") { const m = reduce(activeOps()).m1[d.id] || { dx: 0, dy: 0 }; return { id: d.id, mode: "M1", dx: m.dx, dy: m.dy }; }
        const pr = M.reanchor(g2, d.id, secOf(d.id)); return { id: d.id, mode: "M2", anchor: pr.anchor, gapY: pr.gapY, x: pr.x };
      });
      // 暫定 op を確定 op に置き換え
      state.ops[state.cursor - 1] = { t: "move", device: state.device, items: finalItems };
      drag = null; render();
    } else {
      for (const d of decided) { const bt = drag.baseT[d.id]; items.push({ id: d.id, mode: "M1", dx: Math.round(bt.tx + dx), dy: Math.round(bt.ty + dy) }); }
      drag = null; commit({ t: "move", device: state.device, items });
    }
  }

  // 範囲選択（矩形は screen 座標→ここでは design 矩形を受ける）
  function selectInDesignRect(sec, r) {
    const g = rawGeomOf(sec); const chosen = [];
    for (const [id, e] of Object.entries(g)) { const c = canonId(id); if (!isDraggable(c) || REPEAT.test(id)) continue; if (e.x >= r.x - 0.5 && e.y >= r.y - 0.5 && e.x + e.w <= r.x + r.w + 0.5 && e.y + e.h <= r.y + r.h + 0.5) if (!chosen.includes(c)) chosen.push(c); }
    return chosen;
  }

  // ---- 矢印キー・削除（M1 として）----
  function nudge(id, dx, dy) {
    const c = canonId(id); const R = reduce(activeOps());
    if (R.m2[c]) { const ov = R.m2[c]; commit({ t: "move", device: state.device, items: [{ id: c, mode: "M2", anchor: ov.anchor, gapY: ov.gapY, x: ov.x + dx }] }); if (dy) { const ov2 = reduce(activeOps()).m2[c]; commit({ t: "move", device: state.device, items: [{ id: c, mode: "M2", anchor: ov2.anchor, gapY: ov2.gapY + dy, x: ov2.x }] }); } return; }
    const m = R.m1[c] || { dx: 0, dy: 0 };
    commit({ t: "move", device: state.device, items: [{ id: c, mode: "M1", dx: m.dx + dx, dy: m.dy + dy }] });
  }
  function nudgeSelected(dx, dy) { const ids = [...state.selected].filter(isDraggable); if (!ids.length) return; const R = reduce(activeOps()); const items = ids.map((c) => { const m = R.m1[c] || { dx: 0, dy: 0 }; return { id: c, mode: "M1", dx: m.dx + dx, dy: m.dy + dy }; }); commit({ t: "move", device: state.device, items }); }
  function deleteSelected() { const ids = [...state.selected].filter((id) => isDraggable(id) || REPEAT.test(id)); if (!ids.length) return; for (const id of ids) commit({ t: "del", id: canonId(id) }); state.selected = new Set(); render(); }

  // ---- その場書き換え ----
  function rawText(id, R) {
    R = R || reduce(activeOps());
    if (id === "F_h0") return R.content.feature.blocks[0].heading;
    if (id === "F_b0") return R.content.feature.blocks[0].body;
    if (id === "F_h1") return R.content.feature.blocks[1].heading;
    if (id === "F_b1") return R.content.feature.blocks[1].body;
    let m; if ((m = id.match(/^card_(name|desc|price)_(.+)$/))) { const c = R.content.items.cards.find((c) => c.id === m[2]); return c ? c[m[1]] : ""; }
    const a = R.adds.find((a) => a.id === id); if (a) return R.editMap[id] != null ? R.editMap[id] : a.text;
    return elNode(id)?.textContent || "";
  }
  function startEdit(id) {
    const c = canonId(id); const n = elNode(c); if (!n || !isText(c)) return;
    if (state.editing) commitEdit();
    state.editing = { id: c };
    n.textContent = rawText(c);                 // 改行規則を外した素の文字（§2）
    n.setAttribute("contenteditable", "true");
    n.style.whiteSpace = "pre-wrap"; n.style.wordBreak = "normal"; n.style.outline = "2px solid #06c";
    n.focus();
    const range = document.createRange(); range.selectNodeContents(n); range.collapse(false);
    const selc = window.getSelection(); selc.removeAllRanges(); selc.addRange(range);
    n.oninput = (e) => { if (composing || (e && e.isComposing)) return; liveReflow(); };  // 変換中は再配置しない（§2.1）
    n.oncompositionstart = () => { composing = true; };
    n.oncompositionend = () => { composing = false; liveReflow(); };
    n.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); commitEdit(); } };
  }
  function liveReflow() { placeAbsolute(); if (typeof onRender === "function") onRender(); }
  function commitEdit() {
    if (!state.editing) return; const id = state.editing.id; const n = elNode(id);
    const text = n ? n.innerText.replace(/\n+$/,"") : rawText(id);
    state.editing = null; if (n) { n.oninput = n.oncompositionstart = n.oncompositionend = n.onkeydown = null; n.removeAttribute("contenteditable"); }
    commit({ t: "edit", id, text });          // 改行規則を当て直して再描画
  }
  function editApi(id, text) { commit({ t: "edit", id: canonId(id), text }); } // 記録つき書き換え（§7 edit）

  // ---- クリップボード ----
  function copySelection() {
    const ids = [...state.selected]; if (!ids.length) return;
    if (ids.length === 1 && REPEAT.test(ids[0])) { state.clipboard = { kind: "card", cardId: cardIdOf(ids[0]) }; return; }
    const g = geometry(); const parts = ids.filter(isDraggable).map((id) => ({ id, kind: kindOf(id), text: isText(id) ? rawText(id) : null, x: g[id].x, y: g[id].y, w: g[id].w, h: g[id].h }));
    if (parts.length) state.clipboard = { kind: "parts", parts };
  }
  function cutSelection() { copySelection(); deleteSelected(); }
  function paste() {
    const cb = state.clipboard; if (!cb) return;
    if (cb.kind === "card") { duplicateCard(cb.cardId); return; }
    const g = geometry(); const base = cb.parts[0];
    const targetSec = state.selectedSection || secOf(base.id);
    const moveToOtherSec = targetSec !== secOf(base.id);
    const newIds = [];
    for (const p of cb.parts) {
      const id = "add_" + (++state.addSeq);
      const targetX = moveToOtherSec ? (state.device === "pc" ? 56 : 20) : p.x + 16;
      const targetY = moveToOtherSec ? 60 : p.y + 16;      // 別セクションに貼るときは上の方に置いて付いていく先を取り直す
      const tmpG = { ...g, [id]: { x: targetX, y: targetY, w: p.w, h: p.h, kind: p.kind === "photo" ? "photo" : "text" } };
      const pr = M.reanchor(tmpG, id, targetSec) || { anchor: "@section", gapY: targetY, x: targetX };
      commit({ t: "add", id, section: targetSec, kind: p.kind === "photo" ? "photo" : "text", styleName: styleOf(p.id), w: p.w, text: p.text || "", anchor: pr.anchor, gap: pr.gapY, placedDevice: state.device, x: targetX });
      newIds.push(id);
    }
    selectMany(newIds);
  }
  function duplicate() { const ids = [...state.selected]; if (ids.length === 1 && REPEAT.test(ids[0])) { duplicateCard(cardIdOf(ids[0])); return; } copySelection(); paste(); }
  function duplicateCard(cid) {
    const R = reduce(activeOps()); const card = R.content.items.cards.find((c) => c.id === cid); if (!card) return;
    const nc = clone(card); nc.id = "c_dup" + (++state.addSeq);
    commit({ t: "addCard", after: cid, card: nc });
  }
  const cardIdOf = (id) => (id.match(/^(?:card|row)_(?:photo|name|desc|price|vline)?_?(.+)$/) || [])[1] || id.replace(/^card_[a-z]+_/, "");
  const kindOf = (id) => (/^F_p|^I_.*photo|photo/.test(id) ? "photo" : "text");
  const styleOf = (id) => (/_h\d$/.test(id) || id === "F_h0" ? "featHead" : "featBody");

  // ---- 戻す（§4）----
  function resetScope(scope, id, devices) { commit({ t: "resetScope", scope, id: id || (scope === "part" ? [...state.selected][0] : "F_h0"), devices: devices || [state.device] }); }
  // 元の配置を見る（押している間だけ）
  function peekOn() { state.peek = true; render(); }   // 手で動かした部品を元の位置で見せる（記録は変えない）
  function peekOff() { state.peek = false; render(); }

  // ---- テキスト追加ツール（ツールバー）----
  function addTextAt(markerId, gap, text) {
    const g = geometry(); const a = g[markerId]; if (!a) return;
    const id = "add_" + (++state.addSeq);
    const w = state.device === "pc" ? 600 : 351;
    commit({ t: "add", id, section: secOf(markerId), kind: "text", styleName: "featBody", w, text: text || "テキスト", anchor: markerId, gap: gap ?? 24, placedDevice: state.device, x: a.x });
    selectOnly(id);
    startEdit(id);
  }

  // ---- 試験の再現（Q1〜Q8 の並び。runPreset は実操作に近い形で流す）----
  function presets() {
    return {
      Q1: [{ act: "move", id: "F_h0", by: [12, 8] }, { act: "editAppend", id: "F_b0", add: S1_ADD }],
      Q2: [{ act: "moveToBelow", id: "F_b0", target: "F_p0", gap: 24, alignLeft: "F_p0" }, { act: "edit", id: "F_h0", text: S2_HEAD }],
      Q3: [{ act: "moveGroupBelow", ids: ["F_h0", "F_b0"], target: "F_p0", gap: 24, alignLeft: "F_p0" }, { act: "edit", id: "F_h0", text: S2_HEAD }],
      Q4: [{ act: "editAppend", id: "F_b0", add: S1_ADD }],
      Q5: [{ act: "editAppend", id: "F_b0", add: "季節の意匠。" }],
      Q6: [{ act: "addBelow", marker: "I_divider", gap: 24, text: "季節により品が替わります" }, { act: "moveAddedBelowSection", extra: 80 }],
      Q7: [{ act: "move", id: "F_h0", by: [12, 8] }],
      Q8: [{ act: "move", id: "F_h0", by: [12, 8] }],
    };
  }
  async function runPreset(name) {
    reset();
    for (const step of presets()[name]) await runStep(step);
  }
  async function runStep(step) {
    const g = geometry();
    if (step.act === "move") { const c = canonId(step.id); const cur = g[c]; programMove([c], (id) => ({ x: g[id].x + step.by[0], y: g[id].y + step.by[1] })); }
    else if (step.act === "moveToBelow") { const t = g[step.target]; programMove([step.id], () => ({ x: g[step.alignLeft].x, y: t.y + t.h + step.gap })); }
    else if (step.act === "moveGroupBelow") { const t = g[step.target]; const stackTop = t.y + t.h + step.gap; programMove(step.ids, (id, i) => ({ x: g[step.alignLeft].x, y: stackTop + i * (g[id].h + 8) })); }
    else if (step.act === "edit") editApi(step.id, step.text);
    else if (step.act === "editAppend") editApi(step.id, rawText(canonId(step.id)) + step.add);
    else if (step.act === "addBelow") addTextAtSilent(step.marker, step.gap, step.text);
    else if (step.act === "moveAddedBelowSection") { const R = reduce(activeOps()); const last = R.adds[R.adds.length - 1]; if (last) { const s = sections()[secOf(last.id)]; const targetY = s.height + step.extra; programMove([last.id], () => ({ x: g[last.id].x, y: targetY })); } }
  }
  function addTextAtSilent(markerId, gap, text) { const g = geometry(); const a = g[markerId]; const id = "add_" + (++state.addSeq); const w = state.device === "pc" ? 600 : 351; commit({ t: "add", id, section: secOf(markerId), kind: "text", styleName: "featBody", w, text, anchor: markerId, gap: gap ?? 24, placedDevice: state.device, x: a.x }); }
  // ボタン/プリセット用：目標位置へ動かす（M1/M2 は c3-edit が判定）
  function programMove(ids, targetOf) {
    ids = ids.map(canonId); state.selected = new Set(ids); render();
    const g = geometry();
    for (const id of ids) { const n = elNode(id); const tg = targetOf(id, ids.indexOf(id)); if (n) n.style.transform = `translate(${(appliedPlace[id] ? 0 : 0) + (tg.x - g[id].x)}px,${tg.y - g[id].y}px)`; }
    const g2 = geometry();
    const decided = ids.map((id) => ({ id, mode: isAdded(id) ? "M2" : M.classifyDrop(g2, id, ids, g) }));
    if (decided.some((d) => d.mode === "M2")) {
      const tmp = { t: "move", device: state.device, items: decided.map((d) => d.mode === "M1" ? { id: d.id, mode: "M1", dx: Math.round(g2[d.id].x - g[d.id].x), dy: Math.round(g2[d.id].y - g[d.id].y) } : { id: d.id, mode: "M2", anchor: "@abs", gapY: g2[d.id].y, x: g2[d.id].x }) };
      state.ops = state.ops.slice(0, state.cursor); state.ops.push(tmp); state.cursor++; render();
      const g3 = geometry();
      const finalItems = decided.map((d) => d.mode === "M1" ? { id: d.id, mode: "M1", dx: Math.round(g2[d.id].x - g[d.id].x), dy: Math.round(g2[d.id].y - g[d.id].y) } : (() => { const pr = M.reanchor(g3, d.id, secOf(d.id)); return { id: d.id, mode: "M2", anchor: pr.anchor, gapY: pr.gapY, x: pr.x }; })());
      state.ops[state.cursor - 1] = { t: "move", device: state.device, items: finalItems }; render();
    } else {
      commit({ t: "move", device: state.device, items: decided.map((d) => ({ id: d.id, mode: "M1", dx: Math.round(g2[d.id].x - g[d.id].x), dy: Math.round(g2[d.id].y - g[d.id].y) })) });
    }
  }

  function applyOps(ops) { state.ops = clone(ops); state.cursor = ops.length; state.selected = new Set(); render(); return Promise.resolve(); }

  const api = {
    reset, setDevice, geometry, sections, warnings, anchors: anchorsList,
    ops: () => clone(activeOps()), presets, runPreset,
    select: (ids) => selectMany(Array.isArray(ids) ? ids : [ids]),
    edit: editApi, resetScope, undo, redo, layoutCount: () => layoutCount,
    applyOps, peek: (on) => (on ? peekOn() : peekOff()),
  };
  return {
    state, render, reset, setDevice, undo, redo, commit, api, reduce, activeOps,
    canonId, isDraggable, isText, REPEAT, secOf, elNode, getScale: () => scale,
    beginDrag, dragMove, endDrag, isDragging: () => !!drag, selectOnly, toggleSel, selectMany, clearSel, selectSection, selectInDesignRect,
    startEdit, commitEdit, nudge, nudgeSelected, deleteSelected, copySelection, cutSelection, paste, duplicate,
    resetScope, peekOn, peekOff, addTextAt, anchorsList, classify: (id) => M.classifyDrop(geometry(), id, [id]),
  };
})();
window.__playground = PG.api;
