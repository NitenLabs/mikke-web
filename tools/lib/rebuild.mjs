// 店の作り直し（指示 0045 段1）の部品。tools/rebuild-shop.mjs と tools/edit-runner.mjs の両方から import する。
// 流れ：作業用の写し（stage）を作る → ①（--from）を重ねる → 型の gen → validate → build → 型の finish → 検査 → 書き出し。
// repo の samples/<店> は書き換えない（写しの上で作る）。通信はしない（gen は写真が手元に無いときだけ取りに行く作りなので、
// 写真の揃った店では通信しない。gen は店の設定 <型>.json がある店だけ流す）。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const now = () => performance.now();
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const tail = (s) => String(s ?? "").trim().split("\n").slice(-4).join(" / ").slice(0, 600);

export class RebuildError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const SITE_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

// ───────── アドレスの決め方（deploy.json と tools/deploy-config.json）

export const DEFAULT_DEPLOY_CONFIG = { mikkeDomain: null, pagesProjectPrefix: "mikke-", previewProject: "nitenlabs-preview" };

export function loadDeployConfig(file = path.join(ROOT, "tools", "deploy-config.json")) {
  const c = fs.existsSync(file) ? readJson(file) : {};
  return { ...DEFAULT_DEPLOY_CONFIG, ...Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith("_"))) };
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * 店の公開のアドレスを決める。
 * @param {string} site 店のフォルダ名（例 amet）
 * @param {object|null} deploy samples/<店>/deploy.json の中身（無ければ null＝pages）
 * @param {object} config tools/deploy-config.json（mikkeDomain・pagesProjectPrefix・previewProject）
 * @returns {{ kind, project, pagesHost, pagesUrl, host, url, pending: string|null }}
 *   url：本番のアドレス（決まらないときは pagesUrl を返し、pending に理由）
 */
export function resolveSiteUrl(site, deploy, config = DEFAULT_DEPLOY_CONFIG) {
  if (!SITE_RE.test(site ?? "")) throw new RebuildError("site", `店の名前の形が違う：${site}`);
  const cfg = { ...DEFAULT_DEPLOY_CONFIG, ...config };
  const project = `${cfg.pagesProjectPrefix}${site}`;
  if (project.length > 58) throw new RebuildError("deploy", `Pages のプロジェクト名が長すぎる（58 字まで）：${project}`);
  if (project === cfg.previewProject) throw new RebuildError("deploy", `本番のプロジェクト名が営業用の見本（${cfg.previewProject}）と同じになる`);
  const pagesHost = `${project}.pages.dev`;
  const base = { project, pagesHost, pagesUrl: `https://${pagesHost}/` };
  const d = deploy?.domain ?? { kind: "pages" };
  const kind = d.kind ?? "pages";
  if (kind === "pages") return { kind, ...base, host: pagesHost, url: base.pagesUrl, pending: null };
  if (kind === "mikke") {
    const label = (d.name ?? site).toLowerCase();
    if (!LABEL_RE.test(label)) throw new RebuildError("deploy", `mikke の名前（サブドメイン）の形が違う：${d.name}`);
    const dom = cfg.mikkeDomain ? String(cfg.mikkeDomain).toLowerCase() : null;
    if (!dom) return { kind, ...base, host: pagesHost, url: base.pagesUrl, pending: `芦屋みっけのドメインが未設定（tools/deploy-config.json の mikkeDomain）。決まるまでは ${pagesHost}`, label };
    if (!HOST_RE.test(dom)) throw new RebuildError("deploy", `mikkeDomain の形が違う：${cfg.mikkeDomain}`);
    const host = `${label}.${dom}`;
    return { kind, ...base, host, url: `https://${host}/`, pending: null, label };
  }
  if (kind === "own") {
    const host = String(d.name ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!HOST_RE.test(host)) throw new RebuildError("deploy", `own のドメインの形が違う：${d.name}`);
    if (host.endsWith(".pages.dev")) throw new RebuildError("deploy", `own に pages.dev は使えない（kind: "pages" にする）：${host}`);
    return { kind, ...base, host, url: `https://${host}/`, pending: null };
  }
  throw new RebuildError("deploy", `domain.kind は pages・mikke・own のどれか：${kind}`);
}

/** wrangler の命令（走らせない。ユーザーが1行で貼る形）。out は書き出しのフォルダ */
export function deployCommands(target, out) {
  const dir = path.resolve(out).replace(/\\/g, "/");
  return {
    create: `npx wrangler pages project create ${target.project} --production-branch main`,
    deploy: `npx wrangler pages deploy ${dir} --project-name ${target.project} --branch main --commit-dirty=true`,
  };
}

// ───────── 型と作業用の写し

/** 店の型（例 "wa03"）。site.json の templateId（tpl_wa_03）から。無ければ店のフォルダの waNN.json */
export function templateOf(shopDir) {
  const s = path.join(shopDir, "site.json");
  const id = fs.existsSync(s) ? readJson(s).templateId : null;
  const m = /^tpl_wa_(\d\d)$/.exec(id ?? "");
  if (m) return `wa${m[1]}`;
  return fs.readdirSync(shopDir).map((f) => /^(wa\d\d)\.json$/.exec(f)?.[1]).find(Boolean) ?? null;
}

/** --from で上書きしてよいファイル（① と店の設定）。写真は media/ の下 */
export const FROM_FILES = ["shop.json", "assets.json", "site.json", "theme.json", "edit-limits.json", "deploy.json"];

/**
 * stage（作業用の写し）を作る：tools・schema・templates/wa-NN は写し、node_modules は link、店のフォルダは写し。
 * from があれば、その中の FROM_FILES・<型>.json・media/ を店のフォルダに重ねる。
 */
export function makeStage(dir, site, { from = null, root = ROOT } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const filter = (src) => !/[\\/](verify-[^\\/]+|__pycache__)([\\/]|$)/.test(src);
  fs.cpSync(path.join(root, "tools"), path.join(dir, "tools"), { recursive: true, filter });
  fs.cpSync(path.join(root, "schema"), path.join(dir, "schema"), { recursive: true });
  const src = path.join(root, "samples", site);
  const sdir = path.join(dir, "samples", site);
  if (fs.existsSync(path.join(src, "shop.json"))) fs.cpSync(src, sdir, { recursive: true });
  else if (!from) throw new RebuildError("site", `店のフォルダが無い：samples/${site}`);
  else fs.mkdirSync(sdir, { recursive: true });
  if (from) overlayFrom(from, sdir);
  const tpl = templateOf(sdir);
  if (tpl) {
    const t = path.join(root, "templates", `wa-${tpl.slice(2)}`);
    if (fs.existsSync(t)) fs.cpSync(t, path.join(dir, "templates", `wa-${tpl.slice(2)}`), { recursive: true });
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"), "junction");
  return { dir, shopDir: sdir, tpl };
}

/** --from のフォルダを店のフォルダに重ねる。重ねたファイルの一覧を返す */
export function overlayFrom(from, sdir) {
  const f = path.resolve(from);
  if (!fs.existsSync(path.join(f, "shop.json"))) throw new RebuildError("from", `--from に shop.json が無い：${f}`);
  if (path.resolve(sdir) === f) return [];
  const put = [];
  for (const n of fs.readdirSync(f)) {
    const p = path.join(f, n);
    if (fs.statSync(p).isDirectory()) {
      if (n !== "media") continue;
      fs.mkdirSync(path.join(sdir, "media"), { recursive: true });
      for (const m of fs.readdirSync(p)) { fs.copyFileSync(path.join(p, m), path.join(sdir, "media", m)); put.push(`media/${m}`); }
    } else if (FROM_FILES.includes(n) || /^wa\d\d\.json$/.test(n)) {
      fs.copyFileSync(p, path.join(sdir, n)); put.push(n);
    }
  }
  return put;
}

/** stage を消す。node_modules は link だけ先に外す（本体の node_modules を巻き込まない） */
export function removeStage(dir) {
  const nm = path.join(dir, "node_modules");
  try { if (fs.lstatSync(nm).isSymbolicLink() || isJunction(nm)) fs.unlinkSync(nm); } catch {}
  if (fs.existsSync(nm)) throw new Error(`stage の node_modules を外せなかった：${nm}（消さずに残す）`);
  fs.rmSync(dir, { recursive: true, force: true });
}
function isJunction(p) { try { return fs.readlinkSync(p) != null; } catch { return false; } }

// ───────── 作り直し（stage の中で gen → validate → build → finish）

/**
 * stage の中で型の gen → validate → build → finish を流す（edit-runner の rebuildFallback と同じ形・同じ返り）。
 * @param {{ site, stage, date, log?, afterGen? }} a  stage は makeStage の dir。afterGen は gen の後・build の前に呼ぶ（edit-runner が文字の箱を当てる所）
 * @returns {{ distDir, steps: [{name, ms, ok, skipped?}], tpl }}
 */
export function runPipeline({ site, stage, date, log = () => {}, afterGen }) {
  const dir = path.join(stage, "samples", site);
  const tpl = templateOf(dir);
  const steps = [];
  const run = (name, args, code = "rebuild") => {
    const t = now();
    const r = spawnSync(process.execPath, args, { cwd: stage, encoding: "utf8", env: { ...process.env, WA03_DATE: date }, maxBuffer: 64 << 20 });
    log(`$ node ${args.join(" ")}\n${r.stdout ?? ""}${r.stderr ?? ""}`);
    steps.push({ name, ms: Math.round(now() - t), ok: r.status === 0 });
    if (r.status !== 0) throw new RebuildError(code, `${name} が失敗（exit ${r.status}）：${tail(r.stderr || r.stdout)}`);
    return r;
  };
  const has = (f) => fs.existsSync(path.join(stage, "tools", f));
  // gen は店の設定（<型>.json）がある店だけ（無い店は site.json をそのまま使う。gen が店の名前を決め打ちしている型があるため）
  if (tpl && has(`${tpl}-gen.mjs`) && fs.existsSync(path.join(dir, `${tpl}.json`))) run(`${tpl}-gen`, [`tools/${tpl}-gen.mjs`, site]);
  else steps.push({ name: `${tpl ?? "?"}-gen`, ms: 0, ok: true, skipped: true });
  afterGen?.();
  run("validate", ["tools/validate.mjs", `samples/${site}`], "validate");
  run("build", ["tools/build.mjs", `samples/${site}`, "--date", date]);
  if (tpl && has(`${tpl}-finish.mjs`)) run(`${tpl}-finish`, [`tools/${tpl}-finish.mjs`, site]);
  return { distDir: path.join(stage, "dist", site), steps, tpl };
}

// ───────── 検査

const listFiles = (d, pre = "") => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(d, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`]));
export const htmlFiles = (d) => listFiles(d).filter((f) => f.endsWith(".html")).sort();

/** 壊れた画像（HTML の src・srcset・url() が書き出しの中に無い）。外の URL と data: は見ない */
export function brokenImages(distDir) {
  const bad = [];
  for (const f of htmlFiles(distDir)) {
    const h = fs.readFileSync(path.join(distDir, f), "utf8");
    const refs = new Set();
    for (const m of h.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
      const tag = m[0];
      const src = /\ssrc="([^"]*)"/i.exec(tag)?.[1]; if (src !== undefined) refs.add(src);
      const ss = /\ssrcset="([^"]*)"/i.exec(tag)?.[1]; if (ss) for (const p of ss.split(",")) refs.add(p.trim().split(/\s+/)[0]);
    }
    for (const m of h.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) if (/\.(jpe?g|png|webp|avif|gif|svg)(\?|#|$)/i.test(m[2])) refs.add(m[2]);
    for (const r of refs) {
      if (!r) { bad.push({ page: f, src: "(空)" }); continue; }
      if (/^(https?:|data:|\/\/)/i.test(r)) continue;
      const clean = decodeURI(r.split(/[?#]/)[0]);
      const abs = clean.startsWith("/") ? path.join(distDir, clean) : path.join(distDir, path.dirname(f), clean);
      if (!fs.existsSync(abs)) bad.push({ page: f, src: r });
    }
  }
  return bad;
}

/** noindex（本番では付いていてはいけない）。meta robots と _headers の X-Robots-Tag */
export function noindexMarks(distDir) {
  const found = [];
  for (const f of htmlFiles(distDir)) {
    const h = fs.readFileSync(path.join(distDir, f), "utf8");
    for (const m of h.matchAll(/<meta\b[^>]*name=["']robots["'][^>]*>/gi)) if (/noindex/i.test(m[0])) found.push({ page: f, tag: m[0] });
  }
  const hd = path.join(distDir, "_headers");
  if (fs.existsSync(hd) && /x-robots-tag:[^\n]*noindex/i.test(fs.readFileSync(hd, "utf8"))) found.push({ page: "_headers", tag: "X-Robots-Tag: noindex" });
  return found;
}

/** 型の数値の検査（waNN-check。Playwright を1つ）。stage の中で走らせる */
export function runTemplateCheck({ site, stage, tpl, log = () => {} }) {
  if (!tpl || !fs.existsSync(path.join(stage, "tools", `${tpl}-check.mjs`))) return { tool: null, ok: true, skipped: true, ms: 0, problems: [] };
  const t = now();
  const c = spawnSync(process.execPath, [`tools/${tpl}-check.mjs`, site], { cwd: stage, encoding: "utf8", maxBuffer: 64 << 20 });
  log(`$ node tools/${tpl}-check.mjs ${site}\n${c.stdout}${c.stderr}`);
  const problems = String(c.stdout ?? "").split("\n").filter((l) => /^NG /.test(l)).map((l) => l.slice(3));
  return { tool: `${tpl}-check`, ok: c.status === 0, exit: c.status, ms: Math.round(now() - t), problems, last: tail(c.stdout || c.stderr) };
}

// ───────── 前との違い

const stripMarks = (h) => h.replace(/\sdata-edit="[^"]*"/g, "");

/** 2つのフォルダの違い。HTML は印（data-edit）を除いても違うかも見る */
export function diffDirs(base, after, { ignore = ["_layout.json"] } = {}) {
  if (!base || !fs.existsSync(base)) return { base: null, pages: [], files: [] };
  const keep = (f) => !ignore.includes(path.basename(f));
  const A = new Set(listFiles(base).filter(keep)), B = new Set(listFiles(after).filter(keep));
  const read = (d, f) => fs.readFileSync(path.join(d, f));
  const files = [
    ...[...B].filter((f) => !A.has(f)).map((f) => ({ file: f, change: "added" })),
    ...[...A].filter((f) => !B.has(f)).map((f) => ({ file: f, change: "removed" })),
    ...[...B].filter((f) => A.has(f) && sha(read(base, f)) !== sha(read(after, f))).map((f) => ({ file: f, change: "modified" })),
  ].sort((x, y) => x.file.localeCompare(y.file));
  const pages = files.filter((x) => x.file.endsWith(".html")).map((x) => {
    if (x.change !== "modified") return x;
    const onlyMarks = stripMarks(read(base, x.file).toString("utf8")) === stripMarks(read(after, x.file).toString("utf8"));
    return { ...x, onlyEditMarks: onlyMarks };
  });
  return { base: path.resolve(base), pages, files };
}

// ───────── まとめ（rebuild-shop.mjs の本体）

const jstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/**
 * 店を作り直す。edit-runner からも呼べる。
 * @param {object} o
 * @param {string} o.site 店（samples/<店>）
 * @param {string} [o.from] ① のフォルダ（shop.json・assets.json・media/ など。無ければ samples/<店>）
 * @param {string} [o.out] 書き出し先（dryRun のときは書かない）
 * @param {boolean} [o.dryRun]
 * @param {string} [o.date] YYYY-MM-DD（既定 今日・日本時間）
 * @param {boolean} [o.check=true] 型の検査（Playwright）を流す
 * @param {string} [o.base] 「変わったページ」を比べる前の書き出し（既定：out の今の中身 → dist/<店>）
 * @param {Function} [o.afterGen] gen の後・build の前に stage の店のフォルダで呼ぶ（引数 { shopDir, stage }）
 * @param {string} [o.stageDir] 作業用の写しの置き場（既定 dist/_rebuild-stage/<店>）
 * @param {boolean} [o.keepStage]
 * @param {Function} [o.log]
 * @returns {Promise<object>} 結果の json（ok・publishable・url・timings・steps・checks・changed・deploy）
 */
export async function rebuildShop(o) {
  const t0 = now();
  const site = o.site;
  const date = o.date ?? jstToday();
  const log = o.log ?? (() => {});
  const result = { site, date, mode: o.dryRun ? "dry-run" : "write", from: o.from ? path.resolve(o.from) : path.join(ROOT, "samples", site), out: o.dryRun ? null : (o.out ? path.resolve(o.out) : null) };
  const timings = {};
  let stage = null;
  try {
    if (!SITE_RE.test(site ?? "")) throw new RebuildError("site", `店の名前の形が違う：${site}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RebuildError("date", `日付の形が違う：${date}`);
    const cfg = loadDeployConfig();
    if (result.out && /[\\/](_preview|preview)([\\/]|$)/.test(result.out)) throw new RebuildError("out", `本番の書き出しを営業用の見本の置き場（preview）に置かない：${result.out}`);
    let t = now();
    const stageDir = o.stageDir ?? path.join(ROOT, "dist", "_rebuild-stage", site);
    stage = makeStage(stageDir, site, { from: o.from });
    result.tpl = stage.tpl;
    timings.stage = Math.round(now() - t);
    const deployFile = path.join(stage.shopDir, "deploy.json");
    const deploy = fs.existsSync(deployFile) ? readJson(deployFile) : null;
    result.target = resolveSiteUrl(site, deploy, cfg);
    result.url = result.target.url;
    const shop = readJson(path.join(stage.shopDir, "shop.json"));

    t = now();
    const r = runPipeline({ site, stage: stage.dir, date, log, afterGen: o.afterGen ? () => o.afterGen({ shopDir: stage.shopDir, stage: stage.dir }) : undefined });
    timings.pipeline = Math.round(now() - t);
    result.steps = r.steps;

    const checks = {};
    t = now();
    checks.images = { broken: brokenImages(r.distDir) };
    checks.images.ok = !checks.images.broken.length;
    const ni = noindexMarks(r.distDir);
    checks.noindex = { ok: !ni.length, found: ni.slice(0, 5), count: ni.length, reason: ni.length ? (shop.salesDraft ? "shop.json の salesDraft: true（営業用の見本の扱い。本番に出すときは外す）" : shop.isSample ? "shop.json の isSample: true（見本の店）" : "noindex が付いている") : null };
    timings.staticChecks = Math.round(now() - t);
    checks.template = o.check === false ? { tool: null, ok: true, skipped: true, ms: 0, problems: [] } : runTemplateCheck({ site, stage: stage.dir, tpl: r.tpl, log });
    timings.templateCheck = checks.template.ms;
    result.checks = checks;

    const prevOut = result.out && fs.existsSync(path.join(result.out, "index.html")) ? result.out : null;
    const base = o.base ?? prevOut ?? (fs.existsSync(path.join(ROOT, "dist", site, "index.html")) ? path.join(ROOT, "dist", site) : null);
    result.changed = diffDirs(base, r.distDir);

    result.ok = checks.images.ok && checks.template.ok;
    result.publishable = result.ok && checks.noindex.ok;
    if (result.out && result.ok) {
      fs.rmSync(result.out, { recursive: true, force: true });
      fs.mkdirSync(result.out, { recursive: true });
      fs.cpSync(r.distDir, result.out, { recursive: true, filter: (p) => path.basename(p) !== "_layout.json" });
      result.written = true;
    }
    if (o.deploy) {
      const cmds = deployCommands(result.target, result.out ?? path.join(ROOT, "dist", "rebuild", site));
      result.deploy = !result.publishable
        ? { ready: false, reason: !result.ok ? "検査が通っていない" : `noindex が付いている：${checks.noindex.reason}` }
        : !result.out ? { ready: false, reason: "--out の書き出しが要る（--dry-run では上げる物が無い）" }
        : { ready: true, note: "実行はしない。ユーザーが貼って走らせる。プロジェクトが無ければ先に create を1回", ...cmds, ...(result.target.kind !== "pages" ? { customDomain: `Cloudflare の画面：Workers & Pages → ${result.target.project} → カスタムドメイン → ${result.target.host}（手順は docs/REBUILD.md）` } : {}) };
    }
    if (!result.ok) {
      result.errorCode = !checks.images.ok ? "images" : "check";
      result.error = !checks.images.ok ? `壊れた画像 ${checks.images.broken.length} 件` : `${checks.template.tool} で問題 ${checks.template.problems.length} 件：${checks.template.problems.slice(0, 3).join(" / ") || checks.template.last}`;
    }
    result.distDir = o.keepStage ? r.distDir : null;
  } catch (e) {
    result.ok = false;
    result.publishable = false;
    result.errorCode = e instanceof RebuildError ? e.code : "internal";
    result.error = String(e?.message ?? e);
    if (!(e instanceof RebuildError)) log(String(e?.stack ?? e));
  } finally {
    if (stage && !o.keepStage) { try { removeStage(stage.dir); } catch (e) { log(String(e)); } }
    timings.total = Math.round(now() - t0);
    result.timings = timings;
  }
  return result;
}
