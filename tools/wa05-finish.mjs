#!/usr/bin/env node
// wa-05：描画エンジンに無いものを dist/sumi に足す（写真の帯の流れ・地図の埋め込み・右上のメニューのボタン・ボタンの枠線）。
// JavaScript が無くても配置は崩れない。node tools/build.mjs samples/sumi の後に実行する。
import fs from "node:fs";
const OUT = "dist/sumi";
const shop = JSON.parse(fs.readFileSync("samples/sumi/shop.json", "utf8"));
const BP = 1025; // この幅未満は sp のデータで組む（768 以上はその上で下のタブレットの配置に置き換える）。1024 は PC の配置だと本文が約 10px に縮むのでタブレット側に入れる
const TAB = 768; // タブレットの配置の下限
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const N = 5;
const css = `<style>
html{scroll-padding-top:2rem}
[data-sec=sec_cuisine]{position:relative;overflow:hidden}
[data-el^=st_]{transform:translateX(calc(var(--i)*var(--step)));animation:wa05s var(--dur) linear infinite}
${Array.from({ length: N }, (_, i) => `[data-el=st_${i + 1}]{--i:${i}}`).join("")}
@keyframes wa05s{from{transform:translateX(calc(var(--i)*var(--step)))}to{transform:translateX(calc((var(--i) - ${N})*var(--step)))}}
[data-clone]{animation:wa05s var(--dur) linear infinite;position:absolute}
[data-el=fv_tel_t],[data-el=in_tel_t]{pointer-events:none}
[data-el=in_v7] a,[data-el=ft_tv] a{color:inherit;text-decoration:none}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block;filter:grayscale(1)}
[data-el$=_btn_b],[data-el=fv_tel_b],[data-el=in_tel_b]{border:1px solid #1F1E1C;border-radius:30px;box-sizing:border-box;background:transparent!important}
.site-header.overlay,.site-header.overlay.scrolled{background:transparent;margin-bottom:-4.8rem;pointer-events:none}
.site-header .el-nav{pointer-events:auto}
.el-nav .nav-row{display:none!important}
.el-nav .nav-sp{display:block!important}
.el-nav .nav-sp summary{width:4.8rem;height:4.8rem;line-height:4.8rem;text-align:center;background:#F4F0E8;color:#1F1E1C!important;font-size:2rem}
.el-nav .nav-sp[open] summary{top:0;right:1.6rem;background:transparent;color:#F4F0E8!important}
.el-nav .nav-menu{background:#1F1E1C}
.el-nav .nav-menu a{color:#F4F0E8!important;font-family:var(--f-body)}
[data-el=gr_p] .pg+.pg{margin-top:2.8rem}
@media (min-width:768px){.el-nav .nav-sp summary{transition:opacity .25s}html.wa05-fv .el-nav .nav-sp:not([open]) summary{opacity:0;visibility:hidden}[data-sec=sec_cuisine]::before,[data-sec=sec_cuisine]::after{content:"";position:absolute;top:64rem;width:16rem;height:40rem;z-index:3;pointer-events:none}[data-sec=sec_cuisine]::before{left:0;background:linear-gradient(90deg,#F4F0E8,rgba(244,240,232,0))}[data-sec=sec_cuisine]::after{right:0;background:linear-gradient(270deg,#F4F0E8,rgba(244,240,232,0))}}
@media (min-width:768px){[data-el^=st_],[data-clone]{--step:44rem;--dur:110s}[data-clone]{left:0;top:64rem;width:27.778%;height:40rem;z-index:2}}
@media (max-width:767.98px){[data-el^=st_],[data-clone]{--step:35rem;--dur:88s}[data-clone]{left:0;top:76rem;width:79.487%;height:31rem;z-index:2}}
@media (prefers-reduced-motion:reduce){[data-el^=st_]{animation:none}}
</style>`;
// 続けて流すために、写真の帯を JavaScript で1周分増やす。動きを減らす設定の人には増やさない
const js = `<script>(function(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(var i=1;i<=${N};i++){var e=document.querySelector('[data-el="st_'+i+'"]');if(!e)continue;var c=e.cloneNode(true);c.removeAttribute('data-el');c.setAttribute('data-clone','');c.setAttribute('aria-hidden','true');c.querySelectorAll('img').forEach(function(m){m.alt=''});c.style.setProperty('--i',${N}+i-1);e.parentNode.appendChild(c);}})();(function(){var d=document.documentElement,t=document.querySelector('[data-el="fv_tel_b"]');if(!t)return;function u(){d.classList.toggle("wa05-fv",t.getBoundingClientRect().bottom>0)}u();addEventListener("scroll",u,{passive:true});addEventListener("resize",u);})();</script>`;
// タブレット（768〜1024）：sp のデータを画面幅いっぱいの入れ物に広げ（本文の列は sp の左右余白の比率のまま約 80%）、段ごとの配置だけ上書きする。
// 高さの補正（build の correct）は sp の折り返し前提でずれるので止める。帯の写真だけは transform で動くので除く
const pos = (sel, rules) => `${sel}{${rules}}`;
const L = "10.256%"; // sp の左余白の比率
const fnav = Array.from({ length: 5 }, (_, i) => pos(`[data-el=ft_n${i}]`, `left:40%;width:18%;top:${6 + 3.6 * i}rem`)).join("");
const cards = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => pos(`[data-el="sn_cards"] [data-card="plc_s00${i + 1}"]`, `left:${x ? "calc(50% + 2rem)" : "0"};top:${y * 48}rem;width:calc(50% - 2rem)`)).join("");
const tablet = `<style>@media (max-width:767.98px){[data-el=gr_p]{text-align:left!important}}@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el:not([data-el^=st_]):not([data-clone]){transform:none!important}
${pos("[data-el=hd_nav]", "left:auto;right:1.6rem;width:4.8rem")}
${pos("[data-el=fv_name]", "font-size:3.2rem;top:10.4rem")}
${pos("[data-el=fv_tel_b],[data-el=fv_tel_t]", "left:calc(50% - 7.6rem);width:15.2rem")}
${pos("[data-sec=sec_greeting]", "min-height:96rem")}
${pos("[data-sec=sec_cuisine]", "min-height:90rem")}
${pos("[data-el=cu_btn_b]", `left:${L};width:16rem;top:30rem`)}
${pos("[data-el=cu_btn_t]", `left:${L};width:16rem;top:31.2rem`)}
${pos("[data-el=cu_v1]", "left:80%;top:28rem")}
${pos("[data-el=cu_v2]", "left:72%;top:28rem")}
${pos("[data-el^=st_],[data-clone]", "left:0;top:50rem;width:40rem;height:40rem;--step:44rem;--dur:110s")}
${pos("[data-sec=sec_seasonal]", "min-height:122rem")}
${pos("[data-el=sn_band]", "height:122rem")}
${pos('[data-el="sn_cards"]', "height:92rem")}
${cards}
${pos("[data-sec=sec_seats]", "min-height:103rem")}
${pos("[data-el=se_ph1]", `left:${L};width:44%;top:26rem;height:29rem`)}
${pos("[data-el=se_h1]", "left:57.256%;width:32.488%;top:26rem")}
${pos("[data-el=se_p1]", "left:57.256%;width:32.488%;top:34rem")}
${pos("[data-el=se_h2]", `left:${L};width:32.488%;top:62rem`)}
${pos("[data-el=se_p2]", `left:${L};width:32.488%;top:70rem`)}
${pos("[data-el=se_ph2]", "left:45.744%;width:44%;top:62rem;height:29rem")}
${pos("[data-el=in_tel_b],[data-el=in_tel_t]", `left:${L};width:20rem`)}
${pos("[data-sec=sec_footer]", "min-height:33rem")}
${pos("[data-el=ft_card]", "left:0;width:100%;top:0;height:33rem")}
${pos("[data-el=ft_name]", `left:${L};width:26%;top:6rem`)}
${pos("[data-el=ft_addr]", `left:${L};width:26%;top:11rem`)}
${pos("[data-el=ft_copy]", `left:${L};width:26%;top:26rem`)}
${fnav}
${pos("[data-el=ft_hh]", "left:60%;width:29.744%;top:6rem")}
${pos("[data-el=ft_hv]", "left:60%;width:29.744%;top:9rem")}
${pos("[data-el=ft_th]", "left:60%;width:29.744%;top:20.5rem")}
${pos("[data-el=ft_tv]", "left:60%;width:29.744%;top:23.5rem")}
}</style>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="in_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("in_mapbox が見つかりません");
h = h.replace(re, `$1${map}`);
h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h).replace("</head>", tablet + "</head>")); // bp の置き換えの後に足す（768 の下限を巻き込まないため）
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa05-finish: 完了");
