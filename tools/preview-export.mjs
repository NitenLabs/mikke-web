#!/usr/bin/env node
// お店に送る見本の書き出し：dist/<店>/ を dist/preview/<店>/ に写し、検索よけと共有用の情報を足す。
// 使い方：node tools/preview-export.mjs rian [--out 書き出し先のフォルダ]（既定は dist/preview。自分のお店のフォルダだけを書き換える）
// 公開用の書き出し（packages/core/publish）とは別物。そちらが salesDraft で止まる仕組みは変えない。
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = "https://nitenlabs-preview.pages.dev";
const DESC = "芦屋みっけ（NitenLabs）が作成した見本です。写真は仮です。";
const args = process.argv.slice(2);
const oi = args.indexOf("--out");
if (oi >= 0 && !args[oi + 1]) { console.error("--out の後にフォルダを指定してください"); process.exit(2); }
const outRoot = oi >= 0 ? args[oi + 1] : null;
const name = args.filter((_, i) => oi < 0 || (i !== oi && i !== oi + 1))[0];
if (!name || !/^[a-z0-9-]+$/.test(name)) { console.error("使い方: node tools/preview-export.mjs <店のフォルダ名> [--out 書き出し先のフォルダ]"); process.exit(2); }
const src = path.join("dist", name), root = outRoot || path.join("dist", "preview"), out = path.join(root, name);
if (!fs.existsSync(path.join(src, "index.html"))) { console.error(`${src}/index.html がありません。先に build と仕上げを実行してください`); process.exit(1); }

const shop = JSON.parse(fs.readFileSync(path.join("samples", name, "shop.json"), "utf8"));
fs.mkdirSync(root, { recursive: true });
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true, filter: (p) => path.basename(p) !== "_layout.json" });

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const url = `${BASE}/${name}/`, title = `${shop.basic.name}（ホームページの見本）`;
const head = [
  `<meta name="robots" content="noindex, nofollow">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:title" content="${esc(title)}">`,
  `<meta property="og:description" content="${esc(DESC)}">`,
  `<meta property="og:image" content="${url}og.jpg">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta property="og:url" content="${url}">`,
].join("\n");

let first = null;
for (const f of fs.readdirSync(out).filter((n) => n.endsWith(".html"))) {
  const p = path.join(out, f);
  let h = fs.readFileSync(p, "utf8").replace(/<meta\s+(?:name="robots"|property="og:[^"]*")[^>]*>\s*/g, "");
  if (f === "index.html") first = h.match(/<img[^>]+src="(assets\/[^"]+)"/)?.[1];
  fs.writeFileSync(p, h.replace("</head>", `${f === "index.html" ? head : head.split("\n")[0]}\n</head>`));
}
if (!first) { console.error("最初の写真が見つかりません"); process.exit(1); }

// 共有用の画像（最初の画面の写真を 1200×630 に切り出す）
const b64 = fs.readFileSync(path.join(out, first)).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<!doctype html><style>*{margin:0}img{display:block;width:1200px;height:630px;object-fit:cover}</style><img src="data:image/jpeg;base64,${b64}">`, { waitUntil: "load" });
await page.evaluate(() => document.images[0].decode());
await page.screenshot({ path: path.join(out, "og.jpg"), type: "jpeg", quality: 85 });
await browser.close();

const headers = path.join(root, "_headers");
if (!fs.existsSync(headers)) fs.writeFileSync(headers, "/*\n  X-Robots-Tag: noindex, nofollow\n");
console.log(`書き出し完了: ${out}（${url}）`);
