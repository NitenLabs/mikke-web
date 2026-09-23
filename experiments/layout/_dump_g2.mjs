// 使い捨て：覆った参照元（refs/studio-Q65qmmvqVR/masked/elements-{pc,sp}.json）から
// FEATURE・PRICE のセクション相対の実測を取り出し、実験の要素id にマッピングして _g2_target.json を作る。
// clone-q65 site.json は SP が clone-gen の乱れた成果物なので使わず、生の masked を正とする。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(here, "../..");
const pc = JSON.parse(fs.readFileSync(path.join(R, "refs/studio-Q65qmmvqVR/masked/elements-pc.json"), "utf8"));
const sp = JSON.parse(fs.readFileSync(path.join(R, "refs/studio-Q65qmmvqVR/masked/elements-sp.json"), "utf8"));
const tops = JSON.parse(fs.readFileSync(path.join(R, "samples/clone-q65/_refsections.json"), "utf8"));

function sectionEls(doc, dev, sec) {
  const t = tops[dev].tops, a = t[sec], b = sec === "sec_feature" ? t.sec_price : t.sec_faqs;
  const els = doc.elements.filter((e) => e.y >= a - 2 && e.y < b - 2).map((e) => ({ ...e, ry: e.y - a })).sort((x, y) => x.ry - y.ry);
  const surfs = (doc.surfaces || []).filter((e) => e.y >= a - 2 && e.y < b - 2).map((e) => ({ ...e, ry: e.y - a })).sort((x, y) => x.ry - y.ry);
  return { els, surfs };
}
const box = (e) => [round(e.x), round(e.ry), round(e.w), round(e.h)];
const round = (n) => Math.round(n * 100) / 100;

function mapFeature(dev) {
  const { els, surfs } = sectionEls(dev === "pc" ? pc : sp, dev, "sec_feature");
  const ids = ["F_lbl", "F_h", "F_p0", "F_h0", "F_b0", "F_p1", "F_h1", "F_b1"];
  const out = {};
  els.forEach((e, i) => { if (ids[i]) out[ids[i]] = box(e); });
  const rule = surfs.find((s) => Math.abs(s.w - 24) < 3 && s.h <= 3);
  if (rule) out.F_rule = box(rule);
  return out;
}
const byYX = (a, b) => (a.ry - b.ry) || (a.x - b.x);
const hasYen = (e) => /[¥￥]/.test(e.text || "");

// 役割で分類してカード0/1/2に割り当てる（PCは役割ごとに同じy＝x順、SPは縦積み＝y順。(y,x)ソートで両対応）
function priceCells(dev) {
  const { els, surfs } = sectionEls(dev === "pc" ? pc : sp, dev, "sec_price");
  const kanmi = els.find((e) => (e.text || "").startsWith("("));
  const kanmiY = kanmi ? kanmi.ry : Infinity;
  const before = els.filter((e) => e.ry < kanmiY - 1);
  const photos = before.filter((e) => e.tag === "img").sort(byYX);
  const names = before.filter((e) => e.tag === "h3" && (e.size >= 16 && e.size <= 16.5)).sort(byYX);
  const descs = before.filter((e) => e.tag === "p" && !hasYen(e) && e.size <= 14.5 && !(e.text || "").startsWith("n")).sort(byYX);
  const prices = before.filter((e) => e.tag === "p" && hasYen(e)).sort(byYX);
  return { els, surfs, kanmi, photos, names, descs, prices };
}
function mapPrice(dev) {
  const { surfs, kanmi, photos, names, descs, prices } = priceCells(dev);
  const { els } = sectionEls(dev === "pc" ? pc : sp, dev, "sec_price");
  const out = { I_lbl: box(els[0]), I_h: box(els[1]) };
  ["g2c0", "g2c1", "g2c2"].forEach((cid, k) => {
    if (photos[k]) out[`card_photo_${cid}`] = box(photos[k]);
    if (names[k]) out[`card_name_${cid}`] = box(names[k]);
    if (descs[k]) out[`card_desc_${cid}`] = box(descs[k]);
    if (prices[k]) out[`card_price_${cid}`] = box(prices[k]);
  });
  if (kanmi) out.I_kanmi = box(kanmi);
  const rule = surfs.find((s) => Math.abs(s.w - 24) < 3 && s.h <= 3);
  if (rule) out.I_rule = box(rule);
  const lines = surfs.filter((s) => s.h <= 2 && s.w > 100).sort((a, b) => a.ry - b.ry);
  if (lines.length) out.I_divider = box(lines[0]);
  return out;
}

// テキスト（プレースホルダ）は device 非依存。pc の役割分類から取る。
const featPc = sectionEls(pc, "pc", "sec_feature").els;
const pcCells = priceCells("pc");
const content = {
  feature: {
    label: featPc[0].text, heading: featPc[1].text,
    blocks: [
      { id: "g2f1", photo: { asset: "surf" }, heading: featPc[3].text, body: featPc[4].text },
      { id: "g2f2", photo: { asset: "surf" }, heading: featPc[6].text, body: featPc[7].text },
    ],
  },
  items: {
    label: pcCells.els[0].text, heading: pcCells.els[1].text,
    cards: [0, 1, 2].map((k) => ({ id: `g2c${k}`, photo: { asset: "surf" }, name: pcCells.names[k].text, desc: pcCells.descs[k].text, price: pcCells.prices[k].text })),
    kanmiLabel: pcCells.kanmi ? pcCells.kanmi.text : "（甘味処）",
    kanmiTime: "", table: [], pill: "",
  },
};
const targets = {};
for (const [id, b] of Object.entries(mapFeature("pc"))) (targets[id] ??= {}).pc = b;
for (const [id, b] of Object.entries(mapFeature("sp"))) (targets[id] ??= {}).sp = b;
for (const [id, b] of Object.entries(mapPrice("pc"))) (targets[id] ??= {}).pc = b;
for (const [id, b] of Object.entries(mapPrice("sp"))) (targets[id] ??= {}).sp = b;

fs.writeFileSync(path.join(here, "_g2_target.json"), JSON.stringify({ content, targets }, null, 1));
console.log("wrote _g2_target.json");
console.log("targets:", Object.keys(targets).length, "／ 例 F_p0:", JSON.stringify(targets.F_p0), " card0_price:", JSON.stringify(targets.card_price_g2c0));
