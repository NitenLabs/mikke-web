#!/usr/bin/env node
// wa-10：templates/wa-10/SPEC.md の値から samples/<店> の assets.json・site.json を作る。店ごとの文言は samples/<店>/wa10.json。
// 写真は templates/wa-10/photos.txt（mugitoakari）または photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 使い方：node tools/wa10-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa10-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "mugitoakari";
const DIR = `samples/${ID}`, LIST = `templates/wa-10/${ID === "mugitoakari" ? "photos.txt" : `photos-${ID}.txt`}`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa10.json`, "utf8"));
const NOW = "2026-11-10T09:00:00+09:00";

function webpSize(b) {
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") throw new Error("WebP ではありません");
  const kind = b.toString("latin1", 12, 16);
  if (kind === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
  throw new Error("WebP の大きさが読めません");
}
const astId = (k) => (k === "fv" ? "fv01" : k === "bn" ? "bn01" : `${k.slice(0, 2)}0${k[2]}`);
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
    layout: lay({ ...l[0], size: ps[0], ...(x.vertical ? { writingMode: "vertical" } : {}) }, { ...l[1], size: ss[0] }) });
}
const sec = (id, name, color, pc, sp, more = {}) => { secs[id] = { name, background: { color }, minHeight: { pc, sp }, ...more }; };
const photo = (id, section, asset, z, pc, sp, crop = {}) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1, ...crop } });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });

const H = "font:heading", B = "font:body", A = "font:accent";
const INK = "#3A2E26", MU = "#5C4F45", OL = "#5F6548", LN = "#C9A46A", SOFT = "#D9CDB6", SF = "#ECE3D2", CR = "#F5EFE4";
const NAME = shop.basic.name, TEL = { kind: "shopPhone" }, ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
const X0 = 120, W0 = 1200, XS = 15;
function label(p, section, en, ja, x, y, yS) {
  t(`${p}_en`, section, en, [[46, 56, 0], [36, 44, 0]], A, INK, [{ x, y, w: 480, h: 56 }, { x: XS, y: yS, w: 360, h: 44 }], { role: "heading" });
  t(`${p}_ja`, section, ja, [[14, 22, 1.4], [13, 20, 1.3]], B, OL, [{ x, y: y + 62, w: 480, h: 22 }, { x: XS, y: yS + 48, w: 360, h: 20 }], { weight: 500 });
}

// ---- ヘッダー
sec("sec_header", "ヘッダー", "theme:background", 76, 64);
t("hd_name", "sec_header", C.shortName, [[22, 32, 2], [20, 30, 1.6]], H, INK, [{ x: 40, y: 22, w: 240, h: 32 }, { x: XS, y: 17, w: 220, h: 30 }], { weight: 500, link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: INK, font: B, spMenuBackground: "theme:primary" }, layout: lay({ x: 860, y: 18, w: 540, h: 40, size: 15 }, { x: 332, y: 10, w: 44, h: 44 }) });

// ---- 1 最初の画面（左に大きな写真、右の列に縦書きのコピーと店名）
sec("sec_firstv", "最初の画面", "theme:background", 860, 770);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 0, y: 0, w: 1000, h: 860 }, { x: 0, y: 0, w: 390, h: 450 });
t("fv_copy", "sec_firstv", L(C.fvCopy), [[42, 76, 4], [26, 40, 1]], H, INK, [{ x: 1208, y: 110, w: 160, h: 400 }, { x: XS, y: 518, w: 360, h: 94 }], { role: "pageTitle", weight: 500, vertical: true });
t("fv_name", "sec_firstv", C.shortName, [[30, 44, 5], [24, 36, 3]], H, INK, [{ x: 1120, y: 110, w: 60, h: 220 }, { x: XS, y: 472, w: 130, h: 36 }], { weight: 500, vertical: true });
t("fv_en", "sec_firstv", C.nameEn, [[18, 28, 0.4], [16, 36, 0.3]], A, OL, [{ x: 1060, y: 580, w: 340, h: 28 }, { x: 150, y: 472, w: 220, h: 36 }]);
C.facts.forEach(([k, v], i) => {
  const yP = 622 + 66 * i, yS = [626, 660, 694][i];
  t(`fv_k${i}`, "sec_firstv", k, [[13, 22, 1.2], [12, 22, 1]], B, OL, [{ x: 1060, y: yP, w: 340, h: 22 }, { x: XS, y: yS, w: 72, h: 22 }], { weight: 500 });
  t(`fv_v${i}`, "sec_firstv", v, [[14, 22, 0.3], [14, 24, 0.3]], B, INK, [{ x: 1060, y: yP + 22, w: 340, h: 22 }, { x: 90, y: yS - 1, w: 285, h: 24 }]);
});

// ---- 2 紹介（左に写真、右に見出しと本文）
sec("sec_about", "紹介", "theme:background", 720, 870, { anchor: "about", nav: { label: C.nav[0][0], order: 1 } });
photo("ab_ph", "sec_about", "ast_ab01", 1, { x: X0, y: 100, w: 620, h: 520 }, { x: XS, y: 230, w: 360, h: 270 });
label("ab", "sec_about", "About", C.aboutJa, 810, 100, 48);
t("ab_h", "sec_about", L(C.aboutHead), [[30, 48, 2], [26, 40, 1]], H, INK, [{ x: 810, y: 200, w: 510, h: 96 }, { x: XS, y: 126, w: 360, h: 80 }], { role: "heading", weight: 500 });
t("ab_p", "sec_about", L(C.aboutBody), [[16, 32, 0.5], [15, 30, 0.4]], B, INK, [{ x: 810, y: 328, w: 510, h: 280 }, { x: XS, y: 524, w: 360, h: 330 }], { gap: 12 });

// ---- 3 パン（写真を大きく 2 列）
const ids = Object.keys(shop.catalog.items);
const breadIds = ids.filter((id) => shop.catalog.placements[`plc_${id.slice(4)}`].menuId === "mnu_bread");
const cafeIds = ids.filter((id) => shop.catalog.placements[`plc_${id.slice(4)}`].menuId === "mnu_cafe");
const photoIds = breadIds.filter((id) => shop.catalog.items[id].photos), rowIds = breadIds.filter((id) => !shop.catalog.items[id].photos);
const cell = (path, fmt, pc, sp, size, opts) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: fmt } }] }], style: { font: opts.font || B, weight: opts.weight || 400, color: opts.color, lineHeight: r(opts.lh / size), letterSpacing: r((opts.ls || 0) / size), ...(opts.align ? { align: opts.align } : {}) }, layout: { pc: { ...pc, size: opts.sz?.[0] ?? size }, sp: { ...sp, size: opts.sz?.[1] ?? size } } });
const CH = { pc: 512, sp: 352 }, CG = { pc: 40, sp: 20 };
const rowsOf = (menu, list, id, section, pc, sp, h) => add(id, { type: "repeater", z: 3, section, source: { kind: "catalog", menuId: menu, pick: list }, display: { mode: "grid", columns: { pc: 1, sp: 1 }, gap: { pc: 0, sp: 0 }, photoless: "sameCard" },
  card: { height: h, elements: {
    r_nm: cell("/name", "plain", { x: 0, y: 20, w: 74, h: 30 }, { x: 0, y: 14, w: 72, h: 26 }, 18, { color: INK, lh: 30, weight: 500, sz: [18, 16] }),
    r_ds: cell("/description", "plain", { x: 0, y: 52, w: 74, h: 24 }, { x: 0, y: 44, w: 100, h: 24 }, 14, { color: MU, lh: 24, sz: [14, 13] }),
    r_pr: cell("/prices", "priceAll", { x: 76, y: 20, w: 24, h: 30 }, { x: 72, y: 14, w: 28, h: 26 }, 18, { color: INK, lh: 30, font: A, align: "right", sz: [18, 16] }) } },
  layout: lay(pc, sp) });
const nPh = photoIds.length, nRowsP = Math.ceil(nPh / 2), cardsH = { pc: nRowsP * CH.pc + (nRowsP - 1) * CG.pc, sp: nPh * CH.sp + (nPh - 1) * CG.sp };
const yRowP = 184 + cardsH.pc + 32, yRowS = 116 + cardsH.sp + 24;
const rowH = { pc: 96, sp: 84 };
sec("sec_bread", "パン", "theme:background", yRowP + rowH.pc * rowIds.length + 92, yRowS + rowH.sp * rowIds.length + 92, { anchor: "bread", nav: { label: C.nav[1][0], order: 2 } });
label("br", "sec_bread", "Bread", C.breadJa, X0, 80, 40);
add("br_cards", { type: "repeater", z: 3, section: "sec_bread", source: { kind: "catalog", menuId: "mnu_bread", pick: photoIds }, display: { mode: "grid", columns: { pc: 2, sp: 1 }, gap: CG, photoless: "sameCard" },
  card: { height: CH, elements: {
    c_ph: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: 400, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: 248, ratio: "custom" } } },
    c_nm: cell("/name", "plain", { x: 0, y: 414, w: 74, h: 32 }, { x: 0, y: 258, w: 72, h: 26 }, 20, { color: INK, lh: 32, weight: 500, sz: [20, 16] }),
    c_pr: cell("/prices", "priceAll", { x: 76, y: 414, w: 24, h: 32 }, { x: 72, y: 258, w: 28, h: 26 }, 20, { color: INK, lh: 32, font: A, align: "right", sz: [20, 16] }),
    c_ds: cell("/description", "plain", { x: 0, y: 452, w: 100, h: 52 }, { x: 0, y: 290, w: 100, h: 48 }, 14, { color: MU, lh: 26, sz: [14, 13] }) } },
  layout: lay({ x: X0, y: 184, w: W0, h: cardsH.pc }, { x: XS, y: 116, w: 360, h: cardsH.sp }) });
rowsOf("mnu_bread", rowIds, "br_rows", "sec_bread", { x: X0, y: yRowP, w: W0, h: rowH.pc * rowIds.length }, { x: XS, y: yRowS, w: 360, h: rowH.sp * rowIds.length }, rowH);
t("br_note", "sec_bread", C.breadNote, [[13, 22, 0.4], [12, 20, 0.3]], B, MU, [{ x: X0, y: yRowP + rowH.pc * rowIds.length + 12, w: W0, h: 22 }, { x: XS, y: yRowS + rowH.sp * rowIds.length + 10, w: 360, h: 40 }]);

// ---- 4 全幅の写真
sec("sec_band", "写真", "theme:background", 480, 240);
photo("bn_ph", "sec_band", "ast_bn01", 1, { x: 0, y: 0, w: 1440, h: 480 }, { x: 0, y: 0, w: 390, h: 240 });

// ---- 5 カフェ（少し濃い生成りの帯）
sec("sec_cafe", "カフェ", "theme:surface", 900, 1260, { anchor: "cafe", nav: { label: C.nav[2][0], order: 3 } });
label("cf", "sec_cafe", "Cafe", C.cafeJa, X0, 90, 48);
t("cf_p", "sec_cafe", L(C.cafeBody), [[16, 30, 0.4], [15, 28, 0.3]], B, INK, [{ x: X0, y: 196, w: 480, h: 130 }, { x: XS, y: 124, w: 360, h: 120 }], { gap: 8 });
photo("cf_ph1", "sec_cafe", "ast_cf01", 1, { x: X0, y: 350, w: 480, h: 460 }, { x: XS, y: 260, w: 360, h: 300 }, { fy: 45 });
photo("cf_ph2", "sec_cafe", "ast_cf02", 1, { x: 680, y: 90, w: 640, h: 340 }, { x: XS, y: 574, w: 360, h: 220 }, { fy: 38 });
rowsOf("mnu_cafe", cafeIds, "cf_rows", "sec_cafe", { x: 680, y: 450, w: 640, h: 96 * cafeIds.length }, { x: XS, y: 806, w: 360, h: 88 * cafeIds.length }, { pc: 96, sp: 88 });
t("cf_note", "sec_cafe", C.cafeNote, [[13, 22, 0.4], [12, 20, 0.3]], B, MU, [{ x: 680, y: 850, w: 640, h: 22 }, { x: XS, y: 1172, w: 360, h: 20 }]);

// ---- 6 ご案内と地図
sec("sec_info", "ご案内", "theme:background", 780, 1000, { anchor: "information", nav: { label: C.nav[3][0], order: 4 } });
label("in", "sec_info", "Information", C.infoJa, X0, 90, 48);
C.infoRows.forEach(([k, v], i) => {
  const yP = 192 + 66 * i, yS = 130 + 66 * i;
  rect(`in_l${i}`, "sec_info", SOFT, 2, { x: X0, y: yP, w: 540, h: 1 }, { x: XS, y: yS, w: 360, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[13, 24, 1.2], [12, 20, 1.1]], B, OL, [{ x: X0, y: yP + 20, w: 110, h: 24 }, { x: XS, y: yS + 7, w: 360, h: 22 }], { weight: 500 });
  t(`in_v${i}`, "sec_info", v, [[16, 26, 0.3], [15, 26, 0.3]], B, INK, [{ x: X0 + 112, y: yP + 19, w: 428, h: 26 }, { x: XS, y: yS + 31, w: 360, h: 26 }], k === "お電話" ? { link: TEL } : {});
});
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDR} ${NAME}`)}`, newTab: true };
const btn = (id, label, link, pc, sp) => {
  rect(`${id}_b`, "sec_info", INK, 2, pc, sp, { link, radius: 100 });
  t(`${id}_t`, "sec_info", label, [[14, 24, 1.2], [14, 24, 1]], B, CR, [{ ...pc, y: pc.y + 13, h: 24 }, { ...sp, y: sp.y + 13, h: 24 }], { align: "center", link, z: 4, weight: 500 });
};
btn("in_tel", C.telLabel, TEL, { x: X0, y: 546, w: 260, h: 50 }, { x: XS, y: 476, w: 172, h: 50 });
btn("in_map", C.mapLabel, LINKM, { x: X0 + 280, y: 546, w: 260, h: 50 }, { x: 203, y: 476, w: 172, h: 50 });
add("in_mapbox", { type: "shape", z: 2, kind: "rect", fill: SF, section: "sec_info", layout: lay({ x: 720, y: 90, w: 600, h: 580 }, { x: XS, y: 548, w: 360, h: 390 }) });

// ---- フッター（焦げ茶）
sec("sec_footer", "フッター", INK, 340, 520);
t("ft_name", "sec_footer", C.shortName, [[26, 38, 3], [24, 34, 2.4]], H, CR, [{ x: X0, y: 70, w: 360, h: 38 }, { x: XS, y: 46, w: 360, h: 34 }], { weight: 500 });
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 26, 0.3], [14, 26, 0.3]], B, CR, [{ x: X0, y: 118, w: 360, h: 26 }, { x: XS, y: 86, w: 360, h: 26 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[15, 32, 0.3], [15, 32, 0.3]], B, CR, [{ x: 520, y: 66 + 32 * i, w: 220, h: 32 }, { x: XS, y: 132 + 32 * i, w: 360, h: 32 }], { link: go(a) }));
t("ft_hk", "sec_footer", "営業時間", [[13, 22, 1.2], [12, 20, 1.1]], B, LN, [{ x: 790, y: 70, w: 280, h: 22 }, { x: XS, y: 282, w: 360, h: 20 }]);
t("ft_hv", "sec_footer", L(C.footHours), [[14, 26, 0.3], [14, 26, 0.3]], B, CR, [{ x: 790, y: 96, w: 300, h: 52 }, { x: XS, y: 306, w: 360, h: 52 }]);
t("ft_tk", "sec_footer", "お電話", [[13, 22, 1.2], [12, 20, 1.1]], B, LN, [{ x: 1120, y: 70, w: 200, h: 22 }, { x: XS, y: 374, w: 360, h: 20 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[20, 30, 0.4], [20, 30, 0.4]], A, CR, [{ x: 1120, y: 96, w: 200, h: 30 }, { x: XS, y: 398, w: 360, h: 30 }], { link: TEL });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], A, CR, [{ x: X0, y: 260, w: 400, h: 20 }, { x: XS, y: 466, w: 360, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_10", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_bread", "sec_band", "sec_cafe", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚`);
