#!/usr/bin/env node
// wa-08：描画エンジンに無いものを dist/<店> に足す（行の罫線・ボタンのホバー・地図の埋め込み・タブレットの配置）。
// node tools/build.mjs samples/<店> の後に実行する。JavaScript が無くても配置は崩れない。
import fs from "node:fs";
const ID = process.argv[2] || "tide";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const BP = 1025; // 1024 は PC の配置だと文字が縮むのでタブレット側に入れる（wa-05・wa-07 と同じ）
const TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const INK = "#1C1C1C", SOFT = "#D9D9D6";
const css = `<style>
html{scroll-padding-top:8rem}
[data-el=mn_rows] .rep-card{border-top:1px solid ${SOFT};box-sizing:border-box}
[data-el=in_tel_b]:hover,[data-el=in_map_b]:hover{background:#4A6A7A!important}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block;filter:grayscale(1) contrast(.95)}
.el-nav .nav-row a{font-weight:600;letter-spacing:.02rem}
.el-nav .nav-menu a{color:#fff!important}
.el-nav .nav-menu{background:${INK}}
.nav-sp summary{color:${INK}}
[data-cel=c_nm],[data-cel=r_nm]{word-break:keep-all}
[data-el=fv_tide]{font-weight:800}
@media (min-width:1025px){[data-el=fv_tide]{font-size:28rem;line-height:28rem}}
@media (max-width:767.98px){[data-el=fv_tide]{font-size:16rem;line-height:16rem}}
</style>`;
// タブレット（768〜1024）：sp のデータを画面幅いっぱいに広げ、段ごとの配置だけ上書きする
const pos = (sel, rules) => `${sel}{${rules}}`;
const L = "3.846%"; // sp の左余白の比率
const place = Object.keys(shop.catalog.placements);
const cards = place.slice(0, 4).map((id, i) => pos(`[data-el="mn_cards"] [data-card="${id}"]`, `left:calc(${i} * (100% + 1.5rem) / 4);top:0;width:calc((100% - 4.5rem) / 4)`)).join("");
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${pos("[data-sec=sec_firstv]", "min-height:66rem")}
${pos("[data-el=fv_ph]", "left:50%;width:50%;top:0;height:66rem")}
${pos("[data-el=fv_tide]", `left:${L};width:46%;top:7rem;height:14rem;font-size:14rem;line-height:14rem`)}
${pos("[data-el=fv_copy]", `left:${L};width:44%;top:26rem;height:7rem;font-size:2rem;line-height:3.4rem`)}
${[0, 1, 2].map((i) => pos(`[data-el=fv_k${i}]`, `left:${L};width:7.5rem;top:${40 + i * 4}rem`) + pos(`[data-el=fv_v${i}]`, `left:calc(${L} + 8rem);width:33%;top:${40 + i * 4}rem`)).join("")}
${pos("[data-sec=sec_about]", "min-height:58.5rem")}
${pos("[data-el=ab_h]", `left:${L};width:44%;top:13.5rem`)}
${pos("[data-el=ab_p]", `left:${L};width:44%;top:25.5rem;height:27rem`)}
${pos("[data-el=ab_ph]", "left:50%;width:50%;top:13.5rem;height:39rem")}
${pos("[data-sec=sec_menu]", "min-height:91rem")}
${pos('[data-el="mn_cards"]', "height:33rem;top:10rem")}
${pos('[data-el="mn_rows"] .rep-card', "width:100%!important;left:0!important")}
${cards}
${pos('[data-el="mn_rows"]', "top:46rem")}
${pos("[data-el=mn_note]", "top:85.4rem")}
${pos("[data-sec=sec_stand]", "min-height:80rem")}
${pos("[data-el=st_ph1]", `left:${L};width:60%;top:13rem;height:30rem`)}
${pos("[data-el=st_ph2]", "left:66%;width:34%;top:13rem;height:30rem")}
${pos("[data-el=st_p]", `left:${L};width:70%;top:46rem;height:16rem`)}
${pos("[data-el=st_bn]", "top:64rem;height:16rem")}
${pos("[data-sec=sec_info]", "min-height:64rem")}
${pos("[data-el^=in_l],[data-el^=in_k],[data-el^=in_v]", "width:44%")}
${pos("[data-el=in_tel_b],[data-el=in_tel_t]", `left:${L};width:21%`)}
${pos("[data-el=in_map_b],[data-el=in_map_t]", `left:calc(${L} + 21% + 1.6rem);width:21%`)}
${pos("[data-el=in_mapbox]", "left:50%;width:50%;top:13rem;height:40rem")}
${pos("[data-sec=sec_footer]", "min-height:32rem")}
${pos("[data-el=ft_name],[data-el=ft_addr]", `left:${L};width:42%`)}
${[0, 1, 2, 3].map((i) => pos(`[data-el=ft_n${i}]`, `left:50%;width:18%;top:${5 + i * 3.2}rem`)).join("")}
${pos("[data-el=ft_hk],[data-el=ft_hv],[data-el=ft_tk],[data-el=ft_tv]", "left:70%;width:27%")}
${pos("[data-el=ft_hk]", "top:5rem")}
${pos("[data-el=ft_hv]", "top:7.6rem")}
${pos("[data-el=ft_tk]", "top:15rem")}
${pos("[data-el=ft_tv]", "top:17.6rem")}
${pos("[data-el=ft_copy]", `left:${L};width:42%;top:26rem`)}
}</style>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const mapQ = loc.geo ? `${loc.geo.lat},${loc.geo.lng}&z=16&hl=ja` : encodeURIComponent(addr); // 緯度経度＋拡大率なら Google の場所の札が出にくい
const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="in_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("in_mapbox が見つかりません");
// 大きな欧文は CSS で拡大しているので、組み上がりの伸びの基準（data-mh）も実寸に合わせ、下の要素を押し下げないようにする
const mh = /(<h1 data-el="fv_tide"[^>]*?)data-mh-pc="\d+" data-mh-sp="\d+"/;
if (!mh.test(h)) throw new Error("fv_tide の data-mh が見つかりません");
h = h.replace(mh, `$1data-mh-pc="331" data-mh-sp="190"`).replace(re, `$1${map}`).replace("</head>", css + "</head>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h).replace("</head>", tablet + "</head>"));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa08-finish: 完了");
