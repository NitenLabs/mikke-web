import type { Env } from "../env";

/** L4：期限の切れたログインの申し込み・セッション・古い失敗の記録を消す（毎日） */
export async function cleanupAuth(env: Env, now = new Date()) {
  const t = now.getTime();
  const DAY = 24 * 3600 * 1000;
  const [lr, ss, lf] = await env.DB.batch([
    // 回数の制限（1 時間）に使うので、期限が切れてから 1 日は残す
    env.DB.prepare("DELETE FROM login_requests WHERE expires_at < ?").bind(t - DAY),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t),
    // 1 日の失敗の累計に使うので、2 日は残す
    env.DB.prepare("DELETE FROM login_failures WHERE at < ?").bind(t - 2 * DAY),
  ]);
  return { loginRequests: lr.meta.changes, sessions: ss.meta.changes, loginFailures: lf.meta.changes };
}
