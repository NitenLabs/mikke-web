// 芦屋みっけ Web制作：配置の時点（site.json の layout）で重なっていた要素の組を求める
//   重なり検査の除外を「種類（写真・図形）」ではなく「配置の時点で重なっていた組」にするため。
//   配置の時点で重なっていない組が、表示で重なったら（reflow の伸びなどで）本当の崩れとして報告する。

import { boxWidthPx, ratioHeightPx, designWidth } from "./render.mjs";

// 要素の配置時点の矩形（design px、セクション内座標）。x・w は％→px に直す。
function designRect(el, device, site) {
  const box = el.box[device];
  if (!box) return null;
  const DW = designWidth(site, device);
  const left = (box.x / 100) * DW;
  const width = box.fullBleed ? DW : (box.w / 100) * DW;
  const top = box.y;
  let height = box.h || 0;
  if (el.type === "photo") {
    const w = box.fullBleed ? DW : (box.w / 100) * DW;
    height = ratioHeightPx(box.ratio, w, box.h);
  }
  return { left, top, right: left + width, bottom: top + height };
}

function intersects(a, b) {
  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return ox > 1 && oy > 1;
}

// あるページ・ある端末で、配置の時点で重なっていた要素IDの組（セクション内どうしのみ）。
//   返り値: Set("elA|elB")（IDは辞書順）
export function designOverlapPairs(resolved, sectionIds, device) {
  const { site, elements } = resolved;
  const pairs = new Set();
  for (const secId of sectionIds) {
    const els = [...elements.values()].filter((e) => e.section === secId);
    const rects = els.map((e) => ({ id: e.id, r: designRect(e, device, site) })).filter((x) => x.r);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (intersects(rects[i].r, rects[j].r)) {
          const [a, b] = [rects[i].id, rects[j].id].sort();
          pairs.add(`${a}|${b}`);
        }
      }
    }
  }
  return pairs;
}

// ページ全体（ヘッダー・フッター含む）の配置時点の重なり組を、端末別に集める。
export function pageDesignOverlaps(resolved, sectionIds) {
  return {
    pc: [...designOverlapPairs(resolved, sectionIds, "pc")],
    sp: [...designOverlapPairs(resolved, sectionIds, "sp")],
  };
}
