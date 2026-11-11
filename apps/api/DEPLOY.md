# apps/api を Cloudflare に出す手順（PowerShell）

ユーザーが手元で行う。上から順に PowerShell に貼る。**先に dev（試し）で通してから prod（本番）**。
prod は、下の `--env dev` を `--env prod` に、名前の `-dev` を取って同じことをする。

用意する物：Cloudflare のアカウント（R2 を使うにはカードの登録が要る）、Resend の API キー、（LINE で入るなら）LINE ログインのチャネル ID。

| | dev（試し） | prod（本番） |
|---|---|---|
| Worker | `mikke-api-dev` | `mikke-api-prod` |
| D1 | `mikke-shops-db-dev` | `mikke-shops-db` |
| R2 | `mikke-shops-photos-dev` | `mikke-shops-photos` |
| ログインの IP の制限 | `LOGIN_IP_LIMITER`（1001） | `LOGIN_IP_LIMITER`（1002） |

## 0. 入る・フォルダへ

```powershell
cd C:\Users\sea_p\GitHub\mikke-web\apps\api
npm ci
npx wrangler login
npx wrangler whoami
```

## 1. D1 と R2 を作る

```powershell
npx wrangler d1 create mikke-shops-db-dev
npx wrangler r2 bucket create mikke-shops-photos-dev
# 本番
npx wrangler d1 create mikke-shops-db
npx wrangler r2 bucket create mikke-shops-photos
```

`d1 create` の答えに出る `database_id`（`xxxxxxxx-xxxx-…`）を控える。

## 2. database_id を wrangler.toml に入れる

`<dev の ID>`・`<prod の ID>` を控えた値に変えてから貼る（メモ帳で `REPLACE_WITH_…` を直してもよい）。

```powershell
$f = "$PWD\wrangler.toml"
$t = [IO.File]::ReadAllText($f)
$t = $t.Replace("REPLACE_WITH_DEV_D1_DATABASE_ID", "<dev の ID>").Replace("REPLACE_WITH_PROD_D1_DATABASE_ID", "<prod の ID>")
[IO.File]::WriteAllText($f, $t, (New-Object Text.UTF8Encoding $false))
npm run deploy:check
```

`deploy:check`（dry-run）が dev・prod とも通ればよい。

**ドメインが決まったら**：`[env.dev.vars]`・`[env.prod.vars]` の `PUBLIC_DOMAIN`・`APP_ORIGINS`・`MAIL_FROM`（今は example の仮）を差し替え、`routes` のコメントを外す。公開のドメインとアプリのドメインは別の親ドメインにする（同じだと起動しない）。LINE で入るなら `LINE_LOGIN_CHANNEL_ID` にチャネル ID（秘密ではない）。

## 3. マイグレーションを当てる（--remote）

```powershell
npx wrangler d1 migrations apply DB --remote --env dev
npx wrangler d1 migrations list DB --remote --env dev
```

0001〜0005 の 5 つが ✅ になればよい（本番は `--env prod`。`npm run db:migrate:prod` でも同じ）。空の手元の D1 では 5 つとも当たることを確かめ済み（0005 は versions に render_state・render_error・render_url・rendered_at を足すだけ。表は 16 個のまま）。

## 4. 秘密の値を入れる（名前だけ。値は git に書かない）

| 名前 | 要るか | 中身 |
|---|---|---|
| `AUTH_SECRET` | 必須 | 32 文字以上の乱数。ログインのコードの鍵 |
| `RESEND_API_KEY` | 必須（`MAILER = "resend"` のため） | Resend の API キー（「Sending access」だけ・送り元のドメインに絞る） |
| `EDIT_RUNNER_SECRET` | 任意 | 段2 の PC の runner が ① を読み書きする鍵（32 文字以上）。入れなければ `/edit-api` は閉じたまま |

```powershell
# 乱数を作って、そのまま AUTH_SECRET に入れる（画面にもファイルにも残さない）
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
(($b | ForEach-Object { $_.ToString("x2") }) -join "") | npx wrangler secret put AUTH_SECRET --env dev
# Resend のキーは聞かれたら貼る
npx wrangler secret put RESEND_API_KEY --env dev
# 段2 とつなぐときだけ（同じ値を runner の側にも渡すので、作った値は控えておく）
# npx wrangler secret put EDIT_RUNNER_SECRET --env dev
npx wrangler secret list --env dev
```

dev と prod で別の値にする。秘密の値は出した後でも入れ直せる（すぐ効く）。

## 5. 出す

```powershell
npx wrangler deploy --env dev
```

答えの最後に出るアドレス（routes が無いあいだは `https://mikke-api-dev.<アカウント>.workers.dev`）を控える。

## 6. ざっと確かめる

```powershell
$u = "https://mikke-api-dev.<アカウント>.workers.dev"
curl.exe -s "$u/api/health"            # {"ok":true}
curl.exe -s "$u/api/me"                # 401 unauthenticated（ログインしていないので正しい）
npx wrangler tail --env dev            # 動いている記録を見る（Ctrl+C で止める）
```

- どの道も 500「設定に問題があるので動きません」なら、`wrangler tail` に理由が出る（`RESEND_API_KEY` が無い・`AUTH_SECRET` が短い・ドメインが同じ親など）
- 店・人を入れるのは制作側の API（README「API の一覧」の `/api/admin/*`）。最初の制作側の人は D1 に直接入れる：
  ```powershell
  npx wrangler d1 execute DB --remote --env dev --command "INSERT INTO users (id, email, name, role, created_at) VALUES ('usr_producer01', '<制作側のメール>', '制作側', 'producer', '2026-11-11T00:00:00Z')"
  ```
- 毎日 0 時（日本時間）の Cron（バックアップ・掃除）は、次の日に R2 の `backups/<日付>.json.gz` ができていれば動いている

## Workers Paid（$5/月）が要るか

**すすめる（prod は有料に）**。理由は CPU 時間。

- 無料は 1 回の要求で CPU 10ms まで（Cron も同じ）。毎日のバックアップ（全部の表を JSON＋gzip）と、写真の受け取りと検査（本文 最大 48MB）は、データが増えると 10ms を超えて止まるおそれがある。有料は既定 30 秒
- 使っている物：D1・R2・Cron 1 本・Rate Limiting・CompressionStream。Queues・Durable Objects・KV は使わない。Cron と Rate Limiting は無料でも使える
- D1：無料は 1 つ 500MB・読み 500 万行/日・書き 10 万行/日（有料は 1 つ 10GB）
- R2：10GB までは無料。使うにはカードの登録が要る
- dev は無料のままで試してよい（写真を何枚か上げる程度なら足りることが多い）。止まったら有料にする

## 今のところの仮・まだの物

- ドメイン・`MAIL_FROM` は example の仮。routes はコメントのまま（ドメインが決まってから）
- 公開のドメインは 2 段のワイルドカード（`*.staging.<ドメイン>`）が無料の証明書では足りない。試しは別のドメインか `<スラッグ>-dev.<ドメイン>` にする
- 手元の試験のメモ：`npx vitest run` 16 ファイル 151 件、`npx tsc --noEmit` 0 件（2026-11-11）。M1-3 の試験は日付で落ちていたのを直した（試験の誤り。コードは正しかった）
