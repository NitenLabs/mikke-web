import type { Env } from "./env";
import { handleFetch } from "./app";
import { purgeTrash } from "./services/assets";
import { rerenderCandidates } from "./services/rerender";

/** 毎日 0 時（日本時間）の仕事：描き直しが要るお店を挙げる（D6）・ゴミ箱の掃除（C4） */
export async function runDaily(env: Env, now: Date) {
  const rerender = await rerenderCandidates(env, now);
  const purge = await purgeTrash(env, now);
  console.log(`[daily] ${rerender.date} 描き直しが要るお店 ${rerender.shops.length} 軒`, JSON.stringify(rerender.shops), `写真を消した ${purge.purged.length}・残した ${purge.kept.length}`);
  return { rerender, purge };
}

export default {
  fetch: handleFetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDaily(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
