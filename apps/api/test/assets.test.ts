import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { purgeTrash } from "../src/services/assets";
import { sniffImage } from "../src/lib/image";
import { call, fakeJpeg, fakePng, fakeWebp, publishAll, putDraft, siteData, upload, world } from "./helpers";

const DAY = 24 * 3600 * 1000;

describe("C2 写真を上げる（種類・大きさ・位置情報をサーバーでも確かめる）", () => {
  it("C2-1 JPEG・PNG・WebP を受け付け、④ の形で返す", async () => {
    const { owner, shop } = await world();
    for (const [bytes, type, w, h] of [
      [fakeJpeg(2400, 1600), "image/jpeg", 2400, 1600],
      [fakePng(300, 200), "image/png", 300, 200],
      [fakeWebp(1200, 2400), "image/webp", 1200, 2400],
    ] as const) {
      const r = await upload(owner.cookie, shop.id, bytes, type);
      expect(r.status, type).toBe(201);
      const a = (await r.json()) as any;
      expect(a.id).toMatch(/^ast_[a-z0-9]{12}$/);
      expect(a.file).toMatchObject({ mime: type, width: w, height: h, bytes: bytes.byteLength, exifStripped: true });
      expect(a).toMatchObject({ kind: "photo", uploadedBy: "owner", origin: { kind: "ownerUpload" }, rights: { basis: "ownWork" } });
      const f = await call("GET", `/api/shops/${shop.id}/assets/${a.id}/file`, { cookie: owner.cookie });
      expect(f.headers.get("content-type")).toBe(type);
      expect(new Uint8Array(await f.arrayBuffer())).toEqual(bytes);
    }
    const list = (await (await call("GET", `/api/shops/${shop.id}/assets`, { cookie: owner.cookie })).json()) as any;
    expect(list.schemaVersion).toBe(1);
    expect(Object.keys(list.assets)).toHaveLength(3);
  });

  it("C2-2 長い辺が 2400px を超える写真は 400（ブラウザで縮めてから）", async () => {
    const { owner, shop } = await world();
    expect((await upload(owner.cookie, shop.id, fakeJpeg(2401, 100))).status).toBe(400);
    expect((await upload(owner.cookie, shop.id, fakePng(100, 4000), "image/png")).status).toBe(400);
  });

  it("C2-3 位置情報などの EXIF が残っていたら 400", async () => {
    const { owner, shop } = await world();
    const r = await upload(owner.cookie, shop.id, fakeJpeg(100, 100, { exif: true }));
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error).toBe("exif_present");
    expect((await upload(owner.cookie, shop.id, fakeWebp(100, 100, { exif: true }), "image/webp")).status).toBe(400);
  });

  it("C2-4 種類が違う・写真でない・受け付けない種類は 415", async () => {
    const { owner, shop } = await world();
    expect((await upload(owner.cookie, shop.id, fakePng(10, 10), "image/jpeg")).status).toBe(415); // 中身と名乗りが違う
    expect((await upload(owner.cookie, shop.id, new TextEncoder().encode("<svg onload=alert(1)>"), "image/jpeg")).status).toBe(415);
    expect((await upload(owner.cookie, shop.id, new TextEncoder().encode("GIF89a...."), "image/gif")).status).toBe(415);
    expect((await upload(owner.cookie, shop.id, fakeJpeg(10, 10), "text/html")).status).toBe(415);
    expect((await upload(owner.cookie, shop.id, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2]), "image/jpeg")).status).toBe(415); // 壊れた JPEG
  });

  it("C2-5 10MB を超えるファイルは 413", async () => {
    const { owner, shop } = await world();
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(fakeJpeg(100, 100));
    expect((await upload(owner.cookie, shop.id, big)).status).toBe(413);
  });

  it("C2-6 台帳を直せる（説明文・枠・権利）。知らない項目は 400", async () => {
    const { owner, shop } = await world();
    const a = (await (await upload(owner.cookie, shop.id, fakeJpeg(10, 10))).json()) as any;
    const p = await call("PATCH", `/api/shops/${shop.id}/assets/${a.id}`, { cookie: owner.cookie, json: { alt: "店の外観", slot: "exterior" } });
    expect(p.status).toBe(200);
    expect(await p.json()).toMatchObject({ alt: "店の外観", slot: "exterior" });
    expect((await call("PATCH", `/api/shops/${shop.id}/assets/${a.id}`, { cookie: owner.cookie, json: { file: { key: "x" } } })).status).toBe(400);
    expect((await call("PATCH", `/api/shops/${shop.id}/assets/${a.id}`, { cookie: owner.cookie, json: { slot: "nope" } })).status).toBe(400);
  });

  it("C2-7 読み取り：中身の先頭から種類と大きさを読む", () => {
    expect(sniffImage(fakeJpeg(640, 480))).toMatchObject({ mime: "image/jpeg", width: 640, height: 480, hasExif: false });
    expect(sniffImage(fakePng(1, 2))).toMatchObject({ mime: "image/png", width: 1, height: 2 });
    expect(sniffImage(fakeWebp(3, 4))).toMatchObject({ mime: "image/webp", width: 3, height: 4 });
    expect(sniffImage(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("C4 ゴミ箱（30 日）。版が指している写真は消さない", () => {
  async function trashAndAge(cookie: string, shopId: string, id: string, days: number) {
    const r = await call("DELETE", `/api/shops/${shopId}/assets/${id}`, { cookie });
    expect(r.status).toBe(200);
    await env.DB.prepare("UPDATE assets SET trashed_at = ? WHERE id = ?").bind(new Date(Date.now() - days * DAY).toISOString(), id).run();
    return (await r.json()) as any;
  }

  it("C4-1 ゴミ箱に入れると一覧から消え、?trash=1 で見える。戻せる", async () => {
    const { owner, shop } = await world();
    const a = (await (await upload(owner.cookie, shop.id, fakeJpeg(10, 10))).json()) as any;
    await call("DELETE", `/api/shops/${shop.id}/assets/${a.id}`, { cookie: owner.cookie });
    let list = (await (await call("GET", `/api/shops/${shop.id}/assets`, { cookie: owner.cookie })).json()) as any;
    expect(list.assets[a.id]).toBeUndefined();
    list = (await (await call("GET", `/api/shops/${shop.id}/assets?trash=1`, { cookie: owner.cookie })).json()) as any;
    expect(list.assets[a.id].trashedAt).toBeTruthy();
    await call("POST", `/api/shops/${shop.id}/assets/${a.id}/restore`, { cookie: owner.cookie });
    list = (await (await call("GET", `/api/shops/${shop.id}/assets`, { cookie: owner.cookie })).json()) as any;
    expect(list.assets[a.id].trashedAt).toBeUndefined();
  });

  it("C4-2 どこにも指されていない写真は、30 日たったら本当に消える（29 日では消えない）", async () => {
    const { owner, shop } = await world();
    const a = (await (await upload(owner.cookie, shop.id, fakeJpeg(10, 10))).json()) as any;
    await trashAndAge(owner.cookie, shop.id, a.id, 29);
    expect((await purgeTrash(env)).purged).not.toContain(a.id);
    await env.DB.prepare("UPDATE assets SET trashed_at = ? WHERE id = ?").bind(new Date(Date.now() - 31 * DAY).toISOString(), a.id).run();
    expect((await purgeTrash(env)).purged).toContain(a.id);
    expect(await env.BUCKET.get(a.file.key)).toBeNull();
    expect((await call("GET", `/api/shops/${shop.id}/assets/${a.id}`, { cookie: owner.cookie })).status).toBe(404);
    // 行は残る（ID を使い回さない）
    expect(await env.DB.prepare("SELECT purged_at FROM assets WHERE id = ?").bind(a.id).first()).toBeTruthy();
  });

  it("C4-3 古い版が使っている写真は、ゴミ箱に入れて 30 日たっても消えない。公開ページでも出る", async () => {
    const { owner, shop } = await world();
    const a = (await (await upload(owner.cookie, shop.id, fakeJpeg(10, 10))).json()) as any;
    await putDraft(owner.cookie, shop.id, "site", 1, siteData({ content: { F_p0: { asset: a.id } } }));
    await publishAll(owner.cookie, shop.id, { "/": "x" });
    // 下書きからは外して、写真をゴミ箱へ
    await putDraft(owner.cookie, shop.id, "site", 2, siteData());
    const t = await trashAndAge(owner.cookie, shop.id, a.id, 40);
    expect(t.referencedBy).toContain("version:1");
    const res = await purgeTrash(env);
    expect(res.purged).not.toContain(a.id);
    expect(res.kept.find((k) => k.id === a.id)?.refs).toContain("version:1");
    expect(await env.BUCKET.get(a.file.key)).not.toBeNull();
    expect((await call("GET", `/media/${a.id}`, { host: `${shop.slug}.mikke.test` })).status).toBe(200);
  });

  it("C4-4 今の下書きや戻す前の下書きが指している写真も消さない", async () => {
    const { owner, shop } = await world();
    const a = (await (await upload(owner.cookie, shop.id, fakeJpeg(10, 10))).json()) as any;
    await putDraft(owner.cookie, shop.id, "site", 1, siteData({ content: { F_p0: { asset: a.id } } }));
    await trashAndAge(owner.cookie, shop.id, a.id, 40);
    expect((await purgeTrash(env)).kept.find((k) => k.id === a.id)?.refs).toContain("draft:site");
  });

  it("C4-5 写真の操作も変更の記録に残る", async () => {
    const { owner, shop } = await world();
    const a = (await (await upload(owner.cookie, shop.id, fakeJpeg(10, 10))).json()) as any;
    await call("DELETE", `/api/shops/${shop.id}/assets/${a.id}`, { cookie: owner.cookie });
    const ch = (await (await call("GET", `/api/shops/${shop.id}/changes`, { cookie: owner.cookie })).json()) as any;
    expect(ch.changes.map((c: any) => c.action)).toEqual(["trash", "upload"]);
    expect(ch.changes[0]).toMatchObject({ layer: "assets", path: `/assets/${a.id}` });
  });
});
