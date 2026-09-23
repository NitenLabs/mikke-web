// 方式C（A と B の組み合わせ）：テンプレートの部品は方式A のまま（塊の入れ子・CSS の flex/grid/subgrid、
// ブラウザが座標を計算）。オーナーの操作だけを変える（§3）：
//   move（塊の中）＝「ずらし」を relative でなく余白の変更で持つ＝下の部品が付いてくる
//   move（塊の外）＝取り出して、目印（すぐ上で横が重なる部品）の直後に絶対配置＝目印に追従・流れに入れない
//   add          ＝同上（目印の直後に絶対配置）
//   remove/resize/reset/editRow ＝方式A と同じ
// 座標は JS で計算しない（CSS の calc と position:relative の入れ物だけで書く）。
//
// このファイルは a-box/model.mjs の複製で、上の「オーナーの操作」の箇所だけを変えてある。

import { textDecls, STYLES, COLORS, DESIGN_W, lbOf } from "../lib/spec.mjs";

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

import { collectTextBoxes as bBoxes } from "../b-anchor/model.mjs";
export function collectTextBoxes(content, device) { return bBoxes(content, device); }

const T = (id, style, device, w, html, extra = "") =>
  `<div data-el="${id}" data-kind="text" class="t${lbOf(style) ? " lb" : ""}" style="width:${px(w)};${textDecls(style, device).join(";")};${extra}">${html}</div>`;
const PHOTO = (id, w, h, asset, extra = "") =>
  `<div data-el="${id}" data-kind="photo" class="photo" style="width:${px(w)};height:${px(h)};flex:none;${extra}">${asset}</div>`;
const CARDPHOTO = (id, asset) =>
  `<div data-el="${id}" data-kind="photo" class="photo" style="width:100%;aspect-ratio:1/1">${asset}</div>`;
const EMPTYFRAME = (id, w, h, extra = "", card = false) =>
  `<div data-el="${id}" data-kind="photo" class="photo empty" style="${card ? "width:100%;aspect-ratio:1/1" : `width:${px(w)};height:${px(h)};flex:none`};${extra}">ここに写真を入れてください</div>`;
const cleared = (edits, id) => edits?.clear?.includes(id);
const RULE = (id) => `<div data-el="${id}" data-kind="line" style="width:24px;height:2px;background:${COLORS.text}"></div>`;
const LINE = (id, w, h, op) => `<div data-el="${id}" data-kind="line" style="width:${px(w)};height:${px(h)};background:${COLORS.line}${op ? `;opacity:${op}` : ""}"></div>`;
const thtml = (H, k) => H.get(k)?.html ?? "";
const removed = (edits, id) => edits?.remove?.includes(id);

// 方式C の move（塊の中）＝余白の変更。base の margin-top に dy を足し、dx を margin-left に。流れに残る＝下が付いてくる。
function moveIn(edits, id, baseTop) {
  const m = edits?.move?.[id];
  const top = baseTop + (m?.dy || 0);
  let s = top ? `margin-top:${px(top)}` : "";
  if (m?.dx) s += `${s ? ";" : ""}margin-left:${px(m.dx)}`;
  return s;
}
// 目印の直後に絶対配置する子（CSS の calc だけ・JS で座標を計算しない）。目印が動けば付いていく／流れに入れない。
const absUnder = (id, style, device, w, html, gap) =>
  `<div data-el="${id}" data-kind="text" class="t${lbOf(style) ? " lb" : ""}" style="position:absolute;top:calc(100% + ${px(gap)});left:0;width:${px(w)};${textDecls(style, device).join(";")}">${html}</div>`;

function headingGroup(prefix, content, device, c) {
  return `<div class="hg" style="display:flex;flex-direction:column;align-items:center">
    ${T(prefix + "_lbl", "lbl", device, c.lblW, content.label)}
    ${T(prefix + "_h", "secHead", device, c.hW, content.heading, `margin-top:${px(c.hgLblH)}`)}
    <div style="margin-top:${px(c.hgHRule)}">${RULE(prefix + "_rule")}</div>
  </div>`;
}

// ---------- FEATURE ----------
export function buildFeature(content, device, H, edits = {}) {
  const c = G.feature[device];
  const headBody = edits.template?.headBody ?? c.headBody;
  const hg = headingGroup("F", content.feature, device, c);
  // move（塊の外）：F_b_i を目印（写真）の直後に付ける
  const floatFor = (photoId) => {
    for (const [id, mo] of Object.entries(edits.moveOut || {})) if (mo.marker === photoId) return absUnder(id, "featBody", device, c.tW, thtml(H, id), mo.gap);
    return "";
  };
  const isMovedOut = (id) => edits.moveOut && edits.moveOut[id];
  const bodyEl = (i, base) => (removed(edits, `F_b${i}`) || isMovedOut(`F_b${i}`)) ? "" : T(`F_b${i}`, "featBody", device, c.tW, thtml(H, `F_b${i}`), moveIn(edits, `F_b${i}`, base));

  const photoOf = (i, extra = "") => cleared(edits, `F_p${i}`) ? EMPTYFRAME(`F_p${i}`, c.pW, c.pH, extra) : PHOTO(`F_p${i}`, c.pW, c.pH, content.feature.blocks[i].photo.asset, extra);
  const wrapPhoto = (i, photoHtml) => {
    const child = floatFor(`F_p${i}`);
    return child ? `<div style="position:relative;flex:none">${photoHtml}${child}</div>` : photoHtml;
  };
  let blocks;
  if (device === "pc") {
    const block = (b, i, reversed) => {
      const hEl = T(`F_h${i}`, "featHead", device, c.tW, thtml(H, `F_h${i}`), moveIn(edits, `F_h${i}`, 0));
      const tg = `<div class="tg" style="position:relative;top:${px(c.centerOff)};width:${px(c.tW)};flex:none">${hEl}${bodyEl(i, headBody)}</div>`;
      const photo = removed(edits, `F_p${i}`) ? "" : wrapPhoto(i, photoOf(i));
      const padL = reversed ? c.b2PadL : c.b1PadL;
      const kids = reversed ? photo + tg : tg + photo;
      return `<div class="row" style="display:flex;align-items:center;padding-left:${px(padL)};gap:${px(c.b1Gap)};margin-top:${px(i === 0 ? c.hgToBlk : c.blkGap)}">${kids}</div>`;
    };
    blocks = block(content.feature.blocks[0], 0, false) + block(content.feature.blocks[1], 1, true);
  } else {
    const block = (b, i) => `
      ${removed(edits, `F_p${i}`) ? "" : wrapPhoto(i, photoOf(i, `margin-top:${px(i === 0 ? c.hgToBlk : c.blkGap)}`))}
      ${T(`F_h${i}`, "featHead", device, c.tW, thtml(H, `F_h${i}`), `margin-top:${px(c.photoHead)};` + moveIn(edits, `F_h${i}`, 0))}
      ${bodyEl(i, headBody)}`;
    blocks = block(content.feature.blocks[0], 0) + block(content.feature.blocks[1], 1);
  }
  const align = device === "sp" ? "center" : "stretch";
  // 方式C は「ずらし」を余白で持つので、写真との縦中央そろえ(-12)は tg でなくブロック行で保つ。
  // A と同じく行の align:center で中央そろえ。-12 は tg に relative で乗せる（見た目の微調整・余白と両立）。
  const body = `<div id="sec" style="position:relative;width:${DESIGN_W[device]}px;background:${COLORS.surface}">
    <div class="stack" style="display:flex;flex-direction:column;align-items:${align};padding:${px(c.padTop)} 0 ${px(c.padBottom)}">${hg}${blocks}</div></div>`;
  return { bodyHtml: body, extraCss: "" };
}

// ---------- ITEMS ----------
export function buildItems(content, device, H, edits = {}) {
  const c = { ...G.items[device], ...(edits.geom?.[device] || {}) };
  const photoH = edits.template?.cardPhotoH?.[device];
  const cph = (id, asset) => cleared(edits, id)
    ? EMPTYFRAME(id, 0, 0, "", !photoH)
    : photoH
      ? `<div data-el="${id}" data-kind="photo" class="photo" style="width:100%;height:${px(photoH)}">${asset}</div>`
      : CARDPHOTO(id, asset);
  const addText = edits.addText;
  const hg = headingGroup("I", content.items, device, c);

  let cards;
  if (c.cols > 1) {
    const cardHtml = content.items.cards.map((card) => `
      <div class="card" style="display:grid;grid-template-rows:subgrid;grid-row:span 4;align-items:start">
        ${cph(`card_photo_${card.id}`, card.photo.asset)}
        ${T(`card_name_${card.id}`, "cardName", device, c.cardTxtW, thtml(H, `I_cn_${card.id}`), `margin:${px(c.cardPhotoName)} 0 0 ${px(c.cardTxtInset)}`)}
        ${T(`card_desc_${card.id}`, "cardDesc", device, c.cardTxtW, thtml(H, `I_cd_${card.id}`), `margin:${px(c.cardNameDesc)} 0 0 ${px(c.cardTxtInset)}`)}
        ${T(`card_price_${card.id}`, "cardPrice", device, c.cardTxtW, thtml(H, `I_cp_${card.id}`), `margin:${px(c.cardDescPrice)} 0 0 ${px(c.cardTxtInset)}`)}
      </div>`).join("");
    cards = `<div class="cards" style="display:grid;grid-template-columns:repeat(${c.cols},1fr);column-gap:${px(c.colGap)};grid-template-rows:auto auto auto auto;width:${px(c.cardsW)};margin:${px(c.hgToCards)} auto 0">${cardHtml}</div>`;
  } else {
    const cardHtml = content.items.cards.map((card, i) => `
      <div class="card" style="display:flex;flex-direction:column;align-items:flex-start;${i ? `margin-top:${px(c.colGap)}` : ""}">
        ${cph(`card_photo_${card.id}`, card.photo.asset)}
        ${T(`card_name_${card.id}`, "cardName", device, c.cardTxtW, thtml(H, `I_cn_${card.id}`), `margin:${px(c.cardPhotoName)} 0 0 ${px(c.cardTxtInset)}`)}
        ${T(`card_desc_${card.id}`, "cardDesc", device, c.cardTxtW, thtml(H, `I_cd_${card.id}`), `margin:${px(c.cardNameDesc)} 0 0 ${px(c.cardTxtInset)}`)}
        ${T(`card_price_${card.id}`, "cardPrice", device, c.cardTxtW, thtml(H, `I_cp_${card.id}`), `margin:${px(c.cardDescPrice)} 0 0 ${px(c.cardTxtInset)}`)}
      </div>`).join("");
    cards = `<div class="cards" style="display:flex;flex-direction:column;width:${px(c.cardsW)};margin:${px(c.hgToCards)} auto 0">${cardHtml}</div>`;
  }

  // add（E4）：方式C は目印（区切り線）の直後に絶対配置＝区切り線に付いて動く（流れに入れない）
  const addChild = addText && addText.marker === "I_divider"
    ? absUnder("I_added", "featBody", device, addText.w, addText.text, addText.gap) : "";
  const divider = `<div style="position:relative;margin-top:${px(c.cardsToDivider)};width:${px(c.dividerW)};align-self:center">${LINE("I_divider", c.dividerW, 1, 0.5)}${addChild}</div>`;
  const kanmi = T("I_kanmi", "kanmiLbl", device, c.kanmiW, thtml(H, "I_kanmi"), `margin-top:${px(c.dividerKanmi)};align-self:center`);
  const time = T("I_time", "kanmiTime", device, c.kanmiW, thtml(H, "I_time"), `margin-top:${px(c.kanmiTime)};align-self:center`);
  const rows = content.items.table.map((r) => rowHtml(r, device, c, H)).join("");
  const table = `<div data-el="I_table" class="row-lines" style="width:${px(c.tableW)};margin:${px(c.timeTable)} auto 0">${rows}</div>`;
  const pill = `<div data-el="I_pillbg" data-kind="pill" style="margin-top:${px(c.tablePill)};width:${px(c.pillW)};height:${px(c.pillH)};align-self:center;border:1px solid ${COLORS.textMuted};border-radius:32px;background:${COLORS.background};display:flex;align-items:center;justify-content:center">
    ${T("I_pilltext", "pill", device, "auto", thtml(H, "I_pill"))}</div>`;

  const align = device === "sp" ? "center" : "stretch";
  const body = `<div id="sec" style="width:${DESIGN_W[device]}px;background:${COLORS.background};position:relative">
    <div class="stack" style="display:flex;flex-direction:column;align-items:${align};padding:${px(c.padTop)} 0 ${px(c.padBottom)}">
      ${hg}${cards}${divider}${kanmi}${time}${table}${pill}</div></div>`;
  return { bodyHtml: body, extraCss: "" };
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
