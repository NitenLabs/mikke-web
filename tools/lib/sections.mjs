// 芦屋みっけ Web制作：セクションの背景色の決定（純粋）
// DATA_SPEC 4.1「背景の交互（background.alternate）」に対応。
//   alternate=true のセクションは、表示されているセクションの順番で theme:background と
//   theme:surface を交互に使う（非表示のセクションがあってもずれない）。color が明示されていれば優先。

// orderedSections: [{ id, hidden, background }]（ページのセクションの並び順、ヘッダー・フッター除く）
// 返り値: { id -> 背景色（theme:... か #RRGGBB） または null（背景色なし） }
export function computeSectionBackgrounds(orderedSections) {
  const out = {};
  let visibleIndex = 0; // 表示されているセクションの通し番号（0始まり）
  for (const s of orderedSections) {
    if (s.hidden) { out[s.id] = null; continue; } // 非表示は番号を進めない
    const bg = s.background || {};
    if (bg.color) {
      out[s.id] = bg.color;
    } else if (bg.alternate) {
      out[s.id] = visibleIndex % 2 === 0 ? "theme:background" : "theme:surface";
    } else {
      out[s.id] = null;
    }
    visibleIndex++;
  }
  return out;
}
