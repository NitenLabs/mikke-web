#!/usr/bin/env node
// 芦屋みっけ Web制作：配置の高さを実測して site.json に書き戻す（「配置を確定」の代わり）
// 使い方: node tools/settle.mjs samples/ashiyado [--date YYYY-MM-DD]
//   文字・繰り返す部品など写真以外の要素の実際の高さを実測し、site.json の layout の h に書き込む。
//   編集画面が「配置を確定」したときに h を書き込むのと同じ役目。手で書いた h が目分量だと、
//   伸び縮みの規則（reflow）が誤ってずらすため。
//   実測は build と同じ基準：スマホの配置は webkit、PC の配置は chromium。
//   写真は幅と比率から高さが決まるので対象外。縦書きの箱は固定なので対象外。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, webkit } from "playwright";
import { makeRefDate } from "./lib/catalog.mjs";
import { resolveSite, measurementRequests, lineBreakRequests } from "./lib/render.mjs";
import { measureHeights } from "./lib/measure.mjs";
import { computeLineBreakKeep } from "./lib/linebreak.mjs";
import { buildRepLayouts } from "./lib/page.mjs";
import { themeFontIds, themeRootVars } from "./lib/theme.mjs";
import { googleFontsUrl } from "./lib/fonts.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- 引数 ----------
const argv = process.argv.slice(2);
let dataDir = null, dateArg = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--date") dateArg = argv[++i];
  else if (!dataDir) dataDir = argv[i];
}
if (!dataDir) { console.error("使い方: node tools/settle.mjs <データのフォルダ> [--date YYYY-MM-DD]"); process.exit(2); }

const dir = path.resolve(dataDir);
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const data = { shop: load("shop.json"), site: load("site.json"), theme: load("theme.json"), assets: load("assets.json") };

const refDate = makeRefDate(dateArg);
const round = (n) => Math.round(n); // h は整数で持つ（サブpx は reflow が吸収する）
const DEVICES = ["pc", "sp"];

// ---------- 実測 ----------
console.log("▸ 高さを実測（スマホ=webkit／PC=chromium、フォント読み込み後）…");
const resolved = resolveSite(data, refDate);
resolved.fontIds = themeFontIds(data.theme);
const fontUrl = googleFontsUrl(resolved.fontIds), rootVars = themeRootVars(data.theme);
// 改行の規則（R2）の keep を先に決める（build と同じ手順＝結果が一致する）
resolved.lineBreakKeep = (await computeLineBreakKeep(lineBreakRequests(resolved), fontUrl, rootVars, { chromium, webkit })).keep;
const heights = await measureHeights(measurementRequests(resolved), fontUrl, rootVars);
resolved.heights = heights;
buildRepLayouts(resolved);

// ---------- site.json の h を書き換える ----------
const site = data.site; // 生データ（構造を保って書き戻す）
let changed = 0;
const setH = (box, h) => { if (h == null) return; const v = round(h); if (box.h !== v) { box.h = v; changed++; } };

for (const [id, el] of Object.entries(site.elements)) {
  if (el.type === "text") {
    for (const d of DEVICES) {
      if (el.layout[d].writingMode === "vertical") continue; // 縦書きは固定箱（実測しない）
      setH(el.layout[d], heights[`t:${d}:${id}`]);
    }
  } else if (el.type === "repeater") {
    // 1) 繰り返す部品そのものの高さ＝内部レイアウトの総高（カード反映後）
    for (const d of DEVICES) setH(el.layout[d], resolved.repLayouts[`${id}:${d}`]?.totalHeight);
    const items = resolved.elements.get(id).repeater.items;
    // 2) カードの各文字セル＝全品の中で最も高いもの（テンプレートなので最大に合わせる）
    for (const [cid, ce] of Object.entries(el.card.elements)) {
      if (ce.type !== "text") continue;
      for (const d of DEVICES) {
        const hs = items.map((it) => heights[`c:${d}:${id}:${it.id}:${cid}`]).filter((x) => x != null);
        if (hs.length) setH(ce.layout[d], Math.max(...hs));
      }
    }
    // 3) 括りの見出し＝全括りの中で最も高いもの
    if (el.groupHeading) {
      for (const d of DEVICES) {
        const hs = Object.keys(heights).filter((k) => k.startsWith(`g:${d}:${id}:`)).map((k) => heights[k]);
        if (hs.length) setH(el.groupHeading.layout[d], Math.max(...hs));
      }
    }
  }
  // 写真・図形・埋め込み・ナビ・フォームは対象外（高さが content で決まらない／写真は比率で決まる）
}

// ---------- ACCESS の条件つき配置（fix04 §3・B4-9〜B4-15）----------
// 表の高さ（実測）から、表の縦位置（写真と中央そろえ or 上端そろえ）・地図・ピル・セクション高さを決める。
// オーナーが表の行を増減しても、次のビルドで自動でそろう。
function setY(box, y) { if (box && y != null) { const v = round(y); if (box.y !== v) { box.y = v; changed++; } } }
(function positionAccess() {
  const e = site.elements;
  if (!e.el_accinfo || !e.el_accphoto) return;
  // PC
  {
    const ph = e.el_accphoto.layout.pc, photoBottom = ph.y + ph.h;
    const Ht = e.el_accinfo.layout.pc.h;
    const tableY = Ht <= ph.h ? ph.y + (ph.h - Ht) / 2 : ph.y;
    setY(e.el_accinfo.layout.pc, tableY);
    const lowerBottom = Math.max(photoBottom, tableY + Ht);
    const mapY = lowerBottom + 80; setY(e.el_accmap.layout.pc, mapY);
    const pillY = mapY + e.el_accmap.layout.pc.h + 64;
    setY(e.el_acctelbg.layout.pc, pillY);
    setY(e.el_acctel.layout.pc, pillY + (e.el_acctelbg.layout.pc.h - e.el_acctel.layout.pc.h) / 2);
    const secBottom = pillY + e.el_acctelbg.layout.pc.h + 141;
    if (site.sections.sec_access.minHeight.pc !== round(secBottom)) { site.sections.sec_access.minHeight.pc = round(secBottom); changed++; }
  }
  // SP
  {
    const ph = e.el_accphoto.layout.sp, photoBottom = ph.y + ph.h;
    const tableY = photoBottom + 32; setY(e.el_accinfo.layout.sp, tableY);
    const Ht = e.el_accinfo.layout.sp.h;
    const mapY = tableY + Ht + 40; setY(e.el_accmap.layout.sp, mapY);
    const pillY = mapY + e.el_accmap.layout.sp.h + 32;
    setY(e.el_acctelbg.layout.sp, pillY);
    setY(e.el_acctel.layout.sp, pillY + (e.el_acctelbg.layout.sp.h - e.el_acctel.layout.sp.h) / 2);
    const secBottom = pillY + e.el_acctelbg.layout.sp.h + 90;
    if (site.sections.sec_access.minHeight.sp !== round(secBottom)) { site.sections.sec_access.minHeight.sp = round(secBottom); changed++; }
  }
})();

fs.writeFileSync(path.join(dir, "site.json"), JSON.stringify(site, null, 2) + "\n");
console.log(`✓ site.json の h を更新: ${changed} 箇所（書き出す日付 ${refDate.ymd}）`);
