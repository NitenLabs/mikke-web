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
  const ownPart = (k) => !isAdded(k) && (srcPfx ? k.startsWith(srcPfx) : (!k.includes(SEP) && secOf(k) === id));
  const ownOrder = (k) => srcPfx ? k.startsWith(srcPfx) : (!k.includes(SEP) && osec(k) === id);
  const perDev = (R) => { const e = { m1: {}, m2: {}, sizes: {}, zmap: {}, order: {} };
    for (const k in R.m1) if (ownPart(k)) e.m1[remap(k)] = clone(R.m1[k]);
    for (const k in R.m2) if (ownPart(k)) e.m2[remap(k)] = clone(R.m2[k]);
    for (const k in R.sizes) if (ownPart(k)) e.sizes[remap(k)] = clone(R.sizes[k]);
    for (const k in R.zmap) if (ownPart(k)) e.zmap[remap(k)] = R.zmap[k];
    for (const k in R.order) if (ownOrder(k)) e.order[remap(k)] = R.order[k].slice();
    return e; };
  const shared = { textStyles: {}, runsMap: {}, linkMap: {}, replace: {}, viewAll: {}, bright: {}, clear: [] };
  for (const k in Rpc.textStyles) if (ownPart(k)) shared.textStyles[remap(k)] = clone(Rpc.textStyles[k]);
  for (const k in Rpc.runsMap) if (ownPart(k)) shared.runsMap[remap(k)] = clone(Rpc.runsMap[k]);
  for (const k in Rpc.linkMap) if (ownPart(k)) shared.linkMap[remap(k)] = clone(Rpc.linkMap[k]);
  for (const k in Rpc.replaceMap) if (ownPart(k)) shared.replace[remap(k)] = Rpc.replaceMap[k];
  for (const k in Rpc.viewAll) if (ownPart(k)) shared.viewAll[remap(k)] = clone(Rpc.viewAll[k]);
  for (const k in Rpc.brightMap) if (ownPart(k)) shared.bright[remap(k)] = Rpc.brightMap[k];
  for (const cid of Rpc.clear) if (ownPart(cid)) shared.clear.push(remap(cid));
  const added = Rpc.adds.filter((a) => a.section === id).map((a) => ({ ...clone(a), id: (a.kind === "photo" ? "addp_" : "add_") + (++state.addSeq), section: newId }));
  const removed = (Rpc.removedAll || []).filter((k) => ownPart(k)).map(remap);   // J46 消した部品は複製先にも「消した」で持ち越す（元に戻らない）
  commit({ t: "secDup", srcId: id, afterId: id, newId, type, content, edits: { pc: perDev(Rpc), sp: perDev(Rsp), ...shared }, added, removed, page: pg });
}
// §2 入口の補助（操作ボタンの出し分け）：上下の端・唯一のセクションか
function sectionCan(id) { const R = reduce(activeOps()); const pg = R.secPageMap[id]; if (!pg || pg === "@region") return { up: false, down: false, del: false, exists: false, fixed: pg === "@region" }; const list = R.secMap[pg]; const i = list.findIndex((s) => s.id === id); return { up: i > 0, down: i >= 0 && i < list.length - 1, del: list.length > 1, exists: i >= 0 }; }

