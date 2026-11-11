// apps/api とのつなぎ（0053 段D）の試験。api への呼び出しは偽物の fetch（通信しない）。samples/amet は読むだけ。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ApiError, apiClient, fetchDraftSource, fetchPublishedSource, pagesFromDist, publishDrafts, publishRenderOf, templateNameOf, textsAfterGen, textsFromSiteDraft, withSiteTexts, writeSourceDir,
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
    const [status, body] = h(req);
    if (Buffer.isBuffer(body)) return new Response(body, { status });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}
const KEY = "k".repeat(40);
const client = (fa, more = {}) => apiClient({ base: "http://api.test/", secret: KEY, cookie: "mikke_session=abc", origin: "http://app.test", fetch: fa.fetch, ...more });

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

test("api：409 は conflict（今の版を body に持つ）・401 は auth・鍵や Cookie・Origin が無ければ呼ぶ前に config", async () => {
  const fa = fakeApi({
    "PUT /edit-api/shops/amet/shop": () => [409, { error: "conflict", current: { version: 7 } }],
    "GET /edit-api/shops/x/shop": () => [401, { error: "unauthenticated" }],
  });
  const c = client(fa);
  await assert.rejects(c.putShopDraft("amet", 4, {}), (e) => e instanceof ApiError && e.code === "conflict" && e.body.current.version === 7);
  await assert.rejects(c.getShopDraft("x"), (e) => e.code === "auth" && e.status === 401);
  const n = fa.calls.length;
  await assert.rejects(client(fa, { secret: "" }).getShopDraft("amet"), (e) => e.code === "config");
  await assert.rejects(client(fa, { cookie: "" }).getSiteDraft("shp_1"), (e) => e.code === "config" && /Cookie/.test(e.message));
  await assert.rejects(client(fa, { origin: "" }).putSiteDraft("shp_1", 1, {}), (e) => e.code === "config" && /Origin/.test(e.message));
  assert.equal(fa.calls.length, n, "足りないときは api を呼ばない");
  assert.throws(() => apiClient({}), (e) => e.code === "config");
});

test("② の文字：draft.content[要素ID] から取り出す（同じ文字・箱の無い ID・連動の箱は当てない）", () => {
  const site = ametSite();
  const bindId = Object.keys(site.elements).find((id) => (site.elements[id].paragraphs ?? []).some((p) => (p.runs ?? []).some((r) => r.bind)));
  const draft = { draft: { template: { name: "wa-03", version: 1 }, sections: {}, content: { fv_copy: "朝の、\n一杯。", nope: "x", ...(bindId ? { [bindId]: "y" } : {}) } } };
  const t = textsFromSiteDraft(draft, site);
  assert.deepEqual(t.texts, { fv_copy: "朝の、\n一杯。" });
  assert.ok(t.ignored.some((x) => x.id === "nope"));
  if (bindId) assert.ok(t.ignored.some((x) => x.id === bindId && /連動/.test(x.reason)));
  assert.deepEqual(textsFromSiteDraft({ draft: { content: { fv_copy: FV } } }, site), { texts: {}, same: ["fv_copy"], ignored: [] });
  // 切れ目の並び（[{text}]）も文字として読む
  assert.deepEqual(textsFromSiteDraft({ draft: { content: { fv_copy: [{ text: "a" }, "b"] } } }, site).texts, { fv_copy: "ab" });
  assert.deepEqual(textsFromSiteDraft(null, site).texts, {});
});

test("② の文字：下書きに載せる（無ければ型の名前から作る。元は変えない）", () => {
  assert.equal(templateNameOf(ametSite()), "wa-03");
  const made = withSiteTexts(null, { fv_copy: "新しい" }, "wa-03");
  assert.deepEqual(made, { draft: { template: { name: "wa-03", version: 1 }, sections: {}, content: { fv_copy: "新しい" } } });
  const before = { draft: { template: { name: "wa-03", version: 1 }, sections: { a: 1 }, content: { other: "o" } }, theme: { t: 1 } };
  const next = withSiteTexts(before, { fv_copy: "新しい" }, "wa-03");
  assert.deepEqual(next.draft.content, { other: "o", fv_copy: "新しい" });
  assert.deepEqual(next.theme, { t: 1 });
  assert.equal(before.draft.content.fv_copy, undefined);
  assert.throws(() => withSiteTexts(null, { a: "b" }, null), (e) => e.code === "site_draft");
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

test("今の下書きを読む：① と ②③ の下書きの文字・写真（--api-assets）", async () => {
  const shop = ametShop();
  const img = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const fa = fakeApi({
    "GET /edit-api/shops/amet/shop": () => [200, { shopId: shop.shopId, slug: "amet", version: 2, baseHash: shopHash(shop), data: shop }],
    [`GET /api/shops/${shop.shopId}/drafts/site`]: () => [200, { kind: "site", version: 3, data: { draft: { template: { name: "wa-03", version: 1 }, sections: {}, content: { fv_copy: "下書きの文字" } } } }],
    [`GET /api/shops/${shop.shopId}/assets`]: () => [200, { schemaVersion: 1, assets: { ast_fv01: { kind: "photo", file: { key: "ast_fv01.jpg" } } } }],
    [`GET /api/shops/${shop.shopId}/assets/ast_fv01/file`]: () => [200, img],
  });
  const d = tmp();
  const s = await fetchDraftSource(client(fa), { site: "amet", dir: d, apiAssets: true });
  assert.equal(s.shop.version, 2);
  assert.equal(s.site.version, 3);
  assert.deepEqual(s.texts, { fv_copy: "下書きの文字" });
  assert.equal(s.assetsFrom, "api");
  assert.deepEqual(fs.readFileSync(path.join(d, "media", "ast_fv01.jpg")), img);
  assert.deepEqual(Object.keys(readJson(path.join(d, "assets.json")).assets), ["ast_fv01"]);
  assert.equal(fa.calls.find((c) => c.path.endsWith("/drafts/site")).headers.cookie, "mikke_session=abc");
  // Cookie が無いとき：② は読まない（samples の文字のまま）
  const fa2 = fakeApi({ "GET /edit-api/shops/amet/shop": () => [200, { shopId: shop.shopId, slug: "amet", version: 2, baseHash: "h", data: shop }] });
  const s2 = await fetchDraftSource(client(fa2, { cookie: "" }), { site: "amet", dir: tmp(), withSite: false });
  assert.equal(s2.site, null);
  assert.equal(s2.assetsFrom, "samples");
});

test("公開された ① から --from の形に（rebuild-shop --from-api）。まだ公開していなければ not_published", async () => {
  const shop = { ...ametShop(), basic: { ...ametShop().basic, name: "公開した名前" } };
  const routes = {
    "GET /edit-api/shops/amet/shop": () => [200, { shopId: shop.shopId, slug: "amet", version: 9, baseHash: "h", data: { ...shop, basic: { name: "まだ公開していない下書き" } } }],
    [`GET /api/shops/${shop.shopId}`]: () => [200, { id: shop.shopId, slug: "amet", publishedVersion: 3 }],
    [`GET /api/shops/${shop.shopId}/versions/3`]: () => [200, { number: 3, scope: "all", publishedAt: "2026-11-11T00:00:00Z", shop, site: { draft: { template: { name: "wa-03" }, sections: {}, content: { fv_copy: "公開した文字" } } } }],
  };
  const d = tmp();
  const s = await fetchPublishedSource(client(fakeApi(routes)), { site: "amet", dir: d });
  assert.equal(s.version, 3);
  assert.equal(readJson(path.join(d, "shop.json")).basic.name, "公開した名前", "下書きでなく公開した版の ①");
  assert.equal(paragraphsToText(readJson(path.join(d, "site.json")).elements.fv_copy.paragraphs), "公開した文字");
  assert.equal(typeof s.afterGen, "function");
  const fa = fakeApi({ ...routes, [`GET /api/shops/${shop.shopId}`]: () => [200, { publishedVersion: null }] });
  await assert.rejects(fetchPublishedSource(client(fa), { site: "amet", dir: tmp() }), (e) => e.code === "not_published");
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
  const fa = fakeApi({ "POST /api/shops/shp_1/publish": (r) => [200, { number: 4, scope: r.body.scope, pages: Object.keys(r.body.pages) }] });
  const r = await publishDrafts(client(fa), "shp_1", { shopDraftVersion: 5, siteDraftVersion: 2, distDir: d });
  assert.equal(r.number, 4);
  const sent = fa.calls[0];
  assert.deepEqual({ scope: sent.body.scope, shop: sent.body.shopDraftVersion, site: sent.body.siteDraftVersion }, { scope: "all", shop: 5, site: 2 });
  assert.equal(sent.headers.origin, "http://app.test");
  assert.equal(sent.headers.cookie, "mikke_session=abc");
  await publishDrafts(client(fa), "shp_1", { shopDraftVersion: 5, distDir: d });
  assert.equal(fa.calls[1].body.scope, "shop");
  assert.equal(fa.calls[1].body.siteDraftVersion, undefined);
  const e = tmp();
  await assert.rejects(publishDrafts(client(fa), "shp_1", { shopDraftVersion: 1, distDir: e }), (x) => x.code === "publish");
});

test("下書き → 公開（render rebuild）：型の店は pages を送らず版だけ。描いた結果は /edit-api の render の口に鍵で返す", async () => {
  assert.equal(publishRenderOf(ametSite()), "rebuild", "wa-03 の店は rebuild");
  assert.equal(publishRenderOf({ templateId: "wa-01-editor" }), "html");
  const fa = fakeApi({
    "POST /api/shops/shp_1/publish": (r) => [200, { number: 7, scope: r.body.scope, pages: [], render: r.body.render === "rebuild" ? "pending" : "html" }],
    "POST /edit-api/shops/amet/versions/7/render": (r) => [200, { shopId: "shp_1", number: 7, render: r.body.ok ? "ok" : "failed" }],
  });
  const r = await publishDrafts(client(fa), "shp_1", { shopDraftVersion: 5, siteDraftVersion: 2, distDir: tmp(), render: "rebuild" });
  assert.deepEqual({ number: r.number, render: r.render }, { number: 7, render: "pending" });
  assert.equal(fa.calls[0].body.render, "rebuild");
  assert.equal(fa.calls[0].body.pages, undefined, "rebuild のときは pages を送らない（送ると 400）");
  await assert.rejects(publishDrafts(client(fa), "shp_1", { shopDraftVersion: 5, distDir: tmp(), render: "x" }), (x) => x.code === "publish");
  const a = await client(fa).postRenderResult("amet", 7, { ok: true });
  assert.equal(a.render, "ok");
  assert.equal(fa.calls.at(-1).headers["x-edit-runner-secret"], KEY);
});
