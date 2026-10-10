#!/usr/bin/env python3
"""verify_extra_width.py v1（2026-10-10・試験台25）
スマホの幅の違い（320・360・375・390・414・430・600）で、390 の配置と同じ形になるか・
縮めた中での書き換え／選び方／日本語の変換がずれないかを、Claude.ai が確かめるための値を出す。
  使い方: python3 verify_extra_width.py <playground25_single.html の絶対パス> [ONLY]
  ・Chromium（Playwright 同梱）。各 W×844・deviceScaleFactor 3・isMobile・hasTouch
  ・A（既定＝transform:scale）と B（?scale=zoom）の両方を走らせる
  ・指は CDP Input.dispatchTouchEvent（マウスは使わない）
  ・合否は決めない＝値だけ出す（判定は Claude.ai）。390 を基準にして比べる
  ・1 本 290 秒以内。超えるときは ONLY で区画を絞る：
      ONLY ∈ {geom, edit, manip, rt, shots, all}（既定 all）
        geom  = W1 W2 W3 W4 W14（7幅×A/B の測定）
        edit  = W5 W6 W7 W13（360/430・書き換え・選び・IME・幅変え）
        manip = W8 W9 W10 W11（360/430・動かす・大きさ・吸い付き・箱/＋）
        rt    = W12（360で直す→430→390で開き直す）
        shots = W15（各幅の撮影 png）
"""
import asyncio, sys, os, math, json
from playwright.async_api import async_playwright

if len(sys.argv) < 2:
    print("usage: verify_extra_width.py <playground25_single.html> [ONLY]"); sys.exit(2)
PATH = sys.argv[1]
ONLY = (sys.argv[2] if len(sys.argv) > 2 else "all").strip()
URL_A = 'file://' + PATH
URL_B = URL_A + '?scale=zoom'
P = 'window.__playground'
WIDTHS = [320, 360, 375, 390, 414, 430, 600]
BASE_W = 390
EDIT_W = [360, 430]
OUTDIR = os.path.join(os.path.dirname(PATH), 'playground25', 'width')
os.makedirs(OUTDIR, exist_ok=True)

def emit(tag, **kv):
    print(tag + '  ' + '  '.join(f'{k}={v}' for k, v in kv.items()), flush=True)

# ---- ページに入れる測定用ヘルパ（倍率で形が崩れていないかを設計px・画面pxで測る）----
HELPERS = r"""
window.__wh = {
  caretIdx(){ const el=document.querySelector('[contenteditable=true]'); if(!el) return -1; const s=getSelection(); if(!s.rangeCount) return -1; const r=s.getRangeAt(0); const pre=r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.endContainer,r.endOffset); return pre.toString().length; },
  charRect(id,idx){ const el=document.querySelector('[data-el="'+id+'"]'); if(!el) return null; const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n,c=0; while(n=w.nextNode()){ const L=n.nodeValue.length; if(idx<c+L){ const r=document.createRange(); r.setStart(n,idx-c); r.setEnd(n,idx-c+1); const b=r.getBoundingClientRect(); return {cx:b.x+b.width/2,cy:b.y+b.height/2,left:b.left,right:b.right,top:b.top,bottom:b.bottom,h:b.height,w:b.width}; } c+=L; } return null; },
  textLen(id){ const el=document.querySelector('[data-el="'+id+'"]'); return el?el.textContent.length:-1; },
  lines(id){ const el=document.querySelector('[data-el="'+id+'"]'); if(!el) return null; const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n; const chs=[]; while(n=w.nextNode()){ for(let i=0;i<n.nodeValue.length;i++) chs.push([n,i,n.nodeValue[i]]); } const firsts=[]; let lastTop=null; for(const [node,i,ch] of chs){ const r=document.createRange(); r.setStart(node,i); r.setEnd(node,i+1); const rc=r.getClientRects()[0]; if(!rc||rc.height===0) continue; const top=Math.round(rc.top); if(lastTop===null||Math.abs(top-lastTop)>2){ firsts.push(ch); lastTop=top; } } return {n:firsts.length, firsts:firsts.join('')}; },
  textBoxes(){ return [...document.querySelectorAll('#sectionwrap [data-kind="text"]')].map(e=>e.getAttribute('data-el')); },
  minFont(){ let min=1e9, who=null, raw=0; for(const el of document.querySelectorAll('#sectionwrap [data-kind="text"]')){ if(!el.textContent.trim()) continue; const fs=parseFloat(getComputedStyle(el).fontSize); if(fs<min){ min=fs; who=el.getAttribute('data-el'); raw=fs; } } const sc=window.__playground.getScale(); const cr=who?window.__wh.charRect(who,0):null; return {who, rawFont:+raw.toFixed(2), scale:+sc.toFixed(4), screenEst:+(raw*sc).toFixed(2), charRectH: cr?+cr.h.toFixed(2):null}; },
  pageEdges(){ const hosts=[...document.querySelectorAll('#sectionwrap .host')]; let l=1e9,r=-1e9; for(const h of hosts){ const b=h.getBoundingClientRect(); l=Math.min(l,b.left); r=Math.max(r,b.right); } return {left:+l.toFixed(1), right:+r.toFixed(1)}; },
  handleHit(dir){ const h=document.querySelector('.hit-handle[data-handle="'+dir+'"]'); if(!h) return null; const b=h.getBoundingClientRect(); return {w:+b.width.toFixed(1), h:+b.height.toFixed(1), cx:+(b.x+b.width/2).toFixed(1), cy:+(b.y+b.height/2).toFixed(1)}; },
  rzHandle(dir){ const h=document.querySelector('.rz-handle[data-handle="'+dir+'"]'); if(!h) return null; const b=h.getBoundingClientRect(); return {w:+b.width.toFixed(2), h:+b.height.toFixed(2), cx:+(b.x+b.width/2).toFixed(1), cy:+(b.y+b.height/2).toFixed(1)}; },
  addBtn(){ const z=document.querySelector('.sec-add-zone .sec-add-btn'); const hit=document.querySelector('.sec-add-zone .sec-add-hit'); const r=z?z.getBoundingClientRect():null; const h=hit?hit.getBoundingClientRect():null; return {btnW:r?+r.width.toFixed(1):null, btnH:r?+r.height.toFixed(1):null, btnLeft:r?+r.left.toFixed(1):null, btnRight:r?+r.right.toFixed(1):null, hitW:h?+h.width.toFixed(1):null, hitH:h?+h.height.toFixed(1):null}; },
  fmenuBox(){ const m=document.getElementById('fmenu'); if(!m||!m.classList.contains('on')) return null; const r=m.getBoundingClientRect(); const btn=m.querySelector('button'); const br=btn?btn.getBoundingClientRect():null; return {left:+r.left.toFixed(1), right:+r.right.toFixed(1), top:+r.top.toFixed(1), bottom:+r.bottom.toFixed(1), btnW:br?+br.width.toFixed(1):null, btnH:br?+br.height.toFixed(1):null}; },
};
"""

async def mk_ctx(b, w, url):
    ctx = await b.new_context(viewport={'width': w, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(e.message))
    cdp = await ctx.new_cdp_session(pg)
    await pg.goto(url)
    await pg.wait_for_timeout(1100)
    await pg.evaluate(HELPERS)
    return ctx, pg, cdp, errs

async def vvo(pg):
    return await pg.evaluate("[visualViewport.offsetLeft,visualViewport.offsetTop]")

async def touch(pg, cdp, kind, pts):
    o = await vvo(pg)
    await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x - o[0], 'y': y - o[1], 'id': i} for (i, x, y) in pts]})

async def tap(pg, cdp, x, y, hold=60):
    await touch(pg, cdp, 'touchStart', [(0, x, y)]); await pg.wait_for_timeout(hold)
    await touch(pg, cdp, 'touchEnd', []); await pg.wait_for_timeout(130)

async def dtap(pg, cdp, x, y):
    # DTAP_MS=300 以内に2回。padの入った tap() を使うと 300 を超えて単タップ扱いになるので専用に短く打つ。
    for _ in range(2):
        await touch(pg, cdp, 'touchStart', [(0, x, y)]); await pg.wait_for_timeout(40)
        await touch(pg, cdp, 'touchEnd', []); await pg.wait_for_timeout(90)
    await pg.wait_for_timeout(220)

async def lp(pg, cdp, x, y, ms=700, lift=True):
    await touch(pg, cdp, 'touchStart', [(0, x, y)]); await pg.wait_for_timeout(ms)
    if lift:
        await touch(pg, cdp, 'touchEnd', []); await pg.wait_for_timeout(180)

async def swipe(pg, cdp, x, y, dx, dy, start=True, end=True, step=10):
    n = max(1, int(math.hypot(dx, dy) / step))
    if start:
        await touch(pg, cdp, 'touchStart', [(0, x, y)]); await pg.wait_for_timeout(40)
    for k in range(1, n + 1):
        await touch(pg, cdp, 'touchMove', [(0, x + dx * k / n, y + dy * k / n)]); await pg.wait_for_timeout(16)
    if end:
        await touch(pg, cdp, 'touchEnd', []); await pg.wait_for_timeout(250)

async def info(pg):
    return await pg.evaluate(f"({{sc:{P}.getScale(),mode:{P}.scaleMode(),im:{P}.inputMode()}})")

async def center(pg, id):
    await pg.evaluate(f"(()=>{{const e=document.querySelector('[data-el=\"{id}\"]');if(e)e.scrollIntoView({{block:'center'}})}})()")
    await pg.wait_for_timeout(200)

async def rect(pg, id):
    return await pg.evaluate(f"(()=>{{const e=document.querySelector('[data-el=\"{id}\"]');if(!e)return null;const r=e.getBoundingClientRect();return {{x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,bottom:r.bottom,right:r.right}}}})()")

# ================= 区画 =================
async def group_geom(b):
    # W1〜W4・W14（7幅×A/B の測定）。390 を基準にする。
    for mode, url in (('A', URL_A), ('B', URL_B)):
        base_geo = None; base_lines = None
        for w in WIDTHS:
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            inf = await info(pg)
            edges = await pg.evaluate("window.__wh.pageEdges()")
            sw = await pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            draft_empty = await pg.evaluate(f"(()=>{{const d={P}.draft();return !d || (Array.isArray(d.ops)? d.ops.length===0 : (d.content? Object.keys(d).length===0 : true))}})()")
            # W1
            emit(f'W1 {mode} {w}', scale=round(inf['sc'], 4), mode=inf['mode'], im=inf['im'],
                 left=edges['left'], right=edges['right'], scrollW=sw[0], innerW=sw[1],
                 xscroll=(sw[0] > sw[1] + 0.5), draftEmpty=draft_empty, err=('|'.join(errs) or '-'))
            # geometry for W2
            geo = await pg.evaluate(f"{P}.geometry()")
            if w == BASE_W:
                base_geo = geo
            # W3 lines per text box
            boxes = await pg.evaluate("window.__wh.textBoxes()")
            lines = {}
            for bx in boxes:
                lines[bx] = await pg.evaluate(f"window.__wh.lines('{bx}')")
            if w == BASE_W:
                base_lines = lines
            # W4 min font
            mf = await pg.evaluate("window.__wh.minFont()")
            emit(f'W4 {mode} {w}', who=mf['who'], rawFont=mf['rawFont'], scale=mf['scale'], screenEst=mf['screenEst'], charRectH=mf['charRectH'])
            # stash for later diff (store on page close-safe python side)
            await ctx.close()
            # diff vs base (computed after we have base; base is 390 which is 4th in list, so defer)
            group_geom._cache.setdefault(mode, {})[w] = {'geo': geo, 'lines': lines}
        # now compute W2/W3 diffs vs 390
        base = group_geom._cache[mode].get(BASE_W)
        if base:
            for w in WIDTHS:
                cur = group_geom._cache[mode][w]
                # W2 max geom diff
                md = 0.0; worst = None
                for k, e in cur['geo'].items():
                    be = base['geo'].get(k)
                    if not be:
                        continue
                    for a in ('x', 'y', 'w', 'h'):
                        if a in e and a in be and e[a] is not None and be[a] is not None:
                            d = abs(e[a] - be[a])
                            if d > md:
                                md = d; worst = f'{k}.{a}'
                emit(f'W2 {mode} {w}', maxdiff=round(md, 3), worst=worst)
                # W3 wrapping diff
                diffb = []
                for bx, ln in cur['lines'].items():
                    bl = base['lines'].get(bx)
                    if ln and bl and (ln['n'] != bl['n'] or ln['firsts'] != bl['firsts']):
                        diffb.append(f"{bx}(n{bl['n']}->{ln['n']})")
                emit(f'W3 {mode} {w}', wrapDiffBoxes=('|'.join(diffb) if diffb else 'none'), boxCount=len(cur['lines']))
    # W14 preview at each width (shape/scale same as edit?)
    for mode, url in (('A', URL_A), ('B', URL_B)):
        for w in WIDTHS:
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            sc_edit = (await info(pg))['sc']
            # enter preview via API
            try:
                await pg.evaluate(f"{P}.enterPreview && {P}.enterPreview()")
            except Exception:
                pass
            await pg.wait_for_timeout(400)
            sc_prev = await pg.evaluate(f"{P}.getScale()")
            edges = await pg.evaluate("window.__wh.pageEdges()")
            sw = await pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            emit(f'W14 {mode} {w}', scaleEdit=round(sc_edit, 4), scalePreview=round(sc_prev, 4),
                 same=(abs(sc_edit - sc_prev) < 1e-3), left=edges['left'], right=edges['right'],
                 xscroll=(sw[0] > sw[1] + 0.5), err=('|'.join(errs) or '-'))
            await ctx.close()
group_geom._cache = {}

async def group_edit(b):
    # W5 W6 W7 W13（360/430・A/B）
    for mode, url in (('A', URL_A), ('B', URL_B)):
        for w in EDIT_W:
            # ---- W5：F_b0 の10文字目をタップして書き換えに入る → カーソル位置 ----
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            await center(pg, 'F_b0')
            cr = await pg.evaluate("window.__wh.charRect('F_b0',9)")  # 10文字目（0始まり9）
            caret = None; seltxt = None; ime = None
            if cr:
                await dtap(pg, cdp, cr['cx'], cr['cy'])  # スマホはダブルタップで書き換えに入る
                editing = await pg.evaluate("!!document.querySelector('[contenteditable=true]')")
                caret = await pg.evaluate("window.__wh.caretIdx()")
                # 合成タッチでは native の文字カーソルがタップ位置に入らない（常に末尾）＝harness の制約。
                # 倍率ごとの「画面px→文字」の対応は、ブラウザ自身のヒットテスト caretRangeFromPoint で測る（9〜11 なら合っている）。
                caret_at_point = await pg.evaluate("""([x,y])=>{const el=document.querySelector('[contenteditable=true]');if(!el)return null;const rng=document.caretRangeFromPoint(x,y);if(!rng)return 'null(hit-test失敗)';const pre=rng.cloneRange();pre.selectNodeContents(el);try{pre.setEnd(rng.startContainer,rng.startOffset)}catch(e){return 'err'}return pre.toString().length}""", [cr['cx'], cr['cy']])
                emit(f'W5 {mode} {w}', charCx=round(cr['cx'], 1), charCy=round(cr['cy'], 1), editing=editing,
                     caretAfterDbltap=caret, caretAtTapPoint=caret_at_point,
                     note='合成タッチはnativeカーソルを動かさず末尾=textLen。倍率の当たりはcaretAtTapPoint(=caretRangeFromPoint)で判定')
                # ---- W6：5〜12文字目を指でなぞって選ぶ ----
                c5 = await pg.evaluate("window.__wh.charRect('F_b0',5)")
                c12 = await pg.evaluate("window.__wh.charRect('F_b0',12)")
                touch_sel = ''
                if c5 and c12:
                    await touch(pg, cdp, 'touchStart', [(0, c5['left'], c5['cy'])]); await pg.wait_for_timeout(60)
                    steps = 8
                    for k in range(1, steps + 1):
                        x = c5['left'] + (c12['right'] - c5['left']) * k / steps
                        await touch(pg, cdp, 'touchMove', [(0, x, c5['cy'])]); await pg.wait_for_timeout(20)
                    await touch(pg, cdp, 'touchEnd', []); await pg.wait_for_timeout(150)
                    touch_sel = await pg.evaluate("getSelection().toString()")
                # 幾何チェック（指で選べない harness でも倍率ずれは見える）：範囲[5,12)をRangeで作り、選択の四角と文字の四角が重なるか
                geo = await pg.evaluate("""(()=>{const el=document.querySelector('[contenteditable=true]')||document.querySelector('[data-el="F_b0"]');if(!el)return null;const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,c=0,s=null,e=null;const want=[5,12];while(n=w.nextNode()){const L=n.nodeValue.length;if(s===null&&want[0]<c+L){s=[n,want[0]-c];}if(e===null&&want[1]<=c+L){e=[n,want[1]-c];}c+=L;}if(!s||!e)return null;const r=document.createRange();r.setStart(s[0],s[1]);r.setEnd(e[0],e[1]);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);const sb=r.getBoundingClientRect();const c5=window.__wh.charRect('F_b0',5),c11=window.__wh.charRect('F_b0',11);const overlap=c5&&c11&&sb.left<=c5.cx&&sb.right>=c11.cx&&sb.top<=c5.cy&&sb.bottom>=c5.cy;return {selRect:[+sb.left.toFixed(1),+sb.top.toFixed(1),+sb.width.toFixed(1),+sb.height.toFixed(1)],selText:sel.toString(),overlap:!!overlap}})()""")
                emit(f'W6 {mode} {w}', touchSel=repr(touch_sel), rangeSel=(repr(geo['selText']) if geo else None), selRect=(geo['selRect'] if geo else None), rectOverlapsChars=(geo['overlap'] if geo else None))
                # ---- W7：IME 変換「きせつ」→「季節」。書き換え位置を10文字目のカーソルに戻してから。 ----
                await pg.evaluate("""(()=>{const el=document.querySelector('[contenteditable=true]');if(!el)return;el.focus();const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,c=0;while(n=w.nextNode()){const L=n.nodeValue.length;if(10<=c+L){const r=document.createRange();r.setStart(n,10-c);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);return;}c+=L;}})()""")
                await pg.wait_for_timeout(80)
                len0 = await pg.evaluate("window.__wh.textLen('F_b0')")
                caret_before = await pg.evaluate("window.__wh.caretIdx()")
                # カーソル位置の画面座標（変換中の四角がここに来るはず）
                caret_scr = await pg.evaluate("(()=>{const s=getSelection();if(!s.rangeCount)return null;const b=s.getRangeAt(0).getBoundingClientRect();return [+b.left.toFixed(1),+b.top.toFixed(1)]})()")
                try:
                    await cdp.send('Input.imeSetComposition', {'text': 'きせつ', 'selectionStart': 3, 'selectionEnd': 3})
                    await pg.wait_for_timeout(130)
                    len_comp = await pg.evaluate("window.__wh.textLen('F_b0')")
                    # 変換中の「きせつ」の始まり（offset10）の画面座標＝変換前のカーソル位置と一致するはず
                    comp_rect = await pg.evaluate("(()=>{const cr=window.__wh.charRect('F_b0',10);return cr?[+cr.left.toFixed(1),+cr.top.toFixed(1)]:null})()")
                    await cdp.send('Input.insertText', {'text': '季節'})
                    await pg.wait_for_timeout(150)
                    len1 = await pg.evaluate("window.__wh.textLen('F_b0')")
                    caret_after = await pg.evaluate("window.__wh.caretIdx()")
                    char_at10 = await pg.evaluate("(()=>{const e=document.querySelector('[data-el=\"F_b0\"]');return e?e.textContent.slice(10,12):''})()")
                    # 変換中の四角が、変換前のカーソル位置の近く（画面px）にあるか
                    near = None
                    if caret_scr and comp_rect:
                        near = (abs(comp_rect[0] - caret_scr[0]) < 12 and abs(comp_rect[1] - caret_scr[1]) < 12)
                    ime = {'caretBefore': caret_before, 'caretScreen': caret_scr, 'compRect': comp_rect, 'compNearCaret': near,
                           'lenComp': f'{len0}->{len_comp}', 'lenInsert': f'{len_comp}->{len1}', 'caretAfter': caret_after, 'charAt10_12': repr(char_at10)}
                except Exception as ex:
                    ime = {'error': str(ex)}
                emit(f'W7 {mode} {w}', **{k: v for k, v in (ime or {}).items()})
            else:
                emit(f'W5 {mode} {w}', note='F_b0 char9 rect not found')
            await ctx.close()

            # ---- W13：書き換え中/選択中に幅を 360→430 に変える → 状態が保たれるか ----
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            await center(pg, 'F_b0')
            cr = await pg.evaluate("window.__wh.charRect('F_b0',9)")
            if cr:
                await dtap(pg, cdp, cr['cx'], cr['cy'])
                ed0 = await pg.evaluate("!!document.querySelector('[contenteditable=true]')")
                caret0 = await pg.evaluate("window.__wh.caretIdx()")
                newW = 430 if w == 360 else 360
                await pg.set_viewport_size({'width': newW, 'height': 844})
                await pg.wait_for_timeout(500)
                ed1 = await pg.evaluate("!!document.querySelector('[contenteditable=true]')")
                caret1 = await pg.evaluate("window.__wh.caretIdx()")
                sc1 = await pg.evaluate(f"{P}.getScale()")
                emit(f'W13 {mode} {w}->{newW}', editingBefore=ed0, editingAfter=ed1, caretBefore=caret0, caretAfter=caret1, scaleAfter=round(sc1, 4), err=('|'.join(errs) or '-'))
            await ctx.close()
        # W13 selection-preserved variant (part selected, not editing)
        for w in EDIT_W:
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            await center(pg, 'F_h0')
            r = await rect(pg, 'F_h0')
            if r:
                await tap(pg, cdp, r['cx'], r['cy'])
                sel0 = await pg.evaluate("[...document.querySelectorAll('.mark-sel')].map(e=>e.getAttribute('data-el'))")
                newW = 430 if w == 360 else 360
                await pg.set_viewport_size({'width': newW, 'height': 844}); await pg.wait_for_timeout(500)
                sel1 = await pg.evaluate("[...document.querySelectorAll('.mark-sel')].map(e=>e.getAttribute('data-el'))")
                emit(f'W13sel {mode} {w}->{newW}', selBefore=sel0, selAfter=sel1, err=('|'.join(errs) or '-'))
            await ctx.close()

async def group_manip(b):
    for mode, url in (('A', URL_A), ('B', URL_B)):
        for w in EDIT_W:
            sc = None
            # ---- W8：F_h0 を選んで、画面上で右へ40・下へ20 ----
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            sc = (await info(pg))['sc']
            await center(pg, 'F_h0')
            g0 = await pg.evaluate(f"{P}.geometry()['F_h0']")
            r = await rect(pg, 'F_h0')
            if r and g0:
                await lp(pg, cdp, r['cx'], r['cy'], ms=650, lift=False)  # 長押しで掴んでから
                await swipe(pg, cdp, r['cx'], r['cy'], 40, 20, start=False)
                g1 = await pg.evaluate(f"{P}.geometry()['F_h0']")
                r1 = await rect(pg, 'F_h0')
                emit(f'W8 {mode} {w}', scale=round(sc, 4),
                     dataDX=round(g1['x'] - g0['x'], 2), dataDY=round(g1['y'] - g0['y'], 2),
                     expectDX=round(40 / sc, 2), expectDY=round(20 / sc, 2),
                     screenGapX=(round(r1['cx'] - (r['cx'] + 40), 1) if r1 else None),
                     screenGapY=(round(r1['cy'] - (r['cy'] + 20), 1) if r1 else None))
            await ctx.close()

            # ---- W9：F_p0 の右下(se)つまみを画面上で右へ30（作業票どおり）。F_p0 は縦横比固定で最大サイズなので右へは広がらない＝クランプ(0)が正しい。
            #       倍率ごとの「大きさ変えの画面px→データ」の対応を見るため、se を内側へ30（縮める）も測る。つまみの押せる範囲44・見た目も出す。
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            sc = (await info(pg))['sc']
            await center(pg, 'F_p0')
            rp = await rect(pg, 'F_p0')
            if rp:
                await tap(pg, cdp, rp['cx'], rp['cy'])
                await pg.wait_for_timeout(200)
                g0 = await pg.evaluate(f"{P}.geometry()['F_p0']")
                hit = await pg.evaluate("window.__wh.handleHit('se')")
                rz = await pg.evaluate("window.__wh.rzHandle('se')")
                if hit:
                    # (a) 右へ30（作業票どおり）
                    await swipe(pg, cdp, hit['cx'], hit['cy'], 30, 0)
                    g1 = await pg.evaluate(f"{P}.geometry()['F_p0']")
                    # (b) 内側（左上）へ30＝縮める。倍率の当たりを見る
                    await center(pg, 'F_p0')
                    rp2 = await rect(pg, 'F_p0')
                    await tap(pg, cdp, rp2['cx'], rp2['cy']); await pg.wait_for_timeout(150)
                    g0s = await pg.evaluate(f"{P}.geometry()['F_p0']")
                    hit2 = await pg.evaluate("window.__wh.handleHit('se')")
                    if hit2:
                        await swipe(pg, cdp, hit2['cx'], hit2['cy'], -30, -30)
                        g2 = await pg.evaluate(f"{P}.geometry()['F_p0']")
                        shrinkDW = round(g2['w'] - g0s['w'], 2)
                    else:
                        shrinkDW = None
                    emit(f'W9 {mode} {w}', scale=round(sc, 4),
                         rightDW=round(g1['w'] - g0['w'], 2), rightNote='F_p0最大→右は0=正しくクランプ',
                         shrinkDW=shrinkDW, shrinkExpectDW=round(-30 / sc, 2),
                         hitW=hit['w'], hitH=hit['h'], rzVisualW=(rz['w'] if rz else None))
                else:
                    emit(f'W9 {mode} {w}', note='se hit-handle not found', rz=rz)
            await ctx.close()

            # ---- W10：本文を写真の下の縁から画面上6の所へ動かす → 吸い付いたか ----
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            sc = (await info(pg))['sc']
            await center(pg, 'F_p0')
            rp = await rect(pg, 'F_p0')
            rb = await rect(pg, 'F_b0')
            if rp and rb:
                # 本文の上端を、写真の下端+6（画面px）に合わせるだけ動かす
                target_top = rp['bottom'] + 6
                dy = target_top - rb['y']
                await lp(pg, cdp, rb['cx'], rb['cy'], ms=650, lift=False)
                await swipe(pg, cdp, rb['cx'], rb['cy'], 0, dy, start=False)
                rb1 = await rect(pg, 'F_b0')
                gap = (rb1['y'] - rp['bottom']) if rb1 else None
                guides = await pg.evaluate("document.querySelectorAll('.snap-guide').length")
                emit(f'W10 {mode} {w}', scale=round(sc, 4), aimGapScreen=6,
                     resultGapScreen=(round(gap, 1) if gap is not None else None), snapGuides=guides)
            await ctx.close()

            # ---- W11：長押しで箱／境目の＋ ----
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            await center(pg, 'F_h0')
            r = await rect(pg, 'F_h0')
            if r:
                await lp(pg, cdp, r['cx'], r['cy'], ms=720)
                fm = await pg.evaluate("window.__wh.fmenuBox()")
                addb = await pg.evaluate("window.__wh.addBtn()")
                emit(f'W11 {mode} {w}', fmenu=fm, fmenuInScreen=((fm['left'] >= -0.5 and fm['right'] <= w + 0.5) if fm else None),
                     addBtnW=(addb['btnW'] if addb else None), addHitW=(addb['hitW'] if addb else None),
                     addInScreen=((addb['btnLeft'] >= -0.5 and addb['btnRight'] <= w + 0.5) if (addb and addb['btnLeft'] is not None) else None))
            await ctx.close()

async def group_rt(b):
    # W12：360で直す→430に変える→390で開き直す。位置・大きさ・draft が同じか
    for mode, url in (('A', URL_A), ('B', URL_B)):
        ctx, pg, cdp, errs = await mk_ctx(b, 360, url)
        await center(pg, 'F_h0')
        r = await rect(pg, 'F_h0')
        await lp(pg, cdp, r['cx'], r['cy'], ms=650, lift=False)
        await swipe(pg, cdp, r['cx'], r['cy'], 30, 30, start=False)
        g_360 = await pg.evaluate(f"{P}.geometry()")
        draft_360 = await pg.evaluate(f"JSON.stringify({P}.draft())")
        await pg.set_viewport_size({'width': 430, 'height': 844}); await pg.wait_for_timeout(500)
        g_430 = await pg.evaluate(f"{P}.geometry()")
        draft_430 = await pg.evaluate(f"JSON.stringify({P}.draft())")
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(500)
        g_390 = await pg.evaluate(f"{P}.geometry()")
        draft_390 = await pg.evaluate(f"JSON.stringify({P}.draft())")
        # max geom diff across the three
        md = 0.0; worst = None
        for k in g_360:
            for a in ('x', 'y', 'w', 'h'):
                vals = [g.get(k, {}).get(a) for g in (g_360, g_430, g_390)]
                vals = [v for v in vals if v is not None]
                if len(vals) >= 2:
                    d = max(vals) - min(vals)
                    if d > md:
                        md = d; worst = f'{k}.{a}'
        emit(f'W12 {mode}', maxGeomDiff=round(md, 3), worst=worst,
             draftSame=(draft_360 == draft_430 == draft_390),
             draft360eq430=(draft_360 == draft_430), draft430eq390=(draft_430 == draft_390),
             err=('|'.join(errs) or '-'))
        await ctx.close()

async def group_shots(b):
    # W15：各幅で、ページの上の方・品の並び・表の3か所を撮る
    places = [('top', 'F_hg'), ('items', 'I_cards'), ('table', 'I_table')]
    for mode, url in (('A', URL_A), ('B', URL_B)):
        for w in WIDTHS:
            ctx, pg, cdp, errs = await mk_ctx(b, w, url)
            for label, anchor in places:
                try:
                    await center(pg, anchor)
                    out = os.path.join(OUTDIR, f'{w}_{mode}_{label}.png')
                    await pg.screenshot(path=out)
                except Exception as ex:
                    emit(f'W15 {mode} {w} {label}', error=str(ex))
            emit(f'W15 {mode} {w}', saved='top|items|table', dir=OUTDIR, err=('|'.join(errs) or '-'))
            await ctx.close()

GROUPS = {'geom': group_geom, 'edit': group_edit, 'manip': group_manip, 'rt': group_rt, 'shots': group_shots}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        if ONLY == 'all':
            for name in ('geom', 'edit', 'manip', 'rt', 'shots'):
                print(f'===== {name} =====', flush=True)
                await GROUPS[name](b)
        elif ONLY in GROUPS:
            print(f'===== {ONLY} =====', flush=True)
            await GROUPS[ONLY](b)
        else:
            print(f'unknown ONLY={ONLY}; choose from {list(GROUPS)} or all');
        await b.close()

asyncio.run(main())
