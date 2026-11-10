#!/usr/bin/env node
// wa-13：描画エンジンに無いものを dist/<店> に足す（メニューのボタン・全面のメニューの朱のボタン・地図の埋め込み・覆い・タブレットの配置）。
// 使い方：node tools/build.mjs samples/<店のID> の後に node tools/wa13-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください");
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa13-content.json`, "utf8"));
const TB = JSON.parse(fs.readFileSync(`samples/${ID}/wa13-tablet.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`, TEL = shop.contact.phone;
const KI = "#EFE3CF", SHU = "#B5372A", INK = "#222222", WH = "#FFFFFF";

const css = `<style>
html{scroll-padding-top:8rem}
body{font-synthesis:none}
.darken{background:#000}
.site-header{background:${KI}}
.site-header .el-text a,.site-header .el-nav a{text-decoration:none}
.el-nav .nav-row{justify-content:flex-end;gap:4rem}
.el-nav .nav-row a{font-size:1.5rem;font-weight:700;color:${INK}}
.el-nav .nav-menu{background:${KI}}
.el-nav .nav-menu a{font-weight:700;color:${INK}!important}
.el-nav .nav-menu .wa13-res{display:block;margin:2.4rem auto 0;width:24rem;height:5.6rem;line-height:5.6rem;text-align:center;background:${SHU};color:${WH}!important;border-radius:2.8rem}
.el-nav .nav-sp summary{font-size:1.4rem;font-weight:700;color:${INK};line-height:6.4rem;min-height:4.4rem;text-align:right}
[data-el=hd_name]{font-size:26px!important}
[data-el=hd_btn],[data-el=rs_btn]{transition:filter .2s}
[data-el=hd_btn]:hover,[data-el=rs_btn]:hover{filter:brightness(1.08)}
[data-el=hd_btn_t],[data-el=rs_btn_t]{pointer-events:none}
a[data-el=rs_t],a[data-el=ft_t],a[data-el^=in_v]{text-decoration:underline;text-underline-offset:.3em;text-decoration-thickness:1px}
[data-el=in_map]{overflow:hidden}
[data-el=in_map] iframe{width:100%;height:100%;border:0;display:block;filter:sepia(.25)}
@media (min-width:768px){[data-el=fv_cp2]{display:none}}
@media (max-width:767.98px){[data-el=fv_cp],[data-el=hd_btn],[data-el=hd_btn_t]{display:none}}
@media (max-width:767.98px){html{scroll-padding-top:6.4rem}}
@media (max-width:359.98px){[data-el$=_o]{left:16px!important;width:calc(100% - 32px)!important}}
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
html{scroll-padding-top:6.4rem}
}</style>`;

function apply(file, isHome) {
  let h = fs.readFileSync(file, "utf8");
  h = h.split(">☰</summary>").join(`>${C.labels.menuButton}</summary>`);
  // 店名と電話番号の文字のリンクは site.json の style.link から build.mjs が <a> で出す（G021 で回避を外した）
  const resHref = isHome ? "#reserve" : "./#reserve";
  h = h.replace(/(<div class="nav-menu">)([\s\S]*?)(<\/div>)/, `$1$2<a class="wa13-res" href="${resHref}">${C.labels.reserveButton}</a>$3`);
  if (isHome) {
    const mapQ = C.geo ? `${C.geo.lat},${C.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&hl=ja`; // 緯度経度＋拡大率なら Google の場所の札が出にくい（wa-07 と同じ）
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
console.log("wa13-finish: 完了");
