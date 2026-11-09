#!/usr/bin/env node
// wa-14：描画エンジンに無いものを dist/<店> に足す（角を切った写真・行の罫線・ボタンのホバー・地図の埋め込み・文字のリンク・タブレットの配置）。
// node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = process.argv[2] || "lepivot";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const IV = "#F4EEE6", WI = "#6B1E2B", INK = "#1A1617", MS = "#C89B3C";
const pos = (sel, rules) => `${sel}{${rules}}`;
const cut = (n) => `clip-path:polygon(${n} 0,calc(100% - ${n}) 0,100% ${n},100% calc(100% - ${n}),calc(100% - ${n}) 100%,${n} 100%,0 calc(100% - ${n}),0 ${n})`;
const PH = "[data-el=fv_ph],[data-el=ab_ph],[data-cel=d_ph],[data-cel=a_ph],[data-cel=b_ph],[data-cel=c_ph]";
const css = `<style>
html{scroll-padding-top:8rem}
${PH}{${cut("2.8rem")}}
[data-el=fv_copy],[data-el=fv_name],[data-el=fv_ja]{white-space:normal}
[data-el=ca_rows] .rep-card,[data-el=vn_rows] .rep-card{border-top:1px solid ${MS}}
[data-el=in_tel_b],[data-el=in_map_b]{${cut("1rem")}}
[data-el=bd_ph] img{filter:sepia(.35) saturate(1.1)}
[data-el=in_tel_b]:hover{background:${INK}!important}
[data-el=in_map_b]:hover{background:${WI}!important}
[data-el=in_mapbox]{overflow:hidden}
[data-el=in_mapbox] iframe{width:100%;height:calc(100% + 150px);margin-top:-150px;border:0;display:block;filter:saturate(.75) sepia(.1)}
.el-nav .nav-menu a{color:${IV}!important}
.el-nav .nav-menu{background:${WI}}
.nav-sp summary{color:${INK}}
[data-cel$=_nm]{text-wrap:balance}
[data-el^=ab_p]{text-wrap:pretty}
a.el-text{text-decoration:none}
</style>`;
const row = (ids, rules) => ids.map((i) => pos(`[data-el=${i}]`, rules)).join("");
const L = "6%", AT = [26.4, 34.8, 45.4]; // 2 段目の文は 3 行になる
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${pos("[data-sec=sec_firstv]", "min-height:66rem")}
${pos("[data-el=fv_ph]", "left:52%;width:42%;top:5rem;height:56rem")}
${pos("[data-el=fv_ja]", `left:${L};width:44%;top:3rem`)}
${pos("[data-el=fv_name]", `left:${L};width:88%;top:5.9rem;height:18.2rem;font-size:14rem!important;line-height:18.2rem!important`)}
${pos("[data-el=fv_copy]", `left:${L};width:44%;top:26rem;height:8.5rem`)}
${pos("[data-el=fv_line]", `left:${L};width:42%;top:39rem`)}
${[0, 1, 2].map((i) => pos(`[data-el=fv_k${i}]`, `left:${L};width:10%;top:${41.6 + i * 4.6}rem`) + pos(`[data-el=fv_v${i}]`, `left:17%;width:32%;top:${41.6 + i * 4.6}rem`)).join("")}
${pos("[data-sec=sec_about]", "min-height:66rem")}
${pos("[data-el=ab_en]", `left:${L};width:50%;top:2.7rem;height:11.4rem;font-size:8.8rem!important;line-height:11.4rem!important`)}
${pos("[data-el=ab_ja]", `left:${L};width:46%;top:14.6rem`)}
${pos("[data-el=ab_h]", `left:${L};width:46%;top:17rem`)}
${[0, 1, 2].map((i) => pos(`[data-el=ab_l${i}]`, `left:${L};width:46%;top:${AT[i]}rem`) + pos(`[data-el=ab_n${i}]`, `left:${L};width:6%;top:${AT[i] + 1.4}rem`) + pos(`[data-el=ab_p${i}]`, `left:13%;width:39%;top:${AT[i] + 1.2}rem`)).join("")}
${row(["ab_sn0"], `left:${L};width:8%;top:52rem`)}${row(["ab_sl0"], "left:14%;width:13%;top:55rem")}
${row(["ab_sn1"], "left:29%;width:9%;top:52rem")}${row(["ab_sl1"], "left:38%;width:13%;top:55rem")}
${pos("[data-el=ab_ph]", "left:58%;width:36%;top:6rem;height:54rem")}
${pos("[data-sec=sec_band]", "min-height:42rem")}
${pos("[data-el=bd_ph]", "height:42rem")}
${pos("[data-el=bd_en]", `left:${L};width:88%;top:23.2rem;height:15.6rem;font-size:12rem!important;line-height:15.6rem!important`)}
${pos("[data-el=bd_ja]", `left:${L};width:88%;top:20.6rem`)}
${pos("[data-sec=sec_plats]", "min-height:88rem")}
${pos("[data-el=pl_en]", `left:${L};width:88%;top:2.7rem;height:11.4rem;font-size:8.8rem!important;line-height:11.4rem!important`)}
${pos("[data-el=pl_ja]", `left:${L};width:88%;top:14.6rem`)}
${pos('[data-el="pl_a"]', `left:${L};width:42%;top:18rem;height:62rem`)}
${pos('[data-el="pl_a"] .rep-card', "width:100%!important;height:62rem!important")}
${pos("[data-cel=a_ph]", "height:54rem!important")}
${pos("[data-cel=a_nm],[data-cel=a_pr]", "top:55.2rem!important")}
${pos('[data-el="pl_b"]', "left:52%;width:42%;top:18rem;height:30rem")}
${pos('[data-el="pl_b"] .rep-card', "width:100%!important;height:30rem!important")}
${pos('[data-el="pl_c"]', "left:52%;width:42%;top:51rem;height:30rem")}
${pos('[data-el="pl_c"] .rep-card', "width:100%!important;height:30rem!important")}
${pos("[data-el=pl_note]", `left:${L};width:88%;top:83rem`)}
${pos("[data-sec=sec_carte]", "min-height:54rem")}
${pos("[data-el=ca_en],[data-el=ca_ja]", `left:${L};width:46%`)}
${pos('[data-el="ca_rows"]', `left:${L};width:46%`)}
${pos('[data-el="ca_ph"]', "left:58%;width:36%;top:5rem;height:44rem")}
${pos('[data-el="ca_ph"] .rep-card', "width:100%!important;height:44rem!important")}
${pos("[data-cel=d_ph]", "height:37rem!important")}
${pos("[data-cel=d_nm]", "top:38.2rem!important;width:68%!important;font-size:1.8rem!important")}
${pos("[data-cel=d_pr]", "top:37.8rem!important;left:68%!important;width:32%!important")}
${pos("[data-sec=sec_wine]", "min-height:60rem")}
${pos("[data-el=vn_ph]", "left:52%;width:48%;top:0;height:60rem")}
${pos("[data-el=vn_en]", `left:${L};width:90%;top:3.5rem;height:16.25rem;font-size:12.5rem!important;line-height:16.25rem!important`)}
${pos("[data-el=vn_ja]", `left:${L};width:42%;top:21rem`)}
${pos("[data-el=vn_p]", `left:${L};width:42%;top:25.4rem`)}
${pos('[data-el="vn_rows"]', `left:${L};width:42%;top:33.4rem`)}
${pos("[data-el=vn_note]", `left:${L};width:42%;top:50rem`)}
${pos("[data-sec=sec_info]", "min-height:60rem")}
${pos("[data-el=in_en],[data-el=in_ja]", `left:${L};width:46%`)}
${pos("[data-el^=in_l],[data-el^=in_k],[data-el^=in_v]", `left:${L};width:44%`)}
${pos("[data-el=in_tel_b],[data-el=in_tel_t]", `left:${L};width:21%`)}
${pos("[data-el=in_map_b],[data-el=in_map_t]", "left:29%;width:21%")}
${pos("[data-el=in_mapbox]", "left:54%;width:40%;top:6rem;height:48rem")}
${pos("[data-sec=sec_footer]", "min-height:36rem")}
${pos("[data-el=ft_name],[data-el=ft_addr]", `left:${L};width:36%`)}
${pos("[data-el=ft_name]", "top:5rem")}
${pos("[data-el=ft_addr]", "top:9.6rem")}
${[0, 1, 2, 3].map((i) => pos(`[data-el=ft_n${i}]`, `left:44%;width:20%;top:${5 + i * 3.4}rem`)).join("")}
${pos("[data-el=ft_hk],[data-el=ft_hv],[data-el=ft_tk],[data-el=ft_tv]", "left:66%;width:30%")}
${pos("[data-el=ft_hk]", "top:5rem")}
${pos("[data-el=ft_hv]", "top:7.6rem;height:7.8rem")}
${pos("[data-el=ft_tk]", "top:16.8rem")}
${pos("[data-el=ft_tv]", "top:19.4rem")}
${pos("[data-el=ft_copy]", `left:${L};width:42%;top:30rem`)}
}</style>`;
const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="in_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("in_mapbox が見つかりません");
// 文字の箱のリンク（style.link）は描画エンジンが出力しないので <a> にする（共通の render.mjs の既知の不具合の回避）
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const hrefOf = (l) => (l.kind === "shopPhone" ? `tel:${shop.contact.phone.digits}` : l.kind === "anchor" ? `#${l.value.split("#")[1]}` : l.kind === "page" ? "./" : l.value);
for (const [id, el] of Object.entries(site.elements)) {
  const l = el.type === "text" && el.style?.link;
  if (!l) continue;
  const tag = new RegExp(`<p data-el="${id}"([^>]*)>([\\s\\S]*?)</p>`);
  if (!tag.test(h)) throw new Error(`${id} の文字の箱が見つかりません`);
  const attr = l.newTab ? ' target="_blank" rel="noopener"' : "";
  h = h.replace(tag, (_, a, body) => `<a data-el="${id}"${a} href="${hrefOf(l).replace(/&/g, "&amp;")}"${attr}>${body}</a>`);
}
h = h.replace(re, `$1${map}`).replace("</head>", css + "</head>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h).replace("</head>", tablet + "</head>"));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa14-finish: 完了");
