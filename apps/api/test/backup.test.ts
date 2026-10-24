import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker, { runDaily } from "../src/index";
import { backupKey, dumpDatabase, runBackup, BACKUP_KEEP_DAYS } from "../src/services/backup";
import { restoreStatements, tableOrder } from "../scripts/backup-lib.mjs";
import { fakeJpeg, getDraft, publishAll, putDraft, siteData, upload, world } from "./helpers";

async function gunzipJson(obj: R2ObjectBody): Promise<any> {
  const text = await new Response(obj.body.pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text);
}

async function readBackup(date: string) {
  const obj = await env.BUCKET.get(backupKey(date));
  expect(obj, date).not.toBeNull();
  return gunzipJson(obj!);
}

/** お店・店主・下書き（長い日本語と引用符を含む）・写真・公開した版・変更の記録がある状態を作る */
async function someData() {
  const w = await world();
  const long = "芦屋の'和菓子'「本日のおすすめ」\n".repeat(3000); // 1 つの値が 100KB を超える（D1 の 1 文の上限より長い）
  await putDraft(w.owner.cookie, w.shop.id, "site", 1, siteData({ note: long }));
  await upload(w.owner.cookie, w.shop.id, fakeJpeg(10, 10));
  await publishAll(w.owner.cookie, w.shop.id, { "/": "<h1>芦屋</h1>" });
  return { ...w, long };
}

describe("B6 毎日のバックアップ（D1 の全部の表 → R2 の backups/<日付>.json.gz）", () => {
  it("B6-1 毎日の Cron で、全部の表を行の並びにして R2 に置く（日付は日本時間）", async () => {
    const w = await someData();
    const ctrl = createScheduledController({ scheduledTime: new Date("2026-10-24T15:00:00Z").getTime(), cron: "0 15 * * *" });
    const ctx = createExecutionContext();
    await worker.scheduled(ctrl, env, ctx);
    await waitOnExecutionContext(ctx);
    const obj = await env.BUCKET.head(backupKey("2026-10-25"));
    expect(obj?.httpMetadata?.contentType).toBe("application/gzip");
    const b = await readBackup("2026-10-25");
    expect(b).toMatchObject({ format: "mikke-d1-backup", version: 1, date: "2026-10-25" });
    expect(b.migrations).toEqual(expect.arrayContaining(["0001_init.sql", "0002_security.sql", "0003_variants.sql"]));
    for (const t of ["users", "shops", "memberships", "sessions", "login_requests", "login_failures", "drafts", "editor_settings", "versions", "version_assets", "draft_backups", "backup_assets", "assets", "asset_variants", "changes"])
      expect(Object.keys(b.tables), t).toContain(t);
    expect(Object.keys(b.tables)).not.toContain("d1_migrations");
    const shops = b.tables.shops;
    const idCol = shops.columns.indexOf("id");
    expect(shops.rows.some((r: unknown[]) => r[idCol + 1] === w.shop.id)).toBe(true); // 行の頭は rowid
  });

  it("B6-2 バックアップ → 表を消す → 戻す → 中身が同じ（長い値・引用符・NULL・数も）", async () => {
    const w = await someData();
    const before = await dumpDatabase(env);
    const res = await runBackup(env, new Date("2026-10-25T15:00:00Z"));
    expect(res.key).toBe("backups/2026-10-26.json.gz");
    const b = await readBackup("2026-10-26");

    // 全部の表を消す（壊れたことにする）
    for (const t of [...tableOrder(Object.keys(b.tables))].reverse()) await env.DB.prepare(`DELETE FROM "${t}"`).run();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM shops").first("n")).toBe(0);

    const stmts: string[] = restoreStatements(b);
    // D1 の 1 文の上限（100KB）より短い文に分けてある
    for (const s of stmts) expect(new TextEncoder().encode(s).byteLength).toBeLessThan(100_000);
    for (const s of stmts) await env.DB.prepare(s).run();

    const after = await dumpDatabase(env);
    expect(after.tables).toEqual(before.tables);
    // 戻した下書きを API で読める
    const d = await getDraft(w.owner.cookie, w.shop.id, "site");
    expect(d.data.draft.note).toBe(w.long);
  });

  it(`B6-3 ${BACKUP_KEEP_DAYS} 日より古いバックアップは消す（ほかのファイルは触らない）`, async () => {
    const put = (k: string) => env.BUCKET.put(k, "x");
    await put("backups/2026-09-01.json.gz");
    await put("backups/2026-09-25.json.gz"); // 31 日前
    await put("backups/2026-09-26.json.gz"); // 30 日前は残す
    await put("backups/2026-10-20.json.gz");
    await put("backups/readme.txt");
    await put("assets/shp_x/ast_keep.jpg");
    const res = await runBackup(env, new Date("2026-10-25T15:00:00Z")); // 日本時間 2026-10-26
    expect(res.deleted.sort()).toEqual(["backups/2026-09-01.json.gz", "backups/2026-09-25.json.gz"]);
    expect(await env.BUCKET.head("backups/2026-09-25.json.gz")).toBeNull();
    for (const k of ["backups/2026-09-26.json.gz", "backups/2026-10-20.json.gz", "backups/readme.txt", "assets/shp_x/ast_keep.jpg", "backups/2026-10-26.json.gz"])
      expect(await env.BUCKET.head(k), k).not.toBeNull();
  });

  it("B6-4 毎日の仕事の結果にバックアップが入る。バックアップが失敗してもほかの仕事は続く（M1）", async () => {
    const ok = (await runDaily(env, new Date("2026-10-27T15:00:00Z"))) as any;
    expect(ok.backup).toMatchObject({ key: "backups/2026-10-28.json.gz" });
    expect(ok.backup.rows).toBeGreaterThan(0);
    const broken = { ...env, BUCKET: { ...env.BUCKET, put: async () => { throw new Error("R2 down"); }, list: env.BUCKET.list.bind(env.BUCKET), get: env.BUCKET.get.bind(env.BUCKET), delete: env.BUCKET.delete.bind(env.BUCKET), head: env.BUCKET.head.bind(env.BUCKET) } } as any;
    const res = (await runDaily(broken, new Date("2026-10-28T15:00:00Z"))) as any;
    expect(res.backup.error).toContain("R2 down");
    expect(res.cleanup).toMatchObject({ sessions: expect.any(Number) });
  });
});
