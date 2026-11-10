#!/usr/bin/env node
// wa-21：dist/<店> の数値の検査。幅 320〜1920 の横はみ出し・**写真の影と傾けた写真の外側の端が中身の列（PC x120〜1320・タブレット x48〜720・SP x24〜366）に収まるか**・
// 文字のはみ出しと重なり・文字と写真・地図の重なり（名札は写真の隅に重ねる設計なので除く）・1〜2 字だけの行・本文の列の幅（タブレット 768・834・1024 で画面幅の 70% 以上）・
// コントラスト（名札・効きの札は自分の地で測る）・読めない写真・リンク（tel・ページ内・入れ子の <a>）・押せるか・押せない飾り（札・名札・効きの札・点・水玉・帯）が押せる見た目でないか・
// スパイスの色の丸と段 3 の「使うスパイス」の色が同じか・架空の一文・「掲載店」・写真の重複・仮の文・地図の形（緯度経度＋z=16＋hl=ja）・文節の折り返し（auto-phrase）を調べる。問題があれば終了コード 1。
// 使い方：node tools/wa21-check.mjs <店のID>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const ID = process.argv[2];
if (!ID) throw new Error("店の ID を指定してください（例：node tools/wa21-check.mjs tsukitobasil）");
const URL_ = pathToFileURL(path.resolve(`dist/${ID}/index.html`)).href;
const WIDTHS = [320, 360, 390, 430, 600, 767, 768, 834, 1024, 1025, 1280, 1440, 1920]; // 767／768 と 1024／1025 が配置の切り替わり
const TABLET = [768, 834, 1024];
const site = JSON.parse(fs.readFileSync(`samples/${ID}/site.json`, "utf8"));
const C = JSON.parse(fs.readFileSync(`samples/${ID}/wa21-content.json`, "utf8"));
const TB = JSON.parse(fs.readFileSync(`samples/${ID}/wa21-tablet.json`, "utf8"));
const specOf = (d) => Object.fromEntries(Object.entries(site.sections).filter(([k]) => k !== "sec_header").map(([k, v]) => [k, v.minHeight[d]]));
const SPEC = { 1440: specOf("pc"), 390: specOf("sp") };
const PHOTOS = Object.keys(C.photos).length, TEL = `tel:${C.phone.digits}`, TELROW = C.info.rows.findIndex(([, v]) => v === "$phone");
const HEADER_BG = "rgb(255, 253, 248)";
const DECO = [...TB.deco.tag, ...TB.deco.nametag, ...TB.deco.chip, ...TB.deco.dots, ...TB.deco.polka, ...TB.deco.band, "ai_bg"];
const SKIP_ON_IMG = TB.deco.nametag; // 名札は写真の隅に重ねる
// 段 3 の使うスパイスの丸の色（段 2 の色と同じはず）
const spiceColor = Object.fromEntries(C.spice.items.map((s) => [s.name, s.color]));
const hex2rgb = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const DOTS = [];
C.curry.items.forEach((it, i) => it.spices.forEach((nm, j) => DOTS.push([`cu_s${i}_${j}`, hex2rgb(spiceColor[nm])])));
C.spice.items.forEach((s, i) => DOTS.push([`sp_d${i}`, hex2rgb(s.color)]));
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
    const r = await page.evaluate(({ TEL, TELROW, DECO, SKIP_ON_IMG, DOTS, BAND }) => {
      const vw = innerWidth, out = { sw: document.documentElement.scrollWidth, vw, clip: [], over: [], onImg: [], secs: {}, broken: [], contrast: [], min: 99, links: [], orphan: [], edge: [], dotColor: [] };
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
      const idOf = (e) => e.dataset.el || e.dataset.cel;
      const all = [...document.querySelectorAll(".el-text")].filter(vis).filter((e) => !e.closest(".nav-menu"));
      const rect = (e) => { const R = document.createRange(); R.selectNodeContents(e); return R.getBoundingClientRect(); };
      for (const e of all) {
        const id = idOf(e); if (BAND.includes(id)) continue; // 大きな淡い英字の帯は段の端で切る飾り
        const b = rect(e), cs = getComputedStyle(e);
        if (b.right > vw + 0.5 || b.left < -0.5) out.clip.push(id);
        const lh = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
        if (e.scrollWidth > e.clientWidth + 3 || (lh >= 1.25 && e.scrollHeight > e.clientHeight + Math.max(6, parseFloat(cs.fontSize) * 0.1))) out.clip.push(id + "(中身)");
      }
      const R = all.filter((e) => !BAND.includes(idOf(e))).map((e) => { const cs = getComputedStyle(e), b = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) < 1.25 ? e.getBoundingClientRect() : rect(e); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (hit(R[i][1], R[j][1])) out.over.push(R[i][0] + "×" + R[j][0]);
      const boxes = [...document.querySelectorAll(".el-photo,[data-el=in_map]")].filter(vis).map((e) => { const b = e.getBoundingClientRect(); return [idOf(e), { l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }]; });
      for (const [id, a] of R) if (!/^hd_/.test(id) && !SKIP_ON_IMG.includes(id)) for (const [pid, b] of boxes) if (hit(a, b)) out.onImg.push(id + "×" + pid);
      // 写真の影・傾けの外側の端：中身の列の中（cbox の左からの設計の px で比べる）
      const cbox = document.querySelector("main .cbox, .cbox"), cb = cbox.getBoundingClientRect(), scale = parseFloat(getComputedStyle(document.documentElement).fontSize) / 10;
      const dev = vw < 768 ? "sp" : vw < 1025 ? "tab" : "pc";
      const lim = { pc: [112, 1328], tab: [40, 728], sp: [16, 374] }[dev]; // 列の端から 8 までの食い出し（傾けの角）を許す
      const shOf = (e) => { const m = getComputedStyle(e).boxShadow.match(/(-?[\d.]+)px (-?[\d.]+)px 0px/); return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0]; };
      out.edgeMax = 0;
      for (const e of document.querySelectorAll(".el-photo,[data-el=in_map],[data-el=in_btn]")) {
        if (!vis(e)) continue;
        const b = e.getBoundingClientRect(), [sx] = shOf(e);
        const L = (b.left - cb.left) / scale, Rr = (b.right + Math.max(0, sx) - cb.left) / scale;
        out.edgeMax = Math.max(out.edgeMax, Math.round(Rr * 10) / 10);
        if (L < lim[0] - 0.5 || Rr > lim[1] + 0.5) out.edge.push(`${idOf(e)}(${Math.round(L)}〜${Math.round(Rr)})`);
        if (b.right + Math.max(0, sx) > vw - 4) out.edge.push(`${idOf(e)}(画面の右端 ${Math.round(b.right + sx)})`);
      }
      out.dev = dev;
      for (const s of document.querySelectorAll("[data-sec]")) if (s.matches("section,div,footer") && s.dataset.sec !== "sec_header" && !out.secs[s.dataset.sec]) out.secs[s.dataset.sec] = Math.round(s.getBoundingClientRect().height * 10) / 10;
      for (const i of document.images) if (!i.complete || !i.naturalWidth) out.broken.push(i.getAttribute("src"));
      out.photos = document.images.length;
      const ifr = document.querySelectorAll("[data-el=in_map] iframe"); out.map = ifr.length; out.mapSrc = ifr[0] ? ifr[0].getAttribute("src") : "";
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const Lm = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const bgOf = (e) => { const own = parse(getComputedStyle(e).backgroundColor); if (own.a > 0.99) return own; const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; for (const n of document.elementsFromPoint(cx, cy)) { if (n === e || e.contains(n)) continue; if (n.tagName === "IMG" || n.tagName === "PICTURE" || n.classList.contains("el-photo")) return "photo"; if (n.getBoundingClientRect().height < 4) continue; const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 255, g: 255, b: 255 }; };
      for (const e of all) {
        const id = idOf(e); if (BAND.includes(id)) continue;
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
      out.anchors = document.querySelectorAll('a[href^="#"]').length;
      out.nested = document.querySelectorAll("a a").length;
      // 押せるか：電話のボタンの文字の中央・表の電話番号・フッターの電話・店名・PC の「お電話」で、一番上の要素がリンクの中か
      const press = {};
      for (const id of ["in_btn_t", `in_v${TELROW}`, "ft_t", "hd_name", "hd_btn_t"]) { const e = document.querySelector(`[data-el="${id}"]`); if (!e || !vis(e)) { if (id !== "hd_btn_t" || vw >= 1025) press[id] = false; continue; } e.scrollIntoView({ block: "center" }); const b = rect(e), n = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); press[id] = !!(n && n.closest("a[href]")); }
      scrollTo(0, 0);
      out.press = press;
      out.deco = DECO.map((id) => document.querySelector(`[data-el="${id}"]`)).filter(Boolean).filter((e) => e.closest("a[href]") || getComputedStyle(e).cursor === "pointer").map((e) => e.dataset.el);
      out.bandHidden = (document.querySelector("[data-el=ab_band]") || {}).getAttribute?.("aria-hidden") === "true";
      for (const [id, c] of DOTS) { const e = document.querySelector(`[data-el="${id}"]`); if (!e) { out.dotColor.push(id + ":無い"); continue; } const bg = getComputedStyle(e).backgroundColor; if (bg !== c) out.dotColor.push(`${id}:${bg}≠${c}`); }
      // 1〜2 字だけの行（字の下端で行を分ける。「円」のような小さな字が上端の差で別の行に数えられないように）
      for (const e of all) {
        if (BAND.includes(idOf(e))) continue;
        const blocks = e.querySelectorAll(".pg").length ? [...e.querySelectorAll(".pg")] : [e];
        for (const blk of blocks) {
          const tn = [], W = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT); while (W.nextNode()) tn.push(W.currentNode);
          const ys = [], tol = parseFloat(getComputedStyle(e).fontSize) * 0.5;
          for (const n of tn) { if (n.parentElement.closest(".wa21-vh")) continue; for (let i = 0; i < n.length; i++) { if (!n.data[i].trim()) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1); ys.push(g.getBoundingClientRect().bottom); } }
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
    }, { TEL, TELROW, DECO, SKIP_ON_IMG, DOTS, BAND: TB.deco.band });
    if (r.sw > r.vw) ng(`${w}: 横はみ出し ${r.sw}>${r.vw}`);
    if (r.edge.length) ng(`${w}: 影・傾けが列の外 ${r.edge.join(",")}`);
    if (r.clip.length) ng(`${w}: 文字のはみ出し ${[...new Set(r.clip)].join(",")}`);
    if (r.over.length) ng(`${w}: 文字の重なり ${r.over.join(",")}`);
    if (r.onImg.length) ng(`${w}: 文字と写真・地図の重なり ${r.onImg.join(",")}`);
    if (r.orphan.length) ng(`${w}: 1〜2 字だけの行 ${r.orphan.join(" ／ ")}`);
    if (r.broken.length) ng(`${w}: 読めない写真 ${r.broken.join(",")}`);
    if (r.contrast.length) ng(`${w}: コントラスト ${r.contrast.join(",")}`);
    if (r.links.length) ng(`${w}: リンク ${r.links.join(",")}`);
    if (r.nested) ng(`${w}: 入れ子の <a> ${r.nested} 件`);
    if (r.tel < 5) ng(`${w}: 電話のリンクが ${r.tel} 件（ヘッダー・全面のメニュー・表・ボタン・フッターの 5 件のはず）`);
    for (const [k, v] of Object.entries(r.press)) if (!v) ng(`${w}: ${k} が押せない`);
    if (r.deco.length) ng(`${w}: 飾りが押せる見た目 ${r.deco.join(",")}`);
    if (!r.bandHidden) ng(`${w}: 淡い英字の帯に aria-hidden が無い`);
    if (r.dotColor.length) ng(`${w}: スパイスの丸の色 ${r.dotColor.join(",")}`);
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
      const nm = document.querySelector("[data-el=hd_name]"), nr = document.createRange(); nr.selectNodeContents(nm); const nb = nr.getBoundingClientRect();
      const sub = document.querySelector("[data-el=hd_sub]"), sbx = sub && sub.getBoundingClientRect().width ? (() => { const q = document.createRange(); q.selectNodeContents(sub); return q.getBoundingClientRect().right; })() : 0;
      const links = [...document.querySelectorAll(".el-nav .nav-row a")].filter((a) => a.getBoundingClientRect().width);
      const sum = document.querySelector(".nav-sp summary"), sb = sum && sum.getBoundingClientRect().width ? sum.getBoundingClientRect() : null;
      const firstL = links.length ? links[0].getBoundingClientRect().left : 0, lastR = links.length ? links[links.length - 1].getBoundingClientRect().right : 0;
      const btn = document.querySelector("[data-el=hd_btn]"), btnB = btn && btn.getBoundingClientRect().width ? btn.getBoundingClientRect() : null;
      let res = null;
      if (sb) { const d = sum.closest("details"); d.open = true; const a = d.querySelector(".wa21-tel"), x = a && a.getBoundingClientRect(); res = x ? { w: x.width, b: x.bottom, r: x.right } : null; d.open = false; }
      scrollTo(0, 0);
      return { top, b, nameR: Math.max(nb.right, sbx), firstL, lastR, btnL: btnB ? btnB.left : 0, btnR: btnB ? btnB.right : 0, menu: sb ? { l: sb.left, r: sb.right, h: sb.height } : null, res, vh: innerHeight, nlinks: links.length };
    });
    if (hd.b !== HEADER_BG) ng(`${w}: スクロール後のヘッダーの地 ${hd.b}`);
    if (hd.top !== HEADER_BG) ng(`${w}: 最初の画面のヘッダーの地 ${hd.top}`);
    if (hd.firstL && hd.nameR > hd.firstL - 24) ng(`${w}: 店名とナビが近い／重なる`);
    if (hd.lastR && hd.btnL && hd.lastR > hd.btnL - 24) ng(`${w}: ナビとお電話のボタンが近い／重なる`);
    if (hd.lastR && hd.lastR > w) ng(`${w}: ナビが画面の外`);
    if (hd.btnR > w) ng(`${w}: お電話のボタンが画面の外`);
    if (w >= 1025 && hd.nlinks !== 5) ng(`${w}: ナビのリンク ${hd.nlinks} 本（5 本のはず）`);
    if (w < 1025) { if (!hd.menu) ng(`${w}: メニューのボタンが無い`); else { if (hd.menu.h < 44) ng(`${w}: メニューのボタンの高さ ${hd.menu.h}`); if (hd.menu.r > w) ng(`${w}: メニューのボタンが画面の外`); if (hd.nameR > hd.menu.l - 8) ng(`${w}: 店名とメニューが重なる`); if (!hd.res || hd.res.w < 100 || hd.res.b > hd.vh || hd.res.r > w) ng(`${w}: 全面のメニューの電話のボタン ${JSON.stringify(hd.res)}`); } }
    else if (hd.menu) ng(`${w}: PC にメニューのボタンが出ている`);
    if (TABLET.includes(w)) {
      const c = await page.evaluate(({ TELROW }) => {
        const box = (s) => document.querySelector(`[data-el="${s}"]`).getBoundingClientRect();
        const span = (...ids) => { const b = ids.map(box); return Math.max(...b.map((x) => x.right)) - Math.min(...b.map((x) => x.left)); };
        return { fv_cp: box("fv_cp").width, fv_photos: span("fv_ph2", "fv_ph"), sp_p: box("sp_p").width, sp_ph: box("sp_ph").width, sp_rows: span("sp_x0", "sp_x1"), cu_p: box("cu_p").width, cu_row: span("cu_ph0", "cu_y0"),
          ai_p: box("ai_p").width, ai_sets: span("ai_n0", "ai_y1"), ai_rows: span("ai_rn0", "ai_rp0"), ab_ph: box("ab_ph").width, ab_p1: box("ab_p1").width, in_table: span("in_k0", `in_v${TELROW}`), map: box("in_map").width, footer: box("ft_hr").width };
      }, { TELROW });
      for (const [k, v] of Object.entries(c)) if (v < w * 0.7) ng(`${w}: 本文の列 ${k} が ${Math.round(v)}px（画面幅の 70% 未満）`);
      console.log(`${w}: 列の幅 ${JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v)])))}`);
    }
    if ([320, 390, 768, 1024, 1440].includes(w)) console.log(`${w}: 影の外側の右端（設計 px）${r.edgeMax}`);
    if ([390, 768, 1440].includes(w)) console.log(`${w}: 高さ ${JSON.stringify(r.secs)} コントラスト最小 ${r.min} tel ${r.tel} 件・ページ内リンク ${r.anchors} 件・入れ子の a ${r.nested}・全長 ${r.scroll}`);
    console.log(`${w}: 済`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(bad ? `問題 ${bad} 件` : `全 ${WIDTHS.length} 幅 問題なし`);
process.exit(bad ? 1 : 0);
