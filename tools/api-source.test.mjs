// apps/api とのつなぎ（0053 段D・0059 段G）の試験。api への呼び出しは偽物の fetch（通信しない）。samples/amet は読むだけ。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  API_ROUTES, ApiError, apiClient, draftVersions, fetchDraftSource, fetchPublishedSource, pagesFromDist, publishDrafts, publishFailure, publishRenderOf, publishSuccess, publishWithWait,
  photosFromSiteDraft, siteDraftForm, templateNameOf, textsAfterGen, textsFromSiteDraft, waitSecondsOf, withSiteTexts, writeSourceDir,
} from "./lib/api-source.mjs";
import { paragraphsToText, shopHash } from "./lib/edit-ops.mjs";
import { ROOT } from "./lib/rebuild.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "api-source-test-"));
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const AMET = path.join(ROOT, "samples", "amet");
const ametShop = () => readJson(path.join(AMET, "shop.json"));
const ametSite = () => readJson(path.join(AMET, "site.json"));
const FV = paragraphsToText(ametSite().elements.fv_copy.paragraphs);

/** 偽の api：routes は { "GET /edit-api/shops/amet/shop": (req) => [status, body] } */
function fakeApi(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const req = { method: init.method, path: u.pathname, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(req);
    const h = routes[`${req.method} ${req.path}`];
    if (!h) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    const [status, body, headers = {}] = h(req);
    if (Buffer.isBuffer(body)) return new Response(body, { status });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  };
  return { fetch, calls };
}
const KEY = "k".repeat(40);
const client = (fa, more = {}) => apiClient({ base: "http://api.test/", secret: KEY, fetch: fa.fetch, ...more });
const noCookie = (calls) => calls.every((c) => c.headers.cookie === undefined && c.headers.origin === undefined && c.headers["x-edit-runner-secret"] === KEY);

test("api：① の下書きを鍵で読み、If-Match を付けて書き戻す", async () => {
  const shop = ametShop();
  const fa = fakeApi({
    "GET /edit-api/shops/amet/shop": () => [200, { shopId: shop.shopId, slug: "amet", version: 4, baseHash: shopHash(shop), data: shop }],
    "PUT /edit-api/shops/amet/shop": (r) => [200, { shopId: shop.shopId, version: 5, baseHash: shopHash(r.body) }],
  });
  const c = client(fa);
  const got = await c.getShopDraft("amet");
  assert.equal(got.version, 4);
  assert.equal(fa.calls[0].headers["x-edit-runner-secret"], KEY);
  assert.equal(fa.calls[0].headers.cookie, undefined, "/edit-api に Cookie は送らない");
  const r = await c.putShopDraft("amet", 4, { ...shop, x: 1 });
  assert.equal(r.version, 5);
  assert.equal(fa.calls[1].headers["if-match"], '"4"');
  assert.equal(fa.calls[1].body.x, 1);
});

test("api：口はすべて /edit-api（鍵だけ）。409 は conflict・401 は auth・429 は too_soon と retryAfter・鍵が無ければ呼ぶ前に config", async () => {
  for (const [k, f] of Object.entries(API_ROUTES)) assert.match(f("amet", 1), /^\/edit-api\/shops\/amet\//, `${k} は /edit-api`);
  const fa = fakeApi({
    "PUT /edit-api/shops/amet/shop": () => [409, { error: "conflict", current: { version: 7 } }],
    "GET /edit-api/shops/x/shop": () => [401, { error: "unauthenticated" }],
  });
  const c = client(fa);
  await assert.rejects(c.putShopDraft("amet", 4, {}), (e) => e instanceof ApiError && e.code === "conflict" && e.body.current.version === 7);
  await assert.rejects(c.getShopDraft("x"), (e) => e.code === "auth" && e.status === 401);
  const n = fa.calls.length;
  await assert.rejects(client(fa, { secret: "" }).getShopDraft("amet"), (e) => e.code === "config");
  assert.equal(fa.calls.length, n, "足りないときは api を呼ばない");
  assert.throws(() => apiClient({}), (e) => e.code === "config");
  const fb = fakeApi({
    "POST /edit-api/shops/amet/publish": () => [429, { error: "too_soon", message: "1 分に 1 回まで", retryAfter: 42 }, { "retry-after": "42" }],
    "GET /edit-api/shops/b/published": () => [404, { error: "not_published" }],
    "POST /edit-api/shops/c/publish": () => [429, { error: "too_soon" }, { "retry-after": "17" }],
  });
  await assert.rejects(client(fb).publish("amet", {}), (e) => e.code === "too_soon" && e.retryAfter === 42 && e.status === 429);
  await assert.rejects(client(fb).getPublished("b"), (e) => e.code === "not_published");
  await assert.rejects(client(fb).publish("c", {}), (e) => e.retryAfter === 17, "本文に無ければ Retry-After から");
  await assert.rejects(client(fakeApi({ "POST /edit-api/shops/d/publish": () => [400, { error: "unsafe_html" }] })).publish("d", {}), (e) => e.code === "unsafe_html" && e.retryAfter === undefined, "待ちの値が無ければ retryAfter を付けない");
  assert.ok(noCookie(fb.calls));
});

test("② の文字：draft.content[要素ID] から取り出す（同じ文字・箱の無い ID・連動の箱は当てない）", () => {
  const site = ametSite();
  const bindId = Object.keys(site.elements).find((id) => (site.elements[id].paragraphs ?? []).some((p) => (p.runs ?? []).some((r) => r.bind)));
  const draft = { draft: { template: { name: "wa-03", version: 1 }, sections: {}, content: { fv_copy: "朝の、\n一杯。", nope: "x", ...(bindId ? { [bindId]: "y" } : {}) } } };
  const t = textsFromSiteDraft(draft, site);
  assert.deepEqual(t.texts, { fv_copy: "朝の、\n一杯。" });
  assert.ok(t.ignored.some((x) => x.id === "nope"));
  if (bindId) assert.ok(t.ignored.some((x) => x.id === bindId && /連動/.test(x.reason)));
  assert.deepEqual(textsFromSiteDraft({ draft: { content: { fv_copy: FV } } }, site), { texts: {}, same: ["fv_copy"], ignored: [], form: "content" });
  // 切れ目の並び（[{text}]）も文字として読む
  assert.deepEqual(textsFromSiteDraft({ draft: { content: { fv_copy: [{ text: "a" }, "b"] } } }, site).texts, { fv_copy: "ab" });
  assert.deepEqual(textsFromSiteDraft(null, site).texts, {});
});

test("② の文字：下書きに載せる（無ければ DATA_SPEC 4.9.3 の形で作る。元は変えない）", () => {
  assert.equal(templateNameOf(ametSite()), "wa-03");
  const made = withSiteTexts(null, { fv_copy: "新しい" }, "wa-03");
  assert.deepEqual(made.data, { draft: { template: { name: "wa-03", version: 1 }, sections: {}, content: { fv_copy: "新しい" } } });
  assert.equal(made.form, "content");
  const before = { draft: { template: { name: "wa-03", version: 1 }, sections: {}, content: { other: "o", fv_1: { asset: "ast_new0001" } }, added: [] }, theme: { t: 1 } };
  const next = withSiteTexts(before, { fv_copy: "新しい" }, "wa-03").data;
  assert.deepEqual(next.draft, { template: { name: "wa-03", version: 1 }, sections: {}, content: { other: "o", fv_1: { asset: "ast_new0001" }, fv_copy: "新しい" } }, "型の店の形に無い項目（added）は持たない。写真の値はそのまま");
  assert.deepEqual(next.theme, { t: 1 });
  assert.equal(before.draft.content.fv_copy, undefined);
  assert.throws(() => withSiteTexts(null, { a: "b" }, null), (e) => e.code === "site_draft");
});

test("②③ の下書きの形：site.json を丸ごと持つ古い形（0065 より前の seed）は読む・書くとも site_draft_form で止まる（黙って直さない）", () => {
  const site = ametSite();
  const gen = readJson(path.join(AMET, "wa03.json"));
  const oldForm = { draft: { ...site, template: { name: "wa-03", version: 1 }, genConfig: gen }, theme: { t: 1 } };
  assert.equal(siteDraftForm(oldForm), "old");
  assert.equal(siteDraftForm({ draft: { template: {}, sections: {}, genConfig: {} } }), "old");
  assert.equal(siteDraftForm({ draft: { template: {}, sections: {}, content: {} } }), "content");
  assert.equal(siteDraftForm(null), null);
  const stop = (e) => e instanceof ApiError && e.code === "site_draft_form" && /seed/.test(e.message);
  assert.throws(() => textsFromSiteDraft(oldForm, site), stop);
  assert.throws(() => photosFromSiteDraft(oldForm, site), stop);
  assert.throws(() => withSiteTexts(oldForm, { fv_copy: "x" }, "wa-03"), stop);
});

test("② の写真：content[要素ID] = {asset} から、元の素材と違う物だけ取り出す（cleared・bright は描けないので ignored。文字の値は見ない）", () => {
  const site = ametSite();
  const content = {
    fv_1: { asset: "ast_new0001" },
    fv_2: { asset: "ast_fv02" },
    fv_copy: "文字は写真ではない",
    nope: { asset: "ast_new0002" },
    st_ph1: { cleared: true },
  };
  const ph = photosFromSiteDraft({ draft: { template: { name: "wa-03", version: 1 }, sections: {}, content } }, site);
  assert.deepEqual(ph.photos, { fv_1: "ast_new0001" });
  assert.deepEqual(ph.same, ["fv_2"]);
  assert.ok(ph.ignored.some((x) => x.id === "nope"));
  assert.ok(ph.ignored.some((x) => x.id === "st_ph1" && /cleared/.test(x.reason)));
  // 文字の取り出しは写真の値を「文字の形でない」と数えない
  const t = textsFromSiteDraft({ draft: { content: { fv_1: { asset: "ast_new0001" }, fv_copy: "朝" } } }, site);
  assert.deepEqual(t.texts, { fv_copy: "朝" });
  assert.deepEqual(t.ignored, []);
  assert.deepEqual(photosFromSiteDraft(null, site).photos, {});
  assert.deepEqual(photosFromSiteDraft({ draft: { content: { fv_1: { asset: "ast_new0001", bright: 10 } } } }, site).photos, { fv_1: "ast_new0001" }, "bright は描けないが写真は替える");
});

test("--from の形に書く：差し替えた ② の写真は、元の素材の file を新しい写真に向ける（gen で戻らない。samples は変えない）", () => {
  const d = tmp();
  const assetsBefore = fs.readFileSync(path.join(AMET, "assets.json"), "utf8");
  const img = Buffer.from([0xff, 0xd8, 0x01, 0xff, 0xd9]);
  const base = readJson(path.join(AMET, "assets.json"));
  const json = { ...base, assets: { ...base.assets, ast_new0001: { kind: "photo", file: { key: "ast_new0001.jpg", mime: "image/jpeg", width: 10, height: 10 } } } };
  const w = writeSourceDir(d, { site: "amet", shop: ametShop(), photos: { fv_1: "ast_new0001" }, assets: { json, files: { "ast_new0001.jpg": img } } });
  assert.deepEqual(w.swapped, ["fv_1:ast_fv01→ast_new0001"]);
  const aj = readJson(path.join(d, "assets.json"));
  assert.equal(aj.assets.ast_fv01.file.key, "ast_new0001.jpg");
  assert.equal(aj.assets.ast_fv01.kind, base.assets.ast_fv01.kind, "台帳のほかの値は元のまま");
  assert.deepEqual(fs.readFileSync(path.join(d, "media", "ast_new0001.jpg")), img);
  assert.equal(fs.readFileSync(path.join(AMET, "assets.json"), "utf8"), assetsBefore);
  assert.equal(fs.readFileSync(path.join(d, "site.json"), "utf8"), fs.readFileSync(path.join(AMET, "site.json"), "utf8"), "文字が無ければ site.json は samples のまま");
  // 新しい写真の台帳・ファイルが無ければ止まる
  assert.throws(() => writeSourceDir(tmp(), { site: "amet", shop: ametShop(), photos: { fv_1: "ast_none0001" } }), (e) => e.code === "assets");
  assert.throws(() => writeSourceDir(tmp(), { site: "amet", shop: ametShop(), photos: { fv_1: "ast_new0001" }, assets: { json, files: {} } }), (e) => e.code === "assets");
});

test("--from の形に書く：samples の設定に api の ① と文字を重ねる（samples は変えない）", () => {
  const d = tmp();
  const shop = { ...ametShop(), basic: { ...ametShop().basic, name: "API の名前" } };
  const siteBefore = fs.readFileSync(path.join(AMET, "site.json"), "utf8");
  const w = writeSourceDir(d, { site: "amet", shop, texts: { fv_copy: "朝の、\n一杯。" } });
  assert.equal(readJson(path.join(d, "shop.json")).basic.name, "API の名前");
  assert.equal(paragraphsToText(readJson(path.join(d, "site.json")).elements.fv_copy.paragraphs), "朝の、\n一杯。");
  assert.ok(w.files.includes("assets.json") && w.files.includes("wa03.json"));
  assert.equal(w.genConfig.file, "wa03.json");
  assert.equal(w.genConfig.replaced.length + w.genConfig.missing.length, 1);
  assert.equal(fs.readFileSync(path.join(AMET, "site.json"), "utf8"), siteBefore);
  assert.ok(!fs.existsSync(path.join(d, "media")), "写真は samples の物を makeStage が写す");
  // gen の後に戻った文字を当て直す
  const sd = tmp();
  fs.copyFileSync(path.join(AMET, "site.json"), path.join(sd, "site.json"));
  textsAfterGen({ fv_copy: "朝の、\n一杯。" })({ shopDir: sd });
  assert.equal(paragraphsToText(readJson(path.join(sd, "site.json")).elements.fv_copy.paragraphs), "朝の、\n一杯。");
  assert.throws(() => writeSourceDir(d, { site: "../x", shop }), (e) => e.code === "site");
});

test("今の下書きを読む：① と ②③ の下書き（どちらも /edit-api の鍵だけ）", async () => {
  const shop = ametShop();
  const fa = fakeApi({
    "GET /edit-api/shops/amet/shop": () => [200, { shopId: shop.shopId, slug: "amet", version: 2, baseHash: shopHash(shop), data: shop }],
    "GET /edit-api/shops/amet/site": () => [200, { shopId: shop.shopId, slug: "amet", kind: "site", version: 3, data: { draft: { template: { name: "wa-03", version: 1 }, sections: {}, content: { fv_copy: "下書きの文字" } } } }],
  });
  const d = tmp();
  const s = await fetchDraftSource(client(fa), { site: "amet", dir: d });
  assert.equal(s.shop.version, 2);
  assert.deepEqual({ version: s.site.version, form: s.site.form }, { version: 3, form: "content" });
  assert.deepEqual(s.texts, { fv_copy: "下書きの文字" });
  assert.equal(s.assetsFrom, "samples");
  assert.deepEqual(s.swapped, []);
  assert.ok(noCookie(fa.calls), "Cookie・Origin は送らない");
  // ② で写真を差し替えた下書き：今の ④ の台帳（…/assets/:id）とファイルを取り、元の素材の file を向ける
  const img = Buffer.from([0xff, 0xd8, 0x02, 0xff, 0xd9]);
  const fp = fakeApi({
    "GET /edit-api/shops/amet/shop": () => [200, { shopId: shop.shopId, slug: "amet", version: 2, baseHash: "h", data: shop }],
    "GET /edit-api/shops/amet/site": () => [200, { shopId: shop.shopId, kind: "site", version: 4, data: { draft: { template: { name: "wa-03", version: 1 }, sections: {}, content: { fv_1: { asset: "ast_up000001" } } } } }],
    "GET /edit-api/shops/amet/assets/ast_up000001": () => [200, { id: "ast_up000001", kind: "photo", file: { key: "assets/shp_amet/ast_up000001.jpg", mime: "image/jpeg", width: 1200, height: 800 } }],
    "GET /edit-api/shops/amet/assets/ast_up000001/file": () => [200, img],
  });
  const dp = tmp();
  const sp = await fetchDraftSource(client(fp), { site: "amet", dir: dp });
  assert.deepEqual(sp.photos, { fv_1: "ast_up000001" });
  assert.deepEqual(sp.swapped, ["fv_1:ast_fv01→ast_up000001"]);
  assert.equal(sp.assetsFrom, "samples+api");
  const ajp = readJson(path.join(dp, "assets.json"));
  assert.equal(ajp.assets.ast_fv01.file.key, "ast_up000001.jpg");
  assert.equal(ajp.assets.ast_up000001.id, undefined, "台帳に id は持たない（キーが ID）");
  assert.deepEqual(fs.readFileSync(path.join(dp, "media", "ast_up000001.jpg")), img);
  assert.ok(fp.calls.some((c) => c.path === API_ROUTES.asset("amet", "ast_up000001")));
  // 古い形の下書きは止まる
  const fo = fakeApi({
    "GET /edit-api/shops/amet/shop": () => [200, { shopId: shop.shopId, slug: "amet", version: 2, baseHash: "h", data: shop }],
    "GET /edit-api/shops/amet/site": () => [200, { shopId: shop.shopId, kind: "site", version: 1, data: { draft: { ...ametSite(), template: { name: "wa-03", version: 1 } } } }],
  });
  await assert.rejects(fetchDraftSource(client(fo), { site: "amet", dir: tmp() }), (e) => e.code === "site_draft_form");
  // ②③ の下書きがまだ無い（版 0）
  const fa2 = fakeApi({
    "GET /edit-api/shops/amet/shop": () => [200, { shopId: shop.shopId, slug: "amet", version: 2, baseHash: "h", data: shop }],
    "GET /edit-api/shops/amet/site": () => [200, { shopId: shop.shopId, kind: "site", version: 0, data: null }],
  });
  const s2 = await fetchDraftSource(client(fa2), { site: "amet", dir: tmp() });
  assert.deepEqual({ version: s2.site.version, form: s2.site.form }, { version: 0, form: null });
  assert.deepEqual(await draftVersions(client(fa2), "amet"), { shopId: shop.shopId, shopDraftVersion: 2, siteDraftVersion: undefined });
});

test("公開された ① から --from の形に（rebuild-shop --from-api。/published を鍵で）。版の写真・まだ公開していなければ not_published", async () => {
  const shop = { ...ametShop(), basic: { ...ametShop().basic, name: "公開した名前" } };
  const img = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const routes = {
    "GET /edit-api/shops/amet/published": () => [200, { shopId: shop.shopId, slug: "amet", number: 3, scope: "all", publishedAt: "2026-11-11T00:00:00Z", isPublished: true, render: "pending", shop, site: { draft: { template: { name: "wa-03" }, sections: {}, content: { fv_copy: "公開した文字" } } }, assets: { schemaVersion: 1, assets: { ast_fv01: { kind: "photo", file: { key: "assets/shp_amet/ast_fv01.jpg", mime: "image/jpeg" } } } } }],
    "GET /edit-api/shops/amet/assets/ast_fv01/file": () => [200, img],
  };
  const d = tmp();
  const fa = fakeApi(routes);
  const s = await fetchPublishedSource(client(fa), { site: "amet", dir: d, apiAssets: true });
  assert.deepEqual({ version: s.version, shopId: s.shopId, render: s.render }, { version: 3, shopId: shop.shopId, render: "pending" });
  assert.equal(readJson(path.join(d, "shop.json")).basic.name, "公開した名前");
  assert.equal(paragraphsToText(readJson(path.join(d, "site.json")).elements.fv_copy.paragraphs), "公開した文字");
  assert.equal(typeof s.afterGen, "function");
  const aj = readJson(path.join(d, "assets.json"));
  assert.equal(aj.assets.ast_fv01.file.key, "ast_fv01.jpg", "R2 の名前でなく media/ の名前");
  assert.ok(Object.keys(aj.assets).length > 1, "版に無い写真は samples のまま");
  assert.deepEqual(fs.readFileSync(path.join(d, "media", "ast_fv01.jpg")), img);
  assert.ok(noCookie(fa.calls));
  // --api-assets なしでも、② で差し替えた写真だけは版の写真を api から取る
  const pubWithPhoto = () => [200, { shopId: shop.shopId, slug: "amet", number: 5, scope: "all", render: "pending", shop, site: { draft: { template: { name: "wa-03", version: 1 }, sections: {}, content: { fv_1: { asset: "ast_up000001" } } } }, assets: { schemaVersion: 1, assets: { ast_fv01: { kind: "photo", file: { key: "assets/shp_amet/ast_fv01.jpg", mime: "image/jpeg" } }, ast_up000001: { kind: "photo", file: { key: "assets/shp_amet/ast_up000001.png", mime: "image/png" } } } } }];
  const fq = fakeApi({ "GET /edit-api/shops/amet/published": pubWithPhoto, "GET /edit-api/shops/amet/assets/ast_up000001/file": () => [200, img] });
  const dq = tmp();
  const q = await fetchPublishedSource(client(fq), { site: "amet", dir: dq });
  assert.deepEqual(q.swapped, ["fv_1:ast_fv01→ast_up000001"]);
  assert.equal(q.assetsFrom, "samples+api");
  assert.equal(readJson(path.join(dq, "assets.json")).assets.ast_fv01.file.key, "ast_up000001.png");
  assert.deepEqual(fs.readdirSync(path.join(dq, "media")), ["ast_up000001.png"], "差し替えた写真だけ取る");
  assert.ok(!fq.calls.some((c) => c.path.endsWith("/ast_fv01/file")));
  const fb = fakeApi({ "GET /edit-api/shops/amet/published": () => [404, { error: "not_published", message: "まだ公開していません" }] });
  await assert.rejects(fetchPublishedSource(client(fb), { site: "amet", dir: tmp() }), (e) => e.code === "not_published");
});

test("下書き → 公開：書き出しの HTML を pages に（index → /）。scope は ②③ の版があれば all", async () => {
  const d = tmp();
  for (const [f, s] of [["index.html", "<p>top</p>"], ["menu.html", "<p>m</p>"], ["Bad_Name.html", "x"], ["a/index.html", "<p>a</p>"], ["assets/x.css", "b{}"]]) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), s);
  }
  const p = pagesFromDist(d);
  assert.deepEqual(Object.keys(p.pages).sort(), ["/", "/a", "/menu"]);
  assert.deepEqual(p.skipped, ["Bad_Name.html"]);
  const fa = fakeApi({ "POST /edit-api/shops/amet/publish": (r) => [200, { number: 4, scope: r.body.scope, pages: Object.keys(r.body.pages) }] });
  const r = await publishDrafts(client(fa), "amet", { shopDraftVersion: 5, siteDraftVersion: 2, distDir: d });
  assert.equal(r.number, 4);
  const sent = fa.calls[0];
  assert.deepEqual({ scope: sent.body.scope, shop: sent.body.shopDraftVersion, site: sent.body.siteDraftVersion }, { scope: "all", shop: 5, site: 2 });
  assert.ok(noCookie([sent]));
  await publishDrafts(client(fa), "amet", { shopDraftVersion: 5, distDir: d });
  assert.equal(fa.calls[1].body.scope, "shop");
  assert.equal(fa.calls[1].body.siteDraftVersion, undefined);
  const e = tmp();
  await assert.rejects(publishDrafts(client(fa), "amet", { shopDraftVersion: 1, distDir: e }), (x) => x.code === "publish");
});

test("下書き → 公開（render rebuild）：型の店は pages を送らず版だけ。描いた結果は /edit-api の render の口に鍵で返す", async () => {
  assert.equal(publishRenderOf(ametSite()), "rebuild", "wa-03 の店は rebuild");
  assert.equal(publishRenderOf({ templateId: "wa-01-editor" }), "html");
  const fa = fakeApi({
    "POST /edit-api/shops/amet/publish": (r) => [200, { number: 7, scope: r.body.scope, pages: [], render: r.body.render === "rebuild" ? "pending" : "html" }],
    "POST /edit-api/shops/amet/versions/7/render": (r) => [200, { shopId: "shp_1", number: 7, render: r.body.ok ? "ok" : "failed" }],
  });
  const r = await publishDrafts(client(fa), "amet", { shopDraftVersion: 5, siteDraftVersion: 2, distDir: tmp(), render: "rebuild" });
  assert.deepEqual({ number: r.number, render: r.render }, { number: 7, render: "pending" });
  assert.equal(fa.calls[0].body.render, "rebuild");
  assert.equal(fa.calls[0].body.pages, undefined, "rebuild のときは pages を送らない（送ると 400）");
  await assert.rejects(publishDrafts(client(fa), "amet", { shopDraftVersion: 5, distDir: tmp(), render: "x" }), (x) => x.code === "publish");
  const a = await client(fa).postRenderResult("amet", 7, { ok: true });
  assert.equal(a.render, "ok");
  assert.equal(fa.calls.at(-1).headers["x-edit-runner-secret"], KEY);
});

test("公開の待ち：too_soon は retryAfter（＋1 秒）だけ待って順にやり直す（偽の時計）。3 回待っても too_soon なら投げる。ほかの失敗は待たない", async () => {
  let n = 0;
  const fa = fakeApi({
    "POST /edit-api/shops/amet/publish": (r) => (++n <= 2 ? [429, { error: "too_soon", retryAfter: n === 1 ? 37 : 5 }] : [200, { number: 9, scope: r.body.scope, render: "pending", pages: [] }]),
  });
  const slept = [];
  const sleep = async (ms) => { slept.push(ms); };
  const args = { shopDraftVersion: 4, siteDraftVersion: 2, distDir: tmp(), render: "rebuild" };
  const r = await publishWithWait(client(fa), "amet", args, { sleep });
  assert.equal(r.number, 9);
  assert.deepEqual(r.waits, [38, 6]);
  assert.deepEqual(slept, [38000, 6000]);
  assert.equal(fa.calls.length, 3);
  assert.deepEqual(publishSuccess(r, "T"), { ok: true, at: "T", number: 9, scope: "all", render: "pending", publishedAt: undefined, pages: [], skipped: [], url: null, waits: [38, 6] });
  // 待っても空かない
  const fb = fakeApi({ "POST /edit-api/shops/amet/publish": () => [429, { error: "too_soon", retryAfter: 60 }] });
  const slept2 = [];
  await assert.rejects(publishWithWait(client(fb), "amet", args, { sleep: async (ms) => slept2.push(ms) }), (e) => {
    const f = publishFailure(e, "T");
    assert.deepEqual(f, { ok: false, at: "T", errorCode: "too_soon", error: f.error, retryAfter: 60, waits: [61, 61, 61] });
    return e.code === "too_soon";
  });
  assert.equal(fb.calls.length, 4);
  // unsafe_html などは待たずに投げる（下書きは書けたまま。--republish でやり直す）
  const fc = fakeApi({ "POST /edit-api/shops/amet/publish": () => [400, { error: "unsafe_html", message: "動かせないスクリプト" }] });
  await assert.rejects(publishWithWait(client(fc), "amet", args, { sleep: async () => assert.fail("待たない") }), (e) => e.code === "unsafe_html" && publishFailure(e).errorCode === "unsafe_html");
  assert.equal(waitSecondsOf({ retryAfter: 0 }), 1);
  assert.equal(waitSecondsOf({}), 61);
  assert.equal(waitSecondsOf({ retryAfter: 500 }), 70);
});
