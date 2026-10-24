// ApiStore：保存先を apps/api（サーバー）にする（M3）。LocalStore と同じ口（name・open・get・put）で、
// pg/store-save.js からは同じに見える。加えて、写真を上げる・公開する・版から戻すための口を持つ（pg/m3-api.js が使う）。
//
// 鍵と API（apps/api/README.md「API の一覧」）
//   draft    ②③ の下書きの ② ＝ GET/PUT /api/shops/:id/drafts/site の data.draft（③ theme は読んだまま送り返す）
//   shop     ① の下書き      ＝ GET/PUT /api/shops/:id/drafts/shop
//   settings 編集の設定      ＝ GET/PUT /api/shops/:id/settings（最近使った色）
//   versions 版の一覧        ＝ GET /versions・/versions/:n（公開した版）と /backups・/backups/:id（戻す前の下書き）を、
//                              編集画面の形 [{id, kind, at, draft, shop}] にして返す。put は何もしない（版はサーバーが作る）
//   assets   写真            ＝ GET /assets（④）を「ID → 編集画面で見る道」にして返す。put で、まだ上げていない写真
//                              （編集画面の img_…＝ブラウザの中のデータ）を上げ、上がったら hooks.swapAsset で ④ の ID に付け替える
// 下書きの保存は If-Match に読んだ版番号。409 は err.conflict（store-save.js が「ほかで変更されました」を出す）。
// 書き込みは1本ずつ（前の保存が終わってから次。同じ版番号で2つ送って自分どうしでぶつからないように）。
import { showLogin, verifyLinkToken } from "./login.js";
import { buildUploadForm } from "./photo-upload.js";

const CONFIG_KEY = "mikke-api-config";

export function ApiStore(cfg) {
  const api = String(cfg.api).replace(/\/+$/, "");
  let shopId = cfg.shop || null;
  const ver = { shop: null, site: null };            // 読んだ（保存した）版番号。null＝まだ読めていない（保存しない）
  const last = { shop: undefined, site: undefined, settings: undefined };   // 最後にサーバーと同じだった中身（JSON の文字）
  let theme;                                          // ③（編集画面は直さない。読んだものを送り返す）
  let queue = Promise.resolve();
  let pendingRestore = null;
  const uploads = {};                                 // 編集画面の写真 ID → 上げている Promise（④ の ID）
  let hooks = {};
  let me = null, shopInfo = null, opened = null;

  const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

  async function req(method, path, { json, body, headers = {}, ifMatch } = {}) {
    const h = { ...headers };
    if (json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(json); }
    if (ifMatch != null) h["If-Match"] = `"${ifMatch}"`;
    let res;
    try { res = await fetch(api + path, { method, body, headers: h, credentials: "include" }); }
    catch (e) { const er = new Error("つながりません"); er.network = true; throw er; }
    let data = null;
    if ((res.headers.get("content-type") || "").includes("json")) data = await res.json().catch(() => null);
    if (!res.ok) {
      const er = new Error((data && data.message) || ("HTTP " + res.status));
      er.status = res.status; er.code = data && data.error; er.data = data;
      if (res.status === 409 && er.code === "conflict") er.conflict = true;
      throw er;
    }
    return data;
  }
  const sp = (p) => `/api/shops/${encodeURIComponent(shopId)}${p}`;
  const fileUrl = (id) => api + sp(`/assets/${encodeURIComponent(id)}/file`);

  async function putDraft(kind, data) {
    const s = JSON.stringify(data);
    if (s === last[kind]) return;
    if (ver[kind] == null) throw new Error("下書きをまだ読めていません");
    const body = kind === "site" ? (theme !== undefined ? { draft: data, theme } : { draft: data }) : data;
    const r = await req("PUT", sp(`/drafts/${kind}`), { json: body, ifMatch: ver[kind] });
    ver[kind] = r.version; last[kind] = s;
  }
  // 「この版を下書きにする」：置き換える前の下書きを先に保存し（サーバーが「戻す前の下書き」に正しく写せるように）、
  // サーバーの戻す道を呼ぶ。そのあと store-save.js の保存が、戻した中身を同じに書く（同じなら送らない）
  async function runRestore(r) {
    if (r.pre) { await putDraft("site", r.pre.draft); await putDraft("shop", r.pre.shop); }
    const path = r.backupId ? sp(`/backups/${encodeURIComponent(r.backupId)}/restore`) : sp(`/versions/${r.number}/restore`);
    const json = r.backupId ? { siteDraftVersion: ver.site, shopDraftVersion: ver.shop } : { siteDraftVersion: ver.site, includeShop: true, shopDraftVersion: ver.shop };
    const res = await req("POST", path, { json });
    if (res.drafts && res.drafts.site) ver.site = res.drafts.site.version;
    if (res.drafts && res.drafts.shop) ver.shop = res.drafts.shop.version;
    if (r.theme !== undefined) theme = r.theme;
    last.site = r.draft !== undefined ? JSON.stringify(r.draft) : undefined;
    last.shop = r.shop !== undefined ? JSON.stringify(r.shop) : undefined;
    if (r.entry && res.backupId) r.entry.apiBackupId = res.backupId;
  }

  async function loadVersions() {
    const out = [{ id: "initial", kind: "initial", at: null, draft: null }];
    const vl = (await req("GET", sp("/versions"))).versions || [];
    const full = await Promise.all(vl.map((v) => req("GET", sp(`/versions/${v.number}`))));
    full.sort((a, b) => a.number - b.number);
    let maxN = 0;
    for (const v of full) {
      maxN = Math.max(maxN, v.number);
      out.push({ id: "v" + v.number, kind: "published", at: Date.parse(v.publishedAt) || null, draft: (v.site && v.site.draft) || null, shop: v.shop || null, apiNumber: v.number, apiTheme: v.site ? v.site.theme : undefined });
    }
    const bl = (await req("GET", sp("/backups"))).backups || [];
    const bfull = await Promise.all(bl.map((b) => req("GET", sp(`/backups/${encodeURIComponent(b.id)}`))));
    bfull.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    let k = maxN;
    for (const b of bfull) out.push({ id: "b" + (++k), kind: "beforeRestore", at: Date.parse(b.createdAt) || null, draft: (b.site && b.site.draft) || null, shop: b.shop || null, apiBackupId: b.id, apiTheme: b.site ? b.site.theme : undefined });
    return out;
  }

  function startUpload(id, dataUrl) {
    if (uploads[id]) return uploads[id];
    const p = (async () => {
      const form = await buildUploadForm(dataUrl, id);
      const r = await req("POST", sp("/assets"), { body: form });
      store.assets[r.id] = r;
      if (typeof hooks.swapAsset === "function") hooks.swapAsset(id, r.id, r);
      return r.id;
    })();
    uploads[id] = p;
    p.catch(() => { if (uploads[id] === p) delete uploads[id]; });   // 失敗したら次の保存でまた上げる
    return p;
  }

  const store = {
    kind: "api", api,
    name: "mikke-api:" + api + ":" + (shopId || ""),
    conflictLabel: "ほかで変更されました。読み込み直してください",
    assets: {},                     // ④（GET /assets の assets と、上げたもの）
    get shopId() { return shopId; },
    get user() { return me && me.user; },
    get shop() { return shopInfo; },
    get publicUrl() { return shopInfo && shopInfo.publicUrl; },
    get draftVersions() { return { shop: ver.shop, site: ver.site }; },
    attach(h) { hooks = h || {}; },
    open() {
      if (!opened) opened = (async () => {
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify({ api, shop: shopId })); } catch (e) {}   // メールのリンク（/login#t=…。URL に ?api= が無い）で来たときに使う
        await verifyLinkToken(req);                                  // /login#t=… のリンクで来たとき
        try { me = await req("GET", "/api/me"); }
        catch (e) { if (e.status !== 401) throw e; await showLogin(req); me = await req("GET", "/api/me"); }
        if (!shopId) shopId = me.shops && me.shops[0] ? me.shops[0].id : null;
        if (!shopId) throw new Error("このアカウントで直せるお店がありません");
        shopInfo = await req("GET", sp(""));
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify({ api, shop: shopId })); } catch (e) {}
        return { api, shopId };
      })();
      return opened;
    },
    async get(_h, key) {
      if (key === "draft") { const r = await req("GET", sp("/drafts/site")); ver.site = r.version; theme = r.data ? r.data.theme : undefined; const d = r.data ? r.data.draft : undefined; last.site = d !== undefined ? JSON.stringify(d) : undefined; return d; }
      if (key === "shop") { const r = await req("GET", sp("/drafts/shop")); ver.shop = r.version; const d = r.data == null ? undefined : r.data; last.shop = d !== undefined ? JSON.stringify(d) : undefined; return d; }
      if (key === "settings") { const r = await req("GET", sp("/settings")); last.settings = JSON.stringify(r || {}); return r; }
      if (key === "versions") return loadVersions();
      if (key === "assets") {
        const r = await req("GET", sp("/assets")); const all = (r && r.assets) || {}; const out = {};
        for (const id in all) { store.assets[id] = all[id]; if (typeof hooks.isTemplateAsset === "function" && hooks.isTemplateAsset(id)) continue; out[id] = fileUrl(id); }
        return out;
      }
      return undefined;
    },
    put(_h, key, val) {
      if (key === "draft" || key === "shop") {
        const kind = key === "draft" ? "site" : "shop";
        return serial(async () => { if (pendingRestore) { const r = pendingRestore; pendingRestore = null; await runRestore(r); } await putDraft(kind, val); });
      }
      if (key === "settings") {
        const clean = { recentColors: ((val && val.recentColors) || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map((c) => c.toLowerCase()).slice(0, 5) };
        const s = JSON.stringify(clean); if (s === last.settings) return Promise.resolve();
        return serial(async () => { try { await req("PUT", sp("/settings"), { json: clean }); last.settings = s; } catch (e) { if (e.network) throw e; } });   // 色の設定の失敗では止めない
      }
      if (key === "assets") {
        for (const id in val || {}) { if (store.assets[id] || /^ast_/.test(id)) continue; const u = val[id]; if (typeof u === "string" && u.startsWith("data:")) startUpload(id, u); }
        return Promise.resolve();
      }
      return Promise.resolve();   // versions：版はサーバーが作る（公開・戻す）
    },
    // ---- pg/m3-api.js から ----
    queueRestore(r) { pendingRestore = r; },
    uploadNow(id, dataUrl) { return startUpload(id, dataUrl); },
    async waitUploads() { const ps = Object.values(uploads); await Promise.all(ps); },
    async listAssets() { const r = await req("GET", sp("/assets")); const all = (r && r.assets) || {}; Object.assign(store.assets, all); return all; },
    isSaved(draft, shop) { return JSON.stringify(draft) === last.site && JSON.stringify(shop) === last.shop; },
    publish(bundle) {
      return serial(() => req("POST", sp("/publish"), { json: { scope: "all", shopDraftVersion: ver.shop, siteDraftVersion: ver.site, pages: bundle.pages, css: bundle.css, files: bundle.files } }));
    },
    async logout() { try { await req("POST", "/api/auth/logout", { json: {} }); } catch (e) {} },
  };
  return store;
}

// どちらの保存先を使うか：URL の ?api=…&shop=…、組み立てのときの設定（MIKKE_API）、ログインのリンク（/login#t=…）で来たときは覚えた設定。
// 何も無ければ null（＝今までどおり LocalStore）
export function apiConfigFromLocation(buildApi) {
  let q; try { q = new URLSearchParams(location.search); } catch (e) { return null; }
  let api = q.get("api"), shop = q.get("shop");
  if (!api && buildApi) api = buildApi === "same" ? location.origin : buildApi;
  if (!api && (/\/login\/?$/.test(location.pathname) || /(^#|&)t=/.test(location.hash))) {
    try { const c = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"); if (c && c.api) { api = c.api; shop = shop || c.shop; } } catch (e) {}
  }
  if (!api || !/^https?:\/\//.test(api)) return null;
  return { api, shop: shop || null };
}
