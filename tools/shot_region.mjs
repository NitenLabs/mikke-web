#!/usr/bin/env node
// 指定要素の切り抜きを撮る（報告の 直す前/後 の証跡用）。
// 使い方: node tools/shot_region.mjs <page.html> <selector> <out.jpg> [width] [padPx]
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";
const [file, sel, out, width = "1440", pad = "0"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +width, height: 1000 }, deviceScaleFactor: 2 });
await p.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: "load" });
await p.evaluate(() => document.fonts && document.fonts.ready);
await p.waitForTimeout(400);
const el = await p.$(sel);
if (!el) { console.error("no element", sel); process.exit(1); }
await el.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
if (+pad) {
  const box = await el.boundingBox();
  await p.screenshot({ path: out, clip: { x: Math.max(0, box.x - +pad), y: Math.max(0, box.y - +pad), width: box.width + 2 * +pad, height: box.height + 2 * +pad } });
} else {
  await el.screenshot({ path: out });
}
await b.close();
console.log("wrote", out);
