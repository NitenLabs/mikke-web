#!/usr/bin/env node
// wa-19：templates/wa-19/SPEC.md の数値から samples/<店>/ の shop・theme・assets・site とタブレットの配置（wa19-tablet.json）を作る。
// 店名・文・コースの流れ・品書き・値段は samples/<店>/wa19-content.json、写真は templates/wa-19/photos.txt（枠 短いID URL）から読む（この道具に店の中身を書かない）。
// 使い方：node tools/wa19-gen.mjs <店のID> → node tools/build.mjs samples/<店のID> → node tools/wa19-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa19-gen.mjs lueur）");
const DIR = `samples/${ID}`, LIST = "templates/wa-19/photos.txt";
const NOW = "2026-11-10T12:00:00+09:00";
const C = JSON.parse(fs.readFileSync(`${DIR}/wa19-content.json`, "utf8"));

// ---- 色（SPEC 3章）・書体（見出しと本文 Noto Serif JP 300／400／500、欧文・数字 Bodoni Moda）
const PAPER = "#FAF8F4", PANEL = "#F0EEEA", INK = "#1C1C1C", MUTE = "#6B6B67", LINE = "#9A9A96", BLUE = "#20344A", WH = "#FFFFFF", FT_TX = "#B4B4B0";
const H = "font:heading", B = "font:body", E = "font:accent";
const num = (n) => n.toLocaleString("en-US");

// ---- ① shop.json
const weekly = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, d === C.closedDay ? { status: "closed" } : { status: "open", periods: C.periods }]));
const items = {}, placements = {}, categories = {};
const groupsAll = [...C.menu.groups, C.menu.pairing];
groupsAll.forEach((g, gi) => {
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
  hours: { weekly, ...(C.closedRules?.length ? { closedRules: C.closedRules } : {}) },
  contact: { phone: C.phone },
  catalog: { menus: { mnu_main: { order: 1, name: C.menu.heading } }, categories, labels: { lbl_recommend: { name: "おすすめ", system: "recommended", order: 1 } }, items, placements },
};
fs.mkdirSync(`${DIR}/media`, { recursive: true });
fs.writeFileSync(`${DIR}/shop.json`, JSON.stringify(shop, null, 2) + "\n");

// ---- ③ theme.json
fs.writeFileSync(`${DIR}/theme.json`, JSON.stringify({ schemaVersion: 1,
  colors: { background: { value: PAPER }, surface: { value: PANEL }, text: { value: INK }, textMuted: { value: MUTE }, primary: { value: BLUE }, accent: { value: BLUE }, line: { value: LINE }, lineSoft: { value: LINE } },
  fonts: { heading: "noto-serif-jp-light", body: "noto-serif-jp-light", accent: "bodoni-moda" },
  textStyles: {
    pageTitle: { font: E, size: { pc: 168, sp: 96 }, lineHeight: 1, color: "theme:text" },
    heading: { font: H, size: { pc: 32, sp: 22 }, lineHeight: 1.75, color: "theme:text" },
    subheading: { font: H, size: { pc: 18, sp: 16 }, lineHeight: 1.6, color: "theme:text" },
    body: { font: B, size: { pc: 15, sp: 15 }, lineHeight: 2.1, color: "theme:text" },
    caption: { font: B, size: { pc: 13, sp: 13 }, lineHeight: 1.8, color: "theme:textMuted" },
  } }, null, 2) + "\n");

// ---- 写真（SPEC 7章。photos.txt の URL は表示幅の 2 倍に合わせた WebP）
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
  if (!meta) throw new Error(`写真 ${k} の説明が wa19-content.json にありません`);
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
const els = {}, secs = {}, tablet = { els: {}, secs: {}, only: { pc: [], sp: [] } };
// x.only＝"pc"／"sp"：その端末（SP はタブレットも）だけに出す。もう一方では finish の CSS で隠す。
// 隠す側の配置は、中身が箱に収まる大きさにしておく（伸び縮みの規則で他の要素を動かさない。データの hidden は使わない：消えた要素として下を詰めてしまうため）
const add = (id, e, only) => { els[id] = e; if (only) tablet.only[only].push(id); };
const tb = (id, css) => { tablet.els[id] = { ...(tablet.els[id] || {}), ...css }; };
const rem = (n) => `${r(n / 10)}rem`;
const run = (v) => (typeof v === "string" ? { text: v } : v.text !== undefined ? v : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (c) => (c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : c?.runs ? [{ runs: c.runs.map(run) }] : [{ runs: [run(c)] }]);
// 文字の箱。sizes＝[[PC の大きさ, PC の行送り], [SP の大きさ, SP の行送り]]（行送りの比は PC の値を両方に使う）
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  add(id, { type: "text", z: x.z ?? 5, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: x.ls ?? 0, ...(x.align ? { align: x.align } : {}), ...(x.italic ? { italic: true } : {}), ...(x.noWrap ? { noWrap: true } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: lay({ ...l[0], size: ps[0] }, { ...l[1], size: ss[0] }) }, x.only);
}
const sec = (id, name, pc, sp, more = {}) => { secs[id] = { name, background: { color: more.bg ?? "theme:background" }, minHeight: { pc: Math.round(pc), sp: Math.round(sp) }, ...(more.anchor ? { anchor: more.anchor } : {}), ...(more.nav ? { nav: more.nav } : {}) }; };
const photo = (id, section, asset, z, pc, sp, crop = {}) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1, ...crop } });
const rect = (id, section, fill, z, pc, sp, { only, ...x } = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x }, only);
const hline = (id, section, pc, sp, x = {}) => rect(id, section, LINE, 2, { ...pc, h: 1 }, { ...sp, h: 1 }, x);
const TEL = { kind: "shopPhone" }, RESERVE = { kind: "anchor", value: "pg_home#reserve" }, TOP = { kind: "anchor", value: "pg_home#top" };
const CT = { align: "center" }, RT = { align: "right" }, IT = { italic: true };
const PHONE = ["/contact/phone", "phone"], ADDR = ["/location", "address"];
const NAV = (label, order) => ({ label, order });
const val = (v) => (v === "$address" ? ADDR : v === "$phone" ? PHONE : Array.isArray(v) ? { lines: v } : v);
// 値段：数字は Bodoni、「円」は Noto Serif JP（数字の大きさに対する比）
const price = (n, ratio) => ({ runs: [{ text: num(n) }, { text: "円", marks: { font: B, sizeRatio: ratio } }] });
// 文字数からの行数の見積もり（和文 1 字＝1em、欧文は 0.6em。字間を含む）
const lineCount = (text, size, width, ls = 0) => { const s = String(text); let em = 0; for (const ch of s) em += /[\x20-\x7e]/.test(ch) ? 0.6 : 1 + ls; return Math.max(1, Math.ceil((em * size) / (width * 0.92))); }; // 文節で早めに折れる分を 0.92 で見込む

const lineCountRaw = (text, size, width) => lineCount(text, size, width / 0.92); // 見込みなし（1 行に収まるかの判定に使う）
// タブレット（768〜1024）：左右 48、本文の列 W＝100vw−96。縦の位置は { p: px, k: W の倍率 } で持つ
const M = 48, W = "(100vw - 9.6rem)", COL = `calc(${W})`, TW = 672; // TW＝768 のときの W（行数の見積もりに使う。いちばん狭い）
const V = (p, k = 0) => ({ p, k });
const vadd = (a, n, k = 0) => ({ p: (typeof a === "number" ? a : a.p) + n, k: (typeof a === "number" ? 0 : a.k) + k });
const ex = (y) => (typeof y === "number" ? rem(y) : y.k ? `calc(${rem(y.p)} + ${W} * ${r(y.k)})` : rem(y.p));
const tT = (id, top, css = {}) => tb(id, { left: rem(M), width: COL, top: ex(top), ...css });
const font = (size, lh) => ({ "font-size": rem(size), "line-height": rem(lh) });
const wk = (k, p = 0) => (p ? `calc(${W} * ${r(k)} + ${rem(p)})` : `calc(${W} * ${r(k)})`);

// 共通の数：段の上下の余白（PC 160、SP 96、タブレット 120）
const PT = 160, ST = 96, TT = 120;

// ---- 0 ヘッダー（sticky、PC 88／SP 64、地は白の不透明）
sec("sec_header", "ヘッダー", 88, 64);
add("hd_nav", { type: "nav", z: 5, section: "sec_header", style: { color: INK, font: B, spMenuBackground: PAPER }, layout: lay({ x: 520, y: 0, w: 660, h: 88, size: 14 }, { x: 290, y: 0, w: 84, h: 64 }) });
t("hd_name", "sec_header", C.shortName, [[30, 36], [24, 28.8]], E, INK, [{ x: 80, y: 14, w: 200, h: 36 }, { x: 24, y: 17, w: 180, h: 29 }], { link: TOP, noWrap: true, ls: 0.04 });
t("hd_sub", "sec_header", C.subName, [[12, 14], [12, 14]], E, MUTE, [{ x: 80, y: 56, w: 200, h: 14 }, { x: 24, y: 48, w: 180, h: 14 }], { link: TOP, noWrap: true, ls: 0.32, only: "pc" });
rect("hd_btn", "sec_header", BLUE, 2, { x: 1220, y: 22, w: 140, h: 44 }, { x: 0, y: 0, w: 100, h: 20 }, { link: RESERVE, only: "pc" });
t("hd_btn_t", "sec_header", C.labels.reserveButton, [[14, 20], [14, 20]], B, WH, [{ x: 1220, y: 34, w: 140, h: 20 }, { x: 0, y: 0, w: 100, h: 20 }], { weight: 500, ls: 0.12, ...CT, only: "pc", z: 3 });
tb("hd_name", { left: rem(M), top: rem(17) });

// 段の頭（欧文の大見出し・和文のリード・欧文の添え書き。PC は中央揃え、SP とタブレットは左揃え）。戻り値＝SP とタブレットの頭の高さ
function head(S, pre, en, lead, sub) {
  const leadLinesSp = lineCount(lead, 22, 342, 0.1), leadLinesT = lineCount(lead, 28, TW, 0.1);
  t(`${pre}_en`, S, en, [[72, 72], [48, 48]], E, MUTE, [{ x: 80, y: PT, w: 1280, h: 80 }, { x: 24, y: ST, w: 342, h: 56 }], { ...IT, ...CT, noWrap: true });
  t(`${pre}_lead`, S, lead, [[32, 56], [22, 38.5]], H, INK, [{ x: 80, y: PT + 120, w: 1280, h: 56 }, { x: 24, y: ST + 76, w: 342, h: 38.5 * leadLinesSp }], { weight: 300, ls: 0.1, ...CT, role: "heading" });
  const spSub = ST + 76 + 38.5 * leadLinesSp + 12;
  t(`${pre}_sub`, S, sub, [[13, 18], [12, 16.6]], E, MUTE, [{ x: 80, y: PT + 196, w: 1280, h: 18 }, { x: 24, y: spSub, w: 342, h: 17 }], { ...IT, ...CT, ls: 0.04 });
  const tLead = TT + 96, tSub = tLead + 48 * leadLinesT + 16;
  tT(`${pre}_en`, TT, { ...font(64, 72), "text-align": "left" });
  tT(`${pre}_lead`, tLead, { ...font(28, 48), "text-align": "left" });
  tT(`${pre}_sub`, tSub, { ...font(13, 18), "text-align": "left" });
  return { sp: spSub + 17, tab: tSub + 18 };
}

// ---- 1 最初の画面（左に小さな欧文・大きな店名・線・コピー・事実、右に 600×800 の一皿）
{
  const S = "sec_firstv";
  const f = C.fv;
  t("fv_en", S, f.en, [[15, 20], [13, 17.3]], E, MUTE, [{ x: 80, y: 120, w: 520, h: 20 }, { x: 24, y: 40, w: 342, h: 18 }], { ...IT, ls: 0.06, noWrap: true });
  t("fv_name", S, C.shortName, [[168, 168], [96, 96]], E, INK, [{ x: 72, y: 160, w: 560, h: 172 }, { x: 18, y: 72, w: 352, h: 100 }], { ls: -0.01, noWrap: true, role: "pageTitle" });
  hline("fv_ln", S, { x: 80, y: 392, w: 64 }, { x: 24, y: 712, w: 64 });
  t("fv_cp", S, { lines: f.catchCopyLines }, [[34, 60], [24, 42.4]], H, INK, [{ x: 80, y: 432, w: 560, h: 120 }, { x: 24, y: 744, w: 342, h: 85 }], { weight: 300, ls: 0.12 });
  t("fv_f", S, { lines: f.facts }, [[14, 28], [13, 26]], B, INK, [{ x: 80, y: 620, w: 520, h: 28 * f.facts.length }, { x: 24, y: 860, w: 342, h: 26 * f.facts.length }], { ls: 0.04 });
  photo("fv_ph", S, "ast_phfv", 1, { x: 680, y: 100, w: 600, h: 800 }, { x: 24, y: 208, w: 342, h: 456 });
  t("fv_cap", S, f.caption, [[13, 16], [13, 16]], E, MUTE, [{ x: 880, y: 916, w: 400, h: 16 }, { x: 24, y: 40, w: 342, h: 18 }], { ...IT, ...RT, only: "pc" });
  sec(S, "最初の画面", 980, 860 + 26 * f.facts.length + ST, { anchor: "top" });
  // タブレット：店名の下に写真を右寄せ（幅の 75%、3:4）、その下に線・コピー・事実
  tT("fv_en", 48, font(15, 20));
  tT("fv_name", 80, { ...font(128, 132), height: rem(132) });
  tb("fv_ph", { left: `calc(${rem(M)} + ${W} * .15)`, width: wk(0.85), top: rem(240), height: wk(0.85 * 4 / 3) });
  const y0 = V(240 + 48, 0.85 * 4 / 3);
  tT("fv_ln", y0, { width: rem(64), height: "1px" });
  tT("fv_cp", vadd(y0, 32), font(30, 54));
  tT("fv_f", vadd(y0, 32 + 108 + 32), font(14, 28));
  tablet.secs[S] = ex(vadd(y0, 32 + 108 + 32 + 28 * f.facts.length + 96));
}

// ---- 2 店のこと（中央の段の頭の下に、大きさ違いの写真 3 枚と文 3 つを左右に振るコラージュ）
{
  const S = "sec_about", A = C.about, [x1, x2, x3] = A.texts;
  const hs = head(S, "ab", A.en, A.lead, A.sub);
  const pcH = (s) => 40 * (lineCount(s, 17, 320) + 1), spH = (s) => 35.3 * lineCount(s, 15, 294) + 8, tH = (s) => 36 * lineCount(s, 17, TW) + 8;
  const y = (v) => PT + v;
  photo("ab_ph3", S, "ast_phab3", 2, { x: 124, y: y(320), w: 440, h: 600 }, { x: 0, y: hs.sp + 48, w: 300, h: 410 });
  photo("ab_ph2", S, "ast_phab2", 3, { x: 383, y: y(760), w: 360, h: 240 }, { x: 174, y: hs.sp + 48 + 370, w: 216, h: 144 });
  const sp1 = hs.sp + 48 + 370 + 144 + 40;
  t("ab_p1", S, x1, [[17, 40], [15, 35.3]], B, INK, [{ x: 809, y: y(440), w: 320, h: pcH(x1) }, { x: 48, y: sp1, w: 294, h: spH(x1) }], { weight: 300 });
  const spPh1 = sp1 + spH(x1) + 40;
  photo("ab_ph1", S, "ast_phab1", 2, { x: 704, y: y(1080), w: 600, h: 400 }, { x: 24, y: spPh1, w: 366, h: 244 });
  const sp2 = spPh1 + 244 + 40;
  t("ab_p2", S, x2, [[17, 40], [15, 35.3]], B, INK, [{ x: 200, y: y(1180), w: 320, h: pcH(x2) }, { x: 48, y: sp2, w: 294, h: spH(x2) }], { weight: 300 });
  const sp3 = sp2 + spH(x2) + 32;
  const pc3 = Math.max(1560, 1180 + pcH(x2) + 80);
  t("ab_p3", S, x3, [[17, 40], [15, 35.3]], B, INK, [{ x: 200, y: y(pc3), w: 320, h: pcH(x3) }, { x: 48, y: sp3, w: 294, h: spH(x3) }], { weight: 300 });
  sec(S, "店のこと", y(Math.max(1480, pc3 + pcH(x3))) + PT, sp3 + spH(x3) + ST, { anchor: "about", nav: NAV(C.labels.about, 1) });
  // タブレット：ab3 を左（幅 55%、縦長）、ab2 を右下に重ね、文は全幅
  const T0 = hs.tab + 48;
  tb("ab_ph3", { left: rem(M), width: wk(0.55), top: rem(T0), height: wk(0.75) });
  tb("ab_ph2", { left: `calc(${rem(M)} + ${W} * .45)`, width: wk(0.55), top: ex(V(T0, 0.6)), height: wk(0.3667) });
  const t1 = V(T0 + 48, 0.9667);
  tT("ab_p1", t1, font(17, 36));
  const tPh1 = vadd(t1, tH(x1) + 40);
  tT("ab_ph1", tPh1, { height: wk(2 / 3) });
  const t2 = vadd(tPh1, 40, 2 / 3);
  tT("ab_p2", t2, font(17, 36));
  const t3 = vadd(t2, tH(x2) + 24);
  tT("ab_p3", t3, font(17, 36));
  tablet.secs[S] = ex(vadd(t3, tH(x3) + TT));
}

// ---- 3 コースの流れ（見せ場。上下に銀灰の線、見出しと文、5 列の皿の名。SP は左に線 1 本の縦の流れ、タブレットは行）
const F = C.course.rows;
if (F.length) {
  const S = "sec_course", n = F.length, K = C.course;
  const colW = 1280 / n, inner = colW - 40;
  const pcDesc = Math.max(...F.map((row) => lineCount(row.text, 14, inner))) * 28;
  const colTop = 320, colH = 176 + pcDesc + 32;
  const pcNote = colTop + colH + 40, pcEnd = pcNote + 24 + 120;
  // SP
  const spBody = 32 * lineCount(K.body, 15, 342) + 8;
  const spRows = ST + 56 + 33 + spBody + 40;
  const spRowH = F.map((row) => 108 + 28 * lineCountRaw(row.text, 14, 318) + 36);
  const spY = spRowH.reduce((a, h) => [...a, a[a.length - 1] + h], [spRows]);
  const spNote = spY[n] + 8, spEnd = spNote + 24 + ST;
  sec(S, "コースの流れ", pcEnd, spEnd, { anchor: "course", nav: NAV(C.labels.course, 2) });
  hline("cs_top", S, { x: 80, y: 0, w: 1280 }, { x: 24, y: 0, w: 342 });
  hline("cs_bot", S, { x: 80, y: pcEnd - 1, w: 1280 }, { x: 24, y: spEnd - 1, w: 342 });
  t("cs_en", S, K.en, [[56, 64], [40, 45.7]], E, INK, [{ x: 80, y: 120, w: 640, h: 66 }, { x: 24, y: ST, w: 342, h: 48 }], { ...IT, noWrap: true });
  t("cs_h", S, K.heading, [[18, 28], [16, 24.9]], H, INK, [{ x: 80, y: 200, w: 640, h: 28 }, { x: 24, y: ST + 56, w: 342, h: 25 }], { ls: 0.24, role: "heading" });
  t("cs_p", S, K.body, [[15, 32], [15, 32]], B, INK, [{ x: 840, y: 128, w: 520, h: 32 * lineCount(K.body, 15, 520) + 8 }, { x: 24, y: ST + 56 + 33, w: 342, h: spBody }], { weight: 300 });
  // 縦の線：PC は列の左と最後の列の右（n＋1 本）。SP は cs_v0 だけを左の線にする
  for (let i = 0; i <= n; i++) {
    rect(`cs_v${i}`, S, LINE, 2, { x: 80 + colW * i - (i === n ? 1 : 0), y: colTop, w: 1, h: colH }, i === 0 ? { x: 24, y: spRows, w: 1, h: spY[n] - spRows - 36 } : { x: 0, y: 0, w: 1, h: 1 }, i ? { only: "pc" } : {});
  }
  // タブレット：行（行の上に線、左にローマ数字、皿の名、右に区分と説明）
  const tBody = 32 * lineCount(K.body, 16, TW) + 8;
  const tRows = TT + 72 + 36 + 24 + tBody + 48;
  const tRowH = F.map((row) => Math.max(96, 64 + 28 * lineCount(row.text, 14, TW * 0.6071)) + 24);
  const tY = tRowH.reduce((a, h) => [...a, a[a.length - 1] + h], [tRows]);
  tT("cs_en", TT, font(48, 56));
  tT("cs_h", TT + 72, font(18, 28));
  tT("cs_p", TT + 72 + 36 + 24, font(16, 32));
  F.forEach((row, i) => {
    const X = 80 + colW * i + 24, ys = spY[i], yt = tY[i];
    t(`cs_n${i}`, S, row.num, [[14, 20], [12, 17.1]], E, MUTE, [{ x: X, y: colTop, w: inner, h: 20 }, { x: 48, y: ys, w: 318, h: 17 }], { ls: 0.24, noWrap: true });
    t(`cs_d${i}`, S, row.en, [[40, 48], [32, 38.4]], E, INK, [{ x: X, y: colTop + 48, w: inner, h: 50 }, { x: 48, y: ys + 22, w: 318, h: 40 }], { ...IT, noWrap: true, role: "subheading" });
    t(`cs_k${i}`, S, row.kind, [[15, 24], [14, 22.4]], B, INK, [{ x: X, y: colTop + 112, w: inner, h: 24 }, { x: 48, y: ys + 66, w: 318, h: 23 }], { ls: 0.2, noWrap: true });
    hline(`cs_s${i}`, S, { x: X, y: colTop + 152, w: 16 }, { x: 48, y: ys + 98, w: 16 });
    t(`cs_t${i}`, S, row.text, [[14, 28], [14, 28]], B, INK, [{ x: X, y: colTop + 176, w: inner, h: pcDesc }, { x: 48, y: ys + 110, w: 318, h: 28 * lineCountRaw(row.text, 14, 318) }], { weight: 300 });
    tb(`cs_s${i}`, { left: rem(M), width: COL, top: rem(yt), height: "1px" });
    tb(`cs_n${i}`, { left: rem(M), width: rem(48), top: rem(yt + 30), ...font(14, 20) });
    tb(`cs_d${i}`, { left: rem(M + 48), width: wk(0.3214, -4.8), top: rem(yt + 20), ...font(36, 44) });
    tb(`cs_k${i}`, { left: `calc(${rem(M)} + ${W} * .3929)`, width: wk(0.6071), top: rem(yt + 26), ...font(15, 24) });
    tb(`cs_t${i}`, { left: `calc(${rem(M)} + ${W} * .3929)`, width: wk(0.6071), top: rem(yt + 60), ...font(14, 28) });
  });
  t("cs_note", S, K.note, [[13, 24], [13, 24]], B, MUTE, [{ x: 80, y: pcNote, w: 1280, h: 24 }, { x: 24, y: spNote, w: 342, h: 24 }], { weight: 300 });
  // タブレット：PC の縦の線は出さず、cs_v0 を行の下の線にする
  tb("cs_v0", { left: rem(M), width: COL, top: rem(tY[n]), height: "1px" });
  tT("cs_note", tY[n] + 24, font(13, 24));
  const tEnd = tY[n] + 24 + 24 + TT;
  tT("cs_top", 0, { height: "1px" });
  tT("cs_bot", tEnd - 1, { height: "1px" });
  tablet.secs[S] = rem(tEnd);
}

// ---- 4 お料理（段の頭の下に写真 4 枚を 2 列の千鳥に。写真の下に欧文の区分と品名）
{
  const S = "sec_plates", P = C.plates, I = P.items;
  const hs = head(S, "pl", P.en, P.lead, P.sub);
  const y = (v) => PT + 320 + v;
  // PC：左の列 x200（1・3 枚目）、右の列 x760（2・4 枚目）
  const pcPh = [{ x: 200, y: 0, w: 480, h: 630 }, { x: 760, y: 200, w: 480, h: 480 }, { x: 200, y: 840, w: 480, h: 600 }, { x: 760, y: 880, w: 480, h: 480 }];
  // SP：参考の SP の振り方で、左の端（x0）と右の端（x90）を交互に
  const spPh = [{ x: 0, w: 300, h: 394 }, { x: 90, w: 300, h: 300 }, { x: 0, w: 300, h: 375 }, { x: 90, w: 300, h: 300 }];
  let sy = hs.sp + 48, pcBottom = 0, spBottom = 0;
  // タブレット：2 列（各 (W−16)/2）、右の列は 120 下げる
  const cw = (k) => ({ p: -8 * k, k: 0.5 * k }); // 列の幅 × k
  const tr = [1.3125, 1, 1.25, 1];
  const T0 = hs.tab + 48;
  const tTop = [V(T0), vadd(V(T0 + 120), 0), null, null];
  tTop[2] = vadd(tTop[0], cw(tr[0]).p + 66 + 48, cw(tr[0]).k);
  tTop[3] = vadd(tTop[1], cw(tr[1]).p + 66 + 48, cw(tr[1]).k);
  I.forEach((it, i) => {
    const p = pcPh[i % 4], s = spPh[i % 4], capX = s.x === 0 ? 24 : s.x, capW = s.x === 0 ? 276 : 300;
    const pcY = i < 4 ? p.y : p.y + 1440 * Math.floor(i / 4);
    photo(`pl_ph${i}`, S, `ast_ph${it.photo}`, 2, { x: p.x, y: y(pcY), w: p.w, h: p.h }, { x: s.x, y: sy, w: s.w, h: s.h });
    t(`pl_e${i}`, S, it.en, [[15, 20], [15, 20]], E, MUTE, [{ x: p.x, y: y(pcY + p.h + 16), w: p.w, h: 20 }, { x: capX, y: sy + s.h + 16, w: capW, h: 20 }], { ...IT, noWrap: true });
    t(`pl_n${i}`, S, it.name, [[15, 26], [15, 26]], B, INK, [{ x: p.x, y: y(pcY + p.h + 40), w: p.w, h: 26 }, { x: capX, y: sy + s.h + 40, w: capW, h: 26 * lineCount(it.name, 15, capW) }]);
    pcBottom = Math.max(pcBottom, pcY + p.h + 66);
    sy += s.h + 40 + 26 * lineCount(it.name, 15, capW) + 48;
    // タブレット
    if (i < 4) {
      const left = i % 2 ? `calc(${rem(M + 8)} + ${W} * .5)` : rem(M), width = `calc(${W} * .5 - ${rem(8)})`;
      tb(`pl_ph${i}`, { left, width, top: ex(tTop[i]), height: `calc((${W} * .5 - ${rem(8)}) * ${tr[i]})` });
      const cap = vadd(tTop[i], cw(tr[i]).p + 16, cw(tr[i]).k);
      tb(`pl_e${i}`, { left, width, top: ex(cap), ...font(15, 20) });
      tb(`pl_n${i}`, { left, width, top: ex(vadd(cap, 24)), ...font(15, 26) });
    }
  });
  const pcNote = Math.max(pcBottom - 66 + 40 - 26 + 26, 0); // 右の列の最後の写真の下
  const lastR = I.length >= 4 ? pcPh[3] : pcPh[1];
  const noteY = lastR.y + lastR.h + 66 + 40;
  t("pl_note", S, P.note, [[13, 24], [13, 24]], B, MUTE, [{ x: 760, y: y(noteY), w: 480, h: 24 }, { x: 90, y: sy - 8, w: 276, h: 24 }], { weight: 300 });
  void pcNote;
  sec(S, "お料理", y(Math.max(pcBottom, noteY + 24)) + PT, sy - 8 + 24 + ST, { anchor: "plates", nav: NAV(C.labels.plates, 3) });
  const tNote = vadd(tTop[3], cw(tr[3]).p + 66 + 32, cw(tr[3]).k);
  tb("pl_note", { left: `calc(${rem(M + 8)} + ${W} * .5)`, width: `calc(${W} * .5 - ${rem(8)})`, top: ex(tNote), ...font(13, 24) });
  const tEndL = vadd(tTop[2], cw(tr[2]).p + 66, cw(tr[2]).k), tEndR = vadd(tNote, 24);
  // 2 つの端の大きい方（768 での値で比べる）
  const at768 = (v) => v.p + v.k * TW;
  tablet.secs[S] = ex(vadd(at768(tEndL) > at768(tEndR) ? tEndL : tEndR, TT));
}

// ---- 5 お品書き（淡い灰の面に、PC は昼と夜の 2 列とペアリングの 1 行。SP・タブレットは縦に積む）
{
  const S = "sec_menu", Mn = C.menu, G = Mn.groups, Pa = Mn.pairing;
  const hs = head(S, "mn", Mn.en, Mn.lead, Mn.sub);
  const y = (v) => PT + 320 + v;
  const RH = 104, cx = [200, 760];
  const pcRowsN = Math.max(...G.map((g) => g.rows.length));
  const pcPair = 152 + RH * pcRowsN; // PC：昼と夜の列の下に全幅の線を 1 本（列ごとの下の線は出さない）、その下にペアリングの 2 品
  const pcPanel = pcPair + 28 + 34 + 22 * Math.max(...Pa.rows.map((p) => lineCount(p.desc, 13, 480))) + 64;
  // SP：面 x0 幅 390、中 x24 幅 342。昼 → 夜 → ペアリング（見出しつき）を縦に積む
  const spP0 = hs.sp + 48;
  let sy = spP0 + 48;
  const spG = G.map((g) => { const o = { h: sy, sub: sy + 44 }; let yy = sy + 80; o.rows = g.rows.map(() => { const q = yy; yy += RH; return q; }); o.end = yy; sy = yy + 48; return o; });
  const spPairH = sy;
  sy += 56;
  const spPairRows = Pa.rows.map((p) => { const q = sy; sy += 52 + 22 * lineCount(p.desc, 13, 342) + 20; return q; });
  const spPairEnd = sy;
  const spPanelH = sy + 40 - spP0;
  // タブレット：面を全幅、中 x48 幅 W。SP と同じ順に縦に積む
  const tP0 = hs.tab + 48;
  let ty = tP0 + 56;
  const tG = G.map((g) => { const o = { h: ty, sub: ty + 48 }; let yy = ty + 84; o.rows = g.rows.map(() => { const q = yy; yy += 96; return q; }); o.end = yy; ty = yy + 48; return o; });
  const tPairH = ty;
  ty += 60;
  const tPairRows = Pa.rows.map(() => { const q = ty; ty += 52 + 22 + 22; return q; });
  const tPairEnd = ty;
  const tPanelH = ty + 40 - tP0;

  rect("mn_bg", S, PANEL, 1, { x: 80, y: y(0), w: 1280, h: pcPanel }, { x: 0, y: spP0, w: 390, h: spPanelH });
  tb("mn_bg", { left: "0", width: "100%", top: rem(tP0), height: rem(tPanelH) });
  const groupHead = (id, en, ja, pcX, pcY, spY, tY, only) => {
    t(`mg_${id}`, S, en, [[32, 40], [28, 35]], E, INK, [{ x: pcX, y: pcY, w: 340, h: 40 }, { x: 24, y: spY, w: 220, h: 35 }], { ...IT, noWrap: true, role: "subheading", only });
    t(`mj_${id}`, S, ja, [[15, 24], [15, 24]], B, INK, [{ x: pcX + 360, y: pcY + 8, w: 120, h: 24 }, { x: 246, y: spY + 6, w: 120, h: 24 }], { ls: 0.2, ...RT, noWrap: true, only });
    tb(`mg_${id}`, { left: rem(M), width: `calc(${W} - 14rem)`, top: rem(tY), ...font(30, 38) });
    tb(`mj_${id}`, { left: "auto", right: rem(M), width: rem(120), top: rem(tY + 7), ...font(15, 24) });
  };
  G.forEach((g, gi) => {
    const X = cx[gi % 2], s = spG[gi], q = tG[gi];
    groupHead(gi, g.en, g.name, X, y(64), s.h, q.h);
    t(`ms_${gi}`, S, g.sub, [[13, 20], [13, 20]], B, MUTE, [{ x: X, y: y(112), w: 480, h: 20 }, { x: 24, y: s.sub, w: 342, h: 20 }]);
    tT(`ms_${gi}`, q.sub, font(13, 20));
    g.rows.forEach((row, i) => {
      const py = 152 + RH * i, sp = s.rows[i], tp = q.rows[i], id = `${gi}_${i}`;
      hline(`ml_${id}`, S, { x: X, y: y(py), w: 480 }, { x: 24, y: sp, w: 342 });
      t(`mt_${id}`, S, row.name, [[17, 28], [16, 26.4]], B, INK, [{ x: X, y: y(py + 20), w: 320, h: 28 }, { x: 24, y: sp + 18, w: 196, h: 27 }], { noWrap: true });
      t(`md_${id}`, S, row.desc, [[13, 22], [13, 22]], B, MUTE, [{ x: X, y: y(py + 54), w: 330, h: 44 }, { x: 24, y: sp + 54, w: 342, h: 44 }], { weight: 300 });
      t(`mp_${id}`, S, price(row.price, 0.64), [[22, 28], [20, 25.5]], E, INK, [{ x: X + 340, y: y(py + 20), w: 140, h: 28 }, { x: 226, y: sp + 18, w: 140, h: 26 }], { ...RT, noWrap: true });
      tT(`ml_${id}`, tp, { height: "1px" });
      tb(`mt_${id}`, { left: rem(M), width: `calc(${W} - 18rem)`, top: rem(tp + 18), ...font(17, 28) });
      tb(`md_${id}`, { left: rem(M), width: `calc(${W} - 18rem)`, top: rem(tp + 52), ...font(13, 22) });
      tb(`mp_${id}`, { left: "auto", right: rem(M), width: rem(160), top: rem(tp + 18), ...font(22, 28) });
    });
    const last = g.rows.length;
    hline(`ml_${gi}_${last}`, S, { x: X, y: y(pcPair), w: 480 }, { x: 24, y: s.end, w: 342 }, { only: "sp" });
    tT(`ml_${gi}_${last}`, q.end, { height: "1px" });
  });
  // ペアリング：PC は全幅の線の下に 2 品を左右に。SP・タブレットは見出しと行の線をつけて、昼・夜と同じ組みで積む
  hline("mpa_l", S, { x: 200, y: y(pcPair), w: 1040 }, { x: 24, y: spPairH + 2, w: 1 }, { only: "pc" });
  groupHead("pa", Pa.en, Pa.name, 200, y(pcPair + 28), spPairH, tPairH, "sp");
  Pa.rows.forEach((row, i) => {
    const X = cx[i % 2], sp = spPairRows[i], tp = tPairRows[i];
    hline(`mpl_${i}`, S, { x: X, y: y(pcPair), w: 1 }, { x: 24, y: sp, w: 342 }, { only: "sp" });
    tT(`mpl_${i}`, tp, { height: "1px" });
    t(`mpt_${i}`, S, row.name, [[16, 26], [15, 24.4]], B, INK, [{ x: X, y: y(pcPair + 28), w: 320, h: 26 }, { x: 24, y: sp + 18, w: 216, h: 25 }], { noWrap: true });
    t(`mpp_${i}`, S, price(row.price, 0.7), [[20, 26], [18, 23.4]], E, INK, [{ x: X + 340, y: y(pcPair + 28), w: 140, h: 26 }, { x: 246, y: sp + 18, w: 120, h: 24 }], { ...RT, noWrap: true });
    t(`mpd_${i}`, S, row.desc, [[13, 22], [13, 22]], B, MUTE, [{ x: X, y: y(pcPair + 62), w: 480, h: 22 * lineCount(row.desc, 13, 480) }, { x: 24, y: sp + 52, w: 342, h: 22 * lineCount(row.desc, 13, 342) }], { weight: 300 });
    tb(`mpt_${i}`, { left: rem(M), width: `calc(${W} - 18rem)`, top: rem(tp + 18), ...font(16, 26) });
    tb(`mpp_${i}`, { left: "auto", right: rem(M), width: rem(160), top: rem(tp + 18), ...font(20, 26) });
    tT(`mpd_${i}`, tp + 52, font(13, 22));
  });
  hline(`mpl_${Pa.rows.length}`, S, { x: 200, y: y(pcPair), w: 1 }, { x: 24, y: spPairEnd, w: 342 }, { only: "sp" });
  tT(`mpl_${Pa.rows.length}`, tPairEnd, { height: "1px" });
  const pcNoteY = pcPanel + 24, spNoteY = spP0 + spPanelH + 24, tNoteY = tP0 + tPanelH + 24;
  const noteLinesSp = lineCount(Mn.note, 13, 342);
  t("mn_n", S, Mn.note, [[13, 24], [13, 24]], B, MUTE, [{ x: 80, y: y(pcNoteY), w: 1280, h: 24 }, { x: 24, y: spNoteY, w: 342, h: 24 * noteLinesSp }], { weight: 300 });
  tT("mn_n", tNoteY, font(13, 24));
  sec(S, "お品書き", y(pcNoteY + 24) + PT, spNoteY + 24 * noteLinesSp + ST, { anchor: "menu", nav: NAV(C.labels.menu, 4) });
  tablet.secs[S] = rem(tNoteY + 24 * lineCount(Mn.note, 13, TW) + TT);
}

// ---- 6 ご案内（左に見出しと表、右に地図）
{
  const S = "sec_info", R = C.info.rows, y = (v) => PT + v;
  const nl = (v) => (Array.isArray(v) ? v.length : 1);
  t("in_en", S, C.info.en, [[56, 64], [40, 45.7]], E, INK, [{ x: 80, y: y(0), w: 560, h: 66 }, { x: 24, y: ST, w: 342, h: 48 }], { ...IT, noWrap: true });
  t("in_h", S, C.info.heading, [[18, 28], [16, 24.9]], H, INK, [{ x: 80, y: y(80), w: 560, h: 28 }, { x: 24, y: ST + 56, w: 342, h: 25 }], { ls: 0.24, role: "heading" });
  tT("in_en", TT, font(48, 56));
  tT("in_h", TT + 72, font(18, 28));
  let py = 160, sy = ST + 56 + 25 + 40, ty = TT + 72 + 28 + 40;
  hline("in_l0", S, { x: 80, y: y(py), w: 560 }, { x: 24, y: sy, w: 342 });
  tT("in_l0", ty, { height: "1px" });
  R.forEach(([k, v], i) => {
    const n = nl(v), spN = n;
    const ph = 64 + 26 * (n - 1), sh = 60 + 26 * (spN - 1), th = 64 + 26 * (n - 1);
    t(`in_k${i}`, S, k, [[14, 24], [13, 22.3]], B, MUTE, [{ x: 80, y: y(py + 20), w: 120, h: 24 }, { x: 24, y: sy + 19, w: 88, h: 23 }], { ls: 0.12, noWrap: true });
    t(`in_v${i}`, S, val(v), [[15, 26], [15, 26]], B, INK, [{ x: 200, y: y(py + 19), w: 440, h: 26 * n }, { x: 112, y: sy + 17, w: 254, h: 26 * spN }], v === "$phone" ? { link: TEL } : {});
    hline(`in_l${i + 1}`, S, { x: 80, y: y(py + ph - 1), w: 560 }, { x: 24, y: sy + sh - 1, w: 342 });
    tb(`in_k${i}`, { left: rem(M), width: rem(120), top: rem(ty + 20), ...font(14, 24) });
    tb(`in_v${i}`, { left: rem(M + 120), width: `calc(${W} - 12rem)`, top: rem(ty + 19), ...font(15, 26) });
    tT(`in_l${i + 1}`, ty + th - 1, { height: "1px" });
    py += ph; sy += sh; ty += th;
  });
  const spMap = sy + 40;
  rect("in_map", S, PANEL, 2, { x: 720, y: y(160), w: 640, h: 400 }, { x: 24, y: spMap, w: 342, h: 300 });
  tT("in_map", ty + 40, { height: rem(400) });
  sec(S, "ご案内", y(Math.max(160 + 400, py)) + PT, spMap + 300 + ST, { anchor: "info", nav: NAV(C.labels.info, 5) });
  tablet.secs[S] = rem(ty + 40 + 400 + TT);
}

// ---- 7 ご予約（深い青の全幅。左に欧文の見出し・一文・電話番号、右に白いボタン）
{
  const S = "sec_reserve", R = C.reserve;
  sec(S, "ご予約", 360, 404, { anchor: "reserve", bg: BLUE });
  t("rs_en", S, R.en, [[48, 56], [36, 42]], E, WH, [{ x: 200, y: 92, w: 600, h: 58 }, { x: 24, y: 64, w: 342, h: 44 }], { ...IT, noWrap: true });
  t("rs_p", S, R.text, [[18, 32], [16, 28.4]], B, WH, [{ x: 200, y: 160, w: 600, h: 32 }, { x: 24, y: 120, w: 342, h: 29 }], { weight: 300, role: "heading" });
  t("rs_t", S, PHONE, [[36, 44], [30, 36.7]], E, WH, [{ x: 200, y: 212, w: 600, h: 44 }, { x: 24, y: 168, w: 342, h: 37 }], { link: TEL, noWrap: true, ls: 0.04 });
  rect("rs_btn", S, PAPER, 2, { x: 1040, y: 148, w: 320, h: 64 }, { x: 24, y: 252, w: 342, h: 56 }, { link: TEL });
  t("rs_btn_t", S, R.button, [[16, 24], [16, 24]], B, BLUE, [{ x: 1040, y: 168, w: 320, h: 24 }, { x: 24, y: 268, w: 342, h: 24 }], { weight: 500, ls: 0.16, ...CT, z: 3 });
  tT("rs_en", 72, font(44, 52));
  tT("rs_p", 136, font(18, 32));
  tT("rs_t", 184, font(34, 44));
  tT("rs_btn", 264, { height: rem(64) });
  tT("rs_btn_t", 284, font(16, 24));
  tablet.secs[S] = rem(264 + 64 + 80);
}

// ---- 8 フッター（黒。左に店名と事実、右に著作権）
{
  const S = "sec_footer", FH = C.footerHours;
  sec(S, "フッター", 340 + 26 * (FH.length - 3), 420 + 26 * (FH.length - 3), { bg: INK });
  t("ft_n", S, C.shortName, [[64, 64], [48, 48]], E, PAPER, [{ x: 80, y: 72, w: 400, h: 68 }, { x: 24, y: 56, w: 342, h: 52 }], { noWrap: true, ls: 0.02 });
  t("ft_sub", S, C.subName, [[12, 14], [12, 14]], E, LINE, [{ x: 80, y: 148, w: 400, h: 14 }, { x: 24, y: 116, w: 342, h: 14 }], { noWrap: true, ls: 0.32 });
  const F13 = [[13, 26], [13, 26]];
  t("ft_a", S, ADDR, F13, B, FT_TX, [{ x: 80, y: 188, w: 560, h: 26 }, { x: 24, y: 156, w: 342, h: 26 }]);
  t("ft_t", S, PHONE, F13, B, FT_TX, [{ x: 80, y: 214, w: 560, h: 26 }, { x: 24, y: 182, w: 342, h: 26 }], { link: TEL, noWrap: true });
  t("ft_hr", S, { lines: FH }, F13, B, FT_TX, [{ x: 80, y: 240, w: 560, h: 26 * FH.length }, { x: 24, y: 208, w: 342, h: 26 * FH.length }]);
  const cY = 240 + 26 * FH.length - 20;
  t("ft_c", S, `© ${C.name}`, [[12, 20], [12, 20]], B, LINE, [{ x: 840, y: cY, w: 520, h: 20 }, { x: 24, y: 208 + 26 * FH.length + 40, w: 342, h: 20 }], { ...RT });
  tT("ft_n", 64, font(56, 60));
  tT("ft_sub", 132, font(12, 14));
  tT("ft_a", 172);
  tT("ft_t", 198);
  tT("ft_hr", 224);
  tT("ft_c", 224 + 26 * FH.length + 40, { ...font(12, 20), "text-align": "left" });
  tablet.secs[S] = rem(224 + 26 * FH.length + 40 + 20 + 64);
}

// ---- 書き出し
const order = ["sec_firstv", "sec_about", "sec_course", "sec_plates", "sec_menu", "sec_info", "sec_reserve"].filter((s) => secs[s]);
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_19", canvas: { pcContentWidth: Pw, spDesignWidth: Sw },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: order },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
fs.writeFileSync(`${DIR}/wa19-tablet.json`, JSON.stringify(tablet, null, 1) + "\n");
console.log(`wa19-gen: ${ID}：要素 ${Object.keys(els).length}／写真 ${rows.length} 枠／流れ ${F.length} 列`);
