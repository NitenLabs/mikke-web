// 改行の層（ブラウザで DOM を測る）。packages/core に移した（元 experiments/layout/playground30/model/playground/textlayer.js）。
// 中身は元のまま。BUDOUX は前は1つの HTML に焼き込んだ budoux を指していた。ここでは npm の budoux を読む。
import { Parser, jaModel } from "budoux";
const BUDOUX = { Parser, model: jaModel };
// 改行の層（ブラウザ側）：本線 linebreak.mjs と同じ規則を、DOM 実測で再現する。
// budoux は BUDOUX.Parser + BUDOUX.model から parser を作る（loadDefaultJapaneseParser 相当）。
// これで tokenize（R1 文節）・keep（R2 最終行4字）・joinTokens を本線と一致させる＝配置が compare と揃う。
export const TEXT = (function () {
  const jaParser = new BUDOUX.Parser(BUDOUX.model);
  const splitPhrases = (t) => (t ? jaParser.parse(t) : []);
  const PUNCT_SRC = "[\\s、。，．・…！？!?（）()「」『』【】〔〕［］\\[\\]｛｝{}〈〉《》＜＞<>：；:;”“\"'‘’—－ー―~〜／/]";
  const PUNCT = new RegExp(PUNCT_SRC, "g");
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // 守りたい塊（本線 linebreak.mjs の PROTECT_SRC と同じ。指示 0064）：時刻の範囲・時刻・（L.O. 21:00）・数＋単位。
  //   中で文節を切らない（1-a）。測って中で折れたら nowrap で包む（1-b。buildH）
  const PROTECT_SRC = String.raw`(?:翌)?\d{1,2}:\d{2}(?:\s*[〜~～]\s*(?:翌)?\d{1,2}:\d{2})?|（?L\.O\.\s*(?:翌)?\d{1,2}:\d{2}）?|\d{1,3}(?:,\d{3})*(?:席|名様|名|円|分|時間|人|品|貫|本|台|個|枚|杯|皿|種|部|年|歳|g|ml)`;
  function protectedRanges(text) {
    const out = []; if (!text) return out; const re = new RegExp(PROTECT_SRC, "g"); let m;
    while ((m = re.exec(text))) { if (!m[0].length) { re.lastIndex++; continue; } out.push([m.index, m.index + m[0].length]); }
    return out;
  }
  // 文節の列を、境が守りたい塊の中に来る所でつなぐ
  function mergePhrases(phrases, ranges) {
    if (!ranges.length) return phrases;
    const out = []; let pos = 0;
    for (const ph of phrases) { if (out.length && ranges.some(([a, b]) => a < pos && pos < b)) out[out.length - 1] += ph; else out.push(ph); pos += ph.length; }
    return out;
  }
  const rangeIdx = (ranges, i) => ranges.findIndex(([a, b]) => a <= i && i < b);
  // runs=[{text}]、lb=改行規則の有無。lb=false は1トークン。
  function tokenize(runs, lb) {
    const toks = [];
    for (const r of runs) {
      if (!lb || !r.text) { toks.push(`<span>${esc(r.text || "")}</span>`); continue; }
      for (const ph of mergePhrases(splitPhrases(r.text), protectedRanges(r.text))) toks.push(`<span>${esc(ph)}</span>`);
    }
    return toks;
  }
  // 1-b 用：tokenize と同じトークンで、守りたい塊を nowrap で包んだ物（塊が無ければ null）
  function tokenizeProt(runs, lb) {
    if (!lb) return null; const toks = []; let any = false;
    for (const r of runs) {
      if (!r.text) { toks.push("<span></span>"); continue; }
      const rg = protectedRanges(r.text); if (rg.length) any = true;
      let pos = 0;
      for (const ph of mergePhrases(splitPhrases(r.text), rg)) { toks.push("<span>" + wrapRanges(ph, pos, rg, (i, j) => esc(ph.slice(i, j))) + "</span>"); pos += ph.length; }
    }
    return any ? toks : null;
  }
  // 文字列 text（全体の中の位置 base から）のうち守りたい塊の所を <span class="nowrap"> で包む。piece(t) は中身の HTML
  function wrapRanges(text, base, ranges, piece) {
    let out = "", i = 0;
    while (i < text.length) { const ri = rangeIdx(ranges, base + i); let j = i + 1; while (j < text.length && rangeIdx(ranges, base + j) === ri) j++;
      out += ri >= 0 ? '<span class="nowrap">' + piece(i, j) + "</span>" : piece(i, j); i = j; }
    return out;
  }
  // 文の一部の見た目（試験台13）：ひと続きの切れ目 runs=[{text,bold?,color?,scale?}] を、改行の切れ目（phrase）ごとに
  // 見た目つきの span に分けてトークン化する。色は token 名なら CSS 変数、#hex ならそのまま。大きさは箱に対する倍率（em）。
  function runStyleCss(r) {
    const s = [];
    // §19 文の一部の書体（テンプレートの heading/body を参照）。font/link が無い run の出力は従来と1文字も変えない。
    if (r.font && typeof SPEC !== "undefined" && SPEC.FONT) s.push("font-family:" + (SPEC.FONT[r.font] || r.font));
    if (r.bold) s.push("font-weight:700");
    if (r.italic) s.push("font-style:italic");          // J4 斜体・下線（run に無ければ出力は従来と同じ）
    if (r.underline && !r.link) s.push("text-decoration:underline");
    if (r.color) s.push("color:" + (/^#/.test(r.color) ? r.color : ("var(--c-" + r.color + ")")));
    if (r.scale && r.scale !== 1) s.push("font-size:" + r.scale + "em");
    // §19 リンクの見た目：下線 1px・文字の下 3px・色はまわりと同じ（テンプレートの決まり）
    if (r.link) { s.push("text-decoration:underline"); s.push("text-decoration-thickness:1px"); s.push("text-underline-offset:3px"); }
    return s.join(";");
  }
  // prot=true のとき、守りたい塊を nowrap で包んだトークンを返す（塊が無ければ null）
  function tokenizeRuns(runs, lb, prot) {
    const plain = runs.map((r) => r.text || "").join("");
    if (!plain) return prot ? null : ["<span></span>"];
    const ranges = lb ? protectedRanges(plain) : [];
    if (prot && !ranges.length) return null;
    const phrases = lb ? mergePhrases(splitPhrases(plain), ranges) : [plain];
    const bnd = []; let o = 0; for (const r of runs) { const len = (r.text || "").length; bnd.push([o, o + len, r]); o += len; }
    const runAt = (i) => { for (const [s, e, r] of bnd) if (i >= s && i < e) return r; return runs.length ? runs[runs.length - 1] : {}; };
    const seg = (text, r) => { const css = runStyleCss(r); const lk = r.link ? (' data-lk="' + esc(JSON.stringify(r.link)) + '"') : ""; return (css || lk) ? ('<span' + lk + (css ? ' style="' + css + '"' : "") + '>' + esc(text) + "</span>") : esc(text); };
    const toks = []; let pos = 0;
    for (const ph of phrases) { const L = ph.length; if (L === 0) continue; const start = pos; pos += L; const end = start + L;
      let inner = ""; let i = start;
      while (i < end) { const r = runAt(i); const ri = prot ? rangeIdx(ranges, i) : -1; let j = i + 1; while (j < end && runAt(j) === r && (!prot || rangeIdx(ranges, j) === ri)) j++; inner += seg(plain.slice(i, j), r); i = j; }
      if (prot) { // 塊ごとに nowrap で包む（同じ塊の続きの seg はまとめる）
        inner = ""; i = start; let open = -1;
        while (i < end) { const r = runAt(i); const ri = rangeIdx(ranges, i); let j = i + 1; while (j < end && runAt(j) === r && rangeIdx(ranges, j) === ri) j++;
          if (ri !== open) { if (open >= 0) inner += "</span>"; if (ri >= 0) inner += '<span class="nowrap">'; open = ri; }
          inner += seg(plain.slice(i, j), r); i = j; }
        if (open >= 0) inner += "</span>";
      }
      toks.push("<span>" + inner + "</span>");
    }
    return toks.length ? toks : ["<span></span>"];
  }
  function joinTokens(toks, keep) {
    if (keep > 0 && toks.length > keep) {
      const head = toks.slice(0, toks.length - keep);
      const tail = toks.slice(toks.length - keep);
      return head.join("<wbr>") + '<wbr><span class="nowrap">' + tail.join("") + "</span>";
    }
    return toks.join("<wbr>");
  }

  // keep を DOM で測る（本線 computeLineBreakKeep の evaluate と同じ手順）。
  // meas: 実測用の隠し要素（.t.lb 相当のCSS＋width＋文字の段が当たっている状態にして呼ぶ）
  function lastLineVisible(el) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n; const range = document.createRange(); let maxBottom = -1; const chars = [];
    while ((n = walk.nextNode())) {
      for (let k = 0; k < n.length; k++) {
        range.setStart(n, k); range.setEnd(n, k + 1);
        const rc = range.getBoundingClientRect(); if (rc.width === 0 && rc.height === 0) continue;
        chars.push({ ch: n.data[k], top: Math.round(rc.top) }); maxBottom = Math.max(maxBottom, Math.round(rc.top));
      }
    }
    const last = chars.filter((c) => c.top === maxBottom).map((c) => c.ch).join("");
    const lines = new Set(chars.map((c) => c.top)).size;
    return { lastVisible: (last || "").replace(PUNCT, "").length, lines };
  }
  function chooseKeep(meas, toks) {
    const build = (keep) => keep > 0 && toks.length > keep
      ? toks.slice(0, toks.length - keep).join("<wbr>") + '<wbr><span class="nowrap">' + toks.slice(toks.length - keep).join("") + "</span>"
      : toks.join("<wbr>");
    let chosen = 0;
    for (const keep of [0, 2, 3, 4]) {
      meas.innerHTML = build(keep); const m = lastLineVisible(meas); chosen = keep;
      if (m.lines <= 1 || m.lastVisible >= 4) break;
    }
    return fitKeep(meas, build, chosen);
  }
  // 本線 linebreak.mjs の chooseKeep（A）と同じ：まとめた塊（nowrap）が箱の幅＋KEEP_TOL に入らなければ、入る最大の keep に下げる。
  // （この層は箱を端末ごとに測るので、その端末の箱だけで判定する。営業時間の曜日のまとまり（B）は run に format が無いのでここには無い）
  const KEEP_TOL = 2;
  function fitKeep(meas, build, keep) {
    const fits = (k) => {
      if (k === 0) return true;
      meas.innerHTML = build(k); const nw = meas.querySelector(".nowrap");
      return !nw || nw.getBoundingClientRect().width <= meas.clientWidth + KEEP_TOL;
    };
    if (fits(keep)) return keep;
    for (const k of [4, 3, 2]) if (k < keep && fits(k)) return k;
    return 0;
  }

  // 要素の文字で、守りたい塊の中で行が変わる所があるか（文字ごとの矩形の上端が 2px より違う）
  function rangeBroken(el) {
    const tops = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const g = document.createRange(); let n; let txt = "";
    while ((n = walk.nextNode())) for (let k = 0; k < n.length; k++) { g.setStart(n, k); g.setEnd(n, k + 1); const r = g.getBoundingClientRect(); tops.push(r.width === 0 && r.height === 0 ? null : r.top); txt += n.data[k]; }
    for (const [a, b] of protectedRanges(txt)) { let first = null; for (let k = a; k < b; k++) { if (tops[k] == null) continue; if (first == null) first = tops[k]; else if (Math.abs(tops[k] - first) > 2) return true; } }
    return false;
  }
  // H を作る：collectTextBoxes の各箱を tokenize→keep→join。返り値 Map key->{html}
  // measRoot: keep 実測用の隠しコンテナ（呼び出し側が用意。:root font-size 10px 配下）
  const MEAS_BASE = "position:absolute;left:0;top:0;visibility:hidden;white-space:break-spaces;line-break:strict;word-break:keep-all;overflow-wrap:anywhere";
  function buildH(boxes, measRoot, SPEC) {
    const meas = document.createElement("div");
    measRoot.appendChild(meas);
    const H = new Map();
    for (const b of boxes) {
      const lb = SPEC.lbOf(b.styleName);
      const toks = (b.runs && b.runs.length) ? tokenizeRuns(b.runs, lb) : tokenize([{ text: b.text }], lb);
      let keep = 0;
      if (lb) {
        meas.style.cssText = MEAS_BASE; // 箱ごとにリセット（前の箱の font 指定を残さない）
        for (const d of SPEC.textDecls(b.styleName, b.device)) { const i = d.indexOf(":"); meas.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
        // 文字の見た目（大きさ・太さ）の手直しがあれば、改行の測りもその値で行う（表示と改行幅をそろえる）
        if (b.sizePx != null) meas.style.fontSize = b.sizePx + "px";
        if (b.weightOv != null) meas.style.fontWeight = b.weightOv;
        if (b.fontOv != null) meas.style.fontFamily = b.fontOv;   // §19 箱の書体で改行を測る（指定が無ければ従来どおり）
        meas.style.width = b.widthPx + "px";
        keep = chooseKeep(meas, toks);
      }
      let html = joinTokens(toks, lb ? keep : 0);
      // 1-b：守りたい塊の中で行が変わるなら、塊を nowrap で包む（包んだ塊が箱の幅＋KEEP_TOL より広ければ包まない。本線と同じ）
      if (lb) {
        const ptoks = (b.runs && b.runs.length) ? tokenizeRuns(b.runs, lb, true) : tokenizeProt([{ text: b.text }], lb);
        if (ptoks && ptoks.length === toks.length) {
          meas.innerHTML = html;
          if (rangeBroken(meas)) {
            meas.innerHTML = ptoks.join("<wbr>");
            let maxW = 0; for (const n of meas.querySelectorAll(".nowrap")) maxW = Math.max(maxW, n.getBoundingClientRect().width);
            if (maxW <= meas.clientWidth + KEEP_TOL) html = joinTokens(ptoks, keep);
          }
        }
      }
      H.set(b.key, { html });
    }
    meas.remove();
    return H;
  }
  return { tokenize, joinTokens, buildH, esc, runStyleCss };
})();
