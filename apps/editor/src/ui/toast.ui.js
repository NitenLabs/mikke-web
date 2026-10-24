// 知らせ（pgToast）
// 線：A5｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
let _toastT=null;
window.pgToast=function(msg,undo){ let t=document.getElementById("pgToast"); if(!t){ t=document.createElement("div"); t.id="pgToast"; t.className="pg-toast"; document.body.appendChild(t); }
  // 閉じたら中身（「戻す」ボタン）を DOM から消す＝上の並びの「戻す」(#tUndo) と役割名が二重に出ないようにする（消えている間も残ると試験の button[name=戻す] が2つになる）
  const hide=()=>{ t.classList.remove("on"); t.classList.remove("has-undo"); t.innerHTML=""; };
  t.innerHTML=""; const sp=document.createElement("span"); sp.textContent=msg; t.appendChild(sp);
  // §2.7 品を消したときは「戻す」ボタンを 5 秒出す（上の並びの「戻す」と同じ1回）
  t.classList.toggle("has-undo",!!undo);
  if(undo){ const ub=document.createElement("button"); ub.className="pg-toast-undo"; ub.setAttribute("data-toast-undo","1"); ub.textContent="戻す"; ub.onclick=(e)=>{ e.stopPropagation(); if(PG.canUndo&&PG.canUndo()) PG.undo(); if(_toastT) clearTimeout(_toastT); hide(); }; t.appendChild(ub); }
  t.classList.add("on"); if(_toastT) clearTimeout(_toastT); _toastT=setTimeout(hide,undo?5000:3000); };

// ---- 値段の箱 ----
