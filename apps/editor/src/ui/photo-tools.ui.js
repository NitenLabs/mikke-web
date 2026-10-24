// 写真の道具（明るさ）・見せる範囲の操作
// 線：A3｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const photoTools=document.getElementById("photoTools");
const tBright=document.getElementById("tBright");
const brightPop=document.getElementById("brightPop");
const BRIGHTS=[[-40,"−40%"],[-20,"−20%"],[0,"元のまま"],[20,"+20%"],[40,"+40%"]];
function updatePhotoTools(){ const p=photoSelInfo(); const show=!!(p&&p.asset&&!p.cleared&&!p.missing&&!PG.state.editing&&!isPhone()); photoTools.style.display=show?"inline-flex":"none"; if(!show) brightPop.classList.remove("on"); }
tBright.addEventListener("pointerdown",(e)=>e.preventDefault());
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
function ensureZoomBar(){ if(zoomBar)return zoomBar; const w=document.createElement("div"); w.id="cropzoom";
  w.innerHTML='<span class="zm">−</span><input type="range" data-crop-zoom min="1" max="4" step="0.01" value="1"><span class="zp">＋</span>';
  document.body.appendChild(w); const inp=w.querySelector("[data-crop-zoom]");
  inp.addEventListener("input",()=>{ PG._barActive=true; PG.cropZoomTo(parseFloat(inp.value)); });
  inp.addEventListener("pointerdown",()=>{ PG._barActive=true; }); window.addEventListener("pointerup",()=>{ PG._barActive=false; });
  zoomBar=w; return w; }
function enterCrop(id){ if(PG.isCropping())return; if(PG.state.editing)PG.commitEdit(); fmenu.classList.remove("on"); if(!PG.beginCrop(id)) return; ensureZoomBar(); drawCropOverlay(); }
window.onCrop=function(){ drawCropOverlay(); };   // app.js がドラッグ中に呼ぶ
function drawCropOverlay(){
  const st=PG.cropState(); if(!st||!st.display){ cropwrap.style.display="none"; cropwrap.innerHTML=""; return; }
  const n=PG.elNode(st.id); if(!n){ cropwrap.style.display="none"; return; }
  const r=n.getBoundingClientRect(); const sc=PG.getScale();   // 枠の画面上の矩形と倍率（設計px→画面px）
  const d=st.display; const DW=d.dw*sc, DH=d.dh*sc, OX=d.ox*sc, OY=d.oy*sc;
  const url=PG.assetUrl((PG.photosApi().find(p=>p.part===st.id)||{}).asset)||"";
  cropwrap.style.display="block"; cropwrap.style.left="0"; cropwrap.style.top="0"; cropwrap.style.width="0"; cropwrap.style.height="0";
  cropwrap.innerHTML=
    '<div class="dim" style="left:'+(r.left+OX)+'px;top:'+(r.top+OY)+'px;width:'+DW+'px;height:'+DH+'px;background-image:url('+url+');background-size:'+DW+'px '+DH+'px"></div>'
   +'<div class="clip" style="left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px"><div class="bright" style="left:'+OX+'px;top:'+OY+'px;width:'+DW+'px;height:'+DH+'px;background-image:url('+url+');background-size:'+DW+'px '+DH+'px"></div></div>';
  // §5 明るさは見せる範囲の中でも掛かったまま
  const bv=((PG.photosApi().find(p=>p.part===st.id)||{}).brightness)||0; const bf=bv?("brightness("+(1+bv/100)+")"):""; cropwrap.querySelectorAll(".dim,.bright").forEach(x=>x.style.filter=bf);
  // 四隅のつまみ（表示画像の角）
  const corners=[["nw",OX,OY],["ne",OX+DW,OY],["sw",OX,OY+DH],["se",OX+DW,OY+DH]];
  for(const [dir,cx,cy] of corners){ const h=document.createElement("div"); h.className="ch"; h.setAttribute("data-crop-handle",dir); h.style.left=(r.left+cx)+"px"; h.style.top=(r.top+cy)+"px"; cropwrap.appendChild(h); }
  cropwrap._frame={left:r.left,top:r.top,sc};
  // N3 横棒：いつも画面の中に。枠の下（入らなければ上）に置き、左右も画面内に収める。ドラッグ中は値を書き換えない
  if(zoomBar){ zoomBar.style.display="flex"; const bw=zoomBar.offsetWidth||200, bh=zoomBar.offsetHeight||28;
    let left=Math.min(Math.max(8,r.left),window.innerWidth-bw-8);
    let top=r.top+r.height+8; if(top+bh>window.innerHeight-8) top=Math.max(8,r.top-bh-8);
    zoomBar.style.left=left+"px"; zoomBar.style.top=top+"px";
    const inp=zoomBar.querySelector("[data-crop-zoom]"); if(inp && !PG._barActive) inp.value=String(st.view.zoom); }
}
function exitCropOverlay(){ cropwrap.style.display="none"; cropwrap.innerHTML=""; if(zoomBar) zoomBar.style.display="none"; }
// つまみ＝拡大縮小／それ以外のドラッグ＝見せる位置
cropwrap.addEventListener("pointerdown",(e)=>{ if(!PG.isCropping())return; if(e.pointerType==="touch")return;   // §5（試験台16）スマホの指は touch ハンドラで処理（1本指=動かす・2本指=拡大）
  e.preventDefault(); e.stopPropagation();
  const sc=(cropwrap._frame&&cropwrap._frame.sc)||PG.getScale(); const dir=e.target.getAttribute&&e.target.getAttribute("data-crop-handle");
  const sx=e.clientX, sy=e.clientY;
  if(dir){ PG.cropCornerStart(dir); const mv=(ev)=>{ PG.cropCornerBy((ev.clientX-sx)/sc,(ev.clientY-sy)/sc); }; const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); }; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); }   // N2 反対の角を止めて拡大
  else { PG.cropPanStart(); const mv=(ev)=>{ PG.cropPanBy((ev.clientX-sx)/sc,(ev.clientY-sy)/sc); }; const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); }; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); }
});
cropwrap.addEventListener("wheel",(e)=>{ if(!PG.isCropping())return; e.preventDefault(); PG.cropWheel(e.deltaY); },{passive:false});
// 枠の外を押したら決める（§2.1）
window.addEventListener("pointerdown",(e)=>{ if(isPhone()&&e.pointerType!=="touch") return; if(PG.isCropping() && !cropwrap.contains(e.target) && !(zoomBar&&zoomBar.contains(e.target))){ PG.cropCommit(); exitCropOverlay(); } },true);

// ====== §3（試験台15）スマホでの指の操作 ======
