# 作業票 wa-01 layout-playground 20（並び：列の数と幅・重ねる・左右の入れ替え／X23・X24 の直し）

作成：Claude.ai（2026-10-06）
置き場所：`templates/wa-01/wa-01_layout_playground20_workorder.md`（**このファイルが作業フォルダにない状態で始めない**）
前提：`wa-01_layout_playground19b_workorder.md`（以下「前の作業票」）と、その前提の作業票すべて

（本文は会話で渡された作業票 wa-01 layout-playground 20 のとおり。
1 品の並びの「列 ▾」（PC 2/3/4・SP 1/2）、2 品の並び・表の左右の辺のつまみ（幅）、
3 縦積みで他の部品の上に落としたら重なる（2.6③ を M2 に変更）、4 横並びの組の「左右を入れ替える」、
5 X23（その他 ▾ の中のリンク/名前表示/区切り/並び順）・X24（すっぽり覆う重なりの数え方）の直し。
試験 L1〜L24。proposal 画像は未配置＝テキストから起こす。）

---

## §9 完了報告（2026-10-06）

### git の状態
- 新規：`experiments/layout/playground20/`（前の playground19b を土台に、app.js・build.mjs・index.html・各 _verify＋新規 _verify_l20.mjs/.json・testimg/ を同梱）。
- 共有エンジン `experiments/layout/c3-edit/model.mjs` は**今回の作業票では触っていない**（1〜5 の実装はすべて playground20/app.js・build.mjs 側）。model.mjs は前作業からの未コミット変更のまま（下の G1〜G3 の所見を参照）。
- テスト出力の baseline（c3-edit/_verify_c2.json・playground19b/_verify_s16.json）は、回帰確認で再生成されたが**コミット前に HEAD へ戻した**（勝手に上書きしない）。

### 1〜5 をどう作ったか
1. **列 ▾（2.2）**：品の並び（I_cards）選択時だけツールバーに「列 ▾」（明るさ ▾ と同じ場所＝`cardsTools`）。PC 2/3/4・SP 1/2 を `COL_CHOICES`、1件120px未満は押せない（`colEnabled`）。乗せている間だけ仮表示（`setColsPreview`／記録しない）。`cols` op を reduce の `colsMap[id][device]` に積む。幅が狭く入らなければ X23 の仕組みで「その他 ▾」へ畳む。
2. **幅のつまみ（3）**：`resizableKind` が I_cards→"cards"／I_table→"table" を返し、`handlesFor` が ["e","w"]。最小幅＝カードは 120×列＋隙間、表は PC528／SP200（`minWidthOf`）。幅は `sizes[id].w` に積み、1件幅・名前/価格の右端そろえは model.mjs 側が既存の比率で追従（エンジンは不変＝幅だけ `wOf()` で差し替え）。
3. **重ねる（4／2.6③ の変更）**：`reorderPreview` を「隙間の帯（±12）」方式に作り替え。子の箱の深い所＝帯の外→ `null`（並び替えでない）。`classify`/`endDrag` に③の上書き＝自分以外の子の箱の上に落ちた（`droppedOnChild`）ら M2（anchor＝落とした先・`overlapAnchor`）。並び替えの帯は±12 に広げ、`data-drop-line`／`dropTarget()` を用意。
4. **左右を入れ替える（5）**：2子の横並びの組（PC 特集ブロック）だけ fmenu に項目。位置を鏡像化（新しい左＝ページ幅−今の右）。PC 限定（`canSwap`）。
5. **X23**：その他 ▾ の中身を名前つき（`data-more-name`＋::after）・区切りの先頭末尾/連続を掃除（`cleanupDividers`）・PC→スマホ順（`TB_ORDER`）・リンク等が畳まれても `tsEl` が null を返さないよう `#tstools` 前置を外した。**X24**：`warnings()` が「すっぽり覆う重なり」を、どちらかが手で触られている（動かした/大きさ変え/足した）ときは `ownerOverlaps` に数える。

### 2.2.10／5.2.3「元の位置に戻す」の挙動
- `partChangedFromTemplate` に `colsMap`／`swapMap` の判定を追加。**列だけ変えた／左右だけ入れ替えた部品**でも「元の位置に戻す」が出る（L11＝ページ全体の戻しで列も幅も戻る、L4＝列の戻す/やり直す、L18＝入替の戻す）。部品単位の戻しは `colsMap[id]`／`swapMap[secOf(id)]` を消す。

### L1〜L24 結果（本物のマウス／キーボード／指。PC 1440×1100・SP／窓幅／指は別途）
| | | | |
|---|---|---|---|
| L1 OK 列▾は品の並び全体のときだけ | L2 OK 見本2/3/4・仮表示は残らない | L3 OK PC2列=651・段間64 | L4 OK 列の戻す/やり直す |
| L5 OK SP2列=163.5・段間40 | L6 OK 品名の辺は1件幅で止まる | L7 OK 幅968・3列・1件306.67 | L8 OK 最小幅で止まる(408) |
| L9 OK 狭めると4列が押せない | L10 OK 表720・右端そろえ | L11 OK ページ戻しで列/幅戻る | L12 OK 箱に落として重なる(M2/F_p0) |
| L13 OK 帯の中で並び替え(M2でない) | L14 OK drop-lineは帯で見え深所で消える | L15 OK 左右入替(136/779) | L16 OK 入替は横並びの組だけ |
| L17 OK 位置が左右反転 | L18 OK 入替を戻す | L19 OK 既定は重なり0 | L20 OK 幅520/500/400 でリンクが その他 |
| L21 OK その他=名前つき・44px・順・区切り | L22 OK 幅500 で列を その他/バー | L23 OK スマホ長押しの箱に列・44px・適用 | L24 OK スマホで辺のつまみ=幅縮む(200で止まる) |

- **L23/L24 の指の操作**は、CDP の端末px とレイアウトpx（innerWidth=399）のズレを避けるため、`getBoundingClientRect` と同じ座標系で合成 PointerEvent（pointerType:"touch"）を送って再現（ボタンは click も補う）。長押し＝touch down→650ms→up（LP_MS=500）。縦に長い I_cards/I_table は箱/つまみが画面外に出るので、スクロール（syncOverlays が箱を追従）で見える範囲へ寄せてから操作。

### §4.7 ③前提の試験で結果が変わったもの（前→今）
- **回帰（playground19b の全 _verify）：9本中8本が19bと完全一致**（q・p・u・d・k・l・o・s16）。差が出たのは **_verify_j の1行のみ**。
  - **J9-sp：`ownerOverlaps` 2→3**。原因は **X24**（甘味処見出しを表の中へ重ね＋大きさ変えで手触り→「すっぽり覆う重なり」を ownerOverlaps に数えるようになった。J9-pc は19bの時点で既に3）。overlaps空・hasOwnerKanmi・表を押し下げない等の実質判定は不変、suite は exit 0。
- **③関係で結果が変わった試験は無し**（③の帯方式を入れた後、V1-sp が一時 M2→並び替え に振れたが、`reorderPreview` の「塊の外（±12）は並び替えでない→M2」ガードを戻して **V1-sp＝M2（anchor F_b0）に復帰**＝19bと一致）。③と無関係に壊れたものは無し。

### G1〜G3（±0.5）
- **G1（芦屋堂＝既定内容）：全項目 md=0**／**G2（clone 参照元）：全項目 ±0.5**／**G3（3エンジン×幅・既定内容）：全 PASS（重0・出0・エンジン差 0.02/0.28/0.05/0.12px）**。**既定内容の出力は不変**。
- 唯一の不一致：**付録B S4-pc（4枚目の桜餅カードを足して2段目ができる筋）で md=64**。これは**前作業の per-row グリッド化（段間64を明示：L3/L5 が正とする挙動）**による新エンジンと旧 c-hybrid エンジンの差＝ちょうど段間64px。**既定内容（3枚=1段）には出ず、今回の作業票（app.js/build.mjs）とも無関係**。コミット済み baseline は md=0 で、未コミットの model.mjs でのみ 64＝前作業の未コミット分の所見として記録（この作業票では直さない）。

### single.html のサイズ
- `refs/compare/layout/playground20_single.html` = **1,073,658 バイト（約1.02MB）**。

### 本線（mainline）
- `npm test`：**fail 0**（reflow/format/metacheck 全通）。`npm run validate`：**エラー0件**（警告1件＝オーナーへの質問2件という既存の警告で、今回の変更と無関係）。

### 所見
- ③の「子の箱に落とす→重なる」は、`reorderPreview` の帯の内外判定が肝。帯を無制限に広げると塊の外まで並び替え扱いになり V1-sp 等が M2→並び替えに化ける＝±12 で塊の内外を切ることで④（塊の外＝M2）と両立。
- 指の試験は CDP 座標系のズレ（innerWidth=399）が落とし穴。合成 PointerEvent を getBoundingClientRect と同座標系で送るのが確実。
- G1〜G3 の S4-pc=64 は前作業の未コミット engine 変更に由来。コミット方針（model.mjs を含めるか）は要確認＝この作業票では playground20 のみをコミット対象にした。
