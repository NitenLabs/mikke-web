-- 店主のログインの入口を増やす（段3）：同じ 1 人（users の 1 行）に、メールのほか LINE をつなぐ
-- メール（users.email）はいつも持つ（PC はメールで入る）。LINE は「つないだら使える」もう 1 つの入口
-- provider：今は line だけ。subject：LINE の userId（U＋16 進 32 桁。LINE ログインのチャネルと同じプロバイダーの中で同じ値）
CREATE TABLE user_identities (
  provider      TEXT NOT NULL CHECK (provider IN ('line')),
  subject       TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id),
  display_name  TEXT,
  created_at    TEXT NOT NULL,
  last_login_at INTEGER,          -- ミリ秒
  PRIMARY KEY (provider, subject)
);
-- 1 人につき LINE は 1 つまで
CREATE UNIQUE INDEX user_identities_user ON user_identities(user_id, provider);
