// 芦屋みっけ Web制作：基準の幅で文字の箱の高さを実測する（ヘッドレスブラウザ）
// SPEC §10：公開時にスマホ390・PCは中身の幅で実測し、フォントの読み込み完了を待ってから測る。
// 実測は基準の2幅で足りる（表示は全体を比例で拡大縮小するので、全機種で折り返しが同じになる）。
//
// 実測エンジンの基準（STEP 3・0）：
//   - スマホの配置は webkit で実測する（日本のスマホは iPhone＝Safari＝webkit が多数派。
//     多数派で位置がぴったり合い、補正の JS が動くのを少数派〔Chrome/Firefox〕側に寄せる）。
//   - PC の配置は chromium で実測する。

let engines = {};
try { engines = await import("playwright"); } catch { engines = await import("playwright-core"); }
const { chromium, webkit } = engines;

// 実測用の最小CSS（出力側の .el-text と同じ折り返し規則にする＝実測と本番で折り返しが一致する）
const MEASURE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%;-moz-text-size-adjust:100%;text-size-adjust:100%}
.m{position:absolute;left:0;top:0;visibility:hidden;line-break:strict;word-break:normal;overflow-wrap:anywhere;white-space:normal}
.m.lb{word-break:keep-all;overflow-wrap:anywhere}
.m .pg{display:block}
.m .nowrap{white-space:nowrap}
.m .lc{display:flex}
.m .lc-key{flex:none}
.m .lc-val{flex:1}
`;

// 1つのブラウザで一群の box を実測する。
async function measureInBrowser(browserType, reqs, fontUrl, rootVars, device = "pc") {
  if (!reqs.length) return {};
  const boxes = reqs
    .map((r) => {
      // 幅は丸めない（0.2px 狭めるだけで境界の1文字が次行に落ち、折り返しが本番とずれる）。
      // 本番の箱は w%×中身の幅＝この widthPx なので、同じ小数の px で実測する。
      const style = [...r.style, `width:${Math.max(1, r.widthPx)}px`].join(";");
      const cls = "m" + (r.lb ? " lb" : "") + (r.rowLines ? " row-table" : "");
      return `<div class="${cls}" data-key="${r.key}" style="${style}">${r.html}</div>`;
    })
    .join("\n");
  // row-table（ACCESS 情報の表）は @media でなく端末別に注入（実測は端末ごとに別ページのため）
  // 本番（page.mjs）の .el-text .lc-key（明朝 w700）と .el-text .lc（flex）を実測でも再現する
  const keyBase = ".m .lc{display:flex}.m .lc-key{flex:none;font-family:var(--f-heading);font-weight:700}.m .lc-val{flex:1}";
  // 行の線は box-shadow（高さに入らない＝本番と同じ）。border だと高さに入り比例縮小でずれる（fix05 §4）
  const rowCss = keyBase + (device === "sp"
    ? ".row-table{box-shadow:inset 0 1px 0 #B0B0B0}.row-table .lc{display:block;padding:1.6rem 0;box-shadow:inset 0 -1px 0 #B0B0B0}.row-table .lc-key{display:block;line-height:1.4;margin-bottom:.4rem;width:auto!important}"
    : ".row-table{box-shadow:inset 0 1px 0 #B0B0B0}.row-table .lc{display:flex;gap:2.4rem;padding:1.6rem 0;box-shadow:inset 0 -1px 0 #B0B0B0;align-items:baseline}.row-table .lc-key{line-height:1.8}");
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
${fontUrl ? `<link rel="stylesheet" href="${fontUrl}">` : ""}
<style>:root{font-size:10px;${rootVars.join("")}}
${MEASURE_CSS}${rowCss}</style></head><body>${boxes}</body></html>`;

  const launchOpts = browserType === chromium && process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const browser = await browserType.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 2000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  // フォント（必要な文字の subset を含む）の読み込み完了を待つ。待たない・待ち足りないと、
  // 実測がフォールバックのフォント幅で行われ、本番の折り返し（実フォント）とずれる。
  await page.evaluate(() => document.body.offsetHeight); // 強制レイアウト＝subset の読み込みを促す
  for (let i = 0; i < 50; i++) {
    const ok = await page.evaluate(() => { document.body.offsetHeight; return !document.fonts || document.fonts.status === "loaded"; });
    if (ok) break;
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => 1) : 1)).catch(() => {});
  await page.waitForTimeout(200);
  // 高さは小数のまま（0.01px 精度）で持つ。ceil で切り上げると要素ごとに最大1pxの上振れが
  // 積もり、列の下の要素で「実測ずれ」が見かけ上ふくらむ（本番は小数で描くため）。
  const result = await page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll("[data-key]")].map((el) => [el.dataset.key, Math.round(el.getBoundingClientRect().height * 100) / 100]))
  );
  await browser.close();
  return result;
}

// rootVars: :root に置く CSS 変数（③のフォント・色。font:body 等が var(--f-body) で参照するため必須）。
export async function measureHeights(requests, fontUrl, rootVars = []) {
  const toMeasure = requests.filter((r) => !r.vertical); // 縦書きは固定箱（実測しない）
  const pcReqs = toMeasure.filter((r) => r.device === "pc");
  const spReqs = toMeasure.filter((r) => r.device === "sp");
  // PC＝chromium、スマホ＝webkit で並行して実測する
  const [pcRes, spRes] = await Promise.all([
    measureInBrowser(chromium, pcReqs, fontUrl, rootVars, "pc"),
    measureInBrowser(webkit, spReqs, fontUrl, rootVars, "sp"),
  ]);
  return { ...pcRes, ...spRes };
}
