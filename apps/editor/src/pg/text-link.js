// リンク（行き先・名前・自動リンクの見分け・部品のリンク）
// 線：A1｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
const DEFAULT_ELINK = { I_pillbg: { kind: "page", page: "pg_menu" } };
function resolveHref(lk) {
  if (!lk) return "";
  switch (lk.kind) {
    case "tel": return "tel:" + STORE.tel.digits;
    case "mail": return "mailto:" + STORE.mail;
    case "instagram": return "https://www.instagram.com/" + STORE.instagram + "/";
    case "line": return STORE.line;
    case "map": return "https://www.google.com/maps/search/?api=1&query=" + STORE.map.lat + "," + STORE.map.lng;
    case "order": return STORE.order;
    case "page": { const p = PAGES.find((x) => x.id === lk.page); return p ? p.slug : "#"; }
    case "anchor": return "#" + (lk.sec || "");
    case "url": return lk.href || "";
    case "mailto": return "mailto:" + (lk.addr || "");
  }
  return "";
}
function linkLabel(lk) {
  if (!lk) return "";
  switch (lk.kind) {
    case "tel": return "お店に電話（" + STORE.tel.display + "）";
    case "mail": return "お店にメール（" + STORE.mail + "）";
    case "instagram": return "お店の Instagram（@" + STORE.instagram + "）";
    case "line": return "お店の LINE";
    case "map": return "地図で見る";
    case "order": return "注文する";
    case "page": { const p = PAGES.find((x) => x.id === lk.page); return p ? p.label : "ページ"; }
    case "anchor": return "このページの『" + friendlySec(lk.sec) + "』";
    case "url": return (lk.href || "").replace(/^https?:\/\//i, "");
    case "mailto": return lk.addr || "";
  }
  return "";
}
// 公開（新しいタブで開くか）：よそのホームページだけ別タブ（§2.3）
const linkOpensNewTab = (lk) => !!lk && (lk.kind === "url" || lk.kind === "instagram" || lk.kind === "line" || lk.kind === "order" || lk.kind === "map");
// 欄に書いたアドレスを直す（§2.2）：http(s)→そのまま／www.・文字.文字→https:// を付ける／メール→メール／それ以外→null
function parseExternalLink(s) {
  s = (s || "").trim(); if (!s) return null;
  if (/^https?:\/\//i.test(s)) return { kind: "url", href: s };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { kind: "mailto", addr: s };
  if (/^www\./i.test(s)) return { kind: "url", href: "https://" + s };
  if (/^[^\s/@]+\.[a-z]{2,}([/?#].*)?$/i.test(s)) return { kind: "url", href: "https://" + s };   // 文字.文字
  return null;
}
// 自動リンク（打つ・貼る）：http(s)・www.・メールだけ（文字.文字 や 電話番号は対象外。§2.5）
function parseAutoLink(s) {
  s = (s || "").trim(); if (!s) return null;
  if (/^https?:\/\/\S+$/i.test(s)) return { kind: "url", href: s };
  if (/^www\.\S+$/i.test(s)) return { kind: "url", href: "https://" + s };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { kind: "mailto", addr: s };
  return null;
}

// §19 書き換え中でないとき、部品の一部にリンクを当てる／外す（runsMap に 1 op で記録＝「戻す」1回で戻る）
function setPartLinkCommitted(part, s, e, link) {
  const c = canonId(part); const R = reduce(activeOps());
  let runs = R.runsMap[c] ? clone(R.runsMap[c]) : [{ text: rawText(c, R) }];
  runs = applyRunRange(runs, s, e, (r) => { if (!link) delete r.link; else r.link = clone(link); });
  commit({ t: "edit", id: c, runs });
}
// 部品まるごとリンク（写真・ボタン）
function elementLinkOf(id) { const c = canonId(id); const R = reduce(activeOps()); return R.linkMap[c] || DEFAULT_ELINK[c] || null; }
function setElementLink(id, link) { commit({ t: "elink", id: canonId(id), link: link || null }); }
function removeElementLink(id) { commit({ t: "elink", id: canonId(id), link: null }); }
function canElementLink(id) { const c = canonId(id); return /^F_p\d$/.test(c) || /^addp_/.test(c) || c === "I_pillbg" || /^card_photo_/.test(c) || a1BoxLinkable(c); }
// P14 文字の箱まるごとのリンク（写真と同じ。品・表の中の1件の文字は品の情報なので対象にしない）
function a1BoxLinkable(c) { return isText(c) && !isRepeat(c); }
// 入口：部品まるごとリンク（既定も含める）
function elementLinkApi(id) { const lk = elementLinkOf(id); return lk ? { link: clone(lk), label: linkLabel(lk), href: resolveHref(lk), newTab: linkOpensNewTab(lk) } : null; }
// 入口：文の一部のリンクの範囲＋つなぎ先（部品ごと）。部品まるごとのリンクも合わせて返す。
function linksApi(part) {
  const c = canonId(part); const runs = textRunsApi(c); const out = []; let o = 0;
  for (const r of runs) { const len = (r.text || "").length; if (r.link) out.push({ s: o, e: o + len, text: r.text, link: clone(r.link), label: linkLabel(r.link), href: resolveHref(r.link), newTab: linkOpensNewTab(r.link) }); o += len; }
  return { part: c, runs: out, element: elementLinkApi(c) };
}

