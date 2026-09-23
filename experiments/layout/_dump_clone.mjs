import fs from "node:fs";
const site = JSON.parse(fs.readFileSync("samples/clone-q65/site.json","utf8"));
const cw = site.canvas.pcContentWidth, sw = site.canvas.spDesignWidth;
const els = site.elements;
const feat = [], price = [];
for (const [id,e] of Object.entries(els)) {
  if (!["sec_feature","sec_price"].includes(e.section)) continue;
  const txt = (e.paragraphs||[]).map(p=>(p.runs||[]).map(r=>r.text??"").join("")).join("");
  const pcx = e.layout?.pc, spx = e.layout?.sp;
  const rec = { id, type:e.type, section:e.section, role:e.role, style:e.style,
    pc: pcx&&{x:+(pcx.x/100*cw).toFixed(2), y:pcx.y, w:+(pcx.w/100*cw).toFixed(2), h:pcx.h, size:pcx.size},
    sp: spx&&{x:+(spx.x/100*sw).toFixed(2), y:spx.y, w:+(spx.w/100*sw).toFixed(2), h:spx.h, size:spx.size},
    text: txt };
  (e.section==="sec_feature"?feat:price).push(rec);
}
console.log(JSON.stringify({feature:feat, price:price}, null, 1));
