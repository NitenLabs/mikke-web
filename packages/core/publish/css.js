// 公開ページの CSS（/style.css）。編集画面のプレビューと同じ形にするため：
// - 部品の中身は編集画面と同じ土台の CSS（page-css.js の ROOTVARS・BASE_CSS。#sec は .mk-sec に読み替え）と、
//   編集画面の body の文字の決まり（editor.css の * と body。ナビなど大きさを持たない文字が受け継ぐ）。
// - 配置は設計の幅（PC 1440・スマホ 390）で組み、transform: scale で縮める（編集画面の既定＝ transform と同じ。改行が変わらない）。
//   倍率：PC＝min(1, 幅/1440)、スマホ＝390 を基準に 0.82〜1.15（DATA_SPEC 4.2・7章 Q6）。768 未満はスマホの配置。
//   倍率は CSS だけで出す：tan(atan2(100cqw, 1440px)) が「幅 ÷ 1440」の数になる（コンテナの幅＝スクロールバーを除いた幅）。
//   これが使えない古いブラウザは /_mikke/site.js が --s を数で入れる。
import { DESIGN_W } from "../spec.js";
import { ROOTVARS, BASE_CSS } from "../page-css.js";

export const BREAKPOINT = 768;
export const SP_MIN = 0.82, SP_MAX = 1.15;

export function publishCss({ bodyBg = "#FFFFFF" } = {}) {
  const pc = DESIGN_W.pc, sp = DESIGN_W.sp;
  const base = BASE_CSS.replace(/#sec\b/g, ".mk-sec");
  return [
    "*{box-sizing:border-box}",
    "html,body{margin:0;padding:0}",
    // 編集画面の body と同じ文字の決まり（大きさを持たない文字が受け継ぐ）
    `body{font:14px/1.6 system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif;color:#222;background:${bodyBg};-webkit-text-size-adjust:100%;text-size-adjust:100%}`,
    ROOTVARS,
    base,
    ".mk-root{container-type:inline-size;width:100%}",
    // 倍率（--s）。site.js が数で入れたときはそちら（.mk-js）
    `.mk-pc{--dw:${pc}px;--s:min(1, tan(atan2(100cqw, ${pc}px)))}`,
    `.mk-sp{--dw:${sp}px;--s:clamp(${SP_MIN}, tan(atan2(100cqw, ${sp}px)), ${SP_MAX})}`,
    // 端末の配置の箱：縮めた後の大きさを持つ（transform は場所を取らないので、高さ・幅をここで作る）。広い画面では真ん中に
    ".mk-dev{position:relative;overflow:hidden;height:calc(var(--h) * var(--s));width:calc(var(--dw) * var(--s));margin:0 auto}",
    ".mk-page{position:absolute;left:0;top:0;width:var(--dw);transform-origin:0 0;transform:scale(var(--s))}",
    ".mk-sec{position:relative}",
    // リンク：見た目は部品の文字のまま（下線・色は部品の style が決める）
    ".mk-page a{color:inherit;text-decoration:none}",
    // 芦屋みっけの掲載ページへのリンク（D8）。フッターの下の帯
    ".mk-mikke{display:flex;align-items:center;justify-content:center;height:48px;background:#222222;font:13px/1.4 'Zen Kaku Gothic New',sans-serif;color:#FFFFFF}",
    ".mk-mikke a{opacity:.8;text-decoration:underline;text-underline-offset:3px}",
    // 見つからないページ
    ".mk-404{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:#FFFFFF;color:#333333;text-align:center}",
    ".mk-404 h1{margin:0;font:700 28px/1.4 'Zen Old Mincho',serif;letter-spacing:.1em}",
    ".mk-404 p{margin:0;font:16px/1.8 'Zen Kaku Gothic New',sans-serif}",
    ".mk-404 a{text-decoration:underline;text-underline-offset:4px}",
    // 端末の切り替え（DATA_SPEC 4.2：768 未満はスマホの配置）
    `@media (max-width:${BREAKPOINT - 0.02}px){.mk-pc{display:none}}`,
    `@media (min-width:${BREAKPOINT}px){.mk-sp{display:none}}`,
    "",
  ].join("\n");
}
