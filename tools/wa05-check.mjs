#!/usr/bin/env node
// wa-05：dist/sumi の数値の検査（撮影はしない）。幅 320〜1920 の横はみ出し・文字のはみ出し・文字どうしの重なり・
// セクションの高さ（設計との比較）・読めない写真・コントラスト・リンク切れ・写真の帯の動きを調べる。問題があれば終了コード 1。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const URL_ = pathToFileURL(path.resolve("dist/sumi/index.html")).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 834, 1007, 1008, 1024, 1280, 1440, 1920];
const TABLET = [768, 834, 1024]; // 本文の列が画面幅の 70% 以上、濃い帯とフッターが画面いっぱいか（1024 も finish の BP でタブレットの配置）
const site = JSON.parse(fs.readFileSync("samples/sumi/site.json", "utf8"));
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).map(([k, v]) => [k, v.minHeight[d]]));
// ご挨拶のスマホは本文の折り返しの実測で数 px 伸びるので、許容を 6px にする
const SPEC = { 1440: specOf("pc"), 390: specOf("sp") };
const browser = await chromium.launch();
let bad = 0;
const ng = (m) => { bad++; console.log("NG " + m); };
try {
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: w < 1008 ? 844 : 900 } });
    const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(URL_, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // 遅延読み込みの写真を読ませる
    await page.evaluate(async () => { for (const i of document.images) i.loading = "eager"; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], secs: {}, broken: [], contrast: [], min: 99, links: [], orphan: [], dup: [] };
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
      const T = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => !e.closest(".nav-menu"));
      const idOf = (e) => e.dataset.el || e.dataset.cel;
      const rect = (e) => { const R = document.createRange(); R.selectNodeContents(e); return R.getBoundingClientRect(); };
      for (const e of T) { const b = rect(e), id = idOf(e); if (b.right > vw + 0.5 || b.left < -0.5) out.clip.push(id); const cs = getComputedStyle(e), tall = cs.writingMode.startsWith("vertical"); const lh = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize); if (!tall && (e.scrollWidth > e.clientWidth + 3 || (lh >= 1.25 && e.scrollHeight > e.clientHeight + 6))) out.clip.push(id + "(中身)"); if (tall && e.scrollHeight > e.clientHeight + 6) out.clip.push(id + "(縦の中身)"); }
      const R = T.map((e) => { const b = rect(e); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], b = R[j][1]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) out.over.push(R[i][0] + "×" + R[j][0]); }
      for (const s of document.querySelectorAll("[data-sec]")) out.secs[s.dataset.sec] = Math.round(s.getBoundingClientRect().height * 10) / 10;
      for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
      out.cards = document.querySelectorAll("[data-el=sn_cards] .rep-card").length;
      out.strip = document.querySelectorAll("[data-el^=st_]").length;
      out.clones = document.querySelectorAll("[data-clone]").length;
      out.map = document.querySelectorAll("[data-el=in_mapbox] iframe").length;
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      // 文字の真下にある色の面を、重なりの順で探す（濃い帯は section の子の別要素なので親をたどるだけでは見つからない）
      const bgOf = (e) => { const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; for (const n of document.elementsFromPoint(cx, cy)) { if (n === e || e.contains(n)) continue; const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 244, g: 240, b: 232 }; };
      for (const e of T) { e.scrollIntoView({ block: "center" }); const fg = parse(getComputedStyle(e).color), bg = bgOf(e), a = L(fg), b = L(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (cr < out.min) out.min = Math.round(cr * 100) / 100; if (cr < 4.5) out.contrast.push(`${idOf(e)}:${cr.toFixed(2)}`); }
      scrollTo(0, 0);
      // リンク：ページ内の飛び先の有無、tel: の形、飾りの href
      for (const a of document.querySelectorAll("a[href]")) { const h = a.getAttribute("href"); if (h.startsWith("#") && h.length > 1) { if (!document.getElementById(decodeURIComponent(h.slice(1)))) out.links.push(h); } else if (h === "#" || h === "" || h.startsWith("javascript:")) out.links.push("飾り:" + h); else if (h.startsWith("tel:") && !/^tel:[+\d-]{10,}$/.test(h)) out.links.push(h); }
      out.tel = document.querySelectorAll('a[href^="tel:"]').length;
      out.anchors = document.querySelectorAll('a[href^="#"]').length;
      // 品名の最後の行が 1〜2 字
      for (const e of document.querySelectorAll('[data-cel="c_nm"],[data-cel="c_ds"]')) { if (!vis(e)) continue; const tn = [], W = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); while (W.nextNode()) tn.push(W.currentNode); const lines = {}; for (const n of tn) for (let i = 0; i < n.length; i++) { if (!n.data[i].trim()) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const y = Math.round(g.getBoundingClientRect().top); lines[y] = (lines[y] || 0) + 1; } const c = Object.keys(lines).map(Number).sort((a, b) => a - b).map((y) => lines[y]); if (c.length > 1 && c[c.length - 1] <= 2) out.orphan.push(e.textContent.slice(0, 12) + ":" + c.join("/")); }
      out.demo = /架空のお店のデザイン見本/.test(document.body.textContent);
      const src = [...document.images].filter((i) => !i.closest("[data-clone]")).map((i) => i.getAttribute("src").split("?")[0]); out.dup = src.filter((s, i) => src.indexOf(s) !== i);
      out.placeholder = (document.body.innerText.match(/入ります|差し替え|ダミー|Lorem|TODO/g) || []).join(",");
      return out;
    });
    if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
    if (r.clip.length) ng(`${w}: 文字のはみ出し ${[...new Set(r.clip)].join(",")}`);
    if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
    if (r.orphan.length) ng(`${w}: 最後の行が 1〜2 字 ${r.orphan.join(",")}`);
    if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
    if (r.contrast.length) ng(`${w}: コントラスト ${r.contrast.join(",")}`);
    if (r.links.length) ng(`${w}: リンク切れ ${r.links.join(",")}`);
    if (r.cards !== 4) ng(`${w}: カード ${r.cards} 枚`);
    if (r.strip !== 5 || r.clones !== 5) ng(`${w}: 帯 ${r.strip}＋複製 ${r.clones}`);
    if (r.map !== 1) ng(`${w}: 地図 ${r.map}`);
    if (!r.demo) ng(`${w}: 架空のお店の一文が無い`);
    if (r.dup.length) ng(`${w}: 写真の重複 ${r.dup.join(",")}`);
    if (r.placeholder) ng(`${w}: 仮の文 ${r.placeholder}`);
    if (errs.length) ng(`${w}: エラー ${errs.join(" / ")}`);
    if (SPEC[w]) for (const [s, h] of Object.entries(SPEC[w])) if (Math.abs((r.secs[s] ?? 0) - h) > (s === "sec_greeting" ? 6 : 1.5)) ng(`${w}: ${s} 高さ ${r.secs[s]}（設計 ${h}）`);
    if (TABLET.includes(w)) {
      const c = await page.evaluate(() => {
        const box = (s) => document.querySelector(`[data-el="${s}"]`).getBoundingClientRect();
        const span = (...ids) => { const b = ids.map(box); return Math.max(...b.map((x) => x.right)) - Math.min(...b.map((x) => x.left)); };
        return { gr_p: box("gr_p").width, cu_p: box("cu_p").width, sn_cards: box("sn_cards").width, course: box("co_l00").width, seats: span("se_ph1", "se_p1"), info: box("in_l0").width, band: box("sn_band").width, foot: box("ft_card").width };
      });
      const { band, foot, ...cols } = c;
      for (const [k, v] of Object.entries(cols)) if (v < w * 0.7) ng(`${w}: 本文の列 ${k} が ${Math.round(v)}px（画面幅の 70% 未満）`);
      if (Math.abs(band - w) > 1) ng(`${w}: 濃い帯が端まで届いていない ${band}`);
      if (Math.abs(foot - w) > 1) ng(`${w}: フッターが全幅でない ${foot}`);
      console.log(`${w}: 列の幅 ${JSON.stringify(Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, Math.round(v)])))}`);
    }
    if (w === 1440 || w === 768 || w === 390) {
      const x0 = await page.evaluate(() => document.querySelector('[data-el="st_2"]').getBoundingClientRect().left);
      await page.waitForTimeout(1500);
      const x1 = await page.evaluate(() => document.querySelector('[data-el="st_2"]').getBoundingClientRect().left);
      if (!(x1 < x0)) ng(`${w}: 帯が流れていない`);
      const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, reducedMotion: "reduce" });
      const q = await ctx.newPage(); await q.goto(URL_, { waitUntil: "load" });
      const still = await q.evaluate(() => ({ an: getComputedStyle(document.querySelector('[data-el="st_1"]')).animationName, n: document.querySelectorAll("[data-clone]").length }));
      if (still.an !== "none" || still.n !== 0) ng(`${w}: 動きを減らす設定でも動いている`);
      await ctx.close();
      console.log(`${w}: 高さ ${JSON.stringify(r.secs)} コントラスト最小 ${r.min} tel ${r.tel} 件・ページ内リンク ${r.anchors} 件`);
    }
    await page.close();
  }
} finally { await browser.close(); }
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅 問題なし`);
process.exit(bad ? 1 : 0);
