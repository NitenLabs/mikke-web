# 道のり（v1 リリースまで）

並行で進める「線」と、区切りの「段」。各段の終わりに、別のエージェントが触り回す精査をかける（RELEASE.md A4）。

## 段

| 段 | 中身 | 終わりの条件 |
|---|---|---|
| **M1 土台** | 設計図（この docs/plan）。CI。編集画面を `apps/editor` に移して部品のファイルに分ける（動きは変えない）。`packages/core` を切り出す。`apps/api` の骨組み | 分けた編集画面で、試験台30 と同じ確認の結果（run_audit OK 47 / NG 88、verify-claudeai は基準どおり）。API の単体試験が通る。CI が回る |
| **M2 中身** | 線 A〜C を並行 | A：run_audit の NG＝保留だけ。B：B1〜B5・C1〜C4 の API と試験。C：公開用 HTML の描画と D5 |
| **M3 つなぐ** | 編集画面を API につなぐ（ApiStore）。公開で本当に公開ページが出る。staging に出す | D1〜D4・E1 |
| **M4 仕上げ** | 毎日の描き直し（D6）・速さ（D7）・バックアップ（B6）・エラーの知らせ（E2）・絵で決める 19 個（A3）・iPhone と Mac の実機（A5・A6） | RELEASE の A〜E がすべて済 |
| **M5 本物のお店** | 1〜2 軒に触ってもらう（F1）。出た問題を直す | F1 済 → リリース |

## 線（M2 で同時に走らせる）

| 線 | 担当の範囲（ファイル） | 中身 |
|---|---|---|
| A1 文字 | `apps/editor/src/text*` | P2〜P11・P13・P14・P27、J4・J9・J10・J43・J56、文字まわりの F |
| A2 選ぶ・動かす | `apps/editor/src/select*` `drag*` `resize*` | P1・P12・P15〜P20・P22〜P24、J12・J17 |
| A3 部品・写真・セクション | `apps/editor/src/photo*` `section*` `clipboard*` | P21・P25・P26・P28・P29、写真・帯の F |
| A4 品・お品書き・お店の情報 | `apps/editor/src/catalog*` `shopinfo*`、`packages/core/catalog*` | J41・J44・J45、品の F |
| A5 知らせ・キーボード・画面 | `apps/editor/src/ui*` `toolbar*` `toast*` | F のうち知らせ・帯・キーボード・幅・重さ |
| B 本番の仕組み | `apps/api/` | ログイン・権限・下書き・版・写真・公開・配信・D1/R2 |
| C 描画と公開ページ | `packages/core/render*` | 公開用 HTML、検索・共有の情報、出し入れ、相互リンク |

- 線ごとに別の git の作業ツリー・ブランチ（`track/<線>`）で動く。**担当の範囲の外のファイルを直したくなったら、まとめ役に頼む**（ぶつからないように）
- まとめ役（Claude.ai のこのセッション）が、線のブランチを main に入れる前に、全部の確認を走らせる。通ったものだけ入れる
- 編集画面の線（A1〜A5）は、M1 の「部品のファイルに分ける」が済んでから始める

## 今の段
STATUS.md を見る。
