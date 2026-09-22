// wa-01 付録 A（Claude.ai が設計書から書き起こした照合の項目）をデータとして持つ。
// 実装（spec-check.mjs）は「種類ごとの照合の仕組み」で、ここの各行をそのデータとして読む。
//   text     文字の段（書体・大きさ・行送り・太さ・字間・色）。targets の要素すべてに適用
//   box      位置と大きさ（x,y,幅,高さ）。y はセクション上端から。pageY:true はページ上端から
//   line     表示される線（太さ＋色）。背景と同じ色の線は不合格
//   relation 2要素の関係（topEq＝上端が同じ／vCenterEq＝縦中央が同じ）
//   global   全体の規則（全ての文字の書体／本文の左揃え／背景の順番）
//   manual   自動照合できない行（理由つき。判断は人）
// 数値は px。許容差：位置 ±4、大きさ ±2、関係 ±2、文字は完全一致（大きさ ±0.6・行送り ±0.6）。

const MIN = "Zen Old Mincho", GOT = "Zen Kaku Gothic New";
const D = "#333333", MU = "#7B7B7B", ON = "#FFFFFF", LINE = "#B0B0B0";

// ---- A2 文字の段（役割ごと・対象要素すべて） ----
// t(id, 書体, [pcSize,pcLh], [spSize,spLh], weight, lsEm, targets)
//   targets: 文字列 id、または {id, c:色}（色が役割の既定と違うとき）
const t = (id, fam, pc, sp, w, ls, targets) => ({ kind: "text", id, fam, pc, sp, w, ls, targets });

export const TEXT = [
  t("A2-1", MIN, [16, 22.4], [14, 19.6], 900, 0, [
    "el_about_lbl", "el_feat_lbl", "el_items_lbl", "el_faq_lbl", "el_acc_lbl",
    { id: "el_ct_lbl", c: ON }, { id: "el_mhlbl", c: ON }, { id: "el_chlbl", c: ON }]),
  t("A2-2", MIN, [28, 39.2], [20, 28], 700, 0.1, [
    "el_about_h", "el_feat_h", "el_items_h", "el_faq_h", "el_acc_h",
    { id: "el_ct_h", c: ON }, { id: "el_mhh", c: ON }, { id: "el_chh", c: ON }]),
  t("A2-3", MIN, [28, 50.4], [20, 36], 700, 0.1, ["el_aboutlead"]),
  t("A2-4", MIN, [24, 43.2], [16, 28.8], 700, 0.1, ["el_feath1", "el_feath2"]),
  t("A2-5", GOT, [16, 28.8], [14, 25.2], 400, 0, [
    "el_aboutbody", "el_featb1", "el_featb2", { id: "el_ct_body", c: ON }, "el_mhsoe"]),
  // ACCESS の値はゴシック16/28.8（pc/sp とも16）＝body(sp14)ではない。SPEC 4.8/A11-3
  t("A2-5b", GOT, [16, 28.8], [16, 28.8], 400, 0, ["el_accinfo"]),
  // A2-6..A2-9 品名/説明/価格/表小見出し は繰り返す部品のセル（card cel）。cel は別途 CELTEXT で照合
  t("A2-9", MIN, [24, 33.6], [18, 25.2], 700, 0.1, ["el_kanmilbl", "el_mt_lbl", "el_mk_lbl"]),
  t("A2-11", MIN, [16, 22.4], [16, 22.4], 700, 0, ["el_itemsbtn", "el_acctel", "el_ct_btn"]),
  t("A2-13", MIN, [24, 33.6], [24, 33.6], 500, 0, [{ id: "el_logo", c: ON }]),
  t("A2-14", MIN, [28, 50.4], [20, 36], 700, 0.2, [{ id: "el_fvh", c: ON }]),
  t("A2-15", MIN, [14, 19.6], [12, 16.8], 700, 0.15, [{ id: "el_fven", c: ON }]),
  t("A2-16", MIN, [32, 44.8], [32, 44.8], 700, 0, [{ id: "el_fname", c: ON }]),
  t("A2-17", GOT, [12, 16.8], [12, 16.8], 400, 0, [
    { id: "el_fpriv", c: ON }, { id: "el_fcopy", c: ON }, { id: "el_fmikke", c: ON }]),
  t("A2-19", MIN, [14, 22.4], [14, 22.4], 400, 0, [{ id: "el_kanmitime", c: MU }, { id: "el_mk_time", c: MU }]),
  t("A2-21", MIN, [16, 22], [12, 17], 900, 0, ["el_ntlabel"]),
  t("A2-22", MIN, [16, 22], [12, 17], 600, 0, [{ id: "el_nttext", c: ON }]),
  // A2-3 リード（ABOUT）／A2-2 見出し 等は上で網羅
];

// A2-12 ナビ・A2-18 フッターナビ・A2-20 ACCESS項目名・A2-6..8 カードセル は
// 通常の [data-el] では測れない（nav は a、labelColumn は span、card は cel）ので個別に照合する。
export const NAVTEXT = [
  // id, セレクタ, 書体, [pcSize,pcLh], [spSize,spLh], weight, color(重ねた状態＝スクロール前)
  { kind: "navtext", id: "A2-12", sel: '[data-el="el_nav"] .nav-row a', fam: MIN, pc: [16, 22.4], w: 600, c: ON, note: "ヘッダーのナビ（重ねた状態＝onDark）" },
  { kind: "navtext", id: "A2-18", sel: '[data-el="el_fnav"] a', fam: MIN, pc: [16, 22.4], sp: [14, 19.6], w: 600, c: ON, note: "フッターのナビ" },
];

// A2-20 ACCESS 項目名（labelColumn の先頭＝.lc-key）: 明朝16 w700 #333
export const LABELKEY = { kind: "labelkey", id: "A2-20", sel: '[data-el="el_accinfo"] .lc-key', fam: MIN, pc: [16, 28.8], sp: [16, 28.8], w: 700, c: D };

// A2-6/7/8 カードのセル（ITEMS カード・甘味処表・/menu 表）
export const CELTEXT = [
  { kind: "celtext", id: "A2-6", rep: "el_itemcards", cel: "cel_name", fam: MIN, pc: [16, 28.8], sp: [16, 28.8], w: 700, ls: 0.1, c: D },
  { kind: "celtext", id: "A2-7", rep: "el_itemcards", cel: "cel_desc", fam: GOT, pc: [14, 22.4], sp: [14, 22.4], w: 400, ls: 0.1, c: MU },
  { kind: "celtext", id: "A2-8", rep: "el_itemcards", cel: "cel_price", fam: MIN, pc: [16, 22.4], sp: [14, 19.6], w: 700, ls: 0, c: D },
];

// ---- A3〜A15 位置と大きさ（box）----
// b(id, dev, target, x, y, w, h, opts?) opts: {pageY, note}
const b = (id, dev, target, x, y, w, h, opts = {}) => ({ kind: "box", id, dev, target, x, y, w, h, ...opts });
const HdrPC = { h: 88 }, HdrSP = { h: 80 };

export const BOX = [
  // A3 ヘッダー
  b("A3-1", "pc", "sec_hero", 0, 0, 1440, 720, { pageY: true, target2: "top", note: "FV のページ y=0" }),
  b("A3-1", "sp", "sec_hero", 0, 0, 390, 600, { pageY: true, note: "FV のページ y=0" }),
  b("A3-3", "pc", "el_logo", 88, 27, null, 34), b("A3-3", "sp", "el_logo", 20, 23, null, 34),
  b("A3-5", "pc", "el_hline", 56, 87, 1328, 1), b("A3-5", "sp", "el_hline", 10, 79, 371, 1),
  // A4 FV
  b("A4-1", "pc", "sec_hero", 0, 0, 1440, 720, { hOnly: true, note: "FV セクションの高さ" }),
  b("A4-1", "sp", "sec_hero", 0, 0, 390, 600, { hOnly: true }),
  b("A4-2", "pc", "el_fvphoto", 0, 0, 1440, 720), b("A4-2", "sp", "el_fvphoto", 0, 0, 390, 600),
  b("A4-3", "pc", "el_fvh", 420, 294, 600, 101), b("A4-3", "sp", "el_fvh", 59, 250, 273, 72),
  b("A4-4", "pc", "el_fven", 420, 407, 600, 20), b("A4-4", "sp", "el_fven", 59, 334, 273, 17),
  // A5 営業案内の帯
  b("A5-2", "pc", "el_ntcard", 56, 0, 160, 38), b("A5-2", "sp", "el_ntcard", 0, 0, 80, null),
  b("A5-3", "pc", "el_ntlabel", 72, 8, 128, 22), b("A5-3", "sp", "el_ntlabel", 16, 8, 48, 17),
  b("A5-4", "pc", "el_nttext", 232, 8, 1152, 22), b("A5-4", "sp", "el_nttext", 92, 8, 290, null),
  // A6 見出しの組（4.0）— 各セクション同じ値。ラベル/見出し/横棒
  ...[["el_about_lbl", 80], ["el_feat_lbl", 64], ["el_items_lbl", 64], ["el_faq_lbl", 64], ["el_acc_lbl", 64]].flatMap(([id, spy]) => [
    b("A6-1", "pc", id, 420, 120, 600, 22), b("A6-1", "sp", id, 20, spy, 351, 20)]),
  ...[["el_about_h", 107], ["el_feat_h", 92], ["el_items_h", 92], ["el_faq_h", 92], ["el_acc_h", 92]].flatMap(([id, spy]) => [
    b("A6-2", "pc", id, 420, 151, 600, 39), b("A6-2", "sp", id, 20, spy, 351, 28)]),
  ...[["el_about_rule", 159], ["el_feat_rule", 144], ["el_items_rule", 144], ["el_faq_rule", 144], ["el_acc_rule", 144]].flatMap(([id, spy]) => [
    b("A6-3", "pc", id, 708, 214, 24, 2), b("A6-3", "sp", id, 183, spy, 24, 2)]),
  b("A6-4", "pc", "el_ct_lbl", 480, 120, 480, 22), b("A6-4", "sp", "el_ct_lbl", 20, 80, 351, 20),
  b("A6-4", "pc", "el_ct_h", 480, 150, 480, 39), b("A6-4", "sp", "el_ct_h", 20, 107, 351, 28),
  b("A6-4", "pc", "el_ct_rule", 708, 213, 24, 2), b("A6-4", "sp", "el_ct_rule", 183, 159, 24, 2),
  // A7 ABOUT
  b("A7-1", "pc", "sec_about", 0, 0, 1440, 1057, { hOnly: true }), b("A7-1", "sp", "sec_about", 0, 0, 390, 781, { hOnly: true }),
  b("A7-2", "pc", "el_aboutlead", 420, 248, 600, 50), b("A7-2", "sp", "el_aboutlead", 20, 185, 351, 36),
  b("A7-3", "pc", "el_aboutbody", 420, 330, 600, 115), b("A7-3", "sp", "el_aboutbody", 20, 245, 351, 151),
  b("A7-4", "pc", "el_aboutp1", -146, 622, 566, 420), b("A7-4", "sp", "el_aboutp1", -159, 493, 231, 280),
  b("A7-5", "pc", "el_aboutp2", 437, 622, 566, 420), b("A7-5", "sp", "el_aboutp2", 80, 493, 231, 280),
  b("A7-6", "pc", "el_aboutp3", 1019, 622, 566, 420), b("A7-6", "sp", "el_aboutp3", 318, 493, 231, 280),
  // A8 FEATURE
  b("A8-2", "pc", "el_featp1", 755, 335, 549, 404), b("A8-2", "sp", "el_featp1", 20, 201, 351, 258),
  b("A8-3", "pc", "el_feath1", 160, 467, 501, 43), b("A8-3", "sp", "el_feath1", 28, 483, 333, 29),
  b("A8-4", "pc", "el_featb1", 160, 526, 501, 58), b("A8-4", "sp", "el_featb1", 28, 520, 333, 76),
  b("A8-5", "pc", "el_featp2", 136, 819, 549, 404), b("A8-5", "sp", "el_featp2", 20, 660, 351, 258),
  b("A8-6", "pc", "el_feath2", 779, 950, 501, 43), b("A8-6", "sp", "el_feath2", 28, 942, 333, 29),
  b("A8-7", "pc", "el_featb2", 779, 1009, 501, 58), b("A8-7", "sp", "el_featb2", 28, 979, 333, 76),
  // A9 ITEMS（外箱・区切り線・小見出し・ボタン。カード内寸は CELBOX）
  b("A9-6", "pc", "el_itemsdiv", 56, 964, 1328, 1), b("A9-6", "sp", "el_itemsdiv", 20, 1703, 351, 1),
  b("A9-7", "pc", "el_kanmilbl", 420, 1085, 600, 34), b("A9-7", "sp", "el_kanmilbl", 20, 1768, 351, 25),
  b("A9-9", "pc", "el_kanmitable", 236, null, 968, null, { xwOnly: true }), b("A9-9", "sp", "el_kanmitable", 20, null, 351, null, { xwOnly: true }),
  b("A9-15", "pc", "el_itemsbtnbg", 480, null, 480, 56, { xwhOnly: true }), b("A9-15", "sp", "el_itemsbtnbg", 20, null, 351, 56, { xwhOnly: true }),
  // A10 FAQ
  b("A10-2", "pc", "el_faqlist", 236, 264, 968, null, { xwOnly: true }), b("A10-2", "sp", "el_faqlist", 20, 186, 351, null, { xwOnly: true }),
  // A11 ACCESS
  b("A11-1", "pc", "el_accphoto", 236, 264, 473, 560), b("A11-1", "sp", "el_accphoto", 20, 186, 351, 439),
  b("A11-3", "pc", "el_accinfo", 733, 284, 471, null, { xwOnly: true }), b("A11-3", "sp", "el_accinfo", 20, null, 351, null, { xwOnly: true }),
  b("A11-4", "pc", "el_accinfotop", 733, 264, 471, 1), b("A11-4", "sp", "el_accinfotop", 20, null, 351, 1, { xwhOnly: true, note: "SP は表の上端（y は中身に合わせる）" }),
  b("A11-8", "pc", "el_accmap", 236, null, 968, 360, { xwhOnly: true }), b("A11-8", "sp", "el_accmap", 20, null, 351, 260, { xwhOnly: true }),
  b("A11-9", "pc", "el_acctelbg", 480, null, 480, 56, { xwhOnly: true }), b("A11-9", "sp", "el_acctelbg", 20, null, 351, 56, { xwhOnly: true }),
  // A12 CONTACT
  b("A12-1", "pc", "sec_contact", 0, 0, 1440, 590, { hOnly: true }), b("A12-1", "sp", "sec_contact", 0, 0, 390, 479, { hOnly: true }),
  b("A12-2", "pc", "el_ctphoto", 0, 0, 1440, 590), b("A12-2", "sp", "el_ctphoto", 0, 0, 390, 479),
  b("A12-3", "pc", "el_ct_body", 480, 247, 480, 86), b("A12-3", "sp", "el_ct_body", 39, 194, 312, 101),
  b("A12-4", "pc", "el_ct_btnbg", 480, 374, 480, 56), b("A12-4", "sp", "el_ct_btnbg", 39, 335, 312, 56),
  // A13 フッター
  b("A13-1", "pc", "sec_footer", 0, 0, 1440, 475, { hOnly: true }), b("A13-1", "sp", "sec_footer", 0, 0, 390, 604, { hOnly: true }),
  b("A13-2", "pc", "el_fname", 440, 92, 560, 45), b("A13-2", "sp", "el_fname", 39, 92, 312, 45),
  b("A13-3", "pc", "el_faddr", 440, 145, 560, 29), b("A13-3", "sp", "el_faddr", 39, 145, 312, 25),
  b("A13-4", "pc", "el_fdiv", 56, 290, 1328, 1), b("A13-4", "sp", "el_fdiv", 20, 286, 351, 1),
  // A14 お品書き（/menu）
  b("A14-1", "pc", "el_mhphoto", 0, 0, 1440, 400), b("A14-1", "sp", "el_mhphoto", 0, 0, 390, 320),
  b("A14-2", "pc", "el_mhlbl", 420, 170, 600, 22), b("A14-2", "sp", "el_mhlbl", 20, 132, 351, 20),
  b("A14-3", "pc", "el_mhh", 420, 201, 600, 39), b("A14-3", "sp", "el_mhh", 20, 159, 351, 28),
  b("A14-4", "pc", "el_mhsoe", 420, 260, 600, null, { xwOnly: true }), b("A14-4", "sp", "el_mhsoe", 20, 207, 351, null, { xwOnly: true }),
  // A15 お問い合わせ（/contact）帯
  b("A15-1", "pc", "sec_contacthdr", 0, 0, 1440, 320, { hOnly: true }), b("A15-1", "sp", "sec_contacthdr", 0, 0, 390, 240, { hOnly: true }),
  b("A15-2", "pc", "el_chlbl", 420, 170, 600, 22), b("A15-2", "sp", "el_chlbl", 20, 132, 351, 20),
  b("A15-2b", "pc", "el_chh", 420, 201, 600, 39), b("A15-2b", "sp", "el_chh", 20, 159, 351, 28),
];

// ---- 線（表示される線：太さ＋色。背景と同じ色は不合格）----
// shape=背景色で描く線（el_*_rule, div, 表の罫線）／border=枠線（ピル・入力欄）
const ln = (id, target, w, color, opts = {}) => ({ kind: "line", id, target, w, color, ...opts });
export const LINE_CHECKS = [
  ln("A1-2a", "el_itemsdiv", 1, LINE, { note: "ITEMS 区切り線（line 50%＝色は #B0B0B0）", alpha: true }),
  ln("A3-5", "el_hline", 1, ON, { alpha: true, note: "ヘッダー下の線（onDark 60%）" }),
  ln("A13-4", "el_fdiv", 1, ON, { alpha: true, note: "フッター区切り線（onDark 20%）" }),
  ln("A11-4", "el_accinfotop", 1, LINE, { note: "ACCESS 表の上の線" }),
  ln("A11-5", "el_accinfobot", 1, LINE, { note: "ACCESS 表の下の線" }),
  // 横棒（見出しの組）は #333 の図形（線扱い・太さ2）
  ln("A6-3-rule", "el_about_rule", 2, D),
  // ピルの枠線（A9-16 / A11 / A12）: border 1px textMuted
  ln("A9-16", "el_itemsbtnbg", 1, MU, { border: true, radius: 32, bg: ON }),
  ln("A11-9b", "el_acctelbg", 1, MU, { border: true, radius: 32, bg: ON }),
  ln("A12-4b", "el_ct_btnbg", 1, MU, { border: true, radius: 32, bg: ON }),
];

// ---- 段落の間隔（gap）----
export const GAP = [
  { kind: "gap", id: "A11-6", target: "el_accinfo", gap: 16, dev: ["pc", "sp"], note: "ACCESS 情報の表の段落の間隔16" },
];

// ---- ピルの「›」を右端に（arrow）----
export const ARROW = [
  { kind: "arrow", id: "A9-16", btn: "el_itemsbtn", bg: "el_itemsbtnbg", rightGap: 24, note: "お品書きピルの › は右から24・縦中央" },
  { kind: "arrow", id: "A12-4b", btn: "el_ct_btn", bg: "el_ct_btnbg", rightGap: 24, note: "お問い合わせピルの › は右から24・縦中央" },
];

// ---- 地図の iframe（読み込まれること）----
export const IFRAME = [
  { kind: "iframe", id: "A11-8b", target: "el_accmap", srcIncludes: "google.com/maps", noLazy: true, note: "地図の iframe に src があり loading=lazy でない（実ブラウザで読み込まれる・§9）" },
];

// ---- 関係（2要素）----
export const RELATION = [
  // A8-8（Claude.ai 決定・fix02）：文字の塊の縦中央 ＝ 写真の縦中央 −12（参照元の実測どおり）
  { kind: "relation", id: "A8-8a", dev: "pc", rel: "vCenterEq", a: "el_featp1", b: "block1text", offset: -12, note: "ブロック1：文字の塊の縦中央＝写真の縦中央 −12" },
  { kind: "relation", id: "A8-8b", dev: "pc", rel: "vCenterEq", a: "el_featp2", b: "block2text", offset: -12, note: "ブロック2：同上" },
  { kind: "relation", id: "A11-7", dev: "pc", rel: "topEq", a: "el_accphoto", b: "el_accinfotop", note: "表の上の線の y＝写真の上端の y" },
  { kind: "relation", id: "A9-cardtops", dev: "pc", rel: "cardPriceTopEq", a: "el_itemcards", note: "3枚のカードの価格の上端が揃う（または全カード同じだけ下がる）" },
];

// ---- 全体の規則（global）----
export const GLOBAL = [
  { kind: "global", id: "A1-1", rule: "fontFamilyAll", allow: [MIN, GOT], note: "表示される全ての文字の書体" },
  { kind: "global", id: "A1-5", rule: "bodyAlignLeft", targets: ["el_aboutbody", "el_featb1", "el_featb2", "el_ct_body"], note: "本文は左揃え" },
  { kind: "global", id: "A1-6", rule: "bgOrder", order: [["sec_hero", "photo"], ["sec_notice", "#333333"], ["sec_about", "#FFFFFF"], ["sec_feature", "#EEEEEE"], ["sec_items", "#FFFFFF"], ["sec_faqs", "#EEEEEE"], ["sec_access", "#FFFFFF"], ["sec_contact", "photo"], ["sec_footer", "#333333"]], note: "トップの背景の順番" },
];

// ==== fix02 §3：旧「手動」の自動化 ====
// A1-3 半透明の線（不透明度）
export const ALPHA = [
  { kind: "alpha", id: "A1-3", target: "el_itemsdiv", alpha: 0.5, rgb: LINE, note: "商品と表の間の区切り線＝line 50%" },
];
// A1-4 セクションの地の色（帯・フッター＝#333。CONTACTの地は写真＝A12で担保）
export const SECBG = [
  { kind: "secbg", id: "A1-4", targets: [["sec_notice", D], ["sec_footer", D], ["sec_feature", "#EEEEEE"], ["sec_about", "#FFFFFF"]], note: "帯/フッター#333・灰#EEE・白#FFF（CONTACTの地は写真）" },
];
// A3-4 ナビの右端 x1376・項目間隔24
export const NAVGEOM = [
  { kind: "navgeom", id: "A3-4", sel: '[data-el="el_nav"] .nav-row a', rightEdge: 1376, gap: 24, dev: "pc", note: "ヘッダーのナビ 右端x1376・間隔24" },
];
// A11-2 縦書き（PC）
export const WRITING = [
  { kind: "writing", id: "A11-2", target: "el_accsoe", dev: "pc", mode: "vertical", note: "ACCESS 添え書きは PC 縦書き" },
];
// A2-10 / A10-4 FAQ「Q.」・A10-5 質問（summary の .acc-q）
export const CELPSEUDO = [
  { kind: "pseudo", id: "A10-6", sel: ".el-acc summary", pseudo: "::after", w: 12, h: 6, dev: "pc", note: "開閉の印＝シェブロン12×6" },
  { kind: "pseudo", id: "A10-4", sel: ".el-acc .acc-q", pseudo: "::before", content: "Q.", dev: "pc", note: "「Q.」" },
];
// A10-3 FAQ の行の線（#B0B0B0）
export const BORDERLINE = [
  { kind: "borderline", id: "A10-3", sel: ".el-acc .acc-item", color: LINE, width: 1, dev: "pc", note: "FAQ 行の上下線＝line" },
];
// A2-10/A10-5 FAQ 質問・A10-7 答え／A9-11〜13 甘味処の表のセル（DOM の .acc-q, .acc-a, cel）
export const SELTEXT2 = [
  { kind: "seltext", id: "A10-5", sel: ".el-acc summary .acc-q", fam: MIN, pc: [18, 25.2], w: 700, c: D, dev: "pc", note: "FAQ 質問" },
  { kind: "seltext", id: "A10-7", sel: ".el-acc details .acc-a", fam: GOT, pc: [16, 28.8], w: 400, c: D, dev: "pc", note: "FAQ 答え" },
  { kind: "seltext", id: "A9-11", sel: '[data-el="el_kanmitable"] [data-cel="cel_tname"]', fam: MIN, pc: [16, 28.8], w: 700, c: D, dev: "pc", note: "甘味処 品名" },
  { kind: "seltext", id: "A9-12", sel: '[data-el="el_kanmitable"] [data-cel="cel_tdesc"]', fam: GOT, pc: [14, 22.4], w: 400, c: MU, dev: "pc", note: "甘味処 説明" },
  { kind: "seltext", id: "A9-13", sel: '[data-el="el_kanmitable"] [data-cel="cel_tprice"]', fam: MIN, pc: [16, 22.4], w: 700, c: D, dev: "pc", note: "甘味処 価格" },
];
// A9-14 甘味処の縦の罫線・A9-10 表の線（cel_tvline/cel_thline は line 図形）
export const CELLINE = [
  { kind: "celline", id: "A9-14", sel: '[data-el="el_kanmitable"] [data-cel="cel_tvline"]', color: LINE, note: "甘味処 縦の罫線 1px line" },
];
// A3-6 スクロール後のヘッダー（背景#FFF・文字#333・線#B0B0B0）／A3-7 /privacy は重ねない／A3-8 SPメニュー
export const INTERACTIVE = [
  { kind: "scrollcolor", id: "A3-6", note: "スクロール後：ヘッダー背景#FFF・ロゴ/ナビ#333", checks: { headerBg: "#FFFFFF", logo: D, nav: D } },
  { kind: "privacyheader", id: "A3-7", note: "/privacy はヘッダーを重ねない（背景#FFF・本体は下に）" },
  { kind: "spmenu", id: "A3-8", note: "SPメニューを開くと全面#222・項目20/56", bg: "#222222", size: 20, lh: 56 },
];
// A12-5/A12-6 CONTACT 背景の明るさ・コントラスト（スクリーンショットの画素）
export const SCREENSHOT = [
  { kind: "screenshotlum", id: "A12-5", sec: "sec_contact", refLum: 46.5, tol: 10, note: "CONTACT背景の明るさ 参照元46.5±10" },
  { kind: "screenshotcontrast", id: "A12-6", sec: "sec_contact", min: 4.5, note: "白文字と背景のコントラスト≥4.5" },
];

// ---- A3-2 ヘッダーの高さ（box に追加）----
export const HEADERH = [
  { kind: "box", id: "A3-2", dev: "pc", target: "sec_header", x: null, y: null, w: null, h: 88, hOnly: true },
  { kind: "box", id: "A3-2", dev: "sp", target: "sec_header", x: null, y: null, w: null, h: 80, hOnly: true },
];

// ---- 自動照合できない行（手動。理由つき）----
// fix02 §3：13件すべて自動化した（手動は 0）。以後、真に自動化できない行が出たらここに理由つきで残す。
export const MANUAL = [];

export const FAMILIES = { MIN, GOT };
