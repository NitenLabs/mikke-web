# verify_extra_publish.py v1（Claude.ai・2026-10-07）
# 試験台22 の「作業票の試験の外」の確認。v1＝22a（§7 動かせないセクション・§8 最前面／最背面・X28）
# 使い方：python3 verify_extra_publish.py /path/to/playground22_single.html
# V1〜：作業票の試験の外。-- は値を出すだけ（合否なし）
import asyncio, json, sys
from playwright.async_api import async_playwright
URL='file://'+sys.argv[1]; P='window.__playground'
R=[]
def rec(k,ok,msg): R.append((k,ok,msg)); print(('OK ' if ok is True else ('NG ' if ok is False else '-- '))+k+' | '+msg, flush=True)
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch()
    async def fresh(w=1440,h=1100,dev='pc',fixed=False):
        ctx=await br.new_context(viewport={'width':w,'height':h}); pg=await ctx.new_page()
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        if dev!='pc': await pg.evaluate(f"{P}.setDevice('{dev}')"); await pg.wait_for_timeout(400)
        if fixed: await pg.evaluate(f"{P}.setFixedSections(true)"); await pg.wait_for_timeout(400)
        return pg
    async def G(pg): return await pg.evaluate(f"{P}.geometry()")
    async def bb(pg,part): return await pg.evaluate(f"(()=>{{const e=document.querySelector('[data-el=\"{part}\"]');if(!e)return null;const r=e.getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height}}}})()")
    async def scale(pg,part='F_h0'):
        g=(await G(pg))[part]; r=await bb(pg,part); return r['w']/g['w']
    async def drag(pg,part,dx,dy):
        el=await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(100)
        r=await bb(pg,part); s=await scale(pg,part); x=r['x']+min(20,r['w']/2); y=r['y']+r['h']/2
        await pg.mouse.click(x,y); await pg.wait_for_timeout(350); await pg.keyboard.down('Alt')
        await pg.mouse.move(x,y); await pg.mouse.down()
        for i in range(1,11): await pg.mouse.move(x+dx*s*i/10,y+dy*s*i/10); await pg.wait_for_timeout(10)
        await pg.mouse.up(); await pg.wait_for_timeout(350); await pg.keyboard.up('Alt')
    async def menu_of(pg,part,dx=30,dy=30):
        el=await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(100)
        r=await bb(pg,part); await pg.mouse.click(r['x']+dx,r['y']+dy,button='right'); await pg.wait_for_timeout(400)
        return await pg.evaluate("[...document.querySelectorAll('#fmenu button')].filter(b=>b.offsetParent).map(b=>[b.textContent.trim(),b.disabled])")
    async def sec_menu(pg,idx):
        # idx 番目の .sec-wrap（間のセクション）の左上の余白を右クリック
        await pg.evaluate(f"document.querySelectorAll('#sectionwrap .sec-wrap')[{idx}].scrollIntoView({{block:'start'}})"); await pg.wait_for_timeout(200)
        r=await pg.evaluate(f"document.querySelectorAll('#sectionwrap .sec-wrap')[{idx}].getBoundingClientRect().toJSON()")
        await pg.mouse.click(r['x']+40,r['y']+60,button='right'); await pg.wait_for_timeout(400)
        return await pg.evaluate("[...document.querySelectorAll('#fmenu [data-sec-menu]')].filter(b=>b.offsetParent).map(b=>b.textContent.trim())")
    async def close_menu(pg):
        await pg.keyboard.press('Escape'); await pg.evaluate("document.getElementById('fmenu').classList.remove('on')"); await pg.wait_for_timeout(150)

    # V1 仮のセクションの大きさ（PC・スマホ）と、ふだんは出ないこと
    for dev,ht,hb in (('pc',480,240),('sp',320,200)):
        pg=await fresh(dev=dev); none=await pg.evaluate("!document.getElementById('fixedTop')&&!document.getElementById('fixedBottom')")
        await pg.evaluate(f"{P}.setFixedSections(true)"); await pg.wait_for_timeout(400)
        s=await scale(pg); t=await pg.evaluate("document.getElementById('fixedTop').getBoundingClientRect().toJSON()"); b=await pg.evaluate("document.getElementById('fixedBottom').getBoundingClientRect().toJSON()")
        first=await pg.evaluate("document.querySelector('#sectionwrap').firstElementChild.id"); last=await pg.evaluate("document.querySelector('#sectionwrap').lastElementChild.id")
        rec(f'V1 {dev} 仮のセクション',none and abs(t['height']/s-ht)<=1 and abs(b['height']/s-hb)<=1 and first=='fixedTop' and last=='fixedBottom',
            f"ふだん無し={none} 上 {t['height']/s:.0f} 下 {b['height']/s:.0f} 先頭={first} 末尾={last}")
        await pg.context.close()

    # V2 仮のセクションを出しているとき：右クリックの「上へ・下へ」、品を上へ動かした後
    pg=await fresh(fixed=True)
    nsec=await pg.evaluate("document.querySelectorAll('#sectionwrap .sec-wrap').length")
    mf0=await sec_menu(pg,0); await close_menu(pg); mi0=await sec_menu(pg,1); await close_menu(pg)
    tb=await pg.evaluate("(()=>{const r=document.getElementById('fixedTop').getBoundingClientRect();return r.toJSON()})()")
    await pg.evaluate("document.getElementById('fixedTop').scrollIntoView({block:'start'})"); await pg.wait_for_timeout(200)
    tb=await pg.evaluate("document.getElementById('fixedTop').getBoundingClientRect().toJSON()")
    await pg.mouse.click(tb['x']+40,tb['y']+40,button='right'); await pg.wait_for_timeout(400)
    mt=await pg.evaluate("document.getElementById('fmenu').classList.contains('on')?[...document.querySelectorAll('#fmenu button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim()):[]"); await close_menu(pg)
    await sec_menu(pg,1); await pg.locator('#fmenu [data-sec-menu="上へ"]').click(); await pg.wait_for_timeout(500)
    mi=await sec_menu(pg,0); await close_menu(pg); mf=await sec_menu(pg,1); await close_menu(pg)
    first=await pg.evaluate("document.querySelector('#sectionwrap').firstElementChild.id"); last=await pg.evaluate("document.querySelector('#sectionwrap').lastElementChild.id")
    pl=await pg.evaluate("[...document.querySelectorAll('.sec-add-zone')].map(z=>{const r=z.getBoundingClientRect();return Math.round(r.y+scrollY)})")
    ft=await pg.evaluate("document.getElementById('fixedTop').getBoundingClientRect().bottom+scrollY"); fb=await pg.evaluate("document.getElementById('fixedBottom').getBoundingClientRect().top+scrollY")
    rec('V2 仮のセクションと右クリック',nsec==2 and '上へ' not in mf0 and '下へ' in mf0 and '下へ' not in mi0 and not mt and '上へ' not in mi and '下へ' in mi and '下へ' not in mf and first=='fixedTop' and last=='fixedBottom' and len(pl)==3 and all(ft-5<=y<=fb+5 for y in pl),
        f"初め 特集={mf0} 品={mi0} 一番上={mt} / 品を上へ後 品={mi} 特集={mf} / 先頭={first} 末尾={last} ＋の位置={pl} 一番上の下端={ft:.0f} 一番下の上端={fb:.0f}")
    await pg.context.close()

    # V3 仮のセクションの上に部品を落とす（特集の見出しを一番上の箱の真ん中へ）→ 値だけ
    pg=await fresh(fixed=True); g=await G(pg)
    t=await pg.evaluate("document.getElementById('fixedTop').getBoundingClientRect().toJSON()")
    el=await pg.query_selector('[data-el="F_h0"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_h0')
    t=await pg.evaluate("document.getElementById('fixedTop').getBoundingClientRect().toJSON()")
    await pg.mouse.click(r['x']+20,r['y']+r['h']/2); await pg.wait_for_timeout(300); await pg.keyboard.down('Alt')
    await pg.mouse.move(r['x']+20,r['y']+r['h']/2); await pg.mouse.down()
    ty=t['y']+t['height']/2; 
    for i in range(1,16): await pg.mouse.move(r['x']+20,r['y']+r['h']/2+(ty-(r['y']+r['h']/2))*i/15); await pg.wait_for_timeout(15)
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(400)
    r2=await bb(pg,'F_h0'); t2=await pg.evaluate("document.getElementById('fixedTop').getBoundingClientRect().toJSON()")
    inside=r2['y']<t2['y']+t2['height']
    rec('V3 見出しを一番上の仮の箱の上へ落とす',None,f"見出しの上端（画面）{r2['y']:.0f} 仮の箱 {t2['y']:.0f}〜{t2['y']+t2['height']:.0f} 箱に入った={inside} 記録={json.dumps((await pg.evaluate(f'{P}.ops()'))[-1:],ensure_ascii=False)[:200]}")
    await pg.screenshot(path='V3.png'); await pg.context.close()

    # V4 最前面／最背面：重なり3つ（写真・見出し・本文）で4つの操作と戻す
    pg=await fresh(); await drag(pg,'F_p0',-619,0)
    z0=await pg.evaluate(f"{P}.zOrder()")
    seq=[]
    for top,item in (('最背面へ移動','最背面へ移動'),('最前面へ移動','前面へ移動'),('最前面へ移動','最前面へ移動'),('最背面へ移動','背面へ移動')):
        await menu_of(pg,'F_p0',300,300)
        await pg.locator(f'#fmenu [data-zsub="{top}"]').hover(); await pg.wait_for_timeout(250)
        await pg.locator(f'#fmenu [data-zitem="{item}"]').first.click(); await pg.wait_for_timeout(400)
        await pg.mouse.click(5,1050); await pg.wait_for_timeout(200)
        seq.append((item,await pg.evaluate(f"{P}.zOrder()")))
    want=[['F_p0','F_h0','F_b0'],['F_h0','F_p0','F_b0'],['F_h0','F_b0','F_p0'],['F_h0','F_p0','F_b0']]
    got=[[x for x in s if x in ('F_p0','F_h0','F_b0')] for _,s in seq]
    for _ in range(4): await pg.click('#tUndo'); await pg.wait_for_timeout(250)
    z1=await pg.evaluate(f"{P}.zOrder()")
    rec('V4 pc 最背面→前面→最前面→背面、戻す4回',got==want and [x for x in z1 if x in ('F_p0','F_h0','F_b0')]==[x for x in z0 if x in ('F_p0','F_h0','F_b0')],f"初め {z0} 順に {got} 戻した後 {z1}")
    await pg.context.close()

    # V5 重なり順は端末ごと：PC で最背面にしてもスマホの順は変わらない
    pg=await fresh(); await drag(pg,'F_p0',-619,0); await menu_of(pg,'F_p0',300,300)
    await pg.locator('#fmenu [data-zsub="最背面へ移動"]').hover(); await pg.wait_for_timeout(250)
    await pg.locator('#fmenu [data-zitem="最背面へ移動"]').first.click(); await pg.wait_for_timeout(400)
    zpc=await pg.evaluate(f"{P}.zOrder()"); await pg.evaluate(f"{P}.setDevice('sp')"); await pg.wait_for_timeout(400)
    zsp=await pg.evaluate(f"{P}.zOrder()"); o=await pg.evaluate(f"{P}.ops()")
    rec('V5 重なり順は端末ごと',all(op.get('device')=='pc' for op in o if op.get('t')=='zorder'),f"PC {zpc} スマホ {zsp} 記録 {json.dumps([op for op in o if op.get('t')=='zorder'],ensure_ascii=False)[:200]}")
    await pg.context.close()

    # V6 重なりがない／品の1件の中では
    pg=await fresh(); m=await menu_of(pg,'F_p0')
    zr=[x for x in m if '面へ移動' in x[0]]
    await pg.mouse.click(5,1050); await pg.wait_for_timeout(200)
    el=await pg.query_selector('[data-el="card_photo_c_warabi"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'card_photo_c_warabi')
    await pg.mouse.click(r['x']+40,r['y']+40); await pg.wait_for_timeout(500); await pg.mouse.click(r['x']+40,r['y']+40); await pg.wait_for_timeout(500)
    await pg.mouse.click(r['x']+40,r['y']+40,button='right'); await pg.wait_for_timeout(400)
    mc=await pg.evaluate("[...document.querySelectorAll('#fmenu button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim())")
    rec('V6 重なりなし＝灰色／品の1件の中＝出さない',len(zr)==2 and all(d for _,d in zr) and not any('面へ' in x for x in mc),f"写真 {zr} 品の写真 {mc}")
    await pg.context.close()

    # V7 X28：選んでいる物ごとに（何も・写真・文字の書き換え中）、幅 650〜360 で組が分かれない
    bad=[]; seen=[]
    for W in (650,560,500,460,420,380,360):
        for mode in ('none','photo','edit'):
            pg=await fresh(w=W,h=900)
            if mode=='photo':
                r=await bb(pg,'F_p0'); await pg.mouse.click(r['x']+20,r['y']+20); await pg.wait_for_timeout(400)
            if mode=='edit':
                r=await bb(pg,'F_b0'); await pg.mouse.dblclick(r['x']+20,r['y']+8); await pg.wait_for_timeout(500)
            vis=await pg.evaluate("[...document.querySelectorAll('#toolbar button')].filter(b=>b.offsetParent&&b.getBoundingClientRect().width>0).map(b=>b.textContent.trim())")
            for a,b in (('PC','スマホ'),('テキスト','写真')):
                if (a in vis)!=(b in vis): bad.append((W,mode,a,b,vis))
            for k in ('戻す','やり直す'):
                if k not in vis: bad.append((W,mode,k,'なし',vis))
            seen.append((W,mode,len(vis)))
            await pg.context.close()
    rec('V7 X28 組でしまう（幅×選び方）',not bad,f"分かれた所 {bad[:4]} / 並びのボタン数 {seen}")

    print(f"\n合計 {sum(1 for r in R if r[1] is True)} / {sum(1 for r in R if r[1] is not None)}（-- は値だけ）")
    await br.close()
asyncio.run(main())
