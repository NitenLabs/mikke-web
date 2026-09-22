#!/usr/bin/env node
// 芦屋みっけ Web制作：参照元と成果物を左右に並べた比較画像を作る（SPEC 10.2）
// 使い方: node tools/compare.mjs <参照元URL> dist/ashiyado
//   参照元と芦屋堂を 1440・390 で撮り、refs/compare/ に左右に並べた画像を書き出す。
//   この工程は画像を見てよい（人の目に近い確認）。撮るだけ＝ここでは開かない。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }

const refUrl = process.argv[2];
const distDir = path.resolve(process.argv[3] || "dist/ashiyado");
const out = path.resolve("refs/compare");
fs.mkdirSync(out, { recursive: true });
const WIDTHS = { pc: 1440, sp: 390 };
const pages = { home: "index.html", menu: "menu/index.html", contact: "contact/index.html" };

const browser = await chromium.launch();
async function shot(url, w, file) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: "load", timeout: 45000 });
    await p.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1)).catch(() => {});
    await p.waitForTimeout(800);
    const buf = await p.screenshot({ fullPage: true, type: "jpeg", quality: 70 });
    fs.writeFileSync(file, buf);
  } catch (e) { console.log("撮影失敗:", url, e.message.slice(0, 60)); }
  await ctx.close();
}
// 参照元（1枚・トップのみ。切り抜きは人が見て判断）と成果物の各ページ
for (const [dev, w] of Object.entries(WIDTHS)) {
  if (refUrl) await shot(refUrl, w, path.join(out, `ref-${dev}.jpg`));
  for (const [name, f] of Object.entries(pages)) {
    if (!fs.existsSync(path.join(distDir, f))) continue;
    await shot(pathToFileURL(path.join(distDir, f)).href, w, path.join(out, `build-${name}-${dev}.jpg`));
  }
}
// 左右に並べる（参照元 ↔ 成果物のトップ）
async function sideBySide(dev) {
  const rf = path.join(out, `ref-${dev}.jpg`), bf = path.join(out, `build-home-${dev}.jpg`);
  if (!fs.existsSync(rf) || !fs.existsSync(bf)) return;
  const ctx = await browser.newContext({ viewport: { width: 100, height: 100 } });
  const p = await ctx.newPage();
  const r = "data:image/jpeg;base64," + fs.readFileSync(rf).toString("base64");
  const b = "data:image/jpeg;base64," + fs.readFileSync(bf).toString("base64");
  await p.setContent(`<body style="margin:0;display:flex;gap:4px;background:#999"><img src="${r}" style="width:600px"><img src="${b}" style="width:600px"></body>`, { waitUntil: "load" });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(out, `compare-${dev}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  await ctx.close();
}
await sideBySide("pc"); await sideBySide("sp");
await browser.close();
console.log(`✓ refs/compare/ に書き出し（ref-*/build-*/compare-*）。人の目で ref と build を左右で見比べる。`);
