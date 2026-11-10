#!/usr/bin/env node
// wa-16：templates/wa-16/SPEC.md の値から samples/<店> の assets.json・site.json を作る。店ごとの文言は samples/<店>/wa16.json。
// 写真は templates/wa-16/photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 使い方：node tools/wa16-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa16-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "kunugi";
const DIR = `samples/${ID}`, LIST = `templates/wa-16/photos-${ID}.txt`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa16.json`, "utf8"));
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

const H = "font:heading", B = "font:body";
// 色（SPEC 3章）。蕎麦色 #8A7A5E は地の上で 3.61 なので線だけに使い、文字は MU（5.22）にする
const BG = "#F2EEE6", SURF = "#F8F5EF", PALE = "#EAE4D9", INK = "#222222", SOBA = "#8A7A5E", MU = "#6F6148", AI = "#2D3E50", FMU = "#D4C6A6";
const TEL = { kind: "shopPhone" }, ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
const X0 = 120, XS = 24, WS = 342;
const KICK = [[14, 24, 4.2], [13, 22, 3.2]]; // 小見出し（字間 0.3em／0.25em）

// ---- ヘッダー（生成りの帯）
sec("sec_header", "ヘッダー", "theme:background", 80, 64);
t("hd_name", "sec_header", C.name, [[24, 40, 2], [20, 36, 1.4]], H, INK, [{ x: X0, y: 20, w: 360, h: 40 }, { x: XS, y: 14, w: 260, h: 36 }], { link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: INK, font: B, spMenuBackground: "theme:primary" }, layout: lay({ x: 740, y: 20, w: 580, h: 40, size: 14 }, { x: 332, y: 10, w: 44, h: 44 }) });

// ---- 1 最初の画面（左に店名とコピー、右に大きな写真）
sec("sec_firstv", "最初の画面", "theme:background", 800, 840);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 600, y: 20, w: 720, h: 700 }, { x: XS, y: 8, w: WS, h: 380 });
t("fv_kick", "sec_firstv", C.kicker, KICK.map(([a, b, c]) => [a + 1, b, c]), B, MU, [{ x: X0, y: 140, w: 300, h: 24 }, { x: XS, y: 414, w: WS, h: 22 }], { weight: 400 });
t("fv_name", "sec_firstv", C.nameShort, [[120, 174, 6], [64, 90, 3]], H, INK, [{ x: X0 - 6, y: 170, w: 440, h: 174 }, { x: XS - 3, y: 442, w: WS, h: 90 }], { role: "heading" });
t("fv_copy", "sec_firstv", L(C.fvCopy), [[32, 56, 3], [24, 42, 2]], H, INK, [{ x: X0, y: 362, w: 440, h: 112 }, { x: XS, y: 540, w: WS, h: 84 }], { role: "pageTitle" });
rect("fv_line", "sec_firstv", SOBA, 2, { x: X0, y: 520, w: 420, h: 1 }, { x: XS, y: 640, w: WS, h: 1 });
C.facts.forEach(([k, v], i) => {
  t(`fv_k${i}`, "sec_firstv", k, [[13, 26, 1.3], [12, 24, 1]], B, MU, [{ x: X0, y: 546 + i * 40, w: 64, h: 26 }, { x: XS, y: 662 + i * 40, w: 48, h: 24 }]);
  t(`fv_v${i}`, "sec_firstv", v, [[15, 26, 0.6], [13, 24, 0.3]], B, INK, [{ x: 196, y: 546 + i * 40, w: 380, h: 26 }, { x: 76, y: 662 + i * 40, w: 290, h: 24 }]);
});

// ---- 2 蕎麦のこと（左に蕎麦の実、右に見出し・文・席数）
sec("sec_about", "蕎麦のこと", "theme:background", 820, 1000, { anchor: "about", nav: { label: C.nav[0][0], order: 1 } });
photo("ab_ph", "sec_about", "ast_ab01", 1, { x: X0, y: 100, w: 480, h: 580 }, { x: XS, y: 520, w: WS, h: 420 });
t("ab_kick", "sec_about", C.aboutKicker, KICK, B, MU, [{ x: 700, y: 140, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("ab_h", "sec_about", L(C.aboutHead), [[40, 64, 3], [28, 46, 2]], H, INK, [{ x: 700, y: 180, w: 560, h: 128 }, { x: XS, y: 88, w: WS, h: 92 }], { role: "heading" });
t("ab_p", "sec_about", C.aboutBody, [[16, 32, 0.8], [15, 30, 0.5]], B, INK, [{ x: 700, y: 340, w: 500, h: 128 }, { x: XS, y: 200, w: WS, h: 150 }]);
rect("ab_line", "sec_about", SOBA, 2, { x: 700, y: 512, w: 500, h: 1 }, { x: XS, y: 372, w: WS, h: 1 });
C.seats.forEach(([n, l], i) => {
  t(`ab_sn${i}`, "sec_about", n, [[64, 88, 0], [52, 72, 0]], H, AI, [{ x: 700 + i * 180, y: 530, w: [48, 90][i], h: 88 }, { x: XS + i * 150, y: 386, w: [40, 72][i], h: 72 }]);
  t(`ab_sl${i}`, "sec_about", l, [[13, 22, 1.3], [12, 20, 1]], B, MU, [{ x: 700 + i * 180, y: 630, w: 150, h: 22 }, { x: XS + i * 150, y: 466, w: 120, h: 20 }]);
});

// ---- 3 三つの手仕事（この店の見せ場。PC・タブレットは横に三つ、スマホは三段）
sec("sec_steps", "三つの手仕事", SURF, 1140, 1080, { anchor: "steps", nav: { label: C.nav[1][0], order: 2 } });
t("st_kick", "sec_steps", C.stepsKicker, KICK, B, MU, [{ x: X0, y: 110, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("st_h", "sec_steps", C.stepsHead, [[44, 64, 4], [28, 44, 2]], H, INK, [{ x: X0, y: 146, w: 800, h: 64 }, { x: XS, y: 86, w: WS, h: 44 }], { role: "heading" });
t("st_lead", "sec_steps", C.stepsLead, [[16, 30, 0.8], [14, 26, 0.4]], B, INK, [{ x: X0, y: 226, w: 800, h: 30 }, { x: XS, y: 140, w: WS, h: 52 }]);
C.steps.forEach(([n, v, p], i) => {
  const x = X0 + i * 408, yS = 220 + i * 270;
  t(`st_n${i}`, "sec_steps", n, [[28, 40, 0], [22, 32, 0]], H, MU, [{ x, y: 306, w: 40, h: 40 }, { x: 180, y: yS, w: 40, h: 32 }]);
  rect(`st_l${i}`, "sec_steps", SOBA, 2, { x: x + 52, y: 326, w: 332, h: 1 }, { x: XS, y: yS + 226, w: WS, h: 1 });
  photo(`st_ph${i}`, "sec_steps", `ast_s${i + 1}01`, 1, { x, y: 370, w: 384, h: 480 }, { x: XS, y: yS, w: 140, h: 200 });
  t(`st_v${i}`, "sec_steps", v, [[48, 64, 4], [34, 46, 2]], H, INK, [{ x, y: 878, w: 384, h: 64 }, { x: 180, y: yS + 36, w: 186, h: 46 }], { role: "heading" });
  t(`st_p${i}`, "sec_steps", p, [[15, 28, 0.6], [14, 26, 0.3]], B, INK, [{ x, y: 956, w: 384, h: 84 }, { x: 180, y: yS + 92, w: 186, h: 130 }]);
});

// ---- 品のカード（写真つきは格子、写真なしは行）
const cell = (path, fmt, pc, sp, o) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: fmt } }] }], style: { font: o.font || B, weight: 400, color: o.color, lineHeight: r(o.lh / o.sz[0]), letterSpacing: r((o.ls || 0) / o.sz[0]), ...(o.align ? { align: o.align } : {}) }, layout: { pc: { ...pc, size: o.sz[0] }, sp: { ...sp, size: o.sz[1] } } });
const cardEls = (p, ph, sp = { pc: 74, sp: 66 }, nh = { pc: 36, sp: 64 }) => ({
  [`${p}_ph`]: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: ph.pc, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: ph.sp, ratio: "custom" } } },
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: ph.pc + 18, w: sp.pc, h: nh.pc }, { x: 0, y: ph.sp + 12, w: sp.sp, h: nh.sp }, { color: INK, lh: 36, font: H, sz: [22, 18], ls: 1.5 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: sp.pc, y: ph.pc + 20, w: 100 - sp.pc, h: 32 }, { x: sp.sp, y: ph.sp + 14, w: 100 - sp.sp, h: 28 }, { color: INK, lh: 32, sz: [17, 15], align: "right", ls: 0.5 }) });
const rowEls = (p, color = INK) => ({
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 20, w: 70, h: 32 }, { x: 0, y: 16, w: 66, h: 32 }, { color, lh: 32, font: H, sz: [20, 17], ls: 1.2 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: 70, y: 21, w: 30, h: 30 }, { x: 66, y: 17, w: 34, h: 30 }, { color, lh: 30, sz: [16, 15], align: "right", ls: 0.5 }) });
const rep = (id, sect, menu, pick, els_, cols, gap, cardH, pc, sp) => add(id, { type: "repeater", z: 3, section: sect, source: { kind: "catalog", menuId: menu, pick }, display: { mode: "grid", columns: cols, gap, photoless: "sameCard" }, card: { height: cardH, elements: els_ }, layout: lay(pc, sp) });

// ---- 4 お品書き（写真つき 4 品を 2 列の格子、写真なしの蕎麦を行で）
sec("sec_menu", "お品書き", "theme:background", 1530, 1780, { anchor: "menu", nav: { label: C.nav[2][0], order: 3 } });
t("mn_kick", "sec_menu", C.menuKicker, KICK, B, MU, [{ x: X0, y: 110, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("mn_h", "sec_menu", C.menuHead, [[40, 60, 3], [24, 40, 1.2]], H, INK, [{ x: X0, y: 146, w: 900, h: 60 }, { x: XS, y: 86, w: WS, h: 40 }], { role: "heading" });
rep("mn_cards", "sec_menu", "mnu_soba", ["itm_m001", "itm_m005", "itm_m003", "itm_m006"], cardEls("c", { pc: 400, sp: 228 }), { pc: 2, sp: 1 }, { pc: 24, sp: 24 }, { pc: 504, sp: 320 },
  { x: X0, y: 250, w: 1200, h: 1032 }, { x: XS, y: 150, w: WS, h: 1352 });
t("mn_more", "sec_menu", C.menuMore, KICK, B, MU, [{ x: X0, y: 1318, w: 400, h: 24 }, { x: XS, y: 1530, w: WS, h: 22 }]);
rep("mn_rows", "sec_menu", "mnu_soba", ["itm_m002", "itm_m004"], rowEls("r"), { pc: 2, sp: 1 }, { pc: 24, sp: 0 }, { pc: 72, sp: 64 },
  { x: X0, y: 1350, w: 1200, h: 72 }, { x: XS, y: 1560, w: WS, h: 128 });
t("mn_note", "sec_menu", C.note, [[13, 22, 0.6], [12, 20, 0.4]], B, MU, [{ x: X0, y: 1446, w: 600, h: 22 }, { x: XS, y: 1710, w: WS, h: 20 }]);

// ---- 5 一品と酒（淡い蕎麦殻色の面。左に酒の写真、右に行）
sec("sec_ippin", "一品と酒", PALE, 780, 960);
rep("ip_sake", "sec_ippin", "mnu_ippin", ["itm_m010"], cardEls("k", { pc: 500, sp: 330 }, { pc: 50, sp: 50 }, { pc: 36, sp: 32 }), { pc: 1, sp: 1 }, { pc: 0, sp: 0 }, { pc: 570, sp: 390 },
  { x: X0, y: 100, w: 480, h: 570 }, { x: XS, y: 500, w: WS, h: 390 });
t("ip_kick", "sec_ippin", C.ippinKicker, KICK, B, MU, [{ x: 700, y: 130, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }]);
t("ip_h", "sec_ippin", L(C.ippinHead), [[36, 58, 2.5], [24, 40, 1.2]], H, INK, [{ x: 700, y: 166, w: 560, h: 116 }, { x: XS, y: 86, w: WS, h: 80 }], { role: "heading" });
t("ip_p", "sec_ippin", C.ippinBody, [[15, 28, 0.6], [14, 26, 0.3]], B, INK, [{ x: 700, y: 306, w: 560, h: 28 }, { x: XS, y: 180, w: WS, h: 52 }]);
rep("ip_rows", "sec_ippin", "mnu_ippin", ["itm_m007", "itm_m008", "itm_m009"], rowEls("i"), { pc: 1, sp: 1 }, { pc: 0, sp: 0 }, { pc: 72, sp: 64 },
  { x: 700, y: 370, w: 560, h: 216 }, { x: XS, y: 250, w: WS, h: 192 });

// ---- 6 ご案内と地図
sec("sec_info", "ご案内", "theme:background", 800, 1080, { anchor: "info", nav: { label: C.nav[3][0], order: 4 } });
t("in_h", "sec_info", C.infoHead, [[44, 64, 4], [30, 54, 3]], H, INK, [{ x: X0, y: 100, w: 400, h: 64 }, { x: XS, y: 50, w: WS, h: 54 }], { role: "heading" });
let yP = 196, yS = 124;
C.infoRows.forEach(([k, v], i) => {
  const two = Array.isArray(v) && typeof v[0] === "string" && v[0].includes(" "), hP = two ? 92 : 64, hS = two ? 108 : 76;
  rect(`in_l${i}`, "sec_info", "#D8D0C1", 2, { x: X0, y: yP, w: 560, h: 1 }, { x: XS, y: yS, w: WS, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[13, 26, 1.3], [12, 22, 1]], B, MU, [{ x: X0, y: yP + 19, w: 110, h: 26 }, { x: XS, y: yS + 12, w: WS, h: 22 }]);
  t(`in_v${i}`, "sec_info", two ? L(v) : v, [[16, 28, 0.5], [14, 26, 0.2]], B, INK, [{ x: X0 + 120, y: yP + 18, w: 440, h: two ? 56 : 28 }, { x: XS, y: yS + 38, w: WS, h: two ? 52 : 26 }], k === "お電話" ? { link: TEL } : {});
  yP += hP; yS += hS;
});
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDR} ${shop.basic.name}`)}`, newTab: true };
const btn = (id, label, link, pc, sp, fill, color) => {
  rect(`${id}_b`, "sec_info", fill, 2, pc, sp, { link });
  t(`${id}_t`, "sec_info", label, [[15, 24, 1.5], [14, 24, 1]], B, color, [{ ...pc, y: pc.y + 16, h: 24 }, { ...sp, y: sp.y + 14, h: 24 }], { align: "center", link, z: 4 });
};
btn("in_tel", C.telLabel, TEL, { x: X0, y: yP + 40, w: 260, h: 56 }, { x: XS, y: yS + 32, w: 165, h: 52 }, AI, BG);
btn("in_map", C.mapLabel, LINKM, { x: X0 + 284, y: yP + 40, w: 260, h: 56 }, { x: 201, y: yS + 32, w: 165, h: 52 }, BG, AI);
add("in_mapbox", { type: "shape", z: 2, kind: "rect", fill: "#D8D0C1", section: "sec_info", layout: lay({ x: 740, y: 100, w: 580, h: 600 }, { x: XS, y: yS + 120, w: WS, h: 360 }) });

// ---- フッター（藍）
sec("sec_footer", "フッター", AI, 340, 600);
t("ft_name", "sec_footer", C.name, [[26, 44, 2], [24, 46, 1.6]], H, BG, [{ x: X0, y: 60, w: 420, h: 44 }, { x: XS, y: 40, w: WS, h: 46 }]);
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 26, 0.5], [14, 26, 0.5]], B, BG, [{ x: X0, y: 112, w: 420, h: 26 }, { x: XS, y: 92, w: WS, h: 26 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[14, 30, 0.6], [15, 30, 0.5]], B, BG, [{ x: 620, y: 60 + 32 * i, w: 220, h: 30 }, { x: XS, y: 136 + 32 * i, w: WS, h: 30 }], { link: go(a) }));
t("ft_hk", "sec_footer", "営業時間", [[13, 22, 1.3], [12, 20, 1]], B, FMU, [{ x: 900, y: 64, w: 420, h: 22 }, { x: XS, y: 284, w: WS, h: 20 }]);
t("ft_hv", "sec_footer", L(C.footHours), [[14, 26, 0.5], [14, 26, 0.5]], B, BG, [{ x: 900, y: 90, w: 420, h: 78 }, { x: XS, y: 308, w: WS, h: 78 }]);
t("ft_tk", "sec_footer", "お電話", [[13, 22, 1.3], [12, 20, 1]], B, FMU, [{ x: 900, y: 186, w: 200, h: 22 }, { x: XS, y: 402, w: WS, h: 20 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[22, 32, 1], [22, 32, 1]], B, BG, [{ x: 900, y: 212, w: 260, h: 32 }, { x: XS, y: 426, w: WS, h: 32 }], { link: TEL });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], B, FMU, [{ x: X0, y: 282, w: 500, h: 20 }, { x: XS, y: 530, w: WS, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_16", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_steps", "sec_menu", "sec_ippin", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚／品 ${Object.keys(shop.catalog.items).length}`);
