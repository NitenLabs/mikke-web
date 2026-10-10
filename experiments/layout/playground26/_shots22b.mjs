import { chromium } from "playwright"; import fs from "node:fs";
const url="file:///Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground22";
const single="file:///Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground22_single.html";
const OUT="/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground22"; fs.mkdirSync(OUT,{recursive:true});
const P="window.__playground"; const api=(p,e)=>p.evaluate(e);
const full=(p,n)=>p.screenshot({path:OUT+"/"+n,type:"jpeg",quality:80}).catch(()=>{});
(async()=>{const b=await chromium.launch();
// W6: edit + publish -> toast + status 公開中と同じです
{const ctx=await b.newContext({viewport:{width:1440,height:1100}});const p=await ctx.newPage();await p.goto(single);await p.waitForTimeout(500);
 await api(p,`${P}.edit('F_h0','公開テスト')`);await p.waitForTimeout(650); await p.click("#tPublish"); await p.waitForTimeout(300);
 await full(p,"W6.jpg");}
// W24 @500: toolbar stow + その他 open
{const p=await b.newPage({viewport:{width:500,height:900}});await p.goto(single);await p.waitForTimeout(600);
 await p.evaluate(()=>{const t=document.getElementById("tMore");if(t&&t.offsetParent!==null)t.click();});await p.waitForTimeout(200);
 await full(p,"W24_w500.jpg");}
await b.close();console.log("shots:",fs.readdirSync(OUT).filter(f=>/^W(6|24)/.test(f)).join(", "));})();
