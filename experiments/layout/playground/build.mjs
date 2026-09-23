// playground_single.html を組み立てる。
// 配置の計算と編集操作は experiments/layout の a-box/c-hybrid/b-anchor/lib/spec を「そのまま」使う
// （関数で包んで名前衝突を避けつつ、ロジックは書き換えない）。改行は budoux を埋め込み、DOM で keep を測る。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const L = path.resolve(here, "..");       // experiments/layout
const ROOT = path.resolve(here, "../../..");

// ---- モジュールを関数で包む（import 行を除去し、export を外し、prelude で依存を注入）----
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
  wrap("CHYBRID", path.join(L, "c-hybrid/model.mjs"), "const {textDecls, STYLES, COLORS, DESIGN_W, lbOf}=SPEC; const {collectTextBoxes: bBoxes}=BANCHOR;", ["collectTextBoxes", "buildFeature", "buildItems"]),
].join("\n");

// ---- budoux（parser + ja モデル）を埋め込む ----
function stripMod(file) { return fs.readFileSync(file, "utf8").replace(/^[ \t]*import\s[^\n]*\n/gm, "").replace(/^[ \t]*export\s+/gm, ""); }
const budoux = `const BUDOUX = (function(){\n${stripMod(path.join(ROOT, "node_modules/budoux/module/parser.js"))}\n${stripMod(path.join(ROOT, "node_modules/budoux/module/data/models/ja.js"))}\nreturn { Parser, model };\n})();\n`;

const textlayer = fs.readFileSync(path.join(here, "textlayer.js"), "utf8");

// ---- セクションの CSS（本線 browser.mjs の BASE_CSS と同じ折り返し規則）----
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

export function coreScript() {
  return `${budoux}\n${modelBundle}\n${textlayer}\n`;
}
export function baseCss() { return BASE_CSS; }

const CONTENT = JSON.parse(fs.readFileSync(path.join(L, "playground/_content.json"), "utf8"));
const FONT_LINK = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;500;600;700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=block">`;
const ROOTVARS = ":root{font-size:10px;--c-background:#FFFFFF;--c-surface:#EEEEEE;--c-text:#333333;--c-textMuted:#7B7B7B;--c-line:#B0B0B0}";

// ---- テスト用ページ（geometry を出す。UI なし）----
if (process.argv[2] === "test") {
  const html = `<!doctype html><html><head><meta charset="utf-8">${FONT_LINK}
<style>${ROOTVARS}${BASE_CSS}</style></head><body><div id="host"></div><script>
${coreScript()}
const CONTENT = ${JSON.stringify(CONTENT)};
window.__render = function(method, section, device){
  const M = method==="A"?ABOX:CHYBRID;
  const boxes = M.collectTextBoxes(CONTENT, device);
  const H = TEXT.buildH(boxes, document.getElementById("host"), SPEC);
  const out = (section==="feature"?M.buildFeature:M.buildItems)(CONTENT, device, H, {});
  document.getElementById("host").innerHTML = out.bodyHtml;
  const sec = document.getElementById("sec"); const sr = sec.getBoundingClientRect(); const R = n => Math.round(n*100)/100;
  return { els: Object.fromEntries([...sec.querySelectorAll("[data-el]")].map(e=>{const r=e.getBoundingClientRect(); return [e.getAttribute("data-el"), {x:R(r.left-sr.left),y:R(r.top-sr.top),w:R(r.width),h:R(r.height)}];})) };
};</script></body></html>`;
  fs.writeFileSync(path.join(here, "_bundle_test.html"), html);
  console.log("wrote _bundle_test.html");
  process.exit(0);
}

// ---- 写真を JPEG(≤1200・q80) の data URI にして埋め込む ----
async function encodePhotos() {
  const assets = JSON.parse(fs.readFileSync(path.join(ROOT, "samples/ashiyado/assets.json"), "utf8")).assets;
  const need = { ast_frme: 1, ast_frmf: 1, ast_frmg: 1, ast_frmh: 1, ast_frmi: 1 };
  const { chromium } = await import("playwright");
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  const out = {};
  for (const id of Object.keys(need)) {
    const file = path.join(ROOT, "samples/ashiyado/media", assets[id].file.key);
    const buf = fs.readFileSync(file);
    const src = `data:image/jpeg;base64,${buf.toString("base64")}`;
    out[id] = await p.evaluate(async (s) => {
      const img = new Image(); img.src = s; await img.decode();
      const w = Math.min(1200, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      return cv.toDataURL("image/jpeg", 0.8);
    }, src);
  }
  out.ast_frmx = out.ast_frmi; // 追加カード用（見た目のみ）
  await b.close();
  return out;
}

// ---- 見比べ・触るページ本体 ----
const UI_CSS = `
*{box-sizing:border-box}
body{margin:0;font:14px/1.6 system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif;color:#222;background:#f4f4f5}
#bar{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #ddd;padding:8px;display:flex;flex-wrap:wrap;gap:8px}
#bar fieldset{border:1px solid #ddd;border-radius:6px;margin:0;padding:4px 8px;display:flex;align-items:center;gap:4px}
#bar legend{font-size:11px;color:#666;padding:0 4px}
button{font:13px system-ui;padding:5px 9px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}
button.on{background:#333;color:#fff;border-color:#333}
button:active{transform:translateY(1px)}
#wrap{display:flex;gap:12px;padding:12px;align-items:flex-start}
#side{flex:none;width:260px;position:sticky;top:56px}
#side .box{background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:10px}
#side h4{margin:0 0 6px;font-size:13px}
#oplog{margin:0;padding-left:20px;font:12px/1.5 monospace;max-height:180px;overflow:auto}
#warns{margin:0;padding-left:18px;color:#c00;font-size:12px}
#warns:empty::after{content:"なし";color:#888}
#msg{color:#0a6;font-size:12px;min-height:18px}
#stage{flex:1;min-width:0}
.seclabel{font:12px monospace;color:#888;margin:6px 0 2px}
.host{border:1px solid #ddd;background:#fff;overflow:hidden;position:relative}
.mark-manual{outline:2px dashed #e08a00 !important;outline-offset:-1px}
.mark-warn{outline:2px solid #d00 !important;outline-offset:-1px}
.mark-sel{outline:2px solid #06c !important;outline-offset:-1px}
[data-el]{cursor:default}
.hint{font-size:12px;color:#666}
@media(max-width:760px){#wrap{flex-direction:column}#side{width:100%;position:static;order:2}#stage{order:1;width:100%}}
`;

const UI_BODY = `
<div id="bar">
  <fieldset><legend>方式</legend><button id="mA" class="on">A</button><button id="mC">C</button></fieldset>
  <fieldset><legend>画面</legend><button id="dPC" class="on">PC</button><button id="dSP">スマホ</button></fieldset>
  <fieldset><legend>本文</legend><button id="bDec">−</button><span id="bLbl">ふつう</span><button id="bInc">＋</button></fieldset>
  <fieldset><legend>見出し</legend><button id="h1" class="on">1行</button><button id="h2">2行</button></fieldset>
  <fieldset><legend>品の数</legend><button id="cDec">−</button><span id="cLbl">3</span><button id="cInc">＋</button></fieldset>
  <fieldset><legend>品1の説明</legend><button id="d1" class="on">1行</button><button id="d2">2行</button></fieldset>
  <fieldset><legend>見出しと本文の間隔</legend><button id="g16" class="on">16</button><button id="g24">24</button></fieldset>
  <fieldset><legend>試験を再現</legend><button data-preset="E1">E1</button><button data-preset="E2">E2</button><button data-preset="E4">E4</button><button data-preset="E5">E5</button><button data-preset="E5b">E5b</button><button data-preset="E8">E8</button></fieldset>
  <fieldset><legend>操作</legend><button id="undo">1つ戻す</button><button id="resetAll">最初から</button></fieldset>
</div>
<div id="wrap">
  <div id="side">
    <div class="box">
      <h4>選んだ部品</h4><div id="selname" class="hint">部品を押すと選べます</div>
      <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
        <button id="aClear">写真を外す</button><button id="aUnclear">写真を戻す</button>
        <button id="aRemove">部品を消す</button><button id="aReset">自動に戻す</button>
      </div>
      <div id="msg"></div>
    </div>
    <div class="box">
      <h4>文字を足す</h4>
      <input id="addtext" placeholder="足す文字" style="width:100%;padding:4px">
      <button id="addmode" style="margin-top:6px">足すモード：置きたい部品を押す</button>
    </div>
    <div class="box"><h4>操作の記録</h4><ol id="oplog"></ol></div>
    <div class="box"><h4>警告</h4><ul id="warns"></ul>
      <p class="hint" style="margin:6px 0 0">点線＝手で変えた部品／赤枠＝重なり・はみ出し</p></div>
  </div>
  <div id="stage">
    <div class="seclabel">FEATURE（芦屋堂の味）</div><div id="host_feature" class="host"></div>
    <div class="seclabel">ITEMS（おすすめの品）</div><div id="host_items" class="host"></div>
    <div id="meas" style="position:absolute;left:-9999px;top:0"></div>
  </div>
</div>`;

const WIRING = `
const PHOTOS = PHOTOS_JSON;
const DRAGGABLE = new Set(["F_h0","F_b0","F_h1","F_b1"]);
const CARDCELL = /^(card_|row_)/;
let addMode = false;

function applyPhotos(){
  document.querySelectorAll("#stage .photo").forEach(el=>{
    if(el.classList.contains("empty")) return;
    const id=(el.textContent||"").trim();
    if(PHOTOS[id]){ el.style.backgroundImage="url("+PHOTOS[id]+")"; el.textContent=""; }
  });
}
function renderOpLog(){
  const names={scenario:"中身",bodyInc:"本文＋",bodyDec:"本文−",heading2:"見出し2行",card1desc2:"品1説明2行",cards:"品の数",headBody:"間隔",move:"動かす",moveOut:"外へ動かす",remove:"消す",clear:"写真外す",unclear:"写真戻す",add:"文字を足す",editRow:"写真高さ"};
  const ol=document.getElementById("oplog"); ol.innerHTML="";
  for(const op of PG.api.ops()){ const li=document.createElement("li"); li.textContent=(names[op.t]||op.t)+(op.id?" "+op.id:"")+(op.name?" "+op.name:"")+(op.dx!=null?" ("+op.dx+","+op.dy+")":"")+(op.n!=null?" "+op.n:"")+(op.v!=null?" "+op.v:""); ol.appendChild(li); }
}
function renderWarnings(){
  const w=PG.warnings(); const ul=document.getElementById("warns"); ul.innerHTML="";
  for(const o of w.overlaps){ const li=document.createElement("li"); li.textContent="重なり："+o.a+" と "+o.b; ul.appendChild(li); }
  for(const o of w.overflows){ const li=document.createElement("li"); li.textContent="はみ出し："+o.id; ul.appendChild(li); }
}
function updateBar(){
  const st=PG.state, cfg=PG.reduce(st.ops).cfg;
  document.getElementById("mA").classList.toggle("on",st.model==="A");
  document.getElementById("mC").classList.toggle("on",st.model==="C");
  document.getElementById("dPC").classList.toggle("on",st.device==="pc");
  document.getElementById("dSP").classList.toggle("on",st.device==="sp");
  document.getElementById("bLbl").textContent=["ふつう","増やす","もっと"][cfg.bodyLevel];
  document.getElementById("cLbl").textContent=cfg.cards;
  document.getElementById("h1").classList.toggle("on",!cfg.heading2);
  document.getElementById("h2").classList.toggle("on",cfg.heading2);
  document.getElementById("d1").classList.toggle("on",!cfg.card1desc2);
  document.getElementById("d2").classList.toggle("on",cfg.card1desc2);
  const hb=PG.reduce(st.ops).edits.template.headBody||16;
  document.getElementById("g16").classList.toggle("on",hb===16);
  document.getElementById("g24").classList.toggle("on",hb===24);
}
window.onRender=function(){ applyPhotos(); renderOpLog(); renderWarnings(); updateBar(); const s=document.getElementById("selname"); s.textContent=PG.state.selected||"（なし）"; };

// トグル系（同種の op を置き換える）
function replaceOp(pred, op){ PG.state.ops=PG.state.ops.filter(o=>!pred(o)); if(op) PG.state.ops.push(op); PG.render(); }
document.getElementById("mA").onclick=()=>PG.setModel("A");
document.getElementById("mC").onclick=()=>PG.setModel("C");
document.getElementById("dPC").onclick=()=>PG.setDevice("pc");
document.getElementById("dSP").onclick=()=>PG.setDevice("sp");
document.getElementById("bInc").onclick=()=>PG.push({t:"bodyInc"});
document.getElementById("bDec").onclick=()=>PG.push({t:"bodyDec"});
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
document.querySelectorAll("[data-preset]").forEach(b=>b.onclick=()=>PG.applyOps(PG.presets()[b.dataset.preset]));

function setMsg(t){ document.getElementById("msg").textContent=t||""; }
document.getElementById("aClear").onclick=()=>{ if(sel()) PG.push({t:"clear",id:sel()}); };
document.getElementById("aUnclear").onclick=()=>{ if(sel()) PG.push({t:"unclear",id:sel()}); };
document.getElementById("aRemove").onclick=()=>{ if(sel()) PG.push({t:"remove",id:sel()}); };
document.getElementById("aReset").onclick=()=>{ if(sel()) PG.push({t:"reset",id:sel()}); };
document.getElementById("addmode").onclick=(e)=>{ addMode=!addMode; e.target.classList.toggle("on",addMode); setMsg(addMode?"置きたい部品を押してください":""); };
function sel(){ return PG.state.selected; }

// ---- 選択とドラッグ（マウス＋タッチ）----
let drag=null;
function elFrom(t){ const n=t.closest?t.closest("[data-el]"):null; return n?n.getAttribute("data-el"):null; }
document.getElementById("stage").addEventListener("pointerdown",(e)=>{
  const id=elFrom(e.target); if(!id) return;
  if(addMode){ const txt=document.getElementById("addtext").value||"季節により品が替わります"; PG.push({t:"add",marker:id,gap:24,x:0,y:0,w:300,text:txt}); addMode=false; document.getElementById("addmode").classList.remove("on"); setMsg(""); return; }
  if(CARDCELL.test(id)){ PG.state.selected=id; setMsg("品は1件ずつ動かせません（1行の作りを変えると全部に効きます）"); PG.render(); return; } // スクロールは妨げない
  const wasSel=PG.state.selected===id; PG.state.selected=id;
  // マウスはそのままドラッグ／タッチは「選ぶ→もう一度押したまま動かす」（選んでいない部品はスクロールを妨げない）
  if(DRAGGABLE.has(id) && (e.pointerType!=="touch" || wasSel)){
    const m=PG.currentMove(id); drag={id,sx:e.clientX,sy:e.clientY,bdx:m.dx,bdy:m.dy};
    e.target.setPointerCapture&&e.target.setPointerCapture(e.pointerId); e.preventDefault();
    setMsg("");
  } else if(DRAGGABLE.has(id)){ setMsg("選びました。もう一度押したまま動かせます"); }
  else { setMsg("この部品は選ぶだけ（動かせるのは特集の見出し・本文）"); }
  PG.render();
},{passive:false});
document.getElementById("stage").addEventListener("pointermove",(e)=>{
  if(!drag) return; e.preventDefault();
  const sc=PG.getScale();
  PG.setMove(drag.id, drag.bdx+(e.clientX-drag.sx)/sc, drag.bdy+(e.clientY-drag.sy)/sc); PG.render();
},{passive:false});
window.addEventListener("pointerup",()=>{ drag=null; });

PG.render();
`;

async function buildFull() {
  const photos = await encodePhotos();
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>wa-01 layout playground（A と C を触って比べる）</title>
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
  const out = path.join(outDir, "playground_single.html");
  fs.writeFileSync(out, html);
  const bytes = fs.statSync(out).size;
  console.log(`wrote ${out}  (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  // 作業用にも置く
  fs.writeFileSync(path.join(here, "index.html"), html);
}
await buildFull();
