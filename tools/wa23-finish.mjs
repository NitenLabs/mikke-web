#!/usr/bin/env node
// wa-23：描画エンジンに無いものを dist/<店> に足す（四つの素材のパネルを <div class="wa23-stack"> で包んで position: sticky で重ねる・札の角丸・丸い写真と小さな丸の輪・
// 目次と札と点の押せない見た目・帯の点とホバーの下線・ヘッダーの下の線・地図の埋め込み・h1 の読み上げ用の語・全面のメニューの電話のボタン・文節の折り返し・数字の形・タブレットの配置）。
// 配置と飾りの表は wa23-gen が samples/<店>/wa23-layout.json に書く（データの形は変えない）。
// 電話番号・店名・ボタンのリンクは site.json の style.link／図形の link から build.mjs が <a> で出す（ここで文字を <a> で包まない）。
// 使い方：node tools/build.mjs samples/<店のID> の後に node tools/wa23-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください");
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa23-content.json`, "utf8"));
const LY = JSON.parse(fs.readFileSync(`samples/${ID}/wa23-layout.json`, "utf8"));
const D = LY.deco;
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const PAPER = "#FBFAF7", INK = "#161616", SOY = "#7A4A2A", BAMBOO = "#6E8B5A", HDLINE = "#D9D3C9";
const MQ = { pc: `@media (min-width:${BP}px)`, sp: `@media (max-width:${TAB - 0.02}px)`, tab: `@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px)` };
const sel = (ids) => ids.map((id) => `[data-el="${id}"]`).join(",");
const r = (n) => Math.round(n * 1000) / 1000;

// 留まる重なり：パネル＋ヘッダー＋余裕 20 が画面の高さに収まるときだけ。PC の 1rem＝min(100vw/144, 10px)、タブレットの 1rem＝clamp(10px, 100vw/76.8, 11.5px)
const HD = LY.header;
const needPc = LY.panelH.pc + HD.pc + 20, needTab = LY.panelH.tab + HD.tab + 20;
const tabKnee = r(76.8 * 11.5); // 883.2px からは 1rem＝11.5px
const STICK = {
  pc: `@media screen and (min-width:${BP}px) and (max-width:1439.98px) and (max-aspect-ratio:1440/${needPc}), screen and (min-width:1440px) and (min-height:${needPc}px)`,
  tab: `@media screen and (min-width:${TAB}px) and (max-width:${tabKnee - 0.01}px) and (max-aspect-ratio:768/${needTab}), screen and (min-width:${tabKnee}px) and (max-width:${BP - 0.02}px) and (min-height:${Math.ceil(needTab * 1.15)}px)`,
};

const devRules = { pc: [], sp: [], tab: [] };
for (const [id, v] of Object.entries(D.round)) for (const d of ["pc", "sp", "tab"]) devRules[d].push(`[data-el="${id}"]{border-radius:${r(v[d] / 10)}rem}`);
for (const d of ["pc", "sp", "tab"]) if (LY.hide[d].length) devRules[d].push(`${sel(LY.hide[d])}{display:none!important}`);
const NOHIT = [...D.toc, ...D.nums, ...D.card, ...D.dots];
const css = `<style>
html{scroll-padding-top:7.2rem}
body{font-synthesis:none}
.el-text,.el-text .lb{word-break:auto-phrase}
.wa23-vh{position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;font-size:1px;line-height:1px}
.site-header{background:${PAPER};box-shadow:inset 0 -1px 0 ${HDLINE}}
.site-header .el-text a,.site-header .el-nav a{text-decoration:none}
.el-nav .nav-row{justify-content:flex-end;gap:3.2rem}
.el-nav .nav-row a{font-size:1.5rem;font-weight:500;letter-spacing:.08em;color:${INK}}
.el-nav .nav-row a:hover{text-decoration:underline;text-underline-offset:.4em;text-decoration-thickness:2px;text-decoration-color:${SOY}}
.el-nav .nav-menu{background:${PAPER}}
.el-nav .nav-menu a{font-weight:500;letter-spacing:.08em;color:${INK}!important}
.el-nav .nav-menu .wa23-tel{display:block;margin:2.4rem auto 0;width:24rem;height:5.6rem;line-height:5.6rem;border-radius:2.8rem;text-align:center;background:${SOY};color:${PAPER}!important;font-weight:700;letter-spacing:.12em;text-decoration:none}
.el-nav .nav-sp summary{font-size:1.4rem;font-weight:500;letter-spacing:.08em;color:${INK};line-height:6rem;min-height:4.4rem;text-align:right}
[data-el^=bd_],[data-el^=mc_y],[data-el^=mo_y],[data-el^=si_y],[data-el^=in_v],[data-el=ft_t],[data-el$=_no],[data-el*=_ln],[data-el*=_rn],[data-el*=_sn]{font-variant-numeric:lining-nums tabular-nums}
${sel(D.btn)}{transition:filter .2s}
${sel(D.btn)}:hover{filter:brightness(1.18)}
[data-el=hd_btn_t],[data-el=in_btn_t]{pointer-events:none}
a[data-el=ft_t],a[data-el^=in_v]{text-decoration:underline;text-underline-offset:.28em;text-decoration-thickness:1px}
a[data-el=bd_tel]{text-decoration:none}
a[data-el=bd_tel]:hover{text-decoration:underline;text-underline-offset:.3em;text-decoration-color:${BAMBOO}}
.el-shape-circle,${sel(D.circle)}{border-radius:50%}
${sel(D.ring)}{box-shadow:0 0 0 .6rem ${PAPER}}
${sel(NOHIT)}{cursor:default;pointer-events:none;user-select:none}
.wa23-stack{position:relative}
.wa23-stack>section{background:${PAPER}}
[data-el=in_map]{overflow:hidden}
[data-el=in_map] iframe{width:100%;height:100%;border:0;display:block}
${MQ.pc}{${devRules.pc.join("")}}
${MQ.sp}{${devRules.sp.join("")}html{scroll-padding-top:6rem}}
${MQ.tab}{${devRules.tab.join("")}html{scroll-padding-top:6rem}}
${STICK.pc}{.wa23-stack>section{position:sticky;top:${r(HD.pc / 10)}rem}}
${STICK.tab}{.wa23-stack>section{position:sticky;top:${r(HD.tab / 10)}rem}}
</style>`;
const js = `<script>(function(){document.querySelectorAll('.nav-menu a').forEach(function(a){a.addEventListener('click',function(){var d=a.closest('details');if(d)d.open=false;});});})();</script>`;
// タブレット（768〜1024）：768 の設計を rem ごと伸ばす（1rem＝100vw/76.8、上限 11.5px。1024 では中身の列 773px＝画面幅の 75%）
const rule = (s, o) => `${s}{${Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";")}}`;
const rows = Object.entries(LY.els).filter(([, o]) => Object.keys(o).length).map(([id, o]) => rule(`[data-el="${id}"]`, o)).join("\n");
const secRows = Object.entries(LY.secs).map(([id, v]) => rule(`[data-sec="${id}"]`, { "min-height": v })).join("\n");
const tablet = `<style>${MQ.tab}{
:root{font-size:clamp(10px,calc(100vw / 76.8),11.5px)}
.cbox{width:76.8rem}
.cbox>.el{transform:none!important}
${rows}
${secRows}
}</style>`;

function apply(file, isHome) {
  let h = fs.readFileSync(file, "utf8");
  h = h.split(">☰</summary>").join(`>${C.labels.menuButton}</summary>`);
  // 全面のメニューの最後に電話のボタン（PC のヘッダーの「お電話」の代わり）
  h = h.replace(/(<div class="nav-menu">)([\s\S]*?)(<\/div>)/, `$1$2<a class="wa23-tel" href="tel:${C.phone.digits}">${C.labels.telButton}</a>$3`);
  if (isHome) {
    // h1 は店名の大きな字。上の小さな「中華そば」は見た目だけにし、h1 の中に読み上げ用の語を足す
    const h1 = /(<h1 data-el="fv_name"[^>]*><span class="pg">)/;
    if (!h1.test(h)) throw new Error("fv_name の h1 が見つかりません");
    h = h.replace(h1, `$1<span class="wa23-vh">${C.genreWord} </span>`);
    h = h.replace(/(<[a-z0-9]+ data-el="fv_sub")/, `$1 aria-hidden="true"`);
    // 地図：緯度経度＋z=16＋hl=ja（Google の場所の札が出ない形。切り抜きなし）
    const mapQ = C.geo ? `${C.geo.lat},${C.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&z=16&hl=ja`;
    const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    const re = /(<div data-el="in_map"[^>]*>)/;
    if (!re.test(h)) throw new Error("in_map が見つかりません");
    h = h.replace(re, `$1${map}`);
    // 四つの素材のパネルを 1 つの包みに入れる（包みの終わりで留まりが終わり、最後のパネルはお品書きに重ならない）
    if (LY.stack.length) {
      const first = h.indexOf(`<section id="`, 0);
      const a = h.search(new RegExp(`<section[^>]*data-sec="${LY.stack[0]}"`));
      const lastAt = h.search(new RegExp(`<section[^>]*data-sec="${LY.stack[LY.stack.length - 1]}"`));
      if (first < 0 || a < 0 || lastAt < a) throw new Error("素材のパネルの段が見つかりません");
      const b = h.indexOf("</section>", lastAt) + "</section>".length;
      h = h.slice(0, a) + `<div class="wa23-stack">` + h.slice(a, b) + `</div>` + h.slice(b);
    }
  }
  h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
  // 描画エンジンの 768 の境目を 1025 に移す（タブレットは SP の配置を土台にする）。足した CSS の境目は MQ で書いたので、一度退避する
  const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`);
  const KEEP = "@@WA23@@";
  h = h.replace(css, KEEP);
  h = bp(h).replace(KEEP, css);
  fs.writeFileSync(file, h.replace("</head>", tablet + "</head>"));
}
apply(`${OUT}/index.html`, true);
apply(`${OUT}/404.html`, false);
console.log(`wa23-finish: 完了（留まる重なり：PC は画面の高さ ${needPc}px 相当以上、タブレットは ${needTab}px 相当以上）`);
