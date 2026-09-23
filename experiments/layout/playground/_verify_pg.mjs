// §5 の確認：playground_single.html の geometry() が、本線モデルの実測（compare と同じ経路）と ±0.5 で一致するか。
// + 許可外の外部読み込みが無いか。
import { chromium, webkit } from "playwright";
import path from "node:path";
import { baseContent } from "../lib/content.mjs";
import { makeContent } from "../scenarios/scenarios.mjs";
import { prepareTexts } from "../lib/text.mjs";
import { renderSection, closeBrowsers } from "../lib/browser.mjs";
import * as A from "../a-box/model.mjs";
import * as C from "../c-hybrid/model.mjs";
const MOD = { A, C };
const url = "file://" + path.resolve("refs/compare/layout/playground_single.html");

// Node 側の参照 geometry（compare と同じ render 経路）
async function nodeGeom(method, section, device, content, edits) {
  const m = MOD[method];
  const boxes = m.collectTextBoxes(content, device);
  if (edits.addText) boxes.push({ key: "I_added", styleName: "featBody", device, widthPx: edits.addText.w, text: edits.addText.text });
  const H = await prepareTexts(boxes);
  let e = edits;
  if (edits.addText) { const h = H.get("I_added"); e = { ...edits, addText: { ...edits.addText, html: h.html, height: h.height } }; }
  const out = (section === "feature" ? m.buildFeature : m.buildItems)(content, device, H, e);
  const r = await renderSection(out.bodyHtml, out.extraCss, device, { screenshot: false });
  return Object.fromEntries(r.els.map((x) => [x.id, x]));
}

const PRESETS = {
  E1: { section: "feature", content: () => makeContent("S1"), edits: () => ({ move: { F_h0: { dx: 12, dy: 8 } } }) },
  E2: { section: "feature", content: () => baseContent(), edits: () => ({ moveOut: { F_b0: { marker: "F_p0", gap: 24, x: 755 } } }) },
  E4: { section: "items", content: () => makeContent("S4"), edits: (d) => ({ addText: { marker: "I_divider", x: d === "pc" ? 56 : 20, y: d === "pc" ? 988 : 1727, w: d === "pc" ? 600 : 351, gap: 24, text: "季節により品が替わります" } }) },
  E5: { section: "feature", content: () => baseContent(), edits: () => ({ remove: ["F_p1"] }) },
  E8: { section: "feature", content: () => baseContent(), edits: () => ({ move: { F_h0: { dx: 12, dy: 8 } }, template: { headBody: 24 } }) },
};

const report = {};
for (const [dev, bt] of [["pc", chromium], ["sp", webkit]]) {
  const b = await bt.launch(); const p = await (await b.newContext()).newPage();
  const ext = []; p.on("request", (r) => { const u = r.url(); if (!/^(data:|file:|blob:)/.test(u) && !/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(u)) ext.push(u); });
  await p.goto(url); await p.waitForTimeout(500);
  for (let i = 0; i < 40; i++) { const ok = await p.evaluate(() => document.fonts.status === "loaded"); if (ok) break; await p.waitForTimeout(100); }
  for (const method of ["A", "C"]) {
    for (const [name, pr] of Object.entries(PRESETS)) {
      await p.evaluate((m) => window.__playground.setModel(m), method);
      await p.evaluate((d) => window.__playground.setDevice(d), dev);
      await p.evaluate(async (n) => { await window.__playground.applyOps(window.__playground.presets()[n]); }, name);
      await p.waitForTimeout(80);
      const pg = await p.evaluate(() => window.__playground.geometry());
      const ref = await nodeGeom(method, pr.section, dev, pr.content(), pr.edits(dev));
      let maxd = 0, worst = "";
      for (const id of Object.keys(ref)) {
        if (!pg[id]) { maxd = 999; worst = id + ":なし"; continue; }
        for (const f of ["x", "y", "w", "h"]) { const d = Math.abs(ref[id][f] - pg[id][f]); if (d > maxd) { maxd = d; worst = `${id}.${f} ref${ref[id][f]} pg${pg[id][f]}`; } }
      }
      report[`${method}-${name}-${dev}`] = { maxDiff: +maxd.toFixed(2), worst };
    }
  }
  report[`_ext_${dev}`] = [...new Set(ext)];
  await b.close();
}
await closeBrowsers();
console.log("=== §5.2 geometry 一致（±0.5）===");
for (const k of Object.keys(report)) if (!k.startsWith("_ext")) console.log(`  ${k}: 最大ずれ ${report[k].maxDiff}px ${report[k].maxDiff > 0.5 ? "✗ " + report[k].worst : "✓"}`);
console.log("=== §5.4 許可外の外部読み込み ===");
console.log("  pc:", report._ext_pc.length ? report._ext_pc : "（なし）");
console.log("  sp:", report._ext_sp.length ? report._ext_sp : "（なし）");
