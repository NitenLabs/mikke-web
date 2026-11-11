// 作り直し（0045 段1）の純粋な部品の試験：アドレスの決め方・wrangler の命令・壊れた画像・noindex・前との違い・--from の重ね方。
// 通信・ブラウザは使わない。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RebuildError, brokenImages, deployCommands, diffDirs, noindexMarks, overlayFrom, resolveSiteUrl, templateOf, ROOT } from "./lib/rebuild.mjs";

const CFG = { mikkeDomain: null, pagesProjectPrefix: "mikke-", previewProject: "nitenlabs-preview" };
const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof RebuildError, String(e)); return e.code; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rebuild-test-"));
const put = (d, f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };

test("アドレス：deploy.json が無ければ pages", () => {
  const r = resolveSiteUrl("amet", null, CFG);
  assert.equal(r.kind, "pages");
  assert.equal(r.project, "mikke-amet");
  assert.equal(r.url, "https://mikke-amet.pages.dev/");
  assert.equal(r.pending, null);
});

test("アドレス：mikke はドメインが未設定なら pages のまま pending", () => {
  const r = resolveSiteUrl("amet", { domain: { kind: "mikke" } }, CFG);
  assert.equal(r.url, "https://mikke-amet.pages.dev/");
  assert.match(r.pending, /mikkeDomain/);
});

test("アドレス：mikke はドメインを1か所書けば <名前>.<ドメイン>", () => {
  const cfg = { ...CFG, mikkeDomain: "ashiya-mikke.com" };
  assert.equal(resolveSiteUrl("amet", { domain: { kind: "mikke" } }, cfg).url, "https://amet.ashiya-mikke.com/");
  assert.equal(resolveSiteUrl("amet", { domain: { kind: "mikke", name: "amet-coffee" } }, cfg).url, "https://amet-coffee.ashiya-mikke.com/");
  assert.equal(code(() => resolveSiteUrl("amet", { domain: { kind: "mikke", name: "a_b" } }, cfg)), "deploy");
});

test("アドレス：own は店のドメイン（形を確かめる）", () => {
  assert.equal(resolveSiteUrl("amet", { domain: { kind: "own", name: "amet-coffee.jp" } }, CFG).url, "https://amet-coffee.jp/");
  assert.equal(resolveSiteUrl("amet", { domain: { kind: "own", name: "https://www.Amet.co.jp/" } }, CFG).host, "www.amet.co.jp");
  assert.equal(code(() => resolveSiteUrl("amet", { domain: { kind: "own" } }, CFG)), "deploy");
  assert.equal(code(() => resolveSiteUrl("amet", { domain: { kind: "own", name: "x.pages.dev" } }, CFG)), "deploy");
  assert.equal(code(() => resolveSiteUrl("amet", { domain: { kind: "ftp" } }, CFG)), "deploy");
});

test("アドレス：本番のプロジェクトは営業用の見本と混ぜない・店の名前の形", () => {
  assert.equal(code(() => resolveSiteUrl("preview", null, { ...CFG, pagesProjectPrefix: "nitenlabs-" })), "deploy");
  assert.equal(code(() => resolveSiteUrl("../amet", null, CFG)), "site");
});

test("wrangler の命令：プロジェクト mikke-<店> に上げる形（走らせない）", () => {
  const c = deployCommands(resolveSiteUrl("amet", null, CFG), "C:\\x\\out");
  assert.equal(c.deploy, "npx wrangler pages deploy C:/x/out --project-name mikke-amet --branch main --commit-dirty=true");
  assert.equal(c.create, "npx wrangler pages project create mikke-amet --production-branch main");
  assert.doesNotMatch(c.deploy, /nitenlabs-preview/);
});

test("壊れた画像と noindex を書き出しから見つける", () => {
  const d = tmp();
  put(d, "assets/a.webp", "x");
  put(d, "index.html", `<head><meta name="robots" content="noindex,nofollow"></head><img src="assets/a.webp"><img src="assets/b.webp"><img src="https://e.x/c.jpg"><div style="background:url('assets/a.webp')"></div>`);
  put(d, "menu/index.html", `<img srcset="../assets/a.webp 1x, ../assets/z.webp 2x">`);
  assert.deepEqual(brokenImages(d).map((b) => `${b.page} ${b.src}`).sort(), ["index.html assets/b.webp", "menu/index.html ../assets/z.webp"]);
  assert.deepEqual(noindexMarks(d).map((n) => n.page), ["index.html"]);
  put(d, "_headers", "/*\n  X-Robots-Tag: noindex, nofollow\n");
  assert.equal(noindexMarks(d).length, 2);
});

test("前との違い：印（data-edit）だけの違いを見分ける・_layout.json は見ない", () => {
  const a = tmp(), b = tmp();
  put(a, "index.html", `<p data-el="x">あ</p>`); put(b, "index.html", `<p data-el="x" data-edit="text:x">あ</p>`);
  put(a, "404.html", `<p>1</p>`); put(b, "404.html", `<p>2</p>`);
  put(a, "_layout.json", "1"); put(b, "_layout.json", "2");
  put(b, "assets/n.webp", "n");
  const r = diffDirs(a, b);
  assert.deepEqual(r.files.map((f) => `${f.file}:${f.change}`), ["404.html:modified", "assets/n.webp:added", "index.html:modified"]);
  assert.deepEqual(r.pages.map((p) => `${p.file}:${p.onlyEditMarks}`), ["404.html:false", "index.html:true"]);
  assert.deepEqual(diffDirs(null, b).pages, []);
});

test("--from：① と店の設定と media/ だけを重ねる", () => {
  const from = tmp(), dest = tmp();
  put(from, "shop.json", "{}"); put(from, "assets.json", "{}"); put(from, "wa03.json", "{}"); put(from, "media/p.webp", "p");
  put(from, "evil.mjs", "x"); put(from, "other/q.txt", "q");
  assert.deepEqual(overlayFrom(from, dest).sort(), ["assets.json", "media/p.webp", "shop.json", "wa03.json"]);
  assert.ok(!fs.existsSync(path.join(dest, "evil.mjs")));
  assert.equal(code(() => overlayFrom(dest + "-none", tmp())), "from");
});

test("店の型は site.json の templateId から", () => {
  assert.equal(templateOf(path.join(ROOT, "samples", "amet")), "wa03");
  assert.equal(templateOf(path.join(ROOT, "samples", "ashinoha")), "wa23");
});
