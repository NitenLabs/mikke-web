#!/usr/bin/env node
// 紹介事例ギャラリーの入口ページの書き出し：data/gallery.json から、見本へのカードを並べた1枚のページを作る。
// 使い方：node tools/gallery-export.mjs [--out 書き出し先のフォルダ] [--data 作例のデータ]
//   既定は --out dist/preview・--data data/gallery.json。書き出し先の中の gallery/ だけを書き換える。
// 各お店は先に preview-export で同じ書き出し先に出しておく。カードの縮小画像はそれを PC 幅で撮って作る。
// 社内の確認用の簡素な一覧（白地・2列・サムネイルと店名・ジャンル・一言）。G024 の商品棚（tools/gallery-template.html）は使わない（G041）。
// gallery.json の cat・stage・hero・contact は他で使うので残すが、この一覧では読まない。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

const { shops } = JSON.parse(fs.readFileSync(dataPath, "utf8"));
if (!shops?.length) { console.error(`${dataPath} にお店がありません`); process.exit(1); }
for (const s of shops) {
  for (const k of ["id", "name", "genre", "mood", "path"]) if (!s[k]) { console.error(`${dataPath}：${s.id || "（IDなし）"} の ${k} がありません`); process.exit(1); }
  if (!/^[a-z0-9-]+$/.test(s.id) || !/^[a-z0-9-]+$/.test(s.path)) { console.error(`${dataPath}：${s.id} の id・path は英小文字・数字・ハイフンだけにしてください`); process.exit(1); }
  if (!fs.existsSync(path.join(root, s.path, "index.html"))) { console.error(`${path.join(root, s.path)}/index.html がありません。先に preview-export を実行してください`); process.exit(1); }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "thumbs"), { recursive: true });

// PC のファーストビューを撮る（1440×900 を 960×600 で保存。ブラウザは1つ、ページは1枚ずつ開いて閉じる）
const browser = await chromium.launch();
try {
  for (const s of shops) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 / 3 });
    await page.goto(pathToFileURL(path.resolve(root, s.path, "index.html")).href, { waitUntil: "load" });
    await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight).map((i) => i.decode().catch(() => {}))]));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, "thumbs", `${s.id}.jpg`), type: "jpeg", quality: 82 });
    await page.close();
  }
} finally {
  await browser.close();
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cards = shops.map((s) => `    <li class="card"><a href="../${esc(s.path)}/" target="_blank" rel="noopener">
      <img src="thumbs/${esc(s.id)}.jpg" width="960" height="600" alt="${esc(s.name)}のサイトの最初の画面" loading="lazy">
      <p class="genre">${esc(s.genre)}</p>
      <h2>${esc(s.name)}</h2>
      <p class="mood">${esc(s.mood)}</p>
    </a></li>`).join("\n");

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ホームページの作例｜芦屋みっけ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500&family=Zen+Old+Mincho:wght@500&display=swap">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#FAF8F4;color:#2B2926;font-family:"Zen Kaku Gothic New",sans-serif;line-height:1.8;-webkit-text-size-adjust:100%}
.wrap{max-width:1200px;margin:0 auto;padding:0 40px}
header{padding:88px 0 56px}
.brand{font-size:14px;letter-spacing:.14em;color:#6F6A62}
h1{font-family:"Zen Old Mincho",serif;font-weight:500;font-size:36px;line-height:1.5;letter-spacing:.06em;margin-top:12px}
.lead{margin-top:16px;font-size:15px;color:#55504A}
ul{list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:64px 48px}
.card a{display:block;color:inherit;text-decoration:none}
.card img{display:block;width:100%;height:auto;border:1px solid #E6E1D8;transition:opacity .2s}
.card a:hover img{opacity:.86}
.card a:focus-visible{outline:2px solid #2B2926;outline-offset:4px}
.genre{margin-top:18px;font-size:13px;letter-spacing:.08em;color:#6F6A62}
h2{font-family:"Zen Old Mincho",serif;font-weight:500;font-size:22px;line-height:1.5;letter-spacing:.04em;margin-top:2px}
.mood{margin-top:6px;font-size:14px;color:#55504A}
footer{margin-top:96px;padding:28px 0 40px;border-top:1px solid #E6E1D8;font-size:13px;color:#6F6A62}
@media (max-width:720px){
.wrap{padding:0 20px}
header{padding:56px 0 40px}
h1{font-size:27px}
ul{grid-template-columns:minmax(0,1fr);gap:48px}
footer{margin-top:64px}
}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="brand">芦屋みっけ</p>
    <h1>ホームページの作例</h1>
    <p class="lead">飲食店のためのホームページのデザイン見本です。掲載のお店はすべて架空です。</p>
  </header>
  <main>
  <ul>
${cards}
  </ul>
  </main>
  <footer>芦屋みっけ ／ 掲載のお店はすべて架空です。</footer>
</div>
</body>
</html>
`;
fs.writeFileSync(path.join(out, "index.html"), html);

const headers = path.join(root, "_headers");
if (!fs.existsSync(headers)) fs.writeFileSync(headers, "/*\n  X-Robots-Tag: noindex, nofollow\n");
console.log(`書き出し完了: ${out}（${shops.length} 件）`);
