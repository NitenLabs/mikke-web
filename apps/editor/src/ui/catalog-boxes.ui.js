// 値段の箱・品を選ぶ一覧・行を足す・つながりの知らせ
// 線：A4｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
let priceBox=null, priceBoxCommit=null;
function closePriceBox(){ if(priceBox){ priceBox.remove(); priceBox=null; priceBoxCommit=null; try{ updateConnNotice(); }catch(_){} } }
// F54 金額は 0 以上の整数だけ（上限 9,999,999）。全角の数字・桁の区切り（,）は受け付ける
const PRICE_MAX=9999999;
function checkAmount(raw){ const t=String(raw==null?"":raw).replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).replace(/[,，\s]/g,"");
  if(t==="") return {ok:false,msg:"金額を入れてください"};
  if(!/^\d+$/.test(t)) return {ok:false,msg:/^[-−ー－]/.test(t)?"金額にマイナスは使えません":(/[.．]/.test(t)?"金額は整数（1円単位）で入れてください":"金額は数字で入れてください")};
  const n=parseInt(t,10); if(n>PRICE_MAX) return {ok:false,msg:"金額は 9,999,999円 までです"};
  return {ok:true,n}; }
function openPriceBox(partId){
  closePriceBox(); const eff=PG.effPricesOf(partId); if(!eff) return;
  const node=PG.elNode(partId)||document.querySelector('[data-el="'+partId+'"]');
  const box=document.createElement("div"); box.className="price-box"; box.id="priceBox"; priceBox=box;
  let prices=JSON.parse(JSON.stringify(eff.prices)); if(!prices.length) prices=[{type:"fixed",amount:0}];
  const TYPES=[["fixed","○円"],["from","○円〜"],["market","時価"],["ask","応相談"],["free","無料"]];
  function redraw(){
    box.innerHTML="";
    const h=document.createElement("div"); h.className="pb-head"; h.textContent="値段（"+eff.name+"）"; box.appendChild(h);
    prices.forEach((p,i)=>{
      const row=document.createElement("div"); row.className="pb-row";
      const nm=document.createElement("input"); nm.className="pb-name"; nm.placeholder="名前（空でもよい）"; nm.value=p.name||""; nm.oninput=()=>{ if(nm.value) p.name=nm.value; else delete p.name; };
      const ty=document.createElement("select"); ty.className="pb-type"; for(const [v,l] of TYPES){ const o=document.createElement("option"); o.value=v; o.textContent=l; if(v===p.type)o.selected=true; ty.appendChild(o); } ty.onchange=()=>{ p.type=ty.value; redraw(); };
      const am=document.createElement("input"); am.className="pb-amt"; am.type="text"; am.inputMode="numeric"; am.autocomplete="off"; am.value=(p._raw!=null?p._raw:(p.amount!=null?p.amount:"")); am.placeholder="金額"; am.oninput=()=>{ p._raw=am.value; const c=checkAmount(am.value); if(c.ok) p.amount=c.n; showWarn(c.ok?"":c.msg); }; if(["market","ask","free"].includes(p.type)) am.disabled=true;
      // F7 名前の欄が打てる幅・金額欄が箱からはみ出さない：行は格子（名前は残りの幅いっぱい、種類・金額は決まった幅）
      row.style.cssText="display:grid;grid-template-columns:minmax(64px,1fr) 82px 84px"+(prices.length>1?" 26px":"")+";gap:6px;align-items:center;margin-bottom:6px";
      for(const el of [nm,ty,am]) el.style.cssText+=";width:100%;min-width:0;box-sizing:border-box";
      row.appendChild(nm); row.appendChild(ty); row.appendChild(am);
      if(prices.length>1){ const del=document.createElement("button"); del.className="pb-del"; del.textContent="×"; del.title="この選択肢を消す"; del.onclick=()=>{ prices.splice(i,1); redraw(); }; row.appendChild(del); }
      box.appendChild(row);
    });
    const addb=document.createElement("button"); addb.className="pb-add"; addb.textContent="＋ 選択肢を足す"; addb.onclick=()=>{ prices.push({type:"fixed",amount:0}); redraw(); }; box.appendChild(addb);
    const foot=document.createElement("div"); foot.className="pb-foot";
    const cancel=document.createElement("button"); cancel.className="pb-cancel"; cancel.textContent="やめる"; cancel.onclick=closePriceBox;
    const ok=document.createElement("button"); ok.className="pb-ok"; ok.textContent="決める"; ok.onclick=()=>{ decide(false); };
    const warn=document.createElement("div"); warn.className="pb-warn"; warn.setAttribute("role","alert"); warn.style.cssText="display:none;color:#b00020;font-size:12px;margin:0 0 6px"; box.appendChild(warn);
    foot.appendChild(cancel); foot.appendChild(ok); box.appendChild(foot);
  }
  function showWarn(t){ const w=box.querySelector(".pb-warn"); if(!w) return; w.textContent=t||""; w.style.display=t?"block":"none"; }
  // 決める（決めるボタン・Enter・箱の外を押した＝ F55 PowerPoint と同じく外で確定）。変な金額は決めずに知らせる（F54）
  const MONEY=["fixed","from","range"];
  function decide(outside){
    for(const p of prices){ if(!MONEY.includes(p.type)) continue; const c=checkAmount(p._raw!=null?p._raw:p.amount); if(!c.ok){ showWarn(c.msg); if(outside){ closePriceBox(); window.pgToast&&window.pgToast("値段は変えていません（"+c.msg+"）"); } else { window.pgToast&&window.pgToast(c.msg); } return false; } p.amount=c.n; }
    const out=prices.map(p=>{ const q={type:p.type}; if(p.name)q.name=p.name; if(MONEY.includes(p.type))q.amount=(p.amount||0); if(p.type==="range")q.amount2=(p.amount2||0); return q; });
    const strip=(a)=>JSON.stringify((a||[]).map(p=>{ const q={type:p.type}; if(p.name)q.name=p.name; if(p.amount!=null&&MONEY.includes(p.type))q.amount=p.amount; if(p.type==="range")q.amount2=p.amount2||0; return q; }));
    closePriceBox(); if(strip(out)!==strip(eff.prices)) PG.setPrices(partId,out); return true; }
  priceBoxCommit=()=>decide(true);
  box.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229) return; if(e.key==="Enter"&&e.target&&e.target.tagName==="INPUT"){ e.preventDefault(); e.stopPropagation(); decide(false); } else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closePriceBox(); } });
  redraw(); document.body.appendChild(box); try{ updateConnNotice(); }catch(_){}   // F7 値段の箱を開いたら連動の知らせは隠す（箱に重ならない）
  const r=node?node.getBoundingClientRect():{left:innerWidth/2-160,right:innerWidth/2+160,top:innerHeight/2,bottom:innerHeight/2};
  let left=Math.min(r.left, innerWidth-8-box.offsetWidth); left=Math.max(8,left);
  const bottomLimit=innerHeight-76;   // F7 下の知らせ（pg-toast・下から 28px）にボタンが隠れない高さまで
  let top=r.bottom+6; if(top+box.offsetHeight>bottomLimit) top=Math.max(8, r.top-box.offsetHeight-6); if(top+box.offsetHeight>bottomLimit) top=Math.max(8,bottomLimit-box.offsetHeight);
  box.style.left=Math.round(left)+"px"; box.style.top=Math.round(top)+"px";
}
window.addEventListener("pointerdown",(e)=>{ if(priceBox&&!priceBox.contains(e.target)){ if(priceBoxCommit) priceBoxCommit(); else closePriceBox(); } },true);   // F55 外を押したら決める

// ---- 品を選ぶ一覧（品を足す…） ----
let pickerBox=null;
function closePicker(){ if(pickerBox){ pickerBox.remove(); pickerBox=null; } }
function openItemPicker(partId){
  closePicker(); const info=PG.partInfo(partId); if(!info) return; const gid=info.gid; const data=PG.itemPickerData(gid);
  const box=document.createElement("div"); box.className="picker-box"; box.id="pickerBox"; pickerBox=box;
  const h=document.createElement("div"); h.className="pk-head"; h.textContent="品を足す（"+data.menuName+"）"; box.appendChild(h);
  const list=document.createElement("div"); list.className="pk-list"; box.appendChild(list);
  for(const cat of data.categories){ const ch=document.createElement("div"); ch.className="pk-cat"; ch.textContent=cat.name; list.appendChild(ch);
    for(const it of cat.items){ const b=document.createElement("button"); b.className="pk-item"+(it.shown?" shown":"")+(it.displayable?"":" out");
      b.textContent=it.name+(it.shown?"（追加済み）":"")+((!it.displayable&&!it.shown)?("（"+it.reason+"）"):"");
      if(it.shown){ b.disabled=true; } else b.onclick=()=>{ PG.cardsAddExisting(gid,it.itemId); closePicker(); }; list.appendChild(b); } }
  const newb=document.createElement("button"); newb.className="pk-new"; newb.textContent="＋ 新しい品を作る";
  newb.onclick=()=>{ let nc=list.querySelector(".pk-newcats"); if(nc){ nc.remove(); return; } nc=document.createElement("div"); nc.className="pk-newcats"; const t=document.createElement("div"); t.className="pk-cat"; t.textContent="どの括りに作りますか"; nc.appendChild(t); for(const cat of data.categories){ const cb=document.createElement("button"); cb.className="pk-item"; cb.textContent="「"+cat.name+"」に作る"; cb.onclick=()=>{ const r=PG.cardsAddNew(gid,cat.categoryId); closePicker(); if(r&&r.partId){ const nid="card_name_"+r.partId; setTimeout(()=>{ PG.selectOnly(nid); PG.startEdit(nid); },30); } }; nc.appendChild(cb); } list.appendChild(nc); list.scrollTop=list.scrollHeight; };
  box.appendChild(newb); document.body.appendChild(box);
  box.style.left=Math.max(8,Math.min(innerWidth-8-box.offsetWidth,(innerWidth-box.offsetWidth)/2))+"px";
  box.style.top=Math.max(8,(innerHeight-box.offsetHeight)/2)+"px";
}
window.addEventListener("pointerdown",(e)=>{ if(pickerBox&&!pickerBox.contains(e.target)) closePicker(); },true);
// 表の行を足す（直接作って名前の書き換えへ）
function addRowFlow(partId){ const r=PG.tableAddRow(partId); if(r&&r.partId){ const nid="row_name_"+r.partId; setTimeout(()=>{ PG.selectOnly(nid); PG.startEdit(nid); },30); } }

// ---- 連動の知らせ（品の並び・表の名前/説明/値段を選んでいる間） ----
function updateConnNotice(){
  let n=document.getElementById("connNotice");
  const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null;
  const show = one && PG.isRepeat(one) && !PG.state.editing && !PG.previewMode() && !PG.viewingVersion() && !priceBox;
  if(!show){ if(n) n.remove(); return; }
  if(!n){ n=document.createElement("div"); n.id="connNotice"; n.className="conn-notice"; document.body.appendChild(n); }
  n.textContent="お品書きと連動しています。書き換えるとお品書きも変わります";
  const node=PG.elNode(one)||document.querySelector('[data-el="'+one+'"]'); if(!node){ n.remove(); return; }
  const r=node.getBoundingClientRect(); let top=r.top-n.offsetHeight-4; if(top<4) top=r.bottom+4;
  let left=Math.max(6,Math.min(innerWidth-6-n.offsetWidth, r.left)); n.style.left=Math.round(left)+"px"; n.style.top=Math.round(top)+"px";
}

// ---- お品書きを見る（右の板・幅360） ----
