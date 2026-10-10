import { chromium } from "playwright"; import fs from "node:fs";
const url="file:///Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground22_single.html";
const OUT="/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground22"; fs.mkdirSync(OUT,{recursive:true});
const P="window.__playground"; const api=(p,e)=>p.evaluate(e);
const load=async(p)=>{await p.goto(url);for(let i=0;i<40;i++){if(await p.evaluate(()=>document.fonts.status==="loaded"))break;await p.waitForTimeout(100);}};
const full=(p,n)=>p.screenshot({path:OUT+"/"+n,type:"jpeg",quality:80}).catch(()=>{});
(async()=>{const b=await chromium.launch();
// W20: 仮の上下セクション
{const p=await b.newPage({viewport:{width:1440,height:1100}});await load(p);
 await api(p,`${P}.reset()`);await api(p,`${P}.setDevice('pc')`);await api(p,`${P}.setFixedSections(true)`);await p.waitForTimeout(250);
 await full(p,"W20.jpg");await p.close();}
// W22: 写真を左619で重ね、右クリックで最前面▸を開いた所（最背面へ移動の後）
{const p=await b.newPage({viewport:{width:1440,height:1100}});await load(p);
 await api(p,`${P}.reset()`);await api(p,`${P}.setDevice('pc')`);await p.waitForTimeout(150);
 const sc=await p.evaluate(()=>{const s=document.querySelector("#host_feature #sec");return s.getBoundingClientRect().width/s.offsetWidth;});
 const c=await p.evaluate(()=>{const el=document.querySelector('[data-el="F_p0"]');el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
 await p.keyboard.down("Alt");await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x-619*sc/2,c.y,{steps:4});await p.mouse.move(c.x-619*sc,c.y,{steps:4});await p.mouse.up();await p.keyboard.up("Alt");await p.waitForTimeout(200);
 await p.mouse.click(c.x-619*sc+20,c.y,{button:"right"});await p.waitForTimeout(150);
 await p.evaluate(()=>{const b=[...document.querySelectorAll("#fmenu button[data-zsub]")].find(x=>x.getAttribute("data-zsub")==="最前面へ移動");if(b){b.closest(".zrow").classList.add("open");}});await p.waitForTimeout(100);
 await full(p,"W22.jpg");await p.close();}
// W24 幅500: その他 を開く
{const p=await b.newPage({viewport:{width:500,height:900}});await load(p);
 await api(p,`${P}.setDevice('pc')`);await p.waitForTimeout(200);
 await p.evaluate(()=>{const t=document.getElementById("tMore");if(t&&t.style.display!=="none")t.click();});await p.waitForTimeout(200);
 await full(p,"W24_w500.jpg");await p.close();}
await b.close();console.log("shots:",fs.readdirSync(OUT).filter(f=>/W2/.test(f)).join(", "));})();
