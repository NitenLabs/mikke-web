import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, Env, User } from "../env";
import { randomToken, sha256Hex } from "../lib/crypto";
import { ApiError } from "../lib/http";

/** 使っていない日が続いたら切れる日数（使っている間は延ばす） */
export const SESSION_DAYS = 30;
/** L9：ログインしてからの寿命の上限（延ばしてもこれを超えない）。制作側は全部のお店を触れるので短く */
export const SESSION_MAX_DAYS = { owner: 90, producer: 14 } as const;
const DAY = 24 * 3600 * 1000;
const expiryOf = (role: "owner" | "producer", createdAt: number, now: number) =>
  Math.min(now + SESSION_DAYS * DAY, createdAt + SESSION_MAX_DAYS[role] * DAY);

export const cookieSecure = (env: Env) => env.COOKIE_SECURE !== "false";
/** 本番は __Host- を付ける（Secure・Path=/・Domain なしを強制。サブドメインの公開ページには届かない） */
export const cookieName = (env: Env) => (cookieSecure(env) ? "__Host-mikke_sid" : "mikke_sid");

export async function createSession(c: Context<AppEnv>, userId: string, role: "owner" | "producer"): Promise<void> {
  const token = randomToken();
  const now = Date.now();
  const expires = expiryOf(role, now, now);
  // 前のセッションを持ったまま来たら、それは消す（同じブラウザで入り直したとき）。ほかの端末のセッションは残す（B3：別の端末で開ける）
  const old = getCookie(c, cookieName(c.env));
  if (old && old.length <= 128) await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(old)).run();
  await c.env.DB.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, expires, now)
    .run();
  setCookie(c, cookieName(c.env), token, {
    httpOnly: true,
    secure: cookieSecure(c.env),
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor((expires - now) / 1000),
  });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, cookieName(c.env));
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(token)).run();
  deleteCookie(c, cookieName(c.env), { path: "/", secure: cookieSecure(c.env) });
}

export async function loadUser(c: Context<AppEnv>): Promise<{ user: User; hash: string } | null> {
  const token = getCookie(c, cookieName(c.env));
  if (!token || token.length > 128) return null;
  const hash = await sha256Hex(token);
  const now = Date.now();
  const row = await c.env.DB.prepare(
    `SELECT s.created_at, s.expires_at, s.last_seen_at, u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = ? AND u.disabled_at IS NULL`,
  )
    .bind(hash)
    .first<{ created_at: number; expires_at: number; last_seen_at: number; id: string; email: string; name: string | null; role: "owner" | "producer" }>();
  if (!row) return null;
  if (row.expires_at <= now) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(hash).run();
    return null;
  }
  // 使っている間は延ばす（1日に1回だけ書く）
  if (now - row.last_seen_at > DAY) {
    await c.env.DB.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?").bind(now, expiryOf(row.role, row.created_at, now), hash).run();
  }
  // 役割が変わったときなどにも、寿命の上限を超えさせない
  if (row.created_at + SESSION_MAX_DAYS[row.role] * DAY <= now) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(hash).run();
    return null;
  }
  return { user: { id: row.id, email: row.email, name: row.name, role: row.role }, hash };
}

/** ログインしていなければ 401 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const s = await loadUser(c);
  if (!s) throw new ApiError(401, "unauthenticated", "ログインしてください");
  c.set("user", s.user);
  c.set("sessionHash", s.hash);
  await next();
};

export const requireProducer: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user").role !== "producer") throw new ApiError(403, "forbidden", "制作側だけができる操作です");
  await next();
};

/** お店を直せるか（B2）。店主は自分のお店だけ、制作側は全部。直せないお店は「ない」と同じに見せる */
export async function assertShopAccess(env: Env, user: User, shopId: string): Promise<void> {
  if (!/^shp_[a-z0-9]{4,24}$/.test(shopId)) throw new ApiError(404, "not_found", "お店が見つかりません");
  const row =
    user.role === "producer"
      ? await env.DB.prepare("SELECT id FROM shops WHERE id = ?").bind(shopId).first()
      : await env.DB.prepare("SELECT s.id FROM shops s JOIN memberships m ON m.shop_id = s.id WHERE s.id = ? AND m.user_id = ?").bind(shopId, user.id).first();
  if (!row) throw new ApiError(404, "not_found", "お店が見つかりません");
}

export const requireShop: MiddlewareHandler<AppEnv> = async (c, next) => {
  await assertShopAccess(c.env, c.get("user"), c.req.param("shopId") ?? "");
  await next();
};
