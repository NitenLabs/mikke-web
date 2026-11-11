import type { Env } from "../env";
import { ApiError } from "../lib/http";

/** LINE の userId の形（U＋16 進 32 桁） */
export const LINE_SUB_RE = /^U[0-9a-f]{32}$/;
export const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export interface LineProfile {
  sub: string;
  name: string | null;
}

const invalid = () => new ApiError(400, "invalid_line_token", "LINE の確認が取れませんでした。LINE からもう一度開いてください");

/**
 * LIFF の ID トークン（liff.getIDToken()）を LINE に確かめてもらう。
 * client_id を付けるので、LINE が aud（チャネル）と期限を確かめる。こちらでも aud・exp・sub を見る。
 */
export async function verifyLineIdToken(env: Env, idToken: unknown): Promise<LineProfile> {
  const channel = env.LINE_LOGIN_CHANNEL_ID?.trim();
  if (!channel) throw new ApiError(503, "line_not_configured", "LINE でのログインはまだ使えません。メールで入ってください");
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 4096) throw invalid();
  let res: Response;
  try {
    res = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channel }).toString(),
    });
  } catch (e) {
    console.error("[line] 確かめられませんでした", e);
    throw new ApiError(502, "line_unavailable", "LINE に確かめられませんでした。少し待ってからお試しください");
  }
  if (res.status >= 500) throw new ApiError(502, "line_unavailable", "LINE に確かめられませんでした。少し待ってからお試しください");
  if (!res.ok) throw invalid();
  const p = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!p || p.aud !== channel || typeof p.sub !== "string" || !LINE_SUB_RE.test(p.sub)) throw invalid();
  if (typeof p.exp !== "number" || p.exp * 1000 <= Date.now()) throw invalid();
  return { sub: p.sub, name: typeof p.name === "string" ? p.name.slice(0, 100) : null };
}
