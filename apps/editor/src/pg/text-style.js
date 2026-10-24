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

