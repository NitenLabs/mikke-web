#!/usr/bin/env node
// 下見の見本（指示 0041・0041-add）：ギャラリーの架空のお店の書き出し（_preview/<型>/）を型にして、
// 実のお店の情報（名前・ジャンル・町・住所・電話・営業時間・Instagram）を差し込んだ軽い見本を作る。
// 使い方：node tools/quick-sample.mjs <入力の json> [--root 型の置き場（既定 C:/Users/sea_p/GitHub/_preview）] [--out 書き出し先の根（既定 --root と同じ）] [--id 12文字]
//         node tools/quick-sample.mjs --check-map [--root …]   … 型の表（色の組の明暗差・書体・入れ替える段）を全部確かめる
//   入力：{ "name", "genre", "town", "address", "phone"?, "hours"?, "closed"?, "access"?, "instagram"?, "nameEn"?, "template"? }
//   出力：<out>/q/<推測できない12文字>/ に index.html と assets/。<out>/q/index.json に記録。標準出力に json（path・template・variation など）
// 型の選び方・揺らぎ・言葉は tools/quick-sample-map.json。共通の道具（build・*-gen・preview-export・gallery-export）は使わず、書き出し済みの HTML を読むだけ。
// 揺らぎ（色の組・書体の組・段の並び・表紙の写真の切り抜き）は店名＋住所の hash で決まる。同じ店（店名＋住所）は記録の id・型・揺らぎを使い直す。
// 新しい店は、同じ町・同じジャンルの記録にある型と、直近の型＋揺らぎを避ける。
// 最後に自己検査：型のお店の名前・電話・住所・町・地図の位置・値段・型の作った事実が残っていないか、揺らぎが入ったか。駄目なら書き出しを消して失敗で終わる。
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
const ROOT = opt("--root", "C:/Users/sea_p/GitHub/_preview");
const OUT_ROOT = opt("--out", ROOT);
const MAP = JSON.parse(fs.readFileSync(path.join(HERE, "quick-sample-map.json"), "utf8"));
const C = MAP.common;
const gallery = JSON.parse(fs.readFileSync(path.join(REPO, "data", "gallery.json"), "utf8")).shops;

// ---- 色の明暗差（WCAG） ----
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = hex2rgb(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rootVars = (html, prefix) => Object.fromEntries([...((html.match(/:root\s*\{([^}]*)\}/) || [])[1] || "").matchAll(new RegExp(`--${prefix}-([\\w]+)\\s*:\\s*([^;]+);`, "g"))].map((m) => [m[1], m[2].trim()]));
// 色の組を当てた後の役ごとの色（同じ色の値を持つ役は一緒に変わる）
function paletteHexMap(baseC, set) {
  const map = {};
  for (const [role, to] of Object.entries(set || {})) { const from = (baseC[role] || "").toUpperCase(); if (/^#[0-9A-F]{6}$/.test(from) && !map[from]) map[from] = to.toUpperCase(); }
  return map;
}
function contrastProblems(baseC, set) {
  const hm = paletteHexMap(baseC, set), eff = (r) => { const v = (baseC[r] || "").toUpperCase(); return hm[v] || v; }, out = [];
  for (const [f, b] of C.contrastPairs) {
    if (!/^#[0-9A-F]{6}$/i.test(baseC[f] || "") || !/^#[0-9A-F]{6}$/i.test(baseC[b] || "")) continue;
    const o = contrast(baseC[f], baseC[b]); if (o < 3) continue;
    const need = o >= 4.5 ? 4.5 : 3, now = contrast(eff(f), eff(b));
    if (now < need) out.push(`${f}/${b} ${now.toFixed(2)}（${need} 以上が要る。元 ${o.toFixed(2)}）`);
  }
  return out;
}
const tplHtml = (id) => { const s = gallery.find((x) => x.id === id); return s && fs.existsSync(path.join(ROOT, s.path, "index.html")) ? fs.readFileSync(path.join(ROOT, s.path, "index.html"), "utf8") : null; };
const secOrder = (h) => [...h.matchAll(/<(section|header|footer)\b[^>]*data-sec="([^"]+)"/g)].map((m) => m[2]);
const nVar = (t) => ({ palette: t.palettes?.length || 1, font: t.fonts?.length || 1, order: 1 + (t.swap?.length || 0), crop: C.crops.length });

// ---- 型の表を全部確かめる ----
if (args.includes("--check-map")) {
  const problems = [], rows = [];
  for (const [id, t] of Object.entries(MAP.templates)) {
    const h = tplHtml(id);
    if (!h) { problems.push(`${id}：_preview に型がありません`); continue; }
    const baseC = rootVars(h, "c"), order = secOrder(h), n = nVar(t);
    t.palettes.forEach((p, i) => { for (const x of contrastProblems(baseC, p.set)) problems.push(`${id} 色の組 ${i}（${p.name}）：${x}`); for (const r of Object.keys(p.set)) if (!baseC[r]) problems.push(`${id} 色の組 ${i}：型に --c-${r} がありません`); });
    t.fonts.slice(1).forEach((f, i) => { for (const fam of [...f.heading, ...f.body]) if (!(fam in C.fonts)) problems.push(`${id} 書体の組 ${i + 1}：${fam} は common.fonts にありません`); });
    (t.swap || []).forEach(([a, b]) => { const ia = order.indexOf(a), ib = order.indexOf(b); if (ia < 0 || ib !== ia + 1) problems.push(`${id}：段 ${a} と ${b} が隣り合っていません`); });
    if (!order.includes(t.cover)) problems.push(`${id}：表紙の段 ${t.cover} がありません`);
    for (const k of ["genres", "also", "fallbackFor"]) for (const g of t[k] || []) if (!MAP.genres.some((x) => x.key === g)) problems.push(`${id}：${k} のジャンル ${g} が genres にありません`);
    rows.push(`${id}\t色 ${n.palette}・書体 ${n.font}・並び ${n.order}・写真 ${n.crop}\t= ${n.palette * n.font * n.order * n.crop} 通り`);
  }
  for (const g of MAP.genres) if (!Object.values(MAP.templates).some((t) => [...t.genres, ...(t.also || []), ...(t.fallbackFor || [])].includes(g.key))) problems.push(`ジャンル ${g.key} に型がありません`);
  console.log(rows.join("\n"));
  if (problems.length) die(problems.join("\n"));
  console.log("型の表：問題なし");
  process.exit(0);
}

const inputPath = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!inputPath) die("使い方: node tools/quick-sample.mjs <入力の json> [--root 型の置き場] [--out 書き出し先] [--id 12文字]", 2);
const input = JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
// 電話は任意（美容の店は一覧に電話の無い所が多い）。無ければ電話の文とボタンを隠す
for (const k of ["name", "genre", "town", "address"]) if (!String(input[k] || "").trim()) die(`入力に ${k} がありません`);

// ---- 記録（q/index.json） ----
const qRoot = path.join(OUT_ROOT, "q");
const IDX = path.join(qRoot, "index.json");
const index = fs.existsSync(IDX) ? JSON.parse(fs.readFileSync(IDX, "utf8")) : { entries: [] };
const norm = (s) => String(s || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const shopKey = `${norm(input.name)}|${norm(input.address)}`;
const prev = index.entries.find((e) => e.key === shopKey);
const others = index.entries.filter((e) => e.key !== shopKey);

// ---- 型と揺らぎを選ぶ ----
const H = crypto.createHash("sha256").update(`${input.name.trim()}\n${input.address.trim()}`).digest();
const seed = H.readUInt32BE(0);
const hashOf = (s) => crypto.createHash("sha256").update(s).digest().readUInt32BE(0);
const G = MAP.genres.find((g) => g.match.some((w) => input.genre.includes(w))) || MAP.genres.find((g) => g.key === "other");
function candidates(key) {
  const tiers = G.fallback ? ["fallbackFor"] : ["genres", "also", "fallbackFor"];
  const out = [];
  for (const f of tiers) {
    const ids = Object.keys(MAP.templates).filter((id) => (MAP.templates[id][f] || []).includes(key) && !out.includes(id));
    out.push(...ids.sort((a, b) => hashOf(H.toString("hex") + a) - hashOf(H.toString("hex") + b)));
  }
  return out.length ? out : candidates("other");
}
const comboKey = (t, v) => `${t}|${v.palette}|${v.font}`;
function variations(t) {
  const n = nVar(MAP.templates[t]), p0 = H[4] % n.palette, f0 = H[5] % n.font, o0 = H[6] % n.order, c0 = H[7] % n.crop, out = [];
  for (let k = 0; k < n.palette * n.font; k++) out.push({ palette: (p0 + k) % n.palette, font: (f0 + Math.floor(k / n.palette) + k) % n.font, order: (o0 + k) % n.order, crop: (c0 + k) % n.crop });
  return out;
}
let tplId, V, pickNote = "first";
if (prev && (!input.template || input.template === prev.template)) {
  tplId = prev.template; V = prev.variation; pickNote = "reused";
} else {
  const sameTG = others.filter((e) => norm(e.town) === norm(input.town) && e.genreKey === G.key);
  const recent = new Set(others.slice(-(C.recentWindow || 12)).map((e) => comboKey(e.template, e.variation)));
  const usedTG = new Set(sameTG.map((e) => comboKey(e.template, e.variation)));
  const tpls = input.template ? [input.template] : candidates(G.key);
  const passes = [
    (t, v) => !sameTG.some((e) => e.template === t) && !recent.has(comboKey(t, v)),
    // 型が同じになるときは、色の組と書体の組の両方を、同じ町・同じジャンルの店と変える
    (t, v) => !sameTG.some((e) => e.template === t && (e.variation.palette === v.palette || e.variation.font === v.font)) && !recent.has(comboKey(t, v)),
    (t, v) => !usedTG.has(comboKey(t, v)) && !recent.has(comboKey(t, v)),
    (t, v) => !usedTG.has(comboKey(t, v)),
  ];
  outer: for (const ok of passes) for (const t of tpls) { if (!MAP.templates[t]) break; for (const v of variations(t)) if (ok(t, v)) { tplId = t; V = v; break outer; } }
  if (!tplId) { tplId = tpls[0]; V = MAP.templates[tplId] ? variations(tplId)[0] : null; pickNote = "repeat"; }
  else if (tplId !== tpls[0] || comboKey(tplId, V) !== comboKey(tpls[0], variations(tpls[0])[0])) pickNote = "next";
}
const TT = MAP.templates[tplId];
if (!TT) die(`型 ${tplId} が quick-sample-map.json の templates にありません`);
const NV = nVar(TT);
V = { palette: V.palette % NV.palette, font: V.font % NV.font, order: V.order % NV.order, crop: V.crop % NV.crop };
const tplShop = gallery.find((s) => s.id === tplId);
if (!tplShop) die(`型 ${tplId} が data/gallery.json にありません`);
const SRC = path.join(ROOT, tplShop.path);
if (!fs.existsSync(path.join(SRC, "index.html"))) die(`${SRC}/index.html がありません（先に preview-export で型を書き出してください）`);
const TS = JSON.parse(fs.readFileSync(path.join(REPO, "samples", tplId, "shop.json"), "utf8"));
const SRC_HTML = fs.readFileSync(path.join(SRC, "index.html"), "utf8");

// ---- 置き換える値 ----
const N = {
  name: input.name.trim(), nameEn: (input.nameEn || "").trim(), town: input.town.trim(),
  address: input.address.trim(), phone: String(input.phone || "").trim(), digits: String(input.phone || "").replace(/\D/g, ""),
  hours: (input.hours || "").trim(), closed: (input.closed || "").trim(), access: (input.access || "").trim(),
  ig: String(input.instagram || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, ""),
};
const noPhone = !N.digits;
const fill = (s) => s.replace(/\{town\}/g, N.town).replace(/\{label\}/g, G.label).replace(/\{name\}/g, N.name);
const L = TS.location || {};
const T = { name: TS.basic.name, kana: TS.basic.nameKana, town: L.town, phone: TS.contact?.phone?.display, digits: TS.contact?.phone?.digits,
  lat: L.geo?.lat != null ? String(L.geo.lat) : "", lng: L.geo?.lng != null ? String(L.geo.lng) : "", ig: TS.contact?.sns?.instagram || "" };
const addrVariants = [
  `${L.prefecture || ""}${L.city || ""}${L.town || ""}${L.street || ""}`, `${L.prefecture || ""}${L.city || ""} ${L.town || ""}${L.street || ""}`,
  `${L.city || ""}${L.town || ""}${L.street || ""}`, `${L.prefecture || ""}${L.city || ""}${L.town || ""}`, `${L.city || ""}${L.town || ""}`,
].filter((s) => s && L.town && s.includes(L.town));
const leakExtra = (TT.leak || []);
const REPL = (TT.replace || []);
const inputBlob = Object.values(N).join(" ");
const leakTokens = [...new Set([T.name, T.kana, T.phone, T.digits, ...addrVariants, T.town, T.lat && `${T.lat},${T.lng}`, T.ig, ...leakExtra])]
  .filter((t) => t && t.length >= 2 && !inputBlob.includes(t));

// ---- 文を作る ----
const JA = /[\u3040-\u30ff\u4e00-\u9fff]/;
const PRICE = /([¥￥]\s?[\d,]+(\s?[〜~])?|[\d,]{2,}\s?円(\s?[〜~])?)(\s?[（(][^）)]{0,12}[）)])?/g;
const TIME = /\d{1,2}\s?[:：]\s?\d{2}/;
const LABELS = new Set(C.labels);
const sentences = (s) => s.match(/[^。]+。?/g) || [s];
// 電話の無い店では、電話の出てくる文を使わない
const okSentence = (s) => !noPhone || !s.includes("電話");
// 同じ文をページの中で繰り返さない（使った文は覚えておく）。使える文が無ければ ""（呼ぶ側が元の文を残すか空にするかを決める）
const used = new Set();
function fit(pool, target, offset = 0) {
  const p = pool.map(fill).filter((s) => !used.has(s) && okSentence(s)), out = [];
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
  const p = pool.map(fill).filter((s) => !used.has(s) && okSentence(s));
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
// 「お店に合わせて載せます」を何度も並べない：最初の1回だけ長い言い方、後は短い言い方
// ヘッダーとフッターの小さな所は空にする（ご案内の段に同じ項目がある）
let pendN = 0;
const pend = (e) => (e && /header|footer/.test(e.sec) ? "" : ++pendN === 1 ? C.pending : C.pendingShort);

// ---- HTML を読む ----
let html = SRC_HTML;
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
// 店名が「天ぷら 桜人」のようにジャンルの語で始まると、型の「天ぷら　杜若」が「天ぷら　天ぷら 桜人」になる。重なった頭の語を落とす
const nameHead = N.name.split(/[\s　]+/)[0];
const dedupeName = (t) => (nameHead && nameHead !== N.name ? t.replace(new RegExp(`${nameHead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s　]*(?=${N.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "g"), "") : t);
const applySwaps = (t) => {
  for (const [a, b] of swaps) t = t.split(a).join(b);
  for (const k of jaLeak) t = t.split(k).join(N.name + (k.endsWith("の") ? "の" : ""));
  for (const [a, b] of REPL) t = t.split(a).join(b);
  return dedupeName(t);
};
const words = Object.entries(G.words || {}).sort((a, b) => b[0].length - a[0].length);
const applyWords = (s) => { for (const [a, b] of words) s = s.split(a).join(b); return s; };
// 日本語の店名が出てくる段（欧文の店名が無いとき、同じ段の欧文の店名の所は空にする＝店名が二重に並ばない）
const jaNameSecs = new Set(els.filter((e) => JA.test(e.t) && (e.t.includes(T.name) || jaLeak.some((k) => e.t.includes(k)))).map((e) => e.sec));
const hoursSeen = new Set();
let itemIdx = 0, proseIdx = H[8] % 4, headIdx = H[9] % 2;
const stats = { cover: cover?.id || null, intro: intro?.id || null, prose: 0, prices: 0, hours: 0, facts: 0, items: 0, hidden: 0, menuSecs };

function decide(e) {
  const orig = e.t;
  let t = orig;
  const latin = !JA.test(t);
  if (!t) return null;
  if (e === cover) return { text: closest(G.cover, t.length, seed) };
  if (e === intro) {
    const head = G.intro.map(fill).join("");
    return { text: head + (t.length > head.length * 1.3 ? fit(G.prose, t.length - head.length, proseIdx++) : ""), nPara: e.nPara };
  }
  if (LABELS.has(t)) return null;
  // 店名だけの要素が、同じ段の店名の入った要素のすぐ後に続く（型の飾りの二度書き）：置き換えると同じ店名が並ぶので空に
  if ((t === T.name || jaLeak.includes(t)) && N.name !== t) {
    const i = els.indexOf(e), p = els.slice(0, i).reverse().find((x) => x.t);
    if (p && p.sec === e.sec && (p.t.includes(T.name) || jaLeak.some((k) => p.t.includes(k)))) return { text: "" };
  }
  // 電話の無い店：番号の所は info の段だけ「載せます」、他（ヘッダー・フッター・ボタン）は隠す。電話の文は外す
  if (noPhone) {
    if (T.phone && t.includes(T.phone)) {
      const rest = t.split(T.phone).join("").replace(/(TEL|Tel|tel|電話)[\s.:：]*/g, "").trim();
      if (rest.length > 4) return { text: rest };
      return /info|access/.test(e.sec) ? { text: pend(e) } : { hide: true };
    }
    if (t.includes("電話")) {
      if (/^h[1-6]$/.test(e.tag)) return { text: C.noPhoneHead };
      if (!isProse(e) && t.length <= 16) return { hide: true };
      const kept = sentences(t).filter((s) => !s.includes("電話")).join("");
      if (!kept) return { text: "" };
      t = kept; e = { ...e, t };
    }
  }
  // 住所と交通がひとつの要素に入っている
  if (T.town && t.includes(T.town) && /駅|徒歩/.test(t)) { stats.facts++; return { text: N.address }; }
  if (TIME.test(t)) {
    stats.hours++;
    if (hoursSeen.has(e.sec)) return { text: "" };
    hoursSeen.add(e.sec);
    if (N.hours) return { text: N.hours + (N.closed && /定休|休/.test(t) ? `　${N.closed}` : "") };
    return { text: /header|footer/.test(e.sec) ? "" : ++pendN === 1 ? C.hoursPending : C.pendingShort };
  }
  if (t.match(PRICE)) {
    stats.prices++;
    const rest = t.replace(PRICE, "").trim();
    if (!rest || /^[\s〜~・\/／+＋\-–:：]*$/.test(rest) || rest.length <= 2) return { text: "" };
    return { text: rest.replace(/\s{2,}/g, " ") };
  }
  if (latin) {
    if (/\d/.test(t) && /seat|closed|since|min|walk|open|est\.?/i.test(t)) { stats.facts++; return { text: "" }; }
    const hit = leakExtra.find((k) => t.toLowerCase().includes(k.toLowerCase()));
    if (hit) {
      // 欧文の店名が無いとき：同じ段に日本語の店名があれば空に（二重に並ばない）、無ければ日本語の店名を入れる
      if (/^©/.test(t)) return { text: `© ${N.nameEn || N.name}` };
      if (!N.nameEn) return { text: jaNameSecs.has(e.sec) ? "" : N.name };
      return { text: hit.length >= t.length * 0.4 ? N.nameEn : t.replace(new RegExp(hit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), N.nameEn) };
    }
    return words.length ? { text: applyWords(t) } : null;
  }
  if (/駅|徒歩/.test(t)) { stats.facts++; return { text: N.access || C.accessPending }; }
  if (/創業|昭和|平成|代目/.test(t)) { stats.facts++; return { text: `${N.town}の${G.label}` }; }
  if (!/^h[1-6]$/.test(e.tag) && (/[0-9０-９一二三四五六七八九十]+\s?席|カウンター|テーブル|個室|予約制|駐車/.test(t)) && !isProse(e)) { stats.facts++; return { text: pend(e) }; }
  if (/定休|休業|[月火水木金土日]曜/.test(t) && !isProse(e) && t.length <= 24) { stats.facts++; return { text: N.closed || pend(e) }; }
  if (menuSecs.includes(e.sec)) {
    if (/税|値段|価格|サービス料|料金/.test(t)) return { text: "" };
    if (G.fallback) {
      if (isProse(e)) { stats.prose++; return { text: fit(G.prose, t.length, proseIdx++) }; }
      if (!/^h[1-3]$/.test(e.tag) && t.length >= 2 && t.length <= 18 && G.items) { stats.items++; return { text: G.items[itemIdx++ % G.items.length] }; }
    }
    return words.length ? { text: applyWords(t) } : (t !== orig ? { text: t } : null);
  }
  if (isProse(e)) {
    stats.prose++;
    const r = /^h[1-6]$/.test(e.tag) || (!t.includes("。") && t.length <= 24) ? closest(G.heads, t.length, headIdx++) : fit(G.prose, t.length, proseIdx++);
    if (r) return { text: r, nPara: e.nPara };
    // 置き換える文が尽きた：事実を含む文と、言葉を変える型（美容室など）の文は空に。それ以外は型の文を残す
    if (FACT.test(t) || G.fallback || jaLeak.some((k) => t.includes(k))) { stats.emptied = (stats.emptied || 0) + 1; return { text: "" }; }
    stats.kept = (stats.kept || 0) + 1;
    return words.length ? { text: applyWords(t) } : (t !== orig ? { text: t } : null);
  }
  return words.length ? { text: applyWords(t) } : (t !== orig ? { text: t } : null);
}

// 上から順に決め（「載せます」の数え方・文の使い回しを上から）、後ろから置き換える（位置がずれないように）
const decisions = els.map((e) => decide(e));
const hideIds = new Set();
for (let i = els.length - 1; i >= 0; i--) {
  const e = els[i];
  let d = decisions[i];
  if (d?.hide) { if (e.id) hideIds.add(e.id); stats.hidden++; d = { text: "" }; }
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

// 電話の無い店：電話のボタン（形の要素）を隠し、残る電話のリンクを外す（型の番号の置き換えより先に）
if (noPhone) {
  for (const m of body.matchAll(/<a\b[^>]*href="tel:[^"]*"[^>]*>/g)) { const id = (m[0].match(/data-c?el="([^"]+)"/) || [])[1]; if (id && /el-shape/.test(m[0])) { hideIds.add(id); stats.hidden++; } }
  body = body.replace(/href="tel:[^"]*"/g, 'href="#top"');
}
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

// ---- 揺らぎ：段の並び ----
function secBlock(h, sec) {
  const m = new RegExp(`<section\\b[^>]*data-sec="${sec}"`).exec(h);
  if (!m) return null;
  const re = /<section\b|<\/section>/g; re.lastIndex = m.index; let depth = 0, x;
  while ((x = re.exec(h))) { if (x[0] === "</section>") { if (--depth === 0) return { start: m.index, end: x.index + 10 }; } else depth++; }
  return null;
}
const srcOrder = secOrder(SRC_HTML);
let expectOrder = srcOrder;
if (V.order > 0) {
  const [a, b] = TT.swap[V.order - 1], A = secBlock(body, a), B = secBlock(body, b);
  if (A && B && A.end <= B.start && !body.slice(A.end, B.start).trim()) {
    body = body.slice(0, A.start) + body.slice(B.start, B.end) + body.slice(A.end, B.start) + body.slice(A.start, A.end) + body.slice(B.end);
    expectOrder = srcOrder.map((s) => (s === a ? b : s === b ? a : s));
  } else expectOrder = null; // 自己検査で落とす
}

// head：題・検索よけ・共有の情報
head = head.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(N.name)}（ホームページの見本）</title>`)
  .replace(/<meta\s+(?:name="(?:robots|description)"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/g, "")
  .replace(/<link\s+rel="canonical"[^>]*>\s*/g, "")
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, "");
for (const [a, b] of swaps) head = head.split(a).join(b);

// ---- 揺らぎ：色の組（型の :root の色の値を HTML 全体で置き換える） ----
const baseC = rootVars(SRC_HTML, "c"), baseF = rootVars(SRC_HTML, "f");
const PAL = TT.palettes[V.palette];
const hexMap = paletteHexMap(baseC, PAL.set);
const recolor = (s) => {
  if (!Object.keys(hexMap).length) return s;
  s = s.replace(/#[0-9A-Fa-f]{6}\b/g, (m) => hexMap[m.toUpperCase()] || m).replace(/%23([0-9A-Fa-f]{6})\b/g, (m, h) => (hexMap["#" + h.toUpperCase()] ? "%23" + hexMap["#" + h.toUpperCase()].slice(1) : m));
  for (const [from, to] of Object.entries(hexMap)) {
    const [r, g, b] = hex2rgb(from), [r2, g2, b2] = hex2rgb(to);
    s = s.replace(new RegExp(`(rgba?\\(\\s*)${r}(\\s*,\\s*)${g}(\\s*,\\s*)${b}(?=\\s*[,)])`, "g"), `$1${r2}$2${g2}$3${b2}`);
  }
  return s;
};
head = recolor(head); body = recolor(body);
// ---- 揺らぎ：書体の組・表紙の写真 ----
const FNT = TT.fonts[V.font], CROP = C.crops[V.crop];
const generic = (v) => (/(sans-serif|serif|cursive|monospace)\s*$/.exec(v || "") || [, "serif"])[1];
const famList = (fams, gen) => fams.map((f) => `"${f}"`).join(", ") + `, ${gen}`;
let varCss = "", fontLink = "";
if (V.font > 0) {
  varCss += `:root{--f-heading:${famList(FNT.heading, generic(baseF.heading))};--f-body:${famList(FNT.body, generic(baseF.body))}}`;
  const need = [...new Set([...FNT.heading, ...FNT.body])].filter((f) => !new RegExp(`family=${f.replace(/ /g, "\\+")}(?=[:&"])`).test(SRC_HTML));
  if (need.length) fontLink = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${need.map((f) => `family=${f.replace(/ /g, "+")}${C.fonts[f] ? ":" + C.fonts[f] : ""}`).join("&amp;")}&amp;display=swap" data-qs-font>`;
}
if (V.crop > 0) varCss += `[data-sec="${TT.cover}"] .el-photo{overflow:hidden}[data-sec="${TT.cover}"] .el-photo img{object-position:${CROP.pos}!important;scale:${CROP.scale};transform-origin:${CROP.pos}}`;
if (hideIds.size) varCss += [...hideIds].map((id) => `[data-el="${id}"],[data-cel="${id}"]`).join(",") + "{display:none!important}";
const vTag = `p${V.palette} f${V.font} o${V.order} c${V.crop}`;
const CSS = `<style>
.qs-banner{position:relative;z-index:10000;padding:5px 12px;background:#2B2926;color:#F4F1EA;font:12px/1.5 "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif;letter-spacing:.06em;text-align:center}
.qs-menu-note{position:absolute;top:12px;left:0;right:0;z-index:20;margin:0 auto;width:max-content;max-width:calc(100% - 32px);padding:4px 14px;background:rgba(255,255,255,.88);color:#2B2926;font:13px/1.6 "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif;letter-spacing:.04em;text-align:center;border-radius:2px}
.qs-ig{position:absolute;bottom:12px;left:0;right:0;z-index:20;text-align:center;font:13px/1.6 "Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif}
.qs-ig a{display:inline-block;padding:2px 12px;background:rgba(255,255,255,.88);color:#2B2926;text-decoration:underline}
</style>
${fontLink}<style data-qs-variation="${vTag}">${varCss}</style>`;
head = head.replace(/<meta charset="utf-8">/, `<meta charset="utf-8">\n<meta name="robots" content="noindex,nofollow">`).replace("</head>", `${CSS}\n</head>`);
if (!head.includes('content="noindex,nofollow"')) head = head.replace("<head>", `<head>\n<meta name="robots" content="noindex,nofollow">`);
const outHtml = head + body;

// ---- 書き出し ----
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function newId() { let s = ""; while (s.length < 12) for (const b of crypto.randomBytes(16)) { if (b < 248 && s.length < 12) s += B62[b % 62]; } return s; }
let id = opt("--id", null) || prev?.id || null;
if (id && !/^[0-9A-Za-z]{12}$/.test(id)) die("--id は英数字12文字にしてください", 2);
if (id && others.some((e) => e.id === id)) die(`id ${id} は記録の別の店（${others.find((e) => e.id === id).name}）が使っています`, 2);
if (!id) do { id = newId(); } while (fs.existsSync(path.join(qRoot, id)) || index.entries.some((e) => e.id === id));
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
    if (N.digits && !h.includes(`tel:${N.digits}`) && /href="tel:/.test(SRC_HTML)) problems.push("index.html：電話のリンクが差し替わっていません");
    if (noPhone && /href="tel:/.test(h)) problems.push("index.html：電話の無い店に電話のリンクが残っています");
    if (noPhone && /電話で/.test(visible)) problems.push("index.html：電話の無い店に「電話で」の文が残っています");
    if (!visible.includes(N.name)) problems.push("index.html：店名が入っていません");
    // 店名が二重：1つの要素の中に2回、または同じ段で続く2つの要素がどちらも店名だけ
    const hb = h.slice(h.indexOf("<body")), nm = N.name.replace(/\s+/g, "");
    const outSecs = [...hb.matchAll(/<(section|header|footer)\b[^>]*data-sec="([^"]+)"/g)].map((m) => ({ at: m.index, sec: m[2] }));
    const oEls = [...hb.matchAll(EL)].map((m) => ({ id: (m[2].match(/data-c?el="([^"]+)"/) || [])[1], t: plain(m[3]).replace(/\s+/g, ""), sec: outSecs.filter((x) => x.at <= m.index).pop()?.sec })).filter((e) => e.t && !hideIds.has(e.id));
    const dbl = oEls.filter((e, i) => e.t.includes(nm + nm) || (i && e.t === nm && oEls[i - 1].t === nm && oEls[i - 1].sec === e.sec));
    if (dbl.length) problems.push(`index.html：店名が二重に並んでいます（${dbl.map((e) => e.sec + "/" + e.id).join("・")}）`);
    if (!h.includes(encodeURIComponent(N.address)) && /maps\?q=/.test(SRC_HTML)) problems.push("index.html：地図が差し替わっていません");
    for (const [a, b] of REPL) if (a.length >= 2 && !b.includes(a) && !inputBlob.includes(a) && visible.includes(a)) problems.push(`index.html：型の作った事実「${a}」が残っています`);
    const pendCount = visible.split(C.pending).length - 1;
    if (pendCount > 1) problems.push(`index.html：「${C.pending}」が ${pendCount} 回あります`);
    // 揺らぎが入ったか
    if (!h.includes(`data-qs-variation="${vTag}"`)) problems.push("index.html：揺らぎの印がありません");
    const outC = rootVars(h, "c");
    for (const [role, to] of Object.entries(PAL.set)) if ((outC[role] || "").toUpperCase() !== (hexMap[(baseC[role] || "").toUpperCase()] || "")) problems.push(`index.html：色の組 ${V.palette} の --c-${role} が入っていません（${outC[role]}）`);
    for (const x of contrastProblems(baseC, PAL.set)) problems.push(`index.html：色の組 ${V.palette} の明暗差が足りません：${x}`);
    if (V.font > 0 && !h.includes(`--f-heading:${famList(FNT.heading, generic(baseF.heading))}`)) problems.push("index.html：書体の組が入っていません");
    if (V.font > 0 && [...FNT.heading, ...FNT.body].some((f) => !h.includes(`family=${f.replace(/ /g, "+")}`))) problems.push("index.html：書体の読み込みがありません");
    if (V.crop > 0 && !h.includes(`object-position:${CROP.pos}!important;scale:${CROP.scale}`)) problems.push("index.html：表紙の写真の切り抜きが入っていません");
    if (!expectOrder || secOrder(h).join(",") !== expectOrder.join(",")) problems.push(`index.html：段の並び ${V.order} が入っていません`);
  }
}
const seconds = Math.round((Date.now() - T0) / 100) / 10;
if (problems.length) {
  if (!process.env.QS_KEEP && !prev) fs.rmSync(OUT, { recursive: true, force: true });
  console.error(JSON.stringify({ ok: false, template: tplId, variation: V, problems }, null, 2));
  process.exit(1);
}
// ---- 記録 ----
const vNames = { palette: PAL.name, font: FNT.name, order: V.order ? TT.swap[V.order - 1].join("⇄") : "型のまま", crop: CROP.name };
const now = new Date().toISOString();
const entry = { key: shopKey, name: N.name, address: N.address, town: N.town, genre: input.genre, genreKey: G.key, id, template: tplId, variation: V, variationNames: vNames, createdAt: prev?.createdAt || now };
if (prev) { entry.updatedAt = now; index.entries[index.entries.indexOf(prev)] = entry; } else index.entries.push(entry);
index._about = "下見の見本の記録（tools/quick-sample.mjs が書く）。key は店名＋住所。同じ店を作り直すと、この id・型・揺らぎを使い直す。variation の数は quick-sample-map.json の palettes・fonts・swap（0 は型のまま）・common.crops の番号";
const tmp = IDX + ".tmp";
fs.writeFileSync(tmp, JSON.stringify({ _about: index._about, entries: index.entries }, null, 1) + "\n");
fs.renameSync(tmp, IDX);
console.log(JSON.stringify({ ok: true, path: `/q/${id}/`, id, dir: OUT, template: tplId, templateName: tplShop.name, genreKey: G.key, fallback: !!G.fallback, variation: V, variationNames: vNames, pick: pickNote, seconds, replaced: stats }, null, 2));
