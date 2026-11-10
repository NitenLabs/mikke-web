#!/usr/bin/env node
// wa-20：描画エンジンに無いものを dist/<店> に足す（文節での折り返し・アーチ形の写真・2px の枠の説明の箱・品の行の罫線・ボタンの枠線・地図の埋め込み・タブレットの配置）。
// node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = process.argv[2] || "popura";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const BG = "#F3E9D2", NAVY = "#1F2E4A", RED = "#A3282B", GOLD = "#B8964F", RDARK = "#861F22", HOV = "#E8DCC0", NHOV = "#2B3D5F";
const E = site.elements;
const pos = (sel, rules) => `${sel}{${rules}}`;
const css = `<style>
html{scroll-padding-top:8rem}
.lb{word-break:auto-phrase}
[data-el=fv_ph]{border-radius:27rem 27rem 0 0}
@media (max-width:${BP - 0.02}px){[data-el=fv_ph]{border-radius:17.5rem 17.5rem 0 0}}
[data-cel^=s][data-cel$=_bx]{box-shadow:inset 0 0 0 2px ${NAVY}}
[data-cel^=m][data-cel$=_bx]{box-shadow:inset 0 0 0 2px ${GOLD}}
[data-el^=mn_r] .rep-card{border-top:1px solid ${GOLD};border-bottom:1px solid ${GOLD}}
[data-el=in_map_b]{box-shadow:inset 0 0 0 2px ${BG}}
[data-sec=sec_info]:has([data-el=in_tel_t]:hover) [data-el=in_tel_b]{background:${HOV}!important}
[data-sec=sec_info]:has([data-el=in_map_t]:hover) [data-el=in_map_b]{background:${RDARK}!important}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:100%;border:0;display:block;filter:saturate(.85)}
.el-nav .nav-menu a{color:${NAVY}!important}
.el-nav .nav-menu{background:${BG}}
.nav-sp summary{color:${NAVY}}
[data-cel$=_ds],[data-el^=st_p],[data-el=sg_p],[data-el=mn_p]{text-wrap:pretty}
</style>`;

// ---- タブレット（768〜1024）：スマホのデータを広げ、段ごとに PC に近い列へ組み直す
const L = "6%", W = "88%", CR = "52%", CW = "42%";
const rows = (ids, rules) => ids.map((i) => pos(`[data-el="${i}"]`, rules)).join("");
// 三つの定番：一皿ずつ、写真と枠の箱を左右に（二皿目は左右を入れ替える）。カードの高さ 30rem
const ST = 22, SH = 30, SG = 4;
let sg = "";
[0, 1, 2].forEach((i) => {
  const top = ST + i * (SH + SG), flip = i === 1, p = `s${i}`;
  const phL = flip ? "48%" : "0%", bxL = flip ? "0%" : "56%", inL = flip ? "4%" : "60%";
  sg += pos(`[data-el="sg_c${i}"]`, `left:${L};width:${W};top:${top}rem;height:${SH}rem`);
  sg += pos(`[data-el="sg_c${i}"] .rep-card`, `width:100%!important;height:${SH}rem!important`);
  sg += pos(`[data-cel=${p}_ph]`, `left:${phL}!important;width:52%!important;top:0!important;height:${SH}rem!important`);
  sg += pos(`[data-cel=${p}_bx]`, `left:${bxL}!important;width:44%!important;top:2rem!important;height:${SH - 4}rem!important`);
  sg += pos(`[data-cel=${p}_nm]`, `left:${inL}!important;width:38%!important;top:4.6rem!important;font-size:2rem!important;letter-spacing:0!important`);
  sg += pos(`[data-cel=${p}_pr]`, `left:${inL}!important;width:36%!important;top:10rem!important`);
  sg += pos(`[data-cel=${p}_ds]`, `left:${inL}!important;width:36%!important;top:14rem!important`);
  sg += pos(`[data-cel=${p}_tg],[data-cel=${p}_tt]`, `left:${phL}!important;width:9.6rem!important`);
});
const sigEnd = ST + 3 * SH + 2 * SG;
// お品書き：三列。写真はカードの幅の正方形（コンテナの単位 cqw）。箱は写真の下
const three = ["6%", "36%", "66%"], TW = "28%", MT = 20, MB = 24;
let mn = "";
[0, 1, 2].forEach((i) => {
  const p = `m${i}`;
  mn += pos(`[data-el="mn_c${i}"]`, `left:${three[i]};width:${TW};top:${MT}rem;height:calc(28vw + ${MB + 1.6}rem);container-type:inline-size`);
  mn += pos(`[data-el="mn_c${i}"] .rep-card`, `width:100%!important;height:calc(100cqw + ${MB + 1.6}rem)!important`);
  mn += pos(`[data-cel=${p}_ph]`, "height:100cqw!important");
  mn += pos(`[data-cel=${p}_bx]`, `top:calc(100cqw + 1.6rem)!important;height:${MB}rem!important`);
  mn += pos(`[data-cel=${p}_nm],[data-cel=${p}_pr],[data-cel=${p}_ds]`, "left:7%!important;width:86%!important");
  mn += pos(`[data-cel=${p}_nm]`, "top:calc(100cqw + 3.4rem)!important;font-size:1.7rem!important;letter-spacing:0!important");
  mn += pos(`[data-cel=${p}_pr]`, "top:calc(100cqw + 6.8rem)!important");
  mn += pos(`[data-cel=${p}_ds]`, "top:calc(100cqw + 10rem)!important;height:13rem!important");
});
let mr = "";
[0, 1].forEach((i) => { mr += pos(`[data-el="mn_r${i}"]`, `left:${L};width:${W};top:calc(${MT + MB + 1.6 + 4 + i * 7.2}rem + 28vw)`) + pos(`[data-el="mn_r${i}"] .rep-card`, "width:100%!important"); });
// ご案内の行（PC と同じく項目と中身を横に並べる）
const infoRows = Object.keys(E).filter((k) => /^in_l\d+$/.test(k)).length;
let iy = 15.4, info = "";
for (let i = 0; i < infoRows; i++) {
  const two = (E[`in_v${i}`].paragraphs || []).length > 1, h = two ? 9.2 : 6.4;
  info += pos(`[data-el=in_l${i}]`, `left:${L};width:88%;top:${iy}rem`) + pos(`[data-el=in_k${i}]`, `left:${L};width:14%;top:${iy + 2}rem`) + pos(`[data-el=in_v${i}]`, `left:21%;width:73%;top:${iy + 1.9}rem`);
  iy += h;
}
const btnTop = Math.round((iy + 3.6) * 10) / 10, mapTop = btnTop + 9.6;
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${pos("[data-sec=sec_firstv]", "min-height:66rem")}
${pos("[data-el=fv_ph]", "left:52%;width:42%;top:4rem;height:56rem")}
${pos("[data-el=fv_tag]", "left:49%;top:53rem;width:16rem")}${pos("[data-el=fv_tagt]", "left:49%;top:54rem;width:16rem")}
${pos("[data-el=fv_kick]", `left:${L};width:42%;top:8rem`)}
${pos("[data-el=fv_copy]", "left:5.8%;width:43%;top:11.4rem")}
${pos("[data-el=fv_en]", `left:${L};width:42%;top:23rem`)}
${pos("[data-el=fv_ent]", `left:${L};width:42%;top:27.2rem`)}
${pos("[data-el=fv_rule]", `left:${L};top:31rem`)}
${[0, 1, 2, 3].map((i) => pos(`[data-el=fv_k${i}]`, `left:${L};width:8%;top:${33.6 + i * 3.6}rem`) + pos(`[data-el=fv_v${i}]`, `left:15%;width:34%;top:${33.6 + i * 3.6}rem`)).join("")}
${pos("[data-sec=sec_signature]", `min-height:${sigEnd + 8}rem`)}
${rows(["sg_en", "sg_h"], `left:${L};width:${W}`)}
${pos("[data-el=sg_p]", `left:${L};width:${W};top:14.4rem`)}
${sg}
${pos("[data-sec=sec_menu]", `min-height:calc(${MT + MB + 1.6 + 4 + 20.2}rem + 28vw)`)}
${rows(["mn_en", "mn_h"], `left:${L};width:${W}`)}
${pos("[data-el=mn_p]", `left:${L};width:${W};top:14.4rem`)}
${mn}${mr}
${pos("[data-el=mn_note]", `left:${L};width:${W};top:calc(${MT + MB + 1.6 + 4 + 15.6}rem + 28vw)`)}
${pos("[data-sec=sec_story]", "min-height:65rem")}
${pos("[data-el=ab_ph]", `left:${CR};width:${CW};top:6rem;height:46rem`)}
${rows(["st_en"], `left:${L};width:${CW};top:6rem`)}
${rows(["st_year"], `left:5.5%;width:${CW};top:8.8rem`)}
${rows(["st_h"], `left:${L};width:${CW};top:21.2rem`)}
${rows(["st_p"], `left:${L};width:${CW};top:30.6rem`)}
${rows(["st_p2"], `left:${L};width:${CW};top:46.6rem`)}
${pos("[data-sec=sec_info]", `min-height:${mapTop + 44}rem`)}
${rows(["in_en", "in_h"], `left:${L};width:88%`)}
${info}
${pos("[data-el=in_tel_b],[data-el=in_tel_t]", `left:${L};width:30%`)}
${pos("[data-el=in_map_b],[data-el=in_map_t]", "left:38%;width:30%")}
${pos("[data-el=in_tel_b],[data-el=in_map_b]", `top:${btnTop}rem`)}
${pos("[data-el=in_tel_t],[data-el=in_map_t]", `top:${btnTop + 1.4}rem`)}
${pos("[data-el=in_mapbox]", `left:${L};width:88%;top:${mapTop}rem;height:38rem`)}
${pos("[data-sec=sec_footer]", "min-height:36rem")}
${rows(["ft_name", "ft_addr"], `left:${L};width:44%`)}
${[0, 1, 2, 3].map((i) => pos(`[data-el=ft_n${i}]`, `left:${L};width:40%;top:${14 + i * 3.2}rem`)).join("")}
${pos("[data-el=ft_hk],[data-el=ft_hv],[data-el=ft_tk],[data-el=ft_tv]", "left:52%;width:42%")}
${pos("[data-el=ft_hk]", "top:4.8rem")}
${pos("[data-el=ft_hv]", "top:7.2rem")}
${pos("[data-el=ft_tk]", "top:16.8rem")}
${pos("[data-el=ft_tv]", "top:19.2rem")}
${pos("[data-el=ft_copy]", `left:${L};width:88%;top:30.4rem`)}
}</style>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const mapQ = loc.geo ? `${loc.geo.lat},${loc.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&hl=ja`; // 緯度経度＋拡大率で Google の場所の札を出さない（G020）
const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="in_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("in_mapbox が見つかりません");
h = h.replace(re, `$1${map}`).replace("</head>", css + "</head>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h).replace("</head>", tablet + "</head>"));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa20-finish: 完了");
