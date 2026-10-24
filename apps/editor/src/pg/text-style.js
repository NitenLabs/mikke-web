// 文字の見た目（大きさ・太さ・色・書体）と「元に戻す」の入口
// 線：A1｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
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
  // 試験台28：新しいページの文字の段
  if (b === "logo") return "navLogo"; if (b === "fname") return "footName"; if (b === "faddr" || b === "fcopy") return "footText";
  if (b === "men" || b === "cen") return "pageEn"; if (b === "mtitle" || b === "ctitle") return "pageTitle";
  if (/^mg_/.test(b)) return "menuGroup"; if (/^mc_/.test(b)) return "menuCat"; if (/^mt_/.test(b)) return "kanmiTime";
  if (b === "clead" || /^ci_/.test(b)) return "featBody"; if (/^cl_/.test(b)) return "contactLabel";
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


// ---- J10・J56・J41 空にした文字の箱 ----
// 見出し・本文・品名など、空では意味をなさない文字は、空にしても高さ 0 にせず1行分の高さを残す（選べる・書き直せる）。
// 公開前の確認に「空の文字」として出す。説明・値段・時間など、もとから空でよい文字は対象にしない（高さ 0 のまま＝配置を変えない）。
function a1MustHaveText(id) { const b = bareOf(id); return /^(F_h\d*|I_h|F_b\d+|logo|fname|mtitle|ctitle)$/.test(b) || /^(card_name_|row_name_|mg_|mc_|add_)/.test(b); }
function a1KeepEmptyText() {
  for (const inst of state.secList) {
    const host = document.getElementById(secHostId(inst)); if (!host) continue;
    for (const el of host.querySelectorAll('[data-kind="text"]')) {
      const id = el.getAttribute("data-el"); if (!id || !a1MustHaveText(id)) continue;
      if ((el.textContent || "").trim() === "") { el.style.minHeight = "1lh"; el.setAttribute("data-empty-text", "1"); }
    }
  }
}
// 公開前の確認：今のページの空の文字（端末に依らないので1つ1回）
function a1EmptyTextItems(dev, items, seen) {
  for (const el of document.querySelectorAll('#sectionwrap [data-kind="text"]')) {
    const id = el.getAttribute("data-el"); if (!id || !a1MustHaveText(id)) continue;
    if ((el.innerText || el.textContent || "").trim()) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue;
    if (seen.has("text:" + id)) continue; seen.add("text:" + id);
    items.push({ device: dev, kind: "emptyText", parts: [id], text: `${/^(card|row)_name_/.test(bareOf(id)) ? "品の名前" : M.friendly(id)}が空です。文字を入れるか、いらなければ消してください` });
  }
}

// ---- J4・P27・P11 箱まるごとの斜体・下線・揃え（太字と同じ tstyle。両端末で共通・「このページを元に戻す」で戻る）----
function curItalicOf(id) { const ts = curTs(id); return !!(ts && ts.italic); }
function curUnderlineOf(id) { const ts = curTs(id); return !!(ts && ts.underline); }
function curAlignOf(id) { const ts = curTs(id); if (ts && ts.align) return ts.align; const st = SPEC.STYLES[styleNameOf(id)]; return (st && st.align) || "left"; }
function textToggleItalic() { const prim = primaryTextSel(); if (!prim) return; const keys = selTextKeys(); if (!keys.length) return; commit({ t: "tstyle", keys, italic: !curItalicOf(prim) }); }
function textToggleUnderline() { const prim = primaryTextSel(); if (!prim) return; const keys = selTextKeys(); if (!keys.length) return; commit({ t: "tstyle", keys, underline: !curUnderlineOf(prim) }); }
const A1_ALIGNS = ["left", "center", "right", "justify"];
function textSetAlign(a) { if (!A1_ALIGNS.includes(a)) return; const keys = selTextKeys(); if (!keys.length) return; const prim = primaryTextSel(); if (prim && keys.length === 1 && curAlignOf(prim) === a) return; commit({ t: "tstyle", keys, align: a }); }
// 書き換え中に箱まるごとの操作（揃え）：書き換えを終えずに続ける＝決めてから当て、同じ所にカーソルを戻して書き換えに入り直す
function a1BoxOpWhileEditing(fn) {
  if (!state.editing) { fn(); return; }
  const id = state.editing.id; const n = elNode(id); const o = (n && caretOffsets(n)) || state.editing.lastSel || null;
  commitEdit(); fn();
  startEdit(id); const nn = elNode(id); if (nn && o && state.editing) { setCaretOffsets(nn, o.s, o.e); state.editing.lastSel = { s: o.s, e: o.e }; }
}

// ---- P7・J9 カーソルだけ（選んでいない）で付けた見た目＝次に打つ文字に効く（PowerPoint）----
// state.editing.pending = { bold?, italic?, underline?, scale?, color?, font? }、pendingAt＝その時のカーソルの位置。
// カーソルを動かしたら捨てる（text-runs.js の reconcileEdit が打った文字に当てて使い終わる）。
function a1CaretOffset() { if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; const o = caretOffsets(n); if (o) return o; const l = state.editing.lastSel; return l ? { s: l.s, e: l.e } : null; }
// カーソルの所の見た目（前の文字。頭なら次の文字）に、まだ使っていない見た目を重ねたもの
function a1CaretStyle() {
  if (!state.editing) return {}; const n = elNode(state.editing.id); const runs = state.editing.runs || (n ? domToRuns(n) : []);
  const o = a1CaretOffset(); const at = o ? o.s : 0; const base = stAtChar(runs, at > 0 ? at - 1 : 0);
  const pd = (state.editing.pending && state.editing.pendingAt === at) ? state.editing.pending : {};
  return { ...base, ...pd };
}
function a1SetPending(kind, value) {
  if (!state.editing) return false; const o = a1CaretOffset(); if (!o) return false;
  if (state.editing.pendingAt !== o.s) state.editing.pending = null;
  const cur = a1CaretStyle(); const p = { ...(state.editing.pending || {}) };
  if (kind === "bold" || kind === "italic" || kind === "underline") p[kind] = !cur[kind];
  else if (kind === "scale") p.scale = value;
  else if (kind === "color") p.color = value;
  else if (kind === "font") p.font = value || null;
  state.editing.pending = p; state.editing.pendingAt = o.s;
  const n = elNode(state.editing.id); if (n) { try { n.focus(); setCaretOffsets(n, o.s, o.s); } catch (e) {} }
  if (typeof onRender === "function") onRender();
  return true;
}
// 選択が動いたら、使っていない見た目を捨てる（変換中は動いても捨てない）
function a1SelMoved() { if (!state.editing || !state.editing.pending || composing) return; const n = elNode(state.editing.id); if (!n) return; const o = caretOffsets(n); if (!o) return; if (o.s !== o.e || o.s !== state.editing.pendingAt) state.editing.pending = null; }
// 道具の並びに出す見た目（P8）：選んだ所（またはカーソルの所）。混ざっていれば mixed。
function a1EditingLook() {
  if (!state.editing) return null; const id = state.editing.id; const n = elNode(id); if (!n) return null;
  const runs = state.editing.runs || domToRuns(n); const o = liveSel() || caretOffsets(n) || { s: 0, e: 0 };
  const boxPx = boxSizePx(id); const boxBold = curWeightOf(id) >= 700;
  if (o.e <= o.s) { const st = a1CaretStyle(); return { bold: !!st.bold || boxBold, italic: !!st.italic || curItalicOf(id), underline: !!st.underline || curUnderlineOf(id), size: Math.round(boxPx * (st.scale || 1)), color: st.color != null ? st.color : null }; }
  const cov = runsSlice(runs, o.s, o.e); if (!cov.length) return null;
  const sizes = new Set(cov.map((r) => Math.round(boxPx * (r.scale || 1))));
  const colors = new Set(cov.map((r) => (r.color == null ? null : r.color)));
  return { bold: boxBold || cov.every((r) => r.bold), italic: curItalicOf(id) || cov.every((r) => r.italic), underline: curUnderlineOf(id) || cov.every((r) => r.underline), size: sizes.size === 1 ? [...sizes][0] : null, color: colors.size === 1 ? [...colors][0] : "__mixed__" };
}
function a1Exports() { return { a1InsertNewline, curItalicOf, curUnderlineOf, curAlignOf, textToggleItalic, textToggleUnderline, textSetAlign, a1BoxOpWhileEditing, a1SetPending, a1CaretStyle, a1SelMoved, a1EditingLook, a1CaretOffset, curWeightOf }; }
// P13 足したばかりの空の箱に見せる見本の文字（CSS の ::before。文には入らない）
function a1MarkPlaceholder(id) { const n = elNode(id); if (n) n.setAttribute("data-placeholder", "テキストを入力"); }
// F2 文字の箱の幅の下限：その箱の文字の大きさで4文字分、かつ 80 以上（設計の px）
function a1TextMinW(id) { let px = 16; try { px = curSizeOf(id) || 16; } catch (e) {} return Math.max(80, Math.ceil(px * 4)); }
