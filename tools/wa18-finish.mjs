#!/usr/bin/env node
// wa-18：描画エンジンに無いものを dist/<店> に足す（文節での折り返し・品の行の罫線・ボタンの枠線・地図の埋め込み・タブレットの配置）。
// node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = process.argv[2] || "tento";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const BG = "#F2EBDD", INK = "#1F1D1B", JADE = "#2F5D50", RULE = "#CFC3AA", JDARK = "#264D42", HOV = "#E6DCC8";
const E = site.elements;
const pos = (sel, rules) => `${sel}{${rules}}`;
const css = `<style>
html{scroll-padding-top:8rem}
.lb{word-break:auto-phrase}
[data-el^=pl_r] .rep-card{border-top:1px solid ${RULE};border-bottom:1px solid ${RULE}}
[data-el=in_map_b]{box-shadow:inset 0 0 0 2px ${BG}}
[data-sec=sec_about]:has([data-el=rm_tel_t]:hover) [data-el=rm_tel_b]{background:${JDARK}!important}
[data-sec=sec_info]:has([data-el=in_tel_t]:hover) [data-el=in_tel_b]{background:${HOV}!important}
[data-sec=sec_info]:has([data-el=in_map_t]:hover) [data-el=in_map_b]{background:${JDARK}!important}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:100%;border:0;display:block;filter:saturate(.8)}
.el-nav .nav-menu a{color:${INK}!important}
.el-nav .nav-menu{background:${BG}}
.nav-sp summary{color:${INK}}
[data-cel$=_ds],[data-el=ab_p],[data-el=rm_p]{text-wrap:pretty}
</style>`;

// ---- タブレット（768〜1024）：スマホのデータを広げ、段ごとに PC に近い列へ組み直す
const L = "6%", W = "88%", CL = "6%", CR = "52%", CW = "42%";
const rows = (ids, rules) => ids.map((i) => pos(`[data-el="${i}"]`, rules)).join("");
const three = ["6%", "36%", "66%"], TW = "28%";
// 点心：三列。写真はカードの幅の正方形（コンテナの単位 cqw）。札と値段は写真の下端から置く
const DT = 22;
let ds = "";
[0, 1, 2].forEach((i) => {
  ds += pos(`[data-el="ds_c${i}"]`, `left:${three[i]};width:${TW};top:${DT}rem;height:calc(28vw + 13rem);container-type:inline-size`);
  ds += pos(`[data-el="ds_c${i}"] .rep-card`, "width:100%!important;height:calc(100cqw + 13rem)!important");
  ds += pos(`[data-cel=d${i}_ph]`, "height:100cqw!important");
  ds += pos(`[data-cel=d${i}_tg],[data-cel=d${i}_nm]`, "left:calc(100% - 7.2rem)!important;width:5.6rem!important");
  ds += pos(`[data-cel=d${i}_sl]`, "left:calc(100% - 4.9rem)!important;width:1rem!important");
  ds += pos(`[data-cel=d${i}_pp]`, "top:calc(100cqw - 4.8rem)!important");
  ds += pos(`[data-cel=d${i}_pr]`, "top:calc(100cqw - 3.7rem)!important");
  ds += pos(`[data-cel=d${i}_ds]`, "top:calc(100cqw + 1.6rem)!important");
});
// 一品料理：二列のカード、写真の無い品は三列
const PT = 17, PCH = 33, RT = PT + PCH + 3;
let pl = "";
[0, 1].forEach((i) => { pl += pos(`[data-el="pl_c${i}"]`, `left:${i ? "51%" : L};width:43%;top:${PT}rem`) + pos(`[data-el="pl_c${i}"] .rep-card`, "width:100%!important"); });
[0, 1, 2].forEach((i) => { pl += pos(`[data-el="pl_r${i}"]`, `left:${three[i]};width:${TW};top:${RT}rem`) + pos(`[data-el="pl_r${i}"] .rep-card`, "width:100%!important"); });
// ご案内の行（PC と同じく項目と中身を横に並べる）
const infoRows = Object.keys(E).filter((k) => /^in_l\d+$/.test(k)).length;
let iy = 15.4, info = "";
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
${pos("[data-sec=sec_firstv]", "min-height:66rem")}
${pos("[data-el=fv_ph]", "left:52%;width:42%;top:4rem;height:56rem")}
${pos("[data-el=fv_kick]", `left:${L};width:42%;top:8rem`)}
${pos("[data-el=fv_name]", "left:5.5%;width:42%;top:11rem")}
${pos("[data-el=fv_en]", `left:${L};width:42%;top:24rem`)}
${pos("[data-el=fv_seal]", `left:${L};top:28.6rem`)}
${pos("[data-el=fv_copy]", `left:${L};width:42%;top:31rem`)}
${[0, 1, 2, 3].map((i) => pos(`[data-el=fv_k${i}]`, `left:${L};width:8%;top:${42 + i * 3.6}rem`) + pos(`[data-el=fv_v${i}]`, `left:15%;width:36%;top:${42 + i * 3.6}rem`)).join("")}
${pos("[data-sec=sec_dimsum]", `min-height:calc(${DT + 19}rem + 28vw)`)}
${rows(["ds_en", "ds_h", "ds_p"], `left:${L};width:${W}`)}
${pos("[data-el=ds_p]", "top:14.4rem")}
${ds}
${pos("[data-sec=sec_plates]", `min-height:${RT + 14}rem`)}
${rows(["pl_en", "pl_h"], `left:${L};width:${W}`)}
${pl}
${pos("[data-el=pl_note]", `left:${L};width:${W};top:${RT + 9}rem`)}
${pos("[data-sec=sec_about]", "min-height:86rem")}
${pos("[data-el=ab_ph]", `left:${L};width:${CW};top:6rem;height:30rem`)}
${rows(["ab_en"], `left:${CR};width:${CW};top:6.6rem`)}
${rows(["ab_h"], `left:${CR};width:${CW};top:9.6rem`)}
${rows(["ab_p"], `left:${CR};width:${CW};top:19rem`)}
${pos("[data-el=rm_ph]", `left:${CR};width:${CW};top:42rem;height:30rem`)}
${rows(["cs_en"], `left:${L};width:${CW};top:42.6rem`)}
${pos("[data-el=cs_c]", `left:${L};width:${CW};top:45.6rem`)}${pos("[data-el=cs_c] .rep-card", "width:100%!important")}
${rows(["cs_line"], `left:${L};width:${CW};top:63rem`)}
${rows(["rm_p"], `left:${L};width:${CW};top:64.6rem`)}
${pos("[data-el=rm_tel_b]", `left:${L};width:30%;top:76rem`)}${pos("[data-el=rm_tel_t]", `left:${L};width:30%;top:77.4rem`)}
${pos("[data-sec=sec_info]", `min-height:${mapTop + 44}rem`)}
${rows(["in_en", "in_h"], `left:${L};width:88%`)}
${info}
${pos("[data-el=in_tel_b],[data-el=in_tel_t]", `left:${L};width:30%`)}
${pos("[data-el=in_map_b],[data-el=in_map_t]", "left:38%;width:30%")}
${pos("[data-el=in_tel_b],[data-el=in_map_b]", `top:${btnTop}rem`)}
${pos("[data-el=in_tel_t],[data-el=in_map_t]", `top:${btnTop + 1.4}rem`)}
${pos("[data-el=in_mapbox]", `left:${L};width:88%;top:${mapTop}rem;height:38rem`)}
${pos("[data-sec=sec_footer]", "min-height:36rem")}
${rows(["ft_name", "ft_addr"], `left:${L};width:44%`)}
${[0, 1, 2, 3].map((i) => pos(`[data-el=ft_n${i}]`, `left:${L};width:40%;top:${14 + i * 3.2}rem`)).join("")}
${pos("[data-el=ft_hk],[data-el=ft_hv],[data-el=ft_tk],[data-el=ft_tv]", "left:52%;width:42%")}
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
console.log("wa18-finish: 完了");
