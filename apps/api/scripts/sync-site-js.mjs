// packages/core/publish/site.js（公開ページの決まったスクリプトの元）を apps/api/src/site-assets.ts に写す。
// 使い方: node apps/api/scripts/sync-site-js.mjs   （元を直したら走らせて、版を上げてコミットする）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../../packages/core/publish/site.js"), "utf8");
const ver = crypto.createHash("sha256").update(src).digest("hex").slice(0, 12);
const out = `/**
 * M4：公開ページで動いてよいスクリプトは、ここに置いた決まったファイルだけ（店主は変えられない）。
 * 公開ページからは <script src="/_mikke/site.js" defer></script> で読む。
 * 中身は packages/core/publish/site.js から scripts/sync-site-js.mjs で写したもの。ここを手で直さない。
 */
export const SITE_SCRIPTS: Record<string, string> = {
  "site.js": ${JSON.stringify(src)},
};
export const SITE_SCRIPTS_VERSION = ${JSON.stringify(ver)};
`;
fs.writeFileSync(path.resolve(here, "../src/site-assets.ts"), out);
console.log("site-assets.ts を更新しました（版 " + ver + "）");
