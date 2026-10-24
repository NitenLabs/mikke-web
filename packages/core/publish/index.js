// 公開の一式を作る（RELEASE D・ARCHITECTURE「公開は編集画面が描いた HTML を送る」）。
// 入力は、編集画面がブラウザで「公開の描き方」で描いて測った結果（ページごと・PC とスマホの両方）。ここは文字列を組み立てるだけ
// （DOM を使わない＝Node でも動く）。出力は API の POST /api/shops/:id/publish の pages・css・files（apps/api/README.md）。
// 形と決めたことは packages/core/publish/README.md。
import { FONT_LINK } from "../page-css.js";
import { DESIGN_W } from "../spec.js";
import { pictureHtml, ogImageOf } from "./photo.js";
import { publishCss } from "./css.js";
import { pageTitle, pageDescription, headMeta, localBusiness, jsonLdScript, sitemapXml, robotsTxt, esc } from "./seo.js";
import { visibleItemIds, jstDate } from "./visibility.js";

export { variantWidths, sizesFor, pictureHtml, ogImageOf } from "./photo.js";
export { publishCss, BREAKPOINT } from "./css.js";
export { pageTitle, pageDescription, localBusiness, jsonLdScript, sitemapXml, robotsTxt, openingHours, businessType, e164 } from "./seo.js";
export { visibleItemIds, jstDate } from "./visibility.js";

export const MIKKE_BAND_H = 48;          // 芦屋みっけへのリンクの帯の高さ（設計 px。PC・スマホとも）
export const NOT_FOUND_H = { pc: 480, sp: 360 };
// 芦屋みっけの掲載ページ（仮）。① に mikkeSpotId があればそのお店のページ、無ければトップ。本当の道は芦屋みっけ側で決まったら直す
export const MIKKE_BASE = "https://ashiya-mikke.jp";
export function mikkeUrlOf(shop) { const id = shop && shop.mikkeSpotId; return id ? `${MIKKE_BASE}/spots/${encodeURIComponent(id)}/` : `${MIKKE_BASE}/`; }

const r3 = (n) => Math.round(n * 1000) / 1000;
const PHOTO_TOKEN = /<mk-photo data-i="(\d+)"><\/mk-photo>/g;

// 1 つの端末の配置（セクションを上から並べる）。写真の印を <picture> に置き換える
function deviceHtml(device, snap, assets, extra) {
  const photos = snap.photos || []; const used = [];
  const first = photos.findIndex((p) => p && p.asset);
  const secs = (snap.sections || []).map((s) => s.html.replace(/<mk-photo><\/mk-photo>/g, () => { throw new Error("写真の印に番号（data-i）がありません"); }).replace(PHOTO_TOKEN, (m, i) => {
    const p = photos[+i]; if (!p || !p.asset) return "";
    used.push(p.asset);
    return pictureHtml({ ...p, device, eager: +i === first }, assets[p.asset]);
  })).join("");
  const h = (snap.sections || []).reduce((a, s) => a + (+s.height || 0), 0) + (extra.h || 0);
  return { html: `<div class="mk-dev mk-${device}" style="--h:${r3(h)}px"><div class="mk-page">${secs}${extra.html || ""}</div></div>`, used, height: h };
}

function documentHtml({ head, body }) {
  return `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n${FONT_LINK}\n<link rel="stylesheet" href="/style.css">\n<script src="/_mikke/site.js" defer></script>\n</head>\n<body>\n<div class="mk-root">\n${body}\n</div>\n</body>\n</html>\n`;
}

/**
 * 公開の一式を作る。
 * @param {object} input
 *   shop     ① お店の情報（今の下書き）
 *   assets   ④ の一覧（{ ast_…: { file:{width,height}, alt } }）。無い写真は photos[].natW/natH で代わりにする
 *   origin   公開ページのアドレス（例 "https://ashiyado.mikke.site"。末尾の / なし）。canonical・OGP・sitemap に使う
 *   date     描いた日（日本時間 "YYYY-MM-DD"）。品の出し入れ（3.4）・年末年始などの休み・sitemap の lastmod
 *   pages    [{ id, slug, kind, label, devices: { pc: Snap, sp: Snap } }]（Snap は README の「入力」）
 *   seo      { [pageId]: { title?, description? } }（お店が書き換えたもの。無ければ ① から作る）
 *   mikkeUrl 芦屋みっけの掲載ページ（無ければ mikkeUrlOf(shop)）
 *   noindex  true なら検索に出さない（試しの環境など）
 * @returns {{pages:Object<string,string>, css:string, files:Object<string,string>, meta:object}}
 */
export function buildBundle(input) {
  const shop = input.shop || {}; const assets = input.assets || {};
  const origin = String(input.origin || "").replace(/\/+$/, "");
  const date = input.date || jstDate(new Date()).date;
  const warnings = [];
  if (!origin) warnings.push({ kind: "origin_missing", text: "公開ページのアドレス（origin）がありません" });
  let mikkeUrl = input.mikkeUrl;
  if (!mikkeUrl) { mikkeUrl = mikkeUrlOf(shop); warnings.push({ kind: "mikke_url_provisional", text: "芦屋みっけの掲載ページのアドレスは仮の値です：" + mikkeUrl }); }
  const siteName = (shop.basic && shop.basic.name) || "";
  const displayed = visibleItemIds(shop, date);
  const itemNames = (() => {
    const cat = shop.catalog || {}; const pl = Object.values(cat.placements || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
    const seen = new Set(); const out = [];
    for (const p of pl) if (displayed.includes(p.itemId) && !seen.has(p.itemId)) { seen.add(p.itemId); const it = (cat.items || {})[p.itemId]; if (it && it.name) out.push(it.name); }
    return out;
  })();
  const band = { h: MIKKE_BAND_H, html: `<div class="mk-mikke"><a href="${esc(mikkeUrl)}" target="_blank" rel="noopener">芦屋みっけ でこのお店を見る</a></div>` };

  const pages = input.pages || [];
  const firstPhotoOf = (pg) => { for (const d of ["pc", "sp"]) { const s = pg.devices && pg.devices[d]; const p = s && (s.photos || []).find((x) => x && x.asset); if (p) return p.asset; } return null; };
  const home = pages.find((p) => p.slug === "/") || pages[0];
  const homePhoto = home ? firstPhotoOf(home) : null;
  const ogOf = (asset) => { if (!asset) return null; const o = ogImageOf(asset, assets[asset]); return { url: origin + o.path, width: o.width, height: o.height, alt: o.alt }; };
  const ldImage = homePhoto ? ogOf(homePhoto).url : null;
  const ld = jsonLdScript(localBusiness(shop, { origin, date, image: ldImage, mikkeUrl }));

  const outPages = {}; const usedAssets = new Set();
  for (const pg of pages) {
    const seo = (input.seo && input.seo[pg.id]) || {};
    const title = seo.title || pageTitle(shop, pg);
    const description = seo.description || pageDescription(shop, pg, { itemNames });
    const og = ogOf(firstPhotoOf(pg) || homePhoto);
    const head = headMeta({ title, description, canonical: origin + pg.slug, og, siteName, noindex: input.noindex }) + "\n" + ld;
    const parts = [];
    for (const d of ["pc", "sp"]) { const snap = pg.devices && pg.devices[d]; if (!snap) { warnings.push({ kind: "device_missing", page: pg.slug, text: `${pg.slug} の ${d} の配置がありません` }); continue; } const r = deviceHtml(d, snap, assets, band); r.used.forEach((a) => usedAssets.add(a)); parts.push(r.html); }
    outPages[pg.slug] = documentHtml({ head, body: parts.join("\n") });
  }
  // 見つからないページ：トップのヘッダー・フッターの間に案内（検索には出さない）
  if (home) {
    const nf = { kind: "notFound", slug: "/404", label: "見つかりません" };
    const title = pageTitle(shop, nf), description = pageDescription(shop, nf);
    const head = headMeta({ title, description, canonical: origin + "/404", og: ogOf(homePhoto), siteName, isNotFound: true });
    const parts = [];
    for (const d of ["pc", "sp"]) {
      const snap = home.devices && home.devices[d]; if (!snap) continue;
      const hdr = (snap.sections || []).filter((s) => s.type === "header"), ftr = (snap.sections || []).filter((s) => s.type === "footer");
      const mid = { id: "notfound", type: "notFound", height: NOT_FOUND_H[d], html: `<div class="mk-sec mk-404" data-sec="notfound" style="width:${DESIGN_W[d]}px;height:${NOT_FOUND_H[d]}px"><h1>ページが見つかりません</h1><p>お探しのページは、移動したか、なくなった可能性があります。</p><p><a href="/">トップページへ</a></p></div>` };
      const r = deviceHtml(d, { sections: [...hdr, mid, ...ftr], photos: snap.photos }, assets, band); r.used.forEach((a) => usedAssets.add(a)); parts.push(r.html);
    }
    outPages["/404"] = documentHtml({ head, body: parts.join("\n") });
  }
  const unuploaded = [...usedAssets].filter((a) => !/^ast_/.test(a));
  if (unuploaded.length) warnings.push({ kind: "unuploaded_assets", assets: unuploaded, text: "まだ置き場（④）に上げていない写真があります" });
  const listed = pages.filter((p) => p.slug !== "/404");
  return {
    pages: outPages,
    css: publishCss({ bodyBg: "#FFFFFF" }),
    files: { "sitemap.xml": sitemapXml(origin, listed, date), "robots.txt": robotsTxt(origin, !!input.noindex) },
    meta: { date, origin, mikkeUrl, displayedItems: displayed, assets: [...usedAssets].sort(), unuploadedAssets: unuploaded, warnings },
  };
}
