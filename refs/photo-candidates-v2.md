# wa-01 v2 写真の枠 候補（テキスト照合のみ）

**状態：未確定・未ダウンロード。** この会話では画像の添付上限に達し、縮小画像を開けなくなったため、SPEC 7章が求める「縮小画像での目視（トーン・明るさ・色温度のそろい）」と 10.2 の比較画像の目視ができない。以下は各写真の**Unsplashの写真ページの説明文で「主題・顔・ロゴ/文字」だけを確認**した候補。**採用の前に、新しい会話で縮小画像を開いてトーンと顔/ロゴを目視確認すること。**

現状のビルドは 12 枠すべて**プレースホルダのSVG**（`ast_frma`〜`ast_frml`、origin=sample）。採用時に stock（provider=unsplash・撮影者・pageUrl・licensed）へ差し替える。

| 枠 | 用途 | 候補（撮影者 ／ URL ／ テキストで確認できたこと） |
|---|---|---|
| A | FV 背景（暗） | Vicky Ng ／ unsplash.com/photos/Ayy_K-y_dLA ／ 木器の花練り切り・暗い卓上（本会話前半で実寸確認＝暗く顔/ロゴなし）◎ |
| B | 物語 手元 | Haley Truong ／ unsplash.com/photos/NO6rghk3yyc ／ 和菓子を手に取る手元・顔なし・文字なし |
| C | 物語 上生菓子寄り | Andreas Haubold ／ unsplash.com/photos/OTmHU9HdkHo ／ 青皿に上生菓子3種＋抹茶・顔/ロゴなし |
| D | 物語 設え | Vicky Ng ／ unsplash.com/photos/bcPzSVSpN7g ／ 花柄の器（茶）・顔/ロゴなし ※菓子ではなく器 |
| E | FEATURE 上生菓子 | Stephen Pontes ／ unsplash.com/photos/PbMdA9CegYo ／ 黒盆に上生菓子3種・暗め・顔/ロゴなし |
| F | FEATURE 甘味処 | Jelleke Vanooteghem ／ unsplash.com/photos/HKCNiY23Hxw ／ どら焼き・顔/ロゴなし（甘味処＝わらび餅/抹茶が理想。要再探索） |
| G | カード 季節の上生菓子 | 上生菓子の単品寄り（C/E と別カット）。**要再探索**（alt に「季節の上生菓子」を含める） |
| H | カード 芦屋最中 | **未発見**（最中の無地・無文字の写真が Unsplash に乏しい）。無ければ 4.6 により最中をおすすめから外す |
| I | カード わらび餅 | **未発見**（人物写りの候補が多い）。無ければわらび餅をおすすめから外す |
| J | ACCESS 店構え（夕〜夜） | kai muro ／ unsplash.com/photos/--5ImX4dVNo ／ 瓦＋板壁・店名/ロゴなし（ただし昼・青空＝暗さは基準外。夜の格子/軒先を要再探索） |
| K | CONTACT 背景（低ディテール質感・暗） | Peter Gargiulo ／ unsplash.com/photos/cGNCepznaV8 ／ 暗い壁の質感・文字/人なし |
| L | お品書きの帯（横長・暗・中央に文字余白） | Stephen Pontes ／ unsplash.com/photos/PbMdA9CegYo（黒盆・横トリミング）など。**要トーン確認** |

## 未解決（新しい会話で処理）
- **H（最中）・I（わらび餅）の商品写真が見つからない。** SPEC 4.6 は「3件とも写真があること／写真が揃わない品はおすすめから外す」。→ 上生菓子＋どら焼き＋（最中 or わらび餅）で3件そろえるか、見つからなければおすすめの構成（shop.json の `lbl_recommended`）を写真のある品に合わせて組み直す。
- **トーンのそろい（暗め・低照度・色温度）** と **顔/ロゴの最終確認**、**10.2 の比較画像の目視**は、画像を開ける新しい会話で行う（`node tools/compare.mjs <参照元URL> dist/ashiyado` を使う）。
