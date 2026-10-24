import type { Env } from "./env";
import { handleFetch } from "./app";
import { purgeTrash } from "./services/assets";
import { cleanupAuth } from "./services/cleanup";
import { runBackup } from "./services/backup";
import { assertConfig } from "./services/config";
import { rerenderCandidates } from "./services/rerender";

/** 1 つの仕事が失敗しても、ほかの仕事は続ける（M1） */
async function job<T>(name: string, f: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await f();
  } catch (e) {
    console.error(`[daily] ${name} が失敗しました`, e);
    return { error: String(e).slice(0, 200) };
  }
}

/** 毎日 0 時（日本時間）の仕事：バックアップ（B6）・描き直しが要るお店を挙げる（D6）・ゴミ箱の掃除（C4）・期限切れのログインの片づけ（L4） */
export async function runDaily(env: Env, now: Date) {
  assertConfig(env);
  // バックアップは先に（その日の掃除・片づけの前の状態を残す）
  const backup = await job("backup", () => runBackup(env, now));
  const rerender = await job("rerender", () => rerenderCandidates(env, now));
  const purge = await job("purge", () => purgeTrash(env, now));
  const cleanup = await job("cleanup", () => cleanupAuth(env, now));
  console.log("[daily]", JSON.stringify({ backup, rerender, purge, cleanup }).slice(0, 4000));
  return { backup, rerender, purge, cleanup };
}

export default {
  fetch: handleFetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDaily(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
