#!/usr/bin/env node
// wa-02：templates/wa-02/SPEC.md の実測値から samples/rian/site.json を作る（物語は ① にあるときだけ作る）。
// 使い方：node tools/wa02-gen.mjs → node tools/build.mjs samples/rian → node tools/wa02-finish.mjs
// 指示 0051：中身は ①（shop.json）から出す。① に無い店ごとの文字（短い店名・飾りの英字・品書きの列の見出しと注記・
//   おすすめの並び順など）は samples/<店>/wa02.json。飾りの文字（英字の見出し・項目名・ボタンの文字など）は edit:false。
import fs from "node:fs";
import { formatClosedDays, formatHoursShort } from "./lib/format.mjs";
const DIR = "samples/rian";
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`${DIR}/wa02.json`, "utf8"));
const P = 1440, S = 390, r = (n) => Math.round(n * 10000) / 10000;
const box = (b, W) => ({ ...b, x: r((b.x / W) * 100), w: r((b.w / W) * 100) });
const lay = (pc, sp) => ({ pc: box(pc, P), sp: box(sp, S) });
const els = {}, secs = {};
const add = (id, e) => { els[id] = e; };
const run = (v) => (typeof v === "string" ? { text: v } : { bind: { scope: "shop", path: v[0], format: v[1] || "plain" } });
// t(id, 区画, 中身, [pc:[大,行,字], sp:[...]], 書体, 色, [pc配置, sp配置], 追加)
function t(id, section, content, [ps, ss], font, color, l, extra = {}) {
  add(id, { type: "text", z: extra.z ?? 3, role: "body", section, paragraphs: [{ runs: [run(content)] }],
    style: { font, weight: extra.weight ?? 400, color, lineHeight: r(ps[1] / ps[0]), letterSpacing: r(ps[2] / ps[0]), ...(extra.align ? { align: extra.align } : {}), ...(extra.link ? { link: extra.link } : {}) },
    layout: lay({ ...l[0], size: ps[0], ...(extra.vp ? { writingMode: "vertical" } : {}) }, { ...l[1], size: ss[0], ...(extra.vs ? { writingMode: "vertical" } : {}) }), ...(extra.deco ? { edit: false } : {}) });
}
const D = { deco: 1 }; // 飾りの文字（店主の編集の対象にしない＝edit:false）
const line = (id, section, fill, pc, sp, z = 2) => add(id, { type: "shape", z, kind: "line", fill, section, layout: lay({ ...pc, strokeWidth: 1 }, { ...sp, strokeWidth: 1 }) });
const H = "font:heading", B = "font:body", A = "font:accent", K = "#000000", G = "#333333", W = "#FFFFFF";
const sec = (id, name, color, pc, sp, more = {}) => { secs[id] = { name, background: { color }, minHeight: { pc, sp }, ...more }; };
const photo = (id, section, asset, z, pc, sp, darken) => add(id, { type: "photo", z, section, asset, layout: lay({ ...pc, fullBleed: true }, { ...sp, fullBleed: true }), ...(darken ? { darken } : {}), crop: { fx: 50, fy: 50, zoom: 1 } });

// ---- ヘッダー（SPEC 2 ヘッダー）
sec("sec_header", "ヘッダー", "theme:paper", 90, 84);
line("hd_l1", "sec_header", K, { x: 50, y: 15, w: 1, h: 60 }, { x: 24, y: 17, w: 1, h: 50 });
line("hd_l2", "sec_header", K, { x: 107.8, y: 15, w: 1, h: 60 }, { x: 67.8, y: 17, w: 1, h: 50 });
// 業種は1列なので、2本の縦線の中心に置く（SPEC の枠は参考の2列分）
t("hd_genre", "sec_header", ["/basic/genre/detail"], [[14, 22.4, 0], [11, 15.4, 0]], H, K, [{ x: 67.7, y: 31, w: 22.4, h: 28 }, { x: 37.1, y: 31, w: 17.6, h: 22 }], { vp: 1, vs: 1 });
t("hd_name", "sec_header", C.name, [[28, 32.7, 0], [24, 27.3, 0]], H, K, [{ x: 138.8, y: 17.6, w: 120, h: 32.7 }, { x: 88.8, y: 17.4, w: 100, h: 27.3 }], { link: { kind: "page", value: "pg_home" } });
t("hd_read", "sec_header", C.nameEn, [[10, 14, 2], [10, 14, 2]], H, K, [{ x: 152.7, y: 58.4, w: 92.1, h: 14 }, { x: 92.7, y: 52.6, w: 92.1, h: 14 }], D);
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: K, font: H, spMenuBackground: "theme:text" }, layout: lay({ x: 700, y: 33.8, w: 710, h: 22.4, size: 16 }, { x: 330, y: 20, w: 42, h: 44 }) });
const bar = (id, y, w) => add(id, { type: "shape", z: 3, kind: "rect", fill: K, section: "sec_header", layout: { pc: { x: 99.9, y: 80, w: 0.01, h: 1 }, sp: { x: r((336 / S) * 100), y, w: r((w / S) * 100), h: 2 } } });
bar("hd_b1", 29, 30); bar("hd_b2", 41, 30); bar("hd_b3", 53, 20);

// ---- 1 ファーストビュー
sec("sec_firstv", "最初の画面", "theme:text", 900, 844);
const FV = [{ x: 0, y: 0, w: P, h: 900 }, { x: 0, y: 0, w: S, h: 844 }];
photo("fv_1", "sec_firstv", "ast_fv01", 1, FV[0], FV[1], 10);
photo("fv_2", "sec_firstv", "ast_fv02", 2, FV[0], FV[1], 10);
photo("fv_3", "sec_firstv", "ast_fv03", 3, FV[0], FV[1]);
t("fv_scroll", "sec_firstv", "SCROLL", [[12, 16.8, 1.2], [12, 16.8, 1.2]], A, W, [{ x: 711.6, y: 778, w: 16.8, h: 58 }, { x: 186.6, y: 722, w: 16.8, h: 58 }], { vp: 1, vs: 1, weight: 600, z: 5, ...D });
line("fv_line", "sec_firstv", W, { x: 719.5, y: 840, w: 1, h: 60 }, { x: 194.5, y: 784, w: 1, h: 60 }, 5);
// 固定タブ：Web 予約が無いので電話だけ（SPEC 6章）。固定は wa02-finish で
add("fv_tab", { type: "shape", z: 6, kind: "rect", fill: K, section: "sec_firstv", link: { kind: "shopPhone" }, layout: lay({ x: 1396, y: 790, w: 44, h: 110 }, { x: 346, y: 744, w: 44, h: 100 }) });
t("fv_tabt", "sec_firstv", "電話予約", [[15, 21, 1.5], [15, 21, 1.5]], H, W, [{ x: 1407.5, y: 812, w: 21, h: 66 }, { x: 357.5, y: 761, w: 21, h: 66 }], { vp: 1, vs: 1, z: 7, link: { kind: "shopPhone" }, ...D });

// ---- 5 ギャラリー（物語が無いときは FV の写真と続かないよう、上に標準の余白 120/100 を足す）
const padP = shop.story ? 0 : 120, padS = shop.story ? 0 : 100;
sec("sec_gallery", "ギャラリー", "theme:background", 420 + padP, 260 + padS);
for (let i = 0; i < 7; i++) add(`gal_${i + 1}`, { type: "photo", z: 1, section: "sec_gallery", asset: `ast_gal${i + 1}`, layout: lay({ x: 370, y: padP, w: 700, h: 400, ratio: "custom" }, { x: 23.5, y: padS, w: 343, h: 240, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1 } });

// ---- 2 お店の物語（SPEC 2）
const pics = (id, asset, z, pc, sp) => add(id, { type: "photo", z, section: "sec_story", asset, layout: lay({ ...pc, ratio: "custom" }, { ...sp, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1 } });
if (shop.story) {
  sec("sec_story", "当店について", "theme:background", 1620, 1792, { anchor: "about", nav: { label: "当店について", order: 1 } });
  t("st_ja", "sec_story", "当店について", [[32, 44.8, 1.6], [24, 33.6, 1.2]], H, K, [{ x: 120, y: 120, w: 1200, h: 44.8 }, { x: 30, y: 100, w: 330, h: 33.6 }], { align: "center" });
  t("st_en", "sec_story", "About", [[16, 22.4, 1.6], [14, 19.6, 1.4]], A, K, [{ x: 620, y: 168.8, w: 200, h: 22.4 }, { x: 95, y: 137.6, w: 200, h: 19.6 }], { align: "center", ...D });
  line("st_enl", "sec_story", K, { x: 696, y: 200.2, w: 48, h: 1 }, { x: 175, y: 166.2, w: 40, h: 1 });
  add("st_sage", { type: "shape", z: 1, kind: "rect", fill: "#2E2925", section: "sec_story", layout: lay({ x: 216, y: 447, w: 1224, h: 1053.1 }, { x: 0, y: 176, w: 390, h: 1516 }) });
  pics("st_ph1", "ast_ab01", 2, { x: 464, y: 260.1, w: 976, h: 500 }, { x: 0, y: 464.2, w: 390, h: 400 });
  pics("st_ph2", "ast_ab02", 2, { x: 0, y: 880.1, w: 576, h: 500 }, { x: 0, y: 1292.2, w: 330, h: 300 });
  const L = "#F2EFE9"; // 炭の色の面の上の文字（縦書きは面の中に収める）
  // 紹介文は ① と連動（改行ごとに段落）
  t("st_copy", "sec_story", ["/story/answers/q_catch/answer", "paragraphs"], [[28, 56, 2.8], [20, 40, 2]], H, L, [{ x: 232, y: 480, w: 224, h: 277.2 }, { x: 115, y: 226.2, w: 160, h: 198 }], { vp: 1, vs: 1, z: 4 });
  t("st_body", "sec_story", ["/story/answers/q_body/answer", "paragraphs"], [[16, 32, 0], [14, 28, 0]], H, L, [{ x: 812, y: 970.1, w: 392, h: 300 }, { x: 30, y: 924.2, w: 330, h: 280 }], { z: 4 });
  els.st_body.style.paragraphGap = 12;
}

// 見出し列（縦書き）：PC x120、スマホ x168.2
function headCol(prefix, section, ja, en, yP, yS, xP = 120, xS = 168.2) {
  line(`${prefix}_rule`, section, K, { x: xP, y: yP, w: 75.2, h: 1 }, { x: xS, y: yS, w: 53.6, h: 1 });
  t(`${prefix}_ja`, section, ja, [[32, 44.8, 1.6], [24, 28.8, 1.2]], H, K, [{ x: xP + 30.4, y: yP + 16, w: 44.8, h: 143 }, { x: xS + 20, y: yS + 16, w: 33.6, h: 110 }], { vp: 1, vs: 1 });
  t(`${prefix}_en`, section, en, [[16, 22.4, 1.6], [14, 16.8, 1.4]], A, K, [{ x: xP, y: yP + 16, w: 22.4, h: 143 }, { x: xS - 2.8, y: yS + 16, w: 19.6, h: 110 }], { vp: 1, vs: 1, ...D });
}
// 一覧の見出し＋下線
function listHead(prefix, section, content, pcXY, spXY, under = 120) {
  t(`${prefix}_h`, section, content, [[28, 39.2, 1.4], [24, 33.6, 1.2]], H, K, [{ ...pcXY, w: 512.4, h: 39.2 }, { ...spXY, w: 330, h: 33.6 }]);
  line(`${prefix}_hl`, section, K, { x: pcXY.x, y: pcXY.y + 47, w: under, h: 1 }, { x: spXY.x, y: spXY.y + 41, w: under, h: 1 });
}

// ---- 4 おすすめ・3 メニュー（SPEC 2。右の面はユーザーの判断で外した）
const cat = shop.catalog, ROW = { pc: 39.2, sp: 36.6 }, TAG = { pc: 29.2, sp: 26.4 };
const count = (id) => Object.values(cat.placements).filter((p) => p.categoryId === id).length;
const listH = (ids, d) => ids.reduce((n, id, i) => n + (i ? 24 : 0) + TAG[d] + 8 + count(id) * ROW[d], 0);
const cell = (content, align, pc, sp, ps, ss, font = B, color = K) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path: content[0], format: content[1] } }] }], style: { font, weight: 400, color, lineHeight: r(pc.h / ps), ...(align ? { align } : {}) }, layout: { pc: { ...pc, size: ps }, sp: { ...sp, size: ss } } });
// 列の割り振りは wa02.json。① にあって wa02.json に無い括りは右の列の最後に足す。品の無い括りは外す
const has = (id) => cat.categories[id] && count(id) > 0;
const listed = new Set([...C.menuLeft.first, ...C.menuLeft.second, ...C.menuRight.groups]);
const extraCats = Object.keys(cat.categories).filter((id) => !listed.has(id)).sort((a, b) => (cat.categories[a].order ?? 0) - (cat.categories[b].order ?? 0));
const A1 = C.menuLeft.first.filter(has), A2 = C.menuLeft.second.filter(has), B1 = [...C.menuRight.groups, ...extraCats].filter(has);
const N2 = { pc: 39.2, sp: 33.6 }, N1 = { pc: 19.6, sp: 16.8 }, G1 = 16, G2 = 32;
// おすすめのカードの段の高さは品の数の行だけ（設計は 6 品＝PC 2 行・スマホ 3 行）。下の一覧はその差だけ上下する
const nRec = Object.values(cat.items).filter((it) => (it.labels || []).includes("lbl_recommend")).length;
const recH = (cols, ch, gap) => { const n = Math.max(1, Math.ceil(nRec / cols)); return r(n * ch + (n - 1) * gap); };
const RH = { pc: recH(3, 373.4, 40), sp: recH(2, 289.4, 20) };
// おすすめが 0 品なら札とカードの段を出さず、一覧を札の位置から始める
const yP = nRec ? r(1114.8 + RH.pc - 786.8) : 190, yS = nRec ? r(1302.1 + RH.sp - 908.2) : 285.8, H0 = { pc: 72, sp: 60 };
const lay2 = (y0, d) => { const a1 = y0 + H0[d], nA = a1 + listH(A1, d) + G1, a2 = nA + N2[d] + G2; return { a1, nA, a2, end: a2 + listH(A2, d) }; };
const layB = (y0, d) => { const b1 = y0 + H0[d], nB = b1 + listH(B1, d) + G1; return { b1, nB, end: nB + N1[d] }; };
const LA = lay2(yP, "pc"), LB = layB(yP, "pc"), SA = lay2(yS, "sp"), yBS = SA.end + 60, SB = layB(yBS, "sp");
const endP = Math.ceil(Math.max(LA.end, LB.end) + 120), endS = Math.ceil(SB.end + 100);
sec("sec_menu", "お品書き", "theme:background", endP, endS, { anchor: "menu", nav: { label: "お品書き", order: 2 } });
headCol("mn", "sec_menu", "お品書き", "Menu", 120, 100);
add("mn_tag", { type: "shape", z: 2, kind: "rect", fill: K, section: "sec_menu", layout: lay({ x: 245.2, y: 190, w: 172, h: 48 }, { x: 20, y: 285.8, w: 123, h: 38.2 }) });
add("mn_tagi", { type: "shape", z: 3, kind: "rect", fill: K, stroke: { width: 1, color: W }, section: "sec_menu", layout: lay({ x: 250.2, y: 195, w: 162, h: 38 }, { x: 25, y: 290.8, w: 113, h: 28.2 }) });
t("mn_tagt", "sec_menu", ["/catalog/labels/lbl_recommend/name"], [[20, 28, 0], [13, 18.2, 0]], H, W, [{ x: 245.2, y: 200, w: 172, h: 28 }, { x: 20, y: 295.8, w: 123, h: 18.2 }], { align: "center", z: 4 });
// おすすめ＝① で lbl_recommend の付いた品。並びは wa02.json の recOrder（載っていない品は ① の並びで後ろに）
const recIds = Object.entries(cat.items).filter(([, it]) => (it.labels || []).includes("lbl_recommend")).map(([id]) => id);
const REC = [...C.recOrder.filter((id) => recIds.includes(id)), ...recIds.filter((id) => !C.recOrder.includes(id))];
add("mn_cards", { type: "repeater", z: 3, section: "sec_menu", source: { kind: "catalog", menuId: "mnu_food", pick: REC }, display: { mode: "grid", columns: { pc: 3, sp: 2 }, gap: { pc: 40, sp: 20 }, photoless: "sameCard" },
  card: { height: { pc: 373.4, sp: 289.4 }, elements: {
    c_ph: { type: "photo", z: 1, bind: { scope: "item", path: "/photos" }, layout: { pc: { x: 0, y: 0, w: 100, h: 220.8, ratio: "custom" }, sp: { x: 0, y: 0, w: 100, h: 110, ratio: "custom" } } },
    c_nm: cell(["/name", "plain"], null, { x: 0, y: 230.9, w: 100, h: 25.2 }, { x: 0, y: 120, w: 100, h: 22.4 }, 18, 16, H),
    c_ln: { type: "shape", z: 1, kind: "line", fill: "theme:line", layout: { pc: { x: 0, y: 262, w: 100, h: 1, strokeWidth: 1 }, sp: { x: 0, y: 150, w: 100, h: 1, strokeWidth: 1 } } },
    c_ds: cell(["/description", "plain"], null, { x: 0, y: 277, w: 100, h: 48 }, { x: 0, y: 163.4, w: 100, h: 83.2 }, 15, 13, B, G),
    c_pr: cell(["/prices", "price"], "right", { x: 0, y: 359, w: 100, h: 14.4 }, { x: 0, y: 256.6, w: 100, h: 16 }, 18, 16) } },
  layout: lay({ x: 245.2, y: 258, w: 1073.6, h: RH.pc }, { x: 20, y: 344, w: 350, h: RH.sp }) });
els.mn_cards.card.elements.c_ds.style.lineHeight = 1.6; // 説明は 15/24・13/20.8（SPEC 3）
if (!nRec) for (const id of ["mn_tag", "mn_tagi", "mn_tagt", "mn_cards"]) delete els[id];
const listCard = (fmt) => ({ height: { pc: ROW.pc, sp: ROW.sp }, elements: {
  c_name: cell(["/name", "plain"], null, { x: 0, y: 4.5, w: 68, h: 22.4 }, { x: 0, y: 4.5, w: 64, h: 19.6 }, 16, 14),
  c_price: cell(["/prices", fmt], "right", { x: 68, y: 4.5, w: 32, h: 22.4 }, { x: 64, y: 4.5, w: 36, h: 19.6 }, 16, 14),
  c_line: { type: "shape", z: 1, kind: "line", fill: "theme:lineSoft", layout: { pc: { x: 0, y: 31.4, w: 100, h: 1, strokeWidth: 1 }, sp: { x: 0, y: 28.6, w: 100, h: 1, strokeWidth: 1 } } } } });
const tagHead = () => ({ type: "text", z: 1, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path: "/category/name", format: "plain" } }] }], style: { font: H, weight: 400, color: W, lineHeight: 1.6222 }, layout: { pc: { x: 0, y: 0, w: 100, h: 29.2, size: 18 }, sp: { x: 0, y: 0, w: 100, h: 26.4, size: 16 } } });
const list = (id, menuId, ids, fmt, xP, yPc, ySp) => add(id, { type: "repeater", z: 3, section: "sec_menu", source: { kind: "catalog", menuId, groupByCategory: true, categoryIds: ids }, display: { mode: "list", columns: { pc: 1, sp: 1 }, photoless: "sameCard" }, card: listCard(fmt), groupHeading: tagHead(), layout: lay({ x: xP, y: yPc, w: 512.4, h: listH(ids, "pc") }, { x: 30, y: ySp, w: 330, h: listH(ids, "sp") }) });
const note = (id, lines, xP, yPc, ySp, h) => { t(id, "sec_menu", lines[0], [[14, 19.6, 0], [12, 16.8, 0]], B, G, [{ x: xP, y: yPc, w: 512.4, h: h.pc }, { x: 30, y: ySp, w: 330, h: h.sp }]); els[id].paragraphs = lines.map((text) => ({ runs: [{ text }] })); };
listHead("mn_lf", "sec_menu", C.menuLeft.title, { x: 245.2, y: yP }, { x: 30, y: yS });
list("mn_yaki", "mnu_food", A1, "price", 245.2, LA.a1, SA.a1);
note("mn_na", C.menuLeft.note, 245.2, LA.nA, SA.nA, N2);
list("mn_etc", "mnu_food", A2, "price", 245.2, LA.a2, SA.a2);
listHead("mn_lb", "sec_menu", C.menuRight.title, { x: 807.6, y: yP }, { x: 30, y: yBS });
list("mn_side", "mnu_food", B1, "price", 807.6, LB.b1, SB.b1);
note("mn_nb", C.menuRight.note, 807.6, LB.nB, SB.nB, N1);

// ---- 9 お店の情報（① に値がある行だけ）
const f = shop.facilities || {}, loc = shop.location || {};
// 禁煙・喫煙と駐車場は ① の値から言葉を作る（連動の形式が無いので文字。edit:false で、直すのは ① の方）
const SMOKE = { none: "全席禁煙", separated: "分煙", allowed: "喫煙可" };
const pk = loc.parking || {};
const PARK = { yes: `あり${pk.spaces ? `（${pk.spaces}台）` : ""}`, no: "なし", nearbyPaid: "近くにコインパーキングあり", partner: "提携駐車場あり" };
const rows = [
  ["店名", ["/basic/name"]],
  ["住所", ["/location", "address"]],
  ["電話番号", ["/contact/phone", "phone"]],
  ["営業時間", ["/hours", "hoursShort"]],
  formatClosedDays(shop.hours) ? ["定休日", ["/hours", "closedDays"]] : null, // ① に休みがあるときだけ
  shop.payment?.cards?.length ? ["お支払い", ["/payment", "payment"]] : null,
  f.seats ? ["席数", ["/facilities/seats", "seats"]] : null,
  SMOKE[f.smoking] ? ["禁煙・喫煙", SMOKE[f.smoking], 1] : null,
  PARK[pk.status] ? ["駐車場", PARK[pk.status], 1] : null,
  f.note ? ["その他", ["/facilities/note"]] : null,
].filter(Boolean);
const y0P = 148, y0S = 285.8, stepP = 64.6, stepS = 61.4;
sec("sec_info", "店舗情報", "theme:paper", 815, Math.ceil(y0S + rows.length * stepS + 72), { anchor: "information", nav: { label: "店舗情報", order: 3 } });
headCol("in", "sec_info", "店舗情報", "Information", 120, 100);
const TBL = [[16, 25.6, 0], [14, 22.4, 0]];
rows.forEach(([k, v, made], i) => {
  const yP = y0P + stepP * i, yS = y0S + stepS * i;
  line(`in_k${i}`, "sec_info", K, { x: 295.2, y: yP, w: 120, h: 1 }, { x: 30, y: yS, w: 74, h: 1 });
  line(`in_v${i}`, "sec_info", "theme:line", { x: 445.2, y: yP, w: 874.8, h: 1 }, { x: 124, y: yS, w: 236, h: 1 });
  t(`in_kt${i}`, "sec_info", k, TBL, B, G, [{ x: 295.2, y: yP + 15, w: 120, h: 25.6 }, { x: 30, y: yS + 15, w: 74, h: 22.4 }], D);
  t(`in_vt${i}`, "sec_info", v, TBL, B, G, [{ x: 445.2, y: yP + 15, w: 874.8, h: 25.6 }, { x: 124, y: yS + 15, w: 236, h: 22.4 }], made ? D : {});
});

// ---- アクセス（① に緯度経度が無いので、地図は住所で開く埋め込みを wa02-finish で入れる）
sec("sec_access", "アクセス", "theme:paper", 721, 587, { anchor: "access", nav: { label: "アクセス", order: 4 } });
listHead("ac", "sec_access", "アクセス", { x: 295.2, y: 0 }, { x: 30, y: 0 });
t("ac_way", "sec_access", ["/location/access", "access"], TBL, B, G, [{ x: 295.2, y: 74.2, w: 1024.8, h: 25.6 }, { x: 30, y: 68.6, w: 330, h: 44.8 }]);
add("ac_mapbox", { type: "shape", z: 2, kind: "rect", fill: "#EEEEEE", section: "sec_access", layout: lay({ x: 295.2, y: 155.3, w: 1024.8, h: 400 }, { x: 30, y: 143.4, w: 330, h: 300 }) });
const addr = `${loc.prefecture}${loc.city}${loc.town}${loc.street}`;
t("ac_map", "sec_access", "Google マップで開く", [[16, 22.4, 0], [15, 21, 0]], H, K, [{ x: 295.2, y: 575.3, w: 150, h: 22.4 }, { x: 30, y: 463.4, w: 150, h: 21 }], { link: { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, newTab: true }, ...D });
line("ac_ml", "sec_access", K, { x: 295.2, y: 598.7, w: 142, h: 1 }, { x: 30, y: 485.4, w: 134, h: 1 });

// ---- 8 予約の案内（Web 予約が無いのでピル1つ・SP は 485-84＝401）
sec("sec_resv", "ご予約", "theme:text", 445, 401);
photo("rv_bg", "sec_resv", "ast_resv", 1, { x: 0, y: 0, w: P, h: 445.4 }, { x: 0, y: 0, w: S, h: 401 }, 50);
const CT = { align: "center" };
t("rv_ja", "sec_resv", "ご予約・お問い合わせ", [[32, 44.8, 1.6], [24, 33.6, 1.2]], H, W, [{ x: 120, y: 100, w: 1200, h: 44.8 }, { x: 30, y: 80, w: 330, h: 33.6 }], CT);
t("rv_en", "sec_resv", "Reservation", [[16, 22.4, 1.6], [14, 19.6, 1.4]], A, W, [{ x: 620, y: 148.8, w: 200, h: 22.4 }, { x: 95, y: 117.5, w: 200, h: 19.6 }], { ...CT, ...D });
line("rv_enl", "sec_resv", W, { x: 665, y: 173, w: 110, h: 1 }, { x: 150, y: 139, w: 90, h: 1 });
t("rv_note", "sec_resv", ["/reservation/note"], [[18, 25.2, 0.9], [14, 22.4, 0.7]], H, W, [{ x: 120, y: 220.2, w: 1200, h: 25.2 }, { x: 30, y: 186.1, w: 330, h: 22.4 }], CT);
add("rv_pill", { type: "shape", z: 2, kind: "rect", fill: W, radius: 48, stroke: { width: 1, color: W }, section: "sec_resv", link: { kind: "shopPhone" }, layout: lay({ x: 560, y: 265.4, w: 320, h: 80 }, { x: 55, y: 250.9, w: 280, h: 70 }) });
t("rv_tel", "sec_resv", ["/contact/phone", "phone"], [[28, 36, 1.4], [24, 30.9, 1.2]], A, W, [{ x: 560, y: 275, w: 320, h: 36 }, { x: 55, y: 257, w: 280, h: 30.9 }], { ...CT, z: 3, link: { kind: "shopPhone" } });
// 受付時間がピルの1行（約 22 字）に入らないときは、ピルの下に広い箱で出す（ピルからはみ出さないように）
const hrLong = `受付時間 ${formatHoursShort(shop.hours)}`.length > 22;
t("rv_hr", "sec_resv", "受付時間", [[13, 18.2, 0.65], [12, 16.8, 0.6]], B, W, hrLong ? [{ x: 120, y: 365.4, w: 1200, h: 18.2 }, { x: 30, y: 336.9, w: 330, h: 16.8 }] : [{ x: 560, y: 318, w: 320, h: 18.2 }, { x: 55, y: 295, w: 280, h: 18.2 }], CT);
els.rv_hr.paragraphs = [{ runs: [{ text: "受付時間 " }, { bind: { scope: "shop", path: "/hours", format: "hoursShort" } }] }];

// ---- フッター（SNS なしの値・SPEC 6章。芦屋みっけ掲載店の表示を一番下に足す）
sec("sec_footer", "フッター", "theme:background", shop.salesDraft ? 384 : 358, shop.salesDraft ? 358 : 332);
t("ft_name", "sec_footer", C.name, [[32, 49.1, 0], [24, 32.7, 0]], H, K, [{ x: 630, y: 80, w: 180, h: 49.1 }, { x: 135, y: 80, w: 120, h: 36.9 }], CT);
t("ft_read", "sec_footer", C.nameEn, [[10, 14, 2], [10, 14, 2]], H, K, [{ x: 620, y: 145.1, w: 200, h: 14 }, { x: 95, y: 122.7, w: 200, h: 14 }], { ...CT, ...D });
t("ft_addr", "sec_footer", ["/location", "address"], TBL, B, G, [{ x: 120, y: 204.7, w: 1200, h: 25.6 }, { x: 30, y: 178.1, w: 330, h: 22.4 }], CT);
t("ft_copy", "sec_footer", C.copyright, [[13, 18.2, 0], [13, 18.2, 0]], A, "#646464", [{ x: 120, y: 270.1, w: 1200, h: 18.2 }, { x: 30, y: 243.5, w: 330, h: 18.2 }], CT);
t("ft_mikke", "sec_footer", "芦屋みっけ 掲載店", [[13, 18.2, 0], [13, 18.2, 0]], B, "#646464", [{ x: 120, y: 296, w: 1200, h: 18.2 }, { x: 30, y: 269.5, w: 330, h: 18.2 }], { ...CT, ...D, link: { kind: "url", value: C.mikkeUrl, newTab: true } });

if (shop.salesDraft) t("ft_draft", "sec_footer", "営業用の見本（写真・品は仮）", [[13, 18.2, 0], [13, 18.2, 0]], B, "#646464", [{ x: 120, y: 322, w: 1200, h: 18.2 }, { x: 30, y: 295.5, w: 330, h: 18.2 }], { ...CT, ...D });

// 電話番号の文字は押せるようにする（文字の箱の link）
for (const e of Object.values(els)) if (e.type === "text" && !e.style?.link && e.paragraphs?.length === 1 && e.paragraphs[0].runs?.length === 1 && e.paragraphs[0].runs[0].bind?.path === "/contact/phone") (e.style ||= {}).link = { kind: "shopPhone" };
const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_02", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", ...(shop.story ? ["sec_story"] : []), "sec_gallery", "sec_menu", "sec_info", "sec_access", "sec_resv"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}・情報の行 ${rows.length}`);
