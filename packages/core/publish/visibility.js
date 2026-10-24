// DATA_SPEC 3.4：公開サイトに出る品（apps/api/src/lib/visibility.ts と同じ決まり。毎日 0 時の Cron がこの数え方で「公開した日」と比べる）。
// 1 販売中 2 販売時期（月）に今月が入る 3 販売開始日を過ぎ、終わりの日を過ぎていない 4 どこかのメニューに載っている
const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// 日本時間の日付 YYYY-MM-DD と月
export function jstDate(now) {
  const j = new Date(now.getTime() + 9 * 3600 * 1000);
  return { date: j.toISOString().slice(0, 10), month: j.getUTCMonth() + 1 };
}

// date は "YYYY-MM-DD"（日本時間の日付）
export function visibleItemIds(shop, date) {
  const month = +date.slice(5, 7);
  const catalog = asObj(asObj(shop).catalog); const items = asObj(catalog.items); const menus = asObj(catalog.menus);
  const placed = new Set();
  for (const p of Object.values(asObj(catalog.placements))) { const po = asObj(p); if (typeof po.itemId === "string" && typeof po.menuId === "string" && Object.hasOwn(menus, po.menuId)) placed.add(po.itemId); }
  const out = [];
  for (const [id, raw] of Object.entries(items)) {
    const it = asObj(raw);
    if (it.status !== "onSale") continue;
    const months = asObj(it.season).months;
    if (Array.isArray(months) && months.length && !months.includes(month)) continue;
    if (typeof it.availableFrom === "string" && date < it.availableFrom) continue;
    if (typeof it.availableUntil === "string" && date > it.availableUntil) continue;
    if (!placed.has(id)) continue;
    out.push(id);
  }
  return out.sort();
}
