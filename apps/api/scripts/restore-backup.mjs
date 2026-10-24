#!/usr/bin/env node
// B6：毎日のバックアップ（R2 の backups/<日付>.json.gz）から D1 を戻す。
//
//   local（wrangler dev の D1・R2）：
//     node scripts/restore-backup.mjs --date 2026-10-25                 # 中身を見て SQL を作るだけ（まだ戻さない）
//     node scripts/restore-backup.mjs --date 2026-10-25 --apply         # 戻す
//   本番・試し：
//     node scripts/restore-backup.mjs --env production --remote --db mikke-production --bucket mikke-media-production --date 2026-10-25 --apply
//   手元のファイルから：
//     node scripts/restore-backup.mjs --file ./2026-10-25.json.gz [--apply]
//
// 戻すと、バックアップにある表の中身は全部入れ替わる（その日の 0 時の状態になる。セッションも戻るので、ログインし直しが要ることがある）。
// 写真・公開ページ（R2）はバックアップに入れていない（R2 の中は消さないので、そのまま残っている）。README「バックアップから戻す」。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { restoreStatements, summarize } from "./backup-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const remote = flag("remote");
const envName = opt("env");
const db = opt("db", "mikke");
const bucket = opt("bucket", "mikke-media");
const date = opt("date");
let file = opt("file");
const apply = flag("apply");

if (!file && !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
  console.error("--date YYYY-MM-DD（R2 の backups/<日付>.json.gz）か --file <ファイル> を付けてください");
  process.exit(1);
}
if (envName && !remote) {
  console.error("--env を付けるときは --remote も付けてください（本番・試しの D1・R2）");
  process.exit(1);
}

const wrangler = join(root, "node_modules/.bin/wrangler");
const where = [remote ? "--remote" : "--local", ...(envName ? ["--env", envName] : [])];
const run = (a) => execFileSync(wrangler, a, { cwd: root, stdio: ["inherit", "inherit", "inherit"] });

const work = join(root, ".wrangler/restore");
mkdirSync(work, { recursive: true });
if (!file) {
  file = join(work, `${date}.json.gz`);
  run(["r2", "object", "get", `${bucket}/backups/${date}.json.gz`, "--file", file, ...where]);
}

const backup = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
const statements = restoreStatements(backup);
const sqlPath = join(work, `${backup.date}.sql`);
writeFileSync(sqlPath, statements.join("\n") + "\n");

console.log(`バックアップ：${backup.date}（作った時刻 ${backup.createdAt}）`);
console.log(`マイグレーション：${backup.migrations.at(-1) ?? "（記録なし）"} まで`);
console.table(summarize(backup));
console.log(`SQL：${sqlPath}（${statements.length} 文）`);
if (!apply) {
  console.log("\nまだ戻していません。中身を確かめてから --apply を付けて流してください。");
  console.log("戻す先の D1 は、バックアップと同じマイグレーションまで当てておくこと（npm run db:migrate など）。");
  process.exit(0);
}
console.log(`\n${remote ? `本番・試し（${envName ?? "既定"}）` : "local"} の D1「${db}」に戻します…`);
run(["d1", "execute", db, "--file", sqlPath, "--yes", ...where]);
console.log("戻しました。");
