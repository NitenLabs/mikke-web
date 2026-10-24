// 指での見せる範囲の操作
// 線：A3｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
let cropTouch=null;
cropwrap.addEventListener("touchstart",(e)=>{ if(!PG.isCropping())return; const sc=(cropwrap._frame&&cropwrap._frame.sc)||PG.getScale();
  if(e.touches.length===2){ const a=e.touches[0],b=e.touches[1]; const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); const st=PG.cropState(); cropTouch={mode:"pinch",d0:d,z0:(st&&st.view?st.view.zoom:1)}; PG._barActive=true; e.preventDefault(); return; }
  const t=e.touches[0]; const dir=t.target.getAttribute&&t.target.getAttribute("data-crop-handle");
  if(dir){ PG.cropCornerStart(dir); cropTouch={mode:"corner",sx:t.clientX,sy:t.clientY,sc}; } else { PG.cropPanStart(); cropTouch={mode:"pan",sx:t.clientX,sy:t.clientY,sc}; }
  e.preventDefault();
},{passive:false});
cropwrap.addEventListener("touchmove",(e)=>{ if(!PG.isCropping()||!cropTouch)return;
  if(cropTouch.mode==="pinch"){ if(e.touches.length>=2){ const a=e.touches[0],b=e.touches[1]; const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); if(cropTouch.d0>0) PG.cropZoomTo(cropTouch.z0*(d/cropTouch.d0)); } if(e.cancelable)e.preventDefault(); return; }
  const t=e.touches[0]; if(!t)return; const sc=cropTouch.sc;
  if(cropTouch.mode==="corner") PG.cropCornerBy((t.clientX-cropTouch.sx)/sc,(t.clientY-cropTouch.sy)/sc); else PG.cropPanBy((t.clientX-cropTouch.sx)/sc,(t.clientY-cropTouch.sy)/sc);
  if(e.cancelable)e.preventDefault();
},{passive:false});
cropwrap.addEventListener("touchend",(e)=>{ if(!cropTouch)return; if(e.touches.length===0){ cropTouch=null; PG._barActive=false; } });

// 開いたとき：スマホなら最初からスマホの配置を出す（§2）
