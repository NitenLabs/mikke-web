#!/usr/bin/env node
// 店主の編集画面の通し（Playwright。CI では走らせない）。
//   node apps/owner/e2e/flow.mjs [--headed]
// していること：まっさらな置き場所に AMET を種まき → wrangler dev（空いている番号）→ serve.mjs（空いている番号）→
//   1440 と 390 で：AMET の店主で入る → 営業時間・お休み → 品を足す → 上限超えで保存できない → 紹介文 → 表紙の言葉 →
//   写真を差し替える → 下書きに保存 → 別のタブで 409 →「新しい方を読み込む」→ 公開（render:"rebuild"）→ 作り直し（dry-run）ok → 版の一覧
// 数値の確かめ（横のはみ出し・水色の枠・押せる所の大きさ ほか）を出し、画面の写しを docs/gallery/review/owner/ に置く。
// 終わりに 1 行の JSON（checks）を出す。1 つでも通らなければ終了コード 1。
// 後始末（指示 0056）：書いたデータは dist/e2e の中だけ（state・rebuild）。終わったら（失敗しても）立てたサーバーを
//   taskkill /T /F で子まで止め、使った番号で何も待っていないことを確かめ、state と rebuild を消す（ログだけ残す）。
//   手元の dev-state・dist/rebuild には触らない。
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";

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
const procs = [], ports = [], pids = [];
/** 立てたサーバーを子（workerd など）まで止める。Windows は taskkill /T /F */
function killTree(p) {
  if (!p?.pid || p.exitCode !== null || p.signalCode !== null) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    else p.kill("SIGKILL");
  } catch (e) { try { p.kill("SIGKILL"); } catch (_) {} }
}
function cleanup() { while (procs.length) killTree(procs.pop()); }
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { cleanup(); process.exit(130); });
/** 使った番号のうち、まだ待っている（LISTENING）もの */
function listening(list) {
  let out = "";
  try { out = execFileSync(process.platform === "win32" ? "netstat" : "netstat", ["-ano"], { encoding: "utf8" }); } catch (e) { return ["netstat が使えません"]; }
  return list.filter((p) => new RegExp(`[:.]${p}\\s.*LISTEN`).test(out));
}

async function startStack() {
  fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  execFileSync(process.execPath, [path.join(OWNER_DIR, "build.mjs")], { cwd: ROOT, stdio: "inherit" });
  const state = path.join(WORK, "state");
  execFileSync(process.execPath, [path.join(API_DIR, "scripts/seed.mjs"), "--site", SLUG, "--persist-to", state], { cwd: API_DIR, stdio: ["ignore", "ignore", "inherit"] });
  const uiPort = await freePort(); ports.push(uiPort);
  const UI = `http://localhost:${uiPort}`;
  let API;
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiPort = await freePort(), insp = await freePort();
    ports.push(apiPort, insp);
    API = `http://127.0.0.1:${apiPort}`;
    let exited = false;
    wr = spawn(process.execPath, [path.join(API_DIR, "node_modules/wrangler/bin/wrangler.js"), "dev", "--ip", "127.0.0.1", "--port", String(apiPort), "--inspector-port", String(insp), "--persist-to", state,
      "--show-interactive-dev-session=false", "--var", `APP_ORIGINS:${UI}`, "--var", `PUBLIC_PORT:${apiPort}`, "--var", `EDIT_RUNNER_SECRET:${SECRET}`, "--var", "AUTH_SECRET:e2e-secret-0123456789abcdef-0123456789abcdef"],
    { cwd: API_DIR, env: { ...process.env, NO_COLOR: "1", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
    procs.push(wr); pids.push(wr.pid);
    wr.stdout.on("data", (d) => { log += d; }); wr.stderr.on("data", (d) => { log += d; });
    wr.on("exit", () => { exited = true; });
    try { await until(async () => { if (exited) throw new Error("wrangler dev が止まりました"); return (await fetch(`${API}/api/health`)).ok; }, 90000, "wrangler dev"); break; }
    catch (e) { killTree(wr); if (attempt === 2) throw e; await sleep(1000); }
  }
  sv = spawn(process.execPath, [path.join(OWNER_DIR, "dev/serve.mjs"), "--port", String(uiPort), "--api", API, "--secret", SECRET, "--work", path.join(WORK, "rebuild")], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  procs.push(sv); pids.push(sv.pid);
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
const itemNames = (page) => page.$$eval(".items .nm", (els) => els.map((e) => e.textContent));
/** 箱が開き終わるまで待つ（動き・移り変わりが終わり、先祖まで含めた不透明度が 1） */
async function settled(page, sel) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel); if (!el) return false;
    const anims = [el, ...el.querySelectorAll("*")].flatMap((e) => e.getAnimations?.() ?? []);
    if (anims.some((a) => a.playState === "running" || a.playState === "pending")) return false;
    for (let e = el; e; e = e.parentElement) if (Number(getComputedStyle(e).opacity) < 1) return false;
    return true;
  }, sel, { timeout: 10000 });
}
/** 要素を写した画素のうち、墨緑（#2E3B36）に近い所の割合と、いちばん暗い所の明るさ */
async function inkPixels(loc) {
  const png = PNG.sync.read(await loc.screenshot());
  let near = 0, min = 255; const n = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    if (Math.abs(r - 46) + Math.abs(g - 59) + Math.abs(b - 54) < 30) near++;
    min = Math.min(min, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
  }
  return { near: +(near / n).toFixed(3), min };
}
/** 指（タッチ）で長押しして縦に引きずる（CDP のタッチ） */
async function touchDrag(page, x, y0, y1, holdMs = 500) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  await sleep(holdMs);
  const dragging = await page.locator(".item.dragging").count();
  for (let k = 1; k <= 10; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * k) / 10 }] });
  const mid = await page.locator(".item.dragging").count();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  return { dragging, mid };
}

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
    // 右の今の姿が読み込み直しの途中のことがあるので、少し待って見る
    const hlNow = () => frameEval(page, (d) => ({ n: d.querySelectorAll(".mk-hl").length, text: d.querySelector('[data-el="ac_v1"]')?.textContent }));
    const hl = await until(async () => { const v = await hlNow(); return v && v.n >= 1 && /日曜は17:00まで/.test(v.text) ? v : null; }, 8000, "右の営業時間").catch(hlNow);
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
  // 値段の書き方：○〜○円・時価・値段を出さない → ○円 600 に戻す（指示 0056）
  const pvPrice = async () => pc ? frameEval(page, (d, nm) => [...d.querySelectorAll('[data-edit~="list:catalog:mnu_food"] > [data-card]')].find((c) => c.textContent.includes(nm))?.querySelector('[data-cel="c_pr"]')?.textContent ?? "", newName) : null;
  const headPr = () => page.textContent(".item.open .item-head .pr");
  await page.click('.item.open [data-act="price-type"][data-type="range"]');
  await page.fill('.item.open [data-pf="amount"]', "500");
  await page.fill('.item.open [data-pf="max"]', "800");
  const rg = { head: await headPr(), pv: await pvPrice() };
  check(`${tag} 値段の書き方 ○〜○円`, /500円〜800円/.test(rg.head) && (!pc || rg.pv === "500円〜800円"), rg);
  if (!pc) { await page.locator(".item.open .ptype").scrollIntoViewIfNeeded(); await shot(page, "owner2-390-price"); }
  await page.fill('.item.open [data-pf="max"]', "400");
  check(`${tag} ○〜○円 は上の値段が大きくないと保存できない`, await page.locator("#btnSave").isDisabled(), await page.textContent(`.item.open [data-msg$=":prices"]`));
  await page.click('.item.open [data-act="price-type"][data-type="market"]');
  const mk = { head: await headPr(), pv: await pvPrice(), amt: await page.locator('.item.open [data-pf="amount"]').count() };
  check(`${tag} 値段の書き方 時価`, /時価/.test(mk.head) && mk.amt === 0 && (!pc || mk.pv === "時価") && !(await page.locator("#btnSave").isDisabled()), mk);
  await page.click('.item.open [data-act="price-show"][data-on="0"]');
  const ns = { head: await headPr(), pv: await pvPrice(), prices: await page.evaluate((nm) => Object.values(window.OWNER.state().shop.catalog.items).find((i) => i.name === nm)?.prices, newName) };
  check(`${tag} 値段を出さない（prices: []・カードに値段なし）`, Array.isArray(ns.prices) && ns.prices.length === 0 && (!pc || ns.pv === ""), ns);
  await page.click('.item.open [data-act="price-show"][data-on="1"]');
  await page.click('.item.open [data-act="price-type"][data-type="fixed"]');
  await page.fill('.item.open [data-pf="amount"]', "600");
  check(`${tag} ○円 に戻す`, /600円/.test(await headPr()), await headPr());

  // 並べ替え：つまみを引きずる（1440 はマウス、390 は指で長押し）→ 2 つ上へ
  const rowOf = (nm) => page.locator(".items > li").filter({ has: page.locator(".nm", { hasText: nm }) });
  await rowOf(newName).locator(".grip").evaluate((e) => e.scrollIntoView({ block: "center" }));   // 下の保存の帯に隠れないように
  const g0 = await rowOf(newName).locator(".grip").boundingBox();
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".grip"), [g0.x + g0.width / 2, g0.y + g0.height / 2]);
  const lb = await page.locator(".items").boundingBox();
  check(`${tag} 並べ替えのつまみ（44px 以上・右の端）`, g0.width >= 44 && g0.height >= 44 && Math.abs(g0.x + g0.width - (lb.x + lb.width)) < 2, { w: g0.width, h: g0.height, right: Math.round(lb.x + lb.width - g0.x - g0.width) });
  check(`${tag} ↑↓ のボタンは無い`, (await page.locator('[data-act="up"], [data-act="down"]').count()) === 0);
  const nrows = await page.locator(".items > li").count();
  const target = await page.locator(`.items > li:nth-child(${nrows - 2})`).boundingBox();
  const gx = g0.x + g0.width / 2, gy = g0.y + g0.height / 2, ty = target.y + 14;
  let dragInfo;
  if (pc) {
    await page.mouse.move(gx, gy); await page.mouse.down();
    await page.mouse.move(gx, gy - 10, { steps: 2 });
    const d1 = await page.locator(".item.dragging").count();
    await page.mouse.move(gx, ty, { steps: 8 });
    dragInfo = { dragging: d1, mid: await page.locator(".item.dragging").count() };
    await page.mouse.up();
  } else dragInfo = await touchDrag(page, gx, gy, ty);
  let names = await itemNames(page);
  check(`${tag} 引きずって並べ替え（${pc ? "マウス" : "指で長押し"}）`, hit && dragInfo.mid === 1 && names.at(-3) === newName && (await page.locator(".reorder-pop").count()) === 0, { hit, ...dragInfo, last3: names.slice(-3) });
  await sleep(400);   // 引きずった直後の click は数えないので少し置く
  // つまみを押すだけ →「上へ」「下へ」の箱 →「下へ」で 1 つ下（最後から 2 番目）
  if (!(await rowOf(newName).evaluate((e) => e.classList.contains("open")))) await rowOf(newName).locator(".item-head").click();   // 開いた品で箱を出す（指示 0061）
  await rowOf(newName).locator(".grip").click();
  // 箱はその品の中のほかの物（とくに「名前」の見出し・入力）に重ならない（指示 0061）
  const popHit = await page.evaluate(() => {
    const pop = document.querySelector(".reorder-pop"), li = pop?.closest(".item"); if (!li) return { err: "no pop" };
    const pr = pop.getBoundingClientRect();
    const hits = [...li.querySelectorAll("button, input, textarea, label, .note, .msg, .nm, .pr")].filter((e) => !pop.contains(e) && !e.contains(pop)).filter((e) => {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
      return Math.min(r.right, pr.right) - Math.max(r.left, pr.left) > 0.5 && Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top) > 0.5;
    }).map((e) => `${e.tagName}.${e.className}:${(e.textContent || e.getAttribute("data-if") || "").slice(0, 8)}`);
    const nameLbl = [...li.querySelectorAll(".item-body label")].find((l) => l.textContent.trim() === "名前");
    const nameIn = li.querySelector('[data-if="name"]');
    const gap = nameLbl ? Math.round(nameLbl.getBoundingClientRect().top - pr.bottom) : null;
    return { open: li.classList.contains("open"), hasName: !!nameLbl && !!nameIn, hits, gap, pop: { x: Math.round(pr.left), y: Math.round(pr.top), w: Math.round(pr.width), h: Math.round(pr.height) } };
  });
  check(`${tag} 「上へ」「下へ」の箱が開いた品の中身（名前など）に重ならない`, popHit.open && popHit.hasName && popHit.hits.length === 0 && popHit.gap >= 0, popHit);
  if (!pc) { await page.locator(".reorder-pop").evaluate((e) => e.scrollIntoView({ block: "center" })); await shot(page, "owner3-390-popover"); }
  const pop = await page.$$eval(".reorder-pop button", (bs) => bs.map((b) => ({ t: b.textContent, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), dis: b.disabled })));
  check(`${tag} 押すと「上へ」「下へ」の箱（44px 以上）`, pop.length === 2 && pop[0].t === "上へ" && pop[1].t === "下へ" && pop.every((b) => b.w >= 44 && b.h >= 44), pop);
  await page.click('.reorder-pop [data-dir="1"]');
  names = await itemNames(page);
  check(`${tag} 「下へ」で並べ替え（箱は開いたまま）`, names.at(-2) === newName && (await page.locator(".reorder-pop").count()) === 1, names.slice(-3));
  if (!pc) {
    await page.locator(".reorder-pop").scrollIntoViewIfNeeded();
    check(`${tag} 箱を開いても横のはみ出し 0`, (await overflow(page)) <= 0, await overflow(page));
    const sm = await smallTargets(page); check(`${tag} 押せる所 44px 以上（並べ替えの箱）`, sm.length === 0, sm.slice(0, 5));
    await shot(page, "owner2-390-menu-reorder");
  }
  await page.click('.reorder-pop [data-dir="-1"]'); await page.click('.reorder-pop [data-dir="1"]');
  check(`${tag} 「上へ」→「下へ」で元の所`, (await itemNames(page)).at(-2) === newName);
  // 鍵盤：つまみで ↑ ↓、Esc で箱を閉じる
  await rowOf(newName).locator(".grip").focus(); await page.keyboard.press("Escape");
  check(`${tag} Esc で箱を閉じる`, (await page.locator(".reorder-pop").count()) === 0);
  await page.keyboard.press("ArrowUp");
  const kUp = (await itemNames(page)).at(-3) === newName;
  await page.keyboard.press("ArrowDown");
  names = await itemNames(page);
  check(`${tag} 鍵盤の ↑↓ で並べ替え`, kUp && names.at(-2) === newName, names.slice(-3));
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
  await settled(page, "#sheet");
  // 開き終わった箱がはっきり見える（白い覆いが見出し・ボタンに掛かっていない。指示 0056）
  const vis = await page.evaluate(() => ["#sheet h2", "#sheet label.file", "#phOk"].map((s) => { const e = document.querySelector(s); let op = 1; for (let x = e; x; x = x.parentElement) op *= Number(getComputedStyle(x).opacity); return { s, op, color: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor, dis: e.disabled ?? false }; }));
  check(`${tag} 切り抜きの箱：不透明度 1・字は墨緑`, vis.every((v) => v.op === 1 && !v.dis) && vis[0].color === "rgb(46, 59, 54)" && vis[2].bg === "rgb(46, 59, 54)", vis.map((v) => `${v.s} ${v.op} ${v.color}`));
  const px = { h2: await inkPixels(page.locator("#sheet h2")), pick: await inkPixels(page.locator("#sheet label.file")), ok: await inkPixels(page.locator("#phOk")) };
  check(`${tag} 切り抜きの箱：画素も薄くない（見出し・写真を選ぶ・この写真にする）`, px.h2.min < 70 && px.pick.min < 70 && px.ok.near > 0.5, px);
  const box = await page.$eval("#cropBox", (e) => ({ w: e.offsetWidth, h: e.offsetHeight }));
  check(`${tag} 切り抜きの枠は PC の枠の比（0.62）`, Math.abs(box.w / box.h - 0.62) < 0.02, (box.w / box.h).toFixed(3));
  check(`${tag} スマホの枠（点線）が中に`, (await page.locator("#cropSp").count()) === 1);
  await page.fill("#phScale", "60"); await page.locator("#phScale").dispatchEvent("input");
  check(`${tag} 小さく切ると「ぼやけるかも」`, /ぼやける/.test(await page.textContent("#phMsg")), await page.textContent("#phMsg"));
  await page.fill("#phScale", "100"); await page.locator("#phScale").dispatchEvent("input");
  // 写真は箱の幅いっぱい（右に空きが無い。指示 0061）
  const cg = await page.evaluate(() => { const c = document.getElementById("crop"), v = document.getElementById("phCv"), cr = c.getBoundingClientRect(), vr = v.getBoundingClientRect(), pr = c.parentElement.getBoundingClientRect(), cs = getComputedStyle(c.parentElement);
    const inner = pr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (c.parentElement.offsetWidth - c.parentElement.clientWidth);
    const pl = pr.left + parseFloat(cs.paddingLeft), maxH = Math.max(200, Math.round(innerHeight * 0.55));
    return { crop: +cr.width.toFixed(1), img: +vr.width.toFixed(1), inner: +inner.toFixed(1), rightGap: +(cr.right - vr.right).toFixed(1), h: +(cr.height - vr.height).toFixed(1),
      imgH: +vr.height.toFixed(1), maxH, lGap: +(cr.left - pl).toFixed(1), rGap: +(pl + inner - cr.right).toFixed(1) }; });
  // 高さで抑えていないときは幅いっぱい（右の空き 0）。抑えたとき（画面の 55%）は写真が真ん中で、左右の空きが同じ
  const hLimited = cg.inner - cg.crop > 1;
  check(`${tag} 切り抜きの写真は箱の幅いっぱい（右の空き 0）か、高さで抑えて真ん中`, Math.abs(cg.img - cg.crop) <= 1 && Math.abs(cg.rightGap) <= 1 && Math.abs(cg.h) <= 1 && cg.imgH <= cg.maxH + 1
    && (hLimited ? Math.abs(cg.imgH - cg.maxH) <= 1 && Math.abs(cg.lGap - cg.rGap) <= 1 : Math.abs(cg.crop - cg.inner) <= 1), { ...cg, hLimited });
  // 「やめる」「この写真にする」は箱の見える所に全部入り、上に何も重ならず、44px 以上（指示 0061 の続き）
  const acts = await page.evaluate(() => { const sin = document.querySelector("#sheet .sheet-in").getBoundingClientRect();
    return ["#phCancel", "#phOk"].map((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { s, top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), h: +r.height.toFixed(1), inVp: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
        inSheet: r.top >= sin.top && r.bottom <= sin.bottom && r.left >= sin.left && r.right <= sin.right, hit: t === e || e.contains(t) }; }); });
  check(`${tag} 切り抜きの箱：「やめる」「この写真にする」が画面と箱の中に全部見え、押せる（44px 以上）`, acts.every((a) => a.inVp && a.inSheet && a.hit && a.h >= 44), acts);
  if (W <= 760) { await page.$eval(".sheet-in", (e) => { e.scrollTop = 0; }); await settled(page, "#sheet"); await shot(page, "owner2-390-crop"); await shot(page, "owner3-390-crop"); }
  await page.click("#phOk");
  await page.waitForSelector("#sheet[hidden]", { state: "attached", timeout: 30000 });
  const asset = await page.evaluate(() => window.OWNER.state().site.draft.content?.fv_1?.asset);
  check(`${tag} 写真が新しい素材に`, /^ast_/.test(asset) && asset !== "ast_fv01", asset);
  const vars = await apiGet(page, `/api/shops/${SHOP}/assets/${asset}/variants`);
  check(`${tag} 大きさ違いも上がった`, (vars.variants ?? []).length >= 2, vars.widths);
  if (pc) check(`${tag} 右の写真も替わる`, (await frameEval(page, (d) => d.querySelector('[data-el="fv_1"] img')?.getAttribute("src")))?.includes(asset));

  // 下書きに保存
  if (pc) await shot(page, "owner2-1440-editing");
  await page.click("#btnSave");
  await until(async () => /下書きに保存しました/.test(await saveMsg(page)), 20000, "保存");
  const dShop = await apiGet(page, `/api/shops/${SHOP}/drafts/shop`), dSite = await apiGet(page, `/api/shops/${SHOP}/drafts/site`);
  check(`${tag} 下書き ① に入った`, dShop.data.hours.weekly.wed.status === "closed" && Object.values(dShop.data.catalog.items).some((i) => i.name === newName) && dShop.data.story.answers.q_body.answer === body);
  check(`${tag} 下書き ② に入った（content の形。0065）`, dSite.data.draft.content?.fv_1?.asset === asset && dSite.data.draft.content?.fv_copy === "あさの一杯を、\nどうぞ。", dSite.data.draft.content);
  check(`${tag} 下書き ② に site.json の写し（elements・genConfig）が無い`, dSite.data.draft.elements === undefined && dSite.data.draft.genConfig === undefined && JSON.stringify(dSite.data.draft.sections) === "{}", Object.keys(dSite.data.draft));
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
  check(`${tag} 作り直しで ② の写真を付け替えた（元の素材の file を新しい写真に）`, (lp?.rebuild?.swapped ?? []).includes(`fv_1:ast_fv01→${asset}`), lp?.rebuild?.swapped);
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
  // 試験で書いたデータ（409 の「ほかのタブで直した見出し」ほか）を消す。次は毎回まっさらから
  await sleep(1500);
  const still = listening(ports);
  check("立てたサーバーは止めた（使った番号で待っている物 0）", still.length === 0, { pids, ports, still });
  for (const d of ["state", "rebuild"]) { try { fs.rmSync(path.join(WORK, d), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch (e) { check(`後始末：${d} を消した`, false, e.message); } }
  check("試験のデータを消した（dist/e2e/state・rebuild）", !fs.existsSync(path.join(WORK, "state")) && !fs.existsSync(path.join(WORK, "rebuild")));
}
const ng = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ checks: checks.length, ok: checks.length - ng.length, ng: ng.map((c) => c.name), seconds: Math.round((Date.now() - t0) / 1000), shots: SHOTS }));
process.exit(ng.length ? 1 : 0);
