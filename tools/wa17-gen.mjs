#!/usr/bin/env node
// wa-17：templates/wa-17/SPEC.md の値から samples/<店> の assets.json・site.json を作る。店ごとの文言は samples/<店>/wa17.json。
// 写真は templates/wa-17/photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 使い方：node tools/wa17-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa17-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "uchide";
const DIR = `samples/${ID}`, LIST = `templates/wa-17/photos-${ID}.txt`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa17.json`, "utf8"));
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
// 色（SPEC 3章）。からし黄は生成りの上で 1.72 なので、黒い面の上の文字・ボタンの塗り・線だけに使う
const BG = "#F4EFE6", PALE = "#EAE1D0", INK = "#262626", SAUCE = "#5A3420", MUST = "#E2B23A", MU = "#6B5B4B", DMU = "#C9BFAF", SOFT = "#D9CFBE";
const TEL = { kind: "shopPhone" }, ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
const X0 = 120, XS = 28, WS = 334;
const KICK = [[14, 24, 4.2], [13, 22, 3.2]]; // 小見出し（字間 0.3em／0.25em）
const nav = (i) => ({ anchor: C.nav[i][1], nav: { label: C.nav[i][0], order: i + 1 } });

// ---- ヘッダー（鉄の黒の帯）
sec("sec_header", "ヘッダー", INK, 80, 64);
t("hd_name", "sec_header", C.name, [[20, 36, 1.6], [16, 32, 1]], H, BG, [{ x: X0, y: 22, w: 400, h: 36 }, { x: XS, y: 16, w: 260, h: 32 }], { link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: BG, font: B, spMenuBackground: INK }, layout: lay({ x: 740, y: 20, w: 580, h: 40, size: 14 }, { x: 318, y: 10, w: 44, h: 44 }) });

// ---- 1 最初の画面（鉄の黒。左に店名とコピーと営業、右に鉄板の写真）
sec("sec_firstv", "最初の画面", INK, 740, 770);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 640, y: 60, w: 680, h: 560 }, { x: XS, y: 12, w: WS, h: 300 });
t("fv_kick", "sec_firstv", C.kicker, [[15, 24, 4.5], [13, 22, 3.2]], B, MUST, [{ x: X0, y: 110, w: 440, h: 24 }, { x: XS, y: 340, w: WS, h: 22 }], { weight: 500 });
t("fv_name", "sec_firstv", C.nameShort, [[128, 186, 6], [72, 104, 3]], H, BG, [{ x: X0 - 6, y: 142, w: 500, h: 186 }, { x: XS - 3, y: 368, w: WS, h: 104 }], { role: "heading" });
t("fv_copy", "sec_firstv", L(C.fvCopy), [[34, 58, 3], [24, 40, 2]], H, BG, [{ x: X0, y: 342, w: 480, h: 116 }, { x: XS, y: 482, w: WS, h: 80 }], { role: "pageTitle" });
rect("fv_line", "sec_firstv", MUST, 2, { x: X0, y: 498, w: 460, h: 2 }, { x: XS, y: 582, w: WS, h: 2 });
C.facts.forEach(([k, v, f], i) => {
  t(`fv_k${i}`, "sec_firstv", k, [[14, 30, 1.4], [13, 28, 1]], B, DMU, [{ x: X0, y: 522 + i * 44, w: 80, h: 30 }, { x: XS, y: 602 + i * 40, w: 60, h: 28 }]);
  t(`fv_v${i}`, "sec_firstv", v, f === "a" ? [[20, 30, 0.6], [14, 28, 0.3]] : [[16, 30, 1], [14, 28, 0.6]], f === "a" ? A : B, BG, [{ x: 210, y: 522 + i * 44, w: 400, h: 30 }, { x: 96, y: 602 + i * 40, w: 266, h: 28 }]);
});

// ---- 品のカードの部品
const cell = (path, fmt, pc, sp, o) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: fmt } }] }], style: { font: o.font || B, weight: o.weight || 400, color: o.color, lineHeight: r(o.lh[0] / o.sz[0]), letterSpacing: r((o.ls || 0) / o.sz[0]), ...(o.align ? { align: o.align } : {}) }, layout: { pc: { ...pc, size: o.sz[0] }, sp: { ...sp, size: o.sz[1] } } });
const rep = (id, sect, menu, pick, els_, cols, gap, cardH, pc, sp) => add(id, { type: "repeater", z: 3, section: sect, source: { kind: "catalog", menuId: menu, pick }, display: { mode: "grid", columns: cols, gap, photoless: "sameCard" }, card: { height: cardH, elements: els_ }, layout: lay(pc, sp) });
const menuOf = (item) => Object.values(shop.catalog.placements).find((p) => p.itemId === item).menuId;
const itemsOf = (menu) => Object.values(shop.catalog.placements).filter((p) => p.menuId === menu).sort((a, b) => a.order - b.order).map((p) => p.itemId);
// 看板の品：写真・品名・値段・説明（ph＝写真の高さ、big＝大きいカード）
const sigEls = (p, ph, big) => {
  const ny = { pc: ph.pc + (big ? 26 : 18), sp: ph.sp + 14 }, nsz = big ? [30, 20] : [22, 20], nlh = big ? [44, 32] : [34, 32];
  return {
    [`${p}_ph`]: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: ph.pc, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: ph.sp, ratio: "custom" } } },
    [`${p}_nm`]: cell("/name", "plain", { x: 0, y: ny.pc, w: 72, h: nlh[0] }, { x: 0, y: ny.sp, w: 70, h: nlh[1] }, { color: INK, lh: nlh, font: H, sz: nsz, ls: 1.5 }),
    [`${p}_pr`]: cell("/prices", "priceAll", { x: 72, y: ny.pc + (big ? 6 : 2), w: 28, h: 32 }, { x: 70, y: ny.sp + 2, w: 30, h: 28 }, { color: SAUCE, lh: [32, 28], sz: big ? [22, 17] : [18, 17], align: "right", weight: 700, ls: 0.5 }),
    [`${p}_ds`]: cell("/description", "plain", { x: 0, y: ny.pc + nlh[0] + 12, w: big ? 84 : 100, h: big ? 60 : 56 }, { x: 0, y: ny.sp + nlh[1] + 10, w: 100, h: 78 }, { color: MU, lh: big ? [30, 26] : [28, 26], sz: big ? [16, 14] : [14, 14], ls: 0.4 }) };
};
const rowEls = (p) => ({
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 14, w: 70, h: 30 }, { x: 0, y: 13, w: 68, h: 30 }, { color: INK, lh: [30, 30], font: H, sz: [18, 16], ls: 1 }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: 70, y: 15, w: 30, h: 28 }, { x: 68, y: 14, w: 32, h: 28 }, { color: SAUCE, lh: [28, 28], sz: [16, 15], align: "right", weight: 700, ls: 0.5 }) });

// ---- 2 看板の三品（この店の見せ場その一。左に大きいカード 1 枚、右に 2 枚を上下に）
sec("sec_signature", "看板の三品", "theme:background", 1170, 1450, nav(0));
t("sg_kick", "sec_signature", C.sigKicker, KICK, B, SAUCE, [{ x: X0, y: 110, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }], { weight: 500 });
t("sg_h", "sec_signature", L(C.sigHead), [[40, 60, 3], [26, 40, 1.6]], H, INK, [{ x: X0, y: 144, w: 1000, h: 120 }, { x: XS, y: 86, w: WS, h: 80 }], { role: "heading" });
const SG = [
  { pc: { x: X0, y: 310, w: 700, h: 760 }, sp: { x: XS, y: 190, w: WS, h: 380 }, ph: { pc: 600, sp: 240 }, big: true },
  { pc: { x: 860, y: 310, w: 460, h: 370 }, sp: { x: XS, y: 600, w: WS, h: 380 }, ph: { pc: 240, sp: 240 } },
  { pc: { x: 860, y: 700, w: 460, h: 370 }, sp: { x: XS, y: 1010, w: WS, h: 380 }, ph: { pc: 240, sp: 240 } }];
C.sigPick.forEach((id, i) => {
  const g = SG[i];
  rep(`sg_c${i}`, "sec_signature", menuOf(id), [id], sigEls(`g${i}`, g.ph, g.big), { pc: 1, sp: 1 }, { pc: 0, sp: 0 }, { pc: g.pc.h, sp: g.sp.h }, g.pc, g.sp);
  rect(`sg_tg${i}`, "sec_signature", INK, 4, { x: g.pc.x, y: g.pc.y, w: 72, h: 56 }, { x: g.sp.x, y: g.sp.y, w: 60, h: 46 });
  t(`sg_n${i}`, "sec_signature", `0${i + 1}`, [[22, 32, 1], [18, 26, 1]], A, MUST, [{ x: g.pc.x, y: g.pc.y + 12, w: 72, h: 32 }, { x: g.sp.x, y: g.sp.y + 10, w: 60, h: 26 }], { align: "center", z: 5 });
});

// ---- 3 お品書き（この店の見せ場その二。鉄の黒の面に、粉もん・鉄板焼き・お飲みものの大きなカード）
sec("sec_menu", "お品書き", INK, 1300, 1832, nav(1));
t("mn_kick", "sec_menu", C.menuKicker, KICK, B, MUST, [{ x: X0, y: 110, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }], { weight: 500 });
t("mn_h", "sec_menu", L(C.menuHead), [[40, 60, 3], [26, 40, 1.6]], H, BG, [{ x: X0, y: 144, w: 1000, h: 120 }, { x: XS, y: 86, w: WS, h: 80 }], { role: "heading" });
// カードの枠（PC：左に粉もん、右に鉄板焼きとお飲みものを上下に。SP：縦に三枚）
const CP = [{ x: X0, y: 310, w: 588, h: 850, ph: 300 }, { x: 732, y: 310, w: 588, h: 413, ph: 150 }, { x: 732, y: 747, w: 588, h: 413, ph: 150 }];
const CS = [{ y: 190, h: 686, ph: 180 }, { y: 896, h: 432, ph: 150 }, { y: 1348, h: 376, ph: 150 }];
C.cards.forEach((c, i) => {
  const p = CP[i], s = CS[i], n = itemsOf(c.menu).length, rowP = i ? 56 : 60, rowS = 56;
  const px = p.x + 32, pw = p.w - 64, sx = XS + 20, sw = WS - 40;
  rect(`mc_bg${i}`, "sec_menu", BG, 1, { x: p.x, y: p.y, w: p.w, h: p.h }, { x: XS, y: s.y, w: WS, h: s.h });
  photo(`mc_ph${i}`, "sec_menu", c.photo, 2, { x: p.x, y: p.y, w: p.w, h: p.ph }, { x: XS, y: s.y, w: WS, h: s.ph });
  const yP = p.y + p.ph + 20, yS = s.y + s.ph + 20;
  t(`mc_en${i}`, "sec_menu", c.en, [[13, 22, 2.6], [12, 20, 2.4]], A, SAUCE, [{ x: px, y: yP, w: pw, h: 22 }, { x: sx, y: yS, w: sw, h: 20 }]);
  t(`mc_t${i}`, "sec_menu", c.title, [[i ? 30 : 34, i ? 44 : 48, 2], [28, 40, 1.6]], H, INK, [{ x: px, y: yP + 24, w: pw, h: i ? 44 : 48 }, { x: sx, y: yS + 22, w: sw, h: 40 }], { role: "heading" });
  const dP = yP + 24 + (i ? 48 : 54), dS = yS + 66;
  t(`mc_d${i}`, "sec_menu", c.desc, [[14, 26, 0.4], [13, 24, 0.3]], B, MU, [{ x: px, y: dP, w: pw, h: 26 }, { x: sx, y: dS, w: sw, h: 48 }]);
  rep(`mc_r${i}`, "sec_menu", c.menu, itemsOf(c.menu), rowEls(`r${i}`), { pc: 1, sp: 1 }, { pc: 0, sp: 0 }, { pc: rowP, sp: rowS },
    { x: px, y: dP + 38, w: pw, h: n * rowP }, { x: sx, y: dS + 60, w: sw, h: n * rowS });
});
t("mn_note", "sec_menu", C.note, [[13, 22, 0.6], [12, 20, 0.4]], B, DMU, [{ x: X0, y: 1190, w: 600, h: 22 }, { x: XS, y: 1756, w: WS, h: 20 }]);

// ---- 4 うちでのこと（生成り。左に見出し・文・席数、右に鉄板の手元の写真）
sec("sec_about", "うちでのこと", "theme:background", 660, 780, nav(2));
photo("ab_ph", "sec_about", "ast_ab01", 1, { x: 700, y: 100, w: 620, h: 460 }, { x: XS, y: 476, w: WS, h: 250 });
t("ab_kick", "sec_about", C.aboutKicker, KICK, B, SAUCE, [{ x: X0, y: 120, w: 400, h: 24 }, { x: XS, y: 56, w: WS, h: 22 }], { weight: 500 });
t("ab_h", "sec_about", C.aboutHead, [[40, 60, 3], [28, 44, 2]], H, INK, [{ x: X0, y: 154, w: 520, h: 60 }, { x: XS, y: 86, w: WS, h: 44 }], { role: "heading" });
t("ab_p", "sec_about", C.aboutBody, [[16, 32, 0.8], [15, 30, 0.5]], B, INK, [{ x: X0, y: 240, w: 500, h: 128 }, { x: XS, y: 146, w: WS, h: 180 }]);
rect("ab_line", "sec_about", SAUCE, 2, { x: X0, y: 404, w: 500, h: 1 }, { x: XS, y: 340, w: WS, h: 1 });
C.seats.forEach(([n, l], i) => {
  t(`ab_sn${i}`, "sec_about", n, [[60, 76, 0], [48, 62, 0]], A, SAUCE, [{ x: X0 + i * 220, y: 426, w: [48, 90][i], h: 76 }, { x: XS + i * 170, y: 356, w: [40, 72][i], h: 62 }]);
  t(`ab_sl${i}`, "sec_about", l, [[13, 22, 1.3], [12, 20, 1]], B, MU, [{ x: X0 + i * 220, y: 510, w: 180, h: 22 }, { x: XS + i * 170, y: 424, w: 150, h: 20 }]);
});

// ---- 5 ご案内と地図（淡い生成り）
sec("sec_info", "ご案内", PALE, 780, 1080, nav(3));
t("in_h", "sec_info", C.infoHead, [[40, 60, 3], [28, 48, 2]], H, INK, [{ x: X0, y: 100, w: 400, h: 60 }, { x: XS, y: 50, w: WS, h: 48 }], { role: "heading" });
let yP = 196, yS = 124;
C.infoRows.forEach(([k, v], i) => {
  const two = Array.isArray(v) && typeof v[0] === "string" && v[0].includes(" "), hP = two ? 92 : 64, hS = two ? 108 : 76;
  rect(`in_l${i}`, "sec_info", "#CFC3AE", 2, { x: X0, y: yP, w: 560, h: 1 }, { x: XS, y: yS, w: WS, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[13, 26, 1.3], [12, 22, 1]], B, MU, [{ x: X0, y: yP + 19, w: 110, h: 26 }, { x: XS, y: yS + 12, w: WS, h: 22 }]);
  t(`in_v${i}`, "sec_info", two ? L(v) : v, [[16, 28, 0.5], [14, 26, 0.2]], B, INK, [{ x: X0 + 120, y: yP + 18, w: 440, h: two ? 56 : 28 }, { x: XS, y: yS + 38, w: WS, h: two ? 52 : 26 }], k === "お電話" ? { link: TEL } : {});
  yP += hP; yS += hS;
});
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDR} ${shop.basic.name}`)}`, newTab: true };
const btn = (id, label, link, pc, sp, fill, color) => {
  rect(`${id}_b`, "sec_info", fill, 2, pc, sp, { link });
  t(`${id}_t`, "sec_info", label, [[15, 24, 1.5], [14, 24, 1]], B, color, [{ ...pc, y: pc.y + 16, h: 24 }, { ...sp, y: sp.y + 14, h: 24 }], { align: "center", link, z: 4, weight: 700 });
};
btn("in_tel", C.telLabel, TEL, { x: X0, y: yP + 40, w: 260, h: 56 }, { x: XS, y: yS + 32, w: 161, h: 52 }, MUST, INK);
btn("in_map", C.mapLabel, LINKM, { x: X0 + 284, y: yP + 40, w: 260, h: 56 }, { x: 201, y: yS + 32, w: 161, h: 52 }, PALE, INK);
add("in_mapbox", { type: "shape", z: 2, kind: "rect", fill: SOFT, section: "sec_info", layout: lay({ x: 740, y: 100, w: 580, h: 580 }, { x: XS, y: yS + 120, w: WS, h: 360 }) });

// ---- フッター（鉄の黒）
sec("sec_footer", "フッター", INK, 340, 600);
t("ft_name", "sec_footer", C.name, [[22, 40, 1.6], [20, 40, 1.2]], H, BG, [{ x: X0, y: 60, w: 440, h: 40 }, { x: XS, y: 40, w: WS, h: 40 }]);
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 26, 0.5], [14, 26, 0.5]], B, BG, [{ x: X0, y: 110, w: 420, h: 26 }, { x: XS, y: 92, w: WS, h: 26 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[14, 30, 0.6], [15, 30, 0.5]], B, BG, [{ x: 620, y: 60 + 32 * i, w: 220, h: 30 }, { x: XS, y: 136 + 32 * i, w: WS, h: 30 }], { link: go(a) }));
t("ft_hk", "sec_footer", "営業時間", [[13, 22, 1.3], [12, 20, 1]], B, MUST, [{ x: 900, y: 64, w: 420, h: 22 }, { x: XS, y: 284, w: WS, h: 20 }]);
t("ft_hv", "sec_footer", L(C.footHours), [[14, 26, 0.5], [14, 26, 0.5]], B, BG, [{ x: 900, y: 90, w: 420, h: 78 }, { x: XS, y: 308, w: WS, h: 78 }]);
t("ft_tk", "sec_footer", "お電話", [[13, 22, 1.3], [12, 20, 1]], B, MUST, [{ x: 900, y: 186, w: 200, h: 22 }, { x: XS, y: 402, w: WS, h: 20 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[22, 32, 1], [22, 32, 1]], A, BG, [{ x: 900, y: 212, w: 260, h: 32 }, { x: XS, y: 426, w: WS, h: 32 }], { link: TEL });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], B, DMU, [{ x: X0, y: 282, w: 500, h: 20 }, { x: XS, y: 530, w: WS, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_17", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_signature", "sec_menu", "sec_about", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚／品 ${Object.keys(shop.catalog.items).length}`);
