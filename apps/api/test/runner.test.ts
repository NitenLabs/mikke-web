import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call, getDraft, putDraft, world } from "./helpers";

const KEY = "test-runner-secret-0123456789abcdef-xyz";
const R = (key: string | null = KEY): Record<string, string> => (key ? { "x-edit-runner-secret": key } : {});

describe("段2 とのつなぎ：PC の runner が ① を読み書きする（/edit-api）", () => {
  it("R-1 鍵で ① を書き出せる（slug でも ID でも）。版と hash が付く", async () => {
    const { shop } = await world();
    for (const key of [shop.id, shop.slug]) {
      const r = await call("GET", `/edit-api/shops/${key}/shop`, { headers: R() });
      expect(r.status).toBe(200);
      const b = (await r.json()) as any;
      expect(b).toMatchObject({ shopId: shop.id, slug: shop.slug, version: 1 });
      expect(b.data.shopId).toBe(shop.id);
      expect(b.baseHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.headers.get("etag")).toBe('"1"');
    }
  });

  it("R-2 鍵がない・違うと 401、Worker に鍵がないと 503、知らないお店は 404", async () => {
    const { shop } = await world();
    expect((await call("GET", `/edit-api/shops/${shop.id}/shop`, { headers: R(null) })).status).toBe(401);
    expect((await call("GET", `/edit-api/shops/${shop.id}/shop`, { headers: R("x".repeat(40)) })).status).toBe(401);
    expect((await call("GET", `/edit-api/shops/shp_nothere/shop`, { headers: R() })).status).toBe(404);
    const keep = env.EDIT_RUNNER_SECRET;
    try {
      (env as any).EDIT_RUNNER_SECRET = undefined;
      expect((await call("GET", `/edit-api/shops/${shop.id}/shop`, { headers: R() })).status).toBe(503);
    } finally {
      (env as any).EDIT_RUNNER_SECRET = keep;
    }
  });

  it("R-3 承認済みの直しを当てた ① を書き戻す → 下書きの版が上がり、変更の記録は「仕組み」。公開はしない", async () => {
    const { owner, shop } = await world();
    const got = (await (await call("GET", `/edit-api/shops/${shop.slug}/shop`, { headers: R() })).json()) as any;
    const next = { ...got.data, hours: { weekly: { sat: { status: "open", periods: [{ start: "10:00", end: "17:00" }] } } } };
    const r = await call("PUT", `/edit-api/shops/${shop.slug}/shop`, { headers: { ...R(), "if-match": `"${got.version}"` }, json: next, origin: null });
    expect(r.status).toBe(200);
    const b = (await r.json()) as any;
    expect(b.version).toBe(2);
    expect(b.baseHash).not.toBe(got.baseHash);
    expect((await getDraft(owner.cookie, shop.id, "shop")).data.hours.weekly.sat.periods[0].end).toBe("17:00");
    const ch = (await (await call("GET", `/api/shops/${shop.id}/changes`, { cookie: owner.cookie })).json()) as any;
    expect(ch.changes[0].actor).toEqual({ kind: "system", name: "仕組み" });
    expect(((await (await call("GET", `/api/shops/${shop.id}`, { cookie: owner.cookie })).json()) as any).publishedVersion).toBeNull();
  });

  it("R-4 読んだ後に店主が編集画面で直していたら 409（runner は上書きしない）。If-Match なしは 428", async () => {
    const { owner, shop } = await world();
    const got = (await (await call("GET", `/edit-api/shops/${shop.id}/shop`, { headers: R() })).json()) as any;
    // 同じお店を店主が別の所（編集画面）で先に保存
    expect((await putDraft(owner.cookie, shop.id, "shop", got.version, { ...got.data, basic: { name: "店主の直し" } })).status).toBe(200);
    const r = await call("PUT", `/edit-api/shops/${shop.id}/shop`, { headers: { ...R(), "if-match": `"${got.version}"` }, json: { ...got.data, basic: { name: "runner の直し" } } });
    expect(r.status).toBe(409);
    const b = (await r.json()) as any;
    expect(b.error).toBe("conflict");
    expect(b.current.version).toBe(2);
    expect(b.current.data.basic.name).toBe("店主の直し");
    expect(b.current.baseHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await call("PUT", `/edit-api/shops/${shop.id}/shop`, { headers: R(), json: got.data })).status).toBe(428);
    expect((await getDraft(owner.cookie, shop.id, "shop")).data.basic.name).toBe("店主の直し");
  });

  it("R-5 形のおかしい ①（別のお店の shopId・入れ物でない）は 400", async () => {
    const { shop } = await world();
    for (const bad of [{ shopId: "shp_other" }, []])
      expect((await call("PUT", `/edit-api/shops/${shop.id}/shop`, { headers: { ...R(), "if-match": '"1"' }, json: bad })).status).toBe(400);
  });
});
