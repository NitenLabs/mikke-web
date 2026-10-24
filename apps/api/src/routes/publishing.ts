import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ApiError, bad, isPlainObject, notFound, readJson } from "../lib/http";
import { actorOf, actorView } from "../services/changes";
import { getVersion, listVersions, MAX_PUBLISH_BYTES, parsePublishInput, publish, replaceDrafts } from "../services/publish";
import { publicUrl } from "./shops";

export const publishing = new Hono<AppEnv>();

/** D1：公開 */
publishing.post("/:shopId/publish", async (c) => {
  const shopId = c.req.param("shopId");
  const input = parsePublishInput(await readJson(c, MAX_PUBLISH_BYTES));
  const r = await publish(c.env, shopId, actorOf(c.get("user")), input);
  const slug = (await c.env.DB.prepare("SELECT slug FROM shops WHERE id = ?").bind(shopId).first<{ slug: string }>())!.slug;
  return c.json({ ...r, url: publicUrl(c.env, slug) });
});

const num = (s: string) => {
  if (!/^\d{1,9}$/.test(s)) throw notFound("版が見つかりません");
  return Number(s);
};

/** D4：履歴（新しい方から 30） */
publishing.get("/:shopId/versions", async (c) => c.json({ versions: await listVersions(c.env, c.req.param("shopId"), c.get("user")) }));

/** D4：履歴の版を見る（①②③ の中身） */
publishing.get("/:shopId/versions/:n", async (c) => {
  const v = await getVersion(c.env, c.req.param("shopId"), num(c.req.param("n")));
  if (!v) throw notFound("版が見つかりません");
  return c.json({ number: v.number, scope: v.scope, publishedAt: v.publishedAt, publishedBy: actorView(c.get("user"), v.publishedBy), pages: v.pages, shop: v.shop, site: v.site });
});

/** D4：「この版を下書きにする」。②③ はまるごと、① は includeShop のときだけ。公開中の版は変わらない */
publishing.post("/:shopId/versions/:n/restore", async (c) => {
  const shopId = c.req.param("shopId");
  const v = await getVersion(c.env, shopId, num(c.req.param("n")));
  if (!v) throw notFound("版が見つかりません");
  const body = await readJson<Record<string, unknown>>(c, 4096);
  if (!isPlainObject(body)) throw bad("invalid_restore", "本文は JSON の入れ物にしてください");
  const includeShop = body.includeShop === true;
  const expected = { site: body.siteDraftVersion as number | undefined, shop: body.shopDraftVersion as number | undefined };
  if (typeof expected.site !== "number") throw bad("invalid_restore", "siteDraftVersion（今の ②③ の下書きの版）を付けてください");
  if (includeShop && typeof expected.shop !== "number") throw bad("invalid_restore", "shopDraftVersion（今の ① の下書きの版）を付けてください");
  const r = await replaceDrafts(c.env, shopId, actorOf(c.get("user")), { site: v.site, shop: includeShop ? v.shop : undefined }, expected, "restore-version");
  return c.json({ restoredFrom: v.number, ...r });
});

/** 戻す前の下書き（新しい方から 10） */
publishing.get("/:shopId/backups", async (c) => {
  const res = await c.env.DB.prepare("SELECT id, reason, created_at, created_by FROM draft_backups WHERE shop_id = ? ORDER BY created_at DESC, rowid DESC")
    .bind(c.req.param("shopId"))
    .all<any>();
  return c.json({ backups: res.results.map((r) => ({ id: r.id, reason: r.reason, createdAt: r.created_at, ...(c.get("user").role === "producer" ? { createdBy: r.created_by } : {}) })) });
});

const backupRow = async (c: any) => {
  const id = c.req.param("id");
  if (!/^bak_[a-z0-9]{4,24}$/.test(id)) throw notFound("戻す前の下書きが見つかりません");
  const r = await c.env.DB.prepare("SELECT * FROM draft_backups WHERE id = ? AND shop_id = ?").bind(id, c.req.param("shopId")).first();
  if (!r) throw notFound("戻す前の下書きが見つかりません");
  return r as any;
};

publishing.get("/:shopId/backups/:id", async (c) => {
  const r = await backupRow(c);
  return c.json({ id: r.id, reason: r.reason, createdAt: r.created_at, shop: JSON.parse(r.shop_body), site: JSON.parse(r.site_body) });
});

/** 戻す前の下書きを、下書きに戻す（①②③ とも） */
publishing.post("/:shopId/backups/:id/restore", async (c) => {
  const r = await backupRow(c);
  const body = await readJson<Record<string, unknown>>(c, 4096);
  if (!isPlainObject(body) || typeof body.siteDraftVersion !== "number" || typeof body.shopDraftVersion !== "number")
    throw bad("invalid_restore", "siteDraftVersion と shopDraftVersion（今の下書きの版）を付けてください");
  const shop = JSON.parse(r.shop_body), site = JSON.parse(r.site_body);
  if (shop === null && site === null) throw new ApiError(400, "empty_backup", "中身のない写しです");
  const res = await replaceDrafts(
    c.env,
    c.req.param("shopId"),
    actorOf(c.get("user")),
    { shop: shop ?? undefined, site: site ?? undefined },
    { shop: body.shopDraftVersion, site: body.siteDraftVersion },
    "restore-backup",
  );
  return c.json({ restoredFrom: r.id, ...res });
});
