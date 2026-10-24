// 編集画面を API（apps/api）につないだ通しの試験（M3）。Node ＋ Playwright。
//   npm run build:editor
//   node --test apps/editor/test/e2e-api.test.mjs          （ブラウザを使うので、ほかの確かめと同時に走らせない）
// していること：
//   1 apps/api の種まき（芦屋堂。毎回まっさらな置き場所 dist/e2e-api/state に）→ wrangler dev を空いている番号で立てる
//   2 編集画面（dist/editor_single.html）を手元の小さなサーバーで配り、?api=…&shop=shp_ashiyado で開く（ApiStore）
//   3 ログイン（メールアドレス → wrangler dev のログに出るコード → 入る）
//   4 見出しを書き換える → 自動保存 → 読み込み直しても残る（サーバーの下書きにも入っている）
//   5 写真を差し替える → ブラウザで縮めて大きさ違いと一緒に上げる → ④ の ID に付け替わる
//   6 公開 → 「公開しました」と公開ページのアドレス → 公開ページ（ashiyado.localhost:<番号>）に新しい見出しと写真
//   7 もう1つのブラウザ（別の context）で、メールのリンク（/login#t=…）で入って直す → 1つ目で直すと「ほかの端末で変更されました」の箱
//     →「ほかの変更を読み込む」（自分の直しは戻す前の下書きに）／もう一度ぶつけて「自分の直しで上書きする」（ほかの変更は戻す前の下書きに）
//   M3b ほかの端末からもログアウト → 1つ目で直すとログインが切れた（401）→ 手元に退避してログインの箱 → 入り直すと保存
//       ログインが切れたまま読み込み直す → 入ると退避した下書きが出る → サーバーが先に進んでいれば箱 → 上書き
//       写真を上げている途中に閉じようとすると警告 → 読み込み直すと上げ直す／ログアウト
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const API_DIR = path.join(ROOT, "apps/api");
const HTML = path.join(ROOT, "apps/editor/dist/editor_single.html");
const WORK = path.join(ROOT, "apps/editor/dist/e2e-api");
const OWNER = "owner@ashiyado.example", PRODUCER = "producer@example.com";
// 同じアドレスのログインのメールは 60 秒あけないと送れないので、入り直す場面は別の人（制作側。どのお店も直せる）で入る
const P2 = "producer2@example.com", P3 = "producer3@example.com";
const SHOP = "shp_ashiyado";
const HEAD = "見出しを API で書き換えた M3";

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); s.on("error", rej); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000, what = "") { const t0 = Date.now(); let last; while (Date.now() - t0 < ms) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await sleep(100); } throw new Error("待ちきれませんでした：" + what + " " + (last instanceof Error ? last.message : "")); }

let wr, edServer, browser, API, ED, apiPort, log = "";

before(async () => {
  assert.ok(fs.existsSync(HTML), "先に npm run build:editor");
  fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(WORK, { recursive: true });
  const state = path.join(WORK, "state");
  execFileSync(process.execPath, [path.join(API_DIR, "scripts/seed.mjs"), "--producer", PRODUCER, "--owner", OWNER, "--persist-to", state], { cwd: API_DIR, stdio: ["ignore", "ignore", "inherit"] });
  const now = new Date().toISOString();
  execFileSync(path.join(API_DIR, "node_modules/.bin/wrangler"), ["d1", "execute", "mikke", "--local", "--persist-to", state, "--command",
    [P2, P3].map((e, i) => `INSERT INTO users (id, email, name, role, created_at) VALUES ('usr_e2eprod${i + 2}', '${e}', '制作${i + 2}', 'producer', '${now}');`).join(" ")],
  { cwd: API_DIR, stdio: ["ignore", "ignore", "inherit"] });
  const edPort = await freePort(); ED = `http://localhost:${edPort}`;
  // 編集画面を配る（/ と /login のどちらも同じページ。ログインのリンクは <APP_ORIGINS の先頭>/login#t=…）
  const html = fs.readFileSync(HTML);
  edServer = http.createServer((req, res) => {
    const p = new URL(req.url, ED).pathname;
    if (p === "/" || p === "/login") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => edServer.listen(edPort, "127.0.0.1", r));
  // wrangler dev（中で使う番号がたまたまぶつかって起動に失敗することがあるので、番号を変えて 3 回まで）
  const wrangler = path.join(API_DIR, "node_modules/.bin/wrangler");
  for (let attempt = 0; attempt < 3; attempt++) {
    apiPort = await freePort(); const inspPort = await freePort(); API = `http://localhost:${apiPort}`;
    let exited = false;
    wr = spawn(wrangler, ["dev", "--ip", "127.0.0.1", "--port", String(apiPort), "--inspector-port", String(inspPort), "--persist-to", state, "--show-interactive-dev-session=false",
      "--var", `APP_ORIGINS:${ED}`, "--var", `PUBLIC_PORT:${apiPort}`, "--var", "AUTH_SECRET:e2e-secret-0123456789abcdef-0123456789abcdef"],
    { cwd: API_DIR, env: { ...process.env, NO_COLOR: "1", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
    wr.stdout.on("data", (d) => { log += d; }); wr.stderr.on("data", (d) => { log += d; });
    wr.on("exit", () => { exited = true; });
    try { await until(async () => { if (exited) throw new Error("wrangler dev が止まりました"); return (await fetch(`${API}/api/health`)).ok; }, 90000, "wrangler dev"); break; }
    catch (e) { try { wr.kill("SIGKILL"); } catch (_) {} if (attempt === 2) throw e; log += "\n---- やり直し ----\n"; await sleep(1000); }
  }
  browser = await chromium.launch({ args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
});

after(async () => {
  try { await browser?.close(); } catch (e) {}
  try { edServer?.close(); } catch (e) {}
  if (wr) { wr.kill("SIGTERM"); await sleep(500); try { wr.kill("SIGKILL"); } catch (e) {} }
  fs.writeFileSync(path.join(WORK, "wrangler.log"), log);
});

// wrangler dev のログに出たメール（[mail] to=… code=… link=…）の、そのアドレスへの n 通目より後のもの
const mails = (to) => [...log.matchAll(/\[mail\] to=(\S+) code=(\d{6}) link=(\S+)/g)].filter((m) => m[1] === to).map((m) => ({ code: m[2], link: m[3] }));

async function waitReady(page) {
  await page.waitForFunction(() => !document.getElementById("mkLogin") && typeof PG !== "undefined" && document.querySelector('#stage [data-el="F_h0"]'), null, { timeout: 30000 });
}
async function waitSaved(page) {
  await page.waitForFunction(() => { const s = PG.saveState(); return s.status === "saved" && !PG.hasPendingSave(); }, null, { timeout: 20000 });
}
const editorUrl = () => `${ED}/?api=${encodeURIComponent(API)}&shop=${SHOP}`;
const apiGet = (page, p) => page.evaluate(async ([api, p]) => (await fetch(api + p, { credentials: "include" })).json(), [API, p]);

// 出ているログインの箱で入る（メールアドレス → コード）
async function loginInBox(page, email) {
  await page.waitForSelector("[data-login-email]");
  const n = mails(email).length;
  await page.fill("[data-login-email]", email);
  await page.click("[data-login-send]");
  await page.waitForSelector("[data-login-code]");
  const m = await until(() => mails(email)[n], 15000, "メールのコード");
  await page.fill("[data-login-code]", m.code);
  await page.click("[data-login-enter]");
}
// 「その他 ▾」を開く（起動の直後は並びの描き直しで閉じることがあるので、開いたのを確かめる）
const openMore = (page) => until(async () => { if (!(await page.locator("#moreMenu.on").count())) await page.click("#tMore"); await sleep(200); return page.locator("#moreMenu.on #moLogout").isVisible(); }, 10000, "その他 ▾");
const stashKeys = (page) => page.evaluate(() => new Promise((res) => {
  const q = indexedDB.open("mikke-api-stash", 1);
  q.onupgradeneeded = () => { q.result.createObjectStore("kv"); };
  q.onsuccess = () => { const g = q.result.transaction("kv", "readonly").objectStore("kv").getAllKeys(); g.onsuccess = () => { res(g.result.map(String)); q.result.close(); }; };
  q.onerror = () => res(null);
}));
const backups = async (page) => { const l = (await apiGet(page, `/api/shops/${SHOP}/backups`)).backups || []; return Promise.all(l.map((b) => apiGet(page, `/api/shops/${SHOP}/backups/${b.id}`))); };

async function loginWithCode(page, email) {
  await page.goto(editorUrl());
  await page.waitForSelector("[data-login-email]");
  assert.equal(await page.locator("#mkLogin h1").textContent(), "芦屋みっけ ログイン");
  const n = mails(email).length;
  await page.fill("[data-login-email]", email);
  await page.click("[data-login-send]");
  await page.waitForSelector("[data-login-code]");
  const m = await until(() => mails(email)[n], 15000, "メールのコード");
  await page.fill("[data-login-code]", "12");   // 6 桁でないと入らない
  await page.click("[data-login-enter]");
  assert.match(await page.locator("[data-login-msg]").textContent(), /6 桁/);
  await page.fill("[data-login-code]", m.code);
  await page.click("[data-login-enter]");
  await waitReady(page);
}

let ctxA, A, newAsset, publicUrl;

test("M3-1 ログイン（コード）→ 見出しを直す → 自動保存 → 読み込み直して残る", async () => {
  ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  A = await ctxA.newPage();
  A.on("dialog", (d) => d.accept());   // 保存待ちのまま読み込み直すときの「離れますか」
  const errs = []; A.on("pageerror", (e) => errs.push(String(e)));
  await loginWithCode(A, OWNER);
  assert.equal(await A.evaluate(() => saveStore.kind), "api");
  await A.evaluate((t) => PG.api.edit("F_h0", t), HEAD);
  await waitSaved(A);
  const site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  assert.ok(site.version >= 2, "保存で版が上がる");
  assert.equal(site.data.draft.content.F_h0, HEAD);
  assert.ok(site.data.theme, "③ は読んだまま送り返す");
  await A.reload(); await waitReady(A);
  assert.equal((await A.locator('#stage [data-el="F_h0"]').innerText()).trim(), HEAD);
  assert.deepEqual(errs, []);
});

test("M3-3 写真を差し替える → 縮めて大きさ違いと一緒に上がり、④ の ID に付け替わる", async () => {
  await A.evaluate(async () => { const f = await PG.quadFile("m3.jpg", 3000, 2000, "image/jpeg"); const r = await PG.replacePhotoFile("F_p0", f); if (!r.ok) throw new Error("読めない"); });
  // 上げ終わるまではブラウザの中のデータ（img_…）、上がったら ast_…
  newAsset = await until(() => A.evaluate(() => { const p = PG.api.photos().find((x) => x.part === "F_p0"); return p && /^ast_/.test(p.asset) ? p.asset : null; }), 30000, "写真の付け替え");
  await waitSaved(A);
  const a = await apiGet(A, `/api/shops/${SHOP}/assets/${newAsset}`);
  assert.equal(a.file.width, 2400); assert.equal(a.file.height, 1600); assert.equal(a.file.exifStripped, true);
  assert.equal(a.origin.kind, "ownerUpload");
  const v = await apiGet(A, `/api/shops/${SHOP}/assets/${newAsset}/variants`);
  assert.deepEqual(v.widths, [640, 1280, 2400]);
  const jpg = v.variants.filter((x) => x.mime === "image/jpeg").map((x) => x.width).sort((a, b) => a - b), webp = v.variants.filter((x) => x.mime === "image/webp").map((x) => x.width).sort((a, b) => a - b);
  assert.deepEqual(jpg, [640, 1280, 2400]); assert.deepEqual(webp, [640, 1280, 2400]);   // Chromium は WebP を作れる
  assert.ok(v.variants.some((x) => x.mime === "image/jpeg" && x.width === 640 && Math.abs(x.height - 427) <= 1));
  const site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  const s = JSON.stringify(site.data.draft);
  assert.ok(s.includes(newAsset), "下書きは ④ の ID を指す"); assert.ok(!/img_\d/.test(s), "ブラウザの中の ID は残らない");
  await A.reload(); await waitReady(A);   // 読み込み直しても、サーバーの写真で出る
  const p = await until(() => A.evaluate((id) => { const p = PG.api.photos().find((x) => x.part === "F_p0"); return p && p.asset === id && p.naturalW ? p : null; }, newAsset), 15000, "写真の読み込み");
  assert.equal(p.naturalW, 2400);
});

test("M3-4 公開 → 「公開しました」と公開ページ → 公開ページに新しい見出しと写真", async () => {
  await A.click("#tPublish");
  const box = A.locator("#publishBox.on [data-pbox-go]");
  await until(async () => (await box.count()) || (await A.locator("#publishToast[data-m3-publish]").count()), 20000, "公開の確認の箱か知らせ");
  if (await box.count()) await box.click();
  await A.waitForSelector('#publishToast[data-m3-publish="done"]', { timeout: 60000 });
  assert.match(await A.locator("#publishToast").innerText(), /公開しました/);
  publicUrl = await A.locator("[data-m3-public-url]").getAttribute("href");
  assert.equal(publicUrl, `http://ashiyado.localhost:${apiPort}/`);
  await waitSaved(A);
  assert.equal(await A.evaluate(() => PG.saveState().label), "公開中と同じです");
  const vs = await apiGet(A, `/api/shops/${SHOP}/versions`);
  assert.equal(vs.versions.length, 1); assert.equal(vs.versions[0].isPublished, true);
  // 公開ページ（ほかの人。ログインしていない context）
  const ctxP = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const P = await ctxP.newPage(); const bad = []; P.on("pageerror", (e) => bad.push(String(e)));
  P.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text())) bad.push(m.text()); });
  const res = await P.goto(publicUrl);
  assert.equal(res.status(), 200);
  fs.writeFileSync(path.join(WORK, "public.html"), await P.content());
  assert.ok((await P.locator(".mk-pc").innerText()).includes(HEAD), "公開ページに新しい見出し");
  const img = await until(() => P.evaluate((id) => { const im = [...document.querySelectorAll(".mk-pc img")].find((x) => (x.currentSrc || x.src).includes("/media/" + id + "/")); return im && im.complete && im.naturalWidth > 0 ? { src: im.currentSrc, w: im.naturalWidth } : null; }, newAsset), 15000, "公開ページの写真");
  assert.match(img.src, new RegExp(`/media/${newAsset}/\\d+\\.(webp|jpg)$`));
  // 編集画面に戻って読み込み直しても、公開中と同じ
  await A.reload(); await waitReady(A); await waitSaved(A);
  assert.equal(await A.evaluate(() => PG.saveState().label), "公開中と同じです");
  assert.equal(await A.evaluate(() => PG.versions().filter((v) => v.kind === "published").length), 1);
  await ctxP.close();
  assert.deepEqual(bad.filter((t) => !/Failed to load resource/.test(t)), []);
});

let ctxB, B;
test("M3-2・B4・M3b-3 別のブラウザでリンクから入って直す → 1つ目で直すと「ほかの端末で変更されました」の箱 →「ほかの変更を読み込む」", async () => {
  ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  B = await ctxB.newPage();
  B.on("dialog", (d) => d.accept());
  await B.goto(editorUrl());
  await B.waitForSelector("[data-login-email]");
  const n = mails(PRODUCER).length;
  await B.fill("[data-login-email]", PRODUCER); await B.click("[data-login-send]"); await B.waitForSelector("[data-login-code]");
  const m = await until(() => mails(PRODUCER)[n], 15000, "メールのリンク");
  assert.ok(m.link.startsWith(`${ED}/login#t=`), m.link);
  await B.goto(m.link);   // ?api= の無いリンク：覚えた設定で ApiStore
  await waitReady(B);
  const where = await B.evaluate(() => [location.href, saveStore.kind]);
  assert.ok(!where[0].includes("t="), "リンクの合言葉は消す " + where.join(" "));
  assert.equal(where[1], "api");
  assert.equal((await B.locator('#stage [data-el="F_h0"]').innerText()).trim(), HEAD, "別の端末でも同じ下書き");
  await B.evaluate(() => PG.api.edit("F_b0", "別のブラウザで書いた本文"));
  await waitSaved(B);
  // 1つ目（古い版を持っている）で直す → 409 → 選ぶ箱
  await A.evaluate(() => PG.api.edit("F_h0", "1つ目のブラウザでまた直す"));
  await A.waitForFunction(() => PG.saveState().conflict, null, { timeout: 20000 });
  assert.equal(await A.evaluate(() => PG.saveState().label), "ほかの端末で変更されました。どちらを残すか選んでください");
  await A.waitForSelector("#m3Conflict.on");
  assert.equal(await A.locator("#m3Conflict h2").innerText(), "ほかの端末で変更されました");
  assert.match(await A.locator("[data-m3-conflict-theirs]").innerText(), /ほかの変更を読み込む（自分の直しは消える）/);
  assert.match(await A.locator("[data-m3-conflict-mine]").innerText(), /自分の直しで上書きする/);
  // サーバーの下書きは B のまま（知らせなしに上書きしない）
  let site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  assert.equal(site.data.draft.content.F_b0, "別のブラウザで書いた本文");
  assert.equal(site.data.draft.content.F_h0, HEAD);
  // 公開も止まる（箱はそのまま）
  await A.evaluate(() => document.getElementById("tPublish").click());
  await until(() => A.evaluate(() => /ほかで変更されました|ほかの端末で変更されました/.test((document.getElementById("pgToast") || {}).innerText || "")), 10000, "公開の知らせ");
  assert.equal(await A.locator("#m3Conflict.on").count(), 1);
  const nb = (await backups(A)).length;
  // 「ほかの変更を読み込む」→ B の直しが見える。自分の直しは戻す前の下書きに
  await A.click("[data-m3-conflict-theirs]");
  await until(() => A.evaluate(() => !document.querySelector("#m3Conflict.on") && !PG.saveState().conflict), 15000, "箱が閉じる");
  assert.equal((await A.locator('#stage [data-el="F_b0"]').innerText()).trim(), "別のブラウザで書いた本文");
  assert.equal((await A.locator('#stage [data-el="F_h0"]').innerText()).trim(), HEAD);
  await waitSaved(A);
  const bk = await backups(A);
  assert.equal(bk.length, nb + 1, "戻す前の下書きが 1 つ増える");
  assert.equal(bk[0].site.draft.content.F_h0, "1つ目のブラウザでまた直す", "選ばなかった自分の直し");
  assert.equal(bk[0].reason, "keep-conflict");
  assert.ok(await A.evaluate(() => PG.versions().some((v) => v.kind === "beforeRestore")), "履歴に戻す前の下書き");
  // そのまま直せる（もうぶつからない）
  await A.evaluate((t) => PG.api.edit("F_h0", t), HEAD);
  await waitSaved(A);
  site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  assert.equal(site.data.draft.content.F_b0, "別のブラウザで書いた本文");
  // 読み込み直しても B の直し
  await A.reload(); await waitReady(A);
  assert.equal((await A.locator('#stage [data-el="F_b0"]').innerText()).trim(), "別のブラウザで書いた本文");
});

test("M3b-3 もう一度ぶつかる →「自分の直しで上書きする」→ 今のサーバーの版で送り直す。ほかの変更は戻す前の下書きに", async () => {
  await B.reload(); await waitReady(B);
  await B.evaluate(() => PG.api.edit("F_b0", "B の2回目の本文"));
  await waitSaved(B);
  await A.evaluate(() => PG.api.edit("F_h0", "A で上書きする見出し"));
  await A.waitForSelector("#m3Conflict.on", { timeout: 20000 });
  const nb = (await backups(A)).length;
  await A.click("[data-m3-conflict-mine]");
  await until(() => A.evaluate(() => !document.querySelector("#m3Conflict.on") && !PG.saveState().conflict), 15000, "箱が閉じる");
  await waitSaved(A);
  const site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  assert.equal(site.data.draft.content.F_h0, "A で上書きする見出し");
  assert.equal(site.data.draft.content.F_b0, "別のブラウザで書いた本文", "A の画面の内容で置き換わる");
  assert.ok(site.data.theme, "③ はそのまま");
  const bk = await backups(A);
  assert.equal(bk.length, nb + 1);
  assert.equal(bk[0].site.draft.content.F_b0, "B の2回目の本文", "選ばなかったほかの変更");
  // B は古い版を持っているので、B で直すと B に箱
  await B.evaluate(() => PG.api.edit("F_b0", "B でまた"));
  await B.waitForSelector("#m3Conflict.on", { timeout: 20000 });
  await B.click("[data-m3-conflict-theirs]");
  await until(() => B.evaluate(() => !document.querySelector("#m3Conflict.on")), 15000, "B の箱が閉じる");
  assert.equal((await B.locator('#stage [data-el="F_h0"]').innerText()).trim(), "A で上書きする見出し");
});

test("M3b-1・M3b-2 ほかの端末からもログアウト → 直すとログインが切れた箱（下書きは手元に退避）→ 入り直すとそのまま保存", async () => {
  // C：A と同じ人（店主）で入り、「その他 ▾」→「ほかの端末からもログアウト」
  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const C = await ctxC.newPage(); C.on("dialog", (d) => d.accept());
  await C.goto(editorUrl());
  for (let i = 0; ; i++) {   // A が入ってから 60 秒たっていなければ、待ってから送り直す
    await C.waitForSelector("[data-login-email]");
    const n = mails(OWNER).length;
    await C.fill("[data-login-email]", OWNER); await C.click("[data-login-send]");
    const ok = await until(async () => (await C.locator("[data-login-code]").count()) ? "code" : (/あと (\d+) 秒/.exec(await C.locator("[data-login-msg]").textContent() || "") || [])[1], 15000, "送れたか");
    if (ok === "code") { const m = await until(() => mails(OWNER)[n], 15000, "C のコード"); await C.fill("[data-login-code]", m.code); await C.click("[data-login-enter]"); break; }
    assert.ok(i < 2, "送れない"); await sleep((+ok + 1) * 1000);
  }
  await waitReady(C);
  assert.equal(await C.locator("#moLogout").count(), 1, "ログアウトは API につないでいるときだけ");
  await openMore(C); await C.click("#moLogoutAll");
  await C.waitForSelector("[data-login-email]", { timeout: 20000 });   // 読み込み直してログインの箱
  assert.equal(await C.locator("#mkLogin h1").textContent(), "芦屋みっけ ログイン");
  await ctxC.close();
  // A：直す → 401 → 手元に退避 → ログインが切れた箱
  await A.evaluate(() => PG.api.edit("F_h0", "切れた後の直し"));
  await A.waitForSelector("#mkLogin[data-login-expired]", { timeout: 20000 });
  assert.equal(await A.locator("#mkLogin h1").textContent(), "ログインが切れました");
  assert.match(await A.locator("#mkLogin .lg-sub").textContent(), /直しかけの内容はこの端末に取ってあります|この端末に取ってある/);
  assert.ok((await stashKeys(A)).some((k) => k.startsWith("draft|")), "手元に退避");
  let site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  assert.equal(site.error, "unauthenticated");
  // 入り直す → ぶつからないのでそのまま保存。退避は消える
  await loginInBox(A, P2);
  await A.waitForSelector("#mkLogin", { state: "detached", timeout: 20000 });
  await waitSaved(A);
  site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  assert.equal(site.data.draft.content.F_h0, "切れた後の直し");
  await until(async () => !(await stashKeys(A)).some((k) => k.startsWith("draft|")), 5000, "退避を消す");
  assert.equal(await A.locator("#m3Conflict.on").count(), 0);
});

test("M3b-2 ログインが切れたまま読み込み直す → 入ると退避した下書き → サーバーが先に進んでいれば箱 →「自分の直しで上書きする」", async () => {
  await ctxA.clearCookies();
  await A.evaluate(() => PG.api.edit("F_b0", "退避した本文"));
  await A.waitForSelector("#mkLogin[data-login-expired]", { timeout: 20000 });
  // その間にほかの端末（B）が保存
  await B.reload(); await waitReady(B);
  await B.evaluate(() => PG.api.edit("F_h0", "B が先に保存した見出し"));
  await waitSaved(B);
  // A を読み込み直す（ふつうのログインの箱）→ 入る → 退避した下書きが出て、保存すると 409 → 箱
  await A.goto(editorUrl());
  await A.waitForSelector("[data-login-email]");
  assert.equal(await A.locator("#mkLogin h1").textContent(), "芦屋みっけ ログイン");
  await loginInBox(A, P3);
  await waitReady(A);
  assert.equal((await A.locator('#stage [data-el="F_b0"]').innerText()).trim(), "退避した本文");
  await A.waitForSelector("#m3Conflict.on", { timeout: 20000 });
  await A.click("[data-m3-conflict-mine]");
  await until(() => A.evaluate(() => !document.querySelector("#m3Conflict.on") && !PG.saveState().conflict), 15000, "箱が閉じる");
  await waitSaved(A);
  const site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  assert.equal(site.data.draft.content.F_b0, "退避した本文");
  const bk = await backups(A);
  assert.equal(bk[0].site.draft.content.F_h0, "B が先に保存した見出し", "選ばなかった B の変更");
  await until(async () => !(await stashKeys(A)).some((k) => k.startsWith("draft|")), 5000, "退避を消す");
});

test("M3b-4 写真を上げている途中に閉じようとすると警告 → 読み込み直すと手元の写真を上げ直す", async () => {
  const held = [];
  const holdAssets = (r) => { if (r.request().method() === "POST") held.push(r); else r.continue(); };
  await A.route(/\/api\/shops\/[^/]+\/assets$/, holdAssets);
  const before = await A.evaluate(() => PG.api.photos().find((x) => x.part === "F_p0").asset);
  await A.evaluate(async () => { const f = await PG.quadFile("m3b.jpg", 1600, 1200, "image/jpeg"); const r = await PG.replacePhotoFile("F_p0", f); if (!r.ok) throw new Error("読めない"); });
  const tmp = await until(() => A.evaluate(() => { const p = PG.api.photos().find((x) => x.part === "F_p0"); return p && /^img_/.test(p.asset) ? p.asset : null; }), 10000, "ブラウザの中の写真");
  await until(() => held.length, 20000, "上げ始め");
  await waitSaved(A);
  assert.equal(await A.evaluate(() => saveStore.uploading()), 1);
  assert.equal(await A.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), true, "閉じる前の警告");
  assert.ok((await stashKeys(A)).some((k) => k.startsWith("photo|") && k.endsWith("|" + tmp)), "手元に置く");
  let site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  assert.ok(JSON.stringify(site.data.draft).includes(tmp), "下書きはまだブラウザの中の ID");
  // 途中で閉じた（つながりが切れた）ことにして読み込み直す
  for (const r of held) await r.abort().catch(() => {});
  await A.unroute(/\/api\/shops\/[^/]+\/assets$/, holdAssets);
  await A.reload(); await waitReady(A);
  const now = await until(() => A.evaluate(() => { const p = PG.api.photos().find((x) => x.part === "F_p0"); return p && /^ast_/.test(p.asset) ? p.asset : null; }), 30000, "上げ直して付け替わる");
  assert.notEqual(now, before);
  await waitSaved(A);
  site = await apiGet(A, `/api/shops/${SHOP}/drafts/site`);
  const s = JSON.stringify(site.data.draft);
  assert.ok(s.includes(now)); assert.ok(!s.includes(tmp), "ブラウザの中の ID は残らない");
  const a = await apiGet(A, `/api/shops/${SHOP}/assets/${now}`);
  assert.equal(a.file.width, 1600);
  await until(async () => !(await stashKeys(A)).some((k) => k.startsWith("photo|")), 5000, "手元の写真を消す");
  assert.equal(await A.evaluate(() => saveStore.uploading()), 0);
  assert.equal(await A.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), false);
});

test("M3b-1 ログアウト（「その他 ▾」）→ ログインの箱。サーバーのセッションも消える", async () => {
  await openMore(A);
  assert.equal(await A.locator("#moreMenu.on #moLogout").count(), 1);
  assert.equal(await A.locator("#moreMenu.on #moLogoutAll").count(), 1);
  await A.click("#moLogout");
  await A.waitForSelector("[data-login-email]", { timeout: 20000 });
  assert.equal(await A.locator("#mkLogin h1").textContent(), "芦屋みっけ ログイン");
  const me = await A.evaluate(async (api) => (await fetch(api + "/api/me", { credentials: "include" })).status, API);
  assert.equal(me, 401);
  await ctxB.close();
});
