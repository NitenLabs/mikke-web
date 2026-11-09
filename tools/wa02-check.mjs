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
    const b2 = document.querySelector("[data-g=toggle]")?.getBoundingClientRect(), g4 = document.querySelector("[data-el=gal_4]")?.getBoundingClientRect(); out.btnOff = b2 && g4 ? Math.abs((b2.left + b2.right) / 2 - (g4.left + g4.right) / 2) : 99;
    out.fvTop = Math.round(document.querySelector("[data-sec=sec_firstv]").getBoundingClientRect().top + scrollY);
    for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
    return out;
  });
  if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
  if (r.clip.length) ng(`${w}: 文字のはみ出し ${r.clip.join(",")}`);
  if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
  if (w >= 768 && w <= 1007 && r.bodyPx < 14) ng(`${w}: 本文 ${r.bodyPx}px（14 未満）`);
  if (r.btnOff > 2) ng(`${w}: ギャラリーのボタンが中央からずれ ${r.btnOff}`);
  if (r.fvTop !== 0) ng(`${w}: 最初の写真の上に ${r.fvTop}px の空き`);
  if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
  if (errs.length) ng(`${w}: エラー ${errs.join(" / ")}`);
  if (SPEC[w]) for (const [s, h] of Object.entries(SPEC[w])) if (Math.abs((r.secs[s] ?? 0) - h) > 1.5) ng(`${w}: ${s} 高さ ${r.secs[s]}（設計 ${h}）`);
  if (w === 1440 || w === 390) {
    const g = await page.evaluate(() => { const c = () => Math.round(document.querySelector('[data-el="gal_4"]').getBoundingClientRect().left); const a = c(); document.querySelector("[data-g=next]").click(); return { a, g: getComputedStyle(document.querySelector('[data-el="gal_4"]')).getPropertyValue("--g").trim() }; });
    if (g.g !== "-1") ng(`${w}: ギャラリーの送りが効かない（--g=${g.g}）`);
    const a = await page.evaluate(() => { const D = [...document.querySelectorAll(".wa02-acc")], closed = D.every((d) => !d.open); D.forEach((d) => { d.open = true; }); return { n: D.length, closed }; });
    await page.waitForTimeout(150);
    const fit = await page.evaluate(() => { const b = document.querySelector("[data-el=mn_acc]").getBoundingClientRect(), s = document.querySelector("[data-sec=sec_menu]").getBoundingClientRect(); return Math.round(s.bottom - b.bottom); });
    if (a.n !== 6 || !a.closed) ng(`${w}: 開く括り ${a.n}・初めに閉じている ${a.closed}`);
    if (fit < 40) ng(`${w}: 括りを全部開くと区画からはみ出す（下の余白 ${fit}）`);
    console.log(`${w}: 括り ${a.n} 個・全部開いた時の下の余白 ${fit}px`);
    console.log(`${w}: ギャラリー中央 left=${g.a}（設計 ${w === 1440 ? 370 : 24}）`);
  }
  await page.close();
}
await browser.close();
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅 問題なし`);
process.exit(bad ? 1 : 0);
