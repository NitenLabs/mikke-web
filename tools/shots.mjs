#!/usr/bin/env node
// 芦屋みっけ Web制作：書き出したサイトを複数の幅で撮影する（確認用）
// 使い方: node tools/shots.mjs dist/ashiyado
//   幅 360・390・430・1024・1440 で各ページを撮影し dist/_shots/ に保存する。撮影だけ（画像は開かない）。

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }

const siteDir = process.argv[2];
if (!siteDir) { console.error("使い方: node tools/shots.mjs <書き出したフォルダ>"); process.exit(2); }
const dirAbs = path.resolve(siteDir);
const WIDTHS = [360, 390, 430, 1024, 1440];

// ページ（*.html）を集める
function findPages(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "_shots" && e.name !== "assets") walk(p); }
      else if (e.name.endsWith(".html")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const pageName = (file) => {
  const rel = path.relative(dirAbs, file).replace(/\\/g, "/");
  if (rel === "index.html") return "home";
  if (rel === "404.html") return "404";
  return rel.replace(/\/index\.html$/, "").replace(/\//g, "-");
};

const shotsDir = path.join(dirAbs, "_shots");
fs.mkdirSync(shotsDir, { recursive: true });

const pages = findPages(dirAbs);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
let count = 0;
for (const file of pages) {
  const name = pageName(file);
  for (const width of WIDTHS) {
    const isSp = width < 768;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: isSp, hasTouch: isSp, locale: "ja-JP" });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
    await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1));
    await page.waitForTimeout(200);
    const out = path.join(shotsDir, `${name}-${width}.png`);
    await page.screenshot({ path: out, fullPage: true });
    count++;
    await ctx.close();
  }
}
await browser.close();
console.log(`✓ 撮影完了: ${count} 枚 → ${path.relative(process.cwd(), shotsDir)}/（${pages.map(pageName).join(" 、 ")} × ${WIDTHS.join("・")}）`);
