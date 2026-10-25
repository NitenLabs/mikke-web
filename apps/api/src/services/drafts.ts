import type { Env } from "../env";
import { bad, isPlainObject, nowIso } from "../lib/http";

export type DraftKind = "shop" | "site";

export interface DraftRow {
  version: number;
  data: unknown;
  updatedAt: string;
  updatedBy: string | null;
}

/** 下書きの大きさの上限（JSON のバイト数）。D1 の 1 行は 2MB までで、版の行は ① と ②③ の両方を持つので、それぞれ 900KB まで */
export const MAX_DRAFT_BYTES = 900 * 1024;

/** wa-01 の「何もしていない」下書き（DATA_SPEC 4.9：{template, sections} だけ） */
export function initialSiteDraft(): { draft: unknown; theme?: unknown } {
  return {
    draft: {
      template: { name: "wa-01", version: 1 },
      sections: {
        pg_home: [{ id: "feature", type: "feature" }, { id: "items", type: "items" }],
        pg_menu: [{ id: "menuhdr", type: "menuHdr" }, { id: "menu", type: "menu" }],
        pg_contact: [{ id: "contacthdr", type: "contactHdr" }, { id: "contact", type: "contact" }],
      },
    },
  };
}

export function initialShopDraft(shopId: string, name: string): unknown {
  return { schemaVersion: 1, shopId, basic: { name } };
}

/** 形のざっとした確かめ（中身の細かい検査は packages/core と tools/validate の担当） */
export function validateDraft(kind: DraftKind, shopId: string, data: unknown): void {
  if (!isPlainObject(data)) throw bad("invalid_draft", "下書きは JSON の入れ物（{...}）にしてください");
  if (kind === "shop") {
    if (Object.hasOwn(data, "shopId") && data.shopId !== shopId) throw bad("invalid_draft", "shopId がこのお店と違います");
    if (Object.hasOwn(data, "schemaVersion") && typeof data.schemaVersion !== "number") throw bad("invalid_draft", "schemaVersion は数字にしてください");
    return;
  }
  for (const k of Object.keys(data)) if (k !== "draft" && k !== "theme") throw bad("invalid_draft", `サイトの下書きに知らない項目があります：${k}（draft と theme だけ）`);
  const d = data.draft;
  if (!isPlainObject(d)) throw bad("invalid_draft", "draft（DATA_SPEC 4.9 の下書き）がありません");
  if (!isPlainObject(d.template) || typeof d.template.name !== "string") throw bad("invalid_draft", "draft.template.name がありません");
  if (!Object.hasOwn(d, "sections") || (typeof d.sections !== "object" || d.sections === null)) throw bad("invalid_draft", "draft.sections がありません");
  // J17（DATA_SPEC 4.9.3）別のセクションへ移した部品：部品 ID → {section, anchor?}
  if (Object.hasOwn(d, "relocated")) {
    if (!isPlainObject(d.relocated)) throw bad("invalid_draft", "draft.relocated は JSON の入れ物にしてください");
    for (const [id, v] of Object.entries(d.relocated)) {
      if (!isPlainObject(v) || typeof v.section !== "string" || !v.section) throw bad("invalid_draft", `draft.relocated.${id} に section がありません`);
      if (Object.hasOwn(v, "anchor") && typeof v.anchor !== "string") throw bad("invalid_draft", `draft.relocated.${id}.anchor は文字にしてください`);
    }
  }
  if (Object.hasOwn(data, "theme") && !isPlainObject(data.theme)) throw bad("invalid_draft", "theme は JSON の入れ物にしてください");
}

export async function getDraft(env: Env, shopId: string, kind: DraftKind): Promise<DraftRow | null> {
  const row = await env.DB.prepare("SELECT version, body, updated_at, updated_by FROM drafts WHERE shop_id = ? AND kind = ?")
    .bind(shopId, kind)
    .first<{ version: number; body: string; updated_at: string; updated_by: string | null }>();
  if (!row) return null;
  return { version: row.version, data: JSON.parse(row.body), updatedAt: row.updated_at, updatedBy: row.updated_by };
}

/**
 * 版番号つきの保存（B4）。expected と今の版が同じときだけ書き、版を 1 つ上げる。
 * 違えば null（呼んだ側が 409 で今の版と中身を返す）
 */
export async function saveDraft(env: Env, shopId: string, kind: DraftKind, expected: number, data: unknown, userId: string | null): Promise<{ version: number; updatedAt: string } | null> {
  const body = JSON.stringify(data);
  const at = nowIso();
  if (expected === 0) {
    const r = await env.DB.prepare("INSERT OR IGNORE INTO drafts (shop_id, kind, version, body, updated_at, updated_by) VALUES (?, ?, 1, ?, ?, ?)")
      .bind(shopId, kind, body, at, userId)
      .run();
    return r.meta.changes === 1 ? { version: 1, updatedAt: at } : null;
  }
  const r = await env.DB.prepare("UPDATE drafts SET version = version + 1, body = ?, updated_at = ?, updated_by = ? WHERE shop_id = ? AND kind = ? AND version = ?")
    .bind(body, at, userId, shopId, kind, expected)
    .run();
  return r.meta.changes === 1 ? { version: expected + 1, updatedAt: at } : null;
}

export const draftJson = (kind: DraftKind, d: DraftRow) => ({ kind, version: d.version, data: d.data, updatedAt: d.updatedAt, updatedBy: d.updatedBy });

/** If-Match: "3" ／ 3 ／ W/"3" を数字に */
export function parseIfMatch(h: string | undefined): number | null {
  if (!h) return null;
  const m = /^(?:W\/)?"?(\d{1,9})"?$/.exec(h.trim());
  return m ? Number(m[1]) : null;
}
