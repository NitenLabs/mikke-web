#!/usr/bin/env node
// wa-11：templates/wa-11/SPEC.md の値から samples/<店> の assets.json・site.json を作る。店ごとの文言は samples/<店>/wa11.json。
// 写真は templates/wa-11/photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 使い方：node tools/wa11-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa11-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "luneclaire";
const DIR = `samples/${ID}`, LIST = `templates/wa-11/photos-${ID}.txt`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa11.json`, "utf8"));
const NOW = "2026-11-10T09:00:00+09:00";

function webpSize(b) {
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") throw new Error("WebP ではありません");
  const kind = b.toString("latin1", 12, 16);
  if (kind === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
  throw new Error("WebP の大きさが読めません");
}
const astId = (k) => (k === "fv" ? "fv01" : k === "ei" ? "ei01" : `${k.slice(0, 2)}0${k[2]}`);
const urls = Object.fromEntries(fs.readFileSync(LIST, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/)));
fs.mkdirSync(`${DIR}/media`, { recursive: true });
const assets = {};
for (const [k, p] of Object.entries(C.photos)) {
  const id = `ast_${astId(k)}`, key = `${id}.webp`, f = `${DIR}/media/${key}`, url = urls[k];
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
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  add(id, { type: "text", z: x.z ?? 3, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r((ps[2] ?? 0) / ps[0]), ...(x.align ? { align: x.align } : {}), ...(x.link ? { link: x.link } : {}), ...(x.gap ? { paragraphGap: x.gap } : {}) },
    layout: lay({ ...l[0], size: ps[0] }, { ...l[1], size: ss[0] }) });
}
const sec = (id, name, color, pc, sp, more = {}) => { secs[id] = { name, background: { color }, minHeight: { pc, sp }, ...more }; };
const photo = (id, section, asset, z, pc, sp, crop = {}) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1, ...crop } });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });

const H = "font:heading", B = "font:body", A = "font:accent";
const INK = "#3B2F33", MU = "#6D5D62", RO = "#9C4F5A", LN = "#C8A97E", SOFT = "#E8DCD6", WH = "#FFFFFF";
const NAME = shop.basic.name, TEL = { kind: "shopPhone" }, ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
const X0 = 200, W0 = 1040, XS = 30, WS = 330;
function label(p, section, en, ja, x, y, yS, opts = {}) {
  const w = opts.w ?? 480;
  t(`${p}_en`, section, en, [[44, 52, 0.6], [36, 44, 0.5]], A, INK, [{ x, y, w, h: 52 }, { x: XS, y: yS, w: WS, h: 44 }], { role: "heading", align: opts.align });
  t(`${p}_ja`, section, ja, [[14, 22, 2], [13, 20, 1.8]], B, RO, [{ x, y: y + 58, w, h: 22 }, { x: XS, y: yS + 48, w: WS, h: 20 }], { weight: 500, align: opts.align });
}

// ---- ヘッダー
sec("sec_header", "ヘッダー", "theme:background", 76, 64);
t("hd_name", "sec_header", C.nameEn, [[28, 40, 1], [24, 36, 0.8]], A, INK, [{ x: 40, y: 18, w: 300, h: 40 }, { x: XS, y: 14, w: 240, h: 36 }], { weight: 500, link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: INK, font: B, spMenuBackground: "theme:primary" }, layout: lay({ x: 760, y: 18, w: 640, h: 40, size: 14 }, { x: 332, y: 10, w: 44, h: 44 }) });

// ---- 1 最初の画面（中央にアーチの写真、左に店名、右にコピーと事実）
sec("sec_firstv", "最初の画面", "theme:background", 860, 844);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 440, y: 40, w: 560, h: 780 }, { x: XS, y: 122, w: WS, h: 420 });
t("fv_ja", "sec_firstv", C.kicker, [[22, 30, 1], [16, 24, 0.6]], A, RO, [{ x: 80, y: 300, w: 320, h: 30 }, { x: XS, y: 34, w: WS, h: 24 }], { align: undefined });
t("fv_name", "sec_firstv", C.nameEn, [[84, 92, 0.5], [46, 56, 0.4]], A, INK, [{ x: 80, y: 340, w: 320, h: 184 }, { x: XS, y: 60, w: WS, h: 56 }], { weight: 400 });
rect("fv_line", "sec_firstv", LN, 2, { x: 80, y: 548, w: 64, h: 1 }, { x: 175, y: 665, w: 40, h: 1 });
t("fv_copy", "sec_firstv", L(C.fvCopy), [[26, 46, 2], [24, 36, 1.5]], H, INK, [{ x: 1040, y: 296, w: 320, h: 92 }, { x: XS, y: 566, w: WS, h: 85 }], { role: "pageTitle", weight: 400 });
C.facts.forEach(([k, v], i) => {
  const yP = [424, 482, 562][i], yS = [685, 717, 771][i], two = i === 1;
  t(`fv_k${i}`, "sec_firstv", k, [[13, 22, 1.2], [12, 22, 1]], B, RO, [{ x: 1040, y: yP, w: 320, h: 22 }, { x: XS, y: yS, w: 72, h: 22 }], { weight: 500 });
  t(`fv_v${i}`, "sec_firstv", v, [[14, 22, 0.4], [14, 22, 0.3]], B, INK, [{ x: 1040, y: yP + 24, w: 320, h: two ? 44 : 22 }, { x: 104, y: yS, w: 256, h: two ? 44 : 22 }]);
});

// ---- 2 紹介（左に文、右にアーチの写真）
sec("sec_about", "紹介", "theme:background", 760, 808, { anchor: "about", nav: { label: C.nav[0][0], order: 1 } });
label("ab", "sec_about", C.aboutEn, C.aboutJa, X0, 120, 56);
t("ab_h", "sec_about", L(C.aboutHead), [[28, 46, 2], [24, 36, 1.2]], H, INK, [{ x: X0, y: 232, w: 480, h: 92 }, { x: XS, y: 140, w: WS, h: 79 }], { role: "heading", weight: 400 });
t("ab_p", "sec_about", C.aboutBody, [[16, 32, 0.5], [15, 30, 0.4]], B, INK, [{ x: X0, y: 356, w: 480, h: 170 }, { x: XS, y: 239, w: WS, h: 150 }]);
photo("ab_ph", "sec_about", "ast_ab01", 1, { x: 780, y: 100, w: 460, h: 560 }, { x: 60, y: 415, w: 270, h: 340 });

// ---- 3 生菓子（淡い桜の帯、上辺を弧に。3＋2 枚）
const ids = Object.keys(shop.catalog.items);
const placeOf = (id) => shop.catalog.placements[`plc_${id.slice(4)}`];
const cakeIds = ids.filter((id) => placeOf(id).menuId === "mnu_cake"), bakedIds = ids.filter((id) => placeOf(id).menuId === "mnu_baked");
const cell = (path, fmt, pc, sp, opts) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: fmt } }] }], style: { font: opts.font || B, weight: opts.weight || 400, color: opts.color, lineHeight: r(opts.lh / opts.sz[0]), letterSpacing: r((opts.ls || 0) / opts.sz[0]), ...(opts.align ? { align: opts.align } : {}) }, layout: { pc: { ...pc, size: opts.sz[0] }, sp: { ...sp, size: opts.sz[1] } } });
const cardEls = (p) => ({
  [`${p}_ph`]: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: 400, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: 340, ratio: "custom" } } },
  [`${p}_nm`]: cell("/name", "plain", { x: 0, y: 414, w: 72, h: 28 }, { x: 0, y: 352, w: 72, h: 26 }, { color: INK, lh: 28, weight: 500, sz: [17, 16] }),
  [`${p}_pr`]: cell("/prices", "priceAll", { x: 72, y: 414, w: 28, h: 28 }, { x: 72, y: 352, w: 28, h: 26 }, { color: RO, lh: 28, font: A, align: "right", sz: [20, 19] }),
  [`${p}_ds`]: cell("/description", "plain", { x: 0, y: 446, w: 100, h: 44 }, { x: 0, y: 382, w: 100, h: 44 }, { color: MU, lh: 22, sz: [13, 13] }) });
const CH = { pc: 500, sp: 430 };
const n = cakeIds.length, rowsP = Math.ceil(n / 3), GY = { pc: 56, sp: 32 };
const cakesH = { pc: rowsP * CH.pc + (rowsP - 1) * GY.pc, sp: n * CH.sp + (n - 1) * GY.sp };
const yCP = 260, yCS = 196;
sec("sec_cake", "生菓子", "theme:surface", yCP + cakesH.pc + 112, yCS + cakesH.sp + 100, { anchor: "gateaux", nav: { label: C.nav[1][0], order: 2 } });
label("ck", "sec_cake", C.cakeEn, C.cakeJa, 480, 136, 72, { align: "center" });
add("ck_cards", { type: "repeater", z: 3, section: "sec_cake", source: { kind: "catalog", menuId: "mnu_cake", pick: cakeIds }, display: { mode: "grid", columns: { pc: 3, sp: 1 }, gap: { pc: 40, sp: GY.sp }, photoless: "sameCard" },
  card: { height: CH, elements: cardEls("c") },
  layout: lay({ x: X0, y: yCP, w: W0, h: cakesH.pc }, { x: XS, y: yCS, w: WS, h: cakesH.sp }) });
t("ck_note", "sec_cake", C.note, [[13, 22, 0.4], [12, 20, 0.3]], B, MU, [{ x: X0, y: yCP + cakesH.pc + 28, w: W0, h: 22 }, { x: XS, y: yCS + cakesH.sp + 24, w: WS, h: 20 }]);

// ---- 4 焼き菓子（左に文、右に 2 枚）
sec("sec_baked", "焼き菓子", "theme:background", 720, 240 + 2 * CH.sp + GY.sp + 64, { anchor: "secs", nav: { label: C.nav[2][0], order: 3 } });
label("bk", "sec_baked", C.bakedEn, C.bakedJa, X0, 110, 56, { w: 320 });
t("bk_p", "sec_baked", C.bakedBody, [[16, 30, 0.5], [15, 28, 0.4]], B, INK, [{ x: X0, y: 222, w: 300, h: 90 }, { x: XS, y: 140, w: WS, h: 56 }]);
t("bk_note", "sec_baked", C.note, [[13, 22, 0.4], [12, 20, 0.3]], B, MU, [{ x: X0, y: 330, w: 300, h: 22 }, { x: XS, y: 204, w: WS, h: 20 }]);
add("bk_cards", { type: "repeater", z: 3, section: "sec_baked", source: { kind: "catalog", menuId: "mnu_baked", pick: bakedIds }, display: { mode: "grid", columns: { pc: 2, sp: 1 }, gap: { pc: 40, sp: GY.sp }, photoless: "sameCard" },
  card: { height: CH, elements: cardEls("b") },
  layout: lay({ x: 560, y: 110, w: 680, h: CH.pc }, { x: XS, y: 240, w: WS, h: 2 * CH.sp + GY.sp }) });

// ---- 5 イートイン（全幅の写真に白い札）
sec("sec_salon", "イートイン", "theme:background", 640, 580, { anchor: "salon", nav: { label: C.nav[3][0], order: 4 } });
photo("ei_ph", "sec_salon", "ast_ei01", 1, { x: 0, y: 0, w: 1440, h: 640 }, { x: 0, y: 0, w: 390, h: 260 }, { fx: 35 });
rect("ei_panel", "sec_salon", WH, 2, { x: 860, y: 100, w: 460, h: 440 }, { x: 0, y: 260, w: 390, h: 320 });
t("ei_en", "sec_salon", C.eatEn, [[44, 52, 0.6], [36, 44, 0.5]], A, INK, [{ x: 910, y: 150, w: 360, h: 52 }, { x: XS, y: 296, w: WS, h: 44 }], { role: "heading" });
t("ei_ja", "sec_salon", C.eatJa, [[14, 22, 2], [13, 20, 1.8]], B, RO, [{ x: 910, y: 208, w: 360, h: 22 }, { x: XS, y: 344, w: WS, h: 20 }], { weight: 500 });
t("ei_p", "sec_salon", L(C.eatBody), [[16, 30, 0.4], [15, 28, 0.3]], B, INK, [{ x: 910, y: 262, w: 360, h: 230 }, { x: XS, y: 384, w: WS, h: 170 }], { gap: 8 });

// ---- 6 ご案内と地図
sec("sec_info", "ご案内", "theme:background", 720, 960, { anchor: "information", nav: { label: C.nav[4][0], order: 5 } });
label("in", "sec_info", C.infoEn, C.infoJa, X0, 90, 48);
C.infoRows.forEach(([k, v], i) => {
  const yP = 186 + 64 * i, yS = 130 + 64 * i;
  rect(`in_l${i}`, "sec_info", SOFT, 2, { x: X0, y: yP, w: 500, h: 1 }, { x: XS, y: yS, w: WS, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[13, 24, 1.2], [12, 20, 1.1]], B, RO, [{ x: X0, y: yP + 20, w: 110, h: 24 }, { x: XS, y: yS + 7, w: WS, h: 22 }], { weight: 500 });
  t(`in_v${i}`, "sec_info", v, [[16, 26, 0.3], [15, 26, 0.3]], B, INK, [{ x: X0 + 112, y: yP + 19, w: 388, h: 26 }, { x: XS, y: yS + 31, w: WS, h: 26 }], k === "お電話" ? { link: TEL } : {});
});
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDR} ${NAME}`)}`, newTab: true };
const btn = (id, label, link, pc, sp, fill, color) => {
  rect(`${id}_b`, "sec_info", fill, 2, pc, sp, { link, radius: 100 });
  t(`${id}_t`, "sec_info", label, [[14, 24, 1.2], [14, 24, 1]], B, color, [{ ...pc, y: pc.y + 16, h: 24 }, { ...sp, y: sp.y + 13, h: 24 }], { align: "center", link, z: 4, weight: 500 });
};
btn("in_tel", C.telLabel, TEL, { x: X0, y: 540, w: 240, h: 56 }, { x: XS, y: 466, w: 158, h: 50 }, INK, WH);
btn("in_map", C.mapLabel, LINKM, { x: X0 + 260, y: 540, w: 240, h: 56 }, { x: 202, y: 466, w: 158, h: 50 }, WH, INK);
add("in_mapbox", { type: "shape", z: 2, kind: "rect", fill: SOFT, section: "sec_info", layout: lay({ x: 760, y: 90, w: 480, h: 540 }, { x: XS, y: 540, w: WS, h: 360 }) });

// ---- フッター（深いモーブ）
sec("sec_footer", "フッター", INK, 320, 596);
t("ft_name", "sec_footer", C.nameEn, [[32, 40, 1], [30, 38, 0.8]], A, WH, [{ x: X0, y: 64, w: 300, h: 40 }, { x: XS, y: 44, w: WS, h: 38 }], { weight: 500 });
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 26, 0.3], [14, 26, 0.3]], B, WH, [{ x: X0, y: 114, w: 300, h: 26 }, { x: XS, y: 88, w: WS, h: 26 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[14, 30, 0.3], [15, 30, 0.3]], B, WH, [{ x: 560, y: 60 + 30 * i, w: 200, h: 30 }, { x: XS, y: 128 + 32 * i, w: WS, h: 32 }], { link: go(a) }));
t("ft_hk", "sec_footer", "営業時間", [[13, 22, 1.2], [12, 20, 1.1]], B, LN, [{ x: 820, y: 64, w: 420, h: 22 }, { x: XS, y: 304, w: WS, h: 20 }]);
t("ft_hv", "sec_footer", L(C.footHours), [[14, 26, 0.3], [14, 26, 0.3]], B, WH, [{ x: 820, y: 90, w: 420, h: 78 }, { x: XS, y: 328, w: WS, h: 78 }]);
t("ft_tk", "sec_footer", "お電話", [[13, 22, 1.2], [12, 20, 1.1]], B, LN, [{ x: 820, y: 180, w: 200, h: 22 }, { x: XS, y: 418, w: WS, h: 20 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[20, 30, 0.4], [20, 30, 0.4]], A, WH, [{ x: 820, y: 206, w: 240, h: 30 }, { x: XS, y: 442, w: WS, h: 30 }], { link: TEL });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], A, WH, [{ x: X0, y: 256, w: 420, h: 20 }, { x: XS, y: 524, w: WS, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_11", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_cake", "sec_baked", "sec_salon", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚`);
