#!/usr/bin/env node
// wa-19：dist/<店> の数値の検査。コースの流れの皿の名が 1 行に収まるか・PC で列が横に並ぶかも見る。幅 320〜1920 の横はみ出し・文字のはみ出しと重なり（縦書きは縦のはみ出し）・文字と写真・地図の重なり・1〜2 字だけの行・
// 本文の列の幅（タブレット 768・834・1024 で画面幅の 70% 以上）・コントラスト・読めない写真・リンク（tel・ページ内・入れ子の <a>）・押せるか・
// 押せない飾りの面・架空の一文・「掲載店」・写真の重複・仮の文・地図の形（緯度経度＋z=16＋hl=ja）・文節の折り返し（auto-phrase）を調べる。問題があれば終了コード 1。
// 使い方：node tools/wa19-check.mjs <店のID>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa19-check.mjs lueur）");
const URL_ = pathToFileURL(path.resolve(`dist/${ID}/index.html`)).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 834, 1024, 1025, 1280, 1440, 1920]; // 1024／1025 が配置の切り替わり
const TABLET = [768, 834, 1024];
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa19-content.json`, "utf8"));
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).filter(([k]) => k !== "sec_header").map(([k, v]) => [k, v.minHeight[d]]));
const SPEC = { 1440: specOf("pc"), 390: specOf("sp") };
const PHOTOS = Object.keys(C.photos).length, TEL = `tel:${C.phone.digits}`, TELROW = C.info.rows.findIndex(([, v]) => v === "$phone");
const HEADER_BG = "rgb(250, 248, 244)";
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
      const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], onImg: [], secs: {}, broken: [], contrast: [], min: 99, links: [], orphan: [], dup: [] };
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
      const idOf = (e) => e.dataset.el || e.dataset.cel;
      const tall = (e) => getComputedStyle(e).writingMode.startsWith("vertical");
      const all = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => !e.closest(".nav-menu"));
      const rect = (e) => { const R = document.createRange(); R.selectNodeContents(e); return R.getBoundingClientRect(); };
      for (const e of all) {
        const b = rect(e), id = idOf(e), cs = getComputedStyle(e);
        if (b.right > vw + 0.5 || b.left < -0.5) out.clip.push(id);
        if (tall(e)) { if (e.scrollHeight > e.clientHeight + 3 || e.scrollWidth > e.clientWidth + 3) out.clip.push(id + "(縦の中身)"); continue; }
        const lh = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
        if (e.scrollWidth > e.clientWidth + 3 || (lh >= 1.25 && e.scrollHeight > e.clientHeight + Math.max(6, parseFloat(cs.fontSize) * 0.1))) out.clip.push(id + "(中身)");
      }
      const R = all.map((e) => { const cs = getComputedStyle(e), b = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) < 1.25 ? e.getBoundingClientRect() : rect(e); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (hit(R[i][1], R[j][1])) out.over.push(R[i][0] + "×" + R[j][0]);
      // 文字と写真・地図の重なり（藍の札の文字は札の上。写真の縁に重ねるのは設計どおり）
      const boxes = [...document.querySelectorAll(".el-photo,[data-el=in_map]")].filter(vis).map((e) => { const b = e.getBoundingClientRect(); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      for (const [id, a] of R) if (!/^hd_/.test(id)) for (const [pid, b] of boxes) if (hit(a, b)) out.onImg.push(id + "×" + pid);
      for (const s of document.querySelectorAll("[data-sec]")) if (s.matches("section,div,footer") && s.dataset.sec !== "sec_header" && !out.secs[s.dataset.sec]) out.secs[s.dataset.sec] = Math.round(s.getBoundingClientRect().height * 10) / 10;
      for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
      out.photos = document.images.length;
      const ifr = document.querySelectorAll("[data-el=in_map] iframe"); out.map = ifr.length; out.mapSrc = ifr[0] ? ifr[0].getAttribute("src") : "";
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const bgOf = (e) => { const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; for (const n of document.elementsFromPoint(cx, cy)) { if (n === e || e.contains(n)) continue; if (n.tagName === "IMG" || n.tagName === "PICTURE" || n.classList.contains("el-photo")) return "photo"; if (n.getBoundingClientRect().height < 4) continue; const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 255, g: 255, b: 255 }; };
      for (const e of all) {
        e.scrollIntoView({ block: "center" });
        const cs = getComputedStyle(e), size = parseFloat(cs.fontSize), fg = parse(cs.color), bg = bgOf(e), id = idOf(e);
        if (bg === "photo") { out.contrast.push(`${id}:写真の上`); continue; }
        const a = L(fg), b = L(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (cr < out.min) out.min = Math.round(cr * 100) / 100;
        if (cr < 4.5) out.contrast.push(`${id}:${cr.toFixed(2)}(${size}px)`);
      }
      scrollTo(0, 0);
      for (const a of document.querySelectorAll("a[href]")) { const h = a.getAttribute("href"); if (h.startsWith("#") && h.length > 1) { if (!document.getElementById(decodeURIComponent(h.slice(1)))) out.links.push(h); } else if (h === "#" || h === "" || h.startsWith("javascript:")) out.links.push("飾り:" + h); else if (h.startsWith("tel:") && h !== TEL) out.links.push(h); }
      out.tel = document.querySelectorAll('a[href^="tel:"]').length;
      out.anchors = document.querySelectorAll('a[href^="#"]').length;
      out.nested = document.querySelectorAll("a a").length;
      // 押せるか：電話のボタンの文字の中央・表の電話番号・ご予約の段の番号・フッターの電話・店名・PC の「ご予約」で、一番上の要素がリンクの中か
      const press = {};
      for (const id of ["rs_btn_t", "rs_t", `in_v${TELROW}`, "ft_t", "hd_name", "hd_btn_t"]) { const e = document.querySelector(`[data-el="${id}"]`); if (!e || !vis(e)) { if (id !== "hd_btn_t" || vw >= 1025) press[id] = false; continue; } e.scrollIntoView({ block: "center" }); const b = rect(e), n = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); press[id] = !!(n && n.closest("a[href]")); }
      scrollTo(0, 0);
      out.press = press;
      // 飾り（品書きの面・短い線・縦の線・ローマ数字・添え書き）はリンクにしない・押せる見た目にしない
      out.deco = ["mn_bg", "fv_ln", "fv_cap", "cs_v0", "cs_s0", "cs_n0", "cs_top", "ft_sub"].map((id) => document.querySelector(`[data-el="${id}"]`)).filter(Boolean).filter((e) => e.closest("a[href]") || getComputedStyle(e).cursor === "pointer").map((e) => e.dataset.el);
      // 1〜2 字だけの行（横書きの段落ごと。縦書きは 1 段落 1 列の折り返さない箱なので除く）
      for (const e of all) {
        if (tall(e)) continue;
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
      out.wb = [...new Set(all.map((e) => getComputedStyle(e).wordBreak))].join(",");
      const bodyText = document.body.textContent;
      out.demo = /架空のお店のデザイン見本/.test(bodyText);
      out.keisai = /掲載店/.test(bodyText);
      const src = [...document.images].map((i) => i.getAttribute("src").split("?")[0]); out.dup = src.filter((s, i) => src.indexOf(s) !== i);
      out.placeholder = (document.body.innerText.match(/入ります|差し替え|ダミー|Lorem|TODO|仮の/g) || []).join(",");
      out.scroll = document.documentElement.scrollHeight;
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
    if (r.nested) ng(`${w}: 入れ子の <a> ${r.nested} 件`);
    if (r.tel < 4) ng(`${w}: 電話のリンクが ${r.tel} 件（表・ご予約の段の番号・ボタン・フッターの 4 件のはず）`);
    for (const [k, v] of Object.entries(r.press)) if (!v) ng(`${w}: ${k} が押せない`);
    if (r.deco.length) ng(`${w}: 飾りの面が押せる見た目 ${r.deco.join(",")}`);
    if (r.photos !== PHOTOS) ng(`${w}: 写真 ${r.photos} 枚（${PHOTOS} 枚のはず）`);
    if (r.map !== 1) ng(`${w}: 地図 ${r.map}`);
    if (!/q=-?[\d.]+,-?[\d.]+&z=16&hl=ja&output=embed/.test(r.mapSrc)) ng(`${w}: 地図の形 ${r.mapSrc}`);
    if (!/auto-phrase/.test(r.wb)) ng(`${w}: word-break ${r.wb}`);
    if (!r.demo) ng(`${w}: 架空のお店の一文が無い`);
    if (r.keisai) ng(`${w}: 「掲載店」の文字がある`);
    if (r.dup.length) ng(`${w}: 写真の重複 ${r.dup.join(",")}`);
    if (r.placeholder) ng(`${w}: 仮の文 ${r.placeholder}`);
    if (errs.length) ng(`${w}: エラー ${errs.join(" / ")}`);
    if (SPEC[w]) for (const [s, h] of Object.entries(SPEC[w])) if ((r.secs[s] ?? 0) - h < -1.5 || (r.secs[s] ?? 0) - h > (w === 390 ? 40 : 1.5)) ng(`${w}: ${s} 高さ ${r.secs[s]}（設計 ${h}）`);
    // ヘッダー：地は常に白木の不透明。PC は店名・リンク・ご予約のボタンが重ならない。タブレット以下はメニューのボタンが 44 以上で店名と重ならず、開くと藍のボタンが画面に入る
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
      if (sb) { const d = sum.closest("details"); d.open = true; const a = d.querySelector(".wa19-res"), x = a && a.getBoundingClientRect(); res = x ? { w: x.width, b: x.bottom, r: x.right } : null; d.open = false; }
      scrollTo(0, 0);
      return { top, b, nameR: nb.right, firstL, lastR, btnL: btnB ? btnB.left : 0, btnR: btnB ? btnB.right : 0, menu: sb ? { l: sb.left, r: sb.right, h: sb.height } : null, res, vh: innerHeight };
    });
    if (hd.b !== HEADER_BG) ng(`${w}: スクロール後のヘッダーの地 ${hd.b}`);
    if (hd.top !== HEADER_BG) ng(`${w}: 最初の画面のヘッダーの地 ${hd.top}`);
    if (hd.firstL && hd.nameR > hd.firstL - 24) ng(`${w}: 店名とナビが近い／重なる`);
    if (hd.lastR && hd.btnL && hd.lastR > hd.btnL - 24) ng(`${w}: ナビとご予約のボタンが近い／重なる`);
    if (hd.lastR && hd.lastR > w) ng(`${w}: ナビが画面の外`);
    if (hd.btnR > w) ng(`${w}: ご予約のボタンが画面の外`);
    if (w < 1025) { if (!hd.menu) ng(`${w}: メニューのボタンが無い`); else { if (hd.menu.h < 44) ng(`${w}: メニューのボタンの高さ ${hd.menu.h}`); if (hd.menu.r > w) ng(`${w}: メニューのボタンが画面の外`); if (hd.nameR > hd.menu.l - 8) ng(`${w}: 店名とメニューが重なる`); if (!hd.res || hd.res.w < 100 || hd.res.b > hd.vh || hd.res.r > w) ng(`${w}: 全面のメニューの予約のボタン ${JSON.stringify(hd.res)}`); } }
    else if (hd.menu) ng(`${w}: PC にメニューのボタンが出ている`);
    if (TABLET.includes(w)) {
      const c = await page.evaluate(({ TELROW }) => {
        const box = (s) => document.querySelector(`[data-el="${s}"]`).getBoundingClientRect();
        const span = (...ids) => { const b = ids.map(box); return Math.max(...b.map((x) => x.right)) - Math.min(...b.map((x) => x.left)); };
        return { fv_cp: box("fv_cp").width, fv_ph: box("fv_ph").width, ab_p1: box("ab_p1").width, ab_ph1: box("ab_ph1").width, ab_p3: box("ab_p3").width, ab_ph3_2: span("ab_ph3", "ab_ph2"),
          cs_p: box("cs_p").width, cs_row: span("cs_n0", "cs_t0"), cs_line: box("cs_s0").width, pl_photos: span("pl_ph0", "pl_ph1"),
          mn_table: span("mt_0_0", "mp_0_0"), mn_pair: span("mpt_1", "mpp_1"), in_table: span("in_k0", `in_v${TELROW}`), map: box("in_map").width, rs_p: box("rs_p").width, rs_btn: box("rs_btn").width, footer: box("ft_a").width };
      }, { TELROW });
      for (const [k, v] of Object.entries(c)) if (v < w * 0.7) ng(`${w}: 本文の列 ${k} が ${Math.round(v)}px（画面幅の 70% 未満）`);
      console.log(`${w}: 列の幅 ${JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v)])))}`);
    }
    // コースの流れ：皿の名が 1 行に収まる（列の幅の中）。PC は全部の列が同じ行に並ぶ
    const cs = await page.evaluate(() => { const d = [...document.querySelectorAll("[data-el^=cs_d]")]; return d.map((e) => { const R = document.createRange(); R.selectNodeContents(e.querySelector(".pg > span") || e); const b = R.getBoundingClientRect(), x = e.getBoundingClientRect(); return { id: e.dataset.el, w: Math.round(b.width), box: Math.round(x.width), lines: Math.round(b.height / parseFloat(getComputedStyle(e).lineHeight)), top: Math.round(x.top + scrollY) }; }); });
    for (const d of cs) { if (d.w > d.box + 1) ng(`${w}: 皿の名 ${d.id} が列からはみ出す ${d.w}>${d.box}`); if (d.lines > 1) ng(`${w}: 皿の名 ${d.id} が ${d.lines} 行`); }
    if (w >= 1025 && new Set(cs.map((d) => d.top)).size !== 1) ng(`${w}: コースの列が同じ行に並ばない`);
    if (w === 1440) console.log(`1440: 皿の名の幅 ${cs.map((d) => d.id + "=" + d.w + "/" + d.box).join(" ")}`);
    if ([390, 768, 1440].includes(w)) console.log(`${w}: 高さ ${JSON.stringify(r.secs)} コントラスト最小 ${r.min} tel ${r.tel} 件・ページ内リンク ${r.anchors} 件・入れ子の a ${r.nested}・全長 ${r.scroll}`);
    console.log(`${w}: 済`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅 問題なし`);
process.exit(bad ? 1 : 0);
