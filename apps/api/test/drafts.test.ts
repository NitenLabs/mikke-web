import { describe, expect, it } from "vitest";
import { call, getDraft, login, publishAll, putDraft, siteData, world } from "./helpers";

describe("B3 下書きはサーバーに保存され、別の端末でも同じ", () => {
  it("B3-1 保存した下書きを、別のセッション（別の端末）で開くと同じ", async () => {
    const { owner, shop } = await world();
    const data = siteData({ content: { F_b0: "季節の意匠。" } });
    const r = await putDraft(owner.cookie, shop.id, "site", 1, data);
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).version).toBe(2);
    expect(r.headers.get("etag")).toBe('"2"');
    const other = await login(owner.email); // 2 台目
    expect(other).not.toBe(owner.cookie);
    const d = await getDraft(other, shop.id, "site");
    expect(d.version).toBe(2);
    expect(d.data).toEqual(data);
  });

  it("B3-2 ① お店の情報の下書きも同じように持つ", async () => {
    const { owner, shop } = await world();
    const d = await getDraft(owner.cookie, shop.id, "shop");
    expect(d.data.shopId).toBe(shop.id);
    const next = { ...d.data, basic: { name: "試しの店", tagline: "季節の和菓子" } };
    expect((await putDraft(owner.cookie, shop.id, "shop", d.version, next)).status).toBe(200);
    expect((await getDraft(owner.cookie, shop.id, "shop")).data.basic.tagline).toBe("季節の和菓子");
  });

  it("B3-3 形のおかしい下書きは 400（中身を壊さない）", async () => {
    const { owner, shop } = await world();
    const bads = [[], "x", { draft: {} }, { draft: { template: { name: "wa-01" } } }, { draft: { template: { name: "wa-01" }, sections: {} }, extra: 1 }];
    for (const b of bads) expect((await putDraft(owner.cookie, shop.id, "site", 1, b)).status).toBe(400);
    expect((await putDraft(owner.cookie, shop.id, "shop", 1, { shopId: "shp_other" })).status).toBe(400);
    expect((await getDraft(owner.cookie, shop.id, "site")).version).toBe(1);
  });

  it("B3-4 大きすぎる下書きは 413", async () => {
    const { owner, shop } = await world();
    const big = siteData({ content: { x: "あ".repeat(800_000) } }); // UTF-8 で 2.4MB
    expect((await putDraft(owner.cookie, shop.id, "site", 1, big)).status).toBe(413);
  });

  it("B3-5 種類は shop と site だけ", async () => {
    const { owner, shop } = await world();
    expect((await call("GET", `/api/shops/${shop.id}/drafts/theme`, { cookie: owner.cookie })).status).toBe(404);
  });
});

describe("B4 2 つの端末で同時に直しても、知らせなしに消えない", () => {
  it("B4-1 古い版番号で保存すると 409。今の版と中身が返る", async () => {
    const { owner, shop } = await world();
    const tabA = owner.cookie;
    const tabB = await login(owner.email);
    const a = siteData({ content: { F_b0: "A の直し" } });
    expect((await putDraft(tabA, shop.id, "site", 1, a)).status).toBe(200);
    const r = await putDraft(tabB, shop.id, "site", 1, siteData({ content: { F_b0: "B の直し" } }));
    expect(r.status).toBe(409);
    const body = (await r.json()) as any;
    expect(body.error).toBe("conflict");
    expect(body.current.version).toBe(2);
    expect(body.current.data).toEqual(a);
    // A の直しは残っている
    expect((await getDraft(tabA, shop.id, "site")).data).toEqual(a);
  });

  it("B4-2 同時に 2 つ保存しても、通るのは片方だけ", async () => {
    const { owner, shop } = await world();
    const rs = await Promise.all([
      putDraft(owner.cookie, shop.id, "site", 1, siteData({ content: { a: "1" } })),
      putDraft(owner.cookie, shop.id, "site", 1, siteData({ content: { a: "2" } })),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await getDraft(owner.cookie, shop.id, "site")).version).toBe(2);
  });

  it("B4-3 版番号（If-Match）のない保存は 428", async () => {
    const { owner, shop } = await world();
    const r = await call("PUT", `/api/shops/${shop.id}/drafts/site`, { cookie: owner.cookie, json: siteData() });
    expect(r.status).toBe(428);
  });

  it("B4-4 ① と ②③ の版は別々（お店の情報を直しても、サイトの保存はぶつからない）", async () => {
    const { owner, shop } = await world();
    const s = await getDraft(owner.cookie, shop.id, "shop");
    expect((await putDraft(owner.cookie, shop.id, "shop", s.version, { ...s.data, basic: { name: "新しい名前" } })).status).toBe(200);
    expect((await putDraft(owner.cookie, shop.id, "site", 1, siteData())).status).toBe(200);
  });
});

describe("編集の設定（最近使った色）", () => {
  it("B3-6 最近使った色は別に持ち、「公開中と同じか」に入らない", async () => {
    const { owner, shop } = await world();
    expect((await publishAll(owner.cookie, shop.id)).status).toBe(200);
    const r = await call("PUT", `/api/shops/${shop.id}/settings`, { cookie: owner.cookie, json: { recentColors: ["#AA0000", "#00bb00"] } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).recentColors).toEqual(["#aa0000", "#00bb00"]);
    const st = (await (await call("GET", `/api/shops/${shop.id}/status`, { cookie: owner.cookie })).json()) as any;
    expect(st.state).toBe("same");
    expect((await getDraft(owner.cookie, shop.id, "site")).version).toBe(1);
  });

  it("B3-7 色は #rrggbb を 5 つまで", async () => {
    const { owner, shop } = await world();
    for (const recentColors of [["red"], ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"], "x"]) {
      expect((await call("PUT", `/api/shops/${shop.id}/settings`, { cookie: owner.cookie, json: { recentColors } })).status).toBe(400);
    }
  });
});

describe("変更の記録（いつ・誰が・どの層・前→後）", () => {
  it("6章-1 下書きの保存で、層と場所と前→後が残る。続けての直しは 1 行にまとまる", async () => {
    const { owner, shop } = await world();
    let v = 1;
    for (const t of ["〇", "一", "一二", "一二三"]) {
      const r = await putDraft(owner.cookie, shop.id, "site", v, { ...siteData({ content: { F_b0: t } }), theme: { colors: { text: { value: "#333333" } } } });
      expect(r.status).toBe(200);
      v++;
    }
    const ch = (await (await call("GET", `/api/shops/${shop.id}/changes`, { cookie: owner.cookie })).json()) as any;
    const content = ch.changes.filter((c: any) => c.path === "/draft/content/F_b0");
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({ layer: "site", action: "edit", before: '"〇"', after: '"一二三"' });
    expect(content[0].firstAt <= content[0].at).toBe(true);
    expect(content[0].actor).toMatchObject({ kind: "owner", email: owner.email });
    expect(ch.changes.some((c: any) => c.layer === "theme" && c.path.startsWith("/theme"))).toBe(true);
  });

  it("6章-2 ① の直しは shop の層", async () => {
    const { producer, shop } = await world();
    const s = await getDraft(producer.cookie, shop.id, "shop");
    await putDraft(producer.cookie, shop.id, "shop", s.version, { ...s.data, basic: { name: "改名" } });
    const ch = (await (await call("GET", `/api/shops/${shop.id}/changes`, { cookie: producer.cookie })).json()) as any;
    expect(ch.changes[0]).toMatchObject({ layer: "shop", path: "/basic/name", before: '"試しの店"', after: '"改名"' });
    expect(ch.changes[0].actor.kind).toBe("producer");
  });
});
