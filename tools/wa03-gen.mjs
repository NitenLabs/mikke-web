#!/usr/bin/env node
// wa-03：templates/wa-03/SPEC.md の実測値から samples/<店>/site.json を作る。店ごとの文言は samples/<店>/wa03.json。
// 使い方：node tools/wa03-gen.mjs <店> → node tools/build.mjs samples/<店> → node tools/wa03-finish.mjs <店>（<店> の既定は roku）
import fs from "node:fs";
import { formatClosedDays } from "./lib/format.mjs";
const ID = process.argv[2] || "roku";
const DIR = `samples/${ID}`;
const C = JSON.parse(fs.readFileSync(`${DIR}/wa03.json`, "utf8"));
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const P = 1440, S = 390, r = (n) => Math.round(n * 10000) / 10000;
const box = (b, W) => ({ ...b, x: r((b.x / W) * 100), w: r((b.w / W) * 100) });
const lay = (pc, sp) => ({ pc: box(pc, P), sp: box(sp, S) });
const els = {}, secs = {};
const add = (id, e) => { els[id] = e; };
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
const paras = (v) => (Array.isArray(v) && v.lines ? v.lines : [v]);
// 1段落に自由な文字と連動を混ぜる：{ mix: ["文字", ["/path", "format"], …] }（fromShop の店だけが使う）
const para = (c) => (c && c.mix ? { runs: c.mix.map(run) } : { runs: [run(c)] });
// t(id, 区画, 中身, [pc:[大,行,字], sp:[...]], 書体, 色, [pc配置, sp配置], 追加)
function t(id, section, content, [ps, ss], font, color, l, extra = {}) {
  add(id, { type: "text", z: extra.z ?? 3, role: "body", section, paragraphs: paras(content).map(para),
    style: { font, weight: extra.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r(ps[2] / ps[0]), ...(extra.align ? { align: extra.align } : {}), ...(extra.link ? { link: extra.link } : {}), ...(extra.gap ? { paragraphGap: extra.gap } : {}) },
    layout: lay({ ...l[0], size: ps[0], ...(extra.vp ? { writingMode: "vertical" } : {}) }, { ...l[1], size: ss[0] }), ...(extra.deco && FS ? { edit: false } : {}) });
}
const lines = (arr) => { const a = [...arr]; a.lines = arr; return a; };
const line = (id, section, fill, pc, sp, z = 2) => add(id, { type: "shape", z, kind: "line", fill, section, layout: lay({ ...pc, strokeWidth: 1 }, { ...sp, strokeWidth: 1 }) });
const sec = (id, name, color, pc, sp, more = {}) => { secs[id] = { name, background: { color }, minHeight: { pc, sp }, ...more }; };
const photo = (id, section, asset, z, pc, sp) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1 } });

const SCRIPT = "font:heading", B = "font:body", M = "font:accent", TX = "theme:text", MU = "theme:textMuted", AC = "theme:accent", SO = "theme:lineSoft", LN = "theme:line";
const SCRIPT_C = "#D0D0C6";
const NAME = C.name, SITE_NAME_EN = C.nameEn;
// fromShop（wa03.json）：営業時間・定休日・品書き・紹介文・写真を ①（shop.json・assets.json）だけから出す（指示 0044）。
//   紹介文は ① と連動（format=paragraphs）、品書きは括り（categoryIds）で ① の catalog を回す、情報の表の行は ① から決める、
//   飾りの文字（英字の見出し・項目名・ナビ・ボタンの文字など）は edit:false。fromShop の無い店（roku）は今までどおり。
const FS = !!C.fromShop;
const MAP_Q = `${shop.location.prefecture}${shop.location.city}${shop.location.town}${shop.location.street}`;
const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${MAP_Q} ${shop.basic.name}`)}`;

// 段の見出し：英字の大（Montserrat 300）＋日本語の小（差し色）
const EN = [[41.6, 41.6, -0.416], [44.8, 44.8, -0.448]], JA = [[14.4, 20.16, 0.72], [14.4, 20.16, 0.72]];
function head(prefix, section, en, ja, yEnP, yJaP, yEnS, yJaS) {
  t(`${prefix}_en`, section, en, EN, M, TX, [{ x: 80, y: yEnP, w: 640, h: 41.6 }, { x: 30, y: yEnS, w: 330, h: 44.8 }], { deco: 1 });
  t(`${prefix}_ja`, section, ja, JA, B, AC, [{ x: 80, y: yJaP, w: 640, h: 20.2 }, { x: 30, y: yJaS, w: 330, h: 20.2 }], { weight: 500 });
}

// ---- ヘッダー（in-flow の sticky。高さ 110 / 80）
sec("sec_header", "ヘッダー", "theme:background", 110, 80);
t("hd_name", "sec_header", NAME, [[26, 40, 2.6], [24, 40, 2.4]], B, TX, [{ x: 50, y: 35, w: C.headerW?.pc ?? 220, h: 40 }, { x: 20, y: 20, w: C.headerW?.sp ?? 200, h: 40 }], { weight: 500, link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: TX, font: M, spMenuBackground: "theme:paper" }, layout: lay({ x: 700, y: 43.8, w: 690, h: 22.4, size: 16 }, { x: 334, y: 18, w: 44, h: 44 }) });
const bar = (id, y) => add(id, { type: "shape", z: 3, kind: "rect", fill: TX, section: "sec_header", layout: { pc: { x: 99.9, y: 80, w: 0.01, h: 1 }, sp: { x: r((340 / S) * 100), y, w: r((30 / S) * 100), h: 2 } } });
bar("hd_b1", 29); bar("hd_b2", 39); bar("hd_b3", 49);

// ---- 1 ファーストビュー（PC 810 / スマホ 675）
sec("sec_firstv", "最初の画面", "theme:background", 810, 675);
photo("fv_1", "sec_firstv", "ast_fv01", 1, { x: 432, y: 0, w: 504, h: 810 }, { x: 0, y: 270.1, w: 195, h: 404.9 });
photo("fv_2", "sec_firstv", "ast_fv02", 1, { x: 936, y: 0, w: 504, h: 810 }, { x: 195, y: 270.1, w: 195, h: 404.9 });
t("fv_copy", "sec_firstv", lines(C.fvCopy), [[28.8, 40.32, 2.88], C.fvCopyBox?.sp ?? [25.6, 35.84, 1.28]], B, TX, [{ x: 175.7, y: C.fvCopyBox?.y ?? 251, w: 80.6, h: C.fvCopyBox?.h ?? 260 }, { x: 30, y: 63.3, w: 330, h: 71.7 }], { vp: 1, weight: 500 });
// 見出しの下の一行：fvSub（日本語・行の配列）があればそれを本文の書体で、無ければ fvEn（英語）
t("fv_en", "sec_firstv", C.fvSub ? lines(C.fvSub) : C.fvEn, [[14.4, 17.28, 0.72], [14.4, 17.28, 0.72]], C.fvSub ? B : M, MU, [{ x: 80.4, y: 524, w: 271.2, h: 34.6 }, { x: 30, y: 154.9, w: 271.2, h: 34.6 }], { weight: 500, align: "center" });
t("fv_script", "sec_firstv", SITE_NAME_EN, [[144, 144, -7.2], [64, 64, -3.2]], SCRIPT, SCRIPT_C, [{ x: 200, y: 666, w: 997, h: 144 }, { x: 8, y: 603, w: 374, h: 64 }], { z: 5, weight: 300, deco: 1 });

// ---- 2 Our story（PC 1498 / スマホは本文の長さで詰める）
const D_SP = Number(process.env.WA03_STORY_SP_DELTA ?? C.storySpDelta); // 本文が参考より短い分（実測で決めた値。SPEC 6章）
const a = shop.story.answers;
sec("sec_story", "Our story", "theme:background", 1498, 1521 - D_SP, { anchor: "story", nav: { label: "About", order: 1 } });
head("st", "sec_story", "Our story", C.storyJa, 140, 197.6, 100, 155);
const story = (q) => (FS ? [`/story/answers/${q}/answer`, "paragraphs"] : lines(a[q].answer.split("\n")));
t("st_catch", "sec_story", story("q_catch"), [[32, 54.4, 0], [22.4, 38.08, 0]], B, TX, [{ x: 80, y: 295.6, w: 400, h: 108.8 }, { x: 30, y: 205.1, w: 330, h: 76.2 }], { weight: 500 });
t("st_body", "sec_story", story("q_body"), [[16, 28.8, 0.48], [16, 28.8, 0.48]], B, TX, [{ x: 80, y: 434.4, w: 580, h: 345.6 }, { x: 30, y: 301.3, w: 330, h: 547.1 - D_SP }], { gap: 14 });
photo("st_ph1", "sec_story", "ast_st01", 1, { x: 780, y: 267.8, w: 580, h: 540 }, { x: 30, y: 898.4 - D_SP, w: 330, h: 253.2 });
photo("st_ph2", "sec_story", "ast_st02", 1, { x: -20, y: 907.8, w: 828, h: 450 }, { x: -30, y: 1201.6 - D_SP, w: 246, h: 219.4 });
photo("st_ph3", "sec_story", "ast_st03", 1, { x: 908, y: 1007.8, w: 452, h: 450 }, { x: 246, y: 1261.6 - D_SP, w: 174, h: 219.4 });
t("st_script", "sec_story", SITE_NAME_EN, [[160, 224, -8], [64, 89.6, -3.2]], SCRIPT, SCRIPT_C, [{ x: 0, y: 740, w: 1035, h: 224 }, { x: 8, y: 1521 - D_SP - 89.6, w: 374, h: 89.6 }], { z: 5, weight: 300, deco: 1 });

// ---- 3 Menu（view more なし。PC 1045 / スマホ 1784）
const CAT = shop.catalog, MENU_H = { pc: 293.5, sp: 347.1 };
const ids = Object.keys(CAT.items);
const cell = (id, content, fmt, pc, sp, size, opts = {}) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path: content, format: fmt } }] }], style: { font: opts.font || B, weight: opts.weight || 400, color: opts.color || TX, lineHeight: r(opts.lh / size), letterSpacing: r(opts.ls / size) }, layout: { pc: { ...pc, size }, sp: { ...sp, size } } });
sec("sec_menu", "Menu", "theme:background", 1045, 1784, { anchor: "menu", nav: { label: "Menu", order: 2 } });
head("mn", "sec_menu", "Menu", "お品書き", 139.8, 197.3, 100.1, 154.9);
add("mn_cards", { type: "repeater", z: 3, section: "sec_menu", source: FS ? { kind: "catalog", menuId: "mnu_food", categoryIds: Object.keys(CAT.categories).filter((k) => CAT.categories[k].menuId === "mnu_food") } : { kind: "catalog", menuId: "mnu_food", pick: ids }, display: { mode: "grid", columns: { pc: 4, sp: 2 }, gap: { pc: 50, sp: 30 }, photoless: "sameCard" },
  card: { height: MENU_H, elements: {
    c_ph: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: 180, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: 160, ratio: "custom" } } },
    c_nm: cell("c_nm", "/name", "plain", { x: 0, y: 190, w: 100, h: 30.7 }, { x: 0, y: 170, w: 100, h: 61.4 }, 19.2, { lh: 30.72, ls: 0.96, weight: 500 }),
    c_ds: cell("c_ds", "/description", "plain", { x: 0, y: 224.7, w: 100, h: 43.2 }, { x: 0, y: 235.1, w: 100, h: 86.4 }, 14.4, { lh: 21.6, ls: 0.72, color: MU }),
    c_pr: cell("c_pr", "/prices", "priceAll", { x: 0, y: 271.9, w: 100, h: 21.6 }, { x: 0, y: 325.5, w: 100, h: 21.6 }, 14.4, { lh: 21.6, ls: 0.72, color: AC, font: M, weight: 500 }) } },
  layout: lay({ x: 80, y: 267.5, w: 1280, h: 637 }, { x: 30, y: 205, w: 330, h: 1478.4 }) });

// ---- 5 Access（PC 939 / スマホ 1057）
const cityTown = ["/location", "address"];
// 情報の表の3行目。fromShop：定休日の行は ① に休みがあるときだけ出す（毎日営業なら行ごと無し）。お席の行は ① facilities から作る
const CLOSED = ["定休日", ["/hours", "closedDays"]];
const hasClosed = formatClosedDays(shop.hours) !== "";
const SMOKE = { none: "全席禁煙", separated: "分煙", allowed: "喫煙可" };
function seatsMix(short) {
  const fa = shop.facilities || {}, mix = [];
  const txt = (s) => (typeof mix[mix.length - 1] === "string" ? (mix[mix.length - 1] += s) : mix.push(s));
  if (fa.seats?.total != null) { mix.push(["/facilities/seats/total"]); txt("席"); }
  if (SMOKE[fa.smoking]) txt(`${mix.length ? "・" : ""}${SMOKE[fa.smoking]}`);
  if (!short && fa.note) { if (mix.length) txt("・"); mix.push(["/facilities/note"]); }
  return mix.some(Array.isArray) ? { mix } : null;
}
function infoRows(short) {
  if (!FS) return [C.infoRow ? [C.infoRow.label, short ? C.infoRow.valueShort || C.infoRow.value : C.infoRow.value] : CLOSED];
  const seat = C.infoRow ? seatsMix(short) : null;
  return [...(hasClosed || !seat ? [CLOSED] : []), ...(seat ? [[C.infoRow.label, seat]] : [])];
}
const ROWS = [["住所", cityTown], ["営業時間", ["/hours", "hoursShort"]], ...infoRows(false), ["電話番号", ["/contact/phone", "phone"]], ["アクセス", ["/location/access", "access"]]];
const XA = ROWS.length - 5; // 5行より多い分（fromShop で定休日の行が増えたとき）。ボタンと、スマホの段の高さを下げる
sec("sec_access", "Access", "theme:background", 939, 1057 + 67.6 * XA, { anchor: "access", nav: { label: "Access", order: 3 } });
head("ac", "sec_access", "Access", "店舗情報", 140.2, 197.8, 100, 155.2);
t("ac_name", "sec_access", NAME, [[32, 60, 3.2], [28, 60, 2.8]], B, TX, [{ x: 80, y: 268, w: 350, h: 60 }, { x: 30, y: 488.5, w: C.nameSpW ?? 250, h: 60 }], { weight: 500 });
const TBL = [[16, 28.8, 0.48], [16, 28.8, 0.48]];
ROWS.forEach(([k, v], i) => {
  const yP = 358 + 48.8 * i, yS = 558.5 + 67.6 * i;
  t(`ac_k${i}`, "sec_access", k, TBL, B, MU, [{ x: 80, y: yP, w: 110, h: 28.8 }, { x: 30, y: yS, w: 330, h: 28.8 }], { deco: 1 });
  t(`ac_v${i}`, "sec_access", v, TBL, B, TX, [{ x: 200, y: yP, w: 490, h: 28.8 }, { x: 30, y: yS + 28.8, w: 330, h: 28.8 }]);
});
const LNK = { kind: "url", value: mapUrl, newTab: true };
add("ac_btn", { type: "shape", z: 2, kind: "rect", fill: "theme:background", radius: 100, stroke: { width: 1, color: AC }, section: "sec_access", link: LNK, layout: lay({ x: 80, y: 602 + 48.8 * XA, w: 140.9, h: 47.6 }, { x: 30, y: 906.5 + 67.6 * XA, w: 148.9, h: 50 }) });
t("ac_btnt", "sec_access", "Google Map", [[14.4, 21.6, 0.72], [14.4, 21.6, 0.72]], B, TX, [{ x: 117, y: 615 + 48.8 * XA, w: 95, h: 21.6 }, { x: 75, y: 920.7 + 67.6 * XA, w: 95, h: 21.6 }], { z: 3, link: LNK, deco: 1 });
add("ac_mapbox", { type: "shape", z: 2, kind: "rect", fill: "theme:surface", section: "sec_access", layout: lay({ x: 770, y: 268, w: 590, h: 530.8 }, { x: 30, y: 205.3, w: 330, h: 253.2 }) });

// ---- 6 写真の帯（別の帯の色。PC 70+440+70 / スマホ 50+280+50 ＝ 参考の帯＋下の余白の合計）
sec("sec_strip", "写真の帯", "theme:surface", 580, 380);
for (let i = 1; i <= 6; i++) add(`sr_${i}`, { type: "photo", z: 1, section: "sec_strip", asset: `ast_sr0${i}`, layout: lay({ x: 0, y: 70, w: 632, h: 440, ratio: "custom" }, { x: 0, y: 50, w: 343, h: 280, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1 } });

// ---- フッター（PC 914 / スマホ 1038）
sec("sec_footer", "フッター", "theme:paper", 914, 1038); // スマホの高さは表の行数で後から足す（DF）
t("ft_name", "sec_footer", NAME, [[32, 60, 3.2], [28, 60, 2.8]], B, TX, [{ x: 123.2, y: 180, w: 350, h: 60 }, { x: 195 - (C.nameSpW ?? 250) / 2, y: 100, w: C.nameSpW ?? 250, h: 60 }], { weight: 500 });
line("ft_div", "sec_footer", AC, { x: 720.5, y: 140, w: 1, h: 536.4 }, { x: 0, y: 0, w: 0.01, h: 1 });
const NV = [["About", "story"], ["Menu", "menu"], ["Access", "access"], ...(C.extraNav || []).map((n) => [n.label, null, n.url])];
const NAV_T = [[16, 22.4, 0.8], [16, 22.4, 0.8]];
NV.forEach(([l, a2, url], i) => t(`ft_n${i}`, "sec_footer", l, NAV_T, M, TX, [{ x: 123.2, y: 290 + 42.4 * i, w: 200, h: 22.4 }, { x: 30, y: 210 + 42.4 * i, w: 330, h: 22.4 }], { weight: 500, deco: 1, link: url ? { kind: "url", value: url, newTab: true } : { kind: "anchor", value: `pg_home#${a2}` } }));
const F_R = [["住所", cityTown], ["営業時間", ["/hours", "hoursShort"]], ...infoRows(true), ["電話番号", ["/contact/phone", "phone"]]];
const DF = 41.6 * (F_R.length - 4); // フッターの表が4行より多い分。スマホは下の文字と段の高さを下げる
const FT = [[14.4, 21.6, 0.72], [14.4, 21.6, 0.72]];
add("ft_mapbox", { type: "shape", z: 2, kind: "rect", fill: "theme:surface", section: "sec_footer", layout: lay({ x: 820.5, y: 180, w: 496.3, h: 280 }, { x: 30, y: 387, w: 330, h: 280 }) });
F_R.forEach(([k, v], i) => {
  const yP = 490 + 41.6 * i, yS = 697 + 41.6 * i;
  t(`ft_k${i}`, "sec_footer", k, FT, B, MU, [{ x: 820.5, y: yP, w: 103.9, h: 21.6 }, { x: 30, y: yS, w: 85, h: 21.6 }], { deco: 1 });
  t(`ft_v${i}`, "sec_footer", v, FT, B, TX, [{ x: 944.4, y: yP, w: 372.4, h: 21.6 }, { x: 135, y: yS, w: 225, h: 21.6 }]);
});
t("ft_mikke", "sec_footer", "芦屋みっけ 掲載店", FT, B, SO, [{ x: 123.2, y: 610, w: 500, h: 21.6 }, { x: 30, y: 883.4 + DF, w: 330, h: 21.6 }], { link: { kind: "url", value: C.mikkeUrl, newTab: true }, deco: 1 });
if (DF) secs.sec_footer.minHeight.sp += DF;
t("ft_draft", "sec_footer", "営業用の見本（写真・品は仮）", FT, B, SO, [{ x: 123.2, y: 636, w: 560, h: 21.6 }, { x: 30, y: 909.4 + DF, w: 330, h: 21.6 }], { deco: 1 });
t("ft_copy", "sec_footer", C.copyright, [[14.4, 17.28, 0.72], [14.4, 17.28, 0.72]], M, SO, [{ x: 123.2, y: 816.4, w: 500, h: 17.3 }, { x: 30, y: 980 + DF, w: 330, h: 17.3 }], { weight: 500 });

// 電話番号の文字は押せるようにする（文字の箱の link）
for (const e of Object.values(els)) if (e.type === "text" && !e.style?.link && e.paragraphs?.length === 1 && e.paragraphs[0].runs?.length === 1 && e.paragraphs[0].runs[0].bind?.path === "/contact/phone") (e.style ||= {}).link = { kind: "shopPhone" };
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_03", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_story", "sec_menu", "sec_access", "sec_strip"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
const json = JSON.stringify(site, (k, v) => (v === undefined ? undefined : v), 2);
fs.writeFileSync(`${DIR}/site.json`, json + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}`);
