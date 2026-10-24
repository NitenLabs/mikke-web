// API につなぐ（M3）：写真を上げたら ④ の ID に付け替える・公開（PG.buildPublishBundle → 写真 → POST /publish）・版から戻す。
// 保存先が ApiStore（lib/api-store.js。saveStore.kind === "api"）のときだけ働く。LocalStore のときは何もしない。
// 線：M3｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）。名前は m3 で始める。
const m3IsApi = () => saveStore.kind === "api";
const m3Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ApiStore に渡す口（store-save.js の boot から saveStore.attach で）
function m3Hooks() {
  return {
    isTemplateAsset: (id) => id in TEMPLATE_ASSETS, swapAsset: m3SwapAsset,
    snapshot: () => { if (state.editing) commitEdit(); return { draft: currentDraft(), shop: currentShop() }; },   // M3b ログインが切れたときに手元へ退避する中身
    scheduleSave: () => scheduleSave(),                                                                          // M3b 読み込み直して退避した下書きを出したとき
    onRelogin: (on) => { _m3Relogin = !!on; if (!on && _saveStatus === "error") flushPendingSave(); if (typeof onRender === "function") onRender(); },
  };
}
let _m3Relogin = false;
// 写真を上げ終わった：編集画面の写真 ID（img_…）を ④ の ID（ast_…）に付け替える。
// 見た目は同じ（中身は今のブラウザの中のデータのまま）なので描き直さない。下書き・記録・版・戻す前の下書きの中の ID を全部替え、保存し直す
function m3SwapAsset(from, to) {
  if (!from || !to || from === to) return;
  if (!ASSET[to] && ASSET[from]) ASSET[to] = ASSET[from];
  if (!ASSET_NAT[to] && ASSET_NAT[from]) ASSET_NAT[to] = ASSET_NAT[from];
  const seen = new Set();
  const walk = (o) => {
    if (!o || typeof o !== "object" || seen.has(o)) return; seen.add(o);
    for (const k of Object.keys(o)) { const v = o[k]; if (v === from) o[k] = to; else if (v && typeof v === "object") walk(v); }
  };
  walk(state.base); walk(state.shopBase); walk(state.ops); walk(state.viewBackup); walk(state.restoreUndo); walk(_versions);
  scheduleSave();
}
// 「この版を下書きにする」の後（publish.js の restoreVersion から）。サーバーの戻す道も通す（戻す前の下書きがサーバーにも残るように）
function m3OnRestore(v) {
  if (!m3IsApi() || !v) return;
  const last = _versions[_versions.length - 1];
  const entry = (last && last.kind === "beforeRestore" && !last.apiBackupId && last.at && Date.now() - last.at < 5000) ? last : null;
  const pre = state.restoreUndo ? { draft: state.restoreUndo.draft, shop: state.restoreUndo.shopDraft } : null;
  const theme = v.apiTheme;
  if (v.apiNumber) saveStore.queueRestore({ number: v.apiNumber, entry, pre, theme, draft: v.draft || undefined, shop: v.shop || undefined });
  else if (v.apiBackupId) saveStore.queueRestore({ backupId: v.apiBackupId, entry, pre, theme, draft: v.draft || undefined, shop: v.shop || undefined });
}
// 保存が落ち着くのを待つ（まだ書き出していない手直しはすぐ書き出す）。"ok"・"conflict"・"error"
async function m3Settle(ms) {
  const t0 = Date.now(); let lastFlush = 0;
  while (Date.now() - t0 < (ms || 20000)) {
    if (_conflict) return "conflict";
    if (!_saveTimer && _saveStatus === "saved") return "ok";
    if (_saveTimer && Date.now() - lastFlush > 800) { lastFlush = Date.now(); flushPendingSave(); }
    await m3Sleep(40);
  }
  return _saveStatus === "error" ? "error" : "timeout";
}
const M3_MSG = {
  conflict: "ほかの端末で変更されました。どちらを残すか選んでから公開してください",
  save: "保存できていないので公開できません。つながりを確かめてもう一度お試しください",
  photo: "写真を上げられませんでした。つながりを確かめてもう一度お試しください",
};
/**
 * 公開（API）。Promise で { ok:true, url, number } か { ok:false, message, conflict? } を返す。
 * 1 保存を落ち着かせる 2 上げている写真を待つ 3 PG.buildPublishBundle 4 まだ上げていない写真があれば上げて作り直す
 * 5 POST /publish（描いたときの下書きの版つき。違えば 409） 6 公開した版を履歴に足す
 */
async function m3Publish() {
  if (state.editing) commitEdit();
  const fail = (message, extra) => ({ ok: false, message, ...(extra || {}) });
  const settle = async () => { const s = await m3Settle(); if (s === "conflict") return fail(M3_MSG.conflict, { conflict: true }); if (s !== "ok") return fail(M3_MSG.save); return null; };
  let f = await settle(); if (f) return f;
  try { await saveStore.waitUploads(); } catch (e) { return fail(M3_MSG.photo); }
  f = await settle(); if (f) return f;
  let bundle = null;
  for (let round = 0; round < 3; round++) {
    let assets; try { assets = await saveStore.listAssets(); } catch (e) { return fail(M3_MSG.save); }
    const origin = String(saveStore.publicUrl || "").replace(/\/+$/, "") || undefined;
    bundle = await buildPublishBundle({ assets, origin });
    const left = bundle.meta.unuploadedAssets || [];
    if (!left.length) break;
    try { for (const id of left) { const u = bundle.meta.localAssets[id]; if (!u) return fail(M3_MSG.photo); await saveStore.uploadNow(id, u); } }
    catch (e) { return fail(M3_MSG.photo); }
    f = await settle(); if (f) return f;
    bundle = null;
  }
  if (!bundle) return fail(M3_MSG.photo);
  f = await settle(); if (f) return f;
  const draft = currentDraft(), shop = currentShop();
  if (!saveStore.isSaved(draft, shop)) { scheduleSave(); f = await settle(); if (f) return f; }
  let res;
  try { res = await saveStore.publish(bundle); }
  catch (e) {
    if (e && e.status === 409) { _conflict = true; if (typeof onRender === "function") onRender(); return fail(M3_MSG.conflict, { conflict: true }); }
    if (e && e.network) return fail("つながらないので公開できませんでした。つながりを確かめてもう一度お試しください");
    return fail((e && e.message && !/^HTTP /.test(e.message)) ? e.message : "公開できませんでした。少し待ってからもう一度お試しください");
  }
  _versions.push({ id: "v" + res.number, kind: "published", at: Date.parse(res.publishedAt) || Date.now(), draft, shop, apiNumber: res.number });
  const pubs = _versions.filter((x) => x.kind === "published");
  if (pubs.length > 30) { const drop = new Set(pubs.slice(0, pubs.length - 30)); _versions = _versions.filter((x) => !drop.has(x)); }
  if (typeof onRender === "function") onRender();
  return { ok: true, url: res.url, number: res.number };
}

// ===================== M3b ぶつかったとき（409）の選び方 =====================
// 「ほかの変更を読み込む」：今の自分の直しを「戻す前の下書き」として API に残し、サーバーの今の下書きを読み込む（読み込み直しと同じ形）。
// 「自分の直しで上書きする」：サーバーの今の下書きを「戻す前の下書き」として残し、今のサーバーの版番号で自分の直しを送り直す。
// どちらも、選ばなかった方は履歴（公開の履歴の帯）の「戻す前の下書き」から戻せる。答え {ok:true} か {ok:false, message}
let _m3Resolving = false;
async function m3ResolveConflict(choice) {
  if (!m3IsApi() || !_conflict || _m3Resolving) return { ok: false, message: "" };
  if (choice !== "theirs" && choice !== "mine") return { ok: false, message: "" };
  _m3Resolving = true;
  try {
    if (state.editing) commitEdit();
    if (state.viewing) exitView();
    const mine = { draft: currentDraft(), shop: currentShop() };
    const cur = await saveStore.fetchDrafts();
    const curTheme = cur.site.data ? cur.site.data.theme : undefined;
    if (choice === "theirs") {
      const site = curTheme !== undefined ? { draft: mine.draft, theme: curTheme } : { draft: mine.draft };
      await saveStore.keepBackup({ site, shop: mine.shop });
      saveStore.adoptServer(cur);
      if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
      state.viewing = null; state.viewBackup = null; state.restoreUndo = null;
      state.shopBase = cur.shop.data || null;
      applyDraftData(cur.site.data ? cur.site.data.draft : null);
      recomputeShopSeq(state.shopBase || SHOP_JSON);
      state.selected = new Set(); state.selectedSection = null; state.editing = null;
      const assets = await saveStore.get(_db, "assets"); if (assets) for (const id in assets) if (!ASSET[id]) ASSET[id] = assets[id];
      await saveStore.clearStash();
      _conflict = false; _saveStatus = "saved"; _lastSavedAt = Date.now();
    } else {
      const body = {}; if (cur.site.data) body.site = cur.site.data; if (cur.shop.data) body.shop = cur.shop.data;
      if (body.site || body.shop) await saveStore.keepBackup(body);
      saveStore.adoptVersions(cur);
      _conflict = false;
    }
    try { const vs = await saveStore.get(_db, "versions"); if (Array.isArray(vs) && vs.length) _versions = vs; } catch (e) {}   // 残した「戻す前の下書き」を履歴に
    if (choice === "theirs") { render(); for (const id in collectAssets()) ensureNat(id); }
    else scheduleSave();
    if (typeof onRender === "function") onRender();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e && e.network ? "つながりません。インターネットのつながりを確かめて、もう一度お試しください" : "うまくいきませんでした。少し待ってからもう一度お試しください" };
  } finally { _m3Resolving = false; }
}
// 画面のつなぎ（ui/m3-api.ui.js）から使う口。PG.m3
const m3Api = {
  isApi: m3IsApi,
  resolveConflict: m3ResolveConflict,
  settle: (ms) => m3Settle(ms),
  relogin: () => _m3Relogin,
};
