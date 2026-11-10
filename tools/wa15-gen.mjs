#!/usr/bin/env node
// wa-15：templates/wa-15/SPEC.md の数値から samples/<店>/ の shop・theme・assets・site とタブレットの配置（wa15-tablet.json）を作る。
// 店名・文・おまかせの流れ・値段は samples/<店>/wa15-content.json、写真は templates/wa-15/photos.txt（枠 短いID URL）から読む（この道具に店の中身を書かない）。
// 使い方：node tools/wa15-gen.mjs <店のID> → node tools/build.mjs samples/<店のID> → node tools/wa15-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa15-gen.mjs kakitsubata）");
const DIR = `samples/${ID}`, LIST = "templates/wa-15/photos.txt";
const NOW = "2026-11-10T12:00:00+09:00";
const C = JSON.parse(fs.readFileSync(`${DIR}/wa15-content.json`, "utf8"));

// ---- 色（SPEC 3章）・書体（見出し Shippori Antique B1／本文 Zen Kaku Gothic New／欧文と番号 EB Garamond）
const KI = "#EFE6D6", PANEL = "#F7F2E8", DEEP = "#E6DAC4", AI = "#2B4C6F", GOLD = "#D8B25A", INK = "#1E1E1E", WH = "#FFFFFF", MUTE = "#6B6152", MUTE_D = "#5C5344", PRICE = "#7A5C17";
const H = "font:heading", B = "font:body", E = "font:accent";
const yen = (n) => `${n.toLocaleString("en-US")}円`;

// ---- ① shop.json
const weekly = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, d === C.closedDay ? { status: "closed" } : { status: "open", periods: C.periods }]));
const items = {}, placements = {}, categories = {};
C.menu.groups.forEach((g, gi) => {
  categories[`cat_${g.id}`] = { menuId: "mnu_main", name: g.name, order: gi + 1 };
  g.rows.forEach((row, i) => {
    items[`itm_${row.id}`] = { name: row.name, photos: [], prices: [{ id: `prc_${row.id}`, type: row.from ? "from" : "fixed", amount: row.price }], status: "onSale", labels: [] };
    placements[`plc_${row.id}`] = { itemId: `itm_${row.id}`, categoryId: `cat_${g.id}`, order: i + 1, menuId: "mnu_main" };
  });
});
const shop = {
  schemaVersion: 1, shopId: `shp_${ID}`, updatedAt: NOW, isSample: true, demo: true,
  basic: { name: C.name, nameKana: C.nameKana, genre: { template: "restaurant", detail: C.genreDetail } },
  location: { prefecture: "兵庫県", city: "芦屋市", town: C.town, ...(C.geo ? { geo: C.geo } : {}) },
  hours: { weekly },
  contact: { phone: C.phone },
  catalog: { menus: { mnu_main: { order: 1, name: C.menu.heading } }, categories, labels: { lbl_recommend: { name: "おすすめ", system: "recommended", order: 1 } }, items, placements },
};
fs.mkdirSync(`${DIR}/media`, { recursive: true });
fs.writeFileSync(`${DIR}/shop.json`, JSON.stringify(shop, null, 2) + "\n");

// ---- ③ theme.json
fs.writeFileSync(`${DIR}/theme.json`, JSON.stringify({ schemaVersion: 1,
  colors: { background: { value: KI }, surface: { value: PANEL }, text: { value: INK }, textMuted: { value: MUTE }, primary: { value: AI }, accent: { value: GOLD }, line: { value: GOLD }, lineSoft: { value: GOLD } },
  fonts: { heading: "shippori-antique-b1", body: "zen-kaku-gothic-new", accent: "eb-garamond" },
  textStyles: {
    pageTitle: { font: H, size: { pc: 48, sp: 36 }, lineHeight: 1.5, color: "theme:text" },
    heading: { font: H, size: { pc: 40, sp: 28 }, lineHeight: 1.4, color: "theme:primary" },
    subheading: { font: H, size: { pc: 24, sp: 18 }, lineHeight: 1.5, color: "theme:text" },
    body: { font: B, size: { pc: 15, sp: 15 }, lineHeight: 2, color: "theme:text" },
    caption: { font: B, size: { pc: 13, sp: 13 }, lineHeight: 1.6, color: "theme:textMuted" },
  } }, null, 2) + "\n");

// ---- 写真（SPEC 7章。photos.txt の URL は表示幅の 2 倍に合わせた WebP）
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
  if (!meta) throw new Error(`写真 ${k} の説明が wa15-content.json にありません`);
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
const els = {}, secs = {}, tablet = { els: {}, secs: {} };
const add = (id, e) => { els[id] = e; };
const tb = (id, css) => { tablet.els[id] = { ...(tablet.els[id] || {}), ...css }; };
const rem = (n) => `${r(n / 10)}rem`;
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (c) => (c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : [{ runs: [run(c)] }]);
// 文字の箱。sizes＝[[PC の大きさ, PC の行送り], [SP の大きさ, SP の行送り]]（行送りの比は PC の値を両方に使う）。x.vp／x.vs＝PC／SP で縦書き
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  add(id, { type: "text", z: x.z ?? 5, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: x.ls ?? 0, ...(x.align ? { align: x.align } : {}), ...(x.italic ? { italic: true } : {}), ...(x.noWrap ? { noWrap: true } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: lay({ ...l[0], size: ps[0], ...(x.vp ? { writingMode: "vertical" } : {}) }, { ...l[1], size: ss[0], ...(x.vs ? { writingMode: "vertical" } : {}) }), ...(x.hidden ? { hidden: x.hidden } : {}) });
}
const sec = (id, name, pc, sp, more = {}) => { secs[id] = { name, background: { color: more.bg ?? "theme:background" }, minHeight: { pc, sp }, ...(more.anchor ? { anchor: more.anchor } : {}), ...(more.nav ? { nav: more.nav } : {}) }; };
const photo = (id, section, asset, z, pc, sp, crop = {}) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1, ...crop } });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });
const gline = (id, section, pc, sp, z = 2) => rect(id, section, GOLD, z, { ...pc, h: 1 }, { ...sp, h: 1 });
const TEL = { kind: "shopPhone" }, RESERVE = { kind: "anchor", value: "pg_home#reserve" }, CT = { align: "center" }, RT = { align: "right" };
const PHONE = ["/contact/phone", "phone"], ADDR = ["/location", "address"];
const NAV = (label, order) => ({ label, order });
const val = (v) => (v === "$address" ? ADDR : v === "$phone" ? PHONE : Array.isArray(v) ? { lines: v } : v);

// タブレット（768〜1024）：左右 48、本文の列 W＝100vw−96（SPEC 2章「タブレット」）。縦の位置は { p: px, k: W の倍率 } で持つ
const M = 48, W = "(100vw - 9.6rem)", COL = `calc(${W})`;
const ex = (y) => (typeof y === "number" ? rem(y) : y.k ? `calc(${rem(y.p)} + ${W} * ${r(y.k)})` : rem(y.p));
const at = (y, n) => (typeof y === "number" ? { p: y + n, k: 0 } : { p: y.p + n, k: y.k });
const plus = (y, n, k = 0) => ({ p: (typeof y === "number" ? y : y.p) + n, k: (typeof y === "number" ? 0 : y.k) + k });
const tT = (id, top, css = {}) => tb(id, { left: rem(M), width: COL, top: ex(top), ...css });
const font = (size, lh) => ({ "font-size": rem(size), "line-height": rem(lh) });
const TAB_H = { "font-size": "3.2rem", "line-height": "4.4rem" }; // タブレットの見出し（横書き 32/44）

// 共通の数：段の上下の余白（PC 60＋60＝段の間 120、SP 40＋40＝80、タブレット 48＋48）
const PT = 60, ST = 40, TT = 48;

// ---- 0 ヘッダー（sticky、PC 72／SP 60、地は白木の不透明）
sec("sec_header", "ヘッダー", 72, 60);
add("hd_nav", { type: "nav", z: 5, section: "sec_header", style: { color: INK, font: B, spMenuBackground: KI }, layout: lay({ x: 600, y: 0, w: 600, h: 72, size: 15 }, { x: 290, y: 0, w: 84, h: 60 }) });
t("hd_name", "sec_header", C.name, [[22, 32], [18, 28]], H, INK, [{ x: 80, y: 20, w: 320, h: 32 }, { x: 20, y: 16, w: 240, h: 28 }], { link: { kind: "anchor", value: "pg_home#top" }, noWrap: true });
rect("hd_btn", "sec_header", AI, 2, { x: 1240, y: 16, w: 120, h: 40 }, { x: 0, y: 0, w: 10, h: 10 }, { link: RESERVE, radius: 2, hidden: { sp: true } });
t("hd_btn_t", "sec_header", C.labels.reserveButton, [[15, 22], [15, 22]], B, WH, [{ x: 1240, y: 25, w: 120, h: 22 }, { x: 0, y: 0, w: 10, h: 10 }], { weight: 700, ...CT, hidden: { sp: true } });
tb("hd_name", { left: rem(M) });

// ---- 1 最初の画面（左に縦書きのコピー・紹介文・事実、右に 763 角の写真、写真の左の縁に藍の札）
{
  const S = "sec_firstv";
  sec(S, "最初の画面", 840, 1040, { anchor: "top" });
  photo("fv_ph", S, "ast_phfv", 1, { x: 597, y: 0, w: 763, h: 763 }, { x: 0, y: 0, w: 390, h: 390 });
  rect("fv_tag", S, AI, 3, { x: 557, y: 440, w: 56, h: 224 }, { x: 32, y: 350, w: 48, h: 176 });
  t("fv_tag_t", S, C.tagName, [[20, 24], [16, 19.2]], H, WH, [{ x: 573, y: 440, w: 24, h: 224 }, { x: 46, y: 350, w: 20, h: 176 }], { vp: true, vs: true, ls: 0.2, ...CT, z: 4 });
  t("fv_cp", S, { lines: C.catchCopyLines }, [[48, 72], [36, 54]], H, INK, [{ x: 200, y: 64, w: 168, h: 360 }, { x: 150, y: 430, w: 116, h: 264 }], { vp: true, vs: true, ls: 0.12, role: "pageTitle" });
  t("fv_p", S, C.intro, [[15, 30], [15, 30]], B, INK, [{ x: 120, y: 464, w: 364, h: 150 }, { x: 32, y: 730, w: 326, h: 150 }]);
  gline("fv_ln", S, { x: 120, y: 640, w: 24 }, { x: 32, y: 896, w: 24 });
  t("fv_f", S, Array.isArray(C.facts) ? { lines: C.facts } : C.facts, [[13, 24], [13, 24]], B, INK, [{ x: 120, y: 656, w: 400, h: 48 }, { x: 32, y: 912, w: 326, h: 48 }], { weight: 500 });
  t("fv_en", S, C.fvEn, [[12, 16], [12, 16]], E, MUTE, [{ x: 120, y: 720, w: 400, h: 16 }, { x: 32, y: 976, w: 326, h: 16 }], { ls: 0.2 });
  // タブレット：コピーは縦書きのまま左、写真は右、札は写真の左の縁。紹介文は下に全幅
  const phW = `(${W} - 16.8rem)`;
  tb("fv_cp", { left: rem(M), top: rem(TT), width: rem(136), height: rem(300), ...font(40, 60) });
  tb("fv_ph", { left: rem(216), width: `calc(${phW})`, top: rem(TT), height: `calc(${phW})` });
  tb("fv_tag", { left: rem(200), width: rem(40), top: `calc(${rem(TT)} + ${phW} * .66)`, height: rem(160) });
  tb("fv_tag_t", { left: rem(210), width: rem(20), top: `calc(${rem(TT)} + ${phW} * .66)`, height: rem(160), ...font(16, 19.2) });
  const y0 = { p: TT + 48 - 168, k: 1 }; // 写真の下端＋48
  tT("fv_p", y0, font(16, 32));
  tT("fv_ln", plus(y0, 96 + 24), { width: rem(24), height: "1px" });
  tT("fv_f", plus(y0, 96 + 40), font(13, 24));
  tT("fv_en", plus(y0, 96 + 40 + 48 + 16), font(12, 16));
  tablet.secs[S] = ex(plus(y0, 96 + 40 + 48 + 16 + 16 + 48));
}

// ---- 2 おまかせの流れ（見せ場。左に縦書きの見出し・文・縦長の写真、右に番号と品名）
const F = C.flow.rows;
if (F.length) {
  const S = "sec_flow", n = F.length;
  const RH = 84, SRH = 64, TRH = 76;
  const pcBottom = Math.max(600 + 480, RH * n + 48 + 24);
  const spRows = 206, spNote = spRows + SRH * n + 24, spPh = spNote + 24 + 32;
  sec(S, "おまかせの流れ", PT + pcBottom + PT, ST + spPh + 240 + ST, { anchor: "flow", nav: NAV(C.labels.flow, 1) });
  const y = (v) => PT + v, ys = (v) => ST + v;
  t("fl_h", S, C.flow.heading, [[40, 56], [28, 39.2]], H, AI, [{ x: 200, y: y(0), w: 56, h: 336 }, { x: 32, y: ys(0), w: 326, h: 40 }], { vp: true, ls: 0.12, role: "heading" });
  t("fl_en", S, C.flow.en, [[13, 16], [13, 16]], E, MUTE, [{ x: 160, y: y(360), w: 136, h: 16 }, { x: 32, y: ys(52), w: 326, h: 16 }], { italic: true, ...CT });
  t("fl_p", S, C.flow.body, [[15, 30], [15, 30]], B, INK, [{ x: 117, y: y(408), w: 260, h: 150 }, { x: 32, y: ys(84), w: 326, h: 90 }]);
  photo("fl_ph", S, "ast_phfr2", 2, { x: 137, y: y(600), w: 240, h: 480 }, { x: 32, y: ys(spPh), w: 326, h: 240 }, { fy: 72 });
  const tRows = TT + 56 + 28 + 64 + 32;
  tT("fl_h", TT, TAB_H);
  tT("fl_en", TT + 52, font(13, 16));
  tT("fl_p", TT + 80, font(16, 32));
  F.forEach((row, i) => {
    const yp = y(RH * i), ysp = ys(spRows + SRH * i), yt = tRows + TRH * i;
    gline(`fl_l${i}`, S, { x: 464, y: yp, w: 896 }, { x: 32, y: ysp, w: 326 });
    t(`fl_n${i}`, S, String(i + 1).padStart(2, "0"), [[28, 36], [22, 28]], E, AI, [{ x: 464, y: yp + 24, w: 88, h: 36 }, { x: 32, y: ysp + 18, w: 48, h: 28 }], { weight: 500, noWrap: true });
    if (row.kind) t(`fl_k${i}`, S, row.kind, [[13, 20], [12, 18.5]], B, MUTE, [{ x: 552, y: yp + 32, w: 72, h: 20 }, { x: 80, y: ysp + 23, w: 48, h: 19 }], { weight: 500, noWrap: true });
    t(`fl_t${i}`, S, row.name, [[24, 36], [18, 27]], H, INK, [{ x: 632, y: yp + 24, w: 600, h: 36 }, { x: 128, y: ysp + 18, w: 230, h: 27 }], { noWrap: true, role: "subheading" });
    tT(`fl_l${i}`, yt, { height: "1px" });
    tb(`fl_n${i}`, { left: rem(M), width: rem(72), top: rem(yt + 20), ...font(24, 32) });
    if (row.kind) tb(`fl_k${i}`, { left: rem(M + 72), width: rem(64), top: rem(yt + 27), ...font(13, 20) });
    tb(`fl_t${i}`, { left: rem(M + 136), width: `calc(${W} - 13.6rem)`, top: rem(yt + 22), ...font(22, 32) });
  });
  gline(`fl_l${n}`, S, { x: 464, y: y(RH * n), w: 896 }, { x: 32, y: ys(spRows + SRH * n), w: 326 });
  tT(`fl_l${n}`, tRows + TRH * n, { height: "1px" });
  t("fl_note", S, C.flow.note, [[13, 24], [13, 24]], B, MUTE, [{ x: 464, y: y(RH * n + 48), w: 896, h: 24 }, { x: 32, y: ys(spNote), w: 326, h: 24 }]);
  const tNote = tRows + TRH * n + 32;
  tT("fl_note", tNote, font(13, 24));
  const tPh = tNote + 24 + 40;
  tT("fl_ph", tPh, { height: `calc(${W} * .75)` });
  tablet.secs[S] = ex({ p: tPh + TT, k: 0.75 });
}

// ---- 3 軽やかな衣（左に大きな写真、右に縦書きの見出し・文・小さな写真）
{
  const S = "sec_about", y = (v) => PT + v, ys = (v) => ST + v;
  sec(S, "軽やかな衣", PT + 856 + PT, ST + 870 + ST, { anchor: "about", nav: NAV(C.labels.about, 2) });
  photo("ab_ph1", S, "ast_phab1", 2, { x: 80, y: y(58), w: 896, h: 717 }, { x: 0, y: ys(0), w: 390, h: 312 });
  t("ab_h", S, C.about.heading, [[40, 56], [28, 39.2]], H, AI, [{ x: 1150, y: y(0), w: 56, h: 240 }, { x: 32, y: ys(352), w: 326, h: 40 }], { vp: true, ls: 0.12, role: "heading" });
  t("ab_en", S, C.about.en, [[13, 16], [13, 16]], E, MUTE, [{ x: 1110, y: y(260), w: 136, h: 16 }, { x: 32, y: ys(404), w: 326, h: 16 }], { italic: true, ...CT });
  t("ab_p", S, C.about.body, [[15, 30], [15, 30]], B, INK, [{ x: 1063, y: y(312), w: 260, h: 210 }, { x: 32, y: ys(436), w: 326, h: 150 }]);
  photo("ab_ph2", S, "ast_phab2", 2, { x: 1063, y: y(560), w: 260, h: 260 }, { x: 134, y: ys(618), w: 224, h: 224 });
  t("ab_c", S, C.about.caption, [[13, 20], [13, 20]], B, MUTE, [{ x: 1063, y: y(836), w: 260, h: 20 }, { x: 134, y: ys(850), w: 224, h: 20 }]);
  const phH = { p: TT, k: 0.8 };
  tT("ab_ph1", TT, { height: `calc(${W} * .8)` });
  tT("ab_h", plus(phH, 40), TAB_H);
  tT("ab_en", plus(phH, 92), font(13, 16));
  tT("ab_p", plus(phH, 120), font(16, 32));
  tb("ab_ph2", { left: rem(M), width: rem(240), top: ex(plus(phH, 120 + 128 + 32)), height: rem(240) });
  tb("ab_c", { left: rem(M + 264), width: `calc(${W} - 26.4rem)`, top: ex(plus(phH, 120 + 128 + 32 + 200)), ...font(14, 24) });
  tablet.secs[S] = ex(plus(phH, 120 + 128 + 32 + 240 + TT));
}

// ---- 4 目の前の揚げ鍋（左に縦書きの見出しと文、右に大きな写真）
{
  const S = "sec_counter", y = (v) => PT + v, ys = (v) => ST + v;
  sec(S, "目の前の揚げ鍋", PT + 717 + PT, ST + 600 + ST, { anchor: "counter" });
  t("ct_h", S, C.counter.heading, [[40, 56], [28, 39.2]], H, AI, [{ x: 200, y: y(0), w: 56, h: 336 }, { x: 32, y: ys(0), w: 326, h: 40 }], { vp: true, ls: 0.12, role: "heading" });
  t("ct_en", S, C.counter.en, [[13, 16], [13, 16]], E, MUTE, [{ x: 160, y: y(360), w: 136, h: 16 }, { x: 32, y: ys(52), w: 326, h: 16 }], { italic: true, ...CT });
  t("ct_p", S, C.counter.body, [[15, 30], [15, 30]], B, INK, [{ x: 117, y: y(408), w: 260, h: 180 }, { x: 32, y: ys(84), w: 326, h: 120 }]);
  t("ct_f", S, C.counter.fact, [[20, 32], [18, 28.8]], H, AI, [{ x: 117, y: y(640), w: 260, h: 32 }, { x: 32, y: ys(224), w: 326, h: 29 }]);
  photo("ct_ph", S, "ast_phfr1", 2, { x: 464, y: y(0), w: 896, h: 717 }, { x: 0, y: ys(288), w: 390, h: 312 });
  tT("ct_h", TT, TAB_H);
  tT("ct_en", TT + 52, font(13, 16));
  tT("ct_p", TT + 80, font(16, 32));
  tT("ct_f", TT + 80 + 64 + 24, font(20, 32));
  const tPh = TT + 80 + 64 + 24 + 32 + 40;
  tT("ct_ph", tPh, { height: `calc(${W} * .8)` });
  tablet.secs[S] = ex({ p: tPh + TT, k: 0.8 });
}

// ---- 5 お品書き（PC：面に昼・夜・単品の 3 列。SP・タブレット：面に 3 つの群を縦に積む。下に写真 2 枚）
{
  const S = "sec_menu", G = C.menu.groups;
  const lines = (row, perLine) => (row.lines ? row.lines.length : row.name.length > perLine ? 2 : 1); // 品名の行数の見積もり（PC 幅 196 に 16px で 12 字、SP 幅 220 に 13 字）
  const rowH = (nl, base) => base + 26 * (nl - 1);
  // PC
  const cx = [368, 720, 1072], y = (v) => PT + v;
  let rowsEnd = 160;
  const pcRows = G.map((g) => { let yy = 160; const out = g.rows.map((row) => { const h = rowH(lines(row, 12), 72); const o = { y: yy, h }; yy += h; return o; }); rowsEnd = Math.max(rowsEnd, yy); return out; });
  const noteY = rowsEnd + 48, panelH = noteY + 20 + 56, phY = panelH + 64, pcBottom = phY + 390 + 16 + 28;
  // SP
  const ys = (v) => ST + v;
  let sy = 64 + 40;
  const spG = G.map((g) => { const o = { h: sy, sub: sy + 42 }; let yy = sy + 72; o.rows = g.rows.map((row) => { const h = rowH(lines(row, 13), 64); const q = { y: yy, h }; yy += h; return q; }); sy = yy + 40; return o; });
  const spPanelH = sy - 64, spNote = 64 + spPanelH + 24, spPh = spNote + 20 + 32, spBottom = spPh + (245 + 16 + 28) * 2 + 32;
  // タブレット（3 列にしない。群を縦に積む。品名は 1 行に収まる幅）
  const tH = TT, tPanel = TT + 44.8 + 32;
  let ty = tPanel + 40;
  const tG = G.map((g) => { const o = { h: ty, sub: ty + 46 }; let yy = ty + 80; o.rows = g.rows.map((row) => { const h = rowH(lines(row, 99), 64); const q = { y: yy, h }; yy += h; return q; }); ty = yy + 40; return o; });
  const tPanelH = ty - tPanel, tNote = tPanel + tPanelH + 24, tPh = tNote + 20 + 40;
  const w2 = `((${W} - 2.4rem) / 2)`;

  sec(S, "お品書き", PT + pcBottom + PT, ST + spBottom + ST, { anchor: "menu", nav: NAV(C.labels.menu, 3) });
  rect("mn_bg", S, PANEL, 1, { x: 288, y: y(0), w: 1152, h: panelH }, { x: 0, y: ys(64), w: 390, h: spPanelH });
  t("mn_h", S, C.menu.heading, [[40, 56], [28, 39.2]], H, AI, [{ x: 180, y: y(48), w: 56, h: 200 }, { x: 32, y: ys(0), w: 326, h: 40 }], { vp: true, ls: 0.12, role: "heading" });
  tT("mn_h", tH, TAB_H);
  tb("mn_bg", { left: "0", width: "100%", top: rem(tPanel), height: rem(tPanelH) });
  G.forEach((g, gi) => {
    const X = cx[gi % 3], sg = spG[gi], tg = tG[gi];
    t(`mg_${gi}`, S, g.name, [[28, 40], [24, 34.3]], H, AI, [{ x: X, y: y(64), w: 300, h: 40 }, { x: 32, y: ys(sg.h), w: 326, h: 35 }], { ls: 0.2, role: "heading" });
    t(`ms_${gi}`, S, g.sub, [[13, 20], [13, 20]], B, MUTE, [{ x: X, y: y(112), w: 300, h: 20 }, { x: 32, y: ys(sg.sub), w: 326, h: 20 }]);
    tT(`mg_${gi}`, tg.h, font(28, 40));
    tT(`ms_${gi}`, tg.sub, font(13, 20));
    g.rows.forEach((row, i) => {
      const p = pcRows[gi][i], s = sg.rows[i], q = tg.rows[i], id = `${gi}_${i}`;
      const pNl = lines(row, 12), sNl = lines(row, 13);
      t(`mt_${id}`, S, row.lines ? { lines: row.lines } : row.name, [[16, 26], [16, 26]], B, INK, [{ x: X, y: y(p.y + 23), w: 196, h: 26 * pNl }, { x: 32, y: ys(s.y + 19), w: 220, h: 26 * sNl }], { weight: 500 });
      t(`mp_${id}`, S, yen(row.price) + (row.from ? "〜" : ""), [[16, 26], [16, 26]], B, PRICE, [{ x: X + 200, y: y(p.y + (p.h - 26) / 2), w: 100, h: 26 }, { x: 258, y: ys(s.y + (s.h - 26) / 2), w: 100, h: 26 }], { weight: 700, ...RT, noWrap: true });
      gline(`ml_${id}`, S, { x: X, y: y(p.y + p.h - 1), w: 300 }, { x: 32, y: ys(s.y + s.h - 1), w: 326 });
      tb(`mt_${id}`, { left: rem(M), width: `calc(${W} - 18rem)`, top: rem(q.y + 20), ...font(17, 26) });
      tb(`mp_${id}`, { left: "auto", right: rem(M), width: rem(160), top: rem(q.y + (q.h - 26) / 2), ...font(17, 26) });
      tT(`ml_${id}`, q.y + q.h - 1, { height: "1px" });
    });
  });
  t("mn_n", S, C.menu.note, [[13, 20], [13, 20]], B, MUTE, [{ x: 368, y: y(noteY), w: 700, h: 20 }, { x: 32, y: ys(spNote), w: 326, h: 20 }]);
  tT("mn_n", tNote, font(13, 20));
  C.menu.photos.forEach(([k, name], i) => {
    const sp = spPh + (245 + 16 + 28 + 32) * i;
    photo(`mn_ph${i + 1}`, S, `ast_ph${k}`, 2, { x: 288 + 552 * i, y: y(phY), w: 520, h: 390 }, { x: 32, y: ys(sp), w: 326, h: 245 });
    t(`mn_pn${i + 1}`, S, name, [[18, 28], [18, 28]], H, INK, [{ x: 288 + 552 * i, y: y(phY + 390 + 16), w: 520, h: 28 }, { x: 32, y: ys(sp + 245 + 16), w: 326, h: 28 }], { role: "subheading" });
    const left = `calc(${rem(M)} + (${w2} + 2.4rem) * ${i})`;
    tb(`mn_ph${i + 1}`, { left, width: `calc(${w2})`, top: rem(tPh), height: `calc(${w2} * .75)` });
    tb(`mn_pn${i + 1}`, { left, width: `calc(${w2})`, top: `calc(${rem(tPh + 12)} + ${w2} * .75)`, ...font(18, 28) });
  });
  tablet.secs[S] = `calc(${rem(tPh + 12 + 28 + TT)} + ${w2} * .75)`;
}

// ---- 6 ご案内（左に縦書きの見出し、中に表、右に地図）
{
  const S = "sec_info", y = (v) => PT + v, ys = (v) => ST + v, R = C.info.rows;
  const nl = (v) => (Array.isArray(v) ? v.length : 1);
  let py = 0, sy = 64, ty = TT + 44.8 + 32;
  const tTop = ty;
  gline("in_l0", S, { x: 328, y: y(0), w: 520 }, { x: 32, y: ys(sy), w: 326 });
  tT("in_l0", ty, { height: "1px" });
  R.forEach(([k, v], i) => {
    const n = nl(v), ph = 72 + 26 * (n - 1), sh = 64 + 26 * (n - 1), th = 68 + 26 * (n - 1);
    t(`in_k${i}`, S, k, [[14, 26], [14, 26]], B, AI, [{ x: 328, y: y(py + 23), w: 112, h: 26 }, { x: 32, y: ys(sy + 19), w: 88, h: 26 }], { weight: 700, noWrap: true });
    t(`in_v${i}`, S, val(v), [[15, 26], [15, 26]], B, INK, [{ x: 440, y: y(py + 23), w: 408, h: 26 * n }, { x: 120, y: ys(sy + 19), w: 238, h: 26 * n }], v === "$phone" ? { link: TEL } : {});
    gline(`in_l${i + 1}`, S, { x: 328, y: y(py + ph - 1), w: 520 }, { x: 32, y: ys(sy + sh - 1), w: 326 });
    tb(`in_k${i}`, { left: rem(M), width: rem(120), top: rem(ty + 21), ...font(14, 26) });
    tb(`in_v${i}`, { left: rem(M + 120), width: `calc(${W} - 12rem)`, top: rem(ty + 21), ...font(16, 26) });
    tT(`in_l${i + 1}`, ty + th - 1, { height: "1px" });
    py += ph; sy += sh; ty += th;
  });
  t("in_h", S, C.info.heading, [[40, 56], [28, 39.2]], H, AI, [{ x: 200, y: y(0), w: 56, h: 160 }, { x: 32, y: ys(0), w: 326, h: 40 }], { vp: true, ls: 0.12, role: "heading" });
  tT("in_h", TT, TAB_H);
  const spMap = sy + 40;
  rect("in_map", S, PANEL, 2, { x: 900, y: y(0), w: 460, h: 400 }, { x: 32, y: ys(spMap), w: 326, h: 280 });
  tT("in_map", ty + 40, { height: rem(400) });
  sec(S, "ご案内", PT + Math.max(400, py) + PT, ST + spMap + 280 + ST, { anchor: "info", nav: NAV(C.labels.info, 4) });
  tablet.secs[S] = rem(ty + 40 + 400 + TT);
  void tTop;
}

// ---- 7 ご予約（藍の全幅）
{
  const S = "sec_reserve";
  sec(S, "ご予約", 320, 400, { anchor: "reserve", bg: AI });
  t("rs_h", S, C.reserve.heading, [[36, 52], [24, 34.7]], H, WH, [{ x: 200, y: 96, w: 760, h: 52 }, { x: 32, y: 88, w: 326, h: 70 }], { role: "heading" });
  t("rs_t", S, PHONE, [[32, 44], [28, 38.5]], B, WH, [{ x: 200, y: 168, w: 600, h: 44 }, { x: 32, y: 176, w: 326, h: 39 }], { weight: 700, link: TEL, noWrap: true });
  rect("rs_btn", S, KI, 2, { x: 1040, y: 128, w: 320, h: 64 }, { x: 32, y: 264, w: 326, h: 56 }, { link: TEL, radius: 2 });
  t("rs_btn_t", S, C.reserve.button, [[16, 24], [16, 24]], B, AI, [{ x: 1040, y: 148, w: 320, h: 24 }, { x: 32, y: 280, w: 326, h: 24 }], { weight: 700, ...CT, z: 3 });
  tT("rs_h", 64, font(32, 44));
  tT("rs_t", 124, font(30, 42));
  tT("rs_btn", 216, { height: rem(64) });
  tT("rs_btn_t", 236, font(16, 24));
  tablet.secs[S] = rem(216 + 64 + 64);
}

// ---- 8 フッター（白木＋右半分に濃い白木の面、縦書きの店名）
{
  const S = "sec_footer";
  sec(S, "フッター", 420, 540);
  rect("ft_bg", S, DEEP, 1, { x: 720, y: 0, w: 720, h: 420 }, { x: 0, y: 0, w: 390, h: 240 });
  t("ft_v", S, C.shortName, [[56, 64], [48, 54.9]], H, AI, [{ x: 1040, y: 96, w: 80, h: 160 }, { x: 159, y: 32, w: 72, h: 136 }], { vp: true, vs: true, ls: 0.2, ...CT });
  t("ft_ven", S, C.nameEn, [[13, 16], [13, 16]], E, MUTE_D, [{ x: 880, y: 280, w: 400, h: 16 }, { x: 0, y: 184, w: 390, h: 16 }], CT);
  t("ft_n", S, C.name, [[32, 44], [26, 35.8]], H, INK, [{ x: 80, y: 80, w: 560, h: 44 }, { x: 32, y: 280, w: 326, h: 36 }], { role: "heading", noWrap: true });
  const F14 = [[14, 28], [14, 28]];
  t("ft_a", S, ADDR, F14, B, INK, [{ x: 80, y: 148, w: 560, h: 28 }, { x: 32, y: 336, w: 326, h: 28 }]);
  t("ft_t", S, PHONE, F14, B, INK, [{ x: 80, y: 176, w: 560, h: 28 }, { x: 32, y: 364, w: 326, h: 28 }], { link: TEL, noWrap: true });
  t("ft_hr", S, { lines: C.footerHours }, F14, B, INK, [{ x: 80, y: 204, w: 560, h: 56 }, { x: 32, y: 392, w: 326, h: 56 }]);
  t("ft_c", S, `© ${C.name}`, [[12, 18], [12, 18]], B, MUTE, [{ x: 80, y: 340, w: 560, h: 18 }, { x: 32, y: 484, w: 326, h: 18 }]);
  tb("ft_bg", { left: "0", width: "100%", top: "0", height: rem(240) });
  tb("ft_v", { left: "calc(50% - 3.6rem)", width: rem(72), top: rem(32), height: rem(136), ...font(48, 54.9) });
  tb("ft_ven", { left: "0", width: "100%", top: rem(184) });
  tT("ft_n", 280, font(28, 40));
  tb("ft_a", { left: rem(M), width: `calc(50% - ${rem(M + 24)})`, top: rem(344) });
  tb("ft_t", { left: rem(M), width: `calc(50% - ${rem(M + 24)})`, top: rem(372) });
  tb("ft_hr", { left: `calc(50% + ${rem(24)})`, width: `calc(50% - ${rem(M + 24)})`, top: rem(344) });
  tT("ft_c", 440, font(12, 18));
  tablet.secs[S] = rem(500);
}

// ---- 書き出し
const order = ["sec_firstv", "sec_flow", "sec_about", "sec_counter", "sec_menu", "sec_info", "sec_reserve"].filter((s) => secs[s]);
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_15", canvas: { pcContentWidth: Pw, spDesignWidth: Sw },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: order },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
fs.writeFileSync(`${DIR}/wa15-tablet.json`, JSON.stringify(tablet, null, 1) + "\n");
console.log(`wa15-gen: ${ID}：要素 ${Object.keys(els).length}／写真 ${rows.length} 枠／流れ ${F.length} 行`);
