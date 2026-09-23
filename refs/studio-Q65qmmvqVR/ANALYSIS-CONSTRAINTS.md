# 参照元の分析の道具の制約（clone §2.1 で判明）

- 参照元 https://preview.studio.site/templates/Q65qmmvqVR は、**全面ヒーロー写真を Studio の描画層（render-canvas / StudioCanvas＝WebGL）で描いている**。
- そのため DOM には対応する `<img>`・背景 url()・`<canvas>` タグ・`<video>` が無く、`ref-mask.mjs` の DOM 置換では灰色に覆えない（カード写真＝light-DOM の `<img>` は覆える）。
- **これは「表示の仕組み（芦屋みっけ側）の限界」ではなく、「参照元を分析する道具の制約」**。clone-gaps.md には書かない。
- 対処（§2.3）：画素比較は、取得済みの幾何から写真の矩形を出し、**参照元の撮影画像と再現の撮影画像の両方に同じ #9A9A9A 矩形を塗ってから** pixelmatch にかける（`tools/clone-compare.mjs`）。両方に同じ処理＝条件がそろう。塗った矩形と塗った面積の割合を結果に記録する。
