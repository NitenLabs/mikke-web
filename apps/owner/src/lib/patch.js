// その場の見え方（SPEC 4章）：iframe の下地の DOM を、① ② から直接直す。目安の見え方（改行・段の高さは作り直しで決まる）。
// 文は draft.js の previewTexts／cardTexts で作り、ここは DOM に当てるだけ。
import { listItems } from "./menu.js";
import { cardTexts } from "./draft.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sel = (key) => `[data-edit~="${key.replace(/"/g, '\\"')}"]`;

/** 文字の要素を段落の並びで描き直す（1 段落＝<span class="pg">。2 つ目からの段落の間は下地の style を写す） */
export function setParagraphs(el, paras) {
  const pgs = el.querySelectorAll(":scope > .pg");
  const gap = pgs[1]?.getAttribute("style") ?? "";
  el.innerHTML = paras.map((t, i) => `<span class="pg"${i && gap ? ` style="${esc(gap)}"` : ""}><span>${esc(t)}</span></span>`).join("");
}

/** ① の文（営業時間・紹介文）と ② の文字の箱 */
export function patchTexts(doc, texts) {
  for (const [key, paras] of Object.entries(texts)) for (const el of doc.querySelectorAll(sel(key))) {
    if (el.matches("p")) setParagraphs(el, paras);
  }
}

/** ② の写真の要素（data-el）と、品の写真。url(assetId) で写真の道 */
export function patchPhotos(doc, slots, assetOf, url) {
  for (const s of slots) {
    if (s.itemId) continue;
    const a = assetOf(s);
    const img = doc.querySelector(`[data-el="${s.elId}"] img`);
    if (img && a && a !== s.assetId) { img.src = url(a); img.style.objectPosition = "50% 50%"; }
  }
}

/** 品書き：カードを足す（最後のカードを写す）・消す・並べ替え、名前・説明・値段・写真 */
export function patchMenu(doc, shop, { menuId, categoryIds, listKey }, url) {
  const box = doc.querySelector(sel(listKey));
  if (!box) return;
  const cards = [...box.querySelectorAll(":scope > [data-card]")];
  if (!cards.length) return;
  const byItem = new Map(cards.map((c) => [/item:(\S+)/.exec(c.getAttribute("data-edit") ?? "")?.[1], c]));
  const tpl = cards.at(-1);
  // 値段の行の見本。全部の品が「値段を出さない」になって下地から消えても、後で出し直せるよう最初の 1 つを覚えておく
  const found = box.querySelector('[data-cel="c_pr"]');
  if (found && !box.__prTpl) box.__prTpl = found.cloneNode(true);
  const prTpl = found ?? box.__prTpl ?? null;
  const want = listItems(shop, menuId, categoryIds);
  const keep = new Set();
  for (const { itemId, placementId, item } of want) {
    let c = byItem.get(itemId);
    if (!c) {
      c = tpl.cloneNode(true);
      c.setAttribute("data-card", placementId);
      c.setAttribute("data-edit", `item:${itemId}`);
      for (const e of c.querySelectorAll("[data-edit]")) e.setAttribute("data-edit", e.getAttribute("data-edit").replace(/^item:[^/]+/, `item:${itemId}`));
    }
    keep.add(c);
    const t = cardTexts(item);
    const nm = c.querySelector('[data-cel="c_nm"]'), ds = c.querySelector('[data-cel="c_ds"]');
    if (nm) { setParagraphs(nm, [t.name]); nm.setAttribute("data-edit", `item:${itemId}/name`); }
    if (ds) { setParagraphs(ds, t.description ? [t.description] : []); ds.setAttribute("data-edit", `item:${itemId}/description`); }
    let pr = c.querySelector('[data-cel="c_pr"]');
    if (!pr && t.prices && prTpl) { pr = prTpl.cloneNode(true); (ds ?? nm)?.after(pr); }
    if (pr) { if (t.prices) { setParagraphs(pr, [t.prices]); pr.setAttribute("data-edit", `item:${itemId}/prices`); } else pr.remove(); }
    const img = c.querySelector('[data-cel="c_ph"] img');
    const ph = item.photos?.[0];
    if (img) {
      if (!ph) img.removeAttribute("src");
      else if (!img.getAttribute("src")?.includes(ph)) img.src = url(ph);
      img.alt = item.name ?? "";
    }
    box.appendChild(c);   // 順に並べ直す
  }
  for (const c of cards) if (!keep.has(c)) c.remove();
}

/** 直している所に水色の枠（1 つ目へスクロール）。key が null なら消す */
export function highlight(doc, key, { scroll = true } = {}) {
  if (!doc.getElementById("mk-hl-style")) {
    const st = doc.createElement("style"); st.id = "mk-hl-style";
    st.textContent = `.mk-hl{outline:3px solid #6098A8 !important;outline-offset:3px;}[data-edit]{cursor:pointer}`;
    doc.head.appendChild(st);
  }
  for (const e of doc.querySelectorAll(".mk-hl")) e.classList.remove("mk-hl");
  if (!key) return [];
  const els = [...doc.querySelectorAll(sel(key))];
  for (const e of els) e.classList.add("mk-hl");
  if (scroll && els[0]) els[0].scrollIntoView({ block: "center" });
  return els;
}

/** 下地の印を読む（draft.editableFrom に渡す形） */
export function readMarks(doc) {
  return [...doc.querySelectorAll("[data-edit]")].map((e) => ({
    edit: e.getAttribute("data-edit"),
    el: e.getAttribute("data-el") ?? undefined,
    cel: e.getAttribute("data-cel") ?? undefined,
    item: /item:([^\s/]+)/.exec(e.closest("[data-card]")?.getAttribute("data-edit") ?? "")?.[1],
  }));
}
