#!/usr/bin/env node
// 芦屋堂のお店を local の D1・R2 に作る。
//   npm run seed -- --producer you@example.com --owner owner@example.com
// 何度流してもよい（同じお店は消してから入れ直す）。samples/ は読むだけ。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeed } from "./seed-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const samples = resolve(root, "../../samples/ashiyado");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const producerEmail = opt("producer", "producer@example.com");
const ownerEmail = opt("owner", "owner@ashiyado.example");
const slug = opt("slug", "ashiyado");

const read = (f) => JSON.parse(readFileSync(join(samples, f), "utf8"));
const assets = read("assets.json");
const fileSizes = {};
for (const a of Object.values(assets.assets)) fileSizes[a.file.key] = statSync(join(samples, "media", a.file.key)).size;

const seed = buildSeed({ shop: read("shop.json"), assets, theme: read("theme.json"), slug, producerEmail, ownerEmail, fileSizes });

const wrangler = join(root, "node_modules/.bin/wrangler");
const run = (a) => execFileSync(wrangler, a, { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

run(["d1", "migrations", "apply", "mikke", "--local"]);
mkdirSync(join(root, ".wrangler"), { recursive: true });
const sqlPath = join(root, ".wrangler/seed.sql");
writeFileSync(sqlPath, seed.statements.join("\n") + "\n");
run(["d1", "execute", "mikke", "--local", "--file", sqlPath]);
for (const o of seed.objects) {
  run(["r2", "object", "put", `mikke-media/${o.key}`, "--local", "--file", join(samples, "media", o.file), "--content-type", o.mime]);
}
console.log(`\n種まき済み：${seed.shopId}（${slug}）写真 ${seed.objects.length} 枚`);
console.log(`制作側 ${producerEmail} ／ 店主 ${ownerEmail} でログインできます（コードは wrangler dev のログに出る）`);
console.log(`公開ページ：まだ公開していません。編集画面から公開すると http://${slug}.localhost:8787/ に出ます`);
