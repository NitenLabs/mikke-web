# apps/owner 設計書（指示 0054 段1）

要件は `apps/api/EDITOR_REQUIREMENTS.md`。api は 7 章の追加だけ。

## 1. 作り
- 素の JS（ES モジュール）＋CSS、枠組みなし。`build.mjs` で esbuild（root にある）→ `dist/`（ignore 済み）。依存は足さない
- 純粋な部品 `src/lib/`（limits・patch・hours・crop・api）。試験 `node --test apps/owner/test/`（root に `test:owner`。TS でないので tsc 不要）
- 読むだけで借りる：`tools/lib/format.mjs`（表示の文。純粋）・`packages/core/publish/photo.js`。`apps/editor/src/lib/photo-upload.js` は写す（import しない）

## 2. 手元での出し方
- `apps/owner/dev/serve.mjs`（:5174）：`dist/` を返し、`/api/*` を wrangler dev（:8787）へ中継（Host は localhost:8787 に替える）。ブラウザから見て同じオリジン＝Cookie・CORS の心配なし
- wrangler dev は `--var APP_ORIGINS:http://localhost:5174 --var EDIT_RUNNER_SECRET:<32字>`。先頭が 5174 なので、メールのリンクは `http://localhost:5174/login#t=…`
- `/preview/<slug>/`＝下地（`rebuild-shop <slug> --no-check` の書き出し。data-edit 付き）。差し替えた写真は `/api/shops/:id/assets/:id/file`
- `/__dev/rebuild`（手元だけ）：公開の後に画面が呼ぶ（6章）

## 3. 直す項目の対応
| 項目 | data-edit | ①/② の場所 | 上限（edit-limits） |
|---|---|---|---|
| 営業時間・定休日 | `shop:/hours`（ac_v1・フッター） | ① `/hours/weekly/<曜>` {status, periods} | `shop:/hours` maxRenderedChars 80・maxExceptionDays 3（error） |
| 紹介文 | `shop:/story/answers/q_body/answer` | ① 同じ | maxChars 300・maxParagraphs 3・PC 9 行（warn） |
| 紹介の見出し | `shop:/story/answers/q_catch/answer` | ① 同じ | 24 字・2 行・1 行 12 字（warn） |
| 表紙の言葉 | `text:fv_copy` | ② `elements.fv_copy.paragraphs` ＋ `genConfig.fvCopy` | 無し→「今の段落数まで・各段落 最長＋2 字」（error） |
| 品の名前・説明 | `item:<id>/name`・`/description` | ① `/catalog/items/<id>/…` | 10/15 字・40/80 字（warn、hardMax は error） |
| 値段 | `item:<id>/prices` | ① `…/prices`（fixed・from・range・ask など） | maxOptions 3・名前 6 字 |
| 品を足す・消す・並べ替え | `list:catalog:mnu_food` | ① `items`＋`placements`（order） | min 1・max 24 |
| 写真 | `photo:<素材>` | ② `elements.<el>.asset`・`crop`／品は ① `items.<id>.photos[0]` | 枠の比は ② の layout から計算、minWidth は `photos[元の素材]`（warn） |

- 判定は `limits.js` だけ。入力のたびに残りの字数・理由。error があれば保存できない
- 品を消すときは `review` の行も消す。直した品・物語の `draft:true` は外す
- 印の無い所は出さない・送らない（保存の前に確かめる）

## 4. その場の見え方（PC の右）
- iframe（同じオリジン）に下地を出し、親が DOM を直接直す（`patch.js`）：`[data-edit~="key"]` の要素の文を ①/② から作り直す（連動は site の `bind.format` を `applyFormat` で）。品は最後のカードを写して足す／消す／並べ替え。写真は `src` と `object-position`
- 直している所に水色の枠・そこへスクロール。右の印を押す→左の入力が開く
- 1440 を縮めて出す。「スマホの見え方」で 390
- 目安の見え方（改行・段の高さ・下地に無い定休日の行は作り直しで決まる）。「公開すると正しく並びます」と添える

## 5. 写真
1. 選ぶ→向きを直し長い辺 2400 まで→PC の枠の比の切り抜き枠を動かす・広げる（スマホの枠は点線で中に）
2. 幅が minWidth 未満なら「ぼやけるかもしれません」（保存はできる）
3. `buildUploadForm` と同じ作り（2400＋640/1280 の JPEG・WebP）で `POST /api/shops/:id/assets`→新しい `ast_…`
4. ② は `asset` を新しい ID、`crop` を `{fx:50,fy:50,zoom:1}`。品は `photos[0]`。下書きに保存するまで公開には出ない

## 6. 保存・公開・版・ぶつかり
- 読む：`/api/me`→`drafts/shop`・`drafts/site`（version）・`/status`（上に状態の文字）
- 保存：変えた方だけ `PUT drafts/<kind>`（`If-Match`）。① と ② は別の版
- **409**：「ほかの所で直されました」。①「新しい方を読み込む」（自分の分は `POST /backups` に残す）／②「自分の直しで保存する」（相手の分を残してから `current.version` で出し直す）
- 公開：「公開する」→確かめの一言→ `POST /publish {scope:"all", render:"rebuild", shopDraftVersion, siteDraftVersion}`→ 手元は `/__dev/rebuild`：`/edit-api` から ①②・写真を取り `--from` のフォルダに書き、`rebuild-shop <slug> --from … --dry-run --no-check`。結果を `render` に返す
- 版：`/versions` の一覧→「この版に戻す」＝`restore {includeShop:true,…}`→下書き→公開し直す

## 7. api に足す物（試験つき。共通の物なので別のコミットで早く main へ）
1. `POST /publish` に `render:"rebuild"`：`pages` 無しで版（①② の写し）を作る。答え `{number, render:"pending"}`。この版は API の公開ページでは出さない（店は Pages）
2. `versions` に `render_state`・`render_error`（migration 0005）。`/status`・`/versions` に `render`
3. `GET /edit-api/shops/:shop/versions/:n`（①②・写真の一覧）・`GET /edit-api/shops/:shop/assets/:id/file`・`POST /edit-api/shops/:shop/versions/:n/render {ok, url?, error?}`
4. 種まき：`seed.mjs --site amet`（`samples/amet` の ①・④・media 19 枚、② は `{draft:{...site.json, template:{name:"wa-03",version:1}, genConfig:<wa03.json>}, theme}`、スラッグ amet、店主 `owner@amet.example`）
- lane4（0053）も `/edit-api` を触る→先に main へ。報告に「共通の道具を直した」

## 8. ログイン
- メール→6 桁のコード（同じブラウザ）かリンク。手元は wrangler dev のログに `[mail] … code=… link=…`
- LINE：`GET /api/config`（足す。`{line:bool}`）が false なら出さない

## 9. 画面と言葉
- ログイン：「メールアドレス」「コードを送る」「届いた 6 桁の数字を入れてください」「入る」
- 一覧（スマホは 1 列、押すと開く）：「営業時間とお休み」「お品書き」「お店の紹介」「表紙の言葉」「写真」。下に固定で「下書きに保存」
- 上の帯：店名・状態・「公開する」・「これまでの公開」
- 品：「品を足す」「この品を消す」「↑」「↓」。時間：曜日ごとに「開いている／お休み」と時刻、「全部の曜日に同じ時間を入れる」
- 字数：「あと 12 字」／「40 字までにしてください（今 46 字）」／「目安より長めです。保存はできます」
- 見た目：白地・墨緑 #2E3B36 の字と太い罫線・薄い罫線 #E9EBE6・水色 #6098A8 は印と押せる所。Zen Kaku Gothic New、数字は Space Mono。影・角丸・色の面なし

## 10. 試験
- 単体：limits（warn/error・既定の規則）・hours・patch（下地に当てる）・crop・409
- api：上の追加を `apps/api/test` に（vitest・tsc）
- 通し：`apps/owner/test/e2e.mjs`（Playwright。editor の e2e-api と同じく新しい `--persist-to` に種まき→wrangler dev→serve.mjs）：AMET の店主で入る→時間・お休み→品を足す→紹介文→写真→保存→公開→dry-run ok→版。上限超えで保存不可・別タブで 409。390 と 1440
- 画像は `docs/gallery/review/owner/`。**.gitignore に足す**（今は入っていない）

## 11. 危ない所
- 本当の公開（Pages）は runner（lane4）。手元は dry-run まで
- 見え方は目安（4章）。品が 9 品以上だと段の高さは作り直しまで合わない
- AMET は salesDraft なので rebuild は `publishable:false`（正しい）
