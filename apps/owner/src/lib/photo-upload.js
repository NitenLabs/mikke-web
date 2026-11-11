// 写真を上げる本文を作る。apps/editor/src/lib/photo-upload.js の写し（import しない。SPEC 1章）に、切り抜きを足した。
// apps/api/README.md「写真の大きさ違い（C3）」の決まりどおり：元の 1 枚（長い辺 2400 まで）＋ 640・1280・2400（のうち幅より小さいもの）と幅の JPEG・WebP。
// 描き直すので撮影データ（位置情報など）は残らない。
import { variantWidths } from "../../../../packages/core/publish/photo.js";
import { limitSize, outputSize } from "./crop.js";

const toBlob = (cv, type, q) => new Promise((res) => { try { cv.toBlob((b) => res(b), type, q); } catch (e) { res(null); } });

/** 選んだ写真を読む（向きは撮影データのとおりに直す）。答え { src, w, h }（長い辺 2400 までに縮めた大きさ） */
export async function loadPhoto(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) {
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); src = img; } finally { URL.revokeObjectURL(url); }
  }
  const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
  const { w, h } = limitSize(W, H);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  return { canvas: cv, w, h };
}

function draw(srcCanvas, rect, w, h) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = "high";
  g.drawImage(srcCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return cv;
}

/**
 * 切り抜いて、上げる本文を作る。
 * @param {HTMLCanvasElement} srcCanvas loadPhoto の canvas
 * @param {{x,y,w,h}} rect 切り抜く枠（srcCanvas の画素）
 * @param {string} baseName
 */
export async function buildCroppedUpload(srcCanvas, rect, baseName) {
  const { w: MW, h: MH } = outputSize(rect);
  const main = await toBlob(draw(srcCanvas, rect, MW, MH), "image/jpeg", 0.85);
  if (!main) throw new Error("写真を作れませんでした");
  const fd = new FormData();
  const safe = String(baseName || "photo").replace(/[^\w.-]+/g, "_").slice(0, 60) || "photo";
  fd.append("file", main, `${safe}.jpg`);
  const widths = variantWidths(MW);
  const jpg = {}, webp = {}; let webpOk = true;
  for (const w of widths) {
    const h = Math.max(1, Math.round(MH * w / MW));
    const cv = draw(srcCanvas, rect, w, h);
    jpg[w] = await toBlob(cv, "image/jpeg", 0.85);
    if (!jpg[w]) throw new Error("写真の大きさ違いを作れませんでした");
    if (webpOk) { const b = await toBlob(cv, "image/webp", 0.85); if (b && b.type === "image/webp") webp[w] = b; else webpOk = false; }
  }
  for (const w of widths) { fd.append(`${w}.jpg`, jpg[w], `${w}.jpg`); if (webpOk) fd.append(`${w}.webp`, webp[w], `${w}.webp`); }
  return { form: fd, width: MW, height: MH };
}
