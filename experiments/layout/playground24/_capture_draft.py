#!/usr/bin/env python3
# S1 相当の操作を流し、最後の draft() を draft_sample.json に書き出す（報告の見本用）。
import asyncio, json, sys, os
from playwright.async_api import async_playwright
URL = 'file://' + sys.argv[1]; OUT = sys.argv[2]; P = 'window.__playground'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1440, 'height': 1100})
        await pg.goto(URL); await pg.wait_for_function(P); await pg.wait_for_timeout(1000)
        await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('mikke-playground24');q.onsuccess=q.onerror=q.onblocked=()=>r(1)})")
        await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(1000)
        phs = await pg.evaluate(f"{P}.photos()")
        asset = next((x.get('asset') for x in phs if x.get('asset')), None)
        asset2 = next((x.get('asset') for x in phs if x.get('asset') and x.get('asset') != asset), asset)
        ops = [
            {'t':'move','device':'pc','items':[{'id':'F_h0','mode':'M1','dx':12,'dy':8}]},
            {'t':'move','device':'pc','items':[{'id':'F_b0','mode':'M2','anchor':'F_p0','gapY':40,'x':120}]},
            {'t':'size','device':'pc','id':'F_h0','w':420,'dx':-20},
            {'t':'cols','device':'pc','id':'I_cards','n':3},
            {'t':'view','device':'pc','id':'F_p0','x':0.4,'y':0.6,'zoom':2},
            {'t':'replace','id':'F_p1','asset':asset2},
            {'t':'bright','id':'F_p0','v':20},
            {'t':'edit','id':'F_b0','text':'季節の意匠。毎朝炊いた餡を、その日のうちにお出しします。'},
            {'t':'edit','id':'F_b1','runs':[{'text':'こだわり'},{'text':'の餡','bold':True,'color':'#C03030','scale':1.4,'font':'accent','link':{'kind':'tel'}}]},
            {'t':'tstyle','keys':['F_h0'],'device':'pc','weight':700,'color':'#204080','font':'heading','size':40},
            {'t':'tstyle','keys':['F_h0'],'device':'sp','size':28},
            {'t':'add','id':'add_90','section':'feature','kind':'text','styleName':'featBody','w':600,'wOther':351,'text':'貼り付けた文字','anchor':'F_b0','gap':16,'gapOther':16,'x':'@left','placedDevice':'pc','placed':{'device':'pc','anchor':'F_b0','gapY':16,'x':120}},
            {'t':'add','id':'addp_91','section':'items','kind':'photo','asset':asset,'w':300,'wOther':351,'h':240,'hOther':280,'text':'','anchor':'I_hg','gap':16,'gapOther':16,'x':'@left','placedDevice':'pc','placed':{'device':'pc','anchor':'I_hg','gapY':16,'x':60}},
        ]
        await pg.evaluate(f"{P}.applyOps({json.dumps(ops, ensure_ascii=False)})"); await pg.wait_for_timeout(100)
        await pg.evaluate(f"{P}.sectionDuplicate('feature')"); await pg.wait_for_timeout(200)
        d = await pg.evaluate(f"{P}.draft()")
        open(OUT, 'w').write(json.dumps(d, ensure_ascii=False, indent=2))
        print('wrote', OUT, len(json.dumps(d)), 'bytes json'); await b.close()
asyncio.run(main())
