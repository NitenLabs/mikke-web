-- 芦屋みっけ Web制作：最初の形（DATA_SPEC 6章「下書き・公開・記録の持ち方」）
-- 日時は ISO 8601（UTC の Z）。ログインまわりの時刻だけ、比べやすいようにミリ秒の数字で持つ。

-- ユーザー（B2）。role：owner＝店主（自分のお店だけ）／producer＝制作側（全部）
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'producer')),
  created_at  TEXT NOT NULL,
  disabled_at TEXT
);

-- お店。slug は公開ページのサブドメイン（D3）
CREATE TABLE shops (
  id                  TEXT PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  template            TEXT NOT NULL DEFAULT 'wa-01',
  created_at          TEXT NOT NULL,
  version_seq         INTEGER NOT NULL DEFAULT 0,   -- 版の番号に使った最大の数（減らさない）
  published_version   INTEGER,                      -- 公開中の版の番号（NULL＝まだ公開していない）
  rendered_visibility TEXT                          -- 公開中の HTML を描いた日の「出ている品」（JSON の配列。D6）
);

-- 店主とお店のつながり（店主は自分のお店だけ）
CREATE TABLE memberships (
  user_id    TEXT NOT NULL REFERENCES users(id),
  shop_id    TEXT NOT NULL REFERENCES shops(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, shop_id)
);
CREATE INDEX memberships_shop ON memberships(shop_id);

-- ログインの申し込み（B1）。コードとリンクの合言葉は、ハッシュだけを持つ
CREATE TABLE login_requests (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  user_id    TEXT,                 -- 知らないアドレスでも行は作る（あるかないかを外から見分けられないように）
  code_hash  TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,     -- ミリ秒
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,              -- 使った／新しい申し込みで無効になった
  attempts   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX login_requests_email ON login_requests(email, created_at);

-- セッション。Cookie の値のハッシュだけを持つ
CREATE TABLE sessions (
  id_hash      TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- 下書き（B3・B4）。kind：shop＝① お店の情報／site＝②③ サイトの組み立て（{draft, theme}）
CREATE TABLE drafts (
  shop_id    TEXT NOT NULL REFERENCES shops(id),
  kind       TEXT NOT NULL CHECK (kind IN ('shop', 'site')),
  version    INTEGER NOT NULL,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (shop_id, kind)
);

-- 編集の設定（最近使った色など）。版に入れない・比べない（DATA_SPEC 6章）
CREATE TABLE editor_settings (
  shop_id    TEXT PRIMARY KEY REFERENCES shops(id),
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 公開した版（D1・D4）。新しい方から 30 を残す
CREATE TABLE versions (
  shop_id           TEXT NOT NULL REFERENCES shops(id),
  number            INTEGER NOT NULL,
  scope             TEXT NOT NULL CHECK (scope IN ('all', 'shop')),  -- サイト全体／お店の情報だけ
  shop_body         TEXT NOT NULL,
  site_body         TEXT NOT NULL,
  pages             TEXT NOT NULL,   -- 置いたページの道の並び（JSON）
  has_css           INTEGER NOT NULL DEFAULT 0,
  files             TEXT NOT NULL DEFAULT '[]',  -- sitemap.xml などの名前（JSON）
  visibility        TEXT NOT NULL,   -- 公開した日の「出ている品」（JSON）
  published_at      TEXT NOT NULL,
  published_by      TEXT,
  published_by_kind TEXT NOT NULL,
  PRIMARY KEY (shop_id, number)
);

-- 版が指している写真（C4：これに載っている写真は消さない／公開ページで配ってよい写真）
CREATE TABLE version_assets (
  shop_id  TEXT NOT NULL,
  number   INTEGER NOT NULL,
  asset_id TEXT NOT NULL,
  PRIMARY KEY (shop_id, number, asset_id)
);
CREATE INDEX version_assets_asset ON version_assets(asset_id);

-- 戻す前の下書き。新しい方から 10
CREATE TABLE draft_backups (
  id         TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id),
  shop_body  TEXT NOT NULL,
  site_body  TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE INDEX draft_backups_shop ON draft_backups(shop_id, created_at);

CREATE TABLE backup_assets (
  backup_id TEXT NOT NULL,
  asset_id  TEXT NOT NULL,
  PRIMARY KEY (backup_id, asset_id)
);
CREATE INDEX backup_assets_asset ON backup_assets(asset_id);

-- ④ 素材置き場。meta は assets.schema.json の 1 件の形（file・origin・rights・slot・alt…）
-- 消した写真も行は残す（purged_at）。ID を使い回さないため（DATA_SPEC 2.2）
CREATE TABLE assets (
  id          TEXT PRIMARY KEY,
  shop_id     TEXT NOT NULL REFERENCES shops(id),
  r2_key      TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  sha256      TEXT,
  meta        TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT,
  trashed_at  TEXT,
  purged_at   TEXT
);
CREATE INDEX assets_shop ON assets(shop_id, uploaded_at);

-- 変更の記録（DATA_SPEC 6章）。いつ・誰が・どの層の・どの場所を・前→後（要約）
CREATE TABLE changes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id    TEXT NOT NULL,
  at         TEXT NOT NULL,
  first_at   TEXT NOT NULL,           -- 続けて直した分をまとめたときの、最初の日時
  actor_id   TEXT,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('owner', 'producer', 'system')),
  layer      TEXT NOT NULL CHECK (layer IN ('shop', 'site', 'theme', 'assets', 'publish')),
  action     TEXT NOT NULL,
  path       TEXT NOT NULL,
  before     TEXT,
  after      TEXT
);
CREATE INDEX changes_shop ON changes(shop_id, id);
