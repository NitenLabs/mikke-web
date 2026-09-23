// 5.2 の比較画像＋付いていく先の見せ方の画像を撮る。
// 各 P（P1〜P5・P7）を A と 新しい C で再現し、ステージを左右に並べて1枚に。付いていく先（青枠・点線・ラベル）も1枚撮る。
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
const url = "file://" + path.resolve("refs/compare/layout/playground2_single.html");
const OUT = path.resolve("refs/compare/layout/playground2");
fs.mkdirSync(OUT, { recursive: true });

const DID = {
  P1: "特集1の見出しを右12下8→本文3行増（S1）",
  P2: "見出し＋本文を囲んで選び下40→本文3行増（S1）",
  P3: "本文を写真の下24へ→本文増（S1）→見出し2行（S2）",
  P4: "区切り線の下24に文字を足す→品を4件に（S4）",
  P5: "特集1の写真を左60下40→本文3行増（S1）",
  P7: "見出しを右12下8→見出しと本文の間隔16→24",
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1520, height: 3000 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(url);
for (let i = 0; i < 40; i++) { const ok = await p.evaluate(() => document.fonts.status === "loaded"); if (ok) break; await p.waitForTimeout(100); }

async function shot(preset, model) {
  await p.evaluate(() => window.__playground.reset());
  await p.evaluate((m) => window.__playground.setModel(m), model);
  await p.evaluate(() => window.__playground.setDevice("pc"));
  await p.waitForTimeout(150);
  await p.evaluate((n) => window.__playground.runPreset(n), preset);
  await p.waitForTimeout(250);
  const buf = await p.locator("#stage").screenshot();
  return buf.toString("base64");
}
async function compose(panels, outPath) {
  const cells = panels.map((pan) => `<div style="flex:none;width:520px"><div style="font:13px/1.6 monospace;padding:4px 0">${pan.label}</div><img src="data:image/png;base64,${pan.png}" style="width:520px;display:block;border:1px solid #ccc"></div>`).join("");
  const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff"><div style="display:flex;gap:10px;padding:10px;align-items:flex-start">${cells}</div></body>`;
  const pg = await ctx.newPage(); await pg.setViewportSize({ width: 1120, height: 2600 });
  await pg.setContent(html, { waitUntil: "load" }); await pg.waitForTimeout(150);
  await (await pg.$("div")).screenshot({ path: outPath, type: "jpeg", quality: 82 });
  await pg.close();
}

for (const preset of Object.keys(DID)) {
  const a = await shot(preset, "A"); const c = await shot(preset, "C2");
  await compose([{ label: `方式A：${DID[preset]}`, png: a }, { label: `方式C（新）：${DID[preset]}`, png: c }], path.join(OUT, `${preset}.jpg`));
  console.log(`wrote ${preset}.jpg`);
}

// 付いていく先の見せ方（青枠・点線・ラベル）：C で P1 の後に見出しを選ぶ
await p.evaluate(() => window.__playground.reset());
await p.evaluate(() => window.__playground.setModel("C2"));
await p.evaluate(() => window.__playground.setDevice("pc"));
await p.waitForTimeout(150);
await p.evaluate(() => window.__playground.runPreset("P1"));
await p.waitForTimeout(150);
await p.evaluate(() => window.__playground.select(["F_h0"]));
await p.waitForTimeout(200);
await p.locator("#host_feature").screenshot({ path: path.join(OUT, "anchor_hint.jpg"), type: "jpeg", quality: 85 });
console.log("wrote anchor_hint.jpg");

await browser.close();
console.log("画像: " + OUT);
