#!/usr/bin/env node
// wa-24：描画エンジンに無いものを dist/<店> に足す（wa22-finish を元にした）。左端の固定の縦の札の列（PC・タブレット。今いる段の札を琥珀に）・
// 文節での折り返し・ヘッダーの下の線・フッターの左上の角・飾りの巨大欧文の aria-hidden・端末ごとに出さない要素・ボタンの押したときの色・
// 地図の埋め込み（緯度経度＋z=16＋hl=ja）・タブレット（768〜1024）の配置。
// node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = process.argv[2] || "kairo";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa24.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const NAVY = "#10172A", SMOKE = "#D9D4CA", AMBER = "#C8893A", BRASS = "#B39A5B", DEEP = "#182238", AHOV = "#D69B50";
const pos = (sel, rules) => `${sel}{${rules}}`;
const cel = (id, rules) => pos(`[data-cel=${id}]`, rules.split(";").map((x) => x && `${x}!important`).join(";"));
const NT = C.tonight.cards.length, NM = C.menu.cards.length, NR = C.menu.rows.length, NN = C.nav.length;

// ---- 縦の札の列（固定。段へのリンク）
const rail = `<nav class="k-rail" aria-label="ページの目次">${C.nav.map(([l, , a]) => `<a href="#${a}" data-rail="${a}">${l}</a>`).join("")}</nav>`;
const railJs = `<script>(function(){var r=document.querySelector('.k-rail');if(!r)return;var as=[].slice.call(r.querySelectorAll('a'));function on(){var y=innerHeight*0.4,cur=null;as.forEach(function(a){var s=document.getElementById(a.dataset.rail);if(s&&s.getBoundingClientRect().top<=y)cur=a;});as.forEach(function(a){a.classList.toggle('is-on',a===cur);if(a===cur)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');});}addEventListener('scroll',on,{passive:true});addEventListener('resize',on);on();})();</script>`;

const css = `<style>
html{scroll-padding-top:7.2rem}
.lb{word-break:auto-phrase}
.site-header{box-shadow:inset 0 -1px 0 ${BRASS};z-index:50}
[data-sec=sec_footer]{border-top-left-radius:8rem}
.k-rail{position:fixed;left:0;top:0;bottom:0;width:6.4rem;z-index:60;background:${NAVY};box-shadow:inset -1px 0 0 ${BRASS};display:flex;flex-direction:column;justify-content:center;align-items:center;gap:.8rem}
.k-rail a{writing-mode:vertical-rl;font-family:var(--f-heading);font-size:1.5rem;font-weight:500;letter-spacing:.3em;line-height:1;color:${SMOKE};height:12rem;width:3.1rem;display:flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:inset 2px 0 0 transparent}
.k-rail a:hover{color:${AMBER}}
.k-rail a.is-on{color:${AMBER};box-shadow:inset 2px 0 0 ${AMBER}}
[data-el=ac_mapbox]{overflow:hidden}
[data-el=ac_mapbox] iframe{width:100%;height:100%;border:0;display:block}
[data-el=mn_go]{text-decoration:underline;text-underline-offset:.4em;text-decoration-thickness:1px}
[data-sec=sec_header]:has([data-el=hd_tel_t]:hover) [data-el=hd_tel_b]{background:#1C2640!important}
[data-sec=sec_access]:has([data-el=ac_tel_t]:hover) [data-el=ac_tel_b]{background:${AHOV}!important}
[data-sec=sec_access]:has([data-el=ac_map_t]:hover) [data-el=ac_map_b]{background:#1C2640!important}
[data-cel$=_ds],[data-cel$=_ig],[data-el=ct_p],[data-el=tn_p],[data-el=tn_note],[data-el=fv_p],[data-el=ft_line]{text-wrap:pretty}
@media (min-width:${BP}px){[data-el^=hd_t]:not([data-el^=hd_tel]),[data-el=hd_tl]{display:none!important}}
@media (max-width:${BP - 0.02}px){[data-el=hd_hours],[data-el^=fv_v]{display:none!important}}
@media (max-width:767.9px){.k-rail{display:none}[data-el=mn_h],[data-el=mn_note]{text-align:left!important}}
</style>`;

// ---- タブレット（768〜1024）：:root を 10px にしてスマホのデータを広げ、段ごとに配置を組み直す（1rem＝設計の 1px の 10 倍ではなく 10px）。
// 中身の箱（cbox）を縦の札の列 48px の右に寄せ、スマホのデータの左右 20/390（5.128%）をそのまま余白にする。
const TL = "5.128%", TR = "94.872%";
const CB = "(100vw - 4.8rem)"; // 中身の箱の幅
let tb = "";
tb += ".k-rail{width:4.8rem}.k-rail a{font-size:1.4rem;width:2.8rem;height:11.2rem}";
tb += ".cbox{width:auto!important;margin-left:4.8rem!important;margin-right:0!important}";
// ヘッダー：横の札の行は出さず、店名・営業の 1 行・電話の札の 1 段
tb += pos("[data-sec=sec_header]", "min-height:7.2rem") + "[data-el^=hd_t]:not([data-el^=hd_tel]),[data-el=hd_tl]{display:none!important}";
tb += pos("[data-el=hd_name]", "top:2rem;width:30%");
tb += pos("[data-el=hd_hours]", `display:block!important;left:38%;width:calc(${TR} - 38% - 15.6rem);top:2.6rem`);
tb += pos("[data-el=hd_tel_b]", `left:calc(${TR} - 13.6rem);width:13.6rem;top:1.6rem;height:4rem`) + pos("[data-el=hd_tel_t]", `left:calc(${TR} - 13.6rem);width:13.6rem;top:2.55rem`);
// 最初の画面：左に文字組（34%）、右に写真（3:2）。英字の行は写真の下に 3 行
const FVW = 0.5087, FVH = `calc(${CB} * ${(FVW * 2) / 3})`;
tb += pos("[data-sec=sec_firstv]", `min-height:max(58rem,calc(22rem + ${CB} * ${(FVW * 2) / 3}))`);
tb += pos("[data-el=fv_kick]", `left:${TL};width:34%;top:6rem`);
tb += pos("[data-el=fv_copy]", `left:${TL};width:16rem;top:9.4rem;height:26rem;font-size:3.6rem`);
tb += pos("[data-el=fv_p]", `left:${TL};width:34%;top:38rem;height:auto`);
tb += pos("[data-el=fv_info]", `left:${TL};width:34%;top:46rem;height:auto`);
tb += pos("[data-el=fv_ph]", `left:44%;width:${FVW * 100}%;top:6rem;height:${FVH}`);
C.fv.en.forEach((_, i) => { tb += pos(`[data-el=fv_e${i}]`, `left:44%;width:${FVW * 100}%;top:calc(8rem + ${i * 2.8}rem + ${CB} * ${(FVW * 2) / 3})`); });
// 今宵の一杯：2 列の千鳥（右列を 20rem 下げる）。写真は列の幅の 4:5（cqw）。巨大欧文は縦 96
const COLW = `(${CB} * 0.44872 - 2.4rem)`, KPH = `${COLW} * 1.25`, KCH = `calc(${KPH} + 27.2rem)`;
tb += pos("[data-sec=sec_tonight]", `min-height:calc(96.8rem + ${COLW} * 2.5)`);
tb += pos("[data-el=tn_giant]", `left:calc(${TR} - 11.2rem);width:11.2rem;top:6rem;height:40rem;writing-mode:vertical-rl;white-space:nowrap;font-size:9.6rem;line-height:1`);
tb += pos("[data-el=tn_en]", `left:${TL};width:50%;top:8rem`) + pos("[data-el=tn_h]", `left:${TL};width:50%;top:10.8rem`) + pos("[data-el=tn_p]", `left:${TL};width:50%;top:17rem;height:auto`);
const KX = [TL, `calc(${TL} + (89.744% + 4.8rem) / 2)`, TL], KY = ["24rem", "48rem", `calc(59.2rem + ${KPH})`];
for (let i = 0; i < NT; i++) {
  const p = `k${i}`;
  tb += pos(`[data-el=tn_c${i}]`, `left:${KX[i]};width:calc((89.744% - 4.8rem) / 2);top:${KY[i]};height:${KCH};container-type:inline-size`) + pos(`[data-el=tn_c${i}] .rep-card`, `width:100%!important;height:calc(125cqw + 27.2rem)!important`);
  tb += cel(`${p}_ph`, "top:5.2rem;height:125cqw");
  const at = (d) => `top:calc(125cqw + ${d}rem)`;
  tb += cel(`${p}_nm`, `${at(6.8)};font-size:1.9rem`) + cel(`${p}_en`, at(10.4)) + cel(`${p}_il`, at(13.7)) + cel(`${p}_ig`, at(13.6)) + cel(`${p}_ds`, `${at(19.6)};height:8.4rem`) + cel(`${p}_pr`, at(29.4));
}
tb += pos("[data-el=tn_nb]", `left:${KX[1]};width:calc((89.744% - 4.8rem) / 2);top:calc(81.2rem + ${KPH});height:18rem`);
tb += pos("[data-el=tn_note]", `left:calc(${KX[1]} + 2.4rem);width:calc((89.744% - 4.8rem) / 2 - 4.8rem);top:calc(83.8rem + ${KPH});height:auto`);
// カウンター：巨大欧文は横書きで上、左に縦書きの見出しと紹介文・数字の行、右に写真（中身の 45%）
const CTW = 0.4038, CTPH = `${CB} * ${CTW * 1.25}`;
tb += pos("[data-sec=sec_counter]", `min-height:max(74rem,calc(24rem + ${CTPH}))`);
tb += pos("[data-el=ct_giant]", `left:${TL};width:${TR};top:6.4rem;font-size:7.2rem;line-height:8rem;height:8rem`);
tb += pos("[data-el=ct_en]", `left:${TL};width:40%;top:16rem`);
tb += pos("[data-el=ct_h]", `left:${TL};width:12rem;top:19.6rem;height:36rem;writing-mode:vertical-rl;white-space:nowrap;font-size:3rem;line-height:1.8`);
tb += pos("[data-el=ct_p]", `left:calc(${TL} + 14rem);width:calc(46.16% - 14rem);top:20rem;height:auto`);
tb += pos("[data-el=ct_ph]", `left:54.49%;width:${CTW * 100}%;top:16rem;height:calc(${CTPH})`);
tb += pos("[data-el=ct_cap]", `left:54.49%;width:${CTW * 100}%;top:calc(17.6rem + ${CTPH})`);
const NX = [[TL, "12.92%"], [`calc(${TL} + 12.92%)`, "20.31%"], [`calc(${TL} + 33.23%)`, "12.92%"]];
tb += pos("[data-el=ct_nl]", `left:${TL};width:46.16%;top:58rem`);
C.counter.nums.forEach((_, i) => {
  const [x, w] = NX[i], pad = i ? "1.2rem" : "0rem";
  tb += pos(`[data-el=ct_n${i}]`, `left:calc(${x} + ${pad});width:calc(${w} - ${pad});top:60rem`) + pos(`[data-el=ct_j${i}]`, `left:calc(${x} + ${pad});width:calc(${w} - ${pad});top:63.6rem`);
  if (i) tb += pos(`[data-el=ct_v${i}]`, `left:${x};top:59.6rem;height:6rem`);
});
// 品書き：カードは 3 列（写真は列の幅の 4:5、クラシックは 3:2）、下の行は 2 段の行のまま全幅
const M3 = `(${CB} * 0.29915 - 1.6rem)`, MX = (i) => `calc(${TL} + ${i} * (89.744% + 2.4rem) / 3)`;
const R0 = `(57.2rem + ${M3} * 1.25)`;
tb += pos("[data-sec=sec_menu]", `min-height:calc(${R0} + 41.6rem)`);
tb += pos("[data-el=mn_giant]", "font-size:7.2rem;line-height:8rem;height:8rem;top:6.4rem") + pos("[data-el=mn_h]", "top:15.6rem;text-align:left!important") + pos("[data-el=mn_note]", "top:20.4rem;height:auto;text-align:left!important");
C.menu.cards.forEach((c, i) => {
  const p = `m${i}`, ph = c.wide ? 66.667 : 125;
  tb += pos(`[data-el=mn_c${i}]`, `left:${MX(i)};width:calc((89.744% - 4.8rem) / 3);top:26.8rem;height:calc(${M3} * ${ph / 100} + 24.8rem);container-type:inline-size`) + pos(`[data-el=mn_c${i}] .rep-card`, `width:100%!important;height:calc(${ph}cqw + 24.8rem)!important`);
  tb += cel(`${p}_ph`, `top:2.8rem;height:${ph}cqw`);
  const at = (d) => `top:calc(${ph}cqw + ${d}rem)`;
  tb += cel(`${p}_nm`, `${at(4.8)};font-size:1.7rem`) + cel(`${p}_ds`, `${at(8.4)};font-size:1.4rem;line-height:2.4rem;height:12rem`) + cel(`${p}_pr`, at(21.2));
});
for (let i = 0; i <= NR; i++) tb += pos(`[data-el=mn_l${i}]`, `top:calc(${R0} + ${i * 11.2}rem)`);
for (let i = 0; i < NR; i++) tb += pos(`[data-el=mn_r${i}]`, `top:calc(${R0} + ${i * 11.2}rem)`);
tb += pos("[data-el=mn_go]", `top:calc(${R0} + 8.4rem)`);
// 案内：1 列（スマホの並びを広げる）。地図は中身の全幅×420
tb += pos("[data-sec=sec_access]", "min-height:110.4rem") + pos("[data-el=ac_mapbox]", "height:42rem");
// フッター：左に店名・住所・電話・営業、右に段の目次
tb += pos("[data-sec=sec_footer]", "min-height:40rem");
for (const id of ["ft_name", "ft_line", "ft_addr", "ft_tv", "ft_hr"]) tb += pos(`[data-el=${id}]`, `left:${TL};width:44%`);
tb += pos("[data-el=ft_addr]", "top:15.2rem") + pos("[data-el=ft_tv]", "top:18.2rem") + pos("[data-el=ft_hr]", "top:22rem");
for (let i = 0; i < NN; i++) tb += pos(`[data-el=ft_n${i}]`, `left:56%;width:38%;top:${4.8 + i * 3.2}rem`);
tb += pos("[data-el=ft_l]", "top:29.6rem") + pos("[data-el=ft_age]", "top:31.6rem") + pos("[data-el=ft_copy]", "top:35.2rem");
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox>.el{transform:none!important}
${tb}
}</style>`;

const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const mapQ = loc.geo ? `${loc.geo.lat},${loc.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&hl=ja`; // 緯度経度＋拡大率で Google の場所の札を出さない（G020）
const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://maps.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="ac_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("ac_mapbox が見つかりません");
h = h.replace(re, `$1${map}`).replace("</head>", css + "</head>");
// 飾りの巨大欧文（縦書きの Tonight・Counter）は読み上げない
for (const id of ["tn_giant", "ct_giant"]) h = h.replace(`data-el="${id}" class="`, `data-el="${id}" aria-hidden="true" class="`);
h = h.replace(/(<body[^>]*>)/, `$1${rail}`).replace("</body>", `${railJs}</body>`);
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h).replace("</head>", tablet + "</head>"));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa24-finish: 完了");
