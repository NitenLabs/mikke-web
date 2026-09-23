#!/usr/bin/env node
// 参考サイトを「覆った」状態で撮影・実測する（第2部 clone §2.1）。
//   - 写真・背景画像・SVG → 同じ位置・大きさの灰色 #9A9A9A の面（上に重ねる＝src を触らずレイアウトを保つ）
//   - 文字 → 同じ文字数の仮の文字（漢字・かな・カナ→永／英字→n／数字→0／記号・空白・改行はそのまま）
//   - 動き（アニメ・トランジション）を止める
//   出力: refs/<slug>/masked/ に <pc|sp>-NN.jpg（縦分割）と elements-<pc|sp>.json（全要素の位置・大きさ・文字の段）
// 使い方: node tools/ref-mask.mjs <URL> [出力フォルダ]
import fs from "node:fs";
import path from "node:path";
let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }

const url = process.argv[2];
if (!url) { console.error("使い方: node tools/ref-mask.mjs <URL> [出力フォルダ]"); process.exit(1); }
const slug = new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9.-]/gi, "_");
const outRoot = process.argv[3] || path.join("refs", slug);
const out = path.join(outRoot, "masked");
fs.mkdirSync(out, { recursive: true });

const VIEWPORTS = { pc: { width: 1440, height: 900 }, sp: { width: 390, height: 844 } };
const GRAY = "#9A9A9A";
const CJK = /[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/; // かな・カナ・漢字

// 文字を仮の文字に・動きを止める（写真はこの段階で触らない＝レイアウトを保つ）
const MASK_TEXT = (cjkSrc) => {
  const CJKre = new RegExp(cjkSrc);
  const st = document.createElement("style");
  st.textContent = "*{animation:none!important;transition:none!important;animation-duration:0s!important;caret-color:transparent!important}";
  document.head.appendChild(st);
  const mapChar = (ch) => (/[0-9]/.test(ch) ? "0" : /[A-Za-z]/.test(ch) ? "n" : CJKre.test(ch) ? "永" : ch);
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = []; let n;
  while ((n = walk.nextNode())) nodes.push(n);
  for (const t of nodes) {
    if (!t.nodeValue) continue;
    const p = t.parentElement; if (!p) continue;
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(p.tagName)) continue;
    t.nodeValue = Array.from(t.nodeValue).map(mapChar).join("");
  }
};

// 写真・背景画像・SVG を灰色に置き換える。src は直接差し替え（大きさは実測で固定＝レイアウトを保つ）、
// Studio が貼り直しても MutationObserver で灰色に戻す（＝確実に単色になる。z 順に依存しない）。
const MASK_PHOTOS = (gray) => {
  const svgGray = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='${gray}'/></svg>`);
  const grayImg = (img) => {
    const r = img.getBoundingClientRect();
    if (r.width >= 2 && r.height >= 2) { img.style.width = r.width + "px"; img.style.height = r.height + "px"; }
    img.style.objectFit = "fill"; img.style.background = gray; img.style.filter = "none";
    img.removeAttribute("srcset");
    if (img.getAttribute("src") !== svgGray) img.setAttribute("src", svgGray);
  };
  for (const img of document.querySelectorAll("img")) grayImg(img);
  for (const el of document.querySelectorAll("body *")) {
    const bi = getComputedStyle(el).backgroundImage;
    // 画像を含む背景（グラデーション＋url の合成も含む）を灰色に。純粋なグラデーションは残す。
    // stylesheet 側の !important に負けないよう important で上書き
    if (bi && bi.includes("url(")) { el.style.setProperty("background-image", "none", "important"); el.style.setProperty("background-color", gray, "important"); }
  }
  for (const v of document.querySelectorAll("video,canvas")) { const r = v.getBoundingClientRect(); if (r.width >= 2 && r.height >= 2) { v.style.setProperty("visibility", "hidden"); const d = document.createElement("div"); d.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.top + scrollY}px;width:${r.width}px;height:${r.height}px;background:${gray};z-index:1`; document.body.appendChild(d); } }
  for (const svg of document.querySelectorAll("svg")) { svg.style.color = gray; for (const s of svg.querySelectorAll("*")) { if (s.getAttribute && s.getAttribute("fill") && s.getAttribute("fill") !== "none") s.setAttribute("fill", gray); if (s.getAttribute && s.getAttribute("stroke") && s.getAttribute("stroke") !== "none") s.setAttribute("stroke", gray); } }
  // 貼り直しに追従：src が戻されたら灰色に戻す
  const mo = new MutationObserver((muts) => { for (const m of muts) { if (m.target.tagName === "IMG" && m.target.getAttribute("src") !== svgGray) grayImg(m.target); } });
  mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["src", "srcset"] });
  window.__mo = mo;
};

// 全要素の位置・大きさ・文字の段を集める（可視の要素のみ）
const COLLECT = () => {
  const r2 = (v) => Math.round(v * 100) / 100;
  const rgb2hex = (c) => { const m = (c || "").match(/[\d.]+/g); return m ? "#" + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase() : null; };
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.id === "__maskLayer") continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const ownText = Array.from(el.childNodes).filter((c) => c.nodeType === 3 && c.nodeValue.trim()).map((c) => c.nodeValue).join("").trim();
    const isImg = el.tagName === "IMG";
    if (!ownText && !isImg) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      x: r2(r.left), y: r2(r.top + window.pageYOffset), w: r2(r.width), h: r2(r.height),
      text: ownText || null,
      font: ownText ? cs.fontFamily.split(",")[0].replace(/["']/g, "").trim() : null,
      size: ownText ? parseFloat(cs.fontSize) : null,
      lh: ownText ? (cs.lineHeight === "normal" ? "normal" : parseFloat(cs.lineHeight)) : null,
      weight: ownText ? +cs.fontWeight : null,
      ls: ownText ? (cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing)) : null,
      color: ownText ? rgb2hex(cs.color) : null,
      align: ownText ? cs.textAlign : null,
    });
  }
  return out;
};

const browser = await chromium.launch();
for (const [dev, vp] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  for (let y = 0; y <= 9000; y += 600) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(120); }
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate(() => scrollTo(0, 0));
  // 全高ビューポートで遅延読み込みを済ませてから覆う
  await page.setViewportSize({ width: vp.width, height: Math.min(docH, 16000) });
  await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1)).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(MASK_TEXT, CJK.source);
  const els = await page.evaluate(COLLECT); // 覆う面の前に幾何を取る
  fs.writeFileSync(path.join(out, `elements-${dev}.json`), JSON.stringify({ url, dev, viewport: vp, docH, elements: els }, null, 2));
  await page.evaluate(MASK_PHOTOS, GRAY);
  await page.waitForTimeout(300);
  const SEG = 1400;
  for (let i = 0, y = 0; y < docH; i++, y += SEG) {
    const h = Math.min(SEG, docH - y);
    await page.screenshot({ path: path.join(out, `${dev}-${String(i + 1).padStart(2, "0")}.jpg`), clip: { x: 0, y, width: vp.width, height: h }, type: "jpeg", quality: 78 });
  }
  console.log(`${dev}: docH=${docH}, 要素${els.length}件, 切り抜き${Math.ceil(docH / SEG)}枚`);
  await ctx.close();
}
await browser.close();
console.log("✓ 覚った参照元を書き出し:", out);
