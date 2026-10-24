import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { hmacHex, newId, randomCode, randomToken, sha256Hex, timingSafeEqual } from "../lib/crypto";
import { ApiError, bad, isPlainObject, readJson } from "../lib/http";
import { mailerFor } from "../services/mailer";
import { allowedOrigins } from "../services/csrf";
import { limitByIp } from "../services/ratelimit";
import { cookieSecure, createSession, destroySession, requireUser } from "../services/session";

export const LOGIN_TTL_MIN = 15;
/** 同じアドレスで次に頼めるまでの間（秒） */
export const RESEND_INTERVAL_SEC = 60;
/** 同じアドレスで 1 時間に頼める回数 */
export const MAX_PER_HOUR = 5;
/** 1 つのコードで試せる回数 */
export const MAX_CODE_ATTEMPTS = 5;
/** アカウントごとの、24 時間のコードの失敗の上限（超えたら 24 時間、コードでは入れない。リンクでは入れる） */
export const MAX_DAILY_FAILURES = 20;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

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

/** M3：申し込んだブラウザの印（Cookie の乱数）。コードはこの Cookie を持つブラウザでだけ使える */
export const loginCookieName = (env: AppEnv["Bindings"]) => (cookieSecure(env) ? "__Host-mikke_lgn" : "mikke_lgn");
const BROWSER_RE = /^[A-Za-z0-9_-]{43}$/;

function browserToken(c: Context<AppEnv>): string | null {
  const v = getCookie(c, loginCookieName(c.env));
  return v && BROWSER_RE.test(v) ? v : null;
}

export const auth = new Hono<AppEnv>();

/** B1：メールアドレス → 6 桁のコードとリンク */
auth.post("/request", async (c) => {
  await limitByIp(c, "request");
  const body = await readJson<{ email?: unknown }>(c, 4096);
  const email = normalizeEmail(isPlainObject(body) ? body.email : undefined);
  const now = Date.now();
  // 同じブラウザの印は使い回す（同じブラウザの前の申し込みだけを無効にするため）
  const browser = browserToken(c) ?? randomToken();
  const browserHash = await sha256Hex(browser);
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND disabled_at IS NULL").bind(email).first<{ id: string }>();
  const id = newId("lgn", 16);
  const code = randomCode();
  const token = randomToken();
  // M2：回数の制限と書き込みを 1 文で決める（同時に何本来ても、通るのは 1 本だけ）
  const ins = await c.env.DB.prepare(
    `INSERT INTO login_requests (id, email, user_id, code_hash, token_hash, browser_hash, created_at, expires_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM login_requests WHERE email = ? AND created_at > ?)
       AND (SELECT COUNT(*) FROM login_requests WHERE email = ? AND created_at > ?) < ?`,
  )
    .bind(
      id,
      email,
      user?.id ?? null,
      await codeHash(c.env, id, code),
      await sha256Hex(token),
      browserHash,
      now,
      now + LOGIN_TTL_MIN * 60 * 1000,
      email,
      now - RESEND_INTERVAL_SEC * 1000,
      email,
      now - HOUR,
      MAX_PER_HOUR,
    )
    .run();
  if (ins.meta.changes !== 1) {
    const rows = (
      await c.env.DB.prepare("SELECT created_at FROM login_requests WHERE email = ? AND created_at > ? ORDER BY created_at DESC").bind(email, now - HOUR).all<{ created_at: number }>()
    ).results;
    const soon = rows.length ? Math.ceil((rows[0].created_at + RESEND_INTERVAL_SEC * 1000 - now) / 1000) : 0;
    if (soon > 0) throw new ApiError(429, "too_soon", `少し待ってからもう一度お試しください（あと ${soon} 秒）`, { retryAfter: soon }, { "Retry-After": String(soon) });
    const wait = rows.length ? Math.max(1, Math.ceil((rows[rows.length - 1].created_at + HOUR - now) / 1000)) : 60;
    throw new ApiError(429, "too_many", "続けて何度も頼まれたので、しばらく止めています", { retryAfter: wait }, { "Retry-After": String(wait) });
  }
  // 同じブラウザの前のコード・リンクは使えなくする（ほかのブラウザの申し込みは残す。M3：本人の妨害を和らげる）
  await c.env.DB.prepare("UPDATE login_requests SET used_at = ? WHERE email = ? AND browser_hash = ? AND used_at IS NULL AND id <> ?").bind(now, email, browserHash, id).run();
  setCookie(c, loginCookieName(c.env), browser, {
    httpOnly: true,
    secure: cookieSecure(c.env),
    sameSite: "Lax",
    path: "/",
    maxAge: LOGIN_TTL_MIN * 60,
  });
  if (user) {
    const base = allowedOrigins(c.env)[0];
    // L8：合言葉は # の後ろに（サーバーの記録や Referer に残らない）
    const link = `${base}/login#t=${encodeURIComponent(token)}`;
    // L3：送るのは答えの後に回す（登録のあるなしで答えの時間が変わらないように）
    c.executionCtx.waitUntil(
      mailerFor(c.env)
        .sendLogin({ to: email, code, link, expiresMinutes: LOGIN_TTL_MIN })
        .catch((e) => console.error("[mail] 送れませんでした", e)),
    );
  }
  // 登録のないアドレスでも同じ答え（あるかどうかを外から調べられないように）
  return c.json({ ok: true, expiresInMinutes: LOGIN_TTL_MIN, retryAfter: RESEND_INTERVAL_SEC });
});

/** B1：コード（email＋code。申し込んだブラウザでだけ）かリンクの合言葉（token）で入る。どちらも 1 回だけ */
auth.post("/verify", async (c) => {
  await limitByIp(c, "verify");
  const body = await readJson<Record<string, unknown>>(c, 4096);
  if (!isPlainObject(body)) throw INVALID();
  const now = Date.now();
  let userId: string | null = null;
  if (typeof body.token === "string") {
    if (body.token.length > 128) throw INVALID();
    // 1 回だけ：使った印を付けられたときだけ通す（同時に来ても片方だけ）
    const row = await c.env.DB.prepare("UPDATE login_requests SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id")
      .bind(now, await sha256Hex(body.token), now)
      .first<{ user_id: string | null }>();
    if (!row) throw INVALID();
    userId = row.user_id;
  } else {
    const email = normalizeEmail(body.email);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) throw bad("invalid_code", "6 桁の数字を入れてください");
    const browser = browserToken(c);
    if (!browser) throw INVALID();
    const fails = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND at > ?").bind(email, now - DAY).first<{ n: number }>();
    if ((fails?.n ?? 0) >= MAX_DAILY_FAILURES)
      throw new ApiError(429, "locked", "コードの間違いが続いたので、このアドレスはコードでのログインを 24 時間止めています。メールのリンクから入ってください");
    // L2：試す枠を先に取る（同時に何本来ても、1 つのコードで試せるのは 5 回まで）
    const row = await c.env.DB.prepare(
      `UPDATE login_requests SET attempts = attempts + 1
       WHERE id = (SELECT id FROM login_requests WHERE email = ? AND browser_hash = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1)
         AND attempts < ? AND used_at IS NULL
       RETURNING id, user_id, code_hash, attempts`,
    )
      .bind(email, await sha256Hex(browser), now, MAX_CODE_ATTEMPTS)
      .first<{ id: string; user_id: string | null; code_hash: string; attempts: number }>();
    if (!row) throw INVALID();
    if (!timingSafeEqual(await codeHash(c.env, row.id, code), row.code_hash)) {
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO login_failures (email, at) VALUES (?, ?)").bind(email, now),
        c.env.DB.prepare("UPDATE login_requests SET used_at = ? WHERE id = ? AND attempts >= ? AND used_at IS NULL").bind(now, row.id, MAX_CODE_ATTEMPTS),
      ]);
      throw INVALID();
    }
    const used = await c.env.DB.prepare("UPDATE login_requests SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, row.id).run();
    if (used.meta.changes !== 1) throw INVALID();
    userId = row.user_id;
  }
  if (!userId) throw INVALID();
  const user = await c.env.DB.prepare("SELECT id, email, name, role FROM users WHERE id = ? AND disabled_at IS NULL").bind(userId).first<{ role: "owner" | "producer" }>();
  if (!user) throw INVALID();
  deleteCookie(c, loginCookieName(c.env), { path: "/", secure: cookieSecure(c.env) });
  await createSession(c, userId, user.role);
  return c.json({ user });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

/** L9：全部の端末からログアウト（このユーザーのセッションを全部消す） */
auth.post("/logout-all", requireUser, async (c) => {
  const r = await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(c.get("user").id).run();
  await destroySession(c);
  return c.json({ ok: true, sessions: r.meta.changes });
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
