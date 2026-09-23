// 触って比べる層。配置と編集操作は SPEC/ABOX/CHYBRID（本線コードの束）に委ね、ここは
// 操作の記録→(content, edits)への還元→描画→計測→UI だけを持つ。方式Bは扱わない。
const PG = (function () {
  const MODELS = { A: ABOX, C: CHYBRID };
  // 芦屋堂の元コンテンツ（build 時に埋め込む CONTENT_JSON）
  const base = () => JSON.parse(JSON.stringify(CONTENT_JSON));

  // 中身を変える（scenarios.mjs と同じ文字＝compare と一致）
  const S1_ADD = "毎朝炊いた餡を、その日のうちにお出しします。手のひらにのる小さな菓子に、季節のうつろいを写します。四季折々の意匠をお楽しみください。";
  const S1B_ADD = ("職人が一つひとつ手で仕上げます。" + "餡は北海道産の小豆を毎朝炊きます。").repeat(7);
  const SCEN = {
    S1: (c) => { c.feature.blocks[0].body += S1_ADD; return c; },
    S1b: (c) => { c.feature.blocks[0].body += S1B_ADD; return c; },
    S2: (c) => { c.feature.blocks[0].heading = "季節の上生菓子と、その月だけの特別な意匠"; return c; },
    S3: (c) => { c.items.cards[0].desc = "本わらび粉だけを使い、ご注文をいただいてから一つずつ丁寧に切り分けてお出しします。"; return c; },
    S4: (c) => { c.items.cards.push({ id: "c_sakura", photo: { asset: "ast_frmx" }, name: "桜餅", desc: "道明寺の桜餅。", price: "250円（税込）" }); return c; },
  };
  const EXTRA_CARDS = [
    { id: "c_sakura", photo: { asset: "ast_frmx" }, name: "桜餅", desc: "道明寺の桜餅。", price: "250円（税込）" },
    { id: "c_wasan", photo: { asset: "ast_frmx" }, name: "和三盆 季節の干菓子", desc: "口どけの上品な干菓子。", price: "864円（税込）" },
    { id: "c_anmitsu", photo: { asset: "ast_frmx" }, name: "あんみつ", desc: "自家製の餡と寒天。", price: "800円（税込）" },
  ];

  // 状態：操作の並び（ops）だけを持ち、そこから content/edits を還元する
  let state = { model: "A", device: "pc", ops: [], selected: null };

  function reduce(ops) {
    const edits = { move: {}, moveOut: {}, remove: [], clear: [], template: {}, addText: null };
    const cfg = { bodyLevel: 0, heading2: false, card1desc2: false, cards: 3 };
    for (const op of ops) {
      if (op.t === "scenario") {
        if (op.name === "S1") cfg.bodyLevel = 1; else if (op.name === "S1b") cfg.bodyLevel = 2;
        else if (op.name === "S2") cfg.heading2 = true; else if (op.name === "S3") cfg.card1desc2 = true;
        else if (op.name === "S4") cfg.cards = 4;
      }
      else if (op.t === "bodyInc") cfg.bodyLevel = Math.min(2, cfg.bodyLevel + 1);
      else if (op.t === "bodyDec") cfg.bodyLevel = Math.max(0, cfg.bodyLevel - 1);
      else if (op.t === "heading2") cfg.heading2 = op.v !== false;
      else if (op.t === "card1desc2") cfg.card1desc2 = op.v !== false;
      else if (op.t === "cards") cfg.cards = op.n;
      else if (op.t === "headBody") edits.template.headBody = op.v;
      else if (op.t === "editRow") edits.template.cardPhotoH = op.photoH;
      else if (op.t === "move") edits.move[op.id] = { dx: op.dx, dy: op.dy };
      else if (op.t === "moveOut") edits.moveOut[op.id] = { marker: op.marker, gap: op.gap, x: op.x };
      else if (op.t === "remove") { if (!edits.remove.includes(op.id)) edits.remove.push(op.id); }
      else if (op.t === "clear") { if (!edits.clear.includes(op.id)) edits.clear.push(op.id); }
      else if (op.t === "unclear") edits.clear = edits.clear.filter((x) => x !== op.id);
      else if (op.t === "add") edits.addText = { marker: op.marker, gap: op.gap, x: op.x, y: op.y, w: op.w, text: op.text };
      else if (op.t === "reset") { delete edits.move[op.id]; delete edits.moveOut[op.id]; edits.remove = edits.remove.filter((x) => x !== op.id); edits.clear = edits.clear.filter((x) => x !== op.id); }
    }
    const content = base();
    if (cfg.bodyLevel >= 1) SCEN.S1(content);
    if (cfg.bodyLevel >= 2) SCEN.S1b(content);
    if (cfg.heading2) SCEN.S2(content);
    if (cfg.card1desc2) SCEN.S3(content);
    if (cfg.cards > 3) for (let i = 0; i < cfg.cards - 3; i++) content.items.cards.push(JSON.parse(JSON.stringify(EXTRA_CARDS[i % EXTRA_CARDS.length])));
    if (cfg.cards < 3) content.items.cards = content.items.cards.slice(0, cfg.cards);
    return { content, edits, cfg };
  }

  // 描画：feature と items を縮小コンテナに入れ、計測は縮小前の値で返す
  let scale = 1;
  function render() {
    const { content, edits } = reduce(state.ops);
    const M = MODELS[state.model];
    // addText の html/height を先に測る
    let e = edits;
    for (const sec of ["feature", "items"]) {
      const host = document.getElementById("host_" + sec);
      const meas = document.getElementById("meas");
      const boxes = M.collectTextBoxes(content, state.device);
      if (edits.addText && sec === "items") boxes.push({ key: "I_added", styleName: "featBody", device: state.device, widthPx: edits.addText.w, text: edits.addText.text });
      const H = TEXT.buildH(boxes, meas, SPEC);
      if (edits.addText && sec === "items") { const h = H.get("I_added"); e = { ...edits, addText: { ...edits.addText, html: h.html, height: h.height } }; }
      const out = (sec === "feature" ? M.buildFeature : M.buildItems)(content, state.device, H, e);
      host.innerHTML = out.bodyHtml;
    }
    layoutScale();
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
      host.style.height = s.getBoundingClientRect().height + "px"; // pre-scale height
      s.style.transformOrigin = "top left";
      s.style.transform = "scale(" + scale + ")";
      host.style.height = (s.getBoundingClientRect().height) + "px";
    }
  }

  function secOf(id) { return id.startsWith("F_") ? "feature" : "items"; }
  function elNode(id) { const h = document.getElementById("host_" + secOf(id)); return h ? h.querySelector('[data-el="' + id + '"]') : null; }

  // 計測（縮小前 px、セクション上端・左端から）
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
  // 警告（オーナー操作が原因の重なり・はみ出し）＝ geometry から算出（containment は除外）
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

  // 手で動かした/足した/外した部品＝点線、警告の部品＝赤枠
  function decorate() {
    const { edits } = reduce(state.ops);
    const manual = new Set([...Object.keys(edits.move), ...Object.keys(edits.moveOut), ...edits.clear, ...edits.remove]);
    if (edits.addText) manual.add("I_added");
    document.querySelectorAll(".mark-manual,.mark-warn,.mark-sel").forEach((n) => n.classList.remove("mark-manual", "mark-warn", "mark-sel"));
    for (const id of manual) { const n = elNode(id); if (n) n.classList.add("mark-manual"); }
    for (const w of warnings().overlaps) { [w.a, w.b].forEach((id) => { const n = elNode(id); if (n) n.classList.add("mark-warn"); }); }
    for (const w of warnings().overflows) { const n = elNode(w.id); if (n) n.classList.add("mark-warn"); }
    if (state.selected) { const n = elNode(state.selected); if (n) n.classList.add("mark-sel"); }
  }

  // ---- 操作を積む ----
  function push(op) { state.ops.push(op); render(); }
  function reset() { state.ops = []; state.selected = null; render(); }
  function undo() { state.ops.pop(); render(); }
  function setModel(m) { state.model = m; render(); }         // 操作列はそのまま＝相手方式でやり直し
  function setDevice(d) { state.device = d; render(); }

  function presets() {
    const dev = state.device;
    return {
      E1: [{ t: "scenario", name: "S1" }, { t: "move", id: "F_h0", dx: 12, dy: 8 }],
      E2: [{ t: "moveOut", id: "F_b0", marker: "F_p0", gap: 24, x: 755 }],
      E4: [{ t: "add", marker: "I_divider", gap: 24, x: dev === "pc" ? 56 : 20, y: dev === "pc" ? 988 : 1727, w: dev === "pc" ? 600 : 351, text: "季節により品が替わります" }, { t: "scenario", name: "S4" }],
      E5: [{ t: "remove", id: "F_p1" }],
      E5b: [{ t: "clear", id: "F_p1" }],
      E8: [{ t: "move", id: "F_h0", dx: 12, dy: 8 }, { t: "headBody", v: 24 }],
    };
  }
  function applyOps(ops) { state.ops = JSON.parse(JSON.stringify(ops)); state.selected = null; render(); return Promise.resolve(); }

  // ---- ドラッグ（塊の中の move＝ずらし）----
  function currentMove(id) { const m = reduce(state.ops).edits.move[id]; return m || { dx: 0, dy: 0 }; }
  function setMove(id, dx, dy) {
    // 同じ id の move は最後の1つに畳む
    state.ops = state.ops.filter((o) => !(o.t === "move" && o.id === id));
    state.ops.push({ t: "move", id, dx: Math.round(dx), dy: Math.round(dy) });
  }

  let opsPublic;
  const api = { setModel, setDevice, reset, applyOps, presets, geometry, warnings, ops: () => JSON.parse(JSON.stringify(state.ops)) };
  return { state, render, push, reset, undo, setModel, setDevice, presets, applyOps, geometry, warnings, currentMove, setMove, elNode, secOf, api, reduce, EXTRA_CARDS, getScale: () => scale };
})();
window.__playground = PG.api;
