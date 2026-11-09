#!/usr/bin/env node
// wa-05：描画エンジンに無いものを dist/sumi に足す（写真の帯の流れ・地図の埋め込み・右上のメニューのボタン・ボタンの枠線）。
// JavaScript が無くても配置は崩れない。node tools/build.mjs samples/sumi の後に実行する。
import fs from "node:fs";
const OUT = "dist/sumi";
const shop = JSON.parse(fs.readFileSync("samples/sumi/shop.json", "utf8"));
const BP = 1008; // この幅未満はスマホの配置（wa-02〜04 と同じ）
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const N = 5;
const css = `<style>
html{scroll-padding-top:2rem}
[data-sec=sec_cuisine]{position:relative;overflow:hidden}
[data-el^=st_]{transform:translateX(calc(var(--i)*var(--step)));animation:wa05s var(--dur) linear infinite}
${Array.from({ length: N }, (_, i) => `[data-el=st_${i + 1}]{--i:${i}}`).join("")}
@keyframes wa05s{from{transform:translateX(calc(var(--i)*var(--step)))}to{transform:translateX(calc((var(--i) - ${N})*var(--step)))}}
[data-clone]{animation:wa05s var(--dur) linear infinite;position:absolute}
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
@media (min-width:768px){[data-el^=st_],[data-clone]{--step:44rem;--dur:110s}}
@media (max-width:767.98px){[data-el^=st_],[data-clone]{--step:35rem;--dur:88s}}
@media (prefers-reduced-motion:reduce){[data-el^=st_]{animation:none}}
</style>`;
// 続けて流すために、写真の帯を JavaScript で1周分増やす。動きを減らす設定の人には増やさない
const js = `<script>(function(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(var i=1;i<=${N};i++){var e=document.querySelector('[data-el="st_'+i+'"]');if(!e)continue;var c=e.cloneNode(true);c.removeAttribute('data-el');c.setAttribute('data-clone','');c.setAttribute('aria-hidden','true');c.querySelectorAll('img').forEach(function(m){m.alt=''});c.style.setProperty('--i',${N}+i-1);e.parentNode.appendChild(c);}})();</script>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="in_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("in_mapbox が見つかりません");
h = h.replace(re, `$1${map}`);
h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa05-finish: 完了");
