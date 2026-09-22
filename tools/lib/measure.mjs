// 芦屋みっけ Web制作：基準の幅で文字の箱の高さを実測する（ヘッドレスブラウザ）
// SPEC §10：公開時にスマホ390・PCは中身の幅で実測し、フォントの読み込み完了を待ってから測る。
// 実測は基準の2幅で足りる（表示は全体を比例で拡大縮小するので、全機種で折り返しが同じになる）。

let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }

// 実測用の最小CSS（出力側の .pg / labelColumn と同じ折り返しになるように）
// 出力側（page.mjs の .el-text）と同じ折り返し規則にする＝実測と本番で折り返しが一致する。
const MEASURE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%;-moz-text-size-adjust:100%;text-size-adjust:100%}
.m{position:absolute;left:0;top:0;visibility:hidden;line-break:strict;word-break:normal;overflow-wrap:anywhere;white-space:normal}
.m .pg{display:block}
.m .nowrap{white-space:nowrap}
.m .lc{display:flex}
.m .lc-key{flex:none}
.m .lc-val{flex:1}
`;

// rootVars: :root に置く CSS 変数（③のフォント・色。font:body 等が var(--f-body) で参照するため必須）。
// これが無いと var(--f-body) が未定義になり、実測が既定フォントで行われて本番の折り返しとずれる。
export async function measureHeights(requests, fontUrl, rootVars = []) {
  const toMeasure = requests.filter((r) => !r.vertical); // 縦書きは固定箱（実測しない）
  if (!toMeasure.length) return {};

  const boxes = toMeasure
    .map((r) => {
      // 幅は丸めない（0.2px 狭めるだけで境界の1文字が次行に落ち、折り返しが本番とずれる）。
      // 本番の箱は w%×中身の幅＝この widthPx なので、同じ小数の px で実測する。
      const style = [...r.style, `width:${Math.max(1, r.widthPx)}px`].join(";");
      return `<div class="m" data-key="${r.key}" style="${style}">${r.html}</div>`;
    })
    .join("\n");

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
${fontUrl ? `<link rel="stylesheet" href="${fontUrl}">` : ""}
<style>:root{${rootVars.join("")}}
${MEASURE_CSS}</style></head><body>${boxes}</body></html>`;

  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 2000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  // フォント（必要な文字の subset を含む）の読み込み完了を待つ。待たない・待ち足りないと、
  // 実測がフォールバックのフォント幅で行われ、本番の折り返し（実フォント）とずれる。
  // 強制レイアウト → subset の読み込みを促し、全フォント完了（status==='loaded'）まで待つ。
  await page.evaluate(() => document.body.offsetHeight);
  for (let i = 0; i < 50; i++) {
    const ok = await page.evaluate(() => {
      document.body.offsetHeight;
      return !document.fonts || document.fonts.status === "loaded";
    });
    if (ok) break;
    await page.waitForTimeout(100);
  }
  // 二段目の subset 読み込みに備えてもう一度確認
  await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1)).catch(() => {});
  await page.waitForTimeout(200);
  // 高さは小数のまま（0.01px 精度）で持つ。ceil で切り上げると要素ごとに最大1pxの
  // 上振れが積もり、列の下の要素で「実測ずれ」が見かけ上ふくらむ（本番は小数で描くため）。
  const result = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("[data-key]")].map((el) => [el.dataset.key, Math.round(el.getBoundingClientRect().height * 100) / 100])
    )
  );
  await browser.close();
  return result;
}
