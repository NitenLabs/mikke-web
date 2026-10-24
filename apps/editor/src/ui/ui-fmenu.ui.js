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
  if(fmenu._section){ clampMenuAt(fmenu._secClientX, fmenu._secClientY); return; }   // §19（X19）セクションの箱も画面の中へ
  const id=[...PG.state.selected][0]; const n=id&&PG.elNode(id); if(!n){ fmenu.classList.remove("on"); return;} const r=n.getBoundingClientRect(); const mh=fmenu.offsetHeight||30; let top=r.top-mh-6; if(top<4) top=r.bottom+6; /* §2 部品の上の外側。上に場所がなければ下の外側 */ fmenu.style.left=r.left+"px"; fmenu.style.top=top+"px"; }
// F60「元の位置に戻す」で左右の入れ替えも戻ったら、そのことを知らせる（戻すボタン付き）
function a5ResetParts(ids){ const sw=()=>{ const m=PG.reduce(PG.activeOps()).swapMap||{}; const d=PG.state.device; return JSON.stringify(Object.keys(m).sort().map(k=>[k,m[k]&&m[k][d]||null])); };
  const s0=sw(); for(const id of ids) PG.resetScope("part",id,[PG.state.device]);
  if(sw()!==s0&&window.pgToast) window.pgToast("左右の入れ替えも元に戻しました",ids.length===1); }
function showFmenu(){ fmenu._section=false; const sel=[...PG.state.selected]; if(!sel.length){ fmenu.classList.remove("on"); return; } fmenu.innerHTML="";
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
