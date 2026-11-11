#!/usr/bin/env node
// 見本のお店を local の D1・R2 に作る（既定は芦屋堂）。
//   npm run seed -- --producer you@example.com --owner owner@example.com
//   npm run seed -- --site amet   … samples/amet（wa-03。② は site.json＋template＋genConfig(wa03.json)。店主 owner@amet.example）
// 何度流してもよい（同じお店は消してから入れ直す）。samples/ は読むだけ。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeed, wa03SiteDraft } from "./seed-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const site = opt("site", "ashiyado");
if (!/^[a-z0-9-]{1,40}$/.test(site)) throw new Error(`--site の形が正しくありません：${site}`);
const samples = resolve(root, "../../samples", site);
const producerEmail = opt("producer", "producer@example.com");
const ownerEmail = opt("owner", `owner@${site}.example`);
const slug = opt("slug", site);
// local の D1・R2 の置き場所（wrangler の --persist-to）。編集画面の通しの試験（apps/editor/test/e2e-api.test.mjs）が、
// 毎回まっさらな置き場所で走らせるのに使う。なければ wrangler の既定（.wrangler/state）
const persistTo = opt("persist-to", null);
const persist = persistTo ? ["--persist-to", resolve(persistTo)] : [];

const read = (f) => JSON.parse(readFileSync(join(samples, f), "utf8"));
const assets = read("assets.json");
const fileSizes = {};
for (const a of Object.values(assets.assets)) fileSizes[a.file.key] = statSync(join(samples, "media", a.file.key)).size;

// wa-03 の店（genConfig の wa03.json がある）は、② を site.json から作る。無ければ wa-01 の「何もしていない」下書き
const isWa03 = existsSync(join(samples, "wa03.json"));
const theme = read("theme.json");
const seed = buildSeed({
  shop: read("shop.json"),
  assets,
  theme,
  slug,
  producerEmail,
  ownerEmail,
  fileSizes,
  ...(isWa03 ? { template: "wa-03", siteDraft: wa03SiteDraft({ site: read("site.json"), genConfig: read("wa03.json"), theme }) } : {}),
});

// .bin/wrangler は Windows では直接は動かない（.cmd になる）ので、node で wrangler の本体を動かす
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
const run = (a) => execFileSync(process.execPath, [wrangler, ...a], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

run(["d1", "migrations", "apply", "mikke", "--local", ...persist]);
mkdirSync(join(root, ".wrangler"), { recursive: true });
const sqlPath = join(root, ".wrangler/seed.sql");
writeFileSync(sqlPath, seed.statements.join("\n") + "\n");
run(["d1", "execute", "mikke", "--local", "--file", sqlPath, ...persist]);
for (const o of seed.objects) {
  run(["r2", "object", "put", `mikke-media/${o.key}`, "--local", "--file", join(samples, "media", o.file), "--content-type", o.mime, ...persist]);
}
console.log(`\n種まき済み：${seed.shopId}（${slug}）写真 ${seed.objects.length} 枚`);
console.log(`制作側 ${producerEmail} ／ 店主 ${ownerEmail} でログインできます（コードは wrangler dev のログに出る）`);
console.log(`公開ページ：まだ公開していません。編集画面から公開すると http://${slug}.localhost:8787/ に出ます`);
