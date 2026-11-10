#!/usr/bin/env node
// 下見の見本（指示 0041・段1）：ギャラリーの架空のお店の書き出し（_preview/<型>/）を型にして、
// 実のお店の情報（名前・ジャンル・町・住所・電話・営業時間・Instagram）を差し込んだ軽い見本を作る。
// 使い方：node tools/quick-sample.mjs <入力の json> [--root 型の置き場（既定 C:/Users/sea_p/GitHub/_preview）] [--out 書き出し先の根（既定 --root と同じ）] [--id 12文字]
//   入力：{ "name", "genre", "town", "address", "phone"?, "hours"?, "closed"?, "access"?, "instagram"?, "nameEn"?, "template"? }
//   出力：<out>/q/<推測できない12文字>/ に index.html と assets/。標準出力に json（path・template など）
// 型の選び方と言葉は tools/quick-sample-map.json。共通の道具（build・*-gen・preview-export・gallery-export）は使わず、書き出し済みの HTML を読むだけ。
// 最後に自己検査：型のお店の名前・電話・住所・町・地図の位置・値段が残っていたら、書き出しを消して失敗で終わる。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadDefaultJapaneseParser } from "budoux";

const T0 = Date.now();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; if (!args[i + 1]) die(`${n} の後に値を指定してください`, 2); return args[i + 1]; };
function die(msg, code = 1) { console.error(msg); process.exit(code); }
const inputPath = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!inputPath) die("使い方: node tools/quick-sample.mjs <入力の json> [--root 型の置き場] [--out 書き出し先] [--id 12文字]", 2);
const ROOT = opt("--root", "C:/Users/sea_p/GitHub/_preview");
const OUT_ROOT = opt("--out", ROOT);

const input = JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
// 電話は任意（美容の店は一覧に電話の無い所が多い）。無ければ「お店に合わせて載せます」にし、電話のリンクは外す
for (const k of ["name", "genre", "town", "address"]) if (!String(input[k] || "").trim()) die(`入力に ${k} がありません`);
const MAP = JSON.parse(fs.readFileSync(path.join(HERE, "quick-sample-map.json"), "utf8"));
const C = MAP.common;
const gallery = JSON.parse(fs.readFileSync(path.join(REPO, "data", "gallery.json"), "utf8")).shops;

// ---- 型を選ぶ ----
const seed = crypto.createHash("sha256").update(input.name).digest().readUInt32BE(0);
const G = MAP.genres.find((g) => g.match.some((w) => input.genre.includes(w))) || MAP.genres.find((g) => g.key === "other");
const tplId = input.template || G.templates[seed % G.templates.length];
const tplShop = gallery.find((s) => s.id === tplId);
if (!tplShop) die(`型 ${tplId} が data/gallery.json にありません`);
const SRC = path.join(ROOT, tplShop.path);
if (!fs.existsSync(path.join(SRC, "index.html"))) die(`${SRC}/index.html がありません（先に preview-export で型を書き出してください）`);
const TS = JSON.parse(fs.readFileSync(path.join(REPO, "samples", tplId, "shop.json"), "utf8"));

// ---- 置き換える値 ----
const N = {
  name: input.name.trim(), nameEn: (input.nameEn || "").trim() || input.name.trim(), town: input.town.trim(),
  address: input.address.trim(), phone: String(input.phone || "").trim() || C.pending, digits: String(input.phone || "").replace(/\D/g, ""),
  hours: (input.hours || "").trim(), closed: (input.closed || "").trim(), access: (input.access || "").trim(),
  ig: String(input.instagram || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, ""),
};
const fill = (s) => s.replace(/\{town\}/g, N.town).replace(/\{label\}/g, G.label).replace(/\{name\}/g, N.name);
const L = TS.location || {};
const T = { name: TS.basic.name, kana: TS.basic.nameKana, town: L.town, phone: TS.contact?.phone?.display, digits: TS.contact?.phone?.digits,
  lat: L.geo?.lat != null ? String(L.geo.lat) : "", lng: L.geo?.lng != null ? String(L.geo.lng) : "", ig: TS.contact?.sns?.instagram || "" };
const addrVariants = [
  `${L.prefecture || ""}${L.city || ""}${L.town || ""}${L.street || ""}`, `${L.prefecture || ""}${L.city || ""} ${L.town || ""}${L.street || ""}`,
  `${L.city || ""}${L.town || ""}${L.street || ""}`, `${L.prefecture || ""}${L.city || ""}${L.town || ""}`, `${L.city || ""}${L.town || ""}`,
].filter((s) => s && L.town && s.includes(L.town));
const leakExtra = (MAP.templates[tplId]?.leak || []);
const inputBlob = Object.values(N).join(" ");
const leakTokens = [...new Set([T.name, T.kana, T.phone, T.digits, ...addrVariants, T.town, T.lat && `${T.lat},${T.lng}`, T.ig, ...leakExtra])]
  .filter((t) => t && t.length >= 2 && !inputBlob.includes(t));

// ---- 文を作る ----
const JA = /[\u3040-\u30ff\u4e00-\u9fff]/;
const PRICE = /([¥￥]\s?[\d,]+(\s?[〜~])?|[\d,]{2,}\s?円(\s?[〜~])?)(\s?[（(][^）)]{0,12}[）)])?/g;
const TIME = /\d{1,2}\s?[:：]\s?\d{2}/;
const LABELS = new Set(C.labels);
const sentences = (s) => s.match(/[^。]+。?/g) || [s];
// 同じ文をページの中で繰り返さない（使った文は覚えておく）。使える文が無ければ ""（呼ぶ側が元の文を残すか空にするかを決める）
const used = new Set();
function fit(pool, target, offset = 0) {
  const p = pool.map(fill).filter((s) => !used.has(s)), out = [];
  if (!p.length) return "";
  let len = 0;
  for (let i = 0; i < p.length; i++) {
    const s = p[(offset + i) % p.length];
    if (len + s.length <= target * 1.25 || !out.length && s.length <= target * 1.6) { out.push(s); len += s.length; }
    if (len >= target * 0.8) break;
  }
  if (!out.length) out.push(p.reduce((a, b) => (a.length <= b.length ? a : b)));
  out.forEach((s) => used.add(s));
  return out.join("");
}
const closest = (pool, target, offset = 0) => {
  const p = pool.map(fill).filter((s) => !used.has(s));
  if (!p.length) return "";
  const s = p.map((s, i) => [s, Math.abs(s.length - target) + ((i + offset) % p.length) * 0.01]).sort((a, b) => a[1] - b[1])[0][0];
  used.add(s);
  return s;
};
// 型の文のうち、お店ごとの事実（数・地名・人・年）を含む物。置き換える文が尽きたとき、これは空にし、それ以外は型の文を残す
const FACT = /[0-9０-９]|[一二三四五六七八九十百]+\s?(席|年|代|種|名|本|皿|品|軒|坪)|芦屋|町|駅|店主|主人|私|わたし|僕|創業|代目|生まれ|産の|から届|仕入れ先|一頭/;
const parser = loadDefaultJapaneseParser();
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const plain = (h) => unesc(h.replace(/<br\s*\/?>/g, "").replace(/<[^>]+>/g, "")).trim();
function render(text, nPara = 1) {
  let paras = [text];
  if (nPara > 1 && text.length > 60) {
    const ss = sentences(text), per = Math.ceil(ss.length / nPara);
    paras = [];
    for (let i = 0; i < ss.length; i += per) paras.push(ss.slice(i, i + per).join(""));
  }
  return paras.filter(Boolean).map((p) => `<span class="pg">${JA.test(p) ? parser.parse(p).map((c) => `<span>${esc(c)}</span>`).join("<wbr>") : `<span>${esc(p)}</span>`}</span>`).join("");
}

// ---- HTML を読む ----
let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
const bodyAt = html.indexOf("<body");
let head = html.slice(0, bodyAt), body = html.slice(bodyAt);

const secMarks = [...body.matchAll(/<(section|header|footer)\b[^>]*data-sec="([^"]+)"/g)].map((m) => ({ at: m.index, sec: m[2] }));
const secOf = (at) => { let s = ""; for (const m of secMarks) { if (m.at <= at) s = m.sec; else break; } return s; };
// 文字の要素（data-el・カードの中の data-cel のどちらも）。外側が span の要素は中の span と区別できないので扱わない
const EL = /<(p|a|h[1-6]|div|li|dt|dd)\b([^>]*\bclass="el el-text[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g;
const els = [...body.matchAll(EL)].map((m) => ({ at: m.index, len: m[0].length, tag: m[1], attrs: m[2], id: (m[2].match(/data-c?el="([^"]+)"/) || [])[1] || "", inner: m[3], t: plain(m[3]), sec: secOf(m.index), nPara: (m[3].match(/class="pg"/g) || []).length || 1 }));

// お品書きの段＝値段のある段と、型のお店の品の名前（shop.json の catalog）が出てくる段
const itemNames = new Set(Object.values(TS.catalog?.items || {}).map((i) => i.name).filter(Boolean));
const menuSecs = [...new Set(els.filter((e) => (e.t.match(PRICE) || []).length || itemNames.has(e.t)).map((e) => e.sec))].filter((s) => !/footer|header|info|access|about|greet|concept|story|intro/.test(s));
const firstSec = secMarks.find((m) => !/header|topbar|nav/.test(m.sec))?.sec;
const isProse = (e) => JA.test(e.t) && (e.t.includes("。") || (e.t.length >= 16 && e.t.includes("、")));
// 表紙の一言：最初の段の、日本語の短い文（見出しの要素を先に）
const coverCands = els.filter((e) => e.sec === firstSec && JA.test(e.t) && e.t.length >= 6 && e.t.length <= 40 && !TIME.test(e.t) && !e.t.match(PRICE)
  && !e.t.includes(T.name) && !/駅|徒歩|席|定休|曜/.test(e.t) && /[、。を]/.test(e.t));
const cover = coverCands.find((e) => /^h[12]$/.test(e.tag)) || coverCands[0];
// 紹介文：お品書きでない段の、いちばん長い説明文（about・greeting などを先に）
const introCands = els.filter((e) => e !== cover && e.sec !== firstSec && !menuSecs.includes(e.sec) && isProse(e) && e.t.length >= 30 && !/footer|info|access/.test(e.sec));
const introPref = introCands.filter((e) => /about|greet|concept|story|intro|salon|cafe|stand/.test(e.sec));
const intro = (introPref.length ? introPref : introCands).sort((a, b) => b.t.length - a.t.length)[0];

// 名前・住所・電話・町の置き換え（長い物から）。文字の要素の中（文節で区切られている）と、HTML 全体（属性など）の両方に使う
const swaps = [
  ...addrVariants.map((a) => [a, N.address]),
  [T.name, N.name], [T.kana, ""], [T.phone, N.phone], [T.digits, N.digits], [T.town, N.town],
].filter(([a]) => a).sort((a, b) => b[0].length - a[0].length);
const jaLeak = leakExtra.filter((k) => JA.test(k)).sort((a, b) => b.length - a.length);
const applySwaps = (t) => { for (const [a, b] of swaps) t = t.split(a).join(b); for (const k of jaLeak) t = t.split(k).join(N.name + (k.endsWith("の") ? "の" : "")); return t; };
const words = Object.entries(G.words || {}).sort((a, b) => b[0].length - a[0].length);
const applyWords = (s) => { for (const [a, b] of words) s = s.split(a).join(b); return s; };
const hoursSeen = new Set();
let itemIdx = 0, proseIdx = seed % 4, headIdx = seed % 2;
const stats = { cover: cover?.id || null, intro: intro?.id || null, prose: 0, prices: 0, hours: 0, facts: 0, items: 0, menuSecs };

function decide(e) {
  const t = e.t;
  const latin = !JA.test(t);
  if (!t) return null;
  if (e === cover) return { text: closest(G.cover, t.length, seed) };
  if (e === intro) {
    const head = G.intro.map(fill).join("");
    return { text: head + (t.length > head.length * 1.3 ? fit(G.prose, t.length - head.length, proseIdx++) : ""), nPara: e.nPara };
  }
  if (LABELS.has(t)) return null;
  // 住所と交通がひとつの要素に入っている
  if (T.town && t.includes(T.town) && /駅|徒歩/.test(t)) { stats.facts++; return { text: N.address }; }
  if (TIME.test(t)) {
    stats.hours++;
    if (hoursSeen.has(e.sec)) return { text: "" };
    hoursSeen.add(e.sec);
    return { text: N.hours ? N.hours + (N.closed && /定休|休/.test(t) ? `　${N.closed}` : "") : C.hoursPending };
  }
  if (t.match(PRICE)) {
    stats.prices++;
    const rest = t.replace(PRICE, "").trim();
    if (!rest || /^[\s〜~・\/／+＋\-–:：]*$/.test(rest) || rest.length <= 2) return { text: "" };
    return { text: rest.replace(/\s{2,}/g, " ") };
  }
  if (latin) {
    if (/\d/.test(t) && /seat|closed|since|min|walk|open|est\.?/i.test(t)) { stats.facts++; return { text: "" }; }
    if (t.includes(T.name)) return { text: t.split(T.name).join(N.nameEn) };
    const hit = leakExtra.find((k) => t.toLowerCase().includes(k.toLowerCase()));
    if (hit) return { text: hit.length >= t.length * 0.4 ? N.nameEn : t.replace(new RegExp(hit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), N.nameEn) };
    return words.length ? { text: applyWords(t) } : null;
  }
  if (/駅|徒歩/.test(t)) { stats.facts++; return { text: N.access || C.accessPending }; }
  if (/創業|昭和|平成|代目/.test(t)) { stats.facts++; return { text: `${N.town}の${G.label}` }; }
  if (!/^h[1-6]$/.test(e.tag) && (/[0-9０-９一二三四五六七八九十]+\s?席|カウンター|テーブル|個室|予約制|駐車/.test(t)) && !isProse(e)) { stats.facts++; return { text: C.pending }; }
  if (/定休|休業|[月火水木金土日]曜/.test(t) && !isProse(e) && t.length <= 24) { stats.facts++; return { text: N.closed || C.pending }; }
  if (menuSecs.includes(e.sec)) {
    if (/税|値段|価格|サービス料|料金/.test(t)) return { text: "" };
    if (G.fallback) {
      if (isProse(e)) { stats.prose++; return { text: fit(G.prose, t.length, proseIdx++) }; }
      if (!/^h[1-3]$/.test(e.tag) && t.length >= 2 && t.length <= 18 && G.items) { stats.items++; return { text: G.items[itemIdx++ % G.items.length] }; }
    }
    return words.length ? { text: applyWords(t) } : null;
  }
  if (isProse(e)) {
    stats.prose++;
    const r = /^h[1-6]$/.test(e.tag) || (!t.includes("。") && t.length <= 24) ? closest(G.heads, t.length, headIdx++) : fit(G.prose, t.length, proseIdx++);
    if (r) return { text: r, nPara: e.nPara };
    // 置き換える文が尽きた：事実を含む文と、言葉を変える型（美容室など）の文は空に。それ以外は型の文を残す
    if (FACT.test(t) || G.fallback || jaLeak.some((k) => t.includes(k))) { stats.emptied = (stats.emptied || 0) + 1; return { text: "" }; }
    stats.kept = (stats.kept || 0) + 1;
    return words.length ? { text: applyWords(t) } : null;
  }
  return words.length ? { text: applyWords(t) } : null;
}

// 後ろから置き換える（位置がずれないように）
for (const e of [...els].reverse()) {
  let d = decide(e);
  if (!d) { const sw = applySwaps(e.t); if (sw === e.t) continue; d = { text: sw, nPara: e.nPara }; }
  else d.text = applySwaps(d.text);
  let inner = render(d.text, d.nPara || 1);
  const link = e.inner.match(/^(<a\b[^>]*>)[\s\S]*(<\/a>)$/);
  if (link) inner = link[1] + inner + link[2];
  const tag = `<${e.tag}${e.attrs}>${inner}</${e.tag}>`;
  body = body.slice(0, e.at) + tag + body.slice(e.at + e.len);
}

// 写真の説明：言葉を変える型（美容室など）は料理の説明を外す
if (G.fallback) body = body.replace(/(<img\b[^>]*\balt=")[^"]*"/g, `$1見本の仮の写真"`);

// 電話の無い店：電話のリンクを外す（型の番号の置き換えより先に）
if (!N.digits) body = body.replace(/href="tel:[^"]*"/g, 'href="#top"');
for (const [a, b] of swaps) body = body.split(a).join(b);
// 文字の要素の外の文（メニューの開閉の中のリンクなど）にも型の名前の一部が残るので、地の文だけ置き換える
body = body.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/).map((part, i) => (i % 2 ? part : part.replace(/>([^<]+)</g, (m, t) => `>${esc(applySwaps(unesc(t)))}<`))).join("");
// 地図の検索のリンク（型の住所と店名が入っている）
body = body.replace(/(https:\/\/www\.google\.com\/maps\/search\/\?api=1&(?:amp;)?query=)[^"]*/g, `$1${encodeURIComponent(N.address)}`);
// 地図：位置（緯度,経度）を住所の検索に
if (T.lat) body = body.split(`${T.lat},${T.lng}`).join(encodeURIComponent(N.address));
body = body.replace(/(https:\/\/(?:www\.|maps\.)?google\.com\/maps\?q=)[^&"]+/g, `$1${encodeURIComponent(N.address)}`);
// Instagram
let igDone = false;
body = body.replace(/https?:\/\/(www\.)?instagram\.com\/[^"]*/g, () => { igDone = true; return N.ig ? `https://www.instagram.com/${N.ig}/` : "#"; });
// 型の「架空のお店」の注記を、この見本の注記に
body = body.replace(/(<p class="demo-note"[^>]*>)[^<]*(<\/p>)/g, `$1${esc(C.banner)}$2`);
// 上の帯
body = body.replace(/^<body([^>]*)>/, `<body$1>\n<div class="qs-banner" role="note">${esc(C.banner)}</div>`);
// 品書きの上の一文（最初のお品書きの段の上端。段の高さに足して、中身を押し下げる）
if (menuSecs.length) {
  const re = new RegExp(`(<section\\b[^>]*data-sec="${menuSecs[0]}"[^>]*?)(\\sstyle="([^"]*)")?>`);
  body = body.replace(re, (m, open, _s, st) => `${open} style="${st ? st + ";" : ""}box-sizing:content-box;padding-top:48px"><p class="qs-menu-note">${esc(C.menuNote)}</p>`);
}
// Instagram の入れる所が型に無いとき：フッターの下に1行
if (N.ig && !igDone) {
  body = body.replace(/<\/footer>/, `<p class="qs-ig"><a href="https://www.instagram.com/${esc(N.ig)}/" target="_blank" rel="noopener">Instagram @${esc(N.ig)}</a></p></footer>`);
  body = body.replace(/(<footer\b[^>]*?)(\sstyle="([^"]*)")?>/, (m, open, _s, st) => `${open} style="${st ? st + ";" : ""}box-sizing:content-box;padding-bottom:44px">`);
}

// head：題・検索よけ・共有の情報
head = head.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(N.name)}（ホームページの見本）</title>`)
  .replace(/<meta\s+(?:name="(?:robots|description)"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/g, "")
  .replace(/<link\s+rel="canonical"[^>]*>\s*/g, "")
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, "");
for (const [a, b] of swaps) head = head.split(a).join(b);
const CSS = `<style>
.qs-banner{position:relative;z-index:10000;padding:5px 12px;background:#2B2926;color:#F4F1EA;font:12px/1.5 "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif;letter-spacing:.06em;text-align:center}
.qs-menu-note{position:absolute;top:12px;left:0;right:0;z-index:20;margin:0 auto;width:max-content;max-width:calc(100% - 32px);padding:4px 14px;background:rgba(255,255,255,.88);color:#2B2926;font:13px/1.6 "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif;letter-spacing:.04em;text-align:center;border-radius:2px}
.qs-ig{position:absolute;bottom:12px;left:0;right:0;z-index:20;text-align:center;font:13px/1.6 "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif}
.qs-ig a{display:inline-block;padding:2px 12px;background:rgba(255,255,255,.88);color:#2B2926;text-decoration:underline}
</style>`;
head = head.replace(/<meta charset="utf-8">/, `<meta charset="utf-8">\n<meta name="robots" content="noindex,nofollow">`).replace("</head>", `${CSS}\n</head>`);
if (!head.includes('content="noindex,nofollow"')) head = head.replace("<head>", `<head>\n<meta name="robots" content="noindex,nofollow">`);
const outHtml = head + body;

// ---- 書き出し ----
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function newId() { let s = ""; while (s.length < 12) for (const b of crypto.randomBytes(16)) { if (b < 248 && s.length < 12) s += B62[b % 62]; } return s; }
const qRoot = path.join(OUT_ROOT, "q");
let id = opt("--id", null);
if (id && !/^[0-9A-Za-z]{12}$/.test(id)) die("--id は英数字12文字にしてください", 2);
if (!id) do { id = newId(); } while (fs.existsSync(path.join(qRoot, id)));
const OUT = path.join(qRoot, id);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
// 写すのは写真（assets/）だけ。型の下のページ（menu/・contact/ など）は架空のお店の文が残るので写さず、そこへのリンクは外す
fs.cpSync(path.join(SRC, "assets"), path.join(OUT, "assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), outHtml.replace(/href="(?!#|https?:|tel:|mailto:|assets\/)[^"]*"/g, 'href="#top"'));

// ---- 自己検査 ----
const problems = [];
const files = fs.readdirSync(OUT, { recursive: true }).filter((f) => /\.(html|json|txt|xml|webmanifest)$/.test(f));
for (const f of files) {
  const h = fs.readFileSync(path.join(OUT, f), "utf8");
  const visible = unesc(h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, ""));
  const attrs = [...h.matchAll(/\s(?:alt|title|href|src|content|aria-label)="([^"]*)"/g)].map((m) => unesc(m[1])).filter((v) => !v.startsWith("#")).join("\n");
  const scripts = [...h.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => m[0]).join("\n");
  const hay = visible + "\n" + attrs + "\n" + scripts + "\n" + (h.match(/<title>[\s\S]*?<\/title>/)?.[0] || "");
  for (const tok of leakTokens) {
    const hit = /^[\x00-\x7F]+$/.test(tok) ? hay.toLowerCase().includes(tok.toLowerCase()) : hay.includes(tok);
    if (hit) problems.push(`${f}：型のお店の「${tok}」が残っています`);
  }
  if (f === "index.html") {
    const prices = visible.match(PRICE);
    if (prices) problems.push(`index.html：値段が残っています（${[...new Set(prices)].slice(0, 5).join("・")}）`);
    if (!/<meta name="robots" content="noindex,nofollow">/.test(h)) problems.push("index.html：robots の noindex がありません");
    if (!h.includes(C.banner)) problems.push("index.html：上の帯がありません");
    if (menuSecs.length && !h.includes(C.menuNote)) problems.push("index.html：品書きの上の一文がありません");
    if (N.digits && !h.includes(`tel:${N.digits}`) && /href="tel:/.test(fs.readFileSync(path.join(SRC, "index.html"), "utf8"))) problems.push("index.html：電話のリンクが差し替わっていません");
    if (!visible.includes(N.name)) problems.push("index.html：店名が入っていません");
    if (!h.includes(encodeURIComponent(N.address)) && /maps\?q=/.test(fs.readFileSync(path.join(SRC, "index.html"), "utf8"))) problems.push("index.html：地図が差し替わっていません");
  }
}
const seconds = Math.round((Date.now() - T0) / 100) / 10;
if (problems.length) {
  if (!process.env.QS_KEEP) fs.rmSync(OUT, { recursive: true, force: true });
  console.error(JSON.stringify({ ok: false, template: tplId, problems }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, path: `/q/${id}/`, id, dir: OUT, template: tplId, templateName: tplShop.name, genreKey: G.key, fallback: !!G.fallback, seconds, replaced: stats }, null, 2));
