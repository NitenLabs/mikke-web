// 芦屋みっけ Web制作：解決済みモデル＋実測した高さ → 静的HTML/CSS を書き出す
// 位置は静的CSS（JavaScriptなしで正しく出る）。1つのDOMに、PC・スマホの位置を2つの
// メディアクエリで与える。全体は :root の font-size を画面幅に連動させて比例で拡大縮小する。

import { reflow } from "../reflow.mjs";
import { computeSectionBackgrounds } from "./sections.mjs";
import { resolveText } from "./text.mjs";
import {
  DEVICES, boxWidthPx, ratioHeightPx, isDecorative, designWidth,
  textBoxStyle, paragraphsHtml, esc, rem, pct, round, repeaterLayout,
} from "./render.mjs";
import { colorCss, fontCss, textStyle, ROLE_TAG, themeRootVars } from "./theme.mjs";

const mq = { pc: "@media (min-width:768px)", sp: "@media (max-width:767.98px)" };

// 素材のファイル名（サンプルは .svg、実在の店は実ファイル）
function assetSrc(resolved, id) {
  return `${resolved.assetPrefix}assets/${resolved.assetFiles?.[id] || `${id}.svg`}`;
}
// 文字の箱に実測値（design px）を data-mh-pc/sp として持たせる（検査で実測とのずれを測るため）
function mhAttr(resolved, keyPc, keySp) {
  const pc = resolved.heights?.[keyPc], sp = resolved.heights?.[keySp];
  return `${pc != null ? ` data-mh-pc="${pc}"` : ""}${sp != null ? ` data-mh-sp="${sp}"` : ""}`;
}

// ---------- リンクの解決 ----------
function makeLinkResolver(shop, site, page, pageHref) {
  const svc = shop.externalServices || {};
  return (link, itemCtx) => {
    if (!link) return null;
    switch (link.kind) {
      case "url": return { href: link.value, target: link.newTab ? "_blank" : null };
      case "tel": return { href: `tel:${link.value}` };
      case "mail": return { href: `mailto:${link.value}` };
      case "instagram": return { href: `https://www.instagram.com/${link.value}/`, target: "_blank" };
      case "page": return { href: pageHref(link.value) };
      case "anchor": {
        const [pid, anc] = link.value.split("#");
        return { href: `${pid === page.id ? "" : pageHref(pid)}#${anc}` };
      }
      case "service": { const s = svc[link.value]; return s ? { href: s.url, target: "_blank" } : null; }
      case "shopPhone": return shop.contact?.phone ? { href: `tel:${shop.contact.phone.digits}` } : null;
      case "shopEmail": return shop.contact?.email ? { href: `mailto:${shop.contact.email}` } : null;
      case "shopInstagram": return shop.contact?.sns?.instagram ? { href: `https://www.instagram.com/${shop.contact.sns.instagram}/`, target: "_blank" } : null;
      case "shopLine": return shop.contact?.sns?.line ? { href: shop.contact.sns.line, target: "_blank" } : null;
      case "shopMap": {
        const g = shop.location?.geo;
        return g ? { href: `https://www.google.com/maps?q=${g.lat},${g.lng}`, target: "_blank" } : null;
      }
      case "itemOrder": {
        if (!itemCtx?.item?.orderLink) return null;
        const ol = itemCtx.item.orderLink;
        return { href: ol.url || svc[ol.serviceId]?.url, target: "_blank" };
      }
      default: return null;
    }
  };
}

// ページIDから、現在ページ（深さ depth）への相対URL
function makePageHref(pages, depth) {
  return (targetId) => {
    const slug = pages[targetId]?.slug || "/";
    const rel = slug === "/" ? "" : slug.slice(1) + "/";
    return "../".repeat(depth) + (rel || (depth ? "" : "./"));
  };
}

// ---------- 1要素の reflow 入力（1セクション・1端末） ----------
function elToReflow(el, device, resolved, repLayouts) {
  const box = el.box[device];
  const site = resolved.site;
  let h = box.h || 0, actualH, hidden = false;
  const decorative = isDecorative(el, device);
  if (el.hidden?.[device]) hidden = true;

  if (el.type === "text") {
    if (!el.text.visible) { hidden = true; actualH = 0; }
    else actualH = resolved.heights[`t:${device}:${el.id}`] ?? box.h ?? 0;
  } else if (el.type === "photo") {
    const w = box.fullBleed ? designWidth(site, device) : boxWidthPx(box, device, site);
    h = ratioHeightPx(box.ratio, w, box.h);
    actualH = h;
  } else if (el.type === "repeater") {
    const lay = repLayouts[`${el.id}:${device}`];
    if (!el.repeater.items.length) { hidden = true; actualH = 0; }
    else actualH = lay.totalHeight;
    h = box.h || actualH || 0;
  } else {
    // shape / embed / nav / form
    actualH = h;
  }
  return { id: el.id, x: box.x, w: box.w, y: box.y, h, actualH, hidden, decorative };
}

// ---------- セクションの位置を決める（reflow） ----------
function layoutSection(secId, page, resolved, device, repLayouts) {
  const els = [...resolved.elements.values()].filter((e) => e.section === secId);
  const inputs = els.map((e) => elToReflow(e, device, resolved, repLayouts));
  const minH = resolved.site.sections[secId].minHeight[device];
  const r = reflow(inputs, minH);
  return { els, positions: r.y, sectionH: r.sectionH, hidden: r.hidden };
}

// ---------- 要素のHTML ----------
function elementHtml(el, resolved, linkResolver, cssRules, device0) {
  const { theme } = resolved;
  if (el.type === "text") {
    const tag = ROLE_TAG[el.role] || "div";
    const inner = paragraphsHtml(el.text, el.style, { linkResolver: (l) => linkResolver(l), labelColumn: el.style?.labelColumn });
    const mh = mhAttr(resolved, `t:pc:${el.id}`, `t:sp:${el.id}`);
    return `<${tag} data-el="${el.id}" class="el el-text"${mh}>${inner}</${tag}>`;
  }
  if (el.type === "photo") return photoHtml(el, resolved);
  if (el.type === "shape") {
    const link = el.shape.link ? linkResolver(el.shape.link) : null;
    const tag = link ? "a" : "div";
    const href = link ? ` href="${esc(link.href)}"` : "";
    return `<${tag} data-el="${el.id}" class="el el-shape el-shape-${el.shape.kind}"${href}></${tag}>`;
  }
  if (el.type === "embed") {
    if (el.embed.kind === "map") {
      const g = resolved.shop.location?.geo;
      const src = g ? `https://www.google.com/maps?q=${g.lat},${g.lng}&z=16&hl=ja&output=embed` : "";
      const label = esc(`${resolved.shop.basic.name}の地図`);
      return `<div data-el="${el.id}" class="el el-embed"><iframe title="${label}" src="${src}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`;
    }
    return `<div data-el="${el.id}" class="el el-embed"></div>`;
  }
  if (el.type === "nav") return navHtml(el, resolved, linkResolver);
  return "";
}

function photoHtml(el, resolved) {
  const p = el.photo;
  const asset = resolved.assets.assets[p.asset];
  const alt = esc(p.alt || asset?.alt || "");
  const crop = p.crop ? `object-position:${p.crop.fx}% ${p.crop.fy}%;` : "";
  const src = assetSrc(resolved, p.asset);
  const darken = p.darken ? `<div class="darken" style="opacity:${p.darken / 100}"></div>` : "";
  const radius = p.radius ? `border-radius:${p.radius}%;` : "";
  return `<div data-el="${el.id}" class="el el-photo" style="${radius}"><img src="${src}" alt="${alt}" style="${crop}">${darken}</div>`;
}

function navHtml(el, resolved, linkResolver) {
  const pages = resolved.site.pages;
  const items = Object.entries(pages)
    .filter(([, p]) => p.showInNav && p.published)
    .sort((a, b) => a[1].navOrder - b[1].navOrder)
    .map(([pid, p]) => ({ pid, label: p.navLabel, href: linkResolver({ kind: "page", value: pid }).href, active: pid === resolved.currentPageId }));
  const links = items.map((i) => `<a href="${esc(i.href)}"${i.active ? ' aria-current="page"' : ""}>${esc(i.label)}</a>`).join("");
  const st = el.nav.style || {};
  const vars = [
    colorCss(st.color) && `--nav:${colorCss(st.color)}`,
    colorCss(st.activeColor) && `--nav-active:${colorCss(st.activeColor)}`,
    colorCss(st.spMenuBackground) && `--nav-bg:${colorCss(st.spMenuBackground)}`,
    st.font && `--nav-font:${fontCss(st.font)}`,
  ].filter(Boolean).join(";");
  return `<nav data-el="${el.id}" class="el el-nav" aria-label="ページ移動"${vars ? ` style="${vars}"` : ""}>
    <div class="nav-row only-pc">${links}</div>
    <details class="nav-sp only-sp"><summary aria-label="メニュー">☰</summary><div class="nav-menu">${links}</div></details>
  </nav>`;
}

// ---------- 繰り返す部品のHTML（1つ、cel は中で解決済み） ----------
function repeaterHtml(el, resolved, linkResolver) {
  const rp = el.repeater;
  // カード・見出しの並びは PC のレイアウト順（読む順）に合わせる
  const layPc = resolved.repLayouts[`${el.id}:pc`];
  const order = layPc.placements;
  const parts = [];
  for (const pl of order) {
    if (pl.kind === "heading") {
      const it = rp.items.find((x) => x.categoryId === pl.catId);
      const gh = rp.groupHeading;
      const tag = ROLE_TAG[gh.role] || "h3";
      const rt = resolveText(gh, { item: it.view }, { refYear: resolved.refDate.year });
      const mh = mhAttr(resolved, `g:pc:${el.id}:${pl.catId}`, `g:sp:${el.id}:${pl.catId}`);
      parts.push(`<${tag} data-head="${pl.catId}" class="rep-head el-text"${mh}>${paragraphsHtml(rt, gh.style, {})}</${tag}>`);
    } else {
      const it = rp.items.find((x) => x.id === pl.id);
      parts.push(cardHtml(el, it, resolved, linkResolver));
    }
  }
  return `<div data-el="${el.id}" class="el el-rep">${parts.join("")}</div>`;
}

function cardHtml(el, it, resolved, linkResolver) {
  const rp = el.repeater;
  const cardEls = rp.card.elements;
  // カード内の要素を z 順（＝DOM順は読む順で top 順）に
  const entries = Object.entries(cardEls);
  const inner = entries.map(([cid, ce]) => {
    if (ce.type === "text") {
      const rt = it.cels[cid];
      if (!rt || !rt.visible) return "";
      const tag = ROLE_TAG[ce.role] || "div";
      const mh = mhAttr(resolved, `c:pc:${el.id}:${it.id}:${cid}`, `c:sp:${el.id}:${it.id}:${cid}`);
      return `<${tag} data-cel="${cid}" class="el el-text"${mh}>${paragraphsHtml(rt, ce.style, { linkResolver: (l) => linkResolver(l, it) })}</${tag}>`;
    }
    if (ce.type === "photo") {
      if (!it.hasPhoto) return "";
      const assetId = it.item.photos[0];
      const asset = resolved.assets.assets[assetId];
      const src = assetSrc(resolved, assetId);
      const crop = ce.crop ? `object-position:${ce.crop.fx}% ${ce.crop.fy}%;` : "";
      return `<div data-cel="${cid}" class="el el-photo"><img src="${src}" alt="${esc(asset?.alt || it.item.name)}" style="${crop}"></div>`;
    }
    if (ce.type === "shape") {
      return `<div data-cel="${cid}" class="el el-shape el-shape-${ce.kind}"></div>`;
    }
    return "";
  }).join("");
  return `<div data-card="${it.id}" class="rep-card">${inner}</div>`;
}

// ---------- 要素のCSS（位置＋文字スタイル、端末別） ----------
function elementCss(el, resolved, positions, device, rules) {
  const box = el.box[device];
  const y = positions[el.id] ?? box.y;
  const sel = `[data-el="${el.id}"]`;
  const lines = [];

  // 全面写真（どちらかの端末で fullBleed）は bleed 層（セクション全面）に置く。
  // 片方の端末だけ fullBleed でも、bleed 層に描くので両端末とも inset:0（セクションを覆う）にする。
  const isBleed = el.type === "photo" && (el.box.pc?.fullBleed || el.box.sp?.fullBleed);
  if (isBleed) {
    rules.push(`${mq[device]}{${sel}{position:absolute;inset:0;z-index:${el.z}}}`);
    return;
  }

  lines.push(`left:${pct(box.x)}`, `width:${pct(box.w)}`, `top:${rem(y)}`, `z-index:${el.z}`);

  if (el.type === "photo") {
    const w = boxWidthPx(box, device, resolved.site);
    const h = ratioHeightPx(box.ratio, w, box.h);
    lines.push(`height:${rem(h)}`);
  } else if (el.type === "text") {
    lines.push(...textBoxStyle(el, device, resolved.theme, "rem"));
    const ts = textStyle(resolved.theme, el.role);
    const col = colorCss(el.style?.color || ts.color); if (col) lines.push(`color:${col}`);
    if (el.style?.align) lines.push(`text-align:${el.style.align}`);
    if (box.writingMode === "vertical") lines.push(`height:${rem(box.h)}`, "white-space:nowrap");
    // 縦書き以外は高さを指定しない（中身なりに伸びる＝reflow が下をずらす）
  } else if (el.type === "shape") {
    lines.push(`height:${rem(box.h)}`);
    const fill = colorCss(el.shape.fill); if (fill) lines.push(el.shape.kind === "line" ? `background:${fill}` : `background:${fill}`);
    if (el.shape.radius != null) lines.push(`border-radius:${el.shape.radius}px`);
    if (el.shape.opacity != null) lines.push(`opacity:${el.shape.opacity / 100}`);
  } else if (el.type === "repeater") {
    // カードが下に伸びるので、箱の高さは内部レイアウトの総高（実測反映後）にする
    const total = resolved.repLayouts?.[`${el.id}:${device}`]?.totalHeight ?? box.h;
    lines.push(`height:${rem(total)}`);
  } else {
    lines.push(`height:${rem(box.h)}`);
  }
  rules.push(`${mq[device]}{${sel}{${lines.join(";")}}}`);

  if (el.type === "repeater") repeaterCss(el, resolved, device, rules);
}

// 繰り返す部品の内部（カード・見出し・cel）のCSS
function repeaterCss(el, resolved, device, rules) {
  const lay = resolved.repLayouts[`${el.id}:${device}`];
  const rp = el.repeater;
  const base = `[data-el="${el.id}"]`;
  for (const pl of lay.placements) {
    if (pl.kind === "heading") {
      const gh = rp.groupHeading;
      const sel = `${base} [data-head="${pl.catId}"]`;
      const st = textBoxStyle({ role: gh.role, style: gh.style, box: gh.layout }, device, resolved.theme, "rem");
      const col = colorCss(gh.style?.color || textStyle(resolved.theme, gh.role).color);
      rules.push(`${mq[device]}{${sel}{position:absolute;left:0;top:${rem(pl.top)};width:100%;${st.join(";")}${col ? `;color:${col}` : ""}}}`);
    } else {
      const it = rp.items.find((x) => x.id === pl.id);
      const cardSel = `${base} [data-card="${pl.id}"]`;
      rules.push(`${mq[device]}{${cardSel}{position:absolute;left:${rem(pl.left)};top:${rem(pl.top)};width:${rem(pl.width)};height:${rem(pl.height)}}}`);
      // cel の位置（カード reflow 後）
      for (const [cid, ce] of Object.entries(rp.card.elements)) {
        const cb = ce.layout[device];
        const cy = pl.card.positions[cid] ?? cb.y;
        const celSel = `${cardSel} [data-cel="${cid}"]`;
        const L = [`position:absolute`, `left:${pct(cb.x)}`, `width:${pct(cb.w)}`, `top:${rem(cy)}`, `z-index:${ce.z ?? 1}`];
        if (ce.type === "photo") {
          const pw = (cb.w / 100) * lay.cardW;
          L.push(`height:${rem(ratioHeightPx(cb.ratio, pw, cb.h))}`);
        } else if (ce.type === "text") {
          L.push(...textBoxStyle({ role: ce.role, style: ce.style, box: ce.layout }, device, resolved.theme, "rem"));
          const col = colorCss(ce.style?.color || textStyle(resolved.theme, ce.role).color); if (col) L.push(`color:${col}`);
          if (ce.style?.align) L.push(`text-align:${ce.style.align}`);
        } else if (ce.type === "shape") {
          L.push(`height:${rem(cb.h)}`);
          const fill = colorCss(ce.fill); if (fill) L.push(`background:${fill}`);
        }
        rules.push(`${mq[device]}{${celSel}{${L.join(";")}}}`);
      }
    }
  }
}

export {
  makeLinkResolver, makePageHref, layoutSection, elementHtml, repeaterHtml,
  elementCss, computeSectionBackgrounds, mq,
};
