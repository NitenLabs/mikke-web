import { Hono } from "hono";
import type { AppEnv } from "../env";
import { sha256Hex, timingSafeEqual } from "../lib/crypto";
import { ApiError, bad, isPlainObject, nowIso, readJson } from "../lib/http";
import { assetJson, getAsset, type AssetRow } from "../services/assets";
import { getVersion, renderOf } from "../services/publish";
import { draftChangeRows, recordChanges, SYSTEM } from "../services/changes";
import { draftJson, getDraft, MAX_DRAFT_BYTES, parseIfMatch, saveDraft, validateDraft } from "../services/drafts";

/**
 * 段2（mikke-desk の直しの依頼）とのつなぎ：PC の edit-runner が、お店の ①（shop の下書き）を読み書きする口。
 * ブラウザではないので Cookie・Origin は使わず、ヘッダ `x-edit-runner-secret` の鍵で入る（/api の外に置く）。
 * 鍵が Worker に無い（か 32 文字より短い）ときは口を閉じる（503）。
 * 書くのは ① 全体（runner が承認済みの差分を当てた後の物）。版番号（If-Match）が古ければ 409。公開はしない（下書きになるだけ）。
 */
export const runner = new Hono<AppEnv>();

runner.use("*", async (c, next) => {
  const want = c.env.EDIT_RUNNER_SECRET ?? "";
  if (want.length < 32) throw new ApiError(503, "runner_closed", "runner の口は閉じています（EDIT_RUNNER_SECRET がありません）");
  const got = c.req.header("x-edit-runner-secret") ?? "";
  if (!got || !timingSafeEqual(await sha256Hex(got), await sha256Hex(want))) throw new ApiError(401, "unauthenticated", "鍵が違います");
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
});

/** :shop はお店の ID（shp_…）か slug（mikke-web の店のフォルダ名と同じにしておく。例 amet） */
async function findShop(c: { env: AppEnv["Bindings"] }, key: string): Promise<{ id: string; slug: string }> {
  if (!/^[a-z0-9_-]{1,64}$/.test(key)) throw new ApiError(404, "not_found", "お店が見つかりません");
  const s = await c.env.DB.prepare("SELECT id, slug FROM shops WHERE id = ? OR slug = ?").bind(key, key).first<{ id: string; slug: string }>();
  if (!s) throw new ApiError(404, "not_found", "お店が見つかりません");
  return s;
}

/** runner の shopHash と同じ：JSON.stringify(①) の SHA-256 */
const hashOf = (data: unknown) => sha256Hex(JSON.stringify(data ?? null));

/** ① を書き出す。{shopId, slug, version, baseHash, data, updatedAt} */
runner.get("/shops/:shop/shop", async (c) => {
  const s = await findShop(c, c.req.param("shop"));
  const d = await getDraft(c.env, s.id, "shop");
  if (!d) throw new ApiError(404, "not_found", "① の下書きがありません");
  return c.json({ shopId: s.id, slug: s.slug, version: d.version, baseHash: await hashOf(d.data), data: d.data, updatedAt: d.updatedAt }, 200, { ETag: `"${d.version}"` });
});

/** 承認済みの直しを当てた ① を書き戻す。If-Match: "読んだ版" が要る。本文は ① そのもの */
runner.put("/shops/:shop/shop", async (c) => {
  const s = await findShop(c, c.req.param("shop"));
  const expected = parseIfMatch(c.req.header("if-match"));
  if (expected === null) throw new ApiError(428, "precondition_required", "If-Match に、読んだときの版番号を付けてください");
  const data = await readJson(c, MAX_DRAFT_BYTES);
  validateDraft("shop", s.id, data);
  const before = await getDraft(c.env, s.id, "shop");
  const rows = draftChangeRows("shop", before?.data, data);
  const saved = (before?.version ?? 0) === expected ? await saveDraft(c.env, s.id, "shop", expected, data, null) : null;
  if (!saved) {
    const current = await getDraft(c.env, s.id, "shop");
    throw new ApiError(409, "conflict", "読んだ後に ① が直されています（店主の編集画面など）。読み直して差分を当て直してください", {
      current: current ? { ...draftJson("shop", current), baseHash: await hashOf(current.data) } : { kind: "shop", version: 0, data: null },
    });
  }
  await recordChanges(c.env, s.id, SYSTEM, rows);
  return c.json({ shopId: s.id, version: saved.version, baseHash: await hashOf(data), updatedAt: saved.updatedAt }, 200, { ETag: `"${saved.version}"` });
});

// ---- 描き直し（render:"rebuild" の公開。指示 0054）：runner が版の ①②・写真を取り、rebuild-shop で描いて、結果を返す ----

const versionNum = (s: string) => {
  if (!/^\d{1,9}$/.test(s)) throw new ApiError(404, "not_found", "版が見つかりません");
  return Number(s);
};

/** 版の中身。{shopId, slug, number, scope, publishedAt, isPublished, render, shop, site, assets}。assets は ④ の形（版が指している写真だけ） */
runner.get("/shops/:shop/versions/:n", async (c) => {
  const s = await findShop(c, c.req.param("shop"));
  const v = await getVersion(c.env, s.id, versionNum(c.req.param("n")));
  if (!v) throw new ApiError(404, "not_found", "版が見つかりません");
  const res = await c.env.DB.prepare(
    `SELECT a.* FROM assets a JOIN version_assets va ON va.asset_id = a.id AND va.shop_id = a.shop_id
     WHERE va.shop_id = ? AND va.number = ? AND a.purged_at IS NULL ORDER BY a.id`,
  )
    .bind(s.id, v.number)
    .all<AssetRow>();
  const assets: Record<string, unknown> = {};
  for (const r of res.results) {
    const { id, ...rest } = assetJson(r);
    assets[id] = rest;
  }
  const pub = await c.env.DB.prepare("SELECT published_version FROM shops WHERE id = ?").bind(s.id).first<{ published_version: number | null }>();
  return c.json({
    shopId: s.id,
    slug: s.slug,
    number: v.number,
    scope: v.scope,
    publishedAt: v.publishedAt,
    isPublished: pub?.published_version === v.number,
    render: v.render,
    shop: v.shop,
    site: v.site,
    assets: { schemaVersion: 1, assets },
  });
});

/** 写真そのもの（元の 1 枚）。ゴミ箱の中でも、消しきっていなければ返す（版が指していることがあるので） */
runner.get("/shops/:shop/assets/:id/file", async (c) => {
  const s = await findShop(c, c.req.param("shop"));
  const row = await getAsset(c.env, s.id, c.req.param("id"));
  if (!row) throw new ApiError(404, "not_found", "写真が見つかりません");
  const obj = await c.env.BUCKET.get(row.r2_key);
  if (!obj) throw new ApiError(404, "not_found", "写真のファイルが見つかりません");
  return new Response(obj.body, { headers: { "Content-Type": row.mime, "Content-Security-Policy": "default-src 'none'" } });
});

/** 描き直しの結果を返す。本文 {ok: true, url?} か {ok: false, error}。rebuild の版だけ（html の版は 409）。何度送ってもよい（最後のが残る） */
runner.post("/shops/:shop/versions/:n/render", async (c) => {
  const s = await findShop(c, c.req.param("shop"));
  const n = versionNum(c.req.param("n"));
  const body = await readJson<Record<string, unknown>>(c, 8 * 1024);
  if (!isPlainObject(body) || typeof body.ok !== "boolean") throw bad("invalid_render", "本文は {ok: true|false, url?, error?}");
  for (const k of Object.keys(body)) if (!["ok", "url", "error"].includes(k)) throw bad("invalid_render", `知らない項目があります：${k}（ok・url・error だけ）`);
  let url: string | null = null;
  if (body.url !== undefined && body.url !== null) {
    if (typeof body.url !== "string" || body.url.length > 500 || !/^https?:\/\/[^\s]+$/.test(body.url)) throw bad("invalid_render", "url は http(s):// で始まる 500 字までの文字");
    url = body.url;
  }
  let error: string | null = null;
  if (body.error !== undefined && body.error !== null) {
    if (typeof body.error !== "string") throw bad("invalid_render", "error は文字");
    error = body.error.slice(0, 1000);
  }
  if (!body.ok && !error) throw bad("invalid_render", "失敗のときは error（理由）を付けてください");
  const row = await c.env.DB.prepare("SELECT render_state FROM versions WHERE shop_id = ? AND number = ?").bind(s.id, n).first<{ render_state: string }>();
  if (!row) throw new ApiError(404, "not_found", "版が見つかりません");
  if (row.render_state === "html") throw new ApiError(409, "not_rebuild", "この版は編集画面が描いた HTML の版です（描き直しの版ではありません）");
  const at = nowIso();
  await c.env.DB.prepare("UPDATE versions SET render_state = ?, render_error = ?, render_url = ?, rendered_at = ? WHERE shop_id = ? AND number = ?")
    .bind(body.ok ? "ok" : "failed", body.ok ? null : error, url, at, s.id, n)
    .run();
  return c.json({ shopId: s.id, number: n, render: renderOf({ render_state: body.ok ? "ok" : "failed", render_error: body.ok ? null : error, render_url: url, rendered_at: at }) });
});
