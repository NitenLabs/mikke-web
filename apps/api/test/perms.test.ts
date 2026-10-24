import { describe, expect, it } from "vitest";
import { call, fakeJpeg, getDraft, newOwner, newShop, publishAll, putDraft, siteData, upload, world } from "./helpers";

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

describe("B2 権限（見直しで足した道）", () => {
  it("B2-8 ほかのお店の版・戻す・戻す前の下書き・写真の読み書き・設定の保存は、どれも 404", async () => {
    const { producer, owner } = await world();
    const other = await newShop(producer.cookie);
    await publishAll(producer.cookie, other.id);
    const a = (await (await upload(producer.cookie, other.id, fakeJpeg(10, 10))).json()) as any;
    // 戻す前の下書きを 1 つ作る
    await putDraft(producer.cookie, other.id, "site", 1, siteData({ content: { x: "1" } }));
    const rr = (await (await call("POST", `/api/shops/${other.id}/versions/1/restore`, { cookie: producer.cookie, json: { siteDraftVersion: 2 } })).json()) as any;
    const bak = rr.backupId as string;
    expect(bak).toMatch(/^bak_/);
    const tries: [string, string, unknown?][] = [
      ["GET", `/api/shops/${other.id}/versions/1`],
      ["POST", `/api/shops/${other.id}/versions/1/restore`, { siteDraftVersion: 3 }],
      ["GET", `/api/shops/${other.id}/backups/${bak}`],
      ["POST", `/api/shops/${other.id}/backups/${bak}/restore`, { siteDraftVersion: 3, shopDraftVersion: 1 }],
      ["GET", `/api/shops/${other.id}/assets/${a.id}`],
      ["GET", `/api/shops/${other.id}/assets/${a.id}/file`],
      ["PATCH", `/api/shops/${other.id}/assets/${a.id}`, { alt: "x" }],
      ["DELETE", `/api/shops/${other.id}/assets/${a.id}`],
      ["POST", `/api/shops/${other.id}/assets/${a.id}/restore`, {}],
      ["PUT", `/api/shops/${other.id}/settings`, { recentColors: ["#000000"] }],
      ["PUT", `/api/shops/${other.id}/drafts/shop`, { basic: { name: "乗っ取り" } }],
    ];
    for (const [m, p, json] of tries) {
      const r = await call(m, p, { cookie: owner.cookie, json, headers: m === "PUT" && p.includes("drafts") ? { "if-match": '"1"' } : {} });
      expect(r.status, `${m} ${p}`).toBe(404);
    }
    // 何も変わっていない
    expect((await getDraft(producer.cookie, other.id, "site")).version).toBe(3);
    const after = (await (await call("GET", `/api/shops/${other.id}/assets/${a.id}`, { cookie: producer.cookie })).json()) as any;
    expect(after.alt).toBeUndefined();
    expect(after.trashedAt).toBeUndefined();
  });

  it("B2-9 自分のお店の ID ＋ ほかのお店の写真の ID でも、見る・直す・ゴミ箱は 404", async () => {
    const { producer, owner, shop } = await world();
    const other = await newShop(producer.cookie);
    const a = (await (await upload(producer.cookie, other.id, fakeJpeg(10, 10))).json()) as any;
    for (const [m, p, json] of [
      ["GET", `/api/shops/${shop.id}/assets/${a.id}`],
      ["GET", `/api/shops/${shop.id}/assets/${a.id}/file`],
      ["PATCH", `/api/shops/${shop.id}/assets/${a.id}`, { alt: "x" }],
      ["DELETE", `/api/shops/${shop.id}/assets/${a.id}`],
      ["POST", `/api/shops/${shop.id}/assets/${a.id}/restore`, {}],
    ] as [string, string, unknown?][]) {
      expect((await call(m, p, { cookie: owner.cookie, json })).status, `${m} ${p}`).toBe(404);
    }
  });

  it("B2-10 店主は制作側の道（お店の一覧・店主をつなぐ／外す・ゴミ箱の掃除）を使えない", async () => {
    const { owner, shop } = await world();
    const me = (await (await call("GET", "/api/me", { cookie: owner.cookie })).json()) as any;
    const tries: [string, string, unknown?][] = [
      ["GET", "/api/admin/shops"],
      ["POST", `/api/admin/shops/${shop.id}/members`, { email: "x@example.com" }],
      ["DELETE", `/api/admin/shops/${shop.id}/members/${me.user.id}`],
      ["POST", "/api/admin/purge-trash", {}],
    ];
    for (const [m, p, json] of tries) expect((await call(m, p, { cookie: owner.cookie, json })).status, `${m} ${p}`).toBe(403);
    // つながりは外れていない
    expect((await call("GET", `/api/shops/${shop.id}`, { cookie: owner.cookie })).status).toBe(200);
  });

  it("B2-11 道のまぎらわしい書き方（../・%2e%2e・大文字・%2F）でも、ほかのお店に届かない", async () => {
    const { producer, owner, shop } = await world();
    const other = await newShop(producer.cookie);
    for (const p of [
      `/api/shops/${shop.id}/../${other.id}/drafts/site`,
      `/api/shops/${shop.id}/%2e%2e/${other.id}/drafts/site`,
      `/api/shops//${other.id}/drafts/site`,
      `/api/shops/${other.id.toUpperCase()}/drafts/site`,
      `/api/shops/${other.id}%2Fdrafts%2Fsite`,
    ]) {
      const r = await call("GET", p, { cookie: owner.cookie });
      expect(r.status, p).toBe(404);
    }
  });

  it("B2-12 L7 店主に見せる記録・履歴には、制作側の人のメールアドレスと ID を入れない", async () => {
    const { producer, owner, shop } = await world();
    const s = await getDraft(producer.cookie, shop.id, "shop");
    await putDraft(producer.cookie, shop.id, "shop", s.version, { ...s.data, basic: { name: "制作側が直した" } });
    await publishAll(producer.cookie, shop.id);
    const asOwner = await (await call("GET", `/api/shops/${shop.id}/changes`, { cookie: owner.cookie })).text();
    const verOwner = await (await call("GET", `/api/shops/${shop.id}/versions`, { cookie: owner.cookie })).text();
    const v1Owner = await (await call("GET", `/api/shops/${shop.id}/versions/1`, { cookie: owner.cookie })).json() as any;
    const stOwner = await (await call("GET", `/api/shops/${shop.id}/status`, { cookie: owner.cookie })).json() as any;
    for (const t of [asOwner, verOwner, JSON.stringify(v1Owner.publishedBy), JSON.stringify(stOwner.published)]) {
      expect(t).not.toContain(producer.email);
      expect(t).not.toContain(producer.id);
    }
    expect(JSON.parse(asOwner).changes[0].actor).toEqual({ kind: "producer", name: "制作側" });
    // 制作側には見せる
    const asProd = await (await call("GET", `/api/shops/${shop.id}/changes`, { cookie: producer.cookie })).json() as any;
    expect(asProd.changes[0].actor.email).toBe(producer.email);
  });
});
