// playground10：P1〜P16（写真の差し替え・見せる範囲）。playground11_single.html に本物のマウス・キーボードを与える。
// 作業票 §5 の仕方：ファイルを選ぶ＝filechooser に渡す／落とす・貼り付ける＝写真の枠に File 付きの drop・paste を送る。
// P1→P16 は続けて（間でリセットしない）1 セッションで流す。各行は作業票の操作どおり。判定はしない（実測値を出す）。
import { chromium, webkit } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + path.resolve("refs/compare/layout/playground11_single.html");
const OUT = path.resolve("refs/compare/layout/playground11"); fs.mkdirSync(OUT, { recursive: true });
const IMGDIR = path.join(here, "testimg");
const DW = { pc: 1440, sp: 390 };
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;
const pause = (p, ms = 120) => p.waitForTimeout(ms);

const geom = (p) => p.evaluate(() => window.__playground.geometry());
const photos = (p) => p.evaluate(() => window.__playground.photos());
const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const select = (p, ids) => p.evaluate((ids) => window.__playground.select(ids), ids);
const secOf = (id) => (id.startsWith("F_") ? "feature" : "items");
async function secInfo(p, sec, dw) { return p.evaluate((s) => { const el = document.querySelector("#host_" + s + " #sec"); const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width }; }, sec); }
async function scaleOf(p, sec, dw) { const si = await secInfo(p, sec, dw); return si.w / dw; }
async function center(p, id) { return p.evaluate((id) => { for (const h of ["host_feature", "host_items"]) { const el = document.querySelector("#" + h + ' [data-el="' + id + '"]'); if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } } return null; }, id); }
const pget = async (p, part) => (await photos(p)).find((x) => x.part === part);
async function shot(p, name) { await p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }); }
function fileData(name) { const buf = fs.readFileSync(path.join(IMGDIR, name)); return { b64: buf.toString("base64"), type: name.endsWith(".png") ? "image/png" : name.endsWith(".txt") ? "text/plain" : "image/jpeg", name }; }

// 右クリック→浮遊メニュー→ラベルのボタンを押す
async function rightClick(p, id) { const c = await center(p, id); await p.mouse.click(Math.round(c.x), Math.round(c.y), { button: "right" }); await pause(p, 120); }
const clickMenu = (p, label) => p.evaluate((lbl) => { const b = [...document.querySelectorAll("#fmenu button")].find((x) => x.textContent === lbl); if (b) { b.click(); return true; } return false; }, label);
// 差し替える（ファイルを選ぶ画面＝filechooser に渡す）
async function replaceViaPicker(p, id, name) {
  await rightClick(p, id);
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), clickMenu(p, "写真を差し替える")]);
  await chooser.setFiles(path.join(IMGDIR, name)); await pause(p, 300);
}
// 落とす（枠に File 付きの dragover・drop を送る）
async function dropOn(p, id, name) {
  const f = fileData(name);
  await p.evaluate(({ id, f }) => { const bin = atob(f.b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const file = new File([arr], f.name, { type: f.type }); const el = document.querySelector('[data-el="' + id + '"]'); const dt = new DataTransfer(); dt.items.add(file); el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true })); el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); }, { id, f });
  await pause(p, 300);
}
// 貼り付ける（写真を選び、window に File 付きの paste を送る）
async function pasteOn(p, id, name) {
  await select(p, [id]); await pause(p, 60);
  const f = fileData(name);
  await p.evaluate(({ f }) => { const bin = atob(f.b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const file = new File([arr], f.name, { type: f.type }); const dt = new DataTransfer(); dt.items.add(file); window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, { f });
  await pause(p, 300);
}
// 見せる範囲：ダブルクリックで入る
async function cropEnter(p, id) { const c = await center(p, id); await p.mouse.dblclick(Math.round(c.x), Math.round(c.y)); await pause(p, 180); }
// 画像をドラッグ（枠の中央から ddx,ddy 設計px）。release 後 commit はしない（Enter/Esc で決める）
async function cropDrag(p, id, ddxDesign, ddyDesign, sc, midShot) {
  const c = await center(p, id); const cx = Math.round(c.x), cy = Math.round(c.y);
  await p.mouse.move(cx, cy); await p.mouse.down();
  await p.mouse.move(cx + Math.round(ddxDesign * sc * 0.5), cy + Math.round(ddyDesign * sc * 0.5), { steps: 3 });
  await p.mouse.move(cx + Math.round(ddxDesign * sc), cy + Math.round(ddyDesign * sc), { steps: 3 });
  if (midShot) await shot(p, midShot);
  await p.mouse.up(); await pause(p, 100);
}
// つまみ（se）を外へドラッグして目標倍率へ（dw0/2 設計px＝2倍の分だけ動かす）
async function cropZoomHandle(p, id, targetZoom, sc) {
  const st = await p.evaluate(() => window.__playground.cropState());
  const dw0 = st.display.dw, z0 = st.view.zoom;
  const ddx = ((targetZoom / z0) - 1) * dw0;               // N2：反対の角を止める＝dw2=dw0+ddx（2倍なら se を dw0 分動かす）
  const h = await p.evaluate(() => { const e = document.querySelector('#cropwrap [data-crop-handle="se"]'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const hx = Math.round(h.x), hy = Math.round(h.y);
  await p.mouse.move(hx, hy); await p.mouse.down();
  await p.mouse.move(hx + Math.round(ddx * sc * 0.5), hy + Math.round(ddx * sc * (st.natH / st.natW) * 0.5), { steps: 3 });
  await p.mouse.move(hx + Math.round(ddx * sc), hy + Math.round(ddx * sc * (st.natH / st.natW)), { steps: 3 });
  await p.mouse.up(); await pause(p, 100);
}
const pressEnter = async (p) => { await p.keyboard.press("Enter"); await pause(p, 150); };
const pressEsc = async (p) => { await p.keyboard.press("Escape"); await pause(p, 150); };
// 枠の近くの色（枠の四隅から内側 oin px の画面ピクセル）。name は赤/緑/青/黄 の判定に使う。
async function cornerColors(p, id) {
  return p.evaluate((id) => {
    let el = null; for (const h of ["host_feature", "host_items"]) { const e = document.querySelector("#" + h + ' [data-el="' + id + '"]'); if (e) { el = e; break; } }
    const r = el.getBoundingClientRect(); const oin = 8;
    const pts = { tl: [r.left + oin, r.top + oin], tr: [r.right - oin, r.top + oin], bl: [r.left + oin, r.bottom - oin], br: [r.right - oin, r.bottom - oin] };
    const cv = document.createElement("canvas"); cv.width = 1; cv.height = 1; const g = cv.getContext("2d");
    // 画面のピクセルは取れないので、背景画像の位置から論理的に当てる代わりに、要素の背景を実測せず色名で近似する
    return null; // 実色は screenshot 目視・verify側では view と素材から判定する
  }, id);
}
// 四分割画像で、view/枠から枠の四隅がどの象限（色）かを求める（赤=TL,緑=TR,青=BL,黄=BR）
function cornerQuadrants(part, view, natW, natH, w, h) {
  const s0 = Math.max(w / natW, h / natH); const dw = natW * s0 * view.zoom, dh = natH * s0 * view.zoom;
  const ox = w / 2 - view.x * dw, oy = h / 2 - view.y * dh;            // 枠座標での画像左上
  const fx = (px) => (px - ox) / dw, fy = (py) => (py - oy) / dh;       // 枠px→画像の割合
  const col = (u, v) => (v < 0.5 ? (u < 0.5 ? "赤" : "緑") : (u < 0.5 ? "青" : "黄"));
  const e = 0.01;
  return { tl: col(fx(0 + e * w), fy(0 + e * h)), tr: col(fx(w - e * w), fy(0 + e * h)), bl: col(fx(0 + e * w), fy(h - e * h)), br: col(fx(w - e * w), fy(h - e * h)) };
}

const report = {};
for (const [device, bt] of [["pc", chromium], ["sp", webkit]]) {
  const dw = DW[device];
  const browser = await bt.launch();
  // 見せる範囲のつまみは画像の四隅＝枠の外にある。横長画像では枠の右外に出るので、つまみが画面に入る広さにする（倍率は 1 のまま）
  const ctx = await browser.newContext({ viewport: { width: device === "pc" ? 1760 : 760, height: 6000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  const K = (t) => `${t}-${device}`;
  await reset(p); await setDevice(p, device); await pause(p, 200);
  const base = await geom(p);
  const sameFrame = (g, id, b) => near(g[id].x, b[id].x, 0.5) && near(g[id].y, b[id].y, 0.5) && near(g[id].w, b[id].w, 0.5) && near(g[id].h, b[id].h, 0.5);
  const scF = await scaleOf(p, "feature", dw);

  // P1：右クリック→写真を差し替える→wide.jpg
  { await shot(p, `P1-before-${device}.jpg`);
    await replaceViaPicker(p, "F_p0", "wide.jpg");
    const g = await geom(p); const fp = await pget(p, "F_p0"); await shot(p, `P1-after-${device}.jpg`);
    const q = fp.asset ? cornerQuadrants("F_p0", fp.view, fp.naturalW, fp.naturalH, g.F_p0.w, g.F_p0.h) : null;
    report[K("P1")] = { frameSame: sameFrame(g, "F_p0", base), assetChanged: fp.asset !== base.__a, asset: (fp.asset || "").slice(0, 12), viewCenter1: near(fp.view.x, 0.5) && near(fp.view.y, 0.5) && near(fp.view.zoom, 1), nat: fp.naturalW + "x" + fp.naturalH, corners: q };
  }
  // P2：特集1を tall.jpg に
  { await shot(p, `P2-before-${device}.jpg`);
    await replaceViaPicker(p, "F_p0", "tall.jpg");
    const g = await geom(p); const fp = await pget(p, "F_p0"); await shot(p, `P2-after-${device}.jpg`);
    const q = cornerQuadrants("F_p0", fp.view, fp.naturalW, fp.naturalH, g.F_p0.w, g.F_p0.h);
    report[K("P2")] = { frameSame: sameFrame(g, "F_p0", base), nat: fp.naturalW + "x" + fp.naturalH, corners: q, fourColors: new Set(Object.values(q)).size === 4 };
  }
  // P3：特集2の枠へ wide.jpg を落とす
  { const b1 = (await geom(p)).F_p1;
    await dropOn(p, "F_p1", "wide.jpg");
    const g = await geom(p); const fp = await pget(p, "F_p1");
    report[K("P3")] = { frameSame: near(g.F_p1.w, b1.w, 0.5) && near(g.F_p1.h, b1.h, 0.5), asset: (fp.asset || "").slice(0, 12), nat: fp.naturalW + "x" + fp.naturalH, viewCenter1: near(fp.view.x, 0.5) && near(fp.view.zoom, 1) };
  }
  // P4：特集1を選び small.png を貼り付け（縮めない＝naturalW 300）
  { await pasteOn(p, "F_p0", "small.png");
    const fp = await pget(p, "F_p0");
    report[K("P4")] = { replaced: fp.naturalW === 300, nat: fp.naturalW + "x" + fp.naturalH };
  }
  // P5：特集1を外す→空枠に wide.jpg
  { await select(p, ["F_p0"]); await rightClick(p, "F_p0"); await clickMenu(p, "写真を外す"); await pause(p, 200);
    const clearedNow = (await pget(p, "F_p0")).cleared; const bw = (await geom(p)).F_p0;
    await replaceViaPicker(p, "F_p0", "wide.jpg");
    const g = await geom(p); const fp = await pget(p, "F_p0");
    report[K("P5")] = { clearedThenFilled: clearedNow === true && fp.cleared === false, frameSameAsBeforeClear: near(g.F_p0.w, bw.w, 0.5) && near(g.F_p0.h, bw.h, 0.5), asset: (fp.asset || "").slice(0, 12) };
  }
  // P6：わらび餅の品の写真に tall.jpg を落とす（その品だけ変わる・品の位置は動かない）
  { const before = await photos(p); const cardsBefore = Object.fromEntries(before.filter((x) => /card_photo/.test(x.part)).map((x) => [x.part, x.asset]));
    const gB = await geom(p);
    await dropOn(p, "card_photo_c_warabi", "tall.jpg");
    const after = await photos(p); const gA = await geom(p);
    const cardsAfter = Object.fromEntries(after.filter((x) => /card_photo/.test(x.part)).map((x) => [x.part, x.asset]));
    const othersSame = Object.keys(cardsBefore).filter((k) => k !== "card_photo_c_warabi").every((k) => cardsBefore[k] === cardsAfter[k]);
    const warabiChanged = cardsBefore["card_photo_c_warabi"] !== cardsAfter["card_photo_c_warabi"];
    const posSame = Object.keys(cardsBefore).every((k) => gA[k] && near(gA[k].y, gB[k].y, 0.5) && near(gA[k].x, gB[k].x, 0.5));
    report[K("P6")] = { warabiChanged, othersSame, posSame, warabiNat: (after.find((x) => x.part === "card_photo_c_warabi").naturalW) + "x" + (after.find((x) => x.part === "card_photo_c_warabi").naturalH) };
  }
  // P7：特集1をダブルクリック→画像を右へ100→Enter（view.x が減る・viewOwn true・枠と周り不変）
  { const b = await geom(p); const fp0 = await pget(p, "F_p0"); await shot(p, `P7-before-${device}.jpg`);
    await cropEnter(p, "F_p0");
    await cropDrag(p, "F_p0", 100, 0, scF, `P7-mid-${device}.jpg`);
    await pressEnter(p);
    const g = await geom(p); const fp = await pget(p, "F_p0"); await shot(p, `P7-after-${device}.jpg`);
    report[K("P7")] = { xDecreased: fp.view.x < fp0.view.x - 1e-4, x: fp.view.x, viewOwn: fp.viewOwn, frameSame: sameFrame(g, "F_p0", base), surroundingStill: near(g.F_h0.y, b.F_h0.y, 0.5) && near(g.F_p1.y, b.F_p1.y, 0.5) };
  }
  // P8：ダブルクリック→右下のつまみを外へ動かして2倍→Enter
  { await shot(p, `P8-before-${device}.jpg`);
    await cropEnter(p, "F_p0");
    await cropZoomHandle(p, "F_p0", 2, scF);
    await pressEnter(p);
    const fp = await pget(p, "F_p0"); await shot(p, `P8-after-${device}.jpg`);
    report[K("P8")] = { zoom2: near(fp.view.zoom, 2, 0.05), zoom: fp.view.zoom };
  }
  // P9：ダブルクリック→右へ5000→Enter（枠の左端で止まる・左上左下が赤青）
  { await shot(p, `P9-before-${device}.jpg`);
    await cropEnter(p, "F_p0");
    await cropDrag(p, "F_p0", 5000, 0, scF);
    await pressEnter(p);
    const g = await geom(p); const fp = await pget(p, "F_p0"); await shot(p, `P9-after-${device}.jpg`);
    // 下限：x = w/(2*dw)
    const s0 = Math.max(g.F_p0.w / fp.naturalW, g.F_p0.h / fp.naturalH); const dwD = fp.naturalW * s0 * fp.view.zoom; const lower = g.F_p0.w / (2 * dwD);
    const q = cornerQuadrants("F_p0", fp.view, fp.naturalW, fp.naturalH, g.F_p0.w, g.F_p0.h);
    report[K("P9")] = { atLowerBound: near(fp.view.x, lower, 0.002), x: fp.view.x, lower: +lower.toFixed(4), leftTopRedBottomBlue: q.tl === "赤" && q.bl === "青", corners: q };
  }
  // P10：P7 の操作を Esc で終える（view が始める前と同じ）
  { const fp0 = await pget(p, "F_p0");
    await cropEnter(p, "F_p0");
    await cropDrag(p, "F_p0", 100, 0, scF);
    await pressEsc(p);
    const fp = await pget(p, "F_p0");
    report[K("P10")] = { viewUnchanged: near(fp.view.x, fp0.view.x, 1e-3) && near(fp.view.y, fp0.view.y, 1e-3) && near(fp.view.zoom, fp0.view.zoom, 1e-3), before: fp0.view, after: fp.view };
  }
  // P13：big.jpg（naturalW 2400・naturalH 1600）
  { await replaceViaPicker(p, "F_p0", "big.jpg"); const fp = await pget(p, "F_p0");
    report[K("P13")] = { nat2400x1600: fp.naturalW === 2400 && fp.naturalH === 1600, nat: fp.naturalW + "x" + fp.naturalH };
  }
  // P14：rotated.jpg（正しい向きで 1200×1600・左上が赤）
  { await replaceViaPicker(p, "F_p0", "rotated.jpg"); const g = await geom(p); const fp = await pget(p, "F_p0");
    const q = cornerQuadrants("F_p0", fp.view, fp.naturalW, fp.naturalH, g.F_p0.w, g.F_p0.h);
    report[K("P14")] = { nat1200x1600: fp.naturalW === 1200 && fp.naturalH === 1600, nat: fp.naturalW + "x" + fp.naturalH, topLeftRed: q.tl === "赤", corners: q };
  }
  // P15：notimage.txt を差し替えに使う（写真は変わらない・短い知らせが出て数秒で消える）
  { const before = await pget(p, "F_p0"); const gB = await geom(p);
    await replaceViaPicker(p, "F_p0", "notimage.txt");
    const toastShown = await p.evaluate(() => !!document.querySelector(".photo-toast") && document.querySelector(".photo-toast").textContent);
    const after = await pget(p, "F_p0"); const gA = await geom(p);
    await pause(p, 2800); const toastGone = await p.evaluate(() => !document.querySelector(".photo-toast"));
    report[K("P15")] = { photoUnchanged: before.asset === after.asset, frameSame: sameFrame(gA, "F_p0", gB), toastShown: toastShown || null, toastGone };
  }
  // P16：写真の大きさを変え（Y7 と同じ se へ-100,-100）→wide.jpg に差し替え→元の位置に戻す
  { await select(p, ["F_p0"]);
    // 大きさを変える（programResize 相当を実操作で：つまみ se を内へ100,100）
    const si = await secInfo(p, "feature", dw); const sc = si.w / dw; await select(p, ["F_p0"]); await pause(p, 80);
    const hc = await p.evaluate(() => { const e = [...document.querySelectorAll('.rz-handle[data-handle-for="F_p0"]')].find((h) => h.getAttribute("data-handle") === "se"); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const hx = Math.round(hc.x), hy = Math.round(hc.y);
    await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx - Math.round(100 * sc * 0.5), hy - Math.round(100 * sc * 0.5), { steps: 3 }); await p.mouse.move(hx - Math.round(100 * sc), hy - Math.round(100 * sc), { steps: 3 }); await p.mouse.up(); await pause(p, 120);
    const gResized = await geom(p); const resizedW = gResized.F_p0.w;
    await replaceViaPicker(p, "F_p0", "wide.jpg");
    const gAfterReplace = await geom(p); const fpAfterReplace = await pget(p, "F_p0");
    const keepsSize = near(gAfterReplace.F_p0.w, resizedW, 1.5);
    await select(p, ["F_p0"]); await p.evaluate((d) => window.__playground.resetScope("part", "F_p0", [d]), device); await pause(p, 150);
    const gReset = await geom(p); const fpReset = await pget(p, "F_p0");
    report[K("P16")] = { resizedSmaller: resizedW < base.F_p0.w - 2, keepsSizeAfterReplace: keepsSize, sizeResetToTemplate: near(gReset.F_p0.w, base.F_p0.w, 1.5), photoStaysWide: fpReset.asset === fpAfterReplace.asset };
  }
  report[K("_errs")] = errs.slice(0, 5);
  await browser.close();
}

// ===== P11：端末をまたぐ（引き継ぎ）。PC で右へ100→Enter。スマホに切替＝引き継ぎ（x,y同じ・zoom1・own false）。
// 続けてスマホで下へ50→Enter。PC に戻すと PC の view はそのまま。chromium 1 枚で app の PC/スマホ切替で確かめる。=====
{
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 6000 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  await reset(p); await setDevice(p, "pc"); await pause(p, 200);
  await replaceViaPicker(p, "F_p0", "wide.jpg");         // 4色の画像にしておく（両端末 view は真ん中）
  await shot(p, "P11-before-pc.jpg");
  const scPC = await scaleOf(p, "feature", 1440);
  await cropEnter(p, "F_p0"); await cropDrag(p, "F_p0", 100, 0, scPC); await pressEnter(p);
  const pcView = (await pget(p, "F_p0")).view; await shot(p, "P11-after-pc.jpg");
  // スマホに切替
  await setDevice(p, "sp"); await pause(p, 200); await shot(p, "P11-before-sp.jpg");
  const spInherit = await pget(p, "F_p0");
  // スマホで下へ50→Enter
  const scSP = await scaleOf(p, "feature", 390);
  await cropEnter(p, "F_p0"); await cropDrag(p, "F_p0", 0, 50, scSP); await pressEnter(p);
  const spView = (await pget(p, "F_p0")).view; const spOwn = (await pget(p, "F_p0")).viewOwn; await shot(p, "P11-after-sp.jpg");
  // PC に戻す
  await setDevice(p, "pc"); await pause(p, 200);
  const pcView2 = (await pget(p, "F_p0")).view;
  report["P11"] = {
    spInheritsX: near(spInherit.view.x, pcView.x, 1e-3), spInheritsY: near(spInherit.view.y, pcView.y, 1e-3),
    spInheritZoom1: near(spInherit.view.zoom, 1, 1e-3), spInheritOwnFalse: spInherit.viewOwn === false,
    spDecidedOwn: spOwn === true, spMovedDown: spView.y > spInherit.view.y + 1e-4,
    pcUnchanged: near(pcView2.x, pcView.x, 1e-3) && near(pcView2.y, pcView.y, 1e-3) && near(pcView2.zoom, pcView.zoom, 1e-3),
    pcView, spInheritView: spInherit.view, spView, pcView2,
  };
  report["P11-_errs"] = errs.slice(0, 5);
  await browser.close();
}

// P12：差し替え(P1)→見せる範囲(P7)→戻す2回・やり直す2回（戻す1回目=見せる範囲が戻る・2回目=写真が元に戻る）
{
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 6000 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  await reset(p); await setDevice(p, "pc"); await pause(p, 200);
  const origAsset = (await pget(p, "F_p0")).asset;
  await replaceViaPicker(p, "F_p0", "wide.jpg");         // P1
  const afterReplace = (await pget(p, "F_p0"));
  const scPC = await scaleOf(p, "feature", 1440);
  await cropEnter(p, "F_p0"); await cropDrag(p, "F_p0", 100, 0, scPC); await pressEnter(p);  // P7
  const afterCrop = (await pget(p, "F_p0"));
  await p.evaluate(() => window.__playground.undo()); await pause(p, 150); const u1 = (await pget(p, "F_p0"));
  await p.evaluate(() => window.__playground.undo()); await pause(p, 150); const u2 = (await pget(p, "F_p0"));
  await p.evaluate(() => window.__playground.redo()); await pause(p, 150); const r1 = (await pget(p, "F_p0"));
  await p.evaluate(() => window.__playground.redo()); await pause(p, 150); const r2 = (await pget(p, "F_p0"));
  report["P12"] = {
    undo1_viewBack: near(u1.view.x, afterReplace.view.x, 1e-3) && u1.asset === afterCrop.asset,
    undo2_photoBack: u2.asset === origAsset,
    redo1_backToReplace: r1.asset === afterReplace.asset && near(r1.view.x, afterReplace.view.x, 1e-3),
    redo2_backToCrop: r2.asset === afterCrop.asset && near(r2.view.x, afterCrop.view.x, 1e-3),
    trace: { origAsset: (origAsset || "").slice(0, 10), afterReplace: (afterReplace.asset || "").slice(0, 10), afterCropX: afterCrop.view.x, u1x: u1.view.x, u2asset: (u2.asset || "").slice(0, 10) },
  };
  report["P12-_errs"] = errs.slice(0, 5);
  await browser.close();
}

fs.writeFileSync(path.join(here, "_verify_p.json"), JSON.stringify(report, null, 2));
console.log("=== P試験（写真の差し替え・見せる範囲）===");
for (const k of Object.keys(report)) if (!k.includes("_errs")) console.log(k + ": " + JSON.stringify(report[k]));
for (const k of Object.keys(report)) if (k.includes("_errs") && report[k].length) console.log(k + " ERRORS: " + JSON.stringify(report[k]));
