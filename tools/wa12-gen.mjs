#!/usr/bin/env node
// wa-12：templates/wa-12/SPEC.md の数値から samples/<店>/ の shop・theme・assets・site を作る。
// 店名・文・値段は samples/<店>/wa12-content.json、写真は templates/wa-12/photos.txt（枠 短いID URL）から読む（この道具に店の中身を書かない）。
// 使い方：node tools/wa12-gen.mjs <店のID> → node tools/build.mjs samples/<店のID> → node tools/wa12-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa12-gen.mjs kurozumi）");
const DIR = `samples/${ID}`, LIST = "templates/wa-12/photos.txt";
const NOW = "2026-11-10T12:00:00+09:00";
const C = JSON.parse(fs.readFileSync(`${DIR}/wa12-content.json`, "utf8"));

// ---- 色（SPEC 3章）・書体（値段は font:body）
const BK = "#141414", WH = "#F2F2F0", GY = "#8C8C8C", RD = "#B23A2A";
const H = "font:heading", B = "font:body", A = "font:accent";
const yen = (n) => `${n.toLocaleString("en-US")}円`;

// ---- ① shop.json
const open = { status: "open", periods: C.periods };
const weekly = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, d === C.closedDay ? { status: "closed" } : open]));
const items = {}, placements = {}, categories = {};
C.menu.groups.forEach((g, gi) => {
  categories[`cat_${g.id}`] = { menuId: "mnu_main", name: g.name, order: gi + 1 };
  g.rows.forEach((row, i) => {
    items[`itm_${row.id}`] = { name: row.name, photos: [], prices: [row.from ? { id: `prc_${row.id}`, type: "from", amount: row.price } : { id: `prc_${row.id}`, type: "fixed", amount: row.price }], status: "onSale", labels: [] };
    placements[`plc_${row.id}`] = { itemId: `itm_${row.id}`, categoryId: `cat_${g.id}`, order: i + 1, menuId: "mnu_main" };
  });
});
const shop = {
  schemaVersion: 1, shopId: `shp_${ID}`, updatedAt: NOW, isSample: true, demo: true,
  basic: { name: C.name, nameKana: C.nameKana, genre: { template: "restaurant", detail: C.genreDetail } },
  location: { prefecture: "兵庫県", city: "芦屋市", town: C.town },
  hours: { weekly },
  contact: { phone: C.phone },
  catalog: { menus: { mnu_main: { order: 1, name: C.menu.heading } }, categories, labels: { lbl_recommend: { name: "おすすめ", system: "recommended", order: 1 } }, items, placements },
};
fs.mkdirSync(`${DIR}/media`, { recursive: true });
fs.writeFileSync(`${DIR}/shop.json`, JSON.stringify(shop, null, 2) + "\n");

// ---- ③ theme.json
fs.writeFileSync(`${DIR}/theme.json`, JSON.stringify({ schemaVersion: 1,
  colors: { background: { value: BK }, surface: { value: BK }, text: { value: WH }, textMuted: { value: GY }, primary: { value: RD }, accent: { value: RD }, line: { value: GY }, lineSoft: { value: "#3A3A3A" } },
  fonts: { heading: "zen-kaku-gothic-new", body: "zen-kaku-gothic-new", accent: "oswald" },
  textStyles: {
    pageTitle: { font: H, size: { pc: 88, sp: 44 }, lineHeight: 1.36, color: "theme:text" },
    heading: { font: H, size: { pc: 48, sp: 32 }, lineHeight: 1.5, color: "theme:text" },
    subheading: { font: H, size: { pc: 18, sp: 18 }, lineHeight: 1.6, color: "theme:text" },
    body: { font: B, size: { pc: 16, sp: 16 }, lineHeight: 2, color: "theme:text" },
    caption: { font: B, size: { pc: 14, sp: 14 }, lineHeight: 1.7, color: "theme:textMuted" },
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
const rows = fs.readFileSync(LIST, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/));
const assets = {};
for (const [k, page, url] of rows) {
  const meta = C.photos[k];
  if (!meta) throw new Error(`写真 ${k} の説明が wa12-content.json にありません`);
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

// ---- 配置の道具
const Pw = 1440, Sw = 390, r = (n) => Math.round(n * 10000) / 10000;
const box = (b, W_) => ({ ...b, x: r((b.x / W_) * 100), w: r((b.w / W_) * 100) });
const lay = (pc, sp) => ({ pc: box(pc, Pw), sp: box(sp, Sw) });
const els = {}, secs = {}, tablet = { els: {}, secs: {}, narrow: [] };
const add = (id, e) => { els[id] = e; };
const tb = (id, css) => { tablet.els[id] = { ...(tablet.els[id] || {}), ...css }; };
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (c) => (c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : [{ runs: [run(c)] }]);
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  add(id, { type: "text", z: x.z ?? 3, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r((ps[2] ?? 0) / ps[0]), ...(x.align ? { align: x.align } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: lay({ ...l[0], size: ps[0] }, { ...l[1], size: ss[0] }), ...(x.hidden ? { hidden: x.hidden } : {}) });
  if (l[1].x === 40 && l[1].w === 310 && !x.hidden?.sp) tablet.narrow.push(id); // 幅 360 未満で左右 24 にする文字
}
const sec = (id, name, pc, sp, more = {}) => { secs[id] = { name, background: { color: more.bg ?? "theme:background" }, minHeight: { pc, sp }, ...(more.anchor ? { anchor: more.anchor } : {}), ...(more.nav ? { nav: more.nav } : {}) }; };
const photo = (id, section, asset, z, pc, sp, crop = {}, darken) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1, ...crop }, ...(darken ? { darken } : {}) });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });
const line = (id, section, pc, sp) => rect(id, section, GY, 2, { ...pc, h: 1 }, { ...sp, h: 1 }, { opacity: 40 });
const TEL = { kind: "shopPhone" }, RESERVE = { kind: "anchor", value: "pg_home#reserve" }, CT = { align: "center" }, RT = { align: "right" };
const PHONE = ["/contact/phone", "phone"], ADDR = ["/location", "address"];
const BOLD = { weight: 700 }, HEAD = { role: "heading", weight: 700 };
const LB = [[18, 28, 2.52], [14, 20, 1.96]]; // 札の欧文（SP 14、PC 18、字間 .14em）
const col = "(100vw - 9.6rem)", tbM = { left: "4.8rem", width: "calc(100% - 9.6rem)" }; // タブレットの本文の列（左右 48）
const tT = (id, top, css = {}) => tb(id, { ...tbM, top, ...css });
const NAV = (label, order) => ({ label, order });

// ---- ヘッダー（PC 80／SP 56、地は炭の不透明）
sec("sec_header", "ヘッダー", 80, 56);
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: WH, font: A, spMenuBackground: BK }, layout: lay({ x: 560, y: 0, w: 640, h: 80, size: 14 }, { x: 318, y: 0, w: 60, h: 56 }) });
t("hd_name", "sec_header", C.name, [[22, 33, 0], [18, 27, 0]], H, WH, [{ x: 40, y: 23, w: 400, h: 33 }, { x: 16, y: 14, w: 280, h: 27 }], { ...BOLD, link: { kind: "anchor", value: "pg_home#top" } });
rect("hd_btn", "sec_header", RD, 2, { x: 1240, y: 18, w: 160, h: 44 }, { x: 0, y: 0, w: 10, h: 10 }, { link: RESERVE, hidden: { sp: true } });
t("hd_btn_t", "sec_header", C.labels.reserveButton, [[15, 22, 0.6], [15, 22, 0.6]], H, WH, [{ x: 1240, y: 29, w: 160, h: 22 }, { x: 0, y: 0, w: 10, h: 10 }], { ...BOLD, ...CT, z: 4, hidden: { sp: true } });
tb("hd_name", { left: "4.8rem" });

// ---- 1 最初の画面（PC：ヘッダーの下に 820、SP：ヘッダーの下に 788）
sec("sec_firstv", "最初の画面", 820, 788, { anchor: "top" });
photo("fv_ph", "sec_firstv", "ast_phfv", 1, { x: 720, y: 0, w: 720, h: 820 }, { x: 0, y: 0, w: 390, h: 500 }, { fx: 50, fy: 55 });
t("fv_en", "sec_firstv", C.heroLabel, [[16, 24, 2.24], [12, 18, 1.68]], A, GY, [{ x: 96, y: 160, w: 600, h: 24 }, { x: 40, y: 524, w: 310, h: 18 }], { weight: 500 });
t("fv_cp", "sec_firstv", { lines: C.catchCopyLines }, [[88, 120, 0], [44, 60, 0]], H, WH, [{ x: 96, y: 216, w: 600, h: 360 }, { x: 40, y: 550, w: 310, h: 180 }], { role: "pageTitle", weight: 700 });
t("fv_nm", "sec_firstv", C.name, [[18, 28, 0], [18, 28, 0]], H, WH, [{ x: 96, y: 608, w: 600, h: 28 }, { x: 40, y: 760, w: 310, h: 28 }], { ...BOLD, hidden: { sp: true } });
tb("fv_ph", { left: "0", width: "100%", top: "0", height: "75vw" });
tT("fv_en", "calc(75vw + 4.8rem)");
tT("fv_cp", "calc(75vw + 8.4rem)", { "font-size": "7.2rem", "line-height": "9.6rem", height: "28.8rem" });
tablet.secs.sec_firstv = "calc(75vw + 44.8rem)";

// ---- 2 紹介
sec("sec_about", "お店について", 720, 640, { anchor: "about", nav: NAV(C.labels.about, 1) });
rect("ab_vl", "sec_about", GY, 2, { x: 720, y: 0, w: 1, h: 160 }, { x: 195, y: 0, w: 1, h: 96 }, { opacity: 40 });
t("ab_lb", "sec_about", C.labels.about, LB, A, GY, [{ x: 240, y: 224, w: 640, h: 28 }, { x: 40, y: 120, w: 310, h: 20 }], { weight: 500 });
t("ab_h", "sec_about", C.about.heading, [[48, 72, 0], [32, 48, 0]], H, WH, [{ x: 240, y: 268, w: 960, h: 72 }, { x: 40, y: 148, w: 310, h: 144 }], { ...HEAD, hidden: { sp: true } });
t("ab_h2", "sec_about", { lines: C.about.headingSp }, [[48, 72, 0], [32, 48, 0]], H, WH, [{ x: 240, y: 268, w: 960, h: 216 }, { x: 40, y: 148, w: 310, h: 144 }], { ...HEAD, hidden: { pc: true } });
t("ab_p", "sec_about", C.about.body, [[18, 36, 0.72], [16, 32, 0.64]], B, WH, [{ x: 240, y: 372, w: 640, h: 108 }, { x: 40, y: 316, w: 310, h: 160 }]);
tb("ab_vl", { left: "50%", height: "12rem", top: "0" });
tT("ab_lb", "14.4rem");
tb("ab_h2", { display: "none" });
tb("ab_h", { ...tbM, display: "block", top: "18rem", "font-size": "3.8rem", "line-height": "5.8rem", height: "5.8rem" });
tT("ab_p", "27.2rem", { height: "9.6rem" });
tablet.secs.sec_about = "46.4rem";

// ---- 3 炭と肉（2 組）
sec("sec_story", "炭と肉", 2080, 2000);
const K = `${col} * 1.25`, yB = `${K} + 38.4rem`;
function storyCols(p, id, pcPh, spPh, pcTx, spTx, asset, c, label, top) {
  photo(`${p}_ph`, "sec_story", asset, 2, pcPh, spPh, {}, p === "sa" ? 15 : undefined);
  t(`${p}_lb`, "sec_story", label, LB, A, GY, [{ ...pcTx, h: 28 }, { ...spTx, y: spTx.y, h: 20 }], { weight: 500 });
  t(`${p}_h`, "sec_story", { lines: c.heading }, [[40, 60, 0], [32, 48, 0]], H, WH, [{ x: pcTx.x, y: pcTx.y + 52, w: pcTx.w, h: 120 }, { x: spTx.x, y: spTx.y + 28, w: spTx.w, h: 96 }], HEAD);
  t(`${p}_p`, "sec_story", c.body, [[16, 32, 0.64], [16, 32, 0.64]], B, WH, [{ x: pcTx.x, y: pcTx.y + 204, w: pcTx.w, h: 128 }, { x: spTx.x, y: spTx.y + 148, w: spTx.w, h: 128 }]);
  tb(`${p}_ph`, { left: "4.8rem", width: "calc(100% - 9.6rem)", top: `calc(${top})`, height: `calc(${K})` });
  tT(`${p}_lb`, `calc(${top} + ${K} + 4.8rem)`);
  tT(`${p}_h`, `calc(${top} + ${K} + 8.4rem)`);
  tT(`${p}_p`, `calc(${top} + ${K} + 19.2rem)`, { height: "9.6rem" });
}
storyCols("sa", "a", { x: 240, y: 0, w: 600, h: 900 }, { x: 0, y: 0, w: 390, h: 585 }, { x: 880, y: 240, w: 320 }, { x: 40, y: 633, w: 310 }, "ast_phsb1", C.charcoal, C.labels.charcoal, "0rem");
storyCols("sb", "b", { x: 600, y: 1020, w: 600, h: 900 }, { x: 0, y: 1005, w: 390, h: 585 }, { x: 240, y: 1260, w: 320 }, { x: 40, y: 1638, w: 310 }, "ast_phsb2", C.cut, C.labels.cut, yB);
tablet.secs.sec_story = `calc(${yB} + ${K} + 38.4rem)`;

// ---- 4 お品書き
sec("sec_menu", "お品書き", 1430, 1848, { anchor: "menu", nav: NAV(C.labels.menu, 2) });
t("mn_en", "sec_menu", C.labels.menuBig, [[120, 120, 0], [72, 72, 0]], A, WH, [{ x: 240, y: 160, w: 960, h: 120 }, { x: 40, y: 96, w: 310, h: 72 }], { weight: 700 });
t("mn_h", "sec_menu", C.menu.heading, [[32, 48, 0], [28, 42, 0]], H, WH, [{ x: 240, y: 296, w: 400, h: 48 }, { x: 40, y: 184, w: 310, h: 42 }], HEAD);
t("mn_n", "sec_menu", C.menu.note, [[14, 24, 0], [14, 24, 0]], B, GY, [{ x: 240, y: 348, w: 400, h: 24 }, { x: 40, y: 230, w: 310, h: 24 }]);
tT("mn_en", "9.6rem", { "font-size": "9.6rem", "line-height": "9.6rem", height: "9.6rem" });
tT("mn_h", "21.6rem"); tT("mn_n", "26.4rem");
// 表：PC は 焼肉（左）・〆とコース（右）、SP とタブレットは 1 列
const RH = 72, GH = 48, mp = { x: [240, 744], y: 400 };
const yS = { v: 278 }, yT = { v: 30.4 };
let yP = { 0: mp.y, 1: mp.y };
C.menu.groups.forEach((g, gi) => {
  const col_ = gi === 0 ? 0 : 1, xP = mp.x[col_];
  if (gi === 2) yP[1] += 24; // 右の列の群の間（左の下端にそろう）
  const gy = yP[col_], gyS = yS.v, gyT = yT.v;
  t(`mg_${gi}`, "sec_menu", g.name, [[18, 28, 0], [18, 28, 0]], H, WH, [{ x: xP, y: gy + 10, w: 456, h: 28 }, { x: 40, y: gyS + 10, w: 310, h: 28 }], HEAD);
  line(`ml_${gi}_top`, "sec_menu", { x: xP, y: gy + GH - 1, w: 456 }, { x: 40, y: gyS + GH - 1, w: 310 });
  tT(`mg_${gi}`, `${r(gyT + 1)}rem`);
  tT(`ml_${gi}_top`, `${r(gyT + 4.7)}rem`);
  g.rows.forEach((row, i) => {
    const y1 = gy + GH + RH * i, yS1 = gyS + GH + RH * i, yT1 = gyT + 4.8 + 7.2 * i, base = `${gi}_${i}`;
    t(`mt_${base}`, "sec_menu", row.name, [[16, 28, 0], [16, 28, 0]], B, WH, [{ x: xP, y: y1 + 22, w: 300, h: 28 }, { x: 40, y: yS1 + 22, w: 200, h: 28 }]);
    t(`mp_${base}`, "sec_menu", yen(row.price) + (row.from ? "〜" : ""), [[18, 28, 0], [18, 28, 0]], B, WH, [{ x: xP + 300, y: y1 + 22, w: 156, h: 28 }, { x: 240, y: yS1 + 22, w: 110, h: 28 }], RT);
    line(`ml_${base}`, "sec_menu", { x: xP, y: y1 + 71, w: 456 }, { x: 40, y: yS1 + 71, w: 310 });
    tb(`mt_${base}`, { left: "4.8rem", width: "calc(100% - 9.6rem - 18rem)", top: `${r(yT1 + 2.2)}rem` });
    tb(`mp_${base}`, { left: "auto", right: "4.8rem", width: "18rem", top: `${r(yT1 + 2.2)}rem` });
    tT(`ml_${base}`, `${r(yT1 + 7.1)}rem`);
  });
  yP[col_] = gy + GH + RH * g.rows.length;
  yS.v = gyS + GH + RH * g.rows.length + 24;
  yT.v = gyT + 4.8 + 7.2 * g.rows.length + 2.4;
});
const pY = 888, pS = yS.v + 24, pT = yT.v + 4.8;
const w3 = `(${col} - 4.8rem) / 3`;
photo("mn_ph1", "sec_menu", "ast_phmn1", 2, { x: 240, y: pY, w: 304, h: 380 }, { x: 40, y: pS, w: 310, h: 388 });
photo("mn_ph2", "sec_menu", "ast_phmn2", 2, { x: 568, y: pY, w: 304, h: 380 }, { x: 40, y: pS + 400, w: 149, h: 186 });
photo("mn_ph3", "sec_menu", "ast_phmn3", 2, { x: 896, y: pY, w: 304, h: 380 }, { x: 201, y: pS + 400, w: 149, h: 186 }, {}, 15);
["mn_ph1", "mn_ph2", "mn_ph3"].forEach((id, i) => tb(id, { left: `calc(4.8rem + (${w3} + 2.4rem) * ${i})`, width: `calc(${w3})`, top: `${r(pT)}rem`, height: `calc((${w3}) * 1.25)` }));
secs.sec_menu.minHeight = { pc: pY + 380 + 160, sp: pS + 400 + 186 + 96 };
tablet.secs.sec_menu = `calc(${r(pT)}rem + (${w3}) * 1.25 + 9.6rem)`;

// ---- 5 お席（全面の写真＋覆い）
sec("sec_seats", "お席", 720, 520, { anchor: "seats", nav: NAV(C.labels.seats, 3) });
photo("se_ph", "sec_seats", "ast_phse1", 1, { x: 0, y: 0, w: 1440, h: 720, fullBleed: true }, { x: 0, y: 0, w: 390, h: 520, fullBleed: true }, { fx: 50, fy: 50 }, 40);
t("se_lb", "sec_seats", C.labels.seats, LB, A, WH, [{ x: 240, y: 440, w: 640, h: 28 }, { x: 40, y: 270, w: 310, h: 20 }], { weight: 500 });
t("se_h", "sec_seats", C.seats.heading, [[48, 72, 0], [32, 48, 0]], H, WH, [{ x: 240, y: 480, w: 960, h: 72 }, { x: 40, y: 300, w: 310, h: 96 }], HEAD);
t("se_p", "sec_seats", C.seats.body, [[16, 32, 0.64], [16, 32, 0.64]], B, WH, [{ x: 240, y: 568, w: 640, h: 32 }, { x: 40, y: 408, w: 310, h: 64 }]);
tb("se_ph", { left: "0", width: "100%", top: "0", height: "43.2rem" });
tT("se_lb", "25.2rem"); tT("se_h", "28.8rem", { height: "4.8rem" }); tT("se_p", "35.2rem", { height: "3.2rem" });
tablet.secs.sec_seats = "43.2rem";

// ---- 6 ご案内
sec("sec_info", "ご案内", 856, 984, { anchor: "info", nav: NAV(C.labels.info, 4) });
t("in_lb", "sec_info", C.labels.info, LB, A, GY, [{ x: 240, y: 160, w: 640, h: 28 }, { x: 40, y: 96, w: 310, h: 20 }], { weight: 500 });
t("in_h", "sec_info", C.info.heading, [[48, 72, 0], [32, 48, 0]], H, WH, [{ x: 240, y: 196, w: 640, h: 72 }, { x: 40, y: 124, w: 310, h: 48 }], HEAD);
tT("in_lb", "9.6rem"); tT("in_h", "13.2rem", { height: "4.8rem" });
const irP = 336, irS = 200, irT = 20;
line("in_l0", "sec_info", { x: 240, y: irP, w: 456 }, { x: 40, y: irS, w: 310 });
tT("in_l0", `${irT}rem`);
const val = (v) => (v === "$address" ? ADDR : v === "$phone" ? PHONE : v);
C.info.rows.forEach(([k, v], i) => {
  const yp = irP + 72 * i, ys = irS + 72 * i, yt = irT + 7.2 * i;
  t(`in_k${i}`, "sec_info", k, [[14, 28, 0], [14, 28, 0]], B, GY, [{ x: 240, y: yp + 22, w: 104, h: 28 }, { x: 40, y: ys + 22, w: 72, h: 28 }]);
  t(`in_v${i}`, "sec_info", val(v), [[16, 28, 0], [16, 28, 0]], B, WH, [{ x: 344, y: yp + 22, w: 352, h: 28 }, { x: 112, y: ys + 22, w: 238, h: 28 }], v === "$phone" ? { link: TEL } : {});
  line(`in_l${i + 1}`, "sec_info", { x: 240, y: yp + 71, w: 456 }, { x: 40, y: ys + 71, w: 310 });
  tb(`in_k${i}`, { left: "4.8rem", width: "12rem", top: `${r(yt + 2.2)}rem` });
  tb(`in_v${i}`, { left: "16.8rem", width: "calc(100% - 21.6rem)", top: `${r(yt + 2.2)}rem` });
  tT(`in_l${i + 1}`, `${r(yt + 7.1)}rem`);
});
const nR = C.info.rows.length, mapS = irS + 72 * nR + 48, mapT = irT + 7.2 * nR + 4.8;
rect("in_map", "sec_info", BK, 2, { x: 744, y: irP, w: 456, h: 360 }, { x: 40, y: mapS, w: 310, h: 280 });
tT("in_map", `${r(mapT)}rem`, { height: "40rem" });
secs.sec_info.minHeight = { pc: irP + 72 * nR + 160, sp: mapS + 280 + 96 };
tablet.secs.sec_info = `${r(mapT + 40 + 9.6)}rem`;

// ---- 7 ご予約（赤の全幅）
sec("sec_reserve", "ご予約", 320, 360, { anchor: "reserve", bg: RD });
t("rs_h", "sec_reserve", C.reserve.heading, [[48, 72, 0], [30, 48, 0]], H, WH, [{ x: 240, y: 88, w: 640, h: 72 }, { x: 40, y: 64, w: 310, h: 48 }], HEAD);
t("rs_t", "sec_reserve", PHONE, [[40, 56, 0], [32, 44, 0]], A, WH, [{ x: 240, y: 168, w: 640, h: 56 }, { x: 40, y: 120, w: 310, h: 44 }], { weight: 500, link: TEL });
rect("rs_btn", "sec_reserve", WH, 2, { x: 920, y: 128, w: 280, h: 64 }, { x: 40, y: 216, w: 310, h: 56 }, { link: TEL });
t("rs_btn_t", "sec_reserve", C.reserve.button, [[18, 28, 0], [16, 24, 0]], H, BK, [{ x: 920, y: 146, w: 280, h: 28 }, { x: 40, y: 232, w: 310, h: 24 }], { ...BOLD, ...CT, z: 4 });
tT("rs_h", "6.4rem", { height: "4.8rem" }); tT("rs_t", "12rem", { height: "4.4rem" });
tT("rs_btn", "20.8rem"); tT("rs_btn_t", "22.4rem");
tablet.secs.sec_reserve = "34rem";

// ---- 8 フッター
sec("sec_footer", "フッター", 320, 320);
const F14 = [[14, 24, 0.7], [14, 24, 0.7]];
line("ft_top", "sec_footer", { x: 240, y: 0, w: 960 }, { x: 40, y: 0, w: 310 });
t("ft_a1", "sec_footer", C.name, F14, B, WH, [{ x: 240, y: 80, w: 300, h: 24 }, { x: 40, y: 56, w: 310, h: 24 }]);
t("ft_a2", "sec_footer", ADDR, F14, B, WH, [{ x: 240, y: 108, w: 300, h: 24 }, { x: 40, y: 84, w: 310, h: 24 }]);
t("ft_h", "sec_footer", { lines: C.footerHours }, F14, B, WH, [{ x: 560, y: 80, w: 300, h: 48 }, { x: 40, y: 132, w: 310, h: 48 }]);
t("ft_t", "sec_footer", PHONE, F14, B, WH, [{ x: 880, y: 80, w: 320, h: 24 }, { x: 40, y: 204, w: 310, h: 24 }], { link: TEL });
t("ft_c", "sec_footer", `© ${C.name}`, [[12, 18, 0.6], [12, 18, 0.6]], B, GY, [{ x: 240, y: 260, w: 600, h: 18 }, { x: 40, y: 260, w: 310, h: 18 }]);
tb("ft_top", { ...tbM, top: "0" });
for (const id of ["ft_a1", "ft_a2", "ft_c"]) tb(id, { left: "4.8rem", width: "calc(50% - 7.2rem)" });
tb("ft_a1", { top: "6.4rem" }); tb("ft_a2", { top: "9.2rem" });
tb("ft_h", { left: "calc(50% + 2.4rem)", width: "calc(50% - 7.2rem)", top: "6.4rem" });
tb("ft_t", { left: "calc(50% + 2.4rem)", width: "calc(50% - 7.2rem)", top: "13.6rem" });
tb("ft_c", { top: "24rem" });
tablet.secs.sec_footer = "30rem";

// ---- 書き出し
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_12", canvas: { pcContentWidth: Pw, spDesignWidth: Sw },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_story", "sec_menu", "sec_seats", "sec_info", "sec_reserve"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
fs.writeFileSync(`${DIR}/wa12-tablet.json`, JSON.stringify(tablet, null, 1) + "\n");
console.log(`wa12-gen: ${ID}：要素 ${Object.keys(els).length}／写真 ${rows.length} 枠`);
