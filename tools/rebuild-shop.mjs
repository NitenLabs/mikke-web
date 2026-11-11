#!/usr/bin/env node
// 店を作り直す（指示 0045 段1）：① を読む → 型の gen → validate → build → finish → 検査 → 書き出し → （--deploy なら上げる命令を出す）。
// 使い方（mikke-web のフォルダで）：
//   node tools/rebuild-shop.mjs <店> [--from <①のフォルダ>] [--out <フォルダ>] [--dry-run] [--deploy] [--date YYYY-MM-DD] [--base <前の書き出し>] [--no-check] [--keep-stage] [--log <file>]
//   --from    ① のフォルダ（shop.json・assets.json・media/ ほか。形は docs/REBUILD.md）。無ければ samples/<店>
//   --from-api <api の URL>  apps/api の公開された ① から作り直す（0053）：公開中の版の ①・② の文字（draft.content）を取り出し、
//             dist/_api-source/<店> に --from の形で書いてから流す。読むのは GET /edit-api/shops/<店>/published（鍵 --api-secret だけ。
//             MIKKE_API_RUNNER_SECRET・EDIT_RUNNER_SECRET。Cookie は使わない、0059）。--api-assets で写真も版の写真を api から（既定は samples の写真）
//             版が render:"rebuild"（描き直しの版）なら、作り直した結果を POST /edit-api/shops/<店>/versions/<n>/render に返す（--dry-run・--no-report では返さない）
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
const VALUED = ["--from", "--out", "--date", "--base", "--log", "--from-api", "--api-secret"];
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (k) => argv.includes(k);
const site = argv.find((a, i) => !a.startsWith("--") && !VALUED.includes(argv[i - 1]));
if (!site) { console.error("使い方: node tools/rebuild-shop.mjs <店> [--from <dir> | --from-api <url>] [--out <dir>] [--dry-run] [--deploy] [--date YYYY-MM-DD] [--base <dir>] [--no-check]"); process.exit(2); }
for (const k of VALUED) if (flag(k) && (!opt(k) || opt(k).startsWith("--"))) { console.error(`${k} の後に値が要る`); process.exit(2); }

if (flag("--api-cookie")) { console.error("--api-cookie はもう使わない（0059：--from-api は /edit-api の鍵 --api-secret だけで読む）"); process.exit(2); }
if (flag("--from") && flag("--from-api")) { console.error("--from と --from-api は一緒に使えない"); process.exit(2); }
const dryRun = flag("--dry-run");
const logFile = opt("--log") ? path.resolve(opt("--log")) : null;
if (logFile) fs.writeFileSync(logFile, "");
let source = null, client = null;
if (flag("--from-api")) {
  try {
    client = apiClient({
      base: opt("--from-api"),
      secret: opt("--api-secret") ?? process.env.MIKKE_API_RUNNER_SECRET ?? process.env.EDIT_RUNNER_SECRET ?? "",
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
// 描き直しの版（render が html でない）なら、作った結果を api に返す。url は書き出しの置き場ではなく公開のアドレス（決まっていれば）
const renderState = source ? (typeof source.render === "string" ? source.render : source.render?.state) : null;
if (source && renderState && renderState !== "html" && !dryRun && !flag("--no-report")) {
  const url = typeof result.url === "string" && result.url.startsWith("http") ? result.url : undefined;
  const body = result.ok ? { ok: true, ...(url ? { url } : {}) } : { ok: false, error: String(result.error ?? result.errorCode ?? "作り直しに失敗").slice(0, 1000) };
  try { result.renderReport = { sent: body, answer: await client.postRenderResult(site, source.version, body) }; }
  catch (e) { if (!(e instanceof ApiError)) throw e; result.renderReport = { sent: body, errorCode: e.code, error: e.message }; }
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
