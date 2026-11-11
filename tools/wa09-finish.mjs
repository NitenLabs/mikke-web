#!/usr/bin/env node
// wa-09：描画エンジンに無いものを dist/<店> に足す（ヘッダーの切り替え・Menu のボタン・地図の埋め込み・ボタンの押した色・タブレットの配置）。
// 使い方：node tools/build.mjs samples/<店のID> の後に node tools/wa09-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください");
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa09-content.json`, "utf8"));
const TB = JSON.parse(fs.readFileSync(`samples/${ID}/wa09-tablet.json`, "utf8"));
const SITE = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const telRow = Object.keys(SITE.elements).filter((k) => /^in_v\d+$/.test(k)).find((k) => SITE.elements[k].style?.link?.kind === "shopPhone")?.slice(4); // ご案内の電話の行（① から行が決まる店もあるので site.json から探す）
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`, TEL = shop.contact.phone;
const BK = "#0E0E0E", WH = "#EFE9DD", GD = "#B8975A";

const css = `<style>
html{scroll-padding-top:9.5rem}
body{font-synthesis:none}
.darken{background:${BK}}
.site-header .el-text a,.site-header .el-nav a{text-decoration:none}
.el-nav .nav-row{justify-content:flex-end;gap:4.8rem}
.el-nav .nav-row a{font-size:1.2rem;font-weight:400;letter-spacing:.2em;color:${WH}}
.el-nav .nav-menu{background:${BK}}
.el-nav .nav-menu a{font-family:var(--f-accent);letter-spacing:.2em;color:${WH}!important}
.el-nav .nav-menu .wa09-tel{margin-top:1.6rem;font-family:var(--f-body);letter-spacing:.05em;color:${GD}!important}
.el-nav .nav-sp summary{font-family:var(--f-accent);font-size:1.3rem;letter-spacing:.2em;color:${WH};line-height:5.6rem;min-height:4.4rem}
html.wa09-past .site-header.overlay{background:${BK}}
html:not(.wa09-past) .site-header.overlay.scrolled{background:transparent}
html:not(.wa09-past) .site-header.overlay.scrolled .el-text,html:not(.wa09-past) .site-header.overlay.scrolled .el-nav a,html:not(.wa09-past) .site-header.overlay.scrolled .nav-sp summary{color:${WH}}
[data-el=in_btn]{transition:background .2s}
[data-el=in_btn]:hover{background:${GD}!important}
[data-el=in_btn]:hover~[data-el=in_btn_t]{color:${BK}}
[data-el=in_btn_t]{pointer-events:none}
[data-el=hd_name] a,[data-el=in_v${telRow}] a,[data-el=ft_t] a{color:inherit;text-decoration:none}
[data-el=in_v${telRow}] a,[data-el=ft_t] a{text-decoration:underline;text-underline-offset:.3em;text-decoration-thickness:1px}
[data-el=in_map]{overflow:hidden}
[data-el=in_map] iframe{width:100%;height:100%;border:0;display:block;filter:grayscale(1) invert(.92)}
[data-el=ct_bg]{white-space:nowrap}
@media (min-width:768px){.site-header.overlay,.site-header.overlay.scrolled{margin-bottom:-9.5rem}[data-el=fv_cp2]{display:none}}
@media (max-width:767.98px){html{scroll-padding-top:5.6rem}.site-header.overlay,.site-header.overlay.scrolled{margin-bottom:-5.6rem}[data-el=fv_cp]{display:none}}
</style>`;
const js = `<script>(function(){var d=document.documentElement,f=document.querySelector('[data-sec="sec_firstv"]');if(!f)return;function u(){d.classList.toggle("wa09-past",f.getBoundingClientRect().bottom<=(innerWidth<${BP}?56:95))}u();addEventListener("scroll",u,{passive:true});addEventListener("resize",u);})();</script>`;
const rule = (sel, o) => `${sel}{${Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";")}}`;
const rows = Object.entries(TB.els).filter(([, o]) => Object.keys(o).length).map(([id, o]) => rule(`[data-el=${id}]`, o)).join("\n");
const secRows = Object.entries(TB.secs).map(([id, v]) => rule(`[data-sec=${id}]`, { "min-height": v })).join("\n");
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${rows}
[data-el=hd_nav]{left:auto;right:4.8rem;width:8rem}
${secRows}
html{scroll-padding-top:5.6rem}
.site-header.overlay,.site-header.overlay.scrolled{margin-bottom:-5.6rem}
}</style>`;

function apply(file, isHome) {
  let h = fs.readFileSync(file, "utf8");
  h = h.split(">☰</summary>").join(`>${C.labels.menuButton}</summary>`);
  // build.mjs は文字の要素の link を出さないので、店名と電話の文字をここでリンクにする
  for (const [id, href] of [["hd_name", isHome ? "#top" : "./"], [`in_v${telRow}`, `tel:${TEL.digits}`], ["ft_t", `tel:${TEL.digits}`]]) {
    h = h.replace(new RegExp(`(<([a-z0-9]+) data-el="${id}"[^>]*>)([\\s\\S]*?)(</\\2>)`), `$1<a href="${href}">$3</a>$4`);
  }
  h = h.replace(/(<div class="nav-menu">)([\s\S]*?)(<\/div>)/, `$1$2<a class="wa09-tel" href="tel:${TEL.digits}">${TEL.display}</a>$3`);
  if (isHome) {
    const mapQ = loc.geo ? `${loc.geo.lat},${loc.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&hl=ja`; // 緯度経度＋拡大率で Google の場所の札を出さない（G020 で地図の上を切り落とす形はやめた）
    const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    const re = /(<div data-el="in_map"[^>]*>)/;
    if (!re.test(h)) throw new Error("in_map が見つかりません");
    h = h.replace(re, `$1${map}`);
    const bg = /<[a-z0-9]+ [^>]*data-el="ct_bg"[^>]*>/;
    if (!bg.test(h)) throw new Error("ct_bg が見つかりません");
    h = h.replace(bg, (t) => t.replace(/>$/, ' aria-hidden="true">'));
  }
  h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
  const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
  fs.writeFileSync(file, bp(h).replace("</head>", tablet + "</head>")); // bp の後に足す（768 の下限を巻き込まない）
}
apply(`${OUT}/index.html`, true);
apply(`${OUT}/404.html`, false);
console.log("wa09-finish: 完了");
