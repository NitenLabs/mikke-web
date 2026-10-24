// その他の状態・元の配置を見る・プリセット・文字/写真を足すボタン
// 線：A5｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
function updateMoreStatus(){ const mm=document.getElementById("moreMenu"); if(!mm) return; const old=mm.querySelector(".morestat"); if(old) old.remove();
  const el=document.getElementById("saveStatus"); const stowed = el && (el.offsetParent===null); if(!stowed) return;
  const st=PG.saveState(); const row=document.createElement("div"); row.className="morestat"+((st.status==="error"||st.label==="まだ公開していない変更があります")?" warn":""); row.textContent=st.label; mm.insertBefore(row, mm.firstChild); }
const peekBtn=document.getElementById("tPeek");
peekBtn.addEventListener("pointerdown",()=>PG.peekOn()); window.addEventListener("pointerup",()=>{ if(PG.state.peek) PG.peekOff(); });
document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>PG.api.runPreset(b.dataset.q));

// §3/§4（試験台17）テキスト・写真を「見えている範囲の真ん中」に足す（PowerPoint の挿入）。マウスの操作のときだけ。
const CAM_SVG='<svg class="cam" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h3l1.6-2h6.8L21 8h-1v11H4z" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2"/></svg>';
function sectionAtViewportY(vy){ const hosts=[...document.querySelectorAll("#sectionwrap .host")]; if(!hosts.length)return null; let best=hosts[0],bd=Infinity; for(const h of hosts){ const r=h.getBoundingClientRect(); if(vy>=r.top&&vy<=r.bottom) return h; const d=vy<r.top?r.top-vy:vy-r.bottom; if(d<bd){bd=d;best=h;} } return best; }
function visibleCenter(){ const sc=PG.getScale(); const tb=document.getElementById("toolbar"); const tbb=tb?tb.getBoundingClientRect().bottom:0; const vy=(tbb+window.innerHeight)/2; const host=sectionAtViewportY(vy); if(!host) return null; const hr=host.getBoundingClientRect(); return { sec:host.id.replace("host_",""), cx:SPEC.DESIGN_W[PG.state.device]/2, cy:(vy-hr.top)/sc }; }
function addTextCentered(){ if(isPhone())return; if(PG.state.editing)PG.commitEdit(); const p=visibleCenter(); if(p) PG.addTextAtPoint(p.sec,p.cx,p.cy,{placeholder:true}); }   // P13 空の見本の文字で出す
async function addPhotoCentered(file){ const p=visibleCenter(); if(p) await PG.addPhotoAtPoint(file,p.sec,p.cx,p.cy); }
async function addPhotoAtDrop(file,clientX,clientY){ const sc=PG.getScale(); const host=sectionAtViewportY(clientY); if(!host)return; const hr=host.getBoundingClientRect(); await PG.addPhotoAtPoint(file,host.id.replace("host_",""),(clientX-hr.left)/sc,(clientY-hr.top)/sc); }
document.getElementById("tText").onclick=()=>addTextCentered();
document.getElementById("tPhoto").onclick=()=>{ if(isPhone())return; if(PG.state.editing)PG.commitEdit(); pendingAdd=true; pendingReplaceId=null; photoInput.value=""; photoInput.click(); };

// §12 文字の見た目の道具（リボン。文字の部品を選んでいる間だけ出す）
