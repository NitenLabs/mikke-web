// 6.2 今回の試験（Q1〜Q15）。playground3_single.html に本物のマウス・キーボード（IME は CDP）を与える。
import { chromium, webkit } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + path.resolve("refs/compare/layout/playground3_single.html");
const OUT = path.resolve("refs/compare/layout/playground3"); fs.mkdirSync(OUT, { recursive: true });
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
async function shot(p, name) { await p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }); }

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
  // Q11: 動かせる部品を塊の中(M1)と外(M2)へ。毎回 H1。実際に M1 になった場合のみ H2 を見る（M2 は 1章の例外）。
  { const set = [["F_h0", 10, 6], ["F_b0", 10, 6], ["F_p0", 10, 6], ["I_divider", 12, 0], ["I_kanmi", 10, 6]];
    let h1 = true, h2ok = true, worst = 0, note = "";
    for (const [id, mx, my] of set) {
      let b = await fresh(); await select(p, [id]); await pause(p, 50); await dragBy(p, id, mx, my, dw); let a = await geom(p);
      const mode = (await anchors(p)).find((x) => x.part === id)?.mode;
      let d = Math.max(Math.abs(a[id].x - (b[id].x + mx)), Math.abs(a[id].y - (b[id].y + my))); if (d > 0.5) { h1 = false; if (d > worst) { worst = d; note = id + " M1H1 " + d.toFixed(2); } }
      if (mode === "M1") { const hh = h2(b, a, [id]); if (!hh.ok) { h2ok = false; if (hh.worst > worst) { worst = hh.worst; note = id + " M1H2 " + hh.wid; } } }
      b = await fresh(); await select(p, [id]); await pause(p, 50); await dragBy(p, id, 0, 380, dw); a = await geom(p);
      d = Math.max(Math.abs(a[id].x - b[id].x), Math.abs(a[id].y - (b[id].y + 380))); if (d > 1) { h1 = false; if (d > worst) { worst = d; note = id + " M2H1 " + d.toFixed(2); } }
    }
    report[K("Q11")] = { h1, h2okM1: h2ok, worst: +worst.toFixed(2), note };
  }
  // Q12: コピー→貼り付け（+16,+16）・複製・両端末に出る（PC）
  if (device === "pc") { const b = await fresh(); await select(p, ["F_h0"]);
    await p.keyboard.press("ControlOrMeta+c"); await pause(p, 80); await p.keyboard.press("ControlOrMeta+v"); await pause(p, 200);
    let g = await geom(p); let anc = await anchors(p); const addId = anc.filter((a) => a.added).slice(-1)[0]?.part;
    const at16 = addId && g[addId] ? near(g[addId].x, b.F_h0.x + 16, 1.5) && near(g[addId].y, b.F_h0.y + 16, 3) : false;
    await select(p, ["F_p0"]); await p.keyboard.press("ControlOrMeta+d"); await pause(p, 200);
    g = await geom(p); anc = await anchors(p); const photoAdd = anc.filter((a) => a.added).slice(-1)[0]?.part; const photoOk = photoAdd && g[photoAdd] && g[photoAdd].kind === "photo";
    await setDevice(p, "sp"); await pause(p, 150); const gsp = await geom(p);
    const onSP = !!(addId && gsp[addId]);
    const noMark = addId ? await p.evaluate((id) => { const el = document.querySelector('[data-el="' + id + '"]'); return el ? !el.classList.contains("mark-manual") : null; }, addId) : null;
    await setDevice(p, "pc");
    report[K("Q12")] = { pasteAt16: at16, photoDuplicated: !!photoOk, addedOnSP: onSP, noManualMarkSP: noMark };
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
  report[K("_errs")] = errs.slice(0, 5);
  await browser.close();
}
fs.writeFileSync(path.join(here, "_verify_q.json"), JSON.stringify(report, null, 2));
console.log("=== 6.2 Q試験 ===");
for (const k of Object.keys(report)) if (!k.startsWith("_")) console.log(k + ": " + JSON.stringify(report[k]));
for (const k of Object.keys(report)) if (k.includes("_errs") && report[k].length) console.log(k + " ERRORS: " + JSON.stringify(report[k]));
