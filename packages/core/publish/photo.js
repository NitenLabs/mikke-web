// 公開ページの写真：<picture>＋srcset（apps/api/README.md「写真の大きさ違い（C3）」の決まり）と、見せる範囲（トリミング）。
// 見せる範囲は、編集画面が背景で描いている「表示の大きさ・左上のずれ」（設計 px）を、そのまま枠の中の <img> の位置・大きさにする。
import { DESIGN_W } from "../spec.js";

// 大きさ違いの幅：640・1280・2400 のうち W より小さいもの＋W（W は 2400 まで）
export function variantWidths(W) {
  W = Math.min(2400, Math.max(1, Math.round(+W || 0)));
  return [...[640, 1280, 2400].filter((w) => w < W), W];
}
// src に使う幅：1280 があれば 1280、無ければいちばん大きい幅
export function fallbackWidth(widths) { return widths.includes(1280) ? 1280 : widths[widths.length - 1]; }

const r2 = (n) => Math.round(n * 100) / 100;
const attr = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// sizes：その写真の <img> が画面に出る幅（CSS px）。PC は min(1, 画面/1440) 倍、スマホは 390 基準で 0.82〜1.15 倍（4.2・7章 Q6）。
export function sizesFor(device, imgW) {
  const dw = DESIGN_W[device];
  if (device === "pc") return `(min-width: ${dw}px) ${Math.ceil(imgW)}px, ${r2((imgW / dw) * 100)}vw`;
  const hi = Math.ceil(dw * 1.15 - 0.001), lo = Math.floor(dw * 0.82);
  return `(min-width: ${hi}px) ${Math.ceil(imgW * 1.15)}px, (max-width: ${lo}px) ${Math.ceil(imgW * 0.82)}px, ${r2((imgW / dw) * 100)}vw`;
}

// 1x1 の透明な GIF（見えない側の端末の配置で、先に読み込む写真を読ませないため。CSP の img-src は data: を許す）
export const BLANK_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * 1 枚の写真の HTML。
 * p = { asset, img:{x,y,w,h}（枠の中の表示の位置・大きさ。設計 px）, device, eager }
 * meta = ④ の 1 件（file.width・file.height・alt）。無ければ p.natW・p.natH
 */
export function pictureHtml(p, meta) {
  const id = p.asset;
  const W = (meta && meta.file && meta.file.width) || p.natW || 1280;
  const H = (meta && meta.file && meta.file.height) || p.natH || Math.round(W * (p.img.h / p.img.w || 1));
  const widths = variantWidths(W);
  const base = `/media/${id}/`;
  const set = (ext) => widths.map((w) => `${base}${w}.${ext} ${w}w`).join(", ");
  const sizes = sizesFor(p.device, p.img.w);
  const alt = (meta && meta.alt) || p.alt || "";
  const style = `position:absolute;left:${r2(p.img.x)}px;top:${r2(p.img.y)}px;width:${r2(p.img.w)}px;height:${r2(p.img.h)}px;max-width:none;max-height:none;display:block`;
  // 先に読む写真（ファーストビュー）は、見えない側の端末では透明な GIF を選ばせる（両方の配置を 1 つの HTML に持つため）
  const hide = p.eager ? `<source media="${p.device === "pc" ? "(max-width: 767.98px)" : "(min-width: 768px)"}" srcset="${BLANK_GIF}">` : "";
  const load = p.eager ? ` fetchpriority="high"` : ` loading="lazy"`;
  return `<picture>${hide}<source type="image/webp" sizes="${attr(sizes)}" srcset="${attr(set("webp"))}">` +
    `<img src="${base}${fallbackWidth(widths)}.jpg" sizes="${attr(sizes)}" srcset="${attr(set("jpg"))}" width="${W}" height="${H}" alt="${attr(alt)}"${load} decoding="async" style="${style}"></picture>`;
}

// 共有の画像（OGP）に使う道と大きさ：1280 があれば 1280、無ければいちばん大きい幅の JPEG
export function ogImageOf(asset, meta) {
  const W = (meta && meta.file && meta.file.width) || 1280, H = (meta && meta.file && meta.file.height) || null;
  const w = fallbackWidth(variantWidths(W));
  return { path: `/media/${asset}/${w}.jpg`, width: w, height: H ? Math.round((H * w) / W) : null, alt: (meta && meta.alt) || "" };
}
