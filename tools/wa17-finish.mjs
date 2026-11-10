#!/usr/bin/env node
// wa-17：描画エンジンに無いものを dist/<店> に足す（文節での折り返し・行の罫線・ボタンの角と枠線・地図の埋め込み・タブレットの配置）。
// node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = process.argv[2] || "uchide";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const BG = "#F4EFE6", INK = "#262626", MUST = "#E2B23A", SOFT = "#D9CFBE", HOV = "#E0D5C1";
const E = site.elements;
const pos = (sel, rules) => `${sel}{${rules}}`;
const css = `<style>
html{scroll-padding-top:8rem}
.lb{word-break:auto-phrase}
[data-el^=mc_r] .rep-card{border-top:1px solid ${SOFT}}
[data-el=in_tel_b],[data-el=in_map_b]{border-radius:4px}
[data-el=in_map_b]{box-shadow:inset 0 0 0 1.5px ${INK}}
[data-sec=sec_info]:has([data-el=in_tel_t]:hover) [data-el=in_tel_b]{background:#EEC75E!important}
[data-sec=sec_info]:has([data-el=in_map_t]:hover) [data-el=in_map_b]{background:${HOV}!important}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:100%;border:0;display:block;filter:saturate(.75) sepia(.06)}
.el-nav .nav-menu a{color:${BG}!important}
.el-nav .nav-menu{background:${INK}}
.nav-sp summary{color:${BG}}
[data-cel$=_nm]{text-wrap:balance}
[data-el=ab_p],[data-cel$=_ds]{text-wrap:pretty}
</style>`;

// ---- タブレット（768〜1024）：スマホのデータを広げ、段ごとに PC に近い列へ組み直す
const L = "6%", W = "88%", CL = "6%", CR = "51%", CW = "43%";
const rows = (ids, rules) => ids.map((i) => pos(`[data-el="${i}"]`, rules)).join("");
const top = (id) => E[id].layout.sp.y / 10; // スマホの設計の上端（rem）
// 看板の三品：大きいカードを横いっぱいに、残りの 2 枚を下に 2 列
const SGT = 19, SGB = 52, SGS = SGT + SGB + 3, SGH = 38;
let sg = "";
[0, 1, 2].forEach((i) => {
  const big = i === 0, left = big ? L : i === 1 ? CL : CR, w = big ? W : CW, t = big ? SGT : SGS, h = big ? SGB : SGH;
  sg += pos(`[data-el="sg_c${i}"]`, `left:${left};width:${w};top:${t}rem;height:${h}rem`) + pos(`[data-el="sg_c${i}"] .rep-card`, `width:100%!important;height:${h}rem!important`);
  if (big) sg += pos(`[data-cel=g0_ph]`, "height:42rem!important") + pos(`[data-cel=g0_nm]`, "top:43.4rem!important") + pos(`[data-cel=g0_pr]`, "top:43.6rem!important") + pos(`[data-cel=g0_ds]`, "top:47.6rem!important");
  sg += pos(`[data-el=sg_tg${i}]`, `left:${left};width:6rem;top:${t}rem`) + pos(`[data-el=sg_n${i}]`, `left:${left};width:6rem;top:${t + 1}rem`);
});
// お品書き：左に粉もん、右に鉄板焼きとお飲みもの。左のカードは写真を伸ばして右の列と下端をそろえる
const MT = 19, gap = 2.4;
const cardH = (i) => E[`mc_bg${i}`].layout.sp.h / 10;
const rightEnd = MT + cardH(1) + gap + cardH(2), extra = Math.round((rightEnd - MT - cardH(0)) * 10) / 10;
let mn = "";
[0, 1, 2].forEach((i) => {
  const col = i ? CR : CL, base = i === 2 ? MT + cardH(1) + gap : MT, shift = base - top(`mc_bg${i}`), ex = i ? 0 : extra;
  mn += pos(`[data-el=mc_bg${i}]`, `left:${col};width:${CW};top:${base}rem;height:${cardH(i) + ex}rem`);
  mn += pos(`[data-el=mc_ph${i}]`, `left:${col};width:${CW};top:${base}rem;height:${E[`mc_ph${i}`].layout.sp.h / 10 + ex}rem`);
  for (const k of ["mc_en", "mc_t", "mc_d", "mc_r"]) mn += pos(`[data-el="${k}${i}"]`, `left:calc(${col} + 2rem);width:calc(${CW} - 4rem);top:${Math.round((top(`${k}${i}`) + shift + ex) * 10) / 10}rem`);
  mn += pos(`[data-el="mc_r${i}"] .rep-card`, "width:100%!important");
});
// ご案内の行（PC と同じく項目と中身を横に並べる）
const infoRows = Object.keys(E).filter((k) => /^in_l\d+$/.test(k)).length;
let iy = 12.4, info = "";
for (let i = 0; i < infoRows; i++) {
  const two = (E[`in_v${i}`].paragraphs || []).length > 1, h = two ? 9.2 : 6.4;
  info += pos(`[data-el=in_l${i}]`, `left:${L};width:88%;top:${iy}rem`) + pos(`[data-el=in_k${i}]`, `left:${L};width:14%;top:${iy + 2}rem`) + pos(`[data-el=in_v${i}]`, `left:21%;width:73%;top:${iy + 1.9}rem`);
  iy += h;
}
const btnTop = Math.round((iy + 3.6) * 10) / 10, mapTop = btnTop + 9.6;
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${pos("[data-sec=sec_firstv]", "min-height:62rem")}
${pos("[data-el=fv_ph]", "left:52%;width:42%;top:4rem;height:52rem")}
${pos("[data-el=fv_kick]", `left:${L};width:42%;top:9rem`)}
${pos("[data-el=fv_name]", "left:5.6%;width:42%;top:12rem")}
${pos("[data-el=fv_copy]", `left:${L};width:42%;top:23rem`)}
${pos("[data-el=fv_line]", `left:${L};width:42%;top:33rem`)}
${[0, 1, 2].map((i) => pos(`[data-el=fv_k${i}]`, `left:${L};width:8%;top:${35.6 + i * 4}rem`) + pos(`[data-el=fv_v${i}]`, `left:15%;width:35%;top:${35.6 + i * 4}rem`)).join("")}
${pos("[data-sec=sec_signature]", `min-height:${SGS + SGH + 6}rem`)}
${rows(["sg_kick", "sg_h"], `left:${L};width:${W}`)}
${sg}
${pos("[data-sec=sec_menu]", `min-height:${Math.round((rightEnd + 9.6) * 10) / 10}rem`)}
${rows(["mn_kick", "mn_h"], `left:${L};width:${W}`)}
${mn}
${pos("[data-el=mn_note]", `left:${L};width:${W};top:${Math.round((rightEnd + 3) * 10) / 10}rem`)}
${pos("[data-sec=sec_about]", "min-height:60rem")}
${pos("[data-el=ab_ph]", "left:54%;width:40%;top:6rem;height:48rem")}
${rows(["ab_kick"], `left:${L};width:44%;top:6.6rem`)}
${rows(["ab_h"], `left:${L};width:44%;top:9.6rem`)}
${rows(["ab_p"], `left:${L};width:44%;top:15.6rem`)}
${rows(["ab_line"], `left:${L};width:44%;top:33rem`)}
${rows(["ab_sn0"], `left:${L};top:34.6rem`)}${rows(["ab_sl0"], `left:${L};width:18%;top:41.4rem`)}
${rows(["ab_sn1"], "left:28%;top:34.6rem")}${rows(["ab_sl1"], "left:28%;width:18%;top:41.4rem")}
${pos("[data-sec=sec_info]", `min-height:${mapTop + 44}rem`)}
${pos("[data-el=in_h]", `left:${L};width:88%`)}
${info}
${pos("[data-el=in_tel_b],[data-el=in_tel_t]", `left:${L};width:30%`)}
${pos("[data-el=in_map_b],[data-el=in_map_t]", "left:38%;width:30%")}
${pos("[data-el=in_tel_b],[data-el=in_map_b]", `top:${btnTop}rem`)}
${pos("[data-el=in_tel_t],[data-el=in_map_t]", `top:${btnTop + 1.4}rem`)}
${pos("[data-el=in_mapbox]", `left:${L};width:88%;top:${mapTop}rem;height:38rem`)}
${pos("[data-sec=sec_footer]", "min-height:36rem")}
${rows(["ft_name", "ft_addr"], `left:${L};width:44%`)}
${[0, 1, 2, 3].map((i) => pos(`[data-el=ft_n${i}]`, `left:${L};width:40%;top:${14 + i * 3.2}rem`)).join("")}
${pos("[data-el=ft_hk],[data-el=ft_hv],[data-el=ft_tk],[data-el=ft_tv]", `left:52%;width:42%`)}
${pos("[data-el=ft_hk]", "top:4.8rem")}
${pos("[data-el=ft_hv]", "top:7.2rem")}
${pos("[data-el=ft_tk]", "top:16.8rem")}
${pos("[data-el=ft_tv]", "top:19.2rem")}
${pos("[data-el=ft_copy]", `left:${L};width:88%;top:30.4rem`)}
}</style>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const mapQ = loc.geo ? `${loc.geo.lat},${loc.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&hl=ja`; // 緯度経度＋拡大率で Google の場所の札を出さない（G020）
const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="in_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("in_mapbox が見つかりません");
h = h.replace(re, `$1${map}`).replace("</head>", css + "</head>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h).replace("</head>", tablet + "</head>"));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa17-finish: 完了");
