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
- `0edd4a9` Stage 2c：品を選んだときの道具4つ（販売▾・出す月▾・ラベル▾・メニュー▾）＋§2.7 消す知らせ（下記）

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

### Stage 2c の中身（§2.5 道具4つ・選択導線／§2.7 消す知らせ・2026-10-12）
- **データ層（app.js）**：新 shop op `shopPlcAdd`（既存の品に載せ方を1つ足す）・`shopLabelDef`（新しいラベルを ① の labels に足す）。
  `isShopOp`・`recomputeShopSeq`（`lbl_x…` も採番）更新。API：`itemCtx`（選んだ品の status/months/labels/menus を読む）／
  `setItemStatus`・`setItemMonths`（空＝season を外す＝いつでも）・`setItemLabels`・`addItemLabel`・`setItemMenu`（一番近い=最初の括りの最後に載せる／外す）・
  `canRemoveMenu`（最後の1つは外せない）・`menuRowDelete`（§2.7 お品書き本体の行＝載せ方を消す。ほかのメニューに残らなければ品も消える）。
  `itemIdOfSel` はお品書き本体の行（`menu__row_…`＝placement）とトップの札・表（partInfo のエイリアス）を見分ける。
- **道具のUI（build.mjs）**：上の並びに `#itemTools`（販売▾・出す月▾・ラベル▾・メニュー▾）を追加。**display:none で隠す**ので
  隠れている間は AX ツリーに出ず、`get_by_role` の衝突を起こさない。出す条件は「品の1件（card_/row_）を単独選択・編集中でない・PC」。
  一覧（`.tspop.itempop`）は列▾と同じ出し方（押す→下に一覧、外・Esc で閉じる）。開いている一覧は onRender で選択中の品に追従して作り直す。
  販売＝status・出す月＝1〜12月＋いつでも・ラベル＝① の labels のチェック＋「＋新しいラベル」（その場で名前入力）・メニュー＝店頭/甘味のチェック（最後の1つ灰色）。
  窓が狭いときは「その他 ▾」にしまう（TB_ORDER/MORE_NAMES/overflowCandidates に4つを追加）。
- **選択導線**：お品書き本体の行（`.krow`）を動かさずクリック＝その行の名前部品を選ぶ（capture 相のドラッグ IIFE の pointerup で、
  行は箱を出さず選択だけ・札は従来どおり選択＋箱）。右クリックは行そのものを選ぶ（偽の I_table グループを選ばない）ように contextmenu を直した。
  showFmenu の品判定を `PG.REPEAT.test`→`PG.isRepeat`（接頭辞込みで判定）にし、お品書き本体の行は「書き換える／削除」だけ出す（行を足す・複製は本体では出さない）。
- **スマホ（§2.5）**：品の長押しの箱に「販売／出す月／ラベル／メニュー」→ 下からの板（showSellSheet 等。配置の板と同じ作り）。
- **§2.7 消す知らせ**：`pgToast(msg, undo)` に「戻す」ボタン（5秒）。削除は `tableDelete`/`cardsDelete`/`menuRowDelete` が
  `『◯◯』を…から外しました（◯◯に残っています）`／`お品書きから消しました` を出す（4.6＝そのメニューから外す・ほかに無ければ品も消える）。
  **閉じたら innerHTML を消す**＝上の並びの「戻す」(#tUndo) と `button[name=戻す]` が二重に出ないようにする（verify_playground の strict mode 回避）。

#### §2.7 の文言について（PowerPoint／記録と作業票の食い違いの扱い）
作業票 §2.7 の見出し例「『わらび餅』を消しました（店頭販売・甘味処の両方から）」は、**同じ §2.7 の2つ目の箇条書き
「全部を並べる所での削除＝そのメニューから外す（4.6）。ほかのメニューに載っていなければ品も①から消える」と食い違う**
（前者＝全メニューから消える／後者＝そのメニューだけ）。既存の `verify_extra_catalog` M7（わらび餅を甘味処から消しても店頭販売に残る）が
後者（placement 単位＝そのメニューだけ）を固定しており、これを変えると 28/28 が崩れる。よって**後者（記録・既存試験と一致）を採用**し、
知らせの文もそれに合わせた（「◯◯から外しました（◯◯に残っています）」／最後の載せ方なら「お品書きから消しました」）。「戻す」ボタンは追加。

#### 確認結果（2026-10-12・playground28_single.html）
- `verify_extra_save` 52/52・`catalog` 28/28・`align` 23/23・`text`/`width` 不合格0・`arrange` 29/29・`photo` 不合格0・`publish` 25/25。
  pageerror なし。※arrange/photo/publish は3本まとめて走らせると page load/screenshot が 30 秒で落ちる（資源）＝**1本ずつなら全て合格**。
- `verify_playground` 280 OK / **17 NG**（既知の Mac17＝D系・C3/C4/E1。172f8fd/HEAD と同集合。新規不合格なし）。
  2c で `pgToast` に「戻す」を足した初版は、消えた後も DOM に残り Y11 の `get_by_role('button', name='戻す')` が
  tUndo と二重一致して strict mode で落ちた→**閉じたら innerHTML を消す**修正で解消（再掲）。
- スモーク（python playwright）：MENU でわらび餅の行を選ぶと道具が出る・販売▾で休→薄表示・出す月▾で桜餅に当月を足すと薄が消える・
  ラベル▾で新ラベル追加・メニュー▾で甘味処に載る・削除で知らせ＋戻すボタンを確認。pageerror なし。

## 全スクリプト確認（2026-10-11・2c の前に全部最後まで走らせた）

比べる相手は**試験台27（dd9168e）＝全部通っていた基準**。§2.1 でヘッダー・フッターのセクションが増えたため、
試験台27 で通っていた3本が playground28 で途中クラッシュ／不合格になっていた。アプリでなく**試験の前提を
ヘッダー・フッター追加に合わせて直した**（ユーザー承認。`25995b5`）。

- **arrange**（29/29）：K13 の前に `clearSel()`。K12 の選択が残ると K13→K14 でつまみ取得が空列→クラッシュ。
- **publish**（25/25）：
  - V2＝`#sectionwrap .sec-wrap` が `[header, feature, items, footer]` になったので、特集・品を番号でなく
    `data-sec`（ID）で指すよう `sec_menu` を拡張。間のセクション数は header/footer を除いて数える。
  - **境目の＋はアプリの不具合だった（3 が正しい）**：§2.1 でヘッダー・フッターを足したとき `updateAddZones` が
    全 `.sec-wrap`（＝regions も）に＋を付けていて 5 か所になっていた。記録 12.8「一番上の上・一番下の下に＋を
    出さない」は**動かせない・消せないセクションすべて**（ヘッダー・フッター・仮の一番上/下）に当たるので、
    ＋は**動かせる特集・品の間と上下の 3 か所のみ**が正。`updateAddZones` を「そのページの動かせるセクション
    （`PG.secMapNow()[page]`＝regions を含まない）の前と、最後の下」だけに出すよう直した（併せて `pos` も
    `.sec-wrap` 通し番号でなくページの並びの番号に修正）。V2 の期待は試験台27 と同じ **3** に戻した。
    （アプリ修正＝`build.mjs updateAddZones`、試験修正＝V2 の `len(pl)==3`）
  - V15＝プレビュー比較の前に `clearSel()`。
  - photo＝（下記）。
- **photo**（26 OK／0 NG）：F12 で F_p1 がヘッダー分下へずれ（y≈1042）、押す点が 1100 窓の外でファイル選択が
  開かずクラッシュ → 押す前に F_p1 を画面の真ん中へ入れる（F11 と同じ `mouse.wheel`＋`tbh`）。外した後も入れ直す。

### 結果（playground28_single.html）
- `verify_extra_catalog` 28/28・`save` 52/52・`align` 23/23・`arrange` 29/29・`publish` 25/25・
  `photo` 26（NG0）・`text`/`width` 不合格0。
- `verify_playground` 280 OK / **17 NG**。この17は作業票の「Mac で落ちる17件」＝D系（文の一部の色・太字・IME＝
  フォント/選択に依存）と C3・C4・E1（セクション複製の描画・連動色）。**172f8fd と NG 集合が完全一致**
  （only-in-HEAD／only-in-CUR とも0）＝本作業（2b(2)＋2点修正＋試験前提の修正）での新規不合格なし。
- **注意**：`verify_extra_*` をまとめて走らせるとブラウザが `Target closed`（資源枯渇）で途中落ちすることがある＝
  1本ずつ走らせる。verify_playground は単体で走る。

## 続きのメモ（次にやること）

**いまここ：Stage 2c 完了（`0edd4a9`）まで push 済み。全スクリプト合格（verify_playground は既知 Mac17 のみ）。次は Stage 3（§2.6）。**

次セッションへ：作業票（`templates/wa-01/wa-01_layout_playground28_workorder.md`）§2.6 とこの続きのメモから Stage 3 を始める。
Stage 3 が終わったら Stage 4（verify_extra_pages.py 他）へ。各段で合格したら commit/push、区切りで止まるときはこの続きのメモを更新してから止まる。

### Stage 3 の下調べ（着手前にまとまっている材料・2026-10-12）
- **① 連動の文字とその出どころ（shop.json）**：CONTACT の各行（`_content.json` の `contact.rows`）は今は**静的テキスト**＝① と繋がっていない。§2.6 はこれを ① 連動にする。
  - addr＝`location`（format `address`）／access＝`location.access`（`access`）／parking＝`location.parking.note`（plain・ダブルクリック）／
    hours＝`hours`（`hoursShort`）／closed＝`hours`（`closedDays`）／tel＝`contact.phone`（`phone`＝display／発信は `digits`）／pay＝`payment`（`payment`）。lead は自由文（連動しない）。
  - footer：name＝`basic.name`（plain・ダブルクリック）／addr＝`location`（`addressShort`）／copy＝自由文。header：logo＝`basic.name`（plain）。
  - MENU 提供時間＝`mt_`（menus.mnu_kanmi.servingTime）／TOP I_time＝同（**今は `fmtServing` で描画済み**＝ここは箱を付けるだけ）。
- **書き方（format）は `tools/lib/format.mjs` の純関数**（`formatHoursShort`/`formatClosedDays`/`formatAddress`/`formatAddressShort`/`formatAccess`/`formatPayment`/`formatPhone` 等）。
  app.js には今 `fmtServing` だけ。§2.6 ではこれらを app.js に写して（ブラウザで動く形で）、reduce 時に ci_* 等の値を ① 由来の文字で上書きし、ci_* は箱/ダブルクリックで ① を直す形にする。
- **hours の構造**（箱の中身 DATA_SPEC 3.2）：`weekly`（曜日→status open/closed/byAppointment＋periods）・`publicHoliday`（mode asWeekday 等）・`closedRules`（nthWeekday/lastWeekday/irregular）・`exceptions`（label＋recurring/期間＋status）・`note`。
- **やることの要点**：①連動の値を ① から format で出す（連動を外す機能は今回作らない）／「そのままの値」はダブルクリックで ① を直す（電話は display＋digits、発信リンク）／
  format 値は選ぶと「◯◯を直す」をその場の箱で（営業時間・住所・行き方・支払い）／H1〜H9 を満たす。既存の save/catalog/publish を壊さないこと（contact 行の扱いを静的→①連動へ替えるので、save の round-trip 等に注意）。
- **衝突に注意（2c の教訓）**：新しい UI は **display:none で隠す**（opacity:0 だと AX ツリーに残り `get_by_role` が二重一致する）。消える UI（トースト等）は閉じたら DOM から中身を消す。

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
