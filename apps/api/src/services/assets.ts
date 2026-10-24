import type { Env } from "../env";
import { ApiError, bad, isPlainObject, nowIso } from "../lib/http";
import { collectAssetIds } from "../lib/json";
import { newId, sha256Hex } from "../lib/crypto";
import { ACCEPTED_MIMES, sniffImage, type ImageMime } from "../lib/image";
import { recordChanges, SYSTEM, type Actor } from "./changes";
import { checkVariants, deleteVariants, listVariants, putVariants, variantBytes, variantJson, type VariantPart } from "./variants";

/** 受け付ける大きさ（C2：ブラウザで長い辺 2400px に縮めてから送る前提） */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_LONG_SIDE = 2400;
/** L10：お店ごとの写真の上限（合計の大きさ・枚数。ゴミ箱の中も数える） */
export const MAX_SHOP_ASSET_BYTES = 1024 ** 3;
export const MAX_SHOP_ASSETS = 2000;
/** ゴミ箱に入れてから本当に消すまで（日） */
export const TRASH_DAYS = 30;

const EXT: Record<ImageMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export interface AssetRow {
  id: string;
  shop_id: string;
  r2_key: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  meta: string;
  uploaded_at: string;
  trashed_at: string | null;
  purged_at: string | null;
}

/** ④ の 1 件の形（assets.schema.json）に ID を足したもの */
export function assetJson(r: AssetRow) {
  const meta = JSON.parse(r.meta);
  if (r.trashed_at) meta.trashedAt = r.trashed_at;
  else delete meta.trashedAt;
  return { id: r.id, ...meta };
}

export async function getAsset(env: Env, shopId: string, id: string): Promise<AssetRow | null> {
  if (!/^ast_[a-z0-9]{4,24}$/.test(id)) return null;
  return env.DB.prepare("SELECT * FROM assets WHERE id = ? AND shop_id = ? AND purged_at IS NULL").bind(id, shopId).first<AssetRow>();
}

/** お店の写真の置き場の使っている量（写真＋大きさ違い。ゴミ箱の中も数える） */
async function usedBytes(env: Env, shopId: string): Promise<{ n: number; total: number }> {
  const r = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM assets WHERE shop_id = ?1 AND purged_at IS NULL) AS n,
            (SELECT IFNULL(SUM(bytes), 0) FROM assets WHERE shop_id = ?1 AND purged_at IS NULL)
          + (SELECT IFNULL(SUM(bytes), 0) FROM asset_variants WHERE shop_id = ?1) AS total`,
  )
    .bind(shopId)
    .first<{ n: number; total: number }>();
  return { n: r?.n ?? 0, total: r?.total ?? 0 };
}

const quotaError = () =>
  new ApiError(413, "quota_exceeded", `このお店の写真の置き場がいっぱいです（${MAX_SHOP_ASSETS} 枚・合計 ${MAX_SHOP_ASSET_BYTES / 1024 ** 3}GB まで）。ゴミ箱を空にするか、制作側にご相談ください`);

/**
 * 写真を上げる（C2）。variants があれば大きさ違い（C3）も一緒に検査して置く。
 * どれか 1 つでも検査に通らなければ、何も置かない
 */
export async function uploadAsset(env: Env, shopId: string, actor: Actor, declaredType: string, bytes: Uint8Array, originalName?: string, variantParts: VariantPart[] = []) {
  const mime = declaredType.split(";")[0].trim().toLowerCase();
  if (!ACCEPTED_MIMES.includes(mime as ImageMime)) throw new ApiError(415, "unsupported_media_type", "写真は JPEG・PNG・WebP にしてください（HEIC はブラウザで JPEG に変えてから）");
  if (!bytes.byteLength) throw bad("empty_file", "ファイルが空です");
  const info = sniffImage(bytes);
  if (!info) throw new ApiError(415, "not_an_image", "写真として読めません（壊れているか、ほかの種類のファイルです）");
  if (info.mime !== mime) throw new ApiError(415, "type_mismatch", `中身は ${info.mime} ですが、${mime} として送られています`);
  if (Math.max(info.width, info.height) > MAX_LONG_SIDE)
    throw bad("too_many_pixels", `長い辺を ${MAX_LONG_SIDE}px 以下に縮めてから送ってください（今 ${info.width}×${info.height}）`);
  if (info.metadata.length)
    throw bad("metadata_present", `位置情報が入りうる撮影データ（${info.metadata.join("・")}）が残っています。消してから送ってください`, { metadata: info.metadata });
  if (info.trailing) throw bad("trailing_data", "画像の終わりの後ろに、ほかのデータが付いています");
  // C3：大きさ違いも、写真と同じ検査（M5）をそれぞれに
  const variants = checkVariants(variantParts, info.width, info.height, { required: false });
  // L10：お店ごとの量の上限（ゴミ箱の中も数える。本当に消えるまでは場所を使うので）。大きさ違いの分も数える
  const used = await usedBytes(env, shopId);
  if (used.total + bytes.byteLength + variantBytes(variants) > MAX_SHOP_ASSET_BYTES || used.n >= MAX_SHOP_ASSETS) throw quotaError();

  const id = newId("ast", 12);
  const key = `assets/${shopId}/${id}.${EXT[info.mime]}`;
  const at = nowIso();
  const meta: Record<string, unknown> = {
    kind: "photo",
    file: { key, mime: info.mime, width: info.width, height: info.height, bytes: bytes.byteLength, exifStripped: true },
    uploadedAt: at,
    uploadedBy: actor.kind,
    origin: { kind: actor.kind === "owner" ? "ownerUpload" : "producer" },
    // 店主が自分で上げた写真は「自分で撮った」とする（規約で確かめてもらう）。制作側は未確認から始める
    rights: actor.kind === "owner" ? { basis: "ownWork", confirmedAt: at, confirmedBy: "owner" } : { basis: "unknown" },
  };
  // 名前は記録に使うだけ。制御文字・道の区切りを取り、200 文字まで
  const name = originalName?.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(0, 200);
  if (name) meta.originalName = name;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: info.mime } });
  const vput = await putVariants(env, shopId, id, variants, at);
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO assets (id, shop_id, r2_key, mime, bytes, width, height, sha256, meta, uploaded_at, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(id, shopId, key, info.mime, bytes.byteLength, info.width, info.height, await sha256Hex(bytes), JSON.stringify(meta), at, actor.id),
      ...vput.statements,
    ]);
  } catch (e) {
    await env.BUCKET.delete([key, ...vput.keys]).catch(() => {});
    throw e;
  }
  await recordChanges(env, shopId, actor, [
    { layer: "assets", action: "upload", path: `/assets/${id}`, after: `${info.mime} ${info.width}×${info.height}${variants.length ? `（大きさ違い ${variants.length}）` : ""}` },
  ]);
  return { id, ...meta };
}

/** 前に上げた（1 枚だけの）写真に、あとから大きさ違いを足す（C3）。足せるのは 1 回だけ（公開ページで長く覚えさせるため、置いたら変えない） */
export async function addVariants(env: Env, row: AssetRow, actor: Actor, parts: VariantPart[]) {
  const variants = checkVariants(parts, row.width, row.height, { required: true });
  const has = await env.DB.prepare("SELECT 1 FROM asset_variants WHERE asset_id = ? LIMIT 1").bind(row.id).first();
  if (has) throw new ApiError(409, "conflict", "この写真の大きさ違いはもうあります（置いた大きさ違いは変えられません。変えたいときは写真を上げ直してください）");
  const used = await usedBytes(env, row.shop_id);
  if (used.total + variantBytes(variants) > MAX_SHOP_ASSET_BYTES) throw quotaError();
  const vput = await putVariants(env, row.shop_id, row.id, variants);
  try {
    await env.DB.batch(vput.statements);
  } catch (e) {
    // 同時に 2 つ来て片方が負けたときなど。置いたものは消す（勝った方と同じ名前なので、勝った方の行は残っている＝消さない）
    const now = await listVariants(env, row.id);
    if (!now.length) await env.BUCKET.delete(vput.keys).catch(() => {});
    throw new ApiError(409, "conflict", "この写真の大きさ違いはもうあります");
  }
  await recordChanges(env, row.shop_id, actor, [{ layer: "assets", action: "variants", path: `/assets/${row.id}`, after: `大きさ違い ${variants.length}` }]);
  return (await listVariants(env, row.id)).map(variantJson);
}

const KINDS = ["photo", "logo", "reference"];
const SLOTS = ["exterior", "signature", "interior", "work", "staff", "product", "other"];
const BASES = ["ownWork", "permission", "licensed", "unknown"];

/** 台帳の書き換え（説明文・枠・種類・使う権利）。ファイルそのものは変えない */
export async function patchAsset(env: Env, row: AssetRow, actor: Actor, body: unknown) {
  if (!isPlainObject(body)) throw bad("invalid_asset", "本文は JSON の入れ物にしてください");
  const meta = JSON.parse(row.meta);
  const before: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    before[k] = meta[k];
    if (k === "alt") {
      if (typeof v !== "string" || v.length > 120) throw bad("invalid_asset", "alt は 120 文字まで");
      if (v === "") delete meta.alt;
      else meta.alt = v;
    } else if (k === "slot") {
      if (!SLOTS.includes(v as string)) throw bad("invalid_asset", `slot は ${SLOTS.join("・")}`);
      meta.slot = v;
    } else if (k === "kind") {
      if (!KINDS.includes(v as string)) throw bad("invalid_asset", `kind は ${KINDS.join("・")}`);
      meta.kind = v;
    } else if (k === "rights") {
      if (!isPlainObject(v) || !BASES.includes(v.basis as string)) throw bad("invalid_asset", `rights.basis は ${BASES.join("・")}`);
      if (v.note !== undefined && (typeof v.note !== "string" || v.note.length > 200)) throw bad("invalid_asset", "rights.note は 200 文字まで");
      if (meta.origin?.kind === "stock" && v.basis !== "licensed") throw bad("invalid_asset", "素材サイトの写真は licensed だけ");
      meta.rights = { basis: v.basis, ...(v.basis !== "unknown" ? { confirmedAt: nowIso(), confirmedBy: actor.kind } : {}), ...(v.note ? { note: v.note } : {}) };
    } else {
      throw bad("invalid_asset", `書き換えられない項目です：${k}`);
    }
  }
  await env.DB.prepare("UPDATE assets SET meta = ? WHERE id = ?").bind(JSON.stringify(meta), row.id).run();
  await recordChanges(env, row.shop_id, actor, [{ layer: "assets", action: "update", path: `/assets/${row.id}`, before, after: body }]);
  return assetJson({ ...row, meta: JSON.stringify(meta) });
}

/** この写真を、何かが指しているか（C4）。公開した版・戻す前の下書き・今の下書き */
export async function assetReferences(env: Env, shopId: string, id: string): Promise<string[]> {
  const refs: string[] = [];
  const v = await env.DB.prepare("SELECT number FROM version_assets WHERE shop_id = ? AND asset_id = ?").bind(shopId, id).all<{ number: number }>();
  for (const r of v.results) refs.push(`version:${r.number}`);
  const b = await env.DB.prepare("SELECT ba.backup_id FROM backup_assets ba JOIN draft_backups d ON d.id = ba.backup_id WHERE d.shop_id = ? AND ba.asset_id = ?")
    .bind(shopId, id)
    .all<{ backup_id: string }>();
  for (const r of b.results) refs.push(`backup:${r.backup_id}`);
  const d = await env.DB.prepare("SELECT kind, body FROM drafts WHERE shop_id = ?").bind(shopId).all<{ kind: string; body: string }>();
  for (const r of d.results) if (collectAssetIds(JSON.parse(r.body)).has(id)) refs.push(`draft:${r.kind}`);
  return refs;
}

/**
 * ゴミ箱に入れて 30 日たった写真を本当に消す。ただし何かが指している間は消さない（C4）。
 * 行は残して purged_at を付ける（ID を使い回さない）
 */
export async function purgeTrash(
  env: Env,
  now = new Date(),
): Promise<{ purged: string[]; kept: { id: string; refs: string[] }[]; failed: { id: string; error: string }[] }> {
  const limit = new Date(now.getTime() - TRASH_DAYS * 24 * 3600 * 1000).toISOString();
  const res = await env.DB.prepare("SELECT * FROM assets WHERE trashed_at IS NOT NULL AND trashed_at <= ? AND purged_at IS NULL").bind(limit).all<AssetRow>();
  const purged: string[] = [];
  const kept: { id: string; refs: string[] }[] = [];
  const failed: { id: string; error: string }[] = [];
  // 1 件ずつ。どれかで失敗しても（下書きが読めないなど）、その写真は消さずに残し、ほかは続ける（M1）
  for (const row of res.results) {
    try {
      const refs = await assetReferences(env, row.shop_id, row.id);
      if (refs.length) {
        kept.push({ id: row.id, refs });
        continue;
      }
      await env.BUCKET.delete(row.r2_key);
      await deleteVariants(env, row.id);
      await env.DB.prepare("UPDATE assets SET purged_at = ? WHERE id = ?").bind(nowIso(), row.id).run();
      await recordChanges(env, row.shop_id, SYSTEM, [{ layer: "assets", action: "purge", path: `/assets/${row.id}` }]);
      purged.push(row.id);
    } catch (e) {
      console.error(`[purge] ${row.shop_id}/${row.id}`, e);
      failed.push({ id: row.id, error: String(e).slice(0, 200) });
    }
  }
  return { purged, kept, failed };
}
