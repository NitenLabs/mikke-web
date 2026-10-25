// 部品 ID の名前空間（素の ID・インスタンス）・見出しの組・動かせる部品・セクションの割り当て
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
const M = C3; // 唯一の方式
const base = () => JSON.parse(JSON.stringify(CONTENT_JSON));
const clone = (o) => JSON.parse(JSON.stringify(o));
const S1_ADD = "毎朝炊いた餡を、その日のうちにお出しします。手のひらにのる小さな菓子に、季節のうつろいを写します。四季折々の意匠をお楽しみください。";
const S2_HEAD = "季節の上生菓子と、その月だけの特別な意匠";

// §2 部品 ID の名前空間：最初からある特集・品（anchor）は素の ID（F_h0 など）のまま。複製・追加したセクションの部品だけ
// 「セクションID__素のID」（例 sec3__F_h0）にして重ならないようにする。bareOf/instTag/prefixOf で素とインスタンスを分ける。
const SEP = "__";
const bareOf = (id) => { const i = id.indexOf(SEP); return i >= 0 ? id.slice(i + 2) : id; };
const instTag = (id) => { const i = id.indexOf(SEP); return i >= 0 ? id.slice(0, i) : null; };
const prefixOf = (id) => { const t = instTag(id); return t ? t + SEP : ""; };
const withPfx = (pfx, id) => (pfx ? pfx + id : id);
const HG = { feature: "F_hg", items: "I_hg" };
// §5：表・品の並び・ボタンも動かせる（I_table / I_cards / I_pillbg を足す）
const TEMPLATE_DRAG = ["F_hg", "F_p0", "F_h0", "F_b0", "F_p1", "F_h1", "F_b1", "I_hg", "I_cards", "I_divider", "I_kanmi", "I_time", "I_table", "I_pillbg"];
// ボタンは文字(I_pilltext)と背景(I_pillbg)を一緒に扱う＝文字クリックでも背景を選ぶ（§5）
const HG_MEMBERS = { F_lbl: "F_hg", F_h: "F_hg", F_rule: "F_hg", I_lbl: "I_hg", I_h: "I_hg", I_rule: "I_hg", I_pilltext: "I_pillbg" };
// 繰り返す部品を中に持つ子（品の並び・表）：中の1件・文字が属するグループ（同じインスタンスの中）
const groupOf = (id) => { const b = bareOf(id); const g = /^card_/.test(b) ? "I_cards" : (/^row_/.test(b) ? "I_table" : null); return g ? withPfx(prefixOf(id), g) : null; };
const REPEAT = /^(card_|row_)/;
const isRepeat = (id) => REPEAT.test(bareOf(id));
const canonId = (id) => { const c = HG_MEMBERS[bareOf(id)]; return c ? withPfx(prefixOf(id), c) : id; };
const isAdded = (id) => /^addp?_/.test(id);
const isDraggable = (id) => TEMPLATE_DRAG.includes(bareOf(canonId(id))) || isAdded(id);
// 試験台28：新しいページ（ヘッダー・フッター・MENU・CONTACT）の文字の素の ID
const NEW_TEXT_BARE = new Set(["logo", "fname", "faddr", "fcopy", "men", "mtitle", "cen", "ctitle", "clead"]);
// mt_（提供時間）はこの段では直接書き換えない（§2.6 の箱で直す＝Stage 3）。描画はする。
const isNewText = (b) => NEW_TEXT_BARE.has(b) || /^(mg_|mc_|cl_|ci_)/.test(b);
const isText = (id) => { const b = bareOf(id); return /^F_[hb]\d$|^add_/.test(b) || /^card_(name|desc|price)_/.test(b) || /^row_(name|desc|price)_/.test(b) || b === "I_kanmi" || b === "I_time" || isNewText(b); };
// そのパーツが属するセクション（インスタンス ID）。anchor は "feature"/"items"、複製・追加は "sec3" 等。
// §2.7（試験台24）土台にある足した部品にも効くよう、add op が記録の列に無ければ土台（state.base._pg.adds）も見る。
// J17（DECISIONS #17）部品を別のセクションへ移す（同じ ID のまま）。homeSec＝テンプレの部品が生まれたセクション（中身＝文字・写真はここの content にある）。
// 移した先は「記録の列の xsec」と「土台の relocated（DATA_SPEC 4.9.3）」から。足した部品は xsec だけ（土台では added[].section／anchor に入っている）。
const homeSec = (id) => { const t = instTag(id); if (t) return t; return id.startsWith("F_") ? "feature" : "items"; };
let _mvc = null;
function movedSecMap() {
  if (_mvc && _mvc.base === state.base && _mvc.ops === state.ops && _mvc.cursor === state.cursor) return _mvc.map;
  const m = {}; const b = state.base;
  if (b && b.relocated) for (const k in b.relocated) if (b.relocated[k] && b.relocated[k].section) m[k] = b.relocated[k].section;
  for (const op of activeOps()) if (op.t === "xsec") for (const it of op.items) { if (!isAdded(it.id) && it.to === homeSec(it.id)) delete m[it.id]; else m[it.id] = it.to; }
  _mvc = { base: state.base, ops: state.ops, cursor: state.cursor, map: m };
  return m;
}
// テンプレの部品で、今は生まれたのと別のセクションにあるもの（足した部品は含めない）
const isCarried = (id) => !isAdded(id) && Object.prototype.hasOwnProperty.call(movedSecMap(), id);
// 絶対配置だけで置かれる部品（足した部品・別のセクションへ移した部品）＝流れの中の M1 を持たない
const isFloat = (id) => isAdded(id) || isCarried(id);
// 別のセクションへ移せる部品：足した部品と、特集の写真・見出し・本文、甘味処の見出し・時間。
// 品の並び・表（① とつながる）・中の1件・セクションの見出しの組・区切り線・ボタン・ヘッダー/フッターの部品は移せない
const CROSS_BARE = /^(F_p\d|F_h\d|F_b\d|I_kanmi|I_time)$/;
const canCrossSec = (id) => isAdded(id) || CROSS_BARE.test(bareOf(id));
const secOf = (id) => { const mv = movedSecMap()[id]; if (mv) return mv; const t = instTag(id); if (t) return t; if (isAdded(id)) { const op = activeOps().find((o) => o.t === "add" && o.id === id); if (op) return op.section; const ba = ((state.base && state.base.added) || []).find((a) => a.id === id); if (ba) return ba.section || secOf(ba.anchor); return "items"; } return id.startsWith("F_") ? "feature" : "items"; };
// 並び替え（§6／§10.1）：縦に並んだ塊の中だけ。PC は文字の塊（見出し・本文）＝写真は横並びで対象外。SP はブロック（写真・見出し・本文）。
function reorderClusterOf(id) {
  if (isCarried(id)) return null;   // J17 別のセクションへ移した部品は縦積みの塊の外（絶対配置だけ）
  const dev = state.device; const pfx = prefixOf(id); const b = bareOf(id);
  const keep = (rc) => { if (!rc) return rc; const sibs = rc.sibs.filter((s) => !isCarried(s)); return { key: rc.key, sibs }; };   // 移した兄弟は相手にしない
  for (const i of [0, 1]) { if (b === `F_h${i}` || b === `F_b${i}` || b === `F_p${i}`) {
    if (dev === "pc") return b === `F_p${i}` ? null : keep({ key: pfx + `Ftg${i}`, sibs: [pfx + `F_h${i}`, pfx + `F_b${i}`] });
    return keep({ key: pfx + `Fblk${i}`, sibs: [pfx + `F_p${i}`, pfx + `F_h${i}`, pfx + `F_b${i}`] });
  } }
  // 品のセクションの stack の縦積みの直接の子すべてが並び替えの相手（§3・§5）。中の1件・文字はグループに畳む（I_pilltext→I_pillbg は canonId 済み）
  if (["I_cards", "I_divider", "I_kanmi", "I_time", "I_table", "I_pillbg"].includes(b)) return keep({ key: pfx + "Istack", sibs: ["I_cards", "I_divider", "I_kanmi", "I_time", "I_table", "I_pillbg"].map((x) => withPfx(pfx, x)) });
  return null;
}

