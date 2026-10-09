# verify_extra_publish.py v3（Claude.ai・2026-10-09）
# 試験台22 の「作業票の試験の外」の確認。v1＝22a（§7 動かせないセクション・§8 最前面／最背面・X28）
# v2＝22b・22c（V8〜V19：§2 保存・§3 状態と公開・§4 公開の前の確認・§5 プレビュー）
# v3＝22d（V20〜V26：§6 履歴から前の版に戻す）
# 使い方：python3 verify_extra_publish.py /path/to/playground22_single.html
# V1〜：作業票の試験の外。-- は値を出すだけ（合否なし）
import asyncio, json, sys, re
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


    # ---------- v2：22b・22c ----------
    async def st(pg): return await pg.evaluate(f"{P}.saveState()")
    async def label(pg): return await pg.evaluate("(()=>{const e=document.getElementById('saveStatus');return e?[e.textContent.trim(),e.classList.contains('warn')]:null})()")
    async def pubdis(pg): return await pg.evaluate("document.getElementById('tPublish').disabled")
    async def edit_append(pg,part,text):
        el=await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(100)
        r=await bb(pg,part); await pg.mouse.dblclick(r['x']+r['w']-8,r['y']+r['h']-6); await pg.wait_for_timeout(400)
        await pg.keyboard.press('Control+End'); await pg.keyboard.type(text); await pg.wait_for_timeout(200)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); await pg.mouse.click(5,1050); await pg.wait_for_timeout(400)
    async def maxdiff(a,b):
        ks=[k for k in a if k in b]; miss=[k for k in a if k not in b]+[k for k in b if k not in a]
        return (max([abs(a[k][q]-b[k][q]) for k in ks for q in ('x','y','w','h')] or [0]), miss)
    async def add_feature(pg):
        await pg.evaluate("document.querySelector('[data-sec-add-btn]').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200)
        r=await pg.evaluate("document.querySelector('.sec-add-zone').getBoundingClientRect().toJSON()")
        await pg.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2); await pg.wait_for_timeout(200)
        await pg.evaluate("document.querySelector('[data-sec-add-btn]').click()"); await pg.wait_for_timeout(300)
        opts=await pg.evaluate("[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/特集/.test(b.textContent)).map(b=>b.textContent.trim())")
        await pg.evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/特集/.test(b.textContent));b&&b.click()})()"); await pg.wait_for_timeout(500)
        return opts

    # V8 直して開き直す（同じ文脈）→ 同じ見た目。「戻す」は押せない
    ctx=await br.new_context(viewport={'width':1440,'height':1100}); pg=await ctx.new_page(); await pg.goto(URL); await pg.wait_for_timeout(1500)
    await drag(pg,'F_p0',30,0); await edit_append(pg,'F_b0','（試し）')
    await pg.evaluate(f"{P}.setCols && {P}.setCols('I_cards',2)"); await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(1500); g1=await G(pg); o1=await pg.evaluate(f"{P}.ops()"); s1=await st(pg)
    await pg.reload(); await pg.wait_for_timeout(2000); g2=await G(pg); o2=await pg.evaluate(f"{P}.ops()")
    await pg.click('#tUndo'); await pg.wait_for_timeout(400); g3=await G(pg); und=(await maxdiff(g2,g3))[0]<=0.5   # 開き直した直後の「戻す」は何も戻さない
    d,miss=await maxdiff(g1,g2)
    rec('V8 直して開き直す',d<=0.5 and not miss and len(o1)==len(o2) and und,f"保存の状態 {s1} 最大のずれ {d:.2f} 欠け {miss[:4]} ops {len(o1)}→{len(o2)} 戻すで何も戻らない={und}")
    # V9 新しい文脈は空から（保存が混ざらない）
    ctx2=await br.new_context(viewport={'width':1440,'height':1100}); pg2=await ctx2.new_page(); await pg2.goto(URL); await pg2.wait_for_timeout(1500)
    o3=await pg2.evaluate(f"{P}.ops()"); v3=await pg2.evaluate(f"{P}.versions()")
    rec('V9 新しい文脈は空から',not o3 and len([v for v in v3 if v.get('kind')!='draft'])==1,f"ops {len(o3)} 履歴 {[v.get('kind') for v in v3]}")
    await ctx2.close(); await ctx.close()

    # V10 状態の文字と公開ボタン：最初→公開→直す→戻す
    pg=await fresh(); a=(await label(pg),await pubdis(pg))
    await pg.click('#tPublish'); await pg.wait_for_timeout(600); b=(await label(pg),await pubdis(pg))
    toast=await pg.evaluate("(()=>{const t=document.getElementById('publishToast');return [t.textContent.trim(),t.classList.contains('on')]})()")
    await pg.wait_for_timeout(3300); toast2=await pg.evaluate("document.getElementById('publishToast').classList.contains('on')")
    await drag(pg,'F_p0',30,0); await pg.wait_for_timeout(800); c=(await label(pg),await pubdis(pg))
    await pg.click('#tUndo'); await pg.wait_for_timeout(800); d_=(await label(pg),await pubdis(pg))
    ok=a[0][0]=='まだ公開していません' and not a[1] and b[0][0]=='公開中と同じです' and b[1] and toast==['公開しました',True] and not toast2 and c[0][0]=='まだ公開していない変更があります' and c[0][1] and not c[1] and d_[0][0]=='公開中と同じです' and d_[1]
    rec('V10 状態の文字と公開ボタン',ok,f"最初 {a} 公開後 {b} 知らせ {toast}→3.3秒後 {toast2} 直した後 {c} 戻した後 {d_}")
    await pg.context.close()

    # V11 保存の失敗と回復
    pg=await fresh(); await pg.evaluate(f"{P}.simulateSaveError(true)"); await drag(pg,'F_p0',30,0); await pg.wait_for_timeout(1200)
    e1=(await label(pg),(await st(pg))['status']); col=await pg.evaluate("getComputedStyle(document.getElementById('saveStatus')).color")
    await pg.evaluate(f"{P}.simulateSaveError(false)"); await drag(pg,'F_p0',30,0); await pg.wait_for_timeout(1200); e2=(await label(pg),(await st(pg))['status'])
    rec('V11 保存の失敗と回復','保存できませんでした' in e1[0][0] and e1[1]=='error' and '保存できませんでした' not in e2[0][0] and e2[1]=='saved',f"失敗 {e1} 色 {col} 回復 {e2}")
    await pg.context.close()

    # V12 W8 の操作を実際に：箱の中身・題の数・publishCheck と一致
    pg=await fresh(); await drag(pg,'F_p0',-619,0)
    await pg.evaluate(f"{P}.setDevice('sp')"); await pg.wait_for_timeout(400); g=await G(pg)
    await drag(pg,'F_h0',0,(g['F_p0']['y']+g['F_p0']['h']*0.4)-(g['F_h0']['y']+g['F_h0']['h']/2))
    await edit_append(pg,'F_b0','季節の移ろいを、小さな菓子に写してお届けします。四季折々の意匠をお楽しみください。店の奥の席で、ゆっくりお召し上がりいただけます。')
    await pg.evaluate(f"{P}.setDevice('pc')"); await pg.wait_for_timeout(400)
    addopts=await add_feature(pg); nsec=await pg.evaluate(f"{P}.sectionList().length")
    chk=await pg.evaluate(f"{P}.publishCheck()")
    await pg.evaluate("window.scrollTo(0,0)"); await pg.click('#tPublish'); await pg.wait_for_timeout(600)
    rows=await pg.evaluate("[...document.querySelectorAll('#publishBox .pbox-row')].map(r=>[r.dataset.pboxKind,r.dataset.pboxDev,r.querySelector('.pbox-rowtext').textContent.trim(),!!r.querySelector('[data-pbox-see]')])")
    title=await pg.evaluate("(()=>{const t=document.querySelector('#publishBox .pbox-title');return t?t.textContent.trim():null})()")
    on=await pg.evaluate("document.getElementById('publishBox').classList.contains('on')")
    import re as _re
    n=int(_re.findall(r'(\d+)',title or '0')[0]) if title else -1
    rec('V12 W8 の操作で確認の箱',on and n==len(rows)==len(chk) and all(r[3] for r in rows) and all(r[2].startswith(('PC：','スマホ：')) or r[0]=='emptyPhoto' for r in rows) and not any('__' in r[2] or re.search(r'sec\d',r[2]) for r in rows),f"足す特集の選び {addopts} セクション数 {nsec} 題「{title}」 行 {json.dumps(rows,ensure_ascii=False)}")
    await pg.screenshot(path='V12_box.png')
    # V13 スマホの重なりの「見る」
    idx=next((i for i,r in enumerate(rows) if r[0]=='overlap' and r[1]=='sp'),None)
    if idx is not None:
        await pg.locator('#publishBox [data-pbox-see]').nth(idx).click(); await pg.wait_for_timeout(700)
        dev=await pg.evaluate(f"{P}.inputMode && 1"); g=await G(pg); sel=await pg.evaluate("[...(window.__playground.peek?[]:[])]")
        r=await bb(pg,'F_h0'); off=(r['y']+r['h']/2)-1100/2
        boxon=await pg.evaluate("document.getElementById('publishBox').classList.contains('on')")
        sp_on=await pg.evaluate("document.getElementById('dSP').classList.contains('on')")
        rec('V13 スマホの重なりの「見る」',not boxon and sp_on and abs(off)<=60,f"箱が閉じた={not boxon} スマホ={sp_on} 見出しの真ん中と画面の真ん中の差 {off:.0f}")
    else: rec('V13 スマホの重なりの「見る」',False,'スマホの重なりの行が無い')
    # V14 Esc＝戻って直す、このまま公開する
    nv=len(await pg.evaluate(f"{P}.versions()"))
    await pg.evaluate("window.scrollTo(0,0)"); await pg.click('#tPublish'); await pg.wait_for_timeout(500); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    closed=not await pg.evaluate("document.getElementById('publishBox').classList.contains('on')"); nv2=len(await pg.evaluate(f"{P}.versions()"))
    await pg.click('#tPublish'); await pg.wait_for_timeout(500); await pg.click('#publishBox [data-pbox-go]'); await pg.wait_for_timeout(600)
    nv3=len(await pg.evaluate(f"{P}.versions()")); lb=await label(pg)
    rec('V14 Esc と このまま公開する',closed and nv2==nv and nv3==nv+1 and lb[0]=='公開中と同じです',f"Esc で閉じた={closed} 履歴 {nv}→{nv2}→{nv3} 状態 {lb}")
    # V15 プレビュー：公開の描き方と一致（写真のない枠は詰める）
    await pg.click('#tPreview'); await pg.wait_for_timeout(600)
    res=[]
    for dv in ('pc','sp'):
        await pg.evaluate(f"(()=>{{const b=document.querySelector('#previewBar [data-pv-dev=\"{dv}\"]');b&&b.click()}})()"); await pg.wait_for_timeout(500)
        gp=await G(pg); gq=await pg.evaluate(f"{P}.publishedGeometry('{dv}')"); d,miss=await maxdiff(gp,gq)
        hid=await pg.evaluate("[...document.querySelectorAll('[data-el]')].filter(e=>e.offsetParent&&/^S\\d|^s\\d/.test(e.dataset.el)&&/_p\\d$/.test(e.dataset.el)).length")
        res.append((dv,round(d,2),len(miss)))
    rec('V15 プレビュー＝公開の描き方（PC・スマホ）',all(x[1]<=0.5 and x[2]==0 for x in res),f"{res}")
    await pg.context.close()

    # V16 プレビューの帯・選ばない・スクロールを保つ・戻ると選び直さない
    pg=await fresh(); r=await bb(pg,'F_h0'); await pg.mouse.click(r['x']+20,r['y']+8); await pg.wait_for_timeout(300)
    await pg.evaluate("window.scrollTo(0,900)"); await pg.wait_for_timeout(300); y0=await pg.evaluate('scrollY'); o0=len(await pg.evaluate(f"{P}.ops()"))
    await pg.evaluate("document.getElementById('tPreview').click()"); await pg.wait_for_timeout(600)
    bar=await pg.evaluate("(()=>{const b=document.getElementById('previewBar');return [b.classList.contains('on'),[...b.children].filter(c=>c.offsetParent||c.getClientRects().length).map(c=>c.textContent.trim())]})()")
    tb=await pg.evaluate("(()=>{const t=document.getElementById('toolbar');return t?getComputedStyle(t).display:null})()")
    deco=await pg.evaluate("[...document.querySelectorAll('.rz-handle,[data-photo-change],.sel-frame,.selbox')].filter(e=>e.offsetParent&&e.getBoundingClientRect().width>0).length")
    r=await bb(pg,'F_b0')
    if r and r['y']>0: await pg.mouse.click(r['x']+20,r['y']+8); await pg.wait_for_timeout(300)
    o1=len(await pg.evaluate(f"{P}.ops()")); y1=await pg.evaluate('scrollY')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
    pm=await pg.evaluate(f"{P}.previewMode()"); y2=await pg.evaluate('scrollY')
    hs=await pg.evaluate("[...document.querySelectorAll('.rz-handle')].filter(e=>e.offsetParent&&e.getBoundingClientRect().width>0).length")
    rec('V16 プレビューの出入り',bar[0] and tb=='none' or bar[0],f"帯 {bar} 上の並び display={tb} 飾り {deco} 押した後 ops {o0}→{o1} scrollY {y0}→{y1}→{y2} 戻った後 previewMode={pm} つまみ {hs}")
    await pg.context.close()

    # V17 公開して開き直す → 状態と履歴が残る
    ctx=await br.new_context(viewport={'width':1440,'height':1100}); pg=await ctx.new_page(); await pg.goto(URL); await pg.wait_for_timeout(1500)
    await drag(pg,'F_p0',30,0); await pg.click('#tPublish'); await pg.wait_for_timeout(600); await drag(pg,'F_p0',30,0); await pg.wait_for_timeout(1500)
    v1=[x.get('kind') for x in await pg.evaluate(f"{P}.versions()")]; l1=await label(pg)
    await pg.reload(); await pg.wait_for_timeout(2000)
    v2=[x.get('kind') for x in await pg.evaluate(f"{P}.versions()")]; l2=await label(pg)
    rec('V17 公開して開き直す',v1==v2 and l1==l2 and l2[0]=='まだ公開していない変更があります',f"履歴 {v1}→{v2} 状態 {l1}→{l2}")
    await ctx.close()

    # V18 幅 420：公開は並びに、状態の文字は「その他」の一番上（幅 500 では並びに入ることがある）
    pg=await fresh(w=420,h=900); vis=await pg.evaluate("(()=>{const b=document.getElementById('tPublish');const r=b.getBoundingClientRect();return b.offsetParent&&r.right<=innerWidth&&r.width>0})()")
    await pg.click('#tMore'); await pg.wait_for_timeout(300)
    first=await pg.evaluate("(()=>{const m=document.getElementById('moreMenu');const c=[...m.children].filter(e=>e.offsetParent);return c.length?c[0].textContent.trim():null})()")
    rec('V18 幅420 公開と状態の文字',vis and first in ('まだ公開していません','公開中と同じです','まだ公開していない変更があります'),f"公開が並びに={vis} その他の一番上「{first}」")
    await pg.context.close()

    # V19 長い文の目安は端末ごと：スマホだけ越える長さ
    pg=await fresh(); lim=await pg.evaluate(f"{P}.longTextLimits()")
    rec('V19 長い文の目安（値）',None,json.dumps({k:lim[k] for k in list(lim)[:6]},ensure_ascii=False)[:300])
    await pg.context.close()

    # ---------- v3：22d（§6 履歴） ----------
    async def kinds(pg): return [v.get('kind') for v in await pg.evaluate(f"{P}.versions()")]
    async def vid(pg,kind,nth=0):
        vs=[v for v in await pg.evaluate(f"{P}.versions()") if v.get('kind')==kind]; return vs[nth]['id'] if len(vs)>nth else None

    # V20 見るだけの間：書き換え・キー・戻す・公開を試しても、下書きも見ている版も変わらない。閉じると下書きのまま
    pg=await fresh(); await drag(pg,'F_p0',30,0); await pg.click('#tPublish'); await pg.wait_for_timeout(600)
    await drag(pg,'F_p0',30,0); await pg.wait_for_timeout(800); gd=await G(pg); od=len(await pg.evaluate(f"{P}.ops()"))
    old=await vid(pg,'published'); await pg.evaluate(f"{P}.viewVersion('{old}')"); await pg.wait_for_timeout(500)
    gv=await G(pg)
    r=await bb(pg,'F_b0'); await pg.mouse.dblclick(r['x']+20,r['y']+8); await pg.wait_for_timeout(400)
    ed=await pg.evaluate(f"{P}.editingId ? {P}.editingId() : null"); await pg.keyboard.type('X'); await pg.keyboard.press('Delete')
    await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(300)
    pubdis_=await pg.evaluate("document.getElementById('tPublish').disabled")
    gv2=await G(pg); dv,_=await maxdiff(gv,gv2); nv=len(await pg.evaluate(f"{P}.versions()"))
    await pg.evaluate(f"{P}.exitView()"); await pg.wait_for_timeout(500); gd2=await G(pg); dd,_=await maxdiff(gd,gd2); od2=len(await pg.evaluate(f"{P}.ops()"))
    rec('V20 見るだけの間に触っても変わらない',ed is None and dv<=0.5 and dd<=0.5 and od==od2,f"書き換えに入った={ed} 見ている版のずれ {dv:.2f} 閉じた後の下書きのずれ {dd:.2f} ops {od}→{od2} 見ている間の公開ボタン disabled={pubdis_} 履歴の数 {nv}")
    await pg.context.close()

    # V21 下書きが公開中と同じときは「戻す前の下書き」を残さない
    pg=await fresh(); await drag(pg,'F_p0',30,0); await pg.click('#tPublish'); await pg.wait_for_timeout(600)
    k0=await kinds(pg); await pg.evaluate(f"{P}.restoreVersion('initial')"); await pg.wait_for_timeout(500); k1=await kinds(pg)
    rec('V21 公開中と同じ下書きは残さない',k1.count('beforeRestore')==0,f"{k0}→{k1}")
    await pg.context.close()

    # V22 戻す前の下書きは新しい方から 10 まで
    pg=await fresh(); await pg.evaluate(f"{P}.publish({{force:true}})")
    for i in range(12):
        await pg.evaluate(f"{P}.applyOps([{{t:'move',device:'pc',items:[{{id:'F_p0',mode:'M1',dx:{5+i},dy:0}}]}}])"); await pg.wait_for_timeout(100)
        await pg.evaluate(f"{P}.restoreVersion('initial')"); await pg.wait_for_timeout(150)
    k=await kinds(pg); ats=[v.get('at') for v in await pg.evaluate(f"{P}.versions()") if v.get('kind')=='beforeRestore']
    rec('V22 戻す前の下書きは 10 まで',k.count('beforeRestore')==10 and ats==sorted(ats,reverse=True),f"数 {k.count('beforeRestore')} 新しい順={ats==sorted(ats,reverse=True)}")
    await pg.context.close()

    # V23 見ている途中で開き直す → 下書きに戻って開く。V24 公開中の版を下書きにしてから開き直す → 戻した形と戻す前の下書きが残り、状態は「公開中と同じです」
    ctx=await br.new_context(viewport={'width':1440,'height':1100}); pg=await ctx.new_page(); await pg.goto(URL); await pg.wait_for_timeout(1500)
    await drag(pg,'F_p0',30,0); await pg.click('#tPublish'); await pg.wait_for_timeout(600)
    await drag(pg,'F_p0',30,0); await edit_append(pg,'F_b0','（足した）'); await pg.wait_for_timeout(1500); gd=await G(pg)
    old=await vid(pg,'published'); await pg.evaluate(f"{P}.viewVersion('{old}')"); await pg.wait_for_timeout(800)
    await pg.reload(); await pg.wait_for_timeout(2000)
    vw=await pg.evaluate(f"{P}.viewingVersion()"); g2=await G(pg); d,_=await maxdiff(gd,g2)
    rec('V23 見ている途中で開き直す',not vw and d<=0.5,f"開き直した後に見ている版={vw} 下書きとのずれ {d:.2f}")
    old=await vid(pg,'published'); await pg.evaluate(f"{P}.viewVersion('{old}')"); await pg.wait_for_timeout(500); gold=await G(pg)
    await pg.evaluate(f"{P}.restoreVersion()"); await pg.wait_for_timeout(1500); k1=await kinds(pg)
    await pg.reload(); await pg.wait_for_timeout(2000); g3=await G(pg); k2=await kinds(pg); d3,_=await maxdiff(gold,g3)
    lb=await label(pg)
    rec('V24 下書きにしてから開き直す',d3<=0.5 and k1==k2 and 'beforeRestore' in k2 and lb[0]=='公開中と同じです',f"戻した版とのずれ {d3:.2f} 履歴 {k1}→{k2} 状態 {lb}")
    await ctx.close()

    # V25 セクションの組み立ても戻る：特集を足して公開 → 足した特集を消す → その版を下書きに
    pg=await fresh(); n0=await pg.evaluate(f"{P}.sectionList().length"); await add_feature(pg); n1=await pg.evaluate(f"{P}.sectionList().length")
    await pg.evaluate(f"{P}.publish({{force:true}})"); await pg.wait_for_timeout(300)
    last=n1-1; m=await sec_menu(pg,last)
    if '削除' in m:
        await pg.locator('#fmenu [data-sec-menu="削除"]').click(); await pg.wait_for_timeout(500)
    n2=await pg.evaluate(f"{P}.sectionList().length")
    pv=await vid(pg,'published'); await pg.evaluate(f"{P}.restoreVersion('{pv}')"); await pg.wait_for_timeout(600); n3=await pg.evaluate(f"{P}.sectionList().length")
    await pg.evaluate(f"{P}.undo()"); await pg.wait_for_timeout(400); n4=await pg.evaluate(f"{P}.sectionList().length")
    rec('V25 セクションの組み立ても戻る',n1==n0+1 and n2==n0 and n3==n1 and n4==n0,f"セクション数 初め {n0} 足して {n1} 消して {n2} 下書きにして {n3} 戻して {n4} 消すメニュー {m}")
    await pg.context.close()

    # V26 履歴の板と帯（画面）：並び・帯の文字・ボタン
    pg=await fresh(); await drag(pg,'F_p0',30,0); await pg.click('#tPublish'); await pg.wait_for_timeout(600); await drag(pg,'F_p0',30,0); await pg.click('#tPublish'); await pg.wait_for_timeout(600)
    await drag(pg,'F_p0',30,0); await pg.wait_for_timeout(500)
    await pg.evaluate("window.scrollTo(0,0)"); await pg.click('#tHistory'); await pg.wait_for_timeout(500)
    rows=await pg.evaluate("[...document.querySelectorAll('#historyPanel .hp-row')].map(r=>r.textContent.replace(/\\s+/g,' ').trim())")
    w=await pg.evaluate("Math.round(document.getElementById('historyPanel').getBoundingClientRect().width)")
    await pg.locator('#historyPanel .hp-row').nth(2).click(); await pg.wait_for_timeout(500)
    band=await pg.evaluate("(()=>{const b=document.getElementById('historyBar');return b?[b.classList.contains('on')||!!b.offsetParent,b.textContent.replace(/\\s+/g,' ').trim()]:null})()")
    await pg.screenshot(path='V26.png')
    rec('V26 履歴の板と帯',w==300 and len(rows)>=4 and band and band[0] and '見るだけ' in band[1] and 'この版を下書きにする' in band[1],f"幅 {w} 行 {rows} 帯 {band}")
    await pg.context.close()
    print(f"\n合計 {sum(1 for r in R if r[1] is True)} / {sum(1 for r in R if r[1] is not None)}（-- は値だけ）")
    await br.close()
asyncio.run(main())
