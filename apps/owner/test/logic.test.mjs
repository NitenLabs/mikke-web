// 店主の編集画面の純粋な部品の試験（SPEC 10章）。node --test apps/owner/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ruleFor, defaultTextRule, checkText, checkHours, checkPrices, checkList, checkPhotoWidth, photoRule, exceptionDays, remainText, canAdd, canRemove, worst } from "../src/lib/limits.js";
import { setDay, applyAll, hoursLine, closedLine, normTime, dayView } from "../src/lib/hours.js";
import { listItems, addItem, removeItem, moveItem, moveItemTo, dropIndex, setItemField, pricesFromRows, newId, rowsFromPrices, setRowType, setPriceShown, PRICE_TYPES } from "../src/lib/menu.js";
import { fitCrop, moveCrop, scaleCrop, innerRect, outputSize, limitSize } from "../src/lib/crop.js";
import { editableFrom, textParagraphs, setTextParagraphs, setShopValue, setElementPhoto, setItemPhoto, photoAsset, outsideEdits, dirtyKinds, resolveConflict, previewTexts, changedPaths, cardTexts, completePrices, priceSummary } from "../src/lib/draft.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const LIM = read("samples/amet/edit-limits.json");
const SHOP = read("samples/amet/shop.json");
const SITE = { draft: { ...read("samples/amet/site.json"), template: { name: "wa-03", version: 1 }, genConfig: read("samples/amet/wa03.json") }, theme: read("samples/amet/theme.json") };
const rnd = (() => { let i = 0; return () => ((i++ * 7) % 32) / 32; })();

// 下地（rebuild-shop の書き出し）にある印の形
const MARKS = [
  { edit: "shop:/hours", el: "ac_v1" }, { edit: "shop:/hours", el: "ft_v1" },
  { edit: "shop:/story/answers/q_body/answer", el: "st_body" }, { edit: "shop:/story/answers/q_catch/answer", el: "st_catch" },
  { edit: "text:fv_copy", el: "fv_copy" }, { edit: "photo:ast_fv01", el: "fv_1" },
  { edit: "list:catalog:mnu_food", el: "mn_cards" }, { edit: "item:itm_m001" },
  { edit: "item:itm_m001/name", cel: "c_nm", item: "itm_m001" }, { edit: "item:itm_m001/description", cel: "c_ds", item: "itm_m001" },
  { edit: "item:itm_m001/prices", cel: "c_pr", item: "itm_m001" }, { edit: "photo:ast_mn01", cel: "c_ph", item: "itm_m001" },
  { edit: "sec:sec_story", el: undefined },
];
const ED = editableFrom(MARKS);

// ───────── limits
test("limits：item:<id>/x は item:*/x の規則を使う", () => {
  assert.equal(ruleFor(LIM, "item:itm_x/name").maxChars, 10);
  assert.equal(ruleFor(LIM, "shop:/hours").maxRenderedChars, 80);
  assert.equal(ruleFor(LIM, "text:fv_copy"), null);
});
test("limits：warn は保存できる・hardMax を超えると error", () => {
  const r = ruleFor(LIM, "item:a/name");
  assert.equal(checkText("あいうえおかきくけこ", r).level, "ok");
  assert.equal(remainText(checkText("あいう", r)), "あと 7 字");
  const w = checkText("あいうえおかきくけこさし", r);
  assert.equal(w.level, "warn");
  assert.match(w.messages[0].text, /保存はできます/);
  const e = checkText("あ".repeat(16), r);
  assert.equal(e.level, "error");
  assert.equal(e.messages[0].text, "15 字までにしてください（今 16 字）");
});
test("limits：紹介文の段落・PC の行数は目安（warn）", () => {
  const r = ruleFor(LIM, "shop:/story/answers/q_body/answer");
  assert.equal(checkText("あ".repeat(300), r).level, "ok");
  assert.equal(checkText("あ\nい\nう\nえ", r).level, "warn");
  assert.equal(checkText("あ".repeat(320), r).level, "warn");
  assert.equal(checkText("あ".repeat(100) + "\n" + "い".repeat(100) + "\n" + "う".repeat(100), r).level, "ok", "34 字で折ると 3+3+3=9 行まで");
  assert.equal(checkText("あ".repeat(110) + "\n" + "い".repeat(100) + "\n" + "う".repeat(80), r).level, "warn", "4+3+3=10 行");
});
test("limits：見出しの 1 行 12 字・2 行まで（warn）", () => {
  const r = ruleFor(LIM, "shop:/story/answers/q_catch/answer");
  assert.equal(checkText("一杯のコーヒーと、\nドーナツをひとつ。", r).level, "ok");
  assert.equal(checkText("一杯のコーヒーとドーナツを。", r).level, "warn");
  assert.equal(checkText("あ\nい\nう", r).level, "warn");
});
test("limits：edit-limits に無い文字の箱の既定（段落の数・最長＋2 字、error）", () => {
  const rule = defaultTextRule(["深呼吸のかわりに、", "一杯。"]);
  assert.deepEqual([rule.maxParagraphs, rule.maxParagraphChars], [2, 11]);
  assert.equal(checkText("深呼吸のかわりに、ね。\n一杯。", rule).level, "ok");
  assert.equal(checkText("深呼吸のかわりに、ねえ。\n一杯。", rule).level, "error");
  assert.equal(checkText("あ\nい\nう", rule).level, "error");
  assert.equal(checkText("", rule, { required: true }).level, "error");
});
test("limits：営業時間（違う曜日 3 つまで・表示 80 字まで・時刻の形）", () => {
  const rule = ruleFor(LIM, "shop:/hours");
  let h = SHOP.hours;
  assert.equal(checkHours(h, rule).level, "ok");
  h = setDay(h, "mon", { status: "open", start: "09:00", end: "17:00" });
  h = setDay(h, "tue", { status: "open", start: "10:00", end: "17:00" });
  h = setDay(h, "wed", { status: "open", start: "11:00", end: "17:00" });
  assert.equal(exceptionDays(h), 3);
  assert.equal(checkHours(h, rule).level, "ok");
  h = setDay(h, "thu", { status: "open", start: "12:00", end: "17:00" });
  const r = checkHours(h, rule);
  assert.equal(r.level, "error");
  assert.match(r.messages[0].text, /3 つまで/);
  assert.equal(checkHours(setDay(SHOP.hours, "mon", { status: "open", start: "18:00", end: "09:00" }), rule).level, "error");
  assert.equal(checkHours(setDay(SHOP.hours, "mon", { status: "open", start: "9時", end: "18:00" }), rule).level, "error");
  assert.equal(checkHours(setDay(SHOP.hours, "wed", { status: "closed" }), rule).level, "ok", "休みの曜日は数えない");
});
test("limits：値段（3 つまで・名前 6 字・数字）と品の数と写真の幅", () => {
  const rule = ruleFor(LIM, "item:a/prices");
  const p = (n, name) => ({ id: `prc_t${n}xx`, type: "fixed", amount: 500, ...(name ? { name } : {}) });
  assert.equal(checkPrices([p(1)], rule).level, "ok");
  assert.equal(checkPrices([p(1, "S"), p(2, "M"), p(3, "L"), p(4, "XL")], rule).level, "error");
  assert.equal(checkPrices([p(1, "ショートサイズ")], rule).level, "error");
  assert.equal(checkPrices([{ id: "prc_aaaa", type: "fixed", amount: "abc" }], rule).level, "error");
  assert.equal(checkPrices([p(1), p(2)], rule).level, "error", "2 つ以上は名前が要る");
  const lr = LIM.lists["catalog:mnu_food"];
  assert.equal(checkList(0, lr).level, "error");
  assert.equal(checkList(25, lr).level, "error");
  assert.equal(canAdd(24, lr), false); assert.equal(canAdd(23, lr), true);
  assert.equal(canRemove(1, lr), false);
  assert.equal(checkPhotoWidth(900, photoRule(LIM, { assetId: "ast_fv01" })).level, "warn");
  assert.equal(checkPhotoWidth(1200, photoRule(LIM, { assetId: "ast_fv01" })).level, "ok");
  assert.equal(photoRule(LIM, { itemId: "itm_x" }).aspect.pc, 1.57);
  assert.equal(worst([{ level: "ok" }, { level: "warn" }]), "warn");
  assert.equal(worst([{ level: "warn" }, { level: "error" }]), "error");
});

// ───────── hours
test("hours：曜日の休み・時刻・全部に同じ時間・表示", () => {
  assert.equal(normTime("8:30"), "08:30");
  let h = setDay(SHOP.hours, "wed", { status: "closed" });
  assert.deepEqual(h.weekly.wed, { status: "closed" });
  assert.equal(SHOP.hours.weekly.wed.status, "open", "元は変えない");
  assert.equal(closedLine(h), "水曜");
  assert.equal(closedLine(SHOP.hours), "なし");
  h = setDay(h, "sun", { status: "open", start: "9:00", end: "17:00" });
  assert.equal(hoursLine(h), "8:30〜18:00（日曜は9:00〜17:00）");
  h = applyAll(h, "10:00", "19:00");
  assert.equal(hoursLine(h), "10:00〜19:00");
  assert.deepEqual(h.weekly.wed, { status: "closed" }, "お休みの曜日はそのまま");
  assert.deepEqual(dayView(h, "wed"), { status: "closed", start: "", end: "" });
  h = setDay(h, "wed", { status: "open" });
  assert.equal(dayView(h, "wed").status, "open");
});

// ───────── menu
test("menu：並び・足す・並べ替え・消す（review の行も）", () => {
  const ids = () => listItems(s, "mnu_food").map((x) => x.itemId);
  let s = SHOP;
  assert.deepEqual(ids().slice(0, 2), ["itm_m001", "itm_m002"]);
  const r = addItem(s, "mnu_food", "cat_menu", { rand: rnd });
  s = r.shop;
  assert.match(r.itemId, /^itm_[a-z0-9]{4,24}$/);
  assert.match(r.placementId, /^plc_[a-z0-9]{4,24}$/);
  assert.equal(ids().at(-1), r.itemId);
  assert.equal(ids().length, 9);
  s = moveItem(s, "mnu_food", r.itemId, -1);
  assert.equal(ids().at(-2), r.itemId);
  s = moveItem(s, "mnu_food", "itm_m001", -1);
  assert.equal(ids()[0], "itm_m001", "先頭は上へ行かない");
  assert.ok(SHOP.review["/catalog/items/itm_m001/prices"]);
  s = removeItem(s, "itm_m001");
  assert.equal(ids().includes("itm_m001"), false);
  assert.equal(s.catalog.items.itm_m001, undefined);
  assert.equal(Object.values(s.catalog.placements).some((p) => p.itemId === "itm_m001"), false);
  assert.equal(s.review["/catalog/items/itm_m001/prices"], undefined);
  assert.ok(s.review["/catalog/items/itm_m005/prices"], "ほかの品の行は残す");
});
test("menu：項目を直すと draft:true が外れる・値段の行から prices", () => {
  const s = setItemField(SHOP, "itm_m001", "name", "アイスコーヒー（大）");
  assert.equal(s.catalog.items.itm_m001.draft, undefined);
  assert.equal(SHOP.catalog.items.itm_m001.draft, true);
  const ps = pricesFromRows([{ amount: "1,280" }, { name: "大", amount: "700", type: "from" }], SHOP.catalog.items.itm_m001.prices, new Set(), rnd);
  assert.equal(ps[0].id, "prc_m001", "前の id を残す");
  assert.deepEqual({ ...ps[0] }, { id: "prc_m001", type: "fixed", amount: 1280 });
  assert.equal(ps[1].type, "from"); assert.equal(ps[1].name, "大"); assert.match(ps[1].id, /^prc_/);
  assert.equal(newId("itm", new Set(), () => 0), "itm_oaaaaaa");
  const seq = [0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0]; let i = 0;
  assert.equal(newId("itm", new Set(["itm_oaaaaaa"]), () => seq[i++]), "itm_osaaaaa", "使った ID は使い回さない");
});

// ───────── crop
test("crop：中央の枠・動かす・広げる・スマホの枠・出す大きさ", () => {
  const r = fitCrop(2400, 1600, 0.62);
  assert.equal(r.h, 1600); assert.ok(Math.abs(r.w - 992) < 1e-9); assert.ok(Math.abs(r.x - 704) < 1e-9); assert.equal(r.y, 0);
  const m = moveCrop(r, 5000, -50, 2400, 1600);
  assert.ok(Math.abs(m.x - (2400 - 992)) < 1e-9); assert.equal(m.y, 0);
  const s = scaleCrop(r, 0.5, 2400, 1600, 0.62);
  assert.ok(Math.abs(s.w - 496) < 1e-9 && Math.abs(s.h - 800) < 1e-9);
  assert.ok(Math.abs(s.x + s.w / 2 - 1200) < 1e-9, "中心を保つ");
  assert.ok(Math.abs(s.w / s.h - 0.62) < 1e-9, "比は変えない");
  assert.equal(scaleCrop(r, 0.01, 2400, 1600, 0.62).h, 320, "0.2 より小さくしない");
  const sp = innerRect(r, 0.48);
  assert.ok(sp.w <= r.w && sp.h <= r.h && sp.x >= r.x && Math.abs(sp.w / sp.h - 0.48) < 1e-9);
  assert.deepEqual(outputSize({ x: 0, y: 0, w: 3000, h: 1500 }), { w: 2400, h: 1200 });
  assert.deepEqual(outputSize(s), { w: 496, h: 800 });
  assert.deepEqual(limitSize(4000, 3000), { w: 2400, h: 1800 });
});

// ───────── draft mapping
test("draft：印から直してよい所（値段の印はどれかのカードにあれば全部の品）", () => {
  assert.ok(ED.shopPtrs.has("/hours") && ED.texts.has("fv_copy") && ED.lists.has("catalog:mnu_food"));
  assert.deepEqual([...ED.itemFields].sort(), ["description", "name", "photos", "prices"]);
  assert.deepEqual(ED.photos, [{ key: "photo:ast_fv01", elId: "fv_1", assetId: "ast_fv01" }, { key: "photo:ast_mn01", itemId: "itm_m001", assetId: "ast_mn01" }]);
  assert.equal(ED.keys.has("sec:sec_story"), true);
});
test("draft：表紙の言葉は ② の段落と genConfig.fvCopy の両方", () => {
  assert.deepEqual(textParagraphs(SITE, "fv_copy"), ["深呼吸のかわりに、", "一杯。"]);
  const s = setTextParagraphs(SITE, "fv_copy", ["朝の一杯を、", "", "どうぞ。"]);
  assert.deepEqual(textParagraphs(s, "fv_copy"), ["朝の一杯を、", "どうぞ。"]);
  assert.deepEqual(s.draft.genConfig.fvCopy, ["朝の一杯を、", "どうぞ。"]);
  assert.deepEqual(previewTexts(SHOP, s, ED)["text:fv_copy"], ["朝の一杯を、", "どうぞ。"]);
  assert.deepEqual(outsideEdits(ED, SHOP, SHOP, SITE, s), []);
});
test("draft：物語・写真・品・保存の前の確かめ", () => {
  let sh = setShopValue(SHOP, "/story/answers/q_body/answer", "新しい紹介。\n二段落目。");
  assert.equal(sh.story.draft, undefined);
  assert.deepEqual(previewTexts(sh, SITE, ED)["shop:/story/answers/q_body/answer"], ["新しい紹介。", "二段落目。"]);
  assert.equal(previewTexts(sh, SITE, ED)["shop:/hours"][0], "8:30〜18:00");
  let si = setElementPhoto(SITE, "fv_1", "ast_newone");
  assert.equal(si.draft.elements.fv_1.asset, "ast_newone");
  assert.deepEqual(si.draft.elements.fv_1.crop, { fx: 50, fy: 50, zoom: 1 });
  assert.equal(photoAsset(ED.photos[0], sh, si), "ast_newone");
  sh = setItemPhoto(sh, "itm_m001", "ast_newtwo");
  assert.equal(photoAsset(ED.photos[1], sh, si), "ast_newtwo");
  const added = addItem(sh, "mnu_food", "cat_menu", { rand: rnd });
  sh = removeItem(added.shop, "itm_m002");
  assert.deepEqual(outsideEdits(ED, SHOP, sh, SITE, si), [], "印のある所だけなら空");
  const bad = setShopValue(sh, "/basic/name", "ちがう名前");
  assert.deepEqual(outsideEdits(ED, SHOP, bad, SITE, si), ["①/basic/name"]);
  const bad2 = JSON.parse(JSON.stringify(si)); bad2.draft.elements.hd_name.paragraphs = [];
  assert.deepEqual(outsideEdits(ED, SHOP, sh, SITE, bad2), ["②/draft/elements/hd_name/paragraphs"]);
  assert.ok(changedPaths({ a: 1 }, { a: 2 }).includes("/a"));
});
test("draft：変えた方だけ送る・409 の片付け", () => {
  const st = { saved: { shop: SHOP, site: SITE }, shop: SHOP, site: SITE };
  assert.deepEqual(dirtyKinds(st), []);
  assert.deepEqual(dirtyKinds({ ...st, shop: setDay(SHOP.hours, "wed", { status: "closed" }) }), ["shop"]);
  assert.deepEqual(dirtyKinds({ ...st, site: setElementPhoto(SITE, "fv_1", "ast_x0000") }), ["site"]);
  const mine = { me: 1 }, current = { version: 7, data: { them: 1 } };
  assert.deepEqual(resolveConflict("shop", "theirs", mine, current), { backup: { shop: mine }, put: null, adopt: { version: 7, data: { them: 1 } } });
  assert.deepEqual(resolveConflict("site", "mine", mine, current), { backup: { site: { them: 1 } }, put: { version: 7, data: mine }, adopt: null });
});

// ───────── 値段の書き方（指示 0056）：○円・○円〜・○〜○円・時価・値段を出さない
const PRULE = ruleFor(LIM, "item:a/prices");
const rows1 = (r) => pricesFromRows([r], [{ id: "prc_m001" }], new Set(), rnd);
test("値段：○円（fixed）", () => {
  const ps = rows1({ type: "fixed", amount: "１,２８０" });
  assert.deepEqual(ps, [{ id: "prc_m001", type: "fixed", amount: 1280 }]);
  assert.equal(checkPrices(ps, PRULE).level, "ok");
  assert.equal(cardTexts({ prices: ps }).prices, "1,280円");
});
test("値段：○円〜（from）", () => {
  const ps = rows1({ type: "from", amount: "500", max: "900" });
  assert.deepEqual(ps, [{ id: "prc_m001", type: "from", amount: 500 }], "from は max を持たない");
  assert.equal(checkPrices(ps, PRULE).level, "ok");
  assert.equal(cardTexts({ prices: ps }).prices, "500円〜");
});
test("値段：○〜○円（range）", () => {
  const ps = rows1({ type: "range", amount: "800", max: "1,200" });
  assert.deepEqual(ps, [{ id: "prc_m001", type: "range", amount: 800, max: 1200 }]);
  assert.equal(checkPrices(ps, PRULE).level, "ok");
  assert.equal(cardTexts({ prices: ps }).prices, "800円〜1,200円");
  assert.equal(checkPrices(rows1({ type: "range", amount: "800", max: "" }), PRULE).level, "error", "上の値段が空");
  assert.match(checkPrices(rows1({ type: "range", amount: "800", max: "800" }), PRULE).messages[0].text, /大きく/, "validate と同じく max > amount");
  assert.equal(checkPrices(rows1({ type: "range", amount: "800", max: "500" }), PRULE).level, "error");
  assert.equal(cardTexts({ prices: rows1({ type: "range", amount: "800", max: "" }) }).prices, "", "入れている途中は今の姿に出さない");
});
test("値段：時価（market）", () => {
  const ps = rows1({ type: "market", amount: "500", max: "900", name: "" });
  assert.deepEqual(ps, [{ id: "prc_m001", type: "market" }], "時価は金額を持たない（schema）");
  assert.equal(checkPrices(ps, PRULE).level, "ok");
  assert.equal(cardTexts({ prices: ps }).prices, "時価");
  const two = pricesFromRows([{ name: "小", type: "fixed", amount: "500" }, { name: "大", type: "market" }], [], new Set(), rnd);
  assert.equal(checkPrices(two, PRULE).level, "ok");
  assert.equal(cardTexts({ prices: two }).prices, "小 500円 ／ 大 時価");
});
test("値段：値段を出さない（prices を空に）・戻す", () => {
  const cur = SHOP.catalog.items.itm_m001.prices;
  const off = setPriceShown(cur, false);
  assert.deepEqual(off, []);
  assert.equal(checkPrices(off, PRULE).level, "ok");
  assert.equal(cardTexts({ prices: off }).prices, "", "カードの値段の行は消す（patch.js）");
  assert.equal(priceSummary(off), "値段なし");
  assert.deepEqual(setPriceShown(off, true, { stash: cur }), cur, "しまっておいた値段に戻す（id も同じ）");
  const fresh = setPriceShown([], true, { rand: rnd });
  assert.equal(fresh.length, 1); assert.equal(fresh[0].type, "fixed"); assert.match(fresh[0].id, /^prc_/);
  assert.equal(checkPrices(fresh, PRULE).level, "error", "空の ○円 は数字を入れるまで保存できない");
  assert.equal(setPriceShown(cur, true), cur, "出しているときはそのまま");
});
test("値段：書き方の切り替えと、選べる書き方（edit-limits の types）", () => {
  let rows = rowsFromPrices([{ id: "prc_aaaa", type: "fixed", amount: 700 }]);
  rows = setRowType(rows, 0, "range");
  assert.deepEqual(rows[0], { name: "", type: "range", amount: 700, max: "" }, "金額は持ち越す");
  rows = setRowType(rows, 0, "market");
  assert.deepEqual(pricesFromRows(rows, [{ id: "prc_aaaa" }]), [{ id: "prc_aaaa", type: "market" }]);
  assert.deepEqual(PRICE_TYPES.map((t) => t.label), ["○円", "○円〜", "○〜○円", "時価"]);
  assert.deepEqual(PRULE.types, ["fixed", "from", "range", "market"]);
  assert.equal(checkPrices([{ id: "prc_aaaa", type: "ask" }], PRULE).level, "error", "types に無い書き方は保存できない");
  assert.equal(checkPrices([{ id: "prc_aaaa", type: "ask" }], null).level, "ok", "types が無い店は止めない");
  assert.deepEqual(completePrices([{ type: "fixed", amount: "" }, { type: "market" }]), [{ type: "market" }]);
});

test("menu：引きずって並べ替え（moveItemTo・dropIndex）", () => {
  const ids = (s) => listItems(s, "mnu_food").map((x) => x.itemId);
  const base = ids(SHOP), n = base.length;
  let s = moveItemTo(SHOP, "mnu_food", base[0], 2);
  assert.deepEqual(ids(s), [base[1], base[2], base[0], ...base.slice(3)]);
  assert.deepEqual(ids(SHOP), base, "元は変えない");
  assert.deepEqual(listItems(s, "mnu_food").map((x) => x.order), listItems(SHOP, "mnu_food").map((x) => x.order), "order の値はそのまま配り直す");
  s = moveItemTo(s, "mnu_food", base[0], 0);
  assert.deepEqual(ids(s), base, "戻せる");
  assert.deepEqual(ids(moveItemTo(SHOP, "mnu_food", base[1], 99)).at(-1), base[1], "範囲の外は端へ");
  assert.deepEqual(ids(moveItemTo(SHOP, "mnu_food", base[1], -5))[0], base[1]);
  assert.deepEqual(ids(moveItemTo(SHOP, "mnu_food", "itm_none", 0)), base, "無い品は変えない");
  // order が重なっていても 1..n で配り直す
  const dup = JSON.parse(JSON.stringify(SHOP));
  for (const p of Object.values(dup.catalog.placements)) if (p.menuId === "mnu_food") p.order = 1;
  const d0 = ids(dup);
  const d = moveItemTo(dup, "mnu_food", d0.at(-1), 0);
  assert.equal(ids(d)[0], d0.at(-1));
  assert.deepEqual(listItems(d, "mnu_food").map((x) => x.order), Array.from({ length: n }, (_, k) => k + 1));
  // 落とす先：行の真ん中 25・75・125・175、1 行目を引きずる
  const mids = [25, 75, 125, 175];
  assert.equal(dropIndex(mids, 0, 10), 0);
  assert.equal(dropIndex(mids, 0, 80), 1);
  assert.equal(dropIndex(mids, 0, 130), 2);
  assert.equal(dropIndex(mids, 0, 500), 3);
  assert.equal(dropIndex(mids, 3, 0), 0);
  assert.equal(dropIndex(mids, 3, 100), 2);
  assert.equal(dropIndex(mids, 2, 126), 2, "自分の行は数えない");
});
