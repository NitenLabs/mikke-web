import { Hono } from "hono";
import type { AppEnv } from "../env";
import { notFound, nowIso, readJson, readLimited } from "../lib/http";
import { actorOf, recordChanges } from "../services/changes";
import { assetJson, assetReferences, getAsset, MAX_UPLOAD_BYTES, patchAsset, TRASH_DAYS, uploadAsset, type AssetRow } from "../services/assets";
import { ApiError } from "../lib/http";

export const assets = new Hono<AppEnv>();

/** C2：写真を上げる。本文は写真そのもの（Content-Type: image/jpeg・image/png・image/webp） */
assets.post("/:shopId/assets", async (c) => {
  const declared = Number(c.req.header("content-length") || "0");
  if (declared > MAX_UPLOAD_BYTES) throw new ApiError(413, "too_large", `写真は ${MAX_UPLOAD_BYTES / 1024 / 1024}MB まで`);
  const bytes = await readLimited(c.req.raw, MAX_UPLOAD_BYTES);
  let name: string | undefined;
  const raw = c.req.header("x-file-name");
  if (raw) {
    try {
      name = decodeURIComponent(raw);
    } catch {
      name = undefined;
    }
  }
  const a = await uploadAsset(c.env, c.req.param("shopId"), actorOf(c.get("user")), c.req.header("content-type") || "", bytes, name);
  return c.json(a, 201);
});

/** ④ の一覧（assets.json と同じ形）。?trash=1 でゴミ箱の中も */
assets.get("/:shopId/assets", async (c) => {
  const withTrash = c.req.query("trash") === "1";
  const res = await c.env.DB.prepare(
    `SELECT * FROM assets WHERE shop_id = ? AND purged_at IS NULL ${withTrash ? "" : "AND trashed_at IS NULL"} ORDER BY uploaded_at, id`,
  )
    .bind(c.req.param("shopId"))
    .all<AssetRow>();
  const out: Record<string, unknown> = {};
  for (const r of res.results) {
    const { id, ...rest } = assetJson(r);
    out[id] = rest;
  }
  return c.json({ schemaVersion: 1, assets: out });
});

const load = async (c: any): Promise<AssetRow> => {
  const row = await getAsset(c.env, c.req.param("shopId"), c.req.param("assetId"));
  if (!row) throw notFound("写真が見つかりません");
  return row;
};

assets.get("/:shopId/assets/:assetId", async (c) => c.json(assetJson(await load(c))));

/** 編集画面で見る写真そのもの（ログインが要る。公開ページの写真は公開ページの /media/ から） */
assets.get("/:shopId/assets/:assetId/file", async (c) => {
  const row = await load(c);
  const obj = await c.env.BUCKET.get(row.r2_key);
  if (!obj) throw notFound("写真のファイルが見つかりません");
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});

assets.patch("/:shopId/assets/:assetId", async (c) => {
  const row = await load(c);
  return c.json(await patchAsset(c.env, row, actorOf(c.get("user")), await readJson(c, 8192)));
});

/** C4：ゴミ箱に入れる（30 日で消える。ただし版などが指している間は消さない） */
assets.delete("/:shopId/assets/:assetId", async (c) => {
  const row = await load(c);
  const at = row.trashed_at ?? nowIso();
  if (!row.trashed_at) {
    await c.env.DB.prepare("UPDATE assets SET trashed_at = ? WHERE id = ?").bind(at, row.id).run();
    await recordChanges(c.env, row.shop_id, actorOf(c.get("user")), [{ layer: "assets", action: "trash", path: `/assets/${row.id}` }]);
  }
  const refs = await assetReferences(c.env, row.shop_id, row.id);
  return c.json({ id: row.id, trashedAt: at, purgeAfterDays: TRASH_DAYS, referencedBy: refs });
});

/** ゴミ箱から戻す */
assets.post("/:shopId/assets/:assetId/restore", async (c) => {
  const row = await load(c);
  if (row.trashed_at) {
    await c.env.DB.prepare("UPDATE assets SET trashed_at = NULL WHERE id = ?").bind(row.id).run();
    await recordChanges(c.env, row.shop_id, actorOf(c.get("user")), [{ layer: "assets", action: "untrash", path: `/assets/${row.id}` }]);
  }
  return c.json(assetJson({ ...row, trashed_at: null }));
});
