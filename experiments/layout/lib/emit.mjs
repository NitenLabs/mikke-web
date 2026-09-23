// 絶対配置の primitives を HTML にする（方式Bの書き出し。方式Aは自前で flex/grid を吐く）。
import { textDecls, STYLES, COLORS, DESIGN_W, lbOf } from "./spec.mjs";

const px = (n) => `${Math.round(n * 1000) / 1000}px`;

function textStyleInline(styleName, device) {
  return textDecls(styleName, device).join(";");
}

// primitive: {id,kind,dataKind,x,y,w,h,html,styleName,fill,asset,opacity}
export function emitPrimitive(p, device) {
  const base = `position:absolute;left:${px(p.x)};top:${px(p.y)}`;
  if (p.kind === "text") {
    const lb = lbOf(p.styleName) ? " lb" : "";
    return `<div data-el="${p.id}" data-kind="text" class="t${lb}" style="${base};width:${px(p.w)};${textStyleInline(p.styleName, device)}">${p.html}</div>`;
  }
  if (p.kind === "photo") {
    return `<div data-el="${p.id}" data-kind="photo" class="photo" style="${base};width:${px(p.w)};height:${px(p.h)}">${p.asset || ""}</div>`;
  }
  if (p.kind === "line" || p.kind === "rule") {
    const col = p.kind === "rule" ? COLORS.text : COLORS.line;
    const op = p.opacity != null ? `;opacity:${p.opacity}` : "";
    return `<div data-el="${p.id}" data-kind="line" style="${base};width:${px(p.w)};height:${px(p.h)};background:${col}${op}"></div>`;
  }
  if (p.kind === "region") {
    return `<div data-el="${p.id}" data-kind="region" style="${base};width:${px(p.w)};height:${px(p.h)}"></div>`;
  }
  if (p.kind === "pill") {
    return `<div data-el="${p.id}" data-kind="pill" style="${base};width:${px(p.w)};height:${px(p.h)};border:1px solid ${COLORS.textMuted};border-radius:32px;background:${COLORS.background}"></div>`;
  }
  return "";
}

// 方式Bの1セクション → { bodyHtml, extraCss }
export function emitAbsoluteSection(primitives, sectionH, device, bg) {
  const inner = primitives.map((p) => emitPrimitive(p, device)).join("\n");
  const bodyHtml = `<div id="sec" style="width:${DESIGN_W[device]}px;height:${Math.round(sectionH)}px;background:${bg}">${inner}</div>`;
  return { bodyHtml, extraCss: "" };
}
