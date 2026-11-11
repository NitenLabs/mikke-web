#!/usr/bin/env node
// 店主の編集画面の通し（Playwright。CI では走らせない）。
//   node apps/owner/e2e/flow.mjs [--headed]
// していること：まっさらな置き場所に AMET を種まき → wrangler dev（空いている番号）→ serve.mjs（空いている番号）→
//   1440 と 390 で：AMET の店主で入る → 営業時間・お休み → 品を足す → 上限超えで保存できない → 紹介文 → 表紙の言葉 →
//   写真を差し替える → 下書きに保存 → 別のタブで 409 →「新しい方を読み込む」→ 公開（render:"rebuild"）→ 作り直し（dry-run）ok → 版の一覧
// 数値の確かめ（横のはみ出し・水色の枠・押せる所の大きさ ほか）を出し、画面の写しを docs/gallery/review/owner/ に置く。
// 終わりに 1 行の JSON（checks）を出す。1 つでも通らなければ終了コード 1。
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWNER_DIR = path.resolve(HERE, "..");
const ROOT = path.resolve(OWNER_DIR, "../..");
const API_DIR = path.join(ROOT, "apps/api");
const WORK = path.join(OWNER_DIR, "dist/e2e");
const SHOTS = path.join(ROOT, "docs/gallery/review/owner");
const OWNER = "owner@amet.example", SHOP = "shp_amet", SLUG = "amet";
const SECRET = "e2e-runner-secret-0123456789abcdef-0123456789";
const PHOTO = path.join(ROOT, "samples/amet/media/ast_sr01.jpg");

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); s.on("error", rej); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000, what = "") { const t0 = Date.now(); let last; while (Date.now() - t0 < ms) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await sleep(150); } throw new Error(`待ちきれませんでした：${what} ${last instanceof Error ? last.message : ""}`); }

const checks = [];
function check(name, ok, value) { checks.push({ name, ok: !!ok, value }); console.log(`${ok ? "ok  " : "NG  "} ${name}${value !== undefined ? `：${typeof value === "object" ? JSON.stringify(value) : value}` : ""}`); }

let wr, sv, browser, log = "", svlog = "";
const procs = [];
function cleanup() { for (const p of procs) { try { p.kill("SIGTERM"); } catch (e) {} } }
process.on("exit", cleanup);

async function startStack() {
  fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  execFileSync(process.execPath, [path.join(OWNER_DIR, "build.mjs")], { cwd: ROOT, stdio: "inherit" });
  const state = path.join(WORK, "state");
  execFileSync(process.execPath, [path.join(API_DIR, "scripts/seed.mjs"), "--site", SLUG, "--persist-to", state], { cwd: API_DIR, stdio: ["ignore", "ignore", "inherit"] });
  const uiPort = await freePort();
  const UI = `http://localhost:${uiPort}`;
  let API;
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiPort = await freePort(), insp = await freePort();
    API = `http://127.0.0.1:${apiPort}`;
    let exited = false;
    wr = spawn(process.execPath, [path.join(API_DIR, "node_modules/wrangler/bin/wrangler.js"), "dev", "--ip", "127.0.0.1", "--port", String(apiPort), "--inspector-port", String(insp), "--persist-to", state,
      "--show-interactive-dev-session=false", "--var", `APP_ORIGINS:${UI}`, "--var", `PUBLIC_PORT:${apiPort}`, "--var", `EDIT_RUNNER_SECRET:${SECRET}`, "--var", "AUTH_SECRET:e2e-secret-0123456789abcdef-0123456789abcdef"],
    { cwd: API_DIR, env: { ...process.env, NO_COLOR: "1", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
    procs.push(wr);
    wr.stdout.on("data", (d) => { log += d; }); wr.stderr.on("data", (d) => { log += d; });
    wr.on("exit", () => { exited = true; });
    try { await until(async () => { if (exited) throw new Error("wrangler dev が止まりました"); return (await fetch(`${API}/api/health`)).ok; }, 90000, "wrangler dev"); break; }
    catch (e) { try { wr.kill("SIGKILL"); } catch (_) {} if (attempt === 2) throw e; await sleep(1000); }
  }
  sv = spawn(process.execPath, [path.join(OWNER_DIR, "dev/serve.mjs"), "--port", String(uiPort), "--api", API, "--secret", SECRET], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  procs.push(sv);
  sv.stdout.on("data", (d) => { svlog += d; }); sv.stderr.on("data", (d) => { svlog += d; });
  await until(async () => (await fetch(`${UI}/`)).ok, 20000, "serve.mjs");
  // 下地を先に作っておく（初回は rebuild-shop で 10 秒ほど）
  await until(async () => (await fetch(`${UI}/preview/${SLUG}/index.html`)).ok, 180000, "下地");
  return { UI, API };
}

const mails = (to) => [...log.matchAll(/\[mail\] to=(\S+) code=(\d{6}) link=(\S+)/g)].filter((m) => m[1] === to).map((m) => ({ code: m[2], link: m[3] }));

async function login(page, UI) {
  await page.goto(UI + "/");
  await page.waitForSelector("#lgEmail");
  const n = mails(OWNER).length;
  await page.fill("#lgEmail", OWNER);
  await page.click("#lgMail button");
  await page.waitForSelector("#lgCode:not([hidden])");
  const m = await until(() => mails(OWNER)[n], 15000, "メールのコード");
  await page.fill("#lgCodeIn", "12");
  await page.click("#lgCode button");
  check("6 桁でないと入らない", /6 桁/.test(await page.textContent("#lgMsg")));
  await page.fill("#lgCodeIn", m.code);
  await page.click("#lgCode button");
  await waitReady(page);
}
const waitReady = (page) => page.waitForFunction(() => window.OWNER?.ready, null, { timeout: 60000 });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const openSec = async (page, id) => { if (!(await page.locator(`[data-sec="${id}"].open`).count())) await page.click(`[data-sec="${id}"] .sec-head`); await page.waitForSelector(`[data-sec="${id}"].open .sec-body > *`); };
const frameEval = (page, fn, arg) => page.evaluate(([src, a]) => { const d = document.getElementById("pvIframe")?.contentDocument; return d ? new Function("d", "a", `return (${src})(d, a)`)(d, a) : null; }, [fn.toString(), arg]);
const apiGet = (page, p) => page.evaluate(async (p) => (await fetch(p, { credentials: "include" })).json(), p);
const saveMsg = (page) => page.textContent("#saveMsg");
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

/** 小さい押せる所（44px 未満）の数。見えている btn・入力・段の見出し */
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll("button, input:not([type=checkbox]):not([type=file]), textarea, .sec-head")]
  .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; })
  .filter((e) => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; })
  .map((e) => `${e.tagName}.${e.className}:${e.textContent.trim().slice(0, 10)}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));

async function flow(ctx, UI, W, { first }) {
  const tag = `${W}`;
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  if (first) await login(page, UI); else { await page.goto(UI + "/"); await waitReady(page); }
  check(`${tag} 入れた（店の名前）`, (await page.textContent(".bar .shop"))?.includes("AMET"));
  const pc = W > 760;
  check(`${tag} 今の姿の iframe ${pc ? "あり" : "なし（1 列）"}`, pc === (await page.locator("#pvIframe").count() > 0));
  if (pc) {
    await page.waitForFunction(() => document.getElementById("pvIframe")?.contentDocument?.querySelector("[data-edit]"), null, { timeout: 60000 });
    check(`${tag} iframe は 1440 を縮めて出す`, Number(await page.getAttribute("#pvFrame", "data-scale")) < 1, await page.getAttribute("#pvFrame", "data-scale"));
  }
  await shot(page, `owner-${tag}-1-top`);

  // 営業時間とお休み
  await openSec(page, "hours");
  check(`${tag} 開いている段は 1 つ`, (await page.locator(".sec.open").count()) === 1);
  await page.click('[data-day="wed"] [data-st="closed"]');
  await page.fill('[data-day="sun"] [data-hours="end"]', W > 760 ? "17:00" : "16:00");
  await page.locator('[data-day="sun"] [data-hours="end"]').dispatchEvent("change");
  const shown = await page.textContent("#hoursShown");
  check(`${tag} 営業時間の表示`, /日曜は1[67]:00まで/.test(shown), shown);
  check(`${tag} 定休日の表示`, (await page.textContent("#closedShown")) === "水曜");
  if (pc) {
    const hl = await frameEval(page, (d) => ({ n: d.querySelectorAll(".mk-hl").length, text: d.querySelector('[data-el="ac_v1"]')?.textContent }));
    check(`${tag} 水色の枠（営業時間）`, hl.n >= 1, hl.n);
    check(`${tag} 右の営業時間も変わる`, /日曜は17:00まで/.test(hl.text), hl.text);
  }
  if (!pc) await shot(page, `owner-${tag}-2-hours`);

  // お品書き：品を足す
  await openSec(page, "menu");
  check(`${tag} 段を開くと前の段は閉じる`, (await page.locator(".sec.open").count()) === 1 && !(await page.locator('[data-sec="hours"].open').count()));
  const before = await page.locator(".items > li").count();
  await page.click('[data-act="add"]');
  const newName = W > 760 ? "ほうじ茶ラテ" : "レモネード";
  await page.fill('.item.open [data-if="name"]', newName);
  await page.fill('.item.open [data-if="description"]', "香ばしい、やさしい一杯。");
  await page.click('.item.open [data-act="price-show"][data-on="1"]');   // 足した品は「値段を出さない」から始まる（指示 0056）
  await page.fill('.item.open [data-pf="amount"]', "600");
  check(`${tag} 品が 1 つ増えた`, (await page.locator(".items > li").count()) === before + 1, `${before}→${before + 1}`);
  check(`${tag} 品は 1 つずつ開く`, (await page.locator(".item.open").count()) === 1);
  // 上限超え：16 字の名前 → 保存できない・理由がすぐ出る
  await page.fill('.item.open [data-if="name"]', "あ".repeat(16));
  const errMsg = await page.textContent('.item.open [data-msg$=":name"]');
  check(`${tag} 上限超えで保存できない`, await page.locator("#btnSave").isDisabled(), errMsg);
  check(`${tag} 理由がその場に出る`, /15 字までにしてください（今 16 字）/.test(errMsg));
  await page.fill('.item.open [data-if="name"]', newName);
  check(`${tag} 直すと保存できる`, !(await page.locator("#btnSave").isDisabled()));
  // 並べ替え（上へ 1 つ）
  await page.click('.item.open [data-act="up"]');
  const names = await page.$$eval(".items .nm", (els) => els.map((e) => e.textContent));
  check(`${tag} 並べ替え`, names.at(-2) === newName, names.slice(-3));
  if (pc) {
    const cards = await frameEval(page, (d, nm) => { const cs = [...d.querySelectorAll('[data-edit~="list:catalog:mnu_food"] > [data-card]')]; return { n: cs.length, idx: cs.findIndex((c) => c.textContent.includes(nm)), price: cs.find((c) => c.textContent.includes(nm))?.querySelector('[data-cel="c_pr"]')?.textContent, hl: d.querySelectorAll(".mk-hl").length }; }, newName);
    check(`${tag} 右に品のカードが増える`, cards.n === before + 1 && cards.idx === cards.n - 2, cards);
    check(`${tag} 右の値段`, cards.price === "600円", cards.price);
    check(`${tag} 水色の枠（品）`, cards.hl >= 1, cards.hl);
  } else await shot(page, `owner-${tag}-3-menu`);

  // お店の紹介
  await openSec(page, "story");
  const body = `${W} の画面で直した紹介文です。\n朝 8 時半から開いています。`;
  await page.fill("#fBody", body);
  check(`${tag} 紹介文の残りの字数`, /あと \d+ 字/.test(await page.textContent('[data-msg="body"]')), await page.textContent('[data-msg="body"]'));
  if (pc) {
    const t = await frameEval(page, (d) => ({ text: d.querySelector('[data-el="st_body"]')?.textContent, pg: d.querySelectorAll('[data-el="st_body"] > .pg').length, hl: d.querySelector('[data-el="st_body"]')?.classList.contains("mk-hl") }));
    check(`${tag} 右の紹介文も変わる`, t.text?.includes(`${W} の画面で直した`) && t.pg === 2, t);
    check(`${tag} 水色の枠（紹介文）`, t.hl);
  }

  // 表紙の言葉
  await openSec(page, "fv");
  await page.fill("#fFv", "あさの一杯を、\nどうぞ。");
  if (pc) check(`${tag} 右の表紙の言葉`, (await frameEval(page, (d) => d.querySelector('[data-el="fv_copy"]')?.textContent)) === "あさの一杯を、どうぞ。");
  await page.fill("#fFv", "あさの一杯を、ゆっくりどうぞ。\nどうぞ。");
  const fvMsg = await page.textContent('[data-msg="fv"]');
  check(`${tag} 表紙の言葉の既定の上限（下地の最長＋2 字＝11 字）`, (await page.locator("#btnSave").isDisabled()) && /11 字まで/.test(fvMsg), fvMsg);
  await page.fill("#fFv", "あさの一杯を、\nどうぞ。");

  // 写真
  await openSec(page, "photos");
  await page.click('[data-act="photo"][data-el="fv_1"]');
  await page.setInputFiles("#phFile", PHOTO);
  await page.waitForSelector("#crop:not([hidden])");
  const box = await page.$eval("#cropBox", (e) => ({ w: e.offsetWidth, h: e.offsetHeight }));
  check(`${tag} 切り抜きの枠は PC の枠の比（0.62）`, Math.abs(box.w / box.h - 0.62) < 0.02, (box.w / box.h).toFixed(3));
  check(`${tag} スマホの枠（点線）が中に`, (await page.locator("#cropSp").count()) === 1);
  await page.fill("#phScale", "60"); await page.locator("#phScale").dispatchEvent("input");
  check(`${tag} 小さく切ると「ぼやけるかも」`, /ぼやける/.test(await page.textContent("#phMsg")), await page.textContent("#phMsg"));
  await page.fill("#phScale", "100"); await page.locator("#phScale").dispatchEvent("input");
  if (W <= 760) await shot(page, `owner-${tag}-4-crop`);
  await page.click("#phOk");
  await page.waitForSelector("#sheet[hidden]", { state: "attached", timeout: 30000 });
  const asset = await page.evaluate(() => window.OWNER.state().site.draft.elements.fv_1.asset);
  check(`${tag} 写真が新しい素材に`, /^ast_/.test(asset) && asset !== "ast_fv01", asset);
  const vars = await apiGet(page, `/api/shops/${SHOP}/assets/${asset}/variants`);
  check(`${tag} 大きさ違いも上がった`, (vars.variants ?? []).length >= 2, vars.widths);
  if (pc) check(`${tag} 右の写真も替わる`, (await frameEval(page, (d) => d.querySelector('[data-el="fv_1"] img')?.getAttribute("src")))?.includes(asset));

  // 下書きに保存
  if (pc) await shot(page, `owner-${tag}-2-editing`);
  await page.click("#btnSave");
  await until(async () => /下書きに保存しました/.test(await saveMsg(page)), 20000, "保存");
  const dShop = await apiGet(page, `/api/shops/${SHOP}/drafts/shop`), dSite = await apiGet(page, `/api/shops/${SHOP}/drafts/site`);
  check(`${tag} 下書き ① に入った`, dShop.data.hours.weekly.wed.status === "closed" && Object.values(dShop.data.catalog.items).some((i) => i.name === newName) && dShop.data.story.answers.q_body.answer === body);
  check(`${tag} 下書き ② に入った`, dSite.data.draft.elements.fv_1.asset === asset && dSite.data.draft.genConfig.fvCopy.join("") === "あさの一杯を、どうぞ。");
  check(`${tag} 状態の文字`, /公開/.test(await page.textContent("#state")), await page.textContent("#state"));

  // 別のタブで先に保存 → こちらで保存すると 409 → 新しい方を読み込む
  const other = await ctx.newPage();
  await other.goto(UI + "/"); await waitReady(other);
  await other.evaluate(async ([shop]) => {
    const d = await (await fetch(`/api/shops/${shop}/drafts/shop`, { credentials: "include" })).json();
    d.data.story.answers.q_catch.answer = "ほかのタブで\n直した見出し";
    await fetch(`/api/shops/${shop}/drafts/shop`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", "If-Match": `"${d.version}"` }, body: JSON.stringify(d.data) });
  }, [SHOP]);
  await other.close();
  await openSec(page, "story");
  await page.fill("#fCatch", "こちらの\n見出し");
  await page.click("#btnSave");
  await page.waitForSelector("[data-conflict]", { timeout: 15000 });
  check(`${tag} 409 で「ほかの所で直されました」`, (await page.textContent("[data-conflict] h2")) === "ほかの所で直されました");
  if (!pc) await shot(page, `owner-${tag}-5-conflict`);
  await page.click("#cfTheirs");
  await until(async () => /新しい方を読み込みました/.test(await saveMsg(page)), 15000, "読み込み");
  check(`${tag} 新しい方を読み込んだ`, (await page.inputValue("#fCatch")) === "ほかのタブで\n直した見出し");
  const bks = await apiGet(page, `/api/shops/${SHOP}/backups`);
  check(`${tag} 自分の分は backups に残る`, (bks.backups ?? bks).length >= 1, (bks.backups ?? bks).length);

  // 公開 → 作り直し（dry-run）→ 版
  await page.click("#btnPublish");
  await page.click("#pbYes");
  await until(async () => /公開しました|作れませんでした|手続き/.test(await saveMsg(page)), 240000, "公開と作り直し");
  const msg = await saveMsg(page);
  const lp = await page.evaluate(() => window.OWNER.state().lastPublish);
  check(`${tag} 公開した（render:"rebuild"）`, lp?.render === "pending" && lp.number >= 1, { number: lp?.number, render: lp?.render });
  check(`${tag} 作り直し（dry-run）ok`, lp?.rebuild?.render?.state === "ok" && /公開しました/.test(msg), { state: lp?.rebuild?.render?.state, publishable: lp?.rebuild?.publishable, ms: lp?.rebuild?.ms, swapped: lp?.rebuild?.swapped, error: lp?.rebuild?.error });
  await page.click("#btnVersions");
  await page.waitForSelector("[data-version]");
  const vs = await page.$$eval("[data-version]", (els) => els.map((e) => ({ n: e.dataset.version, now: e.textContent.includes("いま公開中"), r: e.querySelector("[data-render]")?.dataset.render })));
  check(`${tag} 版の一覧`, vs.length >= 1 && vs[0].n === String(lp.number) && vs[0].now && vs[0].r === "ok", vs);
  check(`${tag} 戻すボタン`, (await page.locator("[data-restore]").count()) === vs.length);
  await shot(page, `owner-${tag}-6-versions`);
  await page.click("#vClose");

  // 数値の確かめ（はみ出し・押せる所）
  for (const id of ["hours", "menu"]) {
    await openSec(page, id);
    if (id === "menu") await page.click(".items > li:first-child .item-head");
    check(`${tag} 横のはみ出し 0（${id}）`, (await overflow(page)) <= 0, await overflow(page));
    if (!pc) { const sm = await smallTargets(page); check(`${tag} 押せる所 44px 以上（${id}）`, sm.length === 0, sm.slice(0, 5)); }
  }
  check(`${tag} 画面のエラー 0`, errs.length === 0, errs.slice(0, 3));
  await page.close();
  return lp;
}

const t0 = Date.now();
try {
  const { UI } = await startStack();
  console.log(`stack: ${UI}（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  browser = await chromium.launch({ headless: !process.argv.includes("--headed") });
  const pcCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp1 = await flow(pcCtx, UI, 1440, { first: true });
  const state = await pcCtx.storageState();
  // 同じお店の公開は 1 分に 1 回まで
  const spCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: state });
  void lp1;
  await sleep(61000);
  await flow(spCtx, UI, 390, { first: false });
} catch (e) {
  check("通しが最後まで走った", false, String(e.message ?? e).slice(0, 400));
} finally {
  try { await browser?.close(); } catch (e) {}
  cleanup();
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(path.join(WORK, "wrangler.log"), log);
  fs.writeFileSync(path.join(WORK, "serve.log"), svlog);
}
const ng = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ checks: checks.length, ok: checks.length - ng.length, ng: ng.map((c) => c.name), seconds: Math.round((Date.now() - t0) / 1000), shots: SHOTS }));
process.exit(ng.length ? 1 : 0);
