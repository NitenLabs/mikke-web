import type { Env } from "../env";
import { ApiError, bad, isPlainObject, nowIso } from "../lib/http";
import { canonJSON, collectAssetIds, collectAssetIdsInText } from "../lib/json";
import { visibleItemIds } from "../lib/visibility";
import { newId } from "../lib/crypto";
import { recordChanges, type Actor } from "./changes";
import { getDraft, saveDraft, type DraftRow } from "./drafts";

/** 公開した版の履歴は新しい方から 30、戻す前の下書きは 10（DATA_SPEC 6章） */
export const MAX_VERSIONS = 30;
export const MAX_BACKUPS = 10;

export const MAX_PAGES = 50;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const MAX_CSS_BYTES = 1024 * 1024;
export const MAX_PUBLISH_BYTES = 24 * 1024 * 1024;
/** 公開ページと一緒に置ける、ページ以外のファイル（D5 のサイトマップなど） */
export const EXTRA_FILES: Record<string, string> = {
  "sitemap.xml": "application/xml; charset=utf-8",
  "robots.txt": "text/plain; charset=utf-8",
};

const PAGE_PATH_RE = /^\/(?:[a-z0-9][a-z0-9-]{0,62}(?:\/[a-z0-9][a-z0-9-]{0,62}){0,3})?$/;

/** 公開ページの道 → R2 の名前（"/" → index、"/menu" → menu） */
export function pageKeyName(path: string): string {
  return path === "/" ? "index" : path.slice(1);
}

export const versionPrefix = (shopId: string, n: number) => `sites/${shopId}/v${n}/`;
export const pageKey = (shopId: string, n: number, path: string) => `${versionPrefix(shopId, n)}pages/${pageKeyName(path)}.html`;
export const cssKey = (shopId: string, n: number) => `${versionPrefix(shopId, n)}style.css`;
export const fileKey = (shopId: string, n: number, name: string) => `${versionPrefix(shopId, n)}files/${name}`;

export interface PublishedVersion {
  number: number;
  scope: "all" | "shop";
  shop: unknown;
  site: unknown;
  pages: string[];
  hasCss: boolean;
  files: string[];
  visibility: string[];
  publishedAt: string;
  publishedBy: { id: string | null; kind: string };
}

function rowToVersion(r: any): PublishedVersion {
  return {
    number: r.number,
    scope: r.scope,
    shop: JSON.parse(r.shop_body),
    site: JSON.parse(r.site_body),
    pages: JSON.parse(r.pages),
    hasCss: !!r.has_css,
    files: JSON.parse(r.files),
    visibility: JSON.parse(r.visibility),
    publishedAt: r.published_at,
    publishedBy: { id: r.published_by, kind: r.published_by_kind },
  };
}

export async function getVersion(env: Env, shopId: string, n: number): Promise<PublishedVersion | null> {
  const r = await env.DB.prepare("SELECT * FROM versions WHERE shop_id = ? AND number = ?").bind(shopId, n).first();
  return r ? rowToVersion(r) : null;
}

export async function getPublished(env: Env, shopId: string): Promise<PublishedVersion | null> {
  const s = await env.DB.prepare("SELECT published_version FROM shops WHERE id = ?").bind(shopId).first<{ published_version: number | null }>();
  if (!s?.published_version) return null;
  return getVersion(env, shopId, s.published_version);
}

export interface PublishInput {
  scope: "all" | "shop";
  shopDraftVersion: number;
  siteDraftVersion?: number;
  pages: Record<string, string>;
  css?: string;
  files?: Record<string, string>;
}

const byteLen = (s: string) => new TextEncoder().encode(s).byteLength;

export function parsePublishInput(body: unknown): PublishInput {
  if (!isPlainObject(body)) throw bad("invalid_publish", "本文は JSON の入れ物にしてください");
  const scope = body.scope ?? "all";
  if (scope !== "all" && scope !== "shop") throw bad("invalid_publish", "scope は all（サイト全体）か shop（お店の情報だけ）");
  const isVer = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
  if (!isVer(body.shopDraftVersion)) throw bad("invalid_publish", "shopDraftVersion（公開する ① の下書きの版）を付けてください");
  if (scope === "all" && !isVer(body.siteDraftVersion)) throw bad("invalid_publish", "siteDraftVersion（公開する ②③ の下書きの版）を付けてください");
  if (!isPlainObject(body.pages)) throw bad("invalid_publish", "pages（道 → HTML）を付けてください");
  const pages: Record<string, string> = {};
  const entries = Object.entries(body.pages);
  if (!entries.length || entries.length > MAX_PAGES) throw bad("invalid_publish", `ページは 1〜${MAX_PAGES} 枚`);
  for (const [p, html] of entries) {
    if (!PAGE_PATH_RE.test(p)) throw bad("invalid_publish", `ページの道の形が正しくありません：${p}（例 "/"・"/menu"）`);
    if (typeof html !== "string" || !html.length) throw bad("invalid_publish", `ページ ${p} の HTML がありません`);
    if (byteLen(html) > MAX_PAGE_BYTES) throw new ApiError(413, "too_large", `ページ ${p} が大きすぎます`);
    pages[p] = html;
  }
  if (!("/" in pages)) throw bad("invalid_publish", 'トップページ（"/"）がありません');
  let css: string | undefined;
  if (body.css !== undefined) {
    if (typeof body.css !== "string") throw bad("invalid_publish", "css は文字列");
    if (byteLen(body.css) > MAX_CSS_BYTES) throw new ApiError(413, "too_large", "CSS が大きすぎます");
    css = body.css;
  }
  let files: Record<string, string> | undefined;
  if (body.files !== undefined) {
    if (!isPlainObject(body.files)) throw bad("invalid_publish", "files は {名前: 中身}");
    files = {};
    for (const [name, v] of Object.entries(body.files)) {
      if (!(name in EXTRA_FILES)) throw bad("invalid_publish", `置けないファイルです：${name}（${Object.keys(EXTRA_FILES).join("・")} だけ）`);
      if (typeof v !== "string" || byteLen(v) > MAX_PAGE_BYTES) throw bad("invalid_publish", `${name} の中身が正しくありません`);
      files[name] = v;
    }
  }
  return {
    scope,
    shopDraftVersion: body.shopDraftVersion as number,
    siteDraftVersion: body.siteDraftVersion as number | undefined,
    pages,
    css,
    files,
  };
}

/** このお店の写真か（ほかのお店の写真・消した写真を指していないか） */
async function assertOwnAssets(env: Env, shopId: string, ids: Set<string>): Promise<void> {
  if (!ids.size) return;
  const list = [...ids];
  const found = new Set<string>();
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const res = await env.DB.prepare(`SELECT id FROM assets WHERE shop_id = ? AND purged_at IS NULL AND id IN (${chunk.map(() => "?").join(",")})`)
      .bind(shopId, ...chunk)
      .all<{ id: string }>();
    for (const r of res.results) found.add(r.id);
  }
  const missing = list.filter((id) => !found.has(id));
  if (missing.length) throw bad("unknown_assets", "素材置き場にない写真を指しています", { assets: missing });
}

/**
 * D1：公開。下書き（①②③）の写しを版として残し、編集画面が描いた HTML・CSS を R2 に置いて、公開中の版を切り替える。
 * scope=shop（メニュー画面の公開）は ① だけを新しくし、②③ は公開中の版のものを引き継ぐ。
 */
export async function publish(env: Env, shopId: string, actor: Actor, input: PublishInput, now = new Date()) {
  const [shopD, siteD, current] = await Promise.all([getDraft(env, shopId, "shop"), getDraft(env, shopId, "site"), getPublished(env, shopId)]);
  const conflict = () =>
    new ApiError(409, "conflict", "公開する間に下書きが変わりました。今の下書きで描き直してから公開してください", {
      current: { shopDraftVersion: shopD?.version ?? 0, siteDraftVersion: siteD?.version ?? 0 },
    });
  if (!shopD || shopD.version !== input.shopDraftVersion) throw conflict();
  let siteBody: unknown;
  if (input.scope === "all") {
    if (!siteD || siteD.version !== input.siteDraftVersion) throw conflict();
    siteBody = siteD.data;
  } else {
    if (!current) throw new ApiError(409, "not_published", "まだ一度もサイト全体を公開していません。先に編集画面から公開してください");
    siteBody = current.site;
  }
  const shopBody = shopD.data;

  const assetIds = collectAssetIds(shopBody);
  collectAssetIds(siteBody, assetIds);
  for (const html of Object.values(input.pages)) collectAssetIdsInText(html, assetIds);
  if (input.css) collectAssetIdsInText(input.css, assetIds);
  await assertOwnAssets(env, shopId, assetIds);

  const seq = await env.DB.prepare("UPDATE shops SET version_seq = version_seq + 1 WHERE id = ? RETURNING version_seq").bind(shopId).first<{ version_seq: number }>();
  const n = seq!.version_seq;

  // 先に R2 に置く（途中で失敗しても、公開中の版は前のまま）
  const htmlMeta = { httpMetadata: { contentType: "text/html; charset=utf-8" } };
  await Promise.all([
    ...Object.entries(input.pages).map(([p, html]) => env.BUCKET.put(pageKey(shopId, n, p), html, htmlMeta)),
    input.css !== undefined ? env.BUCKET.put(cssKey(shopId, n), input.css, { httpMetadata: { contentType: "text/css; charset=utf-8" } }) : null,
    ...Object.entries(input.files ?? {}).map(([name, v]) => env.BUCKET.put(fileKey(shopId, n, name), v, { httpMetadata: { contentType: EXTRA_FILES[name] } })),
  ]);

  const at = nowIso();
  const visibility = visibleItemIds(shopBody, now);
  const stmts = [
    env.DB.prepare(
      `INSERT INTO versions (shop_id, number, scope, shop_body, site_body, pages, has_css, files, visibility, published_at, published_by, published_by_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      shopId,
      n,
      input.scope,
      JSON.stringify(shopBody),
      JSON.stringify(siteBody),
      JSON.stringify(Object.keys(input.pages).sort()),
      input.css !== undefined ? 1 : 0,
      JSON.stringify(Object.keys(input.files ?? {}).sort()),
      JSON.stringify(visibility),
      at,
      actor.id,
      actor.kind,
    ),
    ...[...assetIds].map((a) => env.DB.prepare("INSERT INTO version_assets (shop_id, number, asset_id) VALUES (?, ?, ?)").bind(shopId, n, a)),
    env.DB.prepare("UPDATE shops SET published_version = ?, rendered_visibility = ? WHERE id = ?").bind(n, JSON.stringify(visibility), shopId),
  ];
  await env.DB.batch(stmts);
  await recordChanges(env, shopId, actor, [{ layer: "publish", action: input.scope === "all" ? "publish" : "publish-shop", path: `/versions/${n}`, before: current?.number ?? null, after: n }]);
  await pruneVersions(env, shopId);
  return { number: n, scope: input.scope, publishedAt: at, pages: Object.keys(input.pages).sort(), assets: [...assetIds].sort() };
}

/** 新しい方から 30 を残して、古い版（行と R2 のファイル）を消す。公開中の版は数に関係なく残す */
export async function pruneVersions(env: Env, shopId: string): Promise<number[]> {
  const res = await env.DB.prepare(
    `SELECT number FROM versions WHERE shop_id = ? AND number <> IFNULL((SELECT published_version FROM shops WHERE id = ?), -1)
     AND number NOT IN (SELECT number FROM versions WHERE shop_id = ? ORDER BY number DESC LIMIT ?)`,
  )
    .bind(shopId, shopId, shopId, MAX_VERSIONS)
    .all<{ number: number }>();
  const olds = res.results.map((r) => r.number);
  for (const n of olds) {
    await deletePrefix(env, versionPrefix(shopId, n));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM version_assets WHERE shop_id = ? AND number = ?").bind(shopId, n),
      env.DB.prepare("DELETE FROM versions WHERE shop_id = ? AND number = ?").bind(shopId, n),
    ]);
  }
  return olds;
}

export async function deletePrefix(env: Env, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const list = await env.BUCKET.list({ prefix, cursor });
    if (list.objects.length) await env.BUCKET.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

export async function listVersions(env: Env, shopId: string) {
  const s = await env.DB.prepare("SELECT published_version FROM shops WHERE id = ?").bind(shopId).first<{ published_version: number | null }>();
  const res = await env.DB.prepare(
    `SELECT v.number, v.scope, v.pages, v.published_at, v.published_by, v.published_by_kind, u.name, u.email
     FROM versions v LEFT JOIN users u ON u.id = v.published_by WHERE v.shop_id = ? ORDER BY v.number DESC`,
  )
    .bind(shopId)
    .all<any>();
  return res.results.map((r) => ({
    number: r.number,
    scope: r.scope,
    pages: JSON.parse(r.pages),
    publishedAt: r.published_at,
    publishedBy: { id: r.published_by, kind: r.published_by_kind, name: r.name ?? null, email: r.email ?? null },
    isPublished: r.number === s?.published_version,
  }));
}

/**
 * 下書きを置き換える（「この版を下書きにする」・戻す前の下書きから戻す）。
 * 置き換える前の下書きが公開中と違えば、その写しを「戻す前の下書き」に残す（10 まで）。
 */
export async function replaceDrafts(
  env: Env,
  shopId: string,
  actor: Actor,
  next: { site?: unknown; shop?: unknown },
  expected: { site?: number; shop?: number },
  reason: string,
): Promise<{ backupId: string | null; drafts: Record<string, { version: number; updatedAt: string }> }> {
  const [shopD, siteD, pub] = await Promise.all([getDraft(env, shopId, "shop"), getDraft(env, shopId, "site"), getPublished(env, shopId)]);
  const cur = { shop: shopD, site: siteD } as Record<"shop" | "site", DraftRow | null>;
  const conflict = () =>
    new ApiError(409, "conflict", "ほかの端末かタブで下書きが変わりました。読み直してからもう一度お試しください", {
      current: { shopDraftVersion: shopD?.version ?? 0, siteDraftVersion: siteD?.version ?? 0 },
    });
  for (const k of ["shop", "site"] as const) {
    if (next[k] === undefined) continue;
    if (expected[k] === undefined || (cur[k]?.version ?? 0) !== expected[k]) throw conflict();
  }
  const differs =
    !pub || canonJSON(shopD?.data) !== canonJSON(pub.shop) || canonJSON(siteD?.data) !== canonJSON(pub.site);
  let backupId: string | null = null;
  if (differs && (shopD || siteD)) {
    backupId = newId("bak", 12);
    const ids = collectAssetIds(shopD?.data);
    collectAssetIds(siteD?.data, ids);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO draft_backups (id, shop_id, shop_body, site_body, reason, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
        backupId,
        shopId,
        JSON.stringify(shopD?.data ?? null),
        JSON.stringify(siteD?.data ?? null),
        reason,
        nowIso(),
        actor.id,
      ),
      ...[...ids].map((a) => env.DB.prepare("INSERT INTO backup_assets (backup_id, asset_id) VALUES (?, ?)").bind(backupId, a)),
    ]);
    await pruneBackups(env, shopId);
  }
  const out: Record<string, { version: number; updatedAt: string }> = {};
  for (const k of ["shop", "site"] as const) {
    if (next[k] === undefined) continue;
    const saved = await saveDraft(env, shopId, k, expected[k]!, next[k], actor.id);
    if (!saved) throw conflict();
    out[k] = saved;
    await recordChanges(env, shopId, actor, [{ layer: k, action: reason, path: "/", before: `版 ${cur[k]?.version ?? 0}`, after: `版 ${saved.version}` }]);
  }
  return { backupId, drafts: out };
}

export async function pruneBackups(env: Env, shopId: string): Promise<void> {
  const res = await env.DB.prepare(
    "SELECT id FROM draft_backups WHERE shop_id = ? AND id NOT IN (SELECT id FROM draft_backups WHERE shop_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)",
  )
    .bind(shopId, shopId, MAX_BACKUPS)
    .all<{ id: string }>();
  for (const { id } of res.results) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM backup_assets WHERE backup_id = ?").bind(id),
      env.DB.prepare("DELETE FROM draft_backups WHERE id = ?").bind(id),
    ]);
  }
}
