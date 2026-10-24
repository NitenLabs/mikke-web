# packages/core/publish — 公開の一式を作る（線 C）

編集画面の今の中身から、公開用の一式（ページごとの HTML・CSS・sitemap.xml・robots.txt）を作る。
出力はそのまま API の `POST /api/shops/:shopId/publish` の `pages`・`css`・`files`（`apps/api/README.md`「公開の本文」）。

**公開は「編集画面が描いた HTML を送る」**（`docs/plan/ARCHITECTURE.md`）。配置と改行はブラウザで測って決まるので、
編集画面がプレビューと同じ描き方（`state.preview`＋`state._pubGeo`）で各ページ・PC とスマホを描き、その DOM を写し取る。
ここ（`packages/core/publish/`）は写し取ったものを文字列で組み立てるだけ（DOM を使わない＝Node でも動く）。

| ファイル | 中身 |
|---|---|
| `index.js` | `buildBundle(input)`：一式を作る入口。見つからないページ・芦屋みっけへの帯 |
| `photo.js` | 写真の `<picture>`＋`srcset`（大きさ違いの幅の決まり・`sizes`）・共有の画像 |
| `seo.js` | タイトル・説明・OGP・canonical・お店の構造化データ（JSON-LD）・sitemap.xml・robots.txt |
| `css.js` | 公開ページの CSS（`/style.css`）。倍率・端末の切り替え |
| `visibility.js` | 出る品（DATA_SPEC 3.4。`apps/api/src/lib/visibility.ts` と同じ決まり） |
| `site.js` | `/_mikke/site.js` の中身（下の「site.js」） |
| `test/publish.test.mjs` | 形の試験（D5・D6・D8・API の検査）。Node だけ |
| `test/same-shape.test.mjs` | 同じ形かの試験（D2）。Playwright |
| `../../../apps/editor/src/pg/publish-bundle.js` | 編集画面のつなぎ：`PG.buildPublishBundle()`（`window.__playground.buildPublishBundle()` も同じ） |

## 使い方（編集画面から）

```js
const bundle = await PG.buildPublishBundle({
  assets,                 // ④ の一覧（GET /api/shops/:id/assets の .assets）。写真の幅・高さ・説明
  origin: shop.publicUrl, // 公開ページのアドレス（GET /api/shops/:id の publicUrl）。canonical・OGP・sitemap
  // assetMap: { img_1_1600x1000: "ast_xxxx" },  // まだ上げていない写真を上げた後に
  // seo: { pg_menu: { title, description } }, mikkeUrl, noindex, date
});
// bundle.meta.unuploadedAssets が空でなければ、先に写真を上げて assetMap を付けて作り直す（meta.localAssets に中身の data URL）
await fetch(`/api/shops/${id}/publish`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scope: "all", shopDraftVersion, siteDraftVersion, pages: bundle.pages, css: bundle.css, files: bundle.files }) });
```

- Promise を返す（写真の素材の大きさを測り終えるのを待つため）。作っている間、画面は一時的にページ・端末を切り替えて描き、終わったら元のページ・端末・選択・スクロールに戻す
- 今の「公開」ボタン（`pg/store-save.js` の `publish`）にはまだつないでいない（API とのつなぎ＝M3 の担当）

## 出力

```
{
  pages: { "/": "<!doctype html>…", "/menu": …, "/contact": …, "/404": … },
  css:   "…",                                   // /style.css
  files: { "sitemap.xml": "…", "robots.txt": "…" },
  meta:  { date, origin, mikkeUrl, displayedItems:[品の ID], assets:[使った写真の ID], unuploadedAssets:[…], warnings:[{kind,text}], localAssets }
}
```

ページの HTML の形：

```html
<head>
  <title>・description・robots(noindex のときだけ)・canonical・og:*・twitter:card
  <script type="application/ld+json">{お店の LocalBusiness 系}</script>
  Google Fonts（page-css.js の FONT_LINK。今と同じ）・<link rel="stylesheet" href="/style.css">
  <script src="/_mikke/site.js" defer></script>
</head>
<body><div class="mk-root">
  <div class="mk-dev mk-pc" style="--h:3266.2px"><div class="mk-page">
     <div class="mk-sec" id="mk-pc-header" data-sec="header" style="…">…</div> …セクション… <div class="mk-mikke">芦屋みっけへ</div>
  </div></div>
  <div class="mk-dev mk-sp" style="--h:…px"><div class="mk-page">…同じ形でスマホの配置…</div></div>
</div></body>
```

## 入力（`buildBundle(input)`）

| 鍵 | 中身 |
|---|---|
| `shop` | ① お店の情報（今の下書き） |
| `assets` | ④ `{ ast_…: { file:{width,height}, alt } }` |
| `origin` | 公開ページのアドレス（末尾の `/` なし） |
| `date` | 描いた日（日本時間 `YYYY-MM-DD`） |
| `pages` | `[{ id, slug, kind:"home"\|"menu"\|"contact", label, devices:{ pc: Snap, sp: Snap } }]` |
| `seo`・`mikkeUrl`・`noindex` | 上書き（無ければ ① から作る・仮の値・検索に出す） |

`Snap`（1 ページ・1 端末。編集画面の `c_pubSnap` が作る）：

```
{ width: 1440|390, height, sections: [{ id: "feature"|"sec1"…, type, height（設計 px）, html }],
  photos: [{ asset, part, img:{x,y,w,h}（枠の中の表示の位置・大きさ。設計 px）, natW, natH }] }
```

- `html` はプレビューの `#sec` をそのまま写したもの。`id="sec"` → `class="mk-sec" id="mk-<端末>-<セクション>"`、倍率（transform）・編集用の印・`data-*`（`data-el`・`data-kind`・`data-sec` は残す）・`contenteditable` などを外す
- リンク：文の一部のリンク（`span[data-lk]`）・ナビ（`.navitem`）・部品まるごとのリンク（写真・ボタン）を `<a href>` に（よそのサイトは `target="_blank" rel="noopener"`。ページ内は `#mk-<端末>-<セクション>`）。`<a>` の中の `<a>` は作らない（外側だけ）
- 写真の枠は背景を外して `overflow:hidden`、中に `<mk-photo data-i="N">` の印。ここで `<picture>` に置き換える

## 決めたこと

| # | 決めたこと | 理由 |
|---|---|---|
| 1 | 編集画面の DOM（プレビューの描き方）を写し取って HTML にする。配置をここで計算し直さない | D2（±0.5px）。改行・付いていく先・伸び縮みはブラウザで測って決まる。結果は全部 0.02px 未満のずれ |
| 2 | PC とスマホの配置を 1 つの HTML に両方入れ、CSS のメディアクエリで切り替える（768 未満＝スマホ。DATA_SPEC 4.2） | サーバーで端末を見分けない。キャッシュが 1 つで済む |
| 3 | 配置は設計の幅（1440・390）で組み、`transform: scale(--s)` で縮める（編集画面の既定と同じ）。倍率：PC＝min(1, 幅/1440)、スマホ＝390 基準で 0.82〜1.15。320 未満は 0.82 のまま横に流す（7章 Q6・プレビューと同じ） | 文字の大きさを変えて縮める（zoom）と、書体の丸めで改行が変わりうる。transform なら改行はプレビューと同じ |
| 4 | 倍率は CSS だけで出す：`tan(atan2(100cqw, 1440px))` が「幅÷1440」の数になる（`.mk-root` の `container-type:inline-size`。スクロールバーを除いた幅）。`/_mikke/site.js` は、これが使えない古いブラウザ（コンテナの単位・三角関数なし）のときだけ数を入れる | JS を待たずに最初の描画から正しい大きさ（D7）。transform は場所を取らないので、`.mk-dev` に縮めた後の高さ（`--h`×`--s`）を持たせる |
| 5 | スマホの三本線のメニューは作らない（`site.js` に開閉もない） | 今のテンプレート（ヘッダーの builder）はスマホでもナビを横に並べていて、プレビューにも三本線が無い（D2）。三本線を足すならテンプレート（`layout/c3-edit.js` の `buildHeader`）とプレビューから |
| 6 | 写真：`<picture>`（WebP の `<source>`＋JPEG の `<img>`、`srcset` は ④ の幅から 640・1280・2400 の決まり）。見せる範囲は、枠（`overflow:hidden`）の中の `<img>` を `position:absolute` で、編集画面が背景に当てている大きさ・ずれ（設計 px）そのままに置く。`sizes` は表示の幅（PC：`(min-width:1440px) Wpx, W/14.4vw`、スマホ：0.82〜1.15 倍を見込む） | トリミングを CSS で、プレビューと同じ値で。`object-position` だと 1〜4 倍の拡大を表せない |
| 7 | 各端末の配置の最初の写真は `fetchpriority="high"`（遅らせない）、ほかは `loading="lazy"`。最初の写真には、見えない側の端末で 1px の透明な GIF（`data:`）を選ばせる `<source media>` を付ける | D7。両方の配置を持つので、見えない側の写真を読ませない（display:none でも遅らせない写真は読まれる） |
| 8 | 写真の無いページ（お品書き・アクセス）の共有の画像は、トップの最初の写真。共有の画像は 1280 幅（無ければいちばん大きい幅）の JPEG | D5「共有の画像は最初の写真」 |
| 9 | タイトル：トップ「店名｜市・最寄り駅の業種」（例「御菓子司 芦屋堂｜芦屋市・阪神芦屋駅の和菓子店」。handoff 01 の 5.6）、ほか「ページ名｜店名」。説明は ① から（120 字まで）。`seo[pageId]` で上書きできる（下書きに持つ所はまだない） | handoff 01 の 5.6 |
| 10 | 構造化データは全ページに同じ LocalBusiness 系（404 には付けない）。型は業種の名前で：菓子・パン→`Bakery`、カフェ・甘味処→`CafeOrCoffeeShop`、料理→`Restaurant`、ほか `LocalBusiness`。名前・読み・ひとこと・電話（+81 の形）・メール・住所・座標・地図・営業時間（同じ時間の曜日をまとめる。24 時を越える時刻は翌日の時刻）・年末年始などの休み（次に来る期間だけ。`specialOpeningHoursSpecification`）・Instagram と芦屋みっけ（`sameAs`）・創業年。番地を隠すお店は町名まで・座標なし。「第 3 火曜」のような規則は表せないので出さない | D5。番地を隠す決まり（7章 Q5）を守る |
| 11 | JSON-LD は `<script type="application/ld+json">` に、`< > &` を `<` などで書く | API の検査はこの型だけ通すが、中身の「<」＋英字もタグとして読む（`apps/api/src/lib/htmlcheck.ts`）。試験で API の `checkHtml` そのものに通している |
| 12 | 芦屋みっけの掲載ページへのリンク（D8）は、フッターの下の帯（高さ 48 の設計 px・ページと一緒に縮む）。行き先は ① の `mikkeSpotId` があれば `https://ashiya-mikke.jp/spots/<ID>/`、無ければ `https://ashiya-mikke.jp/`（**どちらも仮の値**。`MIKKE_BASE`・`mikkeUrlOf`。`meta.warnings` に出る） | プレビューのフッターは変えない（D2）。芦屋みっけ側の道が決まったら `mikkeUrlOf` を直す。プレビューにも出すなら、テンプレートのフッター（`buildFooter`）に足す |
| 13 | 見つからないページ `/404`：トップのヘッダー・フッターの間に「ページが見つかりません」とトップへのリンク。`noindex`、canonical なし、sitemap に入れない | D5 |
| 14 | sitemap.xml は 3 ページ（`lastmod` は描いた日）。robots.txt は全部許して sitemap を指す。`noindex: true` なら全部断る | D5。試しの環境では noindex |
| 15 | 出す月・販売（D6）は、描いた日（公開した日）のプレビューの出し入れのまま描く。`meta.displayedItems` に 3.4 の決まり（API と同じ数え方）で出る品を入れる | 毎日の描き直し（M4）は API の Cron が「出る品」が変わったお店を挙げて頼む |
| 16 | まだ ④ に上げていない写真（編集画面の `img_…`）は、そのまま `/media/img_…` で書き、`meta.unuploadedAssets`・`meta.localAssets` に出す。`assetMap` で ④ の ID に付け替えて作り直す | 写真を上げる流れ（M3）と分ける |
| 17 | 編集画面の `body` の文字の決まり（14px/1.6 system-ui・#222）と `*{box-sizing:border-box}` を公開ページにも入れる | ナビなど大きさを持たない文字がこれを受け継いでいる |

## 確かめ方

```sh
npm run build:editor
npm run test:publish                                              # 形（D5・D6・D8・API の検査）。Node だけ・数秒
flock <scratchpad>/browser.lock node --test packages/core/publish/test/same-shape.test.mjs   # 同じ形（D2）。約 40 秒
```

`same-shape.test.mjs`：芦屋堂の見本と、手直しをした下書き（見出しの書き換え・写真の差し替えと見せる範囲〔PC とスマホ〕・部品の移動〔PC とスマホ〕・文の一部のリンク・セクションの複製・品の追加）について、
PC 1440・1280・1024、スマホ 390・360・430（指で触る端末＝編集画面の phone の形）で、3 ページそれぞれ

- 編集画面のプレビューと公開ページの、セクションの並び・高さ、全部の部品（`data-el`）の位置・大きさ（設計 px）が ±0.5px
- 文字の部品の折り返し（文字ごとの箱の上端で分けた行）が同じ
- 写真：同じ写真で、見せる範囲（枠の中の写真の位置・大きさ）が ±0.5px、読み込めている
- スマホの倍率がプレビューと同じ、見えている配置が端末どおり、横にはみ出さない
- 公開ページと同じ CSP の下で、止められたもの・スクリプトのエラーが無い。全ページが API の `checkHtml` に通る

公開ページは、作った一式を `https://ashiyado.mikke.test` の答えとして Playwright の `page.route` で手元のファイルから配って開く（`/style.css` のように `/` から始まる道と CSP の確かめのため。file:// では開けない）。
作った一式は `apps/editor/dist/publish/<sample|edited>/` に書き出す。Google Fonts はこの環境では届かないので、編集画面・公開ページとも止めて同じ代わりの書体で比べる。

## /_mikke/site.js（API へ）

中身は `site.js`。`apps/api/src/site-assets.ts` の `SITE_SCRIPTS["site.js"]` にこのファイルの中身をそのまま入れ、`SITE_SCRIPTS_VERSION` を上げる（`apps/api` は線 B／まとめ役の担当なので、ここでは直していない）。

```ts
export const SITE_SCRIPTS: Record<string, string> = { "site.js": `<packages/core/publish/site.js の中身>` };
export const SITE_SCRIPTS_VERSION = "2";
```

## まだのこと
- 「公開」ボタン・`ApiStore` とのつなぎ（M3）。写真を上げて `assetMap` を作る流れ
- 毎日の描き直し（M4）：Browser Rendering で編集画面を開き `buildPublishBundle({ date })` を呼ぶ形を想定
- タブのアイコン（ロゴから）・プライバシーポリシーのページ（handoff 01 の 5.6。v1 はフォームが無いので後）
- 下書きにページごとの検索・共有の文を持つ所（今は `seo` で渡すだけ）。編集画面の「Google ではこう見えます」
