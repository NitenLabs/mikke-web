// wa-01 layout-compare 実験：文字の段・色・書体（本線 SPEC v2 / theme.json と同じ値）。
// この実験だけで完結する（本線を書き換えない）。値は claude_code_design_spec 相当。

export const COLORS = {
  background: "#FFFFFF", surface: "#EEEEEE", text: "#333333",
  textMuted: "#7B7B7B", line: "#B0B0B0", dark: "#333333", deep: "#222222", onDark: "#FFFFFF",
};
// インライン style（style="...") に入れるので、フォント名は単引用符にする（二重引用符は属性を壊す）。
export const FONT = {
  heading: "'Zen Old Mincho', serif",
  body: "'Zen Kaku Gothic New', sans-serif",
};
// Google Fonts（本線 fonts.mjs と同じ family/param。実測=描画で同じ subset を読む）
export const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;500;600;700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=block";

// :root に置く CSS 変数（色）。本線 themeRootVars と同じ意味。
export const ROOT_VARS = Object.entries(COLORS).map(([k, v]) => `--c-${k}: ${v};`);

// 文字の役割ごとの段（SPEC v2 §2 / site.json の各要素の style と一致）。
// size/lh は px（lh は size×倍率）、ls は em、color はトークン、align、lb(改行規則)、heading(見出し扱い)。
const S = (o) => ({ ls: 0, weight: 400, color: "text", align: "left", lb: true, heading: false, ...o });
export const STYLES = {
  // 見出しの組（4.0）
  lbl:      S({ font: "heading", size: { pc: 16, sp: 14 }, lhMul: 1.4, weight: 900, ls: 0,   color: "text", align: "center", lb: false }),
  secHead:  S({ font: "heading", size: { pc: 28, sp: 20 }, lhMul: 1.4, weight: 700, ls: 0.1, color: "text", align: "center", heading: true }),
  // FEATURE
  featHead: S({ font: "heading", size: { pc: 24, sp: 16 }, lhMul: 1.8, weight: 700, ls: 0.1, color: "text", align: "left", heading: true }),
  featBody: S({ font: "body",    size: { pc: 16, sp: 14 }, lhMul: 1.8, weight: 400, ls: 0,   color: "text", align: "left" }),
  // ITEMS カード
  cardName: S({ font: "heading", size: { pc: 16, sp: 16 }, lhMul: 1.8, weight: 700, ls: 0.1, color: "text", align: "left", heading: true }),
  cardDesc: S({ font: "body",    size: { pc: 14, sp: 14 }, lhMul: 1.6, weight: 400, ls: 0.1, color: "textMuted", align: "left" }),
  cardPrice:S({ font: "heading", size: { pc: 16, sp: 14 }, lhMul: 1.4, weight: 700, ls: 0,   color: "text", align: "left" }),
  // ITEMS 甘味処
  kanmiLbl: S({ font: "heading", size: { pc: 24, sp: 18 }, lhMul: 1.4, weight: 700, ls: 0.1, color: "text", align: "center", heading: true }),
  kanmiTime:S({ font: "heading", size: { pc: 14, sp: 14 }, lhMul: 1.6, weight: 400, ls: 0,   color: "textMuted", align: "center", lb: false }),
  tName:    S({ font: "heading", size: { pc: 16, sp: 16 }, lhMul: 1.8, weight: 700, ls: 0,   color: "text", align: "left", heading: true }),
  tDesc:    S({ font: "body",    size: { pc: 14, sp: 14 }, lhMul: 1.6, weight: 400, ls: 0.1, color: "textMuted", align: "left" }),
  tPriceR:  S({ font: "heading", size: { pc: 16, sp: 14 }, lhMul: 1.4, weight: 700, ls: 0,   color: "text", align: "right", lb: false }),
  tPriceL:  S({ font: "heading", size: { pc: 16, sp: 14 }, lhMul: 1.4, weight: 700, ls: 0,   color: "text", align: "left", lb: false }),
  pill:     S({ font: "heading", size: { pc: 16, sp: 16 }, lhMul: 1.4, weight: 700, ls: 0,   color: "text", align: "center", lb: false }),
};

export const DESIGN_W = { pc: 1440, sp: 390 };

// 改行の規則（R1 keep-all＋BudouX）の入切。clone-q65 は lineBreakRules:false なので G2 は切る。
let _lb = true;
export const setLineBreak = (v) => { _lb = v; };
export const lbState = () => _lb;
export const lbOf = (styleName) => STYLES[styleName].lb && _lb;

// 文字要素の CSS 宣言（本線 measure.mjs / page.mjs と同じ規則で組む＝実測と描画が一致する）。
// px で組む（このページは :root font-size:10px、原寸 1:1 で測る／描く）。
export function textDecls(styleName, device) {
  const st = STYLES[styleName];
  const size = st.size[device];
  const decls = [
    `font-family:${FONT[st.font]}`,
    `font-size:${size}px`,
    `line-height:${st.lhMul}`,
    `font-weight:${st.weight}`,
    `color:${COLORS[st.color]}`,
    `text-align:${st.align}`,
  ];
  if (st.ls) decls.push(`letter-spacing:${st.ls}em`);
  return decls;
}
