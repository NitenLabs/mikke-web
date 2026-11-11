// apps/api（お店の ①②③ の置き場）とのつなぎ（指示 0053 段D・0059 段G）。edit-runner・rebuild-shop から使う。
// - 呼ぶのは /edit-api/shops/:slug/…（鍵 x-edit-runner-secret だけ。apps/api/src/routes/runner.ts）。Cookie・Origin は使わない（0059）
//   ① の下書き・②③ の下書き・公開・公開した版・版・写真の台帳とファイル・描いた結果
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

/** 呼ぶ口の一覧（apps/api の routes/runner.ts に合わせる。口が増えたらここだけ直す）。:shop は slug（ID でもよい）。すべて鍵だけ */
export const API_ROUTES = {
  shopDraft: (s) => `/edit-api/shops/${encodeURIComponent(s)}/shop`, // GET・PUT（① の下書き。PUT は If-Match）
  siteDraft: (s) => `/edit-api/shops/${encodeURIComponent(s)}/site`, // GET・PUT（②③ の下書き。PUT は If-Match）
  publish: (s) => `/edit-api/shops/${encodeURIComponent(s)}/publish`, // POST（下書き → 公開。1 分に 1 回まで：429 too_soon・retryAfter）
  published: (s) => `/edit-api/shops/${encodeURIComponent(s)}/published`, // GET（公開中の版の ①②③・写真。未公開は 404 not_published）
  version: (s, n) => `/edit-api/shops/${encodeURIComponent(s)}/versions/${n}`, // GET（版 n）
  asset: (s, a) => `/edit-api/shops/${encodeURIComponent(s)}/assets/${encodeURIComponent(a)}`, // GET（写真の台帳 1 件。今の ④。0065）
  assetFile: (s, a) => `/edit-api/shops/${encodeURIComponent(s)}/assets/${encodeURIComponent(a)}/file`, // GET（写真そのもの）
  renderResult: (s, n) => `/edit-api/shops/${encodeURIComponent(s)}/versions/${n}/render`, // POST（render:"rebuild" の版を描いた結果）
};

/** api の答えの error のうち、そのまま code に使う物（状態の番号より先に見る） */
const BODY_CODES = new Set(["too_soon", "not_published", "conflict", "unsafe_html", "precondition_required"]);

/**
 * api を呼ぶ道具。base は api の根（例 http://127.0.0.1:8787）。secret：/edit-api の鍵（EDIT_RUNNER_SECRET）
 */
export function apiClient({ base, secret = "", fetch: f = globalThis.fetch } = {}) {
  if (!base) throw new ApiError("config", "api の URL が要る（--api か MIKKE_API_URL）");
  const root = String(base).replace(/\/$/, "");
  async function call(method, p, { json, ifMatch, raw } = {}) {
    if (!secret) throw new ApiError("config", "/edit-api の鍵が要る（--api-secret か MIKKE_API_RUNNER_SECRET・EDIT_RUNNER_SECRET）");
    const headers = { "x-edit-runner-secret": secret };
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
      const code = BODY_CODES.has(body?.error) ? body.error
        : r.status === 409 ? "conflict" : r.status === 401 || r.status === 403 ? "auth" : r.status === 404 ? "not_found" : r.status === 429 ? "too_soon" : r.status === 503 ? "closed" : "api";
      const e = new ApiError(code, `${method} ${p} → ${r.status} ${body?.error ?? ""} ${body?.message ?? text.slice(0, 200)}`.trim(), { status: r.status, body });
      const raw = body?.retryAfter ?? r.headers?.get?.("retry-after");
      const ra = raw == null || raw === "" ? NaN : Number(raw);
      if (Number.isFinite(ra) && ra >= 0) e.retryAfter = ra;
      throw e;
    }
    return body;
  }
  return {
    base: root,
    /** ① の下書き：{ shopId, slug, version, baseHash, data, updatedAt } */
    getShopDraft: (slug) => call("GET", API_ROUTES.shopDraft(slug)),
    /** 承認された直しを当てた ① を下書きに書き戻す（公開はしない）。読んだ版が古ければ ApiError("conflict")（body.current に今の版） */
    putShopDraft: (slug, version, data) => call("PUT", API_ROUTES.shopDraft(slug), { ifMatch: version, json: data }),
    /** ②③ の下書き：{ shopId, slug, kind, version, data: {draft, theme?} | null }（無ければ版 0） */
    getSiteDraft: (slug) => call("GET", API_ROUTES.siteDraft(slug)),
    putSiteDraft: (slug, version, data) => call("PUT", API_ROUTES.siteDraft(slug), { ifMatch: version, json: data }),
    /** 公開中の版：{ shopId, slug, number, scope, publishedAt, isPublished, render, shop, site, assets }。未公開は ApiError("not_published") */
    getPublished: (slug) => call("GET", API_ROUTES.published(slug)),
    getVersion: (slug, n) => call("GET", API_ROUTES.version(slug, n)),
    /** 写真の台帳 1 件（今の ④）：{id, kind, file: {key, mime, width, height, bytes}, …}。無ければ ApiError("not_found") */
    getAsset: (slug, assetId) => call("GET", API_ROUTES.asset(slug, assetId)),
    getAssetFile: (slug, assetId) => call("GET", API_ROUTES.assetFile(slug, assetId), { raw: true }),
    publish: (slug, body) => call("POST", API_ROUTES.publish(slug), { json: body }),
    /** render:"rebuild" の版を描いた結果を返す：{ok:true, url?} か {ok:false, error}（html の版は 409 not_rebuild） */
    postRenderResult: (slug, n, body) => call("POST", API_ROUTES.renderResult(slug, n), { json: body }),
  };
}

// ───────── ② の文字（文字の箱）と写真を api の ②③ の下書きから読む・載せる
// 載せ所：draft.content[要素ID]（DATA_SPEC 4.9.3「文字」「写真」。見た目の無い文字は文字列だけでよい。段落の区切りは \n。写真は {asset}）。
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
 * ②③ の下書きの形（0059 段G・0065）。
 * - "content"：DATA_SPEC 4.9.3 の型の店の形 {draft: {template, sections: {}, content: {要素ID: 文字 | {asset}}}}。apps/api の seed・apps/owner・runner が使う
 * - "old"：site.json を丸ごと持つ古い形 {draft: {...site.json, template, genConfig}}（0065 より前の seed）。読まない（assertContentForm で止める）
 * - null：下書きが無い
 */
export const siteDraftForm = (siteDraft) =>
  !isObj(siteDraft?.draft) ? null : isObj(siteDraft.draft.elements) || isObj(siteDraft.draft.genConfig) ? "old" : "content";

/** 古い形の下書きなら ApiError("site_draft_form") で止める（黙って直さない。seed し直す） */
export function assertContentForm(siteDraft) {
  if (siteDraftForm(siteDraft) === "old") {
    throw new ApiError("site_draft_form", "②③ の下書きが古い形（site.json を丸ごと持つ。draft.elements・draft.genConfig がある）。node apps/api/scripts/seed.mjs --site <店> で入れ直す");
  }
}

/** content の値が写真の形（{asset?, cleared?, bright?}。DATA_SPEC 4.9.3「写真」）か */
const isPhotoValue = (v) => isObj(v) && ("asset" in v || "cleared" in v || "bright" in v);
const ASSET_RE = /^ast_[a-z0-9]{4,24}$/;

/** 文字の箱の文字（連動していない箱だけ）。箱が無い・連動・形が違えば {reason} */
function boxText(siteJson, id, v) {
  const el = siteJson?.elements?.[id];
  if (!el || !Array.isArray(el.paragraphs)) return { reason: "site.json に文字の箱が無い" };
  if (el.paragraphs.some((p) => (p.runs ?? []).some((r) => r.bind))) return { reason: "① と連動している箱" };
  const t = contentText(v);
  if (t == null) return { reason: "文字の形でない" };
  return { text: t, same: t === paragraphsToText(el.paragraphs) };
}

/**
 * ②③ の下書き（content の形）から、site.json（samples）の文字の箱に当てる文字を取り出す。draft.content[要素ID] の文字だけ（写真の値は photosFromSiteDraft）。
 * 古い形は ApiError("site_draft_form")。
 * 返り：{ texts: {要素ID: 文字}（site.json と違う物だけ）, same: [今と同じ], ignored: [{id, reason}], form }
 */
export function textsFromSiteDraft(siteDraft, siteJson) {
  assertContentForm(siteDraft);
  const out = { texts: {}, same: [], ignored: [], form: siteDraftForm(siteDraft) };
  const content = siteDraft?.draft?.content;
  if (!isObj(content)) return out;
  for (const [id, v] of Object.entries(content)) {
    if (isPhotoValue(v)) continue;
    const r = boxText(siteJson, id, v);
    if (r.reason) out.ignored.push({ id, reason: r.reason });
    else if (r.same) out.same.push(id);
    else out.texts[id] = r.text;
  }
  return out;
}

/**
 * ②③ の下書き（content の形）から、差し替えた ② の写真を取り出す：content[要素ID] = {asset}（DATA_SPEC 4.9.3「写真」。切り抜きは持たない）。
 * site.json の elements[要素ID] が写真（type "photo"）で、asset が元の素材と違う物だけ。cleared（写真を外す）・bright は今は描けないので ignored。
 * 返り：{ photos: {要素ID: 新しい素材ID}, same: [元と同じ], ignored: [{id, reason}] }
 */
export function photosFromSiteDraft(siteDraft, siteJson) {
  assertContentForm(siteDraft);
  const out = { photos: {}, same: [], ignored: [] };
  const content = siteDraft?.draft?.content;
  if (!isObj(content)) return out;
  for (const [id, v] of Object.entries(content)) {
    if (!isPhotoValue(v)) continue;
    const el = siteJson?.elements?.[id];
    if (el?.type !== "photo" || !el.asset) { out.ignored.push({ id, reason: "site.json に写真の要素が無い" }); continue; }
    if (v.cleared) { out.ignored.push({ id, reason: "まだ描けない（cleared）" }); continue; }
    if (v.bright != null) out.ignored.push({ id, reason: "まだ描けない（bright）" });
    if (v.asset == null) continue;
    if (typeof v.asset !== "string" || !ASSET_RE.test(v.asset)) { out.ignored.push({ id, reason: "写真の ID の形が違う" }); continue; }
    if (v.asset === el.asset) out.same.push(id);
    else out.photos[id] = v.asset;
  }
  return out;
}

/**
 * ②③ の下書きに文字を載せた写しを返す（元は変えない）。content の形だけ（古い形は ApiError("site_draft_form")）。
 * - 下書きが無い：{draft: {template, sections: {}, content}}（DATA_SPEC 4.9.3）
 * - ある：content[要素ID] に文字。型の店の形に無い項目（added など）は持たない。content のほかの値（写真など）はそのまま
 * 返り：{ data, form }
 */
export function withSiteTexts(siteDraft, texts, templateName) {
  assertContentForm(siteDraft);
  const out = isObj(siteDraft) ? clone(siteDraft) : {};
  const form = siteDraftForm(out);
  if (!form) {
    if (!templateName) throw new ApiError("site_draft", "②③ の下書きが無く、型の名前もわからない（site.json の templateId）");
    out.draft = { template: { name: templateName, version: 1 }, sections: {} };
  }
  const { template, sections, content } = out.draft;
  out.draft = { template, sections: isObj(sections) ? sections : {}, content: isObj(content) ? content : {} };
  for (const [id, t] of Object.entries(texts)) out.draft.content[id] = String(t);
  return { data: out, form: form ?? "content" };
}

// ───────── 「--from の形」のフォルダを書く

const readSamplesJson = (site, name, root) => {
  const f = path.join(root, "samples", site, name);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
};

/**
 * samples/<店> の設定（FROM_FILES・<型>.json）を土台に、api の ① と ② の文字・写真を重ねたフォルダを作る。
 * assets：{ json, files: {名前: Buffer} } を渡せば assets.json と media/ を api の物にする（無ければ samples の assets.json。写真は makeStage が samples から写す）
 * photos：{要素ID: 新しい素材ID}（photosFromSiteDraft）。gen は決まった素材 ID（site.json・<型>.json の物）を指すので、site.json を書き換えても
 *   gen で戻る。そこで assets.json の**元の素材の file を新しい写真の file に向ける**（新しい写真の台帳と file が要る。無ければ ApiError("assets")）
 * 返り：{ dir, files, texts, genConfig: {file, replaced, missing} | null, swapped: ["fv_1:ast_fv01→ast_xxx"] }
 */
export function writeSourceDir(dir, { site, shop, texts = {}, photos = {}, assets = null, root = ROOT }) {
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
  const sf = path.join(dir, "site.json");
  const needSite = Object.keys(texts).length > 0 || Object.keys(photos).length > 0;
  if (needSite && !fs.existsSync(sf)) throw new ApiError("site_json", `② の文字・写真を当てる site.json が無い：samples/${site}`);
  const siteJson = needSite ? JSON.parse(fs.readFileSync(sf, "utf8")) : null;
  let genConfig = null;
  if (Object.keys(texts).length) {
    const tpl = files.find((f) => /^wa\d\d\.json$/.test(f));
    if (tpl) {
      const g = applyTextsToGenConfig(JSON.parse(fs.readFileSync(path.join(dir, tpl), "utf8")), siteJson, texts);
      write(tpl, g.config);
      genConfig = { file: tpl, replaced: g.replaced, missing: g.missing };
    }
    write("site.json", applySiteTexts(siteJson, texts));
  }
  const swapped = [];
  let json = assets?.json ?? null;
  if (Object.keys(photos).length) {
    json = clone(json ?? readSamplesJson(site, "assets.json", root) ?? { schemaVersion: 1, assets: {} });
    json.assets ??= {};
    const have = new Set(Object.keys(assets?.files ?? {}));
    for (const [elId, newId] of Object.entries(photos)) {
      const orig = siteJson.elements?.[elId]?.asset;
      if (!orig) throw new ApiError("assets", `site.json に写真の要素が無い：${elId}`);
      const na = json.assets[newId];
      if (!na?.file?.key) throw new ApiError("assets", `差し替えた写真の台帳が無い：${elId}→${newId}`);
      if (!have.has(na.file.key) && !fs.existsSync(path.join(src, "media", na.file.key))) throw new ApiError("assets", `差し替えた写真のファイルが無い：${elId}→${newId}（${na.file.key}）`);
      json.assets[orig] = { ...(json.assets[orig] ?? {}), file: { ...na.file } };
      swapped.push(`${elId}:${orig}→${newId}`);
    }
  }
  if (json) write("assets.json", json);
  if (assets) {
    fs.mkdirSync(path.join(dir, "media"), { recursive: true });
    for (const [n, buf] of Object.entries(assets.files ?? {})) {
      if (!/^[A-Za-z0-9._-]+$/.test(n)) throw new ApiError("assets", `写真のファイル名の形が違う：${n}`);
      fs.writeFileSync(path.join(dir, "media", n), buf);
    }
  }
  return { dir, files: files.sort(), texts, genConfig, swapped };
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

const MEDIA_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * api の写真（[[ID, 台帳], …]）を取ってきて samples の assets.json に重ねる：{ json（assets.json の形）, files: {media の名前: Buffer} }。
 * file.key は R2 の名前なので media/ の名前（<ID>.<拡張子>）に替える
 */
async function overlayAssets(client, slug, entries, { site = slug, root = ROOT } = {}) {
  const base = readSamplesJson(site, "assets.json", root) ?? { schemaVersion: 1, assets: {} };
  const json = { ...base, assets: { ...(base.assets ?? {}) } };
  const files = {};
  for (const [id, a] of entries) {
    const name = `${id}.${MEDIA_EXT[a?.file?.mime] ?? "jpg"}`;
    files[name] = await client.getAssetFile(slug, id);
    const { id: _id, ...meta } = a ?? {};
    void _id;
    json.assets[id] = { ...(json.assets[id] ?? {}), ...meta, file: { ...(a?.file ?? {}), key: name } };
  }
  return { json, files };
}

/**
 * 版の写真（版が指している ④。ids を渡せばその写真だけ）を取ってくる：{ json, files }。版に無い写真は samples のまま。
 * ids の写真が版に無ければ ApiError("assets")
 */
export async function fetchVersionAssets(client, slug, version, { site = slug, root = ROOT, ids = null } = {}) {
  const all = version?.assets?.assets ?? {};
  const want = ids ?? Object.keys(all);
  const miss = want.filter((id) => !all[id]);
  if (miss.length) throw new ApiError("assets", `版に写真が無い：${miss.join(" ")}`);
  return overlayAssets(client, slug, want.map((id) => [id, all[id]]), { site, root });
}

/** 今の ④（下書きの時点）の写真を ids だけ取ってくる（GET /edit-api/shops/:slug/assets/:id と …/file。0065）：{ json, files } */
export async function fetchCurrentAssets(client, slug, ids, { site = slug, root = ROOT } = {}) {
  const entries = [];
  for (const id of ids) entries.push([id, await client.getAsset(slug, id)]);
  return overlayAssets(client, slug, entries, { site, root });
}

const readSamplesSite = (site, root) => readSamplesJson(site, "site.json", root);

/**
 * 今の下書き（①・② の文字と写真）を「--from の形」に書く（edit-runner の元）。① も ②③ も /edit-api から鍵だけで読む。
 * 写真は samples の物。② で差し替えた写真（content[要素ID] = {asset}）だけは今の ④ を api から取る
 * 返り：{ dir, shopId, shop: {version, baseHash, data}, site: {version, data, form}, texts, photos, swapped, ignored, genConfig, assetsFrom }
 */
export async function fetchDraftSource(client, { site, dir, root = ROOT }) {
  const shop = await client.getShopDraft(site);
  const siteDraft = await client.getSiteDraft(site);
  const siteJson = readSamplesSite(site, root);
  const t = textsFromSiteDraft(siteDraft?.data, siteJson);
  const ph = photosFromSiteDraft(siteDraft?.data, siteJson);
  const ids = [...new Set(Object.values(ph.photos))];
  const assets = ids.length ? await fetchCurrentAssets(client, site, ids, { root }) : null;
  const w = writeSourceDir(dir, { site, shop: shop.data, texts: t.texts, photos: ph.photos, assets, root });
  return {
    dir, shopId: shop.shopId,
    shop: { version: shop.version, baseHash: shop.baseHash, data: shop.data },
    site: { version: siteDraft?.version ?? 0, data: siteDraft?.data ?? null, form: t.form },
    texts: t.texts, photos: ph.photos, swapped: w.swapped, ignored: [...t.ignored, ...ph.ignored], genConfig: w.genConfig, assetsFrom: assets ? "samples+api" : "samples",
  };
}

/**
 * 公開された ① から「--from の形」に書く（rebuild-shop --from-api の元）。GET /edit-api/shops/:slug/published（鍵だけ）
 * apiAssets：版の写真を全部 api から取る（無ければ samples の写真。ただし ② で差し替えた写真だけは、版の写真を api から取る）
 * 返り：{ dir, shopId, version, scope, render, publishedAt, texts, photos, swapped, ignored, siteForm, genConfig, assetsFrom, afterGen }
 */
export async function fetchPublishedSource(client, { site, dir, apiAssets = false, root = ROOT }) {
  let v;
  try { v = await client.getPublished(site); }
  catch (e) { if (e instanceof ApiError && e.code === "not_published") throw new ApiError("not_published", `まだ公開していない：${site}`, { status: e.status, body: e.body }); throw e; }
  const siteJson = readSamplesSite(site, root);
  const t = textsFromSiteDraft(v.site, siteJson);
  const ph = photosFromSiteDraft(v.site, siteJson);
  const ids = [...new Set(Object.values(ph.photos))];
  const assets = apiAssets ? await fetchVersionAssets(client, site, v, { root }) : ids.length ? await fetchVersionAssets(client, site, v, { root, ids }) : null;
  const w = writeSourceDir(dir, { site, shop: v.shop, texts: t.texts, photos: ph.photos, assets, root });
  return {
    dir, shopId: v.shopId ?? null, version: v.number, scope: v.scope ?? null, render: v.render ?? null, publishedAt: v.publishedAt ?? null,
    texts: t.texts, photos: ph.photos, swapped: w.swapped, ignored: [...t.ignored, ...ph.ignored], siteForm: t.form, genConfig: w.genConfig,
    assetsFrom: apiAssets ? "api" : assets ? "samples+api" : "samples", afterGen: textsAfterGen(t.texts),
  };
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
 * 下書き → 公開（POST /edit-api/shops/:slug/publish。鍵だけ）。scope all は ①②③、shop は ① だけ（②③ は公開中の物を引き継ぐ）。
 * render "html"：pages に書き出しの HTML を送る（api が R2 に置き、サブドメインで出す。スクリプトは /_mikke/ だけの検査がある）
 * render "rebuild"：pages を送らず ①②③ の写しだけを版にする（render は pending）。描くのは rebuild-shop --from-api で、結果は
 *   POST /edit-api/shops/:slug/versions/:n/render に返す。型（wa-NN）の店は書き出しにインラインのスクリプト（finish が足す）があり、
 *   html では unsafe_html で断られるので rebuild を使う（0053 段E）
 */
export async function publishDrafts(client, slug, { shopDraftVersion, siteDraftVersion, distDir, render = "html", scope = siteDraftVersion == null ? "shop" : "all" }) {
  if (render !== "html" && render !== "rebuild") throw new ApiError("publish", `render は html か rebuild：${render}`);
  const body = { scope, shopDraftVersion };
  if (scope === "all") body.siteDraftVersion = siteDraftVersion;
  let skipped = [];
  if (render === "html") {
    const p = pagesFromDist(distDir);
    if (!p.pages["/"]) throw new ApiError("publish", `書き出しにトップページ（index.html）が無い：${distDir}`);
    body.pages = p.pages;
    skipped = p.skipped;
  } else body.render = "rebuild";
  const r = await client.publish(slug, body);
  return { ...r, render: r.render ?? render, skipped };
}

/** 公開の 1 分に 1 回の待ち：too_soon の retryAfter（秒。無ければ 60）に 1 秒足し、1〜70 秒に収める */
export const waitSecondsOf = (e) => Math.min(70, Math.max(1, Math.ceil(Number.isFinite(e?.retryAfter) ? e.retryAfter : 60) + 1));

/**
 * publishDrafts を、too_soon（429）のときは retryAfter だけ待ってやり直す（0059 段G。--all --publish で続けて流すため）。
 * 待つのは maxWaits 回まで（既定 3）。それでも too_soon なら、そのまま ApiError を投げる。ほかの失敗はすぐ投げる。
 * sleep・onWait は試験用（偽の時計）。返り：publishDrafts の返りに waits（待った秒の並び）
 */
export async function publishWithWait(client, slug, args, { maxWaits = 3, sleep = (ms) => new Promise((ok) => setTimeout(ok, ms)), onWait = () => {} } = {}) {
  const waits = [];
  for (;;) {
    try { return { ...(await publishDrafts(client, slug, args)), waits }; }
    catch (e) {
      if (!(e instanceof ApiError) || e.code !== "too_soon" || waits.length >= maxWaits) { if (e instanceof ApiError) e.waits = waits; throw e; }
      const sec = waitSecondsOf(e);
      waits.push(sec);
      onWait(sec, waits.length);
      await sleep(sec * 1000);
    }
  }
}

/** 公開に失敗したときの記録（result.published）。下書きは書けている。edit-runner --republish で公開だけをやり直す */
export const publishFailure = (e, at = new Date().toISOString()) => ({
  ok: false, at,
  errorCode: e instanceof ApiError ? e.code : "internal",
  error: String(e?.message ?? e).slice(0, 600),
  ...(e?.retryAfter != null ? { retryAfter: e.retryAfter } : {}),
  ...(e?.waits?.length ? { waits: e.waits } : {}),
});

/** 公開できたときの記録（result.published） */
export const publishSuccess = (pub, at = new Date().toISOString()) => ({
  ok: true, at, number: pub.number, scope: pub.scope, render: pub.render, publishedAt: pub.publishedAt, pages: pub.pages, skipped: pub.skipped, url: pub.url ?? null,
  ...(pub.waits?.length ? { waits: pub.waits } : {}),
});

/** 今の下書きの版（公開だけをやり直すとき）：{ shopId, shopDraftVersion, siteDraftVersion（0 なら undefined） } */
export async function draftVersions(client, slug) {
  const [shop, site] = [await client.getShopDraft(slug), await client.getSiteDraft(slug)];
  return { shopId: shop.shopId, shopDraftVersion: shop.version, siteDraftVersion: site?.version > 0 ? site.version : undefined };
}

/** 公開の既定の描き方：型（site.json の templateId が tpl_wa_NN）の店は rebuild、ほかは html */
export const publishRenderOf = (siteJson) => (templateNameOf(siteJson) ? "rebuild" : "html");
