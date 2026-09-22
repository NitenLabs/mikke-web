#!/usr/bin/env node
// 芦屋みっけ Web制作：設計書（SPEC）付録 A との照合（SPEC 10.1 / 作業票 fix01 §3.11）
// 使い方: node tools/spec-check.mjs samples/ashiyado dist/ashiyado
//   付録 A（tools/lib/appendixA.mjs、Claude.ai が設計書から書き起こした項目）を種類ごとの仕組みで照合する。
//   種類: text（文字の段）／box（位置と大きさ・ページy）／line（表示される線の太さと色）／
//         relation（2要素の関係）／global（全体の規則）。自動照合できない行は manual として残す。
//   出力の最後に 付録Aの 総数・合格・不合格・要素が見つからない・手動 の件数を出す。
//   旧来の「site.json から自動生成した期待値」も残し（baseline）、付録 A と重複する項目は付録 A を優先する。

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { textStyle } from "./lib/theme.mjs";
import { FONT_REGISTRY } from "./lib/fonts.mjs";
import * as A from "./lib/appendixA.mjs";

let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.argv[2] || "samples/ashiyado");
const distDir = path.resolve(process.argv[3] || "dist/ashiyado");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
const site = load("site.json"), theme = load("theme.json");
const W = { pc: site.canvas.pcContentWidth, sp: site.canvas.spDesignWidth };
const round = (n) => Math.round(n * 100) / 100;
const norm = (c) => (c || "").toUpperCase();

// セクション→ページ、要素→ページ
const secToPage = {};
for (const [pid, pg] of Object.entries(site.pages)) for (const s of pg.sections || []) secToPage[s] = pid;
const HEADER = site.regions.header, FOOTER = site.regions.footer;
const pageOfSec = (sec) => secToPage[sec] || "pg_home";
const pageOfEl = (id) => { const el = site.elements[id]; return el ? pageOfSec(el.section) : "pg_home"; };
const fileFor = (pid) => { const slug = site.pages[pid]?.slug || "/"; return slug === "/" ? "index.html" : `${slug.slice(1)}/index.html`; };

// ---- ブラウザ内の実測 ----
const MEASURE = (payload) => {
  const rgb2hex = (c) => { if (!c) return null; const m = c.match(/[\d.]+/g); if (!m) return c; return "#" + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase(); };
  const alphaOf = (c) => { const m = (c || "").match(/[\d.]+/g); return m && m.length >= 4 ? +m[3] : 1; };
  const styleOf = (e) => { const cs = getComputedStyle(e); return {
    font: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
    size: parseFloat(cs.fontSize), weight: +cs.fontWeight,
    lh: cs.lineHeight === "normal" ? null : parseFloat(cs.lineHeight),
    ls: cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing),
    color: rgb2hex(cs.color), align: cs.textAlign, writingMode: cs.writingMode,
    bg: rgb2hex(cs.backgroundColor), bgAlpha: alphaOf(cs.backgroundColor) * (parseFloat(cs.opacity) || 1),
    btWidth: parseFloat(cs.borderTopWidth) || 0, btColor: rgb2hex(cs.borderTopColor),
    bw: parseFloat(cs.borderTopWidth) || 0, bc: rgb2hex(cs.borderTopColor), bcAlpha: alphaOf(cs.borderTopColor),
    br: parseFloat(cs.borderTopLeftRadius) || 0,
  }; };
  const boxOf = (e) => { const sec = e.closest(".sec"); const sr = sec ? sec.getBoundingClientRect() : { left: 0, top: 0 };
    const r = e.getBoundingClientRect(); return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height, pageY: r.top + window.pageYOffset, pageX: r.left }; };
  const out = { el: {}, sec: {}, sel: {} };
  for (const id of payload.els) { const e = document.querySelector(`[data-el="${id}"]`); out.el[id] = e ? { ...boxOf(e), ...styleOf(e) } : null; }
  for (const id of payload.secs) { const e = document.querySelector(`[data-sec="${id}"]`); out.sec[id] = e ? (() => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); const rgb = (c) => { const m = (c || "").match(/[\d.]+/g); return m ? "#" + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase() : null; }; return { pageY: r.top + window.pageYOffset, x: r.left, w: r.width, h: r.height, bg: rgb(cs.backgroundColor), bgAlpha: (cs.backgroundColor.match(/[\d.]+/g) || [0, 0, 0, 1])[3] ?? 1 }; })() : null; }
  for (const s of payload.sels) {
    const nodes = [...document.querySelectorAll(s.sel)];
    if (s.all) out.sel[s.k] = nodes.map((n) => ({ ...boxOf(n), ...styleOf(n) }));
    else out.sel[s.k] = nodes[0] ? { ...boxOf(nodes[0]), ...styleOf(nodes[0]), count: nodes.length } : null;
  }
  out.gap = {}; out.arrow = {}; out.iframe = {}; out.pseudo = {};
  for (const f of payload.iframes || []) {
    const fr = document.querySelector(f.sel);
    out.iframe[f.k] = fr ? { src: fr.getAttribute("src") || "", loading: fr.getAttribute("loading") || "" } : null;
  }
  for (const ps of payload.pseudos || []) {
    const e = document.querySelector(ps.sel);
    if (!e) { out.pseudo[ps.k] = null; continue; }
    const cs = getComputedStyle(e, ps.pseudo);
    out.pseudo[ps.k] = { w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || 0, content: (cs.content || "").replace(/^["']|["']$/g, ""), bg: cs.backgroundImage, color: rgb2hex(cs.color) };
  }
  for (const g of payload.gaps || []) {
    const pgs = [...document.querySelectorAll(g.sel)].map((e) => e.getBoundingClientRect());
    out.gap[g.k] = pgs.length < 2 ? null : pgs.slice(1).map((r, i) => Math.round((r.top - pgs[i].bottom) * 100) / 100);
  }
  for (const a of payload.arrows || []) {
    const btn = document.querySelector(a.btnSel), bg = document.querySelector(a.bgSel);
    if (!btn || !bg) { out.arrow[a.k] = null; continue; }
    const spans = btn.querySelectorAll("span"); const last = spans[spans.length - 1];
    const ar = last ? last.getBoundingClientRect() : btn.getBoundingClientRect();
    const gr = bg.getBoundingClientRect();
    out.arrow[a.k] = { arrowRight: ar.right, arrowMidY: ar.top + ar.height / 2, arrowText: (last?.textContent || "").trim(), pillRight: gr.right, pillLeft: gr.left, pillMidY: gr.top + gr.height / 2 };
  }
  return out;
};

// ---- 付録 A のチェックを (page,dev) ごとの作業に展開 ----
const POS = 4, SIZE = 2, REL = 2, LHTOL = 0.8, SZTOL = 0.6;
const results = {}; // aid -> {status, details:[]}
const rec = (aid, status, detail) => { const r = results[aid] ??= { status: "pass", details: [] }; if (detail) r.details.push(detail); const rank = { pass: 0, notfound: 1, fail: 2 }; if (rank[status] > rank[r.status]) r.status = status; };

// 各 (page,dev) で必要な測定対象を集め、1回で測る
const work = []; // {page, dev, check}
const need = {}; // `${page}:${dev}` -> {els:Set, secs:Set, sels:[]}
const addNeed = (page, dev, { el, sec, sel, gap, arrow, iframe, pseudo }) => { const k = `${page}:${dev}`; const n = need[k] ??= { els: new Set(), secs: new Set(), sels: [], gaps: [], arrows: [], iframes: [], pseudos: [] }; if (el) n.els.add(el); if (sec) n.secs.add(sec); if (sel) n.sels.push(sel); if (gap) n.gaps.push(gap); if (arrow) n.arrows.push(arrow); if (iframe) n.iframes.push(iframe); if (pseudo) n.pseudos.push(pseudo); };

const devsOf = (c) => c.dev ? [c.dev] : ["pc", "sp"];

// text
for (const c of A.TEXT) for (const dev of ["pc", "sp"]) for (const tg of c.targets) {
  const id = typeof tg === "string" ? tg : tg.id; const page = pageOfEl(id);
  work.push({ page, dev, run: "text", c, id, color: typeof tg === "object" && tg.c ? tg.c : null });
  addNeed(page, dev, { el: id });
}
// navtext / labelkey (selectors on home/footer)
for (const c of A.NAVTEXT) { const page = c.id === "A2-18" ? "pg_home" : "pg_home"; for (const dev of (c.sp ? ["pc", "sp"] : ["pc"])) { work.push({ page, dev, run: "seltext", c, k: c.id }); addNeed(page, dev, { sel: { k: c.id, sel: c.sel } }); } }
{ const c = A.LABELKEY; const page = pageOfEl("el_accinfo"); for (const dev of ["pc", "sp"]) { work.push({ page, dev, run: "seltext", c, k: c.id }); addNeed(page, dev, { sel: { k: c.id, sel: c.sel } }); } }
// celtext
for (const c of A.CELTEXT) { const page = pageOfEl(c.rep); for (const dev of ["pc", "sp"]) { const k = `${c.id}`; const sel = `[data-el="${c.rep}"] [data-cel="${c.cel}"]`; work.push({ page, dev, run: "seltext", c, k }); addNeed(page, dev, { sel: { k, sel } }); } }
// box（HEADERH ＝ A3-2 も box）
for (const c of [...A.BOX, ...A.HEADERH]) { const isSec = c.target.startsWith("sec_"); const page = isSec ? pageOfSec(c.target) : pageOfEl(c.target); work.push({ page, dev: c.dev, run: "box", c }); if (isSec) addNeed(page, c.dev, { sec: c.target }); else addNeed(page, c.dev, { el: c.target }); }
// seltext2（FAQ/甘味処の DOM セル）
for (const c of A.SELTEXT2) { const page = c.sel.includes("acc") ? "pg_home" : pageOfEl("el_kanmitable"); work.push({ page, dev: c.dev, run: "seltext", c, k: c.id }); addNeed(page, c.dev, { sel: { k: c.id, sel: c.sel } }); }
// alpha（半透明の線）
for (const c of A.ALPHA) for (const dev of ["pc", "sp"]) { const page = pageOfEl(c.target); work.push({ page, dev, run: "alpha", c }); addNeed(page, dev, { el: c.target }); }
// secbg（セクションの地の色）
for (const c of A.SECBG) for (const [s] of c.targets) { work.push({ page: pageOfSec(s), dev: "pc", run: "secbg", c, s }); addNeed(pageOfSec(s), "pc", { sec: s }); }
// navgeom（ナビの右端・間隔）
for (const c of A.NAVGEOM) { work.push({ page: "pg_home", dev: c.dev, run: "navgeom", c, k: c.id }); addNeed("pg_home", c.dev, { sel: { k: c.id, sel: c.sel, all: true } }); }
// writing（縦書き）
for (const c of A.WRITING) { const page = pageOfEl(c.target); work.push({ page, dev: c.dev, run: "writing", c }); addNeed(page, c.dev, { el: c.target }); }
// borderline（FAQ 行の線）
for (const c of A.BORDERLINE) { work.push({ page: "pg_home", dev: c.dev, run: "borderline", c, k: c.id }); addNeed("pg_home", c.dev, { sel: { k: c.id, sel: c.sel } }); }
// celline（甘味処 縦罫線）
for (const c of A.CELLINE) { const page = pageOfEl("el_kanmitable"); work.push({ page, dev: "pc", run: "borderline", c, k: c.id, asBg: true }); addNeed(page, "pc", { sel: { k: c.id, sel: c.sel } }); }
// pseudo（Q.・シェブロン）
for (const c of A.CELPSEUDO) { work.push({ page: "pg_home", dev: c.dev, run: "pseudo", c, k: c.id }); addNeed("pg_home", c.dev, { pseudo: { k: c.id, sel: c.sel, pseudo: c.pseudo } }); }
// line
for (const c of A.LINE_CHECKS) for (const dev of ["pc", "sp"]) { const page = pageOfEl(c.target); work.push({ page, dev, run: "line", c }); addNeed(page, dev, { el: c.target }); if (c.target) addNeed(page, dev, { sec: site.elements[c.target]?.section }); }
// iframe（地図の読み込み）
for (const c of A.IFRAME) { const page = pageOfEl(c.target); const dev = "pc"; const k = `${c.id}`; work.push({ page, dev, run: "iframe", c, k }); addNeed(page, dev, { iframe: { k, sel: `[data-el="${c.target}"] iframe` } }); }
// gap（段落の間隔）
for (const c of A.GAP) for (const dev of c.dev) { const page = pageOfEl(c.target); const k = `${c.id}:${dev}`; work.push({ page, dev, run: "gap", c, k }); addNeed(page, dev, { gap: { k, sel: `[data-el="${c.target}"] .pg` } }); }
// arrow（ピルの ›）
for (const c of A.ARROW) for (const dev of ["pc", "sp"]) { const page = pageOfEl(c.btn); const k = `${c.id}:${dev}`; work.push({ page, dev, run: "arrow", c, k }); addNeed(page, dev, { arrow: { k, btnSel: `[data-el="${c.btn}"]`, bgSel: `[data-el="${c.bg}"]` } }); }
// relation
for (const c of A.RELATION) { const dev = c.dev; work.push({ page: "pg_home", dev, run: "relation", c });
  if (c.rel === "vCenterEq") { addNeed("pg_home", dev, { el: c.a }); const b = c.b === "block1text" ? ["el_feath1", "el_featb1"] : ["el_feath2", "el_featb2"]; b.forEach((e) => addNeed("pg_home", dev, { el: e })); }
  else if (c.rel === "topEq") { addNeed("pg_home", dev, { el: c.a }); addNeed("pg_home", dev, { el: c.b }); }
  else if (c.rel === "cardPriceTopEq") { addNeed("pg_home", dev, { sel: { k: "cardprices", sel: `[data-el="${c.a}"] [data-cel="cel_price"]`, all: true } }); }
}
// global
for (const c of A.GLOBAL) {
  if (c.rule === "fontFamilyAll") { work.push({ page: "pg_home", dev: "pc", run: "global", c }); addNeed("pg_home", "pc", { sel: { k: "alltext", sel: "body *", all: true } }); }
  else if (c.rule === "bodyAlignLeft") { for (const id of c.targets) { work.push({ page: pageOfEl(id), dev: "pc", run: "globalAlign", c, id }); addNeed(pageOfEl(id), "pc", { el: id }); } }
  else if (c.rule === "bgOrder") { work.push({ page: "pg_home", dev: "pc", run: "globalBg", c }); for (const [s] of c.order) addNeed("pg_home", "pc", { sec: s }); }
}

// ---- 測定 ----
const browser = await chromium.launch();
const measured = {}; // `${page}:${dev}` -> measurement
for (const [key, n] of Object.entries(need)) {
  const [page, dev] = key.split(":");
  const ctx = await browser.newContext({ viewport: { width: W[dev], height: 1000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  await ctx.route(/google\.com\/maps/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(path.join(distDir, fileFor(page))).href, { waitUntil: "load" });
  for (let i = 0; i < 40; i++) { const ok = await p.evaluate(() => { document.body.offsetHeight; const rf = parseFloat(getComputedStyle(document.documentElement).fontSize); return rf > 0 && rf < 15 && (!document.fonts || document.fonts.status === "loaded"); }); if (ok) break; await p.waitForTimeout(120); }
  await p.waitForTimeout(150);
  measured[key] = await p.evaluate(MEASURE, { els: [...n.els].filter(Boolean), secs: [...n.secs].filter(Boolean), sels: n.sels, gaps: n.gaps, arrows: n.arrows, iframes: n.iframes, pseudos: n.pseudos });
  await ctx.close();
}

// ==== fix02 §3：操作・スクリーンショットが要る照合（旧手動）====
const urlOf = (pid) => pathToFileURL(path.join(distDir, fileFor(pid))).href;
const RGBJS = "c=>{const m=(c||'').match(/[\\d.]+/g);return m?'#'+m.slice(0,3).map(x=>(+x).toString(16).padStart(2,'0')).join('').toUpperCase():null;}";
for (const c of A.INTERACTIVE) {
  if (c.kind === "scrollcolor") {
    const ctx = await browser.newContext({ viewport: { width: W.pc, height: 900 } }); await ctx.route(/google\.com\/maps/, (r) => r.abort());
    const p = await ctx.newPage(); await p.goto(urlOf("pg_home"), { waitUntil: "load" });
    await p.evaluate(() => window.scrollTo(0, 300)); await p.waitForTimeout(400);
    const r = await p.evaluate((rgbSrc) => { const rgb = eval(rgbSrc); const h = document.querySelector(".site-header"); const logo = document.querySelector('[data-el="el_logo"]'); const nav = document.querySelector('[data-el="el_nav"] .nav-row a'); return { scrolled: h.classList.contains("scrolled"), headerBg: rgb(getComputedStyle(h).backgroundColor), logo: rgb(getComputedStyle(logo).color), nav: rgb(getComputedStyle(nav).color) }; }, RGBJS);
    const fails = []; if (!r.scrolled) fails.push("scrolled クラスが付かない"); if (r.headerBg !== norm(c.checks.headerBg)) fails.push(`背景 期待${norm(c.checks.headerBg)} 実測${r.headerBg}`); if (r.logo !== norm(c.checks.logo)) fails.push(`ロゴ色 期待${norm(c.checks.logo)} 実測${r.logo}`); if (r.nav !== norm(c.checks.nav)) fails.push(`ナビ色 期待${norm(c.checks.nav)} 実測${r.nav}`);
    fails.length ? rec(c.id, "fail", `${c.id}: ${fails.join(" / ")}`) : rec(c.id, "pass"); await ctx.close();
  } else if (c.kind === "privacyheader") {
    const ctx = await browser.newContext({ viewport: { width: W.pc, height: 900 } }); const p = await ctx.newPage(); await p.goto(urlOf("pg_privacy"), { waitUntil: "load" });
    const r = await p.evaluate((rgbSrc) => { const rgb = eval(rgbSrc); const h = document.querySelector(".site-header"); const main = document.querySelector("main"); return { overlay: h.classList.contains("overlay"), headerBg: rgb(getComputedStyle(h).backgroundColor), mainTop: main.getBoundingClientRect().top }; }, RGBJS);
    const fails = []; if (r.overlay) fails.push("overlay クラスが付いている（重ねている）"); if (r.headerBg !== "#FFFFFF") fails.push(`背景 期待#FFFFFF 実測${r.headerBg}`); if (r.mainTop < 80) fails.push(`本体が上に食い込む（top=${round(r.mainTop)}）`);
    fails.length ? rec(c.id, "fail", `${c.id}: ${fails.join(" / ")}`) : rec(c.id, "pass"); await ctx.close();
  } else if (c.kind === "spmenu") {
    const ctx = await browser.newContext({ viewport: { width: W.sp, height: 800 } }); const p = await ctx.newPage(); await p.goto(urlOf("pg_home"), { waitUntil: "load" });
    await p.evaluate(() => { const d = document.querySelector(".el-nav .nav-sp"); if (d) d.open = true; }); await p.waitForTimeout(200);
    const r = await p.evaluate((rgbSrc) => { const rgb = eval(rgbSrc); const menu = document.querySelector(".el-nav .nav-menu"); const a = document.querySelector(".el-nav .nav-menu a"); if (!menu || !a) return null; const cs = getComputedStyle(a); return { bg: rgb(getComputedStyle(menu).backgroundColor), size: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) }; }, RGBJS);
    if (!r) rec(c.id, "notfound", `${c.id}: メニューなし`); else { const fails = []; if (r.bg !== norm(c.bg)) fails.push(`背景 期待${norm(c.bg)} 実測${r.bg}`); if (Math.abs(r.size - c.size) > 0.6) fails.push(`大きさ 期待${c.size} 実測${round(r.size)}`); if (Math.abs(r.lh - c.lh) > 1) fails.push(`行送り 期待${c.lh} 実測${round(r.lh)}`); fails.length ? rec(c.id, "fail", `${c.id}: ${fails.join(" / ")}`) : rec(c.id, "pass"); }
    await ctx.close();
  }
}
// A12-5/A12-6：CONTACT 背景の明るさ・コントラスト（スクリーンショットの画素）
for (const c of A.SCREENSHOT) {
  const ctx = await browser.newContext({ viewport: { width: W.pc, height: 900 } }); await ctx.route(/google\.com\/maps/, (r) => r.abort());
  const p = await ctx.newPage(); await p.goto(urlOf("pg_home"), { waitUntil: "load" });
  const el = await p.$(`[data-sec="${c.sec}"]`); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const shot = path.join(here, "..", "refs", "compare", `_speccheck_${c.sec}.jpg`); await el.screenshot({ path: shot }); await ctx.close();
  const py = `import numpy as np\nfrom PIL import Image\na=np.asarray(Image.open('${shot}').convert('RGB'),dtype=np.float64);H,Wd=a.shape[:2]\nl=0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2];m=np.ones((H,Wd),bool)\nm[int(.3*H):int(.8*H),int(.3*Wd):int(.7*Wd)]=False\nbg=l[m].mean()\ndef lin(x):\n c=x/255\n return ((c+0.055)/1.055)**2.4 if c>0.03928 else c/12.92\nct=(lin(255)+0.05)/(lin(bg)+0.05)\nprint(round(bg,1),round(ct,2))`;
  let bg = 0, ct = 0; try { const o = execSync(`python3 -c "${py.replace(/"/g, '\\"')}"`).toString().trim().split(/\s+/); bg = +o[0]; ct = +o[1]; } catch (e) { rec(c.id, "notfound", `${c.id}: 画素測定に失敗（${e.message.slice(0, 40)}）`); continue; }
  if (c.kind === "screenshotlum") { Math.abs(bg - c.refLum) <= c.tol ? rec(c.id, "pass") : rec(c.id, "fail", `${c.id}: 背景の明るさ ${bg}（参照元${c.refLum}±${c.tol}）`); }
  else { ct >= c.min ? rec(c.id, "pass") : rec(c.id, "fail", `${c.id}: コントラスト ${ct}（≥${c.min}）`); }
}
await browser.close();

// ---- 照合 ----
const fam = (f) => FONT_REGISTRY[f]?.family || f;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function checkText(m, c, dev, id, colorOverride) {
  const [size, lh] = c[dev]; const w = c.w; const ls = c.ls * size; const color = colorOverride || null;
  const label = `${dev} ${id}`;
  if (!m) { rec(c.id, "notfound", `${label}: 要素なし`); return; }
  const fails = [];
  if (m.font !== c.fam) fails.push(`書体 期待${c.fam} 実測${m.font}`);
  if (!near(m.size, size, SZTOL)) fails.push(`大きさ 期待${size} 実測${round(m.size)}`);
  if (m.lh != null && !near(m.lh, lh, LHTOL)) fails.push(`行送り 期待${lh} 実測${round(m.lh)}`);
  if (m.weight !== w) fails.push(`太さ 期待${w} 実測${m.weight}`);
  if (!near(m.ls, ls, 0.5)) fails.push(`字間 期待${round(ls)}px 実測${round(m.ls)}px`);
  if (color && m.color !== norm(color)) fails.push(`色 期待${norm(color)} 実測${m.color}`);
  if (fails.length) rec(c.id, "fail", `${label}: ${fails.join(" / ")}`); else rec(c.id, "pass");
}
function checkBox(m, c) {
  // フラグ: hOnly=高さのみ / xwOnly=x,w のみ / xwhOnly=x,w,h（y を照合しない）/ 既定=x,y,w,h
  const label = `${c.dev} ${c.target}`;
  if (!m) { rec(c.id, "notfound", `${label}: 要素なし`); return; }
  const fails = [];
  const isText = site.elements[c.target]?.type === "text";
  const doX = c.x != null && !c.hOnly;
  const doY = c.y != null && !c.hOnly && !c.xwOnly && !c.xwhOnly;
  const doW = c.w != null && !c.hOnly;
  const doH = c.h != null && !c.xwOnly && !isText; // 文字の箱の高さは中身に合わせる（照合しない）
  const yv = c.pageY ? m.pageY : m.y;
  if (doX && !near(m.x, c.x, POS)) fails.push(`x 期待${c.x} 実測${round(m.x)}`);
  if (doY && !near(yv, c.y, POS)) fails.push(`${c.pageY ? "ページy" : "y"} 期待${c.y} 実測${round(yv)}`);
  if (doW && !near(m.w, c.w, SIZE)) fails.push(`幅 期待${c.w} 実測${round(m.w)}`);
  if (doH && !near(m.h, c.h, SIZE)) fails.push(`高さ 期待${c.h} 実測${round(m.h)}`);
  if (fails.length) rec(c.id, "fail", `${label}: ${fails.join(" / ")}`); else rec(c.id, "pass");
}
function checkLine(m, secBg, c) {
  const label = `${c.target}`;
  if (!m) { rec(c.id, "notfound", `${label}: 要素なし`); return; }
  const fails = [];
  if (c.border) {
    if (!near(m.bw, c.w, 0.6)) fails.push(`枠線の太さ 期待${c.w} 実測${round(m.bw)}`);
    if (norm(c.color) !== m.bc) fails.push(`枠線の色 期待${norm(c.color)} 実測${m.bc}`);
    if (c.radius != null && !near(m.br, c.radius, 2)) fails.push(`角丸 期待${c.radius} 実測${round(m.br)}`);
    if (c.bg && m.bg !== norm(c.bg)) fails.push(`地の色 期待${norm(c.bg)} 実測${m.bg}`);
  } else {
    if (!near(m.h, c.w, 1)) fails.push(`太さ 期待${c.w} 実測${round(m.h)}`);
    if (m.bgAlpha === 0) fails.push(`線が見えない（背景 透明）`);
    else if (m.bg !== norm(c.color)) fails.push(`色 期待${norm(c.color)} 実測${m.bg}`);
    if (secBg && m.bg === secBg && m.bgAlpha >= 1) fails.push(`背景と同じ色の線`);
  }
  if (fails.length) rec(c.id, "fail", `${label}: ${fails.join(" / ")}`); else rec(c.id, "pass");
}

for (const w of work) {
  const M = measured[`${w.page}:${w.dev}`]; if (!M) continue;
  if (w.run === "text") checkText(M.el[w.id], w.c, w.dev, w.id, w.color);
  else if (w.run === "seltext") { const m = M.sel[w.k]; const c = w.c; if (!m) { rec(c.id, "notfound", `${w.dev} ${c.id}: 該当なし`); continue; }
    const size = (c[w.dev] || c.pc)[0], lh = (c[w.dev] || c.pc)[1]; const fails = [];
    if (m.font !== c.fam) fails.push(`書体 期待${c.fam} 実測${m.font}`);
    if (!near(m.size, size, SZTOL)) fails.push(`大きさ 期待${size} 実測${round(m.size)}`);
    if (lh && m.lh != null && !near(m.lh, lh, LHTOL)) fails.push(`行送り 期待${lh} 実測${round(m.lh)}`);
    if (m.weight !== c.w) fails.push(`太さ 期待${c.w} 実測${m.weight}`);
    if (c.c && m.color !== norm(c.c)) fails.push(`色 期待${norm(c.c)} 実測${m.color}`);
    if (fails.length) rec(c.id, "fail", `${w.dev} ${c.id}: ${fails.join(" / ")}`); else rec(c.id, "pass");
  }
  else if (w.run === "box") checkBox(M.el[w.c.target] || M.sec[w.c.target], w.c);
  else if (w.run === "line") { const secId = site.elements[w.c.target]?.section; checkLine(M.el[w.c.target], M.sec[secId]?.bg, w.c); }
  else if (w.run === "relation") {
    const c = w.c;
    if (c.rel === "vCenterEq") { const ph = M.el[c.a]; const h1 = M.el[c.b === "block1text" ? "el_feath1" : "el_feath2"]; const b1 = M.el[c.b === "block1text" ? "el_featb1" : "el_featb2"];
      if (!ph || !h1 || !b1) rec(c.id, "notfound", `${c.id}: 要素なし`);
      else { const textC = (h1.y + (b1.y + b1.h)) / 2; const photoC = ph.y + ph.h / 2 + (c.offset || 0); near(textC, photoC, REL) ? rec(c.id, "pass") : rec(c.id, "fail", `${c.id}: 文字中央${round(textC)} 目標(写真中央${c.offset ? c.offset : ""})${round(photoC)} 差${round(Math.abs(textC - photoC))}`); }
    } else if (c.rel === "topEq") { const a = M.el[c.a], bb = M.el[c.b]; if (!a || !bb) rec(c.id, "notfound", `${c.id}: 要素なし`); else near(a.y, bb.y, REL) ? rec(c.id, "pass") : rec(c.id, "fail", `${c.id}: ${c.a}.y=${round(a.y)} ${c.b}.y=${round(bb.y)} 差${round(Math.abs(a.y - bb.y))}`); }
    else if (c.rel === "cardPriceTopEq") { const arr = M.sel.cardprices; if (!arr || !arr.length) rec(c.id, "notfound", `${c.id}: 価格セルなし`); else { const tops = arr.map((x) => x.pageY); const spread = Math.max(...tops) - Math.min(...tops); spread <= REL ? rec(c.id, "pass") : rec(c.id, "fail", `${c.id}: 価格の上端がずれ ${round(spread)}px（${tops.map(round).join(",")}）`); } }
  }
  else if (w.run === "iframe") { const m = M.iframe[w.k]; if (!m) { rec(w.c.id, "notfound", `${w.c.id}: iframe なし`); continue; }
    const fails = [];
    if (w.c.srcIncludes && !m.src.includes(w.c.srcIncludes)) fails.push(`src に ${w.c.srcIncludes} が無い`);
    if (w.c.noLazy && m.loading === "lazy") fails.push(`loading=lazy（実ブラウザで読み込まれない）`);
    fails.length ? rec(w.c.id, "fail", `${w.c.id}: ${fails.join(" / ")}`) : rec(w.c.id, "pass");
  }
  else if (w.run === "alpha") { const m = M.el[w.c.target]; if (!m) { rec(w.c.id, "notfound", `${w.c.id}: 要素なし`); continue; } const fails = []; if (Math.abs(m.bgAlpha - w.c.alpha) > 0.1) fails.push(`不透明度 期待${w.c.alpha} 実測${round(m.bgAlpha)}`); if (w.c.rgb && m.bg !== norm(w.c.rgb)) fails.push(`色 期待${norm(w.c.rgb)} 実測${m.bg}`); fails.length ? rec(w.c.id, "fail", `${w.dev} ${w.c.id}: ${fails.join(" / ")}`) : rec(w.c.id, "pass"); }
  else if (w.run === "secbg") { const m = M.sec[w.s]; const exp = w.c.targets.find(([s]) => s === w.s)[1]; if (!m) { rec(w.c.id, "notfound", `${w.c.id}: ${w.s}なし`); continue; } m.bg === norm(exp) ? rec(w.c.id, "pass") : rec(w.c.id, "fail", `${w.c.id}: ${w.s} 期待${norm(exp)} 実測${m.bg}`); }
  else if (w.run === "navgeom") { const arr = M.sel[w.k]; if (!arr || !arr.length) { rec(w.c.id, "notfound", `${w.c.id}: ナビ項目なし`); continue; }
    const fails = []; const right = Math.max(...arr.map((a) => a.x + a.w));
    if (Math.abs(right - w.c.rightEdge) > POS) fails.push(`右端 期待${w.c.rightEdge} 実測${round(right)}`);
    const sorted = arr.slice().sort((a, b) => a.x - b.x); const gaps = sorted.slice(1).map((a, i) => a.x - (sorted[i].x + sorted[i].w));
    const badGap = gaps.filter((g) => Math.abs(g - w.c.gap) > POS); if (badGap.length) fails.push(`項目間隔 期待${w.c.gap} 実測[${gaps.map((g) => round(g)).join(",")}]`);
    fails.length ? rec(w.c.id, "fail", `${w.c.id}: ${fails.join(" / ")}`) : rec(w.c.id, "pass"); }
  else if (w.run === "writing") { const m = M.el[w.c.target]; if (!m) { rec(w.c.id, "notfound", `${w.c.id}: 要素なし`); continue; } (m.writingMode || "").includes(w.c.mode) ? rec(w.c.id, "pass") : rec(w.c.id, "fail", `${w.c.id}: writing-mode 期待${w.c.mode} 実測${m.writingMode}`); }
  else if (w.run === "borderline") { const m = M.sel[w.k]; if (!m) { rec(w.c.id, "notfound", `${w.c.id}: 要素なし`); continue; } const fails = [];
    if (w.asBg) { if (m.bg !== norm(w.c.color)) fails.push(`色 期待${norm(w.c.color)} 実測${m.bg}`); }
    else { if (w.c.width && Math.abs(m.btWidth - w.c.width) > 0.6) fails.push(`線の太さ 期待${w.c.width} 実測${round(m.btWidth)}`); if (m.btColor !== norm(w.c.color)) fails.push(`線の色 期待${norm(w.c.color)} 実測${m.btColor}`); }
    fails.length ? rec(w.c.id, "fail", `${w.dev} ${w.c.id}: ${fails.join(" / ")}`) : rec(w.c.id, "pass"); }
  else if (w.run === "pseudo") { const m = M.pseudo[w.k]; if (!m) { rec(w.c.id, "notfound", `${w.c.id}: 疑似要素なし`); continue; } const fails = [];
    if (w.c.content != null && m.content !== w.c.content) fails.push(`内容 期待"${w.c.content}" 実測"${m.content}"`);
    if (w.c.w != null && Math.abs(m.w - w.c.w) > SIZE) fails.push(`幅 期待${w.c.w} 実測${round(m.w)}`);
    if (w.c.h != null && Math.abs(m.h - w.c.h) > SIZE) fails.push(`高さ 期待${w.c.h} 実測${round(m.h)}`);
    fails.length ? rec(w.c.id, "fail", `${w.c.id}: ${fails.join(" / ")}`) : rec(w.c.id, "pass"); }
  else if (w.run === "gap") { const arr = M.gap[w.k]; if (!arr) { rec(w.c.id, "notfound", `${w.dev} ${w.c.id}: 段落が2つ未満`); continue; } const bad = arr.filter((g) => Math.abs(g - w.c.gap) > SIZE); bad.length ? rec(w.c.id, "fail", `${w.dev} ${w.c.id}: 段落の間隔 期待${w.c.gap} 実測[${arr.join(",")}]`) : rec(w.c.id, "pass"); }
  else if (w.run === "arrow") { const m = M.arrow[w.k]; if (!m) { rec(w.c.id, "notfound", `${w.dev} ${w.c.id}: ピルなし`); continue; }
    const fails = []; const rightGap = m.pillRight - m.arrowRight;
    if (m.arrowText !== "›") fails.push(`最後のspanが「›」でない（"${m.arrowText}"）`);
    if (Math.abs(rightGap - w.c.rightGap) > POS) fails.push(`› 右からの距離 期待${w.c.rightGap} 実測${round(rightGap)}`);
    if (Math.abs(m.arrowMidY - m.pillMidY) > POS) fails.push(`› 縦中央 ずれ${round(Math.abs(m.arrowMidY - m.pillMidY))}`);
    fails.length ? rec(w.c.id, "fail", `${w.dev} ${w.c.id}: ${fails.join(" / ")}`) : rec(w.c.id, "pass");
  }
  else if (w.run === "global") { const arr = M.sel.alltext || []; const bad = arr.filter((n) => n.font && !w.c.allow.includes(n.font) && n.size > 0); bad.length ? rec(w.c.id, "fail", `${w.c.id}: 許可外の書体 ${[...new Set(bad.map((x) => x.font))].slice(0, 5).join(",")}`) : rec(w.c.id, "pass"); }
  else if (w.run === "globalAlign") { const m = M.el[w.id]; if (!m) rec(w.c.id, "notfound", `${w.id}なし`); else (m.align === "left" || m.align === "start") ? rec(w.c.id, "pass") : rec(w.c.id, "fail", `${w.c.id}: ${w.id} align=${m.align}`); }
  else if (w.run === "globalBg") { const c = w.c; const seq = c.order.map(([s, exp]) => { const m = M.sec[s]; return { s, exp, got: exp === "photo" ? (m ? "photo?" : "なし") : (m ? m.bg : "なし") }; }); const fails = seq.filter((x) => x.exp !== "photo" && x.got !== norm(x.exp)); fails.length ? rec(c.id, "fail", `${c.id}: 背景順 ${fails.map((f) => `${f.s}期待${f.exp}実測${f.got}`).join(" / ")}`) : rec(c.id, "pass"); }
}

// manual 行を結果に登録
for (const m of A.MANUAL) results[m.id] = { status: "manual", details: [m.reason] };

// ---- 集計 ----
const appendixIds = new Set([
  ...A.TEXT, ...A.NAVTEXT, A.LABELKEY, ...A.CELTEXT, ...A.BOX, ...A.HEADERH, ...A.LINE_CHECKS,
  ...A.GAP, ...A.ARROW, ...A.IFRAME, ...A.RELATION, ...A.GLOBAL,
  ...A.ALPHA, ...A.SECBG, ...A.NAVGEOM, ...A.WRITING, ...A.CELPSEUDO, ...A.BORDERLINE, ...A.SELTEXT2, ...A.CELLINE,
  ...A.INTERACTIVE, ...A.SCREENSHOT,
].map((x) => x.id).concat(A.MANUAL.map((x) => x.id)));
let pass = 0, fail = 0, notfound = 0, manual = 0;
const failList = [];
for (const aid of appendixIds) {
  const r = results[aid];
  if (!r) { notfound++; failList.push(`${aid}: 未実行`); continue; }
  if (r.status === "manual") { manual++; continue; }
  if (r.status === "pass") pass++;
  else if (r.status === "notfound") { notfound++; failList.push(...r.details); }
  else { fail++; failList.push(...r.details); }
}
const total = appendixIds.size;

// expected.json を書き出す（付録 A の解決値 ＋ 手動一覧 ＋ 旧 baseline のメモ）
const expectedOut = {
  note: "付録 A（appendixA.mjs）を種類ごとの仕組みで照合。旧来の自動生成（site.json 由来）は baseline として下に残すが、重複は付録 A を優先する。",
  appendixResults: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { status: v.status, details: v.details }])),
  manual: A.MANUAL,
};
fs.mkdirSync(path.join(here, "..", "templates", "wa-01"), { recursive: true });
fs.writeFileSync(path.join(here, "..", "templates", "wa-01", "expected.json"), JSON.stringify(expectedOut, null, 2) + "\n");

console.log(`spec-check（付録 A）：総数 ${total}／合格 ${pass}／不合格 ${fail}／要素が見つからない ${notfound}／手動 ${manual}`);
if (failList.length) { console.log("― 不合格・見つからない ―"); for (const f of failList) console.log("  " + f); }
if (manual) { console.log("― 手動（自動照合できない行）―"); for (const m of A.MANUAL) console.log(`  ${m.id}: ${m.reason}`); }
process.exit(fail + notfound > 0 ? 1 : 0);
