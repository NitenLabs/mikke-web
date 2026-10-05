import { chromium } from "playwright";
import path from "node:path";
const url = "file://" + path.resolve("refs/compare/layout/playground18b_single.html");
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 4000 } }); const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => { if (m.type() === "error") errs.push("console:" + m.text()); });
await p.goto(url); await p.waitForTimeout(600);
const need = ["reset", "setDevice", "geometry", "sections", "warnings", "anchors", "ops", "presets", "runPreset", "select", "edit", "resetScope", "undo", "redo", "layoutCount", "zOrder", "sizes", "guides", "photos", "cropState"];
const have = await p.evaluate(() => Object.keys(window.__playground));
console.log("API ok:", need.every(n => have.includes(n)), "| missing:", need.filter(n => !have.includes(n)), "| extra:", have.filter(n => !need.includes(n)));
await p.evaluate(() => window.__playground.reset()); await p.waitForTimeout(200);
const g = await p.evaluate(() => window.__playground.geometry());
console.log("geom keys:", Object.keys(g).length, "F_h0:", JSON.stringify(g.F_h0), "F_b0:", JSON.stringify(g.F_b0));
console.log("sections:", JSON.stringify(await p.evaluate(() => window.__playground.sections())));
console.log("layoutCount0:", await p.evaluate(() => window.__playground.layoutCount()));
try {
  await p.evaluate(() => window.__playground.runPreset("Q1")); await p.waitForTimeout(300);
  console.log("Q1 anchors:", JSON.stringify(await p.evaluate(() => window.__playground.anchors())));
  const g2 = await p.evaluate(() => window.__playground.geometry());
  console.log("Q1 F_h0:", JSON.stringify(g2.F_h0), "F_b0:", JSON.stringify(g2.F_b0));
} catch (e) { console.log("Q1 error:", String(e)); }
console.log("ERRORS:", errs.slice(0, 10));
await b.close();
