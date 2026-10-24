// API につないだときの公開の流れ（M3）。publish.ui.js の「公開」から呼ばれる。
// 保存先が LocalStore のときは今までと同じ（PG.publish → 「公開しました」）。ApiStore のときは PG.publish が Promise を返すので、
// 「公開しています…」を出して待ち、できたら「公開しました」と公開ページのアドレス、だめなら理由を知らせる。
// 線：M3｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）。ここは宣言だけ
let _m3Publishing=false;
function m3RunPublish(){
  const r=PG.publish({force:true});
  if(!r||typeof r.then!=="function"){ showPublishToast(); afterPublish(); return; }   // LocalStore：今までどおり
  if(_m3Publishing) return; _m3Publishing=true;
  const pub=document.getElementById("tPublish"); const t=document.getElementById("publishToast");
  if(pub) pub.disabled=true;
  clearTimeout(_pubToastT); t.textContent="公開しています…"; t.setAttribute("data-m3-publish","busy"); t.classList.add("on");
  r.then((res)=>{
    if(res&&res.ok){
      t.innerHTML=""; t.setAttribute("data-m3-publish","done");
      const s=document.createElement("span"); s.textContent="公開しました"; t.appendChild(s);
      if(res.url){ t.appendChild(document.createTextNode("　公開ページ：")); const a=document.createElement("a"); a.href=res.url; a.target="_blank"; a.rel="noopener"; a.textContent=res.url; a.setAttribute("data-m3-public-url","1"); a.style.color="#fff"; a.style.textDecoration="underline"; t.appendChild(a); }
      clearTimeout(_pubToastT); _pubToastT=setTimeout(()=>{ t.classList.remove("on"); t.removeAttribute("data-m3-publish"); },10000);
    } else {
      t.classList.remove("on"); t.removeAttribute("data-m3-publish");
      window.pgToast((res&&res.message)||"公開できませんでした。少し待ってからもう一度お試しください");
      if(res&&res.conflict) m3OpenConflictBox();   // M3b ぶつかったら選ぶ箱
    }
  },()=>{ t.classList.remove("on"); t.removeAttribute("data-m3-publish"); window.pgToast("公開できませんでした。少し待ってからもう一度お試しください"); })
  .finally(()=>{ _m3Publishing=false; afterPublish(); });
}

// ===================== M3b ログアウト・ぶつかったときの箱・写真を上げている途中に閉じる =====================
// どれも保存先が ApiStore のときだけ（LocalStore のときは何も足さない・何も変えない）
const _m3On=(typeof saveStore!=="undefined"&&saveStore.kind==="api");
const M3_CSS=`
#m3Conflict{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.35);display:none;align-items:center;justify-content:center;padding:16px;font:15px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:#222}
#m3Conflict.on{display:flex}
#m3Conflict .m3c-card{width:100%;max-width:440px;background:#fff;border-radius:14px;box-shadow:0 6px 30px rgba(0,0,0,.18);padding:22px 20px}
#m3Conflict h2{font-size:18px;margin:0 0 8px}
#m3Conflict p{margin:0 0 14px;font-size:14px;color:#444}
#m3Conflict button{display:block;width:100%;text-align:left;font-size:15px;padding:12px 14px;border-radius:10px;border:1px solid #bbb;background:#fff;color:#222;cursor:pointer;margin:0 0 10px}
#m3Conflict button small{display:block;font-size:12px;color:#666;margin-top:2px}
#m3Conflict button[data-m3-conflict-mine]{border-color:#2b5f4a}
#m3Conflict button[disabled]{opacity:.5;cursor:default}
#m3Conflict .m3c-msg{min-height:1.4em;font-size:13px;color:#b34700;margin:4px 0 0}
`;
function m3EnsureCss(){ if(document.getElementById("m3Css")) return; const st=document.createElement("style"); st.id="m3Css"; st.textContent=M3_CSS; document.head.appendChild(st); }

// ---- ぶつかったとき（409）：「ほかの変更を読み込む」か「自分の直しで上書きする」 ----
function m3OpenConflictBox(){
  if(!_m3On||!PG.saveState().conflict) return;
  m3EnsureCss();
  let box=document.getElementById("m3Conflict");
  if(!box){
    box=document.createElement("div"); box.id="m3Conflict"; box.setAttribute("role","dialog"); box.setAttribute("aria-modal","true"); box.setAttribute("aria-labelledby","m3ConflictTitle");
    box.innerHTML='<div class="m3c-card"><h2 id="m3ConflictTitle">ほかの端末で変更されました</h2>'
      +'<p>このお店のサイトが、ほかの端末（スマホや別のパソコン、制作側の人など）で先に直されて保存されました。どちらを残すか選んでください。選ばなかった方も、履歴の「戻す前の下書き」に残るので、あとから戻せます。</p>'
      +'<button type="button" data-m3-conflict-theirs>ほかの変更を読み込む（自分の直しは消える）<small>ほかの端末で直した今の内容にします</small></button>'
      +'<button type="button" data-m3-conflict-mine>自分の直しで上書きする<small>この画面の内容で、ほかの端末の変更を置き換えます</small></button>'
      +'<div class="m3c-msg" data-m3-conflict-msg aria-live="polite"></div></div>';
    document.body.appendChild(box);
    const run=async(choice)=>{ const bs=box.querySelectorAll("button"); bs.forEach(b=>b.disabled=true); const msg=box.querySelector("[data-m3-conflict-msg]"); msg.textContent="";
      const r=await PG.m3.resolveConflict(choice);
      bs.forEach(b=>b.disabled=false);
      if(r&&r.ok){ box.classList.remove("on"); window.pgToast(choice==="theirs"?"ほかの端末の変更を読み込みました（自分の直しは履歴の「戻す前の下書き」にあります）":"自分の直しで上書きしています（ほかの端末の変更は履歴の「戻す前の下書き」にあります）"); try{updateSaveUI();}catch(_){} }
      else msg.textContent=(r&&r.message)||"うまくいきませんでした。少し待ってからもう一度お試しください"; };
    box.querySelector("[data-m3-conflict-theirs]").onclick=()=>run("theirs");
    box.querySelector("[data-m3-conflict-mine]").onclick=()=>run("mine");
  }
  box.querySelector("[data-m3-conflict-msg]").textContent="";
  box.classList.add("on");
}
if(_m3On){
  // 保存でぶつかったら（store-save.js の 409）、知らせの代わりに選ぶ箱を出す
  if(PG.setExternalConflictHandler) PG.setExternalConflictHandler(()=>{ try{updateSaveUI();}catch(_){} m3OpenConflictBox(); });
  // ぶつかったまま「公開」を押したときも箱を出す（公開は止まったまま）
  document.getElementById("tPublish").addEventListener("click",()=>{ if(PG.saveState().conflict) setTimeout(m3OpenConflictBox,0); });
}

// ---- ログアウト（「その他 ▾」の中。スマホは「その他」の板） ----
async function m3Logout(all){
  if(all&&!confirm("ほかの端末（スマホや別のパソコン）でも、もう一度ログインが要るようになります。ログアウトしますか")) return;
  const s=await PG.m3.settle(8000);
  if(s!=="ok"&&!confirm("まだ保存できていない直しがあります。ログアウトすると、その直しは消えます。ログアウトしますか")) return;
  try{ if(all) await saveStore.logoutAll(); else await saveStore.logout(); }
  catch(e){ window.pgToast(e&&e.network?"つながらないのでログアウトできませんでした":"ログアウトできませんでした。少し待ってからもう一度お試しください"); return; }
  window.removeEventListener("beforeunload",m3BeforeUnload);
  location.reload();   // 読み込み直す＝ログインの箱が出る
}
if(_m3On){
  const mm=document.getElementById("moreMenu");
  for(const [id,label,all] of [["moLogout","ログアウト",false],["moLogoutAll","ほかの端末からもログアウト",true]]){
    const b=document.createElement("button"); b.className="mo-extra"; b.id=id; b.textContent=label; b.setAttribute("data-m3-logout",all?"all":"one");
    b.onmousedown=(e)=>e.preventDefault();
    b.onclick=(e)=>{ e.stopPropagation(); mm.classList.remove("on"); m3Logout(all); };
    mm.appendChild(b);
  }
  if(typeof buildPmore==="function"){ const _m3BuildPmore=buildPmore;   // スマホの「その他」の板は開くたびに作り直すので、その後ろに足す
    buildPmore=function(){ _m3BuildPmore();
      for(const [label,all] of [["ログアウト",false],["ほかの端末からもログアウト",true]]){ const b=document.createElement("button"); b.textContent=label; b.setAttribute("data-m3-logout",all?"all":"one"); b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); pmore.classList.remove("on"); m3Logout(all); }; pmore.appendChild(b); } }; }
}

// ---- 写真を上げている途中に閉じようとしたら警告（上げ終わっていない写真は手元に残り、読み込み直したら上げ直す） ----
function m3BeforeUnload(e){ if(saveStore.uploading&&saveStore.uploading()>0){ e.preventDefault(); e.returnValue=""; return ""; } }
if(_m3On) window.addEventListener("beforeunload",m3BeforeUnload);
