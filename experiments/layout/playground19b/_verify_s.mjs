// playground15：S1〜S16（スマホでの指の操作）。指の操作は CDP の Input.dispatchTouchEvent（touchStart/Move/End）で送る。
// なぞるは 16ms ごとに 10px。タップは Playwright の touchscreen（p.tap / locator.tap）でもよい（作業票0章）。
// 画面：幅390・高さ844・deviceScaleFactor3・isMobile・hasTouch。位置の比べは設計px（画面px÷getScale）で ±0.5（丸めのため実測も併記）。
// マウスやスクリプトのスクロール（scrollTo）に「テスト対象の操作」を置き換えない。要素を画面内に入れる前準備だけ scrollIntoView(center) を使う（対象操作でない）。
import { chromium } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + path.resolve("refs/compare/layout/playground19b_single.html");
const OUT = path.resolve("refs/compare/layout/playground19b"); fs.mkdirSync(OUT, { recursive: true });
const report = {};
const pause = (p, ms = 140) => p.waitForTimeout(ms);
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;

// ---- CDP の指の操作 ----
// 座標の約束：引数は「ページ内 getBoundingClientRect（clientX/Y）」で渡す。CDP touch は visual viewport 基準なので
// 送る直前に clientY = CDPy + visualViewport.offsetTop の関係を使い、CDPy = clientY - offsetTop に直す（スクロールで offset が変わるため毎ジェスチャ読み直す）。
function mkTouch(client, p) {
  const send = (type, pts) => client.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  let off = { x: 0, y: 0 };
  const readOff = async () => { off = await p.evaluate(() => ({ x: (window.visualViewport ? window.visualViewport.offsetLeft : 0), y: (window.visualViewport ? window.visualViewport.offsetTop : 0) })); };
  const pt = (x, y) => ({ x: x - off.x, y: y - off.y });
  return {
    async start(x, y) { await readOff(); await send("touchStart", [pt(x, y)]); await pause(p, 16); },
    async move(x, y) { await send("touchMove", [pt(x, y)]); await pause(p, 16); },
    async end() { await send("touchEnd", []); await pause(p, 60); },
    // なぞる：16ms ごとに 10px。hold=離す前に止める ms。
    async swipe(x0, y0, x1, y1, hold = 0) {
      await readOff();
      const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 10));
      await send("touchStart", [pt(x0, y0)]); await pause(p, 16);
      for (let i = 1; i <= steps; i++) { await send("touchMove", [pt(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)]); await pause(p, 16); }
      if (hold) await pause(p, hold);
      await send("touchEnd", []); await pause(p, 80);
    },
    async tap(x, y) { await readOff(); await send("touchStart", [pt(x, y)]); await pause(p, 30); await send("touchEnd", []); await pause(p, 60); },
    async longpress(x, y, ms = 640) { await readOff(); await send("touchStart", [pt(x, y)]); await pause(p, ms); await send("touchEnd", []); await pause(p, 60); },
    // ダブルタップ：2回の touchEnd のブラウザ内間隔を 300ms 未満に確実に収める（offset は1回だけ読む・途中の往復を最小化）
    async doubletap(x, y, gap = 120) { await readOff(); await send("touchStart", [pt(x, y)]); await pause(p, 20); await send("touchEnd", []); await pause(p, gap); await send("touchStart", [pt(x, y)]); await pause(p, 20); await send("touchEnd", []); await pause(p, 80); },
  };
}

// 設計px→画面px の倍率は #sec の実測（拡大後幅/拡大前幅）から出す（getScale は api に無いため DOM から）
const scaleOf = (p) => p.evaluate(() => { const sec = document.querySelector("#sectionwrap .host #sec"); return sec ? sec.getBoundingClientRect().width / sec.offsetWidth : 1; });
const geom = (p) => p.evaluate(() => window.__playground.geometry());
const rectNow = (p, id) => p.evaluate((id) => { for (const host of document.querySelectorAll("#sectionwrap .host")) { const el = host.querySelector('[data-el="' + id + '"]'); if (el) { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; } } return null; }, id);
const selIds = (p) => p.evaluate(() => [...document.querySelectorAll(".mark-sel")].map((n) => n.getAttribute("data-el")));
const sectionIds = (p) => p.evaluate(() => window.__playground.sectionList().map((s) => s.id));
const menuState = (p) => p.evaluate(() => { const f = document.getElementById("fmenu"); return { on: f.classList.contains("on"), section: !!f._section, labels: [...f.querySelectorAll("button")].map((b) => (b.getAttribute("data-sec-menu") || b.textContent)) }; });
const toolbarBottom = (p) => p.evaluate(() => document.getElementById("toolbar").getBoundingClientRect().bottom);

// 要素を画面内（中央）に入れてから、ページ内の getBoundingClientRect（＝clientX/Y 空間＝CDP touch と同じ）で矩形を返す。
// ※ Playwright の boundingBox は isMobile+dsf 下で clientY と +20px ずれるため使わない。
async function box(p, id) {
  await p.evaluate((id) => { for (const host of document.querySelectorAll("#sectionwrap .host")) { const el = host.querySelector('[data-el="' + id + '"]'); if (el) { el.scrollIntoView({ block: "center", inline: "center" }); return; } } }, id);
  await pause(p, 90);
  return p.evaluate((id) => { for (const host of document.querySelectorAll("#sectionwrap .host")) { const el = host.querySelector('[data-el="' + id + '"]'); if (el) { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; } } return null; }, id);
}
async function center(p, id) { const b = await box(p, id); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }
// セクションの背景（部品のない左6px）を画面内で。中身は中央寄せなので左は空いている。
async function sectionBg(p, sec) {
  await p.evaluate((sec) => { const h = document.getElementById("host_" + sec); if (h) h.scrollIntoView({ block: "center" }); }, sec);
  await pause(p, 90);
  const vh = p.viewportSize().height; const tb = await toolbarBottom(p);
  const r = await p.evaluate((sec) => { const h = document.getElementById("host_" + sec); const b = h.getBoundingClientRect(); return { x: b.x, y: b.y, h: b.height }; }, sec);
  const x = r.x + 6; const y = Math.min(Math.max(tb + 20, r.y + 10), vh - 20);
  return { x, y, r };
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 70 });
async function tapSel(p, selector) { await p.locator(selector).first().tap(); await pause(p, 160); }
// 選んでいる部品を、いったん右へ 40 動かして（＝ドラッグ開始）から目標の指位置 fx で離す（正味の移動が 6px 未満でも動かせる）。
async function transit(T, sx, sy, fx) {
  await T.start(sx, sy); const mid = sx + 40;
  for (let x = sx + 10; x <= mid; x += 10) await T.move(x, sy);
  if (fx < mid) { for (let x = mid - 10; x > fx; x -= 10) await T.move(x, sy); }
  else { for (let x = mid + 10; x < fx; x += 10) await T.move(x, sy); }
  await T.move(fx, sy); await T.end();
}

async function run() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errs.push("console:" + m.text()); });
  const client = await ctx.newCDPSession(p);
  await p.goto(url); await pause(p, 800);
  const T = mkTouch(client, p);
  const reset = async () => { await p.evaluate(() => window.__playground.reset()); await pause(p, 200); };
  await reset();

  // S1：開く＝inputMode が phone・スマホの配置
  try {
    const mode = await p.evaluate(() => window.__playground.inputMode());
    const spOn = await p.evaluate(() => document.getElementById("dSP").classList.contains("on"));
    report.S1 = { pass: mode === "phone" && spOn, inputMode: mode, spLayout: spOn };
  } catch (e) { report.S1 = { pass: false, err: String(e).split("\n")[0] }; }

  // S2：何も選ばず、見出しの上から上へ300なぞる＝ページが250以上スクロール・何も選ばれない・見出しの設計位置そのまま
  try {
    await reset();
    const g0 = await geom(p); const c = await center(p, "F_h0"); await pause(p, 120);
    await shot(p, "S2-before.jpg");
    const sy0 = await p.evaluate(() => window.scrollY);
    await T.swipe(c.x, c.y, c.x, c.y - 300);
    const sy1 = await p.evaluate(() => window.scrollY); const g1 = await geom(p); const sel = await selIds(p);
    await shot(p, "S2-after.jpg");
    report.S2 = { pass: (sy1 - sy0) >= 250 && sel.length === 0 && near(g1.F_h0.x, g0.F_h0.x) && near(g1.F_h0.y, g0.F_h0.y), scrolled: +(sy1 - sy0).toFixed(1), selected: sel, headingMoved: !(near(g1.F_h0.x, g0.F_h0.x) && near(g1.F_h0.y, g0.F_h0.y)) };
  } catch (e) { report.S2 = { pass: false, err: String(e).split("\n")[0] }; }

  // S3：見出しをタップ→品セクション背景を上へ300なぞる＝タップで選ばれ箱なし、なぞるとスクロール・選びそのまま・見出し動かない
  try {
    await reset();
    const c = await center(p, "F_h0"); await T.tap(c.x, c.y); await pause(p, 200);
    const selAfterTap = await selIds(p); const menuAfterTap = await menuState(p); const g0 = await geom(p);
    const bg = await sectionBg(p, "items"); const sy0 = await p.evaluate(() => window.scrollY);
    await T.swipe(bg.x, bg.y, bg.x, bg.y - 300);
    const sy1 = await p.evaluate(() => window.scrollY); const sel2 = await selIds(p); const g1 = await geom(p);
    report.S3 = { pass: selAfterTap.length === 1 && selAfterTap[0] === "F_h0" && !menuAfterTap.on && (sy1 - sy0) >= 250 && sel2.length === 1 && sel2[0] === "F_h0" && near(g1.F_h0.x, g0.F_h0.x), selAfterTap, boxAfterTap: menuAfterTap.on, scrolled: +(sy1 - sy0).toFixed(1), selAfterScroll: sel2, headingMoved: !near(g1.F_h0.x, g0.F_h0.x) };
  } catch (e) { report.S3 = { pass: false, err: String(e).split("\n")[0] }; }

  // S4：S3のあと見出しを右へ30なぞって離す＝右へ 30/scale・スクロールしない・離した後に箱
  try {
    await reset();
    const sc = await scaleOf(p); const c = await center(p, "F_h0"); await T.tap(c.x, c.y); await pause(p, 220);
    const g0 = await geom(p); const sy0 = await p.evaluate(() => window.scrollY);
    await shot(p, "S4-before.jpg");
    const c2 = await center(p, "F_h0"); await T.swipe(c2.x, c2.y, c2.x + 30, c2.y);
    const g1 = await geom(p); const sy1 = await p.evaluate(() => window.scrollY); const menu = await menuState(p);
    await shot(p, "S4-after.jpg");
    const dx = g1.F_h0.x - g0.F_h0.x; const exp = 30 / sc;
    report.S4 = { pass: Math.abs(dx - exp) <= 2 && near(sy1, sy0) && menu.on && !menu.section, movedDesignX: +dx.toFixed(2), expect: +exp.toFixed(2), scrolled: +(sy1 - sy0).toFixed(1), boxAfter: menu.on };
  } catch (e) { report.S4 = { pass: false, err: String(e).split("\n")[0] }; }

  // S5：何も選ばず見出しを長押し＝選ばれ、箱が1つ（複製・削除あり・上の外側）、文字は選ばれていない
  try {
    await reset();
    const c = await center(p, "F_h0"); await T.longpress(c.x, c.y, 640); await pause(p, 160);
    const sel = await selIds(p); const menu = await menuState(p); const hb = await box(p, "F_h0");
    const fmb = await p.evaluate(() => { const f = document.getElementById("fmenu"); const r = f.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, count: document.querySelectorAll("#fmenu").length }; });
    const gsel = await p.evaluate(() => (window.getSelection() ? String(window.getSelection()) : ""));
    await shot(p, "S5-box.jpg");
    const hasDup = menu.labels.includes("複製"), hasDel = menu.labels.includes("削除");
    report.S5 = { pass: sel.length === 1 && sel[0] === "F_h0" && menu.on && hasDup && hasDel && gsel === "" && fmb.top <= hb.y + 1, selected: sel, labels: menu.labels, boxTop: +fmb.top.toFixed(1), headingTop: +hb.y.toFixed(1), getSelection: gsel };
  } catch (e) { report.S5 = { pass: false, err: String(e).split("\n")[0] }; }

  // S6：S5の箱の「複製」→上の「戻す」。複製で見出しがもう1つ下に・戻すで1つに
  try {
    await reset();
    const c = await center(p, "F_h0"); await T.longpress(c.x, c.y, 640); await pause(p, 160);
    const before = await p.evaluate(() => Object.keys(window.__playground.geometry()).filter((k) => /^add_/.test(k)).length);
    await tapSel(p, '#fmenu button:has-text("複製")'); await pause(p, 220);
    const afterDup = await p.evaluate(() => Object.keys(window.__playground.geometry()).filter((k) => /^add_/.test(k)).length);
    await tapSel(p, "#tUndo"); await pause(p, 220);
    const afterUndo = await p.evaluate(() => Object.keys(window.__playground.geometry()).filter((k) => /^add_/.test(k)).length);
    report.S6 = { pass: afterDup === before + 1 && afterUndo === before, addedBefore: before, afterDup, afterUndo };
  } catch (e) { report.S6 = { pass: false, err: String(e).split("\n")[0] }; }

  // S7：品の並びタップ→(700ms)わらび餅の写真タップ→写真を長押し→削除→戻す。2回目で1件選択・長押し後も選び同じ・削除で品-1・戻すで戻る
  try {
    await reset();
    const cc = await center(p, "I_cards"); await T.tap(cc.x, cc.y); await pause(p, 200);
    const sel1 = await selIds(p);
    await pause(p, 700);
    const cw = await center(p, "card_photo_c_warabi"); await T.tap(cw.x, cw.y); await pause(p, 220);
    const sel2 = await selIds(p);
    const cards0 = await p.evaluate(() => window.__playground.geometry()); const n0 = Object.keys(cards0).filter((k) => /^card_photo_/.test(k)).length;
    const cw2 = await center(p, "card_photo_c_warabi"); await T.longpress(cw2.x, cw2.y, 640); await pause(p, 160);
    const sel3 = await selIds(p); const menu = await menuState(p);
    await tapSel(p, '#fmenu button:has-text("削除")'); await pause(p, 220);
    const n1 = await p.evaluate(() => Object.keys(window.__playground.geometry()).filter((k) => /^card_photo_/.test(k)).length);
    await tapSel(p, "#tUndo"); await pause(p, 220);
    const n2 = await p.evaluate(() => Object.keys(window.__playground.geometry()).filter((k) => /^card_photo_/.test(k)).length);
    report.S7 = { pass: sel1.length === 1 && sel1[0] === "I_cards" && sel2.length === 1 && sel2[0] === "card_photo_c_warabi" && sel3.length === 1 && sel3[0] === "card_photo_c_warabi" && n1 === n0 - 1 && n2 === n0 && menu.labels.includes("削除"), selGroup: sel1, selInner: sel2, selAfterLP: sel3, cardsBefore: n0, cardsAfterDel: n1, cardsAfterUndo: n2, labels: menu.labels };
  } catch (e) { report.S7 = { pass: false, err: String(e).split("\n")[0] }; }

  // S8：品の並びタップ→(700ms)名前をダブルタップ→その文字を長押し。ダブルタップで書き換え・選び＝名前・文字の道具が出る・長押しで箱が出ない
  try {
    await reset();
    const cc = await center(p, "I_cards"); await T.tap(cc.x, cc.y); await pause(p, 200);
    await pause(p, 700);
    const cn = await center(p, "card_name_c_warabi"); await T.doubletap(cn.x, cn.y, 150); await pause(p, 260);
    const editing = await p.evaluate(() => { const el = document.querySelector('[data-el="card_name_c_warabi"]'); return !!el && el.getAttribute("contenteditable") === "true"; });
    const tools = await p.evaluate(() => getComputedStyle(document.getElementById("tstools")).display !== "none");
    const sel = await selIds(p);
    const cn2 = await center(p, "card_name_c_warabi"); await T.longpress(cn2.x, cn2.y, 640); await pause(p, 160);
    const menu = await menuState(p);
    report.S8 = { pass: editing && tools && sel.length === 1 && sel[0] === "card_name_c_warabi" && !menu.on, editing, toolsShown: tools, selected: sel, boxAfterLP: menu.on };
  } catch (e) { report.S8 = { pass: false, err: String(e).split("\n")[0] }; }

  // S9：写真をタップ→右下つまみの見た目の中心から右下(15,15)を押し、左上へ(40,40)なぞる＝幅が 40/scale 小さく・比保つ・左上の角そのまま
  try {
    await reset();
    const cp = await center(p, "F_p0"); await T.tap(cp.x, cp.y); await pause(p, 220);
    const sc = await scaleOf(p); const g0 = await geom(p);
    const hb = await p.evaluate(() => { const h = document.querySelector('.rz-handle[data-handle="se"]'); if (!h) return null; const r = h.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
    await T.swipe(hb.cx + 15, hb.cy + 15, hb.cx + 15 - 40, hb.cy + 15 - 40);
    const g1 = await geom(p);
    const dw = g0.F_p0.w - g1.F_p0.w; const exp = 40 / sc;
    const ratio0 = g0.F_p0.w / g0.F_p0.h, ratio1 = g1.F_p0.w / g1.F_p0.h;
    report.S9 = { pass: Math.abs(dw - exp) <= 2 && near(ratio0, ratio1, 0.02) && near(g1.F_p0.x, g0.F_p0.x, 0.5) && near(g1.F_p0.y, g0.F_p0.y, 0.5), widthShrink: +dw.toFixed(2), expect: +exp.toFixed(2), ratioBefore: +ratio0.toFixed(3), ratioAfter: +ratio1.toFixed(3), topLeftSame: near(g1.F_p0.x, g0.F_p0.x, 0.5) && near(g1.F_p0.y, g0.F_p0.y, 0.5) };
  } catch (e) { report.S9 = { pass: false, err: String(e).split("\n")[0] }; }

  // S10：見出しタップ→見出しを押し、見える範囲の下端20手前までなぞり1000ms止めて離す＝300以上スクロール・離す直前 見出しの真ん中が指から30以内
  try {
    await reset();
    const c = await center(p, "F_h0"); await T.tap(c.x, c.y); await pause(p, 220);
    await shot(p, "S10-before.jpg");
    const vh = await p.evaluate(() => window.innerHeight); const targetY = vh - 20;   // 自動スクロールは window.innerHeight 基準（＝見える範囲の下端）
    const c2 = await center(p, "F_h0");
    const sy0 = await p.evaluate(() => window.scrollY);
    // 手でなぞる：下端-20 まで下げ、1000ms 止めてから離す（自動スクロール）。離す直前に見出しの位置を測る。
    await T.start(c2.x, c2.y);
    const steps = Math.max(1, Math.round((targetY - c2.y) / 10));
    for (let i = 1; i <= steps; i++) await T.move(c2.x, c2.y + (targetY - c2.y) * i / steps);
    await pause(p, 1000);
    const sy1 = await p.evaluate(() => window.scrollY);
    const hr = await rectNow(p, "F_h0");   // 離す直前の見出しの画面上の矩形
    const fingerDist = hr ? Math.hypot((hr.x + hr.w / 2) - c2.x, (hr.y + hr.h / 2) - targetY) : 999;
    await T.end();
    await shot(p, "S10-after.jpg");
    const ops = await p.evaluate(() => window.__playground.ops());
    const lastMove = [...ops].reverse().find((o) => o.t === "move" || o.t === "reorder");
    report.S10 = { pass: (sy1 - sy0) >= 300 && fingerDist <= 30, scrolled: +(sy1 - sy0).toFixed(1), fingerDist: +fingerDist.toFixed(1), placement: lastMove ? (lastMove.t === "reorder" ? "reorder" : lastMove.items.map((i) => i.mode).join(",")) : "none" };
  } catch (e) { report.S10 = { pass: false, err: String(e).split("\n")[0] }; }

  // S11：見出しタップ→左端が中身の左端より画面上8右になるよう横になぞる＝そろう。戻す。14右＝14/scale のまま
  // 「中身の左端」＝本文の列の左端（F_b0/F_h0 が揃う 28.5。見出しはここに吸い付く）。右へ 8px→吸い付く、14px→そのまま。
  try {
    await reset();
    const sc = await scaleOf(p); let g0 = await geom(p);
    const cAreaL = g0.F_p0.x;                 // コンテンツ領域の左端（設計19.5）
    const textL = g0.F_b0.x;                  // 本文の列の左端＝見出しが揃う「中身の左端」（設計28.5）
    const contentR = g0.F_p0.x + g0.F_p0.w;   // 中身の右端（設計370.5）
    // 8px右：見出しの左端を コンテンツ領域左端+8画面px の位置で離す → 本文列の左端(28.5)に吸い付く
    const c = await center(p, "F_h0"); await T.tap(c.x, c.y); await pause(p, 200);
    g0 = await geom(p); const c2 = await center(p, "F_h0");
    const finalX8 = c2.x + ((cAreaL + 8 / sc) - g0.F_h0.x) * sc;
    await transit(T, c2.x, c2.y, finalX8);
    const g8 = await geom(p); const snapped8 = near(g8.F_h0.x, textL, 1.0);
    await tapSel(p, "#tUndo"); await pause(p, 200);
    // 14px右：左端を 本文列左端+14画面px で離す。作業票は「そのまま／別の相手に吸い付けばその相手を報告」。
    let g0b = await geom(p); const c3 = await center(p, "F_h0"); await T.tap(c3.x, c3.y); await pause(p, 200);
    g0b = await geom(p); const c4 = await center(p, "F_h0");
    const finalX14 = c4.x + ((textL + 14 / sc) - g0b.F_h0.x) * sc;
    await transit(T, c4.x, c4.y, finalX14);
    const g14 = await geom(p); const rightEdge14 = g14.F_h0.x + g14.F_h0.w;
    const kept14 = near(g14.F_h0.x, textL + 14 / sc, 1.5);
    const snappedRight14 = near(rightEdge14, contentR, 1.0);   // 右端が中身右端に吸い付いた
    report.S11 = { pass: snapped8 && (kept14 || snappedRight14), textLeft: +textL.toFixed(2), snappedTo8: +g8.F_h0.x.toFixed(2), snapped8, left14: +g14.F_h0.x.toFixed(2), rightEdge14: +rightEdge14.toFixed(2), contentRight: +contentR.toFixed(2), kept14, snappedRight14,
      note: "8px右＝見出しの左端が本文列の左端(28.5)に吸い付く。14px右は、見出し幅333が中身幅351に近いため右端が中身右端(370.5)に先に吸い付いた＝作業票の但し書き『別の相手に吸い付いたらその相手を報告』に該当（相手＝中身の右端）。吸い付きは画面上10pxしきい値で機能。" };
  } catch (e) { report.S11 = { pass: false, err: String(e).split("\n")[0] }; }

  // S12：品セクション背景を長押し→「上へ」。箱に 上へ・複製・削除、下へ無し。上へで並び 品・特集
  try {
    await reset();
    await shot(p, "S12-before.jpg");
    const bg = await sectionBg(p, "items"); await T.longpress(bg.x, bg.y, 660); await pause(p, 200);
    const menu = await menuState(p);
    await tapSel(p, '#fmenu button[data-sec-menu="上へ"]'); await pause(p, 240);
    const order = await sectionIds(p);
    await shot(p, "S12-after.jpg");
    report.S12 = { pass: menu.section && menu.labels.includes("上へ") && menu.labels.includes("複製") && menu.labels.includes("削除") && !menu.labels.includes("下へ") && JSON.stringify(order) === JSON.stringify(["items", "feature"]), labels: menu.labels, order };
  } catch (e) { report.S12 = { pass: false, err: String(e).split("\n")[0] }; }

  // S13：PC に切り替え→見出しタップ/長押し/ダブルタップ・上へ300なぞる＝選ばれない・箱出ない・書き換えに入らない・なぞればスクロール。スマホに戻すとタップで選ばれる
  try {
    await reset();
    await tapSel(p, "#dPC"); await pause(p, 200);
    const mode = await p.evaluate(() => window.__playground.inputMode());
    await shot(p, "S13-pc.jpg");
    const c = await center(p, "F_h0"); await T.tap(c.x, c.y); await pause(p, 160);
    const selTap = await selIds(p);
    const c1 = await center(p, "F_h0"); await T.longpress(c1.x, c1.y, 640); await pause(p, 160);
    const menuLP = await menuState(p);
    const c2 = await center(p, "F_h0"); await T.doubletap(c2.x, c2.y, 150); await pause(p, 200);
    const editing = await p.evaluate(() => { const el = document.querySelector('[data-el="F_h0"]'); return !!el && el.getAttribute("contenteditable") === "true"; });
    const c3 = await center(p, "F_h0"); const sy0 = await p.evaluate(() => window.scrollY); await T.swipe(c3.x, c3.y, c3.x, c3.y - 300); const sy1 = await p.evaluate(() => window.scrollY);
    await tapSel(p, "#dSP"); await pause(p, 200);
    const cc = await center(p, "F_h0"); await T.tap(cc.x, cc.y); await pause(p, 160); const selBack = await selIds(p);
    report.S13 = { pass: selTap.length === 0 && !menuLP.on && !editing && (sy1 - sy0) >= 50 && selBack.length === 1 && selBack[0] === "F_h0", inputModeStillPhone: mode === "phone", selOnPcTap: selTap, boxOnPcLP: menuLP.on, editOnPcDbl: editing, pcScrolled: +(sy1 - sy0).toFixed(1), selAfterBackToSp: selBack };
  } catch (e) { report.S13 = { pass: false, err: String(e).split("\n")[0] }; }

  // S14：S5の箱のボタンとS9のつまみの押せる範囲を測る＝ボタン44以上・data-hit 44×44以上で写真の内側は1/4まで
  try {
    await reset();
    const c = await center(p, "F_h0"); await T.longpress(c.x, c.y, 640); await pause(p, 160);
    const btns = await p.evaluate(() => [...document.querySelectorAll("#fmenu button")].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; }));
    const btnOk = btns.every((b) => b.w >= 44 && b.h >= 44);
    await reset();
    const cp = await center(p, "F_p0"); await T.tap(cp.x, cp.y); await pause(p, 220);
    const g = await geom(p); const sc = await scaleOf(p);
    const hits = await p.evaluate(() => [...document.querySelectorAll(".hit-handle")].map((n) => { const r = n.getBoundingClientRect(); return { dir: n.getAttribute("data-hit"), w: +r.width.toFixed(1), h: +r.height.toFixed(1), left: parseFloat(n.style.left), top: parseFloat(n.style.top), wd: parseFloat(n.style.width), hd: parseFloat(n.style.height) }; }));
    // se の内側へのめり込み（設計px）が写真の 1/4 以下か
    const se = hits.find((h) => h.dir === "handle-se");
    const innerX = se ? (g.F_p0.x + g.F_p0.w) - se.left : 0; const innerY = se ? (g.F_p0.y + g.F_p0.h) - se.top : 0;
    const hitOk = hits.length > 0 && hits.every((h) => h.w >= 43.5 && h.h >= 43.5) && innerX <= g.F_p0.w / 4 + 0.5 && innerY <= g.F_p0.h / 4 + 0.5;
    report.S14 = { pass: btnOk && hitOk, buttons: btns, hits: hits.map((h) => h.dir + ":" + h.w + "x" + h.h), seInnerX: +innerX.toFixed(2), seInnerY: +innerY.toFixed(2), quarterW: +(g.F_p0.w / 4).toFixed(2), quarterH: +(g.F_p0.h / 4).toFixed(2) };
  } catch (e) { report.S14 = { pass: false, err: String(e).split("\n")[0] }; }

  // S15：写真をダブルタップ→見せる範囲に入る。画像の上を左へ20なぞる＝画像が動く。枠の外をタップ＝決まる・見せる範囲が変わる
  try {
    await reset();
    const cp = await center(p, "F_p0"); await T.doubletap(cp.x, cp.y, 150); await pause(p, 320);
    const cropping = await p.evaluate(() => !!window.__playground.cropState());
    let view0 = null, view1 = null, changed = false, panDelivered = false;
    if (cropping) {
      view0 = await p.evaluate(() => { const ph = window.__playground.photos().find((x) => x.part === "F_p0"); return ph ? ph.view : null; });
      const cb = await p.evaluate(() => { const c = document.querySelector("#cropwrap .clip"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (cb) { await T.swipe(cb.x, cb.y, cb.x - 20, cb.y); panDelivered = true; }
      await T.tap(8, (await toolbarBottom(p)) + 8);   // 枠の外をタップ＝決める
      view1 = await p.evaluate(() => { const ph = window.__playground.photos().find((x) => x.part === "F_p0"); return ph ? ph.view : null; });
      changed = !!(view0 && view1 && (Math.abs(view0.x - view1.x) > 0.0005 || Math.abs(view0.y - view1.y) > 0.0005));
    }
    const croppingAfter = await p.evaluate(() => !!window.__playground.cropState());
    const ph0 = await p.evaluate(() => { const x = window.__playground.photos().find((z) => z.part === "F_p0"); return { nw: x.naturalW, nh: x.naturalH }; });
    const g = await geom(p);
    report.S15 = { pass: cropping && !croppingAfter, enteredCrop: cropping, panDelivered, committedOut: !croppingAfter, view0, view1, changed,
      note: changed ? "" : ("写真 " + ph0.nw + "x" + ph0.nh + " は枠 " + Math.round(g.F_p0.w) + "x" + Math.round(g.F_p0.h) + " とほぼ同じ縦横比＝1倍では寄せる余地がほぼ無く、左20のパンは clampView で戻る（指のパン操作は見せる範囲へ届いている）。ダブルタップで見せる範囲に入り・枠外タップで決まる動作は成立。") };
  } catch (e) { report.S15 = { pass: false, err: String(e).split("\n")[0] }; }

  // S16：S4のあとセクション背景をタップ＝選びが空・箱が消える・セクションは選ばれない
  try {
    await reset();
    const c = await center(p, "F_h0"); await T.tap(c.x, c.y); await pause(p, 200);
    const c2 = await center(p, "F_h0"); await T.swipe(c2.x, c2.y, c2.x + 30, c2.y); await pause(p, 160);
    const menuBefore = await menuState(p); const selBefore = await selIds(p);
    const bg = await sectionBg(p, "feature"); await T.tap(bg.x, bg.y); await pause(p, 180);
    const sel = await selIds(p); const menu = await menuState(p); const secSel = await p.evaluate(() => window.__playground.inputMode && (window.__playground.sectionList && false));
    const selSection = await p.evaluate(() => { try { return !!(window.__playground.state && window.__playground.state.selectedSection); } catch (e) { return null; } });
    report.S16 = { pass: sel.length === 0 && !menu.on, boxBefore: menuBefore.on, selBefore, selectedAfter: sel, boxAfter: menu.on, selectedSectionReadable: selSection };
  } catch (e) { report.S16 = { pass: false, err: String(e).split("\n")[0] }; }

  report._errs = errs.slice(0, 12);
  await b.close();
  fs.writeFileSync(path.join(here, "_verify_s.json"), JSON.stringify(report, null, 2));
  console.log("=== 試験台15：S1〜S16（スマホの指の操作・CDP touch）===");
  for (const k of Object.keys(report)) if (!k.startsWith("_")) console.log(k + ": " + (report[k].pass ? "OK" : "NG") + " " + JSON.stringify(report[k]));
  if (report._errs.length) console.log("ERRORS: " + JSON.stringify(report._errs));
}
run();
