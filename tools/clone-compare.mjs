#!/usr/bin/env node
// 第2部 clone §2.3（主）：覆った参照元（elements-{pc,sp}.json）と再現（dist/clone-q65）の
//   「要素の照合」。文字要素を仮の文字で対応づけ、**セクションの中の相対の位置**で判定する
//   （絶対 y はセクション高さの丸めが累積するため。伸び縮みは SP のほうが起きやすいので PC/SP 両方）。
//   合否：セクション相対 x(±2px)・相対 y(±2px)・幅(±2px)・文字の大きさ(±0.6px)・太さ一致・色一致。
//   セクション境界は生成側が書き出したサイドカー（samples/clone-q65/_refsections.json）を正とする
//   （PC=SECS.y0／SP=実測の色面から求めた spTop）。両ツールが同じ境界を使うため。
// 使い方: node tools/clone-compare.mjs [pc|sp|both]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const REF = "refs/studio-Q65qmmvqVR/masked";
const DIST = "dist/clone-q65/index.html";
const SIDE = "samples/clone-q65/_refsections.json";
const OUTDIR = "refs/compare";
fs.mkdirSync(OUTDIR, { recursive: true });
const devsArg = process.argv[2] || "pc";
const DEVS = devsArg === "both" ? ["pc", "sp"] : [devsArg];
const VP = { pc: 1440, sp: 390 };
const POS = 2, SIZE = 2, SZTOL = 0.6;
const HEADER_Y = 90;
const ORDER = ["sec_hero", "sec_about", "sec_feature", "sec_price", "sec_faqs", "sec_contact", "sec_footer"];
const side = JSON.parse(fs.readFileSync(SIDE, "utf8"));

// 参照元の要素 y → セクション（dev 別）。ヘッダーは y<90 で分ける（生成側の HEADER_Y と同じ）。
function refSecOf(y, dev) {
  if (y < HEADER_Y) return "sec_header";
  const tops = side[dev].tops;
  let cur = "sec_hero";
  for (const s of ORDER) { if (y >= tops[s]) cur = s; else break; }
  return cur;
}

async function measureClone(page) {
  return await page.evaluate(() => {
    const rgb = (c) => { const m = (c || "").match(/[\d.]+/g); return m ? "#" + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase() : null; };
    const secTops = {};
    for (const s of document.querySelectorAll("[data-sec]")) secTops[s.getAttribute("data-sec")] = Math.round(s.getBoundingClientRect().top + window.pageYOffset);
    const out = [];
    for (const el of document.querySelectorAll("[data-el]")) {
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      const secEl = el.closest("[data-sec]");
      const sec = secEl ? secEl.getAttribute("data-sec") : null;
      const isText = el.classList.contains("el-text");
      out.push({ x: r.left, y: r.top + window.pageYOffset, w: r.width, h: r.height, sec, secTop: sec ? (secTops[sec] || 0) : 0, text: isText ? el.textContent.trim() : null, size: isText ? parseFloat(cs.fontSize) : null, weight: isText ? +cs.fontWeight : null, color: isText ? rgb(cs.color) : null, font: isText ? cs.fontFamily.split(",")[0].replace(/["']/g, "").trim() : null });
    }
    return out;
  });
}

const browser = await chromium.launch();
const report = {};
for (const dev of DEVS) {
  const refAll = JSON.parse(fs.readFileSync(path.join(REF, `elements-${dev}.json`), "utf8")).elements.filter((e) => e.text);
  const ctx = await browser.newContext({ viewport: { width: VP[dev], height: 1000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.resolve(DIST)).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts && document.fonts.ready); await page.waitForTimeout(400);
  const clone = await measureClone(page);
  await ctx.close();

  const usedC = new Set();
  const bySec = {};
  for (const sid of ["sec_header", ...ORDER]) bySec[sid] = { total: 0, pass: 0, fails: [] };
  for (const rf of refAll) {
    const sec = refSecOf(rf.y, dev);
    const refTop = sec === "sec_header" ? 0 : side[dev].tops[sec];
    const rfRel = rf.y - refTop;
    bySec[sec].total++;
    // 同じ仮の文字・同じセクション・未使用のうち、相対 y が最も近いものを対応づける
    let best = null, bestI = -1, bestD = 1e9;
    clone.forEach((c, i) => { if (c.text === rf.text && c.sec === sec && !usedC.has(i)) { const cRel = c.y - c.secTop; const d = Math.abs(cRel - rfRel); if (d < bestD) { bestD = d; best = c; bestI = i; } } });
    if (!best) { bySec[sec].fails.push(`no match '${rf.text.slice(0, 10)}' relY${Math.round(rfRel)}`); continue; }
    usedC.add(bestI);
    const cRel = best.y - best.secTop;
    const dx = Math.abs(best.x - rf.x), dy = Math.abs(cRel - rfRel), dw = Math.abs(best.w - rf.w);
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
  console.log(`\n===== ${dev.toUpperCase()} 要素の照合（セクション相対・±${POS}px・文字段は一致）=====`);
  for (const [sec, r] of Object.entries(report[dev])) {
    if (r.total === 0) continue;
    const mark = r.pass === r.total ? "✓" : "✗";
    console.log(`${mark} ${sec}: ${r.pass}/${r.total}` + (r.fails.length ? `  不一致 ${r.fails.length}` : ""));
    for (const f of r.fails.slice(0, 8)) console.log("    " + f);
  }
}
fs.writeFileSync(path.join(OUTDIR, "clone-element-report.json"), JSON.stringify(report, null, 2));
