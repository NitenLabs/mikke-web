/**
 * DATA_SPEC 3.4：公開サイトに出る品。決まりは packages/core/visibility.js の 1 つ（編集画面・公開の一式と同じもの）を使う。
 * 1 販売中 2 販売時期（月）に今月が入る 3 販売開始日を過ぎ、終わりの日を過ぎていない 4 どこかのメニューに載っている
 * 日付はいつも日本時間。wrangler（esbuild）がこのファイルと一緒に Worker にまとめる。
 */
// @ts-ignore 型は下で付ける（packages/core は素の JavaScript）
import * as core from "../../../../packages/core/visibility.js";

const C = core as unknown as {
  jstDate(now: Date): { date: string; month: number };
  visibleItemIds(shop: unknown, when: Date | string): string[];
  isItemDisplayable(item: unknown, when?: Date | string): boolean;
};

/** 日本時間の日付 YYYY-MM-DD と月 */
export function jstDate(now: Date): { date: string; month: number } {
  return C.jstDate(now);
}

/** 公開サイトに出る品の ID（並べて返す）。now の日本時間の日付で数える */
export function visibleItemIds(shop: unknown, now: Date): string[] {
  return C.visibleItemIds(shop, now);
}

/** 品が出るか（3.4 の 1〜3。メニューに載っているかは見ない） */
export function isItemDisplayable(item: unknown, now: Date): boolean {
  return C.isItemDisplayable(item, now);
}
