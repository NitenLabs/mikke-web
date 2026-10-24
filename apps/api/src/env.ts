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
