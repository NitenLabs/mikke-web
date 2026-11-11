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
[data-el=in_mapbox] iframe{width:100%;height:100%;border:0;display:block;filter:grayscale(1)}
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
const mapQ = loc.geo ? `${loc.geo.lat},${loc.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(`${addr} ${shop.basic.name}`)}&hl=ja`; // 緯度経度＋拡大率で Google の場所の札を出さない（G020。地図の上を切り落として隠す形はやめた）
const map = `<iframe title="${shop.basic.name}の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="in_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("in_mapbox が見つかりません");
h = h.replace(re, `$1${map}`);
// 住所は建物名の前で折り返す（「1F」だけが次の行に落ちないように）。建物名は ① location.building（空白は有っても無くても合う）。
// 無いとき・見つからないとき（店主が直したなど）は何もしない
if (loc.building) {
  const bre = new RegExp(loc.building.trim().split(/\s+/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(" ?"), "g");
  h = h.replace(bre, (m) => `<span style="white-space:nowrap">${m}</span>`);
}
// ① の文が長くて段が伸びたとき、左の地図（PC）と料理の段の暗い写真が段の下まで届かず地の色が出る（指示 0051 の崩れの検査）。
// 文が今の長さ（営業時間 23 字・料理の文 66 字）より十分長いときだけ、段の下まで伸ばす（伸びていなければ見た目は同じ）
const txt = (id) => (h.match(new RegExp(`<p data-el="${id}"[^>]*>([\\s\\S]*?)</p>`))?.[1] || "").replace(/<[^>]+>/g, "").trim().length;
const fill = [];
if (txt("in_v1") > 30) fill.push(`@media (min-width:768px){[data-sec=sec_info]{display:flex}[data-sec=sec_info]>.cbox{flex:0 0 auto}[data-el=in_mapbox]{height:auto!important;bottom:0}}`);
if (txt("ms_p") > 100) fill.push(`[data-sec=sec_message]{display:flex}[data-sec=sec_message]>.cbox{flex:0 0 auto}[data-el=ms_bg]{height:auto!important;bottom:0}`);
h = h.replace("</head>", (fill.length ? css.replace("</style>", fill.join("") + "</style>") : css) + "</head>").replace("</body>", js + "</body>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa04-finish: 完了");
