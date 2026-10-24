// 写真を選ぶ・落とす・「写真を変える」ボタン
// 線：A3｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const photoInput=document.getElementById("photoInput");
let pendingReplaceId=null, pendingAdd=false;
function startReplace(id){ pendingAdd=false; pendingReplaceId=id; photoInput.value=""; photoInput.click(); }
photoInput.addEventListener("change",async ()=>{ const f=photoInput.files&&photoInput.files[0]; const add=pendingAdd, rep=pendingReplaceId; pendingAdd=false; pendingReplaceId=null; if(!f) return; if(rep){ doReplace(rep,f); } else if(add){ await addPhotoCentered(f); } });   // §3.1 取り消し（ファイルなし）＝何もしない
async function doReplace(id,file){ const r=await PG.replacePhotoFile(id,file); if(!r.ok){ photoToast(id,"この写真は読み込めません"); } }
function photoToast(id,msg){ const n=PG.elNode(id); const t=document.createElement("div"); t.className="photo-toast"; t.textContent=msg; document.body.appendChild(t); if(n){ const r=n.getBoundingClientRect(); t.style.left=Math.round(r.left)+"px"; t.style.top=Math.round(r.top-28)+"px"; } else { t.style.left="12px"; t.style.top="60px"; } setTimeout(()=>t.remove(),2000); }
// 枠の上に落とす（落とせる間は枠を縁取る）。枠の外に落ちた画像は何もしない（§1.1）
function photoElFrom(t){ const n=t.closest?t.closest('[data-kind="photo"]'):null; return n?n.getAttribute("data-el"):null; }
// X11：写真の枠の上に重なって出る物（写真を変える・写真を選ぶ・選んだ印・つまみ）に落ちても、その写真の枠に落としたのと同じにする
function photoFrameAt(e){
  let id=photoElFrom(e.target); if(id) return id;
  const pcb=document.getElementById("photoChangeBtn"); if(pcb&&pcb.contains(e.target)) return pcb._for;
  const hf=e.target.closest&&e.target.closest("[data-handle-for]"); if(hf){ const fid=hf.getAttribute("data-handle-for"); const n=PG.elNode(fid); if(n&&n.getAttribute("data-kind")==="photo") return fid; }
  const els=document.elementsFromPoint(e.clientX,e.clientY); for(const el of els){ if(el.getAttribute&&el.getAttribute("data-kind")==="photo"&&el.getAttribute("data-el")) return el.getAttribute("data-el"); }
  return null;
}
let dropHi=null;
function hasFiles(e){ return [...(e.dataTransfer&&e.dataTransfer.types||[])].includes("Files"); }
function dropHiOn(id){ const n=id?PG.elNode(id):null; if(dropHi&&dropHi!==n)dropHi.classList.remove("drop-ok"); if(n){ n.classList.add("drop-ok"); dropHi=n; } else if(dropHi){ dropHi.classList.remove("drop-ok"); dropHi=null; } }
function onDropFiles(e,allowAdd){ if(!hasFiles(e))return; e.preventDefault(); const id=isPhone()?null:photoFrameAt(e); if(dropHi){ dropHi.classList.remove("drop-ok"); dropHi=null; } const files=[...(e.dataTransfer.files||[])]; const f=files.find(x=>x.type.startsWith("image/"))||files[0]; if(!f)return;   // 一度に複数なら最初の1枚だけ
  if(id){ doReplace(id,f); } else if(allowAdd&&!isPhone()){ addPhotoAtDrop(f,e.clientX,e.clientY); } }
stage.addEventListener("dragover",(e)=>{ if(!hasFiles(e))return; e.preventDefault(); e.dataTransfer.dropEffect="copy"; dropHiOn(isPhone()?null:photoFrameAt(e)); });   // §3.2 枠の外に落とす予告は出さない
stage.addEventListener("dragleave",(e)=>{ if(dropHi&&!stage.contains(e.relatedTarget)){ dropHi.classList.remove("drop-ok"); dropHi=null; } });
stage.addEventListener("drop",(e)=>onDropFiles(e,true));   // 枠の上（重なる物の上も）＝差し替え／枠の外＝新しい部品
// X11：浮遊ボタン（body 上）に落ちた分も写真の枠に流す
document.addEventListener("dragover",(e)=>{ const pcb=document.getElementById("photoChangeBtn"); if(pcb&&pcb.contains(e.target)&&hasFiles(e)){ e.preventDefault(); e.dataTransfer.dropEffect="copy"; dropHiOn(pcb._for); } },true);
document.addEventListener("drop",(e)=>{ const pcb=document.getElementById("photoChangeBtn"); if(pcb&&pcb.contains(e.target)){ onDropFiles(e,false); } },true);

// ---- §2/§5（試験台17）写真を変える・写真を選ぶ・明るさ（マウスの操作のときだけ）----
function isEmptyFrame(rawId){ const n=PG.elNode(rawId); return !!(n && n.getAttribute("data-kind")==="photo" && n.classList.contains("empty")); }
function photoSelInfo(){ const sel=[...PG.state.selected]; if(sel.length!==1) return null; const id=sel[0]; const n=PG.elNode(id); if(!n||n.getAttribute("data-kind")!=="photo") return null; const p=PG.photosApi().find(x=>x.part===id); return p?p:null; }
const photoChangeBtn=document.getElementById("photoChangeBtn");
photoChangeBtn.innerHTML=CAM_SVG+'<span>写真を変える</span>';
let pcClickTimer=null, lastImgClick=null;
const DBL_MS=300, DBL_MOVE=10;
// X10：見せる範囲に入るダブルクリックは「左ボタンで押して動かさず離すクリック」を 300ms 内に2回だけで数える。
//   ドラッグになったもの・右クリック・Ctrl を押しながらは数えない。2回目は写真でも「写真を変える」の上でもよい。
function imgClickDone(id,x,y,isButton){
  const now=performance.now();
  const dbl = lastImgClick && lastImgClick.id===id && (now-lastImgClick.t)<=DBL_MS && Math.hypot(x-lastImgClick.x,y-lastImgClick.y)<=DBL_MOVE;
  if(dbl){ lastImgClick=null; if(pcClickTimer){clearTimeout(pcClickTimer);pcClickTimer=null;} enterCrop(id); return; }
  lastImgClick={id,t:now,x,y};
  if(isButton){ if(pcClickTimer)clearTimeout(pcClickTimer); pcClickTimer=setTimeout(()=>{ pcClickTimer=null; lastImgClick=null; startReplace(id); },DBL_MS); }  // ボタンの1回目が最終なら差し替え
}
// 押して離す＝写真を選ぶ／押したまま動かす＝写真を動かす（既存のドラッグ pending に乗せる）。左ボタンのみ・右/Ctrl はドラッグ/メニューへ。
photoChangeBtn.addEventListener("pointerdown",(e)=>{ if(isPhone())return; if(e.button!==0||e.ctrlKey) return; const id=photoChangeBtn._for; if(!id)return; e.preventDefault(); PG.selectOnly(id); pending={sx:e.clientX,sy:e.clientY,photoChange:id}; });
// 右クリックはボタンを素通しして写真のメニューを出す（写真の右クリックと同じ）
photoChangeBtn.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation(); const id=photoChangeBtn._for; if(id){ PG.selectOnly(id); showFmenu(); } });
function refreshPhotoBtns(){
  // 「写真を選ぶ」：空の枠・まだない写真の枠すべて（選んでいなくても）。スマホでは今までどおり（入れない）
  document.querySelectorAll('#stage [data-kind="photo"].empty').forEach(el=>{
    if(isPhone()){ el.classList.remove("has-choose"); return; }
    if(el.querySelector("[data-photo-choose]")) return;
    el.classList.add("has-choose"); el.innerHTML='<button type="button" data-photo-choose class="photo-choose">'+CAM_SVG+'<span>写真を選ぶ</span></button><div class="photo-choose-hint">または、ここに写真を落とす</div>';
  });
  // 「写真を変える」：写真を1つだけ選んでいるとき（空枠でない・見せる範囲/動かし/大きさ変え/書き換え中は出さない）
  const p=photoSelInfo();
  const show = !isPhone() && p && p.asset && !p.cleared && !p.missing && !PG.isCropping() && !PG.isDragging() && !PG.isResizing() && !PG.state.editing;
  if(!show){ photoChangeBtn.style.display="none"; photoChangeBtn._for=null; return; }
  photoChangeBtn._for=p.part; positionPhotoChangeBtn();
}
function positionPhotoChangeBtn(){ const id=photoChangeBtn._for; if(!id){ photoChangeBtn.style.display="none"; return; } const n=PG.elNode(id); if(!n){ photoChangeBtn.style.display="none"; return; }
  const r=n.getBoundingClientRect(); photoChangeBtn.style.display="inline-flex"; const bw=photoChangeBtn.offsetWidth||130;
  if(r.width < bw+16 || r.height < 52){ photoChangeBtn.classList.add("below"); photoChangeBtn.style.left=(r.left+r.width/2)+"px"; photoChangeBtn.style.top=(r.bottom+6)+"px"; return; }   // 小さい枠＝すぐ下の外側
  photoChangeBtn.classList.remove("below");
  const tbb=(()=>{ const t=document.getElementById("toolbar"); return (t&&t.offsetParent!==null)?t.getBoundingClientRect().bottom:0; })();   // X17：見えている部分は上の道具の並びの下端から
  const vx0=Math.max(r.left,0), vy0=Math.max(r.top,tbb), vx1=Math.min(r.right,window.innerWidth), vy1=Math.min(r.bottom,window.innerHeight);   // 見えている部分の真ん中
  photoChangeBtn.style.left=((vx0+vx1)/2)+"px"; photoChangeBtn.style.top=((vy0+vy1)/2)+"px";
}
window.addEventListener("scroll",()=>{ if(!isPhone()&&photoChangeBtn._for) positionPhotoChangeBtn(); },{passive:true});

// --- §5 明るさ ---
