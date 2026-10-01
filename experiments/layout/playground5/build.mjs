// playground3_single.html を組み立てる。配置と操作は experiments/layout の c3-edit / a-box は使わず
// c3-edit / b-anchor(collectTextBoxes) / lib/spec を「そのまま」使う（関数で包む・ロジックは書き換えない）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const L = path.resolve(here, "..");
const ROOT = path.resolve(here, "../../..");

function wrap(name, file, prelude, exports) {
  let s = fs.readFileSync(file, "utf8");
  s = s.replace(/^[ \t]*import\s[^\n]*\n/gm, "").replace(/^[ \t]*export\s+/gm, "");
  return `const ${name} = (function(){\n${prelude}\n${s}\nreturn { ${exports.join(", ")} };\n})();\n`;
}
const modelBundle = [
  wrap("SPEC", path.join(L, "lib/spec.mjs"), "", ["COLORS", "FONT", "FONT_URL", "ROOT_VARS", "STYLES", "DESIGN_W", "textDecls", "setLineBreak", "lbState", "lbOf"]),
  wrap("RESOLVE", path.join(L, "b-anchor/resolve.mjs"), "", ["resolve", "rebindRemoved"]),
  wrap("BANCHOR", path.join(L, "b-anchor/model.mjs"), "const {resolve, rebindRemoved}=RESOLVE; const {STYLES}=SPEC;", ["collectTextBoxes", "buildFeature", "buildItems"]),
  wrap("C3", path.join(L, "c3-edit/model.mjs"), "const {textDecls, STYLES, COLORS, DESIGN_W, lbOf}=SPEC; const {collectTextBoxes: bBoxes}=BANCHOR;", ["collectTextBoxes", "buildFeature", "buildItems", "reanchor", "placeAnchored", "classifyDrop", "reorderWithin", "sectionMinHeight", "friendly", "FRIENDLY", "CLUSTER", "REPEAT_GROUP"]),
].join("\n");

function stripMod(file) { return fs.readFileSync(file, "utf8").replace(/^[ \t]*import\s[^\n]*\n/gm, "").replace(/^[ \t]*export\s+/gm, ""); }
const budoux = `const BUDOUX = (function(){\n${stripMod(path.join(ROOT, "node_modules/budoux/module/parser.js"))}\n${stripMod(path.join(ROOT, "node_modules/budoux/module/data/models/ja.js"))}\nreturn { Parser, model };\n})();\n`;
const textlayer = fs.readFileSync(path.join(L, "playground/textlayer.js"), "utf8");

const BASE_CSS = `
#sec{position:relative;overflow:visible}
.t{line-break:strict;word-break:normal;overflow-wrap:anywhere;white-space:normal}
.t.lb{word-break:keep-all;overflow-wrap:anywhere}
.t .nowrap{white-space:nowrap}
.t[contenteditable]{white-space:pre-wrap;word-break:normal}
.photo{display:flex;align-items:center;justify-content:center;color:#fff;font:12px/1.4 monospace;text-align:center;background:#8a8a8a;background-size:cover;background-position:center}
.photo.empty{background:#f2f2f2;color:#999;border:1px dashed #bbb}
.line{background:var(--c-line)}
.row-lines{box-shadow:inset 0 1px 0 var(--c-line)}
.row-lines .krow{box-shadow:inset 0 -1px 0 var(--c-line)}
`;
export function coreScript() { return `${budoux}\n${modelBundle}\n${textlayer}\n`; }

const CONTENT = JSON.parse(fs.readFileSync(path.join(L, "playground/_content.json"), "utf8"));
const FONT_LINK = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;500;600;700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=block">`;
const ROOTVARS = ":root{font-size:10px;--c-background:#FFFFFF;--c-surface:#EEEEEE;--c-text:#333333;--c-textMuted:#7B7B7B;--c-line:#B0B0B0}";

async function encodePhotos() {
  const assets = JSON.parse(fs.readFileSync(path.join(ROOT, "samples/ashiyado/assets.json"), "utf8")).assets;
  const need = { ast_frme: 1, ast_frmf: 1, ast_frmg: 1, ast_frmh: 1, ast_frmi: 1 };
  const { chromium } = await import("playwright");
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage(); const out = {};
  for (const id of Object.keys(need)) {
    const file = path.join(ROOT, "samples/ashiyado/media", assets[id].file.key);
    const src = `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
    out[id] = await p.evaluate(async (s) => { const img = new Image(); img.src = s; await img.decode(); const w = Math.min(1200, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth); const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(img, 0, 0, w, h); return cv.toDataURL("image/jpeg", 0.8); }, src);
  }
  out.ast_frmx = out.ast_frmi; await b.close(); return out;
}

const UI_CSS = `
*{box-sizing:border-box}
body{margin:0;font:14px/1.6 system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif;color:#222;background:#f4f4f5}
#toolbar{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid #ddd;padding:6px 8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#toolbar .sp{flex:1}
button{font:13px system-ui;padding:5px 9px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}
button.on{background:#333;color:#fff;border-color:#333}
button:active{transform:translateY(1px)}
#studio{display:none;background:#fafafa;border-bottom:1px solid #eee;padding:6px 8px;gap:8px;flex-wrap:wrap;align-items:flex-start}
#studio.on{display:flex}
#studio .box{background:#fff;border:1px solid #ddd;border-radius:6px;padding:6px 8px;max-width:340px}
#oplog{margin:0;padding-left:18px;font:11px/1.4 monospace;max-height:120px;overflow:auto}
#stage{padding:12px;min-height:60vh}
.seclabel{font:12px monospace;color:#888;margin:6px 0 2px}
.host{border:1px solid #ddd;background:#fff;overflow:visible;position:relative;touch-action:pan-y}
.mark-manual{outline:2px dashed #e08a00 !important;outline-offset:-1px}
.mark-warn{outline:2px solid #d00 !important;outline-offset:-1px}
.mark-sel{outline:2px solid #06c !important;outline-offset:-1px}
.mark-anchor{outline:2px solid #06c !important;outline-offset:1px;box-shadow:0 0 0 3px rgba(0,102,204,.15)}
.marquee{position:fixed;border:1.5px solid #06c;background:rgba(0,102,204,.10);pointer-events:none;z-index:50}
#fmenu{position:fixed;z-index:60;background:#fff;border:1px solid #bbb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);padding:4px;display:none;gap:4px}
#fmenu.on{display:flex}
#fmenu button{font-size:12px;padding:4px 8px}
#fmenu .note{font-size:11px;color:#777;align-self:center;padding:0 4px}
#ghost{position:absolute;inset:0;pointer-events:none;z-index:4}
`;

const UI_BODY = `
<div id="toolbar">
  <button id="tText">テキスト</button>
  <span style="width:1px;height:20px;background:#ddd"></span>
  <button id="dPC" class="on">PC</button><button id="dSP">スマホ</button>
  <span style="width:1px;height:20px;background:#ddd"></span>
  <button id="tPeek">元の配置を見る</button>
  <button id="tResetPage">このページを元に戻す</button>
  <button id="tUndo">戻す</button><button id="tRedo">やり直す</button>
  <span class="sp"></span>
  <button id="tStudio">制作用</button>
</div>
<div id="studio">
  <div class="box"><b>試験を再現</b><br>
    <button data-q="Q1">Q1</button><button data-q="Q2">Q2</button><button data-q="Q3">Q3</button><button data-q="Q4">Q4</button>
    <button data-q="Q5">Q5</button><button data-q="Q6">Q6</button><button data-q="Q7">Q7</button><button data-q="Q8">Q8</button><br>
    <button data-q="R1">R1</button><button data-q="R2">R2</button><button data-q="R3">R3</button><button data-q="R4">R4</button><button data-q="R5">R5</button>
    <button data-q="R6">R6</button><button data-q="R7">R7</button><button data-q="R8">R8</button><button data-q="R9">R9</button><br>
    <button data-q="T1">T1</button><button data-q="T2">T2</button><button data-q="T3">T3</button><button data-q="T4">T4</button><button data-q="T5">T5</button>
  </div>
  <div class="box"><b>操作の記録</b><ol id="oplog"></ol></div>
  <div class="box"><b>付いていく先</b><ul id="anchorlist" style="margin:0;padding-left:16px;font-size:12px;color:#06c"></ul></div>
</div>
<div id="stage">
  <div class="seclabel">FEATURE（芦屋堂の味）</div><div id="host_feature" class="host"></div>
  <div class="seclabel">ITEMS（おすすめの品）</div><div id="host_items" class="host"></div>
  <div id="meas" style="position:absolute;left:-9999px;top:0"></div>
</div>
<div id="fmenu"></div>`;

const WIRING = `
const PHOTOS = PHOTOS_JSON;
function applyPhotos(){ document.querySelectorAll("#stage .photo").forEach(el=>{ if(el.classList.contains("empty"))return; const id=(el.textContent||"").trim(); if(PHOTOS[id]){ el.style.backgroundImage="url("+PHOTOS[id]+")"; el.textContent=""; } }); }
function opText(op){ const nm=id=>C3.friendly(id);
  if(op.t==="move") return "動かす："+op.items.map(it=>nm(it.id)+(it.mode==="M1"?"(中/"+it.dx+","+it.dy+")":"→"+nm(it.anchor)+"の下")).join("・")+" ["+op.device+"]";
  if(op.t==="edit") return "書き換える："+nm(op.id);
  if(op.t==="add") return "文字を足す："+nm(op.id)+"→"+nm(op.anchor)+"の下 ["+op.placedDevice+"]";
  if(op.t==="del") return "消す："+nm(op.id);
  if(op.t==="addCard") return "品を複製";
  if(op.t==="resetScope") return "元に戻す："+op.scope+" ["+op.devices.join(",")+"]";
  if(op.t==="clear"||op.t==="unclear") return (op.t==="clear"?"写真を外す":"写真を戻す")+"："+nm(op.id);
  return op.t; }
function refreshStudio(){ const ol=document.getElementById("oplog"); if(ol){ ol.innerHTML=""; for(const op of PG.api.ops()){ const li=document.createElement("li"); li.textContent=opText(op); ol.appendChild(li);} }
  const ul=document.getElementById("anchorlist"); if(ul){ ul.innerHTML=""; for(const a of PG.anchorsList()){ const li=document.createElement("li"); li.textContent=a.partName+"："+(a.mode==="M1"?"塊の中でずらす":a.anchorName+"の下（空き"+a.gapY+"）"); ul.appendChild(li);} } }
window.onRender=function(){ applyPhotos(); refreshStudio(); positionFmenu(); };

document.getElementById("dPC").onclick=()=>{ PG.setDevice("pc"); document.getElementById("dPC").classList.add("on"); document.getElementById("dSP").classList.remove("on"); };
document.getElementById("dSP").onclick=()=>{ PG.setDevice("sp"); document.getElementById("dSP").classList.add("on"); document.getElementById("dPC").classList.remove("on"); };
document.getElementById("tUndo").onclick=()=>PG.undo();
document.getElementById("tRedo").onclick=()=>PG.redo();
document.getElementById("tResetPage").onclick=()=>PG.resetScope("page",null,["pc","sp"]);
document.getElementById("tStudio").onclick=(e)=>{ document.getElementById("studio").classList.toggle("on"); e.target.classList.toggle("on"); refreshStudio(); };
const peekBtn=document.getElementById("tPeek");
peekBtn.addEventListener("pointerdown",()=>PG.peekOn()); window.addEventListener("pointerup",()=>{ if(PG.state.peek) PG.peekOff(); });
document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>PG.api.runPreset(b.dataset.q));

// テキストツール
let textTool=false;
document.getElementById("tText").onclick=(e)=>{ textTool=!textTool; e.target.classList.toggle("on",textTool); };

// 浮遊メニュー
const fmenu=document.getElementById("fmenu");
function positionFmenu(){ if(!fmenu.classList.contains("on"))return; const id=[...PG.state.selected][0]; const n=id&&PG.elNode(id); if(!n){ fmenu.classList.remove("on"); return;} const r=n.getBoundingClientRect(); fmenu.style.left=r.left+"px"; fmenu.style.top=(r.bottom+6)+"px"; }
function showFmenu(){ const sel=[...PG.state.selected]; if(!sel.length){ fmenu.classList.remove("on"); return; } fmenu.innerHTML="";
  const add=(label,fn,note)=>{ if(note){ const s=document.createElement("span"); s.className="note"; s.textContent=note; fmenu.appendChild(s); return;} const b=document.createElement("button"); b.textContent=label; b.onclick=(ev)=>{ ev.stopPropagation(); fn(); }; fmenu.appendChild(b); };
  const one=sel.length===1?sel[0]:null; const R=PG.reduce(PG.activeOps());
  const moved=one&&(R.m1[one]||R.m2[one]);
  if(sel.length>1){ add("元の位置に戻す",()=>{ for(const id of sel) PG.resetScope("part",id,[PG.state.device]); }); add("消す",()=>PG.deleteSelected()); }
  else if(one&&PG.REPEAT.test(one)){ add("書き換える",()=>PG.startEdit(one)); add("複製",()=>PG.duplicate()); add("",null,/^row_/.test(one)?"1行の作りを変えると全部に効きます":"品は位置を動かせません"); }
  else if(one){ const isPhoto=/^F_p|photo/.test(one); if(PG.isText(one)) add("書き換える",()=>PG.startEdit(one)); if(isPhoto){ add("写真を外す",()=>PG.commit({t:"clear",id:one})); add("写真を戻す",()=>PG.commit({t:"unclear",id:one})); } if(moved) add("元の位置に戻す",()=>PG.resetScope("part",one,[PG.state.device])); add("消す",()=>PG.commit({t:"del",id:one})); }
  fmenu.classList.add("on"); positionFmenu();
}

// ---- 選択・ドラッグ・範囲選択 ----
let marquee=null;
function elFrom(t){ const n=t.closest?t.closest("[data-el]"):null; return n?n.getAttribute("data-el"):null; }
const stage=document.getElementById("stage");
stage.addEventListener("pointerdown",(e)=>{
  if(PG.state.editing && e.target.getAttribute && e.target.closest("[contenteditable]")) return; // 編集中の文字は素通し
  if(PG.state.editing) PG.commitEdit();
  fmenu.classList.remove("on");
  let rawId=elFrom(e.target);
  if(!rawId){ const sh=PG.smallHit(e.clientX,e.clientY); if(sh) rawId=sh; }   // §2 つかめる範囲を広げた小さな部品
  if(textTool){ if(rawId){ PG.addTextAt(PG.canonId(rawId),24,"テキスト"); } textTool=false; document.getElementById("tText").classList.remove("on"); return; }
  if(!rawId){ if(e.pointerType!=="touch"){ marquee={x0:e.clientX,y0:e.clientY,el:document.createElement("div")}; marquee.el.className="marquee"; document.body.appendChild(marquee.el); e.preventDefault(); } else PG.clearSel(); return; }
  const id=PG.canonId(rawId);
  if(PG.REPEAT.test(rawId)){ PG.selectMany([rawId]); showFmenu(); return; }
  if(!PG.isDraggable(id)){ PG.selectMany([]); return; }
  if((e.shiftKey&&e.pointerType!=="touch")){ PG.toggleSel(id); return; }
  const inMulti=PG.state.selected.has(id)&&PG.state.selected.size>1;
  if(!inMulti) PG.selectOnly(id);
  const wasSel=inMulti||PG.state.selected.has(id);
  // 掴む準備だけ（実際のドラッグは動かし始めてから＝クリック/ダブルクリックを潰さない）
  if(e.pointerType!=="touch"||wasSel){ pending={sx:e.clientX,sy:e.clientY}; }
},{passive:false});
let pending=null;
window.addEventListener("pointermove",(e)=>{
  if(marquee){ const x=Math.min(marquee.x0,e.clientX),y=Math.min(marquee.y0,e.clientY),w=Math.abs(e.clientX-marquee.x0),h=Math.abs(e.clientY-marquee.y0); Object.assign(marquee.el.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px"}); e.preventDefault(); return; }
  if(pending && !PG.isDragging() && Math.hypot(e.clientX-pending.sx,e.clientY-pending.sy)>3){ PG.beginDrag(pending.sx,pending.sy); }
  if(PG.isDragging()){ e.preventDefault(); PG.dragMove(e.clientX,e.clientY); }
},{passive:false});
window.addEventListener("pointerup",(e)=>{
  pending=null;
  if(marquee){ const r=marquee.el.getBoundingClientRect(); marquee.el.remove(); marquee=null; const chosen=[];
    for(const host of ["host_feature","host_items"]){ const hs=document.getElementById(host); if(!hs)continue; for(const el of hs.querySelectorAll("[data-el]")){ const rawId=el.getAttribute("data-el"); const c=PG.canonId(rawId); if(!PG.isDraggable(c)||PG.REPEAT.test(rawId))continue; const b=el.getBoundingClientRect(); if(b.left>=r.left-0.5&&b.top>=r.top-0.5&&b.right<=r.right+0.5&&b.bottom<=r.bottom+0.5) if(!chosen.includes(c)) chosen.push(c);} }
    if(!chosen.length && r.width<6 && r.height<6){ // 余白をクリック＝セクションを選ぶ（§4）
      for(const host of ["host_feature","host_items"]){ const hs=document.getElementById(host); const b=hs.getBoundingClientRect(); if(e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom){ PG.selectSection(host==="host_feature"?"feature":"items"); break; } } return; }
    PG.selectMany(chosen); if(chosen.length) showFmenu(); return; }
  if(PG.isDragging()){ PG.endDrag(); showFmenu(); }
});
// ダブルクリック＝その場書き換え（PC）
stage.addEventListener("dblclick",(e)=>{ const id=elFrom(e.target); if(id&&PG.isText(PG.canonId(id))){ PG.startEdit(PG.canonId(id)); } });
// 右クリック＝浮遊メニュー
stage.addEventListener("contextmenu",(e)=>{ const id=elFrom(e.target); if(id){ e.preventDefault(); PG.selectOnly(PG.canonId(id)); showFmenu(); } });

// ---- キーボード ----
window.addEventListener("keydown",(e)=>{
  const meta=e.metaKey||e.ctrlKey;
  if(PG.state.editing){ // 書き換え中：文字入力・Esc のみ。Cmd+Z 等はブラウザの文字取り消しに任せる
    if(e.key==="Escape") PG.commitEdit();
    if(meta&&e.key.toLowerCase()==="v"){ e.preventDefault(); document.execCommand&&document.execCommand("inserttext",false,(window.__lastPlain||"")); }
    return;
  }
  if(meta&&e.key.toLowerCase()==="z"){ e.preventDefault(); e.shiftKey?PG.redo():PG.undo(); return; }
  if(meta&&e.key.toLowerCase()==="y"){ e.preventDefault(); PG.redo(); return; }
  if(meta&&e.key.toLowerCase()==="c"){ e.preventDefault(); PG.copySelection(); return; }
  if(meta&&e.key.toLowerCase()==="x"){ e.preventDefault(); PG.cutSelection(); return; }
  if(meta&&e.key.toLowerCase()==="v"){ e.preventDefault(); PG.paste(); return; }
  if(meta&&e.key.toLowerCase()==="d"){ e.preventDefault(); PG.duplicate(); return; }
  if(e.key==="Delete"||e.key==="Backspace"){ if(PG.state.selected.size){ e.preventDefault(); PG.deleteSelected(); } return; }
  const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(arrows[e.key]&&PG.state.selected.size){ e.preventDefault(); const s=e.shiftKey?10:1; PG.nudgeSelected(arrows[e.key][0]*s,arrows[e.key][1]*s); }
});
// 貼り付けはプレーン文字だけ（§5.1）
window.addEventListener("paste",(e)=>{ const t=(e.clipboardData||window.clipboardData).getData("text/plain"); window.__lastPlain=t; if(PG.state.editing){ e.preventDefault(); document.execCommand("inserttext",false,t); } });

PG.render();
`;

async function buildFull() {
  const photos = await encodePhotos();
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>wa-01 layout playground 5（試験台4の直し：並び替えの塊・離した瞬間の付いていく先・SP貼り付け幅）</title>
${FONT_LINK}
<style>${ROOTVARS}${BASE_CSS}${UI_CSS}</style></head>
<body>
${UI_BODY}
<script>
${coreScript()}
const CONTENT_JSON = ${JSON.stringify(CONTENT)};
const PHOTOS_JSON = ${JSON.stringify(photos)};
${fs.readFileSync(path.join(here, "app.js"), "utf8")}
${WIRING}
</script>
</body></html>`;
  const outDir = path.join(ROOT, "refs/compare/layout");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "playground5_single.html");
  fs.writeFileSync(out, html);
  console.log(`wrote ${out}  (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
  fs.writeFileSync(path.join(here, "index.html"), html);
}
await buildFull();
