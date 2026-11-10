#!/usr/bin/env node
// wa-24：dist/<店> の数値の検査（wa22-check を元に、点検する要素を wa-24 の名前にした）（撮影はしない）。横はみ出し・文字のはみ出しと重なり・セクションの高さ・読めない写真・
// コントラスト・リンク・カードの枚数・タブレットの列幅に加え、ボタン・電話番号・フッターの目次・縦の札・ヘッダーの店名が実際に <a>（電話は tel:）で、押した位置で最前面になっていること、
// 固定の縦の札の列が中身・ボタンに重ならないこと、縦書きが 1 字だけの列にならないこと、押せない飾りのボタン、地図の埋め込みの形、文節での折り返し、写真の WebP と表示幅を調べる。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const ID = process.argv[2] || "kairo";
const URL_ = pathToFileURL(path.resolve(`dist/${ID}/index.html`)).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 834, 1007, 1008, 1024, 1025, 1280, 1440, 1920];
const TABLET = [768, 834, 1024];
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const shop = JSON.parse(fs.readFileSync(`samples/${ID}/shop.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa24.json`, "utf8"));
const CARDS = Object.values(site.elements).filter((e) => e.type === "repeater").reduce((n, e) => n + e.source.pick.length, 0);
const NFT = Object.keys(site.elements).filter((k) => /^ft_n\d+$/.test(k)).length;
const TELROW = C.access.rows.findIndex(([, v]) => v === "tel");
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).map(([k, v]) => [k, v.minHeight[d]]));
const SPEC = { 1440: specOf("pc"), 390: specOf("sp") };
const GEO = `${shop.location.geo.lat},${shop.location.geo.lng}`;
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
    const r = await page.evaluate(({ NFT, TELROW, NAV, GEO, AGE }) => {
      const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], secs: {}, broken: [], contrast: [], min: 99, links: [], orphan: [], notA: [], vert: [], railGap: 999, railHit: [], wb: [], img: [] };
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
      const ifr = document.querySelectorAll("[data-el=ac_mapbox] iframe"); out.map = ifr.length;
      out.mapOk = ifr.length === 1 && ifr[0].src.includes(`q=${GEO}`) && /[?&]z=16(&|$)/.test(ifr[0].src) && /[?&]hl=ja(&|$)/.test(ifr[0].src) && /output=embed/.test(ifr[0].src);
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const bgOf = (e) => { const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; for (const n of document.elementsFromPoint(cx, cy)) { if (n === e || e.contains(n)) continue; const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 255, g: 255, b: 255 }; };
      // 飾りの巨大欧文（aria-hidden）は文字の情報ではないので除く
      for (const e of T) { if (e.closest("[aria-hidden=true]")) continue; e.scrollIntoView({ block: "center" }); const fg = parse(getComputedStyle(e).color), bg = bgOf(e), a = L(fg), b = L(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (cr < out.min) out.min = Math.round(cr * 100) / 100; if (cr < 4.5) out.contrast.push(`${idOf(e)}:${cr.toFixed(2)}`); }
      scrollTo(0, 0);
      for (const a of document.querySelectorAll("a[href]")) { const h = a.getAttribute("href"); if (h.startsWith("#") && h.length > 1) { if (!document.getElementById(decodeURIComponent(h.slice(1)))) out.links.push(h); } else if (h === "#" || h === "" || h.startsWith("javascript:")) out.links.push("飾り:" + h); else if (h.startsWith("tel:") && !/^tel:[+\d-]{10,}$/.test(h)) out.links.push(h); }
      out.tel = document.querySelectorAll('a[href^="tel:"]').length;
      const rail = document.querySelector(".k-rail"), railOn = rail && vis(rail), railR = railOn ? rail.getBoundingClientRect().right : 0;
      out.railOn = !!railOn;
      // 押せるはずの文字が本当に <a> か（style.link の回避の確認）と、押した位置で最前面か（縦の札の列に隠れないか）
      const must = { hd_name: (h) => h === "./", hd_tel_t: (h) => /^tel:0/.test(h), hd_tel_b: (h) => /^tel:0/.test(h), ac_tel_t: (h) => /^tel:0/.test(h), ac_tel_b: (h) => /^tel:0/.test(h), ac_map_t: (h) => /^https:\/\/www\.google\.com\/maps/.test(h), ft_tv: (h) => /^tel:0/.test(h), [`ac_v${TELROW}`]: (h) => /^tel:0/.test(h), mn_go: (h) => h === "#" + NAV[0] };
      for (let i = 0; i < NFT; i++) must[`ft_n${i}`] = (h) => h === "#" + NAV[i];
      if (!railOn) for (let i = 0; i < NAV.length; i++) must[`hd_t${i}`] = (h) => h === "#" + NAV[i];
      for (const [id, ok] of Object.entries(must)) { const e = document.querySelector(`[data-el="${id}"]`); if (!e || e.tagName !== "A" || !ok(e.getAttribute("href") || "")) { out.notA.push(`${id}(${e ? e.tagName + " " + (e.getAttribute("href") || "") : "無し"})`); continue; } e.scrollIntoView({ block: "center" }); const b = e.getBoundingClientRect(), top = document.elementFromPoint(b.left + Math.min(b.width / 2, 40), b.top + b.height / 2); if (!top || (top.closest("a") !== e && top.closest("a")?.getAttribute("href") !== e.getAttribute("href"))) out.notA.push(`${id}(押した位置に別の要素 ${top ? top.tagName + "." + (top.dataset.el || top.className || "") : "無し"})`); }
      if (railOn) {
        const ra = [...rail.querySelectorAll("a")];
        if (ra.length !== NAV.length || ra.some((a, i) => a.getAttribute("href") !== "#" + NAV[i])) out.notA.push("縦の札の行き先");
        for (const a of ra) { const b = a.getBoundingClientRect(), top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); if (!top || top.closest("a") !== a) out.railHit.push(a.textContent); }
        // 縦の札の列と中身の間（中身の左端まで）
        for (const e of document.querySelectorAll(".cbox>.el")) { if (!vis(e)) continue; const b = e.getBoundingClientRect(); if (b.width >= vw - 2) continue; out.railGap = Math.min(out.railGap, Math.round(b.left - railR)); }
      }
      scrollTo(0, 0);
      const lastLine = (e) => { const tn = [], W = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); while (W.nextNode()) tn.push(W.currentNode); const lines = {}; for (const n of tn) for (let i = 0; i < n.length; i++) { if (!n.data[i].trim()) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const y = Math.round(g.getBoundingClientRect().top); lines[y] = (lines[y] || 0) + 1; } return Object.keys(lines).map(Number).sort((a, b) => a - b).map((y) => lines[y]); };
      for (const e of document.querySelectorAll('[data-cel$="_nm"],[data-cel$="_ds"],[data-cel$="_ig"],[data-el=fv_p],[data-el=fv_info],[data-el=tn_p],[data-el=tn_note],[data-el=ct_p],[data-el=ct_cap],[data-el=mn_note],[data-el^=ac_v],[data-el=ft_line],[data-el=ft_age],[data-el=ct_h],[data-el=tn_h]')) { if (!vis(e) || getComputedStyle(e).writingMode.startsWith("vertical")) continue; const c = lastLine(e); if (c.length > 1 && c[c.length - 1] <= 2) out.orphan.push(e.textContent.slice(0, 12) + ":" + c.join("/")); }
      // 縦書きが折り返して 1 字だけの列にならないか（列の数＝段落の数）
      const vEls = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => getComputedStyle(e).writingMode.startsWith("vertical"));
      if (railOn) vEls.push(...rail.querySelectorAll("a"));
      for (const e of vEls) { const tn = [], W = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); while (W.nextNode()) tn.push(W.currentNode); const cols = {}; for (const n of tn) for (let i = 0; i < n.length; i++) { if (!n.data[i].trim()) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); const x = Math.round(g.getBoundingClientRect().left / 4); cols[x] = (cols[x] || 0) + 1; } const n = Object.values(cols), paras = Math.max(1, e.querySelectorAll(".pg").length); if (n.length > paras || n.some((k) => k === 1)) out.vert.push(`${idOf(e) || e.textContent}:${n.join("/")}`); }
      // 文節での折り返し（見出し・本文）
      for (const id of ["tn_h", "tn_p", "ct_p", "fv_p", "tn_note", "mn_note", "ft_line"]) { const e = document.querySelector(`[data-el=${id}]`); if (e && getComputedStyle(e).wordBreak !== "auto-phrase") out.wb.push(id); }
      for (const e of document.querySelectorAll('[data-cel$="_ds"],[data-cel$="_nm"]')) if (getComputedStyle(e).wordBreak !== "auto-phrase") { out.wb.push(idOf(e)); break; }
      // ボタン同士・縦の札とボタン・スマホの横の札とボタンの重なり
      const boxes = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => [idOf(e) || "rail", e.getBoundingClientRect()]);
      const hit = (x, y) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;
      const btns = boxes("[data-el$=_b]"), navs = [...boxes("[data-el^=hd_t]:not([data-el^=hd_tel])"), ...(railOn ? [["rail", rail.getBoundingClientRect()]] : [])];
      out.navBtn = []; for (const [a, x] of navs) for (const [b, y] of btns) if (hit(x, y)) out.navBtn.push(a + "×" + b);
      // 押せない飾りのボタン：押し札の形（高さ 32〜64・横長・枠か塗り）なのに <a> でない物
      const secBg = (e) => getComputedStyle(e.closest("[data-sec]")).backgroundColor;
      out.fakeBtn = [...document.querySelectorAll(".el-shape")].filter(vis).filter((e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); const framed = parseFloat(s.borderTopWidth) > 0 || /inset/.test(s.boxShadow) || (s.backgroundColor !== secBg(e) && parse(s.backgroundColor).a > 0); return b.height >= 32 && b.height <= 64 && b.width > b.height * 1.6 && framed && !e.closest("a") && e.tagName !== "A"; }).map(idOf);
      // 写真・カード同士の重なりと、段の下端からのはみ出し（セクションの overflow:hidden で切れる物）
      out.block = []; out.cut = [];
      for (const s of document.querySelectorAll("[data-sec]")) {
        const sb = s.getBoundingClientRect(), bl = [...s.querySelectorAll(".cbox>.el-photo,.cbox>.el-rep")].filter(vis).map((e) => [idOf(e), e.getBoundingClientRect()]);
        for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) { const a = bl[i][1], b = bl[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.block.push(bl[i][0] + "×" + bl[j][0]); }
        for (const e of s.querySelectorAll(".cbox>.el")) { if (!vis(e)) continue; const b = e.getBoundingClientRect(); if (b.bottom > sb.bottom + 1) out.cut.push(idOf(e)); }
      }
      out.demo = /架空のお店のデザイン見本/.test(document.body.textContent);
      out.age = document.querySelector("[data-sec=sec_footer]")?.textContent.includes(AGE);
      out.keisai = /掲載店/.test(document.body.textContent);
      const src = [...document.images].map((i) => i.getAttribute("src").split("?")[0]); out.dup = src.filter((s, i) => src.indexOf(s) !== i);
      for (const i of document.images) { const b = i.getBoundingClientRect(); if (!/\.webp$/.test(i.getAttribute("src").split("?")[0])) out.img.push("WebP でない " + i.getAttribute("src")); if (b.width > 0 && i.naturalWidth < b.width * 0.98) out.img.push(`粗い ${i.getAttribute("src").split("/").pop()} ${i.naturalWidth}<${Math.round(b.width)}`); if (vw >= 1440 && b.width > 0 && i.naturalWidth > b.width * 2.4) out.img.push(`大きすぎ ${i.getAttribute("src").split("/").pop()} ${i.naturalWidth}>${Math.round(b.width)}×2.4`); }
      out.placeholder = (document.body.innerText.match(/入ります|差し替え|ダミー|Lorem|TODO/g) || []).join(",");
      return out;
    }, { NFT, TELROW, NAV: C.nav.map((n) => n[2]), GEO, AGE: C.footer.age });
    if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
    if (r.clip.length) ng(`${w}: 文字のはみ出し ${[...new Set(r.clip)].join(",")}`);
    if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
    if (r.orphan.length) ng(`${w}: 最後の行が 1〜2 字 ${r.orphan.join(",")}`);
    if (r.vert.length) ng(`${w}: 縦書きの列が崩れる ${r.vert.join(",")}`);
    if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
    if (r.img.length) ng(`${w}: 写真 ${r.img.join(",")}`);
    if (r.contrast.length) ng(`${w}: コントラスト ${r.contrast.join(",")}`);
    if (r.links.length) ng(`${w}: リンク切れ ${r.links.join(",")}`);
    if (r.notA.length) ng(`${w}: <a> になっていない ${r.notA.join(",")}`);
    if (r.railHit.length) ng(`${w}: 縦の札が押せない ${r.railHit.join(",")}`);
    if ((w >= 768) !== r.railOn) ng(`${w}: 縦の札の列が ${r.railOn ? "出ている" : "出ていない"}`);
    if (r.railOn && r.railGap < (w >= 1025 ? 20 : 32)) ng(`${w}: 縦の札の列と中身の間が ${r.railGap}px`);
    if (r.wb.length) ng(`${w}: 文節で折り返さない ${r.wb.join(",")}`);
    if (r.cards !== CARDS) ng(`${w}: カード ${r.cards} 枚（品は ${CARDS}）`);
    if (r.map !== 1 || !r.mapOk) ng(`${w}: 地図 ${r.map} 件・形 ${r.mapOk ? "良" : "違う（緯度経度＋z=16＋hl=ja＋embed）"}`);
    if (r.navBtn.length) ng(`${w}: ナビとボタンが重なる ${r.navBtn.join(",")}`);
    if (r.fakeBtn.length) ng(`${w}: 押せない飾りのボタン ${r.fakeBtn.join(",")}`);
    if (r.block.length) ng(`${w}: 写真・カードの重なり ${r.block.join(",")}`);
    if (r.cut.length) ng(`${w}: 段の下端からはみ出す ${r.cut.join(",")}`);
    if (!r.demo) ng(`${w}: 架空のお店の一文が無い`);
    if (!r.age) ng(`${w}: フッターに飲酒の断りが無い`);
    if (r.keisai) ng(`${w}: 「掲載店」が出ている`);
    if (r.dup.length) ng(`${w}: 写真の重複 ${r.dup.join(",")}`);
    if (r.placeholder) ng(`${w}: 仮の文 ${r.placeholder}`);
    if (errs.length) ng(`${w}: エラー ${errs.join(" / ")}`);
    if (SPEC[w]) for (const [s, h] of Object.entries(SPEC[w])) if (Math.abs((r.secs[s] ?? 0) - h) > 10) ng(`${w}: ${s} 高さ ${r.secs[s]}（設計 ${h}）`);
    if (TABLET.includes(w)) {
      const c = await page.evaluate(() => {
        const box = (s) => document.querySelector(`[data-el="${s}"],[data-cel="${s}"]`).getBoundingClientRect();
        const span = (...ids) => { const b = ids.map(box); return Math.max(...b.map((x) => x.right)) - Math.min(...b.map((x) => x.left)); };
        return { fv: span("fv_copy", "fv_ph"), tonight: span("tn_c0", "tn_c1"), counter: span("ct_h", "ct_ph"), menu: span("mn_c0", "mn_c2"), rows: span("mn_r0"), access: span("ac_l0", "ac_mapbox"), footer: span("ft_name", "ft_n0") };
      });
      for (const [k, v] of Object.entries(c)) if (v < w * 0.7) ng(`${w}: 列 ${k} が ${Math.round(v)}px（画面幅の 70% 未満）`);
      console.log(`${w}: 列の幅 ${JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v)])))}`);
    }
    if (w === 1440 || w === 768 || w === 390) console.log(`${w}: 高さ ${JSON.stringify(r.secs)} コントラスト最小 ${r.min} tel ${r.tel} 件 縦の札との間 ${r.railOn ? r.railGap : "—"}`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅 問題なし`);
process.exit(bad ? 1 : 0);
