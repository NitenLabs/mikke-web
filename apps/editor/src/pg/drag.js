// ドラッグ（M1/M2・並び替えの帯・落とした先）
// 線：A2｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- ドラッグ（M1/M2 を離した位置で判定）----
let drag = null;
function beginDrag(clientX, clientY) {
  const ids = [...state.selected].filter(isDraggable); if (!ids.length) return false;
  const baseT = {}; for (const id of ids) { const n = elNode(id); baseT[id] = curTranslate(n); }
  drag = { ids, sx: clientX, sy: clientY, lx: clientX, ly: clientY, baseT, origGeom: geometry() };
  a2DragHostsOn(ids); return true;
}
// PC-13 ドラッグ中は、動かしている部品のセクションを前に出す（後ろのセクションの背景に隠れて、移す先で部品が見えなかった）。終わったら戻す
function a2DragHostsOn(ids) { for (const id of ids) { const n = elNode(id); const h = n && n.closest(".host"); if (h) h.classList.add("a2-draghost"); } }
function a2DragHostsOff() { document.querySelectorAll(".host.a2-draghost").forEach((h) => h.classList.remove("a2-draghost")); }
// PC-14 移せない部品をほかのセクションの上へ持っていったら、ドラッグ中に「ここへは移せません」を出す（離すと自分のセクションの中にとどまる。#20）
function a2NoDropMark(on, cx, cy) {
  let el = document.getElementById("a2NoDrop");
  if (!on) { if (el) el.style.display = "none"; document.body.classList.remove("a2-nodrop"); return; }
  if (!el) { el = document.createElement("div"); el.id = "a2NoDrop"; el.setAttribute("data-nodrop", ""); el.textContent = "ここへは移せません"; document.body.appendChild(el); }
  el.style.cssText = `position:fixed;left:${cx + 14}px;top:${cy + 14}px;z-index:85;background:#333;color:#fff;font:12px system-ui;padding:4px 8px;border-radius:6px;pointer-events:none;display:block`;
  document.body.classList.add("a2-nodrop");
}
function a2NoDropCheck(clientX, clientY) {
  if (!drag) return; let bad = false;
  for (const id of drag.ids) { const c = canonId(id); const n = elNode(c); if (!n) continue; const r = n.getBoundingClientRect(); const cyC = r.top + r.height / 2;
    const own = secOf(c); const on = secNode(own); if (!on) continue; const orr = on.getBoundingClientRect(); if (cyC >= orr.top && cyC < orr.bottom) continue;
    const tgt = a2SecAtClientY(cyC); if (!tgt) continue;
    if (!((tgt.type === "feature" || tgt.type === "items") && canCrossSec(c))) { bad = true; break; } }
  a2NoDropMark(bad, clientX, clientY);
}
// PC-14・PC-22 PC のセクションの見出しの組はページの幅いっぱい（中央寄せ）なので、横には動かさない（上下だけ）。左右へ動かすとページの外へ出るため（#15・DECISIONS #21）
const a2VertOnly = (id) => state.device === "pc" && /^(F_hg|I_hg)$/.test(bareOf(canonId(id)));
function curTranslate(n) { if (!n) return { tx: 0, ty: 0 }; const t = n.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/); return t ? { tx: +t[1], ty: +t[2] } : { tx: 0, ty: 0 }; }
function dragMove(clientX, clientY, alt, shift) {
  if (!drag) return;
  // P15 Shift を押している間は縦か横にまっすぐ（動きの大きい方の軸だけ。もう一方の軸は吸い付きもしない）
  drag.axis = null;
  if (drag.ids.length === 1 && a2VertOnly(drag.ids[0])) { clientX = drag.sx; drag.axis = "y"; }   // PC-14 PC の見出しの組は上下だけ（吸い付きも横は外す）
  else if (shift) { if (Math.abs(clientX - drag.sx) >= Math.abs(clientY - drag.sy)) { clientY = drag.sy; drag.axis = "x"; } else { clientX = drag.sx; drag.axis = "y"; } }
  drag.lx = clientX; drag.ly = clientY;
  const dx = (clientX - drag.sx) / scale, dy = (clientY - drag.sy) / scale;
  for (const id of drag.ids) { const n = elNode(id); if (n) n.style.transform = `translate(${drag.baseT[id].tx + (a2VertOnly(id) ? 0 : dx)}px,${drag.baseT[id].ty + dy}px)`; }
  document.querySelectorAll(".anchor-line,.anchor-label,.mark-anchor,.reorder-line").forEach((n) => { if (n.classList.contains("mark-anchor")) n.classList.remove("mark-anchor"); else n.remove(); });
  let g = geometry();
  const single = drag.ids.length === 1;
  // 並び替えになる位置なら、割り込む所に横線を出す（§6）。「付いていく先」の札は§2で出さない
  const ro = single ? reorderActive(g, drag.ids[0]) : null;   // §22a X29：40px 内の小さなずらし（M1）には横線を出さない。帯の縁の reorder だけ出す
  // §2 そろえる（単体・Alt でない）。並び替えのときは縦は並び替えが勝つ＝横だけ吸い付く
  drag.snapDX = 0; drag.snapDY = 0;
  if (single && !alt) { const id = drag.ids[0]; const e = g[id]; const sec = secOf(id); const ex = new Set([id]);
    if (e) {
      // §27 そろえる線（§7.2）と等間隔を、軸ごとに近い方で決める（同じ近さならそろえる線が勝つ）。縦の並び替え中は横だけ
      const al = snapBox(sec, e, true, !ro, ex); const eq = equalSpaceSnap(sec, e, true, !ro, ex);
      const alDX = al.hitV ? al.dx : null, alDY = al.hitH ? al.dy : null;
      const xAlign = alDX != null && (eq.dxDist == null || Math.abs(alDX) <= eq.dxDist + 1e-6);
      const xEq = !xAlign && eq.dxDist != null;
      const yAlign = alDY != null && (eq.dyDist == null || Math.abs(alDY) <= eq.dyDist + 1e-6);
      const yEq = !yAlign && eq.dyDist != null;
      let sdx = xAlign ? alDX : (xEq ? eq.dx : 0); let sdy = yAlign ? alDY : (yEq ? eq.dy : 0);
      if (drag.axis === "x") sdy = 0; if (drag.axis === "y") sdx = 0;   // P15 まっすぐの軸は外さない
      drag.snapDX = sdx; drag.snapDY = sdy;
      if (sdx || sdy) { const n = elNode(id); if (n) n.style.transform = `translate(${drag.baseT[id].tx + dx + sdx}px,${drag.baseT[id].ty + dy + sdy}px)`; g = geometry(); }
      const gs = [];
      if (xAlign) gs.push(...al.guides.filter((x) => x.dir === "v"));
      if (yAlign) gs.push(...al.guides.filter((x) => x.dir === "h"));
      if (xEq) gs.push(...eq.marksX);
      if (yEq) gs.push(...eq.marksY);
      setGuides(gs, sec);
    } }
  else setGuides([], null);
  if (ro) showReorderLine(drag.ids[0], ro);
  a2NoDropCheck(clientX, clientY);
}
// J17 別のセクションへ移した部品も足した部品と同じ（絶対配置だけ）
function classify(g, id) { if (isFloat(id)) return "M2"; const base = classifyDropX(g, id, drag ? drag.ids : [id], drag ? drag.origGeom : g);
  // §4.2.1 ③：ほかの子の箱の深い所（帯の外・入れ子でない）に落ちたら、M1 でなく M2（重なる）。自分の元の箱の中なら droppedOnChild は空＝M1 のまま
  if (base === "M1" && reorderBandIdx(g, id) < 0 && droppedOnChild(g, id) && !insideNestedGroup(g, id, g[id].y + g[id].h / 2)) return "M2";
  return base; }
// §8 入口：ドラッグの最中だけ、今離したら何になるか
function dropTarget() {
  if (!drag || drag.ids.length !== 1) return null;
  const id = drag.ids[0]; const g = geometry();
  if (reorderActive(g, id)) return "reorder";   // §22a X29：M1（40px 内）より後では見ない＝小さなずらしは M1
  const mode = classify(g, id); if (mode === "M1") return "M1";
  const rc = reorderClusterOf(id); const cy = g[id].y + g[id].h / 2;
  if (rc) { const og = drag.origGeom; const sibs = rc.sibs.filter((s) => og[s] && s !== id); if (sibs.length) { const top = Math.min(...sibs.map((s) => og[s].y)), bot = Math.max(...sibs.map((s) => og[s].y + og[s].h)); if (cy >= top && cy <= bot) return "overlap"; } }   // クラスタの中で M2＝重なる（②/③）
  return "M2";
}
// §2 複製・追加したセクションは、座標がセクションごとに独立する。C3 には「そのセクションだけ・素の ID」の実測を渡す（anchor は従来どおり全体で）。
// J17 別のセクションへ移した部品は「~ID」に（移った先の素の ID とぶつからない）
function stripGeom(gMerged, sec) { const pfx = sec + SEP; const out = {}; for (const k in gMerged) if (secOf(k) === sec) out[isCarried(k) ? "~" + k : (k.startsWith(pfx) ? k.slice(pfx.length) : k)] = gMerged[k]; return out; }
// J17 特集・品（素の ID のセクション）は、そのセクションの部品だけで測る（座標はセクションごと）。よそへ移っていった部品・ほかのセクション（ヘッダー・フッター・複製）の部品は混ぜない。
// keep＝動かしている部品（移す先で測るとき、まだ元のセクションの子なので secOf では外れてしまう。PC-26）
// PC-22 前は全部のセクションを混ぜていて、品の部品の付いていく先にフッターの部品（footer__fnav）が選ばれ、変な位置に貼り付いた
function anchorGeom(gMerged, sec, keep) { const out = {}; for (const k in gMerged) if (k === keep || secOf(k) === sec) out[k] = gMerged[k]; return out; }
function classifyDropX(gMerged, id, ids, origMerged) {
  const sec = secOf(id); if (isAnchorSec(sec)) return M.classifyDrop(anchorGeom(gMerged, sec, id), id, ids, anchorGeom(origMerged, sec, id));
  const pfx = sec + SEP; const strip = (k) => isCarried(k) ? "~" + k : (k.startsWith(pfx) ? k.slice(pfx.length) : k);
  return M.classifyDrop(stripGeom(gMerged, sec), strip(id), ids.map(strip), stripGeom(origMerged, sec));
}
function reanchorX(gMerged, id, secArg) {
  const sec = secArg || secOf(id);
  if (isAnchorSec(sec)) {   // J17 よそから移ってきた部品も付いていく先の候補にする（素の ID の頭で特集・品を見分けるので、頭をそろえた仮の名前で渡す）
    const ag = anchorGeom(gMerged, sec, id); const ms = movedSecMap(); const tag = sec === "feature" ? "F_~" : "~"; let geo = ag;
    if (Object.keys(ms).some((k) => ms[k] === sec && k in ag && k !== id && (sec === "feature") !== k.startsWith("F_"))) { geo = {}; for (const k in ag) geo[(k !== id && ms[k] === sec && (sec === "feature") !== k.startsWith("F_")) ? tag + k : k] = ag[k]; }
    const pr = M.reanchor(geo, id, sec); if (pr && pr.anchor && pr.anchor.startsWith(tag) && pr.anchor.length > tag.length) { const real = pr.anchor.slice(tag.length); if (real in ag) pr.anchor = real; }
    return pr;
  }
  const pfx = sec + SEP; const strip = (k) => isCarried(k) ? "~" + k : (k.startsWith(pfx) ? k.slice(pfx.length) : k);
  const inst = reduce(activeOps()).secList.find((s) => s.id === sec);
  const sg = stripGeom(gMerged, sec); const key = strip(id); if (!sg[key] && gMerged[id]) sg[key] = gMerged[id];   // J17 移す先で測るとき、動かした部品はまだ元のセクションの子
  const pr = M.reanchor(sg, key, inst ? inst.type : "feature");
  const re = (a) => (!a || a[0] === "@" || isAdded(a)) ? a : (a[0] === "~" ? a.slice(1) : pfx + a);
  return { anchor: re(pr.anchor), gapY: pr.gapY, x: pr.x };
}
// 入れ子の別塊（品の並び・甘味処の表）の中に離したか（§2.1）。同一セクションのみ。自分自身の箱は除く（§5：表・品の並び自体をつかんだとき）。
function insideNestedGroup(g, id, cy) {
  const sec = secOf(id); const pfx = prefixOf(id);
  for (const gid of [withPfx(pfx, "I_cards"), withPfx(pfx, "I_table")]) { if (gid === id) continue; const e = g[gid]; if (!e || secOf(gid) !== sec) continue; if (cy >= e.y && cy <= e.y + e.h) return true; }
  return false;
}
// 並び替えになるか（§6／§10.1／§2.1）：縦積みの塊の直接の子どうしの間に離したとき。
// 塊の範囲（直接の子の上端〜下端を40px広げた中）にあり、入れ子の別塊の中でないこと。40px の M1 判定には依存しない。
// §20（§4.2）並び替えの帯：子と子の空き＋上の子の下端から12・下の子の上端から12。
// §20b §1（X26 直し）一番上の子より上・一番下の子より下の「空いた所」は pg19b と同じく並び替え（塊の範囲＝直接の子の上端〜下端±40）。
//   そこに子の中の12の帯を足す＝一番上の子は上端＋12まで、一番下の子は下端−12までが先頭／末尾への並び替え。
// 子の箱の深い所（帯の外・子と子の間でもない）に落としたら並び替えない（→ M2 で重なる＝③を②と同じに）。入れ子の別塊は従来どおり M2。
const REORDER_BAND = 12;
// §22 X27：離した中心が「並び替えの帯」の中かだけを返す（並びが実際に変わるかは別）。帯＝子と子の空き＋縁の±12、
// 一番上/下の外の空いた所（±40）も含む。品の並び・表の縁も子と同じ帯＝②の箱の中より帯を先に見る。<0＝帯の外（深い所→②/③の M2）。
function reorderBandIdx(g, id, ogArg) {
  if (isFloat(id)) return -1;
  const rc = reorderClusterOf(id); if (!rc) return -1;
  const og = ogArg || (drag ? drag.origGeom : g);
  const sibs = rc.sibs.filter((s) => og[s]); if (sibs.length < 2) return -1;
  const cy = g[id].y + g[id].h / 2;
  const others = sibs.filter((s) => s !== id).sort((a, b) => og[a].y - og[b].y);
  if (!others.length) return -1;
  const B = REORDER_BAND; let targetIdx = -1;
  const first = og[others[0]], last = og[others[others.length - 1]];
  if (cy < first.y - 40 || cy > last.y + last.h + 40) return -1;                                   // 塊の範囲（±40）の外 → M2（④）
  if (cy <= first.y + B) targetIdx = 0;                                                             // 一番上の子より上＋子の中12（X26）
  else if (cy >= last.y + last.h - B) targetIdx = others.length;                                     // 一番下の子より下＋子の中12（X26）
  else { for (let i = 0; i < others.length - 1; i++) { const A = og[others[i]], C = og[others[i + 1]]; if (cy >= A.y + A.h - B && cy <= C.y + B) { targetIdx = i + 1; break; } } }
  return targetIdx;
}
// 帯の中での並び（no-op でも位置を返す＝横線の描画用）。帯の外なら null。
function reorderLineOrder(g, id, ogArg) {
  const targetIdx = reorderBandIdx(g, id, ogArg); if (targetIdx < 0) return null;
  const rc = reorderClusterOf(id); const og = ogArg || (drag ? drag.origGeom : g);
  const others = rc.sibs.filter((s) => og[s] && s !== id).sort((a, b) => og[a].y - og[b].y);
  const neworder = [...others]; neworder.splice(targetIdx, 0, id);
  return { key: rc.key, order: neworder };
}
// 並び替えの結果（帯の中で、順番が実際に変わるときだけ）。変わらなければ null（＝元の流れに戻す・コミットしない）。
function reorderPreview(g, id, ogArg) {
  const ro = reorderLineOrder(g, id, ogArg); if (!ro) return null;
  const rc = reorderClusterOf(id); const og = ogArg || (drag ? drag.origGeom : g);
  const curOrder = rc.sibs.filter((s) => og[s]).sort((a, b) => og[a].y - og[b].y);
  if (ro.order.join() === curOrder.join()) return null;   // 位置が変わらない＝並び替えなし（no-op）
  return ro;
}
// §22a X29：並び替えとして扱うか。判定の順は試験台20 のとおり「40px 内のずらし（M1）」を先に見る＝小さなずらしは並び替えにしない。
// ①実際に並びが変わる→reorder。②変わらなくても、40px の外（＝M1 でない）で帯の中なら reorder（X27 の縁の no-op）。自分の元の場所の上下は M1 が先に拾うので相手にしない。
function reorderActive(g, id, ogArg) {
  const roReal = reorderPreview(g, id, ogArg); if (roReal) return roReal;
  const orig = ogArg || (drag ? drag.origGeom : g);
  if (classifyDropX(g, id, drag ? drag.ids : [id], orig) === "M1") return null;   // 40px 内の小さなずらし＝M1（並び替えにしない）
  if (reorderBandIdx(g, id, ogArg) >= 0) return reorderLineOrder(g, id, ogArg);   // 40px 外で帯の中＝縁の no-op も reorder
  return null;
}
// §4.2.1 ③で落とした先の子（縦の中心がその子の箱の中）。重なる M2 の付いていく先にする。
function droppedOnChild(g, id) {
  const rc = reorderClusterOf(id); if (!rc) return null; const cy = g[id].y + g[id].h / 2;
  for (const s of rc.sibs) { if (s === id) continue; const e = g[s]; if (!e) continue; if (cy >= e.y && cy <= e.y + e.h) return s; }
  return null;
}
// ③の重なり M2：付いていく先＝落とした先の子、間隔＝落とした位置−子の下端（重なるので負になりうる）
function overlapAnchor(g, id) { const child = droppedOnChild(g, id); if (!child) return null; const e = g[child]; return { anchor: child, gapY: +(g[id].y - (e.y + e.h)).toFixed(2), x: +g[id].x.toFixed(2) }; }
function showReorderLine(id, ro) {
  const og = drag ? drag.origGeom : geometry(); const sec = secOf(id); const s = secNode(sec); if (!s) return;
  const idx = ro.order.indexOf(id); const above = idx > 0 ? ro.order[idx - 1] : null;
  const y = above && og[above] ? og[above].y + og[above].h + 1 : (og[ro.order.find((x) => x !== id)] ? og[ro.order.find((x) => x !== id)].y - 2 : 0);
  const me = og[id]; const line = document.createElement("div"); line.className = "reorder-line"; line.setAttribute("data-drop-line", "");   // §4.2.4
  line.style.cssText = `position:absolute;left:${me.x}px;top:${y}px;width:${me.w}px;height:2px;background:#06c;pointer-events:none;z-index:6`;
  s.appendChild(line);
}
function cancelDrag() { if (!drag) return; drag = null; a2DragHostsOff(); a2NoDropMark(false); clearGuides(); render(); }   // J29 ドラッグ中の Esc：取り消して元に戻す（離しても何も記録しない）
// PC-26 離したときの計算で例外が出ても、ドラッグは必ず終える（前は drag が残り、離した後も部品がマウスに付いて回った）
function endDrag(opts) {
  if (!drag) return;
  try { endDragInner(opts); }
  catch (e) { drag = null; clearGuides(); try { render(); } catch (e2) {} throw e; }
  finally { a2DragHostsOff(); a2NoDropMark(false); }
}
function endDragInner(opts) {
  if (opts && opts.dup && a2DupDrop()) return;   // P16 Option を押したまま離した＝元は残し、写しを離した所に出す
  let dx = (drag.lx - drag.sx) / scale + (drag.snapDX || 0), dy = (drag.ly - drag.sy) / scale + (drag.snapDY || 0);
  if (Math.abs(drag.lx - drag.sx) <= 0.5 && Math.abs(drag.ly - drag.sy) <= 0.5) { drag = null; clearGuides(); render(); return; }
  if (drag.ids.some(a2VertOnly)) { const only = drag.ids.length === 1; if (only) dx = 0; }   // PC-14 見出しの組だけなら横は動かさない
  const dxOf = (id) => (a2VertOnly(id) ? 0 : dx);   // PC-22 複数のときも見出しの組は横に動かさない（ほかの部品は動かした分だけ）
  // J17（DECISIONS #17）離した所が別のセクション（特集・品）の上なら、移せる部品はそのセクションへ移す（同じ ID のまま）。J16 の枠より先に見る（上のセクションへも移せる）。
  // 移せない部品は、自分のセクションの下端（下の余白の手前）までにとどめる＝元のセクションが勝手に伸びない・画面も動かない
  { const xs = a2CrossSecDrop(dx, dy); if (xs === true) return; if (xs && xs.dy != null && Math.abs(xs.dy - dy) > 0.01) { dy = xs.dy; for (const id of drag.ids) { const n = elNode(id); if (n) n.style.transform = `translate(${drag.baseT[id].tx + dxOf(id)}px,${drag.baseT[id].ty + dy}px)`; } } }
  // J16 ドラッグした部品を自分のセクションの中身の枠に収める（左右の外・ヘッダー〔上端より上〕へは出さない）。単体のみ
  if (drag.ids.length === 1) { const id = drag.ids[0]; const e0 = drag.origGeom[id];
    if (e0 && isDraggable(id)) { const cL = 0, cR = SPEC.DESIGN_W[state.device]; const nx = e0.x + dx, ny = e0.y + dy;   // E3：収めるのはページ（セクション）の左右の中。中身の幅の端で止めると、端にある見出しが少し動かせない
      // J16 左右の外・上端より上へは出さない（下への制限はしない＝W8 を壊さない）。中身の幅いっぱいの部品は横に寄せる余地がない＝横は動かさない（Z3 を壊さない）
      const cx = (cR - e0.w > cL) ? Math.min(Math.max(nx, cL), cR - e0.w) : nx, cy = Math.max(ny, 0);
      if (Math.abs(cx - nx) > 0.5 || Math.abs(cy - ny) > 0.5) { dx += cx - nx; dy += cy - ny; const n = elNode(id); if (n) n.style.transform = `translate(${drag.baseT[id].tx + dx}px,${drag.baseT[id].ty + dy}px)`; } } }
  const g = geometry();
  const prior = reduce(activeOps()).m1;   // 既に M1 を持つ部品を更に動かすときは積む（テンプレ位置からの総ずれ＝prior+今回）
  // 並び替え（単体・同一塊の中・兄弟を越えた）＝M1 でなく並び順の変更（§6／§10.1）
  // §22a X29：順の判定は「40px 内のずらし（M1）」が先。実際に並びが変われば reorder をコミット。40px 外の帯の no-op（縁）だけ流れに戻す（M2 にしない）。小さなずらしは下の M1 へ落とす。
  if (drag.ids.length === 1) { const id = drag.ids[0]; const roReal = reorderPreview(g, id); if (roReal) { drag = null; commit({ t: "reorder", device: state.device, key: roReal.key, id, order: roReal.order }); return; } if (reorderActive(g, id)) { drag = null; render(); return; } }
  // M1/M2 を判定。M2 の付いていく先・間隔は「離した瞬間（元の場所を詰める前）の配置」で決める（§2.2）。
  const decided = drag.ids.map((id) => ({ id, mode: classify(g, id) }));
  if (decided.some((d) => d.mode === "M2")) {
    const finalItems = decided.map((d) => {
      if (d.mode === "M1") { const bt = drag.baseT[d.id], p0 = prior[d.id] || { dx: 0, dy: 0 }; return { id: d.id, mode: "M1", dx: Math.round((p0.dx || 0) + bt.tx + dxOf(d.id)), dy: Math.round((p0.dy || 0) + bt.ty + dy) }; }
      const ov = (!insideNestedGroup(g, d.id, g[d.id].y + g[d.id].h / 2)) ? overlapAnchor(g, d.id) : null;   // §4.2.1 ③は落とした先の子に付く
      const pr = ov || reanchorX(g, d.id);   // g＝離した瞬間（詰める前）の実測
      return { id: d.id, mode: "M2", anchor: pr.anchor, gapY: pr.gapY, x: a2VertOnly(d.id) ? 0 : pr.x };   // PC-14 見出しの組はページの左端から幅いっぱい
    });
    drag = null; commit({ t: "move", device: state.device, items: finalItems });
    // J11：PowerPoint にそろえ、足した所に重なって出てよい＝動かしても下げない（旧：重ならない所まで自分が下がる pushDownClear を廃止）
  } else {
    const items = decided.map((d) => { const bt = drag.baseT[d.id], p0 = prior[d.id] || { dx: 0, dy: 0 }; return { id: d.id, mode: "M1", dx: Math.round((p0.dx || 0) + bt.tx + dxOf(d.id)), dy: Math.round((p0.dy || 0) + bt.ty + dy) }; });
    // PC-14 移せない所で離して、結局どれも動かなかったときは記録しない（何もしない「戻す」を残さない）
    const R0 = reduce(activeOps()); if (items.every((it) => { const p = prior[it.id] || { dx: 0, dy: 0 }; return !R0.m2[it.id] && Math.round(p.dx || 0) === it.dx && Math.round(p.dy || 0) === it.dy; })) { drag = null; clearGuides(); render(); return; }
    drag = null; commit({ t: "move", device: state.device, items });
  }
}


// ---- J17 別のセクションへ移す ----
// client の点が、今のページのどのセクションの上か（ヘッダー・フッターも返す。どれでもなければ null）
function a2SecAtClientY(cy) {
  for (const inst of state.secList) { const s = secNode(inst.id); if (!s) continue; const r = s.getBoundingClientRect(); if (cy >= r.top && cy < r.bottom) return inst; }
  return null;
}
// 戻り値：true＝移した（記録した）／{dy}＝移せないので縦をとどめた／null＝ふつう
function a2CrossSecDrop(dx, dy) {
  const ids = drag.ids.map(canonId); const og = drag.origGeom; const R0 = reduce(activeOps());
  const cross = [], held = [];
  for (const id of ids) {
    const e0 = og[id]; const n = elNode(id); if (!e0 || !n) continue;
    const r = n.getBoundingClientRect(); const cyC = r.top + r.height / 2;
    const own = secOf(id); const ownN = secNode(own); if (!ownN) continue; const orr = ownN.getBoundingClientRect();
    if (cyC >= orr.top && cyC < orr.bottom) continue;   // 自分のセクションの中
    const tgt = a2SecAtClientY(cyC);
    if (!tgt) continue;   // ページの外（一番下より下など）は従来どおり
    const okT = (tgt.type === "feature" || tgt.type === "items") && tgt.id !== own;
    if (okT && canCrossSec(id)) cross.push({ id, tgt, r }); else held.push({ id, e0 });
  }
  if (cross.length && cross.length === ids.length) {
    const grp = "xsec" + Date.now(); const items = [];
    for (const c of cross) {
      const tn = secNode(c.tgt.id); const tr = tn.getBoundingClientRect();
      // 離した所にそのまま置く（上端より上に少し出ても寄せない：寄せると下の見出しに重なる。verify_extra_photo H2）
      const x = (c.r.left - tr.left) / scale, y = (c.r.top - tr.top) / scale, w = c.r.width / scale, h = c.r.height / scale;
      const g0 = geometry(); const g = {}; for (const k in g0) if (k !== c.id && secOf(k) === c.tgt.id) g[k] = g0[k];   // 移す先のセクションの部品だけ（座標はセクションごと）
      g[c.id] = { ...(g0[c.id] || {}), x, y, w, h };   // 移す先の座標で測った自分
      const pr = reanchorX(g, c.id, c.tgt.id) || { anchor: "@section", gapY: +y.toFixed(2), x: +x.toFixed(2) };
      const rel = a2FlowAnchor(g, c.id, c.tgt.id, pr);
      items.push({ id: c.id, from: secOf(c.id), to: c.tgt.id, anchor: pr.anchor, gapY: pr.gapY, x: +Math.min(Math.max(pr.x, 0), SPEC.DESIGN_W[state.device] - w).toFixed(2), ...(rel !== pr.anchor ? { relAnchor: rel } : {}) });
    }
    const fixes = a2DependentsFix(items.map((it) => it.id));   // 元のセクションで、移した部品に付いていた部品は、その場に残す（付いていく先を取り直す）
    const ref = items[0]; const before = elNode(ref.id).getBoundingClientRect().top;
    drag = null; clearGuides();
    if (fixes.length) commit({ t: "move", device: state.device, items: fixes, _grp: grp });
    commit({ t: "xsec", device: state.device, items, ...(fixes.length ? { _grp: grp } : {}) });
    // 離した所に置く：元のセクションが詰まって移した部品が上へずれた分だけ、画面を合わせる（移した部品は指の下に残る）
    const nn = elNode(ref.id); if (nn) { const d = nn.getBoundingClientRect().top - before; if (Math.abs(d) > 0.5) window.scrollBy(0, d); }
    selectMany(items.map((it) => it.id));
    return true;
  }
  // 移せない（品の並び・見出しの組など）・移せない先（ヘッダー・フッター）・一部だけ移せる複数：自分のセクションの下端の余白の手前までにとどめる
  const stay = cross.length && cross.length === ids.length ? [] : [...held, ...cross.map((c) => ({ id: c.id, e0: og[c.id] }))];
  let lim = null, limUp = null;
  for (const { id, e0 } of stay) {
    const own = secOf(id); const host = document.getElementById("host_" + own); const sn = secNode(own); if (!sn) continue;
    const secH = sn.getBoundingClientRect().height / scale; const padB = (host && host._padBottom) || 0;
    const maxY = Math.max(0, secH - padB - e0.h);
    if (e0.y + dy > maxY) { const d = maxY - e0.y; lim = lim == null ? d : Math.min(lim, d); }
    // PC-14 上のセクションの上で離したときも同じ：自分のセクションの上の余白の後までにとどめる（前はセクションの上端＝余白より上の隅に貼り付いた）
    const st = sn.querySelector(".stack"); const padT = st ? parseFloat(getComputedStyle(st).paddingTop) || 0 : 0;
    const minY = Math.min(padT, e0.y);
    if (e0.y + dy < minY) { const d = minY - e0.y; limUp = limUp == null ? d : Math.max(limUp, d); }
  }
  if (lim == null && limUp == null) return null;
  let ndy = dy; if (lim != null) ndy = Math.max(Math.min(ndy, lim), Math.min(ndy, 0)); if (limUp != null) ndy = Math.min(Math.max(ndy, limUp), Math.max(ndy, 0));
  return { dy: ndy };
}
// PC-5・PC-6・SP-6（DECISIONS #22）もう一方の端末での置き場所の「付いていく先」：離した所より上に丸ごとある部品（品の並び・表は1つの塊）。
// 動かした端末の付いていく先（重なって付いた品の並び・セクションの先頭など）をそのまま使うと、もう一方の端末では品の並びの下や見出しより上に入り、見出しを隠した。
// 上に何もなければ、そのセクションの見出しの組の下
function a2FlowAnchor(g, id, sec, pr) {
  if (pr && pr.anchor && pr.anchor !== "@section" && pr.gapY >= -1) return pr.anchor;
  const geo = { ...g }; const me = geo[id]; if (!me) return pr ? pr.anchor : "@section";
  for (let i = 0; i < 6; i++) {
    const q = reanchorX(geo, id, sec); if (!q || !q.anchor || q.anchor === "@section") break;
    if (q.gapY >= -1) return q.anchor;
    for (const k of Object.keys(geo)) if (k !== id && (k === q.anchor || groupOf(k) === q.anchor)) delete geo[k];   // 重なっている先（と中の1件）を外して、もう一つ上を探す
  }
  const inst = state.secList.find((s) => s.id === sec); const pfx = isAnchorSec(sec) ? "" : sec + SEP;
  return pfx + (inst && inst.type === "feature" ? "F_hg" : "I_hg");
}
// 元のセクションで、移す部品に付いていた部品（この端末の M2・足した部品）を、移した後もその場に残すための付け直し
function a2DependentsFix(movedIds) {
  const mv = new Set(movedIds); const R = reduce(activeOps()); const g = geometry(); const out = [];
  const deps = [];
  for (const [id, ov] of Object.entries(R.m2)) if (!mv.has(id) && mv.has(ov.anchor)) deps.push(id);
  for (const a of [...R.added, ...(R.carried || [])]) if (!mv.has(a.id) && mv.has(a.anchor) && !deps.includes(a.id)) deps.push(a.id);
  if (!deps.length) return out;
  const g2 = {}; for (const k in g) if (!mv.has(k)) g2[k] = g[k];
  for (const id of deps) { if (!g2[id]) continue; const pr = reanchorX(g2, id); if (pr) out.push({ id, mode: "M2", anchor: pr.anchor, gapY: pr.gapY, x: pr.x }); }
  return out;
}

// P16 Option（Alt）+ドラッグ＝複製して動かす（PowerPoint と同じ）。元は元の位置に戻し、写しを離した所に足す（足した部品＝元に付いていく）。
// 写せない部品（品の並び・表の入れ物・品の中の1件）だけのときは false（ふつうの移動にする）。
function a2DupDrop() {
  const g = geometry(); const og = drag.origGeom;
  const ids = drag.ids.filter((id) => isDraggable(id) && !isRepeat(id) && !/^I_(cards|table)$/.test(bareOf(canonId(id))) && g[id] && og[id]);
  if (!ids.length) return false;
  const dst = {}; for (const id of ids) dst[id] = { x: g[id].x, y: g[id].y };
  drag = null; clearGuides();
  const keepSel = new Set(state.selected), keepCb = state.clipboard; state.selected = new Set(ids); copySelection(); state.selected = keepSel;
  const cb = state.clipboard; state.clipboard = keepCb;   // 複製のドラッグはクリップボードを変えない（PowerPoint と同じ）
  if (!cb || cb.kind !== "parts" || !cb.parts.length) { render(); return true; }
  const newIds = []; const grp = "dup" + Date.now();
  for (const p of cb.parts) {
    const o = og[p.id], d = dst[p.id]; if (!o || !d) continue;
    const id = (p.kind === "photo" ? "addp_" : "add_") + (++state.addSeq);
    const gap = +(d.y - (o.y + o.h)).toFixed(2), x = +d.x.toFixed(2);
    a2AddCopy(p, id, secOf(p.id), p.id, gap, x, grp);
    newIds.push(id);
  }
  selectMany(newIds);
  return true;
}
// 写しを足す（貼り付けと同じ中身：明るさ・文の一部の見た目・部品のリンクも引き継ぐ）。grp＝戻す1回でまとめて戻す印（ops-history）
function a2AddCopy(p, id, sec, anchor, gap, x, grp) {
  commit({ t: "add", id, section: sec, kind: p.kind === "photo" ? "photo" : "text", styleName: styleOf(p.id), asset: p.kind === "photo" ? p.asset : undefined, w: p.w, wOther: p.wOther, h: p.kind === "photo" ? p.h : undefined, hOther: p.kind === "photo" ? p.hOther : undefined, text: p.text || "", anchor, gap, gapOther: 16, placedDevice: state.device, x, _grp: grp });
  if (p.brightness) commit({ t: "bright", id, v: p.brightness, _grp: grp });
  if (p.runs) commit({ t: "edit", id, runs: clone(p.runs), _grp: grp });
  if (p.elink) commit({ t: "elink", id, link: clone(p.elink), _grp: grp });
}

// P19 ドラッグ・つまみで窓の上下の端（上は道具の並びの下）に近づいたら自動でスクロールし、部品（つまみ）を指の下に付いてこさせる
let a2as = null;
function a2AutoScroll(x, y, noSnap, shift) {
  if (!drag && !rz) { a2StopAutoScroll(); return; }
  const tb = document.getElementById("toolbar"); const top = tb ? Math.max(0, tb.getBoundingClientRect().bottom) : 0; const E = 28;
  let v = 0; if (y >= innerHeight - E) v = Math.min(24, 4 + (y - (innerHeight - E)) * 0.6); else if (y <= top + E) v = -Math.min(24, 4 + (top + E - y) * 0.6);
  a2as = a2as || {}; Object.assign(a2as, { x, y, noSnap, shift, v: Math.round(v) });
  if (a2as.v && !a2as.raf) a2as.raf = requestAnimationFrame(a2AutoStep);
}
function a2AutoStep() {
  if (!a2as) return; a2as.raf = 0; if (!a2as.v || (!drag && !rz)) return;
  const y0 = scrollY; window.scrollBy(0, a2as.v); const d = scrollY - y0; if (!d) return;   // 端まで来た
  if (drag) { drag.sy -= d; dragMove(a2as.x, a2as.y, a2as.noSnap, a2as.shift); } else if (rz) { rz.sy -= d; resizeMove(a2as.x, a2as.y, a2as.noSnap); }
  a2as.raf = requestAnimationFrame(a2AutoStep);
}
function a2StopAutoScroll() { if (a2as && a2as.raf) cancelAnimationFrame(a2as.raf); a2as = null; }
