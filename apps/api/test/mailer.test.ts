import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFetch } from "../src/app";
import { configProblems } from "../src/services/config";
import { loginMailText, mailerFor, MailError, ResendMailer, type LoginMail } from "../src/services/mailer";
import { API_HOST, APP_ORIGIN, createUser } from "./helpers";

const KEY = "re_test_0123456789abcdef";
const FROM = "芦屋みっけ <login@mail.mikke-web.test>";
const mail: LoginMail = { to: "owner@ashiyado.example", code: "042917", link: `${APP_ORIGIN}/login#t=abcDEF_123-xyz`, expiresMinutes: 15 };

type Call = { url: string; init: RequestInit };
function stubFetch(...answers: (Response | Error)[]) {
  const calls: Call[] = [];
  const f = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return a.clone();
  };
  return { f: f as typeof fetch, calls };
}
const ok = () => new Response(JSON.stringify({ id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("B1 本物のメール送信（Resend）", () => {
  it("B1-20 Resend の API に、宛先・送り元・件名・本文（コードとリンク）を送る。API キーは Authorization だけに", async () => {
    const { f, calls } = stubFetch(ok());
    await new ResendMailer({ apiKey: KEY, from: FROM, fetch: f }).sendLogin(mail);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const h = new Headers(init.headers);
    expect(h.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("idempotency-key")).toMatch(/^mikke-login-[0-9a-f-]{36}$/);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ from: FROM, to: ["owner@ashiyado.example"], subject: "芦屋みっけ ログインのコード" });
    expect(body.text).toContain("042917");
    expect(body.text).toContain(mail.link);
    expect(String(init.body)).not.toContain(KEY);
  });

  it("B1-21 文面は日本語で短く：コード・リンク・15 分で切れる・心当たりが無ければ無視してよい。件名にコードを入れない", () => {
    const { subject, text } = loginMailText(mail);
    expect(subject).toBe("芦屋みっけ ログインのコード");
    expect(subject).not.toContain(mail.code);
    expect(text).toContain("コード：042917");
    expect(text).toContain(mail.link);
    expect(text).toContain("15分");
    expect(text).toMatch(/心当たりが無ければ.*無視/);
    expect(text.length).toBeLessThan(400);
    expect(text).not.toMatch(/<[a-z]/i); // HTML にしない
    // リンクは 1 行に（メールの画面で途中で切れて押せなくならないように）
    expect(text.split("\n")).toContain(mail.link);
  });

  it("B1-22 送れなかったとき：4xx はやり直さずに MailError（コードとキーは入れない）。5xx・429・つながらないは 1 回だけやり直す", async () => {
    const bad = stubFetch(new Response(JSON.stringify({ name: "validation_error", message: "Invalid `from` field" }), { status: 422 }));
    const e = await new ResendMailer({ apiKey: KEY, from: FROM, fetch: bad.f, retryDelayMs: 0 }).sendLogin(mail).catch((x) => x);
    expect(e).toBeInstanceOf(MailError);
    expect(e.status).toBe(422);
    expect(e.retryable).toBe(false);
    expect(String(e.message)).toContain("Invalid `from` field");
    expect(String(e.message)).not.toContain(mail.code);
    expect(String(e.message)).not.toContain(KEY);
    expect(bad.calls).toHaveLength(1);

    const flaky = stubFetch(new Response("oops", { status: 503 }), ok());
    await new ResendMailer({ apiKey: KEY, from: FROM, fetch: flaky.f, retryDelayMs: 0 }).sendLogin(mail);
    expect(flaky.calls).toHaveLength(2);
    // やり直しでも同じ Idempotency-Key（2 通届かないように）
    expect(new Headers(flaky.calls[0].init.headers).get("idempotency-key")).toBe(new Headers(flaky.calls[1].init.headers).get("idempotency-key"));

    const down = stubFetch(new TypeError("network"), new Response("{}", { status: 429 }));
    const e2 = await new ResendMailer({ apiKey: KEY, from: FROM, fetch: down.f, retryDelayMs: 0 }).sendLogin(mail).catch((x) => x);
    expect(e2).toBeInstanceOf(MailError);
    expect(e2.status).toBe(429);
    expect(down.calls).toHaveLength(2);
  });

  it("B1-23 MAILER=resend の設定：RESEND_API_KEY と MAIL_FROM がなければ起動しない", () => {
    const base = { ...env, PUBLIC_DOMAIN: "mikke.site", APP_ORIGINS: "https://app.mikke-web.jp", COOKIE_SECURE: "true", AUTH_SECRET: "x".repeat(40) } as any;
    expect(configProblems({ ...base, MAILER: "resend", RESEND_API_KEY: KEY, MAIL_FROM: FROM })).toEqual([]);
    expect(configProblems({ ...base, MAILER: "resend", MAIL_FROM: FROM }).join()).toContain("RESEND_API_KEY");
    expect(configProblems({ ...base, MAILER: "resend", RESEND_API_KEY: KEY }).join()).toContain("MAIL_FROM");
    expect(configProblems({ ...base, MAILER: "resend", RESEND_API_KEY: KEY, MAIL_FROM: "nobody" }).join()).toContain("MAIL_FROM");
    expect(configProblems({ ...base, MAILER: "smtp" }).join()).toContain("まだ作っていません");
    expect(mailerFor({ ...base, MAILER: "resend", RESEND_API_KEY: KEY, MAIL_FROM: FROM })).toBeInstanceOf(ResendMailer);
  });

  it("B1-24 ログインの申し込みで Resend に送る。送れなくても答えは同じ（L3）", async () => {
    const u = await createUser("owner");
    const resendEnv = { ...env, MAILER: "resend", RESEND_API_KEY: KEY, MAIL_FROM: FROM } as any;
    const req = (email: string) =>
      new Request(`https://${API_HOST}/api/auth/request`, {
        method: "POST",
        headers: { host: API_HOST, origin: APP_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    const sent: any[] = [];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      sent.push({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) });
      return new Response("{}", { status: 500 });
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = createExecutionContext();
    const r = await handleFetch(req(u.email), resendEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, expiresInMinutes: 15 });
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent[0]).toMatchObject({ url: "https://api.resend.com/emails", body: { to: [u.email], subject: "芦屋みっけ ログインのコード" } });
    expect(sent[0].body.text).toMatch(/コード：\d{6}/);
    expect(errors).toHaveBeenCalled();
    // ログにはコードを出さない
    const code = /コード：(\d{6})/.exec(sent[0].body.text)![1];
    for (const c of errors.mock.calls) expect(c.map(String).join(" ")).not.toContain(code);
    spy.mockRestore();
  });
});
