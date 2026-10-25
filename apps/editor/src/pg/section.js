// セクションの操作（上へ・下へ・複製・削除・足す）
// 線：A3｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- §2 セクションの操作（上へ・下へ・複製・削除・足す）。ページの組み立て＝端末共通・1操作1undo。----
const isAnchorSec = (id) => (id === "feature" || id === "items");
// 足す・複製の見本：テンプレの文章そのまま。写真は「まだない写真」＝素材なし（薄い枠）。
function templateSectionContent(type) { const c = clone(type === "feature" ? base().feature : base().items); if (type === "feature") (c.blocks || []).forEach((b) => { if (b.photo) b.photo.asset = ""; }); else (c.cards || []).forEach((cd) => { if (cd.photo) cd.photo.asset = ""; }); return c; }
// 試験台28：セクション操作はそのセクションのあるページの並びに効く（ヘッダー・フッター＝@region は操作不可）。
const pageOfSec = (id) => { const pg = reduce(activeOps()).secPageMap[id]; return (pg && pg !== "@region") ? pg : null; };
function sectionMove(id, delta) { const pg = pageOfSec(id); if (!pg) return; const list = reduce(activeOps()).secMap[pg]; const i = list.findIndex((s) => s.id === id); if (i < 0 || i + delta < 0 || i + delta >= list.length) return; commit({ t: "secMove", id, delta, page: pg }); }
function sectionDelete(id) { const pg = pageOfSec(id); if (!pg) return; const list = reduce(activeOps()).secMap[pg]; if (list.length <= 1 || !list.find((s) => s.id === id)) return; if (state.selectedSection === id) state.selectedSection = null; withDropNotice(() => commit({ t: "secDel", id, page: pg })); }   // J22 本体を消して品が消えたら知らせる
function sectionAdd(pos, type) { const pg = state.page; const list = reduce(activeOps()).secMap[pg]; const newId = "sec" + (++state.secSeq); const afterId = pos > 0 ? (list[pos - 1] || {}).id : null; commit({ t: "secAdd", newId, type, pos, afterId, content: templateSectionContent(type), page: pg }); state.selectedSection = null; }
function sectionDuplicate(id) {
  const pg = pageOfSec(id); if (!pg) return;   // 試験台28：ヘッダー・フッターは複製不可
  const R0 = reduce(activeOps()); const idx = R0.secList.findIndex((s) => s.id === id); if (idx < 0) return;
  const type = R0.secList[idx].type; const newId = "sec" + (++state.secSeq); const pfx = newId + SEP;
  const srcPfx = isAnchorSec(id) ? "" : id + SEP;
  const Rpc = reduce(activeOps(), "pc"), Rsp = reduce(activeOps(), "sp");
  const content = clone(Rpc.secContent[id]);
  const remap = (k) => pfx + (srcPfx && k.startsWith(srcPfx) ? k.slice(srcPfx.length) : k);
  const osec = (k) => (/^F/.test(bareOf(k)) ? "feature" : "items");
  const ownPart = (k) => !isAdded(k) && (srcPfx ? k.startsWith(srcPfx) : (!k.includes(SEP) && homeSec(k) === id));   // J17 生まれたセクションで見る（よそから移ってきた部品は複製しない）
  const ownOrder = (k) => srcPfx ? k.startsWith(srcPfx) : (!k.includes(SEP) && osec(k) === id);
  // P29 足した部品も複製先に同じ所に出す：足した部品の新しい ID と、付いていく先（元のセクションの部品・足した部品）を複製先のものに付け替える
  const addMap = {}; for (const a of Rpc.adds) if (a.section === id) addMap[a.id] = (a.kind === "photo" ? "addp_" : "add_") + (++state.addSeq);
  const mapKey = (k) => addMap[k] || (ownPart(k) ? remap(k) : null);
  const mapAnchor = (k) => (k && mapKey(k)) || k;
  const m2c = (v) => { const o = clone(v); if (o && o.anchor) o.anchor = mapAnchor(o.anchor); return o; };
  const perDev = (R) => { const e = { m1: {}, m2: {}, sizes: {}, zmap: {}, order: {} };
    for (const k in R.m1) { const nk = mapKey(k); if (nk) e.m1[nk] = clone(R.m1[k]); }
    for (const k in R.m2) { const nk = mapKey(k); if (nk) e.m2[nk] = m2c(R.m2[k]); }
    for (const k in R.sizes) { const nk = mapKey(k); if (nk) e.sizes[nk] = clone(R.sizes[k]); }
    for (const k in R.zmap) { const nk = mapKey(k); if (nk) e.zmap[nk] = R.zmap[k]; }
    for (const k in R.order) if (ownOrder(k)) e.order[remap(k)] = R.order[k].slice();
    return e; };
  const shared = { textStyles: {}, runsMap: {}, linkMap: {}, replace: {}, viewAll: {}, bright: {}, clear: [] };
  const tsKey = (k) => { const m = k.match(/^(.*?)(\|.*)?$/); const nk = mapKey(m[1]); return nk ? nk + (m[2] || "") : null; };
  for (const k in Rpc.textStyles) { const nk = ownPart(k) ? remap(k) : tsKey(k); if (nk) shared.textStyles[nk] = clone(Rpc.textStyles[k]); }
  for (const k in Rpc.runsMap) { const nk = mapKey(k); if (nk) shared.runsMap[nk] = clone(Rpc.runsMap[k]); }
  for (const k in Rpc.linkMap) { const nk = mapKey(k); if (nk) shared.linkMap[nk] = clone(Rpc.linkMap[k]); }
  for (const k in Rpc.replaceMap) { const nk = mapKey(k); if (nk) shared.replace[nk] = Rpc.replaceMap[k]; }
  for (const k in Rpc.viewAll) { const nk = mapKey(k); if (nk) shared.viewAll[nk] = clone(Rpc.viewAll[k]); }
  for (const k in Rpc.brightMap) { const nk = mapKey(k); if (nk) shared.bright[nk] = Rpc.brightMap[k]; }
  for (const cid of Rpc.clear) { const nk = mapKey(cid); if (nk) shared.clear.push(nk); }
  const added = Rpc.adds.filter((a) => a.section === id).map((a) => { const n = { ...clone(a), id: addMap[a.id], section: newId, anchor: mapAnchor(a.anchor) }; if (n.placed && n.placed.anchor) n.placed.anchor = mapAnchor(n.placed.anchor); return n; });
  const removed = [...(Rpc.removedAll || []).filter((k) => ownPart(k)), ...(Rpc.carriedIds || []).filter((k) => !isAdded(k) && homeSec(k) === id)].map(remap);   // J17 よそへ移した部品も、複製先では出さない（今の見た目のとおり）   // J46 消した部品は複製先にも「消した」で持ち越す（元に戻らない）
  commit({ t: "secDup", srcId: id, afterId: id, newId, type, content, edits: { pc: perDev(Rpc), sp: perDev(Rsp), ...shared }, added, removed, page: pg });
}
// §2 入口の補助（操作ボタンの出し分け）：上下の端・唯一のセクションか
function sectionCan(id) { const R = reduce(activeOps()); const pg = R.secPageMap[id]; if (!pg || pg === "@region") return { up: false, down: false, del: false, exists: false, fixed: pg === "@region" }; const list = R.secMap[pg]; const i = list.findIndex((s) => s.id === id); return { up: i > 0, down: i >= 0 && i < list.length - 1, del: list.length > 1, exists: i >= 0 }; }

