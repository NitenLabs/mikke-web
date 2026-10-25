# verify_extra_photo.py v1.1（Claude.ai・2026-10-05。v1.1＝2026-10-07：確認用の写真を、走らせた場所に書き出すようにした）
# 試験台17〜19b の「作業票の試験の外」の確認：写真を変える・足す・明るさ・もう一方の端末での位置・押し下げ・ページが飛ばないか
# 使い方：python3 verify_extra_photo.py /path/to/playgroundNN_single.html
# F1 の横の期待はページの中身の真ん中（ページの左端＋720×その時の倍率。前は 12+720*0.9972 の決め打ち）。F13・F16 は幅 1024 の確認
# 試験台17：作業票の試験の外の確認（F1〜）
import asyncio, json, os, sys, base64
from playwright.async_api import async_playwright
PATH=sys.argv[1]; URL='file://'+PATH; P='window.__playground'; IMG=os.path.join(os.path.dirname(os.path.abspath(__file__)),'img17')
R=[]
MOD='Meta' if sys.platform=='darwin' else 'Control'
async def nosnap_key(pg):
    # P16 に合わせて手順を変えた（判定は同じ）：線 A2（P16）からは Option(Alt)+ドラッグ＝複製、吸い付かない＝Cmd（MOD）。
    # 版の見分け：a2AutoScroll（線 A2 で足した関数。試験用 API か、ページの PG にある）があれば MOD、無ければ（試験台28・29 以前）Alt
    if not hasattr(pg,'_nosnap'): pg._nosnap=MOD if await pg.evaluate("typeof (window.__playground.a2AutoScroll||(typeof PG!=='undefined'&&PG.a2AutoScroll))==='function'") else 'Alt'
    return pg._nosnap
async def esc_if_editing(pg):
    # P2 に合わせて手順を変えた（判定は同じ）：線 A2（P2）からは文字の箱を押して離すと書き換えに入る。入っていたら Esc 1回＝選んだだけ（P2 の無い版では押さない）
    if await pg.evaluate("!!(window.__playground.editingId&&window.__playground.editingId())"):
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)

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
        cx,cy=r['x']+r['w']/2, r['y']+r['h']/2
        # F19 に合わせて期待の出し方を変えた（判定は同じ）：前は倍率 0.9972（ページが横に 9px はみ出していた頃）を決め打ちして 12+720*0.9972。
        # そのときのページの左端（.host）と倍率（getScale）から、ページの中身の真ん中（設計の 720）を画面の座標にする
        hl=await pg.evaluate("document.querySelector('#sectionwrap .host').getBoundingClientRect().left"); sc_=await pg.evaluate(f"{P}.getScale()")
        ex,ey=hl+720*sc_,(t+1100)/2
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
    await pg.screenshot(path='F2_sp.png'); await pg.context.close()

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
    pg=await fresh()
    # 試験台28：ヘッダー追加で F_p1 が下へずれ（y≈1042）、押す点が 1100 の窓の外に出る＝先に画面の真ん中へ入れてから押す（F11 と同じやり方）
    r=await bb(pg,'F_p1'); await pg.mouse.move(720,600); await pg.mouse.wheel(0, r['y']+r['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(400); r=await bb(pg,'F_p1')
    await pg.mouse.click(r['x']+20,r['y']+20); await pg.wait_for_timeout(500); await pg.mouse.click(r['x']+20,r['y']+20,button='right'); await pg.wait_for_timeout(300)
    await pg.locator('#fmenu button',has_text='写真を外す').first.click(); await pg.wait_for_timeout(400); await pg.mouse.click(5,500); await pg.wait_for_timeout(300)
    n0=await nops(pg)
    r=await bb(pg,'F_p1'); await pg.mouse.move(720,600); await pg.mouse.wheel(0, r['y']+r['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(300); r=await bb(pg,'F_p1')   # 外した後も枠を画面に入れてから中心を押す
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
        await pg.screenshot(path='F13.png')
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
        pg=await fresh(W,800); r=await bb(pg,'F_h0'); await pg.mouse.click(r['x']+20,r['y']+10); await esc_if_editing(pg); await pg.wait_for_timeout(300)   # P2 に合わせて手順を変えた（判定は同じ）：「文字を選んだとき」
        ov=await pg.evaluate("(()=>{const t=document.getElementById('toolbar');return [t.scrollWidth,t.clientWidth,[...t.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>Math.round(b.getBoundingClientRect().right)).reduce((a,b)=>Math.max(a,b),0)]})()")
        rec(f'F16 上の並び（幅 {W}・文字を選んだとき）',ov[2]<=W,f'scrollWidth={ov[0]} clientWidth={ov[1]} 一番右のボタンの右端={ov[2]}')
        await pg.screenshot(path=f'F16_{W}.png',clip={'x':0,'y':0,'width':W,'height':60}); await pg.context.close()

    # H1 押し下げられた部品を、見えている所でクリックして選べる・動かせる（スマホの配置）
    pg=await fresh(); await pg.click('#dSP'); await pg.wait_for_timeout(500)
    await pg.click('#dPC'); await pg.wait_for_timeout(500)
    r=await bb(pg,'F_b0'); await insert(pg)
    a=(await added(pg))[0]['part']; ra=await bb(pg,a)
    await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)
    # 足した写真を F_b0 のすぐ下へ（左端そろえ）
    r=await bb(pg,'F_b0'); ra=await bb(pg,a); gx,gy=ra['x']+10,ra['y']+10; tx,ty=r['x']+10,r['y']+r['h']+24+10
    await pg.mouse.click(gx,gy); await pg.wait_for_timeout(500)
    await pg.keyboard.down(await nosnap_key(pg)); await pg.mouse.move(gx,gy); await pg.mouse.down()   # P16 に合わせて手順を変えた（判定は同じ）
    for i in range(1,16): await pg.mouse.move(gx+(tx-gx)*i/15, gy+(ty-gy)*i/15)
    await pg.mouse.up(); await pg.keyboard.up(await nosnap_key(pg)); await pg.wait_for_timeout(500)   # P16 に合わせて手順を変えた（判定は同じ）
    anc=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')==a]
    await pg.click('#dSP'); await pg.wait_for_timeout(700)
    el=await pg.query_selector('[data-el="F_p1"]'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
    rp=await bb(pg,'F_p1'); g0=(await pg.evaluate(f"{P}.geometry()"))['F_p1']
    await pg.mouse.click(rp['x']+rp['w']/2, rp['y']+rp['h']-30); await pg.wait_for_timeout(500)
    selp=await pg.evaluate("[...document.querySelectorAll('.mark-sel')].map(e=>e.getAttribute('data-el'))")
    x0,y0=rp['x']+40, rp['y']+rp['h']-30
    await pg.keyboard.down(await nosnap_key(pg)); await pg.mouse.move(x0,y0); await pg.mouse.down()   # P16 に合わせて手順を変えた（判定は同じ）
    # J16（E3 sp）に合わせて手順を変えた（判定は同じ）：線 A2 からはドラッグで部品をページの左右の中に収める。スマホの配置の写真は
    # ページの端まで約 20px しかなく、右へ 40px は端で止まる。端に届かない 15px（画面）動かし、設計の px に直した量を同じく ±1px で確かめる
    for i in range(1,11): await pg.mouse.move(x0+1.5*i,y0)
    await pg.mouse.up(); await pg.keyboard.up(await nosnap_key(pg)); await pg.wait_for_timeout(500)   # P16 に合わせて手順を変えた（判定は同じ）
    g1=(await pg.evaluate(f"{P}.geometry()"))['F_p1']; rp2=await bb(pg,'F_p1'); w=await pg.evaluate(f"{P}.warnings()")
    want_dx=15*g0['w']/rp['w']
    rec('H1 押し下げられた写真を選んで動かす',selp==['F_p1'] and abs(g1['x']-g0['x']-want_dx)<=1 and abs(rp2['y']-rp['y'])<=1 and not w['overlaps'],
        f"PC の付いていく先={anc[0]['anchor'] if anc else None} 選んだ={selp} dx={g1['x']-g0['x']:.1f} 画面 y {rp['y']:.0f}→{rp2['y']:.0f} overlaps={w['overlaps']}")
    await pg.screenshot(path='H1.png'); await pg.context.close()

    # H2 スマホの配置で、F_b1 を手で大きく動かして（ぶら下がり）から、PC で F_b0 の下に写真を足す
    pg=await fresh(); await pg.click('#dSP'); await pg.wait_for_timeout(500)
    el=await pg.query_selector('[data-el="F_b1"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_b1')
    x0,y0=r['x']+20,r['y']+10
    await pg.mouse.click(x0,y0); await esc_if_editing(pg); await pg.wait_for_timeout(500)   # P2 に合わせて手順を変えた（判定は同じ）
    await pg.keyboard.down(await nosnap_key(pg)); await pg.mouse.move(x0,y0); await pg.mouse.down()   # P16 に合わせて手順を変えた（判定は同じ）
    for i in range(1,16): await pg.mouse.move(x0+3*i,y0+12*i)
    await pg.mouse.up(); await pg.keyboard.up(await nosnap_key(pg)); await pg.wait_for_timeout(500)   # P16 に合わせて手順を変えた（判定は同じ）
    ancb=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')=='F_b1']
    gs0=await pg.evaluate(f"{P}.geometry()")
    await pg.click('#dPC'); await pg.wait_for_timeout(500)
    await pg.mouse.move(720,600); await pg.mouse.wheel(0,-3000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); await pg.mouse.wheel(0, r['y']+r['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(400)
    await insert(pg); a=(await added(pg))[0]['part']
    await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); ra=await bb(pg,a); gx,gy=ra['x']+10,ra['y']+10; tx,ty=r['x']+10,r['y']+r['h']+24+10
    await pg.mouse.click(gx,gy); await pg.wait_for_timeout(500)
    await pg.keyboard.down(await nosnap_key(pg)); await pg.mouse.move(gx,gy); await pg.mouse.down()   # P16 に合わせて手順を変えた（判定は同じ）
    for i in range(1,16): await pg.mouse.move(gx+(tx-gx)*i/15, gy+(ty-gy)*i/15)
    await pg.mouse.up(); await pg.keyboard.up(await nosnap_key(pg)); await pg.wait_for_timeout(500)   # P16 に合わせて手順を変えた（判定は同じ）
    await pg.click('#dSP'); await pg.wait_for_timeout(700)
    gs1=await pg.evaluate(f"{P}.geometry()"); w=await pg.evaluate(f"{P}.warnings()")
    dys={k:round(gs1[k]['y']-gs0[k]['y'],1) for k in ['F_b0','F_p1','F_h1','F_b1'] if k in gs0}
    rec('H2 ぶら下がった部品も一緒に下がる',not w['overlaps'] and not w['ownerOverlaps'],f"F_b1 の付いていく先={[(x['mode'],x['anchor']) for x in ancb]} 下がった量={dys} 写真の高さ={gs1[a]['h']:.1f} overlaps={w['overlaps']} ownerOverlaps={w['ownerOverlaps']}")
    await pg.screenshot(path='H2.png',full_page=True); await pg.context.close()

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
    await pg.mouse.click(x0,y0); await esc_if_editing(pg); await pg.wait_for_timeout(500)   # P2 に合わせて手順を変えた（判定は同じ）
    await pg.keyboard.down(await nosnap_key(pg)); await pg.mouse.move(x0,y0); await pg.mouse.down()   # P16 に合わせて手順を変えた（判定は同じ）
    for i in range(1,16): await pg.mouse.move(x0+3*i,y0+6*i)
    await pg.mouse.up(); await pg.keyboard.up(await nosnap_key(pg)); await pg.wait_for_timeout(500)   # P16 に合わせて手順を変えた（判定は同じ）
    ancb=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')=='F_b1']
    gs0=await pg.evaluate(f"{P}.geometry()")
    await pg.click('#dPC'); await pg.wait_for_timeout(500)
    await pg.mouse.move(720,600); await pg.mouse.wheel(0,-3000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); await pg.mouse.wheel(0, r['y']+r['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(400)
    await insert(pg); a=(await added(pg))[0]['part']
    await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); ra=await bb(pg,a); gx,gy=ra['x']+10,ra['y']+10; tx,ty=r['x']+10,r['y']+r['h']+24+10
    await pg.mouse.click(gx,gy); await pg.wait_for_timeout(500)
    await pg.keyboard.down(await nosnap_key(pg)); await pg.mouse.move(gx,gy); await pg.mouse.down()   # P16 に合わせて手順を変えた（判定は同じ）
    for i in range(1,16): await pg.mouse.move(gx+(tx-gx)*i/15, gy+(ty-gy)*i/15)
    await pg.mouse.up(); await pg.keyboard.up(await nosnap_key(pg)); await pg.wait_for_timeout(500)   # P16 に合わせて手順を変えた（判定は同じ）
    await pg.click('#dSP'); await pg.wait_for_timeout(700)
    gs1=await pg.evaluate(f"{P}.geometry()"); w=await pg.evaluate(f"{P}.warnings()")
    dys={k:round(gs1[k]['y']-gs0[k]['y'],1) for k in ['F_b0','F_p1','F_h1','F_b1'] if k in gs0}
    rec('H2 dy=90',not w['overlaps'] and not w['ownerOverlaps'],f"F_b1 の付いていく先={[(x['mode'],x['anchor']) for x in ancb]} 下がった量={dys} 写真の高さ={gs1[a]['h']:.1f} overlaps={w['overlaps']} ownerOverlaps={w['ownerOverlaps']}")
    await pg.screenshot(path='H2b_6.png',full_page=True); await pg.context.close()

    # H2 スマホの配置で、F_b1 を手で大きく動かして（ぶら下がり）から、PC で F_b0 の下に写真を足す
    pg=await fresh(); await pg.click('#dSP'); await pg.wait_for_timeout(500)
    el=await pg.query_selector('[data-el="F_b1"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_b1')
    x0,y0=r['x']+20,r['y']+10
    await pg.mouse.click(x0,y0); await esc_if_editing(pg); await pg.wait_for_timeout(500)   # P2 に合わせて手順を変えた（判定は同じ）
    await pg.keyboard.down(await nosnap_key(pg)); await pg.mouse.move(x0,y0); await pg.mouse.down()   # P16 に合わせて手順を変えた（判定は同じ）
    for i in range(1,16): await pg.mouse.move(x0+3*i,y0+9*i)
    await pg.mouse.up(); await pg.keyboard.up(await nosnap_key(pg)); await pg.wait_for_timeout(500)   # P16 に合わせて手順を変えた（判定は同じ）
    ancb=[x for x in await pg.evaluate(f"{P}.anchors()") if x.get('part')=='F_b1']
    gs0=await pg.evaluate(f"{P}.geometry()")
    await pg.click('#dPC'); await pg.wait_for_timeout(500)
    await pg.mouse.move(720,600); await pg.mouse.wheel(0,-3000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); await pg.mouse.wheel(0, r['y']+r['h']/2-(await tbh(pg)+1100)/2); await pg.wait_for_timeout(400)
    await insert(pg); a=(await added(pg))[0]['part']
    await pg.mouse.click(5,1000); await pg.wait_for_timeout(300)
    r=await bb(pg,'F_b0'); ra=await bb(pg,a); gx,gy=ra['x']+10,ra['y']+10; tx,ty=r['x']+10,r['y']+r['h']+24+10
    await pg.mouse.click(gx,gy); await pg.wait_for_timeout(500)
    await pg.keyboard.down(await nosnap_key(pg)); await pg.mouse.move(gx,gy); await pg.mouse.down()   # P16 に合わせて手順を変えた（判定は同じ）
    for i in range(1,16): await pg.mouse.move(gx+(tx-gx)*i/15, gy+(ty-gy)*i/15)
    await pg.mouse.up(); await pg.keyboard.up(await nosnap_key(pg)); await pg.wait_for_timeout(500)   # P16 に合わせて手順を変えた（判定は同じ）
    await pg.click('#dSP'); await pg.wait_for_timeout(700)
    gs1=await pg.evaluate(f"{P}.geometry()"); w=await pg.evaluate(f"{P}.warnings()")
    dys={k:round(gs1[k]['y']-gs0[k]['y'],1) for k in ['F_b0','F_p1','F_h1','F_b1'] if k in gs0}
    rec('H2 dy=135',not w['overlaps'] and not w['ownerOverlaps'],f"F_b1 の付いていく先={[(x['mode'],x['anchor']) for x in ancb]} 下がった量={dys} 写真の高さ={gs1[a]['h']:.1f} overlaps={w['overlaps']} ownerOverlaps={w['ownerOverlaps']}")
    await pg.screenshot(path='H2b_9.png',full_page=True); await pg.context.close()

    # H6 SP-4（4回目の精査・線 S）写真を差し替え → 戻す → やり直す（保存を挟む）→ 写真が出る・読み込み直しても出る・灰色の仮の箱にならない
    pg=await fresh(); el=await pg.query_selector('[data-el="F_p0"]'); await el.scroll_into_view_if_needed(); r=await bb(pg,'F_p0')
    await pg.mouse.click(r['x']+r['w']/2,r['y']+r['h']/2); await pg.wait_for_timeout(400); await pg.mouse.click(r['x']+r['w']/2,r['y']+r['h']/2,button='right'); await pg.wait_for_timeout(400)
    async with pg.expect_file_chooser() as fc: await pg.evaluate("[...document.querySelectorAll('#fmenu button')].find(b=>b.offsetParent&&b.textContent.trim()==='写真を差し替える').click()")
    await (await fc.value).set_files(os.path.join(IMG,'tall.jpg')); await pg.wait_for_timeout(1200)
    async def p0(pg): return next((x for x in await pg.evaluate(f"{P}.photos()") if x['part']=='F_p0'),{})
    async def grey(pg): return await pg.evaluate("(()=>{const e=document.querySelector('[data-el=F_p0]');return !!e&&(/img_/.test(e.textContent||'')||!getComputedStyle(e).backgroundImage.startsWith('url'))})()")
    a1=await p0(pg); await pg.click('#tUndo'); await pg.wait_for_timeout(1200); await pg.click('#tRedo'); await pg.wait_for_timeout(1200)
    a2=await p0(pg); g2=await grey(pg)
    await pg.reload(); await pg.wait_for_timeout(1800); a3=await p0(pg); g3=await grey(pg)
    ok=bool(a1.get('asset')) and a2.get('asset')==a1.get('asset') and a2.get('naturalW')==600 and not g2 and a3.get('asset')==a1.get('asset') and a3.get('naturalW')==600 and not g3
    rec('H6 SP-4 差し替え→戻す→やり直す→読み込み直し',ok,f"差し替え={a1.get('asset')} やり直し後={a2.get('asset')} 幅={a2.get('naturalW')} 灰色={g2} 読み込み直し後={a3.get('asset')} 幅={a3.get('naturalW')} 灰色={g3} pageerror={pg._errs[:2]}")
    await pg.context.close()

    # ---- 4回目の精査・線 C（見せる範囲）----
    async def crop_in(pg,part='F_p0'):
        el=await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(200); r=await bb(pg,part)
        await pg.mouse.dblclick(r['x']+r['w']/2,r['y']+r['h']/2); await pg.wait_for_timeout(400); return r
    async def cst(pg): return await pg.evaluate(f"{P}.cropState()")
    async def pview(pg,part='F_p0'): return next((x['view'] for x in await pg.evaluate(f"{P}.photos()") if x['part']==part),None)
    async def plus(pg,n):
        for i in range(n): await pg.click('[data-crop-step="1"]'); await pg.wait_for_timeout(700)   # 1回ずつ別の手（続けて押すと1手にまとまる）
    # H7 PC-17 1440 で決めた見せる範囲が、1024 の窓でも同じ所が見える（写真の中の見える範囲を割合で比べる。1% 以内）
    #   直す前の版（f70748a）でも OK：見せる範囲はもともと割合（DATA_SPEC の view）で持ち、ページは倍率で縮めるので、設計 px の背景の値が変わらないのが正しい（精査の読み違い。DECISIONS #44）。崩さないための見張り
    pg=await fresh(1440,1000); r=await crop_in(pg)
    for i in range(3): await pg.click('[data-crop-step="1"]'); await pg.wait_for_timeout(100)
    cx,cy=r['x']+r['w']/2,r['y']+r['h']/2; await pg.mouse.move(cx,cy); await pg.mouse.down(); await pg.mouse.move(cx+100,cy+80,steps=8); await pg.mouse.up(); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
    VIS="(()=>{const e=document.querySelector('[data-el=F_p0]');const r=e.getBoundingClientRect();const p=window.__playground.photos().find(x=>x.part==='F_p0');const sz=e.style.backgroundSize.split(' ').map(parseFloat),ps=e.style.backgroundPosition.split(' ').map(parseFloat);const fw=e.offsetWidth,fh=e.offsetHeight;return [-ps[0]/sz[0],-ps[1]/sz[1],(fw-ps[0])/sz[0],(fh-ps[1])/sz[1],r.width/fw]})()"
    a=await pg.evaluate(VIS); await pg.set_viewport_size({'width':1024,'height':900}); await pg.wait_for_timeout(800); b_=await pg.evaluate(VIS)
    d=max(abs(x-y) for x,y in zip(a[:4],b_[:4]))
    rec('H7 PC-17 窓の幅を変えても見せる範囲（写真の中の割合）は同じ',d<=0.01 and abs(b_[4]/a[4]-1024/1440)<0.05,f"1440 {[round(x,3) for x in a]} 1024 {[round(x,3) for x in b_]} 差 {d:.4f}")
    await pg.context.close()
    # H8 PC-18 見せる範囲の中でホイールを回すとページがスクロールし、拡大は変わらない（PowerPoint と同じ）
    pg=await fresh(1440,1000); r=await crop_in(pg); z0=(await cst(pg))['view']['zoom']; y0=await pg.evaluate('scrollY')
    await pg.mouse.move(r['x']+r['w']/2,r['y']+r['h']/2); await pg.mouse.wheel(0,200); await pg.wait_for_timeout(500)
    c=await cst(pg); y1=await pg.evaluate('scrollY')
    rec('H8 PC-18 見せる範囲の中のホイールはスクロール',abs(y1-y0)>=100 and (c is None or abs(c['view']['zoom']-z0)<1e-6),f"scrollY {y0}→{y1} 拡大 {z0}→{c and c['view']['zoom']}")
    await pg.context.close()
    # H9 PC-19 見せる範囲の中の Cmd+Z：拡大を1手ずつ戻す・やり直す。戻すものが無くなったら見せる範囲を終えて、その前の手直し（F_h0 の移動）を戻す
    pg=await fresh(1440,1000); await pg.evaluate(f"{P}.nudge('F_h0',0,10)"); await pg.wait_for_timeout(300); n0=len(await pg.evaluate(f"{P}.ops()"))
    await crop_in(pg); await plus(pg,3); z3=(await cst(pg))['view']['zoom']
    await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(200); z2=(await cst(pg) or {}).get('view',{}).get('zoom')
    await pg.keyboard.press(f'{MOD}+Shift+z'); await pg.wait_for_timeout(200); z3b=(await cst(pg) or {}).get('view',{}).get('zoom')
    for i in range(3): await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(200)
    z0=(await cst(pg) or {}).get('view',{}).get('zoom')
    await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(300); c=await cst(pg); n1=await pg.evaluate("(typeof PG!=='undefined'&&PG.state)?PG.state.cursor:window.__playground.ops().length")
    ok=z3 and abs(z3-1.6)<0.01 and z2 and abs(z2-1.4)<0.01 and z3b and abs(z3b-1.6)<0.01 and z0 and abs(z0-1)<0.01 and c is None and n1==n0-1
    rec('H9 PC-19 見せる範囲の中の Cmd+Z は1手ずつ',ok,f"＋3回 {z3} → 戻す {z2} → やり直す {z3b} → 戻す3回 {z0} → もう1回で終わる={c is None}・その前の手直しも戻る 記録 {n0}→{n1}")
    await pg.context.close()
    # H10 SP-10 見せる範囲に「完了」「取り消す」がある。取り消す＝入る前のまま、完了＝決まる
    pg=await fresh(1440,1000); await crop_in(pg); await plus(pg,2)
    has=await pg.evaluate("[...document.querySelectorAll('#cropzoom button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim())")
    v1=None; v2=None
    if '取り消す' in has and '完了' in has:
        await pg.click('[data-crop-cancel]'); await pg.wait_for_timeout(300); c1=await cst(pg); v1=await pview(pg)
        await crop_in(pg); await plus(pg,2); await pg.click('[data-crop-done]'); await pg.wait_for_timeout(300); c2=await cst(pg); v2=await pview(pg)
    rec('H10 SP-10 完了・取り消す',bool(v1) and v1['zoom']==1 and bool(v2) and abs(v2['zoom']-1.4)<0.01 and c1 is None and c2 is None,f"棒のボタン {has} 取り消した後 {v1} 完了の後 {v2}")
    await pg.context.close()
    # H11 SP-11 枠のつまみ（黒）で見せる枠が狭まり、写真はその場のまま。戻す1回で枠も見せる範囲も元どおり
    pg=await fresh(1440,1000); r=await crop_in(pg); await plus(pg,2); c0=await cst(pg); sc=await pg.evaluate(f"{P}.getScale()")
    img0=(r['x']+c0['display']['ox']*sc,r['y']+c0['display']['oy']*sc,c0['display']['dw'])
    h=await pg.evaluate("(()=>{const h=document.querySelector('[data-crop-frame=e]');if(!h)return null;const r=h.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
    res='枠のつまみが無い'; ok=False
    if h:
        await pg.mouse.move(*h); await pg.mouse.down(); await pg.mouse.move(h[0]-120,h[1],steps=8); await pg.mouse.up(); await pg.wait_for_timeout(300)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        r1=await bb(pg,'F_p0'); bs=await pg.evaluate("(()=>{const e=document.querySelector('[data-el=F_p0]');return [e.style.backgroundSize,e.style.backgroundPosition]})()")
        ox,oy=[float(x[:-2]) for x in bs[1].split()]; dw=float(bs[0].split()[0][:-2]); img1=(r1['x']+ox*sc,r1['y']+oy*sc,dw)
        await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(400); r2=await bb(pg,'F_p0'); v2=await pview(pg)
        ok=abs(r1['w']-(r['w']-120))<=3 and abs(r1['x']-r['x'])<=1 and max(abs(img1[0]-img0[0]),abs(img1[1]-img0[1]))<=1 and abs(img1[2]-img0[2])<=0.5 and abs(r2['w']-r['w'])<=1 and abs(v2['zoom']-1.4)<0.01
        res=f"枠の幅 {r['w']:.0f}→{r1['w']:.0f}（期待 {r['w']-120:.0f}） 写真の左上 ({img0[0]:.1f},{img0[1]:.1f})→({img1[0]:.1f},{img1[1]:.1f}) 写真の幅 {img0[2]:.1f}→{img1[2]:.1f} 戻す1回で枠 {r2['w']:.0f}・見せる範囲 {v2}"
    rec('H11 SP-11 枠のつまみで見せる枠を狭める',ok,res)
    await pg.context.close()

    await br.close()
    print('NG:',[k for k,o,_ in R if o is False])
asyncio.run(main())
