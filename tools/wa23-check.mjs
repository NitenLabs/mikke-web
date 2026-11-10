#!/usr/bin/env node
// wa-23：dist/<店> の数値の検査。幅 320〜1920 の横はみ出し・文字のはみ出しと重なり・文字と写真・地図の重なり・1〜2 字だけの行・
// 本文の列の幅（タブレット 768・834・1024 で画面幅の 70% 以上）・コントラスト（札・面の上の文字は自分の地で測る）・読めない写真・写真の重複・
// リンク（tel 6 か所・ページ内 4 本・入れ子の <a>）・押せるか（ボタンの文字の上でも）・押せない飾り（札・名札・目次・点・線）が押せる見た目でないか・
// ナビとボタンの間・メニューのボタンの高さ・架空の一文・「掲載店」・仮の文・地図の形（緯度経度＋z=16＋hl=ja）・文節の折り返し（auto-phrase）・
// 留まるパネル（1440×900 と 834×1112 で重なって上がり、包みの後はお品書きが見える。1440×800 と SP では留まらない）を調べる。問題があれば終了コード 1。
// 重なりなどの検査は、留まりを外した状態（.wa23-stack に検査用の印を付けて position: static）で測る。
// 使い方：node tools/wa23-check.mjs <店のID>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa23-check.mjs ashinoha）");
const URL_ = pathToFileURL(path.resolve(`dist/${ID}/index.html`)).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 834, 1024, 1025, 1280, 1440, 1920]; // 767／768 と 1024／1025 が配置の切り替わり
const TABLET = [768, 834, 1024];
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa23-content.json`, "utf8"));
const LY = JSON.parse(fs.readFileSync(`samples/${ID}/wa23-layout.json`, "utf8"));
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).filter(([k]) => k !== "sec_header").map(([k, v]) => [k, v.minHeight[d]]));
const SPEC = { 1440: specOf("pc"), 390: specOf("sp") };
const PHOTOS = Object.keys(C.photos).length, TEL = `tel:${C.phone.digits}`, TELROW = C.info.rows.findIndex(([, v]) => v === "$phone");
const NAVN = Object.values(site.sections).filter((s) => s.nav).length;
const HEADER_BG = "rgb(251, 250, 247)";
const DECO = [...LY.deco.toc, ...LY.deco.nums, ...LY.deco.card, ...LY.deco.dots, "mn_bg", "in_bg"];
const STATIC = `.wa23-check-static>section{position:static!important}`;
const browser = await chromium.launch();
let bad = 0;
const RATIO = {};
const ng = (m) => { bad++; console.log("NG " + m); };
const open = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(URL_, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => { for (const i of document.images) i.loading = "eager"; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  await page.waitForTimeout(300);
  return { page, errs };
};
try {
  for (const w of WIDTHS) {
    const { page, errs } = await open(w, w < 1025 ? 844 : 900);
    await page.addStyleTag({ content: STATIC });
    await page.evaluate(() => { const s = document.querySelector(".wa23-stack"); if (s) s.classList.add("wa23-check-static"); });
    const r = await page.evaluate(({ TEL, TELROW, DECO }) => {
      const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], onImg: [], secs: {}, broken: [], contrast: [], min: 99, links: [], orphan: [] };
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
      const idOf = (e) => e.dataset.el || e.dataset.cel;
      const all = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => !e.closest(".nav-menu"));
      const rect = (e) => { const R = document.createRange(); R.selectNodeContents(e); return R.getBoundingClientRect(); };
      for (const e of all) {
        const id = idOf(e), b = rect(e), cs = getComputedStyle(e);
        if (b.right > vw + 0.5 || b.left < -0.5) out.clip.push(id);
        const lh = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
        if (e.scrollWidth > e.clientWidth + 3 || (lh >= 1.25 && e.scrollHeight > e.clientHeight + Math.max(6, parseFloat(cs.fontSize) * 0.1))) out.clip.push(id + "(中身)");
      }
      const R = all.map((e) => { const cs = getComputedStyle(e), b = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) < 1.25 ? e.getBoundingClientRect() : rect(e); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (hit(R[i][1], R[j][1])) out.over.push(R[i][0] + "×" + R[j][0]);
      const boxes = [...document.querySelectorAll(".el-photo,[data-el=in_map]")].filter(vis).map((e) => { const b = e.getBoundingClientRect(); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      for (const [id, a] of R) if (!/^hd_/.test(id)) for (const [pid, b] of boxes) if (hit(a, b)) out.onImg.push(id + "×" + pid);
      for (const s of document.querySelectorAll("[data-sec]")) if (s.matches("section,div,footer") && s.dataset.sec !== "sec_header" && !out.secs[s.dataset.sec]) out.secs[s.dataset.sec] = Math.round(s.getBoundingClientRect().height * 10) / 10;
      for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
      out.photos = document.images.length;
      // 写真の表示の大きさに対する画素の倍率（2 倍程度まで・1 倍未満は粗い）
      out.ratio = [...document.images].filter(vis).map((i) => { const b = i.getBoundingClientRect(), s = Math.max(b.width / i.naturalWidth, b.height / i.naturalHeight); return [i.closest("[data-el]").dataset.el, Math.round((1 / s) * 100) / 100]; });
      const ifr = document.querySelectorAll("[data-el=in_map] iframe"); out.map = ifr.length; out.mapSrc = ifr[0] ? ifr[0].getAttribute("src") : "";
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const Lm = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const bgOf = (e) => { const own = parse(getComputedStyle(e).backgroundColor); if (own.a > 0.99) return own; const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; for (const n of document.elementsFromPoint(cx, cy)) { if (n === e || e.contains(n)) continue; if (n.tagName === "IMG" || n.tagName === "PICTURE" || n.classList.contains("el-photo")) return "photo"; if (n.getBoundingClientRect().height < 4) continue; const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 255, g: 255, b: 255 }; };
      for (const e of all) {
        const id = idOf(e);
        e.scrollIntoView({ block: "center" });
        const cs = getComputedStyle(e), size = parseFloat(cs.fontSize), fg = parse(cs.color), bg = bgOf(e);
        if (bg === "photo") { out.contrast.push(`${id}:写真の上`); continue; }
        const a = Lm(fg), b = Lm(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (cr < out.min) out.min = Math.round(cr * 100) / 100;
        if (cr < 4.5) out.contrast.push(`${id}:${cr.toFixed(2)}(${size}px)`);
      }
      scrollTo(0, 0);
      for (const a of document.querySelectorAll("a[href]")) { const h = a.getAttribute("href"); if (h.startsWith("#") && h.length > 1) { if (!document.getElementById(decodeURIComponent(h.slice(1)))) out.links.push(h); } else if (h === "#" || h === "" || h.startsWith("javascript:")) out.links.push("飾り:" + h); else if (h.startsWith("tel:") && h !== TEL) out.links.push(h); }
      out.tel = document.querySelectorAll('a[href^="tel:"]').length;
      out.anchors = [...new Set([...document.querySelectorAll('.nav-row a[href*="#"]')].map((a) => a.getAttribute("href")))].length;
      out.nested = document.querySelectorAll("a a").length;
      // 押せるか：一番上の要素がリンクの中か（ボタンの文字の中央・表の電話番号・帯の電話番号・フッターの電話・店名・PC の「お電話」）
      const press = {};
      for (const id of ["in_btn_t", `in_v${TELROW}`, "ft_t", "hd_name", "hd_btn_t", "bd_tel"]) { const e = document.querySelector(`[data-el="${id}"]`); const pcOnly = id === "hd_btn_t" ? vw < 1025 : id === "bd_tel" ? vw < 768 : false; if (!e || !vis(e)) { if (!pcOnly) press[id] = false; continue; } e.scrollIntoView({ block: "center" }); const b = rect(e), n = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); press[id] = !!(n && n.closest("a[href]")); }
      scrollTo(0, 0);
      out.press = press;
      out.deco = DECO.map((id) => document.querySelector(`[data-el="${id}"]`)).filter(Boolean).filter((e) => e.closest("a[href]") || getComputedStyle(e).cursor === "pointer" || getComputedStyle(e).boxShadow !== "none" && !e.matches(".el-photo")).map((e) => e.dataset.el);
      // 1〜2 字だけの行（字の下端で行を分ける）
      for (const e of all) {
        const blocks = e.querySelectorAll(".pg").length ? [...e.querySelectorAll(".pg")] : [e];
        for (const blk of blocks) {
          const tn = [], W = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT); while (W.nextNode()) tn.push(W.currentNode);
          const ys = [], tol = parseFloat(getComputedStyle(e).fontSize) * 0.5;
          for (const n of tn) { if (n.parentElement.closest(".wa23-vh")) continue; for (let i = 0; i < n.length; i++) { if (!n.data[i].trim()) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); ys.push(g.getBoundingClientRect().bottom); } }
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
    }, { TEL, TELROW, DECO });
    if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
    if (r.clip.length) ng(`${w}: 文字のはみ出し ${[...new Set(r.clip)].join(",")}`);
    if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
    if (r.onImg.length) ng(`${w}: 文字と写真・地図の重なり ${r.onImg.join(",")}`);
    if (r.orphan.length) ng(`${w}: 1〜2 字だけの行 ${r.orphan.join(" ／ ")}`);
    if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
    for (const [id, x] of r.ratio) RATIO[id] = Math.min(RATIO[id] ?? 99, x); // 写真ごとに、いちばん大きく出る幅での倍率
    if (r.contrast.length) ng(`${w}: コントラスト ${r.contrast.join(",")}`);
    if (r.links.length) ng(`${w}: リンク ${r.links.join(",")}`);
    if (r.nested) ng(`${w}: 入れ子の <a> ${r.nested} 件`);
    if (r.tel !== 6) ng(`${w}: 電話のリンクが ${r.tel} 件（ヘッダー・全面のメニュー・帯・表・ボタン・フッターの 6 件のはず）`);
    for (const [k, v] of Object.entries(r.press)) if (!v) ng(`${w}: ${k} が押せない`);
    if (r.deco.length) ng(`${w}: 飾りが押せる見た目 ${r.deco.join(",")}`);
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
    // ヘッダー：地は常に白の不透明。PC は店名・リンク・お電話のボタンが重ならない。タブレット以下はメニューのボタンが 44 以上で店名と重ならず、開くと電話のボタンが画面に入る
    const hd = await page.evaluate(async () => {
      const h = document.querySelector(".site-header");
      const top = getComputedStyle(h).backgroundColor;
      scrollTo(0, document.documentElement.scrollHeight / 2); await new Promise((f) => setTimeout(f, 250));
      const b = getComputedStyle(h).backgroundColor;
      const rr = (e) => { const q = document.createRange(); q.selectNodeContents(e); return q.getBoundingClientRect(); };
      const nm = document.querySelector("[data-el=hd_name]"), sub = document.querySelector("[data-el=hd_sub]");
      const nameR = Math.max(rr(nm).right, sub && sub.getBoundingClientRect().width ? rr(sub).right : 0);
      const links = [...document.querySelectorAll(".el-nav .nav-row a")].filter((a) => a.getBoundingClientRect().width);
      const sum = document.querySelector(".nav-sp summary"), sb = sum && sum.getBoundingClientRect().width ? sum.getBoundingClientRect() : null;
      const firstL = links.length ? links[0].getBoundingClientRect().left : 0, lastR = links.length ? links[links.length - 1].getBoundingClientRect().right : 0;
      const btn = document.querySelector("[data-el=hd_btn]"), btnB = btn && btn.getBoundingClientRect().width ? btn.getBoundingClientRect() : null;
      let res = null;
      if (sb) { const d = sum.closest("details"); d.open = true; const a = d.querySelector(".wa23-tel"), x = a && a.getBoundingClientRect(); res = x ? { w: x.width, b: x.bottom, r: x.right } : null; d.open = false; }
      scrollTo(0, 0);
      return { top, b, nameR, firstL, lastR, btnL: btnB ? btnB.left : 0, btnR: btnB ? btnB.right : 0, menu: sb ? { l: sb.left, r: sb.right, h: sb.height } : null, res, vh: innerHeight, nlinks: links.length };
    });
    if (hd.b !== HEADER_BG) ng(`${w}: スクロール後のヘッダーの地 ${hd.b}`);
    if (hd.top !== HEADER_BG) ng(`${w}: 最初の画面のヘッダーの地 ${hd.top}`);
    if (hd.firstL && hd.nameR > hd.firstL - 24) ng(`${w}: 店名とナビが近い／重なる`);
    if (hd.lastR && hd.btnL && hd.lastR > hd.btnL - 24) ng(`${w}: ナビとお電話のボタンが近い／重なる（${Math.round(hd.btnL - hd.lastR)}px）`);
    if (hd.lastR && hd.lastR > w) ng(`${w}: ナビが画面の外`);
    if (hd.btnR > w) ng(`${w}: お電話のボタンが画面の外`);
    if (w >= 1025 && hd.nlinks !== NAVN) ng(`${w}: ナビのリンク ${hd.nlinks} 本（${NAVN} 本のはず）`);
    if (w < 1025) { if (!hd.menu) ng(`${w}: メニューのボタンが無い`); else { if (hd.menu.h < 44) ng(`${w}: メニューのボタンの高さ ${hd.menu.h}`); if (hd.menu.r > w) ng(`${w}: メニューのボタンが画面の外`); if (hd.nameR > hd.menu.l - 8) ng(`${w}: 店名とメニューが重なる`); if (!hd.res || hd.res.w < 100 || hd.res.b > hd.vh || hd.res.r > w) ng(`${w}: 全面のメニューの電話のボタン ${JSON.stringify(hd.res)}`); } }
    else if (hd.menu) ng(`${w}: PC にメニューのボタンが出ている`);
    if (TABLET.includes(w)) {
      const c = await page.evaluate(({ TELROW }) => {
        const q = (s) => document.querySelector(`[data-el="${s}"]`);
        const box = (s) => q(s).getBoundingClientRect();
        const span = (...ids) => { const b = ids.filter(q).map(box); return Math.max(...b.map((x) => x.right)) - Math.min(...b.map((x) => x.left)); };
        return { fv_ph: box("fv_ph").width, fv_cp: box("fv_cp").width, fv_note: box("fv_note").width, so_p: box("so_p").width, e0_card: box("e0_card").width, e0_tx: box("e0_tx").width, e0_table: span("e0_rk0", "e0_rv0"),
          mn_p: box("mn_p").width, mc_row: span("mc_ph0", "mc_y0"), mo_d0: q("mo_d0") ? box("mo_d0").width : 9999, si_row: q("si_ph0") ? span("si_ph0", "si_d0") : 9999,
          ab_ph: box("ab_ph").width, ab_p0: box("ab_p0").width, in_table: span("in_k0", `in_v${TELROW}`), map: box("in_map").width };
      }, { TELROW });
      for (const [k, v] of Object.entries(c)) if (v < w * 0.7) ng(`${w}: 本文の列 ${k} が ${Math.round(v)}px（画面幅の 70% 未満）`);
      console.log(`${w}: 列の幅 ${JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v)])))}`);
    }
    if ([390, 768, 1440].includes(w)) console.log(`${w}: 高さ ${JSON.stringify(r.secs)} コントラスト最小 ${r.min} tel ${r.tel} 件・ナビ ${r.anchors} 本・入れ子の a ${r.nested}・全長 ${r.scroll}・写真の倍率 ${r.ratio.map((x) => x[1]).join("/")}`);
    console.log(`${w}: 済`);
    await page.close();
  }
  // 写真の画素：いちばん大きく出る幅で 1 倍以上・2.3 倍まで（表示幅に合わせた WebP）
  const offR = Object.entries(RATIO).filter(([, x]) => x < 1 || x > 2.3);
  if (offR.length) ng(`写真の画素の倍率 ${offR.map((x) => x.join(":")).join(",")}`);
  console.log(`写真の画素の倍率（いちばん大きく出る幅で）${Object.entries(RATIO).map((x) => x.join(":")).join(" ")}`);
  // 留まるパネル：高さの足りる画面では重なって上がり、包みの後はお品書きが見える。低い画面・SP では留まらない
  for (const [w, h, expect] of [[1440, 900, true], [834, 1112, true], [1440, 800, false], [1280, 720, false], [390, 844, false]]) {
    const { page } = await open(w, h);
    const s = await page.evaluate(async (expect) => {
      const panels = [...document.querySelectorAll(".wa23-stack>section")], hdH = document.querySelector(".site-header").getBoundingClientRect().height;
      const pos = getComputedStyle(panels[0]).position;
      if (!expect) return { pos, ok: pos !== "sticky" };
      const wait = () => new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
      const top0 = panels[0].getBoundingClientRect().top + scrollY, h0 = panels[0].getBoundingClientRect().height;
      const res = { pos, n: panels.length, steps: [] };
      // パネル j+1 が半分ほど上がった所：パネル j はヘッダーの下に留まり、下半分はパネル j+1 が覆う
      for (let j = 0; j + 1 < panels.length; j++) {
        scrollTo(0, top0 + h0 * (j + 1) - hdH - Math.round(innerHeight * 0.4)); await wait();
        const bj = panels[j].getBoundingClientRect(), bn = panels[j + 1].getBoundingClientRect();
        const atTop = document.elementFromPoint(innerWidth / 2, hdH + 20)?.closest("section"), atLow = document.elementFromPoint(innerWidth / 2, innerHeight - 20)?.closest("section");
        res.steps.push({ stuck: Math.abs(bj.top - hdH) < 1.5, nextTop: Math.round(bn.top), top: atTop?.dataset.sec, low: atLow?.dataset.sec, want: [panels[j].dataset.sec, panels[j + 1].dataset.sec] });
      }
      // 包みの終わりを過ぎたら：パネルはすべてヘッダーより上へ抜け、ヘッダーの下はお品書きの段
      const wrap = document.querySelector(".wa23-stack"), wb = wrap.getBoundingClientRect().bottom + scrollY;
      scrollTo(0, wb - hdH + 10); await wait();
      res.after = document.elementFromPoint(innerWidth / 2, hdH + 40)?.closest("section")?.dataset.sec;
      res.leftover = panels.filter((p) => p.getBoundingClientRect().bottom > hdH + 1).map((p) => p.dataset.sec);
      res.ok = pos === "sticky" && res.steps.every((x) => x.stuck && x.top === x.want[0] && x.low === x.want[1]) && res.after === "sec_menu" && !res.leftover.length;
      return res;
    }, expect);
    if (!s.ok) ng(`留まるパネル ${w}×${h}：${JSON.stringify(s)}`);
    console.log(`留まるパネル ${w}×${h}：${expect ? `重なり ${s.steps?.map((x) => `${x.top}→${x.low}`).join("／")}、包みの後 ${s.after}、残り ${s.leftover?.length ?? "-"}` : `position ${s.pos}`} ${s.ok ? "OK" : "NG"}`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅＋留まるパネル 5 画面 問題なし`);
process.exit(bad ? 1 : 0);
