# 試験台23a 報告：日本語の変換中のキーを無視する（X33）

対象：`refs/compare/layout/playground23_single.html`（試験台22 を凍結して写した 23。X33 だけ直した）
確認した決まり：8.3「変換中は配置計算も組み直しもしない。決めた時点で取り込む」＋ X33「変換中のキー（`e.isComposing`＝true、または `e.keyCode===229`）はページで拾わない。`preventDefault` もしない」
作成：Claude Code（2026-10-09）／環境：`~/.venvs/mikke-verify`
**合否は判定していません。数値・文字・画面の写しをそのまま出します（判定は Claude.ai）。**

直したところ（playground23 のみ・playground22 は不変）：ページが持つ **keydown ハンドラすべて**（`build.mjs` の 8 個＋`app.js` の書き換え中 `onkeydown` 1 個＝計9個）の先頭に
`if (e.isComposing || e.keyCode === 229) return;` を足した（`preventDefault` はしない）。keyup ハンドラは現状存在しない。生データ：`refs/compare/layout/ime_check23a/raw_headless.json`・`raw_headed.json`。

---

## 1. X33 の試験（J1〜J6）— headless・headed 一致

キーは CDP `Input.dispatchKeyEvent`（`windowsVirtualKeyCode: 229`、`key: 'Process'`）。変換は `imeSetComposition`／`insertText`。
I5・I6 と同じ部品を使用：品の名前＝`card_name_c_jonama`、表の行＝`row_name_t_warabi`。

| # | 操作 | 本文（抜粋） | 書き換えの状態 | そのほか |
|---|---|---|---|---|
| **J1** | 「かし」変換中→Esc(229)→空composition | 「…お届けします。」（**変わらず**） | `editing` ＝ **F_b0（続く）** | 部品の移動なし。ページが受けた keydown/keyup＝`keyCode 229・isComposing true` |
| **J2** | 続けて「菓子」を決め→Esc(229なし) | 「…お届けします。菓子」 | `editing` ＝ **null（終わる）** | 変換後の Esc は従来どおり書き換えを終える |
| **J3** | 「かし」変換中→リターン(229)→insertText('菓子') | 「…お届けします。菓子」 | `editing` ＝ **F_b0（続く）** | **改行は入らない**（`has_newline=False`） |
| **J4** | 「かし」変換中→Cmd+Z(229) | 「…します。かし」（変換中のまま） | `editing` ＝ **F_b0（続く）** | **戻るが動かない**（`ops 0→0`） |
| **J5** | `keyboard.press('Escape')`（前の I3 と同じ） | 「…します。かし」 | `editing` ＝ **F_b0（続く）** | ページが受けた keydown＝`key 'Escape'・keyCode 27・isComposing true` |
| **J6** | J1〜J3 を 品の名前・表の行で | J1 不変／J2「…菓子」・終了／J3「…菓子」改行なし・続く | J1・J3 続く／J2 終わる | F_b0 と同じ結果（品の名前・表の行とも） |

- **J1・J3・J4・J5**：変換中（`isComposing=true`、または `keyCode=229`）に押した Esc・リターン・Cmd+Z を、ページが拾わない＝書き換えは終わらない・改行は入らない・戻るは動かない。
- **J5 の読みどころ**：`keyboard.press('Escape')` は `keyCode 27`（229 ではない）だが `isComposing=true` で届く。X33 は **isComposing でも捕まえる**ので無視される。→ playground22 では I3 の Esc で書き換えが終わっていたが、playground23 では続く（下の §4 に I3 の変化）。
- **J2**：変換を決めた後（`isComposing=false`・229なし）の Esc は、今までどおり書き換えを終える。

### ページが受け取ったキー（keylog の生値）
- J1/J3/J4（229 付き）：`{keydown, key:'Process', keyCode:229, isComposing:true}` ＋ 対応する keyup
- J5（`keyboard.press('Escape')`）：`{keydown, key:'Escape', keyCode:27, isComposing:true}` ＋ keyup

---

## 2. I1〜I8 を試験台23 で再実行（8.3 の再確認）

- **I1・I5・I6**：変換中は部品が動かず（`moved=[]`・secΔ0・pageΔ0・`ops=0`）、決めた時に取り込み。headless・headed 一致。
- **I2（PC）**：変換中 20字以上で文字箱が伸び、同じ組の見出し・本文が上へ 14.36px。**セクション高・ページ高は不変**。
- **I7**：変換中・書き換え中は自動保存が動かず（`lastSavedAt` 不変・`ops=0`）、読みの文字が下書きに入らない。
- **I8（スマホ）**：I1 同様。I2 は下の組（`F_p1`・`F_h1`・`F_b1`）が下へ 25.19px、セクション高不変。
- **`pageerror`：なし（`[]`）**（PC headless／headed・スマホ）。

---

## 3. I2・I8 の「変換前／変換の最後／決めた後 500ms」の3位置（動いた部品だけ）

数値は y（設計 px、±0.5）。「決めた瞬間に再移動」＝変換の最後の段と決めた後で位置が変わったか。

### PC（I2・`F_b0` を変換）
| 部品 | 変換前 | 変換の最後 | 決めた後 500ms | 決めた瞬間に再移動 |
|---|---|---|---|---|
| `F_h0`（特集1の見出し） | 461.89 | 447.52 | 447.52 | **なし** |
| `F_b0`（特集1の本文） | 520.91 | 506.55 | 506.55 | **なし** |

### スマホ（I8・`F_b0` を変換）
| 部品 | 変換前 | 変換の最後 | 決めた後 500ms | 決めた瞬間に再移動 |
|---|---|---|---|---|
| `F_b0`（本文・編集箱そのもの） | 384.39 | 384.39 | 384.39 | なし |
| `F_p1`（特集2の写真） | 523.95 | 549.14 | 549.14 | **なし** |
| `F_h1`（特集2の見出し） | 805.95 | 831.14 | 831.14 | **なし** |
| `F_b1`（特集2の本文） | 842.75 | 867.94 | 867.94 | **なし** |

→ 変換中に動いた部品は、**決めた後 500ms でも「変換の最後の段」と同じ位置**にとどまり、決めた瞬間にもう一度動いた部品はなかった（文字箱の素の伸びぶんが、決めた取り込みでそのまま引き継がれる）。

---

## 4. 確認スクリプト6本（試験台20b／22 からの増分）

**X33 による新規の不合格は無し**（下記の `verify_playground` 17件は、試験台22 と同一の Mac 環境差。X33 とは無関係）。

| スクリプト | 試験台23 の結果 | 備考 |
|---|---|---|
| verify_playground | **280 / 297・不合格 17** | 17件はすべて D 系（文の一部の見た目＝`execCommand`/IME）・C3/C4/E1（複製の文字二重）。**試験台22 と同一**＝X33 で増えた不合格なし |
| verify_extra_photo | 26 / 26（初回 run_all 時に完走） | 再取得は環境タイムアウト（下記） |
| verify_extra_text | **未取得（環境タイムアウト）** | 前回 試験台22 で 17/17。X33 と無関係（キー操作の試験ではない） |
| verify_extra_arrange | **未取得（環境タイムアウト）** | 前回 試験台22 で 29/29。X27 の K18 等＝X33 と無関係 |
| verify_extra_publish | **未取得（環境タイムアウト）** | 前回 試験台22 で 25/25（履歴・公開） |
| verify_touch | **未取得（環境タイムアウト）** | 前回 試験台22 で 24/24（指の操作） |

**環境について（直していません）：** 一部のスクリプトが `Page.goto: Timeout 30000ms exceeded`（1.08MB の `file://` 読み込みが30秒を超える）で途中終了した（`NG` ではなく実行エラー）。これは**この Mac の負荷による読み込み遅延**で、X33・試験台23 とは無関係。根拠＝**凍結した試験台22（以前は 26/26 合格）の同じスクリプトも、いま同条件でタイムアウトする**（playground22 で OK=10 の後に goto timeout を再現）。スクリプトは Claude.ai のもので変更不可のため、タイムアウトしたものは負荷の低いときに再取得する（Claude.ai 側の確認でも走る）。

X33 で結果の変わった前作業票の試験（＝直しの意図どおりの変化。直していません）：
- **I3（前の作業票）**：`keyboard.press('Escape')` を変換中に送る試験。
  - playground22（X33前）：Esc で**書き換えが終わる**（`editing=null`）、続けての2回目の変換は**入らない**、イベントに `compositionend` が**出ない**。
  - playground23（X33後）：Esc をページが拾わないので**書き換えが続く**（`editing=F_b0`）、ブラウザ側の変換終了が進んで `compositionend` が**出る**、続けての2回目の変換（「はる」→「春」）が**入る**。
  - ＝X33 の意図どおりの変化。`verify_ime_code.py` の I3 の出力が上記のとおり変わる。

---

## 5. 気になったこと（直していません・判定でもありません）

1. **X33 は keyCode だけでなく isComposing でも捕まえる**（J5）。`keyboard.press('Escape')` のように変換中でも `keyCode=27` で届くキーがあるため、`e.keyCode===229` だけでは漏れる。両方を見ることで、変換中の Esc・リターン等をもれなく無視できている。
2. **「変換を決めた後」のキーは従来どおり**（J2）。`isComposing=false` になっているので X33 の判定に掛からず、Esc で書き換えを終える等が効く。
3. I3 の `compositionend` が出るようになった（§4）。これは X33 でページが先に書き換えを終えなくなった結果、ブラウザの変換終了が最後まで進むため。

---

## 6. 本線・最後のコミット

- 試験台22 は**凍結**（`experiments/layout/playground22/` も `playground22_single.html` も不変）。23 は `experiments/layout/playground23/` で作り、`playground23_single.html` を出力。
- 最後のコミット：**`d49bf17`**（mikke-web・`main`）。push はしていない。
