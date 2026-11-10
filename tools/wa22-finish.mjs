#!/usr/bin/env node
// wa-22：描画エンジンに無いものを dist/<店> に足す（wa20-finish を元にした）。文節での折り返し・写真の角丸・味の丸（円と白の輪）・旬の札の角・
// 持ち帰りの行のピルの枠・ボタンの押したときの色・地図の埋め込み・タブレット（768〜1024）の配置。
// node tools/build.mjs samples/<店> の後に実行する。
import fs from "node:fs";
const ID = process.argv[2] || "sunao";
const OUT = `dist/${ID}`;
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa22.json`, "utf8"));
const BP = 1025, TAB = 768;
const loc = shop.location, addr = `${loc.prefecture}${loc.city}${loc.town}`;
const MILK = "#FFF8EE", CHOCO = "#4A2E25", HOV = "#6B4A3E", MHOV = "#F3E6D3";
const E = site.elements;
const pos = (sel, rules) => `${sel}{${rules}}`;
const fl = (id) => C.flavors[id] || {};
// 白い味（ミルク）の丸に輪、旬の札が無い味は札の箱を消す
const ring = [...C.classicPick.map((id, i) => [id, `c${i}_dot`]), ...C.seasonPick.map((id, i) => [id, `k${i}_dot`])].filter(([id]) => fl(id).ring).map(([, c]) => `[data-cel=${c}]`).join(",");
const noTag = C.seasonPick.map((id, i) => [id, i]).filter(([id]) => !fl(id).tag).map(([, i]) => `[data-cel=k${i}_tb]`).join(",");
const css = `<style>
html{scroll-padding-top:8rem}
.lb{word-break:auto-phrase}
.el-shape-circle{border-radius:50%}
${ring ? `${ring}{box-shadow:inset 0 0 0 2px ${CHOCO}}` : ""}
${noTag ? `${noTag}{display:none}` : ""}
[data-cel$=_tb]{border-radius:4px}
[data-el=fv_ph],[data-el=fv_ph] img{border-radius:2.4rem;overflow:hidden}
[data-el=fl_ph],[data-el=fl_ph] img,[data-cel^=z][data-cel$=_ph],[data-cel^=z][data-cel$=_ph] img{border-radius:1.6rem;overflow:hidden}
[data-el^=cr_ph],[data-el^=cr_ph] img{border-radius:1.2rem;overflow:hidden}
[data-cel=to_bx]{border-radius:2.4rem;box-shadow:inset 0 0 0 2px ${CHOCO}}
@media (max-width:${BP - 0.02}px){[data-el=fl_board]{border-radius:2.4rem!important}}
[data-el=ac_mapbox]{overflow:hidden;border-radius:2.4rem!important}
[data-el=ac_mapbox] iframe{width:100%;height:100%;border:0;display:block}
[data-sec=sec_header]:has([data-el=hd_tel_t]:hover) [data-el=hd_tel_b],[data-sec=sec_access]:has([data-el=ac_tel_t]:hover) [data-el=ac_tel_b]{background:${HOV}!important}
[data-sec=sec_access]:has([data-el=ac_map_t]:hover) [data-el=ac_map_b]{background:${MHOV}!important}
.el-nav .nav-menu a{color:${CHOCO}!important}
.el-nav .nav-menu{background:${MILK}}
.nav-sp summary{color:${CHOCO}}
@media (max-width:767.9px){[data-el=tp_a],[data-el=tp_b]{text-align:center!important}[data-cel^=c][data-cel$=_nm],[data-cel^=c][data-cel$=_en],[data-el=fq_h],[data-el=sea_t]{text-align:left!important}}
[data-cel$=_ds],[data-el^=cr_tx],[data-el=cr_p],[data-el^=fq_a],[data-el=fl_p],[data-el=sz_p]{text-wrap:pretty}
</style>`;

// ---- タブレット（768〜1024）：:root を 10px にしてスマホのデータを広げ、段ごとに配置を組み直す（1rem＝設計の 10px）
const L = "6%", W = "88%";
const all = (ids, rules) => ids.map((i) => pos(`[data-el="${i}"]`, rules)).join("");
const cel = (id, rules) => pos(`[data-cel=${id}]`, rules.split(";").map((x) => x && `${x}!important`).join(";"));
let tb = "";
// ヘッダー：電話のピルはナビの手前に固定の幅で
tb += all(["hd_tel_b", "hd_tel_t"], "left:calc(100% - 18rem);width:10rem");
tb += pos("[data-el=hd_nav]", "left:calc(100% - 6.4rem);width:4.4rem");
tb += pos("[data-sec=sec_topbar]", "min-height:4.4rem") + pos("[data-el=tp_a]", "left:6%;width:43%;top:1.2rem;text-align:right") + pos("[data-el=tp_b]", "left:51%;width:43%;top:1.2rem;text-align:left");
// 最初の画面：左に文字組（40%）、右に写真（40%）。ピスタチオの円は写真の左下
tb += pos("[data-sec=sec_firstv]", "min-height:68rem");
tb += pos("[data-el=fv_kick]", `left:${L};width:40%;top:6rem`);
tb += pos("[data-el=fv_en]", "left:5.6%;width:42%;top:9.4rem;font-size:8.8rem;line-height:11.6rem");
tb += pos("[data-el=fv_copy]", `left:${L};width:40%;top:37rem;font-size:2.8rem`);
tb += pos("[data-el=fv_p]", `left:${L};width:40%;top:46.4rem`);
for (let i = 0; i < 10; i++) tb += pos(`[data-el=fv_d${i}]`, `left:calc(6% + ${i * 3.2}rem);width:2.6rem;height:2.6rem;top:53rem`);
tb += pos("[data-el=fv_note]", `left:${L};width:40%;top:56.4rem`);
tb += pos("[data-el=fv_ph]", "left:54%;width:40%;top:5rem;height:54rem");
tb += pos("[data-el=fv_badge]", "left:calc(54% - 5.2rem);width:10.4rem;top:52rem");
tb += all(["fv_b1", "fv_b2", "fv_b3"], "left:calc(54% - 5.2rem);width:10.4rem");
tb += pos("[data-el=fv_b1]", "top:53.6rem") + pos("[data-el=fv_b2]", "top:55rem") + pos("[data-el=fv_b3]", "top:59.4rem");
// 今日の味：定番は 3 列＋2 列（丸を上に）、季節の板は写真が左・行が右
tb += pos("[data-sec=sec_flavors]", "min-height:165rem");
tb += pos("[data-el=fl_giant]", `left:5.6%;width:${W};top:3.6rem;font-size:7.2rem;line-height:9.6rem`);
tb += pos("[data-el=fl_en]", `left:${L};width:${W};top:13.6rem`) + pos("[data-el=fl_h]", `left:${L};width:${W};top:16rem`) + pos("[data-el=fl_p]", `left:${L};width:${W};top:22rem`);
tb += pos("[data-el=fl_ch]", `left:${L};width:5rem;top:29rem`) + pos("[data-el=fl_ce]", "left:calc(6% + 5.4rem);width:14rem;top:29.6rem") + pos("[data-el=fl_cs]", "left:54%;width:40%;top:29.6rem");
tb += pos("[data-el=fl_cl]", `left:${L};width:${W};top:33.4rem`);
const COLS = ["6%", "36%", "66%"];
C.classicPick.forEach((_, i) => {
  const p = `c${i}`, top = i < 3 ? 36 : 63;
  tb += pos(`[data-el=fl_c${i}]`, `left:${COLS[i % 3]};width:28%;top:${top}rem;height:25rem`) + pos(`[data-el=fl_c${i}] .rep-card`, "width:100%!important;height:25rem!important");
  tb += cel(`${p}_dot`, "left:calc(50% - 5.6rem);width:11.2rem;height:11.2rem;top:0");
  tb += cel(`${p}_nm`, "left:0;width:100%;top:12.6rem;text-align:center");
  tb += cel(`${p}_en`, "left:0;width:100%;top:15.6rem;text-align:center");
  tb += cel(`${p}_ds`, "left:0;width:100%;top:18rem;height:7.2rem");
});
tb += pos("[data-el=fl_board]", `left:${L};width:${W};top:92rem;height:66rem`);
tb += pos("[data-el=fl_ph]", "left:10%;width:34%;top:96rem;height:42rem");
tb += pos("[data-el=fl_pick]", "left:10%;width:34%;top:139.6rem");
tb += pos("[data-el=fl_sh]", "left:48%;width:5rem;top:96rem") + pos("[data-el=fl_se]", "left:calc(48% + 5.2rem);width:12rem;top:96.6rem") + pos("[data-el=fl_ss]", "left:76%;width:14%;top:96.6rem");
C.seasonPick.forEach((_, i) => { tb += pos(`[data-el=fl_k${i}]`, `left:48%;width:42%;top:${101 + i * 11}rem`) + pos(`[data-el=fl_k${i}] .rep-card`, "width:100%!important"); });
// サイズと値段：3 列の千鳥（0・6・12rem ずらす）。写真はカードの幅の 2:3（cqw）
tb += pos("[data-sec=sec_sizes]", "min-height:calc(80rem + 42vw)");
C.sizes.forEach((_, i) => {
  const p = `z${i}`, top = 22 + i * 6;
  tb += pos(`[data-el=sz_c${i}]`, `left:${COLS[i]};width:28%;top:${top}rem;height:calc(42vw + 23rem);container-type:inline-size`) + pos(`[data-el=sz_c${i}] .rep-card`, "width:100%!important;height:calc(150cqw + 23rem)!important");
  tb += cel(`${p}_tl`, "left:0;width:62%;top:0") + cel(`${p}_tr`, "left:62%;width:38%;top:0");
  tb += cel(`${p}_ph`, "left:0;width:100%;top:2.6rem;height:150cqw");
  tb += cel(`${p}_en`, "left:0;width:100%;top:calc(150cqw + 4.4rem);font-size:3.2rem;line-height:4rem");
  tb += cel(`${p}_nm`, "left:0;width:100%;top:calc(150cqw + 8.8rem)");
  tb += cel(`${p}_ds`, "left:0;width:100%;top:calc(150cqw + 11.8rem)");
  tb += cel(`${p}_pr`, "left:0;width:100%;top:calc(150cqw + 19rem)");
});
tb += pos("[data-el=sz_to]", `left:${L};width:${W};top:calc(63rem + 42vw);height:8.8rem`) + pos("[data-el=sz_to] .rep-card", "width:100%!important;height:8.8rem!important");
tb += cel("to_bx", "height:8.8rem") + cel("to_nm", "left:4%;width:34%;top:2.9rem") + cel("to_ds", "left:39%;width:37%;top:2rem") + cel("to_pr", "left:76%;width:20%;top:2.4rem");
tb += pos("[data-el=sz_note]", `left:${L};width:${W};top:calc(74rem + 42vw)`);
// 毎朝のこと：見出しを横書きで上に、材料は 2 列
tb += pos("[data-sec=sec_craft]", "min-height:122rem");
tb += pos("[data-el=cr_en]", `left:${L};width:${W};top:5.6rem;text-align:left`);
tb += pos("[data-el=cr_h]", `left:${L};width:${W};top:8.4rem;height:auto;writing-mode:horizontal-tb;white-space:normal;font-size:3.2rem;line-height:4.8rem`);
tb += pos("[data-el=cr_p]", `left:${L};width:${W};top:19.4rem`);
C.craft.forEach((_, i) => {
  const cx = i % 2 ? "52%" : "6%", top = 30 + Math.floor(i / 2) * 44;
  tb += pos(`[data-el=cr_ph${i}]`, `left:${cx};width:42%;top:${top}rem;height:24rem`);
  tb += pos(`[data-el=cr_nb${i}]`, `left:${cx};width:4.4rem;top:${top + 25.6}rem`) + pos(`[data-el=cr_nt${i}]`, `left:${cx};width:4.4rem;top:${top + 26.7}rem`);
  tb += pos(`[data-el=cr_nm${i}]`, `left:calc(${cx} + 5.8rem);width:calc(42% - 5.8rem);top:${top + 26.4}rem`);
  tb += pos(`[data-el=cr_tx${i}]`, `left:${cx};width:42%;top:${top + 31.4}rem`);
});
// 海辺の写真の帯
tb += pos("[data-sec=sec_seaside]", "min-height:40rem") + pos("[data-el=sea_ph]", "height:30rem") + pos("[data-el=sea_t]", `left:${L};width:${W};top:32.6rem`);
// よくある質問：2 列
tb += pos("[data-sec=sec_faqs]", "min-height:62rem");
tb += pos("[data-el=fq_giant]", `left:5.6%;width:${W};top:4.6rem;font-size:8rem;line-height:10.6rem`) + pos("[data-el=fq_h]", `left:${L};width:${W};top:15.6rem`);
C.faq.forEach((_, i) => {
  const cx = i % 2 ? "52%" : "6%", top = 21 + Math.floor(i / 2) * 20;
  tb += pos(`[data-el=fq_l${i}]`, `left:${cx};width:42%;top:${top}rem`) + pos(`[data-el=fq_m${i}]`, `left:${cx};width:3rem;top:${top + 2}rem`);
  tb += pos(`[data-el=fq_q${i}]`, `left:calc(${cx} + 3.2rem);width:calc(42% - 3.2rem);top:${top + 1.9}rem`) + pos(`[data-el=fq_a${i}]`, `left:${cx};width:42%;top:${top + 8.4}rem`);
});
// お店の案内：1 列（括弧の札と値を横に、ボタン 2 つ、地図は全幅）
tb += pos("[data-sec=sec_access]", "min-height:100rem");
C.acRows.forEach((_, i) => {
  const top = 20.4 + i * 4.6;
  tb += pos(`[data-el=ac_l${i}]`, `left:${L};width:${W};top:${top}rem`) + pos(`[data-el=ac_k${i}]`, `left:${L};width:14%;top:${top + 1}rem`) + pos(`[data-el=ac_v${i}]`, `left:22%;width:72%;top:${top + 1}rem`);
});
tb += all(["ac_tel_b", "ac_tel_t"], `left:${L};width:30%`) + all(["ac_map_b", "ac_map_t"], "left:38%;width:30%");
tb += all(["ac_tel_b", "ac_map_b"], "top:45.4rem") + all(["ac_tel_t", "ac_map_t"], "top:46.7rem");
tb += pos("[data-el=ac_mapbox]", `left:${L};width:${W};top:53rem;height:42rem`);
// フッター：左に店名と住所・電話、右にナビ
tb += pos("[data-sec=sec_footer]", "min-height:36rem");
tb += all(["ft_name", "ft_line", "ft_ak", "ft_av", "ft_tk", "ft_tv"], `left:${L};width:44%`);
tb += pos("[data-el=ft_ak]", "top:12.8rem") + pos("[data-el=ft_av]", "top:15rem") + pos("[data-el=ft_tk]", "top:19.4rem") + pos("[data-el=ft_tv]", "top:21.6rem");
C.nav.forEach((_, i) => { tb += pos(`[data-el=ft_n${i}]`, `left:56%;width:38%;top:${4 + i * 3.2}rem`); });
tb += pos("[data-el=ft_copy]", `left:${L};width:${W};top:29rem`);
const tablet = `<style>@media (min-width:${TAB}px) and (max-width:${BP - 0.02}px){
:root{font-size:10px}
.cbox{width:100%}
.cbox>.el{transform:none!important}
${tb}
}</style>`;

const f = `${OUT}/index.html`;
let h = fs.readFileSync(f, "utf8");
const mapQ = loc.geo ? `${loc.geo.lat},${loc.geo.lng}&z=16&hl=ja` : `${encodeURIComponent(addr)}&hl=ja`; // 緯度経度＋拡大率で Google の場所の札を出さない（G020）
const map = `<iframe title="${shop.basic.name}の周辺の地図" src="https://www.google.com/maps?q=${mapQ}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const re = /(<div data-el="ac_mapbox"[^>]*>)/;
if (!re.test(h)) throw new Error("ac_mapbox が見つかりません");
h = h.replace(re, `$1${map}`).replace("</head>", css + "</head>");
const bp = (x) => x.split("min-width:768px").join(`min-width:${BP}px`).split("max-width:767.98px").join(`max-width:${BP - 0.02}px`).split("innerWidth<768").join(`innerWidth<${BP}`);
fs.writeFileSync(f, bp(h).replace("</head>", tablet + "</head>"));
const nf = `${OUT}/404.html`; fs.writeFileSync(nf, bp(fs.readFileSync(nf, "utf8")));
console.log("wa22-finish: 完了");
