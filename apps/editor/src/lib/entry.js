// 編集画面の「ES モジュールの側」の入口。esbuild がここから packages/core などを1つにまとめ、
// 結果をページのスクリプトの先頭で __MIKKE として受け取る（apps/editor/build.mjs）。
// pg/・ui/ のファイルは、前の試験台30 と同じ名前（SPEC・RESOLVE・BANCHOR・C3・TEXT）で使う。
// 形も前と同じ（試験台30 の build.mjs の wrap() が返していた名前だけを持つ、ふつうのオブジェクト）。
import { COLORS, FONT, FONT_URL, ROOT_VARS, STYLES, DESIGN_W, textDecls, setLineBreak, lbState, lbOf } from "../../../../packages/core/spec.js";
import { resolve, rebindRemoved } from "../../../../packages/core/layout/resolve.js";
import * as B from "../../../../packages/core/layout/anchor.js";
import * as C from "../../../../packages/core/layout/c3-edit.js";
export { TEXT } from "../../../../packages/core/text/textlayer.js";

export const SPEC = { COLORS, FONT, FONT_URL, ROOT_VARS, STYLES, DESIGN_W, textDecls, setLineBreak, lbState, lbOf };
export const RESOLVE = { resolve, rebindRemoved };
export const BANCHOR = { collectTextBoxes: B.collectTextBoxes, buildFeature: B.buildFeature, buildItems: B.buildItems };
export const C3 = {
  collectTextBoxes: C.collectTextBoxes, buildFeature: C.buildFeature, buildItems: C.buildItems, buildHeader: C.buildHeader, buildFooter: C.buildFooter,
  buildMenu: C.buildMenu, buildContact: C.buildContact, buildMenuHdr: C.buildMenuHdr, buildContactHdr: C.buildContactHdr, reanchor: C.reanchor,
  placeAnchored: C.placeAnchored, classifyDrop: C.classifyDrop, reorderWithin: C.reorderWithin, sectionMinHeight: C.sectionMinHeight,
  friendly: C.friendly, FRIENDLY: C.FRIENDLY, CLUSTER: C.CLUSTER, REPEAT_GROUP: C.REPEAT_GROUP, floatDefaults: C.floatDefaults,
};
// ① お店の情報から品の並び・表・お品書きを作る（pg/catalog-derive.js が CATALOG として使う）
export * as CATALOG from "../../../../packages/core/catalog.js";
// ① お店の情報の連絡先・場所（pg/shopinfo-pages.js が SHOPINFO として使う。STORE の固定値の代わり）
export * as SHOPINFO from "../../../../packages/core/shopinfo.js";
// 保存先（差し替え口。pg/store-save.js が saveStore として使う）
export { saveStore } from "./store.js";
// 公開の一式を作る（pg/publish-bundle.js が __MIKKE.PUBLISH として使う。線 C）
export * as PUBLISH from "../../../../packages/core/publish/index.js";
