#!/usr/bin/env node
// 芦屋みっけ Web制作：データの検査
// 使い方：node tools/validate.mjs samples/ashiyado
//   フォルダの shop.json（①）site.json（②）theme.json（③）assets.json（④）を検査する。
//   1. 形の検査（schema/*.schema.json）
//   2. 層をまたぐ参照の検査（JSON Schema では書けないもの）
// 終了コード：エラーがあれば 1。警告だけなら 0。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.join(here, "..", "schema");
const dir = process.argv[2];
if (!dir) { console.error("使い方: node tools/validate.mjs <データのフォルダ>"); process.exit(2); }

const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false, discriminator: true });
addFormats(ajv);
for (const f of ["common", "theme", "shop", "assets", "site"]) ajv.addSchema(load(path.join(schemaDir, `${f}.schema.json`)));

const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

// ---------- 1. 形の検査 ----------
const files = { shop: "shop.json", site: "site.json", theme: "theme.json", assets: "assets.json" };
const data = {};
for (const [k, f] of Object.entries(files)) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { err(`${f} がありません`); continue; }
  data[k] = load(p);
  const validate = ajv.getSchema(`https://ashiya-mikke.jp/schema/${k}.schema.json`);
  if (!validate(data[k])) {
    // oneOf の失敗は候補ごとのエラーが大量に出るので、場所ごとにまとめる
    const seen = new Set();
    for (const e of validate.errors) {
      const key = `${e.instancePath}|${e.message}`;
      if (seen.has(key)) continue; seen.add(key);
      err(`[形] ${f}${e.instancePath || "/"}: ${e.message}${e.params?.additionalProperty ? `（${e.params.additionalProperty}）` : ""}${e.params?.unevaluatedProperty ? `（${e.params.unevaluatedProperty}）` : ""}`);
    }
  }
}
if (!data.shop || !data.site || !data.theme || !data.assets) finish();

const { shop, site, theme, assets } = data;

// 分からない値は「書かない」。null と空文字は使わない
const walk = (v, where) => {
  if (v === null) return err(`[空] ${where}: null は使いません（分からない値はキーごと書かない）`);
  if (v === "") return err(`[空] ${where}: 空の文字は使いません（分からない値はキーごと書かない）`);
  if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${where}/${k}`);
};
for (const [k, f] of Object.entries(files)) walk(data[k], f);
const cat = shop.catalog;

// ---------- 共通の道具 ----------
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const checkPeriods = (where, periods = []) => {
  const sorted = [...periods].sort((a, b) => toMin(a.start) - toMin(b.start));
  sorted.forEach((p, i) => {
    if (toMin(p.end) <= toMin(p.start)) err(`[時間] ${where}: ${p.start}〜${p.end} は終わりが始まりより前です（日付をまたぐときは 26:00 のように書く）`);
    if (toMin(p.start) >= 24 * 60) err(`[時間] ${where}: 始まりが24時以降です（前の日の営業として書く）`);
    if (p.lastOrder && (toMin(p.lastOrder) > toMin(p.end) || toMin(p.lastOrder) < toMin(p.start))) err(`[時間] ${where}: ラストオーダー ${p.lastOrder} が時間帯の外です`);
    if (i > 0 && toMin(p.start) < toMin(sorted[i - 1].end)) err(`[時間] ${where}: 時間帯が重なっています`);
  });
};
const getPointer = (obj, ptr) => {
  if (ptr === "") return obj;
  let cur = obj;
  for (const raw of ptr.split("/").slice(1)) {
    const k = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur == null || typeof cur !== "object" || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
};
const allIds = new Map(); // ID の重複検査（層をまたいで一意）
const noteId = (id, where) => {
  if (allIds.has(id)) err(`[ID] ${id} が ${allIds.get(id)} と ${where} で重複しています`);
  else allIds.set(id, where);
};

// ---------- 2a. ① お店の情報 ----------
const h = shop.hours || {};
for (const [d, v] of Object.entries(h.weekly || {})) checkPeriods(`①営業時間 ${d}`, v.periods);
if (h.publicHoliday?.periods) checkPeriods("①営業時間 祝日", h.publicHoliday.periods);
for (const [id, x] of Object.entries(h.exceptions || {})) {
  noteId(id, "①営業時間の例外");
  if (x.status === "open" && !x.periods) warn(`[時間] ①例外 ${x.label}: 営業なのに時間帯がありません（通常どおりの時間として表示します）`);
  if (x.once && x.once.to < x.once.from) err(`[時間] ①例外 ${x.label}: 終わりの日が始まりより前です`);
  if (x.periods) checkPeriods(`①例外 ${x.label}`, x.periods);
}
if (h.weekly && Object.keys(h.weekly).length > 0 && Object.keys(h.weekly).length < 7) warn("[時間] ①営業時間: 曜日が7つそろっていません（ない曜日は「分からない」扱いで表示しません）");

for (const id of Object.keys(shop.location?.access || {})) noteId(id, "①アクセス");
for (const id of Object.keys(shop.faq || {})) noteId(id, "①よくある質問");
for (const id of Object.keys(shop.people || {})) noteId(id, "①人");
for (const id of Object.keys(shop.customFields || {})) noteId(id, "①自由項目");

const services = shop.externalServices || {};
for (const id of Object.keys(services)) noteId(id, "①外部サービス");
if (shop.reservation?.methods?.includes("web") && !Object.values(services).some((s) => s.kind === "reservation"))
  err("[参照] ①予約の方法に web がありますが、外部サービスに予約（kind=reservation）がありません");
if (shop.reservation?.methods?.includes("phone") && !shop.contact?.phone) warn("[参照] ①予約の方法に電話がありますが、電話番号がありません");

// メニューの3段
const menus = cat.menus, cats = cat.categories, items = cat.items, plcs = cat.placements, labels = cat.labels;
for (const id of Object.keys(menus)) noteId(id, "①メニュー");
for (const id of Object.keys(cats)) noteId(id, "①括り");
for (const id of Object.keys(items)) noteId(id, "①品");
for (const id of Object.keys(plcs)) noteId(id, "①載せ方");
for (const id of Object.keys(labels)) noteId(id, "①ラベル");

if (Object.keys(menus).length === 0) err("[メニュー] ①メニューが1つもありません（1段目を使わないお店も、名前のないメニューを1つ持つ）");
if (Object.keys(menus).length > 1) for (const [id, m] of Object.entries(menus)) if (!m.name) err(`[メニュー] ${id}: メニューが複数あるのに名前がありません`);
for (const [id, m] of Object.entries(menus)) {
  if (m.orderService && !services[m.orderService]) err(`[参照] メニュー ${id} の注文先 ${m.orderService} がありません`);
  if (m.servingTime?.periods) checkPeriods(`メニュー ${m.name ?? id} の提供時間`, m.servingTime.periods);
}
for (const [id, c] of Object.entries(cats)) if (!menus[c.menuId]) err(`[参照] 括り ${id}（${c.name}）のメニュー ${c.menuId} がありません`);

const systemSeen = {};
for (const [id, l] of Object.entries(labels)) {
  if (l.system) { if (systemSeen[l.system]) err(`[ラベル] system=${l.system} が ${systemSeen[l.system]} と ${id} で重複`); systemSeen[l.system] = id; }
}
if (!systemSeen.recommended) err("[ラベル] おすすめ（system=recommended）のラベルがありません（代表の品の目印に必要）");

const priceIds = new Set();
const checkPrices = (where, prices = []) => {
  if (prices.length > 1 && prices.some((p) => !p.name)) err(`[価格] ${where}: 価格が複数あるのに名前のない選択肢があります`);
  for (const p of prices) {
    if (priceIds.has(p.id)) err(`[価格] ${where}: 価格のID ${p.id} が重複`);
    priceIds.add(p.id);
    if (p.type === "range" && p.max <= p.amount) err(`[価格] ${where}: 上限 ${p.max} が下限 ${p.amount} 以下です`);
  }
};
const placedIn = {}; // itemId -> Set(menuId)
for (const [id, p] of Object.entries(plcs)) {
  const it = items[p.itemId], c = cats[p.categoryId];
  if (!it) err(`[参照] 載せ方 ${id} の品 ${p.itemId} がありません`);
  if (!menus[p.menuId]) err(`[参照] 載せ方 ${id} のメニュー ${p.menuId} がありません`);
  if (!c) err(`[参照] 載せ方 ${id} の括り ${p.categoryId} がありません`);
  else if (c.menuId !== p.menuId) err(`[参照] 載せ方 ${id}: 括り ${c.name} は別のメニュー（${c.menuId}）の括りです`);
  placedIn[p.itemId] ??= new Set();
  if (placedIn[p.itemId].has(p.menuId)) err(`[メニュー] 品 ${it?.name ?? p.itemId} が同じメニュー ${p.menuId} に2回載っています（1つのメニューの中では括りは1つだけ）`);
  placedIn[p.itemId].add(p.menuId);
  if (p.prices) checkPrices(`載せ方 ${id}`, p.prices);
}
const today = new Date().toISOString().slice(0, 10);
for (const [id, it] of Object.entries(items)) {
  for (const l of it.labels || []) if (!labels[l]) err(`[参照] 品 ${it.name} のラベル ${l} がありません`);
  for (const a of it.photos || []) if (!assets.assets[a]) err(`[参照] 品 ${it.name} の写真 ${a} が素材置き場にありません`);
  if (it.orderLink && !services[it.orderLink.serviceId]) err(`[参照] 品 ${it.name} の注文先 ${it.orderLink.serviceId} がありません`);
  checkPrices(`品 ${it.name}`, it.prices);
  if (!placedIn[id]) warn(`[メニュー] 品 ${it.name} はどのメニューにも載っていません（サイトには出ません）`);
  if (it.availableFrom && it.availableUntil && it.availableUntil < it.availableFrom) err(`[時期] 品 ${it.name}: 終わりの日が始まりの日より前です`);
  if (it.availableUntil && it.availableUntil < today) warn(`[時期] 品 ${it.name}: 終わりの日を過ぎています（表示されません）`);
  for (const s of it.schedule || []) checkPeriods(`品 ${it.name} の開講時間`, [s]);
}
for (const [id, c] of Object.entries(cats))
  if (!Object.values(plcs).some((p) => p.categoryId === id)) warn(`[メニュー] 括り ${c.name} に品がありません（公開サイトでは自動で非表示）`);

// 確認待ち
for (const [ptr, r] of Object.entries(shop.review || {})) {
  if (getPointer(shop, ptr) === undefined && r.status !== "unreadable") err(`[確認] review ${ptr} の場所に値がありません`);
}
const conflicts = Object.values(shop.review || {}).filter((r) => r.status !== "pending").length;
if (conflicts) warn(`[確認] オーナーへの質問が ${conflicts} 件残っています（最初の公開の前に解消が必要）`);

// ---------- 2b. ④ 素材置き場 ----------
for (const [id, a] of Object.entries(assets.assets)) {
  noteId(id, "④素材");
  if (a.kind !== "reference" && !a.file.exifStripped) err(`[写真] ${id}: 位置情報の削除が済んでいません`);
}
const usableAsset = (id, where) => {
  const a = assets.assets[id];
  if (!a) return err(`[参照] ${where}: 写真 ${id} が素材置き場にありません`);
  if (a.trashedAt) err(`[写真] ${where}: 写真 ${id} はゴミ箱に入っています`);
  if (a.kind === "reference") err(`[写真] ${where}: ${id} は制作用の資料で、公開サイトには使えません`);
  if (a.rights.basis === "unknown") err(`[写真] ${where}: ${id} は使う権利が未確認です`);
};
for (const it of Object.values(items)) for (const a of it.photos || []) usableAsset(a, `品 ${it.name}`);
for (const p of Object.values(shop.people || {})) if (p.photo) usableAsset(p.photo, `人 ${p.name}`);
for (const c of Object.values(cats)) if (c.photo) usableAsset(c.photo, `括り ${c.name}`);

// 素材サイトの写真（stock）は、架空のサンプルの店（isSample=true）でだけ「実物の枠」に使える。
// 実在の店では、お客さんに実物と誤解させないため禁止する。飾りの写真（背景の質感など＝slot other・背景）は許す。
if (shop.isSample !== true) {
  const realSlots = new Set(["exterior", "signature", "interior", "work", "staff", "product"]);
  const isStock = (id) => assets.assets[id]?.origin?.kind === "stock";
  for (const [id, a] of Object.entries(assets.assets))
    if (a.origin?.kind === "stock" && realSlots.has(a.slot))
      err(`[写真] ${id}: 素材サイトの写真（stock）を実物の枠（${a.slot}）に使っています。実在の店では実物の写真を使ってください（サンプルの店だけ許可）`);
  for (const it of Object.values(items)) for (const a of it.photos || []) if (isStock(a))
    err(`[写真] 品 ${it.name}: 素材サイトの写真（stock）は品の写真に使えません（実物と誤解させないため。サンプルの店だけ許可）`);
  for (const p of Object.values(shop.people || {})) if (p.photo && isStock(p.photo))
    err(`[写真] 人 ${p.name}: 素材サイトの写真（stock）は人の写真に使えません（実物と誤解させないため。サンプルの店だけ許可）`);
  for (const c of Object.values(cats)) if (c.photo && isStock(c.photo))
    err(`[写真] 括り ${c.name}: 素材サイトの写真（stock）は括りの写真に使えません（実物と誤解させないため。サンプルの店だけ許可）`);
}

// ---------- 2c. ③ 見た目の設定 ----------
const checkColor = (c, where) => {
  if (c?.startsWith("theme:") && !theme.colors[c.slice(6)]) err(`[色] ${where}: テーマ色 ${c} が③にありません`);
};
for (const [role, s] of Object.entries(theme.textStyles)) {
  checkColor(s.color, `③文字の役割 ${role}`);
  if (s.font === "font:accent" && !theme.fonts.accent) err(`[フォント] ③文字の役割 ${role}: font:accent を使っていますが、飾りのフォントが決まっていません`);
}

// ---------- 2d. ② サイトの組み立て ----------
const secs = site.sections, els = site.elements, pages = site.pages;
for (const id of Object.keys(pages)) noteId(id, "②ページ");
for (const id of Object.keys(secs)) noteId(id, "②セクション");
for (const id of Object.keys(els)) noteId(id, "②要素");

const secOwner = {};
const own = (sid, who) => {
  if (!secs[sid]) return err(`[参照] ${who} のセクション ${sid} がありません`);
  if (secOwner[sid]) err(`[参照] セクション ${sid} が ${secOwner[sid]} と ${who} の両方で使われています`);
  secOwner[sid] = who;
};
own(site.regions.header, "ヘッダー"); own(site.regions.footer, "フッター");
for (const pid of site.regions.headerOverlay?.pages || []) if (!pages[pid]) err(`[参照] ヘッダーを重ねるページ ${pid} がありません`);
const slugs = {};
for (const [pid, pg] of Object.entries(pages)) {
  pg.sections.forEach((s) => own(s, `ページ ${pid}`));
  if (slugs[pg.slug]) err(`[ページ] アドレス ${pg.slug} が ${slugs[pg.slug]} と ${pid} で重複`);
  slugs[pg.slug] = pid;
  if (pg.seo?.shareImage) usableAsset(pg.seo.shareImage, `ページ ${pid} の共有画像`);
}
if (!Object.values(pages).some((p) => p.kind === "home" && p.slug === "/")) err("[ページ] トップページ（kind=home、アドレス /）がありません");
for (const sid of Object.keys(secs)) if (!secOwner[sid]) warn(`[ページ] セクション ${sid} はどのページにも使われていません`);
for (const [sid, s] of Object.entries(secs)) {
  checkColor(s.background?.color, `セクション ${sid} の背景`);
  if (s.background?.photo) usableAsset(s.background.photo.asset, `セクション ${sid} の背景`);
}

// 連動（binding）の検査
const ITEM_FIELDS = new Set(["name", "nameKana", "description", "photos", "prices", "labels", "note", "season", "status", "durationMinutes", "schedule", "target", "coverage", "orderLink", "category", "menu"]);
const PERSON_FIELDS = new Set(["name", "nameKana", "role", "bio", "photo", "qualifications", "specialties"]);
const FAQ_FIELDS = new Set(["question", "answer"]);
const SHOP_TOP = new Set(Object.keys(ajv.getSchema("https://ashiya-mikke.jp/schema/shop.schema.json").schema.properties));
const checkBinding = (b, where, inCard) => {
  const first = b.path.split("/")[1];
  if (b.scope === "shop") {
    if (!SHOP_TOP.has(first)) err(`[連動] ${where}: ${b.path} は①にない場所です`);
    // 形として正しい場所か（値が空なのは構わない＝非表示になるだけ）
    const segs = b.path.split("/").slice(1);
    if (segs[0] === "catalog" && segs.length >= 3) {
      const coll = cat[segs[1]];
      if (coll && !coll[segs[2]]) err(`[連動] ${where}: ${b.path} の ${segs[2]} が①にありません`);
    }
  } else {
    if (!inCard) err(`[連動] ${where}: scope=${b.scope} は繰り返す部品のカードの中でしか使えません`);
    const set = b.scope === "item" ? ITEM_FIELDS : b.scope === "person" ? PERSON_FIELDS : FAQ_FIELDS;
    if (!set.has(first)) err(`[連動] ${where}: ${b.scope} に ${first} という項目はありません`);
  }
};
const checkLink = (l, where) => {
  if (!l) return;
  if (l.kind === "page" && !pages[l.value]) err(`[リンク] ${where}: ページ ${l.value} がありません`);
  if (l.kind === "anchor") {
    const [pid, anc] = l.value.split("#");
    if (!pages[pid]) err(`[リンク] ${where}: ページ ${pid} がありません`);
    else if (!pages[pid].sections.some((s) => secs[s]?.anchor === anc)) err(`[リンク] ${where}: ページ ${pid} にアンカー ${anc} がありません`);
  }
  if (l.kind === "service" && !services[l.value]) err(`[リンク] ${where}: 外部サービス ${l.value} がありません`);
  const need = { shopPhone: shop.contact?.phone, shopEmail: shop.contact?.email, shopInstagram: shop.contact?.sns?.instagram, shopLine: shop.contact?.sns?.line, shopMap: shop.location?.geo || shop.location?.street };
  if (l.kind in need && !need[l.kind]) warn(`[リンク] ${where}: ${l.kind} のもとになる①の値が空です（リンクは付きません）`);
};
const checkElement = (id, e, where, inCard) => {
  const w = `${where} ${id}`;
  if (inCard && e.section) err(`[要素] ${w}: カードの中の要素に section は書きません`);
  if (!inCard && !secs[e.section]) err(`[参照] ${w}: セクション ${e.section} がありません`);
  // 配置したときの高さ h：写真以外は必須（伸び縮みの分だけ下の要素をずらす基準になる）
  if (e.type !== "photo") for (const d of ["pc", "sp"]) if (!e.layout[d].h) err(`[要素] ${w}: 配置したときの高さ h がありません（${d}）`);
  if (e.type === "text") {
    checkColor(e.style.color, w); checkLink(e.style.link, w);
    e.paragraphs.forEach((p) => p.runs.forEach((r) => {
      if (r.bind) checkBinding(r.bind, w, inCard);
      if (r.detachedFrom) checkBinding(r.detachedFrom.binding, w, inCard);
      checkColor(r.marks?.color, w); checkLink(r.marks?.link, w);
    }));
    if (e.style.link && e.paragraphs.some((p) => p.runs.some((r) => r.marks?.link))) err(`[リンク] ${w}: 箱全体と一部の両方にリンクがあります`);
  }
  if (e.type === "photo") {
    if (e.asset) usableAsset(e.asset, w);
    if (e.bind) checkBinding(e.bind, w, inCard);
    checkLink(e.link, w);
    for (const d of ["pc", "sp"]) if (e.layout[d].ratio === "custom" && !e.layout[d].h) err(`[要素] ${w}: 形が自由（custom）なのに高さ h がありません（${d}）`);
  }
  if (e.type === "shape") {
    checkColor(e.fill, w); checkLink(e.link, w);
    for (const d of ["pc", "sp"]) {
      if (e.kind === "line" && !e.layout[d].strokeWidth) err(`[要素] ${w}: 線の太さがありません（${d}）`);
    }
  }
  if (e.type === "repeater") {
    const s = e.source;
    if (s.kind === "catalog") {
      if (!menus[s.menuId]) err(`[参照] ${w}: メニュー ${s.menuId} がありません`);
      for (const c of s.categoryIds || []) if (cats[c]?.menuId !== s.menuId) err(`[参照] ${w}: 括り ${c} はメニュー ${s.menuId} の括りではありません`);
      for (const l of s.labelIds || []) if (!labels[l]) err(`[参照] ${w}: ラベル ${l} がありません`);
      for (const i of s.pick || []) if (!Object.values(plcs).some((p) => p.itemId === i && p.menuId === s.menuId)) err(`[参照] ${w}: 品 ${i} はメニュー ${s.menuId} に載っていません`);
      if (s.groupByCategory && !e.groupHeading) err(`[要素] ${w}: 括りごとに並べるのに、括りの見出しの設計がありません`);
    }
    if (s.kind === "photos") s.assets.forEach((a) => usableAsset(a, w));
    if (s.kind === "people" && !Object.keys(shop.people || {}).length) warn(`[要素] ${w}: ①に人の一覧がありません`);
    if (e.display.mode === "slideshow" && !e.display.slideInterval) warn(`[要素] ${w}: スライドショーの秒数がありません（標準の5秒）`);
    if (e.display.mode === "accordion" && s.kind !== "faq") err(`[要素] ${w}: 開閉式（accordion）はよくある質問の一覧（kind=faq）でだけ使えます`);
    const scopeOk = { catalog: "item", people: "person", faq: "faq", photos: null }[s.kind];
    for (const [cid, ce] of Object.entries(e.card.elements)) {
      noteId(cid + "@" + id, `${w} のカード`);
      checkElement(cid, ce, `${w} のカード`, true);
      const bs = [];
      if (ce.bind) bs.push(ce.bind);
      ce.paragraphs?.forEach((p) => p.runs.forEach((r) => r.bind && bs.push(r.bind)));
      for (const b of bs) if (b.scope !== "shop" && b.scope !== scopeOk) err(`[連動] ${w} のカード ${cid}: この部品の中身は ${scopeOk ?? "写真"} なので scope=${b.scope} は使えません`);
    }
    if (e.groupHeading) checkElement("groupHeading", e.groupHeading, w, true);
  }
  if (e.type === "form") {
    if (e.enabled && !Object.values(pages).some((p) => p.kind === "privacy" && p.published)) err(`[フォーム] ${w}: フォームがオンなのにプライバシーポリシーのページがありません`);
    const keys = e.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) err(`[フォーム] ${w}: 同じ項目が2回あります`);
    if (!keys.includes("email") && !keys.includes("phone")) err(`[フォーム] ${w}: 返事のためにメールか電話のどちらかが必要です`);
  }
  if (e.type === "embed" && e.kind === "map" && !shop.location?.geo) warn(`[要素] ${w}: 地図の埋め込みに必要な①の位置がありません`);
  if (e.type === "nav" && !inCard && e.section !== site.regions.header && e.section !== site.regions.footer) warn(`[要素] ${w}: ページ移動のメニューがヘッダー・フッターの外にあります`);
};
for (const [id, e] of Object.entries(els)) checkElement(id, e, "②要素", false);

// ---------- 結果 ----------
function finish() {
  for (const w of warnings) console.log("  警告  " + w);
  for (const e of errors) console.log("  エラー " + e);
  console.log(`\n${dir}: エラー ${errors.length} 件、警告 ${warnings.length} 件`);
  process.exit(errors.length ? 1 : 0);
}
finish();
