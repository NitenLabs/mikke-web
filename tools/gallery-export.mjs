#!/usr/bin/env node
// 作例ページ（商品棚）の書き出し：data/gallery.json と tools/gallery-template.html から、作例を並べた1枚のページを作る。
// 使い方：node tools/gallery-export.mjs [--out 書き出し先のフォルダ] [--data 作例のデータ]
//   既定は --out dist/preview・--data data/gallery.json。書き出し先の中の gallery/ だけを書き換える。
// 各お店は先に preview-export で同じ書き出し先に出しておく。カードの縮小画像はそれを撮って作る：
//   PC   thumbs/<店>.jpg     1440×900 の最初の画面を 960×600 で（JPEG）
//   スマホ thumbs/<店>-sp.webp 390×780・deviceScaleFactor 2 のページの一番上を 780×1560 で（WebP、150KB 以下を目安）
// contact（instagram・tel・email）の空の項目は、その受け口ごと出さない。3つとも空ならご相談の段と、そこへのボタンを出さない。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  if (!args[i + 1]) { console.error(`${name} の後に値を指定してください`); process.exit(2); }
  return args[i + 1];
};
const root = opt("--out", path.join("dist", "preview"));
const dataPath = opt("--data", path.join("data", "gallery.json"));
const out = path.join(root, "gallery");
const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "gallery-template.html");

const fail = (msg) => { console.error(msg); process.exit(1); };
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const { shops } = data;
const CATS = ["和食", "焼肉・焼鳥", "洋食・ビストロ", "カフェ・喫茶", "パン・お菓子"];
if (!shops?.length) fail(`${dataPath} にお店がありません`);
for (const s of shops) {
  for (const k of ["id", "name", "genre", "mood", "path", "cat", "stage"]) if (!s[k]) fail(`${dataPath}：${s.id || "（IDなし）"} の ${k} がありません`);
  if (!/^[a-z0-9-]+$/.test(s.id)) fail(`${dataPath}：${s.id} の id は英小文字・数字・ハイフンだけにしてください`);
  if (s.path !== s.id) fail(`${dataPath}：${s.id} の path は id と同じにしてください（作例ページは ../<id>/ へつなぐ）`);
  if (!CATS.includes(s.cat)) fail(`${dataPath}：${s.id} の cat は ${CATS.join("・")} のどれかにしてください`);
  if (!/^#[0-9A-Fa-f]{6}$/.test(s.stage)) fail(`${dataPath}：${s.id} の stage は #RRGGBB にしてください`);
  if (!fs.existsSync(path.join(root, s.path, "index.html"))) fail(`${path.join(root, s.path)}/index.html がありません。先に preview-export を実行してください`);
}
const hero = data.hero ?? [];
for (const id of hero) if (!shops.some((s) => s.id === id)) fail(`${dataPath}：hero の ${id} が shops にありません`);

// 色見本：samples/<店>/theme.json の背景・primary・accent・line…から重複を除いて4色
const SWATCH_KEYS = ["background", "primary", "accent", "line", "surface", "text", "lineSoft", "textMuted"];
const swatches = (id) => {
  const f = path.join("samples", id, "theme.json");
  if (!fs.existsSync(f)) fail(`${f} がありません（色見本を取れません）`);
  const colors = JSON.parse(fs.readFileSync(f, "utf8")).colors || {};
  const keys = [...SWATCH_KEYS, ...Object.keys(colors).filter((k) => !SWATCH_KEYS.includes(k))];
  const seen = new Set();
  const sw = [];
  for (const k of keys) {
    const v = colors[k]?.value?.toUpperCase();
    if (!v || !/^#[0-9A-F]{6}$/.test(v) || seen.has(v)) continue;
    seen.add(v); sw.push(v);
    if (sw.length === 4) break;
  }
  return sw;
};

// 連絡の受け口
const c = data.contact || {};
const ig = String(c.instagram || "").trim();
const tel = String(c.tel || "").trim();
const email = String(c.email || "").trim();
if (email && !/^[^\s@"<>]+@[^\s@"<>]+\.[^\s@"<>]+$/.test(email)) fail(`${dataPath}：contact.email の形が正しくありません`);
if (tel && !/^[0-9０-９+\-‐ー() ]+$/.test(tel)) fail(`${dataPath}：contact.tel は数字・ハイフン・括弧だけにしてください`);
const igHandle = ig.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/[/?#].*$/, "").replace(/^@/, "");
if (ig && !/^[A-Za-z0-9._]+$/.test(igHandle)) fail(`${dataPath}：contact.instagram はアカウント名（@なしでも可）か URL にしてください`);
const telRaw = tel.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[^0-9+]/g, "");
const hasContact = Boolean(ig || tel || email);

// 縮小画像を撮る（ブラウザは1つ、ページは1枚ずつ開いて閉じる）
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "thumbs"), { recursive: true });
const settle = (page) => page.evaluate(async () => {
  scrollTo(0, 0);
  await document.fonts.ready;
  await Promise.all([...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight).map((i) => i.decode().catch(() => {})));
});
const browser = await chromium.launch();
const sizes = [];
try {
  for (const s of shops) {
    const url = pathToFileURL(path.resolve(root, s.path, "index.html")).href;
    // PC：1440×900 を 960×600 で
    const pc = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 / 3 });
    await pc.goto(url, { waitUntil: "load" });
    await settle(pc);
    await pc.waitForTimeout(600);
    await pc.screenshot({ path: path.join(out, "thumbs", `${s.id}.jpg`), type: "jpeg", quality: 82 });
    await pc.close();
    // スマホ：390×780・2倍。メニューは開かない（読み込んだままの一番上）
    const sp = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await sp.goto(url, { waitUntil: "load" });
    await settle(sp);
    await sp.waitForTimeout(800);
    await settle(sp);
    const png = await sp.screenshot({ type: "png" });
    await sp.close();
    // WebP への変換はブラウザの canvas で（150KB を超えたら質を下げる）
    const conv = await browser.newPage();
    const webp = await conv.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext("2d").drawImage(img, 0, 0);
      let q = 0.8, url;
      for (;;) {
        url = cv.toDataURL("image/webp", q);
        if (url.length * 0.75 <= 150 * 1024 || q <= 0.5) break;
        q = Math.round((q - 0.05) * 100) / 100;
      }
      return { b64: url.split(",")[1], q, w: cv.width, h: cv.height };
    }, png.toString("base64"));
    await conv.close();
    const buf = Buffer.from(webp.b64, "base64");
    fs.writeFileSync(path.join(out, "thumbs", `${s.id}-sp.webp`), buf);
    sizes.push(`${s.id}-sp.webp ${webp.w}×${webp.h} ${Math.round(buf.length / 1024)}KB（質 ${webp.q}）`);
  }
} finally {
  await browser.close();
}

// ページを組む
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const json = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
const SHOPS = shops.map((s) => ({
  id: s.id, cat: s.cat, name: s.name, genre: s.genre, mood: s.mood, stage: s.stage,
  pc: `thumbs/${s.id}.jpg`, sp: `thumbs/${s.id}-sp.webp`, sw: swatches(s.id),
}));

let html = fs.readFileSync(templatePath, "utf8");
const cut = (snippet, replacement = "") => {
  if (html.split(snippet).length !== 2) fail(`gallery-template.html に次の所が1つだけ見つかりません：${snippet.slice(0, 60)}…`);
  html = html.replace(snippet, () => replacement);
};
const between = (start, end) => {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  if (a < 0 || b < 0 || html.indexOf(start, a + 1) >= 0) fail(`gallery-template.html に ${start} の所が1つだけ見つかりません`);
  html = html.slice(0, a) + html.slice(b + end.length);
};
const trimLine = (snippet) => cut(snippet + "\n");

if (!hasContact) {
  // ご相談の段と、そこへのボタン・リンクを出さない
  between(`<section class="contact" id="contact">`, `</section>\n`);
  trimLine(`      <a class="btn btn-primary" href="#contact">相談する</a>`);
  trimLine(`        <a class="btn btn-ghost" href="#contact">まずは相談する</a>`);
  cut(`<a class="consult" href="#contact" data-design="\${s.id}">このデザインで相談</a>`);
} else {
  if (!ig) trimLine(`        <a href="__IG_URL__" target="_blank" rel="noopener"><span><small>Instagram の DM</small><b>__IG_HANDLE__</b></span><span class="arrow">→</span></a>`);
  if (!tel) trimLine(`        <a href="tel:__TEL_RAW__"><span><small>お電話</small><b>__TEL__</b></span><span class="arrow">→</span></a>`);
  if (!ig && !tel) between(`      <div class="quick">`, `      </div>\n`);
  if (!email) between(`      <form class="form" id="form" novalidate>`, `      </form>\n`);
  if (!email || (!ig && !tel)) cut(`<div class="contact-grid">`, `<div class="contact-grid solo">`);
  // フォームが無いときの「このデザインで相談」は、ご相談の段へ飛ぶだけ（作例を入れる欄が無い）
}

const fill = {
  __DATA__: json(SHOPS),
  __HERO__: json(hero),
  __IG_URL__: esc(`https://www.instagram.com/${igHandle}/`),
  __IG_HANDLE__: esc(`@${igHandle}`),
  __TEL_RAW__: esc(telRaw),
  __TEL__: esc(tel),
  __EMAIL__: email,
};
for (const [k, v] of Object.entries(fill)) html = html.split(k).join(v);
if (/__[A-Z_]+__/.test(html)) fail(`差し込み忘れがあります：${html.match(/__[A-Z_]+__/)[0]}`);

fs.writeFileSync(path.join(out, "index.html"), html);
const headers = path.join(root, "_headers");
if (!fs.existsSync(headers)) fs.writeFileSync(headers, "/*\n  X-Robots-Tag: noindex, nofollow\n");
console.log(sizes.join("\n"));
console.log(`受け口：${[ig && "Instagram", tel && "電話", email && "フォーム"].filter(Boolean).join("・") || "なし（ご相談の段を出さない）"}`);
console.log(`書き出し完了: ${out}（${shops.length} 件）`);
