import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { RESERVED_SLUGS, SLUG_RE } from "../lib/slug";
import { SITE_SCRIPTS, SITE_SCRIPTS_VERSION } from "../site-assets";
import { cssKey, EXTRA_FILES, fileKey, pageKey } from "../services/publish";
import { VARIANT_FORMATS, variantWidths, type VariantFormat } from "../services/variants";

/** ホスト名 → お店のスラッグ（<slug>.<PUBLIC_DOMAIN> のときだけ）。それ以外は null */
export function shopSlugFromHost(env: Env, host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const suffix = "." + env.PUBLIC_DOMAIN.toLowerCase();
  if (!h.endsWith(suffix)) return null;
  const slug = h.slice(0, -suffix.length);
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) ? slug : null;
}

/** M4：公開ページの CSP。スクリプトは同じオリジンの決まったファイル（/_mikke/）だけ */
export const PUBLIC_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "frame-src https://www.google.com",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": PUBLIC_CSP,
};

const DEFAULT_404 = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ページが見つかりません</title>
<style>body{margin:0;font-family:system-ui,sans-serif;color:#333;background:#fff;display:grid;place-items:center;min-height:100vh}main{padding:16px;text-align:center}</style></head>
<body><main><h1>ページが見つかりません</h1><p>アドレスが変わったか、なくなったページです。</p></main></body></html>`;

const IMMUTABLE = "public, max-age=31536000, immutable";

type Ctx = { shopId: string; n: number; pages: Set<string>; files: Set<string>; hasCss: boolean };

/** D3：公開ページの配信（お店のサブドメイン） */
export const publicSite = new Hono<AppEnv>();

publicSite.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return c.text("Method Not Allowed", 405, { Allow: "GET, HEAD" });
  await next();
});

async function lookup(env: Env, slug: string): Promise<Ctx | null> {
  const r = await env.DB.prepare(
    "SELECT s.id, s.published_version, v.pages, v.files, v.has_css FROM shops s JOIN versions v ON v.shop_id = s.id AND v.number = s.published_version WHERE s.slug = ?",
  )
    .bind(slug)
    .first<{ id: string; published_version: number; pages: string; files: string; has_css: number }>();
  if (!r) return null;
  return { shopId: r.id, n: r.published_version, pages: new Set(JSON.parse(r.pages)), files: new Set(JSON.parse(r.files)), hasCss: !!r.has_css };
}

async function serveObject(c: any, key: string, contentType: string, cacheControl: string, status = 200): Promise<Response | null> {
  const obj = await (c.env as Env).BUCKET.get(key);
  if (!obj) return null;
  const headers: Record<string, string> = { ...SECURITY_HEADERS, "Content-Type": contentType, "Cache-Control": cacheControl, ETag: obj.httpEtag };
  if (status === 200 && c.req.header("if-none-match") === obj.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(c.req.method === "HEAD" ? null : obj.body, { status, headers });
}

async function notFoundPage(c: any, ctx: Ctx | null): Promise<Response> {
  if (ctx && ctx.pages.has("/404")) {
    const r = await serveObject(c, pageKey(ctx.shopId, ctx.n, "/404"), "text/html; charset=utf-8", "no-cache", 404);
    if (r) return r;
  }
  return new Response(c.req.method === "HEAD" ? null : DEFAULT_404, {
    status: 404,
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

publicSite.get("*", async (c) => {
  // 決まったスクリプト（店主は変えられない。お店によらず同じ）
  const fixed = /^\/_mikke\/([a-z0-9._-]+\.js)$/.exec(new URL(c.req.url).pathname);
  if (fixed && Object.hasOwn(SITE_SCRIPTS, fixed[1])) {
    return new Response(c.req.method === "HEAD" ? null : SITE_SCRIPTS[fixed[1]], {
      headers: { ...SECURITY_HEADERS, "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", ETag: `"mikke-${SITE_SCRIPTS_VERSION}"` },
    });
  }
  const slug = shopSlugFromHost(c.env, c.req.header("host"))!;
  const ctx = await lookup(c.env, slug);
  if (!ctx) return notFoundPage(c, null);
  const url = new URL(c.req.url);
  let path = url.pathname;

  // 写真：公開中の版が指している、このお店の写真だけ（ゴミ箱に入れていても、版が指していれば配る。C4）
  // C3：/media/<ID>/<幅>.<webp|jpg> は大きさ違い
  const media = /^\/media\/(ast_[a-z0-9]{4,24})(?:\/([1-9][0-9]{0,3})\.(webp|jpg))?$/.exec(path);
  if (media) {
    const a = await c.env.DB.prepare(
      `SELECT a.r2_key, a.mime, a.width FROM assets a JOIN version_assets va ON va.asset_id = a.id AND va.shop_id = a.shop_id
       WHERE a.id = ? AND a.shop_id = ? AND va.number = ? AND a.purged_at IS NULL`,
    )
      .bind(media[1], ctx.shopId, ctx.n)
      .first<{ r2_key: string; mime: string; width: number }>();
    if (!a) return notFoundPage(c, ctx);
    if (!media[2]) {
      // 写真の中身は ID ごとに変わらないので、長く覚えてよい
      return (await serveObject(c, a.r2_key, a.mime, IMMUTABLE)) || notFoundPage(c, ctx);
    }
    const w = Number(media[2]);
    const fmt = media[3] as VariantFormat;
    if (!variantWidths(a.width).includes(w)) return notFoundPage(c, ctx);
    const vs = (await c.env.DB.prepare("SELECT width, format, r2_key FROM asset_variants WHERE asset_id = ? AND width = ?").bind(media[1], w).all<{ format: VariantFormat; r2_key: string }>())
      .results;
    // 1. 頼まれた形式 2. 同じ幅の JPEG（WebP を作れなかった写真）。大きさ違いは置いたら変えないので、どちらも長く覚えてよい
    const v = vs.find((x) => x.format === fmt) ?? vs.find((x) => x.format === "jpg");
    if (v) return (await serveObject(c, v.r2_key, VARIANT_FORMATS[v.format], IMMUTABLE)) || notFoundPage(c, ctx);
    // 3. 大きさ違いのない（前に上げた 1 枚だけの）写真：元の 1 枚を返す。あとで大きさ違いを足せるので、短く覚える
    return (await serveObject(c, a.r2_key, a.mime, "public, max-age=86400")) || notFoundPage(c, ctx);
  }
  if (path === "/style.css" && ctx.hasCss) {
    return (await serveObject(c, cssKey(ctx.shopId, ctx.n), "text/css; charset=utf-8", "no-cache")) || notFoundPage(c, ctx);
  }
  const fname = path.slice(1);
  if (Object.hasOwn(EXTRA_FILES, fname) && ctx.files.has(fname)) {
    return (await serveObject(c, fileKey(ctx.shopId, ctx.n, fname), EXTRA_FILES[fname], "no-cache")) || notFoundPage(c, ctx);
  }
  // ページ："/menu" と "/menu/" を同じに。"/404" は見つからないページとしてだけ出す
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path !== "/404" && ctx.pages.has(path)) {
    // 公開したら数秒のうちに新しくなるよう、毎回確かめさせる（D1）
    const r = await serveObject(c, pageKey(ctx.shopId, ctx.n, path), "text/html; charset=utf-8", "no-cache");
    if (r) return r;
  }
  return notFoundPage(c, ctx);
});
