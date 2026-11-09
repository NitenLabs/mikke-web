#!/usr/bin/env node
// wa-02：templates/wa-02/SPEC.md の実測値から samples/rian/site.json を作る（物語・おすすめは ① に無いので作らない）。
// 使い方：node tools/wa02-gen.mjs → node tools/build.mjs samples/rian → node tools/wa02-finish.mjs
import fs from "node:fs";
const DIR = "samples/rian";
const shop = JSON.parse(fs.readFileSync(`${DIR}/shop.json`, "utf8"));
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
    layout: lay({ ...l[0], size: ps[0], ...(extra.vp ? { writingMode: "vertical" } : {}) }, { ...l[1], size: ss[0], ...(extra.vs ? { writingMode: "vertical" } : {}) }) });
}
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
t("hd_name", "sec_header", "李杏", [[28, 32.7, 0], [24, 27.3, 0]], H, K, [{ x: 138.8, y: 17.6, w: 120, h: 32.7 }, { x: 88.8, y: 17.4, w: 100, h: 27.3 }], { link: { kind: "page", value: "pg_home" } });
t("hd_read", "sec_header", "- RIAN -", [[10, 14, 2], [10, 14, 2]], H, K, [{ x: 152.7, y: 58.4, w: 92.1, h: 14 }, { x: 92.7, y: 52.6, w: 92.1, h: 14 }]);
add("hd_nav", { type: "nav", z: 4, section: "sec_header", style: { color: K, font: H, spMenuBackground: "theme:text" }, layout: lay({ x: 700, y: 33.8, w: 710, h: 22.4, size: 16 }, { x: 330, y: 20, w: 42, h: 44 }) });
const bar = (id, y, w) => add(id, { type: "shape", z: 3, kind: "rect", fill: K, section: "sec_header", layout: { pc: { x: 50, y: 0, w: 0.01, h: 1 }, sp: { x: r((336 / S) * 100), y, w: r((w / S) * 100), h: 2 } }, hidden: { pc: true } });
bar("hd_b1", 29, 30); bar("hd_b2", 41, 30); bar("hd_b3", 53, 20);

// ---- 1 ファーストビュー
sec("sec_firstv", "最初の画面", "theme:text", 900, 844);
const FV = [{ x: 0, y: 0, w: P, h: 900 }, { x: 0, y: 0, w: S, h: 844 }];
photo("fv_1", "sec_firstv", "ast_fv01", 1, FV[0], FV[1], 10);
photo("fv_2", "sec_firstv", "ast_fv02", 2, FV[0], FV[1], 10);
photo("fv_3", "sec_firstv", "ast_fv03", 3, FV[0], FV[1]);
t("fv_scroll", "sec_firstv", "SCROLL", [[12, 16.8, 1.2], [12, 16.8, 1.2]], A, W, [{ x: 711.6, y: 778, w: 16.8, h: 58 }, { x: 186.6, y: 722, w: 16.8, h: 58 }], { vp: 1, vs: 1, weight: 600, z: 5 });
line("fv_line", "sec_firstv", W, { x: 719.5, y: 840, w: 1, h: 60 }, { x: 194.5, y: 784, w: 1, h: 60 }, 5);
// 固定タブ：Web 予約が無いので電話だけ（SPEC 6章）。固定は wa02-finish で
add("fv_tab", { type: "shape", z: 6, kind: "rect", fill: K, section: "sec_firstv", link: { kind: "shopPhone" }, layout: lay({ x: 1396, y: 790, w: 44, h: 110 }, { x: 346, y: 744, w: 44, h: 100 }) });
t("fv_tabt", "sec_firstv", "電話予約", [[15, 21, 1.5], [15, 21, 1.5]], H, W, [{ x: 1407.5, y: 812, w: 21, h: 66 }, { x: 357.5, y: 761, w: 21, h: 66 }], { vp: 1, vs: 1, z: 7, link: { kind: "shopPhone" } });

// ---- 5 ギャラリー（物語が無いので FV の写真と続かないよう、上に標準の余白 120/100 を足す）
sec("sec_gallery", "ギャラリー", "theme:background", 540, 360);
for (let i = 0; i < 7; i++) add(`gal_${i + 1}`, { type: "photo", z: 1, section: "sec_gallery", asset: `ast_gal${i + 1}`, layout: lay({ x: 370, y: 120, w: 700, h: 400, ratio: "custom" }, { x: 23.5, y: 100, w: 343, h: 240, ratio: "custom" }), crop: { fx: 50, fy: 50, zoom: 1 } });

// 見出し列（縦書き）：PC x120、スマホ x168.2
function headCol(prefix, section, ja, en, yP, yS, xP = 120, xS = 168.2) {
  line(`${prefix}_rule`, section, K, { x: xP, y: yP, w: 75.2, h: 1 }, { x: xS, y: yS, w: 53.6, h: 1 });
  t(`${prefix}_ja`, section, ja, [[32, 44.8, 1.6], [24, 28.8, 1.2]], H, K, [{ x: xP + 30.4, y: yP + 16, w: 44.8, h: 143 }, { x: xS + 20, y: yS + 16, w: 33.6, h: 110 }], { vp: 1, vs: 1 });
  t(`${prefix}_en`, section, en, [[16, 22.4, 1.6], [14, 16.8, 1.4]], A, K, [{ x: xP, y: yP + 16, w: 22.4, h: 143 }, { x: xS - 2.8, y: yS + 16, w: 19.6, h: 110 }], { vp: 1, vs: 1 });
}
// 一覧の見出し＋下線
function listHead(prefix, section, content, pcXY, spXY, under = 120) {
  t(`${prefix}_h`, section, content, [[28, 39.2, 1.4], [24, 33.6, 1.2]], H, K, [{ ...pcXY, w: 512.4, h: 39.2 }, { ...spXY, w: 330, h: 33.6 }]);
  line(`${prefix}_hl`, section, K, { x: pcXY.x, y: pcXY.y + 47, w: under, h: 1 }, { x: spXY.x, y: spXY.y + 41, w: under, h: 1 });
}

// ---- 3 メニュー（おすすめ 0 件なので札とカードは出さず、一覧を札の位置から始める）
sec("sec_menu", "お品書き", "theme:background", 500, 556, { anchor: "menu", nav: { label: "お品書き", order: 2 } });
add("mn_panel", { type: "shape", z: 1, kind: "rect", fill: "theme:surface", section: "sec_menu", layout: lay({ x: 432, y: 305.9, w: 1008, h: 194.1 }, { x: 117, y: 281.3, w: 273, h: 274.7 }) });
headCol("mn", "sec_menu", "お品書き", "Menu", 120, 100);
listHead("mn_l", "sec_menu", ["/catalog/categories/cat_drink/name"], { x: 245.2, y: 190 }, { x: 30, y: 285.8 });
const cell = (content, align, pc, sp, ps, ss) => ({ type: "text", z: 2, role: "body", paragraphs: [{ runs: [{ bind: { scope: "item", path: content[0], format: content[1] } }] }], style: { font: B, weight: 400, color: K, lineHeight: 1.4, ...(align ? { align } : {}) }, layout: { pc: { ...pc, size: ps }, sp: { ...sp, size: ss } } });
add("mn_list", { type: "repeater", z: 3, section: "sec_menu", source: { kind: "catalog", menuId: "mnu_main" }, display: { mode: "list", columns: { pc: 1, sp: 1 }, photoless: "sameCard" },
  card: { height: { pc: 39.2, sp: 36.6 }, elements: {
    c_name: cell(["/name", "plain"], null, { x: 0, y: 4.5, w: 68, h: 22.4 }, { x: 0, y: 4.5, w: 64, h: 19.6 }, 16, 14),
    c_price: cell(["/prices", "priceAllTax"], "right", { x: 68, y: 4.5, w: 32, h: 22.4 }, { x: 64, y: 4.5, w: 36, h: 19.6 }, 16, 14),
    c_line: { type: "shape", z: 1, kind: "line", fill: "theme:lineSoft", layout: { pc: { x: 0, y: 31.4, w: 100, h: 1, strokeWidth: 1 }, sp: { x: 0, y: 28.6, w: 100, h: 1, strokeWidth: 1 } } } } },
  layout: lay({ x: 245.2, y: 262, w: 512.4, h: 117.6 }, { x: 30, y: 345.8, w: 330, h: 109.8 }) });

// ---- 9 お店の情報（① に値がある行だけ）
const f = shop.facilities || {}, loc = shop.location || {};
const rows = [
  ["店名", ["/basic/name"]],
  ["住所", ["/location", "address"]],
  ["電話番号", ["/contact/phone", "phone"]],
  ["営業時間", ["/hours", "hoursShort"]],
  shop.payment?.cards?.length ? ["お支払い", ["/payment", "payment"]] : null,
  f.seats ? ["席数", ["/facilities/seats", "seats"]] : null,
  f.smoking === "none" ? ["禁煙・喫煙", "全席禁煙"] : null,
  loc.parking?.status === "no" ? ["駐車場", "なし"] : null,
  f.note ? ["その他", ["/facilities/note"]] : null,
].filter(Boolean);
const y0P = 148, y0S = 285.8, stepP = 64.6, stepS = 61.4;
sec("sec_info", "店舗情報", "theme:paper", 815, Math.ceil(y0S + rows.length * stepS + 72), { anchor: "information", nav: { label: "店舗情報", order: 3 } });
headCol("in", "sec_info", "店舗情報", "Information", 120, 100);
const TBL = [[16, 25.6, 0], [14, 22.4, 0]];
rows.forEach(([k, v], i) => {
  const yP = y0P + stepP * i, yS = y0S + stepS * i;
  line(`in_k${i}`, "sec_info", K, { x: 295.2, y: yP, w: 120, h: 1 }, { x: 30, y: yS, w: 74, h: 1 });
  line(`in_v${i}`, "sec_info", "theme:line", { x: 445.2, y: yP, w: 874.8, h: 1 }, { x: 124, y: yS, w: 236, h: 1 });
  t(`in_kt${i}`, "sec_info", k, TBL, B, G, [{ x: 295.2, y: yP + 15, w: 120, h: 25.6 }, { x: 30, y: yS + 15, w: 74, h: 22.4 }]);
  t(`in_vt${i}`, "sec_info", v, TBL, B, G, [{ x: 445.2, y: yP + 15, w: 874.8, h: 25.6 }, { x: 124, y: yS + 15, w: 236, h: 22.4 }]);
});

// ---- アクセス（① に緯度経度が無いので地図の埋め込みは出さず、住所で開くリンクだけ）
sec("sec_access", "アクセス", "theme:paper", 274, 266, { anchor: "access", nav: { label: "アクセス", order: 4 } });
listHead("ac", "sec_access", "アクセス", { x: 295.2, y: 0 }, { x: 30, y: 0 });
t("ac_way", "sec_access", ["/location/access", "access"], TBL, B, G, [{ x: 295.2, y: 74.2, w: 1024.8, h: 25.6 }, { x: 30, y: 68.6, w: 330, h: 22.4 }]);
const addr = `${loc.prefecture}${loc.city}${loc.town}${loc.street}`;
t("ac_map", "sec_access", "Google マップで開く", [[16, 22.4, 0], [15, 21, 0]], H, K, [{ x: 295.2, y: 132, w: 150, h: 22.4 }, { x: 30, y: 145, w: 150, h: 21 }], { link: { kind: "url", value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, newTab: true } });
line("ac_ml", "sec_access", K, { x: 295.2, y: 155.4, w: 142, h: 1 }, { x: 30, y: 167, w: 134, h: 1 });

// ---- 8 予約の案内（Web 予約が無いのでピル1つ・SP は 485-84＝401）
sec("sec_resv", "ご予約", "theme:text", 445, 401);
photo("rv_bg", "sec_resv", "ast_resv", 1, { x: 0, y: 0, w: P, h: 445.4 }, { x: 0, y: 0, w: S, h: 401 }, 50);
const C = { align: "center" };
t("rv_ja", "sec_resv", "ご予約・お問い合わせ", [[32, 44.8, 1.6], [24, 33.6, 1.2]], H, W, [{ x: 120, y: 100, w: 1200, h: 44.8 }, { x: 30, y: 80, w: 330, h: 33.6 }], C);
t("rv_en", "sec_resv", "Reservation", [[16, 22.4, 1.6], [14, 19.6, 1.4]], A, W, [{ x: 620, y: 148.8, w: 200, h: 22.4 }, { x: 95, y: 117.5, w: 200, h: 19.6 }], C);
line("rv_enl", "sec_resv", W, { x: 665, y: 173, w: 110, h: 1 }, { x: 150, y: 139, w: 90, h: 1 });
t("rv_note", "sec_resv", ["/reservation/note"], [[18, 25.2, 0.9], [14, 22.4, 0.7]], H, W, [{ x: 120, y: 220.2, w: 1200, h: 25.2 }, { x: 30, y: 186.1, w: 330, h: 22.4 }], C);
add("rv_pill", { type: "shape", z: 2, kind: "rect", fill: W, radius: 48, stroke: { width: 1, color: W }, section: "sec_resv", link: { kind: "shopPhone" }, layout: lay({ x: 560, y: 265.4, w: 320, h: 80 }, { x: 55, y: 250.9, w: 280, h: 70 }) });
t("rv_tel", "sec_resv", ["/contact/phone", "phone"], [[28, 36, 1.4], [24, 30.9, 1.2]], A, W, [{ x: 560, y: 275, w: 320, h: 36 }, { x: 55, y: 257, w: 280, h: 30.9 }], { ...C, z: 3, link: { kind: "shopPhone" } });
t("rv_hr", "sec_resv", "受付時間", [[13, 18.2, 0.65], [12, 16.8, 0.6]], B, W, [{ x: 560, y: 318, w: 320, h: 18.2 }, { x: 55, y: 295, w: 280, h: 18.2 }], C);
els.rv_hr.paragraphs = [{ runs: [{ text: "受付時間 " }, { bind: { scope: "shop", path: "/hours", format: "hoursShort" } }] }];

// ---- フッター（SNS なしの値・SPEC 6章。芦屋みっけ掲載店の表示を一番下に足す）
sec("sec_footer", "フッター", "theme:background", 358, 332);
t("ft_name", "sec_footer", "李杏", [[32, 49.1, 0], [24, 32.7, 0]], H, K, [{ x: 630, y: 80, w: 180, h: 49.1 }, { x: 135, y: 80, w: 120, h: 36.9 }], C);
t("ft_read", "sec_footer", "- RIAN -", [[10, 14, 2], [10, 14, 2]], H, K, [{ x: 620, y: 145.1, w: 200, h: 14 }, { x: 95, y: 122.7, w: 200, h: 14 }], C);
t("ft_addr", "sec_footer", ["/location", "address"], TBL, B, G, [{ x: 120, y: 204.7, w: 1200, h: 25.6 }, { x: 30, y: 178.1, w: 330, h: 22.4 }], C);
t("ft_copy", "sec_footer", "© RIAN", [[13, 18.2, 0], [13, 18.2, 0]], A, "#646464", [{ x: 120, y: 270.1, w: 1200, h: 18.2 }, { x: 30, y: 243.5, w: 330, h: 18.2 }], C);
t("ft_mikke", "sec_footer", "芦屋みっけ 掲載店", [[13, 18.2, 0], [13, 18.2, 0]], B, "#646464", [{ x: 120, y: 296, w: 1200, h: 18.2 }, { x: 30, y: 269.5, w: 330, h: 18.2 }], { ...C, link: { kind: "url", value: "https://ashiya-mikke.pages.dev/spot/yakiniku-rian/", newTab: true } });

const site = { schemaVersion: 1, shopId: shop.shopId, templateId: "tpl_wa_02", canvas: { pcContentWidth: P, spDesignWidth: S },
  pages: { pg_home: { kind: "home", slug: "/", navLabel: "TOP", navOrder: 1, showInNav: false, published: true, sections: ["sec_firstv", "sec_gallery", "sec_menu", "sec_info", "sec_access", "sec_resv"] },
    pg_404: { kind: "notFound", slug: "/404", navLabel: "404", navOrder: 9, showInNav: false, published: true, sections: [] } },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky" }, sections: secs, elements: els };
fs.writeFileSync(`${DIR}/site.json`, JSON.stringify(site, null, 2) + "\n");
console.log(`site.json: 要素 ${Object.keys(els).length}・情報の行 ${rows.length}`);
