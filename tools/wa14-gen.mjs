#!/usr/bin/env node
// wa-14：templates/wa-14/SPEC.md の値から samples/<店> の assets.json・site.json を作る。店ごとの文言は samples/<店>/wa14.json。
// 写真は templates/wa-14/photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 使い方：node tools/wa14-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa14-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "lepivot";
const DIR = `samples/${ID}`, LIST = `templates/wa-14/photos-${ID}.txt`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa14.json`, "utf8"));
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
const BIG = 1.3;
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  if (x.big) { ps = [ps[0], ps[0] * BIG, ps[2]]; ss = [ss[0], ss[0] * BIG, ss[2]]; l = [{ ...l[0], y: Math.round(l[0].y - ps[0] * 0.15), h: Math.round(ps[1]) }, { ...l[1], y: Math.round(l[1].y - ss[0] * 0.15), h: Math.round(ss[1]) }]; }
  add(id, { type: "text", z: x.z ?? 3, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r((ps[2] ?? 0) / ps[0]), ...(x.align ? { align: x.align } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: lay({ ...l[0], size: ps[0] }, { ...l[1], size: ss[0] }) });
}
const sec = (id, name, color, pc, sp, more = {}) => { secs[id] = { name, background: { color }, minHeight: { pc, sp }, ...more }; };
const photo = (id, section, asset, z, pc, sp) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1 } });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });

const H = "font:heading", B = "font:body", A = "font:accent";
const IV = "#F4EEE6", WI = "#6B1E2B", INK = "#1A1617", MU = "#5C5257", MS = "#C89B3C", MT = "#D2A74A", SOFT = "#D9CFC2"; // MT：ワインレッドの上の文字用（案の #C89B3C は 4.45 で 4.5 に届かない）
const NAME = shop.basic.name, TEL = { kind: "shopPhone" }, ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
const XS = 24, WS = 342, X0 = 80;

// ---- ヘッダー
sec("sec_header", "ヘッダー", "theme:background", 76, 64);
t("hd_name", "sec_header", C.nameEn, [[30, 40, 0.5], [26, 36, 0.4]], A, INK, [{ x: 40, y: 18, w: 300, h: 40 }, { x: XS, y: 14, w: 240, h: 36 }], { link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: INK, font: B, spMenuBackground: "theme:primary" }, layout: lay({ x: 860, y: 18, w: 540, h: 40, size: 14 }, { x: 332, y: 10, w: 44, h: 44 }) });

// ---- 1 最初の画面（ワインレッド。大きな店名が写真に重なる）
sec("sec_firstv", "最初の画面", WI, 860, 868);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 740, y: 60, w: 600, h: 740 }, { x: 120, y: 120, w: 270, h: 420 });
t("fv_ja", "sec_firstv", C.kicker, [[26, 34, 1], [18, 26, 0.6]], A, MT, [{ x: X0 + 4, y: 70, w: 500, h: 34 }, { x: XS + 2, y: 30, w: WS, h: 26 }]);
t("fv_name", "sec_firstv", C.nameEn, [[200, 200, 0], [88, 88, 0]], A, IV, [{ x: X0, y: 140, w: 1100, h: 200 }, { x: XS, y: 76, w: WS, h: 88 }], { role: "heading", big: true });
t("fv_copy", "sec_firstv", L(C.fvCopy), [[40, 66, 2], [26, 42.9, 1.2]], H, IV, [{ x: X0, y: 400, w: 640, h: 132 }, { x: XS, y: 566, w: WS, h: 85 }], { role: "pageTitle" });
rect("fv_line", "sec_firstv", MS, 2, { x: X0, y: 620, w: 620, h: 1 }, { x: XS, y: 668, w: WS, h: 1 });
const factX = [X0, 280, 580], factW = [190, 290, 120];
C.facts.forEach(([k, v], i) => {
  t(`fv_k${i}`, "sec_firstv", k, [[13, 22, 1.2], [12, 22, 1]], B, MT, [{ x: factX[i], y: 644, w: factW[i], h: 22 }, { x: XS, y: 686 + i * 44, w: 72, h: 22 }], { weight: 500 });
  t(`fv_v${i}`, "sec_firstv", v, [[15, 26, 0.4], [14, 22, 0.3]], B, IV, [{ x: factX[i], y: 670, w: factW[i], h: 26 }, { x: 96, y: 686 + i * 44, w: 270, h: 22 }]);
});

// ---- 2 紹介（大きな見出し、三段組み、右に灯りの写真）
sec("sec_about", "紹介", "theme:background", 900, 990, { anchor: "about", nav: { label: C.nav[0][0], order: 1 } });
t("ab_en", "sec_about", C.aboutEn, [[200, 210, 0], [68, 72, 0]], A, WI, [{ x: X0, y: 60, w: 760, h: 210 }, { x: XS, y: 40, w: WS, h: 72 }], { role: "heading", big: true });
t("ab_ja", "sec_about", C.aboutJa, [[14, 22, 2], [13, 20, 1.8]], B, WI, [{ x: X0 + 4, y: 296, w: 400, h: 22 }, { x: XS, y: 122, w: WS, h: 20 }], { weight: 500 });
t("ab_h", "sec_about", L(C.aboutHead), [[34, 54, 1.5], [24, 38, 1]], H, INK, [{ x: X0, y: 322, w: 680, h: 108 }, { x: XS, y: 146, w: WS, h: 76 }], { role: "heading" });
C.aboutCols.forEach((v, i) => {
  const xP = X0 + i * 240, yS = [244, 328, 440][i];
  rect(`ab_l${i}`, "sec_about", MS, 2, { x: xP, y: 470, w: 220, h: 1 }, { x: XS, y: yS, w: WS, h: 1 });
  t(`ab_n${i}`, "sec_about", `N°${i + 1}`, [[18, 26, 0.5], [16, 24, 0.5]], A, WI, [{ x: xP, y: 484, w: 220, h: 26 }, { x: XS, y: yS + 14, w: 48, h: 24 }]);
  t(`ab_p${i}`, "sec_about", v, [[15, 28, 0.4], [15, 28, 0.3]], B, INK, [{ x: xP, y: 516, w: 220, h: 112 }, { x: 76, y: yS + 12, w: 290, h: i === 1 ? 84 : 56 }]);
});
C.seats.forEach(([n, l], i) => {
  t(`ab_sn${i}`, "sec_about", n, [[96, 100, 0], [56, 58.3, 0]], A, WI, [{ x: X0 + i * 240, y: 680, w: [60, 106][i], h: 100 }, { x: XS + i * 176, y: 500, w: [40, 64][i], h: 60 }], { big: true });
  t(`ab_sl${i}`, "sec_about", l, [[14, 22, 1.2], [13, 20, 1]], B, INK, [{ x: X0 + i * 240 + [66, 112][i], y: 740, w: 110, h: 22 }, { x: XS + i * 176 + [44, 68][i], y: 530, w: 92, h: 20 }], { weight: 500 });
});
photo("ab_ph", "sec_about", "ast_ab01", 1, { x: 860, y: 120, w: 500, h: 700 }, { x: XS, y: 590, w: WS, h: 340 });

// ---- 3 帯（夜の店内の全幅の写真に大きな語）
sec("sec_band", "夜の店内", INK, 560, 320);
photo("bd_ph", "sec_band", "ast_bd01", 1, { x: 0, y: 0, w: 1440, h: 560 }, { x: 0, y: 0, w: 390, h: 320 });
t("bd_en", "sec_band", C.bandEn, [[200, 210, 0], [84, 88, 0]], A, IV, [{ x: X0, y: 290, w: 1000, h: 210 }, { x: XS, y: 180, w: WS, h: 88 }], { big: true });
t("bd_ja", "sec_band", C.bandJa, [[18, 30, 2], [14, 23.3, 1]], H, IV, [{ x: X0 + 8, y: 228, w: 600, h: 30 }, { x: XS + 2, y: 282, w: WS, h: 24 }]);

// ---- 品のカード
const allIds = Object.keys(shop.catalog.items);
const cell = (path, fmt, pc, sp, opts) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: fmt } }] }], style: { font: opts.font || B, weight: opts.weight || 400, color: opts.color, lineHeight: r(opts.lh / opts.sz[0]), letterSpacing: r((opts.ls || 0) / opts.sz[0]), ...(opts.align ? { align: opts.align } : {}) }, layout: { pc: { ...pc, size: opts.sz[0] }, sp: { ...sp, size: opts.sz[1] } } });
const feature = (id, itemId, p, sect, pc, sp) => {
  const nameEls = {
    [`${p}_ph`]: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: pc.ph, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: sp.ph, ratio: "custom" } } },
    [`${p}_nm`]: cell("/name", "plain", { x: 0, y: pc.ph + 16, w: 72, h: 32 }, { x: 0, y: sp.ph + 12, w: 72, h: 48 }, { color: INK, lh: 32, weight: 400, font: H, sz: [21, 16] }),
    [`${p}_pr`]: cell("/prices", "priceAll", { x: 72, y: pc.ph + 14, w: 28, h: 36 }, { x: 72, y: sp.ph + 10, w: 28, h: 36 }, { color: WI, lh: 36, font: A, align: "right", sz: [28, 24] }) };
  add(id, { type: "repeater", z: 3, section: sect, source: { kind: "catalog", menuId: "mnu_food", pick: [itemId] }, display: { mode: "grid", columns: { pc: 1, sp: 1 }, gap: { pc: 0, sp: 0 }, photoless: "sameCard" }, card: { height: { pc: pc.h, sp: sp.h }, elements: nameEls }, layout: lay({ x: pc.x, y: pc.y, w: pc.w, h: pc.h }, { x: XS, y: sp.y, w: WS, h: sp.h }) });
};
const rowEls = (p, color, lnc) => ({
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 26, w: 64, h: 36 }, { x: 0, y: 18, w: 64, h: 36 }, { color, lh: 36, font: H, sz: [22, 16] }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: 64, y: 22, w: 36, h: 40 }, { x: 64, y: 16, w: 36, h: 36 }, { color: lnc, lh: 40, font: A, align: "right", sz: [28, 24] }) });
const rows = (id, sect, menu, pick, p, color, pc, sp, rowH) => add(id, { type: "repeater", z: 3, section: sect, source: { kind: "catalog", menuId: menu, pick }, display: { mode: "grid", columns: { pc: 1, sp: 1 }, gap: { pc: 0, sp: 0 }, photoless: "sameCard" }, card: { height: { pc: rowH.pc, sp: rowH.sp }, elements: rowEls(p, color, p === "r" ? MT : MS) }, layout: lay({ ...pc, h: rowH.pc * pick.length }, { ...sp, h: rowH.sp * pick.length }) });

// ---- 4 お料理（大きな見出しと、大きさの違う 3 枚）
sec("sec_plats", "お料理", "theme:background", 1240, 1360, { anchor: "plats", nav: { label: C.nav[1][0], order: 2 } });
t("pl_en", "sec_plats", C.platsEn, [[200, 210, 0], [68, 72, 0]], A, WI, [{ x: X0, y: 60, w: 680, h: 210 }, { x: XS, y: 40, w: WS, h: 72 }], { role: "heading", big: true });
t("pl_ja", "sec_plats", C.platsJa, [[14, 22, 2], [13, 20, 1.8]], B, WI, [{ x: X0 + 4, y: 296, w: 400, h: 22 }, { x: XS, y: 122, w: WS, h: 20 }], { weight: 500 });
feature("pl_a", "itm_m001", "a", "sec_plats", { x: X0, y: 340, w: 620, h: 790, ph: 720 }, { y: 152, h: 464, ph: 400 });
feature("pl_b", "itm_m005", "b", "sec_plats", { x: 800, y: 120, w: 560, h: 450, ph: 378 }, { y: 636, h: 292, ph: 228 });
feature("pl_c", "itm_m004", "c", "sec_plats", { x: 860, y: 640, w: 500, h: 410, ph: 340 }, { y: 948, h: 292, ph: 228 });
t("pl_note", "sec_plats", C.note, [[13, 22, 0.4], [12, 20, 0.3]], B, MU, [{ x: X0, y: 1160, w: 620, h: 22 }, { x: XS, y: 1270, w: WS, h: 20 }]);

// ---- 5 ほかの品（ワインレッドの面に、写真と行）
sec("sec_carte", "ほかの品", WI, 760, 860);
photo("ca_ph", "sec_carte", "ast_st01", 1, { x: X0, y: 80, w: 520, h: 600 }, { x: XS, y: 420, w: WS, h: 400 });
t("ca_en", "sec_carte", C.carteEn, [[120, 130, 0], [60, 65, 0]], A, IV, [{ x: 680, y: 80, w: 680, h: 130 }, { x: XS, y: 40, w: WS, h: 65 }], { role: "heading", big: true });
t("ca_ja", "sec_carte", C.carteJa, [[15, 24, 1.2], [13, 20.8, 0.8]], B, MT, [{ x: 684, y: 220, w: 640, h: 24 }, { x: XS, y: 112, w: WS, h: 22 }], { weight: 500 });
rows("ca_rows", "sec_carte", "mnu_food", ["itm_m002", "itm_m003", "itm_m006"], "r", IV, { x: 680, y: 290, w: 680 }, { x: XS, y: 152, w: WS }, { pc: 96, sp: 72 });

// ---- 6 ワイン（黒の面。右に全高の写真、見出しが重なる）
sec("sec_wine", "ワイン", INK, 760, 800, { anchor: "vin", nav: { label: C.nav[2][0], order: 3 } });
photo("vn_ph", "sec_wine", "ast_wn01", 1, { x: 600, y: 0, w: 840, h: 760 }, { x: 0, y: 0, w: 390, h: 380 });
t("vn_en", "sec_wine", C.vinEn, [[200, 200, 10], [96, 96, 2]], A, IV, [{ x: X0, y: 160, w: 1000, h: 200 }, { x: XS, y: 330, w: WS, h: 96 }], { role: "heading", big: true });
t("vn_ja", "sec_wine", C.vinJa, [[14, 22, 2], [13, 20, 1.8]], B, MS, [{ x: X0 + 8, y: 410, w: 400, h: 22 }, { x: XS, y: 444, w: WS, h: 20 }], { weight: 500 });
t("vn_p", "sec_wine", C.vinBody, [[16, 30, 0.5], [15, 28, 0.4]], B, IV, [{ x: X0 + 8, y: 444, w: 440, h: 60 }, { x: XS, y: 470, w: WS, h: 56 }]);
rows("vn_rows", "sec_wine", "mnu_wine", ["itm_m007", "itm_m008"], "w", IV, { x: X0 + 8, y: 524, w: 440 }, { x: XS, y: 532, w: WS }, { pc: 84, sp: 72 });
t("vn_note", "sec_wine", C.note, [[13, 22, 0.4], [12, 20, 0.3]], B, IV, [{ x: X0 + 8, y: 700, w: 440, h: 22 }, { x: XS, y: 690, w: WS, h: 20 }]);

// ---- 7 ご案内と地図
sec("sec_info", "ご案内", "theme:background", 760, 1000, { anchor: "acces", nav: { label: C.nav[3][0], order: 4 } });
t("in_en", "sec_info", C.infoEn, [[180, 190, 0], [68, 72, 0]], A, WI, [{ x: X0, y: 50, w: 600, h: 190 }, { x: XS, y: 40, w: WS, h: 72 }], { role: "heading", big: true });
t("in_ja", "sec_info", C.infoJa, [[14, 22, 2], [13, 20, 1.8]], B, WI, [{ x: X0 + 4, y: 262, w: 400, h: 22 }, { x: XS, y: 122, w: WS, h: 20 }], { weight: 500 });
C.infoRows.forEach(([k, v], i) => {
  const yP = 290 + 60 * i, yS = 150 + 66 * i;
  rect(`in_l${i}`, "sec_info", SOFT, 2, { x: X0, y: yP, w: 580, h: 1 }, { x: XS, y: yS, w: WS, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[13, 24, 1.2], [12, 20, 1.1]], B, WI, [{ x: X0, y: yP + 18, w: 110, h: 24 }, { x: XS, y: yS + 7, w: WS, h: 22 }], { weight: 500 });
  t(`in_v${i}`, "sec_info", v, [[16, 26, 0.3], [15, 26, 0.3]], B, INK, [{ x: X0 + 120, y: yP + 17, w: 460, h: 26 }, { x: XS, y: yS + 31, w: WS, h: 26 }], k === "お電話" ? { link: TEL } : {});
});
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDR} ${NAME}`)}`, newTab: true };
const btn = (id, label, link, pc, sp, fill) => {
  rect(`${id}_b`, "sec_info", fill, 2, pc, sp, { link });
  t(`${id}_t`, "sec_info", label, [[14, 24, 1.2], [14, 24, 1]], B, IV, [{ ...pc, y: pc.y + 16, h: 24 }, { ...sp, y: sp.y + 13, h: 24 }], { align: "center", link, z: 4, weight: 500 });
};
btn("in_tel", C.telLabel, TEL, { x: X0, y: 620, w: 280, h: 56 }, { x: XS, y: 488, w: 164, h: 50 }, WI);
btn("in_map", C.mapLabel, LINKM, { x: X0 + 300, y: 620, w: 280, h: 56 }, { x: 202, y: 488, w: 164, h: 50 }, INK);
add("in_mapbox", { type: "shape", z: 2, kind: "rect", fill: SOFT, section: "sec_info", layout: lay({ x: 740, y: 90, w: 620, h: 586 }, { x: XS, y: 570, w: WS, h: 390 }) });

// ---- フッター（黒）
sec("sec_footer", "フッター", INK, 320, 596);
t("ft_name", "sec_footer", C.nameEn, [[36, 44, 0.5], [32, 40, 0.5]], A, IV, [{ x: X0, y: 62, w: 400, h: 44 }, { x: XS, y: 44, w: WS, h: 40 }]);
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 26, 0.3], [14, 26, 0.3]], B, IV, [{ x: X0, y: 114, w: 400, h: 26 }, { x: XS, y: 88, w: WS, h: 26 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[14, 30, 0.3], [15, 30, 0.3]], B, IV, [{ x: 600, y: 60 + 30 * i, w: 200, h: 30 }, { x: XS, y: 132 + 32 * i, w: WS, h: 32 }], { link: go(a) }));
t("ft_hk", "sec_footer", "営業時間", [[13, 22, 1.2], [12, 20, 1.1]], B, MS, [{ x: 860, y: 64, w: 420, h: 22 }, { x: XS, y: 280, w: WS, h: 20 }]);
t("ft_hv", "sec_footer", L(C.footHours), [[14, 26, 0.3], [14, 26, 0.3]], B, IV, [{ x: 860, y: 90, w: 420, h: 78 }, { x: XS, y: 304, w: WS, h: 78 }]);
t("ft_tk", "sec_footer", "お電話", [[13, 22, 1.2], [12, 20, 1.1]], B, MS, [{ x: 860, y: 180, w: 200, h: 22 }, { x: XS, y: 396, w: WS, h: 20 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[22, 30, 0.4], [22, 30, 0.4]], A, IV, [{ x: 860, y: 206, w: 260, h: 30 }, { x: XS, y: 420, w: WS, h: 30 }], { link: TEL });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], A, IV, [{ x: X0, y: 256, w: 500, h: 20 }, { x: XS, y: 524, w: WS, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_14", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_band", "sec_plats", "sec_carte", "sec_wine", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚／品 ${allIds.length}`);
