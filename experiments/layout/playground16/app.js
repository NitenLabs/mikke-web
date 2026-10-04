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
  const secOf = (id) => { const t = instTag(id); if (t) return t; if (isAdded(id)) { const op = activeOps().find((o) => o.t === "add" && o.id === id); return op ? op.section : "items"; } return id.startsWith("F_") ? "feature" : "items"; };
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
  // 文字の見た目を元に戻す：箱まるごと（鍵）＋文の一部（この部品の runs）の両方（§2.2）
  function resetTextStyle(id) { commit({ t: "tstyleReset", keys: [tsKeyOf(id)], parts: [id] }); }
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

  // ---- 文の一部の見た目（runs。試験台13）----
  // 部品の中身を、見た目つきのひと続きの切れ目の並び [{text,bold?,color?,scale?}] で持つ（PC/SP 共通の中身）。
  function normRuns(runs) {
    const out = [];
    for (const r of runs) { const t = r.text || ""; if (!t) continue; const last = out[out.length - 1];
      const same = last && !!last.bold === !!r.bold && (last.color == null ? null : last.color) === (r.color == null ? null : r.color) && (last.scale || 1) === (r.scale || 1);
      if (same) last.text += t; else out.push({ text: t, ...(r.bold ? { bold: true } : {}), ...(r.color != null ? { color: r.color } : {}), ...(r.scale && r.scale !== 1 ? { scale: +(+r.scale).toFixed(4) } : {}) });
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
    while ((n = walk.nextNode())) { const t = n.data; if (t === "") continue; let bold = false, color = null, scale = 1, p = n.parentNode;
      while (p && p !== root) { if (p.nodeType === 1) { if (p.getAttribute("data-b") === "1" || p.tagName === "B" || p.tagName === "STRONG") bold = true; const c = p.getAttribute("data-c"); if (c && color == null) color = c; const sc = p.getAttribute("data-s"); if (sc) scale *= parseFloat(sc) || 1; } p = p.parentNode; }
      out.push({ text: t, ...(bold ? { bold: true } : {}), ...(color != null ? { color } : {}), ...(Math.abs(scale - 1) > 1e-6 ? { scale: +scale.toFixed(4) } : {}) });
    }
    return normRuns(out);
  }
  function runSpan(r) { const css = TEXT.runStyleCss(r); const da = []; if (r.bold) da.push('data-b="1"'); if (r.color != null) da.push('data-c="' + r.color + '"'); if (r.scale && r.scale !== 1) da.push('data-s="' + r.scale + '"'); if (!css && !da.length) return escH(r.text); return "<span " + da.join(" ") + (css ? ' style="' + css + '"' : "") + ">" + escH(r.text) + "</span>"; }
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
  function editingSel() { if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; const o = caretOffsets(n); if (o && o.e > o.s) state.editing.lastSel = o; return o; }
  // 道具（上のボタン・欄）に触れると編集中の選択が外れることがあるので、直近の選択を覚えておいて使う
  function liveSel() { const o = editingSel(); if (o && o.e > o.s) return o; return state.editing && state.editing.lastSel; }
  function editingHasSelection() { const o = liveSel(); return !!(o && o.e > o.s); }
  const stAtChar = (runs, idx) => { if (idx < 0) return {}; let o = 0; for (const r of runs) { const len = r.text.length; if (idx < o + len) return { bold: r.bold, color: r.color, scale: r.scale }; o += len; } return {}; };
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
    const mid = inserted ? [{ text: inserted, ...(sty.bold ? { bold: true } : {}), ...(sty.color != null ? { color: sty.color } : {}), ...(sty.scale && sty.scale !== 1 ? { scale: sty.scale } : {}) }] : [];
    const newRuns = normRuns([...before, ...mid, ...after]);
    state.editing.runs = newRuns; n.innerHTML = runsToEditHtml(newRuns); setCaretOffsets(n, p + inserted.length, p + inserted.length);
  }
  // 選んだ所だけに見た目を付ける（編集中・選択あり）。commit はしない（書き換えを終えるとき 1 op で記録）。
  function applyPartStyle(kind, value) { if (!state.editing) return false; const n = elNode(state.editing.id); if (!n) return false; reconcileEdit(); const o = liveSel(); if (!o || o.e <= o.s) return false;
    let runs = state.editing.runs || domToRuns(n); const { s, e } = o;
    if (kind === "bold") { const cov = runsSlice(runs, s, e); const allBold = cov.length && cov.every((r) => r.bold); runs = applyRunRange(runs, s, e, (r) => { if (allBold) delete r.bold; else r.bold = true; }); }
    else if (kind === "color") { runs = applyRunRange(runs, s, e, (r) => { r.color = value; }); }
    else if (kind === "scale") { runs = applyRunRange(runs, s, e, (r) => { if (value === 1) delete r.scale; else r.scale = value; }); }
    state.editing.runs = runs; n.innerHTML = runsToEditHtml(runs); setCaretOffsets(n, s, e); liveReflow(); return true;
  }
  function boxSizePx(id) { const sn = styleNameOf(id); return effSize(sn, state.device, reduce(activeOps()).textStyles[tsKeyOf(id)]).size; }
  // 選択の代表の、今の端末での実際の大きさ（px）＝箱の大きさ×倍率
  function editingPartSizePx() { if (!state.editing) return null; const n = elNode(state.editing.id); if (!n) return null; const o = liveSel() || caretOffsets(n); if (!o) return null; const runs = state.editing.runs || domToRuns(n); let acc = 0, scale = 1; for (const r of runs) { const len = r.text.length; if (o.s < acc + len) { scale = r.scale || 1; break; } acc += len; } return Math.round(boxSizePx(state.editing.id) * scale); }
  function hasRuns(id) { const r = reduce(activeOps()).runsMap[id]; return !!(r && (r.length > 1 || (r[0] && (r[0].bold || r[0].color != null || (r[0].scale && r[0].scale !== 1))))); }
  // §2.3 入口：その部品の切れ目の並び
  function textRunsApi(part) { if (state.editing && state.editing.id === part) { reconcileEdit(); return (state.editing.runs || []).map((r) => ({ ...r })); } const R = reduce(activeOps()); return R.runsMap[part] ? R.runsMap[part].map((r) => ({ ...r })) : [{ text: rawText(part, R) }]; }

  // §2 セクションの並び（ページの組み立て）。今は特集・品の2つ。複製・追加・削除・並べ替えはこの並びを書き換える（試験台14・第2回で操作を足す）。
  const defaultSecList = () => [{ id: "feature", type: "feature" }, { id: "items", type: "items" }];
  let state = { device: "pc", ops: [], cursor: 0, selected: new Set(), selectedSection: null, editing: null, peek: false, clipboard: null, addSeq: 0, secSeq: 0, secList: defaultSecList() };
  let scale = 1, layoutCount = 0, composing = false;
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
    return false;
  }
  function routeReplaceAsset(secContent, pid, asset) {
    const c = secContent[secOf(pid)]; if (!c) return; const b = bareOf(pid); let m;
    if ((m = b.match(/^F_p(\d)$/)) && c.blocks) { if (c.blocks[+m[1]]) c.blocks[+m[1]].photo.asset = asset; }
    else if ((m = b.match(/^card_photo_(.+)$/)) && c.cards) { const card = c.cards.find((x) => x.id === m[1]); if (card) card.photo.asset = asset; }
  }

  // ---- 操作列 → content / edits ----
  function reduce(ops, device, peek) {
    device = device || state.device;
    const full = base();
    // §2 セクションの並びと、インスタンスごとの content スライス。最初は特集・品の2つ。
    const secList = [{ id: "feature", type: "feature" }, { id: "items", type: "items" }];
    const secContent = { feature: full.feature, items: full.items };
    const editMap = {}; const adds = []; const removed = new Set();
    const m1 = {}, m2 = {}, clearL = []; const tpl = {}; const order = {}; const zmap = {}; const sizes = {};
    const replaceMap = {}, viewAll = {};   // §1 写真の差し替え（端末共通）／§2 見せる範囲（端末ごと）
    const textStyles = {};                  // §12 文字の見た目：鍵→{weight,color,size:{pc,sp}}（weight/color は端末共通・size は端末ごと）
    const runsMap = {};                     // §13 文の一部の見た目：部品ID→[{text,bold?,color?,scale?}]（中身＝PC/SP 共通）
    const delCards = {}, delRows = {};      // インスタンスID → 消す card/row id の Set
    const orderSec = (k) => (/^F/.test(bareOf(k)) ? "feature" : "items");
    const scopeIds = (scope, id) => {
      if (scope === "part") return [canonId(id)];
      const all = [...TEMPLATE_DRAG, ...adds.map((a) => a.id)];
      if (scope === "page") return all;
      return all.filter((x) => secOf(x) === secOf(id));
    };
    for (const op of ops) {
      if (op.t === "edit") { if (op.runs) { runsMap[op.id] = op.runs; editMap[op.id] = op.runs.map((r) => r.text).join(""); } else { editMap[op.id] = op.text; delete runsMap[op.id]; } }
      else if (op.t === "add") { if (!removed.has(op.id)) adds.push(op); }
      else if (op.t === "del") { const inst = secOf(op.id); const bb = bareOf(op.id); if (/^card_/.test(bb)) (delCards[inst] = delCards[inst] || new Set()).add(cardIdOf(op.id)); else if (/^row_/.test(bb)) (delRows[inst] = delRows[inst] || new Set()).add(cardIdOf(op.id)); removed.add(op.id); for (let i = adds.length - 1; i >= 0; i--) if (adds[i].id === op.id) adds.splice(i, 1); delete m1[op.id]; delete m2[op.id]; }
      else if (op.t === "clear") { if (!clearL.includes(op.id)) clearL.push(op.id); }
      else if (op.t === "unclear") { const i = clearL.indexOf(op.id); if (i >= 0) clearL.splice(i, 1); }
      // §1 差し替え：素材を入れ替える（端末共通）。外した印は消す。両端末の見せる範囲は真ん中・1倍に戻す（＝view を捨てる）
      else if (op.t === "replace") { replaceMap[op.id] = op.asset; const i = clearL.indexOf(op.id); if (i >= 0) clearL.splice(i, 1); delete viewAll[op.id]; }
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
        for (const k in (op.edits.replace || {})) replaceMap[k] = op.edits.replace[k];
        for (const k in (op.edits.viewAll || {})) viewAll[k] = clone(op.edits.viewAll[k]);
        for (const id of (op.edits.clear || [])) if (!clearL.includes(id)) clearL.push(id);
        for (const a of (op.added || [])) adds.push(clone(a));
      }
      else if (op.t === "move") { if (op.device === device) for (const it of op.items) { if (it.mode === "M1") { delete m2[it.id]; m1[it.id] = { dx: it.dx, dy: it.dy }; } else { delete m1[it.id]; m2[it.id] = { anchor: it.anchor, gapY: it.gapY, x: it.x }; } } }
      else if (op.t === "reorder") { if (op.device === device) { order[op.key] = op.order.slice(); delete m1[op.id]; delete m2[op.id]; } }
      else if (op.t === "zorder") { if (op.device === device) zmap[op.id] = op.z; }   // §4 重なり順
      // §4（大きさ）：部品→端末ごと。w/h/padB は絶対値（最後が勝つ）。dx は「左から変えた分」の位置ずれ＝m1 に足す（右端を動かさない）。
      else if (op.t === "size") { if (op.device === device) { const s = sizes[op.id] || {}; if (op.w != null) s.w = op.w; if (op.h != null) s.h = op.h; if (op.padB != null) s.padB = op.padB; sizes[op.id] = s; if (op.dx) { const m = m1[op.id] || { dx: 0, dy: 0 }; m1[op.id] = { dx: (m.dx || 0) + op.dx, dy: m.dy || 0 }; } } }
      // §12 文字の見た目：weight/color は端末共通（device で絞らない）、size は op.device の枠へ（両端末ぶんを溜める）
      else if (op.t === "tstyle") { for (const k of op.keys) { const s = textStyles[k] = textStyles[k] || {}; if (op.weight != null) s.weight = op.weight; if (op.color != null) s.color = op.color; if (op.size != null) { s.size = s.size || {}; s.size[op.device] = op.size; } } }
      // 文字の見た目を元に戻す：箱まるごと（鍵）＋文の一部（部品の runs）の両方（§2.2 書式のクリア）
      else if (op.t === "tstyleReset") { for (const k of op.keys) delete textStyles[k]; if (op.parts) for (const pid of op.parts) delete runsMap[pid]; }
      else if (op.t === "resetScope") { if (op.devices.includes(device)) {
        if (op.scope === "page") {
          // §13.1「このページを元に戻す」＝全セクションのデザインに関わるもの全部（セクションの並び・追加・複製・削除は §2.2 により戻さない＝別 op のため触らない）。
          for (const k of Object.keys(m1)) delete m1[k]; for (const k of Object.keys(m2)) delete m2[k];
          for (const k of Object.keys(zmap)) delete zmap[k]; for (const k of Object.keys(sizes)) delete sizes[k];
          for (const k of Object.keys(order)) delete order[k];
          for (const k of Object.keys(textStyles)) delete textStyles[k]; for (const k of Object.keys(viewAll)) delete viewAll[k];
        } else {
          const sIds = scopeIds(op.scope, op.id); for (const id of sIds) { delete m1[id]; delete m2[id]; delete zmap[id]; delete sizes[id]; }
          for (const k of Object.keys(order)) { if ((op.scope === "section" && orderSec(k) === secOf(op.id)) || (op.scope === "part" && (op.id === k || scopeIds("part", op.id).some((pid) => (order[k] || []).includes(pid))))) delete order[k]; }
        }
      } }
    }
    // 品・表の行を減らす（§10.2・R2/R9）＝インスタンスごと
    for (const [inst, set] of Object.entries(delCards)) { const c = secContent[inst]; if (c && c.cards) c.cards = c.cards.filter((x) => !set.has(x.id)); }
    for (const [inst, set] of Object.entries(delRows)) { const c = secContent[inst]; if (c && c.table) c.table = c.table.filter((x) => !set.has(x.id)); }
    // content に文字を反映（テンプレ・品）＝パーツの属するインスタンスへ
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
      let place;
      if (m2[a.id]) place = { anchor: m2[a.id].anchor, gap: m2[a.id].gapY, x: m2[a.id].x };
      else if (device === a.placedDevice) place = { anchor: a.anchor, gap: a.gap, x: a.x };
      else place = { anchor: a.anchor, gap: (a.gapOther != null ? a.gapOther : a.gap), x: "@left" };
      // 幅はその端末でのコピー元の幅。置いた左端から中身の右端に収まらないなら、そこまで縮める（写真は縦横比保持。§2.3）
      let w = device === a.placedDevice ? a.w : (a.wOther != null ? a.wOther : a.w);
      let h = a.kind === "photo" ? (device === a.placedDevice ? a.h : (a.hOther != null ? a.hOther : a.h)) : a.h;
      if (typeof place.x === "number" && place.x + w > contentRight) { const avail = contentRight - place.x; if (a.kind === "photo" && h && w) h = Math.round(h * avail / w * 100) / 100; w = avail; }
      const asset = a.kind === "photo" ? (replaceMap[a.id] != null ? replaceMap[a.id] : a.asset) : undefined;
      added.push({ id: a.id, section: a.section, kind: a.kind, styleName: a.styleName || "featBody", w, h, text, anchor: place.anchor, gap: place.gap, x: place.x, asset });
      delete m2[a.id];
    }
    // template 部品の m2/remove（added でないもの）
    const remove = [...removed].filter((id) => !isAdded(id));
    // 「元の配置を見る」：手で動かした部品・並び替えを元（今の中身からのテンプレ）に戻して見せる（記録は変えない）
    if (peek) { for (const k in m1) delete m1[k]; for (const k in m2) delete m2[k]; for (const k in order) delete order[k]; for (const k in sizes) delete sizes[k]; }
    // content は従来どおり anchor（特集・品）のスライスを束ねたもの。インスタンス全体は secContent/secList で持つ。
    const content = { feature: secContent.feature, items: secContent.items };
    return { content, secContent, secList, m1, m2, added, remove, clear: clearL, tpl, adds, editMap, order, zmap, sizes, replaceMap, viewAll, textStyles, runsMap };
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
      for (const b of boxes) { const ts = R.textStyles[lk(tsKeyBox(b.key))]; if (!ts) continue; if (ts.size && (ts.size.pc != null || ts.size.sp != null)) b.sizePx = effSize(b.styleName, b.device, ts).size; if (ts.weight != null) b.weightOv = ts.weight; }
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
      const out = (inst.type === "feature" ? M.buildFeature : M.buildItems)(content, state.device, H, edits);
      host.innerHTML = pfx ? prefixIds(out.bodyHtml, pfx) : out.bodyHtml;
      host._padBottom = out.padBottom;
      const s = host.querySelector("#sec"); if (s) s.style.background = SPEC.COLORS[secBgName(idx)];   // §2.2 背景は並び順で
    });
    applyTextStyles(R);   // §12：文字の箱まるごとの大きさ・太さ・色を当てる（実測・配置の前に）
    layoutScale();
    placeAbsolute(R);
    decorate();
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
      }
    }
  }

  function layoutScale() {
    const dw = SPEC.DESIGN_W[state.device];
    // §1（試験台16・X4）スマホでの編集では #stage の余白を外し、ページの幅をちょうど画面の幅にする（横スクロールさせない）
    const avail = document.getElementById("stage").clientWidth - (inputMode() === "phone" ? 0 : 4);
    scale = Math.min(1, avail / dw);
    for (const inst of state.secList) {
      const host = document.getElementById(secHostId(inst)); if (!host) continue; const s = host.querySelector("#sec"); if (!s) continue;
      s.style.width = dw + "px"; s.style.transformOrigin = "top left"; s.style.transform = "scale(" + scale + ")";
      host.style.width = dw * scale + "px"; host.style.height = s.getBoundingClientRect().height + "px";
    }
  }

  // 絶対配置（M2・足した部品）の top/left を入れ、セクションを必要なら伸ばす（§1.1）。IME 変換中は呼ばない。
  function placeAbsolute(R) {
    R = R || reduce(activeOps());
    layoutCount++;
    appliedPlace = {};
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
    const moved = new Set([...Object.keys(R.m1), ...Object.keys(R.m2), ...Object.keys(R.sizes), ...Object.keys(R.textStyles || {}).filter((k) => R.textStyles[k].size)]);
    const isMoved = (id) => moved.has(canonId(id)) || (groupOf(id) && moved.has(groupOf(id)));
    const items = Object.entries(g).filter(([, e]) => ["text", "photo", "pill"].includes(e.kind));
    const overlaps = [], ownerOverlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const [ai, a] = items[i], [bi, b] = items[j]; if (secOf(ai) !== secOf(bi)) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= 1 || oy <= 1) continue;
      const contains = (p, q) => p.x <= q.x + 1 && p.y <= q.y + 1 && p.x + p.w >= q.x + q.w - 1 && p.y + p.h >= q.y + q.h - 1;
      if (contains(a, b) || contains(b, a)) continue;
      (isMoved(ai) || isMoved(bi) ? ownerOverlaps : overlaps).push({ a: ai, b: bi });
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
    for (const id of manual) { const n = elNode(id); if (n) n.classList.add("mark-manual"); }
    // §2：赤い枠（.mark-warn）は出さない
    for (const id of state.selected) { const n = elNode(id); if (n) n.classList.add("mark-sel"); }
    // §4：重なり順（端末ごと）を z-index で当てる。M2 は絶対配置のラッパ(.absitem)へ、ほかは本体へ（static なら relative 化）
    for (const [id, z] of Object.entries(R.zmap || {})) { const n = elNode(id); if (!n) continue; const target = n.closest(".absitem") || n; if (getComputedStyle(target).position === "static") target.style.position = "relative"; target.style.zIndex = String(z); }
    // §2：つかめる範囲を広げた小さな部品は、選択の枠も広げた範囲で表示する
    const g = geometry();
    for (const id of state.selected) { const e = g[id]; if (!e) continue; const padX = e.w < 16 ? 8 : 0, padY = e.h < 16 ? 8 : 0; if (!padX && !padY) continue; const s = secNode(secOf(id)); if (!s) continue; const pad = document.createElement("div"); pad.className = "sel-pad"; pad.style.cssText = `position:absolute;left:${e.x - padX}px;top:${e.y - padY}px;width:${e.w + 2 * padX}px;height:${e.h + 2 * padY}px;outline:2px solid #06c;pointer-events:none;z-index:5`; s.appendChild(pad); }
    // §4：大きさのつまみ（1つだけ選ばれていて、大きさを変えられる部品のとき）。data-handle に向きを持つ。
    if (state.selected.size === 1 && !state.editing) { const id = [...state.selected][0]; const hs = handlesFor(id); const e = g[id]; if (hs.length && e) { const s = secNode(secOf(id)); if (s) for (const dir of hs) { const p = handlePoint(dir, e); const h = document.createElement("div"); h.className = "rz-handle"; h.setAttribute("data-handle", dir); h.setAttribute("data-handle-for", id); h.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;width:${HSZ}px;height:${HSZ}px;margin-left:${-HSZ / 2}px;margin-top:${-HSZ / 2}px;background:#fff;border:1.5px solid #06c;z-index:8;touch-action:none;cursor:${cursorFor(dir)}`; s.appendChild(h); } } }
  }
  // §4：どのつまみを出すか・位置・形
  const HSZ = 14;
  function resizableKind(id) { const c = canonId(id); if (c === "I_divider") return "line"; if (c === "I_pillbg") return "pill"; if (/^F_p\d$/.test(c) || /^addp_/.test(c)) return "photo"; if (REPEAT.test(c) || c === "I_cards" || c === "I_table") return null; if (isText(c) || isAdded(c)) return "text"; return null; }
  function handlesFor(id) { const k = resizableKind(id); if (k === "text") return ["nw", "ne", "sw", "se", "e", "w", "s"]; if (k === "photo") return ["nw", "ne", "sw", "se"]; if (k === "line" || k === "pill") return ["e", "w"]; return []; }
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
  function commit(op) { state.ops = state.ops.slice(0, state.cursor); state.ops.push(op); state.cursor++; render(); }
  function undo() { if (state.editing) return; if (state.cursor > 0) { state.cursor--; render(); } }
  function redo() { if (state.editing) return; if (state.cursor < state.ops.length) { state.cursor++; render(); } }
  function reset() { state.ops = []; state.cursor = 0; state.selected = new Set(); state.selectedSection = null; state.editing = null; state.secList = defaultSecList(); render(); }
  function setDevice(d) { if (state.editing) commitEdit(); state.device = d; render(); }

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
    const shared = { textStyles: {}, runsMap: {}, replace: {}, viewAll: {}, clear: [] };
    for (const k in Rpc.textStyles) if (ownPart(k)) shared.textStyles[remap(k)] = clone(Rpc.textStyles[k]);
    for (const k in Rpc.runsMap) if (ownPart(k)) shared.runsMap[remap(k)] = clone(Rpc.runsMap[k]);
    for (const k in Rpc.replaceMap) if (ownPart(k)) shared.replace[remap(k)] = Rpc.replaceMap[k];
    for (const k in Rpc.viewAll) if (ownPart(k)) shared.viewAll[remap(k)] = clone(Rpc.viewAll[k]);
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
    const ro = single ? reorderPreview(g, drag.ids[0]) : null;
    // §2 そろえる（単体・Alt でない）。並び替えのときは縦は並び替えが勝つ＝横だけ吸い付く
    drag.snapDX = 0; drag.snapDY = 0;
    if (single && !alt) { const id = drag.ids[0]; const e = g[id];
      if (e) { const snap = snapBox(secOf(id), e, true, !ro, new Set([id])); drag.snapDX = snap.dx; drag.snapDY = snap.dy;
        if (snap.dx || snap.dy) { const n = elNode(id); if (n) n.style.transform = `translate(${drag.baseT[id].tx + dx + snap.dx}px,${drag.baseT[id].ty + dy + snap.dy}px)`; g = geometry(); }
        setGuides(snap.guides, secOf(id)); } }
    else setGuides([], null);
    if (ro) showReorderLine(drag.ids[0], ro);
  }
  function classify(g, id) { if (isAdded(id)) return "M2"; return classifyDropX(g, id, drag ? drag.ids : [id], drag ? drag.origGeom : g); }
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
  function reorderPreview(g, id, ogArg) {
    if (isAdded(id)) return null;
    const rc = reorderClusterOf(id); if (!rc) return null;
    const og = ogArg || (drag ? drag.origGeom : g);
    const sibs = rc.sibs.filter((s) => og[s]); if (sibs.length < 2) return null;
    const cy = g[id].y + g[id].h / 2;
    const top = Math.min(...sibs.map((s) => og[s].y)), bot = Math.max(...sibs.map((s) => og[s].y + og[s].h));
    if (cy < top - 40 || cy > bot + 40) return null;      // 塊の範囲（±40）の外＝並び替えでない（→M2 等）
    if (insideNestedGroup(g, id, cy)) return null;         // 入れ子の別塊の中＝M2
    const neworder = M.reorderWithin(og, id, rc.sibs, cy);
    return neworder ? { key: rc.key, order: neworder } : null;
  }
  function showReorderLine(id, ro) {
    const og = drag ? drag.origGeom : geometry(); const sec = secOf(id); const s = secNode(sec); if (!s) return;
    const idx = ro.order.indexOf(id); const above = idx > 0 ? ro.order[idx - 1] : null;
    const y = above && og[above] ? og[above].y + og[above].h + 1 : (og[ro.order.find((x) => x !== id)] ? og[ro.order.find((x) => x !== id)].y - 2 : 0);
    const me = og[id]; const line = document.createElement("div"); line.className = "reorder-line";
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
    if (drag.ids.length === 1) { const ro = reorderPreview(g, drag.ids[0]); if (ro) { const id = drag.ids[0]; drag = null; commit({ t: "reorder", device: state.device, key: ro.key, id, order: ro.order }); return; } }
    // M1/M2 を判定。M2 の付いていく先・間隔は「離した瞬間（元の場所を詰める前）の配置」で決める（§2.2）。
    const decided = drag.ids.map((id) => ({ id, mode: classify(g, id) }));
    if (decided.some((d) => d.mode === "M2")) {
      const finalItems = decided.map((d) => {
        if (d.mode === "M1") { const bt = drag.baseT[d.id], p0 = prior[d.id] || { dx: 0, dy: 0 }; return { id: d.id, mode: "M1", dx: Math.round((p0.dx || 0) + bt.tx + dx), dy: Math.round((p0.dy || 0) + bt.ty + dy) }; }
        const pr = reanchorX(g, d.id);   // g＝離した瞬間（詰める前）の実測（複製・追加セクションはそのセクションだけで）
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
    const s = r.start; const { left: cL, right: cR } = contentEdges(); const MIN = 40; const H = r.handle;
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
  function nudge(id, dx, dy) {
    const c = canonId(id); const R = reduce(activeOps());
    if (R.m2[c]) { const ov = R.m2[c]; commit({ t: "move", device: state.device, items: [{ id: c, mode: "M2", anchor: ov.anchor, gapY: ov.gapY, x: ov.x + dx }] }); if (dy) { const ov2 = reduce(activeOps()).m2[c]; commit({ t: "move", device: state.device, items: [{ id: c, mode: "M2", anchor: ov2.anchor, gapY: ov2.gapY + dy, x: ov2.x }] }); } return; }
    const m = R.m1[c] || { dx: 0, dy: 0 };
    commit({ t: "move", device: state.device, items: [{ id: c, mode: "M1", dx: m.dx + dx, dy: m.dy + dy }] });
  }
  function nudgeSelected(dx, dy) { const ids = [...state.selected].filter(isDraggable); if (!ids.length) return; const R = reduce(activeOps()); const items = ids.map((c) => { const m = R.m1[c] || { dx: 0, dy: 0 }; return { id: c, mode: "M1", dx: m.dx + dx, dy: m.dy + dy }; }); commit({ t: "move", device: state.device, items }); }
  function deleteSelected() { const ids = [...state.selected].filter((id) => isDraggable(id) || REPEAT.test(id)); if (!ids.length) return; for (const id of ids) commit({ t: "del", id: canonId(id) }); state.selected = new Set(); render(); }

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
  function startEdit(id) {
    const c = canonId(id); const n = elNode(c); if (!n || !isText(c)) return;
    if (state.editing) commitEdit();
    // X3：書き換えに入ったら、その部品を選んだ状態にする（PowerPoint と同じ）＝上の文字の道具が出る。品・表の中の1件の文字でも同じ。
    state.selectedSection = null; state.selected = new Set([c]);
    const runs = rawRuns(c);
    state.editing = { id: c, runs };
    n.innerHTML = runsToEditHtml(runs);         // 見た目つきの切れ目（文の一部の見た目）を見せて編集（§13）
    n.setAttribute("contenteditable", "true");
    n.style.whiteSpace = "pre-wrap"; n.style.wordBreak = "normal"; n.style.outline = "2px solid #06c";
    n.focus();
    const range = document.createRange(); range.selectNodeContents(n); range.collapse(false);
    const selc = window.getSelection(); selc.removeAllRanges(); selc.addRange(range);
    // 道具に触れて選択が外れても使えるよう、選択を覚えておく
    state.editing.selWatch = () => { if (!state.editing) return; const nn = elNode(state.editing.id); if (!nn) return; const o = caretOffsets(nn); if (o && o.e > o.s) state.editing.lastSel = o; };
    document.addEventListener("selectionchange", state.editing.selWatch);
    n.oninput = (e) => { if (composing || (e && e.isComposing)) return; reconcileEdit(); liveReflow(); };  // 変換中は取り込まない（§2.1）
    n.oncompositionstart = () => { composing = true; };
    n.oncompositionend = () => { composing = false; reconcileEdit(); liveReflow(); };   // 変換の決定で取り込む（見た目は引き継ぐ）
    n.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); commitEdit(); } };
    refreshSel();   // X3：選択の印と、上の文字の道具を今の状態に更新する（書き換えに入った部品が選ばれている）
  }
  function liveReflow() { placeAbsolute(); if (typeof onRender === "function") onRender(); }
  function commitEdit() {
    if (!state.editing) return; const id = state.editing.id; const n = elNode(id);
    if (n) reconcileEdit();
    const runs = (state.editing.runs) || (n ? domToRuns(n) : [{ text: rawText(id) }]);
    if (state.editing.selWatch) document.removeEventListener("selectionchange", state.editing.selWatch);
    state.editing = null; if (n) { n.oninput = n.oncompositionstart = n.oncompositionend = n.onkeydown = null; n.removeAttribute("contenteditable"); }
    const styled = runs.length > 1 || (runs[0] && (runs[0].bold || runs[0].color != null || (runs[0].scale && runs[0].scale !== 1)));
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
    const parts = ids.filter(isDraggable).map((id) => ({ id, kind: kindOf(id), text: isText(id) ? rawText(id) : null, x: gHere[id].x, y: gHere[id].y, w: gHere[id].w, h: gHere[id].h, wOther: gOther[id] ? gOther[id].w : gHere[id].w, hOther: gOther[id] ? gOther[id].h : gHere[id].h }));
    if (parts.length) state.clipboard = { kind: "parts", parts };
  }
  function cutSelection() { copySelection(); deleteSelected(); }
  // §5：貼り付け・複製はコピー元のすぐ下（間隔16）、左端をコピー元にそろえ、コピー元に付いていく。重なれば自分が下がる。
  function paste() {
    const cb = state.clipboard; if (!cb) return;
    if (cb.kind === "card") { duplicateCard(cb.cardId); return; }
    if (cb.kind === "row") { duplicateRow(cb.rowId); return; }
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
      commit({ t: "add", id, section: targetSec, kind: p.kind === "photo" ? "photo" : "text", styleName: styleOf(p.id), w: p.w, wOther: p.wOther, h: p.kind === "photo" ? p.h : undefined, hOther: p.kind === "photo" ? p.hOther : undefined, text: p.text || "", anchor, gap, gapOther: gap, placedDevice: state.device, x });
      newIds.push(id);
    }
    resolveBothDevices(newIds);                           // 両端末それぞれで重なりを自分が下がって解消（§5）
    selectMany(newIds);
  }
  function duplicate() { const ids = [...state.selected]; if (ids.length === 1 && /^card_/.test(ids[0])) { duplicateCard(cardIdOf(ids[0])); return; } if (ids.length === 1 && /^row_/.test(ids[0])) { duplicateRow(cardIdOf(ids[0])); return; } copySelection(); paste(); }
  function duplicateCard(cid) {
    const R = reduce(activeOps()); const card = R.content.items.cards.find((c) => c.id === cid); if (!card) return;
    const nc = clone(card); nc.id = "c_dup" + (++state.addSeq);
    commit({ t: "addCard", after: cid, card: nc });
  }
  function duplicateRow(rid) {
    const R = reduce(activeOps()); const row = R.content.items.table.find((r) => r.id === rid); if (!row) return;
    const nr = clone(row); nr.id = "r_dup" + (++state.addSeq);
    commit({ t: "addRow", after: rid, row: nr });
  }
  const cardIdOf = (id) => { const b = bareOf(id); return (b.match(/^(?:card|row)_(?:photo|name|desc|price|vline)?_?(.+)$/) || [])[1] || b.replace(/^(?:card|row)_[a-z]+_/, ""); };
  const kindOf = (id) => (/^F_p|^I_.*photo|photo/.test(id) ? "photo" : "text");
  const styleOf = (id) => (/_h\d$/.test(id) || id === "F_h0" ? "featHead" : "featBody");

  // ---- 戻す（§4）----
  function resetScope(scope, id, devices) { commit({ t: "resetScope", scope, id: id || (scope === "part" ? [...state.selected][0] : "F_h0"), devices: devices || [state.device] }); }
  // §2.1（N1）：位置・大きさ・並び順・重なり順のどれか1つでもテンプレから変わっていれば「元の位置に戻す」を出す
  function partChangedFromTemplate(id) {
    const c = canonId(id); const R = reduce(activeOps());
    const chg = (k) => !!(R.m1[k] || R.m2[k] || R.sizes[k] || (R.zmap && R.zmap[k] != null));
    if (chg(c)) return true;
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
  function bringToFront() {
    const id = canonId([...state.selected][0]); if (!id) return; const partners = overlapPartners(id); if (!partners.length) return;
    const R = reduce(activeOps()); let mx = 0; for (const p of partners) mx = Math.max(mx, effZ(p, R.zmap));
    commit({ t: "zorder", device: state.device, id, z: mx + 1 });
  }
  function sendToBack() {
    const id = canonId([...state.selected][0]); if (!id) return; const partners = overlapPartners(id); if (!partners.length) return;
    const R = reduce(activeOps()); let mn = 0; for (const p of partners) mn = Math.min(mn, effZ(p, R.zmap));
    commit({ t: "zorder", device: state.device, id, z: mn - 1 });
  }
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
    };
  }
  let lastSec = null;   // プリセットで直前に作った（複製・追加した）セクションの ID。@dup/@add が指す。
  async function runPreset(name) {
    reset(); lastSec = null;
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
    else if (step.act === "delCard") { const card = contentCards()[step.cardIndex]; if (card) delInstance("card_photo_" + card.id); }
    else if (step.act === "delRow") { const row = contentRows()[step.rowIndex]; if (row) delInstance("row_name_" + row.id); }
    else if (step.act === "dupRow") { const row = contentRows()[step.rowIndex]; if (row) duplicateRow(row.id); }
    else if (step.act === "moveToRef") { const r = g[step.ref]; if (r) { const y = (step.edge === "bottom" ? r.y + r.h : r.y) + step.off; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    else if (step.act === "moveCenterToRef") { const r = g[step.ref]; if (r) { const y = (step.edge === "bottom" ? r.y + r.h : r.y) + step.off - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y }), { snap: !!step.snap }); } }
    else if (step.act === "copyPaste") { selectMany([step.id]); copySelection(); paste(); }
    else if (step.act === "dup") { selectMany([step.id]); duplicate(); }
    else if (step.act === "reorderBetween") { const a = g[step.after], b = g[step.before]; if (a && b) { const y = (a.y + a.h + b.y) / 2 - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    else if (step.act === "reorderBefore") { const b = g[step.before]; if (b) { const y = b.y - g[step.id].h - 4; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    else if (step.act === "moveAddedToRowGap") { const R = reduce(activeOps()); const last = R.adds[R.adds.length - 1]; const rows = contentRows(); const r1 = g["row_name_" + rows[step.afterRow].id], r2 = g["row_name_" + rows[step.afterRow + 1].id]; if (last && r1 && r2) { const y = (r1.y + r1.h + r2.y) / 2; programMove([last.id], () => ({ x: g[last.id].x, y })); } }
    // --- W 用 ---
    else if (step.act === "select") { selectMany([step.id]); }
    else if (step.act === "zback") { sendToBack(); }
    else if (step.act === "zfront") { bringToFront(); }
    else if (step.act === "resetSection") { resetScope("section", step.sec === "feature" ? "F_h0" : "I_kanmi", [state.device]); }
    else if (step.act === "moveCenterToCenter") { const r = g[step.ref]; if (r) { const y = r.y + r.h / 2 + (step.off || 0) - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    else if (step.act === "moveCenterToGap") { const a = g[step.after], b = g[step.before]; if (a && b) { const y = (a.y + a.h + b.y) / 2 - g[step.id].h / 2; programMove([step.id], () => ({ x: g[step.id].x, y })); } }
    // --- Y 用（大きさ・選択）---
    else if (step.act === "resize") { selectMany([step.id]); programResize(step.id, step.handle, step.by[0], step.by[1]); }
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
    if (ids.length === 1) { const ro = reorderPreview(g2, ids[0], g); if (ro) { commit({ t: "reorder", device: state.device, key: ro.key, id: ids[0], order: ro.order }); return; } }
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
      out.push({ part, asset: asset || null, naturalW: nat ? nat.w : null, naturalH: nat ? nat.h : null, cleared, missing: !asset && !cleared, view: { x: +v.x.toFixed(4), y: +v.y.toFixed(4), zoom: +v.zoom.toFixed(4) }, viewOwn: v.own });
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

  const api = {
    reset, setDevice, geometry, sections, warnings, anchors: anchorsList, inputMode,
    ops: () => clone(activeOps()), presets, runPreset,
    select: (ids) => selectMany(Array.isArray(ids) ? ids : [ids]),
    edit: editApi, resetScope, undo, redo, layoutCount: () => layoutCount,
    applyOps, peek: (on) => (on ? peekOn() : peekOff()), zOrder: zOrderList,
    sizes: sizesList, guides: guidesList,
    photos: photosApi, cropState,       // §3 入口（見せる範囲の途中も読める）
    textStyles: textStylesApi,          // §12 入口（今の端末の文字の見た目）
    textSetSize, textStep, textToggleBold, textSetColor, resetTextStyle,  // §12 文字の見た目を変える
    textRuns: textRunsApi,              // §13 入口（文の一部の見た目＝切れ目の並び）
    sectionList: sectionListApi,        // §2 入口（今の並び順のセクション）
  };
  return {
    state, render, reset, setDevice, undo, redo, commit, api, reduce, activeOps,
    canonId, isDraggable, isText, REPEAT, groupOf, secOf, elNode, getScale: () => scale, isHeadingGroup, inputMode,
    sectionMove, sectionDelete, sectionAdd, sectionDuplicate, sectionCan,   // §2 セクションの操作
    beginDrag, dragMove, endDrag, isDragging: () => !!drag, selectOnly, toggleSel, selectMany, clearSel, selectSection, selectInDesignRect, smallHit,
    startEdit, commitEdit, nudge, nudgeSelected, deleteSelected, copySelection, cutSelection, paste, duplicate,
    resetScope, peekOn, peekOff, addTextAt, anchorsList, classify: (id) => M.classifyDrop(geometry(), id, [id]),
    bringToFront, sendToBack, hasOverlapPartner, zOrderList,
    beginResize, resizeMove, endResize, isResizing: () => !!rz, programResize, handlesFor,
    paintPhotos, photosApi, replacePhotoFile, loadImageFile, assetUrl, assetNat,
    beginCrop, cropState, cropPanStart, cropPanBy, cropCornerStart, cropCornerBy, cropZoomTo, cropWheel, cropCommit, cropCancel, isCropping, partChangedFromTemplate,
    quadFile, textFile,
    textSetSize, textStep, textToggleBold, textSetColor, resetTextStyle, textStylesApi, hasTextStyle,
    tsKeyOf, styleNameOf, primaryTextSel, SIZE_LIST,
    applyPartStyle, editingHasSelection, editingPartSizePx, boxSizePx, hasRuns, textRunsApi,   // §13
  };
})();
window.__playground = PG.api;
