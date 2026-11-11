// apps/api（お店の ①②③ の置き場）とのつなぎ（指示 0053 段D）。edit-runner・rebuild-shop から使う。
// - ① の下書き：/edit-api/shops/:slug/shop（鍵 x-edit-runner-secret。apps/api/src/routes/runner.ts）
// - ② の下書き・公開・公開した版・写真：/api/shops/:shopId/…（ログインの Cookie。書くときは Origin も。/edit-api には口が無い）
// - api の店の名前（slug）は samples のフォルダ名と同じ（0053 の決め）
// - 「--from の形」のフォルダ（docs/REBUILD.md）に書き出して、lib/rebuild.mjs の makeStage・rebuildShop に渡す
// 通信は opts.fetch を使う（試験では偽物を渡す。tools/api-source.test.mjs）。
import fs from "node:fs";
import path from "node:path";
import { FROM_FILES, ROOT, SITE_RE } from "./rebuild.mjs";
import { applySiteTexts, applyTextsToGenConfig, paragraphsToText } from "./edit-ops.mjs";

export class ApiError extends Error {
  constructor(code, message, { status = null, body = null } = {}) { super(message); this.code = code; this.status = status; this.body = body; }
}

/** 呼ぶ口の一覧（apps/api の routes に合わせる。口が増えたらここだけ直す） */
export const API_ROUTES = {
  shopDraft: (slug) => `/edit-api/shops/${encodeURIComponent(slug)}/shop`, // GET・PUT（鍵）
  siteDraft: (id) => `/api/shops/${id}/drafts/site`, // GET・PUT（Cookie）
  shopInfo: (id) => `/api/shops/${id}`, // GET（publishedVersion）
  version: (id, n) => `/api/shops/${id}/versions/${n}`, // GET（公開した版の ①②③）
  assets: (id) => `/api/shops/${id}/assets`, // GET（assets.json と同じ形）
  assetFile: (id, a) => `/api/shops/${id}/assets/${a}/file`, // GET（写真そのもの）
  publish: (id) => `/api/shops/${id}/publish`, // POST（下書き → 公開）
};

/**
 * api を呼ぶ道具。base は api の根（例 http://127.0.0.1:8787）。
 * secret：/edit-api の鍵（EDIT_RUNNER_SECRET）。cookie：/api のログインの Cookie（"mikke_session=…" のまま）。origin：/api に書くときの Origin（APP_ORIGINS の1つ）
 */
export function apiClient({ base, secret = "", cookie = "", origin = "", fetch: f = globalThis.fetch } = {}) {
  if (!base) throw new ApiError("config", "api の URL が要る（--api か MIKKE_API_URL）");
  const root = String(base).replace(/\/$/, "");
  async function call(method, p, { json, auth, ifMatch, raw } = {}) {
    const headers = {};
    if (auth === "runner") {
      if (!secret) throw new ApiError("config", "/edit-api の鍵が要る（--api-secret か MIKKE_API_RUNNER_SECRET・EDIT_RUNNER_SECRET）");
      headers["x-edit-runner-secret"] = secret;
    } else {
      if (!cookie) throw new ApiError("config", `${p} はログインの Cookie が要る（--api-cookie か MIKKE_API_COOKIE。/edit-api にこの口は無い）`);
      headers.cookie = cookie;
      if (method !== "GET") {
        if (!origin) throw new ApiError("config", `${p} に書くには Origin が要る（--api-origin か MIKKE_API_ORIGIN。apps/api の APP_ORIGINS の1つ）`);
        headers.origin = origin;
      }
    }
    if (ifMatch != null) headers["if-match"] = `"${ifMatch}"`;
    if (json !== undefined) headers["content-type"] = "application/json";
    const init = { method, headers, body: json === undefined ? undefined : JSON.stringify(json) };
    let r;
    // 作り直しの間（数十秒）に、前の keep-alive の接続を api 側が閉じていて切れることがある → 1 回だけ新しい接続でやり直す（desk() と同じ）
    try { r = await f(`${root}${p}`, init); }
    catch (e) {
      const why = String(e?.cause?.code ?? e?.cause?.message ?? e?.message ?? e);
      if (!/ECONNRESET|EPIPE|UND_ERR_SOCKET|other side closed/i.test(why)) throw new ApiError("network", `${method} ${p} に届かない：${why}`);
      await new Promise((ok) => setTimeout(ok, 500));
      try { r = await f(`${root}${p}`, init); }
      catch (e2) { throw new ApiError("network", `${method} ${p} に届かない：${String(e2?.cause?.code ?? e2?.message ?? e2)}`); }
    }
    if (raw && r.ok) return Buffer.from(await r.arrayBuffer());
    const text = await r.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
    if (!r.ok) {
      const code = r.status === 409 ? "conflict" : r.status === 401 || r.status === 403 ? "auth" : r.status === 404 ? "not_found" : r.status === 429 ? "too_soon" : r.status === 503 ? "closed" : "api";
      throw new ApiError(code, `${method} ${p} → ${r.status} ${body?.error ?? ""} ${body?.message ?? text.slice(0, 200)}`.trim(), { status: r.status, body });
    }
    return body;
  }
  return {
    base: root,
    /** ① の下書き：{ shopId, slug, version, baseHash, data, updatedAt } */
    getShopDraft: (slug) => call("GET", API_ROUTES.shopDraft(slug), { auth: "runner" }),
    /** 承認された直しを当てた ① を下書きに書き戻す（公開はしない）。読んだ版が古ければ ApiError("conflict")（body.current に今の版） */
    putShopDraft: (slug, version, data) => call("PUT", API_ROUTES.shopDraft(slug), { auth: "runner", ifMatch: version, json: data }),
    /** ②③ の下書き：{ kind, version, data: {draft, theme?} | null } */
    getSiteDraft: (shopId) => call("GET", API_ROUTES.siteDraft(shopId)),
    putSiteDraft: (shopId, version, data) => call("PUT", API_ROUTES.siteDraft(shopId), { ifMatch: version, json: data }),
    getShopInfo: (shopId) => call("GET", API_ROUTES.shopInfo(shopId)),
    getVersion: (shopId, n) => call("GET", API_ROUTES.version(shopId, n)),
    getAssets: (shopId) => call("GET", API_ROUTES.assets(shopId)),
    getAssetFile: (shopId, assetId) => call("GET", API_ROUTES.assetFile(shopId, assetId), { raw: true }),
    publish: (shopId, body) => call("POST", API_ROUTES.publish(shopId), { json: body }),
  };
}

// ───────── ② の文字（文字の箱）を api の ②③ の下書きに載せる
// 載せ所：draft.content[要素ID]（DATA_SPEC 4.9.3「文字」。見た目の無い文字は文字列だけでよい）。段落の区切りは \n。
// 要素ID は samples/<店>/site.json の elements の ID（例 fv_copy）。wa-03 などの型の店は、編集画面の部品 ID ではなくこの ID を使う。

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const contentText = (v) =>
  typeof v === "string" ? v
  : Array.isArray(v) && v.every((r) => typeof r === "string" || (isObj(r) && typeof r.text === "string")) ? v.map((r) => (typeof r === "string" ? r : r.text)).join("")
  : null;

/** 型の名前：site.json の templateId（tpl_wa_03）→ api の下書きの template.name（wa-03） */
export const templateNameOf = (siteJson) => {
  const m = /^tpl_wa_(\d\d)$/.exec(siteJson?.templateId ?? "");
  return m ? `wa-${m[1]}` : null;
};

/**
 * ②③ の下書きから、site.json の文字の箱に当てる文字を取り出す。
 * 返り：{ texts: {要素ID: 文字}（site.json と違う物だけ）, same: [今と同じ], ignored: [{id, reason}] }
 */
export function textsFromSiteDraft(siteDraft, siteJson) {
  const content = siteDraft?.draft?.content;
  const out = { texts: {}, same: [], ignored: [] };
  if (!isObj(content)) return out;
  for (const [id, v] of Object.entries(content)) {
    const el = siteJson?.elements?.[id];
    if (!el || !Array.isArray(el.paragraphs)) { out.ignored.push({ id, reason: "site.json に文字の箱が無い" }); continue; }
    if (el.paragraphs.some((p) => (p.runs ?? []).some((r) => r.bind))) { out.ignored.push({ id, reason: "① と連動している箱" }); continue; }
    const t = contentText(v);
    if (t == null) { out.ignored.push({ id, reason: "文字の形でない" }); continue; }
    if (t === paragraphsToText(el.paragraphs)) out.same.push(id);
    else out.texts[id] = t;
  }
  return out;
}

/** ②③ の下書きに文字を載せた写しを返す（元は変えない）。下書きが無ければ {draft: {template, sections: {}}} から作る */
export function withSiteTexts(siteDraft, texts, templateName) {
  const out = isObj(siteDraft) ? clone(siteDraft) : {};
  if (!isObj(out.draft)) {
    if (!templateName) throw new ApiError("site_draft", "②③ の下書きが無く、型の名前もわからない（site.json の templateId）");
    out.draft = { template: { name: templateName, version: 1 }, sections: {} };
  }
  if (!isObj(out.draft.content)) out.draft.content = {};
  for (const [id, t] of Object.entries(texts)) out.draft.content[id] = String(t);
  return out;
}

// ───────── 「--from の形」のフォルダを書く

/**
 * samples/<店> の設定（FROM_FILES・<型>.json）を土台に、api の ① と ② の文字を重ねたフォルダを作る。
 * assets：{ json, files: {名前: Buffer} } を渡せば assets.json と media/ を api の物にする（無ければ samples の assets.json。写真は makeStage が samples から写す）
 * 返り：{ dir, files, texts, genConfig: {file, replaced, missing} | null }
 */
export function writeSourceDir(dir, { site, shop, texts = {}, assets = null, root = ROOT }) {
  if (!SITE_RE.test(site ?? "")) throw new ApiError("site", `店の名前の形が違う：${site}`);
  if (!isObj(shop)) throw new ApiError("shop", "① が無い");
  const src = path.join(root, "samples", site);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  if (fs.existsSync(src)) {
    for (const n of fs.readdirSync(src)) {
      if ((FROM_FILES.includes(n) || /^wa\d\d\.json$/.test(n)) && fs.statSync(path.join(src, n)).isFile()) { fs.copyFileSync(path.join(src, n), path.join(dir, n)); files.push(n); }
    }
  }
  const write = (n, v) => { fs.writeFileSync(path.join(dir, n), JSON.stringify(v, null, 2) + "\n"); if (!files.includes(n)) files.push(n); };
  write("shop.json", shop);
  let genConfig = null;
  if (Object.keys(texts).length) {
    const sf = path.join(dir, "site.json");
    if (!fs.existsSync(sf)) throw new ApiError("site_json", `② の文字を当てる site.json が無い：samples/${site}`);
    const siteJson = JSON.parse(fs.readFileSync(sf, "utf8"));
    const tpl = files.find((f) => /^wa\d\d\.json$/.test(f));
    if (tpl) {
      const g = applyTextsToGenConfig(JSON.parse(fs.readFileSync(path.join(dir, tpl), "utf8")), siteJson, texts);
      write(tpl, g.config);
      genConfig = { file: tpl, replaced: g.replaced, missing: g.missing };
    }
    write("site.json", applySiteTexts(siteJson, texts));
  }
  if (assets) {
    write("assets.json", assets.json);
    fs.mkdirSync(path.join(dir, "media"), { recursive: true });
    for (const [n, buf] of Object.entries(assets.files ?? {})) {
      if (!/^[A-Za-z0-9._-]+$/.test(n)) throw new ApiError("assets", `写真のファイル名の形が違う：${n}`);
      fs.writeFileSync(path.join(dir, "media", n), buf);
    }
  }
  return { dir, files: files.sort(), texts, genConfig };
}

/**
 * gen の後に site.json の文字の箱を確かめ、型の設定から戻らなかった物を直接当てる（rebuildShop の afterGen に渡す）。
 * gen が site.json を型の設定から作り直す店で、設定の中に同じ文字が1か所に決まらなかったとき（missing）のため
 */
export function textsAfterGen(texts) {
  return ({ shopDir }) => {
    const sf = path.join(shopDir, "site.json");
    if (!Object.keys(texts).length || !fs.existsSync(sf)) return;
    const s = JSON.parse(fs.readFileSync(sf, "utf8"));
    const need = Object.fromEntries(Object.entries(texts).filter(([id]) => paragraphsToText(s.elements?.[id]?.paragraphs) !== texts[id]));
    if (Object.keys(need).length) fs.writeFileSync(sf, JSON.stringify(applySiteTexts(s, need), null, 2) + "\n");
  };
}

/** api の写真（④）を取ってくる：{ json（assets.json の形）, files: {file.key: Buffer} } */
export async function fetchApiAssets(client, shopId) {
  const json = await client.getAssets(shopId);
  const files = {};
  for (const [id, a] of Object.entries(json?.assets ?? {})) {
    const key = a?.file?.key;
    if (!key) continue;
    files[key] = await client.getAssetFile(shopId, id);
  }
  return { json, files };
}

const readSamplesSite = (site, root) => {
  const f = path.join(root, "samples", site, "site.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
};

/**
 * 今の下書き（①・② の文字）を「--from の形」に書く（edit-runner の元）。
 * 返り：{ dir, shopId, shop: {version, baseHash, data}, site: {version, data} | null, texts, ignored, genConfig, assetsFrom }
 * ②③ の下書きは Cookie があるときだけ読む（無ければ site: null・② の文字は samples のまま）
 */
export async function fetchDraftSource(client, { site, dir, withSite = true, apiAssets = false, root = ROOT }) {
  const shop = await client.getShopDraft(site);
  let siteDraft = null, t = { texts: {}, same: [], ignored: [] };
  if (withSite) {
    siteDraft = await client.getSiteDraft(shop.shopId);
    t = textsFromSiteDraft(siteDraft?.data, readSamplesSite(site, root));
  }
  const assets = apiAssets ? await fetchApiAssets(client, shop.shopId) : null;
  const w = writeSourceDir(dir, { site, shop: shop.data, texts: t.texts, assets, root });
  return {
    dir, shopId: shop.shopId,
    shop: { version: shop.version, baseHash: shop.baseHash, data: shop.data },
    site: siteDraft ? { version: siteDraft.version ?? 0, data: siteDraft.data ?? null } : null,
    texts: t.texts, ignored: t.ignored, genConfig: w.genConfig, assetsFrom: assets ? "api" : "samples",
  };
}

/**
 * 公開された ① から「--from の形」に書く（rebuild-shop --from-api の元）。
 * shopId は /edit-api の ① から（slug → ID）。公開中の版の番号は /api/shops/:id、中身は /api/shops/:id/versions/:n
 * 返り：{ dir, shopId, version, publishedAt, texts, ignored, genConfig, assetsFrom, afterGen }
 */
export async function fetchPublishedSource(client, { site, dir, shopId = null, apiAssets = false, root = ROOT }) {
  const id = shopId ?? (await client.getShopDraft(site)).shopId;
  const info = await client.getShopInfo(id);
  const n = info?.publishedVersion;
  if (!n) throw new ApiError("not_published", `まだ公開していない：${site}（${id}）`);
  const v = await client.getVersion(id, n);
  const t = textsFromSiteDraft(v.site, readSamplesSite(site, root));
  const assets = apiAssets ? await fetchApiAssets(client, id) : null;
  const w = writeSourceDir(dir, { site, shop: v.shop, texts: t.texts, assets, root });
  return { dir, shopId: id, version: n, scope: v.scope ?? null, publishedAt: v.publishedAt ?? null, texts: t.texts, ignored: t.ignored, genConfig: w.genConfig, assetsFrom: assets ? "api" : "samples", afterGen: textsAfterGen(t.texts) };
}

// ───────── 下書き → 公開

/** 書き出しの HTML を公開の pages（道 → HTML）に：index.html → "/"、menu.html → "/menu"、a/index.html → "/a"。形に合わない名前は skipped */
export function pagesFromDist(distDir) {
  const pages = {}, skipped = [];
  const walk = (d, pre) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { walk(path.join(d, e.name), `${pre}${e.name}/`); continue; }
      if (!e.name.endsWith(".html")) continue;
      const rel = `${pre}${e.name}`;
      const p = "/" + rel.replace(/(^|\/)index\.html$/, "").replace(/\.html$/, "").replace(/\/$/, "");
      if (/^\/(?:[a-z0-9][a-z0-9-]{0,62}(?:\/[a-z0-9][a-z0-9-]{0,62}){0,3})?$/.test(p)) pages[p] = fs.readFileSync(path.join(d, e.name), "utf8");
      else skipped.push(rel);
    }
  };
  walk(distDir, "");
  return { pages, skipped: skipped.sort() };
}

/**
 * 下書き → 公開（POST /api/shops/:id/publish）。scope all は ①②③、shop は ① だけ（②③ は公開中の物を引き継ぐ）。
 * pages は書き出しの HTML（api は描いた HTML を R2 に置く決まり）
 */
export async function publishDrafts(client, shopId, { shopDraftVersion, siteDraftVersion, distDir, scope = siteDraftVersion == null ? "shop" : "all" }) {
  const { pages, skipped } = pagesFromDist(distDir);
  if (!pages["/"]) throw new ApiError("publish", `書き出しにトップページ（index.html）が無い：${distDir}`);
  const body = { scope, shopDraftVersion, pages };
  if (scope === "all") body.siteDraftVersion = siteDraftVersion;
  const r = await client.publish(shopId, body);
  return { ...r, skipped };
}
