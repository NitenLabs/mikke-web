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
/* §1 読めないファイルの短い知らせ（数秒で消える。画面に出す言葉はこれだけ） */
.photo-toast{position:fixed;z-index:80;background:#333;color:#fff;font:12px/1.4 system-ui;padding:6px 10px;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none}
/* §1 枠の上に落とせる間の縁取り */
.drop-ok{outline:3px solid #06c !important;outline-offset:-2px}
/* §2 見せる範囲（トリミング）：枠の外のはみ出しも薄く見せる・四隅のつまみ */
#cropwrap{position:fixed;z-index:70;pointer-events:none}
#cropwrap .dim{position:absolute;pointer-events:auto;cursor:move;background-repeat:no-repeat;opacity:.32}
#cropwrap .clip{position:absolute;overflow:hidden;pointer-events:auto;cursor:move;outline:2px solid #06c}
#cropwrap .clip .bright{position:absolute;background-repeat:no-repeat}
#cropwrap .ch{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;background:#fff;border:1.5px solid #06c;border-radius:50%;pointer-events:auto;z-index:2}
/* N3 拡大の横棒（いつも画面の中・言葉なし・両端に −／＋ の印だけ） */
#cropzoom{position:fixed;z-index:75;display:none;align-items:center;gap:6px;background:#fff;border:1px solid #bbb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);padding:4px 8px}
#cropzoom .zm,#cropzoom .zp{font:13px system-ui;color:#555;width:12px;text-align:center}
#cropzoom input[type=range]{width:140px}
/* §12 文字の見た目の道具（文字の部品を選んでいる間だけ出る・PowerPoint のリボン） */
#tstools{display:none;align-items:center;gap:4px}
#tstools .div{width:1px;height:20px;background:#ddd}
#tstools [data-ts=size]{width:46px;text-align:center;font:13px system-ui;padding:4px;border:1px solid #bbb;border-radius:6px}
#tstools .ab{font-family:'Zen Old Mincho',serif;line-height:1}
#tstools [data-ts=grow] .ab{font-size:17px}
#tstools [data-ts=shrink] .ab{font-size:11px}
#tstools [data-ts=bold]{font-weight:700;min-width:30px}
#tstools [data-ts=color] .sw{display:inline-block;width:16px;height:12px;border:1px solid #999;vertical-align:middle}
.tspop{position:fixed;z-index:65;background:#fff;border:1px solid #bbb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);padding:6px;display:none}
.tspop.on{display:block}
#sizePop{width:72px;max-height:240px;overflow:auto}
#sizePop button{display:block;width:100%;text-align:center;border:none;background:none;padding:4px;border-radius:4px}
#sizePop button:hover{background:#eef}
#colorPop{width:168px}
#colorPop .lab{font:11px system-ui;color:#888;margin:2px 2px 4px}
#colorPop .sws{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
#colorPop .cell{width:22px;height:22px;border:1px solid #bbb;border-radius:4px;cursor:pointer;padding:0}
#colorPop .more{font:12px system-ui;border:1px solid #bbb;border-radius:6px;padding:4px 8px;background:#fff;cursor:pointer;width:100%}
#colorPop input[type=color]{position:absolute;left:-9999px}
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
  <span id="tstools">
    <span class="div"></span>
    <button data-ts="shrink" title="小さく"><span class="ab">A</span></button>
    <input data-ts="size" type="text" inputmode="numeric" value="16">
    <button data-ts="grow" title="大きく"><span class="ab">A</span></button>
    <button data-ts="size-list" title="よく使う大きさ">▾</button>
    <span class="div"></span>
    <button data-ts="bold" title="太字">B</button>
    <span class="div"></span>
    <button data-ts="color" title="色"><span class="sw"></span></button>
  </span>
  <span class="sp"></span>
  <button id="tStudio">制作用</button>
</div>
<div id="studio">
  <div class="box"><b>試験を再現</b><br>
    <button data-q="Q1">Q1</button><button data-q="Q2">Q2</button><button data-q="Q3">Q3</button><button data-q="Q4">Q4</button>
    <button data-q="Q5">Q5</button><button data-q="Q6">Q6</button><button data-q="Q7">Q7</button><button data-q="Q8">Q8</button><br>
    <button data-q="R1">R1</button><button data-q="R2">R2</button><button data-q="R3">R3</button><button data-q="R4">R4</button><button data-q="R5">R5</button>
    <button data-q="R6">R6</button><button data-q="R7">R7</button><button data-q="R8">R8</button><button data-q="R9">R9</button><br>
    <button data-q="T1">T1</button><button data-q="T2">T2</button><button data-q="T3">T3</button><button data-q="T4">T4</button><button data-q="T5">T5</button><button data-q="V1">V1</button><br>
    <button data-q="W1">W1</button><button data-q="W2">W2</button><button data-q="W3">W3</button><button data-q="W4">W4</button><button data-q="W5">W5</button><button data-q="W6">W6</button>
    <button data-q="W7">W7</button><button data-q="W8">W8</button><button data-q="W9">W9</button><button data-q="W10">W10</button><button data-q="W11">W11</button><br>
    <button data-q="Y1">Y1</button><button data-q="Y2">Y2</button><button data-q="Y3">Y3</button><button data-q="Y4">Y4</button><button data-q="Y5">Y5</button><button data-q="Y6">Y6</button><button data-q="Y7">Y7</button>
    <button data-q="Y8">Y8</button><button data-q="Y9">Y9</button><button data-q="Y10">Y10</button><button data-q="Y11">Y11</button><button data-q="Y12">Y12</button><button data-q="Y13">Y13</button><button data-q="Y14">Y14</button><br>
    <button data-q="Z1">Z1</button><button data-q="Z2">Z2</button><button data-q="Z3">Z3</button><button data-q="Z4">Z4</button><button data-q="Z5">Z5</button><button data-q="Z6">Z6</button><button data-q="Z7">Z7</button><br>
    <button data-q="P1">P1</button><button data-q="P2">P2</button><button data-q="P3">P3</button><button data-q="P4">P4</button><button data-q="P5">P5</button><button data-q="P6">P6</button><button data-q="P7">P7</button><button data-q="P8">P8</button>
    <button data-q="P9">P9</button><button data-q="P10">P10</button><button data-q="P11">P11</button><button data-q="P12">P12</button><button data-q="P13">P13</button><button data-q="P14">P14</button><button data-q="P15">P15</button><button data-q="P16">P16</button><br>
    <button data-q="U1">U1</button><button data-q="U2">U2</button><button data-q="U3">U3</button><button data-q="U4">U4</button><button data-q="U5">U5</button><button data-q="U6">U6</button><br>
    <button data-q="J1">J1</button><button data-q="J2">J2</button><button data-q="J3">J3</button><button data-q="J4">J4</button><button data-q="J5">J5</button><button data-q="J6">J6</button><button data-q="J7">J7</button>
    <button data-q="J8">J8</button><button data-q="J9">J9</button><button data-q="J10">J10</button><button data-q="J11">J11</button><button data-q="J12">J12</button><button data-q="J13">J13</button><br>
    <button data-q="D1">D1</button><button data-q="D2">D2</button><button data-q="D3">D3</button><button data-q="D4">D4</button><button data-q="D5">D5</button><button data-q="D6">D6</button>
    <button data-q="D7">D7</button><button data-q="D8">D8</button><button data-q="D9">D9</button><button data-q="D10">D10</button><button data-q="D11">D11</button><button data-q="D12">D12</button>
  </div>
  <div class="box"><b>操作の記録</b><ol id="oplog"></ol></div>
  <div class="box"><b>付いていく先</b><ul id="anchorlist" style="margin:0;padding-left:16px;font-size:12px;color:#06c"></ul></div>
</div>
<div id="stage">
  <div id="sectionwrap"></div>
  <div id="meas" style="position:absolute;left:-9999px;top:0"></div>
</div>
<input id="photoInput" type="file" accept="image/*" style="position:fixed;left:-9999px">
<div id="cropwrap" style="display:none"></div>
<div id="fmenu"></div>
<div id="sizePop" class="tspop"></div>
<div id="colorPop" class="tspop"></div>`;

const WIRING = `
function applyPhotos(){ PG.paintPhotos(); }
function opText(op){ const nm=id=>C3.friendly(id);
  if(op.t==="move") return "動かす："+op.items.map(it=>nm(it.id)+(it.mode==="M1"?"(中/"+it.dx+","+it.dy+")":"→"+nm(it.anchor)+"の下")).join("・")+" ["+op.device+"]";
  if(op.t==="edit") return "書き換える："+nm(op.id);
  if(op.t==="add") return "文字を足す："+nm(op.id)+"→"+nm(op.anchor)+"の下 ["+op.placedDevice+"]";
  if(op.t==="del") return "消す："+nm(op.id);
  if(op.t==="addCard") return "品を複製";
  if(op.t==="resetScope") return "元に戻す："+op.scope+" ["+op.devices.join(",")+"]";
  if(op.t==="clear"||op.t==="unclear") return (op.t==="clear"?"写真を外す":"写真を戻す")+"："+nm(op.id);
  if(op.t==="replace") return "写真を差し替える："+nm(op.id);
  if(op.t==="view") return "見せる範囲："+nm(op.id)+" ["+op.device+"]";
  return op.t; }
function refreshStudio(){ const ol=document.getElementById("oplog"); if(ol){ ol.innerHTML=""; for(const op of PG.api.ops()){ const li=document.createElement("li"); li.textContent=opText(op); ol.appendChild(li);} }
  const ul=document.getElementById("anchorlist"); if(ul){ ul.innerHTML=""; for(const a of PG.anchorsList()){ const li=document.createElement("li"); li.textContent=a.partName+"："+(a.mode==="M1"?"塊の中でずらす":a.anchorName+"の下（空き"+a.gapY+"）"); ul.appendChild(li);} } }
window.onRender=function(){ applyPhotos(); refreshStudio(); positionFmenu(); updateTextTools(); };

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

// §12 文字の見た目の道具（リボン。文字の部品を選んでいる間だけ出す）
const TS_COLORS=[["text","#333333"],["textMuted","#7B7B7B"],["line","#B0B0B0"],["background","#FFFFFF"]];
const TS_HEX={text:"#333333",textMuted:"#7B7B7B",line:"#B0B0B0",background:"#FFFFFF"};
let recentColors=[];
const tstools=document.getElementById("tstools");
const sizePop=document.getElementById("sizePop");
const colorPop=document.getElementById("colorPop");
const tsEl=(s)=>document.querySelector('#tstools [data-ts="'+s+'"]');
function textSelected(){ if(PG.state.editing) return true; const s=[...PG.state.selected]; return s.length>0 && s.every(id=>PG.isText(id)); }
function updateTextTools(){
  if(!textSelected()){ tstools.style.display="none"; sizePop.classList.remove("on"); colorPop.classList.remove("on"); return; }
  tstools.style.display="inline-flex";
  const si=tsEl("size");
  if(PG.state.editing){ const px=PG.editingPartSizePx(); if(px!=null && document.activeElement!==si) si.value=String(px); return; }  // 編集中は選択（または箱）の実際の大きさを出す
  const ap=PG.api.textStyles(); const prim=PG.primaryTextSel(); const info=prim&&ap.find(x=>x.part===prim);
  if(info){ if(document.activeElement!==si) si.value=String(info.size);
    tsEl("bold").classList.toggle("on",info.weight>=700);
    const sw=document.querySelector('#tstools [data-ts="color"] .sw'); sw.style.background=(/^#/.test(info.color)?info.color:(TS_HEX[info.color]||info.color)); }
}
function beforeTs(){ if(PG.state.editing) PG.commitEdit(); }   // §3.4 カーソルだけ（選択なし）なら決めてから箱全体に効かせる
// §13：書き換え中に文字の一部を選んでいれば、その所だけに効かせる（commit しない）
function partMode(){ return !!(PG.state.editing && PG.editingHasSelection()); }
const sizeInp=tsEl("size");
function commitSizeInput(){ const v=parseInt(sizeInp.value,10); if(isNaN(v)) return; const px=Math.max(8,Math.min(120,v));
  if(partMode()){ const box=PG.boxSizePx(PG.state.editing.id)||px; PG.applyPartStyle("scale", px/box); }
  else { beforeTs(); PG.textSetSize(px); } }
sizeInp.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); commitSizeInput(); sizeInp.blur(); } });
sizeInp.addEventListener("blur",commitSizeInput);
function partStep(dir){ const cur=PG.editingPartSizePx(); const box=PG.boxSizePx(PG.state.editing.id); let nx; if(dir>0) nx=PG.SIZE_LIST.find(v=>v>cur); else { const less=PG.SIZE_LIST.filter(v=>v<cur); nx=less.length?less[less.length-1]:null; } if(nx==null||nx===cur) return; PG.applyPartStyle("scale", nx/box); }
["grow","shrink","size-list"].forEach(nm=>{ tsEl(nm).onmousedown=(e)=>e.preventDefault(); });   // 編集中の選択を失わない
tsEl("grow").onclick=()=>{ if(partMode()) partStep(1); else { beforeTs(); PG.textStep(1); } };
tsEl("shrink").onclick=()=>{ if(partMode()) partStep(-1); else { beforeTs(); PG.textStep(-1); } };
tsEl("bold").onmousedown=(e)=>e.preventDefault();
tsEl("bold").onclick=()=>{ if(partMode()) PG.applyPartStyle("bold"); else { beforeTs(); PG.textToggleBold(); } };
function applySizeNum(px){ if(partMode()){ const box=PG.boxSizePx(PG.state.editing.id)||px; PG.applyPartStyle("scale", px/box); } else { beforeTs(); PG.textSetSize(px); } }
tsEl("size-list").onclick=(e)=>{ e.stopPropagation(); const open=sizePop.classList.contains("on"); colorPop.classList.remove("on"); if(open){ sizePop.classList.remove("on"); return; }
  sizePop.innerHTML=""; for(const n of PG.SIZE_LIST){ const b=document.createElement("button"); b.textContent=String(n); b.setAttribute("data-ts-size",String(n)); b.onmousedown=(ev)=>ev.preventDefault(); b.onclick=(ev)=>{ ev.stopPropagation(); applySizeNum(n); sizePop.classList.remove("on"); }; sizePop.appendChild(b); }
  const r=tsEl("size-list").getBoundingClientRect(); sizePop.style.left=r.left+"px"; sizePop.style.top=(r.bottom+4)+"px"; sizePop.classList.add("on"); };
tsEl("color").onmousedown=(e)=>e.preventDefault();   // 編集中の選択を失わない
tsEl("color").onclick=(e)=>{ e.stopPropagation(); const open=colorPop.classList.contains("on"); sizePop.classList.remove("on"); if(open){ colorPop.classList.remove("on"); return; } buildColorPop(); const r=tsEl("color").getBoundingClientRect(); colorPop.style.left=r.left+"px"; colorPop.style.top=(r.bottom+4)+"px"; colorPop.classList.add("on"); };
// §13：文字の一部を選んでいれば選んだ所だけ・そうでなければ箱まるごと
function applyColor(value){ if(partMode()) PG.applyPartStyle("color", value); else { beforeTs(); PG.textSetColor(value); } }
function buildColorPop(){
  colorPop.innerHTML="";
  const row=(label,cells)=>{ const l=document.createElement("div"); l.className="lab"; l.textContent=label; colorPop.appendChild(l); const d=document.createElement("div"); d.className="sws"; for(const c of cells) d.appendChild(c); colorPop.appendChild(d); };
  const cell=(bg,value)=>{ const b=document.createElement("button"); b.className="cell"; b.style.background=bg; b.setAttribute("data-ts-color",bg); b.onmousedown=(ev)=>ev.preventDefault(); b.onclick=(ev)=>{ ev.stopPropagation(); applyColor(value); colorPop.classList.remove("on"); }; return b; };
  row("テンプレートの色",TS_COLORS.map(([tok,hex])=>cell(hex,tok)));
  if(recentColors.length) row("最近使った色",recentColors.map(hex=>cell(hex,hex)));
  const more=document.createElement("button"); more.className="more"; more.textContent="その他の色…"; more.onmousedown=(ev)=>ev.preventDefault(); more.onclick=(ev)=>{ ev.stopPropagation(); customColor.click(); }; colorPop.appendChild(more);
  const customColor=document.createElement("input"); customColor.type="color"; customColor.setAttribute("data-ts","color-custom"); customColor.value=(recentColors[0]||"#C03030");
  customColor.oninput=()=>{ const hex=customColor.value.toUpperCase(); applyColor(hex); recentColors=[hex,...recentColors.filter(c=>c!==hex)].slice(0,5); colorPop.classList.remove("on"); };
  colorPop.appendChild(customColor);
}
window.addEventListener("pointerdown",(e)=>{ if(sizePop.classList.contains("on")&&!sizePop.contains(e.target)&&!tsEl("size-list").contains(e.target)) sizePop.classList.remove("on"); if(colorPop.classList.contains("on")&&!colorPop.contains(e.target)&&!tsEl("color").contains(e.target)) colorPop.classList.remove("on"); },true);

// 浮遊メニュー
const fmenu=document.getElementById("fmenu");
function positionFmenu(){ if(!fmenu.classList.contains("on"))return; const id=[...PG.state.selected][0]; const n=id&&PG.elNode(id); if(!n){ fmenu.classList.remove("on"); return;} const r=n.getBoundingClientRect(); const mh=fmenu.offsetHeight||30; let top=r.top-mh-6; if(top<4) top=r.bottom+6; /* §2 部品の上の外側。上に場所がなければ下の外側 */ fmenu.style.left=r.left+"px"; fmenu.style.top=top+"px"; }
function showFmenu(){ const sel=[...PG.state.selected]; if(!sel.length){ fmenu.classList.remove("on"); return; } fmenu.innerHTML="";
  const add=(label,fn,note)=>{ if(note){ const s=document.createElement("span"); s.className="note"; s.textContent=note; fmenu.appendChild(s); return;} const b=document.createElement("button"); b.textContent=label; b.onclick=(ev)=>{ ev.stopPropagation(); fn(); }; fmenu.appendChild(b); };
  const one=sel.length===1?sel[0]:null; const R=PG.reduce(PG.activeOps());
  const moved=one&&PG.partChangedFromTemplate(one);   // N1：位置・大きさ・並び順・重なり順のどれかが変われば出す
  if(sel.length>1){ add("元の位置に戻す",()=>{ for(const id of sel) PG.resetScope("part",id,[PG.state.device]); }); add("消す",()=>PG.deleteSelected()); }
  else if(one&&PG.REPEAT.test(one)){ add("書き換える",()=>PG.startEdit(one)); add("複製",()=>PG.duplicate()); add("",null,/^row_/.test(one)?"1行の作りを変えると全部に効きます":"品は位置を動かせません"); }
  else if(one){ const isPhoto=/^F_p|photo/.test(one); if(PG.isText(one)) add("書き換える",()=>PG.startEdit(one));
    if(PG.isText(one)&&(PG.hasTextStyle(one)||PG.hasRuns(one))) add("文字の見た目を元に戻す",()=>PG.resetTextStyle(one));   // §2.2 書式のクリア（箱まるごと＋文の一部）
    if(isPhoto){ const isCleared=(R.clear||[]).includes(one); add("写真を差し替える",()=>startReplace(one));
      if(!isCleared){ add("見せる範囲",()=>enterCrop(one)); add("写真を外す",()=>PG.commit({t:"clear",id:one})); }   // N4：外していない写真は「外す」だけ
      else { add("写真を戻す",()=>PG.commit({t:"unclear",id:one})); } }                                            // N4：外した空枠は「戻す」だけ
    if(PG.hasOverlapPartner()){ add("前面へ",()=>{PG.bringToFront(); showFmenu();}); add("背面へ",()=>{PG.sendToBack(); showFmenu();}); }   // §4 重なっている相手がいるときだけ
    if(moved) add("元の位置に戻す",()=>PG.resetScope("part",one,[PG.state.device])); add("消す",()=>PG.commit({t:"del",id:one})); }
  fmenu.classList.add("on"); positionFmenu();
}

// ---- 選択・ドラッグ・範囲選択 ----
let marquee=null;
function elFrom(t){ const n=t.closest?t.closest("[data-el]"):null; return n?n.getAttribute("data-el"):null; }
const stage=document.getElementById("stage");
stage.addEventListener("pointerdown",(e)=>{
  if(PG.state.editing && e.target.getAttribute && e.target.closest("[contenteditable]")) return; // 編集中の文字は素通し
  if(PG.state.editing) PG.commitEdit();
  // §4 大きさのつまみ（data-handle）をつかんだ＝大きさを変える
  const hdir=e.target.getAttribute&&e.target.getAttribute("data-handle");
  if(hdir){ const forId=e.target.getAttribute("data-handle-for"); if(PG.beginResize(forId,hdir,e.clientX,e.clientY)) e.preventDefault(); return; }
  fmenu.classList.remove("on");
  let rawId=elFrom(e.target);
  if(!rawId){ const sh=PG.smallHit(e.clientX,e.clientY); if(sh) rawId=sh; }   // §2 つかめる範囲を広げた小さな部品
  if(textTool){ if(rawId){ PG.addTextAt(PG.canonId(rawId),24,"テキスト"); } textTool=false; document.getElementById("tText").classList.remove("on"); return; }
  if(!rawId){ if(e.pointerType!=="touch"){ marquee={x0:e.clientX,y0:e.clientY,el:document.createElement("div")}; marquee.el.className="marquee"; document.body.appendChild(marquee.el); e.preventDefault(); } else PG.clearSel(); return; }
  const id=PG.canonId(rawId);
  // §5 PowerPoint のグループ選択：表・品の並びの中は、1回目で全体、2回目（選択中）で中の1件
  const grp=PG.groupOf(rawId);
  // X1：1回目で全体を選ぶ。選択中にもう一度つかんだら、動かせば全体ドラッグ・動かさなければ中の1件（押した瞬間には選び方を変えない）
  if(grp){ if(!PG.state.selected.has(grp)){ PG.selectOnly(grp); if(e.pointerType!=="touch") pending={sx:e.clientX,sy:e.clientY}; return; } else { pending={sx:e.clientX,sy:e.clientY,clickInner:rawId}; return; } }
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
  // §2 Alt（Mac は Option）を押しながらは、そろえない
  if(PG.isResizing()){ e.preventDefault(); PG.resizeMove(e.clientX,e.clientY,e.altKey); return; }
  if(marquee){ const x=Math.min(marquee.x0,e.clientX),y=Math.min(marquee.y0,e.clientY),w=Math.abs(e.clientX-marquee.x0),h=Math.abs(e.clientY-marquee.y0); Object.assign(marquee.el.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px"}); e.preventDefault(); return; }
  if(pending && !PG.isDragging() && Math.hypot(e.clientX-pending.sx,e.clientY-pending.sy)>3){ PG.beginDrag(pending.sx,pending.sy); }
  if(PG.isDragging()){ e.preventDefault(); PG.dragMove(e.clientX,e.clientY,e.altKey); }
},{passive:false});
window.addEventListener("pointerup",(e)=>{
  const wasPending=pending; pending=null;
  if(PG.isResizing()){ PG.endResize(); showFmenu(); return; }
  if(marquee){ const r=marquee.el.getBoundingClientRect(); marquee.el.remove(); marquee=null; const chosen=[];
    const hosts=[...document.querySelectorAll("#sectionwrap .host")];
    for(const hs of hosts){ if(!hs)continue; for(const el of hs.querySelectorAll("[data-el]")){ const rawId=el.getAttribute("data-el"); const c=PG.canonId(rawId); if(!PG.isDraggable(c)||PG.REPEAT.test(rawId))continue; const b=el.getBoundingClientRect(); if(b.left>=r.left-0.5&&b.top>=r.top-0.5&&b.right<=r.right+0.5&&b.bottom<=r.bottom+0.5) if(!chosen.includes(c)) chosen.push(c);} }
    if(!chosen.length && r.width<6 && r.height<6){ // 余白をクリック＝セクションを選ぶ（§4）
      for(const hs of hosts){ const b=hs.getBoundingClientRect(); if(e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom){ PG.selectSection(hs.id.replace("host_","")); break; } } return; }
    PG.selectMany(chosen); if(chosen.length) showFmenu(); return; }
  if(PG.isDragging()){ PG.endDrag(); showFmenu(); return; }
  // X1：全体を選択中に中を押して動かさずに離した＝中の1件を選ぶ
  if(wasPending && wasPending.clickInner){ PG.selectMany([wasPending.clickInner]); showFmenu(); }
});
// ダブルクリック＝文字はその場書き換え、写真は見せる範囲（§2.1）
stage.addEventListener("dblclick",(e)=>{ const id=elFrom(e.target); if(!id)return; const c=PG.canonId(id); if(PG.isText(c)){ PG.startEdit(c); } else if(/^F_p|photo/.test(id)){ enterCrop(id); } });
// 右クリック＝浮遊メニュー
stage.addEventListener("contextmenu",(e)=>{ const id=elFrom(e.target); if(id){ e.preventDefault(); const grp=PG.groupOf(id); PG.selectOnly(grp||PG.canonId(id)); showFmenu(); } });

// ---- キーボード ----
window.addEventListener("keydown",(e)=>{
  const meta=e.metaKey||e.ctrlKey;
  if(PG.isCropping()){ // 見せる範囲：Enter で決め、Esc で取り消す（ほかのキーは効かない）
    if(e.key==="Enter"){ e.preventDefault(); PG.cropCommit(); exitCropOverlay(); }
    else if(e.key==="Escape"){ e.preventDefault(); PG.cropCancel(); exitCropOverlay(); }
    return;
  }
  if(PG.state.editing){ // 書き換え中：文字入力・Esc・Cmd+B のみ。Cmd+Z 等はブラウザの文字取り消しに任せる
    if(e.key==="Escape") PG.commitEdit();
    if(meta&&e.key.toLowerCase()==="b"){ e.preventDefault(); if(PG.editingHasSelection()) PG.applyPartStyle("bold"); return; }   // §2.1 選んだ所の太字を入れ替え
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
// 貼り付け：書き換え中はプレーン文字（§7.2）。書き換え中でなく写真を1つ選んでいて画像なら差し替える（§1.1・§7.7）
window.addEventListener("paste",(e)=>{ const cd=e.clipboardData||window.clipboardData; const t=cd.getData("text/plain"); window.__lastPlain=t;
  if(PG.state.editing){ e.preventDefault(); document.execCommand("inserttext",false,t); return; }
  const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null; const isPhoto=one&&/^F_p|photo/.test(one);
  if(!isPhoto) return;   // 写真以外を選んでいるときの画像貼り付けは、今回は何もしない（§1.1）
  const file=[...(cd.files||[])].find(f=>f.type.startsWith("image/")) || (()=>{ for(const it of (cd.items||[])){ if(it.kind==="file"){ const f=it.getAsFile&&it.getAsFile(); if(f&&f.type.startsWith("image/")) return f; } } return null; })();
  if(!file) return; e.preventDefault(); doReplace(one,file);
});

// ---- §1 写真の差し替え（選ぶ・落とす・貼り付ける）----
const photoInput=document.getElementById("photoInput");
let pendingReplaceId=null;
function startReplace(id){ pendingReplaceId=id; photoInput.value=""; photoInput.click(); }
photoInput.addEventListener("change",()=>{ const f=photoInput.files&&photoInput.files[0]; if(f&&pendingReplaceId){ doReplace(pendingReplaceId,f); } pendingReplaceId=null; });
async function doReplace(id,file){ const r=await PG.replacePhotoFile(id,file); if(!r.ok){ photoToast(id,"この写真は読み込めません"); } }
function photoToast(id,msg){ const n=PG.elNode(id); const t=document.createElement("div"); t.className="photo-toast"; t.textContent=msg; document.body.appendChild(t); if(n){ const r=n.getBoundingClientRect(); t.style.left=Math.round(r.left)+"px"; t.style.top=Math.round(r.top-28)+"px"; } else { t.style.left="12px"; t.style.top="60px"; } setTimeout(()=>t.remove(),2600); }
// 枠の上に落とす（落とせる間は枠を縁取る）。枠の外に落ちた画像は何もしない（§1.1）
function photoElFrom(t){ const n=t.closest?t.closest('[data-kind="photo"]'):null; return n?n.getAttribute("data-el"):null; }
let dropHi=null;
stage.addEventListener("dragover",(e)=>{ if(![...(e.dataTransfer&&e.dataTransfer.types||[])].includes("Files"))return; const id=photoElFrom(e.target); if(id){ e.preventDefault(); e.dataTransfer.dropEffect="copy"; const n=PG.elNode(id); if(dropHi&&dropHi!==n)dropHi.classList.remove("drop-ok"); if(n){ n.classList.add("drop-ok"); dropHi=n; } } });
stage.addEventListener("dragleave",(e)=>{ if(dropHi&&!stage.contains(e.relatedTarget)){ dropHi.classList.remove("drop-ok"); dropHi=null; } });
stage.addEventListener("drop",(e)=>{ const id=photoElFrom(e.target); if(dropHi){ dropHi.classList.remove("drop-ok"); dropHi=null; } if(!id)return; const f=[...(e.dataTransfer.files||[])].find(x=>true); if(!f)return; e.preventDefault(); doReplace(id,f); });

// ---- §2 見せる範囲（トリミング）の重ね描き ----
const cropwrap=document.getElementById("cropwrap");
// N3 拡大の横棒（いつも画面の中・言葉なし・両端に −／＋ の印）。見せる範囲の間だけ出す。枠の真ん中を中心に拡大。
let zoomBar=null;
function ensureZoomBar(){ if(zoomBar)return zoomBar; const w=document.createElement("div"); w.id="cropzoom";
  w.innerHTML='<span class="zm">−</span><input type="range" data-crop-zoom min="1" max="4" step="0.01" value="1"><span class="zp">＋</span>';
  document.body.appendChild(w); const inp=w.querySelector("[data-crop-zoom]");
  inp.addEventListener("input",()=>{ PG._barActive=true; PG.cropZoomTo(parseFloat(inp.value)); });
  inp.addEventListener("pointerdown",()=>{ PG._barActive=true; }); window.addEventListener("pointerup",()=>{ PG._barActive=false; });
  zoomBar=w; return w; }
function enterCrop(id){ if(PG.state.editing)PG.commitEdit(); fmenu.classList.remove("on"); if(!PG.beginCrop(id)) return; ensureZoomBar(); drawCropOverlay(); }
window.onCrop=function(){ drawCropOverlay(); };   // app.js がドラッグ中に呼ぶ
function drawCropOverlay(){
  const st=PG.cropState(); if(!st||!st.display){ cropwrap.style.display="none"; cropwrap.innerHTML=""; return; }
  const n=PG.elNode(st.id); if(!n){ cropwrap.style.display="none"; return; }
  const r=n.getBoundingClientRect(); const sc=PG.getScale();   // 枠の画面上の矩形と倍率（設計px→画面px）
  const d=st.display; const DW=d.dw*sc, DH=d.dh*sc, OX=d.ox*sc, OY=d.oy*sc;
  const url=PG.assetUrl((PG.photosApi().find(p=>p.part===st.id)||{}).asset)||"";
  cropwrap.style.display="block"; cropwrap.style.left="0"; cropwrap.style.top="0"; cropwrap.style.width="0"; cropwrap.style.height="0";
  cropwrap.innerHTML=
    '<div class="dim" style="left:'+(r.left+OX)+'px;top:'+(r.top+OY)+'px;width:'+DW+'px;height:'+DH+'px;background-image:url('+url+');background-size:'+DW+'px '+DH+'px"></div>'
   +'<div class="clip" style="left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px"><div class="bright" style="left:'+OX+'px;top:'+OY+'px;width:'+DW+'px;height:'+DH+'px;background-image:url('+url+');background-size:'+DW+'px '+DH+'px"></div></div>';
  // 四隅のつまみ（表示画像の角）
  const corners=[["nw",OX,OY],["ne",OX+DW,OY],["sw",OX,OY+DH],["se",OX+DW,OY+DH]];
  for(const [dir,cx,cy] of corners){ const h=document.createElement("div"); h.className="ch"; h.setAttribute("data-crop-handle",dir); h.style.left=(r.left+cx)+"px"; h.style.top=(r.top+cy)+"px"; cropwrap.appendChild(h); }
  cropwrap._frame={left:r.left,top:r.top,sc};
  // N3 横棒：いつも画面の中に。枠の下（入らなければ上）に置き、左右も画面内に収める。ドラッグ中は値を書き換えない
  if(zoomBar){ zoomBar.style.display="flex"; const bw=zoomBar.offsetWidth||200, bh=zoomBar.offsetHeight||28;
    let left=Math.min(Math.max(8,r.left),window.innerWidth-bw-8);
    let top=r.top+r.height+8; if(top+bh>window.innerHeight-8) top=Math.max(8,r.top-bh-8);
    zoomBar.style.left=left+"px"; zoomBar.style.top=top+"px";
    const inp=zoomBar.querySelector("[data-crop-zoom]"); if(inp && !PG._barActive) inp.value=String(st.view.zoom); }
}
function exitCropOverlay(){ cropwrap.style.display="none"; cropwrap.innerHTML=""; if(zoomBar) zoomBar.style.display="none"; }
// つまみ＝拡大縮小／それ以外のドラッグ＝見せる位置
cropwrap.addEventListener("pointerdown",(e)=>{ if(!PG.isCropping())return; e.preventDefault(); e.stopPropagation();
  const sc=(cropwrap._frame&&cropwrap._frame.sc)||PG.getScale(); const dir=e.target.getAttribute&&e.target.getAttribute("data-crop-handle");
  const sx=e.clientX, sy=e.clientY;
  if(dir){ PG.cropCornerStart(dir); const mv=(ev)=>{ PG.cropCornerBy((ev.clientX-sx)/sc,(ev.clientY-sy)/sc); }; const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); }; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); }   // N2 反対の角を止めて拡大
  else { PG.cropPanStart(); const mv=(ev)=>{ PG.cropPanBy((ev.clientX-sx)/sc,(ev.clientY-sy)/sc); }; const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); }; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); }
});
cropwrap.addEventListener("wheel",(e)=>{ if(!PG.isCropping())return; e.preventDefault(); PG.cropWheel(e.deltaY); },{passive:false});
// 枠の外を押したら決める（§2.1）
window.addEventListener("pointerdown",(e)=>{ if(PG.isCropping() && !cropwrap.contains(e.target) && !(zoomBar&&zoomBar.contains(e.target))){ PG.cropCommit(); exitCropOverlay(); } },true);

PG.render();
`;

async function buildFull() {
  const photos = await encodePhotos();
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>wa-01 layout playground 14（セクションの追加・並べ替え・複製・削除）</title>
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
  const out = path.join(outDir, "playground14_single.html");
  fs.writeFileSync(out, html);
  console.log(`wrote ${out}  (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
  // §6 試験の画像を refs にも写す（Claude.ai の確認で使う）
  const imgSrc = path.join(here, "testimg"), imgDst = path.join(outDir, "playground14_testimg");
  if (fs.existsSync(imgSrc)) { fs.mkdirSync(imgDst, { recursive: true }); for (const f of fs.readdirSync(imgSrc)) fs.copyFileSync(path.join(imgSrc, f), path.join(imgDst, f)); }
  fs.writeFileSync(path.join(here, "index.html"), html);
}
await buildFull();
