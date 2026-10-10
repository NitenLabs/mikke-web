# verify_extra_arrange.py v2（Claude.ai・2026-10-06。v2 で K12〜K20 を足した：試験台20b の表・X25・X26・列の見本）
# 試験台20 の「作業票の試験の外」の確認：列・幅・重ねる・左右の入れ替え
# 使い方：python3 verify_extra_arrange.py /path/to/playgroundNN_single.html
# K1〜：作業票の試験の外。-- は値を出すだけ（合否なし）
import asyncio, json, sys
from playwright.async_api import async_playwright
URL='file://'+sys.argv[1]; P='window.__playground'
R=[]
def rec(k,ok,msg): R.append((k,ok,msg)); print(('OK ' if ok is True else ('NG ' if ok is False else '-- '))+k+' | '+msg, flush=True)
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch()
    async def fresh(w=1440,h=1100,dev='pc'):
        ctx=await br.new_context(viewport={'width':w,'height':h}); pg=await ctx.new_page()
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); await pg.goto(URL); await pg.wait_for_timeout(1500); pg._e=errs
        if dev!='pc': await pg.evaluate(f"{P}.setDevice('{dev}')"); await pg.wait_for_timeout(400)
        return pg
    async def G(pg): return await pg.evaluate(f"{P}.geometry()")
    async def bb(pg,part): return await pg.evaluate(f"(()=>{{const e=document.querySelector('[data-el=\"{part}\"]');if(!e)return null;const r=e.getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height}}}})()")
    async def scale(pg,part='F_h0'):
        g=(await G(pg))[part]; r=await bb(pg,part); return r['w']/g['w']
    async def drag(pg,part,dx,dy,hold=False,alt=True,pre=True):
        el=await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(100)
        r=await bb(pg,part); s=await scale(pg,part)
        x=r['x']+min(20,r['w']/2); y=r['y']+r['h']/2
        if pre: await pg.mouse.click(x,y); await pg.wait_for_timeout(350)
        if alt: await pg.keyboard.down('Alt')
        await pg.mouse.move(x,y); await pg.mouse.down()
        for i in range(1,11): await pg.mouse.move(x+dx*s*i/10,y+dy*s*i/10); await pg.wait_for_timeout(10)
        await pg.wait_for_timeout(150)
        if hold: return
        await pg.mouse.up(); await pg.wait_for_timeout(350)
        if alt: await pg.keyboard.up('Alt')
    async def drag_cy(pg,part,target_cy,hold=False):
        g=(await G(pg))[part]; await drag(pg,part,0,target_cy-(g['y']+g['h']/2),hold=hold)
    async def ops(pg): return await pg.evaluate(f"{P}.ops()")
    async def sel_cards(pg):
        el=await pg.query_selector('[data-el="card_photo_c_warabi"]'); await el.scroll_into_view_if_needed()
        r=await bb(pg,'card_photo_c_warabi'); await pg.mouse.click(r['x']+r['w']/2,r['y']+r['h']/2); await pg.wait_for_timeout(450)
    async def open_cols(pg):
        await pg.click('#tCols'); await pg.wait_for_timeout(350)
    async def col_rows(pg):
        return await pg.evaluate("[...document.querySelectorAll('[data-cols-opt]')].filter(b=>b.offsetParent).map(b=>({t:b.textContent.trim(),d:b.disabled,r:b.getBoundingClientRect().toJSON()}))")
    async def click_col(pg,n):
        rows=await col_rows(pg); r=[x for x in rows if x['t'].replace(' ','').startswith(f'{n}列')][0]['r']
        await pg.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2); await pg.wait_for_timeout(500)

    # K0 Y14 の再現：区切り線の中心を品の並びの上端 −20 へ（見出しの組と品の並びの間＝並び替えの帯）
    for dev in ('pc','sp'):
        pg=await fresh(dev=dev); g=await G(pg)
        await drag_cy(pg,'I_divider',g['I_cards']['y']-20,hold=True)
        dt=await pg.evaluate(f"{P}.dropTarget()"); line=await pg.evaluate("[...document.querySelectorAll('[data-drop-line]')].filter(e=>e.getBoundingClientRect().width>0).length")
        await pg.mouse.up(); await pg.wait_for_timeout(350); await pg.keyboard.up('Alt')
        o=await ops(pg); g1=await G(pg)
        hg_b=g['I_hg']['y']+g['I_hg']['h']
        rec(f'K0 {dev} 見出しの組と品の並びの間に落とす（Y14）',o and o[-1].get('t')=='reorder',
            f"間={g['I_cards']['y']-hg_b:.1f} 離す前 dropTarget={dt} 線={line} 記録={json.dumps(o,ensure_ascii=False)[:200]}")
        await pg.context.close()

    # K1 スクロールして品の並びの上端が画面の上に隠れた状態で 2列 → ページが飛ばない
    pg=await fresh(); await sel_cards(pg)
    r=await bb(pg,'I_cards'); await pg.mouse.move(720,600); await pg.mouse.wheel(0,r['y']+300); await pg.wait_for_timeout(500)
    y0=await pg.evaluate('scrollY'); t0=(await bb(pg,'I_cards'))['y']
    await open_cols(pg); await click_col(pg,2)
    y1=await pg.evaluate('scrollY'); t1=(await bb(pg,'I_cards'))['y']
    rec('K1 上端が隠れた所で 2列',abs(y1-y0)<=1 and abs(t1-t0)<=1,f'scrollY {y0}→{y1} 並びの上端（画面） {t0:.1f}→{t1:.1f}')
    await pg.context.close()

    # K2 見本に乗せてから、外をクリック（Esc でなく）→ 戻る・記録しない
    pg=await fresh(); await sel_cards(pg); await open_cols(pg)
    rows=await col_rows(pg); r=[x for x in rows if x['t'].startswith('4列')][0]['r']
    await pg.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2); await pg.wait_for_timeout(400)
    wv=(await pg.evaluate(f"{P}.listLayout()"))['I_cards']
    await pg.mouse.click(5,1050); await pg.wait_for_timeout(400)
    w1=(await pg.evaluate(f"{P}.listLayout()"))['I_cards']; o=await ops(pg)
    rec('K2 乗せて外をクリック',w1['cols']==3 and not o,f'乗せている間={wv} 後={w1} ops={len(o)}')
    await pg.context.close()

    # K3 品の並びに付いていく部品（区切り線を品の並びの中へ）→ 2列にしても付いていく
    pg=await fresh(); g=await G(pg)
    await drag_cy(pg,'I_divider',g['I_cards']['y']+g['I_cards']['h']-60)
    a=await pg.evaluate(f"{P}.anchors()"); g1=await G(pg)
    off=g1['I_divider']['y']-g1['I_cards']['y']
    await sel_cards(pg); await open_cols(pg); await click_col(pg,2); g2=await G(pg)
    off2=g2['I_divider']['y']-g2['I_cards']['y']
    rec('K3 品の並びに付いた区切り線と列',abs(off2-off)<=0.5 or abs((g2['I_divider']['y'])-(g2['I_cards']['y']+g2['I_cards']['h']-(g1['I_cards']['y']+g1['I_cards']['h']-g1['I_divider']['y'])))<=0.5,
        f"付いていく先={[x for x in a if x.get('part')=='I_divider']} 並びの上端からの位置 {off:.1f}→{off2:.1f} 並びの高さ {g1['I_cards']['h']:.0f}→{g2['I_cards']['h']:.0f}")
    await pg.screenshot(path='K3.png',full_page=False); await pg.context.close()

    # K4 左右の入れ替えを2回 → 元と同じ位置
    pg=await fresh(); g0=await G(pg)
    for _ in range(2):
        el=await pg.query_selector('[data-el="F_p0"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_p0')
        await pg.mouse.click(r['x']+30,r['y']+30,button='right'); await pg.wait_for_timeout(400)
        await pg.locator('#fmenu button',has_text='左右を入れ替える').click(); await pg.wait_for_timeout(500)
    g2=await G(pg); d=max(abs(g2[k][a]-g0[k][a]) for k in ('F_p0','F_h0','F_b0','F_p1','I_cards') for a in ('x','y'))
    rec('K4 入れ替えを2回',d<=0.5,f'最大のずれ {d:.2f} ops={json.dumps(await ops(pg),ensure_ascii=False)[:200]}')
    await pg.context.close()

    # K5 2つ目の組で入れ替え（1つ目と鏡）
    pg=await fresh(); g0=await G(pg)
    el=await pg.query_selector('[data-el="F_p1"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_p1')
    await pg.mouse.click(r['x']+30,r['y']+30,button='right'); await pg.wait_for_timeout(400)
    await pg.locator('#fmenu button',has_text='左右を入れ替える').click(); await pg.wait_for_timeout(500)
    g1=await G(pg)
    want_p=1440-(g0['F_p1']['x']+g0['F_p1']['w']); want_t=1440-(g0['F_h1']['x']+g0['F_h1']['w'])
    rec('K5 2つ目の組の入れ替え（鏡）',abs(g1['F_p1']['x']-want_p)<=0.5 and abs(g1['F_h1']['x']-want_t)<=0.5,
        f"写真 {g0['F_p1']['x']:.1f}→{g1['F_p1']['x']:.1f}（鏡 {want_p:.1f}） 見出し {g0['F_h1']['x']:.1f}→{g1['F_h1']['x']:.1f}（鏡 {want_t:.1f}） 高さ {g0['F_p1']['y']:.1f}→{g1['F_p1']['y']:.1f}")
    await pg.context.close()

    # K6 PC の縦積み（甘味処）：営業時間を見出しの箱の真ん中へ → 重なる
    pg=await fresh(); g=await G(pg)
    await drag_cy(pg,'I_time',g['I_kanmi']['y']+g['I_kanmi']['h']/2)
    o=await ops(pg); a=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')=='I_time']; w=await pg.evaluate(f"{P}.warnings()")
    rec('K6 pc 営業時間を甘味処の見出しの上へ',bool(a) and a[0].get('mode')=='M2' and a[0].get('anchor')=='I_kanmi' and any('I_time' in (x['a'],x['b']) for x in w['ownerOverlaps']),
        f"付いていく先={a} owner={w['ownerOverlaps']} 記録={json.dumps(o,ensure_ascii=False)[:160]}")
    await pg.context.close()

    # K7 L12（スマホで見出しを写真の上へ）→ 戻す で元の配置と同じ
    pg=await fresh(dev='sp'); g0=await G(pg)
    await drag_cy(pg,'F_h0',g0['F_p0']['y']+g0['F_p0']['h']*0.4)
    a=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')=='F_h0']
    await pg.click('#tUndo'); await pg.wait_for_timeout(500); g2=await G(pg)
    d=max(abs(g2[k][q]-g0[k][q]) for k in g0 if k in g2 for q in ('x','y'))
    rec('K7 sp 写真に重ねて戻す',bool(a) and a[0].get('mode')=='M2' and d<=0.5,f'重ねた時の付いていく先={a} 戻した後の最大のずれ {d:.2f}')
    await pg.context.close()

    # K8 4列にしたときの見た目（値段・説明が収まっているか）
    pg=await fresh(); await sel_cards(pg); await open_cols(pg); await click_col(pg,4); g=await G(pg)
    over=[k for k in g if k.startswith('card_') and g[k]['x']+g[k]['w']>g['I_cards']['x']+g['I_cards']['w']+0.5]
    cw=(g['I_cards']['w']-72)/4
    inside=[]
    for cid in ('c_jonama','c_warabi','c_dora'):
        ph=g[f'card_photo_{cid}']
        for k in (f'card_name_{cid}',f'card_desc_{cid}',f'card_price_{cid}'):
            if k in g and g[k]['x']+g[k]['w']>ph['x']+ph['w']+0.5: inside.append(k)
    rec('K8 4列：1件の中身が1件の幅に収まる',not over and not inside,f'1件の幅 {cw:.1f} はみ出し={inside or over}')
    await pg.mouse.click(5,1050); el=await pg.query_selector('[data-el="I_cards"]'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
    await pg.screenshot(path='K8_4cols.png'); await pg.context.close()

    # K9 列の見本の見た目（明るさと同じ形か）
    pg=await fresh(); await sel_cards(pg); await open_cols(pg)
    rows=await col_rows(pg); rec('K9 列の見本',None,json.dumps([(x['t'],x['d'],round(x['r']['x']),round(x['r']['y']),round(x['r']['width']),round(x['r']['height'])) for x in rows],ensure_ascii=False))
    await pg.screenshot(path='K9_colspop.png',clip={'x':0,'y':0,'width':1440,'height':300}); await pg.context.close()

    # K10 スマホの配置の表：幅のつまみで 200 で止まる
    pg=await fresh(dev='sp'); el=await pg.query_selector('[data-el="row_name_t_warabi"]'); await el.scroll_into_view_if_needed()
    r=await bb(pg,'row_name_t_warabi'); await pg.mouse.click(r['x']+20,r['y']+5); await pg.wait_for_timeout(400)
    hs=await pg.evaluate("[...document.querySelectorAll('.rz-handle')].map(h=>{const r=h.getBoundingClientRect();return [h.dataset.dir||h.className,r.x+r.width/2,r.y+r.height/2]})")
    e=[h for h in hs if 'e' == str(h[0])[-1:] or 'e'==h[0]]
    if hs:
        h=max(hs,key=lambda q:q[1]); await pg.keyboard.down('Alt'); await pg.mouse.move(h[1],h[2]); await pg.mouse.down()
        for i in range(1,11): await pg.mouse.move(h[1]-800*i/10,h[2])
        await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(400)
    ll=await pg.evaluate(f"{P}.listLayout()")
    rec('K10 sp 表の最小 200',abs(ll['I_table']['w']-200)<=0.5,f'つまみ={hs} 後={ll}')
    await pg.context.close()

    # K11 表を狭めてから、表の中の行の名前を書き換えて長くする → 値段と重ならない
    pg=await fresh(); el=await pg.query_selector('[data-el="row_name_t_warabi"]'); await el.scroll_into_view_if_needed()
    r=await bb(pg,'row_name_t_warabi'); await pg.mouse.click(r['x']+20,r['y']+5); await pg.wait_for_timeout(400)
    hs=await pg.evaluate("[...document.querySelectorAll('.rz-handle')].map(h=>{const r=h.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})")
    h=max(hs,key=lambda q:q[0]); await pg.keyboard.down('Alt'); await pg.mouse.move(h[0],h[1]); await pg.mouse.down()
    for i in range(1,11): await pg.mouse.move(h[0]-2000*i/10,h[1])
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(400)
    r=await bb(pg,'row_name_t_matcha'); await pg.mouse.dblclick(r['x']+10,r['y']+r['h']/2); await pg.wait_for_timeout(400)
    await pg.keyboard.press('End'); await pg.keyboard.type('と季節の和菓子の盛り合わせ'); await pg.wait_for_timeout(200)
    await pg.keyboard.press('Escape'); await pg.mouse.click(5,1050); await pg.wait_for_timeout(400)
    g=await G(pg); n=g['row_name_t_matcha']; pr=g.get('row_price_t_matcha')
    ok=pr is not None and (n['x']+n['w']<=pr['x']+0.5 or n['y']+n['h']<=pr['y']+0.5 or pr['y']+pr['h']<=n['y']+0.5)
    w=await pg.evaluate(f"{P}.warnings()")
    rec('K11 狭めた表で名前を長く',ok and not w['overlaps'],f"幅={(await pg.evaluate(f'{P}.listLayout()'))['I_table']} 名前={n} 値段={pr} overlaps={w['overlaps']}")
    el=await pg.query_selector('[data-el="I_table"]'); await el.scroll_into_view_if_needed(); await pg.screenshot(path='K11_table.png'); await pg.context.close()


    # ---------- v2：試験台20b ----------
    async def sel_table(pg):
        el=await pg.query_selector('[data-el="row_name_t_warabi"]'); await el.scroll_into_view_if_needed()
        r=await bb(pg,'row_name_t_warabi'); await pg.mouse.click(r['x']+20,r['y']+5); await pg.wait_for_timeout(400)
    async def handle_drag(pg,dx):
        hs=await pg.evaluate("[...document.querySelectorAll('.rz-handle')].filter(h=>h.getBoundingClientRect().width>0).map(h=>{const r=h.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})")
        h=max(hs,key=lambda q:q[0]); await pg.keyboard.down('Alt'); await pg.mouse.move(h[0],h[1]); await pg.mouse.down()
        for i in range(1,11): await pg.mouse.move(h[0]+dx*i/10,h[1]); await pg.wait_for_timeout(10)
        await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(400)
        return h
    async def handles(pg):
        return await pg.evaluate("[...document.querySelectorAll('.rz-handle')].filter(h=>h.getBoundingClientRect().width>0).map(h=>{const r=h.getBoundingClientRect();return Math.round(r.x+r.width/2)})")
    async def price_lines(pg,k):
        return await pg.evaluate(f"(()=>{{const e=document.querySelector('[data-el=\"{k}\"]');const r=document.createRange();r.selectNodeContents(e);const ys=new Set([...r.getClientRects()].map(q=>Math.round(q.top)));return ys.size}})()")
    async def edit_append(pg,part,text):
        r=await bb(pg,part); await pg.mouse.dblclick(r['x']+r['w']-6,r['y']+r['h']/2); await pg.wait_for_timeout(400)
        await pg.keyboard.press('End'); await pg.keyboard.type(text); await pg.wait_for_timeout(200)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); await pg.mouse.click(5,1050); await pg.wait_for_timeout(400)

    # K12 PC 表を一番狭く：割合・値段1行・説明＝名前の欄・つまみが表の右の辺にある
    pg=await fresh(); await sel_table(pg); await handle_drag(pg,-2000)
    g=await G(pg); ll=(await pg.evaluate(f"{P}.listLayout()"))['I_table']
    n=g['row_name_t_warabi']; pr=g['row_price_t_warabi']; d=g['row_desc_t_warabi']; t=g['I_table']
    hx=await handles(pg); tr=await bb(pg,'I_table')
    lines=[await price_lines(pg,'row_price_t_warabi'),await price_lines(pg,'row_price_t_matcha')]
    ok=abs(n['w']/pr['w']-560/249)<0.01 and abs(d['w']-n['w'])<=0.5 and lines==[1,1] and abs(pr['x']+pr['w']-(t['x']+t['w']))<=0.5
    rec('K12 pc 表を一番狭く',ok,f"記録 {ll} 画面 {t['w']:.1f} 名前 {n['w']:.1f} 値段 {pr['w']:.1f} 説明 {d['w']:.1f} 値段の行数 {lines} つまみ {hx} 表の右端（画面） {tr['x']+tr['w']:.0f}")
    # K13 そのまま値段を長く → 画面だけ広がる。つまみは画面の右端に付いているか
    # 26b：値段は文字では打ち足せない（値段の箱で直す）ので、箱で選択肢の名前を長くする（表が広がって1行に収まる長さ）
    await pg.evaluate(f"{P}.setPrices('row_price_t_matcha', [{{'name':'上生菓子付き','type':'fixed','amount':1100}}])"); await pg.wait_for_timeout(300)
    g2=await G(pg); ll2=(await pg.evaluate(f"{P}.listLayout()"))['I_table']; t2=g2['I_table']
    l2=await price_lines(pg,'row_price_t_matcha')
    await sel_table(pg); hx2=await handles(pg); tr2=await bb(pg,'I_table')
    rec('K13 pc 狭めた後に値段を長く',l2==1 and abs(ll2['w']-ll['w'])<=0.5 and t2['w']>t['w'],
        f"記録 {ll2['w']:.1f} 画面 {t2['w']:.1f} 値段の行数 {l2} つまみ {hx2} 表の右端（画面） {tr2['x']+tr2['w']:.0f}")
    # K14 広がった状態でつまみを右へ 50 → 記録はいくつになるか（値）
    await handle_drag(pg,50); ll3=(await pg.evaluate(f"{P}.listLayout()"))['I_table']; g3=await G(pg)
    rec('K14 広がった表のつまみを右へ 50',None,f"記録 {ll2['w']:.1f}→{ll3['w']:.1f} 画面 {t2['w']:.1f}→{g3['I_table']['w']:.1f}")
    await pg.context.close()

    # K15 値段の文字を大きくして一番狭くした表 → 1行のまま
    pg=await fresh(); await sel_table(pg); await handle_drag(pg,-2000); g=await G(pg); w0=g['I_table']['w']
    r=await bb(pg,'row_price_t_warabi'); await pg.mouse.click(r['x']+r['w']-10,r['y']+r['h']/2); await pg.wait_for_timeout(400)
    await pg.mouse.click(r['x']+r['w']-10,r['y']+r['h']/2); await pg.wait_for_timeout(400)
    sel=await pg.evaluate(f"JSON.stringify({P}.textStyles ? 1 : 0)")
    for _ in range(4):
        try: await pg.evaluate(f"{P}.textStep(1)")
        except Exception as e: pass
        await pg.wait_for_timeout(150)
    await pg.mouse.click(5,1050); await pg.wait_for_timeout(400)
    g=await G(pg); l=await price_lines(pg,'row_price_t_warabi'); st=await pg.evaluate(f"JSON.stringify({P}.textStyles())")
    rec('K15 pc 狭めた表で値段の文字を大きく',l==1,f"表 {w0:.1f}→{g['I_table']['w']:.1f} 値段の行数 {l} 文字の決まり {st[:160]}")
    await pg.context.close()

    # K16 スマホの表を一番狭く→値段を長く（表示で広げない＝折れる？値だけ）
    pg=await fresh(dev='sp'); await sel_table(pg); await handle_drag(pg,-2000); ll=(await pg.evaluate(f"{P}.listLayout()"))['I_table']
    await edit_append(pg,'row_price_t_matcha','・上生菓子付き'); g=await G(pg)
    rec('K16 sp 狭めた表で値段を長く',None,f"記録 {ll['w']:.1f} 画面 {g['I_table']['w']:.1f} 値段の行数 {await price_lines(pg,'row_price_t_matcha')}")
    await pg.context.close()

    # K17 X25：幅 500・400 の「その他」で、塗られた行の文字が読めるか（太字を入れた状態も）
    for W in (500,400):
        pg=await fresh(w=W,h=900)
        r=await bb(pg,'F_b0'); await pg.mouse.dblclick(r['x']+20,r['y']+8); await pg.wait_for_timeout(500)
        await pg.keyboard.press('Shift+End'); await pg.keyboard.press('Control+b'); await pg.wait_for_timeout(300)
        await pg.click('#tMore'); await pg.wait_for_timeout(400)
        rows=await pg.evaluate("""[...document.querySelectorAll('#moreMenu button')].filter(b=>b.offsetParent).map(b=>{
          const cs=getComputedStyle(b), ca=getComputedStyle(b,'::after'), cb=getComputedStyle(b,'::before');
          const txt=(b.textContent.trim()||'')+'|'+(ca.content||'')+'|'+(cb.content||'');
          const col=(ca.content&&ca.content!=='none'&&ca.content!=='normal')?ca.color:cs.color;
          return [txt,cs.backgroundColor,col,b.className]})""")
        def lum(c):
            import re
            v=[int(x) for x in re.findall(r'\d+',c)[:3]]
            v=[(x/255)/12.92 if x/255<=0.03928 else (((x/255)+0.055)/1.055)**2.4 for x in v]
            return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]
        bad=[]
        for txt,bg,col,cl in rows:
            if 'rgba(0, 0, 0, 0)' in bg: bg='rgb(255, 255, 255)'
            a,b=lum(bg),lum(col); cr=(max(a,b)+0.05)/(min(a,b)+0.05)
            if cr<4.5: bad.append((txt,bg,col,round(cr,1)))
        rec(f'K17 幅{W} その他の行の文字が読める',not bad,f"読めない行 {bad} / 行 {[r[0] for r in rows]}")
        await pg.screenshot(path=f'K17_{W}.png',clip={'x':0,'y':0,'width':W,'height':520}); await pg.context.close()

    # K18 X26・帯：品の並び・表（②の子）の縁の 12 の内側も「間」（並び替え）。深い所は重なる
    async def probe(dev,part,target,off):
        pg=await fresh(dev=dev); g=await G(pg)
        ty=(g[target]['y']+off) if off>=0 else (g[target]['y']+g[target]['h']+off)
        await drag_cy(pg,part,ty,hold=True); dt=await pg.evaluate(f"{P}.dropTarget()")
        await pg.mouse.up(); await pg.wait_for_timeout(300); await pg.keyboard.up('Alt'); await pg.context.close(); return dt
    for dev in ('pc','sp'):
        for part,target,off,want in (('I_divider','I_cards',8,'reorder'),('I_time','I_cards',-8,'reorder'),('I_divider','I_table',8,'reorder'),('I_divider','I_table',-8,'reorder'),('I_divider','I_cards',60,'overlap')):
            dt=await probe(dev,part,target,off)
            rec(f"K18 {dev} {part} を {target} の{'上端+' if off>=0 else '下端'}{off}",dt==want,f'dropTarget={dt}（期待 {want}）')

    # K19 列の見本：横1列・絵と名前・今に印・「その他」からも同じ
    for W in (1440,):
        pg=await fresh(w=W,h=1100); await sel_cards(pg)
        if W==1440: await open_cols(pg)
        else:
            await pg.click('#tMore'); await pg.wait_for_timeout(300)
            await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#moreMenu button')].find(b=>b.offsetParent&&/列/.test(b.textContent+getComputedStyle(b,'::after').content));b&&b.click()})()"); await pg.wait_for_timeout(400)
        opts=await pg.evaluate("[...document.querySelectorAll('[data-cols-opt]')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect();return [b.textContent.trim(),Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),b.classList.contains('cur'),b.disabled,!!b.querySelector('svg,img,canvas,[class*=ico],[class*=thumb],[class*=pic]')]})")
        ys=set(o[2] for o in opts); inside=all(o[1]>=0 and o[1]+o[3]<=W for o in opts)
        rec(f'K19 幅{W} 列の見本',len(opts)>=2 and len(ys)==1 and inside and any(o[5] for o in opts),json.dumps(opts,ensure_ascii=False))
        await pg.screenshot(path=f'K19_{W}.png',clip={'x':0,'y':0,'width':W,'height':260}); await pg.context.close()

    # K20 表の幅 720（L10 相当）：割合
    pg=await fresh(); await sel_table(pg); s0=await scale(pg,'I_table'); await handle_drag(pg,-248*s0); g=await G(pg)
    rec('K20 pc 表を 720 に',abs(g['I_table']['w']-720)<=0.6 and abs(g['row_name_t_warabi']['w']-416.5)<=0.6,f"表 {g['I_table']['w']:.1f} 名前 {g['row_name_t_warabi']['w']:.1f} 値段 {g['row_price_t_warabi']['w']:.1f}")
    await pg.context.close()
    print(f"\n合計 {sum(1 for r in R if r[1] is True)} / {sum(1 for r in R if r[1] is not None)}（-- は値だけ）")
    await br.close()
asyncio.run(main())
