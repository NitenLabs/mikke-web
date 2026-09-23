// wa-01 layout-compare：方式A・方式Bを同じ試験にかけ、数値と比較画像を出す。
// 使い方: node experiments/layout/compare.mjs [g1|scenarios|ops|all]  （既定 all）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { baseContent, clone } from "./lib/content.mjs";
import { prepareTexts } from "./lib/text.mjs";
import { renderSection, browsers, closeBrowsers } from "./lib/browser.mjs";
import { emitAbsoluteSection } from "./lib/emit.mjs";
import { COLORS, DESIGN_W, FONT_URL, ROOT_VARS, setLineBreak } from "./lib/spec.mjs";
import * as A from "./a-box/model.mjs";
import * as B from "./b-anchor/model.mjs";
import * as C from "./c-hybrid/model.mjs";
import { SCENARIOS, makeContent } from "./scenarios/scenarios.mjs";
import { OPS } from "./ops/ops.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED = JSON.parse(fs.readFileSync(path.join(here, "expected-compare.json"), "utf8"));
const TOL = EXPECTED.tol;
const OUT = path.resolve(here, "../../refs/compare/layout");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, "panels"), { recursive: true });
// 見比べるページ（§5）に載せる試験。原寸パネルを個別保存する。
const INDEX_TESTS = { S1b: ["pc"], E1: ["pc", "sp"], E2: ["pc", "sp"], E4: ["pc", "sp"], E5: ["pc", "sp"], E8: ["pc", "sp"] };
function savePanels(name, device, panels) {
  if (!INDEX_TESTS[name]?.includes(device)) return;
  panels.forEach((p, i) => { if (p.png) fs.writeFileSync(path.join(OUT, "panels", `${name}-${device}-${i}.png`), Buffer.from(p.png, "base64")); });
}
const METHODS = { A, B, C };
const METHOD_KEYS = Object.keys(METHODS);
const DEVICES = ["pc", "sp"];
const bg = (section) => (section === "feature" ? COLORS.surface : COLORS.background);

// ---- 1つの (method, section, device, content, edits) を描いて実測 ----
async function render(mkey, section, device, content, edits = {}) {
  const m = METHODS[mkey];
  const boxes = m.collectTextBoxes(content, device);
  if (edits.addText) boxes.push({ key: "I_added", styleName: "featBody", device, widthPx: edits.addText.w, text: edits.addText.text });
  const H = await prepareTexts(boxes);
  let e = edits;
  if (edits.addText) { const h = H.get("I_added"); e = { ...edits, addText: { ...edits.addText, html: h.html, height: h.height } }; }
  const build = section === "feature" ? m.buildFeature : m.buildItems;
  const out = build(content, device, H, e);
  const { bodyHtml, extraCss } = mkey === "B"
    ? emitAbsoluteSection(out.primitives, out.sectionH, device, bg(section))
    : out;
  const r = await renderSection(bodyHtml, extraCss, device, { screenshot: true });
  r.byId = Object.fromEntries(r.els.map((x) => [x.id, x]));
  return r;
}

// ---- 照合ユーティリティ ----
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function combined(byId, ids) {
  const es = ids.map((i) => byId[i]).filter(Boolean);
  const x0 = Math.min(...es.map((e) => e.x)), y0 = Math.min(...es.map((e) => e.y));
  const x1 = Math.max(...es.map((e) => e.x + e.w)), y1 = Math.max(...es.map((e) => e.y + e.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cy: (y0 + y1) / 2, cx: (x0 + x1) / 2 };
}
function boxCheck(el, exp, fields, tolPos, tolSize) {
  const out = [];
  const map = { x: [exp[0], tolPos], y: [exp[1], tolPos], w: [exp[2], tolSize], h: [exp[3], tolSize] };
  for (const f of fields) {
    const [want, tol] = map[f];
    const got = el[f];
    out.push({ f, want, got: Math.round(got * 10) / 10, ok: near(got, want, tol) });
  }
  return out;
}

// ---- G1 ----
async function runG1() {
  const results = {};
  for (const mkey of METHOD_KEYS) {
    for (const device of DEVICES) {
      const content = baseContent();
      const rf = await render(mkey, "feature", device, content);
      const ri = await render(mkey, "items", device, content);
      const byId = { ...rf.byId, ...ri.byId };
      const fails = [];
      // boxes
      for (const b of EXPECTED.g1.boxes) {
        const el = byId[b.id];
        if (!el) { fails.push(`${b.id}: 要素なし`); continue; }
        const fields = b.fields.split("");
        for (const chk of boxCheck(el, b[device], fields, TOL.pos, TOL.size))
          if (!chk.ok) fails.push(`${b.id}.${chk.f} 期待${chk.want} 実測${chk.got}`);
      }
      // relations（pc のみ）
      if (device === "pc") {
        for (const r of EXPECTED.g1.relations) {
          const photo = byId[r.photo]; const grp = combined(byId, r.group);
          const diff = grp.cy - photo.cy; // 文字中央 - 写真中央
          if (!near(diff, r.offset, TOL.rel)) fails.push(`${r.id}: 文字中央-写真中央=${diff.toFixed(1)} 期待${r.offset}`);
        }
        const ids = EXPECTED.g1.cardPriceTop.ids.map((i) => byId[i]).filter(Boolean);
        const ys = ids.map((e) => e.y);
        if (Math.max(...ys) - Math.min(...ys) > TOL.rel) fails.push(`A9-cardtops: 価格上端そろわず ${ys.map((y) => y.toFixed(1))}`);
      }
      const warn = { overlaps: [...rf.warnings.overlaps, ...ri.warnings.overlaps], overflows: [...rf.warnings.overflows, ...ri.warnings.overflows] };
      if (warn.overlaps.length) fails.push(`重なり ${warn.overlaps.length}`);
      if (warn.overflows.length) fails.push(`はみ出し ${warn.overflows.length}`);
      results[`${mkey}-${device}`] = { pass: fails.length === 0, fails };
      // 画像（A|B は下でまとめて）
      results[`${mkey}-${device}`].png = { feature: rf.png, items: ri.png };
    }
  }
  // 画像：A|B|C（セクションごと・端末ごと）
  for (const device of DEVICES) for (const section of ["feature", "items"]) {
    await compose(METHOD_KEYS.map((m) => ({ label: `方式${m} ${section} ${device}`, png: results[`${m}-${device}`].png[section] })), device, path.join(OUT, `G1-${section}-${device}.jpg`));
  }
  for (const k of Object.keys(results)) delete results[k].png;
  return results;
}

// ---- 比較画像（横に並べて1枚・幅1200以内） ----
async function compose(panels, device, outPath) {
  const bt = (await browsers()).pc;
  const ctx = await bt.newContext({ viewport: { width: 1200, height: 2000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const panelW = Math.min(380, Math.floor(1180 / panels.length) - 8);
  const cells = panels.map((p) => `<div style="flex:none;width:${panelW}px">
    <div style="font:12px/1.6 monospace;padding:4px 0">${p.label}</div>
    ${p.png ? `<img src="data:image/png;base64,${p.png}" style="width:${panelW}px;display:block;border:1px solid #ccc">` : "<div>（なし）</div>"}
  </div>`).join("");
  const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff"><div style="display:flex;gap:8px;padding:8px;align-items:flex-start">${cells}</div></body>`;
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(100);
  const el = await page.$("div");
  await el.screenshot({ path: outPath, type: "jpeg", quality: 82 });
  await ctx.close();
}

// ---- scenarios（付録B） ----
async function runScenarios() {
  const results = {};
  const names = ["S1", "S1b", "S2", "S3", "S4", "S6b", "S7"];
  for (const name of names) {
    const section = ["S3", "S4", "S6b", "S7"].includes(name) ? "items" : "feature";
    for (const device of DEVICES) {
      const panels = [];
      // base（変える前は方式A の描画を代表に）
      const baseA = await render("A", section, device, baseContent());
      panels.push({ label: `変える前 ${device}`, png: baseA.png });
      for (const mkey of METHOD_KEYS) {
        const rBase = mkey === "A" ? baseA : await render(mkey, section, device, baseContent());
        const rNew = await render(mkey, section, device, makeContent(name));
        const chk = evalScenario(name, section, device, rBase, rNew);
        results[`${name}-${mkey}-${device}`] = chk;
        panels.push({ label: `方式${mkey} ${name} ${device}`, png: rNew.png });
      }
      savePanels(name, device, panels);
      await compose(panels, device, path.join(OUT, `${name}-${device}.jpg`));
    }
  }
  return results;
}

function shift(base, now, id) { return base.byId[id] && now.byId[id] ? +(now.byId[id].y - base.byId[id].y).toFixed(2) : null; }

function evalScenario(name, section, device, base, now) {
  const b = base.byId, n = now.byId;
  const warn = now.warnings;
  const notes = [];
  let ok = true;
  const req = (cond, msg) => { if (!cond) { ok = false; notes.push("NG:" + msg); } else notes.push("OK:" + msg); };
  if (name === "S1") {
    if (device === "pc") {
      const grp = combined(n, ["F_h0", "F_b0"]); const diff = grp.cy - n.F_p0.cy;
      req(near(diff, -12, TOL.rel), `文字中央-写真中央=${diff.toFixed(1)}(=-12)`);
      req(near(n.F_p0.y, b.F_p0.y, TOL.same), "写真F_p0動かない");
      req(near(shift(base, now, "F_p1"), 0, TOL.pos), `ブロック2不変(shift=${shift(base, now, "F_p1")})`);
    } else {
      const dBody = n.F_b0.h - b.F_b0.h;
      req(near(shift(base, now, "F_p1"), dBody, TOL.pos), `以下が本文増分だけ下がる(shift=${shift(base, now, "F_p1")}, Δbody=${dBody.toFixed(1)})`);
    }
  } else if (name === "S1b") {
    if (device === "pc") {
      const grp = combined(n, ["F_h0", "F_b0"]); const diff = grp.cy - n.F_p0.cy;
      req(near(diff, -12, TOL.rel), `縦中央-12維持=${diff.toFixed(1)}`);
      req(!warn.overlaps.some((o) => ["F_h0", "F_b0"].includes(o.a) && ["F_lbl", "F_h", "F_rule"].includes(o.b) || ["F_h0", "F_b0"].includes(o.b) && ["F_lbl", "F_h", "F_rule"].includes(o.a)), "見出しの組に重ならない");
      const blk1Bottom = Math.max(n.F_p0.y + n.F_p0.h, combined(n, ["F_h0", "F_b0"]).y + combined(n, ["F_h0", "F_b0"]).h);
      req(near(n.F_p1.y - blk1Bottom, 80, TOL.pos), `ブロック2=ブロック1最下+80(=${(n.F_p1.y - blk1Bottom).toFixed(1)})`);
    } else notes.push(`SP: 以下shift=${shift(base, now, "F_p1")}`);
  } else if (name === "S2") {
    if (device === "pc") {
      const grp = combined(n, ["F_h0", "F_b0"]); const diff = grp.cy - n.F_p0.cy;
      req(near(diff, -12, TOL.rel), `縦中央-12=${diff.toFixed(1)}`);
      req(near(n.F_b0.y - (n.F_h0.y + n.F_h0.h), 16, TOL.pos), `見出し-本文間隔16(=${(n.F_b0.y - (n.F_h0.y + n.F_h0.h)).toFixed(1)})`);
      req(n.F_h0.h > b.F_h0.h + 10, `見出しが2行に(h=${n.F_h0.h})`);
    } else notes.push(`SP: 見出しh=${n.F_h0.h} 以下shift=${shift(base, now, "F_p1")}`);
  } else if (name === "S3") {
    if (device === "pc") {
      const ys = ["card_price_c_jonama", "card_price_c_warabi", "card_price_c_dora"].map((i) => n[i].y);
      req(Math.max(...ys) - Math.min(...ys) <= TOL.rel, `3価格の上端そろう(${ys.map((y) => y.toFixed(1))})`);
      req(["card_name_c_jonama", "card_name_c_warabi", "card_name_c_dora"].every((i) => near(shift(base, now, i), 0, TOL.same)), "品名の上端不変");
      const dPrice = shift(base, now, "card_price_c_jonama");
      req(near(shift(base, now, "I_divider"), dPrice, TOL.pos), `区切り線が価格と同じだけ下がる(div=${shift(base, now, "I_divider")}, price=${dPrice})`);
      notes.push(`価格の下がり=${dPrice}（1行=約22.4）`);
    } else {
      // SP：説明を伸ばしたカード(c_warabi)の価格とそれ以下が22.4下がる。上のカード(c_jonama)は不変。
      req(near(shift(base, now, "card_price_c_jonama"), 0, TOL.same), "上のカードは不変");
      const dW = shift(base, now, "card_price_c_warabi");
      const dD = shift(base, now, "card_price_c_dora");
      const dDiv = shift(base, now, "I_divider");
      req(dW > 15 && dD > 15 && near(dW, dD, TOL.pos), `そのカードの価格と以下が下がる(warabi=${dW}, dora=${dD})`);
      req(near(dDiv, dW, TOL.pos), `区切り線も同じだけ下がる(${dDiv})`);
      notes.push(`下がり=${dW}（1行=約22.4）`);
    }
  } else if (name === "S4") {
    req(warn.overflows.length === 0, `幅${DESIGN_W[device]}外に出ない(overflow=${warn.overflows.length})`);
    const c4 = n["card_photo_c_sakura"];
    if (device === "pc" && c4) req(near(c4.x, n.card_photo_c_jonama.x, TOL.pos), `4枚目は2行目の左端(x=${c4.x})`);
    if (device === "sp" && c4) req(c4.y > n.card_photo_c_dora.y, "4枚目は3枚目の下");
  } else if (name === "S6b") {
    const d = shift(base, now, "I_pillbg");
    req(d < -50, `ピルと以下が上がる(shift=${d})`);
    notes.push(`ピルの上がり=${d}`);
  } else if (name === "S7") {
    // 説明を消した行が縮む＝以下が上がる
    const d = shift(base, now, "I_pillbg");
    req(d < 0, `説明を消して以下が上がる(shift=${d})`);
    notes.push(`以下の上がり=${d}（行が縮んだ分）`);
  }
  return { pass: ok, notes, warn: { overlaps: warn.overlaps.length, overflows: warn.overflows.length } };
}

// ---- ops（付録C） ----
async function runOps() {
  const results = {};
  for (const [name, op] of Object.entries(OPS)) {
    for (const device of DEVICES) {
      const panels = [];
      const baseContentObj = op.scenario ? makeContent(op.scenario) : baseContent();
      const baseA = await render("A", op.section, device, op.scenario ? makeContent(op.scenario) : baseContent());
      panels.push({ label: `前 ${device}`, png: baseA.png });
      for (const mkey of METHOD_KEYS) {
        let edits = op.edits(device);
        if (edits.pcOnly && device !== "pc") edits = {};
        const content = op.scenario ? makeContent(op.scenario) : baseContent();
        const r = await render(mkey, op.section, device, content, edits);
        results[`${name}-${mkey}-${device}`] = await evalOp(name, op, device, r, mkey);
        panels.push({ label: `方式${mkey} ${name} ${device}`, png: r.png });
      }
      savePanels(name, device, panels);
      await compose(panels, device, path.join(OUT, `${name}-${device}.jpg`));
    }
  }
  return results;
}

async function evalOp(name, op, device, r, mkey) {
  const n = r.byId; const warn = r.warnings;
  const notes = []; let ok = true;
  const req = (c, m) => { if (!c) { ok = false; notes.push("NG:" + m); } else notes.push("OK:" + m); };
  if (op.showOnly) {
    notes.push(`showOnly：重なり${warn.overlaps.length}・はみ出し${warn.overflows.length}`);
    if (name === "E5") notes.push(`F_h1.y=${n.F_h1?.y} F_b1.y=${n.F_b1?.y}（写真なし）`);
    if (name === "E4") notes.push(`I_added.y=${n.I_added?.y}（A=絶対で留まる／B・C=区切り線に追従）`);
    if (name === "E2") notes.push(`F_b0=(${n.F_b0?.x},${n.F_b0?.y})（A=絶対で跡詰まる／B=写真に再基準／C=写真直後）`);
    if (name === "E8") { const d = n.F_b0 && n.F_h0 ? (n.F_b0.y - (n.F_h0.y + n.F_h0.h)).toFixed(1) : "?"; notes.push(`見出し下端→本文上端の距離=${d}（テンプレ間隔16→24）`); }
    return { pass: null, notes, warn: { overlaps: warn.overlaps.length, overflows: warn.overflows.length } };
  }
  if (name === "E1") {
    req(warn.overlaps.length === 0, `重なりなし(${warn.overlaps.length})`);
    notes.push(`見出しF_h0=(${n.F_h0.x},${n.F_h0.y}) 本文F_b0=(${n.F_b0?.x},${n.F_b0?.y})`);
  } else if (name === "E3") {
    const ph = n.card_photo_c_jonama;
    req(near(ph.h, op.edits(device).template.cardPhotoH[device], 2), `写真高さ=${ph.h}`);
    const ys = ["card_price_c_jonama", "card_price_c_warabi", "card_price_c_dora"].map((i) => n[i]?.y);
    if (device === "pc") req(Math.max(...ys) - Math.min(...ys) <= TOL.rel, `価格そろい(${ys})`);
  } else if (name === "E6") {
    // SP は base と同じ（この device が sp のとき edits 空→base）
    if (device === "sp") { const base = await render(mkey, "feature", "sp", baseContent()); req(near(n.F_h0.y, base.byId.F_h0.y, TOL.same), `SP不変(F_h0 ${n.F_h0.y} vs ${base.byId.F_h0.y})`); }
    else notes.push(`PC: F_h0=(${n.F_h0.x},${n.F_h0.y})`);
  } else if (name === "E7") {
    const base = await render(mkey, "feature", device, baseContent());
    let same = true; for (const id of ["F_lbl", "F_h", "F_p0", "F_h0", "F_b0", "F_p1", "F_h1", "F_b1"]) if (!near(n[id].y, base.byId[id].y, TOL.same)) same = false;
    req(same, "reset で G1 と同じ");
  } else if (name === "E8") {
    req(n.F_b0.y - (n.F_h0.y + n.F_h0.h) > 20, `本文が新間隔24で置かれる(${(n.F_b0.y - (n.F_h0.y + n.F_h0.h)).toFixed(1)})`);
    notes.push(`見出しの手動ずらしは残る（F_h0.x=${n.F_h0.x}）`);
  }
  return { pass: ok, notes, warn: { overlaps: warn.overlaps.length, overflows: warn.overflows.length } };
}

// ---- G2（clone-q65 の FEATURE・PRICE を覆った参照元の実測から組む・PC/SP）----
// 参照元＝refs/studio-Q65qmmvqVR/masked/elements-{pc,sp}.json（生の実測。clone-q65 site.json は
// SP が clone-gen の乱れた成果物なので使わない）。_g2_target.json に要素id→pc/sp座標を持つ。
// 参照元は lineBreakRules:false なので改行規則を切って組む。±2px・文字の段は完全一致で照合。
async function runG2() {
  const { content, targets } = JSON.parse(fs.readFileSync(path.join(here, "_g2_target.json"), "utf8"));
  const results = {};
  const methods = Object.keys(METHODS); // A, B,（あれば C）
  setLineBreak(false);
  for (const device of ["pc", "sp"]) {
    const featPanels = [], pricePanels = [];
    // 参照元プロファイル：SP のカード送りは 489.8（gap40）・カード→区切り線 88（芦屋堂は 24/98）
    const g2edits = { geom: { sp: { interCard: 40, colGap: 40, cardsToDivider: 88 } } };
    for (const mkey of methods) {
      const rf = await render(mkey, "feature", device, content);
      const ri = await render(mkey, "items", device, content, g2edits);
      const byId = { ...rf.byId, ...ri.byId };
      const fails = [];
      for (const [id, tgt] of Object.entries(targets)) {
        const want = tgt[device]; if (!want) continue;
        const el = byId[id]; if (!el) { fails.push(`${id}:なし`); continue; }
        ["x", "y", "w", "h"].forEach((f, i) => { if (!near(el[f], want[i], 2)) fails.push(`${id}.${f} 参照${want[i]} 実測${el[f].toFixed(1)}`); });
      }
      const ys = ["card_price_g2c0", "card_price_g2c1", "card_price_g2c2"].map((i) => byId[i]?.y).filter((v) => v != null);
      if (device === "pc" && ys.length === 3 && Math.max(...ys) - Math.min(...ys) > 2) fails.push(`価格そろわず ${ys}`);
      results[`${mkey}-${device}`] = { pass: fails.length === 0, fails };
      featPanels.push({ label: `方式${mkey} FEATURE ${device}`, png: rf.png });
      pricePanels.push({ label: `方式${mkey} PRICE ${device}`, png: ri.png });
    }
    await compose(featPanels, device, path.join(OUT, `G2-feature-${device}.jpg`));
    await compose(pricePanels, device, path.join(OUT, `G2-price-${device}.jpg`));
  }
  setLineBreak(true);
  return results;
}

// ---- G3（3エンジン × 複数幅で 重なり0・はみ出し0・実測ずれ2px以内）----
async function runG3() {
  const { chromium, webkit, firefox } = await import("playwright");
  const engines = { chromium, webkit, firefox };
  const results = {};
  for (const mkey of METHOD_KEYS) {
    for (const [section, device] of [["feature", "pc"], ["items", "pc"], ["feature", "sp"], ["items", "sp"]]) {
      // 1回組んで HTML を得る（本文の実測は device の基準エンジンで確定済み）
      const m = METHODS[mkey];
      const H = await prepareTexts(m.collectTextBoxes(baseContent(), device));
      const out = (section === "feature" ? m.buildFeature : m.buildItems)(baseContent(), device, H, {});
      const { bodyHtml, extraCss } = mkey === "B" ? emitAbsoluteSection(out.primitives, out.sectionH, device, bg(section)) : out;
      // 幅：pc=[1440,1024]、sp=[390,360]（比例縮小＝transform scale）
      const widths = device === "pc" ? [1440, 1024] : [390, 360];
      const perEngine = {};
      let overlaps = 0, overflows = 0;
      for (const [ename, bt] of Object.entries(engines)) {
        const r = await renderScaled(bt, bodyHtml, extraCss, device, DESIGN_W[device]);
        perEngine[ename] = Object.fromEntries(r.els.map((e) => [e.id, e]));
        overlaps += r.warnings.overlaps.length; overflows += r.warnings.overflows.length;
      }
      // エンジン間ずれ（chromium 基準）
      let maxDrift = 0;
      const base = perEngine.chromium;
      for (const eng of ["webkit", "firefox"]) for (const id of Object.keys(base)) {
        const a = base[id], b = perEngine[eng][id]; if (!b) continue;
        maxDrift = Math.max(maxDrift, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      }
      // 幅違い（scale）で重なり・はみ出しが出ないか（chromium）
      for (const w of widths.slice(1)) {
        const r = await renderScaled(chromium, bodyHtml, extraCss, device, DESIGN_W[device], w / DESIGN_W[device]);
        overlaps += r.warnings.overlaps.length; overflows += r.warnings.overflows.length;
      }
      results[`${mkey}-${section}-${device}`] = { pass: overlaps === 0 && overflows === 0 && maxDrift <= 2, overlaps, overflows, maxDrift: +maxDrift.toFixed(2) };
    }
  }
  return results;
}

// 指定エンジン・幅で描いて実測（scale で比例縮小可）
async function renderScaled(bt, bodyHtml, extraCss, device, designW, scale = 1) {
  const browser = await bt.launch();
  const ctx = await browser.newContext({ viewport: { width: Math.ceil(designW * scale) + 4, height: 4000 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  const wrap = scale === 1 ? bodyHtml : `<div style="transform:scale(${scale});transform-origin:top left">${bodyHtml}</div>`;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT_URL}">
<style>:root{font-size:10px;${ROOT_VARS.join("")}}*{margin:0;padding:0;box-sizing:border-box}#sec{position:relative;overflow:hidden}
.t{line-break:strict;word-break:normal;overflow-wrap:anywhere;white-space:normal}.t.lb{word-break:keep-all;overflow-wrap:anywhere}.t .nowrap{white-space:nowrap}
.photo{display:flex;align-items:center;justify-content:center;color:#fff;background:#8a8a8a}.line{background:var(--c-line)}
.row-lines{box-shadow:inset 0 1px 0 var(--c-line)}.row-lines .krow{box-shadow:inset 0 -1px 0 var(--c-line)}${extraCss || ""}</style></head><body>${wrap}</body></html>`;
  await page.setContent(html, { waitUntil: "load" });
  for (let i = 0; i < 60; i++) { const ok = await page.evaluate(() => { document.body.offsetHeight; return !document.fonts || document.fonts.status === "loaded"; }); if (ok) break; await page.waitForTimeout(80); }
  await page.waitForTimeout(120);
  const data = await page.evaluate((sc) => {
    const sec = document.getElementById("sec"); const sr = sec.getBoundingClientRect(); const R = (n) => Math.round(n / sc * 100) / 100;
    const els = [...sec.querySelectorAll("[data-el]")].map((el) => { const r = el.getBoundingClientRect(); return { id: el.getAttribute("data-el"), kind: el.getAttribute("data-kind") || "box", x: R(r.left - sr.left), y: R(r.top - sr.top), w: R(r.width), h: R(r.height) }; });
    return { els, secW: R(sr.width) };
  }, scale);
  await browser.close();
  const content = data.els.filter((e) => ["text", "photo", "pill"].includes(e.kind));
  const overlaps = []; for (let i = 0; i < content.length; i++) for (let j = i + 1; j < content.length; j++) { const a = content[i], b = content[j]; const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ox <= 1 || oy <= 1) continue; const contains = (p, q) => p.x <= q.x + 1 && p.y <= q.y + 1 && p.x + p.w >= q.x + q.w - 1 && p.y + p.h >= q.y + q.h - 1; if (contains(a, b) || contains(b, a)) continue; overlaps.push({ a: a.id, b: b.id }); }
  const overflows = content.filter((e) => e.x < -1 || e.x + e.w > data.secW + 1).map((e) => ({ id: e.id }));
  return { els: data.els, warnings: { overlaps, overflows } };
}

// ---- 見比べるページ（§5）----
function generateIndex(report) {
  const order = [["E1", "op"], ["E2", "op"], ["E4", "op"], ["E5", "op"], ["E8", "op"], ["S1b", "scenario"]];
  const did = {
    E1: "見出しを右へ12・下へ8 動かし、その後 本文を3行増やした（S1）",
    E2: "本文を写真の下（塊の外）へ動かした",
    E4: "区切り線の下に文字を足し、その後 カードを4件にした（S4）",
    E5: "ブロック2の写真を消した",
    E8: "見出しを動かした後、テンプレの見出し-本文の間隔を16→24に変えた",
    S1b: "ブロック1の本文を14行増やし、文字の塊を写真より高くした",
  };
  const rows = [];
  for (const [name, kind] of order) {
    for (const device of INDEX_TESTS[name]) {
      const notesOf = (m) => {
        const r = kind === "op" ? report.ops?.[`${name}-${m}-${device}`] : report.scenarios?.[`${name}-${m}-${device}`];
        if (!r) return "-";
        const w = `重${r.warn.overlaps}/出${r.warn.overflows}`;
        return `${(r.notes || []).join(" ｜ ")}（${w}）`;
      };
      const imgs = [0, 1, 2, 3].map((i) => {
        const f = `panels/${name}-${device}-${i}.png`;
        const label = ["変える前", "方式A", "方式B", "方式C"][i];
        return `<figure><figcaption>${label}</figcaption><a href="${f}" target="_blank"><img src="${f}" loading="lazy"></a></figure>`;
      }).join("");
      rows.push(`<section>
        <h2>${name}（${device}）</h2>
        <p class="did"><b>したこと：</b>${did[name]}</p>
        <div class="strip">${imgs}</div>
        <ul class="what">
          <li><b>A：</b>${notesOf("A")}</li>
          <li><b>B：</b>${notesOf("B")}</li>
          <li><b>C：</b>${notesOf("C")}</li>
        </ul>
      </section>`);
    }
  }
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>wa-01 layout-compare 見比べ</title>
<meta name="robots" content="noindex,nofollow">
<style>
body{font:14px/1.7 system-ui,sans-serif;margin:0;padding:24px;background:#fafafa;color:#222}
h1{font-size:20px} h2{font-size:16px;margin:0 0 6px}
section{background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;margin:0 0 24px}
.did{margin:0 0 10px;color:#333}
.strip{display:flex;gap:10px;align-items:flex-start;overflow-x:auto}
figure{margin:0;flex:none;width:280px} figcaption{font:12px monospace;color:#666;padding:2px 0}
img{width:280px;display:block;border:1px solid #ccc;background:#fff}
.what{margin:10px 0 0;padding-left:18px} .what li{margin:2px 0}
.note{color:#666;font-size:13px}
</style></head><body>
<h1>wa-01 layout-compare 見比べ（方式A｜B｜C）</h1>
<p class="note">左から「変える前｜方式A｜方式B｜方式C」。画像を押すと原寸で開く。どれが良いかは書かない（判定はしない）。公開しないページ。</p>
${rows.join("\n")}
</body></html>`;
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  console.log(`見比べページ: ${path.join(OUT, "index.html")}`);
}

// ---- main ----
const mode = process.argv[2] || "all";
const report = {};
if (mode === "g1" || mode === "all") report.g1 = await runG1();
if (mode === "g2" || mode === "all") report.g2 = await runG2();
if (mode === "g3" || mode === "all") report.g3 = await runG3();
if (mode === "scenarios" || mode === "all") report.scenarios = await runScenarios();
if (mode === "ops" || mode === "all") report.ops = await runOps();
if (report.ops && report.scenarios) generateIndex(report);
await closeBrowsers();
fs.writeFileSync(path.join(here, "_report.json"), JSON.stringify(report, null, 2));

// サマリ出力
console.log("\n===== wa-01 layout-compare 結果 =====");
if (report.g1) {
  console.log("\n[G1]");
  for (const k of Object.keys(report.g1)) console.log(`  ${k}: ${report.g1[k].pass ? "PASS" : "FAIL"} ${report.g1[k].fails.length ? "→ " + report.g1[k].fails.join(" / ") : ""}`);
}
if (report.g2) {
  console.log("\n[G2 clone-q65（参照元 masked・PC/SP）]");
  for (const k of Object.keys(report.g2)) console.log(`  ${k}: ${report.g2[k].pass ? "PASS" : "FAIL"} ${report.g2[k].fails.length ? "→ " + report.g2[k].fails.slice(0, 4).join(" / ") : ""}`);
}
if (report.g3) {
  console.log("\n[G3 3エンジン×幅]");
  for (const k of Object.keys(report.g3)) { const r = report.g3[k]; console.log(`  ${k}: ${r.pass ? "PASS" : "FAIL"} (重${r.overlaps}/出${r.overflows}/エンジン差${r.maxDrift}px)`); }
}
if (report.scenarios) {
  console.log("\n[Scenarios 付録B]");
  for (const k of Object.keys(report.scenarios)) { const r = report.scenarios[k]; console.log(`  ${k}: ${r.pass ? "PASS" : "FAIL"} (重${r.warn.overlaps}/出${r.warn.overflows}) ${r.notes.join(" | ")}`); }
}
if (report.ops) {
  console.log("\n[Ops 付録C]");
  for (const k of Object.keys(report.ops)) { const r = report.ops[k]; console.log(`  ${k}: ${r.pass === null ? "SHOW" : r.pass ? "PASS" : "FAIL"} (重${r.warn.overlaps}/出${r.warn.overflows}) ${r.notes.join(" | ")}`); }
}
console.log(`\n画像: ${OUT}`);
