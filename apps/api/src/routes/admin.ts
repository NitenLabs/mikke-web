import { Hono } from "hono";
import type { AppEnv } from "../env";
import { newId } from "../lib/crypto";
import { ApiError, bad, isPlainObject, nowIso, readJson } from "../lib/http";
import { purgeTrash } from "../services/assets";
import { initialShopDraft, initialSiteDraft } from "../services/drafts";
import { rerenderCandidates } from "../services/rerender";
import { requireProducer, requireUser } from "../services/session";
import { normalizeEmail } from "./auth";
import { RESERVED_SLUGS, SLUG_RE } from "../lib/slug";

/** 制作側だけの操作（お店・ユーザーを作る、つなぐ） */
export const admin = new Hono<AppEnv>();
admin.use("*", requireUser, requireProducer);


export function validateSlug(v: unknown): string {
  if (typeof v !== "string" || !SLUG_RE.test(v) || v.includes("--")) throw bad("invalid_slug", "スラッグは英小文字・数字・ハイフン（1〜32 文字）");
  if (RESERVED_SLUGS.has(v)) throw bad("invalid_slug", `${v} は使えません（予約語）`);
  return v;
}

admin.get("/shops", async (c) => {
  const res = await c.env.DB.prepare("SELECT id, slug, name, template, published_version, created_at FROM shops ORDER BY created_at").all<any>();
  return c.json({ shops: res.results.map((s) => ({ id: s.id, slug: s.slug, name: s.name, template: s.template, publishedVersion: s.published_version ?? null, createdAt: s.created_at })) });
});

/** お店を作る（テンプレートの最初の形の下書きつき） */
admin.post("/shops", async (c) => {
  const body = await readJson<Record<string, unknown>>(c, 8192);
  if (!isPlainObject(body)) throw bad("invalid_shop", "本文は JSON の入れ物にしてください");
  const slug = validateSlug(body.slug);
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80) throw bad("invalid_shop", "name（お店の名前）を 80 文字までで");
  const id = body.id === undefined ? newId("shp", 12) : body.id;
  if (typeof id !== "string" || !/^shp_[a-z0-9]{4,24}$/.test(id)) throw bad("invalid_shop", "id は shp_ ＋英小文字・数字 4〜24 文字");
  const dupe = await c.env.DB.prepare("SELECT id FROM shops WHERE id = ? OR slug = ?").bind(id, slug).first();
  if (dupe) throw new ApiError(409, "exists", "同じ id かスラッグのお店があります");
  const at = nowIso();
  const user = c.get("user");
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO shops (id, slug, name, template, created_at) VALUES (?, ?, ?, 'wa-01', ?)").bind(id, slug, body.name.trim(), at),
    c.env.DB.prepare("INSERT INTO drafts (shop_id, kind, version, body, updated_at, updated_by) VALUES (?, 'shop', 1, ?, ?, ?)").bind(id, JSON.stringify(initialShopDraft(id, body.name.trim())), at, user.id),
    c.env.DB.prepare("INSERT INTO drafts (shop_id, kind, version, body, updated_at, updated_by) VALUES (?, 'site', 1, ?, ?, ?)").bind(id, JSON.stringify(initialSiteDraft()), at, user.id),
  ]);
  return c.json({ id, slug, name: body.name.trim(), template: "wa-01" }, 201);
});

/** ユーザーを作る（店主は自分で登録しない。制作側が作ってから、メールでログインしてもらう） */
admin.post("/users", async (c) => {
  const body = await readJson<Record<string, unknown>>(c, 4096);
  if (!isPlainObject(body)) throw bad("invalid_user", "本文は JSON の入れ物にしてください");
  const email = normalizeEmail(body.email);
  const role = body.role ?? "owner";
  if (role !== "owner" && role !== "producer") throw bad("invalid_user", "role は owner か producer");
  if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 80)) throw bad("invalid_user", "name は 80 文字まで");
  const exists = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) throw new ApiError(409, "exists", "同じメールアドレスのユーザーがいます");
  const id = newId("usr", 12);
  await c.env.DB.prepare("INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, email, (body.name as string) ?? null, role, nowIso()).run();
  return c.json({ id, email, name: body.name ?? null, role }, 201);
});

/** 店主をお店につなぐ */
admin.post("/shops/:shopId/members", async (c) => {
  const shopId = c.req.param("shopId");
  const shop = await c.env.DB.prepare("SELECT id FROM shops WHERE id = ?").bind(shopId).first();
  if (!shop) throw new ApiError(404, "not_found", "お店が見つかりません");
  const body = await readJson<Record<string, unknown>>(c, 4096);
  const email = normalizeEmail(isPlainObject(body) ? body.email : undefined);
  const u = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  if (!u) throw new ApiError(404, "not_found", "そのメールアドレスのユーザーがいません（先に /api/admin/users で作る）");
  await c.env.DB.prepare("INSERT OR IGNORE INTO memberships (user_id, shop_id, created_at) VALUES (?, ?, ?)").bind(u.id, shopId, nowIso()).run();
  return c.json({ shopId, userId: u.id }, 201);
});

admin.delete("/shops/:shopId/members/:userId", async (c) => {
  await c.env.DB.prepare("DELETE FROM memberships WHERE shop_id = ? AND user_id = ?").bind(c.req.param("shopId"), c.req.param("userId")).run();
  return c.json({ ok: true });
});

/** D6：描き直しが要るお店（毎日 0 時の Cron と同じもの） */
admin.get("/rerender", async (c) => c.json(await rerenderCandidates(c.env)));

/** C4：ゴミ箱の掃除を今すぐ（毎日の Cron でも走る） */
admin.post("/purge-trash", async (c) => c.json(await purgeTrash(c.env)));
