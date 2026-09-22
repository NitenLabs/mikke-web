// 芦屋みっけ Web制作：素材（写真）の書き出し
//   - 架空のサンプルの店（isSample=true）だけ、台帳（④）の大きさ・説明文から
//     プレースホルダのSVGを作れる（DATA_SPEC 5.2「サンプルの店だけ stock を実物枠に使える」に対応）。
//   - 実在の店では、参照している素材の実ファイルが無ければ書き出しを止めてエラーにする
//     （仮の写真で公開して、お客さんに実物と誤解させないため）。

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

// 実在の店で、素材の実ファイルを探す場所（台帳の file.key を基準に）
function findRealFile(dataDir, key) {
  if (!key) return null;
  const cands = [
    path.join(dataDir, "media", key),
    path.join(dataDir, key),
    path.join(dataDir, "assets", key),
  ];
  return cands.find((p) => fs.existsSync(p)) || null;
}

// 素材を dist/<name>/assets/ に用意する。
//   返り値: { files: { astId -> 出力ファイル名 }, errors: [文字列] }
export function prepareAssets(data, dataDir, outDir) {
  const used = collectUsedAssets(data);
  const dir = path.join(outDir, "assets");
  fs.mkdirSync(dir, { recursive: true });
  const files = {}, errors = [];
  const isSample = data.shop.isSample === true;

  for (const id of used) {
    const asset = data.assets.assets[id];
    if (!asset) { errors.push(`写真 ${id} が素材置き場（④）にありません`); continue; }

    // 実ファイルがあれば（サンプルでも）それを使う（ダウンロード済みの stock 写真など）
    const key = asset.file?.key;
    const real = findRealFile(dataDir, key);
    if (real) {
      const ext = path.extname(real) || ".jpg";
      fs.copyFileSync(real, path.join(dir, `${id}${ext}`));
      files[id] = `${id}${ext}`;
    } else if (isSample) {
      // サンプルの店で実ファイルが無ければ仮の写真（SVG）
      fs.writeFileSync(path.join(dir, `${id}.svg`), placeholderSvg(asset, asset.alt || id));
      files[id] = `${id}.svg`;
    } else {
      // 実在の店：実ファイルが無ければエラー（仮の写真は使わない）
      errors.push(`写真 ${id}（${key || "file.key 無し"}）の実ファイルが見つかりません。実在の店では仮の写真を使いません`);
    }
  }
  return { files, errors };
}
