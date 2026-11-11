// 店主の直し（0049 段3）の純粋な部品の試験：差分の当て方・印との対応・表示の字数・「印の所だけ変わった」の検査。
// 通信・ブラウザは使わない。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EditError, applyOps, applySiteTexts, applyTextsToGenConfig, checkRenderedLimits, classifyCheck, collectTargets, diffMarked,
  expectedKeysAll, getAt, parsePointer, shopHash, withLinkedRemovals,
} from "./lib/edit-ops.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "samples", "amet", f), "utf8"));
const shop = load("shop.json");
const site = load("site.json");
const limits = load("edit-limits.json");
const TARGETS = ["shop:/hours", "shop:/facilities/seats/total", "shop:/story/answers/q_catch/answer", "text:fv_copy", "item:itm_m001", "item:itm_m001/name", "list:catalog:mnu_food", "sec:sec_access", "photo:ast_fv01"];
const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof EditError, String(e)); return e.code; } };

test("JSON Pointer：~0 ~1 と危ないキー", () => {
  assert.deepEqual(parsePointer("/a~1b/c~0d"), ["a/b", "c~d"]);
  assert.equal(parsePointer("a/b"), null);
  assert.equal(parsePointer("/__proto__/x"), null);
  assert.equal(parsePointer("/a//b"), null);
});

test("当てる：営業時間の set・元は変えない", () => {
  const before = JSON.stringify(shop);
  const v = { status: "open", periods: [{ start: "09:00", end: "17:00" }] };
  const r = applyOps(shop, site, [{ op: "set", path: "/hours/weekly/sat", value: v }]);
  assert.deepEqual(r.shop.hours.weekly.sat, v);
  assert.equal(JSON.stringify(shop), before);
  assert.notEqual(shopHash(r.shop), shopHash(shop));
});

test("当てる：品を足す（add 2つ）・add で既に在る／remove で無い／親が無い は止める", () => {
  const item = { name: "季節のスコーン", prices: [{ id: "prc_m901", type: "fixed", amount: 380 }], status: "onSale" };
  const r = applyOps(shop, site, [
    { op: "add", path: "/catalog/items/itm_m901", value: item },
    { op: "add", path: "/catalog/placements/plc_m901", value: { itemId: "itm_m901", menuId: "mnu_food", categoryId: "cat_menu", order: 99 } },
  ]);
  assert.equal(r.shop.catalog.items.itm_m901.name, "季節のスコーン");
  assert.equal(code(() => applyOps(shop, site, [{ op: "add", path: "/catalog/items/itm_m001", value: item }])), "path");
  assert.equal(code(() => applyOps(shop, site, [{ op: "remove", path: "/catalog/items/itm_zzzz" }])), "path");
  assert.equal(code(() => applyOps(shop, site, [{ op: "set", path: "/nothere/x/y", value: 1 }])), "path");
});

test("形の検査：op・doc・value・site の制限・空", () => {
  assert.equal(code(() => applyOps(shop, site, [])), "ops");
  assert.equal(code(() => applyOps(shop, site, [{ op: "move", path: "/hours", value: 1 }])), "ops");
  assert.equal(code(() => applyOps(shop, site, [{ op: "set", path: "/hours", value: 1, doc: "theme" }])), "ops");
  assert.equal(code(() => applyOps(shop, site, [{ op: "set", path: "/hours" }])), "ops");
  assert.equal(code(() => applyOps(shop, site, [{ op: "set", doc: "site", path: "/elements/fv_copy/paragraphs", value: "x" }])), "ops");
  assert.equal(code(() => applyOps(shop, site, [{ op: "set", doc: "site", path: "/elements/nope/text", value: "x" }])), "path");
  // ① と連動している箱は site で直さない
  assert.equal(code(() => applyOps(shop, site, [{ op: "set", doc: "site", path: "/elements/ac_v1/text", value: "x" }])), "path");
});

test("文字の箱：段落に分け、型の設定（wa03.json）の同じ所も替える", () => {
  const r = applyOps(shop, site, [{ op: "set", doc: "site", path: "/elements/fv_copy/text", value: "朝の一杯を、\nゆっくり。" }]);
  const s2 = applySiteTexts(site, r.texts);
  assert.deepEqual(s2.elements.fv_copy.paragraphs.map((p) => p.runs[0].text), ["朝の一杯を、", "ゆっくり。"]);
  const g = applyTextsToGenConfig(load("wa03.json"), site, r.texts);
  assert.deepEqual(g.replaced, ["/fvCopy"]);
  assert.deepEqual(g.config.fvCopy, ["朝の一杯を、", "ゆっくり。"]);
  assert.deepEqual(g.missing, []);
});

test("印との対応：直してよい所と、印の無い所は止める", () => {
  assert.deepEqual(expectedKeysAll([{ op: "set", path: "/hours/weekly/sat", value: {} }], shop, TARGETS), ["shop:/hours"]);
  assert.deepEqual(expectedKeysAll([{ op: "set", path: "/catalog/items/itm_m001/name", value: "x" }], shop, TARGETS), ["item:itm_m001", "item:itm_m001/name"]);
  const add = [
    { op: "add", path: "/catalog/items/itm_m901", value: {} },
    { op: "add", path: "/catalog/placements/plc_m901", value: { itemId: "itm_m901", menuId: "mnu_food" } },
  ];
  assert.deepEqual(expectedKeysAll(add, shop, TARGETS), ["item:itm_m901", "list:catalog:mnu_food"]);
  assert.deepEqual(expectedKeysAll([{ op: "set", doc: "site", path: "/elements/fv_copy/text", value: "x" }], shop, TARGETS), ["text:fv_copy"]);
  assert.equal(code(() => expectedKeysAll([{ op: "set", path: "/phone", value: "x" }], shop, TARGETS)), "mark");
  assert.equal(code(() => expectedKeysAll([{ op: "set", path: "/location/geo/lat", value: 1 }], shop, [...TARGETS, "shop:/location"])), "mark");
  assert.equal(code(() => expectedKeysAll([{ op: "set", doc: "site", path: "/elements/hd_name/text", value: "x" }], shop, TARGETS)), "mark");
  assert.equal(code(() => expectedKeysAll([{ op: "add", path: "/catalog/items/itm_m901", value: {} }], shop, TARGETS)), "mark");
});

test("表示の字数：営業時間（hoursShort）を本物の format で測る", () => {
  const ok = checkRenderedLimits(shop, site, limits, 2026);
  assert.ok(ok.length >= 1 && ok.every((r) => r.ok), JSON.stringify(ok));
  assert.ok(ok.some((r) => r.el === "ac_v1" && r.format === "hoursShort"));
  // 違う曜日を 6 つにすると 80 字を超える
  const s = structuredClone(shop);
  const p = (a, b) => ({ status: "open", periods: [{ start: a, end: b }] });
  Object.assign(s.hours.weekly, { mon: p("09:00", "17:00"), tue: p("10:00", "16:00"), wed: p("11:00", "15:30"), thu: p("07:30", "19:00"), fri: p("10:30", "20:30"), sat: p("11:00", "21:00") });
  const over = checkRenderedLimits(s, site, limits, 2026).filter((r) => !r.ok);
  assert.ok(over.length >= 1, "上限超えを拾う");
  assert.ok(over[0].chars > 80);
});

const page = (hours, name, extra = "") => `<!doctype html><html><head><title>AMET</title><style>.a{top:${hours.length}px}</style></head><body>
<section data-sec="sec_access" class="sec" data-edit="sec:sec_access" style="height:${hours.length * 10}px">
<p data-el="ac_k1" class="el">営業時間</p>
<p data-el="ac_v1" class="el lb" data-mh-pc="${hours.length}" data-edit="shop:/hours">${hours}</p>
${extra}
</section>
<div data-edit="list:catalog:mnu_food"><div data-card="plc_m001" data-edit="item:itm_m001"><p data-cel="c_nm" data-edit="item:itm_m001/name">${name}</p><div data-el="c_ph" data-edit="photo:ast_mn01"><img src="a.jpg" alt=""></div></div></div>
<script>var x=1;</script></body></html>`;

test("書き出しの差：印の所だけなら unexpected は空（位置・style・data-mh は数えない）", () => {
  const d = diffMarked(page("8:30〜18:00", "アイスコーヒー"), page("8:30〜18:00（土日は9:00〜17:00）", "アイスコーヒー"), ["shop:/hours"]);
  assert.equal(d.changes.length, 1);
  assert.deepEqual(d.changes[0].marks, ["shop:/hours"]);
  assert.deepEqual(d.unexpected, []);
});

test("書き出しの差：印の外（段の中の印の無い所・head・script）が変われば unexpected", () => {
  const before = page("8:30〜18:00", "アイスコーヒー");
  // 項目名（印なし）が変わった
  const a = diffMarked(before, before.replace("<p data-el=\"ac_k1\" class=\"el\">営業時間", "<p data-el=\"ac_k1\" class=\"el\">営業"), ["shop:/hours"]);
  assert.equal(a.unexpected.length, 1);
  assert.deepEqual(a.unexpected[0].marks, ["sec:sec_access"]);
  // 期待していない印（品名）が変わった
  const b = diffMarked(before, page("8:30〜18:00", "ホットコーヒー"), ["shop:/hours"]);
  assert.deepEqual(b.unexpected.map((c) => c.marks), [["item:itm_m001/name"]]);
  // title・script
  assert.equal(diffMarked(before, before.replace("<title>AMET", "<title>X"), ["shop:/hours"]).unexpected.length, 1);
  assert.equal(diffMarked(before, before.replace("var x=1", "var x=2"), ["shop:/hours"]).unexpected[0].kind, "script");
  // 印の無い行が足された（段の中）
  const c = diffMarked(before, page("8:30〜18:00", "アイスコーヒー", '<p data-el="ac_k9">定休日</p>'), ["shop:/hours"]);
  assert.equal(c.unexpected[0].kind, "added");
});

test("書き出しの差：品を足す（list の中に印つきのカードが増える）は許す", () => {
  const before = page("8:30〜18:00", "アイスコーヒー");
  const after = before.replace("</div></div></div>", '</div></div><div data-card="plc_m901" data-edit="item:itm_m901"><p data-cel="c_nm" data-edit="item:itm_m901/name">季節のスコーン</p></div></div>');
  const d = diffMarked(before, after, ["item:itm_m901", "list:catalog:mnu_food"]);
  assert.equal(d.changes.length, 1);
  assert.equal(d.changes[0].kind, "added");
  assert.deepEqual(d.unexpected, []);
});

test("印の一覧を HTML から集める（空白区切りで複数）", () => {
  assert.deepEqual(collectTargets('<p data-edit="shop:/a text:b"></p><i data-edit="shop:/a"></i>'), ["shop:/a", "text:b"]);
});

test("型の検査の読み分け：設計の高さ・カードの枚数は動いてよい、はみ出しは崩れ", () => {
  const k = classifyCheck("390: 高さ {}\nNG 390: sec_access 高さ 1085.8（設計 1057）\nNG 1440: カード 9 枚\nNG 768: 横はみ出し 800>768\n問題 3 件");
  assert.deepEqual(k.layoutDiffs, ["NG 390: sec_access 高さ 1085.8（設計 1057）", "NG 1440: カード 9 枚"]);
  assert.deepEqual(k.problems, ["NG 768: 横はみ出し 800>768"]);
});

test("書き出しの差の要点：印つきの要素ごとに前と後の文字をまとめる", () => {
  const d = diffMarked(page("8:30〜18:00", "アイスコーヒー"), page("8:30〜18:00 <span>（土曜は</span><wbr><span>9:00〜17:00）</span>", "アイスコーヒー"), ["shop:/hours"]);
  assert.equal(d.elements.length, 1);
  assert.equal(d.elements[0].where, "/html/body/section[sec_access]/p[ac_v1]");
  assert.equal(d.elements[0].after, "8:30〜18:00 （土曜は 9:00〜17:00）");
  assert.equal(d.elements[0].allowed, true);
});

test("消す差分に連れて消す：品を消すと、その品（とその下）を指す review も消す。重ねない・配列の位置は見ない（0044 の残り）", () => {
  const ops = [
    { op: "remove", path: "/catalog/items/itm_m001" },
    { op: "remove", path: "/catalog/placements/plc_m001" },
  ];
  const r = withLinkedRemovals(shop, ops);
  assert.deepEqual(r.added, [{ op: "remove", path: "/review/~1catalog~1items~1itm_m001~1prices", because: "/catalog/items/itm_m001" }]);
  assert.equal(r.ops.length, 3);
  assert.equal(ops.length, 2); // 元は変えない
  const a = applyOps(shop, site, r.ops);
  assert.equal(a.shop.review["/catalog/items/itm_m001/prices"], undefined);
  assert.ok(a.shop.review["/catalog/items/itm_m005/prices"]); // ほかの品の review は残す
  // validate と同じ見方：review の場所に値が在る（unreadable 以外）
  for (const [ptr, v] of Object.entries(a.shop.review)) if (v.status !== "unreadable") assert.notEqual(getAt(a.shop, parsePointer(ptr)), undefined, ptr);
  // review の無い品・review を自分で消した差分・set は足さない
  assert.deepEqual(withLinkedRemovals(shop, [{ op: "remove", path: "/catalog/items/itm_m002" }]).added, []);
  assert.deepEqual(withLinkedRemovals(shop, [...ops, { op: "remove", path: "/review/~1catalog~1items~1itm_m001~1prices" }]).added, []);
  assert.deepEqual(withLinkedRemovals(shop, [{ op: "set", path: "/catalog/items/itm_m001/name", value: "x" }]).added, []);
  // 項目だけ消す（値段）でも、その場所の review を消す
  assert.equal(withLinkedRemovals(shop, [{ op: "remove", path: "/catalog/items/itm_m005/prices" }]).added.length, 1);
});
