import { chromium } from "playwright";
import fs from "node:fs";
const url = "file:///Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground20b_single.html";
const OUT = "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground20b";
fs.mkdirSync(OUT, { recursive: true });
const P = "window.__playground";
const api = (p,e)=>p.evaluate(e);
const load = async (p)=>{ await p.goto(url); for(let i=0;i<40;i++){if(await p.evaluate(()=>document.fonts.status==="loaded"))break; await p.waitForTimeout(100);} };
async function center(p, id){ return p.evaluate((id)=>{ for(const h of document.querySelectorAll("#sectionwrap .host")){ const el=h.querySelector('[data-el="'+id+'"]'); if(el){ el.scrollIntoView({block:"center"}); const r=el.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),top:r.top,h:r.height}; } } return null; },id); }
const shot=(p,n)=>p.locator("#stage").screenshot({path:OUT+"/"+n,type:"jpeg",quality:82}).catch(()=>{});
const full=(p,n)=>p.screenshot({path:OUT+"/"+n,type:"jpeg",quality:82}).catch(()=>{});
(async()=>{
  const b=await chromium.launch();
  // L25: PC 区切り線を品の並びの上端-20へドラッグ → 一番上に並び替え
  { const p=await b.newPage({viewport:{width:1440,height:1100}}); await load(p);
    await api(p,`${P}.reset()`); await api(p,`${P}.setDevice('pc')`); await p.waitForTimeout(200);
    const g=await api(p,`${P}.geometry()`); const sc=await p.evaluate(()=>{const el=document.querySelector("#host_items #sec");return el?el.getBoundingClientRect().width/window.__playground.geometry().__?1:1:1;});
    const d=await center(p,"I_divider"); const cardsTop=await p.evaluate(()=>{const el=document.querySelector('#host_items [data-el="I_cards"]');const r=el.getBoundingClientRect();return r.top;});
    const scale=await p.evaluate(()=>{const el=document.querySelector("#host_items #sec");return el.getBoundingClientRect().width/window.__playground.geometry().I_cards.w*window.__playground.geometry().I_cards.w/ (window.__playground.geometry().I_cards.w);});
    // 目標 y（画面px）＝ cards上端 − 20*scale。scale はおよそ host幅/設計幅
    const s2=await p.evaluate(()=>{const el=document.querySelector("#host_items #sec");return el.getBoundingClientRect().width/ (document.querySelector("#host_items #sec").offsetWidth||el.getBoundingClientRect().width);});
    const sch=await p.evaluate(()=>{const el=document.querySelector("#host_items #sec");const g=window.__playground.geometry();return el.getBoundingClientRect().width/ g.I_cards.w * g.I_cards.w;});
    const scl=await p.evaluate(()=>{const el=document.querySelector("#host_items");const g=window.__playground.geometry();return 1;});
    const realScale=await p.evaluate(()=>{const host=document.getElementById("host_items");const sec=host.querySelector("#sec");return sec.getBoundingClientRect().width/sec.offsetWidth;});
    const ty=cardsTop - 20*realScale;
    await p.mouse.move(d.x,d.y); await p.mouse.down(); await p.mouse.move(d.x,(d.y+ty)/2,{steps:4}); await p.mouse.move(d.x,ty,{steps:4}); await p.mouse.up(); await p.waitForTimeout(300);
    await shot(p,"L25.jpg"); await p.close(); }
  // L28: 窓幅500 本文書き換え中に その他▾ → PC 行が読める
  { const p=await b.newPage({viewport:{width:500,height:900}}); await load(p);
    await api(p,`${P}.reset()`); await api(p,`${P}.setDevice('pc')`); await p.waitForTimeout(200);
    await api(p,`${P}.select(['F_b0'])`); await p.waitForTimeout(100);
    await p.evaluate(()=>{const b=[...document.querySelectorAll("#toolbar button")].find(x=>x.id==="tMore"); if(b) b.click();}); await p.waitForTimeout(200);
    await full(p,"L28_w500.jpg"); await p.close(); }
  // L29: PC 表を最小幅まで（右辺つまみ左へ）
  { const p=await b.newPage({viewport:{width:1440,height:1100}}); await load(p);
    await api(p,`${P}.reset()`); await api(p,`${P}.setDevice('pc')`); await p.waitForTimeout(200);
    await api(p,`${P}.select(['I_table'])`); await api(p,`${P}.programResize('I_table','e',-2000,0,true)`); await p.waitForTimeout(250);
    await shot(p,"L29.jpg"); await p.close(); }
  // L32: 列の見本（横並び）。品の並び幅408で4列が灰色
  { const p=await b.newPage({viewport:{width:1440,height:1100}}); await load(p);
    await api(p,`${P}.reset()`); await api(p,`${P}.setDevice('pc')`); await p.waitForTimeout(200);
    await api(p,`${P}.select(['I_cards'])`); await api(p,`${P}.programResize('I_cards','e',-918,0,true)`); await p.waitForTimeout(150);
    await api(p,`${P}.select(['I_cards'])`); await p.waitForTimeout(100);
    await p.evaluate(()=>document.getElementById("tCols").click()); await p.waitForTimeout(200);
    await full(p,"L32.jpg"); await p.close(); }
  await b.close();
  console.log("shots:", fs.readdirSync(OUT).join(", "));
})();
