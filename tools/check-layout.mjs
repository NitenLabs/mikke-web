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
let problems = 0;
const unavailable = [];
const allNewOverlaps = [];

console.log("レイアウト検査（JavaScript 無効＝静的な位置のまま／chromium・webkit・firefox）");
console.log("列: 実測ずれ最大（実際の高さ − build時の実測値, design px）／補正JS発火／横はみ出し／想定外の重なり\n");
const head = "  ページ  幅       実測ずれ最大               補正JS  はみ出し  想定外の重なり";

for (const [engineName, engine] of ENGINES) {
  let browser;
  try { browser = await engine.launch(process.env.CHROME_PATH && engineName === "chromium" ? { executablePath: process.env.CHROME_PATH } : {}); }
  catch (e) { unavailable.push(`${engineName}（未インストール：npx playwright install ${engineName}）`); continue; }
  console.log(`【${engineName}】`);
  console.log(head);
  // context・page を1つだけ作り、幅は setViewportSize で変える（フォントをキャッシュして使い回す＝速い）。
  // ※ isMobile は使わない（firefox は mobile 端末エミュレーション非対応で setViewportSize が固まる。
  //   レイアウトは幅で決まる〔メディアクエリ〕ので isMobile は不要）。
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1, locale: "ja-JP", javaScriptEnabled: false });
  // 地図の埋め込み（Google Maps iframe）は外部で、レイアウト検査には不要。読み込むと firefox が
  // 再ナビゲーションで固まるので遮断する（フォントは通す＝実測との突き合わせに必要）。
  await ctx.route(/google\.com\/maps/, (route) => route.abort());
  const page = await ctx.newPage();
  for (const file of pages) {
    const name = pageName(file);
    const excl = layout.pages?.[name] || { pc: [], sp: [] };
    for (const width of WIDTHS) {
      const device = width < 768 ? "sp" : "pc";
      // 1回の測定（goto→フォント猶予→計測）。firefox は同一URLへの再ナビゲーションで稀に固まるので
      // 1回だけリトライし、それでも失敗したら「測定失敗」として続行する（1件で全体を止めない）。
      let r = null;
      for (let attempt = 0; attempt < 2 && !r; attempt++) {
        try {
          await page.setViewportSize({ width, height: 900 });
          // 幅ごとに URL を変える（キャッシュ回避）と firefox の同一URL再ナビゲーションの固まりを避けられる
          await page.goto(`${pathToFileURL(file).href}?w=${width}`, { waitUntil: "domcontentloaded", timeout: 20000 });
          // フォントの読み込みの猶予（node 側の待ち。JS無効の firefox では in-page の async evaluate が
          // 解決しないため使わない）。
          await page.waitForTimeout(1200);
          r = await page.evaluate(ANALYZE, { exclude: excl[device], device });
        } catch (e) {
          if (attempt === 1) { console.log(`  ${name.padEnd(6)} ${String(width).padStart(4)}px  測定失敗（${e.name || "error"}）`); }
        }
      }
      if (!r) { problems++; continue; }
      if (r.overflowPx > 2 || r.newOverlaps.length) problems++;
      if (r.newOverlaps.length) allNewOverlaps.push({ engine: engineName, name, width, list: r.newOverlaps });
      const dev = `${r.maxDev}px${r.maxDevEl ? `（${r.maxDevEl}）` : ""}`;
      console.log(
        `  ${name.padEnd(6)} ${String(width).padStart(4)}px  ${dev.padEnd(24)} ${(r.fires ? "発火" : "しない").padEnd(6)} ${(r.overflowPx > 2 ? r.overflowPx + "px" : "なし").padEnd(7)} ${r.newOverlaps.length ? "⚠ " + r.newOverlaps.map((o) => `${o.a}×${o.b}`).join(", ") : "なし"}`
      );
    }
  }
  console.log("");
  await browser.close();
}

if (unavailable.length) console.log("未実施のエンジン: " + unavailable.join(" 、 ") + "\n");
if (allNewOverlaps.length) {
  console.log("想定外の重なり（配置の時点で重なっていない組が表示で重なった）:");
  for (const o of allNewOverlaps) console.log(`  ${o.engine} ${o.name} ${o.width}px: ${o.list.map((x) => `${x.a}×${x.b}(${x.ox}×${x.oy}px)`).join(", ")}`);
}
console.log(problems ? `\n⚠ 問題のある組み合わせ: ${problems} 件` : "\n✓ すべての エンジン×ページ×幅 で 想定外の重なり・はみ出しなし");
process.exit(0);
