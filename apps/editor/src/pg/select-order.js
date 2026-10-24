// 元に戻す（範囲）・元の配置を見る・前面/背面
// 線：A2｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- 戻す（§4）----
function resetScope(scope, id, devices) { const op = { t: "resetScope", scope, id: id || (scope === "part" ? [...state.selected][0] : "F_h0"), devices: devices || [state.device] }; if (scope === "page") op.pageSecs = (reduce(activeOps()).secMap[state.page] || []).map((s) => s.id); commit(op); }
// §2.1（N1）：位置・大きさ・並び順・重なり順のどれか1つでもテンプレから変わっていれば「元の位置に戻す」を出す
function partChangedFromTemplate(id) {
  const c = canonId(id); const R = reduce(activeOps());
  const chg = (k) => !!(R.m1[k] || R.m2[k] || R.sizes[k] || (R.zmap && R.zmap[k] != null) || (R.colsMap && R.colsMap[k] && R.colsMap[k][state.device] != null));   // §20 列も「変わった」＝元の位置に戻すが出る
  if (chg(c)) return true;
  // §5 左右入替も「変わった」（特集の部品）
  if (R.swapMap[secOf(c)] && R.swapMap[secOf(c)][state.device]) { const sd = R.swapMap[secOf(c)][state.device]; if (Object.values(sd).some(Boolean) && blockOfPart(c) != null) return true; }
  const rc = reorderClusterOf(c); if (rc && R.order[rc.key]) return true;
  const g = groupOf(id); if (g && (chg(g) || (() => { const r = reorderClusterOf(g); return r && R.order[r.key]; })())) return true;
  return false;
}
// 元の配置を見る（押している間だけ）
function peekOn() { state.peek = true; render(); }   // 手で動かした部品を元の位置で見せる（記録は変えない）
function peekOff() { state.peek = false; render(); }

// ---- 前面・背面（§4 重なり順）----
const effZ = (id, zmap) => (zmap[canonId(id)] != null ? zmap[canonId(id)] : (groupOf(id) && zmap[groupOf(id)] != null ? zmap[groupOf(id)] : 0));
function overlapPartners(id) {                       // id（canon）と重なっている相手の data-el id
  const w = warnings(); const out = new Set();
  for (const p of [...w.overlaps, ...w.ownerOverlaps]) {
    const ca = canonId(p.a), cb = canonId(p.b), ga = groupOf(p.a), gb = groupOf(p.b);
    if (ca === id || ga === id) out.add(p.b); else if (cb === id || gb === id) out.add(p.a);
  }
  return [...out];
}
// §22 §8 重なり順の決め方：端末ごとの「前後の順番」。手直しのない部品の初めの順＝テンプレの描画順（後に描くものほど前＝DOM順）。
// 重なっている相手＋自分を1つの束として、今の前後（zmap があればそれ、無ければ描画順）で並べ、動かした後に連番で materialize する（同値を作らない）。
function drawOrderIndex() { const g = geometry(); const di = {}; let i = 0; for (const k of Object.keys(g)) { const c = canonId(k); if (di[c] == null) di[c] = i++; } return di; }
const effZsort = (id, zmap, di) => (zmap[id] != null ? zmap[id] : (groupOf(id) && zmap[groupOf(id)] != null ? zmap[groupOf(id)] : (di[id] != null ? di[id] : 0)));
function zReorder(mode) {
  const id = canonId([...state.selected][0]); if (!id) return;
  const partners = overlapPartners(id); if (!partners.length) return;
  const R = reduce(activeOps()); const di = drawOrderIndex();
  const cluster = [id, ...partners].sort((a, b) => effZsort(a, R.zmap, di) - effZsort(b, R.zmap, di));   // back→front
  const pos = cluster.indexOf(id); const order = cluster.slice();
  if (mode === "front") { order.splice(pos, 1); order.push(id); }
  else if (mode === "back") { order.splice(pos, 1); order.unshift(id); }
  else if (mode === "forward") { if (pos < cluster.length - 1) { order[pos] = cluster[pos + 1]; order[pos + 1] = id; } }
  else if (mode === "backward") { if (pos > 0) { order[pos] = cluster[pos - 1]; order[pos - 1] = id; } }
  const base = Math.min(...cluster.map((c) => Math.floor(effZsort(c, R.zmap, di))));   // 束の最小の前後を基準に連番（相対順だけが意味を持つ）
  const zs = {}; order.forEach((c, i) => { zs[c] = base + i; });
  commit({ t: "zorder", device: state.device, zs });
}
function bringToFront() { zReorder("front"); }      // 最前面へ移動（相手すべての前へ）
function sendToBack() { zReorder("back"); }          // 最背面へ移動（相手すべての後ろへ）
function bringForward() { zReorder("forward"); }     // 前面へ移動（今すぐ前の1つと入れ替え）
function sendBackward() { zReorder("backward"); }    // 背面へ移動（今すぐ後ろの1つと入れ替え）
function hasOverlapPartner() { const id = canonId([...state.selected][0]); return !!id && overlapPartners(id).length > 0; }
// 今の端末の重なり順（部品 ID。後ろほど上＝実効 z の昇順、同値は y 順）
function zOrderList() {
  const R = reduce(activeOps()); const g = geometry(); const ids = new Set(Object.keys(R.zmap));
  const w = warnings(); for (const p of [...w.overlaps, ...w.ownerOverlaps]) { ids.add(canonId(p.a)); ids.add(canonId(p.b)); }
  return [...ids].filter((id) => g[id]).sort((a, b) => (effZ(a, R.zmap) - effZ(b, R.zmap)) || (g[a].y - g[b].y));
}

