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
- `npm run seed -- --persist-to <フォルダ>`：local の D1・R2 をそのフォルダに置く（`wrangler dev --persist-to <同じフォルダ>` と組で使う）。編集画面の通しの試験（`apps/editor/test/e2e-api.test.mjs`）が毎回まっさらな置き場所で走るために足した（ログインの回数の制限が前の回から持ち越さないように）
- ログイン：`POST /api/auth/request` を送ると、**wrangler dev の画面に `[mail] to=… code=123456 link=…` が出る**（local の `MAILER = "log"`。本番は `resend`）
- 公開ページ：公開したあと `http://ashiyado.localhost:8787/`（Chrome・Firefox は `*.localhost` を手元に向ける。curl なら `-H "Host: ashiyado.localhost"`）
- 毎日 0 時の仕事を手で走らせる：`npx wrangler dev --test-scheduled` で動かし、`curl -X POST localhost:8787/cdn-cgi/handler/scheduled`（バックアップが local の R2 の `backups/<日付>.json.gz` にできる）

curl で一通り：

```sh
O='Origin: http://localhost:8787'; J='Content-Type: application/json'
curl -c cj -X POST localhost:8787/api/auth/request -H "$O" -H "$J" -d '{"email":"owner@ashiyado.example"}'   # 申し込んだブラウザの Cookie を cj に
curl -b cj -c cj -X POST localhost:8787/api/auth/verify -H "$O" -H "$J" -d '{"email":"owner@ashiyado.example","code":"<ログのコード>"}'
curl -b cj localhost:8787/api/shops/shp_ashiyado/drafts/site
curl -b cj -X POST localhost:8787/api/shops/shp_ashiyado/publish -H "$O" -H "$J" \
  -d '{"scope":"all","shopDraftVersion":1,"siteDraftVersion":1,"pages":{"/":"<h1>芦屋堂</h1><img src=\"/media/ast_frma\">"}}'
curl -H 'Host: ashiyado.localhost' localhost:8787/
```

## 試験

```sh
npm test            # vitest ＋ @cloudflare/vitest-pool-workers（local の D1・R2 で走る）。14 ファイル 139 件
npm run typecheck   # tsc
```

試験の名前の頭に RELEASE.md の項目の番号（`B1-3`・`D4-1` など）。DATA_SPEC 6章の変更の記録は `6章-*`、種まきは `seed-*`、セキュリティの見直しの項目は `M1`〜`M5`・`L1`〜`L11`。

| ファイル | 項目 |
|---|---|
| `test/auth.test.ts` | B1 ログイン（M2・M3・L2・L3・L8・L9）・CSRF・CORS・Vary（L11） |
| `test/mailer.test.ts` | B1 本物のメール（Resend に送る中身・文面・送れなかったとき・設定） |
| `test/ratelimit.test.ts` | B1 ログインの手前の IP ごとの回数の制限（申し込み・確かめ・IPv6・binding がないとき） |
| `test/perms.test.ts` | B2 権限（店主に制作側のアドレスを見せない L7） |
| `test/drafts.test.ts` | B3・B4 下書き、編集の設定、変更の記録 |
| `test/publish.test.ts` | D1 公開、D3 配信、D4 履歴と戻す、CSP と HTML の検査（M4）、L1・M1・L10 |
| `test/htmlcheck.test.ts` | HTML の検査の細かいところ（M4） |
| `test/assets.test.ts` | C2 写真の検査（M5）、C4 ゴミ箱、写真の量の上限（L10） |
| `test/variants.test.ts` | C3 写真の大きさ違い（受け取り・検査・配信・前の写真・量・掃除） |
| `test/visibility.test.ts` | D6 品を出す決まり（3.4）が packages/core と同じ（共通の例 `packages/core/test/visibility-cases.json`） |
| `test/cron.test.ts` | D6 毎日の描き直しの入口、1 軒の失敗で止まらない（M1）、期限切れの片づけ（L4） |
| `test/backup.test.ts` | B6 毎日のバックアップ（置き場所・中身・戻すと同じ・30 日・失敗してもほかは続く） |
| `test/config.test.ts` | 危ない設定では動かない（L5・L6） |
| `test/seed.test.ts` | 芦屋堂の種まき |

## API の一覧

すべて JSON（写真を上げるときだけ本文が写真）。`/api/*` は API のホスト（例 `app.<アプリのドメイン>`）だけで答え、お店のサブドメインでは答えない。

**権限**：— ＝だれでも／ログイン＝ログインしていれば／店＝そのお店の店主か制作側（ほかのお店は 404 に見せる）／制作＝制作側だけ

| 道 | 中身 | 権限 |
|---|---|---|
| `GET /api/health` | 生きているか | — |
| `POST /api/auth/request` `{email}` | 6 桁のコードとリンクをメールで送る（有効 15 分、1 回だけ）。**申し込んだブラウザの Cookie（`__Host-mikke_lgn`）を付ける**。登録のないアドレスでも同じ答え。同じアドレスは 60 秒あける・1 時間に 5 回まで（429・`Retry-After`）。本番では同じ IP から 1 分に 10 回まで（429 `too_many_ip`）。答え `{ok, expiresInMinutes, retryAfter}` | — |
| `POST /api/auth/verify` `{email, code}` か `{token}` | コードかリンクの合言葉で入る。Cookie を付けて `{user}`。**コードは申し込んだブラウザ（`__Host-mikke_lgn` を持つ）でだけ使える**。1 つのコードで 5 回まで。アカウントごとに 24 時間で 20 回まちがえたら、コードでは 24 時間入れない（429 `locked`。リンクでは入れる）。リンクの合言葉はどの端末でも使える | — |
| `POST /api/auth/logout` | このセッションを消す | — |
| `POST /api/auth/logout-all` | このユーザーの全部の端末のセッションを消す。答え `{ok, sessions}` | ログイン |
| `GET /api/me` | `{user:{id,email,name,role}, shops:[{id,slug,name,publishedVersion}]}` | ログイン |
| `GET /api/shops/:shopId` | お店 `{id,slug,name,template,publishedVersion,publicUrl}` | 店 |
| `GET /api/shops/:shopId/drafts/:kind` | 下書き（`kind` は `shop`＝① ／ `site`＝②③）。`{kind, version, data, updatedAt, updatedBy}`、`ETag: "版"` | 店 |
| `PUT /api/shops/:shopId/drafts/:kind` | 下書きを保存。**`If-Match: "読んだ版"` が要る**（ないと 428）。本文は下書きそのもの。答え `{kind, version, updatedAt}`。版が古いと **409 `{error:"conflict", current:{version, data, …}}`** | 店 |
| `GET /api/shops/:shopId/settings` | 編集の設定 `{recentColors:[#rrggbb…]}` | 店 |
| `PUT /api/shops/:shopId/settings` | 同じ形で保存（5 つまで・版なし・後勝ち） | 店 |
| `GET /api/shops/:shopId/status` | 状態の文字 `{state:"unpublished"\|"same"\|"changed", label, shopSame, siteSame, drafts:{shop:{version}, site:{version}}, published}` | 店 |
| `GET /api/shops/:shopId/changes?limit=&before=` | 変更の記録（新しい方から）。`actor` は、制作側には `{id, kind, name, email}`、店主には `{kind, name}`（制作側の人は名前が「制作側」、自分の分は `self: true`。メールアドレス・ID は見せない） | 店 |
| `POST /api/shops/:shopId/publish` | 公開（下の「公開の本文」） | 店 |
| `GET /api/shops/:shopId/versions` | 履歴（新しい方から 30）`[{number, scope, pages, publishedAt, publishedBy, isPublished}]` | 店 |
| `GET /api/shops/:shopId/versions/:n` | 版の中身 `{number, scope, …, shop, site}` | 店 |
| `POST /api/shops/:shopId/versions/:n/restore` `{siteDraftVersion, includeShop?, shopDraftVersion?}` | 「この版を下書きにする」。②③ はまるごと、① は `includeShop` のときだけ。公開中の版は変わらない。答え `{restoredFrom, backupId, drafts:{site:{version}, shop?:{version}}}`。版が古いと 409 | 店 |
| `GET /api/shops/:shopId/backups` | 戻す前の下書き（新しい方から 10） | 店 |
| `GET /api/shops/:shopId/backups/:id` | その中身 `{shop, site}` | 店 |
| `POST /api/shops/:shopId/backups/:id/restore` `{siteDraftVersion, shopDraftVersion}` | 戻す前の下書きを下書きに戻す（①②③） | 店 |
| `POST /api/shops/:shopId/assets` | 写真を上げる。本文は写真そのもの、`Content-Type: image/jpeg\|png\|webp`、名前は `X-File-Name`（URL エンコード）。**大きさ違いも一緒に送るときは `multipart/form-data`**（下の「写真の大きさ違い」）。答え 201 で ④ の 1 件 `{id, kind, file:{key,mime,width,height,bytes,exifStripped}, uploadedAt, uploadedBy, origin, rights}`（大きさ違いは ④ に入れない） | 店 |
| `GET /api/shops/:shopId/assets?trash=1` | ④ の一覧（`assets.json` と同じ `{schemaVersion, assets:{id: …}}`。`trash=1` でゴミ箱の中も） | 店 |
| `GET /api/shops/:shopId/assets/:id` | 1 件 | 店 |
| `GET /api/shops/:shopId/assets/:id/file` | 写真そのもの（編集画面用） | 店 |
| `GET /api/shops/:shopId/assets/:id/variants` | 大きさ違いの一覧 `{id, widths:[640,1280,…], variants:[{width,height,format,mime,bytes,key}]}`（前に上げた写真は `variants: []`） | 店 |
| `POST /api/shops/:shopId/assets/:id/variants` | 前に上げた 1 枚だけの写真に、大きさ違いを足す（`multipart/form-data`、`file` なしで大きさ違いだけ）。**1 回だけ**（もうあれば 409）。答え 201 で上と同じ形 | 店 |
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
- **スクリプト**：HTML の中に、インラインの `<script>`（`type="application/ld+json"` の構造化データだけは通す）・`/_mikke/` 以外の `<script src>`・`on〜` の属性・`javascript:` などの URL・`srcdoc`・`<meta http-equiv="refresh">` があれば 400（`{error:"unsafe_html", page, problems:[{kind, detail}]}`）。コメント・style・属性の値の中の「タグの形の文字」も読むので、そこにも書かない。テンプレートに要るスクリプトは、**サーバーが配る決まったファイル `/_mikke/site.js`**（`src/site-assets.ts`。店主は変えられない）を `<script src="/_mikke/site.js" defer></script>` で読む
- 同じお店の公開は **1 分に 1 回まで**（429・`Retry-After`）
- 答え `{number, scope, publishedAt, pages, assets, url}`

### 公開ページ（`<スラッグ>.<PUBLIC_DOMAIN>`）

| 道 | 返すもの |
|---|---|
| `/`・`/menu`（`/menu/` も） | 公開中の版のページ。`Cache-Control: no-cache`＋`ETag`（公開したらすぐ変わる。304 も返す） |
| `/style.css`・`/sitemap.xml`・`/robots.txt` | 公開のときに送ったもの |
| `/media/ast_…` | 公開中の版が指している、このお店の写真だけ（ゴミ箱に入れていても、版が指していれば出す）。`immutable` |
| `/media/ast_…/<幅>.webp`・`/media/ast_…/<幅>.jpg` | その写真の大きさ違い（C3。配ってよい写真の決まりは上と同じ）。幅は下の「写真の大きさ違い」の決まった幅だけ（ほかは 404）。WebP がない写真は同じ幅の JPEG を、大きさ違いのない前の写真は元の 1 枚を返す（このときだけ 1 日） |
| `/_mikke/site.js` | 決まったスクリプト（お店によらず同じ） |
| ほか | 404。お店の `/404` があればそれ、なければ決まった 404 ページ。まだ公開していないお店・知らないスラッグも 404 |

公開ページの答えには、いつも次の CSP が付く（M4）。Google Fonts・Google マップの埋め込み以外の外のものは読めない。

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;
img-src 'self' data:; frame-src https://www.google.com; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'
```

### 写真の大きさ違い（C3）

Workers の中では画像を縮められない（有料の Cloudflare Images は使わない）ので、**編集画面が写真を上げるときに、ブラウザで大きさ違いを作って一緒に送る**。

- **幅**：640・1280・2400 のうち写真の幅 W より小さいもの＋W（W は 2400 以下）。例 W=2400 → 640・1280・2400／W=2000 → 640・1280・2000／W=1000 → 640・1000／W=500 → 500。高さは元の比のまま `round(H × 幅 / W)`（±1 まで許す）
- **形式**：JPEG（`<幅>.jpg`）は全部の幅が要る。WebP（`<幅>.webp`）は全部の幅か、まったくなし（`canvas.toBlob(…, "image/webp")` が WebP を返さないブラウザでは送らない。`blob.type` を見て決める）
- **送り方**：`POST /api/shops/:shopId/assets` に `multipart/form-data`。`file` が写真（今までの 2400px の 1 枚。JPEG・PNG・WebP）、ほかの部分の名前が `640.webp`・`640.jpg`・`1280.webp`… 名前は `X-File-Name` か `file` のファイル名
  ```js
  const fd = new FormData();
  fd.append("file", blob2400, "店の外観.jpg");
  for (const w of widths) { fd.append(`${w}.jpg`, jpg[w]); if (webp) fd.append(`${w}.webp`, webp[w]); }
  await fetch(`/api/shops/${shopId}/assets`, { method: "POST", body: fd, credentials: "include" }); // Content-Type は付けない（ブラウザが boundary を付ける）
  ```
- **検査**：大きさ違いもそれぞれ写真と同じ検査（M5：種類・撮影データ・終わりの後ろのデータ）。加えて名前・幅・高さ・そろい方。どれか 1 つでも通らなければ、写真も含めて何も置かない（`{error, message, variant:"640.jpg"}`。主な種類 `invalid_variant`・`incomplete_variants`・`variant_size_mismatch`・`metadata_present`・`trailing_data`(400)、`type_mismatch`・`not_an_image`(415)）。1 枚 10MB、本文全体 48MB まで。大きさ違いも写真の量（L10）に数える
- **公開用の HTML**：写真は `srcset` で大きさ違いを指す（幅の並びは ④ の `file.width` から上の決まりで作れるので、API に聞かなくてよい）。`<picture>` で WebP を先に、`<img>` に JPEG を。`width`・`height` は ④ の値（並びが崩れないように）、`sizes` は写真の枠の表示幅
  ```html
  <picture>
    <source type="image/webp" sizes="(min-width: 768px) 50vw, 100vw"
      srcset="/media/ast_frma/640.webp 640w, /media/ast_frma/1280.webp 1280w, /media/ast_frma/2400.webp 2400w">
    <img src="/media/ast_frma/1280.jpg" sizes="(min-width: 768px) 50vw, 100vw"
      srcset="/media/ast_frma/640.jpg 640w, /media/ast_frma/1280.jpg 1280w, /media/ast_frma/2400.jpg 2400w"
      width="2400" height="1600" alt="店の外観" loading="lazy" decoding="async">
  </picture>
  ```
  ファーストビューの写真は `loading="lazy"` を付けず `fetchpriority="high"`（D7）。CSS の背景の写真は `image-set()` か、いちばん合う幅 1 つ
- **前に上げた 1 枚だけの写真**：`/media/<ID>` は今までどおり。大きさ違いの道で頼まれても元の 1 枚を返すので、HTML は写真によらず同じ形で書いてよい。あとから `POST …/assets/:id/variants` で足せる（1 回だけ）

### エラーの形

`{error: "種類", message: "日本語の説明", …}`。主な種類：`unauthenticated`(401)・`forbidden`/`bad_origin`(403)・`not_found`(404)・`conflict`(409)・`precondition_required`(428)・`too_soon`/`too_many`/`too_many_ip`/`locked`(429)・`too_large`/`quota_exceeded`(413)・`unsupported_media_type`/`not_an_image`/`type_mismatch`(415)・`too_deep`/`unsafe_html`/`metadata_present`/`trailing_data`/`invalid_*`(400)

### 編集画面からの呼び方（守ること）

- `fetch(…, {credentials: "include"})`。書き込みは `Content-Type: application/json`（写真は写真の種類）
- 下書きの保存は、読んだ `version` を `If-Match: "<version>"` に付ける。409 なら `current` を見せて選んでもらう（知らせなしに上書きしない）
- ログインのリンクは `<APP_ORIGINS の先頭>/login#t=<合言葉>`（`#` の後ろなので、サーバーの記録や Referer に残らない）。編集画面のその道で `location.hash` から取り、`POST /api/auth/verify {token}` を呼ぶ。読んだら `history.replaceState` で `#t=` を消す（メールのリンクを開いただけでは入らない。メールの中身を先読みする仕組みにリンクを使われないため）
- コードで入るときは、`request` と `verify` を**同じブラウザ**から `credentials: "include"` で呼ぶ（申し込みの Cookie で突き合わせる）
- JSON は入れ子 64 段まで（超えると 400 `too_deep`）

## 本番に出すとき（ユーザーが用意するもの）

| もの | 中身 |
|---|---|
| Cloudflare の API トークン | アカウント：**Workers Scripts 編集・D1 編集・Workers R2 Storage 編集**・Account Settings 読む。ゾーン（公開のドメインとアプリのドメイン）：**Workers Routes 編集・DNS 編集**・Zone 読む |
| D1 | `mikke-staging`・`mikke-production`（`wrangler d1 create` で作り、出た ID を `wrangler.toml` の `[env.*]` に） |
| R2 | `mikke-media-staging`・`mikke-media-production` |
| 公開のドメイン | 例 `mikke.site`。DNS に `*`（ワイルドカード、プロキシ有効）と Workers のルート `*.<ドメイン>/*`。**`*.staging.<ドメイン>` のような 2 段のワイルドカードは無料の証明書（Universal SSL）では足りない**（Advanced Certificate Manager が要る）。試しは別のドメインにするか、`<スラッグ>-staging.<ドメイン>` にするかを決める |
| アプリのドメイン | 編集画面と API。**公開のドメインとは別の親ドメインが必須**（例 公開 `mikke.site`／アプリ `app.mikke-web.jp`）。同じ親ドメインだと、起動したときに設定の問題として止まる（L5。公開ページはお店ごとに中身を作れるので、アプリと同じサイトに置かない）。`https` も必須 |
| Resend | API キー（`wrangler secret put RESEND_API_KEY --env production`。権限は「Sending access」だけ・送り元のドメインに絞る）、送り元のドメインの確認（Resend の画面に出る SPF・DKIM の DNS を足す）、送り元のアドレス（`vars` の `MAIL_FROM`、例 `芦屋みっけ <login@mail.<アプリのドメイン>>`）、`MAILER = "resend"`。どちらかがなければ起動したときに止まる。**本番（`COOKIE_SECURE = "true"`）で `MAILER = "log"` も止まる**（L6） |
| 秘密の値 | `wrangler secret put AUTH_SECRET`（`openssl rand -hex 32` など 32 文字以上） |
| IP ごとの回数の制限 | `wrangler.toml` の環境ごとに `[[env.<名前>.ratelimits]]`（`name = "LOGIN_IP_LIMITER"`・`namespace_id` は環境ごとに別の数字・`simple = { limit = 10, period = 60 }`。`period` は 10 か 60 だけ）。上の段からは引き継がれないので、環境ごとに必ず書く。数えるのは 1 つの Cloudflare の拠点の中で（拠点をまたいだ合計ではない）、おおよその数 |

`wrangler.toml` の `[env.staging]` にひな形を書いてある。`PUBLIC_PORT` は local だけ（本番では書かない）、`COOKIE_SECURE = "true"`。

### 毎日のバックアップと戻し方（B6）

毎日 0 時（日本時間）の Cron で、D1 の全部の表（`d1_migrations` と内部の表は除く）を JSON にして gzip で R2 の **`backups/<日本時間の日付>.json.gz`** に置く。中身は `{format:"mikke-d1-backup", version:1, date, createdAt, migrations:[…], tables:{表: {columns, pk, rowidAlias, rows:[[rowid, 列…], …]}}}`。**30 日より古いものは消す**（今日の分を置けてから。名前が `backups/<日付>.json.gz` の形のものだけ）。写真・公開ページ（R2 の `assets/`・`sites/`）は入れない（R2 にそのまま残っている）。

戻すとき（例：2026-10-25 の 0 時の状態に戻す）：

1. 戻す先の D1 に、バックアップと同じマイグレーションまで当ててあることを確かめる（`npx wrangler d1 migrations list <DB> --remote --env production`。バックアップの `migrations` と、スクリプトが最初に出す「マイグレーション：… まで」）
2. 中身を見る（まだ戻さない）：
   ```sh
   cd apps/api
   node scripts/restore-backup.mjs --env production --remote --db mikke-production --bucket mikke-media-production --date 2026-10-25
   ```
   表ごとの行の数と、作った SQL（`.wrangler/restore/<日付>.sql`）が出る。local なら `--env`・`--remote`・`--db`・`--bucket` なしで `--date` だけ。手元のファイルなら `--file <…json.gz>`
3. 戻す：同じものに `--apply` を付ける。バックアップにある表の中身は全部消して入れ直す（rowid も同じに戻る）
4. 確かめる：編集画面で開き、下書き・公開中の版が戻っていること。セッションもその時刻に戻るので、ログインし直しが要ることがある

気をつけること：戻すと、その時刻より後に上げた写真の行はなくなる（R2 のファイルは残るが使われない）。その日の 0 時より後にゴミ箱の掃除で消えた写真は、行は戻るがファイルはない。D1 の 1 文は 100KB までなので、長い値は空で入れてから 16,000 文字ずつ足す SQL にしてある（`scripts/backup-lib.mjs`）。本番では、これに加えて D1 の Time Travel（その時刻の状態に戻せる）も使える。

### ログインのメール（B1・`src/services/mailer.ts`）

`MAILER = "resend"` で、Resend の API（`POST https://api.resend.com/emails`）に `{from: MAIL_FROM, to:[宛先], subject, text}` を送る（文だけ。HTML にしない）。件名は「芦屋みっけ ログインのコード」（コードは件名に入れない。通知・ロック画面に出るので）。本文はコード・リンク・15 分で切れること・心当たりが無ければ無視してよいこと。送れなかったとき：429・5xx・つながらないは同じ `Idempotency-Key` で 1 回だけやり直し、だめならログに `[mail] 送れませんでした`（コード・キーは出さない）。答えは送れても送れなくても同じ（#4d）。

### 起動したときの設定の確かめ（`src/services/config.ts`）

その isolate の最初の要求（と毎日の Cron）で確かめ、問題があれば**どの要求にも 500** で答える（ログに理由）。止まる条件：公開のドメインとアプリのドメインが同じ親ドメイン（local の `localhost` どうしは除く）／本番で `APP_ORIGINS` が https でない／本番で `MAILER=log`／まだない `MAILER`／`MAILER=resend` で `RESEND_API_KEY` か `MAIL_FROM` がない／`AUTH_SECRET` が 32 文字未満。

### 量の上限（L10）

| もの | 上限 |
|---|---|
| 写真 | お店ごとに合計 1GB・2,000 枚（ゴミ箱の中も数える。大きさ違いの分も合計に数える）。1 枚 10MB・長い辺 2400px。写真と大きさ違いをまとめて送る本文は 48MB |
| 公開 | 同じお店で 1 分に 1 回。ページ 50 枚・1 枚 2MB・CSS 1MB・本文全体 24MB。版は 30 まで残す（1 軒で最大およそ 700MB） |
| 下書き | ① と ②③ それぞれ 900KB、JSON の入れ子 64 段 |
| ログイン | 同じアドレスで 60 秒に 1 回・1 時間に 5 回。1 つのコードで 5 回、アカウントごとに 1 日 20 回まちがえたら 24 時間コードは止める。本番では加えて、同じ IP（IPv6 は /64）から申し込み・確かめそれぞれ 1 分に 10 回（429 `too_many_ip`） |
| セッション | 使わない日が 30 日続いたら切れる。ログインしてから店主 90 日・制作側 14 日で必ず切れる |

## 決めたこと

| # | 決めたこと | 理由 |
|---|---|---|
| 1 | API と公開ページを 1 つの Worker にし、ホスト名で振り分ける。`<スラッグ>.<PUBLIC_DOMAIN>` は公開ページ、それ以外は API。予約語（`app`・`api`・`www` など）のサブドメインは API 側。アプリ（編集画面と API）は公開のドメインと別の親ドメインに置く（L5） | 1 つで済む |
| 2 | セッションは Cookie `__Host-mikke_sid`（HttpOnly・Secure・SameSite=Lax・Path=/・Domain なし）、30 日、使っている間は延ばす。ただしログインしてから店主 90 日・制作側 14 日が上限（L9）。サーバーは値のハッシュだけを持つ。同じブラウザでログインし直したら前のセッションは消し、ほかの端末のセッションは残す（B3：別の端末で開ける）。全部消す道は `logout-all` | `__Host-` で、お店のサブドメインのページから Cookie を書き換えられない（Cookie の押し付けを防ぐ） |
| 3 | CSRF：書き込みは Origin が `APP_ORIGINS` のどれかのときだけ（ないものも断る）。JSON の道は `Content-Type: application/json` だけ受ける。CORS も同じオリジンだけ（Cookie つき） | 公開ページは同じサイトでもオリジンが違うので、お店のページに書いたスクリプトからは API を叩けない |
| 4 | ログイン：6 桁のコードとリンクを 1 通で。15 分・1 回だけ（片方を使えばもう片方も使えない）。コードは HMAC（AUTH_SECRET）、リンクの合言葉は SHA-256 で持つ。同じアドレスは 60 秒あける・1 時間に 5 回まで。**回数の制限と書き込みは `INSERT … SELECT … WHERE` の 1 文**（M2：同時に来ても 1 本だけ）。1 つのコードで試せるのは 5 回で、**`UPDATE … WHERE attempts < 5 RETURNING` で先に枠を取る**（L2：同時に来ても超えない） | 推し当てを抑える |
| 4b | **コードは申し込んだブラウザに結びつける**（M3）。申し込むと `__Host-mikke_lgn`（32 バイトの乱数、15 分）を付け、ハッシュを申し込みに持つ。確かめるときに突き合わせ、持っていないブラウザのコードは試すことすらできない（失敗にも数えない）。同じブラウザで頼み直すと、そのブラウザの前の申し込みだけを無効にする（ほかのブラウザの申し込みは残す）。**リンクは結びつけない**（256 ビットで推し当てられない。PC で申し込んでスマホでメールを開いても入れるように） | 推し当てる人は自分で申し込むしかなく、申し込みの回数で絞られる。本人の申し込みは、ほかのブラウザの申し込み・失敗で使えなくならない |
| 4c | アカウントごとに 24 時間で 20 回まちがえたら、コードでのログインを止める（429 `locked`）。止めている間もリンクでは入れる（M3） | 1 日の推し当てを 20 回に抑える。止められても本人はリンクで入れる（妨害を和らげる） |
| 4d | メールを送るのは答えを返した後（`waitUntil`）。送れなくても答えは同じ（L3） | 登録のあるなしで答えの時間が変わらないように |
| 5 | 登録のないアドレスでも「送りました」と同じ答え（メールは送らない）。店主は自分で登録せず、制作側が作る | アドレスがあるかを外から調べられないように。v1 は制作側がお店を作る |
| 6 | リンクは編集画面の `/login#t=…` に向け（L8）、編集画面が POST で入る（GET で入らない） | メールの安全確認の仕組みがリンクを先に開いても、使われてしまわないように |
| 7 | 店主がほかのお店を触ろうとしたら 403 ではなく 404 | ほかのお店があるかどうかも見せない |
| 8 | 下書きの保存は `If-Match` 必須（ないと 428）。版が違えば 409 で今の版と中身を返す。書き込みは `UPDATE … WHERE version = ?` 1 回で決める | B4。同時に来ても片方だけ通る |
| 9 | サイトの下書きは `{draft, theme}`（②と③を 1 つの版番号で） | DATA_SPEC 5.1「③は②と同じ下書きに入る」 |
| 10 | 下書きは 900KB まで | D1 の 1 行は 2MB まで。版の行に ① と ②③ の両方が入る |
| 11 | 公開は、編集画面が「描いたときの下書きの版」を送り、今の版と違えば 409 | 古い HTML と新しい下書きが混ざった版を作らない |
| 12 | 公開ページの HTML は `no-cache`＋ETag、写真は `immutable`（ID ごとに中身が変わらない） | D1「数秒のうちに新しくなる」。写真は ID を使い回さない（2.2）ので長く覚えてよい |
| 13 | 公開ページで配る写真は「公開中の版が指している、そのお店の写真」だけ。版が指す写真は、HTML・CSS の中の `ast_…` と ①②③ の中の ID を全部拾って決める | 5.2「公開されるまでは外から見えない」。ほかのお店の写真を混ぜられない |
| 14 | 写真：JPEG・PNG・WebP だけ、10MB まで、長い辺 2400px まで。中身の先頭で種類と縦横を読み、名乗った種類と違えば断る。撮影データが残っていれば断る（M5：JPEG の APP1 すべて（Exif・XMP ほか）と APP13（IPTC）、PNG の eXIf と名前に exif・xmp・iptc を含む tEXt・zTXt・iTXt、WebP の EXIF・XMP の塊と印。ICC は通す）。画像の終わり（JPEG の EOI・PNG の IEND・WebP の RIFF の大きさ）の後ろにデータがあれば断る。SVG・GIF・HEIC は受けない | C2。位置情報が残った写真を置き場に入れない。ほかのファイルを写真に隠させない。SVG はスクリプトを持てる |
| 15 | 店主が上げた写真は `origin: ownerUpload`・`rights: ownWork`（店主が確かめた）、制作側が上げた写真は `origin: producer`・`rights: unknown` から始める | 店主の写真は規約で「自分で撮った」を確かめてもらう前提。制作側は旧サイトの写真などがあるので未確認から |
| 16 | 元の写真（縮める前）はまだ持たない。上げるのは編集画面が 2400px に縮めたものだけ | 5.2 v4 の「元の写真も残す」は、表示用を公開時に作る（C3）ときに一緒に入れる |
| 17 | ゴミ箱の掃除は毎日の Cron で。30 日たち、公開した版・戻す前の下書き・今の下書きのどれも指していない写真だけ消す。行は残して `purged_at` を付ける | C4。ID を使い回さない（2.2） |
| 18 | 履歴は 30 を超えたら古い版を消す（行と R2 のファイル）。公開中の版は数に関係なく残す。戻す前の下書きは 10 | DATA_SPEC 6章 |
| 19 | 「この版を下書きにする」は、置き換える前の下書き（①②③ とも）が公開中の版と違うときだけ写しを残す | DATA_SPEC 6章 |
| 20 | 変更の記録は、下書きの前→後を深さ 3 までの「場所」ごとに比べて残す（値は 300 文字まで）。同じ人・同じ場所の続けての直し（10 分以内、公開などを挟まない）は 1 行にまとめ、最初の「前」と最後の「後」にする。1 回の保存で 20 か所を超えたら「ほか N か所」 | 自動保存は 500ms ごとなので、まとめないと行が増えすぎる |
| 21 | 毎日の描き直しの入口は、Cron `0 15 * * *`（UTC＝日本時間 0 時）。公開中の版の ① から今日「出る品」（3.4）を数え、公開した日（＝描いた日）の「出る品」と違うお店を挙げる | D6。描き直しそのもの（Browser Rendering）は M4 |
| 22 | 時刻は UTC の ISO（`…Z`）で持つ。日付の判断（3.4・Cron）だけ日本時間 | 並べやすい。DATA_SPEC の dateTime の形にも合う |
| 24 | 公開ページには CSP（`script-src 'self'` ほか）を付け、公開の入口でも HTML を検査してスクリプトを断る（M4）。検査は「<」＋英字をどこでもタグとして読む厳しい読み方（ブラウザとの読み方のずれですり抜けられないよう）。読む手間には上限があり、閉じていない・長すぎるタグ（64KB 超）は断る | 公開ページで店主（や乗っ取った人）がスクリプトを動かせないように。二重の守り |
| 25 | 入れ子の深い JSON は入口（`readJson`）で 64 段までに。記録の要約は保存の前に作る。毎日の仕事は 1 件・1 軒ずつ try/catch し、失敗したものは `failed` に挙げてほかを続ける（失敗した写真は消さない）（M1） | 1 軒のおかしなデータで、ほかのお店の仕事が止まらないように |
| 26 | 名前で引く所は `Object.hasOwn`（L1） | `constructor` などの名前で、入れ物の元の性質を引かないように |
| 27 | API の答えにはいつも `Vary: Origin`（L11） | 途中の仕組みが、オリジンごとに違う答えを取り違えないように |
| 28 | 期限の切れた申し込み（1 日後）・セッション・2 日より前の失敗の記録は、毎日の Cron で消す（L4） | 表が増え続けないように |
| 29 | `MAILER=memory` は試験用。本番の設定の確かめでは止めない（`log` だけ止める） | 試験は本番と同じ `COOKIE_SECURE=true` で走らせたいため。本番で `memory` にしないこと |
| 30 | 公開ページの写真の大きさ違い（C3）は、編集画面がブラウザで作って写真と一緒に送る（`multipart/form-data`）。幅は 640・1280・2400 のうち W より小さいもの＋W、形式は JPEG（必須）と WebP（全部かなし）。それぞれ M5 の検査と、名前・幅・高さ・そろい方を見て、1 つでも通らなければ何も置かない。台帳（④）には持たず、表 `asset_variants` と R2 の `assets/<お店>/<ID>/<幅>.<形式>` に置く。置いたら変えない（前の写真に足すのも 1 回だけ）ので `immutable`。ゴミ箱の掃除で写真と一緒に消す。#16 は今のまま（元の写真はまだ持たない） | Workers では画像を縮められず、有料の Images は使わない。DATA_SPEC 5.2「表示用の縮小版は台帳に持たない」 |
| 31 | `/media/<ID>/<幅>.<形式>` で、頼まれた形式がなければ同じ幅の JPEG、大きさ違いがなければ元の 1 枚を返す（このときだけ 1 日で覚え直す） | HTML を写真によらず同じ形（srcset）で書ける。前の写真も切れない |
| 32 | 毎日のバックアップ（B6）は、自分で D1 の全部の表を JSON にして R2 の `backups/<日本時間の日付>.json.gz` に置き、30 日分を残す。毎日の仕事のいちばん先に走らせる（その日の掃除の前の状態を残す）。戻すのは `scripts/restore-backup.mjs`（見るだけが既定、`--apply` で戻す）。rowid も戻し、長い値は 16,000 文字ずつに分けた SQL にする | D1 の Time Travel だけだとアカウントの外に持ち出せず、中身を見て確かめられない。戻す手順を local の試験で確かめられる。D1 の 1 文は 100KB まで |
| 33 | 本物のメールは Resend（fetch で API を直に叩く。ライブラリは入れない）。文だけ・件名にコードを入れない。429・5xx・つながらないは同じ Idempotency-Key で 1 回だけやり直す。`MAILER=resend` は `RESEND_API_KEY`・`MAIL_FROM` がなければ起動しない（L6 と同じ考え） | 依存を増やさない。通知に出る件名にコードを出さない。やり直しで 2 通届かない |
| 34 | ログインの申し込み・確かめの手前で、IP ごとの回数を Workers の Rate Limiting（`[[ratelimits]]` の binding `LOGIN_IP_LIMITER`）で数える。キーは `request:<IP>`・`verify:<IP>`、IPv6 は /64 にまとめる。binding がない（local・試験）・`CF-Connecting-IP` がない・数える仕組みが失敗したときは止めない。止めたときは D1 に何も書かず、メールも送らない | アドレスを変えながらの推し当て・申し込みのばらまきを 1 か所から絞る。数える仕組みの故障でログインが止まらないように（アドレスごとの制限は D1 で効いている） |
| 35 | 品を出す決まり（3.4）は `packages/core/visibility.js` の 1 つを `src/lib/visibility.ts` から読んで使う（wrangler がまとめる）。日付は日本時間、販売の期間はその日を含む、`status` は `onSale` だけ | 編集画面（ブラウザの時刻の月・販売の期間を見ない）と API で食い違っていた（M3）。写しにすると、またずれる |
| 23 | `@cloudflare/vitest-pool-workers` は「`@cloudflare/vitest-plugin` に名前が変わった」と出るが、言われたとおりこちらを使った（0.23・vitest 4.1）。peer の解決で npm が落ちるので `.npmrc` に `legacy-peer-deps=true` | 移すときは `npx @cloudflare/codemods vitest:pool-workers-to-vitest-plugin` |

## まだできていないこと

- Resend で本当に届くか（迷惑メールに入らないか・Gmail・携帯のアドレス）は、アカウントとドメインができてから人が確かめる（試験は fetch を差し替えて、送る中身まで）
- 申し込みの回数の制限（同じアドレスで 1 時間に 5 回）は、ほかの人が先に使い切ると本人も 1 時間申し込めない（妨害の余地）。IP ごとの制限（#34）で 1 か所からの妨害は絞れたが、多くの IP からの妨害は残る。困ったら、アドレスごとの数を「ブラウザ（`__Host-mikke_lgn`）ごと」に分けるか、制作側が店主にリンクを出す道を足す
- `/_mikke/site.js` の中身（テンプレートの担当が決める。今は空）
- 元の写真の保存（5.2 v4）。大きさ違いは 2400px の写真から作る（C3 は済）
- 毎日の描き直しそのもの（D6・M4）。今は一覧を返してログに出すまで
- B6 の「人が 1 回戻してみる」は、本番のアカウントができてから（試しの環境で、上の手順どおりに）。バックアップは 1 回で全部をメモリに読むので、お店が増えて大きくなったら（数十 MB を超えたら）表ごとに分けるか R2 の分割アップロードにする
- 独自ドメイン（v1 は制作側が手で設定）
- 変更の記録の古いものの片づけ（今は消さない）
- staging・production の `wrangler.toml` の値（アカウント待ち）
