import type { MiddlewareHandler } from "hono";
import type { AppEnv, Env } from "../env";
import { ApiError } from "../lib/http";

export const allowedOrigins = (env: Env) =>
  env.APP_ORIGINS.split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF の守り。書き込み（GET・HEAD・OPTIONS 以外）は、Origin が編集画面のオリジンのときだけ受ける。
 * Origin がない要求も断る（ブラウザは書き込みの要求に必ず Origin を付ける）。
 * Cookie の SameSite=Lax と合わせて二重の守り。公開ページ（お店のサブドメイン）は同じサイトでも Origin が違うので断られる。
 */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE.has(c.req.method)) {
    const origin = c.req.header("origin");
    if (!origin || !allowedOrigins(c.env).includes(origin)) {
      throw new ApiError(403, "bad_origin", "この画面からの書き込みは受け付けません");
    }
  }
  await next();
};

/** 編集画面が別のオリジンに置かれたとき用の CORS（Cookie つき）。許したオリジンだけ */
export const corsForApp: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header("origin");
  const ok = !!origin && allowedOrigins(c.env).includes(origin);
  if (c.req.method === "OPTIONS") {
    if (!ok) return c.body(null, 403);
    return c.body(null, 204, {
      "Access-Control-Allow-Origin": origin!,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, If-Match, X-File-Name",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    });
  }
  await next();
  if (ok) {
    c.res.headers.set("Access-Control-Allow-Origin", origin!);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.set("Access-Control-Expose-Headers", "ETag, Retry-After");
    c.res.headers.append("Vary", "Origin");
  }
};
