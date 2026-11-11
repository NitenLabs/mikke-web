import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildSeed, wa03SiteDraft } from "../scripts/seed-lib.mjs";
import ametShop from "../../../samples/amet/shop.json";
import ametAssets from "../../../samples/amet/assets.json";
import ametTheme from "../../../samples/amet/theme.json";
import ametSite from "../../../samples/amet/site.json";
import ametWa03 from "../../../samples/amet/wa03.json";
import { allowPublish, call, fakeJpeg, getDraft, login, publishAll, putDraft, siteData, upload, world } from "./helpers";

const KEY = "test-runner-secret-0123456789abcdef-xyz";
const R = { "x-edit-runner-secret": KEY };

/** 店主の画面の公開：pages を送らず、①② の写しだけの版を作る */
async function publishRebuild(cookie: string, shopId: string, extra: Record<string, unknown> = {}) {
  await allowPublish(shopId);
  const shopD = await getDraft(cookie, shopId, "shop");
  const siteD = await getDraft(cookie, shopId, "site");
  return call("POST", `/api/shops/${shopId}/publish`, {
    cookie,
    json: { scope: "all", render: "rebuild", shopDraftVersion: shopD.version, siteDraftVersion: siteD.version, ...extra },
  });
}

/** 写真を 1 枚上げて ① に載せる */
async function withPhoto(cookie: string, shopId: string) {
  const a = (await (await upload(cookie, shopId, fakeJpeg(1200, 800))).json()) as { id: string };
  const shopD = await getDraft(cookie, shopId, "shop");
  expect((await putDraft(cookie, shopId, "shop", shopD.version, { ...shopD.data, story: { photo: a.id } })).status).toBe(200);
  const siteD = await getDraft(cookie, shopId, "site");
  if (!siteD.version) expect((await putDraft(cookie, shopId, "site", 0, siteData())).status).toBe(200);
  return a.id;
}

describe("公開の描き直し（render:rebuild。指示 0054）", () => {
  it("RB-1 pages 無しで版ができる。答え {number, render:pending}。/versions・/status・版に render。API の公開ページでは出さない", async () => {
    const { owner, shop } = await world();
    const ast = await withPhoto(owner.cookie, shop.id);
    const r = await publishRebuild(owner.cookie, shop.id);
    expect(r.status).toBe(200);
    const b = (await r.json()) as any;
    expect(b).toMatchObject({ number: 1, render: "pending", pages: [], url: null, assets: [ast] });

    const list = (await (await call("GET", `/api/shops/${shop.id}/versions`, { cookie: owner.cookie })).json()) as any;
    expect(list.versions[0]).toMatchObject({ number: 1, isPublished: true, pages: [], render: { state: "pending", error: null, url: null } });
    const st = (await (await call("GET", `/api/shops/${shop.id}/status`, { cookie: owner.cookie })).json()) as any;
    expect(st).toMatchObject({ state: "same", published: { number: 1, render: { state: "pending" } } });
    const v = (await (await call("GET", `/api/shops/${shop.id}/versions/1`, { cookie: owner.cookie })).json()) as any;
    expect(v.render.state).toBe("pending");
    expect(v.shop.story.photo).toBe(ast);

    // 店は Pages に出る。API の公開ページ（サブドメイン）は見つからない
    expect((await call("GET", "/", { host: `${shop.slug}.mikke.test` })).status).toBe(404);
    expect((await call("GET", `/media/${ast}`, { host: `${shop.slug}.mikke.test` })).status).toBe(404);
  });

  it("RB-2 rebuild に pages・css・files を付けると 400、知らない render も 400。html の公開は今までどおり render:html", async () => {
    const { owner, shop } = await world();
    await putDraft(owner.cookie, shop.id, "site", 0, siteData());
    for (const extra of [{ pages: { "/": "<p>x</p>" } }, { css: "a{}" }, { files: { "robots.txt": "" } }]) {
      const r = await publishRebuild(owner.cookie, shop.id, extra);
      expect(r.status).toBe(400);
    }
    expect((await publishRebuild(owner.cookie, shop.id, { render: "pdf" })).status).toBe(400);
    const h = await publishAll(owner.cookie, shop.id);
    expect(h.status).toBe(200);
    const hb = (await h.json()) as any;
    expect(hb.render).toBe("html");
    expect(hb.url).toMatch(/^https:\/\//);
    const list = (await (await call("GET", `/api/shops/${shop.id}/versions`, { cookie: owner.cookie })).json()) as any;
    expect(list.versions[0].render).toEqual({ state: "html", error: null, url: null, renderedAt: null });
    expect((await call("GET", "/", { host: `${shop.slug}.mikke.test` })).status).toBe(200);
  });

  it("RB-3 /edit-api：版の ①②・写真の一覧、写真のファイル、描き直しの結果（ok・failed）。鍵が要る", async () => {
    const { owner, shop } = await world();
    const ast = await withPhoto(owner.cookie, shop.id);
    const n = ((await (await publishRebuild(owner.cookie, shop.id)).json()) as any).number;

    expect((await call("GET", `/edit-api/shops/${shop.slug}/versions/${n}`)).status).toBe(401);
    const g = await call("GET", `/edit-api/shops/${shop.slug}/versions/${n}`, { headers: R });
    expect(g.status).toBe(200);
    const v = (await g.json()) as any;
    expect(v).toMatchObject({ shopId: shop.id, slug: shop.slug, number: n, scope: "all", isPublished: true, render: { state: "pending" } });
    expect(v.shop.story.photo).toBe(ast);
    expect(v.site.draft.template.name).toBe("wa-01");
    expect(Object.keys(v.assets.assets)).toEqual([ast]);
    expect(v.assets.assets[ast].file.width).toBe(1200);
    expect((await call("GET", `/edit-api/shops/${shop.slug}/versions/99`, { headers: R })).status).toBe(404);

    const f = await call("GET", `/edit-api/shops/${shop.slug}/assets/${ast}/file`, { headers: R });
    expect(f.status).toBe(200);
    expect(f.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await f.arrayBuffer()).length).toBe(fakeJpeg(1200, 800).length);
    expect((await call("GET", `/edit-api/shops/${shop.slug}/assets/ast_nothere1/file`, { headers: R })).status).toBe(404);
    expect((await call("GET", `/edit-api/shops/${shop.slug}/assets/${ast}/file`)).status).toBe(401);

    const post = (body: unknown) => call("POST", `/edit-api/shops/${shop.slug}/versions/${n}/render`, { headers: R, json: body, origin: null });
    expect((await post({ ok: false })).status).toBe(400);
    expect((await post({ ok: true, url: "javascript:alert(1)" })).status).toBe(400);
    expect((await post({ ok: true, extra: 1 })).status).toBe(400);
    const bad = await post({ ok: false, error: "rebuild-shop が止まりました" });
    expect(bad.status).toBe(200);
    expect(((await bad.json()) as any).render).toMatchObject({ state: "failed", error: "rebuild-shop が止まりました" });
    const good = await post({ ok: true, url: "https://amet.pages.dev/" });
    expect(good.status).toBe(200);
    const st = (await (await call("GET", `/api/shops/${shop.id}/status`, { cookie: owner.cookie })).json()) as any;
    expect(st.published.render).toMatchObject({ state: "ok", error: null, url: "https://amet.pages.dev/" });
    expect(st.published.render.renderedAt).toMatch(/^\d{4}-/);
    // 鍵が無いと書けない
    expect((await call("POST", `/edit-api/shops/${shop.slug}/versions/${n}/render`, { json: { ok: true }, origin: null })).status).toBe(401);
  });

  it("RB-4 html の版に描き直しの結果を送ると 409", async () => {
    const { owner, shop } = await world();
    await putDraft(owner.cookie, shop.id, "site", 0, siteData());
    const n = ((await (await publishAll(owner.cookie, shop.id)).json()) as any).number;
    const r = await call("POST", `/edit-api/shops/${shop.id}/versions/${n}/render`, { headers: R, json: { ok: true }, origin: null });
    expect(r.status).toBe(409);
  });
});

describe("GET /api/config", () => {
  it("CF-1 line は LINE_LOGIN_CHANNEL_ID があるときだけ true（ログインの前に読める）", async () => {
    const r = await call("GET", "/api/config");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ line: true });
    const keep = env.LINE_LOGIN_CHANNEL_ID;
    try {
      for (const v of [undefined, "", "  "]) {
        (env as any).LINE_LOGIN_CHANNEL_ID = v;
        expect(await (await call("GET", "/api/config")).json()).toEqual({ line: false });
      }
    } finally {
      (env as any).LINE_LOGIN_CHANNEL_ID = keep;
    }
  });
});

describe("種まき：AMET（samples/amet、wa-03）", () => {
  it("SA-1 お店 amet・店主・①④・② {draft:{...site.json, template wa-03, genConfig}, theme} ができ、店主が開けて、rebuild で公開できる", async () => {
    const ownerEmail = `owner-${Date.now()}@amet.example`;
    const siteDraft = wa03SiteDraft({ site: ametSite, genConfig: ametWa03, theme: ametTheme });
    const seed = buildSeed({ shop: ametShop, assets: ametAssets, theme: ametTheme, slug: "amet", producerEmail: `p-${Date.now()}@example.com`, ownerEmail, template: "wa-03", siteDraft });
    for (const sql of seed.statements) await env.DB.prepare(sql).run();
    for (const o of seed.objects) await env.BUCKET.put(o.key, fakeJpeg(16, 9), { httpMetadata: { contentType: o.mime } });
    expect(seed.objects.length).toBe(19);

    const cookie = await login(ownerEmail);
    const me = (await (await call("GET", "/api/me", { cookie })).json()) as any;
    expect(me.shops).toEqual([expect.objectContaining({ id: "shp_amet", slug: "amet" })]);
    const shopInfo = (await (await call("GET", "/api/shops/shp_amet", { cookie })).json()) as any;
    expect(shopInfo.template).toBe("wa-03");
    const site = await getDraft(cookie, "shp_amet", "site");
    expect(site.data.draft.template).toEqual({ name: "wa-03", version: 1 });
    expect(site.data.draft.genConfig.fvCopy).toEqual(ametWa03.fvCopy);
    expect(site.data.draft.elements).toEqual(ametSite.elements);
    expect(site.data.theme.recentColors).toBeUndefined();
    // api の下書きの確かめを通る（そのまま保存し直せる）
    expect((await putDraft(cookie, "shp_amet", "site", site.version, site.data)).status).toBe(200);
    const r = await publishRebuild(cookie, "shp_amet");
    expect(r.status).toBe(200);
    const v = (await (await call("GET", `/edit-api/shops/amet/versions/${((await r.json()) as any).number}`, { headers: R })).json()) as any;
    expect(Object.keys(v.assets.assets).length).toBeGreaterThan(0);
  });
});
