// D2：公開ページは、プレビューと同じ形（±0.5px）。PC 1440・1280・1024、スマホ 390・360・430。文字の折り返しも同じ。
// 芦屋堂の見本と、手直しをした下書き（文字の書き換え・写真の差し替えと見せる範囲・部品の移動・セクションの複製・品の追加・リンク）で。
//
//   npm run build:editor
//   flock <scratchpad>/browser.lock node --test packages/core/publish/test/same-shape.test.mjs
//   （EDITOR_HTML=… で編集画面の HTML を変えられる。書き出した一式は apps/editor/dist/publish/<場面>/ に置く）
//
// 公開ページは、作った一式を「お店のアドレス」（https://ashiyado.mikke.test）の答えとして Playwright で配る（page.route）。
// HTML・CSS・/_mikke/site.js・写真（samples/ashiyado/media・まだ上げていない写真は meta.localAssets）を手元のファイルから返し、
// 答えには公開ページと同じ CSP を付ける（apps/api/README.md）。/style.css のような「/」から始まる道があるので file:// では開けない。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkHtml } from "../../../../apps/api/src/lib/htmlcheck.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../../..");
const EDITOR = process.env.EDITOR_HTML || path.join(ROOT, "apps/editor/dist/editor_single.html");
const OUT = path.join(ROOT, "apps/editor/dist/publish");
const ORIGIN = "https://ashiyado.mikke.test";
const ASSETS = JSON.parse(fs.readFileSync(path.join(ROOT, "samples/ashiyado/assets.json"), "utf8")).assets;
const SITE_JS = fs.readFileSync(path.join(here, "../site.js"), "utf8");
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-src https://www.google.com; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'";
const TOL = 0.5;

const { chromium } = await import("playwright");

const VIEWPORTS = [
  { name: "pc1440", device: "pc", opts: { viewport: { width: 1440, height: 900 } } },
  { name: "pc1280", device: "pc", opts: { viewport: { width: 1280, height: 800 } } },
  { name: "pc1024", device: "pc", opts: { viewport: { width: 1024, height: 768 } } },
  { name: "sp390", device: "sp", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: "sp360", device: "sp", opts: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: "sp430", device: "sp", opts: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
];

// 手直しをした下書き（編集画面の窓口で操作を流す）
async function applyEdits(page) {
  await page.evaluate(async () => {
    const api = window.__playground;
    api.setDevice("pc");
    api.edit("F_h0", "季節の上生菓子と、朝に炊く餡のはなし");                       // 文字の書き換え（折り返しが変わる長さ）
    const f = await PG.quadFile("q.jpg", 1600, 1000);
    const r = await PG.replacePhotoFile("F_p0", f); if (!r.ok) throw new Error("写真の差し替えに失敗");   // 写真の差し替え（まだ上げていない写真）
    PG.commit({ t: "view", id: "F_p0", device: "pc", x: 0.3, y: 0.62, zoom: 1.8 });   // 見せる範囲
    PG.commit({ t: "view", id: "F_p1", device: "sp", x: 0.7, y: 0.4, zoom: 2.2 });
    api.nudge("F_lbl", 40, 12);                                                      // 部品の移動（PC）
    api.setDevice("sp"); api.nudge("F_h", -10, 20); api.setDevice("pc");             // 部品の移動（スマホ）
    PG.setPartLinkCommitted("F_b0", 0, 4, { kind: "page", page: "pg_menu" });         // 文の一部のリンク
    api.sectionDuplicate("feature");                                                 // セクションの複製
    const spec = api.curSpec("I_cards"); const shop = api.shop();
    const cat = Object.keys(shop.catalog.categories).find((c) => shop.catalog.categories[c].menuId === spec.menu);
    api.cardsAddNew("I_cards", cat);                                                 // 品の追加
  });
}

// 文字の行：文字ごとの箱の上端で行を分ける
const LINES_FN = `(el) => { const out = []; let cur = "", top = null; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const rg = document.createRange();
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue; for (let i = 0; i < t.length; i++) {
    rg.setStart(n, i); rg.setEnd(n, i + 1); const rs = rg.getClientRects(); if (!rs.length) { cur += t[i]; continue; }
    const y = rs[0].top; if (top !== null && Math.abs(y - top) > 2 && !/\\s/.test(t[i])) { out.push(cur); cur = ""; } if (top === null || !/\\s/.test(t[i])) top = (top === null || Math.abs(y - top) > 2) ? y : top; cur += t[i]; } }
  if (cur) out.push(cur); return out.map((s) => s.replace(/\\s+$/, "")); }`;

async function measurePreview(page, pageId) {
  return page.evaluate(({ pageId, LINES_FN }) => {
    const lines = eval(LINES_FN);
    PG.setPage(pageId); PG.paintPhotos();
    const k = PG.getScale(); const secs = [];
    const assetOf = {}; for (const p of PG.photosApi()) assetOf[p.part] = p.asset;
    const px = (v) => { const m = /^(-?[\d.]+)px$/.exec(v || ""); return m ? +m[1] : null; };
    for (const host of document.querySelectorAll("#sectionwrap .host")) {
      const s = host.querySelector("#sec"); if (!s) continue; const sr = s.getBoundingClientRect(); const els = {};
      for (const el of s.querySelectorAll("[data-el]")) { const r = el.getBoundingClientRect(); const id = el.getAttribute("data-el"); els[id] = { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k, lines: el.getAttribute("data-kind") === "text" ? lines(el) : null };
        if (el.getAttribute("data-kind") === "photo" && assetOf[id]) { const bs = el.style.backgroundSize.split(" "), bp = el.style.backgroundPosition.split(" "); els[id].photo = { asset: assetOf[id], x: px(bp[0]), y: px(bp[1]), w: px(bs[0]), h: px(bs[1]) }; } }
      secs.push({ id: host.id.replace(/^host_/, ""), h: sr.height / k, els });
    }
    return { scale: k, secs };
  }, { pageId, LINES_FN });
}
async function measurePublished(page) {
  return page.evaluate(({ LINES_FN }) => {
    const lines = eval(LINES_FN);
    const dev = [...document.querySelectorAll(".mk-dev")].find((d) => getComputedStyle(d).display !== "none");
    const pg = dev.querySelector(".mk-page"); const device = dev.classList.contains("mk-sp") ? "sp" : "pc";
    const k = pg.getBoundingClientRect().width / (device === "sp" ? 390 : 1440); const secs = [];
    for (const s of pg.querySelectorAll(":scope > .mk-sec")) {
      const sr = s.getBoundingClientRect(); const els = {};
      for (const el of s.querySelectorAll("[data-el]")) { const r = el.getBoundingClientRect(); const id = el.getAttribute("data-el"); els[id] = { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k, lines: el.getAttribute("data-kind") === "text" ? lines(el) : null };
        const im = el.getAttribute("data-kind") === "photo" ? el.querySelector("img") : null;
        if (im) { const ir = im.getBoundingClientRect(); const m = /\/media\/([^/]+)\//.exec(im.getAttribute("src") || ""); els[id].photo = { asset: m ? m[1] : null, x: (ir.left - r.left) / k, y: (ir.top - r.top) / k, w: ir.width / k, h: ir.height / k }; } }
      secs.push({ id: s.id.replace(/^mk-(pc|sp)-/, ""), h: sr.height / k, els });
    }
    const docW = document.documentElement.scrollWidth, vw = document.documentElement.clientWidth;
    const imgs = [...dev.querySelectorAll("img")].map((im) => ({ ok: im.complete && im.naturalWidth > 0, src: im.currentSrc }));
    return { device, scale: k, secs, docW, vw, imgs };
  }, { LINES_FN });
}

function compare(prev, pub, label) {
  const bad = [];
  const ids = (x) => x.secs.map((s) => s.id).join(",");
  if (ids(prev) !== ids(pub)) bad.push(`${label}：セクションの並びが違う ${ids(prev)} ／ ${ids(pub)}`);
  let maxD = 0, nEl = 0, nText = 0, nPhoto = 0;
  for (const ps of prev.secs) {
    const qs = pub.secs.find((s) => s.id === ps.id); if (!qs) continue;
    if (Math.abs(ps.h - qs.h) > TOL) bad.push(`${label} ${ps.id}：セクションの高さ ${ps.h.toFixed(2)} ／ ${qs.h.toFixed(2)}`);
    for (const [id, a] of Object.entries(ps.els)) {
      const b = qs.els[id]; if (!b) { bad.push(`${label} ${ps.id}：${id} が公開ページに無い`); continue; }
      nEl++;
      for (const f of ["x", "y", "w", "h"]) { const d = Math.abs(a[f] - b[f]); maxD = Math.max(maxD, d); if (d > TOL) bad.push(`${label} ${id}.${f} ${a[f].toFixed(2)} ／ ${b[f].toFixed(2)}`); }
      if (a.photo) { nPhoto++; if (!b.photo) bad.push(`${label} ${id}：公開ページに写真が無い`); else { if (a.photo.asset !== b.photo.asset) bad.push(`${label} ${id}：写真が違う ${a.photo.asset} ／ ${b.photo.asset}`);
        for (const f of ["x", "y", "w", "h"]) { if (a.photo[f] == null) { bad.push(`${label} ${id}：プレビューの見せる範囲が測れない`); break; } const d = Math.abs(a.photo[f] - b.photo[f]); maxD = Math.max(maxD, d); if (d > TOL) bad.push(`${label} ${id} 見せる範囲.${f} ${a.photo[f].toFixed(2)} ／ ${b.photo[f].toFixed(2)}`); } } }
      else if (b.photo) bad.push(`${label} ${id}：プレビューに無い写真が公開ページにある`);
      if (a.lines) { nText++; if (JSON.stringify(a.lines) !== JSON.stringify(b.lines)) bad.push(`${label} ${id}：折り返しが違う ${JSON.stringify(a.lines)} ／ ${JSON.stringify(b.lines)}`); }
    }
    for (const id of Object.keys(qs.els)) if (!ps.els[id]) bad.push(`${label} ${ps.id}：${id} がプレビューに無い`);
  }
  return { bad, maxD, nEl, nText, nPhoto };
}

function routeSite(context, bundle) {
  return context.route(ORIGIN + "/**", async (route) => {
    const u = new URL(route.request().url()); let p = decodeURIComponent(u.pathname);
    const head = { "content-security-policy": CSP };
    if (p !== "/" && p.endsWith("/")) p = p.slice(0, -1);
    if (bundle.pages[p] != null && p !== "/404") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", headers: head, body: bundle.pages[p] });
    if (p === "/style.css") return route.fulfill({ status: 200, contentType: "text/css; charset=utf-8", headers: head, body: bundle.css });
    if (p === "/_mikke/site.js") return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", headers: head, body: SITE_JS });
    if (p === "/sitemap.xml" || p === "/robots.txt") return route.fulfill({ status: 200, contentType: p.endsWith("xml") ? "application/xml" : "text/plain", body: bundle.files[p.slice(1)] });
    const m = /^\/media\/([A-Za-z0-9_]+)(?:\/(\d+)\.(webp|jpg))?$/.exec(p);
    if (m) {
      const id = m[1];
      if (ASSETS[id]) return route.fulfill({ status: 200, contentType: ASSETS[id].file.mime, headers: head, body: fs.readFileSync(path.join(ROOT, "samples/ashiyado/media", ASSETS[id].file.key)) });
      const local = bundle.meta.localAssets && bundle.meta.localAssets[id];
      if (local) { const mm = /^data:([^;]+);base64,(.*)$/.exec(local); return route.fulfill({ status: 200, contentType: mm[1], headers: head, body: Buffer.from(mm[2], "base64") }); }
    }
    return route.fulfill({ status: 404, contentType: "text/html; charset=utf-8", headers: head, body: bundle.pages["/404"] || "not found" });
  });
}
// Google Fonts はこの環境では届かないので、両方とも同じく止める（編集画面も公開ページも同じ書体の代わりで描く）
const blockFonts = (ctx) => ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

async function openEditor(browser, vp, edited) {
  const ctx = await browser.newContext(vp.opts); await blockFonts(ctx);
  const page = await ctx.newPage();
  await page.goto("file://" + EDITOR);
  await page.waitForFunction(() => window.__playground && document.querySelector("#sectionwrap .host #sec"));
  await page.evaluate(() => { window.__playground.reset(); });
  if (edited) await applyEdits(page);
  return { ctx, page };
}

const results = {};
const SCENES = [{ name: "sample", edited: false }, { name: "edited", edited: true }];

for (const scene of SCENES) {
  test(`D2 同じ形：${scene.name}`, async () => {
    const browser = await chromium.launch();
    try {
      const allBad = []; const summary = [];
      for (const vp of VIEWPORTS) {
        const { ctx, page } = await openEditor(browser, vp, scene.edited);
        if (vp.device === "sp") await page.evaluate(() => window.__playground.setDevice("sp")); else await page.evaluate(() => window.__playground.setDevice("pc"));
        const bundle = await page.evaluate((assets) => window.__playground.buildPublishBundle({ assets, origin: "https://ashiyado.mikke.test" }), ASSETS);
        if (vp.name === "pc1440") {
          const dir = path.join(OUT, scene.name); fs.mkdirSync(dir, { recursive: true });
          for (const [p, h] of Object.entries(bundle.pages)) fs.writeFileSync(path.join(dir, (p === "/" ? "index" : p.slice(1)) + ".html"), h);
          fs.writeFileSync(path.join(dir, "style.css"), bundle.css);
          for (const [f, c] of Object.entries(bundle.files)) fs.writeFileSync(path.join(dir, f), c);
          fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ ...bundle.meta, localAssets: Object.keys(bundle.meta.localAssets || {}) }, null, 2));
          // API の検査（apps/api の checkHtml そのもの）に通る
          for (const [p, h] of Object.entries(bundle.pages)) assert.deepEqual(checkHtml(h), [], `${scene.name} ${p} が API の HTML の検査に通らない`);
          results[scene.name] = bundle;
        }
        await page.evaluate(() => PG.enterPreview());
        const pub = await ctx.newPage(); await routeSite(ctx, bundle);
        await pub.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
        const errs = []; pub.on("pageerror", (e) => errs.push(String(e)));
        for (const pg of [{ id: "pg_home", slug: "/" }, { id: "pg_menu", slug: "/menu" }, { id: "pg_contact", slug: "/contact" }]) {
          const prev = await measurePreview(page, pg.id);
          await pub.goto(ORIGIN + pg.slug); await pub.waitForLoadState("load");
          await pub.waitForFunction(() => [...document.images].filter((i) => getComputedStyle(i.closest(".mk-dev")).display !== "none").every((i) => i.complete));
          const got = await measurePublished(pub);
          const label = `${scene.name} ${vp.name} ${pg.slug}`;
          if (got.device !== vp.device) allBad.push(`${label}：見えている配置が ${got.device}`);
          const c = compare(prev, got, label); allBad.push(...c.bad);
          if (vp.device === "sp" && Math.abs(prev.scale - got.scale) > 0.001) allBad.push(`${label}：倍率 プレビュー ${prev.scale} ／ 公開 ${got.scale}`);
          if (got.docW > got.vw + 0.5 && !(vp.device === "sp" && got.scale <= 0.82)) allBad.push(`${label}：横にはみ出す（${got.docW} > ${got.vw}）`);
          const brokenImg = got.imgs.filter((i) => !i.ok); if (brokenImg.length) allBad.push(`${label}：写真が出ない ${brokenImg.map((i) => i.src).join(" ")}`);
          const csp = await pub.evaluate(() => window.__csp.filter((v) => !/fonts\.g/.test(v)));
          if (csp.length) allBad.push(`${label}：CSP に止められた ${csp.join(" / ")}`);
          summary.push(`${label}：部品 ${c.nEl}・文字 ${c.nText}・写真 ${c.nPhoto}・いちばん大きいずれ ${c.maxD.toFixed(3)}px・倍率 ${got.scale.toFixed(4)}`);
        }
        if (errs.length) allBad.push(`${scene.name} ${vp.name}：公開ページのエラー ${errs.join(" / ")}`);
        await ctx.close();
      }
      console.log(summary.join("\n"));
      assert.deepEqual(allBad.slice(0, 40), [], allBad.length + " 件の違い");
    } finally { await browser.close(); }
  });
}
