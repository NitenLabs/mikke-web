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
  // §27 Esc：書き換え・見せる範囲でなく、メニュー・箱が開いていなければ選択を外す。開いていれば閉じるだけ（選択は残す）
  if(e.key==="Escape"){
    if(e.defaultPrevented) return;   // すでに箱/メニューを閉じた（capture の Esc ＝公開・プレビュー・履歴・書体・列・明るさ）
    if(closeAnyOpenUI()){ e.preventDefault(); return; }
    if(PG.state.selected.size||PG.state.selectedSection){ e.preventDefault(); PG.clearSel(); }
    return;
  }
  if(meta&&e.key.toLowerCase()==="z"){ e.preventDefault(); e.shiftKey?PG.redo():PG.undo(); return; }
  if(meta&&e.key.toLowerCase()==="y"){ e.preventDefault(); PG.redo(); return; }
  if(meta&&e.key.toLowerCase()==="c"){ e.preventDefault(); PG.copySelection(); return; }
  if(meta&&e.key.toLowerCase()==="x"){ e.preventDefault(); PG.cutSelection(); return; }
  if(meta&&e.key.toLowerCase()==="v"){ e.preventDefault(); PG.paste(); return; }
  if(meta&&e.key.toLowerCase()==="d"){ e.preventDefault(); PG.duplicate(); return; }
  if(e.key==="Delete"||e.key==="Backspace"){ if(PG.state.selected.size){ e.preventDefault(); PG.deleteSelected(); } return; }
  const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(arrows[e.key]&&PG.state.selected.size){ e.preventDefault(); const s=e.shiftKey?10:1; PG.nudgeSelected(arrows[e.key][0]*s,arrows[e.key][1]*s); }
});
// 貼り付け：書き換え中はプレーン文字（§7.2）。書き換え中でなく写真を1つ選んでいて画像なら差し替える（§1.1・§7.7）
window.addEventListener("paste",(e)=>{ const cd=e.clipboardData||window.clipboardData; if(!cd)return; const t=cd.getData&&cd.getData("text/plain"); window.__lastPlain=t;
  if(PG.state.editing){ e.preventDefault(); if(!PG.editingPasteRich(t)&&!PG.editingPasteLink(t)) document.execCommand("inserttext",false,t); return; }   // §5 中のコピーは見た目つき／§2.5-2.6 URL・メール／よそからは文字だけ
  const file=[...(cd.files||[])].find(f=>f.type.startsWith("image/")) || (()=>{ for(const it of (cd.items||[])){ if(it.kind==="file"){ const f=it.getAsFile&&it.getAsFile(); if(f&&f.type.startsWith("image/")) return f; } } return null; })();
  if(!file) return;   // 画像がなければ、今の貼り付け（部品・文字＝Cmd+V の keydown）に任せる
  const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null; const n=one&&PG.elNode(one); const isPhoto=!!(n&&n.getAttribute("data-kind")==="photo");
  e.preventDefault();
  if(isPhoto){ doReplace(one,file); } else if(!isPhone()){ addPhotoCentered(file); }   // §3.3 写真1つなら差し替え／それ以外は新しい部品
});

// ---- §1 写真の差し替え（選ぶ・落とす・貼り付ける）----
