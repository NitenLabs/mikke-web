// 今の形を作る（fold・下書き 4.9）・鍵をそろえた JSON
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- §24（試験台24）今の形を作る（fold）：PC・スマホの両方で畳み、1つの下書き（4.9＋_pg）にまとめる ----
// 保存・版・「公開中と同じか」の比べ・draft()/roundTrip() で使う。state.base＋activeOps() から作る。
function runStyledRuns(r) { return !!(r && (r.length > 1 || (r[0] && (r[0].bold || r[0].italic || r[0].underline || r[0].color != null || (r[0].scale && r[0].scale !== 1) || r[0].font || r[0].link)))); }
// §24b 今の形を作る（fold）。文字・写真はテンプレの初めの中身と比べて「違うものだけ」content[] に（4.9「テンプレと同じ値は書かない」）。
// 幾何は adjust[端末] に（4.9.1）。足した部品は added[]＋adjust に。品・表の行は _pg.rows に器ごと（4.11④が未決）。
function foldToDraft(baseOverride, opsOverride) {
  const savedBase = state.base, savedOps = state.ops, savedCursor = state.cursor, savedDev = state.device;
  if (baseOverride !== undefined) state.base = baseOverride;
  if (opsOverride !== undefined) { state.ops = opsOverride; state.cursor = opsOverride.length; }
  const full = base();
  const R = reduce(activeOps(), "pc"), Rsp = reduce(activeOps(), "sp");
  const content = {};
  const ensureObj = (id) => { if (!content[id] || Array.isArray(content[id]) || typeof content[id] !== "object") content[id] = {}; return content[id]; };
  // §24b/c 部品 ID を指す所は、複製・足したセクションでは全部の ID（sec*__…）で書く（4.9.3 の ID の決まり）。@印・足した部品はそのまま。
  const pfxRef = (ref, secId) => (!ref || !secId || secId === "feature" || secId === "items" || ref[0] === "@" || isAdded(ref) || ref.indexOf(SEP) >= 0) ? ref : (secId + SEP + ref);
  const putText = (pid, cur, tmpl) => { if (R.runsMap[pid] && runStyledRuns(R.runsMap[pid])) content[pid] = clone(R.runsMap[pid]); else if (cur != null && cur !== tmpl) content[pid] = cur; };
  // 1. テンプレの初めの中身と比べて、違う文字・写真だけ content[] に（特集はブロック、品は甘味処の見出し・時間）
  for (const inst of R.allSecs) {   // 試験台28：全ページ＋ヘッダー・フッターの文字の差分を拾う（今のページだけでない）
    const pfx = (inst.id === "feature" || inst.id === "items") ? "" : inst.id + SEP;
    const slice = R.secContent[inst.id], tmpl = tmplSliceOf(inst, full);
    if (!slice) continue;
    if (inst.type === "feature" && slice.blocks) {
      slice.blocks.forEach((bl, i) => {
        const tb = tmpl.blocks && tmpl.blocks[i];
        putText(pfx + "F_h" + i, bl.heading, tb ? tb.heading : undefined);
        putText(pfx + "F_b" + i, bl.body, tb ? tb.body : undefined);
        const curA = bl.photo ? bl.photo.asset : undefined, tA = tb && tb.photo ? tb.photo.asset : undefined;
        if (curA && curA !== tA) ensureObj(pfx + "F_p" + i).asset = curA;
      });
    } else if (inst.type === "items") {
      putText(pfx + "I_kanmi", slice.kanmiLabel, tmpl.kanmiLabel);   // §X37
      putText(pfx + "I_time", slice.kanmiTime, tmpl.kanmiTime);      // §X37
    } else if (inst.type === "header") { putText(pfx + "logo", slice.logo, tmpl.logo); }
    else if (inst.type === "footer") { putText(pfx + "fname", slice.name, tmpl.name); putText(pfx + "faddr", slice.addr, shopLinkedTmpl(inst, "faddr", R.effShop)); putText(pfx + "fcopy", slice.copy, tmpl.copy); }
    else if (inst.type === "menuHdr") { putText(pfx + "men", slice.en, tmpl.en); putText(pfx + "mtitle", slice.title, tmpl.title); }
    else if (inst.type === "contactHdr") { putText(pfx + "cen", slice.en, tmpl.en); putText(pfx + "ctitle", slice.title, tmpl.title); }
    // 試験台28 §2.4：MENU 本体は ① 連動（品の名前・説明・価格、括りの見出し、メニューの見出し）＝下書き content には書かない（① の下書き=shop に入る）。
    else if (inst.type === "contact" && Array.isArray(slice.rows)) {
      putText(pfx + "clead", slice.lead, tmpl.lead);
      slice.rows.forEach((r, i) => { const tr = (tmpl.rows || [])[i];
        putText(pfx + "cl_" + r.id, r.label, tr ? tr.label : undefined);
        const lt = shopLinkedTmpl(inst, "ci_" + r.id, R.effShop); putText(pfx + "ci_" + r.id, r.value, lt !== undefined ? lt : (tr ? tr.value : undefined));   // J44・J45 ① と連動する行は ① の値と比べる
      });
    }
  }
  // 2. 足した部品の文字・写真（4.9.3「焼き込んだ文字・写真は content[id]」）
  for (const a of R.adds) {
    if (a.kind === "photo") { const asset = R.replaceMap[a.id] != null ? R.replaceMap[a.id] : a.asset; if (asset) ensureObj(a.id).asset = asset; }
    else if (R.runsMap[a.id] && runStyledRuns(R.runsMap[a.id])) content[a.id] = clone(R.runsMap[a.id]);
    else { const t = R.editMap[a.id] != null ? R.editMap[a.id] : a.text; if (t) content[a.id] = t; }
  }
  // 3. 明るさ・外す・部品リンク（端末共通マップ）
  for (const id in R.brightMap) ensureObj(id).bright = R.brightMap[id];
  for (const id of R.clear) ensureObj(id).cleared = true;
  for (const id in R.linkMap) {
    if (isText(id)) { const c = content[id]; content[id] = { ...(Array.isArray(c) ? { runs: c } : (typeof c === "string" ? { text: c } : {})), link: clone(R.linkMap[id]) }; continue; }   // P14 文字の箱まるごとのリンク：{text|runs, link}
    if (!Array.isArray(content[id])) ensureObj(id).link = clone(R.linkMap[id]);
  }
  // added[]（4.9.3）。size・style・section は求められないので足す（§2.3・報告）
  const added = R.adds.map((a) => {
    const placedOn = a.placedDevice || "pc", other = placedOn === "pc" ? "sp" : "pc";
    const anchor = pfxRef(a.anchor, a.section);
    const o = { id: a.id, kind: a.kind, placedOn, anchor };
    if (a.from) o.from = a.from;
    // §2.1 section は anchor から求まるなら書かない。anchor が足した部品／@印（@section 等）を指す場合は辿れないので残す（J24）
    if (isAdded(a.anchor) || (a.anchor && a.anchor[0] === "@")) o.section = a.section;
    const sz = {}; sz[placedOn] = { w: a.w }; if (a.h != null) sz[placedOn].h = a.h; sz[other] = { w: a.wOther != null ? a.wOther : a.w }; const ho = a.hOther != null ? a.hOther : a.h; if (ho != null) sz[other].h = ho;
    o.size = sz;
    if (a.kind !== "photo" && a.styleName && a.styleName !== "featBody") o.style = a.styleName;
    return o;
  });
  // adjust[端末]（4.9.1）：部品ごと {move|place,size,z,cols,view}＋縦積みの order＋左右の swap
  const mkAdjust = (Rd, dev) => {
    const adj = {}; const set = (id, k, v) => { (adj[id] = adj[id] || {})[k] = v; };
    for (const id in Rd.m1) set(id, "move", clone(Rd.m1[id]));
    for (const id in Rd.m2) set(id, "place", { after: pfxRef(Rd.m2[id].anchor, secOf(id)), gap: Rd.m2[id].gapY, x: Rd.m2[id].x });   // テンプレの浮き（added は除去済み）。after は全部の ID で
    for (const id in Rd.sizes) set(id, "size", clone(Rd.sizes[id]));
    for (const id in Rd.zmap) set(id, "z", Rd.zmap[id]);
    for (const id in Rd.colsMap) if (Rd.colsMap[id][dev] != null) set(id, "cols", Rd.colsMap[id][dev]);
    for (const id in Rd.viewAll) if (Rd.viewAll[id][dev]) set(id, "view", clone(Rd.viewAll[id][dev]));
    for (const key in Rd.order) set(key, "order", clone(Rd.order[key]));   // 並び順の子は内部で既に全部の ID
    for (const sec in Rd.swapMap) if (Rd.swapMap[sec][dev]) set(sec, "swap", clone(Rd.swapMap[sec][dev]));
    for (const a of Rd.added) if (!a.isAuto) set(a.id, "place", { after: pfxRef(a.anchor, a.section), gap: a.gap, x: a.x });   // 足した部品の置いた位置（§2.3）。after は全部の ID で
    return adj;
  };
  // 試験台26：並びの設定（② の content[並びID]）＝テンプレの既定と違うときだけ content[gid] に書く（_pg.rows はやめた）
  for (const gid in R.sourceResolved) { const spec = R.sourceResolved[gid]; const tmpl = templateSource(gid); if (canonJSON(spec) !== canonJSON(tmpl)) content[gid] = clone(spec); }
  // §2.2 空の入れ物は書かない（4.9「何もしていない所は書かない」）。何もしていない下書きは {template, sections} だけ。
  const draft = { template: { name: "wa-01", version: 1 }, sections: clone(R.secMap) };   // 試験台28：ページ ID → 並び（§2.3）
  if (state.secSeq || state.addSeq) draft.seq = { sec: state.secSeq, add: state.addSeq };
  if (Object.keys(content).length) draft.content = content;
  if (added.length) draft.added = added;
  if (R.removedAll.length) draft.removed = clone(R.removedAll);
  if (Object.keys(R.textStyles).length) draft.textStyle = clone(R.textStyles);
  const apc = mkAdjust(R, "pc"), asp = mkAdjust(Rsp, "sp"), adj = {};
  if (Object.keys(apc).length) adj.pc = apc; if (Object.keys(asp).length) adj.sp = asp;
  if (Object.keys(adj).length) draft.adjust = adj;
  state.base = savedBase; state.ops = savedOps; state.cursor = savedCursor; state.device = savedDev;
  return draft;
}
// §24 同じ中身なら同じ文字列になるよう、鍵を並べて JSON 化（「直してから元どおり」で一致させる）。_pg も含めて比べる。recentColors は含めない（§2.6）。
function canonJSON(x) {
  const seen = new WeakSet();
  const norm = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return null; seen.add(v);
    if (Array.isArray(v)) return v.map(norm);
    const o = {}; for (const k of Object.keys(v).sort()) { if (v[k] === undefined) continue; o[k] = norm(v[k]); } return o;
  };
  return JSON.stringify(norm(x));
}

function secNode(sec) { return document.getElementById("host_" + sec)?.querySelector("#sec"); }
const secHostId = (inst) => "host_" + inst.id;
function secLabelText(inst) {
  if (inst.id === "feature") return "FEATURE（芦屋堂の味）"; if (inst.id === "items") return "ITEMS（おすすめの品）";
  // 試験台28：ヘッダー・フッター（全ページ共通）・MENU・CONTACT のセクション見出し
  if (inst.type === "header") return "ヘッダー（全ページ共通）"; if (inst.type === "footer") return "フッター（全ページ共通）";
  if (inst.type === "menuHdr") return "お品書きの帯"; if (inst.type === "menu") return "お品書き本体";
  if (inst.type === "contactHdr") return "アクセスの帯"; if (inst.type === "contact") return "アクセス本体";
  return (inst.type === "feature" ? "FEATURE" : "ITEMS") + "（複製／追加）";
}
