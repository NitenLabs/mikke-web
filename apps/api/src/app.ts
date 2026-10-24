import { Hono } from "hono";
import type { AppEnv, Env } from "./env";
import { errorResponse } from "./lib/http";
import { admin } from "./routes/admin";
import { assets } from "./routes/assets";
import { auth, me } from "./routes/auth";
import { publicSite, shopSlugFromHost } from "./routes/public";
import { publishing } from "./routes/publishing";
import { shops } from "./routes/shops";
import { assertConfig } from "./services/config";
import { corsForApp, csrfGuard } from "./services/csrf";
import { requireShop, requireUser } from "./services/session";

/** API（編集画面から） */
export const api = new Hono<AppEnv>();
api.onError(errorResponse);
api.use("/api/*", corsForApp, csrfGuard, async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
});
api.get("/api/health", (c) => c.json({ ok: true }));
api.route("/api/auth", auth);
api.route("/api/me", me);
api.route("/api/admin", admin);

const shopApi = new Hono<AppEnv>();
shopApi.use("*", requireUser);
shopApi.use("/:shopId", requireShop);
shopApi.use("/:shopId/*", requireShop);
shopApi.route("/", shops);
shopApi.route("/", publishing);
shopApi.route("/", assets);
api.route("/api/shops", shopApi);
api.notFound((c) => c.json({ error: "not_found", message: "見つかりません" }, 404));

publicSite.onError(errorResponse);

/** ホスト名で振り分ける：<slug>.<PUBLIC_DOMAIN> は公開ページ、それ以外は API */
export function handleFetch(req: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
  // L5・L6：危ない設定のままでは動かない（その isolate の最初の要求で確かめ、覚えておく）
  try {
    assertConfig(env);
  } catch (e) {
    console.error(String(e));
    return new Response("設定に問題があるので動きません（ログを見てください）", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const slug = shopSlugFromHost(env, req.headers.get("host") ?? new URL(req.url).host);
  if (slug) return publicSite.fetch(req, env, ctx);
  return api.fetch(req, env, ctx);
}
