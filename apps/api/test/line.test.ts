import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINE_VERIFY_URL } from "../src/services/line";
import { call, cookieFrom, getDraft, newOwner, world } from "./helpers";

const CH = "1650000000";
const sub = () => "U" + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
const token = (s: string) => `idtoken.${s}.${"x".repeat(20)}`;

/** LINE の verify の代わり：idtoken.<sub>.… を受け取り、その sub を返す。expired.… は期限切れ、other-aud.… は別のチャネル */
function fakeLine() {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== LINE_VERIFY_URL) return real(input as any, init);
    const form = new URLSearchParams(String(init?.body ?? ""));
    const t = form.get("id_token") ?? "";
    if (form.get("client_id") !== CH || !t.startsWith("idtoken.") && !t.startsWith("expired.") && !t.startsWith("other-aud."))
      return new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 });
    const s = t.split(".")[1];
    const exp = Math.floor(Date.now() / 1000) + (t.startsWith("expired.") ? -10 : 600);
    return Response.json({ iss: "https://access.line.me", sub: s, aud: t.startsWith("other-aud.") ? "999" : CH, exp, iat: exp - 600, name: "店主さん" });
  });
}

afterEach(() => vi.restoreAllMocks());

describe("店主のログイン：メール（PC）と LINE（スマホ）を同じ 1 人につなぐ", () => {
  it("L-1 メールで入った人が LINE をつなぐと、次から LINE で入れて同じお店が見える", async () => {
    fakeLine();
    const { owner, shop } = await world();
    const s = sub();
    const link = await call("POST", "/api/me/identities/line", { cookie: owner.cookie, json: { idToken: token(s) } });
    expect(link.status).toBe(201);
    const ids = (await (await call("GET", "/api/me/identities", { cookie: owner.cookie })).json()) as any;
    expect(ids.email).toBe(owner.email);
    expect(ids.identities).toMatchObject([{ provider: "line", displayName: "店主さん" }]);
    const r = await call("POST", "/api/auth/line", { json: { idToken: token(s) } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).user.email).toBe(owner.email);
    const lineCookie = cookieFrom(r);
    const me = (await (await call("GET", "/api/me", { cookie: lineCookie })).json()) as any;
    expect(me.shops.map((x: any) => x.id)).toEqual([shop.id]);
    // 同じ下書き（版）を、メールの端末と LINE の端末で見る
    expect((await getDraft(lineCookie, shop.id, "shop")).version).toBe((await getDraft(owner.cookie, shop.id, "shop")).version);
  });

  it("L-2 つないでいない LINE では入れない（404 not_linked）。確かめられないトークン・期限切れ・別のチャネルは 400", async () => {
    fakeLine();
    expect((await call("POST", "/api/auth/line", { json: { idToken: token(sub()) } })).status).toBe(404);
    for (const t of ["garbage-token-xxxxxxxxxxxxxx", `expired.${sub()}.xxxxxxxxxxxxxxxxxxxx`, `other-aud.${sub()}.xxxxxxxxxxxxxxxxxxxx`, `idtoken.not-a-line-id.xxxxxxxxxxxxxxxxxxxx`])
      expect((await call("POST", "/api/auth/line", { json: { idToken: t } })).status).toBe(400);
  });

  it("L-3 ほかの人につながった LINE は 409。1 人に LINE は 1 つまで。外したら LINE では入れない", async () => {
    fakeLine();
    const a = await newOwner();
    const b = await newOwner();
    const s = sub();
    expect((await call("POST", "/api/me/identities/line", { cookie: a.cookie, json: { idToken: token(s) } })).status).toBe(201);
    expect((await call("POST", "/api/me/identities/line", { cookie: a.cookie, json: { idToken: token(s) } })).status).toBe(200); // 同じ物は何度でも
    expect((await call("POST", "/api/me/identities/line", { cookie: b.cookie, json: { idToken: token(s) } })).status).toBe(409);
    expect((await call("POST", "/api/me/identities/line", { cookie: a.cookie, json: { idToken: token(sub()) } })).status).toBe(409);
    expect((await call("DELETE", "/api/me/identities/line", { cookie: a.cookie })).status).toBe(200);
    expect((await call("POST", "/api/auth/line", { json: { idToken: token(s) } })).status).toBe(404);
  });

  it("L-4 LINE のチャネルが設定されていなければ 503（メールでは入れる）。つなぐのはログインしてから・Origin も要る", async () => {
    fakeLine();
    expect((await call("POST", "/api/me/identities/line", { json: { idToken: token(sub()) } })).status).toBe(401);
    expect((await call("POST", "/api/auth/line", { json: { idToken: token(sub()) }, origin: null })).status).toBe(403);
    const keep = env.LINE_LOGIN_CHANNEL_ID;
    try {
      (env as any).LINE_LOGIN_CHANNEL_ID = undefined;
      expect((await call("POST", "/api/auth/line", { json: { idToken: token(sub()) } })).status).toBe(503);
    } finally {
      (env as any).LINE_LOGIN_CHANNEL_ID = keep;
    }
  });

  it("L-5 止めたユーザーは LINE でも入れない", async () => {
    fakeLine();
    const a = await newOwner();
    const s = sub();
    await call("POST", "/api/me/identities/line", { cookie: a.cookie, json: { idToken: token(s) } });
    await env.DB.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").bind(new Date().toISOString(), a.id).run();
    expect((await call("POST", "/api/auth/line", { json: { idToken: token(s) } })).status).toBe(404);
  });
});
