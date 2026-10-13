import { chromium } from "playwright";
import path from "node:path";
const url = "file://" + path.resolve("refs/compare/layout/playground20_single.html");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1500, height: 4000 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", e => errs.push(String(e)));
p.on("console", m => { if (m.type() === "error") errs.push("console:" + m.text()); });
await p.goto(url); await p.waitForTimeout(700);

// entrypoints
const have = await p.evaluate(() => Object.keys(window.__playground));
console.log("has photos:", have.includes("photos"));
const ph0 = await p.evaluate(() => window.__playground.photos());
console.log("photos() sample keys:", JSON.stringify(Object.keys(ph0[0] || {})));
console.log("photos() has brightness/added:", ph0.every(x => "brightness" in x && "added" in x));

// run every K preset, report state
const names = Object.keys(await p.evaluate(() => window.__playground.presets())).filter(n => /^[KL]\d+$/.test(n));
for (const n of names) {
  try {
    await p.evaluate(nm => window.__playground.runPreset(nm), n);
    await p.waitForTimeout(120);
    const info = await p.evaluate(() => {
      const ph = window.__playground.photos();
      const g = window.__playground.geometry();
      const ops = window.__playground.ops();
      const added = ph.filter(x => x.added);
      const addedTxt = Object.keys(g).filter(k => /^add_/.test(k));
      return {
        nPhoto: ph.length, nAdded: added.length, nAddedTxt: addedTxt.length,
        bright: ph.filter(x => x.brightness).map(x => x.part + ":" + x.brightness),
        addedDims: added.map(a => { const e = g[a.part]; return e ? (a.part + " " + Math.round(e.w) + "x" + Math.round(e.h)) : a.part; }),
        nOps: ops.length,
        warnOverlaps: window.__playground.warnings().overlaps.length,
      };
    });
    console.log(n, JSON.stringify(info));
  } catch (e) { console.log(n, "ERR", String(e).slice(0, 120)); }
}
console.log("ERRORS:", errs.slice(0, 20));
await b.close();
