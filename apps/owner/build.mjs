#!/usr/bin/env node
// 店主の編集画面を組む：src/main.js → dist/app.js（esbuild。root の devDependencies）、index.html・style.css を写す、
// お店ごとの上限 samples/<店>/edit-limits.json → dist/limits/<店>.json。
//   node apps/owner/build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "dist");

fs.mkdirSync(path.join(OUT, "limits"), { recursive: true });
await build({
  entryPoints: [path.join(HERE, "src/main.js")],
  bundle: true, format: "esm", target: ["es2022", "safari16"], minify: true, sourcemap: true,
  outfile: path.join(OUT, "app.js"), logLevel: "warning",
});
for (const f of ["index.html", "style.css"]) fs.copyFileSync(path.join(HERE, "src", f), path.join(OUT, f));
let n = 0;
for (const d of fs.readdirSync(path.join(ROOT, "samples"))) {
  const f = path.join(ROOT, "samples", d, "edit-limits.json");
  if (fs.existsSync(f)) { fs.copyFileSync(f, path.join(OUT, "limits", `${d}.json`)); n++; }
}
console.log(`apps/owner/dist に組みました（上限 ${n} 店）`);
