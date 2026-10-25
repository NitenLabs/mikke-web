// 写真の道具（明るさ）・見せる範囲の操作
// 線：A3｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const photoTools=document.getElementById("photoTools");
const tBright=document.getElementById("tBright");
const brightPop=document.getElementById("brightPop");
const BRIGHTS=[[-40,"−40%"],[-20,"−20%"],[0,"元のまま"],[20,"+20%"],[40,"+40%"]];
function updatePhotoTools(){ const p=photoSelInfo(); const show=!!(p&&p.asset&&!p.cleared&&!p.missing&&!PG.state.editing&&!isPhone()); photoTools.style.display=show?"inline-flex":"none"; if(!show) brightPop.classList.remove("on"); const tc=document.getElementById("tCrop"); if(tc){ tc.classList.toggle("on",PG.isCropping()); tc.style.display=(typeof a5TouchPC==="function"&&a5TouchPC())?"":"none"; } }   // SP-9 指で触る画面だけ（マウスはダブルクリック・右クリックで入れる。狭い窓で明るさを押し出さない）
tBright.addEventListener("pointerdown",(e)=>e.preventDefault());
// SP-9（線 U）上の並びの「見せる範囲」（PowerPoint の「図の形式」のトリミングと同じ。指で触る iPad でも入れる）。もう一度押すと決めて終える
const tCrop=document.getElementById("tCrop");
if(tCrop){ tCrop.addEventListener("pointerdown",(e)=>e.preventDefault()); tCrop.onclick=(e)=>{ e.stopPropagation(); if(PG.isCropping()){ PG.cropCommit(); exitCropOverlay(); return; } const p=photoSelInfo(); if(p) enterCrop(p.part); }; }
tBright.onclick=(e)=>{ e.stopPropagation(); if(brightPop.classList.contains("on")){ brightPop.classList.remove("on"); return; } if(!buildBrightPop())return; brightPop.classList.add("on"); const r=tBright.getBoundingClientRect(); const pw=brightPop.offsetWidth; let left=r.left; if(left+pw>window.innerWidth-8) left=window.innerWidth-8-pw; if(left<8) left=8; brightPop.style.left=left+"px"; brightPop.style.top=(r.bottom+4)+"px"; };   // X15：画面の左右8以上内側に収める
function previewBright(id,v){ const n=PG.elNode(id); if(n) n.style.filter = v?("brightness("+(1+v/100)+")"):""; }   // 仮表示（記録しない）
function restoreBright(id){ previewBright(id,PG.brightnessOf(id)); }
function buildBrightPop(){ const p=photoSelInfo(); if(!p||!p.asset){ brightPop.classList.remove("on"); return false; } const id=p.part; const url=PG.assetUrl(p.asset)||""; const cur=p.brightness||0;
  brightPop.innerHTML=""; const row=document.createElement("div"); row.className="swrow";
  for(const pair of BRIGHTS){ const v=pair[0]; const b=document.createElement("button"); b.className="sw"+(v===cur?" cur":""); b.setAttribute("data-bright",String(v));
    b.innerHTML='<div class="thumb" style="background-image:url('+url+'); filter:'+(v?("brightness("+(1+v/100)+")"):"none")+'"></div><div class="cap">'+pair[1]+'</div>';
    b.addEventListener("pointerdown",(ev)=>ev.preventDefault());
    b.addEventListener("mouseenter",()=>previewBright(id,v));
    b.addEventListener("mouseleave",()=>restoreBright(id));
    b.onclick=(ev)=>{ ev.stopPropagation(); PG.setBrightness(id,v); brightPop.classList.remove("on"); };
    row.appendChild(b); }
  brightPop.appendChild(row); return true;
}
window.addEventListener("pointerdown",(e)=>{ if(brightPop.classList.contains("on")&&!brightPop.contains(e.target)&&!tBright.contains(e.target)){ const p=photoSelInfo(); if(p) restoreBright(p.part); brightPop.classList.remove("on"); } },true);
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&brightPop.classList.contains("on")){ const p=photoSelInfo(); if(p) restoreBright(p.part); brightPop.classList.remove("on"); } });

// ---- §2 見せる範囲（トリミング）の重ね描き ----
const cropwrap=document.getElementById("cropwrap");
// N3 拡大の横棒（いつも画面の中・言葉なし・両端に −／＋ の印）。見せる範囲の間だけ出す。枠の真ん中を中心に拡大。
let zoomBar=null;
// SP-10（線 C）「取り消す」「完了」も同じ棒に置く（PowerPoint の iPhone 版のトリミングの「完了」。PC はもう一度押す・外を押す・Enter／Esc もそのまま）
function ensureZoomBar(){ if(zoomBar)return zoomBar; const w=document.createElement("div"); w.id="cropzoom";
  w.innerHTML='<button type="button" class="zm" data-crop-step="-1" title="小さく" aria-label="小さく">−</button><input type="range" data-crop-zoom min="1" max="4" step="0.01" value="1"><button type="button" class="zp" data-crop-step="1" title="大きく" aria-label="大きく">＋</button><span class="zdiv"></span><button type="button" class="zc" data-crop-cancel>取り消す</button><button type="button" class="zd" data-crop-done>完了</button>';
  document.body.appendChild(w); const inp=w.querySelector("[data-crop-zoom]");
  // F12 「−」「＋」を押すと1段ずつ小さく・大きく（効かない印にしない）
  for(const b of w.querySelectorAll("[data-crop-step]")){ b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); const st=PG.cropState(); if(!st) return; PG.cropZoomTo(st.view.zoom+0.2*parseFloat(b.getAttribute("data-crop-step"))); }; }
  for(const b of w.querySelectorAll("[data-crop-cancel],[data-crop-done]")){ b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); if(!PG.isCropping()) return; if(b.hasAttribute("data-crop-done")) PG.cropCommit(); else PG.cropCancel(); exitCropOverlay(); }; }
  inp.addEventListener("input",()=>{ PG._barActive=true; PG.cropZoomTo(parseFloat(inp.value),"bar"); });
  inp.addEventListener("pointerdown",()=>{ PG._barActive=true; }); window.addEventListener("pointerup",()=>{ PG._barActive=false; });
  zoomBar=w; return w; }
function enterCrop(id){ if(PG.isCropping())return; if(PG.state.editing)PG.commitEdit(); fmenu.classList.remove("on"); if(!PG.beginCrop(id)) return; ensureZoomBar()._place=null; drawCropOverlay(); }
window.onCrop=function(){ drawCropOverlay(); };   // app.js がドラッグ中に呼ぶ
function drawCropOverlay(){
  const st=PG.cropState(); if(!st||!st.display){ cropwrap.style.display="none"; cropwrap.innerHTML=""; cropwrap._url=null; return; }
  const n=PG.elNode(st.id); if(!n){ cropwrap.style.display="none"; return; }
  const r0=n.getBoundingClientRect(); const sc=PG.getScale();   // 枠の画面上の矩形と倍率（設計px→画面px）
  // SP-11 枠のつまみを動かしている間は、新しい枠（元の枠の左上から live.L,T・大きさ st.w,h）を出す。元の写真は隠す（外の明るい所を見せない）
  const lv=st.live; const r=lv?{left:r0.left+lv.L*sc,top:r0.top+lv.T*sc,width:st.w*sc,height:st.h*sc,right:r0.left+(lv.L+st.w)*sc,bottom:r0.top+(lv.T+st.h)*sc}:r0;
  n.style.opacity=lv?"0":"";
  const d=st.display; const DW=d.dw*sc, DH=d.dh*sc, OX=d.ox*sc, OY=d.oy*sc;
  const url=PG.assetUrl((PG.photosApi().find(p=>p.part===st.id)||{}).asset)||"";
  cropwrap.style.display="block"; cropwrap.style.left="0"; cropwrap.style.top="0"; cropwrap.style.width="0"; cropwrap.style.height="0";
  // J31 重ね描きは作り直さず、位置と大きさだけ書き換える。前は動かすたびに innerHTML で作り直していて、指が触っている要素が消え、
  // 2歩目からの touchmove が cropwrap に届かず（外れた要素には伝わらない）、スマホで写真が指に付いてこなかった
  let dim=cropwrap.querySelector(":scope>.dim"), clip=cropwrap.querySelector(":scope>.clip"), bright=clip&&clip.querySelector(".bright");
  const nF=st.framable?8:0;
  if(!dim||!clip||!bright||cropwrap.querySelectorAll(":scope>.ch").length!==4||cropwrap.querySelectorAll(":scope>.cf").length!==nF){
    cropwrap.innerHTML='<div class="dim"></div><div class="clip"><div class="bright"></div></div>';
    // SP-11 黒いつまみ（枠の四隅のL字と辺の真ん中の棒）＝見せる枠を変える。白い丸（写真の四隅）＝写真の大きさ（PowerPoint のトリミングと同じ）
    if(st.framable) for(const dir of ["nw","n","ne","e","se","s","sw","w"]){ const h=document.createElement("div"); h.className="cf cf-"+dir; h.setAttribute("data-crop-frame",dir); h.title=dir.length===2?"見せる枠の角":"見せる枠の辺"; cropwrap.appendChild(h); }
    for(const dir of ["nw","ne","sw","se"]){ const h=document.createElement("div"); h.className="ch"; h.setAttribute("data-crop-handle",dir); h.title="写真の大きさ"; cropwrap.appendChild(h); }
    dim=cropwrap.querySelector(":scope>.dim"); clip=cropwrap.querySelector(":scope>.clip"); bright=clip.querySelector(".bright");
  }
  if(lv){ cropwrap._hid=n; } else if(cropwrap._hid){ cropwrap._hid.style.opacity=""; cropwrap._hid=null; }
  // 枠のつまみ：枠の内側に置く（角は枠の角に、辺は辺の真ん中に）。押せる大きさは CSS（指は 44px）
  for(const h of cropwrap.querySelectorAll(":scope>.cf")){ const d=h.getAttribute("data-crop-frame"); const hw=h.offsetWidth, hh=h.offsetHeight;
    const x=/w/.test(d)?r.left:/e/.test(d)?r.right-hw:r.left+r.width/2-hw/2; const y=/n/.test(d)?r.top:/s/.test(d)?r.bottom-hh:r.top+r.height/2-hh/2;
    h.style.left=x+"px"; h.style.top=y+"px"; }
  const bg="url("+url+")";
  Object.assign(dim.style,{left:(r.left+OX)+"px",top:(r.top+OY)+"px",width:DW+"px",height:DH+"px",backgroundSize:DW+"px "+DH+"px"});
  Object.assign(clip.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"});
  Object.assign(bright.style,{left:OX+"px",top:OY+"px",width:DW+"px",height:DH+"px",backgroundSize:DW+"px "+DH+"px"});
  if(cropwrap._url!==bg){ dim.style.backgroundImage=bg; bright.style.backgroundImage=bg; cropwrap._url=bg; }
  // §5 明るさは見せる範囲の中でも掛かったまま
  const bv=((PG.photosApi().find(p=>p.part===st.id)||{}).brightness)||0; const bf=bv?("brightness("+(1+bv/100)+")"):""; dim.style.filter=bf; bright.style.filter=bf;
  // 四隅のつまみ（表示画像の角）
  const corners={nw:[OX,OY],ne:[OX+DW,OY],sw:[OX,OY+DH],se:[OX+DW,OY+DH]};
  for(const h of cropwrap.querySelectorAll(":scope>.ch")){ const p=corners[h.getAttribute("data-crop-handle")]; h.style.left=(r.left+p[0])+"px"; h.style.top=(r.top+p[1])+"px"; }
  cropwrap._frame={left:r.left,top:r.top,sc};
  // N3 横棒：いつも画面の中に。枠の下（入らなければ上）に置き、左右も画面内に収める。ドラッグ中は値を書き換えない
  if(zoomBar){ zoomBar.style.display="flex"; const bw=zoomBar.offsetWidth||200, bh=zoomBar.offsetHeight||28;
    let left=Math.min(Math.max(8,r.left),window.innerWidth-bw-8);
    // F41 置き場所は見せる範囲に入ったときに1回決める：枠の下 → 枠の中の下端 → 枠の上 のうち、ほかの部品の文字に重ならない所
    if(zoomBar._for!==st.id||zoomBar._place==null){ zoomBar._for=st.id; zoomBar._place=a3_pickZoomPlace(st.id,r,left,bw,bh); }
    let top=a3_zoomTop(zoomBar._place,r,bh); if(top+bh>window.innerHeight-8) top=Math.max(8,r.top-bh-8);
    // SP-18 写真がスクロールで画面の外へ出ても、棒（完了・取り消す）は見えている所に残す（スマホは下の並びの上まで）
    let maxTop=window.innerHeight-8-bh; if(isPhone()&&pbar&&pbar.style.display!=="none"){ const br=pbar.getBoundingClientRect(); if(br.height) maxTop=Math.min(maxTop,br.top-8-bh); }
    top=Math.max(8,Math.min(top,maxTop));
    zoomBar.style.left=left+"px"; zoomBar.style.top=top+"px";
    const inp=zoomBar.querySelector("[data-crop-zoom]"); if(inp && !PG._barActive) inp.value=String(st.view.zoom); }
}
// F12 ページをスクロールしても重ね描きを写真に付けたままにする。SP-15・SP-18 スマホも（前はスマホだけ付け直さず、重ね描きが元の場所に残ってほかの写真のタップを取っていた）
window.addEventListener("scroll",()=>{ if(PG.isCropping()) drawCropOverlay(); },{passive:true});
// J32 窓の大きさが変わったら、重ね描きと拡大の棒を写真に付け直す（棒の置き場所も選び直す）。ページの描き直しの後に測るよう1コマ待つ
window.addEventListener("resize",()=>{ requestAnimationFrame(()=>{ if(!PG.isCropping())return; if(zoomBar) zoomBar._place=null; drawCropOverlay(); }); });
function exitCropOverlay(){ if(cropwrap._hid){ cropwrap._hid.style.opacity=""; cropwrap._hid=null; } cropwrap.style.display="none"; cropwrap.innerHTML=""; cropwrap._url=null; if(zoomBar){ zoomBar.style.display="none"; zoomBar._place=null; } }
window.onCropEnd=function(){ if(cropwrap._hid){ cropwrap._hid.style.opacity=""; cropwrap._hid=null; } };
// PC-19 見せる範囲の中の戻す・やり直す：見せる範囲の手直しを1つずつ。戻すものが無くなったら、見せる範囲を取り消して、その前の手直しを戻す（PowerPoint と同じ）
function cropUndoUI(){ if(!PG.isCropping()) return false; if(!PG.cropUndo()){ PG.cropCancel(); exitCropOverlay(); PG.undo(); } return true; }
function cropRedoUI(){ if(!PG.isCropping()) return false; PG.cropRedo(); return true; }
// SP-5 見せる範囲の途中でアプリを切り替える・閉じる・読み込み直すときは、合わせた範囲をその場で決めて保存する。
//   隠れただけ（visibilitychange）なら、戻ってきたときに見せる範囲を続けられるよう、同じ写真で入り直す
function cropSaveOnHide(stay){ if(!PG.isCropping()) return; const st=PG.cropState(); const id=st&&st.id; PG.cropCommit(); exitCropOverlay(); if(PG.flushPendingSave) PG.flushPendingSave(); if(stay&&id) enterCrop(id); }
window.addEventListener("pagehide",()=>cropSaveOnHide(false));
window.addEventListener("beforeunload",()=>cropSaveOnHide(false));
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") cropSaveOnHide(true); });
function a3_zoomTop(place,r,bh){ return place==="inside"?(r.bottom-bh-36):place==="above"?(r.top-bh-8):(r.bottom+8); }
function a3_pickZoomPlace(id,r,left,bw,bh){
  const rects=[]; for(const e of document.querySelectorAll("#sectionwrap [data-el]")){ if(e.getAttribute("data-el")===id||e.querySelector("[data-el]")) continue;
    const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT); let t; while((t=w.nextNode())){ if(!t.nodeValue.trim()) continue; const rg=document.createRange(); rg.selectNodeContents(t); for(const q of rg.getClientRects()) if(q.width>0&&q.height>0) rects.push(q); } }
  const hit=(top)=>rects.some((q)=>q.left<left+bw&&q.right>left&&q.top<top+bh&&q.bottom>top);
  for(const pl of ["below","inside","above"]){ if(pl==="inside"&&r.height<bh+76) continue; const top=a3_zoomTop(pl,r,bh); if(top<8||top+bh>innerHeight-8) continue; if(!hit(top)) return pl; }
  return "below"; }
// つまみ＝拡大縮小／それ以外のドラッグ＝見せる位置
cropwrap.addEventListener("pointerdown",(e)=>{ if(!PG.isCropping())return; if(e.pointerType==="touch")return;   // §5（試験台16）スマホの指は touch ハンドラで処理（1本指=動かす・2本指=拡大）
  e.preventDefault(); e.stopPropagation();
  const sc=(cropwrap._frame&&cropwrap._frame.sc)||PG.getScale(); const dir=e.target.getAttribute&&e.target.getAttribute("data-crop-handle");
  const sx=e.clientX, sy=e.clientY;
  const fdir=e.target.getAttribute&&e.target.getAttribute("data-crop-frame");
  if(fdir){ if(!PG.cropFrameStart(fdir)) return; const mv=(ev)=>{ PG.cropFrameBy((ev.clientX-sx)/sc,(ev.clientY-sy)/sc); }; const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); PG.cropFrameEnd(); drawCropOverlay(); }; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); return; }   // SP-11 枠のつまみ
  if(dir){ PG.cropCornerStart(dir); const mv=(ev)=>{ PG.cropCornerBy((ev.clientX-sx)/sc,(ev.clientY-sy)/sc); }; const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); }; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); }   // N2 反対の角を止めて拡大
  else { PG.cropPanStart(); const mv=(ev)=>{ PG.cropPanBy((ev.clientX-sx)/sc,(ev.clientY-sy)/sc); }; const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); }; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); }
});
// PC-18 ホイールはページのスクロール（PowerPoint のトリミングと同じ。拡大は棒・つまみで）。トラックパッドのピンチ（Ctrl＋ホイール）だけ拡大縮小
cropwrap.addEventListener("wheel",(e)=>{ if(!PG.isCropping()||!e.ctrlKey)return; e.preventDefault(); PG.cropWheel(e.deltaY); },{passive:false});
// 枠の外を押したら決める（§2.1）。SP-15 指は、外を押しただけでは決めず、離したときに「動かさずに離した＝タップ」なら決める（外をなぞってスクロールしても続く）
let cropOutTouch=null;
const CROP_HIST_BTNS="#tUndo,#tRedo,[data-pbar-undo],[data-pbar-redo],#tCrop";   // PC-19 戻す・やり直すのボタンは見せる範囲の中の1手ずつ（押しても終えない）
window.addEventListener("pointerdown",(e)=>{ if(isPhone()&&e.pointerType!=="touch") return; if(PG.isCropping() && !cropwrap.contains(e.target) && !(zoomBar&&zoomBar.contains(e.target)) && !(e.target.closest&&e.target.closest(CROP_HIST_BTNS))){
  if(e.pointerType==="touch"){ cropOutTouch={id:e.pointerId,x:e.clientX,y:e.clientY,sy:scrollY,t:performance.now()}; e.stopPropagation(); return; }   // 指：部品を選ぶ・動かす方へは流さない（見せる範囲のまま）
  PG.cropCommit(); exitCropOverlay(); } },true);
window.addEventListener("pointermove",(e)=>{ if(cropOutTouch&&e.pointerId===cropOutTouch.id&&Math.hypot(e.clientX-cropOutTouch.x,e.clientY-cropOutTouch.y)>10) cropOutTouch.moved=true; },true);
window.addEventListener("pointercancel",(e)=>{ if(cropOutTouch&&e.pointerId===cropOutTouch.id) cropOutTouch=null; },true);   // ブラウザがスクロールに使った＝なぞった
window.addEventListener("pointerup",(e)=>{ const t=cropOutTouch; if(!t||e.pointerId!==t.id) return; cropOutTouch=null; e.stopPropagation();
  if(t.moved||Math.abs(scrollY-t.sy)>2||performance.now()-t.t>600) return;   // なぞった・スクロールした・長く押した＝続ける
  if(PG.isCropping()){ PG.cropCommit(); exitCropOverlay(); } },true);

// ====== §3（試験台15）スマホでの指の操作 ======
