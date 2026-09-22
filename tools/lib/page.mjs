// 芦屋みっけ Web制作：1ページ分の HTML/CSS を組み立てる（シェル＋ベースCSS＋クライアントJS）

import { computeSectionBackgrounds } from "./sections.mjs";
import { repeaterLayout, designWidth, esc, rem, pct, boxWidthPx, ratioHeightPx } from "./render.mjs";
import {
  makeLinkResolver, makePageHref, layoutSection, elementHtml, repeaterHtml, elementCss, mq,
} from "./emit.mjs";
import { colorCss, themeRootVars, textStyle } from "./theme.mjs";
import { googleFontsUrl } from "./fonts.mjs";

// 全 repeater × 端末 の内部レイアウトを先に計算して resolved に持たせる
export function buildRepLayouts(resolved) {
  resolved.repLayouts = {};
  for (const el of resolved.elements.values()) {
    if (el.type !== "repeater") continue;
    for (const device of ["pc", "sp"]) {
      resolved.repLayouts[`${el.id}:${device}`] = repeaterLayout(el, device, resolved.site, resolved.heights);
    }
  }
}

// ベースCSS（全ページ共通）。canvas の幅から比例拡大縮小の基準を作る。
function baseCss(resolved) {
  const site = resolved.site;
  const pcDiv = site.canvas.pcContentWidth / 10; // 1rem=10px の基準
  const spDiv = site.canvas.spDesignWidth / 10;
  const vars = themeRootVars(resolved.theme).join("");
  return `
*{margin:0;padding:0;box-sizing:border-box}
:root{${vars}}
/* スマホのブラウザの文字の自動拡大を止める（拡大されると実測とずれるため） */
html{-webkit-text-size-adjust:100%;-moz-text-size-adjust:100%;text-size-adjust:100%}
body{background:var(--c-background);color:var(--c-text);font-family:var(--f-body);line-height:1.7;overflow-x:hidden}
img{display:block;max-width:none}
a{color:inherit}
main{display:block}
.sec{position:relative;width:100%;overflow:hidden}
.cbox{position:relative;margin:0 auto}
.el{position:absolute}
/* 改行の規則を明示的に固定する（エンジンごとの既定値の違いで折り返しがゆれないように） */
.el-text{line-break:strict;word-break:normal;overflow-wrap:anywhere;white-space:normal}
.el-text .pg{display:block}
.el-text .nowrap{white-space:nowrap}
.el-text .lc{display:flex}
.el-text .lc-key{flex:none;color:var(--c-textMuted)}
.el-text .lc-val{flex:1}
.el-photo{overflow:hidden}
.el-photo img{width:100%;height:100%;object-fit:cover}
.bleed{position:absolute;inset:0;z-index:0;overflow:hidden}
.bleed img{width:100%;height:100%;object-fit:cover}
.darken{position:absolute;inset:0;background:#000;pointer-events:none}
.el-embed iframe{width:100%;height:100%;border:0;display:block}
.el-shape-line{height:1px}
.el-rep{position:absolute}
.rep-card,.rep-head{position:absolute}
.rep-card{overflow:hidden}
.site-header{position:sticky;top:0;z-index:1000}
/* ヘッダーを重ねる（FVの暗い写真に透明で重ねる）：最初のセクションの上に絶対配置し、スクロールで流れる */
.site-header.overlay{position:absolute;top:0;left:0;right:0;background:transparent!important}
.site-header.overlay .el-text,.site-header.overlay .el-nav a,.site-header.overlay .nav-sp summary{color:var(--overlay-on,var(--c-onDark))!important}
.el-nav .nav-row{display:flex;gap:1.6rem;justify-content:flex-end;align-items:center;height:100%;font-family:var(--nav-font,inherit)}
.el-nav a{text-decoration:none;color:var(--nav,inherit);white-space:nowrap}
.el-nav a[aria-current]{color:var(--nav-active,inherit)}
.el-nav .nav-sp{height:100%}
.el-nav .nav-sp summary{list-style:none;cursor:pointer;font-size:2.2rem;line-height:1;text-align:right;color:var(--nav,inherit)}
.el-nav .nav-sp summary::-webkit-details-marker{display:none}
.el-nav .nav-menu{position:absolute;right:0;top:110%;background:var(--nav-bg,var(--c-surface));display:flex;flex-direction:column;gap:1.2rem;padding:1.6rem 2rem;min-width:14rem;z-index:1001}
.el-nav .nav-menu a{font-size:1.6rem}
.notfound{max-width:60rem;margin:0 auto;padding:12rem 2rem;text-align:center}
.notfound h1{font-family:var(--f-heading);margin-bottom:2rem}
${mq.pc}{:root{font-size:clamp(7px,calc(100vw/${pcDiv}),10px)}.cbox{width:${site.canvas.pcContentWidth / 10}rem}.only-sp{display:none!important}}
${mq.sp}{:root{font-size:clamp(8.2px,calc(100vw/${spDiv}),11.5px)}.cbox{width:${site.canvas.spDesignWidth / 10}rem}.only-pc{display:none!important}}
`.trim();
}

// クライアントJS（2つだけ）：開閉式を開いたら下をずらす／実測とのずれを直す
const CLIENT_JS = `
// (1) 開閉式（accordion）を開いたら、同じ入れ物の下の要素をずらす
document.querySelectorAll('.el-rep details').forEach(function(d){
  var card=d.closest('.rep-card'); if(!card)return;
  d.addEventListener('toggle',function(){
    var rep=card.parentElement, delta=d.open?(d.scrollHeight-d.querySelector('summary').offsetHeight):0;
    var base=parseFloat(getComputedStyle(card).top);
    Array.prototype.forEach.call(rep.children,function(c){
      if(c===card)return; var t=parseFloat(getComputedStyle(c).top);
      if(t>base) c.style.transform='translateY('+(d.open?delta:0)+'px)';
    });
  });
});
// (2) フォント読み込み後に1回だけ、実測（build時に静的CSSへ焼いた高さ）と実際の高さのずれを直す。
//     上（下の要素が食い込む）にも下（余白が広がる）にも動かす＝ずれが2pxを超えたら詰め直す。
function correct(){
  var device = innerWidth<768 ? 'sp' : 'pc';
  var scale = parseFloat(getComputedStyle(document.documentElement).fontSize)/10; // 1rem=10px が基準
  document.querySelectorAll('.cbox').forEach(function(box){
    var els = Array.prototype.slice.call(box.children).filter(function(e){return e.classList.contains('el');});
    els.forEach(function(e){ e.style.transform=''; });
    // 各要素の「実際の高さ − 焼いた高さ」（design px）。焼いた高さは data-mh（文字の箱だけ持つ）
    var info = els.map(function(e){
      var mh = e.getAttribute('data-mh-'+device);
      var delta = (mh==null) ? 0 : (e.offsetHeight - parseFloat(mh)*scale);
      return { e:e, top:e.offsetTop, h:e.offsetHeight, left:e.offsetLeft, right:e.offsetLeft+e.offsetWidth, delta:delta };
    });
    // 各要素は、同じ列で自分より上にある要素たちの「ずれ」の合計だけ動く（上下どちらの向きも）
    info.forEach(function(a){
      var shift=0;
      info.forEach(function(b){
        if(b===a) return;
        var sameCol = b.left < a.right-1 && a.left < b.right-1; // 横の範囲が重なる＝同じ列
        if(sameCol && (b.top + b.h) <= a.top + 1) shift += b.delta;
      });
      if(Math.abs(shift)>2) a.e.style.transform='translateY('+shift+'px)';
    });
  });
}
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(correct);}else{window.addEventListener('load',correct);}
`.trim();

// セクションのCSS（min-height・背景・非表示）
function sectionCss(secId, site, bgByDevice, hiddenByDevice, sectionHByDevice, rules) {
  for (const device of ["pc", "sp"]) {
    const sel = `[data-sec="${secId}"]`;
    const L = [];
    const minH = Math.max(site.sections[secId].minHeight[device], sectionHByDevice[device] || 0);
    L.push(`min-height:${rem(minH)}`);
    const bg = bgByDevice[device];
    if (bg) L.push(`background:${colorCss(bg)}`);
    if (hiddenByDevice[device]) L.push("display:none");
    rules.push(`${mq[device]}{${sel}{${L.join(";")}}}`);
  }
}

// 1つのセクションを描画（HTML）。fullBleed 写真・背景写真はセクション直下、残りは cbox 内。
function renderSectionHtml(secId, site, resolved, linkResolver, readingOrder) {
  const secDef = site.sections[secId];
  const els = [...resolved.elements.values()].filter((e) => e.section === secId);
  // 読む順（PCの最終位置：上から、同じ高さなら左から）
  els.sort((a, b) => (readingOrder[a.id] ?? 0) - (readingOrder[b.id] ?? 0) || a.box.pc.x - b.box.pc.x);

  const bleed = [], inBox = [];
  for (const el of els) {
    if (el.type === "photo" && (el.box.pc?.fullBleed || el.box.sp?.fullBleed)) bleed.push(el);
    else inBox.push(el);
  }
  // 背景写真（セクション背景）
  let bgPhoto = "";
  if (secDef.background?.photo) {
    const bp = secDef.background.photo;
    const src = `${resolved.assetPrefix}assets/${resolved.assetFiles?.[bp.asset] || `${bp.asset}.svg`}`;
    const dk = bp.darken ? `<div class="darken" style="opacity:${bp.darken / 100}"></div>` : "";
    bgPhoto = `<div class="bleed sec-bg"><img src="${src}" alt="">${dk}</div>`;
  }
  const bleedHtml = bleed.map((el) => bleedPhotoHtml(el, resolved)).join("");
  const boxHtml = inBox.map((el) => (el.type === "repeater" ? repeaterHtml(el, resolved, linkResolver) : elementHtml(el, resolved, linkResolver))).join("");
  return `<section data-sec="${secId}" class="sec">${bgPhoto}${bleedHtml}<div class="cbox">${boxHtml}</div></section>`;
}

function bleedPhotoHtml(el, resolved) {
  const p = el.photo;
  const asset = resolved.assets.assets[p.asset];
  const alt = esc(p.alt || asset?.alt || "");
  const src = `${resolved.assetPrefix}assets/${resolved.assetFiles?.[p.asset] || `${p.asset}.svg`}`;
  const crop = p.crop ? `object-position:${p.crop.fx}% ${p.crop.fy}%;` : "";
  const dk = p.darken ? `<div class="darken" style="opacity:${p.darken / 100}"></div>` : "";
  // fullBleed は端末で切り替わることがある（PC=全面／SP=cbox内）→ ここは両端末とも全面として置き、
  // SP で全面でない場合は elementCss 側で cbox 幅に収める。サンプルは PC 全面・SP は w100%=全幅で同じ見え方。
  return `<div data-el="${el.id}" class="bleed" style="${p.radius ? `border-radius:${p.radius}%;overflow:hidden;` : ""}"><img src="${src}" alt="${alt}" style="${crop}">${dk}</div>`;
}

// ページ全体を描画。resolved は resolveSite + heights を持つ。
export function renderPage(resolved, pageId, opts) {
  const site = resolved.site, shop = resolved.shop;
  const page = { id: pageId, ...site.pages[pageId] };
  const depth = opts.depth;
  const assetPrefix = "../".repeat(depth);
  resolved.assetPrefix = assetPrefix;
  resolved.currentPageId = pageId;
  const pageHref = makePageHref(site.pages, depth);
  const linkResolver = makeLinkResolver(shop, site, page, pageHref);

  // ヘッダー・フッター＋ページのセクション
  const headerId = site.regions.header, footerId = site.regions.footer;
  const pageSecs = page.sections;

  // 各セクション・各端末の reflow（位置・高さ・非表示）
  const layoutByDevice = {}; // device -> { secId -> {positions,sectionH,hidden} }
  for (const device of ["pc", "sp"]) {
    layoutByDevice[device] = {};
    for (const secId of [headerId, ...pageSecs, footerId]) {
      layoutByDevice[device][secId] = layoutSection(secId, page, resolved, device, resolved.repLayouts);
    }
  }

  // 背景の交互（表示中セクションの順番。端末別）
  const bgBySec = {}; // secId -> {pc,sp}
  for (const device of ["pc", "sp"]) {
    const ordered = pageSecs.map((s) => ({ id: s, hidden: layoutByDevice[device][s].hidden, background: site.sections[s].background }));
    const map = computeSectionBackgrounds(ordered);
    for (const s of pageSecs) (bgBySec[s] ??= {})[device] = map[s];
  }
  // ヘッダー・フッターは背景を明示（alternate 対象外）
  for (const s of [headerId, footerId]) {
    bgBySec[s] = { pc: site.sections[s].background?.color || null, sp: site.sections[s].background?.color || null };
  }

  // 読む順（PC の最終 y）
  const readingOrder = {};
  for (const secId of [headerId, ...pageSecs, footerId]) {
    const L = layoutByDevice.pc[secId];
    for (const el of L.els) readingOrder[el.id] = L.positions[el.id] ?? el.box.pc.y;
  }

  // CSS ルール
  const rules = [];
  for (const secId of [headerId, ...pageSecs, footerId]) {
    const hidden = { pc: layoutByDevice.pc[secId].hidden, sp: layoutByDevice.sp[secId].hidden };
    const sh = { pc: layoutByDevice.pc[secId].sectionH, sp: layoutByDevice.sp[secId].sectionH };
    sectionCss(secId, site, bgBySec[secId], hidden, sh, rules);
    for (const el of layoutByDevice.pc[secId].els) {
      // 位置は端末別に
      elementCss(el, resolved, layoutByDevice.pc[secId].positions, "pc", rules);
      elementCss(el, resolved, layoutByDevice.sp[secId].positions, "sp", rules);
    }
  }

  // HTML
  // ヘッダーを重ねるページ（headerOverlay.pages）では、ヘッダーを透明で最初のセクションに重ねる
  const ov = site.regions.headerOverlay;
  const overlay = (ov?.pages || []).includes(pageId);
  const ovStyle = overlay && ov.textColor ? ` style="--overlay-on:${colorCss(ov.textColor)}"` : "";
  const headerHtml = `<header class="sec site-header${overlay ? " overlay" : ""}" data-sec="${headerId}"${ovStyle}>${sectionInner(headerId, site, resolved, linkResolver, readingOrder)}</header>`;
  const footerHtml = `<footer class="sec" data-sec="${footerId}">${sectionInner(footerId, site, resolved, linkResolver, readingOrder)}</footer>`;
  const mainHtml = pageSecs.map((s) => renderSectionHtml(s, site, resolved, linkResolver, readingOrder)).join("\n");

  const css = baseCss(resolved) + "\n" + rules.join("\n");
  const head = pageHead(resolved, page, assetPrefix, css);
  return `<!doctype html>
<html lang="ja">
<head>
${head}
</head>
<body data-page="${pageId}">
${headerHtml}
<main>
${mainHtml}
</main>
${footerHtml}
<script>${CLIENT_JS}</script>
</body>
</html>`;
}

// ヘッダー・フッターの中身（cbox に要素）
function sectionInner(secId, site, resolved, linkResolver, readingOrder) {
  const els = [...resolved.elements.values()].filter((e) => e.section === secId);
  els.sort((a, b) => (readingOrder[a.id] ?? 0) - (readingOrder[b.id] ?? 0) || a.box.pc.x - b.box.pc.x);
  const boxHtml = els.map((el) => (el.type === "repeater" ? repeaterHtml(el, resolved, linkResolver) : elementHtml(el, resolved, linkResolver))).join("");
  return `<div class="cbox">${boxHtml}</div>`;
}

// 404 ページ（sections が空）：ヘッダー・フッター＋定型の本文
export function render404(resolved, opts) {
  const site = resolved.site, shop = resolved.shop;
  const depth = opts.depth;
  const assetPrefix = "../".repeat(depth);
  resolved.assetPrefix = assetPrefix;
  resolved.currentPageId = "pg_404";
  const pageHref = makePageHref(site.pages, depth);
  const linkResolver = makeLinkResolver(shop, site, { id: "pg_404" }, pageHref);
  const headerId = site.regions.header, footerId = site.regions.footer;

  const rules = [];
  for (const secId of [headerId, footerId]) {
    for (const device of ["pc", "sp"]) {
      layoutSection(secId, { id: "pg_404" }, resolved, device, resolved.repLayouts);
    }
    const bg = { pc: site.sections[secId].background?.color, sp: site.sections[secId].background?.color };
    sectionCss(secId, site, bg, { pc: false, sp: false }, { pc: 0, sp: 0 }, rules);
    for (const el of [...resolved.elements.values()].filter((e) => e.section === secId)) {
      elementCss(el, resolved, {}, "pc", rules);
      elementCss(el, resolved, {}, "sp", rules);
    }
  }
  const readingOrder = {};
  const headerHtml = `<header class="sec site-header" data-sec="${headerId}">${sectionInner(headerId, site, resolved, linkResolver, readingOrder)}</header>`;
  const footerHtml = `<footer class="sec" data-sec="${footerId}">${sectionInner(footerId, site, resolved, linkResolver, readingOrder)}</footer>`;
  const home = pageHref("pg_home");
  const body = `<main><div class="notfound"><h1>ページが見つかりません</h1><p>お探しのページは移動または削除された可能性があります。</p><p style="margin-top:2rem"><a href="${esc(home)}">トップへ戻る</a></p></div></main>`;
  const css = baseCss(resolved) + "\n" + rules.join("\n");
  const head = pageHead(resolved, { id: "pg_404", seo: { title: `ページが見つかりません｜${shop.basic.name}` } }, assetPrefix, css);
  return `<!doctype html>
<html lang="ja">
<head>
${head}
</head>
<body data-page="pg_404">
${headerHtml}
${body}
${footerHtml}
</body>
</html>`;
}

function pageHead(resolved, page, assetPrefix, css) {
  const shop = resolved.shop;
  const detail = shop.basic.genre?.detail ? `${shop.basic.genre.detail}` : "";
  const autoTitle = `${shop.basic.name}${detail ? `｜${detail}` : ""}`;
  const title = page.seo?.title || autoTitle;
  const desc = page.seo?.description || shop.basic.tagline || "";
  const fontUrl = googleFontsUrl(resolved.fontIds);
  const share = page.seo?.shareImage ? `${assetPrefix}assets/${resolved.assetFiles?.[page.seo.shareImage] || `${page.seo.shareImage}.svg`}` : null;
  const lines = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${esc(title)}</title>`,
    desc && `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    desc && `<meta property="og:description" content="${esc(desc)}">`,
    share && `<meta property="og:image" content="${esc(share)}">`,
    fontUrl && `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    fontUrl && `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    fontUrl && `<link rel="stylesheet" href="${esc(fontUrl)}">`,
    `<style>${css}</style>`,
  ].filter(Boolean);
  return lines.join("\n");
}
