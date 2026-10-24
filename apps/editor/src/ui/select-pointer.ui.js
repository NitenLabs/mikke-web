// ステージのポインター（選ぶ・ドラッグ・範囲選択）
// 線：A2｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
let marquee=null;
// P2 押して離すで書き換えに入る文字（値段は値段の箱なので除く）
function a2ClickEditable(id){ return !!id && PG.isText(id) && !/_price_/.test(id.replace(/.*__/,"")); }
// P2 書き換えに入り、押した所（clientX/Y）にカーソルを置く
function a2EditAt(id,cx,cy){ PG.startEdit(id); const ed=PG.state.editing; if(!ed||ed.id!==PG.canonId(id)) return; const n=PG.elNode(ed.id); if(!n) return;
  const r=document.caretRangeFromPoint?document.caretRangeFromPoint(cx,cy):null;
  if(r&&n.contains(r.startContainer)){ r.collapse(true); const s=getSelection(); s.removeAllRanges(); s.addRange(r); } }
// P17/P18 今のページで選べる部品（動かせる部品と、1回で書き換えに入る文字。品の中の1件は並びごと）。ページの上から下・同じ高さは左から
function a2PageParts(){ const out=[]; const seen=new Set();
  for(const hs of document.querySelectorAll("#sectionwrap .host")) for(const el of hs.querySelectorAll("[data-el]")){ const raw=el.getAttribute("data-el"); if(PG.REPEAT.test(raw.replace(/.*__/,""))) continue; const c=PG.canonId(raw); if(seen.has(c)) continue;
    if(!(PG.isDraggable(c)||a2ClickEditable(c))) continue; const n=PG.elNode(c)||el; const b=n.getBoundingClientRect(); if(b.width<=0&&b.height<=0) continue; seen.add(c); out.push({id:c,y:b.top+scrollY,x:b.left}); }
  out.sort((a,b)=>Math.abs(a.y-b.y)>2?a.y-b.y:a.x-b.x); return out.map(o=>o.id); }
// P18 Tab／Shift+Tab：次・前の部品を選ぶ（一周する）。見える所までスクロール
function a2TabSelect(back){ const L=a2PageParts(); if(!L.length) return; const cur=[...PG.state.selected]; let i=cur.length?L.indexOf(PG.canonId(cur[cur.length-1])):-1;
  i = i<0 ? (back?L.length-1:0) : (i+(back?-1:1)+L.length)%L.length; const id=L[i]; PG.selectOnly(id); const n=PG.elNode(id); if(n) n.scrollIntoView({block:"nearest"}); if(typeof showFmenu==="function") showFmenu(); }
// P19 ドラッグの間はブラウザの文字の選択（とそれによる勝手なスクロール）をさせない
function a2NoTextSel(off){ if(off){ if(document.body.style.userSelect==="none") document.body.style.userSelect=""; return; } try{ getSelection().removeAllRanges(); }catch(_){} document.body.style.userSelect="none"; }
// P2 書き換え中の箱の枠：縁の外へ 6px（上下は内へ 2px も）の帯（中の文字の選択と分ける。左右の内は行の頭・終わりにカーソルを置けるよう帯にしない）。当たれば書き換え中の部品 ID
function a2EditFrameId(cx,cy){ const ed=PG.state.editing; if(!ed) return null; const n=PG.elNode(ed.id); if(!n) return null; const r=n.getBoundingClientRect(); const O=6,I=2;
  if(cx<r.left-O||cx>r.right+O||cy<r.top-O||cy>r.bottom+O) return null;
  if(cx>=r.left&&cx<=r.right&&cy>r.top+I&&cy<r.bottom-I) return null;
  return ed.id; }
function elFrom(t){ const n=t.closest?t.closest("[data-el]"):null; return n?n.getAttribute("data-el"):null; }
const stage=document.getElementById("stage");
stage.addEventListener("pointerdown",(e)=>{
  if(PG.previewMode()||PG.viewingVersion()) return;   // §22 §5 プレビュー／§6 見るだけは選択・移動しない（リンクは click で処理）
  if(e.pointerType==="touch"){ onPhoneDown(e); return; }   // J30 指のときは幅によらずスマホの操作（なぞったらスクロール・選んでから動かす）
  if(isPhone()) return;   // スマホ幅での互換マウス（タッチ後の合成イベント）は無視
  // P2 書き換え中の箱の枠（縁の内 3px・外 6px）を押した＝書き換えを終えて箱を選び、動かせば箱を動かす（PowerPoint と同じ）
  const a2fid=a2EditFrameId(e.clientX,e.clientY);
  if(a2fid&&e.button===0){ e.preventDefault(); PG.commitEdit(); PG.selectOnly(a2fid); pending=PG.isDraggable(a2fid)?{sx:e.clientX,sy:e.clientY}:null; return; }
  if(PG.state.editing && e.target.getAttribute && e.target.closest("[contenteditable]")) return; // 編集中の文字は素通し（中のドラッグは文字の選択）
  if(PG.state.editing) PG.commitEdit();
  // §4 大きさのつまみ（data-handle）をつかんだ＝大きさを変える
  const hdir=e.target.getAttribute&&e.target.getAttribute("data-handle");
  if(hdir){ const forId=e.target.getAttribute("data-handle-for"); if(PG.beginResize(forId,hdir,e.clientX,e.clientY)) e.preventDefault(); return; }
  fmenu.classList.remove("on");
  let rawId=elFrom(e.target);
  if(!rawId){ const sh=PG.smallHit(e.clientX,e.clientY); if(sh) rawId=sh; }   // §2 つかめる範囲を広げた小さな部品
  // §2.2（試験台17）空の枠・まだない写真の枠：どこを押しても離せば「写真を選ぶ」・押したまま動かせば枠を動かす
  if(rawId && isEmptyFrame(rawId)){ const cid=PG.canonId(rawId); PG.selectOnly(cid); pending={sx:e.clientX,sy:e.clientY,photoChoose:cid}; e.preventDefault(); return; }
  if(!rawId){ if(e.pointerType!=="touch"){ marquee={x0:e.clientX,y0:e.clientY,el:document.createElement("div")}; marquee.el.className="marquee"; document.body.appendChild(marquee.el); e.preventDefault(); } else PG.clearSel(); return; }
  const id=PG.canonId(rawId);
  // §5 PowerPoint のグループ選択：表・品の並びの中は、1回目で全体、2回目（選択中）で中の1件
  const grp=PG.groupOf(rawId);
  // X1：1回目で全体を選ぶ。選択中にもう一度つかんだら、動かせば全体ドラッグ・動かさなければ中の1件（押した瞬間には選び方を変えない）
  // P23 同じ並びの中の1件を選んでいるときは、別の1件も1回で選べる（全体に戻らない）
  if(grp&&!PG.state.selected.has(grp)&&[...PG.state.selected].some(s=>PG.groupOf(s)===grp)){ pending={sx:e.clientX,sy:e.clientY,clickInner:rawId}; return; }
  if(grp){ if(!PG.state.selected.has(grp)){ PG.selectOnly(grp); if(e.pointerType!=="touch") pending={sx:e.clientX,sy:e.clientY}; return; } else { pending={sx:e.clientX,sy:e.clientY,clickInner:rawId}; return; } }
  // P2/P6 動かせない文字（ヘッダーのロゴ・フッター・お品書き・アクセス）も1回で選び、押して離せば書き換え
  if(!PG.isDraggable(id)){ if(a2ClickEditable(id)&&e.button===0&&!e.shiftKey){ PG.selectOnly(id); pending={sx:e.clientX,sy:e.clientY,textClick:id}; return; } PG.selectMany([]); return; }
  // P15 Shift：押して離す＝選択に足す・外す（今までどおり）、押してドラッグ＝縦か横にまっすぐ動かす。選んでいなければ押した時に足す
  if((e.shiftKey&&e.pointerType!=="touch")){ e.preventDefault(); const was=PG.state.selected.has(id); if(!was) PG.toggleSel(id); pending={sx:e.clientX,sy:e.clientY,shiftOff:was?id:null}; return; }
  const inMulti=PG.state.selected.has(id)&&PG.state.selected.size>1;
  if(!inMulti) PG.selectOnly(id);
  const wasSel=inMulti||PG.state.selected.has(id);
  // 掴む準備だけ（実際のドラッグは動かし始めてから＝クリック/ダブルクリックを潰さない）。写真なら X10 のダブルクリック用に印を付ける（左ボタン・Ctrlなし）
  if(e.pointerType!=="touch"||wasSel){ const nn=PG.elNode(id); const isPh=!!(nn&&nn.getAttribute("data-kind")==="photo"&&!nn.classList.contains("empty")); pending={sx:e.clientX,sy:e.clientY,photoClick:(isPh&&e.button===0&&!e.ctrlKey)?id:null,textClick:(a2ClickEditable(id)&&e.button===0&&!e.ctrlKey)?id:null}; }
},{passive:false});
let pending=null;
// F20 マウスを乗せた部品に細い枠（選んでいる・書き換え中・ドラッグ中は出さない）
let a2HoverId=null;
function a2SetHover(id){ if(id&&id===a2HoverId){ const n=PG.elNode(id); if(n) n.classList.add("a2-hover"); return; } const old=a2HoverId&&PG.elNode(a2HoverId); if(old) old.classList.remove("a2-hover"); a2HoverId=id; const n=id&&PG.elNode(id); if(n) n.classList.add("a2-hover"); }
stage.addEventListener("pointermove",(e)=>{ if(e.pointerType==="touch"||isPhone()||PG.previewMode()||PG.viewingVersion()||PG.isDragging()||PG.isResizing()||marquee){ a2SetHover(null); return; }
  const raw=elFrom(e.target); let id=raw?PG.canonId(raw):null; if(raw&&PG.groupOf(raw)&&!PG.state.selected.has(PG.groupOf(raw))&&![...PG.state.selected].some(s=>PG.groupOf(s)===PG.groupOf(raw))) id=PG.groupOf(raw);
  if(id&&(PG.state.selected.has(id)||(PG.state.editing&&PG.state.editing.id===id)||!(PG.isDraggable(id)||a2ClickEditable(id)||PG.isRepeat(id)))) id=null;
  a2SetHover(id); });
stage.addEventListener("pointerleave",()=>a2SetHover(null));
window.addEventListener("pointermove",(e)=>{
  if(e.pointerType==="touch"){ if(tg) onPhoneMove(e); return; }   // J30 指は幅によらずスマホの動き
  if(isPhone()) return;
  // §2 Alt（Mac は Option）を押しながらは、そろえない
  if(PG.isResizing()){ e.preventDefault(); PG.resizeMove(e.clientX,e.clientY,e.metaKey||e.ctrlKey); PG.a2AutoScroll(e.clientX,e.clientY,e.metaKey||e.ctrlKey,false); return; }   // P16 吸い付かないのは Cmd（Option は複製に使う）
  if(marquee){ const x=Math.min(marquee.x0,e.clientX),y=Math.min(marquee.y0,e.clientY),w=Math.abs(e.clientX-marquee.x0),h=Math.abs(e.clientY-marquee.y0); Object.assign(marquee.el.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px"}); e.preventDefault(); return; }
  if(pending && !PG.isDragging() && Math.hypot(e.clientX-pending.sx,e.clientY-pending.sy)>3){ PG.beginDrag(pending.sx,pending.sy); a2NoTextSel(); lastImgClick=null; const pcb=document.getElementById("photoChangeBtn"); if(pcb) pcb.style.display="none"; }   // §2 動かし始めたら写真を変えるボタンを隠す・X10 ドラッグはダブルに数えない
  if(PG.isDragging()){ e.preventDefault(); PG.dragMove(e.clientX,e.clientY,e.metaKey||e.ctrlKey,e.shiftKey); PG.a2AutoScroll(e.clientX,e.clientY,e.metaKey||e.ctrlKey,e.shiftKey); }   // P16 Cmd＝吸い付かない・P15 Shift＝縦か横にまっすぐ
},{passive:false});
window.addEventListener("pointerup",(e)=>{
  if(e.pointerType==="touch"){ if(tg) onPhoneUp(e); return; }   // J30 指は幅によらずスマホの動き
  if(isPhone()) return;
  const wasPending=pending; pending=null; PG.a2StopAutoScroll(); a2NoTextSel(true);
  if(PG.isResizing()){ PG.endResize(); return; }   // F63 大きさを変えた後も帯は出さない
  if(marquee){ const r=marquee.el.getBoundingClientRect(); marquee.el.remove(); marquee=null; const chosen=[];
    const hosts=[...document.querySelectorAll("#sectionwrap .host")];
    for(const hs of hosts){ if(!hs)continue; for(const el of hs.querySelectorAll("[data-el]")){ const rawId=el.getAttribute("data-el"); const c=PG.canonId(rawId); if(!PG.isDraggable(c)||PG.REPEAT.test(rawId))continue; const b=el.getBoundingClientRect(); if(b.left>=r.left-0.5&&b.top>=r.top-0.5&&b.right<=r.right+0.5&&b.bottom<=r.bottom+0.5) if(!chosen.includes(c)) chosen.push(c);} }
    if(!chosen.length && r.width<6 && r.height<6){ // 余白をクリック＝セクションを選ぶ（§4）
      for(const hs of hosts){ const b=hs.getBoundingClientRect(); if(e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom){ PG.selectSection(hs.id.replace("host_","")); break; } } return; }
    PG.selectMany(chosen); if(chosen.length) showFmenu(); return; }
  if(PG.isDragging()){ PG.endDrag({dup:e.altKey}); return; }   // P16 Option を押したまま離した＝複製して動かす。F63 ドラッグの後に頼んでいない帯は出さない
  // §2（試験台17）写真を選ぶ：空の枠を動かさずに離したら写真を選ぶ画面を開く
  if(wasPending && wasPending.photoChoose && Math.hypot(e.clientX-wasPending.sx,e.clientY-wasPending.sy)<=4){ startReplace(wasPending.photoChoose); return; }
  // §2/X10 写真を変える：左クリックで離したら「写真を選ぶ（1回目）／見せる範囲（2回目）」。右・Ctrl・ドラッグは数えない
  if(wasPending && wasPending.photoChange && e.button===0 && !e.ctrlKey && Math.hypot(e.clientX-wasPending.sx,e.clientY-wasPending.sy)<=4){ imgClickDone(wasPending.photoChange,e.clientX,e.clientY,true); return; }
  // X10 写真そのものの左クリック完了＝ダブルクリック判定に積む（2回目で見せる範囲）
  if(wasPending && wasPending.photoClick && e.button===0 && !e.ctrlKey && Math.hypot(e.clientX-wasPending.sx,e.clientY-wasPending.sy)<=4){ imgClickDone(wasPending.photoClick,e.clientX,e.clientY,false); return; }
  if(wasPending && wasPending.shiftOff && Math.hypot(e.clientX-wasPending.sx,e.clientY-wasPending.sy)<3){ PG.toggleSel(wasPending.shiftOff); return; }   // P15 選んである部品の Shift+クリック＝外す
  // P2 文字の箱を押して離した（3px 未満の動き）＝押した所にカーソルを置いて書き換え（選んでいない箱・選んだ箱とも）
  if(wasPending && wasPending.textClick && e.button===0 && Math.hypot(e.clientX-wasPending.sx,e.clientY-wasPending.sy)<3){ a2EditAt(wasPending.textClick,wasPending.sx,wasPending.sy); return; }
  // X1：全体を選択中に中を押して動かさずに離した＝中の1件を選ぶ
  if(wasPending && wasPending.clickInner){ PG.selectMany([wasPending.clickInner]); showFmenu(); }
});
// ダブルクリック＝文字はその場書き換え、写真は見せる範囲（§2.1）
// ===================== 試験台26：① 連動の UI（知らせ・値段の箱・品を選ぶ一覧・連動の知らせ・お品書きの板） =====================
