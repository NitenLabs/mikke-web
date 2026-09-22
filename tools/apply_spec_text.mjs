#!/usr/bin/env node
// 付録 A の文字の段（TEXT / CELTEXT）を site.json の各要素に反映する（一度きりの整備）。
// テーマの役割ごとの行送りは SPEC の文脈別の値と食い違うため、要素ごとに
// font / weight / lineHeight / letterSpacing を明示して SPEC に一致させる。
import fs from "node:fs";
import * as A from "./lib/appendixA.mjs";

const p = "samples/ashiyado/site.json";
const site = JSON.parse(fs.readFileSync(p, "utf8"));
const famRef = (f) => (f === A.FAMILIES.MIN ? "font:heading" : "font:body");
const r4 = (n) => Math.round(n * 10000) / 10000;
let n = 0;

function setStyle(styleHost, fam, size, lh, weight, ls) {
  const s = (styleHost.style ??= {});
  s.font = famRef(fam);
  s.weight = weight;
  s.lineHeight = r4(lh / size);
  s.letterSpacing = ls;
  n++;
}

for (const c of A.TEXT) {
  const [pcSize, pcLh] = c.pc;
  for (const tg of c.targets) {
    const id = typeof tg === "string" ? tg : tg.id;
    const el = site.elements[id];
    if (!el) { console.log("missing el", id); continue; }
    setStyle(el, c.fam, pcSize, pcLh, c.w, c.ls);
  }
}
for (const c of A.CELTEXT) {
  const rep = site.elements[c.rep];
  const cel = rep?.card?.elements?.[c.cel];
  if (!cel) { console.log("missing cel", c.rep, c.cel); continue; }
  setStyle(cel, c.fam, c.pc[0], c.pc[1], c.w, c.ls);
}
fs.writeFileSync(p, JSON.stringify(site, null, 2) + "\n");
console.log("updated", n, "text styles");
