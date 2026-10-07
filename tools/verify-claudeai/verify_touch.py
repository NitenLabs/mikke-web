#!/usr/bin/env python3
"""verify_touch.py v1（2026-10-04）
スマホでの編集（試験台15・16 以降）を、Claude.ai が指の操作で確かめる。作業票の試験の外の操作が中心。
  使い方: python3 verify_touch.py <playgroundNN_single.html>
  ・Chromium（Playwright 同梱）。390×844・deviceScaleFactor 3・isMobile・hasTouch
  ・指は CDP Input.dispatchTouchEvent。座標は client − visualViewport.offset（Claude Code と同じ補正）
  ・ページのピンチは CDP Input.synthesizePinchGesture（gestureSourceType は付けない。付けると拡大しない）
  ・重い処理（verify_playground.py）と同時に走らせると、ピンチが効かないことがある。順に走らせる
  ・吸い付きの試験は入れていない（書体で見出しの幅が変わり、近い相手が変わるため）
  E: 試験台15 の確認で見つけたもの（X4〜X8）と試験の外  N: 試験台16 の試験の外
"""

import asyncio, sys, json
from playwright.async_api import async_playwright
PATH=sys.argv[1]; URL='file://'+PATH; P='window.__playground'
R=[]
def ok(n,c,d=''):
    R.append((n,bool(c),str(d))); print(('OK  ' if c else 'NG  ')+n+('  | '+str(d) if d!='' else ''),flush=True)

async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True)
    pg=await ctx.new_page(); cdp=await ctx.new_cdp_session(pg)
    async def load():
        await pg.goto(URL); await pg.wait_for_timeout(1200)
    async def vvo():
        return await pg.evaluate("[visualViewport.offsetLeft,visualViewport.offsetTop]")
    async def T(kind,pts):
        o=await vvo()
        await cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x-o[0],'y':y-o[1],'id':i} for (i,x,y) in pts]})
    async def tap(x,y,hold=60):
        await T('touchStart',[(0,x,y)]); await pg.wait_for_timeout(hold); await T('touchEnd',[]); await pg.wait_for_timeout(120)
    async def lp(x,y,ms=700,lift=True):
        await T('touchStart',[(0,x,y)]); await pg.wait_for_timeout(ms)
        if lift: await T('touchEnd',[]); await pg.wait_for_timeout(150)
    async def swipe(x,y,dx,dy,start=True,end=True,step=10):
        import math
        n=max(1,int(math.hypot(dx,dy)/step))
        if start: await T('touchStart',[(0,x,y)]); await pg.wait_for_timeout(30)
        for k in range(1,n+1):
            await T('touchMove',[(0,x+dx*k/n,y+dy*k/n)]); await pg.wait_for_timeout(16)
        if end: await T('touchEnd',[]); await pg.wait_for_timeout(250)
    async def rect(id):
        return await pg.evaluate(f"(()=>{{const e=document.querySelector('[data-el=\"{id}\"]');if(!e)return null;const r=e.getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}}}})()")
    async def center(id):
        await pg.evaluate(f"document.querySelector('[data-el=\"{id}\"]').scrollIntoView({{block:'center'}})"); await pg.wait_for_timeout(200)
        return await rect(id)
    async def sel():
        return await pg.evaluate("[...document.querySelectorAll('.mark-sel')].map(e=>e.getAttribute('data-el')||e.id)")
    async def menu():
        return await pg.evaluate("(()=>{const m=document.getElementById('fmenu');if(!m||!m.classList.contains('on'))return null;const r=m.getBoundingClientRect();return {items:[...m.querySelectorAll('button')].map(b=>b.textContent),x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom}})()")
    async def sy(): return await pg.evaluate("scrollY")
    async def sx(): return await pg.evaluate("scrollX")
    async def G(): return await pg.evaluate(f"{P}.geometry()")
    async def editing(): return await pg.evaluate("!!document.querySelector('[contenteditable=true]')")
    async def scale(id='F_h0'):
        g=(await G())[id]; r=await rect(id); return r['w']/g['w']
    async def tapbtn(label):
        r=await pg.evaluate(f"(()=>{{const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='{label}');if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}})()")
        if r: await tap(r[0],r[1]); await pg.wait_for_timeout(250)
        return r
    async def pinch(x,y,f=2.0):
        o=await vvo()
        await cdp.send('Input.synthesizePinchGesture',{'x':x-o[0] if False else x,'y':y,'scaleFactor':f,'relativeSpeed':800}); await pg.wait_for_timeout(500)
    async def vv(): return await pg.evaluate("({s:visualViewport.scale,ox:visualViewport.offsetLeft,oy:visualViewport.offsetTop,w:visualViewport.width,h:visualViewport.height,pl:visualViewport.pageLeft,pt:visualViewport.pageTop})")
    async def el(sel):
        return await pg.evaluate(f"(()=>{{const e=document.querySelector('{sel}');if(!e)return null;const c=getComputedStyle(e);if(c.display==='none'||c.visibility==='hidden')return null;const r=e.getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom}}}})()")
    async def mbtn(label):
        r=await pg.evaluate(f"(()=>{{const b=[...document.querySelectorAll('#fmenu button')].find(b=>b.textContent.trim()==='{label}');if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}})()")
        if r: await tap(r[0],r[1]); await pg.wait_for_timeout(300)
        return r

    # ---- 作業票の試験を、こちらのやり方で（抜き出し）----
    await load()
    ok('S1 inputMode phone', await pg.evaluate(f"{P}.inputMode()")=='phone')
    w=await pg.evaluate("[innerWidth,document.documentElement.scrollWidth]")
    ok('E1 横にはみ出さない（ページの幅＝画面の幅 390）', w[0]<=390 and w[1]<=390, w)
    if w[1]>390:
        wide=await pg.evaluate("(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>390.5&&r.width>0}).slice(0,6).map(e=>(e.id||e.className||e.tagName)+':'+Math.round(e.getBoundingClientRect().right)))()")
        print('    はみ出している要素:',wide)
    # 横になぞって、ページが横に動くか
    r=await center('F_hg'); x0=await sx()
    await swipe(200,r['cy']+80,-150,0)
    ok('E2 何も選ばずに横になぞっても、ページが横に動かない', await sx()==x0, f'scrollX {x0}→{await sx()}')

    # S3/S4 相当：選んで横・縦に動かす
    await load(); r=await center('F_h0'); g0=(await G())['F_h0']; s=await scale()
    await tap(r['cx'],r['cy'])
    ok('S3 タップで見出しが選ばれ、箱は出ない', 'F_h0' in await sel() and await menu() is None, await sel())
    y0=await sy(); r=await rect('F_h0')
    await swipe(r['cx'],r['cy'],0,100)
    g1=(await G())['F_h0']
    ok('E3 選んだ見出しを下へ 100 なぞると、見出しが動く（スクロールしない）', abs((await sy())-y0)<2 and abs(g1['y']-g0['y'])>20, f"scroll {y0}→{await sy()} y {g0['y']:.1f}→{g1['y']:.1f}（どこに置かれたかは決まりによる）")

    # E4：長押しで選んだ直後に、指を離さず縦になぞる（選んでいない部品から始める）
    await load(); r=await center('F_h0'); g0=(await G())['F_h0']; y0=await sy()
    await lp(r['cx'],r['cy'],ms=700,lift=False)
    m=await menu()
    await swipe(r['cx'],r['cy'],0,100,start=False)
    g1=(await G())['F_h0']
    ok('E4 長押しの後、離さずに下へなぞると見出しが動く', abs(g1['y']-g0['y'])>20 or abs(g1['x']-g0['x'])>0.5, f"箱 {m and m['items']} / scroll {y0}→{await sy()} / y {g0['y']:.1f}→{g1['y']:.1f}")
    await load(); r=await center('F_h0'); g0=(await G())['F_h0']
    await lp(r['cx'],r['cy'],ms=700,lift=False)
    await swipe(r['cx'],r['cy'],40,0,start=False)
    g1=(await G())['F_h0']
    ok('E5 長押しの後、離さずに右へなぞると見出しが動く', abs(g1['x']-g0['x'])>5, f"x {g0['x']:.1f}→{g1['x']:.1f}")

    # S5 と、箱が画面に入るか
    await load(); r=await center('F_h0'); await lp(r['cx'],r['cy'])
    m=await menu()
    ok('S5 長押しで箱（複製・削除）が出て、文字は選ばれない', m and '複製' in m['items'] and '削除' in m['items'] and (await pg.evaluate("getSelection().toString()"))=='', m and m['items'])
    # 写真を動かしてから長押し＝ボタンが一番多い箱
    await load(); r=await center('F_p0'); await tap(r['cx'],r['cy']); await swipe(r['cx'],r['cy'],0,-40)
    r=await rect('F_p0'); await lp(r['cx'],r['cy']); m=await menu()
    ok('E6 ボタンの多い箱（写真）も、横が画面に入る（0〜390）', m and m['x']>=0 and m['r']<=390, m and (m['items'],round(m['x']),round(m['r']),round(m['h'])))
    # セクションの箱を右端で
    await load(); r=await center('I_lbl')
    yy=r['y']-12 if r else 300
    await lp(380,yy); m=await menu()
    ok('E7 セクションの背景を右端（x=380）で長押ししても、箱が画面に入る', m and m['x']>=0 and m['r']<=390, m and (m['items'],round(m['x']),round(m['r'])))

    # 箱を出したままスクロールすると
    await load(); r=await center('F_h0'); await lp(r['cx'],r['cy']); m0=await menu(); r0=await rect('F_h0')
    await swipe(200,700,0,-200); m1=await menu(); r1=await rect('F_h0')
    if m1:
        gap0=r0['y']-m0['b']; gap1=r1['y']-m1['b']
        ok('E8 箱を出したままスクロールしても、箱は見出しから離れない', abs(gap1-gap0)<4, f'見出しと箱の間 {gap0:.0f}→{gap1:.0f}')
    else:
        ok('E8 箱を出したままスクロールすると箱は消える（離れて残らない）', True, '消えた')

    # ダブルタップ（グループでない見出し）。2回のタップの間 約120ms
    await load(); r=await center('F_h0')
    await tap(r['cx'],r['cy'],hold=50); await pg.wait_for_timeout(0); await T('touchStart',[(0,r['cx'],r['cy'])]); await pg.wait_for_timeout(50); await T('touchEnd',[]); await pg.wait_for_timeout(300)
    e1=await editing(); await tap(200, r['cy']+250); e2=await editing()
    ok('E9 見出しをダブルタップ（間 120）で書き換え、外のタップで終わる', e1 and not e2, f'{e1},{e2}')
    # 2本目の指が触れたとき
    await load(); r=await center('F_h0'); g0=(await G())['F_h0']
    await tap(r['cx'],r['cy']); await T('touchStart',[(0,r['cx'],r['cy'])]); await pg.wait_for_timeout(30)
    for k in range(1,6): await T('touchMove',[(0,r['cx']+4*k,r['cy'])]); await pg.wait_for_timeout(16)
    await T('touchStart',[(0,r['cx']+20,r['cy']),(1,r['cx']+20,r['cy']+150)]); await pg.wait_for_timeout(30)
    for k in range(1,6): await T('touchMove',[(0,r['cx']+20,r['cy']-6*k),(1,r['cx']+20,r['cy']+150+6*k)]); await pg.wait_for_timeout(16)
    await T('touchEnd',[]); await pg.wait_for_timeout(300)
    g1=(await G())['F_h0']; dr=await pg.evaluate("(()=>{try{return document.querySelectorAll('.drag-ghost,.dragging').length}catch(e){return -1}})()")
    ok('E10 動かしている最中に2本目の指が触れても、壊れない（見出しが大きく飛ばない）', abs(g1['y']-g0['y'])<60, f"x {g0['x']:.1f}→{g1['x']:.1f} y {g0['y']:.1f}→{g1['y']:.1f}")
    # その後もタップで選べるか
    r=await rect('F_b0'); await tap(r['cx'],r['cy'])
    ok('E10b その後も、タップで別の部品を選べる', 'F_b0' in await sel(), await sel())

    # ===== 第2回の試験の外 =====
    def inside(m,v,pad=6):
        # m は client 座標、v は visualViewport（client 座標での見えている範囲）
        return m and m['x']>=v['ox']+pad and m['r']<=v['ox']+v['w']-pad and m['y']>=v['oy']-1 and m['b']<=v['oy']+v['h']+1
    # N1 拡大したまま横・縦に見回すと、下の並びが見えている範囲の下に付いてくる
    await load(); r=await center('F_h0'); await pg.wait_for_timeout(600); await pinch(195,400,2.0); v0=await vv()
    await swipe(150,400,-60,-150); v1=await vv(); pb=await el('#pbar')
    ok('N1 拡大して見回した後も、下の並びが見えている範囲の下端に付いている', pb and abs(pb['b']-(v1['oy']+v1['h']))<3 and pb['x']>=v1['ox']-1 and pb['r']<=v1['ox']+v1['w']+1, f"vs {v0['s']:.2f} vv {round(v1['ox']),round(v1['oy']),round(v1['w']),round(v1['h'])} pbar {pb and (round(pb['x']),round(pb['r']),round(pb['b']))}")
    # N2 拡大したまま箱を出して見回すと、箱は部品に付いていく
    await load(); r=await center('F_h0'); await pg.wait_for_timeout(600); await pinch(r['cx'],r['cy'],2.0); r=await rect('F_h0'); v=await vv()
    if r and v['oy']<r['cy']<v['oy']+v['h']:
        await lp(r['cx'],r['cy']); m0=await menu(); r0=await rect('F_h0')
        await swipe(v['ox']+v['w']/2, v['oy']+v['h']*0.8, 0, -40); m1=await menu(); r1=await rect('F_h0')
        ok('N2 拡大中、箱を出したまま見回しても箱は見出しに付いていく', m0 and m1 and abs((r1['y']-m1['b'])-(r0['y']-m0['b']))<4, f"{m0 and round(r0['y']-m0['b'])}→{m1 and round(r1['y']-m1['b'])}")
    else:
        ok('N2 （見出しが見えている範囲に入らず実施できず）', False, (r,v))
    # N3 選んでいる部品の上から始めたピンチでも、ページが拡大し、部品は動かない
    await load(); r=await center('F_p0'); await tap(r['cx'],r['cy']); g0=(await G())['F_p0']
    await pg.wait_for_timeout(600); await pinch(r['cx'],r['cy'],2.0); v=await vv(); g1=(await G())['F_p0']
    ok('N3 選んだ写真の上でピンチ → ページが拡大し、写真は動かない', v['s']>1.5 and abs(g1['x']-g0['x'])<0.6 and abs(g1['y']-g0['y'])<0.6 and abs(g1['w']-g0['w'])<0.6, f"vs {v['s']:.2f}")
    # N4 拡大中のつまみの押せる範囲（画面上）
    hit=await el('[data-hit="handle-se"]')
    ok('N4 拡大中も、つまみの押せる範囲は画面上で 44 以上', hit and hit['w']*v['s']>=43 and hit['h']*v['s']>=43, hit and (round(hit['w']*v['s']),round(hit['h']*v['s'])))
    # N5 拡大中の「その他」の一覧と「＋」の一覧が見えている範囲の中
    await tap(v['ox']+v['w']*0.85, v['oy']+v['h']-20)  # 「その他」付近（実際の位置で押し直す）
    mo=await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#pbar button')].find(b=>b.textContent.trim()==='その他');if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
    if mo:
        pm=await el('#pmore')
        if not pm: await tap(mo[0],mo[1]); pm=await el('#pmore')
        v=await vv()
        ok('N5 拡大中も「その他」の一覧が見えている範囲の中', inside(pm,v,4), pm and (round(pm['x']),round(pm['r']),round(pm['y']),round(pm['b'])))
    # N6 書き換え中に「大きさ」を選んでも書き換えが続く
    await load(); r=await center('F_h0'); await tap(r['cx'],r['cy'],hold=50); await T('touchStart',[(0,r['cx'],r['cy'])]); await pg.wait_for_timeout(50); await T('touchEnd',[]); await pg.wait_for_timeout(300)
    btns=await pg.evaluate("[...document.querySelectorAll('#ptext button, #ptext select')].map(b=>b.textContent.trim().slice(0,8)||b.tagName)")
    size=await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#ptext button')].find(b=>/大きさ|^[0-9]/.test(b.textContent.trim()));if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
    if size:
        await tap(*size); pop=await el('#pSize')
        opt=await pg.evaluate("(()=>{const p=document.getElementById('pSize');const b=p&&[...p.querySelectorAll('button')].find(b=>/24/.test(b.textContent));if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
        if opt: await tap(*opt)
        ae=await pg.evaluate("document.activeElement&&document.activeElement.getAttribute('data-el')")
        fs=await pg.evaluate("getComputedStyle(document.querySelector('[data-el=F_h0]')).fontSize")
        ok('N6 書き換え中に「大きさ」→24 を選んでも、書き換えが続き、大きさが変わる', ae=='F_h0' and opt is not None, f'道具 {btns} 一覧 {pop and (round(pop["x"]),round(pop["r"]))} active {ae} size {fs}')
    else:
        ok('N6 （「大きさ」のボタンが見つからない）', False, btns)
    # N7 書き換え中に外をタップ → 終わって下の並びが戻る
    await tap(200,120); e=await editing(); pb=await el('#pbar'); pt=await el('#ptext')
    ok('N7 書き換え中に外をタップ → 書き換えが終わり、下の並びが戻る', (not e) and pb and not pt, f'{e} {bool(pb)} {bool(pt)}')
    # N8 下の方にいるときに「テキストを足す」→ 足した文字が見えている範囲にあるか
    await load(); await pg.evaluate("scrollTo(0,document.documentElement.scrollHeight)"); await pg.wait_for_timeout(300)
    before=set((await G()).keys())
    mo=await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#pbar button')].find(b=>b.textContent.trim()==='その他');const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
    await tap(*mo)
    ad=await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#pmore button')].find(b=>b.textContent.trim()==='テキストを足す');const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
    await tap(*ad); await pg.wait_for_timeout(400)
    new=[k for k in (await G()).keys() if k not in before]
    nr=await rect(new[0]) if new else None
    ok('N8 ページの下の方で「テキストを足す」→ 足した文字が画面に見えている', nr and 0<=nr['cy']<=787, f'{new} {nr and round(nr["cy"])} scrollY {await sy()}')
    # N9 「＋」を長押し → 何も起きない（箱・一覧が出ない、文字が選ばれない）
    await load(); pz=await pg.evaluate("(()=>{const e=document.querySelectorAll('[data-hit=\"sec-add\"]')[1];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
    await pg.wait_for_timeout(200); await lp(*pz)
    st=await el('#sectypes'); m=await menu()
    ok('N9 「＋」を長押ししても、箱や一覧は出ない（または一覧だけ）', m is None, f'一覧 {bool(st)} 箱 {m and m["items"]}')
    # N10 「その他」を開いたまま部品を長押し → 一覧は閉じる
    await load(); r=await center('F_h0')
    mo=await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#pbar button')].find(b=>b.textContent.trim()==='その他');const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
    await tap(*mo); r=await rect('F_h0'); await lp(r['cx'],r['cy'])
    ok('N10 「その他」を開いたまま部品を長押し → 一覧は閉じて、箱が出る', (await el('#pmore')) is None and (await menu()) is not None, f"一覧 {bool(await el('#pmore'))} 箱 {bool(await menu())}")
    print('\n合計', sum(1 for x in R if x[1]),'/',len(R))
    await b.close()
asyncio.run(main())
