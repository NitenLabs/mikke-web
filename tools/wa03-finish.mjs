#!/usr/bin/env node
// wa-03：描画エンジンに無いものを dist/roku に足す（写真の帯の流れ・地図の埋め込み・ヘッダーの字間・地図のピン）。
// JavaScript が無くても配置は崩れない。node tools/build.mjs samples/roku の後に実行する。
import fs from "node:fs";
const OUT = "dist/roku";
const shop = JSON.parse(fs.readFileSync("samples/roku/shop.json", "utf8"));
const BP = 1008; // この幅未満はスマホの配置（wa-02 と同じ）
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}${loc.street}`;
const N = 6;
const css = `<style>
html{scroll-padding-top:12rem}
[data-el=ac_mapbox],[data-el=ft_mapbox]{overflow:hidden}
[data-el=ac_mapbox] iframe,[data-el=ft_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block}
[data-sec=sec_strip]{position:relative;overflow:hidden}
[data-el^=sr_]{transform:translateX(calc(var(--i)*var(--step)));animation:wa03s var(--dur) linear infinite}
${Array.from({ length: N }, (_, i) => `[data-el=sr_${i + 1}]{--i:${i}}`).join("")}
@keyframes wa03s{from{transform:translateX(calc(var(--i)*var(--step)))}to{transform:translateX(calc((var(--i) - ${N})*var(--step)))}}
@media (min-width:768px){[data-el^=sr_]{--step:64rem;--dur:60s}[data-el^=hd_b],[data-el=ft_div]~x{display:none}[data-el^=hd_b]{display:none}}
@media (max-width:767.98px){[data-el^=sr_]{--step:35.1rem;--dur:45s}[data-el=ft_div]{display:none}[data-el=ft_name],[data-el^=ft_n]{text-align:center}[data-el=fv_en]{text-align:left}}
.nav-row{justify-content:flex-end;gap:2rem!important;height:100%;align-items:center}
.nav-row a{letter-spacing:.16rem;font-weight:400}
.nav-sp summary{color:transparent!important;list-style:none;height:100%}
.nav-sp[open] summary{color:#DDDCD4!important}
.nav-menu a{color:#DDDCD4!important}
.wa03-pin{position:absolute;left:2.1rem;top:50%;transform:translateY(-50%);width:1.6rem;height:1.6rem;fill:#8A9474}
@media (max-width:767.98px){.wa03-pin{width:2.4rem;height:2.4rem}}
@media (prefers-reduced-motion:reduce){[data-el^=sr_]{animation:none}}
</style>`;
// 続けて流すために、写真の帯を JavaScript で1周分増やす。動きを減らす設定の人には増やさない
const js = `<script>(function(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(var i=1;i<=${N};i++){var e=document.querySelector('[data-el="sr_'+i+'"]');if(!e)continue;var c=e.cloneNode(true);c.removeAttribute('data-el');c.setAttribute('data-clone','');c.setAttribute('aria-hidden','true');c.querySelectorAll('img').forEach(function(m){m.alt=''});c.style.setProperty('--i',${N}+i-1);c.style.transform='';e.parentNode.appendChild(c);}})();</script>`;
const cloneCss = `<style>[data-clone]{animation:wa03s var(--dur) linear infinite;position:absolute}@media (min-width:768px){[data-clone]{--step:64rem;--dur:60s}}@media (max-width:767.98px){[data-clone]{--step:35.1rem;--dur:45s}}</style>`;
const pin = `<svg class="wa03-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const map = (t) => `<iframe title="${shop.basic.name}の${t}" src="https://www.google.com/maps?q=${encodeURIComponent(`${addr} ${shop.basic.name}`)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
for (const [id, t] of [["ac_mapbox", "地図"], ["ft_mapbox", "地図（フッター）"]]) {
  const re = new RegExp(`(<div data-el="${id}"[^>]*>)`);
  if (!re.test(h)) throw new Error(id + " が見つかりません");
  h = h.replace(re, `$1${map(t)}`);
}
if (!/(<a[^>]*data-el="ac_btn"[^>]*>|<div data-el="ac_btn"[^>]*>)/.test(h)) throw new Error("ac_btn が見つかりません");
h = h.replace(/(<(?:a|div)[^>]*data-el="ac_btn"[^>]*>)/, `$1${pin}`);
h = h.replace("</head>", css + cloneCss + "</head>").replace("</body>", js + "</body>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa03-finish: 完了");
