// リンクの札（マウスを乗せると出る）
// 線：A1｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
let chipTimer=null, chipHideTimer=null, chipTarget=null;
function chipForPart(span){ const partEl=span.closest("[data-el]"); if(!partEl) return null; const part=partEl.getAttribute("data-el"); let lk=null; try{ lk=JSON.parse(span.getAttribute("data-lk")); }catch(_){}
  if(!lk) return null; const runs=PG.linksApi(part).runs; const m=runs.find(r=>sameLink(r.link,lk)&&r.text===span.textContent) || runs.find(r=>sameLink(r.link,lk)); if(!m) return null;
  return { kind:"part", part, s:m.s, e:m.e, link:m.link, label:m.label, href:m.href, newTab:m.newTab, rect:span.getBoundingClientRect() }; }
function chipForElement(el){ const id=el.getAttribute("data-el"); if(!PG.canElementLink(id)) return null; const info=PG.elementLinkApi(id); if(!info) return null; return { kind:"element", el:id, link:info.link, label:info.label, href:info.href, newTab:info.newTab, rect:el.getBoundingClientRect() }; }
function showChip(info){ chipTarget=info; linkChip.innerHTML="";
  const nm=document.createElement("span"); nm.className="nm"; nm.textContent=info.label; linkChip.appendChild(nm);
  const mk=(label,fn,attr)=>{ const b=document.createElement("button"); b.textContent=label; if(attr) b.setAttribute(attr,""); b.onmousedown=(e)=>e.preventDefault(); b.onclick=(e)=>{ e.stopPropagation(); fn(); }; linkChip.appendChild(b); };
  mk("開いて確かめる",()=>{ window.open(info.href, info.newTab?"_blank":"_self"); },"data-link-open");
  mk("変える",()=>{ linkChip.classList.remove("on"); if(info.kind==="part"){ openLinkPanelPart(info.part,info.s,info.e,info.rect); } else { openLinkPanelElement(info.el,info.rect); } },"data-link-change");
  mk("外す",()=>{ linkChip.classList.remove("on"); if(info.kind==="part"){ PG.setPartLinkCommitted(info.part,info.s,info.e,null); } else { PG.removeElementLink(info.el); } },"data-link-remove");
  linkChip.classList.add("on");
  const vw=innerWidth, vh=innerHeight; const cw=linkChip.offsetWidth||200, ch=linkChip.offsetHeight||32;
  let left=Math.min(info.rect.left, vw-8-cw); left=Math.max(8,left); let top=info.rect.bottom+4; if(top+ch>vh-8) top=info.rect.top-ch-4;
  linkChip.style.left=Math.round(left)+"px"; linkChip.style.top=Math.round(top)+"px"; }
function scheduleChip(info){ clearTimeout(chipHideTimer); if(chipTarget && sameLink(chipTarget.link,info.link) && chipTarget.rect && Math.abs(chipTarget.rect.left-info.rect.left)<2) return; clearTimeout(chipTimer); chipTimer=setTimeout(()=>showChip(info),400); }
function hideChipSoon(){ clearTimeout(chipTimer); clearTimeout(chipHideTimer); chipHideTimer=setTimeout(()=>{ linkChip.classList.remove("on"); chipTarget=null; },300); }
const chipStage=document.getElementById("stage");
chipStage.addEventListener("mouseover",(e)=>{ if(isPhone()||PG.state.editing) return; const span=e.target.closest&&e.target.closest("[data-lk]"); if(span){ const info=chipForPart(span); if(info){ scheduleChip(info); return; } }
  const el=e.target.closest&&e.target.closest('[data-el]'); if(el){ const info=chipForElement(el); if(info){ scheduleChip(info); return; } } });
chipStage.addEventListener("mouseout",(e)=>{ if(isPhone())return; const toChip=e.relatedTarget&&linkChip.contains(e.relatedTarget); if(!toChip) hideChipSoon(); });
linkChip.addEventListener("mouseenter",()=>{ clearTimeout(chipHideTimer); });
linkChip.addEventListener("mouseleave",()=>hideChipSoon());
// 選んだ写真は「写真を変える」ボタンが覆うので、その上に乗ってもリンクの札を出す（§2.4）
const chipPcb=document.getElementById("photoChangeBtn");
chipPcb.addEventListener("mouseenter",()=>{ if(isPhone()||PG.state.editing)return; const id=chipPcb._for; if(id&&PG.canElementLink(id)){ const el=PG.elNode(id); if(el){ const info=chipForElement(el); if(info) scheduleChip(info); } } });
chipPcb.addEventListener("mouseleave",(e)=>{ if(!(e.relatedTarget&&linkChip.contains(e.relatedTarget))) hideChipSoon(); });

// 浮遊メニュー
