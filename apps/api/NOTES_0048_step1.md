# 0048 step1 メモ（あとで消すか README に混ぜる）

## 落ちていた試験
- test/cron.test.ts M1-3。原因：ゴミ箱の日時を本物の時計（Date.now()-31日）で作り、runDaily には固定の 2026-11-01 を渡していた。2026-11-02 を過ぎると 30 日に届かず purged が空。コードは渡された now で正しく数える＝**試験の誤り**。日時を runDaily に渡す日から作るよう直した（消さず・飛ばさず）
- 結果：141/141 通過、tsc 0 件
- worktree に node_modules が無かったので apps/api/node_modules を本体へのジャンクションにした（.gitignore 済み）

## 環境と名前（wrangler.toml）
| | local（上の段） | dev | prod |
|---|---|---|---|
| Worker | mikke-api | mikke-api-dev | mikke-api-prod |
| D1（DB） | mikke | mikke-shops-db-dev | mikke-shops-db |
| R2（BUCKET） | mikke-media | mikke-shops-photos-dev | mikke-shops-photos |
| Rate Limit | なし | LOGIN_IP_LIMITER 1001 | LOGIN_IP_LIMITER 1002 |
- database_id は `REPLACE_WITH_DEV/PROD_D1_DATABASE_ID`。ドメイン・MAIL_FROM は example の仮。routes はコメント
- dry-run（--env dev / prod）通過。`npm run deploy:check`・`db:migrate:dev/prod`・`deploy:dev/prod` を足した

## 秘密の値（名前だけ）
AUTH_SECRET（必須・32 文字以上）、RESEND_API_KEY（MAILER=resend のとき）。vars：PUBLIC_DOMAIN・APP_ORIGINS・MAILER・MAIL_FROM・COOKIE_SECURE・PUBLIC_PORT

## マイグレーション
空の local（--persist-to 別フォルダ）に top/dev/prod それぞれ 0001→0003 を当てた：全部 ✅、表 15 個（コードが使う表と一致）＋索引 11

## 無料の枠か有料（$5/月）か
- 使っている：D1・R2・Cron 1 本・Rate Limiting・CompressionStream。Queues・Durable Objects・KV は使わない
- **有料をすすめる理由は CPU 時間**：無料は 1 回 10ms（Cron も同じ）。毎日のバックアップ（全部の表を JSON＋gzip）・最大 48MB の写真の受け取りと検査は、データが増えると 10ms を超えるおそれ。有料は既定 30 秒
- D1 無料：1 つ 500MB・読み 500 万行/日・書き 10 万行/日（有料は 10GB/つ）。R2 は 10GB まで無料だが有効にするのにカード登録が要る
- Cron・Rate Limiting は無料でも使える
