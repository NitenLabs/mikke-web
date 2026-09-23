#!/usr/bin/env node
// 第2部 clone §2.2：覆った参照元の実測（elements-pc/sp.json）から、再現サンプル samples/clone-q65/ を生成する。
//   - 文字要素 → 自由な仮の文字（覆いと同じ）＋実測の書体/大きさ/行送り/太さ/字間/色/揃え
//   - 画像 → 灰色 #9A9A9A の図形（shape rect）。FV の全面ヒーロー（WebGL＝要素に出ない）は 0,0,1440,720 で明示的に足す
//   - 位置は実測どおり（x・w は％、y・h は px）。isSample:true・lineBreakRules:false（改行の規則を切る）
// 使い方: node tools/clone-gen.mjs
import fs from "node:fs";
import path from "node:path";

const REF = "refs/studio-Q65qmmvqVR/masked";
const OUT = "samples/clone-q65";
const PCW = 1440, SPW = 390;
const pc = JSON.parse(fs.readFileSync(path.join(REF, "elements-pc.json"), "utf8"));
const sp = JSON.parse(fs.readFileSync(path.join(REF, "elements-sp.json"), "utf8"));

// フォント名 → ID
const fontId = (f) => (f && f.includes("Old Mincho") ? "font:heading" : "font:body");
// 参照元のセクション境界（PC の y。report.md 実測）＋ヘッダー・フッター
const SECS = [
  { id: "sec_hero", name: "FV", y0: 0, y1: 757 },
  { id: "sec_about", name: "ABOUT", y0: 758, y1: 1815 },
  { id: "sec_feature", name: "FEATURE", y0: 1816, y1: 3217 },
  { id: "sec_price", name: "PRICE", y0: 3218, y1: 4734 },
  { id: "sec_faqs", name: "FAQ", y0: 4735, y1: 5362 },
  { id: "sec_contact", name: "CONTACT", y0: 5363, y1: 5952 },
  { id: "sec_footer", name: "FOOTER", y0: 5953, y1: 99999 },
];
// PC のセクション高さ（固定・report.md 実測）。SP 対応づけ（matchSp）で相対位置の分母に使う。
const secHeightPc = { sec_hero: 758, sec_about: 1058, sec_feature: 1402, sec_price: 1517, sec_faqs: 628, sec_contact: 590, sec_footer: Math.round(pc.docH - 5953), sec_header: 88 };
const pcTopOf = (s) => (s.id === "sec_header" ? 0 : s.y0);
const HEADER_Y = 90; // これ未満はヘッダー（ロゴ・ナビ）＝FVに重ねる

// --- SP のセクション上端（spTop）を実測の色面から求める。SP の sp.docH は footer 展開前の古い値
//     （実測 6363 だが要素・面は 7200 まで伸びる）なので使わず、展開後の要素・面の y を使う。
//     全幅の色面がセクションの地：#EEEEEE=feature/faqs・#333333=contact/footer・スクリム=hero。
//     白いセクション（about/price）は色面が無いので、直前セクションの色面の下端から始める。順番は固定。 ---
const spTall = (sp.surfaces || []).filter((s) => s.w >= SPW * 0.95 && s.h >= 80).sort((a, b) => a.y - b.y);
const eee = spTall.filter((s) => s.color === "#EEEEEE");
const d333 = spTall.filter((s) => s.color === "#333333");
const scrim = spTall.find((s) => s.color === "#000000" || s.color === "#9A9A9A") || { y: 0, h: 0 };
const newsBand = (sp.surfaces || []).find((s) => s.color === "#333333" && s.w >= SPW * 0.95 && s.h < 80 && s.y >= scrim.y + scrim.h - 4 && s.y <= scrim.y + scrim.h + 60);
const spMaxBottom = Math.max(...sp.elements.map((e) => e.y + e.h), ...(sp.surfaces || []).map((s) => s.y + s.h));
const spTop = {
  sec_header: 0, sec_hero: 0,
  sec_about: newsBand ? newsBand.y + newsBand.h : scrim.y + scrim.h,
  sec_feature: eee[0] ? eee[0].y : 1414,
  sec_price: eee[0] ? eee[0].y + eee[0].h : 2572,
  sec_faqs: eee[1] ? eee[1].y : 4791,
  sec_contact: d333[0] ? d333[0].y : 6153,
  sec_footer: d333[1] ? d333[1].y : 6632,
};
const spOrder = ["sec_hero", "sec_about", "sec_feature", "sec_price", "sec_faqs", "sec_contact", "sec_footer"];
const spNextTop = {}; spOrder.forEach((s, i) => { spNextTop[s] = i + 1 < spOrder.length ? spTop[spOrder[i + 1]] : spMaxBottom; });
// ヘッダーは SP では折りたたみメニュー＝ナビ項目が SP に出ない。範囲を狭く（ロゴだけ拾える y<90）にして、
// PC ナビ項目（セクション名と同じ仮の文字＝各セクションの英字ラベルと衝突）が SP の英字ラベルを横取り
// するのを防ぐ（横取りするとラベルが PC 値へフォールバックして SP でずれる）。
spNextTop.sec_header = 90;

// SP 要素を「仮の文字（text）」で対にする。同じ仮の文字が別セクションに出る（ヘッダーとフッターの
// ナビ等）と取り違えるので、まず PC 側のセクションの SP 範囲（spTop..次のspTop）に入る候補から選ぶ。
const spByText = {};
for (const e of sp.elements) { if (!e.text) continue; (spByText[e.text] ??= []).push(e); }
const spUsed = new Set();
function matchSp(e, s) {
  if (!e.text) return null;
  const list = spByText[e.text]; if (!list) return null;
  const spTopS = spTop[s.id] ?? 0, spH = ((spNextTop[s.id] ?? spMaxBottom) - spTopS) || 1;
  const lo = spTopS - 40, hi = spTopS + spH + 40;
  // 同じ仮の文字が同一セクションに複数あるとき（ロゴ y 上端 と 見出し 等）は、PC でのセクション内の
  // 相対位置（上端からの割合）が最も近い候補を選ぶ。「上端に最も近い」だと別要素を横取りする。
  const fPc = (e.y - pcTopOf(s)) / (secHeightPc[s.id] || 1);
  let best = null, bestD = 1e9;
  for (const c of list) { if (spUsed.has(c)) continue; if (c.y >= lo && c.y < hi) { const fSp = (c.y - spTopS) / spH; const d = Math.abs(fSp - fPc); if (d < bestD) { bestD = d; best = c; } } }
  // 範囲外は横取りになるので拾わない（SP に対応が無い＝折りたたみメニュー等は null＝PC 値で描く）
  if (best) spUsed.add(best);
  return best;
}

// x,w を％に、y,h は px（セクション相対 y）。round4
const r4 = (n) => Math.round(n * 10000) / 10000;
function layoutFor(e, W, secY0) {
  return { x: r4((e.x / W) * 100), y: r4(e.y - secY0), w: r4((e.w / W) * 100), h: r4(e.h) };
}

const elements = {};
let idN = 0;
const secOf = (y) => (y < HEADER_Y ? { id: "sec_header", y0: 0 } : SECS.find((s) => y >= s.y0 && y <= s.y1) || SECS[SECS.length - 1]);

// FV 全面ヒーロー（WebGL＝実測に出ない）を灰色図形で明示（参照元の分析の道具の制約・ANALYSIS-CONSTRAINTS.md）
elements.el_hero_bg = { type: "shape", kind: "rect", fill: "#9A9A9A", z: 0, section: "sec_hero", layout: { pc: { x: 0, y: 0, w: 100, h: 720 }, sp: { x: 0, y: 0, w: 100, h: 600 } } };

// 色のついた面（帯・地・札・線）を図形として置く（fix06→b1）。除外するもの：
//   ・セクションの地の色・全面スクリム＝「全幅(w≥1400)かつ高さのある面(h≥300)」。セクションの地は
//     section.background（bgOrder）で塗り、FV の暗いスクリムはヒーロー（灰）で表すので二重になる。
//     セクションの区分に依存せず大きさだけで判定する（地の色は最小 475px、残す帯・札・罫線は最大 60px で
//     明確に分かれる）。これに依存すると、FV スクリムがヘッダー扱い（y<90）になって漏れる／セクション境界の
//     すき間に落ちた全面地が別セクションへ誤分類される、という取りこぼしを避けられる。
//   ・グラデーション（ヒーロー等＝別扱い）
let surfN = 0;
for (const s of (pc.surfaces || [])) {
  const isSectionBg = s.w >= 1400 && s.h >= 300; // 全面の地・全面スクリム
  if (isSectionBg || s.grad) continue;
  const sec = secOf(s.y); const secY0 = sec.id === "sec_header" ? 0 : sec.y0;
  const id = `el_surf_${String(++surfN).padStart(3, "0")}`;
  const pcL = { x: r4((s.x / PCW) * 100), y: Math.round(s.y - secY0), w: r4((s.w / PCW) * 100), h: Math.round(s.h) };
  const spL = { x: r4((s.x / PCW) * 100), y: pcL.y, w: r4((s.w / PCW) * 100), h: Math.round(s.h) };
  const shape = { type: "shape", kind: "rect", fill: s.color, z: 1, section: sec.id, layout: { pc: pcL, sp: spL } };
  if (s.radius) shape.radius = Math.min(100, Math.round(s.radius));
  if (s.alpha != null && s.alpha < 0.99) shape.opacity = Math.round(s.alpha * 100);
  elements[id] = shape;
}

for (const e of pc.elements) {
  const s = secOf(e.y);
  const spE = matchSp(e, s);
  const id = `el_${String(++idN).padStart(3, "0")}`;
  const pcL = layoutFor(e, PCW, s.id === "sec_header" ? 0 : s.y0);
  // SP は SP のセクション上端（spTop）を引いてセクション相対 y にする（絶対 y のままだと二重加算で崩れる）
  const spL = spE ? layoutFor(spE, SPW, spTop[s.id] || 0) : { ...pcL, x: r4((e.x / PCW) * 100), w: r4((e.w / PCW) * 100) };
  if (e.tag === "img") {
    elements[id] = { type: "shape", kind: "rect", fill: "#9A9A9A", z: 1, section: s.id, layout: { pc: pcL, sp: { ...spL, y: pcL.y } } };
  } else if (e.text) {
    const lh = typeof e.lh === "number" && e.size ? r4(e.lh / e.size) : 1.5;
    elements[id] = {
      type: "text", z: 2, role: "body", section: s.id,
      paragraphs: [{ runs: [{ text: e.text }] }],
      style: { font: fontId(e.font), weight: e.weight || 400, lineHeight: lh, letterSpacing: e.ls ? r4(e.ls / (e.size || 16)) : 0, color: e.color || "#333333", align: e.align === "center" ? "center" : e.align === "right" ? "right" : "left" },
      layout: { pc: { ...pcL }, sp: spE ? spL : { ...pcL } },
    };
    // size は layout に持つ
    elements[id].layout.pc.size = Math.round(e.size);
    elements[id].layout.sp.size = Math.round((spE ? spE.size : e.size) || e.size);
  }
}

// セクションの minHeight（PC/SP）＝セクション内の最大 y+h
const secH = {};
for (const [id, el] of Object.entries(elements)) {
  for (const dev of ["pc", "sp"]) {
    const b = el.layout[dev]; if (!b) continue;
    (secH[el.section] ??= { pc: 0, sp: 0 })[dev] = Math.max(secH[el.section][dev], (b.y || 0) + (b.h || 0));
  }
}
const sectionsObj = {};
const pageSecs = ["sec_hero", "sec_about", "sec_feature", "sec_price", "sec_faqs", "sec_contact"];
const bgOrder = { sec_hero: null, sec_about: "#FFFFFF", sec_feature: "#EEEEEE", sec_price: "#FFFFFF", sec_faqs: "#EEEEEE", sec_contact: "#333333", sec_footer: "#333333", sec_header: null };
// セクションの高さは「参照元のセクションの高さ」に合わせる＝積み上げると参照元の y を再現する。
// PC は SECS 境界の差。SP は上で色面から求めた spTop の差（sp.docH は古いので使わない）。ヘッダーは 88/80（重ねる）。
const pcDocH = pc.docH;
const secHeightSp = {}; // SP は実測の色面境界（spTop）の差
for (const sid of pageSecs) secHeightSp[sid] = Math.max(1, Math.round(spNextTop[sid] - spTop[sid]));
secHeightSp.sec_footer = Math.max(1, Math.round(spMaxBottom - spTop.sec_footer));
for (const sid of ["sec_header", ...pageSecs, "sec_footer"]) {
  const pcH = sid === "sec_header" ? 88 : secHeightPc[sid];
  const spH = sid === "sec_header" ? 80 : secHeightSp[sid];
  sectionsObj[sid] = { name: sid, minHeight: { pc: pcH, sp: spH } };
  if (bgOrder[sid]) sectionsObj[sid].background = { color: bgOrder[sid] };
}

const site = {
  schemaVersion: 1, shopId: "shp_cloneq65", lineBreakRules: false,
  canvas: { pcContentWidth: 1440, spDesignWidth: 390 },
  regions: { header: "sec_header", footer: "sec_footer", headerBehavior: "sticky", headerOverlay: { pages: ["pg_home"], textColor: "theme:onDark" } },
  pages: { pg_home: { slug: "/", kind: "home", published: true, showInNav: true, sections: pageSecs, navLabel: "TOP", navOrder: 1 } },
  sections: sectionsObj,
  elements,
};

const shop = { schemaVersion: 1, shopId: "shp_cloneq65", updatedAt: "2026-09-23T00:00:00+09:00", isSample: true, basic: { name: "clone q65", genre: { template: "retail", detail: "検証用クローン" }, tagline: "clone" }, location: { postalCode: "000-0000", prefecture: "－", city: "－", town: "－", street: "－" }, hours: { weekly: {} }, contact: { phone: { display: "03-0000-0000", digits: "0300000000" } }, catalog: { menus: { mnu_x: { name: "－", order: 1 } }, categories: {}, labels: { lbl_rec: { name: "おすすめ", system: "recommended", order: 1 } }, items: {}, placements: {} } };
const theme = {
  schemaVersion: 1,
  colors: { background: { value: "#FFFFFF" }, surface: { value: "#EEEEEE" }, text: { value: "#333333" }, textMuted: { value: "#7B7B7B" }, line: { value: "#B0B0B0" }, dark: { value: "#333333" }, onDark: { value: "#FFFFFF" } },
  fonts: { heading: "zen-old-mincho", body: "zen-kaku-gothic-new" },
  textStyles: {
    pageTitle: { font: "font:heading", size: { pc: 28, sp: 20 }, lineHeight: 1.4, weight: 700, color: "theme:text" },
    heading: { font: "font:heading", size: { pc: 28, sp: 20 }, lineHeight: 1.4, weight: 700, color: "theme:text" },
    subheading: { font: "font:heading", size: { pc: 24, sp: 16 }, lineHeight: 1.4, weight: 700, color: "theme:text" },
    body: { font: "font:body", size: { pc: 16, sp: 14 }, lineHeight: 1.8, color: "theme:text" },
    caption: { font: "font:body", size: { pc: 14, sp: 14 }, lineHeight: 1.6, color: "theme:textMuted" },
  },
};
const assets = { schemaVersion: 1, assets: {} };

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "site.json"), JSON.stringify(site, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, "shop.json"), JSON.stringify(shop, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, "theme.json"), JSON.stringify(theme, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, "assets.json"), JSON.stringify(assets, null, 2) + "\n");
// clone-compare 用のサイドカー：参照元のセクション上端（PC は SECS.y0、SP は色面から求めた spTop）。
// 照合はセクション相対で行うので、両ツールが同じ境界を使うよう1か所（生成側）で決めて渡す。
const pcTops = { sec_header: 0 }; for (const s of SECS) pcTops[s.id] = s.y0;
fs.writeFileSync(path.join(OUT, "_refsections.json"), JSON.stringify({
  pc: { tops: pcTops, docH: pcDocH },
  sp: { tops: spTop, next: spNextTop, maxBottom: Math.round(spMaxBottom) },
}, null, 2) + "\n");
console.log(`✓ clone-q65 生成：要素 ${Object.keys(elements).length}（うち画像 ${Object.values(elements).filter((e) => e.type === "shape").length}）／セクション ${Object.keys(sectionsObj).length}`);
