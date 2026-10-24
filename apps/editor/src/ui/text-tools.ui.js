// 文字の道具（大きさ・太字・色）
// 線：A1｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const TS_COLORS=[["text","#333333"],["textMuted","#7B7B7B"],["line","#B0B0B0"],["background","#FFFFFF"]];
const TS_HEX={text:"#333333",textMuted:"#7B7B7B",line:"#B0B0B0",background:"#FFFFFF"};
// §24 最近使った色は app.js の「編集の設定」（settings）に保存する。ここでは PG.recentColors()/PG.pushRecentColor() を使う。
const tstools=document.getElementById("tstools");
const sizePop=document.getElementById("sizePop");
const colorPop=document.getElementById("colorPop");
const tsEl=(s)=>document.querySelector('[data-ts="'+s+'"]');   // §20 「その他」へ移っても見つかるように #tstools 限定をやめる
function textSelected(){ if(PG.state.editing) return true; const s=[...PG.state.selected]; return s.length>0 && s.every(id=>PG.isText(id)||PG.isHeadingGroup(id)); }
function updateFontLinkBtns(){
  const fb=tsEl("font"); let f;
  // §3 書体は「文字の箱1つ・または書き換え中」だけ出す（写真・ボタン・複数選択・何も無しは出さない）
  const sel=[...PG.state.selected]; const oneTextBox=sel.length===1 && PG.isText(sel[0]);
  const fontShow=!!(PG.state.editing || oneTextBox);
  fb.style.display=fontShow?"":"none"; const fdiv=fb.previousElementSibling; if(fdiv&&fdiv.classList&&fdiv.classList.contains("div")) fdiv.style.display=fontShow?"":"none";
  if(PG.state.editing){ f=PG.editingSelFont(); if(f==null) f=PG.curFontOf(PG.state.editing.id); }
  else { const prim=oneTextBox?PG.primaryTextSel():null; f=prim?PG.curFontOf(prim):null; }
  fb.textContent=((f==="__mixed__"||f==null)?"書体":PG.fontLabel(f))+" ▾";
  const lk=tsEl("link"); const canLink=!!(PG.state.editing&&PG.editingHasSelection());
  lk.disabled=!canLink; lk.style.opacity=canLink?"1":"0.4";
}
function updateTextTools(){
  if(!textSelected()){ tstools.style.display="none"; sizePop.classList.remove("on"); colorPop.classList.remove("on"); closeFontPop(); return; }
  tstools.style.display="inline-flex";
  updateFontLinkBtns();
  const si=tsEl("size");
  if(PG.state.editing){ const px=PG.editingPartSizePx(); if(px!=null && document.activeElement!==si) si.value=String(px); return; }  // 編集中は選択（または箱）の実際の大きさを出す
  const ap=PG.api.textStyles(); const prim=PG.primaryTextSel(); const info=prim&&ap.find(x=>x.part===prim);
  if(info){ if(document.activeElement!==si) si.value=String(info.size);
    tsEl("bold").classList.toggle("on",info.weight>=700);
    const sw=document.querySelector('#tstools [data-ts="color"] .sw'); sw.style.background=(/^#/.test(info.color)?info.color:(TS_HEX[info.color]||info.color)); }
}
function beforeTs(){ if(PG.state.editing) PG.commitEdit(); }   // §3.4 カーソルだけ（選択なし）なら決めてから箱全体に効かせる
// §13：書き換え中に文字の一部を選んでいれば、その所だけに効かせる（commit しない）
function partMode(){ return !!(PG.state.editing && PG.editingHasSelection()); }
const sizeInp=tsEl("size");
function curSizeShown(){ if(PG.state.editing){ const p=PG.editingPartSizePx(); if(p!=null) return p; } const ap=PG.api.textStyles(); const prim=PG.primaryTextSel(); const info=prim&&ap.find(x=>x.part===prim); return info?info.size:null; }
function commitSizeInput(){ const rawOrig=String(sizeInp.value).trim();
  const allHalf=/^[0-9]+$/.test(rawOrig), allFull=/^[０-９]+$/.test(rawOrig);
  if(!allHalf&&!allFull){ const cur=curSizeShown(); if(cur!=null) sizeInp.value=String(cur); return; }   // P9/J34 数字でない・全角と半角の混在（２０24 等）は前の大きさに戻す
  const v=parseInt(allFull?rawOrig.replace(/[０-９]/g,d=>String.fromCharCode(d.charCodeAt(0)-0xFEE0)):rawOrig,10);
  if(isNaN(v)){ const cur=curSizeShown(); if(cur!=null) sizeInp.value=String(cur); return; }
  const px=Math.max(8,Math.min(120,v));   // J13 範囲の外は端（8〜120）に丸める
  if(partMode()){ const box=PG.boxSizePx(PG.state.editing.id)||px; PG.applyPartStyle("scale", px/box); }
  else { beforeTs(); PG.textSetSize(px); } }
sizeInp.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Enter"){ e.preventDefault(); commitSizeInput(); sizeInp.blur(); } });
sizeInp.addEventListener("blur",commitSizeInput);
function partStep(dir){ const cur=PG.editingPartSizePx(); const box=PG.boxSizePx(PG.state.editing.id); let nx; if(dir>0) nx=PG.SIZE_LIST.find(v=>v>cur); else { const less=PG.SIZE_LIST.filter(v=>v<cur); nx=less.length?less[less.length-1]:null; } if(nx==null||nx===cur) return; PG.applyPartStyle("scale", nx/box); }
["grow","shrink","size-list"].forEach(nm=>{ tsEl(nm).onmousedown=(e)=>e.preventDefault(); });   // 編集中の選択を失わない
tsEl("grow").onclick=()=>{ if(partMode()) partStep(1); else { beforeTs(); PG.textStep(1); } };
tsEl("shrink").onclick=()=>{ if(partMode()) partStep(-1); else { beforeTs(); PG.textStep(-1); } };
tsEl("bold").onmousedown=(e)=>e.preventDefault();
tsEl("bold").onclick=()=>{ if(partMode()) PG.applyPartStyle("bold"); else { beforeTs(); PG.textToggleBold(); } };
function applySizeNum(px){ if(partMode()){ const box=PG.boxSizePx(PG.state.editing.id)||px; PG.applyPartStyle("scale", px/box); } else { beforeTs(); PG.textSetSize(px); } }
tsEl("size-list").onclick=(e)=>{ e.stopPropagation(); const open=sizePop.classList.contains("on"); colorPop.classList.remove("on"); if(open){ sizePop.classList.remove("on"); return; }
  sizePop.innerHTML=""; for(const n of PG.SIZE_LIST){ const b=document.createElement("button"); b.textContent=String(n); b.setAttribute("data-ts-size",String(n)); b.onmousedown=(ev)=>ev.preventDefault(); b.onclick=(ev)=>{ ev.stopPropagation(); applySizeNum(n); sizePop.classList.remove("on"); }; sizePop.appendChild(b); }
  const r=tsEl("size-list").getBoundingClientRect(); sizePop.style.left=r.left+"px"; sizePop.style.top=(r.bottom+4)+"px"; sizePop.classList.add("on"); };
tsEl("color").onmousedown=(e)=>e.preventDefault();   // 編集中の選択を失わない
tsEl("color").onclick=(e)=>{ e.stopPropagation(); const open=colorPop.classList.contains("on"); sizePop.classList.remove("on"); if(open){ colorPop.classList.remove("on"); return; } buildColorPop(); const r=tsEl("color").getBoundingClientRect(); colorPop.style.left=r.left+"px"; colorPop.style.top=(r.bottom+4)+"px"; colorPop.classList.add("on"); };
// §13：文字の一部を選んでいれば選んだ所だけ・そうでなければ箱まるごと
function applyColor(value){ if(partMode()) PG.applyPartStyle("color", value); else { beforeTs(); PG.textSetColor(value); } }
function buildColorPop(){
  colorPop.innerHTML="";
  const row=(label,cells)=>{ const l=document.createElement("div"); l.className="lab"; l.textContent=label; colorPop.appendChild(l); const d=document.createElement("div"); d.className="sws"; for(const c of cells) d.appendChild(c); colorPop.appendChild(d); };
  const cell=(bg,value)=>{ const b=document.createElement("button"); b.className="cell"; b.style.background=bg; b.setAttribute("data-ts-color",bg); b.onmousedown=(ev)=>ev.preventDefault(); b.onclick=(ev)=>{ ev.stopPropagation(); applyColor(value); colorPop.classList.remove("on"); }; return b; };
  row("テンプレートの色",TS_COLORS.map(([tok,hex])=>cell(hex,tok)));
  const rc=PG.recentColors(); if(rc.length) row("最近使った色",rc.map(hex=>cell(hex,hex)));
  const more=document.createElement("button"); more.className="more"; more.textContent="その他の色…"; more.onmousedown=(ev)=>ev.preventDefault(); more.onclick=(ev)=>{ ev.stopPropagation(); customColor.click(); }; colorPop.appendChild(more);
  const customColor=document.createElement("input"); customColor.type="color"; customColor.setAttribute("data-ts","color-custom"); customColor.value=(PG.recentColors()[0]||"#C03030");
  customColor.oninput=()=>{ const hex=customColor.value.toUpperCase(); applyColor(hex); PG.pushRecentColor(hex); colorPop.classList.remove("on"); };
  colorPop.appendChild(customColor);
}
window.addEventListener("pointerdown",(e)=>{ if(sizePop.classList.contains("on")&&!sizePop.contains(e.target)&&!tsEl("size-list").contains(e.target)) sizePop.classList.remove("on"); if(colorPop.classList.contains("on")&&!colorPop.contains(e.target)&&!tsEl("color").contains(e.target)) colorPop.classList.remove("on"); },true);

// ===== §19 書体（font）=====
