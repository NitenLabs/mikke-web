// 検索・共有の情報（RELEASE D5・handoff 01 の 5.6）：タイトル・説明・OGP・canonical・お店の構造化データ（JSON-LD）・sitemap.xml・robots.txt。
// 値は ① お店の情報から作る。ページごとに上書き（seo[pageId].title / description）できる。
import { formatAddress, storeOf, mapHref } from "../shopinfo.js";

export const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
const clip = (s, n) => { s = oneLine(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// 最寄り駅（並びの先頭）と歩く分
function firstAccess(shop) {
  const acc = (shop && shop.location && shop.location.access) || {};
  const list = Object.values(acc).filter((a) => a && a.station).sort((a, b) => (a.order || 0) - (b.order || 0));
  return list[0] || null;
}
const METHOD = { walk: "徒歩", bus: "バス", car: "車", bike: "自転車", taxi: "タクシー" };

// ページのタイトル。トップ＝「店名｜市・駅の業種」（例「御菓子司 芦屋堂｜芦屋市・阪神芦屋駅の和菓子店」）、ほか＝「ページ名｜店名」
export function pageTitle(shop, page) {
  const b = (shop && shop.basic) || {}; const name = b.name || "";
  if (page.kind === "home" || page.slug === "/") {
    const loc = (shop && shop.location) || {}; const st = firstAccess(shop);
    const where = [loc.city, st && st.station].filter(Boolean).join("・");
    const genre = (b.genre && b.genre.detail) || "";
    const tail = where && genre ? `${where}の${genre}` : (genre || where);
    return tail ? `${name}｜${tail}` : name;
  }
  if (page.kind === "notFound") return `ページが見つかりません｜${name}`;
  return `${page.label}｜${name}`;
}

// 説明（120 文字まで）
export function pageDescription(shop, page, ctx = {}) {
  const b = (shop && shop.basic) || {}; const name = b.name || ""; const loc = (shop && shop.location) || {};
  const st = firstAccess(shop);
  const access = st ? `${st.station}から${METHOD[st.method] || ""}${st.minutes ? st.minutes + "分" : ""}` : "";
  const town = formatAddress(loc, "town");
  if (page.kind === "home" || page.slug === "/") return clip([b.tagline, [town, access].filter(Boolean).join("、")].filter(Boolean).join("。") + "。", 120);
  if (page.kind === "menu") {
    const names = (ctx.itemNames || []).slice(0, 4);
    return clip(`${name}のお品書き。` + (names.length ? `${names.join("・")}など。` : "") + (b.tagline || ""), 120);
  }
  if (page.kind === "contact") {
    const addr = formatAddress(loc, "full"); const tel = ((shop.contact || {}).phone || {}).display;
    return clip(`${name}へのアクセス・営業時間。` + [addr, access, tel ? `電話 ${tel}` : ""].filter(Boolean).join("、") + "。", 120);
  }
  if (page.kind === "notFound") return `お探しのページは見つかりませんでした。${name}のトップページからお探しください。`;
  return clip(`${name}の${page.label}。${b.tagline || ""}`, 120);
}

// ---- 構造化データ（schema.org の LocalBusiness 系）----
// 業種の名前から型を選ぶ（和菓子・洋菓子・パン＝Bakery、カフェ・甘味処＝CafeOrCoffeeShop、料理店＝Restaurant、ほか＝LocalBusiness）
export function businessType(shop) {
  const g = (shop && shop.basic && shop.basic.genre) || {}; const d = String(g.detail || "");
  if (/菓子|パン|ベーカリー|ケーキ|焼き菓子|和菓子|洋菓子/.test(d)) return "Bakery";
  if (/カフェ|喫茶|甘味処|珈琲|コーヒー/.test(d)) return "CafeOrCoffeeShop";
  if (/料理|食堂|レストラン|割烹|居酒屋|寿司|そば|うどん|ラーメン|焼肉/.test(d) || g.template === "restaurant") return "Restaurant";
  return "LocalBusiness";
}
const DAY = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
// 24:00 を越える時刻（25:00 など）は翌日の時刻にする
const hhmm = (t) => { const a = String(t || "").split(":"); let h = +a[0]; if (!(h >= 0)) return null; if (h >= 24) h -= 24; return String(h).padStart(2, "0") + ":" + (a[1] || "00").padStart(2, "0"); };
export function openingHours(shop) {
  const w = (shop && shop.hours && shop.hours.weekly) || {}; const groups = new Map();
  for (const k of Object.keys(DAY)) {
    const d = w[k]; if (!d || d.status !== "open" || !Array.isArray(d.periods)) continue;
    for (const p of d.periods) { const o = hhmm(p.start), c = hhmm(p.end); if (!o || !c) continue; const key = o + "-" + c; if (!groups.has(key)) groups.set(key, { opens: o, closes: c, days: [] }); groups.get(key).days.push(DAY[k]); }
  }
  return [...groups.values()].map((g) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: g.days.map((d) => "https://schema.org/" + d), opens: g.opens, closes: g.closes }));
}
// 決まった休み（年末年始など）：公開した日から見て、次に来る（か今の）期間だけ出す（毎日の描き直しで次の年に移る）
export function specialClosures(shop, date) {
  const ex = (shop && shop.hours && shop.hours.exceptions) || {}; const out = [];
  const y = +date.slice(0, 4);
  for (const e of Object.values(ex)) {
    if (!e || e.status !== "closed") continue;
    let from, to;
    if (e.recurring && e.recurring.from && e.recurring.to) {
      for (const yy of [y - 1, y]) {
        const f = `${yy}-${e.recurring.from}`; const t = e.recurring.to < e.recurring.from ? `${yy + 1}-${e.recurring.to}` : `${yy}-${e.recurring.to}`;
        if (t >= date) { from = f; to = t; break; }
      }
    } else if (e.from && e.to) { from = e.from; to = e.to; }
    if (!from || to < date) continue;
    out.push({ "@type": "OpeningHoursSpecification", validFrom: from, validThrough: to, opens: "00:00", closes: "00:00" });
  }
  return out;
}
// 電話：0 で始まる国内の番号は +81 の形に
export function e164(display) { const t = String(display || "").trim(); if (!t) return ""; if (t[0] === "+") return t; return t[0] === "0" ? "+81-" + t.slice(1) : t; }

export function localBusiness(shop, ctx) {
  const b = (shop && shop.basic) || {}; const loc = (shop && shop.location) || {}; const st = storeOf(shop);
  const hide = !!loc.hideStreet;
  const street = [loc.town, hide ? "" : loc.street, hide ? "" : loc.building].filter(Boolean).join(hide ? "" : " ").trim();
  const o = { "@context": "https://schema.org", "@type": businessType(shop), name: b.name || "" };
  if (b.nameKana) o.alternateName = b.nameKana;
  if (b.tagline) o.description = b.tagline;
  o.url = ctx.origin + "/";
  if (ctx.image) o.image = ctx.image;
  const tel = e164(st.tel.display); if (tel) o.telephone = tel;
  if (st.mail) o.email = st.mail;
  if (loc.prefecture || loc.city || loc.town) o.address = { "@type": "PostalAddress", ...(loc.postalCode ? { postalCode: loc.postalCode } : {}), ...(loc.prefecture ? { addressRegion: loc.prefecture } : {}), ...(loc.city ? { addressLocality: loc.city } : {}), ...(street ? { streetAddress: street } : {}), addressCountry: "JP" };
  if (loc.geo && !hide && loc.geo.lat != null && loc.geo.lng != null) o.geo = { "@type": "GeoCoordinates", latitude: loc.geo.lat, longitude: loc.geo.lng };
  const map = mapHref(shop); if (map) o.hasMap = map;
  const oh = openingHours(shop); if (oh.length) o.openingHoursSpecification = oh;
  const sp = specialClosures(shop, ctx.date); if (sp.length) o.specialOpeningHoursSpecification = sp;
  const same = []; if (st.instagram) same.push("https://www.instagram.com/" + st.instagram + "/"); if (ctx.mikkeUrl) same.push(ctx.mikkeUrl); if (same.length) o.sameAs = same;
  if (shop && shop.story && shop.story.foundedYear) o.foundingDate = String(shop.story.foundedYear);
  return o;
}
// <script type="application/ld+json"> の中身。API の検査は「<」＋英字をどこでもタグとして読むので、< > & は \u で書く
export function jsonLdScript(obj) {
  const json = JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<script type="application/ld+json">${json}</script>`;
}

export function sitemapXml(origin, pages, date) {
  const urls = pages.map((p) => `  <url><loc>${esc(origin + p.slug)}</loc><lastmod>${date}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
export function robotsTxt(origin, noindex) {
  return noindex ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

// <head> の検索・共有の部分
export function headMeta({ title, description, canonical, og, siteName, noindex, isNotFound }) {
  const m = [];
  m.push(`<title>${esc(title)}</title>`);
  m.push(`<meta name="description" content="${esc(description)}">`);
  if (noindex || isNotFound) m.push(`<meta name="robots" content="noindex">`);
  if (!isNotFound) m.push(`<link rel="canonical" href="${esc(canonical)}">`);
  m.push(`<meta property="og:type" content="website">`);
  m.push(`<meta property="og:site_name" content="${esc(siteName)}">`);
  m.push(`<meta property="og:title" content="${esc(title)}">`);
  m.push(`<meta property="og:description" content="${esc(description)}">`);
  if (!isNotFound) m.push(`<meta property="og:url" content="${esc(canonical)}">`);
  m.push(`<meta property="og:locale" content="ja_JP">`);
  if (og) {
    m.push(`<meta property="og:image" content="${esc(og.url)}">`);
    if (og.width) m.push(`<meta property="og:image:width" content="${og.width}">`);
    if (og.height) m.push(`<meta property="og:image:height" content="${og.height}">`);
    if (og.alt) m.push(`<meta property="og:image:alt" content="${esc(og.alt)}">`);
    m.push(`<meta name="twitter:card" content="summary_large_image">`);
  } else m.push(`<meta name="twitter:card" content="summary">`);
  return m.join("\n");
}
