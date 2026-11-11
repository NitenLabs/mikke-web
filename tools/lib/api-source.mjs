// apps/api（お店の ①②③ の置き場）とのつなぎ（指示 0053 段D・0059 段G）。edit-runner・rebuild-shop から使う。
// - 呼ぶのは /edit-api/shops/:slug/…（鍵 x-edit-runner-secret だけ。apps/api/src/routes/runner.ts）。Cookie・Origin は使わない（0059）
//   ① の下書き・②③ の下書き・公開・公開した版・版・写真のファイル・描いた結果
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
    getAssetFile: (slug, assetId) => call("GET", API_ROUTES.assetFile(slug, assetId), { raw: true }),
    publish: (slug, body) => call("POST", API_ROUTES.publish(slug), { json: body }),
    /** render:"rebuild" の版を描いた結果を返す：{ok:true, url?} か {ok:false, error}（html の版は 409 not_rebuild） */
    postRenderResult: (slug, n, body) => call("POST", API_ROUTES.renderResult(slug, n), { json: body }),
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
 * ②③ の下書きの形（0059 段G）。
 * - "content"：DATA_SPEC 4.9.3 の型の店の形 {draft: {template, sections: {}, content: {要素ID: 文字}}}。runner が新しく作るのはこの形
 * - "site"：site.json を丸ごと持つ形 {draft: {...site.json, template, genConfig}}。apps/api の seed（wa03SiteDraft）と apps/owner の画面が
 *   使う（apps/owner は draft.elements の段落と draft.genConfig.fvCopy を読み書きする）。この形では文字を elements と genConfig に書き、
 *   content は持たない（古い runner が足した content は elements に移して消す。どちらかが古く残らないように）
 * - null：下書きが無い
 */
export const siteDraftForm = (siteDraft) => (!isObj(siteDraft?.draft) ? null : isObj(siteDraft.draft.elements) ? "site" : "content");

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
 * ②③ の下書きから、site.json（samples）の文字の箱に当てる文字を取り出す。
 * "content" の形は draft.content[要素ID]、"site" の形は draft.elements[要素ID].paragraphs（と、残っていれば古い content。content が勝つ）
 * 返り：{ texts: {要素ID: 文字}（site.json と違う物だけ）, same: [今と同じ], ignored: [{id, reason}], form }
 */
export function textsFromSiteDraft(siteDraft, siteJson) {
  const form = siteDraftForm(siteDraft);
  const out = { texts: {}, same: [], ignored: [], form };
  const take = (id, v, quiet) => {
    const r = boxText(siteJson, id, v);
    if (r.reason) { if (!quiet) out.ignored.push({ id, reason: r.reason }); return; }
    delete out.texts[id];
    out.same = out.same.filter((x) => x !== id);
    if (r.same) out.same.push(id); else out.texts[id] = r.text;
  };
  if (form === "site") {
    for (const [id, el] of Object.entries(siteDraft.draft.elements)) {
      if (!Array.isArray(el?.paragraphs) || !Array.isArray(siteJson?.elements?.[id]?.paragraphs)) continue;
      const r = boxText(siteJson, id, paragraphsToText(el.paragraphs));
      if (!r.reason && !r.same) out.texts[id] = r.text; // 同じ物は数えない（箱が多いので）。連動の箱は ① から描くので見ない
    }
  }
  const content = siteDraft?.draft?.content;
  if (isObj(content)) for (const [id, v] of Object.entries(content)) take(id, v, false);
  return out;
}

/**
 * ②③ の下書きに文字を載せた写しを返す（元は変えない）。形は今の下書きに合わせる（siteDraftForm）。
 * - 下書きが無い：{draft: {template, sections: {}, content}}（DATA_SPEC 4.9.3）
 * - "content"：content[要素ID] に文字。型の店の形に無い古い項目（elements・genConfig など site.json の物）は持たない
 * - "site"：elements[要素ID].paragraphs と genConfig（同じ文字の所）を直す。古い content は elements に移して消す
 * 返り：{ data, form, folded: [content から elements に移した ID], genConfig: {replaced, missing} | null }
 */
export function withSiteTexts(siteDraft, texts, templateName) {
  const out = isObj(siteDraft) ? clone(siteDraft) : {};
  const form = siteDraftForm(out);
  if (form === "site") {
    const d = out.draft;
    const folded = [];
    const all = {};
    if (isObj(d.content)) {
      for (const [id, v] of Object.entries(d.content)) {
        const t = contentText(v);
        if (t != null && Array.isArray(d.elements[id]?.paragraphs)) { all[id] = t; folded.push(id); }
      }
    }
    Object.assign(all, Object.fromEntries(Object.entries(texts).map(([id, t]) => [id, String(t)])));
    const missingBox = Object.keys(all).filter((id) => !Array.isArray(d.elements[id]?.paragraphs));
    if (missingBox.length) throw new ApiError("site_draft", `②③ の下書きに文字の箱が無い：${missingBox.join(" ")}`);
    let genConfig = null;
    if (isObj(d.genConfig)) {
      const g = applyTextsToGenConfig(d.genConfig, d, all);
      d.genConfig = g.config;
      genConfig = { replaced: g.replaced, missing: g.missing };
    }
    out.draft = { ...applySiteTexts(d, all) };
    if (genConfig) out.draft.genConfig = d.genConfig;
    delete out.draft.content;
    return { data: out, form, folded, genConfig };
  }
  if (!form) {
    if (!templateName) throw new ApiError("site_draft", "②③ の下書きが無く、型の名前もわからない（site.json の templateId）");
    out.draft = { template: { name: templateName, version: 1 }, sections: {} };
  }
  const { template, sections, content } = out.draft;
  out.draft = { template, sections: isObj(sections) ? sections : {}, content: isObj(content) ? content : {} };
  for (const [id, t] of Object.entries(texts)) out.draft.content[id] = String(t);
  return { data: out, form: form ?? "content", folded: [], genConfig: null };
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

const MEDIA_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * 版の写真（版が指している ④）を取ってくる：{ json（assets.json の形）, files: {media の名前: Buffer} }。
 * 版の assets は samples の assets.json に重ねる（版に無い写真は samples のまま）。file.key は R2 の名前なので media/ の名前（<ID>.<拡張子>）に替える。
 * 鍵だけで読める写真の口は版の写真と写真のファイルだけなので、今の ④（下書きの時点）は取らない（0059）
 */
export async function fetchVersionAssets(client, slug, version, { site = slug, root = ROOT } = {}) {
  const f = path.join(root, "samples", site, "assets.json");
  const base = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { schemaVersion: 1, assets: {} };
  const json = { ...base, assets: { ...(base.assets ?? {}) } };
  const files = {};
  for (const [id, a] of Object.entries(version?.assets?.assets ?? {})) {
    const name = `${id}.${MEDIA_EXT[a?.file?.mime] ?? "jpg"}`;
    files[name] = await client.getAssetFile(slug, id);
    json.assets[id] = { ...(json.assets[id] ?? {}), ...a, file: { ...(a?.file ?? {}), key: name } };
  }
  return { json, files };
}

const readSamplesSite = (site, root) => {
  const f = path.join(root, "samples", site, "site.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
};

/**
 * 今の下書き（①・② の文字）を「--from の形」に書く（edit-runner の元）。① も ②③ も /edit-api から鍵だけで読む。写真は samples の物
 * 返り：{ dir, shopId, shop: {version, baseHash, data}, site: {version, data, form}, texts, ignored, genConfig, assetsFrom }
 */
export async function fetchDraftSource(client, { site, dir, root = ROOT }) {
  const shop = await client.getShopDraft(site);
  const siteDraft = await client.getSiteDraft(site);
  const t = textsFromSiteDraft(siteDraft?.data, readSamplesSite(site, root));
  const w = writeSourceDir(dir, { site, shop: shop.data, texts: t.texts, root });
  return {
    dir, shopId: shop.shopId,
    shop: { version: shop.version, baseHash: shop.baseHash, data: shop.data },
    site: { version: siteDraft?.version ?? 0, data: siteDraft?.data ?? null, form: t.form },
    texts: t.texts, ignored: t.ignored, genConfig: w.genConfig, assetsFrom: "samples",
  };
}

/**
 * 公開された ① から「--from の形」に書く（rebuild-shop --from-api の元）。GET /edit-api/shops/:slug/published（鍵だけ）
 * apiAssets：版の写真を api から取る（無ければ samples の写真）
 * 返り：{ dir, shopId, version, scope, render, publishedAt, texts, ignored, genConfig, assetsFrom, afterGen }
 */
export async function fetchPublishedSource(client, { site, dir, apiAssets = false, root = ROOT }) {
  let v;
  try { v = await client.getPublished(site); }
  catch (e) { if (e instanceof ApiError && e.code === "not_published") throw new ApiError("not_published", `まだ公開していない：${site}`, { status: e.status, body: e.body }); throw e; }
  const n = v.number;
  const t = textsFromSiteDraft(v.site, readSamplesSite(site, root));
  const assets = apiAssets ? await fetchVersionAssets(client, site, v, { root }) : null;
  const w = writeSourceDir(dir, { site, shop: v.shop, texts: t.texts, assets, root });
  return { dir, shopId: v.shopId ?? null, version: n, scope: v.scope ?? null, render: v.render ?? null, publishedAt: v.publishedAt ?? null, texts: t.texts, ignored: t.ignored, siteForm: t.form, genConfig: w.genConfig, assetsFrom: assets ? "api" : "samples", afterGen: textsAfterGen(t.texts) };
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
