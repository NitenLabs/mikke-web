#!/usr/bin/env node
// wa-04：templates/wa-04/SPEC.md の実測値から samples/hamasyou/site.json を作る。
// 使い方：node tools/wa04-gen.mjs → node tools/build.mjs samples/hamasyou → node tools/wa04-finish.mjs
// 指示 0051：中身は ①（shop.json）から出す。① に無い店ごとの文字（MV の文・席・お支払い・ご予約の文・コピーライト・
//   芦屋みっけの URL など）は samples/<店>/wa04.json。飾りの文字（英字の見出し・行の見出し・ナビ・ボタンの文字など）は edit:false。
import fs from "node:fs";
import { formatClosedDays, formatTime } from "./lib/format.mjs";
import { resolveRepeater, makeRefDate } from "./lib/catalog.mjs";
const DIR = "samples/hamasyou";
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C_ = JSON.parse(fs.readFileSync(`${DIR}/wa04.json`, "utf8"));
const P = 1440, S = 390, r = (n) => Math.round(n * 10000) / 10000;
const box = (b, W) => ({ ...b, x: r((b.x / W) * 100), w: r((b.w / W) * 100) });
const lay = (pc, sp) => ({ pc: box(pc, P), sp: box(sp, S) });
const els = {}, secs = {};
const add = (id, e) => { els[id] = e; };
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
// content：文字列／[パス, 形式]／{ lines: [...] }（段落ごと）／{ runs: [...] }（1段落に複数）
const paras = (c) => c?.lines ? c.lines.map((x) => ({ runs: [run(x)] })) : c?.runs ? [{ runs: c.runs.map(run) }] : [{ runs: [run(c)] }];
function t(id, section, content, [ps, ss], font, color, l, extra = {}) {
  add(id, { type: "text", z: extra.z ?? 3, role: "body", section, paragraphs: paras(content),
    style: { font, weight: 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r(ps[2] / ps[0]), ...(extra.align ? { align: extra.align } : {}), ...(extra.link ? { link: extra.link } : {}) },
    layout: lay({ ...l[0], size: ps[0], ...(extra.vp ? { writingMode: "vertical" } : {}) }, { ...l[1], size: ss[0], ...(extra.vs ? { writingMode: "vertical" } : {}) }), ...(extra.deco ? { edit: false } : {}) });
}
const D = { deco: 1 }; // 飾りの文字（店主の編集の対象にしない＝edit:false）
const sec = (id, name, color, pc, sp, more = {}) => { secs[id] = { name, background: { color }, minHeight: { pc: Math.ceil(pc), sp: Math.ceil(sp) }, ...more }; };
const photo = (id, section, asset, z, pc, sp, darken) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), ...(darken ? { darken } : {}), crop: { fx: 50, fy: 50, zoom: 1 } });

const H = "font:heading", B = "font:body", A = "font:accent", CR = "#FFFFEA", RED = "#770312", WINE = "#5A0808";
const NAME = ["/basic/name"]; // 店名は ① と連動
const C = { align: "center" };

// ---- ヘッダー（写真に重ねる。スクロールすると地の色＋赤い文字になる：エンジンの headerOverlay）
sec("sec_header", "ヘッダー", "theme:background", 54, 47);
t("hd_name", "sec_header", NAME, [[22, 30, 1.1], [17, 24, 0.85]], H, CR, [{ x: 46.1, y: 20, w: 264, h: 30 }, { x: 19.5, y: 20, w: 200, h: 24 }], { link: { kind: "page", value: "pg_home" } });
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: CR, font: A, spMenuBackground: "theme:primary" }, layout: lay({ x: 700, y: 24, w: 694, h: 29.9, size: 18.72 }, { x: 336, y: 3, w: 40, h: 44 }) });
const bar = (id, y) => add(id, { type: "shape", z: 3, kind: "rect", fill: CR, section: "sec_header", layout: { pc: { x: 99.9, y: 40, w: 0.01, h: 1 }, sp: { x: r((342.5 / S) * 100), y, w: r((24 / S) * 100), h: 1 } } });
bar("hd_b1", 33.3); bar("hd_b2", 41.3);

// ---- 1 MV＋写真の帯（MV 1012.5 / 640 の下に、えんじの帯 360 / 261.3。帯の写真は MV から下へまたがる）
sec("sec_firstv", "最初の画面", "theme:primary", 1372.5, 901.3);
photo("mv_bg", "sec_firstv", "ast_mv01", 1, { x: 0, y: 0, w: P, h: 1012.5 }, { x: 0, y: 0, w: S, h: 640 }, 35);
t("mv_copy", "sec_firstv", { lines: C_.mvCopy }, [[48, 52.8, 0], [27.3, 30.03, 0]], H, CR, [{ x: 49, y: 463.6, w: 382.1, h: 158.4 }, { x: 23.4, y: 383.4, w: 300, h: 90.1 }], { z: 4 });
t("mv_en", "sec_firstv", C_.mvEn, [[11.52, 19, 0.576], [8, 12.87, 0.39]], A, CR, [{ x: 49, y: 654, w: 382.1, h: 19 }, { x: 23.4, y: 489.1, w: 217.3, h: 25.7 }], { z: 4, ...D });
const SH = { pc: [177.5, 293.8, 177.5, 244.8, 348.8, 293.8], sp: [104.6, 173.2, 104.6, 144.3, 205.6, 173.2] };
for (let i = 0; i < 6; i++) photo(`sr_${i + 1}`, "sec_firstv", `ast_sr0${i + 1}`, 3, { x: 0, y: 859, w: 244.8, h: SH.pc[i] }, { x: 0, y: 597.5, w: 144.3, h: SH.sp[i] });

// ---- 2 お店について（ベージュの地。PC 823 / スマホ 774）
const LBL = [[21.6, 34.56, 0], [14.82, 23.71, 0]];
sec("sec_about", "お店について", "theme:background", 823, 774, { anchor: "about", nav: { label: "About", order: 1 } });
t("ab_en", "sec_about", "About", LBL, A, RED, [{ x: 72, y: 330.8, w: 300, h: 34.6 }, { x: 19.5, y: 56.6, w: 351, h: 23.7 }], D);
t("ab_h", "sec_about", ["/story/answers/q_catch/answer", "paragraphs"], [[43.2, 73.44, -5.616], [27.3, 40.95, -3.549]], H, RED, [{ x: 72, y: 366, w: 438.5, h: 146.9 }, { x: 19.5, y: 90, w: 351, h: 92.8 }]);
photo("ab_ph", "sec_about", "ast_ab01", 2, { x: 580.5, y: 213, w: 318.9, h: 413 }, { x: 19.5, y: 195.2, w: 351, h: 362 });
t("ab_p", "sec_about", ["/story/answers/q_body/answer", "paragraphs"], [[15.84, 31.68, 0], [13.65, 27.3, 0]], B, RED, [{ x: 1033.1, y: 249.3, w: 334.8, h: 190.1 }, { x: 19.5, y: 577.5, w: 351, h: 136.5 }]);

// ---- 3 料理について（暗い写真の地。文が短いので高さは PC 640 / スマホ 430。SPEC 6章）
sec("sec_message", "料理について", "theme:primary", 640, 430);
photo("ms_bg", "sec_message", "ast_ms01", 1, { x: 0, y: 0, w: P, h: 640 }, { x: 0, y: 0, w: S, h: 430 }, 45);
t("ms_h", "sec_message", ["/story/answers/q_message_h/answer"], [[43.2, 60.48, -4.752], [27.3, 38.22, -3.003]], H, CR, [{ x: 275, y: 180, w: 640, h: 60.5 }, { x: 19.5, y: 152, w: 335, h: 76.4 }], { z: 3 });
t("ms_p", "sec_message", ["/story/answers/q_message/answer", "paragraphs"], [[15.84, 34.85, 0], [12.48, 26.21, 0]], B, CR, [{ x: 275, y: 337.9, w: 640, h: 104.6 }, { x: 19.5, y: 251.7, w: 351, h: 104.9 }], { z: 3 });
t("ms_en", "sec_message", "Cuisine", [[43.2, 43.2, 0], [19.5, 19.5, 0]], A, CR, [{ x: 1121.8, y: 180, w: 43.2, h: 171.4 }, { x: 354.9, y: 66.3, w: 19.5, h: 77.4 }], { z: 3, vp: 1, vs: 1, ...D });

// ---- 4 おすすめの料理（えんじ。大きなカード：参考の 534.8×720 ＋右の文。① の mnu_osusume の品の数だけ。今は4枚）
const item = (path, fmt, pc, sp, ps, ss, font, opts = {}) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path, format: fmt } }] }], style: { font, weight: 400, color: CR, lineHeight: opts.lh, ...(opts.align ? { align: opts.align } : {}) }, layout: { pc: { ...pc, size: ps }, sp: { ...sp, size: ss } } });
// 品は ① の括りで選ぶ（並びは ① の order）。品の数で段の高さを決める
const CAT = shop.catalog, REF = makeRefDate(process.env.WA04_DATE);
const catsOf = (menuId) => Object.keys(CAT.categories).filter((k) => CAT.categories[k].menuId === menuId);
const REC_SRC = { kind: "catalog", menuId: "mnu_osusume", categoryIds: catsOf("mnu_osusume") }, MEN_SRC = { kind: "catalog", menuId: "mnu_food", categoryIds: catsOf("mnu_food") };
const RN0 = resolveRepeater(shop, REC_SRC, REF).length, RN = Math.max(1, RN0), MN = resolveRepeater(shop, MEN_SRC, REF).length;
const CW = 1209.6, RH = { pc: 540, sp: 430 }, RG = { pc: 75.5, sp: 50 };
const RCH = { pc: RN * RH.pc + (RN - 1) * RG.pc, sp: RN * RH.sp + (RN - 1) * RG.sp };
sec("sec_recommend", "おすすめの料理", "theme:primary", 120 + RCH.pc + 120, 62.4 + RCH.sp + 47, { anchor: "recommend", nav: { label: "Recommend", order: 2 } });
const pct = (n) => r((n / CW) * 100);
add("rc_cards", { type: "repeater", z: 3, section: "sec_recommend", source: REC_SRC, display: { mode: "list", columns: { pc: 1, sp: 1 }, gap: { pc: RG.pc, sp: RG.sp }, photoless: "sameCard" },
  card: { height: RH, elements: {
    c_ph: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: pct(534.8), h: 540, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: 220.1, ratio: "custom" } } },
    c_lb: { type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ text: "Recommend" }] }], style: { font: A, weight: 400, color: CR, lineHeight: 1.6 }, layout: { pc: { x: pct(694.8), y: 133, w: pct(514.8), h: 34.6, size: 21.6 }, sp: { x: 0, y: 257.4, w: 100, h: 23.7, size: 14.82 } }, edit: false },
    c_nm: item("/name", "plain", { x: pct(694.8), y: 206.5, w: pct(514.8), h: 80.6 }, { x: 0, y: 288, w: 100, h: 47.6 }, 40.32, 23.79, B, { lh: 1 }),
    c_ds: item("/description", "plain", { x: pct(694.8), y: 312.1, w: pct(514.8), h: 95.1 }, { x: 0, y: 346, w: 100, h: 81.9 }, 15.84, 13.65, B, { lh: 2 }) } },
  layout: lay({ x: 115.2, y: 120, w: CW, h: RCH.pc }, { x: 19.5, y: 62.4, w: 351, h: RCH.sp }) });
els.rc_cards.card.elements.c_ds.style.lineHeight = 2;

// ---- 5 お品書き（えんじ。① の mnu_food の品。今は6枚。丸い写真は wa04-finish で）
// PC 3列×440・スマホ 2列×230。6品（PC 2行・スマホ 3行）より少ないときは行の分だけ詰める（多いときは build が押し下げる）
const MN_LESS = { pc: Math.max(0, 2 - Math.max(1, Math.ceil(MN / 3))), sp: Math.max(0, 3 - Math.max(1, Math.ceil(MN / 2))) };
sec("sec_menu", "お品書き", "theme:primary", 1479 - MN_LESS.pc * 440, 930 - MN_LESS.sp * 230, { anchor: "menu", nav: { label: "Menu", order: 3 } });
// 品が 0 のときは見出しも置かない（段が空になり、エンジンが段ごと隠す。おすすめの段と同じ）
if (MN) t("mn_en", "sec_menu", "Menu", [[43.2, 69.12, 0], [19.5, 19.5, 0]], A, CR, [{ x: 175.7, y: 180, w: 1088.7, h: 69.1 }, { x: 37, y: 58.5, w: 315.9, h: 31.2 }], { ...C, ...D });
if (MN) t("mn_ja", "sec_menu", C_.menuJa, [[15.84, 31.68, 0], [13.26, 26.52, 0]], B, CR, [{ x: 175.7, y: 283.1, w: 1088.7, h: 31.7 }, { x: 37, y: 112, w: 315.9, h: 26.5 }], C);
const MW = 362.9, mp = (n) => r((n / MW) * 100), SW = 195, sp_ = (n) => r((n / SW) * 100);
add("mn_cards", { type: "repeater", z: 3, section: "sec_menu", source: MEN_SRC, display: { mode: "grid", columns: { pc: 3, sp: 2 }, gap: { pc: 0, sp: 0 }, photoless: "sameCard" },
  card: { height: { pc: 440, sp: 230 }, elements: {
    c_ph: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: mp(37), y: 51, w: mp(288.9), h: 288.9, ratio: "custom" }, sp: { x: sp_(38.2), y: 24.4, w: sp_(118.6), h: 118.6, ratio: "custom" } } },
    c_nm: item("/name", "plain", { x: mp(37), y: 370, w: mp(288.9), h: 34.6 }, { x: sp_(20.5), y: 158, w: sp_(154), h: 49.9 }, 21.6, 15.6, B, { lh: 1.6, align: "center" }) } },
  layout: lay({ x: 175.7, y: 394.8, w: 1088.7, h: 880 - MN_LESS.pc * 440 }, { x: 0, y: 173.5, w: 390, h: 690 - MN_LESS.sp * 230 }) });

// ---- 7 写真の段（お知らせを外したので上にも下と同じ余白。PC 144 / スマホ 60）
sec("sec_photo", "写真の段", "theme:background", 735.6, 253);
photo("ph_1", "sec_photo", "ast_ph01", 1, { x: 129.7, y: 144, w: 1180.6, h: 447.6 }, { x: 19.6, y: 60, w: 350.7, h: 133 });
els.ph_1.crop = { fx: 50, fy: 71, zoom: 1 }; // 焦点の合った皿の所で切り取る

// ---- 8 店舗情報（左に地図、右に表。行は項目の下に値を置き、値が長いと下を押す）
const loc = shop.location;
// 営業時間：共通の hoursShort は weekly のとき L.O. を出さないので、開いている曜日の最後の時間帯の L.O. がそろっていれば添える
const openPs = Object.values(shop.hours?.weekly || {}).filter((d) => d?.status === "open" && d.periods?.length).map((d) => d.periods[d.periods.length - 1]);
const LOS = [...new Set(openPs.map((p) => p.lastOrder || ""))];
const LO = LOS.length === 1 && LOS[0] ? `（L.O. ${formatTime(LOS[0])}）` : "";
// 駐車場は ① の値から言葉を作る（連動の形式が無いので文字。edit:false で、直すのは ① の /location/parking）
const pk = loc.parking || {};
const PARK = { nearbyPaid: "なし（近くのコインパーキングをご利用ください）", no: "なし", yes: `あり${pk.spaces ? `（${pk.spaces}台）` : ""}`, partner: "提携駐車場あり" }[pk.status] || "";
const parkText = PARK && pk.note ? `${PARK}（${pk.note}）` : PARK;
// 行の id（in_k<n>・in_v<n>）は行ごとに決まった番号。出さない行は置かず、下の行を詰める。lines＝PC の値の行数（実測）
// 席・お支払いは ① と表示が合わない所があるので、今の文字を wa04.json に持つ（指示 0051 の判断）
const ROWS = [
  { n: 0, k: "住所", v: ["/location", "address"], lines: 2 },
  { n: 1, k: "営業時間", v: LO ? { runs: [["/hours", "hoursShort"], LO] } : ["/hours", "hoursShort"], lines: 1 },
  ...(formatClosedDays(shop.hours) ? [{ n: 2, k: "定休日", v: ["/hours", "closedDays"], lines: 1 }] : []),
  { n: 3, k: "席", v: C_.seats, lines: 1 },
  { n: 4, k: "お支払い", v: C_.payment, lines: 1 },
  ...(parkText ? [{ n: 5, k: "駐車場", v: parkText, lines: 2, deco: 1 }] : []),
  { n: 6, k: "アクセス", v: ["/location/access", "access"], lines: 2 },
  { n: 7, k: "電話番号", v: ["/contact/phone", "phone"], lines: 1 }];
const K = [[14.4, 21.6, 0], [12.48, 20, 0]], V = [[15.84, 31.68, 0], [13.26, 26.52, 0]];
sec("sec_info", "店舗情報", "theme:surface", 880, 830, { anchor: "information", nav: { label: "Information", order: 4 } });
add("in_mapbox", { type: "shape", z: 1, kind: "rect", fill: "theme:lineSoft", section: "sec_info", layout: lay({ x: 0, y: 0, w: 886, h: 880 }, { x: 0, y: 0, w: 390, h: 239 }) });
t("in_en", "sec_info", "Information", [[43.2, 69.12, 0], [19.5, 19.5, 0]], A, RED, [{ x: 1002, y: 100, w: 321.5, h: 69.1 }, { x: 19.5, y: 255, w: 351, h: 31.2 }], D);
let yRow = 200; const yP_ = ROWS.map((row) => { const y = yRow; yRow += 21.6 + row.lines * 31.68 + 12; return y; });
const yS0 = 292, stS = 56.5;
ROWS.forEach((row, i) => {
  t(`in_k${row.n}`, "sec_info", row.k, K, B, RED, [{ x: 1002, y: yP_[i], w: 321.5, h: 21.6 }, { x: 19.5, y: yS0 + stS * i, w: 351, h: 20 }], D);
  t(`in_v${row.n}`, "sec_info", row.v, V, B, RED, [{ x: 1002, y: yP_[i] + 21.6, w: 321.5, h: 31.7 * row.lines }, { x: 19.5, y: yS0 + stS * i + 21, w: 351, h: 26.5 }], row.deco ? D : {});
});

// ---- 9 ご予約（写真のカード＋電話のボタン）
sec("sec_resv", "ご予約", "theme:primary", 606, 480, { anchor: "reservation", nav: { label: "Reservation", order: 5 } });
photo("rs_ph", "sec_resv", "ast_rs01", 1, { x: 0, y: 0, w: 886, h: 606 }, { x: 0, y: 0, w: 390, h: 239 });
t("rs_en", "sec_resv", "Reservation", [[43.2, 69.12, 0], [19.5, 19.5, 0]], A, CR, [{ x: 1002, y: 100, w: 321.5, h: 69.1 }, { x: 19.5, y: 257, w: 351, h: 31.2 }], D);
t("rs_p", "sec_resv", { lines: C_.resvLines }, [[15.84, 31.68, 0], [13.26, 26.52, 0]], B, CR, [{ x: 1002, y: 222, w: 321.5, h: 126.8 }, { x: 19.5, y: 300, w: 351, h: 79.6 }]);
const TEL = { kind: "shopPhone" };
add("rs_btn", { type: "shape", z: 2, kind: "rect", fill: CR, radius: 10, section: "sec_resv", link: TEL, layout: lay({ x: 1002, y: 388, w: 240, h: 61.6 }, { x: 19.5, y: 396, w: 351, h: 62.7 }) });
t("rs_tel", "sec_resv", ["/contact/phone", "phone"], [[16, 25.6, 0], [14.82, 23.71, 0]], B, RED, [{ x: 1002, y: 406, w: 240, h: 25.6 }, { x: 19.5, y: 415.5, w: 351, h: 23.7 }], { z: 3, align: "center", link: TEL });

// ---- フッター（えんじ）
sec("sec_footer", "フッター", "theme:primary", 586.8, 646.6);
t("ft_name", "sec_footer", NAME, [[30, 35, 1.5], [18, 24, 0.9]], H, CR, [{ x: 72, y: 120, w: 402, h: 35 }, { x: 19.5, y: 60, w: 300, h: 24 }]);
const NV = [["About", "about"], ["Recommend", "recommend"], ["Menu", "menu"], ["Information", "information"], ["Reservation", "reservation"]];
// 品が 0 で隠れる段（おすすめ・お品書き）へのリンクは出さず、下のリンクを詰める（id は元の番号のまま）
NV.map((x, i) => [...x, i]).filter(([, id]) => !(id === "recommend" && !RN0) && !(id === "menu" && !MN)).forEach(([l, id, i], j) => t(`ft_n${i}`, "sec_footer", l, [[21.6, 21.6, 0], [13.65, 13.65, 0]], A, CR, [{ x: 914.4, y: 120 + 50 * j, w: 240, h: 21.6 }, { x: 19.5, y: 211 + 40 * j, w: 351, h: 13.7 }], { link: { kind: "anchor", value: `pg_home#${id}` }, ...D }));
// Instagram は ① にあるときだけ（リンクは ① の contact.sns.instagram から）
const IG = { kind: "shopInstagram" };
if (shop.contact?.sns?.instagram) {
add("ft_ig", { type: "shape", z: 2, kind: "rect", fill: CR, radius: 10, section: "sec_footer", link: IG, layout: lay({ x: 914.4, y: 415.2, w: 240, h: 61.6 }, { x: 19.5, y: 440.9, w: 351, h: 62.7 }) });
t("ft_igt", "sec_footer", "Instagram", [[16, 25.6, 0], [14.82, 23.71, 0]], A, RED, [{ x: 914.4, y: 433.2, w: 240, h: 25.6 }, { x: 19.5, y: 460.4, w: 351, h: 23.7 }], { z: 3, align: "center", link: IG, ...D });
}
const SM = [[11.52, 18.43, 0], [10, 16, 0]];
t("ft_mikke", "sec_footer", "芦屋みっけ 掲載店", SM, B, CR, [{ x: 1194.4, y: 436.7, w: 180, h: 18.4 }, { x: 19.5, y: 523, w: 351, h: 16 }], { link: { kind: "url", value: C_.mikkeUrl, newTab: true }, ...D });
if (shop.salesDraft) t("ft_draft", "sec_footer", "営業用の見本（写真・品は仮）", SM, B, CR, [{ x: 72, y: 400, w: 500, h: 18.4 }, { x: 19.5, y: 545, w: 351, h: 16 }], D);
t("ft_copy", "sec_footer", C_.copyright, [[14.4, 23.04, 0], [8.58, 13.73, 0]], A, CR, [{ x: 72, y: 426.4, w: 500, h: 23 }, { x: 19.5, y: 588, w: 351, h: 13.7 }]);

// 電話番号の文字は押せるようにする（文字の箱の link）
for (const e of Object.values(els)) if (e.type === "text" && !e.style?.link && e.paragraphs?.length === 1 && e.paragraphs[0].runs?.length === 1 && e.paragraphs[0].runs[0].bind?.path === "/contact/phone") (e.style ||= {}).link = { kind: "shopPhone" };
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_04", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_about", "sec_message", "sec_recommend", "sec_menu", "sec_photo", "sec_info", "sec_resv"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky", headerOverlay: { pages: ["pg_home"], textColor: CR } }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}`);
