// お店の情報（STORE）・ページの定義・セクションの名前
// 線：A4｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- §19 リンク（お店の情報・サイトのページ・そのほか） ----
// お店の情報：① お店の情報（shop.json）が1か所（DATA_SPEC 3章・4.5）。電話・メール・Instagram・地図は今の ① の下書き（effShop）から読む
// （J44・J45：アクセスの文字を書き換えると ① が変わり、リンク・フッター・地図が同じ値を見る）。値の作り方は packages/core/shopinfo.js。
// LINE は ① の contact.sns.line、注文先は ① の externalServices（kind=takeout、無ければ kind=shop の通販）。
let _storeMemo = { key: null, shop: null };
function storeShop() {
  if (typeof state === "undefined" || !state) return SHOP_JSON;
  const ops = state.ops || [], cur = state.cursor, last = cur > 0 ? ops[cur - 1] : null;
  const key = [ops, ops.length, cur, state.shopBase, state.base, state.viewing, state.undoBase, last ? JSON.stringify(last) : ""];
  const k0 = _storeMemo.key;
  if (k0 && k0.length === key.length && k0.every((v, i) => v === key[i])) return _storeMemo.shop;
  let shop; try { shop = reduce(activeOps(), "pc").effShop; } catch (e) { shop = shopBase(); }
  _storeMemo = { key, shop }; return shop;
}
const STORE = {
  get tel() { return SHOPINFO.storeOf(storeShop()).tel; },
  get mail() { return SHOPINFO.storeOf(storeShop()).mail; },
  get instagram() { return SHOPINFO.storeOf(storeShop()).instagram; },
  get line() { return SHOPINFO.storeOf(storeShop()).line; },
  get map() { return SHOPINFO.storeOf(storeShop()).map; },
  get order() { return SHOPINFO.storeOf(storeShop()).order; },
};
const storeMapHref = () => SHOPINFO.mapHref(storeShop());
// アクセスの行（ci_tel・ci_addr）・フッターの住所（faddr）は ① と連動する文字（DATA_SPEC 4.4）。部品 → ① の値の鍵
function shopTextKey(inst, bare) {
  if (inst.type === "contact") { const m = /^ci_(.+)$/.exec(bare); return (m && SHOPINFO.LINKED_ROWS[m[1]]) || null; }
  if (inst.type === "footer" && bare === "faddr") return "footAddr";
  return null;
}
// reduce の中で呼ぶ：(1) アクセスの電話・住所の書き換え（editMap）を ① へ (2) 連動する文字を ① から作って secContent へ。
// 書き換えた文字はこの後の routeSetContent が上から入れる（打った文字のまま見える）。フッターの住所は町名まで＝書き換えても ① は変えない（連動を外した文字）
function shopTextToShop(effShop, editMap, allSecs, secContent) {
  const pfxOf = (inst) => (inst.id === "feature" || inst.id === "items") ? "" : inst.id + SEP;
  for (const inst of allSecs) {
    if (inst.type !== "contact") continue;
    for (const k of Object.keys(SHOPINFO.LINKED_ROWS)) { const id = pfxOf(inst) + "ci_" + k; if (editMap[id] != null) SHOPINFO.applyContactText(effShop, SHOPINFO.LINKED_ROWS[k], editMap[id]); }
  }
  for (const inst of allSecs) {
    const c = secContent[inst.id]; if (!c) continue;
    if (inst.type === "contact" && Array.isArray(c.rows)) for (const r of c.rows) { const key = shopTextKey(inst, "ci_" + r.id); if (key) r.value = SHOPINFO.linkedText(effShop, key); }
    if (inst.type === "footer") c.addr = SHOPINFO.linkedText(effShop, "footAddr");
  }
}
// F24 公開前の確認：① の電話・住所が空か電話でない値なら、アクセスのその行を主語にして出す
function shopInfoChecks() {
  const R = reduce(activeOps(), "pc"); const probs = SHOPINFO.contactProblems(R.effShop); if (!probs.length) return [];
  const contacts = (R.allSecs || []).filter((inst) => inst.type === "contact"); const pfx = contacts.map((inst) => inst.id + SEP); if (!pfx.length) return [];   // アクセスの本体が無いページ構成では直す場所が無い
  const page = contacts.length ? R.secPageMap[contacts[0].id] : null;
  return probs.map((p) => ({ device: "pc", page, kind: "shop", parts: pfx.map((x) => x + "ci_" + p.key), text: p.msg + "（アクセスのページの「" + (p.key === "tel" ? "電話" : "住所") + "」で直せます）" }));
}
// 下書き（fold）で比べる元：連動する文字は ① から作った値（同じなら下書きの content に書かない＝① の下書きが持つ）
function shopLinkedTmpl(inst, bare, effShop) { const key = shopTextKey(inst, bare); return key ? SHOPINFO.linkedText(effShop, key) : undefined; }
// サイトのページ：site.json の pages（ナビに出る3つ）。ナビの名前は作業票 §1 の TOP・お品書き・アクセス。
const PAGES = [{ id: "pg_home", label: "TOP", slug: "/" }, { id: "pg_menu", label: "お品書き", slug: "/menu" }, { id: "pg_contact", label: "アクセス", slug: "/contact" }];
const PAGE_IDS = PAGES.map((p) => p.id);
// 試験台28：各ページの既定セクションの並び（下書きが無い・配列のときの初期値）。塊で組む・部品 ID はセクションで一意（非 anchor は prefixIds が <secId>__ を付ける）。
const PAGE_DEF = {
  pg_home: [{ id: "feature", type: "feature" }, { id: "items", type: "items" }],
  pg_menu: [{ id: "menuhdr", type: "menuHdr" }, { id: "menu", type: "menu" }],
  pg_contact: [{ id: "contacthdr", type: "contactHdr" }, { id: "contact", type: "contact" }],
};
// ヘッダー・フッターは全ページ共通の固定セクション（動かせない・消せない＝下書きに並びを持たない。作業票 §2.3・ユーザー指示）。
const REGION_HEAD = { id: "header", type: "header" }, REGION_FOOT = { id: "footer", type: "footer" };
const pageLabelOf = (id) => (PAGES.find((p) => p.id === id) || {}).label || id;
// セクション ID → 置かれているページ ID（header/footer は "@region"）。duplicate(sec*)も含めて secMap から引く。
const PAGE_CONTENT_KEY = { menuHdr: "menuHdr", menu: "menu", contactHdr: "contactHdr", contact: "contact", header: "header", footer: "footer" };
const SECTION_LABELS = { feature: "芦屋堂の味", items: "おすすめの品", header: "ヘッダー", footer: "フッター", menuhdr: "お品書きの帯", menu: "お品書き", contacthdr: "アクセスの帯", contact: "アクセス" };
const friendlySec = (sec) => SECTION_LABELS[sec] || SECTION_LABELS[secOf(sec)] || "セクション";
const STORE_KINDS = ["tel", "mail", "instagram", "line", "map", "order"];
function storeHas(kind) { const v = STORE[kind === "tel" ? "tel" : kind === "mail" ? "mail" : kind]; if (kind === "tel") return !!(STORE.tel && STORE.tel.digits); if (kind === "map") return !!STORE.map; return !!v; }
function storeValueText(kind) {
  if (kind === "tel") return STORE.tel ? STORE.tel.display : "";
  if (kind === "mail") return STORE.mail || "";
  if (kind === "instagram") return STORE.instagram ? "@" + STORE.instagram : "";
  if (kind === "map") return STORE.map ? STORE.map.town : "";   // 住所（町名まで）
  return "";
}
// 部品まるごとリンクの既定：ボタン「お品書きをすべて見る」はもともと お品書き（MENU）へ（O11）
