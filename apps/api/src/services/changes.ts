import type { Env, User } from "../env";
import { diffPaths, summarize, type PathChange } from "../lib/json";
import { nowIso } from "../lib/http";

export type Layer = "shop" | "site" | "theme" | "assets" | "publish";
export type ActorKind = "owner" | "producer" | "system";

export interface Actor {
  id: string | null;
  kind: ActorKind;
}
export const actorOf = (u: User): Actor => ({ id: u.id, kind: u.role });
export const SYSTEM: Actor = { id: null, kind: "system" };

/** 自動保存は 500ms ごとに来るので、同じ人・同じ場所の続けての直しは 1 行にまとめる（最初の「前」と最後の「後」） */
export const MERGE_WINDOW_MS = 10 * 60 * 1000;
/** 1 回の保存で記録する場所の数の上限（超えた分は「ほか N か所」の 1 行に） */
export const MAX_PATHS_PER_SAVE = 20;

export interface ChangeRow {
  layer: Layer;
  action: string;
  path: string;
  before?: unknown;
  after?: unknown;
}

export async function recordChanges(env: Env, shopId: string, actor: Actor, rows: ChangeRow[], merge = false): Promise<void> {
  if (!rows.length) return;
  const at = nowIso();
  const stmts: D1PreparedStatement[] = [];
  let recent: Map<string, number> = new Map();
  if (merge) {
    const since = new Date(Date.now() - MERGE_WINDOW_MS).toISOString();
    const res = await env.DB.prepare(
      `SELECT id, layer, path FROM changes WHERE shop_id = ? AND actor_kind = ? AND IFNULL(actor_id, '') = ? AND action = 'edit' AND at >= ?
       AND id > IFNULL((SELECT MAX(id) FROM changes WHERE shop_id = ? AND action <> 'edit'), 0)`,
    )
      .bind(shopId, actor.kind, actor.id ?? "", since, shopId)
      .all<{ id: number; layer: string; path: string }>();
    // 公開などを挟んだら、まとめない（その前後の区切りが分かるように）
    recent = new Map(res.results.map((r) => [`${r.layer} ${r.path}`, r.id]));
  }
  for (const r of rows) {
    const key = `${r.layer} ${r.path}`;
    const after = summarize(r.after);
    if (merge && r.action === "edit" && recent.has(key)) {
      stmts.push(env.DB.prepare("UPDATE changes SET at = ?, after = ? WHERE id = ?").bind(at, after, recent.get(key)!));
    } else {
      stmts.push(
        env.DB.prepare(
          "INSERT INTO changes (shop_id, at, first_at, actor_id, actor_kind, layer, action, path, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(shopId, at, at, actor.id, actor.kind, r.layer, r.action, r.path, summarize(r.before), after),
      );
    }
  }
  await env.DB.batch(stmts);
}

/** 下書きの前→後から、記録の行を作る */
export function draftChangeRows(kind: "shop" | "site", before: unknown, after: unknown): ChangeRow[] {
  const diffs: PathChange[] = diffPaths(before, after, 3);
  const rows: ChangeRow[] = diffs.map((d) => ({
    layer: kind === "shop" ? "shop" : d.path.startsWith("/theme") ? "theme" : "site",
    action: "edit",
    path: d.path,
    before: d.before,
    after: d.after,
  }));
  if (rows.length > MAX_PATHS_PER_SAVE) {
    const rest = rows.length - (MAX_PATHS_PER_SAVE - 1);
    const head = rows.slice(0, MAX_PATHS_PER_SAVE - 1);
    head.push({ layer: kind === "shop" ? "shop" : "site", action: "edit-many", path: "/", after: `ほか ${rest} か所` });
    return head;
  }
  return rows;
}
