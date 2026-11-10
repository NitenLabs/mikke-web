#!/usr/bin/env node
// 店主の直し（指示 0049 段3）：mikke-desk の待ち行列から承認済みの直しを取り、① に当てて作り直し、結果を返す。
// 常駐しない（1回走って終わる）。定期実行にするかは別に決める。
//
// 使い方（mikke-web のフォルダで）：
//   node tools/edit-runner.mjs --desk http://127.0.0.1:8788 --secret <EDIT_RUNNER_SECRET> [--all] [--write] [--date YYYY-MM-DD]
//   node tools/edit-runner.mjs --local <ops.json> --site amet [--write]      # desk を使わず差分のファイルで試す（結果は標準出力と result.json）
//   node tools/edit-runner.mjs --snapshot amet [--post]                      # 店の今の姿を desk に送る（--post なしは書き出すだけ）
//   鍵と URL は環境変数 EDIT_DESK_URL・EDIT_RUNNER_SECRET でもよい
// 主な引数：
//   --all            待ち行列が空になるまで続けて取る（既定は 1 件）
//   --write          成功したら samples/<店> の ①（と文字の箱を直したときは site.json・型の設定）を書き換える。既定は書き換えない（dry-run）
//   --sync a,b       取る前に、その店の今の姿（snapshot）を desk に送る
//   --out <dir>      書き出しの置き場（既定 dist/edit-runner）。<店>-job<ID>-<時刻>/ に after（書き出し）・result.json・log を置く
//   --no-check       型の検査（waNN-check。Playwright）を飛ばす
//   --keep-stage     作業用の写し（stage）を消さずに残す
// 流れ（1件）：
//   1. claim → 店の ① の hash が job の baseHash と違えば当てずに failed（stale）
//   2. 差分の形・path・印（前の書き出しの data-edit）を確かめて当てる（だめなら当てずに failed）
//   3. 表示の字数（edit-limits の maxRenderedChars。営業時間など）を本物の format で測る
//   4. 作り直し（下の rebuild。前の書き出しも同じ道具で作る・キャッシュあり）→ 型の検査
//   5. 前と後の HTML を比べ、変わったのが印（data-edit）の所だけか確かめる。印の外が変われば failed（人が見る）
//   6. /edit-api/result に ok・変わったファイル・印ごとの差の要点・置き場・時間を返す（--write のときだけ新しい snapshot も）
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import {
  EditError, applyOps, applySiteTexts, applyTextsToGenConfig, checkOpShape, checkRenderedLimits, classifyCheck, collectTargets,
  diffMarked, expectedKeysAll, paragraphsToText, shopHash, summarizeChanges,
} from "./lib/edit-ops.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (k) => argv.includes(k);

const DESK = (opt("--desk") ?? process.env.EDIT_DESK_URL ?? "").replace(/\/$/, "");
const SECRET = opt("--secret") ?? process.env.EDIT_RUNNER_SECRET ?? "";
const RUNNER = opt("--runner") ?? `edit-runner@${os.hostname()}`;
const OUT = path.resolve(opt("--out") ?? path.join(ROOT, "dist", "edit-runner"));
const DATE = opt("--date") ?? jstToday();
const WRITE = flag("--write");
const CHECK = !flag("--no-check");
const KEEP = flag("--keep-stage");
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) die(`--date の形が違う：${DATE}`);

function jstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function die(msg, code = 2) { console.error(`✗ ${msg}`); process.exit(code); }
const now = () => performance.now();
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const shopDir = (site) => path.join(ROOT, "samples", site);

// ───────── desk との口（/edit-api/*）

async function desk(p, body) {
  if (!DESK || !SECRET) die("desk の URL と鍵が要る（--desk・--secret か EDIT_DESK_URL・EDIT_RUNNER_SECRET）");
  const init = { method: "POST", headers: { "content-type": "application/json", "x-edit-runner-secret": SECRET }, body: JSON.stringify(body) };
  // 作り直しの間（30 秒ほど）に、claim で使った keep-alive の接続を desk 側が閉じていて ECONNRESET になることがある → 1 回だけ新しい接続でやり直す
  let r;
  try { r = await fetch(`${DESK}${p}`, init); }
  catch (e) {
    if (!/ECONNRESET|EPIPE|UND_ERR_SOCKET|other side closed/i.test(String(e?.cause?.code ?? e?.cause?.message ?? e))) throw e;
    await new Promise((ok) => setTimeout(ok, 500));
    r = await fetch(`${DESK}${p}`, init);
  }
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`${p} → ${r.status} ${text.slice(0, 300)}`);
  return json;
}

// ───────── 作り直し（アダプタ）
// 返り：{ distDir（書き出しの index.html のあるフォルダ）, steps: [{ name, ms, ok }] }
// stage は ROOT の写し（tools・schema・samples/<店>・node_modules への link）。repo のデータは触らない。

/** 0045 の rebuild-shop.mjs が無い間のつなぎ：型の gen → build → finish を stage の中で流す */
function rebuildFallback({ site, stage, date, log, afterGen }) {
  const dir = path.join(stage, "samples", site);
  const tpl = fs.readdirSync(dir).map((f) => /^(wa\d\d)\.json$/.exec(f)?.[1]).find(Boolean); // 例 wa03
  const steps = [];
  const run = (name, args) => {
    const t = now();
    const r = spawnSync(process.execPath, args, { cwd: stage, encoding: "utf8", env: { ...process.env, WA03_DATE: date }, maxBuffer: 64 << 20 });
    log(`$ node ${args.join(" ")}\n${r.stdout ?? ""}${r.stderr ?? ""}`);
    steps.push({ name, ms: Math.round(now() - t), ok: r.status === 0 });
    if (r.status !== 0) throw new EditError("rebuild", `${name} が失敗（exit ${r.status}）：${tail(r.stderr || r.stdout)}`);
  };
  if (tpl && fs.existsSync(path.join(stage, "tools", `${tpl}-gen.mjs`))) run(`${tpl}-gen`, [`tools/${tpl}-gen.mjs`, site]);
  afterGen?.(); // gen の後の site.json に文字の箱の差分を当てる・表示の字数を測る（runJob）
  run("build", ["tools/build.mjs", `samples/${site}`, "--date", date]);
  if (tpl && fs.existsSync(path.join(stage, "tools", `${tpl}-finish.mjs`))) run(`${tpl}-finish`, [`tools/${tpl}-finish.mjs`, site]);
  return { distDir: path.join(stage, "dist", site), steps, tpl };
}

/** 0045 が入った後の形（未確認：rebuild-shop の引数・返りの json は lane3 の報告に合わせて直す） */
function rebuildWithRebuildShop({ site, stage, date, log, afterGen }) {
  // 注意：rebuild-shop の中で gen が走るので afterGen（文字の箱・表示の字数）をはさめない。0045 の形に合わせて直す
  void afterGen;
  const out = path.join(stage, "dist", site);
  const t = now();
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "rebuild-shop.mjs"), site, "--from", path.join(stage, "samples", site), "--out", out, "--dry-run", "--date", date], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  log(`$ rebuild-shop ${site}\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  if (r.status !== 0) throw new EditError("rebuild", `rebuild-shop が失敗（exit ${r.status}）：${tail(r.stderr || r.stdout)}`);
  const tpl = fs.readdirSync(path.join(stage, "samples", site)).map((f) => /^(wa\d\d)\.json$/.exec(f)?.[1]).find(Boolean);
  return { distDir: out, steps: [{ name: "rebuild-shop", ms: Math.round(now() - t), ok: true }], tpl };
}

// TODO(0045)：tools/rebuild-shop.mjs が main に入ったら、下の1行を rebuildWithRebuildShop に替える
//   （docs/gallery/status/0045.done を見る。文字の箱の差分は gen の後に当てる必要がある＝rebuild-shop に gen の後のつなぎが要るか確かめる）
const rebuild = rebuildFallback;

const tail = (s) => String(s ?? "").trim().split("\n").slice(-4).join(" / ").slice(0, 600);

/** stage（作業用の写し）を作る。tools・schema は写し、node_modules は link、店のフォルダは写し */
function makeStage(dir, site) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const filter = (src) => !/[\\/](verify-[^\\/]+|__pycache__)([\\/]|$)/.test(src);
  fs.cpSync(path.join(ROOT, "tools"), path.join(dir, "tools"), { recursive: true, filter });
  fs.cpSync(path.join(ROOT, "schema"), path.join(dir, "schema"), { recursive: true });
  fs.cpSync(shopDir(site), path.join(dir, "samples", site), { recursive: true });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "junction");
  return dir;
}
/** stage を消す。node_modules は link だけ先に外す（本体の node_modules を巻き込まない） */
function removeStage(dir) {
  const nm = path.join(dir, "node_modules");
  try { if (fs.lstatSync(nm).isSymbolicLink() || isJunction(nm)) fs.unlinkSync(nm); } catch {}
  if (fs.existsSync(nm)) throw new Error(`stage の node_modules を外せなかった：${nm}（消さずに残す）`);
  fs.rmSync(dir, { recursive: true, force: true });
}
function isJunction(p) { try { return fs.readlinkSync(p) != null; } catch { return false; } }

/** 前の書き出し（差分を当てる前）。① と設定と道具が同じならキャッシュを使う */
function baseBuild(site, log) {
  const dir = shopDir(site);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  let head = "";
  try { head = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch {}
  const toolsDirty = (() => { try { return execFileSync("git", ["-C", ROOT, "status", "--porcelain", "tools", "schema"], { encoding: "utf8" }); } catch { return "?"; } })();
  const key = sha([head, toolsDirty, DATE, ...files.map((f) => f + fs.readFileSync(path.join(dir, f), "utf8"))].join("\0")).slice(0, 16);
  const cache = path.join(OUT, "_base", `${site}-${key}`);
  if (fs.existsSync(path.join(cache, "index.html"))) return { dir: cache, cached: true, ms: 0 };
  const t = now();
  const stage = makeStage(path.join(OUT, "_stage", `${site}-base`), site);
  try {
    const r = rebuild({ site, stage, date: DATE, log });
    fs.rmSync(cache, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.cpSync(r.distDir, cache, { recursive: true });
  } finally { if (!KEEP) removeStage(stage); }
  return { dir: cache, cached: false, ms: Math.round(now() - t) };
}

const htmlPages = (d) => fs.readdirSync(d).filter((f) => f.endsWith(".html")).sort();

/** 店の今の姿（mikke-desk の edit_snapshots）。scripts/edit-snapshot.mjs と同じ形 */
function buildSnapshot(site, dataDir, htmlDir) {
  const read = (f) => readJson(path.join(dataDir, f));
  const targets = [...new Set(htmlPages(htmlDir).flatMap((p) => collectTargets(fs.readFileSync(path.join(htmlDir, p), "utf8"))))].sort();
  const siteJson = read("site.json");
  const texts = {};
  for (const t of targets.filter((t) => t.startsWith("text:"))) {
    const el = siteJson.elements?.[t.slice(5)];
    if (el?.paragraphs) texts[t.slice(5)] = paragraphsToText(el.paragraphs);
  }
  return {
    site,
    shop: read("shop.json"),
    limits: fs.existsSync(path.join(dataDir, "edit-limits.json")) ? read("edit-limits.json") : {},
    targets,
    texts,
    assets: Object.keys(read("assets.json").assets ?? {}),
  };
}

/** 2つのフォルダのファイルの違い（中身の hash で） */
function changedFiles(a, b) {
  const list = (d, pre = "") => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(d, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`]));
  const A = new Set(list(a)), B = new Set(list(b));
  const h = (d, f) => sha(fs.readFileSync(path.join(d, f)));
  return [
    ...[...B].filter((f) => !A.has(f)).map((f) => ({ file: f, change: "added" })),
    ...[...A].filter((f) => !B.has(f)).map((f) => ({ file: f, change: "removed" })),
    ...[...B].filter((f) => A.has(f) && h(a, f) !== h(b, f)).map((f) => ({ file: f, change: "modified" })),
  ].sort((x, y) => x.file.localeCompare(y.file));
}

// ───────── 1件を処理する（desk にも --local にも使う）

async function runJob(job) {
  const t0 = now();
  const timings = {};
  const site = job.site;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "");
  const work = path.join(OUT, `${site}-job${job.id ?? "local"}-${stamp}`);
  fs.mkdirSync(work, { recursive: true });
  const logFile = path.join(work, "log.txt");
  const log = (s) => fs.appendFileSync(logFile, s + "\n");
  const result = { site, jobId: job.id ?? null, mode: WRITE ? "write" : "dry-run", date: DATE, outDir: work, rebuilder: rebuild.name };
  let stage = null;
  try {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(site ?? "") || !fs.existsSync(path.join(shopDir(site), "shop.json"))) throw new EditError("site", `店のフォルダが無い：samples/${site}`);
    const dir = shopDir(site);
    const shop = readJson(path.join(dir, "shop.json"));
    const site0 = readJson(path.join(dir, "site.json"));
    const limits = fs.existsSync(path.join(dir, "edit-limits.json")) ? readJson(path.join(dir, "edit-limits.json")) : {};
    const hash = shopHash(shop);
    result.baseHash = hash;
    if (job.baseHash && job.baseHash !== hash) throw new EditError("stale", `stale：手元の ① が案のときと違う（job ${job.baseHash.slice(0, 12)}… ／ 手元 ${hash.slice(0, 12)}…）。snapshot を送り直して案を作り直す`);

    // 差分の形 → 前の書き出し（印の一覧）→ 印との対応 → 当てる
    checkOpShape(job.ops);
    let t = now();
    const base = baseBuild(site, log);
    timings.baseBuild = base.ms;
    result.baseCached = base.cached;
    const basePages = htmlPages(base.dir);
    const targets = [...new Set(basePages.flatMap((p) => collectTargets(fs.readFileSync(path.join(base.dir, p), "utf8"))))].sort();
    const expected = expectedKeysAll(job.ops, shop, targets);
    result.expectedMarks = expected;
    const applied = applyOps(shop, site0, job.ops);
    timings.apply = Math.round(now() - t);

    // stage に新しい ① を置く。文字の箱は型の設定（waNN.json）にも当てる（gen で戻らないように）
    stage = makeStage(path.join(OUT, "_stage", `${site}-job${job.id ?? "local"}`), site);
    const sdir = path.join(stage, "samples", site);
    writeJson(path.join(sdir, "shop.json"), applied.shop);
    const tplFile = fs.readdirSync(sdir).find((f) => /^wa\d\d\.json$/.test(f));
    let genConfig = null;
    if (Object.keys(applied.texts).length && tplFile) {
      const g = applyTextsToGenConfig(readJson(path.join(sdir, tplFile)), site0, applied.texts);
      genConfig = { file: tplFile, ...g };
      writeJson(path.join(sdir, tplFile), g.config);
      result.genConfig = { file: tplFile, replaced: g.replaced, missing: g.missing };
    }
    // gen の後：site.json の文字の箱を確かめ、設定から戻らなかった物（missing）は直接当てる。表示の字数も測る
    let rendered = [];
    const afterGen = () => {
      const sf = path.join(sdir, "site.json");
      let s = readJson(sf);
      const need = Object.fromEntries(Object.entries(applied.texts).filter(([id]) => paragraphsToText(s.elements?.[id]?.paragraphs) !== applied.texts[id]));
      if (Object.keys(need).length) { s = applySiteTexts(s, need); writeJson(sf, s); }
      rendered = checkRenderedLimits(applied.shop, s, limits, Number(DATE.slice(0, 4)));
      const over = rendered.filter((r) => !r.ok);
      if (over.length) throw new EditError("limit", over.map((r) => `表示の字数の上限を超える：${r.key}（${r.el}）${r.chars} 字 > ${r.max} 字「${r.text}」`).join("\n"));
    };
    t = now();
    const r = rebuild({ site, stage, date: DATE, log, afterGen });
    timings.rebuild = Math.round(now() - t);
    result.steps = r.steps;
    result.renderedLimits = rendered.map(({ key, el, chars, max, ok }) => ({ key, el, chars, max, ok }));

    // 型の検査（Playwright。1つずつ）
    if (CHECK && r.tpl && fs.existsSync(path.join(stage, "tools", `${r.tpl}-check.mjs`))) {
      t = now();
      const c = spawnSync(process.execPath, [`tools/${r.tpl}-check.mjs`, site], { cwd: stage, encoding: "utf8", maxBuffer: 64 << 20 });
      log(`$ node tools/${r.tpl}-check.mjs ${site}\n${c.stdout}${c.stderr}`);
      timings.check = Math.round(now() - t);
      // 段の高さが設計と違う・カードの枚数は直しで動いてよい（記録だけ）。はみ出し・重なりなどの崩れと、走らなかったときは失敗
      const k = classifyCheck(c.stdout);
      const crashed = c.status !== 0 && !k.problems.length && !k.layoutDiffs.length;
      result.templateCheck = { tool: `${r.tpl}-check`, ok: !k.problems.length && !crashed, problems: k.problems, layoutDiffs: k.layoutDiffs };
      if (crashed) throw new EditError("check", `${r.tpl}-check が走らなかった（exit ${c.status}）：${tail(c.stderr || c.stdout)}`);
      if (k.problems.length) throw new EditError("check", `${r.tpl}-check で崩れ：${k.problems.slice(0, 5).join(" / ")}`);
    }

    // 書き出しを置き場へ・前と後の差
    const after = path.join(work, "after");
    fs.cpSync(r.distDir, after, { recursive: true });
    result.changedFiles = changedFiles(base.dir, after);
    const pages = {};
    const unexpected = [];
    for (const p of htmlPages(after)) {
      const bf = path.join(base.dir, p);
      const d = diffMarked(fs.existsSync(bf) ? fs.readFileSync(bf, "utf8") : "", fs.readFileSync(path.join(after, p), "utf8"), expected);
      if (d.elements.length) pages[p] = summarizeChanges(d.elements);
      unexpected.push(...d.unexpected.map((c) => ({ page: p, ...c })));
    }
    result.htmlDiff = pages;
    result.unexpected = summarizeChanges(unexpected);
    const dataChanged = {};
    if (job.ops.some((o) => (o.doc ?? "shop") === "shop")) dataChanged["shop.json"] = true;
    if (genConfig?.replaced.length) dataChanged[genConfig.file] = true;
    if (Object.keys(applied.texts).length) dataChanged["site.json"] = true;
    result.dataFiles = Object.keys(dataChanged).map((f) => `samples/${site}/${f}`);
    fs.cpSync(sdir, path.join(work, "data"), { recursive: true, filter: (s) => !/[\\/]media([\\/]|$)/.test(s) });
    if (!Object.keys(pages).length) throw new EditError("nochange", "書き出しが前と同じ（差分が表に出ていない）");
    if (unexpected.length) throw new EditError("unmarked", `印の外が変わった（${unexpected.length} 件。人が見る）：` + unexpected.slice(0, 3).map((c) => `${c.page} ${c.where} ${c.kind}「${c.before}」→「${c.after}」`).join(" / "));

    // --write：repo の samples/<店> を書き換える（コミットはしない）
    if (WRITE) {
      for (const f of Object.keys(dataChanged)) fs.copyFileSync(path.join(sdir, f), path.join(dir, f));
      result.written = result.dataFiles;
      result.snapshot = buildSnapshot(site, dir, after);
      result.newHash = shopHash(applied.shop);
    }
    result.ok = true;
  } catch (e) {
    result.ok = false;
    result.errorCode = e instanceof EditError ? e.code : "internal";
    result.error = String(e?.message ?? e);
    if (!(e instanceof EditError)) log(String(e?.stack ?? e));
  } finally {
    if (stage && !KEEP) { try { removeStage(stage); } catch (e) { log(String(e)); } }
    timings.total = Math.round(now() - t0);
    result.timings = timings;
    writeJson(path.join(work, "result.json"), result);
  }
  return result;
}

// ───────── 入口

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const snapSite = opt("--snapshot");
  if (snapSite) {
    const base = baseBuild(snapSite, (s) => fs.appendFileSync(path.join(OUT, "snapshot-log.txt"), s + "\n"));
    const snap = buildSnapshot(snapSite, shopDir(snapSite), base.dir);
    const f = path.join(OUT, `${snapSite}-snapshot.json`);
    writeJson(f, snap);
    console.log(`snapshot：${f}（印 ${snap.targets.length}・文字の箱 ${Object.keys(snap.texts).length}・hash ${shopHash(snap.shop).slice(0, 12)}…）`);
    if (flag("--post")) console.log(JSON.stringify(await desk("/edit-api/snapshot", { ...snap, source: "edit-runner" })));
    return;
  }
  const local = opt("--local");
  if (local) {
    const ops = readJson(path.resolve(local));
    const site = opt("--site") ?? die("--local には --site が要る");
    const r = await runJob({ id: null, site, ops: Array.isArray(ops) ? ops : ops.ops, baseHash: Array.isArray(ops) ? undefined : ops.baseHash });
    report(r);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  for (const s of (opt("--sync") ?? "").split(",").filter(Boolean)) {
    const base = baseBuild(s, () => {});
    const res = await desk("/edit-api/snapshot", { ...buildSnapshot(s, shopDir(s), base.dir), source: "edit-runner" });
    console.log(`snapshot を送った：${s} ${res.baseHash?.slice(0, 12)}…`);
  }
  let n = 0, failed = 0;
  do {
    const { job } = await desk("/edit-api/claim", { runner: RUNNER });
    if (!job) { if (!n) console.log("待ち行列は空"); break; }
    n++;
    console.log(`▸ job ${job.id}（${job.site}）：${job.summary || job.request}`);
    const r = await runJob(job);
    report(r);
    if (!r.ok) failed++;
    const { snapshot, ...rest } = r;
    await desk("/edit-api/result", { id: job.id, token: job.token, ok: r.ok, error: r.ok ? undefined : `[${r.errorCode}] ${r.error}`, result: rest, ...(snapshot ? { snapshot } : {}) });
  } while (flag("--all"));
  process.exitCode = failed ? 1 : 0;
}

function report(r) {
  const marks = Object.values(r.htmlDiff ?? {}).flat().flatMap((c) => c.marks);
  console.log(`${r.ok ? "✓" : "✗"} ${r.site} ${r.mode}：${r.ok ? `変わった印 ${[...new Set(marks)].join(" ")}・ファイル ${r.changedFiles?.length ?? 0}` : `[${r.errorCode}] ${r.error}`}`);
  console.log(`  置き場 ${r.outDir}　時間 ${JSON.stringify(r.timings)}`);
}

await main();
