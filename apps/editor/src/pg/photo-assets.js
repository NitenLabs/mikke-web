// 写真の素材・大きさ・見せる範囲（view）
// 線：A3｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- 写真（§1-2）：素材の中身はページの中だけで持つ（保存しない）。差し替え＝replace op・見せる範囲＝view op。----
// ASSET：素材 ID → 画像の URL。ASSET_NAT：素材 ID → {w,h}（縮めた後・向きを直した後の大きさ）。
const ASSET = (typeof PHOTOS_JSON !== "undefined") ? Object.assign({}, PHOTOS_JSON) : {};
const ASSET_NAT = {};
let assetSeq = 0;
const assetUrl = (id) => ASSET[id] || null;
const assetNat = (id) => ASSET_NAT[id] || null;
// テンプレートの素材の自然な大きさは、読み込んで測る（非同期）。測れたら再描画。
const natPending = {};
function ensureNat(id) {
  if (!id || ASSET_NAT[id] || natPending[id]) return; const url = ASSET[id]; if (!url) return;
  natPending[id] = true; const img = new Image();
  img.onload = () => { ASSET_NAT[id] = { w: img.naturalWidth, h: img.naturalHeight }; if (typeof onRender === "function") onRender(); };
  img.src = url;
}
// 画像ファイルを読み込む：向きを直し、長い辺 2400px まで縮める（0.85 の JPEG）。小さい写真は縮めない。
// 読めなければ null（呼び手が「この写真は読み込めません」を出す）。
async function loadImageFile(file) {
  if (!file) return null;
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) { return null; }
  let w = bmp.width, h = bmp.height; const longest = Math.max(w, h); const MAX = 2400;
  const isPng = /png$/i.test(file.type || "");
  let url, nw = w, nh = h;
  const oriented = (bmp.width !== w || bmp.height !== h); // createImageBitmap は常に向きを直した寸法
  const needScale = longest > MAX;
  if (needScale || !isPng || true) {
    // 向きを焼き込むため常にキャンバスへ。縮めるのは長い辺>2400 のときだけ。
    if (needScale) { const k = MAX / longest; nw = Math.round(w * k); nh = Math.round(h * k); }
    const cv = document.createElement("canvas"); cv.width = nw; cv.height = nh;
    cv.getContext("2d").drawImage(bmp, 0, 0, nw, nh);
    url = isPng && !needScale ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.85);
  }
  bmp.close && bmp.close();
  const id = "img_" + (++assetSeq) + "_" + nw + "x" + nh;
  ASSET[id] = url; ASSET_NAT[id] = { w: nw, h: nh };
  return { asset: id, w: nw, h: nh };
}

const activeOps = () => state.ops.slice(0, state.cursor);

// ---- 見せる範囲（§2）：view=端末ごと {x,y,zoom}。触っていない端末は、触った端末の x,y を引き継ぐ（zoom は 1）。----
const DEF_VIEW = () => ({ x: 0.5, y: 0.5, zoom: 1 });
function effView(part, device, viewAll) {
  const va = (viewAll || {})[part] || {};
  if (va[device]) return { x: va[device].x, y: va[device].y, zoom: va[device].zoom, own: true };
  const other = device === "pc" ? "sp" : "pc";
  if (va[other]) return { x: va[other].x, y: va[other].y, zoom: 1, own: false };
  return { x: 0.5, y: 0.5, zoom: 1, own: false };
}
// 枠 w,h・素材の自然大 iw,ih・view から、背景の表示サイズと左上オフセット（設計px）を出す。画像はいつも枠を覆う＝隙間なし。
function coverBG(w, h, iw, ih, view) {
  if (!iw || !ih) return null;
  const s0 = Math.max(w / iw, h / ih); const dw = iw * s0 * view.zoom, dh = ih * s0 * view.zoom;
  const clampX = (x) => Math.min(1 - w / (2 * dw), Math.max(w / (2 * dw), x));
  const clampY = (y) => Math.min(1 - h / (2 * dh), Math.max(h / (2 * dh), y));
  const x = clampX(view.x), y = clampY(view.y);
  const ox = w / 2 - x * dw, oy = h / 2 - y * dh;
  return { dw, dh, ox, oy, x, y };
}
function clampView(w, h, iw, ih, view) { const c = coverBG(w, h, iw, ih, view); return c ? { x: c.x, y: c.y, zoom: view.zoom } : view; }

