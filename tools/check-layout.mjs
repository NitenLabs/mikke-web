#!/usr/bin/env node
// 芦屋みっけ Web制作：書き出したサイトの重なり・はみ出し・実測ずれを機械で調べる（確認用）
// 使い方: node tools/check-layout.mjs dist/ashiyado
//   - chromium・webkit・firefox の3エンジンで、JavaScript を無効にして（＝chromium が計算した静的な
//     位置のまま）検査する。
//   - ページ×幅ごとに報告する：
//       ・実際の高さと実測値（build 時に chromium で測った design px）のずれの最大値（px）
//       ・補正の JS が発火するかどうか（重なりを見つけて下をずらすか）
//       ・横のはみ出し（px）
//       ・「配置の時点（site.json の layout）では重なっていない組」が表示で重なっていないか
//         （配置の時点で重なっていた組＝写真の上の文字などは除外。_layout.json を使う）
//   撮影はしない。画像も開かない。

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as pw from "playwright";

const siteDir = process.argv[2];
if (!siteDir) { console.error("使い方: node tools/check-layout.mjs <書き出したフォルダ>"); process.exit(2); }
const dirAbs = path.resolve(siteDir);
const WIDTHS = [360, 390, 430, 1024, 1440];
const ENGINES = [["chromium", pw.chromium], ["webkit", pw.webkit], ["firefox", pw.firefox]];

// 配置の時点の重なり（build が書いた _layout.json）
let layout = { pages: {} };
const layoutPath = path.join(dirAbs, "_layout.json");
if (fs.existsSync(layoutPath)) layout = JSON.parse(fs.readFileSync(layoutPath, "utf8"));
else console.warn("⚠ _layout.json がありません（配置の時点の重なりの除外ができません。build し直してください）");

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

// ブラウザ内：重なり・はみ出し・実測ずれ・補正の発火を調べる
const ANALYZE = ({ exclude, device }) => {
  const excl = new Set(exclude);
  const vw = window.innerWidth;
  const overflowPx = Math.max(0, Math.round(document.documentElement.scrollWidth - vw));
  const scale = parseFloat(getComputedStyle(document.documentElement).fontSize) / 10; // 1rem=10px が基準
  const rect = (el) => el.getBoundingClientRect();
  const vis = (el) => { const r = rect(el), s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none"; };

  // 重なり：配置の時点で重なっていない組が、表示で重なっていないか
  const nodes = [...document.querySelectorAll("[data-el]")].filter(vis);
  const newOverlaps = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = rect(a), rb = rect(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 3 && oy > 3) {
        const ida = a.getAttribute("data-el"), idb = b.getAttribute("data-el");
        const key = [ida, idb].sort().join("|");
        if (excl.has(key)) continue; // 配置の時点で重なっていた組は除外（意図した重なり）
        newOverlaps.push({ a: ida, b: idb, ox: Math.round(ox), oy: Math.round(oy) });
      }
    }
  }

  // 実測ずれ：実測値（design px）と、実際の高さ（rendered px ÷ scale）の差の最大
  let maxDev = 0, maxDevEl = "";
  for (const el of document.querySelectorAll("[data-mh-pc],[data-mh-sp]")) {
    if (!vis(el)) continue;
    const mhAttr = el.getAttribute(`data-mh-${device}`);
    if (mhAttr == null) continue;
    const mh = parseFloat(mhAttr);
    const actualDesign = rect(el).height / scale;
    const dev = Math.abs(actualDesign - mh);
    if (dev > maxDev) { maxDev = dev; maxDevEl = el.getAttribute("data-el") || el.getAttribute("data-cel") || el.getAttribute("data-head") || ""; }
  }

  // 補正の JS が発火するか（サイトの correct() と同じ判定：同じ列で下の文字と重なるか）
  let fires = false;
  document.querySelectorAll(".sec").forEach((sec) => {
    const box = sec.querySelector(".cbox"); if (!box) return;
    const els = [...box.children].filter((e) => e.classList.contains("el-text")).sort((a, b) => a.offsetTop - b.offsetTop);
    for (let i = 0; i < els.length - 1; i++) {
      const a = els[i], b = els[i + 1];
      if (Math.abs(a.offsetLeft - b.offsetLeft) > 4) continue;
      if (a.offsetTop + a.offsetHeight - b.offsetTop > 1) fires = true;
    }
  });

  return { overflowPx, newOverlaps, maxDev: Math.round(maxDev * 10) / 10, maxDevEl, fires, checked: nodes.length };
};

const pages = findPages(dirAbs);
const rows = [];
let problems = 0;
const unavailable = [];

for (const [engineName, engine] of ENGINES) {
  let browser;
  try { browser = await engine.launch(process.env.CHROME_PATH && engineName === "chromium" ? { executablePath: process.env.CHROME_PATH } : {}); }
  catch (e) { unavailable.push(`${engineName}（未インストール：npx playwright install ${engineName}）`); continue; }
  for (const file of pages) {
    const name = pageName(file);
    const excl = layout.pages?.[name] || { pc: [], sp: [] };
    for (const width of WIDTHS) {
      const device = width < 768 ? "sp" : "pc";
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768, locale: "ja-JP", javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
      await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1)).catch(() => {});
      await page.waitForTimeout(150);
      const r = await page.evaluate(ANALYZE, { exclude: excl[device], device });
      await ctx.close();
      const issues = [];
      if (r.overflowPx > 2) issues.push(`はみ出し${r.overflowPx}px`);
      if (r.newOverlaps.length) issues.push(`重なり${r.newOverlaps.length}件（${r.newOverlaps.slice(0, 5).map((o) => `${o.a}×${o.b}:${o.ox}×${o.oy}`).join(", ")}）`);
      if (issues.length) problems++;
      rows.push({ engine: engineName, name, width, dev: r.maxDev, devEl: r.maxDevEl, fires: r.fires, overflow: r.overflowPx, overlaps: r.newOverlaps.length, issues });
    }
  }
  await browser.close();
}

// ---------- 報告 ----------
console.log("レイアウト検査（JavaScript 無効＝静的な位置のまま／chromium・webkit・firefox）\n");
const head = "  エンジン    ページ  幅     実測ずれ最大   補正JS発火  はみ出し  想定外の重なり";
for (const engineName of ENGINES.map((e) => e[0])) {
  const er = rows.filter((r) => r.engine === engineName);
  if (!er.length) continue;
  console.log(`【${engineName}】`);
  console.log(head);
  for (const r of er) {
    const dev = `${r.dev}px${r.devEl ? `（${r.devEl}）` : ""}`;
    console.log(
      `  ${engineName.padEnd(9)} ${r.name.padEnd(5)} ${String(r.width).padStart(4)}px  ${dev.padEnd(20)} ${(r.fires ? "発火" : "しない").padEnd(6)} ${(r.overflow > 2 ? r.overflow + "px" : "なし").padEnd(6)} ${r.overlaps ? "⚠ " + r.overlaps + "件" : "なし"}`
    );
  }
  console.log("");
}
if (unavailable.length) console.log("未実施のエンジン: " + unavailable.join(" 、 ") + "\n");
console.log(problems ? `⚠ 問題のある組み合わせ: ${problems} 件` : "✓ すべての エンジン×ページ×幅 で 想定外の重なり・はみ出しなし");
process.exit(0);
