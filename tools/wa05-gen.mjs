#!/usr/bin/env node
// wa-05：templates/wa-05/SPEC.md の実測値から samples/sumi の assets.json・site.json を作る。
// 写真は templates/wa-05/photos.txt の行（「枠 URL」）を media/ に取得する。行の無い枠は実ファイルなしのまま。
// 使い方：node tools/wa05-gen.mjs → node tools/build.mjs samples/sumi → node tools/wa05-finish.mjs
import fs from "node:fs";
const DIR = "samples/sumi", LIST = "templates/wa-05/photos.txt";
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const NOW = "2026-11-09T23:30:00+09:00";

// ---- 写真の枠（SPEC 7章）
const SLOTS = {
  fv: ["signature", "黒い椀によそった白いご飯と、奥の朱塗りの汁椀"],
  st1: ["signature", "箸で持ち上げた握り"], st2: ["signature", "黒い長皿に並べた握りと箸"], st3: ["signature", "炙りを入れた握り二貫"],
  st4: ["product", "土ものの小さな器の取り合わせ"], st5: ["product", "木の棚に重ねた皿と鉢"],
  sn1: ["signature", "白身魚の西京焼きと甘酢の生姜"], sn2: ["signature", "若布と豆腐の椀（朱の木椀）"], sn3: ["signature", "揚げ出し豆腐 舞茸の餡（黒い鉢）"], sn4: ["signature", "九条葱の温うどん（土ものの鉢）"],
  se1: ["interior", "白木のカウンターと奥の棚の器"], se2: ["interior", "障子から光の入る畳の個室"],
};
// 検索で確かめた枠は、紹介ページの URL を台帳に書く
const PAGES = {
  sn1: "https://unsplash.com/photos/WosJwI5F23Q", sn2: "https://unsplash.com/photos/Mk3NKQboQkA", sn3: "https://unsplash.com/photos/d5bdtWUbFkM",
  se1: "https://unsplash.com/photos/wCrSi4mSsxM", se2: "https://unsplash.com/photos/ITx82kndvm0",
};
const astId = (k) => (k === "fv" ? "fv01" : `${k.slice(0, 2)}0${k[2]}`); // 台帳の ID は4文字以上
// WebP の大きさを読む（VP8X・VP8・VP8L）
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
for (const [k, [slot, alt]] of Object.entries(SLOTS)) {
  const id = `ast_${astId(k)}`, key = `${id}.webp`, f = `${DIR}/media/${key}`, url = urls[k];
  if (url && !fs.existsSync(f)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`写真 ${k}: HTTP ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.existsSync(f) ? fs.readFileSync(f) : null;
  const size = buf ? webpSize(buf) : { width: 1200, height: 1200 };
  assets[id] = { kind: "photo", file: { key, mime: "image/webp", ...size, bytes: buf ? buf.length : 1, exifStripped: true }, uploadedAt: NOW, uploadedBy: "producer",
    origin: { kind: "stock", provider: "unsplash", pageUrl: PAGES[k] ?? (url ? url.split("?")[0] : "https://images.unsplash.com/") },
    rights: { basis: "licensed", confirmedAt: NOW, confirmedBy: "producer", note: "Unsplash License（架空のお店のデザイン見本）" }, slot, alt };
}
fs.writeFileSync(`${DIR}/assets.json`, JSON.stringify({ schemaVersion: 1, assets }, null, 2) + "\n");

// ---- 配置の道具（wa-04 と同じ）
const P = 1440, S = 390, r = (n) => Math.round(n * 10000) / 10000;
const box = (b, W) => ({ ...b, x: r((b.x / W) * 100), w: r((b.w / W) * 100) });
const lay = (pc, sp) => ({ pc: box(pc, P), sp: box(sp, S) });
const els = {}, secs = {};
const add = (id, e) => { els[id] = e; };
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (c) => c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : [{ runs: [run(c)] }];
function t(id, section, content, [ps, ss], font, color, l, x = {}) {
  add(id, { type: "text", z: x.z ?? 3, role: x.role ?? "body", section, paragraphs: paras(content),
    style: { font, weight: x.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r((ps[2] ?? 0) / ps[0]), ...(x.align ? { align: x.align } : {}), ...(x.link ? { link: x.link } : {}) },
    layout: lay({ ...l[0], size: ps[0], ...(x.vp ? { writingMode: "vertical" } : {}) }, { ...l[1], size: ss[0], ...(x.vs ? { writingMode: "vertical" } : {}) }) });
}
const sec = (id, name, pc, sp, more = {}) => { secs[id] = { name, background: { color: "theme:background" }, minHeight: { pc, sp }, ...more }; };
const photo = (id, section, asset, z, pc, sp, crop = {}) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1, ...crop } });
const rect = (id, section, fill, z, pc, sp, x = {}) => add(id, { type: "shape", z, kind: "rect", fill, section, layout: lay(pc, sp), ...x });

const H = "font:heading", B = "font:body", A = "font:accent", INK = "#1F1E1C", CR = "#F4F0E8", MOSS = "#5B6647";
const NAME = shop.basic.name, TEL = { kind: "shopPhone" }, C = { align: "center" };
const go = (id) => ({ kind: "anchor", value: `pg_home#${id}` });
const LIGHT = { weight: 300 };
const BIG = [[80, 96, 0], [48, 58, 0]];
// 段の札（短い線＋縦書き）と欧文の大見出し
function head(p, section, ja, en, color, y, yS) {
  rect(`${p}_ln`, section, color, 3, { x: 120, y, w: 48, h: 1 }, { x: 40, y: yS, w: 32, h: 1 });
  t(`${p}_lb`, section, ja, [[14, 18, 2.8], [14, 18, 2.8]], B, color, [{ x: 136, y: y + 12, w: 18, h: 96 }, { x: 47, y: yS + 12, w: 18, h: 96 }], { vp: 1, vs: 1 });
  t(`${p}_en`, section, en, BIG, A, color, [{ x: 278, y, w: 887, h: 96 }, { x: 96, y: yS, w: 254, h: 58 }], { ...LIGHT, role: "heading" });
}
// 先頭に「・」を付けた、線で囲むボタン（finish で角丸 30・線 1px）
function btn(id, section, label, link, pc, sp, color = INK) {
  rect(`${id}_b`, section, "theme:background", 2, pc, sp, { link });
  t(`${id}_t`, section, `・${label}`, [[14, 24, 1.4], [14, 24, 1.4]], B, color, [{ ...pc, y: pc.y + 12, h: 24 }, { ...sp, y: sp.y + 12, h: 24 }], { ...C, link, z: 4 });
}

// ---- ヘッダー（参考どおり置かず、右上のメニューのボタンだけ。wa05-finish で PC もボタンにする）
sec("sec_header", "ヘッダー", 48, 48);
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: INK, font: B, spMenuBackground: "theme:primary" }, layout: lay({ x: 1376, y: 0, w: 48, h: 48, size: 14 }, { x: 334, y: 0, w: 48, h: 48 }) });

// ---- 1 ファーストビュー
sec("sec_firstv", "最初の画面", 900, 865);
photo("fv_ph", "sec_firstv", "ast_fv01", 1, { x: 580, y: 0, w: 860, h: 900 }, { x: 40, y: 167, w: 310, h: 413 }, { fy: 72 });
t("fv_copy", "sec_firstv", { lines: ["一椀の出汁に、", "冬の香りを澄ませて。"] }, [[18, 36, 1.8], [14, 22, 1.4]], H, INK, [{ x: 90, y: 112, w: 400, h: 72 }, { x: 40, y: 22, w: 310, h: 56 }], { ...C, role: "heading" });
t("fv_en", "sec_firstv", "Seasonal Japanese cuisine in Ashiya", [[11, 18, 1.1], [11, 18, 1.1]], A, MOSS, [{ x: 90, y: 206, w: 400, h: 18 }, { x: 40, y: 82, w: 310, h: 18 }], C);
t("fv_name", "sec_firstv", NAME, [[48, 90, 4.8], [28, 44, 2.8]], H, INK, [{ x: 40, y: 340, w: 500, h: 90 }, { x: 40, y: 106, w: 310, h: 53 }], { ...C, role: "pageTitle" });
const FM = [["お料理", "cuisine"], ["お献立", "course"], ["季節の一品", "seasonal"], ["お席", "seats"], ["ご案内", "information"]];
FM.forEach(([l, id], i) => t(`fv_m${i}`, "sec_firstv", l, [[14, 36, 2.8], [14, 36, 2.8]], B, INK, [{ x: 218, y: 540 + 36 * i, w: 144, h: 36 }, { x: 40, y: 599 + 36 * i, w: 310, h: 36 }], { ...C, link: go(id) }));
btn("fv_tel", "sec_firstv", "ご予約", TEL, { x: 214, y: 732, w: 152, h: 48 }, { x: 119, y: 797, w: 152, h: 48 });

// ---- 2 ご挨拶
const GREET = [
  "芦屋の住宅街の一角に、八席のカウンターと、ひとつの個室だけの店を構えました。",
  "朝いちばんに昆布を水に沈め、鰹を削るところから、澄の一日は始まります。",
  "濁りのない出汁がひけた日は、それだけで料理の半分ができたようなものです。",
  "魚は明石や淡路の浜から、野菜は丹波と北摂の畑から。",
  "盛りの少し手前、香りがいちばん立つ頃を見計らって仕入れています。",
  "焼く、炊く、蒸す。手数はなるべく少なく、素材の輪郭を残すように。",
  "器は作家のものと古いものを取り合わせ、季節ごとに入れ替えます。",
  "一皿ごとに間をとって、お出しします。",
  "カウンターでは、料理の話もお酒の話も、どうぞお気軽に。",
  "大切な方との節目の席には、奥の個室をご用意しています。",
  "急がず、ゆっくりと、冬の時間を召し上がっていただけましたら幸いです。",
  "店主",
];
sec("sec_greeting", "ご挨拶", 1184, 1400);
t("gr_h", "sec_greeting", "出汁の一滴に、季節を聴く。", [[24, 48, 2.4], [20, 36, 2]], H, INK, [{ x: 120, y: 240, w: 1200, h: 48 }, { x: 40, y: 160, w: 310, h: 36 }], { ...C, role: "heading" });
t("gr_en", "sec_greeting", "Greeting", [[11, 18, 1.1], [11, 18, 1.1]], A, MOSS, [{ x: 120, y: 302, w: 1200, h: 18 }, { x: 40, y: 206, w: 310, h: 18 }], C);
t("gr_p", "sec_greeting", { lines: GREET }, [[14, 42, 1.4], [14, 34, 1.4]], B, INK, [{ x: 120, y: 440, w: 1200, h: 504 }, { x: 40, y: 280, w: 310, h: 970 }], C);

// ---- 3 お料理（写真の帯は wa05-finish で流す）
sec("sec_cuisine", "お料理", 1040, 1083, { anchor: "cuisine", nav: { label: "お料理", order: 1 } });
head("cu", "sec_cuisine", "お料理", "Cuisine", INK, 0, 0);
t("cu_en2", "sec_cuisine", "Cuisine of the season", [[11, 18, 1.1], [11, 18, 1.1]], A, MOSS, [{ x: 278, y: 140, w: 570, h: 18 }, { x: 96, y: 70, w: 254, h: 18 }]);
t("cu_p", "sec_cuisine", "お出しするのは、昼も夜もおまかせのみ。その日の仕入れと、お客様のご様子に合わせて、献立を組み立てます。苦手な食材は、ご予約の折にお聞かせください。", [[18, 45, 0], [15, 34, 0]], B, INK, [{ x: 278, y: 268, w: 570, h: 180 }, { x: 40, y: 140, w: 310, h: 238 }]);
btn("cu_btn", "sec_cuisine", "お献立", go("course"), { x: 278, y: 472, w: 160, h: 48 }, { x: 40, y: 400, w: 160, h: 48 });
t("cu_v1", "sec_cuisine", "一椀に、", [[32, 38, 6.4], [24, 28, 4.8]], H, INK, [{ x: 1134, y: 138, w: 38, h: 180 }, { x: 208, y: 470, w: 28, h: 130 }], { vp: 1, vs: 1, role: "heading" });
t("cu_v2", "sec_cuisine", "冬を澄ます。", [[32, 38, 6.4], [24, 28, 4.8]], H, INK, [{ x: 1062, y: 138, w: 38, h: 270 }, { x: 154, y: 470, w: 28, h: 190 }], { vp: 1, vs: 1, role: "heading" });
for (let i = 1; i <= 5; i++) photo(`st_${i}`, "sec_cuisine", `ast_st0${i}`, 2, { x: 0, y: 640, w: 400, h: 400 }, { x: 0, y: 760, w: 310, h: 310 });

// ---- 4 お献立（SPEC 6章）
sec("sec_course", "お献立", 860, 900, { anchor: "course", nav: { label: "お献立", order: 2 } });
head("co", "sec_course", "お献立", "Course", INK, 200, 160);
const COURSE = [
  { k: "昼", en: "Lunch", time: "11:30〜14:00（L.O. 13:00）", rows: [["おまかせ", "6,600円"], ["おまかせ 季節の椀つき", "8,800円"]] },
  { k: "夜", en: "Dinner", time: "17:30〜22:00（L.O. 20:00）", rows: [["おまかせ", "15,400円"], ["おまかせ 特選", "22,000円"]] },
];
COURSE.forEach((c, i) => {
  const xP = i ? 745 : 278, yS0 = i ? 520 : 290, W = 420;
  t(`co_h${i}`, "sec_course", c.k, [[18, 36, 1.8], [18, 36, 1.8]], H, INK, [{ x: xP, y: 340, w: W, h: 36 }, { x: 40, y: yS0, w: 310, h: 36 }], { role: "subheading" });
  c.rows.forEach(([n, p], j) => {
    const yP = 392 + 56 * j, yS = yS0 + 48 + 56 * j;
    rect(`co_l${i}${j}`, "sec_course", "theme:lineSoft", 2, { x: xP, y: yP, w: W, h: 1 }, { x: 40, y: yS, w: 310, h: 1 });
    t(`co_n${i}${j}`, "sec_course", n, [[16, 40, 0], [16, 40, 0]], B, INK, [{ x: xP, y: yP + 8, w: 290, h: 40 }, { x: 40, y: yS + 8, w: 210, h: 40 }]);
    t(`co_p${i}${j}`, "sec_course", p, [[16, 40, 0], [16, 40, 0]], B, INK, [{ x: xP + 290, y: yP + 8, w: 130, h: 40 }, { x: 250, y: yS + 8, w: 100, h: 40 }], { align: "right" });
  });
  t(`co_t${i}`, "sec_course", c.time, [[14, 28, 0], [14, 28, 0]], B, MOSS, [{ x: xP, y: 512, w: W, h: 28 }, { x: 40, y: yS0 + 168, w: 310, h: 28 }]);
});
t("co_note", "sec_course", "完全予約制です。値段は税込み、サービス料はいただいておりません。", [[14, 28, 0], [14, 28, 0]], B, INK, [{ x: 278, y: 580, w: 887, h: 28 }, { x: 40, y: 740, w: 310, h: 56 }]);

// ---- 5 季節の一品（墨の帯 x40〜1400）
sec("sec_seasonal", "季節の一品", 840, 2160, { anchor: "seasonal", nav: { label: "季節の一品", order: 3 } });
rect("sn_band", "sec_seasonal", INK, 1, { x: 40, y: 0, w: 1360, h: 840 }, { x: 0, y: 0, w: 390, h: 2160 });
head("sn", "sec_seasonal", "季節の一品", "Seasonal", CR, 120, 80);
t("sn_en2", "sec_seasonal", "冬の品書きより", [[14, 28, 1.4], [14, 28, 1.4]], B, CR, [{ x: 278, y: 240, w: 887, h: 28 }, { x: 96, y: 146, w: 254, h: 28 }]);
const item = (path, pc, sp, ps, ss, lh) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: "plain" } }] }], style: { font: B, weight: 400, color: CR, lineHeight: lh }, layout: { pc: { ...pc, size: ps }, sp: { ...sp, size: ss } } });
const CW = 270, pc_ = (n) => r((n / CW) * 100);
add("sn_cards", { type: "repeater", z: 3, section: "sec_seasonal", source: { kind: "catalog", menuId: "mnu_seasonal", pick: ["itm_s001", "itm_s002", "itm_s003", "itm_s004"] }, display: { mode: "grid", columns: { pc: 4, sp: 1 }, gap: { pc: 40, sp: 40 }, photoless: "sameCard" },
  card: { height: { pc: 440, sp: 440 }, elements: {
    c_ph: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: 270, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: 310, ratio: "custom" } } },
    c_nm: item("/name", { x: 0, y: 294, w: 100, h: 30 }, { x: 0, y: 330, w: 100, h: 30 }, 18, 18, 1.6667),
    c_ds: item("/description", { x: 0, y: 332, w: pc_(270), h: 96 }, { x: 0, y: 366, w: 100, h: 72 }, 13, 13, 1.8462) } },
  layout: lay({ x: 120, y: 320, w: 1200, h: 440 }, { x: 40, y: 220, w: 310, h: 1880 }) });

// ---- 6 お席（SPEC 6章）
sec("sec_seats", "お席", 1400, 1250, { anchor: "seats", nav: { label: "お席", order: 4 } });
head("se", "sec_seats", "お席", "Seats", INK, 240, 160);
photo("se_ph1", "sec_seats", "ast_se01", 2, { x: 278, y: 400, w: 600, h: 400 }, { x: 40, y: 260, w: 310, h: 207 });
t("se_h1", "sec_seats", "カウンター 八席", [[18, 36, 1.8], [18, 36, 1.8]], H, INK, [{ x: 918, y: 400, w: 247, h: 36 }, { x: 40, y: 487, w: 310, h: 36 }], { role: "subheading" });
t("se_p1", "sec_seats", "一枚板の白木に向かう八席です。炭の音や出汁の香りまで、調理の間合いをそのままお楽しみいただけます。", [[14, 35, 0], [14, 28, 0]], B, INK, [{ x: 918, y: 452, w: 247, h: 245 }, { x: 40, y: 531, w: 310, h: 112 }]);
photo("se_ph2", "sec_seats", "ast_se02", 2, { x: 565, y: 840, w: 600, h: 400 }, { x: 40, y: 690, w: 310, h: 207 });
t("se_h2", "sec_seats", "個室 ひと間", [[18, 36, 1.8], [18, 36, 1.8]], H, INK, [{ x: 278, y: 840, w: 247, h: 36 }, { x: 40, y: 917, w: 310, h: 36 }], { role: "subheading" });
t("se_p2", "sec_seats", "二名様から六名様まで。お顔合わせや長寿のお祝いなど、節目の席にお使いください。", [[14, 35, 0], [14, 28, 0]], B, INK, [{ x: 278, y: 892, w: 247, h: 210 }, { x: 40, y: 961, w: 310, h: 84 }]);

// ---- 7 ご予約・営業案内／アクセス（表の右に地図。埋め込みは wa05-finish）
sec("sec_info", "ご案内", 1240, 1300, { anchor: "information", nav: { label: "ご案内", order: 5 } });
head("in", "sec_info", "ご案内", "Information", INK, 0, 0);
btn("in_tel", "sec_info", "お電話でご予約", TEL, { x: 278, y: 130, w: 200, h: 48 }, { x: 40, y: 100, w: 200, h: 48 });
rect("in_mapbox", "sec_info", "theme:lineSoft", 2, { x: 745, y: 240, w: 420, h: 760 }, { x: 40, y: 880, w: 310, h: 340 });
const ROWS = [["ご住所", ["/location", "address"]], ["交通", ["/location/access", "access"]], ["昼の部", "11:30〜14:00（L.O. 13:00）"], ["夜の部", "17:30〜22:00（L.O. 20:00）"], ["定休日", "水曜日・第3火曜日"], ["お席", "カウンター8席・個室1室"], ["ご予約", "完全予約制"], ["お電話", ["/contact/phone", "phone"]]];
ROWS.forEach(([k, v], i) => {
  const yP = 240 + 95 * i, yS = 180 + 84 * i;
  rect(`in_l${i}`, "sec_info", "theme:lineSoft", 2, { x: 278, y: yP, w: 420, h: 1 }, { x: 40, y: yS, w: 310, h: 1 });
  t(`in_k${i}`, "sec_info", k, [[13, 24, 1.3], [13, 24, 1.3]], B, MOSS, [{ x: 278, y: yP + 14, w: 420, h: 24 }, { x: 40, y: yS + 10, w: 310, h: 24 }]);
  t(`in_v${i}`, "sec_info", v, [[16, 32, 0], [16, 32, 0]], B, INK, [{ x: 278, y: yP + 42, w: 420, h: 32 }, { x: 40, y: yS + 36, w: 310, h: 32 }], i === 7 ? { link: TEL } : {});
});

// ---- 8 フッター（白いカード x40〜1400、4列）
sec("sec_footer", "フッター", 481, 760);
rect("ft_card", "sec_footer", "theme:surface", 1, { x: 40, y: 40, w: 1360, h: 401 }, { x: 16, y: 20, w: 358, h: 720 });
t("ft_name", "sec_footer", NAME, [[24, 40, 2.4], [22, 36, 2.2]], H, INK, [{ x: 120, y: 120, w: 260, h: 40 }, { x: 40, y: 60, w: 310, h: 36 }]);
t("ft_addr", "sec_footer", ["/location", "address"], [[14, 28, 0], [14, 28, 0]], B, INK, [{ x: 120, y: 176, w: 260, h: 28 }, { x: 40, y: 104, w: 310, h: 28 }]);
FM.forEach(([l, id], i) => t(`ft_n${i}`, "sec_footer", l, [[14, 36, 1.4], [14, 36, 1.4]], B, INK, [{ x: 460, y: 120 + 36 * i, w: 260, h: 36 }, { x: 40, y: 164 + 36 * i, w: 310, h: 36 }], { link: go(id) }));
t("ft_hh", "sec_footer", "営業時間", [[13, 24, 1.3], [13, 24, 1.3]], B, MOSS, [{ x: 800, y: 120, w: 260, h: 24 }, { x: 40, y: 368, w: 310, h: 24 }]);
t("ft_hv", "sec_footer", { lines: ["昼 11:30〜14:00", "夜 17:30〜22:00", "水曜日・第3火曜日 定休"] }, [[14, 32, 0], [14, 32, 0]], B, INK, [{ x: 800, y: 152, w: 260, h: 96 }, { x: 40, y: 396, w: 310, h: 96 }]);
t("ft_th", "sec_footer", "ご予約", [[13, 24, 1.3], [13, 24, 1.3]], B, MOSS, [{ x: 1140, y: 120, w: 220, h: 24 }, { x: 40, y: 516, w: 310, h: 24 }]);
t("ft_tv", "sec_footer", ["/contact/phone", "phone"], [[20, 32, 0], [20, 32, 0]], B, INK, [{ x: 1140, y: 152, w: 220, h: 32 }, { x: 40, y: 544, w: 310, h: 32 }], { link: TEL });
t("ft_copy", "sec_footer", "© SUMI", [[12, 18, 1.2], [12, 18, 1.2]], A, INK, [{ x: 120, y: 380, w: 260, h: 18 }, { x: 40, y: 690, w: 310, h: 18 }]);

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_05", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_greeting", "sec_cuisine", "sec_course", "sec_seasonal", "sec_seats", "sec_info"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky", headerOverlay: { pages: ["pg_home"], textColor: INK } }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
const missing = Object.keys(SLOTS).filter((k) => !urls[k]);
console.log(`site.json: 要素 ${Object.keys(els).length}／写真 ${Object.keys(SLOTS).length - missing.length} 枠${missing.length ? `（未取得：${missing.join("・")}）` : ""}`);
