// 選択の印・つまみ・選ぶ/外す
// 線：A2｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- 選択・印・重なり順の表示（§2：赤い枠と「付いていく先」の札は出さない）----
function decorate() {
  const R = reduce(activeOps());
  const manual = new Set([...Object.keys(R.m1), ...Object.keys(R.m2), ...R.clear, ...R.remove]);
  // 足した部品：置いた端末だけ手動印
  for (const a of R.adds) if (!R.remove.includes(a.id)) { const moved = R.m2[a.id] || R.m1[a.id]; if (a.placedDevice === state.device || moved) manual.add(a.id); }
  document.querySelectorAll(".mark-manual,.mark-warn,.mark-sel,.mark-anchor,.anchor-line,.anchor-label,.sel-pad,.rz-handle,.snap-guide").forEach((n) => { if (n.classList.contains("anchor-line") || n.classList.contains("anchor-label") || n.classList.contains("sel-pad") || n.classList.contains("rz-handle") || n.classList.contains("snap-guide")) n.remove(); else n.classList.remove("mark-manual", "mark-warn", "mark-sel", "mark-anchor"); });
  if (state.preview || state.viewing) return;   // §22 §5 プレビュー中／§6 見るだけは編集の飾り（選んだ枠・つまみ・手動印）を出さない
  for (const id of manual) { const n = elNode(id); if (n) n.classList.add("mark-manual"); }
  // §2：赤い枠（.mark-warn）は出さない
  for (const id of state.selected) { const n = elNode(id); if (n) n.classList.add("mark-sel"); }
  // §4：重なり順（端末ごと）を z-index で当てる。M2 は絶対配置のラッパ(.absitem)へ、ほかは本体へ（static なら relative 化）
  for (const [id, z] of Object.entries(R.zmap || {})) { const n = elNode(id); if (!n) continue; const target = n.closest(".absitem") || n; if (getComputedStyle(target).position === "static") target.style.position = "relative"; target.style.zIndex = String(z); }
  // §2：つかめる範囲を広げた小さな部品は、選択の枠も広げた範囲で表示する
  const g = geometry();
  for (const id of state.selected) { const e = g[id]; if (!e) continue; const padX = e.w < 16 ? 8 : 0, padY = e.h < 16 ? 8 : 0; if (!padX && !padY) continue; const s = secNode(secOf(id)); if (!s) continue; const pad = document.createElement("div"); pad.className = "sel-pad"; pad.style.cssText = `position:absolute;left:${e.x - padX}px;top:${e.y - padY}px;width:${e.w + 2 * padX}px;height:${e.h + 2 * padY}px;outline:2px solid #06c;pointer-events:none;z-index:5`; s.appendChild(pad); }
  // §4：大きさのつまみ（1つだけ選ばれていて、大きさを変えられる部品のとき）。data-handle に向きを持つ。
  // P20 複数を選んだら、まとめた枠の4つの角につまみ（同じセクションの写真・文字だけのとき）
  if (state.selected.size > 1 && !state.editing) { const m = a2MultiParts(); const s = m && secNode(m.sec); if (s) { const hsz = +(HSZ / scale).toFixed(3); for (const dir of ["nw", "ne", "sw", "se"]) { const p = handlePoint(dir, m.U); const h = document.createElement("div"); h.className = "rz-handle"; h.setAttribute("data-handle", dir); h.setAttribute("data-handle-for", "@multi"); h.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;width:${hsz}px;height:${hsz}px;margin-left:${-hsz / 2}px;margin-top:${-hsz / 2}px;background:#fff;border:1.5px solid #06c;z-index:8;touch-action:none;cursor:${cursorFor(dir)}`; s.appendChild(h); } } }
  if (state.selected.size === 1 && !state.editing) { const id = [...state.selected][0]; const hs = handlesFor(id); const e = g[id]; if (hs.length && e) { const s = secNode(secOf(id)); const hsz = +(HSZ / scale).toFixed(3); if (s) for (const dir of hs) { const p = handlePoint(dir, e); const h = document.createElement("div"); h.className = "rz-handle"; h.setAttribute("data-handle", dir); h.setAttribute("data-handle-for", id); h.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;width:${hsz}px;height:${hsz}px;margin-left:${-hsz / 2}px;margin-top:${-hsz / 2}px;background:#fff;border:1.5px solid #06c;z-index:8;touch-action:none;cursor:${cursorFor(dir)}`; s.appendChild(h); } } }
}
// §4：どのつまみを出すか・位置・形
const HSZ = 14;
function resizableKind(id) { const c = canonId(id); if (c === "I_divider") return "line"; if (c === "I_pillbg") return "pill"; if (c === "I_cards") return "cards"; if (c === "I_table") return "table"; if (/^F_p\d$/.test(c) || /^addp_/.test(c)) return "photo"; if (REPEAT.test(c)) return null; if (isText(c) || isAdded(c)) return "text"; return null; }   // §20 品の並び・表＝左右の辺のつまみ
function handlesFor(id) { const k = resizableKind(id); if (k === "text") return ["nw", "ne", "sw", "se", "e", "w", "s"]; if (k === "photo") return ["nw", "ne", "sw", "se"]; if (k === "line" || k === "pill" || k === "cards" || k === "table") return ["e", "w"]; return []; }
// §20b §2.3/§2.4 値段を折らず1行に描くのに要る「表の幅」を、描かれている値段の箱の自然幅（折らない1行）から測る。
// 値段の箱＝表幅×249/968（PC）／表幅そのもの（SP）。いちばん広い行の値段で決まる。中身が無ければ従来の下限に戻す。
// 値段の文字の自然幅（折らない1行）を #meas で測る（buildH と同じ＝設計px・倍率で割らない）。いちばん広い行を返す。
function priceNatMax(device) {
  device = device || state.device;
  const meas = document.getElementById("meas"); if (!meas) return 0;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap";
  for (const d of SPEC.textDecls(device === "pc" ? "tPriceR" : "tPriceL", device)) { const i = d.indexOf(":"); probe.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
  meas.appendChild(probe);
  let maxNat = 0; const R = reduce(activeOps(), device);
  for (const inst of state.secList) {
    if (inst.type !== "items") continue;
    const rows = (R.secContent[inst.id] && R.secContent[inst.id].table) || [];
    for (const r of rows) { if (r.price == null) continue; probe.textContent = r.price; const w = probe.getBoundingClientRect().width; if (w > maxNat) maxNat = w; }
  }
  probe.remove();
  return maxNat;
}
function tableFitW(device) {
  device = device || state.device; const nat = priceNatMax(device);
  if (!nat) return device === "pc" ? 528 : 200;
  return device === "pc" ? nat * 968 / 249 : Math.max(200, nat);
}
// §20b §2.3 最小幅：品の並び＝1件120×列＋間、表＝どの行の値段も1行に入る幅（PC は値段欄=幅×249/968、SP は max(200, 値段1行)）
function minWidthOf(id) { const c = canonId(id); if (c === "I_cards") { const n = colsOf(c); return 120 * n + 24 * (n - 1); } if (c === "I_table") return tableFitW(state.device); return 40; }
function handlePoint(dir, e) { const xs = { w: e.x, e: e.x + e.w, n: e.x + e.w / 2, s: e.x + e.w / 2, nw: e.x, sw: e.x, ne: e.x + e.w, se: e.x + e.w, c: e.x + e.w / 2 }; const ys = { n: e.y, s: e.y + e.h, w: e.y + e.h / 2, e: e.y + e.h / 2, nw: e.y, ne: e.y, sw: e.y + e.h, se: e.y + e.h }; return { x: xs[dir], y: ys[dir] }; }
function cursorFor(dir) { return ({ n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" })[dir] || "pointer"; }

// ---- 選択（DOM を作り直さない＝ダブルクリックの対象が入れ替わらない・IME も壊さない）----
function refreshSel() { decorate(); if (typeof onRender === "function") onRender(); }
function selectOnly(id) { state.selectedSection = null; state.selected = new Set([canonId(id)]); refreshSel(); }
function toggleSel(id) { state.selectedSection = null; const c = canonId(id); state.selected.has(c) ? state.selected.delete(c) : state.selected.add(c); refreshSel(); }
function selectMany(ids) { state.selectedSection = null; state.selected = new Set(ids.map(canonId)); refreshSel(); }
function clearSel() { state.selected = new Set(); state.selectedSection = null; refreshSel(); }
function selectSection(sec) { state.selectedSection = sec; state.selected = new Set(); refreshSel(); }


// P22 戻す・やり直すの後、その操作の部品を選んだ状態にする（PowerPoint と同じ）。ページに見えない（消えた）部品は選ばない。
function a2SelectAfterHistory(op) {
  if (!op) return;
  const ids = op.ids ? op.ids : op.items ? op.items.map((it) => it.id) : op.id ? [op.id] : op.keys ? op.keys.map((k) => partIdOfBox(k)) : [];
  if (!ids.length || op.t === "section" || op.sec) return;
  const live = [...new Set(ids.map(canonId))].filter((id) => elNode(id)); if (!live.length) return;   // 消えた部品（足したのを戻した等）だけなら選択は変えない
  state.selectedSection = null; state.selected = new Set(live); refreshSel();
}
