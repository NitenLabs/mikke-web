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
/* X12：描き直しでスクロール位置が勝手に飛ばないように（Chrome/Edge の scroll anchoring を切る） */
html,body{overflow-anchor:none}
#stage,#sectionwrap,.sec-wrap,.host,#sec,.stack{overflow-anchor:none}
body{margin:0;font:14px/1.6 system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif;color:#222;background:#f4f4f5}
/* §19b（X20）上の道具は常に1段。入りきらないぶんは「その他 ▾」にしまう（窓の幅で機能を隠さない） */
#toolbar{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid #ddd;padding:6px 8px;display:flex;gap:6px;align-items:center;flex-wrap:nowrap;overflow:hidden}
/* 道具のかたまりは中で折り返さない・縮まない＝入りきらないと横にあふれる（それを layoutToolbar が「その他」へしまう） */
#toolbar>button,#toolbar>span:not(.sp){flex:0 0 auto}
#tstools,#photoTools,#elemTools{flex-wrap:nowrap;flex-shrink:0}
#tMore{display:none}
#moreMenu{position:fixed;z-index:62;background:#fff;border:1px solid #bbb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);padding:4px;display:none;flex-direction:column;gap:2px;align-items:stretch}
#moreMenu.on{display:flex}
#moreMenu>*{margin:0}
#moreMenu .div{display:none!important}
/* §20（X23.②）しまったボタンは名前つき・高さそろえ（30以上）。アイコンだけの物は字を隠して名前を出す（色は見本を名前の左に） */
#moreMenu [data-more-name]{display:flex!important;align-items:center;gap:6px;justify-content:flex-start;min-height:30px;width:100%;padding:4px 10px;font-size:0;text-align:left}
#moreMenu [data-more-name]::after{content:attr(data-more-name);font:13px system-ui;color:#333}
#moreMenu [data-more-name].on::after{color:#fff}/* §20b X25：今の端末・選んでいる印の行は黒地（button.on）なので文字を白に＝上の並びと同じ見た目 */
#moreMenu [data-more-name]>*{display:none}
#moreMenu [data-more-name] .sw{display:inline-block;width:16px;height:16px;border:1px solid #bbb;border-radius:3px}
#moreMenu #tstools,#moreMenu #photoTools,#moreMenu #elemTools{display:inline-flex!important}
#toolbar .sp{flex:1}
/* §22 §3 状態の文字・公開ボタン・「公開しました」トースト */
#saveStatus{font:12px system-ui;color:#666;white-space:nowrap;padding:0 6px;flex:0 0 auto}
#saveStatus.warn{color:#e08a00;font-weight:700}
#tPublish{background:#06c;color:#fff;border-color:#06c}
#tPublish:disabled{background:#eee;color:#aaa;border-color:#ddd;cursor:default}
#publishToast{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:90;background:#333;color:#fff;font:13px system-ui;padding:9px 18px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.25);display:none}
#publishToast.on{display:block}
#moreMenu .morestat{font:12px system-ui;color:#666;padding:4px 10px;min-height:30px;display:flex;align-items:center;cursor:default}
#moreMenu .morestat.warn{color:#e08a00;font-weight:700}
/* §22 §4.1 公開前の確認の箱 */
#publishBox{position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.35);display:none;align-items:center;justify-content:center}
#publishBox.on{display:flex}
#publishBox .pbox-inner{background:#fff;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.3);width:min(560px,92vw);max-height:84vh;display:flex;flex-direction:column;padding:20px 22px;font:14px system-ui}
#publishBox .pbox-title{font-size:16px;font-weight:700;color:#222;margin-bottom:12px}
#publishBox .pbox-list{overflow-y:auto;flex:1}
#publishBox .pbox-kind{font-size:12px;color:#888;margin:12px 0 4px;font-weight:700}
#publishBox .pbox-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #eee}
#publishBox .pbox-rowtext{flex:1;color:#333;line-height:1.5}
#publishBox .pbox-see{flex:0 0 auto;font:13px system-ui;padding:4px 12px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}
#publishBox .pbox-btns{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
#publishBox .pbox-btns button{font:14px system-ui;padding:8px 16px;border-radius:8px;border:1px solid #bbb;background:#fff;cursor:pointer}
#publishBox .pbox-btns button.pbox-go{background:#06c;color:#fff;border-color:#06c}
/* §22 §5 プレビュー（お客さんが見る形）の短い帯＝3つだけ：文字・PC/スマホ・編集に戻る */
#previewBar{position:sticky;top:0;z-index:31;display:none;background:#222;color:#fff;padding:8px 12px;align-items:center;gap:10px;font:13px system-ui}
#previewBar.on{display:flex}
#previewBar .pv-title{font-weight:700}
#previewBar .sp{flex:1}
#previewBar button{font:13px system-ui;padding:5px 10px;border:1px solid #666;border-radius:6px;background:#333;color:#fff;cursor:pointer}
#previewBar button.on{background:#fff;color:#222;border-color:#fff}
body.pg-preview #toolbar{display:none}
body.pg-preview .sec-add-zone{display:none!important}
body.pg-preview #photoChangeBtn,body.pg-preview #fmenu,body.pg-preview #pbar,body.pg-preview #pmore{display:none!important}
body.pg-preview #sectionwrap [data-el]{cursor:default}
body.pg-preview #sectionwrap [data-lk]{cursor:pointer}
/* §22 §6 履歴の板（右・幅300）と、見るだけの帯 */
#historyBar{position:sticky;top:0;z-index:31;display:none;background:#2a2a2a;color:#fff;padding:8px 12px;align-items:center;gap:10px;font:13px system-ui}
#historyBar.on{display:flex}
#historyBar .hb-title{font-weight:700}
#historyBar .sp{flex:1}
#historyBar button{font:13px system-ui;padding:5px 10px;border:1px solid #666;border-radius:6px;background:#333;color:#fff;cursor:pointer}
#historyBar button.go{background:#06c;border-color:#06c}
#historyPanel{position:fixed;top:0;right:0;width:300px;height:100vh;z-index:40;background:#fff;box-shadow:-2px 0 12px rgba(0,0,0,.18);display:none;flex-direction:column;font:13px system-ui}
#historyPanel.on{display:flex}
#historyPanel .hp-head{padding:12px 14px;font-weight:700;border-bottom:1px solid #eee;display:flex;align-items:center}
#historyPanel .hp-head .sp{flex:1}
#historyPanel .hp-head button{font:13px system-ui;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;padding:3px 8px}
#historyPanel .hp-list{overflow-y:auto;flex:1}
#historyPanel .hp-row{padding:10px 14px;border-bottom:1px solid #f0f0f0;cursor:pointer}
#historyPanel .hp-row:hover{background:#f6f6f6}
#historyPanel .hp-row.viewing{background:#eef5ff}
#historyPanel .hp-main{color:#222}
#historyPanel .hp-badge{display:inline-block;font-size:11px;color:#06c;border:1px solid #06c;border-radius:4px;padding:0 5px;margin-left:6px}
#historyPanel .hp-sub{color:#999;font-size:11px;margin-top:2px}
#historyPanel .hp-sub.warn{color:#e08a00}
body.pg-viewing #toolbar{display:none}
body.pg-viewing .sec-add-zone{display:none!important}
body.pg-viewing #photoChangeBtn,body.pg-viewing #fmenu,body.pg-viewing #pbar,body.pg-viewing #pmore{display:none!important}
body.pg-viewing #sectionwrap [data-el]{cursor:default}
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
#elemTools{display:none;align-items:center;gap:4px}
#cardsTools{display:none;align-items:center;gap:4px}
#cardsTools .div{width:1px;height:20px;background:#ddd}
/* §20b §3 列の見本（横並び・写真の「明るさ ▾」と同じ形：小さな絵＋名前、今の列に青枠、押せない列は灰色） */
#colsPop{padding:8px}
#colsPop .swrow{display:flex;gap:8px}
#colsPop .sw{display:flex;flex-direction:column;align-items:center;gap:4px;border:2px solid transparent;border-radius:8px;padding:4px;background:none;cursor:pointer}
#colsPop .sw.cur{border-color:#06c}
#colsPop .sw[disabled]{opacity:.4;cursor:default}
#colsPop .sw .thumb{width:60px;height:44px;border:1px solid #ccc;border-radius:4px;display:grid;gap:3px;padding:6px;box-sizing:border-box;background:#fff}
#colsPop .sw .thumb i{background:#9bb;border-radius:1px;display:block}
#colsPop .sw .cap{font:11px system-ui;color:#555}
#elemTools .div{width:1px;height:20px;background:#ddd}
/* §19 書体の一覧（.tspop を踏襲）・各行に見本＋名前 */
#fontPop{padding:4px;min-width:200px}
#fontPop .frow{display:block;width:100%;text-align:left;border:0;background:none;border-radius:6px;padding:6px 8px;cursor:pointer}
#fontPop .frow:hover,#fontPop .frow.cur{background:#eef4ff}
#fontPop .frow .sample{font-size:18px;color:#222;line-height:1.3}
#fontPop .frow .nm{font:11px system-ui;color:#888;margin-top:2px}
#fontPop .frow .ck{color:#06c;margin-right:4px}
/* §19 リンクのつなぎ先の一覧 */
#linkPanel{position:fixed;z-index:70;background:#fff;border:1px solid #bbb;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:8px;display:none;width:280px;max-height:80vh;overflow:auto;font:13px system-ui}
#linkPanel.on{display:block}
#linkPanel .seg{font:11px system-ui;color:#999;margin:8px 4px 4px}
#linkPanel .seg:first-child{margin-top:2px}
#linkPanel .opt{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:1px solid transparent;border-radius:7px;padding:7px 9px;background:none;cursor:pointer;text-align:left}
#linkPanel .opt:hover{background:#f3f6ff}
#linkPanel .opt.cur{border-color:#06c}
#linkPanel .opt[disabled]{opacity:.4;cursor:default}
#linkPanel .opt .v{font:11px Space Mono,monospace;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px}
#linkPanel .ext{display:flex;gap:6px;margin:4px}
#linkPanel .ext input{flex:1;border:1px solid #ccc;border-radius:6px;padding:6px 8px;font:12px system-ui}
#linkPanel .ext button{border:1px solid #bbb;border-radius:6px;background:#fff;padding:0 10px;cursor:pointer}
#linkPanel .err{color:#c03030;font:11px system-ui;margin:2px 4px}
/* §19 リンクの札（ホバー） */
#linkChip{position:fixed;z-index:72;background:#222;color:#fff;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);padding:6px 8px;display:none;font:12px system-ui;align-items:center;gap:8px;white-space:nowrap}
#linkChip.on{display:flex}
#linkChip .nm{max-width:220px;overflow:hidden;text-overflow:ellipsis}
#linkChip button{border:0;background:#444;color:#fff;border-radius:5px;padding:3px 7px;cursor:pointer;font:12px system-ui}
#linkChip button:hover{background:#06c}
#fmenu{position:fixed;z-index:60;background:#fff;border:1px solid #bbb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);padding:4px;display:none;gap:4px}
#fmenu.on{display:flex}
#fmenu button{font-size:12px;padding:4px 8px}
#fmenu button:disabled{opacity:.4;cursor:default}
#fmenu .note{font-size:11px;color:#777;align-self:center;padding:0 4px}
/* §22 §8 前面/背面の ▸ サブ箱・区切り（横並びの fmenu から下へ出す） */
#fmenu .fdiv{width:1px;align-self:stretch;background:#ddd;margin:0 2px}
#fmenu .zrow{position:relative}
#fmenu .zsub{display:none;position:absolute;left:0;top:100%;margin-top:4px;background:#fff;border:1px solid #bbb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);padding:4px;flex-direction:column;gap:2px;min-width:150px;z-index:63;white-space:nowrap}
#fmenu .zrow:hover .zsub,#fmenu .zrow.open .zsub{display:flex}
.pg-phone #fmenu .zsub button{min-width:44px;min-height:44px}
/* §2 セクションを足す「＋」。境目の帯にマウスを乗せると出る。 */
.sec-add-zone{position:relative;height:14px;margin:0;display:flex;align-items:center;justify-content:center}
.sec-add-btn{opacity:0;transition:opacity .08s;width:26px;height:22px;line-height:1;padding:0;border:1px solid #06c;border-radius:50%;background:#fff;color:#06c;font-size:16px;cursor:pointer;z-index:20}
.sec-add-zone:hover .sec-add-btn,.sec-add-btn:focus{opacity:1}
#sectypes{position:fixed;z-index:62;background:#fff;border:1px solid #bbb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);padding:4px;display:none;gap:4px}
#sectypes.on{display:flex}
#sectypes button{font-size:12px;padding:4px 10px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}
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
/* §5（試験台17）明るさの道具（写真を1つ選んでいる間だけ） */
#photoTools{display:none;align-items:center;gap:4px}
#photoTools .div{width:1px;height:20px;background:#ddd}
#tBright{font:13px system-ui}
#brightPop{padding:8px}
#brightPop .swrow{display:flex;gap:8px}
#brightPop .sw{display:flex;flex-direction:column;align-items:center;gap:4px;border:2px solid transparent;border-radius:8px;padding:4px;background:none;cursor:pointer}
#brightPop .sw.cur{border-color:#06c}
#brightPop .sw .thumb{width:72px;height:46px;border:1px solid #ccc;border-radius:4px;background-size:cover;background-position:center}
#brightPop .sw .cap{font:11px system-ui;color:#555}
/* §2（試験台17）写真を変える（選んでいる写真の真ん中の浮遊ボタン・マウス操作のときだけ） */
#photoChangeBtn{position:fixed;z-index:40;display:none;align-items:center;gap:6px;height:36px;padding:0 14px;background:#fff;border:1px solid #ccc;border-radius:18px;box-shadow:0 2px 8px rgba(0,0,0,.22);font:14px system-ui;color:#333;cursor:pointer;white-space:nowrap;transform:translate(-50%,-50%)}
#photoChangeBtn.below{transform:translate(-50%,0)}
#photoChangeBtn .cam{width:16px;height:16px;flex:0 0 auto}
/* §2（試験台17）写真を選ぶ（空の枠・まだない写真の枠。マウス操作のときだけ） */
.photo.empty.has-choose{flex-direction:column;border:1px dashed #bbb}
.photo-choose{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;background:#fff;border:1px solid #ccc;border-radius:18px;box-shadow:0 1px 4px rgba(0,0,0,.12);font:14px system-ui;color:#333;cursor:pointer}
.photo-choose .cam{width:16px;height:16px;flex:0 0 auto}
.photo-choose-hint{font:11px system-ui;color:#999;margin-top:8px}
/* §3（試験台15）スマホでの編集：触れない部品は文字を選べない／長押しのメニューも出さない（iPhone 向けに callout も切る） */
.pg-phone #sectionwrap [data-el]{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.pg-phone #sectionwrap [data-el][contenteditable="true"]{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}
/* §4.2（試験台16）選んでいる部品：1本指は動かす・2本指のピンチはブラウザに任せる */
.pg-phone .mark-sel{touch-action:pinch-zoom}
/* §3.2.7 つまみの押せる範囲（44×44・透明の四角。見た目のつまみに重ねる） */
.hit-handle{position:absolute;z-index:9;background:transparent}
.pg-phone .hit-handle{touch-action:pinch-zoom}
/* §3.2.6 操作ボタンの箱：スマホは押しやすい大きさ（縦横44以上・文字15px） */
.pg-phone #fmenu button{min-width:44px;min-height:44px;font-size:15px}
/* §1 X6/X7：箱は見えている範囲の中。入らなければ折り返す */
.pg-phone #fmenu{flex-wrap:wrap}
.pg-phone #sectypes button{min-height:44px;font-size:15px}
/* 見せる範囲：指でなぞってもスクロールに取られない */
.pg-phone #cropwrap .dim,.pg-phone #cropwrap .clip{touch-action:none}

/* ===== §1-6（試験台16）スマホでの編集 第2回 ===== */
/* §1 X4：ページの幅＝画面の幅。#stage の余白とセクションの外枠線を外す。横スクロールさせない */
.pg-phone #stage{padding:0;touch-action:manipulation;padding-bottom:64px}
.pg-phone .host{border:none;touch-action:manipulation}   /* §4.2 ページ・セクションは1本指スクロール＋ピンチ可／ダブルタップ拡大は止める */
.pg-phone .seclabel{display:none}
.pg-phone{overflow-x:hidden}
/* §25 §2.1 320未満＝倍率 0.82 で縮めきれない分は、ページ全体を横に流す（layoutScale が pg-xscroll を付ける。横スクロールが出るのはこの場合だけ） */
.pg-phone.pg-xscroll{overflow-x:auto}
/* §2.1 上の道具の並びは出さない */
.pg-phone #toolbar{display:none}
/* §2 下の道具の並び（画面の下に固定・safe-area をあける） */
#pbar{position:fixed;left:0;top:0;z-index:70;display:none;background:#fff;border-top:1px solid #ddd;padding:6px 8px;padding-bottom:calc(6px + env(safe-area-inset-bottom));gap:8px;align-items:center;justify-content:flex-start;transform-origin:top left;box-shadow:0 -2px 10px rgba(0,0,0,.06)}
#pbar button{min-width:64px;min-height:44px;font-size:15px;flex:0 0 auto}
#pbar .sp{flex:1 1 auto;min-width:0}
/* §2.3 その他の一覧（並びのすぐ上に開く） */
#pmore{position:fixed;left:0;top:0;z-index:72;display:none;flex-direction:column;background:#fff;border:1px solid #bbb;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.18);padding:6px;gap:4px;transform-origin:top left;min-width:200px;max-height:40vh;overflow-y:auto}
#pmore.on{display:flex}
#pmore button{min-height:44px;font-size:15px;text-align:left;border:none;background:#fff;border-radius:6px;padding:8px 14px}
#pmore button:active{background:#eef}
#pmore .pmorestat{font:13px system-ui;color:#666;padding:8px 14px;min-height:44px;display:flex;align-items:center}
#pmore .pmorestat.warn{color:#e08a00;font-weight:700}
/* §3 キーボードのすぐ上の文字の道具 */
#ptext{position:fixed;left:0;top:0;z-index:74;display:none;background:#fff;border-top:1px solid #ddd;box-shadow:0 -2px 10px rgba(0,0,0,.08);padding:6px 8px;gap:6px;align-items:center;transform-origin:top left}
#ptext.on{display:flex}
#ptext button{min-width:48px;min-height:44px;font-size:15px}
#ptext .sp{flex:1}
#ptext [data-pt-bold] b{font-weight:700}
/* §4.3 道具の一覧（大きさ・色）。見えている範囲の中に開く */
.pmenu{position:fixed;left:0;top:0;z-index:76;background:#fff;border:1px solid #bbb;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.18);padding:6px;display:none;transform-origin:top left;max-height:260px;overflow:auto}
.pmenu.on{display:block}
#pSize{width:84px}
#pSize button{display:block;width:100%;min-height:44px;font-size:15px;border:none;background:#fff;border-radius:6px;text-align:center}
#pSize button:active{background:#eef}
#pColor{width:auto}
#pColor .cell{display:inline-block;width:44px;height:44px;border:1px solid #bbb;border-radius:8px;margin:3px;padding:0}
/* §6 セクションを足す「＋」。スマホではいつも出す（PC はマウスを乗せたときだけ＝変えない） */
.pg-phone .sec-add-zone{height:28px}
.pg-phone .sec-add-btn{opacity:1;width:28px;height:28px;font-size:18px;touch-action:manipulation}
.sec-add-hit{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:44px;height:44px;z-index:21;background:transparent;display:none}
.pg-phone .sec-add-hit{display:block;touch-action:manipulation}
/* ＋を出さないとき（PC の見え方／書き換え中／動かし・大きさ変え中） */
.pg-phone.pg-hideadd .sec-add-zone{visibility:hidden;pointer-events:none}
`;

const UI_BODY = `
<div id="toolbar">
  <button id="tText">テキスト</button>
  <button id="tPhoto">写真</button>
  <span class="div" style="width:1px;height:20px;background:#ddd"></span>
  <button id="dPC" class="on">PC</button><button id="dSP">スマホ</button>
  <span class="div" style="width:1px;height:20px;background:#ddd"></span>
  <button id="tPeek">元の配置を見る</button>
  <button id="tResetPage">このページを元に戻す</button>
  <button id="tUndo">戻す</button><button id="tRedo">やり直す</button>
  <span id="tstools">
    <span class="div"></span>
    <button data-ts="font" data-text-tool="font" title="書体">明朝 ▾</button>
    <span class="div"></span>
    <button data-ts="shrink" title="小さく"><span class="ab">A</span></button>
    <input data-ts="size" type="text" inputmode="numeric" value="16">
    <button data-ts="grow" title="大きく"><span class="ab">A</span></button>
    <button data-ts="size-list" title="よく使う大きさ">▾</button>
    <span class="div"></span>
    <button data-ts="bold" title="太字">B</button>
    <span class="div"></span>
    <button data-ts="color" title="色"><span class="sw"></span></button>
    <button data-ts="link" data-text-tool="link" title="リンク">リンク</button>
  </span>
  <span id="photoTools"><span class="div"></span><button id="tBright" data-photo-tool="brightness">明るさ ▾</button></span>
  <span id="cardsTools"><span class="div"></span><button id="tCols" data-cards-tool="cols">列 ▾</button></span>
  <span id="elemTools"><span class="div"></span><button id="tElemLink" data-elem-tool="link">リンク</button></span>
  <button id="tMore" data-more-btn>その他 ▾</button>
  <span class="sp"></span>
  <button id="tStudio">制作用</button>
  <span id="saveStatus" class="savestat"></span>
  <button id="tHistory">履歴</button>
  <button id="tPreview">プレビュー</button>
  <button id="tPublish">公開</button>
</div>
<div id="previewBar"></div>
<div id="historyBar"></div>
<div id="historyPanel"></div>
<div id="studio">
  <div class="box"><b>試験を再現</b><br>
    <button data-q="Q1">Q1</button><button data-q="Q2">Q2</button><button data-q="Q3">Q3</button><button data-q="Q4">Q4</button>
    <button data-q="Q5">Q5</button><button data-q="Q6">Q6</button><button data-q="Q7">Q7</button><button data-q="Q8">Q8</button><br>
    <button data-q="R1">R1</button><button data-q="R2">R2</button><button data-q="R3">R3</button><button data-q="R4">R4</button><button data-q="R5">R5</button>
    <button data-q="R6">R6</button><button data-q="R7">R7</button><button data-q="R8">R8</button><button data-q="R9">R9</button><br>
    <button data-q="T1">T1</button><button data-q="T2">T2</button><button data-q="T3">T3</button><button data-q="T4">T4</button><button data-q="T5">T5</button><button data-q="V1">V1</button><br>
    <button data-q="W1">W1</button><button data-q="W2">W2</button><button data-q="W3">W3</button><button data-q="W4">W4</button><button data-q="W5">W5</button><button data-q="W6">W6</button>
    <button data-q="W7">W7</button><button data-q="W8">W8</button><button data-q="W9">W9</button><button data-q="W10">W10</button><button data-q="W11">W11</button><br>
    <button data-q="W12">W12</button><button data-q="W13">W13</button><button data-q="W14">W14</button><button data-q="W15">W15</button><button data-q="W16">W16</button><button data-q="W17">W17</button><button data-q="W18">W18</button><button data-q="W19">W19</button><button data-q="W20">W20</button><button data-q="W21">W21</button><button data-q="W22">W22</button><button data-q="W23">W23</button><button data-q="W24">W24</button><br>
    <button data-q="Y1">Y1</button><button data-q="Y2">Y2</button><button data-q="Y3">Y3</button><button data-q="Y4">Y4</button><button data-q="Y5">Y5</button><button data-q="Y6">Y6</button><button data-q="Y7">Y7</button>
    <button data-q="Y8">Y8</button><button data-q="Y9">Y9</button><button data-q="Y10">Y10</button><button data-q="Y11">Y11</button><button data-q="Y12">Y12</button><button data-q="Y13">Y13</button><button data-q="Y14">Y14</button><br>
    <button data-q="Z1">Z1</button><button data-q="Z2">Z2</button><button data-q="Z3">Z3</button><button data-q="Z4">Z4</button><button data-q="Z5">Z5</button><button data-q="Z6">Z6</button><button data-q="Z7">Z7</button><br>
    <button data-q="P1">P1</button><button data-q="P2">P2</button><button data-q="P3">P3</button><button data-q="P4">P4</button><button data-q="P5">P5</button><button data-q="P6">P6</button><button data-q="P7">P7</button><button data-q="P8">P8</button>
    <button data-q="P9">P9</button><button data-q="P10">P10</button><button data-q="P11">P11</button><button data-q="P12">P12</button><button data-q="P13">P13</button><button data-q="P14">P14</button><button data-q="P15">P15</button><button data-q="P16">P16</button><br>
    <button data-q="U1">U1</button><button data-q="U2">U2</button><button data-q="U3">U3</button><button data-q="U4">U4</button><button data-q="U5">U5</button><button data-q="U6">U6</button><br>
    <button data-q="J1">J1</button><button data-q="J2">J2</button><button data-q="J3">J3</button><button data-q="J4">J4</button><button data-q="J5">J5</button><button data-q="J6">J6</button><button data-q="J7">J7</button>
    <button data-q="J8">J8</button><button data-q="J9">J9</button><button data-q="J10">J10</button><button data-q="J11">J11</button><button data-q="J12">J12</button><button data-q="J13">J13</button><br>
    <button data-q="D1">D1</button><button data-q="D2">D2</button><button data-q="D3">D3</button><button data-q="D4">D4</button><button data-q="D5">D5</button><button data-q="D6">D6</button>
    <button data-q="D7">D7</button><button data-q="D8">D8</button><button data-q="D9">D9</button><button data-q="D10">D10</button><button data-q="D11">D11</button><button data-q="D12">D12</button><br>
    <button data-q="S1">S1</button><button data-q="S2">S2</button><button data-q="S3">S3</button><button data-q="S4">S4</button><button data-q="S5">S5</button><button data-q="S6">S6</button><button data-q="S7">S7</button><button data-q="S8">S8</button>
    <button data-q="S9">S9</button><button data-q="S10">S10</button><button data-q="S11">S11</button><button data-q="S12">S12</button><button data-q="S13">S13</button><button data-q="S14">S14</button><button data-q="S15">S15</button><button data-q="S16">S16</button><br>
    <button data-q="S17">S17</button><button data-q="S18">S18</button><button data-q="S19">S19</button><button data-q="S20">S20</button><button data-q="S21">S21</button><button data-q="S22">S22</button><button data-q="S23">S23</button><button data-q="S24">S24</button>
    <button data-q="S25">S25</button><button data-q="S26">S26</button><button data-q="S27">S27</button><button data-q="S28">S28</button><button data-q="S29">S29</button><button data-q="S30">S30</button><button data-q="S31">S31</button><button data-q="S32">S32</button>
    <button data-q="S33">S33</button><button data-q="S34">S34</button><button data-q="S35">S35</button><button data-q="S36">S36</button><button data-q="S37">S37</button><button data-q="S38">S38</button><br>
    <button data-q="K1">K1</button><button data-q="K2">K2</button><button data-q="K3">K3</button><button data-q="K4">K4</button><button data-q="K5">K5</button><button data-q="K6">K6</button><button data-q="K7">K7</button><button data-q="K8">K8</button><button data-q="K9">K9</button>
    <button data-q="K10">K10</button><button data-q="K11">K11</button><button data-q="K12">K12</button><button data-q="K13">K13</button><button data-q="K14">K14</button><button data-q="K15">K15</button><button data-q="K16">K16</button><button data-q="K17">K17</button><button data-q="K18">K18</button><br>
    <button data-q="K19">K19</button><button data-q="K20">K20</button><button data-q="K21">K21</button><button data-q="K22">K22</button><button data-q="K23">K23</button><button data-q="K24">K24</button><button data-q="K25">K25</button><button data-q="K26">K26</button><button data-q="K27">K27</button><br>
    <button data-q="L1">L1</button><button data-q="L2">L2</button><button data-q="L3">L3</button><button data-q="L4">L4</button><button data-q="L5">L5</button><button data-q="L6">L6</button><button data-q="L7">L7</button><button data-q="L8">L8</button>
    <button data-q="L9">L9</button><button data-q="L10">L10</button><button data-q="L11">L11</button><button data-q="L12">L12</button><button data-q="L13">L13</button><button data-q="L14">L14</button><button data-q="L15">L15</button>
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
<div id="colorPop" class="tspop"></div>
<div id="fontPop" class="tspop"></div>
<div id="colsPop" class="tspop"></div>
<div id="linkPanel" data-link-panel></div>
<div id="linkChip" data-link-chip></div>
<div id="moreMenu"></div>
<div id="publishToast"></div>
<div id="publishBox"></div>
<button id="photoChangeBtn" type="button" data-photo-change></button>
<div id="brightPop" class="tspop"></div>
<div id="pbar"></div>
<div id="pmore"></div>
<div id="ptext"></div>
<div id="pSize" class="pmenu"></div>
<div id="pColor" class="pmenu"></div>`;

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
window.onRender=function(){ restoreFromMore(); applyPhotos(); refreshStudio(); positionFmenu(); updateTextTools(); updatePhotoTools(); updateElemTools(); updateCardsTools(); refreshPhotoBtns(); updateAddZones(); addHandleHits(); refreshPhoneUI(); syncOverlays(); if(typeof updateSaveUI==="function") updateSaveUI(); layoutToolbar(); if(typeof updateMoreStatus==="function") updateMoreStatus(); if(typeof syncPreviewUI==="function") syncPreviewUI(); if(typeof syncHistoryUI==="function") syncHistoryUI(); };
// §19b（X20）上の道具を常に1段に保ち、入りきらないぶんを「その他 ▾」にしまう（窓の幅で機能を隠さない）
const toolbarEl=document.getElementById("toolbar");
const tMore=document.getElementById("tMore");
const moreMenu=document.getElementById("moreMenu");
let movedToMore=[];
// §20（X23.②）しまったボタンは名前で出す（アイコンだけの物に名前・色は見本を名前の左に）
const MORE_NAMES={tStudio:"制作用",tPeek:"元の配置を見る",tResetPage:"このページを元に戻す",dPC:"PC",dSP:"スマホ",tPhoto:"写真",tText:"テキスト",tBright:"明るさ",tCols:"列",tElemLink:"リンク"};
const TS_NAMES={font:"書体",shrink:"小さく","size":"大きさ","size-list":"よく使う大きさ",grow:"大きく",bold:"太字",color:"文字の色",link:"リンク"};
function moreNameOf(el){ if(el.id&&MORE_NAMES[el.id]) return MORE_NAMES[el.id]; const ts=el.getAttribute&&el.getAttribute("data-ts"); if(ts&&TS_NAMES[ts]) return TS_NAMES[ts]; return (el.textContent||"").trim(); }
// §20（X23.④）並びと同じ順（PC→スマホ）。左→右＝上→下
const TB_ORDER=["tText","tPhoto","dPC","dSP","tPeek","tResetPage","ts:font","ts:shrink","ts:size","ts:grow","ts:size-list","ts:bold","ts:color","ts:link","tBright","tCols","tElemLink","tStudio"];
function orderKey(el){ if(el.id){ const i=TB_ORDER.indexOf(el.id); if(i>=0) return i; } const ts=el.getAttribute&&el.getAttribute("data-ts"); if(ts){ const i=TB_ORDER.indexOf("ts:"+ts); if(i>=0) return i; } return 999; }
function restoreFromMore(){ for(let i=movedToMore.length-1;i>=0;i--){ const m=movedToMore[i]; m.el.removeAttribute("data-more-name"); try{ m.parent.insertBefore(m.el, m.next&&m.next.parentNode===m.parent?m.next:null); }catch(_){ m.parent.appendChild(m.el); } } movedToMore=[]; }
function moveToMore(el){ movedToMore.push({el, parent:el.parentNode, next:el.nextSibling}); el.setAttribute("data-more-name", moreNameOf(el)); moreMenu.appendChild(el); }
function reorderMore(){ const kids=[...moreMenu.children]; kids.sort((a,b)=>orderKey(a)-orderKey(b)); for(const k of kids) moreMenu.appendChild(k); }
// §20（X23.③）並びに残った区切りは、先頭・末尾・続けて出さない
function cleanupDividers(){ for(const host of [toolbarEl, document.getElementById("tstools"), document.getElementById("photoTools"), document.getElementById("cardsTools"), document.getElementById("elemTools")]){ if(!host) continue;
  const vis=[...host.children].filter(c=>c.offsetParent!==null||c===toolbarEl); let seenBtn=false, lastWasDiv=false;
  const list=[...host.children];
  for(const c of list){ if(!c.classList||!c.classList.contains("div")) continue; c.style.display=""; }
  // 可視の子を左から見て、区切りが先頭/連続/末尾なら隠す
  const visChildren=[...host.children].filter(c=>c.offsetParent!==null);
  for(let i=0;i<visChildren.length;i++){ const c=visChildren[i]; if(!(c.classList&&c.classList.contains("div"))) continue;
    const prevBtn=visChildren.slice(0,i).some(x=>!(x.classList&&x.classList.contains("div")));
    const nextBtn=visChildren.slice(i+1).some(x=>!(x.classList&&x.classList.contains("div")));
    const prevIsDiv=i>0 && visChildren[i-1].classList&&visChildren[i-1].classList.contains("div");
    if(!prevBtn||!nextBtn||prevIsDiv) c.style.display="none"; } } }
function overflowCandidates(){ const out=[]; const push=(sel)=>{ const el=typeof sel==="string"?document.querySelector(sel):sel; if(el) out.push(el); };
  push("#tStudio"); push("#tHistory"); push("#tPreview"); push("#tPeek"); push("#tResetPage"); push("#dSP"); push("#dPC"); push("#tPhoto"); push("#tText");   // §22 §3.3 しまう順：制作用→履歴→プレビュー→元の配置→このページ→PC/スマホ→テキスト/写真（公開・戻す・やり直すはしまわない）
  for(const sel of ['#tstools [data-ts="link"]','#tstools [data-ts="color"]','#tstools [data-ts="bold"]','#tstools [data-ts="size-list"]','#tstools [data-ts="grow"]','#tstools [data-ts="size"]','#tstools [data-ts="shrink"]','#tstools [data-ts="font"]','#tBright','#tCols','#tElemLink']) push(sel);   // それでも入らなければ道具の右から
  return out; }   // 「戻す」「やり直す」は最後までしまわない
let laying=false;
function layoutToolbar(){ if(laying) return; laying=true;
  moreMenu.classList.remove("on"); restoreFromMore(); tMore.style.display="none"; cleanupDividers();
  const stat=document.getElementById("saveStatus"); if(stat) stat.style.display="";   // §22 §3.3 まず状態の文字を並びに戻す
  if(toolbarEl.scrollWidth<=toolbarEl.clientWidth+1){ laying=false; return; }
  tMore.style.display="inline-block";   // §19b CSS 既定が display:none のため明示的に出す（""だと none に戻る）
  // §22 X28：PC とスマホ、テキストと写真は組＝片方だけ並びに残さない（しまうときは相方も一緒にしまう）
  const PAIR={dSP:"dPC",dPC:"dSP",tPhoto:"tText",tText:"tPhoto"};
  for(const el of overflowCandidates()){ if(toolbarEl.scrollWidth<=toolbarEl.clientWidth+1) break; if(el && el.offsetParent!==null && el!==tMore){ moveToMore(el); const pid=PAIR[el.id]; if(pid){ const pe=document.getElementById(pid); if(pe && pe.offsetParent!==null) moveToMore(pe); } } }
  if(stat && toolbarEl.scrollWidth>toolbarEl.clientWidth+1) stat.style.display="none";   // §22 §3.3 それでも入らなければ状態の文字をしまう（→その他の一番上へ。updateMoreStatus）
  reorderMore(); cleanupDividers();
  laying=false; }
tMore.onmousedown=(e)=>e.preventDefault();
tMore.onclick=(e)=>{ e.stopPropagation(); if(moreMenu.classList.contains("on")){ moreMenu.classList.remove("on"); return; } moreMenu.classList.add("on"); const r=tMore.getBoundingClientRect(); const vw=innerWidth; const mw=moreMenu.offsetWidth||160; let left=Math.min(r.left, vw-8-mw); left=Math.max(8,left); moreMenu.style.left=Math.round(left)+"px"; moreMenu.style.top=(r.bottom+4)+"px"; };
window.addEventListener("pointerdown",(e)=>{ if(moreMenu.classList.contains("on")&&!moreMenu.contains(e.target)&&!tMore.contains(e.target)) moreMenu.classList.remove("on"); },true);
// §25 §2.1 画面を回した・窓の幅が変わったら、倍率を決め直して描き直す（中身は作り直さない＝書き換え中の文字・カーソル・選んでいる部品を保つ）。
let relayoutRAF=null;
function onViewportResize(){ if(relayoutRAF) cancelAnimationFrame(relayoutRAF); relayoutRAF=requestAnimationFrame(()=>{ relayoutRAF=null; try{ refreshPhoneUI(); if(PG.relayout) PG.relayout(); layoutToolbar(); positionFmenu(); addHandleHits(); syncOverlays(); }catch(_){} }); }
window.addEventListener("resize",onViewportResize);
window.addEventListener("orientationchange",onViewportResize);
// §2.5 書き換え中、空白・改行・全角空白を打った直後に、直前の URL/メールを自動リンクにする
window.onEditInput=function(e){ if(!PG.state.editing) return; const it=e&&e.inputType; const d=e&&e.data;
  const typedBreak=(it==="insertText"&&(d===" "||d==="　"))||it==="insertLineBreak"||it==="insertParagraph"||(it==="insertText"&&d==null);
  if(typedBreak) PG.autoLinkBeforeCaret(); };
// 書き換え中の選択が変わったら、書体・リンクのボタンの状態（名前・押せる押せない）を更新する
document.addEventListener("selectionchange",()=>{ if(PG.state.editing){ try{ updateFontLinkBtns(); }catch(_){} } });

document.getElementById("dPC").onclick=()=>{ PG.setDevice("pc"); document.getElementById("dPC").classList.add("on"); document.getElementById("dSP").classList.remove("on"); };
document.getElementById("dSP").onclick=()=>{ PG.setDevice("sp"); document.getElementById("dSP").classList.add("on"); document.getElementById("dPC").classList.remove("on"); };
// §23b 変換の境目を document でも監視（要素の oncomposition* が届かない経路の保険・CDP でも効く）
document.addEventListener("compositionstart",()=>{ if(PG.state.editing) PG.imeBoundary("start"); },true);
document.addEventListener("compositionend",()=>{ if(PG.state.editing) PG.imeBoundary("end"); },true);
document.getElementById("tUndo").onclick=()=>PG.undo();
document.getElementById("tRedo").onclick=()=>PG.redo();
document.getElementById("tResetPage").onclick=()=>PG.resetScope("page",null,["pc","sp"]);
document.getElementById("tStudio").onclick=(e)=>{ document.getElementById("studio").classList.toggle("on"); e.target.classList.toggle("on"); refreshStudio(); };
// §22 §3 公開・状態の文字・「公開しました」トースト（§4.1 の確認の箱は 22c。22b は publish({force:true}) 相当）
let _lastPubEnabled=true, _pubToastT=null;
function updateSaveUI(){ const st=PG.saveState(); const el=document.getElementById("saveStatus"); const pub=document.getElementById("tPublish"); if(!el||!pub) return;
  el.textContent=st.label; el.classList.toggle("warn", st.status==="error" || st.label==="まだ公開していない変更があります");
  if(st.status==="saved") _lastPubEnabled = !st.publishedEqual;   // §3.2 公開中と同じ→押せない／それ以外→押せる。保存中・失敗は前の状態のまま
  pub.disabled = !_lastPubEnabled;
  updateMoreStatus(); }
function showPublishToast(){ const t=document.getElementById("publishToast"); t.textContent="公開しました"; t.classList.add("on"); clearTimeout(_pubToastT); _pubToastT=setTimeout(()=>t.classList.remove("on"),3000); }
function afterPublish(){ updateSaveUI(); if(isPhone()) refreshPhoneUI(); }
// §22 §4.1 公開を押したとき：PC/SP の確認（publishCheck）。何もなければすぐ公開しトースト、あれば確認の箱
function doPublishFlow(){ const items=PG.publishCheck(); if(!items.length){ PG.publish({force:true}); showPublishToast(); afterPublish(); } else showPublishBox(items); }
document.getElementById("tPublish").onclick=()=>{ if(document.getElementById("tPublish").disabled) return; doPublishFlow(); };
function closePublishBox(){ document.getElementById("publishBox").classList.remove("on"); }
function scrollPartToCenter(part){ const n=PG.elNode(PG.canonId(part)); if(!n) return; n.scrollIntoView({block:"center"}); const r=n.getBoundingClientRect(); window.scrollBy(0,(r.top+r.height/2)-innerHeight/2); }   // §4.1.5 部品の真ん中が画面の真ん中
function seeItem(it){ closePublishBox(); PG.setDevice(it.device); const dSP=document.getElementById("dSP"),dPC=document.getElementById("dPC"); if(it.device==="sp"){dSP.classList.add("on");dPC.classList.remove("on");}else{dPC.classList.add("on");dSP.classList.remove("on");} const part=it.parts[0]; PG.selectOnly(PG.canonId(part)); scrollPartToCenter(part); }
function showPublishBox(items){ const box=document.getElementById("publishBox"); box.innerHTML="";
  const inner=document.createElement("div"); inner.className="pbox-inner";
  const title=document.createElement("div"); title.className="pbox-title"; title.setAttribute("data-pbox-title",String(items.length)); title.textContent="公開する前に、見てほしい所が "+items.length+" つあります"; inner.appendChild(title);
  const KIND={overlap:"重なっている所",long:"長い文",emptyPhoto:"写真のない枠",system:"仕組みの重なり・はみ出し"};
  const list=document.createElement("div"); list.className="pbox-list";
  for(const kind of ["overlap","long","emptyPhoto","system"]){ const grp=items.filter(i=>i.kind===kind); if(!grp.length) continue;
    const h=document.createElement("div"); h.className="pbox-kind"; h.textContent=KIND[kind]; list.appendChild(h);
    for(const it of grp){ const row=document.createElement("div"); row.className="pbox-row"; row.setAttribute("data-pbox-kind",kind); row.setAttribute("data-pbox-dev",it.device);
      const t=document.createElement("span"); t.className="pbox-rowtext"; t.textContent=it.text; row.appendChild(t);
      const see=document.createElement("button"); see.className="pbox-see"; see.setAttribute("data-pbox-see","1"); see.textContent="見る"; see.onclick=()=>seeItem(it); row.appendChild(see); list.appendChild(row); } }
  inner.appendChild(list);
  const btns=document.createElement("div"); btns.className="pbox-btns";
  const back=document.createElement("button"); back.setAttribute("data-pbox-back","1"); back.textContent="戻って直す"; back.onclick=closePublishBox; btns.appendChild(back);
  const go=document.createElement("button"); go.className="pbox-go"; go.setAttribute("data-pbox-go","1"); go.textContent="このまま公開する"; go.onclick=()=>{ closePublishBox(); PG.publish({force:true}); showPublishToast(); afterPublish(); }; btns.appendChild(go);
  inner.appendChild(btns); box.appendChild(inner); box.classList.add("on"); }
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&document.getElementById("publishBox").classList.contains("on")){ e.preventDefault(); closePublishBox(); } },true);   // §4.1.4 Esc＝戻って直す
// §22 §5 プレビュー（お客さんが見る形）
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
  let href=null, external=false;
  const lkEl=e.target.closest&&e.target.closest("[data-lk]");
  if(lkEl){ try{ const lk=JSON.parse(lkEl.getAttribute("data-lk")); href=PG.api.resolveHref(lk); external=/^https?:/.test(href||""); }catch(_){} }
  if(!href){ const el=e.target.closest&&e.target.closest("[data-el]"); if(el){ const info=PG.api.elementLink(el.getAttribute("data-el")); if(info&&info.link){ href=PG.api.resolveHref(info.link); external=/^https?:/.test(href||""); } } }
  if(href){ e.preventDefault(); e.stopPropagation(); if(external) window.open(href,"_blank"); else location.href=href; }
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
function addTextCentered(){ if(isPhone())return; if(PG.state.editing)PG.commitEdit(); const p=visibleCenter(); if(p) PG.addTextAtPoint(p.sec,p.cx,p.cy); }
async function addPhotoCentered(file){ const p=visibleCenter(); if(p) await PG.addPhotoAtPoint(file,p.sec,p.cx,p.cy); }
async function addPhotoAtDrop(file,clientX,clientY){ const sc=PG.getScale(); const host=sectionAtViewportY(clientY); if(!host)return; const hr=host.getBoundingClientRect(); await PG.addPhotoAtPoint(file,host.id.replace("host_",""),(clientX-hr.left)/sc,(clientY-hr.top)/sc); }
document.getElementById("tText").onclick=()=>addTextCentered();
document.getElementById("tPhoto").onclick=()=>{ if(isPhone())return; if(PG.state.editing)PG.commitEdit(); pendingAdd=true; pendingReplaceId=null; photoInput.value=""; photoInput.click(); };

// §12 文字の見た目の道具（リボン。文字の部品を選んでいる間だけ出す）
const TS_COLORS=[["text","#333333"],["textMuted","#7B7B7B"],["line","#B0B0B0"],["background","#FFFFFF"]];
const TS_HEX={text:"#333333",textMuted:"#7B7B7B",line:"#B0B0B0",background:"#FFFFFF"};
// §24 最近使った色は app.js の「編集の設定」（settings）に保存する。ここでは PG.recentColors()/PG.pushRecentColor() を使う。
const tstools=document.getElementById("tstools");
const sizePop=document.getElementById("sizePop");
const colorPop=document.getElementById("colorPop");
const tsEl=(s)=>document.querySelector('[data-ts="'+s+'"]');   // §20 「その他」へ移っても見つかるように #tstools 限定をやめる
function textSelected(){ if(PG.state.editing) return true; const s=[...PG.state.selected]; return s.length>0 && s.every(id=>PG.isText(id)||PG.isHeadingGroup(id)); }
function updateFontLinkBtns(){
  const fb=tsEl("font"); let f;
  // §3 書体は「文字の箱1つ・または書き換え中」だけ出す（写真・ボタン・複数選択・何も無しは出さない）
  const sel=[...PG.state.selected]; const oneTextBox=sel.length===1 && PG.isText(sel[0]);
  const fontShow=!!(PG.state.editing || oneTextBox);
  fb.style.display=fontShow?"":"none"; const fdiv=fb.previousElementSibling; if(fdiv&&fdiv.classList&&fdiv.classList.contains("div")) fdiv.style.display=fontShow?"":"none";
  if(PG.state.editing){ f=PG.editingSelFont(); if(f==null) f=PG.curFontOf(PG.state.editing.id); }
  else { const prim=oneTextBox?PG.primaryTextSel():null; f=prim?PG.curFontOf(prim):null; }
  fb.textContent=((f==="__mixed__"||f==null)?"書体":PG.fontLabel(f))+" ▾";
  const lk=tsEl("link"); const canLink=!!(PG.state.editing&&PG.editingHasSelection());
  lk.disabled=!canLink; lk.style.opacity=canLink?"1":"0.4";
}
function updateTextTools(){
  if(!textSelected()){ tstools.style.display="none"; sizePop.classList.remove("on"); colorPop.classList.remove("on"); closeFontPop(); return; }
  tstools.style.display="inline-flex";
  updateFontLinkBtns();
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
sizeInp.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Enter"){ e.preventDefault(); commitSizeInput(); sizeInp.blur(); } });
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
  const rc=PG.recentColors(); if(rc.length) row("最近使った色",rc.map(hex=>cell(hex,hex)));
  const more=document.createElement("button"); more.className="more"; more.textContent="その他の色…"; more.onmousedown=(ev)=>ev.preventDefault(); more.onclick=(ev)=>{ ev.stopPropagation(); customColor.click(); }; colorPop.appendChild(more);
  const customColor=document.createElement("input"); customColor.type="color"; customColor.setAttribute("data-ts","color-custom"); customColor.value=(PG.recentColors()[0]||"#C03030");
  customColor.oninput=()=>{ const hex=customColor.value.toUpperCase(); applyColor(hex); PG.pushRecentColor(hex); colorPop.classList.remove("on"); };
  colorPop.appendChild(customColor);
}
window.addEventListener("pointerdown",(e)=>{ if(sizePop.classList.contains("on")&&!sizePop.contains(e.target)&&!tsEl("size-list").contains(e.target)) sizePop.classList.remove("on"); if(colorPop.classList.contains("on")&&!colorPop.contains(e.target)&&!tsEl("color").contains(e.target)) colorPop.classList.remove("on"); },true);

// ===== §19 書体（font）=====
const fontPop=document.getElementById("fontPop");
function applyFont(fontKey){ if(partMode()) PG.applyPartStyle("font", fontKey); else { beforeTs(); PG.textSetFont(fontKey); } }
let fontPreview=null;
function previewFont(fontKey){ clearFontPreview(); const fam=fontKey?SPEC.FONT[fontKey]:""; const els=[];
  const ids = PG.state.editing? [PG.state.editing.id] : [...PG.state.selected];
  for(const id of ids){ const n=PG.elNode(id); if(n){ els.push([n,n.style.fontFamily]); n.style.fontFamily=fam; } }
  fontPreview=els; }
function clearFontPreview(){ if(!fontPreview)return; for(const [n,v] of fontPreview) n.style.fontFamily=v; fontPreview=null; }
function closeFontPop(){ clearFontPreview(); fontPop.classList.remove("on"); }   // §19b（X21）閉じたら必ず仮表示をやめる（マウスの位置によらない）
function fontSampleText(){ let t="";
  if(PG.state.editing){ const o=PG.editingSelRange(); const runs=PG.textRunsApi(PG.state.editing.id); const plain=runs.map(r=>r.text).join(""); t=(o&&o.e>o.s)?plain.slice(o.s,o.e):plain; }
  else { const prim=PG.primaryTextSel(); if(prim){ t=PG.textRunsApi(prim).map(r=>r.text).join(""); } }
  return (t||"見本").slice(0,12); }
function buildFontPop(){ fontPop.innerHTML="";
  const curF=PG.state.editing? (PG.editingSelFont()||PG.curFontOf(PG.state.editing.id)) : (PG.primaryTextSel()?PG.curFontOf(PG.primaryTextSel()):null);
  const sample=fontSampleText();
  for(const f of PG.fontsApi()){ const b=document.createElement("button"); b.className="frow"+(f.key===curF?" cur":""); b.setAttribute("data-font-opt",f.key);
    const s=document.createElement("div"); s.className="sample"; s.style.fontFamily=SPEC.FONT[f.key]; s.textContent=sample;
    const nm=document.createElement("div"); nm.className="nm"; nm.innerHTML=(f.key===curF?'<span class="ck">✓</span>':"")+f.label+"　"+f.role;
    b.appendChild(s); b.appendChild(nm);
    b.onmousedown=(ev)=>ev.preventDefault();
    b.addEventListener("mouseenter",()=>previewFont(f.key)); b.addEventListener("mouseleave",()=>clearFontPreview());
    b.onclick=(ev)=>{ ev.stopPropagation(); clearFontPreview(); applyFont(f.key); fontPop.classList.remove("on"); };
    fontPop.appendChild(b); } }
tsEl("font").onmousedown=(e)=>e.preventDefault();
tsEl("font").onclick=(e)=>{ e.stopPropagation(); const open=fontPop.classList.contains("on"); sizePop.classList.remove("on"); colorPop.classList.remove("on"); if(open){ closeFontPop(); return; } buildFontPop(); const r=tsEl("font").getBoundingClientRect(); fontPop.style.left=r.left+"px"; fontPop.style.top=(r.bottom+4)+"px"; fontPop.classList.add("on"); };
window.addEventListener("pointerdown",(e)=>{ if(fontPop.classList.contains("on")&&!fontPop.contains(e.target)&&!tsEl("font").contains(e.target)) closeFontPop(); },true);
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&fontPop.classList.contains("on")) closeFontPop(); },true);   // §19b（X21）Esc の直後に仮表示をやめる

// ===== §19 リンク（link）=====
const linkPanel=document.getElementById("linkPanel");
const linkChip=document.getElementById("linkChip");
let linkCtx=null;   // {mode:"part"|"element", part, s, e, el, cur}
function sameLink(a,b){ return JSON.stringify(a||null)===JSON.stringify(b||null); }
function placePanelNear(rect){ const vw=innerWidth, vh=innerHeight; linkPanel.classList.add("on"); const pw=linkPanel.offsetWidth||280, ph=linkPanel.offsetHeight||300;
  const tbb=document.getElementById("toolbar").getBoundingClientRect().bottom;   // §19b 上の並びの下〜画面下端−8に収める
  let left=Math.min(rect.left, vw-8-pw); left=Math.max(8,left);
  let top=rect.bottom+8; if(top+ph>vh-8) top=rect.top-ph-8;   // §4 下に入らなければ選んだ範囲の上
  top=Math.max(tbb+4, Math.min(top, vh-8-ph));
  linkPanel.style.left=Math.round(left)+"px"; linkPanel.style.top=Math.round(top)+"px"; }
function inPageSections(){ return PG.api.sectionList().map(s=>({sec:s.id, label:PG.friendlySec(s.id)})); }
function buildLinkPanel(cur){ linkPanel.innerHTML="";
  const seg=(t)=>{ const d=document.createElement("div"); d.className="seg"; d.textContent=t; linkPanel.appendChild(d); };
  const opt=(label,val,link,disabled)=>{ const b=document.createElement("button"); b.className="opt"+(sameLink(link,cur)?" cur":""); b.setAttribute("data-link-opt",label); if(disabled){ b.disabled=true; }
    const nm=document.createElement("span"); nm.textContent=label; b.appendChild(nm);
    if(val){ const v=document.createElement("span"); v.className="v"; v.textContent=val; b.appendChild(v); }
    b.onmousedown=(ev)=>ev.preventDefault(); b.onclick=(ev)=>{ ev.stopPropagation(); if(!disabled) chooseLink(link); }; linkPanel.appendChild(b); };
  // 1. お店の情報から
  seg("お店の情報から");
  const storeRow=(label,kind)=>opt(label, PG.storeValueText(kind), {kind}, !PG.storeHas(kind));
  storeRow("電話する","tel"); storeRow("地図で見る","map"); storeRow("Instagram","instagram"); storeRow("LINE","line"); storeRow("メールする","mail");
  // 2. このサイトのページ
  seg("このサイトのページ");
  for(const p of PG.PAGES) opt(p.label, p.slug, {kind:"page",page:p.id});
  for(const s of inPageSections()) opt("このページの『"+s.label+"』", "", {kind:"anchor",sec:s.sec});
  // 3. そのほかのホームページ
  seg("そのほかのホームページ");
  const ext=document.createElement("div"); ext.className="ext";
  const inp=document.createElement("input"); inp.type="text"; inp.placeholder="https://… / メール"; inp.setAttribute("data-link-url","");
  const go=document.createElement("button"); go.textContent="つなぐ"; go.setAttribute("data-link-connect","");
  ext.appendChild(inp); ext.appendChild(go); linkPanel.appendChild(ext);
  const err=document.createElement("div"); err.className="err"; err.style.display="none"; err.setAttribute("data-link-err",""); err.textContent="アドレスの形になっていません"; linkPanel.appendChild(err);
  const tryConnect=()=>{ const lk=PG.parseExternalLink(inp.value); if(!lk){ err.style.display="block"; return; } err.style.display="none"; chooseLink(lk); };
  go.onmousedown=(ev)=>ev.preventDefault(); go.onclick=(ev)=>{ ev.stopPropagation(); tryConnect(); };
  inp.onkeydown=(ev)=>{ if(ev.isComposing||ev.keyCode===229)return;/*§23a X33*/ if(ev.key==="Enter"){ ev.preventDefault(); tryConnect(); } ev.stopPropagation(); };
}
function openLinkPanelPart(part, s, e, anchorRect){ linkCtx={mode:"part", part, s, e, cur:currentPartLink(part,s,e)}; buildLinkPanel(linkCtx.cur); placePanelNear(anchorRect); }
function openLinkPanelElement(id, anchorRect){ linkCtx={mode:"element", el:id, cur:(PG.elementLinkApi(id)||{}).link||null}; buildLinkPanel(linkCtx.cur); placePanelNear(anchorRect); }
function currentPartLink(part,s,e){ const ls=PG.linksApi(part).runs.filter(r=>r.s<e&&r.e>s); if(ls.length===1 && ls[0].s<=s && ls[0].e>=e) return ls[0].link; return null; }
function chooseLink(link){ if(!linkCtx) return; const ctx=linkCtx; linkPanel.classList.remove("on"); linkCtx=null;
  if(ctx.mode==="element"){ PG.setElementLink(ctx.el, link); }
  else { if(PG.state.editing && PG.state.editing.id===ctx.part){ PG.applyPartStyleRange("link", link, ctx.s, ctx.e); } else { PG.setPartLinkCommitted(ctx.part, ctx.s, ctx.e, link); } } }
// リンクのボタン（文の一部）＝書き換え中＋選択あり
tsEl("link").onmousedown=(e)=>e.preventDefault();
tsEl("link").onclick=(e)=>{ e.stopPropagation(); if(tsEl("link").disabled) return; openLinkFromSelection(); };
function openLinkFromSelection(){ if(!PG.state.editing) return; const o=PG.editingSelRange(); if(!o||o.e<=o.s) return;
  const r=PG.editingRangeRect(o.s,o.e)||{left:0,top:0,bottom:0};   // §19b（X22）選んだ範囲のすぐ下に出す（押す前の範囲を覚えて使う）
  openLinkPanelPart(PG.state.editing.id, o.s, o.e, {left:r.left, top:r.top, bottom:r.bottom}); }
// 外のクリック・Esc で閉じる（何も変えない）
window.addEventListener("pointerdown",(e)=>{ if(linkPanel.classList.contains("on")&&!linkPanel.contains(e.target)&&!(e.target.closest&&(e.target.closest('[data-ts="link"]')||e.target.closest('#tElemLink')||e.target.closest('[data-link-chip]')))){ linkPanel.classList.remove("on"); linkCtx=null; } },true);

// ===== §19 部品まるごとリンク（写真・ボタン）=====
const elemTools=document.getElementById("elemTools");
function updateElemTools(){ const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null;
  const show=!!(one && PG.canElementLink(one) && !PG.state.editing && !isPhone());
  elemTools.style.display=show?"inline-flex":"none"; }
document.getElementById("tElemLink").onmousedown=(e)=>e.preventDefault();
document.getElementById("tElemLink").onclick=(e)=>{ e.stopPropagation(); const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null; if(!one||!PG.canElementLink(one)) return; const n=PG.elNode(one); const r=n?n.getBoundingClientRect():e.currentTarget.getBoundingClientRect(); openLinkPanelElement(one,{left:r.left,top:r.top,bottom:r.bottom}); };   // §19b（X22）部品のすぐ下（入らなければ上）

// ===== §20 列（品の並び） =====
const cardsTools=document.getElementById("cardsTools");
const colsPop=document.getElementById("colsPop");
function cardsSelected(){ const sel=[...PG.state.selected]; return sel.length===1 && PG.canonId(sel[0])==="I_cards"; }
function updateCardsTools(){ const show=cardsSelected() && !PG.state.editing && !isPhone(); cardsTools.style.display=show?"inline-flex":"none"; if(!show) closeColsPop(); }
function closeColsPop(){ PG.clearColsPreview(); colsPop.classList.remove("on"); }
function buildColsPop(){ colsPop.innerHTML=""; const info=PG.colsApi(); const row=document.createElement("div"); row.className="swrow";
  for(const opt of info.enabled){ const b=document.createElement("button"); b.className="sw"+(opt.n===info.current?" cur":""); b.setAttribute("data-cols-opt",String(opt.n)); if(!opt.enabled) b.disabled=true;
    const thumb=document.createElement("div"); thumb.className="thumb"; thumb.style.gridTemplateColumns="repeat("+opt.n+",1fr)"; for(let i=0;i<opt.n;i++){ thumb.appendChild(document.createElement("i")); }
    const cap=document.createElement("div"); cap.className="cap"; cap.textContent=opt.n+"列"; b.appendChild(thumb); b.appendChild(cap);
    b.onmousedown=(e)=>e.preventDefault();
    if(opt.enabled){ b.addEventListener("mouseenter",()=>PG.setColsPreview("I_cards",opt.n)); b.addEventListener("mouseleave",()=>PG.clearColsPreview());
      b.onclick=(e)=>{ e.stopPropagation(); PG.clearColsPreview(); PG.setCols("I_cards",opt.n); colsPop.classList.remove("on"); }; }
    row.appendChild(b); }
  colsPop.appendChild(row); }
document.getElementById("tCols").onmousedown=(e)=>e.preventDefault();
document.getElementById("tCols").onclick=(e)=>{ e.stopPropagation(); if(colsPop.classList.contains("on")){ closeColsPop(); return; } buildColsPop(); const r=e.currentTarget.getBoundingClientRect(); const vw=innerWidth; colsPop.classList.add("on"); const pw=colsPop.offsetWidth||160; let left=Math.min(r.left, vw-8-pw); left=Math.max(8,left); colsPop.style.left=Math.round(left)+"px"; colsPop.style.top=(r.bottom+4)+"px"; };
window.addEventListener("pointerdown",(e)=>{ if(colsPop.classList.contains("on")&&!colsPop.contains(e.target)&&!document.getElementById("tCols").contains(e.target)&&!(e.target.closest&&e.target.closest("#moreMenu"))) closeColsPop(); },true);
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&colsPop.classList.contains("on")) closeColsPop(); },true);

// ===== §19 リンクの札（ホバー）=====
let chipTimer=null, chipHideTimer=null, chipTarget=null;
function chipForPart(span){ const partEl=span.closest("[data-el]"); if(!partEl) return null; const part=partEl.getAttribute("data-el"); let lk=null; try{ lk=JSON.parse(span.getAttribute("data-lk")); }catch(_){}
  if(!lk) return null; const runs=PG.linksApi(part).runs; const m=runs.find(r=>sameLink(r.link,lk)&&r.text===span.textContent) || runs.find(r=>sameLink(r.link,lk)); if(!m) return null;
  return { kind:"part", part, s:m.s, e:m.e, link:m.link, label:m.label, href:m.href, newTab:m.newTab, rect:span.getBoundingClientRect() }; }
function chipForElement(el){ const id=el.getAttribute("data-el"); if(!PG.canElementLink(id)) return null; const info=PG.elementLinkApi(id); if(!info) return null; return { kind:"element", el:id, link:info.link, label:info.label, href:info.href, newTab:info.newTab, rect:el.getBoundingClientRect() }; }
function showChip(info){ chipTarget=info; linkChip.innerHTML="";
  const nm=document.createElement("span"); nm.className="nm"; nm.textContent=info.label; linkChip.appendChild(nm);
  const mk=(label,fn,attr)=>{ const b=document.createElement("button"); b.textContent=label; if(attr) b.setAttribute(attr,""); b.onmousedown=(e)=>e.preventDefault(); b.onclick=(e)=>{ e.stopPropagation(); fn(); }; linkChip.appendChild(b); };
  mk("開いて確かめる",()=>{ window.open(info.href, info.newTab?"_blank":"_self"); },"data-link-open");
  mk("変える",()=>{ linkChip.classList.remove("on"); if(info.kind==="part"){ openLinkPanelPart(info.part,info.s,info.e,info.rect); } else { openLinkPanelElement(info.el,info.rect); } },"data-link-change");
  mk("外す",()=>{ linkChip.classList.remove("on"); if(info.kind==="part"){ PG.setPartLinkCommitted(info.part,info.s,info.e,null); } else { PG.removeElementLink(info.el); } },"data-link-remove");
  linkChip.classList.add("on");
  const vw=innerWidth, vh=innerHeight; const cw=linkChip.offsetWidth||200, ch=linkChip.offsetHeight||32;
  let left=Math.min(info.rect.left, vw-8-cw); left=Math.max(8,left); let top=info.rect.bottom+4; if(top+ch>vh-8) top=info.rect.top-ch-4;
  linkChip.style.left=Math.round(left)+"px"; linkChip.style.top=Math.round(top)+"px"; }
function scheduleChip(info){ clearTimeout(chipHideTimer); if(chipTarget && sameLink(chipTarget.link,info.link) && chipTarget.rect && Math.abs(chipTarget.rect.left-info.rect.left)<2) return; clearTimeout(chipTimer); chipTimer=setTimeout(()=>showChip(info),400); }
function hideChipSoon(){ clearTimeout(chipTimer); clearTimeout(chipHideTimer); chipHideTimer=setTimeout(()=>{ linkChip.classList.remove("on"); chipTarget=null; },300); }
const chipStage=document.getElementById("stage");
chipStage.addEventListener("mouseover",(e)=>{ if(isPhone()||PG.state.editing) return; const span=e.target.closest&&e.target.closest("[data-lk]"); if(span){ const info=chipForPart(span); if(info){ scheduleChip(info); return; } }
  const el=e.target.closest&&e.target.closest('[data-el]'); if(el){ const info=chipForElement(el); if(info){ scheduleChip(info); return; } } });
chipStage.addEventListener("mouseout",(e)=>{ if(isPhone())return; const toChip=e.relatedTarget&&linkChip.contains(e.relatedTarget); if(!toChip) hideChipSoon(); });
linkChip.addEventListener("mouseenter",()=>{ clearTimeout(chipHideTimer); });
linkChip.addEventListener("mouseleave",()=>hideChipSoon());
// 選んだ写真は「写真を変える」ボタンが覆うので、その上に乗ってもリンクの札を出す（§2.4）
const chipPcb=document.getElementById("photoChangeBtn");
chipPcb.addEventListener("mouseenter",()=>{ if(isPhone()||PG.state.editing)return; const id=chipPcb._for; if(id&&PG.canElementLink(id)){ const el=PG.elNode(id); if(el){ const info=chipForElement(el); if(info) scheduleChip(info); } } });
chipPcb.addEventListener("mouseleave",(e)=>{ if(!(e.relatedTarget&&linkChip.contains(e.relatedTarget))) hideChipSoon(); });

// 浮遊メニュー
const fmenu=document.getElementById("fmenu");
// §19（X19）メニューを画面の中に収める：上の道具の下端〜画面下端−8、左右も8内側。下に入らなければ押した所の上に出す
function clampMenuAt(cx,cy){ const vw=innerWidth, vh=innerHeight; const tb=document.getElementById("toolbar"); const tbb=tb?tb.getBoundingClientRect().bottom:0;
  const mw=fmenu.offsetWidth||120, mh=fmenu.offsetHeight||30;
  let top=cy; if(top+mh>vh-8) top=cy-mh;                 // 下に収まらなければ押した所の上
  top=Math.max(tbb+4, Math.min(top, vh-8-mh));
  let left=Math.min(cx, vw-8-mw); left=Math.max(8,left);
  fmenu.style.left=Math.round(left)+"px"; fmenu.style.top=Math.round(top)+"px"; }
function positionFmenu(){ if(!fmenu.classList.contains("on"))return;
  if(isPhone()){ positionFmenuPhone(); return; }   // §1(X6/X7/X8)・§4.3（試験台16）
  if(fmenu._section){ clampMenuAt(fmenu._secClientX, fmenu._secClientY); return; }   // §19（X19）セクションの箱も画面の中へ
  const id=[...PG.state.selected][0]; const n=id&&PG.elNode(id); if(!n){ fmenu.classList.remove("on"); return;} const r=n.getBoundingClientRect(); const mh=fmenu.offsetHeight||30; let top=r.top-mh-6; if(top<4) top=r.bottom+6; /* §2 部品の上の外側。上に場所がなければ下の外側 */ fmenu.style.left=r.left+"px"; fmenu.style.top=top+"px"; }
function showFmenu(){ fmenu._section=false; const sel=[...PG.state.selected]; if(!sel.length){ fmenu.classList.remove("on"); return; } fmenu.innerHTML="";
  const add=(label,fn,note)=>{ if(note){ const s=document.createElement("span"); s.className="note"; s.textContent=note; fmenu.appendChild(s); return;} const b=document.createElement("button"); b.textContent=label; b.onclick=(ev)=>{ ev.stopPropagation(); fn(); }; fmenu.appendChild(b); };
  const addDiv=()=>{ const d=document.createElement("span"); d.className="fdiv"; fmenu.appendChild(d); };
  // §22 §8 PC：「最前面へ移動 ▸」の行＝親ボタン＋ホバーで出るサブ箱（最前面へ移動／前面へ移動）。重なり相手がいなければ灰色・▸箱なし
  const addZSub=(label,items,disabled)=>{ const row=document.createElement("div"); row.className="zrow";
    const b=document.createElement("button"); b.textContent=label+" ▸"; b.setAttribute("data-zsub",label); if(disabled){ b.disabled=true; b.textContent=label; } row.appendChild(b);
    if(!disabled){ const sub=document.createElement("div"); sub.className="zsub";
      for(const [lbl,fn] of items){ const sb=document.createElement("button"); sb.textContent=lbl; sb.setAttribute("data-zitem",lbl); sb.onclick=(ev)=>{ ev.stopPropagation(); fn(); }; sub.appendChild(sb); }
      b.onclick=(ev)=>{ ev.stopPropagation(); row.classList.toggle("open"); };   // クリックでも開く（ホバーできない環境用）
      row.appendChild(sub); }
    fmenu.appendChild(row); };
  const addColsPhone=()=>{ const info=PG.colsApi(); for(const opt of info.enabled){ const b=document.createElement("button"); b.className="colbtn"+(opt.n===info.current?" cur":""); b.setAttribute("data-cols-opt",String(opt.n)); b.textContent=opt.n+"列"+(opt.n===info.current?" ✓":""); if(!opt.enabled){ b.disabled=true; } else { b.onclick=(ev)=>{ ev.stopPropagation(); PG.setCols("I_cards",opt.n); showFmenu(); }; } fmenu.appendChild(b); } };
  const one=sel.length===1?sel[0]:null; const R=PG.reduce(PG.activeOps()); const ph=isPhone();   // §3.2.6 スマホのときだけ箱に「複製」「削除」を足す
  const moved=one&&PG.partChangedFromTemplate(one);   // N1：位置・大きさ・並び順・重なり順のどれかが変われば出す
  if(sel.length>1){ add("元の位置に戻す",()=>{ for(const id of sel) PG.resetScope("part",id,[PG.state.device]); }); add("消す",()=>PG.deleteSelected()); }
  else if(one&&PG.REPEAT.test(one)){ add("書き換える",()=>PG.startEdit(one)); add("複製",()=>PG.duplicate()); if(ph) add("削除",()=>PG.deleteSelected()); add("",null,/^row_/.test(one)?"1行の作りを変えると全部に効きます":"品は位置を動かせません"); }
  else if(one){ const isPhoto=/^F_p|photo/.test(one); if(PG.isText(one)) add("書き換える",()=>PG.startEdit(one));
    if(PG.isText(one)&&(PG.hasTextStyle(one)||PG.hasRuns(one))) add("文字の見た目を元に戻す",()=>PG.resetTextStyle(one));   // §2.2 書式のクリア（箱まるごと＋文の一部）
    if(isPhoto){ const isCleared=(R.clear||[]).includes(one); add("写真を差し替える",()=>startReplace(one));
      if(!isCleared){ add("見せる範囲",()=>enterCrop(one)); add("写真を外す",()=>PG.commit({t:"clear",id:one})); }   // N4：外していない写真は「外す」だけ
      else { add("写真を戻す",()=>PG.commit({t:"unclear",id:one})); } }                                            // N4：外した空枠は「戻す」だけ
    // §22 §8 最前面/最背面へ移動（いつも出す）。重なり相手がいなければ灰色・▸箱なし。スマホは ▸ を使わず前面/背面の2つ
    // §22a X30：品の並び・表（I_cards/I_table。中の写真を右クリックするとこの群が選ばれる）とその中の部品には出さない（位置を動かせない／繰り返しの入れ物。§8.5）
    const bareOne=PG.canonId(one).replace(/.*__/,"");
    if(!PG.REPEAT.test(one) && bareOne!=="I_cards" && bareOne!=="I_table"){ const hasOv=PG.hasOverlapPartner();
      if(ph){ add("前面へ",()=>{ if(hasOv){PG.bringToFront(); showFmenu();} }); add("背面へ",()=>{ if(hasOv){PG.sendToBack(); showFmenu();} });
        const bs=[...fmenu.querySelectorAll("button")].slice(-2); if(!hasOv) for(const b of bs) b.disabled=true; }
      else { addDiv();
        addZSub("最前面へ移動",[["最前面へ移動",()=>{PG.bringToFront(); showFmenu();}],["前面へ移動",()=>{PG.bringForward(); showFmenu();}]],!hasOv);
        addZSub("最背面へ移動",[["最背面へ移動",()=>{PG.sendToBack(); showFmenu();}],["背面へ移動",()=>{PG.sendBackward(); showFmenu();}]],!hasOv);
        addDiv(); } }
    if(PG.canSwap(one)) add("左右を入れ替える",()=>PG.swapHoriz(one));   // §5 横並びの組（PC 特集）
    if(ph&&PG.canonId(one)==="I_cards") addColsPhone();   // §2.2/§6.7（L23）スマホは長押しの箱に「列」の見本ボタン（44px）
    if(moved) add("元の位置に戻す",()=>PG.resetScope("part",one,[PG.state.device])); if(ph){ add("複製",()=>PG.duplicate()); add("削除",()=>PG.deleteSelected()); } else add("消す",()=>PG.commit({t:"del",id:one})); }
  fmenu._follow="part"; fmenu._secId=null; fmenu._place=null;   // §1/§4（試験台16）箱は部品に付いていく
  fmenu.classList.add("on"); positionFmenu();
}

// ---- 選択・ドラッグ・範囲選択 ----
let marquee=null;
function elFrom(t){ const n=t.closest?t.closest("[data-el]"):null; return n?n.getAttribute("data-el"):null; }
const stage=document.getElementById("stage");
stage.addEventListener("pointerdown",(e)=>{
  if(PG.previewMode()||PG.viewingVersion()) return;   // §22 §5 プレビュー／§6 見るだけは選択・移動しない（リンクは click で処理）
  if(isPhone()){ if(e.pointerType==="touch") onPhoneDown(e); return; }   // §3 スマホは指だけ（タッチ後の互換マウスは無視して箱を消させない）
  if(PG.state.editing && e.target.getAttribute && e.target.closest("[contenteditable]")) return; // 編集中の文字は素通し
  if(PG.state.editing) PG.commitEdit();
  // §4 大きさのつまみ（data-handle）をつかんだ＝大きさを変える
  const hdir=e.target.getAttribute&&e.target.getAttribute("data-handle");
  if(hdir){ const forId=e.target.getAttribute("data-handle-for"); if(PG.beginResize(forId,hdir,e.clientX,e.clientY)) e.preventDefault(); return; }
  fmenu.classList.remove("on");
  let rawId=elFrom(e.target);
  if(!rawId){ const sh=PG.smallHit(e.clientX,e.clientY); if(sh) rawId=sh; }   // §2 つかめる範囲を広げた小さな部品
  // §2.2（試験台17）空の枠・まだない写真の枠：どこを押しても離せば「写真を選ぶ」・押したまま動かせば枠を動かす
  if(rawId && isEmptyFrame(rawId)){ const cid=PG.canonId(rawId); PG.selectOnly(cid); pending={sx:e.clientX,sy:e.clientY,photoChoose:cid}; e.preventDefault(); return; }
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
  // 掴む準備だけ（実際のドラッグは動かし始めてから＝クリック/ダブルクリックを潰さない）。写真なら X10 のダブルクリック用に印を付ける（左ボタン・Ctrlなし）
  if(e.pointerType!=="touch"||wasSel){ const nn=PG.elNode(id); const isPh=!!(nn&&nn.getAttribute("data-kind")==="photo"&&!nn.classList.contains("empty")); pending={sx:e.clientX,sy:e.clientY,photoClick:(isPh&&e.button===0&&!e.ctrlKey)?id:null}; }
},{passive:false});
let pending=null;
window.addEventListener("pointermove",(e)=>{
  if(isPhone()){ if(e.pointerType==="touch" && tg) onPhoneMove(e); return; }   // §3 スマホは指だけ
  // §2 Alt（Mac は Option）を押しながらは、そろえない
  if(PG.isResizing()){ e.preventDefault(); PG.resizeMove(e.clientX,e.clientY,e.altKey); return; }
  if(marquee){ const x=Math.min(marquee.x0,e.clientX),y=Math.min(marquee.y0,e.clientY),w=Math.abs(e.clientX-marquee.x0),h=Math.abs(e.clientY-marquee.y0); Object.assign(marquee.el.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px"}); e.preventDefault(); return; }
  if(pending && !PG.isDragging() && Math.hypot(e.clientX-pending.sx,e.clientY-pending.sy)>3){ PG.beginDrag(pending.sx,pending.sy); lastImgClick=null; const pcb=document.getElementById("photoChangeBtn"); if(pcb) pcb.style.display="none"; }   // §2 動かし始めたら写真を変えるボタンを隠す・X10 ドラッグはダブルに数えない
  if(PG.isDragging()){ e.preventDefault(); PG.dragMove(e.clientX,e.clientY,e.altKey); }
},{passive:false});
window.addEventListener("pointerup",(e)=>{
  if(isPhone()){ if(e.pointerType==="touch" && tg) onPhoneUp(e); return; }   // §3 スマホは指だけ
  const wasPending=pending; pending=null;
  if(PG.isResizing()){ PG.endResize(); showFmenu(); return; }
  if(marquee){ const r=marquee.el.getBoundingClientRect(); marquee.el.remove(); marquee=null; const chosen=[];
    const hosts=[...document.querySelectorAll("#sectionwrap .host")];
    for(const hs of hosts){ if(!hs)continue; for(const el of hs.querySelectorAll("[data-el]")){ const rawId=el.getAttribute("data-el"); const c=PG.canonId(rawId); if(!PG.isDraggable(c)||PG.REPEAT.test(rawId))continue; const b=el.getBoundingClientRect(); if(b.left>=r.left-0.5&&b.top>=r.top-0.5&&b.right<=r.right+0.5&&b.bottom<=r.bottom+0.5) if(!chosen.includes(c)) chosen.push(c);} }
    if(!chosen.length && r.width<6 && r.height<6){ // 余白をクリック＝セクションを選ぶ（§4）
      for(const hs of hosts){ const b=hs.getBoundingClientRect(); if(e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom){ PG.selectSection(hs.id.replace("host_","")); break; } } return; }
    PG.selectMany(chosen); if(chosen.length) showFmenu(); return; }
  if(PG.isDragging()){ PG.endDrag(); showFmenu(); return; }
  // §2（試験台17）写真を選ぶ：空の枠を動かさずに離したら写真を選ぶ画面を開く
  if(wasPending && wasPending.photoChoose && Math.hypot(e.clientX-wasPending.sx,e.clientY-wasPending.sy)<=4){ startReplace(wasPending.photoChoose); return; }
  // §2/X10 写真を変える：左クリックで離したら「写真を選ぶ（1回目）／見せる範囲（2回目）」。右・Ctrl・ドラッグは数えない
  if(wasPending && wasPending.photoChange && e.button===0 && !e.ctrlKey && Math.hypot(e.clientX-wasPending.sx,e.clientY-wasPending.sy)<=4){ imgClickDone(wasPending.photoChange,e.clientX,e.clientY,true); return; }
  // X10 写真そのものの左クリック完了＝ダブルクリック判定に積む（2回目で見せる範囲）
  if(wasPending && wasPending.photoClick && e.button===0 && !e.ctrlKey && Math.hypot(e.clientX-wasPending.sx,e.clientY-wasPending.sy)<=4){ imgClickDone(wasPending.photoClick,e.clientX,e.clientY,false); return; }
  // X1：全体を選択中に中を押して動かさずに離した＝中の1件を選ぶ
  if(wasPending && wasPending.clickInner){ PG.selectMany([wasPending.clickInner]); showFmenu(); }
});
// ダブルクリック＝文字はその場書き換え、写真は見せる範囲（§2.1）
stage.addEventListener("dblclick",(e)=>{ if(isPhone()||PG.previewMode()||PG.viewingVersion()) return; const id=elFrom(e.target); if(!id)return; const c=PG.canonId(id); if(PG.isText(c)){ PG.startEdit(c); } else if(/^F_p|photo/.test(id)){ enterCrop(id); } });   // §3 スマホはダブルタップで入る（dblクリックは使わない）
// 右クリック＝浮遊メニュー（部品）／セクションの余白ならセクションのメニュー（§2.1）
stage.addEventListener("contextmenu",(e)=>{
  if(isPhone()){ e.preventDefault(); return; }   // §3.2.5 スマホの長押しから来る contextmenu は出さない・右クリック扱いしない
  const id=elFrom(e.target);   // §23c X35：render で元のノードが外れうるので、終える前に部品 ID を取っておく
  if(PG.state.editing) PG.commitEdit();   // §23c X35：右クリックメニューは「文字を打つ以外でその部品を変える」操作＝先に書き換えをふつうに終える（書き換えの外をクリックと同じ）。入り直した書き換えでも同じ
  if(id){ e.preventDefault(); const grp=PG.groupOf(id); PG.selectOnly(grp||PG.canonId(id)); showFmenu(); return; }
  const host=e.target.closest&&e.target.closest("#sectionwrap .host");
  if(host){ e.preventDefault(); const sec=host.id.replace("host_",""); PG.selectSection(sec); showSectionMenu(sec,e.clientX,e.clientY); }
});

// ---- §2 セクションのメニュー（上へ・下へ・複製・削除）。#fmenu を使い、カーソルの位置に出す ----
function showSectionMenu(sec,cx,cy){
  const can=PG.sectionCan(sec); if(!can.exists){ fmenu.classList.remove("on"); return; }
  fmenu.innerHTML="";
  const add=(label,fn)=>{ const b=document.createElement("button"); b.textContent=label; b.setAttribute("data-sec-menu",label); b.onclick=(ev)=>{ ev.stopPropagation(); fmenu.classList.remove("on"); fn(); }; fmenu.appendChild(b); };
  if(can.up) add("上へ",()=>PG.sectionMove(sec,-1));
  if(can.down) add("下へ",()=>PG.sectionMove(sec,1));
  add("複製",()=>PG.sectionDuplicate(sec));
  if(can.del) add("削除",()=>PG.sectionDelete(sec));
  fmenu._section=true; fmenu._secId=sec; fmenu._follow="section"; fmenu._place=null;
  const _h=document.getElementById("host_"+sec); const _hr=_h?_h.getBoundingClientRect():{top:cy,left:cx}; fmenu._secTopOff=cy-_hr.top; fmenu._secCX=cx; fmenu._secClientX=cx; fmenu._secClientY=cy;   // 指の位置をセクションからの相対で覚える（§X8 付いていく）
  fmenu.classList.add("on");
  if(isPhone()){ positionFmenu(); }   // §1(X7/X8)（試験台16）箱はセクションに付いていく・見えている範囲の中
  else { clampMenuAt(cx,cy); }   // §19（X19）画面の中に収める
}

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
  wraps.forEach((w)=>wrap.insertBefore(mk([...wrap.querySelectorAll(".sec-wrap")].indexOf(w)),w));
  const botFixed=document.getElementById("fixedBottom");   // §22 §7：一番下（仮）の下には＋を出さない＝最後の＋はその手前へ
  if(botFixed) wrap.insertBefore(mk(wraps.length),botFixed); else wrap.appendChild(mk(wraps.length));
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
window.addEventListener("keydown",(e)=>{
  if(e.isComposing||e.keyCode===229) return;   // §23a X33 日本語の変換中のキーはページで拾わない（preventDefault もしない）
  const meta=e.metaKey||e.ctrlKey;
  if(PG.isCropping()){ // 見せる範囲：Enter で決め、Esc で取り消す（ほかのキーは効かない）
    if(e.key==="Enter"){ e.preventDefault(); PG.cropCommit(); exitCropOverlay(); }
    else if(e.key==="Escape"){ e.preventDefault(); PG.cropCancel(); exitCropOverlay(); }
    return;
  }
  if(PG.state.editing){ // 書き換え中：文字入力・Esc・Cmd+B・Cmd+K のみ。Cmd+Z は自動リンクの取り消しだけ受ける
    if(e.key==="Escape") PG.commitEdit();
    if(meta&&e.key.toLowerCase()==="b"){ e.preventDefault(); if(PG.editingHasSelection()) PG.applyPartStyle("bold"); return; }   // §2.1 選んだ所の太字を入れ替え
    if(meta&&e.key.toLowerCase()==="k"){ e.preventDefault(); openLinkFromSelection(); return; }   // §2.1 Cmd+K
    if(meta&&e.key.toLowerCase()==="z"&&!e.shiftKey){ if(PG.editingHasAutoUndo()){ e.preventDefault(); PG.editingUndoAutoLink(); return; } e.preventDefault(); PG.undo(); return; }   // §2.5 自動リンク／§23b 書き換え中の戻す＝細かく
    if(meta&&((e.key.toLowerCase()==="z"&&e.shiftKey)||e.key.toLowerCase()==="y")){ e.preventDefault(); PG.redo(); return; }   // §23b 書き換え中のやり直し
    if(meta&&e.key.toLowerCase()==="c"){ PG.captureEditingCopy(); return; }   // §19b §5 この編集の中のコピー＝見た目・リンクも覚える（ブラウザのコピーはそのまま＝文字も system に入る）
    if(meta&&e.key.toLowerCase()==="v"){ e.preventDefault(); const t=(window.__lastPlain||""); if(!PG.editingPasteRich(t)&&!PG.editingPasteLink(t)) document.execCommand&&document.execCommand("inserttext",false,t); }   // §5 中のコピーは見た目つき／§2.6 URL・メールはリンク／それ以外は文字だけ
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
window.addEventListener("paste",(e)=>{ const cd=e.clipboardData||window.clipboardData; if(!cd)return; const t=cd.getData&&cd.getData("text/plain"); window.__lastPlain=t;
  if(PG.state.editing){ e.preventDefault(); if(!PG.editingPasteRich(t)&&!PG.editingPasteLink(t)) document.execCommand("inserttext",false,t); return; }   // §5 中のコピーは見た目つき／§2.5-2.6 URL・メール／よそからは文字だけ
  const file=[...(cd.files||[])].find(f=>f.type.startsWith("image/")) || (()=>{ for(const it of (cd.items||[])){ if(it.kind==="file"){ const f=it.getAsFile&&it.getAsFile(); if(f&&f.type.startsWith("image/")) return f; } } return null; })();
  if(!file) return;   // 画像がなければ、今の貼り付け（部品・文字＝Cmd+V の keydown）に任せる
  const sel=[...PG.state.selected]; const one=sel.length===1?sel[0]:null; const n=one&&PG.elNode(one); const isPhoto=!!(n&&n.getAttribute("data-kind")==="photo");
  e.preventDefault();
  if(isPhoto){ doReplace(one,file); } else if(!isPhone()){ addPhotoCentered(file); }   // §3.3 写真1つなら差し替え／それ以外は新しい部品
});

// ---- §1 写真の差し替え（選ぶ・落とす・貼り付ける）----
const photoInput=document.getElementById("photoInput");
let pendingReplaceId=null, pendingAdd=false;
function startReplace(id){ pendingAdd=false; pendingReplaceId=id; photoInput.value=""; photoInput.click(); }
photoInput.addEventListener("change",async ()=>{ const f=photoInput.files&&photoInput.files[0]; const add=pendingAdd, rep=pendingReplaceId; pendingAdd=false; pendingReplaceId=null; if(!f) return; if(rep){ doReplace(rep,f); } else if(add){ await addPhotoCentered(f); } });   // §3.1 取り消し（ファイルなし）＝何もしない
async function doReplace(id,file){ const r=await PG.replacePhotoFile(id,file); if(!r.ok){ photoToast(id,"この写真は読み込めません"); } }
function photoToast(id,msg){ const n=PG.elNode(id); const t=document.createElement("div"); t.className="photo-toast"; t.textContent=msg; document.body.appendChild(t); if(n){ const r=n.getBoundingClientRect(); t.style.left=Math.round(r.left)+"px"; t.style.top=Math.round(r.top-28)+"px"; } else { t.style.left="12px"; t.style.top="60px"; } setTimeout(()=>t.remove(),2000); }
// 枠の上に落とす（落とせる間は枠を縁取る）。枠の外に落ちた画像は何もしない（§1.1）
function photoElFrom(t){ const n=t.closest?t.closest('[data-kind="photo"]'):null; return n?n.getAttribute("data-el"):null; }
// X11：写真の枠の上に重なって出る物（写真を変える・写真を選ぶ・選んだ印・つまみ）に落ちても、その写真の枠に落としたのと同じにする
function photoFrameAt(e){
  let id=photoElFrom(e.target); if(id) return id;
  const pcb=document.getElementById("photoChangeBtn"); if(pcb&&pcb.contains(e.target)) return pcb._for;
  const hf=e.target.closest&&e.target.closest("[data-handle-for]"); if(hf){ const fid=hf.getAttribute("data-handle-for"); const n=PG.elNode(fid); if(n&&n.getAttribute("data-kind")==="photo") return fid; }
  const els=document.elementsFromPoint(e.clientX,e.clientY); for(const el of els){ if(el.getAttribute&&el.getAttribute("data-kind")==="photo"&&el.getAttribute("data-el")) return el.getAttribute("data-el"); }
  return null;
}
let dropHi=null;
function hasFiles(e){ return [...(e.dataTransfer&&e.dataTransfer.types||[])].includes("Files"); }
function dropHiOn(id){ const n=id?PG.elNode(id):null; if(dropHi&&dropHi!==n)dropHi.classList.remove("drop-ok"); if(n){ n.classList.add("drop-ok"); dropHi=n; } else if(dropHi){ dropHi.classList.remove("drop-ok"); dropHi=null; } }
function onDropFiles(e,allowAdd){ if(!hasFiles(e))return; e.preventDefault(); const id=isPhone()?null:photoFrameAt(e); if(dropHi){ dropHi.classList.remove("drop-ok"); dropHi=null; } const files=[...(e.dataTransfer.files||[])]; const f=files.find(x=>x.type.startsWith("image/"))||files[0]; if(!f)return;   // 一度に複数なら最初の1枚だけ
  if(id){ doReplace(id,f); } else if(allowAdd&&!isPhone()){ addPhotoAtDrop(f,e.clientX,e.clientY); } }
stage.addEventListener("dragover",(e)=>{ if(!hasFiles(e))return; e.preventDefault(); e.dataTransfer.dropEffect="copy"; dropHiOn(isPhone()?null:photoFrameAt(e)); });   // §3.2 枠の外に落とす予告は出さない
stage.addEventListener("dragleave",(e)=>{ if(dropHi&&!stage.contains(e.relatedTarget)){ dropHi.classList.remove("drop-ok"); dropHi=null; } });
stage.addEventListener("drop",(e)=>onDropFiles(e,true));   // 枠の上（重なる物の上も）＝差し替え／枠の外＝新しい部品
// X11：浮遊ボタン（body 上）に落ちた分も写真の枠に流す
document.addEventListener("dragover",(e)=>{ const pcb=document.getElementById("photoChangeBtn"); if(pcb&&pcb.contains(e.target)&&hasFiles(e)){ e.preventDefault(); e.dataTransfer.dropEffect="copy"; dropHiOn(pcb._for); } },true);
document.addEventListener("drop",(e)=>{ const pcb=document.getElementById("photoChangeBtn"); if(pcb&&pcb.contains(e.target)){ onDropFiles(e,false); } },true);

// ---- §2/§5（試験台17）写真を変える・写真を選ぶ・明るさ（マウスの操作のときだけ）----
function isEmptyFrame(rawId){ const n=PG.elNode(rawId); return !!(n && n.getAttribute("data-kind")==="photo" && n.classList.contains("empty")); }
function photoSelInfo(){ const sel=[...PG.state.selected]; if(sel.length!==1) return null; const id=sel[0]; const n=PG.elNode(id); if(!n||n.getAttribute("data-kind")!=="photo") return null; const p=PG.photosApi().find(x=>x.part===id); return p?p:null; }
const photoChangeBtn=document.getElementById("photoChangeBtn");
photoChangeBtn.innerHTML=CAM_SVG+'<span>写真を変える</span>';
let pcClickTimer=null, lastImgClick=null;
const DBL_MS=300, DBL_MOVE=10;
// X10：見せる範囲に入るダブルクリックは「左ボタンで押して動かさず離すクリック」を 300ms 内に2回だけで数える。
//   ドラッグになったもの・右クリック・Ctrl を押しながらは数えない。2回目は写真でも「写真を変える」の上でもよい。
function imgClickDone(id,x,y,isButton){
  const now=performance.now();
  const dbl = lastImgClick && lastImgClick.id===id && (now-lastImgClick.t)<=DBL_MS && Math.hypot(x-lastImgClick.x,y-lastImgClick.y)<=DBL_MOVE;
  if(dbl){ lastImgClick=null; if(pcClickTimer){clearTimeout(pcClickTimer);pcClickTimer=null;} enterCrop(id); return; }
  lastImgClick={id,t:now,x,y};
  if(isButton){ if(pcClickTimer)clearTimeout(pcClickTimer); pcClickTimer=setTimeout(()=>{ pcClickTimer=null; lastImgClick=null; startReplace(id); },DBL_MS); }  // ボタンの1回目が最終なら差し替え
}
// 押して離す＝写真を選ぶ／押したまま動かす＝写真を動かす（既存のドラッグ pending に乗せる）。左ボタンのみ・右/Ctrl はドラッグ/メニューへ。
photoChangeBtn.addEventListener("pointerdown",(e)=>{ if(isPhone())return; if(e.button!==0||e.ctrlKey) return; const id=photoChangeBtn._for; if(!id)return; e.preventDefault(); PG.selectOnly(id); pending={sx:e.clientX,sy:e.clientY,photoChange:id}; });
// 右クリックはボタンを素通しして写真のメニューを出す（写真の右クリックと同じ）
photoChangeBtn.addEventListener("contextmenu",(e)=>{ e.preventDefault(); e.stopPropagation(); const id=photoChangeBtn._for; if(id){ PG.selectOnly(id); showFmenu(); } });
function refreshPhotoBtns(){
  // 「写真を選ぶ」：空の枠・まだない写真の枠すべて（選んでいなくても）。スマホでは今までどおり（入れない）
  document.querySelectorAll('#stage [data-kind="photo"].empty').forEach(el=>{
    if(isPhone()){ el.classList.remove("has-choose"); return; }
    if(el.querySelector("[data-photo-choose]")) return;
    el.classList.add("has-choose"); el.innerHTML='<button type="button" data-photo-choose class="photo-choose">'+CAM_SVG+'<span>写真を選ぶ</span></button><div class="photo-choose-hint">または、ここに写真を落とす</div>';
  });
  // 「写真を変える」：写真を1つだけ選んでいるとき（空枠でない・見せる範囲/動かし/大きさ変え/書き換え中は出さない）
  const p=photoSelInfo();
  const show = !isPhone() && p && p.asset && !p.cleared && !p.missing && !PG.isCropping() && !PG.isDragging() && !PG.isResizing() && !PG.state.editing;
  if(!show){ photoChangeBtn.style.display="none"; photoChangeBtn._for=null; return; }
  photoChangeBtn._for=p.part; positionPhotoChangeBtn();
}
function positionPhotoChangeBtn(){ const id=photoChangeBtn._for; if(!id){ photoChangeBtn.style.display="none"; return; } const n=PG.elNode(id); if(!n){ photoChangeBtn.style.display="none"; return; }
  const r=n.getBoundingClientRect(); photoChangeBtn.style.display="inline-flex"; const bw=photoChangeBtn.offsetWidth||130;
  if(r.width < bw+16 || r.height < 52){ photoChangeBtn.classList.add("below"); photoChangeBtn.style.left=(r.left+r.width/2)+"px"; photoChangeBtn.style.top=(r.bottom+6)+"px"; return; }   // 小さい枠＝すぐ下の外側
  photoChangeBtn.classList.remove("below");
  const tbb=(()=>{ const t=document.getElementById("toolbar"); return (t&&t.offsetParent!==null)?t.getBoundingClientRect().bottom:0; })();   // X17：見えている部分は上の道具の並びの下端から
  const vx0=Math.max(r.left,0), vy0=Math.max(r.top,tbb), vx1=Math.min(r.right,window.innerWidth), vy1=Math.min(r.bottom,window.innerHeight);   // 見えている部分の真ん中
  photoChangeBtn.style.left=((vx0+vx1)/2)+"px"; photoChangeBtn.style.top=((vy0+vy1)/2)+"px";
}
window.addEventListener("scroll",()=>{ if(!isPhone()&&photoChangeBtn._for) positionPhotoChangeBtn(); },{passive:true});

// --- §5 明るさ ---
const photoTools=document.getElementById("photoTools");
const tBright=document.getElementById("tBright");
const brightPop=document.getElementById("brightPop");
const BRIGHTS=[[-40,"−40%"],[-20,"−20%"],[0,"元のまま"],[20,"+20%"],[40,"+40%"]];
function updatePhotoTools(){ const p=photoSelInfo(); const show=!!(p&&p.asset&&!p.cleared&&!p.missing&&!PG.state.editing&&!isPhone()); photoTools.style.display=show?"inline-flex":"none"; if(!show) brightPop.classList.remove("on"); }
tBright.addEventListener("pointerdown",(e)=>e.preventDefault());
tBright.onclick=(e)=>{ e.stopPropagation(); if(brightPop.classList.contains("on")){ brightPop.classList.remove("on"); return; } if(!buildBrightPop())return; brightPop.classList.add("on"); const r=tBright.getBoundingClientRect(); const pw=brightPop.offsetWidth; let left=r.left; if(left+pw>window.innerWidth-8) left=window.innerWidth-8-pw; if(left<8) left=8; brightPop.style.left=left+"px"; brightPop.style.top=(r.bottom+4)+"px"; };   // X15：画面の左右8以上内側に収める
function previewBright(id,v){ const n=PG.elNode(id); if(n) n.style.filter = v?("brightness("+(1+v/100)+")"):""; }   // 仮表示（記録しない）
function restoreBright(id){ previewBright(id,PG.brightnessOf(id)); }
function buildBrightPop(){ const p=photoSelInfo(); if(!p||!p.asset){ brightPop.classList.remove("on"); return false; } const id=p.part; const url=PG.assetUrl(p.asset)||""; const cur=p.brightness||0;
  brightPop.innerHTML=""; const row=document.createElement("div"); row.className="swrow";
  for(const pair of BRIGHTS){ const v=pair[0]; const b=document.createElement("button"); b.className="sw"+(v===cur?" cur":""); b.setAttribute("data-bright",String(v));
    b.innerHTML='<div class="thumb" style="background-image:url('+url+'); filter:'+(v?("brightness("+(1+v/100)+")"):"none")+'"></div><div class="cap">'+pair[1]+'</div>';
    b.addEventListener("pointerdown",(ev)=>ev.preventDefault());
    b.addEventListener("mouseenter",()=>previewBright(id,v));
    b.addEventListener("mouseleave",()=>restoreBright(id));
    b.onclick=(ev)=>{ ev.stopPropagation(); PG.setBrightness(id,v); brightPop.classList.remove("on"); };
    row.appendChild(b); }
  brightPop.appendChild(row); return true;
}
window.addEventListener("pointerdown",(e)=>{ if(brightPop.classList.contains("on")&&!brightPop.contains(e.target)&&!tBright.contains(e.target)){ const p=photoSelInfo(); if(p) restoreBright(p.part); brightPop.classList.remove("on"); } },true);
window.addEventListener("keydown",(e)=>{ if(e.isComposing||e.keyCode===229)return;/*§23a X33*/ if(e.key==="Escape"&&brightPop.classList.contains("on")){ const p=photoSelInfo(); if(p) restoreBright(p.part); brightPop.classList.remove("on"); } });

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
function enterCrop(id){ if(PG.isCropping())return; if(PG.state.editing)PG.commitEdit(); fmenu.classList.remove("on"); if(!PG.beginCrop(id)) return; ensureZoomBar(); drawCropOverlay(); }
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
  // §5 明るさは見せる範囲の中でも掛かったまま
  const bv=((PG.photosApi().find(p=>p.part===st.id)||{}).brightness)||0; const bf=bv?("brightness("+(1+bv/100)+")"):""; cropwrap.querySelectorAll(".dim,.bright").forEach(x=>x.style.filter=bf);
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
cropwrap.addEventListener("pointerdown",(e)=>{ if(!PG.isCropping())return; if(e.pointerType==="touch")return;   // §5（試験台16）スマホの指は touch ハンドラで処理（1本指=動かす・2本指=拡大）
  e.preventDefault(); e.stopPropagation();
  const sc=(cropwrap._frame&&cropwrap._frame.sc)||PG.getScale(); const dir=e.target.getAttribute&&e.target.getAttribute("data-crop-handle");
  const sx=e.clientX, sy=e.clientY;
  if(dir){ PG.cropCornerStart(dir); const mv=(ev)=>{ PG.cropCornerBy((ev.clientX-sx)/sc,(ev.clientY-sy)/sc); }; const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); }; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); }   // N2 反対の角を止めて拡大
  else { PG.cropPanStart(); const mv=(ev)=>{ PG.cropPanBy((ev.clientX-sx)/sc,(ev.clientY-sy)/sc); }; const up=()=>{ window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); }; window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up); }
});
cropwrap.addEventListener("wheel",(e)=>{ if(!PG.isCropping())return; e.preventDefault(); PG.cropWheel(e.deltaY); },{passive:false});
// 枠の外を押したら決める（§2.1）
window.addEventListener("pointerdown",(e)=>{ if(isPhone()&&e.pointerType!=="touch") return; if(PG.isCropping() && !cropwrap.contains(e.target) && !(zoomBar&&zoomBar.contains(e.target))){ PG.cropCommit(); exitCropOverlay(); } },true);

// ====== §3（試験台15）スマホでの指の操作 ======
const isPhone=()=>PG.api.inputMode()==="phone";
const phoneEdit=()=>isPhone()&&PG.state.device==="sp";   // 指で編集できる
const phoneView=()=>isPhone()&&PG.state.device==="pc";   // §3.2.9 PC の見え方＝見るだけ
const TAP_MOVE=10, DRAG_MOVE=6, LP_MS=500, DTAP_MS=300, DTAP_MOVE=30, EDGE=48, EDGE_MAXV=900;
let tg=null, lastTap=null, lpTimer=null, autoRAF=null, autoLast=0;
function clearLP(){ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } }
function stopAuto(){ if(autoRAF){ clearInterval(autoRAF); autoRAF=null; } }
function partUnder(e){ let r=elFrom(e.target); if(!r){ const sh=PG.smallHit(e.clientX,e.clientY); if(sh) r=sh; } return r; }
// スクロール補正：ドラッグ中にページが動いた分を足して、部品を指に付いていかせる（§3.2.3）
function dragClient(){ return { x:tg.cx, y:tg.cy + (window.scrollY - tg.scroll0) }; }

function onPhoneDown(e){
  if(tg){ end1stOp(); return; }   // §4.7（試験台16）2本目の指：1本目の操作を今の位置で終える。以降の2本指はブラウザのピンチに任せる
  if(PG.state.editing && e.target.closest && e.target.closest("[contenteditable]")) return;   // 書き換え中の文字はブラウザに任せる（§3.2.4/§3.2.5）
  if(phoneView()){ return; }   // §3.2.9 見るだけ（なぞればブラウザがスクロール）
  const hdir=e.target.getAttribute&&e.target.getAttribute("data-handle");
  if(hdir){ const forId=e.target.getAttribute("data-handle-for"); if(PG.beginResize(forId,hdir,e.clientX,e.clientY)){ tg={kind:"resize",sx:e.clientX,sy:e.clientY,cx:e.clientX,cy:e.clientY,scroll0:window.scrollY,moved:false}; e.preventDefault(); startAuto(); } return; }
  if(PG.state.editing) PG.commitEdit();
  const rawId=partUnder(e); const id=rawId?PG.canonId(rawId):null; const grp=rawId?PG.groupOf(rawId):null;
  const selKey=grp?grp:id; const selStart=!!(selKey&&PG.state.selected.has(selKey));
  tg={kind:"pending",sx:e.clientX,sy:e.clientY,cx:e.clientX,cy:e.clientY,scroll0:window.scrollY,rawId:rawId,id:id,grp:grp,moved:false,selStart:selStart,downEl:e.target};
  clearLP(); lpTimer=setTimeout(onLongPress,LP_MS);
  if(selStart&&rawId) e.preventDefault();   // 選んでいる部品＝指で動かす＝ブラウザのスクロールに取られない
}

function onLongPress(){
  lpTimer=null; if(!tg||tg.moved) return;
  const rawId=tg.rawId, id=tg.id, grp=tg.grp, sel=PG.state.selected;
  if(rawId){ if(!(sel.has(id)||(grp&&sel.has(grp)))){ if(grp) PG.selectOnly(grp); else PG.selectOnly(id); } tg.kind="longpressed"; showFmenu(); }   // §3.2.4 選んでいなければ選ぶ・選んでいればそのまま→箱
  else { const host=tg.downEl.closest&&tg.downEl.closest("#sectionwrap .host"); const sec=host&&host.id.replace("host_",""); if(sec){ PG.selectSection(sec); tg.kind="longpressed-sec"; let ty=tg.cy-60; if(ty<4) ty=tg.cy+10; showSectionMenu(sec,tg.cx,ty); } }   // §3.2.6 セクションの箱は指の60上
}

function onPhoneMove(e){
  if(!tg) return; tg.cx=e.clientX; tg.cy=e.clientY;
  const dist=Math.hypot(e.clientX-tg.sx,e.clientY-tg.sy);
  if(!tg.moved&&dist>TAP_MOVE){ tg.moved=true; clearLP(); }
  if(tg.kind==="resize"){ e.preventDefault(); const c=dragClient(); PG.resizeMove(c.x,c.y,false); return; }
  if(tg.kind==="drag"){ e.preventDefault(); const c=dragClient(); PG.dragMove(c.x,c.y,false); return; }
  if((tg.kind==="pending"&&tg.selStart)||tg.kind==="longpressed"){   // §3.2.1 選んでいる部品を6以上なぞる→動かす
    if(dist>DRAG_MOVE&&PG.beginDrag(tg.sx,tg.sy)){ tg.kind="drag"; fmenu.classList.remove("on"); e.preventDefault(); const c=dragClient(); PG.dragMove(c.x,c.y,false); startAuto(); }
  }
  // それ以外（選んでいない所）は preventDefault しない＝ブラウザがスクロール
}

function onPhoneUp(e){
  if(!tg) return; const t=tg; clearLP(); stopAuto();
  if(t.kind==="resize"){ PG.endResize(); tg=null; showFmenu(); return; }
  if(t.kind==="drag"){ PG.endDrag(); tg=null; showFmenu(); return; }   // §3.2.6 動かした後に箱
  if(t.kind==="longpressed"||t.kind==="longpressed-sec"){ tg=null; return; }   // 箱は出したまま
  tg=null; if(t.moved) return;   // 少し動いた＝スクロール寄り→何もしない
  onTap(t,e);
}

function onTap(t,e){
  const now=performance.now();
  if(lastTap&&(now-lastTap.t)<=DTAP_MS&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<=DTAP_MOVE){   // §3.1 ダブルタップ＝書き換え/見せる範囲
    lastTap=null; const rawId=t.rawId;
    if(rawId){ const c=PG.canonId(rawId); if(PG.isText(c)){ PG.startEdit(c); return; } if(/^F_p|photo/.test(rawId)){ enterCrop(rawId); return; } }
  }
  lastTap={t:now,x:e.clientX,y:e.clientY};
  fmenu.classList.remove("on");   // §3.2.6 タップで選んだだけでは箱を出さない
  const rawId=t.rawId; if(!rawId){ PG.clearSel(); return; }   // 背景タップ＝選ぶのをやめる（セクションは選ばない）
  const id=PG.canonId(rawId), grp=t.grp;
  if(grp){ if(!PG.state.selected.has(grp)) PG.selectOnly(grp); else PG.selectMany([rawId]); return; }   // §3.2.2 1回目全体・2回目中の1件
  if(!PG.isDraggable(id)){ PG.clearSel(); return; }
  PG.selectOnly(id);
}

// §3.2.3 画面の端での自動スクロール（ドラッグ・大きさ変えの間）。端に近いほど速く、最大 900/s。部品は指に付いていく。
function startAuto(){ if(autoRAF) return; autoLast=performance.now();
  autoRAF=setInterval(()=>{ if(!tg||(tg.kind!=="drag"&&tg.kind!=="resize")){ stopAuto(); return; }
    const now=performance.now(); const dt=Math.min(0.1,(now-autoLast)/1000); autoLast=now;   // 実経過時間で速さを出す（setInterval の間隔は一定でない）
    // §4.6（試験台16）端は「見えている範囲」で測る。§2.6 下の端は下の並び(#pbar)の上端
    const vvv=window.visualViewport; const vtop=vvv?vvv.offsetTop:0; let vbot=vvv?(vvv.offsetTop+vvv.height):window.innerHeight;
    if(isPhone() && pbar && pbar.style.display!=="none"){ const br=pbar.getBoundingClientRect(); if(br.height) vbot=Math.min(vbot, br.top); }
    let v=0;
    if(tg.cy<vtop+EDGE) v=-EDGE_MAXV*(1-(tg.cy-vtop)/EDGE); else if(tg.cy>vbot-EDGE) v=EDGE_MAXV*(1-(vbot-tg.cy)/EDGE);
    if(!v) return;
    window.scrollBy(0,v*dt);
    const c=dragClient(); if(tg.kind==="drag") PG.dragMove(c.x,c.y,false); else PG.resizeMove(c.x,c.y,false);
  },16);
}

// §3.2.7 つまみの押せる範囲（44×44・data-hit）。見た目のつまみ（.rz-handle）に重ねる。内側に入るのは部品の幅・高さの1/4まで。
function addHandleHits(){
  document.querySelectorAll(".hit-handle").forEach((n)=>n.remove());
  if(!phoneEdit()) return;
  const sel=[...PG.state.selected]; if(sel.length!==1) return; const id=sel[0]; const g=PG.api.geometry()[id]; if(!g) return;
  const sc=PG.getScale(); const HIT=44/sc;
  for(const h of document.querySelectorAll(".rz-handle")){
    const dir=h.getAttribute("data-handle"); if(h.getAttribute("data-handle-for")!==id) continue;
    const cx=parseFloat(h.style.left), cy=parseFloat(h.style.top);
    const inX=Math.min(HIT/2,g.w/4), inY=Math.min(HIT/2,g.h/4);
    let left,top;
    if(/e/.test(dir)) left=cx-inX; else if(/w/.test(dir)) left=cx-(HIT-inX); else left=cx-HIT/2;
    if(/s/.test(dir)) top=cy-inY; else if(/n/.test(dir)) top=cy-(HIT-inY); else top=cy-HIT/2;
    const hit=document.createElement("div"); hit.className="hit-handle"; hit.setAttribute("data-hit","handle-"+dir); hit.setAttribute("data-handle",dir); hit.setAttribute("data-handle-for",id);
    hit.style.left=left+"px"; hit.style.top=top+"px"; hit.style.width=HIT+"px"; hit.style.height=HIT+"px";
    h.parentNode.appendChild(hit);
  }
}

window.addEventListener("pointercancel",(e)=>{ if(isPhone()&&e.pointerType==="touch"&&tg){ clearLP(); stopAuto(); if(tg.kind==="drag") PG.endDrag(); else if(tg.kind==="resize") PG.endResize(); tg=null; } });

// ====== §2-6（試験台16）スマホでの編集 第2回：下の道具・文字の道具・ピンチ・＋ ======
const pbar=document.getElementById("pbar");
const pmore=document.getElementById("pmore");
const ptext=document.getElementById("ptext");
const pSize=document.getElementById("pSize");
const pColor=document.getElementById("pColor");
const PHONE_COLORS=[["文字","#333333"],["うすい","#7B7B7B"],["赤","#D00000"],["青","#1456C8"],["緑","#1A8A3B"],["白","#FFFFFF"]];
function getVS(){ return window.visualViewport?window.visualViewport.scale:1; }
function vvGeom(){ const vv=window.visualViewport; return { s:getVS(), ox:vv?vv.offsetLeft:0, oy:vv?vv.offsetTop:0, vw:vv?vv.width:window.innerWidth, vh:vv?vv.height:window.innerHeight }; }
function editingNow(){ return !!PG.state.editing; }

// §4.7 2本目の指などで1本目の操作を今の位置で終える（箱は出さない・長押しは取り消す）
function end1stOp(){ clearLP(); stopAuto(); if(tg){ if(tg.kind==="drag") PG.endDrag(); else if(tg.kind==="resize") PG.endResize(); else if(tg.kind==="longpressed"||tg.kind==="longpressed-sec") fmenu.classList.remove("on"); } tg=null; }

// §1 X5：長押しが決まった後・動かし中・大きさ変え中は touchmove を止めてスクロールさせない（部品が指からずれない）
window.addEventListener("touchmove",(e)=>{ if(!isPhone()||!tg) return; if(tg.kind==="drag"||tg.kind==="resize"||tg.kind==="longpressed"||tg.kind==="longpressed-sec"){ if(e.cancelable) e.preventDefault(); } },{passive:false});

// 見えている範囲の中に置く（左右8・ピンチ中は画面上の大きさを保つ＝scale(1/vs)）。L,T は画面上の左上
function placeFloat(el, L, T, clampV){ const g=vvGeom(); const rw=el.offsetWidth/g.s, rh=el.offsetHeight/g.s;
  const minL=g.ox+8, maxL=g.ox+g.vw-8-rw; if(L>maxL)L=maxL; if(L<minL)L=minL;
  if(clampV){ const minT=g.oy+8, maxT=g.oy+g.vh-8-rh; if(T>maxT)T=maxT; if(T<minT)T=minT; }
  el.style.left="0"; el.style.top="0"; el.style.transform="translate("+L+"px,"+T+"px) scale("+(1/g.s)+")"; }
// 下の並び・文字の道具を見えている範囲の下端に固定（画面上で同じ大きさ）
function placeBottom(el){ const g=vvGeom(); el.style.width=document.documentElement.clientWidth+"px"; el.style.left="0"; el.style.top="0"; const H=el.offsetHeight; el.style.transform="translate("+g.ox+"px,"+(g.oy+g.vh - H/g.s)+"px) scale("+(1/g.s)+")"; }
function placePbar(){ placeBottom(pbar); }
function placePtext(){ placeBottom(ptext); }
function barTopRendered(bar){ const g=vvGeom(); return g.oy+g.vh - (bar.offsetHeight/g.s); }
function placeAboveBar(el){ const g=vvGeom(); placeFloat(el, g.ox+8, barTopRendered(pbar) - (el.offsetHeight/g.s) - 6, true); }
function placeAbovePtext(el){ const g=vvGeom(); placeFloat(el, g.ox+8, barTopRendered(ptext) - (el.offsetHeight/g.s) - 6, true); }

// --- §2 下の道具の並び ---
function pbtn(label,fn,attr){ const b=document.createElement("button"); b.textContent=label; if(attr)b.setAttribute(attr,"1"); b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); fn(); }; return b; }
function buildPbar(){ pbar.innerHTML="";
  if(phoneView()){ pbar.appendChild(pbtn("スマホの編集に戻る",()=>setPhoneDevice("sp"),"data-pbar-back")); return; }   // §2.4
  pbar.appendChild(pbtn("戻す",()=>PG.undo(),"data-pbar-undo"));
  pbar.appendChild(pbtn("やり直す",()=>PG.redo(),"data-pbar-redo"));
  pbar.appendChild(pbtn("その他",()=>togglePmore(),"data-pbar-more"));
  const sp=document.createElement("span"); sp.className="sp"; pbar.appendChild(sp);   // §22 §3.4 右端に公開
  pbar.appendChild(pbtn("公開",()=>phonePublish(),"data-pbar-publish"));
}
function phonePublish(){ const st=PG.saveState(); if(st.label==="公開中と同じです") return; doPublishFlow(); }   // §22 §4.1 スマホの公開も確認の箱を通す
function setPhoneDevice(d){ pmore.classList.remove("on"); PG.setDevice(d); const sp=document.getElementById("dSP"), pc=document.getElementById("dPC"); if(d==="sp"){ sp.classList.add("on"); pc.classList.remove("on"); } else { pc.classList.add("on"); sp.classList.remove("on"); } }
function togglePmore(){ if(pmore.classList.contains("on")){ pmore.classList.remove("on"); return; } buildPmore(); pmore.classList.add("on"); placeAboveBar(pmore); }
function buildPmore(){ pmore.innerHTML="";   // §2.3 一覧の中身（上から）
  const mk=(label,fn)=>{ const b=document.createElement("button"); b.textContent=label; b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); pmore.classList.remove("on"); fn(); }; return b; };
  const st=PG.saveState(); const srow=document.createElement("div"); srow.className="pmorestat"+((st.status==="error"||st.label==="まだ公開していない変更があります")?" warn":""); srow.textContent=st.label; pmore.appendChild(srow);   // §22 §3.4 状態の文字＝その他の一番上
  pmore.appendChild(mk("履歴",()=>{ pmore.classList.remove("on"); if(historyOpen) closeHistory(); else openHistory(); }));   // §22 §3.4/§6 履歴・プレビューはその他
  pmore.appendChild(mk("プレビュー",()=>enterPreviewUI()));   // §22 §5
  pmore.appendChild(mk("テキストを足す",()=>phoneAddText()));
  pmore.appendChild(mk("PC の見え方を見る",()=>setPhoneDevice("pc")));
  const peek=document.createElement("button"); peek.textContent="元の配置を見る"; peek.setAttribute("data-pmore-peek","1"); peek.addEventListener("pointerdown",(e)=>{ e.preventDefault(); PG.peekOn(); }); const off=()=>{ if(PG.state.peek) PG.peekOff(); }; peek.addEventListener("pointerup",off); peek.addEventListener("pointerleave",off); peek.onclick=(e)=>e.stopPropagation(); pmore.appendChild(peek);
  pmore.appendChild(mk("このページを元に戻す",()=>PG.resetScope("page",null,["pc","sp"])));
  pmore.appendChild(mk("制作用",()=>{ document.getElementById("studio").classList.toggle("on"); refreshStudio(); }));
}
function phoneAddText(){ const sel=[...PG.state.selected].filter((id)=>PG.isDraggable(id)||PG.isText(id)); const anchor=sel.length?PG.canonId(sel[0]):"F_h0"; PG.addTextAt(anchor,24,"テキスト"); }

// --- §3 文字の道具（キーボードのすぐ上） ---
function selectAllEditing(){ if(!PG.state.editing) return; const n=PG.elNode(PG.state.editing.id); if(!n) return; const r=document.createRange(); r.selectNodeContents(n); const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
function buildPtext(){ ptext.innerHTML="";
  const mk=(html,fn,attr)=>{ const b=document.createElement("button"); b.innerHTML=html; if(attr)b.setAttribute(attr,"1"); b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.addEventListener("mousedown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); fn(); }; return b; };   // §3.3 押しても書き換えは終わらない
  ptext.appendChild(mk("大きさ",()=>togglePSize(),"data-pt-size"));
  ptext.appendChild(mk("<b>太字</b>",()=>ptBold(),"data-pt-bold"));
  ptext.appendChild(mk("色",()=>togglePColor(),"data-pt-color"));
  const sp=document.createElement("span"); sp.className="sp"; ptext.appendChild(sp);
  ptext.appendChild(mk("終わる",()=>ptDone(),"data-pt-done"));
}
function showPtext(){ buildPtext(); ptext.classList.add("on"); placePtext(); }
function ptBold(){ if(!PG.state.editing){ PG.textToggleBold(); return; } if(!PG.editingHasSelection()) selectAllEditing(); PG.applyPartStyle("bold"); }
function ptApplySize(px){ if(PG.state.editing){ if(!PG.editingHasSelection()) selectAllEditing(); const box=PG.boxSizePx(PG.state.editing.id)||px; PG.applyPartStyle("scale", px/box); } else { PG.textSetSize(px); } }
function ptApplyColor(hex){ if(PG.state.editing){ if(!PG.editingHasSelection()) selectAllEditing(); PG.applyPartStyle("color",hex); } else { PG.textSetColor(hex); } }
function togglePSize(){ if(pSize.classList.contains("on")){ pSize.classList.remove("on"); return; } pColor.classList.remove("on"); pSize.innerHTML=""; for(const n of PG.SIZE_LIST){ const b=document.createElement("button"); b.textContent=String(n); b.setAttribute("data-ts-size",String(n)); b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); ptApplySize(n); pSize.classList.remove("on"); }; pSize.appendChild(b); } pSize.classList.add("on"); placeAbovePtext(pSize); }
function togglePColor(){ if(pColor.classList.contains("on")){ pColor.classList.remove("on"); return; } pSize.classList.remove("on"); pColor.innerHTML=""; for(const pair of PHONE_COLORS){ const b=document.createElement("button"); b.className="cell"; b.style.background=pair[1]; b.title=pair[0]; b.setAttribute("data-ts-color",pair[1]); b.setAttribute("data-color-name",pair[0]); b.addEventListener("pointerdown",(e)=>e.preventDefault()); b.onclick=(e)=>{ e.stopPropagation(); ptApplyColor(pair[1]); pColor.classList.remove("on"); }; pColor.appendChild(b); } pColor.classList.add("on"); placeAbovePtext(pColor); }
function ptDone(){ pSize.classList.remove("on"); pColor.classList.remove("on"); if(PG.state.editing) PG.commitEdit(); const ae=document.activeElement; if(ae&&ae.blur) ae.blur(); }   // §3.5 書き換えを終える・キーボードを閉じる

// §1 X8/§4.3 箱は部品・セクションに付いていく（見えている範囲の中・画面上の大きさを保つ）
function positionFmenuPhone(){ const g=vvGeom();
  fmenu.style.maxWidth=Math.max(120,(g.vw-16)*g.s)+"px";   // X6 入らなければ折り返す
  if(fmenu._follow==="section"){ const h=document.getElementById("host_"+fmenu._secId); if(!h){ return; } const hr=h.getBoundingClientRect();
    placeFloat(fmenu, (fmenu._secCX||hr.left), hr.top + (fmenu._secTopOff||0), true); return; }   // §X8 セクションに付いていく（指の位置を保つ）・見えている範囲の中に収める
  const id=[...PG.state.selected][0]; const n=id&&PG.elNode(id); if(!n){ return; } const pr=n.getBoundingClientRect();
  const rh=fmenu.offsetHeight/g.s;
  if(fmenu._place==null){ fmenu._place=((pr.top - rh - 6) >= g.oy+8) ? "above" : "below"; }   // 出すときに上下を決め、以後は保つ（関係を保って付いていく）
  const T = fmenu._place==="above" ? (pr.top - rh - 6) : (pr.bottom + 6);
  placeFloat(fmenu, pr.left, T, false);   // 縦は付いていく・横だけ見えている範囲に収める
}

// §2/§3 スマホの道具の出し分け（書き換え中は下の並びを隠し、文字の道具を出す）
function refreshPhoneUI(){ const phone=isPhone(); document.body.classList.toggle("pg-phone", phone);
  if(!phone){ pbar.style.display="none"; pmore.classList.remove("on"); ptext.classList.remove("on"); pSize.classList.remove("on"); pColor.classList.remove("on"); document.body.classList.remove("pg-hideadd"); document.getElementById("stage").style.paddingBottom=""; return; }
  const editing=editingNow();
  const hideAdd = phoneView() || editing || (tg&&(tg.kind==="drag"||tg.kind==="resize"));
  document.body.classList.toggle("pg-hideadd", !!hideAdd);   // §6.4
  if(editing){ pbar.style.display="none"; pmore.classList.remove("on"); if(!ptext.classList.contains("on")) showPtext(); else placePtext(); document.getElementById("stage").style.paddingBottom="12px"; }   // §2.7
  else { ptext.classList.remove("on"); pSize.classList.remove("on"); pColor.classList.remove("on"); buildPbar(); pbar.style.display="flex"; placePbar(); document.getElementById("stage").style.paddingBottom=((pbar.offsetHeight||56)+40)+"px"; }   // §2.5 並びの高さ分＋境目の＋の分の余白（一番下の部品・＋が並びに隠れない）
}

// §4.3 ピンチ・スクロールのたびに道具を置き直す
function syncOverlays(){ if(!isPhone()) return;
  if(pbar.style.display!=="none" && !editingNow()) placePbar();
  if(ptext.classList.contains("on")) placePtext();
  if(pmore.classList.contains("on")) placeAboveBar(pmore);
  if(pSize.classList.contains("on")) placeAbovePtext(pSize);
  if(pColor.classList.contains("on")) placeAbovePtext(pColor);
  if(fmenu.classList.contains("on")) positionFmenu();
  if(typePicker&&typePicker.classList.contains("on")) positionTypePicker();
  const s=getVS(); document.querySelectorAll(".rz-handle,.hit-handle").forEach((n)=>{ n.style.transform = (s!==1)?("scale("+(1/s)+")"):""; });   // §4.4 つまみは画面上の大きさを保つ
}
if(window.visualViewport){ window.visualViewport.addEventListener("resize",syncOverlays); window.visualViewport.addEventListener("scroll",syncOverlays); }
window.addEventListener("scroll",()=>{ if(isPhone()) syncOverlays(); },{passive:true});
window.addEventListener("pointerdown",(e)=>{ if(pmore.classList.contains("on")&&!pmore.contains(e.target)&&!(e.target.closest&&e.target.closest("[data-pbar-more]"))) pmore.classList.remove("on");
  if(pSize.classList.contains("on")&&!pSize.contains(e.target)&&!(e.target.closest&&e.target.closest("[data-pt-size]"))) pSize.classList.remove("on");
  if(pColor.classList.contains("on")&&!pColor.contains(e.target)&&!(e.target.closest&&e.target.closest("[data-pt-color]"))) pColor.classList.remove("on"); },true);

// §5.4 見せる範囲：指のタッチで動かす（1本）・2本指のピンチで写真を拡大縮小（ページは拡大しない＝touch-action:none）
let cropTouch=null;
cropwrap.addEventListener("touchstart",(e)=>{ if(!PG.isCropping())return; const sc=(cropwrap._frame&&cropwrap._frame.sc)||PG.getScale();
  if(e.touches.length===2){ const a=e.touches[0],b=e.touches[1]; const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); const st=PG.cropState(); cropTouch={mode:"pinch",d0:d,z0:(st&&st.view?st.view.zoom:1)}; PG._barActive=true; e.preventDefault(); return; }
  const t=e.touches[0]; const dir=t.target.getAttribute&&t.target.getAttribute("data-crop-handle");
  if(dir){ PG.cropCornerStart(dir); cropTouch={mode:"corner",sx:t.clientX,sy:t.clientY,sc}; } else { PG.cropPanStart(); cropTouch={mode:"pan",sx:t.clientX,sy:t.clientY,sc}; }
  e.preventDefault();
},{passive:false});
cropwrap.addEventListener("touchmove",(e)=>{ if(!PG.isCropping()||!cropTouch)return;
  if(cropTouch.mode==="pinch"){ if(e.touches.length>=2){ const a=e.touches[0],b=e.touches[1]; const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); if(cropTouch.d0>0) PG.cropZoomTo(cropTouch.z0*(d/cropTouch.d0)); } if(e.cancelable)e.preventDefault(); return; }
  const t=e.touches[0]; if(!t)return; const sc=cropTouch.sc;
  if(cropTouch.mode==="corner") PG.cropCornerBy((t.clientX-cropTouch.sx)/sc,(t.clientY-cropTouch.sy)/sc); else PG.cropPanBy((t.clientX-cropTouch.sx)/sc,(t.clientY-cropTouch.sy)/sc);
  if(e.cancelable)e.preventDefault();
},{passive:false});
cropwrap.addEventListener("touchend",(e)=>{ if(!cropTouch)return; if(e.touches.length===0){ cropTouch=null; PG._barActive=false; } });

// 開いたとき：スマホなら最初からスマホの配置を出す（§2）
document.body.classList.toggle("pg-phone", isPhone());
if(isPhone()){ PG.setDevice("sp"); document.getElementById("dSP").classList.add("on"); document.getElementById("dPC").classList.remove("on"); }

// §22 §2 保存：IndexedDB から下書きを復元してから描く（無ければテンプレ）。復元後の「戻す」は空から
if(PG.boot) PG.boot(); else PG.render();
`;

async function buildFull() {
  const photos = await encodePhotos();
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>wa-01 layout playground 18（試験台17 の直し：X10〜X17）</title>
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
  const out = path.join(outDir, "playground25_single.html");
  fs.writeFileSync(out, html);
  console.log(`wrote ${out}  (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
  // §6 試験の画像を refs にも写す（Claude.ai の確認で使う）
  const imgSrc = path.join(here, "testimg"), imgDst = path.join(outDir, "playground25_testimg");
  if (fs.existsSync(imgSrc)) { fs.mkdirSync(imgDst, { recursive: true }); for (const f of fs.readdirSync(imgSrc)) fs.copyFileSync(path.join(imgSrc, f), path.join(imgDst, f)); }
  fs.writeFileSync(path.join(here, "index.html"), html);
}
await buildFull();
