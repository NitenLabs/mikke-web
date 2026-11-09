#!/usr/bin/env node
// wa-02：描画エンジンに無い動きを dist/rian に足す（FV の重ねフェード・ギャラリーの送り・固定ヘッダーとタブ・紙の質感）。
// JavaScript が無くても配置は崩れない。node tools/build.mjs samples/rian の後に実行する。
import fs from "node:fs";
const OUT = "dist/rian";
const shop = JSON.parse(fs.readFileSync("samples/rian/shop.json", "utf8"));
const BP = 1008; // この幅未満はスマホの配置（タブレットで文字が小さくならないように）
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}${loc.street}`;
fs.copyFileSync("samples/rian/media/ast_texp.jpg", `${OUT}/assets/ast_texp.jpg`);
const css = `<style>
html{scroll-padding-top:9rem}
.site-header{position:fixed!important;left:0;right:0;top:0}
.site-header,[data-sec=sec_info],[data-sec=sec_access]{background-image:linear-gradient(rgba(245,246,239,.8),rgba(245,246,239,.8)),url(assets/ast_texp.jpg);background-size:auto,120rem}
[data-el=rv_pill]{background:transparent!important}
.rep-head{background:#000;width:auto!important;padding:0 1rem;white-space:nowrap}
[data-el=ac_mapbox]{overflow:hidden}
[data-el=ac_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block}
[data-el=fv_2],[data-el=fv_3]{opacity:0}
[data-el=fv_2]{animation:wa02b 18s linear infinite}
[data-el=fv_3]{animation:wa02c 18s linear infinite}
@keyframes wa02b{0%,30%{opacity:0;filter:blur(20px)}38%,63%{opacity:1;filter:blur(0)}71%,100%{opacity:0;filter:blur(20px)}}
@keyframes wa02c{0%,63%{opacity:0;filter:blur(20px)}71%,92%{opacity:1;filter:blur(0)}100%{opacity:0;filter:blur(20px)}}
[data-el^=gal_]{transform:translateX(calc(var(--g,0)*var(--step)));transition:transform .8s ease}
[data-el=gal_1]{--g:-3}[data-el=gal_2]{--g:-2}[data-el=gal_3]{--g:-1}[data-el=gal_5]{--g:1}[data-el=gal_6]{--g:2}[data-el=gal_7]{--g:3}
[data-sec=sec_gallery]{position:relative;overflow:hidden}
@media (min-width:768px){[data-el^=hd_b]{display:none}}
.nav-row{justify-content:flex-end;gap:0!important;height:100%;align-items:center}
.nav-row a{padding:0 2rem;letter-spacing:.08rem;border-left:1px solid #000;line-height:2rem}
.nav-row a:first-child{border-left:0}
.nav-sp summary{color:transparent!important;list-style:none;height:100%}
.nav-sp[open] summary{color:#fff!important}
.nav-menu a{color:#fff!important}
@media (min-width:768px){[data-el^=gal_]{--step:72rem}[data-el=fv_tab]{position:fixed;top:auto!important;bottom:0}[data-el=fv_tabt]{position:fixed;top:auto!important;bottom:2.2rem}}
@media (max-width:767.98px){[data-el^=gal_]{--step:35.1rem}[data-el=fv_tab]{position:fixed;top:auto!important;bottom:0}[data-el=fv_tabt]{position:fixed;top:auto!important;bottom:1.7rem}}
@media (prefers-reduced-motion:reduce){[data-el=fv_2],[data-el=fv_3]{animation:none}[data-el^=gal_]{transition:none}}
</style>`;
// ギャラリーは自動で送る。動きを減らす設定の人には動かさない
const js = `<script>(function(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var n=7,c=0,E=[];for(var i=1;i<=n;i++)E.push(document.querySelector('[data-el="gal_'+i+'"]'));if(!E[0])return;
function S(d){var o=c;c=(c+d+n)%n;E.forEach(function(e,i){var b=i-3,s=((b-c+3)%n+n)%n-3,p=((b-o+3)%n+n)%n-3;e.style.transition=Math.abs(s-p)>1?'none':'';e.style.setProperty("--g",s);});}
setInterval(function(){S(1)},5000);})();</script>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const map = `<iframe title="${shop.basic.name}の地図" src="https://www.google.com/maps?q=${encodeURIComponent(`${addr} ${shop.basic.name}`)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
h = h.replace(/(<div data-el="ac_mapbox"[^>]*>)/, `$1${map}`);
h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa02-finish: 完了");
