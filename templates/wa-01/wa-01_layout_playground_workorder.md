# 作業票 wa-01 layout-playground（A と C を実際に触って比べるページ）

作成：Claude.ai（2026-09-23）
置き場所：`templates/wa-01/wa-01_layout_playground_workorder.md`
前提：`wa-01_layout_compare_workorder.md`・`wa-01_layout_compare2_workorder.md`・`record_wa-01_layout_compare.md`

## 0. 守ること
前2作業票の0章を引き継ぐ。加えて：
1. 配置の計算と編集の操作は `experiments/layout/a-box/` と `c-hybrid/` のコードをそのまま使う。ページ用の変更はその2ファイル内で行い、比較の試験（G1〜G3・付録B・付録C）が前回と同じ結果のままであることを確かめる
2. 方式Bは含めない
3. どちらが良いかをページに書かない

## 1. 目的
PC と iPhone で部品を実際に動かし・中身を変えて A と C の違いを触って確かめられるページ。Claude.ai 側でも `window.__playground` から自動操作して別に確かめる。

## 2. 作るもの
- 作業用 `experiments/layout/playground/`
- 渡す用 `refs/compare/layout/playground_single.html`（1ファイル）
  - 外部読み込みは Google Fonts と cdnjs の script のみ。他は埋め込み。写真は幅1200以内 JPEG(q80)。16MB未満。viewport-fit=cover。localStorage不使用。

## 3. ページでできること
方式切替(A/C・切替時は同じ操作列を相手方式でやり直す)／端末切替(PC1440/SP390・広ければ縮小)／部品ドラッグ(SPは選択→ドラッグ、非選択はスクロール妨げない)／中身変更(本文1文ずつ最大14行・見出し1/2行・品2〜6件・品1説明1/2行・見出し本文間隔16/24)／写真外す(clear)戻す(unclear)・部品消す・自動に戻す／文字を足す／試験再現(E1・E2・E4・E5・E5b・E8)／操作記録(1つ戻す・最初から)／警告(重なり・はみ出しを赤枠)／手動の印(点線枠)。品は1件ずつ動かせない旨を表示。専門語を出さない。

### 3.1 clear/unclear・E5b
写真を外すと同大の空枠が残り周りは動かない。E5b＝特集2の写真を外す→枠の位置大きさ不変(±0.5)・周り不動(±0.5)。A・Cで試験。

## 4. window.__playground
setModel/setDevice/reset/applyOps(ops)->Promise/presets()/geometry()/warnings()/ops()

## 5. 渡す前に確かめる
1. G1〜G3・付録B・C(E5b含む)が E5b 以外前回と同一
2. headless で __playground から E1/E2/E4/E5/E8 を A・C 流し込み、geometry() が比較試験の実測と±0.5一致
3. SP390 で選択ドラッグ・非選択スクロール
4. 許可外の外部読み込みが無い

## 6. 報告
git／ファイル場所と大きさ／A・Cコードの共有方法と変更箇所／書体(GF or 埋込)／5章1〜4の結果(2は試験ごと最大ずれ)／E5bの結果／所見
