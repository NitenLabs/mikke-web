# 店を作り直して公開する（tools/rebuild-shop.mjs）

指示 0045（店主が直せる仕組み 段1）。店の ① から型の gen → build → finish を流し、検査して、本番の置き場（Cloudflare Pages の `mikke-<店>`）に上げる命令を出すまでを1つの命令にした。部品は `tools/lib/rebuild.mjs`（`tools/edit-runner.mjs` からも import する）。

## 使い方（mikke-web のフォルダで）

```
node tools/rebuild-shop.mjs <店> [--from <①のフォルダ>] [--out <フォルダ>] [--dry-run] [--deploy] [--date YYYY-MM-DD] [--base <前の書き出し>] [--no-check] [--keep-stage] [--log <file>]
```

| 引数 | 意味 |
|---|---|
| `<店>` | `samples/<店>` のフォルダ名（例 `amet`） |
| `--from` | ① のフォルダ（下の形）。無ければ `samples/<店>` だけで作る |
| `--out` | 書き出し先（既定 `dist/rebuild/<店>`）。中身を入れ替える。`_layout.json`（検査用）は入れない。`preview`・`_preview` の下は断る |
| `--from-api <URL>` | apps/api の**公開された ①** から作る（0053）。公開中の版の ①・② の文字（`draft.content`）を `dist/_api-source/<店>-published` に下の形で書いてから流す。読むのは `GET /edit-api/shops/<店>/published`（鍵 `--api-secret`・`MIKKE_API_RUNNER_SECRET` だけ。Cookie は使わない、0059）。`--api-assets` で写真も版の写真を api から。版が `render:"rebuild"`（型の店の公開。edit-runner --publish の既定）なら、作った結果を `POST /edit-api/shops/<店>/versions/<n>/render` に返す（`--dry-run`・`--no-report` では返さない）。部品は `tools/lib/api-source.mjs` |
| `--dry-run` | 作って検査するだけ。書き出さない |
| `--deploy` | wrangler の命令を組み立てて json に入れる。**走らせない**（ユーザーが貼る） |
| `--date` | 書き出しの基準の日（既定 今日・日本時間）。品の出し入れ・年の表示に効く |
| `--base` | 「変わったページ」を比べる前の書き出し（既定：`--out` の今の中身 → `dist/<店>`） |
| `--no-check` | 型の検査（`waNN-check`、Playwright）を飛ばす。いちばん時間がかかる所 |
| `--keep-stage` | 作業用の写し `dist/_rebuild-stage/<店>` を残す |

流れ：
1. 作業用の写し（stage）を `dist/_rebuild-stage/<店>` に作る（tools・schema・templates/wa-NN・samples/<店> の写し、node_modules は link）。`--from` の中身を店のフォルダに重ねる。**repo の samples/<店> は書き換えない**
2. 型は `site.json` の `templateId`（`tpl_wa_03` → wa03）で決まる。`<型>-gen`（店のフォルダに `<型>.json` がある店だけ）→ `validate` → `build` → `<型>-finish`
3. 検査：validate（build の前）・壊れた画像（HTML の src・srcset・url() が書き出しの中にあるか）・`<型>-check`（幅 320〜1920 のはみ出し・重なり・読めない写真など）・**noindex が付いていないこと**
4. `--out` に書き出す（検査が通ったときだけ）。`--deploy` なら命令を出す
5. 結果を json で標準出力に出す。ok でなければ終了コード 1

結果の json の主な所：

```
{ "ok": true,              // 作れて、壊れた画像・型の検査が通った
  "publishable": false,    // ok かつ noindex が無い（本番に出せる）
  "url": "https://mikke-amet.pages.dev/", "target": { "kind": "pages", "project": "mikke-amet", "host": …, "pending": null },
  "steps": [{ "name": "wa03-gen", "ms": 119, "ok": true }, …],
  "checks": { "images": {…}, "noindex": { "ok": false, "reason": "shop.json の salesDraft: true …" }, "template": {…} },
  "changed": { "base": "<比べた前>", "pages": [{ "file": "index.html", "change": "modified", "onlyEditMarks": false }], "files": [...] },
  "deploy": { "ready": true, "create": "npx wrangler pages project create mikke-amet --production-branch main",
              "deploy": "npx wrangler pages deploy <out> --project-name mikke-amet --branch main --commit-dirty=true" },
  "timings": { "stage": 288, "pipeline": 7059, "templateCheck": 29588, "total": 37213 } }
```

- `salesDraft: true`・`isSample: true` の店は page.mjs が noindex を付けるので `publishable: false`、`--deploy` は止まる（`deploy.ready: false`）。本番に出す前に ① の salesDraft を外し、仮の中身を本物にする（外すと validate が仮の中身を誤りにする）
- かかる時間（AMET、2026-11-11 手元）：全体 約37秒（写し 0.3秒・gen 0.1秒・validate 0.8秒・build 6秒・finish 0.1秒・wa03-check 29秒）。`--no-check` なら約8秒

## edit-runner などから呼ぶ（`tools/lib/rebuild.mjs`）

- `rebuildShop({ site, from, out, dryRun, deploy, date, check, base, afterGen, stageDir, keepStage, log })` → 上の json。`afterGen({ shopDir, stage })` は gen の後・validate と build の前に呼ばれる（文字の箱の差分を site.json に当てる所）
- 低い所の部品：`makeStage(dir, site, { from })` → `{ dir, shopDir, tpl }`、`runPipeline({ site, stage, date, log, afterGen })` → `{ distDir, steps, tpl }`（edit-runner の `rebuildFallback` と同じ引数と返り）、`removeStage(dir)`（link を先に外す）、`runTemplateCheck`・`brokenImages`・`noindexMarks`・`diffDirs`・`resolveSiteUrl`・`deployCommands`

## `--from` に渡すフォルダの形（段2 で D1・R2 から取ってくる口）

```
<from>/
  shop.json          ① 必須。schema/shop.schema.json の形（D1 の edit_snapshots.shop をそのまま書く）
  assets.json        ① 写真の一覧（assets.<ID>.file が media/ の下のファイル名）
  media/<ファイル>    ① 写真（R2 の店の置き場から取る。assets.json の file と同じ名前）
  site.json          任意。文字の箱を直したときだけ（無ければ samples/<店> の物）
  <型>.json           任意。型の設定（例 wa03.json。文字の箱を直したときは gen で戻らないようにここも）
  theme.json・edit-limits.json・deploy.json  任意
```

- 重ねるのは上のファイルと `media/` の中だけ（ほかのファイル・フォルダは無視する）。無い物は `samples/<店>` の物を使う
- `samples/<店>` が無い新しい店でも、`--from` に shop.json・assets.json・site.json・theme.json がそろっていれば作れる

## サイトのアドレス（3通り）

置き場は `samples/<店>/deploy.json`。無い店は `pages`。

```
{ "domain": { "kind": "pages" | "mikke" | "own", "name": … } }
```

| kind | アドレス | name |
|---|---|---|
| `pages` | `https://mikke-<店>.pages.dev/`（まだ決めていない間の仮） | 使わない |
| `mikke` | `https://<name>.<芦屋みっけのドメイン>/` | サブドメイン（省くと店のフォルダ名） |
| `own` | `https://<name>/`（店の独自ドメイン。新しく取る・店がもう持っている、どちらも。費用は実費） | ドメイン（例 `amet-coffee.jp`・`www.amet.co.jp`） |

- 芦屋みっけのドメインは未取得。`tools/deploy-config.json` の `mikkeDomain` に1か所書けば、`kind: "mikke"` の店すべてに効く。未設定の間は `mikke-<店>.pages.dev` を返し、`target.pending` に理由が出る
- どの kind でも、Cloudflare Pages のプロジェクトは `mikke-<店>` の1つ（アドレスはカスタムドメインとして足すだけ）。だから kind を変えても上げ直す先は同じ

### あとから変える（例 mikke → own）

1. 店の新しいドメインを用意する（取る、または店の持っている物の DNS を触れるようにしてもらう）
2. 下の「カスタムドメインと DNS」で新しいドメインを `mikke-<店>` に足す。**古いドメインはまだ外さない**（両方で見える状態にする）
3. `samples/<店>/deploy.json` を `{ "domain": { "kind": "own", "name": "<新しいドメイン>" } }` にしてコミット（管理画面から選べるようになったら、D1 の値を変える）。`rebuild-shop --deploy` で上げ直す（canonical・og:url を将来足すときもこの URL を使う）
4. 古いアドレスから新しいアドレスへ 301 で転送する：
   - 古いのが `<店>.<芦屋みっけのドメイン>`（芦屋みっけのゾーンが Cloudflare にある）：ゾーンの **Rules → Redirect Rules** に1つ足す。条件 `http.host eq "<店>.<芦屋みっけのドメイン>"`、動的に `concat("https://<新しいドメイン>", http.request.uri.path)`、301、クエリを残す。DNS の古い名前はプロキシ（橙の雲）のまま残す。転送が効いたのを確かめてから、Pages のカスタムドメインから古い名前を外す
   - 古いのが `mikke-<店>.pages.dev`：pages.dev はゾーンの規則を付けられないので、アカウントの **Bulk Redirects**（Rules → Redirect Rules → Bulk Redirects）に `mikke-<店>.pages.dev` → `https://<新しいドメイン>` の一覧を作り、「パスを残す」「クエリを残す」「サブパスも」を入れて有効にする
   - Pages の `_redirects` はパスの転送だけで、ドメインをまたぐ転送の元（ホスト名）は指定できないので使わない
5. 転送は少なくとも1年は残す（検索とお客さんのブックマークのため）

## Pages のカスタムドメインと DNS（手順だけ。今は付けない）

1. 初めての店は、プロジェクトを1回作る：`npx wrangler pages project create mikke-<店> --production-branch main`
2. `rebuild-shop <店> --out dist/rebuild/<店> --deploy` の json の `deploy.deploy` の1行を貼って上げる（`mikke-<店>.pages.dev` で見える）
3. Cloudflare の画面：Workers & Pages → `mikke-<店>` → カスタムドメイン → 「カスタムドメインを設定」→ ホスト名（`<店>.<芦屋みっけのドメイン>` か店のドメイン）
4. DNS：
   - ドメインのゾーンが同じ Cloudflare アカウントにある：画面が CNAME（`<名前>` → `mikke-<店>.pages.dev`、プロキシ）を自動で足す
   - 店のドメインで、DNS が別の会社（お名前.com など）にあるサブドメイン（`www.` など）：その会社の画面で CNAME `www` → `mikke-<店>.pages.dev` を足す
   - 頂点（`amet-coffee.jp` そのもの）を使うときは、ゾーンを Cloudflare に移す（ネームサーバーを Cloudflare の2つに変える）必要がある
5. 状態が「有効」になり証明書が出るまで待つ（数分〜24時間）。そのあと `rebuild-shop` の url と同じアドレスで開けるか確かめる

## 営業用の見本と本番を混ぜない

| | 営業用の見本 | 本番（納品） |
|---|---|---|
| 書き出し | `tools/preview-export.mjs <店>` → `dist/preview/` か `_preview/` | `tools/rebuild-shop.mjs <店> --out dist/rebuild/<店>` |
| Pages のプロジェクト | `nitenlabs-preview`（全店で1つ。`/<店>/` の下） | `mikke-<店>`（店ごとに1つ） |
| 検索 | **noindex**（meta と `_headers` の X-Robots-Tag）・og 画像つき | noindex が付いていたら止まる |
| ① | salesDraft・仮の写真のままでよい | salesDraft を外し、本物の中身にしてから |

- rebuild-shop は `--out` が `preview`・`_preview` の下だと断り、プロジェクト名が `nitenlabs-preview` になる設定も断る
- preview-export の noindex・og の足し方は rebuild-shop では使わない（本番の書き出しに混ぜない）
