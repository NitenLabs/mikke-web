// §6（22d）履歴の板・見るだけの帯のスクショ。使い方: node _shots22d.mjs <single.html> <outdir>
import { chromium } from "playwright";
import path from "node:path";
const HTML = process.argv[2], OUT = process.argv[3] || ".";
const P = "window.__playground";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } });
const pg = await ctx.newPage();
await pg.goto("file://" + HTML);
await pg.waitForFunction("window.__playground && document.querySelector('#stage [data-el]')");
await pg.evaluate(`${P}.runPreset('W14')`); await pg.waitForTimeout(400);
await pg.click("#tHistory"); await pg.waitForTimeout(300);
await pg.screenshot({ path: path.join(OUT, "W14_history_panel.png") });
// W15: 古い版を見るだけ（帯）
const pubrows = await pg.evaluate("[...document.querySelectorAll('#historyPanel .hp-row')].filter(r=>r.dataset.hpKind==='published').map(r=>r.dataset.hpRow)");
await pg.evaluate(`[...document.querySelectorAll('#historyPanel .hp-row')].find(r=>r.dataset.hpRow==='${pubrows[pubrows.length-1]}').click()`); await pg.waitForTimeout(400);
await pg.screenshot({ path: path.join(OUT, "W15_viewing_band.png") });
console.log("wrote W14_history_panel.png, W15_viewing_band.png to", OUT);
await b.close();
