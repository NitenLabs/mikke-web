// 触って作る層 3（動かす・戻す・その場で書き換える）。配置と操作は C3（c3-edit）に委ね、ここは
// 操作の記録（undo/redo つき）→ content/edits への還元 → 描画 → 絶対配置の当てはめ → 選択・ドラッグ・
// その場書き換え・キーボード・クリップボード・戻す だけを持つ。方式は今回の1つだけ（§0-2）。
const PG = (function () {
  const M = C3; // 唯一の方式
  const base = () => JSON.parse(JSON.stringify(CONTENT_JSON));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const S1_ADD = "毎朝炊いた餡を、その日のうちにお出しします。手のひらにのる小さな菓子に、季節のうつろいを写します。四季折々の意匠をお楽しみください。";
  const S2_HEAD = "季節の上生菓子と、その月だけの特別な意匠";

  // §2 部品 ID の名前空間：最初からある特集・品（anchor）は素の ID（F_h0 など）のまま。複製・追加したセクションの部品だけ
  // 「セクションID__素のID」（例 sec3__F_h0）にして重ならないようにする。bareOf/instTag/prefixOf で素とインスタンスを分ける。
  const SEP = "__";
  const bareOf = (id) => { const i = id.indexOf(SEP); return i >= 0 ? id.slice(i + 2) : id; };
  const instTag = (id) => { const i = id.indexOf(SEP); return i >= 0 ? id.slice(0, i) : null; };
  const prefixOf = (id) => { const t = instTag(id); return t ? t + SEP : ""; };
  const withPfx = (pfx, id) => (pfx ? pfx + id : id);
  const HG = { feature: "F_hg", items: "I_hg" };
  // §5：表・品の並び・ボタンも動かせる（I_table / I_cards / I_pillbg を足す）
  const TEMPLATE_DRAG = ["F_hg", "F_p0", "F_h0", "F_b0", "F_p1", "F_h1", "F_b1", "I_hg", "I_cards", "I_divider", "I_kanmi", "I_time", "I_table", "I_pillbg"];
  // ボタンは文字(I_pilltext)と背景(I_pillbg)を一緒に扱う＝文字クリックでも背景を選ぶ（§5）
  const HG_MEMBERS = { F_lbl: "F_hg", F_h: "F_hg", F_rule: "F_hg", I_lbl: "I_hg", I_h: "I_hg", I_rule: "I_hg", I_pilltext: "I_pillbg" };
  // 繰り返す部品を中に持つ子（品の並び・表）：中の1件・文字が属するグループ（同じインスタンスの中）
  const groupOf = (id) => { const b = bareOf(id); const g = /^card_/.test(b) ? "I_cards" : (/^row_/.test(b) ? "I_table" : null); return g ? withPfx(prefixOf(id), g) : null; };
  const REPEAT = /^(card_|row_)/;
  const isRepeat = (id) => REPEAT.test(bareOf(id));
  const canonId = (id) => { const c = HG_MEMBERS[bareOf(id)]; return c ? withPfx(prefixOf(id), c) : id; };
  const isAdded = (id) => /^addp?_/.test(id);
  const isDraggable = (id) => TEMPLATE_DRAG.includes(bareOf(canonId(id))) || isAdded(id);
  const isText = (id) => { const b = bareOf(id); return /^F_[hb]\d$|^add_/.test(b) || /^card_(name|desc|price)_/.test(b) || /^row_(name|desc|price)_/.test(b) || b === "I_kanmi" || b === "I_time"; };
  // そのパーツが属するセクション（インスタンス ID）。anchor は "feature"/"items"、複製・追加は "sec3" 等。
  // §2.7（試験台24）土台にある足した部品にも効くよう、add op が記録の列に無ければ土台（state.base._pg.adds）も見る。
  const secOf = (id) => { const t = instTag(id); if (t) return t; if (isAdded(id)) { const op = activeOps().find((o) => o.t === "add" && o.id === id); if (op) return op.section; const ba = ((state.base && state.base.added) || []).find((a) => a.id === id); if (ba) return ba.section || secOf(ba.anchor); return "items"; } return id.startsWith("F_") ? "feature" : "items"; };
  // 並び替え（§6／§10.1）：縦に並んだ塊の中だけ。PC は文字の塊（見出し・本文）＝写真は横並びで対象外。SP はブロック（写真・見出し・本文）。
  function reorderClusterOf(id) {
    const dev = state.device; const pfx = prefixOf(id); const b = bareOf(id);
    for (const i of [0, 1]) { if (b === `F_h${i}` || b === `F_b${i}` || b === `F_p${i}`) {
      if (dev === "pc") return b === `F_p${i}` ? null : { key: pfx + `Ftg${i}`, sibs: [pfx + `F_h${i}`, pfx + `F_b${i}`] };
      return { key: pfx + `Fblk${i}`, sibs: [pfx + `F_p${i}`, pfx + `F_h${i}`, pfx + `F_b${i}`] };
    } }
    // 品のセクションの stack の縦積みの直接の子すべてが並び替えの相手（§3・§5）。中の1件・文字はグループに畳む（I_pilltext→I_pillbg は canonId 済み）
    if (["I_cards", "I_divider", "I_kanmi", "I_time", "I_table", "I_pillbg"].includes(b)) return { key: pfx + "Istack", sibs: ["I_cards", "I_divider", "I_kanmi", "I_time", "I_table", "I_pillbg"].map((x) => withPfx(pfx, x)) };
    return null;
  }

  // ---- 文字の見た目（大きさ・太さ・色。試験台12）----
  // weight・color は両端末で共通、size は端末ごと。手直しは部品ごと（繰り返す部品は「全件の同じ所」＝フィールド単位）。
  const SIZE_LIST = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80];
  const SIZE_MIN = 8, SIZE_MAX = 120;
  // 手直しの鍵：繰り返す1件（品・表の行）はフィールドに畳む（全件の同じ所に効く）。それ以外は部品 ID。
  // §2 セクションの見出し（F_h / I_h「芦屋堂の味」等）は、ふだんは見出しの組（F_hg）にまとめて動かすが、文字の大きさ等は個別に効く（C10）。
  const isHeadingGroup = (id) => { const b = bareOf(id); return b === "F_hg" || b === "I_hg"; };
  const headingTextOf = (id) => withPfx(prefixOf(id), bareOf(id) === "F_hg" ? "F_h" : "I_h");
  const isHeadingText = (id) => { const b = bareOf(id); return b === "F_h" || b === "I_h"; };
  // 見出しの文字は自分自身を鍵にする（組にまとめない＝ラベルまで大きくならない）。それ以外は従来どおり canonId。
  function tsKeyOf(id) { const b = bareOf(id); const m = b.match(/^(card|row)_(name|desc|price)_/); if (m) return withPfx(prefixOf(id), m[1] + "_" + m[2]); if (isHeadingText(id)) return withPfx(prefixOf(id), b); return canonId(id); }
  // 文字箱（collectTextBoxes の key）→ 手直しの鍵
  function tsKeyBox(k) { if (/^I_cn_/.test(k)) return "card_name"; if (/^I_cd_/.test(k)) return "card_desc"; if (/^I_cp_/.test(k)) return "card_price"; if (/^I_tn_/.test(k)) return "row_name"; if (/^I_td_/.test(k)) return "row_desc"; if (/^I_tp_/.test(k)) return "row_price"; return k; }
  // 文字箱の key → 部品 ID（runs は部品＝1件ごと）
  function partIdOfBox(k) { let m; if ((m = k.match(/^I_cn_(.+)$/))) return "card_name_" + m[1]; if ((m = k.match(/^I_cd_(.+)$/))) return "card_desc_" + m[1]; if ((m = k.match(/^I_cp_(.+)$/))) return "card_price_" + m[1]; if ((m = k.match(/^I_tn_(.+)$/))) return "row_name_" + m[1]; if ((m = k.match(/^I_td_(.+)$/))) return "row_desc_" + m[1]; if ((m = k.match(/^I_tp_(.+)$/))) return "row_price_" + m[1]; if (k === "I_pill") return "I_pilltext"; return k; }
  // 部品 ID → 文字の段（テンプレの既定の大きさ・太さ・色を引く）
  function styleNameOf(id) {
    const b = bareOf(id);
    if (b === "F_h" || b === "I_h") return "secHead";   // §2 セクションの見出し（個別に大きさ等が効く・C10）
    if (/^F_h\d$/.test(b)) return "featHead"; if (/^F_b\d$/.test(b)) return "featBody";
    if (/^card_name_/.test(b)) return "cardName"; if (/^card_desc_/.test(b)) return "cardDesc"; if (/^card_price_/.test(b)) return "cardPrice";
    if (/^row_name_/.test(b)) return "tName"; if (/^row_desc_/.test(b)) return "tDesc"; if (/^row_price_/.test(b)) return state.device === "pc" ? "tPriceR" : "tPriceL";
    if (b === "I_kanmi") return "kanmiLbl"; if (b === "I_time") return "kanmiTime"; if (b === "I_pilltext") return "pill";
    if (/^add_/.test(b)) { const a = reduce(activeOps()).added.find((a) => a.id === id); return a ? (a.styleName || "featBody") : "featBody"; }
    return null;
  }
  // この端末で見える大きさ（端末ごと。まだ触っていない方は、触った方の倍率を引き継ぐ）
  function effSize(styleName, device, ts) {
    const st = SPEC.STYLES[styleName]; const s = (ts && ts.size) || {};
    if (s[device] != null) return { size: s[device], own: true };
    const o = device === "pc" ? "sp" : "pc";
    if (s[o] != null) return { size: Math.round(st.size[device] * (s[o] / st.size[o])), own: false };
    return { size: st.size[device], own: false };
  }
  const colorVal = (c) => (/^#/.test(c) ? c : (SPEC.COLORS[c] || c));
  // 今選んでいる文字の部品の鍵（重複なし）・代表
  // 選択の中の「文字の鍵」。見出しの組（F_hg）を選んでいるときは、その中の見出し文字（F_h）の鍵にする（C10）。
  function selTextKeys() { const ks = []; for (const id of state.selected) { if (isText(id)) ks.push(tsKeyOf(id)); else if (isHeadingGroup(id)) ks.push(tsKeyOf(headingTextOf(id))); } return [...new Set(ks)]; }
  function primaryTextSel() { for (const id of state.selected) { if (isText(id)) return id; if (isHeadingGroup(id)) return headingTextOf(id); } return null; }
  function curTs(id) { return reduce(activeOps()).textStyles[tsKeyOf(id)]; }
  function curSizeOf(id) { return effSize(styleNameOf(id), state.device, curTs(id)).size; }
  function curWeightOf(id) { const ts = curTs(id); return ts && ts.weight != null ? ts.weight : SPEC.STYLES[styleNameOf(id)].weight; }
  // 大きさ：欄に打った値（8〜120 に丸める）。選んでいる文字の部品すべて（繰り返しは全件）に効く＝1操作=1undo。
  function textSetSize(px) { px = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(px))); const keys = selTextKeys(); if (!keys.length) return; const prim = primaryTextSel(); if (prim && curSizeOf(prim) === px) return; commit({ t: "tstyle", keys, device: state.device, size: px }); }
  function textStep(dir) { const prim = primaryTextSel(); if (!prim) return; const cur = curSizeOf(prim); let nx; if (dir > 0) nx = SIZE_LIST.find((v) => v > cur); else { const less = SIZE_LIST.filter((v) => v < cur); nx = less.length ? less[less.length - 1] : null; } if (nx == null || nx === cur) return; const keys = selTextKeys(); commit({ t: "tstyle", keys, device: state.device, size: nx }); }
  function textToggleBold() { const prim = primaryTextSel(); if (!prim) return; const nw = curWeightOf(prim) >= 700 ? 400 : 700; const keys = selTextKeys(); if (!keys.length) return; commit({ t: "tstyle", keys, weight: nw }); }
  function textSetColor(color) { const keys = selTextKeys(); if (!keys.length) return; commit({ t: "tstyle", keys, color }); }
  // §19 箱まるごとの書体（色と同じ扱い：端末共通・「このページを元に戻す」で戻る）
  function textSetFont(font) { const keys = selTextKeys(); if (!keys.length) return; commit({ t: "tstyle", keys, font }); }
  function curFontOf(id) { const ts = curTs(id); return ts && ts.font != null ? ts.font : (SPEC.STYLES[styleNameOf(id)] || {}).font; }
  // §20 列（品の並び）
  const COL_DEFAULT = (device) => device === "pc" ? 3 : 1;
  const COL_CHOICES = (device) => device === "pc" ? [2, 3, 4] : [1, 2];
  const isCardsGroup = (id) => canonId(id) === "I_cards" || /__I_cards$/.test(canonId(id)) === false && bareOf(id) === "I_cards";
  function colsOf(id, device) { device = device || state.device; const c = canonId(id); const m = reduce(activeOps()).colsMap[c]; return (m && m[device] != null) ? m[device] : COL_DEFAULT(device); }
  function setCols(id, n) { const c = canonId(id); if (colsOf(c) === n) return; commit({ t: "cols", device: state.device, id: c, n }); }
  function colWidthFor(id, n) { const e = geometry()[canonId(id)]; const cardsW = e ? e.w : (state.device === "pc" ? 1326 : 351); return (cardsW - 24 * (n - 1)) / n; }   // 1件の幅＝（並びの幅−24×(n−1)）÷n
  function colEnabled(id, n) { return colWidthFor(id, n) >= 120; }   // §2.2.8 1件の幅120未満は押せない
  // 見本に乗せている間の仮表示（記録しない）：render がこの上書きを優先する
  function setColsPreview(id, n) { state.colsPreview = { id: canonId(id), device: state.device, n }; render(); }
  function clearColsPreview() { if (!state.colsPreview) return; state.colsPreview = null; render(); }
  // §8 入口：品の並び・表の、設計pxでの 列/幅/x（省けば今の端末）
  function listLayout(device) {
    device = device || state.device;
    const grab = () => { const g = geometry(); const R = reduce(activeOps(), device); const out = {};
      if (g["I_cards"]) out.I_cards = { cols: colsOf("I_cards", device), w: +g["I_cards"].w.toFixed(2), x: +g["I_cards"].x.toFixed(2) };
      // §20b §2.4 表の幅は「記録の幅」を返す（描画時クランプで画面上は広がりうるが、記録は変わらない）
      if (g["I_table"]) { const rec = (R.sizes && R.sizes["I_table"] && R.sizes["I_table"].w != null) ? R.sizes["I_table"].w : g["I_table"].w; out.I_table = { w: +rec.toFixed(2), x: +g["I_table"].x.toFixed(2) }; }
      return out; };
    if (device === state.device) return grab();
    const here = state.device; state.device = device; render(); const out = grab(); state.device = here; render(); return out;
  }
  function colsApi() { return { choices: COL_CHOICES(state.device), current: colsOf("I_cards"), enabled: COL_CHOICES(state.device).map((n) => ({ n, enabled: colEnabled("I_cards", n), w: +colWidthFor("I_cards", n).toFixed(2) })) }; }
  // §5 左右を入れ替える（横並びの組＝PC の特集の2つの組の子のとき）
  function blockOfPart(id) { const m = bareOf(canonId(id)).match(/^F_[phb](\d)$/); return m ? +m[1] : null; }
  function canSwap(id) { if (state.device !== "pc") return false; const c = canonId(id); if (blockOfPart(c) == null) return false; const inst = reduce(activeOps()).secList.find((s) => s.id === secOf(c)); return !!(inst && inst.type === "feature"); }
  function swapHoriz(id) { const c = canonId(id); const block = blockOfPart(c); if (block == null) return; const sec = secOf(c); const pfx = isAnchorSec(sec) ? "" : sec + SEP; const clearM1 = ["F_p", "F_h", "F_b"].map((p) => pfx + p + block); commit({ t: "swap", device: state.device, sec, block, clearM1 }); }
  // 文字の見た目を元に戻す：箱まるごと（鍵）＋文の一部（この部品の runs）の両方（§2.2）
  // §23c X35：文字の見た目を元に戻すは「文字を打つ以外でその部品を変える」操作＝書き換え中なら先にふつうに終える（書き換えの外をクリックと同じ）。
  // 入り直した書き換え（戻す/やり直しで入り直した状態）でも同じ＝生きている runs（赤など）を先に確定させてから tstyleReset を積む（それをしないと textRunsApi が editing.runs を返して reset が反映されない）。
  function resetTextStyle(id) { if (state.editing) commitEdit(); commit({ t: "tstyleReset", keys: [tsKeyOf(id)], parts: [id] }); }
  function hasTextStyle(id) { return !!reduce(activeOps()).textStyles[tsKeyOf(id)]; }
  // §3.6 入口：今の端末の文字の部品の見た目（手直しのない部品も含める）
  function textStylesApi() {
    const R = reduce(activeOps(), state.device); const out = [];
    for (const inst of state.secList) {
      const host = document.getElementById(secHostId(inst)); if (!host) continue;
      for (const el of host.querySelectorAll('[data-kind="text"]')) {
        const id = el.getAttribute("data-el"); const sn = styleNameOf(id); if (!sn || isHeadingText(id)) continue;   // 見出し文字は従来どおり一覧に出さない（出力を第1回までと一致させる）
        const ts = R.textStyles[tsKeyOf(id)]; const es = effSize(sn, state.device, ts); const st = SPEC.STYLES[sn];
        out.push({ part: id, size: es.size, sizeOwn: es.own, weight: ts && ts.weight != null ? ts.weight : st.weight, color: ts && ts.color != null ? ts.color : st.color });
      }
    }
    return out;
  }

  // ---- §19 書体（テンプレートの書体だけ） ----
  // テンプレートの書体＝SPEC.FONT の heading/body（飾り用は無い）。名前は PowerPoint 風に「明朝／ゴシック」。
  const FONTS = [{ key: "heading", label: "明朝", role: "見出しの書体" }, { key: "body", label: "ゴシック", role: "本文の書体" }];
  const fontLabel = (k) => (FONTS.find((f) => f.key === k) || {}).label || k;
  function fontsApi() { return FONTS.map((f) => ({ ...f })); }

  // ---- §19 リンク（お店の情報・サイトのページ・そのほか） ----
  // お店の情報：samples/ashiyado の shop.json（電話・メール・Instagram・地図）。LINE と 注文先 は見本に無いため仮の値（報告する）。
  const STORE = {
    tel: { display: "0797-00-0000", digits: "0797000000" },
    mail: "info@example.com",
    instagram: "ashiyado_sample",
    line: "https://lin.ee/ashiyado-sample",        // 仮（見本に LINE が無い）
    map: { lat: 34.728, lng: 135.305, addr: "兵庫県芦屋市大原町0-0" },
    order: "https://example.com/order",            // 仮（見本に 品の注文先 が無い）
  };
  // サイトのページ：site.json の pages（ナビに出る3つ）。日本語の名前はこの試験台で割り当て（報告する）。
  const PAGES = [{ id: "pg_home", label: "トップ", slug: "/" }, { id: "pg_menu", label: "お品書き", slug: "/menu" }, { id: "pg_contact", label: "アクセス", slug: "/contact" }];
  const SECTION_LABELS = { feature: "芦屋堂の味", items: "おすすめの品" };
  const friendlySec = (sec) => SECTION_LABELS[sec] || SECTION_LABELS[secOf(sec)] || "セクション";
  const STORE_KINDS = ["tel", "mail", "instagram", "line", "map", "order"];
  function storeHas(kind) { const v = STORE[kind === "tel" ? "tel" : kind === "mail" ? "mail" : kind]; if (kind === "tel") return !!(STORE.tel && STORE.tel.digits); if (kind === "map") return !!STORE.map; return !!v; }
  function storeValueText(kind) {
    if (kind === "tel") return STORE.tel ? STORE.tel.display : "";
    if (kind === "mail") return STORE.mail || "";
    if (kind === "instagram") return STORE.instagram ? "@" + STORE.instagram : "";
    if (kind === "map") return STORE.map ? STORE.map.addr.slice(0, 6) : "";   // 住所の頭
    return "";
  }
  // 部品まるごとリンクの既定：ボタン「お品書きをすべて見る」はもともと お品書き（MENU）へ（O11）
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
  function canElementLink(id) { const c = canonId(id); return /^F_p\d$/.test(c) || /^addp_/.test(c) || c === "I_pillbg" || /^card_photo_/.test(c); }
  // 入口：部品まるごとリンク（既定も含める）
  function elementLinkApi(id) { const lk = elementLinkOf(id); return lk ? { link: clone(lk), label: linkLabel(lk), href: resolveHref(lk), newTab: linkOpensNewTab(lk) } : null; }
  // 入口：文の一部のリンクの範囲＋つなぎ先（部品ごと）。部品まるごとのリンクも合わせて返す。
  function linksApi(part) {
    const c = canonId(part); const runs = textRunsApi(c); const out = []; let o = 0;
    for (const r of runs) { const len = (r.text || "").length; if (r.link) out.push({ s: o, e: o + len, text: r.text, link: clone(r.link), label: linkLabel(r.link), href: resolveHref(r.link), newTab: linkOpensNewTab(r.link) }); o += len; }
    return { part: c, runs: out, element: elementLinkApi(c) };
  }

  // ---- 文の一部の見た目（runs。試験台13）----
  // 部品の中身を、見た目つきのひと続きの切れ目の並び [{text,bold?,color?,scale?,font?,link?}] で持つ（PC/SP 共通の中身）。
  function normRuns(runs) {
    const out = [];
    const lkEq = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
    for (const r of runs) { const t = r.text || ""; if (!t) continue; const last = out[out.length - 1];
      const same = last && !!last.bold === !!r.bold && (last.color == null ? null : last.color) === (r.color == null ? null : r.color) && (last.scale || 1) === (r.scale || 1) && (last.font || null) === (r.font || null) && lkEq(last.link, r.link);
      if (same) last.text += t; else out.push({ text: t, ...(r.bold ? { bold: true } : {}), ...(r.color != null ? { color: r.color } : {}), ...(r.scale && r.scale !== 1 ? { scale: +(+r.scale).toFixed(4) } : {}), ...(r.font ? { font: r.font } : {}), ...(r.link ? { link: clone(r.link) } : {}) });
    }
    return out.length ? out : [{ text: "" }];
  }
  function splitRunsAt(runs, pos) { const out = []; let o = 0; for (const r of runs) { const len = (r.text || "").length; if (pos > o && pos < o + len) { out.push({ ...r, text: r.text.slice(0, pos - o) }); out.push({ ...r, text: r.text.slice(pos - o) }); } else out.push({ ...r }); o += len; } return out; }
  function runsSlice(runs, s, e) { const r = splitRunsAt(splitRunsAt(runs, s), e); const sel = []; let o = 0; for (const run of r) { const len = (run.text || "").length; if (o >= s && o + len <= e && len > 0) sel.push(run); o += len; } return sel; }
  function applyRunRange(runs, s, e, fn) { const r = splitRunsAt(splitRunsAt(runs, s), e); let o = 0; for (const run of r) { const len = (run.text || "").length; if (o >= s && o + len <= e && len > 0) fn(run); o += len; } return normRuns(r); }
  const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 編集中の DOM（contenteditable）→ runs。見た目は span の data 属性で持つ（取り出しが正確）。
  function domToRuns(root) {
    const out = []; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = walk.nextNode())) { const t = n.data; if (t === "") continue; let bold = false, color = null, scale = 1, font = null, link = null, p = n.parentNode;
      while (p && p !== root) { if (p.nodeType === 1) { if (p.getAttribute("data-b") === "1" || p.tagName === "B" || p.tagName === "STRONG") bold = true; const c = p.getAttribute("data-c"); if (c && color == null) color = c; const sc = p.getAttribute("data-s"); if (sc) scale *= parseFloat(sc) || 1; const f = p.getAttribute("data-font"); if (f && font == null) font = f; const lk = p.getAttribute("data-lk"); if (lk && link == null) { try { link = JSON.parse(lk); } catch (e) {} } } p = p.parentNode; }
      out.push({ text: t, ...(bold ? { bold: true } : {}), ...(color != null ? { color } : {}), ...(Math.abs(scale - 1) > 1e-6 ? { scale: +scale.toFixed(4) } : {}), ...(font ? { font } : {}), ...(link ? { link } : {}) });
    }
    return normRuns(out);
  }
  function runSpan(r) { const css = TEXT.runStyleCss(r); const da = []; if (r.bold) da.push('data-b="1"'); if (r.color != null) da.push('data-c="' + r.color + '"'); if (r.scale && r.scale !== 1) da.push('data-s="' + r.scale + '"'); if (r.font) da.push('data-font="' + r.font + '"'); if (r.link) da.push("data-lk=\"" + escH(JSON.stringify(r.link)) + "\""); if (!css && !da.length) return escH(r.text); return "<span " + da.join(" ") + (css ? ' style="' + css + '"' : "") + ">" + escH(r.text) + "</span>"; }
  function runsToEditHtml(runs) { return runs.map(runSpan).join(""); }
  function rawRuns(id, R) { R = R || reduce(activeOps()); return R.runsMap[id] ? R.runsMap[id].map((r) => ({ ...r })) : [{ text: rawText(id, R) }]; }
  // 編集中の選択を文字オフセット [s,e] で取る
  function caretOffsets(root) { const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return null; const rg = sel.getRangeAt(0); if (!root.contains(rg.startContainer) && rg.startContainer !== root) return null;
    const off = (container, offset) => { if (container === root) { let cnt = 0; for (let i = 0; i < offset && i < root.childNodes.length; i++) cnt += (root.childNodes[i].textContent || "").length; return cnt; } let n = 0; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let x; while ((x = walk.nextNode())) { if (x === container) return n + offset; n += x.data.length; } return n; };
    let s = off(rg.startContainer, rg.startOffset), e = off(rg.endContainer, rg.endOffset); if (s > e) { const t = s; s = e; e = t; } return { s, e };
  }
  function setCaretOffsets(root, s, e) { const nodes = []; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let x; while ((x = walk.nextNode())) nodes.push(x);
    const sel = window.getSelection(); const rg = document.createRange();
    if (!nodes.length) { rg.selectNodeContents(root); rg.collapse(true); sel.removeAllRanges(); sel.addRange(rg); return; }
    let acc = 0, sNode = null, sOff = 0, eNode = null, eOff = 0;
    for (const nd of nodes) { const len = nd.data.length; if (sNode == null && s <= acc + len) { sNode = nd; sOff = s - acc; } if (e <= acc + len) { eNode = nd; eOff = e - acc; break; } acc += len; }
    if (!sNode) { sNode = nodes[nodes.length - 1]; sOff = sNode.data.length; } if (!eNode) { eNode = nodes[nodes.length - 1]; eOff = eNode.data.length; }
    rg.setStart(sNode, Math.max(0, Math.min(sOff, sNode.data.length))); rg.setEnd(eNode, Math.max(0, Math.min(eOff, eNode.data.length))); sel.removeAllRanges(); sel.addRange(rg);
  }
  // §19b（X22）文字オフセット [s,e] の画面上の矩形（最後の行で測る＝複数行は最終行の下に出す）。選択が外れていても使える。
  function rangeRectOf(root, s, e) {
    const nodes = []; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let x; while ((x = walk.nextNode())) nodes.push(x);
    if (!nodes.length) { const r = root.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }
    const rg = document.createRange(); let acc = 0, sNode = null, sOff = 0, eNode = null, eOff = 0;
    for (const nd of nodes) { const len = nd.data.length; if (sNode == null && s <= acc + len) { sNode = nd; sOff = s - acc; } if (e <= acc + len) { eNode = nd; eOff = e - acc; break; } acc += len; }
    if (!sNode) { sNode = nodes[nodes.length - 1]; sOff = sNode.data.length; } if (!eNode) { eNode = nodes[nodes.length - 1]; eOff = eNode.data.length; }
    rg.setStart(sNode, Math.max(0, Math.min(sOff, sNode.data.length))); rg.setEnd(eNode, Math.max(0, Math.min(eOff, eNode.data.length)));
    const rects = rg.getClientRects(); const bb = rg.getBoundingClientRect();
    const last = rects.length ? rects[rects.length - 1] : bb;   // 最後の行
    return { left: bb.left, top: bb.top, right: bb.right, bottom: last.bottom, lastLeft: last.left };
  }
  function editingSel() { if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; const o = caretOffsets(n); if (o && o.e > o.s) state.editing.lastSel = o; return o; }
  // 道具（上のボタン・欄）に触れると編集中の選択が外れることがあるので、直近の選択を覚えておいて使う
  function liveSel() { const o = editingSel(); if (o && o.e > o.s) return o; return state.editing && state.editing.lastSel; }
  function editingHasSelection() { const o = liveSel(); return !!(o && o.e > o.s); }
  const stAtChar = (runs, idx) => { if (idx < 0) return {}; let o = 0; for (const r of runs) { const len = r.text.length; if (idx < o + len) return { bold: r.bold, color: r.color, scale: r.scale, font: r.font }; o += len; } return {}; };
  // 入力（打つ・変換の決定・貼り付け）を runs に取り込む：差分の挿入文字は「前の文字の見た目」を引き継ぐ（PowerPoint）。
  function reconcileEdit() {
    if (!state.editing) return; const n = elNode(state.editing.id); if (!n) return;
    const oldRuns = state.editing.runs || rawRuns(state.editing.id); const oldPlain = oldRuns.map((r) => r.text).join("");
    const newPlain = (n.innerText || "").replace(/\n+$/, "");
    if (newPlain === oldPlain) return;
    const La = oldPlain.length, Lb = newPlain.length, mx = Math.min(La, Lb);
    let p = 0; while (p < mx && oldPlain[p] === newPlain[p]) p++;
    let q = 0; while (q < mx - p && oldPlain[La - 1 - q] === newPlain[Lb - 1 - q]) q++;
    const inserted = newPlain.slice(p, Lb - q);
    const sty = p > 0 ? stAtChar(oldRuns, p - 1) : stAtChar(oldRuns, p);
    const before = runsSlice(oldRuns, 0, p), after = runsSlice(oldRuns, La - q, La);
    const mid = inserted ? [{ text: inserted, ...(sty.bold ? { bold: true } : {}), ...(sty.color != null ? { color: sty.color } : {}), ...(sty.scale && sty.scale !== 1 ? { scale: sty.scale } : {}), ...(sty.font ? { font: sty.font } : {}) }] : [];
    const newRuns = normRuns([...before, ...mid, ...after]);
    state.editing.runs = newRuns; n.innerHTML = runsToEditHtml(newRuns); setCaretOffsets(n, p + inserted.length, p + inserted.length);
  }
  // 選んだ所だけに見た目を付ける（編集中・選択あり）。commit はしない（書き換えを終えるとき 1 op で記録）。
  function applyPartStyle(kind, value) { if (!state.editing) return false; const n = elNode(state.editing.id); if (!n) return false; reconcileEdit(); const o = liveSel(); if (!o || o.e <= o.s) return false;
    let runs = state.editing.runs || domToRuns(n); const { s, e } = o;
    if (kind === "bold") { const cov = runsSlice(runs, s, e); const allBold = cov.length && cov.every((r) => r.bold); runs = applyRunRange(runs, s, e, (r) => { if (allBold) delete r.bold; else r.bold = true; }); }
    else if (kind === "color") { runs = applyRunRange(runs, s, e, (r) => { r.color = value; }); }
    else if (kind === "scale") { runs = applyRunRange(runs, s, e, (r) => { if (value === 1) delete r.scale; else r.scale = value; }); }
    else if (kind === "font") { runs = applyRunRange(runs, s, e, (r) => { if (!value) delete r.font; else r.font = value; }); }
    else if (kind === "link") { runs = applyRunRange(runs, s, e, (r) => { if (!value) delete r.link; else r.link = clone(value); }); }
    state.editing.runs = runs; n.innerHTML = runsToEditHtml(runs); setCaretOffsets(n, s, e); liveReflow();
    if (state.editing.mode) flushCheckpoint();   // §23b 打っていた分を先に区切る
    flushCheckpoint();   // §23b 文の一部の見た目を変えたら、それで1区切り
    return true;
  }
  // §19 書き換え中：範囲を指定してリンク/書体を当てる（自動リンク・貼り付けリンク用）。commit しない。
  function applyPartStyleRange(kind, value, s, e) {
    if (!state.editing) return false; const n = elNode(state.editing.id); if (!n || e <= s) return false;
    let runs = state.editing.runs || domToRuns(n);
    if (kind === "link") runs = applyRunRange(runs, s, e, (r) => { if (!value) delete r.link; else r.link = clone(value); });
    else if (kind === "font") runs = applyRunRange(runs, s, e, (r) => { if (!value) delete r.font; else r.font = value; });
    state.editing.runs = runs; n.innerHTML = runsToEditHtml(runs); setCaretOffsets(n, s, e); liveReflow(); return true;
  }
  const plainLen = (runs) => runs.reduce((a, r) => a + (r.text || "").length, 0);
  // §2.5 書き換え中：カーソル直前の URL/メールのトークンを自動リンクにする（空白等を打った直後に呼ぶ）
  function autoLinkBeforeCaret() {
    if (!state.editing || composing) return false; const n = elNode(state.editing.id); if (!n) return false;
    const o = caretOffsets(n); if (!o) return false; const caret = o.s;
    const runs = state.editing.runs || domToRuns(n); const plain = runs.map((r) => r.text).join("");
    let end = caret; while (end > 0 && /[\s　]/.test(plain[end - 1])) end--;     // 直前の区切りを飛ばす
    let start = end; while (start > 0 && !/[\s　]/.test(plain[start - 1])) start--;
    if (end <= start) return false;
    const lk = parseAutoLink(plain.slice(start, end)); if (!lk) return false;
    const snapshot = runs.map((r) => clone(r));
    const newRuns = applyRunRange(runs, start, end, (r) => { r.link = clone(lk); });
    state.editing.runs = newRuns; n.innerHTML = runsToEditHtml(newRuns); setCaretOffsets(n, caret, caret);
    state.editing.autoUndo = snapshot; liveReflow(); return true;
  }
  // §2.5/§2.6 書き換え中の貼り付け：URL/メールだけなら、選択ありは選択をリンク化／選択なしは貼って入れてリンク化
  function editingPasteLink(text) {
    if (!state.editing) return false; const n = elNode(state.editing.id); if (!n) return false;
    const lk = parseAutoLink(text); if (!lk) return false;
    reconcileEdit(); const o = liveSel() || caretOffsets(n); if (!o) return false;
    const snapshot = (state.editing.runs || domToRuns(n)).map((r) => clone(r));
    if (o.e > o.s) { applyPartStyleRange("link", lk, o.s, o.e); }
    else { let runs = state.editing.runs || domToRuns(n); const L = plainLen(runs);
      const runsNew = normRuns([...runsSlice(runs, 0, o.s), { text, link: clone(lk) }, ...runsSlice(runs, o.s, L)]);
      state.editing.runs = runsNew; n.innerHTML = runsToEditHtml(runsNew); setCaretOffsets(n, o.s + text.length, o.s + text.length); liveReflow(); }
    state.editing.autoUndo = snapshot; return true;
  }
  // §19b §5 この編集の中でコピーした文字（見た目・リンクつき）を覚える。貼り付けで引き継ぐ（大きさは貼り先に合わせる＝scale は持ち越さない）。
  function captureEditingCopy() {
    if (!state.editing) { state.richClip = null; return; } const n = elNode(state.editing.id); if (!n) return; reconcileEdit();
    const o = liveSel() || caretOffsets(n); if (!o || o.e <= o.s) return;
    const runs = state.editing.runs || domToRuns(n);
    const sel = runsSlice(runs, o.s, o.e).map((r) => { const c = { ...r }; delete c.scale; return c; });
    state.richClip = { plain: sel.map((r) => r.text).join(""), runs: normRuns(sel) };
  }
  // 貼り付けた文字が「この編集の中でコピーしたもの」と一致したら、見た目・リンクつきで入れる。一致しなければ false（＝文字だけに任せる）。
  function editingPasteRich(text) {
    if (!state.editing || !state.richClip || text !== state.richClip.plain) return false;
    const n = elNode(state.editing.id); if (!n) return false; reconcileEdit();
    const o = liveSel() || caretOffsets(n); if (!o) return false;
    const snapshot = (state.editing.runs || domToRuns(n)).map((r) => clone(r));
    let runs = state.editing.runs || domToRuns(n); const L = plainLen(runs);
    const ins = state.richClip.runs.map((r) => clone(r));
    const newRuns = normRuns([...runsSlice(runs, 0, o.s), ...ins, ...runsSlice(runs, o.e, L)]);
    state.editing.runs = newRuns; n.innerHTML = runsToEditHtml(newRuns); setCaretOffsets(n, o.s + text.length, o.s + text.length);
    state.editing.autoUndo = snapshot; liveReflow(); return true;
  }
  const editingHasAutoUndo = () => !!(state.editing && state.editing.autoUndo);
  function editingUndoAutoLink() {
    if (!state.editing || !state.editing.autoUndo) return false; const n = elNode(state.editing.id);
    const runs = normRuns(state.editing.autoUndo); state.editing.autoUndo = null; state.editing.runs = runs;
    if (n) { const caret = (caretOffsets(n) || { s: 0 }).s; n.innerHTML = runsToEditHtml(runs); setCaretOffsets(n, Math.min(caret, plainLen(runs)), Math.min(caret, plainLen(runs))); }
    liveReflow(); return true;
  }
  // §2.1 Cmd+K など：今の選択 [s,e] を取る（道具に触れても覚えている分を使う）
  function editingSelRange() { if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; reconcileEdit(); return liveSel() || null; }
  // §19 選択範囲の書体（混在は "__mixed__"、無指定は null）。道具のボタンの名前に使う。
  function editingSelFont() {
    if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; const o = liveSel() || caretOffsets(n); if (!o) return null;
    const runs = state.editing.runs || domToRuns(n); const a = o.s, b = Math.max(o.e, o.s + 1); let f, acc = 0;
    for (const r of runs) { const len = r.text.length, s = acc, e = acc + len; if (e > a && s < b) { const rf = r.font || null; if (f === undefined) f = rf; else if (f !== rf) return "__mixed__"; } acc += len; }
    return f === undefined ? null : f;
  }
  function boxSizePx(id) { const sn = styleNameOf(id); return effSize(sn, state.device, reduce(activeOps()).textStyles[tsKeyOf(id)]).size; }
  // 選択の代表の、今の端末での実際の大きさ（px）＝箱の大きさ×倍率
  function editingPartSizePx() { if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; const o = liveSel() || caretOffsets(n); if (!o) return null; const runs = state.editing.runs || domToRuns(n); let acc = 0, scale = 1; for (const r of runs) { const len = r.text.length; if (o.s < acc + len) { scale = r.scale || 1; break; } acc += len; } return Math.round(boxSizePx(state.editing.id) * scale); }
  const runStyled = (runs) => runs.length > 1 || (runs[0] && (runs[0].bold || runs[0].color != null || (runs[0].scale && runs[0].scale !== 1) || runs[0].font || runs[0].link));
  function hasRuns(id) { const r = reduce(activeOps()).runsMap[id]; return !!(r && runStyled(r)); }
  // §2.3 入口：その部品の切れ目の並び
  function textRunsApi(part) { if (state.editing && state.editing.id === part) { reconcileEdit(); return (state.editing.runs || []).map((r) => ({ ...r })); } const R = reduce(activeOps()); return R.runsMap[part] ? R.runsMap[part].map((r) => ({ ...r })) : [{ text: rawText(part, R) }]; }

  // §2 セクションの並び（ページの組み立て）。今は特集・品の2つ。複製・追加・削除・並べ替えはこの並びを書き換える（試験台14・第2回で操作を足す）。
  const defaultSecList = () => [{ id: "feature", type: "feature" }, { id: "items", type: "items" }];
  // ===================== 試験台26：① お店の情報（catalog）から品の並び・表を作る =====================
  // 品の並び（I_cards）・表（I_table）の中身は、① の下書き（shop.json の catalog まるごと）＋ 並びの設定（② の content[並びID]）から
  // 表示のたびに作る（_pg.rows はやめた）。① の下書きの土台は state.shopBase（無ければテンプレ SHOP_JSON）。
  const shopTpl = () => JSON.parse(JSON.stringify(SHOP_JSON));
  const shopBase = () => (state && state.shopBase ? state.shopBase : SHOP_JSON);
  // 1件 ID ↔ 品 ID（テンプレの既存部品は別名、それ以外は c_/t_＋品ID）
  const CARD_ALIAS = { itm_jonama: "c_jonama", itm_warabi: "c_warabi", itm_dorayaki: "c_dora" };
  const TABLE_ALIAS = { itm_warabi: "t_warabi", itm_matcha: "t_matcha" };
  const REV_CARD = {}, REV_TABLE = {};
  for (const k in CARD_ALIAS) REV_CARD[CARD_ALIAS[k]] = k;
  for (const k in TABLE_ALIAS) REV_TABLE[TABLE_ALIAS[k]] = k;
  const cardPartId = (itemId) => CARD_ALIAS[itemId] || ("c_" + itemId);
  const tablePartId = (itemId) => TABLE_ALIAS[itemId] || ("t_" + itemId);
  const itemOfCardPart = (pid) => REV_CARD[pid] || (pid.indexOf("c_") === 0 ? pid.slice(2) : null);
  const itemOfTablePart = (pid) => REV_TABLE[pid] || (pid.indexOf("t_") === 0 ? pid.slice(2) : null);
  // 価格の文字（3.3・3.4：載せ方の価格があればそれ、なければ品の価格）
  const fmtAmt = (n) => Number(n).toLocaleString("en-US");
  function fmtPriceOpt(p) { const nm = p.name ? p.name + " " : ""; if (p.type === "market") return nm + "時価"; if (p.type === "ask") return nm + "応相談"; if (p.type === "free") return nm + "無料"; if (p.type === "range") return nm + fmtAmt(p.amount) + "円〜" + fmtAmt(p.amount2) + "円"; if (p.type === "from") return nm + fmtAmt(p.amount) + "円〜"; return nm + fmtAmt(p.amount) + "円"; }
  function formatPrices(prices) { if (!prices || !prices.length) return ""; const money = prices.some((p) => ["fixed", "from", "range"].includes(p.type)); return prices.map(fmtPriceOpt).join("／") + (money ? "（税込）" : ""); }
  // 表示するか（3.4）：販売中・今月が販売時期に入る（載せ方があることは呼び出し側で保証）
  const curMonth = () => new Date().getMonth() + 1;
  function isDisplayable(item) { if (!item) return false; if (item.status && item.status !== "onSale") return false; if (item.season && item.season.months && item.season.months.length && !item.season.months.includes(curMonth())) return false; return true; }
  function priceOf(shop, itemId, placementId) { const cat = (shop && shop.catalog) || {}; const plc = (placementId && cat.placements) ? cat.placements[placementId] : null; const item = cat.items ? cat.items[itemId] : null; return (plc && plc.prices) ? plc.prices : (item ? item.prices : null); }
  // 並びの設定を基に、① から品の並び・表の中身を作る。kind="cards"|"table"
  function deriveGroup(shop, spec, kind) {
    const cat = (shop && shop.catalog) || {}; const items = cat.items || {}, placements = cat.placements || {}, categories = cat.categories || {};
    const menuId = spec.menu; let entries = [];
    if (spec.pick) { for (const itemId of spec.pick) { const pid = Object.keys(placements).find((k) => placements[k].itemId === itemId && placements[k].menuId === menuId); entries.push({ itemId, placementId: pid }); } }
    else {
      let ks = Object.keys(placements).filter((k) => placements[k].menuId === menuId);
      if (spec.category) ks = ks.filter((k) => placements[k].categoryId === spec.category);
      const co = (cid) => (categories[cid] && categories[cid].order) || 0;
      ks.sort((a, b) => { const pa = placements[a], pb = placements[b]; const d = co(pa.categoryId) - co(pb.categoryId); return d !== 0 ? d : (pa.order || 0) - (pb.order || 0); });
      for (const k of ks) { const p = placements[k]; const it = items[p.itemId]; if (spec.label && !(((it && it.labels) || []).includes(spec.label))) continue; entries.push({ itemId: p.itemId, placementId: k }); }
    }
    entries = entries.filter((e) => isDisplayable(items[e.itemId]));
    if (spec.count != null) entries = entries.slice(0, spec.count);
    return entries.map((e) => { const it = items[e.itemId] || {}; const prices = priceOf(shop, e.itemId, e.placementId); const o = { id: kind === "cards" ? cardPartId(e.itemId) : tablePartId(e.itemId), _itemId: e.itemId, _placementId: e.placementId, _menu: menuId, name: it.name || "", desc: it.description || "", price: formatPrices(prices) }; if (kind === "cards") o.photo = { asset: (it.photos && it.photos[0]) || "" }; return o; });
  }
  // 並びの設定：テンプレの既定（I_cards＝店頭販売のおすすめ3件／I_table＝甘味処の全品）
  function templateSource(gid) { const b = bareOf(gid); if (b === "I_cards") return { menu: "mnu_tento", label: "lbl_recommended", count: 3 }; if (b === "I_table") return { menu: "mnu_kanmi" }; return null; }
  const isGroupId = (id) => { const b = bareOf(id); return b === "I_cards" || b === "I_table"; };
  // ① の下書きに catalog 系の op を畳む（clone 済みの shop を直接書き換える）
  function applyShopOps(shop, ops) {
    const cat = shop.catalog = shop.catalog || { items: {}, placements: {}, menus: {}, categories: {}, labels: {} };
    for (const op of ops) {
      if (op.t === "shopField") { const it = cat.items[op.itemId]; if (it) it[op.field] = op.value; }
      else if (op.t === "shopPrice") { if (op.target.kind === "placement") { const p = cat.placements[op.target.id]; if (p) p.prices = clone(op.prices); } else { const it = cat.items[op.target.id]; if (it) it.prices = clone(op.prices); } }
      else if (op.t === "shopAdd") { const it = clone(op.item); const iid = it.id; delete it.id; cat.items[iid] = it; if (op.placement) { const pl = clone(op.placement); const pid = pl.id; delete pl.id; cat.placements[pid] = pl; } }   // 品・載せ方は ID をキーにし、中には id を持たない（schema どおり）
      else if (op.t === "shopDel") { if (op.placementId) delete cat.placements[op.placementId]; if (op.alsoItem && op.itemId) delete cat.items[op.itemId]; }
      else if (op.t === "shopLabels") { const it = cat.items[op.itemId]; if (it) it.labels = clone(op.labels); }
    }
    return shop;
  }
  const isShopOp = (t) => t === "shopField" || t === "shopPrice" || t === "shopAdd" || t === "shopDel" || t === "shopLabels";
  // 新しい ID を作る（2.2：英小文字・数字、使い回さない。① の下書きの中の ID の最大から続ける）
  const mintShopId = (prefix) => prefix + "_x" + String(++state.shopSeq).padStart(4, "0");
  function recomputeShopSeq(shop) {
    let mx = 0; const take = (id) => { const m = /_x(\d+)$/.exec(id || ""); if (m) mx = Math.max(mx, +m[1]); };
    const cat = (shop && shop.catalog) || {};
    for (const id in (cat.items || {})) { take(id); for (const pr of (cat.items[id].prices || [])) take(pr.id); }
    for (const id in (cat.placements || {})) { take(id); for (const pr of (cat.placements[id].prices || [])) take(pr.id); }
    state.shopSeq = Math.max(state.shopSeq || 0, mx);
  }

  // §24 base＝お店の下書き（4.9 の今の形）。null は「最初の形＝空の下書き（テンプレートのまま）」。reduce は base から種まきして ops を畳む。
  let state = { device: "pc", ops: [], cursor: 0, undoBase: 0, base: null, shopBase: null, shopSeq: 0, selected: new Set(), selectedSection: null, editing: null, peek: false, clipboard: null, addSeq: 0, secSeq: 0, secList: defaultSecList(), pendingNewText: null, fixedSections: false, preview: false, viewing: null, viewBackup: null, restoreUndo: null, recentColors: [], droppedRuns: [] };
  let scale = 1, layoutCount = 0, composing = false;
  // §25 §2.3 縮め方の切り替え：既定は見た目だけ縮める transform:scale（A）。アドレス末尾 ?scale=zoom のときだけ CSS の zoom で縮める（B）。
  //   DATA_SPEC 4.11 ②：縮めた中での書き換えは iPhone の Safari で崩れやすい。崩れたら縮め方を変える。
  //   chromium / webkit では zoom と transform:scale で getBoundingClientRect・clientWidth の意味が一致する（座標の計算は両方とも (client − rect.left) / scale のまま・直す所なし）。
  const SCALE_MODE = (() => { try { return new URLSearchParams(location.search).get("scale") === "zoom" ? "zoom" : "transform"; } catch (e) { return "transform"; } })();
  let clampGuard = false;   // §20b §2.4 表の幅クランプの再描画ガード（render の再入防止）
  let appliedPlace = {}; // id -> {top,left} 直近の絶対配置

  // ---- 写真（§1-2）：素材の中身はページの中だけで持つ（保存しない）。差し替え＝replace op・見せる範囲＝view op。----
  // ASSET：素材 ID → 画像の URL。ASSET_NAT：素材 ID → {w,h}（縮めた後・向きを直した後の大きさ）。
  const ASSET = (typeof PHOTOS_JSON !== "undefined") ? Object.assign({}, PHOTOS_JSON) : {};
  const ASSET_NAT = {};
  let assetSeq = 0;
  const assetUrl = (id) => ASSET[id] || null;
  const assetNat = (id) => ASSET_NAT[id] || null;
  // テンプレートの素材の自然な大きさは、読み込んで測る（非同期）。測れたら再描画。
  const natPending = {};
  function ensureNat(id) {
    if (!id || ASSET_NAT[id] || natPending[id]) return; const url = ASSET[id]; if (!url) return;
    natPending[id] = true; const img = new Image();
    img.onload = () => { ASSET_NAT[id] = { w: img.naturalWidth, h: img.naturalHeight }; if (typeof onRender === "function") onRender(); };
    img.src = url;
  }
  // 画像ファイルを読み込む：向きを直し、長い辺 2400px まで縮める（0.85 の JPEG）。小さい写真は縮めない。
  // 読めなければ null（呼び手が「この写真は読み込めません」を出す）。
  async function loadImageFile(file) {
    if (!file) return null;
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) { return null; }
    let w = bmp.width, h = bmp.height; const longest = Math.max(w, h); const MAX = 2400;
    const isPng = /png$/i.test(file.type || "");
    let url, nw = w, nh = h;
    const oriented = (bmp.width !== w || bmp.height !== h); // createImageBitmap は常に向きを直した寸法
    const needScale = longest > MAX;
    if (needScale || !isPng || true) {
      // 向きを焼き込むため常にキャンバスへ。縮めるのは長い辺>2400 のときだけ。
      if (needScale) { const k = MAX / longest; nw = Math.round(w * k); nh = Math.round(h * k); }
      const cv = document.createElement("canvas"); cv.width = nw; cv.height = nh;
      cv.getContext("2d").drawImage(bmp, 0, 0, nw, nh);
      url = isPng && !needScale ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.85);
    }
    bmp.close && bmp.close();
    const id = "img_" + (++assetSeq) + "_" + nw + "x" + nh;
    ASSET[id] = url; ASSET_NAT[id] = { w: nw, h: nh };
    return { asset: id, w: nw, h: nh };
  }

  const activeOps = () => state.ops.slice(0, state.cursor);

  // ---- 見せる範囲（§2）：view=端末ごと {x,y,zoom}。触っていない端末は、触った端末の x,y を引き継ぐ（zoom は 1）。----
  const DEF_VIEW = () => ({ x: 0.5, y: 0.5, zoom: 1 });
  function effView(part, device, viewAll) {
    const va = (viewAll || {})[part] || {};
    if (va[device]) return { x: va[device].x, y: va[device].y, zoom: va[device].zoom, own: true };
    const other = device === "pc" ? "sp" : "pc";
    if (va[other]) return { x: va[other].x, y: va[other].y, zoom: 1, own: false };
    return { x: 0.5, y: 0.5, zoom: 1, own: false };
  }
  // 枠 w,h・素材の自然大 iw,ih・view から、背景の表示サイズと左上オフセット（設計px）を出す。画像はいつも枠を覆う＝隙間なし。
  function coverBG(w, h, iw, ih, view) {
    if (!iw || !ih) return null;
    const s0 = Math.max(w / iw, h / ih); const dw = iw * s0 * view.zoom, dh = ih * s0 * view.zoom;
    const clampX = (x) => Math.min(1 - w / (2 * dw), Math.max(w / (2 * dw), x));
    const clampY = (y) => Math.min(1 - h / (2 * dh), Math.max(h / (2 * dh), y));
    const x = clampX(view.x), y = clampY(view.y);
    const ox = w / 2 - x * dw, oy = h / 2 - y * dh;
    return { dw, dh, ox, oy, x, y };
  }
  function clampView(w, h, iw, ih, view) { const c = coverBG(w, h, iw, ih, view); return c ? { x: c.x, y: c.y, zoom: view.zoom } : view; }

  // ---- content への文字の反映（パーツの属するインスタンスの content へ振り分ける）----
  // secContent[インスタンスID] は、feature なら {label,blocks,...}、items なら {label,cards,table,...} の「スライス」。
  function routeSetContent(secContent, id, text) {
    const c = secContent[secOf(id)]; if (!c) return false; const b = bareOf(id);
    const mB = { F_h0: [0, "heading"], F_b0: [0, "body"], F_h1: [1, "heading"], F_b1: [1, "body"] };
    if (mB[b] && c.blocks) { c.blocks[mB[b][0]][mB[b][1]] = text; return true; }
    let m;
    if ((m = b.match(/^card_(name|desc|price)_(.+)$/)) && c.cards) { const card = c.cards.find((x) => x.id === m[2]); if (card) card[m[1]] = text; return true; }
    if ((m = b.match(/^row_(name|desc|price)_(.+)$/)) && c.table) { const row = c.table.find((x) => x.id === m[2]); if (row) row[m[1]] = text; return true; }
    if (b === "I_kanmi") { c.kanmiLabel = text; return true; }   // §X37 甘味処の見出し（b-anchor/model.mjs の kanmiLabel）
    if (b === "I_time") { c.kanmiTime = text; return true; }     // §X37 提供時間（kanmiTime）
    return false;
  }
  function routeReplaceAsset(secContent, pid, asset) {
    const c = secContent[secOf(pid)]; if (!c) return; const b = bareOf(pid); let m;
    if ((m = b.match(/^F_p(\d)$/)) && c.blocks) { if (c.blocks[+m[1]]) c.blocks[+m[1]].photo.asset = asset; }
    else if ((m = b.match(/^card_photo_(.+)$/)) && c.cards) { const card = c.cards.find((x) => x.id === m[1]); if (card) card.photo.asset = asset; }
  }

  // ---- §24b（試験台24b）土台（4.9 の下書き）→ reduce の入れ物に種まきする（seed）----
  // base が null＝最初の形。secContent はテンプレ＋_pg.rows（品・表の行）から組み、文字・写真は content[] から戻す。
  // 幾何は adjust[端末] から（4.9.1）。足した部品は added[]＋adjust から内部の adds エントリに組み直す（描画ループは不変）。
  const tmplSliceOf = (inst, full) => (inst.id === "feature" || inst.id === "items") ? clone(full[inst.type]) : templateSectionContent(inst.type);
  function seedText(S, id, plain) { if (isAdded(id)) S.editMap[id] = plain; else routeSetContent(S.secContent, id, plain); }
  function seedAsset(S, id, asset) { if (isAdded(id)) S.replaceMap[id] = asset; else routeReplaceAsset(S.secContent, id, asset); }
  function seedFromBase(b, device, full) {
    full = full || base();
    const S = {
      secList: (b && b.sections) ? clone(b.sections) : [{ id: "feature", type: "feature" }, { id: "items", type: "items" }],
      secContent: {}, editMap: {}, replaceMap: {}, adds: [], removed: new Set(),
      m1: {}, m2: {}, order: {}, zmap: {}, sizes: {}, colsMap: {}, swapMap: {}, viewAll: {},
      brightMap: {}, textStyles: {}, runsMap: {}, linkMap: {}, clearL: [], placedFollow: {}, placedCleared: new Set(),
      baseSource: {},
    };
    if (!b) { S.secContent = { feature: full.feature, items: full.items }; return S; }
    // 1. secContent＝テンプレの初めの中身に、_pg.rows（品・表の行の器ごと）を差し込む。
    // feature/items は、セクションから消されていても必ず持つ（reduce/描画が content.feature/items を前提にするため）。
    S.secContent = { feature: clone(full.feature), items: clone(full.items) };
    for (const inst of S.secList) {
      const sc = tmplSliceOf(inst, full);
      const rows = b._pg && b._pg.rows && b._pg.rows[inst.id];
      if (rows) { if (rows.cards) sc.cards = clone(rows.cards); if (rows.table) sc.table = clone(rows.table); }
      S.secContent[inst.id] = sc;
    }
    // 2. 足した部品＝added[]＋adjust から内部の adds エントリに戻す（§2.1：下書きの全部の ID → 内部の素の ID に戻す。section は anchor から求める）
    const addedById = {}; for (const a of (b.added || [])) addedById[a.id] = a;
    const secOfRef = (ref) => { const t = instTag(ref); if (t) return t; if (isAdded(ref)) { const aa = addedById[ref]; return aa ? (aa.section || secOfRef(aa.anchor)) : "items"; } return (ref && ref.startsWith("F_")) ? "feature" : "items"; };
    for (const a of (b.added || [])) {
      const placedOn = a.placedOn || "pc", other = placedOn === "pc" ? "sp" : "pc", sz = a.size || {};
      const section = a.section || secOfRef(a.anchor), anchorBare = bareOf(a.anchor);
      const e = { id: a.id, kind: a.kind, section, anchor: anchorBare, from: a.from,
        styleName: a.style || (a.kind === "photo" ? undefined : "featBody"), placedDevice: placedOn,
        w: sz[placedOn] && sz[placedOn].w, h: sz[placedOn] && sz[placedOn].h, wOther: sz[other] && sz[other].w, hOther: sz[other] && sz[other].h,
        gap: 16, gapOther: 16, x: "@left" };
      const pl = b.adjust && b.adjust[placedOn] && b.adjust[placedOn][a.id] && b.adjust[placedOn][a.id].place;
      if (pl) { const ab = bareOf(pl.after); e.placed = { device: placedOn, anchor: ab, gapY: pl.gap, x: pl.x }; S.placedFollow[a.id] = { anchor: ab, device: placedOn }; }   // 付いていく先は place.after から（§2.3・保存しない）
      else { e.placed = { device: placedOn, anchor: anchorBare, gapY: 16, x: "@left" }; S.placedCleared.add(a.id); }   // §X36/§2.3 place が無い＝「元の位置に戻した（自動）」。placedCleared で自動の位置に（開き直しでも保つ）
      S.adds.push(e);
    }
    S.removed = new Set(b.removed || []);
    // 3. content[]＝文字（文字列/切れ目の並び）・写真 asset・明るさ・外す・部品リンク
    for (const id in (b.content || {})) {
      const v = b.content[id];
      // 試験台26：並びの設定（② の content[並びID]＝{menu,label?,category?,count?} か {menu,pick}）はソースマップへ
      if (isGroupId(id) && v && typeof v === "object" && !Array.isArray(v) && (v.menu || v.pick)) { S.baseSource[id] = clone(v); continue; }
      if (Array.isArray(v)) { S.runsMap[id] = clone(v); seedText(S, id, v.map((r) => r.text).join("")); }
      else if (typeof v === "string") { seedText(S, id, v); }
      else if (v && typeof v === "object") { if (v.asset != null) seedAsset(S, id, v.asset); if (v.bright) S.brightMap[id] = v.bright; if (v.cleared) S.clearL.push(id); if (v.link) S.linkMap[id] = clone(v.link); }
    }
    S.textStyles = clone(b.textStyle || {});
    // 4. adjust[端末]→入れ物。端末共通のマップ（cols/view/swap）は両端末ぶんを集める。端末ごと（m1/m2/order/sizes/z）は今の端末だけ。
    for (const d of ["pc", "sp"]) {
      const adj = (b.adjust && b.adjust[d]) || {};
      for (const key in adj) {
        const e = adj[key];
        if (e.swap) { (S.swapMap[key] = S.swapMap[key] || {})[d] = clone(e.swap); }
        if (e.cols != null) { (S.colsMap[key] = S.colsMap[key] || {})[d] = e.cols; }
        if (e.view) { (S.viewAll[key] = S.viewAll[key] || {})[d] = clone(e.view); }
        if (d === device) {
          if (e.order) S.order[key] = clone(e.order);
          if (e.move) S.m1[key] = clone(e.move);
          if (e.place) S.m2[key] = { anchor: bareOf(e.place.after), gapY: e.place.gap, x: e.place.x };   // §2.1 全部の ID → 内部の素の ID
          if (e.size) S.sizes[key] = clone(e.size);
          if (e.z != null) S.zmap[key] = e.z;
        }
      }
    }
    return S;
  }

  // ---- 操作列 → content / edits ----
  function reduce(ops, device, peek) {
    device = device || state.device;
    const full = base();
    // §24 土台から種まき（base が null なら最初の形）。以降の op の畳み込みは試験台23 と同一。
    const S = seedFromBase(state.base, device, full);
    const secList = S.secList;
    const secContent = S.secContent;
    const editMap = S.editMap; const adds = S.adds; const removed = S.removed;
    const m1 = S.m1, m2 = S.m2, clearL = S.clearL; const tpl = {}; const order = S.order; const zmap = S.zmap; const sizes = S.sizes; const colsMap = S.colsMap; const swapMap = S.swapMap;   // §20 列：I_cards→{pc,sp}／§5 左右入替：sec→{pc:{block:bool}}
    const placedCleared = (S.placedCleared instanceof Set) ? S.placedCleared : new Set();        // §3/§4 足した部品のうち「元に戻す」で手直し位置を捨てる（＝自動の位置）。§24b：土台から種まきした分も含む
    const placedFollow = S.placedFollow;     // §X13 足した部品の「置いた端末での今の付いていく先」（どちらの端末の reduce でも覚える）
    const replaceMap = S.replaceMap, viewAll = S.viewAll;   // §1 写真の差し替え（端末共通）／§2 見せる範囲（端末ごと）
    const brightMap = S.brightMap;          // §5（試験台17）写真の明るさ：枠ごと（中身・端末共通）。-40〜+40。差し替えで0に戻す。
    const textStyles = S.textStyles;        // §12 文字の見た目：鍵→{weight,color,size:{pc,sp}}（weight/color は端末共通・size は端末ごと）
    const runsMap = S.runsMap;              // §13 文の一部の見た目：部品ID→[{text,bold?,color?,scale?,font?,link?}]（中身＝PC/SP 共通）
    const linkMap = S.linkMap;              // §19 部品まるごとのリンク：写真・ボタン→リンク（中身＝PC/SP 共通。「元に戻す」で消えない）
    const delCards = {}, delRows = {};      // インスタンスID → 消す card/row id の Set（旧 _pg 用・試験台26 では未使用）
    const baseSource = S.baseSource || {};  // 試験台26：② の並びの設定（土台）
    const shopOps = [];                     // 試験台26：① に効く op（順序どおり畳む）
    const sourceSess = {};                  // 試験台26：この画面で変えた並びの設定（並びID→spec）
    const orderSec = (k) => (/^F/.test(bareOf(k)) ? "feature" : "items");
    const scopeIds = (scope, id) => {
      if (scope === "part") return [canonId(id)];
      const all = [...TEMPLATE_DRAG, ...adds.map((a) => a.id)];
      if (scope === "page") return all;
      return all.filter((x) => secOf(x) === secOf(id));
    };
    for (const op of ops) {
      if (op.t === "edit") { if (op.runs) { runsMap[op.id] = op.runs; editMap[op.id] = op.runs.map((r) => r.text).join(""); } else { editMap[op.id] = op.text; delete runsMap[op.id]; } }
      else if (op.t === "catAct") { if (op.shops) for (const s of op.shops) shopOps.push(s); if (op.src) { if (op.src.spec) sourceSess[op.src.gid] = clone(op.src.spec); else delete sourceSess[op.src.gid]; } }   // 試験台26：① と ② をまとめて1回で（戻す1回）
      else if (op.t === "add") { if (!removed.has(op.id)) adds.push(op); }
      else if (op.t === "del") { const inst = secOf(op.id); const bb = bareOf(op.id); if (/^card_/.test(bb)) (delCards[inst] = delCards[inst] || new Set()).add(cardIdOf(op.id)); else if (/^row_/.test(bb)) (delRows[inst] = delRows[inst] || new Set()).add(cardIdOf(op.id)); removed.add(op.id); for (let i = adds.length - 1; i >= 0; i--) if (adds[i].id === op.id) adds.splice(i, 1); delete m1[op.id]; delete m2[op.id]; }
      else if (op.t === "clear") { if (!clearL.includes(op.id)) clearL.push(op.id); }
      else if (op.t === "unclear") { const i = clearL.indexOf(op.id); if (i >= 0) clearL.splice(i, 1); }
      // §1 差し替え：素材を入れ替える（端末共通）。外した印は消す。両端末の見せる範囲は真ん中・1倍に戻す（＝view を捨てる）
      else if (op.t === "replace") { replaceMap[op.id] = op.asset; const i = clearL.indexOf(op.id); if (i >= 0) clearL.splice(i, 1); delete viewAll[op.id]; delete brightMap[op.id]; }
      // §5 明るさ：枠ごとの値（端末共通）。差し替えで消える（上の replace）。外す/戻すでは消さない（外す前の値に戻る）
      else if (op.t === "bright") { if (op.v) brightMap[op.id] = op.v; else delete brightMap[op.id]; }
      // §2 見せる範囲：端末ごとに {x,y,zoom}（端末で絞らない＝両端末ぶんを集める）
      else if (op.t === "view") { (viewAll[op.id] = viewAll[op.id] || {})[op.device] = { x: op.x, y: op.y, zoom: op.zoom }; }
      else if (op.t === "template") Object.assign(tpl, op.v);
      else if (op.t === "addCard") { const c = secContent[op.section || "items"]; if (c && c.cards) { const i = c.cards.findIndex((x) => x.id === op.after); if (i >= 0) c.cards.splice(i + 1, 0, clone(op.card)); else c.cards.push(clone(op.card)); } }
      else if (op.t === "addRow") { const c = secContent[op.section || "items"]; if (c && c.table) { const i = c.table.findIndex((x) => x.id === op.after); if (i >= 0) c.table.splice(i + 1, 0, clone(op.row)); else c.table.push(clone(op.row)); } }
      // §2 セクションの操作（ページの組み立て＝端末共通・1操作1undo）。「このページを元に戻す」では戻さない。
      else if (op.t === "secMove") { const i = secList.findIndex((s) => s.id === op.id); if (i >= 0) { const j = i + op.delta; if (j >= 0 && j < secList.length) { const [x] = secList.splice(i, 1); secList.splice(j, 0, x); } } }
      else if (op.t === "secDel") { const i = secList.findIndex((s) => s.id === op.id); if (i >= 0) secList.splice(i, 1); }
      else if (op.t === "secAdd") { const i = secList.findIndex((s) => s.id === op.afterId); const at = (op.pos != null) ? op.pos : (i >= 0 ? i + 1 : secList.length); secList.splice(at, 0, { id: op.newId, type: op.type, from: "@new" }); secContent[op.newId] = clone(op.content); }
      else if (op.t === "secDup") {
        const i = secList.findIndex((s) => s.id === op.afterId); secList.splice(i >= 0 ? i + 1 : secList.length, 0, { id: op.newId, type: op.type, from: op.srcId });
        secContent[op.newId] = clone(op.content);
        const dev = (op.edits && op.edits[device]) || {};
        Object.assign(m1, dev.m1 || {}); Object.assign(m2, dev.m2 || {}); Object.assign(zmap, dev.zmap || {});
        for (const k in (dev.sizes || {})) sizes[k] = clone(dev.sizes[k]); for (const k in (dev.order || {})) order[k] = dev.order[k].slice();
        for (const k in (op.edits.textStyles || {})) textStyles[k] = clone(op.edits.textStyles[k]);
        for (const k in (op.edits.runsMap || {})) runsMap[k] = clone(op.edits.runsMap[k]);
        for (const k in (op.edits.linkMap || {})) linkMap[k] = clone(op.edits.linkMap[k]);
        for (const k in (op.edits.replace || {})) replaceMap[k] = op.edits.replace[k];
        for (const k in (op.edits.viewAll || {})) viewAll[k] = clone(op.edits.viewAll[k]);
        for (const k in (op.edits.bright || {})) brightMap[k] = op.edits.bright[k];
        for (const id of (op.edits.clear || [])) if (!clearL.includes(id)) clearL.push(id);
        for (const a of (op.added || [])) adds.push(clone(a));
      }
      else if (op.t === "move") { if (op.device === device) for (const it of op.items) { if (it.mode === "M1") { delete m2[it.id]; m1[it.id] = { dx: it.dx, dy: it.dy }; } else { delete m1[it.id]; m2[it.id] = { anchor: it.anchor, gapY: it.gapY, x: it.x }; } }
        for (const it of op.items) if (it.mode === "M2" && isAdded(it.id)) placedFollow[it.id] = { anchor: it.anchor, device: op.device }; }   // §X13 置いた端末での今の付いていく先
      else if (op.t === "reorder") { if (op.device === device) { order[op.key] = op.order.slice(); delete m1[op.id]; delete m2[op.id]; } }
      else if (op.t === "zorder") { if (op.device === device) { if (op.zs) Object.assign(zmap, op.zs); else zmap[op.id] = op.z; } }   // §4/§22 重なり順（単体 z か、cluster まとめの zs）
      // §4（大きさ）：部品→端末ごと。w/h/padB は絶対値（最後が勝つ）。dx は「左から変えた分」の位置ずれ＝m1 に足す（右端を動かさない）。
      else if (op.t === "size") { if (op.device === device) { const s = sizes[op.id] || {}; if (op.w != null) s.w = op.w; if (op.h != null) s.h = op.h; if (op.padB != null) s.padB = op.padB; sizes[op.id] = s; if (op.dx) { const m = m1[op.id] || { dx: 0, dy: 0 }; m1[op.id] = { dx: (m.dx || 0) + op.dx, dy: m.dy || 0 }; } } }
      else if (op.t === "cols") { const m = colsMap[op.id] = colsMap[op.id] || {}; m[op.device] = op.n; }   // §20 列（端末ごと。両端末ぶんを溜める）
      else if (op.t === "swap") { const s = swapMap[op.sec] = swapMap[op.sec] || {}; const d = s[op.device] = s[op.device] || {}; d[op.block] = !d[op.block]; if (op.device === device) for (const pid of (op.clearM1 || [])) { delete m1[pid]; delete m2[pid]; } }   // §5 左右入替（トグル）＋ 2つの子の M1 を消す
      // §12 文字の見た目：weight/color は端末共通（device で絞らない）、size は op.device の枠へ（両端末ぶんを溜める）
      else if (op.t === "tstyle") { for (const k of op.keys) { const s = textStyles[k] = textStyles[k] || {}; if (op.weight != null) s.weight = op.weight; if (op.color != null) s.color = op.color; if (op.font != null) s.font = op.font; if (op.size != null) { s.size = s.size || {}; s.size[op.device] = op.size; } } }
      // 文字の見た目を元に戻す：箱まるごと（鍵）＋文の一部（部品の runs）の両方（§2.2 書式のクリア）
      else if (op.t === "tstyleReset") { for (const k of op.keys) delete textStyles[k]; if (op.parts) for (const pid of op.parts) delete runsMap[pid]; }
      else if (op.t === "elink") { if (op.link) linkMap[op.id] = clone(op.link); else delete linkMap[op.id]; }   // §19 部品まるごとのリンク
      else if (op.t === "resetScope") { if (op.devices.includes(device)) {
        if (op.scope === "page") {
          // §13.1「このページを元に戻す」＝全セクションのデザインに関わるもの全部（セクションの並び・追加・複製・削除は §2.2 により戻さない＝別 op のため触らない）。
          for (const k of Object.keys(m1)) delete m1[k]; for (const k of Object.keys(m2)) delete m2[k];
          for (const k of Object.keys(zmap)) delete zmap[k]; for (const k of Object.keys(sizes)) delete sizes[k];
          for (const k of Object.keys(colsMap)) delete colsMap[k];   // §20.2.10 列も戻す
          for (const k of Object.keys(swapMap)) delete swapMap[k];   // §5.2.3 左右入替も戻す
          for (const k of Object.keys(order)) delete order[k];
          for (const k of Object.keys(textStyles)) delete textStyles[k]; for (const k of Object.keys(viewAll)) delete viewAll[k];
          for (const a of adds) placedCleared.add(a.id);   // §3/§4 足した部品は残し、位置だけ自動に戻す
        } else {
          const sIds = scopeIds(op.scope, op.id); for (const id of sIds) { delete m1[id]; delete m2[id]; delete zmap[id]; delete sizes[id]; delete colsMap[id]; placedCleared.add(id); }   // §20.2.10 列は大きさと同じ扱い（元の位置に戻すで戻る）
          for (const k of Object.keys(order)) { if ((op.scope === "section" && orderSec(k) === secOf(op.id)) || (op.scope === "part" && (op.id === k || scopeIds("part", op.id).some((pid) => (order[k] || []).includes(pid))))) delete order[k]; }
          delete swapMap[secOf(op.id)];   // §5.2.3 元の位置に戻す＝並び替え扱い（左右入替も戻す）
        }
      } }
    }
    // 品・表の行を減らす（旧 _pg 用・試験台26 では delCards/delRows は空）
    for (const [inst, set] of Object.entries(delCards)) { const c = secContent[inst]; if (c && c.cards) c.cards = c.cards.filter((x) => !set.has(x.id)); }
    for (const [inst, set] of Object.entries(delRows)) { const c = secContent[inst]; if (c && c.table) c.table = c.table.filter((x) => !set.has(x.id)); }
    // ===== 試験台26：① の下書き（effShop）を作り、品の並び・表を ① から組む =====
    const effShop = applyShopOps(clone(shopBase()), shopOps);
    // 名前・説明の書き換えは ① の品へ（card/row の name/desc。両方の並びに同じ品が出ていれば、どちらも変わる）
    for (const id in editMap) { const bb = bareOf(id); let m; if ((m = bb.match(/^(card|row)_(name|desc)_(.+)$/))) { const itemId = m[1] === "card" ? itemOfCardPart(m[3]) : itemOfTablePart(m[3]); const it = effShop.catalog && effShop.catalog.items[itemId]; if (it) it[m[2] === "name" ? "name" : "description"] = editMap[id]; } }
    // 並びの設定を解決（この画面の変更 → 土台 → テンプレの既定）。items セクションごとに cards/table を作る
    const effSpec = (gid) => sourceSess[gid] || baseSource[gid] || templateSource(gid);
    const sourceResolved = {};
    for (const inst of secList) {
      if (inst.type !== "items") continue;
      const pfx = (inst.id === "feature" || inst.id === "items") ? "" : inst.id + SEP;
      const gidC = pfx + "I_cards", gidT = pfx + "I_table";
      const specC = clone(effSpec(gidC)), specT = clone(effSpec(gidT));
      sourceResolved[gidC] = specC; sourceResolved[gidT] = specT;
      const c = secContent[inst.id]; if (!c) continue;
      c.cards = deriveGroup(effShop, specC, "cards");
      c.table = deriveGroup(effShop, specT, "table");
      // ① の文字が切れ目の並び（一部の見た目）とずれたら、① の文字を出してその runs は捨てる（8.10）
      const dropDivergent = (arr, pre) => { for (const row of arr) for (const fld of ["name", "desc"]) { const fid = pfx + pre + fld + "_" + row.id; const rs = runsMap[fid]; if (rs && rs.map((r) => r.text).join("") !== (row[fld] || "")) { delete runsMap[fid]; if (state.droppedRuns && !state.droppedRuns.includes(fid)) state.droppedRuns.push(fid); } } };
      dropDivergent(c.cards, "card_"); dropDivergent(c.table, "row_");
    }
    // content に文字を反映（特集の見出し・本文など）＝パーツの属するインスタンスへ。品の名前・説明は上で ① から組んでいる
    for (const [id, text] of Object.entries(editMap)) routeSetContent(secContent, id, text);
    // §1 差し替えた素材を content に反映＝パーツの属するインスタンスへ
    for (const [pid, asset] of Object.entries(replaceMap)) routeReplaceAsset(secContent, pid, asset);
    // 足した部品（両端末に存在。位置は端末ごと）
    const added = [];
    const CW = device === "pc" ? 1326 : 351;
    const contentRight = (SPEC.DESIGN_W[device] + CW) / 2;        // 中身の右端（§2.3）
    for (const a of adds) {
      if (removed.has(a.id)) continue;
      const text = editMap[a.id] != null ? editMap[a.id] : a.text;
      let place; let isAuto = false;
      // §X13 自動の位置の付いていく先：元に戻した端末は add 時の先／それ以外は「置いた端末での今の先」（手で動かした先）
      const autoAnchor = placedCleared.has(a.id) ? a.anchor
        : ((placedFollow[a.id] && placedFollow[a.id].device === a.placedDevice) ? placedFollow[a.id].anchor : a.anchor);
      if (m2[a.id]) place = { anchor: m2[a.id].anchor, gap: m2[a.id].gapY, x: m2[a.id].x };
      else if (a.placed) {   // §3/§4 足した部品：置いた端末は手直し位置／もう一方・リセット後は自動（付いていく先のすぐ下16）
        if (a.placed.device === device && !placedCleared.has(a.id)) place = { anchor: a.placed.anchor, gap: a.placed.gapY, x: a.placed.x };
        else { place = { anchor: autoAnchor, gap: 16, x: "@left" }; isAuto = true; }
      }
      else if (device === a.placedDevice) place = { anchor: a.anchor, gap: a.gap, x: a.x };   // 貼り付け等（従来・置いた端末）
      else { place = { anchor: autoAnchor, gap: 16, x: "@left" }; isAuto = true; }              // 貼り付け等（もう一方の端末＝自動）
      // 幅はその端末でのコピー元の幅。置いた左端から中身の右端に収まらないなら、そこまで縮める（写真は縦横比保持。§2.3）
      let w = device === a.placedDevice ? a.w : (a.wOther != null ? a.wOther : a.w);
      let h = a.kind === "photo" ? (device === a.placedDevice ? a.h : (a.hOther != null ? a.hOther : a.h)) : a.h;
      if (typeof place.x === "number" && place.x + w > contentRight) { const avail = contentRight - place.x; if (a.kind === "photo" && h && w) h = Math.round(h * avail / w * 100) / 100; w = avail; }
      const asset = a.kind === "photo" ? (replaceMap[a.id] != null ? replaceMap[a.id] : a.asset) : undefined;
      added.push({ id: a.id, section: a.section, kind: a.kind, styleName: a.styleName || "featBody", w, h, text, anchor: place.anchor, gap: place.gap, x: place.x, asset, isAuto });
      delete m2[a.id];
    }
    // template 部品の m2/remove（added でないもの）
    const remove = [...removed].filter((id) => !isAdded(id));
    // 「元の配置を見る」：手で動かした部品・並び替えを元（今の中身からのテンプレ）に戻して見せる（記録は変えない）
    if (peek) { for (const k in m1) delete m1[k]; for (const k in m2) delete m2[k]; for (const k in order) delete order[k]; for (const k in sizes) delete sizes[k]; }
    // content は従来どおり anchor（特集・品）のスライスを束ねたもの。インスタンス全体は secContent/secList で持つ。
    const content = { feature: secContent.feature, items: secContent.items };
    return { content, secContent, secList, m1, m2, added, remove, clear: clearL, tpl, adds, editMap, order, zmap, sizes, colsMap, swapMap, replaceMap, viewAll, brightMap, textStyles, runsMap, linkMap, placedFollow, removedAll: [...removed], effShop, sourceResolved };
  }

  // ---- §24（試験台24）今の形を作る（fold）：PC・スマホの両方で畳み、1つの下書き（4.9＋_pg）にまとめる ----
  // 保存・版・「公開中と同じか」の比べ・draft()/roundTrip() で使う。state.base＋activeOps() から作る。
  function runStyledRuns(r) { return !!(r && (r.length > 1 || (r[0] && (r[0].bold || r[0].color != null || (r[0].scale && r[0].scale !== 1) || r[0].font || r[0].link)))); }
  // §24b 今の形を作る（fold）。文字・写真はテンプレの初めの中身と比べて「違うものだけ」content[] に（4.9「テンプレと同じ値は書かない」）。
  // 幾何は adjust[端末] に（4.9.1）。足した部品は added[]＋adjust に。品・表の行は _pg.rows に器ごと（4.11④が未決）。
  function foldToDraft(baseOverride, opsOverride) {
    const savedBase = state.base, savedOps = state.ops, savedCursor = state.cursor, savedDev = state.device;
    if (baseOverride !== undefined) state.base = baseOverride;
    if (opsOverride !== undefined) { state.ops = opsOverride; state.cursor = opsOverride.length; }
    const full = base();
    const R = reduce(activeOps(), "pc"), Rsp = reduce(activeOps(), "sp");
    const content = {};
    const ensureObj = (id) => { if (!content[id] || Array.isArray(content[id]) || typeof content[id] !== "object") content[id] = {}; return content[id]; };
    // §24b/c 部品 ID を指す所は、複製・足したセクションでは全部の ID（sec*__…）で書く（4.9.3 の ID の決まり）。@印・足した部品はそのまま。
    const pfxRef = (ref, secId) => (!ref || !secId || secId === "feature" || secId === "items" || ref[0] === "@" || isAdded(ref) || ref.indexOf(SEP) >= 0) ? ref : (secId + SEP + ref);
    const putText = (pid, cur, tmpl) => { if (R.runsMap[pid] && runStyledRuns(R.runsMap[pid])) content[pid] = clone(R.runsMap[pid]); else if (cur != null && cur !== tmpl) content[pid] = cur; };
    // 1. テンプレの初めの中身と比べて、違う文字・写真だけ content[] に（特集はブロック、品は甘味処の見出し・時間）
    for (const inst of R.secList) {
      const pfx = (inst.id === "feature" || inst.id === "items") ? "" : inst.id + SEP;
      const slice = R.secContent[inst.id], tmpl = tmplSliceOf(inst, full);
      if (!slice) continue;
      if (inst.type === "feature" && slice.blocks) {
        slice.blocks.forEach((bl, i) => {
          const tb = tmpl.blocks && tmpl.blocks[i];
          putText(pfx + "F_h" + i, bl.heading, tb ? tb.heading : undefined);
          putText(pfx + "F_b" + i, bl.body, tb ? tb.body : undefined);
          const curA = bl.photo ? bl.photo.asset : undefined, tA = tb && tb.photo ? tb.photo.asset : undefined;
          if (curA && curA !== tA) ensureObj(pfx + "F_p" + i).asset = curA;
        });
      } else if (inst.type === "items") {
        putText(pfx + "I_kanmi", slice.kanmiLabel, tmpl.kanmiLabel);   // §X37
        putText(pfx + "I_time", slice.kanmiTime, tmpl.kanmiTime);      // §X37
      }
    }
    // 2. 足した部品の文字・写真（4.9.3「焼き込んだ文字・写真は content[id]」）
    for (const a of R.adds) {
      if (a.kind === "photo") { const asset = R.replaceMap[a.id] != null ? R.replaceMap[a.id] : a.asset; if (asset) ensureObj(a.id).asset = asset; }
      else if (R.runsMap[a.id] && runStyledRuns(R.runsMap[a.id])) content[a.id] = clone(R.runsMap[a.id]);
      else { const t = R.editMap[a.id] != null ? R.editMap[a.id] : a.text; if (t) content[a.id] = t; }
    }
    // 3. 明るさ・外す・部品リンク（端末共通マップ）
    for (const id in R.brightMap) ensureObj(id).bright = R.brightMap[id];
    for (const id of R.clear) ensureObj(id).cleared = true;
    for (const id in R.linkMap) if (!Array.isArray(content[id])) ensureObj(id).link = clone(R.linkMap[id]);
    // added[]（4.9.3）。size・style・section は求められないので足す（§2.3・報告）
    const added = R.adds.map((a) => {
      const placedOn = a.placedDevice || "pc", other = placedOn === "pc" ? "sp" : "pc";
      const anchor = pfxRef(a.anchor, a.section);
      const o = { id: a.id, kind: a.kind, placedOn, anchor };
      if (a.from) o.from = a.from;
      // §2.1 section は anchor から求まるなら書かない。anchor が足した部品を指す場合だけは辿れないことがあるので残す（報告）
      if (isAdded(a.anchor)) o.section = a.section;
      const sz = {}; sz[placedOn] = { w: a.w }; if (a.h != null) sz[placedOn].h = a.h; sz[other] = { w: a.wOther != null ? a.wOther : a.w }; const ho = a.hOther != null ? a.hOther : a.h; if (ho != null) sz[other].h = ho;
      o.size = sz;
      if (a.kind !== "photo" && a.styleName && a.styleName !== "featBody") o.style = a.styleName;
      return o;
    });
    // adjust[端末]（4.9.1）：部品ごと {move|place,size,z,cols,view}＋縦積みの order＋左右の swap
    const mkAdjust = (Rd, dev) => {
      const adj = {}; const set = (id, k, v) => { (adj[id] = adj[id] || {})[k] = v; };
      for (const id in Rd.m1) set(id, "move", clone(Rd.m1[id]));
      for (const id in Rd.m2) set(id, "place", { after: pfxRef(Rd.m2[id].anchor, secOf(id)), gap: Rd.m2[id].gapY, x: Rd.m2[id].x });   // テンプレの浮き（added は除去済み）。after は全部の ID で
      for (const id in Rd.sizes) set(id, "size", clone(Rd.sizes[id]));
      for (const id in Rd.zmap) set(id, "z", Rd.zmap[id]);
      for (const id in Rd.colsMap) if (Rd.colsMap[id][dev] != null) set(id, "cols", Rd.colsMap[id][dev]);
      for (const id in Rd.viewAll) if (Rd.viewAll[id][dev]) set(id, "view", clone(Rd.viewAll[id][dev]));
      for (const key in Rd.order) set(key, "order", clone(Rd.order[key]));   // 並び順の子は内部で既に全部の ID
      for (const sec in Rd.swapMap) if (Rd.swapMap[sec][dev]) set(sec, "swap", clone(Rd.swapMap[sec][dev]));
      for (const a of Rd.added) if (!a.isAuto) set(a.id, "place", { after: pfxRef(a.anchor, a.section), gap: a.gap, x: a.x });   // 足した部品の置いた位置（§2.3）。after は全部の ID で
      return adj;
    };
    // 試験台26：並びの設定（② の content[並びID]）＝テンプレの既定と違うときだけ content[gid] に書く（_pg.rows はやめた）
    for (const gid in R.sourceResolved) { const spec = R.sourceResolved[gid]; const tmpl = templateSource(gid); if (canonJSON(spec) !== canonJSON(tmpl)) content[gid] = clone(spec); }
    // §2.2 空の入れ物は書かない（4.9「何もしていない所は書かない」）。何もしていない下書きは {template, sections} だけ。
    const draft = { template: { name: "wa-01", version: 1 }, sections: clone(R.secList) };
    if (state.secSeq || state.addSeq) draft.seq = { sec: state.secSeq, add: state.addSeq };
    if (Object.keys(content).length) draft.content = content;
    if (added.length) draft.added = added;
    if (R.removedAll.length) draft.removed = clone(R.removedAll);
    if (Object.keys(R.textStyles).length) draft.textStyle = clone(R.textStyles);
    const apc = mkAdjust(R, "pc"), asp = mkAdjust(Rsp, "sp"), adj = {};
    if (Object.keys(apc).length) adj.pc = apc; if (Object.keys(asp).length) adj.sp = asp;
    if (Object.keys(adj).length) draft.adjust = adj;
    state.base = savedBase; state.ops = savedOps; state.cursor = savedCursor; state.device = savedDev;
    return draft;
  }
  // §24 同じ中身なら同じ文字列になるよう、鍵を並べて JSON 化（「直してから元どおり」で一致させる）。_pg も含めて比べる。recentColors は含めない（§2.6）。
  function canonJSON(x) {
    const seen = new WeakSet();
    const norm = (v) => {
      if (v === null || typeof v !== "object") return v;
      if (seen.has(v)) return null; seen.add(v);
      if (Array.isArray(v)) return v.map(norm);
      const o = {}; for (const k of Object.keys(v).sort()) { if (v[k] === undefined) continue; o[k] = norm(v[k]); } return o;
    };
    return JSON.stringify(norm(x));
  }

  function secNode(sec) { return document.getElementById("host_" + sec)?.querySelector("#sec"); }
  const secHostId = (inst) => "host_" + inst.id;
  function secLabelText(inst) { if (inst.id === "feature") return "FEATURE（芦屋堂の味）"; if (inst.id === "items") return "ITEMS（おすすめの品）"; return (inst.type === "feature" ? "FEATURE" : "ITEMS") + "（複製／追加）"; }
  // §2 複製・追加したセクションの HTML の ID を「セクションID__素のID」に付け替える（builder は素の ID を出すので出力を書き換える）。
  // 足した部品（add_/addp_）はもともと一意なので付け替えない。付いていく先の @section/@abs も付け替えない。
  function prefixIds(html, pfx) {
    html = html.replace(/data-(el|absid)="([^"]+)"/g, (mm, attr, v) => isAdded(v) ? mm : `data-${attr}="${pfx}${v}"`);
    html = html.replace(/data-anchor="([^"]+)"/g, (mm, v) => (v[0] === "@" || isAdded(v)) ? mm : `data-anchor="${pfx}${v}"`);
    return html;
  }
  // §2 セクションを並び（state.secList）として DOM に用意する（土台）。host の id は host_<セクションID>。並び順に合わせて作る・移す・消す。
  function ensureHosts() {
    const wrap = document.getElementById("sectionwrap"); if (!wrap) return;
    const byId = {}; for (const w of wrap.querySelectorAll(".sec-wrap")) byId[w.getAttribute("data-sec")] = w;
    const used = new Set(); let prev = null;
    for (const inst of state.secList) {
      let w = byId[inst.id];
      if (!w) { w = document.createElement("div"); w.className = "sec-wrap"; w.setAttribute("data-sec", inst.id);
        const lbl = document.createElement("div"); lbl.className = "seclabel"; lbl.textContent = secLabelText(inst);
        const host = document.createElement("div"); host.className = "host"; host.id = secHostId(inst);
        w.appendChild(lbl); w.appendChild(host); }
      const ref = prev ? prev.nextElementSibling : wrap.firstElementChild;
      if (ref !== w) wrap.insertBefore(w, ref);
      prev = w; used.add(inst.id);
    }
    for (const id in byId) if (!used.has(id)) byId[id].remove();
  }
  // §2.2 背景は並び順で決まる（交互：0番目＝灰 surface・1番目＝白 background・…）。今の並び [feature, items] では型順と同じ。
  const secBgName = (idx) => (idx % 2 === 0 ? "surface" : "background");
  // §22 §7 仮の一番上・一番下セクション（表示だけ・secList には入れない＝geometry・並び替え・背景交互・＋の既定は不変）。
  // setFixedSections(true) のときだけ #sectionwrap の先頭・末尾に空の箱を置く。.sec-wrap でない＝右クリックで操作が出ず、境目の＋も上端・下端には付かない。
  function setFixedSections(on) { state.fixedSections = !!on; render(); }
  function renderFixedSections() {
    const wrap = document.getElementById("sectionwrap"); if (!wrap) return;
    const top0 = document.getElementById("fixedTop"), bot0 = document.getElementById("fixedBottom");
    if (!state.fixedSections) { if (top0) top0.remove(); if (bot0) bot0.remove(); return; }
    const dw = SPEC.DESIGN_W[state.device];
    const mk = (id, h, bg, label) => { let el = document.getElementById(id); if (!el) { el = document.createElement("div"); el.id = id; el.className = "fixed-sec"; } el.style.cssText = `width:${dw * scale}px;height:${h * scale}px;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font:14px system-ui;flex:none`; el.textContent = label; return el; };
    const topEl = mk("fixedTop", state.device === "pc" ? 480 : 320, "#4a4a4a", "一番上の大きな写真（仮）");
    const botEl = mk("fixedBottom", state.device === "pc" ? 240 : 200, "#8a8a8a", "お問い合わせ・足元（仮）");
    if (wrap.firstElementChild !== topEl) wrap.insertBefore(topEl, wrap.firstElementChild);
    wrap.appendChild(botEl);
  }
  function elNode(id) { for (const inst of state.secList) { const h = document.getElementById(secHostId(inst)); const n = h && h.querySelector('[data-el="' + id + '"]'); if (n) return n; } return null; }

  // ---- 描画 ----
  function render() {
    curGuides = []; curGuidesSec = null;                 // §2 目安の線は離したら消す（再描画で必ずリセット）
    const R = reduce(activeOps(), state.device, state.peek);
    state.secList = R.secList;                            // §2 今のセクションの並び（undo/redo で再計算されたもの）
    ensureHosts();                                        // §2 セクションの並びに合わせて host を用意
    const meas = document.getElementById("meas");
    state.secList.forEach((inst, idx) => {
      const sec = inst.id;
      const anchor = (sec === "feature" || sec === "items");
      const pfx = anchor ? "" : sec + SEP;
      const host = document.getElementById(secHostId(inst));
      // このインスタンスの content。builder は自分の型のスライス（content.feature or content.items）だけ見るが、
      // collectTextBoxes は両方を読むので、両スライスを渡す（相手側は anchor のものを借りる）。このインスタンスの型のスライスだけ差し替える。
      const content = { feature: R.content.feature, items: R.content.items };
      content[inst.type] = R.secContent[sec];
      const boxes = M.collectTextBoxes(content, state.device);
      for (const a of R.added) if (a.section === sec && a.kind !== "photo") boxes.push({ key: a.id, styleName: a.styleName, device: state.device, widthPx: a.w, text: a.text });
      // 箱の鍵（bare）→ グローバルの手直しの鍵（非 anchor は pfx を付ける。足した部品 add_ は素のまま）
      const lk = (k) => (pfx && !isAdded(k)) ? pfx + k : k;
      // §4：大きさを変えた文字は、その幅で改行を測り直す（表示幅と改行幅をそろえる）
      for (const b of boxes) { const s = R.sizes[lk(b.key)]; if (s && s.w != null) b.widthPx = s.w; }
      // §12：文字の見た目の手直しがあれば、改行の測りも手直し後の大きさ・太さで行う
      for (const b of boxes) { const ts = R.textStyles[lk(tsKeyBox(b.key))]; if (!ts) continue; if (ts.size && (ts.size.pc != null || ts.size.sp != null)) b.sizePx = effSize(b.styleName, b.device, ts).size; if (ts.weight != null) b.weightOv = ts.weight; if (ts.font != null) b.fontOv = SPEC.FONT[ts.font] || ts.font; }   // §19 箱の書体で改行を測る
      // §13：文の一部の見た目（runs）を当てる（箱の key → 部品 ID で引く）
      for (const b of boxes) { const rs = R.runsMap[lk(partIdOfBox(b.key))]; if (rs) b.runs = rs; }
      const H = TEXT.buildH(boxes, meas, SPEC);
      let edits;
      if (anchor) {   // anchor は従来どおり（素の ID・グローバルの手直しをそのまま渡す＝第1回までと1pxも変わらない）
        edits = { m1: R.m1, m2: R.m2, added: R.added.map((a) => ({ ...a, html: a.kind !== "photo" ? (H.get(a.id)?.html ?? a.text) : undefined })), remove: R.remove, clear: R.clear, template: R.tpl, order: R.order, sizes: R.sizes };
      } else {        // 非 anchor：このインスタンスの手直しだけを素の鍵に戻して渡す。写真が無い枠は「まだない写真」＝薄い枠で描く。
        const strip = (k) => (k.startsWith(pfx) ? k.slice(pfx.length) : k);
        const pick = (map) => { const o = {}; for (const k of Object.keys(map)) if (secOf(k) === sec) o[strip(k)] = map[k]; return o; };
        const missingPhotos = [];
        if (inst.type === "feature") (R.secContent[sec].blocks || []).forEach((bl, i) => { if (!bl.photo || !bl.photo.asset) missingPhotos.push("F_p" + i); });
        else (R.secContent[sec].cards || []).forEach((cd) => { if (!cd.photo || !cd.photo.asset) missingPhotos.push("card_photo_" + cd.id); });
        const clearLocal = [...R.clear.filter((id) => secOf(id) === sec).map(strip), ...missingPhotos];
        const addedLocal = R.added.filter((a) => a.section === sec).map((a) => ({ ...a, section: inst.type, html: a.kind !== "photo" ? (H.get(a.id)?.html ?? a.text) : undefined }));
        edits = { m1: pick(R.m1), m2: pick(R.m2), added: addedLocal, remove: R.remove.filter((id) => secOf(id) === sec).map(strip), clear: clearLocal, template: R.tpl, order: pick(R.order), sizes: pick(R.sizes) };
      }
      if (state.preview || state._pubGeo) { edits.remove = [...(edits.remove || []), ...(edits.clear || [])]; edits.clear = []; }   // §22 §5 プレビュー/公開：写真のない枠は詰める（EMPTYFRAME を出さず流れから外す）
      if (inst.type === "items") { const cardsId = anchor ? "I_cards" : (pfx + "I_cards"); let cv = R.colsMap[cardsId] && R.colsMap[cardsId][state.device]; if (state.colsPreview && state.colsPreview.id === cardsId && state.colsPreview.device === state.device) cv = state.colsPreview.n; if (cv != null) edits.geom = { [state.device]: { cols: cv } }; }   // §20 列（仮表示を優先）
      if (inst.type === "feature") { const sw = R.swapMap[sec] && R.swapMap[sec][state.device]; if (sw) edits.swap = sw; }   // §5 左右入替
      // §20b §2.4 描画時クランプ：記録幅では値段が1行に入らない表を、表示だけ広い幅で描く（記録=edits.sizes には触らず transient な幅を差し込む）
      if (inst.type === "items" && state._tableDispW && state.device === "pc") { const tid = anchor ? "I_table" : (pfx + "I_table"); edits.sizes = Object.assign({}, edits.sizes, { [tid]: Object.assign({}, edits.sizes[tid], { w: state._tableDispW }) }); }
      const out = (inst.type === "feature" ? M.buildFeature : M.buildItems)(content, state.device, H, edits);
      host.innerHTML = pfx ? prefixIds(out.bodyHtml, pfx) : out.bodyHtml;
      // §20b §2.4 広げるのは右へ（左端は動かさない）＝中央そろえ(margin:auto)を左端固定に上書き
      if (inst.type === "items" && state._tableDispW && state.device === "pc") { const tn = host.querySelector('#host_items [data-el="I_table"]') || host.querySelector('[data-el="I_table"]'); if (tn) { const dw = SPEC.DESIGN_W[state.device]; const recW = (R.sizes && R.sizes["I_table"] && R.sizes["I_table"].w != null) ? R.sizes["I_table"].w : 968; tn.style.marginLeft = ((dw - recW) / 2) + "px"; tn.style.marginRight = "0"; } }
      host._padBottom = out.padBottom;
      const s = host.querySelector("#sec"); if (s) s.style.background = SPEC.COLORS[secBgName(idx)];   // §2.2 背景は並び順で
    });
    applyTextStyles(R);   // §12：文字の箱まるごとの大きさ・太さ・色を当てる（実測・配置の前に）
    layoutScale();
    // §20b §2.4 記録幅では値段が1行に入らない表を、表示だけ右へ広げて描き直す（記録は変えない・左端固定・中身の右端で頭打ち）
    if (!clampGuard && state.device === "pc") {
      const Rt = reduce(activeOps(), state.device);
      const recW = (Rt.sizes && Rt.sizes["I_table"] && Rt.sizes["I_table"].w != null) ? Rt.sizes["I_table"].w : 968;
      const dw = SPEC.DESIGN_W[state.device], leftD = (dw - recW) / 2, cap = contentEdges().right - leftD;
      const dispW = +Math.min(Math.max(recW, tableFitW("pc")), cap).toFixed(2);
      const want = dispW > recW + 0.5 ? dispW : null;
      if (want !== (state._tableDispW || null)) { state._tableDispW = want; clampGuard = true; render(); clampGuard = false; return; }
    }
    placeAbsolute(R);
    decorate();
    renderFixedSections();   // §22 §7 仮の一番上・一番下（setFixedSections のときだけ）
    if (typeof onRender === "function") onRender();
  }

  // §12：手直しのある文字の部品に、大きさ（この端末の見える値）・太さ・色を当てる。手直しが無ければ触らない（＝テンプレのまま）。
  function applyTextStyles(R) {
    for (const inst of state.secList) {
      const host = document.getElementById(secHostId(inst)); if (!host) continue;
      for (const el of host.querySelectorAll('[data-kind="text"]')) {
        const id = el.getAttribute("data-el"); const ts = R.textStyles[tsKeyOf(id)]; if (!ts) continue;
        const sn = styleNameOf(id); if (!sn) continue;
        if (ts.size && (ts.size.pc != null || ts.size.sp != null)) el.style.fontSize = effSize(sn, state.device, ts).size + "px";
        if (ts.weight != null) el.style.fontWeight = ts.weight;
        if (ts.color != null) el.style.color = colorVal(ts.color);
        if (ts.font != null) el.style.fontFamily = SPEC.FONT[ts.font] || ts.font;   // §19 箱まるごとの書体
      }
    }
  }

  function layoutScale() {
    const dw = SPEC.DESIGN_W[state.device];
    const stage = document.getElementById("stage");
    const phone = inputMode() === "phone";
    // §25 §2.1 スマホでの編集・プレビュー：390 の配置を基準に、位置・大きさ・文字の大きさをまとめて比例で拡大縮小する。
    //   倍率は 0.82〜1.15 に収める（PowerPoint のスライドが窓に合わせて縮むのと同じ）。
    //   1.15 を超える広さ＝ページを中央に置き左右に同じ余白。0.82 を下回る狭さ（320未満）＝ 0.82 のままにして、
    //   ページ全体を横スクロールできるようにする（ページ全体の横スクロールが出るのはこの場合だけ）。
    // §1（試験台16・X4）スマホは #stage の余白を外してある。PC の窓で「スマホ」を直すとき（phone でない）は従来どおり 1 を超えない。
    let rawScale, overflowX = false;
    if (phone) {
      rawScale = stage.clientWidth / dw;
      scale = Math.max(0.82, Math.min(1.15, rawScale));
      overflowX = rawScale < 0.82;                     // 320 未満＝縮めきれない分は横に流す
    } else {
      scale = Math.min(1, (stage.clientWidth - 4) / dw);
    }
    const pageW = dw * scale;
    const centered = phone && pageW <= stage.clientWidth + 0.5;   // 画面の方が広い＝中央に置き左右に同じ余白
    document.body.classList.toggle("pg-xscroll", overflowX);
    for (const inst of state.secList) {
      const host = document.getElementById(secHostId(inst)); if (!host) continue; const s = host.querySelector("#sec"); if (!s) continue;
      s.style.width = dw + "px";
      if (SCALE_MODE === "zoom") { s.style.transform = ""; s.style.transformOrigin = ""; s.style.zoom = scale; }   // §25 §2.3 B：CSS の zoom で縮める
      else { s.style.zoom = ""; s.style.transformOrigin = "top left"; s.style.transform = "scale(" + scale + ")"; }   // A：見た目だけ縮める
      host.style.width = pageW + "px"; host.style.height = s.getBoundingClientRect().height + "px";
      host.style.margin = centered ? "0 auto" : "";
    }
  }
  // §25 §2.1 画面を回した・窓の幅が変わったとき：倍率を決め直して描き直す。中身（innerHTML）は作り直さない＝
  //   書き換え中の文字・カーソル・選んでいる部品を保つ。データ（draft）も変わらない（位置・大きさは 390 の px のまま）。
  function relayout() {
    layoutScale();
    if (!state.editing && !composing) decorate();   // つまみの見た目・位置を新しい倍率で取り直す（編集中は触らない）
    renderFixedSections();
  }

  // 絶対配置（M2・足した部品）の top/left を入れ、セクションを必要なら伸ばす（§1.1）。IME 変換中は呼ばない。
  function placeAbsolute(R) {
    R = R || reduce(activeOps());
    layoutCount++;
    appliedPlace = {};
    // §2.4（X13）前回の自動押し下げを一旦消して、素の流れで測る
    document.querySelectorAll("#stage .autopush").forEach((n) => { n.style.transform = ""; n.classList.remove("autopush"); });
    for (const inst of state.secList) {
      const sec = inst.id;
      const s = secNode(sec); if (!s) continue;
      const flow = rawGeomOf(sec);
      // '@left' の x を、付いていく先の左端で埋める
      const overrides = {};
      for (const [id, ov] of Object.entries(R.m2)) if (secOf(id) === sec) overrides[id] = ov;
      for (const a of R.added) if (a.section === sec) overrides[a.id] = { anchor: a.anchor, gapY: a.gap, x: a.x === "@left" ? (flow[a.anchor]?.x ?? 0) : a.x };
      const placed = M.placeAnchored(flow, overrides);
      const bottoms = {};
      for (const [id, pos] of Object.entries(placed)) {
        const w = s.querySelector('.absitem[data-absid="' + id + '"]'); if (!w) continue;
        w.style.top = pos.top + "px"; w.style.left = pos.left + "px";
        appliedPlace[id] = pos;
        const el = w.querySelector("[data-el]"); const h = el ? el.getBoundingClientRect().height / scale : 0;
        bottoms[id] = pos.top + h;
      }
      // §2.4（X13）自動の位置に入れた足した部品は、その下で左右が重なる流れの部品を「足した部品の高さ＋16」だけ押し下げる（記録しない）
      const pushMap = {};
      for (const a of R.added) {
        if (a.section !== sec || !a.isAuto) continue;
        const ap = placed[a.id]; if (!ap) continue;
        const aH = (bottoms[a.id] != null ? bottoms[a.id] - ap.top : 0); if (aH <= 0) continue;
        const aLeft = ap.left, aRight = ap.left + (a.w || 0);
        const anchorBottom = flow[a.anchor] ? flow[a.anchor].y + flow[a.anchor].h : ap.top;
        const push = aH + 16;
        for (const [fid, fe] of Object.entries(flow)) {
          if (fid === a.id || overrides[fid]) continue;                 // 足した部品・絶対配置（M2/added）は対象外
          if (!(isDraggable(canonId(fid)) || REPEAT.test(fid))) continue;
          if (fe.y < anchorBottom - 0.5) continue;                      // 入れた位置より上は対象外
          const ox = Math.min(aRight, fe.x + fe.w) - Math.max(aLeft, fe.x);
          if (ox <= 1) continue;                                        // 左右が重ならない＝対象外
          pushMap[fid] = (pushMap[fid] || 0) + push;
        }
      }
      for (const [fid, dy] of Object.entries(pushMap)) {
        const el = s.querySelector('[data-el="' + fid + '"]'); if (!el) continue;
        el.style.transform = (el.style.transform ? el.style.transform + " " : "") + "translateY(" + dy + "px)";
        el.classList.add("autopush");
        const fe = flow[fid]; if (fe) bottoms["push_" + fid] = fe.y + fe.h + dy;
      }
      // §X18 押し下げた部品に付いていく絶対配置（M2・足した部品）も、付いていく先と同じだけ下げる（付いていく先をたどる）。
      // 手で動かしたずれ（付いていく先からの間隔 gapY）は変えない。記録しない＝足した部品を消せば pushMap が空になり自動で元に戻る。
      const followCache = {};
      const followPush = (fid) => {
        if (fid in followCache) return followCache[fid];
        followCache[fid] = 0;                                   // 循環よけ（同じ先を二度たどらない）
        const ov = overrides[fid];
        let v;
        if (!ov) v = pushMap[fid] || 0;                         // 流れの部品＝自分が押し下げられた量
        else if (ov.anchor === "@section" || ov.anchor === "@abs" || !flow[ov.anchor]) v = 0;
        else v = followPush(ov.anchor);                         // 付いていく先の押し下げ量をそのまま受け継ぐ
        return (followCache[fid] = v);
      };
      for (const id of Object.keys(placed)) {
        const extra = followPush(id); if (extra <= 0.5) continue;
        const w = s.querySelector('.absitem[data-absid="' + id + '"]'); if (!w) continue;
        const top = +(placed[id].top + extra).toFixed(2);
        w.style.top = top + "px";
        appliedPlace[id] = { top, left: placed[id].left };
        if (bottoms[id] != null) bottoms[id] += extra;
      }
      // セクション伸長
      const stack = s.querySelector(".stack");
      const templateH = stack ? stack.getBoundingClientRect().height / scale : s.getBoundingClientRect().height / scale;
      const minH = M.sectionMinHeight(templateH, bottoms, document.getElementById("host_" + sec)._padBottom || 0);
      s.style.minHeight = minH + "px";
      document.getElementById("host_" + sec).style.height = s.getBoundingClientRect().height + "px";
    }
  }

  // セクション内の実測（縮小前・#sec 起点）
  function rawGeomOf(sec) {
    const out = {}; const s = secNode(sec); if (!s) return out;
    const sr = s.getBoundingClientRect(); const R = (n) => Math.round((n / scale) * 100) / 100;
    for (const el of s.querySelectorAll("[data-el]")) { const r = el.getBoundingClientRect(); out[el.getAttribute("data-el")] = { x: R(r.left - sr.left), y: R(r.top - sr.top), w: R(r.width), h: R(r.height), kind: el.getAttribute("data-kind") }; }
    return out;
  }
  function geometry() { const out = {}; for (const inst of state.secList) Object.assign(out, rawGeomOf(inst.id)); return out; }
  // §2：高さか幅が16px未満の部品は、つかめる範囲を上下左右に8px広げる（見た目・配置は変えない）。client→設計座標で判定。
  function smallHit(clientX, clientY) {
    for (const inst of state.secList) {
      const sec = inst.id;
      const s = secNode(sec); if (!s) continue; const sr = s.getBoundingClientRect();
      const dx = (clientX - sr.left) / scale, dy = (clientY - sr.top) / scale;
      const g = rawGeomOf(sec); let best = null, bestA = Infinity;
      for (const [id, e] of Object.entries(g)) {
        const c = canonId(id); if (!isDraggable(c) && !REPEAT.test(id)) continue;
        const padX = e.w < 16 ? 8 : 0, padY = e.h < 16 ? 8 : 0; if (!padX && !padY) continue;
        if (dx >= e.x - padX && dx <= e.x + e.w + padX && dy >= e.y - padY && dy <= e.y + e.h + padY) { const a = (e.w + 2 * padX) * (e.h + 2 * padY); if (a < bestA) { bestA = a; best = id; } }
      }
      if (best) return best;
    }
    return null;
  }
  function sections() {
    const out = {}; let topAcc = 0;
    for (const inst of state.secList) { const s = secNode(inst.id); if (!s) continue; const h = s.getBoundingClientRect().height / scale; out[inst.id] = { top: +topAcc.toFixed(2), height: +h.toFixed(2) }; topAcc += h; }
    return out;
  }
  // §2.3 入口：今の並び順のセクション `[{id, type, bg, top, height}]`（bg は背景の色の名前・top/height は今の端末の設計 px）。
  function sectionListApi() {
    const out = []; let topAcc = 0;
    state.secList.forEach((inst, idx) => {
      const s = secNode(inst.id); const h = s ? s.getBoundingClientRect().height / scale : 0;
      out.push({ id: inst.id, type: inst.type, bg: secBgName(idx), top: +topAcc.toFixed(2), height: +h.toFixed(2) });
      topAcc += h;
    });
    return out;
  }

  // §3：重なりを「仕組みが勝手に重ねた（overlaps）」と「お店の方が自分で重ねた（ownerOverlaps）」に分ける。
  // 自分で重ねた＝手で動かした部品（m1／m2 を持つ）、または大きさを変えた部品（sizes を持つ。X2）が絡む重なり。
  function warnings() {
    const g = geometry(); const R = reduce(activeOps());
    // §2.5（X14）足した部品（写真・文字）は「お店が自分で置いた」＝重なりは ownerOverlaps に入れる（overlaps でない）
    const moved = new Set([...Object.keys(R.m1), ...Object.keys(R.m2), ...Object.keys(R.sizes), ...Object.keys(R.textStyles || {}).filter((k) => R.textStyles[k].size), ...(R.adds || []).map((a) => a.id)]);
    const isMoved = (id) => moved.has(canonId(id)) || (groupOf(id) && moved.has(groupOf(id)));
    const items = Object.entries(g).filter(([, e]) => ["text", "photo", "pill"].includes(e.kind));
    const overlaps = [], ownerOverlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const [ai, a] = items[i], [bi, b] = items[j]; if (secOf(ai) !== secOf(bi)) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= 1 || oy <= 1) continue;
      const contains = (p, q) => p.x <= q.x + 1 && p.y <= q.y + 1 && p.x + p.w >= q.x + q.w - 1 && p.y + p.h >= q.y + q.h - 1;
      const mv = isMoved(ai) || isMoved(bi);
      if ((contains(a, b) || contains(b, a)) && !mv) continue;   // §20（X24）すっぽり覆う組は「どちらも手で触っていない」ときだけ飛ばす（テンプレの重なり）。手で触った組は ownerOverlaps に入れる
      (mv ? ownerOverlaps : overlaps).push({ a: ai, b: bi });
    }
    // はみ出しは横だけ見る（§1.1：下方向はセクションが伸びるので警告しない）
    const overflows = [];
    for (const [id, e] of items) if (e.x < -1 || e.x + e.w > SPEC.DESIGN_W[state.device] + 1) overflows.push({ id, edge: "横" });
    return { overlaps, overflows, ownerOverlaps };
  }

  // ---- 付いていく先の一覧（§7 anchors）----
  function anchorsList() {
    const R = reduce(activeOps()); const out = [];
    for (const [id, m] of Object.entries(R.m1)) out.push({ part: id, partName: M.friendly(id), mode: "M1", dx: m.dx, dy: m.dy });
    for (const [id, ov] of Object.entries(R.m2)) out.push({ part: id, partName: M.friendly(id), mode: "M2", anchor: ov.anchor, anchorName: M.friendly(ov.anchor), gapY: ov.gapY, x: ov.x });
    for (const a of R.added) out.push({ part: a.id, partName: M.friendly(a.id), mode: "M2", anchor: a.anchor, anchorName: M.friendly(a.anchor), gapY: a.gap, x: a.x, added: true });
    return out;
  }

  // ---- 選択・印・重なり順の表示（§2：赤い枠と「付いていく先」の札は出さない）----
  function decorate() {
    const R = reduce(activeOps());
    const manual = new Set([...Object.keys(R.m1), ...Object.keys(R.m2), ...R.clear, ...R.remove]);
    // 足した部品：置いた端末だけ手動印
    for (const a of R.adds) if (!R.remove.includes(a.id)) { const moved = R.m2[a.id] || R.m1[a.id]; if (a.placedDevice === state.device || moved) manual.add(a.id); }
    document.querySelectorAll(".mark-manual,.mark-warn,.mark-sel,.mark-anchor,.anchor-line,.anchor-label,.sel-pad,.rz-handle,.snap-guide").forEach((n) => { if (n.classList.contains("anchor-line") || n.classList.contains("anchor-label") || n.classList.contains("sel-pad") || n.classList.contains("rz-handle") || n.classList.contains("snap-guide")) n.remove(); else n.classList.remove("mark-manual", "mark-warn", "mark-sel", "mark-anchor"); });
    if (state.preview || state.viewing) return;   // §22 §5 プレビュー中／§6 見るだけは編集の飾り（選んだ枠・つまみ・手動印）を出さない
    for (const id of manual) { const n = elNode(id); if (n) n.classList.add("mark-manual"); }
    // §2：赤い枠（.mark-warn）は出さない
    for (const id of state.selected) { const n = elNode(id); if (n) n.classList.add("mark-sel"); }
    // §4：重なり順（端末ごと）を z-index で当てる。M2 は絶対配置のラッパ(.absitem)へ、ほかは本体へ（static なら relative 化）
    for (const [id, z] of Object.entries(R.zmap || {})) { const n = elNode(id); if (!n) continue; const target = n.closest(".absitem") || n; if (getComputedStyle(target).position === "static") target.style.position = "relative"; target.style.zIndex = String(z); }
    // §2：つかめる範囲を広げた小さな部品は、選択の枠も広げた範囲で表示する
    const g = geometry();
    for (const id of state.selected) { const e = g[id]; if (!e) continue; const padX = e.w < 16 ? 8 : 0, padY = e.h < 16 ? 8 : 0; if (!padX && !padY) continue; const s = secNode(secOf(id)); if (!s) continue; const pad = document.createElement("div"); pad.className = "sel-pad"; pad.style.cssText = `position:absolute;left:${e.x - padX}px;top:${e.y - padY}px;width:${e.w + 2 * padX}px;height:${e.h + 2 * padY}px;outline:2px solid #06c;pointer-events:none;z-index:5`; s.appendChild(pad); }
    // §4：大きさのつまみ（1つだけ選ばれていて、大きさを変えられる部品のとき）。data-handle に向きを持つ。
    if (state.selected.size === 1 && !state.editing) { const id = [...state.selected][0]; const hs = handlesFor(id); const e = g[id]; if (hs.length && e) { const s = secNode(secOf(id)); const hsz = +(HSZ / scale).toFixed(3); if (s) for (const dir of hs) { const p = handlePoint(dir, e); const h = document.createElement("div"); h.className = "rz-handle"; h.setAttribute("data-handle", dir); h.setAttribute("data-handle-for", id); h.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;width:${hsz}px;height:${hsz}px;margin-left:${-hsz / 2}px;margin-top:${-hsz / 2}px;background:#fff;border:1.5px solid #06c;z-index:8;touch-action:none;cursor:${cursorFor(dir)}`; s.appendChild(h); } } }
  }
  // §4：どのつまみを出すか・位置・形
  const HSZ = 14;
  function resizableKind(id) { const c = canonId(id); if (c === "I_divider") return "line"; if (c === "I_pillbg") return "pill"; if (c === "I_cards") return "cards"; if (c === "I_table") return "table"; if (/^F_p\d$/.test(c) || /^addp_/.test(c)) return "photo"; if (REPEAT.test(c)) return null; if (isText(c) || isAdded(c)) return "text"; return null; }   // §20 品の並び・表＝左右の辺のつまみ
  function handlesFor(id) { const k = resizableKind(id); if (k === "text") return ["nw", "ne", "sw", "se", "e", "w", "s"]; if (k === "photo") return ["nw", "ne", "sw", "se"]; if (k === "line" || k === "pill" || k === "cards" || k === "table") return ["e", "w"]; return []; }
  // §20b §2.3/§2.4 値段を折らず1行に描くのに要る「表の幅」を、描かれている値段の箱の自然幅（折らない1行）から測る。
  // 値段の箱＝表幅×249/968（PC）／表幅そのもの（SP）。いちばん広い行の値段で決まる。中身が無ければ従来の下限に戻す。
  // 値段の文字の自然幅（折らない1行）を #meas で測る（buildH と同じ＝設計px・倍率で割らない）。いちばん広い行を返す。
  function priceNatMax(device) {
    device = device || state.device;
    const meas = document.getElementById("meas"); if (!meas) return 0;
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap";
    for (const d of SPEC.textDecls(device === "pc" ? "tPriceR" : "tPriceL", device)) { const i = d.indexOf(":"); probe.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
    meas.appendChild(probe);
    let maxNat = 0; const R = reduce(activeOps(), device);
    for (const inst of state.secList) {
      if (inst.type !== "items") continue;
      const rows = (R.secContent[inst.id] && R.secContent[inst.id].table) || [];
      for (const r of rows) { if (r.price == null) continue; probe.textContent = r.price; const w = probe.getBoundingClientRect().width; if (w > maxNat) maxNat = w; }
    }
    probe.remove();
    return maxNat;
  }
  function tableFitW(device) {
    device = device || state.device; const nat = priceNatMax(device);
    if (!nat) return device === "pc" ? 528 : 200;
    return device === "pc" ? nat * 968 / 249 : Math.max(200, nat);
  }
  // §20b §2.3 最小幅：品の並び＝1件120×列＋間、表＝どの行の値段も1行に入る幅（PC は値段欄=幅×249/968、SP は max(200, 値段1行)）
  function minWidthOf(id) { const c = canonId(id); if (c === "I_cards") { const n = colsOf(c); return 120 * n + 24 * (n - 1); } if (c === "I_table") return tableFitW(state.device); return 40; }
  function handlePoint(dir, e) { const xs = { w: e.x, e: e.x + e.w, n: e.x + e.w / 2, s: e.x + e.w / 2, nw: e.x, sw: e.x, ne: e.x + e.w, se: e.x + e.w, c: e.x + e.w / 2 }; const ys = { n: e.y, s: e.y + e.h, w: e.y + e.h / 2, e: e.y + e.h / 2, nw: e.y, ne: e.y, sw: e.y + e.h, se: e.y + e.h }; return { x: xs[dir], y: ys[dir] }; }
  function cursorFor(dir) { return ({ n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" })[dir] || "pointer"; }

  // ---- 選択（DOM を作り直さない＝ダブルクリックの対象が入れ替わらない・IME も壊さない）----
  function refreshSel() { decorate(); if (typeof onRender === "function") onRender(); }
  function selectOnly(id) { state.selectedSection = null; state.selected = new Set([canonId(id)]); refreshSel(); }
  function toggleSel(id) { state.selectedSection = null; const c = canonId(id); state.selected.has(c) ? state.selected.delete(c) : state.selected.add(c); refreshSel(); }
  function selectMany(ids) { state.selectedSection = null; state.selected = new Set(ids.map(canonId)); refreshSel(); }
  function clearSel() { state.selected = new Set(); state.selectedSection = null; refreshSel(); }
  function selectSection(sec) { state.selectedSection = sec; state.selected = new Set(); refreshSel(); }

  // ---- 履歴 ----
  function commit(op) { state.restoreUndo = null; state.ops = state.ops.slice(0, state.cursor); state.ops.push(op); state.cursor++; render(); scheduleSave(); }
  function undo() {
    if (state.viewing) return;
    if (state.restoreUndo) { const r = state.restoreUndo; state.restoreUndo = null; state.base = r.base; state.ops = r.ops; state.cursor = r.cursor; state.undoBase = r.undoBase; state.secSeq = r.secSeq; state.addSeq = r.addSeq; state.shopBase = r.shopBase; render(); scheduleSave(); return; }   // §22 §6.5「この版を下書きにする」は戻す1回で元の下書き（①・②）へ
    if (state.editing) { reconcileEdit(); flushCheckpoint(); }   // §23b 末尾の打ち分を1区切りにしてから1つ戻す
    if (state.cursor <= state.undoBase) return;   // §23c X34：戻すものが無ければ何もしない（書き換えの状態もカーソルも触らない＝PowerPoint と同じ）。§22 §2.4 開き直した後の「戻す」も undoBase まで（undoBase に着いた後の Cmd+Z も何もしない）
    state.cursor--;
    const op = state.ops[state.cursor];
    render();
    if (op && op.t === "edit" && op._ses) reenterEditSession(op.id, diffIndex(op.runs ? runsPlain(op.runs) : (op.text || ""), rawText(op.id)));   // §23b 戻すと書き換えに入り直し、戻した所にカーソル
    else if (state.editing) endEditSilently();
    scheduleSave();
  }
  function redo() {
    if (state.viewing || state.restoreUndo) return;
    if (state.editing) { reconcileEdit(); flushCheckpoint(); }
    if (state.cursor >= state.ops.length) return;
    const op = state.ops[state.cursor];
    state.cursor++;
    render();
    if (op && op.t === "edit" && op._ses) reenterEditSession(op.id, op.editCaret != null ? op.editCaret : rawText(op.id).length);   // §23b やり直しも細かく・入り直す
    else if (state.editing) endEditSilently();
    scheduleSave();
  }
  function reset() { state.base = null; state.shopBase = null; state.shopSeq = 0; state.ops = []; state.cursor = 0; state.undoBase = 0; state.restoreUndo = null; state.secSeq = 0; state.addSeq = 0; state.selected = new Set(); state.selectedSection = null; state.editing = null; state.secList = defaultSecList(); _versions = initialVersions(); _saveStatus = "saved"; _simErr = false; render(); }

  // ===================== §24（試験台24）保存（IndexedDB・自動保存）：今の形（4.9＋_pg）を保存する =====================
  // 鍵は draft（今の形）／versions（版ごとに今の形）／assets（写真 ID→データ・5.2）／settings（編集の設定・最近使った色）。
  const IDB_DB = "mikke-playground26", IDB_VER = 1, IDB_STORE = "state";
  const TEMPLATE_ASSETS = (typeof PHOTOS_JSON !== "undefined") ? PHOTOS_JSON : {};
  let _db = null, _saveTimer = null, _saveStatus = "saved", _lastSavedAt = null, _simErr = false, _verSeq = 1;
  const initialVersions = () => [{ id: "initial", kind: "initial", at: null, draft: null }];   // §6 最初の形は中身を持たない（null＝テンプレートのまま）
  let _versions = initialVersions();
  function idbOpen() { return new Promise((res, rej) => { let q; try { q = indexedDB.open(IDB_DB, IDB_VER); } catch (e) { return rej(e); } q.onupgradeneeded = () => { const db = q.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  function idbGet(db, key) { return new Promise((res, rej) => { const t = db.transaction(IDB_STORE, "readonly"); const g = t.objectStore(IDB_STORE).get(key); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); }); }
  function idbPut(db, key, val) { return new Promise((res, rej) => { const t = db.transaction(IDB_STORE, "readwrite"); t.objectStore(IDB_STORE).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
  function collectAssets() { const out = {}; for (const id in ASSET) if (!(id in TEMPLATE_ASSETS) && ASSET[id]) out[id] = ASSET[id]; return out; }   // 足した/差し替えた写真（テンプレートは入れない）
  // 見るだけ（§6）の間は、画面は版を映すが「下書き」は viewBackup 側＝保存も状態判定も下書きを見る
  function currentDraft() { if (state.viewing && state.viewBackup) { const b = state.viewBackup; return foldToDraft(b.base, b.ops.slice(0, b.cursor)); } return foldToDraft(); }
  // 試験台26：① の下書き（catalog を含む shop.json まるごと）。effShop は端末によらない
  function currentShop() {
    if (state.viewing && state.viewBackup) { const b = state.viewBackup, sb = state.base, so = state.ops, sc = state.cursor; state.base = b.base; state.ops = b.ops; state.cursor = b.cursor; const eff = reduce(b.ops.slice(0, b.cursor), "pc").effShop; state.base = sb; state.ops = so; state.cursor = sc; return clone(eff); }
    return clone(reduce(activeOps(), "pc").effShop);
  }
  function serializeDraft() { return currentDraft(); }
  function applyDraftData(d) { state.base = d || null; state.ops = []; state.cursor = 0; state.undoBase = 0; state.secSeq = (d && d.seq && d.seq.sec) || 0; state.addSeq = (d && d.seq && d.seq.add) || 0; return true; }   // §2.4 draft を土台に／連番は draft.seq から（記録の列は探さない）
  function scheduleSave() { if (_saveTimer) clearTimeout(_saveTimer); if (_saveStatus !== "error") _saveStatus = "saving"; if (typeof onRender === "function") onRender(); _saveTimer = setTimeout(doSave, 500); }   // §2.2 操作後 500ms 以内に保存／まとめて1回
  // §5.2 写真の入れ物：下書き・すべての版・戻す前の下書きが指す写真 ID を集め、入れ物を合わせる（指されないものは消す）
  function gcAssets(draftToSave, shopToSave) {
    const ref = new Set();
    const scan = (d) => { if (!d) return; const s = JSON.stringify(d); for (const id in ASSET) if (!(id in TEMPLATE_ASSETS) && s.indexOf('"' + id + '"') >= 0) ref.add(id); };
    scan(draftToSave); scan(shopToSave); for (const v of _versions) { scan(v.draft); scan(v.shop); } if (state.restoreUndo) { scan(state.restoreUndo.draft); scan(state.restoreUndo.shopDraft); }   // 試験台26：① の品の写真も「使われている」に数える（5.2）
    for (const id in ASSET) if (!(id in TEMPLATE_ASSETS) && !ref.has(id)) { delete ASSET[id]; delete ASSET_NAT[id]; }
    const out = {}; for (const id of ref) if (ASSET[id]) out[id] = ASSET[id]; return out;
  }
  async function doSave() {
    _saveTimer = null;
    try {
      if (_simErr) throw new Error("sim"); if (!_db) _db = await idbOpen();
      const draft = serializeDraft(); const shop = currentShop(); const assets = gcAssets(draft, shop);   // 試験台26：① の下書きも一緒に保存（同じ 500ms）
      await idbPut(_db, "draft", draft); await idbPut(_db, "shop", shop); await idbPut(_db, "versions", _versions);
      await idbPut(_db, "assets", assets); await idbPut(_db, "settings", { recentColors: state.recentColors });
      _saveStatus = "saved"; _lastSavedAt = Date.now();
    }
    catch (e) { _saveStatus = "error"; }   // §2.6 保存に失敗したら状態の文字をオレンジに
    if (typeof onRender === "function") onRender();
    for (const id in collectAssets()) ensureNat(id);
  }
  async function boot() {
    try {
      _db = await idbOpen();
      const vs = await idbGet(_db, "versions"); if (Array.isArray(vs) && vs.length) { _versions = vs; _verSeq = Math.max(_verSeq, ...vs.map((v) => (+String(v.id).replace(/\D/g, "") || 0))) + 1; }
      const assets = await idbGet(_db, "assets"); if (assets) for (const id in assets) ASSET[id] = assets[id];
      const st = await idbGet(_db, "settings"); if (st && Array.isArray(st.recentColors)) state.recentColors = st.recentColors.slice(0, 5);
      const sh = await idbGet(_db, "shop"); if (sh) state.shopBase = sh;   // 試験台26：① の下書きを復元
      const d = await idbGet(_db, "draft"); if (d) applyDraftData(d);
      recomputeShopSeq(state.shopBase || SHOP_JSON);   // 連番は ① の中の ID の最大から続ける
    } catch (e) {}
    render(); for (const id in collectAssets()) ensureNat(id);
  }
  function currentPublished() { const p = _versions.filter((v) => v.kind === "published"); return p.length ? p[p.length - 1] : null; }
  function draftSig() { return canonJSON(currentDraft()); }   // §6 今の形を、鍵をそろえた文字列で
  function publishedEqual() { const p = currentPublished(); if (!p || !p.draft) return false; return canonJSON(p.draft) === draftSig() && canonJSON(p.shop || null) === canonJSON(currentShop()); }   // §3.2 ①②の両方を比べる・一度も公開していなければ false・「直してから元どおり」で一致
  function statusLabel() {
    if (_saveStatus === "saving") return "保存しています…";
    if (_saveStatus === "error") return "保存できませんでした。インターネットのつながりを確かめてください";
    const p = currentPublished(); if (!p) return "まだ公開していません";
    return publishedEqual() ? "公開中と同じです" : "まだ公開していない変更があります";
  }
  function saveState() { return { status: _saveStatus, label: statusLabel(), publishedEqual: publishedEqual(), lastSavedAt: _lastSavedAt }; }
  function simulateSaveError(on) { _simErr = !!on; }
  // §4.3 公開：今の形を「公開した版」として履歴へ。公開した版は新しい方から30まで。最初の形は常に持つ。
  function publish(opts) {
    const v = { id: "v" + (_verSeq++), kind: "published", at: Date.now(), draft: currentDraft(), shop: currentShop() };   // 試験台26：①②の組で持つ
    _versions.push(v);
    const pubs = _versions.filter((x) => x.kind === "published");
    if (pubs.length > 30) { const drop = new Set(pubs.slice(0, pubs.length - 30)); _versions = _versions.filter((x) => !drop.has(x)); }
    scheduleSave(); if (typeof onRender === "function") onRender();
    return v.id;
  }
  function versions() {
    const pubs = _versions.filter((v) => v.kind === "published");
    const cur = currentPublished();
    const list = [{ id: "draft", kind: "draft", at: null, current: !cur || !publishedEqual() }];
    for (let i = pubs.length - 1; i >= 0; i--) list.push({ id: pubs[i].id, kind: "published", at: pubs[i].at, current: pubs[i] === cur });
    const brs = _versions.filter((v) => v.kind === "beforeRestore");
    for (let i = brs.length - 1; i >= 0; i--) list.push({ id: brs[i].id, kind: "beforeRestore", at: brs[i].at, current: false });   // §6.1/X32 戻す前の下書きも新しい順

    list.push({ id: "initial", kind: "initial", at: null, current: false });
    return list;
  }

  // ===================== §22 §6 公開の履歴から前の版に戻す（見るだけ／この版を下書きにする） =====================
  function versionById(id) { if (!id || id === "draft") return null; return _versions.find((v) => v.id === id) || null; }
  const publishedChrono = () => _versions.filter((v) => v.kind === "published");   // 古い順
  function resolveVerId(sel) { if (sel.id) return sel.id; const pubs = publishedChrono(); if (sel.which === "oldestPub") return pubs.length ? pubs[0].id : null; if (sel.which === "newestPub") return pubs.length ? pubs[pubs.length - 1].id : null; if (sel.which === "initial") return "initial"; return null; }
  const seqOf = (draft) => ({ sec: (draft && draft.seq && draft.seq.sec) || 0, add: (draft && draft.seq && draft.seq.add) || 0 });
  function viewingVersion() { return state.viewing; }
  // §6.2 版を「見るだけ」で出す（今の下書き＝土台・ops・連番を viewBackup に退避）。版の今の形を土台にして描く。
  function viewVersion(id) {
    if (state.editing) commitEdit();
    if (!id || id === "draft") { exitView(); return; }
    const v = versionById(id); if (!v) return;
    if (!state.viewing) state.viewBackup = { base: state.base, shopBase: state.shopBase, ops: clone(state.ops), cursor: state.cursor, undoBase: state.undoBase, secSeq: state.secSeq, addSeq: state.addSeq };
    state.viewing = id; state.selected = new Set(); state.selectedSection = null; state.editing = null;
    state.base = v.draft || null; state.shopBase = v.shop || null; state.ops = []; state.cursor = 0; const sq = seqOf(v.draft); state.secSeq = sq.sec; state.addSeq = sq.add;   // 試験台26：① も版の形で見る
    render();
  }
  function exitView() {
    if (!state.viewing) return;
    const b = state.viewBackup; state.viewing = null; state.viewBackup = null;
    if (b) { state.base = b.base; state.shopBase = b.shopBase; state.ops = b.ops; state.cursor = b.cursor; state.undoBase = b.undoBase; state.secSeq = b.secSeq; state.addSeq = b.addSeq; }
    state.selected = new Set(); state.selectedSection = null;
    render();
  }
  // §6.3 「この版を下書きにする」：その版の今の形がまるごと新しい土台に（公開中の版は変えない）。
  function restoreVersion(id) {
    const vid = id || state.viewing; const v = versionById(vid); if (!v) { exitView(); return; }
    const pre = state.viewBackup || { base: state.base, shopBase: state.shopBase, ops: clone(state.ops), cursor: state.cursor, undoBase: state.undoBase, secSeq: state.secSeq, addSeq: state.addSeq };
    const preDraft = foldToDraft(pre.base, pre.ops.slice(0, pre.cursor));
    const preShop = (function () { const sb = state.base, sh = state.shopBase, so = state.ops, sc = state.cursor; state.base = pre.base; state.shopBase = pre.shopBase; state.ops = pre.ops; state.cursor = pre.cursor; const eff = clone(reduce(pre.ops.slice(0, pre.cursor), "pc").effShop); state.base = sb; state.shopBase = sh; state.ops = so; state.cursor = sc; return eff; })();
    const pub = currentPublished();
    if (pub && pub.draft && (canonJSON(preDraft) !== canonJSON(pub.draft) || canonJSON(preShop) !== canonJSON(pub.shop || null))) {   // §6.4 公開中と違う下書き（①②どちらか）だけ「戻す前の下書き」に残す（新しい方から10）
      _versions.push({ id: "b" + (_verSeq++), kind: "beforeRestore", at: Date.now(), draft: preDraft, shop: preShop });
      const brs = _versions.filter((x) => x.kind === "beforeRestore");
      if (brs.length > 10) { const drop = new Set(brs.slice(0, brs.length - 10)); _versions = _versions.filter((x) => !drop.has(x)); }
    }
    state.restoreUndo = { base: pre.base, shopBase: pre.shopBase, ops: clone(pre.ops), cursor: pre.cursor, undoBase: pre.undoBase, secSeq: pre.secSeq, addSeq: pre.addSeq, draft: preDraft, shopDraft: preShop };   // §6.5 戻す1回で置き換える前の下書き（①②）へ
    state.viewing = null; state.viewBackup = null;
    state.base = v.draft || null; state.shopBase = v.shop || null; state.ops = []; state.cursor = 0; state.undoBase = 0; const sq = seqOf(v.draft); state.secSeq = sq.sec; state.addSeq = sq.add; recomputeShopSeq(state.shopBase || SHOP_JSON);
    state.selected = new Set(); state.selectedSection = null; state.editing = null;
    render(); scheduleSave();
  }

  // ===================== §22 §4.2 公開前チェック・長い文の目安 =====================
  const LONG_RE = /(?:^|__)(F_[hb][01]|card_name_.+|card_desc_.+|row_name_.+|row_desc_.+)$/;   // 長い文の対象＝特集の見出し/本文・品の名前/説明・表の行の名前/説明
  function lineCountOf(el) {
    const cs = getComputedStyle(el); let lh = parseFloat(cs.lineHeight);
    if (!lh || isNaN(lh)) lh = (parseFloat(cs.fontSize) || 16) * 1.5;
    const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
    const h = (el.clientHeight || 0) - padT - padB;
    return Math.max(1, Math.round(h / lh));
  }
  function measureTextLines() {   // 今の端末の描画から、対象の文字箱の行数を測る（canonId → 行数）
    const out = {};
    for (const inst of state.secList) { const host = document.getElementById(secHostId(inst)); if (!host) continue;
      for (const el of host.querySelectorAll('[data-el]')) { const id = el.getAttribute("data-el"); if (!LONG_RE.test(id)) continue; out[canonId(id)] = lineCountOf(el); } }
    return out;
  }
  // §4.2 目安＝テンプレの見本の文の行数×1.5 の切り上げ（見本1行なら2）。今の行数とともに部品ごと・端末ごとに返す。
  function longTextLimits() {
    const curOps = state.ops.slice(), curCursor = state.cursor, curBase = state.undoBase, curDev = state.device;
    const result = {};
    for (const dev of ["pc", "sp"]) {
      state.device = dev;
      state.ops = []; state.cursor = 0; render(); const tmpl = measureTextLines();   // テンプレ（手直しなし）
      state.ops = curOps; state.cursor = curCursor; render(); const cur = measureTextLines();   // 今
      for (const p in cur) { const base = p.replace(/.*__/, ""); const tl = tmpl[p] || tmpl[base] || 1; const limit = Math.max(2, Math.ceil(tl * 1.5)); (result[p] = result[p] || {})[dev] = { limit, lines: cur[p] }; }   // 複製/追加セクションの部品は、元の見本（base）の行数で目安を出す
    }
    state.device = curDev; state.ops = curOps; state.cursor = curCursor; state.undoBase = curBase; render();
    return result;
  }
  // §4.2（X31）写真のない枠の呼び名＝『セクションの名前』の N つ目の写真。内部 ID（sec1__F_p0 など）は出さない。
  // セクションの名前は足すときの型（特集／品）。N はそのセクションの写真枠の中での並び順（同じ特集に枠が2つあれば 1つ目・2つ目）。
  const ORD_JP = ["", "1つ目", "2つ目", "3つ目", "4つ目", "5つ目", "6つ目", "7つ目", "8つ目", "9つ目"];
  function emptyPhotoName(part, phList) {
    const sec = secOf(part);
    const inst = reduce(activeOps()).secList.find((s) => s.id === sec);
    const secName = (inst && inst.type === "items") ? "品" : "特集";
    const sameSec = phList.filter((p) => secOf(p.part) === sec);   // そのセクションの写真枠を並び順に
    const idx = sameSec.findIndex((p) => p.part === part);
    const n = idx >= 0 ? idx + 1 : 1;
    return `『${secName}』の${ORD_JP[n] || (n + "つ目")}の写真`;
  }
  // §4.2 公開前に見てほしい所：PC・スマホの両方で、重なり・長い文・写真のない枠・仕組みの重なり/はみ出しを集める。
  function publishCheck() {
    const limits = longTextLimits();
    const curDev = state.device; const items = []; const emptySeen = new Set();   // 写真のない枠は端末に依らない＝1枠1回
    for (const dev of ["pc", "sp"]) {
      state.device = dev; render();
      const w = warnings(); const DL = dev === "pc" ? "PC" : "スマホ";
      // 重なり（ownerOverlaps）：動かした部品を主語にして、同じ部品が複数の相手と重なっていれば1行にまとめる（§4.2）
      const Rd = reduce(activeOps(), dev); const movedP = (id) => !!(Rd.m1[canonId(id)] || Rd.m2[canonId(id)] || isAdded(id));
      const pairs = (w.ownerOverlaps || []).map((o) => [canonId(o.a), canonId(o.b)]);
      const partners = {}; for (const [a, c] of pairs) { (partners[a] = partners[a] || new Set()).add(c); (partners[c] = partners[c] || new Set()).add(a); }
      const used = new Set(); const pk = (a, c) => [a, c].sort().join("|");
      const subjects = Object.keys(partners).filter(movedP).sort((a, c) => partners[c].size - partners[a].size);
      for (const subj of subjects) { const ps = [...partners[subj]].filter((q) => !used.has(pk(subj, q))); if (!ps.length) continue; for (const q of ps) used.add(pk(subj, q)); items.push({ device: dev, kind: "overlap", parts: [subj, ...ps], text: `${DL}：${M.friendly(subj)}が、${ps.map((q) => M.friendly(q)).join("と")}に重なっています` }); }
      for (const [a, c] of pairs) { if (used.has(pk(a, c))) continue; used.add(pk(a, c)); items.push({ device: dev, kind: "overlap", parts: [a, c], text: `${DL}：${M.friendly(a)}が、${M.friendly(c)}に重なっています` }); }
      // 長い文：今の行数が目安を越えた部品
      for (const p in limits) { const L = limits[p][dev]; if (L && L.lines > L.limit) items.push({ device: dev, kind: "long", parts: [p], text: `${DL}：${M.friendly(p)}が、目安の長さ（${L.limit}行）を越えています（${L.lines}行）` }); }
      // 写真のない枠（まだ写真が無い＝足したセクション等）。端末に依らないので1枠1回
      const phList = photosApi();
      for (const ph of phList) if (ph.missing && !emptySeen.has(ph.part)) { emptySeen.add(ph.part); items.push({ device: dev, kind: "emptyPhoto", parts: [ph.part], text: `足した${emptyPhotoName(ph.part, phList)}がまだありません。公開すると、この枠は詰めて出しません` }); }
      // 仕組みの重なり・はみ出し（ふつうは空）
      for (const o of w.overlaps || []) items.push({ device: dev, kind: "system", parts: [canonId(o.a), canonId(o.b)], text: `${DL}：${M.friendly(o.a)}が、${M.friendly(o.b)}に重なっています` });
      for (const o of w.overflows || []) items.push({ device: dev, kind: "system", parts: [canonId(o.id)], text: `${DL}：${M.friendly(o.id)}がはみ出しています` });
    }
    state.device = curDev; render();
    return items;
  }
  function setDevice(d) { if (state.editing) commitEdit(); state.device = d; render(); }

  // ===================== §22 §5 プレビュー（お客さんが見る形） =====================
  function enterPreview() { if (state.preview) return; if (state.editing) commitEdit(); state.selected = new Set(); state.selectedSection = null; state.preview = true; render(); }
  function exitPreview() { if (!state.preview) return; state.preview = false; render(); }   // §5.4 スクロールは保つ・選び直さない
  function previewMode() { return state.preview; }
  // §5.5 公開の描き方での位置（写真のない枠は詰める）。プレビューと ±0.5 で一致する基準。
  function publishedGeometry(device) {
    device = device || state.device;
    if (state.preview && device === state.device) return geometry();
    const here = state.device; state._pubGeo = true; state.device = device; render();
    const g = geometry(); state._pubGeo = false; state.device = here; render(); return g;
  }

  // ---- §2 セクションの操作（上へ・下へ・複製・削除・足す）。ページの組み立て＝端末共通・1操作1undo。----
  const isAnchorSec = (id) => (id === "feature" || id === "items");
  // 足す・複製の見本：テンプレの文章そのまま。写真は「まだない写真」＝素材なし（薄い枠）。
  function templateSectionContent(type) { const c = clone(type === "feature" ? base().feature : base().items); if (type === "feature") (c.blocks || []).forEach((b) => { if (b.photo) b.photo.asset = ""; }); else (c.cards || []).forEach((cd) => { if (cd.photo) cd.photo.asset = ""; }); return c; }
  function sectionMove(id, delta) { const list = reduce(activeOps()).secList; const i = list.findIndex((s) => s.id === id); if (i < 0 || i + delta < 0 || i + delta >= list.length) return; commit({ t: "secMove", id, delta }); }
  function sectionDelete(id) { const list = reduce(activeOps()).secList; if (list.length <= 1 || !list.find((s) => s.id === id)) return; if (state.selectedSection === id) state.selectedSection = null; commit({ t: "secDel", id }); }
  function sectionAdd(pos, type) { const list = reduce(activeOps()).secList; const newId = "sec" + (++state.secSeq); const afterId = pos > 0 ? (list[pos - 1] || {}).id : null; commit({ t: "secAdd", newId, type, pos, afterId, content: templateSectionContent(type) }); state.selectedSection = null; }
  function sectionDuplicate(id) {
    const R0 = reduce(activeOps()); const idx = R0.secList.findIndex((s) => s.id === id); if (idx < 0) return;
    const type = R0.secList[idx].type; const newId = "sec" + (++state.secSeq); const pfx = newId + SEP;
    const srcPfx = isAnchorSec(id) ? "" : id + SEP;
    const Rpc = reduce(activeOps(), "pc"), Rsp = reduce(activeOps(), "sp");
    const content = clone(Rpc.secContent[id]);
    const remap = (k) => pfx + (srcPfx && k.startsWith(srcPfx) ? k.slice(srcPfx.length) : k);
    const osec = (k) => (/^F/.test(bareOf(k)) ? "feature" : "items");
    const ownPart = (k) => !isAdded(k) && (srcPfx ? k.startsWith(srcPfx) : (!k.includes(SEP) && secOf(k) === id));
    const ownOrder = (k) => srcPfx ? k.startsWith(srcPfx) : (!k.includes(SEP) && osec(k) === id);
    const perDev = (R) => { const e = { m1: {}, m2: {}, sizes: {}, zmap: {}, order: {} };
      for (const k in R.m1) if (ownPart(k)) e.m1[remap(k)] = clone(R.m1[k]);
      for (const k in R.m2) if (ownPart(k)) e.m2[remap(k)] = clone(R.m2[k]);
      for (const k in R.sizes) if (ownPart(k)) e.sizes[remap(k)] = clone(R.sizes[k]);
      for (const k in R.zmap) if (ownPart(k)) e.zmap[remap(k)] = R.zmap[k];
      for (const k in R.order) if (ownOrder(k)) e.order[remap(k)] = R.order[k].slice();
      return e; };
    const shared = { textStyles: {}, runsMap: {}, linkMap: {}, replace: {}, viewAll: {}, bright: {}, clear: [] };
    for (const k in Rpc.textStyles) if (ownPart(k)) shared.textStyles[remap(k)] = clone(Rpc.textStyles[k]);
    for (const k in Rpc.runsMap) if (ownPart(k)) shared.runsMap[remap(k)] = clone(Rpc.runsMap[k]);
    for (const k in Rpc.linkMap) if (ownPart(k)) shared.linkMap[remap(k)] = clone(Rpc.linkMap[k]);
    for (const k in Rpc.replaceMap) if (ownPart(k)) shared.replace[remap(k)] = Rpc.replaceMap[k];
    for (const k in Rpc.viewAll) if (ownPart(k)) shared.viewAll[remap(k)] = clone(Rpc.viewAll[k]);
    for (const k in Rpc.brightMap) if (ownPart(k)) shared.bright[remap(k)] = Rpc.brightMap[k];
    for (const cid of Rpc.clear) if (ownPart(cid)) shared.clear.push(remap(cid));
    const added = Rpc.adds.filter((a) => a.section === id).map((a) => ({ ...clone(a), id: (a.kind === "photo" ? "addp_" : "add_") + (++state.addSeq), section: newId }));
    commit({ t: "secDup", srcId: id, afterId: id, newId, type, content, edits: { pc: perDev(Rpc), sp: perDev(Rsp), ...shared }, added });
  }
  // §2 入口の補助（操作ボタンの出し分け）：上下の端・唯一のセクションか
  function sectionCan(id) { const list = reduce(activeOps()).secList; const i = list.findIndex((s) => s.id === id); return { up: i > 0, down: i >= 0 && i < list.length - 1, del: list.length > 1, exists: i >= 0 }; }

  // ---- ドラッグ（M1/M2 を離した位置で判定）----
  let drag = null;
  function beginDrag(clientX, clientY) {
    const ids = [...state.selected].filter(isDraggable); if (!ids.length) return false;
    const baseT = {}; for (const id of ids) { const n = elNode(id); baseT[id] = curTranslate(n); }
    drag = { ids, sx: clientX, sy: clientY, lx: clientX, ly: clientY, baseT, origGeom: geometry() }; return true;
  }
  function curTranslate(n) { if (!n) return { tx: 0, ty: 0 }; const t = n.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/); return t ? { tx: +t[1], ty: +t[2] } : { tx: 0, ty: 0 }; }
  function dragMove(clientX, clientY, alt) {
    if (!drag) return; drag.lx = clientX; drag.ly = clientY;
    const dx = (clientX - drag.sx) / scale, dy = (clientY - drag.sy) / scale;
    for (const id of drag.ids) { const n = elNode(id); if (n) n.style.transform = `translate(${drag.baseT[id].tx + dx}px,${drag.baseT[id].ty + dy}px)`; }
    document.querySelectorAll(".anchor-line,.anchor-label,.mark-anchor,.reorder-line").forEach((n) => { if (n.classList.contains("mark-anchor")) n.classList.remove("mark-anchor"); else n.remove(); });
    let g = geometry();
    const single = drag.ids.length === 1;
    // 並び替えになる位置なら、割り込む所に横線を出す（§6）。「付いていく先」の札は§2で出さない
    const ro = single ? reorderActive(g, drag.ids[0]) : null;   // §22a X29：40px 内の小さなずらし（M1）には横線を出さない。帯の縁の reorder だけ出す
    // §2 そろえる（単体・Alt でない）。並び替えのときは縦は並び替えが勝つ＝横だけ吸い付く
    drag.snapDX = 0; drag.snapDY = 0;
    if (single && !alt) { const id = drag.ids[0]; const e = g[id];
      if (e) { const snap = snapBox(secOf(id), e, true, !ro, new Set([id])); drag.snapDX = snap.dx; drag.snapDY = snap.dy;
        if (snap.dx || snap.dy) { const n = elNode(id); if (n) n.style.transform = `translate(${drag.baseT[id].tx + dx + snap.dx}px,${drag.baseT[id].ty + dy + snap.dy}px)`; g = geometry(); }
        setGuides(snap.guides, secOf(id)); } }
    else setGuides([], null);
    if (ro) showReorderLine(drag.ids[0], ro);
  }
  function classify(g, id) { if (isAdded(id)) return "M2"; const base = classifyDropX(g, id, drag ? drag.ids : [id], drag ? drag.origGeom : g);
    // §4.2.1 ③：ほかの子の箱の深い所（帯の外・入れ子でない）に落ちたら、M1 でなく M2（重なる）。自分の元の箱の中なら droppedOnChild は空＝M1 のまま
    if (base === "M1" && reorderBandIdx(g, id) < 0 && droppedOnChild(g, id) && !insideNestedGroup(g, id, g[id].y + g[id].h / 2)) return "M2";
    return base; }
  // §8 入口：ドラッグの最中だけ、今離したら何になるか
  function dropTarget() {
    if (!drag || drag.ids.length !== 1) return null;
    const id = drag.ids[0]; const g = geometry();
    if (reorderActive(g, id)) return "reorder";   // §22a X29：M1（40px 内）より後では見ない＝小さなずらしは M1
    const mode = classify(g, id); if (mode === "M1") return "M1";
    const rc = reorderClusterOf(id); const cy = g[id].y + g[id].h / 2;
    if (rc) { const og = drag.origGeom; const sibs = rc.sibs.filter((s) => og[s] && s !== id); if (sibs.length) { const top = Math.min(...sibs.map((s) => og[s].y)), bot = Math.max(...sibs.map((s) => og[s].y + og[s].h)); if (cy >= top && cy <= bot) return "overlap"; } }   // クラスタの中で M2＝重なる（②/③）
    return "M2";
  }
  // §2 複製・追加したセクションは、座標がセクションごとに独立する。C3 には「そのセクションだけ・素の ID」の実測を渡す（anchor は従来どおり全体で）。
  function stripGeom(gMerged, sec) { const pfx = sec + SEP; const out = {}; for (const k in gMerged) if (secOf(k) === sec) out[k.startsWith(pfx) ? k.slice(pfx.length) : k] = gMerged[k]; return out; }
  function classifyDropX(gMerged, id, ids, origMerged) {
    const sec = secOf(id); if (isAnchorSec(sec)) return M.classifyDrop(gMerged, id, ids, origMerged);
    const pfx = sec + SEP; const strip = (k) => k.startsWith(pfx) ? k.slice(pfx.length) : k;
    return M.classifyDrop(stripGeom(gMerged, sec), strip(id), ids.map(strip), stripGeom(origMerged, sec));
  }
  function reanchorX(gMerged, id) {
    const sec = secOf(id); if (isAnchorSec(sec)) return M.reanchor(gMerged, id, sec);
    const pfx = sec + SEP; const strip = (k) => k.startsWith(pfx) ? k.slice(pfx.length) : k;
    const inst = reduce(activeOps()).secList.find((s) => s.id === sec);
    const pr = M.reanchor(stripGeom(gMerged, sec), strip(id), inst ? inst.type : "feature");
    const re = (a) => (!a || a[0] === "@" || isAdded(a)) ? a : pfx + a;
    return { anchor: re(pr.anchor), gapY: pr.gapY, x: pr.x };
  }
  // 入れ子の別塊（品の並び・甘味処の表）の中に離したか（§2.1）。同一セクションのみ。自分自身の箱は除く（§5：表・品の並び自体をつかんだとき）。
  function insideNestedGroup(g, id, cy) {
    const sec = secOf(id); const pfx = prefixOf(id);
    for (const gid of [withPfx(pfx, "I_cards"), withPfx(pfx, "I_table")]) { if (gid === id) continue; const e = g[gid]; if (!e || secOf(gid) !== sec) continue; if (cy >= e.y && cy <= e.y + e.h) return true; }
    return false;
  }
  // 並び替えになるか（§6／§10.1／§2.1）：縦積みの塊の直接の子どうしの間に離したとき。
  // 塊の範囲（直接の子の上端〜下端を40px広げた中）にあり、入れ子の別塊の中でないこと。40px の M1 判定には依存しない。
  // §20（§4.2）並び替えの帯：子と子の空き＋上の子の下端から12・下の子の上端から12。
  // §20b §1（X26 直し）一番上の子より上・一番下の子より下の「空いた所」は pg19b と同じく並び替え（塊の範囲＝直接の子の上端〜下端±40）。
  //   そこに子の中の12の帯を足す＝一番上の子は上端＋12まで、一番下の子は下端−12までが先頭／末尾への並び替え。
  // 子の箱の深い所（帯の外・子と子の間でもない）に落としたら並び替えない（→ M2 で重なる＝③を②と同じに）。入れ子の別塊は従来どおり M2。
  const REORDER_BAND = 12;
  // §22 X27：離した中心が「並び替えの帯」の中かだけを返す（並びが実際に変わるかは別）。帯＝子と子の空き＋縁の±12、
  // 一番上/下の外の空いた所（±40）も含む。品の並び・表の縁も子と同じ帯＝②の箱の中より帯を先に見る。<0＝帯の外（深い所→②/③の M2）。
  function reorderBandIdx(g, id, ogArg) {
    if (isAdded(id)) return -1;
    const rc = reorderClusterOf(id); if (!rc) return -1;
    const og = ogArg || (drag ? drag.origGeom : g);
    const sibs = rc.sibs.filter((s) => og[s]); if (sibs.length < 2) return -1;
    const cy = g[id].y + g[id].h / 2;
    const others = sibs.filter((s) => s !== id).sort((a, b) => og[a].y - og[b].y);
    if (!others.length) return -1;
    const B = REORDER_BAND; let targetIdx = -1;
    const first = og[others[0]], last = og[others[others.length - 1]];
    if (cy < first.y - 40 || cy > last.y + last.h + 40) return -1;                                   // 塊の範囲（±40）の外 → M2（④）
    if (cy <= first.y + B) targetIdx = 0;                                                             // 一番上の子より上＋子の中12（X26）
    else if (cy >= last.y + last.h - B) targetIdx = others.length;                                     // 一番下の子より下＋子の中12（X26）
    else { for (let i = 0; i < others.length - 1; i++) { const A = og[others[i]], C = og[others[i + 1]]; if (cy >= A.y + A.h - B && cy <= C.y + B) { targetIdx = i + 1; break; } } }
    return targetIdx;
  }
  // 帯の中での並び（no-op でも位置を返す＝横線の描画用）。帯の外なら null。
  function reorderLineOrder(g, id, ogArg) {
    const targetIdx = reorderBandIdx(g, id, ogArg); if (targetIdx < 0) return null;
    const rc = reorderClusterOf(id); const og = ogArg || (drag ? drag.origGeom : g);
    const others = rc.sibs.filter((s) => og[s] && s !== id).sort((a, b) => og[a].y - og[b].y);
    const neworder = [...others]; neworder.splice(targetIdx, 0, id);
    return { key: rc.key, order: neworder };
  }
  // 並び替えの結果（帯の中で、順番が実際に変わるときだけ）。変わらなければ null（＝元の流れに戻す・コミットしない）。
  function reorderPreview(g, id, ogArg) {
    const ro = reorderLineOrder(g, id, ogArg); if (!ro) return null;
    const rc = reorderClusterOf(id); const og = ogArg || (drag ? drag.origGeom : g);
    const curOrder = rc.sibs.filter((s) => og[s]).sort((a, b) => og[a].y - og[b].y);
    if (ro.order.join() === curOrder.join()) return null;   // 位置が変わらない＝並び替えなし（no-op）
    return ro;
  }
  // §22a X29：並び替えとして扱うか。判定の順は試験台20 のとおり「40px 内のずらし（M1）」を先に見る＝小さなずらしは並び替えにしない。
  // ①実際に並びが変わる→reorder。②変わらなくても、40px の外（＝M1 でない）で帯の中なら reorder（X27 の縁の no-op）。自分の元の場所の上下は M1 が先に拾うので相手にしない。
  function reorderActive(g, id, ogArg) {
    const roReal = reorderPreview(g, id, ogArg); if (roReal) return roReal;
    const orig = ogArg || (drag ? drag.origGeom : g);
    if (classifyDropX(g, id, drag ? drag.ids : [id], orig) === "M1") return null;   // 40px 内の小さなずらし＝M1（並び替えにしない）
    if (reorderBandIdx(g, id, ogArg) >= 0) return reorderLineOrder(g, id, ogArg);   // 40px 外で帯の中＝縁の no-op も reorder
    return null;
  }
  // §4.2.1 ③で落とした先の子（縦の中心がその子の箱の中）。重なる M2 の付いていく先にする。
  function droppedOnChild(g, id) {
    const rc = reorderClusterOf(id); if (!rc) return null; const cy = g[id].y + g[id].h / 2;
    for (const s of rc.sibs) { if (s === id) continue; const e = g[s]; if (!e) continue; if (cy >= e.y && cy <= e.y + e.h) return s; }
    return null;
  }
  // ③の重なり M2：付いていく先＝落とした先の子、間隔＝落とした位置−子の下端（重なるので負になりうる）
  function overlapAnchor(g, id) { const child = droppedOnChild(g, id); if (!child) return null; const e = g[child]; return { anchor: child, gapY: +(g[id].y - (e.y + e.h)).toFixed(2), x: +g[id].x.toFixed(2) }; }
  function showReorderLine(id, ro) {
    const og = drag ? drag.origGeom : geometry(); const sec = secOf(id); const s = secNode(sec); if (!s) return;
    const idx = ro.order.indexOf(id); const above = idx > 0 ? ro.order[idx - 1] : null;
    const y = above && og[above] ? og[above].y + og[above].h + 1 : (og[ro.order.find((x) => x !== id)] ? og[ro.order.find((x) => x !== id)].y - 2 : 0);
    const me = og[id]; const line = document.createElement("div"); line.className = "reorder-line"; line.setAttribute("data-drop-line", "");   // §4.2.4
    line.style.cssText = `position:absolute;left:${me.x}px;top:${y}px;width:${me.w}px;height:2px;background:#06c;pointer-events:none;z-index:6`;
    s.appendChild(line);
  }
  function endDrag() {
    if (!drag) return;
    const dx = (drag.lx - drag.sx) / scale + (drag.snapDX || 0), dy = (drag.ly - drag.sy) / scale + (drag.snapDY || 0);
    if (Math.abs(drag.lx - drag.sx) <= 0.5 && Math.abs(drag.ly - drag.sy) <= 0.5) { drag = null; clearGuides(); render(); return; }
    const g = geometry();
    const prior = reduce(activeOps()).m1;   // 既に M1 を持つ部品を更に動かすときは積む（テンプレ位置からの総ずれ＝prior+今回）
    // 並び替え（単体・同一塊の中・兄弟を越えた）＝M1 でなく並び順の変更（§6／§10.1）
    // §22a X29：順の判定は「40px 内のずらし（M1）」が先。実際に並びが変われば reorder をコミット。40px 外の帯の no-op（縁）だけ流れに戻す（M2 にしない）。小さなずらしは下の M1 へ落とす。
    if (drag.ids.length === 1) { const id = drag.ids[0]; const roReal = reorderPreview(g, id); if (roReal) { drag = null; commit({ t: "reorder", device: state.device, key: roReal.key, id, order: roReal.order }); return; } if (reorderActive(g, id)) { drag = null; render(); return; } }
    // M1/M2 を判定。M2 の付いていく先・間隔は「離した瞬間（元の場所を詰める前）の配置」で決める（§2.2）。
    const decided = drag.ids.map((id) => ({ id, mode: classify(g, id) }));
    if (decided.some((d) => d.mode === "M2")) {
      const finalItems = decided.map((d) => {
        if (d.mode === "M1") { const bt = drag.baseT[d.id], p0 = prior[d.id] || { dx: 0, dy: 0 }; return { id: d.id, mode: "M1", dx: Math.round((p0.dx || 0) + bt.tx + dx), dy: Math.round((p0.dy || 0) + bt.ty + dy) }; }
        const ov = (!insideNestedGroup(g, d.id, g[d.id].y + g[d.id].h / 2)) ? overlapAnchor(g, d.id) : null;   // §4.2.1 ③は落とした先の子に付く
        const pr = ov || reanchorX(g, d.id);   // g＝離した瞬間（詰める前）の実測
        return { id: d.id, mode: "M2", anchor: pr.anchor, gapY: pr.gapY, x: pr.x };
      });
      drag = null; commit({ t: "move", device: state.device, items: finalItems });
      // 足した部品を置いた先で重なるなら、重ならなくなるまで自分が下がる（§5。テンプレ部品の移動は付いていく先との関係を保つ）
      for (const d of finalItems) if (d.mode === "M2" && isAdded(d.id)) pushDownClear(d.id);
    } else {
      const items = decided.map((d) => { const bt = drag.baseT[d.id], p0 = prior[d.id] || { dx: 0, dy: 0 }; return { id: d.id, mode: "M1", dx: Math.round((p0.dx || 0) + bt.tx + dx), dy: Math.round((p0.dy || 0) + bt.ty + dy) }; });
      drag = null; commit({ t: "move", device: state.device, items });
    }
  }

  // ---- 大きさを変える（§4）。つまみ(data-handle)をつかんで動かす。離した位置で記録する。----
  let rz = null;
  function contentEdges() { const dw = SPEC.DESIGN_W[state.device]; const CW = state.device === "pc" ? 1326 : 351; return { left: (dw - CW) / 2, right: (dw + CW) / 2 }; }
  // 向きと動かした量（設計px）から、変える値を出す。w/h は絶対、padB は文字の下の空き。
  // 動かした辺の反対側の辺は動かさない（中央そろえでも左そろえでも同じ＝位置ずれは commitSize が実測で記録する）。
  function computeResize(r, ddx, ddy) {
    const s = r.start; const { left: cL, right: cR } = contentEdges(); const MIN = (r.kind === "cards" || r.kind === "table") ? minWidthOf(r.id) : 40; const H = r.handle;
    const toLeft = /w/.test(H), toRight = /e/.test(H);
    if (r.kind === "text" && H === "s") return { padB: Math.max(0, Math.round(r.padB0 + ddy)) };  // 下の辺＝文字の下の空き（文字より短くはしない）
    let newW = toRight ? s.w + ddx : toLeft ? s.w - ddx : s.w;
    if (toRight) newW = Math.min(newW, cR - s.x);                 // 右端が中身の右端を越えない（左端を固定＝右へ伸ばす）
    if (toLeft) newW = Math.min(newW, (s.x + s.w) - cL);          // 左端が中身の左端を越えない（右端を固定＝左へ伸ばす）
    newW = Math.max(MIN, Math.round(newW));
    const out = { w: newW };
    if (r.kind === "photo") out.h = Math.round(newW * (s.h / s.w) * 100) / 100;  // 縦横比を保つ
    return out;
  }
  function beginResize(id, handle, clientX, clientY) { const c = canonId(id); const e = geometry()[c]; if (!e) return false; rz = { id: c, handle, kind: resizableKind(c), sx: clientX, sy: clientY, lx: clientX, ly: clientY, start: { x: e.x, y: e.y, w: e.w, h: e.h }, padB0: (reduce(activeOps()).sizes[c]?.padB) || 0, result: null }; return true; }
  // 大きさの結果（つまみの動きから）。§2：動かしている辺だけが、縦の線（左右の端・中身の端）に吸い付く（Alt で切る）。
  function resizeResult(r, ddx, ddy, alt) {
    const out = computeResize(r, ddx, ddy); let guides = [];
    if (!alt && out.w != null) { const toRight = /e/.test(r.handle), toLeft = /w/.test(r.handle);
      if (toRight || toLeft) { const { left: cL, right: cR } = contentEdges(); const MIN = 40;
        const movingX = toRight ? r.start.x + out.w : (r.start.x + r.start.w) - out.w;
        const { V } = snapTargets(secOf(r.id), new Set([r.id]));
        const best = nearestLine(V.filter((t) => t.kind === "edge"), [{ pos: movingX, kind: "edge" }], (inputMode() === "phone" ? 10 / (window.visualViewport ? window.visualViewport.scale : 1) : 6) / scale);   // §3.2.8 スマホは画面上10px
        if (best) { let nw = toRight ? best.at - r.start.x : (r.start.x + r.start.w) - best.at;
          if (toRight) nw = Math.min(nw, cR - r.start.x); if (toLeft) nw = Math.min(nw, (r.start.x + r.start.w) - cL);
          nw = Math.max(MIN, Math.round(nw)); out.w = nw; if (r.kind === "photo") out.h = Math.round(nw * (r.start.h / r.start.w) * 100) / 100;
          guides = [{ dir: "v", at: +best.at.toFixed(2), kind: best.kind, ref: best.ref }]; } } }
    return { out, guides };
  }
  function resizeMove(clientX, clientY, alt) { if (!rz) return; rz.lx = clientX; rz.ly = clientY; const { out, guides } = resizeResult(rz, (clientX - rz.sx) / scale, (clientY - rz.sy) / scale, alt); rz.result = out; const n = elNode(rz.id); if (n) { if (out.w != null) n.style.width = out.w + "px"; if (out.h != null) n.style.height = out.h + "px"; if (out.padB != null) n.style.paddingBottom = out.padB + "px"; } setGuides(guides, secOf(rz.id)); }
  function endResize() { if (!rz) return; if (Math.abs(rz.lx - rz.sx) <= 0.5 && Math.abs(rz.ly - rz.sy) <= 0.5) { rz = null; clearGuides(); render(); return; } const r = rz; const out = rz.result || computeResize(r, (rz.lx - rz.sx) / scale, (rz.ly - rz.sy) / scale); rz = null; clearGuides(); commitSize(r, out); }
  // §4：大きさの記録。縦積みの中は流れが下を押し下げる。M2（塊の外）は大きくして重なっても押し下げない（＝ownerOverlaps）。
  // 動かした辺の反対側を固定する位置ずれ dx は、幅を当てたあとの実測から出す（中央そろえ・左そろえの両方で正しい）。
  function commitSize(r, out) {
    const id = r.id; const op = { t: "size", device: state.device, id }; if (out.w != null) op.w = out.w; if (out.h != null) op.h = out.h; if (out.padB != null) op.padB = out.padB; commit(op);
    if (out.w != null) { const toLeft = /w/.test(r.handle), toRight = /e/.test(r.handle); const e = geometry()[id];
      if (e && (toLeft || toRight)) { const dx = toLeft ? Math.round((r.start.x + r.start.w) - (e.x + e.w)) : Math.round(r.start.x - e.x); if (dx) { op.dx = dx; render(); } } }
  }
  // プリセット用：つまみを ddx/ddy（設計px）動かす（alt=true で吸い付きなし）
  function programResize(id, handle, ddx, ddy, alt) { const c = canonId(id); const e = geometry()[c]; if (!e) return; const r = { id: c, handle, kind: resizableKind(c), start: { x: e.x, y: e.y, w: e.w, h: e.h }, padB0: (reduce(activeOps()).sizes[c]?.padB) || 0 }; const { out } = resizeResult(r, ddx, ddy, alt); commitSize(r, out); }
  function sizesList() { const R = reduce(activeOps()); const out = []; for (const [id, s] of Object.entries(R.sizes || {})) { const o = { part: id }; if (s.w != null) o.w = s.w; if (s.h != null) o.h = s.h; if (s.padB != null) o.padB = s.padB; out.push(o); } return out; }

  // ---- そろえる・目安の線（§2 スマートガイド）----
  let curGuides = [], curGuidesSec = null;
  // そろえる相手の線。縦（v＝左端/真ん中/右端・中身の左右中）と横（h＝上端/真ん中/下端）。
  // 対象＝テンプレの部品・足した部品・表/品の並びの外枠。品の1件・表の1行の中の部品は対象外（canonId!==id で畳む）。
  function snapTargets(sec, exclude) {
    const g = geometry(); const V = [], H = [];
    const { left: cL, right: cR } = contentEdges(); const cC = (cL + cR) / 2;
    V.push({ at: cL, kind: "edge", ref: "@content" }, { at: cC, kind: "center", ref: "@content" }, { at: cR, kind: "edge", ref: "@content" });
    for (const [id, e] of Object.entries(g)) {
      if (exclude.has(id) || secOf(id) !== sec) continue;
      if (canonId(id) !== id) continue;                    // 見出しの組の中・ピルの文字は親に畳む
      if (REPEAT.test(id) || /^row_vline_/.test(id)) continue;   // 品の1件・表の行の中は対象外
      if (!(isDraggable(id) || id === "I_cards" || id === "I_table")) continue;
      V.push({ at: e.x, kind: "edge", ref: id }, { at: e.x + e.w / 2, kind: "center", ref: id }, { at: e.x + e.w, kind: "edge", ref: id });
      H.push({ at: e.y, kind: "edge", ref: id }, { at: e.y + e.h / 2, kind: "center", ref: id }, { at: e.y + e.h, kind: "edge", ref: id });
    }
    return { V, H };
  }
  // 動かしている線（lines＝[{pos,kind}]）を相手（targets）に合わせる。同じ種類どうし（edge↔edge・center↔center）。画面6px以内で最も近い1本。
  // 距離が同じときは、真ん中どうし＞中身（@content）を優先する（部品の端とたまたま重なっても、意図は真ん中・中身へのそろえ＝Z3）。
  const tieScore = (x) => (x.kind === "center" ? 2 : 0) + (x.ref === "@content" ? 1 : 0);
  function nearestLine(targets, lines, threshDesign) {
    let best = null;
    for (const L of lines) for (const t of targets) { if (t.kind !== L.kind) continue; const ad = Math.abs(t.at - L.pos); if (ad > threshDesign) continue;
      const cand = { d: t.at - L.pos, at: t.at, kind: t.kind, ref: t.ref };
      if (!best || ad < Math.abs(best.d) - 1e-6 || (Math.abs(ad - Math.abs(best.d)) < 1e-6 && tieScore(cand) > tieScore(best))) best = cand; }
    return best;
  }
  const movingV = (b) => [{ pos: b.x, kind: "edge" }, { pos: b.x + b.w / 2, kind: "center" }, { pos: b.x + b.w, kind: "edge" }];
  const movingH = (b) => [{ pos: b.y, kind: "edge" }, { pos: b.y + b.h / 2, kind: "center" }, { pos: b.y + b.h, kind: "edge" }];
  // ドラッグ中の箱（box）を縦横それぞれ吸い付かせる。位置は最も近い1本で決め、吸い付いた後に重なる線はすべて目安線にする（PowerPoint は複数本出る）。
  function snapBox(sec, box, useV, useH, exclude) {
    const th = (inputMode() === "phone" ? 10 / (window.visualViewport ? window.visualViewport.scale : 1) : 6) / scale; const { V, H } = snapTargets(sec, exclude); const guides = [];   // §3.2.8 スマホは画面上10px（PCは6px）
    const addCoincident = (lines, moving, dir) => { for (const t of lines) for (const L of moving) if (t.kind === L.kind && Math.abs(t.at - L.pos) < 0.5 && !guides.some((gg) => gg.dir === dir && Math.abs(gg.at - t.at) < 0.5 && gg.ref === t.ref)) guides.push({ dir, at: +t.at.toFixed(2), kind: t.kind, ref: t.ref }); };
    const bv = useV ? nearestLine(V, movingV(box), th) : null;
    const bh = useH ? nearestLine(H, movingH(box), th) : null;
    const dx = bv ? bv.d : 0, dy = bh ? bh.d : 0;
    if (bv) addCoincident(V, movingV({ ...box, x: box.x + dx }), "v");
    if (bh) addCoincident(H, movingH({ ...box, y: box.y + dy }), "h");
    return { dx, dy, guides };
  }
  function setGuides(gs, sec) { curGuides = gs || []; curGuidesSec = sec || null; drawGuides(); }
  function clearGuides() { curGuides = []; curGuidesSec = null; document.querySelectorAll(".snap-guide").forEach((n) => n.remove()); }
  function drawGuides() {
    document.querySelectorAll(".snap-guide").forEach((n) => n.remove());
    if (!curGuides.length || !curGuidesSec) return; const s = secNode(curGuidesSec); if (!s) return;
    const sh = s.getBoundingClientRect().height / scale, sw = SPEC.DESIGN_W[state.device];
    for (const gg of curGuides) { const n = document.createElement("div"); n.className = "snap-guide";
      if (gg.dir === "v") n.style.cssText = `position:absolute;left:${gg.at}px;top:0;width:1px;height:${sh}px;background:#f0309a;pointer-events:none;z-index:9`;
      else n.style.cssText = `position:absolute;left:0;top:${gg.at}px;width:${sw}px;height:1px;background:#f0309a;pointer-events:none;z-index:9`;
      s.appendChild(n); }
  }
  function guidesList() { return curGuides.map((x) => ({ ...x })); }

  // 足した／貼り付けた部品が text/photo/pill と重なるなら、重ならなくなるまで自分が下がる（§5。line は対象外）。
  // 新しい op は作らず、その部品の置き場所を決めている op（add の gap／gapOther、または M2 の move）を書き換える＝1操作=1 undo。
  // field："gap"（置いた端末）／"gapOther"（もう一方の端末）。M2 の move があればそちらを優先して gapY を増やす。
  function pushDownClear(id, field) {
    field = field || "gap";
    for (let iter = 0; iter < 50; iter++) {
      const g = geometry(); const me = g[id]; if (!me) return;
      // 厳密な重なり判定（warnings は写真の上の文字＝内包を許すが、ここでは内包も「重なり」として下げる）
      let lowest = 0, any = false;
      for (const [oid, e] of Object.entries(g)) {
        if (oid === id || secOf(oid) !== secOf(id)) continue;
        // 障害物＝文字・写真・ボタン、および繰り返す並び全体（I_cards／I_table）。並びに付く部品は並びの下へ出す（並びが縮んでも重ならない）
        const isObstacle = ["text", "photo", "pill"].includes(e.kind) || oid === "I_cards" || oid === "I_table";
        if (!isObstacle) continue;
        const ox = Math.min(me.x + me.w, e.x + e.w) - Math.max(me.x, e.x);
        const oy = Math.min(me.y + me.h, e.y + e.h) - Math.max(me.y, e.y);
        if (ox > 1 && oy > 1) { any = true; lowest = Math.max(lowest, e.y + e.h); }
      }
      if (!any) return;
      const push = (lowest + 16) - me.y; if (push <= 0.5) return;
      let done = false;
      for (let i = state.cursor - 1; i >= 0 && !done; i--) {
        const op = state.ops[i];
        if (op.t === "move" && op.device === state.device) { const it = op.items && op.items.find((x) => x.id === id && x.mode === "M2"); if (it) { it.gapY += push; done = true; } }
        else if (op.t === "add" && op.id === id) { op[field] = (op[field] != null ? op[field] : 16) + push; done = true; }
      }
      if (!done) return;
      render();
    }
  }
  // 貼り付け・複製した部品を、両端末それぞれで重ならないよう下げる（§5。置き場所は端末ごと）
  function resolveBothDevices(ids) {
    const here = state.device, other = here === "pc" ? "sp" : "pc";
    for (const id of ids) pushDownClear(id, "gap");
    state.device = other; render();
    for (const id of ids) pushDownClear(id, "gapOther");
    state.device = here; render();
  }

  // 範囲選択（矩形は screen 座標→ここでは design 矩形を受ける）
  function selectInDesignRect(sec, r) {
    const g = rawGeomOf(sec); const chosen = [];
    for (const [id, e] of Object.entries(g)) { const c = canonId(id); if (!isDraggable(c) || REPEAT.test(id)) continue; if (e.x >= r.x - 0.5 && e.y >= r.y - 0.5 && e.x + e.w <= r.x + r.w + 0.5 && e.y + e.h <= r.y + r.h + 0.5) if (!chosen.includes(c)) chosen.push(c); }
    return chosen;
  }

  // ---- 矢印キー・削除（M1 として）----
  // §X36 足した部品の矢印キー：place の gap・x を動かす（ドラッグと同じ M2 の記録。geometry から今の位置を測って dx,dy を足す）
  function nudgeAddedItem(c, dx, dy, R, g) { const a = R.added.find((x) => x.id === c); const anchor = a ? a.anchor : c; const ab = g[anchor] ? (g[anchor].y + g[anchor].h) : 0; const curY = g[c] ? g[c].y : ab, curX = g[c] ? g[c].x : 0; return { id: c, mode: "M2", anchor, gapY: (curY - ab) + dy, x: curX + dx }; }
  function nudge(id, dx, dy) {
    const c = canonId(id); const R = reduce(activeOps());
    if (isAdded(c)) { commit({ t: "move", device: state.device, items: [nudgeAddedItem(c, dx, dy, R, geometry())] }); return; }   // §X36
    if (R.m2[c]) { const ov = R.m2[c]; commit({ t: "move", device: state.device, items: [{ id: c, mode: "M2", anchor: ov.anchor, gapY: ov.gapY, x: ov.x + dx }] }); if (dy) { const ov2 = reduce(activeOps()).m2[c]; commit({ t: "move", device: state.device, items: [{ id: c, mode: "M2", anchor: ov2.anchor, gapY: ov2.gapY + dy, x: ov2.x }] }); } return; }
    const m = R.m1[c] || { dx: 0, dy: 0 };
    commit({ t: "move", device: state.device, items: [{ id: c, mode: "M1", dx: m.dx + dx, dy: m.dy + dy }] });
  }
  function nudgeSelected(dx, dy) { const ids = [...state.selected].filter(isDraggable); if (!ids.length) return; const R = reduce(activeOps()); const g = geometry(); const items = ids.map((c) => { if (isAdded(c)) return nudgeAddedItem(c, dx, dy, R, g); const m = R.m1[c] || { dx: 0, dy: 0 }; return { id: c, mode: "M1", dx: m.dx + dx, dy: m.dy + dy }; }); commit({ t: "move", device: state.device, items }); }
  function deleteSelected() {
    const all = [...state.selected]; const one = all.length === 1 ? all[0] : null;
    if (one && isRepeat(one)) { const b = bareOf(one); if (/^card_/.test(b) || /^c_/.test(b)) cardsDelete(one); else tableDelete(one); state.selected = new Set(); render(); return; }   // 試験台26：品の並び・表の1件 → ① 連動
    const ids = all.filter((id) => isDraggable(id) || REPEAT.test(id)); if (!ids.length) return; for (const id of ids) commit({ t: "del", id: canonId(id) }); state.selected = new Set(); render();
  }

  // ---- その場書き換え ----
  function rawText(id, R) {
    R = R || reduce(activeOps());
    const c = R.secContent[secOf(id)]; const b = bareOf(id);
    if (c) {
      const mB = { F_h0: [0, "heading"], F_b0: [0, "body"], F_h1: [1, "heading"], F_b1: [1, "body"] };
      if (mB[b] && c.blocks) return c.blocks[mB[b][0]][mB[b][1]];
      let m; if ((m = b.match(/^card_(name|desc|price)_(.+)$/)) && c.cards) { const x = c.cards.find((x) => x.id === m[2]); return x ? x[m[1]] : ""; }
      if ((m = b.match(/^row_(name|desc|price)_(.+)$/)) && c.table) { const x = c.table.find((x) => x.id === m[2]); return x ? (x[m[1]] || "") : ""; }
    }
    const a = R.adds.find((a) => a.id === id); if (a) return R.editMap[id] != null ? R.editMap[id] : a.text;
    return elNode(id)?.textContent || "";
  }
  // ===================== §23b 書き換え中の「戻す」を細かくする（記録 0.6：打った分を少しずつ戻す） =====================
  let _breakTimer = null;
  function clearBreakTimer() { if (_breakTimer) { clearTimeout(_breakTimer); _breakTimer = null; } }
  function resetBreakTimer() { clearBreakTimer(); _breakTimer = setTimeout(() => { if (state.editing) flushCheckpoint(); }, 1000); }   // 1秒止まったら区切る
  const runsPlain = (runs) => (runs || []).map((r) => r.text).join("");
  function diffIndex(a, b) { const m = Math.min(a.length, b.length); let i = 0; while (i < m && a[i] === b[i]) i++; return i; }
  function pushOpNoRender(op) { state.restoreUndo = null; state.ops = state.ops.slice(0, state.cursor); state.ops.push(op); state.cursor++; scheduleSave(); if (typeof onRender === "function") onRender(); }   // DOM は既に正しい＝render しない
  // 今の書き換えの状態を1区切り（undo の1単位）として記録。前の区切りから変わっていなければ何もしない。
  // 変換の境目（開始・確定）。要素の oncomposition* が届かない経路でも、WIRING の document 監視からここを呼ぶ。
  function imeBoundary(kind) {
    if (!state.editing) return;
    if (kind === "start") { composing = true; flushCheckpoint(); }
    else { composing = false; reconcileEdit(); liveReflow(); flushCheckpoint(); }
  }
  function flushCheckpoint() {
    if (!state.editing) return; clearBreakTimer();
    const id = state.editing.id;
    if (state.pendingNewText === id) { state.editing.mode = null; return; }   // 足したばかりの文字は commitEdit で add に焼き込む（1追加=1undo）
    const cur = state.editing.runs || rawRuns(id);
    if (JSON.stringify(cur) === JSON.stringify(state.editing.lastRuns)) { state.editing.mode = null; return; }
    const n = elNode(id); const c = n ? caretOffsets(n) : null;
    const styled = runStyled(cur);
    const op = styled ? { t: "edit", id, runs: clone(cur), _ses: 1 } : { t: "edit", id, text: runsPlain(cur), _ses: 1 };
    op.editCaret = c ? c.e : runsPlain(cur).length;
    pushOpNoRender(op);
    state.editing.lastRuns = clone(cur); state.editing.mode = null;
  }
  // 入力ごとの区切り判定（変換中でないとき）：打つ↔消すの切り替え・区切り文字（空白・句読点）・改行・1秒止まりで区切る。
  function handleEditInput(e) {
    const it = (e && e.inputType) || "";
    const isDelete = /delete/i.test(it);
    const isBreakChar = !!(e && e.data && /[\s　、。，．・,.!?！？;:；：]/.test(e.data));
    const isEnter = /insertParagraph|insertLineBreak/i.test(it);
    const newMode = isDelete ? "del" : "type";
    if (state.editing.mode && state.editing.mode !== newMode) flushCheckpoint();   // 打つ↔消すの切り替えで区切る
    reconcileEdit(); liveReflow();
    state.editing.mode = newMode;
    if (isBreakChar || isEnter) flushCheckpoint();   // 区切り文字・改行を打ったら区切る
    else resetBreakTimer();
  }
  // 戻す／やり直しで、その区切りの書き換えの状態に入り直す。入り直した所にカーソルを置く（記録 0.6）。
  function reenterEditSession(id, caretOff) {
    if (state.editing) { if (state.editing.selWatch) document.removeEventListener("selectionchange", state.editing.selWatch); state.editing = null; }
    clearBreakTimer();
    startEdit(id);   // 今の ops から runs を読み直して書き換えに入る
    const n = elNode(id); if (!n || !state.editing) return;
    const off = Math.max(0, Math.min(caretOff, runsPlain(state.editing.runs).length));
    setCaretOffsets(n, off, off); state.editing.lastSel = { s: off, e: off };
    state.editing.lastRuns = clone(state.editing.runs); state.editing.mode = null;
  }
  function endEditSilently() {   // 区切りの外へ戻った＝書き換えを静かに抜ける（新しい区切りは作らない）
    if (!state.editing) return; const n = elNode(state.editing.id);
    if (state.editing.selWatch) document.removeEventListener("selectionchange", state.editing.selWatch);
    clearBreakTimer(); state.editing = null;
    if (n) { n.oninput = n.oncompositionstart = n.oncompositionend = n.onkeydown = null; n.removeAttribute("contenteditable"); }
  }

  function startEdit(id, selectAll) {
    const c = canonId(id); const n = elNode(c); if (!n || !isText(c)) return;
    if (state.editing) commitEdit();
    // X3：書き換えに入ったら、その部品を選んだ状態にする（PowerPoint と同じ）＝上の文字の道具が出る。品・表の中の1件の文字でも同じ。
    state.selectedSection = null; state.selected = new Set([c]);
    const runs = rawRuns(c);
    state.editing = { id: c, runs, lastRuns: clone(runs), mode: null };   // §23b lastRuns＝直前の区切り、mode＝打つ/消す
    n.innerHTML = runsToEditHtml(runs);         // 見た目つきの切れ目（文の一部の見た目）を見せて編集（§13）
    n.setAttribute("contenteditable", "true");
    n.style.whiteSpace = "pre-wrap"; n.style.wordBreak = "normal"; n.style.outline = "2px solid #06c";
    n.focus();
    const range = document.createRange(); range.selectNodeContents(n); if (!selectAll) range.collapse(false);   // §4（試験台17）足した文字は全選択（打てば置き換わる）
    const selc = window.getSelection(); selc.removeAllRanges(); selc.addRange(range);
    if (selectAll) { const o = caretOffsets(n); if (o) state.editing.lastSel = o; }
    // 道具に触れて選択が外れても使えるよう、選択を覚えておく
    state.editing.selWatch = () => { if (!state.editing) return; const nn = elNode(state.editing.id); if (!nn) return; const o = caretOffsets(nn); if (o && o.e > o.s) state.editing.lastSel = o; };
    document.addEventListener("selectionchange", state.editing.selWatch);
    n.oninput = (e) => { if (composing || (e && e.isComposing)) return; handleEditInput(e); if (typeof onEditInput === "function") onEditInput(e); };  // 変換中は取り込まない（§2.1/§23a）。区切り判定は handleEditInput（§23b）。§19 自動リンクは onEditInput で
    n.oncompositionstart = () => imeBoundary("start");
    n.oncompositionend = () => imeBoundary("end");   // §23b 変換を決めたら1区切り（1変換=1undo）
    n.onkeydown = (e) => { if (e.isComposing || e.keyCode === 229) return;   /* §23a X33 日本語の変換中のキーはページで拾わない（preventDefault もしない） */
      if (/^(Arrow|Home|End|PageUp|PageDown)/.test(e.key)) flushCheckpoint();   // §23b カーソルを動かしたら区切る
      if (e.key === "Escape") { e.preventDefault(); commitEdit(); } };
    refreshSel();   // X3：選択の印と、上の文字の道具を今の状態に更新する（書き換えに入った部品が選ばれている）
  }
  function liveReflow() { placeAbsolute(); if (typeof onRender === "function") onRender(); }
  function commitEdit() {
    if (!state.editing) return; const id = state.editing.id; const n = elNode(id);
    clearBreakTimer();
    if (n) reconcileEdit();
    const wasNew = state.pendingNewText === id;   // §4（試験台17）この書き換えが「足したばかりの文字」の最初の書き換えか
    if (!wasNew) flushCheckpoint();   // §23b 末尾の打ち分を最後の区切りに（書き換えまるごとを1つにまとめ直さない）
    const runs = (state.editing.runs) || (n ? domToRuns(n) : [{ text: rawText(id) }]);
    if (state.editing.selWatch) document.removeEventListener("selectionchange", state.editing.selWatch);
    state.editing = null; if (n) { n.oninput = n.oncompositionstart = n.oncompositionend = n.onkeydown = null; n.removeAttribute("contenteditable"); }
    const styled = runStyled(runs);
    if (!wasNew) { render(); return; }   // §23b 区切りは既に ops に記録済み。改行規則を当て直して再描画
    if (wasNew) {
      state.pendingNewText = null;
      const plain = runs.map((r) => r.text).join("");
      let ai = -1; for (let i = state.cursor - 1; i >= 0; i--) { if (state.ops[i].t === "add" && state.ops[i].id === id) { ai = i; break; } }
      if (plain.trim() === "") {   // §4 空なら、足したこと自体をなかったことに（履歴にも残さない）
        if (ai >= 0) { state.ops.splice(ai, 1); state.cursor--; }
        state.selected = new Set(); render(); return;
      }
      if (ai >= 0) { const op = state.ops[ai]; op.text = plain; }   // 素の文字は add に焼き込む（1追加=1undo）
      if (styled) commit({ t: "edit", id, runs }); else render();   // 見た目つきなら runs を別 op で（runsMap に乗る）
      return;
    }
    commit(styled ? { t: "edit", id, runs } : { t: "edit", id, text: (runs[0] ? runs[0].text : "") });  // 改行規則を当て直して再描画
  }
  function editApi(id, text) { commit({ t: "edit", id: canonId(id), text }); } // 記録つき書き換え（§7 edit）

  // ---- クリップボード ----
  function copySelection() {
    const ids = [...state.selected]; if (!ids.length) return;
    if (ids.length === 1 && /^card_/.test(ids[0])) { state.clipboard = { kind: "card", cardId: cardIdOf(ids[0]) }; return; }
    if (ids.length === 1 && /^row_/.test(ids[0])) { state.clipboard = { kind: "row", rowId: cardIdOf(ids[0]) }; return; }
    // 幅は端末ごとのコピー元の幅を使う（§2.3）＝両端末を測って持つ
    const here = state.device, other = here === "pc" ? "sp" : "pc";
    const gHere = geometry();
    state.device = other; render(); const gOther = geometry(); state.device = here; render();
    const Rc = reduce(activeOps());
    const parts = ids.filter(isDraggable).map((id) => ({ id, kind: kindOf(id), text: isText(id) ? rawText(id) : null, runs: Rc.runsMap[id] ? clone(Rc.runsMap[id]) : null, elink: Rc.linkMap[id] || null, asset: kindOf(id) === "photo" ? assetOfPart(id, Rc) : null, brightness: brightnessOf(id), x: gHere[id].x, y: gHere[id].y, w: gHere[id].w, h: gHere[id].h, wOther: gOther[id] ? gOther[id].w : gHere[id].w, hOther: gOther[id] ? gOther[id].h : gHere[id].h }));
    if (parts.length) state.clipboard = { kind: "parts", parts };
  }
  function cutSelection() { copySelection(); deleteSelected(); }
  // §5：貼り付け・複製はコピー元のすぐ下（間隔16）、左端をコピー元にそろえ、コピー元に付いていく。重なれば自分が下がる。
  function paste() {
    const cb = state.clipboard; if (!cb) return;
    if (cb.kind === "card") { cardsDuplicate((cb.sec ? cb.sec + SEP : "") + "card_name_" + cb.cardId); return; }   // 試験台26：① 連動の複製
    if (cb.kind === "row") { tableDuplicate((cb.sec ? cb.sec + SEP : "") + "row_name_" + cb.rowId); return; }
    const base = cb.parts[0];
    const targetSec = state.selectedSection || secOf(base.id);
    const moveToOtherSec = targetSec !== secOf(base.id);
    const newIds = [];
    for (let i = 0; i < cb.parts.length; i++) {
      const p = cb.parts[i]; const id = (p.kind === "photo" ? "addp_" : "add_") + (++state.addSeq);
      let anchor, gap, x;
      if (moveToOtherSec) {                             // 別セクション：そのセクションの中身の一番下（間隔16）
        const g = geometry(); let bottomId = HG[targetSec], by = g[HG[targetSec]] ? g[HG[targetSec]].y + g[HG[targetSec]].h : 0;
        for (const [eid, e] of Object.entries(g)) { if (secOf(eid) !== targetSec || !isDraggable(canonId(eid)) || REPEAT.test(eid)) continue; if (e.y + e.h > by) { by = e.y + e.h; bottomId = eid; } }
        anchor = bottomId; gap = 16; x = g[bottomId] ? g[bottomId].x : (state.device === "pc" ? 56 : 20);
      } else if (i === 0) {                             // コピー元のすぐ下（間隔16）、左端そろえ
        anchor = base.id; gap = 16; x = p.x;
      } else {                                          // 複数：1件目との位置関係を保つ
        anchor = base.id; gap = 16 + (p.y - base.y); x = p.x;
      }
      commit({ t: "add", id, section: targetSec, kind: p.kind === "photo" ? "photo" : "text", styleName: styleOf(p.id), asset: p.kind === "photo" ? p.asset : undefined, w: p.w, wOther: p.wOther, h: p.kind === "photo" ? p.h : undefined, hOther: p.kind === "photo" ? p.hOther : undefined, text: p.text || "", anchor, gap, gapOther: gap, placedDevice: state.device, x });
      if (p.brightness) commit({ t: "bright", id, v: p.brightness });   // §2.7（X16）明るさも引き継ぐ
      if (p.runs) commit({ t: "edit", id, runs: clone(p.runs) });        // §19 文の一部の見た目・リンクも引き継ぐ
      if (p.elink) commit({ t: "elink", id, link: clone(p.elink) });     // §19 部品まるごとリンクも引き継ぐ
      newIds.push(id);
    }
    resolveBothDevices(newIds);                           // 両端末それぞれで重なりを自分が下がって解消（§5）
    selectMany(newIds);
  }
  // 試験台26：品の並び・表の1件の複製は ① 連動（新しい品を作る）。それ以外は従来のコピー＆貼り付け
  function duplicate() { const ids = [...state.selected]; const one = ids.length === 1 ? ids[0] : null; if (one && isRepeat(one)) { const b = bareOf(one); if (/^card_/.test(b) || /^c_/.test(b)) cardsDuplicate(one); else tableDuplicate(one); return; } copySelection(); paste(); }
  const cardIdOf = (id) => { const b = bareOf(id); return (b.match(/^(?:card|row)_(?:photo|name|desc|price|vline)?_?(.+)$/) || [])[1] || b.replace(/^(?:card|row)_[a-z]+_/, ""); };

  // ===================== 試験台26：① 連動の操作（品の並び・表を触ると ① が変わる） =====================
  const pgToastMsg = (msg) => { if (typeof pgToast === "function") pgToast(msg); };
  // 選んだパーツの属する並び（cards/table）・1件エントリ・並びID を返す
  function partInfo(fullId) {
    const b = bareOf(fullId), sec = secOf(fullId);
    const kind = (/^card_/.test(b) || /^c_/.test(b)) ? "cards" : ((/^row_/.test(b) || /^t_/.test(b)) ? "table" : null);
    if (!kind) return null;
    const cid = cardIdOf(fullId);
    const pfx = (sec === "feature" || sec === "items") ? "" : sec + SEP;
    const R = reduce(activeOps(), "pc"); const c = R.secContent[sec]; const arr = (c && (kind === "cards" ? c.cards : c.table)) || [];
    const entry = arr.find((x) => x.id === cid) || null;
    return { sec, kind, cid, pfx, gid: pfx + (kind === "cards" ? "I_cards" : "I_table"), entry, arr, R };
  }
  // 値段の持ち主（載せ方の価格があれば載せ方、なければ品）
  function priceOwnerOf(info) { const cat = info.R.effShop.catalog; const plc = (info.entry && info.entry._placementId) ? cat.placements[info.entry._placementId] : null; return (plc && plc.prices) ? { kind: "placement", id: info.entry._placementId } : { kind: "item", id: info.entry && info.entry._itemId }; }
  // 値段の箱が読む：今の有効な価格と持ち主・品名
  function effPricesOf(fullId) { const info = partInfo(fullId); if (!info || !info.entry) return null; const cat = info.R.effShop.catalog; const own = priceOwnerOf(info); const src = own.kind === "placement" ? cat.placements[own.id] : cat.items[own.id]; return { owner: own, prices: clone((src && src.prices) || []), name: (cat.items[info.entry._itemId] || {}).name || "" }; }
  // 値段を決める（その並びのメニューの載せ方の価格、なければ品の価格を書き換える。1操作1undo）
  function setPrices(fullId, prices) { const info = partInfo(fullId); if (!info || !info.entry) return false; const own = priceOwnerOf(info); const withIds = (prices || []).map((p) => p.id ? clone(p) : Object.assign({ id: mintShopId("prc") }, p)); commit({ t: "catAct", shops: [{ t: "shopPrice", target: own, prices: withIds }] }); return true; }

  // ---- catalog を読む補助 ----
  const curCat = () => reduce(activeOps(), "pc").effShop.catalog;
  const curSpec = (gid) => { const R = reduce(activeOps(), "pc"); return R.sourceResolved[gid] || templateSource(gid); };
  const menuName = (mid) => { const m = curCat().menus[mid]; return (m && m.name) || ""; };
  const placementsOfItem = (cat, itemId) => Object.keys(cat.placements).filter((k) => cat.placements[k].itemId === itemId);
  // 同じメニュー・括りの中で、選んだ載せ方の「すぐ後ろ」に入る order を返す
  function orderAfter(cat, menuId, categoryId, afterPlc) {
    const sib = Object.keys(cat.placements).map((k) => cat.placements[k]).filter((p) => p.menuId === menuId && p.categoryId === categoryId);
    const a = afterPlc ? (afterPlc.order || 0) : 0;
    const nexts = sib.map((p) => p.order || 0).filter((o) => o > a).sort((x, y) => x - y);
    return nexts.length ? (a + nexts[0]) / 2 : a + 1;
  }
  // ---- 表（全部を並べる所）：行を足す・複製・削除 → ① を直す ----
  function tableAddRow(fullId) {
    const info = partInfo(fullId); if (!info) return; const cat = info.R.effShop.catalog;
    const sel = info.entry; const spec = curSpec(info.gid); const menuId = (sel && sel._menu) || spec.menu;
    const selPlc = (sel && sel._placementId) ? cat.placements[sel._placementId] : null;
    const categoryId = selPlc ? selPlc.categoryId : (Object.keys(cat.categories).find((c) => cat.categories[c].menuId === menuId));
    const itemId = mintShopId("itm"), plcId = mintShopId("plc");
    const item = { id: itemId, name: "新しい品", status: "onSale" };   // 値段は空のまま（分からない値は書かない）
    const placement = { id: plcId, itemId, menuId, categoryId, order: orderAfter(cat, menuId, categoryId, selPlc) };
    commit({ t: "catAct", shops: [{ t: "shopAdd", item, placement }] });
    return { itemId, partId: tablePartId(itemId), gid: info.gid };
  }
  function tableDuplicate(fullId) {
    const info = partInfo(fullId); if (!info || !info.entry) return; const cat = info.R.effShop.catalog;
    const srcItemId = info.entry._itemId, srcItem = cat.items[srcItemId]; const srcPlc = info.entry._placementId ? cat.placements[info.entry._placementId] : null;
    const menuId = (info.entry._menu) || (srcPlc && srcPlc.menuId); const categoryId = srcPlc ? srcPlc.categoryId : null;
    const itemId = mintShopId("itm"), plcId = mintShopId("plc");
    const item = clone(srcItem); item.id = itemId;
    if (item.prices) item.prices = item.prices.map((p) => Object.assign(clone(p), { id: mintShopId("prc") }));
    const placement = { id: plcId, itemId, menuId, categoryId, order: orderAfter(cat, menuId, categoryId, srcPlc) };
    if (srcPlc && srcPlc.prices) placement.prices = srcPlc.prices.map((p) => Object.assign(clone(p), { id: mintShopId("prc") }));
    commit({ t: "catAct", shops: [{ t: "shopAdd", item, placement }] });
    return { itemId, partId: tablePartId(itemId) };
  }
  function tableDelete(fullId) {
    const info = partInfo(fullId); if (!info || !info.entry) return; const cat = info.R.effShop.catalog;
    const itemId = info.entry._itemId, plcId = info.entry._placementId, item = cat.items[itemId];
    const others = placementsOfItem(cat, itemId).filter((k) => k !== plcId);
    const alsoItem = others.length === 0; const name = (item && item.name) || "品";
    commit({ t: "catAct", shops: [{ t: "shopDel", placementId: plcId, itemId, alsoItem }] });
    if (alsoItem) pgToastMsg(name + "をお品書きから消しました");
    else { const om = cat.placements[others[0]]; pgToastMsg(name + "を" + menuName(info.entry._menu) + "から外しました（" + menuName(om.menuId) + "には残っています）"); }
    return { alsoItem };
  }
  // ---- 品の並び（絞り込んで並べる所）：案C（触った並びだけが変わる＝直接選ぶ）に決定（26b） ----
  // まだ一度も触っていない並びは絞り込み（① で「おすすめ」を付けた品が自動で出る）のまま。
  // 足す・複製・消すを初めてしたとき、その並びは「今出ている品を直接選んだ」並び（pick）に変わる。
  const LIST_MODE = "pick";   // 26b：案A（ラベル・件数）はやめた。?list=pick の切り替えも廃止
  // 初めて触ったとき、今出ている品で pick を作る
  function ensurePickSpec(gid) { const spec = curSpec(gid); if (spec.pick) return clone(spec); const R = reduce(activeOps(), "pc"); const sec = gid.indexOf(SEP) >= 0 ? instTag(gid) : "items"; const c = R.secContent[sec]; const arr = (c && c.cards) || []; return { menu: spec.menu, pick: arr.map((e) => e._itemId) }; }
  // 品の並びに、一覧で選んだ品を足す（pick に足す。① は変えない）
  function cardsAddExisting(gid, itemId) {
    const cat = curCat(); const item = cat.items[itemId]; const name = (item && item.name) || "品";
    const spec = ensurePickSpec(gid); if (!spec.pick.includes(itemId)) spec.pick.push(itemId); commit({ t: "catAct", src: { gid, spec } });
    if (!isDisplayable(item)) pgToastMsg(name + "は今は並びに出ません（" + outReason(item) + "）");
  }
  // 新しい品を作って並びに足す（お品書きに新しい品＝ラベルなし、この並びの pick に足す）
  function cardsAddNew(gid, categoryId) {
    const spec0 = curSpec(gid); const menuId = spec0.menu; const cat = curCat();
    const itemId = mintShopId("itm"), plcId = mintShopId("plc");
    const item = { id: itemId, name: "新しい品", status: "onSale" };   // 値段は空のまま・おすすめ等の印は付けない
    const placement = { id: plcId, itemId, menuId, categoryId, order: orderAfter(cat, menuId, categoryId, null) };
    const spec = ensurePickSpec(gid); spec.pick.push(itemId); commit({ t: "catAct", shops: [{ t: "shopAdd", item, placement }], src: { gid, spec } });
    return { itemId, partId: cardPartId(itemId) };
  }
  function cardsDuplicate(fullId) {
    const info = partInfo(fullId); if (!info || !info.entry) return; const cat = info.R.effShop.catalog;
    const srcItemId = info.entry._itemId, srcItem = cat.items[srcItemId]; const srcPlc = info.entry._placementId ? cat.placements[info.entry._placementId] : null;
    const menuId = (info.entry._menu) || (srcPlc && srcPlc.menuId); const categoryId = srcPlc ? srcPlc.categoryId : null;
    const itemId = mintShopId("itm"), plcId = mintShopId("plc");
    const item = clone(srcItem); item.id = itemId; if (item.prices) item.prices = item.prices.map((p) => Object.assign(clone(p), { id: mintShopId("prc") }));
    const placement = { id: plcId, itemId, menuId, categoryId, order: orderAfter(cat, menuId, categoryId, srcPlc) };
    if (srcPlc && srcPlc.prices) placement.prices = srcPlc.prices.map((p) => Object.assign(clone(p), { id: mintShopId("prc") }));
    const spec = ensurePickSpec(info.gid); const i = spec.pick.indexOf(srcItemId); if (i >= 0) spec.pick.splice(i + 1, 0, itemId); else spec.pick.push(itemId);
    commit({ t: "catAct", shops: [{ t: "shopAdd", item, placement }], src: { gid: info.gid, spec } });
    return { itemId, partId: cardPartId(itemId) };
  }
  function cardsDelete(fullId) {
    const info = partInfo(fullId); if (!info || !info.entry) return; const cat = info.R.effShop.catalog;
    const itemId = info.entry._itemId, item = cat.items[itemId]; const name = (item && item.name) || "品";
    const spec = ensurePickSpec(info.gid); const i = spec.pick.indexOf(itemId); if (i >= 0) spec.pick.splice(i, 1); commit({ t: "catAct", src: { gid: info.gid, spec } });
    pgToastMsg(name + "をこの並びから外しました（お品書きには残っています）");
  }
  // 品を選ぶ一覧（そのメニューの品を括りごと。今出ている品は選べない扱い、出ない品は理由つき）
  function outReason(item) { if (!item) return ""; if (item.status === "paused") return "一時休止中"; if (item.status && item.status !== "onSale") return "販売していません"; if (item.season && item.season.months && item.season.months.length && !item.season.months.includes(curMonth())) { const ms = item.season.months; return ms[0] + "〜" + ms[ms.length - 1] + "月だけ"; } return "今は並びに出ません"; }
  function itemPickerData(gid) {
    const R = reduce(activeOps(), "pc"); const spec = R.sourceResolved[gid] || templateSource(gid); const cat = R.effShop.catalog; const menuId = spec.menu;
    const sec = gid.indexOf(SEP) >= 0 ? instTag(gid) : "items"; const c = R.secContent[sec]; const shown = new Set(((c && c.cards) || []).map((e) => e._itemId));
    const cats = Object.keys(cat.categories).filter((cid) => cat.categories[cid].menuId === menuId).sort((a, b) => (cat.categories[a].order || 0) - (cat.categories[b].order || 0));
    const groups = cats.map((cid) => {
      const plcs = Object.keys(cat.placements).filter((k) => cat.placements[k].menuId === menuId && cat.placements[k].categoryId === cid).sort((a, b) => (cat.placements[a].order || 0) - (cat.placements[b].order || 0));
      const items = plcs.map((k) => { const it = cat.items[cat.placements[k].itemId]; return { itemId: cat.placements[k].itemId, name: (it && it.name) || "", shown: shown.has(cat.placements[k].itemId), displayable: isDisplayable(it), reason: isDisplayable(it) ? "" : outReason(it) }; });
      return { categoryId: cid, name: cat.categories[cid].name, items };
    });
    return { gid, menuId, menuName: menuName(menuId), categories: groups };
  }
  // ---- お品書きを見る（① の下書きを、公開中①〔無ければ最初の形〕と比べて出す） ----
  function itemSig(cat, itemId) {
    const it = cat.items[itemId]; if (!it) return null;
    const plcs = Object.keys(cat.placements).filter((k) => cat.placements[k].itemId === itemId).map((k) => { const p = cat.placements[k]; return { menu: p.menuId, cat: p.categoryId, order: p.order, prices: p.prices || null }; }).sort((a, b) => (a.menu + a.cat).localeCompare(b.menu + b.cat));
    return JSON.stringify({ name: it.name, description: it.description || "", prices: it.prices || null, labels: (it.labels || []).slice().sort(), status: it.status || "", season: it.season || null, plcs });
  }
  function catalogView() {
    const cur = currentShop().catalog;
    const pub = currentPublished();
    const baseCat = (pub && pub.shop) ? pub.shop.catalog : shopTpl().catalog;
    const R = reduce(activeOps(), "pc");
    const shownCard = {}, shownRow = {};
    for (const inst of R.secList) { if (inst.type !== "items") continue; const pfx = (inst.id === "feature" || inst.id === "items") ? "" : inst.id + SEP; const c = R.secContent[inst.id]; if (!c) continue; for (const e of (c.cards || [])) if (!(e._itemId in shownCard)) shownCard[e._itemId] = pfx + "card_name_" + e.id; for (const e of (c.table || [])) if (!(e._itemId in shownRow)) shownRow[e._itemId] = pfx + "row_name_" + e.id; }
    const labelName = (lid) => (cur.labels[lid] || baseCat.labels[lid] || {}).name || lid;
    // 値段は「そのメニューで出す値段」（載せ方の価格があればそれ、なければ品の価格。3.4）＝その括りの載せ方で見る
    const mkItem = (src, itemId, placementId, state) => { const it = src.items[itemId]; const prices = priceOf({ catalog: src }, itemId, placementId); return { itemId, name: it.name || "", price: formatPrices(prices), labels: (it.labels || []).map(labelName), status: it.status || "", season: (it.season && it.season.months) ? it.season.months : null, display: isDisplayable(it), state, part: shownCard[itemId] || shownRow[itemId] || null }; };
    const menuIds = Object.keys(cur.menus).sort((a, b) => (cur.menus[a].order || 0) - (cur.menus[b].order || 0));
    const menus = menuIds.map((mid) => {
      const cats = Object.keys(cur.categories).filter((c) => cur.categories[c].menuId === mid).sort((a, b) => (cur.categories[a].order || 0) - (cur.categories[b].order || 0));
      const categories = cats.map((cid) => {
        const plcs = Object.keys(cur.placements).filter((k) => cur.placements[k].menuId === mid && cur.placements[k].categoryId === cid).sort((a, b) => (cur.placements[a].order || 0) - (cur.placements[b].order || 0));
        const items = plcs.map((k) => { const itemId = cur.placements[k].itemId; const st = !baseCat.items[itemId] ? "new" : (itemSig(cur, itemId) !== itemSig(baseCat, itemId) ? "changed" : "same"); return mkItem(cur, itemId, k, st); });
        const delPlcs = Object.keys(baseCat.placements).filter((bk) => baseCat.placements[bk].menuId === mid && baseCat.placements[bk].categoryId === cid && baseCat.items[baseCat.placements[bk].itemId] && !Object.keys(cur.placements).some((ck) => cur.placements[ck].itemId === baseCat.placements[bk].itemId && cur.placements[ck].menuId === mid && cur.placements[ck].categoryId === cid));
        const delItems = delPlcs.map((bk) => mkItem(baseCat, baseCat.placements[bk].itemId, bk, "deleted"));
        return { categoryId: cid, name: cur.categories[cid].name, items: items.concat(delItems) };
      });
      return { menuId: mid, name: cur.menus[mid].name || "", categories };
    });
    return { menus };
  }
  const kindOf = (id) => (/^F_p|^I_.*photo|photo/.test(id) ? "photo" : "text");
  const styleOf = (id) => (/_h\d$/.test(id) || id === "F_h0" ? "featHead" : "featBody");

  // ---- 戻す（§4）----
  function resetScope(scope, id, devices) { commit({ t: "resetScope", scope, id: id || (scope === "part" ? [...state.selected][0] : "F_h0"), devices: devices || [state.device] }); }
  // §2.1（N1）：位置・大きさ・並び順・重なり順のどれか1つでもテンプレから変わっていれば「元の位置に戻す」を出す
  function partChangedFromTemplate(id) {
    const c = canonId(id); const R = reduce(activeOps());
    const chg = (k) => !!(R.m1[k] || R.m2[k] || R.sizes[k] || (R.zmap && R.zmap[k] != null) || (R.colsMap && R.colsMap[k] && R.colsMap[k][state.device] != null));   // §20 列も「変わった」＝元の位置に戻すが出る
    if (chg(c)) return true;
    // §5 左右入替も「変わった」（特集の部品）
    if (R.swapMap[secOf(c)] && R.swapMap[secOf(c)][state.device]) { const sd = R.swapMap[secOf(c)][state.device]; if (Object.values(sd).some(Boolean) && blockOfPart(c) != null) return true; }
    const rc = reorderClusterOf(c); if (rc && R.order[rc.key]) return true;
    const g = groupOf(id); if (g && (chg(g) || (() => { const r = reorderClusterOf(g); return r && R.order[r.key]; })())) return true;
    return false;
  }
  // 元の配置を見る（押している間だけ）
  function peekOn() { state.peek = true; render(); }   // 手で動かした部品を元の位置で見せる（記録は変えない）
  function peekOff() { state.peek = false; render(); }

  // ---- 前面・背面（§4 重なり順）----
  const effZ = (id, zmap) => (zmap[canonId(id)] != null ? zmap[canonId(id)] : (groupOf(id) && zmap[groupOf(id)] != null ? zmap[groupOf(id)] : 0));
  function overlapPartners(id) {                       // id（canon）と重なっている相手の data-el id
    const w = warnings(); const out = new Set();
    for (const p of [...w.overlaps, ...w.ownerOverlaps]) {
      const ca = canonId(p.a), cb = canonId(p.b), ga = groupOf(p.a), gb = groupOf(p.b);
      if (ca === id || ga === id) out.add(p.b); else if (cb === id || gb === id) out.add(p.a);
    }
    return [...out];
  }
  // §22 §8 重なり順の決め方：端末ごとの「前後の順番」。手直しのない部品の初めの順＝テンプレの描画順（後に描くものほど前＝DOM順）。
  // 重なっている相手＋自分を1つの束として、今の前後（zmap があればそれ、無ければ描画順）で並べ、動かした後に連番で materialize する（同値を作らない）。
  function drawOrderIndex() { const g = geometry(); const di = {}; let i = 0; for (const k of Object.keys(g)) { const c = canonId(k); if (di[c] == null) di[c] = i++; } return di; }
  const effZsort = (id, zmap, di) => (zmap[id] != null ? zmap[id] : (groupOf(id) && zmap[groupOf(id)] != null ? zmap[groupOf(id)] : (di[id] != null ? di[id] : 0)));
  function zReorder(mode) {
    const id = canonId([...state.selected][0]); if (!id) return;
    const partners = overlapPartners(id); if (!partners.length) return;
    const R = reduce(activeOps()); const di = drawOrderIndex();
    const cluster = [id, ...partners].sort((a, b) => effZsort(a, R.zmap, di) - effZsort(b, R.zmap, di));   // back→front
    const pos = cluster.indexOf(id); const order = cluster.slice();
    if (mode === "front") { order.splice(pos, 1); order.push(id); }
    else if (mode === "back") { order.splice(pos, 1); order.unshift(id); }
    else if (mode === "forward") { if (pos < cluster.length - 1) { order[pos] = cluster[pos + 1]; order[pos + 1] = id; } }
    else if (mode === "backward") { if (pos > 0) { order[pos] = cluster[pos - 1]; order[pos - 1] = id; } }
    const base = Math.min(...cluster.map((c) => Math.floor(effZsort(c, R.zmap, di))));   // 束の最小の前後を基準に連番（相対順だけが意味を持つ）
    const zs = {}; order.forEach((c, i) => { zs[c] = base + i; });
    commit({ t: "zorder", device: state.device, zs });
  }
  function bringToFront() { zReorder("front"); }      // 最前面へ移動（相手すべての前へ）
  function sendToBack() { zReorder("back"); }          // 最背面へ移動（相手すべての後ろへ）
  function bringForward() { zReorder("forward"); }     // 前面へ移動（今すぐ前の1つと入れ替え）
  function sendBackward() { zReorder("backward"); }    // 背面へ移動（今すぐ後ろの1つと入れ替え）
  function hasOverlapPartner() { const id = canonId([...state.selected][0]); return !!id && overlapPartners(id).length > 0; }
  // 今の端末の重なり順（部品 ID。後ろほど上＝実効 z の昇順、同値は y 順）
  function zOrderList() {
    const R = reduce(activeOps()); const g = geometry(); const ids = new Set(Object.keys(R.zmap));
    const w = warnings(); for (const p of [...w.overlaps, ...w.ownerOverlaps]) { ids.add(canonId(p.a)); ids.add(canonId(p.b)); }
    return [...ids].filter((id) => g[id]).sort((a, b) => (effZ(a, R.zmap) - effZ(b, R.zmap)) || (g[a].y - g[b].y));
  }

  // ---- テキスト追加ツール（ツールバー）----
  function addTextAt(markerId, gap, text) {
    const g = geometry(); const a = g[markerId]; if (!a) return;
    const id = "add_" + (++state.addSeq);
    const w = state.device === "pc" ? 600 : 351;
    commit({ t: "add", id, section: secOf(markerId), kind: "text", styleName: "featBody", w, text: text || "テキスト", anchor: markerId, gap: gap ?? 24, placedDevice: state.device, x: a.x });
    selectOnly(id);
    startEdit(id);
  }

  // ---- §5（試験台17）写真の明るさ ----
  function setBrightness(id, v) { v = Math.max(-40, Math.min(40, Math.round(v / 20) * 20)); commit({ t: "bright", id: canonId(id), v }); }
  function brightnessOf(id) { return (reduce(activeOps()).brightMap || {})[canonId(id)] || 0; }

  // ---- §3/§4（試験台17）写真・文字を「置いた位置」に足す（絶対位置→手で離したときと同じ付いていく先）----
  // 足した部品を中心(cx,cy・セクション内の設計px)へ動かした瞬間の付いていく先を取り、add op を書き換える（1操作=1undo・他の部品は動かさない）。
  function finalizeAddedAt(id, cx, cy) {
    selectOnly(id);
    const g = geometry(); const e = g[id]; if (!e) return;
    const { left: cL, right: cR } = contentEdges();
    if (cx - e.w / 2 < cL) cx = cL + e.w / 2; if (cx + e.w / 2 > cR) cx = cR - e.w / 2;   // 中身の左右の端からはみ出さないように寄せる
    const n = elNode(id); const tx = cx - e.w / 2, ty = cy - e.h / 2;
    if (n) n.style.transform = "translate(" + (tx - e.x) + "px," + (ty - e.y) + "px)";
    const g2 = geometry(); const pr = reanchorX(g2, id);
    // add op：自動の基準（付いていく先・間隔16・左端そろえ）＋置いた端末の手直し位置（placed）。元に戻すと placed を捨て自動へ。
    for (let i = state.cursor - 1; i >= 0; i--) { const op = state.ops[i]; if (op.t === "add" && op.id === id) { op.anchor = pr.anchor; op.gap = 16; op.gapOther = 16; op.x = "@left"; op.placed = { device: state.device, anchor: pr.anchor, gapY: pr.gapY, x: pr.x }; break; } }
    render();
    // §2.4（X13）もう一方の端末・元に戻した後の自動の位置は「付いていく先のすぐ下16・左端そろえ」で固定し、
    // その下の重なる部品を押し下げる（placeAbsolute が描画時に行う＝手直しとして記録しない）。ここでは cascade 下げをしない。
  }
  function provAnchorOf(sec) { const inst = reduce(activeOps()).secList.find((s) => s.id === sec); const type = inst ? inst.type : "feature"; const pfx = (sec === "feature" || sec === "items") ? "" : sec + SEP; return withPfx(pfx, type === "feature" ? "F_hg" : "I_hg"); }
  // 写真を足す：幅は PC の配置で中身の幅の半分・スマホで中身の幅いっぱい。高さは比のまま（幅の1.25倍を超えるときは枠を4:5）。
  async function addPhotoAtPoint(file, sec, cx, cy) {
    const r = await loadImageFile(file); if (!r) return null;
    const here = state.device, other = here === "pc" ? "sp" : "pc";
    const dim = (dev) => { const CW = dev === "pc" ? 1326 : 351; const w = dev === "pc" ? Math.floor(CW / 2) : CW; let h = Math.round(r.h / r.w * w * 100) / 100; if (h > w * 1.25) h = Math.round(w * 1.25 * 100) / 100; return { w, h }; };
    const dH = dim(here), dO = dim(other);
    const id = "addp_" + (++state.addSeq);
    commit({ t: "add", id, section: sec, kind: "photo", asset: r.asset, w: dH.w, wOther: dO.w, h: dH.h, hOther: dO.h, text: "", anchor: provAnchorOf(sec), gap: 0, gapOther: 16, x: "@left", placedDevice: here });
    finalizeAddedAt(id, cx, cy);
    selectOnly(id);
    return id;
  }
  // 文字を足す：幅は PC 600・スマホ 351。置いたらすぐ書き換え（全選択）。空で終えたらなかったことに（commitEdit）。
  function addTextAtPoint(sec, cx, cy) {
    const here = state.device; const w = here === "pc" ? 600 : 351; const wO = here === "pc" ? 351 : 600;
    const id = "add_" + (++state.addSeq);
    commit({ t: "add", id, section: sec, kind: "text", styleName: "featBody", w, wOther: wO, text: "テキスト", anchor: provAnchorOf(sec), gap: 0, gapOther: 16, x: "@left", placedDevice: here });
    finalizeAddedAt(id, cx, cy);
    state.pendingNewText = id; selectOnly(id); startEdit(id, true);
    return id;
  }

  // ---- 試験の再現（Q1〜Q8・R1〜R9 の並び。runPreset は実操作に近い形で流す）----
  function presets() {
    return {
      Q1: [{ act: "move", id: "F_h0", by: [12, 8] }, { act: "editAppend", id: "F_b0", add: S1_ADD }],
      Q2: [{ act: "moveToBelow", id: "F_b0", target: "F_p0", gap: 24, alignLeft: "F_p0" }, { act: "edit", id: "F_h0", text: S2_HEAD }],
      Q3: [{ act: "moveGroupBelow", ids: ["F_h0", "F_b0"], target: "F_p0", gap: 24, alignLeft: "F_p0" }, { act: "edit", id: "F_h0", text: S2_HEAD }],
      Q4: [{ act: "editAppend", id: "F_b0", add: S1_ADD }],
      Q5: [{ act: "editAppend", id: "F_b0", add: "季節の意匠。" }],
      Q6: [{ act: "addBelow", marker: "I_divider", gap: 24, text: "季節により品が替わります" }, { act: "moveAddedBelowSection", extra: 80 }],
      Q7: [{ act: "move", id: "F_h0", by: [12, 8] }],
      Q8: [{ act: "move", id: "F_h0", by: [12, 8] }],
      // R1：区切り線を下へ30（M1）
      R1: [{ act: "move", id: "I_divider", by: [0, 30] }],
      // R2（改）：区切り線を甘味処の見出しの下端＋1（縦の中心をそこへ）→ 並び替え（見出し→区切り線→営業時間）
      R2: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_kanmi", edge: "bottom", off: 1 }],
      // R3：繰り返す部品を中に持つ子（品の並び）の中へ落として M2（付いていく先が card_ でないことを見る）
      R3: [{ act: "moveToCardDesc", id: "I_divider", cardIndex: 1 }],
      // R4：特集1の見出しを Cmd+C → Cmd+V
      R4: [{ act: "copyPaste", id: "F_h0" }],
      // R5：特集1の写真を Cmd+D
      R5: [{ act: "dup", id: "F_p0" }],
      // R6：本文を写真と見出しの間へ（SP の並び替え）
      R6: [{ act: "reorderBetween", id: "F_b0", after: "F_p0", before: "F_h0" }],
      // R7：本文を見出しより上へ（PC の文字の塊の並び替え）
      R7: [{ act: "reorderBefore", id: "F_b0", before: "F_h0" }],
      // R8：見出しを同じ塊の中で右30・下20（M1・並び替えにならない）
      R8: [{ act: "move", id: "F_h0", by: [30, 20] }],
      // R9：表が2行なので先に1行複製して3行にしてから、区切り線の下に文字を足し、表の2行目と3行目の間の高さへ→ 表を1行減らす（§2.4）
      R9: [{ act: "dupRow", rowIndex: 1 }, { act: "addBelow", marker: "I_divider", gap: 24, text: "季節により品が替わります" }, { act: "moveAddedToRowGap", afterRow: 1 }, { act: "delRow", rowIndex: 1 }],
      // T1：区切り線を甘味処の見出しと営業時間の間へ（並び替え）
      T1: [{ act: "reorderBetween", id: "I_divider", after: "I_kanmi", before: "I_time" }],
      // T2（改）：区切り線の上端を表の下端＋40 へ → 並び替え（表→区切り線→ボタン）。§3で並び替えの相手が全直接子になった
      T2: [{ act: "moveToRef", id: "I_divider", ref: "I_table", edge: "bottom", off: 40 }],
      // T3：区切り線の上端を表の上端＋60（表の中）へ → M2（付いていく先=表）
      T3: [{ act: "moveToRef", id: "I_divider", ref: "I_table", edge: "top", off: 60 }],
      // T4：特集1の本文を写真の下端から24下へ（上向きでない M2・Q2 と同じ）
      T4: [{ act: "moveToBelow", id: "F_b0", target: "F_p0", gap: 24, alignLeft: "F_p0" }],
      // T5：特集1の見出しを Cmd+C → Cmd+V（SP 幅は verify で確認）
      T5: [{ act: "copyPaste", id: "F_h0" }],
      // V1：区切り線を表の中（上端＋60、縦の中心）へ → M2（代表。verify は区切り線・見出し・営業時間の3つを1つずつ）
      V1: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_table", edge: "top", off: 60 }],
      // W1：特集1の見出しを右30下20（R8 と同じ・本文と重なる＝自分で重ねた）
      W1: [{ act: "move", id: "F_h0", by: [30, 20] }],
      // W2：甘味処の見出しを縦中心が表の上端＋60 へ（V1 と同じ・M2）
      W2: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }],
      // W3：W2 のあと見出しを「背面へ」→「前面へ」
      W3: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }, { act: "select", id: "I_kanmi" }, { act: "zback" }, { act: "zfront" }],
      // W4：W2・W3 のあとそのセクションを元に戻す
      W4: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }, { act: "select", id: "I_kanmi" }, { act: "zback" }, { act: "resetSection", sec: "items" }],
      // W5：W1 のあと本文に書き足す
      W5: [{ act: "move", id: "F_h0", by: [30, 20] }, { act: "editAppend", id: "F_b0", add: S1_ADD }],
      // W6：表を縦中心が甘味処見出しの縦中心より10上へ（並び替え）
      W6: [{ act: "moveCenterToCenter", id: "I_table", ref: "I_kanmi", off: -10 }],
      // W7：ボタンを営業時間と表の隙間の真ん中へ（並び替え）
      W7: [{ act: "moveCenterToGap", id: "I_pillbg", after: "I_time", before: "I_table" }],
      // W8：品の並びを営業時間と表の隙間の真ん中へ（並び替え）
      W8: [{ act: "moveCenterToGap", id: "I_cards", after: "I_time", before: "I_table" }],
      // W9：表を下へ10（M1）
      W9: [{ act: "move", id: "I_table", by: [0, 10] }],
      // W10：表（1回目で全体が選ばれる）＝代表として表全体を選ぶ
      W10: [{ act: "select", id: "I_table" }],
      // W11：部品を選ぶ（本文）＝操作ボタンの位置確認の代表
      W11: [{ act: "select", id: "F_b0" }],
      // ===== 試験台8 Y1〜Y14（大きさ・選んでからのドラッグ）=====
      // Y1：表全体を選んでから下へ20（選んでからのドラッグ＝全体が M1 で動く）
      Y1: [{ act: "select", id: "I_table" }, { act: "move", id: "I_table", by: [0, 20] }],
      // Y2：Y1 のあと行の文字を選ぶ（中の1件）
      Y2: [{ act: "select", id: "I_table" }, { act: "move", id: "I_table", by: [0, 20] }, { act: "selectRow", index: 0 }],
      // Y3：営業時間の右の辺で幅を200へ
      Y3: [{ act: "resizeTo", id: "I_time", handle: "e", w: 200 }],
      // Y4：特集1の本文の左の辺を右へ100（幅100減・右端固定）
      Y4: [{ act: "resize", id: "F_b0", handle: "w", by: [100, 0] }],
      // Y5：特集1の本文の下の辺を下へ40（padB 40）
      Y5: [{ act: "resize", id: "F_b0", handle: "s", by: [0, 40] }],
      // Y6：Y5 のあと下の辺を上へ100（文字の高さで止まる＝padB 0）
      Y6: [{ act: "resize", id: "F_b0", handle: "s", by: [0, 40] }, { act: "resize", id: "F_b0", handle: "s", by: [0, -100] }],
      // Y7：特集1の写真の右下の角を左上へ100・100（比を保って縮む）
      Y7: [{ act: "resize", id: "F_p0", handle: "se", by: [-100, -100] }],
      // Y8：区切り線の右の辺を左へ200・ボタンの右の辺を右へ100
      Y8: [{ act: "resize", id: "I_divider", handle: "e", by: [-200, 0] }, { act: "resize", id: "I_pillbg", handle: "e", by: [100, 0] }],
      // Y9：本文の右の辺を中身の右端より200右まで（端で止まる）
      Y9: [{ act: "resize", id: "F_b0", handle: "e", by: [2000, 0] }],
      // Y10：PC で Y3（端末またぎは verify で確認）
      Y10: [{ act: "resizeTo", id: "I_time", handle: "e", w: 200 }],
      // Y11：Y4 のあと 戻す→やり直す→元の位置に戻す
      Y11: [{ act: "resize", id: "F_b0", handle: "w", by: [100, 0] }, { act: "undo" }, { act: "redo" }, { act: "resetPart", id: "F_b0" }],
      // Y12：甘味処の見出しを表の上端＋60（縦中心）へ→その右の辺を右へ100
      Y12: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }, { act: "resize", id: "I_kanmi", handle: "e", by: [100, 0] }],
      // Y13：Y4 のあと本文の最後に書き足す（幅はそのまま・高さが伸びる）
      Y13: [{ act: "resize", id: "F_b0", handle: "w", by: [100, 0] }, { act: "editAppend", id: "F_b0", add: S1_ADD }],
      // Y14：区切り線を品の並びの上端−20（縦中心）へ＝区切り線を一番上に（並び替え）
      Y14: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_cards", edge: "top", off: -20 }],
      // ===== 試験台9 Z1〜Z7（そろえる・目安の線）=====
      // Z1：見出しを右30→左端が本文の左端+3 へ（吸い付いて本文の左端にそろう）
      Z1: [{ act: "move", id: "F_h0", by: [30, 0] }, { act: "snapAlignLeft", id: "F_h0", ref: "F_b0", off: 3 }],
      // Z2：Z1 の2回目を Alt ありで（吸い付かない＝+3 のまま）
      Z2: [{ act: "move", id: "F_h0", by: [30, 0] }, { act: "snapAlignLeft", id: "F_h0", ref: "F_b0", off: 3, alt: true }],
      // Z3：甘味処見出しを右へ（PC50/SP20）→横の真ん中が中身の真ん中+3 へ（@content の真ん中にそろう）
      Z3: [{ act: "moveDev", id: "I_kanmi", pc: [50, 0], sp: [20, 0] }, { act: "snapAlignCenterContent", id: "I_kanmi", off: 3 }],
      // Z4：本文の右の辺を、見出しの右端+3 へ（見出しの右端にそろう）
      Z4: [{ act: "snapResizeRight", id: "F_b0", ref: "F_h0", off: 3 }],
      // Z5：見出しを矢印キーの右で3回（吸い付かない）
      Z5: [{ act: "arrow", id: "F_h0", dir: "right", times: 3 }],
      // Z6：区切り線を R2 と同じ所へ（甘味処見出しの下端+1・縦中心）＝並び替え
      Z6: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_kanmi", edge: "bottom", off: 1, snap: true }],
      // Z7：本文の右の辺を写真に重なるまで（Y9 と同じ）＝ownerOverlaps
      Z7: [{ act: "resize", id: "F_b0", handle: "e", by: [2000, 0] }],
      // ===== 試験台10 P1〜P16（写真の差し替え・見せる範囲）。画像はプリセットの中で作る（四分割＝4章）=====
      P1: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }],
      P2: [{ act: "replaceQuad", id: "F_p0", name: "tall.jpg", w: 600, h: 1600 }],
      P3: [{ act: "replaceQuad", id: "F_p1", name: "wide.jpg", w: 1600, h: 600 }],
      P4: [{ act: "replaceQuad", id: "F_p0", name: "small.png", w: 300, h: 200, type: "image/png" }],
      P5: [{ act: "clearPhoto", id: "F_p0" }, { act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }],
      P6: [{ act: "replaceQuadCard", cardId: "c_warabi", name: "tall.jpg", w: 600, h: 1600 }],
      P7: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPan", id: "F_p0", by: [100, 0] }],
      P8: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropZoom", id: "F_p0", zoom: 2 }],
      P9: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPan", id: "F_p0", by: [5000, 0] }],
      P10: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPanCancel", id: "F_p0", by: [100, 0] }],
      P11: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPan", id: "F_p0", by: [100, 0] }],
      P12: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropPan", id: "F_p0", by: [100, 0] }, { act: "undo" }, { act: "undo" }, { act: "redo" }, { act: "redo" }],
      P13: [{ act: "replaceQuad", id: "F_p0", name: "big.jpg", w: 6000, h: 4000 }],
      P14: [{ act: "replaceQuad", id: "F_p0", name: "rotated.jpg", w: 1200, h: 1600 }],
      P15: [{ act: "replaceBad", id: "F_p0" }],
      P16: [{ act: "resize", id: "F_p0", handle: "se", by: [-100, -100] }, { act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "resetPart", id: "F_p0" }],
      // ===== 試験台11 U1〜U6（元の位置に戻す・見せる範囲の拡大の直し）=====
      // U1：本文の右の辺を左へ60（大きさだけ変える）→「元の位置に戻す」が出る・押すと戻る
      U1: [{ act: "resize", id: "F_b0", handle: "e", by: [-60, 0] }, { act: "resetPart", id: "F_b0" }],
      // U2：写真の右下の角を左上へ60・60（大きさだけ変える）→ 戻す
      U2: [{ act: "resize", id: "F_p0", handle: "se", by: [-60, -60] }, { act: "resetPart", id: "F_p0" }],
      // U3：wide に差し替え→右下のつまみを画像の幅・高さと同じだけ右下へ（反対の角＝左上を止めて2倍）
      U3: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropCorner", id: "F_p0", dir: "se", fx: 1, fy: 1 }],
      // U4：U3 の後、右下のつまみを左上へ画像の半分→1倍
      U4: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropCorner", id: "F_p0", dir: "se", fx: 1, fy: 1 }, { act: "cropCorner", id: "F_p0", dir: "se", fx: -0.5, fy: -0.5 }],
      // U5：wide に差し替え→拡大の横棒で3倍（枠の真ん中を中心）
      U5: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropZoomBar", id: "F_p0", zoom: 3 }],
      // U6：写真を外す（メニューの出し分けの確認用。選んでおく）
      U6: [{ act: "select", id: "F_p0" }],
      // ===== 試験台12 J1〜J13（文字の見た目：大きさ・太さ・色）=====
      // J1：道具の出し分け（代表＝見出しを選ぶ。出し分けは本物の操作で verify）
      J1: [{ act: "select", id: "F_h0" }],
      // J2：特集1の見出しの大きさを 36（欄に打つ）
      J2: [{ act: "tsize", id: "F_h0", px: 36 }],
      // J3：PC で 36（端末の引き継ぎ・別々は verify で端末を切り替えて確認）
      J3: [{ act: "tsize", id: "F_h0", px: 36 }],
      // J4：見出しを「大きく」2回（24→28→32）
      J4: [{ act: "select", id: "F_h0" }, { act: "tgrow" }, { act: "tgrow" }],
      // J5：本文の太字（1回で700・2回で400）
      J5: [{ act: "select", id: "F_b0" }, { act: "tbold" }, { act: "tbold" }],
      // J6：本文の色＝テンプレ色2つ目（textMuted）→その他の色 #C03030
      J6: [{ act: "select", id: "F_b0" }, { act: "tcolor", color: "textMuted" }, { act: "tcolor", color: "#C03030" }],
      // J7：わらび餅の品の名前の色＝#C03030（全件に効く）
      J7: [{ act: "select", id: "card_name_c_warabi" }, { act: "tcolor", color: "#C03030" }],
      // J8：見出しと本文の2つを選んで大きさ 20
      J8: [{ act: "selectMany", ids: ["F_h0", "F_b0"] }, { act: "tsize", px: 20 }],
      // J9：甘味処の見出しを表の中（上端＋60・縦中心）へ→大きさ 40（表は押し下げない＝ownerOverlaps）
      J9: [{ act: "moveCenterToRef", id: "I_kanmi", ref: "I_table", edge: "top", off: 60 }, { act: "tsize", id: "I_kanmi", px: 40 }],
      // J10：J2 のあと戻す→やり直す（24→36）
      J10: [{ act: "tsize", id: "F_h0", px: 36 }, { act: "undo" }, { act: "redo" }],
      // J11：見出しに大きさ・太字・色→右へ30→元の位置に戻す→文字の見た目を元に戻す
      J11: [{ act: "tsize", id: "F_h0", px: 36 }, { act: "tbold" }, { act: "tcolor", color: "#C03030" }, { act: "move", id: "F_h0", by: [30, 0] }, { act: "resetPart", id: "F_h0" }, { act: "treset", id: "F_h0" }],
      // J12：本文に「あ」を書き足し→太字（書き換えを決めてから効く）
      J12: [{ act: "editAppend", id: "F_b0", add: "あ" }, { act: "select", id: "F_b0" }, { act: "tbold" }],
      // J13：見出しの大きさに 200→120・3→8（範囲の外は端に丸める）
      J13: [{ act: "tsize", id: "F_h0", px: 200 }, { act: "tsize", px: 3 }],
      // ===== 試験台13 D1〜D12（文の一部の見た目・ページを元に戻す）=====
      // D1：本文の最初の4文字を #C03030
      D1: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }],
      // D2：最初の4文字を太字→もう一度で外す（1編集の中で）
      D2: [{ act: "editStart", id: "F_b0" }, { act: "editSel", s: 0, e: 4 }, { act: "partBold" }, { act: "editSel", s: 0, e: 4 }, { act: "partBold" }, { act: "editCommit" }],
      // D3：D1 の後、4文字目の後ろに「あ」を打つ（赤を引き継ぐ）
      D3: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "editStart", id: "F_b0" }, { act: "editCaret", pos: 4 }, { act: "editType", text: "あ" }, { act: "editCommit" }],
      // D4：赤4文字の真ん中（2文字目の後ろ）に1文字入れる（赤を引き継ぐ・前後の赤が消えない）
      D4: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "editStart", id: "F_b0" }, { act: "editCaret", pos: 2 }, { act: "editType", text: "ん" }, { act: "editCommit" }],
      // D5：D1（端末切り替えは verify で）
      D5: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }],
      // D6：本文まるごと太字（何も選ばず）
      D6: [{ act: "editStart", id: "F_b0" }, { act: "boxBoldPart", id: "F_b0" }],
      // D7：わらび餅の品名の最初の2文字を赤（その1件だけ）
      D7: [{ act: "partRun", id: "card_name_c_warabi", s: 0, e: 2, kind: "color", value: "#C03030" }],
      // D8：本文の最初の4文字を 1.5倍（箱16→24）
      D8: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "scale", value: 1.5 }],
      // D9：見出し箱を大きさ36・色#7B7B7B、本文4文字を赤、見出し右30、写真の見せる範囲→「このページを元に戻す」
      D9: [{ act: "select", id: "F_h0" }, { act: "tsize", id: "F_h0", px: 36 }, { act: "tcolor", id: "F_h0", color: "textMuted" }, { act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "move", id: "F_h0", by: [30, 0] }, { act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }, { act: "cropZoom", id: "F_p0", zoom: 2 }, { act: "pageReset" }],
      // D10：D1 の後、文字の見た目を元に戻す
      D10: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "treset", id: "F_b0" }],
      // D11：D1 の後、戻す→やり直す
      D11: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "undo" }, { act: "redo" }],
      // D12：D1 の後、本文の最初の6文字を特集2の本文の末尾へ（貼り付け＝文字だけ・貼り先の見た目を引き継ぐ）
      D12: [{ act: "partRun", id: "F_b0", s: 0, e: 4, kind: "color", value: "#C03030" }, { act: "editStart", id: "F_b1" }, { act: "editCaretEnd" }, { act: "editTypeFromBody", n: 6 }, { act: "editCommit" }],
      // ===== 試験台14 C1〜C11（セクションの操作）。@dup/@add は直前に作ったセクションの ID に置き換わる。=====
      C1: [{ act: "secMove", id: "items", delta: -1 }],
      C2: [{ act: "secMove", id: "items", delta: -1 }, { act: "undo" }],
      C3: [{ act: "edit", id: "F_h0", text: "季節の上生菓子と抹茶" }, { act: "secDup", id: "feature" }],
      C4: [{ act: "edit", id: "F_h0", text: "季節の上生菓子と抹茶" }, { act: "secDup", id: "feature" }, { act: "move", id: "@dup__F_h0", by: [30, 0] }, { act: "edit", id: "@dup__F_h0", text: "新しい見出し" }],
      C5: [{ act: "moveCenterToRef", id: "I_divider", ref: "I_kanmi", edge: "bottom", off: 1 }, { act: "secDel", id: "items" }, { act: "undo" }],
      C6: [{ act: "secAdd", pos: 1, type: "feature" }],
      C7: [{ act: "secAdd", pos: 1, type: "feature" }, { act: "dropPhoto", id: "@add__F_p0", name: "wide.jpg", w: 1600, h: 600 }],
      C8: [{ act: "secMove", id: "items", delta: -1 }],
      C9: [{ act: "secMove", id: "items", delta: -1 }, { act: "move", id: "F_h0", by: [30, 0] }, { act: "pageReset" }],
      C10: [{ act: "edit", id: "F_h0", text: "季節の上生菓子と抹茶" }, { act: "secDup", id: "feature" }, { act: "tsize", id: "@dup__F_hg", px: 36 }],
      C11: [{ act: "secDel", id: "items" }],
      // ===== 試験台14 C12（X3：品の並びを選んでから品名を書き換え＝選びが品名に移り道具が出る）=====
      C12: [{ act: "select", id: "I_cards" }, { act: "editStart", id: "card_name_c_warabi" }],
      // ===== 試験台15 S1〜S16（スマホでの指の操作）＝プリセットでは再現しない（CDP の指の操作で試験する）=====
      S1: [{ act: "fingerOnly" }], S2: [{ act: "fingerOnly" }], S3: [{ act: "fingerOnly" }], S4: [{ act: "fingerOnly" }],
      S5: [{ act: "fingerOnly" }], S6: [{ act: "fingerOnly" }], S7: [{ act: "fingerOnly" }], S8: [{ act: "fingerOnly" }],
      S9: [{ act: "fingerOnly" }], S10: [{ act: "fingerOnly" }], S11: [{ act: "fingerOnly" }], S12: [{ act: "fingerOnly" }],
      S13: [{ act: "fingerOnly" }], S14: [{ act: "fingerOnly" }], S15: [{ act: "fingerOnly" }], S16: [{ act: "fingerOnly" }],
      // ===== 試験台16 S17〜S38（スマホでの指・ピンチ）＝プリセットでは再現しない（CDP の指の操作で試験する）=====
      S17: [{ act: "fingerOnly" }], S18: [{ act: "fingerOnly" }], S19: [{ act: "fingerOnly" }], S20: [{ act: "fingerOnly" }],
      S21: [{ act: "fingerOnly" }], S22: [{ act: "fingerOnly" }], S23: [{ act: "fingerOnly" }], S24: [{ act: "fingerOnly" }],
      S25: [{ act: "fingerOnly" }], S26: [{ act: "fingerOnly" }], S27: [{ act: "fingerOnly" }], S28: [{ act: "fingerOnly" }],
      S29: [{ act: "fingerOnly" }], S30: [{ act: "fingerOnly" }], S31: [{ act: "fingerOnly" }], S32: [{ act: "fingerOnly" }],
      S33: [{ act: "fingerOnly" }], S34: [{ act: "fingerOnly" }], S35: [{ act: "fingerOnly" }], S36: [{ act: "fingerOnly" }],
      S37: [{ act: "fingerOnly" }], S38: [{ act: "fingerOnly" }],
      // ===== 試験台17 K1〜K27（写真を変える・足す・明るさ・テキストの入り方）。写真を選ぶ画面を通る番号は試験用画像を直接入れる =====
      K1: [{ act: "select", id: "F_p0" }],                                                   // 写真を変えるボタン（位置は verify で本物の操作）
      K2: [{ act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }],           // 差し替え
      K3: [{ act: "move", id: "F_p0", by: [60, 0] }],                                        // ボタンから右60＝写真が動く
      K4: [{ act: "select", id: "I_cards" }, { act: "replaceQuadCard", cardId: "c_warabi", name: "tall.jpg", w: 600, h: 1600 }],
      K5: [{ act: "clearPhoto", id: "F_p1" }],                                               // 写真を外す→写真を選ぶボタン
      K6: [{ act: "clearPhoto", id: "F_p1" }, { act: "replaceQuad", id: "F_p1", name: "wide.jpg", w: 1600, h: 600 }],
      K7: [{ act: "clearPhoto", id: "F_p1" }, { act: "move", id: "F_p1", by: [0, 50] }],
      K8: [{ act: "secAdd", pos: 1, type: "feature" }, { act: "dropPhoto", id: "@add__F_p0", name: "wide.jpg", w: 1600, h: 600 }],
      K9: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }],                          // 写真を足す（中身の幅の半分）
      K10: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }],                         // もう一方の端末は verify で
      K11: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAdded", by: [-200, 80] }, { act: "undo" }, { act: "undo" }, { act: "redo" }, { act: "redo" }],
      K12: [{ act: "addPhoto", name: "tall.jpg", w: 600, h: 1600 }],                         // 4:5 になる
      K13: [{ act: "addPhotoAt", name: "wide.jpg", w: 1600, h: 600, sec: "feature", cx: 80, cy: 240 }],
      K14: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "replaceQuad", id: "F_p0", name: "tall.jpg", w: 600, h: 1600 }],
      K15: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "deleteSel", sel: "lastAdd" }],
      K16: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAdded", by: [-200, 80] }, { act: "pageReset" }],
      K17: [{ act: "addTextCentered", text: "新しい文" }],
      K18: [{ act: "addTextCentered", text: "" }],                                           // 空＝なかったことに
      K19: [{ act: "select", id: "F_p0" }, { act: "bright", id: "F_p0", v: 20 }],
      K20: [{ act: "bright", id: "F_p0", v: 20 }, { act: "pageReset" }],
      K21: [{ act: "bright", id: "F_p0", v: 20 }, { act: "replaceQuad", id: "F_p0", name: "wide.jpg", w: 1600, h: 600 }],
      K22: [{ act: "bright", id: "F_p0", v: 20 }, { act: "clearPhoto", id: "F_p0" }, { act: "unclearPhoto", id: "F_p0" }],
      K23: [{ act: "brightCard", cardId: "c_warabi", v: -20 }],
      K24: [{ act: "selectMany", ids: ["F_p0", "F_p1"] }],                                    // 明るさ▾ が出ない（verify）
      K25: [{ act: "select", id: "F_p0" }],                                                   // 明るさ▾→Esc（verify）
      K26: [{ act: "select", id: "F_p0" }],                                                   // 見せる範囲・動かし中はボタンが出ない（verify）
      K27: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "bright", id: "F_p0", v: 20 }],
      // ===== 試験台18 L1〜L15（試験台17 の直し）。本物の操作は verify_l で確かめる（ここは状態の再現） =====
      L1: [{ act: "move", id: "F_p1", by: [0, 30] }],
      L2: [{ act: "select", id: "F_p1" }],
      L3: [{ act: "select", id: "F_p1" }],
      L4: [{ act: "replaceQuad", id: "F_p1", name: "wide.jpg", w: 1600, h: 600 }, { act: "replaceQuad", id: "F_p1", name: "tall.jpg", w: 600, h: 1600 }],
      L5: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }],
      L6: [{ act: "fingerOnly" }],
      L7: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }],
      L8: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }, { act: "deleteSel", sel: "lastAdd" }],
      L9: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }],
      L10: [{ act: "addTextCentered", text: "足した文" }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }],
      L11: [{ act: "select", id: "F_h0" }, { act: "dup" }],
      L12: [{ act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "pageReset" }],
      L13: [{ act: "select", id: "F_p0" }],
      L14: [{ act: "bright", id: "F_p0", v: 20 }, { act: "select", id: "F_p0" }, { act: "dup" }, { act: "select", id: "F_p0" }, { act: "copyPaste" }],
      L15: [{ act: "select", id: "F_p0" }],
      // ===== 試験台18b L16〜L19（X18：押し下げに付いていく部品も付いていく）。本物の操作は verify_l で確かめる（ここは状態の再現） =====
      // L16/L17：SP で本文 F_b1 を右45・下(90/135)（F_h1 に付く M2）→ PC で F_b0 の下に写真→ SP
      L16: [{ act: "setDev", d: "sp" }, { act: "move", id: "F_b1", by: [45, 90] }, { act: "setDev", d: "pc" }, { act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }, { act: "setDev", d: "sp" }],
      L17: [{ act: "setDev", d: "sp" }, { act: "move", id: "F_b1", by: [45, 135] }, { act: "setDev", d: "pc" }, { act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }, { act: "setDev", d: "sp" }],
      // L18：L16 のあと PC で足した写真を消す→ SP（付いていく部品も含めて元の位置へ）
      L18: [{ act: "setDev", d: "sp" }, { act: "move", id: "F_b1", by: [45, 90] }, { act: "setDev", d: "pc" }, { act: "addPhoto", name: "wide.jpg", w: 1600, h: 600 }, { act: "moveAddedBelow", ref: "F_b0", gap: 24 }, { act: "deleteSel", sel: "lastAdd" }, { act: "setDev", d: "sp" }],
      // L19：SP で F_b1 を下90（F_h1 に付く M2）→ PC で F_h0 を複製（Cmd+D）→ SP
      L19: [{ act: "setDev", d: "sp" }, { act: "move", id: "F_b1", by: [0, 90] }, { act: "setDev", d: "pc" }, { act: "select", id: "F_h0" }, { act: "dup" }, { act: "setDev", d: "sp" }],
      // ===== 試験台19 O1〜O20（リンク・書体・X19）。本物の操作は verify_o で確かめる（ここは状態の再現） =====
      O1: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
      O2: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
      O3: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
      O4: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "page", page: "pg_menu" } }],
      O5: [{ act: "partLink", id: "F_b0", sub: "練り切り", link: { kind: "url", href: "https://www.example.com" } }, { act: "partLink", id: "F_b0", sub: "きんとん", link: { kind: "mailto", addr: "info@example.com" } }],
      O6: [{ act: "editAppend", id: "F_b0", add: " https://example.com " }, { act: "partLink", id: "F_b0", sub: "https://example.com", link: { kind: "url", href: "https://example.com" } }],
      O7: [{ act: "partLink", id: "F_b0", sub: "季節", link: { kind: "url", href: "https://example.com" } }],
      O8: [{ act: "editAppend", id: "F_b0", add: " 0797-12-3456 " }],
      O9: [],
      O10: [{ act: "elemLink", id: "F_p0", link: { kind: "line" } }],
      O11: [{ act: "elemLink", id: "I_pillbg", link: { kind: "page", page: "pg_contact" } }],
      O12: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
      O13: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }, { act: "elemLink", id: "F_p0", link: { kind: "line" } }],
      O14: [{ act: "select", id: "F_h0" }],
      O15: [{ act: "boxFont", id: "F_h0", font: "body" }],
      O16: [{ act: "partFont", id: "F_b0", sub: "季節の移ろい", font: "heading" }],
      O17: [{ act: "boxFont", id: "F_h0", font: "body" }, { act: "partFont", id: "F_b0", sub: "季節の移ろい", font: "heading" }],
      O18: [{ act: "boxFont", id: "F_b0", font: "heading" }],
      O19: [],
      O20: [],
      // ===== 試験台19b O21〜O29（上の道具の1段化・書体/明るさの仮表示・リンク一覧の位置・コピーの引き継ぎ）=====
      O21: [],
      O22: [{ act: "partFont", id: "F_b0", sub: "季節の移ろい", font: "body" }, { act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
      O23: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
      O24: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
      O25: [{ act: "elemLink", id: "F_p0", link: { kind: "instagram" } }],
      O26: [],
      O27: [],
      O28: [{ act: "partLink", id: "F_b0", sub: "小さな菓子", link: { kind: "instagram" } }],
      O29: [],
      // ===== 試験台20 L1〜L24（列・幅・重ねる・左右入替・X23/X24）=====
      // 窓幅での道具の畳み（L20〜L22）・指の操作（L23/L24）・ドラッグ中の見た目（L14）は、データでの再現なし＝winOnly
      L1: [{ act: "setDev", d: "pc" }, { act: "select", id: "I_cards" }],                                   // 列 ▾ は品の並び全体のときだけ出る（選択で確認）
      L2: [{ act: "setDev", d: "pc" }, { act: "select", id: "I_cards" }],                                   // 見本に乗せる仮表示＝残らない（終状態は3列のまま）
      L3: [{ act: "setDev", d: "pc" }, { act: "cols", id: "I_cards", n: 2 }],                               // PC 2列＝1件651・どら焼き2段目・段間64
      L4: [{ act: "setDev", d: "pc" }, { act: "cols", id: "I_cards", n: 2 }, { act: "undo" }, { act: "redo" }],  // 戻す→やり直す
      L5: [{ act: "setDev", d: "sp" }, { act: "cols", id: "I_cards", n: 2 }],                               // SP 2列＝1件163.5・段間40
      L6: [{ act: "setDev", d: "pc" }, { act: "cols", id: "I_cards", n: 3 }, { act: "resize", id: "card_name_c_warabi", handle: "e", by: [400, 0] }],  // 品名の右の辺＝1件の幅で止まる
      L7: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_cards", handle: "e", by: [-358, 0], alt: true }],  // 右の辺を左358（Alt）＝幅968・3列
      L8: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_cards", handle: "w", by: [1200, 0] }],       // 左の辺を右へ＝最小幅で止まる
      L9: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_cards", handle: "e", by: [-900, 0], alt: true }, { act: "select", id: "I_cards" }],  // 狭めると4列が押せなくなる（UIは試験で）
      L10: [{ act: "setDev", d: "pc" }, { act: "resizeTo", id: "I_table", handle: "e", w: 720 }],           // 表の右の辺＝幅720・名前/価格は右端そろえ
      L11: [{ act: "setDev", d: "pc" }, { act: "cols", id: "I_cards", n: 2 }, { act: "resize", id: "I_table", handle: "e", by: [-200, 0] }, { act: "pageReset" }],  // このページを元に戻す＝列も幅も戻る
      L12: [{ act: "setDev", d: "sp" }, { act: "dropOverlap", id: "F_h0", onto: "F_p0" }],                  // 見出しを写真の箱へ落とす＝重なる（M2・anchor F_p0）
      L13: [{ act: "setDev", d: "sp" }, { act: "moveCenterToRef", id: "F_b0", ref: "F_p0", edge: "bottom", off: -8 }],  // 写真下端−8＝帯の中で並び替え（M2にならない）
      L14: [{ act: "winOnly" }],                                                                             // 押したままの drop-line はドラッグ中の見た目＝再現なし
      L15: [{ act: "setDev", d: "pc" }, { act: "swap", id: "F_p0" }],                                        // 左右を入れ替える（特集1の写真/本文）
      L16: [{ act: "setDev", d: "pc" }, { act: "select", id: "F_p0" }],                                      // 入替メニューは横並びの組のときだけ（選択で確認）
      L17: [{ act: "setDev", d: "pc" }, { act: "swap", id: "F_h0" }],                                        // 位置が左右反転（新しい左＝ページ幅−今の右）
      L18: [{ act: "setDev", d: "pc" }, { act: "swap", id: "F_p0" }, { act: "undo" }],                       // 入替を戻す
      L19: [],                                                                                               // 既定＝重なり0・はみ出し0
      L20: [{ act: "winOnly" }],                                                                              // 幅520/500/400 でリンクが その他 へ（窓幅）
      L21: [{ act: "winOnly" }],                                                                              // その他 の中身＝名前つき・44px・順・区切り（窓幅）
      L22: [{ act: "winOnly" }],                                                                              // 幅500 で 列 を その他 から（窓幅）
      L23: [{ act: "winOnly" }],                                                                              // スマホの長押しの箱に 列（指）
      L24: [{ act: "winOnly" }],                                                                              // スマホで辺のつまみを指で（指）
      // ===== 試験台20b（L25〜L32）=====
      L25: [{ act: "setDev", d: "pc" }, { act: "moveCenterToRef", id: "I_divider", ref: "I_cards", edge: "top", off: -20 }],        // §1(X26) 区切り線を品の並びの上端−20へ＝一番上に並び替え（SP も同じ操作で確認）
      L26: [{ act: "setDev", d: "pc" }, { act: "moveCenterToRef", id: "I_divider", ref: "I_pillbg", edge: "bottom", off: 20 }],     // §1(X26) ボタンの下端＋20へ＝一番下に並び替え
      L27: [{ act: "setDev", d: "sp" }, { act: "dropOverlap", id: "F_h0", onto: "F_p0" }],                   // L12 の再確認（写真の箱へ＝重なる）。L13(帯で並び替え)は既存 L13 プリセットで
      L28: [{ act: "winOnly" }],                                                                              // 窓幅500 で その他▾ の『PC』行が読める（X25・窓幅＝再現なし）
      L29: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_table", handle: "e", by: [-2000, 0], alt: true }],                  // §2 表を最小幅（値段1行・≈687）まで
      L30: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_table", handle: "e", by: [-2000, 0], alt: true }, { act: "edit", id: "row_price_t_matcha", text: "1,100円（税込・上生菓子付き）" }],  // §2.4 最小の後に値段を長く＝表示だけ広がる（記録は不変）。終状態＝書き換え後
      L31: [{ act: "setDev", d: "sp" }, { act: "resize", id: "I_table", handle: "e", by: [-2000, 0], alt: true }],                  // §2.6 SP 表を最小幅（200 と値段1行の広い方）まで
      L32: [{ act: "setDev", d: "pc" }, { act: "resize", id: "I_cards", handle: "e", by: [-918, 0], alt: true }, { act: "select", id: "I_cards" }],  // §3 品の並び幅408＝列の見本で4列が灰色（見本UI・その他経由は窓幅で再現なし）
      // ===== 試験台22a（W20〜W23）=====
      W20: [{ act: "setFixedSections", on: true }],   // §7 仮の一番上・一番下（右クリック操作・＋・隣の向きは試験で確認）
      W21: [],                                          // §7 開いた直後（setFixedSections=false）＝20b と一致
      W22: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [-619, 0] }, { act: "zmove", id: "F_p0", m: "back" }, { act: "zmove", id: "F_p0", m: "forward" }],   // §8 最背面→前面へ移動＝写真が見出しの前・本文の後ろ
      W23: [{ act: "winOnly" }],                         // X27 離す前の dropTarget（ドラッグ中の見た目＝再現なし）
      W24: [{ act: "winOnly" }],                         // §3.3 窓幅での道具の畳み・スマホの並び＝再現なし（試験で確認）
      // ===== 試験台22b（W1〜W7・W19）=====
      W1: [{ act: "setDev", d: "pc" }],                  // §2/§3 新しい文脈で開く＝まだ公開していません・履歴は最初の形だけ（文脈は試験側）
      W2: [{ act: "winOnly" }],                          // §2 開き直しは文脈の外＝再現なし
      W3: [{ act: "winOnly" }],                          // §2 開き直しは再現なし
      W4: [{ act: "winOnly" }],                          // §2 写真を足して開き直し＝再現なし
      W5: [{ act: "setDev", d: "pc" }, { act: "simError", on: true }, { act: "edit", id: "F_h0", text: "保存失敗テスト" }, { act: "simError", on: false }, { act: "edit", id: "F_h0", text: "復帰テスト" }],   // §2.6 保存失敗→復帰
      W6: [{ act: "setDev", d: "pc" }, { act: "edit", id: "F_h0", text: "公開テスト" }, { act: "publish" }],   // §4.3 公開＝確認の箱なし・公開中と同じに
      W7: [{ act: "setDev", d: "pc" }, { act: "edit", id: "F_h0", text: "公開テスト" }, { act: "publish" }, { act: "edit", id: "F_h0", text: "さらに変更" }],   // §3.2 公開後に変更＝未公開の変更あり
      W19: Array.from({ length: 32 }, (_, i) => [{ act: "edit", id: "F_h0", text: "版" + i }, { act: "publish" }]).flat(),   // §4.3 32回公開→公開した版30＋最初の形
      // ===== 試験台22c（W8〜W13）=====
      W8: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [-619, 0] }, { act: "setDev", d: "sp" }, { act: "dropOverlap", id: "F_h0", onto: "F_p0" }, { act: "editAppend", id: "F_b0", add: "とても長い本文をここに足して、スマホの配置でも目安の行数をしっかり越えるようにします。季節のうつろいを、小さな菓子に写してお届けします。四季折々の意匠をお楽しみください。" }, { act: "secAdd", type: "feature" }, { act: "setDev", d: "pc" }],   // §4.1 確認の箱に PC重なり・SP重なり・長い文・写真のない枠（箱の表示は試験で公開を押す）
      W9: [{ act: "winOnly" }],                          // §4.1 箱の「見る」＝UI（試験で）
      W10: [{ act: "winOnly" }],                         // §4.1 戻って直す／このまま公開する＝UI（試験で）
      W11: [{ act: "setDev", d: "pc" }],                 // §4.2 longTextLimits() を見るだけ
      W12: [{ act: "setDev", d: "pc" }, { act: "setLink", id: "card_photo_c_warabi", link: { kind: "url", href: "https://example.com" } }, { act: "preview", on: true }],   // §5 プレビュー＋よそのリンク（押すのは試験で）
      W13: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [-619, 0] }, { act: "secAdd", type: "feature" }, { act: "preview", on: true }],   // §5 公開の描き方＝写真のない枠は詰める
      // ===== 試験台22d（W14〜W18）§6 履歴から前の版に戻す =====
      W14: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "editAppend", id: "F_b0", add: S1_ADD }],   // §6.1 下書き（未公開変更）＋公開2つ＋最初の形（板を出すのは試験）
      W15: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "editAppend", id: "F_b0", add: S1_ADD }, { act: "viewVersion", which: "oldestPub" }, { act: "setDev", d: "sp" }],   // §6.2 古い版を見るだけ（ドラッグで動かないのは試験）
      W16: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "editAppend", id: "F_b0", add: S1_ADD }, { act: "viewVersion", which: "oldestPub" }, { act: "restoreVersion" }],   // §6.3/§6.4 この版を下書きに＝写真は右30だけ・本文の足しは消える・戻す前の下書きが1つ
      W17: [{ act: "setDev", d: "pc" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "move", id: "F_p0", by: [30, 0] }, { act: "publish" }, { act: "editAppend", id: "F_b0", add: S1_ADD }, { act: "viewVersion", which: "oldestPub" }, { act: "restoreVersion" }, { act: "undo" }],   // §6.5 戻す＝置き換える前の下書きへ（本文の足し戻る・写真右60）
      W18: [{ act: "setDev", d: "pc" }, { act: "viewVersion", which: "initial" }, { act: "restoreVersion" }],   // §6 最初の形を下書きに＝新しい文脈の直後と同じ
    };
  }
  let lastSec = null;   // プリセットで直前に作った（複製・追加した）セクションの ID。@dup/@add が指す。
  let lastAdd = null;   // §3（試験台17）プリセットで直前に足した部品の ID
  async function runPreset(name) {
    reset(); lastSec = null; lastAdd = null;
    for (const step of presets()[name]) await runStep(step);
  }
  async function runStep(step) {
    if (step.id && step.id.includes("@")) step = { ...step, id: step.id.replace(/@dup|@add/g, lastSec || "") };
    const g = geometry();
    // §2 セクションの操作
    if (step.act === "secMove") { sectionMove(step.id, step.delta); return; }
    if (step.act === "secDel") { sectionDelete(step.id); return; }
    if (step.act === "secDup") { sectionDuplicate(step.id); lastSec = "sec" + state.secSeq; return; }
    if (step.act === "secAdd") { sectionAdd(step.pos, step.type); lastSec = "sec" + state.secSeq; return; }
    if (step.act === "dropPhoto") { const f = await quadFile(step.name, step.w, step.h, step.type); selectMany([canonId(step.id)]); await replacePhotoFile(step.id, f); return; }
    if (step.act === "move") { const c = canonId(step.id); programMove([c], (id) => ({ x: g[id].x + step.by[0], y: g[id].y + step.by[1] })); }
    else if (step.act === "moveToBelow") { const t = g[step.target]; programMove([step.id], () => ({ x: g[step.alignLeft].x, y: t.y + t.h + step.gap })); }
    else if (step.act === "moveGroupBelow") { const t = g[step.target]; const stackTop = t.y + t.h + step.gap; programMove(step.ids, (id, i) => ({ x: g[step.alignLeft].x, y: stackTop + i * (g[id].h + 8) })); }
    else if (step.act === "edit") editApi(step.id, step.text);
    else if (step.act === "editAppend") editApi(step.id, rawText(canonId(step.id)) + step.add);
    else if (step.act === "addBelow") addTextAtSilent(step.marker, step.gap, step.text);
    else if (step.act === "moveAddedBelowSection") { const R = reduce(activeOps()); const last = R.adds[R.adds.length - 1]; if (last) { const s = sections()[secOf(last.id)]; const targetY = s.height + step.extra; programMove([last.id], () => ({ x: g[last.id].x, y: targetY })); } }
    // --- R 用 ---
    else if (step.act === "moveToCardDesc") { const card = contentCards()[step.cardIndex]; if (card) { const tid = "card_desc_" + card.id; const t = g[tid]; if (t) programMove([step.id], () => ({ x: g[step.id].x, y: t.y })); } }
    else if (step.act === "delCard") { const card = contentCards()[step.cardIndex]; if (card) cardsDelete("card_photo_" + card.id); }   // 試験台26：① 連動
    else if (step.act === "delRow") { const row = contentRows()[step.rowIndex]; if (row) tableDelete("row_name_" + row.id); }
    else if (step.act === "dupRow") { const row = contentRows()[step.rowIndex]; if (row) tableDuplicate("row_name_" + row.id); }
    else if (step.act === "moveToRef") { const r = g[step.ref]; if (r) { const y = (step.edge === "bottom" ? r.y + r.h : r.y) + step.off; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    else if (step.act === "moveCenterToRef") { const r = g[step.ref]; if (r) { const y = (step.edge === "bottom" ? r.y + r.h : r.y) + step.off - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y }), { snap: !!step.snap }); } }
    else if (step.act === "copyPaste") { if (step.id) selectMany([canonId(step.id)]); copySelection(); paste(); }
    else if (step.act === "dup") { if (step.id) selectMany([canonId(step.id)]); duplicate(); }
    else if (step.act === "reorderBetween") { const a = g[step.after], b = g[step.before]; if (a && b) { const y = (a.y + a.h + b.y) / 2 - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    else if (step.act === "reorderBefore") { const b = g[step.before]; if (b) { const y = b.y - g[step.id].h - 4; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    else if (step.act === "moveAddedToRowGap") { const R = reduce(activeOps()); const last = R.adds[R.adds.length - 1]; const rows = contentRows(); const r1 = g["row_name_" + rows[step.afterRow].id], r2 = g["row_name_" + rows[step.afterRow + 1].id]; if (last && r1 && r2) { const y = (r1.y + r1.h + r2.y) / 2; programMove([last.id], () => ({ x: g[last.id].x, y })); } }
    // --- W 用 ---
    else if (step.act === "select") { selectMany([step.id]); }
    else if (step.act === "zback") { sendToBack(); }
    else if (step.act === "zfront") { bringToFront(); }
    else if (step.act === "zmove") { selectMany([canonId(step.id)]); ({ front: bringToFront, back: sendToBack, forward: bringForward, backward: sendBackward }[step.m] || (() => {}))(); }   // §22 §8
    else if (step.act === "setFixedSections") { setFixedSections(step.on); }   // §22 §7
    else if (step.act === "publish") { publish(step.opts || { force: true }); }   // §22 §4.3
    else if (step.act === "simError") { simulateSaveError(step.on); }   // §22 §2.6
    else if (step.act === "preview") { if (step.on === false) exitPreview(); else enterPreview(); }   // §22 §5
    else if (step.act === "viewVersion") { viewVersion(resolveVerId(step)); }   // §22 §6 見るだけ
    else if (step.act === "restoreVersion") { restoreVersion(step.id || state.viewing); }   // §22 §6 この版を下書きにする
    else if (step.act === "exitView") { exitView(); }   // §22 §6 見るだけをやめる
    else if (step.act === "setLink") { setElementLink(canonId(step.id), step.link); }   // §22 §5（リンク）
    else if (step.act === "secAdd") { sectionAdd(step.pos != null ? step.pos : (reduce(activeOps()).secList.length), step.type || "feature"); lastSec = "sec" + state.secSeq; }   // §22 §4.2 写真のない枠
    else if (step.act === "resetSection") { resetScope("section", step.sec === "feature" ? "F_h0" : "I_kanmi", [state.device]); }
    else if (step.act === "moveCenterToCenter") { const r = g[step.ref]; if (r) { const y = r.y + r.h / 2 + (step.off || 0) - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    else if (step.act === "moveCenterToGap") { const a = g[step.after], b = g[step.before]; if (a && b) { const y = (a.y + a.h + b.y) / 2 - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    // --- Y 用（大きさ・選択）---
    else if (step.act === "resize") { selectMany([step.id]); programResize(step.id, step.handle, step.by[0], step.by[1], !!step.alt); }
    else if (step.act === "cols") { selectMany([canonId(step.id)]); setCols(step.id, step.n); }   // §20 列
    else if (step.act === "swap") { selectMany([canonId(step.id)]); swapHoriz(step.id); }   // §5 左右を入れ替える
    else if (step.act === "dropOverlap") {   // §4 他の部品の箱の上に落として重ねる（実ドラッグの経路＝M2・anchor=落とした先）
      const c = canonId(step.id); selectMany([c]); const sN = elNode(c), dN = elNode(canonId(step.onto));
      if (sN && dN) { const sr = sN.getBoundingClientRect(), dr = dN.getBoundingClientRect(); if (beginDrag(sr.left + sr.width / 2, sr.top + sr.height / 2)) { dragMove(dr.left + dr.width / 2, dr.top + dr.height / 2, false); endDrag(); } } }
    else if (step.act === "winOnly") { if (typeof console !== "undefined") console.log("窓幅での道具の畳み／指の操作のため、データでの再現なし（試験で確認）"); }
    else if (step.act === "resizeTo") { const c = canonId(step.id); const cur = g[c].w; const ddx = step.handle === "e" ? (step.w - cur) : (cur - step.w); selectMany([c]); programResize(c, step.handle, ddx, 0); }
    else if (step.act === "selectRow") { const rows = contentRows(); if (rows[step.index]) selectMany(["row_name_" + rows[step.index].id]); }
    else if (step.act === "undo") { undo(); }
    else if (step.act === "redo") { redo(); }
    else if (step.act === "resetPart") { resetScope("part", canonId(step.id), [state.device]); }
    // --- Z 用（そろえる）---
    else if (step.act === "moveDev") { const by = state.device === "pc" ? step.pc : step.sp; const c = canonId(step.id); programMove([c], (id) => ({ x: g[id].x + by[0], y: g[id].y + by[1] })); }
    else if (step.act === "snapAlignLeft") { const r = g[step.ref]; if (r) programMove([step.id], () => ({ x: r.x + step.off, y: g[canonId(step.id)].y }), { snap: !step.alt }); }
    else if (step.act === "snapAlignCenterContent") { const { left: cL, right: cR } = contentEdges(); const cC = (cL + cR) / 2; const c = canonId(step.id); programMove([c], () => ({ x: cC + step.off - g[c].w / 2, y: g[c].y }), { snap: !step.alt }); }
    else if (step.act === "snapResizeRight") { const c = canonId(step.id), r = g[step.ref]; if (r) { const ddx = (r.x + r.w + step.off) - (g[c].x + g[c].w); selectMany([c]); programResize(c, "e", ddx, 0, !!step.alt); } }
    else if (step.act === "arrow") { if (step.id) selectMany([canonId(step.id)]); const d = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[step.dir]; for (let i = 0; i < (step.times || 1); i++) nudgeSelected(d[0], d[1]); }
    // --- P 用（写真の差し替え・見せる範囲。画像はここで作る）---
    else if (step.act === "replaceQuad") { const f = await quadFile(step.name, step.w, step.h, step.type); selectMany([step.id]); await replacePhotoFile(step.id, f); }
    else if (step.act === "replaceQuadCard") { const id = "card_photo_" + step.cardId; const f = await quadFile(step.name, step.w, step.h, step.type); await replacePhotoFile(id, f); }
    else if (step.act === "replaceBad") { await replacePhotoFile(step.id, textFile("notimage.txt")); }
    else if (step.act === "clearPhoto") { commit({ t: "clear", id: step.id }); }
    else if (step.act === "cropPan") { beginCrop(step.id); cropPanStart(); cropPanBy(step.by[0], step.by[1]); cropCommit(); }
    else if (step.act === "cropPanCancel") { beginCrop(step.id); cropPanStart(); cropPanBy(step.by[0], step.by[1]); cropCancel(); }
    else if (step.act === "cropZoom") { beginCrop(step.id); cropZoomTo(step.zoom); cropCommit(); }
    // --- U 用（試験台11）---
    else if (step.act === "cropCorner") { beginCrop(step.id); cropCornerStart(step.dir); const d = cropState().display; cropCornerBy(step.fx * d.dw, step.fy * d.dh); cropCommit(); }
    else if (step.act === "cropZoomBar") { beginCrop(step.id); cropZoomTo(step.zoom); cropCommit(); }
    // --- J 用（試験台12 文字の見た目）---
    else if (step.act === "selectMany") { selectMany(step.ids); }
    else if (step.act === "tsize") { if (step.id) selectMany([canonId(step.id)]); textSetSize(step.px); }
    else if (step.act === "tgrow") { textStep(1); }
    else if (step.act === "tshrink") { textStep(-1); }
    else if (step.act === "tbold") { if (step.id) selectMany([canonId(step.id)]); textToggleBold(); }
    else if (step.act === "tcolor") { if (step.id) selectMany([canonId(step.id)]); textSetColor(step.color); }
    else if (step.act === "treset") { resetTextStyle(canonId(step.id)); }
    // --- D 用（試験台13 文の一部の見た目）---
    else if (step.act === "partRun") { startEdit(step.id); const n = elNode(state.editing.id); setCaretOffsets(n, step.s, step.e); applyPartStyle(step.kind, step.value); commitEdit(); }
    else if (step.act === "editStart") { startEdit(step.id); }
    else if (step.act === "editSel") { setCaretOffsets(elNode(state.editing.id), step.s, step.e); }
    else if (step.act === "editCaret") { setCaretOffsets(elNode(state.editing.id), step.pos, step.pos); }
    else if (step.act === "editCaretEnd") { const L = (state.editing.runs || []).reduce((a, r) => a + r.text.length, 0); setCaretOffsets(elNode(state.editing.id), L, L); }
    else if (step.act === "partBold") { applyPartStyle("bold"); }
    else if (step.act === "partColor") { applyPartStyle("color", step.value); }
    else if (step.act === "partScale") { applyPartStyle("scale", step.value); }
    else if (step.act === "editType") { const n = elNode(state.editing.id); n.focus(); document.execCommand("insertText", false, step.text); reconcileEdit(); }
    else if (step.act === "editTypeFromBody") { const t = rawText("F_b0").slice(0, step.n || 6); const n = elNode(state.editing.id); n.focus(); document.execCommand("insertText", false, t); reconcileEdit(); }
    else if (step.act === "editCommit") { commitEdit(); }
    else if (step.act === "boxBoldPart") { if (state.editing) commitEdit(); selectMany([step.id]); textToggleBold(); }
    else if (step.act === "pageReset") { resetScope("page", null, ["pc", "sp"]); }
    else if (step.act === "setDev") { setDevice(step.d); }
    // §19 書体・リンク（状態の再現）
    else if (step.act === "boxFont") { selectMany([canonId(step.id)]); textSetFont(step.font); }
    else if (step.act === "elemLink") { setElementLink(canonId(step.id), step.link); }
    else if (step.act === "partLink") { const c = canonId(step.id); const plain = textRunsApi(c).map((r) => r.text).join(""); const i = plain.indexOf(step.sub); if (i >= 0) setPartLinkCommitted(c, i, i + step.sub.length, step.link); }
    else if (step.act === "partFont") { const c = canonId(step.id); const plain = textRunsApi(c).map((r) => r.text).join(""); const i = plain.indexOf(step.sub); if (i >= 0) { startEdit(c); setCaretOffsets(elNode(c), i, i + step.sub.length); applyPartStyle("font", step.font); commitEdit(); } }
    // --- K 用（試験台17 写真を変える・足す・明るさ・テキスト）---
    else if (step.act === "addPhoto") { const f = await quadFile(step.name, step.w, step.h, step.type); const cx = SPEC.DESIGN_W[state.device] / 2; const gg = geometry(); const cy = (gg[step.at || "F_b0"] ? gg[step.at || "F_b0"].y + gg[step.at || "F_b0"].h / 2 : 300); lastAdd = await addPhotoAtPoint(f, step.sec || "feature", cx, cy); }
    else if (step.act === "addPhotoAt") { const f = await quadFile(step.name, step.w, step.h, step.type); lastAdd = await addPhotoAtPoint(f, step.sec, step.cx, step.cy); }
    else if (step.act === "addTextCentered") { const cx = SPEC.DESIGN_W[state.device] / 2; const gg = geometry(); const cy = (gg["F_b0"] ? gg["F_b0"].y + gg["F_b0"].h / 2 : 300); const id = addTextAtPoint(step.sec || "feature", cx, cy); lastAdd = id; if (step.text != null) { const n = elNode(id); if (n) { n.focus(); document.execCommand("selectAll", false); document.execCommand("insertText", false, step.text); reconcileEdit(); } } commitEdit(); }
    else if (step.act === "bright") { if (step.id) selectMany([canonId(step.id)]); setBrightness(step.id, step.v); }
    else if (step.act === "brightCard") { setBrightness("card_photo_" + step.cardId, step.v); }
    else if (step.act === "unclearPhoto") { commit({ t: "unclear", id: step.id }); }
    else if (step.act === "moveAdded") { if (lastAdd) { selectMany([lastAdd]); const gg = geometry(); programMove([lastAdd], () => ({ x: gg[lastAdd].x + step.by[0], y: gg[lastAdd].y + step.by[1] })); } }
    else if (step.act === "moveAddedBelow") { if (lastAdd) { selectMany([lastAdd]); const gg = geometry(); const r = gg[step.ref]; if (r) programMove([lastAdd], () => ({ x: r.x, y: r.y + r.h + (step.gap != null ? step.gap : 24) })); } }   // §18 L7/L9/L10
    else if (step.act === "deleteSel") { if (step.id) selectMany([canonId(step.id)]); else if (step.sel === "lastAdd" && lastAdd) selectMany([lastAdd]); deleteSelected(); }
    else if (step.act === "fingerOnly") { if (typeof console !== "undefined") console.log("指の操作のため再現なし"); }
  }
  function addTextAtSilent(markerId, gap, text) { const g = geometry(); const a = g[markerId]; const id = "add_" + (++state.addSeq); const w = state.device === "pc" ? 600 : 351; commit({ t: "add", id, section: secOf(markerId), kind: "text", styleName: "featBody", w, text, anchor: markerId, gap: gap ?? 24, placedDevice: state.device, x: a.x }); }
  // ボタン/プリセット用：目標位置へ動かす（M1/M2/並び替えは c3-edit が判定。付いていく先は離した瞬間 g2 で決める＝§2.2）
  // opts.snap=true で §2 の吸い付きを効かせる（Z プリセット用。本物のマウスは dragMove が吸い付く）
  function programMove(ids, targetOf, opts) {
    opts = opts || {};
    ids = ids.map(canonId); state.selected = new Set(ids); render();
    const g = geometry(); const prior = reduce(activeOps()).m1;   // 既に M1 の部品を更に動かすときは積む
    for (const id of ids) { const n = elNode(id); const tg = targetOf(id, ids.indexOf(id)); if (n) n.style.transform = `translate(${tg.x - g[id].x}px,${tg.y - g[id].y}px)`; }
    let g2 = geometry();   // 離した瞬間（詰める前）
    if (opts.snap && ids.length === 1) { const id = ids[0]; const e = g2[id]; const ro0 = reorderPreview(g2, id, g);
      if (e) { const snap = snapBox(secOf(id), e, true, !ro0, new Set([id])); if (snap.dx || snap.dy) { const n = elNode(id); const tg = targetOf(id, 0); if (n) n.style.transform = `translate(${tg.x - g[id].x + snap.dx}px,${tg.y - g[id].y + snap.dy}px)`; g2 = geometry(); } } }
    if (ids.length === 1) { const roReal = reorderPreview(g2, ids[0], g); if (roReal) { commit({ t: "reorder", device: state.device, key: roReal.key, id: ids[0], order: roReal.order }); return; } if (reorderActive(g2, ids[0], g)) { render(); return; } }   // §22a X29：M1(40px内)が先・順が変われば reorder・縁の no-op は流れに戻す
    const m1Of = (d) => ({ id: d.id, mode: "M1", dx: Math.round((prior[d.id]?.dx || 0) + g2[d.id].x - g[d.id].x), dy: Math.round((prior[d.id]?.dy || 0) + g2[d.id].y - g[d.id].y) });
    const decided = ids.map((id) => ({ id, mode: isAdded(id) ? "M2" : classifyDropX(g2, id, ids, g) }));
    if (decided.some((d) => d.mode === "M2")) {
      const finalItems = decided.map((d) => d.mode === "M1"
        ? m1Of(d)
        : (() => { const pr = reanchorX(g2, d.id); return { id: d.id, mode: "M2", anchor: pr.anchor, gapY: pr.gapY, x: pr.x }; })());
      commit({ t: "move", device: state.device, items: finalItems });
      for (const d of finalItems) if (d.mode === "M2" && isAdded(d.id)) pushDownClear(d.id);
    } else {
      commit({ t: "move", device: state.device, items: decided.map(m1Of) });
    }
  }
  // プリセット補助
  function contentCards() { return reduce(activeOps()).content.items.cards; }
  function contentRows() { return reduce(activeOps()).content.items.table; }
  function delInstance(id) { state.selected = new Set([id]); commit({ t: "del", id }); state.selected = new Set(); render(); }

  function applyOps(ops) { state.ops = clone(ops); state.cursor = ops.length; state.selected = new Set(); render(); return Promise.resolve(); }

  // ---- 写真の描画・入口（§1-3）----
  // 枠の中身（素材 ID）を reduce 済み content から引く（差し替えを反映）。
  function assetOfPart(part, R) {
    const c = R.secContent[secOf(part)]; const b = bareOf(part); let m;
    if (c && (m = b.match(/^F_p(\d)$/))) return c.blocks?.[+m[1]]?.photo?.asset || null;
    if (c && (m = b.match(/^card_photo_(.+)$/))) return c.cards?.find((x) => x.id === m[1])?.photo?.asset || null;
    const a = R.added.find((a) => a.id === part); if (a) return a.asset || null;
    return null;
  }
  // 各写真枠に、素材の URL と見せる範囲（背景の大きさ・位置）を当てる。枠の大きさ・位置は変えない。
  function paintPhotos() {
    const device = state.device; const R = reduce(activeOps(), device, state.peek);
    for (const el of document.querySelectorAll('#stage [data-kind="photo"]')) {
      if (el.classList.contains("empty")) continue;
      const part = el.getAttribute("data-el"); const asset = (el.textContent || "").trim() || assetOfPart(part, R);
      if (!asset) continue;
      const url = assetUrl(asset); ensureNat(asset);
      if (url) { el.style.backgroundImage = "url(" + url + ")"; el.textContent = ""; }
      const b = (R.brightMap || {})[part] || 0; el.style.filter = b ? ("brightness(" + (1 + b / 100) + ")") : "";   // §5 明るさ（編集・公開とも同じ）
      const nat = assetNat(asset); const view = effView(part, device, R.viewAll);
      const w = el.offsetWidth, h = el.offsetHeight;      // 変換の外＝設計px
      const c = (nat && w && h) ? coverBG(w, h, nat.w, nat.h, view) : null;
      if (c) { el.style.backgroundSize = c.dw + "px " + c.dh + "px"; el.style.backgroundPosition = c.ox + "px " + c.oy + "px"; el.style.backgroundRepeat = "no-repeat"; }
      else { el.style.backgroundSize = "cover"; el.style.backgroundPosition = "center"; }
    }
  }
  // §3 入口：今の端末の写真の状態
  function photosApi() {
    const device = state.device; const R = reduce(activeOps(), device, state.peek); const out = [];
    for (const el of document.querySelectorAll('#stage [data-kind="photo"]')) {
      const part = el.getAttribute("data-el"); const cleared = (R.clear || []).includes(part);   // お店が外した空枠だけ cleared（足したセクションの空枠は missing）
      const asset = assetOfPart(part, R); ensureNat(asset);
      const nat = assetNat(asset); const v = effView(part, device, R.viewAll);
      // §2.3「まだない写真」＝素材がまだ無い枠（足したセクションの写真枠など）。お店が外した空枠（cleared）とは区別する。
      // §5（試験台17）brightness＝枠ごとの明るさ（0が「元のまま」）。added＝§3で足した写真なら true。
      out.push({ part, asset: asset || null, naturalW: nat ? nat.w : null, naturalH: nat ? nat.h : null, cleared, missing: !asset && !cleared, brightness: (R.brightMap || {})[part] || 0, added: isAdded(part), view: { x: +v.x.toFixed(4), y: +v.y.toFixed(4), zoom: +v.zoom.toFixed(4) }, viewOwn: v.own });
    }
    return out;
  }
  // 差し替え（ファイル→素材→replace op）。読めなければ {ok:false}（呼び手が短い知らせを出す）
  async function replacePhotoFile(id, file) {
    const r = await loadImageFile(file); if (!r) return { ok: false };
    commit({ t: "replace", id, asset: r.asset }); return { ok: true, asset: r.asset, w: r.w, h: r.h };
  }

  // ---- 見せる範囲（§2）＝トリミング。ダブルクリックで入り、ドラッグ／つまみ／横棒／ホイールで直し、Enter で決め Esc で取り消す。----
  let crop = null, panBase = null, cornerBase = null;
  function beginCrop(id) {
    const g = geometry(); const e = g[id]; if (!e || e.kind !== "photo") return false;
    const R = reduce(activeOps()); if ((R.clear || []).includes(id)) return false;   // 空枠は対象外
    const asset = assetOfPart(id, R); const nat = assetNat(asset); if (!nat) ensureNat(asset);
    const v = effView(id, state.device, R.viewAll);
    crop = { id, device: state.device, view: { x: v.x, y: v.y, zoom: v.zoom }, start: { x: v.x, y: v.y, zoom: v.zoom }, natW: nat ? nat.w : 0, natH: nat ? nat.h : 0, w: e.w, h: e.h };
    selectOnly(id); return true;
  }
  function cropState() {
    if (!crop) return null;
    const c = coverBG(crop.w, crop.h, crop.natW, crop.natH, crop.view);
    return { id: crop.id, device: crop.device, w: crop.w, h: crop.h, natW: crop.natW, natH: crop.natH, view: { ...crop.view }, display: c ? { dw: c.dw, dh: c.dh, ox: c.ox, oy: c.oy } : null };
  }
  function cropRefresh() { const c = coverBG(crop.w, crop.h, crop.natW, crop.natH, crop.view); if (c) { crop.view.x = c.x; crop.view.y = c.y; } if (typeof onCrop === "function") onCrop(); }
  function cropPanStart() { if (!crop) return; const c = coverBG(crop.w, crop.h, crop.natW, crop.natH, crop.view); panBase = { x: crop.view.x, y: crop.view.y, dw: c ? c.dw : crop.w, dh: c ? c.dh : crop.h }; }
  function cropPanBy(ddx, ddy) { if (!crop || !panBase) return; crop.view.x = panBase.x - ddx / panBase.dw; crop.view.y = panBase.y - ddy / panBase.dh; cropRefresh(); }
  // 横棒・ホイール＝枠の真ん中を中心に拡大縮小（見ている所が逃げない。N3）
  function cropZoomTo(z) { if (!crop) return; crop.view.zoom = Math.min(4, Math.max(1, z)); cropRefresh(); }
  function cropWheel(deltaY) { if (!crop) return; cropZoomTo(crop.view.zoom * Math.pow(1.0015, -deltaY)); }
  // 四隅のつまみ＝動かしている角の反対の角を止めて拡大縮小（N2）。隙間ができるなら隙間がなくなるよう位置をずらす（clampView が勝つ）。
  function cropCornerStart(dir) { if (!crop) return; const c = coverBG(crop.w, crop.h, crop.natW, crop.natH, crop.view); if (!c) return; cornerBase = { dir, ox: c.ox, oy: c.oy, dw: c.dw, dh: c.dh, s0: Math.max(crop.w / crop.natW, crop.h / crop.natH) }; }
  function cropCornerBy(ddx, ddy) {
    if (!crop || !cornerBase) return; const b = cornerBase, dir = b.dir, iw = crop.natW, ih = crop.natH;
    const hGrow = /e/.test(dir) ? ddx : (/w/.test(dir) ? -ddx : 0);   // 東の角は右へ＝拡大／西の角は左へ＝拡大
    const base1 = iw * b.s0;                                          // 1倍（覆う最小）の表示幅
    let zoom = Math.min(4, Math.max(1, (b.dw + hGrow) / base1));
    const dw2 = base1 * zoom, dh2 = dw2 * (b.dh / b.dw);
    const ox2 = /w/.test(dir) ? (b.ox + b.dw - dw2) : b.ox;           // 東の角＝左を止める／西の角＝右を止める
    const oy2 = /n/.test(dir) ? (b.oy + b.dh - dh2) : b.oy;           // 南の角＝上を止める／北の角＝下を止める
    const x = (crop.w / 2 - ox2) / dw2, y = (crop.h / 2 - oy2) / dh2;
    crop.view = clampView(crop.w, crop.h, iw, ih, { x, y, zoom });    // 隙間を作らない決まりが勝つ
    cropRefresh();
  }
  function cropCommit() { if (!crop) return; const id = crop.id, dev = crop.device, v = { ...crop.view }; crop = null; panBase = cornerBase = null; commit({ t: "view", id, device: dev, x: +v.x.toFixed(6), y: +v.y.toFixed(6), zoom: +v.zoom.toFixed(6) }); }
  function cropCancel() { if (!crop) return; crop = null; panBase = cornerBase = null; render(); }
  const isCropping = () => !!crop;

  // ---- プリセット用の試験画像（§6：プリセットの中で作る。四分割の色は4章どおり）----
  function quadCanvas(w, h) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d"); g.fillStyle = "#d00000"; g.fillRect(0, 0, w / 2, h / 2); g.fillStyle = "#00a000"; g.fillRect(w / 2, 0, w / 2, h / 2); g.fillStyle = "#0040d0"; g.fillRect(0, h / 2, w / 2, h / 2); g.fillStyle = "#e0c000"; g.fillRect(w / 2, h / 2, w / 2, h / 2); return cv; }
  async function quadFile(name, w, h, type) { const cv = quadCanvas(w, h); const blob = await new Promise((res) => cv.toBlob(res, type || "image/jpeg", 0.92)); return new File([blob], name, { type: blob.type }); }
  function textFile(name, text) { return new File([text || "これは画像ではありません"], name, { type: "text/plain" }); }

  // §2（試験台15）：スマホでの編集かどうか。画面幅 600 以下で、指で触る端末（pointer:coarse か maxTouchPoints>0）なら 'phone'。
  function inputMode() {
    try {
      const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
      const touch = (navigator.maxTouchPoints || 0) > 0;
      return (window.innerWidth <= 600 && (coarse || touch)) ? "phone" : "pc";
    } catch (e) { return "pc"; }
  }

  // ===================== §24（試験台24）試験の窓口：draft()・roundTrip()・最近使った色 =====================
  function draftApi() { return currentDraft(); }   // §2.8 今の形（fold した 4.9＋_pg）
  function recentColorsApi() { return state.recentColors.slice(); }
  function pushRecentColor(hex) { hex = String(hex).toUpperCase(); state.recentColors = [hex, ...state.recentColors.filter((c) => c !== hex)].slice(0, 5); scheduleSave(); }   // §2.6 色を選んだら「編集の設定」として保存。下書き・版・状態の文字には効かない
  // §2.8 roundTrip：画面を変えずに、PC・スマホそれぞれで「土台＋記録の列から描いた形」と「seed(fold(...)) だけから描いた形」を比べる。
  function snapForRT(b, ops, dev, sb) {
    state.base = b; state.shopBase = (sb !== undefined ? sb : state.shopBase); state.ops = clone(ops); state.cursor = ops.length; state.device = dev; state.selected = new Set(); state.editing = null; state.viewing = null; state.peek = false;   // 試験台26：① の土台も当てる（② だけでなく ①②の組で round-trip）
    render();
    const g = geometry(); const R = reduce(activeOps(), dev);
    const parts = {}; for (const id in g) { const e = g[id]; parts[id] = { x: +(+e.x).toFixed(2), y: +(+e.y).toFixed(2), w: +(+e.w).toFixed(2), h: +(+e.h).toFixed(2) }; }
    const attr = {};
    const asset = {};
    const scanSlice = (sec, slice) => { const P = (bare) => (sec === "feature" || sec === "items") ? bare : sec + SEP + bare;
      if (slice && slice.blocks) slice.blocks.forEach((bl, i) => { if (bl.photo) asset[P("F_p" + i)] = bl.photo.asset || null; });
      if (slice && slice.cards) slice.cards.forEach((cd) => { if (cd.photo) asset[P("card_photo_" + cd.id)] = cd.photo.asset || null; }); };
    for (const sec in R.secContent) scanSlice(sec, R.secContent[sec]);
    for (const a of R.added) if (a.kind === "photo") asset[a.id] = a.asset || null;
    const runsOf = (id) => R.runsMap[id] ? R.runsMap[id].map((r) => ({ text: r.text, bold: !!r.bold, color: r.color || null, scale: r.scale || 1, font: r.font || null, link: r.link || null })) : null;
    const ids = new Set([...Object.keys(g), ...Object.keys(R.runsMap), ...Object.keys(asset), ...Object.keys(R.brightMap), ...R.clear, ...Object.keys(R.linkMap), ...Object.keys(R.colsMap)]);
    for (const id of ids) attr[id] = { runs: runsOf(id), asset: (id in asset) ? asset[id] : null, view: R.viewAll[id] ? (R.viewAll[id][dev] || null) : null, bright: R.brightMap[id] || 0, link: R.linkMap[id] || null, cols: R.colsMap[id] ? (R.colsMap[id][dev] || null) : null, cleared: R.clear.includes(id) };
    const swap = {}; for (const sec in R.swapMap) swap[sec] = (R.swapMap[sec][dev] || null);
    return { parts, attr, swap };
  }
  function diffSnap(A, B) {
    const ids = new Set([...Object.keys(A.parts), ...Object.keys(B.parts)]);
    let maxPos = 0, maxSize = 0, worst = null; const onlyA = [], onlyB = [];
    for (const id of ids) { const a = A.parts[id], b = B.parts[id]; if (!a) { onlyB.push(id); continue; } if (!b) { onlyA.push(id); continue; }
      const dp = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)), ds = Math.max(Math.abs(a.w - b.w), Math.abs(a.h - b.h));
      if (dp > maxPos) { maxPos = dp; worst = id; } if (ds > maxSize) maxSize = ds; }
    const aids = new Set([...Object.keys(A.attr), ...Object.keys(B.attr)]); const attrDiff = [];
    for (const id of aids) { const x = A.attr[id] || {}, y = B.attr[id] || {}; const d = [];
      if (JSON.stringify(x.runs || null) !== JSON.stringify(y.runs || null)) d.push("runs");
      if ((x.asset || null) !== (y.asset || null)) d.push("asset");
      if (JSON.stringify(x.view || null) !== JSON.stringify(y.view || null)) d.push("view");
      if ((x.bright || 0) !== (y.bright || 0)) d.push("bright");
      if (JSON.stringify(x.link || null) !== JSON.stringify(y.link || null)) d.push("link");
      if ((x.cols || null) !== (y.cols || null)) d.push("cols");
      if ((x.cleared || false) !== (y.cleared || false)) d.push("cleared");
      if (d.length) attrDiff.push({ id, fields: d }); }
    const swaps = new Set([...Object.keys(A.swap), ...Object.keys(B.swap)]); const swapDiff = [];
    for (const s of swaps) if (JSON.stringify(A.swap[s] || null) !== JSON.stringify(B.swap[s] || null)) swapDiff.push(s);
    return { maxPos: +maxPos.toFixed(2), maxSize: +maxSize.toFixed(2), worst, onlyA, onlyB, attrDiff, swapDiff };
  }
  function roundTrip() {
    const save = { base: state.base, shopBase: state.shopBase, ops: state.ops, cursor: state.cursor, undoBase: state.undoBase, device: state.device, selected: state.selected, editing: state.editing, viewing: state.viewing, peek: state.peek, secSeq: state.secSeq, addSeq: state.addSeq };
    const curBase = state.base, curOps = clone(activeOps()), curShopBase = state.shopBase, fd = foldToDraft(), fdShop = currentShop();   // 試験台26：① も畳む
    const out = {};
    for (const dev of ["pc", "sp"]) { const A = snapForRT(curBase, curOps, dev, curShopBase); const B = snapForRT(fd, [], dev, fdShop); out[dev] = diffSnap(A, B); }
    state.base = save.base; state.shopBase = save.shopBase; state.ops = save.ops; state.cursor = save.cursor; state.undoBase = save.undoBase; state.device = save.device; state.selected = save.selected; state.editing = save.editing; state.viewing = save.viewing; state.peek = save.peek; state.secSeq = save.secSeq; state.addSeq = save.addSeq;
    render();
    return out;
  }

  const api = {
    reset, setDevice, geometry, sections, warnings, anchors: anchorsList, inputMode,
    getScale: () => scale, scaleMode: () => SCALE_MODE, relayout,   // §25 試験の窓口（倍率・縮め方・描き直し）
    ops: () => clone(activeOps()), presets, runPreset,
    draft: draftApi, shop: currentShop, roundTrip, recentColors: recentColorsApi, pushRecentColor,   // §24・試験台26 試験の窓口（① の下書き）
    // §24 試験から操作を直に流す窓口（いずれも既存の関数。編集の動きは変えない）
    selectOnly: (id) => selectOnly(canonId(id)), selectMany: (ids) => selectMany(ids), clearSel, selectSection,
    nudge: (id, dx, dy) => nudge(id, dx, dy), nudgeSelected, deleteSelected, duplicate, commitEdit, canUndo: () => (!!state.restoreUndo || state.cursor > state.undoBase), canRedo: () => (!state.restoreUndo && state.cursor < state.ops.length),
    addTextAtPoint: (sec, cx, cy) => addTextAtPoint(sec, cx, cy), addPhotoAtPoint, setBrightness,
    sectionMove, sectionDelete, sectionAdd, sectionDuplicate, sectionList: sectionListApi,
    setCols: (id, n) => setCols(id, n), swapHoriz: (id) => swapHoriz(id), bringToFront, sendToBack, secOf: (id) => secOf(id),
    select: (ids) => selectMany(Array.isArray(ids) ? ids : [ids]),
    edit: editApi, resetScope, undo, redo, layoutCount: () => layoutCount,
    setPrices: (id, prices) => setPrices(id, prices), effPrices: (id) => effPricesOf(id),   // 試験台26 値段の箱
    partInfo: (id) => { const i = partInfo(id); return i ? { kind: i.kind, cid: i.cid, gid: i.gid, itemId: i.entry && i.entry._itemId, placementId: i.entry && i.entry._placementId } : null; },
    // 試験台26：① 連動の操作（表・品の並び）／並びの設定／品を選ぶ一覧／案A・C の別
    tableAddRow: (id) => tableAddRow(id), tableDuplicate: (id) => tableDuplicate(id), tableDelete: (id) => tableDelete(id),
    cardsAddExisting: (gid, itemId) => cardsAddExisting(gid, itemId), cardsAddNew: (gid, categoryId) => cardsAddNew(gid, categoryId),
    cardsDuplicate: (id) => cardsDuplicate(id), cardsDelete: (id) => cardsDelete(id),
    itemPicker: (gid) => itemPickerData(gid), listMode: () => LIST_MODE, curSpec: (gid) => clone(curSpec(gid)),
    catalogView: () => catalogView(),   // 試験台26 お品書きを見る（① の下書きの差分つき）
    selected: () => [...state.selected],   // 試験台26 試験の窓口（選んでいる部品）
    applyOps, peek: (on) => (on ? peekOn() : peekOff()), zOrder: zOrderList,
    sizes: sizesList, guides: guidesList,
    photos: photosApi, cropState,       // §3 入口（見せる範囲の途中も読める）
    textStyles: textStylesApi,          // §12 入口（今の端末の文字の見た目）
    textSetSize, textStep, textToggleBold, textSetColor, resetTextStyle,  // §12 文字の見た目を変える
    textRuns: textRunsApi,              // §13 入口（文の一部の見た目＝切れ目の並び）
    sectionList: sectionListApi,        // §2 入口（今の並び順のセクション）
    // §19 書体・リンク
    fonts: fontsApi, textSetFont, curFont: (id) => curFontOf(canonId(id)),
    listLayout, setCols, cols: colsApi, colsOf: (id, d) => colsOf(id, d),   // §20 列・幅
    programResize, handlesFor: (id) => handlesFor(canonId(id)), dropTarget,
    links: linksApi, elementLink: elementLinkApi, setElementLink, removeElementLink,
    applyPartStyle, parseExternalLink, parseAutoLink, resolveHref, linkLabel,
    editingHasSelection, editingSelRange, editingSelFont, setPartLinkCommitted,
    editingRangeRect: (s, e) => state.editing ? rangeRectOf(elNode(state.editing.id), s, e) : null,
    captureEditingCopy, editingPasteRich,
    editSelect: (s, e) => { if (!state.editing) return false; const n = elNode(state.editing.id); if (!n) return false; n.focus(); setCaretOffsets(n, s, e); if (typeof onRender === "function") onRender(); return true; },
    startEdit: (id) => startEdit(canonId(id)),
    editingId: () => state.editing && state.editing.id,
    setFixedSections,   // §22 §7 仮の一番上・一番下セクション
    boot, saveState, simulateSaveError, publish, versions,   // §22 §2 保存・§4.3 公開の記録
    publishCheck, longTextLimits,   // §22 §4.2 公開前チェック・長い文の目安
    previewMode, publishedGeometry,   // §22 §5 プレビュー
    viewVersion, exitView, restoreVersion, viewingVersion,   // §22 §6 履歴から前の版に戻す
  };
  return {
    state, render, reset, setDevice, undo, redo, commit, api, reduce, activeOps,
    boot, saveState, simulateSaveError, publish, versions, setFixedSections,   // §22 §2 保存・§4.3 公開・§7（WIRING から使う）
    publishCheck, longTextLimits,   // §22 §4.2（WIRING の確認の箱から使う）
    enterPreview, exitPreview, previewMode, publishedGeometry,   // §22 §5 プレビュー（WIRING から使う）
    imeBoundary,   // §23b 変換の境目（WIRING の document 監視から呼ぶ）
    viewVersion, exitView, restoreVersion, viewingVersion,   // §22 §6 履歴（WIRING から使う）
    draft: draftApi, roundTrip, recentColors: recentColorsApi, pushRecentColor,   // §24 試験の窓口・最近使った色（WIRING から使う）
    canUndo: () => !!state.restoreUndo || state.cursor > state.undoBase, canRedo: () => !state.restoreUndo && state.cursor < state.ops.length,
    canonId, isDraggable, isText, REPEAT, groupOf, secOf, elNode, getScale: () => scale, scaleMode: () => SCALE_MODE, isHeadingGroup, inputMode, relayout,
    sectionMove, sectionDelete, sectionAdd, sectionDuplicate, sectionCan,   // §2 セクションの操作
    beginDrag, dragMove, endDrag, isDragging: () => !!drag, selectOnly, toggleSel, selectMany, clearSel, selectSection, selectInDesignRect, smallHit,
    startEdit, commitEdit, nudge, nudgeSelected, deleteSelected, copySelection, cutSelection, paste, duplicate,
    // 試験台26：① 連動の操作・値段の箱・品を選ぶ一覧・お品書きを見る（WIRING から使う）
    partInfo, effPricesOf, setPrices, tableAddRow, tableDuplicate, tableDelete,
    cardsAddExisting, cardsAddNew, cardsDuplicate, cardsDelete, itemPickerData, catalogView, curSpec, isRepeat, LIST_MODE,
    resetScope, peekOn, peekOff, addTextAt, anchorsList, classify: (id) => M.classifyDrop(geometry(), id, [id]),
    bringToFront, sendToBack, bringForward, sendBackward, hasOverlapPartner, zOrderList,
    beginResize, resizeMove, endResize, isResizing: () => !!rz, programResize, handlesFor,
    paintPhotos, photosApi, replacePhotoFile, loadImageFile, assetUrl, assetNat,
    setBrightness, brightnessOf, addPhotoAtPoint, addTextAtPoint,   // §3/§4/§5（試験台17）
    beginCrop, cropState, cropPanStart, cropPanBy, cropCornerStart, cropCornerBy, cropZoomTo, cropWheel, cropCommit, cropCancel, isCropping, partChangedFromTemplate,
    quadFile, textFile,
    textSetSize, textStep, textToggleBold, textSetColor, resetTextStyle, textStylesApi, hasTextStyle,
    tsKeyOf, styleNameOf, primaryTextSel, SIZE_LIST,
    applyPartStyle, editingHasSelection, editingPartSizePx, boxSizePx, hasRuns, textRunsApi,   // §13
    // §19 書体・リンク（WIRING から使う）
    textSetFont, curFontOf, fontsApi, fontLabel, FONTS,
    linksApi, elementLinkOf, elementLinkApi, setElementLink, removeElementLink, canElementLink, setPartLinkCommitted,
    resolveHref, linkLabel, linkOpensNewTab, parseExternalLink, parseAutoLink,
    setCols, colsOf, colsApi, colEnabled, setColsPreview, clearColsPreview, listLayout, COL_CHOICES, COL_DEFAULT, colWidthFor, canSwap, swapHoriz, dropTarget,
    storeHas, storeValueText, STORE_KINDS, PAGES, SECTION_LABELS, friendlySec, selTextKeys, liveSel, caretOffsets, setCaretOffsets,
    applyPartStyleRange, autoLinkBeforeCaret, editingPasteLink, editingUndoAutoLink, editingHasAutoUndo, editingSelRange, editingSelFont,
    editingRangeRect: (s, e) => state.editing ? rangeRectOf(elNode(state.editing.id), s, e) : null,
    captureEditingCopy, editingPasteRich,
  };
})();
window.__playground = PG.api;
