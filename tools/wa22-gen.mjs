#!/usr/bin/env node
// wa-22：templates/wa-22/SPEC.md の値から samples/<店> の assets.json・site.json を作る（wa20-gen を元にした）。店ごとの文言は samples/<店>/wa22.json。
// 写真は templates/wa-22/photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 使い方：node tools/wa22-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa22-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "sunao";
const DIR = `samples/${ID}`, LIST = `templates/wa-22/photos-${ID}.txt`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa22.json`, "utf8"));
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
const shp = (id, section, kind, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind, fill, section, layout: lay(pc, sp), ...x });

const H = "font:heading", B = "font:body", A = "font:accent";
// 色（SPEC 3章）
const MILK = "#FFF8EE", CHOCO = "#4A2E25", PIST = "#A9C48A", STRAW = "#F1A7A0", CITRUS = "#F2C14E", MU = "#6B4A3E", RED = "#A13D35", SOFT = "#E9DCCB", FMU = "#E9DCCB";
const TEL = { kind: "shopPhone" };
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
const X0 = 120, XS = 20, WS = 350;
const EN = [[13, 20, 1.6], [12, 18, 1.4]]; // 英字の小見出し（Young Serif・字間 0.12em）
const HD = [[44, 60, 1.3], [32, 46, 1]]; // 段の見出し（Kiwi Maru）
const LD = [[16, 30, 0.6], [15, 28, 0.4]]; // 一言
const nav = (i) => ({ anchor: C.nav[i][1], nav: { label: C.nav[i][0], order: i + 1 } });
const pct = (px, w) => r((px / w) * 100);
const fl = (id) => C.flavors[id] || { color: SOFT, en: "" };

// ---- 品のカードの部品（カードの中の x・w はカードの幅に対する％、y は px）
const cell = (path, fmt, pc, sp, o) => ({ type: "text", z: o.z ?? 3, role: "body", paragraphs: [{ runs: [path.startsWith("/") ? { bind: { scope: "item", path, format: fmt } } : { text: path }] }], style: { font: o.font || B, weight: o.weight || 400, color: o.color, lineHeight: r(o.lh[0] / o.sz[0]), letterSpacing: r((o.ls || 0) / o.sz[0]), ...(o.align ? { align: o.align } : {}) }, layout: { pc: { ...pc, size: o.sz[0] }, sp: { ...sp, size: o.sz[1] } } });
const cshape = (kind, fill, z, pc, sp) => ({ type: "shape", z, kind, fill, layout: { pc, sp } });
const cphoto = (pc, sp) => ({ type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { ...pc, ratio: "custom" }, sp: { ...sp, ratio: "custom" } } });
const menuOf = (item) => Object.values(shop.catalog.placements).find((p) => p.itemId === item).menuId;
const rep = (id, sect, item, els_, cardH, pc, sp) => add(id, { type: "repeater", z: 3, section: sect, source: { kind: "catalog", menuId: menuOf(item), pick: [item] }, display: { mode: "grid", columns: { pc: 1, sp: 1 }, gap: { pc: 0, sp: 0 }, photoless: "sameCard" }, card: { height: cardH, elements: els_ }, layout: lay(pc, sp) });
const btn = (id, sect, label, link, pc, sp, fill, color, stroke) => {
  shp(`${id}_b`, sect, "rect", fill, 2, pc, sp, { link, radius: 100, ...(stroke ? { stroke: { color: CHOCO, width: 2 } } : {}) });
  const ty = (b, fs) => Math.round((b.h - fs * 1.6) / 2);
  t(`${id}_t`, sect, label, [[15, 24, 1], [14, 22, 0.6]], B, color, [{ ...pc, y: pc.y + ty(pc, 15), h: 24 }, { ...sp, y: sp.y + ty(sp, 14), h: 22 }], { align: "center", link, z: 4, weight: 700 });
};

// ---- ヘッダー（ミルクの帯。左に店名、右にナビと「電話する」のピル）
sec("sec_header", "ヘッダー", "theme:background", 80, 60);
t("hd_name", "sec_header", C.name, [[26, 40, 1], [20, 32, 0.6]], A, CHOCO, [{ x: X0, y: 20, w: 320, h: 40 }, { x: XS, y: 14, w: 190, h: 32 }], { link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: CHOCO, font: B, spMenuBackground: MILK }, layout: lay({ x: 560, y: 20, w: 580, h: 40, size: 14 }, { x: 326, y: 8, w: 44, h: 44 }) });
btn("hd_tel", "sec_header", C.telLabel, TEL, { x: 1172, y: 18, w: 148, h: 44 }, { x: 214, y: 12, w: 100, h: 36 }, CHOCO, MILK);

// ---- 0 上の帯（チョコ。営業の 1 行）
sec("sec_topbar", "営業のお知らせ", CHOCO, 44, 60);
t("tp_a", "sec_topbar", C.topbar[0], [[13, 20, 0.6], [12, 18, 0.4]], B, MILK, [{ x: X0, y: 12, w: 588, h: 20 }, { x: XS, y: 12, w: WS, h: 18 }], { align: "right", weight: 500 });
t("tp_b", "sec_topbar", C.topbar[1], [[13, 20, 0.6], [12, 18, 0.4]], B, MILK, [{ x: 732, y: 12, w: 588, h: 20 }, { x: XS, y: 30, w: WS, h: 18 }], { weight: 500 });

// ---- 1 最初の画面（ミルク。左に巨大な欧文・コピー・味の丸の列、右に縦長の写真とピスタチオの円）
sec("sec_firstv", "最初の画面", "theme:background", 800, 990);
t("fv_kick", "sec_firstv", C.kicker, [[15, 24, 1.2], [13, 22, 1]], B, RED, [{ x: X0, y: 84, w: 560, h: 24 }, { x: XS, y: 24, w: WS, h: 22 }], { weight: 700 });
const [E1, E2, E3, E4] = C.fvEn;
// 巨大な欧文の 2 行。つなぎの語（of・the）は小さく赤で（marks.sizeRatio）
const SM = { sizeRatio: 0.5, color: RED }, run2 = (a, b, small) => ({ runs: small === 0 ? [{ text: a, marks: SM }, { text: b }] : [{ text: a }, { text: b, marks: SM }] });
add("fv_en", { type: "text", z: 3, role: "heading", section: "sec_firstv", paragraphs: [run2(`${E1} `, E2, 1), run2(`${E3} `, E4, 0)],
  style: { font: A, weight: 400, color: CHOCO, lineHeight: 1.32, letterSpacing: -0.01 },
  layout: lay({ x: X0 - 6, y: 128, w: 600, h: 316, size: 120 }, { x: XS - 3, y: 56, w: WS, h: 160, size: 60 }) });
add("fv_copy", { type: "text", z: 3, role: "pageTitle", section: "sec_firstv", paragraphs: paras(L(C.fvCopy)),
  style: { font: H, weight: 500, color: CHOCO, lineHeight: r(58 / 38), letterSpacing: r(1 / 38) },
  layout: lay({ x: X0, y: 466, w: 600, h: 116, size: 38 }, { x: XS, y: 226, w: WS, h: 80, size: 26 }) });
t("fv_p", "sec_firstv", C.fvLead, LD, B, CHOCO, [{ x: X0, y: 598, w: 580, h: 30 }, { x: XS, y: 316, w: WS, h: 56 }]);
const DOTS = [...C.classicPick, ...C.seasonPick];
DOTS.forEach((id, i) => { const f = fl(id); shp(`fv_d${i}`, "sec_firstv", "circle", f.color, 2, { x: X0 + i * 58, y: 652, w: 44, h: 44 }, { x: XS + i * 35, y: 872, w: 28, h: 28 }, f.ring ? { stroke: { color: CHOCO, width: 2 } } : {}); });
t("fv_note", "sec_firstv", C.fvNote, [[13, 22, 0.4], [13, 22, 0.3]], B, MU, [{ x: X0, y: 712, w: 580, h: 22 }, { x: XS, y: 914, w: WS, h: 44 }]);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 800, y: 64, w: 520, h: 650 }, { x: XS, y: 384, w: WS, h: 438 });
shp("fv_badge", "sec_firstv", "circle", PIST, 3, { x: 716, y: 588, w: 168, h: 168 }, { x: 258, y: 752, w: 104, h: 104 });
const [B1, B2, B3] = C.fvBadge;
t("fv_b1", "sec_firstv", B1, [[12, 16, 1.4], [10, 12, 1]], A, CHOCO, [{ x: 716, y: 622, w: 168, h: 16 }, { x: 258, y: 768, w: 104, h: 12 }], { align: "center", z: 4 });
t("fv_b2", "sec_firstv", B2, [[48, 68, 0], [30, 42, 0]], A, CHOCO, [{ x: 716, y: 642, w: 168, h: 68 }, { x: 258, y: 782, w: 104, h: 42 }], { align: "center", z: 4 });
t("fv_b3", "sec_firstv", B3, [[12, 16, 1.4], [10, 12, 1]], A, CHOCO, [{ x: 716, y: 712, w: 168, h: 16 }, { x: 258, y: 826, w: 104, h: 12 }], { align: "center", z: 4 });

// ---- 2 今日の味（見せ場。定番五つは色の丸 140 と名前を 5 列、季節五つはいちごの色の板に写真と行）
sec("sec_flavors", "今日の味", "theme:background", 1500, 2160, nav(0));
t("fl_giant", "sec_flavors", C.flGiant, [[120, 158, -1.2], [44, 58, -0.4]], A, CHOCO, [{ x: 1166, y: 96, w: 172, h: 1000, writingMode: "vertical" }, { x: XS - 2, y: 44, w: WS, h: 58 }], { z: 1 });
t("fl_en", "sec_flavors", C.flEn, EN, A, RED, [{ x: X0, y: 104, w: 400, h: 20 }, { x: XS, y: 118, w: WS, h: 18 }]);
t("fl_h", "sec_flavors", C.flHead, HD, H, CHOCO, [{ x: X0, y: 130, w: 600, h: 60 }, { x: XS, y: 142, w: WS, h: 46 }], { role: "heading", weight: 500 });
t("fl_p", "sec_flavors", C.flLead, LD, B, CHOCO, [{ x: X0, y: 206, w: 760, h: 30 }, { x: XS, y: 198, w: WS, h: 56 }]);
// 定番の小見出しの行
t("fl_ch", "sec_flavors", C.classic.name, [[22, 32, 1], [20, 30, 1]], H, CHOCO, [{ x: X0, y: 292, w: 60, h: 32 }, { x: XS, y: 286, w: 50, h: 30 }], { weight: 500 });
t("fl_ce", "sec_flavors", C.classic.en, [[13, 20, 1.6], [12, 18, 1.4]], A, MU, [{ x: X0 + 66, y: 300, w: 200, h: 20 }, { x: XS + 52, y: 292, w: 140, h: 18 }]);
t("fl_cs", "sec_flavors", C.classic.side, [[13, 20, 0.4], [12, 18, 0.3]], B, MU, [{ x: 960, y: 300, w: 200, h: 20 }, { x: 230, y: 292, w: 140, h: 18 }], { align: "right" });
shp("fl_cl", "sec_flavors", "rect", SOFT, 2, { x: X0, y: 336, w: 1040, h: 1 }, { x: XS, y: 326, w: WS, h: 1 });
const CW = 184, CG = 30;
const classicEls = (p, f) => ({
  [`${p}_dot`]: cshape("circle", f.color, 2, { x: pct(22, CW), y: 0, w: pct(140, CW), h: 140 }, { x: 0, y: 4, w: pct(64, WS), h: 64 }),
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 160, w: 100, h: 30 }, { x: pct(84, WS), y: 0, w: pct(266, WS), h: 28 }, { color: CHOCO, lh: [30, 28], font: H, sz: [20, 18], weight: 500, align: "center" }),
  [`${p}_en`]: cell(f.en, "plain", { x: 0, y: 192, w: 100, h: 18 }, { x: pct(84, WS), y: 28, w: pct(266, WS), h: 18 }, { color: MU, lh: [18, 18], font: A, sz: [12, 12], ls: 0.6, align: "center" }),
  [`${p}_ds`]: cell("/description", "plain", { x: 0, y: 220, w: 100, h: 76 }, { x: pct(84, WS), y: 50, w: pct(266, WS), h: 48 }, { color: CHOCO, lh: [25, 24], sz: [14, 14], ls: 0.2 }) });
C.classicPick.forEach((id, i) => rep(`fl_c${i}`, "sec_flavors", id, classicEls(`c${i}`, fl(id)), { pc: 300, sp: 100 }, { x: X0 + i * (CW + CG), y: 368, w: CW, h: 300 }, { x: XS, y: 346 + i * 112, w: WS, h: 100 }));
// 季節の板
shp("fl_board", "sec_flavors", "rect", STRAW, 1, { x: X0, y: 720, w: 1040, h: 700 }, { x: XS, y: 920, w: WS, h: 1170 }, { radius: 32 });
photo("fl_ph", "sec_flavors", "ast_k101", 2, { x: 176, y: 776, w: 400, h: 500 }, { x: 40, y: 944, w: 310, h: 388 });
t("fl_pick", "sec_flavors", C.season.pick, [[16, 26, 0.4], [15, 24, 0.3]], H, CHOCO, [{ x: 176, y: 1296, w: 400, h: 26 }, { x: 40, y: 1348, w: 310, h: 24 }], { weight: 500 });
t("fl_sh", "sec_flavors", C.season.name, [[22, 32, 1], [20, 30, 1]], H, CHOCO, [{ x: 640, y: 776, w: 60, h: 32 }, { x: 40, y: 1400, w: 50, h: 30 }], { weight: 500 });
t("fl_se", "sec_flavors", C.season.en, [[13, 20, 1.6], [12, 18, 1.4]], A, CHOCO, [{ x: 706, y: 784, w: 200, h: 20 }, { x: 92, y: 1406, w: 120, h: 18 }]);
t("fl_ss", "sec_flavors", C.season.side, [[13, 20, 0.4], [12, 18, 0.3]], B, CHOCO, [{ x: 920, y: 784, w: 184, h: 20 }, { x: 230, y: 1406, w: 120, h: 18 }], { align: "right" });
const KW = 464, KS = 310;
const seasonEls = (p, f) => ({
  [`${p}_ln`]: cshape("rect", "#C78981", 1, { x: 0, y: 0, w: 100, h: 1 }, { x: 0, y: 0, w: 100, h: 1 }),
  [`${p}_dot`]: cshape("circle", f.color, 2, { x: 0, y: 14, w: pct(64, KW), h: 64 }, { x: 0, y: 16, w: pct(52, KS), h: 52 }),
  [`${p}_nm`]: cell("/name", "plain", { x: pct(84, KW), y: 14, w: pct(200, KW), h: 30 }, { x: pct(68, KS), y: 12, w: pct(150, KS), h: 28 }, { color: CHOCO, lh: [30, 28], font: H, sz: [20, 18], weight: 500 }),
  [`${p}_en`]: cell(f.en, "plain", { x: pct(290, KW), y: 20, w: pct(100, KW), h: 18 }, { x: pct(68, KS), y: 40, w: pct(150, KS), h: 18 }, { color: CHOCO, lh: [18, 18], font: A, sz: [12, 12], ls: 0.6 }),
  [`${p}_tb`]: cshape("rect", MILK, 2, { x: pct(400, KW), y: 18, w: pct(64, KW), h: 24 }, { x: pct(246, KS), y: 14, w: pct(64, KS), h: 24 }),
  [`${p}_tg`]: cell(f.tag || "", "plain", { x: pct(400, KW), y: 21, w: pct(64, KW), h: 18 }, { x: pct(246, KS), y: 17, w: pct(64, KS), h: 18 }, { color: CHOCO, lh: [18, 18], sz: [12, 12], weight: 700, align: "center", z: 4 }),
  [`${p}_ds`]: cell("/description", "plain", { x: pct(84, KW), y: 50, w: pct(380, KW), h: 24 }, { x: pct(68, KS), y: 62, w: pct(242, KS), h: 48 }, { color: CHOCO, lh: [24, 24], sz: [14, 14], ls: 0.2 }) });
C.seasonPick.forEach((id, i) => rep(`fl_k${i}`, "sec_flavors", id, seasonEls(`k${i}`, fl(id)), { pc: 92, sp: 120 }, { x: 640, y: 830 + i * 96, w: KW, h: 92 }, { x: 40, y: 1442 + i * 124, w: KS, h: 120 }));

// ---- 3 サイズと値段（ピスタチオの面。千鳥のカード 3 枚と、持ち帰りの 1 行）
sec("sec_sizes", "サイズと値段", PIST, 1440, 1200, nav(1));
t("sz_en", "sec_sizes", C.szEn, EN, A, CHOCO, [{ x: X0, y: 104, w: 400, h: 20 }, { x: XS, y: 56, w: WS, h: 18 }]);
t("sz_h", "sec_sizes", C.szHead, HD, H, CHOCO, [{ x: X0, y: 130, w: 600, h: 60 }, { x: XS, y: 80, w: WS, h: 46 }], { role: "heading", weight: 500 });
t("sz_p", "sec_sizes", C.szLead, LD, B, CHOCO, [{ x: X0, y: 206, w: 600, h: 30 }, { x: XS, y: 136, w: WS, h: 56 }]);
const ZW = 368, ZPX = 140, ZTX = 156, ZTW = WS - ZTX;
const sizeEls = (p, s) => ({
  [`${p}_tl`]: cell(C.sizeTagLeft, "plain", { x: 0, y: 0, w: 60, h: 18 }, { x: pct(ZTX, WS), y: 0, w: pct(110, WS), h: 18 }, { color: CHOCO, lh: [18, 18], font: A, sz: [12, 11], ls: 1.4 }),
  [`${p}_tr`]: cell(s.tag, "plain", { x: 60, y: 0, w: 40, h: 18 }, { x: pct(ZTX + 110, WS), y: 0, w: pct(ZTW - 110, WS), h: 18 }, { color: CHOCO, lh: [18, 18], font: A, sz: [12, 11], ls: 1.4, align: "right" }),
  [`${p}_ph`]: cphoto({ x: 0, y: 28, w: 100, h: 552 }, { x: 0, y: 0, w: pct(ZPX, WS), h: 210 }),
  [`${p}_en`]: cell(s.en, "plain", { x: 0, y: 600, w: 100, h: 48 }, { x: pct(ZTX, WS), y: 26, w: pct(ZTW, WS), h: 36 }, { color: CHOCO, lh: [48, 36], font: A, sz: [40, 28], ls: -0.2 }),
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 652, w: 100, h: 28 }, { x: pct(ZTX, WS), y: 64, w: pct(ZTW, WS), h: 26 }, { color: CHOCO, lh: [28, 26], font: H, sz: [18, 17], weight: 500 }),
  [`${p}_ds`]: cell("/description", "plain", { x: 0, y: 686, w: 100, h: 28 }, { x: pct(ZTX, WS), y: 96, w: pct(ZTW, WS), h: 48 }, { color: CHOCO, lh: [28, 24], sz: [15, 14], ls: 0.3 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: 0, y: 726, w: 100, h: 36 }, { x: pct(ZTX, WS), y: 166, w: pct(ZTW, WS), h: 32 }, { color: CHOCO, lh: [36, 32], sz: [26, 22], weight: 700, align: "right", ls: 0.5 }) });
const ZH = 770, STAG = [0, 80, 160];
C.sizes.forEach((s, i) => rep(`sz_c${i}`, "sec_sizes", s.item, sizeEls(`z${i}`, s), { pc: ZH, sp: 210 }, { x: X0 + i * (ZW + 48), y: 290 + STAG[i], w: ZW, h: ZH }, { x: XS, y: 220 + i * 238, w: WS, h: 210 }));
const TOEls = {
  to_bx: cshape("rect", MILK, 1, { x: 0, y: 0, w: 100, h: 88 }, { x: 0, y: 0, w: 100, h: 160 }),
  to_nm: cell("/name", "plain", { x: pct(40, 1200), y: 28, w: pct(300, 1200), h: 32 }, { x: pct(24, WS), y: 22, w: pct(302, WS), h: 30 }, { color: CHOCO, lh: [32, 30], font: H, sz: [20, 18], weight: 500 }),
  to_ds: cell("/description", "plain", { x: pct(360, 1200), y: 32, w: pct(560, 1200), h: 24 }, { x: pct(24, WS), y: 56, w: pct(302, WS), h: 48 }, { color: CHOCO, lh: [24, 24], sz: [14, 14], ls: 0.3 }),
  to_pr: cell("/prices", "priceAll", { x: pct(940, 1200), y: 24, w: pct(220, 1200), h: 40 }, { x: pct(24, WS), y: 112, w: pct(302, WS), h: 32 }, { color: CHOCO, lh: [40, 32], sz: [26, 22], weight: 700, align: "right", ls: 0.5 }) };
rep("sz_to", "sec_sizes", C.takeout, TOEls, { pc: 88, sp: 160 }, { x: X0, y: 1240, w: 1200, h: 88 }, { x: XS, y: 950, w: WS, h: 160 });
t("sz_note", "sec_sizes", C.szNote, [[13, 22, 0.4], [12, 20, 0.3]], B, CHOCO, [{ x: X0, y: 1352, w: 600, h: 22 }, { x: XS, y: 1130, w: WS, h: 20 }]);

// ---- 4 毎朝のこと（ミルク。中央に縦書きの見出しと紹介文、左右に材料 4 つ）
sec("sec_craft", "毎朝のこと", "theme:background", 1300, 2580, nav(2));
t("cr_en", "sec_craft", C.crEn, EN, A, RED, [{ x: 540, y: 110, w: 360, h: 20 }, { x: XS, y: 56, w: WS, h: 18 }], { align: "center" });
t("cr_h", "sec_craft", L(C.crHead), [[36, 72, 2], [30, 60, 1.6]], H, CHOCO, [{ x: 648, y: 150, w: 144, h: 230, writingMode: "vertical" }, { x: 135, y: 86, w: 120, h: 200, writingMode: "vertical" }], { role: "heading", weight: 500 });
t("cr_p", "sec_craft", C.crBody, [[16, 30, 0.4], [15, 28, 0.3]], B, CHOCO, [{ x: 540, y: 410, w: 360, h: 150 }, { x: XS, y: 310, w: WS, h: 168 }]);
const CRP = [
  { pc: { x: X0, y: 120, w: 296, h: 296 }, sp: { y: 520, h: 350 } },
  { pc: { x: 1003, y: 300, w: 317, h: 212 }, sp: { y: 1074, h: 233 } },
  { pc: { x: X0, y: 680, w: 242, h: 330 }, sp: { y: 1511, h: 400 } },
  { pc: { x: 948, y: 820, w: 372, h: 249 }, sp: { y: 2115, h: 233 } }];
const NUMC = [PIST, STRAW, CITRUS, "#FFFFFF"];
C.craft.forEach((c, i) => {
  const p = CRP[i], left = i % 2 === 0, cx = left ? X0 : 940, py = p.pc.y + p.pc.h + 20, sy = p.sp.y + p.sp.h + 16;
  photo(`cr_ph${i}`, "sec_craft", `ast_${c.photo}01`, 1, p.pc, { x: XS, y: p.sp.y, w: WS, h: p.sp.h });
  shp(`cr_nb${i}`, "sec_craft", "circle", NUMC[i], 2, { x: cx, y: py, w: 44, h: 44 }, { x: XS, y: sy, w: 44, h: 44 }, NUMC[i] === "#FFFFFF" ? { stroke: { color: CHOCO, width: 2 } } : {});
  t(`cr_nt${i}`, "sec_craft", String(i + 1).padStart(2, "0"), [[17, 22, 0], [17, 22, 0]], A, CHOCO, [{ x: cx, y: py + 11, w: 44, h: 22 }, { x: XS, y: sy + 11, w: 44, h: 22 }], { align: "center", z: 4 });
  t(`cr_nm${i}`, "sec_craft", c.name, [[20, 30, 0.6], [18, 28, 0.4]], H, CHOCO, [{ x: cx + 58, y: py + 7, w: 322, h: 30 }, { x: XS + 58, y: sy + 8, w: WS - 58, h: 28 }], { weight: 500 });
  t(`cr_tx${i}`, "sec_craft", c.body, [[15, 28, 0.3], [15, 28, 0.3]], B, CHOCO, [{ x: cx, y: py + 60, w: 380, h: 84 }, { x: XS, y: sy + 58, w: WS, h: 84 }]);
});

// ---- 5 海辺の写真の帯（全幅の写真と、下に一行）
sec("sec_seaside", "海辺の写真", "theme:background", 444, 330);
add("sea_ph", { type: "photo", z: 1, section: "sec_seaside", asset: "ast_sea01", layout: { pc: { x: 0, y: 0, w: 100, h: 360, ratio: "custom", fullBleed: true }, sp: { x: 0, y: 0, w: 100, h: 220, ratio: "custom", fullBleed: true } }, crop: { fx: 50, fy: 50, zoom: 1 } });
t("sea_t", "sec_seaside", C.sea, [[18, 28, 0.6], [16, 26, 0.4]], H, CHOCO, [{ x: X0, y: 388, w: 1200, h: 28 }, { x: XS, y: 244, w: WS, h: 52 }], { align: "center", weight: 500 });

// ---- 6 よくある質問（柑橘の面。巨大な欧文と 4 列の問と答え）
sec("sec_faqs", "よくある質問", CITRUS, 540, 900, nav(3));
t("fq_giant", "sec_faqs", C.faqGiant, [[120, 158, -1.2], [48, 64, -0.5]], A, CHOCO, [{ x: X0 - 6, y: 70, w: 860, h: 158 }, { x: XS - 2, y: 50, w: WS, h: 64 }], { role: "heading" });
t("fq_h", "sec_faqs", C.faqHead, [[22, 32, 1], [20, 30, 1]], H, CHOCO, [{ x: 1000, y: 160, w: 320, h: 32 }, { x: XS, y: 124, w: WS, h: 30 }], { align: "right", weight: 500 });
C.faq.forEach(([q, a], i) => {
  const px = X0 + i * 308, sy = 180 + i * 172;
  shp(`fq_l${i}`, "sec_faqs", "rect", "#B78E40", 2, { x: px, y: 260, w: 276, h: 1 }, { x: XS, y: sy, w: WS, h: 1 });
  t(`fq_m${i}`, "sec_faqs", "Q.", [[16, 24, 0], [16, 24, 0]], A, CHOCO, [{ x: px, y: 280, w: 30, h: 24 }, { x: XS, y: sy + 20, w: 30, h: 24 }]);
  t(`fq_q${i}`, "sec_faqs", Array.isArray(q) ? L(q) : q, [[17, 27, 0.3], [17, 27, 0.3]], H, CHOCO, [{ x: px + 32, y: 279, w: 244, h: 54 }, { x: XS + 32, y: sy + 19, w: WS - 32, h: 54 }], { weight: 500 });
  t(`fq_a${i}`, "sec_faqs", a, [[14, 25, 0.2], [14, 25, 0.2]], B, CHOCO, [{ x: px, y: 348, w: 276, h: 125 }, { x: XS, y: sy + 84, w: WS, h: 75 }]);
});

// ---- 7 お店の案内と地図（ミルク。左に巨大な欧文・店名・括弧の札の行・ボタン、右に地図）
sec("sec_access", "お店の案内", "theme:background", 750, 960, nav(4));
t("ac_giant", "sec_access", C.acGiant, [[120, 158, -1.2], [56, 74, -0.5]], A, CHOCO, [{ x: X0 - 6, y: 84, w: 480, h: 158 }, { x: XS - 2, y: 50, w: WS, h: 74 }], { role: "heading" });
t("ac_name", "sec_access", C.name, [[24, 34, 0.6], [20, 30, 0.4]], A, CHOCO, [{ x: X0, y: 252, w: 480, h: 34 }, { x: XS, y: 132, w: WS, h: 30 }]);
t("ac_kana", "sec_access", C.nameKana, [[13, 20, 0.6], [12, 18, 0.4]], B, MU, [{ x: X0, y: 290, w: 480, h: 20 }, { x: XS, y: 164, w: WS, h: 18 }]);
C.acRows.forEach(([k, v], i) => {
  const py = 330 + i * 44, sy = 204 + i * 58, isTel = k === "(PHONE)";
  shp(`ac_l${i}`, "sec_access", "rect", SOFT, 2, { x: X0, y: py, w: 480, h: 1 }, { x: XS, y: sy, w: WS, h: 1 });
  t(`ac_k${i}`, "sec_access", k, [[12, 24, 1], [11, 22, 0.9]], A, MU, [{ x: X0, y: py + 10, w: 116, h: 24 }, { x: XS, y: sy + 10, w: 96, h: 22 }]);
  t(`ac_v${i}`, "sec_access", v, [[15, 24, 0.3], [14, 22, 0.2]], B, CHOCO, [{ x: X0 + 120, y: py + 10, w: 360, h: 24 }, { x: XS + 100, y: sy + 10, w: WS - 100, h: 44 }], { weight: 500, ...(isTel ? { link: TEL } : {}) });
});
const ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const g = shop.location.geo;
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${g ? `${g.lat},${g.lng}` : encodeURIComponent(ADDR)}`, newTab: true };
btn("ac_tel", "sec_access", C.telLabel, TEL, { x: X0, y: 576, w: 220, h: 52 }, { x: XS, y: 506, w: 167, h: 48 }, CHOCO, MILK);
btn("ac_map", "sec_access", C.mapLabel, LINKM, { x: X0 + 236, y: 576, w: 244, h: 52 }, { x: 203, y: 506, w: 167, h: 48 }, MILK, CHOCO, true);
add("ac_mapbox", { type: "shape", z: 2, kind: "rect", fill: SOFT, section: "sec_access", radius: 24, layout: lay({ x: 640, y: 100, w: 680, h: 520 }, { x: XS, y: 586, w: WS, h: 300 }) });

// ---- フッター（チョコ）
sec("sec_footer", "フッター", CHOCO, 340, 600);
t("ft_name", "sec_footer", C.name, [[26, 40, 1], [22, 34, 0.6]], A, MILK, [{ x: X0, y: 60, w: 440, h: 40 }, { x: XS, y: 40, w: WS, h: 34 }]);
t("ft_line", "sec_footer", C.footLine, [[14, 24, 0.4], [14, 24, 0.3]], B, MILK, [{ x: X0, y: 108, w: 420, h: 24 }, { x: XS, y: 82, w: WS, h: 24 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[14, 28, 0.5], [15, 28, 0.4]], B, MILK, [{ x: 620, y: 56 + 32 * i, w: 220, h: 28 }, { x: XS, y: 126 + 32 * i, w: WS, h: 30 }], { link: go(a) }));
t("ft_ak", "sec_footer", "(ADDRESS)", [[12, 20, 1], [11, 18, 0.9]], A, FMU, [{ x: 920, y: 60, w: 400, h: 20 }, { x: XS, y: 300, w: WS, h: 18 }]);
t("ft_av", "sec_footer", ["/location", "address"], [[14, 24, 0.4], [14, 24, 0.3]], B, MILK, [{ x: 920, y: 84, w: 400, h: 24 }, { x: XS, y: 322, w: WS, h: 24 }]);
t("ft_tk", "sec_footer", "(PHONE)", [[12, 20, 1], [11, 18, 0.9]], A, FMU, [{ x: 920, y: 128, w: 400, h: 20 }, { x: XS, y: 362, w: WS, h: 18 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[24, 32, 0.6], [22, 30, 0.5]], A, MILK, [{ x: 920, y: 152, w: 260, h: 32 }, { x: XS, y: 384, w: WS, h: 30 }], { link: TEL });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], B, FMU, [{ x: X0, y: 270, w: 500, h: 20 }, { x: XS, y: 450, w: WS, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_22", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_topbar", "sec_firstv", "sec_flavors", "sec_sizes", "sec_craft", "sec_seaside", "sec_faqs", "sec_access"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚／品 ${Object.keys(shop.catalog.items).length}`);
