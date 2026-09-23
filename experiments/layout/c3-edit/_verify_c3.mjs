// 5.1 の確認：新しい C（c3-edit）のテンプレ描画が、前回の新しいC（c3-edit）と ±0.5 で一致するか。
// G1（芦屋堂）・G2（clone 参照元）・付録B（S1〜S7）を C2 と C の両方で描き、共有する部品の x/y/w/h を突き合わせる。
// さらに G3（3エンジン×幅で 重なり0・はみ出し0・エンジン差≤2px）を C2 で回す。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseContent } from "../lib/content.mjs";
import { prepareTexts } from "../lib/text.mjs";
import { renderSection, closeBrowsers } from "../lib/browser.mjs";
import { DESIGN_W, FONT_URL, ROOT_VARS, setLineBreak } from "../lib/spec.mjs";
import { makeContent } from "../scenarios/scenarios.mjs";
import * as C from "../c2-select/model.mjs";
import * as C2 from "./model.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEVICES = ["pc", "sp"];

async function render(m, section, device, content, edits = {}) {
  const boxes = m.collectTextBoxes(content, device);
  const H = await prepareTexts(boxes);
  const out = (section === "feature" ? m.buildFeature : m.buildItems)(content, device, H, edits);
  const r = await renderSection(out.bodyHtml, out.extraCss, device, { screenshot: false });
  return { byId: Object.fromEntries(r.els.map((x) => [x.id, x])), warnings: r.warnings };
}

// C2 と C の共有部品を突き合わせ、最大ずれを返す（C2 だけにある F_hg/I_hg は除く）
function maxDiff(a, b) {
  let md = 0, worst = "";
  for (const id of Object.keys(b.byId)) {
    if (!a.byId[id]) continue;
    for (const f of ["x", "y", "w", "h"]) {
      const d = Math.abs(a.byId[id][f] - b.byId[id][f]);
      if (d > md) { md = d; worst = `${id}.${f} C=${b.byId[id][f]} C2=${a.byId[id][f]}`; }
    }
  }
  return { md: +md.toFixed(3), worst };
}

const report = { g1: {}, g2: {}, scenarios: {}, g3: {} };

// ---- G1（芦屋堂 base）----
for (const device of DEVICES) {
  for (const section of ["feature", "items"]) {
    const rC = await render(C, section, device, baseContent());
    const rC2 = await render(C2, section, device, baseContent());
    report.g1[`${section}-${device}`] = { ...maxDiff(rC2, rC), warnC2: rC2.warnings.overlaps.length + rC2.warnings.overflows.length };
  }
}

// ---- G2（clone 参照元 masked：改行規則オフ・geom 差し替え）----
{
  const { content } = JSON.parse(fs.readFileSync(path.join(here, "..", "_g2_target.json"), "utf8"));
  const g2edits = { geom: { sp: { interCard: 40, colGap: 40, cardsToDivider: 88 } } };
  setLineBreak(false);
  for (const device of DEVICES) {
    for (const [section, edits] of [["feature", {}], ["items", g2edits]]) {
      const rC = await render(C, section, device, content, edits);
      const rC2 = await render(C2, section, device, content, edits);
      report.g2[`${section}-${device}`] = { ...maxDiff(rC2, rC), warnC2: rC2.warnings.overlaps.length + rC2.warnings.overflows.length };
    }
  }
  setLineBreak(true);
}

// ---- 付録B（S1〜S7）----
for (const name of ["S1", "S1b", "S2", "S3", "S4", "S6b", "S7"]) {
  const section = ["S3", "S4", "S6b", "S7"].includes(name) ? "items" : "feature";
  for (const device of DEVICES) {
    const rC = await render(C, section, device, makeContent(name));
    const rC2 = await render(C2, section, device, makeContent(name));
    report.scenarios[`${name}-${device}`] = { ...maxDiff(rC2, rC), warnC2: rC2.warnings.overlaps.length + rC2.warnings.overflows.length };
  }
}

// ---- G3（3エンジン×幅で C2）----
async function renderScaled(bt, bodyHtml, extraCss, device, designW, scale = 1) {
  const browser = await bt.launch();
  const ctx = await browser.newContext({ viewport: { width: Math.ceil(designW * scale) + 4, height: 4000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  const wrap = scale === 1 ? bodyHtml : `<div style="transform:scale(${scale});transform-origin:top left">${bodyHtml}</div>`;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT_URL}">
<style>:root{font-size:10px;${ROOT_VARS.join("")}}*{margin:0;padding:0;box-sizing:border-box}#sec{position:relative;overflow:hidden}
.t{line-break:strict;word-break:normal;overflow-wrap:anywhere;white-space:normal}.t.lb{word-break:keep-all;overflow-wrap:anywhere}.t .nowrap{white-space:nowrap}
.photo{display:flex;align-items:center;justify-content:center;color:#fff;background:#8a8a8a}.line{background:var(--c-line)}
.row-lines{box-shadow:inset 0 1px 0 var(--c-line)}.row-lines .krow{box-shadow:inset 0 -1px 0 var(--c-line)}${extraCss || ""}</style></head><body>${wrap}</body></html>`;
  await page.setContent(html, { waitUntil: "load" });
  for (let i = 0; i < 60; i++) { const ok = await page.evaluate(() => { document.body.offsetHeight; return !document.fonts || document.fonts.status === "loaded"; }); if (ok) break; await page.waitForTimeout(80); }
  await page.waitForTimeout(120);
  const data = await page.evaluate((sc) => {
    const sec = document.getElementById("sec"); const sr = sec.getBoundingClientRect(); const R = (n) => Math.round(n / sc * 100) / 100;
    const els = [...sec.querySelectorAll("[data-el]")].map((el) => { const r = el.getBoundingClientRect(); return { id: el.getAttribute("data-el"), kind: el.getAttribute("data-kind") || "box", x: R(r.left - sr.left), y: R(r.top - sr.top), w: R(r.width), h: R(r.height) }; });
    return { els, secW: R(sr.width) };
  }, scale);
  await browser.close();
  const content = data.els.filter((e) => ["text", "photo", "pill"].includes(e.kind));
  const overlaps = []; for (let i = 0; i < content.length; i++) for (let j = i + 1; j < content.length; j++) { const a = content[i], b = content[j]; const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ox <= 1 || oy <= 1) continue; const contains = (p, q) => p.x <= q.x + 1 && p.y <= q.y + 1 && p.x + p.w >= q.x + q.w - 1 && p.y + p.h >= q.y + q.h - 1; if (contains(a, b) || contains(b, a)) continue; overlaps.push({ a: a.id, b: b.id }); }
  const overflows = content.filter((e) => e.x < -1 || e.x + e.w > data.secW + 1).map((e) => ({ id: e.id }));
  return { els: data.els, warnings: { overlaps, overflows } };
}
{
  const { chromium, webkit, firefox } = await import("playwright");
  const engines = { chromium, webkit, firefox };
  for (const [section, device] of [["feature", "pc"], ["items", "pc"], ["feature", "sp"], ["items", "sp"]]) {
    const H = await prepareTexts(C2.collectTextBoxes(baseContent(), device));
    const out = (section === "feature" ? C2.buildFeature : C2.buildItems)(baseContent(), device, H, {});
    const widths = device === "pc" ? [1440, 1024] : [390, 360];
    const perEngine = {}; let overlaps = 0, overflows = 0;
    for (const [ename, bt] of Object.entries(engines)) {
      const r = await renderScaled(bt, out.bodyHtml, out.extraCss, device, DESIGN_W[device]);
      perEngine[ename] = Object.fromEntries(r.els.map((e) => [e.id, e]));
      overlaps += r.warnings.overlaps.length; overflows += r.warnings.overflows.length;
    }
    let maxDrift = 0; const base = perEngine.chromium;
    for (const eng of ["webkit", "firefox"]) for (const id of Object.keys(base)) { const a = base[id], b = perEngine[eng][id]; if (!b) continue; maxDrift = Math.max(maxDrift, Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
    for (const w of widths.slice(1)) { const r = await renderScaled(chromium, out.bodyHtml, out.extraCss, device, DESIGN_W[device], w / DESIGN_W[device]); overlaps += r.warnings.overlaps.length; overflows += r.warnings.overflows.length; }
    report.g3[`${section}-${device}`] = { overlaps, overflows, maxDrift: +maxDrift.toFixed(2), pass: overlaps === 0 && overflows === 0 && maxDrift <= 2 };
  }
}

await closeBrowsers();

let allOk = true;
const line = (k, r) => { const ok = r.md <= 0.5 && r.warnC2 === 0; if (!ok) allOk = false; return `  ${k}: ずれ${r.md}px 警告${r.warnC2} ${ok ? "✓" : "✗ " + r.worst}`; };
console.log("=== 5.1 新しいC(c3-edit) vs 前回C(c-hybrid) ±0.5 ===");
console.log("[G1 芦屋堂]"); for (const k of Object.keys(report.g1)) console.log(line(k, report.g1[k]));
console.log("[G2 clone参照元]"); for (const k of Object.keys(report.g2)) console.log(line(k, report.g2[k]));
console.log("[付録B S1-S7]"); for (const k of Object.keys(report.scenarios)) console.log(line(k, report.scenarios[k]));
console.log("[G3 3エンジン×幅（C2 単体）]");
for (const k of Object.keys(report.g3)) { const r = report.g3[k]; if (!r.pass) allOk = false; console.log(`  ${k}: ${r.pass ? "PASS" : "FAIL"} (重${r.overlaps}/出${r.overflows}/エンジン差${r.maxDrift}px)`); }
console.log(allOk ? "\n=> 5.1 一致（全て ±0.5・G3 clean）" : "\n=> 5.1 不一致あり");
fs.writeFileSync(path.join(here, "_verify_c2.json"), JSON.stringify(report, null, 2));
