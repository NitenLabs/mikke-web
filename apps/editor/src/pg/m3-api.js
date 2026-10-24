// API につなぐ（M3）：写真を上げたら ④ の ID に付け替える・公開（PG.buildPublishBundle → 写真 → POST /publish）・版から戻す。
// 保存先が ApiStore（lib/api-store.js。saveStore.kind === "api"）のときだけ働く。LocalStore のときは何もしない。
// 線：M3｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）。名前は m3 で始める。
const m3IsApi = () => saveStore.kind === "api";
const m3Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ApiStore に渡す口（store-save.js の boot から saveStore.attach で）
function m3Hooks() { return { isTemplateAsset: (id) => id in TEMPLATE_ASSETS, swapAsset: m3SwapAsset }; }
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
  conflict: "ほかで変更されました。読み込み直してから公開してください",
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
