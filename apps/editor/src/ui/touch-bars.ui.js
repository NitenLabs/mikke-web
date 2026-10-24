// スマホの帯・文字の帯・その他・重ねる物の位置合わせ
// 線：A5｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const pbar=document.getElementById("pbar");
const pmore=document.getElementById("pmore");
const ptext=document.getElementById("ptext");
const pSize=document.getElementById("pSize");
const pColor=document.getElementById("pColor");
const PHONE_COLORS=[["文字","#333333"],["うすい","#7B7B7B"],["赤","#D00000"],["青","#1456C8"],["緑","#1A8A3B"],["白","#FFFFFF"]];
function getVS(){ return window.visualViewport?window.visualViewport.scale:1; }
function vvGeom(){ const vv=window.visualViewport; return { s:getVS(), ox:vv?vv.offsetLeft:0, oy:vv?vv.offsetTop:0, vw:vv?vv.width:window.innerWidth, vh:vv?vv.height:window.innerHeight }; }
function editingNow(){ return !!PG.state.editing; }

// §4.7 2本目の指などで1本目の操作を今の位置で終える（箱は出さない・長押しは取り消す）
function end1stOp(){ clearLP(); stopAuto(); if(tg){ if(tg.kind==="drag") PG.endDrag(); else if(tg.kind==="resize") PG.endResize(); else if(tg.kind==="longpressed"||tg.kind==="longpressed-sec") fmenu.classList.remove("on"); } tg=null; }

// §1 X5：長押しが決まった後・動かし中・大きさ変え中は touchmove を止めてスクロールさせない（部品が指からずれない）
window.addEventListener("touchmove",(e)=>{ if(!isPhone()||!tg) return; if(tg.kind==="drag"||tg.kind==="resize"||tg.kind==="longpressed"||tg.kind==="longpressed-sec"){ if(e.cancelable) e.preventDefault(); } },{passive:false});

// 見えている範囲の中に置く（左右8・ピンチ中は画面上の大きさを保つ＝scale(1/vs)）。L,T は画面上の左上
function placeFloat(el, L, T, clampV){ const g=vvGeom(); const rw=el.offsetWidth/g.s, rh=el.offsetHeight/g.s;
  const minL=g.ox+8, maxL=g.ox+g.vw-8-rw; if(L>maxL)L=maxL; if(L<minL)L=minL;
  if(clampV){ const minT=g.oy+8, maxT=g.oy+g.vh-8-rh; if(T>maxT)T=maxT; if(T<minT)T=minT; }
  el.style.left="0"; el.style.top="0"; el.style.transform="translate("+L+"px,"+T+"px) scale("+(1/g.s)+")"; }
// 下の並び・文字の道具を見えている範囲の下端に固定（画面上で同じ大きさ）
function placeBottom(el){ const g=vvGeom(); el.style.width=document.documentElement.clientWidth+"px"; el.style.left="0"; el.style.top="0"; const H=el.offsetHeight; el.style.transform="translate("+g.ox+"px,"+(g.oy+g.vh - H/g.s)+"px) scale("+(1/g.s)+")"; }
function placePbar(){ placeBottom(pbar); }
function placePtext(){ placeBottom(ptext); }
function barTopRendered(bar){ const g=vvGeom(); return g.oy+g.vh - (bar.offsetHeight/g.s); }
function placeAboveBar(el){ const g=vvGeom(); placeFloat(el, g.ox+8, barTopRendered(pbar) - (el.offsetHeight/g.s) - 6, true); }
function placeAbovePtext(el){ const g=vvGeom(); placeFloat(el, g.ox+8, barTopRendered(ptext) - (el.offsetHeight/g.s) - 6, true); }

// --- §2 下の道具の並び ---
function pbtn(label,fn,attr){ const b=document.createElement("button"); b.textContent=label; if(attr)b.setAttribute(attr,"1"); b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); fn(); }; return b; }
function buildPbar(){ pbar.innerHTML="";
  if(phoneView()){ pbar.appendChild(pbtn("スマホの編集に戻る",()=>setPhoneDevice("sp"),"data-pbar-back")); return; }   // §2.4
  pbar.appendChild(pbtn("戻す",()=>PG.undo(),"data-pbar-undo"));
  pbar.appendChild(pbtn("やり直す",()=>PG.redo(),"data-pbar-redo"));
  pbar.appendChild(pbtn("その他",()=>togglePmore(),"data-pbar-more"));
  const sp=document.createElement("span"); sp.className="sp"; pbar.appendChild(sp);   // §22 §3.4 右端に公開
  pbar.appendChild(pbtn("公開",()=>phonePublish(),"data-pbar-publish"));
}
function phonePublish(){ const st=PG.saveState(); if(st.label==="公開中と同じです") return; doPublishFlow(); }   // §22 §4.1 スマホの公開も確認の箱を通す
function setPhoneDevice(d){ pmore.classList.remove("on"); PG.setDevice(d); const sp=document.getElementById("dSP"), pc=document.getElementById("dPC"); if(d==="sp"){ sp.classList.add("on"); pc.classList.remove("on"); } else { pc.classList.add("on"); sp.classList.remove("on"); } }
function togglePmore(){ if(pmore.classList.contains("on")){ pmore.classList.remove("on"); return; } buildPmore(); pmore.classList.add("on"); placeAboveBar(pmore); }
function buildPmore(){ pmore.innerHTML="";   // §2.3 一覧の中身（上から）
  const mk=(label,fn)=>{ const b=document.createElement("button"); b.textContent=label; b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); pmore.classList.remove("on"); fn(); }; return b; };
  const st=PG.saveState(); const srow=document.createElement("div"); srow.className="pmorestat"+((st.status==="error"||st.label==="まだ公開していない変更があります")?" warn":""); srow.textContent=st.label; pmore.appendChild(srow);   // §22 §3.4 状態の文字＝その他の一番上
  pmore.appendChild(mk("履歴",()=>{ pmore.classList.remove("on"); if(historyOpen) closeHistory(); else openHistory(); }));   // §22 §3.4/§6 履歴・プレビューはその他
  pmore.appendChild(mk("プレビュー",()=>enterPreviewUI()));   // §22 §5
  pmore.appendChild(mk("お品書きを見る",()=>openMenuPanel()));   // 26b：スマホの「その他」にも入れる
  pmore.appendChild(mk("テキストを足す",()=>phoneAddText()));
  pmore.appendChild(mk("PC の見え方を見る",()=>setPhoneDevice("pc")));
  const peek=document.createElement("button"); peek.textContent="元の配置を見る"; peek.setAttribute("data-pmore-peek","1"); peek.addEventListener("pointerdown",(e)=>{ e.preventDefault(); PG.peekOn(); }); const off=()=>{ if(PG.state.peek) PG.peekOff(); }; peek.addEventListener("pointerup",off); peek.addEventListener("pointerleave",off); peek.onclick=(e)=>e.stopPropagation(); pmore.appendChild(peek);
  pmore.appendChild(mk("このページを元に戻す",()=>PG.resetScope("page",null,["pc","sp"])));
  if(DEV) pmore.appendChild(mk("制作用",()=>{ document.getElementById("studio").classList.toggle("on"); refreshStudio(); }));   // J21 ?dev=1 のときだけ
}
function phoneAddText(){ const sel=[...PG.state.selected].filter((id)=>PG.isDraggable(id)||PG.isText(id)); const anchor=sel.length?PG.canonId(sel[0]):"F_h0"; PG.addTextAt(anchor,24,"テキスト"); }

// --- §3 文字の道具（キーボードのすぐ上） ---
function selectAllEditing(){ if(!PG.state.editing) return; const n=PG.elNode(PG.state.editing.id); if(!n) return; const r=document.createRange(); r.selectNodeContents(n); const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
function buildPtext(){ ptext.innerHTML="";
  const mk=(html,fn,attr)=>{ const b=document.createElement("button"); b.innerHTML=html; if(attr)b.setAttribute(attr,"1"); b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.addEventListener("mousedown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); fn(); }; return b; };   // §3.3 押しても書き換えは終わらない
  ptext.appendChild(mk("大きさ",()=>togglePSize(),"data-pt-size"));
  ptext.appendChild(mk("<b>太字</b>",()=>ptBold(),"data-pt-bold"));
  ptext.appendChild(mk("色",()=>togglePColor(),"data-pt-color"));
  const sp=document.createElement("span"); sp.className="sp"; ptext.appendChild(sp);
  ptext.appendChild(mk("終わる",()=>ptDone(),"data-pt-done"));
}
function showPtext(){ buildPtext(); ptext.classList.add("on"); placePtext(); }
function ptBold(){ if(!PG.state.editing){ PG.textToggleBold(); return; } if(!PG.editingHasSelection()) selectAllEditing(); PG.applyPartStyle("bold"); }
function ptApplySize(px){ if(PG.state.editing){ if(!PG.editingHasSelection()) selectAllEditing(); const box=PG.boxSizePx(PG.state.editing.id)||px; PG.applyPartStyle("scale", px/box); } else { PG.textSetSize(px); } }
function ptApplyColor(hex){ if(PG.state.editing){ if(!PG.editingHasSelection()) selectAllEditing(); PG.applyPartStyle("color",hex); } else { PG.textSetColor(hex); } }
function togglePSize(){ if(pSize.classList.contains("on")){ pSize.classList.remove("on"); return; } pColor.classList.remove("on"); pSize.innerHTML=""; for(const n of PG.SIZE_LIST){ const b=document.createElement("button"); b.textContent=String(n); b.setAttribute("data-ts-size",String(n)); b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); ptApplySize(n); pSize.classList.remove("on"); }; pSize.appendChild(b); } pSize.classList.add("on"); placeAbovePtext(pSize); }
function togglePColor(){ if(pColor.classList.contains("on")){ pColor.classList.remove("on"); return; } pSize.classList.remove("on"); pColor.innerHTML=""; for(const pair of PHONE_COLORS){ const b=document.createElement("button"); b.className="cell"; b.style.background=pair[1]; b.title=pair[0]; b.setAttribute("data-ts-color",pair[1]); b.setAttribute("data-color-name",pair[0]); b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); ptApplyColor(pair[1]); pColor.classList.remove("on"); }; pColor.appendChild(b); } pColor.classList.add("on"); placeAbovePtext(pColor); }
function ptDone(){ pSize.classList.remove("on"); pColor.classList.remove("on"); if(PG.state.editing) PG.commitEdit(); const ae=document.activeElement; if(ae&&ae.blur) ae.blur(); }   // §3.5 書き換えを終える・キーボードを閉じる

// §1 X8/§4.3 箱は部品・セクションに付いていく（見えている範囲の中・画面上の大きさを保つ）
function positionFmenuPhone(){ const g=vvGeom();
  fmenu.style.maxWidth=Math.max(120,(g.vw-16)*g.s)+"px";   // X6 入らなければ折り返す
  if(fmenu._follow==="section"){ const h=document.getElementById("host_"+fmenu._secId); if(!h){ return; } const hr=h.getBoundingClientRect();
    placeFloat(fmenu, (fmenu._secCX||hr.left), hr.top + (fmenu._secTopOff||0), true); return; }   // §X8 セクションに付いていく（指の位置を保つ）・見えている範囲の中に収める
  const id=[...PG.state.selected][0]; const n=id&&PG.elNode(id); if(!n){ return; } const pr=n.getBoundingClientRect();
  const rh=fmenu.offsetHeight/g.s;
  if(fmenu._place==null){ fmenu._place=((pr.top - rh - 6) >= g.oy+8) ? "above" : "below"; }   // 出すときに上下を決め、以後は保つ（関係を保って付いていく）
  const T = fmenu._place==="above" ? (pr.top - rh - 6) : (pr.bottom + 6);
  placeFloat(fmenu, pr.left, T, false);   // 縦は付いていく・横だけ見えている範囲に収める
}

// §2/§3 スマホの道具の出し分け（書き換え中は下の並びを隠し、文字の道具を出す）
function refreshPhoneUI(){ const phone=isPhone(); document.body.classList.toggle("pg-phone", phone);
  if(!phone){ pbar.style.display="none"; pmore.classList.remove("on"); ptext.classList.remove("on"); pSize.classList.remove("on"); pColor.classList.remove("on"); document.body.classList.remove("pg-hideadd"); document.getElementById("stage").style.paddingBottom=""; return; }
  const editing=editingNow();
  const hideAdd = phoneView() || editing || (tg&&(tg.kind==="drag"||tg.kind==="resize"));
  document.body.classList.toggle("pg-hideadd", !!hideAdd);   // §6.4
  if(editing){ pbar.style.display="none"; pmore.classList.remove("on"); if(!ptext.classList.contains("on")) showPtext(); else placePtext(); document.getElementById("stage").style.paddingBottom="12px"; }   // §2.7
  else { ptext.classList.remove("on"); pSize.classList.remove("on"); pColor.classList.remove("on"); buildPbar(); pbar.style.display="flex"; placePbar(); document.getElementById("stage").style.paddingBottom=((pbar.offsetHeight||56)+40)+"px"; }   // §2.5 並びの高さ分＋境目の＋の分の余白（一番下の部品・＋が並びに隠れない）
}

// §4.3 ピンチ・スクロールのたびに道具を置き直す
function syncOverlays(){ if(!isPhone()) return;
  if(pbar.style.display!=="none" && !editingNow()) placePbar();
  if(ptext.classList.contains("on")) placePtext();
  if(pmore.classList.contains("on")) placeAboveBar(pmore);
  if(pSize.classList.contains("on")) placeAbovePtext(pSize);
  if(pColor.classList.contains("on")) placeAbovePtext(pColor);
  if(fmenu.classList.contains("on")) positionFmenu();
  if(typePicker&&typePicker.classList.contains("on")) positionTypePicker();
  const s=getVS(); document.querySelectorAll(".rz-handle,.hit-handle").forEach((n)=>{ n.style.transform = (s!==1)?("scale("+(1/s)+")"):""; });   // §4.4 つまみは画面上の大きさを保つ
}
if(window.visualViewport){ window.visualViewport.addEventListener("resize",syncOverlays); window.visualViewport.addEventListener("scroll",syncOverlays); }
window.addEventListener("scroll",()=>{ if(isPhone()) syncOverlays(); },{passive:true});
window.addEventListener("pointerdown",(e)=>{ if(pmore.classList.contains("on")&&!pmore.contains(e.target)&&!(e.target.closest&&e.target.closest("[data-pbar-more]"))) pmore.classList.remove("on");
  if(pSize.classList.contains("on")&&!pSize.contains(e.target)&&!(e.target.closest&&e.target.closest("[data-pt-size]"))) pSize.classList.remove("on");
  if(pColor.classList.contains("on")&&!pColor.contains(e.target)&&!(e.target.closest&&e.target.closest("[data-pt-color]"))) pColor.classList.remove("on"); },true);

// §5.4 見せる範囲：指のタッチで動かす（1本）・2本指のピンチで写真を拡大縮小（ページは拡大しない＝touch-action:none）
