#!/usr/bin/env node
// clone §2.3 画素の比較（従）：両側塗り＋セクションごとの差の割合＋8×8升目の上位5点の分類。
//   セクション内の相対で見る（各セクションを自分の上端で切り出し＝累積ずれの影響を除く）。
//   写真の矩形（FVヒーロー＋img要素）を両方に #9A9A9A で塗ってから pixelmatch（閾値0.1）。
//   升目の分類：文字の縁／縦のずれ／塗った矩形の端／それ以外。それ以外が出たら異常として印。
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
// 写真の矩形（絶対 page y）：FVヒーロー＋img要素
const PHOTOS = [{ x: 0, y: 0, w: 1440, h: 720 }, ...refData.elements.filter((e) => e.tag === "img").map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }))];
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
const secIdByName = { FV: "sec_hero", ABOUT: "sec_about", FEATURE: "sec_feature", PRICE: "sec_price", FAQ: "sec_faqs", CONTACT: "sec_contact", FOOTER: "sec_footer" };

function sub(full, top, H) { const o = new PNG({ width: W, height: H }); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = ((full.width * (top + y)) + x) << 2, d = ((W * y) + x) << 2; for (let k = 0; k < 4; k++) o.data[d + k] = full.data[s + k] ?? 255; } return o; }
function paint(png, rects, H) { for (const r of rects) for (let y = Math.max(0, r.y); y < r.y + r.h && y < H; y++) for (let x = Math.max(0, r.x); x < r.x + r.w && x < W; x++) { const d = ((W * y) + x) << 2; png.data[d] = 0x9A; png.data[d + 1] = 0x9A; png.data[d + 2] = 0x9A; png.data[d + 3] = 255; } }

const results = [];
for (const [name, refTop, H] of SECS) {
  const cloneTop = cloneSecTops[secIdByName[name]] ?? refTop;
  const ref = sub(refFull, refTop, H), clone = sub(cloneFull, cloneTop, H);
  const relPhotos = PHOTOS.map((r) => ({ x: r.x, y: r.y - refTop, w: r.w, h: r.h })).filter((r) => r.y + r.h > 0 && r.y < H);
  paint(ref, relPhotos, H); paint(clone, relPhotos, H);
  const diff = new PNG({ width: W, height: H });
  const nd = pixelmatch(clone.data, ref.data, diff.data, W, H, { threshold: 0.1 });
  const pct = 100 * nd / (W * H);
  // 8x8 hotspot
  const GX = 8, GY = 8, cw = W / GX, ch = H / GY; const cells = [];
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) { let dc = 0; for (let y = Math.floor(gy * ch); y < (gy + 1) * ch; y++) for (let x = Math.floor(gx * cw); x < (gx + 1) * cw; x++) { const o = ((W * y) + x) << 2; if (diff.data[o] === 255 && diff.data[o + 1] === 0) dc++; } cells.push({ gx, gy, dc, pct: 100 * dc / (cw * ch), cx: (gx + 0.5) * cw, cy: (gy + 0.5) * ch }); }
  cells.sort((a, c) => c.dc - a.dc);
  const relTexts = TEXTS.map((t) => ({ x: t.x, y: t.y - refTop, w: t.w, h: t.h })).filter((t) => t.y + t.h > 0 && t.y < H);
  const classify = (c) => {
    if (c.dc === 0) return "差なし";
    // 塗った矩形の端
    for (const r of relPhotos) { for (const ey of [r.y, r.y + r.h]) if (Math.abs(c.cy - ey) < ch / 2 + 4 && c.cx > r.x - cw && c.cx < r.x + r.w + cw) return "塗った矩形の端"; for (const ex of [r.x, r.x + r.w]) if (Math.abs(c.cx - ex) < cw / 2 + 4 && c.cy > r.y - ch && c.cy < r.y + r.h + ch) return "塗った矩形の端"; }
    // 文字の縁
    for (const t of relTexts) if (Math.abs(c.cx - (t.x + t.w / 2)) < cw / 2 + t.w / 2 + 6 && Math.abs(c.cy - (t.y + t.h / 2)) < ch / 2 + t.h / 2 + 6) return "文字の縁";
    // 縦のずれ（セクションの上端/下端付近）
    if (c.cy < ch + 4 || c.cy > H - ch - 4) return "縦のずれ";
    return "それ以外";
  };
  const top5 = cells.slice(0, 5).map((c) => ({ ...c, cls: classify(c) }));
  const others = top5.filter((c) => c.cls === "それ以外" && c.dc > 0);
  results.push({ name, pct, cloneTop, refTop, top5, others: others.length, diff, ref, clone, H });
}

// 出力
console.log("セクション  差%   上位5升目の分類（それ以外があれば★）");
let anyOther = false;
for (const r of results) {
  const cls = r.top5.filter((c) => c.dc > 0).map((c) => c.cls);
  const mark = r.others ? " ★それ以外あり" : "";
  console.log(`${r.name.padEnd(9)} ${r.pct.toFixed(2)}%  [${cls.join(", ")}]${mark}`);
  if (r.others) anyOther = true;
}
// hotspot シート（それ以外が出たセクション、または FV を保存）
fs.mkdirSync("refs/clone", { recursive: true });
const saveSheet = results.find((r) => r.others) || results[0];
{
  const r = saveSheet; const cw = W / 8, ch = r.H / 8, cW = Math.round(cw), cH = Math.round(ch), pad = 4;
  const sheetW = cW * 3 + pad * 4, sheetH = (cH + pad) * 5 + pad; const sheet = new PNG({ width: sheetW, height: sheetH }); sheet.data.fill(40);
  const blit = (src, sx, sy, dx, dy) => { for (let y = 0; y < cH && sy + y < r.H; y++) for (let x = 0; x < cW && sx + x < W; x++) { const s = ((W * (sy + y)) + (sx + x)) << 2, d = ((sheetW * (dy + y)) + (dx + x)) << 2; for (let k = 0; k < 4; k++) sheet.data[d + k] = src.data[s + k]; } };
  r.top5.forEach((c, i) => { const sx = Math.floor(c.gx * cw), sy = Math.floor(c.gy * ch), dy = pad + i * (cH + pad); blit(r.ref, sx, sy, pad, dy); blit(r.clone, sx, sy, pad * 2 + cW, dy); blit(r.diff, sx, sy, pad * 3 + cW * 2, dy); });
  fs.writeFileSync("/tmp/sheet.png", PNG.sync.write(sheet));
  execSync(`sips -s format jpeg /tmp/sheet.png --out refs/clone/diff-hotspots.jpg >/dev/null 2>&1`);
  console.log(`\nhotspot シート: refs/clone/diff-hotspots.jpg（${saveSheet.name}）`);
}
fs.writeFileSync("refs/compare/clone-pixel-report.json", JSON.stringify(results.map((r) => ({ name: r.name, pct: +r.pct.toFixed(2), top5: r.top5.map((c) => ({ cell: [c.gx, c.gy], pct: +c.pct.toFixed(1), cls: c.cls })), others: r.others })), null, 2));
console.log(anyOther ? "\n★「それ以外」あり＝構造の差の疑い。停止して報告。" : "\n「それ以外」なし＝画素比較は従のまま続行可。");
process.exit(anyOther ? 2 : 0);
