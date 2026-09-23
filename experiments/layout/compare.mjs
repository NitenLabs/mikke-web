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
import { SCENARIOS, makeContent } from "./scenarios/scenarios.mjs";
import { OPS } from "./ops/ops.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED = JSON.parse(fs.readFileSync(path.join(here, "expected-compare.json"), "utf8"));
const TOL = EXPECTED.tol;
const OUT = path.resolve(here, "../../refs/compare/layout");
fs.mkdirSync(OUT, { recursive: true });
const METHODS = { A, B };
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
  for (const mkey of ["A", "B"]) {
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
  // 画像：A|B（セクションごと・端末ごと）
  for (const device of DEVICES) for (const section of ["feature", "items"]) {
    await compose([
      { label: `方式A ${section} ${device}`, png: results[`A-${device}`].png[section] },
      { label: `方式B ${section} ${device}`, png: results[`B-${device}`].png[section] },
    ], device, path.join(OUT, `G1-${section}-${device}.jpg`));
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
      // base
      const baseA = await render("A", section, device, baseContent());
      panels.push({ label: `変える前 ${device}`, png: baseA.png });
      for (const mkey of ["A", "B"]) {
        const rBase = mkey === "A" ? baseA : await render("B", section, device, baseContent());
        const rNew = await render(mkey, section, device, makeContent(name));
        const chk = evalScenario(name, section, device, rBase, rNew);
        results[`${name}-${mkey}-${device}`] = chk;
        panels.push({ label: `方式${mkey} ${name} ${device}`, png: rNew.png });
      }
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
      for (const mkey of ["A", "B"]) {
        let edits = op.edits(device);
        if (edits.pcOnly && device !== "pc") edits = {};
        const content = op.scenario ? makeContent(op.scenario) : baseContent();
        const r = await render(mkey, op.section, device, content, edits);
        results[`${name}-${mkey}-${device}`] = await evalOp(name, op, device, r, mkey);
        panels.push({ label: `方式${mkey} ${name} ${device}`, png: r.png });
      }
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
    if (name === "E4") notes.push(`I_added.y=${n.I_added?.y}（方式A=絶対/方式B=区切り線に追従）`);
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

// ---- G2（clone-q65 の FEATURE・PRICE を覆った参照元の実測から組む）----
// clone PC FEATURE = ashiyado PC FEATURE、clone PRICE の3カード = ashiyado ITEMS カードと同じ幾何。
// 参照元（samples/clone-q65 site.json＝masked 実測から生成）の座標に ±2px・文字の段は完全一致で照合。
async function runG2() {
  const t = JSON.parse(fs.readFileSync(path.join(here, "_clone_target.json"), "utf8"));
  const byIdT = Object.fromEntries([...t.feature, ...t.price].map((e) => [e.id, e]));
  const clone = {
    feature: { label: byIdT.el_016.text, heading: byIdT.el_017.text,
      blocks: [
        { id: "g2f1", photo: { asset: "surf" }, heading: byIdT.el_019.text, body: byIdT.el_020.text },
        { id: "g2f2", photo: { asset: "surf" }, heading: byIdT.el_022.text, body: byIdT.el_023.text },
      ] },
    items: { label: byIdT.el_024.text, heading: byIdT.el_025.text,
      cards: [
        { id: "g2c0", photo: { asset: "surf" }, name: byIdT.el_027.text, desc: byIdT.el_028.text, price: byIdT.el_029.text },
        { id: "g2c1", photo: { asset: "surf" }, name: byIdT.el_031.text, desc: byIdT.el_032.text, price: byIdT.el_033.text },
        { id: "g2c2", photo: { asset: "surf" }, name: byIdT.el_035.text, desc: byIdT.el_036.text, price: byIdT.el_037.text },
      ],
      kanmiLabel: byIdT.el_038.text, kanmiTime: "", table: [], pill: "" },
  };
  // 自分の要素 id → 参照元 id（PC）
  const MAP = {
    F_lbl: "el_016", F_h: "el_017", F_rule: "el_surf_003", F_p0: "el_018", F_h0: "el_019", F_b0: "el_020", F_p1: "el_021", F_h1: "el_022", F_b1: "el_023",
    I_lbl: "el_024", I_h: "el_025", I_rule: "el_surf_004", I_divider: "el_surf_005",
    card_photo_g2c0: "el_026", card_name_g2c0: "el_027", card_desc_g2c0: "el_028", card_price_g2c0: "el_029",
    card_photo_g2c1: "el_030", card_name_g2c1: "el_031", card_desc_g2c1: "el_032", card_price_g2c1: "el_033",
    card_photo_g2c2: "el_034", card_name_g2c2: "el_035", card_desc_g2c2: "el_036", card_price_g2c2: "el_037",
  };
  const results = {};
  setLineBreak(false); // clone-q65 は lineBreakRules:false（仮の文字は任意位置で折る）
  for (const mkey of ["A", "B"]) {
    const rf = await render(mkey, "feature", "pc", clone);
    const ri = await render(mkey, "items", "pc", clone);
    const byId = { ...rf.byId, ...ri.byId };
    const fails = [];
    for (const [myId, refId] of Object.entries(MAP)) {
      const el = byId[myId]; const ref = byIdT[refId];
      if (!el) { fails.push(`${myId}: 要素なし`); continue; }
      const rp = ref.pc;
      for (const [f, v] of [["x", rp.x], ["y", rp.y], ["w", rp.w], ["h", rp.h]]) {
        if (v == null) continue;
        if (!near(el[f], v, 2)) fails.push(`${myId}.${f} 参照${v} 実測${el[f].toFixed(1)}`);
      }
    }
    // 価格の上端そろい
    const ys = ["card_price_g2c0", "card_price_g2c1", "card_price_g2c2"].map((i) => byId[i].y);
    if (Math.max(...ys) - Math.min(...ys) > 2) fails.push(`価格そろわず ${ys}`);
    results[mkey] = { pass: fails.length === 0, fails };
    await compose([{ label: `方式${mkey} G2 FEATURE pc`, png: rf.png }, { label: `方式${mkey} G2 PRICE pc`, png: ri.png }], "pc", path.join(OUT, `G2-${mkey}-pc.jpg`));
  }
  setLineBreak(true);
  return results;
}

// ---- G3（3エンジン × 複数幅で 重なり0・はみ出し0・実測ずれ2px以内）----
async function runG3() {
  const { chromium, webkit, firefox } = await import("playwright");
  const engines = { chromium, webkit, firefox };
  const results = {};
  for (const mkey of ["A", "B"]) {
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

// ---- main ----
const mode = process.argv[2] || "all";
const report = {};
if (mode === "g1" || mode === "all") report.g1 = await runG1();
if (mode === "g2" || mode === "all") report.g2 = await runG2();
if (mode === "g3" || mode === "all") report.g3 = await runG3();
if (mode === "scenarios" || mode === "all") report.scenarios = await runScenarios();
if (mode === "ops" || mode === "all") report.ops = await runOps();
await closeBrowsers();
fs.writeFileSync(path.join(here, "_report.json"), JSON.stringify(report, null, 2));

// サマリ出力
console.log("\n===== wa-01 layout-compare 結果 =====");
if (report.g1) {
  console.log("\n[G1]");
  for (const k of Object.keys(report.g1)) console.log(`  ${k}: ${report.g1[k].pass ? "PASS" : "FAIL"} ${report.g1[k].fails.length ? "→ " + report.g1[k].fails.join(" / ") : ""}`);
}
if (report.g2) {
  console.log("\n[G2 clone-q65 PC]");
  for (const k of Object.keys(report.g2)) console.log(`  方式${k}: ${report.g2[k].pass ? "PASS" : "FAIL"} ${report.g2[k].fails.length ? "→ " + report.g2[k].fails.join(" / ") : ""}`);
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
