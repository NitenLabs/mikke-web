// 指の操作（タップ・長押し・ドラッグ・自動スクロール）
// 線：A5｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const isPhone=()=>PG.api.inputMode()==="phone";
const phoneEdit=()=>isPhone()&&PG.state.device==="sp";   // 指で編集できる
const phoneView=()=>isPhone()&&PG.state.device==="pc";   // §3.2.9 PC の見え方＝見るだけ
const TAP_MOVE=10, DRAG_MOVE=6, LP_MS=500, DTAP_MS=300, DTAP_MOVE=30, EDGE=48, EDGE_MAXV=900;
let tg=null, lastTap=null, lpTimer=null, autoRAF=null, autoLast=0;
function clearLP(){ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } }
function stopAuto(){ if(autoRAF){ clearInterval(autoRAF); autoRAF=null; } }
function partUnder(e){ let r=elFrom(e.target); if(!r){ const sh=PG.smallHit(e.clientX,e.clientY); if(sh) r=sh; } return r; }
// スクロール補正：ドラッグ中にページが動いた分を足して、部品を指に付いていかせる（§3.2.3）
function dragClient(){ return { x:tg.cx, y:tg.cy + (window.scrollY - tg.scroll0) }; }

// F43 (x,y) が、つまみの持ち主（forId）でないほかの部品の文字（字の並んでいる所）の上なら、その部品の ID
function a5OtherTextPartAt(x,y,forId){ const fc=forId&&PG.canonId(forId);
  for(const el of document.elementsFromPoint(x,y)){ if(el.closest&&el.closest("[data-handle]")) continue; const n=el.closest&&el.closest("#sectionwrap [data-el]"); if(!n) continue;
    const raw=n.getAttribute("data-el"); if(!raw||PG.canonId(raw)===fc) return null;
    const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT); let t; while((t=w.nextNode())){ if(!t.nodeValue.trim()) continue; const r=document.createRange(); r.selectNodeContents(t);
      for(const q of r.getClientRects()) if(x>=q.left&&x<=q.right&&y>=q.top&&y<=q.bottom) return raw; }
    return null; }
  return null; }
function onPhoneDown(e){
  if(tg){ end1stOp(); return; }   // §4.7（試験台16）2本目の指：1本目の操作を今の位置で終える。以降の2本指はブラウザのピンチに任せる
  if(PG.state.editing && e.target.closest && e.target.closest("[contenteditable]")) return;   // 書き換え中の文字はブラウザに任せる（§3.2.4/§3.2.5）
  if(phoneView()){ return; }   // §3.2.9 見るだけ（なぞればブラウザがスクロール）
  const hdir=e.target.getAttribute&&e.target.getAttribute("data-handle");
  const a5Other=hdir?a5OtherTextPartAt(e.clientX,e.clientY,e.target.getAttribute("data-handle-for")):null;   // F43 つまみがほかの部品の文字にかぶる所は、その部品を選ぶ方を優先
  if(hdir&&!a5Other){ const forId=e.target.getAttribute("data-handle-for"); if(PG.beginResize(forId,hdir,e.clientX,e.clientY)){ tg={kind:"resize",sx:e.clientX,sy:e.clientY,cx:e.clientX,cy:e.clientY,scroll0:window.scrollY,moved:false}; e.preventDefault(); startAuto(); } return; }
  if(PG.state.editing) PG.commitEdit();
  const rawId=a5Other||partUnder(e); const id=rawId?PG.canonId(rawId):null; const grp=rawId?PG.groupOf(rawId):null;
  const selKey=grp?grp:id; const selStart=!!(selKey&&PG.state.selected.has(selKey));
  tg={kind:"pending",sx:e.clientX,sy:e.clientY,cx:e.clientX,cy:e.clientY,scroll0:window.scrollY,rawId:rawId,id:id,grp:grp,moved:false,selStart:selStart,downEl:e.target};
  clearLP(); lpTimer=setTimeout(onLongPress,LP_MS);
  if(selStart&&rawId) e.preventDefault();   // 選んでいる部品＝指で動かす＝ブラウザのスクロールに取られない
}

function onLongPress(){
  lpTimer=null; if(!tg||tg.moved) return;
  const rawId=tg.rawId, id=tg.id, grp=tg.grp, sel=PG.state.selected;
  if(rawId){ if(!(sel.has(id)||(grp&&sel.has(grp)))){ if(grp) PG.selectOnly(grp); else PG.selectOnly(id); } tg.kind="longpressed"; showFmenu(); }   // §3.2.4 選んでいなければ選ぶ・選んでいればそのまま→箱
  else { const host=tg.downEl.closest&&tg.downEl.closest("#sectionwrap .host"); const sec=host&&host.id.replace("host_",""); if(sec){ PG.selectSection(sec); tg.kind="longpressed-sec"; let ty=tg.cy-60; if(ty<4) ty=tg.cy+10; showSectionMenu(sec,tg.cx,ty); } }   // §3.2.6 セクションの箱は指の60上
}

function onPhoneMove(e){
  if(!tg) return; tg.cx=e.clientX; tg.cy=e.clientY;
  const dist=Math.hypot(e.clientX-tg.sx,e.clientY-tg.sy);
  if(!tg.moved&&dist>TAP_MOVE){ tg.moved=true; clearLP(); }
  if(tg.kind==="resize"){ e.preventDefault(); const c=dragClient(); PG.resizeMove(c.x,c.y,false); return; }
  if(tg.kind==="drag"){ e.preventDefault(); const c=dragClient(); PG.dragMove(c.x,c.y,false); return; }
  if((tg.kind==="pending"&&tg.selStart)||tg.kind==="longpressed"){   // §3.2.1 選んでいる部品を6以上なぞる→動かす
    if(dist>DRAG_MOVE&&PG.beginDrag(tg.sx,tg.sy)){ tg.kind="drag"; fmenu.classList.remove("on"); e.preventDefault(); const c=dragClient(); PG.dragMove(c.x,c.y,false); startAuto(); }
  }
  // それ以外（選んでいない所）は preventDefault しない＝ブラウザがスクロール
}

function onPhoneUp(e){
  if(!tg) return; const t=tg; clearLP(); stopAuto();
  if(t.kind==="resize"){ PG.endResize(); tg=null; showFmenu(); return; }
  if(t.kind==="drag"){ PG.endDrag(); tg=null; showFmenu(); return; }   // §3.2.6 動かした後に箱
  if(t.kind==="longpressed"||t.kind==="longpressed-sec"){ tg=null; return; }   // 箱は出したまま
  tg=null; if(t.moved) return;   // 少し動いた＝スクロール寄り→何もしない
  onTap(t,e);
}

function onTap(t,e){
  const now=performance.now();
  if(lastTap&&(now-lastTap.t)<=DTAP_MS&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<=DTAP_MOVE){   // §3.1 ダブルタップ＝書き換え/見せる範囲
    lastTap=null; const rawId=t.rawId;
    if(rawId){ const c=PG.canonId(rawId); if(PG.isText(c)){ PG.startEdit(c); return; } if(/^F_p|photo/.test(rawId)){ enterCrop(rawId); return; } }
  }
  lastTap={t:now,x:e.clientX,y:e.clientY};
  fmenu.classList.remove("on");   // §3.2.6 タップで選んだだけでは箱を出さない
  const rawId=t.rawId; if(!rawId){ PG.clearSel(); return; }   // 背景タップ＝選ぶのをやめる（セクションは選ばない）
  const id=PG.canonId(rawId), grp=t.grp;
  if(grp){ if(!PG.state.selected.has(grp)) PG.selectOnly(grp); else PG.selectMany([rawId]); return; }   // §3.2.2 1回目全体・2回目中の1件
  if(!PG.isDraggable(id)){ PG.clearSel(); return; }
  PG.selectOnly(id);
}

// §3.2.3 画面の端での自動スクロール（ドラッグ・大きさ変えの間）。端に近いほど速く、最大 900/s。部品は指に付いていく。
function startAuto(){ if(autoRAF) return; autoLast=performance.now();
  autoRAF=setInterval(()=>{ if(!tg||(tg.kind!=="drag"&&tg.kind!=="resize")){ stopAuto(); return; }
    const now=performance.now(); const dt=Math.min(0.1,(now-autoLast)/1000); autoLast=now;   // 実経過時間で速さを出す（setInterval の間隔は一定でない）
    // §4.6（試験台16）端は「見えている範囲」で測る。§2.6 下の端は下の並び(#pbar)の上端
    const vvv=window.visualViewport; const vtop=vvv?vvv.offsetTop:0; let vbot=vvv?(vvv.offsetTop+vvv.height):window.innerHeight;
    if(isPhone() && pbar && pbar.style.display!=="none"){ const br=pbar.getBoundingClientRect(); if(br.height) vbot=Math.min(vbot, br.top); }
    let v=0;
    if(tg.cy<vtop+EDGE) v=-EDGE_MAXV*(1-(tg.cy-vtop)/EDGE); else if(tg.cy>vbot-EDGE) v=EDGE_MAXV*(1-(vbot-tg.cy)/EDGE);
    if(!v) return;
    window.scrollBy(0,v*dt);
    const c=dragClient(); if(tg.kind==="drag") PG.dragMove(c.x,c.y,false); else PG.resizeMove(c.x,c.y,false);
  },16);
}

// §3.2.7 つまみの押せる範囲（44×44・data-hit）。見た目のつまみ（.rz-handle）に重ねる。内側に入るのは部品の幅・高さの1/4まで。
function addHandleHits(){
  document.querySelectorAll(".hit-handle").forEach((n)=>n.remove());
  if(!phoneEdit()) return;
  const sel=[...PG.state.selected]; if(sel.length!==1) return; const id=sel[0]; const g=PG.api.geometry()[id]; if(!g) return;
  const sc=PG.getScale(); const HIT=44/sc;
  for(const h of document.querySelectorAll(".rz-handle")){
    const dir=h.getAttribute("data-handle"); if(h.getAttribute("data-handle-for")!==id) continue;
    const cx=parseFloat(h.style.left), cy=parseFloat(h.style.top);
    const inX=Math.min(HIT/2,g.w/4), inY=Math.min(HIT/2,g.h/4);
    let left,top;
    if(/e/.test(dir)) left=cx-inX; else if(/w/.test(dir)) left=cx-(HIT-inX); else left=cx-HIT/2;
    if(/s/.test(dir)) top=cy-inY; else if(/n/.test(dir)) top=cy-(HIT-inY); else top=cy-HIT/2;
    const hit=document.createElement("div"); hit.className="hit-handle"; hit.setAttribute("data-hit","handle-"+dir); hit.setAttribute("data-handle",dir); hit.setAttribute("data-handle-for",id);
    hit.style.left=left+"px"; hit.style.top=top+"px"; hit.style.width=HIT+"px"; hit.style.height=HIT+"px";
    h.parentNode.appendChild(hit);
  }
}

window.addEventListener("pointercancel",(e)=>{ if(isPhone()&&e.pointerType==="touch"&&tg){ clearLP(); stopAuto(); if(tg.kind==="drag") PG.endDrag(); else if(tg.kind==="resize") PG.endResize(); tg=null; } });

// ====== §2-6（試験台16）スマホでの編集 第2回：下の道具・文字の道具・ピンチ・＋ ======
