// お品書きを見る・window.__ui
// 線：A4｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const menuPanel=document.getElementById("menuPanel"); let menuOpen=false;
// 26b：開く入口は「その他 ▾」の中（PC）と「その他」の板（スマホ）。上の並びのボタンは廃止
function openMenuPanel(){ if(PG.previewMode()) return; fmenu.classList.remove("on"); if(typeof pmore!=="undefined") pmore.classList.remove("on"); menuOpen=true; buildMenuPanel(); menuPanel.classList.add("on"); }
function closeMenuPanel(){ menuOpen=false; menuPanel.classList.remove("on"); }
function buildMenuPanel(){
  const v=PG.catalogView(); menuPanel.innerHTML="";
  const head=document.createElement("div"); head.className="mp-head"; const ti=document.createElement("span"); ti.textContent="お品書き"; head.appendChild(ti); const sp=document.createElement("span"); sp.className="sp"; head.appendChild(sp); const x=document.createElement("button"); x.textContent="閉じる"; x.onclick=closeMenuPanel; head.appendChild(x); menuPanel.appendChild(head);
  const body=document.createElement("div"); body.className="mp-body";
  for(const m of v.menus){ const mh=document.createElement("div"); mh.className="mp-menu"; mh.textContent=m.name||"（名前なし）"; body.appendChild(mh);
    for(const c of m.categories){ if(!c.items.length) continue; const ch=document.createElement("div"); ch.className="mp-cat"; ch.textContent=c.name; body.appendChild(ch);
      for(const it of c.items){ const row=document.createElement("div"); row.className="mp-item"+(it.state==="changed"?" changed":"")+(it.state==="deleted"?" deleted":"")+(it.display?"":" notdisp");
        const nm=document.createElement("div"); nm.className="mp-name"; nm.textContent=it.name; if(it.state==="new"){ const nb=document.createElement("span"); nb.className="mp-new"; nb.textContent="新"; nm.appendChild(nb); } for(const lb of it.labels){ const bb=document.createElement("span"); bb.className="mp-badge"; bb.textContent=lb; nm.appendChild(bb); } row.appendChild(nm);
        const sub=document.createElement("div"); sub.className="mp-sub"; let s=it.price||"（値段なし）"; if(it.status==="paused") s+="・一時休止中"; if(it.season) s+="・"+it.season[0]+"〜"+it.season[it.season.length-1]+"月"; if(!it.display&&it.status!=="paused"&&!it.season) s+="・今は出ません"; sub.textContent=s; row.appendChild(sub);
        if(it.part){ row.onclick=()=>{ const node=document.querySelector('[data-el="'+it.part+'"]'); if(node){ PG.selectOnly(it.part); node.scrollIntoView({block:"center",behavior:"smooth"}); } }; } else row.style.cursor="default";
        body.appendChild(row); } } }
  menuPanel.appendChild(body);
}
const _origOnRender26=window.onRender;
window.onRender=function(){ _origOnRender26(); try{ updateConnNotice(); if(menuOpen) buildMenuPanel(); }catch(_){} };
// 試験台26：UI を決まった形で開く窓口（試験・スクショ用。実機の操作＝右クリック・ダブルクリック・長押しは別にある）
window.__ui={ priceBox:(id)=>{ PG.selectOnly(id); openPriceBox(id); }, picker:(id)=>{ PG.selectOnly(id); openItemPicker(id); }, menuPanel:()=>openMenuPanel(), closeMenuPanel:()=>closeMenuPanel(), addRow:(id)=>{ PG.selectOnly(id); addRowFlow(id); }, fmenuFor:(id)=>{ PG.selectOnly(id); showFmenu(); }, fmenuText:()=>fmenu.textContent };

