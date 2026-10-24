import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/app";
import { ipKey } from "../src/services/ratelimit";
import { memoryOutbox } from "../src/services/mailer";
import { API_HOST, APP_ORIGIN, call, createUser } from "./helpers";

/** Workers の Rate Limiting の binding の代わり：キーごとに limit 回まで通す */
function fakeLimiter(limit: number) {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    counts,
    binding: {
      async limit({ key }: { key: string }) {
        keys.push(key);
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        return { success: n <= limit };
      },
    },
  };
}

async function post(e: any, path: string, json: unknown, ip?: string) {
  const headers: Record<string, string> = { host: API_HOST, origin: APP_ORIGIN, "content-type": "application/json" };
  if (ip) headers["cf-connecting-ip"] = ip;
  const ctx = createExecutionContext();
  const r = await handleFetch(new Request(`https://${API_HOST}${path}`, { method: "POST", headers, body: JSON.stringify(json) }), e, ctx);
  await waitOnExecutionContext(ctx);
  return r;
}

afterEach(() => vi.restoreAllMocks());

describe("B1 ログインの手前の、IP ごとの回数の制限（Workers の Rate Limiting）", () => {
  it("B1-30 同じ IP から続けて申し込むと 429 too_many_ip（Retry-After）。申し込みの行もメールも作らない。ほかの IP は通る", async () => {
    const lim = fakeLimiter(3);
    const e = { ...env, LOGIN_IP_LIMITER: lim.binding } as any;
    const users = await Promise.all([1, 2, 3, 4, 5].map(() => createUser("owner")));
    for (let i = 0; i < 3; i++) expect((await post(e, "/api/auth/request", { email: users[i].email }, "203.0.113.7")).status).toBe(200);
    const before = memoryOutbox.length;
    const r = await post(e, "/api/auth/request", { email: users[3].email }, "203.0.113.7");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
    expect(await r.json()).toMatchObject({ error: "too_many_ip", retryAfter: 60 });
    expect(memoryOutbox.length).toBe(before);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM login_requests WHERE email = ?").bind(users[3].email).first("n")).toBe(0);
    expect((await post(e, "/api/auth/request", { email: users[4].email }, "198.51.100.1")).status).toBe(200);
    expect(lim.keys).toContain("request:203.0.113.7");
  });

  it("B1-31 確かめる（コード・リンク）も IP ごとに数える（申し込みとは別の数）", async () => {
    const lim = fakeLimiter(2);
    const e = { ...env, LOGIN_IP_LIMITER: lim.binding } as any;
    const ip = "192.0.2.44";
    for (let i = 0; i < 2; i++) expect((await post(e, "/api/auth/verify", { token: `nope${i}` }, ip)).status).toBe(400);
    const r = await post(e, "/api/auth/verify", { email: "x@example.com", code: "123456" }, ip);
    expect(r.status).toBe(429);
    expect(((await r.json()) as any).error).toBe("too_many_ip");
    // 申し込みは別に数える
    const u = await createUser("owner");
    expect((await post(e, "/api/auth/request", { email: u.email }, ip)).status).toBe(200);
    expect(lim.counts.get(`verify:${ip}`)).toBe(3);
    expect(lim.counts.get(`request:${ip}`)).toBe(1);
  });

  it("B1-32 IPv6 は /64 ごとに数える（同じ回線の中でアドレスを変えてもすり抜けない）", () => {
    expect(ipKey("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:0db8:0001:0002:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
    expect(ipKey("203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("not an ip")).toBeNull();
  });

  it("B1-33 binding がない（local・試験）・IP が分からない・制限の仕組みが失敗したときは止めない", async () => {
    const u = await createUser("owner");
    // binding なし（今の試験の設定）
    expect(env.LOGIN_IP_LIMITER).toBeUndefined();
    expect((await call("POST", "/api/auth/request", { json: { email: u.email }, headers: { "cf-connecting-ip": "203.0.113.9" } })).status).toBe(200);
    // IP なし（wrangler dev）では数えない
    const lim = fakeLimiter(0);
    const e = { ...env, LOGIN_IP_LIMITER: lim.binding } as any;
    expect((await post(e, "/api/auth/verify", { token: "nope" })).status).toBe(400);
    expect(lim.keys).toHaveLength(0);
    // 失敗したら通す（ログに出す）
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...env, LOGIN_IP_LIMITER: { limit: async () => { throw new Error("limiter down"); } } } as any;
    expect((await post(broken, "/api/auth/verify", { token: "nope" }, "203.0.113.10")).status).toBe(400);
    expect(errors).toHaveBeenCalled();
  });
});
