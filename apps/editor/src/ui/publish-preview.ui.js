// プレビューの帯・公開の履歴の帯
// 線：共通｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
const previewBar=document.getElementById("previewBar");
function buildPreviewBar(){ previewBar.innerHTML="";
  const title=document.createElement("span"); title.className="pv-title"; title.textContent="プレビュー（お客さんが見る形）"; previewBar.appendChild(title);
  const mkDev=(label,d)=>{ const b=document.createElement("button"); b.textContent=label; b.setAttribute("data-pv-dev",d); b.classList.toggle("on",PG.state.device===d); b.onclick=()=>{ PG.setDevice(d); [...previewBar.querySelectorAll("[data-pv-dev]")].forEach(x=>x.classList.toggle("on",x.getAttribute("data-pv-dev")===d)); }; return b; };
  previewBar.appendChild(mkDev("PC","pc")); previewBar.appendChild(mkDev("スマホ","sp"));
  const sp=document.createElement("span"); sp.className="sp"; previewBar.appendChild(sp);
  const back=document.createElement("button"); back.textContent="編集に戻る"; back.setAttribute("data-pv-back","1"); back.onclick=exitPreviewUI; previewBar.appendChild(back);
}
function enterPreviewUI(){ fmenu.classList.remove("on"); pmore.classList.remove("on"); moreMenu.classList.remove("on"); PG.enterPreview(); }   // UI は onRender の syncPreviewUI が反映（プリセット/入口経由でも効く）
function exitPreviewUI(){ PG.exitPreview(); }
function syncPreviewUI(){ const on=PG.previewMode(); document.body.classList.toggle("pg-preview",on); if(on){ if(!previewBar.classList.contains("on")){ buildPreviewBar(); previewBar.classList.add("on"); } } else previewBar.classList.remove("on"); }
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&PG.previewMode()){ e.preventDefault(); exitPreviewUI(); } },true);   // §5.4 Esc＝編集に戻る
// §5.3 プレビュー中：リンクは本当に押せる（よそは新しいタブ）。部品は選ばない・動かさない（const stage はこの後で定義されるので直接取得）
document.getElementById("stage").addEventListener("click",(e)=>{ if(!PG.previewMode()) return;
  let lk=null;
  const lkEl=e.target.closest&&e.target.closest("[data-lk]");
  if(lkEl){ try{ lk=JSON.parse(lkEl.getAttribute("data-lk")); }catch(_){} }
  if(!lk){ const el=e.target.closest&&e.target.closest("[data-el]"); if(el){ const info=PG.api.elementLink(el.getAttribute("data-el")); if(info&&info.link) lk=info.link; } }
  if(!lk) return;
  e.preventDefault(); e.stopPropagation();
  if(lk.kind==="page"){ PG.setPage(lk.page); window.scrollTo(0,0); return; }   // J53 プレビューのままサイトのページを移る（編集画面ごと消えない）
  if(lk.kind==="anchor"){ const host=document.getElementById("host_"+lk.sec)||document.querySelector('[data-sec="'+lk.sec+'"]'); if(host) host.scrollIntoView({block:"start"}); return; }   // J54 そのセクションまでスクロール
  const href=PG.api.resolveHref(lk); if(href){ if(/^https?:/.test(href)) window.open(href,"_blank"); else location.href=href; }   // tel/mail/地図/外部は本当に開く
},true);
// §22 §6 公開の履歴から前の版に戻す
const historyBar=document.getElementById("historyBar");
const historyPanel=document.getElementById("historyPanel");
let historyOpen=false;
function fmtAt(at){ if(!at) return ""; const d=new Date(at); return (d.getMonth()+1)+"月"+d.getDate()+"日 "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function verLabel(v){ return v.kind==="draft"?"今の下書き":v.kind==="published"?"公開した版":v.kind==="beforeRestore"?"戻す前の下書き":v.kind==="initial"?"最初の形":""; }
function buildHistoryPanel(){
  historyPanel.innerHTML="";
  const head=document.createElement("div"); head.className="hp-head"; head.textContent="公開の履歴";
  const sp=document.createElement("span"); sp.className="sp"; head.appendChild(sp);
  const x=document.createElement("button"); x.textContent="閉じる"; x.setAttribute("data-hp-close","1"); x.onclick=closeHistory; head.appendChild(x); historyPanel.appendChild(head);
  const list=document.createElement("div"); list.className="hp-list";
  const viewing=PG.viewingVersion();
  for(const v of PG.versions()){
    const row=document.createElement("div"); row.className="hp-row"+(viewing===v.id?" viewing":""); row.setAttribute("data-hp-row",v.id); row.setAttribute("data-hp-kind",v.kind);
    const main=document.createElement("div"); main.className="hp-main"; main.textContent=verLabel(v);
    if(v.kind==="published"&&v.current){ const b=document.createElement("span"); b.className="hp-badge"; b.textContent="公開中"; main.appendChild(b); }
    row.appendChild(main);
    if(v.kind==="draft"&&v.current){ const s=document.createElement("div"); s.className="hp-sub warn"; s.textContent="まだ公開していない変更があります"; row.appendChild(s); }
    else if(v.at){ const s=document.createElement("div"); s.className="hp-sub"; s.textContent=fmtAt(v.at); row.appendChild(s); }
    row.onclick=()=>{ if(v.kind==="draft") exitHistoryView(); else PG.viewVersion(v.id); };   // §6.2 今の下書きで編集に戻る／他の版は見るだけ
    list.appendChild(row);
  }
  historyPanel.appendChild(list);
}
function buildHistoryBar(){
  historyBar.innerHTML="";
  const viewing=PG.viewingVersion(); const v=PG.versions().find(x=>x.id===viewing);
  const title=document.createElement("span"); title.className="hb-title";
  let t="版を見ています（見るだけ）";
  if(v){ if(v.kind==="published") t=fmtAt(v.at)+"に公開した版を見ています（見るだけ）"; else if(v.kind==="initial") t="最初の形を見ています（見るだけ）"; else if(v.kind==="beforeRestore") t=fmtAt(v.at)+"の戻す前の下書きを見ています（見るだけ）"; }
  title.textContent=t; historyBar.appendChild(title);
  const mkDev=(label,d)=>{ const b=document.createElement("button"); b.textContent=label; b.setAttribute("data-hv-dev",d); b.classList.toggle("on",PG.state.device===d); b.onclick=()=>{ PG.setDevice(d); }; return b; };
  historyBar.appendChild(mkDev("PC","pc")); historyBar.appendChild(mkDev("スマホ","sp"));
  const sp=document.createElement("span"); sp.className="sp"; historyBar.appendChild(sp);
  const close=document.createElement("button"); close.textContent="閉じる"; close.setAttribute("data-hv-close","1"); close.onclick=exitHistoryView; historyBar.appendChild(close);
  const go=document.createElement("button"); go.className="go"; go.textContent="この版を下書きにする"; go.setAttribute("data-hv-go","1"); go.onclick=()=>{ PG.restoreVersion(PG.viewingVersion()); closeHistory(); }; historyBar.appendChild(go);   // §6.3
}
function openHistory(){ if(PG.previewMode()) return; fmenu.classList.remove("on"); pmore.classList.remove("on"); moreMenu.classList.remove("on"); historyOpen=true; syncHistoryUI(); }
function closeHistory(){ historyOpen=false; if(PG.viewingVersion()) PG.exitView(); syncHistoryUI(); }
function exitHistoryView(){ if(PG.viewingVersion()) PG.exitView(); syncHistoryUI(); }   // §6.2 見るだけをやめて編集へ（板は開いたまま）
function syncHistoryUI(){
  const viewing=!!PG.viewingVersion();
  document.body.classList.toggle("pg-viewing",viewing);
  if(historyOpen){ buildHistoryPanel(); historyPanel.classList.add("on"); } else historyPanel.classList.remove("on");
  if(viewing){ buildHistoryBar(); historyBar.classList.add("on"); } else historyBar.classList.remove("on");
}
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&PG.viewingVersion()){ e.preventDefault(); exitHistoryView(); } },true);   // §6.2 Esc＝見るだけをやめる
document.getElementById("tHistory").onclick=()=>{ if(historyOpen) closeHistory(); else openHistory(); };   // §22 §6 履歴の板
document.getElementById("tPreview").onclick=()=>enterPreviewUI();   // §22 §5 プレビュー
// §3.3 状態の文字が並びに入らないときは「その他」の一番上に押せない行として出す
