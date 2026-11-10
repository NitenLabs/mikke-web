// 芦屋みっけ Web制作：フォントの一覧（約30種のうち、検証で使う分＋SPECで指名された分）
// 外部から読み込むのは Google Fonts だけ（DATA_SPEC / 手順書）。実際に読み込むのは使っている書体だけ。

export const FONT_REGISTRY = {
  "zen-old-mincho": { family: "Zen Old Mincho", generic: "serif", param: "Zen+Old+Mincho:wght@400;500;600;700;900" },
  "noto-sans-jp": { family: "Noto Sans JP", generic: "sans-serif", param: "Noto+Sans+JP:wght@400;500;700" },
  "shippori-mincho": { family: "Shippori Mincho", generic: "serif", param: "Shippori+Mincho:wght@400;500" },
  "shippori-mincho-b1": { family: "Shippori Mincho B1", generic: "serif", param: "Shippori+Mincho+B1:wght@400;500" },
  "cormorant-garamond-light": { family: "Cormorant Garamond", generic: "serif", param: "Cormorant+Garamond:wght@300;400" },
  "zen-kaku-gothic-new": { family: "Zen Kaku Gothic New", generic: "sans-serif", param: "Zen+Kaku+Gothic+New:wght@400;500;700" },
  "noto-serif-jp": { family: "Noto Serif JP", generic: "serif", param: "Noto+Serif+JP:wght@400" },
  "archivo": { family: "Archivo", generic: "sans-serif", param: "Archivo:wght@400" },
  "lora": { family: "Lora", generic: "serif", param: "Lora:wght@400;600" },
  "montserrat": { family: "Montserrat", generic: "sans-serif", param: "Montserrat:wght@300;400" },
  "cormorant-garamond": { family: "Cormorant Garamond", generic: "serif", param: "Cormorant+Garamond:ital,wght@0,400;0,500;1,300" },
  "la-belle-aurore": { family: "La Belle Aurore", generic: "cursive", param: "La+Belle+Aurore" },
  "eb-garamond": { family: "EB Garamond", generic: "serif", param: "EB+Garamond:ital,wght@0,400;0,500;1,400" },
  "playfair-display": { family: "Playfair Display", generic: "serif", param: "Playfair+Display:ital,wght@0,400;0,500;1,400" },
  "space-mono": { family: "Space Mono", generic: "monospace", param: "Space+Mono:wght@400;700" },
  "manrope": { family: "Manrope", generic: "sans-serif", param: "Manrope:wght@400;500;600;700;800" },
  "fraunces": { family: "Fraunces", generic: "serif", param: "Fraunces:opsz,wght@9..144,400;9..144,600" },
  "caveat": { family: "Caveat", generic: "cursive", param: "Caveat:wght@500" },
  "zen-maru-gothic": { family: "Zen Maru Gothic", generic: "sans-serif", param: "Zen+Maru+Gothic:wght@400;500;700" },
  "hina-mincho": { family: "Hina Mincho", generic: "serif", param: "Hina+Mincho" },
  "cinzel": { family: "Cinzel", generic: "serif", param: "Cinzel:wght@400;500" },
  "cormorant-infant": { family: "Cormorant Infant", generic: "serif", param: "Cormorant+Infant:ital,wght@0,400;0,500;1,400" },
  "libre-caslon-display": { family: "Libre Caslon Display", generic: "serif", param: "Libre+Caslon+Display" },
  "oswald": { family: "Oswald", generic: "sans-serif", param: "Oswald:wght@400;500;700" },
  "dela-gothic-one": { family: "Dela Gothic One", generic: "sans-serif", param: "Dela+Gothic+One" },
  "zen-antique-soft": { family: "Zen Antique Soft", generic: "serif", param: "Zen+Antique+Soft" },
  "shippori-antique-b1": { family: "Shippori Antique B1", generic: "sans-serif", param: "Shippori+Antique+B1" },
};

// フォントID → CSS の font-family スタック
export function fontStack(id) {
  const f = FONT_REGISTRY[id];
  if (!f) return "sans-serif";
  return `"${f.family}", ${f.generic}`;
}

// 使っているフォントIDの集合から Google Fonts の <link> URL を作る。
// display=block：Webフォントが来るまで文字を出さない（代替書体で先に出すと、Webフォント前提で
// 焼いた位置と合わず一瞬重なる／ずれるため）。preconnect と合わせて待ち時間を詰める。
export function googleFontsUrl(ids) {
  const params = [...new Set(ids)]
    .map((id) => FONT_REGISTRY[id]?.param)
    .filter(Boolean)
    .map((p) => `family=${p}`);
  if (!params.length) return null;
  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=block`;
}
