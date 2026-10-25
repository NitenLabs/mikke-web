// 描画（セクションの入れ物・render・ページを移る・文字の見た目・倍率）
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// §2 複製・追加したセクションの HTML の ID を「セクションID__素のID」に付け替える（builder は素の ID を出すので出力を書き換える）。
// 足した部品（add_/addp_）はもともと一意なので付け替えない。付いていく先の @section/@abs も付け替えない。
function prefixIds(html, pfx) {
  html = html.replace(/data-(el|absid)="([^"]+)"/g, (mm, attr, v) => (isAdded(v) || v[0] === "~") ? mm : `data-${attr}="${pfx}${v}"`);   // J17「~ID」は移ってきた部品（付け替えない）
  html = html.replace(/data-anchor="([^"]+)"/g, (mm, v) => (v[0] === "@" || isAdded(v)) ? mm : `data-anchor="${pfx}${v}"`);
  return html;
}
// J17 別のセクションへ移した部品は、描くとき「~ID」の仮の名前で出す（移った先の素の ID とぶつからない・付け替えない）。描いた後に本当の ID に戻す
function unTildeIds(html) { return html.indexOf('"~') < 0 ? html : html.replace(/data-(el|absid)="~([^"]+)"/g, 'data-$1="$2"');
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
    let ref = prev ? prev.nextElementSibling : wrap.firstElementChild;
    while (ref && ref !== w && !ref.classList.contains("sec-wrap")) ref = ref.nextElementSibling;   // F31 間の＋・仮の一番上は飛ばす（毎回すべてのセクションを入れ直さない）
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

// F31 改行の測り（DOM で1文字ずつ測る・重い）の結果を、セクションごとに入力（箱の中身・端末・読み込めた書体）で覚えておく
const _hCache = new Map();
function buildHCached(sec, boxes, meas) {
  let fonts = ""; try { if (document.fonts) { let n = 0; document.fonts.forEach((f) => { if (f.status === "loaded") n++; }); fonts = document.fonts.status + n; } } catch (e) {}
  const key = fonts + "|" + JSON.stringify(boxes);
  const c = _hCache.get(sec); if (c && c.key === key) return c.H;
  const H = TEXT.buildH(boxes, meas, SPEC); _hCache.set(sec, { key, H }); if (_hCache.size > 400) _hCache.clear();
  return H;
}
// ---- 描画 ----
function render() {
  curGuides = []; curGuidesSec = null;                 // §2 目安の線は離したら消す（再描画で必ずリセット）
  const R = reduce(activeOps(), state.device, state.peek);
  state.secList = R.secList;                            // §2 今のページで見えるセクションの並び（undo/redo で再計算されたもの）
  state.secMap = R.secMap; state.secPageMap = R.secPageMap;   // 試験台28：ページごとの並び・セクション→ページ
  ensureHosts();                                        // §2 セクションの並びに合わせて host を用意
  const meas = document.getElementById("meas");
  const tsSig = JSON.stringify(R.textStyles || {});   // F31 文字の見た目は描いた後に当てる（消すときは作り直しが要る）
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
    const carriedHere = R.carried.filter((c) => c.section === sec);   // J17 ほかのセクションから移ってきた部品
    for (const c of carriedHere) if (c.kind !== "photo") boxes.push({ key: "~" + c.id, styleName: c.styleName, device: state.device, widthPx: c.w, text: c.text });
    // 箱の鍵（bare）→ グローバルの手直しの鍵（非 anchor は pfx を付ける。足した部品 add_ は素のまま。移ってきた部品「~ID」は ID そのもの）
    const lk = (k) => (k[0] === "~") ? k.slice(1) : ((pfx && !isAdded(k)) ? pfx + k : k);
    // §4：大きさを変えた文字は、その幅で改行を測り直す（表示幅と改行幅をそろえる）
    for (const b of boxes) { const s = R.sizes[lk(b.key)]; if (s && s.w != null) b.widthPx = s.w; }
    // §12：文字の見た目の手直しがあれば、改行の測りも手直し後の大きさ・太さで行う
    for (const b of boxes) { const ts = R.textStyles[lk(tsKeyBox(b.key))]; if (!ts) continue; if (ts.size && (ts.size.pc != null || ts.size.sp != null)) b.sizePx = effSize(b.styleName, b.device, ts).size; if (ts.weight != null) b.weightOv = ts.weight; if (ts.font != null) b.fontOv = SPEC.FONT[ts.font] || ts.font; }   // §19 箱の書体で改行を測る
    // §13：文の一部の見た目（runs）を当てる（箱の key → 部品 ID で引く）
    for (const b of boxes) { const rs = R.runsMap[lk(partIdOfBox(b.key))]; if (rs) b.runs = rs; }
    const H = buildHCached(sec, boxes, meas);   // F31 改行の測りは、箱（文字・幅・見た目）が変わったセクションだけやり直す
    let edits;
    // J17 移ってきた部品は足した部品と同じ絶対配置の層に「~ID」で出す。移っていった部品は元のセクションの流れから外す（消したときと同じ詰め方）
    const carriedSet = new Set(R.carriedIds);
    const pubMode = !!(state.preview || state._pubGeo);
    const carriedLocal = carriedHere.filter((c) => !(pubMode && c.kind === "photo" && (R.clear.includes(c.id) || !c.asset))).map((c) => ({ id: "~" + c.id, section: inst.type, kind: c.kind, styleName: c.styleName, w: c.w, h: c.h, anchor: c.anchor, gap: c.gap, x: c.x, asset: c.asset || "", cleared: c.kind === "photo" && (R.clear.includes(c.id) || !c.asset), padB: c.padB, html: c.kind !== "photo" ? (H.get("~" + c.id)?.html ?? c.text) : undefined }));
    const leftHere = R.carried.filter((c) => c.home === sec).map((c) => c.id);
    if (anchor) {   // anchor は従来どおり（素の ID・グローバルの手直しをそのまま渡す＝第1回までと1pxも変わらない）
      const m2x = carriedSet.size ? Object.fromEntries(Object.entries(R.m2).filter(([k]) => !carriedSet.has(k))) : R.m2;
      edits = { m1: R.m1, m2: m2x, added: [...R.added.map((a) => ({ ...a, html: a.kind !== "photo" ? (H.get(a.id)?.html ?? a.text) : undefined })), ...carriedLocal], remove: leftHere.length ? [...R.remove, ...leftHere] : R.remove, clear: R.clear, template: R.tpl, order: R.order, sizes: R.sizes };
    } else {        // 非 anchor：このインスタンスの手直しだけを素の鍵に戻して渡す。写真が無い枠は「まだない写真」＝薄い枠で描く。
      const strip = (k) => (k.startsWith(pfx) ? k.slice(pfx.length) : k);
      const pick = (map) => { const o = {}; for (const k of Object.keys(map)) if (secOf(k) === sec && !carriedSet.has(k)) o[strip(k)] = map[k]; return o; };
      const missingPhotos = [];
      if (inst.type === "feature") (R.secContent[sec].blocks || []).forEach((bl, i) => { if (!bl.photo || !bl.photo.asset) missingPhotos.push("F_p" + i); });
      else (R.secContent[sec].cards || []).forEach((cd) => { if (!cd.photo || !cd.photo.asset) missingPhotos.push("card_photo_" + cd.id); });
      const clearLocal = [...R.clear.filter((id) => secOf(id) === sec && !carriedSet.has(id)).map(strip), ...missingPhotos];
      const addedLocal = [...R.added.filter((a) => a.section === sec).map((a) => ({ ...a, section: inst.type, html: a.kind !== "photo" ? (H.get(a.id)?.html ?? a.text) : undefined })), ...carriedLocal];
      edits = { m1: pick(R.m1), m2: pick(R.m2), added: addedLocal, remove: [...R.remove.filter((id) => homeSec(id) === sec && !carriedSet.has(id)), ...leftHere].map(strip), clear: clearLocal, template: R.tpl, order: pick(R.order), sizes: pick(R.sizes) };
    }
    if (state.preview || state._pubGeo) { edits.keepX = [...(edits.clear || [])]; edits.remove = [...(edits.remove || []), ...(edits.clear || [])]; edits.clear = []; }   // F65 詰めた写真の横の場所は空けたまま（文の左右をずらさない）   // §22 §5 プレビュー/公開：写真のない枠は詰める（EMPTYFRAME を出さず流れから外す）
    if (inst.type === "items") { const cardsId = anchor ? "I_cards" : (pfx + "I_cards"); let cv = R.colsMap[cardsId] && R.colsMap[cardsId][state.device]; if (state.colsPreview && state.colsPreview.id === cardsId && state.colsPreview.device === state.device) cv = state.colsPreview.n; if (cv != null) edits.geom = { [state.device]: { cols: cv } }; }   // §20 列（仮表示を優先）
    if (inst.type === "feature") { const sw = R.swapMap[sec] && R.swapMap[sec][state.device]; if (sw) edits.swap = sw; }   // §5 左右入替
    // §20b §2.4 描画時クランプ：記録幅では値段が1行に入らない表を、表示だけ広い幅で描く（記録=edits.sizes には触らず transient な幅を差し込む）
    if (inst.type === "items" && state._tableDispW && state.device === "pc") { const tid = anchor ? "I_table" : (pfx + "I_table"); edits.sizes = Object.assign({}, edits.sizes, { [tid]: Object.assign({}, edits.sizes[tid], { w: state._tableDispW }) }); }
    edits.editMode = !(state.preview || state._pubGeo);   // 試験台28 §2.4：編集中だけ出ていない品を薄く出す（プレビュー/公開は詰める）
    const builder = { feature: M.buildFeature, items: M.buildItems, header: M.buildHeader, footer: M.buildFooter, menu: M.buildMenu, contact: M.buildContact, menuHdr: M.buildMenuHdr, contactHdr: M.buildContactHdr }[inst.type] || M.buildFeature;
    const out = builder(content, state.device, H, edits);
    const html = unTildeIds(pfx ? prefixIds(out.bodyHtml, pfx) : out.bodyHtml);
    // F31 中身が前と同じで、前の描き直しの後に誰も DOM を触っていなければ、作り直さない（変わったセクションだけ作り直す）
    const sig = html + "\u0001" + tsSig + "\u0001" + idx;
    if (!(host._rSig === sig && host._rSnap != null && host.innerHTML === host._rSnap)) host.innerHTML = html;
    host._rSig = sig;
    // §20b §2.4 広げるのは右へ（左端は動かさない）＝中央そろえ(margin:auto)を左端固定に上書き
    if (inst.type === "items" && state._tableDispW && state.device === "pc") { const tn = host.querySelector('#host_items [data-el="I_table"]') || host.querySelector('[data-el="I_table"]'); if (tn) { const dw = SPEC.DESIGN_W[state.device]; const recW = (R.sizes && R.sizes["I_table"] && R.sizes["I_table"].w != null) ? R.sizes["I_table"].w : 968; const tid = anchor ? "I_table" : (pfx + "I_table"); const mdx = (R.m1 && R.m1[tid] && R.m1[tid].dx) || 0; const ce = contentEdges();
        // PC-8・PC-9 左端は「流れの中のずれ（左の辺から縮めた分・動かした分）」も入れて測る。前は margin だけで測り、ずれの分（-148 など）だけページの左へはみ出した。中身の左端より左へは出さない
        const left = Math.max(ce.left, Math.min((dw - recW) / 2 + mdx, ce.right - state._tableDispW));
        tn.style.marginLeft = (left - mdx) + "px"; tn.style.marginRight = "0"; } }   // K15 右端に当たったら、残りは左へ広げる
    host._padBottom = out.padBottom;
    // §2.2 背景は並び順で（feature/items のみ）。試験台28：ヘッダー（見える並びの先頭）を除いたページ内の順で交互。新しいセクションは builder の背景を残す。
    if (inst.type === "feature" || inst.type === "items") { const s = host.querySelector("#sec"); if (s) s.style.background = SPEC.COLORS[secBgName(idx - 1)]; }
  });
  fillNav(R);           // 試験台28：ヘッダー・フッターのナビを今のページで組む（host の中身を作ったあと）
  applyTextStyles(R);   // §12：文字の箱まるごとの大きさ・太さ・色を当てる（実測・配置の前に）
  layoutScale();
  // §20b §2.4 記録幅では値段が1行に入らない表を、表示だけ広げて描き直す（記録は変えない）。まず右へ（左端固定）、中身の右端に当たったら残りは左へ。中身の幅いっぱいで頭打ち
  // K15（2026-10-25）：前は右へだけで頭打ちにしていて、一番狭くした表で値段の文字を大きくすると、中身の幅には収まるのに値段が2行になっていた
  if (!clampGuard && state.device === "pc") {
    const Rt = reduce(activeOps(), state.device);
    const recW = (Rt.sizes && Rt.sizes["I_table"] && Rt.sizes["I_table"].w != null) ? Rt.sizes["I_table"].w : 968;
    const ce = contentEdges(), cap = ce.right - ce.left;
    const dispW = +Math.min(Math.max(recW, tableFitW("pc")), cap).toFixed(2);
    const want = dispW > recW + 0.5 ? dispW : null;
    if (want !== (state._tableDispW || null)) { state._tableDispW = want; clampGuard = true; render(); clampGuard = false; return; }
  }
  placeAbsolute(R);
  decorate();
  renderFixedSections();   // §22 §7 仮の一番上・一番下（setFixedSections のときだけ）
  if (typeof onRender === "function") onRender();
  for (const inst of state.secList) { const host = document.getElementById(secHostId(inst)); if (host) host._rSnap = host.innerHTML; }   // F31 描き直しの後の形を覚える（次に同じなら作り直さない）
}

// ---- 試験台28：ページを移る（ヘッダー・フッターのナビ） ----
// ナビはページの名前から自動で作る（ダブルクリックでの書き換えはしない・§2.2）。押して離せば移る／ドラッグはしない（ナビ部品の移動は後続ステージ）。
function fillNav(R) {
  const wrap = document.getElementById("sectionwrap"); if (!wrap) return;
  const cur = (R && R.curPage) || state.page;
  const html = PAGES.map((p) => { const on = p.id === cur; return `<span class="navitem${on ? " on" : ""}" data-page="${p.id}" style="cursor:pointer;white-space:nowrap;color:${SPEC.COLORS.onDark};font-family:${SPEC.FONT.heading};font-weight:${on ? 700 : 500};opacity:${on ? 1 : 0.8}${on ? ";text-decoration:underline;text-underline-offset:6px" : ""}">${escH(p.label)}</span>`; }).join("");
  for (const navEl of wrap.querySelectorAll('[data-kind="nav"]')) {
    navEl.innerHTML = html;
    for (const sp of navEl.querySelectorAll(".navitem")) {
      sp.addEventListener("mousedown", (e) => { e.stopPropagation(); });   // 選択・ドラッグを始めない（押して離せば移る）
      sp.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setPage(sp.getAttribute("data-page")); });
    }
  }
}
// ページを移る（編集の中＝よそへは飛ばない）。移る前に書き換え・見せる範囲をふつうに終える。移ったらページの一番上・選択を外す（§2.2）。
function setPage(pg) {
  if (!PAGES.find((p) => p.id === pg) || state.page === pg) return false;
  if (state.editing) commitEdit();
  if (state.peek) peekOff();
  state.page = pg; state.selected = new Set(); state.selectedSection = null;
  render();
  try { window.scrollTo(0, 0); const wrap = document.getElementById("sectionwrap"); if (wrap) wrap.scrollTop = 0; } catch (e) {}
  if (typeof onRender === "function") onRender();
  return true;
}
const currentPage = () => state.page;

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
      if (ts.italic != null) el.style.fontStyle = ts.italic ? "italic" : "normal";   // J4・P27 箱まるごとの斜体・下線、P11 揃え（両端末で共通）
      if (ts.underline != null) el.style.textDecoration = ts.underline ? "underline" : "none";
      if (ts.align != null) el.style.textAlign = ts.align;
    }
  }
  a1KeepEmptyText();   // J10 空にした見出し・品名などは1行分の高さを残す（text-style.js）
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
    const cs = getComputedStyle(stage);   // F19 clientWidth は左右の余白（12px）を含む。余白とセクションの枠（1px×2）を引いて、窓から横にはみ出さない
    scale = Math.min(1, (stage.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 2) / dw);
  }
  const pageW = dw * scale;
  const centered = phone && pageW <= stage.clientWidth + 0.5;   // 画面の方が広い＝中央に置き左右に同じ余白
  document.body.classList.toggle("pg-xscroll", overflowX);
  const hs = [];   // F31 先に全部のセクションへ書き、まとめて測り、まとめて高さを書く（1つずつ測ると、セクションの数だけ配置の計算がやり直しになる）
  for (const inst of state.secList) {
    const host = document.getElementById(secHostId(inst)); if (!host) continue; const s = host.querySelector("#sec"); if (!s) continue;
    s.style.width = dw + "px";
    if (SCALE_MODE === "zoom") { s.style.transform = ""; s.style.transformOrigin = ""; s.style.zoom = scale; }   // §25 §2.3 B：CSS の zoom で縮める
    else { s.style.zoom = ""; s.style.transformOrigin = "top left"; s.style.transform = "scale(" + scale + ")"; }   // A：見た目だけ縮める
    host.style.width = pageW + "px";
    host.style.margin = centered ? "0 auto" : "";
    hs.push([host, s]);
  }
  const hts = hs.map(([, s]) => s.getBoundingClientRect().height);
  hs.forEach(([host], i) => { host.style.height = hts[i] + "px"; });
}
// §25 §2.1 画面を回した・窓の幅が変わったとき：倍率を決め直して描き直す。中身（innerHTML）は作り直さない＝
//   書き換え中の文字・カーソル・選んでいる部品を保つ。データ（draft）も変わらない（位置・大きさは 390 の px のまま）。
function relayout() {
  layoutScale();
  if (!state.editing && !composing) decorate();   // つまみの見た目・位置を新しい倍率で取り直す（編集中は触らない）
  renderFixedSections();
}

// 絶対配置（M2・足した部品）の top/left を入れ、セクションを必要なら伸ばす（§1.1）。IME 変換中は呼ばない。
