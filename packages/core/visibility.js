// DATA_SPEC 3.4：品を公開サイトに出すかどうか（1つの決まり）。
// 編集画面（packages/core/catalog.js の isDisplayable）・公開の一式（publish/visibility.js）・API（apps/api/src/lib/visibility.ts）が
// みんなここを使う。日付はいつも日本時間で数える（ブラウザの時刻の地域によらない）。
//   1 販売の状態が「販売中」（status === "onSale"。status は shop.schema.json で必須）
//   2 販売時期（season.months）があれば、今月（日本時間）がその中に入る
//   3 販売開始日（availableFrom）があればその日から、終わりの日（availableUntil）があればその日まで（どちらも日本時間の日付。その日を含む）
//   4 どこかのメニューに載っている（visibleItemIds だけが見る。品だけを見る isItemDisplayable は 1〜3）
const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** 日本時間の日付 YYYY-MM-DD と月（1〜12） */
export function jstDate(now) {
  const j = new Date((now instanceof Date ? now.getTime() : now == null ? Date.now() : +now) + 9 * 3600 * 1000);
  return { date: j.toISOString().slice(0, 10), month: j.getUTCMonth() + 1 };
}
/** 今日（日本時間）の YYYY-MM-DD */
export const jstToday = () => jstDate(new Date()).date;

// 日付の指定：YYYY-MM-DD の文字（日本時間の日付）か Date（その時刻の日本時間の日付）。無ければ今
function dayOf(when) {
  if (typeof when === "string" && /^\d{4}-\d{2}-\d{2}$/.test(when)) return { date: when, month: +when.slice(5, 7) };
  return jstDate(when instanceof Date ? when : new Date());
}

/**
 * 品が、その日に出るか（3.4 の 1〜3。メニューに載っているかは見ない）。
 * 出なければ理由も返す：{ ok:false, why:"status"|"season"|"notYet"|"ended" }
 */
export function itemVisibility(item, when) {
  const it = asObj(item);
  if (!item || it.status !== "onSale") return { ok: false, why: "status" };
  const { date, month } = dayOf(when);
  const months = asObj(it.season).months;
  if (Array.isArray(months) && months.length && !months.map(Number).includes(month)) return { ok: false, why: "season" };
  if (typeof it.availableFrom === "string" && date < it.availableFrom) return { ok: false, why: "notYet" };
  if (typeof it.availableUntil === "string" && date > it.availableUntil) return { ok: false, why: "ended" };
  return { ok: true };
}
export const isItemDisplayable = (item, when) => itemVisibility(item, when).ok;

/** 公開サイトに出る品の ID（並べて返す）。when は YYYY-MM-DD（日本時間）か Date */
export function visibleItemIds(shop, when) {
  const catalog = asObj(asObj(shop).catalog); const items = asObj(catalog.items); const menus = asObj(catalog.menus);
  const placed = new Set();
  for (const p of Object.values(asObj(catalog.placements))) { const po = asObj(p); if (typeof po.itemId === "string" && typeof po.menuId === "string" && Object.hasOwn(menus, po.menuId)) placed.add(po.itemId); }
  const day = dayOf(when);
  const out = [];
  for (const [id, raw] of Object.entries(items)) if (placed.has(id) && isItemDisplayable(raw, day.date)) out.push(id);
  return out.sort();
}
