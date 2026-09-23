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

  // 部品ごとの HTML（流れ用・絶対用の両方で使う）
  const hgInner = headingGroupInner("F", content.feature, device, c);
  const photoInner = (i) => clearedOf(`F_p${i}`) ? EMPTYFRAME(`F_p${i}`, c.pW, c.pH) : PHOTO(`F_p${i}`, c.pW, c.pH, content.feature.blocks[i].photo.asset);
  const hInner = (i, extra = "") => T(`F_h${i}`, "featHead", device, c.tW, thtml(H, `F_h${i}`), extra);
  const bInner = (i, extra = "") => T(`F_b${i}`, "featBody", device, c.tW, thtml(H, `F_b${i}`), extra);

  let blocks;
  if (device === "pc") {
    const block = (i, reversed) => {
      const hH = isOut(`F_h${i}`) ? "" : hInner(i, off(`F_h${i}`));
      const bH = isOut(`F_b${i}`) ? "" : bInner(i, `margin-top:${px(headBody)}` + off(`F_b${i}`));
      const tg = (hH || bH) ? `<div class="tg" style="position:relative;top:${px(c.centerOff)};width:${px(c.tW)};flex:none">${hH}${bH}</div>` : "";
      const photo = isOut(`F_p${i}`) ? "" : `<div style="flex:none${off(`F_p${i}`)}">${photoInner(i)}</div>`;
      const padL = reversed ? c.b2PadL : c.b1PadL;
      const kids = reversed ? photo + tg : tg + photo;
      return `<div class="row" style="display:flex;align-items:center;padding-left:${px(padL)};gap:${px(c.b1Gap)};margin-top:${px(i === 0 ? c.hgToBlk : c.blkGap)}">${kids}</div>`;
    };
    blocks = block(0, false) + block(1, true);
  } else {
    const block = (i) => {
      const pH = isOut(`F_p${i}`) ? "" : (clearedOf(`F_p${i}`) ? EMPTYFRAME(`F_p${i}`, c.pW, c.pH, `margin-top:${px(i === 0 ? c.hgToBlk : c.blkGap)}${off(`F_p${i}`)}`) : PHOTO(`F_p${i}`, c.pW, c.pH, content.feature.blocks[i].photo.asset, `margin-top:${px(i === 0 ? c.hgToBlk : c.blkGap)}${off(`F_p${i}`)}`));
      const hH = isOut(`F_h${i}`) ? "" : hInner(i, `margin-top:${px(c.photoHead)}` + off(`F_h${i}`));
      const bH = isOut(`F_b${i}`) ? "" : bInner(i, `margin-top:${px(headBody)}` + off(`F_b${i}`));
      return pH + hH + bH;
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
  const cph = (id, asset) => cleared.includes(id)
    ? EMPTYFRAME(id, 0, 0, "", !photoH)
    : photoH ? `<div data-el="${id}" data-kind="photo" class="photo" style="width:100%;height:${px(photoH)}">${asset}</div>` : CARDPHOTO(id, asset);
  const hgInner = headingGroupInner("I", content.items, device, c);

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

  const dividerInner = LINE("I_divider", c.dividerW, 1, 0.5);
  const kanmiInner = T("I_kanmi", "kanmiLbl", device, c.kanmiW, thtml(H, "I_kanmi"));
  const timeInner = T("I_time", "kanmiTime", device, c.kanmiW, thtml(H, "I_time"));
  const dividerFlow = isOut("I_divider") ? "" : `<div style="margin-top:${px(c.cardsToDivider)};width:${px(c.dividerW)};align-self:center${off("I_divider")}">${dividerInner}</div>`;
  const kanmiFlow = isOut("I_kanmi") ? "" : T("I_kanmi", "kanmiLbl", device, c.kanmiW, thtml(H, "I_kanmi"), `margin-top:${px(c.dividerKanmi)};align-self:center${off("I_kanmi")}`);
  const timeFlow = isOut("I_time") ? "" : T("I_time", "kanmiTime", device, c.kanmiW, thtml(H, "I_time"), `margin-top:${px(c.kanmiTime)};align-self:center${off("I_time")}`);
  const rows = content.items.table.map((r) => rowHtml(r, device, c, H)).join("");
  const table = `<div data-el="I_table" class="row-lines" style="width:${px(c.tableW)};margin:${px(c.timeTable)} auto 0">${rows}</div>`;
  const pill = `<div data-el="I_pillbg" data-kind="pill" style="margin-top:${px(c.tablePill)};width:${px(c.pillW)};height:${px(c.pillH)};align-self:center;border:1px solid ${COLORS.textMuted};border-radius:32px;background:${COLORS.background};display:flex;align-items:center;justify-content:center">
    ${T("I_pilltext", "pill", device, "auto", thtml(H, "I_pill"))}</div>`;

  const hgFlow = isOut("I_hg") ? "" : hgInner;
  const align = device === "sp" ? "center" : "stretch";
  const absItems = absLayer(m2, added, { I_hg: hgInner, I_divider: dividerInner, I_kanmi: kanmiInner, I_time: timeInner }, device);
  const body = `<div id="sec" data-sec="items" style="width:${DESIGN_W[device]}px;background:${COLORS.background};position:relative">
    <div class="stack" style="display:flex;flex-direction:column;align-items:${align};padding:${px(c.padTop)} 0 ${px(c.padBottom)}">
      ${hgFlow}${cards}${dividerFlow}${kanmiFlow}${timeFlow}${table}${pill}</div>${absItems}</div>`;
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
  I_table: "甘味処の表", I_pillbg: "ボタン", "@section": "セクションの先頭",
};
export function friendly(id) {
  if (FRIENDLY[id]) return FRIENDLY[id];
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

// M1 か M2 か：離した部品の中心が、その部品の塊の範囲の中なら M1。
// geomNow＝今の見た目（ドラッグ後）。geomOrig＝動かす前の実測（塊の範囲は元の位置で測る＝動かした部品の元の場所も含める）。
export function classifyDrop(geomNow, id, movingIds = [id], geomOrig) {
  geomOrig = geomOrig || geomNow;
  const part = geomNow[id]; if (!part) return "M1";
  const cx = part.x + part.w / 2, cy = part.y + part.h / 2;
  const mates = (CLUSTER[id] || [id]).filter((m) => geomOrig[m]); // 塊の全メンバー（自分を含む・元の位置）
  if (!mates.length) return "M1";
  const x0 = Math.min(...mates.map((m) => geomOrig[m].x)), y0 = Math.min(...mates.map((m) => geomOrig[m].y));
  const x1 = Math.max(...mates.map((m) => geomOrig[m].x + geomOrig[m].w)), y1 = Math.max(...mates.map((m) => geomOrig[m].y + geomOrig[m].h));
  const pad = 0.5;
  return cx >= x0 - pad && cx <= x1 + pad && cy >= y0 - pad && cy <= y1 + pad ? "M1" : "M2";
}

const NOT_ANCHOR = new Set(["F_lbl", "F_h", "F_rule", "I_lbl", "I_h", "I_rule", "I_pilltext"]);

// 付いていく先を取り直す（同セクションの、すぐ上・横が重なる部品／なければ見出しの組／それも無ければ @section）。
export function reanchor(geom, movedId, secOverride) {
  const part = geom[movedId]; if (!part) return null;
  const sec = secOverride || secId(movedId); const hgId = HG_OF[sec];
  let best = null;
  for (const [id, e] of Object.entries(geom)) {
    if (id === movedId || !e || e.kind === undefined) continue;
    if (NOT_ANCHOR.has(id) || /^row_vline_/.test(id)) continue;
    if (secId(id) !== sec) continue;
    if (id === hgId) continue;
    if (bottomOf(e) > part.y + 1.5) continue;
    if (overlapX(e, part) <= 1) continue;
    if (!best || bottomOf(e) > bottomOf(best.e)) best = { id, e };
  }
  if (!best) { const hg = geom[hgId]; if (hg && bottomOf(hg) <= part.y + 1.5) best = { id: hgId, e: hg }; }
  if (!best) return { anchor: "@section", gapY: +part.y.toFixed(2), x: +part.x.toFixed(2) };
  return { anchor: best.id, gapY: +(part.y - bottomOf(best.e)).toFixed(2), x: +part.x.toFixed(2) };
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
