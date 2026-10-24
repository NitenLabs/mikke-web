import type { Env } from "../env";

/** 「同じ持ち主のドメイン」を見分けるための、2 段の公開の接尾辞（よく使うものだけ） */
const TWO_LEVEL_SUFFIXES = new Set([
  "co.jp", "ne.jp", "or.jp", "ac.jp", "ad.jp", "ed.jp", "go.jp", "gr.jp", "lg.jp",
  "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "org.au", "co.nz", "com.tw", "com.cn", "co.kr",
]);

/** ホスト名の「登録したドメイン」（eTLD+1 のおおよそ） */
export function siteOf(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const last2 = labels.slice(-2).join(".");
  return TWO_LEVEL_SUFFIXES.has(last2) ? labels.slice(-3).join(".") : last2;
}

const isLocal = (host: string) => host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1";

/**
 * 設定の確かめ（起動時＝その isolate で最初の要求のとき）。危ない組み合わせなら動かない。
 * L5：公開ページのドメインとアプリのドメインが同じ親ドメイン（local は除く）
 * L6：本番（COOKIE_SECURE=true）で MAILER=log（コードがログに残るだけになる）
 */
export function configProblems(env: Env): string[] {
  const out: string[] = [];
  const secure = env.COOKIE_SECURE !== "false";
  const pub = (env.PUBLIC_DOMAIN || "").toLowerCase();
  if (!pub) out.push("PUBLIC_DOMAIN が空です");
  const origins = (env.APP_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origins.length) out.push("APP_ORIGINS が空です");
  for (const o of origins) {
    let host: string;
    try {
      host = new URL(o).hostname;
    } catch {
      out.push(`APP_ORIGINS の形が正しくありません：${o}`);
      continue;
    }
    if (secure && !o.startsWith("https://")) out.push(`本番の APP_ORIGINS は https にしてください：${o}`);
    if (isLocal(host) && isLocal(pub)) continue;
    if (siteOf(host) === siteOf(pub)) out.push(`公開ページのドメイン（${pub}）とアプリのドメイン（${host}）は、別の親ドメインにしてください`);
  }
  if (!["log", "memory"].includes(env.MAILER)) out.push(`MAILER=${env.MAILER} はまだ作っていません（log か memory）`);
  if (secure && env.MAILER === "log") out.push("本番（COOKIE_SECURE=true）で MAILER=log は使えません（ログインのコードがログに残るだけになる）");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) out.push("AUTH_SECRET（32 文字以上）が設定されていません");
  return out;
}

const checked = new WeakMap<object, string[]>();
export function assertConfig(env: Env): void {
  let p = checked.get(env);
  if (!p) {
    p = configProblems(env);
    checked.set(env, p);
  }
  if (p.length) throw new ConfigError(p);
}

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(`設定に問題があるので動きません：${problems.join(" ／ ")}`);
  }
}
