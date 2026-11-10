#!/usr/bin/env node
// wa-24：templates/wa-24/SPEC.md の値から samples/<店> の assets.json・site.json を作る（wa22-gen を元にした）。店ごとの文言は samples/<店>/wa24.json。
// 写真は templates/wa-24/photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 左端の固定の縦の札の列（PC・タブレット）は描画エンジンに無いので wa24-finish.mjs が足す。
// 使い方：node tools/wa24-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa24-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "kairo";
const DIR = `samples/${ID}`, LIST = `templates/wa-24/photos-${ID}.txt`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa24.json`, "utf8"));
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
    layout: lay({ ...l[0], size: ps[0] }, { ...l[1], size: ss[0] }), ...(x.hidden ? { hidden: x.hidden } : {}) });
}
const sec = (id, name, color, pc, sp, more = {}) => { secs[id] = { name, background: { color }, minHeight: { pc, sp }, ...more }; };
const photo = (id, section, asset, z, pc, sp) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1 } });
const shp = (id, section, kind, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind, fill, section, layout: lay(pc, sp), ...x });

const H = "font:heading", B = "font:body", A = "font:accent";
// 色（SPEC 3章）
const NAVY = "#10172A", SMOKE = "#D9D4CA", AMBER = "#C8893A", BRASS = "#B39A5B", DEEP = "#182238", MUTE = "#A39E94", GHOST = "#3A4152", ROWL = "#2A3550";
const TEL = { kind: "shopPhone" };
const go = (a) => ({ kind: "anchor", value: `pg_home#${a}` });
const X0 = 192, CW = 1120, XR = X0 + CW, XS = 20, WS = 350; // PC：縦の札の列 64 を除いた残りの中央に中身 1120（1440 で左右 128）
const pct = (px, w) => r((px / w) * 100);
const ENS = [[14, 20, 2.5], [12, 18, 2.2]]; // 英字の札（Italiana・字間 0.18em）
const VBAR = (id, sect, pc, sp, x = {}) => shp(id, sect, "rect", BRASS, 2, pc, sp, x); // 1px の真鍮の線

// ---- 品のカードの部品（カードの中の x・w はカードの幅に対する％、y は px）
const cell = (path, fmt, pc, sp, o) => ({ type: "text", z: o.z ?? 3, role: "body", paragraphs: [{ runs: [path.startsWith("/") ? { bind: { scope: "item", path, format: fmt } } : { text: path }] }], style: { font: o.font || B, weight: o.weight || 400, color: o.color, lineHeight: r(o.lh[0] / o.sz[0]), letterSpacing: r((o.ls || 0) / o.sz[0]), ...(o.align ? { align: o.align } : {}) }, layout: { pc: { ...pc, size: o.sz[0] }, sp: { ...sp, size: o.sz[1] } } });
const cshape = (kind, fill, z, pc, sp, x = {}) => ({ type: "shape", z, kind, fill, layout: { pc, sp }, ...x });
const cphoto = (pc, sp) => ({ type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { ...pc, ratio: "custom" }, sp: { ...sp, ratio: "custom" } } });
const menuOf = (item) => Object.values(shop.catalog.placements).find((p) => p.itemId === item).menuId;
const rep = (id, sect, item, els_, cardH, pc, sp) => add(id, { type: "repeater", z: 3, section: sect, source: { kind: "catalog", menuId: menuOf(item), pick: [item] }, display: { mode: "grid", columns: { pc: 1, sp: 1 }, gap: { pc: 0, sp: 0 }, photoless: "sameCard" }, card: { height: cardH, elements: els_ }, layout: lay(pc, sp) });
// ボタン（角 0・1px の枠）。塗りの主ボタンと、枠だけの副ボタン
const btn = (id, sect, label, link, pc, sp, fill, color, stroke, fs = [15, 14]) => {
  shp(`${id}_b`, sect, "rect", fill, 2, pc, sp, { link, ...(stroke ? { stroke: { color: stroke, width: 1 } } : {}) });
  const ty = (b, f) => Math.round((b.h - f * 1.6) / 2);
  t(`${id}_t`, sect, label, [[fs[0], Math.round(fs[0] * 1.6), 1.5], [fs[1], Math.round(fs[1] * 1.6), 1]], B, color, [{ ...pc, y: pc.y + ty(pc, fs[0]), h: Math.round(fs[0] * 1.6) }, { ...sp, y: sp.y + ty(sp, fs[1]), h: Math.round(fs[1] * 1.6) }], { align: "center", link, z: 4, weight: 500 });
};
const ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;

// ---- ヘッダー（紺。左に店名、右に営業の 1 行と「電話する」の札。スマホは下に横の札の行）
sec("sec_header", "ヘッダー", "theme:background", 72, 96);
t("hd_name", "sec_header", C.name, [[24, 32, 3.8], [20, 28, 3]], A, SMOKE, [{ x: 96, y: 20, w: 260, h: 32 }, { x: XS, y: 14, w: 190, h: 28 }], { link: { kind: "page", value: "pg_home" } });
t("hd_hours", "sec_header", C.hdHours, [[13, 20, 0.8], [12, 18, 0.5]], B, SMOKE, [{ x: 860, y: 26, w: 296, h: 20 }, { x: XS, y: 0, w: WS, h: 18 }], { align: "right", hidden: { sp: true } });
btn("hd_tel", "sec_header", C.telLabel, TEL, { x: 1176, y: 16, w: 136, h: 40 }, { x: 254, y: 10, w: 116, h: 36 }, NAVY, AMBER, AMBER, [14, 13]);
VBAR("hd_tl", "sec_header", { x: 0, y: 55, w: 200, h: 1 }, { x: 0, y: 56, w: S, h: 1 }, { hidden: { pc: true } });
C.nav.forEach(([rl, , a], i) => t(`hd_t${i}`, "sec_header", rl, [[13, 20, 1], [13, 20, 1]], H, SMOKE, [{ x: 0, y: 0, w: 200, h: 20 }, { x: XS + i * 87.5, y: 66, w: 87.5, h: 20 }], { align: "center", link: go(a), weight: 500, hidden: { pc: true } }));

// ---- 1 最初の画面（左に縦書きのコピー、右に横長の写真。写真の上に文字を載せない）
sec("sec_firstv", "最初の画面", "theme:background", 760, 940);
t("fv_kick", "sec_firstv", C.fv.kicker, [[13, 22, 1.3], [12, 20, 1]], B, MUTE, [{ x: X0, y: 120, w: 340, h: 22 }, { x: XS, y: 515, w: WS, h: 20 }]);
add("fv_copy", { type: "text", z: 3, role: "pageTitle", section: "sec_firstv", paragraphs: paras(L(C.fv.copy)),
  style: { font: H, weight: 500, color: SMOKE, lineHeight: 1.9, letterSpacing: 0.12 },
  layout: lay({ x: X0, y: 166, w: 180, h: 320, size: 44, writingMode: "vertical" }, { x: XS, y: 548, w: 130, h: 230, size: 32, writingMode: "vertical" }) });
t("fv_p", "sec_firstv", C.fv.lead, [[16, 32, 0.5], [14, 26, 0.3]], B, SMOKE, [{ x: X0, y: 518, w: 340, h: 64 }, { x: 170, y: 552, w: 200, h: 112 }]);
t("fv_info", "sec_firstv", C.fv.info, [[14, 24, 0.4], [13, 22, 0.3]], B, MUTE, [{ x: X0, y: 600, w: 340, h: 24 }, { x: 170, y: 690, w: 200, h: 44 }]);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 572, y: 120, w: 740, h: 500 }, { x: XS, y: 24, w: WS, h: 467 });
const FVE = [[572, 150], [748, 214], [990, 322]];
C.fv.en.forEach((s, i) => {
  t(`fv_e${i}`, "sec_firstv", s, [[15, 24, 1.8], [13, 20, 1.6]], A, BRASS, [{ x: FVE[i][0], y: 644, w: FVE[i][1], h: 24 }, { x: XS, y: 808 + i * 28, w: WS, h: 20 }]);
  if (i) VBAR(`fv_v${i}`, "sec_firstv", { x: FVE[i][0] - 14, y: 648, w: 1, h: 16 }, { x: XS, y: 0, w: 1, h: 1 }, { hidden: { sp: true } });
});

// ---- 2 今宵の一杯（見せ場。3 杯を 2 列の千鳥、右端に縦書きの巨大欧文）
sec("sec_tonight", "今宵の一杯", "theme:background", 2396, 2954, { anchor: C.nav[0][2] });
VBAR("tn_top", "sec_tonight", { x: X0, y: 0, w: CW, h: 1 }, { x: XS, y: 0, w: WS, h: 1 });
t("tn_giant", "sec_tonight", C.tonight.giant, [[140, 140, 2], [56, 64, 0.5]], A, BRASS, [{ x: 1152, y: 150, w: 160, h: 560, writingMode: "vertical" }, { x: XS - 2, y: 72, w: WS, h: 64 }], { z: 1 });
t("tn_en", "sec_tonight", C.tonight.en, ENS, A, BRASS, [{ x: X0, y: 160, w: 520, h: 20 }, { x: XS, y: 152, w: WS, h: 18 }]);
t("tn_h", "sec_tonight", C.tonight.head, [[44, 60, 2], [32, 46, 1.5]], H, SMOKE, [{ x: X0, y: 192, w: 520, h: 60 }, { x: XS, y: 178, w: WS, h: 46 }], { role: "heading", weight: 500 });
t("tn_p", "sec_tonight", C.tonight.lead, [[16, 32, 0.5], [15, 28, 0.3]], B, SMOKE, [{ x: X0, y: 268, w: 520, h: 32 }, { x: XS, y: 236, w: WS, h: 56 }]);
const KW = 440, KH = 876, KSH = 730;
const tonightEls = (p, c) => ({
  [`${p}_no`]: cell(c.no, "plain", { x: 0, y: 0, w: 40, h: 28 }, { x: 0, y: 0, w: 40, h: 28 }, { color: AMBER, lh: [28, 28], font: A, sz: [20, 20], ls: 1 }),
  [`${p}_tg`]: cell(c.tag, "plain", { x: 40, y: 6, w: 60, h: 18 }, { x: 40, y: 6, w: 60, h: 18 }, { color: BRASS, lh: [18, 18], font: A, sz: [12, 12], ls: 2.2, align: "right" }),
  [`${p}_ln`]: cshape("rect", BRASS, 1, { x: 0, y: 36, w: 100, h: 1 }, { x: 0, y: 36, w: 100, h: 1 }),
  [`${p}_ph`]: cphoto({ x: 0, y: 52, w: 100, h: 550 }, { x: 0, y: 52, w: 100, h: 438 }),
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 626, w: 100, h: 40 }, { x: 0, y: 506, w: 100, h: 34 }, { color: SMOKE, lh: [40, 34], font: H, sz: [26, 22], weight: 500 }),
  [`${p}_en`]: cell(c.en, "plain", { x: 0, y: 668, w: 100, h: 24 }, { x: 0, y: 542, w: 100, h: 22 }, { color: BRASS, lh: [24, 22], font: A, sz: [15, 14], ls: 1.2 }),
  [`${p}_il`]: cell(C.tonight.ingLabel, "plain", { x: 0, y: 709, w: pct(44, KW), h: 22 }, { x: 0, y: 575, w: pct(44, WS), h: 22 }, { color: MUTE, lh: [22, 22], sz: [12, 12], ls: 1.2 }),
  [`${p}_ig`]: cell(c.ing, "plain", { x: pct(48, KW), y: 708, w: pct(KW - 48, KW), h: 50 }, { x: pct(48, WS), y: 574, w: pct(WS - 48, WS), h: 50 }, { color: MUTE, lh: [25, 25], sz: [14, 14], ls: 0.3 }),
  [`${p}_ds`]: cell("/description", "plain", { x: 0, y: 772, w: 100, h: 58 }, { x: 0, y: 634, w: 100, h: 56 }, { color: SMOKE, lh: [29, 28], sz: [15, 15], ls: 0.3 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: 0, y: 846, w: 100, h: 30 }, { x: 0, y: 700, w: 100, h: 30 }, { color: AMBER, lh: [30, 30], sz: [20, 20], weight: 700, align: "right", ls: 0.5 }) });
const KPOS = [{ x: X0, y: 364 }, { x: X0 + 504, y: 684 }, { x: X0, y: 1360 }]; // 右列は巨大欧文（1152〜）の手前で止める
C.tonight.cards.forEach((c, i) => rep(`tn_c${i}`, "sec_tonight", c.item, tonightEls(`k${i}`, c), { pc: KH, sp: KSH }, { ...KPOS[i], w: KW, h: KH }, { x: XS, y: 324 + i * 794, w: WS, h: KSH }));
// 注記の枠（押せない枠なので、高さを取って文だけ。1px の真鍮の枠）
shp("tn_nb", "sec_tonight", "rect", NAVY, 1, { x: X0 + 504, y: 1624, w: KW, h: 160 }, { x: XS, y: 2706, w: WS, h: 160 }, { stroke: { color: BRASS, width: 1 } });
t("tn_note", "sec_tonight", C.tonight.note, [[15, 29, 0.3], [14, 26, 0.2]], B, SMOKE, [{ x: X0 + 536, y: 1660, w: KW - 64, h: 87 }, { x: XS + 24, y: 2732, w: WS - 48, h: 104 }]);

// ---- 3 カウンター（濃い紺。左端に縦の巨大欧文、縦書きの見出しと紹介文・数字の行、右に写真）
sec("sec_counter", "カウンター", DEEP, 900, 1100, { anchor: C.nav[1][2] });
t("ct_giant", "sec_counter", C.counter.giant, [[120, 120, 2], [52, 60, 0.5]], A, GHOST, [{ x: X0, y: 140, w: 130, h: 520, writingMode: "vertical" }, { x: XS - 2, y: 72, w: WS, h: 60 }], { z: 1 });
t("ct_en", "sec_counter", C.counter.en, ENS, A, BRASS, [{ x: 372, y: 140, w: 460, h: 20 }, { x: XS, y: 148, w: WS, h: 18 }]);
t("ct_h", "sec_counter", L(C.counter.head), [[34, 61, 4], [26, 40, 1]], H, SMOKE, [{ x: 372, y: 188, w: 140, h: 360, writingMode: "vertical" }, { x: XS, y: 176, w: WS, h: 94 }], { role: "heading", weight: 500 });
t("ct_p", "sec_counter", C.counter.body, [[16, 32, 0.4], [15, 28, 0.3]], B, SMOKE, [{ x: 552, y: 192, w: 280, h: 224 }, { x: XS, y: 276, w: WS, h: 140 }]);
const NUMW = [[372, 130], [502, 200], [702, 130]], NUMS = [[XS, 100], [XS + 100, 150], [XS + 250, 100]];
VBAR("ct_nl", "sec_counter", { x: 372, y: 600, w: 460, h: 1 }, { x: XS, y: 436, w: WS, h: 1 });
C.counter.nums.forEach(([a, b], i) => {
  const pc = NUMW[i], sp = NUMS[i], pad = i ? 20 : 0, spad = i ? 12 : 0;
  t(`ct_n${i}`, "sec_counter", a, [[26, 36, 0.5], [20, 30, 0.3]], A, AMBER, [{ x: pc[0] + pad, y: 624, w: pc[1] - pad, h: 36 }, { x: sp[0] + spad, y: 456, w: sp[1] - spad, h: 30 }]);
  t(`ct_j${i}`, "sec_counter", b, [[13, 20, 0.8], [12, 18, 0.5]], B, SMOKE, [{ x: pc[0] + pad, y: 664, w: pc[1] - pad, h: 20 }, { x: sp[0] + spad, y: 490, w: sp[1] - spad, h: 18 }]);
  if (i) VBAR(`ct_v${i}`, "sec_counter", { x: pc[0], y: 620, w: 1, h: 68 }, { x: sp[0], y: 452, w: 1, h: 60 });
});
photo("ct_ph", "sec_counter", "ast_h101", 1, { x: 852, y: 140, w: 460, h: 575 }, { x: XS, y: 548, w: WS, h: 438 });
t("ct_cap", "sec_counter", C.counter.caption, [[14, 22, 0.4], [13, 20, 0.3]], B, MUTE, [{ x: 852, y: 731, w: 460, h: 22 }, { x: XS, y: 1000, w: WS, h: 20 }], { align: "right" });

// ---- 4 品書き（紺。横書きの巨大欧文「Menu」、写真付きの 3 列のカード、1px の線で区切った 3 行）
sec("sec_menu", "品書き", "theme:background", 1391, 2798, { anchor: C.nav[2][2] });
t("mn_giant", "sec_menu", C.menu.giant, [[112, 120, 1], [52, 56, 0.5]], A, BRASS, [{ x: X0 - 6, y: 128, w: 420, h: 120 }, { x: XS - 2, y: 72, w: WS, h: 56 }], { role: "heading" });
t("mn_h", "sec_menu", C.menu.head, [[36, 52, 2], [28, 40, 1.5]], H, SMOKE, [{ x: 712, y: 150, w: 600, h: 52 }, { x: XS, y: 140, w: WS, h: 40 }], { align: "right", weight: 500 });
t("mn_note", "sec_menu", C.menu.note, [[13, 22, 0.4], [13, 22, 0.3]], B, MUTE, [{ x: 712, y: 212, w: 600, h: 22 }, { x: XS, y: 188, w: WS, h: 44 }], { align: "right" });
const MW = 352, MPH = (wide) => (wide ? [235, 233] : [440, 438]);
const menuEls = (p, c) => {
  const [ph, sh] = MPH(c.wide), y = 32 + ph, sy = 28 + sh;
  return {
    [`${p}_tg`]: cell(c.tag, "plain", { x: 0, y: 0, w: 100, h: 20 }, { x: 0, y: 0, w: 100, h: 18 }, { color: BRASS, lh: [20, 18], font: A, sz: [13, 12], ls: 2.3 }),
    [`${p}_ph`]: cphoto({ x: 0, y: 32, w: 100, h: ph }, { x: 0, y: 28, w: 100, h: sh }),
    [`${p}_nm`]: cell("/name", "plain", { x: 0, y: y + 24, w: 100, h: 34 }, { x: 0, y: sy + 20, w: 100, h: 32 }, { color: SMOKE, lh: [34, 32], font: H, sz: [22, 20], weight: 500 }),
    [`${p}_ds`]: cell("/description", "plain", { x: 0, y: y + 66, w: 100, h: 87 }, { x: 0, y: sy + 58, w: 100, h: 84 }, { color: SMOKE, lh: [29, 28], sz: [15, 15], ls: 0.3 }),
    [`${p}_pr`]: cell("/prices", "priceAll", { x: 0, y: y + 169, w: 100, h: 30 }, { x: 0, y: sy + 150, w: 100, h: 30 }, { color: AMBER, lh: [30, 30], sz: [20, 20], weight: 700, align: "right", ls: 0.5 }) };
};
let msy = 268;
C.menu.cards.forEach((c, i) => {
  const [ph, sh] = MPH(c.wide), h = 32 + ph + 199, sh_ = 28 + sh + 180;
  rep(`mn_c${i}`, "sec_menu", c.item, menuEls(`m${i}`, c), { pc: h, sp: sh_ }, { x: X0 + i * (MW + 32), y: 312, w: MW, h }, { x: XS, y: msy, w: WS, h: sh_ });
  msy += sh_ + 56;
});
// 下の 3 行（表にしない。左に名前・中に一言・右に値段）
const ROWY = 1047, RH = 72, SRY = msy + 8, SRH = 112;
const rowEls = (p) => ({
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 22, w: pct(300, CW), h: 28 }, { x: 0, y: 22, w: 64, h: 28 }, { color: SMOKE, lh: [28, 28], font: H, sz: [18, 17], weight: 500 }),
  [`${p}_ds`]: cell("/description", "plain", { x: pct(328, CW), y: 22, w: pct(400, CW), h: 28 }, { x: 0, y: 56, w: 100, h: 26 }, { color: MUTE, lh: [28, 26], sz: [15, 14], ls: 0.3 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: pct(920, CW), y: 21, w: pct(200, CW), h: 30 }, { x: 64, y: 21, w: 36, h: 30 }, { color: AMBER, lh: [30, 30], sz: [20, 18], weight: 700, align: "right", ls: 0.5 }) });
C.menu.rows.forEach((item, i) => {
  VBAR(`mn_l${i}`, "sec_menu", { x: X0, y: ROWY + i * RH, w: CW, h: 1 }, { x: XS, y: SRY + i * SRH, w: WS, h: 1 });
  rep(`mn_r${i}`, "sec_menu", item, rowEls(`r${i}`), { pc: RH, sp: SRH }, { x: X0, y: ROWY + i * RH, w: CW, h: RH }, { x: XS, y: SRY + i * SRH, w: WS, h: SRH });
});
VBAR("mn_l3", "sec_menu", { x: X0, y: ROWY + 3 * RH, w: CW, h: 1 }, { x: XS, y: SRY + 3 * SRH, w: WS, h: 1 });
t("mn_go", "sec_menu", C.menu.rowLink, [[14, 28, 0.4], [13, 22, 0.3]], B, SMOKE, [{ x: X0 + 744, y: ROWY + 22, w: 160, h: 28 }, { x: XS, y: SRY + 84, w: 160, h: 22 }], { link: go(C.nav[0][2]), z: 4 });
const MENU_SP = SRY + 3 * SRH + 80;
secs.sec_menu.minHeight.sp = MENU_SP;

// ---- 5 案内と地図（紺。左に巨大欧文・店名・括弧の札の行・ボタン、右に地図）
sec("sec_access", "案内", "theme:background", 810, 984, { anchor: C.nav[3][2] });
t("ac_giant", "sec_access", C.access.giant, [[96, 104, 1], [52, 56, 0.5]], A, BRASS, [{ x: X0 - 5, y: 120, w: 440, h: 104 }, { x: XS - 2, y: 64, w: WS, h: 56 }], { role: "heading" });
t("ac_name", "sec_access", C.name, [[28, 36, 2.2], [24, 32, 1.8]], A, SMOKE, [{ x: X0, y: 240, w: 440, h: 36 }, { x: XS, y: 136, w: WS, h: 32 }]);
t("ac_kana", "sec_access", C.nameKana, [[13, 20, 1], [12, 18, 0.8]], B, MUTE, [{ x: X0, y: 278, w: 440, h: 20 }, { x: XS, y: 170, w: WS, h: 18 }]);
C.access.rows.forEach(([k, v], i) => {
  const py = 318 + i * 48, sy = 204 + i * 52, isTel = v === "tel";
  shp(`ac_l${i}`, "sec_access", "rect", ROWL, 2, { x: X0, y: py, w: 440, h: 1 }, { x: XS, y: sy, w: WS, h: 1 });
  t(`ac_k${i}`, "sec_access", k, [[12, 24, 1.6], [11, 24, 1.3]], A, BRASS, [{ x: X0, y: py + 12, w: 120, h: 24 }, { x: XS, y: sy + 14, w: 100, h: 24 }]);
  const val = isTel ? ["/contact/phone", "phone"] : v === "addr" ? ADDR : v;
  t(`ac_v${i}`, "sec_access", val, [[15, 24, 0.4], [14, 24, 0.3]], B, SMOKE, [{ x: X0 + 120, y: py + 12, w: 320, h: 24 }, { x: XS + 100, y: sy + 14, w: WS - 100, h: 24 }], { weight: 500, ...(isTel ? { link: TEL } : {}) });
});
shp("ac_l6", "sec_access", "rect", ROWL, 2, { x: X0, y: 606, w: 440, h: 1 }, { x: XS, y: 516, w: WS, h: 1 });
const g = shop.location.geo;
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${g ? `${g.lat},${g.lng}` : encodeURIComponent(ADDR)}`, newTab: true };
btn("ac_tel", "sec_access", C.telLabel, TEL, { x: X0, y: 638, w: 212, h: 52 }, { x: XS, y: 540, w: 167, h: 48 }, AMBER, NAVY);
btn("ac_map", "sec_access", C.mapLabel, LINKM, { x: X0 + 228, y: 638, w: 212, h: 52 }, { x: 203, y: 540, w: 167, h: 48 }, NAVY, SMOKE, SMOKE);
add("ac_mapbox", { type: "shape", z: 2, kind: "rect", fill: DEEP, section: "sec_access", layout: lay({ x: 672, y: 120, w: 640, h: 480 }, { x: XS, y: 612, w: WS, h: 300 }) });

// ---- フッター（濃い紺。左上の角だけ 80。3 列＋線＋飲酒の断り＋架空の断り書き〔自動〕）
sec("sec_footer", "フッター", DEEP, 340, 540);
t("ft_name", "sec_footer", C.name, [[32, 40, 2.6], [26, 34, 2]], A, SMOKE, [{ x: X0, y: 72, w: 340, h: 40 }, { x: XS, y: 48, w: WS, h: 34 }]);
t("ft_line", "sec_footer", C.footer.line, [[14, 24, 0.4], [14, 24, 0.3]], B, SMOKE, [{ x: X0, y: 120, w: 340, h: 48 }, { x: XS, y: 88, w: WS, h: 24 }]);
C.nav.forEach(([, l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[15, 28, 0.6], [15, 28, 0.4]], H, SMOKE, [{ x: 592, y: 72 + 32 * i, w: 240, h: 28 }, { x: XS, y: 136 + 32 * i, w: WS, h: 28 }], { link: go(a), weight: 500 }));
t("ft_addr", "sec_footer", ADDR, [[14, 24, 0.4], [14, 24, 0.3]], B, SMOKE, [{ x: 912, y: 72, w: 400, h: 24 }, { x: XS, y: 280, w: WS, h: 24 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[22, 30, 1.3], [22, 30, 1.3]], A, SMOKE, [{ x: 912, y: 104, w: 220, h: 30 }, { x: XS, y: 310, w: 220, h: 30 }], { link: TEL });
t("ft_hr", "sec_footer", L(C.footer.hours), [[13, 22, 0.4], [13, 22, 0.3]], B, MUTE, [{ x: 912, y: 144, w: 400, h: 44 }, { x: XS, y: 348, w: WS, h: 44 }]);
VBAR("ft_l", "sec_footer", { x: X0, y: 232, w: CW, h: 1 }, { x: XS, y: 420, w: WS, h: 1 });
t("ft_age", "sec_footer", C.footer.age, [[13, 22, 0.6], [13, 22, 0.4]], B, SMOKE, [{ x: X0, y: 256, w: CW, h: 22 }, { x: XS, y: 440, w: WS, h: 22 }], { align: "center" });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 1], [12, 20, 0.8]], A, MUTE, [{ x: X0, y: 292, w: CW, h: 20 }, { x: XS, y: 476, w: WS, h: 20 }], { align: "center" });

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_24", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_tonight", "sec_counter", "sec_menu", "sec_access"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚／品 ${Object.keys(shop.catalog.items).length}`);
