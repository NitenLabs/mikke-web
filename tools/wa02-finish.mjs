#!/usr/bin/env node
// wa-02：描画エンジンに無い動きを dist/rian に足す（FV の重ねフェード・ギャラリーの送り・固定ヘッダーとタブ・紙の質感）。
// JavaScript が無くても配置は崩れない。node tools/build.mjs samples/rian の後に実行する。
import fs from "node:fs";
const OUT = "dist/rian";
const shop = JSON.parse(fs.readFileSync("samples/rian/shop.json", "utf8"));
const BP = 1008; // この幅未満はスマホの配置（タブレットで文字が小さくならないように）
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}${loc.street}`;
const icon = (d) => `<svg viewBox="0 0 24 24" fill="#333" aria-hidden="true"><path d="${d}"/></svg>`;
const L = "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z", R = "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z", PA = "M6 19h4V5H6v14zm8-14v14h4V5h-4z", PL = "M8 5v14l11-7z";
fs.copyFileSync("samples/rian/media/ast_texp.jpg", `${OUT}/assets/ast_texp.jpg`);
const css = `<style>
html{scroll-padding-top:9rem}
.site-header{position:fixed!important;left:0;right:0;top:0}
.site-header,[data-sec=sec_info],[data-sec=sec_access]{background-image:linear-gradient(rgba(245,246,239,.8),rgba(245,246,239,.8)),url(assets/ast_texp.jpg);background-size:auto,120rem}
[data-el=rv_pill]{background:transparent!important}
.rep-head{background:#000;width:auto!important;padding:0 1rem;white-space:nowrap}
[data-el=ac_mapbox]{overflow:hidden}
[data-el=ac_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block}
[data-el=mn_acc]{height:auto!important;background:transparent!important}
.wa02-acc{margin-bottom:1.6rem}
.wa02-acc summary{display:inline-flex;align-items:center;gap:1rem;background:#000;color:#fff;font-family:var(--f-heading);font-size:1.8rem;line-height:2.92rem;padding:0 1rem;cursor:pointer;list-style:none}
.wa02-acc summary::-webkit-details-marker{display:none}
.wa02-acc summary::after{content:"＋";font-size:1.4rem}
.wa02-acc[open] summary::after{content:"−"}
.wa02-acc summary:focus-visible{outline:2px solid #000;outline-offset:2px}
.wa02-row{display:flex;justify-content:space-between;height:3.92rem;padding-top:.45rem;border-bottom:1px solid #C8C8C8;font-size:1.6rem;line-height:2.24rem;box-sizing:border-box;color:#000}
.wa02-rows{margin-top:.8rem}
@media (max-width:767.98px){.wa02-acc summary{font-size:1.6rem;line-height:2.64rem}.wa02-row{height:3.66rem;font-size:1.4rem;line-height:1.96rem}}
[data-el=fv_2],[data-el=fv_3]{opacity:0}
[data-el=fv_2]{animation:wa02b 18s linear infinite}
[data-el=fv_3]{animation:wa02c 18s linear infinite}
@keyframes wa02b{0%,30%{opacity:0;filter:blur(20px)}38%,63%{opacity:1;filter:blur(0)}71%,100%{opacity:0;filter:blur(20px)}}
@keyframes wa02c{0%,63%{opacity:0;filter:blur(20px)}71%,92%{opacity:1;filter:blur(0)}100%{opacity:0;filter:blur(20px)}}
[data-el^=gal_]{transform:translateX(calc(var(--g,0)*var(--step)));transition:transform .8s ease}
[data-el=gal_1]{--g:-3}[data-el=gal_2]{--g:-2}[data-el=gal_3]{--g:-1}[data-el=gal_5]{--g:1}[data-el=gal_6]{--g:2}[data-el=gal_7]{--g:3}
[data-sec=sec_gallery]{position:relative;overflow:hidden}
@media (min-width:768px){[data-el^=hd_b]{display:none}}
.wa02-btn{position:absolute;z-index:5;width:4rem;height:4rem;border:0;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.wa02-btn svg{width:2.4rem;height:2.4rem}
.nav-row{justify-content:flex-end;gap:0!important;height:100%;align-items:center}
.nav-row a{padding:0 2rem;letter-spacing:.08rem;border-left:1px solid #000;line-height:2rem}
.nav-row a:first-child{border-left:0}
.nav-sp summary{color:transparent!important;list-style:none;height:100%}
.nav-sp[open] summary{color:#fff!important}
.nav-menu a{color:#fff!important}
@media (min-width:768px){[data-el^=gal_]{--step:72rem}.wa02-btn{top:${shop.story ? 38 : 50}rem}.wa02-b1{left:44.1667%}.wa02-b2{left:48.6111%}.wa02-b3{left:53.0556%}[data-el=fv_tab]{position:fixed;top:auto!important;bottom:0}[data-el=fv_tabt]{position:fixed;top:auto!important;bottom:2.2rem}}
@media (max-width:767.98px){[data-el^=gal_]{--step:35.1rem}.wa02-btn{top:${shop.story ? 22 : 32}rem}.wa02-b1{left:28.4615%}.wa02-b2{left:44.8718%}.wa02-b3{left:61.2821%}[data-el=fv_tab]{position:fixed;top:auto!important;bottom:0}[data-el=fv_tabt]{position:fixed;top:auto!important;bottom:1.7rem}}
@media (prefers-reduced-motion:reduce){[data-el=fv_2],[data-el=fv_3]{animation:none}[data-el^=gal_]{transition:none}}
</style>`;
const btns = `<button type="button" class="wa02-btn wa02-b1" data-g="prev" aria-label="前の写真">${icon(L)}</button><button type="button" class="wa02-btn wa02-b2" data-g="toggle" aria-label="一時停止">${icon(PA)}</button><button type="button" class="wa02-btn wa02-b3" data-g="next" aria-label="次の写真">${icon(R)}</button>`;
const js = `<script>(function(){var A=document.querySelector('[data-el="mn_acc"]');if(A){var Z=A.closest('[data-sec]'),F=function(){Z.style.minHeight='';var f=parseFloat(getComputedStyle(document.documentElement).fontSize),pad=(innerWidth<768?10:12)*f,n=A.getBoundingClientRect().bottom-Z.getBoundingClientRect().top+pad;if(n>Z.offsetHeight)Z.style.minHeight=n+'px';};A.addEventListener('toggle',F,true);addEventListener('resize',F);}})();(function(){var n=7,c=0,t=null,E=[];for(var i=1;i<=n;i++)E.push(document.querySelector('[data-el="gal_'+i+'"]'));if(!E[0])return;
function S(d){var o=c;c=(c+d+n)%n;E.forEach(function(e,i){var b=i-3,s=((b-c+3)%n+n)%n-3,p=((b-o+3)%n+n)%n-3;e.style.transition=Math.abs(s-p)>1?'none':'';e.style.setProperty("--g",s);});}
var R=matchMedia('(prefers-reduced-motion: reduce)').matches,B=document.querySelector('[data-g=toggle]');
function run(){t=setInterval(function(){S(1)},5000);B.innerHTML=${JSON.stringify(icon(PA))};B.setAttribute('aria-label','一時停止');}
function stop(){clearInterval(t);t=null;B.innerHTML=${JSON.stringify(icon(PL))};B.setAttribute('aria-label','再生');}
document.querySelector('[data-g=prev]').onclick=function(){S(-1)};document.querySelector('[data-g=next]').onclick=function(){S(1)};B.onclick=function(){t?stop():run()};if(R)stop();else run();})();</script>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const g = h.search(/<section[^>]*data-sec="sec_gallery"/), end = h.indexOf("</section>", g); // CSS の中の同じ文字列に当たらないよう <section> で探す
if (g < 0 || end < 0) throw new Error("ギャラリーのセクションが見つかりません");
const box = h.lastIndexOf("</div>", end); // ボタンは cbox の中に置き、写真と一緒に中央へ
h = h.slice(0, box) + btns + h.slice(box);
const map = `<iframe title="${shop.basic.name}の地図" src="https://www.google.com/maps?q=${encodeURIComponent(`${addr} ${shop.basic.name}`)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
h = h.replace(/(<div data-el="ac_mapbox"[^>]*>)/, `$1${map}`);
const E = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cat = shop.catalog, yen = (p) => (p.type === "tbd" ? "—" : `${p.amount.toLocaleString("en-US")}円`);
const acc = ["cat_ippin", "cat_chige", "cat_soup", "cat_salad", "cat_kimchi", "cat_gohan"].map((id) => {
  const rows = Object.values(cat.placements).filter((p) => p.categoryId === id).sort((a, b) => a.order - b.order).map((p) => { const it = cat.items[p.itemId]; return `<div class="wa02-row"><span>${E(it.name)}</span><span>${yen(it.prices[0])}</span></div>`; }).join("");
  return `<details class="wa02-acc"><summary>${E(cat.categories[id].name)}</summary><div class="wa02-rows">${rows}</div></details>`;
}).join("");
h = h.replace(/(<div data-el="mn_acc"[^>]*>)/, `$1${acc}`);

h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa02-finish: 完了");
