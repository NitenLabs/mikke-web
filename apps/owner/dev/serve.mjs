#!/usr/bin/env node
// 店主の編集画面を手元で出す（SPEC 2章）。
//   node apps/owner/dev/serve.mjs [--port 5174] [--api http://127.0.0.1:8787] [--secret <EDIT_RUNNER_SECRET>]
// ・dist/ を返す（/ と /login は index.html）
// ・/api/* を wrangler dev へ中継（Host は API のものに替える。ブラウザから見て同じオリジン）
// ・/preview/<店>/ … 下地（rebuild-shop <店> --no-check の書き出し。data-edit 付き）。無ければ最初に作る
// ・POST /__dev/rebuild {shop, number}（手元だけ）… 公開の後に画面が呼ぶ。/edit-api から版の ①②・写真を取り、
//   --from のフォルダに書いて rebuild-shop <店> --from … --dry-run --no-check。結果を /edit-api/…/render に返す
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWNER = path.resolve(HERE, "..");
const ROOT = path.resolve(OWNER, "../..");
const DIST = path.join(OWNER, "dist");
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PORT = Number(opt("--port", process.env.OWNER_PORT ?? 5174));
const API = opt("--api", process.env.OWNER_API ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const SECRET = opt("--secret", process.env.EDIT_RUNNER_SECRET ?? "");
const PREVIEW = path.join(DIST, "base");   // 書き出しの置き場の名前に preview を使えない（rebuild-shop が営業用の見本の置き場と見なす）
const WORK = path.resolve(opt("--work", path.join(DIST, "rebuild")));   // 作り直しの作業のフォルダ（通しの試験は自分の置き場所を渡す）

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".map": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

function run(cmd, args, { cwd = ROOT } = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => res({ code, out, err }));
  });
}

// 下地（店ごとに 1 回）
const building = new Map();
function ensurePreview(slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug)) return Promise.resolve(false);
  const dir = path.join(PREVIEW, slug);
  if (fs.existsSync(path.join(dir, "index.html"))) return Promise.resolve(true);
  if (!fs.existsSync(path.join(ROOT, "samples", slug, "shop.json"))) return Promise.resolve(false);
  if (!building.has(slug)) {
    console.log(`[preview] ${slug} の下地を作っています（rebuild-shop --no-check）…`);
    building.set(slug, run(process.execPath, [path.join(ROOT, "tools/rebuild-shop.mjs"), slug, "--no-check", "--out", dir]).then((r) => {
      const ok = r.code === 0 && fs.existsSync(path.join(dir, "index.html"));
      console.log(ok ? `[preview] ${slug} できました` : `[preview] ${slug} 作れませんでした ${(/"error": "[^"]*"/.exec(r.out) ?? [""])[0]}\n${r.err.slice(-800)}`);
      building.delete(slug);
      return ok;
    }));
  }
  return building.get(slug);
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}
const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { const cs = []; req.on("data", (c) => cs.push(c)); req.on("end", () => r(Buffer.concat(cs))); });

async function proxy(req, res) {
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
  const headers = { ...req.headers };
  delete headers.host; delete headers.connection; delete headers["content-length"];
  try {
    const r = await fetch(API + req.url, { method: req.method, headers, body, redirect: "manual" });
    const h = {};
    r.headers.forEach((v, k) => { if (!["content-encoding", "content-length", "transfer-encoding", "set-cookie"].includes(k)) h[k] = v; });
    const cookies = r.headers.getSetCookie?.() ?? [];
    if (cookies.length) h["set-cookie"] = cookies;
    res.writeHead(r.status, h);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { json(res, 502, { error: "api_unreachable", message: `API（${API}）につながりません` }); }
}

// ───────── 公開の後の作り直し（手元は dry-run まで。本当の公開は runner＝lane4）
async function edit(p, init = {}) {
  const r = await fetch(`${API}/edit-api${p}`, { ...init, headers: { "x-edit-runner-secret": SECRET, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`/edit-api${p} ${r.status} ${await r.text()}`);
  return r;
}
/**
 * 版から --from のフォルダを作る。
 * ・shop.json＝版の ①、assets.json＝samples の ④ に版の ④ を重ねたもの（file.key は media/ の名前）、media/＝R2 の写真
 * ・<型>.json＝② の genConfig（表紙の言葉 fvCopy が入る）
 * ・② の写真の要素（gen が決まった素材を指す）を差し替えたときは、元の素材の file を新しい写真に向ける（gen で戻らないように）
 */
export async function writeFrom(slug, v, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  const sampleDir = path.join(ROOT, "samples", slug);
  const sAssets = fs.existsSync(path.join(sampleDir, "assets.json")) ? JSON.parse(fs.readFileSync(path.join(sampleDir, "assets.json"), "utf8")) : { schemaVersion: 1, assets: {} };
  const assets = { schemaVersion: 1, assets: { ...sAssets.assets } };
  const ext = (m) => ({ "image/png": "png", "image/webp": "webp" })[m] ?? "jpg";
  for (const [id, a] of Object.entries(v.assets?.assets ?? {})) {
    const name = `${id}.${ext(a.file?.mime)}`;
    const buf = Buffer.from(await (await edit(`/shops/${slug}/assets/${id}/file`)).arrayBuffer());
    fs.writeFileSync(path.join(dir, "media", name), buf);
    assets.assets[id] = { ...sAssets.assets[id], ...a, file: { ...a.file, key: name } };
  }
  const draft = v.site?.draft ?? {};
  const baseSite = fs.existsSync(path.join(sampleDir, "site.json")) ? JSON.parse(fs.readFileSync(path.join(sampleDir, "site.json"), "utf8")) : null;
  const swapped = [];
  for (const [elId, el] of Object.entries(draft.elements ?? {})) {
    const orig = baseSite?.elements?.[elId];
    if (el.type === "photo" && orig?.asset && el.asset && el.asset !== orig.asset && assets.assets[el.asset]) {
      assets.assets[orig.asset] = { ...assets.assets[orig.asset], file: { ...assets.assets[el.asset].file } };
      swapped.push(`${elId}:${orig.asset}→${el.asset}`);
    }
  }
  fs.writeFileSync(path.join(dir, "shop.json"), JSON.stringify(v.shop, null, 2));
  fs.writeFileSync(path.join(dir, "assets.json"), JSON.stringify(assets, null, 2));
  const tpl = /^wa-(\d\d)$/.exec(draft.template?.name ?? "")?.[1];
  if (tpl && draft.genConfig) fs.writeFileSync(path.join(dir, `wa${tpl}.json`), JSON.stringify(draft.genConfig, null, 2));
  if (v.site?.theme) fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(v.site.theme, null, 2));
  return { swapped };
}

async function devRebuild(req, res) {
  if (!SECRET) return json(res, 503, { error: "no_secret", message: "--secret（EDIT_RUNNER_SECRET）を付けて serve.mjs を動かしてください" });
  let b; try { b = JSON.parse((await readBody(req)).toString() || "{}"); } catch { return json(res, 400, { error: "bad_json" }); }
  const slug = String(b.shop ?? ""), n = Number(b.number);
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug) || !Number.isInteger(n)) return json(res, 400, { error: "bad_request" });
  const t0 = Date.now();
  try {
    const v = await (await edit(`/shops/${slug}/versions/${n}`)).json();
    const dir = path.join(WORK, `${slug}-v${n}`);
    const { swapped } = await writeFrom(slug, v, dir);
    const r = await run(process.execPath, [path.join(ROOT, "tools/rebuild-shop.mjs"), slug, "--from", dir, "--dry-run", "--no-check"]);
    let result = null; try { result = JSON.parse(r.out); } catch { /* 下で失敗にする */ }
    const ok = !!result?.ok;
    const error = ok ? undefined : (result?.error?.message ?? result?.error ?? r.err.trim().split("\n").slice(-3).join(" / ") ?? "作り直しに失敗しました").toString().slice(0, 500);
    const rr = await (await edit(`/shops/${slug}/versions/${n}/render`, { method: "POST", body: JSON.stringify(ok ? { ok: true } : { ok: false, error }) })).json();
    fs.writeFileSync(path.join(dir, "rebuild-result.json"), JSON.stringify(result ?? { stdout: r.out, stderr: r.err }, null, 2));
    console.log(`[rebuild] ${slug} 版 ${n}：${ok ? "ok" : "failed"}（${Date.now() - t0}ms）${swapped.length ? ` 写真の付け替え ${swapped.join(", ")}` : ""}`);
    json(res, 200, { ok, number: n, render: rr.render, publishable: result?.publishable ?? null, steps: result?.steps?.map((s) => ({ name: s.name, ok: s.ok, ms: s.ms })) ?? [], swapped, error: error ?? null, ms: Date.now() - t0 });
  } catch (e) {
    console.error("[rebuild]", e);
    json(res, 500, { error: "rebuild_failed", message: String(e.message ?? e).slice(0, 500) });
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(u.pathname);
  if (p.startsWith("/api/")) return proxy(req, res);
  if (p === "/__dev/rebuild" && req.method === "POST") return devRebuild(req, res);
  const pm = /^\/preview\/([a-z0-9-]+)(\/.*)?$/.exec(p);
  if (pm) {
    if (!(await ensurePreview(pm[1]))) { res.writeHead(404); return res.end("no preview"); }
    const rel = (pm[2] && pm[2] !== "/" ? pm[2] : "/index.html").replace(/^\/+/, "");
    const f = path.resolve(PREVIEW, pm[1], rel);
    if (!f.startsWith(path.join(PREVIEW, pm[1])) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    return sendFile(res, f);
  }
  if (p === "/" || p === "/login") return sendFile(res, path.join(DIST, "index.html"));
  if (/^\/(app\.js(\.map)?|style\.css|limits\/[a-z0-9-]+\.json)$/.test(p) && fs.existsSync(path.join(DIST, p))) return sendFile(res, path.join(DIST, p));
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("見つかりません");
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!fs.existsSync(path.join(DIST, "app.js"))) { console.error("先に node apps/owner/build.mjs"); process.exit(1); }
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`店主の編集画面：http://localhost:${PORT}/ （API ${API}${SECRET ? "" : "・--secret なし＝公開の後の作り直しはしない"}）`);
  });
}
export { server };
