#!/usr/bin/env node
// wa-23：templates/wa-23/SPEC.md の数値から samples/<店>/ の shop・theme・assets・site と、タブレットの配置・飾りの表（wa23-layout.json）を作る。
// 店名・文・素材・産地・品・値段は samples/<店>/wa23-content.json、写真は templates/wa-23/photos.txt（または --photos <ファイル>。書式「枠 短いID URL」）から読む（この道具に店の中身を書かない）。
// 使い方：node tools/wa23-gen.mjs <店のID> [--photos <ファイル>] → node tools/build.mjs samples/<店のID> → node tools/wa23-finish.mjs <店のID> → node tools/wa23-check.mjs <店のID>
import fs from "node:fs";
const argv = process.argv.slice(2);
const ID = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--photos");
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa23-gen.mjs ashinoha）");
const pi = argv.indexOf("--photos");
const DIR = `samples/${ID}`, LIST = pi >= 0 ? argv[pi + 1] : "templates/wa-23/photos.txt";
const NOW = "2026-11-10T12:00:00+09:00";
const C = JSON.parse(fs.readFileSync(`${DIR}/wa23-content.json`, "utf8"));
const stop = (m) => { throw new Error(`wa23-gen: ${m}`); };

// ---- 色（SPEC 3章）・書体（店名と大見出し Yuji Syuku、本文 Zen Kaku Gothic New、欧文と数字 Archivo）
const PAPER = "#FBFAF7", CREAM = "#F2EDE4", INK = "#161616", SOY = "#7A4A2A", MUTE = "#6B625A", GREEN_T = "#5A7549", BAMBOO = "#6E8B5A";
const RULE = "#D9CFC4", FT_A = "#D9D3C9", FT_B = "#A39B90";
const H = "font:heading", B = "font:body", E = "font:accent";
const num = (n) => n.toLocaleString("en-US");

// ---- ① shop.json
const weekly = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => { const p = C.week[d] || []; return [d, p.length ? { status: "open", periods: p.map((k) => C.periods[k]) } : { status: "closed" }]; }));
const items = {}, placements = {}, categories = {};
const M = C.menu;
const groups = [
  { id: "soba", name: M.photoHeading || M.big, rows: M.photoItems },
  { id: "more", name: M.moreLabel, rows: M.more },
  { id: "sides", name: M.sidesLabel, rows: M.sides },
].filter((g) => g.rows.length);
groups.forEach((g, gi) => {
  categories[`cat_${g.id}`] = { menuId: "mnu_main", name: g.name, order: gi + 1 };
  g.rows.forEach((row, i) => {
    if (!/^[a-z0-9_]{4,}$/.test(row.id)) stop(`品の ID ${row.id} は英小文字・数字の 4 字以上にしてください`);
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
  colors: { background: { value: PAPER }, surface: { value: CREAM }, text: { value: INK }, textMuted: { value: MUTE }, primary: { value: SOY }, accent: { value: BAMBOO }, line: { value: SOY }, lineSoft: { value: RULE } },
  fonts: { heading: "yuji-syuku", body: "zen-kaku-gothic-new", accent: "archivo-numerals" },
  textStyles: {
    pageTitle: { font: H, size: { pc: 104, sp: 72 }, lineHeight: 1.1538, color: "theme:text" },
    heading: { font: H, size: { pc: 44, sp: 30 }, lineHeight: 1.3636, color: "theme:text" },
    subheading: { font: H, size: { pc: 56, sp: 40 }, lineHeight: 1.2857, color: "theme:text" },
    body: { font: B, size: { pc: 17, sp: 15 }, lineHeight: 1.8824, color: "theme:text" },
    caption: { font: B, size: { pc: 13, sp: 13 }, lineHeight: 1.6923, color: "theme:textMuted" },
  } }, null, 2) + "\n");

// ---- 写真（SPEC 7章）。photos.txt の URL の w（と h）を、wa23-content.json の photos の 3 つ目の値（表示の最大幅の約 2 倍）に合わせて取る
function webpSize(b) {
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") throw new Error("WebP ではありません");
  const kind = b.toString("latin1", 12, 16);
  if (kind === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
  throw new Error("WebP の大きさが読めません");
}
const sized = (url, w) => {
  if (!w) return url;
  const u = new URL(url), w0 = Number(u.searchParams.get("w")), h0 = Number(u.searchParams.get("h"));
  if (w0 && w >= w0) return url;
  u.searchParams.set("w", String(w));
  if (h0 && w0) u.searchParams.set("h", String(Math.round((h0 * w) / w0)));
  return u.toString();
};
const rows = fs.readFileSync(LIST, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/));
const slots = new Set(rows.map((x) => x[0]));
const assets = {};
for (const [k, page, url] of rows) {
  const meta = C.photos[k];
  if (!meta) stop(`写真 ${k} の説明が wa23-content.json にありません`);
  const id = `ast_ph${k.replace(/-/g, "")}`, key = `${id}.webp`, f = `${DIR}/media/${key}`;
  if (!fs.existsSync(f)) {
    const res = await fetch(sized(url, meta[2]));
    if (!res.ok) stop(`写真 ${k}: HTTP ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(f);
  assets[id] = { kind: "photo", file: { key, mime: "image/webp", ...webpSize(buf), bytes: buf.length, exifStripped: true }, uploadedAt: NOW, uploadedBy: "producer",
    origin: { kind: "stock", provider: "unsplash", pageUrl: `https://unsplash.com/photos/${page}` },
    rights: { basis: "licensed", confirmedAt: NOW, confirmedBy: "producer", note: "Unsplash License（架空のお店のデザイン見本）" }, slot: meta[0], alt: meta[1] };
}
fs.writeFileSync(`${DIR}/assets.json`, JSON.stringify({ schemaVersion: 1, assets }, null, 2) + "\n");
const ph = (k, where) => { if (!slots.has(k)) stop(`${where} の写真 ${k} が写真の一覧（${LIST}）にありません`); return `ast_ph${k.replace(/-/g, "")}`; };

// ---- 配置の道具
// 端末は 3 つ：pc（1440 の設計）・sp（390 の設計）・tab（768 の設計。finish が 768〜1024 で rem ごと伸ばす）。
// pc と sp は site.json の layout、tab は wa23-layout.json の CSS（left・width は 768 に対する %、top・height・文字は rem）
const DW = { pc: 1440, sp: 390, tab: 768 };
const r = (n) => Math.round(n * 10000) / 10000;
const rem = (n) => `${r(n / 10)}rem`;
const pct = (n, d) => `${r((n / DW[d]) * 100)}%`;
const box = (b, d) => ({ ...b, x: r((b.x / DW[d]) * 100), w: r((b.w / DW[d]) * 100) });
const els = {}, secs = {};
const LY = { els: {}, secs: {}, hide: { pc: [], sp: [], tab: [] }, deco: { round: {}, circle: [], ring: [], dots: [], toc: [], card: [], nums: [], btn: [], band: [] }, stack: [], panelH: { pc: 0, tab: 0 }, header: { pc: 72, sp: 60, tab: 60 } };
const hideOn = (id, ...ds) => ds.forEach((d) => LY.hide[d].push(id));
const add = (id, e) => { if (els[id]) stop(`要素 ${id} が二重`); els[id] = e; };
const tabBox = (id, b, text) => { LY.els[id] = { left: pct(b.x, "tab"), width: pct(b.w, "tab"), top: rem(b.y), ...(text ? { "font-size": rem(b.s), "line-height": rem(b.lh) } : { height: rem(b.h) }), ...(b.align ? { "text-align": b.align } : {}) }; };
const run = (v) => (typeof v === "string" ? { text: v } : v.text !== undefined ? v : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (c) => (c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : c?.runs ? [{ runs: c.runs.map(run) }] : [{ runs: [run(c)] }]);
// 文字の幅の見積もり（em）：和文 1＋字間、数字 0.6、記号 0.3、ほかの英字 0.6
const emOf = (text, ls = 0) => { let em = 0; for (const ch of String(text)) em += /[0-9]/.test(ch) ? 0.6 : /[ :.,]/.test(ch) ? 0.3 : /[\x21-\x7e]/.test(ch) ? 0.6 + ls : 1 + ls; return em; };
// 行数の見積もり。文節で早めに折れる分を 0.92 で見込む
const lineCount = (text, size, width, ls = 0) => Math.max(1, Math.ceil((emOf(text, ls) * size) / (width * 0.92)));
const plainOf = (c) => (typeof c === "string" ? [c] : c?.lines ? c.lines.map((x) => (typeof x === "string" ? x : "")) : c?.runs ? [c.runs.map((x) => x.text || "").join("")] : [""]);
// 文字の箱。L＝{ pc:{x,y,w,s,lh,n?}, sp:{…}, tab:{…} }。sp の行送りは PC の比から（描画の仕組みが比を 1 つしか持たないため）。戻り値＝各端末の下端
function T(id, section, content, font, color, L, x = {}) {
  const ratio = L.pc.lh / L.pc.s, ls = x.ls ?? 0, out = {};
  const plain = x.est ?? plainOf(content);
  const lines = (d) => { const b = L[d]; if (b.n) return b.n; if (x.noWrap) return plain.length; return plain.reduce((a, s) => a + lineCount(s, b.s, b.w, ls), 0); };
  const hOf = (d) => { const lh = d === "sp" ? L.sp.s * ratio : L[d].lh ?? L[d].s * ratio; return { lh, h: lh * lines(d) }; };
  const pc = hOf("pc"), sp = hOf("sp"), tab = hOf("tab");
  add(id, { type: "text", z: x.z ?? 5, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ratio), letterSpacing: ls, ...(x.align ? { align: x.align } : {}), ...(x.noWrap ? { noWrap: true } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: { pc: box({ x: L.pc.x, y: L.pc.y, w: L.pc.w, h: r(pc.h), size: L.pc.s }, "pc"), sp: box({ x: L.sp.x, y: L.sp.y, w: L.sp.w, h: r(sp.h), size: L.sp.s }, "sp") } });
  tabBox(id, { ...L.tab, lh: tab.lh }, true);
  out.pc = L.pc.y + pc.h; out.sp = L.sp.y + sp.h; out.tab = L.tab.y + tab.h;
  return out;
}
const sec = (id, name, pc, sp, tab, more = {}) => { secs[id] = { name, background: { color: more.bg ?? "theme:background" }, minHeight: { pc: Math.round(pc), sp: Math.round(sp) }, ...(more.anchor ? { anchor: more.anchor } : {}), ...(more.nav ? { nav: more.nav } : {}) }; LY.secs[id] = rem(Math.round(tab)); return { pc: Math.round(pc), sp: Math.round(sp), tab: Math.round(tab) }; };
const lay2 = (L) => ({ pc: box(L.pc, "pc"), sp: box(L.sp, "sp") });
function P(id, section, asset, z, L, x = {}) { add(id, { type: "photo", z, section, asset, ...(x.circle ? { radius: 50 } : {}), layout: { pc: box({ ...L.pc, ratio: "custom" }, "pc"), sp: box({ ...L.sp, ratio: "custom" }, "sp") }, crop: { fx: 50, fy: 50, zoom: 1, ...(x.crop || {}) } }); tabBox(id, L.tab); if (x.circle) LY.deco.circle.push(id); }
function R(id, section, fill, z, L, x = {}) { const { kind = "rect", ...rest } = x; add(id, { type: "shape", z, kind, fill, section, layout: lay2(L), ...rest }); tabBox(id, L.tab); if (kind === "circle") LY.deco.circle.push(id); }
const round = (id, pc, sp, tab) => { LY.deco.round[id] = { pc, sp, tab }; };
const TEL = { kind: "shopPhone" }, TOP = { kind: "anchor", value: "pg_home#top" };
const CT = { align: "center" }, RT = { align: "right" };
const PHONE = ["/contact/phone", "phone"], ADDR = ["/location", "address"];
const NAV = (label, order) => ({ label, order });
const price = (n, ratio) => ({ runs: [{ text: num(n) }, { text: "円", marks: { font: B, sizeRatio: ratio } }] });
// 数字（時刻・席の数）だけを欧文の書体にする
const numRuns = (s) => ({ runs: String(s).split(/([0-9][0-9:,]*)/).filter(Boolean).map((t) => (/^[0-9]/.test(t) ? { text: t, marks: { font: E } } : { text: t })) });
const at = (pc, sp, tab) => ({ pc, sp, tab });
const max = (...a) => Math.max(...a);
const PAD = { pc: 120, sp: 64, tab: 96 };
const order = [];

// ---- 0 ヘッダー（sticky、PC 72／SP・タブレット 60、地は白の不透明、下に 1px の線）
sec("sec_header", "ヘッダー", 72, 60, 60);
add("hd_nav", { type: "nav", z: 5, section: "sec_header", style: { color: INK, font: B, spMenuBackground: PAPER }, layout: lay2({ pc: { x: 560, y: 0, w: 580, h: 72, size: 15 }, sp: { x: 282, y: 0, w: 84, h: 60 } }) });
tabBox("hd_nav", { x: 636, y: 0, w: 84, h: 60 });
const hdW = (s) => Math.ceil(emOf(C.shortName, 0.04) * s) + 8;
T("hd_name", "sec_header", C.shortName, H, INK, { pc: { x: 120, y: 18, w: hdW(28), s: 28, lh: 32 }, sp: { x: 28, y: 16, w: hdW(24), s: 24 }, tab: { x: 48, y: 16, w: hdW(24), s: 24, lh: 28 } }, { link: TOP, noWrap: true, ls: 0.04 });
T("hd_sub", "sec_header", C.genreWord, B, MUTE, { pc: { x: 120 + hdW(28) + 12, y: 28, w: Math.ceil(emOf(C.genreWord, 0.2) * 12) + 8, s: 12, lh: 16 }, sp: { x: 0, y: 0, w: 100, s: 12 }, tab: { x: 0, y: 0, w: 100, s: 12, lh: 16 } }, { weight: 500, ls: 0.2, link: TOP, noWrap: true });
hideOn("hd_sub", "sp", "tab");
R("hd_btn", "sec_header", SOY, 2, at({ x: 1180, y: 14, w: 140, h: 44 }, { x: 0, y: 0, w: 100, h: 20 }, { x: 0, y: 0, w: 100, h: 20 }), { link: TEL });
round("hd_btn", 22, 22, 22); LY.deco.btn.push("hd_btn");
T("hd_btn_t", "sec_header", C.labels.telButton, B, PAPER, { pc: { x: 1180, y: 26, w: 140, s: 14, lh: 20 }, sp: { x: 0, y: 0, w: 100, s: 14 }, tab: { x: 0, y: 0, w: 100, s: 14, lh: 20 } }, { weight: 700, ls: 0.12, ...CT, noWrap: true, z: 3 });
hideOn("hd_btn", "sp", "tab"); hideOn("hd_btn_t", "sp", "tab");

// ---- 1 最初の画面（白。左に英字・「中華そば」・店名・かな・青竹の線・コピー・添え書き、右に真上の一杯）
{
  const S = "sec_firstv", f = C.fv;
  T("fv_en", S, f.en, E, GREEN_T, { pc: { x: 120, y: 96, w: 360, s: 13, lh: 16 }, sp: { x: 28, y: 24, w: 334, s: 12 }, tab: { x: 48, y: 40, w: 672, s: 13, lh: 16 } }, { weight: 600, ls: 0.24, noWrap: true });
  T("fv_sub", S, C.genreWord, B, INK, { pc: { x: 120, y: 136, w: 360, s: 18, lh: 28 }, sp: { x: 28, y: 50, w: 334, s: 15 }, tab: { x: 48, y: 68, w: 672, s: 16, lh: 24 } }, { weight: 500, ls: 0.3, noWrap: true });
  T("fv_name", S, C.shortName, H, INK, { pc: { x: 120, y: 176, w: 380, s: 104, lh: 120 }, sp: { x: 28, y: 80, w: 334, s: 72 }, tab: { x: 48, y: 100, w: 672, s: 88, lh: 100 } }, { ls: 0.04, noWrap: true, role: "pageTitle" });
  T("fv_kana", S, C.shortKana, B, MUTE, { pc: { x: 120, y: 308, w: 360, s: 14, lh: 20 }, sp: { x: 28, y: 172, w: 334, s: 13 }, tab: { x: 48, y: 212, w: 672, s: 14, lh: 20 } }, { weight: 500, ls: 0.5, noWrap: true });
  P("fv_ph", S, ph("fv", "最初の画面"), 2, at({ x: 520, y: 48, w: 800, h: 640 }, { x: 12, y: 212, w: 366, h: 280 }, { x: 24, y: 256, w: 720, h: 480 }));
  R("fv_line", S, BAMBOO, 2, at({ x: 120, y: 352, w: 40, h: 3 }, { x: 28, y: 524, w: 40, h: 3 }, { x: 48, y: 768, w: 40, h: 3 }));
  LY.deco.dots.push("fv_line");
  T("fv_cp", S, { lines: f.copyLines }, H, INK, { pc: { x: 120, y: 384, w: 380, s: 36, lh: 56 }, sp: { x: 28, y: 548, w: 334, s: 28 }, tab: { x: 48, y: 792, w: 672, s: 34, lh: 52 } }, { ls: 0.06, noWrap: true, role: "heading" });
  const nb = T("fv_note", S, f.note, B, INK, { pc: { x: 120, y: 520, w: 380, s: 15, lh: 28 }, sp: { x: 28, y: 648, w: 334, s: 14 }, tab: { x: 48, y: 920, w: 672, s: 16, lh: 30 } }, { ls: 0.04 });
  sec(S, "最初の画面", max(nb.pc + 72, 760), max(nb.sp + 30, 704), max(nb.tab + 90, 1040), { anchor: "top" });
  order.push(S);
}

// ---- 2 営業の帯（黒。PC は 1 行、タブレット・SP は 2 行。項目の間に青竹の点。PC とタブレットは電話番号も）
if (C.band?.items?.length) {
  const S = "sec_band", I = C.band.items;
  const st = { pc: { s: 15, lh: 24, x0: 120, y: [16, 16] }, tab: { s: 15, lh: 24, x0: 48, y: [20, 52] }, sp: { s: 14, lh: 22.4, x0: 28, y: [20, 52] } };
  const pos = { pc: [], tab: [], sp: [] }, dotPos = { pc: [], tab: [], sp: [] };
  for (const d of ["pc", "tab", "sp"]) {
    const brk = d === "pc" ? 1e9 : d === "tab" ? C.band.tabBreak : C.band.spBreak;
    let x = st[d].x0, line = 0, k = 0;
    I.forEach((it, i) => {
      if (d === "sp" && it.sp === false) { pos[d][i] = null; dotPos[d][i] = null; return; }
      if (k === brk) { line = 1; x = st[d].x0; }
      const w = Math.ceil(emOf(it.text, 0.04) * st[d].s) + 6;
      if (x > st[d].x0) { dotPos[d][i] = { x: x + 10, y: st[d].y[line] + (st[d].lh - 6) / 2 }; x += 26; } else dotPos[d][i] = null;
      pos[d][i] = { x, y: st[d].y[line], w };
      x += w; k++;
    });
    pos[d].end = { x, line };
  }
  I.forEach((it, i) => {
    const L = {};
    for (const d of ["pc", "tab", "sp"]) L[d] = pos[d][i] ? { ...pos[d][i], s: st[d].s, lh: st[d].lh, n: 1 } : { x: 0, y: 0, w: 100, s: st[d].s, lh: st[d].lh, n: 1 };
    T(`bd_${i}`, S, numRuns(it.text), B, PAPER, L, { weight: 500, ls: 0.04, noWrap: true, est: [it.text] });
    if (!pos.sp[i]) hideOn(`bd_${i}`, "sp");
    const D = {};
    for (const d of ["pc", "tab", "sp"]) D[d] = dotPos[d][i] ? { ...dotPos[d][i], w: 6, h: 6 } : { x: 0, y: 0, w: 6, h: 6 };
    R(`bd_d${i}`, S, BAMBOO, 3, D, { kind: "circle" });
    LY.deco.dots.push(`bd_d${i}`);
    for (const d of ["pc", "tab", "sp"]) if (!dotPos[d][i]) hideOn(`bd_d${i}`, d);
  });
  // 電話番号：PC は右端に右揃え、タブレットは 2 行目の終わり、SP は出さない（段 10 の表とフッターにある）
  const tw = Math.ceil(emOf(C.phone.display) * 16) + 12;
  const te = pos.tab.end;
  R("bd_td", S, BAMBOO, 3, at({ x: 0, y: 0, w: 6, h: 6 }, { x: 0, y: 0, w: 6, h: 6 }, { x: te.x + 10, y: st.tab.y[1] + 9, w: 6, h: 6 }), { kind: "circle" });
  LY.deco.dots.push("bd_td"); hideOn("bd_td", "pc", "sp");
  T("bd_tel", S, PHONE, E, PAPER, { pc: { x: 1320 - tw, y: 16, w: tw, s: 16, lh: 24 }, sp: { x: 0, y: 0, w: tw, s: 16 }, tab: { x: te.x + 26, y: st.tab.y[1], w: tw, s: 16, lh: 24 } }, { weight: 600, ...RT, noWrap: true, link: TEL, est: [C.phone.display] });
  LY.els.bd_tel["text-align"] = "left";
  hideOn("bd_tel", "sp");
  if (pos.pc.end.x > 1320 - tw - 24) stop(`営業の帯の項目が長すぎます（PC で ${pos.pc.end.x}px まで）`);
  if (te.x + 26 + tw > 720) stop(`営業の帯の 2 行目が長すぎます（タブレットで ${te.x + 26 + tw}px）`);
  sec(S, "営業の帯", 56, 96, 96, { bg: INK });
  order.push(S);
}

// ---- 3 四つの素材の頭（白）★見せ場の入口
const EL = C.elements, EI = EL.items || [];
if (EI.length > 6) stop(`素材のパネルは 1〜6 枚です（${EI.length} 枚）`);
if (EI.length) {
  const S = "sec_sozai";
  T("so_h", S, EL.heading, H, INK, { pc: { x: 120, y: 120, w: 640, s: 50, lh: 65 }, sp: { x: 28, y: 64, w: 334, s: 30 }, tab: { x: 48, y: 64, w: 672, s: 38, lh: 54 } }, { ls: 0.04, role: "heading" });
  const hb = { pc: 185, sp: 64 + lineCount(EL.heading, 30, 334, 0.04) * 39, tab: 64 + lineCount(EL.heading, 38, 672, 0.04) * 54 };
  const eb = T("so_en", S, EL.en, E, SOY, { pc: { x: 120, y: 200, w: 640, s: 32, lh: 35 }, sp: { x: 28, y: hb.sp + 12, w: 334, s: 16 }, tab: { x: 48, y: hb.tab + 10, w: 672, s: 24, lh: 28 } }, { weight: 500 });
  const lb = T("so_p", S, EL.lead, B, INK, { pc: { x: 800, y: 128, w: 520, s: 17, lh: 32 }, sp: { x: 28, y: eb.sp + 20, w: 334, s: 15 }, tab: { x: 48, y: eb.tab + 24, w: 672, s: 16, lh: 30 } }, { ls: 0.04 });
  sec(S, "四つの素材", max(300, lb.pc + 40, eb.pc + 40), max(300, lb.sp + 24), max(320, lb.tab + 32), { anchor: "sozai", nav: NAV(C.labels.elements, 1) });
  order.push(S);
}

// ---- 4〜 素材のパネル（1 枚ずつの段。左の目次・中央の札・右の名前と文と表・右端の目次。PC・タブレットは finish が留まる重なりにする）
EI.forEach((it, i) => {
  const S = `sec_elem${i}`, N = EI.length, p = `e${i}`;
  if (!it.rows?.length || it.rows.length > 5) stop(`素材 ${it.name} の表の行は 1〜5 行です`);
  // 左の目次（PC は縦、タブレットは横 1 行、SP は出さない）
  const tStep = Math.min(168, Math.floor(672 / N));
  EI.forEach((o, j) => {
    const c = j === i ? SOY : MUTE, nn = String(j + 1).padStart(2, "0");
    T(`${p}_ln${j}`, S, `${nn}.`, E, c, { pc: { x: 120, y: 124 + 40 * j, w: 36, s: 16, lh: 24 }, sp: { x: 0, y: 0, w: 36, s: 16 }, tab: { x: 48 + tStep * j, y: 68, w: 30, s: 14, lh: 20 } }, { weight: 600, noWrap: true });
    T(`${p}_le${j}`, S, o.en, E, c, { pc: { x: 160, y: 120 + 40 * j, w: 180, s: 24, lh: 32 }, sp: { x: 0, y: 0, w: 180, s: 24 }, tab: { x: 80 + tStep * j, y: 64, w: tStep - 40, s: 18, lh: 28 } }, { weight: 600, noWrap: true });
    hideOn(`${p}_ln${j}`, "sp"); hideOn(`${p}_le${j}`, "sp");
    LY.deco.toc.push(`${p}_ln${j}`, `${p}_le${j}`);
    // 右端の目次（PC だけ）：番号（欧文 20）＋和名（16）を別の箱で 1 行に（混ぜると行の箱が高くなり、段が伸びるため）
    T(`${p}_rn${j}`, S, `${nn}.`, E, c, { pc: { x: 1224, y: 100 + 57 * j, w: 32, s: 20, lh: 24 }, sp: { x: 0, y: 0, w: 32, s: 20 }, tab: { x: 0, y: 0, w: 32, s: 20, lh: 24 } }, { weight: 600, noWrap: true });
    T(`${p}_rj${j}`, S, o.name, B, c, { pc: { x: 1262, y: 100 + 57 * j, w: 58, s: 16, lh: 24 }, sp: { x: 0, y: 0, w: 58, s: 16 }, tab: { x: 0, y: 0, w: 58, s: 16, lh: 24 } }, { weight: 500, noWrap: true });
    if (emOf(o.name) * 16 > 58) stop(`素材の名前 ${o.name} が右端の目次に収まりません`);
    hideOn(`${p}_rn${j}`, "sp", "tab"); hideOn(`${p}_rj${j}`, "sp", "tab");
    LY.deco.toc.push(`${p}_rj${j}`);
    LY.deco.toc.push(`${p}_rn${j}`);
  });
  R(`${p}_dot`, S, BAMBOO, 3, at({ x: 104, y: 133 + 40 * i, w: 6, h: 6 }, { x: 0, y: 0, w: 6, h: 6 }, { x: 36 + tStep * i, y: 75, w: 6, h: 6 }), { kind: "circle" });
  LY.deco.dots.push(`${p}_dot`); hideOn(`${p}_dot`, "sp");
  // SP の番号の行
  const nn = String(i + 1).padStart(2, "0");
  T(`${p}_sn`, S, `${nn} / ${String(N).padStart(2, "0")}`, E, SOY, { pc: { x: 0, y: 0, w: 70, s: 14, lh: 20 }, sp: { x: 28, y: 40, w: 70, s: 14 }, tab: { x: 0, y: 0, w: 70, s: 14, lh: 20 } }, { weight: 600, noWrap: true });
  T(`${p}_se`, S, it.en, E, MUTE, { pc: { x: 0, y: 0, w: 200, s: 14, lh: 20 }, sp: { x: 104, y: 40, w: 200, s: 14 }, tab: { x: 0, y: 0, w: 200, s: 14, lh: 20 } }, { weight: 600, noWrap: true });
  hideOn(`${p}_sn`, "pc", "tab"); hideOn(`${p}_se`, "pc", "tab");
  // 札
  R(`${p}_card`, S, CREAM, 1, at({ x: 360, y: 100, w: 400, h: 560 }, { x: 28, y: 136, w: 334, h: 300 }, { x: 48, y: 112, w: 672, h: 300 }));
  round(`${p}_card`, 40, 32, 40); LY.deco.card.push(`${p}_card`);
  P(`${p}_ph`, S, ph(it.photo, `素材 ${it.name}`), 2, at({ x: 410, y: 150, w: 300, h: 300 }, { x: 77, y: 168, w: 236, h: 236 }, { x: 78, y: 142, w: 240, h: 240 }), { circle: true, crop: it.crop });
  T(`${p}_no`, S, nn, E, SOY, { pc: { x: 500, y: 490, w: 120, s: 56, lh: 56 }, sp: { x: 0, y: 0, w: 120, s: 56 }, tab: { x: 360, y: 160, w: 120, s: 48, lh: 48, align: "left" } }, { weight: 600, ...CT, noWrap: true });
  T(`${p}_ce`, S, it.en.toUpperCase(), E, MUTE, { pc: { x: 470, y: 562, w: 180, s: 13, lh: 16 }, sp: { x: 0, y: 0, w: 180, s: 13 }, tab: { x: 360, y: 316, w: 200, s: 13, lh: 16, align: "left" } }, { weight: 600, ls: 0.24, ...CT, noWrap: true });
  hideOn(`${p}_no`, "sp"); hideOn(`${p}_ce`, "sp"); LY.deco.nums.push(`${p}_no`, `${p}_ce`);
  if (it.sub) {
    P(`${p}_sub`, S, ph(it.sub.photo, `素材 ${it.name} の 2 枚目`), 3, at({ x: 668, y: 400, w: 132, h: 132 }, { x: 258, y: 316, w: 96, h: 96 }, { x: 588, y: 172, w: 100, h: 100 }), { circle: true, crop: it.sub.crop });
    LY.deco.ring.push(`${p}_sub`);
    T(`${p}_cap`, S, it.sub.caption, B, MUTE, { pc: { x: 668, y: 540, w: 132, s: 13, lh: 20 }, sp: { x: 258, y: 414, w: 96, s: 13 }, tab: { x: 588, y: 280, w: 100, s: 13, lh: 20 } }, { weight: 500, ...CT, noWrap: true });
    LY.deco.nums.push(`${p}_cap`);
  }
  // 名前・文・表
  const nb = T(`${p}_nm`, S, it.name, H, INK, { pc: { x: 820, y: 100, w: 380, s: 56, lh: 72 }, sp: { x: 28, y: 68, w: 334, s: 40 }, tab: { x: 360, y: 228, w: 220, s: 48, lh: 64 } }, { ls: 0.04, noWrap: true, role: "subheading" });
  void nb;
  const xb = T(`${p}_tx`, S, it.text, B, INK, { pc: { x: 820, y: 196, w: 380, s: 16, lh: 30 }, sp: { x: 28, y: 468, w: 334, s: 15 }, tab: { x: 48, y: 444, w: 672, s: 16, lh: 30 } }, { ls: 0.04 });
  const ty = at(max(348, xb.pc + 32), max(588, xb.sp + 28), max(524, xb.tab + 28));
  const TW = { pc: { x: 820, k: 220, v: 160, rh: 60 }, sp: { x: 28, k: 206, v: 128, rh: 52 }, tab: { x: 48, k: 420, v: 252, rh: 56 } };
  const [hk, hv] = EL.colHeads;
  for (const [j, t] of [[0, hk], [1, hv]]) {
    const L = {};
    for (const d of ["pc", "sp", "tab"]) L[d] = { x: TW[d].x + (j ? TW[d].k : 0), y: ty[d], w: j ? TW[d].v : TW[d].k, s: 12, lh: 18, n: 1 };
    T(`${p}_th${j}`, S, t, B, GREEN_T, L, { weight: 500, ls: 0.12, noWrap: true });
  }
  it.rows.forEach(([k, v], j) => {
    const Y = {}, LL = {}, KK = {}, VV = {};
    for (const d of ["pc", "sp", "tab"]) {
      const w = TW[d]; Y[d] = ty[d] + 24 + w.rh * j;
      LL[d] = { x: w.x, y: Y[d], w: w.k + w.v, h: 1 };
      const ks = d === "sp" ? 15 : 16, vs = d === "sp" ? 14 : 15, lh = d === "sp" ? 24 : 26;
      KK[d] = { x: w.x, y: Y[d] + (w.rh - lh) / 2, w: w.k - 8, s: ks, lh, n: 1 };
      VV[d] = { x: w.x + w.k, y: Y[d] + (w.rh - lh) / 2, w: w.v, s: vs, lh, n: 1 };
      if (emOf(k, 0.04) * ks > w.k - 8 || emOf(v, 0.04) * vs > w.v) stop(`素材 ${it.name} の表「${k}／${v}」が列に収まりません（${d}）`);
    }
    R(`${p}_rl${j}`, S, RULE, 2, LL);
    T(`${p}_rk${j}`, S, k, B, INK, KK, { weight: 700, ls: 0.04, noWrap: true });
    T(`${p}_rv${j}`, S, v, B, SOY, VV, { ls: 0.04, noWrap: true });
  });
  const n = it.rows.length, end = {}, LL = {};
  for (const d of ["pc", "sp", "tab"]) { end[d] = ty[d] + 24 + TW[d].rh * n; LL[d] = { x: TW[d].x, y: end[d], w: TW[d].k + TW[d].v, h: 1 }; }
  R(`${p}_rl${n}`, S, RULE, 2, LL);
  const s = sec(S, `素材 ${it.name}`, max(760, end.pc + 88), max(880, end.sp + 44), max(860, end.tab + 88));
  LY.panelH.pc = max(LY.panelH.pc, s.pc); LY.panelH.tab = max(LY.panelH.tab, s.tab);
  LY.stack.push(S);
  order.push(S);
});

// ---- お品書き（白＋生成りの面）。左に英字・大きな字・文・写真、右に写真の札・ほかのそば・追加とごはん
{
  const S = "sec_menu", PI = M.photoItems, MO = M.more, SI = M.sides;
  if (PI.length > 3) stop("写真の札は 0〜3 品です（4 品目からは「ほかのそば」へ）");
  if (MO.length > 6) stop("ほかのそばは 0〜6 品です");
  if (SI.length > 4) stop("追加とごはんは 0〜4 品です");
  T("mn_tag", S, M.label, E, SOY, { pc: { x: 94, y: 80, w: 360, s: 30, lh: 30 }, sp: { x: 28, y: 48, w: 334, s: 22 }, tab: { x: 48, y: 64, w: 672, s: 28, lh: 28 } }, { weight: 500, noWrap: true });
  const bw = (s) => Math.ceil(emOf(M.big) * s) + 16;
  T("mn_big", S, M.big, H, INK, { pc: { x: 88, y: 124, w: bw(200), s: 200, lh: 200 }, sp: { x: 22, y: 80, w: bw(120), s: 120 }, tab: { x: 42, y: 104, w: bw(160), s: 160, lh: 160 } }, { noWrap: true, role: "heading" });
  T("mn_small", S, M.small, H, INK, { pc: { x: 94, y: 336, w: 360, s: 40, lh: 48 }, sp: { x: 28, y: 208, w: 334, s: 28 }, tab: { x: 48, y: 272, w: 672, s: 32, lh: 40 } }, { noWrap: true, ls: 0.04 });
  const lb = T("mn_p", S, M.lead, B, INK, { pc: { x: 94, y: 412, w: 340, s: 17, lh: 32 }, sp: { x: 28, y: 258, w: 334, s: 15 }, tab: { x: 48, y: 328, w: 672, s: 16, lh: 30 } }, { ls: 0.04 });
  let pcLeft = lb.pc;
  if (M.photo) { P("mn_lift", S, ph(M.photo, "お品書き"), 2, at({ x: 94, y: lb.pc + 80, w: 340, h: 425 }, { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100 })); hideOn("mn_lift", "sp", "tab"); pcLeft = lb.pc + 80 + 425; }
  // 写真の札（PC 3 列・SP 縦・タブレットは横長の行）
  let pcY = 80, sy = lb.sp + 40, ty = lb.tab + 48, pcCardEnd = 80;
  PI.forEach((it, i) => {
    const X = 520 + 287 * i;
    P(`mc_ph${i}`, S, ph(it.photo, `品 ${it.name}`), 2, at({ x: X, y: pcY, w: 252, h: 252 }, { x: 28, y: sy, w: 334, h: 334 }, { x: 48, y: ty, w: 240, h: 240 }), { crop: it.crop });
    const y1 = at(pcY + 272, sy + 334 + 20, ty);
    T(`mc_n${i}`, S, it.name, B, INK, { pc: { x: X, y: y1.pc, w: 156, s: 21, lh: 30 }, sp: { x: 28, y: y1.sp, w: 220, s: 18 }, tab: { x: 312, y: y1.tab, w: 280, s: 21, lh: 30 } }, { weight: 700, noWrap: true, role: "subheading" });
    T(`mc_y${i}`, S, price(it.price, 0.6), E, INK, { pc: { x: X + 162, y: y1.pc, w: 90, s: 22, lh: 30 }, sp: { x: 252, y: y1.sp, w: 110, s: 18 }, tab: { x: 600, y: y1.tab, w: 120, s: 22, lh: 30 } }, { weight: 600, ...RT, noWrap: true, est: [num(it.price) + "円"] });
    const db = T(`mc_d${i}`, S, it.desc, B, INK, { pc: { x: X, y: y1.pc + 44, w: 252, s: 15, lh: 27 }, sp: { x: 28, y: y1.sp + 36, w: 334, s: 14 }, tab: { x: 312, y: y1.tab + 44, w: 408, s: 15, lh: 27 } }, { ls: 0.04 });
    pcCardEnd = max(pcCardEnd, db.pc);
    sy = db.sp + 40; ty = max(db.tab, ty + 240) + 40;
  });
  const LBL = (id, text, y) => T(id, S, text, B, SOY, { pc: { x: 520, y: y.pc, w: 400, s: 15, lh: 24 }, sp: { x: 28, y: y.sp, w: 334, s: 15 }, tab: { x: 48, y: y.tab, w: 672, s: 15, lh: 24 } }, { weight: 700, ls: 0.12, noWrap: true });
  // ほかのそば（PC 2 列、SP・タブレット 1 列）
  let Y = at(max(560, pcCardEnd + 48), sy, ty);
  if (MO.length) {
    LBL("mo_lbl", M.moreLabel, Y);
    let rowTop = Y.pc + 36, s1 = Y.sp + 36, t1 = Y.tab + 36, rowEnd = rowTop;
    MO.forEach((it, i) => {
      const c = i % 2, X = c ? 950 : 520;
      if (i && !c) rowTop = rowEnd + 24;
      R(`mo_l${i}`, S, SOY, 2, at({ x: X, y: rowTop, w: 396, h: 2 }, { x: 28, y: s1, w: 334, h: 2 }, { x: 48, y: t1, w: 672, h: 2 }));
      T(`mo_n${i}`, S, it.name, B, INK, { pc: { x: X, y: rowTop + 16, w: 280, s: 21, lh: 30 }, sp: { x: 28, y: s1 + 14, w: 220, s: 18 }, tab: { x: 48, y: t1 + 16, w: 520, s: 21, lh: 30 } }, { weight: 700, noWrap: true, role: "subheading" });
      T(`mo_y${i}`, S, price(it.price, 0.6), E, INK, { pc: { x: X + 280, y: rowTop + 16, w: 116, s: 22, lh: 30 }, sp: { x: 252, y: s1 + 14, w: 110, s: 18 }, tab: { x: 600, y: t1 + 16, w: 120, s: 22, lh: 30 } }, { weight: 600, ...RT, noWrap: true, est: [num(it.price) + "円"] });
      const db = T(`mo_d${i}`, S, it.desc, B, INK, { pc: { x: X, y: rowTop + 56, w: 396, s: 15, lh: 27 }, sp: { x: 28, y: s1 + 50, w: 334, s: 14 }, tab: { x: 48, y: t1 + 56, w: 672, s: 15, lh: 27 } }, { ls: 0.04 });
      rowEnd = max(rowEnd, db.pc); s1 = db.sp + 28; t1 = db.tab + 28;
    });
    Y = at(rowEnd + 48, s1 + 12, t1 + 12);
  }
  // 追加とごはん（PC 2 列、SP・タブレット 1 列。写真＋右に文字）
  if (SI.length) {
    LBL("si_lbl", M.sidesLabel, Y);
    let rowTop = Y.pc + 36, s1 = Y.sp + 36, t1 = Y.tab + 36, rowEnd = rowTop;
    SI.forEach((it, i) => {
      const c = i % 2, X = c ? 950 : 520;
      if (i && !c) rowTop = rowEnd + 32;
      P(`si_ph${i}`, S, ph(it.photo, `品 ${it.name}`), 2, at({ x: X, y: rowTop, w: 150, h: 150 }, { x: 28, y: s1, w: 120, h: 120 }, { x: 48, y: t1, w: 140, h: 140 }), { crop: it.crop });
      const nw = { pc: 226, sp: 198, tab: 512 };
      const nb = T(`si_n${i}`, S, it.name, B, INK, { pc: { x: X + 170, y: rowTop, w: nw.pc, s: 18, lh: 28 }, sp: { x: 164, y: s1, w: nw.sp, s: 17 }, tab: { x: 208, y: t1, w: nw.tab, s: 18, lh: 28 } }, { weight: 700, role: "subheading" });
      const yb = T(`si_y${i}`, S, price(it.price, 0.72), E, INK, { pc: { x: X + 170, y: nb.pc + 2, w: 120, s: 18, lh: 28 }, sp: { x: 164, y: nb.sp + 2, w: 120, s: 17 }, tab: { x: 208, y: nb.tab + 2, w: 160, s: 18, lh: 28 } }, { weight: 600, noWrap: true, est: [num(it.price) + "円"] });
      const db = T(`si_d${i}`, S, it.desc, B, INK, { pc: { x: X + 170, y: yb.pc + 8, w: 226, s: 14, lh: 24 }, sp: { x: 164, y: yb.sp + 6, w: 198, s: 13 }, tab: { x: 208, y: yb.tab + 8, w: 512, s: 14, lh: 24 } }, { ls: 0.04 });
      rowEnd = max(rowEnd, db.pc, rowTop + 150); s1 = max(db.sp, s1 + 120) + 32; t1 = max(db.tab, t1 + 140) + 32;
    });
    Y = at(rowEnd + 40, s1 - 8, t1 - 8);
  }
  const nb = T("mn_note", S, M.note, B, MUTE, { pc: { x: 520, y: Y.pc, w: 600, s: 13, lh: 22 }, sp: { x: 28, y: Y.sp, w: 334, s: 13 }, tab: { x: 48, y: Y.tab, w: 672, s: 13, lh: 22 } }, { ls: 0.04 });
  const face = at(max(nb.pc + 88, pcLeft + 80, 1120), nb.sp + 48, nb.tab + 56);
  R("mn_bg", S, CREAM, 0, at({ x: 16, y: 0, w: 1408, h: face.pc }, { x: 12, y: 0, w: 366, h: face.sp }, { x: 24, y: 0, w: 720, h: face.tab }));
  sec(S, "お品書き", face.pc + PAD.pc, face.sp + PAD.sp, face.tab + PAD.tab, { anchor: "menu", nav: NAV(C.labels.menu, 2) });
  order.push(S);
}

// ---- 店のこと（白。左に寄せた写真、右に英字・見出し・文 2 段落。SP・タブレットは写真の下に）
{
  const S = "sec_about", K = C.about;
  const pp = at({ x: 16, y: 80, w: 808, h: 540 }, { x: 12, y: 0, w: 366, h: 244 }, { x: 24, y: 0, w: 720, h: 405 });
  P("ab_ph", S, ph(K.photo, "店のこと"), 2, pp);
  const y0 = at(120, 288, 453);
  T("ab_tag", S, K.label, E, SOY, { pc: { x: 884, y: y0.pc, w: 436, s: 30, lh: 30 }, sp: { x: 28, y: y0.sp, w: 334, s: 22 }, tab: { x: 48, y: y0.tab, w: 672, s: 28, lh: 28 } }, { weight: 500, noWrap: true });
  const hb = T("ab_h", S, K.heading, H, INK, { pc: { x: 884, y: y0.pc + 44, w: 436, s: 40, lh: 56 }, sp: { x: 28, y: y0.sp + 38, w: 334, s: 30 }, tab: { x: 48, y: y0.tab + 44, w: 672, s: 38, lh: 54 } }, { ls: 0.04, role: "heading" });
  let Y = at(hb.pc + 24, hb.sp + 20, hb.tab + 24), last = Y;
  K.paras.forEach((t, i) => {
    last = T(`ab_p${i}`, S, t, B, INK, { pc: { x: 884, y: Y.pc, w: 436, s: 17, lh: 32 }, sp: { x: 28, y: Y.sp, w: 334, s: 15 }, tab: { x: 48, y: Y.tab, w: 672, s: 16, lh: 30 } }, { ls: 0.04 });
    Y = at(last.pc + 16, last.sp + 14, last.tab + 16);
  });
  sec(S, "店のこと", max(760, last.pc + PAD.pc, 620 + PAD.pc), last.sp + PAD.sp, last.tab + PAD.tab, { anchor: "about", nav: NAV(C.labels.about, 3) });
  order.push(S);
}

// ---- ご案内（白＋生成りの面。左に地図、右の面に英字・見出し・表・電話のボタン。SP・タブレットは面の下に地図）
{
  const S = "sec_info", K = C.info, Rw = K.rows;
  const X = at(800, 28, 48), W = at(560, 334, 672);
  T("in_tag", S, K.label, E, SOY, { pc: { x: 800, y: 64, w: 560, s: 30, lh: 30 }, sp: { x: 28, y: 48, w: 334, s: 22 }, tab: { x: 48, y: 64, w: 672, s: 28, lh: 28 } }, { weight: 500, noWrap: true });
  const hb = T("in_h", S, K.heading, H, INK, { pc: { x: 800, y: 104, w: 560, s: 44, lh: 60 }, sp: { x: 28, y: 86, w: 334, s: 30 }, tab: { x: 48, y: 104, w: 672, s: 38, lh: 54 } }, { ls: 0.04, role: "heading", noWrap: true });
  let Y = at(hb.pc + 32, hb.sp + 28, hb.tab + 32);
  const KW = at(112, 80, 120);
  R("in_l0", S, SOY, 2, at({ x: 800, y: Y.pc, w: 560, h: 1 }, { x: 28, y: Y.sp, w: 334, h: 1 }, { x: 48, y: Y.tab, w: 672, h: 1 }));
  Rw.forEach(([k, v], i) => {
    const content = v === "$address" ? ADDR : v === "$phone" ? PHONE : Array.isArray(v) ? { lines: v } : v;
    const est = v === "$address" ? [`兵庫県芦屋市${C.town}`] : v === "$phone" ? [C.phone.display] : Array.isArray(v) ? v : [v];
    T(`in_k${i}`, S, k, B, INK, { pc: { x: 800, y: Y.pc + 18, w: KW.pc, s: 15, lh: 24 }, sp: { x: 28, y: Y.sp + 16, w: KW.sp, s: 14 }, tab: { x: 48, y: Y.tab + 18, w: KW.tab, s: 15, lh: 24 } }, { weight: 700, noWrap: true });
    const vb = T(`in_v${i}`, S, content, B, INK, { pc: { x: 912, y: Y.pc + 16, w: 448, s: 16, lh: 28 }, sp: { x: 108, y: Y.sp + 14, w: 254, s: 15 }, tab: { x: 168, y: Y.tab + 16, w: 552, s: 16, lh: 28 } }, { est, ls: 0.04, ...(v === "$phone" ? { link: TEL } : {}), ...(Array.isArray(v) || v === "$address" || v === "$phone" ? { noWrap: true } : {}) });
    Y = at(vb.pc + 16, vb.sp + 14, vb.tab + 16);
    R(`in_l${i + 1}`, S, SOY, 2, at({ x: 800, y: Y.pc, w: 560, h: 1 }, { x: 28, y: Y.sp, w: 334, h: 1 }, { x: 48, y: Y.tab, w: 672, h: 1 }));
  });
  const bt = at(Y.pc + 36, Y.sp + 32, Y.tab + 40), BW = at(300, 334, 320), BH = at(60, 56, 60);
  R("in_btn", S, SOY, 2, at({ x: 800, y: bt.pc, w: BW.pc, h: BH.pc }, { x: 28, y: bt.sp, w: BW.sp, h: BH.sp }, { x: 48, y: bt.tab, w: BW.tab, h: BH.tab }), { link: TEL });
  round("in_btn", 30, 28, 30); LY.deco.btn.push("in_btn");
  T("in_btn_t", S, K.button, B, PAPER, { pc: { x: 800, y: bt.pc + 18, w: BW.pc, s: 16, lh: 24 }, sp: { x: 28, y: bt.sp + 16, w: BW.sp, s: 16 }, tab: { x: 48, y: bt.tab + 18, w: BW.tab, s: 16, lh: 24 } }, { weight: 700, ls: 0.12, ...CT, noWrap: true, z: 3 });
  const face = at(max(700, bt.pc + BH.pc + 52), bt.sp + BH.sp + 40, bt.tab + BH.tab + 56);
  R("in_bg", S, CREAM, 0, at({ x: 736, y: 0, w: 688, h: face.pc }, { x: 12, y: 0, w: 366, h: face.sp }, { x: 24, y: 0, w: 720, h: face.tab }));
  const mp = at({ x: 16, y: 0, w: 704, h: face.pc }, { x: 12, y: face.sp + 12, w: 366, h: 300 }, { x: 24, y: face.tab + 16, w: 720, h: 400 });
  R("in_map", S, CREAM, 1, mp);
  void X; void W;
  sec(S, "ご案内", face.pc + PAD.pc, mp.sp.y + 300 + PAD.sp, mp.tab.y + 400 + PAD.tab, { anchor: "info", nav: NAV(C.labels.info, 4) });
  order.push(S);
}

// ---- フッター（黒の帯。左に店名・事実、右に青竹の点と著作権。架空の一文は共通の部品がこの下に出す）
{
  const S = "sec_footer", FH = C.footerHours;
  const Ln = (pc, sp, tab, s = 13) => ({ pc: { x: 120, y: pc, w: 600, s, lh: 24 }, sp: { x: 28, y: sp, w: 334, s }, tab: { x: 48, y: tab, w: 672, s, lh: 24 } });
  T("ft_nm", S, C.shortName, H, PAPER, { pc: { x: 120, y: 72, w: 300, s: 48, lh: 56 }, sp: { x: 28, y: 56, w: 334, s: 36 }, tab: { x: 48, y: 64, w: 672, s: 44, lh: 52 } }, { ls: 0.04, noWrap: true });
  T("ft_gn", S, C.genreWord, B, FT_A, { pc: { x: 120, y: 136, w: 300, s: 14, lh: 22 }, sp: { x: 28, y: 106, w: 334, s: 14 }, tab: { x: 48, y: 124, w: 672, s: 14, lh: 22 } }, { weight: 500, ls: 0.2, noWrap: true });
  T("ft_a", S, ADDR, B, FT_A, Ln(170, 144, 160), { noWrap: true, ls: 0.04, est: [`兵庫県芦屋市${C.town}`] });
  T("ft_t", S, PHONE, E, FT_A, Ln(194, 168, 184), { noWrap: true, link: TEL, est: [C.phone.display] });
  const hb = T("ft_hr", S, { lines: FH }, B, FT_A, Ln(218, 192, 208), { est: FH, ls: 0.04, noWrap: true });
  R("ft_dot", S, BAMBOO, 2, at({ x: 840, y: hb.pc - 52, w: 8, h: 8 }, { x: 28, y: hb.sp + 28, w: 8, h: 8 }, { x: 48, y: hb.tab + 28, w: 8, h: 8 }), { kind: "circle" });
  LY.deco.dots.push("ft_dot");
  const cb = T("ft_c", S, `© ${C.name}`, B, FT_B, { pc: { x: 840, y: hb.pc - 20, w: 480, s: 12, lh: 20 }, sp: { x: 28, y: hb.sp + 48, w: 334, s: 12 }, tab: { x: 48, y: hb.tab + 48, w: 672, s: 12, lh: 20 } }, { noWrap: true, ls: 0.04 });
  sec(S, "フッター", max(300, hb.pc + 72), max(cb.sp + 56, 300), cb.tab + 64, { bg: INK });
}

// ---- 書き出し
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_23", canvas: { pcContentWidth: 1440, spDesignWidth: 390 },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: order },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
fs.writeFileSync(`${DIR}/wa23-layout.json`, JSON.stringify(LY, null, 1) + "\n");
console.log(`wa23-gen: ${ID}：要素 ${Object.keys(els).length}／写真 ${rows.length} 枠／素材のパネル ${EI.length} 枚（高さ PC ${LY.panelH.pc}・タブレット ${LY.panelH.tab}）／品 ${M.photoItems.length}＋${M.more.length}＋${M.sides.length}`);
