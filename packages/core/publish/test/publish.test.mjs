// 公開の一式の形（D5 検索・共有の情報・D8 相互リンク・D6 出し入れ・API の検査）。ブラウザを使わない（Node だけ）。
//   node --test packages/core/publish/test/publish.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildBundle, variantWidths, pictureHtml, visibleItemIds, localBusiness, openingHours, e164 } from "../index.js";
import { checkHtml, checkXml } from "../../../../apps/api/src/lib/htmlcheck.ts";

const shop = JSON.parse(fs.readFileSync(new URL("../../../../samples/ashiyado/shop.json", import.meta.url), "utf8"));
const assets = JSON.parse(fs.readFileSync(new URL("../../../../samples/ashiyado/assets.json", import.meta.url), "utf8")).assets;
const ORIGIN = "https://ashiyado.mikke.site";
// 共有の画像：1280 があれば 1280、無ければいちばん大きい幅（芦屋堂の ast_frme は幅 1098 なので 1098）
const OG = `${ORIGIN}/media/ast_frme/${variantWidths(assets.ast_frme.file.width).includes(1280) ? 1280 : assets.ast_frme.file.width}.jpg`;

// 編集画面が写し取る形を小さく真似る（README「入力」）
const snap = (device, withPhoto) => ({
  width: device === "pc" ? 1440 : 390, height: 300,
  sections: [
    { id: "header", type: "header", height: 100, html: `<div data-sec="header" id="mk-${device}-header" class="mk-sec" style="height:100px"><a href="/" class="navitem on" aria-current="page">TOP</a></div>` },
    { id: "feature", type: "feature", height: 150, html: `<div data-sec="feature" id="mk-${device}-feature" class="mk-sec" style="height:150px"><div data-el="F_p0" data-kind="photo" class="photo" style="width:200px;height:100px;position:relative;overflow:hidden">${withPhoto ? '<mk-photo data-i="0"></mk-photo>' : ""}</div><div data-el="F_h0" data-kind="text" class="t">季節の&lt;上生菓子&gt;</div></div>` },
    { id: "footer", type: "footer", height: 50, html: `<div data-sec="footer" id="mk-${device}-footer" class="mk-sec" style="height:50px">フッター</div>` },
  ],
  photos: withPhoto ? [{ asset: "ast_frme", part: "F_p0", img: { x: -10, y: -20, w: 240, h: 160 }, natW: 1200, natH: 800 }] : [],
});
const input = (extra = {}) => ({
  shop, assets, origin: ORIGIN, date: "2026-10-24",
  pages: [
    { id: "pg_home", slug: "/", kind: "home", label: "TOP", devices: { pc: snap("pc", true), sp: snap("sp", true) } },
    { id: "pg_menu", slug: "/menu", kind: "menu", label: "お品書き", devices: { pc: snap("pc", false), sp: snap("sp", false) } },
    { id: "pg_contact", slug: "/contact", kind: "contact", label: "アクセス", devices: { pc: snap("pc", false), sp: snap("sp", false) } },
  ],
  ...extra,
});
const ldOf = (html) => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
const metaOf = (html, attr, key) => { const m = new RegExp(`<meta ${attr}="${key.replace(/[:]/g, "\\:")}" content="([^"]*)">`).exec(html); return m ? m[1] : null; };

test("API の本文の形：pages（/・/menu・/contact・/404）・css・files（sitemap.xml・robots.txt）", () => {
  const b = buildBundle(input());
  assert.deepEqual(Object.keys(b.pages).sort(), ["/", "/404", "/contact", "/menu"]);
  for (const p of Object.keys(b.pages)) assert.match(p, /^\/[a-z0-9-]*(\/[a-z0-9-]+)*$/);
  assert.equal(typeof b.css, "string"); assert.ok(b.css.includes(".mk-sec"));
  assert.deepEqual(Object.keys(b.files).sort(), ["robots.txt", "sitemap.xml"]);
  for (const h of Object.values(b.pages)) assert.ok(h.length < 2 * 1024 * 1024);
});

test("API の HTML の検査（apps/api の checkHtml）に通る：インラインの script・on〜 の属性なし、/_mikke/site.js だけ", () => {
  const b = buildBundle(input());
  for (const [p, h] of Object.entries(b.pages)) {
    assert.deepEqual(checkHtml(h), [], p);
    assert.ok(h.includes('<script src="/_mikke/site.js" defer></script>'), p);
    assert.ok(!/\son[a-z]+=/i.test(h), p);
  }
  for (const x of Object.values(b.files)) assert.deepEqual(checkXml(x), []);
});

test("構造化データの中の < は \\u003c（API の検査が「<」＋英字をタグと読むため）", () => {
  const s = JSON.parse(JSON.stringify(shop)); s.basic.tagline = "<b>季節</b>の和菓子 & 甘味";
  const b = buildBundle(input({ shop: s }));
  assert.deepEqual(checkHtml(b.pages["/"]), []);
  assert.equal(ldOf(b.pages["/"]).description, "<b>季節</b>の和菓子 & 甘味");
});

test("D5 タイトル・説明・canonical・OGP（共有の画像は最初の写真）", () => {
  const b = buildBundle(input());
  const home = b.pages["/"], menu = b.pages["/menu"];
  assert.match(home, /<title>御菓子司 芦屋堂｜芦屋市・阪神芦屋駅の和菓子店<\/title>/);
  assert.match(menu, /<title>お品書き｜御菓子司 芦屋堂<\/title>/);
  assert.ok(metaOf(home, "name", "description").length > 10);
  assert.ok(metaOf(menu, "name", "description").startsWith("御菓子司 芦屋堂のお品書き。"));
  assert.match(home, new RegExp(`<link rel="canonical" href="${ORIGIN}/">`));
  assert.match(menu, new RegExp(`<link rel="canonical" href="${ORIGIN}/menu">`));
  assert.equal(metaOf(home, "property", "og:url"), ORIGIN + "/");
  assert.equal(metaOf(home, "property", "og:image"), OG);
  assert.equal(metaOf(menu, "property", "og:image"), OG);   // 写真の無いページはトップの最初の写真
  assert.equal(metaOf(home, "property", "og:site_name"), "御菓子司 芦屋堂");
  assert.equal(metaOf(home, "name", "twitter:card"), "summary_large_image");
  assert.ok(!home.includes('name="robots"'));
});

test("D5 上書き（ページごとの title・description）と noindex", () => {
  const b = buildBundle(input({ seo: { pg_menu: { title: "和菓子のお品書き", description: "説明" } }, noindex: true }));
  assert.match(b.pages["/menu"], /<title>和菓子のお品書き<\/title>/);
  assert.equal(metaOf(b.pages["/menu"], "name", "description"), "説明");
  assert.match(b.pages["/"], /<meta name="robots" content="noindex">/);
  assert.equal(b.files["robots.txt"], "User-agent: *\nDisallow: /\n");
});

test("D5 お店の構造化データ（LocalBusiness 系：名前・住所・電話・営業時間・地図の座標）", () => {
  const b = buildBundle(input());
  const ld = ldOf(b.pages["/"]);
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "Bakery");
  assert.equal(ld.name, "御菓子司 芦屋堂");
  assert.equal(ld.telephone, "+81-797-00-0000");
  assert.deepEqual(ld.address, { "@type": "PostalAddress", postalCode: "659-0000", addressRegion: "兵庫県", addressLocality: "芦屋市", streetAddress: "大原町 0-0", addressCountry: "JP" });
  assert.deepEqual(ld.geo, { "@type": "GeoCoordinates", latitude: 34.728, longitude: 135.305 });
  assert.equal(ld.url, ORIGIN + "/");
  assert.equal(ld.image, OG);
  const oh = ld.openingHoursSpecification;
  assert.deepEqual(oh.find((o) => o.closes === "18:00").dayOfWeek.map((d) => d.replace("https://schema.org/", "")), ["Monday", "Tuesday", "Thursday", "Friday", "Saturday"]);
  assert.deepEqual(oh.find((o) => o.closes === "17:00").dayOfWeek, ["https://schema.org/Sunday"]);
  assert.ok(!JSON.stringify(oh).includes("Wednesday"));   // 定休日
  assert.deepEqual(ld.specialOpeningHoursSpecification, [{ "@type": "OpeningHoursSpecification", validFrom: "2026-12-31", validThrough: "2027-01-03", opens: "00:00", closes: "00:00" }]);
  assert.ok(ld.sameAs.includes("https://www.instagram.com/ashiyado_sample/"));
  assert.ok(ld.hasMap.startsWith("https://www.google.com/maps/"));
  assert.ok(!b.pages["/404"].includes("application/ld+json"));
});

test("番地を隠すお店は、住所は町名まで・座標を出さない", () => {
  const s = JSON.parse(JSON.stringify(shop)); s.location.hideStreet = true;
  const ld = localBusiness(s, { origin: ORIGIN, date: "2026-10-24" });
  assert.equal(ld.address.streetAddress, "大原町"); assert.equal(ld.geo, undefined);
});

test("営業時間：24時を越える時刻・電話の形", () => {
  const oh = openingHours({ hours: { weekly: { fri: { status: "open", periods: [{ start: "18:00", end: "26:00" }] } } } });
  assert.deepEqual(oh, [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["https://schema.org/Friday"], opens: "18:00", closes: "02:00" }]);
  assert.equal(e164("06-1234-5678"), "+81-6-1234-5678"); assert.equal(e164("+81 3 0000 0000"), "+81 3 0000 0000");
});

test("D5 sitemap.xml・robots.txt", () => {
  const b = buildBundle(input());
  const sm = b.files["sitemap.xml"];
  assert.match(sm, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [ORIGIN + "/", ORIGIN + "/menu", ORIGIN + "/contact"]);
  assert.equal([...sm.matchAll(/<lastmod>2026-10-24<\/lastmod>/g)].length, 3);
  assert.equal(b.files["robots.txt"], `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
});

test("D5 見つからないページ：検索に出さない・トップへのリンク・ヘッダーとフッター", () => {
  const nf = buildBundle(input()).pages["/404"];
  assert.match(nf, /<meta name="robots" content="noindex">/);
  assert.match(nf, /<title>ページが見つかりません｜御菓子司 芦屋堂<\/title>/);
  assert.ok(nf.includes('<a href="/">トップページへ</a>'));
  assert.ok(nf.includes('id="mk-pc-header"') && nf.includes('id="mk-sp-footer"'));
  assert.ok(!nf.includes('rel="canonical"'));
});

test("D8 芦屋みっけの掲載ページへのリンク（フッターの下）。① に mikkeSpotId があればそのお店のページ", () => {
  let b = buildBundle(input());
  assert.ok(b.pages["/"].includes('<div class="mk-mikke"><a href="https://ashiya-mikke.jp/" target="_blank" rel="noopener">'));
  assert.ok(b.meta.warnings.some((w) => w.kind === "mikke_url_provisional"));
  const s = JSON.parse(JSON.stringify(shop)); s.mikkeSpotId = "spot_123";
  b = buildBundle(input({ shop: s }));
  assert.ok(b.pages["/menu"].includes('href="https://ashiya-mikke.jp/spots/spot_123/"'));
  assert.ok(ldOf(b.pages["/"]).sameAs.includes("https://ashiya-mikke.jp/spots/spot_123/"));
});

test("PC とスマホの両方の配置を1つの HTML に。高さ（--h）はセクションの合計＋帯", () => {
  const h = buildBundle(input()).pages["/"];
  assert.ok(h.includes('<div class="mk-dev mk-pc" style="--h:348px">'));
  assert.ok(h.includes('<div class="mk-dev mk-sp" style="--h:348px">'));
  const css = buildBundle(input()).css;
  assert.ok(css.includes("@media (max-width:767.98px){.mk-pc{display:none}}"));
  assert.ok(css.includes("@media (min-width:768px){.mk-sp{display:none}}"));
  assert.ok(css.includes("clamp(0.82, tan(atan2(100cqw, 390px)), 1.15)"));
});

test("写真：<picture>＋srcset（WebP を先に・JPEG）・width/height は ④ の値・見せる範囲は <img> の位置・先頭の写真は先に読む", () => {
  assert.deepEqual(variantWidths(2400), [640, 1280, 2400]);
  assert.deepEqual(variantWidths(2000), [640, 1280, 2000]);
  assert.deepEqual(variantWidths(1000), [640, 1000]);
  assert.deepEqual(variantWidths(500), [500]);
  const h = buildBundle(input()).pages["/"];
  const W = assets.ast_frme.file.width, H = assets.ast_frme.file.height;
  const pics = h.match(/<picture>.*?<\/picture>/g);
  assert.equal(pics.length, 2);   // PC とスマホ
  const pc = pics[0];
  assert.ok(pc.includes('<source media="(max-width: 767.98px)" srcset="data:image/gif'));   // スマホでは PC の配置の写真を読まない
  assert.match(pc, /<source type="image\/webp" sizes="[^"]+" srcset="\/media\/ast_frme\/640\.webp 640w, /);
  assert.ok(pc.includes(`width="${W}" height="${H}"`));
  assert.ok(pc.includes('fetchpriority="high"') && !pc.includes('loading="lazy"'));
  assert.ok(pc.includes("position:absolute;left:-10px;top:-20px;width:240px;height:160px"));
  assert.ok(pc.includes(`alt="${assets.ast_frme.alt}"`));
  const lazy = pictureHtml({ asset: "ast_x", img: { x: 0, y: 0, w: 100, h: 100 }, device: "sp" }, { file: { width: 800, height: 800 } });
  assert.ok(lazy.includes('loading="lazy"') && lazy.includes('src="/media/ast_x/800.jpg"'));
  assert.deepEqual(buildBundle(input()).meta.assets, ["ast_frme"]);
});

test("まだ上げていない写真（ast_ でない ID）は meta に出す", () => {
  const inp = input(); inp.pages[0].devices.pc.photos[0].asset = "img_1_1600x1000";
  const b = buildBundle(inp);
  assert.deepEqual(b.meta.unuploadedAssets, ["img_1_1600x1000"]);
  assert.ok(b.meta.warnings.some((w) => w.kind === "unuploaded_assets"));
});

test("D6 出る品（3.4）：販売中・出す月・販売の期間・メニューに載っている。公開した日で決まる", () => {
  const s = JSON.parse(JSON.stringify(shop));
  const ids = Object.keys(s.catalog.items);
  const base = visibleItemIds(s, "2026-10-24");
  assert.ok(base.length > 0);
  const id = base[0];
  s.catalog.items[id].season = { months: [12] };
  assert.ok(!visibleItemIds(s, "2026-10-24").includes(id));
  assert.ok(visibleItemIds(s, "2026-12-01").includes(id));
  s.catalog.items[id].season = null; s.catalog.items[id].availableUntil = "2026-10-23";
  assert.ok(!visibleItemIds(s, "2026-10-24").includes(id));
  assert.ok(ids.length >= base.length);
  assert.deepEqual(buildBundle(input()).meta.displayedItems, visibleItemIds(shop, "2026-10-24"));
});
