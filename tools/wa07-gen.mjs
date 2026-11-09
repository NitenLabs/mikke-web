#!/usr/bin/env node
// wa-07：templates/wa-07/SPEC.md の値から samples/<店> の assets.json・site.json を作る。店ごとの文言は samples/<店>/wa07.json。
// 写真は templates/wa-07/photos.txt の行（「枠 URL」）を media/ に取得する（node tools/wa07-gen.mjs <店>、既定は shirahae）。
// 使い方：node tools/wa07-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa07-finish.mjs <店>
import fs from "node:fs";
const ID = process.argv[2] || "shirahae";
const DIR = `samples/${ID}`, LIST = `templates/wa-07/${ID === "shirahae" ? "photos.txt" : `photos-${ID}.txt`}`;
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa07.json`, "utf8"));
const NOW = "2026-11-10T02:00:00+09:00";

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

const H = "font:heading", B = "font:body", A = "font:accent", INK = "#2B211B", MU = "#5A4A3C", CR = "#F3ECDF", G = "#1F3A2E", BR = "#7A5F2E", BRL = "#D3B37A", FT = "#172B22";
const NAME = shop.basic.name, TEL = { kind: "shopPhone" }, ADDR = `${shop.location.prefecture}${shop.location.city}${shop.location.town}`;
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
// 段の見出し：欧文の大（Playfair 斜体、finish で斜体）＋日本語の小（真鍮）
const EN = [[44, 56, 0], [34, 44, 0]], JA = [[14, 22, 2.1], [13, 20, 2]];
function head(p, section, en, ja, color, ja2, y, yS, xP = 80, xS = 15) {
  t(`${p}_en`, section, en, EN, A, color, [{ x: xP, y, w: 500, h: 56 }, { x: xS, y: yS, w: 360, h: 44 }], { role: "heading" });
  t(`${p}_ja`, section, ja, JA, B, ja2, [{ x: xP, y: y + 62, w: 500, h: 22 }, { x: xS, y: yS + 48, w: 360, h: 20 }]);
}

// ---- ヘッダー（写真の上に重ねる。スクロールで生成りの帯に）
sec("sec_header", "ヘッダー", "theme:background", 88, 80);
t("hd_name", "sec_header", NAME, [[20, 40, 2], [17, 32, 1.7]], H, CR, [{ x: 40, y: 24, w: 320, h: 40 }, { x: 15, y: 24, w: 240, h: 32 }], { link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: CR, font: A, spMenuBackground: "theme:primary" }, layout: lay({ x: 760, y: 24, w: 640, h: 40, size: 16 }, { x: 332, y: 18, w: 44, h: 44 }) });

// ---- 1 最初の画面（深緑の壁の写真、下に事実の帯）
sec("sec_firstv", "最初の画面", "theme:primary", 972, 844);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 0, y: 0, w: 1440, h: 800 }, { x: 0, y: 0, w: 390, h: 620 }, { fy: 18 });
rect("fv_sc", "sec_firstv", G, 2, { x: 0, y: 0, w: 1440, h: 800 }, { x: 0, y: 0, w: 390, h: 620 });
t("fv_en", "sec_firstv", C.nameEn, [[24, 34, 0.5], [18, 26, 0.4]], A, BRL, [{ x: 80, y: 180, w: 500, h: 34 }, { x: 30, y: 196, w: 330, h: 26 }]);
t("fv_copy", "sec_firstv", L(C.fvCopy), [[64, 96, 3.2], [36, 56, 1.8]], H, CR, [{ x: 80, y: 232, w: 800, h: 192 }, { x: 30, y: 232, w: 330, h: 112 }], { role: "pageTitle", weight: 600 });
t("fv_name", "sec_firstv", NAME, [[20, 32, 2], [16, 28, 1.6]], B, CR, [{ x: 80, y: 448, w: 500, h: 32 }, { x: 30, y: 364, w: 330, h: 28 }]);
const FXP = [80, 400, 720, 1040], FXS = [[30, 642], [205, 642], [30, 744], [205, 744]];
C.facts.forEach(([k, v], i) => {
  const [xS, yS] = FXS[i];
  t(`fv_k${i}`, "sec_firstv", k, [[13, 20, 1.3], [12, 18, 1.2]], B, BRL, [{ x: FXP[i], y: 840, w: 300, h: 20 }, { x: xS, y: yS, w: 160, h: 18 }]);
  t(`fv_v${i}`, "sec_firstv", v, [[16, 28, 0.4], [14, 22, 0.3]], B, CR, [{ x: FXP[i], y: 866, w: 300, h: 56 }, { x: xS, y: yS + 22, w: 160, h: 66 }]);
});

// ---- 2 紹介
sec("sec_about", "紹介", "theme:background", 560, 660, { anchor: "about", nav: { label: "About", order: 1 } });
t("ab_en", "sec_about", "About", [[18, 26, 0], [15, 22, 0]], A, BR, [{ x: 80, y: 120, w: 200, h: 26 }, { x: 15, y: 70, w: 200, h: 22 }]);
t("ab_h", "sec_about", L(C.aboutHead), [[40, 56, 2], [28, 40, 1.4]], H, G, [{ x: 80, y: 156, w: 620, h: 112 }, { x: 15, y: 104, w: 360, h: 80 }], { role: "heading", weight: 600 });
t("ab_p", "sec_about", L(C.aboutBody), [[16, 34, 0.4], [15, 30, 0.3]], B, INK, [{ x: 760, y: 120, w: 600, h: 320 }, { x: 15, y: 206, w: 360, h: 380 }], { gap: 16 });
rect("ab_ln", "sec_about", "#A8874E", 2, { x: 80, y: 500, w: 1280, h: 1 }, { x: 15, y: 620, w: 360, h: 1 });

// ---- 3 メニュー（4列×2段）
const ids = Object.keys(shop.catalog.items);
const cell = (path, fmt, pc, sp, size, opts) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: fmt } }] }], style: { font: opts.font || B, weight: opts.weight || 400, color: opts.color, lineHeight: r(opts.lh / size), letterSpacing: r((opts.ls || 0) / size) }, layout: { pc: { ...pc, size: opts.sz?.[0] ?? size }, sp: { ...sp, size: opts.sz?.[1] ?? size } } });
sec("sec_menu", "メニュー", "theme:background", 1320, 1560, { anchor: "menu", nav: { label: "Menu", order: 2 } });
head("mn", "sec_menu", "Menu", C.menuJa, G, BR, 40, 40);
add("mn_cards", { type: "repeater", z: 3, section: "sec_menu", source: { kind: "catalog", menuId: "mnu_food", pick: ids }, display: { mode: "grid", columns: { pc: 4, sp: 2 }, gap: { pc: 28, sp: 15 }, photoless: "sameCard" },
  card: { height: { pc: 462, sp: 326 }, elements: {
    c_ph: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: 320, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: 180, ratio: "custom" } } },
    c_nm: cell("/name", "plain", { x: 0, y: 336, w: 100, h: 30 }, { x: 0, y: 192, w: 100, h: 26 }, 18, { color: G, lh: 30, weight: 500, sz: [18, 16] }),
    c_ds: cell("/description", "plain", { x: 0, y: 370, w: 100, h: 46 }, { x: 0, y: 222, w: 100, h: 66 }, 13, { color: MU, lh: 22, sz: [13, 12.5] }),
    c_pr: cell("/prices", "priceAll", { x: 0, y: 426, w: 100, h: 28 }, { x: 0, y: 292, w: 100, h: 28 }, 16, { color: BR, lh: 28, weight: 500, font: A, sz: [16, 15] }) } },
  layout: lay({ x: 80, y: 180, w: 1280, h: 1000 }, { x: 15, y: 136, w: 360, h: 1349 }) });
t("mn_note", "sec_menu", C.menuNote, [[14, 24, 0.4], [13, 22, 0.3]], B, MU, [{ x: 80, y: 1216, w: 1280, h: 24 }, { x: 15, y: 1500, w: 360, h: 24 }]);

// ---- 4 店内（文＋縦の写真＋文、続けて全幅の写真）
sec("sec_interior", "店内", "theme:background", 1490, 1490, { anchor: "interior", nav: { label: "Interior", order: 3 } });
head("it", "sec_interior", "Interior", C.interiorJa, G, BR, 40, 60);
t("it_h", "sec_interior", L(C.interiorHead), [[36, 54, 1.8], [26, 40, 1.3]], H, G, [{ x: 80, y: 150, w: 400, h: 108 }, { x: 15, y: 148, w: 360, h: 80 }], { role: "heading", weight: 600 });
t("it_p", "sec_interior", C.interiorBody, [[16, 32, 0.3], [15, 30, 0.3]], B, INK, [{ x: 80, y: 280, w: 380, h: 160 }, { x: 15, y: 246, w: 360, h: 124 }]);
photo("it_ph1", "sec_interior", "ast_in01", 1, { x: 500, y: 40, w: 440, h: 680 }, { x: 15, y: 386, w: 360, h: 460 });
photo("it_ph2", "sec_interior", "ast_in02", 1, { x: 80, y: 470, w: 380, h: 250 }, { x: 15, y: 866, w: 172.5, h: 150 });
photo("it_ph3", "sec_interior", "ast_in03", 1, { x: 980, y: 40, w: 380, h: 254 }, { x: 202.5, y: 866, w: 172.5, h: 150 });
t("it_p2", "sec_interior", C.interiorBody2, [[16, 32, 0.3], [15, 30, 0.3]], B, INK, [{ x: 980, y: 330, w: 380, h: 160 }, { x: 15, y: 1036, w: 360, h: 124 }]);
photo("it_bn", "sec_interior", "ast_bn01", 1, { x: 0, y: 790, w: 1440, h: 700 }, { x: 0, y: 1190, w: 390, h: 300 }, { fy: 60 });

// ---- 5 ご案内と地図（深緑の面）
sec("sec_info", "ご案内", "theme:primary", 900, 1090, { anchor: "information", nav: { label: "Information", order: 4 } });
head("in", "sec_info", "Information", C.infoJa, CR, BRL, 100, 70);
C.infoRows.forEach(([k, v], i) => {
  const yP = 230 + 72 * i, yS = 158 + 66 * i;
  rect(`in_l${i}`, "sec_info", "#A8874E", 2, { x: 80, y: yP, w: 560, h: 1 }, { x: 15, y: yS, w: 360, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[14, 24, 1.4], [12, 20, 1.2]], B, BRL, [{ x: 80, y: yP + 24, w: 150, h: 24 }, { x: 15, y: yS + 8, w: 360, h: 20 }]);
  t(`in_v${i}`, "sec_info", v, [[17, 28, 0.3], [15, 26, 0.3]], B, CR, [{ x: 240, y: yP + 22, w: 400, h: 28 }, { x: 15, y: yS + 30, w: 360, h: 26 }], k === "お電話" ? { link: TEL } : {});
});
const LINKM = { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDR} ${NAME}`)}`, newTab: true };
const btn = (id, label, link, pc, sp) => {
  rect(`${id}_b`, "sec_info", G, 2, pc, sp, { link });
  t(`${id}_t`, "sec_info", label, [[15, 24, 1.2], [14, 24, 1]], B, CR, [{ ...pc, y: pc.y + 13, h: 24 }, { ...sp, y: sp.y + 13, h: 24 }], { align: "center", link, z: 4 });
};
btn("in_tel", C.telLabel, TEL, { x: 80, y: 680, w: 180, h: 50 }, { x: 15, y: 574, w: 170, h: 50 });
btn("in_map", C.mapLabel, LINKM, { x: 280, y: 680, w: 180, h: 50 }, { x: 205, y: 574, w: 170, h: 50 });
add("in_mapbox", { type: "shape", z: 2, kind: "rect", fill: "#2A4A3C", section: "sec_info", layout: lay({ x: 720, y: 100, w: 640, h: 700 }, { x: 15, y: 650, w: 360, h: 370 }) });

// ---- フッター（4列）
sec("sec_footer", "フッター", FT, 380, 520);
t("ft_name", "sec_footer", NAME, [[24, 40, 2.4], [22, 36, 2.2]], H, CR, [{ x: 80, y: 80, w: 400, h: 40 }, { x: 15, y: 50, w: 360, h: 36 }]);
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 26, 0.3], [14, 26, 0.3]], B, CR, [{ x: 80, y: 130, w: 400, h: 26 }, { x: 15, y: 92, w: 360, h: 26 }]);
C.nav.forEach(([l, a], i) => t(`ft_n${i}`, "sec_footer", l, [[15, 32, 0.3], [15, 32, 0.3]], A, CR, [{ x: 560, y: 80 + 32 * i, w: 200, h: 32 }, { x: 15, y: 140 + 32 * i, w: 360, h: 32 }], { link: go(a) }));
t("ft_hk", "sec_footer", "営業時間", [[13, 22, 1.3], [12, 20, 1.2]], B, BRL, [{ x: 800, y: 80, w: 240, h: 22 }, { x: 15, y: 290, w: 360, h: 20 }]);
t("ft_hv", "sec_footer", L(C.footHours), [[14, 28, 0.3], [14, 26, 0.3]], B, CR, [{ x: 800, y: 106, w: 280, h: 56 }, { x: 15, y: 314, w: 360, h: 52 }]);
t("ft_tk", "sec_footer", "お電話", [[13, 22, 1.3], [12, 20, 1.2]], B, BRL, [{ x: 1120, y: 80, w: 240, h: 22 }, { x: 15, y: 382, w: 360, h: 20 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[20, 30, 0.4], [20, 30, 0.4]], A, CR, [{ x: 1120, y: 106, w: 240, h: 30 }, { x: 15, y: 406, w: 360, h: 30 }], { link: TEL });
t("ft_copy", "sec_footer", C.copyright, [[12, 20, 0.6], [12, 20, 0.6]], A, CR, [{ x: 80, y: 310, w: 400, h: 20 }, { x: 15, y: 470, w: 360, h: 20 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_07", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_menu", "sec_interior", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky", headerOverlay: { pages: ["pg_home"], textColor: CR } }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(assets).length} 枚`);
