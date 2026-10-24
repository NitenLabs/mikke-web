export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  PUBLIC_DOMAIN: string;
  APP_ORIGINS: string;
  MAILER: string;
  COOKIE_SECURE: string;
  AUTH_SECRET: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
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
