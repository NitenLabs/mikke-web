// セクションの並び替え（ドラッグ）・足す所・種類の選び箱
// 線：A3｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
(function(){
  let rd=null; const THRESH=3;
  function dropLine(){ let l=document.getElementById("reorderDropLine"); if(!l){ l=document.createElement("div"); l.id="reorderDropLine"; l.style.cssText="position:fixed;z-index:78;background:#06c;pointer-events:none;border-radius:1.5px"; document.body.appendChild(l); } return l; }
  function clearDropLine(){ const l=document.getElementById("reorderDropLine"); if(l) l.remove(); }
  const onMenuPage=()=>PG.currentPage&&PG.currentPage()==="pg_menu";
  function rowFrom(t){ return t&&t.closest? t.closest('.krow[data-plc]'):null; }
  function cardFrom(t){ return t&&t.closest? t.closest('.card[data-item]'):null; }
  function cardGid(cardEl){ const g=cardEl.closest('.cards[data-el]'); return g?g.getAttribute('data-el'):"I_cards"; }
  function cardNameEl(cardEl){ return cardEl.querySelector('[data-el^="card_name_"],[data-el*="__card_name_"]'); }
  function rowNameEl(rowEl){ return rowEl.querySelector('[data-el^="row_name_"],[data-el*="__row_name_"]'); }
  // この札の中の1件が選ばれている＝PowerPoint の2回目（1回目は塊選択＝列▾・塊移動のまま）。そのときだけドラッグで並べ替える。
  function cardArmed(cardEl){ const cid=cardEl.getAttribute('data-card'); const sel=PG.state&&PG.state.selected; if(!sel) return false; return [...sel].some(id=>{ const m=id.match(/card_(?:name|desc|price|photo)_(.+)$/); return m&&m[1]===cid; }); }
  // お品書き本体：落とし先＝どの括り（.kcat）の、どの行の前か（null＝括りの最後）
  function rowTarget(clientY){
    const kcats=[...document.querySelectorAll('#host_menu .kcat')];
    if(!kcats.length) return null;
    let kc=kcats.find(k=>{ const r=k.getBoundingClientRect(); return clientY>=r.top&&clientY<=r.bottom; });
    if(!kc){ let best=null,bd=1e9; for(const k of kcats){ const r=k.getBoundingClientRect(); const d=clientY<r.top?r.top-clientY:clientY-r.bottom; if(d<bd){bd=d;best=k;} } kc=best; }
    const cat=kc.getAttribute('data-cat');
    const rows=[...kc.querySelectorAll('.krow[data-plc]')].filter(r=>!rd||r.getAttribute('data-plc')!==rd.plc);
    let before=null;
    for(const r of rows){ const b=r.getBoundingClientRect(); if(clientY < b.top+b.height/2){ before=r.getAttribute('data-plc'); break; } }
    let y,x,w;
    if(before){ const r=rows.find(rr=>rr.getAttribute('data-plc')===before).getBoundingClientRect(); y=r.top; x=r.left; w=r.width; }
    else if(rows.length){ const r=rows[rows.length-1].getBoundingClientRect(); y=r.bottom; x=r.left; w=r.width; }
    else { const h=kc.querySelector('[data-el]'); const r=(h||kc).getBoundingClientRect(); y=r.bottom+6; x=r.left; w=Math.max(r.width,120); }
    return { cat, before, y, x, w };
  }
  // トップのおすすめ：落とし先＝どの札の前か（読み順。縦線）。null＝最後
  function cardTarget(clientX,clientY){
    const cards=[...document.querySelectorAll('.cards[data-el] .card[data-item]')].filter(c=>!rd||c.getAttribute('data-item')!==rd.item);
    if(!cards.length) return { before:null, line:null };
    let before=null, ref=null, after=false;
    for(const c of cards){ const b=c.getBoundingClientRect(); if(clientY>=b.top-8&&clientY<=b.bottom+8 && clientX < b.left+b.width/2){ before=c.getAttribute('data-item'); ref=c; break; } }
    if(!before){ let best=null,bd=1e9; for(const c of cards){ const b=c.getBoundingClientRect(); const dy=Math.abs((b.top+b.bottom)/2-clientY); if(dy<bd){bd=dy;best=c;} } ref=best; after=true; }
    const r=ref.getBoundingClientRect();
    return { before, line:{ x:(after? r.right+3 : r.left-3), y:r.top, h:r.height } };
  }
  window.addEventListener("pointerdown",(e)=>{
    if(isPhone()||(PG.previewMode&&PG.previewMode())||(PG.viewingVersion&&PG.viewingVersion())) return;
    if(e.button!==0) return;
    if(PG.state&&PG.state.editing&&e.target.closest&&e.target.closest("[contenteditable]")) return;   // 書き換え中の文字は素通し（並べ替えにしない）
    const row=onMenuPage()?rowFrom(e.target):null;
    if(row){ if(PG.state&&PG.state.editing) PG.commitEdit(); rd={ kind:"row", plc:row.getAttribute('data-plc'), cat:row.getAttribute('data-cat'), nameEl:rowNameEl(row), sx:e.clientX, sy:e.clientY, moved:false }; e.stopPropagation(); return; }
    const card=(!onMenuPage())?cardFrom(e.target):null;
    if(card && cardArmed(card)){ if(PG.state&&PG.state.editing) PG.commitEdit(); rd={ kind:"card", item:card.getAttribute('data-item'), gid:cardGid(card), nameEl:cardNameEl(card), sx:e.clientX, sy:e.clientY, moved:false }; e.stopPropagation(); return; }
  },true);
  window.addEventListener("pointermove",(e)=>{
    if(!rd) return;
    e.stopPropagation();
    if(!rd.moved){ if(Math.hypot(e.clientX-rd.sx,e.clientY-rd.sy)<=THRESH){ e.preventDefault(); return; } rd.moved=true; }
    e.preventDefault();
    const L=dropLine();
    if(rd.kind==="row"){ const t=rowTarget(e.clientY); rd.target=t; if(t){ L.style.left=t.x+"px"; L.style.top=(t.y-1)+"px"; L.style.width=t.w+"px"; L.style.height="2px"; } }
    else { const t=cardTarget(e.clientX,e.clientY); rd.target=t; if(t&&t.line){ L.style.left=t.line.x+"px"; L.style.top=t.line.y+"px"; L.style.width="2px"; L.style.height=t.line.h+"px"; } }
  },true);
  window.addEventListener("pointerup",(e)=>{
    if(!rd) return; const r=rd; rd=null; clearDropLine();
    e.stopPropagation();
    if(!r.moved){ // 動かしていない＝クリック（並べ替えしない）
      if(r.kind==="card" && r.nameEl){ PG.selectMany([r.nameEl.getAttribute('data-el')]); showFmenu(); }   // 札は中の1件を選ぶ（右クリックと同じ箱も出す）
      else if(r.kind==="row" && r.nameEl){ PG.selectMany([r.nameEl.getAttribute('data-el')]); }   // 試験台28 §2.5：お品書き本体の行は1回クリックで選ぶ（上の並びに道具を出すため。箱は右クリック）
      return; }
    if(r.kind==="row"){ const t=r.target||rowTarget(e.clientY); if(t) PG.menuMoveRow(r.plc, t.cat, t.before); }
    else { const t=r.target||cardTarget(e.clientX,e.clientY); PG.cardsMove(r.gid, r.item, t?t.before:null); }
  },true);
})();

// ---- §2 セクションを足す「＋」。セクションの境目（と上端・下端）に出す。押すと型の一覧（特集／品）----
function updateAddZones(){
  const wrap=document.getElementById("sectionwrap"); if(!wrap) return;
  wrap.querySelectorAll(".sec-add-zone").forEach(n=>n.remove());
  const wraps=[...wrap.querySelectorAll(".sec-wrap")];
  const mk=(n)=>{ const z=document.createElement("div"); z.className="sec-add-zone"; z.setAttribute("data-sec-add",String(n));
    const b=document.createElement("button"); b.type="button"; b.className="sec-add-btn"; b.textContent="＋"; b.setAttribute("data-sec-add-btn",String(n));
    b.onclick=(ev)=>{ ev.stopPropagation(); showTypePicker(n, b.getBoundingClientRect()); }; z.appendChild(b);
    // §6/§7（試験台16）スマホ：押せる範囲 44×44（data-hit="sec-add"）。なぞればスクロール（touch-action:manipulation・tap のみ picker）
    const hit=document.createElement("div"); hit.className="sec-add-hit"; hit.setAttribute("data-hit","sec-add"); hit.setAttribute("data-sec-add-hit",String(n));
    hit.onclick=(ev)=>{ ev.stopPropagation(); showTypePicker(n, b.getBoundingClientRect()); }; z.appendChild(hit);
    return z; };
  // 試験台28：＋は「動かせるセクション（そのページの中の並び）」の間と上下だけに出す。
  // 記録 12.8「一番上の上・一番下の下に＋を出さない」は動かせない・消せないセクションすべてに当たる
  // ＝ヘッダー・フッター（全ページ共通の regions）や仮の一番上・一番下の外（上・間・下）には出さない。
  // pos は sectionAdd が使うページの並びの番号（.sec-wrap の通し番号ではない）にする。
  const page=PG.currentPage&&PG.currentPage();
  const secMap=PG.secMapNow?PG.secMapNow():null;
  const movable=(secMap&&page&&secMap[page])?secMap[page].map(s=>s.id):wraps.map(w=>w.getAttribute("data-sec"));
  for(let i=0;i<movable.length;i++){ const w=wrap.querySelector('.sec-wrap[data-sec="'+movable[i]+'"]'); if(w) wrap.insertBefore(mk(i),w); }   // 各セクションの前（＝その位置に挿入）
  const lastId=movable[movable.length-1];
  const lastW=lastId?wrap.querySelector('.sec-wrap[data-sec="'+lastId+'"]'):null;
  if(lastW){ const after=lastW.nextElementSibling; if(after) wrap.insertBefore(mk(movable.length),after); else wrap.appendChild(mk(movable.length)); }   // 最後の動かせるセクションの下（フッター・仮の一番下の手前）
}
let typePicker=null;
function showTypePicker(pos,anchorRect){
  if(!typePicker){ typePicker=document.createElement("div"); typePicker.id="sectypes"; document.body.appendChild(typePicker); }
  typePicker.innerHTML="";
  const ph=isPhone();
  const add=(label,type)=>{ const b=document.createElement("button"); b.type="button"; b.textContent=label; b.setAttribute("data-sec-type",type); if(ph){ b.style.minHeight="44px"; b.style.fontSize="15px"; } b.onclick=(ev)=>{ ev.stopPropagation(); typePicker.classList.remove("on"); PG.sectionAdd(pos,type); }; typePicker.appendChild(b); };
  add("特集","feature"); add("品","items");
  typePicker.classList.add("on"); typePicker._anchor={left:anchorRect.left,top:anchorRect.top,bottom:anchorRect.bottom};
  if(ph){ positionTypePicker(); }   // §6.2/X7 見えている範囲の中に（左右8）
  else { typePicker.style.left=Math.round(anchorRect.left)+"px"; typePicker.style.top=Math.round(anchorRect.bottom+4)+"px"; }
}
function positionTypePicker(){ if(!typePicker||!typePicker._anchor) return; const a=typePicker._anchor; placeFloat(typePicker, a.left, a.bottom+4, true); }
window.addEventListener("pointerdown",(e)=>{ if(typePicker&&typePicker.classList.contains("on")&&!typePicker.contains(e.target)&&!(e.target.classList&&e.target.classList.contains("sec-add-btn"))) typePicker.classList.remove("on"); },true);

// ---- キーボード ----
