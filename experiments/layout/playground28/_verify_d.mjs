// playground15：D1〜D12（文の一部の見た目・ページを元に戻す）。本物のマウス・キーボード。画面 PC 1440／SP 430、縦は全部入る 3200。
// 「最初の4文字を選ぶ」＝書き換えの状態で先頭へ→Shift+→×4。先頭へは ControlOrMeta+A → ArrowLeft（Ctrl+Home は chromium の contenteditable で効かないため・同じ選択になる実キー）。
import { chromium, webkit } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground20_single.html";
const OUT = "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground20"; fs.mkdirSync(OUT, { recursive: true });
const DW = { pc: 1440, sp: 390 };
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;
const pause = (p, ms = 110) => p.waitForTimeout(ms);
const geom = (p) => p.evaluate(() => window.__playground.geometry());
const runsOf = (p, id) => p.evaluate((id) => window.__playground.textRuns(id), id);
const tstyles = (p) => p.evaluate(() => window.__playground.textStyles());
const photos = (p) => p.evaluate(() => window.__playground.photos());
const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
async function center(p, id) { return p.evaluate((id) => { for (const h of ["host_feature", "host_items"]) { const el = document.querySelector("#" + h + ' [data-el="' + id + '"]'); if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } } return null; }, id); }
async function shot(p, name) { await p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }); }
async function dblEdit(p, id) { const c = await center(p, id); await p.mouse.dblclick(Math.round(c.x), Math.round(c.y)); await pause(p, 160); }
async function goStart(p) { await p.keyboard.press("ControlOrMeta+a"); await pause(p, 40); await p.keyboard.press("ArrowLeft"); await pause(p, 40); }
async function selectFirstN(p, n) { await goStart(p); for (let i = 0; i < n; i++) { await p.keyboard.press("Shift+ArrowRight"); await pause(p, 25); } }
async function caretAfter(p, n) { await goStart(p); for (let i = 0; i < n; i++) { await p.keyboard.press("ArrowRight"); await pause(p, 20); } }
async function colorCustom(p, hex) { await p.click('#tstools [data-ts="color"]'); await pause(p, 90); await p.$eval('[data-ts="color-custom"]', (el, h) => { el.value = h; el.dispatchEvent(new Event("input", { bubbles: true })); }, hex); await pause(p, 120); }
async function colorTemplate(p, hex) { await p.click('#tstools [data-ts="color"]'); await pause(p, 90); await p.click('#colorPop .cell[data-ts-color="' + hex + '"]'); await pause(p, 120); }
async function clickBold(p) { await p.click('#tstools [data-ts="bold"]'); await pause(p, 100); }
async function setSize(p, px) { await p.fill('#tstools [data-ts="size"]', String(px)); await p.keyboard.press("Enter"); await pause(p, 140); }
async function endEdit(p) { await p.keyboard.press("Escape"); await pause(p, 140); }
async function dragBy(p, id, ddx, ddy, dw) { const si = await p.evaluate((s) => { const e = document.querySelector("#host_" + s + " #sec"); const r = e.getBoundingClientRect(); return { left: r.left, w: r.width }; }, id.startsWith("F_") ? "feature" : "items"); const sc = si.w / dw; const c = await center(p, id); const cx = Math.round(c.x), cy = Math.round(c.y); await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + Math.round(ddx * sc * 0.5), cy + Math.round(ddy * sc * 0.5), { steps: 3 }); await p.mouse.move(cx + Math.round(ddx * sc), cy + Math.round(ddy * sc), { steps: 3 }); await p.mouse.up(); await pause(p); }
async function rightClick(p, id) { const c = await center(p, id); await p.mouse.click(Math.round(c.x), Math.round(c.y), { button: "right" }); await pause(p, 140); }
const clickMenu = (p, label) => p.evaluate((lbl) => { const b = [...document.querySelectorAll("#fmenu button")].find((x) => x.textContent === lbl); if (b) { b.click(); return true; } return false; }, label);
const menuLabels = (p) => p.evaluate(() => [...document.querySelectorAll("#fmenu button")].map((b) => b.textContent));
// IME（変換の途中→決定）を作る：compositionstart→update（途中文字を入れる）→end
async function imeType(p, id, text) { await p.evaluate(({ id, text }) => { const el = document.querySelector('[data-el="' + id + '"]'); el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" })); document.execCommand("insertText", false, text); el.dispatchEvent(new CompositionEvent("compositionupdate", { data: text })); el.dispatchEvent(new CompositionEvent("compositionend", { data: text })); }, { id, text }); await pause(p, 150); }

const report = {};
for (const [device, bt, vw] of [["pc", chromium, 1440], ["sp", webkit, 1280]]) {
  const dw = DW[device];
  const browser = await bt.launch();
  const ctxOpts = { viewport: { width: vw, height: 3200 }, deviceScaleFactor: 1 };
  if (device === "pc") ctxOpts.permissions = ["clipboard-read", "clipboard-write"];   // D12 の本物のコピー＆貼り付け
  const p = await (await browser.newContext(ctxOpts)).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  const K = (t) => `${t}-${device}`;
  const fresh = async () => { await reset(p); await setDevice(p, device); await pause(p, 150); };
  const T = async (name, fn) => { try { await fn(); } catch (e) { report[K(name)] = { error: String(e).split("\n")[0].slice(0, 160) }; } };

  // D1：本文の最初の4文字を #C03030
  await T("D1", async () => { await fresh(); await dblEdit(p, "F_b0"); await shot(p, `D1-before-${device}.jpg`); await selectFirstN(p, 4); await colorCustom(p, "#c03030"); await endEdit(p); await shot(p, `D1-after-${device}.jpg`);
    const r = await runsOf(p, "F_b0"); report[K("D1")] = { run0: r[0], run1Plain: r[1] ? r[1].color == null : null, run0len: r[0].text.length, run0red: r[0].color === "#C03030", nRuns: r.length };
  });
  // D2：最初の4文字を太字→もう一度で外す（1編集の中）
  await T("D2", async () => { await fresh(); await dblEdit(p, "F_b0"); await selectFirstN(p, 4); await clickBold(p); const r1 = await runsOf(p, "F_b0");
    await selectFirstN(p, 4); await p.keyboard.press("ControlOrMeta+b"); await pause(p, 120); const r2 = await runsOf(p, "F_b0"); await endEdit(p);
    report[K("D2")] = { firstBold4: r1[0].bold === true && r1[0].text.length === 4, secondCleared: r2.length === 1 && !r2[0].bold };
  });
  // D3：D1 の後、4文字目の後ろに「あ」を打つ（赤を引き継ぐ）
  await T("D3", async () => { await fresh(); await dblEdit(p, "F_b0"); await selectFirstN(p, 4); await colorCustom(p, "#c03030"); await endEdit(p);
    await dblEdit(p, "F_b0"); await caretAfter(p, 4); await p.keyboard.type("あ"); await pause(p, 150); const r = await runsOf(p, "F_b0"); await endEdit(p);
    report[K("D3")] = { run0: r[0].text, run0red: r[0].color === "#C03030", run0len: r[0].text.length, endsWithA: r[0].text.slice(-1) === "あ" };
  });
  // D4：D1 の後、赤4文字の真ん中（2文字目の後ろ）に IME で1文字入れて決める
  await T("D4", async () => { await fresh(); await dblEdit(p, "F_b0"); await selectFirstN(p, 4); await colorCustom(p, "#c03030"); await endEdit(p);
    await dblEdit(p, "F_b0"); await caretAfter(p, 2); await imeType(p, "F_b0", "ん"); const r = await runsOf(p, "F_b0"); await endEdit(p);
    report[K("D4")] = { run0: r[0].text, allRedFirst: r[0].color === "#C03030", firstRunLen: r[0].text.length, hasN: r[0].text.indexOf("ん") >= 0, noDup: (r[0].text.match(/練/g) || []).length === 1 };
  });
  // D5：D1 の後、端末を切り替えて同じ4文字が赤
  await T("D5", async () => { await fresh(); await dblEdit(p, "F_b0"); await selectFirstN(p, 4); await colorCustom(p, "#c03030"); await endEdit(p);
    const other = device === "pc" ? "#dSP" : "#dPC"; await p.click(other); await pause(p, 200); const r = await runsOf(p, "F_b0");
    report[K("D5")] = { run0red: r[0].color === "#C03030", run0len: r[0].text.length };
  });
  // D6：本文まるごと太字（何も選ばず）
  await T("D6", async () => { await fresh(); await dblEdit(p, "F_b0"); await clickBold(p); await pause(p, 140);
    const ts = (await tstyles(p)).find((x) => x.part === "F_b0"); const r = await runsOf(p, "F_b0");
    report[K("D6")] = { boxBold: ts.weight === 700, runsPlain: r.length === 1 && !r[0].bold };
  });
  // D7：わらび餅の品名の最初の2文字を赤（その1件だけ）
  await T("D7", async () => { await fresh(); await shot(p, `D7-before-${device}.jpg`); await dblEdit(p, "card_name_c_warabi"); await selectFirstN(p, 2); await colorCustom(p, "#c03030"); await endEdit(p); await shot(p, `D7-after-${device}.jpg`);
    const rw = await runsOf(p, "card_name_c_warabi"); const rj = await runsOf(p, "card_name_c_jonama"); const rd = await runsOf(p, "card_name_c_dora");
    report[K("D7")] = { warabi2red: rw[0].color === "#C03030" && rw[0].text.length === 2, warabiRest: rw[1] ? rw[1].color == null : null, jonamaPlain: rj.length === 1 && rj[0].color == null, doraPlain: rd.length === 1 && rd[0].color == null };
  });
  // D8：本文の最初の4文字を 1.5倍（PC 16→24・SP 14→21）
  await T("D8", async () => { await fresh(); await dblEdit(p, "F_b0"); await selectFirstN(p, 4); await shot(p, `D8-before-${device}.jpg`); await setSize(p, device === "pc" ? 24 : 21); const rHere = await runsOf(p, "F_b0"); await endEdit(p); await shot(p, `D8-after-${device}.jpg`);
    // 端末ごとの実px＝箱×倍率
    const pxHere = await p.evaluate(() => { const box = window.__playground; return null; });
    const scale = rHere[0].scale; const boxHere = await p.evaluate(() => PG.boxSizePx("F_b0"));
    const other = device === "pc" ? "sp" : "pc"; await setDevice(p, other); await pause(p, 150); const boxOther = await p.evaluate(() => PG.boxSizePx("F_b0")); await setDevice(p, device); await pause(p, 120);
    report[K("D8")] = { scale, pxHere: Math.round(boxHere * scale), pxOther: Math.round(boxOther * scale), run0len: rHere[0].text.length };
  });
  // D9：見出し箱 36・#7B7B7B／本文4文字赤／見出し右30／写真の見せる範囲→「このページを元に戻す」→戻す
  await T("D9", async () => { await fresh(); const tplHeadX = (await geom(p)).F_h0.x;
    await p.evaluate(() => window.__playground.select("F_h0")); await pause(p, 120); await setSize(p, 36); await colorTemplate(p, "#7B7B7B");
    await dblEdit(p, "F_b0"); await selectFirstN(p, 4); await colorCustom(p, "#c03030"); await endEdit(p);
    await dragBy(p, "F_h0", 30, 0, dw);
    // 写真の見せる範囲：ダブルクリックで crop→拡大の横棒で 2倍→Enter
    { const c = await center(p, "F_p0"); await p.mouse.dblclick(Math.round(c.x), Math.round(c.y)); await pause(p, 200);
      const bi = await p.evaluate(() => { const i = document.querySelector("[data-crop-zoom]"); if (!i) return null; const r = i.getBoundingClientRect(); return { left: r.left, width: r.width, mid: r.top + r.height / 2 }; });
      if (bi) { const frac = (2 - 1) / (4 - 1); await p.mouse.move(Math.round(bi.left + 2), Math.round(bi.mid)); await p.mouse.down(); await p.mouse.move(Math.round(bi.left + frac * bi.width), Math.round(bi.mid), { steps: 5 }); await p.mouse.up(); await pause(p, 120); await p.keyboard.press("Enter"); await pause(p, 150); } }
    await shot(p, `D9-before-${device}.jpg`);
    const beforeHeadTs = (await tstyles(p)).find((x) => x.part === "F_h0"); const beforeHeadX = (await geom(p)).F_h0.x; const beforeView = (await photos(p)).find((x) => x.part === "F_p0").view;
    await p.click("#tResetPage"); await pause(p, 200); await shot(p, `D9-after-${device}.jpg`);
    const g = await geom(p); const headTs = (await tstyles(p)).find((x) => x.part === "F_h0"); const view = (await photos(p)).find((x) => x.part === "F_p0").view; const bodyR = await runsOf(p, "F_b0");
    await p.click("#tUndo"); await pause(p, 200); const g2 = await geom(p); const headTs2 = (await tstyles(p)).find((x) => x.part === "F_h0"); const view2 = (await photos(p)).find((x) => x.part === "F_p0").view;
    report[K("D9")] = {
      beforeReset: { headSize: beforeHeadTs.size, headColor: beforeHeadTs.color, headX: +beforeHeadX.toFixed(1), zoom: +beforeView.zoom.toFixed(2) },
      afterReset: { headSize: headTs.size, headColorText: headTs.color === "text", headXBack: near(g.F_h0.x, tplHeadX, 1.5), viewDefault: near(view.x, 0.5, 0.01) && near(view.zoom, 1, 0.01), bodyStillRed: bodyR[0].color === "#C03030" && bodyR[0].text.length === 4 },
      afterUndo: { headSize: headTs2.size, headColor7b: headTs2.color === "textMuted", headXBack30: near(g2.F_h0.x, beforeHeadX, 1.5), zoomBack: near(view2.zoom, beforeView.zoom, 0.05) },
    };
  });
  // D10：D1 の後、本文を右クリック→「文字の見た目を元に戻す」
  await T("D10", async () => { await fresh(); await dblEdit(p, "F_b0"); await selectFirstN(p, 4); await colorCustom(p, "#c03030"); await endEdit(p);
    await rightClick(p, "F_b0"); const lbls = await menuLabels(p); await clickMenu(p, "文字の見た目を元に戻す"); await pause(p, 150); const r = await runsOf(p, "F_b0");
    report[K("D10")] = { menuHas: lbls.includes("文字の見た目を元に戻す"), oneRun: r.length === 1 && r[0].color == null };
  });
  // D11：D1 の後、戻す→やり直す
  await T("D11", async () => { await fresh(); await dblEdit(p, "F_b0"); await selectFirstN(p, 4); await colorCustom(p, "#c03030"); await endEdit(p);
    await p.click("#tUndo"); await pause(p, 150); const ru = await runsOf(p, "F_b0");
    await p.click("#tRedo"); await pause(p, 150); const rr = await runsOf(p, "F_b0");
    report[K("D11")] = { undoCleared: ru.length === 1 && ru[0].color == null, redoRed: rr[0].color === "#C03030" && rr[0].text.length === 4 };
  });
  // D12：D1 の後、本文の最初の6文字をコピーし特集2の本文の末尾へ貼り付け。§19b §5：この編集の中のコピーは見た目（赤）を引き継ぐ（旧「文字だけ」から変更）
  await T("D12", async () => { await fresh();
    const b1Before = (await runsOf(p, "F_b1")).map((r) => r.text).join("");
    await dblEdit(p, "F_b0"); await selectFirstN(p, 4); await colorCustom(p, "#c03030"); // D1
    // 本物の選択で最初の6文字（赤4含む）を選び、Cmd+C。headless は Cmd+C/V がクリップボードを運ばないので、
    // 実際に選ばれた文字を読み、特集2の本文の末尾で本物の paste イベント（文字だけ）として入れる＝貼り付けの中身を試す。
    await selectFirstN(p, 6); const sixText = await p.evaluate(() => window.getSelection().toString()); await p.keyboard.press("ControlOrMeta+c"); await pause(p, 100);
    await dblEdit(p, "F_b1");
    await p.evaluate((t) => { const el = document.querySelector('[data-el="F_b1"]'); el.focus(); const dt = new DataTransfer(); dt.setData("text/plain", t); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, sixText);
    await pause(p, 200); const r = await runsOf(p, "F_b1"); await endEdit(p);
    const after = r.map((x) => x.text).join("");
    report[K("D12")] = { sixSelected: sixText, sixLen: sixText.length, lenGrew: after.length === b1Before.length + 6, appended6: after.slice(-6), appendedCarriesRed: r.some((x) => x.color === "#C03030"), nRuns: r.length, note: "§19b §5：編集内コピーは見た目を引き継ぐ" };
  });
  report[K("_errs")] = errs.slice(0, 6);
  await browser.close();
}
fs.writeFileSync(path.join(here, "_verify_d.json"), JSON.stringify(report, null, 2));
console.log("=== D試験（文の一部の見た目・ページを元に戻す）===");
for (const k of Object.keys(report)) if (!k.includes("_errs")) console.log(k + ": " + JSON.stringify(report[k]));
for (const k of Object.keys(report)) if (k.includes("_errs") && report[k].length) console.log(k + " ERRORS: " + JSON.stringify(report[k]));
