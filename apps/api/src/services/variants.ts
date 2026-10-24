import type { Env } from "../env";
import { ApiError, bad, nowIso, readLimited } from "../lib/http";
import { sniffImage } from "../lib/image";

/**
 * C3：公開ページの写真の大きさ違い。Workers の中では画像を縮められないので、
 * 編集画面（ブラウザ）が幅 640・1280・2400（元が小さければ元の幅まで）の WebP と JPEG を作って、写真と一緒に送る。
 * サーバーは、それぞれを写真と同じ検査（M5）にかけて R2 に置き、公開ページの /media/<ID>/<幅>.<webp|jpg> で配る。
 */
export const VARIANT_STEPS = [640, 1280, 2400] as const;
export const VARIANT_FORMATS = { webp: "image/webp", jpg: "image/jpeg" } as const;
export type VariantFormat = keyof typeof VARIANT_FORMATS;
/** 大きさ違い 1 枚の上限（写真と同じ） */
export const MAX_VARIANT_BYTES = 10 * 1024 * 1024;
/** 写真と大きさ違いをまとめて送るときの、本文全体の上限 */
export const MAX_FORM_BYTES = 48 * 1024 * 1024;

/** 写真の幅 W に対して作る大きさ違いの幅。640・1280・2400 のうち W より小さいもの＋W（W は 2400 以下） */
export function variantWidths(w: number): number[] {
  return [...VARIANT_STEPS.filter((s) => s < w), Math.min(w, VARIANT_STEPS[VARIANT_STEPS.length - 1])];
}

/** 幅 vw のときの高さ（元の縦横の比のまま。四捨五入で ±1 は許す） */
export const variantHeight = (w: number, h: number, vw: number) => Math.round((h * vw) / w);

export const variantKey = (shopId: string, assetId: string, width: number, format: VariantFormat) => `assets/${shopId}/${assetId}/${width}.${format}`;

export const VARIANT_NAME_RE = /^([1-9][0-9]{0,3})\.(webp|jpg)$/;

export interface VariantPart {
  name: string;
  type: string;
  bytes: Uint8Array;
  /** multipart の部分のファイル名（写真の file のときだけ使う） */
  fileName?: string;
}

export interface CheckedVariant {
  width: number;
  height: number;
  format: VariantFormat;
  bytes: Uint8Array;
}

export interface VariantRow {
  asset_id: string;
  shop_id: string;
  width: number;
  format: VariantFormat;
  height: number;
  bytes: number;
  r2_key: string;
  created_at: string;
}

/** multipart/form-data の本文を上限つきで読む。file（写真）とそれ以外（大きさ違い）に分ける */
export async function readImageForm(req: Request): Promise<{ file: VariantPart | null; variants: VariantPart[] }> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > MAX_FORM_BYTES) throw new ApiError(413, "too_large", `写真と大きさ違いは合わせて ${MAX_FORM_BYTES / 1024 / 1024}MB まで`);
  const buf = await readLimited(req, MAX_FORM_BYTES);
  let fd: FormData;
  try {
    fd = await new Response(buf, { headers: { "content-type": req.headers.get("content-type") || "" } }).formData();
  } catch {
    throw bad("invalid_form", "本文（multipart/form-data）が読めません");
  }
  let file: VariantPart | null = null;
  const variants: VariantPart[] = [];
  const seen = new Set<string>();
  for (const [name, value] of fd.entries()) {
    if (typeof value === "string") throw bad("invalid_variant", `ファイルでない項目は送れません：${name.slice(0, 40)}`);
    if (seen.has(name)) throw bad("invalid_variant", `同じ名前が 2 つあります：${name.slice(0, 40)}`);
    seen.add(name);
    if (value.size > MAX_VARIANT_BYTES) throw new ApiError(413, "too_large", `${name.slice(0, 40)} は ${MAX_VARIANT_BYTES / 1024 / 1024}MB まで`);
    const part: VariantPart = { name, type: value.type, bytes: new Uint8Array(await value.arrayBuffer()), fileName: value.name };
    if (name === "file") file = part;
    else variants.push(part);
  }
  return { file, variants };
}

/**
 * 大きさ違いの検査。名前（<幅>.<webp|jpg>）・決まった幅・種類・縦横（元の比のまま）・撮影データ・終わりの後ろのデータ（M5）。
 * そろい方：JPEG は全部の幅が要る。WebP は全部の幅か、まったくなし（WebP を作れないブラウザのため）。
 */
export function checkVariants(parts: VariantPart[], w: number, h: number, { required }: { required: boolean }): CheckedVariant[] {
  const widths = variantWidths(w);
  const out: CheckedVariant[] = [];
  for (const p of parts) {
    const m = VARIANT_NAME_RE.exec(p.name);
    const vw = m ? Number(m[1]) : NaN;
    if (!m || !widths.includes(vw))
      throw bad("invalid_variant", `大きさ違いの名前は ${widths.map((x) => `${x}.webp・${x}.jpg`).join("・")} だけです：${p.name.slice(0, 40)}`, { variant: p.name.slice(0, 40), widths });
    const format = m[2] as VariantFormat;
    const mime = VARIANT_FORMATS[format];
    if (!p.bytes.byteLength) throw bad("empty_file", `${p.name} が空です`, { variant: p.name });
    const declared = p.type.split(";")[0].trim().toLowerCase();
    const info = sniffImage(p.bytes);
    if (!info) throw new ApiError(415, "not_an_image", `${p.name} が写真として読めません`, { variant: p.name });
    if (info.mime !== mime || (declared && declared !== "application/octet-stream" && declared !== mime))
      throw new ApiError(415, "type_mismatch", `${p.name} の中身は ${info.mime} です（${mime} にしてください）`, { variant: p.name });
    const vh = variantHeight(w, h, vw);
    if (info.width !== vw || Math.abs(info.height - vh) > 1)
      throw bad("variant_size_mismatch", `${p.name} は ${vw}×${vh} にしてください（今 ${info.width}×${info.height}）`, { variant: p.name, expected: { width: vw, height: vh } });
    if (info.metadata.length)
      throw bad("metadata_present", `${p.name} に撮影データ（${info.metadata.join("・")}）が残っています。消してから送ってください`, { variant: p.name, metadata: info.metadata });
    if (info.trailing) throw bad("trailing_data", `${p.name} の画像の終わりの後ろに、ほかのデータが付いています`, { variant: p.name });
    out.push({ width: vw, height: info.height, format, bytes: p.bytes });
  }
  if (!out.length && !required) return out;
  const have = new Set(out.map((v) => `${v.width}.${v.format}`));
  const missingJpg = widths.filter((x) => !have.has(`${x}.jpg`)).map((x) => `${x}.jpg`);
  const webpCount = out.filter((v) => v.format === "webp").length;
  const missingWebp = webpCount ? widths.filter((x) => !have.has(`${x}.webp`)).map((x) => `${x}.webp`) : [];
  const missing = [...missingJpg, ...missingWebp];
  if (missing.length)
    throw bad("incomplete_variants", `大きさ違いが足りません：${missing.join("・")}（JPEG は全部の幅、WebP は全部の幅かなし）`, { missing, widths });
  return out;
}

export const variantBytes = (vs: CheckedVariant[]) => vs.reduce((s, v) => s + v.bytes.byteLength, 0);

/** R2 に置く。D1 の行を作る文を返す（写真の行と一緒に 1 回の batch で入れるため） */
export async function putVariants(env: Env, shopId: string, assetId: string, vs: CheckedVariant[], at = nowIso()): Promise<{ statements: D1PreparedStatement[]; keys: string[] }> {
  const keys: string[] = [];
  const statements: D1PreparedStatement[] = [];
  for (const v of vs) {
    const key = variantKey(shopId, assetId, v.width, v.format);
    await env.BUCKET.put(key, v.bytes, { httpMetadata: { contentType: VARIANT_FORMATS[v.format] } });
    keys.push(key);
    statements.push(
      env.DB.prepare("INSERT INTO asset_variants (asset_id, shop_id, width, format, height, bytes, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(
        assetId,
        shopId,
        v.width,
        v.format,
        v.height,
        v.bytes.byteLength,
        key,
        at,
      ),
    );
  }
  return { statements, keys };
}

export async function listVariants(env: Env, assetId: string): Promise<VariantRow[]> {
  return (await env.DB.prepare("SELECT * FROM asset_variants WHERE asset_id = ? ORDER BY width, format").bind(assetId).all<VariantRow>()).results;
}

export const variantJson = (r: VariantRow) => ({ width: r.width, height: r.height, format: r.format, mime: VARIANT_FORMATS[r.format], bytes: r.bytes, key: r.r2_key });

/** 写真を本当に消すとき、大きさ違いも消す（C4） */
export async function deleteVariants(env: Env, assetId: string): Promise<void> {
  const rows = await listVariants(env, assetId);
  if (rows.length) await env.BUCKET.delete(rows.map((r) => r.r2_key));
  await env.DB.prepare("DELETE FROM asset_variants WHERE asset_id = ?").bind(assetId).run();
}
