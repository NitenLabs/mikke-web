// 描き直しの後・道具の並び（入りきらない分は「その他」）・端末・戻す・制作用
// 線：A5｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）

function applyPhotos(){ PG.paintPhotos(); }
function opText(op){ const nm=id=>C3.friendly(id);
  if(op.t==="move") return "動かす："+op.items.map(it=>nm(it.id)+(it.mode==="M1"?"(中/"+it.dx+","+it.dy+")":"→"+nm(it.anchor)+"の下")).join("・")+" ["+op.device+"]";
  if(op.t==="edit") return "書き換える："+nm(op.id);
  if(op.t==="add") return "文字を足す："+nm(op.id)+"→"+nm(op.anchor)+"の下 ["+op.placedDevice+"]";
  if(op.t==="del") return "消す："+nm(op.id);
  if(op.t==="addCard") return "品を複製";
  if(op.t==="resetScope") return "元に戻す："+op.scope+" ["+op.devices.join(",")+"]";
  if(op.t==="clear"||op.t==="unclear") return (op.t==="clear"?"写真を外す":"写真を戻す")+"："+nm(op.id);
  if(op.t==="replace") return "写真を差し替える："+nm(op.id);
  if(op.t==="view") return "見せる範囲："+nm(op.id)+" ["+op.device+"]";
  return op.t; }
function refreshStudio(){ const ol=document.getElementById("oplog"); if(ol){ ol.innerHTML=""; for(const op of PG.api.ops()){ const li=document.createElement("li"); li.textContent=opText(op); ol.appendChild(li);} }
  const ul=document.getElementById("anchorlist"); if(ul){ ul.innerHTML=""; for(const a of PG.anchorsList()){ const li=document.createElement("li"); li.textContent=a.partName+"："+(a.mode==="M1"?"塊の中でずらす":a.anchorName+"の下（空き"+a.gapY+"）"); ul.appendChild(li);} } }
window.onRender=function(){ restoreFromMore(); applyPhotos(); refreshStudio(); positionFmenu(); updateTextTools(); updatePhotoTools(); updateElemTools(); updateCardsTools(); if(typeof updateItemTools==="function") updateItemTools(); if(typeof updateAlignTools==="function") updateAlignTools(); refreshPhotoBtns(); updateAddZones(); addHandleHits(); refreshPhoneUI(); syncOverlays(); if(typeof updateSaveUI==="function") updateSaveUI(); layoutToolbar(); if(typeof updateMoreStatus==="function") updateMoreStatus(); if(typeof syncPreviewUI==="function") syncPreviewUI(); if(typeof syncHistoryUI==="function") syncHistoryUI(); };
// §19b（X20）上の道具を常に1段に保ち、入りきらないぶんを「その他 ▾」にしまう（窓の幅で機能を隠さない）
const toolbarEl=document.getElementById("toolbar");
const tMore=document.getElementById("tMore");
const moreMenu=document.getElementById("moreMenu");
// 26b：「お品書きを見る」は上の並びのボタンをやめ、「その他 ▾」の中に常に置く（記録 13.2）
const moOshinaga=document.createElement("button"); moOshinaga.className="mo-extra"; moOshinaga.id="moOshinaga"; moOshinaga.textContent="お品書きを見る";
moOshinaga.onmousedown=(e)=>e.preventDefault();
moOshinaga.onclick=(e)=>{ e.stopPropagation(); moreMenu.classList.remove("on"); if(typeof menuOpen!=="undefined"&&menuOpen) closeMenuPanel(); else openMenuPanel(); };
moreMenu.appendChild(moOshinaga);
let movedToMore=[];
// §20（X23.②）しまったボタンは名前で出す（アイコンだけの物に名前・色は見本を名前の左に）
const MORE_NAMES={tStudio:"制作用",tPeek:"元の配置を見る",tResetPage:"このページを元に戻す",dPC:"PC",dSP:"スマホ",tPhoto:"写真",tText:"テキスト",tBright:"明るさ",tCols:"列",tSell:"販売",tMonth:"出す月",tLabels:"ラベル",tMenus:"メニュー",tElemLink:"リンク",tAlign:"配置"};
const TS_NAMES={font:"書体",shrink:"小さく","size":"大きさ","size-list":"よく使う大きさ",grow:"大きく",bold:"太字",color:"文字の色",link:"リンク"};
function moreNameOf(el){ if(el.id&&MORE_NAMES[el.id]) return MORE_NAMES[el.id]; const ts=el.getAttribute&&el.getAttribute("data-ts"); if(ts&&TS_NAMES[ts]) return TS_NAMES[ts]; return (el.textContent||"").trim(); }
// §20（X23.④）並びと同じ順（PC→スマホ）。左→右＝上→下
const TB_ORDER=["tText","tPhoto","dPC","dSP","tPeek","tResetPage","ts:font","ts:shrink","ts:size","ts:grow","ts:size-list","ts:bold","ts:color","ts:link","tBright","tCols","tSell","tMonth","tLabels","tMenus","tElemLink","tStudio"];
function orderKey(el){ if(el.id){ const i=TB_ORDER.indexOf(el.id); if(i>=0) return i; } const ts=el.getAttribute&&el.getAttribute("data-ts"); if(ts){ const i=TB_ORDER.indexOf("ts:"+ts); if(i>=0) return i; } return 999; }
function restoreFromMore(){ for(let i=movedToMore.length-1;i>=0;i--){ const m=movedToMore[i]; m.el.removeAttribute("data-more-name"); try{ m.parent.insertBefore(m.el, m.next&&m.next.parentNode===m.parent?m.next:null); }catch(_){ m.parent.appendChild(m.el); } } movedToMore=[]; }
function moveToMore(el){ movedToMore.push({el, parent:el.parentNode, next:el.nextSibling}); el.setAttribute("data-more-name", moreNameOf(el)); moreMenu.appendChild(el); }
function reorderMore(){ const kids=[...moreMenu.children]; kids.sort((a,b)=>orderKey(a)-orderKey(b)); for(const k of kids) moreMenu.appendChild(k); }
// §20（X23.③）並びに残った区切りは、先頭・末尾・続けて出さない
function cleanupDividers(){ for(const host of [toolbarEl, document.getElementById("tstools"), document.getElementById("photoTools"), document.getElementById("cardsTools"), document.getElementById("itemTools"), document.getElementById("elemTools")]){ if(!host) continue;
  const vis=[...host.children].filter(c=>c.offsetParent!==null||c===toolbarEl); let seenBtn=false, lastWasDiv=false;
  const list=[...host.children];
  for(const c of list){ if(!c.classList||!c.classList.contains("div")) continue; c.style.display=""; }
  // 可視の子を左から見て、区切りが先頭/連続/末尾なら隠す
  const visChildren=[...host.children].filter(c=>c.offsetParent!==null);
  for(let i=0;i<visChildren.length;i++){ const c=visChildren[i]; if(!(c.classList&&c.classList.contains("div"))) continue;
    const prevBtn=visChildren.slice(0,i).some(x=>!(x.classList&&x.classList.contains("div")));
    const nextBtn=visChildren.slice(i+1).some(x=>!(x.classList&&x.classList.contains("div")));
    const prevIsDiv=i>0 && visChildren[i-1].classList&&visChildren[i-1].classList.contains("div");
    if(!prevBtn||!nextBtn||prevIsDiv) c.style.display="none"; } } }
function overflowCandidates(){ const out=[]; const push=(sel)=>{ const el=typeof sel==="string"?document.querySelector(sel):sel; if(el) out.push(el); };
  push("#tStudio"); push("#tHistory"); push("#tPreview"); push("#tPeek"); push("#tResetPage"); push("#dSP"); push("#dPC"); push("#tPhoto"); push("#tText");   // §22 §3.3 しまう順：制作用→履歴→プレビュー→元の配置→このページ→PC/スマホ→テキスト/写真（公開・戻す・やり直すはしまわない）
  for(const sel of ['#tAlign','#tstools [data-ts="link"]','#tstools [data-ts="color"]','#tstools [data-ts="bold"]','#tstools [data-ts="size-list"]','#tstools [data-ts="grow"]','#tstools [data-ts="size"]','#tstools [data-ts="shrink"]','#tstools [data-ts="font"]','#tBright','#tMenus','#tLabels','#tMonth','#tSell','#tCols','#tElemLink']) push(sel);   // それでも入らなければ道具の右から（配置を先に＝記録 13.2）
  return out; }   // 「戻す」「やり直す」は最後までしまわない
let laying=false;
function layoutToolbar(){ if(laying) return; laying=true;
  moreMenu.classList.remove("on"); restoreFromMore(); cleanupDividers();
  const stat=document.getElementById("saveStatus"); if(stat) stat.style.display="";   // §22 §3.3 まず状態の文字を並びに戻す
  tMore.style.display="inline-block";   // 26b：その他は常に出す（「お品書きを見る」が常に入っているため）。§19b CSS 既定は display:none
  if(toolbarEl.scrollWidth<=toolbarEl.clientWidth+1){ reorderMore(); cleanupDividers(); laying=false; return; }
  // §22 X28：PC とスマホ、テキストと写真は組＝片方だけ並びに残さない（しまうときは相方も一緒にしまう）
  const PAIR={dSP:"dPC",dPC:"dSP",tPhoto:"tText",tText:"tPhoto"};
  for(const el of overflowCandidates()){ if(toolbarEl.scrollWidth<=toolbarEl.clientWidth+1) break; if(el && el.offsetParent!==null && el!==tMore){ moveToMore(el); const pid=PAIR[el.id]; if(pid){ const pe=document.getElementById(pid); if(pe && pe.offsetParent!==null) moveToMore(pe); } } }
  if(stat && toolbarEl.scrollWidth>toolbarEl.clientWidth+1) stat.style.display="none";   // §22 §3.3 それでも入らなければ状態の文字をしまう（→その他の一番上へ。updateMoreStatus）
  reorderMore(); cleanupDividers();
  laying=false; }
tMore.onmousedown=(e)=>e.preventDefault();
tMore.onclick=(e)=>{ e.stopPropagation(); if(moreMenu.classList.contains("on")){ moreMenu.classList.remove("on"); return; } moreMenu.classList.add("on"); const r=tMore.getBoundingClientRect(); const vw=innerWidth; const mw=moreMenu.offsetWidth||160; let left=Math.min(r.left, vw-8-mw); left=Math.max(8,left); moreMenu.style.left=Math.round(left)+"px"; moreMenu.style.top=(r.bottom+4)+"px"; };
window.addEventListener("pointerdown",(e)=>{ if(moreMenu.classList.contains("on")&&!moreMenu.contains(e.target)&&!tMore.contains(e.target)) moreMenu.classList.remove("on"); },true);
// §25 §2.1 画面を回した・窓の幅が変わったら、倍率を決め直して描き直す（中身は作り直さない＝書き換え中の文字・カーソル・選んでいる部品を保つ）。
let relayoutRAF=null;
function onViewportResize(){ if(relayoutRAF) cancelAnimationFrame(relayoutRAF); relayoutRAF=requestAnimationFrame(()=>{ relayoutRAF=null; try{ refreshPhoneUI(); if(PG.relayout) PG.relayout(); layoutToolbar(); positionFmenu(); addHandleHits(); syncOverlays(); }catch(_){} }); }
window.addEventListener("resize",onViewportResize);
window.addEventListener("orientationchange",onViewportResize);
// §2.5 書き換え中、空白・改行・全角空白を打った直後に、直前の URL/メールを自動リンクにする
window.onEditInput=function(e){ if(!PG.state.editing) return; const it=e&&e.inputType; const d=e&&e.data;
  const typedBreak=(it==="insertText"&&(d===" "||d==="　"))||it==="insertLineBreak"||it==="insertParagraph"||(it==="insertText"&&d==null);
  if(typedBreak) PG.autoLinkBeforeCaret(); };
// 書き換え中の選択が変わったら、書体・リンクのボタンの状態（名前・押せる押せない）を更新する
document.addEventListener("selectionchange",()=>{ if(PG.state.editing){ try{ updateFontLinkBtns(); }catch(_){} } });

document.getElementById("dPC").onclick=()=>{ PG.setDevice("pc"); document.getElementById("dPC").classList.add("on"); document.getElementById("dSP").classList.remove("on"); };
document.getElementById("dSP").onclick=()=>{ PG.setDevice("sp"); document.getElementById("dSP").classList.add("on"); document.getElementById("dPC").classList.remove("on"); };
// §23b 変換の境目を document でも監視（要素の oncomposition* が届かない経路の保険・CDP でも効く）
document.addEventListener("compositionstart",()=>{ if(PG.state.editing) PG.imeBoundary("start"); },true);
document.addEventListener("compositionend",()=>{ if(PG.state.editing) PG.imeBoundary("end"); },true);
document.getElementById("tUndo").onclick=()=>PG.undo();
document.getElementById("tRedo").onclick=()=>PG.redo();
document.getElementById("tResetPage").onclick=()=>PG.resetScope("page",null,["pc","sp"]);
const DEV=/[?&]dev=1/.test(location.search||"");   // J21 制作用（試験ボタン）は ?dev=1 のときだけ出す＝店主の画面には出さない
if(!DEV){ const _ts=document.getElementById("tStudio"); if(_ts) _ts.style.display="none"; const _st=document.getElementById("studio"); if(_st) _st.style.display="none"; }
document.getElementById("tStudio").onclick=(e)=>{ document.getElementById("studio").classList.toggle("on"); e.target.classList.toggle("on"); refreshStudio(); };
