// playground12：J1〜J13（文字の見た目：大きさ・太さ・色）。本物のマウス・キーボード。画面 PC 1440×1100。
// 道具の出し分け・大きさ（欄/一覧/大小）・太字・色（テンプレ色/最近/その他）・端末ごとの引き継ぎ・戻す/やり直す・文字の見た目を元に戻す。
// 試験ごとに try/catch で囲む（1つ転んでも他を出す＝実測値を並べる。判定はしない）。
import { chromium, webkit } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground16_single.html";
const OUT = "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground16"; fs.mkdirSync(OUT, { recursive: true });
const DW = { pc: 1440, sp: 390 };
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;
const pause = (p, ms = 120) => p.waitForTimeout(ms);
const geom = (p) => p.evaluate(() => window.__playground.geometry());
const warns = (p) => p.evaluate(() => window.__playground.warnings());
const tstyles = (p) => p.evaluate(() => window.__playground.textStyles());
const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const secOf = (id) => (id.startsWith("F_") ? "feature" : "items");
async function secInfo(p, sec) { return p.evaluate((s) => { const el = document.querySelector("#host_" + s + " #sec"); const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width }; }, sec); }
async function center(p, id) { return p.evaluate((id) => { for (const h of ["host_feature", "host_items"]) { const el = document.querySelector("#" + h + ' [data-el="' + id + '"]'); if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } } return null; }, id); }
async function shot(p, name) { await p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }); }
const toolsVisible = (p) => p.evaluate(() => getComputedStyle(document.getElementById("tstools")).display !== "none");
const tsOf = (p, part) => tstyles(p).then((a) => a.find((x) => x.part === part));
async function clickEl(p, id, mods) { const c = await center(p, id); const sh = mods && mods.includes("Shift"); if (sh) await p.keyboard.down("Shift"); await p.mouse.click(Math.round(c.x), Math.round(c.y)); if (sh) await p.keyboard.up("Shift"); await pause(p, 120); }
async function clickTwice(p, id) { const c = await center(p, id); await p.mouse.click(Math.round(c.x), Math.round(c.y)); await pause(p, 650); await p.mouse.click(Math.round(c.x), Math.round(c.y)); await pause(p, 160); }  // 600ms超＝ダブルクリックにしない（PowerPoint のドリルイン）
async function clickEmpty(p, sec) { const si = await secInfo(p, sec); await p.mouse.click(Math.round(si.left + 10), Math.round(si.top + 10)); await pause(p, 120); }
const tsEl = (name) => '#tstools [data-ts="' + name + '"]';
async function waitTools(p) { for (let i = 0; i < 30; i++) { if (await toolsVisible(p)) return true; await pause(p, 50); } return false; }
async function selText(p, id) { await clickEl(p, id); await waitTools(p); }
async function clickTs(p, name) { await waitTools(p); await p.click(tsEl(name), { timeout: 5000 }); await pause(p, 120); }
async function setSizeInput(p, val) { await waitTools(p); await p.fill(tsEl("size"), String(val)); await p.keyboard.press("Enter"); await pause(p, 160); }
async function dragBy(p, id, ddx, ddy, dw) { const sec = secOf(id); const si = await secInfo(p, sec); const sc = si.w / dw; const c = await center(p, id); const cx = Math.round(c.x), cy = Math.round(c.y); await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + Math.round(ddx * sc * 0.5), cy + Math.round(ddy * sc * 0.5), { steps: 3 }); await p.mouse.move(cx + Math.round(ddx * sc), cy + Math.round(ddy * sc), { steps: 3 }); await p.mouse.up(); await pause(p); }
async function dragTo(p, id, tx, ty, dw) { const g = await geom(p); await dragBy(p, id, tx - g[id].x, ty - g[id].y, dw); }
async function rightClick(p, id) { const c = await center(p, id); await p.mouse.click(Math.round(c.x), Math.round(c.y), { button: "right" }); await pause(p, 140); }
const menuLabels = (p) => p.evaluate(() => [...document.querySelectorAll("#fmenu button")].map((b) => b.textContent));
const clickMenu = (p, label) => p.evaluate((lbl) => { const b = [...document.querySelectorAll("#fmenu button")].find((x) => x.textContent === lbl); if (b) { b.click(); return true; } return false; }, label);
async function openColor(p) { await clickTs(p, "color"); }
async function pickTemplateColor(p, hex) { await p.click('#colorPop .cell[data-ts-color="' + hex + '"]', { timeout: 5000 }); await pause(p, 140); }
async function setCustomColor(p, hex) { await p.$eval('[data-ts="color-custom"]', (el, h) => { el.value = h; el.dispatchEvent(new Event("input", { bubbles: true })); }, hex); await pause(p, 140); }
async function recentCells(p) { return p.evaluate(() => { const labs = [...document.querySelectorAll("#colorPop .lab")]; const r = labs.find((l) => l.textContent.indexOf("最近") >= 0); if (!r) return []; const sws = r.nextElementSibling; return sws ? [...sws.querySelectorAll(".cell")].map((c) => c.getAttribute("data-ts-color")) : []; }); }

const report = {};
for (const [device, bt, vw] of [["pc", chromium, 1440], ["sp", webkit, 430]]) {
  const dw = DW[device];
  const browser = await bt.launch();
  const p = await (await browser.newContext({ viewport: { width: vw, height: 3200 }, deviceScaleFactor: 1 })).newPage();  // 2セクション（〜2900px）が全部画面に入る高さ（verify_q と同じ考え。幅は作業票どおり 1440/430）
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  const K = (t) => `${t}-${device}`;
  const fresh = async () => { await reset(p); await setDevice(p, device); await pause(p, 150); return geom(p); };
  const T = async (name, fn) => { try { await fn(); } catch (e) { report[K(name)] = { error: String(e).split("\n")[0].slice(0, 160) }; } };

  // J1：見出しを選ぶ→写真を選ぶ→何もない所。見出しの時だけ道具が出る
  await T("J1", async () => { await fresh(); await shot(p, `J1-before-${device}.jpg`);
    await clickEl(p, "F_h0"); const vHead = await toolsVisible(p); await shot(p, `J1-after-${device}.jpg`);
    await clickEl(p, "F_p0"); const vPhoto = await toolsVisible(p);
    await clickEmpty(p, "feature"); const vNone = await toolsVisible(p);
    report[K("J1")] = { headShows: vHead, photoHides: !vPhoto, noneHides: !vNone };
  });
  // J2：見出しの大きさを 36。文字が高くなる・見出し下端〜本文上端は前と同じ・overlaps空・size36 sizeOwn true
  await T("J2", async () => { const b = await fresh(); const gapB = b.F_b0.y - (b.F_h0.y + b.F_h0.h);
    await selText(p, "F_h0"); await shot(p, `J2-before-${device}.jpg`);
    await setSizeInput(p, 36); const g = await geom(p); const w = await warns(p); const ts = await tsOf(p, "F_h0"); await shot(p, `J2-after-${device}.jpg`);
    const gapA = g.F_b0.y - (g.F_h0.y + g.F_h0.h);
    report[K("J2")] = { size: ts.size, sizeOwn: ts.sizeOwn, taller: g.F_h0.h > b.F_h0.h + 1, gapSame: near(gapA, gapB, 0.5), gapB: +gapB.toFixed(2), gapA: +gapA.toFixed(2), overlapsEmpty: w.overlaps.length === 0 };
  });
  // J3（pc のみ）：PC で36→スマホで24(16×1.5)・own false→スマホで20→PCは36のまま
  if (device === "pc") await T("J3", async () => {
    await fresh(); await selText(p, "F_h0"); await setSizeInput(p, 36);
    await p.click("#dSP"); await pause(p, 200); const spTs = await tsOf(p, "F_h0");
    await selText(p, "F_h0"); await setSizeInput(p, 20); const spTs2 = await tsOf(p, "F_h0");
    await p.click("#dPC"); await pause(p, 200); const pcTs = await tsOf(p, "F_h0");
    report["J3-pc"] = { spInherit24: spTs.size, spOwnFalse: spTs.sizeOwn === false, spSet20: spTs2.size, pcStill36: pcTs.size };
  });
  // J4：見出しを「大きく」2回（PC 24→28→32／SP 16→18→20）
  await T("J4", async () => { await fresh(); await selText(p, "F_h0"); await clickTs(p, "grow"); const s1 = (await tsOf(p, "F_h0")).size; await clickTs(p, "grow"); const s2 = (await tsOf(p, "F_h0")).size;
    report[K("J4")] = { first: s1, second: s2, expected: device === "pc" ? [28, 32] : [18, 20] };
  });
  // J5：本文の太字（1回700・2回400）。端末を切り替えても同じ
  await T("J5", async () => { await fresh(); await selText(p, "F_b0"); await clickTs(p, "bold"); const w1 = (await tsOf(p, "F_b0")).weight; await clickTs(p, "bold"); const w2 = (await tsOf(p, "F_b0")).weight;
    await clickTs(p, "bold"); const w3 = (await tsOf(p, "F_b0")).weight;   // 700 に戻して端末跨ぎを見る
    const other = device === "pc" ? "#dSP" : "#dPC"; await p.click(other); await pause(p, 200); const wOther = (await tsOf(p, "F_b0")).weight;
    report[K("J5")] = { first700: w1, second400: w2, third700: w3, otherDeviceSame: wOther === w3 };
  });
  // J6：本文の色＝テンプレ色2つ目(#7B7B7B→textMuted)→その他の色 #C03030。最近使った色の先頭が #C03030。端末跨ぎ同じ
  await T("J6", async () => { await fresh(); await selText(p, "F_b0"); await shot(p, `J6-before-${device}.jpg`);
    await openColor(p); await shot(p, `J6-palette-${device}.jpg`); await pickTemplateColor(p, "#7B7B7B"); const c1 = (await tsOf(p, "F_b0")).color;
    await openColor(p); await setCustomColor(p, "#c03030"); const c2 = (await tsOf(p, "F_b0")).color; await shot(p, `J6-after-${device}.jpg`);
    await openColor(p); const rec = await recentCells(p); await p.mouse.click(5, 5);
    const other = device === "pc" ? "#dSP" : "#dPC"; await p.click(other); await pause(p, 200); const cOther = (await tsOf(p, "F_b0")).color;
    report[K("J6")] = { templateColor: c1, customColor: c2, recentTop: rec[0] || null, otherDeviceSame: cOther === c2 };
  });
  // J7：わらび餅の品の名前を2回クリックで選び色 #C03030。3件の品名すべて #C03030・ほかは変わらない
  await T("J7", async () => { await fresh(); await shot(p, `J7-before-${device}.jpg`);
    await clickTwice(p, "card_name_c_warabi");
    const curSel = await p.evaluate(() => [...document.querySelectorAll(".mark-sel")].map((n) => n.getAttribute("data-el")));
    await openColor(p); await setCustomColor(p, "#c03030"); await pause(p, 150); await shot(p, `J7-after-${device}.jpg`);
    const all = await tstyles(p);
    const names = all.filter((x) => /^card_name_/.test(x.part)).map((x) => x.color);
    const descs = all.filter((x) => /^card_desc_/.test(x.part)).map((x) => x.color);
    report[K("J7")] = { selected: curSel, names, allNamesRed: names.length === 3 && names.every((c) => c === "#C03030"), descsUnchanged: descs.every((c) => c !== "#C03030") };
  });
  // J8：見出しと本文を Shift で2つ選び大きさ20。両方20
  await T("J8", async () => { await fresh(); await clickEl(p, "F_h0"); await clickEl(p, "F_b0", ["Shift"]); const selN = await p.evaluate(() => [...document.querySelectorAll(".mark-sel")].length);
    await setSizeInput(p, 20); const h = await tsOf(p, "F_h0"); const b = await tsOf(p, "F_b0");
    report[K("J8")] = { selCount: selN, headSize: h.size, bodySize: b.size, both20: h.size === 20 && b.size === 20 };
  });
  // J9：甘味処の見出しを表の中（上端+60・縦中心）へ動かし大きさ40。表は押し下げない・ownerOverlaps・overlaps空
  await T("J9", async () => { const b = await fresh();
    await dragTo(p, "I_kanmi", b.I_kanmi.x, b.I_table.y + 60 - b.I_kanmi.h / 2, dw); await pause(p, 150);
    const gMove = await geom(p); const tableYMove = gMove.I_table.y;   // M2 で甘味処が流れから抜け、表は上に詰む（W2 と同じ）。大きさ増でここから動かないことを見る
    await selText(p, "I_kanmi"); await setSizeInput(p, 40); const g = await geom(p); const w = await warns(p); const ts = await tsOf(p, "I_kanmi");
    const ownerPair = [...w.ownerOverlaps].some((o) => [o.a, o.b].includes("I_kanmi"));
    report[K("J9")] = { size: ts.size, tableNotPushedBySize: near(g.I_table.y, tableYMove, 1), tableYMove: +tableYMove.toFixed(1), tableYAfter: +g.I_table.y.toFixed(1), ownerOverlaps: w.ownerOverlaps.length, hasOwnerKanmi: ownerPair, overlapsEmpty: w.overlaps.length === 0 };
  });
  // J10：J2 のあと戻す→やり直す（24→36）
  await T("J10", async () => { await fresh(); await selText(p, "F_h0"); await setSizeInput(p, 36);
    await p.click("#tUndo"); await pause(p, 150); const su = (await tsOf(p, "F_h0")).size;
    await p.click("#tRedo"); await pause(p, 150); const sr = (await tsOf(p, "F_h0")).size;
    report[K("J10")] = { afterUndo: su, afterRedo: sr };
  });
  // J11：見出しに大きさ36・太字・色→右へ30→元の位置に戻す（見た目は残る）→文字の見た目を元に戻す（全部テンプレ）
  await T("J11", async () => { const b = await fresh(); await selText(p, "F_h0"); await setSizeInput(p, 36); await clickTs(p, "bold"); await openColor(p); await setCustomColor(p, "#c03030");
    await dragBy(p, "F_h0", 30, 0, dw); await pause(p, 120);
    await rightClick(p, "F_h0"); const lbls1 = await menuLabels(p); await clickMenu(p, "元の位置に戻す"); await pause(p, 150);
    const g1 = await geom(p); const ts1 = await tsOf(p, "F_h0");  // 位置戻る・見た目残る
    await rightClick(p, "F_h0"); const lbls2 = await menuLabels(p); await clickMenu(p, "文字の見た目を元に戻す"); await pause(p, 150);
    const ts2 = await tsOf(p, "F_h0");
    report[K("J11")] = {
      menuHasPosReset: lbls1.includes("元の位置に戻す"), posBack: near(g1.F_h0.x, b.F_h0.x, 1.5),
      lookKeptAfterPosReset: ts1.size === 36 && ts1.color === "#C03030",
      menuHasLookReset: lbls2.includes("文字の見た目を元に戻す"),
      sizeBack: ts2.size === (device === "pc" ? 24 : 16), weightBack: ts2.weight === 700, colorBack: ts2.color === "text",
    };
  });
  // J12：本文をダブルクリックで書き換え→最後に「あ」→そのまま太字。あ が残り太字になる
  await T("J12", async () => { await fresh(); const cc = await center(p, "F_b0"); await p.mouse.dblclick(Math.round(cc.x), Math.round(cc.y)); await pause(p, 160);
    await p.keyboard.press("End"); await p.keyboard.type("あ"); await pause(p, 120);
    await clickTs(p, "bold"); await pause(p, 150);
    const txt = await p.evaluate(() => { const el = document.querySelector('[data-el="F_b0"]'); return (el ? el.textContent : "").slice(-1); });
    const w = (await tsOf(p, "F_b0")).weight;
    report[K("J12")] = { lastCharA: txt === "あ", bold: w === 700 };
  });
  // J13：見出しの大きさ欄に 200→120、3→8（範囲外は端に丸める）
  await T("J13", async () => { await fresh(); await selText(p, "F_h0"); await setSizeInput(p, 200); const s1 = (await tsOf(p, "F_h0")).size; await setSizeInput(p, 3); const s2 = (await tsOf(p, "F_h0")).size;
    report[K("J13")] = { at200: s1, at3: s2 };
  });
  report[K("_errs")] = errs.slice(0, 6);
  await browser.close();
}
fs.writeFileSync(path.join(here, "_verify_j.json"), JSON.stringify(report, null, 2));
console.log("=== J試験（文字の見た目：大きさ・太さ・色）===");
for (const k of Object.keys(report)) if (!k.includes("_errs")) console.log(k + ": " + JSON.stringify(report[k]));
for (const k of Object.keys(report)) if (k.includes("_errs") && report[k].length) console.log(k + " ERRORS: " + JSON.stringify(report[k]));
