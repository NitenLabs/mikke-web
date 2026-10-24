import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

/** API のエラーは {error: 種類, message: 日本語の説明, ...ほか} で返す */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const bad = (code: string, message: string, extra?: Record<string, unknown>) => new ApiError(400, code, message, extra);
export const notFound = (message = "見つかりません") => new ApiError(404, "not_found", message);

export function errorResponse(err: unknown, c: Context): Response {
  if (err instanceof ApiError) {
    return c.json({ error: err.code, message: err.message, ...err.extra }, err.status as 400, err.headers);
  }
  if (err instanceof HTTPException) {
    const status = err.status;
    const code = status === 413 ? "too_large" : "http_error";
    return c.json({ error: code, message: err.message || "要求を受け付けられません" }, status);
  }
  console.error("unhandled", err);
  return c.json({ error: "internal", message: "サーバーで問題が起きました" }, 500);
}

/** JSON の本文を読む。Content-Type が JSON でないもの・大きすぎるもの・壊れたものは断る */
export async function readJson<T = unknown>(c: Context, maxBytes = 256 * 1024): Promise<T> {
  const ct = (c.req.header("content-type") || "").toLowerCase();
  if (!ct.startsWith("application/json")) throw new ApiError(415, "unsupported_media_type", "Content-Type は application/json にしてください");
  const declared = Number(c.req.header("content-length") || "0");
  if (declared > maxBytes) throw new ApiError(413, "too_large", `本文が大きすぎます（${maxBytes} バイトまで）`);
  const buf = await readLimited(c.req.raw, maxBytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buf);
  } catch {
    throw bad("invalid_json", "本文が UTF-8 ではありません");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw bad("invalid_json", "本文の JSON が壊れています");
  }
}

/** 本文を上限つきで読む（Content-Length がなくても上限で止める） */
export async function readLimited(req: Request, maxBytes: number): Promise<Uint8Array> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, "too_large", `本文が大きすぎます（${maxBytes} バイトまで）`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

export const nowIso = () => new Date().toISOString();

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
