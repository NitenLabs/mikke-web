import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildSeed } from "../scripts/seed-lib.mjs";
import shop from "../../../samples/ashiyado/shop.json";
import assets from "../../../samples/ashiyado/assets.json";
import theme from "../../../samples/ashiyado/theme.json";
import { call, fakeJpeg, getDraft, login, publishAll } from "./helpers";

describe("種まき：芦屋堂（samples/ashiyado）でお店を 1 つ作る", () => {
  it("seed-1 お店・店主・下書き・写真ができ、店主がログインして開ける。何度流してもよい", async () => {
    const ownerEmail = `owner-${Date.now()}@ashiyado.example`;
    const producerEmail = `producer-${Date.now()}@example.com`;
    for (let round = 0; round < 2; round++) {
      const seed = buildSeed({ shop, assets, theme, producerEmail, ownerEmail });
      for (const sql of seed.statements) await env.DB.prepare(sql).run();
      for (const o of seed.objects) await env.BUCKET.put(o.key, fakeJpeg(16, 9), { httpMetadata: { contentType: o.mime } });
    }
    const cookie = await login(ownerEmail);
    const me = (await (await call("GET", "/api/me", { cookie })).json()) as any;
    expect(me.shops).toEqual([expect.objectContaining({ id: "shp_ashiyado", slug: "ashiyado", name: "御菓子司 芦屋堂" })]);
    const s = await getDraft(cookie, "shp_ashiyado", "shop");
    expect(s.data.basic.name).toBe("御菓子司 芦屋堂");
    const site = await getDraft(cookie, "shp_ashiyado", "site");
    expect(site.data.draft.template).toEqual({ name: "wa-01", version: 1 });
    expect(site.data.theme.fonts.heading).toBe("zen-old-mincho");
    expect(site.data.theme.recentColors).toBeUndefined();
    const list = (await (await call("GET", "/api/shops/shp_ashiyado/assets", { cookie })).json()) as any;
    expect(Object.keys(list.assets).sort()).toEqual(Object.keys(assets.assets).sort());
    expect(list.assets.ast_frma.origin.kind).toBe("stock");
    // 芦屋堂の写真を使って公開できる
    const r = await publishAll(cookie, "shp_ashiyado", { "/": '<img src="/media/ast_frma">' });
    expect(r.status).toBe(200);
    expect((await call("GET", "/media/ast_frma", { host: "ashiyado.mikke.test" })).status).toBe(200);
  });
});
