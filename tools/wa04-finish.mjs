#!/usr/bin/env node
// wa-04：描画エンジンに無いものを dist/hamasyou に足す（写真の帯の流れ・地図の埋め込み・ヘッダーの重なりの量・お品書きの丸い写真）。
// JavaScript が無くても配置は崩れない。node tools/build.mjs samples/hamasyou の後に実行する。
import fs from "node:fs";
const OUT = "dist/hamasyou";
const shop = JSON.parse(fs.readFileSync("samples/hamasyou/shop.json", "utf8"));
const BP = 1008; // この幅未満はスマホの配置（wa-02・03 と同じ）
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}${loc.street}`;
const N = 6;
const css = `<style>
html{scroll-padding-top:7rem}
[data-sec=sec_firstv]{position:relative;overflow:hidden}
[data-el^=sr_]{transform:translateX(calc(var(--i)*var(--step)));animation:wa04s var(--dur) linear infinite}
${Array.from({ length: N }, (_, i) => `[data-el=sr_${i + 1}]{--i:${i}}`).join("")}
@keyframes wa04s{from{transform:translateX(calc(var(--i)*var(--step)))}to{transform:translateX(calc((var(--i) - ${N})*var(--step)))}}
[data-clone]{animation:wa04s var(--dur) linear infinite;position:absolute}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block;filter:grayscale(1)}
[data-el=mn_cards] .rep-card{border:1px solid rgba(255,255,255,.5);border-radius:.7rem;box-sizing:border-box}
[data-cel=c_ph]{border-radius:0}
[data-el=mn_cards] [data-cel=c_ph]{border-radius:50%;background:#D9D0C2}
.nav-row{justify-content:flex-end;gap:3.8rem!important;height:100%;align-items:center}
.nav-sp summary{color:transparent!important;list-style:none;height:100%}
.nav-sp[open] summary{color:#FFFFEA!important}
.nav-menu a{color:#FFFFEA!important}
@media (min-width:768px){[data-el^=sr_],[data-clone]{--step:26.68rem;--dur:48s}[data-el^=hd_b]{display:none}.site-header.overlay{margin-bottom:-5.4rem}.el-nav .nav-row a{font-size:1.872rem}}
@media (max-width:767.98px){[data-el^=sr_],[data-clone]{--step:16.03rem;--dur:36s}.site-header.overlay{margin-bottom:-4.7rem}}
@media (prefers-reduced-motion:reduce){[data-el^=sr_]{animation:none}}
</style>`;
// 続けて流すために、写真の帯を JavaScript で1周分増やす。動きを減らす設定の人には増やさない
const js = `<script>(function(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(var i=1;i<=${N};i++){var e=document.querySelector('[data-el="sr_'+i+'"]');if(!e)continue;var c=e.cloneNode(true);c.removeAttribute('data-el');c.setAttribute('data-clone','');c.setAttribute('aria-hidden','true');c.querySelectorAll('img').forEach(function(m){m.alt=''});c.style.setProperty('--i',${N}+i-1);e.parentNode.appendChild(c);}})();</script>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const map = `<iframe title="${shop.basic.name}の地図" src="https://www.google.com/maps?q=${encodeURIComponent(`${addr} ${shop.basic.name}`)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="in_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("in_mapbox が見つかりません");
h = h.replace(re, `$1${map}`);
// 住所は建物名の前で折り返す（「1F」だけが次の行に落ちないように）
if (!/エクセレント芦屋 ?1F/.test(h)) throw new Error("建物名が見つかりません");
h = h.replace(/エクセレント芦屋 ?1F/g, (m) => `<span style="white-space:nowrap">${m}</span>`);
h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa04-finish: 完了");
