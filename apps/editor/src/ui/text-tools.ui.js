// 文字の道具（大きさ・太字・斜体・下線・色・揃え）・文字の道具のキー（Cmd+B/I/U/L/E/R/J・Cmd+Shift+>/<）
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
  const lk=tsEl("link"); const canLink=!!(PG.state.editing&&PG.editingHasSelection())||!!a1BoxLinkSel();   // P14 箱を選んだだけでも押せる
  lk.disabled=!canLink; lk.style.opacity=canLink?"1":"0.4";
}
function updateTextTools(){
  if(!textSelected()){ tstools.style.display="none"; sizePop.classList.remove("on"); colorPop.classList.remove("on"); closeFontPop(); return; }
  tstools.style.display="inline-flex";
  updateFontLinkBtns();
  const si=tsEl("size");
  const sw=document.querySelector('#tstools [data-ts="color"] .sw'); const swOf=(c)=>(/^#/.test(c)?c:(TS_HEX[c]||c));
  if(PG.state.editing){   // P8 書き換え中は、選んだ所（またはカーソルの所）の見た目を出す。混ざっていれば空欄
    const lk=PG.a1EditingLook(); if(!lk) return; const id=PG.state.editing.id;
    if(document.activeElement!==si) si.value=lk.size!=null?String(lk.size):"";
    tsEl("bold").classList.toggle("on",!!lk.bold); tsEl("italic").classList.toggle("on",!!lk.italic); tsEl("underline").classList.toggle("on",!!lk.underline);
    const boxColor=(PG.api.textStyles().find(x=>x.part===id)||{}).color;
    sw.style.background=lk.color==="__mixed__"?"transparent":swOf(lk.color!=null?lk.color:(boxColor||"text"));
    a1SyncAlignBtn(PG.curAlignOf(id)); return; }
  const ap=PG.api.textStyles(); const prim=PG.primaryTextSel(); const info=prim&&ap.find(x=>x.part===prim);
  const keys=[...PG.state.selected].filter(id=>PG.isText(id)||PG.isHeadingGroup(id));
  if(info){ const many=keys.length>1;
    const allSame=(f)=>{ const vs=new Set(keys.map(k=>{ const t=PG.isHeadingGroup(k)?null:k; return t?f(t):null; }).filter(v=>v!=null)); return vs.size<=1; };
    if(document.activeElement!==si) si.value=(!many||allSame(id=>(ap.find(x=>x.part===id)||{}).size))?String(info.size):"";
    tsEl("bold").classList.toggle("on",info.weight>=700);
    tsEl("italic").classList.toggle("on",PG.curItalicOf(prim)); tsEl("underline").classList.toggle("on",PG.curUnderlineOf(prim));
    sw.style.background=swOf(info.color); }
  else if(prim){ tsEl("italic").classList.toggle("on",PG.curItalicOf(prim)); tsEl("underline").classList.toggle("on",PG.curUnderlineOf(prim)); }
  if(prim) a1SyncAlignBtn(PG.curAlignOf(prim));
}
function beforeTs(){ if(PG.state.editing) PG.commitEdit(); }   // §3.4 カーソルだけ（選択なし）なら決めてから箱全体に効かせる
// §13：書き換え中に文字の一部を選んでいれば、その所だけに効かせる（commit しない）
function partMode(){ return !!(PG.state.editing && PG.editingHasSelection()); }
const sizeInp=tsEl("size");
function curSizeShown(){ if(PG.state.editing){ const p=PG.editingPartSizePx(); if(p!=null) return p; } const ap=PG.api.textStyles(); const prim=PG.primaryTextSel(); const info=prim&&ap.find(x=>x.part===prim); return info?info.size:null; }
let a1SizeBusy=false;
function commitSizeInput(){ if(a1SizeBusy) return; const rawOrig=String(sizeInp.value).trim();
  if(rawOrig===""){ const cur=curSizeShown(); if(cur!=null&&!(PG.state.editing&&partMode())) sizeInp.value=String(cur); return; }   // P8 混ざった所の空欄は、何も打たなければそのまま
  const allHalf=/^[0-9]+(\.[0-9]+)?$/.test(rawOrig), allFull=/^[０-９]+([．.][０-９]+)?$/.test(rawOrig);
  if(!allHalf&&!allFull){ const cur=curSizeShown(); if(cur!=null) sizeInp.value=String(cur); return; }   // P9/J34 数字でない・全角と半角の混在（２０24 等）は前の大きさに戻す
  const v=Math.round(parseFloat(allFull?rawOrig.replace(/[０-９]/g,d=>String.fromCharCode(d.charCodeAt(0)-0xFEE0)).replace("．","."):rawOrig));   // P9 小数は丸める
  if(isNaN(v)){ const cur=curSizeShown(); if(cur!=null) sizeInp.value=String(cur); return; }
  const px=Math.max(8,Math.min(120,v));   // J13 範囲の外は端（8〜120）に丸める
  a1SizeBusy=true;
  try{ if(partMode()){ const box=PG.boxSizePx(PG.state.editing.id)||px; PG.applyPartStyle("scale", px/box); }
    else if(PG.state.editing){ const box=PG.boxSizePx(PG.state.editing.id)||px; PG.a1SetPending("scale", px/box); }   // P7 カーソルだけ＝次に打つ文字
    else { PG.textSetSize(px); } }
  finally{ a1SizeBusy=false; }
  sizeInp.value=String(px); }   // P9 丸めた値を欄にも出す
sizeInp.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Enter"){ e.preventDefault(); commitSizeInput(); sizeInp.blur(); } });
sizeInp.addEventListener("blur",commitSizeInput);
// P9 打った後に外を押しても当たる：押した所の処理（選択が外れる）より先に、欄の値を決める
window.addEventListener("pointerdown",(e)=>{ if(document.activeElement===sizeInp&&e.target!==sizeInp) commitSizeInput(); },true);
function partStep(dir){ const cur=PG.editingPartSizePx(); const box=PG.boxSizePx(PG.state.editing.id); let nx; if(dir>0) nx=PG.SIZE_LIST.find(v=>v>cur); else { const less=PG.SIZE_LIST.filter(v=>v<cur); nx=less.length?less[less.length-1]:null; } if(nx==null||nx===cur) return; PG.applyPartStyle("scale", nx/box); }
// P7 カーソルだけ：次に打つ文字の大きさを一覧の次・前へ
function caretStep(dir){ const lk=PG.a1EditingLook(); const box=PG.boxSizePx(PG.state.editing.id); const cur=(lk&&lk.size)||box; let nx; if(dir>0) nx=PG.SIZE_LIST.find(v=>v>cur); else { const less=PG.SIZE_LIST.filter(v=>v<cur); nx=less.length?less[less.length-1]:null; } if(nx==null||nx===cur) return; PG.a1SetPending("scale", nx/box); }
// 文字の道具の入口：選んだ所（書き換え中・範囲あり）／カーソルだけ（書き換え中・範囲なし＝次に打つ文字）／箱まるごと（書き換えていない）
function a1Style(kind,value){
  if(PG.state.editing&&a1Composing) a1FinishComposition(kind,value);   // F37 変換中に押したら、変換を決めて書き換えを続ける
  else if(partMode()){ if(kind==="grow") partStep(1); else if(kind==="shrink") partStep(-1); else PG.applyPartStyle(kind,value); }
  else if(PG.state.editing){ if(kind==="grow") caretStep(1); else if(kind==="shrink") caretStep(-1); else PG.a1SetPending(kind,value); }
  else { if(kind==="bold") PG.textToggleBold(); else if(kind==="italic") PG.textToggleItalic(); else if(kind==="underline") PG.textToggleUnderline(); else if(kind==="grow") PG.textStep(1); else if(kind==="shrink") PG.textStep(-1); else if(kind==="color") PG.textSetColor(value); else if(kind==="font") PG.textSetFont(value); }
}
// ---- F37 変換中に道具を押した：変換を決めてから、その文字に効かせる ----
let a1Composing=false, a1CompSel=null, a1CompLen=0;
document.addEventListener("compositionstart",()=>{ a1Composing=true; a1CompSel=null; if(!PG.state.editing) return; const n=PG.elNode(PG.state.editing.id); if(!n) return; a1CompSel=PG.caretOffsets(n); a1CompLen=(PG.textRunsApi(PG.state.editing.id)||[]).map(r=>r.text).join("").length; },true);
document.addEventListener("compositionend",()=>{ a1Composing=false; },true);
function a1FinishComposition(kind,value){
  const id=PG.state.editing.id; const n=PG.elNode(id); const s0=a1CompSel; const len0=a1CompLen;
  if(n){ try{ n.blur(); n.focus(); }catch(_){} }   // 変換を決める（Chrome は外へ出ると決める）
  a1Composing=false; if(!PG.state.editing||PG.state.editing.id!==id) return;
  const plain=(PG.textRunsApi(id)||[]).map(r=>r.text).join(""); const nn=PG.elNode(id);
  if(!s0||!nn){ a1Style(kind,value); return; }
  const ins=Math.max(0,plain.length-(len0-(s0.e-s0.s))); const a=s0.s, b=s0.s+ins;
  if(s0.e>s0.s&&ins>0){ PG.setCaretOffsets(nn,a,b); PG.liveSel(); a1Style(kind,value); }   // 選んだ所を変換で置き換えていた＝その文字に効かせる
  else { PG.setCaretOffsets(nn,b,b); PG.liveSel(); a1Style(kind,value); }   // カーソルだけ＝次に打つ文字に効かせる
}
["grow","shrink","size-list"].forEach(nm=>{ tsEl(nm).onmousedown=(e)=>e.preventDefault(); });   // 編集中の選択を失わない
tsEl("grow").onclick=()=>a1Style("grow");
tsEl("shrink").onclick=()=>a1Style("shrink");
for(const k of ["bold","italic","underline"]){ tsEl(k).onmousedown=(e)=>e.preventDefault(); tsEl(k).onclick=()=>a1Style(k); }
function applySizeNum(px){ if(partMode()){ const box=PG.boxSizePx(PG.state.editing.id)||px; PG.applyPartStyle("scale", px/box); } else if(PG.state.editing){ const box=PG.boxSizePx(PG.state.editing.id)||px; PG.a1SetPending("scale", px/box); } else { PG.textSetSize(px); } }
tsEl("size-list").onclick=(e)=>{ e.stopPropagation(); const open=sizePop.classList.contains("on"); colorPop.classList.remove("on"); if(open){ sizePop.classList.remove("on"); return; }
  sizePop.innerHTML=""; for(const n of PG.SIZE_LIST){ const b=document.createElement("button"); b.textContent=String(n); b.setAttribute("data-ts-size",String(n)); b.onmousedown=(ev)=>ev.preventDefault(); b.onclick=(ev)=>{ ev.stopPropagation(); applySizeNum(n); sizePop.classList.remove("on"); }; sizePop.appendChild(b); }
  const r=tsEl("size-list").getBoundingClientRect(); sizePop.style.left=r.left+"px"; sizePop.style.top=(r.bottom+4)+"px"; sizePop.classList.add("on"); };
tsEl("color").onmousedown=(e)=>e.preventDefault();   // 編集中の選択を失わない
tsEl("color").onclick=(e)=>{ e.stopPropagation(); const open=colorPop.classList.contains("on"); sizePop.classList.remove("on"); if(open){ colorPop.classList.remove("on"); return; } buildColorPop(); const r=tsEl("color").getBoundingClientRect(); colorPop.style.left=r.left+"px"; colorPop.style.top=(r.bottom+4)+"px"; colorPop.classList.add("on"); };
// §13：文字の一部を選んでいれば選んだ所だけ・そうでなければ箱まるごと
function applyColor(value){ a1Style("color", value); }
let a1ColorPrev=null;   // [[要素, 元の色]]
function a1PreviewColor(hex){ if(a1ColorPrev){ for(const [n,v] of a1ColorPrev) n.style.color=v; a1ColorPrev=null; } if(!hex) return;
  if(PG.state.editing) return;   // 書き換え中（選んだ所・次に打つ文字）は決めたときに当てる
  const ids=[...PG.state.selected].map(id=>PG.isHeadingGroup(id)?null:id).filter(Boolean);
  a1ColorPrev=[]; for(const id of ids){ const n=PG.elNode(id); if(n){ a1ColorPrev.push([n,n.style.color]); n.style.color=hex; } } }
function buildColorPop(){
  colorPop.innerHTML="";
  const row=(label,cells)=>{ const l=document.createElement("div"); l.className="lab"; l.textContent=label; colorPop.appendChild(l); const d=document.createElement("div"); d.className="sws"; for(const c of cells) d.appendChild(c); colorPop.appendChild(d); };
  const cell=(bg,value)=>{ const b=document.createElement("button"); b.className="cell"; b.style.background=bg; b.setAttribute("data-ts-color",bg); b.onmousedown=(ev)=>ev.preventDefault(); b.onclick=(ev)=>{ ev.stopPropagation(); applyColor(value); colorPop.classList.remove("on"); }; return b; };
  row("テンプレートの色",TS_COLORS.map(([tok,hex])=>cell(hex,tok)));
  const rc=PG.recentColors(); if(rc.length) row("最近使った色",rc.map(hex=>cell(hex,hex)));
  const more=document.createElement("button"); more.className="more"; more.textContent="その他の色…"; more.onmousedown=(ev)=>ev.preventDefault(); more.onclick=(ev)=>{ ev.stopPropagation(); customColor.click(); }; colorPop.appendChild(more);
  const customColor=document.createElement("input"); customColor.type="color"; customColor.setAttribute("data-ts","color-custom"); customColor.value=(PG.recentColors()[0]||"#C03030");
  // F5 つまみを動かしている間は見せるだけ（記録しない）。決めたとき（change）に1回だけ記録し、最近使った色も1つ
  customColor.oninput=()=>{ const hex=customColor.value.toUpperCase(); a1PreviewColor(hex); };
  customColor.onchange=()=>{ const hex=customColor.value.toUpperCase(); a1PreviewColor(null); applyColor(hex); PG.pushRecentColor(hex); colorPop.classList.remove("on"); };
  colorPop.appendChild(customColor);
}
window.addEventListener("pointerdown",(e)=>{ if(sizePop.classList.contains("on")&&!sizePop.contains(e.target)&&!tsEl("size-list").contains(e.target)) sizePop.classList.remove("on"); if(colorPop.classList.contains("on")&&!colorPop.contains(e.target)&&!tsEl("color").contains(e.target)) colorPop.classList.remove("on"); },true);

// ===== §19 書体（font）=====

// ---- P11 文字の揃え（箱まるごと・両端末で共通）----
const A1_ALIGN_ITEMS=[["left","左揃え","Cmd+L"],["center","中央揃え","Cmd+E"],["right","右揃え","Cmd+R"],["justify","両端揃え","Cmd+J"]];
const alignPop=document.createElement("div"); alignPop.id="textAlignPop"; alignPop.className="tspop"; alignPop.style.minWidth="128px"; document.body.appendChild(alignPop);
function a1SyncAlignBtn(cur){ const b=tsEl("align"); if(b) b.setAttribute("data-cur-align",cur||"left"); }
function a1Align(a){ if(PG.state.editing) PG.a1BoxOpWhileEditing(()=>PG.textSetAlign(a)); else PG.textSetAlign(a); }
function buildAlignPop(){ alignPop.innerHTML=""; const prim=PG.state.editing?PG.state.editing.id:PG.primaryTextSel(); const cur=prim?PG.curAlignOf(prim):null;
  for(const [k,label,key] of A1_ALIGN_ITEMS){ const b=document.createElement("button"); b.setAttribute("data-ts-align",k); b.title=label+"（"+key+"）"; b.textContent=(k===cur?"✓ ":"　")+label;
    b.style.cssText="display:block;width:100%;text-align:left;border:none;background:none;padding:5px 8px;border-radius:4px;cursor:pointer;font:13px system-ui";
    b.onmousedown=(ev)=>ev.preventDefault(); b.onclick=(ev)=>{ ev.stopPropagation(); alignPop.classList.remove("on"); a1Align(k); }; alignPop.appendChild(b); } }
tsEl("align").onmousedown=(e)=>e.preventDefault();
tsEl("align").onclick=(e)=>{ e.stopPropagation(); const open=alignPop.classList.contains("on"); sizePop.classList.remove("on"); colorPop.classList.remove("on"); if(open){ alignPop.classList.remove("on"); return; } buildAlignPop(); const r=tsEl("align").getBoundingClientRect(); alignPop.style.left=r.left+"px"; alignPop.style.top=(r.bottom+4)+"px"; alignPop.classList.add("on"); };
window.addEventListener("pointerdown",(e)=>{ if(alignPop.classList.contains("on")&&!alignPop.contains(e.target)&&!tsEl("align").contains(e.target)) alignPop.classList.remove("on"); },true);

// ---- 文字の道具のキー（PowerPoint）：Cmd+B/I/U、Cmd+L/E/R/J、Cmd+Shift+> / < ----
// 書き換え中で範囲あり＝選んだ所、範囲なし＝次に打つ文字（揃えは箱まるごと）、書き換えていない＝選んだ文字の箱まるごと（P7・P10・P11・P27・J4）。
// F4 文字の一覧（大きさ・色・書体・揃え）が開いていれば、Esc は一覧だけを閉じる（選択・書き換えは残す）。
window.addEventListener("keydown",(e)=>{
  if(e.isComposing||e.keyCode===229) return;   // §23a X33
  if(e.key==="Escape"){ let closed=false;
    if(sizePop.classList.contains("on")){ sizePop.classList.remove("on"); closed=true; }
    if(colorPop.classList.contains("on")){ colorPop.classList.remove("on"); closed=true; }
    if(alignPop.classList.contains("on")){ alignPop.classList.remove("on"); closed=true; }
    if(typeof fontPop!=="undefined"&&fontPop.classList.contains("on")){ closeFontPop(); closed=true; }
    if(closed){ e.preventDefault(); e.stopImmediatePropagation(); }
    return; }
  const meta=e.metaKey||e.ctrlKey;
  if(e.key==="Enter"&&!meta&&!e.altKey&&PG.state.editing){ const ae0=document.activeElement; const n0=PG.elNode(PG.state.editing.id);
    if(n0&&(ae0===n0||n0.contains(ae0))){ e.preventDefault(); e.stopImmediatePropagation(); PG.a1InsertNewline(); return; } }   // F3・J1 改行は "\n" の文字（Shift+Enter も同じ）
  if(!meta||e.altKey) return;
  if(PG.previewMode()||PG.viewingVersion()||PG.isCropping()) return;
  const ae=document.activeElement;
  if(!PG.state.editing&&ae&&(ae.tagName==="INPUT"||ae.tagName==="TEXTAREA"||ae.tagName==="SELECT"||ae.isContentEditable)) return;   // 入力欄の中のキーは欄に任せる
  if(!textSelected()) return;
  const k=(e.key||"").toLowerCase(); let act=null, val=null;
  if(e.shiftKey){ if(e.key===">"||e.code==="Period") act="grow"; else if(e.key==="<"||e.code==="Comma") act="shrink"; }
  else if(k==="b") act="bold"; else if(k==="i") act="italic"; else if(k==="u") act="underline";
  else if(k==="l"){ act="align"; val="left"; } else if(k==="e"){ act="align"; val="center"; } else if(k==="r"){ act="align"; val="right"; } else if(k==="j"){ act="align"; val="justify"; }
  if(!act) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if(act==="align") a1Align(val); else a1Style(act);
},true);
// P8 書き換え中にカーソル・選択を動かしたら、道具の並びの表示を今の所に合わせる
document.addEventListener("selectionchange",()=>{ if(PG.state.editing){ try{ updateTextTools(); }catch(_){} } });
