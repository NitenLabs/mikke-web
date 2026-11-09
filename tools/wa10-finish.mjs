#!/usr/bin/env node
// wa-10：描画エンジンに無いものを dist/<店> に足す（行の罫線・片側だけ丸い写真・ボタンのホバー・地図の埋め込み・文字のリンク・タブレットの配置）。
// node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = process.argv[2] || "mugitoakari";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const INK = "#3A2E26", SOFT = "#D9CDB6", OL = "#5F6548", CR = "#F5EFE4";
const css = `<style>
html{scroll-padding-top:8rem}
[data-el=br_rows] .rep-card,[data-el=cf_rows] .rep-card{border-top:1px solid ${SOFT};box-sizing:border-box}
[data-el=cf_rows] .rep-card{border-top-color:#CDBFA6}
[data-el=fv_ph]{border-radius:0 22rem 0 0;overflow:hidden}
[data-el=ab_ph],[data-el=cf_ph1],[data-el=cf_ph2],[data-cel=c_ph]{border-radius:1.2rem;overflow:hidden}
[data-el=in_tel_b]:hover,[data-el=in_map_b]:hover{background:${OL}!important}
[data-el=in_mapbox]{overflow:hidden;border-radius:1.2rem}
[data-el=in_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block;filter:sepia(.25) saturate(.8)}
.el-nav .nav-menu a{color:${CR}!important}
.el-nav .nav-menu{background:${INK}}
.nav-sp summary{color:${INK}}
[data-cel=c_nm],[data-cel=r_nm]{word-break:keep-all}
[data-el=ab_p] .pg,[data-el=cf_p] .pg{text-wrap:pretty}
@media (max-width:767.98px){[data-el=fv_ph]{border-radius:0 0 7rem 0}}
</style>`;
const pos = (sel, rules) => `${sel}{${rules}}`;
const L = "3.846%";
const R = "52%", RW = "44.154%";
const photoCards = Object.keys(shop.catalog.placements).filter((p) => { const pl = shop.catalog.placements[p]; return pl.menuId === "mnu_bread" && shop.catalog.items[pl.itemId].photos; });
const CH = 35.2, CG = 2, nR = Math.ceil(photoCards.length / 2), cardsH = nR * CH + (nR - 1) * CG;
const cards = photoCards.map((id, i) => pos(`[data-el="br_cards"] .rep-card[data-card="${id}"]`, `left:calc(${i % 2} * (50% + 1rem));top:${Math.floor(i / 2) * (CH + CG)}rem;width:calc((100% - 2rem) / 2)`)).join("");
const nRows = Object.values(shop.catalog.placements).filter((p) => p.menuId === "mnu_bread" && !shop.catalog.items[p.itemId].photos).length;
const yRow = 11.6 + cardsH + 2.4;
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${pos("[data-sec=sec_firstv]", "min-height:62rem")}
${pos("[data-el=fv_ph]", "left:0;width:60%;top:0;height:62rem;border-radius:0 16rem 0 0")}
${pos("[data-el=fv_name]", "left:64%;width:33%;top:5rem")}
${pos("[data-el=fv_en]", "left:64%;width:33%;top:9.6rem;height:3rem;line-height:3rem")}
${pos("[data-el=fv_copy]", "left:64%;width:33%;top:14.4rem;height:9rem")}
${[0, 1, 2].map((i) => pos(`[data-el=fv_k${i}]`, `left:64%;width:33%;top:${[26.4, 33, 42][i]}rem`) + pos(`[data-el=fv_v${i}]`, `left:64%;width:33%;top:${[28.8, 35.4, 44.4][i]}rem;height:${i === 1 ? 4.8 : 2.4}rem`)).join("")}
${pos("[data-sec=sec_about]", "min-height:58rem")}
${pos("[data-el=ab_ph]", `left:${L};width:44%;top:5rem;height:44rem`)}
${pos("[data-el=ab_en],[data-el=ab_ja],[data-el=ab_h],[data-el=ab_p]", `left:${R};width:${RW}`)}
${pos("[data-el=ab_h]", "top:12.8rem")}
${pos("[data-el=ab_p]", "top:22.8rem;height:30rem")}
${pos("[data-sec=sec_bread]", `min-height:${yRow + 8.4 * nRows + 9.2}rem`)}
${pos('[data-el="br_cards"]', `height:${cardsH}rem`)}
${cards}
${pos("[data-cel=c_nm]", "width:78%!important;font-size:1.5rem!important")}
${pos("[data-cel=c_pr]", "left:78%!important;width:22%!important")}
${pos('[data-el="br_rows"] .rep-card,[data-el="cf_rows"] .rep-card', "width:100%!important;left:0!important")}
${pos('[data-el="br_rows"]', `top:${yRow}rem`)}
${pos("[data-el=br_note]", `top:${yRow + 8.4 * nRows + 1}rem;height:2.2rem`)}
${pos("[data-sec=sec_band]", "min-height:30rem")}
${pos("[data-el=bn_ph]", "height:30rem")}
${pos("[data-sec=sec_cafe]", "min-height:72rem")}
${pos("[data-el=cf_en],[data-el=cf_ja],[data-el=cf_p],[data-el=cf_ph1]", `left:${L};width:44%`)}
${pos("[data-el=cf_p]", "top:12.4rem;height:14rem")}
${pos("[data-el=cf_ph1]", "top:28rem;height:30rem")}
${pos("[data-el=cf_ph2]", `left:${R};width:${RW};top:4.8rem;height:24rem`)}
${pos('[data-el="cf_rows"]', `left:${R};width:${RW};top:30rem`)}
${pos("[data-el=cf_note]", `left:${R};width:${RW};top:66.4rem`)}
${pos("[data-sec=sec_info]", "min-height:62rem")}
${pos("[data-el^=in_l],[data-el^=in_k],[data-el^=in_v]", "width:44%")}
${pos("[data-el=in_tel_b],[data-el=in_tel_t]", `left:${L};width:21%`)}
${pos("[data-el=in_map_b],[data-el=in_map_t]", `left:calc(${L} + 21% + 1.6rem);width:21%`)}
${pos("[data-el=in_mapbox]", `left:${R};width:${RW};top:13rem;height:42rem`)}
${pos("[data-sec=sec_footer]", "min-height:32rem")}
${pos("[data-el=ft_name],[data-el=ft_addr]", `left:${L};width:42%`)}
${[0, 1, 2, 3].map((i) => pos(`[data-el=ft_n${i}]`, `left:50%;width:18%;top:${5 + i * 3.2}rem`)).join("")}
${pos("[data-el=ft_hk],[data-el=ft_hv],[data-el=ft_tk],[data-el=ft_tv]", "left:70%;width:27%")}
${pos("[data-el=ft_hk]", "top:5rem")}
${pos("[data-el=ft_hv]", "top:7.6rem")}
${pos("[data-el=ft_tk]", "top:17rem")}
${pos("[data-el=ft_tv]", "top:19.6rem")}
${pos("[data-el=ft_copy]", `left:${L};width:42%;top:26rem`)}
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
console.log("wa10-finish: 完了");
