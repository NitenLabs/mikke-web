// 文字・写真を足す（置いた位置に）・写真の明るさ
// 線：A3｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- テキスト追加ツール（ツールバー）----
function addTextAt(markerId, gap, text) {
  const g = geometry(); const a = g[markerId]; if (!a) return;
  const id = "add_" + (++state.addSeq);
  const w = state.device === "pc" ? 600 : 351;
  commit({ t: "add", id, section: secOf(markerId), kind: "text", styleName: "featBody", w, text: text || "テキスト", anchor: markerId, gap: gap ?? 24, placedDevice: state.device, x: a.x });
  selectOnly(id);
  startEdit(id);
}

// ---- §5（試験台17）写真の明るさ ----
function setBrightness(id, v) { v = Math.max(-40, Math.min(40, Math.round(v / 20) * 20)); commit({ t: "bright", id: canonId(id), v }); }
function brightnessOf(id) { return (reduce(activeOps()).brightMap || {})[canonId(id)] || 0; }

// ---- §3/§4（試験台17）写真・文字を「置いた位置」に足す（絶対位置→手で離したときと同じ付いていく先）----
// 足した部品を中心(cx,cy・セクション内の設計px)へ動かした瞬間の付いていく先を取り、add op を書き換える（1操作=1undo・他の部品は動かさない）。
function finalizeAddedAt(id, cx, cy) {
  selectOnly(id);
  const g = geometry(); const e = g[id]; if (!e) return;
  const { left: cL, right: cR } = contentEdges();
  if (cx - e.w / 2 < cL) cx = cL + e.w / 2; if (cx + e.w / 2 > cR) cx = cR - e.w / 2;   // 中身の左右の端からはみ出さないように寄せる
  const n = elNode(id); const tx = cx - e.w / 2, ty = cy - e.h / 2;
  if (n) n.style.transform = "translate(" + (tx - e.x) + "px," + (ty - e.y) + "px)";
  const g2 = geometry(); const pr = reanchorX(g2, id);
  // add op：自動の基準（付いていく先・間隔16・左端そろえ）＋置いた端末の手直し位置（placed）。元に戻すと placed を捨て自動へ。
  for (let i = state.cursor - 1; i >= 0; i--) { const op = state.ops[i]; if (op.t === "add" && op.id === id) { op.anchor = pr.anchor; op.gap = 16; op.gapOther = 16; op.x = "@left"; op.placed = { device: state.device, anchor: pr.anchor, gapY: pr.gapY, x: pr.x }; break; } }
  render();
  // §2.4（X13）もう一方の端末・元に戻した後の自動の位置は「付いていく先のすぐ下16・左端そろえ」で固定し、
  // その下の重なる部品を押し下げる（placeAbsolute が描画時に行う＝手直しとして記録しない）。ここでは cascade 下げをしない。
}
function provAnchorOf(sec) { const inst = reduce(activeOps()).secList.find((s) => s.id === sec); const type = inst ? inst.type : "feature"; const pfx = (sec === "feature" || sec === "items") ? "" : sec + SEP; return withPfx(pfx, type === "feature" ? "F_hg" : "I_hg"); }
// 写真を足す：幅は PC の配置で中身の幅の半分・スマホで中身の幅いっぱい。高さは比のまま（幅の1.25倍を超えるときは枠を4:5）。
async function addPhotoAtPoint(file, sec, cx, cy) {
  const r = await loadImageFile(file); if (!r) return null;
  const here = state.device, other = here === "pc" ? "sp" : "pc";
  const dim = (dev) => { const CW = dev === "pc" ? 1326 : 351; const w = dev === "pc" ? Math.floor(CW / 2) : CW; let h = Math.round(r.h / r.w * w * 100) / 100; if (h > w * 1.25) h = Math.round(w * 1.25 * 100) / 100; return { w, h }; };
  const dH = dim(here), dO = dim(other);
  const id = "addp_" + (++state.addSeq);
  commit({ t: "add", id, section: sec, kind: "photo", asset: r.asset, w: dH.w, wOther: dO.w, h: dH.h, hOther: dO.h, text: "", anchor: provAnchorOf(sec), gap: 0, gapOther: 16, x: "@left", placedDevice: here });
  finalizeAddedAt(id, cx, cy);
  selectOnly(id);
  return id;
}
// 文字を足す：幅は PC 600・スマホ 351。置いたらすぐ書き換え（全選択）。空で終えたらなかったことに（commitEdit）。
// P13 上の「テキスト」から（opts.placeholder）は、空の箱に薄い「テキストを入力」を見せる。何も打たずに外を押したら消える（commitEdit）。
function addTextAtPoint(sec, cx, cy, opts) {
  const here = state.device; const w = here === "pc" ? 600 : 351; const wO = here === "pc" ? 351 : 600;
  const id = "add_" + (++state.addSeq);
  commit({ t: "add", id, section: sec, kind: "text", styleName: "featBody", w, wOther: wO, text: (opts && opts.placeholder) ? "" : "テキスト", anchor: provAnchorOf(sec), gap: 0, gapOther: 16, x: "@left", placedDevice: here });
  finalizeAddedAt(id, cx, cy);
  state.pendingNewText = id; selectOnly(id); startEdit(id, true);
  if (opts && opts.placeholder) a1MarkPlaceholder(id);
  return id;
}

