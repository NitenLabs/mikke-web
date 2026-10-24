import { describe, expect, it } from "vitest";
import { call, fakeJpeg, getDraft, newOwner, newShop, putDraft, siteData, upload, world } from "./helpers";

describe("B2 権限（店主は自分のお店だけ・制作側は全部）", () => {
  it("B2-1 店主は自分のお店の下書きを読み書きできる", async () => {
    const { owner, shop } = await world();
    const d = await getDraft(owner.cookie, shop.id, "site");
    expect(d.version).toBe(1);
    expect((await putDraft(owner.cookie, shop.id, "site", 1, siteData())).status).toBe(200);
  });

  it("B2-2 店主はほかのお店に何もできない（あるかどうかも分からないよう 404）", async () => {
    const { producer, owner } = await world();
    const other = await newShop(producer.cookie);
    const paths: [string, string, unknown?][] = [
      ["GET", `/api/shops/${other.id}`],
      ["GET", `/api/shops/${other.id}/drafts/site`],
      ["PUT", `/api/shops/${other.id}/drafts/site`, siteData()],
      ["GET", `/api/shops/${other.id}/versions`],
      ["POST", `/api/shops/${other.id}/publish`, { scope: "all", shopDraftVersion: 1, siteDraftVersion: 1, pages: { "/": "x" } }],
      ["GET", `/api/shops/${other.id}/assets`],
      ["GET", `/api/shops/${other.id}/changes`],
      ["GET", `/api/shops/${other.id}/settings`],
      ["GET", `/api/shops/${other.id}/status`],
      ["GET", `/api/shops/${other.id}/backups`],
    ];
    for (const [m, p, json] of paths) {
      const r = await call(m, p, { cookie: owner.cookie, json, headers: m === "PUT" ? { "if-match": '"1"' } : {} });
      expect(r.status, `${m} ${p}`).toBe(404);
    }
    const up = await upload(owner.cookie, other.id, fakeJpeg(10, 10));
    expect(up.status).toBe(404);
    // 一覧にも出ない
    const me = (await (await call("GET", "/api/me", { cookie: owner.cookie })).json()) as any;
    expect(me.shops.map((s: any) => s.id)).not.toContain(other.id);
  });

  it("B2-3 制作側はどのお店も直せる", async () => {
    const { producer, shop } = await world();
    const other = await newShop(producer.cookie);
    for (const id of [shop.id, other.id]) {
      expect((await putDraft(producer.cookie, id, "site", 1, siteData())).status).toBe(200);
    }
    const me = (await (await call("GET", "/api/me", { cookie: producer.cookie })).json()) as any;
    expect(me.shops.map((s: any) => s.id)).toEqual(expect.arrayContaining([shop.id, other.id]));
  });

  it("B2-4 店主は制作側の操作（お店・ユーザーを作る）ができない", async () => {
    const owner = await newOwner();
    expect((await call("POST", "/api/admin/shops", { cookie: owner.cookie, json: { slug: "zzz", name: "x" } })).status).toBe(403);
    expect((await call("POST", "/api/admin/users", { cookie: owner.cookie, json: { email: "x@example.com", role: "producer" } })).status).toBe(403);
    expect((await call("GET", "/api/admin/rerender", { cookie: owner.cookie })).status).toBe(403);
  });

  it("B2-5 店主の写真の ID を知っていても、ほかの店主は見られない", async () => {
    const a = await world();
    const b = await newOwner();
    const up = (await (await upload(a.owner.cookie, a.shop.id, fakeJpeg(20, 10))).json()) as any;
    expect((await call("GET", `/api/shops/${a.shop.id}/assets/${up.id}/file`, { cookie: b.cookie })).status).toBe(404);
    expect((await call("GET", `/api/shops/${a.shop.id}/assets/${up.id}/file`, { cookie: a.owner.cookie })).status).toBe(200);
  });

  it("B2-6 つながりを外したら直せなくなる", async () => {
    const { producer, owner, shop } = await world();
    const me = (await (await call("GET", "/api/me", { cookie: owner.cookie })).json()) as any;
    expect((await call("DELETE", `/api/admin/shops/${shop.id}/members/${me.user.id}`, { cookie: producer.cookie })).status).toBe(200);
    expect((await call("GET", `/api/shops/${shop.id}/drafts/site`, { cookie: owner.cookie })).status).toBe(404);
  });

  it("B2-7 スラッグは英小文字・数字・ハイフンだけ。予約語・重なりは断る", async () => {
    const { producer, shop } = await world();
    for (const slug of ["Ashiya", "a_b", "-ab", "app", "www", "a".repeat(40), "a--b"]) {
      const r = await call("POST", "/api/admin/shops", { cookie: producer.cookie, json: { slug, name: "x" } });
      expect(r.status, slug).toBe(400);
    }
    expect((await call("POST", "/api/admin/shops", { cookie: producer.cookie, json: { slug: shop.slug, name: "x" } })).status).toBe(409);
  });
});
