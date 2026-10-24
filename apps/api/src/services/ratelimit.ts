import type { Context } from "hono";
import type { AppEnv } from "../env";
import { ApiError } from "../lib/http";

/**
 * ログインの手前の、IP ごとの回数の制限（Workers の Rate Limiting の binding `LOGIN_IP_LIMITER`）。
 * 申し込み（request）と確かめ（verify）は別に数える。数えるのは Cloudflare が付ける CF-Connecting-IP。
 * binding がない（local・試験）・IP が分からない（wrangler dev）ときは数えない。制限の仕組みが失敗したときも止めない（ログに出す）。
 * 回数と間（例 1 分に 10 回）は wrangler.toml の [[env.*.ratelimits]] で決める（README「本番に出すとき」）。
 */
export const IP_LIMIT_RETRY_SEC = 60;

/** IPv4 はそのまま、IPv6 は /64（1 つの回線に配られる単位）にまとめる。読めないものは null */
export function ipKey(ip: string): string | null {
  const s = ip.trim().toLowerCase();
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) return v4[1].split(".").every((x) => Number(x) <= 255) ? v4[1] : null;
  if (!/^[0-9a-f:]+$/.test(s) || !s.includes(":")) return null;
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

export async function limitByIp(c: Context<AppEnv>, kind: "request" | "verify"): Promise<void> {
  const limiter = c.env.LOGIN_IP_LIMITER;
  if (!limiter) return;
  const raw = c.req.header("cf-connecting-ip");
  const ip = raw ? ipKey(raw) : null;
  if (!ip) return;
  let success = true;
  try {
    ({ success } = await limiter.limit({ key: `${kind}:${ip}` }));
  } catch (e) {
    // 制限の仕組みが止まっても、ログインは止めない（アドレスごとの制限は D1 で効いている）
    console.error("[ratelimit] 数えられませんでした", e);
    return;
  }
  if (!success)
    throw new ApiError(429, "too_many_ip", "続けて何度も試されたので、少し止めています。1 分ほど待ってからお試しください", { retryAfter: IP_LIMIT_RETRY_SEC }, { "Retry-After": String(IP_LIMIT_RETRY_SEC) });
}
