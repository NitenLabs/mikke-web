// DATA_SPEC 3.4 品を出す決まり（packages/core/visibility.js）。同じ例を apps/api/test/visibility.test.ts も読む
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { visibleItemIds, isItemDisplayable, itemVisibility, jstDate } from "../visibility.js";
import * as CATALOG from "../catalog.js";
import * as PUB from "../publish/index.js";

const V = JSON.parse(fs.readFileSync(new URL("./visibility-cases.json", import.meta.url), "utf8"));

test("3.4 共通の例：時刻（Date）でも日本時間の日付でも同じ答え", () => {
  for (const c of V.cases) {
    assert.equal(jstDate(new Date(c.at)).date, c.jst, c.at);
    assert.deepEqual(visibleItemIds(V.shop, new Date(c.at)), c.visible, c.at);
    assert.deepEqual(visibleItemIds(V.shop, c.jst), c.visible, c.jst);
    assert.deepEqual(PUB.visibleItemIds(V.shop, c.jst), c.visible, "publish " + c.jst);   // 公開の一式も同じもの
  }
});

test("3.4 編集画面の isDisplayable も同じ決まり（販売中・月・販売の期間。日本時間）", () => {
  const items = V.shop.catalog.items;
  const RealDate = Date;
  for (const c of V.cases) {
    // 編集画面は「今」で数える。Date を差し替えて、その時刻にいることにする（ブラウザの地域の時刻によらない）
    const fixed = new RealDate(c.at).getTime();
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
    try {
      for (const id of Object.keys(items)) {
        const placedOnMenu = !["itm_unplaced", "itm_othermenu"].includes(id);
        if (!placedOnMenu) continue;
        assert.equal(CATALOG.isDisplayable(items[id]), c.visible.includes(id), `${c.at} ${id}`);
        assert.equal(isItemDisplayable(items[id]), c.visible.includes(id), `${c.at} ${id}（今で数える）`);
      }
      assert.equal(CATALOG.curMonth(), +c.jst.slice(5, 7), c.at);
    } finally { globalThis.Date = RealDate; }
  }
});

test("3.4 状態がない品は出さない（status は必須。販売中と書いてあるものだけ）", () => {
  assert.equal(isItemDisplayable({ name: "x" }, "2026-10-24"), false);
  assert.equal(isItemDisplayable(null, "2026-10-24"), false);
  assert.deepEqual(itemVisibility({ status: "paused" }, "2026-10-24"), { ok: false, why: "status" });
  assert.deepEqual(itemVisibility({ status: "onSale", season: { months: [12] } }, "2026-10-24"), { ok: false, why: "season" });
  assert.deepEqual(itemVisibility({ status: "onSale", availableFrom: "2026-10-25" }, "2026-10-24"), { ok: false, why: "notYet" });
  assert.deepEqual(itemVisibility({ status: "onSale", availableUntil: "2026-10-23" }, "2026-10-24"), { ok: false, why: "ended" });
  assert.deepEqual(itemVisibility({ status: "onSale", availableFrom: "2026-10-24", availableUntil: "2026-10-24" }, "2026-10-24"), { ok: true });
});

test("3.4 出ない理由の文字（編集画面のお品書きに薄く添える）", () => {
  assert.equal(CATALOG.hiddenReason({ status: "paused" }), "休んでいます");
  assert.equal(CATALOG.hiddenReason({ status: "onSale", availableFrom: "2999-04-01" }), "4月1日から出ます");
  assert.equal(CATALOG.hiddenReason({ status: "onSale", availableUntil: "2000-11-30" }), "11月30日で終わりました");
});
