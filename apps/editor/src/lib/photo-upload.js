// 写真を上げる本文を作る（M3・C2・C3）。apps/api/README.md「写真の大きさ違い（C3）」の決まりどおり。
// 元にするのは、編集画面が選んだ写真を読んだときに作ったデータ（pg/photo-assets.js の loadImageFile）：
// 向きを直して長い辺 2400px まで縮め、キャンバスに描き直したもの（＝位置情報などの撮影データは残っていない。
// HEIC はブラウザが読めればここで JPEG になり、読めなければ編集画面が「この写真は読み込めません」を出す）。
// ここではそれを「file」に、幅 640・1280・2400（のうち写真の幅より小さいもの）と写真の幅の JPEG・WebP を作って添える。
import { variantWidths } from "../../../../packages/core/publish/photo.js";

const toBlob = (cv, type, q) => new Promise((res) => { try { cv.toBlob((b) => res(b), type, q); } catch (e) { res(null); } });

async function decode(blob) {
  if (typeof createImageBitmap === "function") { try { return await createImageBitmap(blob); } catch (e) {} }
  const url = URL.createObjectURL(blob);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}
const dims = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

// 写真をキャンバスに描き直す（撮影データを持たない形にする）。長い辺は 2400 まで
function redraw(src, w, h, opaque) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  if (opaque) { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }   // JPEG は透けないので白に
  g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, w, h);
  return cv;
}

/**
 * @param {string|Blob} source  data URL か Blob
 * @param {string} baseName     ファイルの名前（拡張子なし）
 * @returns {Promise<FormData>}  POST /api/shops/:id/assets に送る本文
 */
export async function buildUploadForm(source, baseName) {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const img = await decode(blob);
  let { w: W, h: H } = dims(img);
  const k = Math.min(1, 2400 / Math.max(W, H));
  const MW = Math.max(1, Math.round(W * k)), MH = Math.max(1, Math.round(H * k));
  const png = blob.type === "image/png";
  // 元の 1 枚：いつも描き直す（データ URL のままでも、外から来た Blob でも同じ扱い）
  const main = await toBlob(redraw(img, MW, MH, !png), png ? "image/png" : "image/jpeg", 0.85);
  if (!main) throw new Error("写真を作れませんでした");
  const fd = new FormData();
  const safe = String(baseName || "photo").replace(/[^\w.-]+/g, "_").slice(0, 60);
  fd.append("file", main, `${safe}.${png ? "png" : "jpg"}`);
  const widths = variantWidths(MW);
  const jpg = {}, webp = {}; let webpOk = true;
  for (const w of widths) {
    const h = Math.max(1, Math.round(MH * w / MW));
    const cv = redraw(img, w, h, true);
    jpg[w] = await toBlob(cv, "image/jpeg", 0.85);
    if (!jpg[w]) throw new Error("写真の大きさ違いを作れませんでした");
    if (webpOk) { const b = await toBlob(cv, "image/webp", 0.85); if (b && b.type === "image/webp") webp[w] = b; else webpOk = false; }   // WebP を作れないブラウザでは送らない（全部かなし）
  }
  for (const w of widths) { fd.append(`${w}.jpg`, jpg[w], `${w}.jpg`); if (webpOk) fd.append(`${w}.webp`, webp[w], `${w}.webp`); }
  if (img.close) img.close();
  return fd;
}
