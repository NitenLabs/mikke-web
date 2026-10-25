// 公開の履歴から戻す・公開前チェック・プレビュー・端末
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ===================== §22 §6 公開の履歴から前の版に戻す（見るだけ／この版を下書きにする） =====================
function versionById(id) { if (!id || id === "draft") return null; return _versions.find((v) => v.id === id) || null; }
const publishedChrono = () => _versions.filter((v) => v.kind === "published");   // 古い順
function resolveVerId(sel) { if (sel.id) return sel.id; const pubs = publishedChrono(); if (sel.which === "oldestPub") return pubs.length ? pubs[0].id : null; if (sel.which === "newestPub") return pubs.length ? pubs[pubs.length - 1].id : null; if (sel.which === "initial") return "initial"; return null; }
const seqOf = (draft) => ({ sec: (draft && draft.seq && draft.seq.sec) || 0, add: (draft && draft.seq && draft.seq.add) || 0 });
function viewingVersion() { return state.viewing; }
// §6.2 版を「見るだけ」で出す（今の下書き＝土台・ops・連番を viewBackup に退避）。版の今の形を土台にして描く。
function viewVersion(id) {
  if (state.editing) commitEdit();
  if (!id || id === "draft") { exitView(); return; }
  const v = versionById(id); if (!v) return;
  if (!s_drawable(v.draft || null, v.shop || null)) { if (typeof pgToast === "function") pgToast("この版は一部が壊れていて開けません", false); return; }   // PC-1 描けない版は開かない（画面が真っ白にならないように）
  if (!state.viewing) state.viewBackup = { base: state.base, shopBase: state.shopBase, ops: clone(state.ops), cursor: state.cursor, undoBase: state.undoBase, secSeq: state.secSeq, addSeq: state.addSeq };
  state.viewing = id; state.selected = new Set(); state.selectedSection = null; state.editing = null;
  state.base = v.draft || null; state.shopBase = v.shop || null; state.ops = []; state.cursor = 0; const sq = seqOf(v.draft); state.secSeq = sq.sec; state.addSeq = sq.add;   // 試験台26：① も版の形で見る
  render();
}
function exitView() {
  if (!state.viewing) return;
  const b = state.viewBackup; state.viewing = null; state.viewBackup = null;
  if (b) { state.base = b.base; state.shopBase = b.shopBase; state.ops = b.ops; state.cursor = b.cursor; state.undoBase = b.undoBase; state.secSeq = b.secSeq; state.addSeq = b.addSeq; }
  state.selected = new Set(); state.selectedSection = null;
  render();
}
// §6.3 「この版を下書きにする」：その版の今の形がまるごと新しい土台に（公開中の版は変えない）。
function restoreVersion(id) {
  const vid = id || state.viewing; const v = versionById(vid); if (!v) { exitView(); return; }
  if (!s_drawable(v.draft || null, v.shop || null)) { if (typeof pgToast === "function") pgToast("この版は一部が壊れていて下書きにできません", false); return; }   // PC-1
  const pre = state.viewBackup || { base: state.base, shopBase: state.shopBase, ops: clone(state.ops), cursor: state.cursor, undoBase: state.undoBase, secSeq: state.secSeq, addSeq: state.addSeq };
  const preDraft = foldToDraft(pre.base, pre.ops.slice(0, pre.cursor));
  const preShop = (function () { const sb = state.base, sh = state.shopBase, so = state.ops, sc = state.cursor; state.base = pre.base; state.shopBase = pre.shopBase; state.ops = pre.ops; state.cursor = pre.cursor; const eff = clone(reduce(pre.ops.slice(0, pre.cursor), "pc").effShop); state.base = sb; state.shopBase = sh; state.ops = so; state.cursor = sc; return eff; })();
  const pub = currentPublished();
  if (pub && pub.draft && (canonJSON(preDraft) !== canonJSON(pub.draft) || canonJSON(preShop) !== canonJSON(pub.shop || null))) {   // §6.4 公開中と違う下書き（①②どちらか）だけ「戻す前の下書き」に残す（新しい方から10）
    _versions.push({ id: "b" + (_verSeq++), kind: "beforeRestore", at: Date.now(), draft: preDraft, shop: preShop });
    const brs = _versions.filter((x) => x.kind === "beforeRestore");
    if (brs.length > 10) { const drop = new Set(brs.slice(0, brs.length - 10)); _versions = _versions.filter((x) => !drop.has(x)); }
  }
  state.restoreUndo = { base: pre.base, shopBase: pre.shopBase, ops: clone(pre.ops), cursor: pre.cursor, undoBase: pre.undoBase, secSeq: pre.secSeq, addSeq: pre.addSeq, draft: preDraft, shopDraft: preShop };   // §6.5 戻す1回で置き換える前の下書き（①②）へ
  state.viewing = null; state.viewBackup = null;
  state.base = v.draft || null; state.shopBase = v.shop || null; state.ops = []; state.cursor = 0; state.undoBase = 0; const sq = seqOf(v.draft); state.secSeq = sq.sec; state.addSeq = sq.add; recomputeShopSeq(state.shopBase || SHOP_JSON);
  state.selected = new Set(); state.selectedSection = null; state.editing = null;
  m3OnRestore(v);   // M3 API のときはサーバーの戻す道も通す（pg/m3-api.js）
  render(); scheduleSave();
}

// ===================== §22 §4.2 公開前チェック・長い文の目安 =====================
const LONG_RE = /(?:^|__)(F_[hb][01]|card_name_.+|card_desc_.+|row_name_.+|row_desc_.+)$/;   // 長い文の対象＝特集の見出し/本文・品の名前/説明・表の行の名前/説明
function lineCountOf(el) {
  const cs = getComputedStyle(el); let lh = parseFloat(cs.lineHeight);
  if (!lh || isNaN(lh)) lh = (parseFloat(cs.fontSize) || 16) * 1.5;
  const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
  const h = (el.clientHeight || 0) - padT - padB;
  return Math.max(1, Math.round(h / lh));
}
function measureTextLines() {   // 今の端末の描画から、対象の文字箱の行数を測る（canonId → 行数）
  const out = {};
  for (const inst of state.secList) { const host = document.getElementById(secHostId(inst)); if (!host) continue;
    for (const el of host.querySelectorAll('[data-el]')) { const id = el.getAttribute("data-el"); if (!LONG_RE.test(id)) continue; out[canonId(id)] = lineCountOf(el); } }
  return out;
}
// §4.2 目安＝テンプレの見本の文の行数×1.5 の切り上げ（見本1行なら2）。今の行数とともに部品ごと・端末ごとに返す。
function longTextLimits() {
  const curOps = state.ops.slice(), curCursor = state.cursor, curBase = state.undoBase, curDev = state.device;
  const result = {};
  for (const dev of ["pc", "sp"]) {
    state.device = dev;
    state.ops = []; state.cursor = 0; render(); const tmpl = measureTextLines();   // テンプレ（手直しなし）
    state.ops = curOps; state.cursor = curCursor; render(); const cur = measureTextLines();   // 今
    for (const p in cur) { const base = p.replace(/.*__/, ""); const tl = tmpl[p] || tmpl[base] || 1; const limit = Math.max(2, Math.ceil(tl * 1.5)); (result[p] = result[p] || {})[dev] = { limit, lines: cur[p] }; }   // 複製/追加セクションの部品は、元の見本（base）の行数で目安を出す
  }
  state.device = curDev; state.ops = curOps; state.cursor = curCursor; state.undoBase = curBase; render();
  return result;
}
// §4.2（X31）写真のない枠の呼び名＝『セクションの名前』の N つ目の写真。内部 ID（sec1__F_p0 など）は出さない。
// セクションの名前は足すときの型（特集／品）。N はそのセクションの写真枠の中での並び順（同じ特集に枠が2つあれば 1つ目・2つ目）。
const ORD_JP = ["", "1つ目", "2つ目", "3つ目", "4つ目", "5つ目", "6つ目", "7つ目", "8つ目", "9つ目"];
function emptyPhotoName(part, phList) {
  // PC-23 別のセクションへ移した写真は、元の名前と今の場所で言う（前は移った先の「『品』の4つ目の写真」になり、どれのことか分からなかった）
  if (isCarried(part)) { const inst0 = reduce(activeOps()).secList.find((s) => s.id === secOf(part)); return `${M.friendly(bareOf(part))}（今は『${inst0 && inst0.type === "items" ? "品" : "特集"}』のセクションにあります）`; }
  const sec = secOf(part);
  const inst = reduce(activeOps()).secList.find((s) => s.id === sec);
  const secName = (inst && inst.type === "items") ? "品" : "特集";
  const sameSec = phList.filter((p) => secOf(p.part) === sec);   // そのセクションの写真枠を並び順に
  const idx = sameSec.findIndex((p) => p.part === part);
  const n = idx >= 0 ? idx + 1 : 1;
  return `『${secName}』の${ORD_JP[n] || (n + "つ目")}の写真`;
}
// §4.2 公開前に見てほしい所：PC・スマホの両方で、重なり・長い文・写真のない枠・仕組みの重なり/はみ出しを集める。
function publishCheck() {
  const limits = longTextLimits();
  const curDev = state.device; const items = []; const emptySeen = new Set();   // 写真のない枠は端末に依らない＝1枠1回
  for (const dev of ["pc", "sp"]) {
    state.device = dev; render();
    const w = warnings(); const DL = dev === "pc" ? "PC" : "スマホ";
    // 重なり（ownerOverlaps）：動かした部品を主語にして、同じ部品が複数の相手と重なっていれば1行にまとめる（§4.2）
    const Rd = reduce(activeOps(), dev); const movedP = (id) => !!(Rd.m1[canonId(id)] || Rd.m2[canonId(id)] || isAdded(id));
    const pairs = (w.ownerOverlaps || []).map((o) => [canonId(o.a), canonId(o.b)]);
    const partners = {}; for (const [a, c] of pairs) { (partners[a] = partners[a] || new Set()).add(c); (partners[c] = partners[c] || new Set()).add(a); }
    const used = new Set(); const pk = (a, c) => [a, c].sort().join("|");
    const subjects = Object.keys(partners).filter(movedP).sort((a, c) => partners[c].size - partners[a].size);
    for (const subj of subjects) { const ps = [...partners[subj]].filter((q) => !used.has(pk(subj, q))); if (!ps.length) continue; for (const q of ps) used.add(pk(subj, q)); items.push({ device: dev, kind: "overlap", parts: [subj, ...ps], text: `${DL}：${M.friendly(subj)}が、${[...new Set(ps.map((q) => M.friendly(q)))].join("と")}に重なっています` }); }   // PC-12 同じ名前（品と品と品）は1回
    for (const [a, c] of pairs) { if (used.has(pk(a, c))) continue; used.add(pk(a, c)); items.push({ device: dev, kind: "overlap", parts: [a, c], text: `${DL}：${M.friendly(a)}が、${M.friendly(c)}に重なっています` }); }
    // 長い文：今の行数が目安を越えた部品
    for (const p in limits) { const L = limits[p][dev]; if (L && L.lines > L.limit) items.push({ device: dev, kind: "long", parts: [p], text: `${DL}：${M.friendly(p)}が、目安の長さ（${L.limit}行）を越えています（${L.lines}行）` }); }
    // J55 文字の色が背景に近くて読めない（白地に白など）
    const prgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ""); if (!m) return null; const a = m[1].split(",").map((x) => parseFloat(x)); return { r: a[0], g: a[1], b: a[2], a: a[3] == null ? 1 : a[3] }; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    for (const el of document.querySelectorAll('#sectionwrap [data-kind="text"]')) { const id = el.getAttribute("data-el"); if (!id || !el.innerText.trim()) continue;
      const fg = prgb(getComputedStyle(el).color); if (!fg) continue;
      let bg = null, be = el; while (be && be !== document.body) { const b = prgb(getComputedStyle(be).backgroundColor); if (b && b.a > 0.1) { bg = b; break; } be = be.parentElement; } if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
      const L1 = lum(fg) + 0.05, L2 = lum(bg) + 0.05, ratio = L1 > L2 ? L1 / L2 : L2 / L1;
      if (ratio < 2) items.push({ device: dev, kind: "system", parts: [canonId(id)], text: `${DL}：${M.friendly(id)}の文字の色が背景に近く、読みにくいです` });
    }
    // 写真のない枠（まだ写真が無い＝足したセクション等）。端末に依らないので1枠1回
    const phList = photosApi();
    for (const ph of phList) if (ph.missing && !emptySeen.has(ph.part)) { emptySeen.add(ph.part); items.push({ device: dev, kind: "emptyPhoto", parts: [ph.part], text: `足した${emptyPhotoName(ph.part, phList)}がまだありません。公開すると、この枠は詰めて出しません` }); }
    // F64 元からある写真を外した枠も、公開すると詰めて出さないので知らせる
    for (const ph of phList) if (ph.cleared && !ph.missing && !emptySeen.has(ph.part)) { emptySeen.add(ph.part); items.push({ device: dev, kind: "emptyPhoto", parts: [ph.part], text: `${emptyPhotoName(ph.part, phList)}を外しています。公開すると、この枠は詰めて出しません` }); }
    a1EmptyTextItems(dev, items, emptySeen);   // J56・J41 空の見出し・品名（text-style.js）
    // 仕組みの重なり・はみ出し（ふつうは空）
    for (const o of w.overlaps || []) items.push({ device: dev, kind: "system", parts: [canonId(o.a), canonId(o.b)], text: `${DL}：${M.friendly(o.a)}が、${M.friendly(o.b)}に重なっています` });
    for (const o of w.overflows || []) items.push({ device: dev, kind: "system", parts: [canonId(o.id)], text: o.dir ? `${DL}：${M.friendly(o.id)}が画面の${o.dir}へはみ出しています（${o.dir}の端が切れて見えます）` : `${DL}：${M.friendly(o.id)}がはみ出しています` });   // F68 どの部品が・どちらへ
  }
  state.device = curDev; render();
  for (const it of s_deadLinkItems()) items.push(it);   // PC-25 行き先のセクションを消したリンク
  for (const it of shopInfoChecks()) items.push(it);   // F24 お店の情報（①）の電話・住所が空・電話でない値（pg/shopinfo-pages.js）
  return items;
}
// PC-25 「このページの『…』」のリンクで、行き先のセクションがそのページに無くなったもの（消した・ほかのページの物）。文の一部のリンクと部品まるごとのリンクの両方
function s_anchorAlive(lk, part, R) { if (!lk || lk.kind !== "anchor") return true; if (!lk.sec) return false; const pg = R.secPageMap[secOf(part)]; const tp = R.secPageMap[lk.sec]; return !!tp && tp !== "@region" && (pg === "@region" || pg === tp); }
function s_deadLinkItems() {
  const R = reduce(activeOps(), "pc"); const out = []; const gone = new Set(R.removedAll || []);
  const live = (id) => !gone.has(id) && !!R.secPageMap[secOf(id)];
  const add = (id, lk) => out.push({ device: "pc", kind: "link", page: R.secPageMap[secOf(id)] === "@region" ? null : R.secPageMap[secOf(id)], parts: [id], text: `${M.friendly(id)}のリンクの行き先（『${friendlySec(lk.sec)}』のセクション）がありません。公開すると、押しても何も起きません。リンクを直すか外してください` });
  for (const id in R.runsMap) { if (!live(id)) continue; const seen = new Set(); for (const r of R.runsMap[id] || []) if (r.link && !s_anchorAlive(r.link, id, R) && !seen.has(r.link.sec)) { seen.add(r.link.sec); add(id, r.link); } }
  for (const id in R.linkMap) { if (!live(id)) continue; const lk = R.linkMap[id]; if (!s_anchorAlive(lk, id, R)) add(id, lk); }
  return out;
}
function deadLinkCount(sec) { return s_deadLinkItems().filter((it) => { const R = reduce(activeOps(), "pc"); const id = it.parts[0]; const ls = [...((R.runsMap[id] || []).map((r) => r.link)), R.linkMap[id]]; return ls.some((l) => l && l.kind === "anchor" && l.sec === sec); }).length; }
function setDevice(d) { if (state.editing) commitEdit(); state.device = d; render(); }

// ===================== §22 §5 プレビュー（お客さんが見る形） =====================
function enterPreview() { if (state.preview) return; if (state.editing) commitEdit(); state.selected = new Set(); state.selectedSection = null; state.preview = true; render(); }
function exitPreview() { if (!state.preview) return; state.preview = false; render(); }   // §5.4 スクロールは保つ・選び直さない
function previewMode() { return state.preview; }
// §5.5 公開の描き方での位置（写真のない枠は詰める）。プレビューと ±0.5 で一致する基準。
function publishedGeometry(device) {
  device = device || state.device;
  if (state.preview && device === state.device) return geometry();
  const here = state.device; state._pubGeo = true; state.device = device; render();
  const g = geometry(); state._pubGeo = false; state.device = here; render(); return g;
}

