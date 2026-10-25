// 保存（自動保存・別タブ・版の一覧）。保存先は lib/store.js の saveStore
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ===================== §24（試験台24）保存（IndexedDB・自動保存）：今の形（4.9＋_pg）を保存する =====================
// 鍵は draft（今の形）／versions（版ごとに今の形）／assets（写真 ID→データ・5.2）／settings（編集の設定・最近使った色）。
// 保存先は lib/store.js の saveStore（今は LocalStore＝IndexedDB「mikke-editor」）。ここは name・open・get・put だけを使う。
const TEMPLATE_ASSETS = (typeof PHOTOS_JSON !== "undefined") ? PHOTOS_JSON : {};
let _db = null, _saveTimer = null, _saveStatus = "saved", _lastSavedAt = null, _simErr = false, _verSeq = 1;
// J25 別タブの保存を知る（localStorage の版番号＋storage イベント）。J28 閉じる直前の保存待ちの見張り。
const SEQ_KEY = saveStore.name + ":seq";
let _mySeq = 0, _conflict = false, _onExternalConflict = null;
function readSeq() { try { return +localStorage.getItem(SEQ_KEY) || 0; } catch (e) { return 0; } }
function bumpSeq() { try { _mySeq = Math.max(readSeq(), _mySeq) + 1; localStorage.setItem(SEQ_KEY, String(_mySeq)); } catch (e) {} }
function hasPendingSave() { return _saveTimer != null || _saveStatus === "saving" || _saveStatus === "error"; }   // J28 まだ書き出していない手直しがある
function flushPendingSave() { if (_saveTimer || _saveStatus !== "saved") { if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; } doSave(); } }   // J26/J28 pagehide 等ですぐ書き出す
const initialVersions = () => [{ id: "initial", kind: "initial", at: null, draft: null }];   // §6 最初の形は中身を持たない（null＝テンプレートのまま）
let _versions = initialVersions();
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
  // SP-4 戻す・やり直すで戻ってくる写真（記録の列・見ている版の退避・やり直しの先）は、保存の入れ物には入れないがページの中からは消さない（消すと灰色の仮の箱になり、そのまま保存されて戻らなかった）
  const keepMem = new Set(ref); const scanMem = (d) => { if (!d) return; const s = JSON.stringify(d); for (const id in ASSET) if (!(id in TEMPLATE_ASSETS) && s.indexOf('"' + id + '"') >= 0) keepMem.add(id); };
  scanMem(state.ops); scanMem(state.restoreUndo && state.restoreUndo.ops); if (state.viewBackup) { scanMem(state.viewBackup.base); scanMem(state.viewBackup.ops); } if (state.restoreRedo && state.restoreRedo.fwd) { scanMem(state.restoreRedo.fwd.ops); scanMem(state.restoreRedo.fwd.base); }
  for (const id in ASSET) if (!(id in TEMPLATE_ASSETS) && !keepMem.has(id)) { delete ASSET[id]; delete ASSET_NAT[id]; }
  const out = {}; for (const id of ref) if (ASSET[id]) out[id] = ASSET[id]; return out;
}
async function doSave() {
  _saveTimer = null;
  // J25 別タブが先に保存していたら、古い形で上書きしない＝書かずに知らせ、読み込み直しを促す
  if (readSeq() > _mySeq) { _conflict = true; if (typeof _onExternalConflict === "function") _onExternalConflict(); if (typeof onRender === "function") onRender(); return; }
  try {
    if (_simErr) throw new Error("sim"); if (!_db) _db = await saveStore.open();
    const draft = serializeDraft(); const shop = currentShop(); const assets = gcAssets(draft, shop);   // 試験台26：① の下書きも一緒に保存（同じ 500ms）
    await saveStore.put(_db, "draft", draft); await saveStore.put(_db, "shop", shop); await saveStore.put(_db, "versions", _versions);
    await saveStore.put(_db, "assets", assets); await saveStore.put(_db, "settings", { recentColors: state.recentColors });
    _saveStatus = "saved"; _lastSavedAt = Date.now(); bumpSeq();   // J25 保存した版番号を上げて他タブに知らせる
  }
  catch (e) { if (e && e.conflict) { _conflict = true; if (typeof _onExternalConflict === "function") _onExternalConflict(); if (typeof onRender === "function") onRender(); return; }   // M3 サーバーで版がぶつかった（409）＝別タブと同じ扱い
    _saveStatus = "error"; _saveTimer = setTimeout(doSave, 3000); }   // §2.6 失敗＝状態をオレンジに／J27 間を空けて自動で保存し直す
  if (typeof onRender === "function") onRender();
  for (const id in collectAssets()) ensureNat(id);
}
async function boot() {
  try {
    if (saveStore.attach) saveStore.attach(m3Hooks());   // M3 ApiStore に写真の付け替えなどの口を渡す（pg/m3-api.js）
    _db = await saveStore.open();
    const vs = await saveStore.get(_db, "versions"); if (Array.isArray(vs) && vs.length) { _versions = vs; _verSeq = Math.max(_verSeq, ...vs.map((v) => (+String(v.id).replace(/\D/g, "") || 0))) + 1; }
    const assets = await saveStore.get(_db, "assets"); if (assets) for (const id in assets) ASSET[id] = assets[id];
    const st = await saveStore.get(_db, "settings"); if (st && Array.isArray(st.recentColors)) state.recentColors = st.recentColors.slice(0, 5);
    const sh = await saveStore.get(_db, "shop"); if (sh) state.shopBase = sh;   // 試験台26：① の下書きを復元
    const d = await saveStore.get(_db, "draft"); if (d) applyDraftData(d);
    recomputeShopSeq(state.shopBase || SHOP_JSON);   // 連番は ① の中の ID の最大から続ける
  } catch (e) {}
  s_bootSafety();
  // J25 この画面が知っている版番号を覚え、他タブが保存したら（storage イベント）知らせる
  _mySeq = readSeq();
  try { window.addEventListener("storage", (e) => { if (e.key !== SEQ_KEY) return; const n = +e.newValue || 0; if (n > _mySeq && hasPendingSave()) { _conflict = true; if (typeof _onExternalConflict === "function") _onExternalConflict(); if (typeof onRender === "function") onRender(); } }); } catch (_) {}
  render(); for (const id in collectAssets()) ensureNat(id);
}
// PC-1 読み込みで落ちない：下書きが描けない（例外）なら、その下書きを履歴の「戻す前の下書き」に残し、描ける一番新しい公開版（無ければ最初の形）から開く。
// 店主には知らせ、その版は履歴から「見る」「この版を下書きにする」で取り戻せる（描けるところまで。描けない版は開かずに知らせる）
let _bootNotice = null;
function s_drawable(b, shopB) { const sb = state.base, sh = state.shopBase, so = state.ops, sc = state.cursor; state.base = b; state.shopBase = shopB; state.ops = []; state.cursor = 0;
  try { reduce([], "pc"); reduce([], "sp"); foldToDraft(); return true; } catch (e) { return false; } finally { state.base = sb; state.shopBase = sh; state.ops = so; state.cursor = sc; } }
function s_bootSafety() {
  if (!state.base || s_drawable(state.base, state.shopBase)) return;
  const broken = state.base, brokenShop = state.shopBase;
  _versions.push({ id: "b" + (_verSeq++), kind: "beforeRestore", at: Date.now(), draft: broken, shop: brokenShop, broken: true });
  const pubs = _versions.filter((v) => v.kind === "published" && v.draft).reverse(); const ok = pubs.find((v) => s_drawable(v.draft, v.shop || null));
  applyDraftData(ok ? ok.draft : null); state.shopBase = ok ? (ok.shop || null) : brokenShop; recomputeShopSeq(state.shopBase || SHOP_JSON);
  _bootNotice = "下書きの一部が読み込めなかったので、" + (ok ? "一番新しい公開版" : "最初の形") + "から開きました。それまでの下書きは履歴の「戻す前の下書き」に残しています";
  scheduleSave();
}
// SP-3（J25 の続き）別のタブが先に保存した：知らせだけでは、その後の手直しが保存されずに消えていた。
// M3b（ApiStore のぶつかったときの箱）と同じく、店主が「ほかのタブの変更を読み込む」か「自分の直しで上書きする」を選ぶ。
// 選ばなかった方は履歴の「戻す前の下書き」に残す（あとから戻せる）。版の一覧は保存先にある新しい方を読み、そこへ足す
let _resolvingLocal = false;
async function s_resolveLocalConflict(choice) {
  if (!_conflict || _resolvingLocal || (choice !== "theirs" && choice !== "mine")) return { ok: false, message: "" };
  _resolvingLocal = true;
  try {
    if (state.editing) commitEdit();
    if (state.viewing) exitView();
    if (!_db) _db = await saveStore.open();
    const mine = { draft: currentDraft(), shop: currentShop() };
    const d = await saveStore.get(_db, "draft"), sh = await saveStore.get(_db, "shop"), vs = await saveStore.get(_db, "versions"), assets = await saveStore.get(_db, "assets");
    if (assets) for (const id in assets) if (!ASSET[id]) ASSET[id] = assets[id];
    if (Array.isArray(vs) && vs.length) { _versions = vs; _verSeq = Math.max(_verSeq, ...vs.map((v) => (+String(v.id).replace(/\D/g, "") || 0))) + 1; }
    const same = canonJSON(mine.draft || null) === canonJSON(d || null) && canonJSON(mine.shop || null) === canonJSON(sh || null);
    const keep = (draft, shop) => { if (same) return;   // 選ばなかった方を「戻す前の下書き」に（同じ中身なら残さない）
      _versions.push({ id: "b" + (_verSeq++), kind: "beforeRestore", at: Date.now(), draft: draft || null, shop: shop || null });
      const brs = _versions.filter((x) => x.kind === "beforeRestore"); if (brs.length > 10) { const drop = new Set(brs.slice(0, brs.length - 10)); _versions = _versions.filter((x) => !drop.has(x)); } };
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    if (choice === "theirs") {
      keep(mine.draft, mine.shop);
      state.viewing = null; state.viewBackup = null; state.restoreUndo = null;
      state.shopBase = sh || null; applyDraftData(d || null); recomputeShopSeq(state.shopBase || SHOP_JSON);
      state.selected = new Set(); state.selectedSection = null; state.editing = null;
    } else keep(d, sh);
    _mySeq = readSeq(); _conflict = false;
    render(); for (const id in collectAssets()) ensureNat(id);
    await doSave();
    if (typeof onRender === "function") onRender();
    return { ok: !_conflict };
  } catch (e) { return { ok: false, message: "うまくいきませんでした。もう一度お試しください" }; }
  finally { _resolvingLocal = false; }
}
function bootNotice() { const n = _bootNotice; _bootNotice = null; return n; }
function currentPublished() { const p = _versions.filter((v) => v.kind === "published"); return p.length ? p[p.length - 1] : null; }
function draftSig() { return canonJSON(currentDraft()); }   // §6 今の形を、鍵をそろえた文字列で
function publishedEqual() { const p = currentPublished(); if (!p || !p.draft) return false; return canonJSON(p.draft) === draftSig() && canonJSON(p.shop || null) === canonJSON(currentShop()); }   // §3.2 ①②の両方を比べる・一度も公開していなければ false・「直してから元どおり」で一致
function statusLabel() {
  if (_conflict) return saveStore.conflictLabel || "ほかのタブで変更されました。どちらを残すか選んでください";   // J25（M3 API のときは「ほかで変更されました」）
  if (_saveStatus === "saving") return "保存しています…";
  if (_saveStatus === "error") return "保存できませんでした。インターネットのつながりを確かめてください";
  const p = currentPublished(); if (!p) return "まだ公開していません";
  return publishedEqual() ? "公開中と同じです" : "まだ公開していない変更があります";
}
function saveState() { return { status: _saveStatus, conflict: _conflict, label: statusLabel(), publishedEqual: publishedEqual(), lastSavedAt: _lastSavedAt }; }
function simulateSaveError(on) { _simErr = !!on; }
function setExternalConflictHandler(fn) { _onExternalConflict = fn; }   // J25 WIRING から知らせの出し方を渡す
// §4.3 公開：今の形を「公開した版」として履歴へ。公開した版は新しい方から30まで。最初の形は常に持つ。
function publish(opts) {
  if (m3IsApi()) return m3Publish(opts);   // M3 API に公開（Promise。pg/m3-api.js）
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

