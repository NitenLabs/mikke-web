# verify_extra_text.py v1（Claude.ai・2026-10-05）
# v1.1（2026-10-07）B3：その他の中の「書体」を data-more-name でも探す（試験台22 で名前が ::after に出るため）
# 試験台19・19b の「作業票の試験の外」の確認：リンク・書体・上の並び（その他 ▾）
# 使い方：python3 verify_extra_text.py /path/to/playgroundNN_single.html （先に verify_extra_photo.py を一度走らせて img17/ を作っておく）
# A3・A6・A8 は値を出すだけ（合否なし）。A8 は headless で Ctrl+V が貼らないため参考
import asyncio, json, sys, os
from playwright.async_api import async_playwright
URL='file://'+sys.argv[1]; P='window.__playground'
R=[]
def rec(k,ok,msg): R.append((k,ok,msg)); print(('OK ' if ok is True else ('NG ' if ok is False else '-- '))+k+' | '+msg, flush=True)
SEL="""(word)=>{const el=(document.activeElement&&document.activeElement.isContentEditable)?document.activeElement:document.querySelector('[data-el="F_b0"]');
 const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const i=n.nodeValue.indexOf(word);if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+word.length);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));return r.getBoundingClientRect().toJSON();}}return null}"""
CARET="""(word)=>{const el=(document.activeElement&&document.activeElement.isContentEditable)?document.activeElement:document.querySelector('[data-el="F_b0"]');
 const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const i=n.nodeValue.indexOf(word);if(i>=0){const r=document.createRange();r.setStart(n,i+word.length);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);return true}}return false}"""
CARET0="""(word)=>{const el=document.activeElement;const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const i=n.nodeValue.indexOf(word);if(i>=0){const r=document.createRange();r.setStart(n,i);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);return true}}return false}"""
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch()
    async def fresh(w=1440,h=1100):
        ctx=await br.new_context(viewport={'width':w,'height':h}); pg=await ctx.new_page()
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); await pg.goto(URL); await pg.wait_for_timeout(1500); pg._e=errs; return pg
    async def bb(pg,part): return await pg.evaluate(f"(()=>{{const r=document.querySelector('[data-el=\"{part}\"]').getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height}}}})()")
    async def edit(pg,part='F_b0'):
        r=await bb(pg,part); await pg.mouse.dblclick(r['x']+40,r['y']+12); await pg.wait_for_timeout(500)
    async def link_word(pg,word,row='Instagram'):
        await pg.evaluate(f"({SEL})({json.dumps(word)})"); await pg.wait_for_timeout(250)
        await pg.click('[data-text-tool="link"]'); await pg.wait_for_timeout(350)
        await pg.locator('[data-link-panel]').get_by_text(row,exact=False).first.click(); await pg.wait_for_timeout(400)
    async def runs(pg,part='F_b0'): return (await pg.evaluate(f"{P}.links('{part}')"))['runs']
    async def stop_edit(pg): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)

    # A1 リンクの言葉のすぐ後に打つ → リンクは伸びない
    pg=await fresh(); await edit(pg); await link_word(pg,'小さな菓子')
    await pg.evaluate(f"({CARET})('小さな菓子')"); await pg.keyboard.type('たち'); await pg.wait_for_timeout(300); await stop_edit(pg)
    rr=await runs(pg); rec('A1 リンクの直後に打つ',len(rr)==1 and rr[0].get('text')=='小さな菓子',json.dumps(rr,ensure_ascii=False)[:200]); await pg.context.close()

    # A2 リンクの言葉を全部消す → リンクが残らない
    pg=await fresh(); await edit(pg); await link_word(pg,'小さな菓子')
    await pg.evaluate(f"({SEL})('小さな菓子')"); await pg.keyboard.press('Backspace'); await pg.wait_for_timeout(300)
    await pg.keyboard.type('X'); await stop_edit(pg)
    rr=await runs(pg); rec('A2 リンクの言葉を消して打ち直す',len(rr)==0,json.dumps(rr,ensure_ascii=False)[:200]); await pg.context.close()

    # A3 写真まるごとのリンク → 写真を変えた後
    pg=await fresh(); el=await pg.query_selector('[data-el="F_p0"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_p0')
    await pg.mouse.click(r['x']+30,r['y']+30); await pg.wait_for_timeout(500)
    await pg.click('#tElemLink'); await pg.wait_for_timeout(300)
    await pg.locator('[data-link-panel]').get_by_text('LINE').first.click(); await pg.wait_for_timeout(400)
    l0=await pg.evaluate(f"{P}.elementLink('F_p0')")
    async with pg.expect_file_chooser() as fc: await pg.click('[data-photo-change]')
    await (await fc.value).set_files(os.path.join(os.path.dirname(os.path.abspath(__file__)),'img17','wide.jpg')); await pg.wait_for_timeout(800)
    l1=await pg.evaluate(f"{P}.elementLink('F_p0')")
    rec('A3 リンクの付いた写真を変える',None,f'前={l0} 後={l1}'); await pg.context.close()

    # A4 画面の下の方の文字で一覧を開く → 画面に収まる
    pg=await fresh(); r=await bb(pg,'F_b0'); await pg.mouse.move(720,600); await pg.mouse.wheel(0, r['y']+r['h']-1100+20); await pg.wait_for_timeout(400)
    await edit(pg); await pg.evaluate(f"({SEL})('小さな菓子')"); await pg.wait_for_timeout(200); await pg.click('[data-text-tool="link"]'); await pg.wait_for_timeout(400)
    pr=await pg.evaluate("(()=>{const r=document.querySelector('[data-link-panel]').getBoundingClientRect();return [r.top,r.bottom,r.left,r.right]})()")
    tb=await pg.evaluate("document.getElementById('toolbar').getBoundingClientRect().bottom")
    rec('A4 画面の下の方で一覧',pr[0]>=tb and pr[1]<=1100-8,f'一覧 top/bottom={pr[0]:.0f}/{pr[1]:.0f} 並びの下端={tb:.0f}'); await pg.screenshot(path='./A4.png'); await pg.context.close()

    # A5 スクロールした後にリンク・書体 → ページが飛ばない
    for what in ['link','font']:
        pg=await fresh(); await pg.mouse.move(720,600); await pg.mouse.wheel(0,500); await pg.wait_for_timeout(400); y0=await pg.evaluate('scrollY')
        if what=='link': await edit(pg); await link_word(pg,'小さな菓子'); await stop_edit(pg)
        else:
            r=await bb(pg,'F_h0'); await pg.mouse.click(r['x']+20,r['y']+10); await pg.wait_for_timeout(400)
            await pg.click('[data-text-tool="font"]'); await pg.wait_for_timeout(300); await pg.locator('[data-font-panel], [data-font-list]').get_by_text('ゴシック').first.click() if await pg.locator('[data-font-panel], [data-font-list]').count() else await pg.get_by_text('本文の書体').first.click()
            await pg.wait_for_timeout(400)
        rec(f'A5 スクロールした後の{"リンク" if what=="link" else "書体"}',abs(await pg.evaluate('scrollY')-y0)<=1,f"scrollY {y0}→{await pg.evaluate('scrollY')}"); await pg.context.close()

    # A6 窓の幅ごとの上の並び（書き換え中）
    for W in [1440,1280,1024,800,700,650]:
        pg=await fresh(W,900); await edit(pg); await pg.evaluate(f"({SEL})('季節')"); await pg.wait_for_timeout(300)
        info=await pg.evaluate("""(()=>{const t=document.getElementById('toolbar');const bs=[...t.querySelectorAll('button')].filter(b=>b.offsetParent);
          return {h:Math.round(t.getBoundingClientRect().height), right:Math.round(Math.max(...bs.map(b=>b.getBoundingClientRect().right))),
          font:!!document.querySelector('[data-text-tool="font"]')&&!!document.querySelector('[data-text-tool="font"]').offsetParent,
          link:!!document.querySelector('[data-text-tool="link"]')&&!!document.querySelector('[data-text-tool="link"]').offsetParent, mode:window.__playground.inputMode()}})()""")
        rec(f'A6 幅 {W}',None,json.dumps(info,ensure_ascii=False)); await pg.screenshot(path=f'./A6_{W}.png',clip={'x':0,'y':0,'width':W,'height':110}); await pg.context.close()

    # A7 書体の見本に乗せてから Esc → 仮の見え方が残らない
    pg=await fresh(); r=await bb(pg,'F_h0'); await pg.mouse.click(r['x']+20,r['y']+10); await pg.wait_for_timeout(400)
    await pg.click('[data-text-tool="font"]'); await pg.wait_for_timeout(300)
    t=pg.get_by_text('本文の書体').first; await t.hover(); await pg.wait_for_timeout(300)
    f1=await pg.evaluate(f"{P}.curFont('F_h0')"); s1=await pg.screenshot(clip={'x':r['x'],'y':r['y'],'width':r['w'],'height':r['h']})
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    s2=await pg.screenshot(clip={'x':r['x'],'y':r['y'],'width':r['w'],'height':r['h']})
    await pg.mouse.click(5,1000); await pg.wait_for_timeout(300); s0=await pg.screenshot(clip={'x':r['x'],'y':r['y'],'width':r['w'],'height':r['h']})
    rec('A7 乗せてから Esc',s2!=s1,f'curFont={f1} 乗せている間と Esc の後の見た目が違う={s2!=s1}'); await pg.context.close()

    # A8 リンクの付いた言葉をコピーして、別の本文に貼る
    pg=await fresh(); await edit(pg); await link_word(pg,'小さな菓子')
    await pg.evaluate(f"({SEL})('小さな菓子')"); await pg.keyboard.press('Control+c'); await pg.wait_for_timeout(200); await stop_edit(pg)
    el=await pg.query_selector('[data-el="F_b1"]'); await el.scroll_into_view_if_needed(); await edit(pg,'F_b1')
    await pg.keyboard.press('End'); await pg.keyboard.press('Control+v'); await pg.wait_for_timeout(400); await stop_edit(pg)
    rr=await runs(pg,'F_b1'); rec('A8 リンクの言葉をコピーして別の本文へ',None,f'F_b1 のリンク={json.dumps(rr,ensure_ascii=False)[:160]}'); await pg.context.close()

    # A9 自動リンク：前後に日本語
    pg=await fresh(); await edit(pg); await pg.keyboard.press('Control+End'); await pg.keyboard.type('詳しくは https://example.com をご覧ください。'); await pg.wait_for_timeout(300); await stop_edit(pg)
    rr=await runs(pg); rec('A9 文の中のアドレス',len(rr)==1 and rr[0].get('text')=='https://example.com',json.dumps(rr,ensure_ascii=False)[:200]); await pg.context.close()

    # A10 書き換え中でない文字の箱で Cmd+K
    pg=await fresh(); r=await bb(pg,'F_h0'); await pg.mouse.click(r['x']+20,r['y']+10); await pg.wait_for_timeout(400)
    await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(400)
    rec('A10 箱を選んで Cmd+K',not pg._e,f"一覧={await pg.locator('[data-link-panel]').count()} エラー={pg._e[:1]}"); await pg.context.close()
    async def fresh2(w,h=900): return await fresh(w,h)
    async def more_rect(pg):
        return await pg.evaluate("""(()=>{const c=[...document.querySelectorAll('body *')].filter(e=>{const s=getComputedStyle(e);return (s.position==='fixed'||s.position==='absolute')&&e.offsetWidth>0&&e.querySelector&&e.querySelectorAll('button').length>=1&&e.getBoundingClientRect().top>=30&&e.getBoundingClientRect().top<120&&!e.closest('#toolbar')});
          return c.map(e=>{const r=e.getBoundingClientRect();return [e.id||e.className,Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom),[...e.querySelectorAll('button')].map(b=>b.textContent.trim()).slice(0,12)]})})()""")
    async def find_more(pg):
        return await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#toolbar button')].find(b=>b.offsetParent&&b.textContent.includes('その他'));if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
    for W in [1024,800,650,500,400]:
        pg=await fresh(W,900)
        r=await bb(pg,'F_b0'); await pg.mouse.dblclick(r['x']+20,r['y']+12); await pg.wait_for_timeout(500)
        await pg.evaluate(f"({CARET0})('小さな菓子')")
        for _ in range(5): await pg.keyboard.press('Shift+ArrowRight')
        await pg.wait_for_timeout(300)
        mode=await pg.evaluate(f"{P}.inputMode()")
        th=await pg.evaluate("Math.round(document.getElementById('toolbar').getBoundingClientRect().height)")
        mb=await find_more(pg)
        if not mb: rec(f'B1 幅{W} その他',None,f'その他なし mode={mode} 並びの高さ={th}'); await pg.context.close(); continue
        await pg.mouse.click(*mb); await pg.wait_for_timeout(400)
        m=await more_rect(pg)
        ok=bool(m) and all(x[1]>=0 and x[3]<=W and x[4]<=900 for x in m)
        rec(f'B1 幅{W} その他の箱',ok,f'mode={mode} 並びの高さ={th} 箱={m}')
        # その他の中にリンクがあれば、そこから開く
        names=[n for x in m for n in x[5]] if m else []
        if any('リンク' in n for n in names):
            sel=await pg.evaluate("(()=>{const s=getSelection();if(!s.rangeCount)return null;const rr=s.getRangeAt(0).getClientRects();const l=rr[rr.length-1];return [Math.round(s.getRangeAt(0).getBoundingClientRect().left),Math.round(l.bottom),s.toString()]})()")
            dis=await pg.evaluate("[...document.querySelectorAll('#moreMenu button')].find(b=>b.textContent.includes('リンク')).disabled")
            if dis: rec(f'B2 幅{W} その他からリンク',False,'その他の中のリンクが押せない（disabled）'); await pg.context.close(); continue
            await pg.locator('#moreMenu button',has_text='リンク').first.click(); await pg.wait_for_timeout(400)
            pr=await pg.evaluate("(()=>{const e=document.querySelector('[data-link-panel]');if(!e||!e.offsetWidth)return null;const r=e.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)]})()")
            ok2=pr is not None and pr[0]>=8-1 and pr[2]<=W-8+1 and pr[3]<=900-8+1
            rec(f'B2 幅{W} その他からリンク',ok2,f'選んだ範囲(左,下端,文字)={sel} 一覧={pr}')
            await pg.screenshot(path=f'./B2_{W}.png')
        else:
            await pg.keyboard.press('Escape')
        await pg.context.close()
    # B3 幅 500 で書体（並びか その他から）
    for W in [500,400]:
        pg=await fresh(W,900); r=await bb(pg,'F_h0'); await pg.mouse.click(r['x']+20,r['y']+10); await pg.wait_for_timeout(500)
        vis=await pg.evaluate("(()=>{const b=document.querySelector('[data-text-tool=\"font\"]');return b&&b.offsetParent&&b.getBoundingClientRect().right<=innerWidth?1:0})()")
        if not vis:
            mb=await find_more(pg); await pg.mouse.click(*mb); await pg.wait_for_timeout(300)
            # しまったボタンの名前は ::after（data-more-name）に出ることがあるので、textContent と data-more-name の両方で探す
            hit=await pg.evaluate("""(()=>{const b=[...document.querySelectorAll('#moreMenu button')].find(b=>b.offsetParent&&((b.dataset.moreName||'').includes('書体')||b.textContent.includes('書体')||b.querySelector('[data-text-tool=\\"font\\"]')||b.matches('[data-text-tool=\\"font\\"]')));if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()""")
            if hit: await pg.mouse.click(*hit)
        else: await pg.click('[data-text-tool="font"]')
        await pg.wait_for_timeout(400)
        pr=await pg.evaluate("(()=>{const e=[...document.querySelectorAll('.tspop')].find(e=>e.offsetWidth&&e.classList.contains('on'))||[...document.querySelectorAll('.tspop')].find(e=>e.offsetWidth);if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)]})()")
        rec(f'B3 幅{W} 書体の一覧',pr is not None and pr[0]>=0 and pr[2]<=W,f'並びにあった={bool(vis)} 一覧={pr}')
        await pg.screenshot(path=f'./B3_{W}.png'); await pg.context.close()
    await br.close()
asyncio.run(main())
