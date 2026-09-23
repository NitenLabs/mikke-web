// 方式B（基準の木）：芦屋堂の FEATURE / ITEMS を組む。
// 縦の基準1つ＋グループ（縦中央そろえ）＋格子（rowAlign:max）で表す。文字高さは本線実測。

import { resolve, rebindRemoved } from "./resolve.mjs";
import { STYLES } from "../lib/spec.mjs";

// move（付け替え＝基準の間隔に dx/dy を足す。基準にしている要素は追従する＝§3）
function applyMove(nodes, edits) {
  for (const [id, m] of Object.entries(edits?.move || {})) {
    const n = nodes.find((x) => x.id === id);
    if (!n) continue;
    if (m.dx) n.x = (n.x || 0) + m.dx;
    if (m.dy && n.anchor) n.anchor.gap = (n.anchor.gap || 0) + m.dy;
  }
}
// move（塊の外）＝取り出して、目印の下端に基準を付け替える（間隔と x を持つ）。目印が動けば追従。
function applyMoveOut(nodes, edits) {
  for (const [id, m] of Object.entries(edits?.moveOut || {})) {
    const n = nodes.find((x) => x.id === id);
    if (!n) continue;
    n.group = undefined; // グループから取り出す
    n.x = m.x;
    n.anchor = { ref: m.marker, edge: "bottom", self: "top", gap: m.gap };
  }
}

// ---- 幾何定数（design px。SPEC v2 / 付録A から。gap は基準どうしの距離）----
const G = {
  feature: {
    pc: { padTop: 120, padBottom: 180, hgLblH: 9, hgHRule: 24, lblX: 420, lblW: 600, hX: 420, hW: 600, ruleX: 708, ruleW: 24,
      hgToPhoto: 119, blkGap: 80, centerOff: -12, headBody: 16,
      p1X: 755, p2X: 136, pW: 549, pH: 404, t1X: 160, t2X: 779, tW: 501 },
    sp: { padTop: 64, padBottom: 103, hgLblH: 8, hgHRule: 24, lblX: 20, lblW: 351, hX: 20, hW: 351, ruleX: 183, ruleW: 24,
      hgToPhoto: 55, photoHead: 24, headBody: 8, blkGap: 64,
      pX: 20, pW: 351, pH: 258, tX: 28, tW: 333 },
  },
  items: {
    pc: { padTop: 120, padBottom: 21, hgLblH: 9, hgHRule: 24, lblX: 420, lblW: 600, hX: 420, hW: 600, ruleX: 708, ruleW: 24,
      hgToCards: 80, cardsX: 57, cardsW: 1326, cols: 3, colGap: 24, cardRowGap: 64, cardTxtOff: 10, cardTxtW: 405,
      cardPhotoName: 24, cardNameDesc: 8, cardDescPrice: 16,
      cardsToDivider: 120, dividerX: 56, dividerW: 1328, dividerKanmi: 120,
      kanmiX: 420, kanmiW: 600, kanmiTime: 4, timeTable: 13,
      tableX: 236, tableW: 968, tableTxtOff: 8, tableNameW: 560, tablePriceX: 955, tablePriceW: 249, vlineX: 936,
      rowTop: 26, rowNameDesc: 8, rowBottomPad: 23.6, rowPriceTop: 43, vlineTop: 22, vlineH: 64,
      tablePill: 64, pillX: 480, pillW: 480, pillH: 56 },
    sp: { padTop: 64, padBottom: 40, hgLblH: 8, hgHRule: 24, lblX: 20, lblW: 351, hX: 20, hW: 351, ruleX: 183, ruleW: 24,
      hgToCards: 40, cardsX: 20, cardsW: 351, cols: 1, colGap: 24, cardTxtOff: 8, cardTxtW: 333,
      cardPhotoName: 16, cardNameDesc: 3, cardDescPrice: 9, interCard: 24,
      cardsToDivider: 98, dividerX: 20, dividerW: 351, dividerKanmi: 64,
      kanmiX: 20, kanmiW: 351, kanmiTime: 5, timeTable: 13,
      tableX: 20, tableW: 351, tableTxtOff: 0, tableNameW: 351, tablePriceX: 20, tablePriceW: 351, vlineX: 0,
      rowTop: 24, rowNameDesc: 8, rowBottomPad: 25, rowPriceTop: 104, vlineTop: 0, vlineH: 0,
      tablePill: 48, pillX: 20, pillW: 351, pillH: 56 },
  },
};

// 実験全体で使う文字箱の一覧（prepareTexts へ）
export function collectTextBoxes(content, device) {
  const boxes = [];
  const g = G;
  // FEATURE
  boxes.push({ key: "F_lbl", styleName: "lbl", device, widthPx: g.feature[device].lblW, text: content.feature.label });
  boxes.push({ key: "F_h", styleName: "secHead", device, widthPx: g.feature[device].hW, text: content.feature.heading });
  const tW = g.feature[device].tW;
  content.feature.blocks.forEach((b, i) => {
    boxes.push({ key: `F_h${i}`, styleName: "featHead", device, widthPx: tW, text: b.heading });
    boxes.push({ key: `F_b${i}`, styleName: "featBody", device, widthPx: tW, text: b.body });
  });
  // ITEMS
  const it = g.items[device];
  boxes.push({ key: "I_lbl", styleName: "lbl", device, widthPx: it.lblW, text: content.items.label });
  boxes.push({ key: "I_h", styleName: "secHead", device, widthPx: it.hW, text: content.items.heading });
  content.items.cards.forEach((c) => {
    boxes.push({ key: `I_cn_${c.id}`, styleName: "cardName", device, widthPx: it.cardTxtW, text: c.name });
    boxes.push({ key: `I_cd_${c.id}`, styleName: "cardDesc", device, widthPx: it.cardTxtW, text: c.desc });
    boxes.push({ key: `I_cp_${c.id}`, styleName: "cardPrice", device, widthPx: it.cardTxtW, text: c.price });
  });
  boxes.push({ key: "I_kanmi", styleName: "kanmiLbl", device, widthPx: it.kanmiW, text: content.items.kanmiLabel });
  boxes.push({ key: "I_time", styleName: "kanmiTime", device, widthPx: it.kanmiW, text: content.items.kanmiTime });
  content.items.table.forEach((r) => {
    boxes.push({ key: `I_tn_${r.id}`, styleName: "tName", device, widthPx: it.tableNameW, text: r.name });
    if (r.desc) boxes.push({ key: `I_td_${r.id}`, styleName: "tDesc", device, widthPx: it.tableNameW, text: r.desc });
    boxes.push({ key: `I_tp_${r.id}`, styleName: device === "pc" ? "tPriceR" : "tPriceL", device, widthPx: device === "pc" ? it.tablePriceW : it.tableNameW, text: r.price });
  });
  boxes.push({ key: "I_pill", styleName: "pill", device, widthPx: it.pillW, text: content.items.pill });
  return boxes;
}

const th = (H, key) => H.get(key)?.height ?? 0;
const thtml = (H, key) => H.get(key)?.html ?? "";

// ---------- FEATURE ----------
export function buildFeature(content, device, H, edits = {}) {
  const c = G.feature[device];
  const headBody = edits.template?.headBody ?? c.headBody;
  const nodes = [];
  const txt = (id, x, w, key, style, anchor, group) =>
    nodes.push({ id, kind: "text", x, w, h: th(H, key), html: thtml(H, key), styleName: style, anchor, group });
  const photo = (id, x, anchor) => nodes.push({ id, kind: "photo", x, w: c.pW, h: c.pH, fill: null, anchor, asset: true, empty: edits.clear?.includes(id) });
  const rule = (id, anchor, group) => nodes.push({ id, kind: "rule", x: c.ruleX, w: c.ruleW, h: 2, anchor, group });

  // 見出しの組（グループ）
  nodes.push({ id: "hg", kind: "group", anchor: { ref: "@section", edge: "top", gap: c.padTop } });
  txt("F_lbl", c.lblX, c.lblW, "F_lbl", "lbl", { ref: "@group", edge: "top", gap: 0 }, "hg");
  txt("F_h", c.hX, c.hW, "F_h", "secHead", { ref: "F_lbl", edge: "bottom", gap: c.hgLblH }, "hg");
  rule("F_rule", { ref: "F_h", edge: "bottom", gap: c.hgHRule }, "hg");

  if (device === "pc") {
    // block1: 写真右・文章左（縦中央-12）
    photo("F_p0", c.p1X, { ref: "hg", edge: "bottom", gap: c.hgToPhoto });
    nodes.push({ id: "tg0", kind: "group", anchor: { ref: "F_p0", edge: "center", self: "center", gap: c.centerOff } });
    txt("F_h0", c.t1X, c.tW, "F_h0", "featHead", { ref: "@group", edge: "top", gap: 0 }, "tg0");
    txt("F_b0", c.t1X, c.tW, "F_b0", "featBody", { ref: "F_h0", edge: "bottom", gap: headBody }, "tg0");
    // block2: 写真左・文章右。写真は block1 の最も下（写真/文章）から blkGap
    photo("F_p1", c.p2X, { ref: ["F_p0", "tg0"], edge: "bottom", gap: c.blkGap });
    nodes.push({ id: "tg1", kind: "group", anchor: { ref: "F_p1", edge: "center", self: "center", gap: c.centerOff } });
    txt("F_h1", c.t2X, c.tW, "F_h1", "featHead", { ref: "@group", edge: "top", gap: 0 }, "tg1");
    txt("F_b1", c.t2X, c.tW, "F_b1", "featBody", { ref: "F_h1", edge: "bottom", gap: headBody }, "tg1");
  } else {
    // SP：写真→見出し→本文の縦積み
    photo("F_p0", c.pX, { ref: "hg", edge: "bottom", gap: c.hgToPhoto });
    txt("F_h0", c.tX, c.tW, "F_h0", "featHead", { ref: "F_p0", edge: "bottom", gap: c.photoHead });
    txt("F_b0", c.tX, c.tW, "F_b0", "featBody", { ref: "F_h0", edge: "bottom", gap: headBody });
    photo("F_p1", c.pX, { ref: "F_b0", edge: "bottom", gap: c.blkGap });
    txt("F_h1", c.tX, c.tW, "F_h1", "featHead", { ref: "F_p1", edge: "bottom", gap: c.photoHead });
    txt("F_b1", c.tX, c.tW, "F_b1", "featBody", { ref: "F_h1", edge: "bottom", gap: headBody });
  }

  applyMove(nodes, edits);
  applyMoveOut(nodes, edits);
  let nodes2 = edits.remove?.length ? rebindRemoved(nodes, edits.remove) : nodes;
  const { bottom } = resolve(nodes2);
  return { primitives: toPrimitives(nodes2), sectionH: bottom + c.padBottom, nodes: nodes2 };
}

// ---------- ITEMS ----------
export function buildItems(content, device, H, edits = {}) {
  const c = { ...G.items[device], ...(edits.geom?.[device] || {}) }; // geom で幾何定数を差し替え可（別テンプレ＝G2 の参照元プロファイル）
  const photoHOverride = edits.template?.cardPhotoH?.[device];
  const nodes = [];
  const txt = (id, x, w, key, style, anchor, group) =>
    nodes.push({ id, kind: "text", x, w, h: th(H, key), html: thtml(H, key), styleName: style, anchor, group });

  // 見出しの組
  nodes.push({ id: "hg", kind: "group", anchor: { ref: "@section", edge: "top", gap: c.padTop } });
  txt("I_lbl", c.lblX, c.lblW, "I_lbl", "lbl", { ref: "@group", edge: "top", gap: 0 }, "hg");
  txt("I_h", c.hX, c.hW, "I_h", "secHead", { ref: "I_lbl", edge: "bottom", gap: c.hgLblH }, "hg");
  nodes.push({ id: "I_rule", kind: "rule", x: c.ruleX, w: c.ruleW, h: 2, group: "hg", anchor: { ref: "I_h", edge: "bottom", gap: c.hgHRule } });

  // カード（格子・rowAlign:max）。カードは1つの合成ノード I_cards として高さを持つ。
  const cardW = c.cols > 1 ? (c.cardsW - c.colGap * (c.cols - 1)) / c.cols : c.cardsW;
  const cards = content.items.cards;
  const nameH = cards.map((x) => th(H, `I_cn_${x.id}`));
  const descH = cards.map((x) => th(H, `I_cd_${x.id}`));
  const priceH = cards.map((x) => th(H, `I_cp_${x.id}`));
  const photoH = photoHOverride ?? cardW; // 1:1（E3 で固定高さに上書き）
  let cardsHeight, cardCells = [];
  if (c.cols > 1) {
    // 格子：cols 枚ごとに行に折り返す。各行で役割ごとに relTop を最も下にそろえる（rowAlign:max）。
    const rowGap = c.cardRowGap ?? 64;
    let rowTopAbs = 0;
    for (let start = 0; start < cards.length; start += c.cols) {
      const rowIdx = cards.slice(start, start + c.cols).map((_, k) => start + k);
      const relName = photoH + c.cardPhotoName;
      const relDesc = Math.max(...rowIdx.map((i) => relName + nameH[i] + c.cardNameDesc));
      const relPrice = Math.max(...rowIdx.map((i) => relDesc + descH[i] + c.cardDescPrice));
      const rowH = relPrice + Math.max(...rowIdx.map((i) => priceH[i]));
      rowIdx.forEach((i, col) => {
        const cx = c.cardsX + col * (cardW + c.colGap);
        cardCells.push({ card: cards[i], cx, cardW, relPhoto: rowTopAbs, relName: rowTopAbs + relName, relDesc: rowTopAbs + relDesc, relPrice: rowTopAbs + relPrice, i });
      });
      rowTopAbs += rowH + rowGap;
    }
    cardsHeight = rowTopAbs - rowGap;
  } else {
    // 縦積み：カードの高さぶん送る
    let cursor = 0;
    cards.forEach((card, i) => {
      const relName = photoH + c.cardPhotoName;
      const relDesc = relName + nameH[i] + c.cardNameDesc;
      const relPrice = relDesc + descH[i] + c.cardDescPrice;
      const cardH = relPrice + priceH[i];
      cardCells.push({ card, cx: c.cardsX, cardW, relPhoto: cursor, relName: cursor + relName, relDesc: cursor + relDesc, relPrice: cursor + relPrice, i });
      cursor += cardH + c.interCard;
    });
    cursor -= c.interCard;
    cardsHeight = cursor;
  }
  nodes.push({ id: "I_cards", kind: "group", h: cardsHeight, anchor: { ref: "hg", edge: "bottom", gap: c.hgToCards }, _cardCells: cardCells, _cardW: cardW, _photoH: photoH });

  // 区切り線 → 甘味処ラベル → 提供時間 → 表 → ピル
  nodes.push({ id: "I_divider", kind: "line", x: c.dividerX, w: c.dividerW, h: 1, opacity: 0.5, anchor: { ref: "I_cards", edge: "bottom", gap: c.cardsToDivider } });
  txt("I_kanmi", c.kanmiX, c.kanmiW, "I_kanmi", "kanmiLbl", { ref: "I_divider", edge: "bottom", gap: c.dividerKanmi });
  txt("I_time", c.kanmiX, c.kanmiW, "I_time", "kanmiTime", { ref: "I_kanmi", edge: "bottom", gap: c.kanmiTime });

  // 表（合成ノード）：行を縦に積む。行の高さは中身なり（S7 で説明を消すと縮む）。
  const rows = content.items.table;
  const rowCells = [];
  let cursor = 0;
  rows.forEach((r) => {
    const rnH = th(H, `I_tn_${r.id}`);
    const rdH = r.desc ? th(H, `I_td_${r.id}`) : 0;
    const rpH = th(H, `I_tp_${r.id}`);
    const rdTop = c.rowTop + rnH + c.rowNameDesc;
    let rowH, rpTop;
    if (device === "sp") {
      // SP：品名→説明→価格を縦に積む。価格も高さに入れる。
      const afterName = r.desc ? rdTop + rdH : c.rowTop + rnH;
      rpTop = afterName + 8;
      rowH = rpTop + rpH + c.rowBottomPad;
    } else {
      const contentBottom = r.desc ? rdTop + rdH : c.rowTop + rnH;
      rowH = contentBottom + c.rowBottomPad;
      rpTop = c.rowPriceTop;
    }
    rowCells.push({ r, top: cursor, rowH, rnTop: c.rowTop, rdTop, rpTop, rnH, rdH });
    cursor += rowH;
  });
  const tableH = cursor;
  nodes.push({ id: "I_table", kind: "group", h: tableH, anchor: { ref: "I_time", edge: "bottom", gap: c.timeTable }, _rowCells: rowCells });

  nodes.push({ id: "I_pillbg", kind: "pill", x: c.pillX, w: c.pillW, h: c.pillH, anchor: { ref: "I_table", edge: "bottom", gap: c.tablePill } });

  // E4：add した文字（方式B＝置いた位置のすぐ上＝区切り線に基準を付ける＝中身が動くと追従する）
  if (edits.addText) {
    const a = edits.addText;
    nodes.push({ id: "I_added", kind: "text", dataKind: "text", x: a.x, w: a.w, h: a.height, html: a.html, styleName: "featBody", anchor: { ref: "I_divider", edge: "bottom", gap: a.gap } });
  }

  const { bottom } = resolve(nodes);

  // ピルの文字（rect の縦中央）
  const pillbg = nodes.find((n) => n.id === "I_pillbg");
  const pillTextH = th(H, "I_pill");
  nodes.push({ id: "I_pilltext", kind: "text", x: c.pillX, w: c.pillW, h: pillTextH, styleName: "pill", html: thtml(H, "I_pill"), _y: pillbg._y + (c.pillH - pillTextH) / 2 });

  // 合成ノードの中身を primitives に展開
  const prims = toPrimitives(nodes.filter((n) => !["I_cards", "I_table"].includes(n.id)));
  const cardsNode = nodes.find((n) => n.id === "I_cards");
  const cy = cardsNode._y;
  for (const cc of cardsNode._cardCells) {
    prims.push({ id: `card_photo_${cc.card.id}`, kind: "photo", dataKind: "photo", x: cc.cx, y: cy + cc.relPhoto, w: cc.cardW, h: cardsNode._photoH, asset: cc.card.photo.asset, empty: edits.clear?.includes(`card_photo_${cc.card.id}`) });
    prims.push({ id: `card_name_${cc.card.id}`, kind: "text", dataKind: "text", x: cc.cx + c.cardTxtOff, y: cy + cc.relName, w: c.cardTxtW, styleName: "cardName", html: thtml(H, `I_cn_${cc.card.id}`) });
    prims.push({ id: `card_desc_${cc.card.id}`, kind: "text", dataKind: "text", x: cc.cx + c.cardTxtOff, y: cy + cc.relDesc, w: c.cardTxtW, styleName: "cardDesc", html: thtml(H, `I_cd_${cc.card.id}`) });
    prims.push({ id: `card_price_${cc.card.id}`, kind: "text", dataKind: "text", x: cc.cx + c.cardTxtOff, y: cy + cc.relPrice, w: c.cardTxtW, styleName: "cardPrice", html: thtml(H, `I_cp_${cc.card.id}`) });
  }
  const tableNode = nodes.find((n) => n.id === "I_table");
  const ty = tableNode._y;
  // 表の範囲（A9-9 の x/w 照合用の不可視ノード。両方式で同名にそろえる）
  prims.push({ id: "I_table", kind: "region", dataKind: "region", x: c.tableX, y: ty, w: c.tableW, h: tableNode.h });
  // 表の上端の線
  prims.push({ id: "table_topline", kind: "line", dataKind: "line", x: c.tableX, y: ty, w: c.tableW, h: 1 });
  for (const rc of tableNode._rowCells) {
    const ry = ty + rc.top;
    prims.push({ id: `row_name_${rc.r.id}`, kind: "text", dataKind: "text", x: c.tableX + c.tableTxtOff, y: ry + rc.rnTop, w: c.tableNameW, styleName: "tName", html: thtml(H, `I_tn_${rc.r.id}`) });
    if (rc.r.desc) prims.push({ id: `row_desc_${rc.r.id}`, kind: "text", dataKind: "text", x: c.tableX + c.tableTxtOff, y: ry + rc.rdTop, w: c.tableNameW, styleName: "tDesc", html: thtml(H, `I_td_${rc.r.id}`) });
    if (device === "pc") {
      prims.push({ id: `row_price_${rc.r.id}`, kind: "text", dataKind: "text", x: c.tablePriceX, y: ry + c.rowPriceTop, w: c.tablePriceW, styleName: "tPriceR", html: thtml(H, `I_tp_${rc.r.id}`) });
      prims.push({ id: `row_vline_${rc.r.id}`, kind: "line", dataKind: "line", x: c.vlineX, y: ry + c.vlineTop, w: 1, h: c.vlineH });
    } else {
      prims.push({ id: `row_price_${rc.r.id}`, kind: "text", dataKind: "text", x: c.tableX + c.tableTxtOff, y: ry + rc.rpTop, w: c.tableNameW, styleName: "tPriceL", html: thtml(H, `I_tp_${rc.r.id}`) });
    }
    prims.push({ id: `row_hline_${rc.r.id}`, kind: "line", dataKind: "line", x: c.tableX, y: ry + rc.rowH, w: c.tableW, h: 1 });
  }

  return { primitives: prims, sectionH: bottom + c.padBottom, nodes };
}

// node → primitive（絶対座標）
function toPrimitives(nodes) {
  return nodes.filter((n) => n.kind !== "group").map((n) => ({
    id: n.id, kind: n.kind, dataKind: dataKindOf(n), x: n.x, y: n._y, w: n.w, h: n.h,
    html: n.html, styleName: n.styleName, fill: n.fill, asset: n.asset, opacity: n.opacity, empty: n.empty,
  }));
}
function dataKindOf(n) {
  if (n.kind === "text") return "text";
  if (n.kind === "photo") return "photo";
  if (n.kind === "pill") return "pill";
  return "line";
}
