# wa-22（G038 GELATO SUNAO）前半の段（STEP 1〜2）の記録と、後半の段への申し送り

2026-11-10、lane2 の subagent（前半）。後半（組み立て・検査・点検・push）は、この文書と `SPEC.md`・`photos-sunao.txt`・`terms.md` だけを頼りに進める。

## 1. 店名の重複確認
- 検索：「ジェラート すなお OR SUNAO 芦屋 OR 西宮 OR 神戸」「"SUNAO" ジェラート OR アイスクリーム 兵庫 食べログ」「すなお アイスクリーム 神戸 OR 西宮 OR 芦屋 店」「tabelog.com ジェラート "すなお" OR "SUNAO" 兵庫」
- 結果：**芦屋・西宮・神戸に「すなお／SUNAO」のジェラート・アイスの店は見つからなかった**（出てきたのは別名の店：HARLOW ICE CREAM・gelatosea・Riccio d'oro など）。食べログ・Google マップの画面は直接開いておらず、検索結果で確かめた
- → 店名は **GELATO SUNAO のまま**
- **ただし気になる点（相談役・ユーザーに判断を仰ぐ）**：江崎グリコに低糖質アイスのブランド「**SUNAO**（スナオ）」がある（カップのアイス。全国のスーパー・コンビニで売られている）。店ではないので指示の「同じ名前の店」には当たらないが、同じアイスの分野で同じ英字の名前なので、見た人がグリコの商品と結びつける恐れがある。変えるなら案：「GELATO SUNAO」→「ジェラート ひらた」「GELATO HIRATA」（町名から）など。今回は指示どおり SUNAO で進めた

## 2. 参考サイトの選定
- 見た所（WebFetch。403 は回避していない）
  - MUUUUU.ORG：飲食 `/category/industry/restaurant`（2 ページ・186 件）、飲料・食品 `/category/industry/food`（4 ページ・382 件）を全部
  - SANKOU!：「カフェ･飲食店･テイクアウト」1 ページ目（81 件）、「料理･食べ物･飲み物･食品製造」1 ページ目（81 件）、「ポップ」「かわいい」の 1 ページ目。**2 ページ目以降は 403**
- ジェラート・アイスの店で載っていた物と外した理由
  - Eislab（eis-lab.de、MUUUUU）：「WERDE FRANCHISE PARTNER」＝フランチャイズ（チェーン）。`refs/eislab/` は前の作業の実測。使わない・コミットしない
  - Cellato（cellato.tokyo、MUUUUU）：通販のブランド（店舗の案内なし、1 個数万円の贈答品）。色も黒で重い
  - Creaimo（creaimo.jp、MUUUUU）：多店舗のソフトクリームの店
  - MELTY MAGIC（MUUUUU）：会社（ユートピアアグリカルチャー）の商品のページ
  - ハーゲンダッツ（MUUUUU）：大手
  - **両方に載る個人のジェラート・アイス店は 0 件、どちらかに載る個人のジェラート・アイス店も 0 件**
- 近い業種（甘い物の個人店）から見た候補と外した理由
  - violet（violetpatisserie2014.com、SANKOU!）：クッキー缶 2 品だけの絵本風。品の一覧の作りが無い
  - 北のはしベーカリー（SANKOU!）：スーパーの会社のパンのブランド
  - FLORE（SANKOU!）：麹のジャムのブランド・通販
  - SWISS洋菓子店（s-swiss.com、MUUUUU）：会社の複数店舗、トップに品の一覧が無い
  - リンゴアメ専門店 林檎堂・POGG・Lune Croissanterie など：多店舗や海外、または業種が遠い
  - 使用済みの参考（wa-02〜wa-20 の SPEC の 1 行目、wa-21 の dramatic-curry、hachi-to-waltz 等）は外した
- **選んだ物：パレード伏見洋菓子店 https://parade.kyoto/**（MUUUUU、2026-01-15 の SITE OF THE DAY。京都・伏見桃山の 1 店舗、2022 年創業の洋菓子店とカフェ。季節のアイスもある）
  - 理由：品の一覧が「SEASONAL などの分類の札＋縦長の写真＋欧文の大きな品名＋和文の品名＋値段」を 3 列の千鳥で並べ、横に巨大な縦の欧文「Line up」。定番と季節の札分けが、見せ場「今日の味（定番と季節を分ける）」にそのまま移せる。ほかに巨大な欧文の見出し（FAQ・Access）、縦書きの見出しを中心に材料を左右に振る段、括弧の英字の札の店の案内
  - 注意：採用の帯・ギフト・通販の案内も大きいが、それらは持ち込まない。参考の色（赤 #C22B1F）・書体は使わない（ギャラリーはお店の設定）
- 実測：`node tools/ref-capture.mjs https://parade.kyoto/ refs/parade`（警告 13 件：遅れて読む写真・透明のままの演出・覆い 4 件を隠した・セクションの判定は PC で 3 つにまとまった）。段ごとの数値は別に `refs/parade/measure-detail.mjs` → `refs/parade/detail.json`（文字・面・写真の位置と大きさ）。参考の画像は開いていない
  - 主な数値：上の帯 1425×58 赤／ヘッダー 130 透明・固定／英字の巨大な文字組 148px（500 と 300 を混ぜ、つなぎの語 70px）／Line up の縦の巨大欧文 170.6px が x=1302／カード 384 幅（写真 358×552、角 5 の枠）が x=117・521・925、上端 1317・1486・1231（千鳥）／品名 40px/500・和名 13px/700・値段 28px/500・「¥」15px・TO GO 12px／こだわりの縦書き 37.6px/700 行間 74.4、材料 6 つが左 x≈70・右 x≈1060〜1100 で交互、写真 296×296・317×212・242×330・372×249・299×300・317×212／FAQ の巨大欧文 130px と 4 列（列 358）・問 16px/700・答え 14px 行間 24／Access の巨大欧文 120px・住所 15.86px／案内の表は括弧の札 12px（幅 106）＋値 15px/500 行間 24／ボタン 高さ 45・角 0・2px の枠
  - スマホ：カードは 1 列（339 幅、写真 317×488）、巨大欧文 85px・75px、Line up 100px

## 3. 写真
- 探し方：WebFetch で `unsplash.com/napi/search/photos?query=...` の JSON を読み（Node から unsplash.com へは直接アクセスしない。curl は「Authorization required」で断られた）、画像は images.unsplash.com から `w=700` で取得して 1 枚ずつ見た（`refs/sunao-photos/`。コミットしない）。Unsplash+（premium）は全部外した
- 検索語：gelato display／gelato cone／pistachio gelato／gelato cup／ice cream cone pastel／strawberry gelato／fresh figs／pistachios／mandarin oranges／sea morning light calm／milk glass bottle／gelato spatula scoop／black sesame ice cream／caramel gelato scoop
- 選んだ 10 枚（台帳と重複なし。`node tools/ref-verify.mjs photos templates/wa-22/photos-sunao.txt data/photo_ledger.csv` → 「全10枚 正常・重複なし」）：SPEC 7 章の表のとおり。格子画像は `docs/gallery/review/sunao/photos.jpg`（ID 入り、切り抜き後）
- **品名・見出しとの割り当て（写真に写っている物だけを書く）**
  | 枠 | 写っている物 | 割り当てた見出し・品名 | 一致のさせ方 |
  |---|---|---|---|
  | fv | ショーケースの容器に並ぶ赤・白・桃・緑のジェラート | 最初の画面（店全体） | 味の名前は書かない |
  | s1 | 紙カップに緑の 1 すくい | シングル 550円 | 「一種類を、たっぷりと。」味の名前は書かない |
  | s2 | コーンにピンクと白の 2 すくい | ダブル 700円 | 「二種類を…」味の名前は書かない |
  | s3 | コーンに赤・黄・緑の 3 すくい、スプリンクルが散る | トリプル 850円 | 「色の違う三つを。」スプリンクルのことは書かない |
  | k1 | オレンジ色のジェラート 3 すくい | 季節の板「今週のおすすめ　早生みかん」 | 色がみかんと合う |
  | c1 | 枝葉つきのみかん | 01 果物「その朝に届いた果物から」 | |
  | c2 | 切ったいちじく | 02 いちじく「熟したものだけを」 | |
  | c3 | ガラス瓶の牛乳 | 03 牛乳「土台は、牛乳」 | |
  | c4 | 殻つきのピスタチオ | 04 ピスタチオ「殻をむいて、煎って、挽く」 | 写真は殻つき、文は「殻をむいて」で矛盾しない |
  | sea | 夕方の凪いだ海と桃色の空 | 海辺の帯「持ち帰りのカップを手に、海のほうまで…」 | 人・店は写っていない |
- 外した主な候補：4Q0XpCPs5Us・Ix5gapaze_E・zbABzsqek9k（ショーケースに文字の札）、jxz5szOIzlk（カップに URL の文字）、bXdg4PI8ZtY・1xz6p1zpUoY・dTMa4beAG2c・9drV4qU9oPQ・xsigZ5Lm-qA・azqF_E6ayYU・C-XtnMYWU3E・_OoVu__ultg・KjPYu117ffA（カップに店名・ロゴ）、a4klBZzat80（コーンと背景に文字）、h4-JpJRiahQ（奥に人の後ろ姿）、PnIHvHZsH4Q（ピスタチオのジェラート。良いがピスタチオの写真が重なるので外した）、r4Qa6Ynr9X0（大理石に果汁の白い染み）、erJuRsCRB2E（強い影のしま模様でトーンが暗い）、Nag3E3yzygU（背景が暗い）、-xq5BTa2vSk（マシュマロをのせたパフェ風）、kg7gcQtp4N8・JK5DX2McMMc（パフェ・飾り）、milk の他の候補（黒い背景）
- トーン：明るい白・黄・水色・桃色の背景がそろう。s1 だけ背景（窓のぼけ）がやや暗い暖色。気になれば後半で差し替え候補を探す（文字の無い紙カップ 1 すくいの写真は、ほかに見つからなかった）
- **写真台帳への追記はまだしていない**。後半の検査がすべて通ってから `node tools/ref-verify.mjs ledger templates/wa-22/photos-sunao.txt data/photo_ledger.csv wa-22` を 1 回だけ（先に追記すると `photos` の照合が自分自身を重複として出す）

## 4. 書体・色
- `tools/lib/fonts.mjs` に `kiwi-maru`（400・500）・`young-serif`・`zen-kaku-gothic-new`（400・500・700）があることを確かめた（ad4e11a で入り済み）。共通の道具の直しはこの段では無し
- 色とコントラストの計算結果は SPEC 3 章。味の色（ピスタチオ・いちご・柑橘）の面の上の文字はチョコ #4A2E25 だけ（6.31〜7.32）。補助の文字 #6B4A3E は色の面の上で 4.03〜4.68 になるので、ミルクの上だけで使う

## 5. 後半の段への申し送り
- 作業場所は `C:\Users\sea_p\GitHub\wt\sunao`（ブランチ shop/sunao）。前半のコミットは push していない
- **worktree に、止まった前の実行役（参考を Eislab で作った版）の物が未追跡で残っている**：`tools/wa22-gen.mjs`・`wa22-finish.mjs`・`wa22-check.mjs`、`samples/sunao/`（`wa22.json`・`shop.json`・`site.json` など）、`refs/sunao-tmp/`、`docs/gallery/review/sunao/pc-1440.jpg`・`tab-768.jpg`・`sp-390.jpg`。**Eislab の構成なので、そのまま使わない。** SPEC に合わせて作り直すか上書きする（wa-20 の道具を元に作るのが早い）。前半のコミットには入れていない
- 道具は wa-20 と同じ形：`tools/wa22-gen.mjs <店>` → `tools/build.mjs samples/<店>` → `tools/wa22-finish.mjs <店>`、検査 `tools/wa22-check.mjs <店>`。文言は `samples/<店>/wa22.json`、写真は `photos-<店>.txt`
- 品のデータ（`samples/sunao/shop.json`）：括り「定番」（ピスタチオ・ミルク・塩キャラメル・黒胡麻・ヨーグルトとベリー）、「季節」（早生みかん・紅玉りんご・洋梨・いちじく・和栗。旬の札つき）、「サイズと値段」（シングル 550・ダブル 700・トリプル 850・持ち帰りカップ 500ml 2,400。税込）。説明・英字は SPEC 10 章
- 地図：34.722126, 135.303482（国土地理院の住所検索「芦屋市平田町」の代表点）・z=16・hl=ja
- 点検（mikke-web の CLAUDE.md・`docs/gallery/inbox/README.md`）：PC 1440・タブレット 768・スマホ 390 の全体像を `docs/gallery/review/sunao/` に（1 枚 1MB 以下）
- 自分で決めた所（報告に書く）：参考を洋菓子店にした（ジェラート店の個人店が無い）、味の 10 種（季節の 3 種 紅玉りんご・洋梨・和栗は指示に無い。「柑橘」は早生みかんに）、旬の札（はしり・旬・なごり）、指示に無い色（補助の文字 #6B4A3E・差し色 #A13D35・区切り線 #E9DCCB・味の丸の 8 色）、ボタンと写真の角を丸くした（参考は角 0）、よくある質問 4 つの中身、営業の文言の整え
