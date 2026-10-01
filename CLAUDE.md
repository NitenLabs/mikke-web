# 芦屋みっけ Web制作システム（作業フォルダ）

芦屋みっけの③層（有料クライアント）向けWebサイトを、「決まった材料」と「共通のデータの形」で作る仕組み。いまは実装前の検証段階。

## 読む順番
1. `docs/DATA_SPEC.md` — データの形（確定版、schemaVersion 1）。**データについてはこれが最優先**
2. `docs/reference_analysis_guide.md` — 参考サイトの分析の手順（STEP 0〜4）と燃費のルール
3. `docs/handoff_note_web_system_01.md`・`02.md` — 編集体験と素材集めの決定事項（背景。データの形については DATA_SPEC が新しい）

ドキュメントどうしが食い違ったら、鵜呑みにせず作業前に一言確認する。

## フォルダ
- `schema/` 4層のデータの定義（JSON Schema）
- `samples/ashiyado/` 架空の和菓子店「御菓子司 芦屋堂」のデータ。検証サイトの材料
- `tools/validate.mjs` データの検査 / `tools/reflow.mjs` 伸び縮みの規則の参照実装 / `tools/ref-capture.mjs`・`ref-verify.mjs` 参考サイトの撮影・実測と照合
- `refs/<サイト>/` 撮影と実測の結果（STEP 1）
- `templates/<ID>/SPEC.md` 設計書（STEP 2）

## 準備と確認
- `npm install` → `npm run setup:browser`（撮影に使うブラウザ）
- `npm run validate` 芦屋堂のデータを検査（エラー0件が正常）
- `npm test` 伸び縮みの規則の動作確認

## 守ること
- データの形を変えたら `schema/`・`docs/DATA_SPEC.md`・`tools/validate.mjs` をそろえて直し、`npm run validate` と `npm test` を通す
- 参考サイト（Studioのテンプレートを含む）の写真・文章・固有名は成果物に使わない。色・フォント・装飾は性格を言葉にしてから値を選び直す
- 作業は手順書のSTEPごとに会話を分ける。画像は必要なものだけ開く

## コマンドの書き方（確認の手間を減らすため）

- Bash で cd を使わない。作業フォルダからの相対パスか、絶対パスで指定する
  - git は cd せず、作業フォルダでそのまま実行する（別の場所なら git -C パス）
- cd とリダイレクト（> や 2>/dev/null）や git を、&& でつないで1行にしない
- ファイルを探す・中身を検索する・読むときは、Bash の find・grep・cat ではなく、
  Glob・Grep・Read の道具を使う
- 作業フォルダの外（親フォルダなど）を見る必要があるときも、cd せずに絶対パスで指定する
