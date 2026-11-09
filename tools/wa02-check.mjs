#!/usr/bin/env node
// wa-02：dist/rian の数値の検査（撮影はしない）。幅 320〜1920 の横はみ出し・文字のはみ出し・文字どうしの重なり・
// セクションの高さ（SPEC 比）・ギャラリーの送りを調べる。問題があれば終了コード 1。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const URL_ = pathToFileURL(path.resolve("dist/rian/index.html")).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 1007, 1008, 1024, 1280, 1440, 1920];
const site = JSON.parse(fs.readFileSync("samples/rian/site.json", "utf8"));
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).map(([k, v]) => [k, v.minHeight[d]]));
const SPEC = { 1440: specOf("pc"), 390: specOf("sp") };
const browser = await chromium.launch();
let bad = 0;
const ng = (m) => { bad++; console.log("NG " + m); };
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: w < 768 ? 844 : 900 } });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(URL_, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], secs: {}, broken: [] };
    const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
    const T = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => !e.closest(".nav-menu"));
    for (const e of T) { const b = e.getBoundingClientRect(); const id = e.dataset.el || e.dataset.cel; if (b.right > vw + 0.5 || b.left < -0.5) out.clip.push(id); if (e.scrollWidth > e.clientWidth + 3 || e.scrollHeight > e.clientHeight + 6) out.clip.push(id + "(中身)"); }
    const rect = (e) => { const R = document.createRange(); R.selectNodeContents(e); return R.getBoundingClientRect(); };
    const yOf = (e) => { const b = rect(e); return { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }; };
    const fixed = (e) => ["fv_tabt"].includes(e.dataset.el) || e.closest(".site-header");
    const R = T.filter((e) => !fixed(e)).map((e) => [e.dataset.el || e.dataset.cel, yOf(e)]);
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], b = R[j][1]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) out.over.push(R[i][0] + "×" + R[j][0]); }
    for (const s of document.querySelectorAll("[data-sec]")) out.secs[s.dataset.sec] = Math.round(s.getBoundingClientRect().height * 10) / 10;
    const body = document.querySelector("[data-el=in_vt0]"); out.bodyPx = body ? parseFloat(getComputedStyle(body).fontSize) : 0;
    out.fvTop = Math.round(document.querySelector("[data-sec=sec_firstv]").getBoundingClientRect().top + scrollY);
    for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
    return out;
  });
  if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
  if (r.clip.length) ng(`${w}: 文字のはみ出し ${r.clip.join(",")}`);
  if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
  if (w >= 768 && w <= 1007 && r.bodyPx < 14) ng(`${w}: 本文 ${r.bodyPx}px（14 未満）`);
  if (r.fvTop !== 0) ng(`${w}: 最初の写真の上に ${r.fvTop}px の空き`);
  if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
  if (errs.length) ng(`${w}: エラー ${errs.join(" / ")}`);
  if (SPEC[w]) for (const [s, h] of Object.entries(SPEC[w])) if (Math.abs((r.secs[s] ?? 0) - h) > 1.5) ng(`${w}: ${s} 高さ ${r.secs[s]}（設計 ${h}）`);
  if (w === 1440 || w === 390) {
    const left = await page.evaluate(() => Math.round(document.querySelector('[data-el="gal_4"]').getBoundingClientRect().left));
    await page.waitForTimeout(5400);
    const g = await page.evaluate(() => ({ g: document.querySelector('[data-el="gal_4"]').style.getPropertyValue("--g"), btn: document.querySelectorAll(".wa02-btn,.wa02-acc").length, rows: document.querySelectorAll("[data-el=mn_side] .rep-card").length }));
    if (g.g !== "-1") ng(`${w}: ギャラリーが自動で送られない（--g=${g.g}）`);
    if (g.btn !== 0) ng(`${w}: ボタンか折りたたみが残っている（${g.btn}）`);
    if (g.rows < 30) ng(`${w}: 括りの品が開いて出ていない（${g.rows}）`);
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, reducedMotion: "reduce" });
    const q = await ctx.newPage(); await q.goto(URL_, { waitUntil: "load" }); await q.waitForTimeout(5400);
    const still = await q.evaluate(() => document.querySelector('[data-el="gal_4"]').style.getPropertyValue("--g"));
    if (still !== "") ng(`${w}: 動きを減らす設定でも動いている`);
    await ctx.close();
    console.log(`${w}: ギャラリー中央 left=${left}（設計 ${w === 1440 ? 370 : 24}）・品 ${g.rows} 行`);
  }
  await page.close();
}
await browser.close();
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅 問題なし`);
process.exit(bad ? 1 : 0);
