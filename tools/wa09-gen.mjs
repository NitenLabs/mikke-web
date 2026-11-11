#!/usr/bin/env node
// wa-09：templates/wa-09/SPEC.md の数値から samples/<店>/ の shop・theme・assets・site を作る。
// 店名・文・値段は samples/<店>/wa09-content.json、写真は templates/wa-09/photos.txt（枠 短いID URL）から読む（この道具に店の中身を書かない）。
// "fromShop": true の店（指示 0050）：① shop.json・④ assets.json は読むだけで書き換えない。店名・品書き・営業の案内・紹介文・席・定休日・予約・住所・電話は
//   ① と連動させ（印 shop:）、wa09-content.json には型の飾り（欧文の札）・キャッチコピー・段の見出し・ボタンの文だけを置く。飾りと決まり文句は edit:false。
//   ① の使い方：story.answers の q_catch・q_body（紹介）・q_counter（お席の文）、facilities.seats.total（お席の見出しの席数）、
//   catalog の先頭のメニュー（name＝おまかせの見出し、description＝注記）とその括り（name＝昼／夜、note＝ご案内・フッターの行）・placements の順の品（name・prices）、
//   hours（定休日。休みが無ければ行を出さない）、reservation.note（ご予約の行。無ければ出さない）、basic.name・location・contact.phone。
// 使い方：node tools/wa09-gen.mjs <店のID> → node tools/build.mjs samples/<店のID> → node tools/wa09-finish.mjs <店のID>
import fs from "node:fs";
import { formatClosedDays } from "./lib/format.mjs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa09-gen.mjs ichinoshio）");
const DIR = `samples/${ID}`, LIST = "templates/wa-09/photos.txt";
const NOW = "2026-11-10T12:00:00+09:00";
const C = JSON.parse(fs.readFileSync(`${DIR}/wa09-content.json`, "utf8"));

// ---- 色（SPEC 3章）・書体（値段は font:body）
const BK = "#0E0E0E", WH = "#EFE9DD", GD = "#B8975A";
const H = "font:heading", B = "font:body", A = "font:accent";
const yen = (n) => `${n.toLocaleString("en-US")}円`;

const FS = C.fromShop === true;
// ---- ① shop.json（fromShop の店は読むだけ）
let shop;
if (FS) shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
else {
const P = [C.periods.lunch, C.periods.dinner], open = { status: "open", periods: P };
const weekly = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, d === C.closedDay ? { status: "closed" } : open]));
const items = {}, placements = {};
C.omakase.rows.forEach((r, i) => {
  items[`itm_${r.id}`] = { name: `${r.time} ${r.name}`, photos: [], prices: [{ id: `prc_${r.id}`, type: "fixed", amount: r.price }], status: "onSale", labels: [] };
  placements[`plc_${r.id}`] = { itemId: `itm_${r.id}`, categoryId: "cat_omakase", order: i + 1, menuId: "mnu_main" };
});
shop = {
  schemaVersion: 1, shopId: `shp_${ID}`, updatedAt: NOW, isSample: true, demo: true,
  basic: { name: C.name, nameKana: C.nameKana, genre: { template: "restaurant", detail: C.genreDetail } },
  location: { prefecture: "兵庫県", city: "芦屋市", town: C.town, ...(C.geo ? { geo: C.geo } : {}) },
  hours: { weekly },
  contact: { phone: C.phone },
  facilities: { smoking: "none" },
  catalog: { menus: { mnu_main: { order: 1, name: C.omakase.heading } }, categories: { cat_omakase: { menuId: "mnu_main", name: C.omakase.heading, order: 1 } }, labels: { lbl_recommend: { name: "おすすめ", system: "recommended", order: 1 } }, items, placements },
};
fs.mkdirSync(`${DIR}/media`, { recursive: true });
fs.writeFileSync(`${DIR}/shop.json`, JSON.stringify(shop, null, 2) + "\n");
}

// ---- ③ theme.json
fs.writeFileSync(`${DIR}/theme.json`, JSON.stringify({ schemaVersion: 1,
  colors: { background: { value: BK }, surface: { value: BK }, text: { value: WH }, textMuted: { value: GD }, primary: { value: GD }, accent: { value: GD }, line: { value: GD }, lineSoft: { value: "#4F432C" } },
  fonts: { heading: "hina-mincho", body: "hina-mincho", accent: "cinzel" },
  textStyles: {
    pageTitle: { font: H, size: { pc: 56, sp: 32 }, lineHeight: 1.5, color: "theme:text" },
    heading: { font: H, size: { pc: 32, sp: 24 }, lineHeight: 1.75, color: "theme:text" },
    subheading: { font: H, size: { pc: 20, sp: 20 }, lineHeight: 1.6, color: "theme:text" },
    body: { font: B, size: { pc: 16, sp: 16 }, lineHeight: 2.25, color: "theme:text" },
    caption: { font: B, size: { pc: 14, sp: 14 }, lineHeight: 2, color: "theme:textMuted" },
  } }, null, 2) + "\n");

// ---- 写真（SPEC 7章）
function webpSize(b) {
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") throw new Error("WebP ではありません");
  const kind = b.toString("latin1", 12, 16);
  if (kind === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
  throw new Error("WebP の大きさが読めません");
}
let rows;
if (FS) rows = Object.keys(JSON.parse(fs.readFileSync(`${DIR}/assets.json`, "utf8")).assets); // ④ は読むだけ（写真の差し替えは assets.json で）
else {
rows = fs.readFileSync(LIST, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/));
const assets = {};
for (const [k, page, url] of rows) {
  const meta = C.photos[k];
  if (!meta) throw new Error(`写真 ${k} の説明が wa09-content.json にありません`);
  const id = `ast_ph${k}`, key = `${id}.webp`, f = `${DIR}/media/${key}`;
  if (!fs.existsSync(f)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`写真 ${k}: HTTP ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(f);
  assets[id] = { kind: "photo", file: { key, mime: "image/webp", ...webpSize(buf), bytes: buf.length, exifStripped: true }, uploadedAt: NOW, uploadedBy: "producer",
    origin: { kind: "stock", provider: "unsplash", pageUrl: `https://unsplash.com/photos/${page}` },
    rights: { basis: "licensed", confirmedAt: NOW, confirmedBy: "producer", note: "Unsplash License（架空のお店のデザイン見本）" }, slot: meta[0], alt: meta[1] };
}
fs.writeFileSync(`${DIR}/assets.json`, JSON.stringify({ schemaVersion: 1, assets }, null, 2) + "\n");
}

// ---- 配置の道具
const Pw = 1440, Sw = 390, r = (n) => Math.round(n * 10000) / 10000;
const box = (b, W_) => ({ ...b, x: r((b.x / W_) * 100), w: r((b.w / W_) * 100) });
const lay = (pc, sp) => ({ pc: box(pc, Pw), sp: box(sp, Sw) });
const els = {}, secs = {}, tablet = { els: {}, secs: {} };
const add = (id, e) => { els[id] = e; };
const tb = (id, css) => { tablet.els[id] = { ...(tablet.els[id] || {}), ...css }; };
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const runs = (x) => (x?.mix ? x.mix.map(run) : [run(x)]); // { mix: [文字, [連動の path, format], …] } は1段落に文字と連動を混ぜる
const paras = (c) => (c?.lines ? c.lines.map((x) => ({ runs: runs(x) })) : [{ runs: runs(c) }]);
const DECO = FS ? { edit: false } : {}; // 型の飾り・決まり文句（fromShop の店だけ印を付けない）
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  add(id, { type: "text", z: x.z ?? 3, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r((ps[2] ?? 0) / ps[0]), ...(x.align ? { align: x.align } : {}), ...(x.link ? { link: x.link } : {}), ...(x.opacity != null ? { opacity: x.opacity } : {}) },
    layout: lay({ ...l[0], size: ps[0] }, { ...l[1], size: ss[0] }), ...(x.hidden ? { hidden: x.hidden } : {}), ...(x.deco ? DECO : {}) });
}
const sec = (id, name, pc, sp, more = {}) => { secs[id] = { name, background: { color: "theme:background" }, minHeight: { pc, sp }, ...(more.anchor ? { anchor: more.anchor } : {}), ...(more.nav ? { nav: more.nav } : {}) }; };
const photo = (id, section, asset, z, pc, sp, crop = {}, darken) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1, ...crop }, ...(darken ? { darken } : {}) });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });
const line = (id, section, pc, sp) => rect(id, section, GD, 2, { ...pc, h: 1 }, { ...sp, h: 1 }, { opacity: 40 });
const TEL = { kind: "shopPhone" }, CT = { align: "center" }, RT = { align: "right" };
const PHONE = ["/contact/phone", "phone"], ADDR = ["/location", "address"];
// ---- 文字の出どころ：fromShop は ① と連動（配列＝[path, format]）、そうでなければ wa09-content.json の文字
const NAME = FS ? ["/basic/name"] : C.name;
let ABH, ABP, CTH, CTP, OMH, OMN, OM, INFO, FOOT;
if (FS) {
  const cat = shop.catalog, byOrder = (o) => Object.entries(o).sort((a, b) => a[1].order - b[1].order);
  const MENU = byOrder(cat.menus)[0][0];
  const CATS = byOrder(cat.categories).filter(([, c]) => c.menuId === MENU).map(([id]) => id);
  const cp = (id, k) => [`/catalog/categories/${id}/${k}`], SA = (q) => [`/story/answers/${q}/answer`, "paragraphs"], L = C.info.labels;
  ABH = SA("q_catch"); ABP = SA("q_body"); CTP = SA("q_counter");
  CTH = { mix: C.counter.heading.split("{seats}").flatMap((x, i) => (i ? [["/facilities/seats/total"], x] : [x])).filter((x) => x !== "") };
  OMH = [`/catalog/menus/${MENU}/name`]; OMN = [`/catalog/menus/${MENU}/description`];
  OM = Object.values(cat.placements).filter((p) => p.menuId === MENU && CATS.includes(p.categoryId))
    .sort((a, b) => CATS.indexOf(a.categoryId) - CATS.indexOf(b.categoryId) || a.order - b.order)
    .map((p) => ({ time: cp(p.categoryId, "name"), name: [`/catalog/items/${p.itemId}/name`], price: [`/catalog/items/${p.itemId}/prices`, "price"] }));
  const noted = CATS.filter((id) => cat.categories[id].note), closed = formatClosedDays(shop.hours) !== "";
  INFO = [[L.address, ADDR], ...noted.map((id) => [cp(id, "name"), cp(id, "note")]), ...(closed ? [[L.closed, ["/hours", "closedDays"]]] : []),
    ...(shop.reservation?.note ? [[L.reservation, ["/reservation/note"]]] : []), [L.phone, PHONE]];
  FOOT = [...noted.map((id) => ({ mix: [cp(id, "name"), " ", cp(id, "note")] })), ...(closed ? [{ mix: [`${L.closed} `, ["/hours", "closedDays"]] }] : [])];
} else {
  const val = (v) => (v === "$address" ? ADDR : v === "$phone" ? PHONE : v);
  ABH = C.about.heading; ABP = C.about.body; CTH = C.counter.heading; CTP = C.counter.body; OMH = C.omakase.heading; OMN = C.omakase.note;
  OM = C.omakase.rows.map((r) => ({ time: r.time, name: r.name, price: yen(r.price) }));
  INFO = C.info.rows.map(([k, v]) => [k, val(v)]); FOOT = C.footerHours;
}
const LB = [[13, 20, 3.9], [13, 20, 3.9]]; // 札の欧文
const col = "(100vw - 9.6rem)", tbM = { left: "4.8rem", width: `calc(100% - 9.6rem)` };
const H169 = `${col} * .5625`; // タブレットの大きい写真の高さ
// タブレット（768〜1024）は finish の CSS で位置を決め打ちにするので（build の reflow が効かない）、① の文の長さから行の数を見積もって下を押し下げる（fromShop の店だけ。指示 0050 段2）。
// 1行の字数は一番狭い 768（本文の列 672px）で：本文 16px（字間 .06em）37 字（禁則の分だけ詰める）・見出し 32px 20 字・注記 14px 46 字。半角は 0.55 字
const jw = (x) => [...x].reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 0.55 : 1), 0);
const tbN = (x, per) => (FS ? String(x ?? "").split("\n").reduce((n, p) => n + Math.max(1, Math.ceil(jw(p) / per)), 0) : 1);
const tbX = (x, per, baseH, lh) => r(Math.max(0, tbN(x, per) * lh - baseH)); // 設計の箱の高さ（baseH rem）を超えた分の rem。タブレットの行の高さは PC の値（本文 3.6・見出し 5.6・注記 2.8rem）
const ANS = (q) => shop.story?.answers?.[q]?.answer;

// ---- ヘッダー
const NAV = (label, order) => ({ label, order });
sec("sec_header", "ヘッダー", 95, 56);
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: WH, font: A, spMenuBackground: BK }, layout: lay({ x: 700, y: 0, w: 700, h: 95, size: 12 }, { x: 306, y: 0, w: 72, h: 56 }) });
t("hd_name", "sec_header", NAME, [[22, 33, 0], [18, 27, 0]], H, WH, [{ x: 40, y: 31, w: 300, h: 33 }, { x: 24, y: 14, w: 240, h: 27 }], { role: "heading", link: { kind: "anchor", value: "pg_home#top" } });
tb("hd_name", { left: "4.8rem" });

// ---- 1 最初の画面
sec("sec_firstv", "最初の画面", 900, 844, { anchor: "top" });
photo("fv_ph", "sec_firstv", "ast_phfv", 1, { x: 0, y: 0, w: 1440, h: 900 }, { x: 0, y: 0, w: 390, h: 844 }, { fx: 47, fy: 62 }, 55);
t("fv_en", "sec_firstv", C.nameEn, [[13, 20, 5.2], [11, 17, 4.4]], A, WH, [{ x: 120, y: 330, w: 1200, h: 20 }, { x: 13, y: 130, w: 364, h: 17 }], CT);
t("fv_cp", "sec_firstv", C.catchCopy, [[56, 84, 4.48], [32, 52, 2.56]], H, WH, [{ x: 120, y: 382, w: 1200, h: 84 }, { x: 24, y: 169, w: 342, h: 52 }], { ...CT, role: "pageTitle", hidden: { sp: true } });
t("fv_cp2", "sec_firstv", { lines: C.catchCopyLines }, [[56, 84, 4.48], [32, 52, 2.56]], H, WH, [{ x: 120, y: 382, w: 1200, h: 168 }, { x: 24, y: 169, w: 342, h: 104 }], { ...CT, role: "pageTitle", hidden: { pc: true } });
tb("fv_en", { left: "0", width: "100%", top: "16rem" });
tb("fv_cp2", { left: "0", width: "100%", top: "20.2rem", "font-size": "4.8rem", "line-height": "7.2rem", height: "14.4rem" });
tablet.secs.sec_firstv = "84.4rem";

// ---- 2 紹介
sec("sec_about", "お店について", 1644, 1110, { anchor: "about", nav: NAV(C.labels.about, 1) });
photo("ab_ph1", "sec_about", "ast_phab1", 2, { x: 13, y: 160, w: 815, h: 458 }, { x: 13, y: 420, w: 364, h: 205 });
t("ab_lb", "sec_about", C.labels.about, LB, A, GD, [{ x: 920, y: 200, w: 440, h: 20 }, { x: 24, y: 96, w: 342, h: 20 }], { deco: true });
t("ab_h", "sec_about", ABH, [[32, 56, 0], [24, 40, 0]], H, WH, [{ x: 920, y: 240, w: 440, h: 112 }, { x: 24, y: 128, w: 342, h: 80 }], { role: "heading" });
t("ab_p", "sec_about", ABP, [[16, 36, 0.96], [16, 34, 0.96]], B, WH, [{ x: 920, y: 376, w: 440, h: 216 }, { x: 24, y: 224, w: 342, h: 170 }]);
photo("ab_ph2", "sec_about", "ast_phab2", 2, { x: 189, y: 780, w: 528, h: 704 }, { x: 13, y: 673, w: 187, h: 249 });
photo("ab_ph3", "sec_about", "ast_phab3", 2, { x: 986, y: 1000, w: 441, h: 440 }, { x: 208, y: 841, w: 169, h: 169 });
tb("ab_lb", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: "9.6rem" });
const dAh = tbX(ANS("q_catch"), 20, 5.6, 5.6), dAp = tbX(ANS("q_body"), 37, 10.2, 3.6), dA = r(dAh + dAp);
tb("ab_h", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: "13rem", "font-size": "3.2rem", "line-height": "5.6rem", height: `${r(5.6 + dAh)}rem` });
tb("ab_p", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: `${r(20 + dAh)}rem`, height: `${r(10.2 + dAp)}rem` });
tb("ab_ph1", { ...tbM, top: `${r(32 + dA)}rem`, height: `calc(${H169})` });
tb("ab_ph2", { left: "4.8rem", width: `calc(${col} * .595)`, top: `calc(${r(36.8 + dA)}rem + ${H169})`, height: `calc(${col} * .793)` });
tb("ab_ph3", { left: `calc(4.8rem + ${col} * .631)`, width: `calc(${col} * .369)`, top: `calc(${r(52.8 + dA)}rem + ${H169})`, height: `calc(${col} * .369)` });
tablet.secs.sec_about = `calc(${r(46.4 + dA)}rem + ${col} * 1.3555)`;

// ---- 3 おまかせ（行は y0 から、PC 96・SP 104）
const nOM = OM.length - 3; // おまかせの行の数（3行で設計どおり）。増減の分だけ段の高さを変える（PC 96・SP 104・タブレット 9.6rem／行。少ないときは注記の下で止める）
sec("sec_omakase", "おまかせ", Math.max(1398 + 96 * nOM, 1266), Math.max(1112 + 104 * nOM, 800), { anchor: "omakase", nav: NAV(C.labels.omakase, 2) });
photo("om_ph", "sec_omakase", "ast_phom", 1, { x: 0, y: 0, w: 1440, h: 810 }, { x: 0, y: 0, w: 390, h: 520 }, { fx: 51, fy: 50 }, 30);
t("om_en", "sec_omakase", C.labels.omakase, [[40, 56, 8], [28, 40, 5.6]], A, WH, [{ x: 40, y: 706, w: 800, h: 56 }, { x: 24, y: 448, w: 342, h: 40 }], { deco: true });
t("om_h", "sec_omakase", OMH, [[32, 56, 0], [28, 44, 0]], H, WH, [{ x: 201, y: 950, w: 280, h: 56 }, { x: 24, y: 576, w: 342, h: 44 }], { role: "heading" });
t("om_n", "sec_omakase", OMN, [[14, 28, 0], [14, 26, 0]], B, WH, [{ x: 201, y: 1022, w: 280, h: 84 }, { x: 24, y: 628, w: 342, h: 52 }]);
tb("om_ph", { left: "0", width: "100%", top: "0", height: "56.25vw" });
tb("om_en", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: "calc(56.25vw - 8rem)", "font-size": "3.6rem", "line-height": "5rem", height: "5rem" });
const MN = FS ? Object.values(shop.catalog.menus).sort((a, b) => a.order - b.order)[0] : {};
const dOh = tbX(MN.name, 20, 5.6, 5.6), dOn = tbX(MN.description, 46, 2.8, 2.8), dO = r(dOh + dOn);
tb("om_h", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: "calc(56.25vw + 6.4rem)", "font-size": "3.2rem", "line-height": "5.6rem", height: `${r(5.6 + dOh)}rem` });
tb("om_n", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: `calc(56.25vw + ${r(12.8 + dOh)}rem)`, height: `${r(2.8 + dOn)}rem` });
const yP0 = 950, yS0 = 704, yT0 = `56.25vw + ${r(17.6 + dO)}rem`;
line("om_l0", "sec_omakase", { x: 520, y: yP0, w: 720 }, { x: 24, y: yS0, w: 342 });
tb("om_l0", { ...tbM, top: `calc(${yT0})` });
OM.forEach((row, i) => {
  const yP = yP0 + 96 * i, yS = yS0 + 104 * i, yT = `${yT0} + ${9.6 * i}rem`;
  t(`om_k${i}`, "sec_omakase", row.time, [[14, 24, 0], [14, 22, 0]], B, GD, [{ x: 520, y: yP + 36, w: 80, h: 24 }, { x: 24, y: yS + 16, w: 342, h: 22 }]);
  t(`om_t${i}`, "sec_omakase", row.name, [[20, 32, 0], [20, 32, 0]], B, WH, [{ x: 600, y: yP + 32, w: 400, h: 32 }, { x: 24, y: yS + 54, w: 230, h: 32 }]);
  t(`om_p${i}`, "sec_omakase", row.price, [[22, 32, 0], [22, 32, 0]], B, GD, [{ x: 1000, y: yP + 32, w: 240, h: 32 }, { x: 254, y: yS + 54, w: 112, h: 32 }], RT);
  line(`om_l${i + 1}`, "sec_omakase", { x: 520, y: yP + 95, w: 720 }, { x: 24, y: yS + 103, w: 342 });
  tb(`om_k${i}`, { left: "4.8rem", width: "8rem", top: `calc(${yT} + 3.6rem)` });
  tb(`om_t${i}`, { left: "12.8rem", width: "calc(100% - 9.6rem - 8rem - 18rem)", top: `calc(${yT} + 3.2rem)` });
  tb(`om_p${i}`, { left: "auto", right: "4.8rem", width: "18rem", top: `calc(${yT} + 3.2rem)` });
  tb(`om_l${i + 1}`, { ...tbM, top: `calc(${yT} + 9.5rem)` });
});
tablet.secs.sec_omakase = `calc(56.25vw + ${r(Math.max(56 + 9.6 * nOM, 25.2) + dO)}rem)`;

// ---- 4 お席
sec("sec_counter", "お席", 1354, 849, { anchor: "counter", nav: NAV(C.labels.counter, 3) });
t("ct_bg", "sec_counter", C.labels.counterBack, [[160, 200, 0], [56, 72, 0]], A, WH, [{ x: 13, y: 120, w: 1414, h: 200 }, { x: 13, y: 96, w: 364, h: 72 }], { z: 1, opacity: 6, deco: true });
photo("ct_ph1", "sec_counter", "ast_phct1", 2, { x: 360, y: 220, w: 1067, h: 600 }, { x: 13, y: 168, w: 364, h: 205 });
t("ct_lb", "sec_counter", C.labels.counter, LB, A, GD, [{ x: 201, y: 880, w: 560, h: 20 }, { x: 24, y: 405, w: 342, h: 20 }], { deco: true });
t("ct_h", "sec_counter", CTH, [[32, 56, 0], [24, 40, 0]], H, WH, [{ x: 201, y: 916, w: 560, h: 56 }, { x: 24, y: 437, w: 342, h: 40 }], { role: "heading" });
t("ct_p", "sec_counter", CTP, [[16, 36, 0.96], [16, 34, 0.96]], B, WH, [{ x: 201, y: 988, w: 560, h: 144 }, { x: 24, y: 489, w: 342, h: 136 }]);
photo("ct_ph2", "sec_counter", "ast_phct2", 2, { x: 986, y: 900, w: 441, h: 294 }, { x: 143, y: 629, w: 234, h: 156 });
const yC = `20rem + ${H169}`;
tb("ct_bg", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: "9.6rem", "font-size": "9.6rem", "line-height": "12rem", height: "12rem" });
tb("ct_ph1", { ...tbM, top: "20rem", height: `calc(${H169})` });
tb("ct_lb", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: `calc(${yC} + 4.8rem)` });
const ctH = FS ? C.counter.heading.replace("{seats}", String(shop.facilities?.seats?.total ?? "")) : "";
const dCh = tbX(ctH, 20, 5.6, 5.6), dCp = tbX(ANS("q_counter"), 37, 10.2, 3.6), dCt = r(dCh + dCp);
tb("ct_h", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: `calc(${yC} + 8.4rem)`, "font-size": "3.2rem", "line-height": "5.6rem", height: `${r(5.6 + dCh)}rem` });
tb("ct_p", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: `calc(${yC} + ${r(15.6 + dCh)}rem)`, height: `${r(10.2 + dCp)}rem` });
tb("ct_ph2", { left: `calc(4.8rem + ${col} * .631)`, width: `calc(${col} * .369)`, top: `calc(${yC} + ${r(27.6 + dCt)}rem)`, height: `calc(${col} * .246)` });
tablet.secs.sec_counter = `calc(${yC} + ${r(37.2 + dCt)}rem + ${col} * .246)`;

// ---- 5 ご案内・ご予約
sec("sec_info", "ご案内", 962, 1170, { anchor: "info", nav: NAV(C.labels.info, 4) });
line("in_top", "sec_info", { x: 201, y: 0, w: 1039 }, { x: 24, y: 0, w: 342 });
tb("in_top", { ...tbM, top: "0" });
t("in_lb", "sec_info", C.labels.info, LB, A, GD, [{ x: 201, y: 160, w: 400, h: 20 }, { x: 24, y: 96, w: 342, h: 20 }], { deco: true });
t("in_h", "sec_info", C.info.heading, [[32, 56, 0], [28, 44, 0]], H, WH, [{ x: 201, y: 196, w: 400, h: 56 }, { x: 24, y: 128, w: 342, h: 44 }], { role: "heading" });
tb("in_lb", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: "9.6rem" });
tb("in_h", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: "13rem", "font-size": "3.2rem", "line-height": "5.6rem", height: "5.6rem" });
const rP = 272, rS = 192, rT = 20;
line("in_l0", "sec_info", { x: 201, y: rP, w: 520 }, { x: 24, y: rS, w: 342 });
tb("in_l0", { ...tbM, top: `${rT}rem` });
INFO.forEach(([k, v], i) => {
  const yP = rP + 72 * i, yS = rS + 72 * i, yT = rT + 7.2 * i, isTel = v === PHONE;
  t(`in_k${i}`, "sec_info", k, [[14, 28, 0], [14, 28, 0]], B, GD, [{ x: 201, y: yP + 22, w: 120, h: 28 }, { x: 24, y: yS + 22, w: 72, h: 28 }], { deco: typeof k === "string" });
  t(`in_v${i}`, "sec_info", v, [[16, 28, 0], [16, 28, 0]], B, WH, [{ x: 321, y: yP + 22, w: 400, h: 28 }, { x: 96, y: yS + 22, w: 270, h: 28 }], isTel ? { link: TEL } : {});
  line(`in_l${i + 1}`, "sec_info", { x: 201, y: yP + 71, w: 520 }, { x: 24, y: yS + 71, w: 342 });
  tb(`in_k${i}`, { left: "4.8rem", width: "12rem", top: `${r(yT + 2.2)}rem` });
  tb(`in_v${i}`, { left: "16.8rem", width: "calc(100% - 9.6rem - 12rem)", top: `${r(yT + 2.2)}rem` });
  tb(`in_l${i + 1}`, { ...tbM, top: `${r(yT + 7.1)}rem` });
});
const nR = INFO.length, btnP = rP + 72 * nR + 48, btnS = rS + 72 * nR + 40, btnT = rT + 7.2 * nR + 4.8;
rect("in_btn", "sec_info", BK, 2, { x: 201, y: btnP, w: 280, h: 50 }, { x: 24, y: btnS, w: 342, h: 50 }, { stroke: { color: GD, width: 1 }, link: TEL });
t("in_btn_t", "sec_info", C.info.button, [[16, 24, 1.28], [16, 24, 1.28]], B, WH, [{ x: 201, y: btnP + 13, w: 280, h: 24 }, { x: 24, y: btnS + 13, w: 342, h: 24 }], { ...CT, link: TEL, z: 4, deco: true });
tb("in_btn", { left: "4.8rem", width: "28rem", top: `${r(btnT)}rem` });
tb("in_btn_t", { left: "4.8rem", width: "28rem", top: `${r(btnT + 1.3)}rem` });
const mapP = 240, mapS = btnS + 50 + 40, mapT = btnT + 5 + 4.8;
rect("in_map", "sec_info", BK, 2, { x: 761, y: mapP, w: 479, h: 480 }, { x: 13, y: mapS, w: 364, h: 320 });
tb("in_map", { ...tbM, top: `${r(mapT)}rem`, height: "40rem" });
secs.sec_info.minHeight = { pc: btnP + 50 + 160, sp: mapS + 320 + 96 };
tablet.secs.sec_info = `${r(mapT + 40 + 9.6)}rem`;

// ---- 6 フッター
sec("sec_footer", "フッター", 380, 400);
const F14 = [[14, 24, 0.7], [14, 24, 0.7]];
line("ft_top", "sec_footer", { x: 201, y: 0, w: 1039 }, { x: 24, y: 0, w: 342 });
t("ft_a1", "sec_footer", NAME, F14, B, WH, [{ x: 201, y: 80, w: 320, h: 24 }, { x: 24, y: 56, w: 342, h: 24 }]);
t("ft_a2", "sec_footer", ADDR, F14, B, WH, [{ x: 201, y: 108, w: 320, h: 24 }, { x: 24, y: 84, w: 342, h: 24 }]);
const fH = 24 * FOOT.length, fD = fH - 72; // フッターの営業の行（3行で前と同じ。増減の分だけスマホ・タブレットの電話を下げる）
t("ft_h", "sec_footer", { lines: FOOT }, F14, B, WH, [{ x: 560, y: 80, w: 330, h: fH }, { x: 24, y: 132, w: 342, h: fH }]);
t("ft_t", "sec_footer", PHONE, F14, B, WH, [{ x: 920, y: 80, w: 320, h: 24 }, { x: 24, y: 228 + fD, w: 342, h: 24 }], { link: TEL });
t("ft_c", "sec_footer", FS ? { mix: ["© ", NAME] } : `© ${C.name}`, [[12, 18, 0.6], [12, 18, 0.6]], B, WH, [{ x: 201, y: 300, w: 600, h: 18 }, { x: 24, y: 300, w: 342, h: 18 }]);
tb("ft_top", { ...tbM, top: "0" });
for (const id of ["ft_a1", "ft_a2", "ft_c"]) tb(id, { left: "4.8rem", width: "calc(50% - 7.2rem)" });
tb("ft_a1", { top: "6.4rem" }); tb("ft_a2", { top: "9.2rem" });
tb("ft_h", { left: "calc(50% + 2.4rem)", width: "calc(50% - 7.2rem)", top: "6.4rem" });
tb("ft_t", { left: "calc(50% + 2.4rem)", width: "calc(50% - 7.2rem)", top: `${r(15.6 + fD / 10)}rem` });
tb("ft_c", { top: "22rem" });
tablet.secs.sec_footer = "30rem";

// ---- 書き出し
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_09", canvas: { pcContentWidth: Pw, spDesignWidth: Sw },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_omakase", "sec_counter", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky", headerOverlay: { pages: ["pg_home"], textColor: WH } }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
fs.writeFileSync(`${DIR}/wa09-tablet.json`, JSON.stringify(tablet, null, 1) + "\n");
console.log(`wa09-gen: ${ID}：要素 ${Object.keys(els).length}／写真 ${rows.length} 枠`);
