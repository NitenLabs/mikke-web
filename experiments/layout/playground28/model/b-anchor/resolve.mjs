// 方式B（基準の木）：各要素は縦の基準を1つ持つ。基準は木なので必ず解ける。
// 本線の settle 実測（文字の高さ）を使い、JS で絶対座標を計算して絶対配置で書き出す。
//
// node: { id, x, w, h, kind, styleName?, text?, html?, fill?,
//         group?:親グループid, anchor:{ref, edge:'top'|'bottom'|'center', self:'top'|'center'|'bottom', gap} }
//   ref: id / [id,...]（いちばん下の端を基準）/ '@section'（セクション内容の上端）/ '@group'（属するグループの上端）
// グループ: kind:'group' の node。h は中身から算出。members は group=このid を持つ node。

const edgeLevel = (n, edge) => {
  if (!n) return 0;
  const top = n._y ?? 0;
  if (edge === "top") return top;
  if (edge === "bottom") return top + (n.h || 0);
  if (edge === "center") return top + (n.h || 0) / 2;
  return top;
};

function baseFromRef(ref, edge, byId, sectionTop, groupTop) {
  const one = (r) => {
    if (r === "@section") return edge === "top" ? sectionTop : sectionTop; // section 上端(=内容の起点)
    if (r === "@group") return edge === "top" ? groupTop : groupTop;
    const n = byId.get(r);
    if (!n || n._y == null) throw new Error(`未解決の基準: ${r}`);
    return edgeLevel(n, edge);
  };
  if (Array.isArray(ref)) return Math.max(...ref.map(one));
  return one(ref);
}

function place(n, base) {
  const self = n.anchor.self || "top";
  const g = n.anchor.gap || 0;
  if (self === "top") n._y = base + g;
  else if (self === "center") n._y = base + g - (n.h || 0) / 2;
  else if (self === "bottom") n._y = base + g - (n.h || 0);
}

// 依存を辿って解く（木なので循環はない前提。あれば例外）。
function resolveSet(nodes, byId, ctx) {
  const pending = new Set(nodes);
  let guard = nodes.length * nodes.length + 10;
  while (pending.size) {
    if (guard-- < 0) throw new Error("基準が解けない（木でない/循環）");
    for (const n of [...pending]) {
      const refs = Array.isArray(n.anchor.ref) ? n.anchor.ref : [n.anchor.ref];
      const ready = refs.every((r) => r === "@section" || r === "@group" || byId.get(r)?._y != null);
      if (!ready) continue;
      const base = baseFromRef(n.anchor.ref, n.anchor.edge, byId, ctx.sectionTop, ctx.groupTop);
      place(n, base);
      pending.delete(n);
    }
  }
}

// 要素を消す：消えた要素を基準にしていた要素は、消えた要素の基準を引き継ぐ（間隔は自分のまま・§2.2）。
export function rebindRemoved(nodes, removedIds) {
  const rm = new Set(removedIds);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (!n.anchor) continue;
    const ref = n.anchor.ref;
    const fix = (r) => (rm.has(r) ? byId.get(r).anchor.ref : r);
    if (Array.isArray(ref)) {
      let out = ref.map(fix).flat().filter((r) => !rm.has(r));
      n.anchor.ref = out.length === 1 ? out[0] : out;
    } else if (rm.has(ref)) {
      n.anchor.ref = byId.get(ref).anchor.ref; // 基準を引き継ぐ
      n.anchor.edge = byId.get(ref).anchor.edge;
    }
  }
  return nodes.filter((n) => !rm.has(n.id));
}

// nodes を解いて、各 node に絶対 y(_y) を入れる。返り値: { nodes, bottom }
export function resolve(nodes, { sectionTop = 0 } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups = nodes.filter((n) => n.kind === "group");

  // 1) グループ内部を相対配置（@group=上端0）してグループ高さを決める
  //    合成ノード（members が無く h を自前で持つ＝I_cards/I_table）は箱として扱う。
  for (const g of groups) {
    const members = nodes.filter((n) => n.group === g.id);
    if (!members.length) continue; // 高さは与えられている
    for (const m of members) m._y = null;
    resolveSet(members, byId, { sectionTop: 0, groupTop: 0 });
    g.h = Math.max(...members.map((m) => (m._y || 0) + (m.h || 0)));
    for (const m of members) m._rel = m._y; // 相対位置を退避
    for (const m of members) m._y = null;   // 絶対解決の前に戻す
  }

  // 2) トップレベル（group を持たない）を絶対解決。グループは1つの箱として扱う。
  const top = nodes.filter((n) => !n.group);
  for (const n of top) if (n.kind !== "group") n._y = null;
  resolveSet(top, byId, { sectionTop, groupTop: 0 });

  // 3) メンバーの絶対位置＝グループ絶対 y ＋ 相対
  for (const g of groups) {
    const members = nodes.filter((n) => n.group === g.id);
    for (const m of members) m._y = (g._y || 0) + (m._rel || 0);
  }

  const bottom = Math.max(...nodes.filter((n) => n.kind !== "group").map((n) => (n._y || 0) + (n.h || 0)));
  return { nodes, bottom };
}
