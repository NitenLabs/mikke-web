// 5.2 手で動かす試験（P1〜P10）。ページ playground2_single.html に「本物のマウスの操作」を与え、
// A と 新しい C（C2）を PC(chromium)/SP(webkit) で測る。H1（離した位置にぴったり）・H2（選んでない部品は動かない）・
// H3（中身を変えると付いていく）・重なり/はみ出し・1つ戻すで戻る・端末独立（P8）・付いていく先の一覧（5.3）。
import { chromium, webkit } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + path.resolve("refs/compare/layout/playground2_single.html");
const OUT = path.resolve("refs/compare/layout");
const DW = { pc: 1440, sp: 390 };
// P2 の範囲選択の矩形（design 座標）：特集1の見出し＋本文だけを囲む（写真は含めない）。端末で座標が違う。
const MQ = { pc: [140, 455, 690, 600], sp: [10, 470, 378, 606] };
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;

const geom = (p) => p.evaluate(() => window.__playground.geometry());
const warns = (p) => p.evaluate(() => window.__playground.warnings());
const anchors = (p) => p.evaluate(() => window.__playground.anchors());
const reset = (p) => p.evaluate(() => window.__playground.reset());
const setModel = (p, m) => p.evaluate((m) => window.__playground.setModel(m), m);
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const select = (p, ids) => p.evaluate((ids) => window.__playground.select(ids), ids);

async function secInfo(p, section, dw) {
  return p.evaluate((s) => { const el = document.querySelector("#host_" + s + " #sec"); const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width }; }, section);
}
const secOf = (id) => (id.startsWith("F_") ? "feature" : "items");
async function centerScreen(p, id) {
  return p.evaluate((id) => { for (const h of ["host_feature", "host_items"]) { const el = document.querySelector("#" + h + ' [data-el="' + id + '"]'); if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } } return null; }, id);
}
async function pause(p, ms = 90) { await p.waitForTimeout(ms); }

// 実マウスで id を design 差分 (ddx,ddy) だけ動かす（掴む→動かす→離す）。要素の今の見た目の中心を掴む。
async function dragBy(p, id, ddx, ddy, dw) {
  const sec = secOf(id); const si = await secInfo(p, sec, dw); const sc = si.w / dw;
  const c = await centerScreen(p, id); if (!c) throw new Error("no elem " + id);
  await p.mouse.move(c.x, c.y); await p.mouse.down();
  await p.mouse.move(c.x + ddx * sc * 0.5, c.y + ddy * sc * 0.5, { steps: 3 });
  await p.mouse.move(c.x + ddx * sc, c.y + ddy * sc, { steps: 3 });
  await p.mouse.up(); await pause(p);
}
// 実マウスで id を design 目標 (tx,ty)（要素の左上）に置く
async function dragTo(p, id, tx, ty, dw) {
  const g = await geom(p); const cur = g[id];
  await dragBy(p, id, tx - cur.x, ty - cur.y, dw);
}
// 範囲選択（PC 実マウス）：design 矩形で囲む
async function marquee(p, section, x0, y0, x1, y1, dw) {
  const si = await secInfo(p, section, dw); const sc = si.w / dw;
  const sx = si.left + x0 * sc, sy = si.top + y0 * sc, ex = si.left + x1 * sc, ey = si.top + y1 * sc;
  await p.mouse.move(sx, sy); await p.mouse.down();
  await p.mouse.move((sx + ex) / 2, (sy + ey) / 2, { steps: 3 }); await p.mouse.move(ex, ey, { steps: 3 });
  await p.mouse.up(); await pause(p);
}

// H2：moved 以外が base と一致するか
function h2ok(base, now, movedIds) {
  const moved = new Set(movedIds);
  let worst = 0, wid = "";
  for (const id of Object.keys(base)) {
    if (moved.has(id)) continue; if (!now[id]) continue;
    for (const f of ["x", "y"]) { const d = Math.abs(base[id][f] - now[id][f]); if (d > worst) { worst = d; wid = id + "." + f; } }
  }
  return { ok: worst <= 0.5, worst: +worst.toFixed(2), wid };
}
const nWarn = (w) => w.overlaps.length + w.overflows.length;

const report = {};

for (const [device, bt] of [["pc", chromium], ["sp", webkit]]) {
  const dw = DW[device];
  const browser = await bt.launch();
  // 全部品が折り返さず画面内に収まる高さにする（画面外だと実マウスが届かない）
  const ctx = await browser.newContext({ viewport: { width: device === "pc" ? 1500 : 430, height: 6000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(url);
  for (let i = 0; i < 40; i++) { const ok = await p.evaluate(() => document.fonts.status === "loaded"); if (ok) break; await p.waitForTimeout(100); }

  for (const model of ["A", "C2"]) {
    const key = (t) => `${t}-${model}-${device}`;
    // ---- 基準（reset）----
    async function fresh() { await reset(p); await setModel(p, model); await setDevice(p, device); await pause(p, 120); return geom(p); }

    // P1: 見出しを右12下8。その後 S1。
    { const base = await fresh();
      await dragBy(p, "F_h0", 12, 8, dw);
      const g1 = await geom(p);
      const h1 = near(g1.F_h0.x, base.F_h0.x + 12) && near(g1.F_h0.y, base.F_h0.y + 8);
      const h2 = h2ok(base, g1, ["F_h0"]);
      const anc = model === "C2" ? await anchors(p) : [];
      await p.click("#bInc"); await pause(p, 120); // S1
      const g2 = await geom(p); const w = await warns(p);
      report[key("P1")] = { h1, h1val: [+(g1.F_h0.x - base.F_h0.x).toFixed(2), +(g1.F_h0.y - base.F_h0.y).toFixed(2)], h2, anchors: anc, afterS1: { F_h0: [g2.F_h0.x, g2.F_h0.y], F_b0: g2.F_b0 ? [g2.F_b0.x, g2.F_b0.y] : null }, warn: nWarn(w) };
    }
    // P2: 見出し＋本文を範囲で選び下40。その後 S1。
    { const base = await fresh();
      await marquee(p, "feature", MQ[device][0], MQ[device][1], MQ[device][2], MQ[device][3], dw);
      await dragBy(p, "F_h0", 0, 40, dw);
      const g1 = await geom(p);
      const h1 = near(g1.F_h0.y, base.F_h0.y + 40) && near(g1.F_b0.y, base.F_b0.y + 40) && near(g1.F_h0.x, base.F_h0.x) && near(g1.F_b0.x, base.F_b0.x);
      const h2 = h2ok(base, g1, ["F_h0", "F_b0"]);
      const anc = model === "C2" ? await anchors(p) : [];
      await p.click("#bInc"); await pause(p, 120);
      const g2 = await geom(p); const w = await warns(p);
      report[key("P2")] = { h1, h1val: [+(g1.F_h0.y - base.F_h0.y).toFixed(2), +(g1.F_b0.y - base.F_b0.y).toFixed(2)], h2, photoStill: near(g1.F_p0.y, base.F_p0.y), anchors: anc, afterS1: { F_h0: [g2.F_h0.x, g2.F_h0.y], F_b0: [g2.F_b0.x, g2.F_b0.y] }, warn: nWarn(w) };
    }
    // P3: 本文を写真の下24（左端そろえ）。その後 S1→S2。
    { const base = await fresh();
      const tx = base.F_p0.x, ty = base.F_p0.y + base.F_p0.h + 24;
      await dragTo(p, "F_b0", tx, ty, dw);
      const g1 = await geom(p);
      const h1 = near(g1.F_b0.x, tx, 1) && near(g1.F_b0.y, ty, 1);
      const h2 = h2ok(base, g1, ["F_b0"]);
      const anc = model === "C2" ? await anchors(p) : [];
      await p.click("#bInc"); await pause(p, 120); await p.click("#h2"); await pause(p, 120);
      const g2 = await geom(p); const w = await warns(p);
      const underPhoto = g2.F_b0 && g2.F_p0 ? +(g2.F_b0.y - (g2.F_p0.y + g2.F_p0.h)).toFixed(2) : null;
      report[key("P3")] = { h1, h1val: [+(g1.F_b0.x - tx).toFixed(2), +(g1.F_b0.y - ty).toFixed(2)], h2, headingStill: near(g1.F_h0.y, base.F_h0.y), anchors: anc, afterS1S2: { F_b0_below_photo: underPhoto }, warn: nWarn(w) };
    }
    // P4: 区切り線の下24に文字を足す。その後 S4。
    { await fresh();
      await p.click("#addmode"); await pause(p);
      await p.locator('#host_items [data-el="I_divider"]').click({ force: true }); await pause(p, 120); // 1px の線を確実に押す
      const g1 = await geom(p); const base = g1;
      const anc = model === "C2" ? await anchors(p) : [];
      await p.click("#cInc"); await pause(p, 120); // S4（3→4）
      const g2 = await geom(p); const w = await warns(p);
      const follow = g2.I_added && g2.I_divider ? +(g2.I_added.y - (g2.I_divider.y + g2.I_divider.h)).toFixed(2) : null;
      const dividerMoved = +(g2.I_divider.y - base.I_divider.y).toFixed(2);
      const addedMoved = g2.I_added && base.I_added ? +(g2.I_added.y - base.I_added.y).toFixed(2) : null;
      report[key("P4")] = { addedGap0: base.I_added ? +(base.I_added.y - (base.I_divider.y + base.I_divider.h)).toFixed(2) : null, dividerMoved, addedMoved, gapAfter: follow, anchors: anc, warn: nWarn(w) };
    }
    // P5: 写真を左60下40。その後 S1。
    { const base = await fresh();
      await dragBy(p, "F_p0", -60, 40, dw);
      const g1 = await geom(p);
      const h1 = near(g1.F_p0.x, base.F_p0.x - 60) && near(g1.F_p0.y, base.F_p0.y + 40);
      const h2 = h2ok(base, g1, ["F_p0"]);
      const anc = model === "C2" ? await anchors(p) : [];
      await p.click("#bInc"); await pause(p, 120);
      const g2 = await geom(p); const w = await warns(p);
      report[key("P5")] = { h1, h1val: [+(g1.F_p0.x - base.F_p0.x).toFixed(2), +(g1.F_p0.y - base.F_p0.y).toFixed(2)], h2, anchors: anc, afterS1: { F_p0: [g2.F_p0.x, g2.F_p0.y] }, warn: nWarn(w) };
    }
    // P6: 特集2の写真を消す（remove）／外す（clear）。前回と同じ結果。
    { const base = await fresh();
      await select(p, ["F_p1"]); await pause(p); await p.click("#aClear"); await pause(p, 120);
      const gC = await geom(p);
      const frameStill = gC.F_p1 && near(gC.F_p1.x, base.F_p1.x) && near(gC.F_p1.y, base.F_p1.y) && near(gC.F_p1.w, base.F_p1.w) && near(gC.F_p1.h, base.F_p1.h);
      const othersC = h2ok(base, gC, ["F_p1"]);
      await fresh(); await select(p, ["F_p1"]); await pause(p); await p.click("#aRemove"); await pause(p, 120);
      const gR = await geom(p); const wR = await warns(p);
      report[key("P6")] = { clearFrameStill: frameStill, clearOthersStill: othersC.ok, removeGone: !gR.F_p1, removeWarn: nWarn(wR) };
    }
    // P7: P1 の後、間隔16→24。
    { const base = await fresh();
      await dragBy(p, "F_h0", 12, 8, dw);
      await p.click("#g24"); await pause(p, 120);
      const g = await geom(p); const anc = model === "C2" ? await anchors(p) : [];
      const dist = g.F_b0 && g.F_h0 ? +(g.F_b0.y - (g.F_h0.y + g.F_h0.h)).toFixed(2) : null;
      report[key("P7")] = { headBodyDist: dist, headMoved: [+(g.F_h0.x - base.F_h0.x).toFixed(2), +(g.F_h0.y - base.F_h0.y).toFixed(2)], anchors: anc };
    }
    // P8: PC で見出し移動 → SP の全部品が不変（この device が pc のときのみ意味を持つ）
    if (device === "pc") {
      await fresh();
      const spBase = await (async () => { await setDevice(p, "sp"); await pause(p, 120); const g = await geom(p); await setDevice(p, "pc"); await pause(p, 120); return g; })();
      await dragBy(p, "F_h0", 12, 8, dw);
      await setDevice(p, "sp"); await pause(p, 120);
      const spNow = await geom(p);
      const h = h2ok(spBase, spNow, []);
      report[key("P8")] = { spUnchanged: h.ok, worst: h.worst, wid: h.wid };
      await setDevice(p, "pc");
    }
    // P9: 動かせる全部品を3回ずつ別方向に。毎回 H1・H2。
    { const dragIds = device === "pc"
        ? ["F_hg", "F_p0", "F_h0", "F_b0", "F_p1", "F_h1", "F_b1", "I_hg", "I_divider", "I_kanmi", "I_time"]
        : ["F_hg", "F_p0", "F_h0", "F_b0", "F_p1", "F_h1", "F_b1", "I_hg", "I_divider", "I_kanmi", "I_time"];
      const dirs = [[20, 10], [-15, 25], [8, -18]];
      let allH1 = true, allH2 = true, worstH1 = 0, worstH2 = 0, note = "";
      for (const id of dragIds) {
        for (const [ddx, ddy] of dirs) {
          const before = await fresh(); await select(p, [id]); await pause(p, 50);
          await dragBy(p, id, ddx, ddy, dw);
          const after = await geom(p);
          const members = id.endsWith("_hg") ? [id, ...(id[0] === "F" ? ["F_lbl", "F_h", "F_rule"] : ["I_lbl", "I_h", "I_rule"])] : [id];
          const dH1 = Math.max(Math.abs(after[id].x - (before[id].x + ddx)), Math.abs(after[id].y - (before[id].y + ddy)));
          const h2 = h2ok(before, after, members);
          if (dH1 > 0.5) { allH1 = false; if (dH1 > worstH1) { worstH1 = dH1; note = id + " dir(" + ddx + "," + ddy + ") H1 " + dH1.toFixed(2) + " got(" + (after[id].x - before[id].x).toFixed(1) + "," + (after[id].y - before[id].y).toFixed(1) + ")"; } }
          if (!h2.ok) { allH2 = false; if (h2.worst > worstH2) { worstH2 = h2.worst; note = id + " H2 " + h2.worst + "@" + h2.wid; } }
        }
      }
      report[key("P9")] = { allH1, allH2, worstH1: +worstH1.toFixed(2), worstH2: +worstH2.toFixed(2), note };
    }
    // P10: P1〜P5 の「動かす」直後に 1つ戻す → 動かす前に戻る（±0.5）
    { const results = {};
      const moves = {
        P1: async () => dragBy(p, "F_h0", 12, 8, dw),
        P3: async () => { const g = await geom(p); await dragTo(p, "F_b0", g.F_p0.x, g.F_p0.y + g.F_p0.h + 24, dw); },
        P5: async () => dragBy(p, "F_p0", -60, 40, dw),
        P2: async () => { await marquee(p, "feature", MQ[device][0], MQ[device][1], MQ[device][2], MQ[device][3], dw); await dragBy(p, "F_h0", 0, 40, dw); },
      };
      for (const [nm, fn] of Object.entries(moves)) {
        const base = await fresh(); await fn();
        // 1つ戻す＝undo（UI ボタン）。
        await p.click("#undo"); await pause(p, 120);
        const g = await geom(p);
        const h = h2ok(base, g, []);
        results[nm] = { backOk: h.ok, worst: h.worst, wid: h.wid };
      }
      report[key("P10")] = results;
    }
  }
  await browser.close();
}

fs.writeFileSync(path.join(here, "_verify_p.json"), JSON.stringify(report, null, 2));
// ---- サマリ ----
console.log("=== 5.2 手で動かす試験（P1〜P10）===");
for (const k of Object.keys(report)) console.log(k + ": " + JSON.stringify(report[k]));
