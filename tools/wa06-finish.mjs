#!/usr/bin/env node
// wa-06：描画エンジンに無いものを dist/<店> に足す（ヘッダーの切り替え・Menu のボタン・地図の埋め込み・タブレットの配置）。
// JavaScript が無くても配置は崩れない。node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = "mareluce";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const TB = JSON.parse(fs.readFileSync(`samples/${ID}/wa06-tablet.json`, "utf8"));
const BP = 1025, TAB = 768; // 1025 未満は sp のデータで組み、768〜1024 は下のタブレットの配置に置き換える
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`, TEL = shop.contact.phone;
const OL = "#6B7045", CR = "#F7F1E8", INK = "#2B211B", W = "#FFFFFF";

const css = `<style>
html{scroll-padding-top:9.3rem}
.site-header .el-text a,.site-header .el-nav a{text-decoration:none}
.site-header.overlay,.site-header.overlay.scrolled{transition:background .2s}
.el-nav .nav-row{justify-content:flex-start;gap:2.8rem}
.el-nav .nav-row a{font-size:1.4rem;font-weight:400;letter-spacing:.05em;color:${W}}
.el-nav .nav-menu{background:${INK}}
.el-nav .nav-menu a{color:${CR}!important;font-family:var(--f-body)}
.el-nav .nav-menu .wa06-tel{display:inline-block;margin-top:1.6rem;padding:1.2rem 2.8rem;border-radius:3rem;background:${OL};color:${W}!important}
.el-nav .nav-sp summary{font-family:var(--f-heading);font-size:1.6rem;letter-spacing:.04em;color:${W}}
html.wa06-past .site-header.overlay{background:${CR}}
html.wa06-past .site-header .el-nav a,html.wa06-past .site-header .el-nav summary,html.wa06-past .site-header [data-el=hd_name],html.wa06-past .site-header [data-el=hd_name] a{color:${INK}!important}
html:not(.wa06-past) .site-header.overlay.scrolled{background:transparent}
html:not(.wa06-past) .site-header.overlay.scrolled .el-text,html:not(.wa06-past) .site-header.overlay.scrolled .el-nav a,html:not(.wa06-past) .site-header.overlay.scrolled .nav-sp summary{color:${W}}
.site-header .el-nav .nav-sp[open] summary{color:${CR}!important}
.site-header [data-el=hd_tel_b]{background:${OL}!important;opacity:1!important}
.site-header [data-el=hd_tel_t],.site-header [data-el=hd_tel_t] a{color:${W}!important}
[data-el=hd_tel_t],[data-el=rs_btn_t]{pointer-events:none}
[data-el=in_v5] a,[data-el=ft_t] a{color:inherit;text-decoration:none}
.cbox>.el[data-el=ab_hand]{transform:rotate(-4deg)!important}
[data-el=ab_p] .pg+.pg{margin-top:2.4rem}
[data-el=ac_map]{overflow:hidden}
[data-el=ac_map] iframe{width:100%;height:100%;border:0;display:block}
@media (min-width:768px){.site-header.overlay,.site-header.overlay.scrolled{margin-bottom:-9.3rem}[data-el=fv_name],[data-el=ft_name]{font-size:35.6rem!important;line-height:37.2rem!important}}
[data-el=fv_name],[data-el=ft_name]{white-space:nowrap}
@media (max-width:767.98px){[data-el=hd_tel_b],[data-el=hd_tel_t]{display:none}[data-el=hd_name]{text-align:left!important}.el-nav .nav-sp:not([open]) summary{line-height:7.5rem}html{scroll-padding-top:7.5rem}.site-header.overlay,.site-header.overlay.scrolled{margin-bottom:-7.5rem}}
</style>`;
// ヘッダーの地は「最初の画面を過ぎてから」切り替える（下の文字と重ならないよう、過ぎたら不透明）
const js = `<script>(function(){var d=document.documentElement,f=document.querySelector('[data-sec="sec_firstv"]');if(!f)return;function u(){d.classList.toggle("wa06-past",f.getBoundingClientRect().bottom<=(innerWidth<${BP}?75:93))}u();addEventListener("scroll",u,{passive:true});addEventListener("resize",u);})();</script>`;
const rule = (sel, o) => `${sel}{${Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";")}}`;
const rows = Object.entries(TB.els).filter(([, o]) => Object.keys(o).length).map(([id, o]) => rule(`[data-el=${id}]`, o)).join("\n");
// スマホのデータのままの要素は、左右の余白を 48px にそろえる（タブレットの設定があるものはそちらを優先）
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const edge = Object.entries(site.elements).flatMap(([id, e]) => {
  const s = e.layout?.sp, o = TB.els[id] || {}, near = (a, b) => Math.abs(a - b) < 0.02;
  if (!s || s.x == null || o.left || o.right) return [];
  if (near(s.x, 5.1282)) return [rule(`[data-el=${id}]`, { left: "4.8rem", ...(o.width ? {} : near(s.w, 89.7436) ? { width: "calc(100% - 9.6rem)" } : { width: `calc(${s.w}% - 2.4rem)` }) })]; // 左の列を縮めて右の列（値段など）に重ねない
  if (near(s.x + s.w, 94.8718)) return [rule(`[data-el=${id}]`, { left: "auto", right: "4.8rem" })];
  return [];
}).join("\n");
const secRows = Object.entries(TB.secs).map(([id, v]) => rule(`[data-sec=${id}]`, { "min-height": v })).join("\n");
const dVars = ["sec_wine", "sec_lunch", "sec_dinner"].map((s) => rule(`[data-sec=${s}]`, { "--d": "calc(56.25vw - 52rem)" })).join("\n");
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${dVars}
${edge}
${rows}
[data-el=hd_nav]{left:auto;right:4.8rem;width:8rem}
${secRows}
}</style>`;

function apply(file, isHome) {
  let h = fs.readFileSync(file, "utf8");
  // Menu のボタン（☰ の代わり）と、メニューの中の電話のピル
  h = h.split(">☰</summary>").join(">Menu</summary>");
  h = h.replace(/(<div class="nav-menu">)([\s\S]*?)(<\/div>)/, `$1$2<a class="wa06-tel" href="tel:${TEL.digits}">${TEL.display}</a>$3`);
  // build.mjs は文字の要素の link を出さないので、電話番号の文字をここでリンクにする
  for (const id of ["in_v5", "ft_t"]) h = h.replace(new RegExp(`(<([a-z0-9]+) data-el="${id}"[^>]*>)([\\s\\S]*?)(</\\2>)`), `$1<a href="tel:${TEL.digits}">$3</a>$4`);
  if (isHome) {
    const mapQ = loc.geo ? `${loc.geo.lat},${loc.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&hl=ja`; // 緯度経度＋拡大率で Google の場所の札を出さない（wa-07・wa-13 と同じ。G020 で地図の上を切り落とす形はやめた）
    const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    const re = /(<div data-el="ac_map"[^>]*>)/;
    if (!re.test(h)) throw new Error("ac_map が見つかりません");
    h = h.replace(re, `$1${map}`);
  }
  // 店名は PC で CSS により 372px の高さになる。実測の高さ（データ上の 200px のもの）のままだと後ろの文字が押し下げられる
  h = h.replace(/<[a-z0-9]+ [^>]*data-el="(?:fv_name|ft_name)"[^>]*>/g, (t) => t.replace(/data-mh-pc="[\d.]+"/, 'data-mh-pc="372"'));
  h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
  const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
  fs.writeFileSync(file, bp(h).replace("</head>", tablet + "</head>")); // bp の置き換えの後に足す（768 の下限を巻き込まないため）
}
apply(`${OUT}/index.html`, true);
apply(`${OUT}/404.html`, false);
console.log("wa06-finish: 完了");
