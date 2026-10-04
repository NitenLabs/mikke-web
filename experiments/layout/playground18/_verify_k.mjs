// 試験台17 K1〜K27（写真を変える・足す・明るさ・テキストの入り方）。playground18_single.html に本物のマウス・キーボードを与える。
// 「両端末」＝PC の配置／スマホの配置の両方（どちらも inputMode='pc'＝デスクトップ Chromium・マウス）。画面は PC 1440×1100。
// K27 だけは本物のスマホ（webkit・390×844・指）で、足した写真と明るさが正しく見えること・空枠の見た目が前と同じことを見る。
import { chromium, webkit } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground18_single.html";
const OUT = path.join(here, "..", "..", "..", "refs/compare/layout/playground18"); fs.mkdirSync(OUT, { recursive: true });
const IMGDIR = path.join(here, "testimg");
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;
const pause = (p, ms = 150) => p.waitForTimeout(ms);
const geom = (p) => p.evaluate(() => window.__playground.geometry());
const photos = (p) => p.evaluate(() => window.__playground.photos());
const warns = (p) => p.evaluate(() => window.__playground.warnings());
const ops = (p) => p.evaluate(() => window.__playground.ops());
const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const select = (p, ids) => p.evaluate((ids) => window.__playground.select(ids), ids);
const pget = async (p, part) => (await photos(p)).find((x) => x.part === part);
async function scaleOf(p, dw) { const w = await p.evaluate(() => { const el = document.querySelector("#host_feature #sec"); return el ? el.getBoundingClientRect().width : 0; }); return w / dw; }
const isSel = (p, id) => p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) return e.classList.contains("mark-sel"); } return false; }, id);
const inEditDom = (p) => p.evaluate(() => !!document.querySelector('[contenteditable="true"]'));
async function shot(p, name) { await p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }).catch(() => {}); }
async function full(p, name) { await p.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }).catch(() => {}); }
const DW = { pc: 1440, sp: 390 };
// 部品の画面上の矩形・中心
async function rectOf(p, id) { return p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const el = h.querySelector('[data-el="' + id + '"]'); if (el) { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; } } return null; }, id); }
async function center(p, id) { const r = await rectOf(p, id); return r ? { x: r.left + r.w / 2, y: r.top + r.h / 2 } : null; }
// 見えている部分の真ん中（枠×ビューポート）
async function visCenter(p, id) { return p.evaluate((id) => { let el = null; for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) { el = e; break; } } if (!el) return null; const r = el.getBoundingClientRect(); const x0 = Math.max(r.left, 0), y0 = Math.max(r.top, 0), x1 = Math.min(r.right, window.innerWidth), y1 = Math.min(r.bottom, window.innerHeight); return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }; }, id); }
async function pcBtn(p) { return p.evaluate(() => { const b = document.getElementById("photoChangeBtn"); if (!b || b.style.display === "none") return { present: false }; const r = b.getBoundingClientRect(); return { present: true, cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: r.height, text: b.textContent }; }); }
async function brightToolShown(p) { return p.evaluate(() => { const t = document.getElementById("photoTools"); return !!t && t.style.display !== "none"; }); }
const clickAt = async (p, x, y) => { await p.mouse.click(Math.round(x), Math.round(y)); await pause(p, 120); };
async function clickEl(p, id) { const c = await center(p, id); await clickAt(p, c.x, c.y); }
async function pressDrag(p, x, y, dx, dy) { if (!isFinite(x) || !isFinite(y)) return false; await p.mouse.move(Math.round(x), Math.round(y)); await p.mouse.down(); await p.mouse.move(Math.round(x + dx / 2), Math.round(y + dy / 2), { steps: 3 }); await p.mouse.move(Math.round(x + dx), Math.round(y + dy), { steps: 3 }); await p.mouse.up(); await pause(p, 150); return true; }
// reset だけでは regImgTap（ダブルタップ判定）の直近タップが消えないので、マウスを離して 350ms 窓を越える
async function freshK(p, device) { await reset(p); await setDevice(p, device); await p.evaluate(() => window.scrollTo(0, 0)); await p.mouse.move(2, 2); await pause(p, 420); }
async function rightClick(p, id) { await scrollInto(p, id); await pause(p, 150); const c = await center(p, id); await p.mouse.click(Math.round(c.x), Math.round(c.y), { button: "right" }); await pause(p, 120); }
async function clickElV(p, id) { await scrollInto(p, id); await pause(p, 180); const c = await center(p, id); await clickAt(p, c.x, c.y); }
const clickMenu = (p, label) => p.evaluate((lbl) => { const b = [...document.querySelectorAll("#fmenu button")].find((x) => x.textContent === lbl); if (b) { b.click(); return true; } return false; }, label);
const scrollInto = (p, id) => p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) { e.scrollIntoView({ block: "center" }); return; } } }, id);
async function pickFrom(p, doClick, name) { try { const [ch] = await Promise.all([p.waitForEvent("filechooser", { timeout: 8000 }), doClick()]); await ch.setFiles(path.join(IMGDIR, name)); await pause(p, 450); return true; } catch (e) { return false; } }
// 写真を変えるボタンを1回クリック→ファイルを選ぶ（260ms 後にピッカー）
async function changeThenPick(p, name) { const b = await pcBtn(p); if (!b.present) return false; return pickFrom(p, () => p.mouse.click(Math.round(b.cx), Math.round(b.cy)), name); }
// 「写真」ツール→足す
async function addPhotoToolbar(p, name) { return pickFrom(p, () => p.click("#tPhoto"), name); }
// 空枠をクリック→ファイルを選ぶ（枠を画面内に入れてから）
async function chooseEmptyFile(p, id, name, off) { await scrollInto(p, id); await pause(p, 200); const r = await rectOf(p, id); const x = r.left + r.w / 2 + (off ? off.dx : 0), y = r.top + r.h / 2 + (off ? off.dy : 0); return pickFrom(p, () => p.mouse.click(Math.round(x), Math.round(y)), name); }
const hasChoose = (p, id) => p.evaluate((id) => { let el = null; for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) { el = e; break; } } if (!el) return { present: false }; const btn = el.querySelector("[data-photo-choose]"); const hint = el.querySelector(".photo-choose-hint"); return { present: !!btn, hint: hint ? hint.textContent : null, oldText: /写真を入れて/.test(el.textContent) }; }, id);
function fileData(name) { const buf = fs.readFileSync(path.join(IMGDIR, name)); return { b64: buf.toString("base64"), type: name.endsWith(".png") ? "image/png" : "image/jpeg", name }; }

async function runK(device, report) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  const K = (t) => `${t}-${device}`;
  await freshK(p, device);
  const base = await geom(p);
  const sameFrame = (g, id) => g[id] && base[id] && near(g[id].x, base[id].x, 0.5) && near(g[id].y, base[id].y, 0.5) && near(g[id].w, base[id].w, 0.5) && near(g[id].h, base[id].h, 0.5);
  const scale = await scaleOf(p, DW[device]);

  // K1：F_p0 をクリック→写真を変えるボタンが真ん中に
  await clickEl(p, "F_p0"); await pause(p, 450);
  { const b = await pcBtn(p); const vc = await visCenter(p, "F_p0"); await shot(p, `K1-${device}.jpg`);
    report[K("K1")] = { present: b.present, text: (b.text || "").trim(), h36: b.h >= 36, centeredX: b.present && near(b.cx, vc.x, 2), centeredY: b.present && near(b.cy, vc.y, 2) }; }

  // K2：写真を変える→wide.jpg（差し替え・枠不変・見せる範囲は真ん中1倍）
  { const fr0 = await rectOf(p, "F_p0"); await changeThenPick(p, "wide.jpg"); const g = await geom(p); const fp = await pget(p, "F_p0"); const fr1 = await rectOf(p, "F_p0");
    report[K("K2")] = { assetChanged: !!fp.asset && fp.asset.startsWith("img_"), frameSame: near(fr0.left, fr1.left, 0.6) && near(fr0.w, fr1.w, 0.6), viewCenter1: near(fp.view.x, 0.5) && near(fp.view.y, 0.5) && near(fp.view.zoom, 1) }; }

  // K3：写真を変えるボタンから右60ドラッグ→写真が動く・ピッカーは開かない
  { await freshK(p, device); await clickEl(p, "F_p0"); await pause(p, 450);
    const g0 = await geom(p); const b = await pcBtn(p); let picker = false; p.once("filechooser", () => picker = true);
    await pressDrag(p, b.cx, b.cy, 60 * scale, 0); const g1 = await geom(p); await pause(p, 200);
    report[K("K3")] = { movedX: +(g1.F_p0.x - g0.F_p0.x).toFixed(1), moved60: near(g1.F_p0.x - g0.F_p0.x, 60, 1.5), noPicker: !picker }; }

  // K4：品の並び→わらび餅の写真→写真を変える→tall.jpg（わらび餅だけ）
  { await freshK(p, device);
    await clickElV(p, "I_cards"); await pause(p, 150); await clickElV(p, "card_photo_c_warabi"); await pause(p, 450);
    const b = await pcBtn(p); let ok = false; if (b.present) { await changeThenPick(p, "tall.jpg"); ok = true; }
    const ph = await photos(p); const w = ph.find((x) => x.part === "card_photo_c_warabi"); const others = ph.filter((x) => x.part !== "card_photo_c_warabi" && /card_photo/.test(x.part));
    report[K("K4")] = { btn: b.present, warabiChanged: !!(w && w.asset && w.asset.startsWith("img_")), othersUnchanged: others.every((o) => !o.asset || !o.asset.startsWith("img_")) }; }

  // K5：F_p1 を右クリック→写真を外す→選びを外す→写真を選ぶボタン（選んでいなくても）
  { await freshK(p, device);
    await rightClick(p, "F_p1"); await clickMenu(p, "写真を外す"); await pause(p, 150);
    await clickAt(p, 5, 5); await pause(p, 150);
    const c = await hasChoose(p, "F_p1"); await shot(p, `K5-${device}.jpg`);
    report[K("K5")] = { choose: c.present, hint: c.hint, noOldText: !c.oldText }; }

  // K6：空枠の中（真ん中から左上100）を押して離す→wide.jpg（入る）
  { await chooseEmptyFile(p, "F_p1", "wide.jpg", { dx: -70, dy: -70 }); const fp = await pget(p, "F_p1");
    report[K("K6")] = { filled: !!fp.asset && fp.asset.startsWith("img_"), notCleared: !fp.cleared }; }

  // K7：F_p1 を外し、空枠を下へ50ドラッグ→枠が動く・ピッカー開かない
  { await freshK(p, device);
    await rightClick(p, "F_p1"); await clickMenu(p, "写真を外す"); await pause(p, 150); await clickAt(p, 5, 5); await pause(p, 120);
    await scrollInto(p, "F_p1"); await pause(p, 250);
    const g0 = await geom(p); const r = await rectOf(p, "F_p1"); let picker = false; p.once("filechooser", () => picker = true);
    await p.keyboard.down("Alt"); await pressDrag(p, r.left + r.w / 2, r.top + r.h / 2, 0, 50 * scale); await p.keyboard.up("Alt"); const g1 = await geom(p); await pause(p, 150);   // Alt＝吸い付きなし（ちょうど50）
    report[K("K7")] = { movedY: +(g1.F_p1.y - g0.F_p1.y).toFixed(1), moved50: near(g1.F_p1.y - g0.F_p1.y, 50, 1.5), noPicker: !picker }; }

  // K8：特集を足し、その1枚目の空枠を押して離す→wide.jpg（missing が false に）
  { await freshK(p, device);
    await p.evaluate(() => window.__playground.runPreset("C6")); await pause(p, 250);   // 特集を pos1 に足す（＝sec?）
    const added = (await photos(p)).find((x) => x.missing && /F_p0/.test(x.part));
    let ok = false, miss0 = false; if (added) { miss0 = true; await chooseEmptyFile(p, added.part, "wide.jpg"); const after = (await photos(p)).find((x) => x.part === added.part); ok = after && !after.missing && !!after.asset; }
    report[K("K8")] = { hadMissing: miss0, filled: ok }; }

  // K9：F_b0 を縦の真ん中へスクロール→「写真」→wide.jpg（中身の幅の半分・足した写真・真ん中・選択・他不変）
  { await freshK(p, device);
    await p.evaluate(() => { const el = [...document.querySelectorAll("[data-el=F_b0]")][0]; const r = el.getBoundingClientRect(); window.scrollBy(0, r.top + r.height / 2 - window.innerHeight / 2); }); await pause(p, 200);
    const before = await geom(p);
    await addPhotoToolbar(p, "wide.jpg");
    const ph = await photos(p); const added = ph.find((x) => x.added); const g = await geom(p);
    const tb = await p.evaluate(() => document.getElementById("toolbar").getBoundingClientRect().bottom);
    const vy = (tb + 1100) / 2;
    const r = added ? await rectOf(p, added.part) : null;
    const contentHalf = device === "pc" ? Math.floor(1326 / 2) : 351;
    const selected = added ? await isSel(p, added.part) : false;
    const othersSame = sameFrame(g, "F_h0") && sameFrame(g, "F_b0") && sameFrame(g, "F_p0");
    await shot(p, `K9-${device}.jpg`);
    report[K("K9")] = added ? {
      added: true, width: Math.round(g[added.part].w), widthHalf: near(g[added.part].w, contentHalf, 1),
      ratioOK: near(g[added.part].h, g[added.part].w * 600 / 1600, 2),
      centerXContent: near(g[added.part].x + g[added.part].w / 2, DW[device] / 2, 1.5),
      centerYVisible: r ? near(r.top + r.h / 2, vy, 3) : false, selected, othersSame
    } : { added: false };
    report["_k9state_" + device] = { addedPart: added ? added.part : null }; }

  // K10：K9 の後、もう一方の端末（付いていく先の下＝間隔16。ただし 11.4 により重なれば自分が下がる＝gap≥16）・左端そろえ・重なりなし
  { const other = device === "pc" ? "sp" : "pc"; await setDevice(p, other); await pause(p, 250);
    const ph = await photos(p); const added = ph.find((x) => x.added); const g = await geom(p); const w = await warns(p);
    let belowAnchor = null, gap = null, leftAligned = null, inContent = null;
    if (added) { const an = await p.evaluate((id) => { const a = window.__playground.anchors().find((x) => x.part === id); return a || null; }, added.part);
      if (an && an.anchor && g[an.anchor]) { gap = +(g[added.part].y - (g[an.anchor].y + g[an.anchor].h)).toFixed(1); belowAnchor = gap >= 15.5; leftAligned = near(g[added.part].x, g[an.anchor].x, 1.5); }
      const CW = other === "pc" ? 1326 : 351; const cR = (DW[other] + CW) / 2; inContent = g[added.part].x + g[added.part].w <= cR + 1; }
    report[K("K10")] = added ? { present: true, belowAnchor, gap, leftAligned, inContent, overlapsEmpty: w.overlaps.length === 0 } : { present: false };
    await setDevice(p, device); await pause(p, 150); }

  // K11：足した写真を左200下80→戻す2・やり直す2
  { await freshK(p, device); await addPhotoToolbar(p, "wide.jpg");
    const ph = await photos(p); const added = ph.find((x) => x.added); const g0 = await geom(p);
    const c = await center(p, added.part); await pressDrag(p, c.x, c.y, -200 * scale, 80 * scale); const g1 = await geom(p);
    await p.click("#tUndo"); await pause(p, 150); const gU1 = await geom(p);  // 動く前
    await p.click("#tUndo"); await pause(p, 150); const afterU2 = (await photos(p)).find((x) => x.added);  // 無くなる
    await p.click("#tRedo"); await pause(p, 150); await p.click("#tRedo"); await pause(p, 150); const gR = await geom(p);
    report[K("K11")] = { moved: near(g1[added.part].x - g0[added.part].x, -200, 3), undo1Back: gU1[added.part] && near(gU1[added.part].x, g0[added.part].x, 2), undo2Gone: !afterU2, redoBack: gR[added.part] && near(gR[added.part].x, g1[added.part].x, 3) }; }

  // K12：写真→tall.jpg（枠が 4:5）
  { await freshK(p, device); await addPhotoToolbar(p, "tall.jpg");
    const added = (await photos(p)).find((x) => x.added); const g = await geom(p); const e = g[added.part];
    report[K("K12")] = { ratio45: near(e.h / e.w, 1.25, 0.03), h: Math.round(e.h), w: Math.round(e.w) }; }

  // K13：wide を特集の左の余白（部品のない所）に落とす→真ん中が落とした位置（中身の端で寄せ）
  { await freshK(p, device); await p.evaluate(() => window.scrollTo(0, 0)); await pause(p, 300);
    const designDropY = 160, designDropX = 20;   // 特集の左の余白（設計座標。計測も設計座標＝ツールバーの伸縮に影響されない）
    const ref = await p.evaluate(() => { const s = document.querySelector("#host_feature #sec"); const r = s.getBoundingClientRect(); return { top: r.top, left: r.left }; });
    const dropX = ref.left + designDropX * scale, dropY = ref.top + designDropY * scale;
    const f = fileData("wide.jpg");
    await p.evaluate(({ f, x, y }) => { const bin = atob(f.b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const file = new File([arr], f.name, { type: f.type }); const dt = new DataTransfer(); dt.items.add(file); const st = document.getElementById("stage"); const o = { clientX: x, clientY: y, bubbles: true, cancelable: true, dataTransfer: dt }; st.dispatchEvent(new DragEvent("dragover", o)); st.dispatchEvent(new DragEvent("drop", o)); }, { f, x: dropX, y: dropY });
    await pause(p, 500); const added = (await photos(p)).find((x) => x.added); await shot(p, `K13-${device}.jpg`);
    let dyDelta = null, cxEdge = null; if (added) { const g = await geom(p); const e = g[added.part]; dyDelta = +(e.y + e.h / 2 - designDropY).toFixed(1); const CW = device === "pc" ? 1326 : 351; const cL = (DW[device] - CW) / 2; cxEdge = near(e.x, cL, 1.5); }   // 中身の左端で寄せ
    report[K("K13")] = { added: !!added, centerYDelta: dyDelta, centerYAtDrop: dyDelta != null && Math.abs(dyDelta) <= 3, clampedToContentLeft: cxEdge }; }

  // K14：見出しに画像を貼り付け→新しい写真／F_p0 に貼り付け→差し替え
  { await freshK(p, device);
    const f = fileData("wide.jpg");
    await select(p, ["F_h0"]); await pause(p, 80);
    await p.evaluate(({ f }) => { const bin = atob(f.b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const file = new File([arr], f.name, { type: f.type }); const dt = new DataTransfer(); dt.items.add(file); window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, { f });
    await pause(p, 500); const added1 = (await photos(p)).filter((x) => x.added).length;
    const f2 = fileData("tall.jpg"); await select(p, ["F_p0"]); await pause(p, 80);
    await p.evaluate(({ f }) => { const bin = atob(f.b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const file = new File([arr], f.name, { type: f.type }); const dt = new DataTransfer(); dt.items.add(file); window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, { f: f2 });
    await pause(p, 500); const added2 = (await photos(p)).filter((x) => x.added).length; const fp = await pget(p, "F_p0");
    report[K("K14")] = { pasteHeadingAdds: added1 === 1, pastePhotoReplaces: added2 === 1 && !!fp.asset && fp.asset.startsWith("img_") }; }

  // K15：K9 の後、足した写真を右クリック→消す→もう一方の端末でも消えている
  { await freshK(p, device); await addPhotoToolbar(p, "wide.jpg");
    const added = (await photos(p)).find((x) => x.added); await rightClick(p, added.part); await clickMenu(p, "消す"); await pause(p, 150);
    const here = (await photos(p)).some((x) => x.added); const other = device === "pc" ? "sp" : "pc"; await setDevice(p, other); await pause(p, 150); const there = (await photos(p)).some((x) => x.added); await setDevice(p, device);
    report[K("K15")] = { goneHere: !here, goneOther: !there }; }

  // K16：K11 の動かした後で「このページを元に戻す」→足った写真は残り、自動の位置（付いていく先の下・左端そろえ）に戻る
  { await freshK(p, device); await addPhotoToolbar(p, "wide.jpg");
    const added = (await photos(p)).find((x) => x.added); const c = await center(p, added.part); await pressDrag(p, c.x, c.y, -200 * scale, 80 * scale); const gMoved = await geom(p);
    await p.click("#tResetPage"); await pause(p, 200); const stillHere = (await photos(p)).some((x) => x.part === added.part); const g = await geom(p);
    const an = await p.evaluate((id) => window.__playground.anchors().find((x) => x.part === id) || null, added.part);
    const reverted = gMoved[added.part] && g[added.part] ? !near(g[added.part].x, gMoved[added.part].x, 5) : null;   // 動かした位置から戻った
    const belowAnchor = an && g[an.anchor] && g[added.part] ? g[added.part].y > g[an.anchor].y + g[an.anchor].h : null;
    const leftAligned = an && g[an.anchor] && g[added.part] ? near(g[added.part].x, g[an.anchor].x, 2) : null;
    report[K("K16")] = { stays: stillHere, revertedFromMove: reverted, belowAnchor, leftAligned }; }

  // K17：テキスト→「新しい文」→Esc（真ん中・書き換えに入る・打った文字で置換・他不変）
  { await freshK(p, device); const before = await geom(p);
    await p.click("#tText"); await pause(p, 250);
    const inEdit = await inEditDom(p);
    await p.keyboard.type("新しい文"); await pause(p, 120); await p.keyboard.press("Escape"); await pause(p, 200);
    const g = await geom(p); const addedTxt = Object.keys(g).filter((k) => /^add_/.test(k)); const txt = addedTxt.length ? await p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) return e.textContent; } return null; }, addedTxt[0]) : null;
    const othersSame = sameFrame(g, "F_h0") && sameFrame(g, "F_b0") && sameFrame(g, "F_p0");
    await shot(p, `K17-${device}.jpg`);
    report[K("K17")] = { inEdit, box: addedTxt.length === 1, text: txt, replaced: txt === "新しい文", othersSame }; }

  // K18：テキスト→何も打たず Backspace→Esc（箱が無い・ops が増えない）
  { await freshK(p, device); const nOps0 = (await ops(p)).length;
    await p.click("#tText"); await pause(p, 250); await p.keyboard.press("Backspace"); await pause(p, 100); await p.keyboard.press("Escape"); await pause(p, 200);
    const g = await geom(p); const addedTxt = Object.keys(g).filter((k) => /^add_/.test(k)); const nOps1 = (await ops(p)).length;
    report[K("K18")] = { noBox: addedTxt.length === 0, opsSame: nOps1 === nOps0, nOps0, nOps1 }; }

  await browser.close(); return errs;
}

// 明るさ（K19〜K26）は PC の配置で
async function runBright(report) {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  await freshK(p, "pc");
  const fresh = () => freshK(p, "pc");
  const openBright = async () => { if (!(await brightToolShown(p))) return false; await p.click("#tBright"); await pause(p, 150); return true; };
  const swatch = (v) => `#brightPop [data-bright="${v}"]`;
  const tapPhoto = async (id) => { await p.mouse.move(2, 2); await pause(p, 400); await clickEl(p, id); await pause(p, 450); };

  // K19：F_p0→明るさ→+20%に乗せる（仮表示）→外へ→+20%を押す
  { await clickEl(p, "F_p0"); await pause(p, 450); await openBright(p);
    await p.hover(swatch(20)); await pause(p, 150);
    const filterHover = await p.evaluate(() => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="F_p0"]'); if (e) return e.style.filter; } return ""; });
    const brightDuringHover = (await pget(p, "F_p0")).brightness;
    await shot(p, "K19-hover.jpg");
    await p.mouse.move(5, 5); await pause(p, 150);
    const filterAfterOut = await p.evaluate(() => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="F_p0"]'); if (e) return e.style.filter; } return ""; });
    await p.hover(swatch(20)); await pause(p, 80); await p.click(swatch(20)); await pause(p, 200);
    const b = (await pget(p, "F_p0")).brightness; const popOpen = await p.evaluate(() => document.getElementById("brightPop").classList.contains("on"));
    report["K19"] = { hoverFilter: /brightness\(1\.2\)/.test(filterHover), brightStays0OnHover: brightDuringHover === 0, restoredOnOut: filterAfterOut === "" || filterAfterOut === "none", committed20: b === 20, popClosed: !popOpen }; }

  // K20：端末を変えても20／このページを元に戻す→20／戻す2回（20→0）
  { await setDevice(p, "sp"); await pause(p, 150); const b1 = (await pget(p, "F_p0")).brightness; await setDevice(p, "pc"); await pause(p, 120);
    await p.click("#tResetPage"); await pause(p, 200); const b2 = (await pget(p, "F_p0")).brightness;
    await p.click("#tUndo"); await pause(p, 150); const b3 = (await pget(p, "F_p0")).brightness; await p.click("#tUndo"); await pause(p, 150); const b4 = (await pget(p, "F_p0")).brightness;
    report["K20"] = { otherDevice20: b1 === 20, afterPageReset20: b2 === 20, undo1_20: b3 === 20, undo2_0: b4 === 0 }; }

  // K21：F_p0 を写真を変える→wide → brightness 0
  { await fresh(); await clickEl(p, "F_p0"); await pause(p, 450); await openBright(p); await p.click(swatch(20)); await pause(p, 150);
    await tapPhoto("F_p0"); await changeThenPick(p, "wide.jpg"); const b = (await pget(p, "F_p0")).brightness;
    report["K21"] = { brightness0: b === 0 }; }

  // K22：F_p0 明るさ20→写真を外す→写真を戻す → brightness 20
  { await fresh(); await clickEl(p, "F_p0"); await pause(p, 450); await openBright(p); await p.click(swatch(20)); await pause(p, 150);
    await rightClick(p, "F_p0"); await clickMenu(p, "写真を外す"); await pause(p, 150); await rightClick(p, "F_p0"); await clickMenu(p, "写真を戻す"); await pause(p, 150);
    const b = (await pget(p, "F_p0")).brightness; report["K22"] = { brightness20: b === 20 }; }

  // K23：わらび餅の写真→明るさ-20（わらび餅だけ）
  { await fresh(); await clickElV(p, "I_cards"); await pause(p, 150); await clickElV(p, "card_photo_c_warabi"); await pause(p, 450);
    if (await brightToolShown(p)) { await openBright(p); await p.click(swatch(-20)); await pause(p, 150); }
    const ph = await photos(p); const w = ph.find((x) => x.part === "card_photo_c_warabi"); const others = ph.filter((x) => /card_photo/.test(x.part) && x.part !== "card_photo_c_warabi");
    report["K23"] = { warabiMinus20: w && w.brightness === -20, others0: others.every((o) => o.brightness === 0) }; }

  // K24：何も選ばない／見出し／2枚／外した枠 → 明るさ▾ が出ない
  { await fresh();
    await clickAt(p, 5, 5); const none = await brightToolShown(p);
    await clickEl(p, "F_h0"); await pause(p, 120); const head = await brightToolShown(p);
    await select(p, ["F_p0", "F_p1"]); await pause(p, 150); const two = await brightToolShown(p);
    await fresh(); await rightClick(p, "F_p0"); await clickMenu(p, "写真を外す"); await pause(p, 120); await clickEl(p, "F_p0"); await pause(p, 150); const cleared = await brightToolShown(p);
    report["K24"] = { none: !none, head: !head, two: !two, cleared: !cleared }; }

  // K25：F_p0→明るさ→Esc（閉じる・brightness 不変）
  { await fresh(); await clickEl(p, "F_p0"); await pause(p, 450); await openBright(p);
    await p.keyboard.press("Escape"); await pause(p, 150); const popOpen = await p.evaluate(() => document.getElementById("brightPop").classList.contains("on")); const b = (await pget(p, "F_p0")).brightness;
    report["K25"] = { closed: !popOpen, unchanged: b === 0 }; }

  // K26：F_p0 をダブルクリック→見せる範囲（ボタン出ない）／Esc／押して右80ドラッグ中（ボタン出ない）
  { await fresh();
    const c = await center(p, "F_p0"); await p.mouse.dblclick(Math.round(c.x), Math.round(c.y)); await pause(p, 300);
    const cropping = await p.evaluate(() => window.__playground.cropState() != null); const bDuringCrop = await pcBtn(p);
    await p.keyboard.press("Escape"); await pause(p, 200);
    // 押して右80ドラッグ中にボタンが出ないこと
    await clickEl(p, "F_p0"); await pause(p, 450); const c2 = await center(p, "F_p0"); const sc = await scaleOf(p, 1440);
    await p.mouse.move(Math.round(c2.x), Math.round(c2.y)); await p.mouse.down(); await p.mouse.move(Math.round(c2.x + 80 * sc / 2), Math.round(c2.y), { steps: 2 }); await p.mouse.move(Math.round(c2.x + 80 * sc), Math.round(c2.y), { steps: 2 });
    const bDuringDrag = await pcBtn(p); await p.mouse.up(); await pause(p, 150);
    report["K26"] = { enteredCrop: cropping, noBtnInCrop: !bDuringCrop.present, noBtnInDrag: !bDuringDrag.present }; }

  await browser.close(); return errs;
}

// K27：本物のスマホ（webkit）で、足した写真と明るさが見える・空枠の見た目が前と同じ
async function runK27(report) {
  const browser = await webkit.launch(); const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  await pause(p, 300);
  const mode = await p.evaluate(() => window.__playground.inputMode());
  // 足した写真＋明るさを（PC 相当の入口で）作っておき、スマホの配置で見えるか
  await p.evaluate(async () => { await window.__playground.runPreset("K27"); });
  await pause(p, 500);
  const ph = await p.evaluate(() => window.__playground.photos());
  const added = ph.find((x) => x.added); const bright = ph.find((x) => x.brightness);
  const addedVisible = added ? await p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) { const r = e.getBoundingClientRect(); return r.width > 0 && !!e.style.backgroundImage; } } return false; }, added.part) : false;
  const brightFilter = bright ? await p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) return e.style.filter; } return ""; }, bright.part) : "";
  // 空枠の見た目：スマホでは「写真を選ぶ」を入れない（has-choose が付かない）。K5＝F_p1 を外す＝空枠
  await p.evaluate(() => window.__playground.runPreset("K5"));
  await pause(p, 350);
  const hasChooseOnPhone = await p.evaluate(() => [...document.querySelectorAll('#stage [data-kind="photo"]')].some((e) => e.querySelector("[data-photo-choose]")));
  await full(p, "K27-phone.jpg");
  report["K27"] = { inputMode: mode, addedVisible, brightFilterApplied: /brightness/.test(brightFilter), phoneNoChooseButton: !hasChooseOnPhone };
  await browser.close(); return errs;
}

const report = {}; const allErrs = [];
for (const d of ["pc", "sp"]) { allErrs.push(...await runK(d, report)); }
allErrs.push(...await runBright(report));
allErrs.push(...await runK27(report));
fs.writeFileSync(path.join(here, "_verify_k.json"), JSON.stringify(report, null, 2));
console.log("=== 試験台17 K1〜K27 ===");
for (const k of Object.keys(report)) if (!k.startsWith("_")) console.log(k + ": " + JSON.stringify(report[k]));
if (allErrs.length) console.log("ERRORS:", allErrs.slice(0, 10));
