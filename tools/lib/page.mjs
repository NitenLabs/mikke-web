// 芦屋みっけ Web制作：1ページ分の HTML/CSS を組み立てる（シェル＋ベースCSS＋クライアントJS）

import { computeSectionBackgrounds } from "./sections.mjs";
import { repeaterLayout, designWidth, esc, rem, pct, boxWidthPx, ratioHeightPx } from "./render.mjs";
import {
  makeLinkResolver, makePageHref, layoutSection, elementHtml, repeaterHtml, elementCss, mq, elToReflow,
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
.sec[id]{scroll-margin-top:9rem}
.cbox{position:relative;margin:0 auto}
.el{position:absolute}
/* 改行の規則を明示的に固定する（エンジンごとの既定値の違いで折り返しがゆれないように） */
.el-text{line-break:strict;word-break:normal;overflow-wrap:anywhere;white-space:normal}
.el-text .pg{display:block}
.el-text .nowrap{white-space:nowrap}
.el-text .lc{display:flex}
.el-text .lc-key{flex:none;color:var(--c-text);font-family:var(--f-heading);font-weight:700}
.el-text .lc-val{flex:1}
/* ピルの「›」を右端（右から24・縦中央）へ。本文は中央のまま（A9-16） */
.el-text .pill-arrow{position:absolute;right:2.4rem;top:50%;transform:translateY(-50%)}
.el-photo{overflow:hidden}
.el-photo img{width:100%;height:100%;object-fit:cover}
.bleed{position:absolute;z-index:0;overflow:hidden}
.bleed img{width:100%;height:100%;object-fit:cover}
.darken{position:absolute;inset:0;background:#000;pointer-events:none}
.el-embed iframe{width:100%;height:100%;border:0;display:block}
.el-embed.map-gray iframe{filter:grayscale(1) contrast(.9)}
.el-shape-line{height:1px}
.el-rep{position:absolute}
.rep-card,.rep-head{position:absolute}
/* 開閉式（accordion）：details/summary。JSなしでも開閉でき、開くと下がずれる（reflow） */
/* FAQ の罫線は表と同じ line（#B0B0B0）。行の高さ74・「Q.」・開閉の印「∨」（SPEC 4.7 / A10） */
.el-acc .acc-item{border-top:1px solid var(--c-line)}
.el-acc .acc-item:last-child{border-bottom:1px solid var(--c-line)}
.el-acc summary{list-style:none;cursor:pointer;padding:2.4rem 0;position:relative;font-family:var(--f-heading);font-weight:700;color:var(--c-text);line-height:1.4;letter-spacing:0}
.el-acc summary::-webkit-details-marker{display:none}
.el-acc .acc-q{position:relative;padding-left:2.9rem}
.el-acc .acc-q::before{content:"Q.";position:absolute;left:0;top:0;font-family:var(--f-heading);font-weight:700}
/* 開閉の印：参照元の実測（幅12・高さ6・線2px・#333・右から24・縦中央）の下向きシェブロンを図形で描く（A10-6） */
.el-acc summary::after{content:"";position:absolute;right:2.4rem;top:50%;width:1.2rem;height:.6rem;margin-top:-.3rem;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='6' viewBox='0 0 12 6'%3E%3Cpath d='M1 1L6 5L11 1' fill='none' stroke='%23333333' stroke-width='2'/%3E%3C/svg%3E") center/contain no-repeat;transition:transform .2s}
.el-acc details[open] summary::after{transform:rotate(180deg)}
.el-acc .acc-a{padding:0 0 2.4rem;font-family:var(--f-body);color:var(--c-text);line-height:1.8}
.el-acc details:not([open]) .acc-a{display:none}
${mq.pc}{.el-acc summary{font-size:1.8rem}.el-acc .acc-a{font-size:1.6rem}}
${mq.sp}{.el-acc summary{font-size:1.6rem}.el-acc .acc-a{font-size:1.4rem}}
.rep-card{overflow:hidden}
/* ヘッダー：常に sticky。重ねるページでは最初は透明（FVに重ねる）、スクロールで通常の面に切り替える */
.site-header{position:sticky;top:0;z-index:1000;transition:background .2s}
.site-header.overlay{background:transparent}
.site-header.overlay.scrolled{background:var(--c-background)}
.site-header.overlay.scrolled .el-text,.site-header.overlay.scrolled .el-nav a,.site-header.overlay.scrolled .nav-sp summary{color:var(--c-text)}
.site-header.overlay.scrolled .el-shape{background:var(--c-line)!important;opacity:1!important}
.el-nav .nav-row{display:flex;gap:2.4rem;justify-content:flex-end;align-items:center;height:100%;font-family:var(--nav-font,inherit)}
.el-nav a{text-decoration:none;color:var(--nav,inherit);white-space:nowrap}
/* ナビの文字（SPEC 2章・A2-12/A2-18）：明朝 16／行送り22.4／w600。フッターは SP 14 */
.el-nav .nav-row a{font-family:var(--nav-font,var(--f-heading));font-weight:600;line-height:1.4}
.el-nav a[aria-current]{color:var(--nav-active,var(--nav,inherit))}
.el-nav .nav-sp{height:100%;position:relative;z-index:1002}
.el-nav .nav-sp summary{list-style:none;cursor:pointer;font-size:2.2rem;line-height:1;text-align:right;color:var(--nav,inherit)}
.el-nav .nav-sp summary::-webkit-details-marker{display:none}
/* SP のメニューを開いたら画面全体を deep(#222) で覆い、項目を 20px/行間56 で縦に並べる */
.el-nav .nav-menu{position:fixed;inset:0;background:var(--c-deep);display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:1001}
.el-nav .nav-menu a{font-size:2rem;line-height:5.6rem;color:var(--c-onDark)}
.el-nav .nav-sp[open] summary{position:fixed;top:1.2rem;right:2rem;color:var(--c-onDark);z-index:1003}
.notfound{max-width:60rem;margin:0 auto;padding:12rem 2rem;text-align:center}
.notfound h1{font-family:var(--f-heading);margin-bottom:2rem}
/* フォーム（送信処理は公開時。今はボタンで「サンプルのため送信されません」） */
.el-form{height:auto;display:flex;flex-direction:column;gap:1.4rem;text-align:left}
.el-form .ff{display:flex;flex-direction:column;gap:.4rem}
.el-form .flabel{font-size:1.3rem;color:var(--c-onDark)}
.el-form .freq{font-size:1.1rem;color:var(--c-onDark);opacity:.75;border:1px solid currentColor;padding:0 .4em;border-radius:2px;margin-left:.4em}
.el-form input,.el-form textarea{width:100%;font:inherit;font-size:1.5rem;padding:.9rem 1rem;border:1px solid var(--c-onDark);background:rgba(247,243,236,.94);color:var(--c-text);border-radius:2px}
.el-form textarea{resize:vertical}
.el-form .fprivacy{font-size:1.2rem;color:var(--c-onDark)}
.el-form .fprivacy a{color:var(--c-onDark);text-decoration:underline}
.el-form .fsubmit{align-self:center;min-width:20rem;height:4.8rem;border:0;border-radius:999px;background:var(--c-background);color:var(--c-accent);font:inherit;font-size:1.6rem;cursor:pointer}
.el-form .fnote{text-align:center;font-size:1.3rem;color:var(--c-onDark)}
.privacy{max-width:72rem;margin:0 auto;padding:11rem 2rem 8rem}
.privacy h1{font-family:var(--f-heading);font-size:2.6rem;margin-bottom:2rem}
.privacy h2{font-family:var(--f-heading);font-size:1.8rem;margin:2.4rem 0 .8rem}
.privacy p{margin-bottom:1rem;font-size:1.5rem}
/* ヘッダーを重ねるページ：ヘッダーの高さぶん負のマージンで、FV をページ y0 から始める（重ねる・A3-1） */
${mq.pc}{.el-nav .nav-row a{font-size:1.6rem}.site-header.overlay{margin-bottom:-8.8rem}}
${mq.sp}{.el-nav .nav-row a{font-size:1.4rem}.site-header.overlay{margin-bottom:-8rem}}
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
// (0) ヘッダーを重ねるページ：スクロールしたら通常の面（背景あり）に切り替える
(function(){
  var h=document.querySelector('.site-header.overlay'); if(!h) return;
  var on=function(){ h.classList.toggle('scrolled', window.scrollY>40); };
  window.addEventListener('scroll',on,{passive:true}); on();
})();
// (3) フォーム：送信処理は公開時に作る。今は送信すると「サンプルのため送信されません」と出す
document.querySelectorAll('.el-form').forEach(function(f){
  f.addEventListener('submit',function(e){ e.preventDefault(); var n=f.querySelector('.fnote'); if(n) n.hidden=false; });
});
// (4) 開閉式（accordion）：開閉したら reflow.mjs の規則で下の要素をずらし、セクションを伸縮させる
(function(){
  var data=document.getElementById('__accreflow'); if(!data) return;
  var SECS; try{ SECS=JSON.parse(data.textContent); }catch(e){ return; }
  // reflow.mjs と同じ規則（インライン版）
  function reflowJS(els, sectionMinH){
    var EPS=1, END={id:"__end",x:0,w:100,y:sectionMinH,h:0,actualH:0}, all=els.concat([END]);
    var bottom=function(e){return e.y+e.h;};
    var overlapX=function(a,b){return a.x<b.x+b.w-0.01&&b.x<a.x+a.w-0.01;};
    var above=function(a,b){return a!==b&&bottom(a)<=b.y+EPS&&overlapX(a,b);};
    var contains=function(q,p){return q!==p&&overlapX(q,p)&&q.y<=p.y+EPS&&bottom(q)>=bottom(p)-EPS;};
    var preds=new Map(all.map(function(b){return [b, els.filter(function(a){return above(a,b);})];}));
    var direct=new Map(all.map(function(b){var ps=preds.get(b);return [b, ps.filter(function(p){return !ps.some(function(q){return q!==p&&above(p,q);});})];}));
    var succ=new Map(els.map(function(a){return [a, all.filter(function(b){return direct.get(b).indexOf(a)>=0;})];}));
    var delta=new Map(els.map(function(e){ if(!e.hidden) return [e, Math.max(0,e.actualH-e.h)]; var gaps=succ.get(e).map(function(b){return b.y-bottom(e);}); var gb=gaps.length?Math.max(0,Math.min.apply(null,gaps)):0; return [e,-(e.h+gb)]; }));
    var shift=new Map();
    var newBottom=function(e){return e.y+shift.get(e)+e.h+delta.get(e);};
    var order=all.slice().sort(function(a,b){return a.y-b.y||a.x-b.x;});
    order.forEach(function(b){ var ps=preds.get(b); var contribs=direct.get(b).map(function(p){ var qs=ps.filter(function(q){return contains(q,p);}); if(!qs.length) return shift.get(p)+delta.get(p); var q=qs.reduce(function(m,x){return bottom(x)>bottom(m)?x:m;}); var base=shift.get(q)+delta.get(q); return p.hidden?base:base+Math.max(0,newBottom(p)-newBottom(q)); }); shift.set(b, contribs.length?Math.max.apply(null,contribs):0); });
    var y={}; els.forEach(function(e){ y[e.id]=e.y+shift.get(e); });
    var cb=Math.max.apply(null,[0].concat(els.filter(function(e){return !e.hidden;}).map(function(e){return y[e.id]+Math.max(e.h,e.actualH);})));
    return { y:y, sectionH:Math.max(sectionMinH+shift.get(END), cb) };
  }
  function apply(){
    var device=innerWidth<768?'sp':'pc';
    var scale=parseFloat(getComputedStyle(document.documentElement).fontSize)/10;
    SECS.forEach(function(entry){
      var secEl=document.querySelector('[data-sec="'+entry.sec+'"]'); if(!secEl) return;
      var conf=entry[device];
      var inputs=conf.els.map(function(e){
        var actualH=e.a;
        if(e.acc){ var a=secEl.querySelector('[data-el="'+e.el+'"]'); if(a) actualH=a.offsetHeight/scale; }
        return {id:e.el,x:e.x,w:e.w,y:e.y,h:e.h,actualH:actualH,hidden:false,decorative:!!e.dec};
      });
      var r=reflowJS(inputs, conf.minH);
      conf.els.forEach(function(e){
        if(e.acc) return; var node=secEl.querySelector('[data-el="'+e.el+'"]'); if(!node) return;
        var dy=(r.y[e.el]-e.baseY)*scale;
        node.style.transform = Math.abs(dy)>0.5 ? 'translateY('+dy+'px)' : '';
      });
      secEl.style.minHeight=(r.sectionH/10)+'rem';
    });
  }
  document.querySelectorAll('.el-acc details').forEach(function(d){ d.addEventListener('toggle', apply); });
})();
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
  const idAttr = secDef.anchor ? ` id="${secDef.anchor}"` : "";
  return `<section${idAttr} data-sec="${secId}" class="sec">${bgPhoto}${bleedHtml}<div class="cbox">${boxHtml}</div></section>`;
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

  // 開閉式（accordion）を含むセクションの reflow 入力を焼く（開閉時のクライアントJSが使う）
  const accSecs = [];
  for (const secId of pageSecs) {
    const els = layoutByDevice.pc[secId].els;
    if (!els.some((e) => e.type === "repeater" && e.repeater.display.mode === "accordion")) continue;
    const entry = { sec: secId };
    for (const device of ["pc", "sp"]) {
      const L = layoutByDevice[device][secId];
      entry[device] = {
        minH: site.sections[secId].minHeight[device],
        els: L.els.map((e) => {
          const ri = elToReflow(e, device, resolved, resolved.repLayouts);
          return { el: e.id, x: ri.x, w: ri.w, y: ri.y, h: ri.h, a: ri.actualH, dec: ri.decorative ? 1 : 0, acc: e.type === "repeater" && e.repeater.display.mode === "accordion" ? 1 : 0, baseY: L.positions[e.id] ?? e.box[device].y };
        }),
      };
    }
    accSecs.push(entry);
  }
  const accScript = accSecs.length ? `<script type="application/json" id="__accreflow">${JSON.stringify(accSecs)}</script>` : "";

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
${accScript}
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

// プライバシーポリシーのページ（kind=privacy）。中身は自動（DATA_SPEC 6章）。
export function renderPrivacy(resolved, pageId, opts) {
  const site = resolved.site, shop = resolved.shop;
  const depth = opts.depth;
  const assetPrefix = "../".repeat(depth);
  resolved.assetPrefix = assetPrefix;
  resolved.currentPageId = pageId;
  const pageHref = makePageHref(site.pages, depth);
  const linkResolver = makeLinkResolver(shop, site, { id: pageId }, pageHref);
  const headerId = site.regions.header, footerId = site.regions.footer;

  const rules = [];
  for (const secId of [headerId, footerId]) {
    for (const device of ["pc", "sp"]) layoutSection(secId, { id: pageId }, resolved, device, resolved.repLayouts);
    const bg = { pc: site.sections[secId].background?.color, sp: site.sections[secId].background?.color };
    sectionCss(secId, site, bg, { pc: false, sp: false }, { pc: 0, sp: 0 }, rules);
    for (const el of [...resolved.elements.values()].filter((e) => e.section === secId)) {
      elementCss(el, resolved, {}, "pc", rules);
      elementCss(el, resolved, {}, "sp", rules);
    }
  }
  const headerHtml = `<header class="sec site-header" data-sec="${headerId}">${sectionInner(headerId, site, resolved, linkResolver, {})}</header>`;
  const footerHtml = `<footer class="sec" data-sec="${footerId}">${sectionInner(footerId, site, resolved, linkResolver, {})}</footer>`;
  const name = esc(shop.basic.name);
  const body = `<main><div class="privacy"><h1>プライバシーポリシー</h1>
<p>${name}（以下「当店」）は、お問い合わせフォーム等でお預かりする個人情報を、以下のとおり取り扱います。</p>
<h2>取得する情報</h2><p>お名前、メールアドレス、電話番号、お問い合わせ内容など、フォームにご入力いただいた情報。</p>
<h2>利用目的</h2><p>お問い合わせやご予約への対応、およびそのための連絡にのみ利用します。</p>
<h2>第三者への提供</h2><p>法令に基づく場合を除き、ご本人の同意なく第三者へ提供しません。</p>
<h2>お問い合わせ</h2><p>個人情報の開示・訂正・削除のご希望は、当店までご連絡ください。</p>
<p style="margin-top:2rem;color:var(--c-textMuted)">※これはサンプルの雛形です。公開前に実際の運用に合わせて改訂してください。</p></div></main>`;
  const css = baseCss(resolved) + "\n" + rules.join("\n");
  const head = pageHead(resolved, { id: pageId, seo: { title: `プライバシーポリシー｜${shop.basic.name}` } }, assetPrefix, css);
  return `<!doctype html>
<html lang="ja">
<head>
${head}
</head>
<body data-page="${pageId}">
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
