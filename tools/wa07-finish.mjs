#!/usr/bin/env node
// wa-07：描画エンジンに無いものを dist/<店> に足す（写真の上の覆い・欧文の斜体・ボタンの枠線・地図の埋め込み・タブレットの配置）。
// node tools/build.mjs samples/<店> の後に実行する。JavaScript が無くても配置は崩れない。
import fs from "node:fs";
const ID = process.argv[2] || "shirahae";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const BP = 1025; // 1024 は PC の配置だと文字が縮むのでタブレット側に入れる（wa-05 と同じ）
const TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const G = "#1F3A2E", CR = "#F3ECDF", BRASS = "#A8874E";
const css = `<style>
html{scroll-padding-top:9rem}
[data-el=fv_sc]{opacity:.42}
[data-el=fv_en],[data-el$=_en],[data-cel=c_pr]{font-style:italic}
[data-el=ab_en],[data-el=fv_en]{font-style:italic}
[data-el=in_tel_b],[data-el=in_map_b]{background:transparent!important;border:1px solid ${BRASS};box-sizing:border-box}
[data-el=in_tel_b]:hover,[data-el=in_map_b]:hover{background:rgba(168,135,78,.18)!important}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block;filter:grayscale(1) contrast(.95)}
.el-nav .nav-row a{font-style:italic;letter-spacing:.04rem;font-weight:400}
.el-nav .nav-menu a{font-family:var(--nav-font,serif);font-style:italic;color:${CR}!important}
.el-nav .nav-menu{background:${G}}
.nav-sp summary{color:${CR}}
[data-cel=c_nm]{word-break:keep-all}
</style>`;
// タブレット（768〜1024）：sp のデータを画面幅いっぱいに広げ、段ごとの配置だけ上書きする
const pos = (sel, rules) => `${sel}{${rules}}`;
const L = "3.846%"; // sp の左余白の比率
const ids = Object.keys(shop.catalog.placements);
const cards = ids.map((id, i) => { const c = i % 4, y = i < 4 ? 0 : 1; return pos(`[data-el="mn_cards"] [data-card="${id}"]`, `left:calc(${c} * (100% + 1.6rem) / 4);top:${y * 35}rem;width:calc((100% - 4.8rem) / 4)`); }).join("");
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${pos("[data-sec=sec_about]", "min-height:48rem")}
${pos("[data-el=ab_ln]", "top:46rem")}
${pos("[data-sec=sec_menu]", "min-height:92rem")}
${pos('[data-el="mn_cards"]', "height:70rem;top:13.6rem")}
${cards}
${pos("[data-el=mn_note]", "top:86rem")}
${pos("[data-sec=sec_interior]", "min-height:120rem")}
${pos("[data-el=it_h]", `left:${L};width:44%;top:14.8rem`)}
${pos("[data-el=it_p]", `left:${L};width:44%;top:26rem;height:20rem`)}
${pos("[data-el=it_ph2]", `left:${L};width:44%;top:46rem;height:18rem`)}
${pos("[data-el=it_ph1]", "left:52.15%;width:44%;top:6rem;height:58rem")}
${pos("[data-el=it_ph3]", `left:${L};width:44%;top:66rem;height:18rem`)}
${pos("[data-el=it_p2]", "left:52.15%;width:44%;top:66rem;height:18rem")}
${pos("[data-el=it_bn]", "top:88rem;height:32rem")}
${pos("[data-sec=sec_info]", "min-height:73rem")}
${pos("[data-el^=in_l],[data-el^=in_k],[data-el^=in_v]", "width:44%")}
${pos("[data-el=in_tel_b],[data-el=in_tel_t]", `left:${L};width:22%`)}
${pos("[data-el=in_map_b],[data-el=in_map_t]", `left:calc(${L} + 22% + 1.6rem);width:22%`)}
${pos("[data-el=in_mapbox]", "left:52.15%;width:44%;top:15.8rem;height:50rem")}
${pos("[data-sec=sec_footer]", "min-height:34rem")}
${pos("[data-el=ft_name]", `left:${L};width:40%`)}
${pos("[data-el=ft_addr]", `left:${L};width:40%`)}
${pos("[data-el=ft_n0]", "left:50%;width:18%;top:5rem")}
${pos("[data-el=ft_n1]", "left:50%;width:18%;top:8.2rem")}
${pos("[data-el=ft_n2]", "left:50%;width:18%;top:11.4rem")}
${pos("[data-el=ft_n3]", "left:50%;width:18%;top:14.6rem")}
${pos("[data-el=ft_hk],[data-el=ft_hv]", "left:70%;width:27%")}
${pos("[data-el=ft_hk]", "top:5rem")}
${pos("[data-el=ft_hv]", "top:7.6rem")}
${pos("[data-el=ft_tk],[data-el=ft_tv]", "left:70%;width:27%")}
${pos("[data-el=ft_tk]", "top:15rem")}
${pos("[data-el=ft_tv]", "top:17.6rem")}
${pos("[data-el=ft_copy]", `left:${L};width:40%;top:27rem`)}
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
console.log("wa07-finish: 完了");
