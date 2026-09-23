// 方式C2（選んで動かす）：テンプレートの部品は方式A のまま（塊の入れ子・CSS の flex/grid/subgrid、
// ブラウザが座標を計算）＝ overrides が無ければ方式A と1文字も違わない出力になる（比較試験 5.1 が一致）。
// オーナーの操作だけを、前回の C（c-hybrid）とは別の考え方で持つ（作業票 §1.1）：
//   手で動かす（PowerPoint）：選んだ部品だけを見た目で動かす（元の流れの箱＝穴は残す＝H2）。
//   動かし終わったら          ：今の見た目のまま「付いていく先（すぐ上・横が重なる部品／なければ見出しの組）」と
//                               「そこからの空き（gapY）」を取り直す（reanchor）。
//   中身が変わったとき（Word）：取り直した先に追従する（placeOverrides が付いていく先の今の位置＋gapY を出す）。
// 動かす表現は「元の流れに残したまま、付いていく先へ視覚移動（transform）」＝
//   ・元の箱が流れに残る → 下の部品は動かない（H2）
//   ・視覚移動は塊の縦中央そろえの外側で効く → 半分しか動かない不具合（F1）が起きない（H1）
//   ・付いていく先の今の位置から測るので、中身が増えれば追従する（H3）
// このファイルは a-box/model.mjs のテンプレ描画をそのまま持ち、
//   (1) 見出しの組に data-el（付いていく先・掴む対象にするため）
//   (2) 足した文字を「付いていく先つきの絶対配置」で描く
//   (3) 付いていく先の計算（reanchor）と、追従の座標（placeOverrides）を足す
// だけが方式A と異なる。座標の最終決定は「一度描いて実測 → transform」で app 側が行う（§0：計算は experiments/layout に置く）。

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
const cleared = (edits, id) => edits?.clear?.includes(id);
const RULE = (id) => `<div data-el="${id}" data-kind="line" style="width:24px;height:2px;background:${COLORS.text}"></div>`;
const LINE = (id, w, h, op) => `<div data-el="${id}" data-kind="line" style="width:${px(w)};height:${px(h)};background:${COLORS.line}${op ? `;opacity:${op}` : ""}"></div>`;
const thtml = (H, k) => H.get(k)?.html ?? "";
const removed = (edits, id) => edits?.remove?.includes(id);

// 見出しの組（4.0）＝掴める1つの部品／付いていく先の候補。data-el を付けて実測できるようにする。
function headingGroup(prefix, content, device, c) {
  return `<div class="hg" data-el="${prefix}_hg" data-kind="group" style="display:flex;flex-direction:column;align-items:center">
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
  const bodyEl = (i, extraBase) => {
    const id = `F_b${i}`;
    if (removed(edits, id)) return "";
    return T(id, "featBody", device, c.tW, thtml(H, id), extraBase);
  };
  let blocks;
  if (device === "pc") {
    const block = (b, i, reversed) => {
      const hEl = T(`F_h${i}`, "featHead", device, c.tW, thtml(H, `F_h${i}`));
      const tg = `<div class="tg" style="position:relative;top:${px(c.centerOff)};width:${px(c.tW)};flex:none">${hEl}${bodyEl(i, `margin-top:${px(headBody)}`)}</div>`;
      const photo = removed(edits, `F_p${i}`) ? "" : cleared(edits, `F_p${i}`) ? EMPTYFRAME(`F_p${i}`, c.pW, c.pH) : PHOTO(`F_p${i}`, c.pW, c.pH, b.photo.asset);
      const padL = reversed ? c.b2PadL : c.b1PadL;
      const kids = reversed ? photo + tg : tg + photo;
      return `<div class="row" style="display:flex;align-items:center;padding-left:${px(padL)};gap:${px(c.b1Gap)};margin-top:${px(i === 0 ? c.hgToBlk : c.blkGap)}">${kids}</div>`;
    };
    blocks = block(content.feature.blocks[0], 0, false) + block(content.feature.blocks[1], 1, true);
  } else {
    const block = (b, i) => `
      ${removed(edits, `F_p${i}`) ? "" : cleared(edits, `F_p${i}`) ? EMPTYFRAME(`F_p${i}`, c.pW, c.pH, `margin-top:${px(i === 0 ? c.hgToBlk : c.blkGap)}`) : PHOTO(`F_p${i}`, c.pW, c.pH, b.photo.asset, `margin-top:${px(i === 0 ? c.hgToBlk : c.blkGap)}`)}
      ${T(`F_h${i}`, "featHead", device, c.tW, thtml(H, `F_h${i}`), `margin-top:${px(c.photoHead)}`)}
      ${bodyEl(i, `margin-top:${px(headBody)}`)}`;
    blocks = block(content.feature.blocks[0], 0) + block(content.feature.blocks[1], 1);
  }
  const align = device === "sp" ? "center" : "stretch";
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

  const divider = `<div style="margin-top:${px(c.cardsToDivider)};width:${px(c.dividerW)};align-self:center">${LINE("I_divider", c.dividerW, 1, 0.5)}</div>`;
  const kanmi = T("I_kanmi", "kanmiLbl", device, c.kanmiW, thtml(H, "I_kanmi"), `margin-top:${px(c.dividerKanmi)};align-self:center`);
  const time = T("I_time", "kanmiTime", device, c.kanmiW, thtml(H, "I_time"), `margin-top:${px(c.kanmiTime)};align-self:center`);
  const rows = content.items.table.map((r) => rowHtml(r, device, c, H)).join("");
  const table = `<div data-el="I_table" class="row-lines" style="width:${px(c.tableW)};margin:${px(c.timeTable)} auto 0">${rows}</div>`;
  const pill = `<div data-el="I_pillbg" data-kind="pill" style="margin-top:${px(c.tablePill)};width:${px(c.pillW)};height:${px(c.pillH)};align-self:center;border:1px solid ${COLORS.textMuted};border-radius:32px;background:${COLORS.background};display:flex;align-items:center;justify-content:center">
    ${T("I_pilltext", "pill", device, "auto", thtml(H, "I_pill"))}</div>`;

  // 足した文字（E4/P4）：付いていく先つきの絶対配置。app が placeOverrides で「先の今の位置＋gap」に置く＝
  // 区切り線が下がれば一緒に下がる（方式A は追従しない＝絶対で留まる）。data-ov-* に先と空きを持たせる。
  const added = addText
    ? `<div data-el="I_added" data-kind="text" class="t lb" data-ov-anchor="${addText.marker || "I_divider"}" data-ov-gap="${addText.gap ?? 24}" data-ov-x="${addText.x ?? 0}" style="position:absolute;left:${px(addText.x ?? 0)};top:${px(addText.y ?? 0)};width:${px(addText.w)};${textDecls("featBody", device).join(";")}">${addText.text}</div>`
    : "";

  const align = device === "sp" ? "center" : "stretch";
  const body = `<div id="sec" style="width:${DESIGN_W[device]}px;background:${COLORS.background};position:relative">
    <div class="stack" style="display:flex;flex-direction:column;align-items:${align};padding:${px(c.padTop)} 0 ${px(c.padBottom)}">
      ${hg}${cards}${divider}${kanmi}${time}${table}${pill}</div>${added}</div>`;
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

// ===================== 付いていく先（オーナー操作の層） =====================

// オーナーに分かる部品名（§3・F5）。中の名前（F_b0 等）は出さない。
export const FRIENDLY = {
  F_hg: "特集の見出しの組", F_p0: "特集1の写真", F_h0: "特集1の見出し", F_b0: "特集1の本文",
  F_p1: "特集2の写真", F_h1: "特集2の見出し", F_b1: "特集2の本文",
  I_hg: "おすすめの見出しの組", I_divider: "区切り線", I_kanmi: "甘味処の見出し", I_time: "甘味処の時間",
  I_table: "甘味処の表", I_pillbg: "ボタン", I_added: "足した文字", "@section": "セクションの先頭",
};
export function friendly(id) {
  if (FRIENDLY[id]) return FRIENDLY[id];
  if (/^card_/.test(id)) return "品";
  if (/^row_/.test(id)) return "表の行";
  return id;
}

// 付いていく先の候補にしない部品（見出しの組は組で扱う／表の縦線は無視）
const NOT_ANCHOR = new Set(["F_lbl", "F_h", "F_rule", "I_lbl", "I_h", "I_rule", "F_added", "I_pilltext"]);
const isAnchorCand = (id) => !NOT_ANCHOR.has(id) && !/^row_vline_/.test(id);
const overlapX = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
const bottomOf = (e) => e.y + e.h;
const secId = (id) => (id.startsWith("F_") ? "feature" : "items"); // feature/items のどちらの部品か（座標系が別なので混ぜない）

// 付いていく先を取り直す（§1.1「動かし終わったとき」）。
// geom: {id:{x,y,w,h,kind}}（今の見た目）。movedId: 取り直す部品。excl: 同時に動かした他の部品（自分は除く）。
// hgId: セクションの見出しの組の id（なければの受け皿）。
// 返り: { anchor, gapY, x }  anchor は付いていく先の id（@section も可）。
export function reanchor(geom, movedId, hgId) {
  const part = geom[movedId];
  if (!part) return null;
  const sec = secId(movedId);
  let best = null;
  for (const [id, e] of Object.entries(geom)) {
    if (id === movedId || !isAnchorCand(id) || !e || e.kind === undefined) continue;
    if (secId(id) !== sec) continue;             // 同じセクション内だけ（feature と items は座標系が別）
    if (id === hgId) continue; // 見出しの組は最後の受け皿として別に見る
    if (bottomOf(e) > part.y + 1.5) continue;        // すぐ上（下端が上端より上）
    if (overlapX(e, part) <= 1) continue;            // 横の範囲が重なる
    if (!best || bottomOf(e) > bottomOf(best.e)) best = { id, e };
  }
  if (!best) {
    const hg = geom[hgId];
    if (hg && bottomOf(hg) <= part.y + 1.5) best = { id: hgId, e: hg };
  }
  if (!best) return { anchor: "@section", gapY: +part.y.toFixed(2), x: +part.x.toFixed(2) };
  return { anchor: best.id, gapY: +(part.y - bottomOf(best.e)).toFixed(2), x: +part.x.toFixed(2) };
}

// 追従の座標（§1.1「中身が変わったとき」）。
// flowGeom: overrides を適用せず（transform 前の）素の実測。overrides: {id:{anchor,gapY,x}}。
// 返り: {id:{tx,ty}}  各部品を元の流れの位置から (tx,ty) だけ視覚移動すれば、付いていく先の今の下端＋gapY に乗る。
// 付いていく先自身も動かした部品のとき（まとめて動かした見出し＋本文など）は、先の「動かした後の位置」に従う（連鎖を解く）。
export function placeOverrides(flowGeom, overrides) {
  overrides = overrides || {};
  const memo = {};
  const guard = new Set();
  // id の「動かした後の上端」。overrides に無ければ素の流れの上端。
  function topOf(id) {
    if (id in memo) return memo[id];
    const cur = flowGeom[id];
    const ov = overrides[id];
    if (!ov) return (memo[id] = cur ? cur.y : 0);
    if (guard.has(id)) return cur ? cur.y : 0; // 万一の循環（reanchor は上方向のみなので通常起きない）
    guard.add(id);
    let t;
    if (ov.anchor === "@section" || !flowGeom[ov.anchor]) t = ov.gapY;      // 先がセクション上端／先が消えた
    else t = topOf(ov.anchor) + flowGeom[ov.anchor].h + ov.gapY;             // 先の「動かした後の下端」＋空き
    guard.delete(id);
    return (memo[id] = t);
  }
  const out = {};
  for (const id of Object.keys(overrides)) {
    const cur = flowGeom[id]; if (!cur) continue;
    out[id] = { tx: +(overrides[id].x - cur.x).toFixed(2), ty: +(topOf(id) - cur.y).toFixed(2) };
  }
  return out;
}
