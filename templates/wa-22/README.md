# wa-22：GELATO SUNAO の型（G038、lane2。ID sunao）。参考は parade.kyoto（パレード伏見洋菓子店）。

ミルクの地にチョコの文字、ピスタチオ・いちご・柑橘の面と 10 色の「味の丸」。Kiwi Maru・Zen Kaku Gothic New・Young Serif。ジェラート・アイスの個人店向け。
見せ場は「今日の味」（定番五つを色の丸で 5 列、季節五つをいちごの色の板に写真と行で。旬の札つき）。

- 段の順：ヘッダー → 上の帯（営業）→ 最初の画面（巨大な欧文の文字組と縦長の写真・味の丸の列）→ 今日の味 → サイズと値段（千鳥のカード 3 枚と持ち帰りの行）→ 毎朝のこと（縦書きの見出しと材料 4 つ）→ 海辺の写真の帯 → よくある質問 → お店の案内と地図 → フッター
- 道具：`node tools/wa22-gen.mjs <店>` → `node tools/build.mjs samples/<店>` → `node tools/wa22-finish.mjs <店>`。検査は `node tools/wa22-check.mjs <店>`（14 幅。タブレット 768・834・1024 の列の幅、`<a>` と tel:、ナビとボタンの重なり、押せない飾りのボタン）
- 店ごとの中身：文言・味の色・英字・旬の札は `samples/<店>/wa22.json`、品名・説明・値段は `samples/<店>/shop.json` の品、写真は `photos-<店>.txt`
- 設計書：`SPEC.md`（11 章に組み立てで変えた所）／前半の記録：`STAGE1.md`／後半の記録：`STAGE2.md`／置換表：`terms.md`
