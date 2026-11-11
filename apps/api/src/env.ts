export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  PUBLIC_DOMAIN: string;
  APP_ORIGINS: string;
  MAILER: string;
  COOKIE_SECURE: string;
  /** local だけ：公開ページのアドレスに付ける番号（8787） */
  PUBLIC_PORT?: string;
  AUTH_SECRET: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  /** ログインの手前の IP ごとの回数の制限（Workers の Rate Limiting）。local・試験ではない */
  LOGIN_IP_LIMITER?: RateLimit;
  /** LINE ログイン（LIFF）のチャネル ID（vars。秘密ではない）。無ければ LINE では入れない（503） */
  LINE_LOGIN_CHANNEL_ID?: string;
  /** 段2 の PC の runner が ① を読み書きする鍵（秘密。32 文字以上）。無ければ /edit-api は閉じる（503） */
  EDIT_RUNNER_SECRET?: string;
}

export type Role = "owner" | "producer";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: User;
    sessionHash: string;
  };
};
