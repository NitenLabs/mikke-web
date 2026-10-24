// 公開の一式（線 C）：今の中身を、ページごと・PC とスマホの両方で「公開の描き方」（プレビューと同じ）で描いて写し取り、
// packages/core/publish の buildBundle に渡して { pages, css, files, meta } を作る（API の POST /api/shops/:id/publish の本文の材料）。
// 線：C｜PG の中（pg/ のファイルは1つのスコープを分け合う。並びは src/parts.mjs）。名前は c_ で始める（ほかの線とぶつからないように）。
// 写し取るもの（packages/core/publish/README.md「入力」）：
//   セクションごとの HTML（#sec をそのまま写し、倍率・編集用の印と属性を外し、リンクを <a> に、写真を <mk-photo data-i> の印に）・高さ（設計 px）
//   写真ごとの ④ の ID と、枠の中の表示の位置・大きさ（見せる範囲。編集画面が背景に当てている値そのもの）
const C_PAGE_KIND = { pg_home: "home", pg_menu: "menu", pg_contact: "contact" };
const C_KEEP_DATA = /^data-(el|kind|sec|i)$/;   // data-i は写真の印（<mk-photo data-i>）
const C_DROP_ATTR = ["contenteditable", "spellcheck", "draggable", "tabindex"];
// 写真の素材の大きさが測れるまで待つ（測れていないと見せる範囲を当てられない）。最大 ms ミリ秒
async function c_waitPhotos(ms) {
  const want = new Set();
  const here = { page: state.page, device: state.device };
  for (const p of PAGES) for (const d of ["pc", "sp"]) {
    state.page = p.id; state.device = d; const R = reduce(activeOps(), d);
    for (const inst of R.secList) { const c = R.secContent[inst.id]; if (!c) continue;
      (c.blocks || []).forEach((b) => { if (b.photo && b.photo.asset) want.add(b.photo.asset); });
      (c.cards || []).forEach((cd) => { if (cd.photo && cd.photo.asset) want.add(cd.photo.asset); }); }
    for (const a of R.added) if (a.kind === "photo" && a.asset) want.add(a.asset);
  }
  state.page = here.page; state.device = here.device;
  for (const id of want) ensureNat(id);
  const t0 = Date.now();
  while ([...want].some((id) => assetUrl(id) && !assetNat(id)) && Date.now() - t0 < (ms || 5000)) await new Promise((r) => setTimeout(r, 30));
}
const c_px = (s) => { const m = /^(-?[\d.]+)px$/.exec(String(s || "").trim()); return m ? +m[1] : null; };
// 今の端末・今のページの描画を写し取る（state.preview の描画の後に呼ぶ）
function c_pubSnap(device, opts) {
  const R = reduce(activeOps(), device); const sections = [], photos = []; const meta = (opts && opts.assets) || {};
  for (const inst of state.secList) {
    const s = secNode(inst.id); if (!s) continue;
    const height = +(s.getBoundingClientRect().height / scale).toFixed(3);
    const cl = s.cloneNode(true);
    cl.querySelectorAll(".sel-pad,.rz-handle,.snap-guide,.anchor-line,.anchor-label").forEach((n) => n.remove());
    // 写真：枠の背景（素材と見せる範囲）を、枠の中の <img> の位置・大きさに。枠は overflow:hidden
    const op = s.querySelectorAll('[data-kind="photo"]'), cp = cl.querySelectorAll('[data-kind="photo"]');
    op.forEach((el, k) => {
      const c = cp[k]; if (!c || el.classList.contains("empty")) return;
      const part = el.getAttribute("data-el"); let asset = assetOfPart(part, R); if (!asset) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      const bs = String(el.style.backgroundSize || "").split(/\s+/), bp = String(el.style.backgroundPosition || "").split(/\s+/);
      let img = (c_px(bs[0]) != null && c_px(bs[1]) != null && c_px(bp[0]) != null && c_px(bp[1]) != null) ? { x: c_px(bp[0]), y: c_px(bp[1]), w: c_px(bs[0]), h: c_px(bs[1]) } : null;
      const nat = assetNat(asset) || (meta[asset] && meta[asset].file ? { w: meta[asset].file.width, h: meta[asset].file.height } : null);
      if (!img && nat && w && h) { const cv = coverBG(w, h, nat.w, nat.h, effView(part, device, R.viewAll)); if (cv) img = { x: cv.ox, y: cv.oy, w: cv.dw, h: cv.dh }; }
      if (!img) img = { x: 0, y: 0, w, h };
      if (opts && opts.assetMap && opts.assetMap[asset]) asset = opts.assetMap[asset];
      for (const p of ["background-image", "background-size", "background-position", "background-repeat"]) c.style.removeProperty(p);
      if (getComputedStyle(el).position === "static") c.style.position = "relative";
      c.style.overflow = "hidden";
      c.textContent = "";
      const mk = document.createElement("mk-photo"); mk.setAttribute("data-i", String(photos.length)); c.appendChild(mk);
      photos.push({ asset, part, img: { x: +img.x.toFixed(3), y: +img.y.toFixed(3), w: +img.w.toFixed(3), h: +img.h.toFixed(3) }, natW: nat ? nat.w : null, natH: nat ? nat.h : null });
    });
    // 文の一部のリンク（span[data-lk]）→ <a>
    for (const sp of [...cl.querySelectorAll("span[data-lk]")]) {
      let lk = null; try { lk = JSON.parse(sp.getAttribute("data-lk")); } catch (e) { lk = null; }
      const href = c_href(lk, device); if (!href) continue;
      const a = document.createElement("a"); a.setAttribute("href", href); if (linkOpensNewTab(lk)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
      if (sp.getAttribute("style")) a.setAttribute("style", sp.getAttribute("style"));
      while (sp.firstChild) a.appendChild(sp.firstChild); sp.replaceWith(a);
    }
    // ナビ（ヘッダー・フッター）→ ページへの <a>
    for (const sp of [...cl.querySelectorAll(".navitem[data-page]")]) {
      const pg = PAGES.find((p) => p.id === sp.getAttribute("data-page")); if (!pg) continue;
      const a = document.createElement("a"); a.setAttribute("href", pg.slug); a.className = sp.className; if (sp.classList.contains("on")) a.setAttribute("aria-current", "page");
      a.setAttribute("style", (sp.getAttribute("style") || "").replace(/cursor:\s*pointer;?/, ""));
      while (sp.firstChild) a.appendChild(sp.firstChild); sp.replaceWith(a);
    }
    // 部品まるごとのリンク（写真・ボタン）→ その部品を <a> に（表示の形は元の要素の display をそのまま書く）
    for (const el of [...cl.querySelectorAll("[data-el]")]) {
      const id = el.getAttribute("data-el"); if (!canElementLink(id)) continue;
      if ((el.parentElement && el.parentElement.closest("a")) || el.querySelector("a")) continue;   // <a> の中に <a> は置けない（外側のリンクだけ）
      const lk = elementLinkOf(id); const href = c_href(lk, device); if (!href) continue;
      const orig = s.querySelector('[data-el="' + id + '"]'); const disp = orig ? getComputedStyle(orig).display : "block";
      const a = document.createElement("a"); for (const at of [...el.attributes]) a.setAttribute(at.name, at.value);
      a.setAttribute("href", href); if (linkOpensNewTab(lk)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
      if (!a.style.display) a.style.display = disp;
      while (el.firstChild) a.appendChild(el.firstChild); el.replaceWith(a);
    }
    // 編集用の属性・印を外す（data-el・data-kind・data-sec は残す＝同じ形かを確かめるのに使う）
    for (const el of [cl, ...cl.querySelectorAll("*")]) {
      for (const at of [...el.attributes]) if ((/^data-/.test(at.name) && !C_KEEP_DATA.test(at.name)) || C_DROP_ATTR.includes(at.name) || /^on/i.test(at.name)) el.removeAttribute(at.name);
      if (el.classList && el.classList.length) { for (const k of [...el.classList]) if (/^mark-/.test(k)) el.classList.remove(k); if (!el.classList.length) el.removeAttribute("class"); }
      if (el.style && el.style.cursor) el.style.removeProperty("cursor");
    }
    cl.removeAttribute("id"); cl.id = "mk-" + device + "-" + inst.id; cl.classList.add("mk-sec");
    for (const p of ["transform", "transform-origin", "zoom"]) cl.style.removeProperty(p);
    sections.push({ id: inst.id, type: inst.type, height, html: cl.outerHTML });
  }
  return { width: SPEC.DESIGN_W[device], height: +sections.reduce((a, x) => a + x.height, 0).toFixed(3), sections, photos };
}
// リンクの行き先。ページ内（セクション）は、その端末の配置のセクションへ
function c_href(lk, device) {
  if (!lk) return "";
  if (lk.kind === "anchor") return lk.sec ? "#mk-" + device + "-" + lk.sec : "";
  const h = resolveHref(lk); return (h && h !== "#") ? h : "";
}
const c_jstToday = () => { const j = new Date(Date.now() + 9 * 3600 * 1000); return j.toISOString().slice(0, 10); };
/**
 * 公開の一式を作る（Promise）。opts：
 *   assets   ④ の一覧（GET /api/shops/:id/assets の assets）。写真の幅・高さ・説明に使う。無ければ編集画面が測った大きさ
 *   origin   公開ページのアドレス（GET /api/shops/:id の publicUrl）。無ければ仮の値（meta.warnings に出る）
 *   assetMap 編集画面の写真 ID → ④ の ID（まだ上げていない写真を上げた後に）
 *   date     描く日（日本時間 YYYY-MM-DD）。無ければ今日
 *   seo・mikkeUrl・noindex は packages/core/publish の buildBundle のとおり
 * 返り値の meta.localAssets：まだ ④ に無い写真（ast_ でない ID）の中身（data URL）。公開の前に上げて assetMap で直す
 */
async function buildPublishBundle(opts) {
  opts = opts || {};
  if (state.editing) commitEdit();
  if (state.peek) peekOff();
  const save = { page: state.page, device: state.device, preview: state.preview, pub: state._pubGeo, selected: state.selected, selectedSection: state.selectedSection };
  const sx = window.scrollX, sy = window.scrollY;
  const pages = [];
  try {
    state.selected = new Set(); state.selectedSection = null;
    await c_waitPhotos(opts.waitMs);
    state.preview = true; state._pubGeo = true;
    for (const p of PAGES) {
      state.page = p.id; const devices = {};
      for (const d of ["pc", "sp"]) { state.device = d; render(); paintPhotos(); devices[d] = c_pubSnap(d, opts); }
      pages.push({ id: p.id, slug: p.slug, label: p.label, kind: C_PAGE_KIND[p.id] || "page", devices });
    }
  } finally {
    state.page = save.page; state.device = save.device; state.preview = save.preview; state._pubGeo = save.pub; state.selected = save.selected; state.selectedSection = save.selectedSection;
    render(); try { window.scrollTo(sx, sy); } catch (e) {}
  }
  const shop = currentShop();
  const warn = [];
  let origin = opts.origin;
  if (!origin) { origin = "https://ashiyado.mikke.site"; warn.push({ kind: "origin_provisional", text: "公開ページのアドレスが渡されていないので仮の値にしました：" + origin }); }
  const b = __MIKKE.PUBLISH.buildBundle({ shop, assets: opts.assets || {}, origin, date: opts.date || c_jstToday(), pages, seo: opts.seo, mikkeUrl: opts.mikkeUrl, noindex: opts.noindex });
  b.meta.warnings = [...warn, ...b.meta.warnings];
  b.meta.localAssets = {}; for (const id of b.meta.unuploadedAssets) b.meta.localAssets[id] = assetUrl(id);
  return b;
}
