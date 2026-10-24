// キーボード・貼り付け
// 線：A5｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
window.addEventListener("keydown",(e)=>{
  if(e.isComposing||e.keyCode===229) return;   // §23a X33 日本語の変換中のキーはページで拾わない（preventDefault もしない）
  if((PG.previewMode()||PG.viewingVersion())&&e.key!=="Escape"){ if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"," "].includes(e.key)) e.preventDefault(); return; }   // J50/J52 プレビュー・見るだけでは部品の操作をしない（矢印でページが横にずれないよう既定も止める）
  const meta=e.metaKey||e.ctrlKey;
  if(PG.isDragging&&PG.isDragging()){ if(e.key==="Escape"){ e.preventDefault(); PG.cancelDrag(); } return; }   // J29 ドラッグ中の Esc で取り消す
  if(PG.isCropping()){ // 見せる範囲：Enter で決め、Esc で取り消す（ほかのキーは効かない）
    if(e.key==="Enter"){ e.preventDefault(); PG.cropCommit(); exitCropOverlay(); }
    else if(e.key==="Escape"){ e.preventDefault(); PG.cropCancel(); exitCropOverlay(); }
    return;
  }
  if(PG.state.editing){ // 書き換え中：文字入力・Esc・Cmd+B・Cmd+K のみ。Cmd+Z は自動リンクの取り消しだけ受ける
    if(e.key==="Escape") PG.commitEdit();
    if(e.key==="Tab"){ e.preventDefault(); return; }   // J5 書き換え中の Tab でフォーカスが＋へ逃げない（打った文字が捨てられない）
    if(e.key==="Enter"&&!e.shiftKey&&!meta){ e.preventDefault(); document.execCommand&&document.execCommand("insertText",false,"\n"); return; }   // J1 改行は \n の文字として入れる（<div>/<br> にしない＝domToRuns が拾える・表示でも残る）
    if(meta&&e.key.toLowerCase()==="b"){ e.preventDefault(); if(PG.editingHasSelection()) PG.applyPartStyle("bold"); return; }   // §2.1 選んだ所の太字を入れ替え
    if(meta&&e.key.toLowerCase()==="k"){ e.preventDefault(); openLinkFromSelection(); return; }   // §2.1 Cmd+K
    if(meta&&e.key.toLowerCase()==="z"&&!e.shiftKey){ if(PG.editingHasAutoUndo()){ e.preventDefault(); PG.editingUndoAutoLink(); return; } e.preventDefault(); PG.undo(); return; }   // §2.5 自動リンク／§23b 書き換え中の戻す＝細かく
    if(meta&&((e.key.toLowerCase()==="z"&&e.shiftKey)||e.key.toLowerCase()==="y")){ e.preventDefault(); PG.redo(); return; }   // §23b 書き換え中のやり直し
    if(meta&&e.key.toLowerCase()==="c"){ PG.captureEditingCopy(); return; }   // §19b §5 この編集の中のコピー＝見た目・リンクも覚える（ブラウザのコピーはそのまま＝文字も system に入る）
    // J2 Cmd+V は keydown で止めない＝ブラウザ本来の paste イベント（下の window "paste"）に任せ、今のクリップボードを貼る
    return;
  }
  // J6/J7/J8/J42 入力欄（大きさ・値段・ラベル等）にフォーカスがあるときは、ページの部品の操作（消す・動かす・コピー等）をしない＝ブラウザの既定（欄の編集）に任せる
  const _ae=document.activeElement;
  if(_ae&&(_ae.tagName==="INPUT"||_ae.tagName==="TEXTAREA"||_ae.tagName==="SELECT"||_ae.isContentEditable)){
    // J7 ページを縦に動かすキーだけは止める（欄が短い数字で要らず、部品が画面外へ流れるのを防ぐ）。文字の編集キーは素通し
    if(["ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key)) e.preventDefault();
    if(e.key!=="Escape") return;
  }
  // P4 文字の箱を選んだだけ（書き換えていない）で文字を打つ＝書き換えに入り、打った文字で置き換える。Enter・F2＝書き換えに入り、全部を選ぶ
  if(!meta&&!e.altKey&&PG.state.selected.size===1){ const one=[...PG.state.selected][0];
    if(a2ClickEditable(one)){ if(e.key==="Enter"||e.key==="F2"){ e.preventDefault(); PG.startEdit(one,true); return; } if(e.key.length===1){ PG.startEdit(one,true); return; } } }
  // §27 Esc：書き換え・見せる範囲でなく、メニュー・箱が開いていなければ選択を外す。開いていれば閉じるだけ（選択は残す）
  if(e.key==="Escape"){
    if(e.defaultPrevented) return;   // すでに箱/メニューを閉じた（capture の Esc ＝公開・プレビュー・履歴・書体・列・明るさ）
    if(closeAnyOpenUI()){ e.preventDefault(); return; }
    if(PG.state.selected.size||PG.state.selectedSection){ e.preventDefault(); PG.clearSel(); }
    return;
  }
  if(meta&&e.key.toLowerCase()==="a"&&!e.shiftKey&&!e.altKey){ e.preventDefault(); const L=a2PageParts(); PG.selectMany(L); if(L.length&&typeof showFmenu==="function") showFmenu(); return; }   // P17 書き換えていないときの Cmd+A＝今のページの部品を全部選ぶ
  if(e.key==="Tab"&&!meta&&!e.altKey&&(PG.state.selected.size||PG.state.selectedSection)){ e.preventDefault(); a2TabSelect(e.shiftKey); return; }   // P18 部品を選んでいるときの Tab／Shift+Tab＝次・前の部品（何も選んでいなければ上の並びへ＝ふつうの Tab）
  if(meta&&e.key.toLowerCase()==="z"){ e.preventDefault(); e.shiftKey?PG.redo():PG.undo(); return; }
  if(meta&&e.key.toLowerCase()==="y"){ e.preventDefault(); PG.redo(); return; }
  if(meta&&e.key.toLowerCase()==="c"){ e.preventDefault(); PG.copySelection(); return; }
  if(meta&&e.key.toLowerCase()==="x"){ e.preventDefault(); PG.cutSelection(); return; }
  if(meta&&e.key.toLowerCase()==="v"){ e.preventDefault(); PG.paste(); return; }
  if(meta&&e.key.toLowerCase()==="d"){ e.preventDefault(); PG.duplicate(); return; }
  if(e.key==="Delete"||e.key==="Backspace"){ if(PG.state.selected.size){ e.preventDefault(); PG.deleteSelected(); } else if(PG.state.selectedSection&&!isPhone()){ e.preventDefault(); a3_secOp("del",PG.state.selectedSection); } return; }   // P25 選んだセクションを消す（知らせと戻す）
  const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(arrows[e.key]&&PG.state.selected.size){ e.preventDefault(); const s=e.shiftKey?10:1; PG.nudgeSelected(arrows[e.key][0]*s,arrows[e.key][1]*s); }
});
// 貼り付け：書き換え中はプレーン文字（§7.2）。書き換え中でなく写真を1つ選んでいて画像なら差し替える（§1.1・§7.7）
window.addEventListener("paste",(e)=>{ const cd=e.clipboardData||window.clipboardData; if(!cd)return; const t=cd.getData&&cd.getData("text/plain"); window.__lastPlain=t;
  if(PG.state.editing){ e.preventDefault(); if(!t) return; /* 文字の無い貼り付け（画像だけ）は書き換え中の選んだ文字を消さない（P3 でダブルクリックが語を選ぶようになったため） */ if(!PG.editingPasteRich(t)&&!PG.editingPasteLink(t)) document.execCommand("inserttext",false,t); return; }   // §5 中のコピーは見た目つき／§2.5-2.6 URL・メール／よそからは文字だけ
  const file=[...(cd.files||[])].find(f=>f.type.startsWith("image/")) || (()=>{ for(const it of (cd.items||[])){ if(it.kind==="file"){ const f=it.getAsFile&&it.getAsFile(); if(f&&f.type.startsWith("image/")) return f; } } return null; })();
  if(!file) return;   // 画像がなければ、今の貼り付け（部品・文字＝Cmd+V の keydown）に任せる
  const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null; const n=one&&PG.elNode(one); const isPhoto=!!(n&&n.getAttribute("data-kind")==="photo");
  e.preventDefault();
  if(isPhoto){ doReplace(one,file); } else if(!isPhone()){ addPhotoCentered(file); }   // §3.3 写真1つなら差し替え／それ以外は新しい部品
});

// ---- §1 写真の差し替え（選ぶ・落とす・貼り付ける）----
// F38 見えない写真の入力欄（画面の外に置いた input type=file）は Tab の順から外す（押すのは「写真」などのボタンから）
for(const inp of document.querySelectorAll('input[type="file"]')){ inp.tabIndex=-1; inp.setAttribute("aria-hidden","true"); }
// F39 「＋」（セクションを足す）・「その他 ▾」をキーで開いたら、一覧の最初にフォーカスを入れ、↑↓で選び、Esc で閉じる（ページはスクロールしない）
const A5_MENUS=["#sectypes","#moreMenu"];
let a5MenuOpener=null;
function a5OpenMenu(){ for(const s of A5_MENUS){ const m=document.querySelector(s); if(m&&m.classList.contains("on")&&m.getBoundingClientRect().width>0) return m; } return null; }
function a5MenuItems(m){ return [...m.querySelectorAll("button,[role=menuitem],[role=option],a")].filter(b=>{ const r=b.getBoundingClientRect(); return r.width>0&&r.height>0&&!b.disabled; }); }
window.addEventListener("click",(e)=>{ if(e.detail!==0) return; const b=e.target&&e.target.closest&&e.target.closest(".sec-add-btn,#tMore"); if(!b) return;   // detail=0 ＝キー（Enter・Space）で押した
  setTimeout(()=>{ const m=a5OpenMenu(); if(!m) return; const it=a5MenuItems(m); if(!it.length) return; a5MenuOpener=b; it[0].focus({preventScroll:true}); },0); },true);
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229) return; const m=a5OpenMenu(); if(!m||!m.contains(document.activeElement)) return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"||e.key==="Home"||e.key==="End"){ e.preventDefault(); e.stopPropagation(); const it=a5MenuItems(m); if(!it.length) return; const i=it.indexOf(document.activeElement);
    const n=e.key==="Home"?0:e.key==="End"?it.length-1:e.key==="ArrowDown"?(i+1)%it.length:(i<=0?it.length-1:i-1); it[n].focus({preventScroll:true}); return; }
  if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); m.classList.remove("on"); const o=a5MenuOpener; a5MenuOpener=null; if(o&&document.contains(o)) o.focus({preventScroll:true}); return; }
  if(e.key==="Tab"){ e.preventDefault(); m.classList.remove("on"); const o=a5MenuOpener; a5MenuOpener=null; if(o&&document.contains(o)) o.focus({preventScroll:true}); } },true);
