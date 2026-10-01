// playground6：Q1〜Q15・R1〜R9・T1〜T5・V1。playground6_single.html に本物のマウス・キーボード（IME は CDP）を与える。
import { chromium, webkit } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + path.resolve("refs/compare/layout/playground6_single.html");
const OUT = path.resolve("refs/compare/layout/playground6"); fs.mkdirSync(OUT, { recursive: true });
const DW = { pc: 1440, sp: 390 };
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;
const S1_ADD = "毎朝炊いた餡を、その日のうちにお出しします。手のひらにのる小さな菓子に、季節のうつろいを写します。四季折々の意匠をお楽しみください。";
const S2_HEAD = "季節の上生菓子と、その月だけの特別な意匠";

const geom = (p) => p.evaluate(() => window.__playground.geometry());
const sections = (p) => p.evaluate(() => window.__playground.sections());
const warns = (p) => p.evaluate(() => window.__playground.warnings());
const anchors = (p) => p.evaluate(() => window.__playground.anchors());
const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const select = (p, ids) => p.evaluate((ids) => window.__playground.select(ids), ids);
const lc = (p) => p.evaluate(() => window.__playground.layoutCount());
const pause = (p, ms = 90) => p.waitForTimeout(ms);
const MQ = { pc: [140, 455, 690, 600], sp: [10, 470, 378, 606] };

async function secInfo(p, sec, dw) { return p.evaluate((s) => { const el = document.querySelector("#host_" + s + " #sec"); const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width }; }, sec); }
const secOf = (id) => (id.startsWith("F_") ? "feature" : "items");
async function center(p, id) { return p.evaluate((id) => { for (const h of ["host_feature", "host_items"]) { const el = document.querySelector("#" + h + ' [data-el="' + id + '"]'); if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } } return null; }, id); }
async function dragBy(p, id, ddx, ddy, dw) { const sec = secOf(id); const si = await secInfo(p, sec, dw); const sc = si.w / dw; const c = await center(p, id); const cx = Math.round(c.x), cy = Math.round(c.y); await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + Math.round(ddx * sc * 0.5), cy + Math.round(ddy * sc * 0.5), { steps: 3 }); await p.mouse.move(cx + Math.round(ddx * sc), cy + Math.round(ddy * sc), { steps: 3 }); await p.mouse.up(); await pause(p); }
function maxDiff(a, b) { let w = 0; for (const id of Object.keys(b)) { if (!a[id]) continue; for (const f of ["x", "y"]) { const d = Math.abs(a[id][f] - b[id][f]); if (d > w) w = d; } } return w; }
async function dragTo(p, id, tx, ty, dw) { const g = await geom(p); await dragBy(p, id, tx - g[id].x, ty - g[id].y, dw); }
async function marquee(p, sec, x0, y0, x1, y1, dw) { const si = await secInfo(p, sec, dw); const sc = si.w / dw; const sx = si.left + x0 * sc, sy = si.top + y0 * sc, ex = si.left + x1 * sc, ey = si.top + y1 * sc; await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move((sx + ex) / 2, (sy + ey) / 2, { steps: 3 }); await p.mouse.move(ex, ey, { steps: 3 }); await p.mouse.up(); await pause(p); }
// その場書き換え（本物：ダブルクリック→全選択→末尾→打鍵→Esc）
async function editAppend(p, id, add) { const c = await center(p, id); await p.mouse.dblclick(c.x, c.y); await pause(p, 120); await p.keyboard.press("ControlOrMeta+a"); await p.keyboard.press("ArrowRight"); await p.keyboard.type(add, { delay: 1 }); await pause(p, 150); await p.keyboard.press("Escape"); await pause(p, 150); }
async function editReplace(p, id, text) { const c = await center(p, id); await p.mouse.dblclick(c.x, c.y); await pause(p, 120); await p.keyboard.press("ControlOrMeta+a"); await p.keyboard.type(text, { delay: 1 }); await pause(p, 150); await p.keyboard.press("Escape"); await pause(p, 150); }
function h2(base, now, moved, extra = []) { const ex = new Set([...moved, ...extra]); let w = 0, wid = ""; for (const id of Object.keys(base)) { if (ex.has(id) || !now[id]) continue; for (const f of ["x", "y"]) { const d = Math.abs(base[id][f] - now[id][f]); if (d > w) { w = d; wid = id + "." + f; } } } return { ok: w <= 0.5, worst: +w.toFixed(2), wid }; }
const nWarn = (w) => w.overlaps.length + w.overflows.length;
// 厳密な重なり（内包も重なりとみなす）。keys は同じセクションの部品 ID。
function strictOverlap(g, id, keys) { const me = g[id]; if (!me) return false; for (const k of keys) { if (k === id || !g[k]) continue; const e = g[k]; const ox = Math.min(me.x + me.w, e.x + e.w) - Math.max(me.x, e.x); const oy = Math.min(me.y + me.h, e.y + e.h) - Math.max(me.y, e.y); if (ox > 1 && oy > 1) return true; } return false; }
const featKeys = (g) => Object.keys(g).filter((k) => /^F_/.test(k));
async function shot(p, name) { await p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }); }
// 品セクションの縦積みの、見えている直接子（y順）の隣どうしの間隔。{order:[id..], gaps:[{a,b,gap}..]}
const STACK6 = ["I_cards", "I_divider", "I_kanmi", "I_time", "I_table", "I_pillbg"];
// 縦積みに残っている（M2で抜けていない）直接子の、y順の隣どうしの間隔。exclude＝抜けた部品
function stackGaps(g, exclude = []) {
  const present = STACK6.filter((id) => g[id] && !exclude.includes(id)).sort((a, b) => g[a].y - g[b].y);
  const gaps = [];
  for (let i = 1; i < present.length; i++) { const a = present[i - 1], b = present[i]; gaps.push({ a, b, gap: +(g[b].y - (g[a].y + g[a].h)).toFixed(1) }); }
  return { order: present, gaps };
}

const report = {};
for (const [device, bt] of [["pc", chromium], ["sp", webkit]]) {
  const dw = DW[device];
  const browser = await bt.launch();
  const ctx = await browser.newContext({ viewport: { width: device === "pc" ? 1500 : 430, height: 6000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }
  const K = (t) => `${t}-${device}`;
  async function fresh() { await reset(p); await setDevice(p, device); await pause(p, 150); return geom(p); }

  // Q1: 見出しM1(12,8) → 本文3文書き足す
  { const b = await fresh(); if (device === "pc") await shot(p, "Q1-before.jpg");
    await dragBy(p, "F_h0", 12, 8, dw); const g1 = await geom(p);
    const H1 = near(g1.F_h0.x, b.F_h0.x + 12) && near(g1.F_h0.y, b.F_h0.y + 8);
    const H2 = h2(b, g1, ["F_h0"]); if (device === "pc") await shot(p, "Q1-moved.jpg");
    await editAppend(p, "F_b0", S1_ADD); const g2 = await geom(p); const w = await warns(p); if (device === "pc") await shot(p, "Q1-after.jpg");
    const gap = g2.F_b0.y - (g2.F_h0.y + g2.F_h0.h); const overlap = w.overlaps.some((o) => (o.a === "F_h0" && o.b === "F_b0") || (o.a === "F_b0" && o.b === "F_h0"));
    report[K("Q1")] = { H1, H1v: [+(g1.F_h0.x - b.F_h0.x).toFixed(2), +(g1.F_h0.y - b.F_h0.y).toFixed(2)], H2, gapAfter: +gap.toFixed(2), noOverlap: !overlap, anchors: await anchors(p), warn: nWarn(w) };
  }
  // Q2: 本文M2(写真の下24) → 見出し2行。詰まる・空白なし。
  { const b = await fresh(); if (device === "pc") await shot(p, "Q2-before.jpg");
    const tx = b.F_p0.x, ty = b.F_p0.y + b.F_p0.h + 24; await dragTo(p, "F_b0", tx, ty, dw);
    const g1 = await geom(p); const H1 = near(g1.F_b0.x, tx, 1) && near(g1.F_b0.y, ty, 1);
    // 「見出しの下に空白が残らない」＝本文の元スロットが詰まった＝F_h0 の下にすぐ写真行や次の要素（空白なし）。F_h0 は不動。
    const headStill = near(g1.F_h0.y, b.F_h0.y); if (device === "pc") await shot(p, "Q2-moved.jpg");
    await editReplace(p, "F_h0", S2_HEAD); const g2 = await geom(p); const w = await warns(p); if (device === "pc") await shot(p, "Q2-after.jpg");
    const belowPhoto = +(g2.F_b0.y - (g2.F_p0.y + g2.F_p0.h)).toFixed(2);
    const bodyStill = near(g2.F_b0.y, g1.F_b0.y, 1); // 見出し2行にしても本文は動かない
    report[K("Q2")] = { H1, H1v: [+(g1.F_b0.x - tx).toFixed(2), +(g1.F_b0.y - ty).toFixed(2)], headStill, bodyBelowPhoto: belowPhoto, bodyStillAfterHead2: bodyStill, anchors: await anchors(p), warn: nWarn(w) };
  }
  // Q3: 見出し＋本文をまとめて写真の下へ(M2/M3) → 見出し2行で本文が押されて下がる
  { const b = await fresh(); await marquee(p, "feature", MQ[device][0], MQ[device][1], MQ[device][2], MQ[device][3], dw);
    const t = b.F_p0; const tx = t.x, ty = t.y + t.h + 24;
    // まとめて選んだ状態で、本文をつかんで写真の下へ（見出しも一緒に動く）
    await dragTo(p, "F_b0", tx, ty + (b.F_b0.y - b.F_h0.y), dw); // 相対関係を保って移動
    const g1 = await geom(p); if (device === "pc") await shot(p, "Q3-moved.jpg");
    const bothLanded = g1.F_h0 && g1.F_b0;
    const bodyBefore = g1.F_b0.y;
    await editReplace(p, "F_h0", S2_HEAD); const g2 = await geom(p); const w = await warns(p); if (device === "pc") await shot(p, "Q3-after.jpg");
    const bodyPushed = g2.F_b0.y - bodyBefore;
    report[K("Q3")] = { bothLanded: !!bothLanded, headY: g1.F_h0?.y, bodyY: g1.F_b0?.y, bodyPushedByHead2: +bodyPushed.toFixed(2), anchors: await anchors(p), warn: nWarn(w) };
  }
  // Q4: 本文に書き足して S1 と同じ3文 → S1 レイアウトと一致（F_b0 の高さ等）
  { const b = await fresh(); await editAppend(p, "F_b0", S1_ADD); const g = await geom(p); const w = await warns(p);
    report[K("Q4")] = { bodyH: +g.F_b0.h.toFixed(2), bodyY: +g.F_b0.y.toFixed(2), warn: nWarn(w) };
  }
  // Q5: IME 変換中は再配置しない（Chromium。CDP の imeSetComposition は contenteditable に届かないため、
  //     IME と同じ composition/input イベントを発火して同じ経路を通す＝「などで再現」）
  if (device === "pc") { const b = await fresh(); const c = await center(p, "F_b0"); await p.mouse.dblclick(c.x, c.y); await pause(p, 150);
    const res = await p.evaluate(async () => {
      const el = document.querySelector('#host_feature [data-el="F_b0"]'); el.focus();
      const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
      const wait = (ms) => new Promise((z) => setTimeout(z, ms));
      const input = (isComposing) => el.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing }));
      const before = window.__playground.layoutCount();
      el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      el.textContent += "あ"; input(true); await wait(30);
      el.textContent = el.textContent.slice(0, -1) + "あき"; input(true); await wait(30);
      el.textContent = el.textContent.slice(0, -2) + "あきの"; input(true); await wait(30);
      const during = window.__playground.layoutCount();
      el.textContent = el.textContent.slice(0, -3) + "秋の意匠";
      el.dispatchEvent(new CompositionEvent("compositionend", { data: "秋の意匠", bubbles: true })); input(false);
      const after = window.__playground.layoutCount();
      return { before, during, after, text: el.innerText.slice(-4) };
    });
    await p.keyboard.press("Escape"); await pause(p, 150); const g = await geom(p);
    report[K("Q5")] = { lcBefore: res.before, lcDuring: res.during, lcAfter: res.after, noReflowDuring: res.during === res.before, reflowedAfter: res.after > res.during, textOk: res.text === "秋の意匠", bodyGrew: g.F_b0.h > b.F_b0.h + 10 };
  }
  // Q6: 区切り線の下に文字を足し、セクション下端より80下へ → セクション伸長・はみ出し警告なし
  { await fresh(); const s0 = (await sections(p)).items.height;
    // テキストツールで区切り線の下に足す
    await p.click("#tText"); const dc = await center(p, "I_divider"); await p.mouse.click(dc.x, dc.y); await pause(p, 150);
    await p.keyboard.type("季節により品が替わります", { delay: 1 }); await p.keyboard.press("Escape"); await pause(p, 150);
    const addId = (await anchors(p)).find((a) => a.added)?.part;
    const targetY = s0 + 80;
    if (addId) await dragTo(p, addId, (await geom(p))[addId].x, targetY, dw);
    const s1 = (await sections(p)).items.height; const w = await warns(p);
    report[K("Q6")] = { addId: addId || null, sec0: +s0.toFixed(1), sec1: +s1.toFixed(1), grew: s1 > s0 + 40, overflow: w.overflows.length, warn: nWarn(w) };
  }
  // Q8: Q1 の後に「元の配置を見る」
  { const b = await fresh(); await dragBy(p, "F_h0", 12, 8, dw); const moved = (await geom(p)).F_h0;
    const opsN = (await p.evaluate(() => window.__playground.ops())).length;
    await p.evaluate(() => window.__playground.peek(true)); await pause(p, 120); const peeked = (await geom(p)).F_h0;
    await p.evaluate(() => window.__playground.peek(false)); await pause(p, 120); const back = (await geom(p)).F_h0;
    const opsN2 = (await p.evaluate(() => window.__playground.ops())).length;
    report[K("Q8")] = { peekAtOrigin: near(peeked.x, b.F_h0.x) && near(peeked.y, b.F_h0.y), backToMoved: near(back.x, moved.x) && near(back.y, moved.y), opsUnchanged: opsN === opsN2 };
  }
  // Q7: 部品/セクション/ページの戻す（PC のみ代表）
  if (device === "pc") { await fresh();
    await dragBy(p, "F_h0", 12, 8, dw); // Q1 の移動
    const tpl = await geom(p); // F_h0 は動いた。テンプレ位置＝base。
    await editReplace(p, "F_h0", S2_HEAD); // 文字を書き換える（残るはず）
    await select(p, ["F_h0"]);
    await p.evaluate(() => window.__playground.resetScope("part", "F_h0", ["pc"])); await pause(p, 120);
    const g = await geom(p); const base2 = await p.evaluate(() => { window.__playground.reset(); return window.__playground.geometry(); }); await pause(p, 100);
    // 戻した後 F_h0 は今の中身（2行見出し）のテンプレ位置に。書き換えた文字は残る（2行）。
    report[K("Q7")] = { headingIs2Line: g.F_h0.h > 60, resetPartNoManual: (await anchors(p)).find((a) => a.part === "F_h0") == null };
  }
  // Q9: 全操作を Cmd+Z で最初まで→Cmd+Shift+Z で最後まで（各段階が直後と一致）
  { const snaps = []; await fresh(); snaps.push(await geom(p));
    await dragBy(p, "F_h0", 12, 8, dw); snaps.push(await geom(p));
    await editAppend(p, "F_b0", "季節の意匠。"); snaps.push(await geom(p));
    await dragBy(p, "F_b1", 6, 10, dw); snaps.push(await geom(p));
    let ok = true, worst = 0;
    for (let k = 3; k >= 1; k--) { await p.evaluate(() => window.__playground.undo()); await pause(p, 100); const d = maxDiff(await geom(p), snaps[k - 1]); if (d > worst) worst = d; if (d > 0.5) ok = false; }
    for (let k = 1; k <= 3; k++) { await p.evaluate(() => window.__playground.redo()); await pause(p, 100); const d = maxDiff(await geom(p), snaps[k]); if (d > worst) worst = d; if (d > 0.5) ok = false; }
    report[K("Q9")] = { ok, worst: +worst.toFixed(2) };
  }
  // Q10: 矢印1px/10px・Delete→Cmd+Z
  { const b = (await fresh()).F_h0; await select(p, ["F_h0"]); await pause(p, 60);
    await p.keyboard.press("ArrowRight"); await pause(p, 80); const a1 = (await geom(p)).F_h0;
    await p.keyboard.down("Shift"); await p.keyboard.press("ArrowRight"); await p.keyboard.up("Shift"); await pause(p, 80); const a2 = (await geom(p)).F_h0;
    await select(p, ["F_b1"]); await p.keyboard.press("Delete"); await pause(p, 120); const gDel = await geom(p);
    await p.evaluate(() => window.__playground.undo()); await pause(p, 120); const gBack = await geom(p);
    report[K("Q10")] = { arrow1: +(a1.x - b.x).toFixed(2), shift10: +(a2.x - a1.x).toFixed(2), deleted: !gDel.F_b1, restored: !!gBack.F_b1 };
  }
  // Q11: 動かせる部品を塊の中(M1)と外(M2)へ。M1 の H1（落とした位置±0.5）と H2 はこれまでどおり。
  // M2 の H1 は4章の読み替え：離した瞬間の付いていく先との関係（間隔・左から）が、詰めた後も保たれる（±0.5）。
  { const set = [["F_h0", 10, 6], ["F_b0", 10, 6], ["F_p0", 10, 6], ["I_divider", 12, 0], ["I_kanmi", 10, 6]];
    let m1h1 = true, h2ok = true, m2rel = true, worst = 0, note = "";
    for (const [id, mx, my] of set) {
      let b = await fresh(); await select(p, [id]); await pause(p, 50); await dragBy(p, id, mx, my, dw); let a = await geom(p);
      const mode = (await anchors(p)).find((x) => x.part === id)?.mode;
      let d = Math.max(Math.abs(a[id].x - (b[id].x + mx)), Math.abs(a[id].y - (b[id].y + my))); if (d > 0.5) { m1h1 = false; if (d > worst) { worst = d; note = id + " M1H1 " + d.toFixed(2); } }
      if (mode === "M1") { const hh = h2(b, a, [id]); if (!hh.ok) { h2ok = false; if (hh.worst > worst) { worst = hh.worst; note = id + " M1H2 " + hh.wid; } } }
      // M2：下へ380。離した瞬間の関係（gapY・左から）が詰めた後も保たれるか
      await fresh(); await select(p, [id]); await pause(p, 50); await dragBy(p, id, 0, 380, dw); a = await geom(p);
      const anc = (await anchors(p)).find((x) => x.part === id);
      if (anc && anc.mode === "M2" && anc.anchor && a[anc.anchor]) {
        const gapNow = a[id].y - (a[anc.anchor].y + a[anc.anchor].h);
        const dg = Math.abs(gapNow - anc.gapY); const dx2 = Math.abs((a[id].x - a[anc.anchor].x) - (anc.x - a[anc.anchor].x));
        if (dg > 0.5 || dx2 > 0.5) { m2rel = false; if (Math.max(dg, dx2) > worst) { worst = Math.max(dg, dx2); note = id + " M2rel gap差" + dg.toFixed(2); } }
      }
    }
    report[K("Q11")] = { m1H1: m1h1, h2okM1: h2ok, m2relPreserved: m2rel, worst: +worst.toFixed(2), note };
  }
  // Q12（5章の新しい決まりで確かめる）：コピー→貼り付けはコピー元のすぐ下・付いていく先コピー元。複製。両端末に出る（PC）
  if (device === "pc") { const b = await fresh(); await select(p, ["F_h0"]);
    await p.keyboard.press("ControlOrMeta+c"); await pause(p, 80); await p.keyboard.press("ControlOrMeta+v"); await pause(p, 250);
    let g = await geom(p); let anc = await anchors(p); const addId = anc.filter((a) => a.added).slice(-1)[0]?.part;
    const belowSource = addId && g[addId] ? g[addId].y > b.F_h0.y + b.F_h0.h - 1 && near(g[addId].x, b.F_h0.x, 2) : false;
    const anchorSrc = anc.find((a) => a.part === addId)?.anchor === "F_h0";
    await select(p, ["F_p0"]); await p.keyboard.press("ControlOrMeta+d"); await pause(p, 250);
    g = await geom(p); anc = await anchors(p); const photoAdd = anc.filter((a) => a.added).slice(-1)[0]?.part; const photoOk = photoAdd && g[photoAdd] && g[photoAdd].kind === "photo";
    await setDevice(p, "sp"); await pause(p, 150); const gsp = await geom(p);
    const onSP = !!(addId && gsp[addId]);
    const noMark = addId ? await p.evaluate((id) => { const el = document.querySelector('[data-el="' + id + '"]'); return el ? !el.classList.contains("mark-manual") : null; }, addId) : null;
    await setDevice(p, "pc");
    report[K("Q12")] = { belowSource, anchorSrc, photoDuplicated: !!photoOk, addedOnSP: onSP, noManualMarkSP: noMark };
  }
  // Q13: 品を複製→4件
  { await fresh(); await select(p, ["card_name_c_jonama"]); await p.keyboard.press("ControlOrMeta+d"); await pause(p, 200);
    const g = await geom(p); const n = Object.keys(g).filter((k) => /^card_photo_/.test(k)).length;
    report[K("Q13")] = { cards: n, is4: n === 4 };
  }
  // Q14: 書き換え中に書式付き貼り付け→文字だけ（PC）
  if (device === "pc") { await fresh(); const c = await center(p, "F_b0"); await p.mouse.dblclick(c.x, c.y); await pause(p, 150);
    const res = await p.evaluate(() => { const el = document.querySelector('#host_feature [data-el="F_b0"]'); el.focus(); const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); const dt = new DataTransfer(); dt.setData("text/plain", "プレーン"); dt.setData("text/html", '<b style="color:red">プレーン</b>'); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); return { html: el.innerHTML.slice(-80), text: el.innerText.slice(-4) }; });
    await p.keyboard.press("Escape"); await pause(p, 120);
    report[K("Q14")] = { text: res.text, noFormatting: !/<b|color:|font-/.test(res.html) && res.text === "プレーン" };
  }
  // Q15: 貼り付けた見出しを切り取り→別セクションで貼り付け→Cmd+Z 2回（PC）
  if (device === "pc") { await fresh();
    await select(p, ["F_h0"]); await p.keyboard.press("ControlOrMeta+c"); await pause(p, 80); await p.keyboard.press("ControlOrMeta+v"); await pause(p, 200);
    let anc = await anchors(p); const addId = anc.filter((a) => a.added).slice(-1)[0]?.part;
    await select(p, [addId]); await p.keyboard.press("ControlOrMeta+x"); await pause(p, 150);
    const goneFeature = !(await p.evaluate((id) => !!document.querySelector('#host_feature [data-el="' + id + '"]'), addId));
    const items = await secInfo(p, "items", dw); await p.mouse.click(Math.round(items.left + 5), Math.round(items.top + 5)); await pause(p, 120);
    await p.keyboard.press("ControlOrMeta+v"); await pause(p, 200);
    anc = await anchors(p); const newAdd = anc.filter((a) => a.added).slice(-1)[0]?.part;
    const inItems = newAdd ? await p.evaluate((id) => !!document.querySelector('#host_items [data-el="' + id + '"]'), newAdd) : false;
    await p.evaluate(() => window.__playground.undo()); await pause(p, 100); await p.evaluate(() => window.__playground.undo()); await pause(p, 100);
    const restored = await p.evaluate((id) => !!document.querySelector('#host_feature [data-el="' + id + '"]'), addId);
    report[K("Q15")] = { goneFromFeatureAfterCut: goneFeature, pastedInItems: inItems, restoredAfterUndo2: restored };
  }
  // ===== 7章 R1〜R9 =====
  async function grabPoint(px0, py0, dx, dy, sc) { await p.mouse.move(Math.round(px0), Math.round(py0)); await p.mouse.down(); await p.mouse.move(Math.round(px0 + dx * sc * 0.5), Math.round(py0 + dy * sc * 0.5), { steps: 3 }); await p.mouse.move(Math.round(px0 + dx * sc), Math.round(py0 + dy * sc), { steps: 3 }); await p.mouse.up(); await pause(p); }

  // R1：区切り線の見た目の上6pxをつかむ→下10／戻して下30。どちらも M1・区切り線だけ動く・上に来る部品なし
  { const b = await fresh(); const si = await secInfo(p, "items", dw); const sc = si.w / dw; const dv = b.I_divider;
    const gx = si.left + (dv.x + dv.w / 2) * sc, gyTop = si.top + dv.y * sc;
    if (device === "pc") await shot(p, "R1-before.jpg");
    await grabPoint(gx, gyTop - 6 * sc, 0, 10, sc);
    const g10 = await geom(p); const mv10 = +(g10.I_divider.y - dv.y).toFixed(2); const mode10 = (await anchors(p)).find((a) => a.part === "I_divider")?.mode; const h2a = h2(b, g10, ["I_divider"]);
    const b2 = await fresh(); await grabPoint(gx, gyTop - 6 * sc, 0, 30, sc);
    const g30 = await geom(p); const mv30 = +(g30.I_divider.y - b2.I_divider.y).toFixed(2); const mode30 = (await anchors(p)).find((a) => a.part === "I_divider")?.mode; const h2b = h2(b2, g30, ["I_divider"]);
    if (device === "pc") await shot(p, "R1-after.jpg");
    const kanmiBelow = g30.I_kanmi.y > g30.I_divider.y;
    report[K("R1")] = { grab10: near(mv10, 10, 1.5) && mode10 === "M1" && h2a.ok, mv10, grab30: near(mv30, 30, 1.5) && mode30 === "M1" && h2b.ok, mv30, kanmiBelow, h2worst: +Math.max(h2a.worst, h2b.worst).toFixed(2) };
  }
  // R2（改）：区切り線を甘味処の見出しの下端＋1（縦の中心）へ → 並び替え（見出し→区切り線→営業時間）。間隔は2章の決まり
  { const b = await fresh(); await shot(p, `R2-before-${device}.jpg`);
    const targetTop = b.I_kanmi.y + b.I_kanmi.h + 1 - b.I_divider.h / 2;
    await dragTo(p, "I_divider", b.I_divider.x, targetTop, dw);
    const g = await geom(p); const anc = await anchors(p); const dv = anc.find((a) => a.part === "I_divider"); const w = await warns(p);
    await shot(p, `R2-after-${device}.jpg`);
    const reordered = g.I_kanmi.y < g.I_divider.y && g.I_divider.y < g.I_time.y;
    const sg = stackGaps(g); const gp = (a2, b2) => { const e = sg.gaps.find((x) => x.a === a2 && x.b === b2); return e ? e.gap : null; };
    await select(p, ["I_divider"]); await p.evaluate((d) => window.__playground.resetScope("part", "I_divider", [d]), device); await pause(p, 150);
    const g2 = await geom(p); const restored = g2.I_divider.y < g2.I_kanmi.y && g2.I_kanmi.y < g2.I_time.y;
    report[K("R2")] = { reordered, noM1M2: !dv, overlap: w.overlaps.length, gaps: { cards_kanmi: gp("I_cards", "I_kanmi"), kanmi_divider: gp("I_kanmi", "I_divider"), divider_time: gp("I_divider", "I_time"), time_table: gp("I_time", "I_table"), table_pill: gp("I_table", "I_pillbg") }, restored };
  }
  if (device === "pc") {
    // R4：見出しを Cmd+C → Cmd+V。見出しのすぐ下・付いていく先コピー元・本文と重ならず自分が下がる。スマホにもあり幅内・重なり0
    { const b = await fresh(); await shot(p, "R4-before.jpg");
      await select(p, ["F_h0"]); await p.keyboard.press("ControlOrMeta+c"); await pause(p, 80); await p.keyboard.press("ControlOrMeta+v"); await pause(p, 250);
      const g = await geom(p); const anc = await anchors(p); const addId = anc.filter((a) => a.added).slice(-1)[0]?.part; await shot(p, "R4-after.jpg");
      const belowBody = addId && g[addId] ? g[addId].y >= g.F_b0.y + g.F_b0.h - 1 && near(g[addId].x, b.F_h0.x, 2) : false;
      const anchorSrc = anc.find((a) => a.part === addId)?.anchor === "F_h0";
      const noOverlapPC = addId ? !strictOverlap(g, addId, featKeys(g)) : false;
      await setDevice(p, "sp"); await pause(p, 150); const gsp = await geom(p); const wsp = await warns(p);
      const onSP = !!(addId && gsp[addId]); const spInWidth = addId && gsp[addId] ? gsp[addId].x + gsp[addId].w <= 391 : false;
      const spClean = addId ? !strictOverlap(gsp, addId, featKeys(gsp)) && wsp.overflows.length === 0 : false;
      await setDevice(p, "pc");
      report["R4-pc"] = { belowBody, anchorSrc, noOverlapPC, addedOnSP: onSP, spInWidth, spClean };
    }
    // R5：写真を Cmd+D。幅549高さ404・名前が「足した写真」。スマホは比を保ち中身の幅内・重なり0
    { await fresh(); await select(p, ["F_p0"]); await p.keyboard.press("ControlOrMeta+d"); await pause(p, 250);
      const g = await geom(p); const anc = await anchors(p); const add = anc.filter((a) => a.added).slice(-1)[0]; const addId = add?.part;
      const sizeOk = addId && g[addId] ? near(g[addId].w, 549, 1) && near(g[addId].h, 404, 1) : false; const nameOk = add?.partName === "足した写真";
      await setDevice(p, "sp"); await pause(p, 150); const gsp = await geom(p); const wsp = await warns(p);
      const spRatio = addId && gsp[addId] ? Math.abs(gsp[addId].w / gsp[addId].h - 549 / 404) < 0.05 : false;
      const spInWidth = addId && gsp[addId] ? gsp[addId].x + gsp[addId].w <= 391 : false;
      const spClean = addId ? !strictOverlap(gsp, addId, featKeys(gsp)) && wsp.overflows.length === 0 : false;
      await setDevice(p, "pc");
      report["R5-pc"] = { sizeOk, wh: addId && g[addId] ? [g[addId].w, g[addId].h] : null, nameOk, spRatioKept: spRatio, spInWidth, spClean };
    }
    // R7：本文を見出しより上へ（PC 文字の塊の並び替え）。PC だけ・スマホの並びは変わらない
    { const b = await fresh(); await dragTo(p, "F_b0", b.F_b0.x, b.F_h0.y - b.F_b0.h - 4, dw);
      const g = await geom(p); const orderOk = g.F_b0.y < g.F_h0.y; const w = await warns(p);
      await setDevice(p, "sp"); await pause(p, 150); const gsp = await geom(p); const spUnchanged = gsp.F_p0.y < gsp.F_h0.y && gsp.F_h0.y < gsp.F_b0.y; await setDevice(p, "pc");
      report["R7-pc"] = { orderOk, overlap: w.overlaps.length, spOrderUnchanged: spUnchanged };
    }
    // R8：見出しを同じ塊で右30下20＝M1・並び替えにならない
    { const b = await fresh(); await dragBy(p, "F_h0", 30, 20, dw); const g = await geom(p); const m = (await anchors(p)).find((a) => a.part === "F_h0");
      report["R8-pc"] = { isM1: m?.mode === "M1", moved: near(g.F_h0.x, b.F_h0.x + 30, 1) && near(g.F_h0.y, b.F_h0.y + 20, 1), notReordered: g.F_h0.y < g.F_b0.y, m1: [+(g.F_h0.x - b.F_h0.x).toFixed(2), +(g.F_h0.y - b.F_h0.y).toFixed(2)] };
    }
  }
  if (device === "sp") {
    // R6：本文を写真と見出しの間へ（SP 並び替え）。写真→本文→見出し・重なり0。元に戻すと並び戻る
    { const b = await fresh(); await shot(p, "R6-before.jpg");
      const midY = (b.F_p0.y + b.F_p0.h + b.F_h0.y) / 2 - b.F_b0.h / 2; await dragTo(p, "F_b0", b.F_b0.x, midY, dw);
      const g = await geom(p); await shot(p, "R6-after.jpg"); const orderOk = g.F_p0.y < g.F_b0.y && g.F_b0.y < g.F_h0.y; const w = await warns(p);
      await select(p, ["F_b0"]); await p.evaluate(() => window.__playground.resetScope("part", "F_b0", ["sp"])); await pause(p, 150);
      const g2 = await geom(p); const restored = g2.F_p0.y < g2.F_h0.y && g2.F_h0.y < g2.F_b0.y;
      report["R6-sp"] = { orderOk, overlap: w.overlaps.length, restored };
    }
  }
  // R9：区切り線の下に文字を足し、表の2行目と3行目の間へ→付いていく先が甘味処の表（row_ でない）。表を1行減らすと文字が付いて上がる・重ならない。行はドラッグで動かない
  // ※実データの表は2行＝「2行目と3行目の間」を作るため、まず2行目を Cmd+D で複製して3行にする（§10.2 の行複製の確認も兼ねる）
  { await fresh();
    const rows0 = Object.keys(await geom(p)).filter((k) => /^row_name_/.test(k)).sort();
    const r2id = Object.entries(await geom(p)).filter(([k]) => /^row_name_/.test(k)).sort((a, b) => a[1].y - b[1].y)[1][0];
    await select(p, [r2id]); await p.keyboard.press("ControlOrMeta+d"); await pause(p, 180);
    const rowsAfterDup = Object.keys(await geom(p)).filter((k) => /^row_name_/.test(k)).length;
    await p.click("#tText"); const dc = await center(p, "I_divider"); await p.mouse.click(dc.x, dc.y); await pause(p, 150);
    await p.keyboard.type("季節により品が替わります", { delay: 1 }); await p.keyboard.press("Escape"); await pause(p, 150);
    const addId = (await anchors(p)).find((a) => a.added)?.part; const g0 = await geom(p);
    const rowNames = Object.keys(g0).filter((k) => /^row_name_/.test(k)).sort((x, y) => g0[x].y - g0[y].y);
    const midY = (g0[rowNames[1]].y + g0[rowNames[1]].h + g0[rowNames[2]].y) / 2;
    if (addId) await dragTo(p, addId, g0[addId].x, midY, dw);
    const anc = await anchors(p); const addA = anc.find((a) => a.part === addId);
    const noRowAnchor = !anc.some((a) => a.anchor && /^row_/.test(a.anchor));
    const g1 = await geom(p); const rowBefore = g1[rowNames[0]]; await dragBy(p, rowNames[0], 0, 40, dw); const g1b = await geom(p);
    const rowStays = g1b[rowNames[0]] ? near(g1b[rowNames[0]].y, rowBefore.y, 1) : true;
    await select(p, [rowNames[1]]); await p.keyboard.press("Delete"); await pause(p, 160);
    const g2 = await geom(p); const rowsNow = Object.keys(g2).filter((k) => /^row_name_/.test(k)).length; const w = await warns(p);
    const addFollowed = addId && g2[addId] && g1[addId] ? g2[addId].y < g1[addId].y - 2 : false;
    const itemsKeys = Object.keys(g2).filter((k) => !/^F_/.test(k));
    const addNoOverlap = addId ? !strictOverlap(g2, addId, itemsKeys) : false;
    report[K("R9")] = { dupRowTo3: rowsAfterDup === 3, anchorIsTable: addA?.anchor === "I_table", anchor: addA?.anchor || null, noRowAnchor, rowStaysOnDrag: rowStays, rowsAfter: rowsNow, addFollowed, addNoOverlap, warn: nWarn(w) };
    report[K("R3")] = { noRepeatPartAsAnchor: noRowAnchor && !anc.some((a) => a.anchor && /^card_/.test(a.anchor)) };
  }
  // ===== 試験台5 T1〜T5 =====
  const contentRight = (DW[device] + (device === "pc" ? 1326 : 351)) / 2;
  // T1：区切り線を甘味処の見出しと営業時間の間へ（中心が甘味処見出しの下端のすぐ下）→ 並び替え
  { const b = await fresh(); await shot(p, `T1-before-${device}.jpg`);
    const targetTop = b.I_kanmi.y + b.I_kanmi.h + 2 - b.I_divider.h / 2;
    await dragTo(p, "I_divider", b.I_divider.x, targetTop, dw);
    const g = await geom(p); const anc = await anchors(p); const w = await warns(p); const dv = anc.find((a) => a.part === "I_divider");
    await shot(p, `T1-after-${device}.jpg`);
    const reordered = g.I_kanmi.y < g.I_divider.y && g.I_divider.y < g.I_time.y;
    await select(p, ["I_divider"]); await p.evaluate((d) => window.__playground.resetScope("part", "I_divider", [d]), device); await pause(p, 150);
    const g2 = await geom(p); const restored = g2.I_divider.y < g2.I_kanmi.y && g2.I_kanmi.y < g2.I_time.y;
    report[K("T1")] = { reordered, order: [+g.I_kanmi.y.toFixed(1), +g.I_divider.y.toFixed(1), +g.I_time.y.toFixed(1)], noM1M2: !dv, overlap: w.overlaps.length, restored };
  }
  // T2（改）：区切り線の上端を表の下端＋40 へ → 並び替え（表→区切り線→ボタン）。間隔は2章。重なり0
  { const b = await fresh(); await shot(p, `T2-before-${device}.jpg`);
    const targetTop = b.I_table.y + b.I_table.h + 40;
    await dragTo(p, "I_divider", b.I_divider.x, targetTop, dw);
    const g = await geom(p); const anc = await anchors(p); const w = await warns(p); const dv = anc.find((a) => a.part === "I_divider");
    await shot(p, `T2-after-${device}.jpg`);
    const reordered = g.I_table.y < g.I_divider.y && g.I_divider.y < g.I_pillbg.y;
    const sg = stackGaps(g); const gp = (a2, b2) => { const e = sg.gaps.find((x) => x.a === a2 && x.b === b2); return e ? e.gap : null; };
    await select(p, ["I_divider"]); await p.evaluate((d) => window.__playground.resetScope("part", "I_divider", [d]), device); await pause(p, 150);
    const g2 = await geom(p); const restored = g2.I_divider.y < g2.I_kanmi.y;
    report[K("T2")] = { reordered, noM1M2: !dv, overlap: w.overlaps.length, gaps: { time_table: gp("I_time", "I_table"), table_divider: gp("I_table", "I_divider"), divider_pill: gp("I_divider", "I_pillbg") }, restored };
  }
  // T3：区切り線を甘味処の表の上端から60下（表の中）へ → M2・付いていく先=表・詰めた後も表の上端+60
  { const b = await fresh(); await shot(p, `T3-before-${device}.jpg`);
    const targetTop = b.I_table.y + 60;
    await dragTo(p, "I_divider", b.I_divider.x, targetTop, dw);
    const g = await geom(p); const anc = await anchors(p); const dv = anc.find((a) => a.part === "I_divider");
    await shot(p, `T3-after-${device}.jpg`);
    report[K("T3")] = { m2: dv?.mode === "M2", anchorTable: dv?.anchor === "I_table", anchor: dv?.anchor || null, offsetFromTableTopAfter: +(g.I_divider.y - g.I_table.y).toFixed(2) };
  }
  // T4（PC）：特集1の本文を写真の下端から24下へ → 付いていく先=写真・間隔24・見出しは写真の縦中央-12
  if (device === "pc") { const b = await fresh();
    await dragTo(p, "F_b0", b.F_p0.x, b.F_p0.y + b.F_p0.h + 24, dw);
    const g = await geom(p); const anc = await anchors(p); const w = await warns(p); const dv = anc.find((a) => a.part === "F_b0");
    report["T4-pc"] = { anchorPhoto: dv?.anchor === "F_p0", gapRecorded: dv?.gapY, gapAfterSettle: +(g.F_b0.y - (g.F_p0.y + g.F_p0.h)).toFixed(2), headCenterVsPhotoCenter: +((g.F_h0.y + g.F_h0.h / 2) - (g.F_p0.y + g.F_p0.h / 2)).toFixed(2), overlap: w.overlaps.length };
  }
  // T5（PC→SP）：見出しを Cmd+C/V。SP で 左端=コピー元・幅≤コピー元SP幅(333)・右端≤中身の右端(370.5)
  if (device === "pc") { await fresh(); await select(p, ["F_h0"]); await p.keyboard.press("ControlOrMeta+c"); await pause(p, 80); await p.keyboard.press("ControlOrMeta+v"); await pause(p, 250);
    const addId = (await anchors(p)).filter((a) => a.added).slice(-1)[0]?.part;
    await setDevice(p, "sp"); await pause(p, 150); const gsp = await geom(p);
    const srcLeft = gsp.F_h0.x, srcW = gsp.F_h0.w; const pasted = addId ? gsp[addId] : null; const cr = (390 + 351) / 2;
    report["T5-pc"] = { srcSPwidth: +srcW.toFixed(1), pastedLeft: pasted ? +pasted.x.toFixed(1) : null, leftEqualsSrc: pasted ? near(pasted.x, srcLeft, 1) : false, pastedW: pasted ? +pasted.w.toFixed(1) : null, widthLEsrc: pasted ? pasted.w <= srcW + 0.5 : false, rightWithin: pasted ? pasted.x + pasted.w <= cr + 0.5 : false };
    await setDevice(p, "pc");
  }
  // ===== V1：縦積みから1つずつ抜いたときの残りの間隔が2章どおり =====
  // PC：品セクションで 区切り線・甘味処見出し・営業時間 を1つずつ 表の上端+60（縦中心）へ → M2
  // SP：特集1の見出し・本文 を1つずつ 特集2の写真の縦中心+30 へ → M2
  { const v1 = {}; const targets = device === "pc" ? ["I_divider", "I_kanmi", "I_time"] : ["F_h0", "F_b0"];
    for (let i = 0; i < targets.length; i++) {
      const id = targets[i]; const b = await fresh();
      if (i === 0) await shot(p, `V1-before-${device}.jpg`);
      let targetTop;
      if (device === "pc") targetTop = b.I_table.y + 60 - b[id].h / 2;
      else { const t = b.F_p1; targetTop = t.y + t.h / 2 + 30 - b[id].h / 2; }
      await dragTo(p, id, b[id].x, targetTop, dw);
      const g = await geom(p); const dv = (await anchors(p)).find((a) => a.part === id); const w = await warns(p);
      if (i === 0) await shot(p, `V1-after-${device}.jpg`);
      if (device === "pc") { const sg = stackGaps(g, [id]); v1[id] = { m2: dv?.mode === "M2", anchor: dv?.anchor || null, remainGaps: sg.gaps.map((x) => `${x.a}->${x.b}:${x.gap}`), overlapOfMovedPart: w.overlaps.filter((o) => o.a === id || o.b === id).length }; }
      else { const fst = ["F_p0", "F_h0", "F_b0"].filter((x) => g[x] && x !== id).sort((a, b) => g[a].y - g[b].y); const fg = []; for (let j = 1; j < fst.length; j++) fg.push(`${fst[j - 1]}->${fst[j]}:${+(g[fst[j]].y - (g[fst[j - 1]].y + g[fst[j - 1]].h)).toFixed(1)}`); v1[id] = { m2: dv?.mode === "M2", anchor: dv?.anchor || null, remainGaps: fg, overlapOfMovedPart: w.overlaps.filter((o) => o.a === id || o.b === id).length }; }
    }
    report[K("V1")] = v1;
  }
  report[K("_errs")] = errs.slice(0, 5);
  await browser.close();
}
fs.writeFileSync(path.join(here, "_verify_q.json"), JSON.stringify(report, null, 2));
console.log("=== 6.2 Q試験 ===");
for (const k of Object.keys(report)) if (!k.startsWith("_")) console.log(k + ": " + JSON.stringify(report[k]));
for (const k of Object.keys(report)) if (k.includes("_errs") && report[k].length) console.log(k + " ERRORS: " + JSON.stringify(report[k]));
