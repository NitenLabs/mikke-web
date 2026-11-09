#!/usr/bin/env node
// wa-13：templates/wa-13/SPEC.md の数値から samples/<店>/ の shop・theme・assets・site を作る。
// 店名・文・値段は samples/<店>/wa13-content.json、写真は templates/wa-13/photos.txt（枠 短いID URL）から読む（この道具に店の中身を書かない）。
// 使い方：node tools/wa13-gen.mjs <店のID> → node tools/build.mjs samples/<店のID> → node tools/wa13-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa13-gen.mjs torinone）");
const DIR = `samples/${ID}`, LIST = "templates/wa-13/photos.txt";
const NOW = "2026-11-10T12:00:00+09:00";
const C = JSON.parse(fs.readFileSync(`${DIR}/wa13-content.json`, "utf8"));

// ---- 色（SPEC 3章）・書体（値段は font:body）
const KI = "#EFE3CF", CARD = "#F8F1E4", SHU = "#B5372A", INK = "#222222", WH = "#FFFFFF", MUTE = "#A9A095";
const H = "font:heading", B = "font:body";
const yen = (n) => `${n.toLocaleString("en-US")}円`;

// ---- ① shop.json
const open = { status: "open", periods: C.periods };
const weekly = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, d === C.closedDay ? { status: "closed" } : open]));
const items = {}, placements = {}, categories = {};
C.menu.groups.forEach((g, gi) => {
  categories[`cat_${g.id}`] = { menuId: "mnu_main", name: g.name, order: gi + 1 };
  g.rows.forEach((row, i) => {
    items[`itm_${row.id}`] = { name: row.name, photos: [], prices: [row.from ? { id: `prc_${row.id}`, type: "from", amount: row.price } : { id: `prc_${row.id}`, type: "fixed", amount: row.price }], status: "onSale", labels: [] };
    placements[`plc_${row.id}`] = { itemId: `itm_${row.id}`, categoryId: `cat_${g.id}`, order: i + 1, menuId: "mnu_main" };
  });
});
const shop = {
  schemaVersion: 1, shopId: `shp_${ID}`, updatedAt: NOW, isSample: true, demo: true,
  basic: { name: C.name, nameKana: C.nameKana, genre: { template: "restaurant", detail: C.genreDetail } },
  location: { prefecture: "兵庫県", city: "芦屋市", town: C.town },
  hours: { weekly },
  contact: { phone: C.phone },
  catalog: { menus: { mnu_main: { order: 1, name: C.menu.heading } }, categories, labels: { lbl_recommend: { name: "おすすめ", system: "recommended", order: 1 } }, items, placements },
};
fs.mkdirSync(`${DIR}/media`, { recursive: true });
fs.writeFileSync(`${DIR}/shop.json`, JSON.stringify(shop, null, 2) + "\n");

// ---- ③ theme.json（Dela Gothic One は 26px 以上の見出しだけ）
fs.writeFileSync(`${DIR}/theme.json`, JSON.stringify({ schemaVersion: 1,
  colors: { background: { value: KI }, surface: { value: CARD }, text: { value: INK }, textMuted: { value: INK }, primary: { value: SHU }, accent: { value: SHU }, line: { value: INK }, lineSoft: { value: INK } },
  fonts: { heading: "dela-gothic-one", body: "zen-kaku-gothic-new", accent: "zen-kaku-gothic-new" },
  textStyles: {
    pageTitle: { font: H, size: { pc: 88, sp: 52 }, lineHeight: 1.3, color: "theme:text" },
    heading: { font: H, size: { pc: 56, sp: 40 }, lineHeight: 1.36, color: "theme:text" },
    subheading: { font: B, size: { pc: 18, sp: 18 }, lineHeight: 1.6, color: "theme:text" },
    body: { font: B, size: { pc: 16, sp: 16 }, lineHeight: 1.75, color: "theme:text" },
    caption: { font: B, size: { pc: 14, sp: 14 }, lineHeight: 1.7, color: "theme:text" },
  } }, null, 2) + "\n");

// ---- 写真（SPEC 7章）
function webpSize(b) {
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") throw new Error("WebP ではありません");
  const kind = b.toString("latin1", 12, 16);
  if (kind === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
  throw new Error("WebP の大きさが読めません");
}
const rows = fs.readFileSync(LIST, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/));
const assets = {};
for (const [k, page, url] of rows) {
  const meta = C.photos[k];
  if (!meta) throw new Error(`写真 ${k} の説明が wa13-content.json にありません`);
  const id = `ast_ph${k}`, key = `${id}.webp`, f = `${DIR}/media/${key}`;
  if (!fs.existsSync(f)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`写真 ${k}: HTTP ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(f);
  assets[id] = { kind: "photo", file: { key, mime: "image/webp", ...webpSize(buf), bytes: buf.length, exifStripped: true }, uploadedAt: NOW, uploadedBy: "producer",
    origin: { kind: "stock", provider: "unsplash", pageUrl: `https://unsplash.com/photos/${page}` },
    rights: { basis: "licensed", confirmedAt: NOW, confirmedBy: "producer", note: "Unsplash License（架空のお店のデザイン見本）" }, slot: meta[0], alt: meta[1] };
}
fs.writeFileSync(`${DIR}/assets.json`, JSON.stringify({ schemaVersion: 1, assets }, null, 2) + "\n");

// ---- 配置の道具
const Pw = 1440, Sw = 390, r = (n) => Math.round(n * 10000) / 10000;
const box = (b, W_) => ({ ...b, x: r((b.x / W_) * 100), w: r((b.w / W_) * 100) });
const lay = (pc, sp) => ({ pc: box(pc, Pw), sp: box(sp, Sw) });
const els = {}, secs = {}, tablet = { els: {}, secs: {} };
const add = (id, e) => { els[id] = e; };
const tb = (id, css) => { tablet.els[id] = { ...(tablet.els[id] || {}), ...css }; };
const rem = (n) => `${r(n / 10)}rem`;
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (c) => (c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : [{ runs: [run(c)] }]);
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  add(id, { type: "text", z: x.z ?? 5, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: 0, ...(x.align ? { align: x.align } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: lay({ ...l[0], size: ps[0] }, { ...l[1], size: ss[0] }), ...(x.hidden ? { hidden: x.hidden } : {}) });
}
const sec = (id, name, pc, sp, more = {}) => { secs[id] = { name, background: { color: more.bg ?? "theme:background" }, minHeight: { pc, sp }, ...(more.anchor ? { anchor: more.anchor } : {}), ...(more.nav ? { nav: more.nav } : {}) }; };
const photo = (id, section, asset, z, pc, sp, crop = {}, darken) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1, ...crop }, ...(darken ? { darken } : {}) });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });
const line = (id, section, pc, sp) => rect(id, section, INK, 2, { ...pc, h: 1 }, { ...sp, h: 1 }, { opacity: 25 });
const inset = (b, n) => ({ x: b.x + n, y: b.y + n, w: b.w - n * 2, h: b.h - n * 2 });
const TEL = { kind: "shopPhone" }, RESERVE = { kind: "anchor", value: "pg_home#reserve" }, CT = { align: "center" }, RT = { align: "right" };
const PHONE = ["/contact/phone", "phone"], ADDR = ["/location", "address"];
const NAV = (label, order) => ({ label, order });
const M = 48; // タブレットの左右（SPEC：本文の列は画面幅の 70% 以上）
const COL = `calc(100% - ${rem(M * 2)})`;
const tT = (id, top, css = {}) => tb(id, { left: rem(M), width: COL, top: rem(top), ...css });
// 札（SPEC 2章）：外の地 → 朱の矩形 → 内の地（内側 12）。線の太さ 2px は 10 と 12 の差
function card(p, section, pc, sp, tab) {
  rect(`${p}_o`, section, CARD, 2, pc, sp);
  rect(`${p}_l`, section, SHU, 3, inset(pc, 10), inset(sp, 10));
  rect(`${p}_i`, section, CARD, 4, inset(pc, 12), inset(sp, 12));
  if (tab) {
    const frame = (n) => ({ left: rem(M + n), width: `calc(100% - ${rem((M + n) * 2)})`, top: rem(tab.top + n), height: rem(tab.h - n * 2) });
    tb(`${p}_o`, frame(0)); tb(`${p}_l`, frame(10)); tb(`${p}_i`, frame(12));
  }
}

// ---- ヘッダー（PC 80／SP 64、地は白木の不透明）
sec("sec_header", "ヘッダー", 80, 64);
add("hd_nav", { type: "nav", z: 5, section: "sec_header", style: { color: INK, font: B, spMenuBackground: KI }, layout: lay({ x: 560, y: 0, w: 640, h: 80, size: 15 }, { x: 290, y: 0, w: 84, h: 64 }) });
t("hd_name", "sec_header", C.name, [[26, 36, 0], [26, 36, 0]], H, INK, [{ x: 40, y: 22, w: 400, h: 36 }, { x: 20, y: 14, w: 260, h: 36 }], { link: { kind: "anchor", value: "pg_home#top" } });
rect("hd_btn", "sec_header", SHU, 2, { x: 1240, y: 18, w: 160, h: 44 }, { x: 0, y: 0, w: 10, h: 10 }, { link: RESERVE, radius: 50, hidden: { sp: true } });
t("hd_btn_t", "sec_header", C.labels.reserveButton, [[15, 22, 0], [15, 22, 0]], B, WH, [{ x: 1240, y: 29, w: 160, h: 22 }, { x: 0, y: 0, w: 10, h: 10 }], { weight: 700, ...CT, hidden: { sp: true } });
tb("hd_name", { left: rem(M) });

// ---- 1 最初の画面（PC：ヘッダーの下に 820、SP：780）。のれんの帯は矩形だけの飾りで、押せない
sec("sec_firstv", "最初の画面", 820, 780, { anchor: "top" });
photo("fv_ph", "sec_firstv", "ast_phfv", 1, { x: 0, y: 0, w: 1440, h: 820, fullBleed: true }, { x: 0, y: 0, w: 390, h: 780, fullBleed: true }, { fx: 50, fy: 70 });
rect("nr_top", "sec_firstv", SHU, 2, { x: 0, y: 0, w: 1440, h: 240 }, { x: 0, y: 0, w: 390, h: 184 });
const NP = [[0, 286], [290, 284], [578, 284], [866, 284], [1154, 286]], NS = [[0, 128], [132, 126], [262, 128]];
NP.forEach(([x, w], i) => {
  const s = NS[i] ?? [0, 10];
  rect(`nr${i + 1}`, "sec_firstv", SHU, 2, { x, y: 240, w, h: 120 }, { x: s[0], y: 184, w: s[1], h: 64 }, i > 2 ? { hidden: { sp: true } } : {});
});
t("fv_cp", "sec_firstv", C.catchCopy, [[88, 112, 0], [52, 68, 0]], H, WH, [{ x: 124, y: 64, w: 1192, h: 112 }, { x: 20, y: 24, w: 350, h: 68 }], { role: "pageTitle", ...CT, hidden: { sp: true } });
t("fv_cp2", "sec_firstv", { lines: C.catchCopyLines }, [[88, 112, 0], [52, 68, 0]], H, WH, [{ x: 124, y: 64, w: 1192, h: 224 }, { x: 20, y: 24, w: 350, h: 136 }], { role: "pageTitle", ...CT, hidden: { pc: true } });
{
  const pc = { x: 124, y: 636, w: 376, h: 136 }, sp = { x: 20, y: 660, w: 350, h: 104 };
  card("fv_c", "sec_firstv", pc, sp, { top: 692, h: 112 });
  t("fv_f1", "sec_firstv", C.facts[0], [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: 146, y: 674, w: 332, h: 28 }, { x: 42, y: 682, w: 306, h: 28 }], { weight: 700 });
  t("fv_f2", "sec_firstv", C.facts[1], [[14, 24, 0], [14, 24, 0]], B, INK, [{ x: 146, y: 710, w: 332, h: 24 }, { x: 42, y: 714, w: 306, h: 24 }]);
  tT("fv_f1", 716, { left: rem(M + 24), width: `calc(100% - ${rem((M + 24) * 2)})`, "font-size": "1.6rem", "line-height": "2.8rem" });
  tT("fv_f2", 750, { left: rem(M + 24), width: `calc(100% - ${rem((M + 24) * 2)})`, "font-size": "1.4rem", "line-height": "2.4rem" });
}
tb("fv_ph", { left: "0", width: "100%", top: "0", height: rem(836) });
tb("nr_top", { left: "0", width: "100%", top: "0", height: rem(208) });
[[0, 24.74], [25.26, 24.48], [50.26, 24.48], [75.26, 24.74]].forEach(([l, w], i) => tb(`nr${i + 1}`, { left: `${l}%`, width: `${w}%`, top: rem(208), height: rem(88), display: "block" }));
tb("nr5", { display: "none" });
tT("fv_cp", 56, { "font-size": "7.2rem", "line-height": "9.6rem", height: "9.6rem", display: "block" });
tb("fv_cp2", { display: "none" });
tablet.secs.sec_firstv = rem(836);

// ---- 2 紹介
sec("sec_about", "お店について", 746, 800, { anchor: "about", nav: NAV(C.labels.about, 1) });
t("ab_h", "sec_about", { lines: C.about.heading }, [[56, 76, 0], [40, 56, 0]], H, INK, [{ x: 124, y: 160, w: 620, h: 152 }, { x: 20, y: 96, w: 350, h: 112 }], { role: "heading" });
t("ab_p", "sec_about", C.about.body, [[18, 36, 0], [16, 32, 0]], B, INK, [{ x: 124, y: 352, w: 560, h: 144 }, { x: 20, y: 232, w: 350, h: 192 }]);
photo("ab_ph", "sec_about", "ast_phab1", 2, { x: 784, y: 160, w: 532, h: 426 }, { x: 0, y: 456, w: 390, h: 312 });
tT("ab_h", 96, { "font-size": "4.8rem", "line-height": "6.8rem", height: rem(136) });
tT("ab_p", 256, { "font-size": "1.8rem", "line-height": "3.6rem", height: rem(144) });
tT("ab_ph", 432, { height: `calc((100vw - ${rem(M * 2)}) * .625)` });
tablet.secs.sec_about = `calc(${rem(432 + 96)} + (100vw - ${rem(M * 2)}) * .625)`;

// ---- 3 串・酒・〆（線の入った札 3 枚。PC は中央だけ下にずらす）
const cardH = 480, spCardH = 460, tabCardH = 300;
sec("sec_kushi", "串・酒・〆", 824, 1636);
t("ks_h", "sec_kushi", C.kushi.heading, [[40, 56, 0], [40, 56, 0]], H, INK, [{ x: 124, y: 0, w: 1192, h: 56 }, { x: 20, y: 4, w: 350, h: 56 }], { role: "heading" });
tT("ks_h", 0, { "font-size": "4rem", "line-height": "5.6rem", height: rem(56) });
[["c1", 124, 120], ["c2", 532, 184], ["c3", 940, 120]].forEach(([k, x, y], i) => {
  const c = C.kushi.cards[i], sy = 88 + (spCardH + 32) * i, ty = 88 + (tabCardH + 24) * i;
  card(`k${i}`, "sec_kushi", { x, y, w: 376, h: cardH }, { x: 20, y: sy, w: 350, h: spCardH }, { top: ty, h: tabCardH });
  photo(`k${i}_ph`, "sec_kushi", `ast_ph${k}`, 5, { x: x + 22, y: y + 22, w: 332, h: 211 }, { x: 42, y: sy + 22, w: 306, h: 194 });
  t(`k${i}_w`, "sec_kushi", c.word, [[40, 48, 0], [40, 48, 0]], H, INK, [{ x: x + 22, y: y + 265, w: 332, h: 48 }, { x: 42, y: sy + 248, w: 306, h: 48 }], { role: "heading", ...CT });
  t(`k${i}_p`, "sec_kushi", c.body, [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: x + 44, y: y + 329, w: 288, h: 112 }, { x: 60, y: sy + 312, w: 270, h: 112 }]);
  const txL = M + 22 + 300 + 32, txW = `calc(100% - ${rem(txL + M + 32)})`;
  tb(`k${i}_ph`, { left: rem(M + 22), width: rem(300), top: rem(ty + 30), height: rem(240) });
  tb(`k${i}_w`, { left: rem(txL), width: txW, top: rem(ty + 44), "font-size": "4rem", "line-height": "4.8rem", "text-align": "left" });
  tb(`k${i}_p`, { left: rem(txL), width: txW, top: rem(ty + 108), height: rem(140), "font-size": "1.6rem", "line-height": "2.8rem" });
});
tablet.secs.sec_kushi = rem(88 + (tabCardH + 24) * 3 - 24 + 96);

// ---- 4 備長炭（全面の写真＋覆い）
sec("sec_fire", "備長炭", 720, 560);
photo("fr_ph", "sec_fire", "ast_phfire", 1, { x: 0, y: 0, w: 1440, h: 720, fullBleed: true }, { x: 0, y: 0, w: 390, h: 560, fullBleed: true }, {}, 45);
t("fr_h", "sec_fire", { lines: C.fire.heading }, [[56, 76, 0], [36, 52, 0]], H, WH, [{ x: 124, y: 360, w: 800, h: 152 }, { x: 20, y: 308, w: 350, h: 104 }], { role: "heading" });
t("fr_p", "sec_fire", C.fire.body, [[18, 32, 0], [16, 28, 0]], B, WH, [{ x: 124, y: 536, w: 560, h: 64 }, { x: 20, y: 428, w: 350, h: 84 }]);
tb("fr_ph", { left: "0", width: "100%", top: "0", height: rem(480) });
tT("fr_h", 192, { "font-size": "4.4rem", "line-height": "6.4rem", height: rem(128) });
tT("fr_p", 336, { "font-size": "1.8rem", "line-height": "3.2rem", height: rem(96) });
tablet.secs.sec_fire = rem(480);

// ---- 5 お品書き（線の枠の中に、左に見出し、右に値段の表と写真 2 枚）
const GH = 56, RH = 64, GAP = 32, rowsN = C.menu.groups.reduce((n, g) => n + g.rows.length, 0), tblH = GH * C.menu.groups.length + RH * rowsN + GAP * (C.menu.groups.length - 1);
const PT = 160, SPT = 176, TT = 176, Sp = 2;
const phP = PT + tblH + 48, phS = SPT + tblH + 32, phT = TT + tblH + 40;
const frP = { y: 80, h: phP + 224 + 80 - 80 }, frS = { y: 32, h: phS + 176 + 12 + 176 + 32 - 32 };
const pcH = frP.y + frP.h + 80, spH = frS.y + frS.h + 32;
sec("sec_menu", "お品書き", pcH, spH, { anchor: "menu", nav: NAV(C.labels.menu, 2) });
function frameLines(id, pc, sp) {
  rect(`${id}_t`, "sec_menu", SHU, 2, { x: pc.x, y: pc.y, w: pc.w, h: Sp }, { x: sp.x, y: sp.y, w: sp.w, h: Sp });
  rect(`${id}_b`, "sec_menu", SHU, 2, { x: pc.x, y: pc.y + pc.h - Sp, w: pc.w, h: Sp }, { x: sp.x, y: sp.y + sp.h - Sp, w: sp.w, h: Sp });
  rect(`${id}_l`, "sec_menu", SHU, 2, { x: pc.x, y: pc.y, w: Sp, h: pc.h }, { x: sp.x, y: sp.y, w: Sp, h: sp.h });
  rect(`${id}_r`, "sec_menu", SHU, 2, { x: pc.x + pc.w - Sp, y: pc.y, w: Sp, h: pc.h }, { x: sp.x + sp.w - Sp, y: sp.y, w: Sp, h: sp.h });
}
frameLines("mf", { x: 17, y: frP.y, w: 1406, h: frP.h }, { x: 8, y: frS.y, w: 374, h: frS.h });
const w2 = `((100vw - ${rem(M * 2)} - 2.4rem) / 2)`, phH = `(${w2} * ${r(184 / 324)})`;
const frT = { top: 32, h: `calc(${rem(phT)} + ${phH} + ${rem(40)})` };
tb("mf_t", { left: rem(16), width: `calc(100% - ${rem(32)})`, top: rem(frT.top), height: "2px" });
tb("mf_b", { left: rem(16), width: `calc(100% - ${rem(32)})`, top: `calc(${rem(frT.top)} + ${frT.h} - 2px)`, height: "2px" });
tb("mf_l", { left: rem(16), width: "2px", top: rem(frT.top), height: frT.h });
tb("mf_r", { left: "auto", right: rem(16), width: "2px", top: rem(frT.top), height: frT.h });
t("mn_h", "sec_menu", C.menu.heading, [[56, 76, 0], [40, 56, 0]], H, INK, [{ x: 178, y: PT, w: 260, h: 76 }, { x: 20, y: 72, w: 350, h: 56 }], { role: "heading" });
t("mn_n", "sec_menu", C.menu.note, [[14, 24, 0], [14, 24, 0]], B, INK, [{ x: 178, y: PT + 92, w: 240, h: 24 }, { x: 20, y: 132, w: 350, h: 24 }]);
tT("mn_h", 64, { "font-size": "4.8rem", "line-height": "6.8rem", height: rem(68) });
tT("mn_n", 136, { "font-size": "1.4rem", "line-height": "2.4rem" });
{
  let yP = PT, yS = SPT, yT = TT;
  const xP = 454, wP = 808;
  C.menu.groups.forEach((g, gi) => {
    t(`mg_${gi}`, "sec_menu", g.name, [[18, 28, 0], [18, 28, 0]], B, SHU, [{ x: xP, y: yP + 14, w: wP, h: 28 }, { x: 20, y: yS + 14, w: 350, h: 28 }], { weight: 700, role: "heading" });
    line(`ml_${gi}_top`, "sec_menu", { x: xP, y: yP + GH - 1, w: wP }, { x: 20, y: yS + GH - 1, w: 350 });
    tT(`mg_${gi}`, yT + 14, { "font-size": "1.8rem", "line-height": "2.8rem" });
    tT(`ml_${gi}_top`, yT + GH - 1);
    g.rows.forEach((row, i) => {
      const y1 = yP + GH + RH * i, ys1 = yS + GH + RH * i, yt1 = yT + GH + RH * i, base = `${gi}_${i}`;
      t(`mt_${base}`, "sec_menu", row.name, [[18, 28, 0], [16, 28, 0]], B, INK, [{ x: xP, y: y1 + 18, w: 560, h: 28 }, { x: 20, y: ys1 + 18, w: 240, h: 28 }], { weight: 500 });
      t(`mp_${base}`, "sec_menu", yen(row.price) + (row.from ? "〜" : ""), [[18, 28, 0], [16, 28, 0]], B, INK, [{ x: xP + 560, y: y1 + 18, w: 248, h: 28 }, { x: 260, y: ys1 + 18, w: 110, h: 28 }], { ...RT, weight: 700 });
      line(`ml_${base}`, "sec_menu", { x: xP, y: y1 + RH - 1, w: wP }, { x: 20, y: ys1 + RH - 1, w: 350 });
      tb(`mt_${base}`, { left: rem(M), width: `calc(100% - ${rem(M * 2 + 180)})`, top: rem(yt1 + 18), "font-size": "1.8rem", "line-height": "2.8rem" });
      tb(`mp_${base}`, { left: "auto", right: rem(M), width: rem(180), top: rem(yt1 + 18), "font-size": "1.8rem", "line-height": "2.8rem" });
      tT(`ml_${base}`, yt1 + RH - 1);
    });
    const n = GH + RH * g.rows.length + GAP;
    yP += n; yS += n; yT += n;
  });
}
photo("mn_ph1", "sec_menu", "ast_phmn1", 3, { x: 454, y: phP, w: 394, h: 224 }, { x: 40, y: phS, w: 310, h: 176 });
photo("mn_ph2", "sec_menu", "ast_phmn2", 3, { x: 868, y: phP, w: 394, h: 224 }, { x: 40, y: phS + 188, w: 310, h: 176 });
["mn_ph1", "mn_ph2"].forEach((id, i) => tb(id, { left: `calc(${rem(M)} + (${w2} + 2.4rem) * ${i})`, width: `calc(${w2})`, top: rem(phT), height: `calc(${phH})` }));
tablet.secs.sec_menu = `calc(${rem(phT + 40 + 32 + 32)} + ${phH})`;

// ---- 6 お席（大きな写真に札を 1 枚重ねる。札の高さは文の量に合わせて SPEC の 592 から 520 に詰めた）
sec("sec_seats", "お席", 856, 840, { anchor: "seats", nav: NAV(C.labels.seats, 3) });
photo("se_ph", "sec_seats", "ast_phse1", 1, { x: 124, y: 160, w: 808, h: 505 }, { x: 0, y: 64, w: 390, h: 244 });
{
  const pc = { x: 868, y: 256, w: 448, h: 520 }, sp = { x: 20, y: 276, w: 350, h: 468 }, seW = `(100vw - ${rem(M * 2)})`, seH = `(${seW} * .625)`;
  card("se_c", "sec_seats", pc, sp);
  const f = (n) => ({ left: rem(M + n), width: `calc(100% - ${rem((M + n) * 2)})`, top: `calc(${rem(64)} + ${seH} + ${rem(32 + n)})`, height: rem(248 - n * 2) });
  tb("se_c_o", f(0)); tb("se_c_l", f(10)); tb("se_c_i", f(12));
  photo("se_ph2", "sec_seats", "ast_phse2", 5, { x: 890, y: 278, w: 404, h: 240 }, { x: 42, y: 298, w: 306, h: 182 });
  t("se_h", "sec_seats", C.seats.heading, [[40, 56, 0], [40, 56, 0]], H, INK, [{ x: 912, y: 542, w: 360, h: 56 }, { x: 60, y: 504, w: 270, h: 56 }], { role: "heading" });
  t("se_s", "sec_seats", C.seats.summary, [[18, 28, 0], [18, 28, 0]], B, INK, [{ x: 912, y: 614, w: 360, h: 28 }, { x: 60, y: 576, w: 270, h: 28 }], { weight: 700 });
  t("se_p", "sec_seats", C.seats.body, [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: 912, y: 658, w: 360, h: 84 }, { x: 60, y: 620, w: 270, h: 112 }]);
  const txL = M + 24 + 300 + 32, txW = `calc(100% - ${rem(txL + M + 32)})`;
  const txTop = (n) => `calc(${rem(64)} + ${seH} + ${rem(32 + n)})`;
  tb("se_ph", { left: rem(M), width: `calc(100% - ${rem(M * 2)})`, top: rem(64), height: `calc(${seH})` });
  tb("se_ph2", { left: rem(M + 24), width: rem(300), top: txTop(24), height: rem(200) });
  tb("se_h", { left: rem(txL), width: txW, top: txTop(24), "font-size": "4rem", "line-height": "5.6rem" });
  tb("se_s", { left: rem(txL), width: txW, top: txTop(88), "font-size": "1.8rem", "line-height": "2.8rem" });
  tb("se_p", { left: rem(txL), width: txW, top: txTop(124), height: rem(112), "font-size": "1.6rem", "line-height": "2.8rem" });
  tablet.secs.sec_seats = `calc(${rem(64)} + ${seH} + ${rem(32 + 248 + 96)})`;
}

// ---- 7 ご案内
sec("sec_info", "ご案内", 816, 952, { anchor: "info", nav: NAV(C.labels.info, 4) });
t("in_h", "sec_info", C.info.heading, [[56, 76, 0], [40, 56, 0]], H, INK, [{ x: 124, y: 160, w: 536, h: 76 }, { x: 20, y: 96, w: 350, h: 56 }], { role: "heading" });
tT("in_h", 96, { "font-size": "4.8rem", "line-height": "6.8rem", height: rem(68) });
const irP = 296, irS = 176, irT = 200;
line("in_l0", "sec_info", { x: 124, y: irP, w: 536 }, { x: 20, y: irS, w: 350 });
tT("in_l0", irT);
const val = (v) => (v === "$address" ? ADDR : v === "$phone" ? PHONE : v);
C.info.rows.forEach(([k, v], i) => {
  const yp = irP + 72 * i, ys = irS + 72 * i, yt = irT + 72 * i;
  t(`in_k${i}`, "sec_info", k, [[14, 28, 0], [14, 28, 0]], B, INK, [{ x: 124, y: yp + 22, w: 104, h: 28 }, { x: 20, y: ys + 22, w: 80, h: 28 }], { weight: 700 });
  t(`in_v${i}`, "sec_info", val(v), [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: 228, y: yp + 22, w: 432, h: 28 }, { x: 100, y: ys + 22, w: 270, h: 28 }]);
  line(`in_l${i + 1}`, "sec_info", { x: 124, y: yp + 71, w: 536 }, { x: 20, y: ys + 71, w: 350 });
  tb(`in_k${i}`, { left: rem(M), width: rem(120), top: rem(yt + 22) });
  tb(`in_v${i}`, { left: rem(M + 120), width: `calc(100% - ${rem(M * 2 + 120)})`, top: rem(yt + 22) });
  tT(`in_l${i + 1}`, yt + 71);
});
const nR = C.info.rows.length, mapS = irS + 72 * nR + 40, mapT = irT + 72 * nR + 48;
rect("in_map", "sec_info", CARD, 2, { x: 716, y: irP, w: 600, h: 360 }, { x: 20, y: mapS, w: 350, h: 280 });
tT("in_map", mapT, { height: rem(400) });
secs.sec_info.minHeight = { pc: irP + 72 * nR + 160, sp: mapS + 280 + 96 };
tablet.secs.sec_info = rem(mapT + 400 + 96);

// ---- 8 ご予約（朱の全幅）
sec("sec_reserve", "ご予約", 360, 400, { anchor: "reserve", bg: SHU });
t("rs_h", "sec_reserve", C.reserve.heading, [[56, 76, 0], [34, 52, 0]], H, WH, [{ x: 124, y: 104, w: 880, h: 76 }, { x: 20, y: 88, w: 350, h: 52 }], { role: "heading" });
t("rs_t", "sec_reserve", PHONE, [[40, 56, 0], [32, 44, 0]], B, WH, [{ x: 124, y: 188, w: 880, h: 56 }, { x: 20, y: 156, w: 350, h: 44 }], { weight: 700 });
rect("rs_btn", "sec_reserve", KI, 2, { x: 1036, y: 148, w: 280, h: 64 }, { x: 20, y: 240, w: 350, h: 56 }, { link: TEL, radius: 50 });
t("rs_btn_t", "sec_reserve", C.reserve.button, [[18, 28, 0], [16, 24, 0]], B, INK, [{ x: 1036, y: 166, w: 280, h: 28 }, { x: 20, y: 256, w: 350, h: 24 }], { weight: 700, ...CT });
tT("rs_h", 64, { "font-size": "5.6rem", "line-height": "7.6rem", height: rem(76) });
tT("rs_t", 148, { "font-size": "4rem", "line-height": "5.6rem", height: rem(56) });
tT("rs_btn", 240, { height: rem(64) });
tT("rs_btn_t", 258, { "font-size": "1.8rem", "line-height": "2.8rem" });
tablet.secs.sec_reserve = rem(380);

// ---- 9 フッター（墨）
sec("sec_footer", "フッター", 380, 480, { bg: INK });
const F14 = [[14, 24, 0], [14, 24, 0]], FT = "#EFE3CF";
t("ft_n", "sec_footer", C.name, [[40, 56, 0], [40, 56, 0]], H, FT, [{ x: 124, y: 80, w: 800, h: 56 }, { x: 20, y: 56, w: 350, h: 56 }], { role: "heading" });
t("ft_a", "sec_footer", ADDR, F14, B, FT, [{ x: 124, y: 168, w: 380, h: 24 }, { x: 20, y: 144, w: 350, h: 24 }]);
t("ft_h", "sec_footer", { lines: C.footerHours }, F14, B, FT, [{ x: 540, y: 168, w: 380, h: 48 }, { x: 20, y: 184, w: 350, h: 48 }]);
t("ft_t", "sec_footer", PHONE, F14, B, FT, [{ x: 956, y: 168, w: 360, h: 24 }, { x: 20, y: 248, w: 350, h: 24 }]);
t("ft_c", "sec_footer", `© ${C.name}`, [[12, 18, 0], [12, 18, 0]], B, MUTE, [{ x: 124, y: 300, w: 800, h: 18 }, { x: 20, y: 400, w: 350, h: 18 }]);
tb("ft_n", { left: rem(M), width: COL, top: rem(64) });
tb("ft_a", { left: rem(M), width: `calc(50% - ${rem(M + 24)})`, top: rem(152) });
tb("ft_h", { left: `calc(50% + ${rem(24)})`, width: `calc(50% - ${rem(M + 24)})`, top: rem(152) });
tb("ft_t", { left: rem(M), width: `calc(50% - ${rem(M + 24)})`, top: rem(192) });
tb("ft_c", { left: rem(M), width: COL, top: rem(272) });
tablet.secs.sec_footer = rem(340);

// ---- 書き出し
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_13", canvas: { pcContentWidth: Pw, spDesignWidth: Sw },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_kushi", "sec_fire", "sec_menu", "sec_seats", "sec_info", "sec_reserve"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
fs.writeFileSync(`${DIR}/wa13-tablet.json`, JSON.stringify(tablet, null, 1) + "\n");
console.log(`wa13-gen: ${ID}：要素 ${Object.keys(els).length}／写真 ${rows.length} 枠`);
