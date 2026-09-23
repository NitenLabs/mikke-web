#!/usr/bin/env node
// clone §2.3 画素の比較（従・PC）：両側塗り＋セクションごとの差の割合＋8×8升目の上位5点の分類。
//   セクション内の相対で見る（各セクションを自分の上端で切り出し＝累積ずれの影響を除く）。
//
// 「覆えなかった写真の範囲」は固定値で持たず、参照元の画面から機械的に求める（b2 条件1）：
//   参照元の撮影画像（覆った後）で、DOM から取れた要素（文字・図形・写真）が1つも重ならず、かつ
//   単色でない（＝実写の分散がある）マスの塊を「覆えない写真の領域（WebGL 等）」として検出し、その
//   外接矩形を両側に #9A9A9A で塗る。求めた矩形の一覧（セクション・座標・大きさ・面積割合）を出す。
//   塗った面積がセクションの 40% を超えたら、そのセクションは「画素比較は成立しない」＝合否を出さない。
//   （SP は clone-pixel では扱わない＝要素の照合のみ。理由は末尾に出力。）
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const REF = "refs/studio-Q65qmmvqVR/masked";
const W = 1440;
const refData = JSON.parse(fs.readFileSync(path.join(REF, "elements-pc.json"), "utf8"));
const refDocH = refData.docH;
// セクション（名, 参照元上端, 高さ）
const SECS = [["FV", 0, 758], ["ABOUT", 758, 1058], ["FEATURE", 1816, 1402], ["PRICE", 3218, 1517], ["FAQ", 4735, 628], ["CONTACT", 5363, 590], ["FOOTER", 5953, refDocH - 5953]];
const secIdByName = { FV: "sec_hero", ABOUT: "sec_about", FEATURE: "sec_feature", PRICE: "sec_price", FAQ: "sec_faqs", CONTACT: "sec_contact", FOOTER: "sec_footer" };
// DOM から取れた矩形（文字・図形・写真＝これらが重なるマスは「覆えない写真」ではない）。
// ただし全面の地・全面スクリム（全幅 w≥1400 かつ高さのある h≥300）は除く：WebGL 写真の背後に敷かれた
// 単色 div（FV の #000 スクリム・CONTACT の #333 地）で、これを「覆い」に数えると手前の実写を検出できない。
const DOMRECTS = [...refData.elements.map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h })), ...(refData.surfaces || []).filter((s) => !(s.w >= 1400 && s.h >= 300)).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }))];
const IMGRECTS = refData.elements.filter((e) => e.tag === "img").map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }));
const TEXTS = refData.elements.filter((e) => e.text).map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }));

// 参照元マスク画像を1枚に連結
execSync(`rm -f /tmp/refseg_*.png`);
const segs = fs.readdirSync(REF).filter((f) => /^pc-\d+\.jpg$/.test(f)).sort();
let refFull = new PNG({ width: W, height: refDocH }); refFull.data.fill(255);
let yoff = 0;
for (const seg of segs) {
  execSync(`sips -s format png ${path.join(REF, seg)} --out /tmp/refseg.png >/dev/null 2>&1`);
  const s = PNG.sync.read(fs.readFileSync("/tmp/refseg.png"));
  for (let y = 0; y < s.height && yoff + y < refDocH; y++) for (let x = 0; x < W; x++) { const si = ((s.width * y) + x) << 2, di = ((W * (yoff + y)) + x) << 2; for (let k = 0; k < 4; k++) refFull.data[di + k] = s.data[si + k]; }
  yoff += s.height;
}

// --- 覆えない写真の領域を機械的に検出（DOM で覆えず・単色でないマスの塊の外接矩形） ---
const CELL = 8, GW = Math.ceil(W / CELL), GH = Math.ceil(refDocH / CELL);
const covered = new Uint8Array(GW * GH);
for (const r of DOMRECTS) {
  const x0 = Math.max(0, Math.floor(r.x / CELL)), x1 = Math.min(GW - 1, Math.floor((r.x + r.w - 1) / CELL));
  const y0 = Math.max(0, Math.floor(r.y / CELL)), y1 = Math.min(GH - 1, Math.floor((r.y + r.h - 1) / CELL));
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) covered[gy * GW + gx] = 1;
}
// 「単色（覆いの地）」の判定：覆った参照元では、写真以外の地はすべて無彩色の既知パレット
//   （白 #FFF・#EEE・灰 #9A9A9A・#333・黒 等）で、実写だけが有彩色 or 高レンジになる。
//   よって「マス内の輝度レンジが小さく、かつ平均色が無彩色（RGB の開きが小さい）」なら地＝写真でない。
//   これで暗く滑らかな実写（FV の茶器＝暖色）も、レンジだけでは地に見えるが有彩なので写真として拾える。
const RANGE_FLAT = 24, GRAY_SPREAD = 14;
const photo = new Uint8Array(GW * GH);
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
  if (covered[gy * GW + gx]) continue;
  let mn = 255, mx = 0, sr = 0, sg = 0, sb = 0, cnt = 0;
  const px0 = gx * CELL, py0 = gy * CELL;
  for (let y = py0; y < py0 + CELL && y < refDocH; y += 2) for (let x = px0; x < px0 + CELL && x < W; x += 2) {
    const o = ((W * y) + x) << 2; const r = refFull.data[o], g = refFull.data[o + 1], bl = refFull.data[o + 2];
    const lum = r * 0.299 + g * 0.587 + bl * 0.114; if (lum < mn) mn = lum; if (lum > mx) mx = lum;
    sr += r; sg += g; sb += bl; cnt++;
  }
  if (!cnt) continue;
  const mr = sr / cnt, mg = sg / cnt, mb = sb / cnt;
  const spread = Math.max(mr, mg, mb) - Math.min(mr, mg, mb);
  const isFlat = (mx - mn) < RANGE_FLAT && spread < GRAY_SPREAD; // 低レンジ かつ 無彩色＝地
  if (!isFlat) photo[gy * GW + gx] = 1;
}
// 連結成分（4近傍）→ 外接矩形。小さい塊（ノイズ）は捨てる。
const seen = new Uint8Array(GW * GH), autoRects = [];
const MIN_CELLS = 40;
for (let i = 0; i < GW * GH; i++) {
  if (!photo[i] || seen[i]) continue;
  const stack = [i]; seen[i] = 1; const cells = [];
  while (stack.length) {
    const c = stack.pop(); cells.push(c); const gx = c % GW, gy = (c / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const ni = ny * GW + nx; if (photo[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); } }
  }
  if (cells.length < MIN_CELLS) continue;
  let minx = 1e9, miny = 1e9, maxx = 0, maxy = 0;
  for (const c of cells) { const gx = c % GW, gy = (c / GW) | 0; minx = Math.min(minx, gx); miny = Math.min(miny, gy); maxx = Math.max(maxx, gx); maxy = Math.max(maxy, gy); }
  autoRects.push({ x: minx * CELL, y: miny * CELL, w: (maxx - minx + 1) * CELL, h: (maxy - miny + 1) * CELL });
}
// セクション割り当て（矩形の中心 y）と面積割合
const secOfY = (y) => { for (const [n, top, h] of SECS) if (y >= top && y < top + h) return n; return "FOOTER"; };
for (const r of autoRects) r.sec = secOfY(r.y + r.h / 2);
const paintRects = [...autoRects, ...IMGRECTS.map((r) => ({ ...r, img: true }))]; // 覆えない写真 ＋ 覆えた写真(img)

// clone 全ページ撮影
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: 900 } });
await p.goto(pathToFileURL(path.resolve("dist/clone-q65/index.html")).href, { waitUntil: "load" });
await p.evaluate(() => document.fonts && document.fonts.ready); await p.waitForTimeout(400);
const cloneDocH = await p.evaluate(() => document.documentElement.scrollHeight);
const cloneSecTops = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-sec]")].map((s) => [s.getAttribute("data-sec"), Math.round(s.getBoundingClientRect().top + window.scrollY)])));
await p.setViewportSize({ width: W, height: Math.min(cloneDocH, 16000) });
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/clone_full.png" });
await b.close();
const cloneFull = PNG.sync.read(fs.readFileSync("/tmp/clone_full.png"));

function sub(full, top, H) { const o = new PNG({ width: W, height: H }); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = ((full.width * (top + y)) + x) << 2, d = ((W * y) + x) << 2; for (let k = 0; k < 4; k++) o.data[d + k] = full.data[s + k] ?? 255; } return o; }
function paint(png, rects, H) { for (const r of rects) for (let y = Math.max(0, r.y); y < r.y + r.h && y < H; y++) for (let x = Math.max(0, r.x); x < r.x + r.w && x < W; x++) { const d = ((W * y) + x) << 2; png.data[d] = 0x9A; png.data[d + 1] = 0x9A; png.data[d + 2] = 0x9A; png.data[d + 3] = 255; } }

const results = [];
for (const [name, refTop, H] of SECS) {
  const cloneTop = cloneSecTops[secIdByName[name]] ?? refTop;
  const ref = sub(refFull, refTop, H), clone = sub(cloneFull, cloneTop, H);
  const relRects = paintRects.map((r) => ({ x: r.x, y: r.y - refTop, w: r.w, h: r.h })).filter((r) => r.y + r.h > 0 && r.y < H);
  // 塗った面積（このセクションに掛かる分）
  let painted = 0; for (const r of relRects) { const y0 = Math.max(0, r.y), y1 = Math.min(H, r.y + r.h), x0 = Math.max(0, r.x), x1 = Math.min(W, r.x + r.w); if (y1 > y0 && x1 > x0) painted += (y1 - y0) * (x1 - x0); }
  const paintedPct = 100 * painted / (W * H);
  paint(ref, relRects, H); paint(clone, relRects, H);
  const diff = new PNG({ width: W, height: H });
  const nd = pixelmatch(clone.data, ref.data, diff.data, W, H, { threshold: 0.1 });
  const pct = 100 * nd / (W * H);
  const valid = paintedPct <= 40;
  // 8x8 hotspot
  const GX = 8, GY = 8, cw = W / GX, ch = H / GY; const cells = [];
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) { let dc = 0; for (let y = Math.floor(gy * ch); y < (gy + 1) * ch; y++) for (let x = Math.floor(gx * cw); x < (gx + 1) * cw; x++) { const o = ((W * y) + x) << 2; if (diff.data[o] === 255 && diff.data[o + 1] === 0) dc++; } cells.push({ gx, gy, dc, pct: 100 * dc / (cw * ch), cx: (gx + 0.5) * cw, cy: (gy + 0.5) * ch }); }
  cells.sort((a, c) => c.dc - a.dc);
  const relTexts = TEXTS.map((t) => ({ x: t.x, y: t.y - refTop, w: t.w, h: t.h })).filter((t) => t.y + t.h > 0 && t.y < H);
  const classify = (c) => {
    if (c.dc === 0) return "差なし";
    for (const r of relRects) { for (const ey of [r.y, r.y + r.h]) if (Math.abs(c.cy - ey) < ch / 2 + 4 && c.cx > r.x - cw && c.cx < r.x + r.w + cw) return "塗った矩形の端"; for (const ex of [r.x, r.x + r.w]) if (Math.abs(c.cx - ex) < cw / 2 + 4 && c.cy > r.y - ch && c.cy < r.y + r.h + ch) return "塗った矩形の端"; }
    for (const t of relTexts) if (Math.abs(c.cx - (t.x + t.w / 2)) < cw / 2 + t.w / 2 + 6 && Math.abs(c.cy - (t.y + t.h / 2)) < ch / 2 + t.h / 2 + 6) return "文字の縁";
    if (c.cy < ch + 4 || c.cy > H - ch - 4) return "縦のずれ";
    return "それ以外";
  };
  const top5 = cells.slice(0, 5).map((c) => ({ ...c, cls: classify(c) }));
  const others = top5.filter((c) => c.cls === "それ以外" && c.dc > 0);
  results.push({ name, pct, paintedPct, valid, cloneTop, refTop, top5, others: others.length, diff, ref, clone, H });
}

// 出力
console.log("覆えない写真の矩形（機械検出・両側に塗る）：");
for (const r of autoRects) { const sec = SECS.find((s) => s[0] === r.sec); const secArea = W * sec[2]; console.log(`  ${r.sec.padEnd(8)} x${r.x} y${r.y} ${r.w}×${r.h}  面積 ${(100 * r.w * r.h / secArea).toFixed(1)}% of section`); }
if (!autoRects.length) console.log("  （検出なし）");
console.log("\nセクション  差%    塗った%  判定   上位5升目の分類（それ以外があれば★）");
let anyOther = false;
for (const r of results) {
  const cls = r.top5.filter((c) => c.dc > 0).map((c) => c.cls);
  const mark = r.others ? " ★それ以外あり" : "";
  const verdict = r.valid ? "" : "  ⚠画素比較は成立しない(塗り>40%)";
  console.log(`${r.name.padEnd(9)} ${r.pct.toFixed(2)}%  ${r.paintedPct.toFixed(1)}%  ${r.valid ? "有効" : "無効"}  [${cls.join(", ")}]${mark}${verdict}`);
  if (r.others && r.valid) anyOther = true; // 無効セクションの「それ以外」は塗り残しなので停止条件にしない
}
// hotspot シート（それ以外が出た有効セクション、なければ最初の有効セクション、なければ FV）
fs.mkdirSync("refs/clone", { recursive: true });
const saveSheet = results.find((r) => r.others && r.valid) || results.find((r) => r.valid) || results[0];
{
  const r = saveSheet; const cw = W / 8, ch = r.H / 8, cW = Math.round(cw), cH = Math.round(ch), pad = 4;
  const sheetW = cW * 3 + pad * 4, sheetH = (cH + pad) * 5 + pad; const sheet = new PNG({ width: sheetW, height: sheetH }); sheet.data.fill(40);
  const blit = (src, sx, sy, dx, dy) => { for (let y = 0; y < cH && sy + y < r.H; y++) for (let x = 0; x < cW && sx + x < W; x++) { const s = ((W * (sy + y)) + (sx + x)) << 2, d = ((sheetW * (dy + y)) + (dx + x)) << 2; for (let k = 0; k < 4; k++) sheet.data[d + k] = src.data[s + k]; } };
  r.top5.forEach((c, i) => { const sx = Math.floor(c.gx * cw), sy = Math.floor(c.gy * ch), dy = pad + i * (cH + pad); blit(r.ref, sx, sy, pad, dy); blit(r.clone, sx, sy, pad * 2 + cW, dy); blit(r.diff, sx, sy, pad * 3 + cW * 2, dy); });
  fs.writeFileSync("/tmp/sheet.png", PNG.sync.write(sheet));
  execSync(`sips -s format jpeg /tmp/sheet.png --out refs/clone/diff-hotspots.jpg >/dev/null 2>&1`);
  console.log(`\nhotspot シート: refs/clone/diff-hotspots.jpg（${saveSheet.name}）`);
}
fs.writeFileSync("refs/compare/clone-pixel-report.json", JSON.stringify({
  autoRects: autoRects.map((r) => ({ sec: r.sec, x: r.x, y: r.y, w: r.w, h: r.h })),
  sections: results.map((r) => ({ name: r.name, pct: +r.pct.toFixed(2), paintedPct: +r.paintedPct.toFixed(1), valid: r.valid, top5: r.top5.map((c) => ({ cell: [c.gx, c.gy], pct: +c.pct.toFixed(1), cls: c.cls })), others: r.others })),
  note_sp: "SP は clone-pixel では画素比較しない（要素の照合のみ）。SP でも同種の WebGL 写真があり同じ機械検出は可能だが、SP 撮影の連結・clone 全高撮影を別途要するため今回は範囲外。SP の忠実性は clone-compare の要素照合で判定する。",
}, null, 2));
console.log(anyOther ? "\n★「それ以外」あり（有効セクション）＝構造の差の疑い。停止して報告。" : "\n有効セクションに「それ以外」なし＝画素比較は従のまま続行可。");
console.log("SP：clone-pixel では画素比較しない（要素の照合のみ／理由はレポート note_sp）。");
process.exit(anyOther ? 2 : 0);
