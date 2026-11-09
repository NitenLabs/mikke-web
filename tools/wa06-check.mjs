#!/usr/bin/env node
// wa-06：dist/mareluce の数値の検査。幅 320〜1920 の横はみ出し・文字のはみ出しと重なり・1〜2 字だけの行・本文の列の幅（タブレット）・
// コントラスト（写真の上は実際の画素で測る）・読めない写真・リンク切れ・tel・架空の一文・「掲載店」・写真の重複・仮の文を調べる。問題があれば終了コード 1。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
const URL_ = pathToFileURL(path.resolve("dist/mareluce/index.html")).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 834, 1024, 1025, 1280, 1440, 1920]; // 1024／1025 が配置の切り替わり
const TABLET = [768, 834, 1024];
const PHOTO_W = [390, 768, 1440]; // 写真の上の文字を画素で測る幅
const site = JSON.parse(fs.readFileSync("samples/mareluce/site.json", "utf8"));
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).filter(([k]) => k !== "sec_header").map(([k, v]) => [k, v.minHeight[d]]));
const SPEC = { 1440: specOf("pc"), 390: specOf("sp") };
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const browser = await chromium.launch();
let bad = 0;
const ng = (m) => { bad++; console.log("NG " + m); };
try {
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: w < 1025 ? 844 : 900 } });
    const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(URL_, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => { for (const i of document.images) i.loading = "eager"; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], secs: {}, broken: [], contrast: [], min: 99, links: [], orphan: [], dup: [], onPhoto: [] };
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
      const all = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => !e.closest(".nav-menu"));
      const T = all.filter((e) => !e.closest(".site-header"));
      const idOf = (e) => e.dataset.el || e.dataset.cel;
      const rect = (e) => { const R = document.createRange(); R.selectNodeContents(e); return R.getBoundingClientRect(); };
      for (const e of all) { const b = rect(e), id = idOf(e); if (b.right > vw + 0.5 || b.left < -0.5) out.clip.push(id); const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize); if (e.scrollWidth > e.clientWidth + 3 || (lh >= 1.25 && e.scrollHeight > e.clientHeight + 6)) out.clip.push(id + "(中身)"); }
      // 店名は行の高さの範囲で見る（Range は字面より広い）。回転した手書きの札は外接の四角が広がるので重なりの対象にしない。スマホの段の高さは文字の折り返しで伸びるので +40 まで許す
      const R = all.filter((e) => idOf(e) !== "ab_hand").map((e) => { const b = /^(fv_name|ft_name)$/.test(idOf(e)) ? e.getBoundingClientRect() : rect(e); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], b = R[j][1]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) out.over.push(R[i][0] + "×" + R[j][0]); }
      // 手書きの札は大見出しと重ならないこと（回転を除いた枠で見る）
      const hand = document.querySelector("[data-el=ab_hand]"), abEn = document.querySelector("[data-el=ab_en]");
      if (hand && abEn) { const a = rect(hand), b = rect(abEn); out.handGap = Math.round(b.top - a.bottom); }
      for (const s of document.querySelectorAll("[data-sec]")) if (s.matches("section,div,footer") && s.dataset.sec !== "sec_header" && !out.secs[s.dataset.sec]) out.secs[s.dataset.sec] = Math.round(s.getBoundingClientRect().height * 10) / 10;
      for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
      out.photos = document.images.length;
      out.map = document.querySelectorAll("[data-el=ac_map] iframe").length;
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const isTerra = (c) => c.r === 194 && c.g === 96 && c.b === 63;
      const bgOf = (e) => { const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; for (const n of document.elementsFromPoint(cx, cy)) { if (n === e || e.contains(n)) continue; if (n.tagName === "IMG" || n.tagName === "PICTURE") return "photo"; if (n.getBoundingClientRect().height < 4) continue; const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 247, g: 241, b: 232 }; };
      for (const e of T) {
        e.scrollIntoView({ block: "center" });
        const cs = getComputedStyle(e), size = parseFloat(cs.fontSize), fg = parse(cs.color), bg = bgOf(e), id = idOf(e);
        if (bg === "photo") { const b = rect(e); out.onPhoto.push({ id, size, x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height, fg }); continue; }
        const a = L(fg), b = L(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (cr < out.min) out.min = Math.round(cr * 100) / 100;
        const terra = isTerra(fg) || isTerra(bg), need = terra && size >= 24 ? 3 : 4.5; // テラコッタは 24px 以上の大きい文字だけ 3:1 まで認める
        if (cr < need) out.contrast.push(`${id}:${cr.toFixed(2)}(${size}px)`);
      }
      scrollTo(0, 0);
      for (const a of document.querySelectorAll("a[href]")) { const h = a.getAttribute("href"); if (h.startsWith("#") && h.length > 1) { if (!document.getElementById(decodeURIComponent(h.slice(1)))) out.links.push(h); } else if (h === "#" || h === "" || h.startsWith("javascript:")) out.links.push("飾り:" + h); else if (h.startsWith("tel:") && h !== "tel:0797000000" && h !== "tel:0797-00-0000") out.links.push(h); }
      out.tel = document.querySelectorAll('a[href^="tel:"]').length;
      out.anchors = document.querySelectorAll('a[href^="#"]').length;
      // 1〜2 字だけの行（段落ごと。行は文字の上端で束ねる）
      for (const e of all) {
        const blocks = e.querySelectorAll(".pg").length ? [...e.querySelectorAll(".pg")] : [e];
        for (const blk of blocks) {
          const tn = [], W = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT); while (W.nextNode()) tn.push(W.currentNode);
          const ys = [], tol = parseFloat(getComputedStyle(e).fontSize) * 0.5;
          for (const n of tn) for (let i = 0; i < n.length; i++) { if (!n.data[i].trim()) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const y = g.getBoundingClientRect().top; ys.push(y); }
          const lines = [...new Set(ys.map((y) => Math.round(y / tol)))].sort((a, b) => a - b);
          const c = lines.map((l) => ys.filter((y) => Math.round(y / tol) === l).length);
          const merged = []; lines.forEach((l, i) => { if (i && l - lines[i - 1] <= 1) merged[merged.length - 1] += c[i]; else merged.push(c[i]); });
          if (merged.length > 1 && merged.some((n) => n <= 2)) out.orphan.push(`${idOf(e)}「${blk.textContent.slice(0, 12)}」${merged.join("/")}`);
        }
      }
      const bodyText = document.body.textContent;
      out.demo = /架空のお店のデザイン見本/.test(bodyText);
      out.keisai = /掲載店/.test(bodyText);
      const src = [...document.images].map((i) => i.getAttribute("src").split("?")[0]); out.dup = src.filter((s, i) => src.indexOf(s) !== i);
      out.placeholder = (document.body.innerText.match(/入ります|差し替え|ダミー|Lorem|TODO|仮の/g) || []).join(",");
      out.caveat = all.filter((e) => /caveat/i.test(getComputedStyle(e).fontFamily)).map(idOf);
      out.handTf = hand ? getComputedStyle(hand).transform : "";
      out.boxes = { scroll: document.documentElement.scrollHeight };
      return out;
    });
    if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
    if (r.clip.length) ng(`${w}: 文字のはみ出し ${[...new Set(r.clip)].join(",")}`);
    if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
    if (r.orphan.length) ng(`${w}: 1〜2 字だけの行 ${r.orphan.join(" ／ ")}`);
    if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
    if (r.contrast.length) ng(`${w}: コントラスト ${r.contrast.join(",")}`);
    if (r.links.length) ng(`${w}: リンク切れ ${r.links.join(",")}`);
    if (r.tel < 1) ng(`${w}: 電話のリンクが無い`);
    if (r.photos !== 14) ng(`${w}: 写真 ${r.photos} 枚`);
    if (r.map !== 1) ng(`${w}: 地図 ${r.map}`);
    if (!r.demo) ng(`${w}: 架空のお店の一文が無い`);
    if (r.keisai) ng(`${w}: 「掲載店」の文字がある`);
    if (r.dup.length) ng(`${w}: 写真の重複 ${r.dup.join(",")}`);
    if (r.placeholder) ng(`${w}: 仮の文 ${r.placeholder}`);
    if (errs.length) ng(`${w}: エラー ${errs.join(" / ")}`);
    if (r.caveat.length !== 1 || r.caveat[0] !== "ab_hand") ng(`${w}: 手書きの書体の位置 ${r.caveat.join(",")}`);
    if (!/matrix\(0\.99/.test(r.handTf)) ng(`${w}: 手書きの札の傾きが効いていない ${r.handTf}`);
    if (SPEC[w]) for (const [s, h] of Object.entries(SPEC[w])) if ((r.secs[s] ?? 0) - h < -1.5 || (r.secs[s] ?? 0) - h > (w === 390 ? 40 : 1.5)) ng(`${w}: ${s} 高さ ${r.secs[s]}（設計 ${h}）`);
    // ヘッダー：最初の画面を過ぎたら不透明の生成り、PC は リンク・店名・電話 が重ならない
    const hd = await page.evaluate(async () => {
      scrollTo(0, 2000); await new Promise((f) => setTimeout(f, 250));
      const h = document.querySelector(".site-header"), b = getComputedStyle(h).backgroundColor;
      const rc = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { l: b.left, r: b.right } : null; };
      const links = [...document.querySelectorAll(".el-nav .nav-row a")].filter((a) => a.getBoundingClientRect().width);
      const lastLink = links.length ? links[links.length - 1].getBoundingClientRect().right : 0;
      const nm = document.querySelector("[data-el=hd_name]"), nr = document.createRange(), tw = document.createTreeWalker(nm, NodeFilter.SHOW_TEXT); tw.nextNode(); nr.selectNodeContents(tw.currentNode); const nb = nr.getBoundingClientRect();
      const name = nb.width ? { l: nb.left, r: nb.right } : null, tel = rc("[data-el=hd_tel_b]"), ht = h.getBoundingClientRect().height;
      scrollTo(0, 0);
      return { b, lastLink, name, tel, ht };
    });
    if (hd.b !== "rgb(247, 241, 232)") ng(`${w}: スクロール後のヘッダーの地 ${hd.b}`);
    if (hd.lastLink && hd.name && hd.lastLink > hd.name.l - 4) ng(`${w}: ナビと店名が近い／重なる ${Math.round(hd.lastLink)}>${Math.round(hd.name.l)}`);
    if (hd.tel && hd.name && hd.name.r > hd.tel.l - 4) ng(`${w}: 店名と電話のボタンが重なる`);
    if (TABLET.includes(w)) {
      const c = await page.evaluate(() => {
        const box = (s) => document.querySelector(`[data-el="${s}"]`).getBoundingClientRect();
        const span = (...ids) => { const b = ids.map(box); return Math.max(...b.map((x) => x.right)) - Math.min(...b.map((x) => x.left)); };
        return { ab_p: box("ab_p").width, mn_p: box("mn_p").width, li: span("li_n1", "li_p1"), wi_p: box("wi_p").width, wi_row: span("wi_k0", "wi_v0"), lu_p: box("lu_p").width, di_p: box("di_p").width, info: span("in_k0", "in_v0"), ac_p: box("ac_p").width, map: box("ac_map").width, rs_band: box("rs_band").width, rs_p: box("rs_p").width };
      });
      for (const [k, v] of Object.entries(c)) if (v < w * 0.7) ng(`${w}: 本文の列 ${k} が ${Math.round(v)}px（画面幅の 70% 未満）`);
      console.log(`${w}: 列の幅 ${JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v)])))}`);
    }
    if (PHOTO_W.includes(w)) {
      // 写真の上の文字：文字を透明にして、その範囲の画素の明るい側（90 パーセンタイル）と文字色のコントラストを測る
      await page.addStyleTag({ content: ".el-text,.el-text *{color:transparent!important}" });
      const res = [];
      for (const t of r.onPhoto) {
        const buf = await page.screenshot({ fullPage: true, clip: { x: Math.max(0, t.x), y: t.y, width: Math.min(t.w, w - Math.max(0, t.x)), height: t.h } });
        const png = PNG.sync.read(buf), ls = [];
        for (let i = 0; i < png.data.length; i += 4) ls.push(lum(png.data[i], png.data[i + 1], png.data[i + 2]));
        ls.sort((a, b) => a - b);
        const bgL = ls[Math.floor(ls.length * 0.9)], fL = lum(t.fg.r, t.fg.g, t.fg.b), cr = (Math.max(bgL, fL) + 0.05) / (Math.min(bgL, fL) + 0.05), need = t.size >= 24 ? 3 : 4.5;
        res.push(`${t.id}:${cr.toFixed(1)}`);
        if (cr < need) ng(`${w}: 写真の上の文字 ${t.id} のコントラスト ${cr.toFixed(2)}（${t.size}px、必要 ${need}）`);
      }
      console.log(`${w}: 高さ ${JSON.stringify(r.secs)} 文字色のコントラスト最小 ${r.min} tel ${r.tel} 件・ページ内リンク ${r.anchors} 件・全長 ${r.boxes.scroll}`);
      console.log(`${w}: 写真の上 ${res.join(" ")}`);
    }
    console.log(`${w}: 済`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅 問題なし`);
process.exit(bad ? 1 : 0);
