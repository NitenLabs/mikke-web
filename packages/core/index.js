// packages/core：データ・配置・描画のうち、編集画面と公開（サーバー）で同じものを使う部分。
//   spec.js            文字の段・色・書体の値（SPEC）
//   layout/resolve.js  縦の基準の木を解く（RESOLVE）
//   layout/anchor.js   方式B の組み立て（BANCHOR）
//   layout/c3-edit.js  ページの組み立て（特集・品・ヘッダー・フッター・お品書き・アクセス）と付いていく先（C3）
//   text/textlayer.js  改行の層（ブラウザで DOM を測る。TEXT）
//   page-css.js        ページの土台の CSS・書体のリンク
//   content/wa-01.json テンプレート wa-01 の見本の中身
export * as SPEC from "./spec.js";
export * as RESOLVE from "./layout/resolve.js";
export * as BANCHOR from "./layout/anchor.js";
export * as C3 from "./layout/c3-edit.js";
export { TEXT } from "./text/textlayer.js";
export { FONT_LINK, ROOTVARS, BASE_CSS } from "./page-css.js";
