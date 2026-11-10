# wa-19：Restaurant Lueur（リュウール）の型（G033・lane3）

白 #FAF8F4 の地に黒の文字、銀灰の細い線、深い青の予約の帯。Bodoni Moda の大きな欧文と Noto Serif JP の細字。フレンチ（ガストロノミー寄りの個人店）向け。
見せ場は「コースの流れ」の段（Amuse → Entrée → Poisson → Viande → Dessert を、ローマ数字・欧文の皿の名・和文・短い文で静かに並べる。PC は縦の細い線で区切った 5 列、タブレットは横の線で区切った行、スマホは左に縦の線を 1 本引いた縦の列）。

- 段の順：最初の画面（大きな店名と一皿の写真を離して置く）→ 店のこと（大きさ違いの写真 3 枚と文 3 つを左右に振るコラージュ）→ コースの流れ → お料理（四皿の写真を千鳥に）→ お品書き（昼・夜の 2 列＋ペアリング）→ ご案内（表と白黒の地図）→ ご予約（電話）→ フッター
- 配置：PC（1025 以上）・タブレット（768〜1024、1 列で画面幅の 70% 以上）・スマホ（767 以下）で変える
- 設計書：`SPEC.md`（色・書体・寸法と、STEP 3・STEP 4 で決めたこと）／写真：`photos.txt`（Unsplash）／置換表：`terms.md`
- お店の中身：`samples/<店>/wa19-content.json`（店名・文・コースの流れ・お料理・品書き・値段）。道具に店の中身は書かない

## 作り方
```
node tools/wa19-gen.mjs <店のID>
node tools/build.mjs samples/<店のID>
node tools/wa19-finish.mjs <店のID>
node tools/wa19-check.mjs <店のID>
```
写真を差し替えるときは `photos.txt` の URL を変え、`samples/<店>/media/ast_ph<枠>.webp` を消してから gen を流す（無い写真だけ取りに行く）。
