// 操作の記録 → content / edits（種まき・reduce）
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- content への文字の反映（パーツの属するインスタンスの content へ振り分ける）----
// secContent[インスタンスID] は、feature なら {label,blocks,...}、items なら {label,cards,table,...} の「スライス」。
function routeSetContent(secContent, id, text) {
  const c = secContent[homeSec(id)]; if (!c) return false; const b = bareOf(id);   // J17 中身は生まれたセクションの content にある（別のセクションへ移しても）
  const mB = { F_h0: [0, "heading"], F_b0: [0, "body"], F_h1: [1, "heading"], F_b1: [1, "body"] };
  if (mB[b] && c.blocks) { c.blocks[mB[b][0]][mB[b][1]] = text; return true; }
  let m;
  if ((m = b.match(/^card_(name|desc|price)_(.+)$/)) && c.cards) { const card = c.cards.find((x) => x.id === m[2]); if (card) card[m[1]] = text; return true; }
  if ((m = b.match(/^row_(name|desc|price)_(.+)$/)) && c.table) { const row = c.table.find((x) => x.id === m[2]); if (row) row[m[1]] = text; return true; }
  if (b === "I_kanmi") { c.kanmiLabel = text; return true; }   // §X37 甘味処の見出し（b-anchor/model.mjs の kanmiLabel）
  if (b === "I_time") { c.kanmiTime = text; return true; }     // §X37 提供時間（kanmiTime）
  // 試験台28：新しいページの文字（ヘッダー・フッター・MENU帯・CONTACT帯・MENU本体・CONTACT本体）
  if (b === "logo") { c.logo = text; return true; }
  if (b === "fname") { c.name = text; return true; } if (b === "faddr") { c.addr = text; return true; } if (b === "fcopy") { c.copy = text; return true; }
  if (b === "men" || b === "cen") { c.en = text; return true; } if (b === "mtitle" || b === "ctitle") { c.title = text; return true; }
  if (c.groups) {   // MENU 本体：括りの見出し・提供時間・品の名前/説明/価格
    if ((m = b.match(/^mg_(.+)$/))) { const g = c.groups.find((x) => x.id === m[1]); if (g) g.name = text; return true; }
    if ((m = b.match(/^mt_(.+)$/))) { const g = c.groups.find((x) => x.id === m[1]); if (g) g.time = text; return true; }
    if ((m = b.match(/^mc_(.+)$/))) { for (const g of c.groups) { const cat = g.cats.find((x) => x.id === m[1]); if (cat) { cat.name = text; return true; } } return true; }
    if ((m = b.match(/^row_(name|desc|price)_(.+)$/))) { for (const g of c.groups) for (const cat of g.cats) { const row = cat.rows.find((x) => x.id === m[2]); if (row) { row[m[1]] = text; return true; } } return true; }
  }
  if (c.rows && Array.isArray(c.rows)) {   // CONTACT 本体：リード文・各行のラベル/値
    if (b === "clead") { c.lead = text; return true; }
    if ((m = b.match(/^cl_(.+)$/))) { const r = c.rows.find((x) => x.id === m[1]); if (r) r.label = text; return true; }
    if ((m = b.match(/^ci_(.+)$/))) { const r = c.rows.find((x) => x.id === m[1]); if (r) r.value = text; return true; }
  }
  return false;
}
function routeReplaceAsset(secContent, pid, asset) {
  const c = secContent[homeSec(pid)]; if (!c) return; const b = bareOf(pid); let m;
  if ((m = b.match(/^F_p(\d)$/)) && c.blocks) { if (c.blocks[+m[1]]) c.blocks[+m[1]].photo.asset = asset; }
  else if ((m = b.match(/^card_photo_(.+)$/)) && c.cards) { const card = c.cards.find((x) => x.id === m[1]); if (card) card.photo.asset = asset; }
}

// ---- §24b（試験台24b）土台（4.9 の下書き）→ reduce の入れ物に種まきする（seed）----
// base が null＝最初の形。secContent はテンプレ＋_pg.rows（品・表の行）から組み、文字・写真は content[] から戻す。
// 幾何は adjust[端末] から（4.9.1）。足した部品は added[]＋adjust から内部の adds エントリに組み直す（描画ループは不変）。
const tmplSliceOf = (inst, full) => {
  if (inst.id === "feature" || inst.id === "items") return clone(full[inst.type]);
  if (PAGE_CONTENT_KEY[inst.type] && full[PAGE_CONTENT_KEY[inst.type]]) return clone(full[PAGE_CONTENT_KEY[inst.type]]);
  return templateSectionContent(inst.type);   // 複製した feature/items（sec*）
};
// 下書きの sections（4.9＋§2.3）→ ページ ID → セクションの並び。配列（試験台27 までの形）は pg_home の並びとして読む。
function readSecMap(b) {
  const def = () => { const m = {}; for (const p of PAGE_IDS) m[p] = clone(PAGE_DEF[p]); return m; };
  if (!b || !b.sections) return def();
  if (Array.isArray(b.sections)) { const m = def(); m.pg_home = clone(b.sections); return m; }
  const m = {}; for (const p of PAGE_IDS) m[p] = clone(b.sections[p] || PAGE_DEF[p]); return m;
}
function seedText(S, id, plain) { if (isAdded(id)) S.editMap[id] = plain; else routeSetContent(S.secContent, id, plain); }
function seedAsset(S, id, asset) { if (isAdded(id)) S.replaceMap[id] = asset; else routeReplaceAsset(S.secContent, id, asset); }
function seedFromBase(b, device, full) {
  full = full || base();
  const secMap = readSecMap(b);
  const S = {
    secMap, regionHead: [clone(REGION_HEAD)], regionFoot: [clone(REGION_FOOT)],
    secContent: {}, editMap: {}, replaceMap: {}, adds: [], removed: new Set(),
    m1: {}, m2: {}, order: {}, zmap: {}, sizes: {}, colsMap: {}, swapMap: {}, viewAll: {},
    brightMap: {}, textStyles: {}, runsMap: {}, linkMap: {}, clearL: [], placedFollow: {}, placedCleared: new Set(),
    baseSource: {}, relocated: {},
  };
  // 1. secContent＝全セクション（ヘッダー・フッター＋全ページ）のテンプレの初めの中身に、_pg.rows を差し込む。
  // feature/items は、セクションから消されていても必ず持つ（reduce/描画が content.feature/items を前提にするため）。
  S.secContent = { feature: clone(full.feature), items: clone(full.items) };
  const seedSecs = [...S.regionHead, ...PAGE_IDS.flatMap((p) => secMap[p]), ...S.regionFoot];
  for (const inst of seedSecs) {
    const sc = tmplSliceOf(inst, full);
    const rows = b && b._pg && b._pg.rows && b._pg.rows[inst.id];
    if (rows) { if (rows.cards) sc.cards = clone(rows.cards); if (rows.table) sc.table = clone(rows.table); }
    S.secContent[inst.id] = sc;
  }
  if (!b) return S;
  // J17 別のセクションへ移した部品（4.9.3 relocated）。生まれたセクションを消していても中身を戻せるよう、入れ物を用意する
  for (const id in (b.relocated || {})) { const r = b.relocated[id]; if (!r || !r.section) continue; S.relocated[id] = { section: r.section, anchor: r.anchor ? ((b.relocated[r.anchor] || isAdded(r.anchor)) ? r.anchor : bareOf(r.anchor)) : "@section" };
    const h = homeSec(id); if (!S.secContent[h]) S.secContent[h] = templateSectionContent(/^F_/.test(bareOf(id)) ? "feature" : "items"); }
  // 2. 足した部品＝added[]＋adjust から内部の adds エントリに戻す（§2.1：下書きの全部の ID → 内部の素の ID に戻す。section は anchor から求める）
  const addedById = {}; for (const a of (b.added || [])) addedById[a.id] = a;
  const seedRef = (ref) => (typeof ref !== "string" || !ref) ? "@section" : ((b.relocated && b.relocated[ref]) ? ref : bareOf(ref));   // PC-1 付いていく先の無い記録は「セクションの上」に   // J17 よそから移ってきた部品を指す所は、その ID のまま（素の ID に戻すと移った先の部品と取り違える）
  const secOfRef = (ref, depth) => { if (typeof ref !== "string" || !ref || (depth || 0) > 20) return null; if (b.relocated && b.relocated[ref] && b.relocated[ref].section) return b.relocated[ref].section; const t = instTag(ref); if (t) return t; if (isAdded(ref)) { const aa = addedById[ref]; return aa ? (aa.section || secOfRef(aa.anchor, (depth || 0) + 1)) : "items"; } return (ref && ref.startsWith("F_")) ? "feature" : "items"; };
  // PC-1 壊れた記録でも開けるように：付いていく先も所属も分からない足した部品・文字や写真を置けないセクション（帯・本体・ヘッダー/フッター）の足した部品は読まない（ほかの手直しはそのまま戻す）
  const holdSecs = new Set(PAGE_IDS.flatMap((p) => secMap[p] || []).filter((s) => s.type === "feature" || s.type === "items").map((s) => s.id)); holdSecs.add("feature"); holdSecs.add("items");
  for (const a of (b.added || [])) {
    if (!a || typeof a.id !== "string" || !isAdded(a.id)) continue;
    const secA = (typeof a.section === "string" && a.section) || secOfRef(a.anchor);
    if (!secA || !holdSecs.has(secA)) { S.dropped = (S.dropped || []).concat(a.id); continue; }
    const anc = (typeof a.anchor === "string" && a.anchor) ? a.anchor : "@section";   // 記録（土台）は書き換えない
    const placedOn = a.placedOn || "pc", other = placedOn === "pc" ? "sp" : "pc", sz = a.size || {};
    const section = secA, anchorBare = seedRef(anc);
    const e = { id: a.id, kind: a.kind, section, anchor: anchorBare, from: a.from,
      styleName: a.style || (a.kind === "photo" ? undefined : "featBody"), placedDevice: placedOn,
      w: sz[placedOn] && sz[placedOn].w, h: sz[placedOn] && sz[placedOn].h, wOther: sz[other] && sz[other].w, hOther: sz[other] && sz[other].h,
      gap: 16, gapOther: 16, x: "@left" };
    const pl = b.adjust && b.adjust[placedOn] && b.adjust[placedOn][a.id] && b.adjust[placedOn][a.id].place;
    if (pl) { const ab = seedRef(pl.after); e.placed = { device: placedOn, anchor: ab, gapY: pl.gap, x: pl.x }; S.placedFollow[a.id] = { anchor: ab, device: placedOn }; }   // 付いていく先は place.after から（§2.3・保存しない）
    else { e.placed = { device: placedOn, anchor: anchorBare, gapY: 16, x: "@left" }; S.placedCleared.add(a.id); }   // §X36/§2.3 place が無い＝「元の位置に戻した（自動）」。placedCleared で自動の位置に（開き直しでも保つ）
    S.adds.push(e);
  }
  S.removed = new Set(b.removed || []);
  // 3. content[]＝文字（文字列/切れ目の並び）・写真 asset・明るさ・外す・部品リンク
  for (const id in (b.content || {})) {
    const v = b.content[id];
    // 試験台26：並びの設定（② の content[並びID]＝{menu,label?,category?,count?} か {menu,pick}）はソースマップへ
    if (isGroupId(id) && v && typeof v === "object" && !Array.isArray(v) && (v.menu || v.pick)) { S.baseSource[id] = clone(v); continue; }
    if (Array.isArray(v)) { S.runsMap[id] = clone(v); seedText(S, id, v.map((r) => r.text).join("")); }
    else if (typeof v === "string") { seedText(S, id, v); }
    else if (v && typeof v === "object") { if (Array.isArray(v.runs)) { S.runsMap[id] = clone(v.runs); seedText(S, id, v.runs.map((r) => r.text).join("")); } else if (typeof v.text === "string") seedText(S, id, v.text);   // P14 文字の箱まるごとのリンク {text|runs, link}
      if (v.asset != null) seedAsset(S, id, v.asset); if (v.bright) S.brightMap[id] = v.bright; if (v.cleared) S.clearL.push(id); if (v.link) S.linkMap[id] = clone(v.link); }
  }
  S.textStyles = clone(b.textStyle || {});
  // 4. adjust[端末]→入れ物。端末共通のマップ（cols/view/swap）は両端末ぶんを集める。端末ごと（m1/m2/order/sizes/z）は今の端末だけ。
  for (const d of ["pc", "sp"]) {
    const adj = (b.adjust && b.adjust[d]) || {};
    for (const key in adj) {
      const e = adj[key];
      if (e.swap) { (S.swapMap[key] = S.swapMap[key] || {})[d] = clone(e.swap); }
      if (e.cols != null) { (S.colsMap[key] = S.colsMap[key] || {})[d] = e.cols; }
      if (e.view) { (S.viewAll[key] = S.viewAll[key] || {})[d] = clone(e.view); }
      if (d === device) {
        if (e.order) S.order[key] = clone(e.order);
        if (e.move) S.m1[key] = clone(e.move);
        if (e.place && !isFlowOnly(key)) S.m2[key]   // PC-2・SP-1 品の並び・表・ボタンの塊の外の記録は使わない（描けずに消えていた）
 = { anchor: seedRef(e.place.after), gapY: e.place.gap, x: e.place.x };   // §2.1 全部の ID → 内部の素の ID
        if (e.size) S.sizes[key] = clone(e.size);
        if (e.z != null) S.zmap[key] = e.z;
      }
    }
  }
  return S;
}

// ---- 操作列 → content / edits ----
function reduce(ops, device, peek) {
  device = device || state.device;
  const full = base();
  // §24 土台から種まき（base が null なら最初の形）。以降の op の畳み込みは試験台23 と同一。
  const S = seedFromBase(state.base, device, full);
  // 試験台28：セクションの並びはページごと（secMap）＋固定のヘッダー・フッター。セクション操作は op.page のページの並びに効く。
  const secMap = S.secMap, regionHead = S.regionHead, regionFoot = S.regionFoot;
  const pageListOf = (secId) => { for (const p of PAGE_IDS) if ((secMap[p] || []).some((s) => s.id === secId)) return secMap[p]; return null; };
  const secContent = S.secContent;
  const editMap = S.editMap; const adds = S.adds; const removed = S.removed;
  const m1 = S.m1, m2 = S.m2, clearL = S.clearL; const tpl = {}; const order = S.order; const zmap = S.zmap; const sizes = S.sizes; const colsMap = S.colsMap; const swapMap = S.swapMap;   // §20 列：I_cards→{pc,sp}／§5 左右入替：sec→{pc:{block:bool}}
  const placedCleared = (S.placedCleared instanceof Set) ? S.placedCleared : new Set();        // §3/§4 足した部品のうち「元に戻す」で手直し位置を捨てる（＝自動の位置）。§24b：土台から種まきした分も含む
  const placedFollow = S.placedFollow;     // §X13 足した部品の「置いた端末での今の付いていく先」（どちらの端末の reduce でも覚える）
  const replaceMap = S.replaceMap, viewAll = S.viewAll;   // §1 写真の差し替え（端末共通）／§2 見せる範囲（端末ごと）
  const brightMap = S.brightMap;          // §5（試験台17）写真の明るさ：枠ごと（中身・端末共通）。-40〜+40。差し替えで0に戻す。
  const textStyles = S.textStyles;        // §12 文字の見た目：鍵→{weight,color,size:{pc,sp}}（weight/color は端末共通・size は端末ごと）
  const runsMap = S.runsMap;              // §13 文の一部の見た目：部品ID→[{text,bold?,color?,scale?,font?,link?}]（中身＝PC/SP 共通）
  const linkMap = S.linkMap;              // §19 部品まるごとのリンク：写真・ボタン→リンク（中身＝PC/SP 共通。「元に戻す」で消えない）
  const delCards = {}, delRows = {};      // インスタンスID → 消す card/row id の Set（旧 _pg 用・試験台26 では未使用）
  const baseSource = S.baseSource || {};  // 試験台26：② の並びの設定（土台）
  const shopOps = [];                     // 試験台26：① に効く op（順序どおり畳む）
  const sourceSess = {};                  // 試験台26：この画面で変えた並びの設定（並びID→spec）
  const relocated = S.relocated || {};    // J17 テンプレの部品 → {section, anchor}（端末共通の所属。位置は m2＝端末ごと）
  const orderSec = (k) => (/^F/.test(bareOf(k)) ? "feature" : "items");
  const scopeIds = (scope, id) => {
    if (scope === "part") return [canonId(id)];
    const all = [...TEMPLATE_DRAG, ...adds.map((a) => a.id)];
    if (scope === "page") return all;
    return all.filter((x) => secOf(x) === secOf(id));
  };
  for (const op of ops) {
    if (op.t === "edit") { if (op.runs) { runsMap[op.id] = op.runs; editMap[op.id] = op.runs.map((r) => r.text).join(""); } else { editMap[op.id] = op.text; delete runsMap[op.id]; } }
    else if (op.t === "catAct") { if (op.shops) for (const s of op.shops) shopOps.push(s); if (op.src) { if (op.src.spec) sourceSess[op.src.gid] = clone(op.src.spec); else delete sourceSess[op.src.gid]; } }   // 試験台26：① と ② をまとめて1回で（戻す1回）
    else if (op.t === "add") { if (!removed.has(op.id)) adds.push(op); }
    else if (op.t === "del") { for (const did of (op.ids || [op.id])) { const inst = secOf(did); const bb = bareOf(did); if (/^card_/.test(bb)) (delCards[inst] = delCards[inst] || new Set()).add(cardIdOf(did)); else if (/^row_/.test(bb)) (delRows[inst] = delRows[inst] || new Set()).add(cardIdOf(did)); removed.add(did); for (let i = adds.length - 1; i >= 0; i--) if (adds[i].id === did) adds.splice(i, 1); delete m1[did]; delete m2[did]; } }   // J13 ids 配列（複数まとめ）にも対応
    else if (op.t === "clear") { if (!clearL.includes(op.id)) clearL.push(op.id); }
    else if (op.t === "unclear") { const i = clearL.indexOf(op.id); if (i >= 0) clearL.splice(i, 1); }
    // §1 差し替え：素材を入れ替える（端末共通）。外した印は消す。両端末の見せる範囲は真ん中・1倍に戻す（＝view を捨てる）
    else if (op.t === "replace") { replaceMap[op.id] = op.asset; const i = clearL.indexOf(op.id); if (i >= 0) clearL.splice(i, 1); delete viewAll[op.id]; delete brightMap[op.id]; }
    // §5 明るさ：枠ごとの値（端末共通）。差し替えで消える（上の replace）。外す/戻すでは消さない（外す前の値に戻る）
    else if (op.t === "bright") { if (op.v) brightMap[op.id] = op.v; else delete brightMap[op.id]; }
    // §2 見せる範囲：端末ごとに {x,y,zoom}（端末で絞らない＝両端末ぶんを集める）
    else if (op.t === "view") { (viewAll[op.id] = viewAll[op.id] || {})[op.device] = { x: op.x, y: op.y, zoom: op.zoom }; }
    else if (op.t === "template") Object.assign(tpl, op.v);
    else if (op.t === "addCard") { const c = secContent[op.section || "items"]; if (c && c.cards) { const i = c.cards.findIndex((x) => x.id === op.after); if (i >= 0) c.cards.splice(i + 1, 0, clone(op.card)); else c.cards.push(clone(op.card)); } }
    else if (op.t === "addRow") { const c = secContent[op.section || "items"]; if (c && c.table) { const i = c.table.findIndex((x) => x.id === op.after); if (i >= 0) c.table.splice(i + 1, 0, clone(op.row)); else c.table.push(clone(op.row)); } }
    // §2 セクションの操作（ページの組み立て＝端末共通・1操作1undo）。「このページを元に戻す」では戻さない。試験台28：op.page のページの並びに効く。
    else if (op.t === "secMove") { const list = secMap[op.page] || pageListOf(op.id); if (list) { const i = list.findIndex((s) => s.id === op.id); if (i >= 0) { const j = i + op.delta; if (j >= 0 && j < list.length) { const [x] = list.splice(i, 1); list.splice(j, 0, x); } } } }
    else if (op.t === "secDel") { const list = secMap[op.page] || pageListOf(op.id); if (list) { const i = list.findIndex((s) => s.id === op.id); if (i >= 0) list.splice(i, 1); } }
    else if (op.t === "secAdd") { const list = secMap[op.page] || secMap[PAGE_IDS[0]]; const i = list.findIndex((s) => s.id === op.afterId); const at = (op.pos != null) ? op.pos : (i >= 0 ? i + 1 : list.length); list.splice(at, 0, { id: op.newId, type: op.type, from: "@new" }); secContent[op.newId] = clone(op.content); }
    else if (op.t === "secDup") {
      const list = secMap[op.page] || pageListOf(op.srcId) || secMap[PAGE_IDS[0]]; const i = list.findIndex((s) => s.id === op.afterId); list.splice(i >= 0 ? i + 1 : list.length, 0, { id: op.newId, type: op.type, from: op.srcId });
      secContent[op.newId] = clone(op.content);
      const dev = (op.edits && op.edits[device]) || {};
      Object.assign(m1, dev.m1 || {}); Object.assign(m2, dev.m2 || {}); Object.assign(zmap, dev.zmap || {});
      for (const k in (dev.sizes || {})) sizes[k] = clone(dev.sizes[k]); for (const k in (dev.order || {})) order[k] = dev.order[k].slice();
      for (const k in (op.edits.textStyles || {})) textStyles[k] = clone(op.edits.textStyles[k]);
      for (const k in (op.edits.runsMap || {})) runsMap[k] = clone(op.edits.runsMap[k]);
      for (const k in (op.edits.linkMap || {})) linkMap[k] = clone(op.edits.linkMap[k]);
      for (const k in (op.edits.replace || {})) replaceMap[k] = op.edits.replace[k];
      for (const k in (op.edits.viewAll || {})) viewAll[k] = clone(op.edits.viewAll[k]);
      for (const k in (op.edits.bright || {})) brightMap[k] = op.edits.bright[k];
      for (const id of (op.edits.clear || [])) if (!clearL.includes(id)) clearL.push(id);
      for (const a of (op.added || [])) adds.push(clone(a));
      for (const rid of (op.removed || [])) removed.add(rid);   // J46 複製先でも消した部品は出さない
    }
    else if (op.t === "move") { if (op.device === device) for (const it of op.items) { if (it.mode !== "M1" && isFlowOnly(it.id)) continue;   // PC-2・SP-1 前の版で残った品の並び・表・ボタンの M2 は使わない（描けずに消えていた。流れの中に戻して見せる）
        if (it.mode === "M1") { delete m2[it.id]; m1[it.id] = { dx: it.dx, dy: it.dy }; } else { delete m1[it.id]; m2[it.id] = { anchor: it.anchor, gapY: it.gapY, x: it.x }; if (sizes[it.id] && sizes[it.id].dy != null) delete sizes[it.id].dy; } }   // P1 塊の外へ出したら流れの中の縦のずれは要らない
      for (const it of op.items) if (it.mode === "M2" && isAdded(it.id)) placedFollow[it.id] = { anchor: it.anchor, device: op.device }; }   // §X13 置いた端末での今の付いていく先
    // J17（DECISIONS #17）別のセクションへ移す：所属は端末共通、位置は動かした端末だけ M2（もう一方の端末は移った先の既定の場所）。1操作=1undo
    else if (op.t === "xsec") { for (const it of op.items) {
      delete m1[it.id]; delete m2[it.id]; if (sizes[it.id] && sizes[it.id].dy != null) delete sizes[it.id].dy;
      if (op.device === device) m2[it.id] = { anchor: it.anchor, gapY: it.gapY, x: it.x };
      if (isAdded(it.id)) { const i = adds.findIndex((a) => a.id === it.id); if (i >= 0) { adds[i] = { ...adds[i], section: it.to, anchor: it.anchor, placed: { device: op.device, anchor: it.anchor, gapY: it.gapY, x: it.x } }; placedCleared.delete(it.id); placedFollow[it.id] = { anchor: it.anchor, device: op.device }; } }   // 記録の列の add op を書き換えない（写して差し替える）
      else if (it.to === homeSec(it.id)) delete relocated[it.id];   // 生まれたセクションへ戻した＝ふつうの M2
      else relocated[it.id] = { section: it.to, anchor: it.relAnchor || it.anchor };   // PC-5・PC-6 もう一方の端末の付いていく先は、離した所より上に丸ごとある部品（relAnchor。DECISIONS #22）
    } }
    else if (op.t === "reorder") { if (op.device === device) { order[op.key] = op.order.slice(); delete m1[op.id]; delete m2[op.id]; } }
    else if (op.t === "zorder") { if (op.device === device) { if (op.zs) Object.assign(zmap, op.zs); else zmap[op.id] = op.z; } }   // §4/§22 重なり順（単体 z か、cluster まとめの zs）
    // §4（大きさ）：部品→端末ごと。w/h/padB は絶対値（最後が勝つ）。dx は「左から変えた分」の位置ずれ＝m1 に足す（右端を動かさない）。
    else if (op.t === "size") { if (op.device === device) { const s = sizes[op.id] || {}; if (op.w != null) s.w = op.w; if (op.h != null) s.h = op.h; if (op.padB != null) s.padB = op.padB; sizes[op.id] = s; if (op.dx) { const m = m1[op.id] || { dx: 0, dy: 0 }; m1[op.id] = { dx: (m.dx || 0) + op.dx, dy: m.dy || 0 }; }
      if (op.dy) { if (m2[op.id]) m2[op.id] = { ...m2[op.id], gapY: +((m2[op.id].gapY || 0) + op.dy).toFixed(2) }; else s.dy = +((s.dy || 0) + op.dy).toFixed(2); } } }   // P1/P12 動かさない辺のための縦のずれ：塊の外（M2）は付いていく間隔に、流れの中は sizes.dy に
    else if (op.t === "cols") { const m = colsMap[op.id] = colsMap[op.id] || {}; m[op.device] = op.n; }   // §20 列（端末ごと。両端末ぶんを溜める）
    else if (op.t === "swap") { const s = swapMap[op.sec] = swapMap[op.sec] || {}; const d = s[op.device] = s[op.device] || {}; d[op.block] = !d[op.block]; if (op.device === device) for (const pid of (op.clearM1 || [])) { if (relocated[pid]) continue; delete m1[pid]; delete m2[pid]; } }   // PC-12 よそへ移した部品は入れ替えの相手にしない（位置を消さない）   // §5 左右入替（トグル）＋ 2つの子の M1 を消す
    // §12 文字の見た目：weight/color は端末共通（device で絞らない）、size は op.device の枠へ（両端末ぶんを溜める）
    else if (op.t === "tstyle") { for (const k of op.keys) { const s = textStyles[k] = textStyles[k] || {}; if (op.weight != null) s.weight = op.weight; if (op.color != null) s.color = op.color; if (op.font != null) s.font = op.font; if (op.italic != null) s.italic = op.italic; if (op.underline != null) s.underline = op.underline; if (op.align != null) s.align = op.align; if (op.size != null) { s.size = s.size || {}; s.size[op.device] = op.size; } } }
    // 文字の見た目を元に戻す：箱まるごと（鍵）＋文の一部（部品の runs）の両方（§2.2 書式のクリア）
    else if (op.t === "tstyleReset") { for (const k of op.keys) delete textStyles[k]; if (op.parts) for (const pid of op.parts) delete runsMap[pid]; }
    else if (op.t === "elink") { if (op.link) linkMap[op.id] = clone(op.link); else delete linkMap[op.id]; }   // §19 部品まるごとのリンク
    else if (op.t === "resetScope") {
      // PC-7（DECISIONS #21）別のセクションへ移したテンプレの部品は、生まれたセクションの元の場所へ戻す（所属は端末共通なので、どの端末の「元に戻す」でも戻す）。位置の手直しも両端末で消す
      { const cur = {}; for (const k in relocated) cur[k] = relocated[k].section; for (const id of resetRelocIds(op, cur)) { delete relocated[id]; delete m1[id]; delete m2[id]; if (sizes[id]) delete sizes[id]; } }
      if (op.devices.includes(device)) {
      if (op.scope === "page") {
        // §13.1「このページを元に戻す」＝そのページの全セクションのデザインに関わるもの全部（セクションの並び・追加・複製・削除は §2.2 により戻さない）。
        // 試験台28：今のページのセクションだけ（op.pageSecs）。古い op（pageSecs 無し）は全ページ＝従来どおり。
        const ps = op.pageSecs ? new Set(op.pageSecs) : null;
        const onPage = (k) => !ps || ps.has(secOf(k));
        for (const k of Object.keys(m1)) if (onPage(k)) delete m1[k]; for (const k of Object.keys(m2)) if (onPage(k)) delete m2[k];
        for (const k of Object.keys(zmap)) if (onPage(k)) delete zmap[k]; for (const k of Object.keys(sizes)) if (onPage(k)) delete sizes[k];
        for (const k of Object.keys(colsMap)) if (onPage(k)) delete colsMap[k];   // §20.2.10 列も戻す
        for (const k of Object.keys(swapMap)) if (!ps || ps.has(k)) delete swapMap[k];   // §5.2.3 左右入替も戻す（鍵はセクションID）
        for (const k of Object.keys(order)) if (!ps || ps.has(secOf(k))) delete order[k];
        for (const k of Object.keys(textStyles)) if (onPage(k)) delete textStyles[k]; for (const k of Object.keys(viewAll)) if (onPage(k)) delete viewAll[k];
        for (const a of adds) if (onPage(a.id)) placedCleared.add(a.id);   // §3/§4 足した部品は残し、位置だけ自動に戻す
      } else {
        const sIds = scopeIds(op.scope, op.id); for (const id of sIds) { delete m1[id]; delete m2[id]; delete zmap[id]; delete sizes[id]; delete colsMap[id]; placedCleared.add(id); }   // §20.2.10 列は大きさと同じ扱い（元の位置に戻すで戻る）
        for (const k of Object.keys(order)) { if ((op.scope === "section" && orderSec(k) === secOf(op.id)) || (op.scope === "part" && (op.id === k || scopeIds("part", op.id).some((pid) => (order[k] || []).includes(pid))))) delete order[k]; }
        delete swapMap[secOf(op.id)];   // §5.2.3 元の位置に戻す＝並び替え扱い（左右入替も戻す）
      }
    } }
  }
  // 試験台28：セクション操作のあとで、全セクション（allSecs＝ヘッダー＋全ページ＋フッター）と、今のページの見えるセクション（secList＝ヘッダー＋そのページ＋フッター）を作る。
  const allSecs = [...regionHead, ...PAGE_IDS.flatMap((p) => secMap[p] || []), ...regionFoot];
  const secPageMap = {}; for (const inst of regionHead) secPageMap[inst.id] = "@region"; for (const inst of regionFoot) secPageMap[inst.id] = "@region"; for (const p of PAGE_IDS) for (const inst of (secMap[p] || [])) secPageMap[inst.id] = p;
  const curPage = secMap[state.page] ? state.page : PAGE_IDS[0];
  const secList = [...regionHead, ...(secMap[curPage] || []), ...regionFoot];   // 今のページで描くセクション
  // 品・表の行を減らす（旧 _pg 用・試験台26 では delCards/delRows は空）
  for (const [inst, set] of Object.entries(delCards)) { const c = secContent[inst]; if (c && c.cards) c.cards = c.cards.filter((x) => !set.has(x.id)); }
  for (const [inst, set] of Object.entries(delRows)) { const c = secContent[inst]; if (c && c.table) c.table = c.table.filter((x) => !set.has(x.id)); }
  // ===== 試験台26：① の下書き（effShop）を作り、品の並び・表を ① から組む =====
  const effShop = applyShopOps(clone(shopBase()), shopOps);
  // 名前・説明の書き換えは ① の品へ（card/row の name/desc。両方の並びに同じ品が出ていれば、どちらも変わる）
  for (const id in editMap) { const bb = bareOf(id); let m; if ((m = bb.match(/^(card|row)_(name|desc)_(.+)$/))) { const itemId = m[1] === "card" ? itemOfCardPart(m[3]) : itemOfTablePart(m[3]); const it = effShop.catalog && effShop.catalog.items[itemId]; if (it) it[m[2] === "name" ? "name" : "description"] = editMap[id]; } }
  // 試験台28 §2.4：MENU 本体の書き換えを ① へ。品の名前・説明（行ID=placement）／括りの見出し（カテゴリ名）／メニューの見出し（メニュー名）。
  for (const id in editMap) {
    const bb = bareOf(id); let m; const C = effShop.catalog || {};
    if ((m = bb.match(/^row_(name|desc)_(.+)$/))) { const plc = C.placements && C.placements[m[2]]; if (plc) { const it = C.items[plc.itemId]; if (it) it[m[1] === "name" ? "name" : "description"] = editMap[id]; } }
    else if ((m = bb.match(/^mc_(.+)$/))) { const ct = C.categories && C.categories[m[1]]; if (ct) ct.name = editMap[id]; }
    else if ((m = bb.match(/^mg_(.+)$/))) { const mn = C.menus && C.menus[m[1]]; if (mn) mn.name = editMap[id]; }
  }
  shopTextToShop(effShop, editMap, allSecs, secContent);   // J44・J45 アクセスの電話・住所の書き換えを ① へ、アクセス・フッターの連動する文字を ① から（pg/shopinfo-pages.js）
  // 並びの設定を解決（この画面の変更 → 土台 → テンプレの既定）。items セクションごとに cards/table を作る
  const effSpec = (gid) => sourceSess[gid] || baseSource[gid] || templateSource(gid);
  const sourceResolved = {};
  for (const inst of allSecs) {
    if (inst.type === "menu") { const cm = secContent[inst.id]; if (cm) cm.groups = deriveMenuGroups(effShop); continue; }   // 試験台28 §2.4：お品書き本体は ① から
    if (inst.type !== "items") continue;
    const pfx = (inst.id === "feature" || inst.id === "items") ? "" : inst.id + SEP;
    const gidC = pfx + "I_cards", gidT = pfx + "I_table";
    const specC = clone(effSpec(gidC)), specT = clone(effSpec(gidT));
    sourceResolved[gidC] = specC; sourceResolved[gidT] = specT;
    const c = secContent[inst.id]; if (!c) continue;
    c.cards = deriveGroup(effShop, specC, "cards");
    c.table = deriveGroup(effShop, specT, "table");
    // ① の文字が切れ目の並び（一部の見た目）とずれたら、① の文字を出してその runs は捨てる（8.10）
    const dropDivergent = (arr, pre) => { for (const row of arr) for (const fld of ["name", "desc"]) { const fid = pfx + pre + fld + "_" + row.id; const rs = runsMap[fid]; if (rs && rs.map((r) => r.text).join("") !== (row[fld] || "")) { delete runsMap[fid]; if (state.droppedRuns && !state.droppedRuns.includes(fid)) state.droppedRuns.push(fid); } } };
    dropDivergent(c.cards, "card_"); dropDivergent(c.table, "row_");
  }
  // content に文字を反映（特集の見出し・本文など）＝パーツの属するインスタンスへ。品の名前・説明は上で ① から組んでいる
  for (const [id, text] of Object.entries(editMap)) routeSetContent(secContent, id, text);
  // §1 差し替えた素材を content に反映＝パーツの属するインスタンスへ
  for (const [pid, asset] of Object.entries(replaceMap)) routeReplaceAsset(secContent, pid, asset);
  // 足した部品（両端末に存在。位置は端末ごと）
  const added = [];
  const CW = device === "pc" ? 1326 : 351;
  const contentRight = (SPEC.DESIGN_W[device] + CW) / 2;        // 中身の右端（§2.3）
  for (const a of adds) {
    if (removed.has(a.id)) continue;
    const text = editMap[a.id] != null ? editMap[a.id] : a.text;
    let place; let isAuto = false;
    // §X13 自動の位置の付いていく先：元に戻した端末は add 時の先／それ以外は「置いた端末での今の先」（手で動かした先）
    const autoAnchor = placedCleared.has(a.id) ? a.anchor
      : ((placedFollow[a.id] && placedFollow[a.id].device === a.placedDevice) ? placedFollow[a.id].anchor : a.anchor);
    if (m2[a.id]) place = { anchor: m2[a.id].anchor, gap: m2[a.id].gapY, x: m2[a.id].x };
    else if (a.placed) {   // §3/§4 足した部品：置いた端末は手直し位置／もう一方・リセット後は自動（付いていく先のすぐ下16）
      if (a.placed.device === device && !placedCleared.has(a.id)) place = { anchor: a.placed.anchor, gap: a.placed.gapY, x: a.placed.x };
      else { place = { anchor: autoAnchor, gap: 16, x: "@left" }; isAuto = true; }
    }
    else if (device === a.placedDevice) place = { anchor: a.anchor, gap: a.gap, x: a.x };   // 貼り付け等（従来・置いた端末）
    else { place = { anchor: autoAnchor, gap: 16, x: "@left" }; isAuto = true; }              // 貼り付け等（もう一方の端末＝自動）
    if (!m2[a.id] && !isAuto && sizes[a.id] && sizes[a.id].dy) place = { ...place, gap: +((place.gap || 0) + sizes[a.id].dy).toFixed(2) };   // P1 足した部品の上の角で縮めた分（付いていく間隔に足す）
    // 幅はその端末でのコピー元の幅。置いた左端から中身の右端に収まらないなら、そこまで縮める（写真は縦横比保持。§2.3）
    let w = device === a.placedDevice ? a.w : (a.wOther != null ? a.wOther : a.w);
    let h = a.kind === "photo" ? (device === a.placedDevice ? a.h : (a.hOther != null ? a.hOther : a.h)) : a.h;
    // PC-20 つまみで変えた大きさ（size op・土台の adjust[端末].size）をこの端末で当てる。左の辺から変えた分（dx）は、右の辺を動かさないよう置いた x を寄せる
    const szA = sizes[a.id]; let padB;
    if (szA) { if (szA.w != null) w = szA.w; if (a.kind === "photo" && szA.h != null) h = szA.h; if (szA.padB != null) padB = szA.padB;
      if (m1[a.id] && m1[a.id].dx && typeof place.x === "number") place = { ...place, x: +(place.x + m1[a.id].dx).toFixed(2) }; }
    if (typeof place.x === "number" && place.x + w > contentRight) { const avail = contentRight - place.x; if (a.kind === "photo" && h && w) h = Math.round(h * avail / w * 100) / 100; w = avail; }
    const asset = a.kind === "photo" ? (replaceMap[a.id] != null ? replaceMap[a.id] : a.asset) : undefined;
    added.push({ id: a.id, section: a.section, kind: a.kind, styleName: a.styleName || "featBody", w, h, padB, text, anchor: place.anchor, gap: place.gap, x: place.x, asset, isAuto });
    delete m2[a.id];
  }
  // J17 別のセクションへ移したテンプレの部品：移った先で絶対配置（足した部品と同じ）。中身は生まれたセクションの content から。m2 は R.m2 にも残す（矢印・元に戻す・保存が m2 を見る）
  const carried = [];
  // PC-24「元の配置を見る」の間は、今のページで別のセクションへ移した部品も生まれたセクションの元の場所に見せる（記録は変えない）
  if (peek) { for (const id of Object.keys(relocated)) if (secPageMap[relocated[id].section] === curPage || secPageMap[homeSec(id)] === curPage) delete relocated[id]; }
  for (const id in relocated) {
    if (removed.has(id)) continue;
    const rl = relocated[id]; const bare = bareOf(id); const df = M.floatDefaults(bare, device); if (!df) continue;
    const c = secContent[homeSec(id)] || {}; let m; let text = "", asset;
    if ((m = bare.match(/^F_([hbp])(\d)$/)) && c.blocks && c.blocks[+m[2]]) { const bl = c.blocks[+m[2]]; if (m[1] === "p") asset = bl.photo ? bl.photo.asset : ""; else text = (m[1] === "h" ? bl.heading : bl.body) || ""; }
    else if (bare === "I_kanmi") text = c.kanmiLabel || ""; else if (bare === "I_time") text = c.kanmiTime || "";
    let place, isAuto = false;
    if (m2[id]) place = { anchor: m2[id].anchor, gap: m2[id].gapY, x: m2[id].x };
    else { place = { anchor: rl.anchor, gap: 16, x: "@left" }; isAuto = true; }   // もう一方の端末・元の位置に戻した後＝付いていく先のすぐ下16・左端そろえ（足した部品と同じ。4.10）
    const sz = sizes[id] || {};
    carried.push({ id, section: rl.section, home: homeSec(id), kind: df.kind, styleName: df.styleName, w: sz.w != null ? sz.w : df.w, h: df.kind === "photo" ? (sz.h != null ? sz.h : df.h) : undefined, padB: sz.padB, text, asset, anchor: place.anchor, gap: place.gap, x: place.x, isAuto, relAnchor: rl.anchor });
  }
  // template 部品の m2/remove（added でないもの）
  const remove = [...removed].filter((id) => !isAdded(id));
  // 「元の配置を見る」：手で動かした部品・並び替えを元（今の中身からのテンプレ）に戻して見せる（記録は変えない）。試験台28：今のページのセクションの部品だけ（§2.2）。
  if (peek) { const onPage = (k) => secPageMap[secOf(k)] === curPage; for (const k in m1) if (onPage(k)) delete m1[k]; for (const k in m2) if (onPage(k)) delete m2[k]; for (const k in order) if (onPage(k)) delete order[k]; for (const k in sizes) if (onPage(k)) delete sizes[k]; }
  // content は従来どおり anchor（特集・品）のスライスを束ねたもの。インスタンス全体は secContent/secList で持つ。
  const content = { feature: secContent.feature, items: secContent.items };
  return { content, secContent, secList, secMap, allSecs, secPageMap, curPage, m1, m2, added, carried, carriedIds: carried.map((c) => c.id), relocated, remove, clear: clearL, tpl, adds, editMap, order, zmap, sizes, colsMap, swapMap, replaceMap, viewAll, brightMap, textStyles, runsMap, linkMap, placedFollow, removedAll: [...removed], effShop, sourceResolved };
}

