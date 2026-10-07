# verify_extra_photo.py v1（Claude.ai・2026-10-05）
# 試験台17〜19b の「作業票の試験の外」の確認：写真を変える・足す・明るさ・もう一方の端末での位置・押し下げ・ページが飛ばないか
# 使い方：python3 verify_extra_photo.py /path/to/playgroundNN_single.html
# F1 の横の期待はページの中身の真ん中（12+720*0.9972）。F13・F16 は幅 1024 の確認
# 試験台17：作業票の試験の外の確認（F1〜）
import asyncio, json, os, sys, base64
from playwright.async_api import async_playwright
PATH=sys.argv[1]; URL='file://'+PATH; P='window.__playground'; IMG=os.path.join(os.path.dirname(os.path.abspath(__file__)),'img17')
R=[]

# 試験用の写真（img17/wide.jpg 1600x600・tall.jpg 600x1600）を作る
import os
os.makedirs(IMG, exist_ok=True)
if not os.path.exists(os.path.join(IMG,'wide.jpg')):
    from PIL import Image, ImageDraw
    def quad(w,h):
        im=Image.new('RGB',(w,h)); d=ImageDraw.Draw(im)
        d.rectangle([0,0,w//2,h//2],fill=(220,40,40)); d.rectangle([w//2,0,w,h//2],fill=(40,160,60))
        d.rectangle([0,h//2,w//2,h],fill=(40,80,220)); d.rectangle([w//2,h//2,w,h],fill=(240,200,40)); return im
    quad(1600,600).save(os.path.join(IMG,'wide.jpg'),quality=90); quad(600,1600).save(os.path.join(IMG,'tall.jpg'),quality=90)
def rec(k,ok,msg): R.append((k,ok,msg)); print(('OK ' if ok is True else ('NG ' if ok is False else '-- '))+k+' | '+msg, flush=True)
def b64(n): return base64.b64encode(open(os.path.join(IMG,n),'rb').read()).decode()
SEND="""([items, kind, x, y]) => { const dt=new DataTransfer();
 for (const [b,name] of items){const bin=atob(b);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);dt.items.add(new File([a],name,{type:'image/jpeg'}));}
 const t=document.elementFromPoint(x,y);
 if(kind==='drop'){for(const ev of ['dragenter','dragover','drop'])t.dispatchEvent(new DragEvent(ev,{bubbles:true,cancelable:true,dataTransfer:dt,clientX:x,clientY:y}));}
 else{const tgt=document.activeElement&&document.activeElement!==document.body?document.activeElement:t;tgt.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));}}"""
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch()
    async def fresh(w=1440,h=1100):
        ctx=await br.new_context(viewport={'width':w,'height':h}); pg=await ctx.new_page()
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1500); pg._errs=errs; return pg
    async def added(pg): return [x for x in await pg.evaluate(f"{P}.photos()") if x.get('added')]
    async def bb(pg,part): return await pg.evaluate(f"(()=>{{const r=document.querySelector('[data-el=\"{part}\"]').getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height}}}})()")
    async def insert(pg,name='wide.jpg'):
        async with pg.expect_file_chooser() as fc: await pg.click('#tPhoto')
        await (await fc.value).set_files(os.path.join(IMG,name)); await pg.wait_for_timeout(900)
    async def tbh(pg): return await pg.evaluate("document.getElementById('toolbar').getBoundingClientRect().bottom")
    async def nops(pg): return len(await pg.evaluate(f"{P}.ops()"))

    # F1 写真を足す：真ん中（スクロール量を変えて3回）
    for sc in [0,700,1500]:
        pg=await fresh(); await pg.mouse.move(720,600); await pg.mouse.wheel(0,sc); await pg.wait_for_timeout(500)
        await insert(pg); a=await added(pg)
        if not a: rec(f'F1 scroll{sc}',False,'足されない'); continue
        r=await bb(pg,a[0]['part']); t=await tbh(pg)
        cx,cy=r['x']+r['w']/2, r['y']+r['h']/2; ex,ey=12+720*0.9972,(t+1100)/2
        sel=await pg.evaluate("[...document.querySelectorAll('.sel,[data-selected]')].length")
        w=await pg.evaluate(f"{P}.warnings()")
        rec(f'F1 scroll{sc}',abs(cx-ex)<=3 and abs(cy-ey)<=3,f'真ん中 ({cx:.0f},{cy:.0f}) 期待 ({ex:.0f},{ey:.0f})  ownerOverlaps={len(w["ownerOverlaps"])} overlaps={len(w["overlaps"])} errs={pg._errs[:1]}')
        await pg.context.close()

    # F2 もう一方の端末での位置（K10 の所見）：K9 と同じ条件で、PC で足してスマホへ
    pg=await fresh()
    fb=await bb(pg,'F_b0'); await pg.mouse.move(720,600); await pg.mouse.wheel(0, fb['y']+fb['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(500)
    await insert(pg); a=(await added(pg))[0]['part']
    an=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')==a]
    gpc=await pg.evaluate(f"{P}.geometry()")
    await pg.click('#dSP'); await pg.wait_for_timeout(600)
    g=await pg.evaluate(f"{P}.geometry()"); an2=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')==a]
    w=await pg.evaluate(f"{P}.warnings()")
    anc=(an2 or an or [{}])[0].get('anchor')
    gap = g[a]['y']-(g[anc]['y']+g[anc]['h']) if anc in g else None
    sec=await pg.evaluate(f"{P}.sectionList()")
    rec('F2 もう一方の端末',gap is not None and abs(gap-16)<=0.5 and not w['overlaps'],f'PC での付いていく先={an[0].get("anchor") if an else None} / SP の付いていく先={anc} gap={gap} SP の写真 y={g[a]["y"]:.0f} h={g[a]["h"]:.0f} / 特集の高さ={sec[0]["height"]:.0f} / overlaps={len(w["overlaps"])}')
    el=await pg.query_selector(f'[data-el="{a}"]'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
    await pg.screenshot(path='/home/claude/F2_sp.png'); await pg.context.close()

    # F3 右の端に落とす：中身からはみ出さない
    pg=await fresh(); await pg.evaluate(SEND,[[[b64('wide.jpg'),'wide.jpg']],'drop',1430,700]); await pg.wait_for_timeout(900)
    a=await added(pg)
    if a:
        g=await pg.evaluate(f"{P}.geometry()"); x=g[a[0]['part']]
        rec('F3 右の端に落とす',x['x']+x['w']<=1440-57+0.5 and x['x']>=57-0.5,f'x={x["x"]:.0f}〜{x["x"]+x["w"]:.0f}（中身 57〜1383）')
    else: rec('F3 右の端に落とす',False,'足されない')
    await pg.context.close()

    # F4 ファイルを2つ落とす → 1枚
    pg=await fresh(); await pg.evaluate(SEND,[[[b64('wide.jpg'),'wide.jpg'],[b64('tall.jpg'),'tall.jpg']],'drop',60,700]); await pg.wait_for_timeout(1200)
    a=await added(pg); rec('F4 2つ落とす',len(a)==1,f'足された数={len(a)} 比 h/w={(a[0]["naturalH"]/a[0]["naturalW"]) if a else None}'); await pg.context.close()

    # F5 写真を選ぶ画面を取り消す（ファイルなし）→ 何も起きない
    pg=await fresh(); n0=await nops(pg)
    async with pg.expect_file_chooser() as fc: await pg.click('#tPhoto')
    await (await fc.value).set_files([]); await pg.wait_for_timeout(600)
    rec('F5 選ぶ画面の取り消し',(await nops(pg))==n0 and not await added(pg),f'ops {n0}→{await nops(pg)}'); await pg.context.close()

    # F6 書き換え中に画像を貼り付け → 写真は増えない
    pg=await fresh(); r=await bb(pg,'F_b0'); await pg.mouse.dblclick(r['x']+40,r['y']+15); await pg.wait_for_timeout(400)
    t0=await pg.evaluate("document.querySelector('[data-el=\"F_b0\"]').innerText")
    await pg.evaluate(SEND,[[[b64('wide.jpg'),'wide.jpg']],'paste',r['x']+40,r['y']+15]); await pg.wait_for_timeout(900)
    t1=await pg.evaluate("document.querySelector('[data-el=\"F_b0\"]').innerText")
    rec('F6 書き換え中の画像の貼り付け',not await added(pg) and t0==t1,f'足された={len(await added(pg))} 文字の変化={t0!=t1}'); await pg.context.close()

    # F7 写真の真ん中（ボタンの上）をダブルクリック → 見せる範囲 / F8 ボタンの上で右クリック → 写真の箱
    pg=await fresh(); el=await pg.query_selector('[data-el="F_p0"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_p0')
    cx,cy=r['x']+r['w']/2,r['y']+r['h']/2
    await pg.mouse.click(cx,cy); await pg.wait_for_timeout(400)
    vis=await pg.evaluate("(()=>{const b=document.querySelector('[data-photo-change]');if(!b)return null;const r=b.getBoundingClientRect();return r.width>0?[r.x+r.width/2,r.y+r.height/2]:null})()")
    await pg.mouse.dblclick(cx,cy); await pg.wait_for_timeout(500)
    cs=await pg.evaluate(f"JSON.stringify({P}.cropState())")
    rec('F7 ボタンの上でダブルクリック',cs not in ('null',None),f'ボタン={vis} cropState={cs[:80] if cs else cs}')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    await pg.mouse.click(cx,cy); await pg.wait_for_timeout(400); await pg.mouse.click(cx,cy,button='right'); await pg.wait_for_timeout(400)
    m=await pg.evaluate("[...document.querySelectorAll('#fmenu button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim())")
    rec('F8 ボタンの上で右クリック','写真を差し替える' in m,f'箱={m}'); await pg.context.close()

    # F9 写真の上半分が画面の外 → ボタンは見えている部分の真ん中で、画面の中
    pg=await fresh(); r=await bb(pg,'F_p0'); await pg.mouse.move(720,600); await pg.mouse.wheel(0, r['y']+r['h']/2-await tbh(pg)); await pg.wait_for_timeout(500)
    r=await bb(pg,'F_p0'); t=await tbh(pg); await pg.mouse.click(r['x']+r['w']/2, r['y']+r['h']-60); await pg.wait_for_timeout(400)
    v=await pg.evaluate("(()=>{const b=document.querySelector('[data-photo-change]');const r=b.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()")
    vt=max(r['y'],t); ecy=(vt+r['y']+r['h'])/2
    rec('F9 半分見えない写真のボタン',v[1]>=t and abs(v[1]+v[3]/2-ecy)<=3,f'ボタン y={v[1]:.0f}〜{v[1]+v[3]:.0f} 期待の真ん中 {ecy:.0f} 上の並びの下端 {t:.0f}'); await pg.context.close()

    # F10 テキストを足して、もう一方の端末へ
    pg=await fresh(); await pg.click('#tText'); await pg.wait_for_timeout(400); await pg.keyboard.type('追加の文'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    g0=await pg.evaluate(f"{P}.geometry()"); await pg.click('#dSP'); await pg.wait_for_timeout(600)
    w=await pg.evaluate(f"{P}.warnings()"); g=await pg.evaluate(f"{P}.geometry()")
    new=[k for k in g if k.startswith('add_')]
    rec('F10 テキスト→もう一方の端末',len(new)==1 and not w['overlaps'],f'足した={new} SP x={g[new[0]]["x"] if new else None} w={g[new[0]]["w"] if new else None} overlaps={w["overlaps"]}'); await pg.context.close()

    # F11 置いた端末で、写真を文章に重ねて置き、「このページを元に戻す」→ 重なりなし
    pg=await fresh(); r=await bb(pg,'F_b0'); await pg.mouse.move(720,600); await pg.mouse.wheel(0, r['y']+r['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(500)
    await insert(pg); w1=await pg.evaluate(f"{P}.warnings()")
    await pg.click('#tResetPage'); await pg.wait_for_timeout(700); w2=await pg.evaluate(f"{P}.warnings()")
    a=(await added(pg))
    rec('F11 置いてから「このページを元に戻す」',bool(a) and not w2['overlaps'] and not w2['ownerOverlaps'],f'前 ownerOverlaps={len(w1["ownerOverlaps"])} → 後 overlaps={len(w2["overlaps"])} ownerOverlaps={len(w2["ownerOverlaps"])} 写真={len(a)}'); await pg.context.close()

    # F12 空の枠を押して、選ぶ画面を取り消す → 何も変わらない
    pg=await fresh(); r=await bb(pg,'F_p1'); await pg.mouse.click(r['x']+20,r['y']+20); await pg.wait_for_timeout(500); await pg.mouse.click(r['x']+20,r['y']+20,button='right'); await pg.wait_for_timeout(300)
    await pg.locator('#fmenu button',has_text='写真を外す').first.click(); await pg.wait_for_timeout(400); await pg.mouse.click(5,500); await pg.wait_for_timeout(300)
    n0=await nops(pg)
    async with pg.expect_file_chooser() as fc: await pg.mouse.click(r['x']+r['w']/2-100,r['y']+r['h']/2-100)
    await (await fc.value).set_files([]); await pg.wait_for_timeout(500)
    ph=[x for x in await pg.evaluate(f"{P}.photos()") if x['part']=='F_p1'][0]
    rec('F12 空の枠で選ぶ画面を取り消す',(await nops(pg))==n0 and ph['cleared'],f'ops {n0}→{await nops(pg)} cleared={ph["cleared"]}'); await pg.context.close()

    # F13 明るさの一覧が画面の中に収まるか（狭い画面 1024）
    pg=await fresh(1024,800); el=await pg.query_selector('[data-el="F_p0"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_p0')
    await pg.mouse.click(r['x']+30,r['y']+30); await pg.wait_for_timeout(300)
    vis=await pg.evaluate("(()=>{const b=document.getElementById('tBright');return b&&b.offsetParent?1:0})()")
    if vis:
        await pg.click('#tBright'); await pg.wait_for_timeout(300)
        pr=await pg.evaluate("(()=>{const e=document.querySelector('[data-bright]');const p=e&&e.parentElement.parentElement;const r=(p||e).getBoundingClientRect();return [r.x,r.y,r.right,r.bottom]})()")
        rec('F13 明るさの一覧（幅 1024）',pr[0]>=0 and pr[2]<=1024,f'一覧 x={pr[0]:.0f}〜{pr[2]:.0f}')
        await pg.screenshot(path='/home/claude/F13.png')
    else: rec('F13 明るさの一覧（幅 1024）',False,'明るさ ▾ が見えない（上の並びからはみ出し？）')
    await pg.context.close()

    # F14 明るさ 20 の写真をコピーして貼り付け → 貼り付けた写真の明るさ
    pg=await fresh(); el=await pg.query_selector('[data-el="F_p0"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_p0')
    await pg.mouse.click(r['x']+30,r['y']+30); await pg.wait_for_timeout(300); await pg.click('#tBright'); await pg.wait_for_timeout(300)
    await pg.click('[data-bright="20"]'); await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(500); await pg.mouse.click(r['x']+30,r['y']+30); await pg.keyboard.press('Meta+c'); await pg.keyboard.press('Control+c'); await pg.wait_for_timeout(200)
    await pg.keyboard.press('Meta+v'); await pg.wait_for_timeout(500)
    if not [x for x in await pg.evaluate(f"{P}.photos()") if x['part'].startswith('add')]:
        await pg.keyboard.press('Control+v'); await pg.wait_for_timeout(500)
    ph=[x for x in await pg.evaluate(f"{P}.photos()") if x['part'].startswith('add')]
    rec('F14 明るさのある写真のコピー',bool(ph) and all(x.get('brightness')==20 for x in ph),f'貼り付けた写真={[(x["part"],x.get("brightness")) for x in ph]}'); await pg.context.close()

    # F15 明るさの見本に乗せてから Esc → 記録されない・見え方も戻る
    pg=await fresh(); el=await pg.query_selector('[data-el="F_p0"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_p0')
    await pg.mouse.click(r['x']+30,r['y']+30); await pg.wait_for_timeout(300); n0=await nops(pg)
    await pg.click('#tBright'); await pg.wait_for_timeout(300); await pg.hover('[data-bright="40"]'); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    f=await pg.evaluate("(()=>{const e=document.querySelector('[data-el=\"F_p0\"]');const all=[e,...e.querySelectorAll('*')].map(x=>getComputedStyle(x).filter).filter(x=>x!=='none');return all})()")
    rec('F15 乗せてから Esc',(await nops(pg))==n0 and not any('1.4' in x for x in f),f'ops {n0}→{await nops(pg)} filter={f}'); await pg.context.close()

    # F16 上の並びの幅：何も選ばない／文字を選ぶ／写真を選ぶ で、1440 と 1024 ではみ出さないか
    for W in [1440,1024]:
        pg=await fresh(W,800); r=await bb(pg,'F_h0'); await pg.mouse.click(r['x']+20,r['y']+10); await pg.wait_for_timeout(300)
        ov=await pg.evaluate("(()=>{const t=document.getElementById('toolbar');return [t.scrollWidth,t.clientWidth,[...t.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>Math.round(b.getBoundingClientRect().right)).reduce((a,b)=>Math.max(a,b),0)]})()")
        rec(f'F16 上の並び（幅 {W}・文字を選んだとき）',ov[2]<=W,f'scrollWidth={ov[0]} clientWidth={ov[1]} 一番右のボタンの右端={ov[2]}')
        await pg.screenshot(path=f'/home/claude/F16_{W}.png',clip={'x':0,'y':0,'width':W,'height':60}); await pg.context.close()

    # H1 押し下げられた部品を、見えている所でクリックして選べる・動かせる（スマホの配置）
    pg=await fresh(); await pg.click('#dSP'); await pg.wait_for_timeout(500)
    await pg.click('#dPC'); await pg.wait_for_timeout(500)
    r=await bb(pg,'F_b0'); await insert(pg)
    a=(await added(pg))[0]['part']; ra=await bb(pg,a)
    await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)
    # 足した写真を F_b0 のすぐ下へ（左端そろえ）
    r=await bb(pg,'F_b0'); ra=await bb(pg,a); gx,gy=ra['x']+10,ra['y']+10; tx,ty=r['x']+10,r['y']+r['h']+24+10
    await pg.mouse.click(gx,gy); await pg.wait_for_timeout(500)
    await pg.keyboard.down('Alt'); await pg.mouse.move(gx,gy); await pg.mouse.down()
    for i in range(1,16): await pg.mouse.move(gx+(tx-gx)*i/15, gy+(ty-gy)*i/15)
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(500)
    anc=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')==a]
    await pg.click('#dSP'); await pg.wait_for_timeout(700)
    el=await pg.query_selector('[data-el="F_p1"]'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
    rp=await bb(pg,'F_p1'); g0=(await pg.evaluate(f"{P}.geometry()"))['F_p1']
    await pg.mouse.click(rp['x']+rp['w']/2, rp['y']+rp['h']-30); await pg.wait_for_timeout(500)
    selp=await pg.evaluate("[...document.querySelectorAll('.mark-sel')].map(e=>e.getAttribute('data-el'))")
    x0,y0=rp['x']+40, rp['y']+rp['h']-30
    await pg.keyboard.down('Alt'); await pg.mouse.move(x0,y0); await pg.mouse.down()
    for i in range(1,11): await pg.mouse.move(x0+4*i,y0)
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(500)
    g1=(await pg.evaluate(f"{P}.geometry()"))['F_p1']; rp2=await bb(pg,'F_p1'); w=await pg.evaluate(f"{P}.warnings()")
    rec('H1 押し下げられた写真を選んで動かす',selp==['F_p1'] and abs(g1['x']-g0['x']-40)<=1 and abs(rp2['y']-rp['y'])<=1 and not w['overlaps'],
        f"PC の付いていく先={anc[0]['anchor'] if anc else None} 選んだ={selp} dx={g1['x']-g0['x']:.1f} 画面 y {rp['y']:.0f}→{rp2['y']:.0f} overlaps={w['overlaps']}")
    await pg.screenshot(path='/home/claude/H1.png'); await pg.context.close()

    # H2 スマホの配置で、F_b1 を手で大きく動かして（ぶら下がり）から、PC で F_b0 の下に写真を足す
    pg=await fresh(); await pg.click('#dSP'); await pg.wait_for_timeout(500)
    el=await pg.query_selector('[data-el="F_b1"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_b1')
    x0,y0=r['x']+20,r['y']+10
    await pg.mouse.click(x0,y0); await pg.wait_for_timeout(500)
    await pg.keyboard.down('Alt'); await pg.mouse.move(x0,y0); await pg.mouse.down()
    for i in range(1,16): await pg.mouse.move(x0+3*i,y0+12*i)
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(500)
    ancb=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')=='F_b1']
    gs0=await pg.evaluate(f"{P}.geometry()")
    await pg.click('#dPC'); await pg.wait_for_timeout(500)
    await pg.mouse.move(720,600); await pg.mouse.wheel(0,-3000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); await pg.mouse.wheel(0, r['y']+r['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(400)
    await insert(pg); a=(await added(pg))[0]['part']
    await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); ra=await bb(pg,a); gx,gy=ra['x']+10,ra['y']+10; tx,ty=r['x']+10,r['y']+r['h']+24+10
    await pg.mouse.click(gx,gy); await pg.wait_for_timeout(500)
    await pg.keyboard.down('Alt'); await pg.mouse.move(gx,gy); await pg.mouse.down()
    for i in range(1,16): await pg.mouse.move(gx+(tx-gx)*i/15, gy+(ty-gy)*i/15)
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(500)
    await pg.click('#dSP'); await pg.wait_for_timeout(700)
    gs1=await pg.evaluate(f"{P}.geometry()"); w=await pg.evaluate(f"{P}.warnings()")
    dys={k:round(gs1[k]['y']-gs0[k]['y'],1) for k in ['F_b0','F_p1','F_h1','F_b1'] if k in gs0}
    rec('H2 ぶら下がった部品も一緒に下がる',not w['overlaps'] and not w['ownerOverlaps'],f"F_b1 の付いていく先={[(x['mode'],x['anchor']) for x in ancb]} 下がった量={dys} 写真の高さ={gs1[a]['h']:.1f} overlaps={w['overlaps']} ownerOverlaps={w['ownerOverlaps']}")
    await pg.screenshot(path='/home/claude/H2.png',full_page=True); await pg.context.close()

    # H3 矢印キーで少しずつ動かしても、ページが飛ばない
    pg=await fresh(); await pg.mouse.move(720,600); await pg.mouse.wheel(0,700); await pg.wait_for_timeout(500)
    r=await bb(pg,'F_p1'); await pg.mouse.click(r['x']+20,r['y']+20); await pg.wait_for_timeout(400); y0=await pg.evaluate("scrollY")
    for _ in range(3): await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(150)
    await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(400)
    rec('H3 矢印キーで動かす',abs(await pg.evaluate("scrollY")-y0)<=1,f"scrollY {y0}→{await pg.evaluate('scrollY')}"); await pg.context.close()

    # H4 選んでから 0.5 秒待って「写真を変える」→ 写真を選ぶ画面が開く／0.2 秒で押すと？
    for wait in [500,200]:
        pg=await fresh(); el=await pg.query_selector('[data-el="F_p0"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_p0')
        await pg.mouse.click(r['x']+20,r['y']+20); await pg.wait_for_timeout(wait)
        opened=False
        try:
            async with pg.expect_file_chooser(timeout=1500) as fc: await pg.click('[data-photo-change]')
            await (await fc.value).set_files([]); opened=True
        except Exception: pass
        cs=await pg.evaluate(f"{P}.cropState()")
        rec(f'H4 選んで {wait}ms 後に「写真を変える」',opened and not cs if wait>=500 else None,f'選ぶ画面={opened} 見せる範囲={bool(cs)}'); await pg.context.close()

    # H5 足してから戻す・やり直す で、スマホの配置の押し下げも消える・戻る
    pg=await fresh(); await pg.click('#dSP'); await pg.wait_for_timeout(400); gA=await pg.evaluate(f"{P}.geometry()")
    await pg.click('#dPC'); await pg.wait_for_timeout(400); await insert(pg)
    await pg.keyboard.press('Escape'); await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)
    await pg.click('#tUndo'); await pg.wait_for_timeout(400); await pg.click('#dSP'); await pg.wait_for_timeout(500)
    gB=await pg.evaluate(f"{P}.geometry()"); d1=max(abs(gB[k]['y']-gA[k]['y']) for k in gA)
    await pg.click('#tRedo'); await pg.wait_for_timeout(500); gC=await pg.evaluate(f"{P}.geometry()"); w=await pg.evaluate(f"{P}.warnings()")
    rec('H5 戻す・やり直す',d1<=0.5 and len(gC)==len(gA)+1 and not w['overlaps'],f'戻した後の最大のずれ={d1:.2f} やり直し後の部品数 {len(gA)}→{len(gC)} overlaps={w["overlaps"]}'); await pg.context.close()
    # H2 スマホの配置で、F_b1 を手で大きく動かして（ぶら下がり）から、PC で F_b0 の下に写真を足す
    pg=await fresh(); await pg.click('#dSP'); await pg.wait_for_timeout(500)
    el=await pg.query_selector('[data-el="F_b1"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_b1')
    x0,y0=r['x']+20,r['y']+10
    await pg.mouse.click(x0,y0); await pg.wait_for_timeout(500)
    await pg.keyboard.down('Alt'); await pg.mouse.move(x0,y0); await pg.mouse.down()
    for i in range(1,16): await pg.mouse.move(x0+3*i,y0+6*i)
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(500)
    ancb=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')=='F_b1']
    gs0=await pg.evaluate(f"{P}.geometry()")
    await pg.click('#dPC'); await pg.wait_for_timeout(500)
    await pg.mouse.move(720,600); await pg.mouse.wheel(0,-3000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); await pg.mouse.wheel(0, r['y']+r['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(400)
    await insert(pg); a=(await added(pg))[0]['part']
    await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); ra=await bb(pg,a); gx,gy=ra['x']+10,ra['y']+10; tx,ty=r['x']+10,r['y']+r['h']+24+10
    await pg.mouse.click(gx,gy); await pg.wait_for_timeout(500)
    await pg.keyboard.down('Alt'); await pg.mouse.move(gx,gy); await pg.mouse.down()
    for i in range(1,16): await pg.mouse.move(gx+(tx-gx)*i/15, gy+(ty-gy)*i/15)
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(500)
    await pg.click('#dSP'); await pg.wait_for_timeout(700)
    gs1=await pg.evaluate(f"{P}.geometry()"); w=await pg.evaluate(f"{P}.warnings()")
    dys={k:round(gs1[k]['y']-gs0[k]['y'],1) for k in ['F_b0','F_p1','F_h1','F_b1'] if k in gs0}
    rec('H2 dy=90',not w['overlaps'] and not w['ownerOverlaps'],f"F_b1 の付いていく先={[(x['mode'],x['anchor']) for x in ancb]} 下がった量={dys} 写真の高さ={gs1[a]['h']:.1f} overlaps={w['overlaps']} ownerOverlaps={w['ownerOverlaps']}")
    await pg.screenshot(path='/home/claude/H2b_6.png',full_page=True); await pg.context.close()

    # H2 スマホの配置で、F_b1 を手で大きく動かして（ぶら下がり）から、PC で F_b0 の下に写真を足す
    pg=await fresh(); await pg.click('#dSP'); await pg.wait_for_timeout(500)
    el=await pg.query_selector('[data-el="F_b1"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_b1')
    x0,y0=r['x']+20,r['y']+10
    await pg.mouse.click(x0,y0); await pg.wait_for_timeout(500)
    await pg.keyboard.down('Alt'); await pg.mouse.move(x0,y0); await pg.mouse.down()
    for i in range(1,16): await pg.mouse.move(x0+3*i,y0+9*i)
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(500)
    ancb=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')=='F_b1']
    gs0=await pg.evaluate(f"{P}.geometry()")
    await pg.click('#dPC'); await pg.wait_for_timeout(500)
    await pg.mouse.move(720,600); await pg.mouse.wheel(0,-3000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); await pg.mouse.wheel(0, r['y']+r['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(400)
    await insert(pg); a=(await added(pg))[0]['part']
    await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); ra=await bb(pg,a); gx,gy=ra['x']+10,ra['y']+10; tx,ty=r['x']+10,r['y']+r['h']+24+10
    await pg.mouse.click(gx,gy); await pg.wait_for_timeout(500)
    await pg.keyboard.down('Alt'); await pg.mouse.move(gx,gy); await pg.mouse.down()
    for i in range(1,16): await pg.mouse.move(gx+(tx-gx)*i/15, gy+(ty-gy)*i/15)
    await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(500)
    await pg.click('#dSP'); await pg.wait_for_timeout(700)
    gs1=await pg.evaluate(f"{P}.geometry()"); w=await pg.evaluate(f"{P}.warnings()")
    dys={k:round(gs1[k]['y']-gs0[k]['y'],1) for k in ['F_b0','F_p1','F_h1','F_b1'] if k in gs0}
    rec('H2 dy=135',not w['overlaps'] and not w['ownerOverlaps'],f"F_b1 の付いていく先={[(x['mode'],x['anchor']) for x in ancb]} 下がった量={dys} 写真の高さ={gs1[a]['h']:.1f} overlaps={w['overlaps']} ownerOverlaps={w['ownerOverlaps']}")
    await pg.screenshot(path='/home/claude/H2b_9.png',full_page=True); await pg.context.close()


    await br.close()
    print('NG:',[k for k,o,_ in R if o is False])
asyncio.run(main())
