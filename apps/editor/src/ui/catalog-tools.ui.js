// 列の選び箱・品の道具（販売・出す月・ラベル・メニュー）
// 線：A4｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const cardsTools=document.getElementById("cardsTools");
const colsPop=document.getElementById("colsPop");
function cardsSelected(){ const sel=[...PG.state.selected]; return sel.length===1 && PG.canonId(sel[0])==="I_cards"; }
function updateCardsTools(){ const show=cardsSelected() && !PG.state.editing && !isPhone(); cardsTools.style.display=show?"inline-flex":"none"; if(!show) closeColsPop(); }
function closeColsPop(){ PG.clearColsPreview(); colsPop.classList.remove("on"); }
function buildColsPop(){ colsPop.innerHTML=""; const info=PG.colsApi(); const row=document.createElement("div"); row.className="swrow";
  for(const opt of info.enabled){ const b=document.createElement("button"); b.className="sw"+(opt.n===info.current?" cur":""); b.setAttribute("data-cols-opt",String(opt.n)); if(!opt.enabled) b.disabled=true;
    const thumb=document.createElement("div"); thumb.className="thumb"; thumb.style.gridTemplateColumns="repeat("+opt.n+",1fr)"; for(let i=0;i<opt.n;i++){ thumb.appendChild(document.createElement("i")); }
    const cap=document.createElement("div"); cap.className="cap"; cap.textContent=opt.n+"列"; b.appendChild(thumb); b.appendChild(cap);
    b.onmousedown=(e)=>e.preventDefault();
    if(opt.enabled){ b.addEventListener("mouseenter",()=>PG.setColsPreview("I_cards",opt.n)); b.addEventListener("mouseleave",()=>PG.clearColsPreview());
      b.onclick=(e)=>{ e.stopPropagation(); PG.clearColsPreview(); PG.setCols("I_cards",opt.n); colsPop.classList.remove("on"); }; }
    row.appendChild(b); }
  colsPop.appendChild(row); }
document.getElementById("tCols").onmousedown=(e)=>e.preventDefault();
document.getElementById("tCols").onclick=(e)=>{ e.stopPropagation(); if(colsPop.classList.contains("on")){ closeColsPop(); return; } buildColsPop(); const r=e.currentTarget.getBoundingClientRect(); const vw=innerWidth; colsPop.classList.add("on"); const pw=colsPop.offsetWidth||160; let left=Math.min(r.left, vw-8-pw); left=Math.max(8,left); colsPop.style.left=Math.round(left)+"px"; colsPop.style.top=(r.bottom+4)+"px"; };
window.addEventListener("pointerdown",(e)=>{ if(colsPop.classList.contains("on")&&!colsPop.contains(e.target)&&!document.getElementById("tCols").contains(e.target)&&!(e.target.closest&&e.target.closest("#moreMenu"))) closeColsPop(); },true);
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&colsPop.classList.contains("on")) closeColsPop(); },true);

// ===== 試験台28 §2.5：品を選んだときの道具（販売 ▾・出す月 ▾・ラベル ▾・メニュー ▾）=====
// 出し方は「明るさ ▾」「列 ▾」と同じ（押すと下に一覧。外・Esc で閉じる）。品の1件（または中の部品）を選んでいる間だけ出す。
const itemTools=document.getElementById("itemTools");
const sellPop=document.getElementById("sellPop"), monthPop=document.getElementById("monthPop"), labelPop=document.getElementById("labelPop"), menuPop=document.getElementById("menuPop");
const SELL_OPTS=[["onSale","販売中"],["paused","休んでいる"],["ended","終わり"]];
let _openItemPop=null;   // {pop, build, btn}
function itemSelId(){ const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null; if(!one||!PG.isRepeat(one)) return null; return PG.itemCtx(one)?one:null; }
function closeItemPops(){ for(const p of [sellPop,monthPop,labelPop,menuPop]) p.classList.remove("on"); _openItemPop=null; }
function itemToolsSelected(){ return !!itemSelId() && !PG.state.editing && !isPhone(); }
function updateItemTools(){ const show=itemToolsSelected(); itemTools.style.display=show?"inline-flex":"none"; if(!show){ closeItemPops(); return; }
  if(_openItemPop){ const id=itemSelId(); if(id) _openItemPop.build(id); else closeItemPops(); } }
// 一覧の中身
function buildSellPop(id){ sellPop.innerHTML=""; const c=PG.itemCtx(id); if(!c) return; for(const [v,label] of SELL_OPTS){ const b=document.createElement("button"); b.className="ip-opt"+(c.status===v?" cur":""); b.setAttribute("data-sell-opt",v); b.textContent=(c.status===v?"✓ ":"　")+label; b.onmousedown=(e)=>e.preventDefault(); b.onclick=(e)=>{ e.stopPropagation(); PG.setItemStatus(id,v); closeItemPops(); }; sellPop.appendChild(b); } }
function buildMonthPop(id){ monthPop.innerHTML=""; const c=PG.itemCtx(id); if(!c) return; const ms=new Set(c.months);
  const any=document.createElement("button"); any.className="ip-any"+(ms.size?"":" on"); any.setAttribute("data-month-any","1"); any.textContent="いつでも"; any.onmousedown=(e)=>e.preventDefault(); any.onclick=(e)=>{ e.stopPropagation(); PG.setItemMonths(id,[]); }; monthPop.appendChild(any);
  const grid=document.createElement("div"); grid.className="ip-months";
  for(let m=1;m<=12;m++){ const b=document.createElement("button"); b.className="ip-m"+(ms.has(m)?" on":""); b.setAttribute("data-month",String(m)); b.textContent=m+"月"; b.onmousedown=(e)=>e.preventDefault(); b.onclick=(e)=>{ e.stopPropagation(); const nm=new Set(PG.itemCtx(id).months); if(nm.has(m)) nm.delete(m); else nm.add(m); PG.setItemMonths(id,[...nm]); }; grid.appendChild(b); }
  monthPop.appendChild(grid); }
function buildLabelPop(id){ labelPop.innerHTML=""; const c=PG.itemCtx(id); if(!c) return;
  for(const l of c.labels){ const b=document.createElement("button"); b.className="ip-opt"+(l.on?" on":""); b.setAttribute("data-label-opt",l.id); const ck=document.createElement("span"); ck.className="ck"; ck.textContent=l.on?"✓":""; b.appendChild(ck); const nm=document.createElement("span"); nm.textContent=l.name; b.appendChild(nm); b.onmousedown=(e)=>e.preventDefault(); b.onclick=(e)=>{ e.stopPropagation(); const cur=PG.itemCtx(id).labels.filter(x=>x.on).map(x=>x.id); const next=l.on?cur.filter(x=>x!==l.id):[...cur,l.id]; PG.setItemLabels(id,next); }; labelPop.appendChild(b); }
  const wrap=document.createElement("div"); wrap.className="ip-newlabel";
  const addb=document.createElement("button"); addb.className="ip-addbtn"; addb.setAttribute("data-label-add","1"); addb.textContent="＋ 新しいラベル";
  addb.onmousedown=(e)=>e.preventDefault(); addb.onclick=(e)=>{ e.stopPropagation(); wrap.innerHTML=""; const inp=document.createElement("input"); inp.type="text"; inp.placeholder="ラベルの名前"; inp.setAttribute("data-label-input","1"); const ok=document.createElement("button"); ok.className="ip-addbtn"; ok.style.width="auto"; ok.textContent="足す"; const commitNew=()=>{ const nm=inp.value.trim(); if(!nm){ let h=wrap.querySelector(".ip-warn"); if(!h){ h=document.createElement("div"); h.className="ip-warn"; h.style.cssText="color:#b00020;font-size:12px;margin-top:4px"; wrap.appendChild(h); } h.textContent="名前を入れてください"; if(window.pgToast) window.pgToast("ラベルの名前を入れてください"); inp.focus(); return; } PG.addItemLabel(id,nm); }; ok.onmousedown=(ev)=>ev.preventDefault(); ok.onclick=(ev)=>{ ev.stopPropagation(); commitNew(); }; inp.onkeydown=(ev)=>{ if(ev.isComposing||ev.keyCode===229){ ev.stopPropagation(); return; } if(ev.key==="Enter"){ ev.preventDefault(); commitNew(); } ev.stopPropagation(); }; wrap.appendChild(inp); wrap.appendChild(ok); inp.focus(); };   // J33 変換を決める Enter（229）ではラベルを作らない／F49 空の名前は知らせる
  wrap.appendChild(addb); labelPop.appendChild(wrap); }
function buildMenuPop(id){ menuPop.innerHTML=""; const c=PG.itemCtx(id); if(!c) return;
  for(const m of c.menus){ const canRemove=m.on?PG.canRemoveMenu(id,m.id):true; const b=document.createElement("button"); b.className="ip-opt"+(m.on?" on":""); b.setAttribute("data-menu-opt",m.id); if(m.on&&!canRemove) b.disabled=true;   // §2.5 最後の1つは外せない＝灰色
    const ck=document.createElement("span"); ck.className="ck"; ck.textContent=m.on?"✓":""; b.appendChild(ck); const nm=document.createElement("span"); nm.textContent=m.name; b.appendChild(nm);
    b.onmousedown=(e)=>e.preventDefault(); if(!b.disabled) b.onclick=(e)=>{ e.stopPropagation(); PG.setItemMenu(id,m.id,!m.on); }; menuPop.appendChild(b); } }
// 開く・閉じる（colsPop と同じ出し方）
function openItemPop(pop,btn,build){ const id=itemSelId(); if(!id) return; closeItemPops(); build(id); const r=btn.getBoundingClientRect(); pop.classList.add("on"); const pw=pop.offsetWidth||200; let left=Math.min(r.left, innerWidth-8-pw); left=Math.max(8,left); pop.style.left=Math.round(left)+"px"; let top=r.bottom+4; const ph=pop.offsetHeight||0; if(top+ph>innerHeight-8) top=Math.max(8, innerHeight-8-ph); pop.style.top=Math.round(top)+"px"; _openItemPop={pop,build,btn}; }
function wireItemBtn(btnId,pop,build){ const btn=document.getElementById(btnId); btn.onmousedown=(e)=>e.preventDefault(); btn.onclick=(e)=>{ e.stopPropagation(); if(pop.classList.contains("on")){ closeItemPops(); return; } openItemPop(pop,btn,build); }; }
wireItemBtn("tSell",sellPop,buildSellPop); wireItemBtn("tMonth",monthPop,buildMonthPop); wireItemBtn("tLabels",labelPop,buildLabelPop); wireItemBtn("tMenus",menuPop,buildMenuPop);
window.addEventListener("pointerdown",(e)=>{ if(!_openItemPop) return; const p=_openItemPop.pop; if(!p.contains(e.target)&&!_openItemPop.btn.contains(e.target)&&!(e.target.closest&&e.target.closest("#moreMenu"))) closeItemPops(); },true);
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return; if(e.key==="Escape"&&_openItemPop) closeItemPops(); },true);
// 試験の窓口：道具の一覧をプログラムから開く
window.__itemtool=(which)=>{ const map={sell:["tSell",sellPop,buildSellPop],month:["tMonth",monthPop,buildMonthPop],labels:["tLabels",labelPop,buildLabelPop],menus:["tMenus",menuPop,buildMenuPop]}; const m=map[which]; if(!m) return; const btn=document.getElementById(m[0]); openItemPop(m[1],btn,m[2]); };

// ===== §27 配置（揃え・整列）の「配置 ▾」=====
