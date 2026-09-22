// 芦屋みっけ Web制作：品の表示判定と、繰り返す部品の中身の解決（純粋・ブラウザ非依存）
// DATA_SPEC 3.4（品を表示するかどうか）と 4.6（繰り返す部品）に対応。

// refDate は { ymd: "YYYY-MM-DD", month: 1..12 }（書き出す日付、日本時間）。
export function itemVisible(item, refDate) {
  if (item.status !== "onSale") return false;                        // 1. 販売中
  if (item.season?.months && !item.season.months.includes(refDate.month)) return false; // 2. 販売時期
  if (item.availableFrom && refDate.ymd < item.availableFrom) return false;              // 3. 開始日
  if (item.availableUntil && refDate.ymd > item.availableUntil) return false;            // 3. 終わりの日
  return true;
}

// 載せ方の価格があればそれ、なければ品の価格（DATA_SPEC 3.4）。
export function effectivePrices(item, placement) {
  if (placement?.prices) return placement.prices;
  return item.prices || [];
}

// 品を連動（scope=item）で引ける形にする。/category/name・/menu/name・/prices も含む。
function buildItemView(item, placement, cat, cats, menus) {
  const category = cats[placement.categoryId];
  const menu = menus[placement.menuId];
  return {
    ...item,
    prices: effectivePrices(item, placement),
    category: category ? { name: category.name } : undefined,
    menu: menu ? { name: menu.name } : undefined,
  };
}

// 繰り返す部品（source）の中身を解決して、カードにする順番の配列を返す。
//   返り値: [{ id(placementId), item, placement, categoryId, categoryName, view, hasPhoto }]
export function resolveRepeater(shop, source, refDate) {
  const cat = shop.catalog;
  const { placements: plcs, items, categories: cats, menus, labels } = cat;

  if (source.kind === "faq") {
    const rows = Object.entries(shop.faq || {})
      .map(([id, f]) => ({ id, ...f }))
      .sort((a, b) => a.order - b.order);
    const limited = source.limit ? rows.slice(0, source.limit) : rows;
    return limited.map((f) => ({ id: f.id, view: { question: f.question, answer: f.answer }, scope: "faq" }));
  }
  if (source.kind === "people") {
    const rows = Object.entries(shop.people || {})
      .filter(([, p]) => p.status === "active")
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => a.order - b.order);
    const limited = source.limit ? rows.slice(0, source.limit) : rows;
    return limited.map((p) => ({ id: p.id, view: p, scope: "person" }));
  }
  if (source.kind === "photos") {
    return (source.assets || []).map((a, i) => ({ id: `${a}_${i}`, asset: a, scope: "photo" }));
  }

  // kind === catalog
  const menuId = source.menuId;
  let rows = Object.entries(plcs)
    .filter(([, p]) => p.menuId === menuId)
    .map(([id, p]) => ({ id, placement: p, item: items[p.itemId] }));

  if (source.pick && source.pick.length) {
    // 品を直接選ぶ（この順）。括り・ラベルより優先。
    const order = new Map(source.pick.map((it, i) => [it, i]));
    rows = rows
      .filter((r) => order.has(r.placement.itemId))
      .sort((a, b) => order.get(a.placement.itemId) - order.get(b.placement.itemId));
  } else {
    if (source.categoryIds && source.categoryIds.length) {
      const set = new Set(source.categoryIds);
      rows = rows.filter((r) => set.has(r.placement.categoryId));
    }
    if (source.labelIds && source.labelIds.length) {
      const set = new Set(source.labelIds);
      rows = rows.filter((r) => (r.item.labels || []).some((l) => set.has(l)));
    }
    // 括りの order → 括りの中の order で並べる
    rows.sort((a, b) => {
      const ca = cats[a.placement.categoryId]?.order ?? 0;
      const cb = cats[b.placement.categoryId]?.order ?? 0;
      return ca - cb || a.placement.order - b.placement.order;
    });
  }

  // 品の表示判定（日付）
  rows = rows.filter((r) => r.item && itemVisible(r.item, refDate));
  if (source.limit) rows = rows.slice(0, source.limit);

  return rows.map((r) => {
    const view = buildItemView(r.item, r.placement, cat, cats, menus);
    return {
      id: r.id,
      item: r.item,
      placement: r.placement,
      categoryId: r.placement.categoryId,
      categoryName: cats[r.placement.categoryId]?.name || "",
      labels: (r.item.labels || []).map((l) => ({ id: l, name: labels[l]?.name, system: labels[l]?.system })),
      view,
      hasPhoto: Array.isArray(r.item.photos) && r.item.photos.length > 0,
      scope: "item",
    };
  });
}

// 書き出す日付（--date か今日・日本時間）から refDate を作る。
export function makeRefDate(dateStr) {
  let ymd = dateStr;
  if (!ymd) {
    // 今日（日本時間）
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    ymd = parts; // en-CA は YYYY-MM-DD
  }
  const [y, m, d] = ymd.split("-").map(Number);
  return { ymd, year: y, month: m, day: d };
}
