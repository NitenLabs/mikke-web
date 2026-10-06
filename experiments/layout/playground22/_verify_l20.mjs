// 試験台20 L1〜L24（列・幅・重ねる・左右入替・X23/X24）。本物のマウス・キーボード。PC 1440×1100。
// ※ L1〜L19 は前の作業票（18b/19）でも使っていた番号＝別ファイル _verify_l.mjs。こちらは試験台20 の L1〜L24（_verify_l20.json）。
import { chromium } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground22_single.html";
const OUT = path.join(here, "..", "..", "..", "refs/compare/layout/playground22"); fs.mkdirSync(OUT, { recursive: true });
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;
const pause = (p, ms = 150) => p.waitForTimeout(ms);
const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const geom = (p) => p.evaluate(() => window.__playground.geometry());
const listLayout = (p, d) => p.evaluate((d) => window.__playground.listLayout(d), d);
const opsLen = (p) => p.evaluate(() => window.__playground.ops().length);
const scaleOf = async (p, dw) => { const w = await p.evaluate(() => { const el = document.querySelector("#host_feature #sec"); return el ? el.getBoundingClientRect().width : 0; }); return w / dw; };
async function center(p, id) { return p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const el = h.querySelector('[data-el="' + id + '"]'); if (el) { el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; } } return null; }, id); }
async function clickEl(p, id) { const c = await center(p, id); await p.mouse.click(c.x, c.y); await pause(p, 160); }
async function rightClick(p, id) { const c = await center(p, id); await p.mouse.click(c.x, c.y, { button: "right" }); await pause(p, 160); }
const menuLabels = (p) => p.evaluate(() => [...document.querySelectorAll("#fmenu button")].map((b) => b.textContent));
const clickMenu = (p, label) => p.evaluate((label) => { const b = [...document.querySelectorAll("#fmenu button")].find((x) => x.textContent === label); if (b) { b.click(); return true; } return false; }, label);
const colsBtnShown = (p) => p.evaluate(() => { const b = document.getElementById("tCols"); return !!(b && (b.offsetParent !== null || document.getElementById("moreMenu").contains(b))); });
async function openColsList(p) { const b = await p.evaluate(() => { const e = document.getElementById("tCols"); return document.getElementById("moreMenu").contains(e); }); if (b) { await p.evaluate(() => document.getElementById("tMore").click()); await pause(p, 120); } await p.evaluate(() => document.getElementById("tCols").click()); await pause(p, 150); }
const colOpts = (p) => p.evaluate(() => [...document.querySelectorAll("#colsPop [data-cols-opt]")].map((x) => ({ n: +x.getAttribute("data-cols-opt"), cur: x.classList.contains("cur"), dis: x.disabled })));
async function pressDragAlt(p, x, y, dx, dy, alt) { if (alt) await p.keyboard.down("Alt"); await p.mouse.move(Math.round(x), Math.round(y)); await p.mouse.down(); await p.mouse.move(Math.round(x + dx / 2), Math.round(y + dy / 2), { steps: 3 }); await p.mouse.move(Math.round(x + dx), Math.round(y + dy), { steps: 3 }); await p.mouse.up(); if (alt) await p.keyboard.up("Alt"); await pause(p, 160); }
async function shot(p, name) { await p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }).catch(() => {}); }

const report = {};
async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }

  // L1：列 ▾ は品の並び全体のときだけ
  { await reset(p); await setDevice(p, "pc"); await pause(p, 200);
    await clickEl(p, "I_cards"); const onCards = await colsBtnShown(p);
    await pause(p, 750); await clickEl(p, "card_photo_c_warabi"); const onCard = await colsBtnShown(p);
    await clickEl(p, "F_p0"); const onFeaturePhoto = await colsBtnShown(p);
    report.L1 = { onCards, onCard, onFeaturePhoto, pass: onCards && !onCard && !onFeaturePhoto }; }
  // L2：見本 2/3/4・3に印。4に乗せて 313.5・3品1段。Esc で 426・ops 増えない
  { await reset(p); await pause(p, 150); await clickEl(p, "I_cards"); await openColsList(p);
    const opts = await colOpts(p); await p.hover('#colsPop [data-cols-opt="4"]'); await pause(p, 200);
    const g = await geom(p); const w4 = g.card_photo_c_jonama.w; const oneRow = near(g.card_photo_c_jonama.y, g.card_photo_c_dora.y, 1);
    const ops0 = await opsLen(p); await p.keyboard.press("Escape"); await pause(p, 200);
    const g2 = await geom(p); const wBack = g2.card_photo_c_jonama.w; const ops1 = await opsLen(p);
    report.L2 = { opts, w4: +w4.toFixed(1), oneRow, wBack: +wBack.toFixed(1), opsKept: ops1 === ops0, pass: opts.length === 3 && opts.find((o) => o.n === 3).cur && near(w4, 313.5, 0.6) && oneRow && near(wBack, 426, 0.6) && ops1 === ops0 }; }
  // L3：2列→1件651・写真651・どら焼き2段目左・段間64・下が下がる・scrollY不変・ops+1
  { await reset(p); await pause(p, 150); await clickEl(p, "I_cards");
    const before = await geom(p); const divBefore = before.I_divider.y; const cardsBottomBefore = before.I_cards.y + before.I_cards.h;
    await openColsList(p); await p.evaluate(() => document.querySelector('#colsPop [data-cols-opt="2"]').click()); await pause(p, 300);
    const ll = await listLayout(p); const g = await geom(p);
    const doraLeftIsCardsLeft = near(g.card_photo_c_dora.x, g.I_cards.x, 0.6); const dora2ndRow = g.card_photo_c_dora.y > g.card_photo_c_jonama.y + 100;
    const rowGap = +(g.card_photo_c_dora.y - (g.card_price_c_jonama.y + g.card_price_c_jonama.h)).toFixed(1);
    const spStill1 = (await listLayout(p, "sp")).I_cards.cols === 1;
    await shot(p, "L3.jpg");
    report.L3 = { cardsW: ll.I_cards.w, photoW: +g.card_photo_c_jonama.w.toFixed(1), doraLeftIsCardsLeft, dora2ndRow, rowGap, spStill1, opsInc: (await opsLen(p)) === 1, pass: near(g.card_photo_c_jonama.w, 651, 0.6) && doraLeftIsCardsLeft && dora2ndRow && near(rowGap, 64, 1) && spStill1 }; }
  // L4：戻す・やり直す
  { await p.evaluate(() => window.__playground.undo()); await pause(p, 200); const c3 = (await listLayout(p)).I_cards.cols;
    await p.evaluate(() => window.__playground.redo()); await pause(p, 200); const c2 = (await listLayout(p)).I_cards.cols;
    report.L4 = { afterUndo: c3, afterRedo: c2, pass: c3 === 3 && c2 === 2 }; }
  // L5：SP 列は 1/2、2列で 1件163.5・段間40。PC は3列のまま
  { await reset(p); await setDevice(p, "sp"); await pause(p, 250); await clickEl(p, "I_cards"); await openColsList(p);
    const opts = await colOpts(p); await p.evaluate(() => document.querySelector('#colsPop [data-cols-opt="2"]').click()); await pause(p, 300);
    const g = await geom(p); const rowGap = +(g.card_photo_c_dora.y - (g.card_price_c_jonama.y + g.card_price_c_jonama.h)).toFixed(1);
    const pcStill3 = (await listLayout(p, "pc")).I_cards.cols === 3;
    await shot(p, "L5.jpg");
    report.L5 = { opts: opts.map((o) => o.n), cardW: +g.card_photo_c_jonama.w.toFixed(1), rowGap, pcStill3, pass: JSON.stringify(opts.map((o) => o.n)) === "[1,2]" && near(g.card_photo_c_jonama.w, 163.5, 0.6) && near(rowGap, 40, 1) && pcStill3 }; }
  // L7：品の並びを選び右の辺のつまみ Alt 左358 → 幅968・左端57・3列・1件306.67。下が詰まる。つまみは e/w 2つ
  { await reset(p); await setDevice(p, "pc"); await pause(p, 200); await clickEl(p, "I_cards");
    const handles = await p.evaluate(() => window.__playground.handlesFor("I_cards"));
    await p.evaluate(() => window.__playground.programResize("I_cards", "e", -358, 0, true)); await pause(p, 250);
    const ll = await listLayout(p); const g = await geom(p);
    await shot(p, "L7.jpg");
    report.L7 = { handles, w: ll.I_cards.w, x: ll.I_cards.x, cols: ll.I_cards.cols, cardW: +g.card_photo_c_jonama.w.toFixed(2), pass: JSON.stringify(handles) === '["e","w"]' && near(ll.I_cards.w, 968, 0.6) && near(ll.I_cards.x, 57, 0.6) && ll.I_cards.cols === 3 && near(g.card_photo_c_jonama.w, 306.67, 0.6) }; }
  // L8：最小408で止まる。左へ広げても中身の幅を越えない
  { await reset(p); await pause(p, 150); await clickEl(p, "I_cards");
    await p.evaluate(() => window.__playground.programResize("I_cards", "e", -2000, 0, true)); await pause(p, 200);
    const wMin = (await listLayout(p)).I_cards.w;
    await p.evaluate(() => window.__playground.programResize("I_cards", "w", -2000, 0, true)); await pause(p, 200);
    const g = await geom(p); const cc = g.I_cards; const contentRight = (1440 + 1326) / 2;
    report.L8 = { wMin: +wMin.toFixed(1), rightWithin: cc.x + cc.w <= contentRight + 1, leftWithin: cc.x >= (1440 - 1326) / 2 - 1, pass: near(wMin, 408, 0.6) && cc.x + cc.w <= contentRight + 1 }; }
  // L9：幅408で列→4列は灰色（押せない）・2列は押せる
  { await reset(p); await pause(p, 150); await clickEl(p, "I_cards"); await p.evaluate(() => window.__playground.programResize("I_cards", "e", -918, 0, true)); await pause(p, 200);
    await openColsList(p); const opts = await colOpts(p);
    report.L9 = { opts, col4Disabled: opts.find((o) => o.n === 4).dis, col2Enabled: !opts.find((o) => o.n === 2).dis, pass: opts.find((o) => o.n === 4).dis && !opts.find((o) => o.n === 2).dis }; await p.keyboard.press("Escape"); await pause(p, 100); }
  // L10：表を選び右の辺つまみ Alt 左248 → 幅720・左端236・名前416.5・値段右端=表右端（§20b §2 等比：名前560:間159:値段249）。表高さ・下ボタン不変。SP表は変わらない
  { await reset(p); await pause(p, 150);
    const pillBefore = (await geom(p)).I_pillbg; const tableHBefore = (await geom(p)).I_table.h;
    await clickEl(p, "I_table"); await p.evaluate(() => window.__playground.programResize("I_table", "e", -248, 0, true)); await pause(p, 250);
    const ll = await listLayout(p); const g = await geom(p); const nameW = g[Object.keys(g).find((k) => /row_name/.test(k))].w; const pk = Object.keys(g).find((k) => /row_price/.test(k)); const priceRight = g[pk].x + g[pk].w; const tableRight = g.I_table.x + g.I_table.w;
    const spTable = (await listLayout(p, "sp")).I_table.w;
    await shot(p, "L10.jpg");
    report.L10 = { tableW: ll.I_table.w, tableX: ll.I_table.x, nameW: +nameW.toFixed(1), priceRightEqTableRight: near(priceRight, tableRight, 0.6), tableHBefore: +tableHBefore.toFixed(1), tableHAfter: +g.I_table.h.toFixed(1), pillDelta: +(g.I_pillbg.y - pillBefore.y).toFixed(1), spTableW: spTable, pass: near(ll.I_table.w, 720, 0.6) && near(ll.I_table.x, 236, 0.6) && near(nameW, 416.5, 0.6) && near(priceRight, tableRight, 0.6) && spTable === 351 }; }
  // L11：列・幅の後「このページを元に戻す」で全部戻る。元の位置に戻すで列がどうなるか
  { await reset(p); await pause(p, 150);
    await clickEl(p, "I_cards"); await p.evaluate(() => window.__playground.setCols("I_cards", 2)); await pause(p, 150);
    await p.evaluate(() => window.__playground.programResize("I_cards", "e", -200, 0, true)); await pause(p, 150);
    await clickEl(p, "I_table"); await p.evaluate(() => window.__playground.programResize("I_table", "e", -100, 0, true)); await pause(p, 150);
    await p.evaluate(() => window.__playground.resetScope("page", null, ["pc", "sp"])); await pause(p, 250);
    const afterPage = await listLayout(p);
    // 元の位置に戻す（列のみ設定して）
    await reset(p); await pause(p, 120); await clickEl(p, "I_cards"); await p.evaluate(() => window.__playground.setCols("I_cards", 2)); await pause(p, 150);
    await rightClick(p, "I_cards"); await clickMenu(p, "元の位置に戻す"); await pause(p, 200);
    const afterPartReset = (await listLayout(p)).I_cards.cols;
    report.L11 = { afterPageCols: afterPage.I_cards.cols, afterPageW: afterPage.I_cards.w, afterPageTableW: afterPage.I_table.w, partResetColsBecame: afterPartReset, pageResetPass: afterPage.I_cards.cols === 3 && near(afterPage.I_cards.w, 1326, 0.6) && near(afterPage.I_table.w, 968, 0.6), pass: afterPage.I_cards.cols === 3 && near(afterPage.I_cards.w, 1326, 0.6) }; }
  // L12/L13/L14：SP ドラッグの重なり/並び替え（別関数）
  await dragTests(p, report);
  // L15：PC 写真を右クリック→左右を入れ替える→写真136・見出し779・高さ下不変・ops+1・戻す
  { await reset(p); await setDevice(p, "pc"); await pause(p, 200);
    const pillBefore = (await geom(p)).I_pillbg.y; await rightClick(p, "F_p0"); const hasSwap = (await menuLabels(p)).includes("左右を入れ替える");
    await clickMenu(p, "左右を入れ替える"); await pause(p, 250); const g = await geom(p);
    await shot(p, "L15.jpg"); const ops1 = await opsLen(p);
    await p.evaluate(() => window.__playground.undo()); await pause(p, 200); const back = (await geom(p)).F_p0.x;
    report.L15 = { hasSwap, fp0x: +g.F_p0.x.toFixed(1), fh0x: +g.F_h0.x.toFixed(1), pillKept: near(g.I_pillbg.y, pillBefore, 0.6), opsInc: ops1 === 1, undoBack: near(back, 755, 0.6), pass: hasSwap && near(g.F_p0.x, 136, 0.6) && near(g.F_h0.x, 779, 0.6) && near(g.I_pillbg.y, pillBefore, 0.6) && ops1 === 1 && near(back, 755, 0.6) }; }
  // L16：見出しで出る・品の1件/SPでは出ない
  { await reset(p); await setDevice(p, "pc"); await pause(p, 150); await rightClick(p, "F_h0"); const onHead = (await menuLabels(p)).includes("左右を入れ替える");
    await reset(p); await pause(p, 100); await clickEl(p, "card_photo_c_warabi"); await rightClick(p, "card_photo_c_warabi"); const onCard = (await menuLabels(p)).includes("左右を入れ替える");
    await reset(p); await setDevice(p, "sp"); await pause(p, 150); await rightClick(p, "F_p0"); const onSp = (await menuLabels(p)).includes("左右を入れ替える");
    report.L16 = { onHead, onCard, onSp, pass: onHead && !onCard && !onSp }; }
  // L17：写真 Alt 右30→左右入替→写真136（30残らない）・anchors に写真の M1 なし
  { await reset(p); await setDevice(p, "pc"); await pause(p, 150); await clickEl(p, "F_p0");
    await p.evaluate(() => { const g = window.__playground.geometry(); window.__playground.select(["F_p0"]); }); await p.evaluate(() => window.__playground.nudge ? null : null);
    const c = await center(p, "F_p0"); await pressDragAlt(p, c.x, c.y, 30 * (await scaleOf(p, 1440)), 0, true);
    await rightClick(p, "F_p0"); await clickMenu(p, "左右を入れ替える"); await pause(p, 250);
    const g = await geom(p); const anchors = await p.evaluate(() => window.__playground.anchors());
    report.L17 = { fp0x: +g.F_p0.x.toFixed(1), noM1: !anchors.some((a) => a.part === "F_p0" && a.mode === "M1"), pass: near(g.F_p0.x, 136, 0.6) && !anchors.some((a) => a.part === "F_p0" && a.mode === "M1") }; }
  // L18：X24 写真 Alt 左619 → ownerOverlaps に（見出し・写真）（本文・写真）・前面背面・背面後 elementFromPoint が見出し
  { await reset(p); await setDevice(p, "pc"); await pause(p, 200); await clickEl(p, "F_p0");
    const c = await center(p, "F_p0"); await pressDragAlt(p, c.x, c.y, -619 * (await scaleOf(p, 1440)), 0, true);
    const w = await p.evaluate(() => window.__playground.warnings());
    const hasHP = w.ownerOverlaps.some((o) => (o.a === "F_h0" && o.b === "F_p0") || (o.a === "F_p0" && o.b === "F_h0"));
    const hasBP = w.ownerOverlaps.some((o) => (o.a === "F_b0" && o.b === "F_p0") || (o.a === "F_p0" && o.b === "F_b0"));
    await rightClick(p, "F_p0"); const labels = await menuLabels(p); const hasZ = labels.includes("最前面へ移動 ▸") && labels.includes("最背面へ移動 ▸");   // §22 §8：前面へ/背面へ→最前面/最背面へ移動 ▸ に変更
    await clickMenu(p, "最背面へ移動"); await pause(p, 250);
    await p.evaluate(() => window.__playground.select([])); await pause(p, 150);   // 選択の覆いを外してから測る
    const atHead = await p.evaluate(() => { const el = document.querySelector('[data-el="F_h0"]'); const r = el.getBoundingClientRect(); const t = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)); if (!t) return "null"; const de = t.closest("[data-el]"); return de ? de.getAttribute("data-el") : (t.tagName + "." + t.className); });
    await shot(p, "L18.jpg");
    report.L18 = { hasHP, hasBP, hasZ, atHeadAfterBack: atHead, pass: hasHP && hasBP && hasZ && atHead !== "F_p0" && atHead !== "null" }; }
  // L19：開いた直後の warnings がテンプレのまま（X24 で増えていない）
  { await reset(p); await setDevice(p, "pc"); await pause(p, 150); const wpc = await p.evaluate(() => window.__playground.warnings());
    await setDevice(p, "sp"); await pause(p, 150); const wsp = await p.evaluate(() => window.__playground.warnings());
    report.L19 = { pcOverlaps: wpc.overlaps.length, pcOwner: wpc.ownerOverlaps.length, pcOverflow: wpc.overflows.length, spOverlaps: wsp.overlaps.length, spOwner: wsp.ownerOverlaps.length, pass: wpc.overlaps.length === 0 && wpc.ownerOverlaps.length === 0 && wsp.overlaps.length === 0 && wsp.ownerOverlaps.length === 0 }; }
  // L6：わらび餅の名前を右の辺つまみ右200→名前の右端が1件の右端を越えない。2/3列に戻すと手直しの幅か1件の幅の小さい方
  { await reset(p); await setDevice(p, "pc"); await pause(p, 200);
    await p.evaluate(() => window.__playground.select(["card_name_c_warabi"])); await pause(p, 120);
    await p.evaluate(() => window.__playground.programResize("card_name_c_warabi", "e", 200, 0, true)); await pause(p, 200);
    const g3 = await geom(p); const nmRightWithinCard = (nm, ph) => g3[nm].x + g3[nm].w <= g3[ph].x + g3[ph].w + 1;
    const within3 = ["c_jonama", "c_warabi", "c_dora"].every((id) => nmRightWithinCard("card_name_" + id, "card_photo_" + id));
    await p.evaluate(() => window.__playground.setCols("I_cards", 4)); await pause(p, 200);
    const g4 = await geom(p); const within4 = ["c_jonama", "c_warabi", "c_dora"].every((id) => g4["card_name_" + id].x + g4["card_name_" + id].w <= g4["card_photo_" + id].x + g4["card_photo_" + id].w + 1);
    report.L6 = { within3, within4, pass: within3 && within4 }; }
  // L20：幅520/500/400 で「その他」のリンクが押せ、一覧が選んだ言葉のすぐ下・画面の中
  { const res = {}; for (const w of [520, 500, 400]) { await p.setViewportSize({ width: w, height: 900 }); await reset(p); await setDevice(p, "pc"); await pause(p, 200);
      const r = await p.evaluate(() => { const el = document.querySelector('[data-el="F_b0"]'); el.scrollIntoView({ block: "center" }); const rr = el.getBoundingClientRect(); return { left: rr.left, top: rr.top }; });
      await p.mouse.dblclick(Math.round(r.left + 20), Math.round(r.top + 12)); await pause(p, 300);
      const idx = await p.evaluate(() => window.__playground.textRuns("F_b0").map((x) => x.text).join("").indexOf("小さな菓子"));
      await p.evaluate((idx) => window.__playground.editSelect(idx, idx + 5), idx); await pause(p, 150);
      const selR = await p.evaluate((idx) => window.__playground.editingRangeRect(idx, idx + 5), idx);
      const linkLoc = await p.evaluate(() => { const l = document.querySelector('[data-ts="link"]'); return document.getElementById("moreMenu").contains(l) ? "その他" : (l && l.offsetParent !== null ? "bar" : "hidden"); });
      if (linkLoc === "その他") { await p.evaluate(() => document.getElementById("tMore").click()); await pause(p, 150); }
      const disabled = await p.evaluate(() => document.querySelector('[data-ts="link"]').disabled);
      await p.evaluate(() => { const l = document.querySelector('[data-ts="link"]'); if (l) l.click(); }); await pause(p, 200);
      const pr = await p.evaluate(() => { const rr = document.getElementById("linkPanel").getBoundingClientRect(); return { on: document.getElementById("linkPanel").classList.contains("on"), left: rr.left, top: rr.top, right: rr.right, bottom: rr.bottom }; });
      const belowSel = near(pr.top, selR.bottom + 8, 3) || pr.bottom <= selR.top + 3; const inView = pr.left >= 8 - 1 && pr.right <= w - 8 + 1 && pr.bottom <= 900 - 8 + 1;
      res["w" + w] = { linkLoc, enabled: !disabled, panelOpen: pr.on, belowSel, inView, ok: !disabled && pr.on && belowSel && inView };
      await p.keyboard.press("Escape"); await pause(p, 100); }
    await p.setViewportSize({ width: 1440, height: 1100 }); report.L20 = { ...res, pass: Object.values(res).every((r) => r.ok) }; }
  // L21：幅500の「その他」＝名前つき・高さそろい・色=文字の色・太字=太字・PC→スマホ順・区切りが先頭末尾連続にない
  { await p.setViewportSize({ width: 500, height: 900 }); await reset(p); await setDevice(p, "pc"); await pause(p, 200);
    await p.evaluate(() => { for (const id of ["linkPanel", "moreMenu", "colsPop", "brightPop"]) { const el = document.getElementById(id); if (el) el.classList.remove("on"); } }); await p.keyboard.press("Escape"); await pause(p, 120);
    const c = await center(p, "F_b0"); await p.mouse.dblclick(c.x, c.y); await pause(p, 300);
    await p.evaluate(() => document.getElementById("tMore").click()); await pause(p, 200);
    const rows = await p.evaluate(() => [...document.getElementById("moreMenu").children].map((c) => ({ nm: c.getAttribute("data-more-name") || c.textContent.trim(), h: Math.round(c.getBoundingClientRect().height) })));
    await shot(p, "L21.jpg");
    const allNamed = rows.every((x) => x.nm && x.nm.length > 0); const allTall = rows.every((x) => x.h >= 30);
    const hasColor = rows.some((x) => x.nm === "文字の色"); const hasBold = rows.some((x) => x.nm === "太字");
    const pcI = rows.findIndex((x) => x.nm === "PC"), spI = rows.findIndex((x) => x.nm === "スマホ"); const pcBeforeSp = pcI < 0 || spI < 0 || pcI < spI;
    const dividerOk = await p.evaluate(() => { for (const host of [document.getElementById("toolbar"), document.getElementById("tstools")]) { if (!host) continue; const vis = [...host.children].filter((c) => c.offsetParent !== null); for (let i = 0; i < vis.length; i++) { const c = vis[i]; if (!(c.classList && c.classList.contains("div"))) continue; const prevBtn = vis.slice(0, i).some((x) => !(x.classList && x.classList.contains("div"))); const nextBtn = vis.slice(i + 1).some((x) => !(x.classList && x.classList.contains("div"))); const prevDiv = i > 0 && vis[i - 1].classList && vis[i - 1].classList.contains("div"); if (!prevBtn || !nextBtn || prevDiv) return false; } } return true; });
    report.L21 = { allNamed, allTall, hasColor, hasBold, pcBeforeSp, dividerOk, pass: allNamed && allTall && hasColor && hasBold && pcBeforeSp && dividerOk };
    await p.keyboard.press("Escape"); await p.setViewportSize({ width: 1440, height: 1100 }); }
  // L22：幅500で品の並びを選び「その他」→「列」→見本が画面の中・押せば変わる
  { await p.setViewportSize({ width: 500, height: 900 }); await reset(p); await setDevice(p, "pc"); await pause(p, 200);
    await clickEl(p, "I_cards"); const colsLoc = await p.evaluate(() => { const b = document.getElementById("tCols"); return document.getElementById("moreMenu").contains(b) ? "その他" : (b && b.offsetParent !== null ? "bar" : "hidden"); });
    if (colsLoc === "その他") { await p.evaluate(() => document.getElementById("tMore").click()); await pause(p, 150); }
    await p.evaluate(() => document.getElementById("tCols").click()); await pause(p, 200);
    const popInView = await p.evaluate(() => { const r = document.getElementById("colsPop").getBoundingClientRect(); return document.getElementById("colsPop").classList.contains("on") && r.left >= 8 - 1 && r.right <= 500 - 8 + 1; });
    await p.evaluate(() => document.querySelector('#colsPop [data-cols-opt="2"]').click()); await pause(p, 250);
    const applied = (await listLayout(p)).I_cards.cols;
    report.L22 = { colsLoc, popInView, applied, pass: popInView && applied === 2 };
    await p.setViewportSize({ width: 1440, height: 1100 }); }

  report._errs = errs.slice(0, 8);
  await browser.close();
}

async function dragTests(p, report) {
  // L12：SP 見出しを写真上端から40%へ縦ドラッグ→並び替えない・M2 anchor F_p0・本文上端=写真下端+24・ownerOverlaps（見出し写真）・前面背面
  { await reset(p); await setDevice(p, "sp"); await pause(p, 300); await p.mouse.move(2, 2); await pause(p, 300);
    const fh0 = await p.evaluate(() => { const el = document.querySelector('[data-el="F_h0"]'); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
    const fp0 = await p.evaluate(() => { const el = document.querySelector('[data-el="F_p0"]'); const r = el.getBoundingClientRect(); return { top: r.top, h: r.height }; });
    await pressDragAlt(p, fh0.cx, fh0.cy, 0, (fp0.top + 0.4 * fp0.h) - fh0.cy, false);
    const an = await p.evaluate(() => window.__playground.anchors().find((a) => a.part === "F_h0") || null); const w = await p.evaluate(() => window.__playground.warnings()); const g = await geom(p);
    await rightClick(p, "F_h0"); const labels = await menuLabels(p); await p.keyboard.press("Escape");
    await shot(p, "L12.jpg");
    report.L12 = { anchor: an && an.anchor, mode: an && an.mode, bodyTopEq: near(g.F_b0.y, g.F_p0.y + g.F_p0.h + 24, 1), owner: w.ownerOverlaps.some((o) => (o.a === "F_h0" && o.b === "F_p0") || (o.a === "F_p0" && o.b === "F_h0")), hasZ: labels.includes("最前面へ移動 ▸") && labels.includes("最背面へ移動 ▸"), pass: !!(an && an.anchor === "F_p0" && an.mode === "M2") && near(g.F_b0.y, g.F_p0.y + g.F_p0.h + 24, 1) && w.ownerOverlaps.some((o) => (o.a === "F_h0" && o.b === "F_p0") || (o.a === "F_p0" && o.b === "F_h0")) && labels.includes("最前面へ移動 ▸") }; }   // §22 §8：z メニューのラベル変更
  // L13：SP 本文を写真下端から8上へ→帯の中で並び替え（写真→本文→見出し）・M2 にならない
  { await reset(p); await pause(p, 250); const sc = await scaleOf(p, 390);
    const fb0 = await p.evaluate(() => { const el = document.querySelector('[data-el="F_b0"]'); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
    const fp0 = await p.evaluate(() => { const el = document.querySelector('[data-el="F_p0"]'); const r = el.getBoundingClientRect(); return { bottom: r.bottom }; });
    await pressDragAlt(p, fb0.cx, fb0.cy, 0, (fp0.bottom - 8 * sc) - fb0.cy, false);
    const an = await p.evaluate(() => window.__playground.anchors().find((a) => a.part === "F_b0") || null); const g = await geom(p);
    const order = [["F_p0", g.F_p0.y], ["F_b0", g.F_b0.y], ["F_h0", g.F_h0.y]].sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    report.L13 = { order, noM2: !an || an.mode !== "M2", pass: JSON.stringify(order) === '["F_p0","F_b0","F_h0"]' && (!an || an.mode !== "M2") }; }
  // L14：押したまま（離さない）→ L13 位置で data-drop-line が見え、L12 位置で見えない
  { await reset(p); await pause(p, 250); const sc = await scaleOf(p, 390);
    const fb0 = await p.evaluate(() => { const el = document.querySelector('[data-el="F_b0"]'); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
    const fp0 = await p.evaluate(() => { const el = document.querySelector('[data-el="F_p0"]'); const r = el.getBoundingClientRect(); return { top: r.top, h: r.height, bottom: r.bottom }; });
    // L13 位置まで押したまま
    const toY13 = fp0.bottom - 8 * sc; await p.keyboard.down("Alt"); await p.mouse.move(Math.round(fb0.cx), Math.round(fb0.cy)); await p.mouse.down(); await p.keyboard.up("Alt");
    await p.mouse.move(Math.round(fb0.cx), Math.round(toY13), { steps: 4 }); await pause(p, 150);
    const lineAt13 = await p.evaluate(() => !!document.querySelector("[data-drop-line]")); const dt13 = await p.evaluate(() => window.__playground.dropTarget());
    // L12 位置（写真上端+40%）へ
    const toY12 = fp0.top + 0.4 * fp0.h; await p.mouse.move(Math.round(fb0.cx), Math.round(toY12), { steps: 4 }); await pause(p, 150);
    const lineAt12 = await p.evaluate(() => !!document.querySelector("[data-drop-line]")); const dt12 = await p.evaluate(() => window.__playground.dropTarget());
    await p.mouse.up();
    report.L14 = { lineAt13, dt13, lineAt12, dt12, pass: lineAt13 && !lineAt12 }; }
  await setDevice(p, "pc");
}

// ---- L23/L24：指（スマホ）。実機相当のタッチを CDP の Input.dispatchTouchEvent で送る ----
async function phoneTests() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  // 合成 PointerEvent（pointerType:"touch"）を getBoundingClientRect と同じ座標系で送る（CDP の端末px とレイアウトpx のズレを避ける）
  const pev = (type, x, y) => p.evaluate(({ type, x, y }) => { const el = document.elementFromPoint(x, y) || document.getElementById("stage"); el.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: 1, isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 })); }, { type, x: Math.round(x), y: Math.round(y) });
  const click = (x, y) => p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); if (el) el.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, bubbles: true, cancelable: true })); }, { x: Math.round(x), y: Math.round(y) });
  const tap = async (x, y) => { await pev("pointerdown", x, y); await pause(p, 60); await pev("pointerup", x, y); await click(x, y); await pause(p, 160); };   // 合成 pointer は click を生まないので補う（ボタンの onclick 用）
  const longPress = async (x, y) => { await pev("pointerdown", x, y); await pause(p, 650); await pev("pointerup", x, y); await pause(p, 160); };   // LP_MS=500
  const rectOf = (id) => p.evaluate((id) => { const el = document.querySelector('[data-el="' + id + '"]'); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, id);
  const coordOf = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, sel);
  const inReach = async (sel) => { let r = null; for (let i = 0; i < 5; i++) { r = await coordOf(sel); if (!r) return null; if (r.cy >= 80 && r.cy <= 760) return r; await p.evaluate((dy) => window.scrollBy(0, dy), Math.round(r.cy - 420)); await pause(p, 260); } return r; };   // 画面外の箱/つまみを見える範囲へ寄せる（箱は scroll で付いていく＝syncOverlays）
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  const mode = await p.evaluate(() => window.__playground.inputMode());

  // L23：スマホで品を長押し→箱に「列」の見本（SP=1/2）・44px・現在に印・押せば変わる
  { await reset(p); await setDevice(p, "sp"); await pause(p, 300);
    const c = await rectOf("card_photo_c_warabi"); await longPress(c.cx, c.cy);
    const box = await p.evaluate(() => { const f = document.getElementById("fmenu"); if (!f || !f.classList.contains("on")) return null; const opts = [...f.querySelectorAll("[data-cols-opt]")].map((b) => ({ n: +b.getAttribute("data-cols-opt"), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width), cur: b.classList.contains("cur"), label: b.textContent.trim() })); return { opts }; });
    const opts = box ? box.opts : [];
    const has12 = opts.length === 2 && opts[0].n === 1 && opts[1].n === 2;
    const tall = opts.length > 0 && opts.every((o) => o.h >= 44 && o.w >= 44);
    const curMarked = opts.some((o) => o.cur && o.label.includes("✓"));
    // 2列を押す（箱を見える範囲へ寄せてから撮影＋タップ）
    let applied = null;
    if (opts.length) { const b2 = await inReach('#fmenu [data-cols-opt="2"]'); await shot(p, "L23.jpg"); if (b2) { await tap(b2.cx, b2.cy); applied = (await listLayout(p, "sp")).I_cards.cols; } }
    else { await shot(p, "L23.jpg"); }
    report.L23 = { mode, boxOpen: !!box, has12, tall, curMarked, applied, pass: mode === "phone" && !!box && has12 && tall && curMarked && applied === 2 }; }

  // L24：スマホで表の右の辺のつまみを指でつかんで内側へ→幅が縮んで記録される（最小 200 を下回らない）
  { await reset(p); await setDevice(p, "sp"); await pause(p, 300);
    const r0 = await rectOf("row_name_t_warabi"); await longPress(r0.cx, r0.cy);   // 行を長押し→I_table 選択
    const firstSel = await p.evaluate(() => { const h = document.querySelector('.rz-handle[data-handle-for="I_table"]'); return !!h; });
    const w0 = (await listLayout(p, "sp")).I_table.w;
    await p.evaluate(() => document.getElementById("fmenu").classList.remove("on"));   // 箱がつまみに重ならないよう畳む（選択は保つ）
    // 東（右）のつまみを見える範囲へ寄せてから画面座標を取る
    const eh = await inReach('.rz-handle[data-handle="e"][data-handle-for="I_table"]');
    let w1 = w0, shrank = false, minHeld = true;
    if (eh) {
      await pev("pointerdown", eh.cx, eh.cy); await pause(p, 80);
      await pev("pointermove", eh.cx - 80, eh.cy); await pause(p, 80);
      await pev("pointermove", eh.cx - 160, eh.cy); await pause(p, 80);
      await pev("pointerup", eh.cx - 160, eh.cy); await pause(p, 200);
      w1 = (await listLayout(p, "sp")).I_table.w; shrank = w1 < w0 - 1; minHeld = w1 >= 200 - 1;
    }
    await shot(p, "L24.jpg");
    report.L24 = { mode, firstSel, w0: +w0.toFixed(1), w1: +w1.toFixed(1), shrank, minHeld, pass: mode === "phone" && firstSel && shrank && minHeld }; }

  report._errsPhone = errs.slice(0, 8);
  await browser.close();
}

await run();
await phoneTests();
fs.writeFileSync(path.join(here, "_verify_l20.json"), JSON.stringify(report, null, 2));
console.log("=== 試験台20 L1〜L19（PC/SP。L20〜L24 は窓幅/指＝別途）===");
for (const k of Object.keys(report)) if (!k.startsWith("_")) console.log(k + ": " + (report[k].pass ? "OK" : "NG") + " " + JSON.stringify(report[k]));
if (report._errs && report._errs.length) console.log("ERRORS: " + JSON.stringify(report._errs));
