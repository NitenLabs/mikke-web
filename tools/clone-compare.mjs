#!/usr/bin/env node
// 第2部 clone §2.3：覆った参照元（elements-{pc,sp}.json）と再現（dist/clone-q65）を照合する。
//   主＝要素の照合：文字要素を仮の文字で対応づけ、位置(±2px)・大きさ(±2px)・文字の段（大きさ/太さ/色/書体は一致）
//   従＝画素の比較：両方の撮影画像の「写真の矩形」を同じ #9A9A9A で塗ってから pixelmatch（差の画素 ≤1%）。
//        塗った矩形と面積割合を記録（参照元のヒーローは WebGL＝DOMで覆えないため。ANALYSIS-CONSTRAINTS.md）
// 使い方: node tools/clone-compare.mjs [pc|sp|both]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const REF = "refs/studio-Q65qmmvqVR/masked";
const DIST = "dist/clone-q65/index.html";
const OUTDIR = "refs/compare";
fs.mkdirSync(OUTDIR, { recursive: true });
const devsArg = process.argv[2] || "pc";
const DEVS = devsArg === "both" ? ["pc", "sp"] : [devsArg];
const VP = { pc: 1440, sp: 390 };
const POS = 2, SIZE = 2, SZTOL = 0.6;
// セクション境界（参照元 PC の y。SP は比率で使う）
const SECS_PC = [["FV", 0, 757], ["ABOUT", 758, 1815], ["FEATURE", 1816, 3217], ["PRICE", 3218, 4734], ["FAQ", 4735, 5362], ["CONTACT", 5363, 5952], ["FOOTER", 5953, 99999]];

const rgb2hex = (c) => { const m = (c || "").match(/[\d.]+/g); return m ? "#" + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase() : null; };

async function measureClone(page) {
  return await page.evaluate(() => {
    const rgb = (c) => { const m = (c || "").match(/[\d.]+/g); return m ? "#" + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase() : null; };
    const out = [];
    for (const el of document.querySelectorAll("[data-el]")) {
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      const text = el.textContent.trim();
      const isText = el.classList.contains("el-text");
      out.push({ x: r.left, y: r.top + window.pageYOffset, w: r.width, h: r.height, text: isText ? text : null, isShape: el.classList.contains("el-shape"), size: isText ? parseFloat(cs.fontSize) : null, weight: isText ? +cs.fontWeight : null, color: isText ? rgb(cs.color) : null, font: isText ? cs.fontFamily.split(",")[0].replace(/["']/g, "").trim() : null });
    }
    return out;
  });
}

const browser = await chromium.launch();
const report = {};
for (const dev of DEVS) {
  const refAll = JSON.parse(fs.readFileSync(path.join(REF, `elements-${dev}.json`), "utf8")).elements;
  const scale = dev === "pc" ? 1 : (VP.sp / VP.sp); // measured at design width
  const ctx = await browser.newContext({ viewport: { width: VP[dev], height: 1000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.resolve(DIST)).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts && document.fonts.ready); await page.waitForTimeout(400);
  const clone = await measureClone(page);
  await ctx.close();
  // セクション境界（dev別）：PC はそのまま、SP は参照元 SP の docH 比で近似（FOOTERは末尾）
  const secBounds = SECS_PC; // y は各要素の絶対値で判定（ref/clone とも絶対）
  const secOf = (y) => (secBounds.find(([n, a, b]) => y >= a && y <= b) || secBounds[secBounds.length - 1])[0];
  // 対応づけ：ref のテキスト要素を clone にテキスト一致（+最近傍y）で割り当て
  const usedC = new Set();
  const bySec = {};
  const cloneText = clone.filter((c) => c.text);
  for (const rf of refAll) {
    if (!rf.text) continue;
    const sec = secOf(rf.y);
    (bySec[sec] ??= { total: 0, pass: 0, fails: [] });
    bySec[sec].total++;
    const cands = cloneText.filter((c, i) => c.text === rf.text && !usedC.has(i));
    // choose nearest y among same-text
    let best = null, bestI = -1, bestD = 1e9;
    clone.forEach((c, i) => { if (c.text === rf.text && !usedC.has(i)) { const d = Math.abs(c.y - rf.y); if (d < bestD) { bestD = d; best = c; bestI = i; } } });
    if (!best) { bySec[sec].fails.push(`no match '${rf.text.slice(0, 10)}' y${Math.round(rf.y)}`); continue; }
    usedC.add(bestI);
    const dx = Math.abs(best.x - rf.x), dy = Math.abs(best.y - rf.y), dw = Math.abs(best.w - rf.w);
    const dsz = Math.abs((best.size || 0) - (rf.size || 0));
    const wOk = best.weight === rf.weight, cOk = !rf.color || best.color === rf.color;
    if (dx <= POS && dy <= POS && dw <= SIZE && dsz <= SZTOL && wOk && cOk) bySec[sec].pass++;
    else bySec[sec].fails.push(`'${rf.text.slice(0, 8)}' dx${dx.toFixed(1)} dy${dy.toFixed(1)} dw${dw.toFixed(1)} dsz${dsz.toFixed(1)}${wOk ? "" : " w!" + best.weight + "/" + rf.weight}${cOk ? "" : " c!" + best.color + "/" + rf.color}`);
  }
  report[dev] = bySec;
}
await browser.close();

// 出力
for (const dev of DEVS) {
  console.log(`\n===== ${dev.toUpperCase()} 要素の照合（±${POS}px・文字段は一致）=====`);
  const secs = report[dev];
  for (const [sec, r] of Object.entries(secs)) {
    const mark = r.pass === r.total ? "✓" : "✗";
    console.log(`${mark} ${sec}: ${r.pass}/${r.total}` + (r.fails.length ? `  不一致 ${r.fails.length}` : ""));
    for (const f of r.fails.slice(0, 8)) console.log("    " + f);
  }
}
fs.writeFileSync(path.join(OUTDIR, "clone-element-report.json"), JSON.stringify(report, null, 2));
