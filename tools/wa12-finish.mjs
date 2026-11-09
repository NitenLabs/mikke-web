#!/usr/bin/env node
// wa-12：描画エンジンに無いものを dist/<店> に足す（Menu のボタン・全面のメニューの赤のボタン・電話のリンク・地図の埋め込み・覆い・タブレットの配置）。
// 使い方：node tools/build.mjs samples/<店のID> の後に node tools/wa12-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください");
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa12-content.json`, "utf8"));
const TB = JSON.parse(fs.readFileSync(`samples/${ID}/wa12-tablet.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`, TEL = shop.contact.phone;
const BK = "#141414", WH = "#F2F2F0", GY = "#8C8C8C", RD = "#B23A2A";

const narrow = TB.narrow.map((id) => `[data-el=${id}]`).join(",");
const css = `<style>
html{scroll-padding-top:8rem}
body{font-synthesis:none}
.darken{background:#000}
.site-header{background:${BK}}
.site-header .el-text a,.site-header .el-nav a{text-decoration:none}
.el-nav .nav-row{justify-content:flex-end;gap:4rem}
.el-nav .nav-row a{font-size:1.4rem;font-weight:400;letter-spacing:.12em;color:${WH}}
.el-nav .nav-menu{background:${BK}}
.el-nav .nav-menu a{font-family:var(--f-accent);letter-spacing:.12em;color:${WH}!important}
.el-nav .nav-menu .wa12-res{display:block;margin:2.4rem auto 0;width:24rem;height:5.6rem;line-height:5.6rem;text-align:center;background:${RD};font-family:var(--f-heading);font-weight:700;letter-spacing:0}
.el-nav .nav-sp summary{font-family:var(--f-accent);font-size:1.4rem;letter-spacing:.12em;color:${WH};line-height:5.6rem;min-height:4.4rem}
[data-el=hd_btn],[data-el=rs_btn]{transition:filter .2s}
[data-el=hd_btn]:hover,[data-el=rs_btn]:hover{filter:brightness(1.12)}
[data-el=hd_btn_t],[data-el=rs_btn_t]{pointer-events:none}
[data-el=hd_name] a,[data-el=rs_t] a,[data-el=ft_t] a,[data-el^=in_v] a{color:inherit;text-decoration:none}
[data-el=rs_t] a,[data-el=ft_t] a,[data-el^=in_v] a{text-decoration:underline;text-underline-offset:.3em;text-decoration-thickness:1px}
[data-el=in_map]{overflow:hidden}
[data-el=in_map] iframe{width:100%;height:100%;border:0;display:block;filter:grayscale(1) invert(.92)}
@media (min-width:768px){[data-el=ab_h2]{display:none}}
@media (max-width:767.98px){[data-el=ab_h],[data-el=fv_nm],[data-el=hd_btn],[data-el=hd_btn_t]{display:none}}
@media (min-width:1441px){[data-el=fv_ph]{width:50vw!important}}
@media (max-width:767.98px){html{scroll-padding-top:5.6rem}}
@media (max-width:359.98px){${narrow}{left:24px!important;width:calc(100% - 48px)!important}}
</style>`;
const js = `<script>(function(){document.querySelectorAll('.nav-menu a').forEach(function(a){a.addEventListener('click',function(){var d=a.closest('details');if(d)d.open=false;});});})();</script>`;
const rule = (sel, o) => `${sel}{${Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";")}}`;
const rows = Object.entries(TB.els).filter(([, o]) => Object.keys(o).length).map(([id, o]) => rule(`[data-el=${id}]`, o)).join("\n");
const secRows = Object.entries(TB.secs).map(([id, v]) => rule(`[data-sec=${id}]`, { "min-height": v })).join("\n");
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
[data-el=hd_nav]{left:auto;right:4.8rem;width:8rem}
[data-el=ab_p],[data-el$=_p]{text-wrap:pretty}
${rows}
${secRows}
html{scroll-padding-top:5.6rem}
}</style>`;

function apply(file, isHome) {
  let h = fs.readFileSync(file, "utf8");
  h = h.split(">☰</summary>").join(`>${C.labels.menuButton}</summary>`);
  // build.mjs は文字の要素の link を出さないので、店名と電話番号の文字をここでリンクにする
  const telRow = C.info.rows.findIndex(([, v]) => v === "$phone");
  const links = [["hd_name", isHome ? "#top" : "./"], ["ft_t", `tel:${TEL.digits}`]];
  if (isHome) links.push([`in_v${telRow}`, `tel:${TEL.digits}`], ["rs_t", `tel:${TEL.digits}`]);
  for (const [id, href] of links) {
    h = h.replace(new RegExp(`(<([a-z0-9]+) data-el="${id}"[^>]*>)([\\s\\S]*?)(</\\2>)`), `$1<a href="${href}">$3</a>$4`);
  }
  const resHref = isHome ? "#reserve" : "./#reserve";
  h = h.replace(/(<div class="nav-menu">)([\s\S]*?)(<\/div>)/, `$1$2<a class="wa12-res" href="${resHref}">${C.labels.reserveButton}</a>$3`);
  if (isHome) {
    const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
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
console.log("wa12-finish: 完了");
