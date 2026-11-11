# 店主の編集画面（段3）に求めること

画面はまだ作らない。作るときの決まりだけ。API は `README.md`「API の一覧」。

## 直せる所
- **`data-edit` の印がある所だけ**直せる（DATA_SPEC 4.12）。印の無い所は画面に出さない・送らない
  - `shop:<ptr>`＝① のその場所／`item:<品ID>/<項目>`＝品の名前・説明・価格／`item:<品ID>`＝お休み・販売中／`list:catalog:<menuId>`＝品を足す・消す・並べ替え／`text:<要素ID>`＝文字の箱
  - `photo:*`・`sec:*` は今は直さない（写真は事務局、段の出し隠しは後で）
- 上限はお店ごとの **`edit-limits.json`**（例 `samples/amet/edit-limits.json`）：`maxChars`・`maxParagraphs`・`maxLines`・`maxLineChars`・`maxDigits`・`maxExceptionDays`・`maxOptions`・lists の `minItems`/`maxItems` など
  - 入力しながら残りの字数を出す。`level:"warn"` は「目安を超えています」と出して保存はできる、それ以外は保存の前に止める
  - edit-limits に無い文字の箱は「今の段落の数まで・各段落は今の最長＋2 字まで」（段2 と同じ）

## 画面の形
- **スマホ**：1 列。直す所を上から並べ、押すと入力が開く。下に「下書きに保存」
- **PC**：**左に入力・右に今の姿（ライブの見本）**。入力すると右がすぐ変わる。右の印の所を押すと左のその入力へ

## 保存と公開
- 直したら **下書き**に保存（`PUT /api/shops/:id/drafts/shop`、`If-Match` 付き）。公開中のページはまだ変わらない
- 「公開する」で初めて外に出る（`POST /api/shops/:id/publish`）。状態の文字（`/status`）を上に出す：まだ公開していません／公開中と同じです／まだ公開していない変更があります
- **版を戻せる**：履歴（`/versions`）から「この版を下書きにする」（`/versions/:n/restore`）→ 確かめて公開

## ログイン
- **LINE かメール**。スマホは LINE（LIFF の中で `POST /api/auth/line`）、PC はメール（コードかリンク）
- 初めての人はメールで入り、LIFF の中で「LINE をつなぐ」（`POST /api/me/identities/line`）。つないでいない LINE には「メールで入ってください」と出す（404 `not_linked`）
- どちらで入っても同じお店・同じ下書き

## ぶつかったとき（2 か所で同じお店を直す）
- 保存で **409** が返ったら、知らせなしに上書きしない。「ほかの所で先に保存されました」と出し、相手の内容（答えの `current`）と自分の内容を並べて選んでもらう
- 選ばなかった方は `POST /api/shops/:id/backups` で残す（後から戻せる）
- LINE の直しの依頼（段2）が承認されて ① に書き戻されたときも、同じく版が上がる。開いたままの画面は次の保存で 409 になるので、上と同じ扱い
