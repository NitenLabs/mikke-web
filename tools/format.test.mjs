// node --test tools/format.test.mjs
// 連動の書き方（format）と、品の表示判定・段落の空/フラグ・背景の交互を、芦屋堂のデータで固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatTime, formatHoursShort, formatClosedDays, formatPriceAll, formatPrice, formatPriceAllTax,
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
