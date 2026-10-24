-- C3：公開ページの写真の大きさ違い（編集画面が作って、写真と一緒に送る）
-- 台帳（④ assets.meta）には持たない（DATA_SPEC 5.2「表示用の縮小版は台帳には持たない」）
CREATE TABLE asset_variants (
  asset_id   TEXT NOT NULL,
  shop_id    TEXT NOT NULL,
  width      INTEGER NOT NULL,
  format     TEXT NOT NULL CHECK (format IN ('webp', 'jpg')),
  height     INTEGER NOT NULL,
  bytes      INTEGER NOT NULL,
  r2_key     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, width, format)
);
CREATE INDEX asset_variants_shop ON asset_variants(shop_id);
