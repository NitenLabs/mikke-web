#!/usr/bin/env node
// wa-22：dist/<店> の数値の検査（wa20-check を元に、点検する要素を wa-22 の名前にした）（撮影はしない）。横はみ出し・文字のはみ出しと重なり・セクションの高さ・読めない写真・コントラスト・リンク・カードの枚数・タブレットの列幅に加え、
// ボタン・電話番号・フッターのナビ・ヘッダーの店名が実際に <a>（電話は tel:）で、押した位置で最前面になっていることを調べる。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const ID = process.argv[2] || "sunao";
const URL_ = pathToFileURL(path.resolve(`dist/${ID}/index.html`)).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 834, 1007, 1008, 1024, 1280, 1440, 1920];
const TABLET = [768, 834, 1024];
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const CARDS = Object.values(site.elements).filter((e) => e.type === "repeater").reduce((n, e) => n + e.source.pick.length, 0); // 品ごとの repeater（定番 5・季節 5・サイズ 3・持ち帰り 1）
const NFT = Object.keys(site.elements).filter((k) => /^ft_n\d+$/.test(k)).length;
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).map(([k, v]) => [k, v.minHeight[d]]));
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
    await page.evaluate(async () => { for (const i of document.images) i.loading = "eager"; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    await page.waitForTimeout(300);
    const r = await page.evaluate((NFT) => {
      const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], secs: {}, broken: [], contrast: [], min: 99, links: [], orphan: [], notA: [] };
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
      const T = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => !e.closest(".nav-menu"));
      const idOf = (e) => e.dataset.el || e.dataset.cel;
      const rect = (e) => { const R = document.createRange(); R.selectNodeContents(e); return R.getBoundingClientRect(); };
      for (const e of T) { const b = rect(e), id = idOf(e); if (b.right > vw + 0.5 || b.left < -0.5) out.clip.push(id); if (e.scrollWidth > e.clientWidth + 3 || e.scrollHeight > e.clientHeight + 6) out.clip.push(id + "(中身)"); }
      const R = T.filter((e) => !e.closest(".site-header")).map((e) => { const b = rect(e); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], b = R[j][1]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) out.over.push(R[i][0] + "×" + R[j][0]); }
      for (const s of document.querySelectorAll("[data-sec]")) out.secs[s.dataset.sec] = Math.round(s.getBoundingClientRect().height * 10) / 10;
      for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
      out.cards = document.querySelectorAll(".rep-card").length;
      out.map = document.querySelectorAll("[data-el=ac_mapbox] iframe").length;
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const bgOf = (e) => { const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; for (const n of document.elementsFromPoint(cx, cy)) { if (n === e || e.contains(n)) continue; const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 255, g: 255, b: 255 }; };
      for (const e of T) { e.scrollIntoView({ block: "center" }); const fg = parse(getComputedStyle(e).color), bg = bgOf(e), a = L(fg), b = L(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (cr < out.min) out.min = Math.round(cr * 100) / 100; if (cr < 4.5) out.contrast.push(`${idOf(e)}:${cr.toFixed(2)}`); }
      scrollTo(0, 0);
      for (const a of document.querySelectorAll("a[href]")) { const h = a.getAttribute("href"); if (h.startsWith("#") && h.length > 1) { if (!document.getElementById(decodeURIComponent(h.slice(1)))) out.links.push(h); } else if (h === "#" || h === "" || h.startsWith("javascript:")) out.links.push("飾り:" + h); else if (h.startsWith("tel:") && !/^tel:[+\d-]{10,}$/.test(h)) out.links.push(h); }
      out.tel = document.querySelectorAll('a[href^="tel:"]').length;
      // 押せるはずの文字が本当に <a> か（style.link の回避の確認）
      const must = { hd_name: (h) => h === "./", hd_tel_t: (h) => /^tel:0/.test(h), ac_tel_t: (h) => /^tel:0/.test(h), ac_map_t: (h) => /^https:\/\/www\.google\.com\/maps/.test(h), ft_tv: (h) => /^tel:0/.test(h), ac_v2: (h) => /^tel:0/.test(h), };
      for (let i = 0; i < NFT; i++) must[`ft_n${i}`] = (h) => h.startsWith("#") && h.length > 1;
      for (const [id, ok] of Object.entries(must)) { const e = document.querySelector(`[data-el="${id}"]`); if (!e || e.tagName !== "A" || !ok(e.getAttribute("href") || "")) { out.notA.push(`${id}(${e ? e.tagName + " " + (e.getAttribute("href") || "") : "無し"})`); continue; } e.scrollIntoView({ block: "center" }); const b = e.getBoundingClientRect(), top = document.elementFromPoint(b.left + Math.min(b.width / 2, 40), b.top + b.height / 2); if (!top || top.closest("a") !== e) out.notA.push(`${id}(押した位置に別の要素 ${top ? top.tagName + "." + (top.dataset.el || "") : "無し"})`); }
      scrollTo(0, 0);
      const lastLine = (e) => { const tn = [], W = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); while (W.nextNode()) tn.push(W.currentNode); const lines = {}; for (const n of tn) for (let i = 0; i < n.length; i++) { if (!n.data[i].trim()) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const y = Math.round(g.getBoundingClientRect().top); lines[y] = (lines[y] || 0) + 1; } return Object.keys(lines).map(Number).sort((a, b) => a - b).map((y) => lines[y]); };
      for (const e of document.querySelectorAll('[data-cel$="_nm"],[data-cel$="_ds"],[data-el=fv_copy],[data-el=fv_p],[data-el=fv_note],[data-el=fl_p],[data-el=fl_pick],[data-el=sz_p],[data-el=cr_p],[data-el^=cr_tx],[data-el^=cr_nm],[data-el=sea_t],[data-el^=fq_q],[data-el^=fq_a],[data-el^=ac_v],[data-el=tp_t],[data-el=ft_line]')) { if (!vis(e) || getComputedStyle(e).writingMode.startsWith("vertical")) continue; const c = lastLine(e); if (c.length > 1 && c[c.length - 1] <= 2) out.orphan.push(e.textContent.slice(0, 12) + ":" + c.join("/")); }
      { const n = document.querySelector('[data-el=hd_nav]'), b = document.querySelector('[data-el=hd_tel_b]'); if (n && b) { const x = n.getBoundingClientRect(), y = b.getBoundingClientRect(); if (x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom) out.navBtn = true; } }
      out.fakeBtn = [...document.querySelectorAll('.el-shape')].filter(vis).filter((e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(), rad = parseFloat(s.borderTopLeftRadius); return b.height >= 16 && b.height <= 64 && b.width > b.height * 1.6 && rad >= b.height / 2 - 1 && !e.closest('a'); }).map(idOf);
      out.demo = /架空のお店のデザイン見本/.test(document.body.textContent);
      const src = [...document.images].map((i) => i.getAttribute("src").split("?")[0]); out.dup = src.filter((s, i) => src.indexOf(s) !== i);
      out.placeholder = (document.body.innerText.match(/入ります|差し替え|ダミー|Lorem|TODO/g) || []).join(",");
      return out;
    }, NFT);
    if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
    if (r.clip.length) ng(`${w}: 文字のはみ出し ${[...new Set(r.clip)].join(",")}`);
    if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
    if (r.orphan.length) ng(`${w}: 最後の行が 1〜2 字 ${r.orphan.join(",")}`);
    if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
    if (r.contrast.length) ng(`${w}: コントラスト ${r.contrast.join(",")}`);
    if (r.links.length) ng(`${w}: リンク切れ ${r.links.join(",")}`);
    if (r.notA.length) ng(`${w}: <a> になっていない ${r.notA.join(",")}`);
    if (r.cards !== CARDS) ng(`${w}: カード ${r.cards} 枚（品は ${CARDS}）`);
    if (r.map !== 1) ng(`${w}: 地図 ${r.map}`);
    if (r.navBtn) ng(`${w}: ナビとボタンが重なる`);
    if (r.fakeBtn.length) ng(`${w}: 押せない飾りのボタン ${r.fakeBtn.join(",")}`);
    if (!r.demo) ng(`${w}: 架空のお店の一文が無い`);
    if (r.dup.length) ng(`${w}: 写真の重複 ${r.dup.join(",")}`);
    if (r.placeholder) ng(`${w}: 仮の文 ${r.placeholder}`);
    if (errs.length) ng(`${w}: エラー ${errs.join(" / ")}`);
    if (SPEC[w]) for (const [s, h] of Object.entries(SPEC[w])) if (Math.abs((r.secs[s] ?? 0) - h) > 10) ng(`${w}: ${s} 高さ ${r.secs[s]}（設計 ${h}）`);
    if (TABLET.includes(w)) {
      const c = await page.evaluate(() => {
        const box = (s) => document.querySelector(`[data-el="${s}"],[data-cel="${s}"]`).getBoundingClientRect();
        const span = (...ids) => { const b = ids.map(box); return Math.max(...b.map((x) => x.right)) - Math.min(...b.map((x) => x.left)); };
        return { fv: span("fv_ph", "fv_copy"), classic: span("fl_c0", "fl_c2"), board: span("fl_board"), season: span("fl_ph", "fl_k0"), sizes: span("sz_c0", "sz_c2"), takeout: span("sz_to"), craft: span("cr_ph0", "cr_ph1"), faq: span("fq_a0", "fq_a1"), access: span("ac_l0", "ac_mapbox") };
      });
      for (const [k, v] of Object.entries(c)) if (v < w * 0.7) ng(`${w}: 列 ${k} が ${Math.round(v)}px（画面幅の 70% 未満）`);
      console.log(`${w}: 列の幅 ${JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v)])))}`);
    }
    if (w === 1440 || w === 768 || w === 390) console.log(`${w}: 高さ ${JSON.stringify(r.secs)} コントラスト最小 ${r.min} tel ${r.tel} 件`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅 問題なし`);
process.exit(bad ? 1 : 0);
