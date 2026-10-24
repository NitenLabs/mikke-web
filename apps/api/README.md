# apps/api — 芦屋みっけ Web制作の本番の仕組み（Cloudflare Worker）

1 つの Worker で、次の 2 つを受け持つ（`docs/plan/ARCHITECTURE.md`）。

- **API**（編集画面から）：ログイン・権限・下書き・版・写真・公開
- **公開ページの配信**：ホスト名 `<お店のスラッグ>.<公開のドメイン>` からお店を引いて、公開中の版の HTML・CSS・写真を返す

Hono・TypeScript・wrangler。データは D1（`migrations/`）、写真と公開ページは R2。今は **local だけ**で動く（Cloudflare のアカウントはまだない）。

## ローカルで動かす

```sh
cd apps/api
npm install                      # .npmrc に legacy-peer-deps（vitest 4 と pool-workers の組み合わせのため）
cp .dev.vars.example .dev.vars   # AUTH_SECRET（32 文字以上）
npm run seed -- --producer you@example.com --owner owner@ashiyado.example   # 芦屋堂のお店を作る（何度流してもよい）
npm run dev                      # http://localhost:8787
```

- `npm run seed` は、マイグレーションを当て、`samples/ashiyado` の ①（shop.json）・③（theme.json）・④（assets.json と media/ の写真 12 枚）から、お店 `shp_ashiyado`（スラッグ `ashiyado`）・制作側・店主・下書き・写真を local の D1・R2 に入れる。②の下書きは wa-01 の「何もしていない」形（`{template, sections}`）。`samples/` は読むだけ
- ログイン：`POST /api/auth/request` を送ると、**wrangler dev の画面に `[mail] to=… code=123456 link=…` が出る**（今のメールは「ログに出す」だけ）
- 公開ページ：公開したあと `http://ashiyado.localhost:8787/`（Chrome・Firefox は `*.localhost` を手元に向ける。curl なら `-H "Host: ashiyado.localhost"`）
- 毎日 0 時の仕事を手で走らせる：`npx wrangler dev --test-scheduled` で動かし、`curl -X POST localhost:8787/cdn-cgi/handler/scheduled`

curl で一通り：

```sh
O='Origin: http://localhost:8787'; J='Content-Type: application/json'
curl -X POST localhost:8787/api/auth/request -H "$O" -H "$J" -d '{"email":"owner@ashiyado.example"}'
curl -c cj -X POST localhost:8787/api/auth/verify -H "$O" -H "$J" -d '{"email":"owner@ashiyado.example","code":"<ログのコード>"}'
curl -b cj localhost:8787/api/shops/shp_ashiyado/drafts/site
curl -b cj -X POST localhost:8787/api/shops/shp_ashiyado/publish -H "$O" -H "$J" \
  -d '{"scope":"all","shopDraftVersion":1,"siteDraftVersion":1,"pages":{"/":"<h1>芦屋堂</h1><img src=\"/media/ast_frma\">"}}'
curl -H 'Host: ashiyado.localhost' localhost:8787/
```

## 試験

```sh
npm test            # vitest ＋ @cloudflare/vitest-pool-workers（local の D1・R2 で走る）。7 ファイル 75 件
npm run typecheck   # tsc
```

試験の名前の頭に RELEASE.md の項目の番号（`B1-3`・`D4-1` など）。DATA_SPEC 6章の変更の記録は `6章-*`、種まきは `seed-*`。

| ファイル | 項目 |
|---|---|
| `test/auth.test.ts` | B1 ログイン・CSRF・CORS |
| `test/perms.test.ts` | B2 権限 |
| `test/drafts.test.ts` | B3・B4 下書き、編集の設定、変更の記録 |
| `test/publish.test.ts` | D1 公開、D3 配信、D4 履歴と戻す |
| `test/assets.test.ts` | C2 写真の検査、C4 ゴミ箱 |
| `test/cron.test.ts` | D6 毎日の描き直しの入口 |
| `test/seed.test.ts` | 芦屋堂の種まき |

## API の一覧

すべて JSON（写真を上げるときだけ本文が写真）。`/api/*` は API のホスト（例 `app.<アプリのドメイン>`）だけで答え、お店のサブドメインでは答えない。

**権限**：— ＝だれでも／ログイン＝ログインしていれば／店＝そのお店の店主か制作側（ほかのお店は 404 に見せる）／制作＝制作側だけ

| 道 | 中身 | 権限 |
|---|---|---|
| `GET /api/health` | 生きているか | — |
| `POST /api/auth/request` `{email}` | 6 桁のコードとリンクをメールで送る（有効 15 分、1 回だけ）。登録のないアドレスでも同じ答え。同じアドレスは 60 秒あける・1 時間に 5 回まで（429・`Retry-After`）。答え `{ok, expiresInMinutes, retryAfter}` | — |
| `POST /api/auth/verify` `{email, code}` か `{token}` | コードかリンクの合言葉で入る。Cookie を付けて `{user}`。コードは 5 回まちがえると使えない | — |
| `POST /api/auth/logout` | セッションを消す | — |
| `GET /api/me` | `{user:{id,email,name,role}, shops:[{id,slug,name,publishedVersion}]}` | ログイン |
| `GET /api/shops/:shopId` | お店 `{id,slug,name,template,publishedVersion,publicUrl}` | 店 |
| `GET /api/shops/:shopId/drafts/:kind` | 下書き（`kind` は `shop`＝① ／ `site`＝②③）。`{kind, version, data, updatedAt, updatedBy}`、`ETag: "版"` | 店 |
| `PUT /api/shops/:shopId/drafts/:kind` | 下書きを保存。**`If-Match: "読んだ版"` が要る**（ないと 428）。本文は下書きそのもの。答え `{kind, version, updatedAt}`。版が古いと **409 `{error:"conflict", current:{version, data, …}}`** | 店 |
| `GET /api/shops/:shopId/settings` | 編集の設定 `{recentColors:[#rrggbb…]}` | 店 |
| `PUT /api/shops/:shopId/settings` | 同じ形で保存（5 つまで・版なし・後勝ち） | 店 |
| `GET /api/shops/:shopId/status` | 状態の文字 `{state:"unpublished"\|"same"\|"changed", label, shopSame, siteSame, drafts:{shop:{version}, site:{version}}, published}` | 店 |
| `GET /api/shops/:shopId/changes?limit=&before=` | 変更の記録（新しい方から） | 店 |
| `POST /api/shops/:shopId/publish` | 公開（下の「公開の本文」） | 店 |
| `GET /api/shops/:shopId/versions` | 履歴（新しい方から 30）`[{number, scope, pages, publishedAt, publishedBy, isPublished}]` | 店 |
| `GET /api/shops/:shopId/versions/:n` | 版の中身 `{number, scope, …, shop, site}` | 店 |
| `POST /api/shops/:shopId/versions/:n/restore` `{siteDraftVersion, includeShop?, shopDraftVersion?}` | 「この版を下書きにする」。②③ はまるごと、① は `includeShop` のときだけ。公開中の版は変わらない。答え `{restoredFrom, backupId, drafts:{site:{version}, shop?:{version}}}`。版が古いと 409 | 店 |
| `GET /api/shops/:shopId/backups` | 戻す前の下書き（新しい方から 10） | 店 |
| `GET /api/shops/:shopId/backups/:id` | その中身 `{shop, site}` | 店 |
| `POST /api/shops/:shopId/backups/:id/restore` `{siteDraftVersion, shopDraftVersion}` | 戻す前の下書きを下書きに戻す（①②③） | 店 |
| `POST /api/shops/:shopId/assets` | 写真を上げる。本文は写真そのもの、`Content-Type: image/jpeg\|png\|webp`、名前は `X-File-Name`（URL エンコード）。答え 201 で ④ の 1 件 `{id, kind, file:{key,mime,width,height,bytes,exifStripped}, uploadedAt, uploadedBy, origin, rights}` | 店 |
| `GET /api/shops/:shopId/assets?trash=1` | ④ の一覧（`assets.json` と同じ `{schemaVersion, assets:{id: …}}`。`trash=1` でゴミ箱の中も） | 店 |
| `GET /api/shops/:shopId/assets/:id` | 1 件 | 店 |
| `GET /api/shops/:shopId/assets/:id/file` | 写真そのもの（編集画面用） | 店 |
| `PATCH /api/shops/:shopId/assets/:id` `{alt?, slot?, kind?, rights?:{basis, note?}}` | 台帳を直す | 店 |
| `DELETE /api/shops/:shopId/assets/:id` | ゴミ箱へ。答え `{trashedAt, purgeAfterDays:30, referencedBy:["version:3", "draft:site", …]}` | 店 |
| `POST /api/shops/:shopId/assets/:id/restore` | ゴミ箱から戻す | 店 |
| `GET /api/admin/shops` | お店の一覧 | 制作 |
| `POST /api/admin/shops` `{slug, name, id?}` | お店を作る（wa-01 の最初の下書きつき） | 制作 |
| `POST /api/admin/users` `{email, name?, role}` | ユーザーを作る（`owner`／`producer`） | 制作 |
| `POST /api/admin/shops/:shopId/members` `{email}` | 店主をお店につなぐ | 制作 |
| `DELETE /api/admin/shops/:shopId/members/:userId` | つながりを外す | 制作 |
| `GET /api/admin/rerender` | 描き直しが要るお店（毎日の Cron と同じ） | 制作 |
| `POST /api/admin/purge-trash` | ゴミ箱の掃除を今すぐ | 制作 |

### 下書きの中身

- `shop`：① お店の情報（`shop.schema.json` の形。`shopId` があるならそのお店の ID）
- `site`：**`{draft, theme?}`**。`draft` は DATA_SPEC 4.9 の「今の形」（`template`・`sections` は必須、あとは 4.9 のとおり）、`theme` は ③（`theme.schema.json`。`recentColors` は入れずに `settings` へ）
- 中身の細かい検査はしない（packages/core と tools/validate の担当）。サーバーは「入れ物の形」と大きさ（各 900KB まで）だけを見る

### 公開の本文（`POST /api/shops/:shopId/publish`）

```json
{
  "scope": "all",
  "shopDraftVersion": 7,
  "siteDraftVersion": 42,
  "pages": { "/": "<!doctype html>…", "/menu": "…", "/contact": "…", "/privacy": "…", "/404": "…" },
  "css": "…",
  "files": { "sitemap.xml": "…", "robots.txt": "…" }
}
```

- `scope`：`all`＝編集画面の公開（①②③）／`shop`＝メニュー画面の公開（① だけ。②③ は公開中の版から引き継ぐ。一度も公開していなければ 409）
- `shopDraftVersion`・`siteDraftVersion`：**HTML を描いたときの下書きの版**。今の版と違えば 409（古い HTML で公開しない）
- `pages`：道（`/`・`/menu`・`/a/b`。英小文字・数字・ハイフン）→ HTML。`/` は必須、50 枚・1 枚 2MB まで。`/404` は見つからないページとして出す
- `css`：あれば `/style.css` で出す。`files`：`sitemap.xml`・`robots.txt` だけ
- 写真は HTML の中で **`/media/<④の ID>`**（例 `<img src="/media/ast_frma">`）。①②③ と HTML・CSS の中の `ast_…` はすべてこのお店の写真でなければ 400（`{error:"unknown_assets", assets:[…]}`）
- 答え `{number, scope, publishedAt, pages, assets, url}`

### 公開ページ（`<スラッグ>.<PUBLIC_DOMAIN>`）

| 道 | 返すもの |
|---|---|
| `/`・`/menu`（`/menu/` も） | 公開中の版のページ。`Cache-Control: no-cache`＋`ETag`（公開したらすぐ変わる。304 も返す） |
| `/style.css`・`/sitemap.xml`・`/robots.txt` | 公開のときに送ったもの |
| `/media/ast_…` | 公開中の版が指している、このお店の写真だけ（ゴミ箱に入れていても、版が指していれば出す）。`immutable` |
| ほか | 404。お店の `/404` があればそれ、なければ決まった 404 ページ。まだ公開していないお店・知らないスラッグも 404 |

### エラーの形

`{error: "種類", message: "日本語の説明", …}`。主な種類：`unauthenticated`(401)・`forbidden`/`bad_origin`(403)・`not_found`(404)・`conflict`(409)・`precondition_required`(428)・`too_soon`/`too_many`(429)・`too_large`(413)・`unsupported_media_type`/`not_an_image`/`type_mismatch`(415)・`invalid_*`(400)

### 編集画面からの呼び方（守ること）

- `fetch(…, {credentials: "include"})`。書き込みは `Content-Type: application/json`（写真は写真の種類）
- 下書きの保存は、読んだ `version` を `If-Match: "<version>"` に付ける。409 なら `current` を見せて選んでもらう（知らせなしに上書きしない）
- ログインのリンクは `<APP_ORIGINS の先頭>/login?t=<合言葉>`。編集画面のその道で `POST /api/auth/verify {token}` を呼ぶ（メールのリンクを開いただけでは入らない。メールの中身を先読みする仕組みにリンクを使われないため）

## 本番に出すとき（ユーザーが用意するもの）

| もの | 中身 |
|---|---|
| Cloudflare の API トークン | アカウント：**Workers Scripts 編集・D1 編集・Workers R2 Storage 編集**・Account Settings 読む。ゾーン（公開のドメインとアプリのドメイン）：**Workers Routes 編集・DNS 編集**・Zone 読む |
| D1 | `mikke-staging`・`mikke-production`（`wrangler d1 create` で作り、出た ID を `wrangler.toml` の `[env.*]` に） |
| R2 | `mikke-media-staging`・`mikke-media-production` |
| 公開のドメイン | 例 `mikke.site`。DNS に `*`（ワイルドカード、プロキシ有効）と Workers のルート `*.<ドメイン>/*`。**`*.staging.<ドメイン>` のような 2 段のワイルドカードは無料の証明書（Universal SSL）では足りない**（Advanced Certificate Manager が要る）。試しは別のドメインにするか、`<スラッグ>-staging.<ドメイン>` にするかを決める |
| アプリのドメイン | 編集画面と API。**公開のドメインとは別のドメインにするのがおすすめ**（例 `app.mikke-web.jp`）。同じドメインのサブドメイン（`app.<公開のドメイン>`）でも動く（`app` は予約語でお店に使わせない） |
| Resend | API キー（`wrangler secret put RESEND_API_KEY`）、送り元のドメインの確認（SPF・DKIM の DNS）、送り元のアドレス（`MAIL_FROM`）。`MAILER = "resend"` の実装はまだ（下の「まだ」） |
| 秘密の値 | `wrangler secret put AUTH_SECRET`（`openssl rand -hex 32` など 32 文字以上） |

`wrangler.toml` の `[env.staging]` にひな形を書いてある。`PUBLIC_PORT` は local だけ（本番では書かない）、`COOKIE_SECURE = "true"`。

## 決めたこと

| # | 決めたこと | 理由 |
|---|---|---|
| 1 | API と公開ページを 1 つの Worker にし、ホスト名で振り分ける。`<スラッグ>.<PUBLIC_DOMAIN>` は公開ページ、それ以外は API。予約語（`app`・`api`・`www` など）のサブドメインは API 側 | 1 つで済む。編集画面を `app.<ドメイン>` に置ける |
| 2 | セッションは Cookie `__Host-mikke_sid`（HttpOnly・Secure・SameSite=Lax・Path=/・Domain なし）、30 日、使っている間は延ばす。サーバーは値のハッシュだけを持つ | `__Host-` で、お店のサブドメインのページから Cookie を書き換えられない（Cookie の押し付けを防ぐ） |
| 3 | CSRF：書き込みは Origin が `APP_ORIGINS` のどれかのときだけ（ないものも断る）。JSON の道は `Content-Type: application/json` だけ受ける。CORS も同じオリジンだけ（Cookie つき） | 公開ページは同じサイトでもオリジンが違うので、お店のページに書いたスクリプトからは API を叩けない |
| 4 | ログイン：6 桁のコードとリンクを 1 通で。15 分・1 回だけ（片方を使えばもう片方も使えない）。新しく頼むと前のものは使えない。コードは HMAC（AUTH_SECRET）、リンクの合言葉は SHA-256 で持つ。コードは 5 回まちがえたら使えない。同じアドレスは 60 秒あける・1 時間に 5 回まで | 推し当てを 1 時間に 25 回までに抑える |
| 5 | 登録のないアドレスでも「送りました」と同じ答え（メールは送らない）。店主は自分で登録せず、制作側が作る | アドレスがあるかを外から調べられないように。v1 は制作側がお店を作る |
| 6 | リンクは編集画面の `/login?t=…` に向け、編集画面が POST で入る（GET で入らない） | メールの安全確認の仕組みがリンクを先に開いても、使われてしまわないように |
| 7 | 店主がほかのお店を触ろうとしたら 403 ではなく 404 | ほかのお店があるかどうかも見せない |
| 8 | 下書きの保存は `If-Match` 必須（ないと 428）。版が違えば 409 で今の版と中身を返す。書き込みは `UPDATE … WHERE version = ?` 1 回で決める | B4。同時に来ても片方だけ通る |
| 9 | サイトの下書きは `{draft, theme}`（②と③を 1 つの版番号で） | DATA_SPEC 5.1「③は②と同じ下書きに入る」 |
| 10 | 下書きは 900KB まで | D1 の 1 行は 2MB まで。版の行に ① と ②③ の両方が入る |
| 11 | 公開は、編集画面が「描いたときの下書きの版」を送り、今の版と違えば 409 | 古い HTML と新しい下書きが混ざった版を作らない |
| 12 | 公開ページの HTML は `no-cache`＋ETag、写真は `immutable`（ID ごとに中身が変わらない） | D1「数秒のうちに新しくなる」。写真は ID を使い回さない（2.2）ので長く覚えてよい |
| 13 | 公開ページで配る写真は「公開中の版が指している、そのお店の写真」だけ。版が指す写真は、HTML・CSS の中の `ast_…` と ①②③ の中の ID を全部拾って決める | 5.2「公開されるまでは外から見えない」。ほかのお店の写真を混ぜられない |
| 14 | 写真：JPEG・PNG・WebP だけ、10MB まで、長い辺 2400px まで。中身の先頭で種類と縦横を読み、名乗った種類と違えば断る。EXIF（JPEG の APP1 Exif・PNG の eXIf・WebP の EXIF）が残っていれば断る。SVG・GIF・HEIC は受けない | C2。位置情報が残った写真を置き場に入れない。SVG はスクリプトを持てる |
| 15 | 店主が上げた写真は `origin: ownerUpload`・`rights: ownWork`（店主が確かめた）、制作側が上げた写真は `origin: producer`・`rights: unknown` から始める | 店主の写真は規約で「自分で撮った」を確かめてもらう前提。制作側は旧サイトの写真などがあるので未確認から |
| 16 | 元の写真（縮める前）はまだ持たない。上げるのは編集画面が 2400px に縮めたものだけ | 5.2 v4 の「元の写真も残す」は、表示用を公開時に作る（C3）ときに一緒に入れる |
| 17 | ゴミ箱の掃除は毎日の Cron で。30 日たち、公開した版・戻す前の下書き・今の下書きのどれも指していない写真だけ消す。行は残して `purged_at` を付ける | C4。ID を使い回さない（2.2） |
| 18 | 履歴は 30 を超えたら古い版を消す（行と R2 のファイル）。公開中の版は数に関係なく残す。戻す前の下書きは 10 | DATA_SPEC 6章 |
| 19 | 「この版を下書きにする」は、置き換える前の下書き（①②③ とも）が公開中の版と違うときだけ写しを残す | DATA_SPEC 6章 |
| 20 | 変更の記録は、下書きの前→後を深さ 3 までの「場所」ごとに比べて残す（値は 300 文字まで）。同じ人・同じ場所の続けての直し（10 分以内、公開などを挟まない）は 1 行にまとめ、最初の「前」と最後の「後」にする。1 回の保存で 20 か所を超えたら「ほか N か所」 | 自動保存は 500ms ごとなので、まとめないと行が増えすぎる |
| 21 | 毎日の描き直しの入口は、Cron `0 15 * * *`（UTC＝日本時間 0 時）。公開中の版の ① から今日「出る品」（3.4）を数え、公開した日（＝描いた日）の「出る品」と違うお店を挙げる | D6。描き直しそのもの（Browser Rendering）は M4 |
| 22 | 時刻は UTC の ISO（`…Z`）で持つ。日付の判断（3.4・Cron）だけ日本時間 | 並べやすい。DATA_SPEC の dateTime の形にも合う |
| 23 | `@cloudflare/vitest-pool-workers` は「`@cloudflare/vitest-plugin` に名前が変わった」と出るが、言われたとおりこちらを使った（0.23・vitest 4.1）。peer の解決で npm が落ちるので `.npmrc` に `legacy-peer-deps=true` | 移すときは `npx @cloudflare/codemods vitest:pool-workers-to-vitest-plugin` |

## まだできていないこと

- **Resend でのメール**（`MAILER = "resend"`）。今は `log`（wrangler dev の画面に出る）と `memory`（試験用）だけ。`resend` にすると、黙って送らずにはっきり失敗する
- IP ごとの回数の制限（ログインの申し込み・確かめ）。本番では Cloudflare の Rate Limiting のルールで足す
- 公開ページの写真を画面の大きさに合わせて配る（C3）・元の写真の保存（5.2 v4）
- 毎日の描き直しそのもの（D6・M4）。今は一覧を返してログに出すまで
- 毎日のバックアップ（B6）。D1 の Time Travel（30 日）を使う前提で、手順は本番のアカウントができてから
- 独自ドメイン（v1 は制作側が手で設定）
- 変更の記録の古いものの片づけ（今は消さない）
- staging・production の `wrangler.toml` の値（アカウント待ち）
