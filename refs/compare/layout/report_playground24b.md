# 試験台24b 報告（保存の形を DATA_SPEC 4.9 に寄せる・X36）

Claude Code・2026-10-10。作業票 `templates/wa-01/wa-01_layout_playground24b_workorder.md`。
前提：作業票24 とその報告 `report_playground24.md`（`b4b1404`）、`docs/DATA_SPEC.md` v4 の 4.9。

**要点**：試験台24 で `_pg.secContent`/`_pg.adds` に逃がしていた「素の文字・写真・足した部品」を、DATA_SPEC 4.9 の形（`content[部品ID]`・`adjust[端末]`・`added[]`）に寄せた。`_pg` に残したのは **品・表の行（`_pg.rows`）だけ**（4.11④が未決のため）。あわせて X36（足した部品が矢印キーで動かない）を直した。編集の動きは X36 以外は変えていない。試験台23 は凍結のまま。

- 直した本体：`experiments/layout/playground24/app.js`・`playground24_single.html`（1.11 MB）
- 試験：`verify_extra_save.py` に S12〜S21 を追加（S1〜S11 はそのまま）
- 下書きの見本：`refs/compare/layout/playground24/draft_sample.json`（S1 相当の操作の最後の `draft()`）

---

## 1. 畳み方で冪等にする（§2.1）

試験台24 の「開き直す前後で `content[]` の出方が揺れる」問題は、**fold を「今の中身とテンプレートの初めの中身を比べ、違うものだけ `content[]` に書く」**（DATA_SPEC 4.9「テンプレートと同じ値は書かない」）に変えて解いた。`editMap`/`replaceMap` に残っているかでは決めない。

- 文字：見た目のない文字は文字列、見た目のある文字は切れ目の並び。テンプレの `heading`/`body` と違うときだけ。
- 写真：`asset` がテンプレの写真と違うときだけ。`cleared`/`bright`/`link` は今のまま（それぞれ冪等なマップから）。
- 複製・足したセクション（`sec*`）は `templateSectionContent(type)`（写真は空）と比べる。部品 ID は `sec*__素のID`。
- seed は `content[]` から文字・写真を戻す（テンプレのスライスに差分を当てる）。
- 結果：手で元どおりにした文字（S12）・テンプレの写真に戻した差し替え（S13）は `content[]` から**消える**。

---

## 2. 2.1〜2.3 で 4.9 に入れたもの／`_pg` に残したもの

### 入れたもの（4.9）
| もの | 置いた所 |
|---|---|
| 素の文字・見た目つき文字 | `content[部品ID]`（文字列 or 切れ目の並び。テンプレ差分） |
| 差し替えた写真 | `content[部品ID].asset`（テンプレ差分） |
| 明るさ・外す・部品リンク | `content[部品ID].{bright,cleared,link}` |
| 位置（塊の中/外）・大きさ・重なり順・列・見せる範囲 | `adjust[端末][部品ID].{move,place,size,z,cols,view}` |
| 縦積みの並び順 | `adjust[端末][塊ID].order` |
| 左右の入れ替え | `adjust[端末][セクションID].swap`（`{block:true}`） |
| 足した部品 | `added[]: {id,kind,placedOn,anchor,from?,section,size,style?}`＋置いた位置は `adjust[placedOn][id].place` |

- 列・見せる範囲・左右入替は、試験台24 では下書き直下にあった。**`adjust[端末]` に移した**（S15 で直下に無いことを確認）。
- 「触っていない端末には書かない」を守る（端末ごとの `move/place/size/z/order` は触った端末だけ。`cols/view/swap` は端末キー付きで触った端末のぶんだけ）。

### `_pg` に残したもの（＝4.9 に素直に入らない）
- **`_pg.rows[セクションID] = {cards?, table?}`**：品・表の行の**器ごと**（中の文字・写真 asset も含め、`content[]` と二重に持たない）。理由：4.9 は `content[部品ID]` で文字は持てるが、「どの品が何件・どの順・非文字フィールド」を持つ器が無い（**4.11④が未決**）。
- `_pg` のキーは **`rows` だけ**（S21 で S1〜S20 を通して確認＝`rows` 以外は出ない）。

### `added[]` に足したもの（§2.3・求められなかったもの）
| フィールド | なぜ added に持つか |
|---|---|
| `size: {pc:{w,h}, sp:{w,h}}` | 足したときの**端末ごとの大きさ**。コピー元（`from`）から復元する案は、**現状の add op が `from` を持たない**（貼り付けも複製も `from` を記録していない）ため不可。かつコピー元を後で編集・削除すると復元不能（作業票 2.3 の懸念どおり）→ `added.size` に持つ。 |
| `style`（`styleName` が `featBody` 以外のとき） | `kind` から一意に決まらない（貼り付けはコピー元の `styleOf` に依存）。既定 `featBody` のときは書かない。 |
| `section` | `anchor` から `secOf` で求まるが、**anchor が別の足し部品のとき連鎖で求めるのが脆い**ため `added.section` に残した（作業票「求まらない場合があれば報告」への回答）。 |

- 「元の位置に戻した足し部品は自動の位置」（旧 `placedCleared`）は、**`adjust[placedOn][id].place` を書かないことで表す**。別フィールドは足していない。seed は「place が無い足し部品」を自動扱い（`placedCleared` に入れ直す）に復元する（S19 で、戻して開き直した後に `place` が消えていることを確認）。
- `from`・`placedFollow` は保存しない。付いていく先は開くときに `place.after` から求める（§2.3・4.10）。

---

## 3. X36：矢印キーで足した部品が動く（§2.4）

- 今まで：足した部品を選んで矢印キーを押しても動かなかった（reduce が足し部品の `m2` を描画ループで消費して返すため、`nudgeSelected` が M1 として記録 → 足し部品は M1 を読まない）。
- 直した：`nudgeSelected`/`nudge` が、足した部品は **geometry から今の位置を測り、`place` の `gap`・`x` を動かす M2 として記録**（ドラッグと同じ形）。1回押すと1回の「戻す」。テンプレ部品は従来どおり M1。動く量・Shift は同じ（1px／10px）。
- S20 で、足し文字・足し写真・テンプレ見出しの3種が →×3・↓×2・Shift+↓×1 で `x+3,y+12` 動き、Cmd+Z×6 で元に戻ることを確認。

---

## 4. verify_playground.py の環境変数（§2.5）

- **`ONLY`**：`presets` を読んだ直後に、`ONLY` に書いた名前だけに絞る1行を足した（Claude.ai が区画ごとに流すのと同じ＝**実行を絞る**）。試験台24 の「出力だけ絞る（`_included`）」はやめ、Q・R・T・V 等の直書き試験は区画を絞っても走って出力する。
- **`ROUNDTRIP=1`**：`Y1`・`Z1`・`P1`・`U1`・`J1`・`D1`・`C1` の各区画の前と、`R3` の前、`Q/R` の後、最後の計9か所で `roundTrip()` を呼び PC/スマホのずれを出す。`draft()` が無い試験台では何もしない。
- どちらも無ければ従来どおり。編集の動きを確かめている所は触っていない。

---

## 5. 試験 S1〜S21（`verify_extra_save.py`）

**合計 46 / 46（不合格 0。S10 は値のみ）。** 各段で `roundTrip()` も出す（PC/スマホとも maxPos=maxSize=0.00）。

| # | 結果 | 値 |
|---|---|---|
| S1〜S11 | OK | 試験台24 と同じ（全 op 種別の roundTrip 0.00／開き直し一致／§2.7／新ID／状態の文字／写真の入れ物GC／版→下書き／戻す2回／最近使った色／大きさ比べ／23の文脈） |
| S10 | 値のみ | **pg24 `draft`=986 bytes / pg23 `{ops,assets}`=3317 bytes（pg24 は 29%）**。テンプレ差分で 24（1562B）よりさらに小さい |
| S12 | OK | 本文書き換え→content に `F_b0` 出る→開き直し後も出る→**元の文字に戻すと消える** |
| S13 | OK | 写真差し替え→`content[F_p0].asset`→開き直し後も→**テンプレ写真に戻すと消える** |
| S14 | OK | 特集複製→複製側の編集は `sec1__F_b0` 等のキー・**元の特集の content は増えない** |
| S15 | OK | 列→`adjust.pc.I_cards.cols=3`・見せる範囲→`adjust.sp.F_p0.view`・左右入替→`adjust.pc.feature.swap`・**下書き直下に cols/view/swap 無し** |
| S16 | OK | PC で写真を足して置く→SP で見せる範囲→`added[]`＋`adjust.sp[id].view`・**開き直しても SP の位置・大きさが同じ** |
| S17 | OK | テンプレ写真の大きさを変えても、足した写真の大きさは**変わらない**（独立＝今の動き） |
| S18 | OK | テンプレ写真を消して開き直しても、足した写真は**出る**（独立） |
| S19 | OK | 足した写真を動かす→元の位置に戻す→開き直し後 `adjust.pc[id]` に `place` が**無い**（自動の位置） |
| S20 | OK | 矢印キーで足し文字・足し写真・見出しが動く（X36）・Cmd+Z×6 で戻る |
| S21 | OK | `_pg` のキーは S1〜S20 を通して **`rows` だけ** |

- 下書きの見本：`playground24/draft_sample.json`（S1 相当の操作＋特集複製の後の `draft()`）。

## 6. 6本の確認スクリプト（試験台24 から増えた不合格だけ）

Mac で playground24_single.html に対して実行。**試験台24 から増えた不合格：0 件。**

| スクリプト | 結果 |
|---|---|
| verify_extra_save（S1〜S21） | 46 / 46（NG 0） |
| verify_extra_photo | OK=26 NG=0 |
| verify_extra_text | OK=17 NG=0 |
| verify_extra_arrange | 29 / 29 |
| verify_extra_publish | 25 / 25 |
| verify_touch | 24 / 24 |

- 1回目の実行で text/arrange/publish が `Page.goto`/`screenshot` の**タイムアウト**で途中終了した（Google Fonts の読み込み待ちで `load` イベントが30秒出なかった。`FONT_LINK` が外部フォント＝記録どおり「Claude.ai では Google Fonts が読めない」と同性質の環境要因）。**個別に再実行して全数合格**（arrange が最初の `goto` で落ちていた＝編集ロジック以前の問題＝24b の変更とは無関係）。
- （`verify_playground.py` は作業票どおり走らせていない。`ONLY`/`ROUNDTRIP` を §4 のとおり足した。）

## 7. pageerror・気になったこと

- S1〜S21・5本とも `pageerror` 無し。
- **`I_kanmi`/`I_time` は `isText` だが `routeSetContent` が扱わず、編集が `secContent` に焼けない**（試験台23 以前からの潜在不整合）。よって `content[]` 差分でも拾えない＝これらの文字編集は現状でも開き直しで残らない。§0「編集の動きは変えない」に従い**未修正**（直すなら `routeSetContent` に `I_kanmi→kanmiLabel`・`I_time→kanmiTime` を足す小修整。Claude.ai の判断に委ねる）。
- `adjust[端末]` は FLAT（`adjust[端末][部品ID].{move/place/size/z/cols/view}`、縦積みの並びは塊キーに `.order`、左右入替はセクションキーに `.swap:{block:true}`）。4.9.1 の記述とおおむね一致。`swap` の鍵は「塊ID」でなくセクションID にした（1セクションに複数ブロックの入替があり得るため `{block:true}` でまとめる）。
- `content[]` は特集ブロック（`F_h{i}/F_b{i}/F_p{i}`）と足した部品だけが対象。セクション見出し・ラベル・`pill` は編集対象でないので差分に出ない。

## 8. コミット

- `320f223` 試験台24b：保存の形を DATA_SPEC 4.9 に寄せる（content[] 差分・adjust[端末]・added[]）＋X36
- （前段）作業票 playground24b を templates/wa-01/ に配置（置き場所違いの親ルートから移動）
