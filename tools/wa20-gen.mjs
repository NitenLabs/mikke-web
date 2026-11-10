#!/usr/bin/env node
// wa-20：templates/wa-20/SPEC.md の値から samples/<店> の assets.json・site.json を作る。店ごとの文言は samples/<店>/wa20.json。
// 写真は templates/wa-20/photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 使い方：node tools/wa20-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa20-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "popura";
const DIR = `samples/${ID}`, LIST = `templates/wa-20/photos-${ID}.txt`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa20.json`, "utf8"));
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
// 色（SPEC 3章）。金は生成りの上で 2.32 なので文字に使わず線だけ。紺の面の上では 4.85 で英字の小見出しと値段に使う
const BG = "#F3E9D2", PALE = "#FAF4E6", NAVY = "#1F2E4A", RED = "#A3282B", GOLD = "#B8964F", MU = "#5A4E44", NMU = "#D9C9A6", RMU = "#EAD9B8", FMU = "#CDBFA3", RLINE = "#C4676A";
const TEL = { kind: "shopPhone" }, ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
const X0 = 120, XS = 20, WS = 350;
const EN = [[18, 26, 3.6], [15, 22, 3]]; // 英字の小見出し（DM Serif Display・字間 0.2em）
const nav = (i) => ({ anchor: C.nav[i][1], nav: { label: C.nav[i][0], order: i + 1 } });
const pct = (px, w) => r((px / w) * 100);

// ---- 品のカードの部品（カードの中の x・w はカードの幅に対する％、y は px）
const cell = (path, fmt, pc, sp, o) => ({ type: "text", z: o.z ?? 3, role: "body", paragraphs: [{ runs: [path.startsWith("/") ? { bind: { scope: "item", path, format: fmt } } : { text: path }] }], style: { font: o.font || B, weight: o.weight || 400, color: o.color, lineHeight: r(o.lh[0] / o.sz[0]), letterSpacing: r((o.ls || 0) / o.sz[0]), ...(o.align ? { align: o.align } : {}) }, layout: { pc: { ...pc, size: o.sz[0] }, sp: { ...sp, size: o.sz[1] } } });
const shape = (fill, z, pc, sp) => ({ type: "shape", z, kind: "rect", fill, layout: { pc, sp } });
const cphoto = (pc, sp) => ({ type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { ...pc, ratio: "custom" }, sp: { ...sp, ratio: "custom" } } });
const menuOf = (item) => Object.values(shop.catalog.placements).find((p) => p.itemId === item).menuId;
const rep = (id, sect, item, els_, cardH, pc, sp) => add(id, { type: "repeater", z: 3, section: sect, source: { kind: "catalog", menuId: menuOf(item), pick: [item] }, display: { mode: "grid", columns: { pc: 1, sp: 1 }, gap: { pc: 0, sp: 0 }, photoless: "sameCard" }, card: { height: cardH, elements: els_ }, layout: lay(pc, sp) });

// ---- ヘッダー（生成りの帯）
sec("sec_header", "ヘッダー", "theme:background", 80, 60);
t("hd_name", "sec_header", C.name, [[22, 40, 2.2], [18, 32, 1.4]], H, NAVY, [{ x: X0, y: 20, w: 340, h: 40 }, { x: XS, y: 14, w: 260, h: 32 }], { link: { kind: "page", value: "pg_home" }, weight: 500 });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: NAVY, font: B, spMenuBackground: BG }, layout: lay({ x: 700, y: 20, w: 620, h: 40, size: 14 }, { x: 326, y: 8, w: 44, h: 44 }) });

// ---- 1 最初の画面（生成り。左にコピーと営業、右にアーチ形に切った写真と「SINCE 1978」の赤い札）
sec("sec_firstv", "最初の画面", "theme:background", 800, 880);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 780, y: 64, w: 540, h: 672 }, { x: XS, y: 16, w: WS, h: 420 });
rect("fv_tag", "sec_firstv", RED, 2, { x: 740, y: 640, w: 200, h: 56 }, { x: XS, y: 396, w: 150, h: 44 });
t("fv_tagt", "sec_firstv", C.since, [[20, 28, 2], [16, 24, 1.6]], A, BG, [{ x: 740, y: 654, w: 200, h: 28 }, { x: XS, y: 406, w: 150, h: 24 }], { align: "center", z: 4 });
t("fv_kick", "sec_firstv", C.kicker, [[15, 24, 1.5], [13, 22, 1]], B, RED, [{ x: X0, y: 140, w: 560, h: 24 }, { x: XS, y: 468, w: WS, h: 22 }], { weight: 700 });
add("fv_copy", { type: "text", z: 3, role: "pageTitle", section: "sec_firstv", paragraphs: paras(L(C.fvCopy)),
  style: { font: H, weight: 500, color: NAVY, lineHeight: r(84 / 56), letterSpacing: r(3 / 56) },
  layout: lay({ x: X0 - 4, y: 180, w: 620, h: 168, size: 56 }, { x: XS - 2, y: 498, w: WS, h: 100, size: 32 }) });
t("fv_en", "sec_firstv", C.nameEn, [[44, 52, 1], [30, 38, 0.6]], A, RED, [{ x: X0, y: 372, w: 400, h: 52 }, { x: XS, y: 610, w: WS, h: 38 }], { role: "heading" });
t("fv_ent", "sec_firstv", C.enTag, [[14, 22, 3.6], [12, 20, 3]], A, NAVY, [{ x: X0, y: 428, w: 400, h: 22 }, { x: XS, y: 652, w: WS, h: 20 }]);
rect("fv_rule", "sec_firstv", GOLD, 2, { x: X0, y: 474, w: 64, h: 2 }, { x: XS, y: 690, w: 48, h: 2 });
C.facts.forEach(([k, v], i) => {
  t(`fv_k${i}`, "sec_firstv", k, [[13, 30, 1.3], [12, 28, 1]], B, MU, [{ x: X0, y: 502 + i * 40, w: 64, h: 30 }, { x: XS, y: 712 + i * 36, w: 60, h: 28 }], { weight: 500 });
  t(`fv_v${i}`, "sec_firstv", v, [[16, 30, 0.6], [14, 28, 0.3]], B, NAVY, [{ x: 196, y: 502 + i * 40, w: 320, h: 30 }, { x: 88, y: 712 + i * 36, w: 282, h: 28 }]);
});

// ---- 2 当店の三つの定番（この店の見せ場。淡い生成りの面に、大きな写真と 2px の紺の枠の説明の箱を一皿ずつ。
//      一皿目は写真を中央に大きく・箱は全幅、二皿目は写真が左、三皿目は写真が右）
sec("sec_signature", "当店の三つの定番", PALE, 2510, 1890, nav(0));
t("sg_en", "sec_signature", C.sigEn, EN, A, RED, [{ x: X0, y: 110, w: 400, h: 26 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("sg_h", "sec_signature", C.sigHead, [[44, 64, 4.4], [30, 46, 3]], H, NAVY, [{ x: X0, y: 140, w: 560, h: 64 }, { x: XS, y: 84, w: WS, h: 46 }], { role: "heading", weight: 500 });
t("sg_p", "sec_signature", C.sigLead, [[16, 30, 0.8], [15, 28, 0.5]], B, NAVY, [{ x: 720, y: 166, w: 600, h: 30 }, { x: XS, y: 144, w: WS, h: 56 }]);
const W1 = 1200, SPH = 263, SBY = SPH + 16, SBH = 221;
// スマホの中身（三皿とも同じ）
const spCard = { ph: { x: 0, y: 0, w: 100, h: SPH }, bx: { x: 0, y: SBY, w: 100, h: SBH }, nm: { x: pct(20, WS), y: SBY + 20, w: pct(310, WS), h: 36 }, pr: { x: pct(20, WS), y: SBY + 60, w: pct(310, WS), h: 28 }, ds: { x: pct(20, WS), y: SBY + 98, w: pct(310, WS), h: 104 }, tg: { x: 0, y: 0, w: pct(84, WS), h: 40 }, tt: { x: 0, y: 8, w: pct(84, WS), h: 24 } };
const sigEls = (p, n, pc) => ({
  [`${p}_ph`]: cphoto(pc.ph, spCard.ph),
  [`${p}_bx`]: shape(PALE, 2, pc.bx, spCard.bx),
  [`${p}_nm`]: cell("/name", "plain", pc.nm, spCard.nm, { color: NAVY, lh: [48, 36], font: H, sz: [32, 22], ls: 1.5, weight: 500 }),
  [`${p}_pr`]: cell("/prices", "priceAll", pc.pr, spCard.pr, { color: RED, lh: [34, 28], sz: [22, 18], weight: 700, ls: 0.5 }),
  [`${p}_ds`]: cell("/description", "plain", pc.ds, spCard.ds, { color: NAVY, lh: [32, 26], sz: [16, 14], ls: 0.4 }),
  [`${p}_tg`]: shape(RED, 4, pc.tg, spCard.tg),
  [`${p}_tt`]: cell(`No.${n}`, "plain", pc.tt, spCard.tt, { color: BG, lh: [28, 24], font: A, sz: [24, 18], ls: 1, align: "center", z: 5 }) });
const tagAt = (x) => ({ tg: { x: pct(x, W1), y: 0, w: pct(120, W1), h: 52 }, tt: { x: pct(x, W1), y: 12, w: pct(120, W1), h: 28 } });
const cardPC = [
  // 一皿目：写真 900×675 を中央、箱は全幅（高さ 173）
  { ph: { x: 12.5, y: 0, w: 75, h: 675 }, bx: { x: 0, y: 707, w: 100, h: 173 }, nm: { x: 4, y: 743, w: 40, h: 48 }, pr: { x: 4, y: 799, w: 40, h: 34 }, ds: { x: 46, y: 745, w: 50, h: 96 }, ...tagAt(150), h: 880 },
  // 二皿目：写真が左 680×510、箱が右 472×290
  { ph: { x: 0, y: 0, w: pct(680, W1), h: 510 }, bx: { x: pct(728, W1), y: 110, w: pct(472, W1), h: 290 }, nm: { x: pct(768, W1), y: 150, w: pct(392, W1), h: 48 }, pr: { x: pct(768, W1), y: 206, w: pct(392, W1), h: 34 }, ds: { x: pct(768, W1), y: 258, w: pct(392, W1), h: 96 }, ...tagAt(0), h: 510 },
  // 三皿目：箱が左、写真が右
  { ph: { x: pct(520, W1), y: 0, w: pct(680, W1), h: 510 }, bx: { x: 0, y: 110, w: pct(472, W1), h: 290 }, nm: { x: pct(40, W1), y: 150, w: pct(392, W1), h: 48 }, pr: { x: pct(40, W1), y: 206, w: pct(392, W1), h: 34 }, ds: { x: pct(40, W1), y: 258, w: pct(392, W1), h: 96 }, ...tagAt(520), h: 510 } ];
const sigY = [280, 1260, 1870], sigYs = [230, 770, 1310];
C.sigPick.forEach((id, i) => rep(`sg_c${i}`, "sec_signature", id, sigEls(`s${i}`, i + 1, cardPC[i]), { pc: cardPC[i].h, sp: SBY + SBH }, { x: X0, y: sigY[i], w: W1, h: cardPC[i].h }, { x: XS, y: sigYs[i], w: WS, h: SBY + SBH }));

// ---- 3 お品書き（紺の面。正方形の写真と金の枠の箱のカードを三つ、写真の無い品は金の罫線の行）
sec("sec_menu", "お品書き", NAVY, 1040, 2110, nav(1));
t("mn_en", "sec_menu", C.menuEn, EN, A, GOLD, [{ x: X0, y: 100, w: 400, h: 26 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("mn_h", "sec_menu", C.menuHead, [[44, 64, 4.4], [30, 46, 3]], H, BG, [{ x: X0, y: 130, w: 560, h: 64 }, { x: XS, y: 84, w: WS, h: 46 }], { role: "heading", weight: 500 });
t("mn_p", "sec_menu", C.menuLead, [[16, 30, 0.8], [15, 28, 0.5]], B, BG, [{ x: 720, y: 156, w: 600, h: 30 }, { x: XS, y: 144, w: WS, h: 28 }]);
const MW = 368, MPH = 368, MSPH = 350, MBH = 168, MSBH = 160;
const menuEls = (p) => ({
  [`${p}_ph`]: cphoto({ x: 0, y: 0, w: 100, h: MPH }, { x: 0, y: 0, w: 100, h: MSPH }),
  [`${p}_bx`]: shape(NAVY, 2, { x: 0, y: MPH + 16, w: 100, h: MBH }, { x: 0, y: MSPH + 16, w: 100, h: MSBH }),
  [`${p}_nm`]: cell("/name", "plain", { x: pct(24, MW), y: MPH + 36, w: pct(320, MW), h: 34 }, { x: pct(20, WS), y: MSPH + 36, w: pct(310, WS), h: 32 }, { color: BG, lh: [34, 32], font: H, sz: [22, 20], ls: 1, weight: 500 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: pct(24, MW), y: MPH + 74, w: pct(320, MW), h: 28 }, { x: pct(20, WS), y: MSPH + 70, w: pct(310, WS), h: 26 }, { color: GOLD, lh: [28, 26], sz: [17, 16], weight: 700, ls: 0.5 }),
  [`${p}_ds`]: cell("/description", "plain", { x: pct(24, MW), y: MPH + 108, w: pct(320, MW), h: 52 }, { x: pct(20, WS), y: MSPH + 102, w: pct(310, WS), h: 52 }, { color: NMU, lh: [26, 26], sz: [14, 14], ls: 0.3 }) });
C.menuPick.forEach((id, i) => rep(`mn_c${i}`, "sec_menu", id, menuEls(`m${i}`), { pc: MPH + 16 + MBH, sp: MSPH + 16 + MSBH }, { x: X0 + i * (MW + 48), y: 250, w: MW, h: MPH + 16 + MBH }, { x: XS, y: 196 + i * 558, w: WS, h: MSPH + 16 + MSBH }));
const rowEls = (p) => ({
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 16, w: 64, h: 32 }, { x: 0, y: 16, w: 70, h: 32 }, { color: BG, lh: [32, 32], font: H, sz: [20, 17], ls: 1, weight: 500 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: 64, y: 18, w: 36, h: 28 }, { x: 70, y: 18, w: 30, h: 28 }, { color: GOLD, lh: [28, 28], sz: [17, 16], align: "right", weight: 700, ls: 0.5 }) });
C.rowPick.forEach((id, i) => rep(`mn_r${i}`, "sec_menu", id, rowEls(`r${i}`), { pc: 64, sp: 64 }, { x: X0 + i * (576 + 48), y: 860, w: 576, h: 64 }, { x: XS, y: 1878 + i * 72, w: WS, h: 64 }));
t("mn_note", "sec_menu", C.note, [[13, 22, 0.6], [12, 20, 0.4]], B, NMU, [{ x: X0, y: 948, w: 600, h: 22 }, { x: XS, y: 2032, w: WS, h: 20 }]);

// ---- 4 すずかけのこと（生成り。大きな創業の年と見出し・紹介、右に客席の写真）
sec("sec_story", "すずかけのこと", "theme:background", 820, 930, nav(2));
photo("ab_ph", "sec_story", "ast_ab01", 1, { x: 640, y: 120, w: 680, h: 453 }, { x: XS, y: 48, w: WS, h: 233 });
t("st_en", "sec_story", C.aboutEn, EN, A, RED, [{ x: X0, y: 110, w: 400, h: 26 }, { x: XS, y: 312, w: WS, h: 22 }]);
t("st_year", "sec_story", C.aboutYear, [[120, 168, 2], [84, 118, 1]], A, RED, [{ x: X0 - 6, y: 140, w: 420, h: 168 }, { x: XS - 4, y: 336, w: WS, h: 118 }]);
t("st_h", "sec_story", L(C.aboutHead), [[36, 56, 3.6], [26, 42, 2.6]], H, NAVY, [{ x: X0, y: 324, w: 460, h: 112 }, { x: XS, y: 464, w: WS, h: 84 }], { role: "heading", weight: 500 });
t("st_p", "sec_story", C.aboutBody, [[16, 32, 0.8], [15, 30, 0.5]], B, NAVY, [{ x: X0, y: 462, w: 460, h: 128 }, { x: XS, y: 568, w: WS, h: 150 }]);
t("st_p2", "sec_story", C.aboutBody2, [[16, 32, 0.8], [15, 30, 0.5]], B, NAVY, [{ x: X0, y: 606, w: 460, h: 96 }, { x: XS, y: 736, w: WS, h: 120 }]);

// ---- 5 ご案内と地図（赤の面）
sec("sec_info", "ご案内", RED, 780, 1100, nav(3));
t("in_en", "sec_info", C.infoEn, EN, A, RMU, [{ x: X0, y: 100, w: 400, h: 26 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("in_h", "sec_info", C.infoHead, [[40, 60, 4], [30, 46, 3]], H, BG, [{ x: X0, y: 130, w: 400, h: 60 }, { x: XS, y: 84, w: WS, h: 46 }], { role: "heading", weight: 500 });
let yP = 220, yS = 154;
C.infoRows.forEach(([k, v], i) => {
  const two = Array.isArray(v) && typeof v[0] === "string" && v[0].includes(" "), hP = two ? 92 : 64, hS = two ? 108 : 76;
  rect(`in_l${i}`, "sec_info", RLINE, 2, { x: X0, y: yP, w: 560, h: 1 }, { x: XS, y: yS, w: WS, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[13, 26, 1.3], [12, 22, 1]], B, RMU, [{ x: X0, y: yP + 19, w: 110, h: 26 }, { x: XS, y: yS + 12, w: WS, h: 22 }], { weight: 500 });
  t(`in_v${i}`, "sec_info", two ? L(v) : v, [[16, 28, 0.5], [14, 26, 0.2]], B, BG, [{ x: X0 + 120, y: yP + 18, w: 440, h: two ? 56 : 28 }, { x: XS, y: yS + 38, w: WS, h: two ? 52 : 26 }], k === "お電話" ? { link: TEL } : {});
  yP += hP; yS += hS;
});
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDR} ${shop.basic.name}`)}`, newTab: true };
const btn = (id, sect, label, link, pc, sp, fill, color, z = 2) => {
  rect(`${id}_b`, sect, fill, z, pc, sp, { link });
  t(`${id}_t`, sect, label, [[15, 24, 1.5], [14, 24, 1]], B, color, [{ ...pc, y: pc.y + 16, h: 24 }, { ...sp, y: sp.y + 14, h: 24 }], { align: "center", link, z: z + 2, weight: 700 });
};
btn("in_tel", "sec_info", C.telLabel, TEL, { x: X0, y: yP + 40, w: 260, h: 56 }, { x: XS, y: yS + 32, w: 167, h: 52 }, BG, NAVY);
btn("in_map", "sec_info", C.mapLabel, LINKM, { x: X0 + 284, y: yP + 40, w: 260, h: 56 }, { x: 203, y: yS + 32, w: 167, h: 52 }, RED, BG);
add("in_mapbox", { type: "shape", z: 2, kind: "rect", fill: RLINE, section: "sec_info", layout: lay({ x: 740, y: 100, w: 580, h: 580 }, { x: XS, y: yS + 120, w: WS, h: 360 }) });

// ---- フッター（紺）
sec("sec_footer", "フッター", NAVY, 340, 600);
t("ft_name", "sec_footer", C.name, [[22, 40, 2.2], [20, 40, 1.6]], H, BG, [{ x: X0, y: 60, w: 440, h: 40 }, { x: XS, y: 40, w: WS, h: 40 }], { weight: 500 });
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 26, 0.5], [14, 26, 0.5]], B, BG, [{ x: X0, y: 110, w: 420, h: 26 }, { x: XS, y: 92, w: WS, h: 26 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[14, 30, 0.6], [15, 30, 0.5]], B, BG, [{ x: 620, y: 60 + 32 * i, w: 220, h: 30 }, { x: XS, y: 136 + 32 * i, w: WS, h: 30 }], { link: go(a) }));
t("ft_hk", "sec_footer", "営業時間", [[13, 22, 1.3], [12, 20, 1]], B, FMU, [{ x: 900, y: 64, w: 420, h: 22 }, { x: XS, y: 284, w: WS, h: 20 }]);
t("ft_hv", "sec_footer", L(C.footHours), [[14, 26, 0.5], [14, 26, 0.5]], B, BG, [{ x: 900, y: 90, w: 420, h: 78 }, { x: XS, y: 308, w: WS, h: 78 }]);
t("ft_tk", "sec_footer", "お電話", [[13, 22, 1.3], [12, 20, 1]], B, FMU, [{ x: 900, y: 186, w: 200, h: 22 }, { x: XS, y: 402, w: WS, h: 20 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[24, 32, 1.2], [22, 32, 1.1]], A, BG, [{ x: 900, y: 212, w: 260, h: 32 }, { x: XS, y: 426, w: WS, h: 32 }], { link: TEL });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], B, FMU, [{ x: X0, y: 282, w: 500, h: 20 }, { x: XS, y: 530, w: WS, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_20", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_signature", "sec_menu", "sec_story", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚／品 ${Object.keys(shop.catalog.items).length}`);
