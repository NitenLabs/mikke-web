// playground2_single.html を組み立てる（A と 新しい C=c2-select）。
// 配置と操作は experiments/layout の a-box / c2-select / b-anchor(collectTextBoxes) / lib/spec を「そのまま」使う
// （関数で包んで名前衝突を避け、ロジックは書き換えない）。改行は budoux を埋め込み、DOM で keep を測る。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const L = path.resolve(here, "..");       // experiments/layout
const ROOT = path.resolve(here, "../../..");

function wrap(name, file, prelude, exports) {
  let s = fs.readFileSync(file, "utf8");
  s = s.replace(/^[ \t]*import\s[^\n]*\n/gm, "");
  s = s.replace(/^[ \t]*export\s+/gm, "");
  return `const ${name} = (function(){\n${prelude}\n${s}\nreturn { ${exports.join(", ")} };\n})();\n`;
}
const modelBundle = [
  wrap("SPEC", path.join(L, "lib/spec.mjs"), "", ["COLORS", "FONT", "FONT_URL", "ROOT_VARS", "STYLES", "DESIGN_W", "textDecls", "setLineBreak", "lbState", "lbOf"]),
  wrap("RESOLVE", path.join(L, "b-anchor/resolve.mjs"), "", ["resolve", "rebindRemoved"]),
  wrap("BANCHOR", path.join(L, "b-anchor/model.mjs"), "const {resolve, rebindRemoved}=RESOLVE; const {STYLES}=SPEC;", ["collectTextBoxes", "buildFeature", "buildItems"]),
  wrap("ABOX", path.join(L, "a-box/model.mjs"), "const {textDecls, STYLES, COLORS, DESIGN_W, lbOf}=SPEC; const {collectTextBoxes: bBoxes}=BANCHOR;", ["collectTextBoxes", "buildFeature", "buildItems"]),
  wrap("C2", path.join(L, "c2-select/model.mjs"), "const {textDecls, STYLES, COLORS, DESIGN_W, lbOf}=SPEC; const {collectTextBoxes: bBoxes}=BANCHOR;", ["collectTextBoxes", "buildFeature", "buildItems", "reanchor", "placeOverrides", "friendly", "FRIENDLY"]),
].join("\n");

function stripMod(file) { return fs.readFileSync(file, "utf8").replace(/^[ \t]*import\s[^\n]*\n/gm, "").replace(/^[ \t]*export\s+/gm, ""); }
const budoux = `const BUDOUX = (function(){\n${stripMod(path.join(ROOT, "node_modules/budoux/module/parser.js"))}\n${stripMod(path.join(ROOT, "node_modules/budoux/module/data/models/ja.js"))}\nreturn { Parser, model };\n})();\n`;
const textlayer = fs.readFileSync(path.join(L, "playground/textlayer.js"), "utf8"); // 改行の層は共通（前回と同じ）

const BASE_CSS = `
#sec{position:relative;overflow:hidden}
.t{line-break:strict;word-break:normal;overflow-wrap:anywhere;white-space:normal}
.t.lb{word-break:keep-all;overflow-wrap:anywhere}
.t .nowrap{white-space:nowrap}
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
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  const out = {};
  for (const id of Object.keys(need)) {
    const file = path.join(ROOT, "samples/ashiyado/media", assets[id].file.key);
    const src = `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
    out[id] = await p.evaluate(async (s) => {
      const img = new Image(); img.src = s; await img.decode();
      const w = Math.min(1200, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      return cv.toDataURL("image/jpeg", 0.8);
    }, src);
  }
  out.ast_frmx = out.ast_frmi;
  await b.close();
  return out;
}

const UI_CSS = `
*{box-sizing:border-box}
body{margin:0;font:14px/1.6 system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif;color:#222;background:#f4f4f5}
#bar{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #ddd;padding:8px;display:flex;flex-wrap:wrap;gap:8px}
#bar fieldset{border:1px solid #ddd;border-radius:6px;margin:0;padding:4px 8px;display:flex;align-items:center;gap:4px;flex-wrap:wrap}
#bar legend{font-size:11px;color:#666;padding:0 4px}
button{font:13px system-ui;padding:5px 9px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}
button.on{background:#333;color:#fff;border-color:#333}
button:active{transform:translateY(1px)}
.presetrow{display:flex;align-items:center;gap:6px}
.presetrow small{color:#666}
#modehelp{font-size:12px;color:#555;padding:2px 8px}
#wrap{display:flex;gap:12px;padding:12px;align-items:flex-start}
#side{flex:none;width:280px;position:sticky;top:56px}
#side .box{background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:10px}
#side h4{margin:0 0 6px;font-size:13px}
#oplog{margin:0;padding-left:20px;font:12px/1.5 monospace;max-height:150px;overflow:auto}
#anchorlist{margin:0;padding-left:18px;font-size:12px;color:#06c}
#anchorlist:empty::after{content:"（まだありません）";color:#888}
#warns{margin:0;padding-left:18px;color:#c00;font-size:12px}
#warns:empty::after{content:"なし";color:#888}
#msg{color:#0a6;font-size:12px;min-height:18px}
#stage{flex:1;min-width:0}
.seclabel{font:12px monospace;color:#888;margin:6px 0 2px}
.host{border:1px solid #ddd;background:#fff;overflow:hidden;position:relative;touch-action:pan-y}
.mark-manual{outline:2px dashed #e08a00 !important;outline-offset:-1px}
.mark-warn{outline:2px solid #d00 !important;outline-offset:-1px}
.mark-sel{outline:2px solid #06c !important;outline-offset:-1px}
.mark-anchor{outline:2px solid #06c !important;outline-offset:1px;box-shadow:0 0 0 3px rgba(0,102,204,.15)}
.marquee{position:fixed;border:1.5px solid #06c;background:rgba(0,102,204,.10);pointer-events:none;z-index:50}
.hint{font-size:12px;color:#666}
@media(max-width:820px){#wrap{flex-direction:column}#side{width:100%;position:static;order:2}#stage{order:1;width:100%}}
`;

const UI_BODY = `
<div id="bar">
  <fieldset><legend>方式</legend>
    <button id="mA" class="on">A：手で動かした部品はその場に残る</button>
    <button id="mC">C：選んだ部品だけが動き、中身が増えると付いていく</button></fieldset>
  <fieldset><legend>画面</legend><button id="dPC" class="on">PC</button><button id="dSP">スマホ</button></fieldset>
  <fieldset><legend>本文</legend><button id="bDec">−</button><span id="bLbl">ふつう</span><button id="bInc">＋</button></fieldset>
  <fieldset><legend>見出し</legend><button id="h1" class="on">1行</button><button id="h2">2行</button></fieldset>
  <fieldset><legend>品の数</legend><button id="cDec">−</button><span id="cLbl">3</span><button id="cInc">＋</button></fieldset>
  <fieldset><legend>品1の説明</legend><button id="d1" class="on">1行</button><button id="d2">2行</button></fieldset>
  <fieldset><legend>見出しと本文の間隔</legend><button id="g16" class="on">16</button><button id="g24">24</button></fieldset>
  <fieldset><legend>まとめて選ぶ（スマホ）</legend><button id="groupsel">オフ</button></fieldset>
  <fieldset><legend>操作</legend><button id="undo">1つ戻す</button><button id="resetAll">最初から</button></fieldset>
</div>
<div id="bar" style="top:52px">
  <fieldset style="flex-wrap:wrap"><legend>試験を再現</legend>
    <span class="presetrow"><button data-preset="P1">P1</button><small>見出しを右12下8→本文3行増</small></span>
    <span class="presetrow"><button data-preset="P2">P2</button><small>見出しと本文を囲んで選び下40→本文3行増</small></span>
    <span class="presetrow"><button data-preset="P3">P3</button><small>本文を写真の下24へ→本文増→見出し2行</small></span>
    <span class="presetrow"><button data-preset="P4">P4</button><small>区切り線の下24に文字→品4件</small></span>
    <span class="presetrow"><button data-preset="P5">P5</button><small>写真を左60下40→本文3行増</small></span>
    <span class="presetrow"><button data-preset="P6">P6</button><small>特集2の写真を外す</small></span>
    <span class="presetrow"><button data-preset="P7">P7</button><small>見出し移動後に間隔16→24</small></span>
    <span class="presetrow"><button data-preset="P8">P8</button><small>PCで見出し移動（スマホは不変）</small></span>
  </fieldset>
</div>
<div id="modehelp">部品を押すと選べます。選んだ部品をドラッグすると動きます。PCは何もない所から囲むとまとめて選べます（Shift＋クリックで足し引き）。品は1件ずつは動かせません。</div>
<div id="wrap">
  <div id="side">
    <div class="box">
      <h4>選んだ部品</h4><div id="selname" class="hint">（なし）</div>
      <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
        <button id="aClear">写真を外す</button><button id="aUnclear">写真を戻す</button>
        <button id="aRemove">部品を消す</button><button id="aReset">自動に戻す</button>
      </div>
      <div id="msg"></div>
    </div>
    <div class="box">
      <h4>文字を足す</h4>
      <input id="addtext" placeholder="足す文字" style="width:100%;padding:4px" value="季節により品が替わります">
      <button id="addmode" style="margin-top:6px">足すモード：置きたい部品を押す</button>
    </div>
    <div class="box"><h4>付いていく先（Cのとき）</h4><ul id="anchorlist"></ul></div>
    <div class="box"><h4>操作の記録</h4><ol id="oplog"></ol></div>
    <div class="box"><h4>警告</h4><ul id="warns"></ul>
      <p class="hint" style="margin:6px 0 0">点線＝手で動かした部品／赤枠＝重なり・はみ出し／青枠＝付いていく先</p></div>
  </div>
  <div id="stage">
    <div class="seclabel">FEATURE（芦屋堂の味）</div><div id="host_feature" class="host"></div>
    <div class="seclabel">ITEMS（おすすめの品）</div><div id="host_items" class="host"></div>
    <div id="meas" style="position:absolute;left:-9999px;top:0"></div>
  </div>
</div>`;

const WIRING = `
const PHOTOS = PHOTOS_JSON;
let addMode = false;

function applyPhotos(){
  document.querySelectorAll("#stage .photo").forEach(el=>{
    if(el.classList.contains("empty")) return;
    const id=(el.textContent||"").trim();
    if(PHOTOS[id]){ el.style.backgroundImage="url("+PHOTOS[id]+")"; el.textContent=""; }
  });
}
const NAMES={scenario:"中身を変える",bodyInc:"本文＋",bodyDec:"本文−",heading2:"見出し2行",card1desc2:"品1説明2行",cards:"品の数",headBody:"間隔",move:"動かす",move2:"動かす",remove:"消す",clear:"写真を外す",unclear:"写真を戻す",add:"文字を足す",editRow:"写真高さ",reset:"自動に戻す"};
function opText(op){
  const nm=(id)=>C2.friendly(id);
  if(op.t==="moveA") return "動かす："+op.items.map(it=>nm(it.id)+"("+it.dx+","+it.dy+")").join("・")+" ["+op.device+"]";
  if(op.t==="moveC2") return "動かす："+op.items.map(it=>nm(it.id)+"→"+nm(it.anchor)+"の下 空き"+it.gapY).join("・")+" ["+op.device+"]";
  if(op.t==="add") return "文字を足す→"+nm(op.marker)+"の下 ["+op.device+"]";
  if(op.t==="clear"||op.t==="unclear"||op.t==="remove"||op.t==="reset") return (NAMES[op.t]||op.t)+"："+nm(op.id);
  if(op.t==="scenario") return "中身を変える："+op.name;
  return (NAMES[op.t]||op.t)+(op.v!=null?" "+op.v:"")+(op.n!=null?" "+op.n:"");
}
function renderOpLog(){ const ol=document.getElementById("oplog"); ol.innerHTML=""; for(const op of PG.api.ops()){ const li=document.createElement("li"); li.textContent=opText(op); ol.appendChild(li); } }
function renderAnchors(){ const ul=document.getElementById("anchorlist"); ul.innerHTML=""; if(PG.state.model!=="C2")return; for(const a of PG.anchorsList()){ const li=document.createElement("li"); li.textContent=a.partName+" → "+a.anchorName+"の下（空き"+a.gapY+"）"; ul.appendChild(li); } }
function renderWarnings(){ const w=PG.warnings(); const ul=document.getElementById("warns"); ul.innerHTML=""; for(const o of w.overlaps){ const li=document.createElement("li"); li.textContent="重なり："+C2.friendly(o.a)+" と "+C2.friendly(o.b); ul.appendChild(li);} for(const o of w.overflows){ const li=document.createElement("li"); li.textContent="はみ出し："+C2.friendly(o.id); ul.appendChild(li);} }
function updateBar(){
  const st=PG.state, R=PG.reduce(st.ops);
  document.getElementById("mA").classList.toggle("on",st.model==="A");
  document.getElementById("mC").classList.toggle("on",st.model==="C2");
  document.getElementById("dPC").classList.toggle("on",st.device==="pc");
  document.getElementById("dSP").classList.toggle("on",st.device==="sp");
  document.getElementById("bLbl").textContent=["ふつう","増やす","もっと"][R.cfg.bodyLevel];
  document.getElementById("cLbl").textContent=R.cfg.cards;
  document.getElementById("h1").classList.toggle("on",!R.cfg.heading2);
  document.getElementById("h2").classList.toggle("on",R.cfg.heading2);
  document.getElementById("d1").classList.toggle("on",!R.cfg.card1desc2);
  document.getElementById("d2").classList.toggle("on",R.cfg.card1desc2);
  const hb=R.tpl.headBody||16;
  document.getElementById("g16").classList.toggle("on",hb===16);
  document.getElementById("g24").classList.toggle("on",hb===24);
  document.getElementById("groupsel").classList.toggle("on",st.groupSelectMode);
  document.getElementById("groupsel").textContent=st.groupSelectMode?"オン":"オフ";
}
window.onRender=function(){ applyPhotos(); renderOpLog(); renderAnchors(); renderWarnings(); updateBar();
  const names=[...PG.state.selected].map(id=>C2.friendly(id)); document.getElementById("selname").textContent=names.length?names.join("、"):"（なし）"; };

function replaceOp(pred, op){ PG.state.ops=PG.state.ops.filter(o=>!pred(o)); if(op) PG.state.ops.push(op); PG.render(); }
document.getElementById("mA").onclick=()=>PG.setModel("A");
document.getElementById("mC").onclick=()=>PG.setModel("C2");
document.getElementById("dPC").onclick=()=>PG.setDevice("pc");
document.getElementById("dSP").onclick=()=>PG.setDevice("sp");
document.getElementById("bInc").onclick=()=>{PG.state.ops.push({t:"bodyInc"});PG.render();};
document.getElementById("bDec").onclick=()=>{PG.state.ops.push({t:"bodyDec"});PG.render();};
document.getElementById("h1").onclick=()=>replaceOp(o=>o.t==="heading2",{t:"heading2",v:false});
document.getElementById("h2").onclick=()=>replaceOp(o=>o.t==="heading2",{t:"heading2",v:true});
document.getElementById("d1").onclick=()=>replaceOp(o=>o.t==="card1desc2",{t:"card1desc2",v:false});
document.getElementById("d2").onclick=()=>replaceOp(o=>o.t==="card1desc2",{t:"card1desc2",v:true});
document.getElementById("cInc").onclick=()=>{const n=Math.min(6,PG.reduce(PG.state.ops).cfg.cards+1);replaceOp(o=>o.t==="cards"||(o.t==="scenario"&&o.name==="S4"),{t:"cards",n});};
document.getElementById("cDec").onclick=()=>{const n=Math.max(2,PG.reduce(PG.state.ops).cfg.cards-1);replaceOp(o=>o.t==="cards"||(o.t==="scenario"&&o.name==="S4"),{t:"cards",n});};
document.getElementById("g16").onclick=()=>replaceOp(o=>o.t==="headBody",null);
document.getElementById("g24").onclick=()=>replaceOp(o=>o.t==="headBody",{t:"headBody",v:24});
document.getElementById("undo").onclick=()=>PG.undo();
document.getElementById("resetAll").onclick=()=>PG.reset();
document.getElementById("groupsel").onclick=()=>{PG.state.groupSelectMode=!PG.state.groupSelectMode;PG.render();};
document.querySelectorAll("[data-preset]").forEach(b=>b.onclick=()=>PG.runPreset(b.dataset.preset));

function setMsg(t){ document.getElementById("msg").textContent=t||""; }
function sel1(){ return [...PG.state.selected][0]; }
document.getElementById("aClear").onclick=()=>{ if(sel1()) PG.state.ops.push({t:"clear",id:sel1()}),PG.render(); };
document.getElementById("aUnclear").onclick=()=>{ if(sel1()) PG.state.ops.push({t:"unclear",id:sel1()}),PG.render(); };
document.getElementById("aRemove").onclick=()=>{ if(sel1()) PG.state.ops.push({t:"remove",id:sel1()}),PG.render(); };
document.getElementById("aReset").onclick=()=>{ if(sel1()) PG.state.ops.push({t:"reset",id:sel1()}),PG.render(); };
document.getElementById("addmode").onclick=(e)=>{ addMode=!addMode; e.target.classList.toggle("on",addMode); setMsg(addMode?"置きたい部品を押してください":""); };

// ---- 選択・ドラッグ・範囲選択（マウス＋タッチ）----
let marquee=null;
function elFrom(t){ const n=t.closest?t.closest("[data-el]"):null; return n?n.getAttribute("data-el"):null; }
const stage=document.getElementById("stage");

stage.addEventListener("pointerdown",(e)=>{
  const rawId=elFrom(e.target);
  if(addMode){ if(rawId){ const c=PG.canonId(rawId); const txt=document.getElementById("addtext").value||"季節により品が替わります"; PG.addBelow(c,24,txt); } addMode=false; document.getElementById("addmode").classList.remove("on"); setMsg(""); return; }
  if(!rawId){ // 何もない所：PC は範囲選択、SP は選択解除
    if(e.pointerType!=="touch"){ marquee={x0:e.clientX,y0:e.clientY,el:document.createElement("div")}; marquee.el.className="marquee"; document.body.appendChild(marquee.el); e.preventDefault(); }
    else { PG.clearSel(); }
    return;
  }
  const id=PG.canonId(rawId);
  if(PG.REPEAT.test(rawId)){ PG.selectMany([]); setMsg("品は1件ずつ動かせません（1行の作りを変えると全部に効きます）"); return; }
  if(!PG.isDraggable(id)){ PG.selectMany([]); setMsg("この部品は動かせません"); return; }
  // Shift＋クリック（PC）／まとめて選ぶ（SP）＝選択の足し引き
  if((e.shiftKey && e.pointerType!=="touch") || PG.state.groupSelectMode){ PG.toggleSel(id); setMsg(""); return; }
  const inMulti = PG.state.selected.has(id) && PG.state.selected.size>1;
  if(!inMulti) PG.selectOnly(id);
  // マウスはそのままドラッグ／タッチは「選ぶ→もう一度押したまま動かす」。
  // 選ぶと再描画で DOM が作り直されるため、ポインタ捕捉は使わず window の move/up で追う（掴んだ節点が入れ替わっても動く）。
  const wasSel = inMulti || PG.state.selected.has(id);
  if(e.pointerType!=="touch" || wasSel){
    if(PG.beginDrag(e.clientX,e.clientY)){ e.preventDefault(); setMsg(""); }
  } else setMsg("選びました。もう一度押したまま動かせます");
},{passive:false});

window.addEventListener("pointermove",(e)=>{
  if(marquee){ const x=Math.min(marquee.x0,e.clientX),y=Math.min(marquee.y0,e.clientY),w=Math.abs(e.clientX-marquee.x0),h=Math.abs(e.clientY-marquee.y0); Object.assign(marquee.el.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px"}); e.preventDefault(); return; }
  if(PG.isDragging()){ e.preventDefault(); PG.dragMove(e.clientX,e.clientY); }
},{passive:false});

window.addEventListener("pointerup",(e)=>{
  if(marquee){
    const r=marquee.el.getBoundingClientRect(); marquee.el.remove(); marquee=null;
    const chosen=[];
    for(const host of ["host_feature","host_items"]){ const hs=document.getElementById(host); if(!hs)continue;
      for(const el of hs.querySelectorAll("[data-el]")){ const rawId=el.getAttribute("data-el"); const c=PG.canonId(rawId); if(!PG.isDraggable(c)||PG.REPEAT.test(rawId))continue; const b=el.getBoundingClientRect(); if(b.left>=r.left-0.5&&b.top>=r.top-0.5&&b.right<=r.right+0.5&&b.bottom<=r.bottom+0.5) if(!chosen.includes(c)) chosen.push(c); } }
    PG.selectMany(chosen); return;
  }
  if(PG.isDragging()) PG.endDrag();
});

PG.render();
`;

async function buildFull() {
  const photos = await encodePhotos();
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>wa-01 layout playground 2（A と 新しい C を触って比べる）</title>
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
  const out = path.join(outDir, "playground2_single.html");
  fs.writeFileSync(out, html);
  console.log(`wrote ${out}  (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
  fs.writeFileSync(path.join(here, "index.html"), html);
}
await buildFull();
