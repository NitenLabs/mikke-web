#!/usr/bin/env node
// wa-06：templates/wa-06/SPEC.md の数値から samples/<店>/ の shop・theme・assets・site を作る。
// 写真は templates/wa-06/photos.txt の行（「枠 URL」）を media/ に取得する。タブレットの配置は samples/<店>/wa06-tablet.json に書き、wa06-finish が CSS にする。
// 使い方：node tools/wa06-gen.mjs → node tools/build.mjs samples/mareluce → node tools/wa06-finish.mjs
import fs from "node:fs";
const ID = "mareluce"; // 店の ID（別の店に使うときはここと下の文言を変える）
const DIR = `samples/${ID}`, LIST = "templates/wa-06/photos.txt";
const NOW = "2026-11-10T01:30:00+09:00";

// ---- 色（SPEC 3章）。テラコッタの上の文字は 24px 以上だけ
const TC = "#C2603F", CR = "#F7F1E8", OL = "#6B7045", INK = "#2B211B", W = "#FFFFFF";
const H = "font:heading", B = "font:body", A = "font:accent"; // heading=Fraunces、body=Zen Kaku Gothic New、accent=Caveat（1か所だけ）。値段は lnum・tnum が効かないので body
const NAME = "Trattoria Mareluce", SHORT = "Mareluce";

// ---- 中身（G003 の値。税込）
const MENU = [
  { id: "antipasti", en: "Antipasti", ja: "前菜", items: [["鮮魚のカルパッチョ", 1800], ["ブルスケッタ 三種の盛り合わせ", 1280], ["カプレーゼ", 1200], ["自家製ハムの盛り合わせ", 1500], ["オリーブのマリネ", 980]] },
  { id: "pasta", en: "Pasta", ja: "パスタ", items: [["ボロネーゼのタリアテッレ", 2000], ["魚介のパッパルデッレ", 2400], ["カルボナーラ", 1900], ["ペンネ アラビアータ", 1600]] },
  { id: "pizza", en: "Pizza", ja: "ピッツァ", items: [["マルゲリータ", 1500], ["マリナーラ", 1500], ["四種のチーズ", 2000], ["生ハムとルッコラ", 2200]] },
  { id: "secondi", en: "Secondi", ja: "メイン", items: [["本日の鮮魚の香草パン粉焼き", 2800], ["若鶏の薪窯ロースト", 2800], ["豚肩ロースのグリル", 3200], ["牛ランプのタリアータ", 4200]] },
  { id: "dolci", en: "Dolci", ja: "ドルチェ", items: [["自家製ティラミス", 800], ["パンナコッタ", 700], ["ジェラート 三種", 900]] },
];
const yen = (n) => `${n.toLocaleString("en-US")}円`;

// ---- ① shop.json（架空の印を立てる）
const P_L = { start: "11:30", end: "15:00", lastOrder: "14:00" }, P_D = { start: "17:30", end: "22:30", lastOrder: "21:30" };
const open = { status: "open", periods: [P_L, P_D] };
const items = {}, placements = {}, categories = {};
const PICK = { 鮮魚のカルパッチョ: "ast_ab02", "ブルスケッタ 三種の盛り合わせ": "ast_rc01", ボロネーゼのタリアテッレ: "ast_rc02", マルゲリータ: "ast_rc03", 自家製ティラミス: "ast_mn02", 本日の鮮魚の香草パン粉焼き: "ast_mn03" };
const REC = new Set(["ブルスケッタ 三種の盛り合わせ", "ボロネーゼのタリアテッレ", "マルゲリータ"]);
MENU.forEach((c, ci) => {
  categories[`cat_${c.id}`] = { menuId: "mnu_main", name: c.ja, order: ci + 1 };
  c.items.forEach(([name, price], i) => {
    const id = `itm_${c.id.slice(0, 3)}${i + 1}`;
    items[id] = { name, photos: PICK[name] ? [PICK[name]] : [], prices: [{ id: `prc_${c.id.slice(0, 3)}${i + 1}`, type: "fixed", amount: price }], status: "onSale", labels: REC.has(name) ? ["lbl_recommend"] : [] };
    placements[`plc_${c.id.slice(0, 3)}${i + 1}`] = { itemId: id, categoryId: `cat_${c.id}`, order: i + 1, menuId: "mnu_main" };
  });
});
const shop = {
  schemaVersion: 1, shopId: `shp_${ID}`, updatedAt: NOW, isSample: true, demo: true,
  basic: { name: NAME, nameKana: "とらっとりあ まれるーちぇ", genre: { template: "restaurant", detail: "イタリアン・トラットリア" } },
  location: { prefecture: "兵庫県", city: "芦屋市", town: "浜町", access: { acc_hanshin: { station: "阪神芦屋駅", method: "walk", minutes: 5, order: 1 } } },
  hours: { weekly: { mon: { status: "closed" }, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open } },
  contact: { phone: { display: "0797-00-0000", digits: "0797000000" } },
  facilities: { smoking: "none" },
  catalog: { menus: { mnu_main: { order: 1, name: "メニュー" } }, categories, labels: { lbl_recommend: { name: "おすすめ", system: "recommended", order: 1 } }, items, placements },
};
fs.mkdirSync(`${DIR}/media`, { recursive: true });
fs.writeFileSync(`${DIR}/shop.json`, JSON.stringify(shop, null, 2) + "\n");

// ---- ③ theme.json
fs.writeFileSync(`${DIR}/theme.json`, JSON.stringify({ schemaVersion: 1,
  colors: { background: { value: CR }, surface: { value: W }, text: { value: INK }, textMuted: { value: OL }, primary: { value: TC }, accent: { value: OL }, line: { value: INK }, lineSoft: { value: "#D9CFBF" } },
  fonts: { heading: "fraunces", body: "zen-kaku-gothic-new", accent: "caveat" },
  textStyles: {
    pageTitle: { font: H, size: { pc: 96, sp: 50 }, lineHeight: 1.2, color: "theme:text" },
    heading: { font: H, size: { pc: 48, sp: 32 }, lineHeight: 1.2, color: "theme:text" },
    subheading: { font: B, size: { pc: 24, sp: 20 }, lineHeight: 1.5, color: "theme:text" },
    body: { font: B, size: { pc: 16, sp: 16 }, lineHeight: 2, color: "theme:text" },
    caption: { font: B, size: { pc: 14, sp: 14 }, lineHeight: 1.7, color: "theme:textMuted" },
  } }, null, 2) + "\n");

// ---- 写真の枠（SPEC 7章）
const SLOTS = {
  fv: ["signature", "薪窯の炎の前で焼き上がるマルゲリータ", "fv01"],
  ab1: ["interior", "打ち粉をまとった手打ちのタリアテッレ", "ab01"], ab2: ["signature", "鮮魚のカルパッチョ、レモンを添えて", "ab02"],
  rc1: ["signature", "ブルスケッタ 三種の盛り合わせ（トマトとバジル）", "rc01"], rc2: ["signature", "ボロネーゼのタリアテッレ", "rc02"], rc3: ["signature", "バジルをのせたマルゲリータ", "rc03"],
  mn1: ["interior", "卓に並んだパスタとピッツァ、カプレーゼ", "mn01"], mn2: ["signature", "カカオをふった自家製ティラミス", "mn02"], mn3: ["signature", "本日の鮮魚の香草パン粉焼き", "mn03"],
  wi: ["interior", "白ワインのグラス", "wi01"], lu: ["signature", "木の卓に置いた魚介のパスタ", "lu01"], di: ["interior", "夜の店内と卓のキャンドル", "di01"],
  sa1: ["interior", "窓辺の明るい客席", "sa01"], sa2: ["interior", "薪窯の炎とピッツァ", "sa02"],
};
const PAGES = { fv: "vHRFraV4U00", ab1: "T6vI65xwoNA", ab2: "R5sV5JopKxI", rc1: "rPkgYDh2bmo", rc2: "B0b_Iklk9l8", rc3: "x00CzBt4Dfk", mn1: "qIU2qhp2tVk", mn2: "v5m_Dm7BQ_c", mn3: "aupBlUT_EEE", wi: "Btl_RJ0TaEQ", lu: "uVjqFohje3I", di: "Xl3zzUp60yA", sa1: "2L_FKjWEk6M", sa2: "F2rMgRhjJpg" };
function webpSize(b) {
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") throw new Error("WebP ではありません");
  const kind = b.toString("latin1", 12, 16);
  if (kind === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { const n = b.readUInt32LE(21); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 }; }
  throw new Error("WebP の大きさが読めません");
}
const urls = Object.fromEntries(fs.readFileSync(LIST, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/)));
const assets = {};
for (const [k, [slot, alt, aid]] of Object.entries(SLOTS)) {
  const id = `ast_${aid}`, key = `${id}.webp`, f = `${DIR}/media/${key}`, url = urls[k];
  if (!url) throw new Error(`写真 ${k} の URL がありません`);
  if (!fs.existsSync(f)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`写真 ${k}: HTTP ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(f);
  assets[id] = { kind: "photo", file: { key, mime: "image/webp", ...webpSize(buf), bytes: buf.length, exifStripped: true }, uploadedAt: NOW, uploadedBy: "producer",
    origin: { kind: "stock", provider: "unsplash", pageUrl: `https://unsplash.com/photos/${PAGES[k]}` },
    rights: { basis: "licensed", confirmedAt: NOW, confirmedBy: "producer", note: "Unsplash License（架空のお店のデザイン見本）" }, slot, alt };
}
fs.writeFileSync(`${DIR}/assets.json`, JSON.stringify({ schemaVersion: 1, assets }, null, 2) + "\n");

// ---- 配置の道具（wa-05 と同じ）
const Pw = 1440, Sw = 390, r = (n) => Math.round(n * 10000) / 10000;
const box = (b, W_) => ({ ...b, x: r((b.x / W_) * 100), w: r((b.w / W_) * 100) });
const lay = (pc, sp) => ({ pc: box(pc, Pw), sp: box(sp, Sw) });
const els = {}, secs = {}, tablet = { els: {}, secs: {} };
const add = (id, e) => { els[id] = e; };
const tb = (id, css) => { tablet.els[id] = { ...(tablet.els[id] || {}), ...css }; };
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (c) => (c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : [{ runs: [run(c)] }]);
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  add(id, { type: "text", z: x.z ?? 3, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r((ps[2] ?? 0) / ps[0]), ...(x.align ? { align: x.align } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: lay({ ...l[0], size: ps[0] }, { ...l[1], size: ss[0] }), ...(x.hidden ? { hidden: x.hidden } : {}) });
}
const sec = (id, name, pc, sp, more = {}) => { secs[id] = { name, background: { color: more.bg ?? "theme:background" }, minHeight: { pc, sp }, ...(more.anchor ? { anchor: more.anchor } : {}), ...(more.nav ? { nav: more.nav } : {}) }; };
const photo = (id, section, asset, z, pc, sp, crop = {}, darken) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1, ...crop }, ...(darken ? { darken } : {}) });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });
const TEL = { kind: "shopPhone" }, C = { align: "center" }, DARKEN = 35;
const PHONE = ["/contact/phone", "phone"], ADDR = ["/location", "address"];
const tbMargin = { left: "4.8rem", width: "calc(100% - 9.6rem)" };

// ---- ヘッダー（PC は文字のリンク＋中央の店名＋電話のピル、タブレット以下は店名と Menu のボタン）
sec("sec_header", "ヘッダー", 93, 75);
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: W, font: B, spMenuBackground: INK }, layout: lay({ x: 40, y: 0, w: 640, h: 93, size: 14 }, { x: 316, y: 0, w: 66, h: 75 }) });
t("hd_name", "sec_header", SHORT, [[24, 36, 0], [20, 30, 0]], H, W, [{ x: 470, y: 28, w: 500, h: 36 }, { x: 20, y: 22, w: 200, h: 30 }], { ...C, role: "heading", link: { kind: "anchor", value: "pg_home#top" } });
rect("hd_tel_b", "sec_header", OL, 2, { x: 1267, y: 22, w: 133, h: 48 }, { x: 0, y: 0, w: 1, h: 1 }, { radius: 30, hidden: { sp: true }, link: TEL });
t("hd_tel_t", "sec_header", "ご予約", [[14, 21, 0.7], [14, 21, 0.7]], B, W, [{ x: 1267, y: 35, w: 133, h: 21 }, { x: 0, y: 0, w: 1, h: 1 }], { ...C, hidden: { sp: true }, link: TEL, z: 4 });

// ---- 1 ファーストビュー
sec("sec_firstv", "最初の画面", 900, 844, { anchor: "top" });
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 0, y: 0, w: 1440, h: 900 }, { x: 0, y: 0, w: 390, h: 844 }, { fx: 56, fy: 62 }, DARKEN);
// 店名は幅 1280 に合わせると約 356px。データの上限は 200 なので、PC の実寸は wa06-finish の CSS で上書きする
t("fv_name", "sec_firstv", SHORT, [[200, 208, 0], [84, 87, 0]], H, W, [{ x: 80, y: 436, w: 1280, h: 372 }, { x: 20, y: 667, w: 370, h: 87 }], { role: "pageTitle" });
t("fv_l", "sec_firstv", { lines: ["兵庫県芦屋市 浜町", "阪神芦屋駅 徒歩5分"] }, [[14, 21, 0.7], [12, 18, 0.6]], B, W, [{ x: 80, y: 836, w: 400, h: 42 }, { x: 20, y: 772, w: 170, h: 36 }]);
t("fv_r", "sec_firstv", { lines: ["Trattoria", "手打ちパスタと薪窯のピッツァ"] }, [[14, 21, 0.7], [12, 18, 0.6]], B, W, [{ x: 960, y: 836, w: 400, h: 42 }, { x: 190, y: 772, w: 180, h: 36 }], { align: "right" });
tb("fv_name", { "font-size": "calc((100vw - 9.6rem) / 3.54)", "line-height": "1.04", left: "4.8rem", width: "auto", top: "56rem", height: "auto" });
tb("fv_l", { left: "4.8rem", width: "40%", top: "77.2rem" });
tb("fv_r", { left: "auto", right: "4.8rem", width: "40%", top: "77.2rem" });

// ---- 2 お店について（オリーブ）
const ABOUT = [
  "芦屋川の河口に近い浜町の路地に、小さなトラットリアを開きました。店の名前はイタリア語で「海の光」。昼は窓からの陽ざしの中で、夜は薪窯の炎を眺めながら、ご家族やご友人と気兼ねなく食事を楽しんでいただきたいと思っています。",
  "パスタは毎朝、粉を練るところから。ピッツァは薪窯で一気に焼き上げ、魚は明石や淡路の浜から届いたものを、その日いちばんおいしい形でお出しします。ワインは造り手の顔が見える自然派を中心に揃えました。",
];
sec("sec_about", "お店について", 1880, 1620, { bg: OL, anchor: "about", nav: { label: "お店について", order: 1 } });
t("ab_lb", "sec_about", "About", [[32, 48, 0], [28, 42, 0]], H, CR, [{ x: 80, y: 180, w: 140, h: 48 }, { x: 20, y: 104, w: 130, h: 42 }]);
t("ab_hand", "sec_about", "Benvenuti!", [[40, 48, 0], [32, 40, 0]], A, CR, [{ x: 240, y: 164, w: 260, h: 48 }, { x: 170, y: 90, w: 220, h: 40 }], { weight: 500 });
t("ab_en", "sec_about", { lines: ["Mare e", "Luce"] }, [[96, 115, 0], [50, 60, 0]], H, CR, [{ x: 80, y: 304, w: 660, h: 230 }, { x: 20, y: 168, w: 350, h: 120 }], { role: "heading" });
t("ab_p", "sec_about", { lines: ABOUT }, [[16, 40, 1.28], [16, 36, 0.8]], B, W, [{ x: 80, y: 600, w: 560, h: 560 }, { x: 20, y: 320, w: 350, h: 460 }]);
photo("ab_ph1", "sec_about", "ast_ab01", 2, { x: 800, y: 420, w: 640, h: 848 }, { x: 58, y: 800, w: 332, h: 440 });
photo("ab_ph2", "sec_about", "ast_ab02", 2, { x: 0, y: 1160, w: 400, h: 534 }, { x: 0, y: 1280, w: 207, h: 277 }, { fy: 60 });
tb("ab_ph1", { ...tbMargin, top: "80rem", height: "89.6rem" });
tb("ab_ph2", { left: "0", width: "40rem", top: "173.6rem", height: "53.4rem" });
tablet.secs.sec_about = "237.4rem";

// ---- 3 おすすめ3品（テラコッタの帯）
const RC = [["Antipasto", "ブルスケッタ 三種の盛り合わせ", 1280, "ast_rc01", {}], ["Pasta", "ボロネーゼのタリアテッレ", 2000, "ast_rc02", { fx: 90 }], ["Pizza", "マルゲリータ", 1500, "ast_rc03", {}]];
sec("sec_recommend", "おすすめ3品", 1021, 1875, { bg: TC, anchor: "recommend", nav: { label: "おすすめ", order: 2 } });
t("rc_h", "sec_recommend", "Recommended", [[32, 48, 0], [28, 42, 0]], H, W, [{ x: 80, y: 140, w: 1280, h: 48 }, { x: 20, y: 104, w: 350, h: 42 }], { ...C, role: "heading" });
RC.forEach(([en, name, price, ast, crop], i) => {
  const xP = 480 * i, yS = 200 + 527 * i, cl = 33.3333 * i;
  photo(`rc_ph${i}`, "sec_recommend", ast, 2, { x: xP, y: 240, w: 480, h: 641 }, { x: 20, y: yS, w: 350, h: 475 }, crop, DARKEN);
  t(`rc_en${i}`, "sec_recommend", en, [[64, 96, 0], [41, 62, 0]], H, W, [{ x: xP, y: 450, w: 480, h: 96 }, { x: 20, y: yS + 150, w: 350, h: 62 }], C);
  t(`rc_n${i}`, "sec_recommend", name, [[16, 24, 0.8], [16, 24, 0.8]], B, W, [{ x: xP + 40, y: 560, w: 400, h: 24 }, { x: 40, y: yS + 226, w: 310, h: 24 }], C);
  t(`rc_p${i}`, "sec_recommend", yen(price), [[18, 27, 0], [18, 27, 0]], B, W, [{ x: xP, y: 596, w: 480, h: 27 }, { x: 20, y: yS + 262, w: 350, h: 27 }], C);
  tb(`rc_ph${i}`, { left: `${cl}%`, width: "33.3334%", top: "20rem", height: "34.2rem" });
  tb(`rc_en${i}`, { left: `${cl}%`, width: "33.3334%", top: "31rem", "font-size": "4rem", "line-height": "4.8rem", height: "4.8rem" });
  tb(`rc_n${i}`, { left: `calc(${cl}% + 1.2rem)`, width: "calc(33.3334% - 2.4rem)", top: "37rem", "font-size": "1.4rem", "line-height": "2.1rem", height: "4.2rem" });
  tb(`rc_p${i}`, { left: `${cl}%`, width: "33.3334%", top: "42rem" });
});
tablet.secs.sec_recommend = "68.2rem";

// ---- 4 メニュー（生成り）
sec("sec_menu", "メニュー", 3080, 2720, { anchor: "menu", nav: { label: "メニュー", order: 3 } });
t("mn_h", "sec_menu", "Menu", [[96, 115, 0], [50, 60, 0]], H, TC, [{ x: 80, y: 180, w: 600, h: 115 }, { x: 20, y: 104, w: 350, h: 60 }], { role: "heading" });
t("mn_p", "sec_menu", "前菜からドルチェまで、季節の食材でご用意しています。まずは前菜を分け合って、パスタかピッツァを囲み、仕上げに自家製のドルチェをどうぞ。", [[16, 40, 1.28], [16, 32, 0.8]], B, INK, [{ x: 720, y: 180, w: 640, h: 200 }, { x: 20, y: 184, w: 350, h: 200 }]);
photo("mn_ph1", "sec_menu", "ast_mn01", 2, { x: 80, y: 683, w: 554, h: 739 }, { x: 20, y: 400, w: 216, h: 287 }, { fy: 60 });
photo("mn_ph2", "sec_menu", "ast_mn02", 2, { x: 1040, y: 863, w: 320, h: 214 }, { x: 246, y: 440, w: 124, h: 83 }, { fy: 52 });
photo("mn_ph3", "sec_menu", "ast_mn03", 2, { x: 720, y: 1237, w: 380, h: 507 }, { x: 222, y: 700, w: 148, h: 197 });
tb("mn_h", { "font-size": "7.2rem", "line-height": "8.6rem", height: "8.6rem", left: "4.8rem", width: "calc(100% - 9.6rem)", top: "10.4rem" });
tb("mn_p", { ...tbMargin, top: "21rem", height: "16rem" });
tb("mn_ph1", { left: "4.8rem", width: "29.1rem", top: "40rem", height: "38.8rem" });
tb("mn_ph2", { left: "calc(4.8rem + 34rem)", width: "16.8rem", top: "42rem", height: "11.2rem" });
tb("mn_ph3", { left: "calc(4.8rem + 34rem)", width: "20rem", top: "58rem", height: "26.7rem" });
// 品書き：区分の見出し＋線＋品の行
let n = 0;
function cat(c, xP, yP, yS) {
  const i0 = n++;
  t(`li_e${i0}`, "sec_menu", c.en, [[32, 48, 0], [28, 42, 0]], H, OL, [{ x: xP, y: yP, w: 300, h: 48 }, { x: 20, y: yS, w: 240, h: 42 }]);
  t(`li_j${i0}`, "sec_menu", c.ja, [[14, 21, 0.7], [14, 21, 0.7]], B, OL, [{ x: xP + 400, y: yP + 20, w: 200, h: 21 }, { x: 260, y: yS + 16, w: 110, h: 21 }], { align: "right" });
  rect(`li_b${i0}`, "sec_menu", INK, 2, { x: xP, y: yP + 56, w: 600, h: 1 }, { x: 20, y: yS + 50, w: 350, h: 1 }, { opacity: 30 });
  return [yP + 56, yS + 50];
}
function row(name, price, xP, yP, yS, i) {
  const k = n++;
  t(`li_n${k}`, "sec_menu", name, [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: xP, y: yP + 14, w: 460, h: 28 }, { x: 20, y: yS + 12, w: 260, h: 28 }]);
  t(`li_p${k}`, "sec_menu", yen(price), [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: xP + 460, y: yP + 14, w: 140, h: 28 }, { x: 280, y: yS + 12, w: 90, h: 28 }], { align: "right" });
  rect(`li_l${k}`, "sec_menu", INK, 2, { x: xP, y: yP + 56, w: 600, h: 1 }, { x: 20, y: yS + 52, w: 350, h: 1 }, { opacity: 30 });
}
let yL = 1880, yR = 1880, yS = 940;
for (const c of MENU) {
  const left = ["antipasti", "pasta", "pizza"].includes(c.id);
  const xP = left ? 80 : 720;
  const y0 = left ? yL : yR;
  const [lyP, lyS] = cat(c, xP, y0, yS);
  c.items.forEach(([nm, pr], i) => row(nm, pr, xP, lyP + 56 * i, lyS + 52 * i, i));
  const nextP = lyP + 56 * c.items.length + 44, nextS = lyS + 52 * c.items.length + 36;
  if (left) yL = nextP; else yR = nextP;
  yS = nextS;
}
// コースの案内（右の列の下、スマホはドルチェの次）
t("co_e", "sec_menu", "Corso", [[32, 48, 0], [28, 42, 0]], H, OL, [{ x: 720, y: yR, w: 300, h: 48 }, { x: 20, y: yS, w: 240, h: 42 }]);
t("co_j", "sec_menu", "コース", [[14, 21, 0.7], [14, 21, 0.7]], B, OL, [{ x: 1120, y: yR + 20, w: 200, h: 21 }, { x: 260, y: yS + 16, w: 110, h: 21 }], { align: "right" });
rect("co_b", "sec_menu", INK, 2, { x: 720, y: yR + 56, w: 600, h: 1 }, { x: 20, y: yS + 50, w: 350, h: 1 }, { opacity: 30 });
t("co_n", "sec_menu", "ディナーコース", [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: 720, y: yR + 70, w: 460, h: 28 }, { x: 20, y: yS + 62, w: 260, h: 28 }]);
t("co_p", "sec_menu", yen(5500), [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: 1180, y: yR + 70, w: 140, h: 28 }, { x: 280, y: yS + 62, w: 90, h: 28 }], { align: "right" });
t("co_d", "sec_menu", "前菜・パスタ・ピッツァ・メイン・ドルチェの全5品。前日までのご予約で承ります。", [[14, 28, 0], [14, 26, 0]], B, INK, [{ x: 720, y: yR + 110, w: 600, h: 56 }, { x: 20, y: yS + 100, w: 350, h: 52 }]);
const noteP = Math.max(yL, yR + 180), noteS = yS + 170;
t("mn_note", "sec_menu", "価格はすべて税込です。", [[14, 28, 0], [14, 28, 0]], B, INK, [{ x: 80, y: noteP, w: 600, h: 28 }, { x: 20, y: noteS, w: 350, h: 28 }]);
secs.sec_menu.minHeight = { pc: noteP + 28 + 180, sp: noteS + 28 + 104 };

// ---- 5〜7 ワイン・ランチ・ディナー（全面写真＋下に説明と値段）
const FEATS = [
  { p: "wi", en: "Wine", ast: "ast_wi01", crop: { fx: 30, fy: 10 }, nav: { label: "ワイン", order: 4 }, ja: "造り手の顔が見える、自然派ワイン", body: "イタリア各地の小さな造り手から届く自然派ワインを、白を中心に揃えています。料理に合わせて、グラスでもボトルでもご案内します。", rows: [["グラスワイン", "900円〜"], ["ボトルワイン", "4,800円〜"]] },
  { p: "lu", en: "Lunch", ast: "ast_lu01", crop: { fx: 59 }, nav: { label: "ランチ", order: 5 }, ja: "平日も週末も、気軽なお昼を", body: "パスタかピッツァを選べるランチに、サラダとパン、食後のコーヒーが付きます。少しゆっくりしたい日は、前菜から楽しめるコースをどうぞ。", rows: [["パスタランチ", "1,800円"], ["ピッツァランチ", "1,700円"], ["ランチコース", "3,300円"]], note: "11:30〜15:00（L.O. 14:00）" },
  { p: "di", en: "Dinner", ast: "ast_di01", crop: { fx: 34 }, ja: "薪窯の炎を眺めて、ゆっくりと", body: "夜は窯の火を絶やさず、ピッツァと肉、魚を焼き上げます。ご友人との集まりには、前菜からドルチェまで揃ったコースもご用意しています。", rows: [["ディナーコース", "5,500円"], ["アラカルト 前菜", "980円〜"], ["アラカルト メイン", "2,800円〜"]], note: "17:30〜22:30（L.O. 21:30）" },
];
for (const f of FEATS) {
  const s = `sec_${f.en.toLowerCase()}`, pre = f.p;
  sec(s, f.en, 1218, 1040, { anchor: f.en.toLowerCase(), ...(f.nav ? { nav: f.nav } : {}) });
  photo(`${pre}_ph`, s, f.ast, 1, { x: 0, y: 0, w: 1440, h: 810 }, { x: 0, y: 0, w: 390, h: 520 }, f.crop, 30);
  t(`${pre}_en`, s, f.en, [[64, 76, 0], [44, 53, 0]], H, W, [{ x: 80, y: 686, w: 1280, h: 76 }, { x: 20, y: 442, w: 350, h: 53 }], { role: "heading" });
  t(`${pre}_h`, s, f.ja, [[24, 36, 0.5], [22, 33, 0]], B, INK, [{ x: 80, y: 858, w: 560, h: 36 }, { x: 20, y: 564, w: 350, h: 33 }], { role: "subheading", weight: 500 });
  t(`${pre}_p`, s, f.body, [[16, 32, 0.8], [16, 32, 0.8]], B, INK, [{ x: 80, y: 906, w: 560, h: 160 }, { x: 20, y: 609, w: 350, h: 180 }]);
  // 値段の表（行 56）
  f.rows.forEach(([k, v], i) => {
    const yP = 858 + 56 * i, yS_ = 800 + 52 * i;
    rect(`${pre}_l${i}`, s, INK, 2, { x: 720, y: yP + 55, w: 640, h: 1 }, { x: 20, y: yS_ + 51, w: 350, h: 1 }, { opacity: 30 });
    t(`${pre}_k${i}`, s, k, [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: 720, y: yP + 14, w: 440, h: 28 }, { x: 20, y: yS_ + 12, w: 240, h: 28 }]);
    t(`${pre}_v${i}`, s, v, [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: 1160, y: yP + 14, w: 200, h: 28 }, { x: 260, y: yS_ + 12, w: 110, h: 28 }], { align: "right" });
  });
  if (f.note) t(`${pre}_nt`, s, f.note, [[14, 28, 0], [14, 28, 0]], B, INK, [{ x: 720, y: 858 + 56 * f.rows.length + 8, w: 640, h: 28 }, { x: 20, y: 800 + 52 * f.rows.length + 8, w: 350, h: 28 }]);
  // タブレット：写真は全幅×16:9（高さの差 --d だけ下を動かす）
  tablet.secs[s] = "calc(104rem + var(--d))";
  tb(`${pre}_ph`, { height: "56.25vw" });
  for (const [id, e] of Object.entries(els)) {
    if (e.section !== s || id === `${pre}_ph`) continue;
    if (id === `${pre}_en`) tb(id, { ...tbMargin, top: "calc(56.25vw - 10.1rem)" });
    else tb(id, { top: `calc(${e.layout.sp.y / 10}rem + var(--d))` });
  }
}

// ---- 8 営業案内
sec("sec_info", "営業案内", 660, 700, { anchor: "information" });
t("in_h", "sec_info", "Information", [[32, 48, 0], [28, 42, 0]], H, TC, [{ x: 80, y: 120, w: 300, h: 48 }, { x: 20, y: 104, w: 350, h: 42 }], { role: "heading" });
const INFO = [["ランチ", "11:30〜15:00（L.O. 14:00）"], ["ディナー", "17:30〜22:30（L.O. 21:30）"], ["定休日", "月曜日"], ["ご住所", ADDR], ["交通", ["/location/access", "access"]], ["お電話", PHONE]];
INFO.forEach(([k, v], i) => {
  const yP = 120 + 76 * i, yS_ = 170 + 84 * i;
  rect(`in_l${i}`, "sec_info", INK, 2, { x: 400, y: yP + 75, w: 960, h: 1 }, { x: 20, y: yS_ + 83, w: 350, h: 1 }, { opacity: 30 });
  t(`in_k${i}`, "sec_info", k, [[14, 28, 0.7], [14, 22, 0.7]], B, OL, [{ x: 400, y: yP + 24, w: 150, h: 28 }, { x: 20, y: yS_ + 10, w: 350, h: 22 }]);
  t(`in_v${i}`, "sec_info", v, [[16, 28, 0], [16, 28, 0]], B, INK, [{ x: 560, y: yP + 24, w: 800, h: 28 }, { x: 20, y: yS_ + 38, w: 350, h: 28 }], i === 5 ? { link: TEL } : {});
  tb(`in_k${i}`, { width: "16rem" });
  tb(`in_v${i}`, { left: "calc(5.128% + 16rem)", width: "calc(89.744% - 16rem)", top: `${(yS_ + 10) / 10}rem` });
});
tb("in_h", {}); tablet.secs.sec_info = "68rem";

// ---- 9 アクセス
sec("sec_access", "アクセス", 720, 900, { anchor: "access", nav: { label: "アクセス", order: 6 } });
t("ac_h", "sec_access", "Access", [[32, 48, 0], [28, 42, 0]], H, TC, [{ x: 80, y: 120, w: 300, h: 48 }, { x: 20, y: 104, w: 350, h: 42 }], { role: "heading" });
t("ac_p", "sec_access", "阪神芦屋駅から南へ徒歩5分、芦屋川沿いの道を浜へ向かう途中にあります。お車の方は、お近くのコインパーキングをご利用ください。", [[16, 32, 0.8], [16, 32, 0.8]], B, INK, [{ x: 80, y: 192, w: 560, h: 192 }, { x: 20, y: 164, w: 350, h: 192 }]);
rect("ac_map", "sec_access", "theme:lineSoft", 2, { x: 720, y: 120, w: 640, h: 440 }, { x: 20, y: 380, w: 350, h: 416 });
tb("ac_map", { ...tbMargin, top: "38rem", height: "40rem" }); tablet.secs.sec_access = "88rem";

// ---- 10 ご予約（オリーブの帯）
sec("sec_reserve", "ご予約", 628, 761, { anchor: "reserve" });
rect("rs_band", "sec_reserve", OL, 1, { x: 80, y: 120, w: 1280, h: 388 }, { x: 20, y: 60, w: 350, h: 640 }, { radius: 10 });
t("rs_h", "sec_reserve", "Reservation", [[48, 58, 0], [36, 44, 0]], H, W, [{ x: 160, y: 200, w: 520, h: 58 }, { x: 44, y: 120, w: 300, h: 44 }], { role: "heading" });
t("rs_p", "sec_reserve", "ご家族のお祝いや、ご友人との集まりなど、人数やご希望に合わせてお席をご用意します。当日のご予約も、お気軽にお電話ください。", [[16, 32, 0.8], [16, 32, 0.8]], B, W, [{ x: 720, y: 200, w: 560, h: 128 }, { x: 44, y: 200, w: 302, h: 288 }]);
rect("rs_btn_b", "sec_reserve", CR, 2, { x: 720, y: 356, w: 260, h: 54 }, { x: 44, y: 540, w: 302, h: 54 }, { radius: 30, link: TEL });
t("rs_btn_t", "sec_reserve", "電話で予約する", [[16, 24, 0.8], [16, 24, 0.8]], B, OL, [{ x: 720, y: 371, w: 260, h: 24 }, { x: 44, y: 555, w: 302, h: 24 }], { ...C, link: TEL, z: 4 });

// ---- 11 店内の2枚（欧文はリンクにしない）
sec("sec_scene", "店内", 676, 726);
const SA = [["La Sala", "明るい窓辺の客席", "ast_sa01", { fy: 72 }], ["Il Forno", "薪窯で焼き上げます", "ast_sa02", { fy: 40 }]];
SA.forEach(([en, d, ast, crop], i) => {
  const xP = 80 + 640 * i, yS_ = 20 + 324 * i;
  photo(`sa_ph${i}`, "sec_scene", ast, 2, { x: xP, y: 0, w: 640, h: 556 }, { x: 20, y: yS_, w: 350, h: 304 }, crop, DARKEN);
  t(`sa_en${i}`, "sec_scene", en, [[54, 81, 0], [41, 62, 0]], H, W, [{ x: xP, y: 214, w: 640, h: 81 }, { x: 20, y: yS_ + 100, w: 350, h: 62 }], C);
  t(`sa_d${i}`, "sec_scene", d, [[12, 18, 0.6], [12, 18, 0.6]], B, W, [{ x: xP, y: 300, w: 640, h: 18 }, { x: 20, y: yS_ + 168, w: 350, h: 18 }], C);
  tb(`sa_ph${i}`, { left: i ? "50%" : "0", width: "50%", top: "2rem", height: "33.4rem" });
  tb(`sa_en${i}`, { left: i ? "50%" : "0", width: "50%", top: "15rem" });
  tb(`sa_d${i}`, { left: i ? "50%" : "0", width: "50%", top: "21.6rem" });
});
tablet.secs.sec_scene = "45rem";

// ---- 12 フッター（焦げ茶）
sec("sec_footer", "フッター", 620, 640, { bg: INK });
t("ft_a1", "sec_footer", NAME, [[14, 24, 0.7], [14, 24, 0.7]], B, CR, [{ x: 80, y: 90, w: 560, h: 24 }, { x: 20, y: 64, w: 350, h: 24 }]);
t("ft_a2", "sec_footer", ADDR, [[14, 24, 0.7], [14, 24, 0.7]], B, CR, [{ x: 80, y: 118, w: 560, h: 24 }, { x: 20, y: 92, w: 350, h: 24 }]);
t("ft_a3", "sec_footer", ["/location/access", "access"], [[14, 24, 0.7], [14, 24, 0.7]], B, CR, [{ x: 80, y: 146, w: 560, h: 24 }, { x: 20, y: 120, w: 350, h: 24 }]);
t("ft_h", "sec_footer", { lines: ["ランチ 11:30〜15:00（L.O. 14:00）", "ディナー 17:30〜22:30（L.O. 21:30）", "定休日 月曜日"] }, [[14, 24, 0.7], [14, 24, 0.7]], B, CR, [{ x: 720, y: 90, w: 340, h: 72 }, { x: 20, y: 168, w: 350, h: 72 }]);
t("ft_t", "sec_footer", PHONE, [[14, 24, 0.7], [14, 24, 0.7]], B, CR, [{ x: 1085, y: 90, w: 275, h: 24 }, { x: 20, y: 264, w: 350, h: 24 }], { link: TEL });
t("ft_name", "sec_footer", SHORT, [[200, 208, 0], [84, 87, 0]], H, TC, [{ x: 80, y: 190, w: 1280, h: 372 }, { x: 20, y: 400, w: 370, h: 87 }]);
t("ft_copy", "sec_footer", `© ${NAME}`, [[12, 18, 0.6], [12, 18, 0.6]], B, CR, [{ x: 80, y: 580, w: 600, h: 18 }, { x: 20, y: 594, w: 350, h: 18 }]);
tb("ft_a1", { left: "4.8rem", width: "calc(50% - 7.2rem)", top: "6.4rem" }); tb("ft_a2", { left: "4.8rem", width: "calc(50% - 7.2rem)", top: "9.2rem" }); tb("ft_a3", { left: "4.8rem", width: "calc(50% - 7.2rem)", top: "12rem" });
tb("ft_h", { left: "calc(50% + 2.4rem)", width: "calc(50% - 7.2rem)", top: "6.4rem" }); tb("ft_t", { left: "calc(50% + 2.4rem)", width: "calc(50% - 7.2rem)", top: "15.2rem" });
tb("ft_name", { "font-size": "calc((100vw - 9.6rem) / 3.54)", "line-height": "1.04", left: "4.8rem", width: "auto", height: "auto", top: "22rem" });
tb("ft_copy", { left: "4.8rem", width: "calc(100% - 9.6rem)", top: "calc(22rem + (100vw - 9.6rem) / 3.54 * 1.04 + 2rem)" });
tablet.secs.sec_footer = "calc(22rem + (100vw - 9.6rem) / 3.54 * 1.04 + 7rem)";

// ---- 書き出し
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_06", canvas: { pcContentWidth: Pw, spDesignWidth: Sw },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_recommend", "sec_menu", "sec_wine", "sec_lunch", "sec_dinner", "sec_info", "sec_access", "sec_reserve", "sec_scene"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky", headerOverlay: { pages: ["pg_home"], textColor: W } }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
fs.writeFileSync(`${DIR}/wa06-tablet.json`, JSON.stringify(tablet, null, 1) + "\n");
console.log(`wa06-gen: 要素 ${Object.keys(els).length}／写真 ${Object.keys(SLOTS).length} 枠／メニューの下端 PC ${secs.sec_menu.minHeight.pc}・SP ${secs.sec_menu.minHeight.sp}`);
