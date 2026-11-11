// お品書きの操作（① の catalog）。純粋。どれも新しい shop を返す（元は変えない）。
// 足す：items と placements に 1 つずつ。消す：items・placements・review（その品を指す確認）から外す（edit-limits の注意）。
// 並べ替え：同じ menu の placements の order を入れ替える。直した品は draft:true を外す（SPEC 3章）。
const clone = (o) => JSON.parse(JSON.stringify(o));

/** その menu（と括り）の品を order の順に */
export function listItems(shop, menuId, categoryIds = null) {
  const cat = shop?.catalog ?? {};
  return Object.entries(cat.placements ?? {})
    .filter(([, p]) => p.menuId === menuId && (!categoryIds || categoryIds.includes(p.categoryId)) && cat.items?.[p.itemId])
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
    .map(([placementId, p]) => ({ placementId, itemId: p.itemId, categoryId: p.categoryId, order: p.order, item: cat.items[p.itemId] }));
}

/** ID を作る（schema の id の形：接頭辞_英小文字・数字 4〜24 字）。使った ID は使い回さない */
export function newId(prefix, taken, rand = Math.random) {
  for (;;) {
    let s = "";
    for (let i = 0; i < 6; i++) s += "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(rand() * 32)];
    const id = `${prefix}_o${s}`;
    if (!taken.has(id)) return id;
  }
}

/** 品を足す（最後に）。答え { shop, itemId, placementId } */
export function addItem(shop, menuId, categoryId, { name = "新しい品", rand } = {}) {
  const s = clone(shop);
  s.catalog = s.catalog ?? {};
  s.catalog.items = s.catalog.items ?? {};
  s.catalog.placements = s.catalog.placements ?? {};
  const taken = new Set([...Object.keys(s.catalog.items), ...Object.keys(s.catalog.placements), ...JSON.stringify(shop).match(/"[a-z]{2,4}_[a-z0-9]{4,24}"/g)?.map((x) => x.slice(1, -1)) ?? []]);
  const itemId = newId("itm", taken, rand); taken.add(itemId);
  const placementId = newId("plc", taken, rand);
  const max = Math.max(0, ...listItems(s, menuId).map((x) => x.order ?? 0));
  s.catalog.items[itemId] = { name, description: "", photos: [], prices: [], status: "onSale" };
  s.catalog.placements[placementId] = { itemId, menuId, categoryId, order: max + 1 };
  return { shop: s, itemId, placementId };
}

/** 品を消す（品・置き場所・その品を指す review の行） */
export function removeItem(shop, itemId) {
  const s = clone(shop);
  delete s.catalog?.items?.[itemId];
  for (const [k, p] of Object.entries(s.catalog?.placements ?? {})) if (p.itemId === itemId) delete s.catalog.placements[k];
  if (s.review) for (const k of Object.keys(s.review)) if (k === `/catalog/items/${itemId}` || k.startsWith(`/catalog/items/${itemId}/`)) delete s.review[k];
  return s;
}

/** 品を 1 つ上（dir=-1）か下（dir=+1）へ。端なら変えない */
export function moveItem(shop, menuId, itemId, dir) {
  const s = clone(shop);
  const list = listItems(s, menuId);
  const i = list.findIndex((x) => x.itemId === itemId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return s;
  const a = s.catalog.placements[list[i].placementId], b = s.catalog.placements[list[j].placementId];
  const oa = a.order; a.order = b.order; b.order = oa;
  if (a.order === b.order) { a.order = j + 1; b.order = i + 1; }
  return s;
}

/** 品の項目を直す（name・description・prices・photos）。draft:true を外す */
export function setItemField(shop, itemId, field, value) {
  const s = clone(shop);
  const it = s.catalog?.items?.[itemId];
  if (!it) return s;
  if (value === undefined || (field === "description" && value === "")) delete it[field];
  else it[field] = value;
  delete it.draft;
  return s;
}

/** 値段の入力（1 行＝1 つの選択肢 {name, amount, type}）から ① の prices を作る。前の id は残す */
export function pricesFromRows(rows, prev = [], taken = new Set(), rand) {
  const ids = new Set([...taken, ...prev.map((p) => p.id)]);
  return rows.map((r, i) => {
    const id = prev[i]?.id ?? (() => { const x = newId("prc", ids, rand); ids.add(x); return x; })();
    const type = r.type === "from" ? "from" : "fixed";
    const amount = r.amount === "" || r.amount == null ? NaN : Number(String(r.amount).replace(/[,，円\s]/g, ""));
    const p = { id, type, amount: Number.isFinite(amount) ? amount : r.amount };
    if (String(r.name ?? "").trim()) p.name = String(r.name).trim();
    return p;
  });
}
