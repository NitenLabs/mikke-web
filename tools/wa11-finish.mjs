#!/usr/bin/env node
// wa-11：描画エンジンに無いものを dist/<店> に足す（アーチの写真・弧の帯・3＋2 の並び・ボタンのホバー・地図の埋め込み・文字のリンク・タブレットの配置）。
// node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = process.argv[2] || "luneclaire";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const INK = "#3B2F33", RO = "#9C4F5A", LN = "#C8A97E", SOFT = "#E8DCD6", WH = "#FFFFFF";
const placed = (menu) => Object.keys(shop.catalog.placements).filter((p) => shop.catalog.placements[p].menuId === menu);
const cakes = placed("mnu_cake");
const pos = (sel, rules) => `${sel}{${rules}}`;
const card = (id) => `[data-el="ck_cards"] .rep-card[data-card="${id}"]`;
const W3 = 30.769, ROW2 = [15.385, 50];
const css = `<style>
html{scroll-padding-top:8rem}
[data-el=fv_ph],[data-el=ab_ph]{border-radius:999px 999px 0 0;overflow:hidden}
[data-sec=sec_cake]{border-radius:50% 50% 0 0/12rem 12rem 0 0}
[data-el=fv_copy],[data-el=fv_name],[data-el=fv_ja]{white-space:normal}
[data-el=in_map_b]{box-shadow:inset 0 0 0 1px ${LN}}
[data-el=in_tel_b]:hover{background:${RO}!important}
[data-el=in_map_b]:hover{background:#F6E7E4!important}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block;filter:saturate(.75) sepia(.1)}
.el-nav .nav-menu a{color:${WH}!important}
.el-nav .nav-menu{background:${INK}}
.nav-sp summary{color:${INK}}
[data-cel=c_nm],[data-cel=b_nm]{word-break:keep-all}
[data-cel=c_ds],[data-cel=b_ds],[data-el=ab_p] .pg,[data-el=ei_p] .pg{text-wrap:pretty}
@media (min-width:${BP}px){${cakes.length === 5 ? cakes.slice(3).map((id, i) => pos(card(id), `left:${ROW2[i]}%!important`)).join("") : ""}}
@media (max-width:767.98px){
[data-sec=sec_cake]{border-radius:50% 50% 0 0/5rem 5rem 0 0}
[data-el=fv_ja],[data-el=fv_name],[data-el=fv_copy]{text-align:center}
}
</style>`;
const L = "6%", TW = "46%", R = "58%", RW = "36%";
const C3 = [0, 34.33, 68.67], C2R = [17.17, 51.5];
const CH3 = 40.4, cardsH = 2 * CH3 + 4;
const cardsPos = cakes.map((id, i) => pos(card(id), `left:${i < 3 ? C3[i] : C2R[i - 3]}%!important;top:${i < 3 ? 0 : CH3 + 4}rem!important;width:31.33%!important;height:${CH3}rem!important`)).join("");
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${pos("[data-sec=sec_firstv]", "min-height:64rem")}
${pos("[data-el=fv_ph]", "left:6%;width:44%;top:4rem;height:56rem")}
${pos("[data-el=fv_ja]", "left:56%;width:38%;top:9rem;text-align:left")}
${pos("[data-el=fv_name]", "left:56%;width:38%;top:12rem;text-align:left")}
${pos("[data-el=fv_copy]", "left:56%;width:38%;top:21rem;text-align:left")}
${pos("[data-el=fv_line]", "left:56%;width:4rem;top:30rem")}
${[0, 1, 2].map((i) => pos(`[data-el=fv_k${i}]`, `left:56%;width:38%;top:${[33, 39.6, 48.4][i]}rem`) + pos(`[data-el=fv_v${i}]`, `left:56%;width:38%;top:${[35.4, 42, 50.8][i]}rem;height:${i === 1 ? 4.4 : 2.2}rem`)).join("")}
${pos("[data-sec=sec_about]", "min-height:60rem")}
${pos("[data-el=ab_en],[data-el=ab_ja],[data-el=ab_h],[data-el=ab_p]", `left:${L};width:${TW}`)}
${pos("[data-el=ab_p]", "top:24rem;height:26rem")}
${pos("[data-el=ab_ph]", `left:${R};width:${RW};top:6rem;height:48rem`)}
${pos("[data-sec=sec_cake]", `min-height:${19.6 + cardsH + 11}rem;border-radius:50% 50% 0 0/8rem 8rem 0 0`)}
${pos("[data-el=ck_en],[data-el=ck_ja]", "left:6%;width:88%")}
${pos('[data-el="ck_cards"]', `left:6%;width:88%;height:${cardsH}rem`)}
${cardsPos}
${pos("[data-cel=c_ph]", "height:28rem!important")}
${pos("[data-cel=c_nm],[data-cel=c_pr]", "top:29rem!important")}
${pos("[data-cel=c_nm]", "font-size:1.4rem!important;line-height:2rem!important;height:4rem!important;width:68%!important")}
${pos("[data-cel=c_pr]", "font-size:1.7rem!important;left:68%!important;width:32%!important")}
${pos("[data-cel=c_ds]", "top:33.4rem!important;font-size:1.2rem!important")}
${pos("[data-el=ck_note]", `left:6%;width:88%;top:${19.6 + cardsH + 2.4}rem`)}
${pos("[data-sec=sec_baked]", "min-height:76rem")}
${pos("[data-el=bk_en],[data-el=bk_ja],[data-el=bk_p],[data-el=bk_note]", "left:6%;width:88%")}
${pos('[data-el="bk_cards"]', "left:6%;width:88%;height:44rem")}
${placed("mnu_baked").map((id, i) => pos(`[data-el="bk_cards"] .rep-card[data-card="${id}"]`, `left:${i * 52}%!important;top:0!important;width:48%!important;height:44rem!important`)).join("")}
${pos("[data-cel=b_ph]", "height:32rem!important")}
${pos("[data-cel=b_nm],[data-cel=b_pr]", "top:33.2rem!important")}
${pos("[data-cel=b_ds]", "top:36.4rem!important")}
${pos("[data-sec=sec_salon]", "min-height:56rem")}
${pos("[data-el=ei_ph]", "height:28rem")}
${pos("[data-el=ei_panel]", "top:28rem;height:28rem")}
${pos("[data-el=ei_en]", "left:6%;width:88%;top:32rem")}
${pos("[data-el=ei_ja]", "left:6%;width:88%;top:36.8rem")}
${pos("[data-el=ei_p]", "left:6%;width:88%;top:40.4rem;height:18rem")}
${pos("[data-sec=sec_info]", "min-height:64rem")}
${pos("[data-el^=in_l],[data-el^=in_k],[data-el^=in_v]", `left:${L};width:44%`)}
${pos("[data-el=in_en],[data-el=in_ja]", `left:${L};width:44%`)}
${pos("[data-el=in_tel_b],[data-el=in_tel_t]", `left:${L};width:21%`)}
${pos("[data-el=in_map_b],[data-el=in_map_t]", `left:29%;width:21%`)}
${pos("[data-el=in_mapbox]", `left:${"54%"};width:40%;top:13rem;height:44rem`)}
${pos("[data-sec=sec_footer]", "min-height:36rem")}
${pos("[data-el=ft_name],[data-el=ft_addr]", `left:${L};width:36%`)}
${pos("[data-el=ft_name]", "top:5rem")}
${pos("[data-el=ft_addr]", "top:9.6rem")}
${[0, 1, 2, 3, 4].map((i) => pos(`[data-el=ft_n${i}]`, `left:44%;width:20%;top:${5 + i * 3.4}rem`)).join("")}
${pos("[data-el=ft_hk],[data-el=ft_hv],[data-el=ft_tk],[data-el=ft_tv]", "left:66%;width:30%")}
${pos("[data-el=ft_hk]", "top:5rem")}
${pos("[data-el=ft_hv]", "top:7.6rem;height:7.8rem")}
${pos("[data-el=ft_tk]", "top:16.8rem")}
${pos("[data-el=ft_tv]", "top:19.4rem")}
${pos("[data-el=ft_copy]", `left:${L};width:42%;top:30rem`)}
}</style>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="in_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("in_mapbox が見つかりません");
h = h.replace(re, `$1${map}`).replace("</head>", css + "</head>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h).replace("</head>", tablet + "</head>"));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa11-finish: 完了");
