// ダブルクリック・右クリック・セクション/括りのメニュー
// 線：A5｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
stage.addEventListener("dblclick",(e)=>{ if(isPhone()||PG.previewMode()||PG.viewingVersion()) return; const id=elFrom(e.target); if(!id)return; const c=PG.canonId(id); const bare1=c.replace(/.*__/,""); if(/_price_/.test(bare1)){ PG.selectOnly(c); openPriceBox(c); } else if(PG.isText(c)){ if(PG.state.editing&&PG.state.editing.id===c) return; PG.startEdit(c); } else if(/^F_p|photo/.test(id)){ enterCrop(id); } });   // J3 既に同じ文字を書き換え中ならブラウザの語の選択に任せる（入り直して打鍵を捨てない）。§3 値段はダブルクリックで箱／写真はダブルクリックで見せる範囲
// 右クリック＝浮遊メニュー（部品）／セクションの余白ならセクションのメニュー（§2.1）
stage.addEventListener("contextmenu",(e)=>{
  if(PG.previewMode()||PG.viewingVersion()){ e.preventDefault(); return; }   // J50/J51 プレビュー・見るだけでは右クリックメニューを出さない（部品も選ばない）
  if(isPhone()){ e.preventDefault(); return; }   // §3.2.5 スマホの長押しから来る contextmenu は出さない・右クリック扱いしない
  const id=elFrom(e.target);   // §23c X35：render で元のノードが外れうるので、終える前に部品 ID を取っておく
  if(PG.state.editing) PG.commitEdit();   // §23c X35：右クリックメニューは「文字を打つ以外でその部品を変える」操作＝先に書き換えをふつうに終える（書き換えの外をクリックと同じ）。入り直した書き換えでも同じ
  if(id){ e.preventDefault();
    const catId=PG.menuCatId(id);   // 試験台28 §2.4：括りの見出しを右クリック → 括りを足す/消す
    if(catId){ PG.selectOnly(PG.canonId(id)); showCategoryMenu(catId,e.clientX,e.clientY); return; }
    if((PG.currentPage&&PG.currentPage()==="pg_menu")&&PG.menuRowPlc(id)){ PG.selectOnly(PG.canonId(id)); showFmenu(e.clientX,e.clientY); return; }   // 試験台28：お品書き本体の行は行そのものを選ぶ（偽のグループを選ばない）
    const grp=PG.groupOf(id); const sel=[...PG.state.selected]; const innerSel = grp && sel.length===1 && PG.isRepeat(sel[0]) && PG.groupOf(sel[0])===grp;   // 試験台26：中の1件を選んでいて同じ並びを右クリック → 1件のメニュー（品を足す等）
    if(!innerSel) PG.selectOnly(grp||PG.canonId(id)); showFmenu(e.clientX,e.clientY); return; }
  const host=e.target.closest&&e.target.closest("#sectionwrap .host");
  if(host){ e.preventDefault(); const sec=host.id.replace("host_",""); PG.selectSection(sec); showSectionMenu(sec,e.clientX,e.clientY); }
});

// ---- §2 セクションのメニュー（上へ・下へ・複製・削除）。#fmenu を使い、カーソルの位置に出す ----
function showSectionMenu(sec,cx,cy){
  const can=PG.sectionCan(sec); if(!can.exists){ fmenu.classList.remove("on"); return; }
  fmenu.innerHTML="";
  fmenu.classList.toggle("pcmenu",!isPhone()); fmenu._pcAt=null; fmenu.style.visibility="";   // P26 PC は縦の一覧
  // F22 出せない操作は消さずに灰色（disabled）にする
  const add=(label,fn,dis)=>{ if(dis&&isPhone()) return;   // スマホの長押しの帯は今のまま（出せないものは出さない）
    const b=document.createElement("button"); b.type="button"; b.setAttribute("role","menuitem"); b.textContent=label; b.setAttribute("data-sec-menu",label); if(dis){ b.disabled=true; b.setAttribute("aria-disabled","true"); } else b.onclick=(ev)=>{ ev.stopPropagation(); fmenu.classList.remove("on"); fn(); }; fmenu.appendChild(b); };
  add("上へ",()=>a3_secOp("up",sec),!can.up);
  add("下へ",()=>a3_secOp("down",sec),!can.down);
  add("複製",()=>a3_secOp("dup",sec));
  add("削除",()=>a3_secOp("del",sec),!can.del);
  fmenu._section=true; fmenu._secId=sec; fmenu._follow="section"; fmenu._place=null;
  const _h=document.getElementById("host_"+sec); const _hr=_h?_h.getBoundingClientRect():{top:cy,left:cx}; fmenu._secTopOff=cy-_hr.top; fmenu._secCX=cx; fmenu._secClientX=cx; fmenu._secClientY=cy;   // 指の位置をセクションからの相対で覚える（§X8 付いていく）
  fmenu.classList.add("on");
  if(isPhone()){ positionFmenu(); }   // §1(X7/X8)（試験台16）箱はセクションに付いていく・見えている範囲の中
  else { clampMenuAt(cx,cy); }   // §19（X19）画面の中に収める
}

// ---- 試験台28 §2.4：括りの見出しの右クリック（括りを足す（この下に）／括りを消す） ----
function showCategoryMenu(catId,cx,cy){
  fmenu.innerHTML=""; fmenu.classList.toggle("pcmenu",!isPhone()); fmenu._pcAt=null; fmenu.style.visibility="";
  const add=(label,fn,disabled)=>{ const b=document.createElement("button"); b.textContent=label; b.setAttribute("data-cat-menu",label); if(disabled){ b.disabled=true; } else { b.onclick=(ev)=>{ ev.stopPropagation(); fmenu.classList.remove("on"); fn(); }; } fmenu.appendChild(b); };
  add("括りを足す（この下に）",()=>PG.categoryAdd(catId));
  add("括りを消す",()=>PG.categoryDelete(catId), !PG.categoryCanDelete(catId));   // §2.4 品が残っていれば灰色
  fmenu._section=false; fmenu._secId=null; fmenu._follow=null; fmenu._place=null;
  fmenu.classList.add("on");
  if(isPhone()){ positionFmenu(); } else { clampMenuAt(cx,cy); }
}

// ---- 試験台28 §2.4：品のドラッグ並べ替え（お品書き本体の行＝① の載せ方／トップのおすすめ＝pick）----
// 既存の選択・レイアウト移動（beginDrag）は塊の幾何用。品の並べ替えは ① のデータを書き換える別物。
// capture 相で先につかみ、本体のポインタ処理より先に落とし先の線（横線＝表／縦線＝並び）を出して ① を書き換える。
// 行は本体処理を使わない（pointerdown で止める）。札はおすすめの塊を1回選んだ後の2回目のつかみだけ奪う（1回目の塊選択・塊移動は従来どおり）。
