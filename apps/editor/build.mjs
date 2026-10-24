// 編集画面を1つの HTML にまとめる：apps/editor/dist/editor_single.html
//   node apps/editor/build.mjs
// していること（試験台30 の experiments/layout/playground30/build.mjs と同じ中身を作る）：
//   1. src/lib/entry.js（packages/core と保存先）を esbuild で1つにまとめる → ページのスクリプトの先頭で __MIKKE として受け取る
//   2. src/pg/ のファイルを src/parts.mjs の順につなぎ「const PG = (function () { … })();」にする
//   3. src/ui/ のファイルを順につなぐ（画面のつなぎ）
//   4. 見本の中身・① お店の情報（samples/ashiyado/shop.json）・写真（Chromium で縮めて JPEG に焼き込む）を入れる
//   5. Google Fonts のリンク・CSS・画面の HTML と合わせて書き出す。試験の画像を dist/editor_testimg に写す
// つないだスクリプトは書き出す前に esbuild で文法を確かめ、まちがいはファイル名と行で知らせる。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { PG_PARTS, UI_PARTS } from "./src/parts.mjs";
import { FONT_LINK, ROOTVARS, BASE_CSS } from "../../packages/core/page-css.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const SRC = path.join(here, "src");
const OUT_DIR = path.join(here, "dist");
const OUT = path.join(OUT_DIR, "editor_single.html");
const TITLE = "wa-01 layout playground 29";   // 試験台30 と同じ（確認スクリプトのため変えない）
const TESTIMG = path.join(here, "testimg");   // 試験の画像（試験台30 の testimg の写し）

// ---- 1. ES モジュールの側（packages/core・保存先）----
async function bundleLib() {
  const r = await esbuild.build({
    entryPoints: [path.join(SRC, "lib/entry.js")], bundle: true, write: false, format: "iife", globalName: "__MIKKE",
    platform: "browser", target: "es2022", charset: "utf8", legalComments: "none", logLevel: "silent",
  });
  return r.outputFiles[0].text;
}

// ---- 2・3. pg/・ui/ のファイルをつなぐ（どの行がどのファイルかを覚えておき、文法のまちがいを知らせるのに使う）----
function joinParts(dir, parts) {
  let text = "", line = 1; const map = [];
  for (const [file] of parts) {
    const s = fs.readFileSync(path.join(SRC, dir, file), "utf8");
    const body = s.endsWith("\n") ? s : s + "\n";
    map.push({ file: `${dir}/${file}`, from: line });
    text += body; line += body.split("\n").length - 1;
  }
  return { text, map };
}
function whereIs(map, offsetLine, line) {
  const l = line - offsetLine; let hit = map[0];
  for (const m of map) if (m.from <= l) hit = m;
  return `${hit.file}:${l - hit.from + 1}`;
}

const PG_HEAD = "const PG = (function () {\n";
const PG_TAIL = "})();\nwindow.__playground = PG.api;\n";

async function checkSyntax(script, pieces) {
  try { await esbuild.transform(script, { loader: "js", logLevel: "silent" }); }
  catch (e) {
    const msgs = (e.errors || []).map((er) => {
      const ln = er.location ? er.location.line : 0;
      const p = [...pieces].reverse().find((x) => ln >= x.start);
      return `  ${p ? whereIs(p.map, p.start - 1, ln) : "?"}  ${er.text}`;
    });
    throw new Error("つないだスクリプトに文法のまちがい：\n" + msgs.join("\n"));
  }
}

// ---- 4. 写真の焼き込み（試験台30 の encodePhotos と同じ）----
async function encodePhotos() {
  const assets = JSON.parse(fs.readFileSync(path.join(ROOT, "samples/ashiyado/assets.json"), "utf8")).assets;
  const need = { ast_frme: 1, ast_frmf: 1, ast_frmg: 1, ast_frmh: 1, ast_frmi: 1 };
  const { chromium } = await import("playwright");
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const out = {};
  for (const id of Object.keys(need)) {
    const file = path.join(ROOT, "samples/ashiyado/media", assets[id].file.key);
    const src = `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
    out[id] = await p.evaluate(async (s) => { const img = new Image(); img.src = s; await img.decode(); const w = Math.min(1200, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth); const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(img, 0, 0, w, h); return cv.toDataURL("image/jpeg", 0.8); }, src);
  }
  out.ast_frmx = out.ast_frmi; await b.close(); return out;
}

async function build() {
  const CONTENT = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/core/content/wa-01.json"), "utf8"));
  const SHOP = JSON.parse(fs.readFileSync(path.join(ROOT, "samples/ashiyado/shop.json"), "utf8"));
  const UI_CSS = fs.readFileSync(path.join(SRC, "editor.css"), "utf8");
  const UI_BODY = fs.readFileSync(path.join(SRC, "body.html"), "utf8");
  const lib = await bundleLib();
  const pg = joinParts("pg", PG_PARTS), ui = joinParts("ui", UI_PARTS);
  const photos = await encodePhotos();

  // つなぐ順は試験台30 と同じ：core → 見本の中身・お店の情報・写真 → PG → 画面のつなぎ
  const lines = (t) => t.split("\n").length - 1;
  let script = `${lib}const { SPEC, RESOLVE, BANCHOR, C3, TEXT, CATALOG, SHOPINFO, saveStore } = __MIKKE;\n`;
  script += `const CONTENT_JSON = ${JSON.stringify(CONTENT)};\nconst SHOP_JSON = ${JSON.stringify(SHOP)};\nconst PHOTOS_JSON = ${JSON.stringify(photos)};\n`;
  script += PG_HEAD;
  const pieces = [{ start: lines(script) + 1, map: pg.map }];
  script += pg.text + PG_TAIL;
  pieces.push({ start: lines(script) + 1, map: ui.map });
  script += ui.text;
  await checkSyntax(script, pieces);

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
${FONT_LINK}
<style>${ROOTVARS}${BASE_CSS}${UI_CSS}</style></head>
<body>
${UI_BODY}
<script>
${script}
</script>
</body></html>`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`wrote ${OUT}  (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`);
  // 試験の画像を dist にも写す（試験台30 が refs/compare/layout/playground30_testimg に写していたのと同じもの）
  const imgDst = path.join(OUT_DIR, "editor_testimg");
  if (fs.existsSync(TESTIMG)) { fs.mkdirSync(imgDst, { recursive: true }); for (const f of fs.readdirSync(TESTIMG)) fs.copyFileSync(path.join(TESTIMG, f), path.join(imgDst, f)); }
}
await build();
