// playground11：U1〜U6（元の位置に戻す・見せる範囲の拡大の直し）。本物のマウス・キーボード。画面 PC 1440×1100。
// U1/U2＝大きさだけ変えて「元の位置に戻す」／U3/U4＝角のつまみ（反対の角を止める）／U5＝拡大の横棒／U6＝外す・戻すの出し分け。
import { chromium, webkit } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground18b_single.html";
const OUT = "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground18b"; fs.mkdirSync(OUT, { recursive: true });
const IMGDIR = path.join(here, "testimg");
const DW = { pc: 1440, sp: 390 };
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;
const pause = (p, ms = 120) => p.waitForTimeout(ms);
const geom = (p) => p.evaluate(() => window.__playground.geometry());
const sizes = (p) => p.evaluate(() => window.__playground.sizes());
const photos = (p) => p.evaluate(() => window.__playground.photos());
const cropState = (p) => p.evaluate(() => window.__playground.cropState());
const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const select = (p, ids) => p.evaluate((ids) => window.__playground.select(ids), ids);
const secOf = (id) => (id.startsWith("F_") ? "feature" : "items");
async function secInfo(p, sec, dw) { return p.evaluate((s) => { const el = document.querySelector("#host_" + s + " #sec"); const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width }; }, sec); }
async function scaleOf(p, sec, dw) { const si = await secInfo(p, sec, dw); return si.w / dw; }
async function center(p, id) { return p.evaluate((id) => { for (const h of ["host_feature", "host_items"]) { const el = document.querySelector("#" + h + ' [data-el="' + id + '"]'); if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } } return null; }, id); }
const pget = async (p, part) => (await photos(p)).find((x) => x.part === part);
async function shot(p, name) { await p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }); }
async function rightClick(p, id) { const c = await center(p, id); await p.mouse.click(Math.round(c.x), Math.round(c.y), { button: "right" }); await pause(p, 120); }
const menuLabels = (p) => p.evaluate(() => [...document.querySelectorAll("#fmenu button")].map((b) => b.textContent));
const clickMenu = (p, label) => p.evaluate((lbl) => { const b = [...document.querySelectorAll("#fmenu button")].find((x) => x.textContent === lbl); if (b) { b.click(); return true; } return false; }, label);
async function selectEl(p, id) { await select(p, [id]); await pause(p, 90); }
async function handleCenter(p, id, dir) { return p.evaluate(({ id, dir }) => { const el = [...document.querySelectorAll('.rz-handle[data-handle-for="' + id + '"]')].find((h) => h.getAttribute("data-handle") === dir); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, { id, dir }); }
async function dragHandle(p, id, dir, ddx, ddy, dw) { const si = await secInfo(p, secOf(id), dw); const sc = si.w / dw; await selectEl(p, id); const c = await handleCenter(p, id, dir); if (!c) throw new Error("no rz-handle " + id + " " + dir); const cx = Math.round(c.x), cy = Math.round(c.y); await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + Math.round(ddx * sc * 0.5), cy + Math.round(ddy * sc * 0.5), { steps: 3 }); await p.mouse.move(cx + Math.round(ddx * sc), cy + Math.round(ddy * sc), { steps: 3 }); await p.mouse.up(); await pause(p); }
async function replaceViaPicker(p, id, name) { await rightClick(p, id); const [chooser] = await Promise.all([p.waitForEvent("filechooser"), clickMenu(p, "写真を差し替える")]); await chooser.setFiles(path.join(IMGDIR, name)); await pause(p, 300); }
async function cropEnter(p, id) { const c = await center(p, id); await p.mouse.dblclick(Math.round(c.x), Math.round(c.y)); await pause(p, 180); }
const cropHandle = (p, dir) => p.evaluate((dir) => { const e = document.querySelector('#cropwrap [data-crop-handle="' + dir + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, onscreen: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight }; }, dir);
const pressEnter = async (p) => { await p.keyboard.press("Enter"); await pause(p, 150); };

const report = {};
for (const [device, bt, vw] of [["pc", chromium, 1440], ["sp", webkit, 430]]) {
  const dw = DW[device];
  const browser = await bt.launch();
  const p = await (await browser.newContext({ viewport: { width: vw, height: 1100, }, deviceScaleFactor: 1 })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  const K = (t) => `${t}-${device}`;
  const fresh = async () => { await reset(p); await setDevice(p, device); await pause(p, 150); return geom(p); };

  // U1：本文の右の辺を左へ60 → 右クリック→「元の位置に戻す」。幅が戻り sizes() 空
  { const b = await fresh();
    await dragHandle(p, "F_b0", "e", -60, 0, dw); const gR = await geom(p); const sR = await sizes(p);
    await rightClick(p, "F_b0"); const labels = await menuLabels(p); const has = labels.includes("元の位置に戻す");
    await clickMenu(p, "元の位置に戻す"); await pause(p, 150);
    const g = await geom(p); const s = await sizes(p);
    report[K("U1")] = { resizedNarrower: gR.F_b0.w < b.F_b0.w - 2, menuHasReset: has, widthBackToTemplate: near(g.F_b0.w, b.F_b0.w, 1.5), sizesEmpty: s.length === 0 };
  }
  // U2：写真の右下の角を左上へ60・60 → 右クリック→「元の位置に戻す」
  { const b = await fresh();
    await dragHandle(p, "F_p0", "se", -60, -60, dw); const gR = await geom(p);
    await rightClick(p, "F_p0"); const labels = await menuLabels(p); const has = labels.includes("元の位置に戻す");
    await clickMenu(p, "元の位置に戻す"); await pause(p, 150);
    const g = await geom(p); const s = await sizes(p);
    report[K("U2")] = { resizedSmaller: gR.F_p0.w < b.F_p0.w - 2, menuHasReset: has, sizeBackToTemplate: near(g.F_p0.w, b.F_p0.w, 1.5) && near(g.F_p0.h, b.F_p0.h, 1.5), sizesEmpty: s.length === 0 };
  }
  // U3：wide に差し替え→ダブルクリック→右下のつまみを画像の幅・高さと同じだけ右下へ→Enter。zoom 2・左上(ox,oy)不変
  { await fresh(); await replaceViaPicker(p, "F_p0", "wide.jpg");
    await cropEnter(p, "F_p0"); const st0 = await cropState(p); const h0 = await cropHandle(p, "se");
    const u3 = { seHandleScreenX: h0 ? Math.round(h0.x) : null, seOnScreen: h0 ? h0.onscreen : null, ox0: st0.display.ox, oy0: st0.display.oy };
    if (h0 && h0.onscreen) {
      const si = await secInfo(p, "feature", dw); const sc = si.w / dw; const d = st0.display;
      const hx = Math.round(h0.x), hy = Math.round(h0.y);
      await p.mouse.move(hx, hy); await p.mouse.down();
      await p.mouse.move(hx + Math.round(d.dw * sc * 0.5), hy + Math.round(d.dh * sc * 0.5), { steps: 3 });
      await p.mouse.move(hx + Math.round(d.dw * sc), hy + Math.round(d.dh * sc), { steps: 3 });
      await shot(p, `U3-mid-${device}.jpg`);
      await p.mouse.up(); await pause(p, 100);
      const st1 = await cropState(p); await pressEnter(p); const fp = await pget(p, "F_p0");
      u3.ran = true; u3.zoom = fp.view.zoom; u3.zoom2 = near(fp.view.zoom, 2, 0.05); u3.oxUnchanged = near(st1.display.ox, u3.ox0, 1); u3.oyUnchanged = near(st1.display.oy, u3.oy0, 1);
    } else { u3.ran = false; u3.note = "se つまみが画面外（x=" + u3.seHandleScreenX + "・画面幅" + vw + "）＝1440では実マウスで掴めない（N3）"; await shot(p, `U3-mid-${device}.jpg`); await p.keyboard.press("Escape"); await pause(p, 120); }
    report[K("U3")] = u3;
  }
  // U4：U3 の後、右下のつまみを左上へ画像の半分→Enter。zoom 1・四隅に色・隙間なし
  { await fresh(); await replaceViaPicker(p, "F_p0", "wide.jpg");
    await cropEnter(p, "F_p0"); const h0 = await cropHandle(p, "se"); const u4 = { seOnScreen: h0 ? h0.onscreen : null };
    if (h0 && h0.onscreen) {
      const si = await secInfo(p, "feature", dw); const sc = si.w / dw;
      // まず2倍（U3）
      let st = await cropState(p); let d = st.display; let hx = Math.round(h0.x), hy = Math.round(h0.y);
      await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx + Math.round(d.dw * sc), hy + Math.round(d.dh * sc), { steps: 4 }); await p.mouse.up(); await pause(p, 100);
      // 次に半分戻す
      st = await cropState(p); d = st.display; const h1 = await cropHandle(p, "se"); hx = Math.round(h1.x); hy = Math.round(h1.y);
      await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx - Math.round(d.dw * sc * 0.5), hy - Math.round(d.dh * sc * 0.5), { steps: 4 }); await p.mouse.up(); await pause(p, 100);
      await pressEnter(p); const fp = await pget(p, "F_p0"); const g = await geom(p);
      const s0 = Math.max(g.F_p0.w / fp.naturalW, g.F_p0.h / fp.naturalH); const dwD = fp.naturalW * s0 * fp.view.zoom;
      u4.ran = true; u4.zoom = fp.view.zoom; u4.zoom1 = near(fp.view.zoom, 1, 0.05); u4.coversNoGap = dwD >= g.F_p0.w - 1 && fp.naturalH * s0 * fp.view.zoom >= g.F_p0.h - 1;
    } else { u4.ran = false; u4.note = "se つまみが画面外＝1440では実マウスで掴めない（N3）"; await p.keyboard.press("Escape"); await pause(p, 120); }
    report[K("U4")] = u4;
  }
  // U5：wide に差し替え→拡大の横棒（data-crop-zoom）を動かして3倍→Enter。横棒が画面の中・zoom3・x,y不変
  { await fresh(); await replaceViaPicker(p, "F_p0", "wide.jpg");
    await cropEnter(p, "F_p0"); const st0 = await cropState(p); const v0 = st0.view;
    const barInfo = await p.evaluate(() => { const z = document.getElementById("cropzoom"); const inp = document.querySelector("[data-crop-zoom]"); if (!z || !inp) return null; const r = inp.getBoundingClientRect(); const zr = z.getBoundingClientRect(); return { left: r.left, width: r.width, mid: r.top + r.height / 2, onscreen: zr.left >= 0 && zr.right <= window.innerWidth && zr.top >= 0 && zr.bottom <= window.innerHeight }; });
    // つまみを 3倍の位置へドラッグ（値1→4の 2/3 の所）。range トラックを掴んで動かす。
    const frac = (3 - 1) / (4 - 1); const tx = Math.round(barInfo.left + frac * barInfo.width); const ty = Math.round(barInfo.mid);
    await p.mouse.move(Math.round(barInfo.left + 2), ty); await p.mouse.down(); await p.mouse.move(tx, ty, { steps: 5 }); await shot(p, `U5-mid-${device}.jpg`); await p.mouse.up(); await pause(p, 120);
    // つまみを3.00ちょうどへ微調整（キーボードの矢印＝step 0.01。本物のキーボード）
    await p.evaluate(() => { const i = document.querySelector("[data-crop-zoom]"); if (i) i.focus(); });
    for (let i = 0; i < 40; i++) { const z = (await cropState(p)).view.zoom; const diff = +(z - 3).toFixed(2); if (Math.abs(diff) < 0.005) break; await p.keyboard.press(diff > 0 ? "ArrowLeft" : "ArrowRight"); await pause(p, 20); }
    const stMid = await cropState(p); await pressEnter(p); const fp = await pget(p, "F_p0");
    report[K("U5")] = { barOnScreen: barInfo.onscreen, zoom: fp.view.zoom, zoom3: near(fp.view.zoom, 3, 0.1), xUnchanged: near(fp.view.x, v0.x, 0.001), yUnchanged: near(fp.view.y, v0.y, 0.001), v0, vAfter: fp.view };
  }
  // U6：写真を右クリック→「写真を外す」あり「写真を戻す」なし。外した後もう一度→「写真を戻す」あり「写真を外す」なし
  { await fresh();
    await rightClick(p, "F_p0"); const l1 = await menuLabels(p);
    await clickMenu(p, "写真を外す"); await pause(p, 150);
    await rightClick(p, "F_p0"); const l2 = await menuLabels(p);
    report[K("U6")] = { firstHasClear: l1.includes("写真を外す"), firstNoRestore: !l1.includes("写真を戻す"), secondHasRestore: l2.includes("写真を戻す"), secondNoClear: !l2.includes("写真を外す") };
  }
  report[K("_errs")] = errs.slice(0, 5);
  await browser.close();
}
fs.writeFileSync(path.join(here, "_verify_u.json"), JSON.stringify(report, null, 2));
console.log("=== U試験（元の位置に戻す・見せる範囲の拡大）===");
for (const k of Object.keys(report)) if (!k.includes("_errs")) console.log(k + ": " + JSON.stringify(report[k]));
for (const k of Object.keys(report)) if (k.includes("_errs") && report[k].length) console.log(k + " ERRORS: " + JSON.stringify(report[k]));
