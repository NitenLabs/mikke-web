import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ApiError, bad, isPlainObject, nowIso, readJson } from "../lib/http";
import { canonJSON } from "../lib/json";
import { actorOf, draftChangeRows, recordChanges } from "../services/changes";
import { draftJson, getDraft, MAX_DRAFT_BYTES, parseIfMatch, saveDraft, validateDraft, type DraftKind } from "../services/drafts";
import { getPublished } from "../services/publish";

export const shops = new Hono<AppEnv>();

shops.get("/:shopId", async (c) => {
  const s = await c.env.DB.prepare("SELECT id, slug, name, template, published_version, created_at FROM shops WHERE id = ?").bind(c.req.param("shopId")).first<any>();
  return c.json({
    id: s.id,
    slug: s.slug,
    name: s.name,
    template: s.template,
    publishedVersion: s.published_version ?? null,
    publicUrl: publicUrl(c.env, s.slug),
    createdAt: s.created_at,
  });
});

export function publicUrl(env: AppEnv["Bindings"], slug: string): string {
  const secure = env.COOKIE_SECURE !== "false";
  const port = env.PUBLIC_PORT ? `:${env.PUBLIC_PORT}` : "";
  return `${secure ? "https" : "http"}://${slug}.${env.PUBLIC_DOMAIN}${port}/`;
}

const kindOf = (k: string): DraftKind => {
  if (k !== "shop" && k !== "site") throw new ApiError(404, "not_found", "下書きの種類は shop か site です");
  return k;
};

/** B3：下書きを読む。ETag に版番号 */
shops.get("/:shopId/drafts/:kind", async (c) => {
  const kind = kindOf(c.req.param("kind"));
  const d = await getDraft(c.env, c.req.param("shopId"), kind);
  if (!d) return c.json({ kind, version: 0, data: null, updatedAt: null, updatedBy: null }, 200, { ETag: '"0"' });
  return c.json(draftJson(kind, d), 200, { ETag: `"${d.version}"`, "Cache-Control": "no-store" });
});

/** B3・B4：下書きを保存。If-Match の版が今の版と違えば 409（今の版と中身を返す） */
shops.put("/:shopId/drafts/:kind", async (c) => {
  const shopId = c.req.param("shopId");
  const kind = kindOf(c.req.param("kind"));
  const expected = parseIfMatch(c.req.header("if-match"));
  if (expected === null) throw new ApiError(428, "precondition_required", "If-Match に、読んだときの版番号を付けてください");
  const data = await readJson(c, MAX_DRAFT_BYTES);
  validateDraft(kind, shopId, data);
  const before = await getDraft(c.env, shopId, kind);
  const user = c.get("user");
  const saved = (before?.version ?? 0) === expected ? await saveDraft(c.env, shopId, kind, expected, data, user.id) : null;
  if (!saved) {
    const current = await getDraft(c.env, shopId, kind);
    throw new ApiError(409, "conflict", "ほかの端末かタブで先に保存されています。今の版を読み直してください", {
      current: current ? draftJson(kind, current) : { kind, version: 0, data: null },
    });
  }
  await recordChanges(c.env, shopId, actorOf(user), draftChangeRows(kind, before?.data, data), true);
  return c.json({ kind, version: saved.version, updatedAt: saved.updatedAt }, 200, { ETag: `"${saved.version}"` });
});

/** 編集の設定（最近使った色。新しい順に 5 つまで）。版に入れず、比べない */
shops.get("/:shopId/settings", async (c) => {
  const row = await c.env.DB.prepare("SELECT body FROM editor_settings WHERE shop_id = ?").bind(c.req.param("shopId")).first<{ body: string }>();
  return c.json(row ? JSON.parse(row.body) : { recentColors: [] });
});

shops.put("/:shopId/settings", async (c) => {
  const body = await readJson<Record<string, unknown>>(c, 8 * 1024);
  if (!isPlainObject(body)) throw bad("invalid_settings", "設定は JSON の入れ物にしてください");
  for (const k of Object.keys(body)) if (k !== "recentColors") throw bad("invalid_settings", `知らない設定です：${k}`);
  const rc = body.recentColors ?? [];
  if (!Array.isArray(rc) || rc.length > 5 || !rc.every((x) => typeof x === "string" && /^#[0-9a-fA-F]{6}$/.test(x)))
    throw bad("invalid_settings", "recentColors は #rrggbb を 5 つまで");
  const clean = { recentColors: [...new Set(rc.map((x: string) => x.toLowerCase()))] };
  await c.env.DB.prepare("INSERT INTO editor_settings (shop_id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(shop_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at")
    .bind(c.req.param("shopId"), JSON.stringify(clean), nowIso())
    .run();
  return c.json(clean);
});

/** 状態の文字（DATA_SPEC 6章）：まだ公開していません／公開中と同じです／まだ公開していない変更があります */
shops.get("/:shopId/status", async (c) => {
  const shopId = c.req.param("shopId");
  const [shopD, siteD, pub] = await Promise.all([getDraft(c.env, shopId, "shop"), getDraft(c.env, shopId, "site"), getPublished(c.env, shopId)]);
  const drafts = { shop: { version: shopD?.version ?? 0 }, site: { version: siteD?.version ?? 0 } };
  if (!pub) return c.json({ state: "unpublished", label: "まだ公開していません", drafts, published: null });
  const shopSame = canonJSON(shopD?.data) === canonJSON(pub.shop);
  const siteSame = canonJSON(siteD?.data) === canonJSON(pub.site);
  const same = shopSame && siteSame;
  return c.json({
    state: same ? "same" : "changed",
    label: same ? "公開中と同じです" : "まだ公開していない変更があります",
    shopSame,
    siteSame,
    drafts,
    published: { number: pub.number, scope: pub.scope, publishedAt: pub.publishedAt, publishedBy: pub.publishedBy },
  });
});

/** 変更の記録（新しい方から）。?limit=50&before=<id> */
shops.get("/:shopId/changes", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 50) | 0, 1), 200);
  const before = Number(c.req.query("before") || 0) | 0;
  const res = await c.env.DB.prepare(
    `SELECT c.id, c.at, c.first_at, c.actor_id, c.actor_kind, u.name AS actor_name, u.email AS actor_email, c.layer, c.action, c.path, c.before, c.after
     FROM changes c LEFT JOIN users u ON u.id = c.actor_id WHERE c.shop_id = ? AND (? = 0 OR c.id < ?) ORDER BY c.id DESC LIMIT ?`,
  )
    .bind(c.req.param("shopId"), before, before, limit)
    .all<any>();
  return c.json({
    changes: res.results.map((r) => ({
      id: r.id,
      at: r.at,
      firstAt: r.first_at,
      actor: { id: r.actor_id, kind: r.actor_kind, name: r.actor_name ?? null, email: r.actor_email ?? null },
      layer: r.layer,
      action: r.action,
      path: r.path,
      before: r.before,
      after: r.after,
    })),
  });
});
