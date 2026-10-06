// 方式C3（動かす・戻す・その場で書き換える）。テンプレートの部品は方式A のまま
// （overrides が無ければ 1 文字も違わない＝比較試験 6.1 が前回 C と一致）。
// オーナー操作の層は「抜け殻の直し」（作業票 §1）で、動かした先によって扱いを分ける：
//   M1（同じ塊の中）：テンプレの位置からの「ずれ」を **流れに残したまま** relative で持つ。塊が動けば一緒に動く。
//                     選んでいない部品は動かない（transform でなく relative＝どちらも流れの箱を残す・H2）。
//   M2（塊の外）      ：元のスロットを **流れから外す**（＝元の塊が詰め直される）。移動先では絶対配置にして、
//                     すぐ上・横が重なる部品に付いていく（中身が変われば追従）。抜け殻（空白）が残らない。
//   足した部品        ：M2 と同じ絶対配置＋付いていく先。
// セクションの高さ（§1.1）：手で置いた/足した部品が下端を越えたら、その下端＋余白までセクションを伸ばす。
// 配置の計算（classifyDrop / reanchor / placeAnchored / sectionMinHeights）は全てこのファイルに置く
// （ページは呼ぶだけ＝§0-4）。座標の最終決定は「一度描いて実測 → 絶対 top を入れる」で app が行う。

import { textDecls, STYLES, COLORS, DESIGN_W, lbOf } from "../lib/spec.mjs";
import { collectTextBoxes as bBoxes } from "../b-anchor/model.mjs";

const px = (n) => `${Math.round(n * 1000) / 1000}px`;

const G = {
  feature: {
    pc: { padTop: 120, padBottom: 180, hgLblH: 9, hgHRule: 24, hgToBlk: 119, blkGap: 80, centerOff: -12, headBody: 16,
      lblW: 600, hW: 600, tW: 501, pW: 549, pH: 404, b1PadL: 160, b1Gap: 94, b2PadL: 136 },
    sp: { padTop: 64, padBottom: 103, hgLblH: 8, hgHRule: 24, hgToBlk: 55, photoHead: 24, headBody: 8, blkGap: 64,
      lblW: 351, hW: 351, tW: 333, pW: 351, pH: 258 },
  },
  items: {
    pc: { padTop: 120, padBottom: 21, hgLblH: 9, hgHRule: 24, hgToCards: 80, cardsW: 1326, cols: 3, colGap: 24,
      cardPhotoName: 24, cardNameDesc: 8, cardDescPrice: 16, cardTxtW: 405, cardTxtInset: 10,
      cardsToDivider: 120, dividerW: 1328, dividerKanmi: 120, kanmiW: 600, kanmiTime: 4, timeTable: 13,
      tableW: 968, tableNameW: 560, tablePriceW: 249, vlineLeft: 700, rowTop: 26, rowNameDesc: 8, rowBottomPad: 23.6,
      tablePill: 64, pillW: 480, pillH: 56, lblW: 600, hW: 600 },
    sp: { padTop: 64, padBottom: 40, hgLblH: 8, hgHRule: 24, hgToCards: 40, cardsW: 351, cols: 1, colGap: 24,
      cardPhotoName: 16, cardNameDesc: 3, cardDescPrice: 9, cardTxtW: 333, cardTxtInset: 9,
      cardsToDivider: 98, dividerW: 351, dividerKanmi: 64, kanmiW: 351, kanmiTime: 5, timeTable: 13,
      tableW: 351, tableNameW: 351, tablePriceW: 351, rowTop: 24, rowNameDesc: 8, rowBottomPad: 25,
      tablePill: 48, pillW: 351, pillH: 56, lblW: 351, hW: 351 },
  },
};

export function collectTextBoxes(content, device) { return bBoxes(content, device); }

const T = (id, style, device, w, html, extra = "") =>
  `<div data-el="${id}" data-kind="text" class="t${lbOf(style) ? " lb" : ""}" style="width:${px(w)};${textDecls(style, device).join(";")};${extra}">${html}</div>`;
const PHOTO = (id, w, h, asset, extra = "") =>
  `<div data-el="${id}" data-kind="photo" class="photo" style="width:${px(w)};height:${px(h)};flex:none;${extra}">${asset}</div>`;
const CARDPHOTO = (id, asset) =>
  `<div data-el="${id}" data-kind="photo" class="photo" style="width:100%;aspect-ratio:1/1">${asset}</div>`;
const EMPTYFRAME = (id, w, h, extra = "", card = false) =>
  `<div data-el="${id}" data-kind="photo" class="photo empty" style="${card ? "width:100%;aspect-ratio:1/1" : `width:${px(w)};height:${px(h)};flex:none`};${extra}">ここに写真を入れてください</div>`;
const RULE = (id) => `<div data-el="${id}" data-kind="line" style="width:24px;height:2px;background:${COLORS.text}"></div>`;
const LINE = (id, w, h, op) => `<div data-el="${id}" data-kind="line" style="width:${px(w)};height:${px(h)};background:${COLORS.line}${op ? `;opacity:${op}` : ""}"></div>`;
const thtml = (H, k) => H.get(k)?.html ?? "";

// 絶対配置の1部品（M2・足した部品）。data-anchor/gap/x を持ち、app が top を入れる。
function absWrap(id, inner, anchor, gap, x) {
  return `<div class="absitem" data-absid="${id}" data-anchor="${anchor}" data-gap="${gap}" data-x="${x}" style="position:absolute;left:${px(x)};top:0">${inner}</div>`;
}

function headingGroupInner(prefix, content, device, c) {
  return `<div class="hg" data-el="${prefix}_hg" data-kind="group" style="display:flex;flex-direction:column;align-items:center">
    ${T(prefix + "_lbl", "lbl", device, c.lblW, content.label)}
    ${T(prefix + "_h", "secHead", device, c.hW, content.heading, `margin-top:${px(c.hgLblH)}`)}
    <div style="margin-top:${px(c.hgHRule)}">${RULE(prefix + "_rule")}</div>
  </div>`;
}

// ---------- FEATURE ----------
export function buildFeature(content, device, H, edits = {}) {
  const c = G.feature[device];
  const m1 = edits.m1 || {}, m2 = edits.m2 || {}, added = (edits.added || []).filter((a) => a.section === "feature");
  const removed = edits.remove || [], cleared = edits.clear || [];
  const headBody = edits.template?.headBody ?? c.headBody;
  const isOut = (id) => removed.includes(id) || m2[id] != null;       // 流れから外す（詰める）
  const off = (id) => { const m = m1[id]; return m ? `;position:relative;left:${px(m.dx || 0)};top:${px(m.dy || 0)}` : ""; };
  const clearedOf = (id) => cleared.includes(id);
  // §4（大きさ）：手直しが無ければ既定＝1文字も変わらない（比較試験が ±0）。
  const sizes = edits.sizes || {};
  const twOf = (id) => sizes[id]?.w ?? c.tW;                          // 文字の横幅
  const pbOf = (id) => (sizes[id]?.padB ? `;padding-bottom:${px(sizes[id].padB)}` : ""); // 文字の下に足す空き
  const pwOf = (id) => sizes[id]?.w ?? c.pW;                          // 写真の幅
  const phOf = (id) => sizes[id]?.h ?? c.pH;                          // 写真の高さ

  // 部品ごとの HTML（流れ用・絶対用の両方で使う）
  const hgInner = headingGroupInner("F", content.feature, device, c);
  const photoInner = (i) => clearedOf(`F_p${i}`) ? EMPTYFRAME(`F_p${i}`, pwOf(`F_p${i}`), phOf(`F_p${i}`)) : PHOTO(`F_p${i}`, pwOf(`F_p${i}`), phOf(`F_p${i}`), content.feature.blocks[i].photo.asset);
  const hInner = (i, extra = "") => T(`F_h${i}`, "featHead", device, twOf(`F_h${i}`), thtml(H, `F_h${i}`), extra + pbOf(`F_h${i}`));
  const bInner = (i, extra = "") => T(`F_b${i}`, "featBody", device, twOf(`F_b${i}`), thtml(H, `F_b${i}`), extra + pbOf(`F_b${i}`));

  const order = edits.order || {};                                  // §6/§10.1 並び替え（端末ごと）
  const isPhotoId = (id) => /_p\d$/.test(id);
  const gapBetween = (prev, cur) => (isPhotoId(prev) || isPhotoId(cur)) ? c.photoHead : headBody;
  const childInner = (i, cid, mt) => {
    if (isPhotoId(cid)) return clearedOf(cid) ? EMPTYFRAME(cid, pwOf(cid), phOf(cid), mt + off(cid)) : PHOTO(cid, pwOf(cid), phOf(cid), content.feature.blocks[i].photo.asset, mt + off(cid));
    if (/_h\d$/.test(cid)) return hInner(i, mt + off(cid));
    return bInner(i, mt + off(cid));
  };
  let blocks;
  if (device === "pc") {
    const block = (i, reversed) => {
      // 文字の塊（tg）＝見出し・本文の縦並び。並び替えはこの塊の中だけ（写真は横並び＝対象外・§6）
      const tgOrder = (order[`Ftg${i}`] || [`F_h${i}`, `F_b${i}`]).filter((id) => !isOut(id));
      let tgKids = ""; let prev = null;
      for (const cid of tgOrder) { const mt = prev === null ? "" : `margin-top:${px(headBody)}`; tgKids += childInner(i, cid, mt); prev = cid; }
      const tg = tgKids ? `<div class="tg" style="position:relative;top:${px(c.centerOff)};width:${px(c.tW)};flex:none">${tgKids}</div>` : "";
      const photo = isOut(`F_p${i}`) ? "" : `<div style="flex:none${off(`F_p${i}`)}">${photoInner(i)}</div>`;
      const padL = reversed ? c.b2PadL : c.b1PadL;
      const kids = reversed ? photo + tg : tg + photo;
      return `<div class="row" style="display:flex;align-items:center;padding-left:${px(padL)};gap:${px(c.b1Gap)};margin-top:${px(i === 0 ? c.hgToBlk : c.blkGap)}">${kids}</div>`;
    };
    const swap = edits.swap || {};   // §5 左右を入れ替える（端末ごと・ブロックごと）。既定は 0=そのまま・1=入替。入替えると反転
    blocks = block(0, false !== !!swap[0]) + block(1, true !== !!swap[1]);
  } else {
    const block = (i) => {
      const ord = (order[`Fblk${i}`] || [`F_p${i}`, `F_h${i}`, `F_b${i}`]).filter((id) => !isOut(id));
      let html = ""; let prev = null;
      for (const cid of ord) { const mt = `margin-top:${px(prev === null ? (i === 0 ? c.hgToBlk : c.blkGap) : gapBetween(prev, cid))}`; html += childInner(i, cid, mt); prev = cid; }
      return html;
    };
    blocks = block(0) + block(1);
  }
  const hgFlow = isOut("F_hg") ? "" : hgInner;
  const align = device === "sp" ? "center" : "stretch";
  const absItems = absLayer(m2, added, { F_hg: hgInner, F_p0: photoInner(0), F_p1: photoInner(1), F_h0: hInner(0), F_b0: bInner(0), F_h1: hInner(1), F_b1: bInner(1) }, device);
  const body = `<div id="sec" data-sec="feature" style="position:relative;width:${DESIGN_W[device]}px;background:${COLORS.surface}">
    <div class="stack" style="display:flex;flex-direction:column;align-items:${align};padding:${px(c.padTop)} 0 ${px(c.padBottom)}">${hgFlow}${blocks}</div>${absItems}</div>`;
  return { bodyHtml: body, extraCss: "", padBottom: c.padBottom };
}

// ---------- ITEMS ----------
export function buildItems(content, device, H, edits = {}) {
  const c = { ...G.items[device], ...(edits.geom?.[device] || {}) };
  const m1 = edits.m1 || {}, m2 = edits.m2 || {}, added = (edits.added || []).filter((a) => a.section === "items");
  const removed = edits.remove || [], cleared = edits.clear || [];
  const photoH = edits.template?.cardPhotoH?.[device];
  const isOut = (id) => removed.includes(id) || m2[id] != null;
  const off = (id) => { const m = m1[id]; return m ? `;position:relative;left:${px(m.dx || 0)};top:${px(m.dy || 0)}` : ""; };
  // §4（大きさ）：手直しが無ければ既定（比較試験 ±0）
  const sizes = edits.sizes || {};
  const wOf = (id, def) => sizes[id]?.w ?? def;
  const pbOf = (id) => (sizes[id]?.padB ? `;padding-bottom:${px(sizes[id].padB)}` : "");
  const cph = (id, asset) => cleared.includes(id)
    ? EMPTYFRAME(id, 0, 0, "", !photoH)
    : photoH ? `<div data-el="${id}" data-kind="photo" class="photo" style="width:100%;height:${px(photoH)}">${asset}</div>` : CARDPHOTO(id, asset);
  const hgInner = headingGroupInner("I", content.items, device, c);

  // §20 列（端末ごと）。既定（PC3/SP1）では1件の幅・文字の箱の幅・構造が従来と同じ＝比較試験 ±0。
  const DEFCOLS = device === "pc" ? 3 : 1;
  const defCardW = (c.cardsW - c.colGap * (DEFCOLS - 1)) / DEFCOLS;   // 426 / 351（テンプレ既定・txtDiff 用）
  const txtDiff = defCardW - c.cardTxtW;                              // PC 21 / SP 18（1件の幅 − 文字の箱の幅）
  const cardsWidth = wOf("I_cards", c.cardsW);                        // §3 左右の辺のつまみで変えた並びの幅
  const cardW = (cardsWidth - c.colGap * (c.cols - 1)) / c.cols;
  const cardTxtW = cardW - txtDiff;                                   // §2.2.4 1件の幅に合わせて差を保つ
  const cardRowGap = device === "pc" ? 64 : 40;                       // §2.2.7 段と段の間（Claude.ai が置いた）
  const ctw = (id) => Math.min(sizes[id]?.w ?? cardTxtW, cardW);      // §2.2.5 手直しの幅も1件の幅を越えない（表示だけ縮める）
  const cardCell = (card, cardStyle, extra) => `
      <div class="card" style="${cardStyle}${extra || ""}">
        ${cph(`card_photo_${card.id}`, card.photo.asset)}
        ${T(`card_name_${card.id}`, "cardName", device, ctw(`card_name_${card.id}`), thtml(H, `I_cn_${card.id}`), `margin:${px(c.cardPhotoName)} 0 0 ${px(c.cardTxtInset)}`)}
        ${T(`card_desc_${card.id}`, "cardDesc", device, ctw(`card_desc_${card.id}`), thtml(H, `I_cd_${card.id}`), `margin:${px(c.cardNameDesc)} 0 0 ${px(c.cardTxtInset)}`)}
        ${T(`card_price_${card.id}`, "cardPrice", device, ctw(`card_price_${card.id}`), thtml(H, `I_cp_${card.id}`), `margin:${px(c.cardDescPrice)} 0 0 ${px(c.cardTxtInset)}`)}
      </div>`;
  const cardsHtml = (mt) => {
    const cards = content.items.cards;
    if (c.cols <= 1) {   // 縦1列（SP 既定）＝従来の flex・段間は colGap
      const inner = cards.map((card, i) => cardCell(card, "display:flex;flex-direction:column;align-items:flex-start;", i ? `margin-top:${px(c.colGap)}` : "")).join("");
      return `<div data-el="I_cards" data-kind="group" class="cards" style="display:flex;flex-direction:column;width:${px(cardsWidth)};margin:${px(mt)} auto 0${off("I_cards")}">${inner}</div>`;
    }
    // 複数列：段ごとにグリッド（段の中で subgrid そろえ）。段と段は flex の row-gap（段の中のそろえと分離）。既定（3列1段）は従来と同位置。
    const rows = []; for (let i = 0; i < cards.length; i += c.cols) rows.push(cards.slice(i, i + c.cols));
    const rowGrid = (rc) => `<div class="cardrow" style="display:grid;grid-template-columns:repeat(${c.cols},1fr);grid-template-rows:auto auto auto auto;column-gap:${px(c.colGap)};width:100%">${rc.map((card) => cardCell(card, "display:grid;grid-template-rows:subgrid;grid-row:span 4;align-items:start")).join("")}</div>`;
    const gapStyle = rows.length > 1 ? `row-gap:${px(cardRowGap)};` : "";
    return `<div data-el="I_cards" data-kind="group" class="cards" style="display:flex;flex-direction:column;${gapStyle}width:${px(cardsWidth)};margin:${px(mt)} auto 0${off("I_cards")}">${rows.map(rowGrid).join("")}</div>`;
  };

  const dividerInner = LINE("I_divider", wOf("I_divider", c.dividerW), 1, 0.5);
  const kanmiInner = T("I_kanmi", "kanmiLbl", device, wOf("I_kanmi", c.kanmiW), thtml(H, "I_kanmi"), pbOf("I_kanmi"));
  const timeInner = T("I_time", "kanmiTime", device, wOf("I_time", c.kanmiW), thtml(H, "I_time"), pbOf("I_time"));
  // §3.2.5 表の幅を変えたとき：PC は名前の欄が伸び縮み・値段は右端に付く（既定では ±0）。SP は全欄が幅いっぱい
  const tableWidth = wOf("I_table", c.tableW);
  const tableNameW = device === "pc" ? (tableWidth - c.tablePriceW - (c.tableW - c.tableNameW - c.tablePriceW)) : tableWidth;
  const cTable = { ...c, tableW: tableWidth, tableNameW, vlineLeft: device === "pc" ? tableNameW + (c.vlineLeft - c.tableNameW) : c.vlineLeft };
  const rows = content.items.table.map((r) => rowHtml(r, device, cTable, H)).join("");
  const pillInner = T("I_pilltext", "pill", device, "auto", thtml(H, "I_pill"));

  // §2 縦積みの間隔：テンプレの隣接と「今の並び」だけから決める（手直しの数字を持たない）。
  const order = edits.order || {};
  const STACK = ["I_cards", "I_divider", "I_kanmi", "I_time", "I_table", "I_pillbg"];
  // TGAP[x]＝テンプレで x の「上の間隔」（x と x のテンプレ上隣との間）。I_cards の上は見出しの組（hgToCards）。
  const TGAP = { I_cards: c.hgToCards, I_divider: c.cardsToDivider, I_kanmi: c.dividerKanmi, I_time: c.kanmiTime, I_table: c.timeTable, I_pillbg: c.tablePill };
  const succ = (id) => STACK[STACK.indexOf(id) + 1];
  const gap2 = (A, B) => {                                 // A（上）と B（下）の間隔
    const aboveB = TGAP[B] != null ? TGAP[B] : 0;
    if (A == null) return B === "I_cards" ? TGAP.I_cards : Math.max(TGAP.I_cards, aboveB);  // 先頭（上は見出しの組）
    if (succ(A) === B) return aboveB;                      // テンプレで隣（同順）＝B の上の間隔
    if (succ(B) === A) return TGAP[A];                     // テンプレで隣（上下入替）＝A の上の間隔
    const belowA = TGAP[succ(A)] != null ? TGAP[succ(A)] : 0;  // A のテンプレ下の間隔
    return Math.max(belowA, aboveB);                      // 初めて隣＝広い方
  };
  const childHtml = (id, mt) => {
    if (id === "I_cards") return cardsHtml(mt);
    if (id === "I_divider") return `<div style="margin-top:${px(mt)};width:${px(wOf("I_divider", c.dividerW))};align-self:center${off("I_divider")}">${dividerInner}</div>`;
    if (id === "I_kanmi") return T("I_kanmi", "kanmiLbl", device, wOf("I_kanmi", c.kanmiW), thtml(H, "I_kanmi"), `margin-top:${px(mt)};align-self:center${off("I_kanmi")}${pbOf("I_kanmi")}`);
    if (id === "I_time") return T("I_time", "kanmiTime", device, wOf("I_time", c.kanmiW), thtml(H, "I_time"), `margin-top:${px(mt)};align-self:center${off("I_time")}${pbOf("I_time")}`);
    if (id === "I_table") return `<div data-el="I_table" class="row-lines" style="width:${px(wOf("I_table", c.tableW))};margin:${px(mt)} auto 0${off("I_table")}">${rows}</div>`;
    return `<div data-el="I_pillbg" data-kind="pill" style="margin-top:${px(mt)};width:${px(wOf("I_pillbg", c.pillW))};height:${px(c.pillH)};align-self:center;border:1px solid ${COLORS.textMuted};border-radius:32px;background:${COLORS.background};display:flex;align-items:center;justify-content:center${off("I_pillbg")}">${pillInner}</div>`;
  };
  const stackOrder = (order.Istack || STACK).filter((id) => !isOut(id));
  let stackHtml = ""; let prev = null;
  for (const id of stackOrder) { stackHtml += childHtml(id, gap2(prev, id)); prev = id; }

  const hgFlow = isOut("I_hg") ? "" : hgInner;
  const align = device === "sp" ? "center" : "stretch";
  const absItems = absLayer(m2, added, { I_hg: hgInner, I_divider: dividerInner, I_kanmi: kanmiInner, I_time: timeInner }, device);
  const body = `<div id="sec" data-sec="items" style="width:${DESIGN_W[device]}px;background:${COLORS.background};position:relative">
    <div class="stack" style="display:flex;flex-direction:column;align-items:${align};padding:${px(c.padTop)} 0 ${px(c.padBottom)}">
      ${hgFlow}${stackHtml}</div>${absItems}</div>`;
  return { bodyHtml: body, extraCss: "", padBottom: c.padBottom };
}

// M2 の部品と足した部品を絶対配置の層に出す（top は app が入れる）。
function absLayer(m2, added, innerMap, device) {
  let out = "";
  for (const [id, ov] of Object.entries(m2)) {
    if (!(id in innerMap)) continue;
    out += absWrap(id, innerMap[id], ov.anchor, ov.gapY, ov.x);
  }
  for (const a of added) {
    const inner = a.kind === "photo"
      ? PHOTO(a.id, a.w, a.h || Math.round(a.w * 0.66), a.asset || "", "")
      : T(a.id, a.styleName || "featBody", device, a.w, a.html != null ? a.html : a.text);
    out += absWrap(a.id, inner, a.anchor, a.gap, a.x);
  }
  return out;
}

function rowHtml(r, device, c, H) {
  if (device === "pc") {
    const left = `<div style="flex:none;width:${px(c.vlineLeft)}px">
      ${T(`row_name_${r.id}`, "tName", device, c.tableNameW, thtml(H, `I_tn_${r.id}`))}
      ${r.desc ? T(`row_desc_${r.id}`, "tDesc", device, c.tableNameW, thtml(H, `I_td_${r.id}`), `margin-top:${px(c.rowNameDesc)}`) : ""}</div>`;
    const price = `<div style="flex:1;display:flex;justify-content:flex-end">${T(`row_price_${r.id}`, "tPriceR", device, c.tablePriceW, thtml(H, `I_tp_${r.id}`))}</div>`;
    const vline = `<div data-el="row_vline_${r.id}" data-kind="line" style="position:absolute;left:${px(c.vlineLeft)}px;top:22px;width:1px;height:64px;background:${COLORS.line}"></div>`;
    return `<div class="krow" style="position:relative;display:flex;align-items:baseline;padding:${px(c.rowTop)} 0 ${px(c.rowBottomPad)}">${left}${price}${vline}</div>`;
  }
  return `<div class="krow" style="display:flex;flex-direction:column;padding:${px(c.rowTop)} 0 ${px(c.rowBottomPad)}">
    ${T(`row_name_${r.id}`, "tName", device, c.tableNameW, thtml(H, `I_tn_${r.id}`))}
    ${r.desc ? T(`row_desc_${r.id}`, "tDesc", device, c.tableNameW, thtml(H, `I_td_${r.id}`), `margin-top:${px(c.rowNameDesc)}`) : ""}
    ${T(`row_price_${r.id}`, "tPriceL", device, c.tableNameW, thtml(H, `I_tp_${r.id}`), "margin-top:8px")}</div>`;
}

// ===================== オーナー操作の層（配置の計算） =====================

export const FRIENDLY = {
  F_hg: "特集の見出しの組", F_p0: "特集1の写真", F_h0: "特集1の見出し", F_b0: "特集1の本文",
  F_p1: "特集2の写真", F_h1: "特集2の見出し", F_b1: "特集2の本文",
  I_hg: "おすすめの見出しの組", I_divider: "区切り線", I_kanmi: "甘味処の見出し", I_time: "甘味処の時間",
  I_cards: "品の並び", I_table: "甘味処の表", I_pillbg: "ボタン", "@section": "セクションの先頭",
};
export function friendly(id) {
  if (FRIENDLY[id]) return FRIENDLY[id];
  if (/^addp_/.test(id)) return "足した写真";
  if (/^add_/.test(id)) return "足した文字";
  if (/^card_/.test(id)) return "品";
  if (/^row_/.test(id)) return "表の行";
  return id;
}

// 塊（cluster）：その部品が属する塊の共同メンバー（自分を含む）。M1/M2 の判定に使う。
export const CLUSTER = {
  F_h0: ["F_h0", "F_b0", "F_p0"], F_b0: ["F_h0", "F_b0", "F_p0"], F_p0: ["F_h0", "F_b0", "F_p0"],
  F_h1: ["F_h1", "F_b1", "F_p1"], F_b1: ["F_h1", "F_b1", "F_p1"], F_p1: ["F_h1", "F_b1", "F_p1"],
  F_hg: ["F_hg"], I_hg: ["I_hg"], I_divider: ["I_divider"],
  I_kanmi: ["I_kanmi", "I_time"], I_time: ["I_kanmi", "I_time"],
};
const HG_OF = { feature: "F_hg", items: "I_hg" };
const secId = (id) => (id.startsWith("F_") ? "feature" : "items");
const overlapX = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
const bottomOf = (e) => e.y + e.h;

// 繰り返す部品の1件（品のカード card_* / 甘味処の表の行 row_*）は、その並び全体の ID に畳む（§4-3・§10.2）。
export const REPEAT_GROUP = (id) => (/^card_/.test(id) ? "I_cards" : (/^row_/.test(id) ? "I_table" : null));
// 塊（cluster）の範囲：classifyDrop 用に名前つきの塊の箱を作る。繰り返す並びも「別の塊」として数える。
const CLUSTER_KEYS = [["F_h0", "F_b0", "F_p0"], ["F_h1", "F_b1", "F_p1"], ["F_hg"], ["I_hg"], ["I_divider"], ["I_kanmi", "I_time"], ["I_cards"], ["I_table"]];
function boxOf(ids, geom) {
  const ms = ids.filter((m) => geom[m]); if (!ms.length) return null;
  return { x0: Math.min(...ms.map((m) => geom[m].x)), y0: Math.min(...ms.map((m) => geom[m].y)), x1: Math.max(...ms.map((m) => geom[m].x + geom[m].w)), y1: Math.max(...ms.map((m) => geom[m].y + geom[m].h)) };
}
const clusterKeyOf = (id) => REPEAT_GROUP(id) || (CLUSTER_KEYS.find((s) => s.includes(id)) || [id]).join("|");

// M1 か M2 か（§3）：離した部品の中心が、属する塊の範囲を 40px 広げた中にあり、かつ別の塊の中でなければ M1。
// geomNow＝今の見た目（ドラッグ後）。geomOrig＝動かす前の実測（塊の範囲は元の位置で測る）。
export function classifyDrop(geomNow, id, movingIds = [id], geomOrig) {
  geomOrig = geomOrig || geomNow;
  const part = geomNow[id]; if (!part) return "M1";
  const cx = part.x + part.w / 2, cy = part.y + part.h / 2;
  const ownKey = clusterKeyOf(id);
  const own = boxOf(CLUSTER[id] || [id], geomOrig);
  if (own) { const pad = 40; if (cx < own.x0 - pad || cx > own.x1 + pad || cy < own.y0 - pad || cy > own.y1 + pad) return "M2"; }
  // 別の塊の中に離した → M2（3-2）。geometry はセクションごとの局所座標なので、同じセクションの塊だけと比べる。
  const sec = secId(id);
  for (const set of CLUSTER_KEYS) {
    if (set.join("|") === ownKey) continue;
    if (secId(set[0]) !== sec) continue;
    const b = boxOf(set, geomOrig); if (!b) continue;
    if (cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1) return "M2";
  }
  return "M1";
}

// 並び替え（§6／§10.1）：縦に並んだ塊の中で、離した中心が兄弟の縦中心を越えた位置に割り込ませる。
// siblings＝その塊の縦並びの全メンバー（自分を含む・元の並び）。dropCenterY＝離した部品の中心 y（設計座標）。
// 変わらなければ null（＝並び替えでなく M1 のずれ）を返す。先頭より上／末尾より下もこの計算で front／end になる。
export function reorderWithin(geomOrig, id, siblings, dropCenterY) {
  const sibs = siblings.filter((s) => geomOrig[s]);
  if (sibs.length < 2 || !sibs.includes(id)) return null;
  const order = sibs.slice().sort((a, b) => geomOrig[a].y - geomOrig[b].y);
  const others = order.filter((s) => s !== id);
  let idx = 0;
  for (const o of others) { const oc = geomOrig[o].y + geomOrig[o].h / 2; if (dropCenterY > oc) idx++; else break; }
  const next = others.slice(); next.splice(idx, 0, id);
  return next.join("|") === order.join("|") ? null : next;
}

const NOT_ANCHOR = new Set(["F_lbl", "F_h", "F_rule", "I_lbl", "I_h", "I_rule", "I_pilltext"]);

// 付いていく先を取り直す（§4）。同セクションの、すぐ上・横が重なる部品で最も近いもの。
// 繰り返す部品の1件の中の部品は候補にせず、その並び全体（I_cards／I_table）に畳む（§4-3・§10.2）。
// 繰り返す並びの範囲の中に離したときは、その並び全体に付く（R2／R9）。
export function reanchor(geom, movedId, secOverride) {
  const part = geom[movedId]; if (!part) return null;
  const sec = secOverride || secId(movedId); const hgId = HG_OF[sec];
  const cy = part.y + part.h / 2;
  // 候補の箱を作る：繰り返す1件は所属グループ（I_cards／I_table）の箱へ畳む
  const cand = {};
  for (const [id, e] of Object.entries(geom)) {
    if (id === movedId || !e || e.kind === undefined) continue;
    if (NOT_ANCHOR.has(id) || /^row_vline_/.test(id)) continue;
    if (secId(id) !== sec || id === hgId) continue;
    const key = REPEAT_GROUP(id) || id;      // card_*→I_cards, row_*→I_table, I_cards/I_table はそのまま
    const c = cand[key];
    if (!c) cand[key] = { x: e.x, y: e.y, w: e.w, h: e.h };
    else { const nx = Math.min(c.x, e.x), ny = Math.min(c.y, e.y), nr = Math.max(c.x + c.w, e.x + e.w), nb = Math.max(c.y + c.h, e.y + e.h); cand[key] = { x: nx, y: ny, w: nr - nx, h: nb - ny }; }
  }
  // 繰り返す並びの範囲の中（縦に）に離した → その並び全体に付く
  for (const gid of ["I_cards", "I_table"]) {
    const g = cand[gid]; if (!g) continue;
    if (cy >= g.y - 0.5 && cy <= g.y + g.h + 0.5 && overlapX(g, part) > 1)
      return { anchor: gid, gapY: +(part.y - (g.y + g.h)).toFixed(2), x: +part.x.toFixed(2) };
  }
  let best = null;
  for (const [id, e] of Object.entries(cand)) {
    if (e.y + e.h > part.y + 1.5) continue;
    if (overlapX(e, part) <= 1) continue;
    if (!best || e.y + e.h > best.e.y + best.e.h) best = { id, e };
  }
  if (!best) { const hg = geom[hgId]; if (hg && bottomOf(hg) <= part.y + 1.5) best = { id: hgId, e: hg }; }
  if (!best) return { anchor: "@section", gapY: +part.y.toFixed(2), x: +part.x.toFixed(2) };
  return { anchor: best.id, gapY: +(part.y - (best.e.y + best.e.h)).toFixed(2), x: +part.x.toFixed(2) };
}

// 絶対配置（M2・足した部品）の top を出す。連鎖（付いていく先も動かした部品）を解く。
// flowGeom：絶対 top を入れる前の実測（left は既に x）。overrides：{id:{anchor,gapY,x}}（m2＋added を合わせて渡す）。
export function placeAnchored(flowGeom, overrides) {
  overrides = overrides || {};
  const memo = {}; const guard = new Set();
  function topOf(id) {
    if (id in memo) return memo[id];
    const cur = flowGeom[id]; const ov = overrides[id];
    if (!ov) return (memo[id] = cur ? cur.y : 0);
    if (guard.has(id)) return cur ? cur.y : 0;
    guard.add(id);
    let t;
    if (ov.anchor === "@section" || ov.anchor === "@abs" || !flowGeom[ov.anchor]) t = ov.gapY;
    else t = topOf(ov.anchor) + flowGeom[ov.anchor].h + ov.gapY;
    guard.delete(id);
    return (memo[id] = t);
  }
  const out = {};
  for (const id of Object.keys(overrides)) { if (flowGeom[id]) out[id] = { top: +topOf(id).toFixed(2), left: +overrides[id].x.toFixed(2) }; }
  return out;
}

// セクションの最小高さ（§1.1）：絶対配置の部品が下端を越えたら伸ばす。placedBottoms＝id→絶対 top+高さ。
export function sectionMinHeight(templateH, placedBottoms, padBottom) {
  let maxB = 0;
  for (const b of Object.values(placedBottoms)) maxB = Math.max(maxB, b);
  return Math.max(templateH, maxB + padBottom);
}
