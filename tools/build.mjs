#!/usr/bin/env node
// 芦屋みっけ Web制作：表示の仕組み（データ→静的サイト）
// 使い方: node tools/build.mjs samples/ashiyado [--date 2026-03-15]
//   1. validate を実行し、エラーがあれば止める
//   2. 基準の幅（スマホ390・PC中身の幅）で文字の高さを実測（フォント読み込み後）
//   3. reflow.mjs で位置を決め、静的HTML/CSS を dist/<名前>/ に書き出す
//   --date：品の表示・非表示や例外の期限の基準にする日付（省略時は今日・日本時間）

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { makeRefDate } from "./lib/catalog.mjs";
import { resolveSite, measurementRequests } from "./lib/render.mjs";
import { measureHeights } from "./lib/measure.mjs";
import { buildRepLayouts, renderPage, render404 } from "./lib/page.mjs";
import { prepareAssets } from "./lib/assets.mjs";
import { pageDesignOverlaps } from "./lib/overlap.mjs";
import { themeFontIds } from "./lib/theme.mjs";
import { googleFontsUrl } from "./lib/fonts.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// ---------- 引数 ----------
const argv = process.argv.slice(2);
let dataDir = null, dateArg = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--date") dateArg = argv[++i];
  else if (!dataDir) dataDir = argv[i];
}
if (!dataDir) { console.error("使い方: node tools/build.mjs <データのフォルダ> [--date YYYY-MM-DD]"); process.exit(2); }
if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) { console.error(`--date の形式が不正です: ${dateArg}（YYYY-MM-DD）`); process.exit(2); }

const dataDirAbs = path.resolve(dataDir);
const name = path.basename(dataDirAbs);

// ---------- 1. validate ----------
console.log("▸ データを検査（validate）…");
const v = spawnSync("node", [path.join(here, "validate.mjs"), dataDirAbs], { stdio: "inherit" });
if (v.status !== 0) { console.error("\n✗ 検査でエラーがありました。書き出しを中止します。"); process.exit(1); }

// ---------- 読み込み ----------
const load = (f) => JSON.parse(fs.readFileSync(path.join(dataDirAbs, f), "utf8"));
const data = { shop: load("shop.json"), site: load("site.json"), theme: load("theme.json"), assets: load("assets.json") };

const refDate = makeRefDate(dateArg);
console.log(`▸ 書き出す日付: ${refDate.ymd}${dateArg ? "（--date 指定）" : "（今日・日本時間）"}`);

// ---------- 2. 解決＋実測 ----------
const resolved = resolveSite(data, refDate);
resolved.fontIds = themeFontIds(data.theme);
const fontUrl = googleFontsUrl(resolved.fontIds);

console.log("▸ 文字の高さを実測（ヘッドレスブラウザ）…");
const requests = measurementRequests(resolved);
resolved.heights = await measureHeights(requests, fontUrl);
console.log(`  実測: ${Object.keys(resolved.heights).length} 箇所（要求 ${requests.length}）`);

buildRepLayouts(resolved);

// ---------- 出力先 ----------
const outDir = path.join(root, "dist", name);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// ---------- 素材（サンプルは仮の写真、実在の店は実ファイル必須） ----------
const { files: assetFiles, errors: assetErrors } = prepareAssets(data, dataDirAbs, outDir);
if (assetErrors.length) {
  console.error("\n✗ 素材の用意でエラーがありました。書き出しを中止します。");
  for (const e of assetErrors) console.error("  エラー " + e);
  if (data.shop.isSample !== true) console.error("  （実在の店では仮の写真を使いません。素材の実ファイルを配置してください）");
  process.exit(1);
}
resolved.assetFiles = assetFiles;

// ---------- 3. ページを書き出す ----------
const written = [];
const layoutOverlaps = {}; // ページ名 -> {pc:[...],sp:[...]}（配置の時点で重なっていた組。検査の除外に使う）
const slugDepth = (slug) => slug.split("/").filter(Boolean).length;
const slugToFile = (slug) => (slug === "/" ? "index.html" : `${slug.slice(1)}/index.html`);
const fileToPageName = (file) => (file === "index.html" ? "home" : file === "404.html" ? "404" : file.replace(/\/index\.html$/, "").replace(/\//g, "-"));

for (const [pageId, page] of Object.entries(data.site.pages)) {
  if (!page.published) continue;
  let html, file, depth, sectionIds;
  if (page.kind === "notFound") {
    depth = 0; file = "404.html";
    html = render404(resolved, { depth });
    sectionIds = [data.site.regions.header, data.site.regions.footer];
  } else {
    depth = slugDepth(page.slug);
    file = slugToFile(page.slug);
    html = renderPage(resolved, pageId, { depth });
    sectionIds = [data.site.regions.header, ...page.sections, data.site.regions.footer];
  }
  const abs = path.join(outDir, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, html);
  written.push(file);
  layoutOverlaps[fileToPageName(file)] = pageDesignOverlaps(resolved, sectionIds);
}

// 検査（重なりの除外）用のサイドカー
fs.writeFileSync(path.join(outDir, "_layout.json"), JSON.stringify({ pages: layoutOverlaps }, null, 2));

// ---------- 報告 ----------
const assetList = Object.values(assetFiles);
console.log(`\n✓ 書き出し完了: dist/${name}/`);
console.log("  ページ: " + written.join(" 、 "));
console.log(`  素材: ${assetList.length} 件（${assetList.join(" 、 ")}）`);
