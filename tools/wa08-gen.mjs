#!/usr/bin/env node
// wa-08：templates/wa-08/SPEC.md の値から samples/<店> の assets.json・site.json を作る。店ごとの文言は samples/<店>/wa08.json。
// 写真は templates/wa-08/photos.txt（tide）または photos-<店>.txt の行（「枠 URL」）を media/ に取得する。
// 使い方：node tools/wa08-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa08-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "tide";
const DIR = `samples/${ID}`, LIST = `templates/wa-08/${ID === "tide" ? "photos.txt" : `photos-${ID}.txt`}`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa08.json`, "utf8"));
const NOW = "2026-11-10T09:00:00+09:00";

// ---- 写真（WebP の大きさは本体から読む）
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

// ---- 配置の道具
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

const H = "font:heading", B = "font:body", A = "font:accent", INK = "#1C1C1C", MU = "#55595C", AC = "#4A6A7A", LN = "#5B7C8D", SOFT = "#D9D9D6", GR = "#ECECEA", W = "#FFFFFF", ACL = "#A9C0CC";
const NAME = shop.basic.name, TEL = { kind: "shopPhone" }, ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
// 段の札：左の列に欧文の大（Manrope）＋日本語の小（青灰）
const X0 = 36, XC = 416, XS = 15;
function label(p, section, en, ja, y, yS) {
  t(`${p}_en`, section, en, [[40, 52, -0.5], [32, 40, -0.4]], H, INK, [{ x: X0, y, w: 340, h: 52 }, { x: XS, y: yS, w: 360, h: 42 }], { role: "heading", weight: 700 });
  t(`${p}_ja`, section, ja, [[14, 22, 1.4], [13, 20, 1.3]], B, AC, [{ x: X0, y: y + 58, w: 340, h: 22 }, { x: XS, y: yS + 46, w: 360, h: 21 }]);
}

// ---- ヘッダー（白の帯。写真には重ねない）
sec("sec_header", "ヘッダー", "theme:background", 72, 64);
t("hd_name", "sec_header", C.shortName, [[15, 28, 1.2], [14, 26, 1]], H, INK, [{ x: X0, y: 22, w: 320, h: 28 }, { x: XS, y: 19, w: 260, h: 26 }], { weight: 700, link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: INK, font: A, spMenuBackground: "theme:primary" }, layout: lay({ x: 860, y: 16, w: 544, h: 40, size: 15 }, { x: 332, y: 10, w: 44, h: 44 }) });

// ---- 1 最初の画面（左に大きな欧文、右半分に写真）
sec("sec_firstv", "最初の画面", "theme:background", 828, 780);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 720, y: 0, w: 720, h: 828 }, { x: 110, y: 210, w: 280, h: 390 });
t("fv_tide", "sec_firstv", C.nameEn, [[200, 200, -5.7], [120, 120, -3.4]], H, INK, [{ x: X0, y: 130, w: 680, h: 331 }, { x: XS - 4, y: 0, w: 372, h: 190 }], { role: "pageTitle", weight: 700 });
t("fv_copy", "sec_firstv", C.fvCopy, [[30, 48, 1.5], [21, 34, 0.8]], B, INK, [{ x: X0 + 4, y: 550, w: 660, h: 48 }, { x: XS, y: 616, w: 360, h: 34 }], { weight: 500 });
const FXP = [40, 300, 500];
C.facts.forEach(([k, v], i) => {
  const yS = 664 + 32 * i;
  t(`fv_k${i}`, "sec_firstv", k, [[13, 20, 1.3], [12, 24, 1]], B, AC, [{ x: FXP[i], y: 740, w: 190, h: 20 }, { x: XS, y: yS, w: 76, h: 24 }]);
  t(`fv_v${i}`, "sec_firstv", v, [[15, 26, 0.4], [14, 24, 0.3]], B, INK, [{ x: FXP[i], y: 766, w: i === 0 ? 240 : 190, h: 26 }, { x: 95, y: yS, w: 280, h: 24 }]);
});

// ---- 2 紹介（左の列に札、中央に欧文の大きな見出しと本文、右に写真）
sec("sec_about", "紹介", "theme:background", 640, 770, { anchor: "about", nav: { label: "About", order: 1 } });
label("ab", "sec_about", "About", C.aboutJa, 100, 48);
t("ab_h", "sec_about", L(C.aboutHead), [[64, 76, -1.2], [40, 50, -0.6]], H, INK, [{ x: XC, y: 100, w: 500, h: 152 }, { x: XS, y: 124, w: 360, h: 100 }], { role: "heading", weight: 700 });
t("ab_p", "sec_about", L(C.aboutBody), [[16, 32, 0.4], [15, 30, 0.3]], B, INK, [{ x: XC, y: 290, w: 480, h: 230 }, { x: XS, y: 480, w: 360, h: 240 }], { gap: 14 });
photo("ab_ph", "sec_about", "ast_ab01", 1, { x: 960, y: 100, w: 480, h: 420 }, { x: 90, y: 240, w: 300, h: 220 });

// ---- 3 メニュー（左に札、写真つき 4 品＋行のみ 4 品）
const ids = Object.keys(shop.catalog.items);
const cell = (path, fmt, pc, sp, size, opts) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: fmt } }] }], style: { font: opts.font || B, weight: opts.weight || 400, color: opts.color, lineHeight: r(opts.lh / size), letterSpacing: r((opts.ls || 0) / size), ...(opts.align ? { align: opts.align } : {}) }, layout: { pc: { ...pc, size: opts.sz?.[0] ?? size }, sp: { ...sp, size: opts.sz?.[1] ?? size } } });
sec("sec_menu", "メニュー", "theme:background", 1000, 1270, { anchor: "menu", nav: { label: "Menu", order: 2 } });
label("mn", "sec_menu", "Menu", C.menuJa, 40, 30);
add("mn_cards", { type: "repeater", z: 3, section: "sec_menu", source: { kind: "catalog", menuId: "mnu_food", pick: ids.slice(0, 4) }, display: { mode: "grid", columns: { pc: 4, sp: 2 }, gap: { pc: 14, sp: 15 }, photoless: "sameCard" },
  card: { height: { pc: 416, sp: 320 }, elements: {
    c_ph: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: 296, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: 214, ratio: "custom" } } },
    c_nm: cell("/name", "plain", { x: 0, y: 306, w: 100, h: 50 }, { x: 0, y: 222, w: 100, h: 44 }, 15, { color: INK, lh: 24, weight: 700, sz: [15, 14] }),
    c_ds: cell("/description", "plain", { x: 0, y: 358, w: 100, h: 28 }, { x: 0, y: 268, w: 100, h: 24 }, 12, { color: MU, lh: 20, sz: [12, 11.5] }),
    c_pr: cell("/prices", "priceAll", { x: 0, y: 388, w: 100, h: 26 }, { x: 0, y: 294, w: 100, h: 24 }, 15, { color: AC, lh: 24, weight: 600, font: A, sz: [15, 14] }) } },
  layout: lay({ x: XC, y: 40, w: 990, h: 416 }, { x: XS, y: 100, w: 360, h: 655 }) });
add("mn_rows", { type: "repeater", z: 3, section: "sec_menu", source: { kind: "catalog", menuId: "mnu_food", pick: ids.slice(4) }, display: { mode: "grid", columns: { pc: 1, sp: 1 }, gap: { pc: 0, sp: 0 }, photoless: "sameCard" },
  card: { height: { pc: 86, sp: 96 }, elements: {
    r_nm: cell("/name", "plain", { x: 0, y: 26, w: 34, h: 30 }, { x: 0, y: 16, w: 72, h: 26 }, 18, { color: INK, lh: 30, weight: 700, sz: [18, 16] }),
    r_ds: cell("/description", "plain", { x: 36, y: 30, w: 46, h: 24 }, { x: 0, y: 46, w: 100, h: 40 }, 14, { color: MU, lh: 24, sz: [14, 13] }),
    r_pr: cell("/prices", "priceAll", { x: 84, y: 26, w: 16, h: 30 }, { x: 72, y: 16, w: 28, h: 26 }, 18, { color: AC, lh: 30, weight: 600, font: A, align: "right", sz: [18, 16] }) } },
  layout: lay({ x: XC, y: 500, w: 990, h: 344 }, { x: XS, y: 790, w: 360, h: 384 }) });
t("mn_note", "sec_menu", C.menuNote, [[13, 22, 0.4], [12, 20, 0.3]], B, MU, [{ x: XC, y: 880, w: 990, h: 22 }, { x: XS, y: 1196, w: 360, h: 20 }]);

// ---- 4 お店のこと（グレーの帯。右へ抜ける写真 2 枚と全幅の海）
sec("sec_stand", "お店のこと", "theme:surface", 1000, 770, { anchor: "stand", nav: { label: "Stand", order: 3 } });
label("st", "sec_stand", "Stand", C.standJa, 100, 48);
photo("st_ph1", "sec_stand", "ast_st01", 1, { x: XC, y: 100, w: 624, h: 400 }, { x: XS, y: 130, w: 236, h: 200 });
photo("st_ph2", "sec_stand", "ast_st02", 1, { x: 1054, y: 100, w: 386, h: 400 }, { x: 263, y: 130, w: 127, h: 200 }, { fx: 62 });
t("st_p", "sec_stand", L(C.standBody), [[16, 32, 0.4], [15, 30, 0.3]], B, INK, [{ x: XC, y: 540, w: 620, h: 150 }, { x: XS, y: 356, w: 360, h: 210 }], { gap: 14 });
photo("st_bn", "sec_stand", "ast_bn01", 1, { x: 0, y: 720, w: 1440, h: 280 }, { x: 0, y: 590, w: 390, h: 180 }, { fy: 62 });

// ---- 5 ご案内と地図（白）
sec("sec_info", "ご案内", "theme:background", 680, 940, { anchor: "information", nav: { label: "Information", order: 4 } });
label("in", "sec_info", "Information", C.infoJa, 100, 48);
C.infoRows.forEach(([k, v], i) => {
  const yP = 100 + 66 * i, yS = 130 + 62 * i;
  rect(`in_l${i}`, "sec_info", SOFT, 2, { x: XC, y: yP, w: 480, h: 1 }, { x: XS, y: yS, w: 360, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[13, 24, 1.3], [12, 20, 1.2]], B, AC, [{ x: XC, y: yP + 20, w: 120, h: 24 }, { x: XS, y: yS + 6, w: 360, h: 23 }]);
  t(`in_v${i}`, "sec_info", v, [[16, 26, 0.3], [15, 26, 0.3]], B, INK, [{ x: XC + 124, y: yP + 19, w: 356, h: 26 }, { x: XS, y: yS + 30, w: 360, h: 26 }], k === "お電話" ? { link: TEL } : {});
});
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDR} ${NAME}`)}`, newTab: true };
const btn = (id, label, link, pc, sp) => {
  rect(`${id}_b`, "sec_info", INK, 2, pc, sp, { link });
  t(`${id}_t`, "sec_info", label, [[14, 24, 1.2], [14, 24, 1]], B, W, [{ ...pc, y: pc.y + 13, h: 24 }, { ...sp, y: sp.y + 13, h: 24 }], { align: "center", link, z: 4, weight: 500 });
};
btn("in_tel", C.telLabel, TEL, { x: XC, y: 450, w: 230, h: 50 }, { x: XS, y: 450, w: 172, h: 50 });
btn("in_map", C.mapLabel, LINKM, { x: XC + 250, y: 450, w: 230, h: 50 }, { x: 203, y: 450, w: 172, h: 50 });
add("in_mapbox", { type: "shape", z: 2, kind: "rect", fill: GR, section: "sec_info", layout: lay({ x: 960, y: 100, w: 480, h: 480 }, { x: XS, y: 530, w: 360, h: 340 }) });

// ---- フッター（墨）
sec("sec_footer", "フッター", "#1C1C1C", 380, 520);
t("ft_name", "sec_footer", C.shortName, [[22, 34, 1.6], [20, 32, 1.4]], H, W, [{ x: X0, y: 70, w: 360, h: 34 }, { x: XS, y: 46, w: 360, h: 32 }], { weight: 700 });
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 26, 0.3], [14, 26, 0.3]], B, W, [{ x: X0, y: 116, w: 360, h: 26 }, { x: XS, y: 86, w: 360, h: 26 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[15, 32, 0.3], [15, 32, 0.3]], A, W, [{ x: XC, y: 66 + 32 * i, w: 240, h: 32 }, { x: XS, y: 132 + 32 * i, w: 360, h: 32 }], { link: go(a), weight: 500 }));
t("ft_hk", "sec_footer", "営業時間", [[13, 22, 1.3], [12, 20, 1.2]], B, ACL, [{ x: 760, y: 70, w: 280, h: 22 }, { x: XS, y: 282, w: 360, h: 20 }]);
t("ft_hv", "sec_footer", L(C.footHours), [[14, 26, 0.3], [14, 26, 0.3]], B, W, [{ x: 760, y: 96, w: 300, h: 52 }, { x: XS, y: 306, w: 360, h: 52 }]);
t("ft_tk", "sec_footer", "お電話", [[13, 22, 1.3], [12, 20, 1.2]], B, ACL, [{ x: 1100, y: 70, w: 300, h: 22 }, { x: XS, y: 374, w: 360, h: 20 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[20, 30, 0.4], [20, 30, 0.4]], A, W, [{ x: 1100, y: 96, w: 300, h: 30 }, { x: XS, y: 398, w: 360, h: 30 }], { link: TEL, weight: 500 });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], A, W, [{ x: X0, y: 300, w: 400, h: 20 }, { x: XS, y: 466, w: 360, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_08", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_menu", "sec_stand", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚`);
