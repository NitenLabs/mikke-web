import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call, fakeJpeg, getDraft, newShop, publishAll, putDraft, siteData, upload, world } from "./helpers";

const site = (slug: string, path: string, o: { headers?: Record<string, string>; method?: string } = {}) =>
  call(o.method ?? "GET", path, { host: `${slug}.mikke.test`, headers: o.headers });

async function status(cookie: string, shopId: string) {
  return (await (await call("GET", `/api/shops/${shopId}/status`, { cookie })).json()) as any;
}

describe("D1 公開（下書きの写しを版に、HTML・CSS を R2 に）", () => {
  it("D1-1 公開すると、すぐに公開ページが新しくなる", async () => {
    const { owner, shop } = await world();
    expect((await status(owner.cookie, shop.id)).state).toBe("unpublished");
    const r = await publishAll(owner.cookie, shop.id, { "/": "<html>v1</html>", "/menu": "<html>menu</html>" }, { css: "body{color:#333}" });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.number).toBe(1);
    expect(body.url).toBe(`https://${shop.slug}.mikke.test/`);
    expect(await (await site(shop.slug, "/")).text()).toBe("<html>v1</html>");
    expect(await (await site(shop.slug, "/menu")).text()).toBe("<html>menu</html>");
    const css = await site(shop.slug, "/style.css");
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(await css.text()).toBe("body{color:#333}");
    // 2 回目
    await putDraft(owner.cookie, shop.id, "site", 1, siteData({ content: { F_b0: "直した" } }));
    expect((await publishAll(owner.cookie, shop.id, { "/": "<html>v2</html>" })).status).toBe(200);
    const top = await site(shop.slug, "/");
    expect(await top.text()).toBe("<html>v2</html>");
    expect(top.headers.get("cache-control")).toBe("no-cache");
    // v2 には /menu がない
    expect((await site(shop.slug, "/menu")).status).toBe(404);
  });

  it("D1-2 状態の文字：公開中と同じ → 直すと違う → 戻すと同じ", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id);
    expect((await status(owner.cookie, shop.id)).state).toBe("same");
    const orig = (await getDraft(owner.cookie, shop.id, "site")).data;
    await putDraft(owner.cookie, shop.id, "site", 1, siteData({ content: { x: "1" } }));
    const st = await status(owner.cookie, shop.id);
    expect(st.state).toBe("changed");
    expect(st.label).toBe("まだ公開していない変更があります");
    await putDraft(owner.cookie, shop.id, "site", 2, orig);
    expect((await status(owner.cookie, shop.id)).state).toBe("same");
  });

  it("D1-3 公開のあいだに下書きが変わっていたら 409（古い HTML で公開しない）", async () => {
    const { owner, shop } = await world();
    await putDraft(owner.cookie, shop.id, "site", 1, siteData({ content: { x: "1" } }));
    const r = await call("POST", `/api/shops/${shop.id}/publish`, {
      cookie: owner.cookie,
      json: { scope: "all", shopDraftVersion: 1, siteDraftVersion: 1, pages: { "/": "x" } },
    });
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).current.siteDraftVersion).toBe(2);
    expect((await site(shop.slug, "/")).status).toBe(404);
  });

  it("D1-4 ページの道・中身の検査", async () => {
    const { owner, shop } = await world();
    const bads = [{ "/menu": "x" }, { "/": "" }, { "/": "x", "../etc": "x" }, { "/": "x", "/Menu": "x" }, { "/": "x", "/a.html": "x" }, {}];
    for (const pages of bads) expect((await publishAll(owner.cookie, shop.id, pages as any)).status, JSON.stringify(pages)).toBe(400);
    expect((await publishAll(owner.cookie, shop.id, { "/": "x" }, { files: { "evil.js": "x" } })).status).toBe(400);
  });

  it("D1-5 お店の情報だけの公開（scope=shop）は、②③ を公開中の版から引き継ぐ", async () => {
    const { owner, shop } = await world();
    expect((await call("POST", `/api/shops/${shop.id}/publish`, { cookie: owner.cookie, json: { scope: "shop", shopDraftVersion: 1, pages: { "/": "x" } } })).status).toBe(409);
    await publishAll(owner.cookie, shop.id);
    await putDraft(owner.cookie, shop.id, "site", 1, siteData({ content: { x: "まだ出さない" } }));
    const s = await getDraft(owner.cookie, shop.id, "shop");
    await putDraft(owner.cookie, shop.id, "shop", s.version, { ...s.data, basic: { name: "新しい名前" } });
    const r = await call("POST", `/api/shops/${shop.id}/publish`, { cookie: owner.cookie, json: { scope: "shop", shopDraftVersion: 2, pages: { "/": "<html>shop</html>" } } });
    expect(r.status).toBe(200);
    const v = (await (await call("GET", `/api/shops/${shop.id}/versions/2`, { cookie: owner.cookie })).json()) as any;
    expect(v.scope).toBe("shop");
    expect(v.shop.basic.name).toBe("新しい名前");
    expect(v.site.draft.content).toBeUndefined();
  });

  it("D1-6 公開は変更の記録に残る", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id);
    const ch = (await (await call("GET", `/api/shops/${shop.id}/changes`, { cookie: owner.cookie })).json()) as any;
    expect(ch.changes[0]).toMatchObject({ layer: "publish", action: "publish", path: "/versions/1" });
  });
});

describe("D3 公開ページの配信（<スラッグ>.<公開のドメイン>）", () => {
  it("D3-1 ホスト名からお店を引く。ほかのお店のページは混ざらない", async () => {
    const { producer, owner, shop } = await world();
    const other = await newShop(producer.cookie);
    await publishAll(owner.cookie, shop.id, { "/": "<html>A</html>" });
    await publishAll(producer.cookie, other.id, { "/": "<html>B</html>" });
    expect(await (await site(shop.slug, "/")).text()).toBe("<html>A</html>");
    expect(await (await site(other.slug, "/")).text()).toBe("<html>B</html>");
    expect(await (await call("GET", "/", { host: `${shop.slug.toUpperCase()}.MIKKE.TEST:443` })).text()).toBe("<html>A</html>");
  });

  it("D3-2 ないページは 404。お店の 404 ページがあればそれを出す", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id, { "/": "top", "/404": "<html>みつかりません（芦屋堂）</html>" });
    const r = await site(shop.slug, "/nothing");
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("芦屋堂");
    expect((await site(shop.slug, "/404")).status).toBe(404);
  });

  it("D3-3 知らないお店・まだ公開していないお店は、決まった 404 ページ", async () => {
    const { shop } = await world();
    const r = await site(shop.slug, "/");
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(await r.text()).toContain("ページが見つかりません");
    expect((await site("no-such-shop", "/")).status).toBe(404);
  });

  it("D3-4 /menu と /menu/ は同じ。HEAD も答える。書き込みは 405", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id, { "/": "top", "/menu": "menu" });
    expect(await (await site(shop.slug, "/menu/")).text()).toBe("menu");
    const h = await site(shop.slug, "/menu", { method: "HEAD" });
    expect(h.status).toBe(200);
    expect((await site(shop.slug, "/", { method: "POST" })).status).toBe(405);
  });

  it("D3-5 同じ版なら 304（ETag）", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id);
    const r = await site(shop.slug, "/");
    const etag = r.headers.get("etag")!;
    expect((await site(shop.slug, "/", { headers: { "if-none-match": etag } })).status).toBe(304);
  });

  it("D3-6 公開ページのホストでは API を出さない（Cookie を持たせない）", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id);
    const r = await call("GET", "/api/me", { host: `${shop.slug}.mikke.test`, cookie: owner.cookie });
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toContain("text/html");
  });

  it("D3-7 サイトマップ・robots.txt を置ける（D5 の受け口）", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id, { "/": "x" }, { files: { "sitemap.xml": "<urlset/>", "robots.txt": "User-agent: *" } });
    const s = await site(shop.slug, "/sitemap.xml");
    expect(s.headers.get("content-type")).toContain("application/xml");
    expect(await s.text()).toBe("<urlset/>");
    expect(await (await site(shop.slug, "/robots.txt")).text()).toBe("User-agent: *");
  });

  it("D3-8 写真：公開中の版が指している写真だけ配る", async () => {
    const { owner, shop } = await world();
    const a = (await (await upload(owner.cookie, shop.id, fakeJpeg(40, 30))).json()) as any;
    const b = (await (await upload(owner.cookie, shop.id, fakeJpeg(40, 30))).json()) as any;
    await putDraft(owner.cookie, shop.id, "site", 1, siteData({ content: { F_p0: { asset: a.id } } }));
    // b はまだどこにも使っていない
    expect((await site(shop.slug, `/media/${a.id}`)).status).toBe(404);
    await publishAll(owner.cookie, shop.id, { "/": `<img src="/media/${a.id}">` });
    const img = await site(shop.slug, `/media/${a.id}`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(img.headers.get("cache-control")).toContain("immutable");
    expect((await site(shop.slug, `/media/${b.id}`)).status).toBe(404);
  });

  it("D3-9 ほかのお店の写真を指した公開は 400", async () => {
    const { producer, owner, shop } = await world();
    const other = await newShop(producer.cookie);
    const x = (await (await upload(producer.cookie, other.id, fakeJpeg(10, 10))).json()) as any;
    const r = await publishAll(owner.cookie, shop.id, { "/": `<img src="/media/${x.id}">` });
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).assets).toEqual([x.id]);
  });
});

describe("D4 履歴と「この版を下書きにする」", () => {
  it("D4-1 履歴は新しい方から 30。古い版の R2 のファイルも消える", async () => {
    const { owner, shop } = await world();
    for (let i = 1; i <= 32; i++) {
      const r = await publishAll(owner.cookie, shop.id, { "/": `<html>${i}</html>` });
      expect(r.status).toBe(200);
    }
    const list = (await (await call("GET", `/api/shops/${shop.id}/versions`, { cookie: owner.cookie })).json()) as any;
    expect(list.versions).toHaveLength(30);
    expect(list.versions[0]).toMatchObject({ number: 32, isPublished: true });
    expect(list.versions[29].number).toBe(3);
    expect(await env.BUCKET.get(`sites/${shop.id}/v1/pages/index.html`)).toBeNull();
    expect(await env.BUCKET.get(`sites/${shop.id}/v3/pages/index.html`)).not.toBeNull();
    expect((await call("GET", `/api/shops/${shop.id}/versions/1`, { cookie: owner.cookie })).status).toBe(404);
  }, 60_000);

  it("D4-2 前の版を見て、下書きに戻せる。公開中の版は変わらない", async () => {
    const { owner, shop } = await world();
    const v1 = siteData({ content: { F_b0: "一つ目" } });
    await putDraft(owner.cookie, shop.id, "site", 1, v1);
    await publishAll(owner.cookie, shop.id, { "/": "one" });
    await putDraft(owner.cookie, shop.id, "site", 2, siteData({ content: { F_b0: "二つ目" } }));
    await publishAll(owner.cookie, shop.id, { "/": "two" });
    const seen = (await (await call("GET", `/api/shops/${shop.id}/versions/1`, { cookie: owner.cookie })).json()) as any;
    expect(seen.site).toEqual(v1);
    const r = await call("POST", `/api/shops/${shop.id}/versions/1/restore`, { cookie: owner.cookie, json: { siteDraftVersion: 3 } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.drafts.site.version).toBe(4);
    expect(body.backupId).toBeNull(); // 戻す前の下書きは公開中（v2）と同じなので写しは要らない
    expect((await getDraft(owner.cookie, shop.id, "site")).data).toEqual(v1);
    expect(await (await site(shop.slug, "/")).text()).toBe("two");
    expect((await status(owner.cookie, shop.id)).state).toBe("changed");
  });

  it("D4-3 公開中と違う下書きを置き換えるときは「戻す前の下書き」に写しを残す。そこから戻せる", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id);
    const wip = siteData({ content: { F_b0: "書きかけ" } });
    await putDraft(owner.cookie, shop.id, "site", 1, wip);
    const r = await call("POST", `/api/shops/${shop.id}/versions/1/restore`, { cookie: owner.cookie, json: { siteDraftVersion: 2 } });
    const { backupId } = (await r.json()) as any;
    expect(backupId).toMatch(/^bak_/);
    const list = (await (await call("GET", `/api/shops/${shop.id}/backups`, { cookie: owner.cookie })).json()) as any;
    expect(list.backups[0].id).toBe(backupId);
    const bk = (await (await call("GET", `/api/shops/${shop.id}/backups/${backupId}`, { cookie: owner.cookie })).json()) as any;
    expect(bk.site).toEqual(wip);
    const back = await call("POST", `/api/shops/${shop.id}/backups/${backupId}/restore`, { cookie: owner.cookie, json: { siteDraftVersion: 3, shopDraftVersion: 1 } });
    expect(back.status).toBe(200);
    expect((await getDraft(owner.cookie, shop.id, "site")).data).toEqual(wip);
  });

  it("D4-4 戻す前の下書きは新しい方から 10", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id);
    let v = 1;
    for (let i = 0; i < 12; i++) {
      await putDraft(owner.cookie, shop.id, "site", v, siteData({ content: { i: String(i) } }));
      v++;
      const r = await call("POST", `/api/shops/${shop.id}/versions/1/restore`, { cookie: owner.cookie, json: { siteDraftVersion: v } });
      expect(r.status).toBe(200);
      v++;
    }
    const list = (await (await call("GET", `/api/shops/${shop.id}/backups`, { cookie: owner.cookie })).json()) as any;
    expect(list.backups).toHaveLength(10);
  }, 60_000);

  it("D4-5 ① も戻すのは includeShop のときだけ。古い版番号なら 409", async () => {
    const { owner, shop } = await world();
    await publishAll(owner.cookie, shop.id);
    const s = await getDraft(owner.cookie, shop.id, "shop");
    await putDraft(owner.cookie, shop.id, "shop", s.version, { ...s.data, basic: { name: "後から" } });
    expect((await call("POST", `/api/shops/${shop.id}/versions/1/restore`, { cookie: owner.cookie, json: { siteDraftVersion: 0 } })).status).toBe(409);
    await call("POST", `/api/shops/${shop.id}/versions/1/restore`, { cookie: owner.cookie, json: { siteDraftVersion: 1 } });
    expect((await getDraft(owner.cookie, shop.id, "shop")).data.basic.name).toBe("後から");
    const r = await call("POST", `/api/shops/${shop.id}/versions/1/restore`, { cookie: owner.cookie, json: { siteDraftVersion: 2, includeShop: true, shopDraftVersion: 2 } });
    expect(r.status).toBe(200);
    expect((await getDraft(owner.cookie, shop.id, "shop")).data.basic.name).toBe("試しの店");
  });
});
