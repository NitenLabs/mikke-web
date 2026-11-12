// 改行の規則（fix04 §1）。全テンプレート・全ページ共通。表示の仕組みに入れる。
//  R1 文節の途中で改行しない：BudouX で文節に分け、文節の間に <wbr>、要素に word-break:keep-all。
//  R2 最後の行を短くしない：段落の最後の行の可視文字が4未満なら、末尾の2〜4文節を nowrap の塊にして送る。
//  R3 見出しの行の長さをそろえる：見出しの役割に text-wrap:balance（CSS。ここではクラス付けの判定のみ）。
// keep（R2）は PC・SP の大きい方を採る（末尾をまとめると最終行は必ず長くなる）。
//   ただし、まとめた塊（nowrap）がどちらかの端末で箱に入らないときは、両端末に入る最大の keep に下げる（A：はみ出しの判定）。
//   営業時間（hoursShort・hoursShortLO）の段落で下げたときは、文節ではなく曜日のまとまりで折り直す（B）。

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

// 守りたい塊（指示 0064 の 1）：時刻の範囲「13:00〜17:30」・時刻・「（L.O. 21:00）」・数＋単位「8席」「1,200円」。
//   この中では折らない：トークンの境（run の境・文節の境）が中に来たら <wbr> を入れずにつなぐ（1-a）。
//   それでもブラウザが中で折る所（「〜」の後・「L.O. 」の空白・「:」の後）は、測って nowrap で包む（1-b。computeLineBreakKeep）。
export const PROTECT_SRC = String.raw`(?:翌)?\d{1,2}:\d{2}(?:\s*[〜~～]\s*(?:翌)?\d{1,2}:\d{2})?|（?L\.O\.\s*(?:翌)?\d{1,2}:\d{2}）?|\d{1,3}(?:,\d{3})*(?:席|名様|名|円|分|時間|人|品|貫|本|台|個|枚|杯|皿|種|部|年|歳|g|ml)`;
// 文字列の中の守りたい塊の範囲 [[start, end), …]（ブラウザの要らない純粋関数）
export function protectedRanges(text) {
  const out = []; if (!text) return out;
  const re = new RegExp(PROTECT_SRC, "g"); let m;
  while ((m = re.exec(text))) { if (!m[0].length) { re.lastIndex++; continue; } out.push([m.index, m.index + m[0].length]); }
  return out;
}

// 1段落の runs → トークン（文節）の HTML 配列。lb=false なら run ごとに1トークン（分割しない）。
// リンク・priceAll・「›」の run は分割せず1トークン（境界を壊さない）。marks は各トークンに付ける。
// opts.hoursGroups=true のとき、営業時間の run（hoursShort・hoursShortLO）は文節ではなく曜日のまとまりで分ける（B）。
// lb のとき、守りたい塊の中に来るトークンの境はつなぐ（1-a）。
export function tokenize(runs, lb, opts = {}) { return tokenizeInfo(runs, lb, opts).toks; }
// tokenize の中身。返り値 { toks, prot（守りたい塊を nowrap で包んだトークン。塊が無ければ null）, ranges, text }
export function tokenizeInfo(runs, lb, opts = {}) {
  const { arrowRight, linkResolver, hoursGroups } = opts;
  const raw = []; let pos = 0; // raw: [{ parts: [{single, html | style+text, start, end}] }]
  for (const r of runs) {
    const isArrow = arrowRight && (r.text || "").trim() === "›";
    const single = !lb || r.marks?.link || isArrow || r.fmt === "priceAll" || r.fmt === "priceAllTax" || !r.text;
    const len = (r.text || "").length;
    if (single) { raw.push({ parts: [{ single: true, html: runSpanHtml(r, linkResolver, isArrow ? "pill-arrow" : null), start: pos, end: pos + len }] }); pos += len; continue; }
    const style = marksStyleHtml(r.marks);
    const phs = hoursGroups && HOURS_FMTS.has(r.fmt) ? hoursGroupTokens(r.text) : splitPhrases(r.text);
    for (const ph of phs) { raw.push({ parts: [{ single: false, style, text: ph, start: pos, end: pos + ph.length }] }); pos += ph.length; }
  }
  const text = runs.map((r) => r.text || "").join("");
  const ranges = lb ? protectedRanges(text) : [];
  // 1-a：境が塊の中（start < b < end）ならつなぐ
  const toks = [];
  for (const t of raw) {
    const b = t.parts[0].start;
    const prev = toks[toks.length - 1];
    if (prev && ranges.some(([s, e]) => s < b && b < e)) prev.parts.push(...t.parts);
    else toks.push({ parts: [...t.parts] });
  }
  const partHtml = (p, text) => p.single ? p.html : `<span${p.style ? ` style="${p.style}"` : ""}>${esc(text ?? p.text)}</span>`;
  const plain = toks.map((t) => t.parts.map((p) => partHtml(p)).join(""));
  if (!ranges.length) return { toks: plain, prot: null, ranges, text };
  // 1-b 用：塊ごとに <span class="nowrap"> で包む（塊の端が文節の中なら、その文節の span を分ける）
  const prot = toks.map((t) => {
    if (!t.parts.some((p) => ranges.some(([s, e]) => p.start < e && s < p.end))) return t.parts.map((p) => partHtml(p)).join("");
    let out = "", open = -1;
    const emit = (ri, html) => {
      if (ri !== open) { if (open >= 0) out += "</span>"; if (ri >= 0) out += '<span class="nowrap">'; open = ri; }
      out += html;
    };
    const rangeAt = (i) => ranges.findIndex(([s, e]) => s <= i && i < e);
    for (const p of t.parts) {
      if (p.single) { const ri = ranges.findIndex(([s, e]) => p.start < e && s < p.end); emit(ri, p.html); continue; }
      let i = p.start;
      while (i < p.end) { const ri = rangeAt(i); let j = i + 1; while (j < p.end && rangeAt(j) === ri) j++; emit(ri, partHtml(p, p.text.slice(i - p.start, j - p.start))); i = j; }
    }
    if (open >= 0) out += "</span>";
    return out;
  });
  return { toks: plain, prot, ranges, text };
}
// 営業時間の書き方（曜日のまとまりで折る対象）
export const HOURS_FMTS = new Set(["hoursShort", "hoursShortLO"]);
// 営業時間の文字を曜日のまとまりに分ける（B）。区切りは「◯曜は」の前：
//   「（」の前で切る（「（」は次のまとまりの頭。行末に開き括弧を残さない）、「・」「／」の後で切る（前のまとまりの末尾）。
//   例：「7:30〜17:00（月曜は休み・水曜は11:00〜15:00）」→「7:30〜17:00」「（月曜は休み・」「水曜は11:00〜15:00）」
export function hoursGroupTokens(text) {
  if (!text) return [];
  const DAY = /^[月火水木金土日]曜は/;
  const out = []; let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    let cut = -1;
    if (c === "（" && DAY.test(text.slice(i + 1))) cut = i;
    else if ((c === "・" || c === "／") && DAY.test(text.slice(i + 1))) cut = i + 1;
    if (cut > start) { out.push(text.slice(start, cut)); start = cut; }
  }
  out.push(text.slice(start));
  return out.filter((t) => t.length);
}

// keep を決める（ブラウザの要らない純粋関数。A）。
//   dv.pc・dv.sp: { chosen（最後の行が4以上になる最小の keep）, boxW（箱の幅）, chunkW: {2,3,4 → 塊の幅} }
//   返り値: { keep, fixed（塊がはみ出すので下げた）}。許容 tol px（今の全店に 1.2px の超えが1件あり、それを変えないため 2）。
export const KEEP_TOL = 2;
export function chooseKeep(dv, tol = KEEP_TOL) {
  const devs = [dv.pc, dv.sp].filter(Boolean);
  const k0 = Math.max(0, ...devs.map((d) => d.chosen || 0));
  const fits = (k) => k === 0 || devs.every((d) => !(d.chunkW?.[k] > d.boxW + tol));
  if (fits(k0)) return { keep: k0, fixed: false };
  for (const k of [4, 3, 2]) if (k < k0 && fits(k)) return { keep: k, fixed: true };
  return { keep: 0, fixed: true };
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
// requests: [{key, device, widthPx, style(:string[]), tokens(:string[]), altTokens?(:string[] 曜日のまとまり),
//             keepless?（文節が1つ。keep は測らず 1-b だけ）, ranges?・prot?・altProt?（守りたい塊。tokenizeInfo）}]
// 返り値: { keep: {key(#pIdx)->N}, alt: {key->true（曜日のまとまりで書く）}, protect: {key->true（守りたい塊を nowrap で包む）}, protectSkipped, overflowFixed: [塊がはみ出すので下げた件],
//          longPhrases: [文節が箱より長い件の説明], unresolved: [4でも4未満] }
export async function computeLineBreakKeep(requests, fontUrl, rootVars, browsers) {
  const { chromium, webkit } = browsers;
  const byDev = { pc: [], sp: [] };
  for (const r of requests) byDev[r.device].push(r);
  const keepByKeyDev = {}; const altByKeyDev = {}; const longPhrases = []; const unresolved = [];
  for (const [dev, reqs] of Object.entries(byDev)) {
    if (!reqs.length) continue;
    const bt = dev === "pc" ? chromium : webkit;
    const { browser, page } = await openBoxes(bt, reqs, fontUrl, rootVars);
    const tokensList = reqs.map((r) => r.tokens);
    const keeplessList = reqs.map((r) => !!r.keepless);
    const altList = reqs.map((r) => r.altTokens || null);
    const res = await page.evaluate(({ tokensList, altList, keeplessList, punctSrc }) => {
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
      // 1つのトークン列を測る：keep を 0,2,3,4 で試し、最後の行が4以上になる最小の keep。塊（nowrap）の幅も測る（A）
      function measure(el, toks, keepless) {
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
        for (const keep of keepless ? [0] : [0, 2, 3, 4]) {
          if (keepless) { el.innerHTML = build(0); natural = lastLineVisible(el).lastVisible; ok = true; break; }
          el.innerHTML = build(keep);
          const m = lastLineVisible(el);
          if (keep === 0) natural = m.lastVisible;
          if (m.lines <= 1 || m.lastVisible >= 4) { chosen = keep; ok = true; break; }
          chosen = keep;
        }
        const chunkW = {};
        for (const keep of [2, 3, 4]) {
          if (!(toks.length > keep)) continue;
          el.innerHTML = build(keep);
          const nw = el.querySelector(".nowrap");
          if (nw) chunkW[keep] = nw.getBoundingClientRect().width;
        }
        return { chosen, ok, natural, longPhrase, chunkW, boxW: w };
      }
      const out = [];
      const nodes = [...document.querySelectorAll(".m.lb")];
      for (let i = 0; i < nodes.length; i++) {
        const r = measure(nodes[i], tokensList[i], keeplessList[i]);
        if (altList[i]) r.alt = measure(nodes[i], altList[i], keeplessList[i]);
        out.push(r);
      }
      return out;
    }, { tokensList, altList, keeplessList, punctSrc: PUNCT_SRC });
    reqs.forEach((r, i) => {
      (keepByKeyDev[r.key] ??= {})[dev] = res[i];
      if (res[i].alt) (altByKeyDev[r.key] ??= {})[dev] = res[i].alt;
      if (res[i].longPhrase) longPhrases.push(`${r.key} [${dev}]`);
      if (!res[i].ok) unresolved.push(`${r.key} [${dev}]`);
    });
    await browser.close();
  }
  const keep = {}; const alt = {}; const overflowFixed = [];
  for (const [k, dv] of Object.entries(keepByKeyDev)) {
    const c = chooseKeep(dv);
    keep[k] = c.keep;
    if (!c.fixed) continue;
    overflowFixed.push(k);
    // 営業時間の段落は曜日のまとまりで折り直す（B）。まとまりの keep も両端末に入る物にする
    const av = altByKeyDev[k];
    if (av && (av.pc || !dv.pc) && (av.sp || !dv.sp)) { keep[k] = chooseKeep(av).keep; alt[k] = true; }
  }
  // 1-b：決めた keep・alt の最後の HTML で、守りたい塊の中で行が変わるかを測る（PC は chromium、SP は webkit と chromium＝iPhone と Android）。
  //   折れていたら、その段落だけ塊を nowrap で包む（protect）。包んだ塊がどれかの端末の箱の幅＋KEEP_TOL より広ければ包まない（A と同じ規則）。
  const protect = {}; const protectSkipped = [];
  const pr = requests.filter((r) => r.ranges?.length);
  if (pr.length) {
    const byKey = {};
    for (const [dev, bt] of [["pc", chromium], ["sp", webkit], ["sp", chromium]]) {
      const reqs = pr.filter((r) => r.device === dev);
      if (!reqs.length) continue;
      const { browser, page } = await openBoxes(bt, reqs, fontUrl, rootVars);
      const items = reqs.map((r) => {
        const a = !!alt[r.key];
        return { html: joinTokens(a ? r.altTokens : r.tokens, keep[r.key] || 0), protHtml: (a ? r.altProt : r.prot).join("<wbr>"), ranges: r.ranges };
      });
      const res = await page.evaluate((items) => {
        const nodes = [...document.querySelectorAll(".m.lb")];
        return items.map((it, i) => {
          const el = nodes[i];
          el.innerHTML = it.html;
          const tops = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const g = document.createRange(); let n;
          while ((n = walk.nextNode())) for (let k = 0; k < n.length; k++) { g.setStart(n, k); g.setEnd(n, k + 1); const b = g.getBoundingClientRect(); tops.push(b.width === 0 && b.height === 0 ? null : b.top); }
          let broken = false;
          for (const [s, e] of it.ranges) { let first = null; for (let k = s; k < e && k < tops.length; k++) { if (tops[k] == null) continue; if (first == null) first = tops[k]; else if (Math.abs(tops[k] - first) > 2) { broken = true; break; } } if (broken) break; }
          el.innerHTML = it.protHtml;
          const w = el.clientWidth; let maxW = 0;
          for (const s of el.querySelectorAll(".nowrap")) maxW = Math.max(maxW, s.getBoundingClientRect().width);
          return { broken, maxW, boxW: w };
        });
      }, items);
      reqs.forEach((r, i) => { const o = (byKey[r.key] ??= { broken: false, fits: true }); if (res[i].broken) o.broken = true; if (res[i].maxW > res[i].boxW + KEEP_TOL) o.fits = false; });
      await browser.close();
    }
    for (const [k, o] of Object.entries(byKey)) { if (!o.broken) continue; if (o.fits) protect[k] = true; else protectSkipped.push(k); }
  }
  return { keep, alt, protect, protectSkipped, overflowFixed, longPhrases, unresolved };
}

// 測る箱を並べたページを開く（computeLineBreakKeep の中で使う）
async function openBoxes(bt, reqs, fontUrl, rootVars) {
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
  return { browser, page };
}
