# 試験台24 報告（保存を「今の形」に変える）

Claude Code・2026-10-09。作業票 `templates/wa-01/wa-01_layout_playground24_workorder.md`。
前提：`docs/DATA_SPEC.md` v4（`d366dff`）4.9・4.10・5.2・6章、記録 10.1・15章。試験台23 は触っていない。

**要点**：保存の対象を「操作の記録の列（ops）」から「今の形（4.9 の下書き＋_pg）」に変えた。編集の動き（reduce の op 畳み込み・undo/redo・描画）は変えていない。変えたのは「何を保存するか」と「開いたとき何から描くか」だけ。`reduce` は `state.base`（今の形）から**種まき（seed）**してから、その場の `ops` を畳む。保存・版・「公開中と同じか」・`draft()`/`roundTrip()` は、PC・スマホ両方で畳んで1つの下書きにまとめる**fold** を使う。

- 出力：`refs/compare/layout/playground24_single.html`（1.10 MB）／試験画像 `playground24_testimg/`
- IndexedDB 名：`mikke-playground24`（試験台23 の保存は読まない・変換もしない）
- 新しい試験：`tools/verify-claudeai/verify_extra_save.py`（S1〜S11）

---

## 1. seed / fold / 土台（§2.1）

- 状態に **`state.base`**（4.9 の下書き。`null`＝最初の形＝テンプレートのまま）を持つ。`ops`・`cursor`・`undoBase` は土台の後の操作だけ（画面を開いている間だけ）。
- **seed**（`seedFromBase(base, device)`）：4.9 の下書きを reduce の入れ物（`m1`/`m2`/`order`/`zmap`/`sizes`/`colsMap`/`swapMap`/`viewAll`/`textStyles`/`runsMap`/`editMap`/`replaceMap`/`clearL`/`brightMap`/`linkMap`/`adds`/`removed`/`secList`/`secContent`/`placedFollow`）に流し込む。`reduce` 冒頭でこれを呼び、以降の op 畳み込みは試験台23 と**同一コード**。
- **fold**（`foldToDraft()`）：`reduce(ops,'pc')` と `reduce(ops,'sp')` を回し、1つの下書きにまとめる。足した部品の端末ごとの「置いた位置」は `adjust[端末].m2` に焼き込む（自動の位置の端末は焼き込まず、`_pg.placedFollow`＋`_pg.adds` から再計算）。
- 「同じ中身なら同じ文字列」：`canonJSON()`（キーを並べる・`undefined` を落とす・`_pg` も含める）で比べる。`recentColors` は下書きに入れないので比べに効かない。

---

## 2. 2.2 の実際の対応表（reduce の入れ物 → 下書き）

| reduce の入れ物 | 下書きのどこに入れたか | 冪等性のための注記 |
|---|---|---|
| `secList` | `sections: [{id,type,from?}]` | feature/items は `from` を書かない |
| `runsMap`（見た目つき文字） | `content[部品ID]`＝切れ目の並び | seed で `content[]` の配列から戻す |
| `brightMap` | `content[部品ID].bright` | seed で戻す |
| `clearL`（外した写真） | `content[部品ID].cleared` | seed で戻す |
| `linkMap`（部品まるごとのリンク） | `content[部品ID].link` | seed で戻す |
| `m1`/`m2`/`order`/`zmap`/`sizes` | `adjust[端末].{m1,m2,order,zmap,sizes}` | 端末ごと（reduce が op.device で絞る入れ物） |
| `colsMap`/`viewAll`/`swapMap` | `cols`/`view`/`swap`（端末共通の直下） | 下記 §2.1 注記 |
| `textStyles` | `textStyle`（weight/color/font 共通・size は {pc,sp}） | |
| 連番 | `seq: {sec, add}` | `state.secSeq`/`addSeq` から |
| テンプレート | `template: {name:"wa-01", version:1}` | |
| `removed`（消した印） | `removed: [id...]` | テンプレ部品＋消した足し部品＋消した品/行の id を全部 |

### 2.1 `_pg` に入れたもの（なぜ 4.9 に入らないか）

Claude.ai の判断のための一覧。**4.9 に素直に入らない＝冪等な突合が壊れる／4.11 ④が未決**のものを `_pg` に置いた。`roundTrip()` は 4.9 と `_pg` の両方から描いて一致を確認している（S1 で全 op 種別 maxPos=maxSize=0.00）。

1. **`_pg.secContent`（各セクションの中身スライスまるごと）**＝**この版の構造・素の文字・写真 asset の正**。理由：
   - **素の（見た目のない）文字**と**写真の asset（差し替え含む）**を `content[]` に入れると、開き直し後は `editMap`/`replaceMap` が空（土台に焼き込み済み）になり、同じ操作でも `content[]` に出たり出なかったりして `canonJSON` が揺れる（＝「公開中と同じか」の判定が壊れる）。そこで素の文字・asset は `_pg.secContent` を正とし、`content[]` には**冪等に再現できるもの（見た目つき文字・明るさ・外す・部品リンク）だけ**を入れた。
   - **繰り返す部品（品 cards・表 table）の構造と並び**＝4.9 は `content[部品ID]` で文字は持てるが、「どの品が何件・どの順・非文字フィールド」を持つ器が無い（4.11 ④が未決）。
   - **複製・追加したセクション（sec*）の中身スライス**＝同上。
2. **`_pg.adds`（足した部品の add オブジェクトまるごと）**＝`wOther`・`hOther`・`styleName`・`placed`・`gap`・`gapOther`・`x`・`placedDevice`・`asset`・`section`・焼き込んだ `text`。4.9 の `added` は `{id,kind,from?,placedOn,anchor}` だけなので、端末ごとの幅/高さ・置き方・コピー元の端末などがここに入らない。
3. **`_pg.placedFollow`**＝足した部品を「置いた端末」で動かしたときの付いていく先。もう一方（自動）の端末の位置計算に要る（4.10「足した部品の、もう一方の端末での位置」の実装）。

### 2.2 4.9 との小さなずれ（構造）
- `cols`/`view`/`swap` は 4.9.1 では `adjust[端末][部品ID]` の下だが、reduce 内部は端末キー付きマップ（`{id:{pc,sp}}` 等）なので、**下書きでも端末共通の直下キー**に置いた。意味は同じ（描画は現端末ぶんを引く）。4.9 の構造に厳密に合わせるなら `adjust` 配下へ移せるが、`view`/`cols`/`swap` は「触った端末だけ・もう一方は引き継ぎ/無し」の性質上、端末共通で持つほうが素直。Claude.ai の判断に委ねる。
- `op.t === "template"`（`tpl`）＝どこからも積まれていない。**捨てた**（下書きに持たない。`reduce` 内の `tpl` は常に空のまま builder に渡るだけ＝効果なし）。

---

## 3. 2.7 の一覧（記録の列をさかのぼる所／土台にある部品への対応）

| app.js の場所 | 中身 | 土台の部品への対応 |
|---|---|---|
| `secOf`（32行付近） | 足した部品のセクションを `add` op から探す | **直した**：`add` op が記録の列に無ければ `state.base._pg.adds` から探す。S3 で `secOf('addp_91')=items`・`secOf('add_90')=feature`（開き直し後＝土台にある足し部品）を確認。 |
| 押し下げ `pushDownClear`（1501行付近） | 前の `move`/`add` op の gap を書き換える | **直さず**。呼ばれるのは貼り付け・複製の直後（`resolveBothDevices`）＝その場で足した部品だけ＝add op は必ず記録の列にある。土台の部品には到達しない（押し下げ済みの gap は fold で `adjust`/`_pg.adds` に焼き込み済み）。 |
| 書き換え確定 `commitEdit`（1646行付近） | 足したばかりの文字を add op に焼き込む／空なら取り消す | **直さず**。この経路は `state.pendingNewText===id`（＝今セッションで足した文字）のときだけ。土台の足し文字の書き換えは `wasNew=false`＝ふつうの `edit` op として記録される（作業票どおり）。S3 で `add_90`（土台）の書き換えが効くことを確認。 |
| 置き直し `finalizeAddedAt`（1802行付近） | 置いた直後に add op を書き換える | **直さず**。写真/文字を足した直後にだけ呼ばれる＝add op は記録の列にある。土台の部品には到達しない。 |

ほかに記録の列をさかのぼる所：`nudge`/`copySelection`/`duplicateCard`/`zOrderList` 等は `reduce(activeOps())` の結果（＝土台から種まき済み）を見るので、土台の部品にもそのまま効く（追加対応不要）。

> 注意（報告すべき挙動）：`nudge`（矢印キー相当）は足した部品（`m2` で置いた写真等）には効かない。reduce が足し部品の `m2` を描画ループ内で消費してから返すため、`nudge` が `R.m2[id]` を見つけられず M1 として記録するが、足し部品の描画は `m2`/`placed` で決まり M1 を読まない。**これは試験台23 以前からの挙動で、試験台24 の変更ではない**（実 UI の移動はドラッグ＝直接 `move` op なので問題にならない）。S3 の写真移動はドラッグで確認した。

---

## 4. 記録（record_layer3_editing_rules.md）との照合で気づいた点

- 作業票が参照する **記録 10.6 / 10.7 は record 本文に無い**（record には 10.1〜10.5 のみ）。意図（「戻すの記録は保存しない・開き直したら空から」「開いた直後の戻すは何もしない」）は 4.10・6章・10.1 から明確なので、その線で実装した（S2 で「開き直し後 ops 空・直後の Cmd+Z は無変化」を確認）。record 側に 10.6/10.7 を起こすかは Claude.ai に委ねる。

---

## 5. 試験 S1〜S11（`verify_extra_save.py`）

**合計 36 / 36（不合格 0。S10 は値のみ）。** 各段の値：

| # | 結果 | 値 |
|---|---|---|
| S1 | OK（全 op 種別） | 同じ塊で動かす/塊の外へ/並べ替え/左右入替/大きさ/重なり順/列/見せる範囲/差し替え/外す/戻す/明るさ/本文書き換え/一部装飾(太字赤大書体リンク)/箱まるごとPC/箱まるごとSP/見た目を戻す/部品リンク/貼り付け文字/貼り付け写真/足した部品を動かす/セクション追加/複製/移動/品の複製/品の削除 — **各段 roundTrip maxPos=maxSize=0.00・片方のみ無し**。まとめ最大ずれ=0.00 |
| S2 | OK | 開き直し：ops=0（空）・`draft()` 一致=True・最大ずれ PC=0.00 SP=0.00・直後の Cmd+Z は無変化 |
| S3 | OK | 土台の足し写真をドラッグで動かせた・土台の足し文字を書き換えられた・`secOf` が正しい（items/feature）・roundTrip 一致 |
| S4 | OK | セクション2つ追加(sec1,sec2)→sec2 削除→開き直し→追加＝**sec3**（sec2 を使い回さない） |
| S5 | OK | 公開→本文に「あ」→「まだ公開していない変更があります」→手で「あ」を消す→**「公開中と同じです」**（直してから元どおりで一致） |
| S6 | OK | 写真の入れ物：公開1=鍵1・公開2=鍵2・未公開で3枚目=鍵3・**未公開を消す=鍵2**（5.2 の GC で使われない写真が消える）・同一画像の重複 data=0 |
| S7 | OK | 一番古い公開版（写真1枚）を「この版を下書きにする」→開き直し：写真が出る・**戻す前の下書き(beforeRestore)が残る**・状態=「まだ公開していない変更があります」 |
| S8 | OK | 「この版を下書きにする」→Cmd+Z で**置き換える前の下書きに戻る**→もう1回 Cmd+Z で**その前の操作が戻る** |
| S9 | OK | その他の色を選ぶ→`recentColors=['#123456']`→開き直し後も保持→**新しい文脈では空**。色の選択だけでは状態の文字は変わらない（下書き・比べ対象に入れない） |
| S10 | 値のみ | **pg24 `draft`=1562 bytes / pg23 `{ops,assets}`=3317 bytes（pg24 は 47%）**。200字を少しずつ打つ（多数の edit op）とき、今の形を持つ pg24 のほうが小さい |
| S11 | OK | 試験台23 を直した文脈（`mikke-playground22` に保存）で試験台24 を開く→**初めの形（ops 空・並び feature/items）**・`pageerror` 無し（試験台23 の保存を読まないため） |

---

## 6. 直した確かめ（5本のうち）

- **`verify_extra_publish.py` V8「直して開き直す」**：`len(o1)==len(o2)`（開き直し後も ops が同じ長さ＝ops を保存する前提）を、**「開き直し後 `ops()` が空 かつ `draft()` が前と同じ」**に変えた（作業票 §4 で明示された1件）。ほかに op 列の長さや中身を前提にした合否は見当たらなかった（`ops()` を値として出すだけの所は触っていない）。編集の動きを確かめている所は直していない。

## 7. 5本の確認スクリプト（photo・text・arrange・publish・touch）

Mac で playground24_single.html に対して実行。**試験台23 から増えた不合格：0 件。**

| スクリプト | 結果 |
|---|---|
| verify_extra_photo | OK=26 NG=0 |
| verify_extra_text | OK=17 NG=0 |
| verify_extra_arrange | 29 / 29 |
| verify_extra_publish | 25 / 25（V8 は §6 のとおり試験台24 向けに更新） |
| verify_touch | 24 / 24 |

（`verify_playground.py` は作業票どおり走らせていない。環境変数 `ONLY`/`ROUNDTRIP` を足した＝§8。）

## 8. verify_playground.py に足した環境変数

- **`ONLY=Y1,P1,J1,D1,C1`**：記録・表示する区画を、試験名の先頭文字（区画の頭文字）で絞る。無ければ全部（従来どおり）。※monolith なので実行自体は通し、**出力を絞る**実装。実行自体をスキップするには区画ごとの関数分割が要る（作業票の「編集の動きを確かめている所は直さない」に触れるため見送り。Claude.ai の判断に委ねる）。
- **`ROUNDTRIP=1`**：区画の切れ目（今は `Q/R` の後・最後）で `roundTrip()` を呼び PC/スマホのずれを出す。`draft()` が無い試験台（23以前）では何もしない。無ければ従来どおり。

## 9. pageerror・気になったこと

- `verify_extra_save.py` S1〜S11・5本とも `pageerror` 無し。`_smoke24.py`（scratch）でも 17/17。
- `roundTrip()` は全 op 種別で位置・大きさのずれ 0.00（PC/スマホ）。seed∘fold が今の形を保つことを機械確認できた。
- 試験の操作について：S1 の各 op は `applyOps`（op 単位）で確定的に積んだ（UI ハンドラの正しさは既存5本が担保）。構造の操作（セクション・品）はテンプレの見本で正しく組むため実 API（`sectionAdd`/`sectionDuplicate`/`duplicate`）で流した。`verify_extra_save.py` から操作を流せるよう、既存の関数（`selectOnly`/`nudge`/`deleteSelected`/`duplicate`/`sectionAdd` ほか・`secOf`・`draft`/`roundTrip`/`recentColors`/`pushRecentColor`）を試験の窓口（`window.__playground`）に追加で露出した（既存関数の公開のみ＝編集の動きは不変）。

## 10. コミット

- `b4b1404` 試験台24：保存を「今の形（4.9＋_pg）」に変える（seed/fold・版ごとに今の形・写真の入れ物GC・最近使った色）
