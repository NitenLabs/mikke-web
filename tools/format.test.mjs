// node --test tools/format.test.mjs
// 連動の書き方（format）と、品の表示判定・段落の空/フラグ・背景の交互を、芦屋堂のデータで固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatTime, formatHoursShort, formatHoursShortLO, formatClosedDays, formatPriceAll, formatPrice, formatPriceAllTax,
  formatPeriod, formatHoursPeriods, hoursShownChars, hoursExceptionDays, applyFormat,
} from "./lib/format.mjs";
import { resolveRepeater, makeRefDate, effectivePrices } from "./lib/catalog.mjs";
import { resolveText } from "./lib/text.mjs";
import { computeSectionBackgrounds } from "./lib/sections.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const shop = JSON.parse(fs.readFileSync(path.join(here, "..", "samples", "ashiyado", "shop.json"), "utf8"));
const items = shop.catalog.items;
const plcs = shop.catalog.placements;

// ---------- 時刻 ----------
test("深夜の時刻：26:00 は「翌2:00」", () => {
  assert.equal(formatTime("26:00"), "翌2:00");
  assert.equal(formatTime("09:00"), "9:00");
  assert.equal(formatTime("18:00"), "18:00");
  assert.equal(formatTime("16:30"), "16:30");
  assert.equal(formatTime("29:59"), "翌5:59");
});

// ---------- hoursShort ----------
test("hoursShort：いちばん多い時間帯を本体に、違う曜日を括弧で添える", () => {
  assert.equal(formatHoursShort(shop.hours), "9:00〜18:00（日曜は17:00まで）");
});

test("hoursShort：servingTime（甘味処）は時間帯とL.O.を出す", () => {
  assert.equal(formatHoursShort(shop.catalog.menus.mnu_kanmi.servingTime), "11:00〜17:00（L.O. 16:30）");
});

// ---------- hoursShortLO（指示 0060）----------
const wk = (o) => {
  const w = {}; for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) w[d] = o[d] === undefined ? o._ : o[d];
  return { weekly: w };
};
const op = (start, end, lastOrder) => ({ status: "open", periods: [{ start, end, ...(lastOrder ? { lastOrder } : {}) }] });
test("hoursShortLO：L.O. がそろえば hoursShort ＋（L.O.）", () => {
  const h = wk({ _: op("17:30", "21:00", "20:30"), mon: { status: "closed" } });
  assert.equal(formatHoursShortLO(h), formatHoursShort(h) + "（L.O. 20:30）");
  assert.equal(formatHoursShortLO(h), "17:30〜21:00（L.O. 20:30）");
  // L.O. が無い店は hoursShort と同じ。servingTime も hoursShort と同じ
  assert.equal(formatHoursShortLO(shop.hours), formatHoursShort(shop.hours));
  assert.equal(formatHoursShortLO(shop.catalog.menus.mnu_kanmi.servingTime), "11:00〜17:00（L.O. 16:30）");
});
test("hoursShortLO：L.O. がそろわなければ曜日ごとに時間帯＋L.O.を「／」で並べる", () => {
  const h = wk({ _: op("17:30", "21:00", "20:30"), mon: { status: "closed" }, sat: op("17:00", "22:00", "21:00") });
  assert.equal(formatHoursShort(h), "17:30〜21:00（土曜は17:00〜22:00）");
  assert.equal(formatHoursShortLO(h), "17:30〜21:00（L.O. 20:30）／土曜は17:00〜22:00（L.O. 21:00）");
  const h2 = wk({ _: op("17:30", "21:00", "20:30"), sun: op("17:30", "20:00", "19:30") });
  assert.equal(formatHoursShortLO(h2), "17:30〜21:00（L.O. 20:30）／日曜は20:00まで（L.O. 19:30）");
});
test("hoursShortLO：L.O. だけ違う曜日は「◯曜はL.O. …」", () => {
  const h = wk({ _: op("17:30", "21:00", "20:30"), sat: op("17:30", "21:00", "20:00") });
  assert.equal(formatHoursShort(h), "17:30〜21:00");
  assert.equal(formatHoursShortLO(h), "17:30〜21:00（L.O. 20:30）／土曜はL.O. 20:00");
});

// ---------- closedDays ----------
test("closedDays：水曜・第3火曜・年末年始", () => {
  assert.equal(formatClosedDays(shop.hours), "水曜・第3火曜・年末年始");
});

// ---------- priceAll / price ----------
test("priceAll（芦屋最中）：1個 220円 ／ 5個入り 1,200円", () => {
  assert.equal(formatPriceAll(items.itm_monaka.prices), "1個 220円 ／ 5個入り 1,200円");
});

test("価格が空の品は何も出さない（空配列）", () => {
  // ※どら焼きはおすすめカード化に伴いサンプル価格 250円 を入れたので、空の検証は空配列で行う
  assert.equal(formatPriceAll([]), "");
  assert.equal(formatPrice([]), "");
});

test("priceAllTax：税込を1回付ける（区切りは／、空白なし）", () => {
  assert.equal(formatPriceAllTax(items.itm_monaka.prices), "1個 220円／5個入り 1,200円（税込）");
  assert.equal(formatPriceAllTax(items.itm_jonama.prices), "380円（税込）");
  assert.equal(formatPriceAllTax(items.itm_dorayaki.prices), "250円（税込）");
  assert.equal(formatPriceAllTax([]), "");
});

test("わらび餅：店頭は450円、甘味処は載せ方の価格で「お茶付き 650円」", () => {
  // 店頭（品の価格）
  assert.equal(formatPriceAll(effectivePrices(items.itm_warabi, plcs.plc_warabi_t)), "450円");
  // 甘味処（載せ方の価格が品の価格を丸ごと置き換える）
  assert.equal(formatPriceAll(effectivePrices(items.itm_warabi, plcs.plc_warabi_k)), "お茶付き 650円");
});

// ---------- 段落の空/フラグ ----------
const scopes = { shop };
const flagElement = (path, freeText) => ({
  type: "text", role: "body",
  paragraphs: [{ runs: [
    { text: freeText },
    { bind: { scope: "shop", path, format: "flag" } },
  ] }],
});

test("flag：true なら段落の自由な文字を出す（giftWrapping=true）", () => {
  const r = resolveText(flagElement("/genreInfo/giftWrapping", "のし承ります"), scopes);
  assert.equal(r.visible, true);
  assert.equal(r.paragraphs[0].runs.map((x) => x.text).join(""), "のし承ります");
});

test("flag：false・空なら段落ごと消える", () => {
  // genreInfo に無いキー（＝空）
  const r = resolveText(flagElement("/genreInfo/reservationOnly", "予約制です"), scopes);
  assert.equal(r.visible, false);
  assert.equal(r.paragraphs.length, 0);
});

test("連動を含む段落：連動先がすべて空なら段落ごと消える（見出し語ごと）", () => {
  const el = {
    type: "text", role: "body",
    paragraphs: [
      { runs: [{ text: "電話　" }, { bind: { scope: "shop", path: "/contact/phone", format: "phone" } }] },
      { runs: [{ text: "FAX　" }, { bind: { scope: "shop", path: "/contact/fax", format: "phone" } }] },
    ],
  };
  const r = resolveText(el, scopes);
  // 電話はある、FAX は無い → FAX の段落（見出し語ごと）消える
  assert.equal(r.paragraphs.length, 1);
  assert.equal(r.paragraphs[0].runs.map((x) => x.text).join(""), "電話　0797-00-0000");
});

test("format=paragraphs：連動した文字を改行で段落に分ける（空の行は捨てる・空なら消える）", () => {
  const sc = { shop: { story: { answers: { q: { answer: ["一行目。", "", "二行目。"].join(String.fromCharCode(10)) }, e: { answer: "" } } } } };
  const el = (path) => ({ type: "text", role: "body", paragraphs: [{ runs: [{ bind: { scope: "shop", path, format: "paragraphs" } }] }] });
  const r = resolveText(el("/story/answers/q/answer"), sc);
  assert.deepEqual(r.paragraphs.map((p) => p.runs.map((x) => x.text).join("")), ["一行目。", "二行目。"]);
  assert.equal(resolveText(el("/story/answers/e/answer"), sc).visible, false);
});

test("自由な文字だけの段落は消えない", () => {
  const el = { type: "text", role: "body", paragraphs: [{ runs: [{ text: "季節を、ひと口に。" }] }] };
  const r = resolveText(el, scopes);
  assert.equal(r.visible, true);
});

// ---------- 品の表示判定（日付） ----------
function menuNames(menuId, dateStr) {
  const rows = resolveRepeater(shop, { kind: "catalog", menuId, groupByCategory: true }, makeRefDate(dateStr));
  return rows.map((r) => r.item.name);
}

test("桜餅は --date 2026-03-15 で表示、2026-09-22 で非表示", () => {
  assert.ok(menuNames("mnu_tento", "2026-03-15").includes("桜餅"));
  assert.ok(!menuNames("mnu_tento", "2026-09-22").includes("桜餅"));
});

test("あんみつ（お休み中）はどちらの日付でも非表示", () => {
  assert.ok(!menuNames("mnu_kanmi", "2026-03-15").includes("あんみつ"));
  assert.ok(!menuNames("mnu_kanmi", "2026-09-22").includes("あんみつ"));
});

test("おすすめ（トップ）：店頭販売の recommended 3件（括り順）", () => {
  const rows = resolveRepeater(shop, { kind: "catalog", menuId: "mnu_tento", labelIds: ["lbl_recommended"], limit: 3 }, makeRefDate("2026-09-22"));
  // 括り順：上生菓子(jonama)→餅菓子(warabi)→焼き菓子(dorayaki)
  // ※芦屋最中は Unsplash に無地・無文字の写真が無く、おすすめから外してどら焼きに差し替えた（SPEC 4.6）
  assert.deepEqual(rows.map((r) => r.item.name), ["季節の上生菓子", "わらび餅", "どら焼き"]);
});

// ---------- 空になったセクションと背景の交互 ----------
test("空になったセクションは消え、背景の交互は消えたあとの順番で決まる", () => {
  const ordered = [
    { id: "sec_a", hidden: false, background: { alternate: true } }, // 0 → background
    { id: "sec_b", hidden: true, background: { alternate: true } },  // 非表示（番号を進めない）
    { id: "sec_c", hidden: false, background: { alternate: true } }, // 1 → surface
    { id: "sec_d", hidden: false, background: { alternate: true } }, // 2 → background
    { id: "sec_e", hidden: false, background: { color: "#123456" } }, // 明示色が優先
  ];
  const bg = computeSectionBackgrounds(ordered);
  assert.equal(bg.sec_a, "theme:background");
  assert.equal(bg.sec_b, null);
  assert.equal(bg.sec_c, "theme:surface");
  assert.equal(bg.sec_d, "theme:background");
  assert.equal(bg.sec_e, "#123456");
});

// ---------- 時間帯の L.O.・定休日の「曜日」の形・店主の画面の字数（指示 0064）----------
test("period：label・L.O. があれば「昼 11:30〜14:00（L.O. 13:30）」、無ければ付けない", () => {
  assert.equal(formatPeriod({ label: "昼", start: "11:30", end: "14:00", lastOrder: "13:30" }), "昼 11:30〜14:00（L.O. 13:30）");
  assert.equal(formatPeriod({ start: "17:30", end: "24:30" }), "17:30〜翌0:30");
  assert.equal(applyFormat("period", { label: "夜", start: "17:30", end: "21:30" }), "夜 17:30〜21:30");
});

test("hoursPeriods：そろえば時間帯を「／」で、違う曜日は「／土曜は…」で足す", () => {
  const P = (lunchEnd) => [{ label: "昼", start: "11:30", end: lunchEnd, lastOrder: "13:30" }, { label: "夜", start: "17:30", end: "21:30", lastOrder: "20:30" }];
  const open = (ps) => ({ status: "open", periods: ps });
  const weekly = { mon: { status: "closed" }, tue: open(P("14:00")), wed: open(P("14:00")), thu: open(P("14:00")), fri: open(P("14:00")), sat: open(P("15:00")), sun: open(P("14:00")) };
  assert.equal(formatHoursPeriods({ weekly }), "昼 11:30〜14:00（L.O. 13:30）／夜 17:30〜21:30（L.O. 20:30）／土曜は昼 11:30〜15:00（L.O. 13:30）／夜 17:30〜21:30（L.O. 20:30）");
  const same = { ...weekly, sat: open(P("14:00")) };
  assert.equal(formatHoursPeriods({ weekly: same }), "昼 11:30〜14:00（L.O. 13:30）／夜 17:30〜21:30（L.O. 20:30）");
  assert.equal(formatHoursPeriods({ periods: [{ start: "11:00", end: "14:00" }] }), "11:00〜14:00");
});

test("closedDaysLong：芦屋堂は「水曜日・第3火曜日・年末年始」（closedDays は今までどおり）", () => {
  const shop = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "samples", "ashiyado", "shop.json"), "utf8"));
  assert.equal(applyFormat("closedDaysLong", shop.hours), "水曜日・第3火曜日・年末年始");
  assert.equal(applyFormat("closedDays", shop.hours), "水曜・第3火曜・年末年始");
});

test("hoursShownChars・hoursExceptionDays：L.O. の分も数える（L.O. の無い店は hoursShort と同じ）", () => {
  const open = (end, lo) => ({ status: "open", periods: [{ start: "17:30", end, ...(lo ? { lastOrder: lo } : {}) }] });
  const noLo = { weekly: { mon: open("21:00"), tue: open("21:00"), sat: open("22:00") } };
  assert.equal(hoursShownChars(noLo), [...formatHoursShort(noLo)].length);
  const lo = { weekly: { mon: open("21:00", "20:30"), tue: open("21:00", "20:30"), sat: open("21:00", "21:00") } };
  assert.equal(hoursShownChars(lo), [...formatHoursShortLO(lo)].length);
  assert.equal(hoursExceptionDays(lo), 0);
  assert.equal(hoursExceptionDays(lo, { lo: true }), 1);
  assert.equal(hoursExceptionDays(noLo), 1);
});

test("hoursTableLO：各曜日の値に最後の時間帯の L.O.（hoursTable は今までどおり）", () => {
  const h = { weekly: { mon: { status: "closed" }, tue: { status: "open", periods: [{ start: "11:30", end: "14:00", lastOrder: "13:30" }, { start: "17:30", end: "21:00", lastOrder: "20:30" }] }, wed: { status: "open", periods: [{ start: "11:30", end: "14:00" }] } } };
  assert.deepEqual(applyFormat("hoursTableLO", h).map((r) => r.value), ["休み", "11:30〜14:00・17:30〜21:00（L.O. 20:30）", "11:30〜14:00"]);
  assert.deepEqual(applyFormat("hoursTable", h).map((r) => r.value), ["休み", "11:30〜14:00・17:30〜21:00", "11:30〜14:00"]);
});
