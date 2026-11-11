// 店主の編集画面（apps/owner/SPEC.md）。素の JS。部品は lib/、ここは画面とつなぎだけ。
import { api, ApiError, sayError } from "./lib/api.js";
import { ruleFor, defaultTextRule, checkText, checkHours, checkPrices, checkList, checkPhotoWidth, photoRule, remainText, canAdd, canRemove, worst } from "./lib/limits.js";
import { DAYS, setDay, applyAll, hoursLine, closedLine, dayView } from "./lib/hours.js";
import { listItems, addItem, removeItem, moveItem, setItemField, pricesFromRows, rowsFromPrices, setRowType, setPriceShown, PRICE_TYPES } from "./lib/menu.js";
import { fitCrop, moveCrop, scaleCrop, innerRect } from "./lib/crop.js";
import { editableFrom, textParagraphs, setTextParagraphs, setShopValue, getPointer, setElementPhoto, setItemPhoto, photoAsset, outsideEdits, dirtyKinds, resolveConflict, previewTexts, same, priceSummary } from "./lib/draft.js";
import { patchTexts, patchPhotos, patchMenu, highlight, readMarks } from "./lib/patch.js";
import { loadPhoto, buildCroppedUpload } from "./lib/photo-upload.js";
import { formatPriceAll } from "../../../tools/lib/format.mjs";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const PHONE = () => window.matchMedia("(max-width: 760px)").matches;
const app = $("#app");

const S = { ready: false };
window.OWNER = { state: () => S, get ready() { return S.ready; } };

const Q_CATCH = "/story/answers/q_catch/answer", Q_BODY = "/story/answers/q_body/answer";
const SECTIONS = [
  { id: "hours", title: "営業時間とお休み", key: "shop:/hours", show: (ed) => ed.shopPtrs.has("/hours") },
  { id: "menu", title: "お品書き", key: null, show: (ed) => ed.lists.size > 0 || ed.itemFields.size > 0 },
  { id: "story", title: "お店の紹介", key: `shop:${Q_BODY}`, show: (ed) => ed.shopPtrs.has(Q_BODY) || ed.shopPtrs.has(Q_CATCH) },
  { id: "fv", title: "表紙の言葉", key: "text:fv_copy", show: (ed) => ed.texts.has("fv_copy") },
  { id: "photos", title: "写真", key: null, show: (ed) => ed.photos.some((p) => p.elId) },
];

// ───────── はじまり
boot().catch((e) => { app.innerHTML = `<div class="login"><p class="msg err">${esc(sayError(e))}</p></div>`; console.error(e); });

async function boot() {
  const cfg = await api("/api/config").catch(() => ({ line: false }));
  const t = /[#&]t=([^&]+)/.exec(location.hash)?.[1];
  if (t) {
    history.replaceState(null, "", location.pathname.replace(/\/login$/, "/") + location.search);
    try { await api("/api/auth/verify", { method: "POST", body: { token: decodeURIComponent(t) } }); }
    catch (e) { return showLogin(cfg, "このリンクはもう使えません。もう一度コードを送ってください"); }
  }
  let me;
  try { me = await api("/api/me"); } catch (e) { if (e.status === 401) return showLogin(cfg); throw e; }
  if (!me.shops?.length) { app.innerHTML = `<div class="login"><h1>芦屋みっけ</h1><p>直せるお店がありません。事務局にお問い合わせください。</p></div>`; return; }
  await openShop(me, me.shops[0]);
}

function showLogin(cfg, note = "") {
  app.innerHTML = `<div class="login">
    <h1><span class="brand">芦屋みっけ</span>お店のページを直す</h1>
    <form id="lgMail" class="field">
      <label for="lgEmail">メールアドレス</label>
      <input id="lgEmail" type="email" autocomplete="email" inputmode="email" required>
      <button class="btn main" type="submit">コードを送る</button>
    </form>
    <form id="lgCode" class="field" hidden>
      <label for="lgCodeIn">届いた 6 桁の数字を入れてください</label>
      <input id="lgCodeIn" class="mono" inputmode="numeric" autocomplete="one-time-code" maxlength="6">
      <button class="btn main" type="submit">入る</button>
      <p class="note">メールのリンクを開いても入れます。</p>
    </form>
    ${cfg?.line ? `<div class="field"><button class="btn" id="lgLine" type="button">LINE で入る</button></div>` : ""}
    <p class="msg" id="lgMsg" role="status">${esc(note)}</p>
  </div>`;
  const msg = (t, err) => { const m = $("#lgMsg"); m.textContent = t; m.classList.toggle("err", !!err); };
  let email = "";
  $("#lgMail").onsubmit = async (ev) => {
    ev.preventDefault();
    email = $("#lgEmail").value.trim();
    try { await api("/api/auth/request", { method: "POST", body: { email } }); $("#lgCode").hidden = false; $("#lgCodeIn").focus(); msg("メールを送りました。届いた数字を入れてください"); }
    catch (e) { msg(sayError(e), true); }
  };
  $("#lgCode").onsubmit = async (ev) => {
    ev.preventDefault();
    const code = $("#lgCodeIn").value.trim();
    if (!/^\d{6}$/.test(code)) return msg("6 桁の数字を入れてください", true);
    try { await api("/api/auth/verify", { method: "POST", body: { email, code } }); location.replace("/"); }
    catch (e) { msg(e.status === 429 ? "何度もまちがえたので、しばらく入れません。メールのリンクから入ってください" : "数字がちがうか、期限が切れています", true); }
  };
  if ($("#lgLine")) $("#lgLine").onclick = () => msg("LINE アプリの中で開くと、LINE で入れます");
}

// ───────── お店を開く
async function openShop(me, shop) {
  const id = shop.id;
  const [info, ds, dsite, limits, baseHtml, assets] = await Promise.all([
    api(`/api/shops/${id}`),
    api(`/api/shops/${id}/drafts/shop`),
    api(`/api/shops/${id}/drafts/site`),
    fetch(`/limits/${shop.slug}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`/preview/${shop.slug}/index.html`).then((r) => (r.ok ? r.text() : "")).catch(() => ""),
    api(`/api/shops/${id}/assets`).catch(() => ({ assets: {} })),
  ]);
  const baseDoc = new DOMParser().parseFromString(baseHtml, "text/html");
  Object.assign(S, {
    me, id, slug: shop.slug, name: info.name ?? shop.name, limits, assets: assets.assets ?? {},
    ed: editableFrom(readMarks(baseDoc)),
    hasBase: !!baseHtml,
  });
  adopt("shop", ds.version, ds.data); adopt("site", dsite.version, dsite.data);
  // 既定の上限（今の段落の数・最長＋2 字）は下地の字から（直した下書きから測ると、直すたびに縮むので）
  const fvBase = [...baseDoc.querySelectorAll('[data-el="fv_copy"] > .pg')].map((e) => e.textContent.trim());
  S.origFv = fvBase.length ? fvBase : textParagraphs(S.site, "fv_copy");
  S.open = null; S.openItem = null; S.view = "pc"; S.priceStash = {};
  renderShell();
  await refreshStatus();
  S.ready = true;
}
function adopt(kind, version, data) {
  S.ver = S.ver ?? {}; S.saved = S.saved ?? {};
  S.ver[kind] = version; S.saved[kind] = clone(data); S[kind] = clone(data);
}

// ───────── 画面の枠
function renderShell() {
  app.innerHTML = `
  <header class="bar">
    <div class="bar-l"><span class="brand">芦屋みっけ</span><b class="shop">${esc(S.name)}</b><span class="state" id="state"></span></div>
    <div class="bar-r"><button class="btn" id="btnVersions" type="button">これまでの公開</button><button class="btn main" id="btnPublish" type="button">公開する</button></div>
  </header>
  <main class="work">
    <section class="form" id="form" aria-label="直す所"></section>
    <section class="pv" id="pv" aria-label="今の姿">
      <div class="pv-top"><span>今の姿（目安）</span>
        <div class="seg"><button type="button" data-view="pc" aria-pressed="true">パソコン</button><button type="button" data-view="sp" aria-pressed="false">スマホの見え方</button></div></div>
      <div class="pv-frame" id="pvFrame"></div>
      <p class="note">目安の見え方です。公開すると正しく並びます。</p>
    </section>
  </main>
  <footer class="savebar"><p class="msg" id="saveMsg" role="status"></p><button class="btn main" id="btnSave" type="button">下書きに保存</button></footer>
  <div class="sheet" id="sheet" hidden></div>`;
  $("#btnSave").onclick = () => save();
  $("#btnPublish").onclick = () => askPublish();
  $("#btnVersions").onclick = () => showVersions();
  for (const b of app.querySelectorAll("[data-view]")) b.onclick = () => { S.view = b.dataset.view; mountPreview(); };
  window.addEventListener("beforeunload", (e) => { if (dirtyKinds(S).length) { e.preventDefault(); e.returnValue = ""; } });
  renderForm();
  mountPreview();
  window.matchMedia("(max-width: 760px)").addEventListener("change", () => mountPreview());
}

// ───────── 左の入力
function renderForm() {
  const form = $("#form");
  form.innerHTML = SECTIONS.filter((s) => s.show(S.ed)).map((s) => `
    <div class="sec${S.open === s.id ? " open" : ""}" data-sec="${s.id}">
      <button class="sec-head" type="button" data-act="sec" aria-expanded="${S.open === s.id}">
        <span>${s.title}</span><span class="sec-sum">${esc(summary(s.id))}</span></button>
      <div class="sec-body">${S.open === s.id ? body(s.id) : ""}</div>
    </div>`).join("");
  form.onclick = onFormClick;
  form.oninput = onFormInput;
  form.onchange = onFormInput;
  form.onfocusin = (e) => { const k = e.target.closest("[data-key]")?.dataset.key; if (k) focusKey(k); };
  updateChecks();
}

function summary(id) {
  if (id === "hours") return hoursLine(S.shop.hours);
  if (id === "menu") return `${menuItems().length} 品`;
  if (id === "story") return String(getPointer(S.shop, Q_CATCH) ?? "").replace(/\n/g, " ");
  if (id === "fv") return textParagraphs(S.site, "fv_copy").join(" ");
  if (id === "photos") return `${S.ed.photos.filter((p) => p.elId).length} 枚`;
  return "";
}

const MENU = () => {
  const lk = [...S.ed.lists][0] ?? "catalog:mnu_food";
  const rule = S.limits?.lists?.[lk] ?? null;
  return { listKey: `list:${lk}`, menuId: lk.split(":")[1], categoryIds: rule?.categoryIds ?? null, rule };
};
const menuItems = () => listItems(S.shop, MENU().menuId, MENU().categoryIds);

function body(id) {
  if (id === "hours") {
    const rows = DAYS.map(([d, ja]) => {
      const v = dayView(S.shop.hours, d), open = v.status === "open";
      return `<div class="day" data-day="${d}">
        <span class="dn">${ja}</span>
        <div class="seg"><button type="button" data-act="day" data-st="open" aria-pressed="${open}">開いている</button><button type="button" data-act="day" data-st="closed" aria-pressed="${!open}">お休み</button></div>
        <span class="times"${open ? "" : " hidden"}><input type="time" class="mono" data-key="shop:/hours" data-hours="start" value="${esc(v.start)}" aria-label="${ja}曜の開ける時刻"><span>〜</span><input type="time" class="mono" data-key="shop:/hours" data-hours="end" value="${esc(v.end)}" aria-label="${ja}曜の閉める時刻"></span>
      </div>`;
    }).join("");
    return `<div class="days" data-key="shop:/hours">${rows}</div>
      <button class="btn line" type="button" data-act="hours-all">全部の曜日に同じ時間を入れる</button>
      <dl class="shown"><dt>ページの表示</dt><dd id="hoursShown">${esc(hoursLine(S.shop.hours))}</dd><dt>定休日</dt><dd id="closedShown">${esc(closedLine(S.shop.hours))}</dd></dl>
      <p class="msg" data-msg="hours"></p>`;
  }
  if (id === "story") {
    return `${S.ed.shopPtrs.has(Q_CATCH) ? `<div class="field"><label for="fCatch">見出し</label><p class="note">改行で行を分けます。</p>
        <textarea id="fCatch" rows="2" data-key="shop:${Q_CATCH}" data-ptr="${Q_CATCH}">${esc(getPointer(S.shop, Q_CATCH))}</textarea><p class="msg" data-msg="catch"></p></div>` : ""}
      ${S.ed.shopPtrs.has(Q_BODY) ? `<div class="field"><label for="fBody">紹介文</label><p class="note">改行で段落を分けます。</p>
        <textarea id="fBody" rows="9" data-key="shop:${Q_BODY}" data-ptr="${Q_BODY}">${esc(getPointer(S.shop, Q_BODY))}</textarea><p class="msg" data-msg="body"></p></div>` : ""}`;
  }
  if (id === "fv") {
    return `<div class="field"><label for="fFv">表紙の言葉</label><p class="note">改行で行を分けます。</p>
      <textarea id="fFv" rows="3" data-key="text:fv_copy">${esc(textParagraphs(S.site, "fv_copy").join("\n"))}</textarea><p class="msg" data-msg="fv"></p></div>`;
  }
  if (id === "photos") {
    return `<ul class="photos">${S.ed.photos.filter((p) => p.elId).map((p) => {
      const a = photoAsset(p, S.shop, S.site);
      return `<li data-key="${esc(p.key)}"><img alt="" src="${esc(assetUrl(a))}" loading="lazy"><span>${esc(photoLabel(p))}</span>
        <button class="btn line" type="button" data-act="photo" data-el="${esc(p.elId)}">替える</button></li>`;
    }).join("")}</ul>`;
  }
  if (id === "menu") {
    const m = MENU(), items = menuItems();
    const ef = S.ed.itemFields;
    return `<p class="note">${items.length} 品${m.rule?.maxItems ? `（${m.rule.maxItems} 品まで）` : ""}</p>
      <ol class="items">${items.map((x, i) => {
        const it = x.item, op = S.openItem === x.itemId;
        return `<li class="item${op ? " open" : ""}" data-item="${x.itemId}" data-key="item:${x.itemId}">
          <div class="item-row"><button type="button" class="item-head" data-act="item" aria-expanded="${op}"><span class="nm">${esc(it.name)}</span><span class="pr mono">${esc(headPrice(it.prices))}</span></button>
            ${ef.size || S.ed.lists.size ? `<button type="button" class="btn sq" data-act="up" aria-label="上へ"${i === 0 ? " disabled" : ""}>↑</button><button type="button" class="btn sq" data-act="down" aria-label="下へ"${i === items.length - 1 ? " disabled" : ""}>↓</button>` : ""}</div>
          ${op ? itemBody(x.itemId, it) : ""}</li>`;
      }).join("")}</ol>
      ${S.ed.lists.size ? `<button class="btn line" type="button" data-act="add"${canAdd(items.length, m.rule) ? "" : " disabled"}>品を足す</button>` : ""}
      <p class="msg" data-msg="list"></p>`;
  }
  return "";
}

function itemBody(itemId, it) {
  const ef = S.ed.itemFields, k = (f) => `item:${itemId}/${f}`;
  const types = priceTypes();
  const shown = (it.prices ?? []).length > 0;
  const amt = (p, f, label) => `<input type="text" class="mono amt" inputmode="numeric" data-key="${k("prices")}" data-pf="${f}" value="${esc(p[f] ?? "")}" aria-label="${label}">`;
  const rows = (it.prices ?? []).map((p, i) => `<div class="price" data-pi="${i}" data-pt="${esc(p.type)}">
      <div class="seg ptype" role="group" aria-label="値段の書き方">${types.map((t) => `<button type="button" data-act="price-type" data-type="${t.type}" aria-pressed="${p.type === t.type}">${t.label}</button>`).join("")}</div>
      <div class="price-in">
        <input type="text" class="pname" data-key="${k("prices")}" data-pf="name" value="${esc(p.name ?? "")}" placeholder="名前（無くてよい）" aria-label="値段の名前">
        ${p.type === "fixed" || p.type === "from" ? `${amt(p, "amount", "値段")}<span>${p.type === "from" ? "円〜" : "円"}</span>`
          : p.type === "range" ? `${amt(p, "amount", "下の値段")}<span>〜</span>${amt(p, "max", "上の値段")}<span>円</span>`
          : p.type === "market" ? `<span class="pfix">時価</span>` : `<span class="pfix">${esc(formatPriceAll([p]))}</span>`}
        <button type="button" class="btn sq" data-act="price-del" aria-label="この値段を消す">×</button>
      </div></div>`).join("");
  const showSeg = `<div class="seg" role="group" aria-label="値段を出すか"><button type="button" data-act="price-show" data-on="1" aria-pressed="${shown}">値段を出す</button><button type="button" data-act="price-show" data-on="0" aria-pressed="${!shown}">値段を出さない</button></div>`;
  const priceField = `<div class="field"><label>値段（税込）</label>${showSeg}
    ${shown ? `${rows}<button type="button" class="btn line" data-act="price-add">値段を足す</button>` : `<p class="note">ページに値段は出ません。</p>`}
    <p class="msg" data-msg="i:${itemId}:prices"></p></div>`;
  return `<div class="item-body">
    ${ef.has("name") ? `<div class="field"><label>名前</label><input type="text" data-key="${k("name")}" data-if="name" value="${esc(it.name)}"><p class="msg" data-msg="i:${itemId}:name"></p></div>` : ""}
    ${ef.has("description") ? `<div class="field"><label>説明</label><textarea rows="3" data-key="${k("description")}" data-if="description">${esc(it.description ?? "")}</textarea><p class="msg" data-msg="i:${itemId}:description"></p></div>` : ""}
    ${ef.has("prices") ? priceField : ""}
    ${ef.has("photos") ? `<div class="field ph"><label>写真</label>${it.photos?.[0] ? `<img alt="" src="${esc(assetUrl(it.photos[0]))}">` : `<span class="note">写真はまだありません</span>`}<button type="button" class="btn line" data-act="photo" data-item="${itemId}">写真を替える</button></div>` : ""}
    ${S.ed.lists.size ? `<button type="button" class="btn warnline" data-act="del">この品を消す</button>` : ""}
  </div>`;
}

const assetUrl = (a) => (a ? `/api/shops/${S.id}/assets/${a}/file` : "");
function photoLabel(p) {
  const sec = { fv: "表紙", st: "紹介", sr: "並びの写真", mn: "品", ac: "案内" }[p.elId.split("_")[0]] ?? "写真";
  const alt = S.assets[p.assetId]?.alt;
  return alt ? `${sec}：${alt}` : sec;
}

// ───────── 入力
function onFormClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act, li = b.closest("[data-item]"), itemId = li?.dataset.item;
  if (act === "sec") {
    const id = b.closest("[data-sec]").dataset.sec;
    S.open = S.open === id ? null : id; S.openItem = null;
    renderForm();
    const sec = SECTIONS.find((s) => s.id === id);
    if (S.open && sec.key) focusKey(sec.key);
    if (S.open) $(`[data-sec="${id}"]`).scrollIntoView({ block: "start" });
    return;
  }
  if (act === "day") {
    const d = b.closest("[data-day]").dataset.day;
    const cur = dayView(S.shop.hours, d);
    const st = b.dataset.st;
    const fallback = DAYS.map(([x]) => dayView(S.shop.hours, x)).find((v) => v.status === "open") ?? { start: "09:00", end: "18:00" };
    S.shop.hours = setDay(S.shop.hours, d, st === "open" ? { status: "open", start: cur.start || fallback.start, end: cur.end || fallback.end } : { status: "closed" });
    rerender(); focusKey("shop:/hours"); return;
  }
  if (act === "hours-all") {
    const f = DAYS.map(([x]) => dayView(S.shop.hours, x)).find((v) => v.status === "open");
    if (f) S.shop.hours = applyAll(S.shop.hours, f.start, f.end);
    rerender(); return;
  }
  const m = MENU();
  if (act === "item") { S.openItem = S.openItem === itemId ? null : itemId; rerender(); if (S.openItem) focusKey(`item:${itemId}`); return; }
  if (act === "up" || act === "down") { S.shop = moveItem(S.shop, m.menuId, itemId, act === "up" ? -1 : 1); rerender(); focusKey(`item:${itemId}`); return; }
  if (act === "add") {
    const r = addItem(S.shop, m.menuId, m.categoryIds?.[0] ?? menuItems()[0]?.categoryId);
    S.shop = r.shop; S.openItem = r.itemId; rerender();
    const inp = $(`[data-item="${r.itemId}"] [data-if="name"]`); if (inp) { inp.focus(); inp.select(); }
    focusKey(`item:${r.itemId}`); return;
  }
  if (act === "del") {
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "本当に消す（もう一度押す）"; return; }
    if (!canRemove(menuItems().length, m.rule)) return;
    S.shop = removeItem(S.shop, itemId); S.openItem = null; rerender(); return;
  }
  if (act === "price-add" || act === "price-del" || act === "price-type") {
    const it = S.shop.catalog.items[itemId];
    const prev = clone(it.prices ?? []);
    let rows = rowsFromPrices(prev);
    const pi = Number(b.closest("[data-pi]")?.dataset.pi);
    if (act === "price-add") rows.push({ name: "", type: "fixed", amount: "", max: "" });
    else if (act === "price-del") { rows.splice(pi, 1); prev.splice(pi, 1); }
    else rows = setRowType(rows, pi, b.dataset.type);
    // 最後の 1 つを消したら「値段を出さない」と同じ（prices: []）
    if (act === "price-del" && !rows.length) S.priceStash[itemId] = [];
    S.shop = setItemField(S.shop, itemId, "prices", pricesFromRows(rows, prev, allIds()));
    rerender();
    if (act === "price-type") $(`[data-item="${itemId}"] [data-pi="${pi}"] [data-pf="amount"]`)?.focus();
    return;
  }
  if (act === "price-show") {
    const it = S.shop.catalog.items[itemId], on = b.dataset.on === "1";
    if (!on && it.prices?.length) S.priceStash[itemId] = clone(it.prices);   // 戻したときに前の値段を出す（この画面を開いている間だけ）
    S.shop = setItemField(S.shop, itemId, "prices", setPriceShown(it.prices, on, { stash: S.priceStash[itemId], taken: allIds() }));
    rerender(); return;
  }
  if (act === "photo") return openPhoto(b.dataset.item ? { itemId: b.dataset.item } : { elId: b.dataset.el });
}
const allIds = () => new Set(JSON.stringify(S.shop).match(/[a-z]{2,4}_[a-z0-9]{4,24}/g) ?? []);
const headPrice = (prices) => priceSummary(prices);
// 選べる値段の書き方（edit-limits の「item:*/prices」の types があれば、その中だけ）
const priceTypes = () => { const t = ruleFor(S.limits, "item:*/prices")?.types; return Array.isArray(t) ? PRICE_TYPES.filter((x) => t.includes(x.type)) : PRICE_TYPES; };

function onFormInput(e) {
  const t = e.target;
  if (e.type === "change" && t.type !== "checkbox" && t.type !== "time") return;
  if (t.dataset.hours) {
    const d = t.closest("[data-day]").dataset.day, row = t.closest("[data-day]");
    const start = $('[data-hours="start"]', row).value, end = $('[data-hours="end"]', row).value;
    S.shop.hours = setDay(S.shop.hours, d, { status: "open", start, end });
    $("#hoursShown").textContent = hoursLine(S.shop.hours); $("#closedShown").textContent = closedLine(S.shop.hours);
  } else if (t.dataset.ptr) S.shop = setShopValue(S.shop, t.dataset.ptr, t.value);
  else if (t.id === "fFv") S.site = setTextParagraphs(S.site, "fv_copy", t.value.split("\n"));
  else if (t.dataset.if) {
    const itemId = t.closest("[data-item]").dataset.item;
    S.shop = setItemField(S.shop, itemId, t.dataset.if, t.value);
    if (t.dataset.if === "name") $(`[data-item="${itemId}"] .nm`).textContent = t.value;
  } else if (t.dataset.pf) {
    const li = t.closest("[data-item]"), itemId = li.dataset.item;
    const val = (r, f) => $(`[data-pf="${f}"]`, r)?.value ?? "";
    const rows = [...li.querySelectorAll("[data-pi]")].map((r) => ({ name: val(r, "name"), type: r.dataset.pt, amount: val(r, "amount"), max: val(r, "max") }));
    S.shop = setItemField(S.shop, itemId, "prices", pricesFromRows(rows, S.shop.catalog.items[itemId].prices ?? [], allIds()));
    $(".pr", li).textContent = headPrice(S.shop.catalog.items[itemId].prices);
  } else return;
  updateChecks();
  refreshPreview();
}

function rerender() {
  const y = window.scrollY, fy = $("#form").scrollTop;
  renderForm(); refreshPreview();
  window.scrollTo(0, y); $("#form").scrollTop = fy;
}

// ───────── 上限の判定 → その場で理由・保存の可否
function allChecks() {
  const L = S.limits, out = [];
  const put = (id, r, where) => out.push({ id, r, where });
  if (S.ed.shopPtrs.has("/hours")) put("hours", checkHours(S.shop.hours, ruleFor(L, "shop:/hours")), "営業時間");
  if (S.ed.shopPtrs.has(Q_CATCH)) put("catch", checkText(getPointer(S.shop, Q_CATCH), ruleFor(L, `shop:${Q_CATCH}`)), "紹介の見出し");
  if (S.ed.shopPtrs.has(Q_BODY)) put("body", checkText(getPointer(S.shop, Q_BODY), ruleFor(L, `shop:${Q_BODY}`)), "紹介文");
  if (S.ed.texts.has("fv_copy")) put("fv", checkText(textParagraphs(S.site, "fv_copy").join("\n"), ruleFor(L, "text:fv_copy") ?? defaultTextRule(S.origFv), { required: true }), "表紙の言葉");
  const items = menuItems();
  if (S.ed.lists.size) put("list", checkList(items.length, MENU().rule), "お品書き");
  for (const { itemId, item } of items) {
    const nm = item.name || "名前の無い品";
    if (S.ed.itemFields.has("name")) put(`i:${itemId}:name`, checkText(item.name, ruleFor(L, `item:${itemId}/name`), { required: true }), `「${nm}」の名前`);
    if (S.ed.itemFields.has("description")) put(`i:${itemId}:description`, checkText(item.description, ruleFor(L, `item:${itemId}/description`)), `「${nm}」の説明`);
    if (S.ed.itemFields.has("prices")) put(`i:${itemId}:prices`, checkPrices(item.prices, ruleFor(L, `item:${itemId}/prices`)), `「${nm}」の値段`);
  }
  return out;
}

function updateChecks() {
  const cs = allChecks();
  for (const c of cs) {
    const el = document.querySelector(`[data-msg="${CSS.escape(c.id)}"]`);
    if (!el) continue;
    const ms = c.r.messages;
    el.textContent = ms.length ? ms.map((m) => m.text).join("　") : remainText(c.r);
    el.className = `msg${c.r.level === "error" ? " err" : c.r.level === "warn" ? " warn" : ""}`;
  }
  const errs = cs.filter((c) => c.r.level === "error");
  S.blocked = errs.length > 0;
  const dirty = dirtyKinds(S).length > 0;
  const btn = $("#btnSave");
  btn.disabled = S.blocked || !dirty || S.busy;
  const m = $("#saveMsg");
  if (S.blocked) { m.textContent = `直す所があります：${errs[0].where}${errs.length > 1 ? ` ほか ${errs.length - 1} か所` : ""}`; m.className = "msg err"; }
  else if (dirty) { m.textContent = "まだ保存していない直しがあります"; m.className = "msg"; }
  else if (!S.flash) { m.textContent = ""; m.className = "msg"; }
  for (const s of app.querySelectorAll("[data-sec]")) {
    const id = s.dataset.sec;
    const bad = cs.some((c) => c.r.level === "error" && secOf(c.id) === id);
    s.classList.toggle("bad", bad);
    const sum = $(".sec-sum", s); if (sum) sum.textContent = summary(id);
  }
  return cs;
}
const secOf = (id) => (id === "hours" ? "hours" : id === "catch" || id === "body" ? "story" : id === "fv" ? "fv" : "menu");
function flash(text, cls = "") { S.flash = true; const m = $("#saveMsg"); m.textContent = text; m.className = `msg ${cls}`; setTimeout(() => { S.flash = false; }, 50); }

// ───────── 右の今の姿
function mountPreview() {
  const box = $("#pvFrame");
  for (const b of app.querySelectorAll("[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === S.view));
  if (PHONE() || !S.hasBase) { box.innerHTML = ""; S.frame = null; return; }
  const W = S.view === "sp" ? 390 : 1440;
  box.innerHTML = `<iframe id="pvIframe" title="お店のページの今の姿" src="/preview/${S.slug}/index.html" width="${W}"></iframe>`;
  const f = $("#pvIframe");
  const fit = () => {
    const k = Math.min(1, box.clientWidth / W);
    f.style.transform = `scale(${k})`; f.style.width = `${W}px`; f.style.height = `${Math.round(box.clientHeight / k)}px`;
    box.dataset.scale = k.toFixed(3);
  };
  fit(); new ResizeObserver(fit).observe(box);
  f.addEventListener("load", () => {
    S.frame = f.contentDocument;
    S.frame.addEventListener("click", onPreviewClick, true);
    refreshPreview();
    if (S.focus) highlight(S.frame, S.focus);
  });
}

function refreshPreview() {
  const d = S.frame;
  if (!d) return;
  try {
    patchTexts(d, previewTexts(S.shop, S.site, S.ed));
    patchMenu(d, S.shop, MENU(), assetUrl);
    patchPhotos(d, S.ed.photos, (p) => photoAsset(p, S.shop, S.site), assetUrl);
    if (S.focus) highlight(d, S.focus, { scroll: false });
  } catch (e) { console.warn("preview", e); }
}

function focusKey(key) {
  S.focus = key;
  if (S.frame) highlight(S.frame, key);
}

/** 右の印を押す → 左のその入力を開く */
function onPreviewClick(e) {
  e.preventDefault(); e.stopPropagation();
  let el = e.target.closest("[data-edit]");
  while (el) {
    const ks = el.getAttribute("data-edit").split(/\s+/);
    for (const k of ks) if (goTo(k)) return;
    el = el.parentElement?.closest("[data-edit]");
  }
}
function goTo(key) {
  let sec = null, item = null, focusSel = null;
  if (key === "shop:/hours" && S.ed.shopPtrs.has("/hours")) { sec = "hours"; focusSel = '[data-hours="start"]'; }
  else if (key === `shop:${Q_CATCH}`) { sec = "story"; focusSel = "#fCatch"; }
  else if (key === `shop:${Q_BODY}`) { sec = "story"; focusSel = "#fBody"; }
  else if (key === "text:fv_copy" && S.ed.texts.has("fv_copy")) { sec = "fv"; focusSel = "#fFv"; }
  else if (/^item:/.test(key)) { sec = "menu"; item = key.slice(5).split("/")[0]; const f = key.split("/")[1]; focusSel = f ? `[data-key="${key}"]` : null; }
  else if (/^photo:/.test(key) && S.ed.photos.some((p) => p.key === key && p.elId)) { sec = "photos"; focusSel = `[data-key="${key}"] button`; }
  else return false;
  S.open = sec; S.openItem = item; renderForm();
  const f = focusSel && $(focusSel, $("#form"));
  if (f) { f.focus(); f.scrollIntoView({ block: "center" }); }
  focusKey(key);
  return true;
}

// ───────── 写真（選ぶ→切り抜く→上げる）
function openPhoto(slot) {
  const full = slot.itemId ? { key: `item:${slot.itemId}/photos`, itemId: slot.itemId } : S.ed.photos.find((p) => p.elId === slot.elId);
  const rule = photoRule(S.limits, full.itemId ? { itemId: full.itemId } : { assetId: full.assetId });
  const aspect = rule?.aspect?.pc ?? 1.5, spAspect = rule?.aspect?.sp ?? null;
  const sh = $("#sheet");
  sh.hidden = false;
  sh.innerHTML = `<div class="sheet-in" role="dialog" aria-label="写真を替える">
    <h2>写真を替える</h2>
    <label class="btn line file">写真を選ぶ<input type="file" accept="image/*" id="phFile"></label>
    <div class="crop" id="crop" hidden><canvas id="phCv"></canvas><div class="crop-box" id="cropBox">${spAspect ? `<div class="crop-sp" id="cropSp"></div>` : ""}</div></div>
    <div class="field" id="phSize" hidden><label for="phScale">切り抜く大きさ</label><input type="range" id="phScale" min="20" max="100" value="100"></div>
    <p class="note" id="phNote">${spAspect ? "実線がパソコン、点線がスマホで見える所です。枠を動かして合わせてください。" : "枠を動かして合わせてください。"}</p>
    <p class="msg" id="phMsg" role="status"></p>
    <div class="row"><button class="btn" type="button" id="phCancel">やめる</button><button class="btn main" type="button" id="phOk" disabled>この写真にする</button></div>
  </div>`;
  let P = null, rect = null, k = 1;
  const draw = () => {
    const b = $("#cropBox");
    Object.assign(b.style, { left: `${rect.x * k}px`, top: `${rect.y * k}px`, width: `${rect.w * k}px`, height: `${rect.h * k}px` });
    if (spAspect) { const r = innerRect({ x: 0, y: 0, w: rect.w, h: rect.h }, spAspect); Object.assign($("#cropSp").style, { left: `${r.x * k}px`, top: `${r.y * k}px`, width: `${r.w * k}px`, height: `${r.h * k}px` }); }
    const w = Math.round(rect.w), r = checkPhotoWidth(w, rule);
    const m = $("#phMsg"); m.textContent = r.messages[0]?.text ?? ""; m.className = `msg${r.level === "warn" ? " warn" : ""}`;
  };
  $("#phCancel").onclick = () => { sh.hidden = true; sh.innerHTML = ""; };
  $("#phFile").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { P = await loadPhoto(file); } catch (err) { $("#phMsg").textContent = "この写真は読み込めません。別の写真をお選びください"; $("#phMsg").className = "msg err"; return; }
    const cv = $("#phCv"), maxW = Math.min(560, sh.clientWidth - 48);
    k = Math.min(maxW / P.w, 420 / P.h);
    cv.width = Math.round(P.w * k); cv.height = Math.round(P.h * k);
    cv.getContext("2d").drawImage(P.canvas, 0, 0, cv.width, cv.height);
    $("#crop").hidden = false; $("#phSize").hidden = false; $("#crop").style.width = `${cv.width}px`; $("#crop").style.height = `${cv.height}px`;
    rect = fitCrop(P.w, P.h, aspect); draw();
    $("#phOk").disabled = false;
  };
  $("#phScale").oninput = (e) => { if (!P) return; rect = scaleCrop(rect, e.target.value / 100, P.w, P.h, aspect); draw(); };
  const box = $("#cropBox");
  box.onpointerdown = (ev) => {
    if (!P) return;
    box.setPointerCapture(ev.pointerId);
    let x0 = ev.clientX, y0 = ev.clientY;
    box.onpointermove = (m) => { rect = moveCrop(rect, (m.clientX - x0) / k, (m.clientY - y0) / k, P.w, P.h); x0 = m.clientX; y0 = m.clientY; draw(); };
    box.onpointerup = () => { box.onpointermove = null; };
  };
  $("#phOk").onclick = async () => {
    $("#phOk").disabled = true; $("#phMsg").textContent = "写真を送っています…"; $("#phMsg").className = "msg";
    try {
      const { form } = await buildCroppedUpload(P.canvas, rect, full.itemId ? "item" : full.elId);
      const a = await api(`/api/shops/${S.id}/assets`, { method: "POST", body: form });
      S.assets[a.id] = a;
      if (full.itemId) S.shop = setItemPhoto(S.shop, full.itemId, a.id);
      else S.site = setElementPhoto(S.site, full.elId, a.id);
      sh.hidden = true; sh.innerHTML = "";
      rerender(); focusKey(full.key ?? `item:${full.itemId}`);
      flash("写真を替えました。「下書きに保存」を押すと残ります");
    } catch (err) { $("#phMsg").textContent = sayError(err); $("#phMsg").className = "msg err"; $("#phOk").disabled = false; }
  };
}

// ───────── 保存・ぶつかり
async function save() {
  if (S.blocked || S.busy) return false;
  const bad = outsideEdits(S.ed, S.saved.shop, S.shop, S.saved.site, S.site);
  if (bad.length) { flash("直せない所が変わっています。読み込み直してください", "err"); console.warn("outside", bad); return false; }
  const kinds = dirtyKinds(S);
  if (!kinds.length) return true;
  S.busy = true; updateChecks(); flash("保存しています…");
  try {
    for (const kind of kinds) {
      const data = clone(S[kind]);
      try {
        const r = await api(`/api/shops/${S.id}/drafts/${kind}`, { method: "PUT", body: data, ifMatch: S.ver[kind] });
        S.ver[kind] = r.version; S.saved[kind] = data;
      } catch (e) {
        if (e.status === 409 && e.data?.current) { S.busy = false; showConflict(kind, e.data.current); return false; }
        throw e;
      }
    }
    S.busy = false; updateChecks();
    flash("下書きに保存しました。「公開する」を押すまで、お店のページは変わりません", "ok");
    await refreshStatus();
    return true;
  } catch (e) { S.busy = false; updateChecks(); flash(sayError(e), "err"); return false; }
}

function showConflict(kind, current) {
  const sh = $("#sheet");
  sh.hidden = false;
  sh.innerHTML = `<div class="sheet-in" role="alertdialog" aria-label="ほかの所で直されました" data-conflict="${kind}">
    <h2>ほかの所で直されました</h2>
    <p>別の画面で、先に保存されています。どちらにしますか。選ばなかった方も残しておくので、あとから戻せます。</p>
    <div class="col"><button class="btn main" type="button" id="cfTheirs">新しい方を読み込む</button><button class="btn" type="button" id="cfMine">自分の直しで保存する</button></div>
    <p class="msg" id="cfMsg" role="status"></p></div>`;
  const run = async (choice) => {
    const plan = resolveConflict(kind, choice, clone(S[kind]), current);
    try {
      await api(`/api/shops/${S.id}/backups`, { method: "POST", body: plan.backup });
      if (plan.adopt) { adopt(kind, plan.adopt.version, plan.adopt.data); }
      else { S.ver[kind] = plan.put.version; }
      sh.hidden = true; sh.innerHTML = "";
      if (plan.put) { await save(); } else { rerender(); flash("新しい方を読み込みました", "ok"); await refreshStatus(); }
    } catch (e) { $("#cfMsg").textContent = sayError(e); $("#cfMsg").className = "msg err"; }
  };
  $("#cfTheirs").onclick = () => run("theirs");
  $("#cfMine").onclick = () => run("mine");
}

// ───────── 状態・公開・版
async function refreshStatus() {
  try {
    S.status = await api(`/api/shops/${S.id}/status`);
    $("#state").textContent = S.status.label ?? "";
    $("#state").dataset.state = S.status.state ?? "";
  } catch (e) { /* 出せなくても直せる */ }
}

function askPublish() {
  if (S.blocked) return flash("直す所があるので、まだ公開できません", "err");
  const sh = $("#sheet");
  sh.hidden = false;
  sh.innerHTML = `<div class="sheet-in" role="dialog" aria-label="公開しますか">
    <h2>公開しますか</h2>
    <p>お店のページが、いまの下書きの内容に変わります。${dirtyKinds(S).length ? "保存していない直しも、先に保存します。" : ""}</p>
    <div class="row"><button class="btn" type="button" id="pbNo">やめる</button><button class="btn main" type="button" id="pbYes">公開する</button></div>
    <p class="msg" id="pbMsg" role="status"></p></div>`;
  $("#pbNo").onclick = () => { sh.hidden = true; sh.innerHTML = ""; };
  $("#pbYes").onclick = async () => {
    $("#pbYes").disabled = true;
    sh.hidden = true; sh.innerHTML = "";
    if (!(await save())) return;
    flash("公開しています…");
    try {
      const v = await api(`/api/shops/${S.id}/publish`, { method: "POST", body: { scope: "all", render: "rebuild", shopDraftVersion: S.ver.shop, siteDraftVersion: S.ver.site } });
      S.lastPublish = { number: v.number, render: v.render };
      flash("ページを作り直しています。少しお待ちください…");
      let rr = null;
      try {
        const r = await fetch("/__dev/rebuild", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: S.slug, number: v.number }) });
        if (r.ok) rr = await r.json();
      } catch (e) { /* 手元でなければ無い */ }
      S.lastPublish.rebuild = rr;
      const st = rr?.render?.state;
      if (st === "ok") flash("公開しました", "ok");
      else if (st === "failed") flash("ページを作れませんでした。お手数ですが事務局にご連絡ください", "err");
      else flash("公開の手続きをしました。数分でお店のページに出ます", "ok");
      await refreshStatus();
    } catch (e) {
      if (e.status === 409) { flash("ほかの所で直されました。読み込み直してから公開してください", "err"); return; }
      flash(sayError(e), "err");
    }
  };
}

const RENDER_JA = { ok: "公開済み", pending: "作り直し中", failed: "作れませんでした", html: "公開済み" };
async function showVersions() {
  const sh = $("#sheet");
  sh.hidden = false;
  sh.innerHTML = `<div class="sheet-in" role="dialog" aria-label="これまでの公開"><h2>これまでの公開</h2><p class="msg" id="vMsg">読み込んでいます…</p><ol class="versions" id="vList"></ol>
    <div class="row"><button class="btn" type="button" id="vClose">閉じる</button></div></div>`;
  $("#vClose").onclick = () => { sh.hidden = true; sh.innerHTML = ""; };
  try {
    const r = await api(`/api/shops/${S.id}/versions`);
    const list = Array.isArray(r) ? r : r.versions ?? [];
    $("#vMsg").textContent = list.length ? "" : "まだ公開していません";
    $("#vList").innerHTML = list.map((v) => `<li data-version="${v.number}">
      <span class="vn mono">${v.number}</span>
      <span class="vd mono">${esc(fmtDate(v.publishedAt))}</span>
      <span class="vs">${v.isPublished ? "いま公開中" : ""}${v.render?.state ? `<i data-render="${v.render.state}">${RENDER_JA[v.render.state] ?? ""}</i>` : ""}</span>
      <button class="btn line" type="button" data-restore="${v.number}">この版に戻す</button></li>`).join("");
    for (const b of sh.querySelectorAll("[data-restore]")) b.onclick = () => restore(Number(b.dataset.restore), b);
  } catch (e) { $("#vMsg").textContent = sayError(e); $("#vMsg").className = "msg err"; }
}
const fmtDate = (s) => { const d = new Date(s); return isNaN(d) ? "" : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

async function restore(n, btn) {
  if (dirtyKinds(S).length) { $("#vMsg").textContent = "保存していない直しがあります。先に「下書きに保存」を押してください"; $("#vMsg").className = "msg err"; return; }
  if (btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = "下書きに戻す（もう一度押す）"; return; }
  try {
    await api(`/api/shops/${S.id}/versions/${n}/restore`, { method: "POST", body: { siteDraftVersion: S.ver.site, includeShop: true, shopDraftVersion: S.ver.shop } });
    const [ds, dsite] = await Promise.all([api(`/api/shops/${S.id}/drafts/shop`), api(`/api/shops/${S.id}/drafts/site`)]);
    adopt("shop", ds.version, ds.data); adopt("site", dsite.version, dsite.data);
    $("#sheet").hidden = true; $("#sheet").innerHTML = "";
    rerender(); await refreshStatus();
    flash(`${n} 番の版を下書きに戻しました。よければ「公開する」を押してください`, "ok");
  } catch (e) {
    $("#vMsg").textContent = e.status === 409 ? "ほかの所で直されました。読み込み直してください" : sayError(e); $("#vMsg").className = "msg err";
  }
}

void ApiError; void same;
