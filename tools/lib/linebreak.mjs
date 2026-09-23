// 改行の規則（fix04 §1）。全テンプレート・全ページ共通。表示の仕組みに入れる。
//  R1 文節の途中で改行しない：BudouX で文節に分け、文節の間に <wbr>、要素に word-break:keep-all。
//  R2 最後の行を短くしない：段落の最後の行の可視文字が4未満なら、末尾の2〜4文節を nowrap の塊にして送る。
//  R3 見出しの行の長さをそろえる：見出しの役割に text-wrap:balance（CSS。ここではクラス付けの判定のみ）。
// keep（R2）は PC・SP の大きい方を採る（末尾をまとめると最終行は必ず長くなる＝両端末で安全）。

import { loadDefaultJapaneseParser } from "budoux";
import { esc } from "./render.mjs";

let _parser;
export function parser() { return (_parser ??= loadDefaultJapaneseParser()); }
export function splitPhrases(text) { return text ? parser().parse(text) : []; }

// 可視文字（句読点・括弧・空白などを除く）の数
const PUNCT_SRC = "[\\s、。，．・…！？!?（）()「」『』【】〔〕［］\\[\\]｛｝{}〈〉《》＜＞<>：；:;”“\"'‘’—－ー―~〜／/]";
export const PUNCT = new RegExp(PUNCT_SRC, "g");
export function visibleCount(s) { return (s || "").replace(PUNCT, "").length; }

// 改行の規則を効かせる文字要素か（noWrap・縦書き・lineBreakRules:false は対象外）
export function lbEnabled(style, boxByDev, site) {
  if (site?.lineBreakRules === false) return false;
  if (style?.noWrap) return false;
  if (boxByDev && (boxByDev.pc?.writingMode === "vertical" || boxByDev.sp?.writingMode === "vertical")) return false;
  return true;
}
const HEADING_ROLES = new Set(["heading", "subheading", "pageTitle"]);
export function lbHeading(role) { return HEADING_ROLES.has(role); }

// 1段落の runs → トークン（文節）の HTML 配列。lb=false なら run ごとに1トークン（分割しない）。
// リンク・priceAll・「›」の run は分割せず1トークン（境界を壊さない）。marks は各トークンに付ける。
export function tokenize(runs, lb, opts = {}) {
  const { arrowRight, linkResolver } = opts;
  const toks = [];
  for (const r of runs) {
    const isArrow = arrowRight && (r.text || "").trim() === "›";
    const single = !lb || r.marks?.link || isArrow || r.fmt === "priceAll" || r.fmt === "priceAllTax" || !r.text;
    if (single) { toks.push(runSpanHtml(r, linkResolver, isArrow ? "pill-arrow" : null)); continue; }
    const style = marksStyleHtml(r.marks);
    for (const ph of splitPhrases(r.text)) toks.push(`<span${style ? ` style="${style}"` : ""}>${esc(ph)}</span>`);
  }
  return toks;
}
// トークン配列 → 段落の中身 HTML（<wbr> で連結。keep>0 なら末尾 keep 個を nowrap の塊に）
export function joinTokens(toks, keep) {
  if (keep > 0 && toks.length > keep) {
    const head = toks.slice(0, toks.length - keep);
    const tail = toks.slice(toks.length - keep);
    return head.join("<wbr>") + '<wbr><span class="nowrap">' + tail.join("") + "</span>";
  }
  return toks.join("<wbr>");
}

// marks → span の style（render.mjs の marksStyle と同じ規則。循環 import を避けてここに複製）
function marksStyleHtml(marks) {
  if (!marks) return "";
  const p = [];
  if (marks.sizeRatio) p.push(`font-size:${marks.sizeRatio}em`);
  if (marks.bold) p.push("font-weight:700");
  if (marks.italic) p.push("font-style:italic");
  if (marks.underline) p.push("text-decoration:underline");
  return p.join(";");
}
function runSpanHtml(r, linkResolver, cls) {
  let inner;
  if ((r.fmt === "priceAll" || r.fmt === "priceAllTax") && r.text) {
    const sep = r.fmt === "priceAll" ? " ／ " : "／";
    inner = r.text.split(sep).map((o) => `<span class="nowrap">${esc(o)}</span>`).join(sep);
  } else inner = esc(r.text);
  const link = r.marks?.link;
  if (link && linkResolver) { const l = linkResolver(link); if (l) inner = `<a href="${esc(l.href)}"${l.target ? ` target="${l.target}" rel="noopener"` : ""}>${inner}</a>`; }
  const s = marksStyleHtml(r.marks);
  const c = cls ? ` class="${cls}"` : "";
  return `<span${c}${s ? ` style="${s}"` : ""}>${inner}</span>`;
}

// ---- R2 の keep を測って決める（settle と build の両方で同じに呼ぶ）----
// requests: [{key, device, widthPx, style(:string[]), tokens(:string[])}]
// 返り値: { keep: {key(#pIdx)->N}, longPhrases: [文節が箱より長い件の説明], unresolved: [4でも4未満] }
export async function computeLineBreakKeep(requests, fontUrl, rootVars, browsers) {
  const { chromium, webkit } = browsers;
  const byDev = { pc: [], sp: [] };
  for (const r of requests) byDev[r.device].push(r);
  const keepByKeyDev = {}; const longPhrases = []; const unresolved = [];
  for (const [dev, reqs] of Object.entries(byDev)) {
    if (!reqs.length) continue;
    const bt = dev === "pc" ? chromium : webkit;
    const browser = await bt.launch();
    const ctx = await browser.newContext({ viewport: { width: 2000, height: 2000 }, deviceScaleFactor: 1, locale: "ja-JP" });
    const page = await ctx.newPage();
    const boxes = reqs.map((r, i) =>
      `<div class="m lb" data-i="${i}" style="${[...r.style, `width:${Math.max(1, r.widthPx)}px`].join(";")}"></div>`).join("\n");
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">${fontUrl ? `<link rel="stylesheet" href="${fontUrl}">` : ""}<style>:root{font-size:10px;${rootVars.join("")}}
*{margin:0;padding:0;box-sizing:border-box}
.m{position:absolute;left:0;top:0;visibility:hidden;line-break:strict}
.m.lb{word-break:keep-all;overflow-wrap:anywhere}
.m .nowrap{white-space:nowrap}
</style></head><body>${boxes}</body></html>`;
    await page.setContent(html, { waitUntil: "load" });
    for (let i = 0; i < 50; i++) { const ok = await page.evaluate(() => { document.body.offsetHeight; return !document.fonts || document.fonts.status === "loaded"; }); if (ok) break; await page.waitForTimeout(100); }
    const tokensList = reqs.map((r) => r.tokens);
    const res = await page.evaluate(({ tokensList, punctSrc }) => {
      const PUNCT = new RegExp(punctSrc, "g");
      const vis = (s) => (s || "").replace(PUNCT, "").length;
      // 要素の「最後の行の可視文字数」を測る（文字ごとの矩形で行を割り、最下段を最後の行とする）
      function lastLineVisible(el) {
        const rects = [];
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n; const range = document.createRange();
        let maxBottom = -1;
        const chars = [];
        while ((n = walk.nextNode())) {
          for (let k = 0; k < n.length; k++) {
            range.setStart(n, k); range.setEnd(n, k + 1);
            const rc = range.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) continue;
            chars.push({ ch: n.data[k], top: Math.round(rc.top) });
            maxBottom = Math.max(maxBottom, Math.round(rc.top));
          }
        }
        const last = chars.filter((c) => c.top === maxBottom).map((c) => c.ch).join("");
        const lines = new Set(chars.map((c) => c.top)).size;
        return { lastVisible: vis(last), lines };
      }
      const out = [];
      const nodes = [...document.querySelectorAll(".m.lb")];
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i]; const toks = tokensList[i];
        // 文節が箱より長いか（各トークン単独の幅 > 箱幅）
        let longPhrase = false;
        el.innerHTML = toks.map((t) => `<span class="probe">${t}</span>`).join("");
        const w = el.clientWidth;
        for (const s of el.querySelectorAll(":scope > .probe")) if (s.getBoundingClientRect().width > w + 0.5) longPhrase = true;
        // keep を 0,2,3,4 で試し、最後の行が4以上になる最小の keep
        const build = (keep) => keep > 0 && toks.length > keep
          ? toks.slice(0, toks.length - keep).join("<wbr>") + '<wbr><span class="nowrap">' + toks.slice(toks.length - keep).join("") + "</span>"
          : toks.join("<wbr>");
        let chosen = 0, ok = false, natural = 0;
        for (const keep of [0, 2, 3, 4]) {
          el.innerHTML = build(keep);
          const m = lastLineVisible(el);
          if (keep === 0) natural = m.lastVisible;
          if (m.lines <= 1 || m.lastVisible >= 4) { chosen = keep; ok = true; break; }
          chosen = keep;
        }
        out.push({ chosen, ok, natural, longPhrase });
      }
      return out;
    }, { tokensList, punctSrc: PUNCT_SRC });
    reqs.forEach((r, i) => {
      (keepByKeyDev[r.key] ??= {})[dev] = res[i].chosen;
      if (res[i].longPhrase) longPhrases.push(`${r.key} [${dev}]`);
      if (!res[i].ok) unresolved.push(`${r.key} [${dev}]`);
    });
    await browser.close();
  }
  const keep = {};
  for (const [k, dv] of Object.entries(keepByKeyDev)) keep[k] = Math.max(dv.pc || 0, dv.sp || 0);
  return { keep, longPhrases, unresolved };
}
