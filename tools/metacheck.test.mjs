import test from "node:test";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 照合の照合（fix02 §2）：全種の欠陥を spec-check が検出できることを確かめる。
// ヘッドレスのビルド＋照合を2回まわすので時間がかかる（数十秒）。
test("metacheck: 全種の欠陥を検出（exit 0）", { timeout: 300000 }, () => {
  execSync("node tools/metacheck.mjs", { cwd: ROOT, stdio: "inherit" });
});
