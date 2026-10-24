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
    }
  },()=>{ t.classList.remove("on"); t.removeAttribute("data-m3-publish"); window.pgToast("公開できませんでした。少し待ってからもう一度お試しください"); })
  .finally(()=>{ _m3Publishing=false; afterPublish(); });
}
