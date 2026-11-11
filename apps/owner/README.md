# apps/owner — 店主の編集画面

お店の人が、自分のお店のページの決まった所（`data-edit` の印がある所）だけを直す画面。設計は `SPEC.md`、要件は `apps/api/EDITOR_REQUIREMENTS.md`。

- 直せる所：営業時間とお休み・お品書き（足す・消す・並べ替え・値段）・お店の紹介（見出し・紹介文）・表紙の言葉・写真の差し替え
- 上限はお店ごとの `samples/<店>/edit-limits.json`（組むときに `dist/limits/<店>.json` に写す）。超えると保存できず、理由がその場に出る（目安＝warn は保存できる）
- スマホ（760px まで）は 1 列で、段を 1 つずつ開く。PC は左に入力・右に今の姿（下地の iframe。直している所に水色の枠）
- 保存は下書き（`PUT drafts/shop|site`、`If-Match`）。「公開する」で `POST /publish {render:"rebuild"}`。手元では続けて `/__dev/rebuild` が作り直し（dry-run）をして結果を版に記録する。本当に Pages に出すのは runner（lane4）

## 手元で動かす（mikke-web のフォルダで。3 つの端末）

1 回目だけ：

```sh
npm ci                                   # root（esbuild・playwright）
npm --prefix apps/api ci                 # apps/api（wrangler）
```

端末 1：組んで、種をまいて、API を動かす（`apps/owner/dist/dev-state` に D1・R2 を置く）

```sh
node apps/owner/build.mjs
node apps/api/scripts/seed.mjs --site amet --persist-to apps/owner/dist/dev-state    # マイグレーションも当てる。何度流してもよい
cd apps/api
npx wrangler dev --ip 127.0.0.1 --port 8787 --persist-to ../owner/dist/dev-state \
  --var APP_ORIGINS:http://localhost:5174 --var EDIT_RUNNER_SECRET:dev-runner-secret-0123456789abcdef-0123
```

端末 2：画面を出す（`/api` を wrangler dev に中継。初回は下地を作るので 10 秒ほど）

```sh
node apps/owner/dev/serve.mjs --port 5174 --api http://127.0.0.1:8787 --secret dev-runner-secret-0123456789abcdef-0123
```

ブラウザで http://localhost:5174/ → `owner@amet.example` →「コードを送る」→ **端末 1 に出る `[mail] to=… code=123456 link=…` の数字**を入れる（リンク `http://localhost:5174/login#t=…` を開いても入れる）。

- `--secret` は wrangler dev の `EDIT_RUNNER_SECRET` と同じ値（32 字以上）。無いと公開の後の作り直しはしない（版は render:"pending" のまま）
- 8787 をほかで使っているときは、両方の番号をそろえて変える（`--port`・`--api`。`APP_ORIGINS` は画面の番号）
- 下地（`/preview/amet/`）は `apps/owner/dist/base/amet`。サンプルを変えたら消すと作り直す
- 作り直しの作業のフォルダは `apps/owner/dist/rebuild/<店>-v<版>`（`rebuild-result.json` に結果）

## 試験

```sh
npm run test:owner                       # 純粋な部品（limits・hours・menu・crop・draft）。node --test
node apps/owner/e2e/flow.mjs             # 通し（Playwright。CI では走らせない。数分かかる）
```

- 通しは毎回まっさらな置き場所（`apps/owner/dist/e2e/state`、作り直しは `dist/e2e/rebuild`。`serve.mjs --work`）に種をまき、終わったら（失敗しても）立てたサーバーを `taskkill /T /F` で止め、使った番号で何も待っていないことを確かめて state と rebuild を消す（手元の `dev-state`・`dist/rebuild` には触らない）。空いている番号で wrangler dev と serve.mjs を立てる。1440 と 390 で、入る → 営業時間・お休み → 品を足す（上限超えで保存できない）→ 値段の書き方（○〜○円・時価・値段を出さない）→ 並べ替え（引きずる・「上へ」「下へ」・鍵盤）→ 紹介文 → 表紙の言葉 → 写真の差し替え → 下書きに保存 → 別のタブで 409 → 公開 → 作り直し ok → 版の一覧。数値の確かめを出し、画面の写しを `docs/gallery/review/owner/`（git に入れない）に置く。同じお店の公開は 1 分に 1 回までなので、間で 1 分待つ

## 作り

| ファイル | 中身 |
|---|---|
| `src/main.js` | 画面とつなぎ（ログイン・段・保存・409・公開・版・写真の箱） |
| `src/lib/limits.js` | 上限の判定（ここだけ） |
| `src/lib/hours.js`・`menu.js`・`crop.js`・`draft.js` | 営業時間・品書き・切り抜き・下書きと印のつなぎ（純粋） |
| `src/lib/patch.js` | 右の今の姿の DOM を直す・水色の枠 |
| `src/lib/photo-upload.js` | 切り抜いて大きさ違いと一緒に上げる（`apps/editor` の写し） |
| `dev/serve.mjs` | 手元の配り・中継・下地・`/__dev/rebuild` |
| `e2e/flow.mjs` | 通し |

## 気をつけること

- 右の今の姿は目安（改行・段の高さ・下地に無い「定休日」の行は作り直しで決まる）
- ② の写真の要素は型の gen が決まった素材を指すので、作り直しでは「元の素材の file を新しい写真に向ける」形で `--from` に書く（共通の道具 `tools/lib/api-source.mjs` の `photosFromSiteDraft`・`writeSourceDir`。手元は `dev/serve.mjs` の `writeFrom` がこれを使う。0065）
- AMET は salesDraft なので作り直しの結果は `publishable:false`（正しい）
- LINE で入るボタンは `GET /api/config` が `line:true` のときだけ出す（LIFF の中で開いたときの処理はまだ）
