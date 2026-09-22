// 芦屋みっけ Web制作：フォントの一覧（約30種のうち、検証で使う分＋SPECで指名された分）
// 外部から読み込むのは Google Fonts だけ（DATA_SPEC / 手順書）。実際に読み込むのは使っている書体だけ。

export const FONT_REGISTRY = {
  "zen-old-mincho": { family: "Zen Old Mincho", generic: "serif", param: "Zen+Old+Mincho:wght@400;500;700;900" },
  "noto-sans-jp": { family: "Noto Sans JP", generic: "sans-serif", param: "Noto+Sans+JP:wght@400;500;700" },
  "shippori-mincho": { family: "Shippori Mincho", generic: "serif", param: "Shippori+Mincho:wght@400;500;700" },
  "zen-kaku-gothic-new": { family: "Zen Kaku Gothic New", generic: "sans-serif", param: "Zen+Kaku+Gothic+New:wght@400;500;700" },
  "eb-garamond": { family: "EB Garamond", generic: "serif", param: "EB+Garamond:ital,wght@0,400;0,500;1,400" },
  "space-mono": { family: "Space Mono", generic: "monospace", param: "Space+Mono:wght@400;700" },
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
