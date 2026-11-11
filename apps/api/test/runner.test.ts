import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { allowPublish, call, fakeJpeg, getDraft, putDraft, upload, world } from "./helpers";

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

describe("鍵だけで回す口：②③ の下書き・公開・公開した版（/edit-api。指示 0059）", () => {
  const wa = (content: Record<string, unknown>) => ({ draft: { template: { name: "wa-03", version: 1 }, sections: {}, content } });

  it("R-6 鍵がない・違うと 401（4 つの口とも）。Cookie も Origin も無しで通る", async () => {
    const { shop } = await world();
    const paths: [string, string, unknown?][] = [
      ["GET", `/edit-api/shops/${shop.slug}/site`],
      ["PUT", `/edit-api/shops/${shop.slug}/site`, wa({})],
      ["POST", `/edit-api/shops/${shop.slug}/publish`, { scope: "all", render: "rebuild", shopDraftVersion: 1, siteDraftVersion: 1 }],
      ["GET", `/edit-api/shops/${shop.slug}/published`],
    ];
    for (const [m, p, json] of paths) {
      for (const key of [null, "x".repeat(40)]) {
        const r = await call(m, p, { headers: { ...R(key), "if-match": '"0"' }, json, origin: null });
        expect(r.status, `${m} ${p} ${key}`).toBe(401);
      }
    }
    const r = await call("GET", `/edit-api/shops/${shop.slug}/site`, { headers: R(), origin: null });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ shopId: shop.id, slug: shop.slug, kind: "site" });
  });

  it("R-7 ②③ の下書きを読み書き：If-Match なしは 428、古い版は 409（今の版を返す）、書くと版が上がり記録は「仕組み」", async () => {
    const { owner, shop } = await world();
    const got = (await (await call("GET", `/edit-api/shops/${shop.id}/site`, { headers: R() })).json()) as any;
    const v0 = got.version;
    expect((await call("PUT", `/edit-api/shops/${shop.id}/site`, { headers: R(), json: wa({ fv_copy: "春の\nことば" }), origin: null })).status).toBe(428);
    const w = await call("PUT", `/edit-api/shops/${shop.id}/site`, { headers: { ...R(), "if-match": `"${v0}"` }, json: wa({ fv_copy: "春の\nことば" }), origin: null });
    expect(w.status).toBe(200);
    const wb = (await w.json()) as any;
    expect(wb).toMatchObject({ shopId: shop.id, kind: "site", version: v0 + 1 });
    expect(w.headers.get("etag")).toBe(`"${v0 + 1}"`);
    const mine = await getDraft(owner.cookie, shop.id, "site");
    expect(mine.data.draft.content.fv_copy).toBe("春の\nことば");
    expect(mine.data.draft.sections).toEqual({});
    // 店主が先に保存 → 古い版で書くと 409
    expect((await putDraft(owner.cookie, shop.id, "site", mine.version, wa({ fv_copy: "店主の直し" }))).status).toBe(200);
    const c = await call("PUT", `/edit-api/shops/${shop.id}/site`, { headers: { ...R(), "if-match": `"${v0 + 1}"` }, json: wa({ fv_copy: "runner" }), origin: null });
    expect(c.status).toBe(409);
    const cb = (await c.json()) as any;
    expect(cb.error).toBe("conflict");
    expect(cb.current.version).toBe(v0 + 2);
    expect(cb.current.data.draft.content.fv_copy).toBe("店主の直し");
    // 形のおかしい ②③ は 400
    expect((await call("PUT", `/edit-api/shops/${shop.id}/site`, { headers: { ...R(), "if-match": `"${v0 + 2}"` }, json: { draft: { template: { name: "wa-03" } } } })).status).toBe(400);
    const ch = (await (await call("GET", `/api/shops/${shop.id}/changes`, { cookie: owner.cookie })).json()) as any;
    expect(ch.changes.some((x: any) => x.actor.kind === "system" && x.layer !== "publish")).toBe(true);
  });

  it("R-8 鍵で公開（rebuild）→ 公開した版を読める。続けて公開すると 429 too_soon と retryAfter（秒）。まだ公開していなければ 404", async () => {
    const { owner, shop } = await world();
    expect((await call("GET", `/edit-api/shops/${shop.slug}/published`, { headers: R() })).status).toBe(404);
    const site = (await (await call("GET", `/edit-api/shops/${shop.slug}/site`, { headers: R() })).json()) as any;
    const w = (await (await call("PUT", `/edit-api/shops/${shop.slug}/site`, { headers: { ...R(), "if-match": `"${site.version}"` }, json: wa({ fv_copy: "表紙" }) })).json()) as any;
    const shopD = (await (await call("GET", `/edit-api/shops/${shop.slug}/shop`, { headers: R() })).json()) as any;
    const body = { scope: "all", render: "rebuild", shopDraftVersion: shopD.version, siteDraftVersion: w.version };
    const p = await call("POST", `/edit-api/shops/${shop.slug}/publish`, { headers: R(), json: body, origin: null });
    expect(p.status).toBe(200);
    const pb = (await p.json()) as any;
    expect(pb).toMatchObject({ shopId: shop.id, scope: "all", render: "pending", url: null });
    expect(typeof pb.number).toBe("number");
    const pub = await call("GET", `/edit-api/shops/${shop.slug}/published`, { headers: R() });
    expect(pub.status).toBe(200);
    const vb = (await pub.json()) as any;
    expect(vb).toMatchObject({ shopId: shop.id, slug: shop.slug, number: pb.number, isPublished: true, scope: "all" });
    expect(vb.site.draft.content.fv_copy).toBe("表紙");
    expect(vb.render.state).toBe("pending");
    // /api から見ても同じ版が公開中。公開したのは「仕組み」
    expect(((await (await call("GET", `/api/shops/${shop.id}`, { cookie: owner.cookie })).json()) as any).publishedVersion).toBe(pb.number);
    // 1 分に 1 回まで
    const again = await call("POST", `/edit-api/shops/${shop.slug}/publish`, { headers: R(), json: body, origin: null });
    expect(again.status).toBe(429);
    const ab = (await again.json()) as any;
    expect(ab.error).toBe("too_soon");
    expect(ab.retryAfter).toBeGreaterThan(0);
    expect(ab.retryAfter).toBeLessThanOrEqual(60);
    expect(again.headers.get("retry-after")).toBe(String(ab.retryAfter));
    // 1 分たてば通る。古い下書きの版なら 409
    await allowPublish(shop.id);
    expect((await call("POST", `/edit-api/shops/${shop.slug}/publish`, { headers: R(), json: { ...body, siteDraftVersion: w.version - 1 } })).status).toBe(409);
  });
  it("R-9 写真の台帳 1 件を鍵で読む（下書きの時点の ② の写真のため。0065）：鍵なしは 401、ある写真は 200（file の mime・幅・高さ）、無い・よそのお店の写真は 404", async () => {
    const { owner, shop } = await world();
    const other = await world();
    const a = (await (await upload(owner.cookie, shop.id, fakeJpeg(32, 18))).json()) as any;
    const b = (await (await upload(other.owner.cookie, other.shop.id, fakeJpeg(10, 10))).json()) as any;
    const p = (id: string) => `/edit-api/shops/${shop.slug}/assets/${id}`;
    expect((await call("GET", p(a.id), { headers: R(null), origin: null })).status).toBe(401);
    const r = await call("GET", p(a.id), { headers: R(), origin: null });
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j).toMatchObject({ id: a.id, file: { mime: "image/jpeg", width: 32, height: 18 } });
    expect(typeof j.file.key).toBe("string");
    expect((await call("GET", p("ast_nothere0000"), { headers: R() })).status).toBe(404);
    expect((await call("GET", p(b.id), { headers: R() })).status).toBe(404);
    expect((await call("GET", `${p(a.id)}/file`, { headers: R() })).status).toBe(200);
  });
});
