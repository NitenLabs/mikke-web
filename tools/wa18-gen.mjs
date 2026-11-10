#!/usr/bin/env node
// wa-18：templates/wa-18/SPEC.md の値から samples/<店> の assets.json・site.json を作る。店ごとの文言は samples/<店>/wa18.json。
// 写真は templates/wa-18/photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 使い方：node tools/wa18-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa18-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "tento";
const DIR = `samples/${ID}`, LIST = `templates/wa-18/photos-${ID}.txt`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa18.json`, "utf8"));
const NOW = "2026-11-10T09:00:00+09:00";

function webpSize(b) {
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") throw new Error("WebP ではありません");
  const kind = b.toString("latin1", 12, 16);
  if (kind === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
  throw new Error("WebP の大きさが読めません");
}
const urls = Object.fromEntries(fs.readFileSync(LIST, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/)));
fs.mkdirSync(`${DIR}/media`, { recursive: true });
const assets = {};
for (const [k, p] of Object.entries(C.photos)) {
  const id = `ast_${k}01`, key = `${id}.webp`, f = `${DIR}/media/${key}`, url = urls[k];
  if (url && !fs.existsSync(f)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`写真 ${k}: HTTP ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.existsSync(f) ? fs.readFileSync(f) : null;
  const size = buf ? webpSize(buf) : { width: 1200, height: 1200 };
  assets[id] = { kind: "photo", file: { key, mime: "image/webp", ...size, bytes: buf ? buf.length : 1, exifStripped: true }, uploadedAt: NOW, uploadedBy: "producer",
    origin: { kind: "stock", provider: "unsplash", pageUrl: p.page }, rights: { basis: "licensed", confirmedAt: NOW, confirmedBy: "producer", note: "Unsplash License（架空のお店のデザイン見本）" }, slot: p.slot, alt: p.alt };
}
fs.writeFileSync(`${DIR}/assets.json`, JSON.stringify({ schemaVersion: 1, assets }, null, 2) + "\n");

const P = 1440, S = 390, r = (n) => Math.round(n * 10000) / 10000;
const box = (b, W) => ({ ...b, x: r((b.x / W) * 100), w: r((b.w / W) * 100) });
const lay = (pc, sp) => ({ pc: box(pc, P), sp: box(sp, S) });
const els = {}, secs = {};
const add = (id, e) => { els[id] = e; };
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (c) => (c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : [{ runs: [run(c)] }]);
const L = (lines) => ({ lines });
// t(id, 段, 中身, [[PC 大きさ, 行の高さ, 字間px], [SP …]], 書体, 色, [PC 枠, SP 枠], 追加)
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  add(id, { type: "text", z: x.z ?? 3, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r((ps[2] ?? 0) / ps[0]), ...(x.align ? { align: x.align } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: lay({ ...l[0], size: ps[0] }, { ...l[1], size: ss[0] }) });
}
const sec = (id, name, color, pc, sp, more = {}) => { secs[id] = { name, background: { color }, minHeight: { pc, sp }, ...more }; };
const photo = (id, section, asset, z, pc, sp) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1 } });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });

const H = "font:heading", B = "font:body", A = "font:accent";
// 色（SPEC 3章）。朱は生成りの上で 4.56。文字には使わず、小さな印と線だけに使う
const BG = "#F2EBDD", PALE = "#E8DFCC", INK = "#1F1D1B", JADE = "#2F5D50", SHU = "#B8432F", MU = "#5C564C", JMU = "#D5DED3", FMU = "#B9B2A5", JLINE = "#4F7A6C";
const TEL = { kind: "shopPhone" }, ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
const X0 = 120, XS = 28, WS = 334;
const EN = [[16, 24, 4.8], [14, 22, 4.2]]; // 英字の小見出し（Marcellus・字間 0.3em）
const nav = (i) => ({ anchor: C.nav[i][1], nav: { label: C.nav[i][0], order: i + 1 } });
const pctP = (px, w) => r((px / w) * 100);

// ---- 品のカードの部品（カードの中の x・w はカードの幅に対する％、y は px）
const cell = (path, fmt, pc, sp, o) => ({ type: "text", z: o.z ?? 3, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: fmt } }] }], style: { font: o.font || B, weight: o.weight || 400, color: o.color, lineHeight: r(o.lh[0] / o.sz[0]), letterSpacing: r((o.ls || 0) / o.sz[0]), ...(o.align ? { align: o.align } : {}) }, layout: { pc: { ...pc, size: o.sz[0] }, sp: { ...sp, size: o.sz[1] } } });
const shape = (fill, z, pc, sp) => ({ type: "shape", z, kind: "rect", fill, layout: { pc, sp } });
const cphoto = (pc, sp) => ({ type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: pc, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: sp, ratio: "custom" } } });
const rep = (id, sect, item, els_, cardH, pc, sp) => add(id, { type: "repeater", z: 3, section: sect, source: { kind: "catalog", menuId: menuOf(item), pick: [item] }, display: { mode: "grid", columns: { pc: 1, sp: 1 }, gap: { pc: 0, sp: 0 }, photoless: "sameCard" }, card: { height: cardH, elements: els_ }, layout: lay(pc, sp) });
const menuOf = (item) => Object.values(shop.catalog.placements).find((p) => p.itemId === item).menuId;

// ---- ヘッダー（生成りの帯）
sec("sec_header", "ヘッダー", "theme:background", 88, 64);
t("hd_name", "sec_header", C.name, [[22, 40, 2.2], [18, 32, 1.4]], H, INK, [{ x: X0, y: 24, w: 320, h: 40 }, { x: XS, y: 16, w: 240, h: 32 }], { link: { kind: "page", value: "pg_home" }, weight: 500 });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: INK, font: B, spMenuBackground: BG }, layout: lay({ x: 760, y: 24, w: 560, h: 40, size: 14 }, { x: 318, y: 10, w: 44, h: 44 }) });

// ---- 1 最初の画面（生成り。左に店名と営業、中央に湯気の写真、右に縦書きのコピー）
sec("sec_firstv", "最初の画面", "theme:background", 780, 830);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 520, y: 40, w: 640, h: 680 }, { x: XS, y: 16, w: WS, h: 356 });
t("fv_kick", "sec_firstv", C.kicker, [[14, 24, 2.8], [13, 22, 2]], B, JADE, [{ x: X0, y: 108, w: 380, h: 24 }, { x: XS, y: 396, w: WS, h: 22 }], { weight: 500 });
t("fv_name", "sec_firstv", C.nameShort, [[132, 192, 8], [84, 122, 4]], H, INK, [{ x: X0 - 6, y: 136, w: 360, h: 192 }, { x: XS - 4, y: 420, w: WS, h: 122 }], { role: "heading", weight: 500 });
t("fv_en", "sec_firstv", C.nameEn, [[24, 34, 9.6], [18, 28, 7.2]], A, JADE, [{ x: X0, y: 340, w: 300, h: 34 }, { x: XS, y: 548, w: WS, h: 28 }]);
rect("fv_seal", "sec_firstv", SHU, 2, { x: X0, y: 398, w: 48, h: 3 }, { x: XS, y: 642, w: 40, h: 3 });
add("fv_copy", { type: "text", z: 3, role: "pageTitle", section: "sec_firstv", paragraphs: paras(C.fvCopy),
  style: { font: H, weight: 500, color: INK, lineHeight: r(64 / 40), letterSpacing: r(6 / 40) },
  layout: { pc: { ...box({ x: 1218, y: 64, w: 64, h: 480 }, P), size: 40, writingMode: "vertical" }, sp: { ...box({ x: XS, y: 590, w: WS, h: 40 }, S), size: 26 } } });
C.facts.forEach(([k, v], i) => {
  t(`fv_k${i}`, "sec_firstv", k, [[13, 30, 1.3], [12, 28, 1]], B, MU, [{ x: X0, y: 520 + i * 42, w: 64, h: 30 }, { x: XS, y: 662 + i * 36, w: 60, h: 28 }], { weight: 500 });
  t(`fv_v${i}`, "sec_firstv", v, [[16, 30, 0.6], [14, 28, 0.3]], B, INK, [{ x: 196, y: 520 + i * 42, w: 300, h: 30 }, { x: 96, y: 662 + i * 36, w: 266, h: 28 }]);
});

// ---- 2 点心の品書き（この店の見せ場。翡翠の面に、蒸籠を上から撮った写真を三つ。品名は縦書きの札、値段は写真の左下の札に重ねる）
sec("sec_dimsum", "点心の品書き", JADE, 860, 1640, nav(0));
t("ds_en", "sec_dimsum", C.dimEn, EN, A, JMU, [{ x: X0, y: 104, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("ds_h", "sec_dimsum", C.dimHead, [[44, 64, 4.4], [32, 48, 3.2]], H, BG, [{ x: X0, y: 134, w: 560, h: 64 }, { x: XS, y: 84, w: WS, h: 48 }], { role: "heading", weight: 500 });
t("ds_p", "sec_dimsum", C.dimLead, [[16, 30, 0.8], [15, 30, 0.5]], B, BG, [{ x: 720, y: 160, w: 600, h: 30 }, { x: XS, y: 148, w: WS, h: 60 }]);
const DW = 384, DSW = WS, DPH = 384, DSPH = 334;
const dimEls = (p) => ({
  [`${p}_ph`]: cphoto(DPH, DSPH),
  [`${p}_tg`]: shape(BG, 2, { x: pctP(DW - 84, DW), y: 0, w: pctP(64, DW), h: 210 }, { x: pctP(DSW - 72, DSW), y: 0, w: pctP(56, DSW), h: 180 }),
  [`${p}_nm`]: { ...cell("/name", "plain", { x: pctP(DW - 84, DW), y: 18, w: pctP(64, DW), h: 170, writingMode: "vertical" }, { x: pctP(DSW - 72, DSW), y: 14, w: pctP(56, DSW), h: 144, writingMode: "vertical" }, { color: INK, lh: [64, 56], font: H, sz: [26, 22], ls: 4, weight: 500 }) },
  [`${p}_sl`]: shape(SHU, 3, { x: pctP(DW - 57, DW), y: 190, w: pctP(10, DW), h: 10 }, { x: pctP(DSW - 49, DSW), y: 162, w: pctP(10, DSW), h: 10 }),
  [`${p}_pp`]: shape(BG, 2, { x: 0, y: DPH - 52, w: pctP(168, DW), h: 52 }, { x: 0, y: DSPH - 48, w: pctP(156, DSW), h: 48 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: pctP(16, DW), y: DPH - 40, w: pctP(144, DW), h: 28 }, { x: pctP(14, DSW), y: DSPH - 37, w: pctP(134, DSW), h: 26 }, { color: INK, lh: [28, 26], sz: [17, 16], weight: 700, ls: 0.5 }),
  [`${p}_ds`]: cell("/description", "plain", { x: 0, y: DPH + 20, w: 100, h: 52 }, { x: 0, y: DSPH + 16, w: 100, h: 52 }, { color: BG, lh: [26, 26], sz: [14, 14], ls: 0.4 }) });
C.dimPick.forEach((id, i) => rep(`ds_c${i}`, "sec_dimsum", id, dimEls(`d${i}`), { pc: 476, sp: 420 }, { x: X0 + i * (DW + 24), y: 262, w: DW, h: 476 }, { x: XS, y: 250 + i * 450, w: WS, h: 420 }));

// ---- 3 一品料理と麺（生成り。写真の大きなカード二枚に、翡翠の札で品名と値段を重ねる。下に写真の無い品を三つ）
sec("sec_plates", "一品料理と麺", "theme:background", 1010, 1240, nav(1));
t("pl_en", "sec_plates", C.plateEn, EN, A, JADE, [{ x: X0, y: 104, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("pl_h", "sec_plates", C.plateHead, [[40, 60, 4], [30, 46, 3]], H, INK, [{ x: X0, y: 134, w: 600, h: 60 }, { x: XS, y: 84, w: WS, h: 46 }], { role: "heading", weight: 500 });
const PW = 588, PPH = 440, PSPH = 250;
const plateEls = (p) => ({
  [`${p}_ph`]: cphoto(PPH, PSPH),
  [`${p}_pp`]: shape(JADE, 2, { x: 0, y: PPH - 64, w: pctP(320, PW), h: 64 }, { x: 0, y: PSPH - 56, w: pctP(250, WS), h: 56 }),
  [`${p}_nm`]: cell("/name", "plain", { x: pctP(24, PW), y: PPH - 48, w: pctP(170, PW), h: 34 }, { x: pctP(16, WS), y: PSPH - 42, w: pctP(130, WS), h: 30 }, { color: BG, lh: [34, 30], font: H, sz: [22, 19], ls: 1.5, weight: 500 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: pctP(196, PW), y: PPH - 45, w: pctP(104, PW), h: 28 }, { x: pctP(148, WS), y: PSPH - 40, w: pctP(88, WS), h: 26 }, { color: BG, lh: [28, 26], sz: [17, 15], weight: 700, ls: 0.5, align: "right" }),
  [`${p}_ds`]: cell("/description", "plain", { x: 0, y: PPH + 18, w: 100, h: 26 }, { x: 0, y: PSPH + 14, w: 100, h: 52 }, { color: MU, lh: [26, 26], sz: [15, 14], ls: 0.4 }) });
C.platePick.forEach((id, i) => rep(`pl_c${i}`, "sec_plates", id, plateEls(`p${i}`), { pc: 490, sp: 330 }, { x: X0 + i * (PW + 24), y: 250, w: PW, h: 490 }, { x: XS, y: 170 + i * 360, w: WS, h: 330 }));
const rowEls = (p) => ({
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 16, w: 50, h: 32 }, { x: 0, y: 16, w: 50, h: 32 }, { color: INK, lh: [32, 32], font: H, sz: [20, 19], ls: 1, weight: 500 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: 50, y: 18, w: 50, h: 28 }, { x: 50, y: 18, w: 50, h: 28 }, { color: JADE, lh: [28, 28], sz: [16, 16], align: "right", weight: 700, ls: 0.5 }) });
C.rowPick.forEach((id, i) => rep(`pl_r${i}`, "sec_plates", id, rowEls(`r${i}`), { pc: 64, sp: 64 }, { x: X0 + i * (DW + 24), y: 800, w: DW, h: 64 }, { x: XS, y: 920 + i * 72, w: WS, h: 64 }));
t("pl_note", "sec_plates", C.note, [[13, 22, 0.6], [12, 20, 0.4]], B, MU, [{ x: X0, y: 900, w: 600, h: 22 }, { x: XS, y: 1146, w: WS, h: 20 }]);

// ---- 4 天燈のこと（淡い生成り。茶器の写真と紹介、円卓の個室の写真と季節のコース）
sec("sec_about", "天燈のこと", PALE, 1200, 1420, nav(2));
photo("ab_ph", "sec_about", "ast_ab01", 1, { x: X0, y: 110, w: 560, h: 400 }, { x: XS, y: 48, w: WS, h: 238 });
t("ab_en", "sec_about", C.aboutEn, EN, A, JADE, [{ x: 760, y: 130, w: 400, h: 24 }, { x: XS, y: 316, w: WS, h: 22 }]);
t("ab_h", "sec_about", L(C.aboutHead), [[36, 56, 3.6], [26, 42, 2.4]], H, INK, [{ x: 760, y: 164, w: 560, h: 112 }, { x: XS, y: 346, w: WS, h: 84 }], { role: "heading", weight: 500 });
t("ab_p", "sec_about", C.aboutBody, [[16, 32, 0.8], [15, 30, 0.5]], B, INK, [{ x: 760, y: 304, w: 520, h: 128 }, { x: XS, y: 450, w: WS, h: 150 }]);
photo("rm_ph", "sec_about", "ast_rm01", 1, { x: 640, y: 600, w: 680, h: 484 }, { x: XS, y: 640, w: WS, h: 238 });
t("cs_en", "sec_about", C.courseEn, EN, A, JADE, [{ x: X0, y: 640, w: 400, h: 24 }, { x: XS, y: 910, w: WS, h: 22 }]);
const courseEls = {
  cs_nm: cell("/name", "plain", { x: 0, y: 0, w: 100, h: 44 }, { x: 0, y: 0, w: 100, h: 40 }, { color: INK, lh: [44, 40], font: H, sz: [30, 26], ls: 2, weight: 500 }),
  cs_pr: cell("/prices", "priceAll", { x: 0, y: 56, w: 100, h: 32 }, { x: 0, y: 50, w: 100, h: 30 }, { color: JADE, lh: [32, 30], sz: [22, 20], weight: 700, ls: 0.5 }),
  cs_ds: cell("/description", "plain", { x: 0, y: 104, w: 100, h: 60 }, { x: 0, y: 94, w: 100, h: 56 }, { color: INK, lh: [30, 28], sz: [15, 14], ls: 0.4 }) };
rep("cs_c", "sec_about", C.coursePick, courseEls, { pc: 170, sp: 160 }, { x: X0, y: 676, w: 460, h: 170 }, { x: XS, y: 940, w: WS, h: 160 });
rect("cs_line", "sec_about", JADE, 2, { x: X0, y: 868, w: 460, h: 1 }, { x: XS, y: 1116, w: WS, h: 1 });
t("rm_p", "sec_about", C.roomBody, [[15, 30, 0.4], [14, 28, 0.3]], B, INK, [{ x: X0, y: 890, w: 460, h: 90 }, { x: XS, y: 1136, w: WS, h: 112 }]);
const btn = (id, sect, label, link, pc, sp, fill, color, z = 2) => {
  rect(`${id}_b`, sect, fill, z, pc, sp, { link });
  t(`${id}_t`, sect, label, [[15, 24, 1.5], [14, 24, 1]], B, color, [{ ...pc, y: pc.y + 16, h: 24 }, { ...sp, y: sp.y + 14, h: 24 }], { align: "center", link, z: z + 2, weight: 700 });
};
btn("rm_tel", "sec_about", C.roomTel, TEL, { x: X0, y: 1010, w: 260, h: 56 }, { x: XS, y: 1272, w: WS, h: 52 }, JADE, BG);

// ---- 5 ご案内と地図（翡翠）
sec("sec_info", "ご案内", JADE, 780, 1100, nav(3));
t("in_en", "sec_info", C.infoEn, EN, A, JMU, [{ x: X0, y: 100, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("in_h", "sec_info", C.infoHead, [[40, 60, 4], [30, 46, 3]], H, BG, [{ x: X0, y: 130, w: 400, h: 60 }, { x: XS, y: 84, w: WS, h: 46 }], { role: "heading", weight: 500 });
let yP = 220, yS = 154;
C.infoRows.forEach(([k, v], i) => {
  const two = Array.isArray(v) && typeof v[0] === "string" && v[0].includes(" "), hP = two ? 92 : 64, hS = two ? 108 : 76;
  rect(`in_l${i}`, "sec_info", JLINE, 2, { x: X0, y: yP, w: 560, h: 1 }, { x: XS, y: yS, w: WS, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[13, 26, 1.3], [12, 22, 1]], B, JMU, [{ x: X0, y: yP + 19, w: 110, h: 26 }, { x: XS, y: yS + 12, w: WS, h: 22 }], { weight: 500 });
  t(`in_v${i}`, "sec_info", two ? L(v) : v, [[16, 28, 0.5], [14, 26, 0.2]], B, BG, [{ x: X0 + 120, y: yP + 18, w: 440, h: two ? 56 : 28 }, { x: XS, y: yS + 38, w: WS, h: two ? 52 : 26 }], k === "お電話" ? { link: TEL } : {});
  yP += hP; yS += hS;
});
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDR} ${shop.basic.name}`)}`, newTab: true };
btn("in_tel", "sec_info", C.telLabel, TEL, { x: X0, y: yP + 40, w: 260, h: 56 }, { x: XS, y: yS + 32, w: 161, h: 52 }, BG, INK);
btn("in_map", "sec_info", C.mapLabel, LINKM, { x: X0 + 284, y: yP + 40, w: 260, h: 56 }, { x: 201, y: yS + 32, w: 161, h: 52 }, JADE, BG);
add("in_mapbox", { type: "shape", z: 2, kind: "rect", fill: JLINE, section: "sec_info", layout: lay({ x: 740, y: 100, w: 580, h: 580 }, { x: XS, y: yS + 120, w: WS, h: 360 }) });

// ---- フッター（墨）
sec("sec_footer", "フッター", INK, 340, 600);
t("ft_name", "sec_footer", C.name, [[22, 40, 2.2], [20, 40, 1.6]], H, BG, [{ x: X0, y: 60, w: 440, h: 40 }, { x: XS, y: 40, w: WS, h: 40 }], { weight: 500 });
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 26, 0.5], [14, 26, 0.5]], B, BG, [{ x: X0, y: 110, w: 420, h: 26 }, { x: XS, y: 92, w: WS, h: 26 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[14, 30, 0.6], [15, 30, 0.5]], B, BG, [{ x: 620, y: 60 + 32 * i, w: 220, h: 30 }, { x: XS, y: 136 + 32 * i, w: WS, h: 30 }], { link: go(a) }));
t("ft_hk", "sec_footer", "営業時間", [[13, 22, 1.3], [12, 20, 1]], B, FMU, [{ x: 900, y: 64, w: 420, h: 22 }, { x: XS, y: 284, w: WS, h: 20 }]);
t("ft_hv", "sec_footer", L(C.footHours), [[14, 26, 0.5], [14, 26, 0.5]], B, BG, [{ x: 900, y: 90, w: 420, h: 78 }, { x: XS, y: 308, w: WS, h: 78 }]);
t("ft_tk", "sec_footer", "お電話", [[13, 22, 1.3], [12, 20, 1]], B, FMU, [{ x: 900, y: 186, w: 200, h: 22 }, { x: XS, y: 402, w: WS, h: 20 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[22, 32, 1.6], [22, 32, 1.6]], A, BG, [{ x: 900, y: 212, w: 260, h: 32 }, { x: XS, y: 426, w: WS, h: 32 }], { link: TEL });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], B, FMU, [{ x: X0, y: 282, w: 500, h: 20 }, { x: XS, y: 530, w: WS, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_18", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_dimsum", "sec_plates", "sec_about", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚／品 ${Object.keys(shop.catalog.items).length}`);
