import { createExecutionContext, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleFetch } from "../src/app";
import { configProblems, siteOf } from "../src/services/config";

const base = { ...env, PUBLIC_DOMAIN: "mikke.site", APP_ORIGINS: "https://app.mikke-web.jp", COOKIE_SECURE: "true", MAILER: "memory", AUTH_SECRET: "x".repeat(40) } as any;

describe("L5・L6 危ない設定では動かない", () => {
  it("L5-1 公開ページとアプリが同じ親ドメインなら断る（local は除く）", () => {
    expect(configProblems(base)).toEqual([]);
    expect(configProblems({ ...base, APP_ORIGINS: "https://app.mikke.site" }).join()).toContain("別の親ドメイン");
    expect(configProblems({ ...base, APP_ORIGINS: "https://mikke.site" }).join()).toContain("別の親ドメイン");
    expect(configProblems({ ...base, PUBLIC_DOMAIN: "staging.mikke.site", APP_ORIGINS: "https://app.mikke.site" }).join()).toContain("別の親ドメイン");
    expect(configProblems({ ...base, PUBLIC_DOMAIN: "mikke.co.jp", APP_ORIGINS: "https://app.other.co.jp" })).toEqual([]);
    expect(configProblems({ ...base, PUBLIC_DOMAIN: "mikke.co.jp", APP_ORIGINS: "https://app.mikke.co.jp" }).join()).toContain("別の親ドメイン");
    expect(configProblems({ ...base, PUBLIC_DOMAIN: "localhost", APP_ORIGINS: "http://localhost:8787", COOKIE_SECURE: "false", MAILER: "log" })).toEqual([]);
    expect(siteOf("a.b.example.com")).toBe("example.com");
  });

  it("L6-1 本番（COOKIE_SECURE=true）で MAILER=log なら断る。まだない MAILER も断る", () => {
    expect(configProblems({ ...base, MAILER: "log" }).join()).toContain("MAILER=log");
    expect(configProblems({ ...base, MAILER: "resend" }).join()).toContain("まだ作っていません");
    expect(configProblems({ ...base, APP_ORIGINS: "http://app.mikke-web.jp" }).join()).toContain("https");
    expect(configProblems({ ...base, AUTH_SECRET: "short" }).join()).toContain("AUTH_SECRET");
  });

  it("L5-2 危ない設定のときは、どの要求にも 500 で答え、何もしない", async () => {
    const badEnv = { ...env, APP_ORIGINS: "https://app.mikke.test" } as any;
    const r = await handleFetch(new Request("https://api.mikke-web.test/api/health", { headers: { host: "api.mikke-web.test" } }), badEnv, createExecutionContext());
    expect(r.status).toBe(500);
    const logEnv = { ...env, MAILER: "log" } as any;
    expect((await handleFetch(new Request("https://x.mikke.test/", { headers: { host: "x.mikke.test" } }), logEnv, createExecutionContext())).status).toBe(500);
  });
});
