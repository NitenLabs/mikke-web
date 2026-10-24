// お店の情報（STORE）・ページの定義・セクションの名前
// 線：A4｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- §19 リンク（お店の情報・サイトのページ・そのほか） ----
// お店の情報：samples/ashiyado の shop.json（電話・メール・Instagram・地図）。LINE と 注文先 は見本に無いため仮の値（報告する）。
const STORE = {
  tel: { display: "0797-00-0000", digits: "0797000000" },
  mail: "info@example.com",
  instagram: "ashiyado_sample",
  line: "https://lin.ee/ashiyado-sample",        // 仮（見本に LINE が無い）
  map: { lat: 34.728, lng: 135.305, addr: "兵庫県芦屋市大原町0-0" },
  order: "https://example.com/order",            // 仮（見本に 品の注文先 が無い）
};
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
  if (kind === "map") return STORE.map ? STORE.map.addr.slice(0, 6) : "";   // 住所の頭
  return "";
}
// 部品まるごとリンクの既定：ボタン「お品書きをすべて見る」はもともと お品書き（MENU）へ（O11）
