// 芦屋みっけ Web制作：伸び縮みの規則（参照実装）
//
// 自由配置のサイトで、中身の長さや件数が変わっても重ならず、空欄で消えても穴が開かないための規則。
// データの位置（layout の y）は一切書き換えない。表示するときだけ、ずらした位置を計算する。
//
// 規則（DATA_SPEC 4.3）
//   1. 「上にある」：A の配置したときの下端が B の上端以下で、横の範囲が重なっているとき、A は B の上にある
//   2. 「すぐ上」：B の上にあるもののうち、ほかの「B の上にあるもの」の上にないもの
//   3. 伸びた量：表示中の要素は max(0, 実際の高さ − 配置したときの高さ h)。
//      箱を中身より大きく取ってあれば、その余白の中で伸びる分は下を動かさない
//   4. 消えた要素：−(h ＋ すぐ下の要素までの間隔)。消えた要素と、その下の余白をまとめて詰める
//   5. B のずれ ＝ 「すぐ上」の各要素の（ずれ ＋ 伸びた量）の最大値。上に何もなければ 0
//   6. 包まれている要素：写真の上に重ねた見出しのように、B の上にある別の要素 Q の縦の範囲の内側に
//      収まっている要素 P は、Q からはみ出した分だけ B を押す（内側で伸びる分は B を動かさない）
//   7. セクションの高さも同じ規則で決める（セクションの下端を、高さ0の全幅の要素とみなす）。
//      ただし中身の一番下より低くはしない
//   8. 飾り（図形・背景写真・背景色だけの要素＝decorative:true）以外の要素がすべて消えたセクションは、
//      セクションごと表示しない（戻り値の hidden=true）。飾りしか残らないセクションを出さないため。
//   横に並んだ2列は互いに影響しない（横の範囲が重ならないため）。写真の上に重ねた文字のように
//   縦の範囲が重なっているものどうしも、互いに影響しない。
//   端末（PC・スマホ）ごとに別々に計算する。

const EPS = 1; // 1px 以内の差は「接している」とみなす

/**
 * @param {Array<{id:string,x:number,w:number,y:number,h:number,actualH:number,hidden?:boolean,decorative?:boolean}>} els
 *   1つのセクション・1つの端末の要素。x・w は％、y・h・actualH は px（配置の基準の幅で）。
 *   decorative:true は飾り（図形・背景写真・背景色だけの要素）。規則8の判定に使う
 * @param {number} sectionMinH 配置したときのセクションの高さ
 * @returns {{y: Record<string, number>, sectionH: number, hidden: boolean}}
 *   hidden=true は「飾り以外の要素がすべて消えた＝セクションごと表示しない」（規則8）
 */
export function reflow(els, sectionMinH) {
  // セクションの下端を「高さ0の全幅の要素」として足し、同じ規則でセクションの高さも決める
  const END = { id: "__end", x: 0, w: 100, y: sectionMinH, h: 0, actualH: 0 };
  const all = [...els, END];
  const bottom = (e) => e.y + e.h;
  const overlapX = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01;
  const above = (a, b) => a !== b && bottom(a) <= b.y + EPS && overlapX(a, b);
  // Q が P を縦に包んでいる（横にも重なっていて、P の上端〜下端が Q の範囲の内側。写真の上の見出しなど）
  const contains = (q, p) => q !== p && overlapX(q, p) && q.y <= p.y + EPS && bottom(q) >= bottom(p) - EPS;

  const preds = new Map(all.map((b) => [b, els.filter((a) => above(a, b))]));
  const direct = new Map(
    all.map((b) => {
      const ps = preds.get(b);
      return [b, ps.filter((p) => !ps.some((q) => q !== p && above(p, q)))];
    })
  );
  const succ = new Map(els.map((a) => [a, all.filter((b) => direct.get(b).includes(a))]));

  const delta = new Map(
    els.map((e) => {
      if (!e.hidden) return [e, Math.max(0, e.actualH - e.h)];
      const gaps = succ.get(e).map((b) => b.y - bottom(e));
      const gapBelow = gaps.length ? Math.max(0, Math.min(...gaps)) : 0;
      return [e, -(e.h + gapBelow)];
    })
  );

  const shift = new Map();
  const newBottom = (e) => e.y + shift.get(e) + e.h + delta.get(e);
  const order = [...all].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const b of order) {
    const ps = preds.get(b);
    const contribs = direct.get(b).map((p) => {
      // p が、b の上にある別の要素 q に縦に包まれているなら、p が押すのは q からはみ出した分だけ
      const qs = ps.filter((q) => contains(q, p));
      if (!qs.length) return shift.get(p) + delta.get(p);
      const q = qs.reduce((m, x) => (bottom(x) > bottom(m) ? x : m));
      const base = shift.get(q) + delta.get(q);
      return p.hidden ? base : base + Math.max(0, newBottom(p) - newBottom(q));
    });
    shift.set(b, contribs.length ? Math.max(...contribs) : 0);
  }

  const y = Object.fromEntries(els.map((e) => [e.id, e.y + shift.get(e)]));
  const contentBottom = Math.max(0, ...els.filter((e) => !e.hidden).map((e) => y[e.id] + Math.max(e.h, e.actualH)));
  // 規則8：飾り（decorative）以外の要素がすべて消えたら、セクションごと表示しない
  const sectionHidden = els.filter((e) => !e.decorative).every((e) => e.hidden);
  return { y, sectionH: Math.max(sectionMinH + shift.get(END), contentBottom), hidden: sectionHidden };
}
