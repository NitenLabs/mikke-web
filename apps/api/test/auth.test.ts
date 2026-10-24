import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { memoryOutbox, setMailer } from "../src/services/mailer";
import { APP_ORIGIN, call, cookieFrom, createUser, fakeJpeg, requestLogin, tokenOf, world } from "./helpers";

const verifyCode = (email: string, code: string, browser?: string) => call("POST", "/api/auth/verify", { json: { email, code }, cookie: browser });
const verifyToken = (token: string, cookie?: string) => call("POST", "/api/auth/verify", { json: { token }, cookie });
/** 前の申し込みを 61 秒前にずらす（60 秒あける決まりを越えるため） */
const age = (email: string, ms = 61_000) => env.DB.prepare("UPDATE login_requests SET created_at = created_at - ? WHERE email = ?").bind(ms, email).run();

afterEach(() => setMailer(null));

describe("B1 ログイン（メールのコードとリンク）", () => {
  it("B1-1 コードで入れる。Cookie は HttpOnly・Secure・SameSite=Lax・__Host-", async () => {
    const u = await createUser("owner");
    const { r, mail, browser } = await requestLogin(u.email);
    expect(r.status).toBe(200);
    expect(mail!.code).toMatch(/^\d{6}$/);
    expect(mail!.link.startsWith(`${APP_ORIGIN}/login#t=`)).toBe(true); // L8
    const lgn = r.headers.get("set-cookie")!;
    expect(lgn).toMatch(/^__Host-mikke_lgn=/);
    expect(lgn).toMatch(/HttpOnly/i);
    expect(lgn).toMatch(/Secure/i);
    const v = await verifyCode(u.email, mail!.code, browser);
    expect(v.status).toBe(200);
    const sc = v.headers.getSetCookie();
    const sid = sc.find((s) => s.startsWith("__Host-mikke_sid="))!;
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/Secure/i);
    expect(sid).toMatch(/SameSite=Lax/i);
    expect(sid).toMatch(/Path=\//);
    expect(sid).not.toMatch(/Domain=/i);
    // 申し込みの Cookie は消す
    expect(sc.find((s) => s.startsWith("__Host-mikke_lgn="))).toMatch(/Max-Age=0/);
    const me = await call("GET", "/api/me", { cookie: sid.split(";")[0] });
    expect(me.status).toBe(200);
    expect(((await me.json()) as any).user.email).toBe(u.email);
  });

  it("B1-2 リンク（#t=）で入れる。同じリンクは 2 回目は使えない（コードも使えなくなる）", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    const token = tokenOf(mail!.link);
    expect((await verifyToken(token)).status).toBe(200); // 別の端末（Cookie なし）で開いてもよい
    expect((await verifyToken(token)).status).toBe(400);
    expect((await verifyCode(u.email, mail!.code, browser)).status).toBe(400);
  });

  it("B1-3 コードは 1 回だけ", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    expect((await verifyCode(u.email, mail!.code, browser)).status).toBe(200);
    expect((await verifyCode(u.email, mail!.code, browser)).status).toBe(400);
  });

  it("B1-4 15 分を過ぎたら使えない", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    await env.DB.prepare("UPDATE login_requests SET expires_at = ? WHERE email = ?").bind(Date.now() - 1, u.email).run();
    expect((await verifyCode(u.email, mail!.code, browser)).status).toBe(400);
    expect((await verifyToken(tokenOf(mail!.link))).status).toBe(400);
  });

  it("B1-5 有効期限は 15 分で作られる", async () => {
    const u = await createUser("owner");
    await requestLogin(u.email);
    const row = await env.DB.prepare("SELECT created_at, expires_at FROM login_requests WHERE email = ?").bind(u.email).first<any>();
    expect(row.expires_at - row.created_at).toBe(15 * 60 * 1000);
  });

  it("B1-6 コードを 5 回まちがえたら、正しいコードでも入れない", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    const wrong = mail!.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await verifyCode(u.email, wrong, browser)).status).toBe(400);
    expect((await verifyCode(u.email, mail!.code, browser)).status).toBe(400);
  });

  it("B1-7 同じアドレスで続けて頼むと 429（60 秒あける）。同じブラウザで頼み直すと前のコードは使えない", async () => {
    const u = await createUser("owner");
    const first = await requestLogin(u.email);
    const again = await call("POST", "/api/auth/request", { json: { email: u.email }, cookie: first.browser });
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("retry-after"))).toBeGreaterThan(0);
    await age(u.email);
    const second = await requestLogin(u.email, first.browser);
    expect(second.r.status).toBe(200);
    expect(second.browser).toBe(first.browser); // 同じブラウザの印を使い回す
    expect((await verifyCode(u.email, first.mail!.code, first.browser)).status).toBe(400);
    expect((await verifyCode(u.email, second.mail!.code, first.browser)).status).toBe(200);
  });

  it("B1-8 1 時間に 5 回まで", async () => {
    const u = await createUser("owner");
    for (let i = 0; i < 5; i++) {
      expect((await call("POST", "/api/auth/request", { json: { email: u.email } })).status).toBe(200);
      await age(u.email);
    }
    const r = await call("POST", "/api/auth/request", { json: { email: u.email } });
    expect(r.status).toBe(429);
    expect(((await r.json()) as any).error).toBe("too_many");
  });

  it("B1-9 登録のないアドレスでも同じ答え。メールは送らない", async () => {
    const email = `nobody${Date.now()}@example.com`;
    const { r, mail } = await requestLogin(email);
    expect(r.status).toBe(200);
    expect(mail).toBeUndefined();
    expect(r.headers.get("set-cookie")).toMatch(/__Host-mikke_lgn=/); // 答えの形も同じ
  });

  it("B1-10 大文字・空白のまじったアドレスも同じ人", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(`  ${u.email.toUpperCase()} `);
    expect(mail).toBeTruthy();
    expect((await verifyCode(u.email.toUpperCase(), mail!.code, browser)).status).toBe(200);
  });

  it("B1-11 ログアウトしたら、その Cookie は使えない。Cookie も消すよう返す", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    const cookie = cookieFrom(await verifyCode(u.email, mail!.code, browser));
    const out = await call("POST", "/api/auth/logout", { cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/__Host-mikke_sid=;.*Max-Age=0/);
    expect((await call("GET", "/api/me", { cookie })).status).toBe(401);
  });

  it("B1-12 ログインしていなければ 401。でたらめな Cookie も 401", async () => {
    expect((await call("GET", "/api/me")).status).toBe(401);
    expect((await call("GET", "/api/me", { cookie: "__Host-mikke_sid=abc" })).status).toBe(401);
  });

  it("B1-13 セッションの期限が切れたら 401", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    const cookie = cookieFrom(await verifyCode(u.email, mail!.code, browser));
    await env.DB.prepare("UPDATE sessions SET expires_at = 1 WHERE user_id = ?").bind(u.id).run();
    expect((await call("GET", "/api/me", { cookie })).status).toBe(401);
  });

  it("B1-14 使えなくしたユーザーは入れない", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    await env.DB.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").bind(new Date().toISOString(), u.id).run();
    expect((await verifyCode(u.email, mail!.code, browser)).status).toBe(400);
  });

  it("B1-15 データベースにはコードも合言葉もブラウザの印もそのままは残さない", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    const row = await env.DB.prepare("SELECT code_hash, token_hash, browser_hash FROM login_requests WHERE email = ?").bind(u.email).first<any>();
    expect(row.code_hash).not.toContain(mail!.code);
    expect(row.token_hash).not.toBe(tokenOf(mail!.link));
    expect(row.browser_hash).not.toBe(browser.split("=")[1]);
  });

  it("B1-20 M2 同時に 10 本申し込んでも、通るのは 1 本・メールは 1 通", async () => {
    const u = await createUser("owner");
    const before = memoryOutbox.length;
    const rs = await Promise.all(Array.from({ length: 10 }, () => call("POST", "/api/auth/request", { json: { email: u.email } })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(9);
    expect(memoryOutbox.slice(before).filter((m) => m.to === u.email)).toHaveLength(1);
  });

  it("B1-21 M3 コードは申し込んだブラウザでだけ使える（Cookie がない・ほかのブラウザの Cookie では 400）", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    expect((await verifyCode(u.email, mail!.code)).status).toBe(400);
    const other = await requestLogin(`x${Date.now()}@example.com`);
    expect((await verifyCode(u.email, mail!.code, other.browser)).status).toBe(400);
    expect((await verifyCode(u.email, mail!.code, browser)).status).toBe(200);
  });

  it("B1-22 M3 ほかのブラウザの申し込みと失敗では、本人の申し込みは使えなくならない", async () => {
    const u = await createUser("owner");
    const me = await requestLogin(u.email);
    await age(u.email);
    const attacker = await requestLogin(u.email); // 別のブラウザから同じアドレスで
    expect(attacker.r.status).toBe(200);
    expect(attacker.browser).not.toBe(me.browser);
    const wrong = me.mail!.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 6; i++) await verifyCode(u.email, wrong, attacker.browser);
    for (let i = 0; i < 6; i++) await verifyCode(u.email, wrong); // Cookie なしの推し当て
    expect((await verifyCode(u.email, me.mail!.code, me.browser)).status).toBe(200);
  });

  it("B1-23 L2 同時に 40 本まちがえても、1 つのコードで試せるのは 5 回まで", async () => {
    const u = await createUser("owner");
    const { mail, browser } = await requestLogin(u.email);
    const guesses: string[] = [];
    for (let i = 0; guesses.length < 40; i++) {
      const g = String(i).padStart(6, "0");
      if (g !== mail!.code) guesses.push(g);
    }
    guesses.splice(20, 0, mail!.code);
    const rs = await Promise.all(guesses.map((code) => verifyCode(u.email, code, browser)));
    const row = await env.DB.prepare("SELECT attempts FROM login_requests WHERE email = ?").bind(u.email).first<any>();
    expect(row.attempts).toBeLessThanOrEqual(5);
    expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    // 枠を使い切ったら、正しいコードでも入れない
    expect((await verifyCode(u.email, mail!.code, browser)).status).toBe(400);
  });

  it("B1-24 M3 アカウントごとに 1 日 20 回まちがえたら、コードでは 24 時間入れない（リンクでは入れる）", async () => {
    const u = await createUser("owner");
    let last = await requestLogin(u.email);
    for (let k = 0; k < 4; k++) {
      const wrong = last.mail!.code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) expect((await verifyCode(u.email, wrong, last.browser)).status).toBe(400);
      await age(u.email, 13 * 60_000); // 1 時間に 5 回の申し込みに収まるようにずらす
      last = await requestLogin(u.email, last.browser);
      expect(last.r.status).toBe(200);
    }
    const locked = await verifyCode(u.email, last.mail!.code, last.browser);
    expect(locked.status).toBe(429);
    expect(((await locked.json()) as any).error).toBe("locked");
    expect((await verifyToken(tokenOf(last.mail!.link))).status).toBe(200);
    // 24 時間たてば、また使える
    await env.DB.prepare("UPDATE login_failures SET at = at - 86400001 WHERE email = ?").bind(u.email).run();
    await age(u.email, 3_600_000);
    const fresh = await requestLogin(u.email, last.browser);
    expect((await verifyCode(u.email, fresh.mail!.code, fresh.browser)).status).toBe(200);
  });

  it("B1-25 同じリンクで同時に 5 本確かめても、入れるのは 1 本だけ", async () => {
    const u = await createUser("owner");
    const { mail } = await requestLogin(u.email);
    const rs = await Promise.all(Array.from({ length: 5 }, () => verifyToken(tokenOf(mail!.link))));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it("B1-26 L3 メールが送れなくても、答えは同じ（送るのは答えの後）", async () => {
    setMailer({ sendLogin: async () => { throw new Error("down"); } });
    const u = await createUser("owner");
    const r = await call("POST", "/api/auth/request", { json: { email: u.email } });
    expect(r.status).toBe(200);
  });

  it("B1-27 L9 セッションの寿命の上限：店主 90 日・制作側 14 日（使い続けても延びない）", async () => {
    const owner = await createUser("owner");
    const prod = await createUser("producer");
    const day = 86400_000;
    const open = async (email: string) => {
      const { mail, browser } = await requestLogin(email);
      return verifyCode(email, mail!.code, browser);
    };
    const ro = await open(owner.email);
    const rp = await open(prod.email);
    const maxAge = (r: Response) => Number(/Max-Age=(\d+)/.exec(r.headers.getSetCookie().find((s) => s.startsWith("__Host-mikke_sid="))!)![1]);
    expect(maxAge(ro)).toBe(30 * 86400);
    expect(maxAge(rp)).toBe(14 * 86400);
    const co = cookieFrom(ro), cp = cookieFrom(rp);
    // 60 日前にログインし、昨日も使った店主は、まだ入れる
    await env.DB.prepare("UPDATE sessions SET created_at = ?, last_seen_at = ? WHERE user_id = ?").bind(Date.now() - 60 * day, Date.now() - 2 * day, owner.id).run();
    expect((await call("GET", "/api/me", { cookie: co })).status).toBe(200);
    const s = await env.DB.prepare("SELECT created_at, expires_at FROM sessions WHERE user_id = ?").bind(owner.id).first<any>();
    expect(s.expires_at - s.created_at).toBe(90 * day); // 延ばしても 90 日を超えない
    await env.DB.prepare("UPDATE sessions SET created_at = ? WHERE user_id = ?").bind(Date.now() - 91 * day, owner.id).run();
    expect((await call("GET", "/api/me", { cookie: co })).status).toBe(401);
    await env.DB.prepare("UPDATE sessions SET created_at = ?, expires_at = ? WHERE user_id = ?").bind(Date.now() - 15 * day, Date.now() + day, prod.id).run();
    expect((await call("GET", "/api/me", { cookie: cp })).status).toBe(401);
  });

  it("B1-28 L9 全部の端末からログアウト", async () => {
    const u = await createUser("owner");
    const a = cookieFrom(await (async () => { const x = await requestLogin(u.email); return verifyCode(u.email, x.mail!.code, x.browser); })());
    await age(u.email);
    const b = cookieFrom(await (async () => { const x = await requestLogin(u.email); return verifyCode(u.email, x.mail!.code, x.browser); })());
    expect((await call("GET", "/api/me", { cookie: a })).status).toBe(200);
    const r = await call("POST", "/api/auth/logout-all", { cookie: b });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).sessions).toBe(2);
    expect((await call("GET", "/api/me", { cookie: a })).status).toBe(401);
    expect((await call("GET", "/api/me", { cookie: b })).status).toBe(401);
    expect((await call("POST", "/api/auth/logout-all", {})).status).toBe(401);
  });

  it("B1-29 同じブラウザでログインし直したら前のセッションは消える。ほかの端末のセッションは残る", async () => {
    const u = await createUser("owner");
    const x = await requestLogin(u.email);
    const first = cookieFrom(await verifyCode(u.email, x.mail!.code, x.browser));
    await age(u.email);
    const other = await requestLogin(u.email);
    const otherDevice = cookieFrom(await verifyCode(u.email, other.mail!.code, other.browser));
    await age(u.email);
    const y = await requestLogin(u.email, x.browser);
    const second = cookieFrom(await verifyCode(u.email, y.mail!.code, `${x.browser}; ${first}`));
    expect(second).not.toBe(first);
    expect((await call("GET", "/api/me", { cookie: first })).status).toBe(401);
    expect((await call("GET", "/api/me", { cookie: second })).status).toBe(200);
    expect((await call("GET", "/api/me", { cookie: otherDevice })).status).toBe(200);
  });
});

describe("CSRF・CORS（書き込みは編集画面のオリジンからだけ）", () => {
  it("B1-16 Origin のない書き込みは 403", async () => {
    const r = await call("POST", "/api/auth/request", { json: { email: "a@example.com" }, origin: null });
    expect(r.status).toBe(403);
  });

  it("B1-17 公開ページ・他のサイト・null・末尾のスラッシュ・大文字・まぎらわしいもの・http は 403", async () => {
    for (const origin of [
      "https://evil.example",
      "https://ashiyado.mikke.test",
      "http://app.mikke-web.test",
      "null",
      "https://app.mikke-web.test/",
      "https://APP.mikke-web.test",
      "https://app.mikke-web.test.evil.com",
      "https://app.mikke-web.test:444",
    ]) {
      const r = await call("POST", "/api/auth/request", { json: { email: "a@example.com" }, origin });
      expect(r.status, origin).toBe(403);
    }
  });

  it("B1-17b ほかの書き込みの道も、Origin が違えば 403（下書き・写真・公開・台帳・ゴミ箱・設定・制作側・ログアウト）", async () => {
    const { producer, owner, shop } = await world();
    const evil = "https://evil.example";
    const tries: [string, string, Record<string, unknown>][] = [
      ["PUT", `/api/shops/${shop.id}/drafts/site`, { json: { draft: { template: { name: "wa-01" }, sections: {} } }, headers: { "if-match": '"1"' } }],
      ["POST", `/api/shops/${shop.id}/assets`, { body: fakeJpeg(10, 10), headers: { "content-type": "image/jpeg" } }],
      ["POST", `/api/shops/${shop.id}/publish`, { json: { scope: "all", shopDraftVersion: 1, siteDraftVersion: 1, pages: { "/": "x" } } }],
      ["PUT", `/api/shops/${shop.id}/settings`, { json: { recentColors: [] } }],
      ["POST", `/api/shops/${shop.id}/versions/1/restore`, { json: { siteDraftVersion: 1 } }],
      ["POST", "/api/auth/logout", {}],
      ["POST", "/api/auth/logout-all", {}],
    ];
    for (const [m, p, o] of tries) {
      for (const origin of [evil, "null"]) {
        expect((await call(m, p, { cookie: owner.cookie, origin, ...o })).status, `${m} ${p} ${origin}`).toBe(403);
      }
    }
    expect((await call("POST", "/api/admin/shops", { cookie: producer.cookie, origin: evil, json: { slug: "zz", name: "x" } })).status).toBe(403);
    expect((await call("GET", "/api/me", { cookie: owner.cookie })).status).toBe(200); // ログアウトされていない
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

  it("B1-30 L11 API の答えにはいつも Vary: Origin（Origin がなくても・エラーでも）", async () => {
    for (const r of [
      await call("GET", "/api/health"),
      await call("GET", "/api/me"),
      await call("GET", "/api/me", { headers: { origin: APP_ORIGIN } }),
      await call("POST", "/api/auth/request", { json: {}, origin: "https://evil.example" }),
      await call("OPTIONS", "/api/me", { headers: { origin: "https://evil.example" } }),
    ]) {
      expect(r.headers.get("vary") ?? "").toMatch(/Origin/);
    }
  });
});
