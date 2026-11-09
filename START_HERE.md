# 芦屋みっけ Web 制作：ここから読む

最終更新：2026-11-09（Claude.ai のクラウドの Claude Code から）

新しい Claude アカウント・新しいパソコンで続きをやるための入口。**Claude.ai のプロジェクト「芦屋Project」は新しいアカウントからは見えないので、このリポジトリだけで分かるようにしてある。** 食い違ったら、このファイル → `docs/plan/DECISIONS.md` の新しい番号の順で信じる。

---

## 1. いま何をしているか（2026-11-09 に方針を切り替えた）

| | 中身 |
|---|---|
| 事業 | 芦屋のお店ごとに Web サイトを作って納品し、**月額の保守料**をもらう。料金の型は7月に決めたもの（初期 0 円・月 4,980 円前後・最低 6〜12 か月）。`docs/business/pricing_and_maintenance.md` |
| 作り方 | 人が外部の良いデザイン（Studio のテンプレートなど）を見つける → それを参考に**自分たちのコードで**作る（Studio の上では作らない）→ 写真・文章・お店の情報をそのお店のものにして納品 |
| 置き場所 | **Cloudflare**（Pages の無料枠＋ドメイン代。1軒あたり月 150〜350 円＝ほぼドメイン代。店主の編集の仕組みを足しても、全部のお店で月 5 ドル前後） |
| 店主の編集 | **簡単な所だけ**：文字・写真・営業時間・品・値段。配置は触らせない（制作側が直す） |
| やめたこと | PowerPoint 並みに自由に動かせる編集画面（`apps/editor`）をリリースまで磨くこと。コードは消さずに凍結 |

切り替えた理由（11/9 の会話から）：
- 自由に動かせる編集画面は触れる所が多すぎて、精査のたびに問題が出る（1回目 78・2回目 28・3回目 48・4回目 46 件）。店主が実際に直すのはほぼ中身だけ
- 今の編集画面は1つ目の型（wa-01）の部品名をコードに約 470 か所書いていて、型を増やすたびに手直しが要る
- 売り物は「芦屋みっけが作る質の高いサイト」なので、デザインを型に縛らない方が強い

## 2. 次にやること（この順）

1. **参考 → 自動制作の仕組み**を作る（3章）。まず1本通す：参考サイト1つ × 架空の和菓子店「御菓子司 芦屋堂」のデータ（`samples/ashiyado/`）。どこまで自動ででき、どこに人の手が要るかを測る
2. **質を落とさずに使用量（クレジット）を最小にするやり方**を決めて文書にする（4章）
3. 店主の**簡単な編集画面**（文字・写真・営業時間・品・値段）と、Cloudflare への公開
4. 本物のお店1軒で作って売る

### 進め方（2026-11-09 にユーザーと決めた。必ずこれで進める）
- **相談役**＝claude.ai のプロジェクト「芦屋みっけ」のチャット。ユーザーと相談し、決まったら指示ファイルを `C:\Users\sea_p\GitHub\_mailbox\inbox\` に置く（受信箱方式。ユーザーにコピペはさせない）
- **実行役**＝ユーザーのパソコンのターミナルの Claude Code。`C:\Users\sea_p\GitHub\mikke-start.bat` で起動し、受信箱を見張って実行する。ルールは `C:\Users\sea_p\GitHub\CLAUDE.md`
- 実行役は、終わったら `_mailbox\reports\latest.md` に結果を書き、ターミナルにも出す。ユーザーはターミナルが止まったら相談役に話しかける
- 詳しくはプロジェクトの `claude/進め方_相談と実行.md`
- **2レーン（2026-11-09）**：実行役は `mikke-lane1.bat`・`mikke-lane2.bat` の2つを並べる。受信箱は `_mailbox\lane1\`・`lane2\` に分かれ、報告も自分のレーンの `reports\latest.md`。お店の作業は本体のフォルダでなく worktree（`C:\Users\sea_p\GitHub\wt\<店のID>`、ブランチ `shop/<店のID>`）で行い、検査のあと rebase して `git push origin HEAD:main`。共通の道具を直したら別のコミットで早めに main へ。見本は `C:\Users\sea_p\GitHub\_preview\` に集める（`tools/preview-export.mjs <店> --out ...`）。細かい決まりは `C:\Users\sea_p\GitHub\CLAUDE.md`

### 進み具合（2026-11-09 18:50。次のチャットはここから）
**済んだこと**
- 芦屋みっけ（ashiya-mikke）：トップの表紙・コラージュを外し、元のフォリオ行・マストヘッドを戻して本番に出した（9b9fa2f。https://ashiya-mikke.pages.dev）。GitHub→Cloudflare の通知の取りこぼしがあり、デプロイフックを作った（アドレスは `C:\Users\sea_p\GitHub\CLAUDE.md`。公開リポジトリには書かない）
- 李杏（1本目）：STEP 1〜4 を通し、営業用の見本（salesDraft）を仕上げた。型 `templates/wa-02/`、データ `samples/rian/`、見本 `dist/rian/`。写真は Unsplash の仮、お品書きは食べログのメニュー板の写真（2022年ごろ）から読んだ実際の品と値段（税抜・未確認＝draft）。見出し「炭火の音に、／耳をすませる。／芦屋の夜の、／とっておきの一軒。」、当店についての面は炭色 #2E2925（ユーザーの判断で参考の色から変更）
- 見本の URL：https://nitenlabs-preview.pages.dev/rian/（Cloudflare Pages プロジェクト `nitenlabs-preview`、noindex、og 画像つき。書き出しは `tools/preview-export.mjs` → `dist/preview/`）
- 李杏の店主（知り合い）に Instagram の DM を送った（11/9 18:48）。Instagram は最初の DM がメッセージリクエストになり、承認までリンクが押せない。返信が来たらリンクつきの本文を送る（文面は相談役が作成済み。「値段は目安だけ」の案。月2,490円・初期0円）
- 紹介ページ（Web制作）：中止（Claude が選んだ参考で質が低かった）

**次にやること**
1. 李杏の返事を待つ → 返事の内容で見本を直す → 取材（質問リスト：値段の確認と税込表示、国産黒毛和牛、店内の雰囲気、月曜の定休、閉店時間・LO、駅からの分数、カード、お店の写真の提供）。`samples/rian/interview.md`
2. **まだ手を付けていない：質を落とさずに使用量を最小にするやり方の文書（`docs/method/`）**。材料：受信箱方式（相談役と実行役の分業）、STEP ごとの実測（notes.md・`_mailbox/reports/` の 0001〜0010）、「数値の検査だけでは見れば分かる誤りを通す」教訓、Claude が参考を選ぶと質が落ちる教訓
3. 契約の中身（最低契約期間・解約時のサイトとドメイン・月額に含む更新の回数）。お店のドメインは契約が決まってから（`rian13.com` は空いている）。芦屋みっけの正式ドメイン（`ashiya-mikke.com` が空いている）も検討
4. 公開リポジトリの過去の履歴に、参考サイトの画像と参考の文の語句が残っている。非公開にするか決める
5. 見本の置き場への上げ直しは、実行役が「公開の置き場を作る操作」として止められることがある。そのときはユーザーにターミナルで1行打ってもらう（パスは `/` で書く。例 `! cd C:/Users/sea_p/GitHub/mikke-web && npx wrangler pages deploy dist/preview --project-name nitenlabs-preview --branch main --commit-dirty=true`）。`dist/preview/` は丸ごと上げるので、前の店のフォルダも残す

### 李杏の営業（2026-11-09）
- 価格：**月 2,490 円・初期 0 円**（ユーザー決定。1店目の特別価格の位置づけ。正価は後で決める）。メニュー・値段・営業時間の変更はこちらで行う
- 見本の URL：`https://nitenlabs-preview.pages.dev/rian/`（NitenLabs の見本専用の置き場。noindex。お店のドメインは契約が決まってから。`rian13.com` は空いている＝取り直せば食べログのリンクが直る）
- 連絡：店主は知り合い。LINE で丁寧な文面＋見本の URL＋芦屋みっけの URL。写真は仮（素材）と明記

### 1本目の中身（2026-11-09 にユーザーが決めた）
- お店：**炭火焼肉 李杏（りあん）**（芦屋市東山町2-6。食べログ https://tabelog.com/hyogo/A2803/A280302/28022584/ ）。「炭火焼肉RIAN」と同じ店で、**既にお店のサイトがある**（http://www.rian13.com/ 。https でない古いサイト）。なので営業は「新しく作る」でなく「作り直す」の話になる
- 参考：Studio テンプレート https://preview.studio.site/templates/b91aP9Wlw2 （和食居酒屋向け。セクションは news・about・menu・infomation・access、PC の高さ約 8,070px。書体は黎ミンY10 M・中ゴシックBBB（どちらも Studio 専用の有料書体）・Lora・Noto Sans JP。写真は Unsplash）
- 書体の扱いはユーザーに確認中（有料書体は無料の近い書体に置き換える案：Zen Old Mincho／Zen Kaku Gothic New）
- クラウドの Claude Code からは参考サイトに届かない（許可するドメインを足しても、その会話のうちは効かなかった）。撮影は手元のパソコン（`C:\Users\sea_p\GitHub\mikke-web`）の Claude Code か、新しい会話で
- 実在のお店なので、事実（住所・営業時間・品・値段）はお店か公開情報から取り「要確認」を付ける。紹介文は取材メモから。写真はお店のものを使う（揃うまでは仮）

## 3. 参考 → 自動制作の仕組み（11/9 に合意した方向。細部は次のチャットで決める）

| # | 段 | 誰が | 使えるもの（もうある） |
|---|---|---|---|
| 1 | 参考を登録する（URL） | 人 | — |
| 2 | 撮って測る（PC 1440・スマホ 390） | 自動 | `tools/ref-capture.mjs`・`tools/ref-mask.mjs`（手順は `docs/reference_analysis_guide.md` の STEP 1） |
| 3 | 骨格と値を取り出して設計書にする | Claude（上位のモデル） | 同 STEP 2・SPEC.md のひな形（7章） |
| 4 | 自分たちの部品で組み立て、お店のデータを流し込む。紹介文の下書きは取材メモから | 自動 | `tools/clone-gen.mjs`・`packages/core/publish/`（公開用 HTML・検索向け情報・写真の大きさ）・`docs/DATA_SPEC.md`（① お店の情報） |
| 5 | 確かめる：崩れ・スマホ・速さ・検索向け・業種語や固有名の取り残し・参考の写真/文章/ロゴ/イラストが残っていないか | 自動 | `tools/ref-verify.mjs`・`tools/clone-compare.mjs`・`tools/clone-pixel.mjs` |
| 6 | 仕上げ → 公開 | 人が少し → 自動 | Cloudflare |

人がやるのは、参考を見つける・案を選ぶ・最後の仕上げ・お店の目利き（「本当に良い店か」は最後まで人）。

**参考から持ち込んでよいもの・いけないもの**は `docs/reference_analysis_guide.md` 1章が正：
- 持ち込んでよい：構造の数値（位置・大きさ・余白・グリッド・幅・高さ）、色の値、書体、文字の段、罫線・ピルのような一般的な形
- 持ち込まない：写真・イラスト・文章・コピー・ロゴ・店名・人名・商品名・価格・住所
- 1つの型に参考は原則1つ
- 色の値・書体は**そのまま使う**（2026-11-09 にユーザーが確定。`CLAUDE.md`・手順書の古い「選び直す」の行は直した）
- 参考は型ごとに新しく選ぶ。9 月に測った Studio のテンプレート（`refs/studio-Q65qmmvqVR/`）は使い回さない（同日ユーザー）

9 月に Studio のテンプレート1つを測って、同じ配置をこの仕組みで組み直せることは確かめてある（`samples/clone-q65/`・`templates/wa-01/clone-gaps.md`。差はセクションごとに約 1px の丸めの積み重ねだけ）。

## 4. 使用量（燃費）を最小にするやり方：出発点

`docs/reference_analysis_guide.md` 4章の8つの決まりが土台：見るより測る／画像は小さく少なく／長い出力を会話に入れない／判断の要らない作業はスクリプト／段ごとに会話を分ける／確認はまとめる／モデルを使い分ける（測る・確かめるは軽いモデル、設計の判断は上位）／一度分析したサイトは再分析しない。

10 月の編集画面の作業で分かったこと（足す候補）：
- 確かめは自動のスクリプトにして、Claude は結果の行（OK/NG の数・NG の行）だけ読む
- 重い調べ物・作業は別のエージェントに渡すと本体の会話が軽く保てる。ただし同時は2つまで、確認の番号や決め事の番号は先に範囲を分けて渡す、合わせた後に全部の確認を1回だけ回す
- 1つの会話を長く続けない。区切りでこのリポジトリに書き残して、新しい会話で読み直す
- 作る物の範囲を絞ること自体が一番の節約（自由な編集画面は触れる所が多く、精査と直しに使用量の大半を使った）

次のチャットでは、これを `docs/method/` などに1つの文書としてまとめ、1本通したときの使用量を測って確かめる。

## 5. 始め方

### Claude Code（Claude.ai のクラウド）で
1. GitHub を連携する（今と同じ GitHub アカウント）。Claude の GitHub アプリは NitenLabs に入れてある。リポジトリは公開なので読むだけなら連携は要らないが、push には要る
2. `add_repo` で `NitenLabs/mikke-web`（access=push）→ `git clone --depth 1 https://github.com/NitenLabs/mikke-web /home/claude/mikke-web`
3. 読む順：このファイル → `docs/business/README.md` → `docs/reference_analysis_guide.md` → `docs/DATA_SPEC.md` → `docs/plan/DECISIONS.md`（上の方＝新しい番号）
4. 準備：`npm ci`（クラウドには Chromium と Playwright が入っている。Python の playwright も）

### 手元のパソコンで（2026-11-09 から主にこちら。ターミナルの Claude Code）
- 自動化（段ごとにスクリプトから Claude を呼ぶ）を見込んで、デスクトップアプリの Code ではなく**ターミナル版**を使う（ユーザーの判断）
- 置き場所：`C:\Users\sea_p\GitHub\mikke-web`（GitHub Desktop で取得済み。OneDrive の中には置かない）
- 準備：Git for Windows → Claude Code（PowerShell で `irm https://claude.ai/install.ps1 | iex`）→ そのフォルダで `claude` → Node 22 → `npm ci` → `npm run setup:browser`

## 6. リポジトリの地図

| 場所 | 中身 | 今の扱い |
|---|---|---|
| `START_HERE.md` | この文書 | **最初に読む** |
| `docs/business/` | 事業の計画・料金・補助金・お店の数・保守の考え方（Claude.ai のプロジェクトから写したもの）と、写していない資料の一覧 | 使う |
| `docs/reference_analysis_guide.md` | 参考サイトの取り扱いと手順（STEP 0〜4）・燃費の決まり | **使う（一番大事）** |
| `docs/DATA_SPEC.md`・`schema/`・`tools/validate.mjs` | データの形（お店の情報・品・営業時間など） | 使う |
| `tools/ref-*.mjs`・`tools/clone-*.mjs` | 撮る・測る・組み立てる・比べる | 使う |
| `packages/core/` | 公開用 HTML の描画・お店の情報・品 | 使う（`publish/`・`shopinfo.js`・`catalog.js`） |
| `apps/api/` | Cloudflare Worker：メールでログイン・下書き・版・写真・公開（手元の試験 141 件は通る。まだどこにも置いていない） | 使う見込み（簡単な編集画面のサーバー） |
| `samples/ashiyado/` | 架空の和菓子店のデータと写真 | 使う（試しの材料） |
| `templates/wa-01/` | 1つ目の型の設計書（SPEC.md）と記録 | 参考 |
| `apps/editor/`・`tools/verify-audit/`・`tools/verify-claudeai/` | 自由に動かせる編集画面と、その確認（精査 135 項目＋数百項目） | **凍結**（直さない。部品を借りるのは可） |
| `docs/plan/` | 10 月までの「編集画面のリリース」の計画・状況・決め事 | 背景（決め事は #50 から新しい方針） |
| `experiments/` | 試験台 1〜30 | 凍結 |
| `refs/` | 参考サイト・試験台の撮影と実測 | 参考（8章の聞くことあり） |

## 7. 決めたこと（2026-11-09。詳しくは `docs/plan/DECISIONS.md` #50〜）
- #50 事業：お店ごとに作って納品＋月額保守
- #51 自分たちのコードで作る（Studio の上では作らない）。置き場所は Cloudflare
- #52 店主が直せるのは文字・写真・営業時間・品・値段だけ。配置は制作側
- #53 自由に動かせる編集画面（apps/editor）は凍結
- #54 作り方は「参考を見つけるのは人、作るのは自動」。持ち込んでよいもの・いけないものは手順書 1章
- #55 引き継ぎは GitHub（このリポジトリ）だけで足りるようにする。リポジトリは公開のまま、事業の資料も入れる（ユーザーの判断）

## 8. ユーザーに聞くこと
- （済 11/9）参考サイトの撮影画像は全部追跡から外した（2,902 枚。`.gitignore` で refs/ 全体）。GitHub の過去の履歴には残る。消すなら履歴の書き換えか非公開化（未決）
- 用意してもらうもの：Cloudflare のアカウント、ドメイン（お店ごとに取るか）、ログインのメール送信（Resend など）
- 最初のお店（業種）と、参考にしたいサイト
- 契約：Cloudflare・ドメインの名義、解約したときにサイト・ドメインをどうするか
- 補助金：小規模事業者持続化補助金 第20回（7 月の調べで申請 11/5〜12/15、商工会の様式4 の締切 12/4）を最初のお客さんの営業に使うか。使うなら最新を調べ直す

## 9. Claude Code（Claude.ai のクラウド）の環境のくせ
- 2 コア。重い確認・ブラウザの試験は1つずつ走らせる（同時だと速さの判定が揺れる）
- GitHub Actions のログは読めない。CI の落ちた中身は注記で見る：`gh api repos/NitenLabs/mikke-web/check-runs/<job id>/annotations`
- `gh` の GraphQL は使えない（`gh repo view` など）。REST の `gh api repos/...` を使う
- リモートのブランチを消す push・`git reset --hard` は止められる
- シェルからの外向きの通信は許可されたサイトだけ（npm・pip・GitHub など）。参考サイトの撮影（`ref-capture.mjs`）はこの環境から届かないことがある → 手元のパソコンか、Chrome の拡張で撮る（手順書 6章）
- リポジトリの `CLAUDE.md` の「コマンドの書き方」（cd しない・git -C・Grep/Read を使う）を守る
