import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { memoryOutbox } from "../src/services/mailer";
import { APP_ORIGIN, call, cookieFrom, createUser } from "./helpers";

async function requestMail(email: string) {
  const before = memoryOutbox.length;
  const r = await call("POST", "/api/auth/request", { json: { email } });
  return { r, mail: memoryOutbox.slice(before).find((m) => m.to === email.trim().toLowerCase()) };
}

describe("B1 ログイン（メールのコードとリンク）", () => {
  it("B1-1 コードで入れる。Cookie は HttpOnly・Secure・SameSite=Lax・__Host-", async () => {
    const u = await createUser("owner");
    const { r, mail } = await requestMail(u.email);
    expect(r.status).toBe(200);
    expect(mail!.code).toMatch(/^\d{6}$/);
    expect(mail!.link.startsWith(`${APP_ORIGIN}/login?t=`)).toBe(true);
    const v = await call("POST", "/api/auth/verify", { json: { email: u.email, code: mail!.code } });
    expect(v.status).toBe(200);
    const sc = v.headers.get("set-cookie")!;
    expect(sc).toMatch(/^__Host-mikke_sid=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\//);
    expect(sc).not.toMatch(/Domain=/i);
    const me = await call("GET", "/api/me", { cookie: cookieFrom(v) });
    expect(me.status).toBe(200);
    expect(((await me.json()) as any).user.email).toBe(u.email);
  });

  it("B1-2 リンクで入れる。同じリンクは 2 回目は使えない（コードも使えなくなる）", async () => {
    const u = await createUser("owner");
    const { mail } = await requestMail(u.email);
    const token = new URL(mail!.link).searchParams.get("t")!;
    const v1 = await call("POST", "/api/auth/verify", { json: { token } });
    expect(v1.status).toBe(200);
    const v2 = await call("POST", "/api/auth/verify", { json: { token } });
    expect(v2.status).toBe(400);
    const v3 = await call("POST", "/api/auth/verify", { json: { email: u.email, code: mail!.code } });
    expect(v3.status).toBe(400);
  });

  it("B1-3 コードは 1 回だけ", async () => {
    const u = await createUser("owner");
    const { mail } = await requestMail(u.email);
    expect((await call("POST", "/api/auth/verify", { json: { email: u.email, code: mail!.code } })).status).toBe(200);
    expect((await call("POST", "/api/auth/verify", { json: { email: u.email, code: mail!.code } })).status).toBe(400);
  });

  it("B1-4 15 分を過ぎたら使えない", async () => {
    const u = await createUser("owner");
    const { mail } = await requestMail(u.email);
    await env.DB.prepare("UPDATE login_requests SET expires_at = ? WHERE email = ?").bind(Date.now() - 1, u.email).run();
    expect((await call("POST", "/api/auth/verify", { json: { email: u.email, code: mail!.code } })).status).toBe(400);
    const token = new URL(mail!.link).searchParams.get("t")!;
    expect((await call("POST", "/api/auth/verify", { json: { token } })).status).toBe(400);
    const row = await env.DB.prepare("SELECT created_at, expires_at FROM login_requests WHERE email = ?").bind(u.email).first<any>();
    expect(row).toBeTruthy();
  });

  it("B1-5 有効期限は 15 分で作られる", async () => {
    const u = await createUser("owner");
    await requestMail(u.email);
    const row = await env.DB.prepare("SELECT created_at, expires_at FROM login_requests WHERE email = ?").bind(u.email).first<any>();
    expect(row.expires_at - row.created_at).toBe(15 * 60 * 1000);
  });

  it("B1-6 コードを 5 回まちがえたら、正しいコードでも入れない", async () => {
    const u = await createUser("owner");
    const { mail } = await requestMail(u.email);
    const wrong = mail!.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await call("POST", "/api/auth/verify", { json: { email: u.email, code: wrong } })).status).toBe(400);
    expect((await call("POST", "/api/auth/verify", { json: { email: u.email, code: mail!.code } })).status).toBe(400);
  });

  it("B1-7 同じアドレスで続けて頼むと 429（60 秒あける）。新しく頼むと前のコードは使えない", async () => {
    const u = await createUser("owner");
    const first = await requestMail(u.email);
    const again = await call("POST", "/api/auth/request", { json: { email: u.email } });
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("retry-after"))).toBeGreaterThan(0);
    // 60 秒たったことにする
    await env.DB.prepare("UPDATE login_requests SET created_at = created_at - 61000 WHERE email = ?").bind(u.email).run();
    const second = await requestMail(u.email);
    expect(second.r.status).toBe(200);
    expect((await call("POST", "/api/auth/verify", { json: { email: u.email, code: first.mail!.code } })).status).toBe(400);
    expect((await call("POST", "/api/auth/verify", { json: { email: u.email, code: second.mail!.code } })).status).toBe(200);
  });

  it("B1-8 1 時間に 5 回まで", async () => {
    const u = await createUser("owner");
    for (let i = 0; i < 5; i++) {
      expect((await call("POST", "/api/auth/request", { json: { email: u.email } })).status).toBe(200);
      await env.DB.prepare("UPDATE login_requests SET created_at = created_at - 61000 WHERE email = ?").bind(u.email).run();
    }
    const r = await call("POST", "/api/auth/request", { json: { email: u.email } });
    expect(r.status).toBe(429);
    expect(((await r.json()) as any).error).toBe("too_many");
  });

  it("B1-9 登録のないアドレスでも同じ答え。メールは送らない", async () => {
    const email = `nobody${Date.now()}@example.com`;
    const { r, mail } = await requestMail(email);
    expect(r.status).toBe(200);
    expect(mail).toBeUndefined();
  });

  it("B1-10 大文字・空白のまじったアドレスも同じ人", async () => {
    const u = await createUser("owner");
    const { mail } = await requestMail(`  ${u.email.toUpperCase()} `);
    expect(mail).toBeTruthy();
    expect((await call("POST", "/api/auth/verify", { json: { email: u.email.toUpperCase(), code: mail!.code } })).status).toBe(200);
  });

  it("B1-11 ログアウトしたら、その Cookie は使えない", async () => {
    const u = await createUser("owner");
    const { mail } = await requestMail(u.email);
    const cookie = cookieFrom(await call("POST", "/api/auth/verify", { json: { email: u.email, code: mail!.code } }));
    expect((await call("POST", "/api/auth/logout", { cookie })).status).toBe(200);
    expect((await call("GET", "/api/me", { cookie })).status).toBe(401);
  });

  it("B1-12 ログインしていなければ 401。でたらめな Cookie も 401", async () => {
    expect((await call("GET", "/api/me")).status).toBe(401);
    expect((await call("GET", "/api/me", { cookie: "__Host-mikke_sid=abc" })).status).toBe(401);
  });

  it("B1-13 セッションの期限が切れたら 401", async () => {
    const u = await createUser("owner");
    const { mail } = await requestMail(u.email);
    const cookie = cookieFrom(await call("POST", "/api/auth/verify", { json: { email: u.email, code: mail!.code } }));
    await env.DB.prepare("UPDATE sessions SET expires_at = 1 WHERE user_id = ?").bind(u.id).run();
    expect((await call("GET", "/api/me", { cookie })).status).toBe(401);
  });

  it("B1-14 使えなくしたユーザーは入れない", async () => {
    const u = await createUser("owner");
    const { mail } = await requestMail(u.email);
    await env.DB.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").bind(new Date().toISOString(), u.id).run();
    expect((await call("POST", "/api/auth/verify", { json: { email: u.email, code: mail!.code } })).status).toBe(400);
  });

  it("B1-15 データベースにはコードも合言葉もそのままは残さない", async () => {
    const u = await createUser("owner");
    const { mail } = await requestMail(u.email);
    const token = new URL(mail!.link).searchParams.get("t")!;
    const row = await env.DB.prepare("SELECT code_hash, token_hash FROM login_requests WHERE email = ?").bind(u.email).first<any>();
    expect(row.code_hash).not.toContain(mail!.code);
    expect(row.token_hash).not.toBe(token);
  });
});

describe("CSRF・CORS（書き込みは編集画面のオリジンからだけ）", () => {
  it("B1-16 Origin のない書き込みは 403", async () => {
    const r = await call("POST", "/api/auth/request", { json: { email: "a@example.com" }, origin: null });
    expect(r.status).toBe(403);
  });

  it("B1-17 公開ページ（お店のサブドメイン）や他のサイトからの書き込みは 403", async () => {
    for (const origin of ["https://evil.example", "https://ashiyado.mikke.test", "http://app.mikke-web.test"]) {
      const r = await call("POST", "/api/auth/request", { json: { email: "a@example.com" }, origin });
      expect(r.status).toBe(403);
    }
  });

  it("B1-18 JSON でない本文は 415", async () => {
    const r = await call("POST", "/api/auth/request", { body: "email=a@example.com", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(r.status).toBe(415);
  });

  it("B1-19 CORS の下見：許したオリジンだけ通す", async () => {
    const ok = await call("OPTIONS", "/api/me", { headers: { origin: APP_ORIGIN, "access-control-request-method": "PUT" } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(APP_ORIGIN);
    expect(ok.headers.get("access-control-allow-credentials")).toBe("true");
    const ng = await call("OPTIONS", "/api/me", { headers: { origin: "https://evil.example", "access-control-request-method": "PUT" } });
    expect(ng.status).toBe(403);
    expect(ng.headers.get("access-control-allow-origin")).toBeNull();
  });
});
