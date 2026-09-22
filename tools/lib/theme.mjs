// 芦屋みっけ Web制作：③見た目の設定を CSS に橋渡しする
// テーマ色は CSS 変数（--c-トークン名）にする＝テーマ色を変えると、参照している箇所が一緒に変わる。
// フォントも CSS 変数（--f-heading/body/accent）にする。

import { fontStack, FONT_REGISTRY } from "./fonts.mjs";

// 色トークンを CSS の値にする。theme:x → var(--c-x)、#RRGGBB → そのまま。
export function colorCss(token) {
  if (!token) return null;
  if (token.startsWith("theme:")) return `var(--c-${token.slice(6)})`;
  return token;
}

// フォント参照を CSS の値にする。font:heading → var(--f-heading)、直接ID → スタック。
export function fontCss(ref) {
  if (!ref) return null;
  if (ref.startsWith("font:")) return `var(--f-${ref.slice(5)})`;
  return fontStack(ref);
}

// テーマから使っているフォントIDを集める（③の fonts）。
export function themeFontIds(theme) {
  return Object.values(theme.fonts || {}).filter((id) => FONT_REGISTRY[id]);
}

// :root に置くCSS変数（色・フォント）を作る。
export function themeRootVars(theme) {
  const lines = [];
  for (const [name, c] of Object.entries(theme.colors || {})) lines.push(`--c-${name}: ${c.value};`);
  for (const [slot, id] of Object.entries(theme.fonts || {})) lines.push(`--f-${slot}: ${fontStack(id)};`);
  return lines;
}

// 文字の役割ごとの標準（③ textStyles）。要素で上書きしていない値の既定。
export function textStyle(theme, role) {
  return theme.textStyles[role] || theme.textStyles.body;
}

// 見出しの階層（検索・読み上げ）：role → HTMLタグ。
export const ROLE_TAG = {
  pageTitle: "h1",
  heading: "h2",
  subheading: "h3",
  body: "p",
  caption: "p",
};
