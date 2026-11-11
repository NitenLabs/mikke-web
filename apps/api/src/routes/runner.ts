import { Hono } from "hono";
import type { AppEnv } from "../env";
import { sha256Hex, timingSafeEqual } from "../lib/crypto";
import { ApiError, readJson } from "../lib/http";
import { draftChangeRows, recordChanges, SYSTEM } from "../services/changes";
import { draftJson, getDraft, MAX_DRAFT_BYTES, parseIfMatch, saveDraft, validateDraft } from "../services/drafts";

/**
 * 段2（mikke-desk の直しの依頼）とのつなぎ：PC の edit-runner が、お店の ①（shop の下書き）を読み書きする口。
 * ブラウザではないので Cookie・Origin は使わず、ヘッダ `x-edit-runner-secret` の鍵で入る（/api の外に置く）。
 * 鍵が Worker に無い（か 32 文字より短い）ときは口を閉じる（503）。
 * 書くのは ① 全体（runner が承認済みの差分を当てた後の物）。版番号（If-Match）が古ければ 409。公開はしない（下書きになるだけ）。
 */
export const runner = new Hono<AppEnv>();

runner.use("*", async (c, next) => {
  const want = c.env.EDIT_RUNNER_SECRET ?? "";
  if (want.length < 32) throw new ApiError(503, "runner_closed", "runner の口は閉じています（EDIT_RUNNER_SECRET がありません）");
  const got = c.req.header("x-edit-runner-secret") ?? "";
  if (!got || !timingSafeEqual(await sha256Hex(got), await sha256Hex(want))) throw new ApiError(401, "unauthenticated", "鍵が違います");
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
});

/** :shop はお店の ID（shp_…）か slug（mikke-web の店のフォルダ名と同じにしておく。例 amet） */
async function findShop(c: { env: AppEnv["Bindings"] }, key: string): Promise<{ id: string; slug: string }> {
  if (!/^[a-z0-9_-]{1,64}$/.test(key)) throw new ApiError(404, "not_found", "お店が見つかりません");
  const s = await c.env.DB.prepare("SELECT id, slug FROM shops WHERE id = ? OR slug = ?").bind(key, key).first<{ id: string; slug: string }>();
  if (!s) throw new ApiError(404, "not_found", "お店が見つかりません");
  return s;
}

/** runner の shopHash と同じ：JSON.stringify(①) の SHA-256 */
const hashOf = (data: unknown) => sha256Hex(JSON.stringify(data ?? null));

/** ① を書き出す。{shopId, slug, version, baseHash, data, updatedAt} */
runner.get("/shops/:shop/shop", async (c) => {
  const s = await findShop(c, c.req.param("shop"));
  const d = await getDraft(c.env, s.id, "shop");
  if (!d) throw new ApiError(404, "not_found", "① の下書きがありません");
  return c.json({ shopId: s.id, slug: s.slug, version: d.version, baseHash: await hashOf(d.data), data: d.data, updatedAt: d.updatedAt }, 200, { ETag: `"${d.version}"` });
});

/** 承認済みの直しを当てた ① を書き戻す。If-Match: "読んだ版" が要る。本文は ① そのもの */
runner.put("/shops/:shop/shop", async (c) => {
  const s = await findShop(c, c.req.param("shop"));
  const expected = parseIfMatch(c.req.header("if-match"));
  if (expected === null) throw new ApiError(428, "precondition_required", "If-Match に、読んだときの版番号を付けてください");
  const data = await readJson(c, MAX_DRAFT_BYTES);
  validateDraft("shop", s.id, data);
  const before = await getDraft(c.env, s.id, "shop");
  const rows = draftChangeRows("shop", before?.data, data);
  const saved = (before?.version ?? 0) === expected ? await saveDraft(c.env, s.id, "shop", expected, data, null) : null;
  if (!saved) {
    const current = await getDraft(c.env, s.id, "shop");
    throw new ApiError(409, "conflict", "読んだ後に ① が直されています（店主の編集画面など）。読み直して差分を当て直してください", {
      current: current ? { ...draftJson("shop", current), baseHash: await hashOf(current.data) } : { kind: "shop", version: 0, data: null },
    });
  }
  await recordChanges(c.env, s.id, SYSTEM, rows);
  return c.json({ shopId: s.id, version: saved.version, baseHash: await hashOf(data), updatedAt: saved.updatedAt }, 200, { ETag: `"${saved.version}"` });
});
