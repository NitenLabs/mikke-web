// リンクの箱・部品のリンク
// 線：A1｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const linkPanel=document.getElementById("linkPanel");
const linkChip=document.getElementById("linkChip");
let linkCtx=null;   // {mode:"part"|"element", part, s, e, el, cur}
function sameLink(a,b){ return JSON.stringify(a||null)===JSON.stringify(b||null); }
function placePanelNear(rect){ const vw=innerWidth, vh=innerHeight; linkPanel.classList.add("on"); const pw=linkPanel.offsetWidth||280, ph=linkPanel.offsetHeight||300;
  const tbb=document.getElementById("toolbar").getBoundingClientRect().bottom;   // §19b 上の並びの下〜画面下端−8に収める
  let left=Math.min(rect.left, vw-8-pw); left=Math.max(8,left);
  let top=rect.bottom+8; if(top+ph>vh-8) top=rect.top-ph-8;   // §4 下に入らなければ選んだ範囲の上
  top=Math.max(tbb+4, Math.min(top, vh-8-ph));
  linkPanel.style.left=Math.round(left)+"px"; linkPanel.style.top=Math.round(top)+"px"; }
function inPageSections(){ return PG.api.sectionList().map(s=>({sec:s.id, label:PG.friendlySec(s.id)})); }
function buildLinkPanel(cur){ linkPanel.innerHTML="";
  const seg=(t)=>{ const d=document.createElement("div"); d.className="seg"; d.textContent=t; linkPanel.appendChild(d); };
  const opt=(label,val,link,disabled)=>{ const b=document.createElement("button"); b.className="opt"+(sameLink(link,cur)?" cur":""); b.setAttribute("data-link-opt",label); if(disabled){ b.disabled=true; }
    const nm=document.createElement("span"); nm.textContent=label; b.appendChild(nm);
    if(val){ const v=document.createElement("span"); v.className="v"; v.textContent=val; b.appendChild(v); }
    b.onmousedown=(ev)=>ev.preventDefault(); b.onclick=(ev)=>{ ev.stopPropagation(); if(!disabled) chooseLink(link); }; linkPanel.appendChild(b); };
  // 1. お店の情報から
  seg("お店の情報から");
  const storeRow=(label,kind)=>opt(label, PG.storeValueText(kind), {kind}, !PG.storeHas(kind));
  storeRow("電話する","tel"); storeRow("地図で見る","map"); storeRow("Instagram","instagram"); storeRow("LINE","line"); storeRow("メールする","mail");
  // 2. このサイトのページ
  seg("このサイトのページ");
  for(const p of PG.PAGES) opt(p.label, p.slug, {kind:"page",page:p.id});
  for(const s of inPageSections()) opt("このページの『"+s.label+"』", "", {kind:"anchor",sec:s.sec});
  // 3. そのほかのホームページ
  seg("そのほかのホームページ");
  const ext=document.createElement("div"); ext.className="ext";
  const inp=document.createElement("input"); inp.type="text"; inp.placeholder="https://… / メール"; inp.setAttribute("data-link-url","");
  const go=document.createElement("button"); go.textContent="つなぐ"; go.setAttribute("data-link-connect","");
  ext.appendChild(inp); ext.appendChild(go); linkPanel.appendChild(ext);
  const err=document.createElement("div"); err.className="err"; err.style.display="none"; err.setAttribute("data-link-err",""); err.textContent="アドレスの形になっていません"; linkPanel.appendChild(err);
  const tryConnect=()=>{ const lk=PG.parseExternalLink(inp.value); if(!lk){ err.style.display="block"; return; } err.style.display="none"; chooseLink(lk); };
  go.onmousedown=(ev)=>ev.preventDefault(); go.onclick=(ev)=>{ ev.stopPropagation(); tryConnect(); };
  inp.onkeydown=(ev)=>{ if(ev.isComposing||ev.keyCode===229)return;/*§23a X33*/ if(ev.key==="Enter"){ ev.preventDefault(); tryConnect(); } ev.stopPropagation(); };
}
function openLinkPanelPart(part, s, e, anchorRect){ linkCtx={mode:"part", part, s, e, cur:currentPartLink(part,s,e)}; buildLinkPanel(linkCtx.cur); placePanelNear(anchorRect); }
function openLinkPanelElement(id, anchorRect){ linkCtx={mode:"element", el:id, cur:(PG.elementLinkApi(id)||{}).link||null}; buildLinkPanel(linkCtx.cur); placePanelNear(anchorRect); }
function currentPartLink(part,s,e){ const ls=PG.linksApi(part).runs.filter(r=>r.s<e&&r.e>s); if(ls.length===1 && ls[0].s<=s && ls[0].e>=e) return ls[0].link; return null; }
function chooseLink(link){ if(!linkCtx) return; const ctx=linkCtx; linkPanel.classList.remove("on"); linkCtx=null;
  if(ctx.mode==="element"){ PG.setElementLink(ctx.el, link); }
  else { if(PG.state.editing && PG.state.editing.id===ctx.part){ PG.applyPartStyleRange("link", link, ctx.s, ctx.e); } else { PG.setPartLinkCommitted(ctx.part, ctx.s, ctx.e, link); } } }
// リンクのボタン（文の一部）＝書き換え中＋選択あり
tsEl("link").onmousedown=(e)=>e.preventDefault();
tsEl("link").onclick=(e)=>{ e.stopPropagation(); if(tsEl("link").disabled) return; const one=a1BoxLinkSel(); if(one){ const n=PG.elNode(one); const r=n?n.getBoundingClientRect():e.currentTarget.getBoundingClientRect(); openLinkPanelElement(one,{left:r.left,top:r.top,bottom:r.bottom}); return; } openLinkFromSelection(); };
// P14 書き換えていない文字の箱を1つ選んでいる＝その箱まるごとにリンク
function a1BoxLinkSel(){ if(PG.state.editing||isPhone()) return null; const sel=[...PG.state.selected]; return (sel.length===1&&PG.isText(sel[0])&&PG.canElementLink(sel[0]))?sel[0]:null; }
function openLinkFromSelection(){ if(!PG.state.editing) return; const o=PG.editingSelRange(); if(!o||o.e<=o.s) return;
  const r=PG.editingRangeRect(o.s,o.e)||{left:0,top:0,bottom:0};   // §19b（X22）選んだ範囲のすぐ下に出す（押す前の範囲を覚えて使う）
  openLinkPanelPart(PG.state.editing.id, o.s, o.e, {left:r.left, top:r.top, bottom:r.bottom}); }
// 外のクリック・Esc で閉じる（何も変えない）
window.addEventListener("pointerdown",(e)=>{ if(linkPanel.classList.contains("on")&&!linkPanel.contains(e.target)&&!(e.target.closest&&(e.target.closest('[data-ts="link"]')||e.target.closest('#tElemLink')||e.target.closest('[data-link-chip]')))){ linkPanel.classList.remove("on"); linkCtx=null; } },true);

// ===== §19 部品まるごとリンク（写真・ボタン）=====
const elemTools=document.getElementById("elemTools");
function updateElemTools(){ const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null;
  const show=!!(one && PG.canElementLink(one) && !PG.isText(one) && !PG.state.editing && !isPhone());   // P14 文字の箱は文字の道具の「リンク」で付ける
  elemTools.style.display=show?"inline-flex":"none"; }
document.getElementById("tElemLink").onmousedown=(e)=>e.preventDefault();
document.getElementById("tElemLink").onclick=(e)=>{ e.stopPropagation(); const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null; if(!one||!PG.canElementLink(one)) return; const n=PG.elNode(one); const r=n?n.getBoundingClientRect():e.currentTarget.getBoundingClientRect(); openLinkPanelElement(one,{left:r.left,top:r.top,bottom:r.bottom}); };   // §19b（X22）部品のすぐ下（入らなければ上）

// ===== §20 列（品の並び） =====
