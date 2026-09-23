// 触って比べる層 2（A と 新しい C=c2-select）。配置と編集操作は SPEC/ABOX/C2 （本線コードの束）に委ね、
// ここは 操作の記録→(content, edits)への還元→描画→追従の適用→計測→選択・ドラッグ・付いていく先 だけを持つ。
// 方式Bと前回のC（c-hybrid）はページから外す（作業票 §0-2）。
const PG = (function () {
  const MODELS = { A: ABOX, C2: C2 };
  const base = () => JSON.parse(JSON.stringify(CONTENT_JSON));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // 中身を変える文字（compare の scenarios と同じ＝実測が一致）
  const S1_ADD = "毎朝炊いた餡を、その日のうちにお出しします。手のひらにのる小さな菓子に、季節のうつろいを写します。四季折々の意匠をお楽しみください。";
  const S1B_ADD = ("職人が一つひとつ手で仕上げます。" + "餡は北海道産の小豆を毎朝炊きます。").repeat(7);
  const S2_HEAD = "季節の上生菓子と、その月だけの特別な意匠";
  const S3_DESC = "本わらび粉だけを使い、ご注文をいただいてから一つずつ丁寧に切り分けてお出しします。";
  const EXTRA_CARDS = [
    { id: "c_sakura", photo: { asset: "ast_frmx" }, name: "桜餅", desc: "道明寺の桜餅。", price: "250円（税込）" },
    { id: "c_wasan", photo: { asset: "ast_frmx" }, name: "和三盆 季節の干菓子", desc: "口どけの上品な干菓子。", price: "864円（税込）" },
    { id: "c_anmitsu", photo: { asset: "ast_frmx" }, name: "あんみつ", desc: "自家製の餡と寒天。", price: "800円（税込）" },
  ];

  const HG = { feature: "F_hg", items: "I_hg" };
  const DRAGGABLE = new Set(["F_hg", "F_p0", "F_h0", "F_b0", "F_p1", "F_h1", "F_b1", "I_hg", "I_divider", "I_kanmi", "I_time", "I_added"]);
  const HG_MEMBERS = { F_lbl: "F_hg", F_h: "F_hg", F_rule: "F_hg", I_lbl: "I_hg", I_h: "I_hg", I_rule: "I_hg" };
  const REPEAT = /^(card_|row_)/; // 品・表の行は1件ずつ選べない（作業票 §2）
  const canonId = (id) => HG_MEMBERS[id] || id;
  const isDraggable = (id) => DRAGGABLE.has(canonId(id));

  // 状態：操作の並び（ops）だけを持ち、そこから content/edits を還元する。selected は id の集合。
  let state = { model: "A", device: "pc", ops: [], selected: new Set(), addMode: false, groupSelectMode: false };
  let scale = 1;
  let appliedT = {}; // この描画で適用した transform（C2 の追従）。ドラッグの起点に使う。

  // ---- 操作列 → content / edits（device は move/add にのみ効く＝端末独立：F3）----
  function reduce(ops, device) {
    device = device || state.device;
    const cfg = { bodyLevel: 0, heading2: false, card1desc2: false, cards: 3 };
    const tpl = {}; const clearA = []; const removeA = [];
    const moveA = {}; const overrides = {}; let addText = null; let addTextOv = null;
    for (const op of ops) {
      switch (op.t) {
        case "scenario":
          if (op.name === "S1") cfg.bodyLevel = 1; else if (op.name === "S1b") cfg.bodyLevel = 2;
          else if (op.name === "S2") cfg.heading2 = true; else if (op.name === "S3") cfg.card1desc2 = true;
          else if (op.name === "S4") cfg.cards = 4; break;
        case "bodyInc": cfg.bodyLevel = Math.min(2, cfg.bodyLevel + 1); break;
        case "bodyDec": cfg.bodyLevel = Math.max(0, cfg.bodyLevel - 1); break;
        case "heading2": cfg.heading2 = op.v !== false; break;
        case "card1desc2": cfg.card1desc2 = op.v !== false; break;
        case "cards": cfg.cards = op.n; break;
        case "headBody": tpl.headBody = op.v; break;
        case "editRow": tpl.cardPhotoH = op.photoH; break;
        case "clear": if (!clearA.includes(op.id)) clearA.push(op.id); break;
        case "unclear": { const i = clearA.indexOf(op.id); if (i >= 0) clearA.splice(i, 1); } break;
        case "remove": if (!removeA.includes(op.id)) removeA.push(op.id); break;
        case "moveA": if (op.device === device) for (const it of op.items) moveA[it.id] = { dx: it.dx, dy: it.dy }; break;      // A：相対オフセット（1ドラッグ＝1op）
        case "moveC2": if (op.device === device) for (const it of op.items) overrides[it.id] = { anchor: it.anchor, gapY: it.gapY, x: it.x }; break; // C2：付いていく先（1ドラッグ＝1op）
        case "add": if (op.device === device) { addText = { marker: op.marker, gap: op.gap, x: op.x, y: op.y, w: op.w, text: op.text }; addTextOv = { anchor: op.marker, gapY: op.gap, x: op.x }; } break;
        case "reset":
          delete moveA[op.id]; delete overrides[op.id];
          { const i = clearA.indexOf(op.id); if (i >= 0) clearA.splice(i, 1); }
          { const j = removeA.indexOf(op.id); if (j >= 0) removeA.splice(j, 1); }
          if (op.id === "I_added") { addText = null; addTextOv = null; } break;
      }
    }
    const content = base();
    if (cfg.bodyLevel >= 1) content.feature.blocks[0].body += S1_ADD;
    if (cfg.bodyLevel >= 2) content.feature.blocks[0].body += S1B_ADD;
    if (cfg.heading2) content.feature.blocks[0].heading = S2_HEAD;
    if (cfg.card1desc2) content.items.cards[0].desc = S3_DESC;
    if (cfg.cards > 3) for (let i = 0; i < cfg.cards - 3; i++) content.items.cards.push(clone(EXTRA_CARDS[i % EXTRA_CARDS.length]));
    if (cfg.cards < 3) content.items.cards = content.items.cards.slice(0, cfg.cards);
    return { content, cfg, tpl, clear: clearA, remove: removeA, moveA, overrides, addText, addTextOv };
  }

  function secOf(id) { return id.startsWith("F_") || id === "F_added" ? "feature" : "items"; }
  function elNode(id) { const h = document.getElementById("host_" + secOf(id)); return h ? h.querySelector('[data-el="' + id + '"]') : null; }

  // ---- 描画：feature/items を縮小コンテナに入れ、C2 は描いた後で「付いていく先＋gap」に視覚移動（transform）----
  function render() {
    const R = reduce(state.ops);
    const M = MODELS[state.model];
    for (const sec of ["feature", "items"]) {
      const host = document.getElementById("host_" + sec);
      const meas = document.getElementById("meas");
      const boxes = M.collectTextBoxes(R.content, state.device);
      if (R.addText && sec === "items") boxes.push({ key: "I_added", styleName: "featBody", device: state.device, widthPx: R.addText.w, text: R.addText.text });
      const H = TEXT.buildH(boxes, meas, SPEC);
      let edits;
      if (state.model === "A") {
        // A の「動かす」は app 側で固定の視覚移動（transform）として当てる（a-box の編集ロジックは書き換えない／
        // これで見出し・本文だけでなく写真・見出しの組・区切り線・添え書きも動かせる＝F4）。よって move は渡さない。
        let at = null;
        if (R.addText && sec === "items") { const h = H.get("I_added"); at = { x: R.addText.x, y: R.addText.y, w: R.addText.w, text: R.addText.text, html: h.html, height: h.height }; }
        edits = { clear: R.clear, remove: R.remove, template: R.tpl, addText: at };
      } else {
        let at = null;
        if (R.addText && sec === "items") at = { marker: R.addText.marker, gap: R.addText.gap, x: R.addText.x, y: R.addText.y, w: R.addText.w, text: R.addText.text };
        edits = { clear: R.clear, remove: R.remove, template: R.tpl, addText: at };
      }
      const out = (sec === "feature" ? M.buildFeature : M.buildItems)(R.content, state.device, H, edits);
      host.innerHTML = out.bodyHtml;
    }
    layoutScale();
    // 動かした部品を視覚移動（transform）で置く。元の流れの箱は残る＝下の部品は動かない（H2）。
    appliedT = {};
    if (state.model === "A") {
      // A：固定の相対オフセット（付いていく先には従わない＝「その場に残る」）
      for (const [id, m] of Object.entries(R.moveA)) { const n = elNode(id); if (n) { n.style.transform = `translate(${m.dx}px,${m.dy}px)`; appliedT[id] = { tx: m.dx, ty: m.dy }; } }
    } else {
      // C2：素の実測（transform 前）→ 付いていく先の今の下端＋gap に置く（中身が変われば追従＝H3）
      const flow = geometry();
      const ov = { ...R.overrides };
      if (R.addTextOv) ov.I_added = R.addTextOv;
      const Ts = C2.placeOverrides(flow, ov);
      for (const [id, t] of Object.entries(Ts)) { const n = elNode(id); if (n) { n.style.transform = `translate(${t.tx}px,${t.ty}px)`; appliedT[id] = t; } }
    }
    decorate();
    if (typeof onRender === "function") onRender();
  }

  function layoutScale() {
    const dw = SPEC.DESIGN_W[state.device];
    const avail = document.getElementById("stage").clientWidth - 4;
    scale = Math.min(1, avail / dw);
    for (const sec of ["feature", "items"]) {
      const host = document.getElementById("host_" + sec);
      const s = host.querySelector("#sec");
      if (!s) continue;
      s.style.width = dw + "px";
      host.style.width = dw * scale + "px";
      host.style.height = s.getBoundingClientRect().height + "px";
      s.style.transformOrigin = "top left";
      s.style.transform = "scale(" + scale + ")";
      host.style.height = s.getBoundingClientRect().height + "px";
    }
  }

  // 計測（縮小前 px・#sec の上端/左端から。要素の transform も含む＝geometry は「今の見た目」）
  function geometry() {
    const out = {};
    for (const sec of ["feature", "items"]) {
      const s = document.getElementById("host_" + sec).querySelector("#sec"); if (!s) continue;
      const sr = s.getBoundingClientRect(); const R = (n) => Math.round((n / scale) * 100) / 100;
      for (const el of s.querySelectorAll("[data-el]")) {
        const r = el.getBoundingClientRect();
        out[el.getAttribute("data-el")] = { x: R(r.left - sr.left), y: R(r.top - sr.top), w: R(r.width), h: R(r.height), kind: el.getAttribute("data-kind") };
      }
    }
    return out;
  }

  // 警告（重なり・はみ出し）＝ geometry（今の見た目）から算出
  function warnings() {
    const g = geometry(); const items = Object.entries(g).filter(([, e]) => ["text", "photo", "pill"].includes(e.kind));
    const secW = { feature: SPEC.DESIGN_W[state.device], items: SPEC.DESIGN_W[state.device] };
    const overlaps = [], overflows = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const [ai, a] = items[i], [bi, b] = items[j]; if (secOf(ai) !== secOf(bi)) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= 1 || oy <= 1) continue;
      const contains = (p, q) => p.x <= q.x + 1 && p.y <= q.y + 1 && p.x + p.w >= q.x + q.w - 1 && p.y + p.h >= q.y + q.h - 1;
      if (contains(a, b) || contains(b, a)) continue;
      overlaps.push({ a: ai, b: bi });
    }
    for (const [id, e] of items) if (e.x < -1 || e.x + e.w > secW[secOf(id)] + 1) overflows.push({ id, edge: "セクションの外" });
    return { overlaps, overflows };
  }

  // ---- 選択・手動印・警告・付いていく先の描画 ----
  function decorate() {
    const R = reduce(state.ops);
    const manual = new Set([...Object.keys(R.moveA), ...Object.keys(R.overrides), ...R.clear, ...R.remove]);
    if (R.addText) manual.add("I_added");
    document.querySelectorAll(".mark-manual,.mark-warn,.mark-sel,.mark-anchor").forEach((n) => n.classList.remove("mark-manual", "mark-warn", "mark-sel", "mark-anchor"));
    document.querySelectorAll(".anchor-line,.anchor-label").forEach((n) => n.remove());
    for (const id of manual) { const n = elNode(id); if (n) n.classList.add("mark-manual"); }
    for (const w of warnings().overlaps) [w.a, w.b].forEach((id) => { const n = elNode(id); if (n) n.classList.add("mark-warn"); });
    for (const w of warnings().overflows) { const n = elNode(w.id); if (n) n.classList.add("mark-warn"); }
    for (const id of state.selected) { const n = elNode(id); if (n) n.classList.add("mark-sel"); }
    // ドラッグ中でなく、手で動かした/足した部品を選んでいるとき＝付いていく先を見せる（§3）
    if (!drag) for (const id of state.selected) {
      const c = canonId(id);
      if (R.overrides[c] || (c === "I_added" && R.addText)) showAnchorHint(c);
    }
  }

  // 付いていく先を「青枠＋下端→上端の点線＋ラベル」で見せる（§3）。design 座標で #sec に差し込む（scale と一緒に縮む）。
  function showAnchorHint(id, prospective) {
    const g = geometry();
    const part = g[id]; if (!part) return;
    let anchorId, gapY;
    if (prospective) { anchorId = prospective.anchor; gapY = prospective.gapY; }
    else {
      const R = reduce(state.ops);
      const ov = R.overrides[id] || (id === "I_added" ? R.addTextOv : null); if (!ov) return;
      anchorId = ov.anchor; gapY = ov.gapY;
    }
    const sec = secOf(id);
    const host = document.getElementById("host_" + sec); const s = host.querySelector("#sec"); if (!s) return;
    const a = anchorId === "@section" ? { x: part.x, y: 0, w: part.w, h: 0 } : g[anchorId];
    if (a) { const an = elNode(anchorId); if (an) an.classList.add("mark-anchor"); }
    const ax = a ? a.x + a.w / 2 : part.x + part.w / 2;
    const aBottom = a ? a.y + a.h : 0;
    const line = document.createElement("div");
    line.className = "anchor-line";
    line.style.cssText = `position:absolute;left:${Math.min(ax, part.x + part.w / 2)}px;top:${aBottom}px;width:${Math.max(1, Math.abs((part.x + part.w / 2) - ax))}px;height:${Math.max(1, part.y - aBottom)}px;border-left:2px dashed #06c;pointer-events:none;z-index:5`;
    const label = document.createElement("div");
    label.className = "anchor-label";
    label.textContent = C2.friendly(anchorId) + "の下に付いていきます";
    label.style.cssText = `position:absolute;left:${part.x}px;top:${Math.max(0, part.y - 22)}px;font:12px/1.4 sans-serif;color:#06c;background:#eaf2ff;border:1px solid #06c;border-radius:4px;padding:1px 5px;white-space:nowrap;pointer-events:none;z-index:6`;
    s.appendChild(line); s.appendChild(label);
  }

  // ---- 選択 ----
  function selectOnly(id) { state.selected = new Set([canonId(id)]); render(); }
  function toggleSel(id) { const c = canonId(id); state.selected.has(c) ? state.selected.delete(c) : state.selected.add(c); render(); }
  function selectMany(ids) { state.selected = new Set(ids.map(canonId).filter(isDraggable)); render(); }
  function clearSel() { state.selected = new Set(); render(); }

  // 範囲（PC）：枠に全体が入った draggable を選ぶ
  function selectInRect(rect) {
    const chosen = [];
    for (const [id, e] of Object.entries(geometry())) {
      const c = canonId(id); if (!isDraggable(c) || REPEAT.test(id)) continue;
      if (e.x >= rect.x - 0.5 && e.y >= rect.y - 0.5 && e.x + e.w <= rect.x + rect.w + 0.5 && e.y + e.h <= rect.y + rect.h + 0.5) chosen.push(c);
    }
    state.selected = new Set(chosen); render();
  }

  // ---- ドラッグ（選んだ部品だけを視覚移動＝穴を残す＝H2／離した位置にぴったり＝H1）----
  let drag = null; // {ids, sx, sy, lx, ly, baseT:{id->{tx,ty}}}
  function beginDrag(clientX, clientY) {
    const ids = [...state.selected].filter(isDraggable);
    if (!ids.length) return false;
    const baseT = {};
    for (const id of ids) baseT[id] = appliedT[id] ? { ...appliedT[id] } : { tx: 0, ty: 0 };
    drag = { ids, sx: clientX, sy: clientY, lx: clientX, ly: clientY, baseT };
    return true;
  }
  function dragMove(clientX, clientY) {
    if (!drag) return;
    drag.lx = clientX; drag.ly = clientY;
    const dx = (clientX - drag.sx) / scale, dy = (clientY - drag.sy) / scale;
    for (const id of drag.ids) { const n = elNode(id); if (n) n.style.transform = `translate(${drag.baseT[id].tx + dx}px,${drag.baseT[id].ty + dy}px)`; }
    // 付いていく先を見せる（C2 のみ・各部品について）
    document.querySelectorAll(".anchor-line,.anchor-label,.mark-anchor").forEach((n) => { if (n.classList.contains("mark-anchor")) n.classList.remove("mark-anchor"); else n.remove(); });
    if (state.model === "C2") { const g = geometry(); for (const id of drag.ids) { const pr = C2.reanchor(g, id, HG[secOf(id)]); if (pr) showAnchorHint(id, pr); } }
  }
  function endDrag() {
    if (!drag) return;
    const dx = (drag.lx - drag.sx) / scale, dy = (drag.ly - drag.sy) / scale;
    const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
    if (moved) {
      const cur = reduce(state.ops);
      if (state.model === "A") {
        const items = drag.ids.map((id) => { const b = cur.moveA[id] || { dx: 0, dy: 0 }; return { id, dx: Math.round(b.dx + dx), dy: Math.round(b.dy + dy) }; });
        state.ops.push({ t: "moveA", device: state.device, items });
      } else {
        const g = geometry(); const items = [];
        for (const id of drag.ids) { const pr = C2.reanchor(g, id, HG[secOf(id)]); if (pr) items.push({ id, anchor: pr.anchor, gapY: pr.gapY, x: pr.x }); }
        if (items.length) state.ops.push({ t: "moveC2", device: state.device, items });
      }
    }
    drag = null; render();
  }

  // ---- op を積む（1ドラッグ＝1op＝1回の「1つ戻す」で戻る）----
  function pushOp(op) { state.ops.push(op); render(); }

  // ボタン等からの「置きたい所へ動かす」（人の UI 用。方式ごとに翻訳＝F2）。ids を、現在の見た目から delta だけ動かす。
  function programMoveBy(ids, dx, dy) { state.selected = new Set(ids.map(canonId)); render(); const g0 = geometry(); applyProgram(ids, (id) => ({ x: g0[canonId(id)].x + dx, y: g0[canonId(id)].y + dy })); }
  function programMoveTo(id, target) { state.selected = new Set([canonId(id)]); render(); applyProgram([id], () => target); }
  function applyProgram(ids, targetOf) {
    const cur0 = reduce(state.ops);
    const g = geometry();
    if (state.model === "A") {
      const items = ids.map((id) => { const c = canonId(id); const b = cur0.moveA[c] || { dx: 0, dy: 0 }; const tg = targetOf(id); return { id: c, dx: Math.round(b.dx + (tg.x - g[c].x)), dy: Math.round(b.dy + (tg.y - g[c].y)) }; });
      state.ops.push({ t: "moveA", device: state.device, items });
    } else { // C2：一旦 transform を当てて「今の見た目」を作り、そこから付いていく先を取り直す
      for (const id of ids) { const c = canonId(id); const tg = targetOf(id); const n = elNode(c); if (n) n.style.transform = `translate(${(appliedT[c]?.tx || 0) + (tg.x - g[c].x)}px,${(appliedT[c]?.ty || 0) + (tg.y - g[c].y)}px)`; }
      const g3 = geometry(); const items = [];
      for (const id of ids) { const c = canonId(id); const pr = C2.reanchor(g3, c, HG[secOf(c)]); if (pr) items.push({ id: c, anchor: pr.anchor, gapY: pr.gapY, x: pr.x }); }
      if (items.length) state.ops.push({ t: "moveC2", device: state.device, items });
    }
    render();
  }

  // ---- 履歴 ----
  function reset() { state.ops = []; state.selected = new Set(); state.addMode = false; render(); }
  function undo() { state.ops.pop(); render(); }
  function setModel(m) { state.model = m; render(); }   // 操作列はそのまま＝相手方式でやり直し
  function setDevice(d) { state.device = d; render(); }
  function applyOps(ops) { state.ops = JSON.parse(JSON.stringify(ops)); state.selected = new Set(); render(); return Promise.resolve(); }

  // ---- 付いていく先の一覧（§5.3）----
  function anchorsList() {
    const R = reduce(state.ops); const out = [];
    for (const [id, ov] of Object.entries(R.overrides)) out.push({ part: id, partName: C2.friendly(id), anchor: ov.anchor, anchorName: C2.friendly(ov.anchor), gapY: ov.gapY, x: ov.x });
    if (R.addTextOv) out.push({ part: "I_added", partName: C2.friendly("I_added"), anchor: R.addTextOv.anchor, anchorName: C2.friendly(R.addTextOv.anchor), gapY: R.addTextOv.gapY, x: R.addTextOv.x });
    return out;
  }

  // ---- 試験の再現（人の UI 用。P1〜P8。中身の変化は content op で足す）----
  function presetOps() { return {
    P1: [{ sel: "F_h0", by: [12, 8] }, { op: { t: "scenario", name: "S1" } }],
    P2: [{ sel: ["F_h0", "F_b0"], by: [0, 40] }, { op: { t: "scenario", name: "S1" } }],
    P3: [{ sel: "F_b0", toBelow: "F_p0", gap: 24, alignLeft: "F_p0" }, { op: { t: "scenario", name: "S1" } }, { op: { t: "scenario", name: "S2" } }],
    P4: [{ addBelow: "I_divider", gap: 24, text: "季節により品が替わります" }, { op: { t: "scenario", name: "S4" } }],
    P5: [{ sel: "F_p0", by: [-60, 40] }, { op: { t: "scenario", name: "S1" } }],
    P6: [{ clear: "F_p1" }],
    P7: [{ sel: "F_h0", by: [12, 8] }, { op: { t: "headBody", v: 24 } }],
    P8: [{ sel: "F_h0", by: [12, 8] }],
  }; }
  function runPreset(name) {
    reset();
    for (const step of presetOps()[name]) {
      if (step.op) pushOp(step.op);
      else if (step.clear) pushOp({ t: "clear", id: step.clear });
      else if (step.addBelow) addBelow(step.addBelow, step.gap, step.text);
      else if (step.by) programMoveBy(Array.isArray(step.sel) ? step.sel : [step.sel], step.by[0], step.by[1]);
      else if (step.toBelow) { const g = geometry(); const a = g[step.toBelow]; programMoveTo(step.sel, { x: g[step.alignLeft].x, y: a.y + a.h + step.gap }); }
    }
  }

  // 足す文字（付いていく先＝marker・gap）。marker の下端＋gap の位置に置く。
  function addBelow(marker, gap, text) {
    const g = geometry(); const a = g[marker]; if (!a) return;
    const dev = state.device;
    const w = dev === "pc" ? 600 : 351; const x = dev === "pc" ? 56 : 20;
    state.ops = state.ops.filter((o) => o.t !== "add");
    state.ops.push({ t: "add", device: dev, marker, gap, x, y: a.y + a.h + gap, w, text });
    render();
  }

  const api = {
    setModel, setDevice, reset, applyOps, geometry, warnings,
    ops: () => JSON.parse(JSON.stringify(state.ops)),
    select: (ids) => selectMany(Array.isArray(ids) ? ids : [ids]),
    anchors: anchorsList,
    presets: presetOps, runPreset,
  };
  return {
    state, render, reset, undo, setModel, setDevice, applyOps, geometry, warnings, api,
    reduce, canonId, isDraggable, REPEAT, HG, secOf, elNode, getScale: () => scale,
    beginDrag, dragMove, endDrag, selectOnly, toggleSel, selectMany, clearSel, selectInRect,
    programMoveBy, programMoveTo, runPreset, addBelow, anchorsList,
    isDragging: () => !!drag,
  };
})();
window.__playground = PG.api;
