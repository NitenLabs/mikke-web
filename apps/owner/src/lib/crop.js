// 写真の切り抜きの計算（SPEC 5章）。純粋。座標は元の写真の画素（向きを直し、長い辺 2400 まで縮めた後）。
// 枠の比 aspect＝幅÷高さ（edit-limits の photos.<素材>.aspect.pc）。スマホの枠（aspect.sp）は PC の枠の中に点線で出す。

/** 写真の中に入る、いちばん大きい中央の枠 */
export function fitCrop(imgW, imgH, aspect) {
  let w = imgW, h = w / aspect;
  if (h > imgH) { h = imgH; w = h * aspect; }
  return { x: (imgW - w) / 2, y: (imgH - h) / 2, w, h };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 枠を動かす（写真の外に出さない） */
export function moveCrop(rect, dx, dy, imgW, imgH) {
  return { ...rect, x: clamp(rect.x + dx, 0, imgW - rect.w), y: clamp(rect.y + dy, 0, imgH - rect.h) };
}

/**
 * 枠の大きさを変える（中心を保つ。比は変えない）。scale は「いちばん大きい枠」に対する割合 0.2〜1
 */
export function scaleCrop(rect, scale, imgW, imgH, aspect) {
  const full = fitCrop(imgW, imgH, aspect);
  const s = clamp(scale, 0.2, 1);
  const w = full.w * s, h = full.h * s;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return { x: clamp(cx - w / 2, 0, imgW - w), y: clamp(cy - h / 2, 0, imgH - h), w, h };
}

/** PC の枠の中の、スマホの枠（中央・比 spAspect） */
export function innerRect(rect, spAspect) {
  const f = fitCrop(rect.w, rect.h, spAspect);
  return { x: rect.x + f.x, y: rect.y + f.y, w: f.w, h: f.h };
}

/** 切り抜いた写真の大きさ（整数。長い辺 maxLong まで） */
export function outputSize(rect, maxLong = 2400) {
  const k = Math.min(1, maxLong / Math.max(rect.w, rect.h));
  return { w: Math.max(1, Math.round(rect.w * k)), h: Math.max(1, Math.round(rect.h * k)) };
}

/** 画面の表示の倍率 k（表示＝画素×k）で、画面の動きを写真の画素に直す */
export const toImage = (dPx, k) => dPx / k;

/** 元の写真の大きさを、長い辺 maxLong までに縮めた大きさ */
export function limitSize(w, h, maxLong = 2400) {
  const k = Math.min(1, maxLong / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
