import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { runDaily } from "../src/index";
import { visibleItemIds } from "../src/lib/visibility";
import { call, getDraft, publishAll, putDraft, world } from "./helpers";

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
