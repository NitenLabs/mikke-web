// 写真の描画・差し替え・見せる範囲（トリミング）・試験画像
// 線：A3｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// ---- 写真の描画・入口（§1-3）----
// 枠の中身（素材 ID）を reduce 済み content から引く（差し替えを反映）。
function assetOfPart(part, R) {
  const c = R.secContent[secOf(part)]; const b = bareOf(part); let m;
  if (c && (m = b.match(/^F_p(\d)$/))) return c.blocks?.[+m[1]]?.photo?.asset || null;
  if (c && (m = b.match(/^card_photo_(.+)$/))) return c.cards?.find((x) => x.id === m[1])?.photo?.asset || null;
  const a = R.added.find((a) => a.id === part); if (a) return a.asset || null;
  return null;
}
// 各写真枠に、素材の URL と見せる範囲（背景の大きさ・位置）を当てる。枠の大きさ・位置は変えない。
function paintPhotos() {
  const device = state.device; const R = reduce(activeOps(), device, state.peek);
  for (const el of document.querySelectorAll('#stage [data-kind="photo"]')) {
    if (el.classList.contains("empty")) continue;
    const part = el.getAttribute("data-el"); const asset = (el.textContent || "").trim() || el._pAsset || assetOfPart(part, R); el._pAsset = asset;   // F31 作り直さなかった枠は、前に描いた素材のまま
    if (!asset) continue;
    const url = assetUrl(asset); ensureNat(asset);
    if (url) { el.style.backgroundImage = "url(" + url + ")"; el.textContent = ""; }
    const b = (R.brightMap || {})[part] || 0; el.style.filter = b ? ("brightness(" + (1 + b / 100) + ")") : "";   // §5 明るさ（編集・公開とも同じ）
    const nat = assetNat(asset); const view = effView(part, device, R.viewAll);
    const w = el.offsetWidth, h = el.offsetHeight;      // 変換の外＝設計px
    const c = (nat && w && h) ? coverBG(w, h, nat.w, nat.h, view) : null;
    if (c) { el.style.backgroundSize = c.dw + "px " + c.dh + "px"; el.style.backgroundPosition = c.ox + "px " + c.oy + "px"; el.style.backgroundRepeat = "no-repeat"; }
    else { el.style.backgroundSize = "cover"; el.style.backgroundPosition = "center"; }
  }
}
// §3 入口：今の端末の写真の状態
function photosApi() {
  const device = state.device; const R = reduce(activeOps(), device, state.peek); const out = [];
  for (const el of document.querySelectorAll('#stage [data-kind="photo"]')) {
    const part = el.getAttribute("data-el"); const cleared = (R.clear || []).includes(part);   // お店が外した空枠だけ cleared（足したセクションの空枠は missing）
    const asset = assetOfPart(part, R); ensureNat(asset);
    const nat = assetNat(asset); const v = effView(part, device, R.viewAll);
    // §2.3「まだない写真」＝素材がまだ無い枠（足したセクションの写真枠など）。お店が外した空枠（cleared）とは区別する。
    // §5（試験台17）brightness＝枠ごとの明るさ（0が「元のまま」）。added＝§3で足した写真なら true。
    out.push({ part, asset: asset || null, naturalW: nat ? nat.w : null, naturalH: nat ? nat.h : null, cleared, missing: !asset && !cleared, brightness: (R.brightMap || {})[part] || 0, added: isAdded(part), view: { x: +v.x.toFixed(4), y: +v.y.toFixed(4), zoom: +v.zoom.toFixed(4) }, viewOwn: v.own });
  }
  return out;
}
// 差し替え（ファイル→素材→replace op）。読めなければ {ok:false}（呼び手が短い知らせを出す）
async function replacePhotoFile(id, file) {
  const r = await loadImageFile(file); if (!r) return { ok: false };
  commit({ t: "replace", id, asset: r.asset }); return { ok: true, asset: r.asset, w: r.w, h: r.h };
}

// ---- 見せる範囲（§2）＝トリミング。ダブルクリックで入り、ドラッグ／つまみ／横棒／ホイールで直し、Enter で決め Esc で取り消す。----
let crop = null, panBase = null, cornerBase = null;
function beginCrop(id) {
  const g = geometry(); const e = g[id]; if (!e || e.kind !== "photo") return false;
  const R = reduce(activeOps()); if ((R.clear || []).includes(id)) return false;   // 空枠は対象外
  const asset = assetOfPart(id, R); const nat = assetNat(asset); if (!nat) ensureNat(asset);
  const v = effView(id, state.device, R.viewAll);
  crop = { id, device: state.device, view: { x: v.x, y: v.y, zoom: v.zoom }, start: { x: v.x, y: v.y, zoom: v.zoom }, natW: nat ? nat.w : 0, natH: nat ? nat.h : 0, w: e.w, h: e.h };
  selectOnly(id); return true;
}
function cropState() {
  if (!crop) return null;
  const c = coverBG(crop.w, crop.h, crop.natW, crop.natH, crop.view);
  return { id: crop.id, device: crop.device, w: crop.w, h: crop.h, natW: crop.natW, natH: crop.natH, view: { ...crop.view }, display: c ? { dw: c.dw, dh: c.dh, ox: c.ox, oy: c.oy } : null };
}
function cropRefresh() { const c = coverBG(crop.w, crop.h, crop.natW, crop.natH, crop.view); if (c) { crop.view.x = c.x; crop.view.y = c.y; } if (typeof onCrop === "function") onCrop(); }
function cropPanStart() { if (!crop) return; const c = coverBG(crop.w, crop.h, crop.natW, crop.natH, crop.view); panBase = { x: crop.view.x, y: crop.view.y, dw: c ? c.dw : crop.w, dh: c ? c.dh : crop.h }; }
function cropPanBy(ddx, ddy) { if (!crop || !panBase) return; crop.view.x = panBase.x - ddx / panBase.dw; crop.view.y = panBase.y - ddy / panBase.dh; cropRefresh(); }
// 横棒・ホイール＝枠の真ん中を中心に拡大縮小（見ている所が逃げない。N3）
function cropZoomTo(z) { if (!crop) return; crop.view.zoom = Math.min(4, Math.max(1, z)); cropRefresh(); }
function cropWheel(deltaY) { if (!crop) return; cropZoomTo(crop.view.zoom * Math.pow(1.0015, -deltaY)); }
// 四隅のつまみ＝動かしている角の反対の角を止めて拡大縮小（N2）。隙間ができるなら隙間がなくなるよう位置をずらす（clampView が勝つ）。
function cropCornerStart(dir) { if (!crop) return; const c = coverBG(crop.w, crop.h, crop.natW, crop.natH, crop.view); if (!c) return; cornerBase = { dir, ox: c.ox, oy: c.oy, dw: c.dw, dh: c.dh, s0: Math.max(crop.w / crop.natW, crop.h / crop.natH) }; }
function cropCornerBy(ddx, ddy) {
  if (!crop || !cornerBase) return; const b = cornerBase, dir = b.dir, iw = crop.natW, ih = crop.natH;
  const hGrow = /e/.test(dir) ? ddx : (/w/.test(dir) ? -ddx : 0);   // 東の角は右へ＝拡大／西の角は左へ＝拡大
  const base1 = iw * b.s0;                                          // 1倍（覆う最小）の表示幅
  let zoom = Math.min(4, Math.max(1, (b.dw + hGrow) / base1));
  const dw2 = base1 * zoom, dh2 = dw2 * (b.dh / b.dw);
  const ox2 = /w/.test(dir) ? (b.ox + b.dw - dw2) : b.ox;           // 東の角＝左を止める／西の角＝右を止める
  const oy2 = /n/.test(dir) ? (b.oy + b.dh - dh2) : b.oy;           // 南の角＝上を止める／北の角＝下を止める
  const x = (crop.w / 2 - ox2) / dw2, y = (crop.h / 2 - oy2) / dh2;
  crop.view = clampView(crop.w, crop.h, iw, ih, { x, y, zoom });    // 隙間を作らない決まりが勝つ
  cropRefresh();
}
function cropCommit() { if (!crop) return; const id = crop.id, dev = crop.device, v = { ...crop.view }; crop = null; panBase = cornerBase = null; commit({ t: "view", id, device: dev, x: +v.x.toFixed(6), y: +v.y.toFixed(6), zoom: +v.zoom.toFixed(6) }); }
function cropCancel() { if (!crop) return; crop = null; panBase = cornerBase = null; render(); }
const isCropping = () => !!crop;

// ---- プリセット用の試験画像（§6：プリセットの中で作る。四分割の色は4章どおり）----
function quadCanvas(w, h) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d"); g.fillStyle = "#d00000"; g.fillRect(0, 0, w / 2, h / 2); g.fillStyle = "#00a000"; g.fillRect(w / 2, 0, w / 2, h / 2); g.fillStyle = "#0040d0"; g.fillRect(0, h / 2, w / 2, h / 2); g.fillStyle = "#e0c000"; g.fillRect(w / 2, h / 2, w / 2, h / 2); return cv; }
async function quadFile(name, w, h, type) { const cv = quadCanvas(w, h); const blob = await new Promise((res) => cv.toBlob(res, type || "image/jpeg", 0.92)); return new File([blob], name, { type: blob.type }); }
function textFile(name, text) { return new File([text || "これは画像ではありません"], name, { type: "text/plain" }); }

