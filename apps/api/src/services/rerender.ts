import type { Env } from "../env";
import { visibleItemIds, jstDate } from "../lib/visibility";

export interface RerenderCandidate {
  shopId: string;
  slug: string;
  publishedVersion: number;
  added: string[];
  removed: string[];
}

/**
 * D6：毎日 0 時（日本時間）の描き直し。今は「描き直しが要るお店の一覧」を返すところまで。
 * 公開中の版の ① で今日「出る品」（DATA_SPEC 3.4）を数え、公開中の HTML を描いた日の「出る品」と違うお店を挙げる。
 * 本当の描き直し（Cloudflare Browser Rendering で編集画面の描画を使う）は M4。
 */
export async function rerenderCandidates(env: Env, now = new Date()): Promise<{ date: string; shops: RerenderCandidate[]; failed: { shopId: string; error: string }[] }> {
  const res = await env.DB.prepare(
    `SELECT s.id, s.slug, s.published_version, s.rendered_visibility, v.shop_body FROM shops s
     JOIN versions v ON v.shop_id = s.id AND v.number = s.published_version`,
  ).all<{ id: string; slug: string; published_version: number; rendered_visibility: string | null; shop_body: string }>();
  const out: RerenderCandidate[] = [];
  const failed: { shopId: string; error: string }[] = [];
  // 1 軒ずつ。1 軒の失敗でほかが止まらない（M1）
  for (const r of res.results) {
    try {
      const today = visibleItemIds(JSON.parse(r.shop_body), now);
      const rendered: string[] = r.rendered_visibility ? JSON.parse(r.rendered_visibility) : [];
      const t = new Set(today), p = new Set(rendered);
      const added = today.filter((x) => !p.has(x));
      const removed = rendered.filter((x) => !t.has(x));
      if (added.length || removed.length) out.push({ shopId: r.id, slug: r.slug, publishedVersion: r.published_version, added, removed });
    } catch (e) {
      console.error(`[rerender] ${r.id}`, e);
      failed.push({ shopId: r.id, error: String(e).slice(0, 200) });
    }
  }
  return { date: jstDate(now).date, shops: out, failed };
}
