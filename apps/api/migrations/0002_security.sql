-- セキュリティの見直し（M2・M3・L9・L10）

-- M3：ログインの申し込みを、申し込んだブラウザに結びつける（Cookie の乱数のハッシュ）
ALTER TABLE login_requests ADD COLUMN browser_hash TEXT;
CREATE INDEX login_requests_browser ON login_requests(email, browser_hash, created_at);

-- M3：コードの失敗の累計（アカウントごと。1 日 20 回で止める）
CREATE TABLE login_failures (
  email TEXT NOT NULL,
  at    INTEGER NOT NULL   -- ミリ秒
);
CREATE INDEX login_failures_email ON login_failures(email, at);

-- L9：セッションの寿命の上限は created_at から決める（列は今のまま）

-- L10：公開は 1 分に 1 回まで（最後に公開した時刻、ミリ秒）
ALTER TABLE shops ADD COLUMN last_publish_at INTEGER;
