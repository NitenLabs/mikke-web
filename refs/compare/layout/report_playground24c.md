# 試験台24c 報告（保存の形の仕上げ・X37）

Claude Code・2026-10-10。作業票 `templates/wa-01/wa-01_layout_playground24c_workorder.md`。
前提：作業票24・24b とその報告（`320f223`）、`docs/DATA_SPEC.md` v4 の 4.9。

**要点**：24b の下書きの見本で見つかった2点（複製セクションの参照が素の ID のまま／空の入れ物を書いていた）を直し、X37（甘味処の見出し・提供時間が書き換えられない）を直した。あわせて `verify_extra_save.py` を git 追跡の画像で単独実行できるようにした。編集の動きは X37 以外は変えていない。試験台23 は凍結のまま。

- 直した本体：`experiments/layout/playground24/app.js`・`playground24_single.html`（1.11 MB）
- 試験：`verify_extra_save.py` に S22〜S28 を追加（S1〜S21 はそのまま）＝**合計 53／53（不合格0）**
- 下書きの見本：`refs/compare/layout/playground24/draft_sample.json`（S22 の後の `draft()`）

---

## 1. §2.1 複製・足したセクションの参照を全部の ID で書く

内部は素の ID（`F_p0` 等、セクション相対）のまま。**下書きに書き出すときだけ全部の ID（`sec*__…`）にし、開くとき（seed）に素の ID へ戻す**（4.9.3 の ID の決まり）。`@section`・`@abs` と足した部品の ID（`add_*`/`addp_*`）はそのまま。

全部の ID に直した「部品を指す所」の一覧：

| 指す所 | 直し方 |
|---|---|
| `adjust[端末][部品ID].place.after`（塊の外の付いていく先） | fold で `pfxRef(after, secOf(部品ID))`、seed で `bareOf(after)` |
| `added[].anchor`（足した部品の付いていく先） | fold で `pfxRef(anchor, その足し部品の section)`、seed で `bareOf(anchor)` |
| `adjust[端末][部品ID].place.after`（足した部品の置いた位置） | 同上（`pfxRef(anchor, section)`） |
| 縦積みの並び順 `adjust[端末][塊ID].order` の子 | **内部で既に全部の ID**（`reorderClusterOf` が `sec*__…` を返す）＝変更不要。塊 ID 自体も `sec*__Ftg1` |
| 重なり順 `z` | 部品ごとの値で、中に部品 ID を持たない＝対象なし |

- **`added[].section` は無くせた**：`anchor` が全部の ID になったので、開くとき `anchor` から求める（`sec*__F_b0` → `sec1`、`F_b0` → `feature`）。見本でも `added[].section` は消えている。
  - **例外（残した場合）**：`anchor` が別の足した部品（`add_*`）を指すときだけ `section` を残す。足した部品の連鎖を seed 中にたどるのは可能だが、たどり切れない並び（まだ読んでいない足し部品を指す等）があり得るため、安全側に倒して `section` を残す。実データ（S22）では anchor がテンプレ部品なので section は無くなっている。
- 確かめ：`roundTrip()` は S1〜S28 のすべてで PC・スマホともずれ 0.00。S22 で参照がすべて `sec1__…`・素の特集の部品を指す所が無いことを確認。

## 2. §2.2 空の入れ物を書かない

- `content`・`added`・`removed`・`textStyle`・`adjust`・`adjust[端末]`・`_pg`・`_pg.rows`・`seq`（`sec`も`add`も0のとき）は、空なら書かない。
- `_pg.rows` は、品・表の行が**テンプレの初めと同じなら書かない**（差分のときだけ器ごと持つ）。
- 何もしていない下書きは **`{template, sections}` だけ**（S25 で確認）。PC だけで1つ動かすと `adjust.pc` だけ出て `adjust.sp` は出ない。

## 3. §2.3 X37：甘味処の見出し・提供時間

- 原因：`routeSetContent` が `I_kanmi`/`I_time` を扱っていなかった（試験台23 以前からの潜在不整合。24b 報告 §7 で指摘）。
- 直し：`routeSetContent` に **`I_kanmi` → 品のセクションの `kanmiLabel`**、**`I_time` → `kanmiTime`** を足した（`b-anchor/model.mjs` が文字を取っている名前に合わせた）。
- content[] 差分でも、`kanmiLabel`/`kanmiTime` がテンプレの初めの文字と違えば `content["I_kanmi"]`／`content["I_time"]` に書く（ほかの文字と同じ）。
- 確認：書き換え（S26）・一部の見た目（S26 で `I_time` 一部赤）・箱まるごとの見た目と「元に戻す」（S28）・複製したセクションの中（S27＝`sec1__I_kanmi`・元は変わらない）・保存して開き直す（S26）が、他の文字と同じに効く。

## 4. §2.4 `verify_extra_save.py` を単独で走らせられるように

- 画像の置き場を、`verify_extra_photo.py` が作る未追跡の `img17/` から、**git 追跡の `refs/compare/layout/playground24_testimg/`**（`wide.jpg`・`tall.jpg` など）に変えた。無ければ従来の `img17/` に後方互換で戻る。
- `wide.jpg`・`tall.jpg` は img17 と同じ画像なので**結果は変わらない**（S6 の写真の入れ物の鍵数・S16 等の関係はそのまま。絶対座標は画像が同じなので変化なし）。
- 新しい作業フォルダに clone し直した状態で `verify_extra_save.py` を**最初に**走らせ、S1〜S28 が止まらず最後まで通ることを確認（§6）。

---

## 5. 試験 S1〜S28（`verify_extra_save.py`）

**合計 53／53（不合格 0。S10 は値のみ）。** 各段で `roundTrip()` も出す（PC/スマホとも maxPos=maxSize=0.00）。S1〜S21 は 24・24b と同じ。S22〜S28：

| # | 結果 | 値 |
|---|---|---|
| S22 | OK | 特集を複製→塊の外へ移動・文字貼り付け・並び替え→`draft()` の参照がすべて `sec1__…`（`place.after=sec1__F_p0`・`add_1.anchor=sec1__F_b0`・`order=[sec1__F_b1,sec1__F_h1]`）・素の特集を指す所なし |
| S23 | OK | S22 の後で開き直す→位置・大きさのずれ PC=0.00 SP=0.00・roundTrip 一致 |
| S24 | OK | S22 の後で元の特集を消す→開き直す→複製側の部品の位置が消す前と同じ |
| S25 | OK | 何もしない `draft()`=`{template, sections}` だけ／PC だけ1つ動かすと `adjust.pc` だけ（`adjust.sp` 無し） |
| S26 | OK | `I_kanmi` を「甘味処（季節）」に・`I_time` の一部を赤→開き直し後も画面・`content` が同じ（X37） |
| S27 | OK | 品のセクションを複製→複製側の `I_kanmi` 書き換え→`content` のキーは `sec1__I_kanmi`・元の `I_kanmi` は `content` に出ない（変えていない） |
| S28 | OK | `I_kanmi` を太字→「文字の見た目を元に戻す」→太字が消える（`textStyle` から `I_kanmi` が消える） |

- 下書きの見本：`playground24/draft_sample.json`（S22 の後）。参照はすべて `sec1__…`、`added[].section` 無し、空の入れ物無し。

## 6. 6本の確認スクリプト（試験台24b から増えた不合格だけ）＋単独実行

- **単独実行（§2.4）**：（6節末に記載）
- **5本（試験台24b から増えた不合格）**：

| スクリプト | 結果 |
|---|---|
| verify_extra_save（S1〜S28） | 53 / 53（NG 0） |
| verify_extra_photo | OK=26 NG=0 |
| verify_extra_text | OK=17 NG=0 |
| verify_extra_arrange | 29 / 29 |
| verify_extra_publish | 25 / 25 |
| verify_touch | 24 / 24 |

（`verify_playground.py` は作業票どおり走らせていない。）

## 7. pageerror・気になったこと

- S1〜S28・5本とも `pageerror` 無し。
- 元の特集（アンカーのセクション feature）を消すと、`reduce`/描画が前提にする `content.feature`/`content.items` が `undefined` になり得た（S24 で露見）。**seed で `secContent` を必ず feature/items 付きで初期化**して直した（元の reduce が常に両方を持っていたのに合わせた）。これは 24b からの潜在不具合で、S24 で初めて踏んだ。
- `_pg.rows` は「テンプレの初めと違うときだけ・器ごと」。品・表の行の中の文字・写真 asset も rows に入る（`content[]` と二重に持たない）。4.11④が決まれば 4.9 に移せる。

## 8. コミット

（この報告の最後に追記）
