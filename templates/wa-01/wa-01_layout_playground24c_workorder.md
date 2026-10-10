# 作業票 wa-01 layout-playground 24c（保存の形の仕上げ・X37）

作成：Claude.ai（2026-10-10）
置き場所：`templates/wa-01/wa-01_layout_playground24c_workorder.md`（**このファイルが作業フォルダにない状態で始めない**。無ければ本文から作らずに止める）
前提：作業票 24・24b とその報告 `report_playground24.md`・`report_playground24b.md`（`320f223`）、`docs/DATA_SPEC.md` v4 の 4.9

---

## 0. 守ること

- 始める前に `git status` が clean でなければ止める
- 直すのは `experiments/layout/playground24/` と `playground24_single.html`（24・24b に続けて同じ試験台で直す）。試験台23 は凍結のまま
- 編集の動きは変えない（§2.3 の X37 だけは直す）
- 試験は書いてある操作どおりに行う。思ったとおりに動かない操作は、別の操作に置き換えずに止めて報告する
- 合否は決めない。判定は Claude.ai がする
- 記録・DATA_SPEC は書き換えない（記録は Claude.ai の Project のものが正）
- 終わったらコミットして **push** し、報告にコミットのハッシュを書いて止まる

---

## 1. Claude.ai の確認の結果（試験台24b・`ccbbc79`）

- 6本：保存 46・写真 26・文字 17・並べ方 29・公開 25・指 24（すべて合格）
- `verify_playground.py`（元のスクリプトの `ONLY`・`ROUNDTRIP=1` で区画ごと）：Q〜E のすべてで不合格 0。`roundTrip()` は PC・スマホで 40 回、ずれはすべて 0.00
- 24b で入れた `added.size`・`added.style`・左右の入れ替えの形（`adjust[端末][セクションID].swap: {塊: true}`）は、報告の理由どおり受け入れる。DATA_SPEC には Claude.ai が 24c の後で入れる

直すのは、下書きの見本 `draft_sample.json` で見つけた2つと、X37、試験の前提1つ。

---

## 2. 直すこと

### 2.1 保存するときは、部品 ID を全部書く（複製・足したセクションの中）

見本では、複製したセクション `sec1` の中で、指す先が素の ID のままになっている。

```
"sec1__F_b0": { "place": { "after": "F_p0", ... } }      ← sec1 の F_p0 のことだが、元の特集の F_p0 に読める
{ "id": "add_1", "anchor": "F_b0", "section": "sec1" }  ← sec1 の F_b0 のこと
"add_1": { "place": { "after": "F_b0", ... } }
```

- DATA_SPEC 4.9.3 の ID の決まり（複製・足したセクションの部品は `<セクションID>__<部品ID>`）どおり、**下書きに書くときは、部品を指す所をすべて全部の ID で書く**：`place.after`・`added[].anchor`・縦積みの並び順（`order`）の中の部品 ID・重なり順の中の部品 ID・ほかに部品を指す所があればそれも
- 開くとき（seed）に、今の内部の形（素の ID）へ戻す。内部の持ち方は変えなくてよい
- `@section`・`@abs` などの印（`prefixIds` が付け替えないもの）と、足した部品の ID（`add_*`・`addp_*`）は今のまま
- `added[].section` は、`anchor` が全部の ID になれば `anchor` から求まる。**求まるなら書かない**。`anchor` が足した部品を指していて、それをたどるのが要る場合も、たどって求める（たどれない場合があれば、その場合を報告に書いて `section` を残す）
- 確かめ方：`roundTrip()` が今までどおりずれ 0 のまま

### 2.2 空のものを書かない

- 見本の `"adjust": { "sp": {} }` のように、中身が空の入れ物は書かない（DATA_SPEC 4.9「何もしていない所は書かない」）
- `adjust`・`adjust[端末]`・`adjust[端末][部品ID]`・`content`・`textStyle`・`added`・`removed`・`_pg`・`_pg.rows` のどれも、空なら書かない。何もしていない下書きは `{template, sections, seq}` だけになるはず（`seq` も 0 なら書かない、でよい）

### 2.3 X37：甘味処の見出し・時間が書き換えられない

- 今：`I_kanmi`（甘味処の見出し）と `I_time`（提供時間）は、書き換えても画面が変わらない。試験台23 でも同じ（Claude.ai が `__playground.edit('I_kanmi', …)` で確認。直後から元の文字のまま）。`routeSetContent` がこの2つを扱っていないため
- 直す：`routeSetContent` で `I_kanmi` → 品のセクションの中身の `kanmiLabel`、`I_time` → `kanmiTime`（`b-anchor/model.mjs` で文字を取っている所に合わせる。名前が違えばそれに合わせ、報告に書く）
- 書き換え・一部の見た目・箱まるごとの見た目・「文字の見た目を元に戻す」・複製したセクションの中・保存して開き直す、が他の文字と同じに効くこと
- 保存の形：ほかの文字と同じく、テンプレートの初めの文字と違えば `content["I_kanmi"]` に書く

### 2.4 `verify_extra_save.py` を単独で走らせられるようにする

- 今：S16 などが使う試験の画像 `tools/verify-claudeai/img17/` は `verify_extra_photo.py` が作るもの（git に入っていない）。新しい環境で `verify_extra_save.py` を先に走らせると、S16 で止まる
- 直す：git に入っている `refs/compare/layout/playground24_testimg/` の画像を使う（`wide.jpg`・`tall.jpg` など）。結果の値が変わる試験があれば、前と後を報告に書く

---

## 3. 試験（`verify_extra_save.py` に足す。S1〜S21 はそのまま走らせる）

| # | 操作 | 出すもの |
|---|---|---|
| S22 | 特集を複製 → 複製した方の本文を写真の下 40 へ動かす（塊の外へ）→ 複製した方に文字を貼り付けて置く → 複製した方で縦積みの並びを変える → `draft()` | `adjust` と `added` の中で部品を指す所すべて（`sec1__` が付いているか）。元の特集の部品を指している所が無いか |
| S23 | S22 の後、開き直す | 開き直す前との位置・大きさのずれ（PC・スマホ）、`roundTrip()` |
| S24 | S22 の後、元の特集を消す → 開き直す | 複製した方の部品の位置が、消す前と同じか |
| S25 | 何もせずに `draft()`／PC だけで1つ動かして `draft()` | 下書き全体（空の入れ物が無いか。`adjust.sp` が無いか） |
| S26 | `I_kanmi` に「甘味処（季節）」と書き換え → `I_time` の一部を赤 → 開き直す | 画面の文字・`content` の中身、開き直した後も同じか |
| S27 | 品のセクションを複製 → 複製した方の `I_kanmi` を書き換える | 元の方の文字が変わっていないか、`content` のキー（`sec1__I_kanmi` の形か） |
| S28 | `I_kanmi` を太字にして「文字の見た目を元に戻す」 | 太字が消えるか |

各段で `roundTrip()` も出す（今までと同じ）。

---

## 4. 確かめること

- **新しい作業用のフォルダに clone し直した状態**で、`verify_extra_save.py` を**最初に**走らせ、S1〜S28 が止まらずに最後まで行くことを確かめる（2.4）
- その後、確認スクリプト5本を走らせ、試験台24b から増えた不合格だけ出す
- `verify_playground.py` は走らせなくてよい（Claude.ai が区画ごとに走らせる）
- 報告：`refs/compare/layout/report_playground24c.md`
  - 下書きの見本を作り直す（`playground24/draft_sample.json`。S22 の後の `draft()`）
  - 2.1 で全部の ID に直した所の一覧、`added.section` を無くせたか（無くせなかったら、その場合）
  - 2.3 で使った中身の名前
  - S1〜S28 の値、6本の結果、`pageerror`、気になったこと、コミットのハッシュ
