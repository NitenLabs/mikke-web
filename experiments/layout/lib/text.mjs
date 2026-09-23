// wa-01 layout-compare 実験：文字の改行（BudouX・R2）と高さの実測。
// 本線の部品を再利用する：linebreak.mjs（tokenize/joinTokens/computeLineBreakKeep）、measure.mjs（measureHeights）。
// これで「文字の組み・改行・実測」を本線と一致させる（実験側で組み直さない）。

import { chromium, webkit } from "playwright";
import { tokenize, joinTokens, computeLineBreakKeep } from "../../../tools/lib/linebreak.mjs";
import { measureHeights } from "../../../tools/lib/measure.mjs";
import { textDecls, STYLES, FONT_URL, ROOT_VARS, lbOf, lbState } from "./spec.mjs";

// text box: { key, styleName, device, widthPx, text }
// 返り値: Map key -> { html, height }  （html は <wbr>／nowrap を含む段落内 HTML）
const _cache = new Map();
export async function prepareTexts(boxes) {
  const uncached = boxes.filter((b) => !_cache.has(cacheKey(b)));
  if (uncached.length) await measureBatch(uncached);
  const out = new Map();
  for (const b of boxes) out.set(b.key, _cache.get(cacheKey(b)));
  return out;
}

function cacheKey(b) { return `${b.styleName}|${b.device}|${Math.round(b.widthPx * 100)}|${lbState() ? 1 : 0}|${b.text}`; }

async function measureBatch(boxes) {
  // 1) tokenize（lb=false のスタイル／改行規則off は1トークン）
  const prepared = boxes.map((b) => {
    const toks = tokenize([{ text: b.text }], lbOf(b.styleName));
    return { ...b, tokens: toks, style: textDecls(b.styleName, b.device) };
  });
  // 2) R2 の keep（本線と同じ手順）
  const lbReqs = prepared
    .filter((p) => lbOf(p.styleName))
    .map((p) => ({ key: p.key, device: p.device, widthPx: p.widthPx, style: p.style, tokens: p.tokens }));
  const { keep } = lbReqs.length
    ? await computeLineBreakKeep(lbReqs, FONT_URL, ROOT_VARS, { chromium, webkit })
    : { keep: {} };
  // 3) 高さ実測（keep を反映した html で）。computeLineBreakKeep は r.key でそのまま返す。
  const hReqs = prepared.map((p) => {
    const lb = lbOf(p.styleName);
    const html = joinTokens(p.tokens, lb ? (keep[p.key] ?? 0) : 0);
    return { key: p.key, device: p.device, widthPx: p.widthPx, style: p.style, html, lb, vertical: false };
  });
  const heights = await measureHeights(hReqs, FONT_URL, ROOT_VARS);
  for (const [i, p] of prepared.entries()) {
    const r = hReqs[i];
    _cache.set(cacheKey(boxes[i]), { html: r.html, height: heights[r.key] });
  }
}
