#!/usr/bin/env node
// wa-16：描画エンジンに無いものを dist/<店> に足す（文節での折り返し・行の罫線・丸いボタンと枠線・地図の埋め込み・写真の色味・タブレットの配置）。
// node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = process.argv[2] || "kunugi";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const BG = "#F2EEE6", INK = "#222222", AI = "#2D3E50", SOFT = "#D8D0C1", HOV = "#E6DFD2";
const pos = (sel, rules) => `${sel}{${rules}}`;
const css = `<style>
html{scroll-padding-top:8rem}
.lb{word-break:auto-phrase}
[data-el=mn_rows] .rep-card,[data-el=ip_rows] .rep-card{border-top:1px solid ${SOFT}}
[data-el=ip_rows] .rep-card:last-child{border-bottom:1px solid ${SOFT}}
[data-el=in_tel_b],[data-el=in_map_b]{border-radius:999px}
[data-el=in_map_b]{box-shadow:inset 0 0 0 1.5px ${AI}}
[data-sec=sec_info]:has([data-el=in_tel_t]:hover) [data-el=in_tel_b]{background:${INK}!important}
[data-sec=sec_info]:has([data-el=in_map_t]:hover) [data-el=in_map_b]{background:${HOV}!important}
[data-el=st_ph0] img{filter:sepia(.3) brightness(1.08) contrast(.95)}
[data-el=ip_sake] img{filter:sepia(.18) brightness(1.03)}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:100%;border:0;display:block;filter:saturate(.7) sepia(.08)}
.el-nav .nav-menu a{color:${BG}!important}
.el-nav .nav-menu{background:${AI}}
.nav-sp summary{color:${INK}}
[data-cel$=_nm]{text-wrap:balance}
[data-el=ab_p],[data-el^=st_p],[data-el=ip_p]{text-wrap:pretty}
</style>`;

// ---- タブレット（768〜1024）：スマホのデータを広げ、段ごとに PC に近い列へ組み直す
const L = "6%", R = "52%", RW = "42%";
const rows = (ids, rules) => ids.map((i) => pos(`[data-el="${i}"]`, rules)).join("");
const card = (rep, plc, rules) => pos(`[data-el="${rep}"] [data-card="${plc}"]`, rules);
// ご案内の行（PC と同じく項目と中身を横に並べる）
const infoRows = Object.keys(site.elements).filter((k) => /^in_l\d+$/.test(k)).length;
let iy = 12.4, info = "";
for (let i = 0; i < infoRows; i++) {
  const two = (site.elements[`in_v${i}`].paragraphs || []).length > 1, h = two ? 9.2 : 6.4;
  info += pos(`[data-el=in_l${i}]`, `left:${L};width:88%;top:${iy}rem`) + pos(`[data-el=in_k${i}]`, `left:${L};width:14%;top:${iy + 2}rem`) + pos(`[data-el=in_v${i}]`, `left:21%;width:73%;top:${iy + 1.9}rem`);
  iy += h;
}
const btnTop = Math.round((iy + 3.6) * 10) / 10, mapTop = btnTop + 9.6;
const soba = ["plc_m001", "plc_m005", "plc_m003", "plc_m006"];
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${pos("[data-sec=sec_firstv]", "min-height:64rem")}
${pos("[data-el=fv_ph]", "left:54%;width:40%;top:2rem;height:58rem")}
${pos("[data-el=fv_kick]", `left:${L};width:44%;top:9rem`)}
${pos("[data-el=fv_name]", `left:5.6%;width:44%;top:12rem`)}
${pos("[data-el=fv_copy]", `left:${L};width:44%;top:22rem`)}
${pos("[data-el=fv_line]", `left:${L};width:44%;top:33rem`)}
${[0, 1, 2].map((i) => pos(`[data-el=fv_k${i}]`, `left:${L};width:7%;top:${35.4 + i * 4}rem`) + pos(`[data-el=fv_v${i}]`, `left:14%;width:38%;top:${35.4 + i * 4}rem`)).join("")}
${pos("[data-sec=sec_about]", "min-height:64rem")}
${pos("[data-el=ab_ph]", `left:${L};width:40%;top:6rem;height:52rem`)}
${pos("[data-el=ab_kick]", `left:${R};width:${RW};top:7rem`)}
${pos("[data-el=ab_h]", `left:${R};width:${RW};top:10.2rem`)}
${pos("[data-el=ab_p]", `left:${R};width:${RW};top:21rem`)}
${pos("[data-el=ab_line]", `left:${R};width:${RW};top:39rem`)}
${rows(["ab_sn0"], `left:${R};top:41rem`)}${rows(["ab_sl0"], `left:${R};width:16%;top:48.4rem`)}
${rows(["ab_sn1"], "left:68%;top:41rem")}${rows(["ab_sl1"], "left:68%;width:16%;top:48.4rem")}
${pos("[data-sec=sec_steps]", "min-height:84rem")}
${rows(["st_kick", "st_h", "st_lead"], `left:${L};width:88%`)}
${[0, 1, 2].map((i) => { const x = 6 + i * 30; return pos(`[data-el=st_n${i}]`, `left:${x}%;width:4%;top:20.4rem`) + pos(`[data-el=st_l${i}]`, `left:${x + 4.4}%;width:23.6%;top:22rem`) + pos(`[data-el=st_ph${i}]`, `left:${x}%;width:28%;top:25.6rem;height:32rem`) + pos(`[data-el=st_v${i}]`, `left:${x}%;width:28%;top:59.6rem`) + pos(`[data-el=st_p${i}]`, `left:${x}%;width:28%;top:65.4rem`); }).join("")}
${pos("[data-sec=sec_menu]", "min-height:108rem")}
${rows(["mn_kick", "mn_h", "mn_note"], `left:${L};width:88%`)}
${pos('[data-el="mn_cards"]', `left:${L};width:88%;top:15rem;height:72.4rem`)}
${soba.map((p, i) => card("mn_cards", p, `left:${i % 2 ? "calc(50% + 1.2rem)" : "0"}!important;top:${Math.floor(i / 2) * 37.4}rem!important;width:calc(50% - 1.2rem)!important;height:35rem!important`)).join("")}
${pos('[data-el="mn_cards"] [data-cel=c_ph]', "height:26rem!important")}
${pos('[data-el="mn_cards"] [data-cel=c_nm]', "top:27.2rem!important")}
${pos('[data-el="mn_cards"] [data-cel=c_pr]', "top:27.6rem!important")}
${pos("[data-el=mn_more]", `left:${L};width:88%;top:91rem`)}
${pos('[data-el="mn_rows"]', `left:${L};width:88%;top:94rem;height:6.4rem`)}
${["plc_m002", "plc_m004"].map((p, i) => card("mn_rows", p, `left:${i ? "calc(50% + 1.2rem)" : "0"}!important;top:0!important;width:calc(50% - 1.2rem)!important`)).join("")}
${pos("[data-el=mn_note]", "top:102.4rem")}
${pos("[data-sec=sec_ippin]", "min-height:62rem")}
${pos('[data-el="ip_sake"]', `left:${L};width:40%;top:6rem;height:50rem`)}
${pos('[data-el="ip_sake"] .rep-card', "width:100%!important;height:50rem!important")}
${pos("[data-cel=k_ph]", "height:42rem!important")}
${pos("[data-cel=k_nm],[data-cel=k_pr]", "top:43.4rem!important")}
${rows(["ip_kick"], `left:${R};width:${RW};top:7rem`)}
${rows(["ip_h"], `left:${R};width:${RW};top:10.2rem`)}
${rows(["ip_p"], `left:${R};width:${RW};top:19.6rem`)}
${pos('[data-el="ip_rows"]', `left:${R};width:${RW};top:27rem`)}
${pos('[data-el="ip_rows"] .rep-card', "width:100%!important")}
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
${pos("[data-el=ft_hk],[data-el=ft_hv],[data-el=ft_tk],[data-el=ft_tv]", `left:${R};width:${RW}`)}
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
console.log("wa16-finish: 完了");
