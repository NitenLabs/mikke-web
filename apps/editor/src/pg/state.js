// 編集の状態（state）・倍率
// 線：共通｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）
// §24 base＝お店の下書き（4.9 の今の形）。null は「最初の形＝空の下書き（テンプレートのまま）」。reduce は base から種まきして ops を畳む。
let state = { device: "pc", page: "pg_home", ops: [], cursor: 0, undoBase: 0, base: null, shopBase: null, shopSeq: 0, selected: new Set(), selectedSection: null, editing: null, peek: false, clipboard: null, addSeq: 0, secSeq: 0, secList: defaultSecList(), secMap: null, secPageMap: {}, pendingNewText: null, fixedSections: false, preview: false, viewing: null, viewBackup: null, restoreUndo: null, recentColors: [], droppedRuns: [] };
let scale = 1, layoutCount = 0, composing = false;
// §25 §2.3 縮め方の切り替え：既定は見た目だけ縮める transform:scale（A）。アドレス末尾 ?scale=zoom のときだけ CSS の zoom で縮める（B）。
//   DATA_SPEC 4.11 ②：縮めた中での書き換えは iPhone の Safari で崩れやすい。崩れたら縮め方を変える。
//   chromium / webkit では zoom と transform:scale で getBoundingClientRect・clientWidth の意味が一致する（座標の計算は両方とも (client − rect.left) / scale のまま・直す所なし）。
const SCALE_MODE = (() => { try { return new URLSearchParams(location.search).get("scale") === "zoom" ? "zoom" : "transform"; } catch (e) { return "transform"; } })();
let clampGuard = false;   // §20b §2.4 表の幅クランプの再描画ガード（render の再入防止）
let appliedPlace = {}; // id -> {top,left} 直近の絶対配置

