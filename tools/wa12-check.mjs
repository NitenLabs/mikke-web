#!/usr/bin/env node
// wa-12：dist/<店> の数値の検査。幅 320〜1920 の横はみ出し・文字のはみ出しと重なり・文字と写真の重なり・1〜2 字だけの行・本文の列の幅（タブレット）・
// コントラスト（写真の上は実際の画素で測る）・読めない写真・リンク・tel・架空の一文・「掲載店」・写真の重複・仮の文を調べる。問題があれば終了コード 1。
// 使い方：node tools/wa12-check.mjs <店のID>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa12-check.mjs kurozumi）");
const URL_ = pathToFileURL(path.resolve(`dist/${ID}/index.html`)).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 834, 1024, 1025, 1280, 1440, 1920]; // 1024／1025 が配置の切り替わり
const TABLET = [768, 834, 1024];
const PHOTO_W = [390, 768, 1440]; // 写真の上の文字を画素で測る幅
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa12-content.json`, "utf8"));
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).filter(([k]) => k !== "sec_header").map(([k, v]) => [k, v.minHeight[d]]));
const SPEC = { 1440: specOf("pc"), 390: specOf("sp") };
const PHOTOS = Object.keys(C.photos).length, TEL = `tel:${C.phone.digits}`, TELROW = C.info.rows.findIndex(([, v]) => v === "$phone");
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
    const r = await page.evaluate(({ TEL, TELROW }) => {
      const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], onImg: [], secs: {}, broken: [], contrast: [], min: 99, links: [], orphan: [], dup: [], onPhoto: [] };
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
      const idOf = (e) => e.dataset.el || e.dataset.cel;
      const all = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => !e.closest(".nav-menu"));
      const rect = (e) => { const R = document.createRange(); R.selectNodeContents(e); return R.getBoundingClientRect(); };
      for (const e of all) { const b = rect(e), id = idOf(e); if (b.right > vw + 0.5 || b.left < -0.5) out.clip.push(id); const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize); if (e.scrollWidth > e.clientWidth + 3 || (lh >= 1.25 && e.scrollHeight > e.clientHeight + 6)) out.clip.push(id + "(中身)"); }
      const R = all.map((e) => { const cs = getComputedStyle(e), b = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) < 1.25 ? e.getBoundingClientRect() : rect(e); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (hit(R[i][1], R[j][1])) out.over.push(R[i][0] + "×" + R[j][0]);
      // 文字と写真・地図の重なり（お席の全面写真の上の文字だけは写真の上に置く）
      const onPhotoOk = /^se_(lb|h|p)$/;
      const boxes = [...document.querySelectorAll(".el-photo,[data-el=in_map]")].filter(vis).map((e) => { const b = e.getBoundingClientRect(); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      for (const [id, a] of R) if (!onPhotoOk.test(id) && !/^hd_/.test(id)) for (const [pid, b] of boxes) if (hit(a, b)) out.onImg.push(id + "×" + pid);
      for (const s of document.querySelectorAll("[data-sec]")) if (s.matches("section,div,footer") && s.dataset.sec !== "sec_header" && !out.secs[s.dataset.sec]) out.secs[s.dataset.sec] = Math.round(s.getBoundingClientRect().height * 10) / 10;
      for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
      out.photos = document.images.length;
      out.map = document.querySelectorAll("[data-el=in_map] iframe").length;
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const bgOf = (e) => { const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; for (const n of document.elementsFromPoint(cx, cy)) { if (n === e || e.contains(n)) continue; if (n.tagName === "IMG" || n.tagName === "PICTURE" || n.classList.contains("el-photo")) return "photo"; if (n.classList.contains("darken") || n.getBoundingClientRect().height < 4) continue; const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 20, g: 20, b: 20 }; };
      for (const e of all) {
        e.scrollIntoView({ block: "center" });
        const cs = getComputedStyle(e), size = parseFloat(cs.fontSize), fg = parse(cs.color), bg = bgOf(e), id = idOf(e);
        if (bg === "photo") { const b = rect(e); out.onPhoto.push({ id, size, x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height, fg }); continue; }
        const a = L(fg), b = L(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (cr < out.min) out.min = Math.round(cr * 100) / 100;
        if (cr < 4.5) out.contrast.push(`${id}:${cr.toFixed(2)}(${size}px)`);
      }
      scrollTo(0, 0);
      for (const a of document.querySelectorAll("a[href]")) { const h = a.getAttribute("href"); if (h.startsWith("#") && h.length > 1) { if (!document.getElementById(decodeURIComponent(h.slice(1)))) out.links.push(h); } else if (h === "#" || h === "" || h.startsWith("javascript:")) out.links.push("飾り:" + h); else if (h.startsWith("tel:") && h !== TEL) out.links.push(h); }
      out.tel = document.querySelectorAll('a[href^="tel:"]').length;
      out.anchors = document.querySelectorAll('a[href^="#"]').length;
      // 押せるか：電話のボタンの文字の中央・表の電話番号・赤の段の番号・フッターの電話・店名・PC の「ご予約」で、一番上の要素がリンクの中か
      const press = {};
      for (const id of ["rs_btn_t", "rs_t", `in_v${TELROW}`, "ft_t", "hd_name", "hd_btn_t"]) { const e = document.querySelector(`[data-el="${id}"]`); if (!e || !vis(e)) { if (id !== "hd_btn_t" || vw >= 1025) press[id] = false; continue; } e.scrollIntoView({ block: "center" }); const b = rect(e), n = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); press[id] = !!(n && n.closest("a[href]")); }
      scrollTo(0, 0);
      out.press = press;
      // 1〜2 字だけの行（段落ごと。行は文字の上端で束ねる）
      for (const e of all) {
        const blocks = e.querySelectorAll(".pg").length ? [...e.querySelectorAll(".pg")] : [e];
        for (const blk of blocks) {
          const tn = [], W = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT); while (W.nextNode()) tn.push(W.currentNode);
          const ys = [], tol = parseFloat(getComputedStyle(e).fontSize) * 0.5;
          for (const n of tn) for (let i = 0; i < n.length; i++) { if (!n.data[i].trim()) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); ys.push(g.getBoundingClientRect().top); }
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
      out.boxes = { scroll: document.documentElement.scrollHeight };
      return out;
    }, { TEL, TELROW });
    if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
    if (r.clip.length) ng(`${w}: 文字のはみ出し ${[...new Set(r.clip)].join(",")}`);
    if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
    if (r.onImg.length) ng(`${w}: 文字と写真・地図の重なり ${r.onImg.join(",")}`);
    if (r.orphan.length) ng(`${w}: 1〜2 字だけの行 ${r.orphan.join(" ／ ")}`);
    if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
    if (r.contrast.length) ng(`${w}: コントラスト ${r.contrast.join(",")}`);
    if (r.links.length) ng(`${w}: リンク ${r.links.join(",")}`);
    if (r.tel < 4) ng(`${w}: 電話のリンクが ${r.tel} 件（表・赤の段の番号・ボタン・フッターの 4 件のはず）`);
    for (const [k, v] of Object.entries(r.press)) if (!v) ng(`${w}: ${k} が押せない`);
    if (r.photos !== PHOTOS) ng(`${w}: 写真 ${r.photos} 枚（${PHOTOS} 枚のはず）`);
    if (r.map !== 1) ng(`${w}: 地図 ${r.map}`);
    if (!r.demo) ng(`${w}: 架空のお店の一文が無い`);
    if (r.keisai) ng(`${w}: 「掲載店」の文字がある`);
    if (r.dup.length) ng(`${w}: 写真の重複 ${r.dup.join(",")}`);
    if (r.placeholder) ng(`${w}: 仮の文 ${r.placeholder}`);
    if (errs.length) ng(`${w}: エラー ${errs.join(" / ")}`);
    if (SPEC[w]) for (const [s, h] of Object.entries(SPEC[w])) if ((r.secs[s] ?? 0) - h < -1.5 || (r.secs[s] ?? 0) - h > (w === 390 ? 40 : 1.5)) ng(`${w}: ${s} 高さ ${r.secs[s]}（設計 ${h}）`);
    // ヘッダー：地は常に炭の不透明。PC は店名・リンク・ご予約のボタンが重ならない。タブレット以下は Menu のボタンが 44 以上で店名と重ならず、開くと赤のボタンが画面に入る
    const hd = await page.evaluate(async () => {
      const h = document.querySelector(".site-header");
      const top = getComputedStyle(h).backgroundColor;
      scrollTo(0, document.documentElement.scrollHeight / 2); await new Promise((f) => setTimeout(f, 250));
      const b = getComputedStyle(h).backgroundColor;
      const nm = document.querySelector("[data-el=hd_name]"), nr = document.createRange(); nr.selectNodeContents(nm); const nb = nr.getBoundingClientRect();
      const links = [...document.querySelectorAll(".el-nav .nav-row a")].filter((a) => a.getBoundingClientRect().width);
      const sum = document.querySelector(".nav-sp summary"), sb = sum && sum.getBoundingClientRect().width ? sum.getBoundingClientRect() : null;
      const firstL = links.length ? links[0].getBoundingClientRect().left : 0, lastR = links.length ? links[links.length - 1].getBoundingClientRect().right : 0;
      const btn = document.querySelector("[data-el=hd_btn]"), btnB = btn && btn.getBoundingClientRect().width ? btn.getBoundingClientRect() : null;
      let res = null;
      if (sb) { const d = sum.closest("details"); d.open = true; const a = d.querySelector(".wa12-res"), x = a && a.getBoundingClientRect(); res = x ? { w: x.width, b: x.bottom, r: x.right } : null; d.open = false; }
      scrollTo(0, 0);
      return { top, b, nameR: nb.right, firstL, lastR, btnL: btnB ? btnB.left : 0, btnR: btnB ? btnB.right : 0, menu: sb ? { l: sb.left, r: sb.right, h: sb.height } : null, res, vh: innerHeight };
    });
    if (hd.b !== "rgb(20, 20, 20)") ng(`${w}: スクロール後のヘッダーの地 ${hd.b}`);
    if (hd.top !== "rgb(20, 20, 20)") ng(`${w}: 最初の画面のヘッダーの地 ${hd.top}`);
    if (hd.firstL && hd.nameR > hd.firstL - 24) ng(`${w}: 店名とナビが近い／重なる`);
    if (hd.lastR && hd.btnL && hd.lastR > hd.btnL - 24) ng(`${w}: ナビとご予約のボタンが近い／重なる`);
    if (hd.lastR && hd.lastR > w) ng(`${w}: ナビが画面の外`);
    if (hd.btnR > w) ng(`${w}: ご予約のボタンが画面の外`);
    if (w < 1025) { if (!hd.menu) ng(`${w}: Menu のボタンが無い`); else { if (hd.menu.h < 44) ng(`${w}: Menu のボタンの高さ ${hd.menu.h}`); if (hd.menu.r > w) ng(`${w}: Menu のボタンが画面の外`); if (hd.nameR > hd.menu.l - 8) ng(`${w}: 店名と Menu が重なる`); if (!hd.res || hd.res.w < 100 || hd.res.b > hd.vh || hd.res.r > w) ng(`${w}: 全面のメニューの予約のボタン ${JSON.stringify(hd.res)}`); } }
    else if (hd.menu) ng(`${w}: PC に Menu のボタンが出ている`);
    if (TABLET.includes(w)) {
      const c = await page.evaluate(({ TELROW }) => {
        const box = (s) => document.querySelector(`[data-el="${s}"]`).getBoundingClientRect();
        const span = (...ids) => { const b = ids.map(box); return Math.max(...b.map((x) => x.right)) - Math.min(...b.map((x) => x.left)); };
        return { fv_ph: box("fv_ph").width, fv_cp: box("fv_cp").width, ab_h: box("ab_h").width, ab_p: box("ab_p").width, sa_ph: box("sa_ph").width, sa_p: box("sa_p").width, sb_ph: box("sb_ph").width, sb_p: box("sb_p").width, mn_table: span("mt_0_0", "mp_0_0"), mn_photos: span("mn_ph1", "mn_ph3"), se_h: box("se_h").width, in_table: span("in_k0", `in_v${TELROW}`), map: box("in_map").width, rs_h: box("rs_h").width, rs_btn: box("rs_btn").width, footer: span("ft_a1", "ft_h") };
      }, { TELROW });
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
        const bgL = ls[Math.floor(ls.length * 0.9)], fL = lum(t.fg.r, t.fg.g, t.fg.b), cr = (Math.max(bgL, fL) + 0.05) / (Math.min(bgL, fL) + 0.05);
        res.push(`${t.id}:${cr.toFixed(1)}`);
        if (cr < 4.5) ng(`${w}: 写真の上の文字 ${t.id} のコントラスト ${cr.toFixed(2)}（${t.size}px）`);
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
