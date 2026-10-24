import { describe, expect, it } from "vitest";
import { isItemDisplayable, jstDate, visibleItemIds } from "../src/lib/visibility";
// 編集画面・公開の一式（packages/core）の試験と同じ例（同じ決まりであることの確かめ）
import V from "../../../packages/core/test/visibility-cases.json";

describe("D6 品を出す決まり（DATA_SPEC 3.4）は packages/core と同じ", () => {
  it("D6-3 共通の例：日本時間で数える（販売中・月・販売の期間・メニューに載っている）", () => {
    for (const c of V.cases) {
      expect(jstDate(new Date(c.at)).date, c.at).toBe(c.jst);
      expect(visibleItemIds(V.shop, new Date(c.at)), c.at).toEqual(c.visible);
    }
  });
  it("D6-4 状態のない品は出さない・販売の期間はその日を含む", () => {
    const d = new Date("2026-10-24T03:00:00Z");
    expect(isItemDisplayable({ name: "x" }, d)).toBe(false);
    expect(isItemDisplayable({ status: "onSale", availableFrom: "2026-10-24", availableUntil: "2026-10-24" }, d)).toBe(true);
    expect(isItemDisplayable({ status: "onSale", availableUntil: "2026-10-23" }, d)).toBe(false);
  });
});
