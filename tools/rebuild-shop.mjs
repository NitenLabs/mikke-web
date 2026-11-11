#!/usr/bin/env node
// 店を作り直す（指示 0045 段1）：① を読む → 型の gen → validate → build → finish → 検査 → 書き出し → （--deploy なら上げる命令を出す）。
// 使い方（mikke-web のフォルダで）：
//   node tools/rebuild-shop.mjs <店> [--from <①のフォルダ>] [--out <フォルダ>] [--dry-run] [--deploy] [--date YYYY-MM-DD] [--base <前の書き出し>] [--no-check] [--keep-stage] [--log <file>]
//   --from    ① のフォルダ（shop.json・assets.json・media/ ほか。形は docs/REBUILD.md）。無ければ samples/<店>
//   --from-api <api の URL>  apps/api の公開された ① から作り直す（0053）：公開中の版の ①・② の文字（draft.content）を取り出し、
//             dist/_api-source/<店> に --from の形で書いてから流す。鍵 --api-secret（MIKKE_API_RUNNER_SECRET・EDIT_RUNNER_SECRET）で slug → 店の ID、
//             公開中の版はログインの Cookie --api-cookie（MIKKE_API_COOKIE）で読む。--api-assets で写真も api の ④ から（既定は samples の写真）
//   --out     書き出し先（既定 dist/rebuild/<店>）。--dry-run のときは書かない
//   --dry-run 作って検査するだけ（書き出さない）
//   --deploy  wrangler pages deploy の命令を組み立てて出す（走らせない。ユーザーが貼る）
//   --base    「変わったページ」を比べる前の書き出し（既定：--out の今の中身 → dist/<店>）
//   --no-check 型の検査（waNN-check。Playwright）を飛ばす
// 結果は json で標準出力に出す（ok・publishable・url・timings・changed・deploy）。ok でなければ終了コード 1。
// samples/<店> は書き換えない（写しの上で作る）。本番用なので noindex が付いていれば publishable: false（--deploy は止まる）。
import fs from "node:fs";
import path from "node:path";
import { ROOT, rebuildShop } from "./lib/rebuild.mjs";
import { ApiError, apiClient, fetchPublishedSource } from "./lib/api-source.mjs";

const argv = process.argv.slice(2);
const VALUED = ["--from", "--out", "--date", "--base", "--log", "--from-api", "--api-secret", "--api-cookie"];
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (k) => argv.includes(k);
const site = argv.find((a, i) => !a.startsWith("--") && !VALUED.includes(argv[i - 1]));
if (!site) { console.error("使い方: node tools/rebuild-shop.mjs <店> [--from <dir> | --from-api <url>] [--out <dir>] [--dry-run] [--deploy] [--date YYYY-MM-DD] [--base <dir>] [--no-check]"); process.exit(2); }
for (const k of VALUED) if (flag(k) && (!opt(k) || opt(k).startsWith("--"))) { console.error(`${k} の後に値が要る`); process.exit(2); }

if (flag("--from") && flag("--from-api")) { console.error("--from と --from-api は一緒に使えない"); process.exit(2); }
const dryRun = flag("--dry-run");
const logFile = opt("--log") ? path.resolve(opt("--log")) : null;
if (logFile) fs.writeFileSync(logFile, "");
let source = null;
if (flag("--from-api")) {
  try {
    const client = apiClient({
      base: opt("--from-api"),
      secret: opt("--api-secret") ?? process.env.MIKKE_API_RUNNER_SECRET ?? process.env.EDIT_RUNNER_SECRET ?? "",
      cookie: opt("--api-cookie") ?? process.env.MIKKE_API_COOKIE ?? "",
    });
    source = await fetchPublishedSource(client, { site, dir: path.join(ROOT, "dist", "_api-source", `${site}-published`), apiAssets: flag("--api-assets") });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    console.log(JSON.stringify({ site, ok: false, publishable: false, source: { kind: "api" }, errorCode: e.code, error: e.message }, null, 2));
    process.exit(1);
  }
}
const result = await rebuildShop({
  site,
  from: source?.dir ?? opt("--from"),
  afterGen: source?.afterGen,
  out: dryRun ? undefined : (opt("--out") ?? path.join(ROOT, "dist", "rebuild", site)),
  dryRun,
  deploy: flag("--deploy"),
  date: opt("--date"),
  base: opt("--base"),
  check: !flag("--no-check"),
  keepStage: flag("--keep-stage"),
  log: logFile ? (s) => fs.appendFileSync(logFile, s + "\n") : undefined,
});
if (source) { const { afterGen, ...info } = source; result.source = { kind: "api", ...info }; }
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
