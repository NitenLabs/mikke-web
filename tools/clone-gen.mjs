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
const HEADER_Y = 90; // これ未満はヘッダー（ロゴ・ナビ）＝FVに重ねる

// SP 要素を「仮の文字（text）」で対にする（同じテキスト＝同じ要素とみなし、順に割り当て）
const spByText = {};
for (const e of sp.elements) { if (!e.text) continue; (spByText[e.text] ??= []).push(e); }
const spTaken = new Map();
function matchSp(e) {
  if (!e.text) return null;
  const list = spByText[e.text]; if (!list) return null;
  const used = spTaken.get(e.text) || 0; if (used >= list.length) return null;
  spTaken.set(e.text, used + 1); return list[used];
}

// x,w を％に、y,h は px（セクション相対 y）。round4
const r4 = (n) => Math.round(n * 10000) / 10000;
function layoutFor(e, W, secY0) {
  return { x: r4((e.x / W) * 100), y: Math.round(e.y - secY0), w: r4((e.w / W) * 100), h: Math.round(e.h) };
}

const elements = {};
let idN = 0;
const secOf = (y) => (y < HEADER_Y ? { id: "sec_header", y0: 0 } : SECS.find((s) => y >= s.y0 && y <= s.y1) || SECS[SECS.length - 1]);

// FV 全面ヒーロー（WebGL＝実測に出ない）を灰色図形で明示（参照元の分析の道具の制約・ANALYSIS-CONSTRAINTS.md）
elements.el_hero_bg = { type: "shape", kind: "rect", fill: "#9A9A9A", z: 0, section: "sec_hero", layout: { pc: { x: 0, y: 0, w: 100, h: 720 }, sp: { x: 0, y: 0, w: 100, h: 600 } } };

for (const e of pc.elements) {
  const s = secOf(e.y);
  const spE = matchSp(e);
  const id = `el_${String(++idN).padStart(3, "0")}`;
  const pcL = layoutFor(e, PCW, s.id === "sec_header" ? 0 : s.y0);
  const spL = spE ? layoutFor(spE, SPW, 0) : { ...pcL, x: r4((e.x / PCW) * 100), w: r4((e.w / PCW) * 100) };
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
for (const sid of ["sec_header", ...pageSecs, "sec_footer"]) {
  sectionsObj[sid] = { name: sid, minHeight: { pc: Math.round(secH[sid]?.pc || 40), sp: Math.round(secH[sid]?.sp || 40) } };
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
console.log(`✓ clone-q65 生成：要素 ${Object.keys(elements).length}（うち画像 ${Object.values(elements).filter((e) => e.type === "shape").length}）／セクション ${Object.keys(sectionsObj).length}`);
