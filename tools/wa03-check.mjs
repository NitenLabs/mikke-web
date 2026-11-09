#!/usr/bin/env node
// wa-03：dist/roku の数値の検査（撮影はしない）。幅 320〜1920 の横はみ出し・文字のはみ出し・文字どうしの重なり・
// セクションの高さ（SPEC 比）・読めない写真・コントラスト・写真の帯の動きを調べる。問題があれば終了コード 1。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const URL_ = pathToFileURL(path.resolve("dist/roku/index.html")).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 1007, 1008, 1024, 1280, 1440, 1920];
const site = JSON.parse(fs.readFileSync("samples/roku/site.json", "utf8"));
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).map(([k, v]) => [k, v.minHeight[d]]));
const SPEC = { 1440: specOf("pc"), 390: specOf("sp") };
const browser = await chromium.launch();
let bad = 0;
const ng = (m) => { bad++; console.log("NG " + m); };
let info = {};
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: w < 1008 ? 844 : 900 } });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(URL_, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], secs: {}, broken: [], contrast: [], min: 99 };
    const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
    const T = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => !e.closest(".nav-menu"));
    const idOf = (e) => e.dataset.el || e.dataset.cel;
    for (const e of T) { const b = e.getBoundingClientRect(); const id = idOf(e); if (b.right > vw + 0.5 || b.left < -0.5) out.clip.push(id); const script = /fv_script|st_script/.test(id); if (e.scrollWidth > e.clientWidth + 3 || (!script && e.scrollHeight > e.clientHeight + 6)) out.clip.push(id + "(中身)"); }
    const rect = (e) => { const R = document.createRange(); R.selectNodeContents(e); return R.getBoundingClientRect(); };
    const R = T.filter((e) => !e.closest(".site-header")).map((e) => { const b = rect(e); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], b = R[j][1]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) out.over.push(R[i][0] + "×" + R[j][0]); }
    for (const s of document.querySelectorAll("[data-sec]")) out.secs[s.dataset.sec] = Math.round(s.getBoundingClientRect().height * 10) / 10;
    const body = document.querySelector("[data-el=st_body]"); out.bodyPx = body ? parseFloat(getComputedStyle(body).fontSize) : 0;
    const R2 = document.createRange(); if (body) { R2.selectNodeContents(body); out.bodyH = Math.round(R2.getBoundingClientRect().height * 10) / 10; }
    for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
    out.cards = document.querySelectorAll("[data-el=mn_cards] .rep-card").length;
    out.price = [...document.querySelectorAll('[data-cel="c_pr"]')].filter(vis).map((e) => e.textContent.trim());
    out.strip = document.querySelectorAll("[data-el^=sr_]").length;
    out.clones = document.querySelectorAll("[data-clone]").length;
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 255, g: 255, b: 255 }; };
    const scr = /fv_script|st_script/;
    for (const e of T) {
      const id = idOf(e); if (scr.test(id)) continue;
      const fg = parse(getComputedStyle(e).color), bg = bgOf(e);
      const a = L(fg), b = L(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (cr < out.min) out.min = Math.round(cr * 100) / 100;
      if (cr < 4.5) out.contrast.push(`${id}:${cr.toFixed(2)}`);
    }
    return out;
  });
  if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
  if (r.clip.length) ng(`${w}: 文字のはみ出し ${[...new Set(r.clip)].join(",")}`);
  if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
  if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
  if (r.contrast.length) ng(`${w}: コントラスト ${r.contrast.join(",")}`);
  if (r.cards !== 8) ng(`${w}: カード ${r.cards} 枚`);
  if (r.strip !== 6 || r.clones !== 6) ng(`${w}: 帯 ${r.strip}＋複製 ${r.clones}`);
  if (errs.length) ng(`${w}: エラー ${errs.join(" / ")}`);
  if (SPEC[w]) for (const [s, h] of Object.entries(SPEC[w])) if (Math.abs((r.secs[s] ?? 0) - h) > 1.5) ng(`${w}: ${s} 高さ ${r.secs[s]}（設計 ${h}）`);
  if (w === 1440 || w === 390) {
    const x0 = await page.evaluate(() => document.querySelector('[data-el="sr_2"]').getBoundingClientRect().left);
    await page.waitForTimeout(1500);
    const x1 = await page.evaluate(() => document.querySelector('[data-el="sr_2"]').getBoundingClientRect().left);
    if (!(x1 < x0)) ng(`${w}: 帯が流れていない`);
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, reducedMotion: "reduce" });
    const q = await ctx.newPage(); await q.goto(URL_, { waitUntil: "load" });
    const still = await q.evaluate(() => ({ an: getComputedStyle(document.querySelector('[data-el="sr_1"]')).animationName, n: document.querySelectorAll("[data-clone]").length }));
    if (still.an !== "none" || still.n !== 0) ng(`${w}: 動きを減らす設定でも動いている`);
    await ctx.close();
    console.log(`${w}: 高さ ${JSON.stringify(r.secs)} 物語の本文 ${r.bodyH}px コントラスト最小 ${r.min} 値段 ${r.price.length} 件`);
  }
  await page.close();
}
await browser.close();
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅 問題なし`);
process.exit(bad ? 1 : 0);
