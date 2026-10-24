# apps/editor（編集画面）

試験台30（`experiments/layout/playground30/`）を、動きを1つも変えずに部品のファイルに分けたもの。
`node apps/editor/build.mjs`（または `npm run build:editor`）で `apps/editor/dist/editor_single.html` の1ファイルにまとまる。

## 作りの考え方
- 試験台30 の `app.js` は `const PG = (function () { … })();` の1つの閉じた中に、状態（`state`・`drag`・`rz` など）と
  450 ほどの関数が入っていた。これを ES モジュールに分けると、状態の書き換えや読み込む順番が変わって動きが変わりうる。
  そこで **中身は1文字も書き換えず、文の切れ目でファイルに分け、組み立てのときに元の順につなぐ** ようにした。
  - `src/pg/*.js`：つないだものが `const PG = (function () { … })();` の中身。**全部で1つのスコープを分け合う**
    （ほかのファイルの関数・定数・`state` をそのまま使える）。中は宣言だけで、読み込んだときに動く処理はない。
  - `src/ui/*.js`：試験台30 の build.mjs の中の WIRING（画面のつなぎ）。PG の後に **上から順に** 走る。
    `addEventListener` の順が動きに効くので、並びは入れ替えない。
  - 並びは `src/parts.mjs` に1か所（ファイル・担当の線・中身）。ファイルを足したらここに足す。
- ES モジュールなのは `packages/core/`（データ・配置・描画）と `src/lib/`（入口と保存先）。esbuild が1つにまとめ、
  ページのスクリプトの先頭で `__MIKKE` として受け取り、`SPEC・RESOLVE・BANCHOR・C3・TEXT・CATALOG・saveStore` の名前で pg/・ui/ から使う。
- 組み立てるとき、つないだスクリプトを esbuild で文法だけ確かめる。同じ名前を2つのファイルで宣言した等のまちがいは
  `pg/drag.js:10  The symbol "bareOf" has already been declared` のようにファイルと行で出る。

## ファイルの地図

### 組み立て・入口
| ファイル | 中身 |
|---|---|
| `build.mjs` | 1つの HTML にまとめる（esbuild・pg/ui をつなぐ・見本の中身と ① お店の情報・写真の焼き込み・Google Fonts のリンク・試験の画像の写し） |
| `src/parts.mjs` | pg/・ui/ のファイルの並びと担当の線 |
| `src/lib/entry.js` | ES モジュールの側の入口（packages/core を試験台30 と同じ形の SPEC・RESOLVE・BANCHOR・C3・TEXT・CATALOG にして渡す） |
| `src/lib/store.js` | **保存先の差し替え口**。`LocalStore`（IndexedDB `mikke-editor`）。`ApiStore`（apps/api）。どちらを使うかをここで選ぶ（下の「API につなぐ」） |
| `src/lib/api-store.js` | `ApiStore`：保存先を apps/api に（下書き ①・②③、編集の設定、版の一覧・前の版・戻す前の下書き、写真を上げる、公開）。M3 |
| `src/lib/login.js` | ログインの箱（メールアドレス → 6 桁のコード → 入る。`/login#t=…` のリンクでも入る。ログインが切れたときの言葉）。M3・M3b |
| `src/lib/api-stash.js` | 手元の一時置き場（IndexedDB `mikke-api-stash`）：ログインが切れたときに退避した下書き・上げ終わっていない写真。ApiStore だけが使う。M3b |
| `src/lib/photo-upload.js` | 写真を上げる本文（描き直した 2400px の 1 枚＋幅 640・1280・2400 の JPEG・WebP。`multipart/form-data`）。M3 |
| `src/editor.css` | 編集画面の CSS（試験台30 の UI_CSS） |
| `src/body.html` | 編集画面の HTML（道具の並び・帯・箱。試験台30 の UI_BODY） |
| `testimg/` | 試験の画像（試験台30 の testimg の写し。dist/editor_testimg に写す） |

### src/pg/（編集の中身。PG の中）
| ファイル | 行 | 線 | 中身 |
|---|---|---|---|
| `src/pg/ids.js` | 47 | 共通 | 部品 ID の名前空間（素の ID・インスタンス）・見出しの組・動かせる部品・セクションの割り当て |
| `src/pg/text-style.js` | 81 | A1 | 文字の見た目（大きさ・太さ・色・書体）と「元に戻す」の入口 |
| `src/pg/catalog-cols.js` | 30 | A4 | 品の並びの列・幅、左右の入れ替え |
| `src/pg/shopinfo-pages.js` | 75 | A4 | お店の情報（STORE＝今の ① から読む）・連動する文字（アクセス・フッター）・公開前の確認・ページの定義・セクションの名前 |
| `src/pg/text-link.js` | 76 | A1 | リンク（行き先・名前・自動リンクの見分け・部品のリンク） |
| `src/pg/text-runs.js` | 167 | A1 | 文の一部の見た目（runs）・カーソル位置・書き換え中の範囲の操作と貼り付け |
| `src/pg/catalog-derive.js` | 26 | A4 | ① お店の情報から品の並び・表・お品書きを作る（中身は packages/core/catalog.js） |
| `src/pg/state.js` | 12 | 共通 | 編集の状態（state）・倍率 |
| `src/pg/photo-assets.js` | 65 | A3 | 写真の素材・大きさ・見せる範囲（view） |
| `src/pg/ops-reduce.js` | 294 | 共通 | 操作の記録 → content / edits（種まき・reduce） |
| `src/pg/ops-fold.js` | 121 | 共通 | 今の形を作る（fold・下書き 4.9）・鍵をそろえた JSON |
| `src/pg/render.js` | 198 | 共通 | 描画（セクションの入れ物・render・ページを移る・文字の見た目・倍率） |
| `src/pg/render-place.js` | 154 | 共通 | 絶対配置の当てはめ・geometry・小さい部品のつかみ・セクション一覧・重なりの知らせ・付いていく先 |
| `src/pg/select.js` | 62 | A2 | 選択の印・つまみ・選ぶ/外す |
| `src/pg/ops-history.js` | 43 | 共通 | commit・戻す/やり直す・最初の形 |
| `src/pg/store-save.js` | 99 | 共通 | 保存（自動保存・別タブ・版の一覧）。保存先は lib/store.js の saveStore |
| `src/pg/publish.js` | 134 | 共通 | 公開の履歴から戻す・公開前チェック・プレビュー・端末 |
| `src/pg/section.js` | 44 | A3 | セクションの操作（上へ・下へ・複製・削除・足す） |
| `src/pg/drag.js` | 177 | A2 | ドラッグ（M1/M2・並び替えの帯・落とした先） |
| `src/pg/resize.js` | 47 | A2 | 大きさを変える（つまみ） |
| `src/pg/drag-guides.js` | 143 | A2 | 目安の線（スマートガイド・等間隔）・押し下げ・両端末の解決・範囲で選ぶ |
| `src/pg/select-nudge.js` | 22 | A2 | 矢印キーで動かす・削除 |
| `src/pg/text-edit.js` | 140 | A1 | その場書き換え（contenteditable・IME・細かい戻す） |
| `src/pg/clipboard.js` | 52 | A3 | コピー・切り取り・貼り付け・複製 |
| `src/pg/catalog-ops.js` | 282 | A4 | ① 連動の操作（値段・表・品の並び・お品書き・品の道具・お品書きを見る） |
| `src/pg/select-order.js` | 59 | A2 | 元に戻す（範囲）・元の配置を見る・前面/背面 |
| `src/pg/photo-add.js` | 55 | A3 | 文字・写真を足す（置いた位置に）・写真の明るさ |
| `src/pg/testapi-presets.js` | 510 | 共通 | 試験の再現（プリセット Q/R・runStep） |
| `src/pg/select-align.js` | 56 | A2 | 配置（揃え・整列） |
| `src/pg/photo.js` | 91 | A3 | 写真の描画・差し替え・見せる範囲（トリミング）・試験画像 |
| `src/pg/m3-api.js` | 88 | M3 | API につないだとき：写真を上げたら ④ の ID に付け替える・公開（`buildPublishBundle` → 写真 → `POST /publish`）・版から戻す |
| `src/pg/publish-bundle.js` | 120 | C | 公開の一式（`PG.buildPublishBundle()`）：各ページ・PC とスマホをプレビューの描き方で写し取り、`packages/core/publish` で HTML・CSS・sitemap を作る |
| `src/pg/testapi.js` | 166 | 共通 | 入力の種類・試験の窓口（draft・roundTrip）・PG.api（window.__playground） |

### src/ui/（画面のつなぎ）
| ファイル | 行 | 線 | 中身 |
|---|---|---|---|
| `src/ui/toolbar.ui.js` | 92 | A5 | 描き直しの後・道具の並び（入りきらない分は「その他」）・端末・戻す・制作用 |
| `src/ui/publish.ui.js` | 44 | 共通 | 保存の状態・公開の流れ・公開前の確認の箱 |
| `src/ui/publish-preview.ui.js` | 77 | 共通 | プレビューの帯・公開の履歴の帯 |
| `src/ui/toolbar-add.ui.js` | 20 | A5 | その他の状態・元の配置を見る・プリセット・文字/写真を足すボタン |
| `src/ui/text-tools.ui.js` | 76 | A1 | 文字の道具（大きさ・太字・色） |
| `src/ui/text-font.ui.js` | 32 | A1 | 書体の選び箱 |
| `src/ui/text-link.ui.js` | 62 | A1 | リンクの箱・部品のリンク |
| `src/ui/catalog-tools.ui.js` | 59 | A4 | 列の選び箱・品の道具（販売・出す月・ラベル・メニュー） |
| `src/ui/select-align.ui.js` | 37 | A2 | 配置（揃え・整列）のメニュー |
| `src/ui/ui-sheets.ui.js` | 30 | A5 | 開いている箱を閉じる・スマホの下からの箱 |
| `src/ui/text-link-chip.ui.js` | 31 | A1 | リンクの札（マウスを乗せると出る） |
| `src/ui/ui-fmenu.ui.js` | 60 | A5 | 部品の浮かぶメニュー |
| `src/ui/select-pointer.ui.js` | 66 | A2 | ステージのポインター（選ぶ・ドラッグ・範囲選択） |
| `src/ui/toast.ui.js` | 13 | A5 | 知らせ（pgToast） |
| `src/ui/catalog-boxes.ui.js` | 72 | A4 | 値段の箱・品を選ぶ一覧・行を足す・つながりの知らせ |
| `src/ui/catalog-menu.ui.js` | 24 | A4 | お品書きを見る・window.__ui |
| `src/ui/ui-context.ui.js` | 50 | A5 | ダブルクリック・右クリック・セクション/括りのメニュー |
| `src/ui/section.ui.js` | 109 | A3 | セクションの並び替え（ドラッグ）・足す所・種類の選び箱 |
| `src/ui/keyboard.ui.js` | 59 | A5 | キーボード・貼り付け |
| `src/ui/photo-input.ui.js` | 74 | A3 | 写真を選ぶ・落とす・「写真を変える」ボタン |
| `src/ui/photo-tools.ui.js` | 74 | A3 | 写真の道具（明るさ）・見せる範囲の操作 |
| `src/ui/touch.ui.js` | 107 | A5 | 指の操作（タップ・長押し・ドラッグ・自動スクロール） |
| `src/ui/touch-bars.ui.js` | 116 | A5 | スマホの帯・文字の帯・その他・重ねる物の位置合わせ |
| `src/ui/touch-crop.ui.js` | 18 | A3 | 指での見せる範囲の操作 |
| `src/ui/m3-api.ui.js` | 25 | M3 | API につないだときの公開の流れ（公開しています…・公開しました＋公開ページのアドレス・できなかった理由） |
| `src/ui/boot.ui.js` | 8 | 共通 | 起動（スマホの判定・PG.boot） |

### packages/core/（ブラウザでもサーバーでも使う。ES モジュール）
| ファイル | 中身 |
|---|---|
| `spec.js` | 文字の段・色・書体の値（元 model/lib/spec.mjs） |
| `layout/resolve.js` | 縦の基準の木を解く（元 model/b-anchor/resolve.mjs） |
| `layout/anchor.js` | 方式B の組み立て（元 model/b-anchor/model.mjs） |
| `layout/c3-edit.js` | ページの組み立て（特集・品・ヘッダー・フッター・お品書き・アクセス）と付いていく先（元 model/c3-edit/model.mjs） |
| `text/textlayer.js` | 改行の層（DOM で測る。ブラウザだけ。元 model/playground/textlayer.js。budoux は npm から） |
| `catalog.js` | ① から品の並び・表・お品書きを作る・値段の文字・① の op の畳み方（元 app.js の PG の中） |
| `shopinfo.js` | ① お店の情報の連絡先・場所（電話・住所・地図のリンク、アクセス・フッターの連動する文字、公開前の確認） |
| `page-css.js` | ページの土台の CSS・Google Fonts のリンク（元 build.mjs） |
| `publish/` | 公開の一式（ページの HTML・CSS・sitemap.xml・robots.txt・`/_mikke/site.js` の中身）。`publish/README.md` |
| `content/wa-01.json` | テンプレート wa-01 の見本の中身（元 model/playground/_content.json） |
| `test/core.test.mjs` | Node で読めること・① からの組み立て（`npm run test:core`） |

### 線の担当（docs/plan/ROADMAP.md）
| 線 | ファイル |
|---|---|
| A1 文字 | `src/pg/text*` `src/ui/text*` |
| A2 選ぶ・動かす | `src/pg/select*` `src/pg/drag*` `src/pg/resize*` `src/ui/select*` |
| A3 部品・写真・セクション | `src/pg/photo*` `src/pg/section*` `src/pg/clipboard*` `src/ui/photo*` `src/ui/section*` `src/ui/touch-crop*` |
| A4 品・お品書き・お店の情報 | `src/pg/catalog*` `src/pg/shopinfo*` `src/ui/catalog*` `packages/core/catalog.js` |
| A5 知らせ・キーボード・画面 | `src/ui/toolbar*` `src/ui/toast*` `src/ui/ui-*` `src/ui/keyboard*` `src/ui/touch.ui.js` `src/ui/touch-bars*` |
| まとめ役（共通） | 上の表で「共通」のもの（ids・state・ops-*・render*・store-save・publish*・testapi*・boot）、`editor.css`・`body.html`・`parts.mjs`・`build.mjs`・`src/lib/` |

`editor.css`・`body.html` は線をまたぐので、直したいときはまとめ役に頼む（ROADMAP の決まりどおり）。

## 組み立て
```
npm ci
npm install --no-save playwright@1.56.0   # この環境の Chromium 1194 に合う版（写真の焼き込みに使う）
node apps/editor/build.mjs                 # → apps/editor/dist/editor_single.html（dist/ は git に入れない）
npm run test:core                          # packages/core の単体試験
```

## 確かめ方（試験台30 と同じ結果になること）
```
bash tools/verify-audit/run_audit.sh   $PWD/apps/editor/dist/editor_single.html          # 約20分。area を並べるとその area だけ
bash tools/verify-claudeai/run_all_linux.sh $PWD/apps/editor/dist/editor_single.html     # verify-claudeai 全部
python3 tools/verify-audit/verify_audit_text.py $PWD/apps/editor/dist/editor_single.html J4 J9   # ID を指定して
```
- 結果は `apps/editor/dist/editor/verify-audit/`・`verify-linux/` に出る。
- 重い確かめは同時に2本走らせない（IndexedDB と CPU の取り合いで判定が揺れる）。
- IndexedDB の名前は `mikke-editor`。確認スクリプト（verify_extra_save・catalog・align）は DB の名前を `'mikke-' + ファイル名から _single.html を除いたもの` で決めて中を見る・消すので、ファイル名 `editor_single.html` に合わせた（試験台30 が `mikke-playground30` だったのも同じ決まり。`mikke-playground30` のままだと verify_extra_save の S6・S7 が前の項目の下書きを消せずに NG になる）。`<title>` は試験台30 と同じ。

## API につなぐ（M3）

何も付けなければ今までどおり **LocalStore**（ブラウザの IndexedDB。確認スクリプトはこちら）。次のどれかで **ApiStore**（apps/api）になる。

| 選び方 | 例 |
|---|---|
| URL に `?api=<API のオリジン>`（と `&shop=<お店の ID>`。無ければログインした人の最初のお店） | `http://localhost:8788/?api=http://localhost:8787&shop=shp_ashiyado` |
| 組み立てのときに `MIKKE_API` | `MIKKE_API=https://app.example.jp node apps/editor/build.mjs`（`MIKKE_API=same` ＝ページと同じオリジンの API） |
| メールのリンク `<APP_ORIGINS の先頭>/login#t=…` で来たとき | 前にこのブラウザで開いた API・お店（`localStorage` の `mikke-api-config`）を使う |

ローカルで動かす：

```sh
npm run build:editor
cd apps/api && cp .dev.vars.example .dev.vars && npm run seed && npx wrangler dev --var APP_ORIGINS:http://localhost:8788   # API は 8787
npx http-server apps/editor/dist -p 8788   # など。/ と /login で editor_single.html を返すもの（試験は自前の小さなサーバー）
# → http://localhost:8788/editor_single.html?api=http://localhost:8787&shop=shp_ashiyado を開く。コードは wrangler dev の画面の [mail] の行
```

- 編集画面のオリジンは API の `APP_ORIGINS` に入れる（CSRF・CORS。書き込みは `credentials: "include"`）。localhost の番号違いは同じサイトなので Cookie が届く
- **ログイン**：`ApiStore.open()` が `GET /api/me` を見て、401 なら編集画面の前にログインの箱を出す（`src/lib/login.js`）。メールアドレス → `POST /api/auth/request` → 6 桁のコード → `POST /api/auth/verify`（同じブラウザ）。`#t=…` で来たら `{token}` で入り、すぐ `#t=` を消す
- **保存**：`pg/store-save.js` の自動保存（500ms）がそのまま `put` を呼ぶ。`draft` → `PUT /drafts/site`（`{draft, theme}`。③ は読んだまま返す）、`shop` → `PUT /drafts/shop`、`settings` → `PUT /settings`。中身が前と同じなら送らない。`If-Match` は読んだ（保存した）版。書き込みは1本ずつ（自分どうしでぶつからない）
  - 409（ほかの端末・タブが先に保存）：書かずに、状態の文字を「**ほかの端末で変更されました。どちらを残すか選んでください**」にして、選ぶ箱（`#m3Conflict`）を出す。公開もしない（ぶつかったまま「公開」を押すと箱をまた出す）。下の「ぶつかったとき」
  - つながらない・5xx：「保存できませんでした…」にして 3 秒ごとにやり直す（今までと同じ J27）
  - 下書きを読めなかったら保存しない（テンプレートのままで上書きしないように）
- **版**：`versions` は `GET /versions`・`/versions/:n`（公開した版）と `/backups`・`/backups/:id`（戻す前の下書き）を編集画面の形にして読む。「この版を下書きにする」は、置き換える前の下書きを先に保存してから `POST /versions/:n/restore`（`includeShop`）か `POST /backups/:id/restore` を通す（サーバーにも「戻す前の下書き」が残る）
- **写真**：差し替え・追加で選んだ写真は、今までどおりブラウザで向きを直して長い辺 2400px に縮め、キャンバスに描き直す（位置情報などは残らない。HEIC はブラウザが読めればそのまま、読めなければ「この写真は読み込めません」）。保存のときに、まだ上げていない写真（`img_…`）を、幅 640・1280・2400（写真の幅より小さいもの＋写真の幅）の JPEG と WebP（作れるブラウザだけ）を添えて `POST /assets`（multipart）。上がるまではブラウザの中のデータで見せ、上がったら下書き・記録・版の中の ID を ④ の ID（`ast_…`）に付け替えて保存し直す。読み込み直したときは `GET /assets/:id/file` で見せる
- **公開**：「公開」→ 公開前の確認（今までどおり）→ 保存を落ち着かせる → 上げている写真を待つ → `PG.buildPublishBundle({assets, origin: publicUrl})` → まだ上げていない写真があれば上げて作り直す → `POST /publish`（描いたときの下書きの版つき）→「公開しました　公開ページ：<アドレス>」。409 は「ほかで変更されました。読み込み直してから公開してください」、429 などはサーバーの説明
- **ログアウト**（M3b）：「その他 ▾」（スマホは「その他」の板）に「**ログアウト**」と「**ほかの端末からもログアウト**」（API につないでいるときだけ。`#moLogout`・`#moLogoutAll`）。保存が落ち着くのを待ってから（保存できていなければ確かめる）`POST /api/auth/logout` か `POST /api/auth/logout-all`（この端末も含めて全部）→ 読み込み直す＝ログインの箱
- **ログインが切れた（401）**（M3b）：保存・公開・写真のどの頼みでも、401 が返ったら（`/api/me`・`/api/auth/*` は除く）、今の下書き（①②）を手元の IndexedDB（`mikke-api-stash`。LocalStore の `mikke-editor` とは別の箱。`src/lib/api-stash.js`）に、持っていた版番号と一緒に退避 → 「**ログインが切れました**」のログインの箱（`#mkLogin[data-login-expired]`。別のタブでメールのリンクから入ったら 3 秒ごとの確かめで閉じる）→ 入れたら同じ頼みを送り直す。下書きは退避したときの版番号のまま送るので、サーバーが先に進んでいなければそのまま保存、進んでいれば 409 → 下の箱。両方保存できたら退避は消す
  - 箱を出したまま閉じた・読み込み直した：次に開いて入ったとき、退避した下書きがサーバーと違えばそれを出し、退避したときの版番号で保存し直す（同じく、ぶつかれば箱）
- **ぶつかったとき（409）**（M3b）：「ほかの端末で変更されました」の箱に2つ。どちらも、選ばなかった方は `POST /api/shops/:id/backups`（apps/api。理由 `keep-conflict`）で「**戻す前の下書き**」に残す（履歴の帯から戻せる）
  - 「**ほかの変更を読み込む（自分の直しは消える）**」：今の自分の直しを残してから、サーバーの今の下書き（①②③・写真の一覧・履歴）を読み込む（読み込み直しと同じ形。戻す・やり直すの記録は消える）
  - 「**自分の直しで上書きする**」：サーバーの今の下書きを残してから、今のサーバーの版番号で自分の直し（①②。③ はサーバーのまま）を送り直す
  - `PG.m3.resolveConflict("theirs" | "mine")`（`src/pg/m3-api.js`）が中身。箱は `src/ui/m3-api.ui.js`
- **写真を上げている途中に閉じる**（M3b）：上げ始めた写真は、上げ終わるまで手元の IndexedDB（`mikke-api-stash` の `photo|…`）にも置く。上げている途中に閉じようとしたら `beforeunload` で警告（`saveStore.uploading()`）。読み込み直したときに上げ終わっていない写真が残っていれば、そのデータで見せ、下書きが使っていれば上げ直して ④ の ID に付け替える（使っていなければ消す）
- 通しの試験：`npm run build:editor` の後 `node --test apps/editor/test/e2e-api.test.mjs`（種まき → wrangler dev → ログイン → 直す → 読み込み直す → 写真 → 公開 → 公開ページ → 別のブラウザで 409 →「ほかの変更を読み込む」→ もう一度ぶつけて「自分の直しで上書きする」→ ほかの端末からもログアウト → 401 → 入り直して保存 → 切れたまま読み込み直す → 退避した下書き → 箱 → 写真を上げている途中に閉じる → 上げ直す → ログアウト。約 2〜3 分（同じアドレスのログインのメールは 60 秒あけるので、待つことがある。入り直しは種まきの後に足す制作側の人で）。ブラウザを使うので、ほかの確かめと同時に走らせない）。置き場所は毎回まっさら（`dist/e2e-api/state`）、wrangler のログは `dist/e2e-api/wrangler.log`

### まだのこと（M3 の残り）
- 写真の上げ直しは、上げ終わったのに答えを受け取る前に閉じた写真も、もう一度上げる（④ に同じ写真が 2 つできる。使わない方はゴミ箱の掃除の対象にならず残る）
- 退避した下書きは、だれが入っても（同じお店を直せる人なら）出す（人を比べない）
- staging に出す（Cloudflare のアカウント待ち）
