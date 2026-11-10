#!/usr/bin/env node
// wa-19：描画エンジンに無いものを dist/<店> に足す（メニューのボタンの文字・全面のメニューの青のボタン・地図の埋め込み（白黒）・h1 の読み上げ用の店名・
// 文節の折り返し・数字の形・タブレットの配置）。
// 電話番号・店名・ボタンのリンクは site.json の style.link／図形の link から build.mjs が <a> で出す（ここで <a> を足さない）。
// 使い方：node tools/build.mjs samples/<店のID> の後に node tools/wa19-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください");
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa19-content.json`, "utf8"));
const TB = JSON.parse(fs.readFileSync(`samples/${ID}/wa19-tablet.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const PAPER = "#FAF8F4", BLUE = "#20344A", INK = "#1C1C1C", WH = "#FFFFFF", LINE = "#9A9A96";

// 片方の端末だけに出す要素（wa19-tablet.json の only）を CSS で隠す。SP の側の指定はタブレットにも効く
const sel = (ids) => ids.map((id) => `[data-el=${id}]`).join(",");
const hideSp = sel(TB.only.pc), hidePc = sel(TB.only.sp); // PC だけの要素は SP（とタブレット）で隠す。SP だけの要素は PC で隠す
const css = `<style>
${hideSp ? `@media (max-width:767.98px){${hideSp}{display:none!important}}` : ""}
${hidePc ? `@media (min-width:768px){${hidePc}{display:none!important}}` : ""}
html{scroll-padding-top:8.8rem}
body{font-synthesis:none}
.el-text,.el-text .lb{word-break:auto-phrase}
.wa19-vh{position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;font-size:1px;line-height:1px}
.site-header{background:${PAPER};box-shadow:inset 0 -1px 0 ${LINE}}
.site-header .el-text a,.site-header .el-nav a{text-decoration:none}
.el-nav .nav-row{justify-content:flex-end;gap:3.6rem}
.el-nav .nav-row a{font-size:1.4rem;font-weight:400;letter-spacing:.08em;color:${INK}}
.el-nav .nav-menu{background:${PAPER}}
.el-nav .nav-menu a{font-weight:400;letter-spacing:.08em;color:${INK}!important}
.el-nav .nav-menu .wa19-res{display:block;margin:2.4rem auto 0;width:24rem;height:5.6rem;line-height:5.6rem;text-align:center;background:${BLUE};color:${WH}!important;font-weight:500;letter-spacing:.12em}
.el-nav .nav-sp summary{font-size:1.4rem;font-weight:500;letter-spacing:.08em;color:${INK};line-height:6.4rem;min-height:4.4rem;text-align:right}
[data-el^=cs_n],[data-el^=mp_],[data-el^=mpp_],[data-el=rs_t]{font-variant-numeric:lining-nums tabular-nums}
[data-el=hd_btn],[data-el=rs_btn]{transition:filter .2s}
[data-el=hd_btn]:hover{filter:brightness(1.25)}
[data-el=rs_btn]:hover{filter:brightness(.96)}
[data-el=hd_btn_t],[data-el=rs_btn_t]{pointer-events:none}
a[data-el=rs_t],a[data-el=ft_t],a[data-el^=in_v]{text-decoration:underline;text-underline-offset:.28em;text-decoration-thickness:1px}
[data-el=in_map]{overflow:hidden}
[data-el=in_map] iframe{width:100%;height:100%;border:0;display:block;filter:grayscale(1)}
@media (max-width:767.98px){[data-el$=_en],[data-el$=_lead],[data-el$=_sub],[data-el=ft_c]{text-align:left!important}html{scroll-padding-top:6.4rem}}
</style>`;
const js = `<script>(function(){document.querySelectorAll('.nav-menu a').forEach(function(a){a.addEventListener('click',function(){var d=a.closest('details');if(d)d.open=false;});});})();</script>`;
const rule = (sel, o) => `${sel}{${Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";")}}`;
const rows = Object.entries(TB.els).filter(([, o]) => Object.keys(o).length).map(([id, o]) => rule(`[data-el=${id}]`, o)).join("\n");
const secRows = Object.entries(TB.secs).map(([id, v]) => rule(`[data-sec=${id}]`, { "min-height": v })).join("\n");
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
[data-el=hd_nav]{left:auto;right:4.8rem;width:8.4rem}
${rows}
${secRows}
}</style>`;

function apply(file, isHome) {
  let h = fs.readFileSync(file, "utf8");
  h = h.split(">☰</summary>").join(`>${C.labels.menuButton}</summary>`);
  const resHref = isHome ? "#reserve" : "./#reserve";
  h = h.replace(/(<div class="nav-menu">)([\s\S]*?)(<\/div>)/, `$1$2<a class="wa19-res" href="${resHref}">${C.labels.reserveButton}</a>$3`);
  if (isHome) {
    // h1 は「Restaurant Lueur」。見た目は大きな「Lueur」だけにし、前の語は読み上げ用に隠す
    const h1 = /(<h1 data-el="fv_name"[^>]*><span class="pg">)/;
    if (!h1.test(h)) throw new Error("fv_name の h1 が見つかりません");
    if (C.fv.h1Hidden) h = h.replace(h1, `$1<span class="wa19-vh">${C.fv.h1Hidden}</span>`);
    // 緯度経度＋z=16＋hl=ja：Google の場所の札が出ない形（切り抜きなし）。白黒にして店の色に合わせる
    const mapQ = C.geo ? `${C.geo.lat},${C.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&z=16&hl=ja`;
    const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    const re = /(<div data-el="in_map"[^>]*>)/;
    if (!re.test(h)) throw new Error("in_map が見つかりません");
    h = h.replace(re, `$1${map}`);
  }
  h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
  const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`);
  fs.writeFileSync(file, bp(h).replace("</head>", tablet + "</head>")); // bp の後に足す（768 の下限を巻き込まない）
}
apply(`${OUT}/index.html`, true);
apply(`${OUT}/404.html`, false);
console.log("wa19-finish: 完了");
