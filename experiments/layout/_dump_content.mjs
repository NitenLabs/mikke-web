// 使い捨て：本線の resolveSite で FEATURE/ITEMS の確定コンテンツ（文字・カード・表の行）を吐く。
// 本線は一切書き換えない（読むだけ）。結果を lib/content.mjs に手で焼き込む。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSite } from "../../tools/lib/render.mjs";
import { makeRefDate } from "../../tools/lib/catalog.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, "../../samples/ashiyado");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const data = { shop: load("shop.json"), site: load("site.json"), theme: load("theme.json"), assets: load("assets.json") };
const resolved = resolveSite(data, makeRefDate("2026-09-23"));

const runsText = (paragraphs) => (paragraphs || []).map((p) => (p.runs || []).map((r) => r.text ?? "").join("")).join("\n");

function dumpText(id) {
  const el = resolved.elements.get(id);
  if (!el) return `(${id} なし)`;
  return runsText(el.paragraphs);
}
function dumpRep(id) {
  const el = resolved.elements.get(id);
  const rp = el.repeater;
  const items = rp.items.map((it) => {
    const cels = {};
    for (const [cid, ce] of Object.entries(rp.card.elements)) {
      if (ce.type === "text") cels[cid] = runsText(it.cels[cid]?.paragraphs);
    }
    return { id: it.id, hasPhoto: it.hasPhoto, cels };
  });
  return items;
}

const out = {
  feat: {
    label: dumpText("el_feat_lbl"), heading: dumpText("el_feat_h"),
    h1: dumpText("el_feath1"), b1: dumpText("el_featb1"),
    h2: dumpText("el_feath2"), b2: dumpText("el_featb2"),
  },
  items: {
    label: dumpText("el_items_lbl"), heading: dumpText("el_items_h"),
    kanmiLabel: dumpText("el_kanmilbl"), kanmiTime: dumpText("el_kanmitime"),
    pill: dumpText("el_itemsbtn"),
    cards: dumpRep("el_itemcards"),
    table: dumpRep("el_kanmitable"),
  },
};
console.log(JSON.stringify(out, null, 2));
