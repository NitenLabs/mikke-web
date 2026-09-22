// 芦屋みっけ Web制作：素材（写真）の書き出し
// サンプルの店には実物の写真ファイルが無いので、台帳（④）の大きさ・説明文から
// プレースホルダのSVGを作る。実在の店では実際の画像を配置する差し替え地点になる。

import fs from "node:fs";
import path from "node:path";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 使っている写真のIDを集める（要素・カードの品・セクション背景・共有画像）
export function collectUsedAssets(data) {
  const { site, shop } = data;
  const used = new Set();
  for (const el of Object.values(site.elements)) {
    if (el.type === "photo" && el.asset) used.add(el.asset);
    if (el.type === "repeater") {
      // カードで品の写真（/photos/0）を使う → 品の先頭写真
      for (const it of Object.values(shop.catalog.items)) if (it.photos?.[0]) used.add(it.photos[0]);
    }
  }
  for (const s of Object.values(site.sections)) if (s.background?.photo?.asset) used.add(s.background.photo.asset);
  for (const p of Object.values(site.pages)) if (p.seo?.shareImage) used.add(p.seo.shareImage);
  return used;
}

function placeholderSvg(asset, label) {
  const w = asset.file?.width || 1200;
  const h = asset.file?.height || 800;
  const bg = "#E7E1D6", stroke = "#C9BEA8", fg = "#8A7F6B";
  const fontSize = Math.round(Math.min(w, h) / 16);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <rect x="${w * 0.06}" y="${h * 0.06}" width="${w * 0.88}" height="${h * 0.88}" fill="none" stroke="${stroke}" stroke-width="${Math.max(2, w / 400)}"/>
  <circle cx="${w / 2}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.12}" fill="none" stroke="${stroke}" stroke-width="${Math.max(2, w / 400)}"/>
  <text x="50%" y="${h * 0.68}" fill="${fg}" font-family="sans-serif" font-size="${fontSize}" text-anchor="middle">${esc(label)}</text>
  <text x="50%" y="${h * 0.68 + fontSize * 1.4}" fill="${fg}" font-family="sans-serif" font-size="${Math.round(fontSize * 0.7)}" text-anchor="middle">（サンプル写真）</text>
</svg>`;
}

export function writeAssets(data, outDir) {
  const used = collectUsedAssets(data);
  const dir = path.join(outDir, "assets");
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const id of used) {
    const asset = data.assets.assets[id];
    if (!asset) continue;
    const label = asset.alt || id;
    fs.writeFileSync(path.join(dir, `${id}.svg`), placeholderSvg(asset, label));
    written.push(`assets/${id}.svg`);
  }
  return written;
}
