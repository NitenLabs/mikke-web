#!/usr/bin/env node
// 芦屋みっけ Web制作：書き出したサイトの重なり・はみ出しを機械で調べる（確認用）
// 使い方: node tools/check-layout.mjs dist/ashiyado
//   各ページ・各幅で「中身どうしが意図せず重なっていないか」「横にはみ出していないか」を調べて報告する。
//   写真の上に置いた文字のように、配置の時点で重なっているもの（＝写真・図形の飾りとの重なり）は除く。

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }

const siteDir = process.argv[2];
if (!siteDir) { console.error("使い方: node tools/check-layout.mjs <書き出したフォルダ>"); process.exit(2); }
const dirAbs = path.resolve(siteDir);
const WIDTHS = [360, 390, 430, 1024, 1440];

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

// ブラウザ内：中身の要素（文字・地図・ナビ・ボタン）どうしの重なりと、横のはみ出しを調べる
const ANALYZE = () => {
  const docW = document.documentElement.scrollWidth;
  const vw = window.innerWidth;
  const overflowPx = Math.max(0, docW - vw);
  // 中身（飾りでない）＝文字・地図・ナビ。図形（ボタンの下地など）と写真は飾りなので除く
  // （写真の上の文字・ボタンの下地の上の文字は「配置の時点で重なっているもの」＝除外）。
  const nodes = [...document.querySelectorAll(".el-text, .el-embed, .el-nav, .rep-head")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none";
    });
  const rect = (el) => el.getBoundingClientRect();
  const overlaps = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.contains(b) || b.contains(a)) continue; // 入れ子は除く
      const ra = rect(a), rb = rect(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 3 && oy > 3) {
        const key = (el) => el.getAttribute("data-el") || el.getAttribute("data-cel") || el.getAttribute("data-head") || el.className;
        overlaps.push({ a: key(a), b: key(b), ox: Math.round(ox), oy: Math.round(oy) });
      }
    }
  }
  return { overflowPx: Math.round(overflowPx), overlaps, checked: nodes.length };
};

const pages = findPages(dirAbs);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const lines = [];
let problems = 0;
for (const file of pages) {
  const name = pageName(file);
  for (const width of WIDTHS) {
    const isSp = width < 768;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: isSp, hasTouch: isSp, locale: "ja-JP" });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
    await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1));
    await page.waitForTimeout(150);
    const r = await page.evaluate(ANALYZE);
    await ctx.close();
    const issues = [];
    if (r.overflowPx > 2) issues.push(`横にはみ出し ${r.overflowPx}px`);
    if (r.overlaps.length) issues.push(`重なり ${r.overlaps.length}件（${r.overlaps.slice(0, 6).map((o) => `${o.a}×${o.b}:${o.ox}×${o.oy}`).join(", ")}${r.overlaps.length > 6 ? " …" : ""}）`);
    if (issues.length) problems++;
    lines.push(`  ${name.padEnd(6)} ${String(width).padStart(4)}px  中身${String(r.checked).padStart(3)}個  ${issues.length ? "⚠ " + issues.join(" ／ ") : "OK（重なり・はみ出しなし）"}`);
  }
}
await browser.close();
console.log("レイアウト検査（重なり・はみ出し）");
console.log(lines.join("\n"));
console.log(`\n${problems ? `⚠ 問題のある組み合わせ: ${problems} 件` : "✓ すべての ページ×幅 で 重なり・はみ出しなし"}`);
process.exit(0);
