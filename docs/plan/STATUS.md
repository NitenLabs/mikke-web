# 今の状況

最終更新：2026-10-24（Claude.ai）

## 今の段：M1 土台

| やること | 担当 | 状態 |
|---|---|---|
| 設計図（docs/plan） | まとめ役 | 済 |
| 確認スクリプト 8 本（135 項目）と作業票30 | まとめ役 | 済（`d8cdb9f`） |
| 試験台30（試験台29 の写し） | まとめ役 | 済（`3df6a08`） |
| 試験台29 の Linux の基準（verify-claudeai） | まとめ役 | 済：9本すべて合格、verify_playground は 296/297（E3 sp だけ NG。下の「壊れていたもの」） |
| 編集画面を `apps/editor` に移して部品のファイルに分ける | 線 M1-editor | 作業中 |
| `apps/api` の1回目（ログイン・権限・下書き・公開・版・写真・配信・Cron の入口。試験 75 件） | 線 B | 済（`92a315e`）。安全面の見直しをかけ中 |
| CI（GitHub Actions） | まとめ役 | GitHub の連携待ち |

## 確認の結果（Linux）
| 版 | run_audit | verify-claudeai |
|---|---|---|
| 試験台28 | OK 2 / NG 133 | — |
| 試験台29 | OK 47 / NG 88 | 9本合格・verify_playground 296/297（E3 sp） |

## 壊れていたもの（線に回す）
- **E3 sp**（verify_playground）：スマホで、複製したセクションの見出しを 10,10 動かすと x が 9 しか動かない。試験台28 は合格、29 で壊れた（J16 の「枠の中に収める」と思われる）。→ 線 A2

## ユーザーに聞くこと（まとめて聞く）
- 試し（staging）の公開ページのアドレス：本番と同じドメインの2段のサブドメイン（`ashiyado.staging.<ドメイン>`）は、Cloudflare の無料の証明書では使えない（有料の Advanced Certificate Manager が要る）。試しは別のドメインにするか、有料にするか（線 B の README）

## ユーザーが用意するもの
DECISIONS.md の「待ち」を見る
