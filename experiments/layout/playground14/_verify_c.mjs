// playground14（第1回）：C12（X3 の直し）＋ sectionList()・photos().missing の確認。本物のマウスで確かめる。
// C1〜C11（セクションの操作）は第2回。ここでは土台と X3 だけを見る。
import { chromium } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + path.resolve("refs/compare/layout/playground14_single.html");
const report = {};
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;

const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const sectionList = (p) => p.evaluate(() => window.__playground.sectionList());
const photos = (p) => p.evaluate(() => window.__playground.photos());
const pause = (p, ms = 120) => p.waitForTimeout(ms);

// 部品の画面上の中心（host をまたいで探す）。画面の外にあればスクロールして入れてから測る。
async function center(p, id) {
  const h = await p.evaluateHandle((id) => { for (const host of document.querySelectorAll("#sectionwrap .host")) { const el = host.querySelector('[data-el="' + id + '"]'); if (el) return el; } return null; }, id);
  const node = h.asElement(); if (!node) return null;
  await node.scrollIntoViewIfNeeded(); await p.waitForTimeout(60);
  const bb = await node.boundingBox(); if (!bb) return null;
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
}

async function run() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } }); const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errs.push("console:" + m.text()); });
  await p.goto(url); await pause(p, 800);

  // ---- sectionList()（PC）----
  await reset(p); await setDevice(p, "pc"); await pause(p, 200);
  { const sl = await sectionList(p);
    const ok = sl.length === 2 && sl[0].id === "feature" && sl[0].type === "feature" && sl[0].bg === "surface"
      && sl[1].id === "items" && sl[1].type === "items" && sl[1].bg === "background"
      && near(sl[0].top, 0) && sl[0].height > 0 && near(sl[1].top, sl[0].height) && sl[1].height > 0;
    report["sectionList-pc"] = { pass: ok, list: sl };
  }
  // ---- sectionList()（スマホ・並び順と bg は端末に依らない）----
  await setDevice(p, "sp"); await pause(p, 200);
  { const sl = await sectionList(p);
    const ok = sl.length === 2 && sl[0].id === "feature" && sl[0].bg === "surface" && sl[1].id === "items" && sl[1].bg === "background";
    report["sectionList-sp"] = { pass: ok, order: sl.map((s) => s.id + ":" + s.bg) };
  }
  // ---- photos().missing（第1回はテンプレの写真＝すべて missing:false）----
  await setDevice(p, "pc"); await pause(p, 200);
  { const ph = await photos(p);
    const hasField = ph.every((x) => "missing" in x);
    const allFalse = ph.every((x) => x.missing === false);
    report["photos-missing"] = { pass: hasField && allFalse, count: ph.length, anyMissing: ph.filter((x) => x.missing).map((x) => x.part) };
  }

  // ---- C12（X3）：品の並びを1回クリックで選び、そのまま わらび餅の名前をダブルクリック ----
  await reset(p); await setDevice(p, "pc"); await pause(p, 200);
  const nameId = "card_name_c_warabi";
  const c0 = await center(p, nameId);
  await p.mouse.click(c0.x, c0.y); await pause(p, 160);            // 1回クリック＝品の並び（I_cards）が選ばれる
  const selAfterClick = await p.evaluate(() => { const n = document.querySelector(".mark-sel"); return n ? n.getAttribute("data-el") : null; });
  const c1 = await center(p, nameId);                               // 選択で少し動くことがあるので測り直す
  await p.mouse.dblclick(c1.x, c1.y); await pause(p, 220);          // そのまま名前をダブルクリック
  const st = await p.evaluate((id) => {
    const el = document.querySelector('[data-el="' + id + '"]');
    const editing = el && el.getAttribute("contenteditable") === "true";
    const tools = document.getElementById("tstools");
    const toolsShown = tools && getComputedStyle(tools).display !== "none";
    const sel = [...document.querySelectorAll(".mark-sel")].map((n) => n.getAttribute("data-el"));
    return { editing, toolsShown, sel };
  }, nameId);
  report["C12-pc"] = {
    pass: st.editing === true && st.toolsShown === true && st.sel.length === 1 && st.sel[0] === nameId,
    selAfterFirstClick: selAfterClick, editing: st.editing, toolsShown: st.toolsShown, selected: st.sel,
  };
  await p.keyboard.press("Escape"); await pause(p, 150);

  report["_errs"] = errs.slice(0, 5);
  await b.close();
  fs.writeFileSync(path.join(here, "_verify_c.json"), JSON.stringify(report, null, 2));
  console.log("=== 試験台14 第1回：C12・sectionList・photos.missing ===");
  for (const k of Object.keys(report)) if (!k.startsWith("_")) console.log(k + ": " + JSON.stringify(report[k]));
  if (report._errs.length) console.log("ERRORS: " + JSON.stringify(report._errs));
}
run();
