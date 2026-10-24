import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { runDaily } from "../src/index";
import { visibleItemIds } from "../src/lib/visibility";
import { call, createUser, fakeJpeg, getDraft, publishAll, putDraft, upload, world } from "./helpers";

const catalogShop = (shopId: string) => ({
  schemaVersion: 1,
  shopId,
  basic: { name: "試しの店" },
  catalog: {
    menus: { mnu_tento: { name: "店頭", order: 1 } },
    categories: {},
    labels: {},
    items: {
      itm_always: { name: "いつも", status: "onSale" },
      itm_sakura: { name: "桜餅", status: "onSale", season: { months: [3, 4] } },
      itm_paused: { name: "お休み", status: "paused" },
      itm_unplaced: { name: "載せていない", status: "onSale" },
      itm_limited: { name: "その年だけ", status: "onSale", availableFrom: "2026-11-01", availableUntil: "2026-11-30" },
    },
    placements: {
      p1: { itemId: "itm_always", menuId: "mnu_tento", order: 1 },
      p2: { itemId: "itm_sakura", menuId: "mnu_tento", order: 2 },
      p3: { itemId: "itm_paused", menuId: "mnu_tento", order: 3 },
      p4: { itemId: "itm_limited", menuId: "mnu_tento", order: 4 },
    },
  },
});

describe("D6 毎日 0 時の描き直し（今は「要るお店の一覧」まで）", () => {
  it("D6-1 品を出す決まり（DATA_SPEC 3.4）：販売中・時期・期間・載っている", () => {
    const s = catalogShop("shp_x");
    expect(visibleItemIds(s, new Date("2026-10-24T03:00:00Z"))).toEqual(["itm_always"]);
    expect(visibleItemIds(s, new Date("2026-03-31T15:00:00Z"))).toEqual(["itm_always", "itm_sakura"]); // 日本時間 4/1 0:00
    expect(visibleItemIds(s, new Date("2026-11-30T14:59:00Z"))).toEqual(["itm_always", "itm_limited"]); // 日本時間 11/30 23:59
    expect(visibleItemIds(s, new Date("2026-11-30T15:00:00Z"))).toEqual(["itm_always"]); // 日本時間 12/1
  });

  it("D6-2 日付が変わって出す品が変わるお店だけ、描き直しの一覧に出る", async () => {
    const { owner, shop } = await world();
    const d = await getDraft(owner.cookie, shop.id, "shop");
    await putDraft(owner.cookie, shop.id, "shop", d.version, catalogShop(shop.id));
    await publishAll(owner.cookie, shop.id);
    // 2026-10-24 に描いたことにする（試験を走らせる日によらないように）
    const oct = visibleItemIds(catalogShop(shop.id), new Date("2026-10-24T03:00:00Z"));
    await env.DB.prepare("UPDATE shops SET rendered_visibility = ? WHERE id = ?").bind(JSON.stringify(oct), shop.id).run();
    const same = await runDaily(env, new Date("2026-10-25T15:00:00Z"));
    expect((same.rerender as any).shops.find((s: any) => s.shopId === shop.id)).toBeUndefined();
    const nov = await runDaily(env, new Date("2026-11-01T15:00:00Z"));
    expect((nov.rerender as any).date).toBe("2026-11-02");
    expect((nov.rerender as any).shops.find((s: any) => s.shopId === shop.id)).toMatchObject({ slug: shop.slug, added: ["itm_limited"], removed: [] });
  });

  it("D6-3 Cron の入口（scheduled）が走る。制作側は同じ一覧を API で見られる", async () => {
    const ctrl = createScheduledController({ scheduledTime: new Date("2026-10-24T15:00:00Z").getTime(), cron: "0 15 * * *" });
    const ctx = createExecutionContext();
    await worker.scheduled(ctrl, env, ctx);
    await waitOnExecutionContext(ctx);
    const { producer } = await world();
    const r = await call("GET", "/api/admin/rerender", { cookie: producer.cookie });
    expect(r.status).toBe(200);
    expect(Array.isArray(((await r.json()) as any).shops)).toBe(true);
  });
});

describe("毎日の仕事の守り（M1・L4）", () => {
  it("M1-3 1 軒の失敗（壊れたデータ）で、ほかのお店の描き直しの一覧・ゴミ箱の掃除が止まらない", async () => {
    const good = await world();
    const bad = await world();
    // ほかのお店：出す品が変わる・30 日たったゴミ箱の写真
    const d = await getDraft(good.owner.cookie, good.shop.id, "shop");
    await putDraft(good.owner.cookie, good.shop.id, "shop", d.version, catalogShop(good.shop.id));
    await publishAll(good.owner.cookie, good.shop.id);
    await env.DB.prepare("UPDATE shops SET rendered_visibility = '[]' WHERE id = ?").bind(good.shop.id).run();
    const ga = (await (await upload(good.owner.cookie, good.shop.id, fakeJpeg(10, 10))).json()) as any;
    // 壊れたお店：公開中の版と下書きが読めない
    await publishAll(bad.owner.cookie, bad.shop.id);
    const ba = (await (await upload(bad.owner.cookie, bad.shop.id, fakeJpeg(10, 10))).json()) as any;
    await env.DB.prepare("UPDATE versions SET shop_body = '{broken' WHERE shop_id = ?").bind(bad.shop.id).run();
    await env.DB.prepare("UPDATE drafts SET body = '{broken' WHERE shop_id = ?").bind(bad.shop.id).run();
    const old = new Date(Date.now() - 31 * 86400_000).toISOString();
    // 壊れた方が先に並ぶように
    await env.DB.prepare("UPDATE assets SET trashed_at = ? WHERE id = ?").bind(new Date(Date.now() - 32 * 86400_000).toISOString(), ba.id).run();
    await env.DB.prepare("UPDATE assets SET trashed_at = ? WHERE id = ?").bind(old, ga.id).run();
    const res = (await runDaily(env, new Date("2026-11-01T15:00:00Z"))) as any;
    expect(res.rerender.shops.find((s: any) => s.shopId === good.shop.id)).toBeTruthy();
    expect(res.rerender.failed.map((f: any) => f.shopId)).toContain(bad.shop.id);
    expect(res.purge.purged).toContain(ga.id);
    expect(res.purge.failed.map((f: any) => f.id)).toContain(ba.id);
    // 壊れたお店の写真は消さずに残す
    expect(await env.DB.prepare("SELECT purged_at FROM assets WHERE id = ?").bind(ba.id).first("purged_at")).toBeNull();
  });

  it("L4 期限の切れたログインの申し込み・セッション・古い失敗の記録を消す", async () => {
    const u = await createUser("owner");
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO login_requests (id, email, code_hash, token_hash, created_at, expires_at) VALUES (?, ?, 'x', ?, ?, ?)").bind(`lgn_old${now}`, u.email, `t_old${now}`, now - 3 * 86400_000, now - 2 * 86400_000),
      env.DB.prepare("INSERT INTO login_requests (id, email, code_hash, token_hash, created_at, expires_at) VALUES (?, ?, 'x', ?, ?, ?)").bind(`lgn_new${now}`, u.email, `t_new${now}`, now, now + 900_000),
      env.DB.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)").bind(`s_old${now}`, u.id, now - 100 * 86400_000, now - 1, now - 1),
      env.DB.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)").bind(`s_new${now}`, u.id, now, now + 86400_000, now),
      env.DB.prepare("INSERT INTO login_failures (email, at) VALUES (?, ?)").bind(u.email, now - 3 * 86400_000),
      env.DB.prepare("INSERT INTO login_failures (email, at) VALUES (?, ?)").bind(u.email, now - 3600_000),
    ]);
    await runDaily(env, new Date(now));
    const ids = (await env.DB.prepare("SELECT id FROM login_requests WHERE email = ?").bind(u.email).all()).results.map((r: any) => r.id);
    expect(ids).toEqual([`lgn_new${now}`]);
    const ss = (await env.DB.prepare("SELECT id_hash FROM sessions WHERE user_id = ?").bind(u.id).all()).results.map((r: any) => r.id_hash);
    expect(ss).toEqual([`s_new${now}`]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE email = ?").bind(u.email).first("n")).toBe(1);
  });
});
