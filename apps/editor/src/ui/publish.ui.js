// 保存の状態・公開の流れ・公開前の確認の箱
// 線：共通｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
// §22 §3 公開・状態の文字・「公開しました」トースト（§4.1 の確認の箱は 22c。22b は publish({force:true}) 相当）
let _lastPubEnabled=true, _pubToastT=null;
function updateSaveUI(){ const st=PG.saveState(); const el=document.getElementById("saveStatus"); const pub=document.getElementById("tPublish"); if(!el||!pub) return;
  const shortErr=st.status==="error"&&!st.conflict;   // F36 失敗の文は短く（詳しくはマウスを乗せて）＝上の並びを押し出さない
  el.textContent=shortErr?"保存できませんでした":st.label; el.title=shortErr?st.label+"（つながったら、もう一度保存します）":""; el.classList.toggle("warn", st.status==="error" || st.conflict || st.label==="まだ公開していない変更があります");
  if(st.status==="saved"&&!st.conflict) _lastPubEnabled = !st.publishedEqual;   // §3.2 公開中と同じ→押せない／それ以外→押せる。保存中・失敗は前の状態のまま
  pub.disabled = !_lastPubEnabled;
  updateMoreStatus(); }
function showPublishToast(){ const t=document.getElementById("publishToast"); t.textContent="公開しました"; t.classList.add("on"); clearTimeout(_pubToastT); _pubToastT=setTimeout(()=>t.classList.remove("on"),3000); }
function afterPublish(){ updateSaveUI(); if(isPhone()) refreshPhoneUI(); }
// §22 §4.1 公開を押したとき：PC/SP の確認（publishCheck）。何もなければすぐ公開しトースト、あれば確認の箱
// J26 保存できていない（失敗中・別タブ衝突）ときは公開しない＝「公開しました」と言わず、知らせる
function doPublishFlow(){ if(PG.state.editing) PG.commitEdit();   // J49 書き換え中なら先にふつうに終える（打った文字を公開に含める・捨てない）
  const st=PG.saveState(); if(st.status==="error"||st.conflict){ PG.flushPendingSave&&PG.flushPendingSave(); window.pgToast(st.conflict?(saveStore.kind==="api"?"ほかの端末で変更されました。出てきた箱で、どちらの直しを使うか選んでから公開してください":"ほかのタブの変更が保存されています。読み込み直してから公開してください"):"保存できていないので公開できません。つながりを確かめてもう一度お試しください"); afterPublish(); return; }
  const items=PG.publishCheck(); if(!items.length){ m3RunPublish(); } else showPublishBox(items); }
document.getElementById("tPublish").onclick=()=>{ if(document.getElementById("tPublish").disabled) return; doPublishFlow(); };
// J25 別タブが先に保存したときの知らせ（保存の道からも storage イベントからも呼ばれる）
if(PG.setExternalConflictHandler) PG.setExternalConflictHandler(()=>{ window.pgToast(saveStore.conflictLabel||"ほかのタブで変更が保存されました。読み込み直してください"); try{updateSaveUI();}catch(_){} });
// J28 保存待ちのまま閉じようとしたら警告／閉じる・隠れる直前にすぐ書き出す
window.addEventListener("beforeunload",(e)=>{ if(PG.hasPendingSave&&PG.hasPendingSave()){ e.preventDefault(); e.returnValue=""; return ""; } });
function _flushSaveNow(){ if(PG.flushPendingSave) PG.flushPendingSave(); }
window.addEventListener("pagehide",_flushSaveNow);
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") _flushSaveNow(); });
function closePublishBox(){ document.getElementById("publishBox").classList.remove("on"); }
function scrollPartToCenter(part){ const n=PG.elNode(PG.canonId(part)); if(!n) return; n.scrollIntoView({block:"center"}); const r=n.getBoundingClientRect(); window.scrollBy(0,(r.top+r.height/2)-innerHeight/2); }   // §4.1.5 部品の真ん中が画面の真ん中
function seeItem(it){ closePublishBox(); if(it.page&&PG.setPage) PG.setPage(it.page); PG.setDevice(it.device); const dSP=document.getElementById("dSP"),dPC=document.getElementById("dPC"); if(it.device==="sp"){dSP.classList.add("on");dPC.classList.remove("on");}else{dPC.classList.add("on");dSP.classList.remove("on");} const part=it.parts[0]; PG.selectOnly(PG.canonId(part)); scrollPartToCenter(part); }
function showPublishBox(items){ const box=document.getElementById("publishBox"); box.innerHTML="";
  const inner=document.createElement("div"); inner.className="pbox-inner";
  const title=document.createElement("div"); title.className="pbox-title"; title.setAttribute("data-pbox-title",String(items.length)); title.textContent="公開する前に、見てほしい所が "+items.length+" つあります"; inner.appendChild(title);
  const KIND={overlap:"重なっている所",long:"長い文",emptyPhoto:"写真のない枠",system:"仕組みの重なり・はみ出し",shop:"お店の情報"};
  const list=document.createElement("div"); list.className="pbox-list";
  for(const kind of ["shop","overlap","long","emptyPhoto","system"]){ const grp=items.filter(i=>i.kind===kind); if(!grp.length) continue;
    const h=document.createElement("div"); h.className="pbox-kind"; h.textContent=KIND[kind]; list.appendChild(h);
    for(const it of grp){ const row=document.createElement("div"); row.className="pbox-row"; row.setAttribute("data-pbox-kind",kind); row.setAttribute("data-pbox-dev",it.device);
      const t=document.createElement("span"); t.className="pbox-rowtext"; t.textContent=it.text; row.appendChild(t);
      const see=document.createElement("button"); see.className="pbox-see"; see.setAttribute("data-pbox-see","1"); see.textContent="見る"; see.onclick=()=>seeItem(it); row.appendChild(see); list.appendChild(row); } }
  inner.appendChild(list);
  const btns=document.createElement("div"); btns.className="pbox-btns";
  const back=document.createElement("button"); back.setAttribute("data-pbox-back","1"); back.textContent="戻って直す"; back.onclick=closePublishBox; btns.appendChild(back);
  const go=document.createElement("button"); go.className="pbox-go"; go.setAttribute("data-pbox-go","1"); go.textContent="このまま公開する"; go.onclick=()=>{ closePublishBox(); m3RunPublish(); }; btns.appendChild(go);
  inner.appendChild(btns); box.appendChild(inner); box.classList.add("on"); }
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&document.getElementById("publishBox").classList.contains("on")){ e.preventDefault(); closePublishBox(); } },true);   // §4.1.4 Esc＝戻って直す
// §22 §5 プレビュー（お客さんが見る形）
