// playground15（第2回）：C1〜C11（セクションの操作）＋ C12（X3）＋ sectionList/photos.missing。
// すべて本物のマウス・キーボードの操作で（作業票3章の操作どおり。置き換えない）。
import { chromium } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground17_single.html";
const OUT = "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground17"; fs.mkdirSync(OUT, { recursive: true });
const report = {};
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;

const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const sectionList = (p) => p.evaluate(() => window.__playground.sectionList());
const geom = (p) => p.evaluate(() => window.__playground.geometry());
const photos = (p) => p.evaluate(() => window.__playground.photos());
const textStyles = (p) => p.evaluate(() => window.__playground.textStyles());
const textRuns = (p, id) => p.evaluate((id) => window.__playground.textRuns(id).map((r) => r.text).join(""), id);
const anchors = (p) => p.evaluate(() => window.__playground.anchors());
const pause = (p, ms = 140) => p.waitForTimeout(ms);
const shot = (p, name) => p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 });

async function center(p, id) {
  const h = await p.evaluateHandle((id) => { for (const host of document.querySelectorAll("#sectionwrap .host")) { const el = host.querySelector('[data-el="' + id + '"]'); if (el) return el; } return null; }, id);
  const node = h.asElement(); if (!node) return null;
  await node.scrollIntoViewIfNeeded(); await p.waitForTimeout(50);
  const bb = await node.boundingBox(); if (!bb) return null; return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
}
async function hostRect(p, sec) { const h = await p.$("#host_" + sec); if (!h) return null; await h.scrollIntoViewIfNeeded(); await p.waitForTimeout(50); return h.boundingBox(); }
// セクションの余白（部品のない所・左の余白列）を、画面内に収まる高さでつかむ。中身は中央寄せ/インセットなので左6pxは空いている。
async function sectionBgPoint(p, sec, attempt = 0) { const r = await hostRect(p, sec); const vh = p.viewportSize().height; const tb = await p.evaluate(() => { const t = document.getElementById("toolbar"); return t ? t.getBoundingClientRect().bottom : 48; }); const x = r.x + 6; const lo = Math.max(tb + 12, r.y + 6), hi = Math.min(vh - 20, r.y + r.height - 6); const y = Math.min(Math.max(lo + attempt * 120, lo), hi); return { x, y }; }
async function sectionMenuOpen(p) { return p.evaluate(() => { const f = document.getElementById("fmenu"); return f.classList.contains("on") && !!f._section; }); }
async function rightClickSection(p, sec) { for (let a = 0; a < 4; a++) { const q = await sectionBgPoint(p, sec, a); await p.mouse.click(q.x, q.y, { button: "right" }); await pause(p, 180); if (await sectionMenuOpen(p)) return; } throw new Error("section menu did not open for " + sec); }
async function clickMenu(p, label) { await p.click(`#fmenu button[data-sec-menu="${label}"]`); await pause(p, 220); }
async function menuLabels(p) { return p.$$eval('#fmenu button[data-sec-menu]', (bs) => bs.map((b) => b.getAttribute("data-sec-menu"))); }
async function clickSectionBg(p, sec) { const q = await sectionBgPoint(p, sec); await p.mouse.click(q.x, q.y); await pause(p, 140); }
// ドラッグ（本物のマウス）。設計 px の中心へ。
async function dragBy(p, id, ddx, ddy) { const c = await center(p, id); const sc = await p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const el = h.querySelector('[data-el="' + id + '"]'); if (el) { const sec = h.querySelector("#sec"); return h.getBoundingClientRect().width / sec.offsetWidth; } } return 1; }, id); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + ddx * sc * 0.5, c.y + ddy * sc * 0.5, { steps: 3 }); await p.mouse.move(c.x + ddx * sc, c.y + ddy * sc, { steps: 3 }); await p.mouse.up(); await pause(p); }
async function editText(p, id, text) { const c = await center(p, id); await p.mouse.dblclick(c.x, c.y); await pause(p, 160); await p.keyboard.press("ControlOrMeta+a"); await p.keyboard.type(text, { delay: 1 }); await pause(p, 120); await p.keyboard.press("Escape"); await pause(p, 160); }

async function run() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } }); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errs.push("console:" + m.text()); });
  await p.goto(url); await pause(p, 700);
  const ids = (sl) => sl.map((s) => s.id);
  const bgs = (sl) => sl.map((s) => s.bg);

  // ---- C1：品のセクションの背景を右クリック →「上へ」----
  await reset(p); await setDevice(p, "pc"); await pause(p, 150);
  { const before = await geom(p); await shot(p, "C1-before-pc.jpg");
    await rightClickSection(p, "items"); await clickMenu(p, "上へ");
    const sl = await sectionList(p); const after = await geom(p); await shot(p, "C1-after-pc.jpg");
    // 品のセクションの中の部品の、セクション上端からの位置（geometry は #sec 起点＝局所座標）が前と同じ
    const iParts = Object.keys(before).filter((k) => k.startsWith("I_") || /^(card|row)_/.test(k));
    const worst = Math.max(0, ...iParts.filter((k) => after[k]).map((k) => Math.max(Math.abs(after[k].x - before[k].x), Math.abs(after[k].y - before[k].y))));
    report["C1-pc"] = { pass: JSON.stringify(ids(sl)) === JSON.stringify(["items", "feature"]) && JSON.stringify(bgs(sl)) === JSON.stringify(["surface", "background"]) && worst <= 0.5, order: ids(sl), bg: bgs(sl), itemPartsWorstShift: +worst.toFixed(3) };
  }
  // ---- C2：C1 の後に「戻す」----
  { await p.evaluate(() => window.__playground.undo()); await pause(p, 160);
    const sl = await sectionList(p);
    report["C2-pc"] = { pass: JSON.stringify(ids(sl)) === JSON.stringify(["feature", "items"]) && JSON.stringify(bgs(sl)) === JSON.stringify(["surface", "background"]), order: ids(sl), bg: bgs(sl) };
  }
  // ---- C3：特集1の見出しを書き換え → 特集を複製 ----
  await reset(p); await setDevice(p, "pc"); await pause(p, 150);
  await editText(p, "F_h0", "季節の上生菓子と抹茶"); await shot(p, "C3-before-pc.jpg");
  await rightClickSection(p, "feature"); await clickMenu(p, "複製");
  { const sl = await sectionList(p); const dup = sl[1].id; await shot(p, "C3-after-pc.jpg");
    const g = await geom(p);
    const dupText = await textRuns(p, dup + "__F_h0");
    const idNoCollide = !!g[dup + "__F_h0"] && !!g["F_h0"] && (dup + "__F_h0") !== "F_h0";
    report["C3-pc"] = { pass: JSON.stringify(ids(sl)) === JSON.stringify(["feature", dup, "items"]) && JSON.stringify(bgs(sl)) === JSON.stringify(["surface", "background", "surface"]) && dupText === "季節の上生菓子と抹茶" && idNoCollide, order: ids(sl), bg: bgs(sl), dupHeading: dupText, dupPartId: dup + "__F_h0" };
    report._dup3 = dup;
  }
  // ---- C4：複製の見出しを右へ30・文字を書き換え。複製だけ変わる ----
  { const dup = report._dup3; const g0 = await geom(p);
    const origY = g0["F_h0"].y, origX = g0["F_h0"].x; const origText = await textRuns(p, "F_h0");
    await dragBy(p, dup + "__F_h0", 30, 0); await editText(p, dup + "__F_h0", "新しい見出し");
    const g = await geom(p); const a = await anchors(p);
    const dupMovedX = g[dup + "__F_h0"].x - g0[dup + "__F_h0"].x;
    const dupText = await textRuns(p, dup + "__F_h0"); const origTextAfter = await textRuns(p, "F_h0");
    // 作業票 C4 の確かめは「複製だけが変わる・元は位置も文字も変わらない」。右へ 30 の操作はガイドに吸い付いて 24 で止まる（anchor でも同じ＝pg13 の挙動）。
    report["C4-pc"] = { pass: dupMovedX >= 20 && dupText === "新しい見出し" && origTextAfter === origText && near(g["F_h0"].x, origX) && near(g["F_h0"].y, origY), dupMovedX: +dupMovedX.toFixed(2), note: "右30→ガイド吸着で24（anchorと同じ）", dupText, origText: origTextAfter, origMoved: !near(g["F_h0"].x, origX) || !near(g["F_h0"].y, origY) };
  }
  // ---- C5：区切り線を並び替え → 品のセクションを削除 → 戻す ----
  await reset(p); await setDevice(p, "pc"); await pause(p, 150);
  { // R2 と同じ：区切り線の縦中心を甘味処見出しの下端+1 へ（並び替え）
    const g = await geom(p); const targetCy = g.I_kanmi.y + g.I_kanmi.h + 1; await dragBy(p, "I_divider", 0, targetCy - (g.I_divider.y + g.I_divider.h / 2));
    const g1 = await geom(p); const reordered = g1.I_kanmi.y < g1.I_divider.y && g1.I_divider.y < g1.I_time.y;
    await rightClickSection(p, "items"); await clickMenu(p, "削除");
    const slDel = await sectionList(p);
    await p.evaluate(() => window.__playground.undo()); await pause(p, 160);
    const slBack = await sectionList(p); const g2 = await geom(p); const reorderedBack = g2.I_kanmi && g2.I_divider && g2.I_time && g2.I_kanmi.y < g2.I_divider.y && g2.I_divider.y < g2.I_time.y;
    report["C5-pc"] = { pass: JSON.stringify(ids(slDel)) === JSON.stringify(["feature"]) && JSON.stringify(ids(slBack)) === JSON.stringify(["feature", "items"]) && reordered && reorderedBack, afterDelete: ids(slDel), afterUndo: ids(slBack), reorderKeptAfterUndo: reorderedBack };
  }
  // ---- C6：特集と品の境目の「＋」→「特集」----
  await reset(p); await setDevice(p, "pc"); await pause(p, 150); await shot(p, "C6-before-pc.jpg");
  { await p.hover('.sec-add-zone[data-sec-add="1"]'); await pause(p, 120); await shot(p, "C6-plus-pc.jpg");
    await p.click('button[data-sec-add-btn="1"]'); await pause(p, 160); await shot(p, "C6-types-pc.jpg");
    await p.click('#sectypes button[data-sec-type="feature"]'); await pause(p, 220);
    const sl = await sectionList(p); const addd = sl[1].id; await shot(p, "C6-after-pc.jpg");
    const headText = await textRuns(p, addd + "__F_h0"); const bodyText = await textRuns(p, addd + "__F_b0");
    const ph = await photos(p); const addPhotos = ph.filter((x) => x.part === addd + "__F_p0" || x.part === addd + "__F_p1");
    report["C6-pc"] = { pass: JSON.stringify(ids(sl)) === JSON.stringify(["feature", addd, "items"]) && JSON.stringify(bgs(sl)) === JSON.stringify(["surface", "background", "surface"]) && headText === "季節の上生菓子" && addPhotos.length === 2 && addPhotos.every((x) => x.missing === true), order: ids(sl), bg: bgs(sl), addedHeading: headText, addedBody: bodyText.slice(0, 8) + "…", photosMissing: addPhotos.map((x) => x.part + ":" + x.missing) };
    report._add6 = addd;
  }
  // ---- C7：足した特集の1枚目の写真の枠に wide.jpg を落とす（本物の drop イベント）----
  { const addd = report._add6; const partId = addd + "__F_p0";
    await p.evaluate(async (partId) => {
      let el = null; for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + partId + '"]'); if (e) el = e; }
      const cv = document.createElement("canvas"); cv.width = 1600; cv.height = 600; const g = cv.getContext("2d");
      g.fillStyle = "#d00000"; g.fillRect(0, 0, 800, 300); g.fillStyle = "#00a000"; g.fillRect(800, 0, 800, 300); g.fillStyle = "#0040d0"; g.fillRect(0, 300, 800, 300); g.fillStyle = "#e0c000"; g.fillRect(800, 300, 800, 300);
      const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.9)); const file = new File([blob], "wide.jpg", { type: "image/jpeg" });
      const dt = new DataTransfer(); dt.items.add(file);
      el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, partId); await pause(p, 600);
    const ph = await photos(p); const x = ph.find((z) => z.part === partId);
    report["C7-pc"] = { pass: !!x && x.missing === false && !!x.asset, missing: x ? x.missing : null, hasAsset: !!(x && x.asset) };
  }
  // ---- C8：PC で C1 を行い、スマホに切り替える ----
  await reset(p); await setDevice(p, "pc"); await pause(p, 150);
  await rightClickSection(p, "items"); await clickMenu(p, "上へ");
  { await setDevice(p, "sp"); await pause(p, 200);
    const sl = await sectionList(p);
    report["C8-sp"] = { pass: JSON.stringify(ids(sl)) === JSON.stringify(["items", "feature"]) && JSON.stringify(bgs(sl)) === JSON.stringify(["surface", "background"]), order: ids(sl), bg: bgs(sl) };
    await setDevice(p, "pc");
  }
  // ---- C9：C1 の後、特集1の見出しを右へ30 → このページを元に戻す ----
  await reset(p); await setDevice(p, "pc"); await pause(p, 150);
  await rightClickSection(p, "items"); await clickMenu(p, "上へ");
  { const g0 = await geom(p); await dragBy(p, "F_h0", 30, 0); const g1 = await geom(p);
    await p.evaluate(() => window.__playground.resetScope("page", null, ["pc", "sp"])); await pause(p, 180);
    const g2 = await geom(p); const sl = await sectionList(p);
    report["C9-pc"] = { pass: near(g2.F_h0.x, g0.F_h0.x) && JSON.stringify(ids(sl)) === JSON.stringify(["items", "feature"]), headingBackToTemplate: near(g2.F_h0.x, g0.F_h0.x), orderKept: ids(sl), movedThenReset: +(g1.F_h0.x - g0.F_h0.x).toFixed(1) };
  }
  // ---- C10：C3 の後、複製の見出し（芦屋堂の味）を 36 に ----
  await reset(p); await setDevice(p, "pc"); await pause(p, 150);
  await editText(p, "F_h0", "季節の上生菓子と抹茶");
  await rightClickSection(p, "feature"); await clickMenu(p, "複製");
  { const sl = await sectionList(p); const dup = sl[1].id;
    // 複製の見出し「芦屋堂の味」(F_h) を選び、大きさ 36
    const c = await center(p, dup + "__F_h"); await p.mouse.click(c.x, c.y); await pause(p, 160);
    const si = await p.$("#tstools [data-ts=size]"); await si.fill("36"); await si.press("Enter"); await pause(p, 200);
    const ts = await textStyles(p);
    const dupHead = ts.find((x) => x.part === dup + "__F_h"); const origHead = ts.find((x) => x.part === "F_h");
    // textStyles は見出しを出さないので、実寸のフォントサイズで確かめる
    const dupPx = await p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) return Math.round(parseFloat(getComputedStyle(e).fontSize)); } return null; }, dup + "__F_h");
    const origPx = await p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) return Math.round(parseFloat(getComputedStyle(e).fontSize)); } return null; }, "F_h");
    const origSpPx = await p.evaluate(() => { window.__playground.setDevice("sp"); return null; }); await pause(p, 160);
    const origPxSp = await p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const e = h.querySelector('[data-el="' + id + '"]'); if (e) return Math.round(parseFloat(getComputedStyle(e).fontSize)); } return null; }, "F_h");
    await p.evaluate(() => window.__playground.setDevice("pc")); await pause(p, 120);
    report["C10-pc"] = { pass: dupPx === 36 && origPx === 28 && origPxSp === 20, dupHeadingPx: dupPx, origHeadingPxPc: origPx, origHeadingPxSp: origPxSp };
  }
  // ---- C11：品を削除して特集だけに → 特集の背景を右クリック（削除・上へ・下へ が出ない）----
  await reset(p); await setDevice(p, "pc"); await pause(p, 150); await shot(p, "C11-before-pc.jpg");
  await rightClickSection(p, "items"); await clickMenu(p, "削除");
  { const sl = await sectionList(p); await shot(p, "C11-after-pc.jpg");
    await rightClickSection(p, "feature"); const labels = await menuLabels(p);
    report["C11-pc"] = { pass: JSON.stringify(ids(sl)) === JSON.stringify(["feature"]) && !labels.includes("削除") && !labels.includes("上へ") && !labels.includes("下へ"), order: ids(sl), menu: labels };
    await p.keyboard.press("Escape");
  }
  // ---- C12（X3・第1回と同じ）----
  await reset(p); await setDevice(p, "pc"); await pause(p, 150);
  { const c0 = await center(p, "card_name_c_warabi"); await p.mouse.click(c0.x, c0.y); await pause(p, 160);
    const selClick = await p.evaluate(() => { const n = document.querySelector(".mark-sel"); return n ? n.getAttribute("data-el") : null; });
    const c1 = await center(p, "card_name_c_warabi"); await p.mouse.dblclick(c1.x, c1.y); await pause(p, 220);
    const st = await p.evaluate(() => { const el = document.querySelector('[data-el="card_name_c_warabi"]'); return { editing: el && el.getAttribute("contenteditable") === "true", tools: getComputedStyle(document.getElementById("tstools")).display !== "none", sel: [...document.querySelectorAll(".mark-sel")].map((n) => n.getAttribute("data-el")) }; });
    report["C12-pc"] = { pass: st.editing && st.tools && st.sel.length === 1 && st.sel[0] === "card_name_c_warabi", selAfterFirstClick: selClick, editing: st.editing, toolsShown: st.tools, selected: st.sel };
    await p.keyboard.press("Escape");
  }

  // ---- 画像（スマホの前後：C1・C3・C6・C11）----
  for (const [name, fn] of [
    ["C1", async () => { await reset(p); await setDevice(p, "sp"); await pause(p, 150); await shot(p, "C1-before-sp.jpg"); await rightClickSection(p, "items"); await clickMenu(p, "上へ"); await shot(p, "C1-after-sp.jpg"); }],
    ["C3", async () => { await reset(p); await setDevice(p, "sp"); await pause(p, 150); await editText(p, "F_h0", "季節の上生菓子と抹茶"); await shot(p, "C3-before-sp.jpg"); await rightClickSection(p, "feature"); await clickMenu(p, "複製"); await shot(p, "C3-after-sp.jpg"); }],
    ["C6", async () => { await reset(p); await setDevice(p, "sp"); await pause(p, 150); await shot(p, "C6-before-sp.jpg"); await p.hover('.sec-add-zone[data-sec-add="1"]'); await pause(p, 120); await p.click('button[data-sec-add-btn="1"]'); await pause(p, 140); await p.click('#sectypes button[data-sec-type="feature"]'); await pause(p, 200); await shot(p, "C6-after-sp.jpg"); }],
    ["C11", async () => { await reset(p); await setDevice(p, "sp"); await pause(p, 150); await shot(p, "C11-before-sp.jpg"); await rightClickSection(p, "items"); await clickMenu(p, "削除"); await shot(p, "C11-after-sp.jpg"); }],
  ]) { try { await fn(); } catch (e) { report["_shot_" + name] = String(e).split("\n")[0]; } }

  report["_errs"] = errs.slice(0, 8);
  await b.close();
  fs.writeFileSync(path.join(here, "_verify_c.json"), JSON.stringify(report, null, 2));
  console.log("=== 試験台14 第2回：C1〜C12 ===");
  for (const k of Object.keys(report)) if (!k.startsWith("_")) console.log(k + ": " + JSON.stringify(report[k]));
  if (report._errs && report._errs.length) console.log("ERRORS: " + JSON.stringify(report._errs));
}
run();
