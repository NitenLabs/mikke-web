import { Hono } from "hono";
import type { AppEnv } from "../env";
import { hmacHex, newId, randomCode, randomToken, sha256Hex, timingSafeEqual } from "../lib/crypto";
import { ApiError, bad, isPlainObject, readJson } from "../lib/http";
import { mailerFor } from "../services/mailer";
import { allowedOrigins } from "../services/csrf";
import { createSession, destroySession, requireUser } from "../services/session";

export const LOGIN_TTL_MIN = 15;
/** 同じアドレスで次に頼めるまでの間（秒） */
export const RESEND_INTERVAL_SEC = 60;
/** 同じアドレスで 1 時間に頼める回数 */
export const MAX_PER_HOUR = 5;
/** 1 つのコードで間違えてよい回数 */
export const MAX_CODE_ATTEMPTS = 5;

const EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
export function normalizeEmail(v: unknown): string {
  if (typeof v !== "string") throw bad("invalid_email", "メールアドレスを入れてください");
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) throw bad("invalid_email", "メールアドレスの形が正しくありません");
  return e;
}

function secret(env: AppEnv["Bindings"]): string {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET（32 文字以上）が設定されていません");
  return env.AUTH_SECRET;
}

const codeHash = (env: AppEnv["Bindings"], reqId: string, code: string) => hmacHex(secret(env), `login:${reqId}:${code}`);

const INVALID = () => new ApiError(400, "invalid_code", "コードかリンクが正しくないか、期限が切れています。もう一度メールを送ってください");

export const auth = new Hono<AppEnv>();

/** B1：メールアドレス → 6 桁のコードとリンク */
auth.post("/request", async (c) => {
  const body = await readJson<{ email?: unknown }>(c, 4096);
  const email = normalizeEmail(isPlainObject(body) ? body.email : undefined);
  const now = Date.now();
  const recent = await c.env.DB.prepare("SELECT created_at FROM login_requests WHERE email = ? AND created_at > ? ORDER BY created_at DESC")
    .bind(email, now - 3600 * 1000)
    .all<{ created_at: number }>();
  const rows = recent.results;
  if (rows.length) {
    const wait = Math.ceil((rows[0].created_at + RESEND_INTERVAL_SEC * 1000 - now) / 1000);
    if (wait > 0) throw new ApiError(429, "too_soon", `少し待ってからもう一度お試しください（あと ${wait} 秒）`, { retryAfter: wait }, { "Retry-After": String(wait) });
  }
  if (rows.length >= MAX_PER_HOUR) {
    const wait = Math.ceil((rows[rows.length - 1].created_at + 3600 * 1000 - now) / 1000);
    throw new ApiError(429, "too_many", "続けて何度も頼まれたので、しばらく止めています", { retryAfter: wait }, { "Retry-After": String(wait) });
  }
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND disabled_at IS NULL").bind(email).first<{ id: string }>();
  const id = newId("lgn", 16);
  const code = randomCode();
  const token = randomToken();
  // 前のコード・リンクは使えなくする（いちばん新しいものだけ有効）
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE login_requests SET used_at = ? WHERE email = ? AND used_at IS NULL").bind(now, email),
    c.env.DB.prepare("INSERT INTO login_requests (id, email, user_id, code_hash, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
      id,
      email,
      user?.id ?? null,
      await codeHash(c.env, id, code),
      await sha256Hex(token),
      now,
      now + LOGIN_TTL_MIN * 60 * 1000,
    ),
  ]);
  if (user) {
    const base = allowedOrigins(c.env)[0];
    const link = `${base}/login?t=${encodeURIComponent(token)}`;
    await mailerFor(c.env).sendLogin({ to: email, code, link, expiresMinutes: LOGIN_TTL_MIN });
  }
  // 登録のないアドレスでも同じ答え（あるかどうかを外から調べられないように）
  return c.json({ ok: true, expiresInMinutes: LOGIN_TTL_MIN, retryAfter: RESEND_INTERVAL_SEC });
});

/** B1：コード（email＋code）かリンクの合言葉（token）で入る。どちらも 1 回だけ */
auth.post("/verify", async (c) => {
  const body = await readJson<Record<string, unknown>>(c, 4096);
  if (!isPlainObject(body)) throw INVALID();
  const now = Date.now();
  type Row = { id: string; email: string; user_id: string | null; code_hash: string; expires_at: number; used_at: number | null; attempts: number };
  let row: Row | null = null;
  if (typeof body.token === "string") {
    if (body.token.length > 128) throw INVALID();
    row = await c.env.DB.prepare("SELECT * FROM login_requests WHERE token_hash = ?").bind(await sha256Hex(body.token)).first<Row>();
    if (!row || row.used_at || row.expires_at <= now) throw INVALID();
  } else {
    const email = normalizeEmail(body.email);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) throw bad("invalid_code", "6 桁の数字を入れてください");
    row = await c.env.DB.prepare("SELECT * FROM login_requests WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(email).first<Row>();
    if (!row || row.expires_at <= now || row.attempts >= MAX_CODE_ATTEMPTS) throw INVALID();
    const ok = timingSafeEqual(await codeHash(c.env, row.id, code), row.code_hash);
    if (!ok) {
      // 間違えた回数を数え、上限でそのコードを使えなくする
      await c.env.DB.prepare("UPDATE login_requests SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= ? THEN ? ELSE used_at END WHERE id = ?")
        .bind(MAX_CODE_ATTEMPTS, now, row.id)
        .run();
      throw INVALID();
    }
  }
  // 1 回だけ：使った印を付けられたときだけ通す（同時に 2 回来ても片方だけ）
  const used = await c.env.DB.prepare("UPDATE login_requests SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, row.id).run();
  if (used.meta.changes !== 1 || !row.user_id) throw INVALID();
  const user = await c.env.DB.prepare("SELECT id, email, name, role FROM users WHERE id = ? AND disabled_at IS NULL").bind(row.user_id).first();
  if (!user) throw INVALID();
  await createSession(c, row.user_id);
  return c.json({ user });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

export const me = new Hono<AppEnv>();
me.use("*", requireUser);
me.get("/", async (c) => {
  const user = c.get("user");
  const shops =
    user.role === "producer"
      ? await c.env.DB.prepare("SELECT id, slug, name, published_version FROM shops ORDER BY created_at").all()
      : await c.env.DB.prepare("SELECT s.id, s.slug, s.name, s.published_version FROM shops s JOIN memberships m ON m.shop_id = s.id WHERE m.user_id = ? ORDER BY s.created_at")
          .bind(user.id)
          .all();
  return c.json({
    user,
    shops: shops.results.map((s: any) => ({ id: s.id, slug: s.slug, name: s.name, publishedVersion: s.published_version ?? null })),
  });
});
