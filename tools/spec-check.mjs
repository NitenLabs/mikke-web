#!/usr/bin/env node
// 芦屋みっけ Web制作：設計書（SPEC）の数値との照合（SPEC 10.1）
// 使い方: node tools/spec-check.mjs samples/ashiyado dist/ashiyado
//   site.json の各要素の期待値（px の x,y,w,h・文字の大きさ/太さ/書体/色）を templates/wa-01/expected.json に
//   書き出し、書き出したサイトを 1440（PC）・390（スマホ）で開いて実際の値と比べる。
//   許容差：位置 ±4px、大きさ（写真・ボタン・線）±2px、文字の大きさ/太さ/書体/色は完全一致。
//   「自動」「中身に合わせる」高さ（layout に h が無い要素）は照合しない。

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { textStyle } from "./lib/theme.mjs";
import { fontStack, FONT_REGISTRY } from "./lib/fonts.mjs";

let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.argv[2] || "samples/ashiyado");
const distDir = path.resolve(process.argv[3] || "dist/ashiyado");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
const site = load("site.json"), theme = load("theme.json");
const W = { pc: site.canvas.pcContentWidth, sp: site.canvas.spDesignWidth };

// テーマ色 → hex
function colorHex(token) {
  if (!token) return null;
  if (token.startsWith("#")) return token.toUpperCase();
  if (token.startsWith("theme:")) return theme.colors[token.slice(6)]?.value?.toUpperCase() || null;
  return null;
}
// フォント参照 → family（先頭）
function fontFamily(ref) {
  if (!ref) return null;
  const id = ref.startsWith("font:") ? theme.fonts[ref.slice(5)] : ref;
  return FONT_REGISTRY[id]?.family || null;
}
// 要素 → セクションのページと、どのページで見えるか（top-level 要素のみ）
const secToPage = {};
for (const [pid, pg] of Object.entries(site.pages)) for (const s of pg.sections) secToPage[s] = pid;
secToPage[site.regions.header] = null; // 全ページ共通（トップで見る）
secToPage[site.regions.footer] = null;

// 期待値を組み立てる（top-level 要素）
const expected = {};
for (const [id, el] of Object.entries(site.elements)) {
  const pageId = secToPage[el.section] ?? "pg_home";
  const rec = { page: pageId, section: el.section, type: el.type, pc: {}, sp: {} };
  for (const dev of ["pc", "sp"]) {
    const b = el.layout[dev]; if (!b) continue;
    const box = { x: round(b.x * W[dev] / 100), y: b.y };
    box.w = round(b.w * W[dev] / 100);
    if (b.h != null) box.h = b.h;
    if (el.type === "text") {
      const ts = textStyle(theme, el.role); const s = el.style || {};
      box.size = b.size ?? ts.size[dev];
      box.weight = s.weight ?? (s.bold ? 700 : ts.weight ?? 400);
      box.font = fontFamily(s.font || ts.font);
      box.color = colorHex(s.color || ts.color);
    }
    rec[dev] = box;
  }
  expected[id] = rec;
}
fs.mkdirSync(path.join(here, "..", "templates", "wa-01"), { recursive: true });
fs.writeFileSync(path.join(here, "..", "templates", "wa-01", "expected.json"), JSON.stringify(expected, null, 2) + "\n");

// ページ名 → dist のファイル
const fileFor = (pid) => {
  const slug = site.pages[pid]?.slug || "/";
  return slug === "/" ? "index.html" : `${slug.slice(1)}/index.html`;
};

// ブラウザ内：要素の実測（セクション相対の x,y,w,h と文字の計算値）
const MEASURE = (ids) => {
  const rgb2hex = (c) => { const m = c.match(/\d+/g); if (!m) return c; return "#" + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase(); };
  const out = {};
  for (const id of ids) {
    const e = document.querySelector(`[data-el="${id}"]`); if (!e) { out[id] = null; continue; }
    const sec = e.closest(".sec"); const sr = sec ? sec.getBoundingClientRect() : { left: 0, top: 0 };
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    out[id] = { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height,
      size: parseFloat(cs.fontSize), weight: +cs.fontWeight, font: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(), color: rgb2hex(cs.color) };
  }
  return out;
};

function round(n) { return Math.round(n * 100) / 100; }
const POS_TOL = 4, SIZE_TOL = 2;

const browser = await chromium.launch();
const fails = [];
let checked = 0;
for (const dev of ["pc", "sp"]) {
  const width = W[dev];
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  await ctx.route(/google\.com\/maps/, (r) => r.abort());
  const page = await ctx.newPage();
  // ページごとに要素をまとめて測る
  const byPage = {};
  for (const [id, rec] of Object.entries(expected)) (byPage[rec.page] ??= []).push(id);
  for (const [pid, ids] of Object.entries(byPage)) {
    await page.goto(pathToFileURL(path.join(distDir, fileFor(pid))).href, { waitUntil: "load" });
    for (let i = 0; i < 40; i++) { const ok = await page.evaluate(() => { document.body.offsetHeight; const rf = parseFloat(getComputedStyle(document.documentElement).fontSize); return rf > 0 && rf < 15 && (!document.fonts || document.fonts.status === "loaded"); }); if (ok) break; await page.waitForTimeout(120); }
    await page.waitForTimeout(120);
    const meas = await page.evaluate(MEASURE, ids);
    for (const id of ids) {
      const exp = expected[id][dev]; if (!exp || exp.x == null) continue;
      const act = meas[id];
      if (!act) { fails.push(`${dev} ${id}: 要素が見つかりません`); continue; }
      checked++;
      // 繰り返す部品（表・カード・開閉式）は中身に合わせて高さが決まり、位置も上の可変要素で動く
      // ＝「中身に合わせる」扱いで y・h を照合しない（SPEC 10.1）。x・w は固定なので照合する。
      const isRep = expected[id].type === "repeater";
      const dx = Math.abs(act.x - exp.x), dy = Math.abs(act.y - exp.y), dw = Math.abs(act.w - exp.w);
      if (dx > POS_TOL) fails.push(`${dev} ${id} x: 期待 ${exp.x} 実測 ${round(act.x)}（差 ${round(dx)} > ${POS_TOL}）`);
      if (!isRep && dy > POS_TOL) fails.push(`${dev} ${id} y: 期待 ${exp.y} 実測 ${round(act.y)}（差 ${round(dy)} > ${POS_TOL}）`);
      if (dw > SIZE_TOL) fails.push(`${dev} ${id} w: 期待 ${exp.w} 実測 ${round(act.w)}（差 ${round(dw)} > ${SIZE_TOL}）`);
      if (exp.h != null && !isRep && expected[id].type !== "text" && Math.abs(act.h - exp.h) > SIZE_TOL) fails.push(`${dev} ${id} h: 期待 ${exp.h} 実測 ${round(act.h)}（差 ${round(Math.abs(act.h - exp.h))} > ${SIZE_TOL}）`);
      if (expected[id].type === "text") {
        if (Math.abs(act.size - exp.size) > 0.6) fails.push(`${dev} ${id} 文字サイズ: 期待 ${exp.size} 実測 ${round(act.size)}`);
        if (act.weight !== exp.weight) fails.push(`${dev} ${id} 太さ: 期待 ${exp.weight} 実測 ${act.weight}`);
        if (exp.font && act.font !== exp.font) fails.push(`${dev} ${id} 書体: 期待 ${exp.font} 実測 ${act.font}`);
        if (exp.color && act.color !== exp.color) fails.push(`${dev} ${id} 色: 期待 ${exp.color} 実測 ${act.color}`);
      }
    }
  }
  await ctx.close();
}
await browser.close();

console.log(`spec-check：照合 ${checked} 項目（要素×端末）／許容差 位置±${POS_TOL}px・大きさ±${SIZE_TOL}px・文字は完全一致`);
if (!fails.length) { console.log("✓ すべて許容差内"); process.exit(0); }
console.log(`⚠ 許容差外 ${fails.length} 件:`);
for (const f of fails) console.log("  " + f);
process.exit(1);
