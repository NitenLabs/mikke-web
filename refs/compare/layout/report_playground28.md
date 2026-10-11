# 報告 playground28（試験台28・§2.4〜§2.6）

作業票：`experiments/layout/playground28/templates/..`→実体は `experiments/layout/playground28/` と
`templates/wa-01/wa-01_layout_playground28_workorder.md`。出力は `refs/compare/layout/playground28_single.html`
（＋ `experiments/layout/playground28/index.html`）。ビルドは `node experiments/layout/playground28/build.mjs`。

この作業票は Claude.ai が立てた段取りで多段に分けて進めている（下の「段取り」）。本報告は各段の記録を積む。

---

## これまでにできたこと（コミット）

- `eeab1c3` Stage 2a：お品書き本体（MENU）を ① catalog 連動に＋括りの見出し
- `172f8fd` Stage 2b(1)：出ていない品を編集時だけ薄く出す（読み取り表示）
- `10d9784` 修正2点（Claude.ai 確認の指摘）
  - 出ていない品の理由（「2〜4月だけ出ます」「休んでいます」）を**名前のすぐ右（8px）**へ。従来は名前の箱が
    `nameW` 幅いっぱいで理由が行の中ほど（桜餅 x≈424／あんみつ x≈447・行幅1005）に出ていた。理由を出す行だけ
    名前の箱を `width:fit-content`（折り返し上限は `max-width:nameW`）に縮めた（`model/c3-edit/model.mjs` rowHtml）。
  - プレビュー（記録15.5）・見るだけ（15.6）で `.seclabel`（「お品書き本体」等のセクションの札）を出さない
    ＝`body.pg-preview/.pg-viewing .seclabel{display:none}`（`build.mjs` UI_CSS）。
- `3059423` Stage 2b(2)：品のドラッグ並べ替え＋括りの足す/消す（下記）

### Stage 2b(2) の中身
- **データ層（app.js）**：`applyShopOps` に `shopReorder`（placement の menuId/categoryId/order 書き換え）・
  `shopCatAdd`・`shopCatDel` を追加。`isShopOp`・`recomputeShopSeq`（`cat_x…` も採番）更新。
  API：`menuMoveRow(plc,destCat,beforePlc)` / `cardsMove(gid,item,beforeItem＝pick順)` /
  `categoryAdd(afterCat)` / `categoryDelete` / `categoryCanDelete` / `menuView` / `menuRowPlc` / `menuCatId`
  （`PG` と `PG.api` 両方に公開）。
- **ドラッグUI（build.mjs WIRING・capture 相の IIFE）**：
  - お品書き本体の行 `.krow` をメニューページで掴んで並べ替え（横線）。別の `.kcat` に落とせば括りが変わる。
  - トップのおすすめは「塊を選ぶ→中の札を選ぶ（2回目）→札を掴む」で並べ替え（縦線→`pick`）。
    1回目の塊選択・`列▾`・塊移動は従来どおり。**写真中央は「写真を変える」ボタンが乗る**ので、札は名前/文字側で掴む。
  - 括りの見出しを右クリック→「括りを足す（この下に）」「括りを消す」（品が残っていれば灰色）。
- **モデル（model/c3-edit/model.mjs）**：`.krow` に `data-plc/data-cat/data-menu`、各括りを `.kcat`
  （`data-cat/data-menu`）で包む、`.card` に `data-card/data-item`。空の括りも落とし先・右クリック対象。
  プレビュー/公開の見た目は不変。

### 確認結果（2026-10-11・python playwright・`refs/compare/layout/playground28_single.html`）
- `verify_extra_catalog` 28/28、`verify_extra_save` 52/52、`verify_extra_align` 23/23、`verify_extra_text` 不合格0、
  `verify_extra_width` 不合格0、pageerror なし。
- ブラウザ操作で確認：行ドラッグ（括り内＝順番／括り間＝括りが変わる）、おすすめ札ドラッグ（→`pick`）、
  括り足す/消す（空でないと「括りを消す」灰色）、2点修正（理由の位置・プレビューの札）。
- `verify_extra_arrange`・`photo`・`publish` は **172f8fd（HEAD）と同じ既存の環境起因クラッシュ地点**まで到達して落ちる＝
  本変更起因でない：arrange＝`handle_drag` の `max()` 空列（Mac で落ちる系）、photo＝F12 の `filechooser`
  （ヘッドレスでファイル選択ダイアログが出ない）、publish＝V2 の「セクション 上へ」（playground22 の試験が
  playground28 のページ別セクションと噛み合っていない既存の不合格）。いずれも HEAD で同じ所まで OK 数一致で確認済み。

### 気になったこと
- トップのおすすめ札の「写真の中央」はドラッグで掴めない（選択中は `#photoChangeBtn` が中央に乗るため）。
  名前・説明・値段・写真の縁では掴める。実害は小さいが、UX を上げるなら「中の札選択中はボタンの上からでも
  札を掴める」扱いを足す余地あり（写真差し替えのクリックと競合するので要検討）。
- 既存の「お品書き本体の行を1回クリックしても選択されない」点は 2b(2) では未対応（選択は §2.5＝2c で必要になる）。
- `verify_extra_*` を一度にまとめて走らせるとブラウザが途中で `Target closed`（資源枯渇）で落ちることがある。
  **1本ずつ走らせること**（save を一括実行で誤って途中クラッシュ→単独では 52/52 を確認済み）。

### 作業環境メモ（次の人・次セッションへ）
- 確認スクリプトは **python playwright**。未導入環境では `pip3 install --user playwright` →
  `python3 -m playwright install chromium`（本セッションで導入済み）。Node 側 playwright はビルド（写真焼き込み）で使用。
- ビルド：`node experiments/layout/playground28/build.mjs` → `refs/compare/layout/playground28_single.html` と
  `experiments/layout/playground28/index.html` を書き出す。
- 走らせ方：`python3 tools/verify-claudeai/verify_extra_<名>.py <single.html の絶対パス>`。
- コミット対象は機能ファイル（app.js / build.mjs / model/ / playground28_single.html）のみ。verify が吐く PNG
  （`refs/compare/layout/playground25/width/*.png`・作業フォルダ直下の `A4.png` 等・`refs/compare/layout/playground28/`）は
  コミットしない。

---

## 続きのメモ（次にやること）

**いまここ：Stage 2b(2) まで完了・push 済み（`3059423`）。次は Stage 2c。**

### 段取り（ユーザー決定 2026-10-11・各段で合格したら commit/push・止まるときはこの節を更新）
- 2a（済 `eeab1c3`）／2b(1)（済 `172f8fd`）／修正2点（済 `10d9784`）／**2b(2)（済 `3059423`）**
- **2c（次）**：§2.5 の道具4つ＝選んだ品に「販売 ▾・出す月 ▾・ラベル ▾・メニュー ▾」を上の並び（選んだ物の道具）に出す
  （出し方は「明るさ ▾」「列 ▾」と同じ。窓が狭いときは記録13.3）＋ §2.7 品を消したときの知らせ
  （「『◯◯』を消しました（…）」＋「戻す」5秒）。作業票 M6〜M10・M12・M13。
  - 販売▾＝品の `status`（販売中/休んでいる/終わり）、出す月▾＝`season.months`（1〜12月＋いつでも）、
    ラベル▾＝`labels`＋「＋新しいラベル」、メニュー▾＝載せ方（店頭/甘味・最後の1つは灰色）。
  - 販売/出す月を変えて出なくなったら 2b(1) の薄表示にその場で反映（isDisplayable 連動）。これは既に読み取り側ができている。
  - ops は既存の `catAct`（`shopField`＝status、`shopLabels`＝labels、新 `shopReorder`／`shopCatAdd` の流儀）を踏襲。
    `season` は `shopField`（field:"season"）で入れられるはず。メニュー付け外しは placement の追加/削除（tableDelete/
    cardsAdd 系＝既存 catAct）か新 op。要・設計。品の行/札の**選択**が要る＝お品書き本体の行クリックで選択する導線を 2c で足す。
- **Stage 3**：§2.6（CONTACT の ① 連動、営業時間・住所・行き方・支払い方法の**その場に開く箱**、電話等のダブルクリック書き換え）。H1〜H9。
  app.js に「`mt_`（提供時間）は §2.6 の箱で直す＝Stage 3」とコメント済み。`tools/lib/format.mjs` の書き方に合わせる。
- **Stage 4**：`tools/verify-claudeai/verify_extra_pages.py`（N1〜H9）新規作成、§3 の絵と ① 連動文字の一覧、
  全確認スクリプト、本報告の仕上げ。あわせて §2.2・§2.3 の残り（ナビ部品のドラッグ／ページ名変更／
  リンク札「開いて確かめる」でページ移動／公開前チェックを全ページ×PC・スマホ）。
