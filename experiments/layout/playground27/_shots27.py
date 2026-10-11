# 試験台27：報告用スクショ（配置 ▾ の一覧・等間隔の印・スマホの配置）
import asyncio, os
from playwright.async_api import async_playwright
ROOT='/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web'
URL='file://'+ROOT+'/refs/compare/layout/playground27_single.html'
OUT=ROOT+'/refs/compare/layout/playground27/shots'; os.makedirs(OUT, exist_ok=True)
P='window.__playground'
async def prep(ctx):
    pg=await ctx.new_page(); await pg.goto(URL); await pg.wait_for_function(P); await pg.wait_for_timeout(500)
    await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('mikke-playground27');q.onsuccess=q.onerror=q.onblocked=()=>r(1)})")
    await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(700); return pg
async def main():
    async with async_playwright() as p:
        br=await p.chromium.launch()
        async def ev(pg,e): return await pg.evaluate(e)
        async def center(pg,part): return await pg.evaluate("(function(){const n=document.querySelector('[data-el=\""+part+"\"]');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
        async def drag(pg,part,ddx,ddy,alt=False,release=True):
            scale=await ev(pg,f"{P}.getScale()"); c=await center(pg,part)
            await ev(pg,f"{P}.selectOnly('{part}')"); await ev(pg,f"{P}.beginDrag({c['x']},{c['y']})")
            await ev(pg,f"{P}.dragMove({c['x']+ddx*scale},{c['y']+ddy*scale},{'true' if alt else 'false'})"); await pg.wait_for_timeout(50)
            if release: await ev(pg,f"{P}.endDrag()"); await pg.wait_for_timeout(50)
        async def place(pg,pid,tx,ty):
            for _ in range(4):
                cur=(await ev(pg,f"{P}.geometry()"))[pid]
                if abs(cur['x']-tx)<=0.6 and abs(cur['y']-ty)<=0.6: break
                await drag(pg,pid,tx-cur['x'],ty-cur['y'],alt=True)
        # 配置 ▾ の一覧（PC）
        ctx=await br.new_context(viewport={'width':1440,'height':1000}); pg=await prep(ctx)
        await ev(pg,f"{P}.selectOnly('F_h0')"); await pg.wait_for_timeout(100)
        await ev(pg,"document.getElementById('tAlign').click()"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT+'/align_menu_pc.png'); await pg.close(); await ctx.close()
        # 等間隔の印（PC・ドラッグ中）
        ctx=await br.new_context(viewport={'width':1440,'height':1000}); pg=await prep(ctx)
        for pid in ['F_h0','F_b0','F_h1']:
            cur=(await ev(pg,f"{P}.geometry()"))[pid]; await ev(pg,f"{P}.selectOnly('{pid}'); {P}.programResize('{pid}','e',{80-cur['w']},0,false)"); await pg.wait_for_timeout(40)
        for _ in range(2):
            for pid,tx in zip(['F_h0','F_b0','F_h1'],(100,240,650)): await place(pg,pid,tx,540)
        g=await ev(pg,f"{P}.geometry()")
        gap=g['F_b0']['x']-(g['F_h0']['x']+g['F_h0']['w']); target=(g['F_b0']['x']+g['F_b0']['w'])+gap
        await drag(pg,'F_h1',(target+3)-g['F_h1']['x'],0,alt=False,release=False)
        await pg.wait_for_timeout(150); await pg.screenshot(path=OUT+'/equal_spacing_pc.png'); await ev(pg,f"{P}.endDrag()"); await pg.close(); await ctx.close()
        # スマホの長押しの箱に「配置」→ 一覧
        ctx=await br.new_context(viewport={'width':390,'height':800},is_mobile=True,has_touch=True,device_scale_factor=3); pg=await prep(ctx)
        await ev(pg,f"{P}.selectOnly('F_h0')")
        c=await center(pg,'F_h0')
        await ev(pg,"(function(){var n=document.querySelector('[data-el=\"F_h0\"]');n.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:"+str(c['x'])+",clientY:"+str(c['y'])+"}));})()"); await pg.wait_for_timeout(150)
        # 「配置」を押す
        await ev(pg,"(function(){for(const b of document.querySelectorAll('#fmenu button')){if(b.textContent==='配置'){b.click();break;}}})()"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT+'/align_sheet_sp.png'); await pg.close(); await ctx.close()
        await br.close()
    print('shots written to', OUT)
asyncio.run(main())
