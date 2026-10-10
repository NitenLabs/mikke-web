#!/usr/bin/env python3
# 試験台24 の seed/fold/roundTrip と開き直しの素早い確認（scratch）。
import asyncio, json, sys, os
from playwright.async_api import async_playwright

PATH = sys.argv[1]
URL = 'file://' + PATH
P = 'window.__playground'

async def ev(page, expr):
    return await page.evaluate(expr)

async def reopen(page):
    # 開き直し＝同じ URL を読み直す（IndexedDB は維持）。boot が draft を土台に読む。
    await page.reload()
    await page.wait_for_function(P)
    await page.wait_for_timeout(400)

async def rt(page):
    r = await ev(page, f'{P}.roundTrip()')
    bad = []
    for dev in ('pc','sp'):
        d = r[dev]
        if d['maxPos'] > 0.5 or d['maxSize'] > 0.5 or d['onlyA'] or d['onlyB'] or d['attrDiff'] or d['swapDiff']:
            bad.append((dev, d))
    return (not bad), r, bad

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg = await b.new_page()
        await pg.goto(URL)
        await pg.wait_for_function(P)
        # clean IDB for a fresh run
        await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('mikke-playground24');q.onsuccess=q.onerror=q.onblocked=()=>r(1);})")
        await reopen(pg)

        results = []
        def check(name, ok, extra=''):
            results.append((name, ok, extra)); print(('OK  ' if ok else 'NG  ')+name+('  '+str(extra) if extra else ''))

        ok,r,bad = await rt(pg); check('S0 fresh roundTrip', ok, bad)

        # a rich op set via applyOps, roundTrip after each addition (validates fold of move/edit/size/add/tstyle/view)
        ops = [
            {'t':'move','device':'pc','items':[{'id':'F_h0','mode':'M1','dx':12,'dy':8}]},
            {'t':'edit','id':'F_b0','text':'季節の意匠。毎朝炊いた餡を、その日のうちにお出しします。'},
            {'t':'size','device':'pc','id':'F_h0','w':420},
            {'t':'add','id':'add_1','section':'feature','kind':'text','styleName':'featBody','w':600,'wOther':351,'text':'足した文字','anchor':'F_hg','gap':16,'gapOther':16,'x':'@left','placedDevice':'pc','placed':{'device':'pc','anchor':'F_hg','gapY':40,'x':120}},
            {'t':'tstyle','keys':['F_h0'],'device':'pc','color':'#C03030'},
            {'t':'tstyle','keys':['F_h0'],'device':'sp','size':28},
            {'t':'cols','device':'pc','id':'I_cards','n':3},
            {'t':'move','device':'sp','items':[{'id':'F_h1','mode':'M1','dx':4,'dy':6}]},
        ]
        for i in range(1, len(ops)+1):
            sub = json.dumps(ops[:i], ensure_ascii=False)
            await ev(pg, f'{P}.applyOps({sub})'); await pg.wait_for_timeout(40)
            ok,r,bad = await rt(pg); check(f'RT after op#{i} {ops[i-1]["t"]}', ok, bad)

        # draft shape
        d = await ev(pg, f'{P}.draft()')
        check('draft has sections/_pg', bool(d and d.get('sections') and d.get('_pg')), list(d.keys()) if d else None)

        # publish then compare (wait for the 500ms autosave to settle before reading the label)
        await ev(pg, f'{P}.publish({{force:true}})'); await pg.wait_for_timeout(700)
        lbl = await ev(pg, f'{P}.saveState().label')
        check('published label 公開中と同じです', lbl=='公開中と同じです', lbl)

        # edit then undo to equal -> should be 公開中と同じです (canonical)
        await ev(pg, f'{P}.edit("F_h0","XYZ")'); await pg.wait_for_timeout(700)
        lbl2 = await ev(pg, f'{P}.saveState().label'); check('after edit label changed', lbl2=='まだ公開していない変更があります', lbl2)
        await ev(pg, f'{P}.undo()'); await pg.wait_for_timeout(700)
        lbl3 = await ev(pg, f'{P}.saveState().label'); check('after undo back to same', lbl3=='公開中と同じです', lbl3)

        # reopen: ops empty, draft identical, roundTrip clean
        before = await ev(pg, f'JSON.stringify({P}.draft())')
        await pg.wait_for_timeout(600)  # let save settle
        await reopen(pg)
        opslen = await ev(pg, f'{P}.ops().length'); check('reopen ops empty', opslen==0, opslen)
        after = await ev(pg, f'JSON.stringify({P}.draft())'); check('reopen draft identical', before==after, '' if before==after else 'DIFF')
        ok,r,bad = await rt(pg); check('reopen roundTrip', ok, bad)
        # undo right after open does nothing
        pre = await ev(pg, f'JSON.stringify({P}.draft())'); await ev(pg, f'{P}.undo()'); await pg.wait_for_timeout(30)
        post = await ev(pg, f'JSON.stringify({P}.draft())'); check('undo after open is no-op', pre==post)

        await b.close()
        npass = sum(1 for _,o,_ in results if o); ntot=len(results)
        print(f'\n合計 {npass} / {ntot}')
        sys.exit(0 if npass==ntot else 1)

asyncio.run(main())
