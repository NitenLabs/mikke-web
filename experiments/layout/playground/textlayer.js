// 改行の層（ブラウザ側）：本線 linebreak.mjs と同じ規則を、DOM 実測で再現する。
// budoux は BUDOUX.Parser + BUDOUX.model から parser を作る（loadDefaultJapaneseParser 相当）。
// これで tokenize（R1 文節）・keep（R2 最終行4字）・joinTokens を本線と一致させる＝配置が compare と揃う。
const TEXT = (function () {
  const jaParser = new BUDOUX.Parser(BUDOUX.model);
  const splitPhrases = (t) => (t ? jaParser.parse(t) : []);
  const PUNCT_SRC = "[\\s、。，．・…！？!?（）()「」『』【】〔〕［］\\[\\]｛｝{}〈〉《》＜＞<>：；:;”“\"'‘’—－ー―~〜／/]";
  const PUNCT = new RegExp(PUNCT_SRC, "g");
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // runs=[{text}]、lb=改行規則の有無。lb=false は1トークン。
  function tokenize(runs, lb) {
    const toks = [];
    for (const r of runs) {
      if (!lb || !r.text) { toks.push(`<span>${esc(r.text || "")}</span>`); continue; }
      for (const ph of splitPhrases(r.text)) toks.push(`<span>${esc(ph)}</span>`);
    }
    return toks;
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
      if (m.lines <= 1 || m.lastVisible >= 4) return keep;
    }
    return chosen;
  }

  // H を作る：collectTextBoxes の各箱を tokenize→keep→join。返り値 Map key->{html}
  // measRoot: keep 実測用の隠しコンテナ（呼び出し側が用意。:root font-size 10px 配下）
  const MEAS_BASE = "position:absolute;left:0;top:0;visibility:hidden;white-space:normal;line-break:strict;word-break:keep-all;overflow-wrap:anywhere";
  function buildH(boxes, measRoot, SPEC) {
    const meas = document.createElement("div");
    measRoot.appendChild(meas);
    const H = new Map();
    for (const b of boxes) {
      const lb = SPEC.lbOf(b.styleName);
      const toks = tokenize([{ text: b.text }], lb);
      let keep = 0;
      if (lb) {
        meas.style.cssText = MEAS_BASE; // 箱ごとにリセット（前の箱の font 指定を残さない）
        for (const d of SPEC.textDecls(b.styleName, b.device)) { const i = d.indexOf(":"); meas.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
        // 文字の見た目（大きさ・太さ）の手直しがあれば、改行の測りもその値で行う（表示と改行幅をそろえる）
        if (b.sizePx != null) meas.style.fontSize = b.sizePx + "px";
        if (b.weightOv != null) meas.style.fontWeight = b.weightOv;
        meas.style.width = b.widthPx + "px";
        keep = chooseKeep(meas, toks);
      }
      H.set(b.key, { html: joinTokens(toks, lb ? keep : 0) });
    }
    meas.remove();
    return H;
  }
  return { tokenize, joinTokens, buildH, esc };
})();
