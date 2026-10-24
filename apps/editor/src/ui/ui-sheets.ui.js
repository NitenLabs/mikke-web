// 開いている箱を閉じる・スマホの下からの箱
// 線：A5｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
function closeAnyOpenUI(){ let closed=false;
  const fm=document.getElementById("fmenu"); if(fm&&fm.classList.contains("on")){ fm.classList.remove("on"); closed=true; }
  const mm=document.getElementById("moreMenu"); if(mm&&mm.classList.contains("on")){ mm.classList.remove("on"); closed=true; }
  const am=document.getElementById("alignMenu"); if(am&&am.classList.contains("on")){ am.classList.remove("on"); closed=true; }
  const pm=document.getElementById("pmore"); if(pm&&pm.classList.contains("on")){ pm.classList.remove("on"); closed=true; }
  if(document.getElementById("priceBox")){ closePriceBox(); closed=true; }
  if(document.getElementById("pickerBox")){ closePicker(); closed=true; }
  if(historyOpen&&!PG.viewingVersion()){ closeHistory(); closed=true; }   // F28 履歴の板も Esc で閉じる
  return closed; }
// F28 履歴の板は外のクリックで閉じる（版を見ている間は閉じない＝「この版を下書きにする」の帯を使う）
document.addEventListener("pointerdown",(e)=>{ if(!historyOpen||PG.viewingVersion()) return; const t=e.target;
  if(t.closest&&(t.closest("#historyPanel")||t.closest("#historyBar")||t.closest("#tHistory")||t.closest("#moreMenu"))) return; closeHistory(); },true);
// スマホ：長押しの箱に「配置」→ 8つの一覧（箱を差し替える）
function showAlignSheet(){ fmenu.innerHTML=""; const c=PG.canAlign();
  for(const it of ALIGN_ITEMS){ if(it.div) continue; const b=document.createElement("button"); b.textContent=it.n; const en=c.enabled&&(!it.need3||c.distribute); if(!en){ b.disabled=true; } else b.onclick=(ev)=>{ ev.stopPropagation(); PG.align(it.k); fmenu.classList.remove("on"); }; fmenu.appendChild(b); }
  fmenu.classList.add("on"); positionFmenu(); }
// 試験台28 §2.5 スマホ：品の長押しの箱から「販売／出す月／ラベル／メニュー」→ 下からの板に同じ中身（箱を差し替える）
function sheetBtn(label,fn,opts){ const b=document.createElement("button"); b.textContent=label; if(opts&&opts.on) b.classList.add("cur"); if(opts&&opts.disabled){ b.disabled=true; } else b.onclick=(ev)=>{ ev.stopPropagation(); fn(); }; fmenu.appendChild(b); return b; }
function showSellSheet(id){ fmenu.innerHTML=""; const c=PG.itemCtx(id); if(!c){ fmenu.classList.remove("on"); return; } for(const [v,label] of SELL_OPTS) sheetBtn((c.status===v?"✓ ":"")+label,()=>{ PG.setItemStatus(id,v); fmenu.classList.remove("on"); },{on:c.status===v}); fmenu.classList.add("on"); positionFmenu(); }
function showMonthSheet(id){ fmenu.innerHTML=""; const c=PG.itemCtx(id); if(!c){ fmenu.classList.remove("on"); return; } const ms=new Set(c.months);
  sheetBtn((ms.size?"":"✓ ")+"いつでも",()=>{ PG.setItemMonths(id,[]); showMonthSheet(id); },{on:!ms.size});
  for(let m=1;m<=12;m++) sheetBtn((ms.has(m)?"✓ ":"")+m+"月",()=>{ const nm=new Set(PG.itemCtx(id).months); if(nm.has(m)) nm.delete(m); else nm.add(m); PG.setItemMonths(id,[...nm]); showMonthSheet(id); },{on:ms.has(m)});
  fmenu.classList.add("on"); positionFmenu(); }
function showLabelSheet(id){ fmenu.innerHTML=""; const c=PG.itemCtx(id); if(!c){ fmenu.classList.remove("on"); return; }
  for(const l of c.labels) sheetBtn((l.on?"✓ ":"")+l.name,()=>{ const cur=PG.itemCtx(id).labels.filter(x=>x.on).map(x=>x.id); PG.setItemLabels(id, l.on?cur.filter(x=>x!==l.id):[...cur,l.id]); showLabelSheet(id); },{on:l.on});
  sheetBtn("＋ 新しいラベル",()=>{ const nm=(window.prompt&&window.prompt("ラベルの名前"))||""; if(nm.trim()){ PG.addItemLabel(id,nm.trim()); } showLabelSheet(id); });
  fmenu.classList.add("on"); positionFmenu(); }
function showMenuSheet(id){ fmenu.innerHTML=""; const c=PG.itemCtx(id); if(!c){ fmenu.classList.remove("on"); return; }
  for(const m of c.menus){ const canRemove=m.on?PG.canRemoveMenu(id,m.id):true; sheetBtn((m.on?"✓ ":"")+m.name,()=>{ PG.setItemMenu(id,m.id,!m.on); showMenuSheet(id); },{on:m.on,disabled:m.on&&!canRemove}); }
  fmenu.classList.add("on"); positionFmenu(); }

// ===== §19 リンクの札（ホバー）=====
// F34 書き換え中・見せる範囲の中にナビを押したら、確定してから1回でページを移る
//   （押した時に書き換え・見せる範囲を終える描き直しでナビが作り直され、click が届かないため、離した時に移る）
let a5NavPending=null;
window.addEventListener("pointerdown",(e)=>{ a5NavPending=null; const n=e.target&&e.target.closest&&e.target.closest("#sectionwrap .navitem[data-page]"); if(!n) return;
  if(PG.state.editing||PG.isCropping()) a5NavPending=n.getAttribute("data-page"); },true);
window.addEventListener("pointerup",()=>{ const pgid=a5NavPending; a5NavPending=null; if(!pgid) return;
  setTimeout(()=>{ if(PG.isCropping()){ PG.cropCommit(); exitCropOverlay(); } if(PG.currentPage()!==pgid) PG.setPage(pgid); },0); },true);
