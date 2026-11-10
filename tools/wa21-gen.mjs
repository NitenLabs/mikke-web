#!/usr/bin/env node
// wa-21：templates/wa-21/SPEC.md の数値から samples/<店>/ の shop・theme・assets・site と、タブレットの配置・飾り（影・傾け・水玉・札）の表（wa21-tablet.json）を作る。
// 店名・文・スパイス・カレー・あいがけ・値段は samples/<店>/wa21-content.json、写真は templates/wa-21/photos.txt（枠 短いID URL）から読む（この道具に店の中身を書かない）。
// 使い方：node tools/wa21-gen.mjs <店のID> → node tools/build.mjs samples/<店のID> → node tools/wa21-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa21-gen.mjs tsukitobasil）");
const DIR = `samples/${ID}`, LIST = "templates/wa-21/photos.txt";
const NOW = "2026-11-10T12:00:00+09:00";
const C = JSON.parse(fs.readFileSync(`${DIR}/wa21-content.json`, "utf8"));

// ---- 色（SPEC 3章）・書体（和文 Zen Kaku Gothic Antique、英字・数字 Bricolage Grotesque）
const PAPER = "#FFFDF8", CREAM = "#FBF3DF", INK = "#2F4A3A", MUTE = "#5E6B60", TUR = "#E3A82B", CHILI = "#C2452D";
const RULE = "#D6DBD3", RULE_CREAM = "#C8C9B6", BAND = "#F3E9CF", FT_A = "#E9E1CC", FT_B = "#C9BFA5";
const H = "font:heading", B = "font:body", E = "font:accent";
const num = (n) => n.toLocaleString("en-US");

// ---- ① shop.json
const weekly = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => { const p = C.week[d] || []; return [d, p.length ? { status: "open", periods: p.map((k) => C.periods[k]) } : { status: "closed" }]; }));
const items = {}, placements = {}, categories = {};
const groups = [
  { id: "curry", name: C.curry.heading, rows: C.curry.items.map((x) => ({ id: x.id, name: x.name, desc: x.desc, price: x.price })) },
  { id: "aigake", name: C.aigake.heading, rows: C.aigake.sets.map((x) => ({ id: x.id, name: x.name, desc: x.text, price: x.price })) },
  { id: "extras", name: C.aigake.extrasName, rows: C.aigake.extras },
];
groups.forEach((g, gi) => {
  categories[`cat_${g.id}`] = { menuId: "mnu_main", name: g.name, order: gi + 1 };
  g.rows.forEach((row, i) => {
    items[`itm_${row.id}`] = { name: row.name, ...(row.desc ? { description: row.desc } : {}), photos: [], prices: [{ id: `prc_${row.id}`, type: "fixed", amount: row.price }], status: "onSale", labels: [] };
    placements[`plc_${row.id}`] = { itemId: `itm_${row.id}`, categoryId: `cat_${g.id}`, order: i + 1, menuId: "mnu_main" };
  });
});
const shop = {
  schemaVersion: 1, shopId: `shp_${ID}`, updatedAt: NOW, isSample: true, demo: true,
  basic: { name: C.name, nameKana: C.nameKana, genre: { template: "restaurant", detail: C.genreDetail } },
  location: { prefecture: "兵庫県", city: "芦屋市", town: C.town, ...(C.geo ? { geo: C.geo } : {}) },
  hours: { weekly, ...(C.hoursNote ? { note: C.hoursNote } : {}) },
  contact: { phone: C.phone },
  ...(C.seats ? { facilities: { seats: C.seats } } : {}),
  catalog: { menus: { mnu_main: { order: 1, name: "お品書き" } }, categories, labels: { lbl_recommend: { name: "おすすめ", system: "recommended", order: 1 } }, items, placements },
};
fs.mkdirSync(`${DIR}/media`, { recursive: true });
fs.writeFileSync(`${DIR}/shop.json`, JSON.stringify(shop, null, 2) + "\n");

// ---- ③ theme.json
fs.writeFileSync(`${DIR}/theme.json`, JSON.stringify({ schemaVersion: 1,
  colors: { background: { value: PAPER }, surface: { value: CREAM }, text: { value: INK }, textMuted: { value: MUTE }, primary: { value: INK }, accent: { value: TUR }, line: { value: INK }, lineSoft: { value: RULE } },
  fonts: { heading: "zen-kaku-gothic-antique", body: "zen-kaku-gothic-antique", accent: "bricolage-grotesque" },
  textStyles: {
    pageTitle: { font: H, size: { pc: 72, sp: 48 }, lineHeight: 1.1667, color: "theme:text" },
    heading: { font: H, size: { pc: 32, sp: 24 }, lineHeight: 1.5, color: "theme:text" },
    subheading: { font: H, size: { pc: 24, sp: 22 }, lineHeight: 1.4167, color: "theme:text" },
    body: { font: B, size: { pc: 16, sp: 15 }, lineHeight: 1.875, color: "theme:text" },
    caption: { font: B, size: { pc: 13, sp: 13 }, lineHeight: 1.6923, color: "theme:textMuted" },
  } }, null, 2) + "\n");

// ---- 写真（SPEC 7章。photos.txt の URL は表示幅の約 2 倍の WebP）
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
  if (!meta) throw new Error(`写真 ${k} の説明が wa21-content.json にありません`);
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
// 端末は 3 つ：pc（1440 の設計）・sp（390 の設計）・tab（768 の設計。finish が 768〜1024 で rem ごと伸ばす）。
// pc と sp は site.json の layout、tab は wa21-tablet.json の CSS（left・width は 768 に対する %、top・height・文字は rem）
const DW = { pc: 1440, sp: 390, tab: 768 };
const r = (n) => Math.round(n * 10000) / 10000;
const rem = (n) => `${r(n / 10)}rem`;
const pct = (n, d) => `${r((n / DW[d]) * 100)}%`;
const box = (b, d) => ({ ...b, x: r((b.x / DW[d]) * 100), w: r((b.w / DW[d]) * 100) });
const els = {}, secs = {};
const TB = { els: {}, secs: {}, only: { pc: [], sp: [] }, deco: { shadow: {}, rotate: {}, frame: {}, dots: [], polka: [], tag: [], nametag: [], chip: [], band: [], w800: [] } };
const add = (id, e, only) => { els[id] = e; if (only) TB.only[only].push(id); };
const tabBox = (id, b, text) => { TB.els[id] = { left: pct(b.x, "tab"), width: pct(b.w, "tab"), top: rem(b.y), ...(text ? { "font-size": rem(b.s), "line-height": rem(b.lh) } : { height: rem(b.h) }) }; };
const run = (v) => (typeof v === "string" ? { text: v } : v.text !== undefined ? v : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (c) => (c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : c?.runs ? [{ runs: c.runs.map(run) }] : [{ runs: [run(c)] }]);
// 文字数からの行数の見積もり（和文 1 字＝1em＋字間、英数字は 0.55em）。文節で早めに折れる分を 0.92 で見込む
const lineCount = (text, size, width, ls = 0) => { let em = 0; for (const ch of String(text)) em += /[\x20-\x7e]/.test(ch) ? 0.55 + ls : 1 + ls; return Math.max(1, Math.ceil((em * size) / (width * 0.92))); };
const plainOf = (c) => (typeof c === "string" ? [c] : c?.lines ? c.lines.map((x) => (typeof x === "string" ? x : "")) : c?.runs ? [c.runs.map((x) => x.text || "").join("")] : [""]);
// 文字の箱。L＝{ pc:{x,y,w,s,lh,n?}, sp:{…}, tab:{…} }。sp の行送りは PC の比から（描画の仕組みが比を 1 つしか持たないため）。戻り値＝各端末の下端
function T(id, section, content, font, color, L, x = {}) {
  const ratio = L.pc.lh / L.pc.s, ls = x.ls ?? 0, out = {};
  const plain = x.est ?? plainOf(content);
  const lines = (d) => { const b = L[d]; if (b.n) return b.n; if (x.noWrap) return plain.length; return plain.reduce((a, s) => a + lineCount(s, b.s, x.raw ? (b.w / 0.92) * 1.06 : b.w, ls), 0); };
  const hOf = (d) => { const lh = d === "sp" ? L.sp.s * ratio : L[d].lh ?? L[d].s * ratio; return { lh, h: lh * lines(d) }; };
  const pc = hOf("pc"), sp = hOf("sp"), tab = hOf("tab");
  add(id, { type: "text", z: x.z ?? 5, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ratio), letterSpacing: ls, ...(x.align ? { align: x.align } : {}), ...(x.noWrap ? { noWrap: true } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: { pc: box({ x: L.pc.x, y: L.pc.y, w: L.pc.w, h: r(pc.h), size: L.pc.s }, "pc"), sp: box({ x: L.sp.x, y: L.sp.y, w: L.sp.w, h: r(sp.h), size: L.sp.s }, "sp") } }, x.only);
  tabBox(id, { ...L.tab, lh: tab.lh }, true);
  if (font === E && (x.weight ?? 400) === 700) TB.deco.w800.push(id); // データの太さは 900 まで 100 刻みで 800 が無いので 700 と書き、finish で 800（Bricolage の読み込んだ太さ）にする
  out.pc = L.pc.y + pc.h; out.sp = L.sp.y + sp.h; out.tab = L.tab.y + tab.h;
  return out;
}
const sec = (id, name, pc, sp, tab, more = {}) => { secs[id] = { name, background: { color: more.bg ?? "theme:background" }, minHeight: { pc: Math.round(pc), sp: Math.round(sp) }, ...(more.anchor ? { anchor: more.anchor } : {}), ...(more.nav ? { nav: more.nav } : {}) }; TB.secs[id] = rem(Math.round(tab)); };
const lay2 = (L) => ({ pc: box(L.pc, "pc"), sp: box(L.sp, "sp") });
function P(id, section, asset, z, L, crop = {}) { add(id, { type: "photo", z, section, asset, layout: { pc: box({ ...L.pc, ratio: "custom" }, "pc"), sp: box({ ...L.sp, ratio: "custom" }, "sp") }, crop: { fx: 50, fy: 50, zoom: 1, ...crop } }); tabBox(id, L.tab); }
function R(id, section, fill, z, L, x = {}) { const { only, kind = "rect", ...rest } = x; add(id, { type: "shape", z, kind, fill, section, layout: lay2(L), ...rest }, only); tabBox(id, L.tab); }
// 飾りの表（finish が CSS にする）。影＝各端末の右・下へのずらし（px）と色。傾け＝度（数か { pc, sp, tab }）
const shadow = (id, pc, sp, tab, color) => { TB.deco.shadow[id] = { pc, sp, tab, color }; };
const rotate = (id, deg) => { TB.deco.rotate[id] = deg; };
const TEL = { kind: "shopPhone" }, TOP = { kind: "anchor", value: "pg_home#top" };
const CT = { align: "center" }, RT = { align: "right" };
const PHONE = ["/contact/phone", "phone"], ADDR = ["/location", "address"];
const NAV = (label, order) => ({ label, order });
const price = (n, ratio) => ({ runs: [{ text: num(n) }, { text: "円", marks: { font: B, sizeRatio: ratio } }] });
const spiceOf = Object.fromEntries(C.spice.items.map((s) => [s.name, s]));
const PAD = { pc: 120, sp: 64, tab: 96 };
const M = { pc: 120, sp: 24, tab: 48 }, CW = { pc: 1200, sp: 342, tab: 672 };
const max = (...a) => Math.max(...a);

// 段の頭の札（英字・上下 2px の線・後ろにずらしたターメリックの面）と和文の見出し。y＝各端末の札の上端。戻り値＝見出しの下端
const TAG = { pc: [280, 52, 30], sp: [232, 46, 26], tab: [256, 50, 28] };
function head(S, pre, en, heading, X, Y, W) {
  const L = {}, LB = {};
  for (const d of ["pc", "sp", "tab"]) { const [w, h] = TAG[d]; L[d] = { x: X[d], y: Y[d], w, h }; LB[d] = { x: X[d] + 8, y: Y[d] + 6, w, h }; }
  R(`${pre}_tagbg`, S, TUR, 1, LB);
  T(`${pre}_tag`, S, en, E, INK, { pc: { ...L.pc, s: TAG.pc[2], lh: TAG.pc[1], n: 1 }, sp: { ...L.sp, s: TAG.sp[2], n: 1 }, tab: { ...L.tab, s: TAG.tab[2], lh: TAG.tab[1], n: 1 } }, { weight: 700, ls: 0.04, ...CT, noWrap: true });
  TB.deco.tag.push(`${pre}_tag`);
  const hs = { pc: [32, 48], sp: [24, 36], tab: [28, 42] };
  const Lh = {}; for (const d of ["pc", "sp", "tab"]) Lh[d] = { x: X[d], y: Y[d] + TAG[d][1] + 32, w: W[d], s: hs[d][0], lh: hs[d][1] };
  return T(`${pre}_h`, S, heading, H, INK, Lh, { weight: 700, ls: 0.04, role: "heading" });
}
const at = (pc, sp, tab) => ({ pc, sp, tab });

// ---- 0 ヘッダー（sticky、PC 72／SP・タブレット 60、地は白の不透明、下に深緑 2px）
sec("sec_header", "ヘッダー", 72, 60, 60);
add("hd_nav", { type: "nav", z: 5, section: "sec_header", style: { color: INK, font: B, spMenuBackground: PAPER }, layout: lay2({ pc: { x: 520, y: 0, w: 620, h: 72, size: 15 }, sp: { x: 282, y: 0, w: 84, h: 60 } }) });
tabBox("hd_nav", { x: 636, y: 0, w: 84, h: 60 });
T("hd_name", "sec_header", C.enName, E, INK, { pc: { x: 120, y: 12, w: 260, s: 24, lh: 28 }, sp: { x: 24, y: 16, w: 220, s: 22 }, tab: { x: 48, y: 16, w: 240, s: 22, lh: 28 } }, { weight: 700, link: TOP, noWrap: true });
T("hd_sub", "sec_header", C.name, B, MUTE, { pc: { x: 120, y: 42, w: 260, s: 12, lh: 16 }, sp: { x: 0, y: 0, w: 200, s: 12 }, tab: { x: 0, y: 0, w: 200, s: 12 } }, { weight: 500, ls: 0.12, link: TOP, noWrap: true, only: "pc" });
R("hd_btn", "sec_header", INK, 2, at({ x: 1180, y: 14, w: 140, h: 44 }, { x: 0, y: 0, w: 100, h: 20 }, { x: 0, y: 0, w: 100, h: 20 }), { link: TEL, only: "pc" });
T("hd_btn_t", "sec_header", C.labels.telButton, B, PAPER, { pc: { x: 1180, y: 26, w: 140, s: 14, lh: 20 }, sp: { x: 0, y: 0, w: 100, s: 14 }, tab: { x: 0, y: 0, w: 100, s: 14 } }, { weight: 700, ls: 0.12, ...CT, noWrap: true, only: "pc", z: 3 });

// ---- 1 最初の画面（左に店名とコピー、右に正方形の皿の写真と傾けたスパイスの写真を水玉の上に重ねる）
{
  const S = "sec_firstv", f = C.fv;
  T("fv_en", S, f.en, E, MUTE, { pc: { x: 120, y: 128, w: 520, s: 14, lh: 20 }, sp: { x: 24, y: 32, w: 342, s: 12 }, tab: { x: 48, y: 48, w: 672, s: 13, lh: 18 } }, { weight: 600, ls: 0.24, noWrap: true });
  T("fv_sub", S, C.genreWord, H, INK, { pc: { x: 120, y: 168, w: 520, s: 18, lh: 28 }, sp: { x: 24, y: 60, w: 342, s: 14 }, tab: { x: 48, y: 80, w: 672, s: 16, lh: 24 } }, { weight: 500, ls: 0.2, noWrap: true });
  T("fv_name", S, C.shortName, H, INK, { pc: { x: 120, y: 200, w: 560, s: 72, lh: 84 }, sp: { x: 24, y: 84, w: 342, s: 48 }, tab: { x: 48, y: 108, w: 672, s: 64, lh: 76 } }, { weight: 700, ls: 0.06, noWrap: true, role: "pageTitle" });
  T("fv_enname", S, C.enName, E, CHILI, { pc: { x: 120, y: 300, w: 520, s: 28, lh: 32 }, sp: { x: 24, y: 148, w: 342, s: 22 }, tab: { x: 48, y: 196, w: 672, s: 26, lh: 32 } }, { weight: 700, noWrap: true });
  // 3 つの点（ターメリック・深緑・唐辛子）。飾り
  [TUR, INK, CHILI].forEach((c, i) => { R(`fv_dot${i}`, S, c, 2, at({ x: 120 + 18 * i, y: 352, w: 10, h: 10 }, { x: 24 + 16 * i, y: 604, w: 10, h: 10 }, { x: 48 + 16 * i, y: 244, w: 10, h: 10 }), { kind: "circle" }); TB.deco.dots.push(`fv_dot${i}`); });
  T("fv_cp", S, { lines: f.copyLines }, H, INK, { pc: { x: 120, y: 392, w: 520, s: 40, lh: 60 }, sp: { x: 24, y: 628, w: 342, s: 28 }, tab: { x: 48, y: 276, w: 672, s: 36, lh: 54 } }, { weight: 700, ls: 0.06, noWrap: true, role: "heading" });
  const ff = T("fv_f", S, { lines: f.facts }, B, INK, { pc: { x: 120, y: 548, w: 520, s: 15, lh: 28 }, sp: { x: 24, y: 736, w: 342, s: 14 }, tab: { x: 48, y: 408, w: 672, s: 15, lh: 28 } }, { ls: 0.04 });
  // 写真の群
  R("fv_pd", S, PAPER, 1, at({ x: 840, y: 40, w: 520, h: 480 }, { x: 150, y: 192, w: 240, h: 200 }, { x: 452, y: 528, w: 268, h: 240 }));
  TB.deco.polka.push("fv_pd");
  P("fv_ph", S, "ast_phfv", 2, at({ x: 760, y: 96, w: 520, h: 520 }, { x: 24, y: 204, w: 330, h: 330 }, { x: 248, y: 560, w: 440, h: 440 }), { fx: 55, fy: 50 });
  shadow("fv_ph", 14, 8, 12, TUR);
  P("fv_ph2", S, "ast_phfv2", 3, at({ x: 680, y: 488, w: 240, h: 240 }, { x: 214, y: 452, w: 140, h: 140 }, { x: 72, y: 872, w: 220, h: 220 }));
  shadow("fv_ph2", 10, 6, 10, INK); rotate("fv_ph2", -5);
  T("fv_tag", S, f.tag, H, PAPER, { pc: { x: 1112, y: 572, w: 152, s: 15, lh: 36, n: 1 }, sp: { x: 24, y: 552, w: 128, s: 13, n: 1 }, tab: { x: 536, y: 1020, w: 152, s: 15, lh: 36, n: 1 } }, { weight: 700, ls: 0.08, ...CT, noWrap: true, z: 6 });
  TB.deco.nametag.push("fv_tag"); rotate("fv_tag", { pc: -3, sp: 0, tab: -3 });
  sec(S, "最初の画面", max(ff.pc, 728) + 104, max(ff.sp, 592) + 72, 1092 + 120, { anchor: "top" });
}

// ---- 2 スパイスの帳面（見せ場。左に札・見出し・文・写真、右にスパイスを 2 列。SP は 1 列、タブレットは写真の下に 2 列）
const SPI = C.spice.items;
if (SPI.length) {
  const S = "sec_spice", K = C.spice;
  const hb = head(S, "sp", K.en, K.heading, M, PAD, at(440, 342, 672));
  const pb = T("sp_p", S, K.body, B, INK, { pc: { x: 120, y: hb.pc + 24, w: 440, s: 16, lh: 30 }, sp: { x: 24, y: hb.sp + 20, w: 342, s: 15 }, tab: { x: 48, y: hb.tab + 24, w: 672, s: 16, lh: 30 } }, { ls: 0.06 });
  const ph = at({ x: 120, y: pb.pc + 40, w: 428, h: 285 }, { x: 24, y: pb.sp + 32, w: 334, h: 223 }, { x: 48, y: pb.tab + 40, w: 660, h: 440 });
  P("sp_ph", S, "ast_phspice", 2, ph);
  shadow("sp_ph", 12, 8, 12, TUR);
  // スパイスの行。PC：x640・x1000 の 2 列、行の高さは 2 つのうち高い方。タブレット：2 列。SP：1 列
  const cols = { pc: [640, 1000], tab: [48, 404] }, colW = { pc: 320, tab: 316 };
  const rowH = (d, a, b) => { const tw = d === "sp" ? 310 : colW[d] - 32, s = d === "sp" ? 14 : 15, lh = d === "sp" ? 22.4 : 24; const top = d === "sp" ? 68 : 76; return max(...[a, b].filter(Boolean).map((it) => top + lh * lineCount(it.text, s, d === "sp" ? tw / 0.92 : tw) + 20), d === "sp" ? 0 : 136); };
  let py = PAD.pc, ty = ph.tab.y + ph.tab.h + 56, sy = ph.sp.y + ph.sp.h + 48;
  const yPc = [], yTab = [], ySp = [];
  for (let i = 0; i < SPI.length; i += 2) { const h1 = rowH("pc", SPI[i], SPI[i + 1]), h2 = rowH("tab", SPI[i], SPI[i + 1]); yPc.push(py, py); yTab.push(ty, ty); py += h1; ty += h2; }
  SPI.forEach((it, i) => { ySp.push(sy); sy += rowH("sp", it); });
  SPI.forEach((it, i) => {
    const c = i % 2, X = { pc: cols.pc[c], tab: cols.tab[c], sp: 24 }, Y = { pc: yPc[i], tab: yTab[i], sp: ySp[i] }, Wd = { pc: 320, tab: 316, sp: 342 };
    R(`sp_l${i}`, S, RULE, 2, at({ x: X.pc, y: Y.pc, w: Wd.pc, h: 1 }, { x: 24, y: Y.sp, w: 342, h: 1 }, { x: X.tab, y: Y.tab, w: Wd.tab, h: 1 }));
    R(`sp_d${i}`, S, it.color, 3, at({ x: X.pc, y: Y.pc + 24, w: 18, h: 18 }, { x: 24, y: Y.sp + 22, w: 16, h: 16 }, { x: X.tab, y: Y.tab + 24, w: 18, h: 18 }), { kind: "circle" });
    TB.deco.dots.push(`sp_d${i}`);
    T(`sp_e${i}`, S, it.en, E, MUTE, { pc: { x: X.pc + 32, y: Y.pc + 20, w: 288, s: 12, lh: 16 }, sp: { x: 56, y: Y.sp + 18, w: 310, s: 12 }, tab: { x: X.tab + 32, y: Y.tab + 20, w: 284, s: 12, lh: 16 } }, { weight: 600, ls: 0.16, noWrap: true });
    const nw = (s) => [...it.name].length * s;
    T(`sp_n${i}`, S, it.name, H, INK, { pc: { x: X.pc + 32, y: Y.pc + 40, w: nw(20) + 4, s: 20, lh: 28 }, sp: { x: 56, y: Y.sp + 36, w: nw(18) + 4, s: 18 }, tab: { x: X.tab + 32, y: Y.tab + 40, w: nw(20) + 4, s: 20, lh: 28 } }, { weight: 700, noWrap: true, role: "subheading" });
    const cw = (s) => [...it.tag].length * s + 18;
    T(`sp_t${i}`, S, it.tag, B, INK, { pc: { x: X.pc + 32 + nw(20) + 16, y: Y.pc + 43, w: cw(12), s: 12, lh: 22, n: 1 }, sp: { x: 56 + nw(18) + 14, y: Y.sp + 39, w: cw(12), s: 12, n: 1 }, tab: { x: X.tab + 32 + nw(20) + 16, y: Y.tab + 43, w: cw(12), s: 12, lh: 22, n: 1 } }, { weight: 500, ...CT, noWrap: true });
    TB.deco.chip.push(`sp_t${i}`);
    T(`sp_x${i}`, S, it.text, B, INK, { pc: { x: X.pc + 32, y: Y.pc + 76, w: 288, s: 15, lh: 24 }, sp: { x: 56, y: Y.sp + 68, w: 310, s: 14, n: lineCount(it.text, 14, 310 / 0.92) }, tab: { x: X.tab + 32, y: Y.tab + 76, w: 284, s: 15, lh: 24 } });
  });
  const n = SPI.length;
  R(`sp_l${n}`, S, RULE, 2, at({ x: 640, y: py, w: 680, h: 1 }, { x: 24, y: sy, w: 342, h: 1 }, { x: 48, y: ty, w: 672, h: 1 }));
  const nb = T("sp_note", S, K.note, B, MUTE, { pc: { x: 640, y: py + 24, w: 680, s: 13, lh: 22 }, sp: { x: 24, y: sy + 20, w: 342, s: 13 }, tab: { x: 48, y: ty + 24, w: 672, s: 13, lh: 22 } });
  sec(S, "スパイスの帳面", max(nb.pc, ph.pc.y + ph.pc.h + 12) + PAD.pc, nb.sp + PAD.sp, nb.tab + PAD.tab, { anchor: "spice", nav: NAV(C.labels.spice, 1) });
}

// ---- 3 今日のカレー（正方形の写真のカードを PC 3 列、タブレットは横長の行、SP は縦に）
{
  const S = "sec_curry", K = C.curry, I = K.items;
  const hb = head(S, "cu", K.en, K.heading, M, PAD, at(720, 342, 672));
  const pb = T("cu_p", S, K.body, B, INK, { pc: { x: 120, y: hb.pc + 24, w: 720, s: 16, lh: 30 }, sp: { x: 24, y: hb.sp + 20, w: 342, s: 15 }, tab: { x: 48, y: hb.tab + 24, w: 672, s: 16, lh: 30 } }, { ls: 0.06 });
  const SH = [TUR, INK, CHILI];
  const pcTop = pb.pc + 56;
  let sy = pb.sp + 40, ty = pb.tab + 48, pcEnd = 0;
  I.forEach((it, i) => {
    const X = 120 + i * 414, pcRow = pcTop + Math.floor(i / 3) * 0;
    const tX = 348;
    // PC：写真 360 角 → 番号と英字 → 品名と値段 → 説明 → 使うスパイス
    // SP：写真 334 角 → 同じ順。タブレット：左に写真 260 角、右 x348 幅 372 に文字
    const ph = at({ x: X, y: pcRow, w: 360, h: 360 }, { x: 24, y: sy, w: 334, h: 334 }, { x: 48, y: ty, w: 260, h: 260 });
    P(`cu_ph${i}`, S, `ast_ph${it.photo}`, 2, ph);
    shadow(`cu_ph${i}`, 12, 8, 10, SH[i % 3]);
    const y0 = { pc: pcRow + 360 + 36, sp: sy + 334 + 32, tab: ty };
    T(`cu_n${i}`, S, it.num, E, CHILI, { pc: { x: X, y: y0.pc, w: 52, s: 32, lh: 32 }, sp: { x: 24, y: y0.sp, w: 52, s: 30 }, tab: { x: tX, y: y0.tab, w: 52, s: 32, lh: 32 } }, { weight: 700, noWrap: true });
    T(`cu_e${i}`, S, it.en, E, MUTE, { pc: { x: X + 60, y: y0.pc + 10, w: 300, s: 12, lh: 16 }, sp: { x: 84, y: y0.sp + 9, w: 282, s: 12 }, tab: { x: tX + 60, y: y0.tab + 10, w: 312, s: 12, lh: 16 } }, { weight: 600, ls: 0.16, noWrap: true });
    const y1 = { pc: y0.pc + 48, sp: y0.sp + 44, tab: y0.tab + 48 };
    T(`cu_t${i}`, S, it.name, H, INK, { pc: { x: X, y: y1.pc, w: 236, s: 24, lh: 34 }, sp: { x: 24, y: y1.sp, w: 220, s: 22 }, tab: { x: tX, y: y1.tab, w: 240, s: 24, lh: 34 } }, { weight: 700, noWrap: true, role: "subheading" });
    T(`cu_y${i}`, S, price(it.price, 0.6), E, INK, { pc: { x: X + 236, y: y1.pc, w: 124, s: 24, lh: 34 }, sp: { x: 246, y: y1.sp, w: 120, s: 22 }, tab: { x: tX + 240, y: y1.tab, w: 132, s: 24, lh: 34 } }, { weight: 600, ...RT, noWrap: true, est: [num(it.price) + "円"] });
    const y2 = { pc: y1.pc + 34 + 14, sp: y1.sp + 31 + 12, tab: y1.tab + 34 + 14 };
    const db = T(`cu_d${i}`, S, it.desc, B, INK, { pc: { x: X, y: y2.pc, w: 360, s: 15, lh: 27 }, sp: { x: 24, y: y2.sp, w: 342, s: 15 }, tab: { x: tX, y: y2.tab, w: 372, s: 15, lh: 27 } });
    // 使うスパイス：色の丸（段 2 と同じ色）＋名前を「・」でつないだ 1 行
    const sps = it.spices.map((nm) => { const s = spiceOf[nm]; if (!s) throw new Error(`カレー ${it.name} のスパイス ${nm} が段 2 の一覧にありません`); return s; });
    const y3 = { pc: db.pc + 14, sp: db.sp + 12, tab: db.tab + 14 };
    sps.forEach((s, j) => { R(`cu_s${i}_${j}`, S, s.color, 3, at({ x: X + 16 * j, y: y3.pc + 4, w: 10, h: 10 }, { x: 24 + 16 * j, y: y3.sp + 4, w: 10, h: 10 }, { x: tX + 16 * j, y: y3.tab + 4, w: 10, h: 10 }), { kind: "circle" }); TB.deco.dots.push(`cu_s${i}_${j}`); });
    const off = 16 * sps.length + 4;
    const sb = T(`cu_k${i}`, S, sps.map((s) => s.name).join("・"), B, MUTE, { pc: { x: X + off, y: y3.pc, w: 360 - off, s: 12, lh: 18 }, sp: { x: 24 + off, y: y3.sp, w: 342 - off, s: 12 }, tab: { x: tX + off, y: y3.tab, w: 372 - off, s: 12, lh: 18 } }, { ls: 0.04, noWrap: true });
    pcEnd = max(pcEnd, sb.pc);
    sy = sb.sp + 56;
    ty = max(sb.tab, ty + 260 + 10) + 56;
  });
  sec(S, "今日のカレー", pcEnd + PAD.pc, sy - 56 + PAD.sp, ty - 56 + PAD.tab, { anchor: "curry", nav: NAV(C.labels.curry, 2) });
}

// ---- 4 あいがけ（淡い生成りの面。左に二種・三種の値段とトッピング、右に傾けた正方形の写真 2 枚）
{
  const S = "sec_aigake", K = C.aigake;
  const top = PAD, inner = at(PAD.pc + 80, PAD.sp + 48, PAD.tab + 48), X = at(200, 24, 72), W = at(480, 342, 624);
  const hb = head(S, "ai", K.en, K.heading, X, inner, at(480, 342, 624));
  const pb = T("ai_p", S, K.body, B, INK, { pc: { x: 200, y: hb.pc + 24, w: 480, s: 16, lh: 30 }, sp: { x: 24, y: hb.sp + 20, w: 342, s: 15 }, tab: { x: 72, y: hb.tab + 24, w: 624, s: 16, lh: 30 } }, { ls: 0.06 });
  // 値段の 2 段（PC・SP は縦、タブレットは横に 2 列）
  let py = pb.pc + 40, sy = pb.sp + 32;
  const tY = pb.tab + 40;
  let tEnd = tY;
  K.sets.forEach((st, i) => {
    const tx = 72 + i * 332, tw = 292;
    R(`ai_l${i}`, S, INK, 2, at({ x: 200, y: py, w: 480, h: 2 }, { x: 24, y: sy, w: 342, h: 2 }, { x: tx, y: tY, w: tw, h: 2 }));
    T(`ai_n${i}`, S, st.name, H, INK, { pc: { x: 200, y: py + 22, w: 240, s: 22, lh: 32 }, sp: { x: 24, y: sy + 18, w: 170, s: 20 }, tab: { x: tx, y: tY + 22, w: 150, s: 20, lh: 30 } }, { weight: 700, noWrap: true, role: "subheading" });
    T(`ai_y${i}`, S, price(st.price, 0.36), E, INK, { pc: { x: 440, y: py + 12, w: 240, s: 56, lh: 56 }, sp: { x: 194, y: sy + 12, w: 172, s: 44 }, tab: { x: tx + 150, y: tY + 16, w: tw - 150, s: 40, lh: 40 } }, { weight: 700, ...RT, noWrap: true, est: [num(st.price) + "円"] });
    const xb = T(`ai_x${i}`, S, st.text, B, MUTE, { pc: { x: 200, y: py + 62, w: 240, s: 14, lh: 24 }, sp: { x: 24, y: sy + 62, w: 342, s: 13 }, tab: { x: tx, y: tY + 66, w: tw, s: 14, lh: 24 } });
    py = max(xb.pc, py + 76) + 24; sy = xb.sp + 24; tEnd = max(tEnd, xb.tab);
  });
  // 写真 2 枚（PC は面の右、SP とタブレットは値段の下に横に）
  const phS = sy + 8, phT = tEnd + 48;
  const PH = [
    { pc: { x: 760, y: 216, w: 260, h: 260 }, sp: { x: 28, y: phS, w: 150, h: 150 }, tab: { x: 96, y: phT, w: 240, h: 240 }, deg: -3, sh: INK },
    { pc: { x: 980, y: 452, w: 260, h: 260 }, sp: { x: 206, y: phS + 16, w: 150, h: 150 }, tab: { x: 432, y: phT + 24, w: 240, h: 240 }, deg: 4, sh: CHILI },
  ];
  K.photos.slice(0, 2).forEach((p, i) => {
    const g = PH[i];
    P(`ai_ph${i}`, S, `ast_ph${p.photo}`, 3 + i, g);
    shadow(`ai_ph${i}`, 8, 6, 8, g.sh); rotate(`ai_ph${i}`, g.deg); TB.deco.frame[`ai_ph${i}`] = { pc: 6, sp: 4, tab: 6 };
    const tw = (s) => [...p.tag].length * s * 1.08 + 30;
    T(`ai_tg${i}`, S, p.tag, H, PAPER, { pc: { x: g.pc.x + 14, y: g.pc.y + g.pc.h - 50, w: tw(15), s: 15, lh: 36, n: 1 }, sp: { x: g.sp.x + 8, y: g.sp.y + g.sp.h - 38, w: tw(13), s: 13, n: 1 }, tab: { x: g.tab.x + 12, y: g.tab.y + g.tab.h - 48, w: tw(15), s: 15, lh: 36, n: 1 } }, { weight: 700, ls: 0.08, ...CT, noWrap: true, z: 6 });
    TB.deco.nametag.push(`ai_tg${i}`); rotate(`ai_tg${i}`, g.deg);
  });
  // トッピングと飲みもの
  const ex0 = at(py + 16, phS + 16 + 150 + 40, phT + 24 + 240 + 48);
  T("ai_xe", S, K.extrasEn, E, MUTE, { pc: { x: 200, y: ex0.pc, w: 480, s: 12, lh: 16 }, sp: { x: 24, y: ex0.sp, w: 342, s: 12 }, tab: { x: 72, y: ex0.tab, w: 624, s: 12, lh: 16 } }, { weight: 600, ls: 0.16, noWrap: true });
  const RH = at(48, 46, 48), r0 = at(ex0.pc + 28, ex0.sp + 26, ex0.tab + 28);
  K.extras.forEach((x, i) => {
    const Y = at(r0.pc + RH.pc * i, r0.sp + RH.sp * i, r0.tab + RH.tab * i);
    R(`ai_rl${i}`, S, RULE_CREAM, 2, at({ x: 200, y: Y.pc, w: 480, h: 1 }, { x: 24, y: Y.sp, w: 342, h: 1 }, { x: 72, y: Y.tab, w: 624, h: 1 }));
    T(`ai_rn${i}`, S, x.name, B, INK, { pc: { x: 200, y: Y.pc + 10, w: 320, s: 16, lh: 28 }, sp: { x: 24, y: Y.sp + 10, w: 220, s: 15 }, tab: { x: 72, y: Y.tab + 10, w: 440, s: 16, lh: 28 } }, { noWrap: true });
    T(`ai_rp${i}`, S, price(x.price, 0.72), E, INK, { pc: { x: 520, y: Y.pc + 10, w: 160, s: 18, lh: 28 }, sp: { x: 246, y: Y.sp + 10, w: 120, s: 17 }, tab: { x: 536, y: Y.tab + 10, w: 160, s: 18, lh: 28 } }, { weight: 600, ...RT, noWrap: true, est: [num(x.price) + "円"] });
  });
  const n = K.extras.length, rEnd = at(r0.pc + RH.pc * n, r0.sp + RH.sp * n, r0.tab + RH.tab * n);
  R(`ai_rl${n}`, S, RULE_CREAM, 2, at({ x: 200, y: rEnd.pc, w: 480, h: 1 }, { x: 24, y: rEnd.sp, w: 342, h: 1 }, { x: 72, y: rEnd.tab, w: 624, h: 1 }));
  const nb = T("ai_note", S, K.note, B, MUTE, { pc: { x: 200, y: rEnd.pc + 16, w: 480, s: 13, lh: 22 }, sp: { x: 24, y: rEnd.sp + 14, w: 342, s: 13 }, tab: { x: 72, y: rEnd.tab + 16, w: 624, s: 13, lh: 22 } });
  const pEnd = at(max(nb.pc, 712 + 20) + 80, nb.sp + 48, nb.tab + 48);
  R("ai_bg", S, CREAM, 0, at({ x: 120, y: top.pc, w: 1200, h: pEnd.pc - top.pc }, { x: 0, y: top.sp, w: 390, h: pEnd.sp - top.sp }, { x: 24, y: top.tab, w: 720, h: pEnd.tab - top.tab }));
  sec(S, "あいがけ", pEnd.pc + PAD.pc, pEnd.sp + PAD.sp, pEnd.tab + PAD.tab, { anchor: "aigake", nav: NAV(C.labels.aigake, 3) });
}

// ---- 5 店のこと（左に 4:5 のカウンターの写真と水玉、右に札・見出し・文。下に大きな淡い英字の帯）
{
  const S = "sec_about", K = C.about;
  const ph = at({ x: 120, y: PAD.pc, w: 440, h: 550 }, { x: 24, y: PAD.sp, w: 334, h: 418 }, { x: 48, y: PAD.tab, w: 660, h: 495 });
  R("ab_pd", S, PAPER, 1, at({ x: 40, y: PAD.pc + 360, w: 280, h: 260 }, { x: 0, y: PAD.sp + 250, w: 200, h: 190 }, { x: 0, y: PAD.tab + 300, w: 260, h: 240 }));
  TB.deco.polka.push("ab_pd");
  P("ab_ph", S, "ast_phcounter", 2, ph);
  shadow("ab_ph", 12, 8, 12, INK);
  const Y0 = at(PAD.pc + 80, ph.sp.y + ph.sp.h + 72, ph.tab.y + ph.tab.h + 72);
  const hb = head(S, "ab", K.en, K.heading, at(680, 24, 48), Y0, at(520, 342, 672));
  const p1 = T("ab_p1", S, K.texts[0], B, INK, { pc: { x: 680, y: hb.pc + 24, w: 520, s: 16, lh: 32 }, sp: { x: 24, y: hb.sp + 20, w: 342, s: 15 }, tab: { x: 48, y: hb.tab + 24, w: 672, s: 16, lh: 32 } }, { ls: 0.06 });
  const p2 = T("ab_p2", S, K.texts[1], B, INK, { pc: { x: 680, y: p1.pc + 16, w: 520, s: 16, lh: 32 }, sp: { x: 24, y: p1.sp + 14, w: 342, s: 15 }, tab: { x: 48, y: p1.tab + 16, w: 672, s: 16, lh: 32 } }, { ls: 0.06 });
  const bY = at(max(p2.pc, ph.pc.y + 550) + 72, p2.sp + 48, p2.tab + 56);
  const bb = T("ab_band", S, K.band, E, BAND, { pc: { x: 0, y: bY.pc, w: 1440, s: 112, lh: 112, n: 1 }, sp: { x: 0, y: bY.sp, w: 390, s: 64, n: 1 }, tab: { x: 0, y: bY.tab, w: 768, s: 88, lh: 88, n: 1 } }, { weight: 700, noWrap: true, z: 1 });
  TB.deco.band.push("ab_band");
  sec(S, "店のこと", bb.pc + 64, bb.sp + 40, bb.tab + 56, { anchor: "about", nav: NAV(C.labels.about, 4) });
}

// ---- 6 ご案内（左に札・見出し・罫線の行・電話のボタン、右に地図）
{
  const S = "sec_info", K = C.info, Rw = K.rows;
  const hb = head(S, "in", K.en, K.heading, M, PAD, at(520, 342, 672));
  const y0 = at(hb.pc + 32, hb.sp + 28, hb.tab + 32);
  let Y = { ...y0 };
  R("in_l0", S, INK, 2, at({ x: 120, y: Y.pc, w: 520, h: 1 }, { x: 24, y: Y.sp, w: 342, h: 1 }, { x: 48, y: Y.tab, w: 672, h: 1 }));
  const telRow = Rw.findIndex(([, v]) => v === "$phone");
  Rw.forEach(([k, v], i) => {
    const content = v === "$address" ? ADDR : v === "$phone" ? PHONE : Array.isArray(v) ? { lines: v } : v;
    const est = v === "$address" ? [`兵庫県芦屋市${C.town}`] : v === "$phone" ? [C.phone.display] : Array.isArray(v) ? v : [v];
    T(`in_k${i}`, S, k, H, INK, { pc: { x: 120, y: Y.pc + 18, w: 112, s: 15, lh: 24 }, sp: { x: 24, y: Y.sp + 16, w: 80, s: 14 }, tab: { x: 48, y: Y.tab + 18, w: 120, s: 15, lh: 24 } }, { weight: 700, noWrap: true });
    const vb = T(`in_v${i}`, S, content, B, INK, { pc: { x: 232, y: Y.pc + 16, w: 408, s: 16, lh: 28 }, sp: { x: 104, y: Y.sp + 14, w: 262, s: 15 }, tab: { x: 168, y: Y.tab + 16, w: 552, s: 16, lh: 28 } }, { est, raw: true, ...(v === "$phone" ? { link: TEL } : {}) });
    Y = at(vb.pc + 16, vb.sp + 14, vb.tab + 16);
    R(`in_l${i + 1}`, S, INK, 2, at({ x: 120, y: Y.pc, w: 520, h: 1 }, { x: 24, y: Y.sp, w: 342, h: 1 }, { x: 48, y: Y.tab, w: 672, h: 1 }));
  });
  void telRow;
  const bt = at(Y.pc + 40, Y.sp + 32, Y.tab + 40);
  R("in_btn", S, INK, 2, at({ x: 120, y: bt.pc, w: 320, h: 64 }, { x: 24, y: bt.sp, w: 334, h: 60 }, { x: 48, y: bt.tab, w: 320, h: 64 }), { link: TEL });
  shadow("in_btn", 6, 4, 6, TUR);
  T("in_btn_t", S, K.button, H, PAPER, { pc: { x: 120, y: bt.pc + 20, w: 320, s: 17, lh: 24 }, sp: { x: 24, y: bt.sp + 18, w: 334, s: 17 }, tab: { x: 48, y: bt.tab + 20, w: 320, s: 17, lh: 24 } }, { weight: 700, ls: 0.12, ...CT, noWrap: true, z: 3 });
  const mp = at({ x: 712, y: y0.pc, w: 596, h: 440 }, { x: 24, y: bt.sp + 60 + 48, w: 334, h: 300 }, { x: 48, y: bt.tab + 64 + 56, w: 660, h: 400 });
  R("in_map", S, CREAM, 2, mp);
  shadow("in_map", 12, 8, 12, TUR);
  sec(S, "ご案内", max(bt.pc + 64, mp.pc.y + 440 + 12) + PAD.pc, mp.sp.y + 300 + 8 + PAD.sp, mp.tab.y + 400 + 12 + PAD.tab, { anchor: "info", nav: NAV(C.labels.info, 5) });
}

// ---- 7 フッター（深緑。左に英字の店名・和文の店名・事実、右に著作権）
{
  const S = "sec_footer", FH = C.footerHours;
  const Ln = (pc, sp, tab, s = 13) => ({ pc: { x: 120, y: pc, w: 560, s, lh: 24 }, sp: { x: 24, y: sp, w: 342, s }, tab: { x: 48, y: tab, w: 672, s, lh: 24 } });
  T("ft_en", S, C.enName, E, PAPER, { pc: { x: 120, y: 72, w: 560, s: 44, lh: 48 }, sp: { x: 24, y: 56, w: 342, s: 32 }, tab: { x: 48, y: 64, w: 672, s: 40, lh: 44 } }, { weight: 700, noWrap: true });
  T("ft_nm", S, C.name, H, FT_A, { pc: { x: 120, y: 128, w: 560, s: 14, lh: 22 }, sp: { x: 24, y: 100, w: 342, s: 14 }, tab: { x: 48, y: 116, w: 672, s: 14, lh: 22 } }, { weight: 500, ls: 0.12, noWrap: true });
  T("ft_a", S, ADDR, B, FT_A, Ln(174, 142, 162), { noWrap: true, est: [`兵庫県芦屋市${C.town}`] });
  T("ft_t", S, PHONE, B, FT_A, Ln(198, 166, 186), { noWrap: true, link: TEL, est: [C.phone.display] });
  const hb = T("ft_hr", S, { lines: FH }, B, FT_A, Ln(222, 190, 210), { est: FH });
  T("ft_c", S, `© ${C.name}`, B, FT_B, { pc: { x: 840, y: hb.pc - 20, w: 480, s: 12, lh: 20 }, sp: { x: 24, y: hb.sp + 32, w: 342, s: 12 }, tab: { x: 48, y: hb.tab + 32, w: 672, s: 12, lh: 20 } }, { noWrap: true, align: "right" });
  TB.els.ft_c["text-align"] = "left";
  sec(S, "フッター", hb.pc + 72, hb.sp + 32 + 20 + 56, hb.tab + 32 + 20 + 64, { bg: INK });
}

// ---- 書き出し
const order = ["sec_firstv", "sec_spice", "sec_curry", "sec_aigake", "sec_about", "sec_info"].filter((s) => secs[s]);
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_21", canvas: { pcContentWidth: 1440, spDesignWidth: 390 },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: order },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
fs.writeFileSync(`${DIR}/wa21-tablet.json`, JSON.stringify(TB, null, 1) + "\n");
console.log(`wa21-gen: ${ID}：要素 ${Object.keys(els).length}／写真 ${rows.length} 枠／スパイス ${SPI.length} 種／カレー ${C.curry.items.length} 品`);
