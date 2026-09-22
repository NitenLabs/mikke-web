#!/usr/bin/env node
// 照合の照合（fix02 §2）：照合の種類ごとに「わざと1つ壊した」状態を作り、
// spec-check がその行を不合格にすることを確かめる。壊して捕まらなければ照合に穴がある。
// 使い方: node tools/metacheck.mjs   （終了コード0＝全defectを検出／1＝取りこぼしあり）
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "samples/ashiyado");
const DATA = path.join(ROOT, "samples/_meta");
const DIST = path.join(ROOT, "dist/_meta");

// データ（site.json）に入れる欠陥。fn(site) で1か所だけ壊す。expect=不合格になるべき付録ID
const DATA_DEFECTS = [
  { id: "A4-3", kind: "box", fn: (s) => { s.elements.el_fvh.layout.pc.x = 33; } },
  { id: "A2-5", kind: "text（太さ）", fn: (s) => { s.elements.el_aboutbody.style.weight = 700; } },
  { id: "A6-3-rule", kind: "line（色）", fn: (s) => { s.elements.el_about_rule.fill = "theme:background"; } },
  { id: "A11-6", kind: "gap", fn: (s) => { s.elements.el_accinfo.style.paragraphGap = 0; } },
  { id: "A9-16", kind: "arrow", fn: (s) => { delete s.elements.el_itemsbtn.style.arrowRight; } },
  { id: "A3-1", kind: "pageY（重ね）", fn: (s) => { s.regions.headerOverlay.pages = s.regions.headerOverlay.pages.filter((p) => p !== "pg_home"); } },
  { id: "A8-8a", kind: "relation", fn: (s) => { s.elements.el_featp1.layout.pc.y = 300; } },
  { id: "A1-3", kind: "alpha", fn: (s) => { s.elements.el_itemsdiv.opacity = 100; } },
  { id: "A11-2", kind: "writing", fn: (s) => { delete s.elements.el_accsoe.layout.pc.writingMode; } },
  { id: "A1-4", kind: "secbg", fn: (s) => { s.sections.sec_feature.background.color = "theme:background"; } },
  { id: "A12-5", kind: "screenshot（明るさ）", fn: (s) => { s.elements.el_ctphoto.darken = 90; } },
];
// 書き出したHTML/CSSに入れる欠陥（データで壊せないCSS系）。replace で1か所だけ壊す
const DIST_DEFECTS = [
  { id: "A10-6", kind: "pseudo（シェブロン）", from: "width:1.2rem;height:.6rem", to: "width:4rem;height:4rem" },
  { id: "A3-4", kind: "navgeom（間隔）", from: ".el-nav .nav-row{display:flex;gap:2.4rem", to: ".el-nav .nav-row{display:flex;gap:.4rem" },
  { id: "A11-8b", kind: "iframe（lazy）", from: 'referrerpolicy="no-referrer-when-downgrade"', to: 'loading="lazy" referrerpolicy="no-referrer-when-downgrade"' },
  { id: "A3-8", kind: "spmenu（背景）", from: ".nav-menu{position:fixed;inset:0;background:var(--c-deep)", to: ".nav-menu{position:fixed;inset:0;background:#FF0000" },
];

function cpDir(a, b) { fs.rmSync(b, { recursive: true, force: true }); fs.cpSync(a, b, { recursive: true }); }
function specCheck() { try { return execSync(`node tools/spec-check.mjs ${DATA} ${DIST}`, { cwd: ROOT }).toString(); } catch (e) { return (e.stdout || "").toString() + (e.stderr || "").toString(); } }
function patchDistFiles(patchDist) {
  for (const f of fs.readdirSync(DIST).flatMap((d) => { const p = path.join(DIST, d); return fs.statSync(p).isDirectory() ? fs.readdirSync(p).map((x) => path.join(p, x)) : [p]; })) {
    if (!f.endsWith(".html")) continue; let html = fs.readFileSync(f, "utf8"); const nh = patchDist(html); if (nh !== html) fs.writeFileSync(f, nh);
  }
}

// グループ実行：全DATA欠陥を一度に入れて1回照合／全DIST欠陥を1回照合（独立欠陥は互いを隠さない・余分な不合格は無害）
const results = [];
// 1) DATA 欠陥
cpDir(SRC, DATA);
const sp = path.join(DATA, "site.json"); const site = JSON.parse(fs.readFileSync(sp, "utf8"));
for (const d of DATA_DEFECTS) d.fn(site);
fs.writeFileSync(sp, JSON.stringify(site, null, 2) + "\n");
execSync(`node tools/build.mjs ${DATA}`, { cwd: ROOT, stdio: "ignore" });
const outData = specCheck();
for (const d of DATA_DEFECTS) results.push({ id: d.id, kind: d.kind, caught: outData.includes(`[${d.id}]`) });
// 2) DIST 欠陥（クリーンビルド＋全パッチ）
cpDir(SRC, DATA);
execSync(`node tools/build.mjs ${DATA}`, { cwd: ROOT, stdio: "ignore" });
patchDistFiles((html) => { for (const d of DIST_DEFECTS) if (html.includes(d.from)) html = html.replace(d.from, d.to); return html; });
const outDist = specCheck();
for (const d of DIST_DEFECTS) results.push({ id: d.id, kind: d.kind, caught: outDist.includes(`[${d.id}]`) });
fs.rmSync(DATA, { recursive: true, force: true });
fs.rmSync(DIST, { recursive: true, force: true });

let ok = true;
console.log("照合の照合（わざと壊して不合格が出るか）:");
for (const r of results) { console.log(`  ${r.caught ? "✓ 検出" : "✗ 取りこぼし"}  ${r.id}  [${r.kind}]`); if (!r.caught) ok = false; }
console.log(ok ? `✓ 全 ${results.length} 種の欠陥を検出` : "✗ 取りこぼしあり（照合に穴）");
process.exit(ok ? 0 : 1);
