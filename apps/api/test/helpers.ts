import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { handleFetch } from "../src/app";
import { memoryOutbox } from "../src/services/mailer";

export const APP_ORIGIN = "https://app.mikke-web.test";
export const API_HOST = "api.mikke-web.test";

export interface CallOpts {
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  cookie?: string;
  host?: string;
  origin?: string | null;
}

export async function call(method: string, path: string, o: CallOpts = {}): Promise<Response> {
  const headers = new Headers(o.headers ?? {});
  headers.set("host", o.host ?? API_HOST);
  if (o.origin !== null && method !== "GET" && method !== "HEAD" && !headers.has("origin")) headers.set("origin", o.origin ?? APP_ORIGIN);
  if (o.cookie) headers.set("cookie", o.cookie);
  let body = o.body;
  if (o.json !== undefined) {
    body = JSON.stringify(o.json);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const req = new Request(`https://${o.host ?? API_HOST}${path}`, { method, headers, body });
  const ctx = createExecutionContext();
  const res = await handleFetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

let n = 0;
export const uniq = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function createUser(role: "owner" | "producer", email = `${uniq(role)}@example.com`): Promise<{ id: string; email: string }> {
  const id = `usr_${uniq("u").replace(/[^a-z0-9]/g, "").slice(0, 20)}`;
  await env.DB.prepare("INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, email, role, role, new Date().toISOString()).run();
  return { id, email };
}

/** メールのコードでログインして、Cookie の「名前=値」を返す */
export async function login(email: string): Promise<string> {
  const before = memoryOutbox.length;
  // 同じ人の 2 台目の端末を作るため、前の申し込みを 1 時間前にずらす（続けて頼むと 429 になるので）
  await env.DB.prepare("UPDATE login_requests SET created_at = created_at - 3600000 WHERE email = ?").bind(email).run();
  const r = await call("POST", "/api/auth/request", { json: { email } });
  if (r.status !== 200) throw new Error(`request ${r.status} ${await r.text()}`);
  const mail = memoryOutbox.slice(before).find((m) => m.to === email);
  if (!mail) throw new Error("mail not sent");
  const v = await call("POST", "/api/auth/verify", { json: { email, code: mail.code }, cookie: cookieFrom(r) });
  if (v.status !== 200) throw new Error(`verify ${v.status} ${await v.text()}`);
  return cookieFrom(v);
}

/** 答えの Set-Cookie から「名前=値」を取る（セッションがあればそれ、なければ最初のもの。消す Cookie は飛ばす） */
export function cookieFrom(res: Response): string {
  const all = res.headers.getSetCookie().filter((s) => !/Max-Age=0/i.test(s));
  const pick = all.find((s) => s.startsWith("__Host-mikke_sid=")) ?? all[0] ?? "";
  return pick.split(";")[0];
}

export async function newProducer() {
  const u = await createUser("producer");
  return { ...u, cookie: await login(u.email) };
}

export async function newOwner() {
  const u = await createUser("owner");
  return { ...u, cookie: await login(u.email) };
}

/** 制作側でお店を作り、店主をつなぐ */
export async function newShop(producerCookie: string, ownerEmail?: string) {
  const slug = uniq("s").replace(/[^a-z0-9]/g, "").slice(0, 30);
  const r = await call("POST", "/api/admin/shops", { cookie: producerCookie, json: { slug, name: "試しの店" } });
  if (r.status !== 201) throw new Error(`shop ${r.status} ${await r.text()}`);
  const shop = (await r.json()) as { id: string; slug: string };
  if (ownerEmail) {
    const m = await call("POST", `/api/admin/shops/${shop.id}/members`, { cookie: producerCookie, json: { email: ownerEmail } });
    if (m.status !== 201) throw new Error(`member ${m.status}`);
  }
  return shop;
}

/** 店主・制作側・お店をまとめて作る */
export async function world() {
  const producer = await newProducer();
  const owner = await newOwner();
  const shop = await newShop(producer.cookie, owner.email);
  return { producer, owner, shop };
}

export async function getDraft(cookie: string, shopId: string, kind: "shop" | "site") {
  const r = await call("GET", `/api/shops/${shopId}/drafts/${kind}`, { cookie });
  return (await r.json()) as { version: number; data: any };
}

export async function putDraft(cookie: string, shopId: string, kind: "shop" | "site", version: number, data: unknown) {
  return call("PUT", `/api/shops/${shopId}/drafts/${kind}`, { cookie, json: data, headers: { "if-match": `"${version}"` } });
}

export const siteData = (extra: Record<string, unknown> = {}) => ({
  draft: { template: { name: "wa-01", version: 1 }, sections: { pg_home: [{ id: "feature", type: "feature" }] }, ...extra },
});

// ---- 写真の試験用の、小さな本物の形のファイル ----
const be16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const le24 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff];
const le32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const be32 = (v: number) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));

export function fakeJpeg(w: number, h: number, opts: { exif?: boolean } = {}): Uint8Array {
  const app0 = [0xff, 0xe0, ...be16(16), ...str("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const exif = opts.exif ? [0xff, 0xe1, ...be16(2 + 6 + 8), ...str("Exif"), 0, 0, ...str("MM"), 0, 42, 0, 0, 0, 8] : [];
  const sof = [0xff, 0xc0, ...be16(17), 8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xff, 0xda, ...be16(12), 3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0, 0x12, 0x34];
  return new Uint8Array([0xff, 0xd8, ...app0, ...exif, ...sof, ...sos, 0xff, 0xd9]);
}

export function fakePng(w: number, h: number): Uint8Array {
  const ihdr = [...be32(13), ...str("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0];
  const iend = [...be32(0), ...str("IEND"), 0xae, 0x42, 0x60, 0x82];
  return new Uint8Array([0x89, ...str("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...iend]);
}

export function fakeWebp(w: number, h: number, opts: { exif?: boolean } = {}): Uint8Array {
  const vp8x = [...str("VP8X"), ...le32(10), opts.exif ? 0x08 : 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)];
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  const vp8l = [...str("VP8L"), ...le32(5), 0x2f, ...le32(bits)];
  const pad = vp8l.length % 2 ? [0] : [];
  const body = [...str("WEBP"), ...vp8x, ...vp8l, ...pad];
  return new Uint8Array([...str("RIFF"), ...le32(body.length), ...body]);
}
void le16;

export async function upload(cookie: string, shopId: string, bytes: Uint8Array, type = "image/jpeg") {
  return call("POST", `/api/shops/${shopId}/assets`, { cookie, body: bytes, headers: { "content-type": type } });
}

/** 公開は 1 分に 1 回まで（L10）なので、試験では前の公開を 1 分前にずらしてから公開する */
export async function allowPublish(shopId: string) {
  await env.DB.prepare("UPDATE shops SET last_publish_at = last_publish_at - 61000 WHERE id = ?").bind(shopId).run();
}

/** ログインの申し込み。答えと、届いたメールと、申し込んだブラウザの Cookie を返す */
export async function requestLogin(email: string, browserCookie?: string) {
  const before = memoryOutbox.length;
  const r = await call("POST", "/api/auth/request", { json: { email }, cookie: browserCookie });
  const mail = memoryOutbox.slice(before).find((m) => m.to === email.trim().toLowerCase());
  const browser = cookieFrom(r) || browserCookie || "";
  return { r, mail, browser };
}

/** リンクの合言葉（#t= の後ろ） */
export const tokenOf = (link: string) => decodeURIComponent(new URL(link).hash.replace(/^#t=/, ""));

export async function publishAll(cookie: string, shopId: string, pages: Record<string, string> = { "/": "<html>top</html>" }, extra: Record<string, unknown> = {}) {
  await allowPublish(shopId);
  const shopD = await getDraft(cookie, shopId, "shop");
  const siteD = await getDraft(cookie, shopId, "site");
  return call("POST", `/api/shops/${shopId}/publish`, {
    cookie,
    json: { scope: "all", shopDraftVersion: shopD.version, siteDraftVersion: siteD.version, pages, ...extra },
  });
}
