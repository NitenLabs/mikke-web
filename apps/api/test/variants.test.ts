import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { purgeTrash } from "../src/services/assets";
import { variantWidths } from "../src/services/variants";
import { call, fakeJpeg, fakePng, fakeWebp, publishAll, upload, world } from "./helpers";

const DAY = 24 * 3600 * 1000;
const site = (slug: string, path: string, headers: Record<string, string> = {}) => call("GET", path, { host: `${slug}.mikke.test`, headers });

/** 編集画面が作る大きさ違い（幅 → JPEG と WebP） */
function variantsFor(w: number, h: number, opts: { webp?: boolean; skip?: string[]; tweak?: (name: string, img: Uint8Array) => Uint8Array } = {}) {
  const out: Record<string, Uint8Array> = {};
  for (const vw of variantWidths(w)) {
    const vh = Math.round((h * vw) / w);
    out[`${vw}.jpg`] = fakeJpeg(vw, vh);
    if (opts.webp !== false) out[`${vw}.webp`] = fakeWebp(vw, vh);
  }
  for (const s of opts.skip ?? []) delete out[s];
  if (opts.tweak) for (const k of Object.keys(out)) out[k] = opts.tweak(k, out[k]);
  return out;
}

function form(main: Uint8Array | null, mainType: string, variants: Record<string, Uint8Array>, extra: Record<string, Uint8Array> = {}) {
  const fd = new FormData();
  if (main) fd.append("file", new File([main], "店の外観.jpg", { type: mainType }));
  for (const [name, b] of Object.entries({ ...variants, ...extra })) fd.append(name, new File([b], name, { type: name.endsWith(".webp") ? "image/webp" : "image/jpeg" }));
  return fd;
}

const uploadWithVariants = (cookie: string, shopId: string, fd: FormData) => call("POST", `/api/shops/${shopId}/assets`, { cookie, body: fd });

describe("C3 公開ページの写真を、画面の大きさに合わせて配る", () => {
  it("C3-1 大きさ違いの幅：640・1280・2400。元が小さければ元の幅まで", () => {
    expect(variantWidths(2400)).toEqual([640, 1280, 2400]);
    expect(variantWidths(2000)).toEqual([640, 1280, 2000]);
    expect(variantWidths(1280)).toEqual([640, 1280]);
    expect(variantWidths(1000)).toEqual([640, 1000]);
    expect(variantWidths(640)).toEqual([640]);
    expect(variantWidths(300)).toEqual([300]);
  });

  it("C3-2 写真と大きさ違い（WebP・JPEG）を 1 回で上げられ、公開ページの /media/<ID>/<幅>.<webp|jpg> で出る", async () => {
    const { owner, shop } = await world();
    const main = fakeJpeg(2400, 1600);
    const vs = variantsFor(2400, 1600);
    const r = await uploadWithVariants(owner.cookie, shop.id, form(main, "image/jpeg", vs));
    expect(r.status, await r.clone().text()).toBe(201);
    const a = (await r.json()) as any;
    // 答えは今までどおり ④ の 1 件の形（大きさ違いは台帳に持たない。DATA_SPEC 5.2）
    expect(a.file).toMatchObject({ mime: "image/jpeg", width: 2400, height: 1600 });
    expect(a.variants).toBeUndefined();
    expect(a.originalName).toBe("店の外観.jpg");
    const v = (await (await call("GET", `/api/shops/${shop.id}/assets/${a.id}/variants`, { cookie: owner.cookie })).json()) as any;
    expect(v.widths).toEqual([640, 1280, 2400]);
    expect(v.variants.map((x: any) => `${x.width}.${x.format}`).sort()).toEqual(["1280.jpg", "1280.webp", "2400.jpg", "2400.webp", "640.jpg", "640.webp"]);
    expect(v.variants.find((x: any) => x.width === 640)).toMatchObject({ height: 427 });

    // 公開前は出ない
    expect((await site(shop.slug, `/media/${a.id}/640.webp`)).status).toBe(404);
    await publishAll(owner.cookie, shop.id, {
      "/": `<picture><source type="image/webp" srcset="/media/${a.id}/640.webp 640w, /media/${a.id}/1280.webp 1280w, /media/${a.id}/2400.webp 2400w" sizes="100vw"><img src="/media/${a.id}/1280.jpg" srcset="/media/${a.id}/640.jpg 640w, /media/${a.id}/1280.jpg 1280w, /media/${a.id}/2400.jpg 2400w" sizes="100vw" width="2400" height="1600" alt=""></picture>`,
    });
    for (const [name, bytes] of Object.entries(vs)) {
      const res = await site(shop.slug, `/media/${a.id}/${name}`);
      expect(res.status, name).toBe(200);
      expect(res.headers.get("content-type")).toBe(name.endsWith(".webp") ? "image/webp" : "image/jpeg");
      expect(res.headers.get("cache-control")).toContain("immutable");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    }
    // 1 枚だけの道も今までどおり
    const one = await site(shop.slug, `/media/${a.id}`);
    expect(one.status).toBe(200);
    expect(new Uint8Array(await one.arrayBuffer())).toEqual(main);
    // 決まった幅でないもの・決まった形式でないものは 404
    for (const p of [`/media/${a.id}/800.webp`, `/media/${a.id}/640.png`, `/media/${a.id}/640.avif`, `/media/${a.id}/0640.webp`]) expect((await site(shop.slug, p)).status, p).toBe(404);
  });

  it("C3-3 元が小さい写真は元の幅まで（1000px → 640 と 1000）。PNG の写真にも JPEG・WebP の大きさ違いを付けられる", async () => {
    const { owner, shop } = await world();
    const vs = variantsFor(1000, 800);
    expect(Object.keys(vs).sort()).toEqual(["1000.jpg", "1000.webp", "640.jpg", "640.webp"]);
    const r = await uploadWithVariants(owner.cookie, shop.id, form(fakePng(1000, 800), "image/png", vs));
    expect(r.status, await r.clone().text()).toBe(201);
    const a = (await r.json()) as any;
    await publishAll(owner.cookie, shop.id, { "/": `<img src="/media/${a.id}/1000.jpg">` });
    expect((await site(shop.slug, `/media/${a.id}/1000.webp`)).status).toBe(200);
    expect((await site(shop.slug, `/media/${a.id}/1280.webp`)).status).toBe(404);
  });

  it("C3-4 足りない・余分・縦横が合わない・種類が違う大きさ違いは 400 か 415（写真も置かない）", async () => {
    const { owner, shop } = await world();
    const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM assets WHERE shop_id = ?").bind(shop.id).first<{ n: number }>())!.n;
    const main = fakeJpeg(2400, 1600);
    const cases: [string, FormData, number, string][] = [
      ["JPEG が足りない", form(main, "image/jpeg", variantsFor(2400, 1600, { skip: ["1280.jpg"] })), 400, "incomplete_variants"],
      ["WebP が一部だけ", form(main, "image/jpeg", variantsFor(2400, 1600, { skip: ["2400.webp"] })), 400, "incomplete_variants"],
      ["決まっていない幅", form(main, "image/jpeg", variantsFor(2400, 1600), { "800.jpg": fakeJpeg(800, 533) }), 400, "invalid_variant"],
      ["知らない名前", form(main, "image/jpeg", variantsFor(2400, 1600), { "thumb.png": fakePng(10, 10) }), 400, "invalid_variant"],
      ["幅が名前と違う", form(main, "image/jpeg", variantsFor(2400, 1600, { tweak: (k, b) => (k === "640.jpg" ? fakeJpeg(641, 427) : b) })), 400, "variant_size_mismatch"],
      ["縦横の比が違う", form(main, "image/jpeg", variantsFor(2400, 1600, { tweak: (k, b) => (k === "640.webp" ? fakeWebp(640, 640) : b) })), 400, "variant_size_mismatch"],
      ["名前は webp で中身は JPEG", form(main, "image/jpeg", variantsFor(2400, 1600, { tweak: (k, b) => (k === "1280.webp" ? fakeJpeg(1280, 853) : b) })), 415, "type_mismatch"],
      ["元の写真がない", form(null, "image/jpeg", variantsFor(2400, 1600)), 400, "missing_file"],
    ];
    for (const [name, fd, status, error] of cases) {
      const r = await uploadWithVariants(owner.cookie, shop.id, fd);
      expect(r.status, name).toBe(status);
      expect(((await r.json()) as any).error, name).toBe(error);
    }
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM assets WHERE shop_id = ?").bind(shop.id).first<{ n: number }>())!.n).toBe(before);
  });

  it("C3-5 大きさ違いもそれぞれ M5 の検査を通す（撮影データ・終わりの後ろのデータ）", async () => {
    const { owner, shop } = await world();
    const main = fakeJpeg(1280, 720);
    const exif = form(main, "image/jpeg", variantsFor(1280, 720, { tweak: (k, b) => (k === "640.jpg" ? fakeJpeg(640, 360, { exif: true }) : b) }));
    let r = await uploadWithVariants(owner.cookie, shop.id, exif);
    expect(r.status).toBe(400);
    expect(((await r.json()) as any)).toMatchObject({ error: "metadata_present", variant: "640.jpg" });
    const webpExif = form(main, "image/jpeg", variantsFor(1280, 720, { tweak: (k, b) => (k === "1280.webp" ? fakeWebp(1280, 720, { exif: true }) : b) }));
    expect(((await (await uploadWithVariants(owner.cookie, shop.id, webpExif)).json()) as any).error).toBe("metadata_present");
    const tail = form(main, "image/jpeg", variantsFor(1280, 720, { tweak: (k, b) => (k === "640.webp" ? new Uint8Array([...b, 1, 2, 3, 4]) : b) }));
    r = await uploadWithVariants(owner.cookie, shop.id, tail);
    expect(((await r.json()) as any)).toMatchObject({ error: "trailing_data", variant: "640.webp" });
  });

  it("C3-6 WebP を作れないブラウザは JPEG だけでもよい。.webp を頼まれたら同じ幅の JPEG を返す", async () => {
    const { owner, shop } = await world();
    const vs = variantsFor(1280, 960, { webp: false });
    const a = (await (await uploadWithVariants(owner.cookie, shop.id, form(fakeJpeg(1280, 960), "image/jpeg", vs))).json()) as any;
    await publishAll(owner.cookie, shop.id, { "/": `<img src="/media/${a.id}/640.jpg">` });
    const res = await site(shop.slug, `/media/${a.id}/640.webp`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(vs["640.jpg"]);
  });

  it("C3-7 古い 1 枚だけの写真も今までどおり配れる。大きさ違いの道で頼まれても元の 1 枚を返す（短く覚える）", async () => {
    const { owner, shop } = await world();
    const main = fakeWebp(1200, 900);
    const a = (await (await upload(owner.cookie, shop.id, main, "image/webp")).json()) as any;
    await publishAll(owner.cookie, shop.id, { "/": `<img src="/media/${a.id}" srcset="/media/${a.id}/640.webp 640w, /media/${a.id}/1200.webp 1200w">` });
    expect((await site(shop.slug, `/media/${a.id}`)).status).toBe(200);
    for (const p of ["640.webp", "1200.jpg"]) {
      const res = await site(shop.slug, `/media/${a.id}/${p}`);
      expect(res.status, p).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/webp");
      expect(res.headers.get("cache-control")).not.toContain("immutable");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(main);
    }
    expect((await site(shop.slug, `/media/${a.id}/1280.webp`)).status).toBe(404);
  });

  it("C3-8 古い写真に、あとから大きさ違いを足せる（1 回だけ）。足したら公開ページでも出る", async () => {
    const { owner, shop } = await world();
    const a = (await (await upload(owner.cookie, shop.id, fakeJpeg(1280, 960))).json()) as any;
    const vs = variantsFor(1280, 960);
    const add = await call("POST", `/api/shops/${shop.id}/assets/${a.id}/variants`, { cookie: owner.cookie, body: form(null, "", vs) });
    expect(add.status, await add.clone().text()).toBe(201);
    expect(((await add.json()) as any).variants).toHaveLength(4);
    const again = await call("POST", `/api/shops/${shop.id}/assets/${a.id}/variants`, { cookie: owner.cookie, body: form(null, "", vs) });
    expect(again.status).toBe(409);
    await publishAll(owner.cookie, shop.id, { "/": `<img src="/media/${a.id}/640.jpg">` });
    const res = await site(shop.slug, `/media/${a.id}/640.webp`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(vs["640.webp"]);
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("C3-9 ほかのお店の写真・権限：大きさ違いを足すのも店のメンバーだけ（ほかは 404）", async () => {
    const one = await world();
    const two = await world();
    const a = (await (await upload(one.owner.cookie, one.shop.id, fakeJpeg(640, 480))).json()) as any;
    const vs = variantsFor(640, 480);
    expect((await call("POST", `/api/shops/${one.shop.id}/assets/${a.id}/variants`, { cookie: two.owner.cookie, body: form(null, "", vs) })).status).toBe(404);
    expect((await call("POST", `/api/shops/${two.shop.id}/assets/${a.id}/variants`, { cookie: two.owner.cookie, body: form(null, "", vs) })).status).toBe(404);
  });

  it("C3-10 大きさ違いも写真の量に数え、ゴミ箱の掃除で一緒に消える", async () => {
    const { owner, shop } = await world();
    const vs = variantsFor(640, 480);
    const a = (await (await uploadWithVariants(owner.cookie, shop.id, form(fakeJpeg(640, 480), "image/jpeg", vs))).json()) as any;
    const v = (await (await call("GET", `/api/shops/${shop.id}/assets/${a.id}/variants`, { cookie: owner.cookie })).json()) as any;
    const keys = v.variants.map((x: any) => x.key);
    for (const k of keys) expect(await env.BUCKET.get(k)).not.toBeNull();
    // 量：大きさ違いの分も数える
    await env.DB.prepare("UPDATE assets SET bytes = ? WHERE id = ?").bind(1024 ** 3 - a.file.bytes - 10, a.id).run();
    const full = await uploadWithVariants(owner.cookie, shop.id, form(fakeJpeg(640, 480), "image/jpeg", vs));
    expect(full.status).toBe(413);
    // 掃除
    await call("DELETE", `/api/shops/${shop.id}/assets/${a.id}`, { cookie: owner.cookie });
    await env.DB.prepare("UPDATE assets SET trashed_at = ? WHERE id = ?").bind(new Date(Date.now() - 31 * DAY).toISOString(), a.id).run();
    expect((await purgeTrash(env)).purged).toContain(a.id);
    for (const k of keys) expect(await env.BUCKET.get(k)).toBeNull();
  });
});
