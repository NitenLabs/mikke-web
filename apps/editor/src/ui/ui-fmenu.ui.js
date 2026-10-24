// 部品の浮かぶメニュー
// 線：A5｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const fmenu=document.getElementById("fmenu");
// §19（X19）メニューを画面の中に収める：上の道具の下端〜画面下端−8、左右も8内側。下に入らなければ押した所の上に出す
function clampMenuAt(cx,cy){ const vw=innerWidth, vh=innerHeight; const tb=document.getElementById("toolbar"); const tbb=tb?tb.getBoundingClientRect().bottom:0;
  const mw=fmenu.offsetWidth||120, mh=fmenu.offsetHeight||30;
  let top=cy; if(top+mh>vh-8) top=cy-mh;                 // 下に収まらなければ押した所の上
  top=Math.max(tbb+4, Math.min(top, vh-8-mh));
  let left=Math.min(cx, vw-8-mw); left=Math.max(8,left);
  fmenu.style.left=Math.round(left)+"px"; fmenu.style.top=Math.round(top)+"px"; }
function positionFmenu(){ if(!fmenu.classList.contains("on"))return;
  if(isPhone()){ positionFmenuPhone(); return; }   // §1(X6/X7/X8)・§4.3（試験台16）
  if(fmenu._section){ if(a3_followSecMenu()) return; clampMenuAt(fmenu._secClientX, fmenu._secClientY); return; }   // §19（X19）セクションの箱も画面の中へ。F17 PC はセクションに付いてスクロール
  if(fmenu._pcAt){ a3_followPartMenu(); return; }   // P26・F17 右クリックの一覧は押した所に出し、部品に付いてスクロール（画面の外に出たら隠す）
  const id=[...PG.state.selected][0]; const n=id&&PG.elNode(id); if(!n){ fmenu.classList.remove("on"); return;} const r=n.getBoundingClientRect(); const mh=fmenu.offsetHeight||30; let top=r.top-mh-6; if(top<4) top=r.bottom+6; /* §2 部品の上の外側。上に場所がなければ下の外側 */ fmenu.style.left=r.left+"px"; fmenu.style.top=top+"px"; }
// F60「元の位置に戻す」で左右の入れ替えも戻ったら、そのことを知らせる（戻すボタン付き）
function a5ResetParts(ids){ const sw=()=>{ const m=PG.reduce(PG.activeOps()).swapMap||{}; const d=PG.state.device; return JSON.stringify(Object.keys(m).sort().map(k=>[k,m[k]&&m[k][d]||null])); };
  const s0=sw(); for(const id of ids) PG.resetScope("part",id,[PG.state.device]);
  if(sw()!==s0&&window.pgToast) window.pgToast("左右の入れ替えも元に戻しました",ids.length===1); }
function showFmenu(cx,cy){ fmenu._section=false; fmenu._pcAt=null; fmenu.style.visibility=""; const sel=[...PG.state.selected]; if(!sel.length){ fmenu.classList.remove("on"); return; }
  if(!isPhone()){ a3_showPartMenuPC(sel,cx,cy); return; }   // P26 PC は縦の一覧（スマホの長押しの帯は今のまま）
  fmenu.classList.remove("pcmenu"); fmenu.innerHTML="";
  const add=(label,fn,note)=>{ if(note){ const s=document.createElement("span"); s.className="note"; s.textContent=note; fmenu.appendChild(s); return;} const b=document.createElement("button"); b.textContent=label; b.onclick=(ev)=>{ ev.stopPropagation(); fn(); }; fmenu.appendChild(b); };
  const addDiv=()=>{ const d=document.createElement("span"); d.className="fdiv"; fmenu.appendChild(d); };
  // §22 §8 PC：「最前面へ移動 ▸」の行＝親ボタン＋ホバーで出るサブ箱（最前面へ移動／前面へ移動）。重なり相手がいなければ灰色・▸箱なし
  const addZSub=(label,items,disabled)=>{ const row=document.createElement("div"); row.className="zrow";
    const b=document.createElement("button"); b.textContent=label+" ▸"; b.setAttribute("data-zsub",label); if(disabled){ b.disabled=true; b.textContent=label; } row.appendChild(b);
    if(!disabled){ const sub=document.createElement("div"); sub.className="zsub";
      for(const [lbl,fn] of items){ const sb=document.createElement("button"); sb.textContent=lbl; sb.setAttribute("data-zitem",lbl); sb.onclick=(ev)=>{ ev.stopPropagation(); fn(); }; sub.appendChild(sb); }
      b.onclick=(ev)=>{ ev.stopPropagation(); row.classList.toggle("open"); };   // クリックでも開く（ホバーできない環境用）
      row.appendChild(sub); }
    fmenu.appendChild(row); };
  const addColsPhone=()=>{ const info=PG.colsApi(); for(const opt of info.enabled){ const b=document.createElement("button"); b.className="colbtn"+(opt.n===info.current?" cur":""); b.setAttribute("data-cols-opt",String(opt.n)); b.textContent=opt.n+"列"+(opt.n===info.current?" ✓":""); if(!opt.enabled){ b.disabled=true; } else { b.onclick=(ev)=>{ ev.stopPropagation(); PG.setCols("I_cards",opt.n); showFmenu(); }; } fmenu.appendChild(b); } };
  const one=sel.length===1?sel[0]:null; const R=PG.reduce(PG.activeOps()); const ph=isPhone();   // §3.2.6 スマホのときだけ箱に「複製」「削除」を足す
  const moved=one&&PG.partChangedFromTemplate(one);   // N1：位置・大きさ・並び順・重なり順のどれかが変われば出す
  if(sel.length>1){ add("元の位置に戻す",()=>a5ResetParts(sel)); add("消す",()=>PG.deleteSelected()); }
  else if(one&&PG.isRepeat(one)){ const info=PG.partInfo(one); const isRow=info&&info.kind==="table"; const bare1=PG.canonId(one).replace(/.*__/,""); const isPrice=/_price_/.test(bare1);
    const isMenuRow=(PG.currentPage&&PG.currentPage()==="pg_menu")&&!!PG.menuRowPlc(one);   // 試験台28：お品書き本体の行（① の載せ方そのもの）
    if(isPrice) add("値段を変える",()=>openPriceBox(one)); else add("書き換える",()=>PG.startEdit(one));   // J19 お品書き本体の値段も値段の箱で（①連動＝読み込み直しても残る）
    if(!isMenuRow){ add(isRow?"行を足す…":"品を足す…",()=>{ if(isRow) addRowFlow(one); else openItemPicker(one); }); add("複製",()=>PG.duplicate()); }
    add("削除",()=>PG.deleteSelected());
    add("",null,isMenuRow?"品を選ぶと上の並びに道具が出ます":(isRow?"1行の作りを変えると全部に効きます":"品は位置を動かせません")); }
  else if(one){ const isPhoto=/^F_p|photo/.test(one)||/^addp_/.test(one); if(PG.isText(one)) add("書き換える",()=>PG.startEdit(one));   // J18 足した写真（addp_）にも写真の操作を出す
    if(PG.isText(one)&&(PG.hasTextStyle(one)||PG.hasRuns(one))) add("文字の見た目を元に戻す",()=>PG.resetTextStyle(one));   // §2.2 書式のクリア（箱まるごと＋文の一部）
    if(isPhoto){ const isCleared=(R.clear||[]).includes(one); add("写真を差し替える",()=>startReplace(one));
      if(!isCleared){ add("見せる範囲",()=>enterCrop(one)); add("写真を外す",()=>PG.commit({t:"clear",id:one})); }   // N4：外していない写真は「外す」だけ
      else { add("写真を戻す",()=>PG.commit({t:"unclear",id:one})); } }                                            // N4：外した空枠は「戻す」だけ
    // §22 §8 最前面/最背面へ移動（いつも出す）。重なり相手がいなければ灰色・▸箱なし。スマホは ▸ を使わず前面/背面の2つ
    // §22a X30：品の並び・表（I_cards/I_table。中の写真を右クリックするとこの群が選ばれる）とその中の部品には出さない（位置を動かせない／繰り返しの入れ物。§8.5）
    const bareOne=PG.canonId(one).replace(/.*__/,"");
    if(!PG.REPEAT.test(one) && bareOne!=="I_cards" && bareOne!=="I_table"){ const hasOv=PG.hasOverlapPartner();
      if(ph){ add("前面へ",()=>{ if(hasOv){PG.bringToFront(); showFmenu();} }); add("背面へ",()=>{ if(hasOv){PG.sendToBack(); showFmenu();} });
        const bs=[...fmenu.querySelectorAll("button")].slice(-2); if(!hasOv) for(const b of bs) b.disabled=true; }
      else { addDiv();
        addZSub("最前面へ移動",[["最前面へ移動",()=>{PG.bringToFront(); showFmenu();}],["前面へ移動",()=>{PG.bringForward(); showFmenu();}]],!hasOv);
        addZSub("最背面へ移動",[["最背面へ移動",()=>{PG.sendToBack(); showFmenu();}],["背面へ移動",()=>{PG.sendBackward(); showFmenu();}]],!hasOv);
        addDiv(); } }
    if(PG.canSwap(one)) add("左右を入れ替える",()=>PG.swapHoriz(one));   // §5 横並びの組（PC 特集）
    if(ph&&PG.canonId(one)==="I_cards") addColsPhone();   // §2.2/§6.7（L23）スマホは長押しの箱に「列」の見本ボタン（44px）
    if(moved) add("元の位置に戻す",()=>a5ResetParts([one])); if(ph){ add("複製",()=>PG.duplicate()); add("削除",()=>PG.deleteSelected()); } else add("消す",()=>PG.delPart(one)); }   // J14 並び全体を消すと品が消えるなら知らせる
  if(ph && one && PG.isRepeat(one) && PG.itemCtx(one)){ addDiv(); add("販売",()=>showSellSheet(one)); add("出す月",()=>showMonthSheet(one)); add("ラベル",()=>showLabelSheet(one)); add("メニュー",()=>showMenuSheet(one)); }   // 試験台28 §2.5 スマホ：品の長押しの箱に4つの道具
  if(ph && PG.canAlign().enabled) add("配置",()=>showAlignSheet());   // §27 スマホの長押しの箱に「配置」（PC は右クリックに入れない）
  fmenu._follow="part"; fmenu._secId=null; fmenu._place=null;   // §1/§4（試験台16）箱は部品に付いていく
  fmenu.classList.add("on"); positionFmenu();
}

// ---- 選択・ドラッグ・範囲選択 ----

// ---- P26（線 A3）PC の右クリック＝縦の一覧（PowerPoint と同じ）----
// 切り取り・コピー・貼り付け・複製・消す ／ 前面・背面 ／ その部品の操作。押せないものは灰色（disabled）。
// 押した所に出し、部品に付いてスクロールする（F17。部品が画面の外に出たら隠す）。
function a3_partRect(id){ const n=id&&PG.elNode(id); if(!n) return null; const r=n.getBoundingClientRect(); return (r.width||r.height)?r:null; }
function a3_toolbarBottom(){ const tb=document.getElementById("toolbar"); return tb?tb.getBoundingClientRect().bottom:0; }
function a3_showPartMenuPC(sel,cx,cy){
  const one=sel.length===1?sel[0]:null; const R=PG.reduce(PG.activeOps());
  fmenu.innerHTML=""; fmenu.classList.add("pcmenu");
  const reopen=()=>{ if(!PG.state.selected.size){ fmenu.classList.remove("on"); return; } const L=parseFloat(fmenu.style.left), T=parseFloat(fmenu.style.top); a3_showPartMenuPC([...PG.state.selected], isNaN(L)?undefined:L, isNaN(T)?undefined:T); };   // 今の場所のまま作り直す
  // keep=true：押した後も一覧を残して今の状態に作り直す（写真を外す・戻す、前面・背面。F13）
  const item=(label,fn,dis,keep)=>{ const b=document.createElement("button"); b.type="button"; b.setAttribute("role","menuitem"); b.textContent=label;
    if(dis){ b.disabled=true; b.setAttribute("aria-disabled","true"); }
    else b.onclick=(ev)=>{ ev.stopPropagation(); if(!keep) fmenu.classList.remove("on"); fn(); if(keep) reopen(); };
    fmenu.appendChild(b); return b; };
  const div=()=>{ if(!fmenu.lastChild||fmenu.lastChild.className==="fdiv") return; const d=document.createElement("span"); d.className="fdiv"; fmenu.appendChild(d); };
  const note=(t)=>{ const s=document.createElement("span"); s.className="note"; s.textContent=t; fmenu.appendChild(s); };
  const zsub=(label,items,disabled)=>{ const row=document.createElement("div"); row.className="zrow";
    const b=document.createElement("button"); b.type="button"; b.setAttribute("role","menuitem"); b.textContent=disabled?label:label+" ▸"; b.setAttribute("data-zsub",label); if(disabled){ b.disabled=true; b.setAttribute("aria-disabled","true"); } row.appendChild(b);
    if(!disabled){ const sub=document.createElement("div"); sub.className="zsub";
      for(const [lbl,fn] of items){ const sb=document.createElement("button"); sb.type="button"; sb.textContent=lbl; sb.setAttribute("data-zitem",lbl); sb.onclick=(ev)=>{ ev.stopPropagation(); fn(); reopen(); }; sub.appendChild(sb); }
      b.onclick=(ev)=>{ ev.stopPropagation(); row.classList.toggle("open"); };
      row.appendChild(sub); }
    fmenu.appendChild(row); };
  const bareOne=one?PG.canonId(one).replace(/.*__/,""):"";
  const isRep=!!(one&&PG.isRepeat(one)); const info=isRep?PG.partInfo(one):null; const isRow=!!(info&&info.kind==="table");
  const isMenuRow=isRep&&(PG.currentPage&&PG.currentPage()==="pg_menu")&&!!PG.menuRowPlc(one);
  const isList=!!one&&(bareOne==="I_cards"||bareOne==="I_table");
  // コピーできるもの：素の部品（並び・表の入れ物を除く）か、品・行の1件
  const copyable=isRep?!isMenuRow:sel.some((id)=>PG.isDraggable(id)&&!/^I_(cards|table)$/.test(PG.canonId(id).replace(/.*__/,"")));
  const canPaste=!!PG.state.clipboard&&!isMenuRow;
  const del=()=>{ if(one&&!isRep) PG.delPart(one); else PG.deleteSelected(); };   // J14 並び全体を消して品が消えたら知らせる
  item("切り取り",()=>PG.cutSelection(),!copyable);
  item("コピー",()=>PG.copySelection(),!copyable);
  item("貼り付け",()=>PG.paste(),!canPaste);
  item("複製",()=>PG.duplicate(),!copyable);
  item("消す",del,false);
  // 前面・背面（並び・表とその中の部品には出さない。§22a X30）
  if(one&&!isRep&&!isList&&!PG.REPEAT.test(one)){ const hasOv=PG.hasOverlapPartner(); div();
    zsub("最前面へ移動",[["最前面へ移動",()=>PG.bringToFront()],["前面へ移動",()=>PG.bringForward()]],!hasOv);
    zsub("最背面へ移動",[["最背面へ移動",()=>PG.sendToBack()],["背面へ移動",()=>PG.sendBackward()]],!hasOv); }
  // その部品の操作
  div();
  if(sel.length>1){ item("元の位置に戻す",()=>a5ResetParts(sel));   // F60 の知らせ（A5）を PC の一覧（P26）でも }
  else if(isRep){ const isPrice=/_price_/.test(bareOne);
    if(isPrice) item("値段を変える",()=>openPriceBox(one)); else if(PG.isText(one)) item("書き換える",()=>PG.startEdit(one));   // F9 品の写真には効かない「書き換える」を出さない
    if(!isMenuRow) item(isRow?"行を足す…":"品を足す…",()=>{ if(isRow) addRowFlow(one); else openItemPicker(one); });
    note(isMenuRow?"品を選ぶと上の並びに道具が出ます":(isRow?"1行の作りを変えると全部に効きます":"品は位置を動かせません")); }
  else if(one){ const isPhoto=/^F_p|photo/.test(one)||/^addp_/.test(one);
    if(PG.isText(one)) item("書き換える",()=>PG.startEdit(one));
    if(PG.isText(one)&&(PG.hasTextStyle(one)||PG.hasRuns(one))) item("文字の見た目を元に戻す",()=>PG.resetTextStyle(one));
    if(isPhoto){ const isCleared=(R.clear||[]).includes(one); item("写真を差し替える",()=>startReplace(one));
      if(!isCleared){ item("見せる範囲",()=>enterCrop(one)); item("写真を外す",()=>PG.commit({t:"clear",id:one}),false,true); }
      else item("写真を戻す",()=>PG.commit({t:"unclear",id:one}),false,true); }
    if(PG.canSwap(one)) item("左右を入れ替える",()=>PG.swapHoriz(one));
    if(PG.partChangedFromTemplate(one)) item("元の位置に戻す",()=>a5ResetParts([one])); }
  if(fmenu.lastChild&&fmenu.lastChild.className==="fdiv") fmenu.removeChild(fmenu.lastChild);
  fmenu._follow="part"; fmenu._secId=null; fmenu._place=null;
  fmenu.classList.add("on");
  // 押した所の近くで、選んだ部品に重ならない所に出す（W11）：部品の右 → 左 → 下 → 上 → 押した所。部品からのずれを覚える
  const pid=one||sel[0]; const r=a3_partRect(pid);
  if(cy==null) cy=r?r.top:innerHeight/2; if(cx==null) cx=r?r.left:innerWidth/2;
  if(r){ const mw=fmenu.offsetWidth||180, mh=fmenu.offsetHeight||30, tbb=a3_toolbarBottom(), G=6;
    const y=Math.max(tbb+4,Math.min(cy,innerHeight-8-mh)), x=Math.max(8,Math.min(cx,innerWidth-8-mw));
    if(r.right+G+mw<=innerWidth-8){ cx=r.right+G; cy=y; }
    else if(r.left-G-mw>=8){ cx=r.left-G-mw; cy=y; }
    else if(r.bottom+G+mh<=innerHeight-8){ cx=x; cy=r.bottom+G; }
    else if(r.top-G-mh>=tbb+4){ cx=x; cy=r.top-G-mh; } }
  clampMenuAt(cx,cy);
  const L=parseFloat(fmenu.style.left)||0, T=parseFloat(fmenu.style.top)||0;
  fmenu._pcAt={ id:pid, cx, cy, offX:r?L-r.left:0, offY:r?T-r.top:0 };
}
// 部品に付いていく（スクロール・窓の大きさ）。部品が画面（上の並びの下〜窓の下）の外に出たら隠す
function a3_followPartMenu(){ const at=fmenu._pcAt; const sel=PG.state.selected;
  if(!at||!sel.has(at.id)){ fmenu.classList.remove("on"); fmenu._pcAt=null; return; }
  const r=a3_partRect(at.id); if(!r){ fmenu.classList.remove("on"); fmenu._pcAt=null; return; }
  const tbb=a3_toolbarBottom(); const mw=fmenu.offsetWidth||180, mh=fmenu.offsetHeight||30;
  let left=r.left+at.offX, top=r.top+at.offY;
  left=Math.max(8,Math.min(left,innerWidth-8-mw));
  const out=r.bottom<tbb||r.top>innerHeight;
  if(!out){ if(top<tbb+4) top=tbb+4; if(top+mh>innerHeight-8) top=Math.max(tbb+4,innerHeight-8-mh); }   // F44 上の並びに重ねない
  fmenu.style.left=Math.round(left)+"px"; fmenu.style.top=Math.round(top)+"px";
  fmenu.style.visibility=out?"hidden":""; }
// F17 セクションの一覧もセクションに付いてスクロール（PC）
function a3_followSecMenu(){ const h=fmenu._secId&&document.getElementById("host_"+fmenu._secId); if(!h||fmenu._secTopOff==null) return false;
  const hr=h.getBoundingClientRect(); const tbb=a3_toolbarBottom(); const out=hr.bottom<tbb||hr.top>innerHeight;
  const mw=fmenu.offsetWidth||120, mh=fmenu.offsetHeight||30; let top=hr.top+fmenu._secTopOff; let left=Math.max(8,Math.min(fmenu._secClientX,innerWidth-8-mw));
  if(!out){ top=Math.max(tbb+4,Math.min(top,innerHeight-8-mh)); }
  fmenu.style.left=Math.round(left)+"px"; fmenu.style.top=Math.round(top)+"px"; fmenu.style.visibility=out?"hidden":""; return true; }
window.addEventListener("scroll",()=>{ if(!isPhone()&&fmenu.classList.contains("on")) positionFmenu(); },{passive:true});
