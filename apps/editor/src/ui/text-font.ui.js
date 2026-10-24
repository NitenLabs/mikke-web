// 書体の選び箱
// 線：A1｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const fontPop=document.getElementById("fontPop");
function applyFont(fontKey){ if(partMode()) PG.applyPartStyle("font", fontKey); else { beforeTs(); PG.textSetFont(fontKey); } }
let fontPreview=null;
function previewFont(fontKey){ clearFontPreview(); const fam=fontKey?SPEC.FONT[fontKey]:""; const els=[];
  const ids = PG.state.editing? [PG.state.editing.id] : [...PG.state.selected];
  for(const id of ids){ const n=PG.elNode(id); if(n){ els.push([n,n.style.fontFamily]); n.style.fontFamily=fam; } }
  fontPreview=els; }
function clearFontPreview(){ if(!fontPreview)return; for(const [n,v] of fontPreview) n.style.fontFamily=v; fontPreview=null; }
function closeFontPop(){ clearFontPreview(); fontPop.classList.remove("on"); }   // §19b（X21）閉じたら必ず仮表示をやめる（マウスの位置によらない）
function fontSampleText(){ let t="";
  if(PG.state.editing){ const o=PG.editingSelRange(); const runs=PG.textRunsApi(PG.state.editing.id); const plain=runs.map(r=>r.text).join(""); t=(o&&o.e>o.s)?plain.slice(o.s,o.e):plain; }
  else { const prim=PG.primaryTextSel(); if(prim){ t=PG.textRunsApi(prim).map(r=>r.text).join(""); } }
  return (t||"見本").slice(0,12); }
function buildFontPop(){ fontPop.innerHTML="";
  const curF=PG.state.editing? (PG.editingSelFont()||PG.curFontOf(PG.state.editing.id)) : (PG.primaryTextSel()?PG.curFontOf(PG.primaryTextSel()):null);
  const sample=fontSampleText();
  for(const f of PG.fontsApi()){ const b=document.createElement("button"); b.className="frow"+(f.key===curF?" cur":""); b.setAttribute("data-font-opt",f.key);
    const s=document.createElement("div"); s.className="sample"; s.style.fontFamily=SPEC.FONT[f.key]; s.textContent=sample;
    const nm=document.createElement("div"); nm.className="nm"; nm.innerHTML=(f.key===curF?'<span class="ck">✓</span>':"")+f.label+"　"+f.role;
    b.appendChild(s); b.appendChild(nm);
    b.onmousedown=(ev)=>ev.preventDefault();
    b.addEventListener("mouseenter",()=>previewFont(f.key)); b.addEventListener("mouseleave",()=>clearFontPreview());
    b.onclick=(ev)=>{ ev.stopPropagation(); clearFontPreview(); applyFont(f.key); fontPop.classList.remove("on"); };
    fontPop.appendChild(b); } }
tsEl("font").onmousedown=(e)=>e.preventDefault();
tsEl("font").onclick=(e)=>{ e.stopPropagation(); const open=fontPop.classList.contains("on"); sizePop.classList.remove("on"); colorPop.classList.remove("on"); if(open){ closeFontPop(); return; } buildFontPop(); const r=tsEl("font").getBoundingClientRect(); fontPop.style.left=r.left+"px"; fontPop.style.top=(r.bottom+4)+"px"; fontPop.classList.add("on"); };
window.addEventListener("pointerdown",(e)=>{ if(fontPop.classList.contains("on")&&!fontPop.contains(e.target)&&!tsEl("font").contains(e.target)) closeFontPop(); },true);
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&fontPop.classList.contains("on")) closeFontPop(); },true);   // §19b（X21）Esc の直後に仮表示をやめる

// ===== §19 リンク（link）=====
