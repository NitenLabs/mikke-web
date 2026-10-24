// 配置（揃え・整列）のメニュー
// 線：A2｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const alignTools=document.getElementById("alignTools");
const tAlign=document.getElementById("tAlign");
const alignMenu=document.getElementById("alignMenu");
// 8つ（PowerPoint の「配置 ▸」と同じ並び）。アイコンは簡単な絵（箱の中の棒）
const ALIGN_ITEMS=[
  {k:"left",   n:"左揃え",      ic:{l:1,t:2,w:2,h:10}},
  {k:"hcenter",n:"左右中央揃え",ic:{l:8,t:2,w:2,h:10}},
  {k:"right",  n:"右揃え",      ic:{l:15,t:2,w:2,h:10}},
  {div:1},
  {k:"top",    n:"上揃え",      ic:{l:2,t:1,w:14,h:2}},
  {k:"vcenter",n:"上下中央揃え",ic:{l:2,t:6,w:14,h:2}},
  {k:"bottom", n:"下揃え",      ic:{l:2,t:11,w:14,h:2}},
  {div:1},
  {k:"hdist",  n:"左右に整列",  ic:{dist:"h"}, need3:1},
  {k:"vdist",  n:"上下に整列",  ic:{dist:"v"}, need3:1},
  // P24 前面・背面（右クリックと同じ4つ）。重なる相手があるときだけ押せる
  {div:1,z:1},
  {k:"front",    n:"最前面へ移動", z:"bringToFront",  ic:{l:3,t:3,w:12,h:8}},
  {k:"forward",  n:"前面へ移動",   z:"bringForward",  ic:{l:5,t:4,w:8,h:6}},
  {k:"backward", n:"背面へ移動",   z:"sendBackward",  ic:{l:5,t:4,w:8,h:6}},
  {k:"back",     n:"最背面へ移動", z:"sendToBack",    ic:{l:3,t:3,w:12,h:8}},
];
function a2CanZ(){ const sel=[...PG.state.selected]; return sel.length===1 && PG.hasOverlapPartner(); }
function alignIcon(ic){ const d=document.createElement("span"); d.className="aicon";
  if(ic.dist){ for(const x of (ic.dist==="h"?[1,8,15]:null)||[]){ const i=document.createElement("i"); i.style.cssText="left:"+x+"px;top:2px;width:2px;height:10px"; d.appendChild(i); }
    if(ic.dist==="v") for(const y of [1,6,11]){ const i=document.createElement("i"); i.style.cssText="top:"+y+"px;left:2px;width:14px;height:2px"; d.appendChild(i); } }
  else { const i=document.createElement("i"); i.style.cssText="left:"+ic.l+"px;top:"+ic.t+"px;width:"+ic.w+"px;height:"+ic.h+"px"; d.appendChild(i); }
  return d; }
function buildAlignMenu(){ alignMenu.innerHTML=""; const c=PG.canAlign();
  for(const it of ALIGN_ITEMS){ if(it.div){ const d=document.createElement("div"); d.className="adiv"; alignMenu.appendChild(d); continue; }
    if(it.z){ const b=document.createElement("button"); b.className="ai"; b.setAttribute("data-z-item",it.k); b.appendChild(alignIcon(it.ic)); const s=document.createElement("span"); s.textContent=it.n; b.appendChild(s);
      if(!a2CanZ()) b.disabled=true; b.onmousedown=(e)=>e.preventDefault();
      if(!b.disabled) b.onclick=(e)=>{ e.stopPropagation(); PG[it.z](); alignMenu.classList.remove("on"); };
      alignMenu.appendChild(b); continue; }
    const b=document.createElement("button"); b.className="ai"; b.setAttribute("data-align-item",it.k); b.appendChild(alignIcon(it.ic)); const s=document.createElement("span"); s.textContent=it.n; b.appendChild(s);
    const enabled=c.enabled && (!it.need3 || c.distribute); if(!enabled) b.disabled=true;
    b.onmousedown=(e)=>e.preventDefault();
    if(enabled) b.onclick=(e)=>{ e.stopPropagation(); PG.align(it.k); alignMenu.classList.remove("on"); };
    alignMenu.appendChild(b); } }
function closeAlignMenu(){ alignMenu.classList.remove("on"); }
function alignSelected(){ const sel=[...PG.state.selected]; return sel.length>=1 && !PG.state.editing && !isPhone() && sel.every(id=>PG.isDraggable(id)||PG.REPEAT.test(id)); }
function updateAlignTools(){ const show=alignSelected(); alignTools.style.display=show?"inline-flex":"none"; if(!show){ closeAlignMenu(); return; } tAlign.disabled=!PG.canAlign().enabled&&!a2CanZ(); if(tAlign.disabled) closeAlignMenu(); }
tAlign.onmousedown=(e)=>e.preventDefault();
tAlign.onclick=(e)=>{ e.stopPropagation(); if(tAlign.disabled) return; if(alignMenu.classList.contains("on")){ closeAlignMenu(); return; } buildAlignMenu(); const r=e.currentTarget.getBoundingClientRect(); const vw=innerWidth; alignMenu.classList.add("on"); const pw=alignMenu.offsetWidth||180; let left=Math.min(r.left, vw-8-pw); left=Math.max(8,left); alignMenu.style.left=Math.round(left)+"px"; alignMenu.style.top=(r.bottom+4)+"px"; };
window.addEventListener("pointerdown",(e)=>{ if(alignMenu.classList.contains("on")&&!alignMenu.contains(e.target)&&!tAlign.contains(e.target)&&!(e.target.closest&&e.target.closest("#moreMenu"))) closeAlignMenu(); },true);
// §27 Esc 用：開いているメニュー・箱を閉じる（capture で閉じる 公開/プレビュー/履歴/書体/列/明るさ は defaultPrevented で別処理）
