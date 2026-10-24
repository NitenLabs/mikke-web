// 配置（揃え・整列）
// 線：A2｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ===================== §27 配置（揃え・整列。PowerPoint の「配置 ▸」） =====================
function secHeightOf(sec) { const s = secNode(sec); return s ? s.getBoundingClientRect().height / scale : 0; }
const alignIds = () => { const seen = new Set(); const out = []; for (const id of state.selected) { const c = canonId(id); if (!seen.has(c)) { seen.add(c); out.push(c); } } return out; };
// 配置できるか・どの操作が押せるか（動かせる部品＋表/品の並びの外枠。1件/行の中・ちがうセクションは不可）
function canAlign() {
  const ids = alignIds(); if (!ids.length) return { enabled: false, distribute: false, count: 0 };
  if (!ids.every((id) => isDraggable(id))) return { enabled: false, distribute: false, count: ids.length };
  if (new Set(ids.map(secOf)).size !== 1) return { enabled: false, distribute: false, count: ids.length };
  return { enabled: true, distribute: ids.length >= 3, count: ids.length };
}
// 揃え・整列。動いた部品は「その位置へ Alt ドラッグして離した」のと同じ扱い（吸い付きなし・並び替えなし）。1操作1undo・今の端末だけ
function align(kind) {
  const c = canAlign(); if (!c.enabled) return false;
  if ((kind === "hdist" || kind === "vdist") && !c.distribute) return false;
  const ids = alignIds(); const sec = secOf(ids[0]); const g = geometry();
  const rects = ids.map((id) => ({ id, x: g[id].x, y: g[id].y, w: g[id].w, h: g[id].h }));
  const { left: cL, right: cR } = contentEdges(); const sH = secHeightOf(sec); const single = ids.length === 1;
  const minX = Math.min(...rects.map((r) => r.x)), maxXR = Math.max(...rects.map((r) => r.x + r.w));
  const minY = Math.min(...rects.map((r) => r.y)), maxYB = Math.max(...rects.map((r) => r.y + r.h));
  const target = {};
  for (const r of rects) {
    let x = r.x, y = r.y;
    if (kind === "left") x = single ? cL : minX;
    else if (kind === "right") x = single ? cR - r.w : maxXR - r.w;
    else if (kind === "hcenter") x = single ? (cL + cR) / 2 - r.w / 2 : (minX + maxXR) / 2 - r.w / 2;
    else if (kind === "top") y = single ? 0 : minY;
    else if (kind === "bottom") y = single ? sH - r.h : maxYB - r.h;
    else if (kind === "vcenter") y = single ? sH / 2 - r.h / 2 : (minY + maxYB) / 2 - r.h / 2;
    target[r.id] = { x: +x.toFixed(2), y: +y.toFixed(2) };
  }
  if (kind === "hdist" || kind === "vdist") {
    const horiz = kind === "hdist";
    const sorted = [...rects].sort((a, b) => horiz ? (a.x - b.x) : (a.y - b.y));
    const n = sorted.length; const sumSize = sorted.reduce((s, r) => s + (horiz ? r.w : r.h), 0);
    const first = sorted[0], last = sorted[n - 1];
    const span = horiz ? (last.x + last.w - first.x) : (last.y + last.h - first.y);
    const gap = (span - sumSize) / (n - 1);
    let cur = horiz ? first.x : first.y;
    for (const r of sorted) { if (horiz) { target[r.id] = { x: +cur.toFixed(2), y: r.y }; cur += r.w + gap; } else { target[r.id] = { x: r.x, y: +cur.toFixed(2) }; cur += r.h + gap; } }
  }
  // 目標がすでに今の位置と同じ部品は動かさない（左右/上下に整列の両端＝動かさない。再コミットで位置が崩れるのも防ぐ）
  const movingIds = ids.filter((id) => Math.abs(target[id].x - g[id].x) > 0.5 || Math.abs(target[id].y - g[id].y) > 0.5);
  if (!movingIds.length) { selectMany(ids); return true; }
  programMove(movingIds, (id) => target[id], { noReorder: true });
  selectMany(ids);
  return true;
}
// プリセット補助
function contentCards() { return reduce(activeOps()).content.items.cards; }
function contentRows() { return reduce(activeOps()).content.items.table; }
function delInstance(id) { state.selected = new Set([id]); commit({ t: "del", id }); state.selected = new Set(); render(); }

function applyOps(ops) { state.ops = clone(ops); state.cursor = ops.length; state.selected = new Set(); render(); return Promise.resolve(); }

