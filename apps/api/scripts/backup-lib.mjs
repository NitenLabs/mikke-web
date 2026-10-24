// B6：バックアップ（src/services/backup.ts が作る backups/<日付>.json.gz の中身）から、D1 に戻す SQL を組み立てる。
// scripts/restore-backup.mjs（wrangler で D1 に流す）と試験（test/backup.test.ts）の両方で使う。

import { q } from "./seed-lib.mjs";

/** D1 の 1 文は 100KB まで。長い文字は空で入れてから、この文字数ずつ足す（1 文字 4 バイトでも 64KB） */
export const CHUNK_CHARS = 16000;
/** これより長い文字は INSERT に入れず、後から足す（1 行の INSERT が長くなりすぎないように） */
export const INLINE_CHARS = 1000;

const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** 戻す順：users・shops を先に（ほかの表が指す）、あとは名前の順。消すのはこの逆 */
export function tableOrder(names) {
  const first = ["users", "shops"].filter((n) => names.includes(n));
  return [...first, ...names.filter((n) => !first.includes(n)).sort()];
}

/** 文字を CHUNK_CHARS ずつに分ける（サロゲートペアの間では切らない） */
export function chunks(s, size = CHUNK_CHARS) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + size, s.length);
    const c = s.charCodeAt(end - 1);
    if (end < s.length && c >= 0xd800 && c <= 0xdbff) end++;
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
}

function literal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`数でない値：${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "string") return q(v);
  throw new Error(`戻せない値の種類：${typeof v}`);
}

/**
 * バックアップ → SQL の文の並び。バックアップにある表は、中身を全部消してから入れ直す（ほかの表は触らない）。
 * rowid もそのまま戻す（並びと INTEGER PRIMARY KEY が同じになる）
 * @param {{format: string, version: number, tables: Record<string, {columns: string[], rowidAlias: string|null, rows: unknown[][]}>}} backup
 * @returns {string[]}
 */
export function restoreStatements(backup) {
  if (backup?.format !== "mikke-d1-backup" || backup.version !== 1) throw new Error("芦屋みっけのバックアップ（format: mikke-d1-backup, version: 1）ではありません");
  const names = tableOrder(Object.keys(backup.tables));
  const out = ["PRAGMA defer_foreign_keys = true;"];
  for (const t of [...names].reverse()) out.push(`DELETE FROM ${ident(t)};`);
  for (const t of names) {
    const { columns, rowidAlias, rows } = backup.tables[t];
    // rowid の別名の列があればそれが rowid。なければ rowid を列として入れる
    const cols = rowidAlias ? columns : ["rowid", ...columns];
    const head = `INSERT INTO ${ident(t)} (${cols.map(ident).join(", ")}) VALUES (`;
    for (const r of rows) {
      const rowid = r[0];
      const vals = r.slice(1);
      const later = [];
      const lits = vals.map((v, i) => {
        if (typeof v === "string" && v.length > INLINE_CHARS) {
          later.push([columns[i], v]);
          return "''";
        }
        return literal(v);
      });
      out.push(`${head}${(rowidAlias ? lits : [literal(rowid), ...lits]).join(", ")});`);
      for (const [col, v] of later) {
        for (const part of chunks(v)) out.push(`UPDATE ${ident(t)} SET ${ident(col)} = ${ident(col)} || ${q(part)} WHERE rowid = ${literal(rowid)};`);
      }
    }
  }
  return out;
}

/** 中身の数（確かめ用） */
export function summarize(backup) {
  return Object.fromEntries(tableOrder(Object.keys(backup.tables)).map((t) => [t, backup.tables[t].rows.length]));
}
