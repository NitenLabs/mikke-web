#!/usr/bin/env node
// 候補写真の一覧画像（コンタクトシート）を作る。SPEC 7章の目視用。
// 使い方: node tools/contact.mjs <出力.jpg> <幅上限> "file|label" "file|label" ...
//   画像を横に並べ（折り返し）、各候補に番号とラベルを付け、幅上限内に縮小して1枚に。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }

const out = path.resolve(process.argv[2]);
const maxW = parseInt(process.argv[3], 10) || 1200;
const items = process.argv.slice(4).map((s, i) => {
  const [file, label] = s.split("|");
  return { n: i + 1, file: path.resolve(file), label: label || "", url: pathToFileURL(path.resolve(file)).href };
});
const cell = Math.floor((maxW - 8 * (Math.min(items.length, 4) + 1)) / Math.min(items.length, 4));
const html = `<!doctype html><meta charset=utf8><style>
  body{margin:0;background:#2b2b2b;font-family:sans-serif}
  .grid{display:flex;flex-wrap:wrap;gap:8px;padding:8px;width:${maxW}px;box-sizing:border-box}
  .c{width:${cell}px}
  .ph{width:${cell}px;height:${cell}px;object-fit:cover;display:block;background:#111}
  .cap{color:#fff;font-size:13px;padding:4px 2px;line-height:1.3}
  .cap b{color:#ffd76a}
</style><div class=grid>${items.map(it => `<div class=c><img class=ph src="${it.url}"><div class=cap><b>${it.n}.</b> ${it.label}</div></div>`).join("")}</div>`;
const tmp = path.join(path.dirname(out), ".contact-tmp.html");
fs.writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: maxW, height: 800 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
await page.waitForTimeout(300);
const grid = await page.$(".grid");
const buf = await grid.screenshot({ type: "jpeg", quality: 80 });
fs.writeFileSync(out, buf);
fs.unlinkSync(tmp);
await browser.close();
console.log("wrote", out, "(", items.length, "candidates )");
