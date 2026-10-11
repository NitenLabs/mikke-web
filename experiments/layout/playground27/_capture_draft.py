#!/usr/bin/env python3
# S22 相当の操作を流し、最後の draft() を draft_sample.json に書き出す（報告の見本用）。
import asyncio, json, sys, os
from playwright.async_api import async_playwright
URL = 'file://' + sys.argv[1]; OUT = sys.argv[2]; P = 'window.__playground'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={'width': 1440, 'height': 1100})
        await pg.goto(URL); await pg.wait_for_function(P); await pg.wait_for_timeout(1000)
        await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('mikke-playground24');q.onsuccess=q.onerror=q.onblocked=()=>r(1)})")
        await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(1000)
        # ちょっと手直し（元の特集）＋ S22（特集を複製 → 複製側で 塊の外へ移動・文字貼り付け・並び替え）
        await pg.evaluate(f"{P}.applyOps({json.dumps([{'t':'edit','id':'F_b0','text':'季節の意匠。毎朝炊いた餡を、その日のうちにお出しします。'},{'t':'tstyle','keys':['F_h0'],'device':'pc','weight':700,'color':'#204080','font':'heading','size':40}], ensure_ascii=False)})"); await pg.wait_for_timeout(100)
        await pg.evaluate(f"{P}.sectionDuplicate('feature')"); await pg.wait_for_timeout(200)
        secs = [s['id'] for s in await pg.evaluate(f"{P}.sectionList()")]; dup = next((s for s in secs if s not in ('feature', 'items')), None)
        ops0 = await pg.evaluate(f"{P}.ops()")
        extra = [
            {'t':'move','device':'pc','items':[{'id':dup+'__F_b0','mode':'M2','anchor':'F_p0','gapY':40,'x':120}]},
            {'t':'add','id':'add_1','section':dup,'kind':'text','styleName':'featBody','w':600,'wOther':351,'text':'貼り付け','anchor':'F_b0','gap':16,'gapOther':16,'x':'@left','placedDevice':'pc','placed':{'device':'pc','anchor':'F_b0','gapY':16,'x':100}},
            {'t':'reorder','device':'pc','key':dup+'__Ftg1','id':dup+'__F_h1','order':[dup+'__F_b1',dup+'__F_h1']},
        ]
        await pg.evaluate(f"{P}.applyOps({json.dumps(ops0 + extra, ensure_ascii=False)})"); await pg.wait_for_timeout(100)
        d = await pg.evaluate(f"{P}.draft()")
        open(OUT, 'w').write(json.dumps(d, ensure_ascii=False, indent=2))
        print('wrote', OUT, len(json.dumps(d)), 'bytes json'); await b.close()
asyncio.run(main())
