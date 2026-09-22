// 芦屋みっけ Web制作：表示の仕組み（データ→静的サイト）の中核
//   1. resolveSite   ①②③④を読み、連動・品の表示判定・繰り返す部品を解決する（端末非依存の中身）
//   2. measurementRequests  基準の幅で実測すべき文字の箱の一覧（ヘッドレスブラウザに渡す）
//   3. layoutPage    実測した高さ＋reflow.mjs で、各セクション・各要素の最終位置を決める
//   4. emitPage      静的HTML＋静的CSS（JavaScriptなしで正しい位置に出る）を書き出す
//
// 位置は「セクションは通常フロー、要素はセクション内で絶対配置」。全体は :root の font-size を
// 画面幅に連動させて比例で拡大縮小する（1rem=10px＝基準）。x・w は％（中身の幅に対する）、
// y・h・size は rem（px/10）。これで JavaScript なしに DATA_SPEC 4.2 の比例拡大縮小が効く。

import { reflow } from "../reflow.mjs";
import { resolveText } from "./text.mjs";
import { resolveRepeater } from "./catalog.mjs";
import { colorCss, fontCss, textStyle, ROLE_TAG } from "./theme.mjs";

const DEVICES = ["pc", "sp"];

// ---------- 小さな道具 ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const rem = (px) => `${round(px / 10)}rem`;
const pct = (v) => `${round(v)}%`;

function designWidth(site, device) {
  return device === "pc" ? site.canvas.pcContentWidth : site.canvas.spDesignWidth;
}

// 写真の枠の高さ（design px）。ratio "a:b" → 幅×b/a。orig/custom や ratio 無しは h を使う。
function ratioHeightPx(ratio, widthPx, hFallback) {
  if (ratio && /^[0-9]+:[0-9]+$/.test(ratio)) {
    const [a, b] = ratio.split(":").map(Number);
    return (widthPx * b) / a;
  }
  return hFallback || 0;
}

// 要素のピクセル幅（design px）。fullBleed の写真は中身の幅を基準に見積もる（背景として扱うため）。
function boxWidthPx(box, device, site) {
  return (box.w / 100) * designWidth(site, device);
}

// 飾りかどうか（reflow の規則8）。図形・背景写真・全面写真＝飾り。
// 全面写真は片方の端末だけ fullBleed でも bleed 層（セクション背景）に描くので、両端末とも飾り扱い。
function isDecorative(el, device) {
  if (el.type === "shape") return true;
  if (el.type === "photo") return !!(el.box.pc?.fullBleed || el.box.sp?.fullBleed);
  return false;
}

// ---------- 1. resolveSite ----------
export function resolveSite(data, refDate) {
  const { shop, site, theme, assets } = data;
  const ctx = { refYear: refDate.year };
  const scopesShop = { shop };
  const elements = new Map();

  for (const [id, el] of Object.entries(site.elements)) {
    const base = {
      id, type: el.type, z: el.z ?? 1, section: el.section,
      box: el.layout, locked: el.locked, hidden: el.hidden, motion: el.motion,
    };
    if (el.type === "text") {
      const r = resolveText(el, scopesShop, ctx);
      elements.set(id, { ...base, role: el.role, style: el.style || {}, text: r });
    } else if (el.type === "photo") {
      elements.set(id, { ...base, photo: { asset: el.asset, bind: el.bind, crop: el.crop, darken: el.darken, radius: el.radius, alt: el.alt, link: el.link } });
    } else if (el.type === "shape") {
      elements.set(id, { ...base, shape: { kind: el.kind, fill: el.fill, radius: el.radius, opacity: el.opacity, link: el.link } });
    } else if (el.type === "embed") {
      elements.set(id, { ...base, embed: { kind: el.kind, config: el.config } });
    } else if (el.type === "nav") {
      elements.set(id, { ...base, nav: { style: el.style || {} } });
    } else if (el.type === "form") {
      elements.set(id, { ...base, form: el });
    } else if (el.type === "repeater") {
      const items = resolveRepeater(shop, el.source, refDate);
      // カードの各文字セルを item スコープで解決
      const cardEls = el.card.elements;
      for (const it of items) {
        it.cels = {};
        for (const [cid, ce] of Object.entries(cardEls)) {
          if (ce.type === "text") it.cels[cid] = resolveText(ce, { item: it.view }, ctx);
        }
      }
      let heading = null;
      if (el.groupHeading) heading = el.groupHeading;
      elements.set(id, { ...base, repeater: { source: el.source, display: el.display, card: el.card, groupHeading: heading, items } });
    }
  }

  return { shop, site, theme, assets, refDate, elements };
}

// ---------- 文字の箱のスタイルと中身（実測と出力で共通に使う） ----------
// unit: "px"（実測）または "rem"（出力）。size は design px。
function textBoxStyle(el, device, theme, unit) {
  const ts = textStyle(theme, el.role);
  const st = el.style || {};
  const box = el.box[device];
  const sizePx = box.size ?? ts.size[device];
  const lh = st.lineHeight ?? ts.lineHeight;
  const ls = st.letterSpacing ?? ts.letterSpacing ?? 0;
  const font = fontCss(st.font || ts.font);
  const weight = st.bold ? 700 : ts.weight || 400;
  const props = [];
  props.push(`font-family:${font}`);
  props.push(`font-size:${unit === "px" ? `${round(sizePx)}px` : rem(sizePx)}`);
  props.push(`line-height:${lh}`);
  if (ls) props.push(`letter-spacing:${ls}em`);
  props.push(`font-weight:${weight}`);
  if (st.italic) props.push("font-style:italic");
  if (box.writingMode === "vertical") props.push("writing-mode:vertical-rl");
  return props;
}

// 一部だけの装飾（marks）を span のスタイルに
function marksStyle(marks) {
  if (!marks) return "";
  const p = [];
  if (marks.sizeRatio) p.push(`font-size:${marks.sizeRatio}em`);
  const col = colorCss(marks.color); if (col) p.push(`color:${col}`);
  if (marks.font) p.push(`font-family:${fontCss(marks.font)}`);
  if (marks.bold) p.push("font-weight:700");
  if (marks.italic) p.push("font-style:italic");
  if (marks.underline) p.push("text-decoration:underline");
  return p.join(";");
}

// 1つの run の中身（テキスト＋リンク）。priceAll は選択肢ごとに nowrap にし、選択肢の間でだけ折り返す。
function runInner(r, linkResolver) {
  let inner;
  if (r.fmt === "priceAll" && r.text) {
    // formatPriceAll の区切りは " ／ "。各選択肢を nowrap のかたまりにし、区切りの前後だけ折り返し可にする
    inner = r.text.split(" ／ ").map((opt) => `<span class="nowrap">${esc(opt)}</span>`).join(" ／ ");
  } else {
    inner = esc(r.text);
  }
  const link = r.marks?.link;
  if (link && linkResolver) {
    const l = linkResolver(link);
    if (l) inner = `<a href="${esc(l.href)}"${l.target ? ` target="${l.target}" rel="noopener"` : ""}>${inner}</a>`;
  }
  return inner;
}
function runSpan(r, linkResolver) {
  const s = marksStyle(r.marks);
  return `<span${s ? ` style="${s}"` : ""}>${runInner(r, linkResolver)}</span>`;
}

// 段落→HTML。linkResolver(link)→{href,target} があればリンクを張る。
function paragraphsHtml(resolvedText, style, opts = {}) {
  const { linkResolver, labelColumn } = opts;
  return resolvedText.paragraphs
    .map((p) => {
      if (labelColumn) {
        // 先頭の自由な文字を項目名の列に、残りを右に流す
        const first = p.runs[0];
        const restRuns = p.runs.slice(1).map((r) => runSpan(r, linkResolver)).join("");
        return `<span class="pg lc"><span class="lc-key" style="width:${labelColumn}em">${esc(first?.text ?? "")}</span><span class="lc-val">${restRuns}</span></span>`;
      }
      const runsHtml = p.runs.map((r) => runSpan(r, linkResolver)).join("");
      return `<span class="pg">${runsHtml}</span>`;
    })
    .join("");
}

// ---------- 実測すべき文字の箱の一覧 ----------
// 返り値: [{ key, device, widthPx, style(:string配列), html, vertical, fixedH }]
export function measurementRequests(resolved) {
  const { site, theme, elements } = resolved;
  const reqs = [];
  for (const el of elements.values()) {
    if (el.type === "text" && el.text.visible) {
      for (const device of DEVICES) {
        const box = el.box[device];
        const widthPx = boxWidthPx(box, device, site);
        reqs.push({
          key: `t:${device}:${el.id}`, device, widthPx,
          style: textBoxStyle(el, device, theme, "px"),
          labelColumn: el.style?.labelColumn,
          vertical: box.writingMode === "vertical", fixedH: box.h,
          html: paragraphsHtml(el.text, el.style, { labelColumn: el.style?.labelColumn }),
        });
      }
    }
    if (el.type === "repeater") {
      const rp = el.repeater;
      for (const device of DEVICES) {
        const repW = boxWidthPx(el.box[device], device, site);
        const cols = rp.display.columns[device] || 1;
        const gap = rp.display.gap?.[device] || 0;
        const cardW = cols > 1 ? (repW - gap * (cols - 1)) / cols : repW;
        // カードの各文字セル
        for (const it of rp.items) {
          for (const [cid, ce] of Object.entries(rp.card.elements)) {
            if (ce.type !== "text") continue;
            const rt = it.cels[cid];
            if (!rt || !rt.visible) continue;
            const celW = (ce.layout[device].w / 100) * cardW;
            reqs.push({
              key: `c:${device}:${el.id}:${it.id}:${cid}`, device, widthPx: celW,
              style: textBoxStyle({ role: ce.role, style: ce.style, box: ce.layout }, device, theme, "px"),
              vertical: ce.layout[device].writingMode === "vertical", fixedH: ce.layout[device].h,
              html: paragraphsHtml(rt, ce.style, {}),
            });
          }
        }
        // 括りの見出し
        if (rp.groupHeading && rp.source.groupByCategory) {
          const gh = rp.groupHeading;
          const seen = new Set();
          for (const it of rp.items) {
            if (seen.has(it.categoryId)) continue;
            seen.add(it.categoryId);
            const rt = resolveText(gh, { item: it.view }, { refYear: resolved.refDate.year });
            const ghW = (gh.layout[device].w / 100) * repW;
            reqs.push({
              key: `g:${device}:${el.id}:${it.categoryId}`, device, widthPx: ghW,
              style: textBoxStyle({ role: gh.role, style: gh.style, box: gh.layout }, device, theme, "px"),
              vertical: false, fixedH: gh.layout[device].h,
              html: paragraphsHtml(rt, gh.style, {}),
            });
          }
        }
      }
    }
  }
  return reqs;
}

// 実測した高さ（design px）を返すヘルパ。縦書き・写真は固定 h。
function measuredH(heights, key, fixedH) {
  const v = heights[key];
  return v != null ? v : (fixedH || 0);
}

// ---------- 繰り返す部品の内部レイアウト（カード反映後） ----------
function repeaterLayout(el, device, site, heights) {
  const rp = el.repeater;
  const repW = boxWidthPx(el.box[device], device, site);
  const cols = rp.display.columns[device] || 1;
  const gap = rp.display.gap?.[device] || 0;
  const cardMinH = rp.card.height[device];
  const cardW = cols > 1 ? (repW - gap * (cols - 1)) / cols : repW;

  // 各カードの高さ（カード内 reflow）
  const cardInfo = rp.items.map((it) => {
    const photoless = rp.display.photoless;
    const els = [];
    for (const [cid, ce] of Object.entries(rp.card.elements)) {
      const b = ce.layout[device];
      const w = ce.type === "photo" ? (b.w) : b.w;
      let h = b.h || 0;
      let actualH = h, hidden = false, decorative = ce.type === "shape";
      if (ce.type === "photo") {
        const pw = (b.w / 100) * cardW;
        h = ratioHeightPx(b.ratio, pw, b.h);
        actualH = h;
        // 写真のない品：compactCard/skip はこのセルを消す
        if (!it.hasPhoto) { hidden = true; }
        decorative = true;
      } else if (ce.type === "text") {
        const rt = it.cels[cid];
        if (!rt || !rt.visible) { hidden = true; actualH = 0; }
        else actualH = measuredH(heights, `c:${device}:${el.id}:${it.id}:${cid}`, b.h);
      }
      els.push({ id: cid, x: b.x, w, y: b.y, h, actualH, hidden, decorative });
    }
    const r = reflow(els, cardMinH);
    // compactCard: 写真セルが消えた分、上に詰めた高さをそのまま使う（reflow が処理済み）
    return { id: it.id, itemId: it.id, cardH: r.sectionH, positions: r.y, els };
  });

  // カードを配置（格子／一覧・括りごと）。left/width/top/height は design px（repeater 内の座標）。
  const placements = []; // {kind:'card'|'heading', id, catId, top, left, width, height, card}
  let cursor = 0;
  if (rp.source.groupByCategory && cols === 1) {
    let curCat = null, first = true;
    const groupGap = 24;
    for (let i = 0; i < rp.items.length; i++) {
      const it = rp.items[i];
      if (it.categoryId !== curCat) {
        curCat = it.categoryId;
        if (!first) cursor += groupGap;
        first = false;
        const gh = rp.groupHeading;
        const ghH = gh ? measuredH(heights, `g:${device}:${el.id}:${it.categoryId}`, gh.layout[device].h) : 0;
        placements.push({ kind: "heading", catId: it.categoryId, top: cursor, left: 0, width: repW, height: ghH });
        cursor += ghH + 8;
      }
      const ci = cardInfo[i];
      placements.push({ kind: "card", id: it.id, top: cursor, left: 0, width: repW, height: ci.cardH, card: ci });
      cursor += ci.cardH + gap;
    }
    if (rp.items.length) cursor -= gap;
  } else {
    // 格子（列数 cols）。列ごとに left = col*(cardW+gap)。
    let rowMaxH = 0;
    for (let i = 0; i < rp.items.length; i++) {
      const col = i % cols;
      if (col === 0 && i > 0) { cursor += rowMaxH + gap; rowMaxH = 0; }
      const ci = cardInfo[i];
      placements.push({ kind: "card", id: rp.items[i].id, top: cursor, left: col * (cardW + gap), width: cardW, height: ci.cardH, card: ci });
      rowMaxH = Math.max(rowMaxH, ci.cardH);
    }
    cursor += rowMaxH;
  }
  return { totalHeight: Math.max(cursor, 0), placements, cardW, cols, gap, repW };
}

export { DEVICES, boxWidthPx, ratioHeightPx, isDecorative, designWidth, textBoxStyle, paragraphsHtml, esc, rem, pct, round, repeaterLayout };
