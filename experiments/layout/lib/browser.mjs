// wa-01 layout-compare 実験：セクションHTMLを原寸(PC1440/SP390)で描き、要素の位置を実測する。
// PC=chromium・SP=webkit（本線 settle と同じ基準）。文字の折り返し規則は measure.mjs と同一。

import { chromium, webkit } from "playwright";
import { DESIGN_W, FONT_URL, ROOT_VARS } from "./spec.mjs";

// 文字の折り返しに関わる CSS は本線 measure.mjs の MEASURE_CSS と同じにする（実測=描画）。
const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
#sec{position:relative;overflow:hidden}
.t{line-break:strict;word-break:normal;overflow-wrap:anywhere;white-space:normal}
.t.lb{word-break:keep-all;overflow-wrap:anywhere}
.t .nowrap{white-space:nowrap}
.photo{display:flex;align-items:center;justify-content:center;color:#fff;font:12px/1.4 monospace;text-align:center;background:#8a8a8a}
.photo.empty{background:#f2f2f2;color:#999;border:1px dashed #bbb}
.line{background:var(--c-line)}
/* 甘味処の表：行の線は box-shadow（高さに入らない＝本線と同じ） */
.row-lines{box-shadow:inset 0 1px 0 var(--c-line)}
.row-lines .krow{box-shadow:inset 0 -1px 0 var(--c-line)}
`;

let _browsers = null;
export async function browsers() {
  if (!_browsers) _browsers = { pc: await chromium.launch(), sp: await webkit.launch() };
  return _browsers;
}
export async function closeBrowsers() {
  if (_browsers) { await _browsers.pc.close(); await _browsers.sp.close(); _browsers = null; }
}

// html: #sec を含む本文HTML。extraCss: 追加のレイアウトCSS（方式ごと）。
// 返り値: { els:[{id,kind,x,y,w,h,cx,cy}], sectionH, warnings:{overlaps,overflows}, png(base64) }
export async function renderSection(bodyHtml, extraCss, device, { screenshot = true } = {}) {
  const bt = (await browsers())[device];
  const ctx = await bt.newContext({ viewport: { width: DESIGN_W[device], height: 4000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONT_URL}">
<style>:root{font-size:10px;${ROOT_VARS.join("")}}${BASE_CSS}${extraCss || ""}</style></head><body>${bodyHtml}</body></html>`;
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.body.offsetHeight);
  for (let i = 0; i < 60; i++) {
    const ok = await page.evaluate(() => { document.body.offsetHeight; return !document.fonts || document.fonts.status === "loaded"; });
    if (ok) break; await page.waitForTimeout(100);
  }
  await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1)).catch(() => {});
  await page.waitForTimeout(150);

  const data = await page.evaluate(() => {
    const sec = document.getElementById("sec");
    const sr = sec.getBoundingClientRect();
    const R = (n) => Math.round(n * 100) / 100;
    const els = [...sec.querySelectorAll("[data-el]")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-el"),
        kind: el.getAttribute("data-kind") || "box",
        x: R(r.left - sr.left), y: R(r.top - sr.top), w: R(r.width), h: R(r.height),
        cx: R(r.left - sr.left + r.width / 2), cy: R(r.top - sr.top + r.height / 2),
      };
    });
    return { els, sectionH: R(sr.height), secW: R(sr.width) };
  });

  let png = null;
  if (screenshot) {
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: DESIGN_W[device], height: Math.min(Math.ceil(data.sectionH), 4000) } });
    png = buf.toString("base64");
  }
  await ctx.close();

  // 重なり・はみ出し（content 箱のみ。line/decor と group 枠は除く）
  const content = data.els.filter((e) => ["text", "photo", "pill"].includes(e.kind));
  const overlaps = [];
  for (let i = 0; i < content.length; i++) for (let j = i + 1; j < content.length; j++) {
    const a = content[i], b = content[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox <= 1 || oy <= 1) continue;
    // 入れ子（片方がもう片方を完全に含む＝ピルの中の文字など意図した包含）は重なりに数えない
    const contains = (p, q) => p.x <= q.x + 1 && p.y <= q.y + 1 && p.x + p.w >= q.x + q.w - 1 && p.y + p.h >= q.y + q.h - 1;
    if (contains(a, b) || contains(b, a)) continue;
    overlaps.push({ a: a.id, b: b.id, ox: Math.round(ox), oy: Math.round(oy) });
  }
  const overflows = content
    .filter((e) => e.x < -1 || e.x + e.w > data.secW + 1)
    .map((e) => ({ id: e.id, x: e.x, right: Math.round(e.x + e.w), secW: data.secW }));

  return { els: data.els, sectionH: data.sectionH, secW: data.secW, warnings: { overlaps, overflows }, png };
}
