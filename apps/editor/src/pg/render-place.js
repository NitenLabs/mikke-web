// 絶対配置の当てはめ・geometry・小さい部品のつかみ・セクション一覧・重なりの知らせ・付いていく先
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
function placeAbsolute(R) {
  R = R || reduce(activeOps());
  layoutCount++;
  appliedPlace = {};
  // §2.4（X13）前回の自動押し下げを一旦消して、素の流れで測る
  document.querySelectorAll("#stage .autopush").forEach((n) => { n.style.transform = ""; n.classList.remove("autopush"); });
  for (const inst of state.secList) {
    const sec = inst.id;
    const s = secNode(sec); if (!s) continue;
    const flow = rawGeomOf(sec);
    // '@left' の x を、付いていく先の左端で埋める
    const overrides = {};
    // P29 複製したセクション（非 anchor）の部品：読み込み直すと付いていく先が素の名前になるので、このセクションの部品に読み替える
    const ancOf = (k) => (k && !flow[k] && !isAdded(k) && flow[sec + SEP + k]) ? sec + SEP + k : k;
    for (const [id, ov] of Object.entries(R.m2)) if (secOf(id) === sec) { const an = ancOf(ov.anchor); overrides[id] = an === ov.anchor ? ov : { ...ov, anchor: an }; }
    for (const a of R.added) if (a.section === sec) { const an = ancOf(a.anchor); overrides[a.id] = { anchor: an, gapY: a.gap, x: a.x === "@left" ? (flow[an]?.x ?? 0) : a.x }; }
    const floats = [...R.added, ...(R.carried || [])].filter((a) => a.section === sec);   // J17 移ってきた部品も足した部品と同じ（付いていく先・自動の位置・押し下げ）
    for (const a of (R.carried || [])) if (a.section === sec) { const an = ancOf(a.anchor); overrides[a.id] = { anchor: an, gapY: a.gap, x: a.x === "@left" ? (flow[an]?.x ?? 0) : a.x }; }
    const placed = M.placeAnchored(flow, overrides);
    const bottoms = {};
    for (const [id, pos] of Object.entries(placed)) {
      const w = s.querySelector('.absitem[data-absid="' + id + '"]'); if (!w) continue;
      w.style.top = pos.top + "px"; w.style.left = pos.left + "px";
      appliedPlace[id] = pos;
      const el = w.querySelector("[data-el]"); const h = el ? el.getBoundingClientRect().height / scale : 0;
      bottoms[id] = pos.top + h;
    }
    // §2.4（X13）自動の位置に入れた足した部品は、その下で左右が重なる流れの部品を「足した部品の高さ＋16」だけ押し下げる（記録しない）
    const pushMap = {};
    for (const a of floats) {
      if (!a.isAuto) continue;
      const ap = placed[a.id]; if (!ap) continue;
      const aH = (bottoms[a.id] != null ? bottoms[a.id] - ap.top : 0); if (aH <= 0) continue;
      const aLeft = ap.left, aRight = ap.left + (a.w || 0);
      const anchorBottom = flow[a.anchor] ? flow[a.anchor].y + flow[a.anchor].h : ap.top;
      const push = aH + 16;
      for (const [fid, fe] of Object.entries(flow)) {
        if (fid === a.id || overrides[fid]) continue;                 // 足した部品・絶対配置（M2/added）は対象外
        if (!(isDraggable(canonId(fid)) || REPEAT.test(fid))) continue;
        if (fe.y < anchorBottom - 0.5) continue;                      // 入れた位置より上は対象外
        const ox = Math.min(aRight, fe.x + fe.w) - Math.max(aLeft, fe.x);
        if (ox <= 1) continue;                                        // 左右が重ならない＝対象外
        pushMap[fid] = (pushMap[fid] || 0) + push;
      }
    }
    for (const [fid, dy] of Object.entries(pushMap)) {
      const gp = groupOf(fid); if (gp && pushMap[gp]) continue;   // J17 品の並び・表ごと押し下げたら、中の1件は重ねて押さない（前は2倍下がり、下のボタンに重なることがあった）
      const el = s.querySelector('[data-el="' + fid + '"]'); if (!el) continue;
      el.style.transform = (el.style.transform ? el.style.transform + " " : "") + "translateY(" + dy + "px)";
      el.classList.add("autopush");
      const fe = flow[fid]; if (fe) bottoms["push_" + fid] = fe.y + fe.h + dy;
    }
    // §X18 押し下げた部品に付いていく絶対配置（M2・足した部品）も、付いていく先と同じだけ下げる（付いていく先をたどる）。
    // 手で動かしたずれ（付いていく先からの間隔 gapY）は変えない。記録しない＝足した部品を消せば pushMap が空になり自動で元に戻る。
    const followCache = {};
    const followPush = (fid) => {
      if (fid in followCache) return followCache[fid];
      followCache[fid] = 0;                                   // 循環よけ（同じ先を二度たどらない）
      const ov = overrides[fid];
      let v;
      if (!ov) v = pushMap[fid] || 0;                         // 流れの部品＝自分が押し下げられた量
      else if (ov.anchor === "@section" || ov.anchor === "@abs" || !flow[ov.anchor]) v = 0;
      else v = followPush(ov.anchor);                         // 付いていく先の押し下げ量をそのまま受け継ぐ
      return (followCache[fid] = v);
    };
    for (const id of Object.keys(placed)) {
      const extra = followPush(id); if (extra <= 0.5) continue;
      const w = s.querySelector('.absitem[data-absid="' + id + '"]'); if (!w) continue;
      const top = +(placed[id].top + extra).toFixed(2);
      w.style.top = top + "px";
      appliedPlace[id] = { top, left: placed[id].left };
      if (bottoms[id] != null) bottoms[id] += extra;
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
function geometry() { const out = {}; for (const inst of state.secList) Object.assign(out, rawGeomOf(inst.id)); return out; }
// §2：高さか幅が16px未満の部品は、つかめる範囲を上下左右に8px広げる（見た目・配置は変えない）。client→設計座標で判定。
function smallHit(clientX, clientY) {
  for (const inst of state.secList) {
    const sec = inst.id;
    const s = secNode(sec); if (!s) continue; const sr = s.getBoundingClientRect();
    const dx = (clientX - sr.left) / scale, dy = (clientY - sr.top) / scale;
    const g = rawGeomOf(sec); let best = null, bestA = Infinity;
    for (const [id, e] of Object.entries(g)) {
      const c = canonId(id); if (!isDraggable(c) && !REPEAT.test(id)) continue;
      const padX = e.w < 16 ? 8 : 0, padY = e.h < 16 ? 8 : 0; if (!padX && !padY) continue;
      if (dx >= e.x - padX && dx <= e.x + e.w + padX && dy >= e.y - padY && dy <= e.y + e.h + padY) { const a = (e.w + 2 * padX) * (e.h + 2 * padY); if (a < bestA) { bestA = a; best = id; } }
    }
    if (best) return best;
  }
  return null;
}
function sections() {
  const out = {}; let topAcc = 0;
  for (const inst of state.secList) { const s = secNode(inst.id); if (!s) continue; const h = s.getBoundingClientRect().height / scale; out[inst.id] = { top: +topAcc.toFixed(2), height: +h.toFixed(2) }; topAcc += h; }
  return out;
}
// §2.3 入口：今の並び順のセクション `[{id, type, bg, top, height}]`（bg は背景の色の名前・top/height は今の端末の設計 px）。
function sectionListApi() {
  // 試験台28：並べ替え・追加・削除できるのは今のページの中身のセクションだけ。ヘッダー・フッター（固定のチめ・§2.1）は並びに出さない。背景の交互はページ内の順で。
  const out = []; let topAcc = 0; let pageIdx = 0;
  state.secList.forEach((inst) => {
    if (inst.type === "header" || inst.type === "footer") return;
    const s = secNode(inst.id); const h = s ? s.getBoundingClientRect().height / scale : 0;
    out.push({ id: inst.id, type: inst.type, bg: secBgName(pageIdx), top: +topAcc.toFixed(2), height: +h.toFixed(2) });
    topAcc += h; pageIdx++;
  });
  return out;
}

// §3：重なりを「仕組みが勝手に重ねた（overlaps）」と「お店の方が自分で重ねた（ownerOverlaps）」に分ける。
// 自分で重ねた＝手で動かした部品（m1／m2 を持つ）、または大きさを変えた部品（sizes を持つ。X2）が絡む重なり。
function warnings() {
  const g = geometry(); const R = reduce(activeOps());
  // §2.5（X14）足した部品（写真・文字）は「お店が自分で置いた」＝重なりは ownerOverlaps に入れる（overlaps でない）
  const moved = new Set([...Object.keys(R.m1), ...Object.keys(R.m2), ...Object.keys(R.sizes), ...Object.keys(R.textStyles || {}).filter((k) => R.textStyles[k].size), ...(R.adds || []).map((a) => a.id)]);
  const isMoved = (id) => moved.has(canonId(id)) || (groupOf(id) && moved.has(groupOf(id)));
  const items = Object.entries(g).filter(([, e]) => ["text", "photo", "pill"].includes(e.kind));
  const overlaps = [], ownerOverlaps = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const [ai, a] = items[i], [bi, b] = items[j]; if (secOf(ai) !== secOf(bi)) continue;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox <= 1 || oy <= 1) continue;
    const contains = (p, q) => p.x <= q.x + 1 && p.y <= q.y + 1 && p.x + p.w >= q.x + q.w - 1 && p.y + p.h >= q.y + q.h - 1;
    const mv = isMoved(ai) || isMoved(bi);
    if ((contains(a, b) || contains(b, a)) && !mv) continue;   // §20（X24）すっぽり覆う組は「どちらも手で触っていない」ときだけ飛ばす（テンプレの重なり）。手で触った組は ownerOverlaps に入れる
    (mv ? ownerOverlaps : overlaps).push({ a: ai, b: bi });
  }
  // はみ出しは横だけ見る（§1.1：下方向はセクションが伸びるので警告しない）
  const overflows = [];
  for (const [id, e] of items) if (e.x < -1 || e.x + e.w > SPEC.DESIGN_W[state.device] + 1) overflows.push({ id, edge: "横", dir: e.x < -1 ? "左" : "右" });   // F68 どちらへはみ出したか
  return { overlaps, overflows, ownerOverlaps };
}

// ---- 付いていく先の一覧（§7 anchors）----
function anchorsList() {
  const R = reduce(activeOps()); const out = [];
  for (const [id, m] of Object.entries(R.m1)) out.push({ part: id, partName: M.friendly(id), mode: "M1", dx: m.dx, dy: m.dy });
  for (const [id, ov] of Object.entries(R.m2)) out.push({ part: id, partName: M.friendly(id), mode: "M2", anchor: ov.anchor, anchorName: M.friendly(ov.anchor), gapY: ov.gapY, x: ov.x });
  for (const a of R.added) out.push({ part: a.id, partName: M.friendly(a.id), mode: "M2", anchor: a.anchor, anchorName: M.friendly(a.anchor), gapY: a.gap, x: a.x, added: true });
  return out;
}

