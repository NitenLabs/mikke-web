import type { Env } from "../env";
import { jstDate } from "../lib/visibility";

/**
 * B6：毎日のバックアップ。D1 の全部の表を JSON（表ごとに列の名前と行の並び）にして、gzip で R2 の backups/<日付>.json.gz に置く。
 * 日付は日本時間（毎日 0 時の Cron で走るので、その日の日付）。30 日より古いものは消す。
 * 戻すのは scripts/restore-backup.mjs（README「バックアップから戻す」）。
 */
export const BACKUP_PREFIX = "backups/";
export const BACKUP_KEEP_DAYS = 30;
export const backupKey = (date: string) => `${BACKUP_PREFIX}${date}.json.gz`;
const KEY_RE = /^backups\/(\d{4}-\d{2}-\d{2})\.json\.gz$/;
/** 1 回に読む行の数（版の行は 1 行 2MB 近くになりうるので小さめに） */
const PAGE = 50;

export interface TableDump {
  columns: string[];
  /** 主キーの列（ない表は []） */
  pk: string[];
  /** rowid の別名の列（INTEGER PRIMARY KEY）。ないなら null */
  rowidAlias: string | null;
  /** 行の並び。それぞれ [rowid, 列 1, 列 2, …]（rowid の順） */
  rows: unknown[][];
}

export interface Backup {
  format: "mikke-d1-backup";
  version: 1;
  date: string;
  createdAt: string;
  migrations: string[];
  tables: Record<string, TableDump>;
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** 戻す対象の表（D1・SQLite の内部の表とマイグレーションの記録は除く） */
async function tableNames(env: Env): Promise<string[]> {
  const r = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
  ).all<{ name: string }>();
  return r.results.map((x) => x.name);
}

export async function dumpDatabase(env: Env): Promise<Pick<Backup, "migrations" | "tables">> {
  const tables: Record<string, TableDump> = {};
  for (const t of await tableNames(env)) {
    const info = (await env.DB.prepare(`PRAGMA table_info(${ident(t)})`).all<{ name: string; type: string; pk: number }>()).results;
    const pkCols = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
    const rowidAlias = pkCols.length === 1 && pkCols[0].type.toUpperCase() === "INTEGER" ? pkCols[0].name : null;
    const columns = info.map((c) => c.name);
    const rows: unknown[][] = [];
    let last = -Infinity;
    for (;;) {
      const page = await env.DB.prepare(`SELECT rowid AS __rowid, ${columns.map(ident).join(", ")} FROM ${ident(t)} WHERE rowid > ? ORDER BY rowid LIMIT ?`)
        .bind(Number.isFinite(last) ? last : -9007199254740991, PAGE)
        .raw();
      for (const r of page) {
        for (const v of r) if (v !== null && typeof v === "object") throw new Error(`${t}：文字・数・NULL でない値（BLOB）は、まだバックアップできません`);
        rows.push(r);
      }
      if (page.length < PAGE) break;
      last = page[page.length - 1][0] as number;
    }
    tables[t] = { columns, pk: pkCols.map((c) => c.name), rowidAlias, rows };
  }
  let migrations: string[] = [];
  try {
    migrations = (await env.DB.prepare("SELECT name FROM d1_migrations ORDER BY id").all<{ name: string }>()).results.map((r) => r.name);
  } catch {
    // マイグレーションの記録の表がない（試しの D1 など）
  }
  return { migrations, tables };
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** BACKUP_KEEP_DAYS 日より古い backups/<日付>.json.gz を消す（名前がその形でないものは触らない） */
export async function pruneBackups(env: Env, today: string): Promise<string[]> {
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) - BACKUP_KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
  const old: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix: BACKUP_PREFIX, cursor });
    for (const o of page.objects) {
      const m = KEY_RE.exec(o.key);
      if (m && m[1] < limit) old.push(o.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < old.length; i += 1000) await env.BUCKET.delete(old.slice(i, i + 1000));
  return old;
}

export async function runBackup(env: Env, now = new Date()): Promise<{ key: string; tables: number; rows: number; bytes: number; deleted: string[] }> {
  const { date } = jstDate(now);
  const dump = await dumpDatabase(env);
  const backup: Backup = { format: "mikke-d1-backup", version: 1, date, createdAt: now.toISOString(), ...dump };
  const body = await gzip(JSON.stringify(backup));
  const rows = Object.values(dump.tables).reduce((s, t) => s + t.rows.length, 0);
  const key = backupKey(date);
  await env.BUCKET.put(key, body, {
    httpMetadata: { contentType: "application/gzip" },
    customMetadata: { tables: String(Object.keys(dump.tables).length), rows: String(rows), migrations: dump.migrations.at(-1) ?? "" },
  });
  // 消すのは、今日の分を置けてから
  const deleted = await pruneBackups(env, date);
  return { key, tables: Object.keys(dump.tables).length, rows, bytes: body.byteLength, deleted };
}
