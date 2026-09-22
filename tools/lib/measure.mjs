// 芦屋みっけ Web制作：基準の幅で文字の箱の高さを実測する（ヘッドレスブラウザ）
// SPEC §10：公開時にスマホ390・PCは中身の幅で実測し、フォントの読み込み完了を待ってから測る。
// 実測は基準の2幅で足りる（表示は全体を比例で拡大縮小するので、全機種で折り返しが同じになる）。

let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("playwright-core")); }

// 実測用の最小CSS（出力側の .pg / labelColumn と同じ折り返しになるように）
const MEASURE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
.m{position:absolute;left:0;top:0;visibility:hidden}
.m .pg{display:block}
.m .lc{display:flex}
.m .lc-key{flex:none}
.m .lc-val{flex:1}
`;

export async function measureHeights(requests, fontUrl) {
  const toMeasure = requests.filter((r) => !r.vertical); // 縦書きは固定箱（実測しない）
  if (!toMeasure.length) return {};

  const boxes = toMeasure
    .map((r) => {
      const style = [...r.style, `width:${Math.max(1, Math.round(r.widthPx))}px`].join(";");
      return `<div class="m" data-key="${r.key}" style="${style}">${r.html}</div>`;
    })
    .join("\n");

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
${fontUrl ? `<link rel="stylesheet" href="${fontUrl}">` : ""}
<style>${MEASURE_CSS}</style></head><body>${boxes}</body></html>`;

  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 2000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  // フォントの読み込み完了を待つ（待たないと折り返しが本番とずれる）
  await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1));
  await page.waitForTimeout(150);
  const result = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("[data-key]")].map((el) => [el.dataset.key, Math.ceil(el.getBoundingClientRect().height)])
    )
  );
  await browser.close();
  return result;
}
