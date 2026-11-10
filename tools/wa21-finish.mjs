#!/usr/bin/env node
// wa-21：描画エンジンに無いものを dist/<店> に足す（段の頭の札の線・写真のずらした色の影・傾け・白い縁・水玉の地・名札と効きの札の地・
// 大きな淡い英字の帯の読み上げ外し・全面のメニューの電話のボタン・地図の埋め込み・h1 の読み上げ用の語・文節の折り返し・数字の形・タブレットの配置）。
// 飾りの表は wa21-gen が samples/<店>/wa21-tablet.json の deco に書く（データの形は変えない）。
// 電話番号・店名・ボタンのリンクは site.json の style.link／図形の link から build.mjs が <a> で出す（ここで文字を <a> で包まない）。
// 使い方：node tools/build.mjs samples/<店のID> の後に node tools/wa21-finish.mjs <店のID>
import fs from "node:fs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください");
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa21-content.json`, "utf8"));
const TB = JSON.parse(fs.readFileSync(`samples/${ID}/wa21-tablet.json`, "utf8"));
const D = TB.deco;
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const PAPER = "#FFFDF8", CREAM = "#FBF3DF", INK = "#2F4A3A", TUR = "#E3A82B";
const MQ = { pc: `@media (min-width:${BP}px)`, sp: `@media (max-width:${TAB - 0.02}px)`, tab: `@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px)` };
const sel = (ids) => ids.map((id) => `[data-el="${id}"]`).join(",");
const r = (n) => Math.round(n * 1000) / 1000;

// 片方の端末だけに出す要素を CSS で隠す（PC だけの要素は SP とタブレットで隠す。SP だけの要素は PC で隠す）
const hideSp = sel(TB.only.pc), hidePc = sel(TB.only.sp);
// 影・傾け・白い縁（端末ごと）
const devRules = { pc: [], sp: [], tab: [] };
for (const [id, s] of Object.entries(D.shadow)) for (const d of ["pc", "sp", "tab"]) devRules[d].push(`[data-el="${id}"]{box-shadow:${r(s[d] / 10)}rem ${r(s[d] / 10)}rem 0 ${s.color}}`);
for (const [id, v] of Object.entries(D.rotate)) for (const d of ["pc", "sp", "tab"]) { const deg = typeof v === "number" ? v : v[d] ?? 0; devRules[d].push(`[data-el="${id}"]{rotate:${deg}deg}`); }
for (const [id, v] of Object.entries(D.frame)) for (const d of ["pc", "sp", "tab"]) devRules[d].push(`[data-el="${id}"]{border:${r(v[d] / 10)}rem solid ${PAPER};background:${PAPER}}`);
const css = `<style>
${hideSp ? `@media (max-width:${BP - 0.02}px){${hideSp}{display:none!important}}` : ""}
${hidePc ? `${MQ.pc}{${hidePc}{display:none!important}}` : ""}
html{scroll-padding-top:7.2rem}
body{font-synthesis:none}
.el-text,.el-text .lb{word-break:auto-phrase}
.wa21-vh{position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;font-size:1px;line-height:1px}
.site-header{background:${PAPER};box-shadow:inset 0 -2px 0 ${INK}}
.site-header .el-text a,.site-header .el-nav a{text-decoration:none}
.el-nav .nav-row{justify-content:flex-end;gap:3.2rem}
.el-nav .nav-row a{font-size:1.5rem;font-weight:500;letter-spacing:.08em;color:${INK}}
.el-nav .nav-row a:hover{text-decoration:underline;text-underline-offset:.4em;text-decoration-thickness:2px;text-decoration-color:${TUR}}
.el-nav .nav-menu{background:${PAPER}}
.el-nav .nav-menu a{font-weight:500;letter-spacing:.08em;color:${INK}!important}
.el-nav .nav-menu .wa21-tel{display:block;margin:2.4rem auto 0;width:24rem;height:5.6rem;line-height:5.6rem;text-align:center;background:${INK};color:${PAPER}!important;font-weight:700;letter-spacing:.12em;box-shadow:.4rem .4rem 0 ${TUR}}
.el-nav .nav-sp summary{font-size:1.4rem;font-weight:500;letter-spacing:.08em;color:${INK};line-height:6rem;min-height:4.4rem;text-align:right}
${sel(D.w800)}{font-weight:800}
[data-el^=cu_n],[data-el^=cu_y],[data-el^=ai_y],[data-el^=ai_rp],[data-el^=in_v],[data-el=ft_t]{font-variant-numeric:lining-nums tabular-nums}
[data-el=hd_btn],[data-el=in_btn]{transition:filter .2s}
[data-el=hd_btn]:hover,[data-el=in_btn]:hover{filter:brightness(1.3)}
[data-el=hd_btn_t],[data-el=in_btn_t]{pointer-events:none}
a[data-el=ft_t],a[data-el^=in_v]{text-decoration:underline;text-underline-offset:.28em;text-decoration-thickness:1px}
${sel(D.tag)}{box-shadow:inset 0 2px 0 ${INK},inset 0 -2px 0 ${INK}}
${sel(D.nametag)}{background:${INK}}
${sel(D.chip)}{background:${CREAM}}
${sel(D.polka)}{background:radial-gradient(circle,${TUR} .3rem,transparent .32rem) 0 0/2.8rem 2.8rem}
${sel(D.band)}{user-select:none;pointer-events:none}
.el-shape-circle{border-radius:50%}
[data-el=in_map]{overflow:hidden}
[data-el=in_map] iframe{width:100%;height:100%;border:0;display:block}
${MQ.pc}{${devRules.pc.join("")}}
${MQ.sp}{${devRules.sp.join("")}${D.hideSp?.length ? `${sel(D.hideSp)}{display:none!important}` : ""}html{scroll-padding-top:6rem}[data-el=ft_c]{text-align:left!important}}
${MQ.tab}{${devRules.tab.join("")}html{scroll-padding-top:6rem}}
</style>`;
const js = `<script>(function(){document.querySelectorAll('.nav-menu a').forEach(function(a){a.addEventListener('click',function(){var d=a.closest('details');if(d)d.open=false;});});})();</script>`;
// タブレット（768〜1024）：768 の設計を rem ごと伸ばす（1rem＝100vw/76.8、上限 11.5px。1024 では中身の列 773px＝画面幅の 75%）
const rule = (s, o) => `${s}{${Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";")}}`;
const rows = Object.entries(TB.els).filter(([, o]) => Object.keys(o).length).map(([id, o]) => rule(`[data-el="${id}"]`, o)).join("\n");
const secRows = Object.entries(TB.secs).map(([id, v]) => rule(`[data-sec="${id}"]`, { "min-height": v })).join("\n");
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
  h = h.replace(/(<div class="nav-menu">)([\s\S]*?)(<\/div>)/, `$1$2<a class="wa21-tel" href="tel:${C.phone.digits}">${C.labels.telButton}</a>$3`);
  // 大きな淡い英字の帯は飾り：読み上げない
  h = h.replace(/(<[a-z0-9]+ data-el="ab_band")/, `$1 aria-hidden="true"`);
  if (isHome) {
    // h1 は「月とバジル」の大きな字。上の「スパイスカレー」は見た目だけにし、h1 の中に読み上げ用の語を足す
    const h1 = /(<h1 data-el="fv_name"[^>]*><span class="pg">)/;
    if (!h1.test(h)) throw new Error("fv_name の h1 が見つかりません");
    h = h.replace(h1, `$1<span class="wa21-vh">${C.genreWord} </span>`);
    h = h.replace(/(<[a-z0-9]+ data-el="fv_sub")/, `$1 aria-hidden="true"`);
    // 地図：緯度経度＋z=16＋hl=ja（Google の場所の札が出ない形。切り抜きなし）
    const mapQ = C.geo ? `${C.geo.lat},${C.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&z=16&hl=ja`;
    const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    const re = /(<div data-el="in_map"[^>]*>)/;
    if (!re.test(h)) throw new Error("in_map が見つかりません");
    h = h.replace(re, `$1${map}`);
  }
  h = h.replace("</head>", css + "</head>").replace("</body>", js + "</body>");
  const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`);
  // bp は描画エンジンの 768 の境目を 1025 に移す（タブレットは SP の配置を土台にする）。足した CSS の端末ごとの境目は MQ で書いたので、bp の前に一度退避する
  const KEEP = "@@WA21@@";
  h = h.replace(css, KEEP);
  h = bp(h).replace(KEEP, css);
  fs.writeFileSync(file, h.replace("</head>", tablet + "</head>"));
}
apply(`${OUT}/index.html`, true);
apply(`${OUT}/404.html`, false);
console.log("wa21-finish: 完了");
