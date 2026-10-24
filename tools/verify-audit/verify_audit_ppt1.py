# -*- coding: utf-8 -*-
"""回帰の確認：PowerPoint にそろえる P1〜P15（area = ppt1。PC・マウスが対象。スマホは対象外）

使い方: python3 verify_audit_ppt1.py /path/to/playgroundNN_single.html [ID ...]
  ID を並べるとその項目だけ（例: P2 P12）。省略で全部。
出力: 1項目1行 `OK P3 | 説明` / `NG P3 | 実際の値`。最後に `合計 OK x / NG y（n秒）`。終了コード＝NG の数。

担当: P1 P2 P3 P4 P5 P6 P7 P8 P9 P10 P11 P12 P13 P14 P15（作業票29 §5.2 の表の文が合格の条件）

判定の決まり（TESTBRIEF2.md）
- 本物のマウス・キーボードで操作する。window.__playground は状態を読む（selected・editingId・textStyles・
  textRuns・elementLink・handlesFor）のと、準備（setPage でお品書き・アクセスのページへ移る）にだけ使う。
- Cmd の操作は MOD で送る（Mac は Meta、ほかは Control）。Option は Alt、Shift は Shift。
- 準備（選んだ・書き換えに入った・カーソルがその所にある・つまみがある・ドラッグで本当に動いた）が
  成り立たなければ `NG <ID> | 準備失敗：…` にする（空振りの合格を作らない）。
- 道具（ボタン）は文字・title・aria-label・data 属性の複数の候補で探す。見つからなければ NG（その道具がない）。
- 「選んでいない箱」「選んだ箱（書き換えていない）」「書き換え中の箱」で動きが違うので、状態ごとに準備を確かめる。
  押して離す（動き 3px 未満）とドラッグは分けて送る。
- 文字の見た目（太字・斜体・下線・大きさ・揃え）は、書き換えを終えて描き直された後の表示（computed style）で
  判定する（書き換え中の contenteditable にブラウザが付けた見た目だけで合格にしない）。
- 1項目ごとに browser context を作り直す。1項目 120 秒で打ち切り、例外は NG。
- このファイルは自分の中だけで完結させた（他の担当のファイルに触らない）。試験用の画像は使わない（P1 はページの写真 F_p0 を使う）。
"""
import asyncio, io, json, math, os, re, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
P = 'window.__playground'
OUT = 1420, 990          # 何もない所（右下の余白）
MOD = 'Meta' if sys.platform == 'darwin' else 'Control'

# ---------------------------------------------------------------- 共通の小道具
def hook(pg):
    pg._e = []; pg._dlg = []
    pg.on('pageerror', lambda e: pg._e.append('PE ' + str(e)))
    pg.on('dialog', lambda d: (pg._dlg.append(d.type + ' ' + d.message), asyncio.ensure_future(d.dismiss())))

async def fresh(br, url, w=1440, h=1000):
    ctx = await br.new_context(viewport={'width': w, 'height': h})
    # Google Fonts を止め、Mac でも Linux でも同じ代わりの書体で測る（字の寸法で px の閾値がずれないように）
    await ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/'), lambda route: route.abort())
    pg = await ctx.new_page(); hook(pg)
    await pg.goto(url); await pg.wait_for_timeout(1500)
    return pg

async def scrollto(pg, id):
    await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(e)e.scrollIntoView({block:'center'})}", id)
    await pg.wait_for_timeout(250)

async def vb(pg, id):
    return await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const r=e.getBoundingClientRect();if(r.width==0&&r.height==0)return null;return {x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom,py:r.y+scrollY}}", id)

async def out(pg):
    await pg.mouse.click(*OUT); await pg.wait_for_timeout(450)

async def sel(pg): return await pg.evaluate(f"{P}.selected()")
async def ids(pg): return await pg.evaluate("[...document.querySelectorAll('[data-el]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0||r.height>0}).map(e=>e.dataset.el)")
async def textof(pg, id): return await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');return e?e.textContent:null}", id)

async def state(pg, id=None):
    """選択・書き換え中の id・書き換え中の要素が本当に打てる状態か（contenteditable）"""
    return await pg.evaluate("""([P,id])=>{const a=window.__playground;const ed=a.editingId();const n=ed&&document.querySelector('[data-el="'+ed+'"]');
      return {sel:a.selected(),ed:ed||null,ce:!!(n&&n.isContentEditable),focus:!!(n&&(document.activeElement===n||n.contains(document.activeElement)))}}""", [P, id])

def is_editing(st, id): return st['ed'] == id and st['ce']
def is_selected_only(st, id): return st['sel'] == [id] and not st['ed']

CHAR = """([id,k])=>{const el=document.querySelector('[data-el="'+id+'"]');if(!el)return null;const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,c=0;
  while(n=w.nextNode()){const L=n.nodeValue.length;if(k<c+L){const r=document.createRange();r.setStart(n,k-c);r.setEnd(n,k-c+1);const q=[...r.getClientRects()].find(q=>q.width>0)||r.getBoundingClientRect();
    return {x:q.x,y:q.y,w:q.width,h:q.height,ch:n.nodeValue[k-c]}}c+=L}return null}"""
async def char(pg, id, k): return await pg.evaluate(CHAR, [id, k])

SELINFO = """id=>{const el=document.querySelector('[data-el="'+id+'"]');const s=getSelection();const full=el?el.textContent:null;
  if(!el||!s.rangeCount)return {in:false,full};const a=s.anchorNode,f=s.focusNode;
  if(!el.contains(a)||!el.contains(f))return {in:false,text:s.toString(),full};
  const off=(node,o)=>{const r=document.createRange();r.setStart(el,0);r.setEnd(node,o);return r.toString().length};
  const x=off(a,s.anchorOffset),y=off(f,s.focusOffset);return {in:true,start:Math.min(x,y),end:Math.max(x,y),text:s.toString(),full,collapsed:s.isCollapsed}}"""
async def selinfo(pg, id): return await pg.evaluate(SELINFO, id)

CARETAT = """([id,x,y])=>{const el=document.querySelector('[data-el="'+id+'"]');const c=document.caretRangeFromPoint(x,y);
  if(!el||!c||!el.contains(c.startContainer))return null;const r=document.createRange();r.setStart(el,0);r.setEnd(c.startContainer,c.startOffset);return r.toString().length}"""
async def caret_at(pg, id, x, y): return await pg.evaluate(CARETAT, [id, x, y])

async def boundary(pg, id, k):
    """k 文字目の前（k-1 と k の間）を指す点。k 文字目の左端から 1px 右・縦は真ん中"""
    c = await char(pg, id, k)
    return (c['x'] + 1, c['y'] + c['h'] / 2) if c else None

async def charcenter(pg, id, k):
    c = await char(pg, id, k)
    return (c['x'] + c['w'] / 2, c['y'] + c['h'] / 2) if c else None

async def press_release(pg, pt, jitter=2, mods=()):
    """押して離す。間で jitter px だけ動かす（3px 未満の動きはクリックの扱い）"""
    for m in mods: await pg.keyboard.down(m)
    await pg.mouse.move(*pt); await pg.mouse.down()
    if jitter: await pg.mouse.move(pt[0] + jitter, pt[1], steps=2)
    await pg.mouse.up()
    for m in mods: await pg.keyboard.up(m)
    await pg.wait_for_timeout(450)

async def mdrag(pg, a, b, steps=15, mods=(), hold=0):
    for m in mods: await pg.keyboard.down(m)
    await pg.mouse.move(*a); await pg.mouse.down(); await pg.mouse.move(*b, steps=steps)
    if hold: await pg.wait_for_timeout(hold)
    await pg.mouse.up()
    for m in mods: await pg.keyboard.up(m)
    await pg.wait_for_timeout(500)

def r1(v): return round(v, 1) if isinstance(v, (int, float)) else v

# ---------------------------------------------------------------- 状態の準備（準備が成り立たなければ理由の文を返す）
async def prep_unselected(pg, id):
    await scrollto(pg, id)
    st = await state(pg)
    if st['sel'] or st['ed']: return f'準備失敗：最初から選択 {st}'
    if await vb(pg, id) is None: return f'準備失敗：{id} が見えない'
    return None

async def prep_selected(pg, id, k=2):
    """選んだ箱（書き換えていない）にする。クリック→（書き換えに入ったら）Esc→だめなら枠を押す"""
    await scrollto(pg, id)
    pt = await charcenter(pg, id, k)
    if not pt: return f'準備失敗：{id} の文字が無い'
    await press_release(pg, pt, jitter=0)
    st = await state(pg)
    if is_selected_only(st, id): return None
    if st['ed'] == id:
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(350)
        st = await state(pg)
        if is_selected_only(st, id): return None
    r = await vb(pg, id)
    for pt in [(r['x'] + r['w'] * 0.3, r['y'] - 2), (r['x'] + r['w'] * 0.3, r['y'] + 2), (r['x'] + r['w'] * 0.3, r['b'] - 2)]:
        await press_release(pg, pt, jitter=0)
        st = await state(pg)
        if is_selected_only(st, id): return None
        if st['ed']:
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    return f'準備失敗：{id} を「選んだだけ（書き換えていない）」にできない {st}'

async def prep_editing(pg, id, k):
    """書き換え中にして、カーソルを k 文字目の前に置く（その所を押す）。置けたかを確かめる"""
    await scrollto(pg, id)
    pt = await charcenter(pg, id, k)
    if not pt: return f'準備失敗：{id} の文字が無い'
    await pg.mouse.dblclick(*pt); await pg.wait_for_timeout(500)
    st = await state(pg)
    if not is_editing(st, id):
        await press_release(pg, pt, jitter=0); st = await state(pg)
    if not is_editing(st, id): return f'準備失敗：{id} の書き換えに入れない {st}'
    bp = await boundary(pg, id, k)
    await press_release(pg, bp, jitter=0)
    st = await state(pg); si = await selinfo(pg, id)
    if not is_editing(st, id) or not si.get('in') or not si.get('collapsed') or abs(si['start'] - k) > 1:
        return f'準備失敗：書き換え中にカーソルを {k} 文字目に置けない 状態={st} 選択={si}'
    return None

# ---------------------------------------------------------------- 道具の並び
BTNS = """(()=>{const vis=e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>0&&r.height>0&&c.visibility!='hidden'&&c.display!='none'};
  return [...document.querySelectorAll('button,[role=button],[role=menuitem],[role=menuitemradio],[role=option]')].filter(vis).map((b,i)=>{b.dataset.__p1=i;const r=b.getBoundingClientRect();
    return {i,lab:[b.textContent,b.title,b.getAttribute('aria-label'),...Object.entries(b.dataset).filter(([k])=>k!='__p1').map(([k,v])=>k+'='+v)].join(' ').replace(/\\s+/g,' ').trim(),
      dis:!!(b.disabled||b.getAttribute('aria-disabled')==='true'),tb:!!b.closest('#toolbar'),x:r.x+r.width/2,y:r.y+r.height/2,
      on:b.classList.contains('on')||b.classList.contains('active')||b.classList.contains('pressed')||b.classList.contains('is-on')||b.classList.contains('is-active')||b.getAttribute('aria-pressed')==='true'||b.getAttribute('aria-checked')==='true'}})})()"""
async def buttons(pg): return await pg.evaluate(BTNS)

async def find_btn(pg, pat, tb_only=False, enabled=True):
    import re
    for b in await buttons(pg):
        if tb_only and not b['tb']: continue
        if enabled and b['dis']: continue
        if re.search(pat, b['lab']): return b
    return None

async def size_input(pg):
    """大きさの欄（data-ts=size、なければ「大きく」「小さく」の間の数字の欄）"""
    return await pg.evaluate("""(()=>{const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!='hidden'};
      let i=[...document.querySelectorAll('#toolbar input[data-ts=size],#toolbar input[aria-label*=大きさ],#toolbar input[title*=大きさ]')].find(vis);
      if(!i)i=[...document.querySelectorAll('#toolbar input')].find(e=>vis(e)&&(e.inputMode=='numeric'||e.inputMode=='decimal'||/^\\d*\\.?\\d*$/.test(e.value)));
      if(!i)return null;const r=i.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,v:i.value}})()""")

async def bold_btn(pg): return await find_btn(pg, r'(^| )B( |$)|太字|ts=bold|bold', tb_only=True, enabled=False)

async def style_at(pg, id, k):
    """描き直された表示の k 文字目の見た目"""
    return await pg.evaluate("""([id,k])=>{const el=document.querySelector('[data-el="'+id+'"]');const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,c=0;
      while(n=w.nextNode()){const L=n.nodeValue.length;if(k<c+L){let p=n.parentElement;const s=getComputedStyle(p);let u=false;for(let q=p;q;q=q.parentElement){if(getComputedStyle(q).textDecorationLine.includes('underline'))u=true;if(q===el)break}
        return {ch:n.nodeValue[k-c],w:parseInt(s.fontWeight),it:s.fontStyle,u,fs:parseFloat(s.fontSize),ff:s.fontFamily}}c+=L}return null}""", [id, k])

async def text_size(pg, id):
    v = await pg.evaluate(f"{P}.textStyles()")
    for x in v:
        if x.get('part') == id: return x.get('size')
    return None

def img_small(png, box=None):
    from PIL import Image
    im = Image.open(io.BytesIO(png)).convert('L')
    w, h = im.size
    im = im.crop((int(w * 0.12), int(h * 0.12), int(w * 0.88), int(h * 0.88)))   # 角のつまみ・枠の線を避ける
    return list(im.resize((24, 18)).tobytes())

def img_diff(a, b): return sum(abs(x - y) for x, y in zip(a, b)) / len(a)

async def shot(pg, r):
    return await pg.screenshot(clip={'x': r['x'], 'y': r['y'], 'width': r['w'], 'height': r['h']})

async def handle_pt(pg, h):
    return await pg.evaluate("h=>{const e=[...document.querySelectorAll('[data-handle=\"'+h+'\"]')].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0});if(!e)return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}", h)

# ================================================================ 項目
# ---- P1
# 作業票: 写真の角のつまみ：動かしている間も写真ごと同じ比で縮む・伸びる（見え方を保つ）。対角の角が止まる
#        （左上を引けば右下が止まる。上の辺が動くので付いていく間隔を書き換える）。記録と食い違う
# 再現: F_p0 をクリックで選ぶ → 左上のつまみ（data-handle=nw）を (+120,+88) へ押したまま動かす → 途中で見る → 離す。
#       別の context で右下（se）のつまみを (-120,-88) へも同じく。
# 合格: (左上) 途中も離した後も 右下の角が ±2px で止まる・縦横比が ±2% で保たれる・見え方（写真の中身を 24x18 に
#       縮めた明るさ）が始めと同じ（差 ≤ 10。試験台28 で見え方を保つ離した後は 4.5、切り抜きに変わる途中は 48）・下の写真 F_p1 が動かない（±2px）。
#       (右下) 途中も離した後も 左上の角が止まる・見え方が同じ。
# 準備の確かめ: F_p0 が選ばれている・つまみがある・途中で幅が 60px 以上縮んでいる（ドラッグが効いた）。
async def t_P1(br, url):
    msg = []; ok = True
    for h, d, fixed in [('nw', (120, 88), ('r', 'b')), ('se', (-120, -88), ('x', 'y'))]:
        pg = await fresh(br, url)
        try:
            await scrollto(pg, 'F_p0'); r0 = await vb(pg, 'F_p0')
            await press_release(pg, (r0['x'] + r0['w'] / 2, r0['y'] + r0['h'] / 2), jitter=0)
            if await sel(pg) != ['F_p0']: return False, f'準備失敗：F_p0 が選べない {await sel(pg)}'
            r0 = await vb(pg, 'F_p0'); p10 = await vb(pg, 'F_p1')
            img0 = img_small(await shot(pg, r0))
            hp = await handle_pt(pg, h)
            if not hp: return False, f'準備失敗：{h} のつまみが無い'
            await pg.mouse.move(*hp); await pg.mouse.down()
            await pg.mouse.move(hp[0] + d[0], hp[1] + d[1], steps=12); await pg.wait_for_timeout(250)
            rm = await vb(pg, 'F_p0'); imgm = img_small(await shot(pg, rm))
            await pg.mouse.up(); await pg.wait_for_timeout(600)
            ra = await vb(pg, 'F_p0'); imga = img_small(await shot(pg, ra)); p1a = await vb(pg, 'F_p1')
            if r0['w'] - rm['w'] < 60: ok = False; msg.append(f'{h}: 準備失敗：途中で縮まない 幅 {r1(r0["w"])}→{r1(rm["w"])}'); continue
            ratio0 = r0['w'] / r0['h']
            def chk(lbl, r, im):
                fx = all(abs(r[k] - r0[k]) <= 2 for k in fixed)
                rt = abs(r['w'] / r['h'] - ratio0) / ratio0 <= 0.02
                df = img_diff(img0, im)
                return fx and rt and df <= 10, f"{lbl} 角({','.join(fixed)}) {'止まる' if fx else '動く'} [{','.join(str(r1(r[k] - r0[k])) for k in fixed)}] 比 {r1(r['w'] / r['h'])}/{r1(ratio0)} 見え方の差 {r1(df)}"
            g1, m1 = chk('途中', rm, imgm); g2, m2 = chk('離した後', ra, imga)
            g3 = True; m3 = ''
            if h == 'nw':
                dy = p1a['py'] - p10['py'] if p1a and p10 else None
                g3 = dy is not None and abs(dy) <= 2; m3 = f' 下の写真 F_p1 縦 {r1(dy)}'
            ok &= g1 and g2 and g3; msg.append(f'{h}: {m1} / {m2}{m3}')
        finally: await pg.context.close()
    return ok, ' | '.join(msg)

# ---- P2
# 作業票: 選んでいない文字の箱：押して離す（3px 未満の動き）＝押した所にカーソルを置いて書き換え、押してドラッグ＝箱を動かす。
#        書き換え中の箱：中のドラッグは文字の選択、枠（選んだ印の線・つまみ以外の縁 6px）のドラッグで箱を動かす。
#        選んだ箱をもう一度押して離す＝その所にカーソル。記録 6.1・8.1 と食い違う
# 再現と合格（F_b0、すべて別の context）:
#  a 選んでいない箱の 10 文字目の前を押して 2px 動かして離す → 書き換え中（contenteditable）で、カーソルが押した所（±1 文字）
#  b 選んでいない箱を押して (60,40) ドラッグ → 箱が (60,40)±15 動き、書き換えに入らない（ドラッグで箱が動くことが壊れていない）
#  c 書き換え中の箱の中を 3 文字目の前から 15 文字目の前へドラッグ → 文字が選ばれ（3〜15 付近）、箱は動かない（±2px）
#  d 書き換え中の箱の枠（上の縁の外 2px・内 2px、下の縁の内外。つまみの無い所）を押して (50,30) ドラッグ → 箱が動く（どれか1点で）
#  e 選んだ箱（書き換えていない）の 20 文字目の前を押して離す → 書き換え中で、カーソルがその所（±1 文字）
# 準備の確かめ: a/b は最初に何も選ばれていない。c/d は書き換え中でカーソルが置けている。e は選んだだけの状態にできている。
#   押した点が箱の中の文字の上である（caretRangeFromPoint が押した所の文字の番号を返す）。
async def t_P2(br, url):
    id = 'F_b0'; msg = []; ok = True
    # a
    pg = await fresh(br, url)
    try:
        e = await prep_unselected(pg, id)
        if e: return False, 'a ' + e
        pt = await boundary(pg, id, 10); exp = await caret_at(pg, id, *pt)
        if exp is None or abs(exp - 10) > 1: return False, f'a 準備失敗：押す所が 10 文字目でない ({exp})'
        await press_release(pg, pt, jitter=2)
        st = await state(pg); si = await selinfo(pg, id)
        g = is_editing(st, id) and si.get('in') and si.get('collapsed') and abs(si['start'] - exp) <= 1
        ok &= g; msg.append(f"a 選んでいない箱を押して離す: 書き換え={'あり' if is_editing(st, id) else 'なし'} 選択={st['sel']} カーソル={si.get('start') if si.get('in') else '箱の外'}（押した所 {exp}）")
    finally: await pg.context.close()
    # b
    pg = await fresh(br, url)
    try:
        e = await prep_unselected(pg, id)
        if e: return False, 'b ' + e
        r0 = await vb(pg, id); pt = await charcenter(pg, id, 6)
        await mdrag(pg, pt, (pt[0] + 60, pt[1] + 40), steps=12)
        r = await vb(pg, id); st = await state(pg)
        dx, dy = r['x'] - r0['x'], r['py'] - r0['py']
        g = abs(dx - 60) <= 15 and abs(dy - 40) <= 15 and st['ed'] != id
        ok &= g; msg.append(f"b 選んでいない箱をドラッグ: 動き=({r1(dx)},{r1(dy)}) 書き換え={'あり' if st['ed'] else 'なし'}")
    finally: await pg.context.close()
    # c
    pg = await fresh(br, url)
    try:
        e = await prep_editing(pg, id, 2)
        if e: return False, 'c ' + e
        r0 = await vb(pg, id); a = await boundary(pg, id, 3); b = await boundary(pg, id, 15)
        if abs(a[1] - b[1]) > 3: return False, 'c 準備失敗：3 と 15 文字目が同じ行にない'
        await mdrag(pg, a, b, steps=12)
        r = await vb(pg, id); st = await state(pg); si = await selinfo(pg, id)
        mv = max(abs(r['x'] - r0['x']), abs(r['py'] - r0['py']))
        g = is_editing(st, id) and si.get('in') and not si.get('collapsed') and abs(si['start'] - 3) <= 1 and abs(si['end'] - 15) <= 1 and mv <= 2
        ok &= g; msg.append(f"c 書き換え中の中をドラッグ: 書き換え={'あり' if is_editing(st, id) else 'なし'} 選択={(si.get('start'), si.get('end')) if si.get('in') else 'なし'} 箱の動き={r1(mv)}")
    finally: await pg.context.close()
    # d
    tried = []; g = False
    for dyp in [-2, 2, 'b-2', 'b+2']:
        pg = await fresh(br, url)
        try:
            e = await prep_editing(pg, id, 2)
            if e: return False, 'd ' + e
            r0 = await vb(pg, id)
            x = r0['x'] + r0['w'] * 0.3
            y = r0['y'] + dyp if isinstance(dyp, int) else (r0['b'] - 2 if dyp == 'b-2' else r0['b'] + 2)
            await mdrag(pg, (x, y), (x + 50, y + 30), steps=12)
            r = await vb(pg, id); dx, dy = r['x'] - r0['x'], r['py'] - r0['py']
            tried.append(f'{dyp}:({r1(dx)},{r1(dy)})')
            if abs(dx - 50) <= 15 and abs(dy - 30) <= 15: g = True; break
        finally: await pg.context.close()
    ok &= g; msg.append(f"d 書き換え中の枠をドラッグ: {'動く' if g else '動かない'} {' '.join(tried)}")
    # e
    pg = await fresh(br, url)
    try:
        e = await prep_selected(pg, id, 2)
        if e: return False, 'e ' + e
        pt = await boundary(pg, id, 20); exp = await caret_at(pg, id, *pt)
        if exp is None or abs(exp - 20) > 1: return False, f'e 準備失敗：押す所が 20 文字目でない ({exp})'
        await press_release(pg, pt, jitter=0)
        st = await state(pg); si = await selinfo(pg, id)
        g = is_editing(st, id) and si.get('in') and si.get('collapsed') and abs(si['start'] - exp) <= 1
        ok &= g; msg.append(f"e 選んだ箱をもう一度押す: 書き換え={'あり' if is_editing(st, id) else 'なし'} カーソル={si.get('start') if si.get('in') else '箱の外'}（押した所 {exp}）")
    finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P3
# 作業票: ダブルクリック＝押した所の語を選んで書き換え（選んでいない箱でも）
# 再現: F_b0 の 10 文字目「意」の真ん中をダブルクリック。選んでいない・選んだ（書き換えていない）・書き換え中の3つの状態で。
# 合格: 書き換え中（contenteditable）で、選択が「意」を含み、空でなく、10 文字以下で、箱の文全体ではない（語の選択）。
# 準備の確かめ: 状態が作れている（選んでいない＝選択なし、選んだ＝選んだだけ、書き換え中＝カーソルが置けている）。
#   押す点の文字が「意」である。
async def t_P3(br, url):
    id = 'F_b0'; k = 10; msg = []; ok = True
    for lbl in ['選んでいない', '選んだ', '書き換え中']:
        pg = await fresh(br, url)
        try:
            e = await (prep_unselected(pg, id) if lbl == '選んでいない' else prep_selected(pg, id, 2) if lbl == '選んだ' else prep_editing(pg, id, 30))
            if e: return False, f'{lbl}: {e}'
            c = await char(pg, id, k)
            if not c or c['ch'] != '意': return False, f'準備失敗：{k} 文字目が「意」でない ({c})'
            await pg.mouse.dblclick(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2); await pg.wait_for_timeout(500)
            st = await state(pg); si = await selinfo(pg, id)
            g = is_editing(st, id) and si.get('in') and not si.get('collapsed') and si['start'] <= k < si['end'] and (si['end'] - si['start']) <= 10 and si['text'].strip() != (si['full'] or '').strip()
            ok &= g; msg.append(f"{lbl}: 書き換え={'あり' if is_editing(st, id) else 'なし'} 選択={si.get('text')!r}" + (f"（{si['start']}〜{si['end']}）" if si.get('in') else ''))
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P4
# 作業票: 箱を選んで文字を打つ＝書き換えに入り、箱の文字を打った文字で置き換える。Enter・F2＝書き換えに入り、箱の文字を全部選ぶ
# 再現: F_h0 を選んだだけ（書き換えていない）にして、(a) Z を打つ→外を押す、(b) Enter、(c) F2。別々の context で。
# 合格: (a) 打った直後に書き換え中で箱の文字が「Z」、外を押した後も「Z」。
#       (b)(c) 書き換え中で、選択が箱の文字全部（0〜文字数）。
# 準備の確かめ: 選んだだけの状態（selected=[F_h0]・editingId なし）にできている。
async def t_P4(br, url):
    id = 'F_h0'; msg = []; ok = True
    for k in ['type', 'Enter', 'F2']:
        pg = await fresh(br, url)
        try:
            e = await prep_selected(pg, id, 2)
            if e: return False, f'{k}: {e}'
            full = (await textof(pg, id)).strip()
            if k == 'type':
                await pg.keyboard.type('Z'); await pg.wait_for_timeout(400)
                st = await state(pg); t1 = (await textof(pg, id) or '').strip()
                await out(pg); t2 = (await textof(pg, id) or '').strip()
                g = is_editing(st, id) and t1 == 'Z' and t2 == 'Z'
                msg.append(f"Z を打つ: 書き換え={'あり' if is_editing(st, id) else 'なし'} 打った直後={t1!r} 外を押した後={t2!r}")
            else:
                await pg.keyboard.press(k); await pg.wait_for_timeout(450)
                st = await state(pg); si = await selinfo(pg, id)
                g = is_editing(st, id) and si.get('in') and si['start'] == 0 and si['end'] >= len(full)
                msg.append(f"{k}: 書き換え={'あり' if is_editing(st, id) else 'なし'} 選択={si.get('text')!r}（全体 {full!r}）")
            ok &= g
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P5
# 作業票: 選んでいない箱の3回クリック＝書き換えに入り、段落を選ぶ
# 再現: (1段落) F_b0（1段落）の 10 文字目「意」を3回クリック（clickCount 1,2,3）。選んでいない・選んだ（書き換えていない）で。
#       (2段落) 別の context で F_b0 を書き換え中にし、26 文字目（「季節の…」の前）で Enter を押して2段落にし、外を押して終える →
#       何も選んでいない所から2段落目の「移」を3回クリック。
# 合格: 書き換え中で、選択が押した所の段落。1段落の箱では文全体、2段落の箱では2段落目「季節の移ろいを、…お届けします。」だけ
#       （前後の空白・改行は無視。1段落目の文字が入っていたら NG）。
# 準備の確かめ: 状態が作れている。押す点の文字が「意」「移」。2段落の準備では、Enter の後に箱の記録（textRuns）に改行が入っている。
#   ※ 試験台28 で再現しない。壊れていないことを確かめるための項目（元の精査はクリックを別々に3回送っていた測り方の誤り）。
#   ※ 2段落の箱の表示は J1（改行が表示から消える）の影響を受ける。
async def t_P5(br, url):
    id = 'F_b0'; k = 10; msg = []; ok = True
    for lbl in ['選んでいない', '選んだ']:
        pg = await fresh(br, url)
        try:
            e = await (prep_unselected(pg, id) if lbl == '選んでいない' else prep_selected(pg, id, 2))
            if e: return False, f'{lbl}: {e}'
            full = (await textof(pg, id)).strip()
            c = await char(pg, id, k)
            if not c or c['ch'] != '意': return False, f'準備失敗：{k} 文字目が「意」でない'
            await pg.mouse.click(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2, click_count=3); await pg.wait_for_timeout(500)
            st = await state(pg); si = await selinfo(pg, id)
            g = is_editing(st, id) and si.get('in') and si.get('text', '').strip() == full
            ok &= g; msg.append(f"1段落・{lbl}: 書き換え={'あり' if is_editing(st, id) else 'なし'} 選択={'文全体' if si.get('text', '').strip() == full else repr(si.get('text', '')[:20])}")
        finally: await pg.context.close()
    pg = await fresh(br, url)
    try:
        e = await prep_editing(pg, id, 26)
        if e: return False, '2段落: ' + e
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await out(pg)
        model = ''.join(x.get('text', '') for x in (await pg.evaluate(f"{P}.textRuns('{id}')") or []))
        if '\n' not in model: return False, f'2段落: 準備失敗：Enter で段落が分かれない（記録 {model[:40]!r}）'
        p2 = model.split('\n')[-1].strip(); p1 = model.split('\n')[0].strip()
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        if (await state(pg))['sel']: await out(pg)
        if (await state(pg))['sel'] or (await state(pg))['ed']: return False, f'2段落: 準備失敗：選択が外れない {await state(pg)}'
        await scrollto(pg, id)
        t = await textof(pg, id); j = t.find('移')
        c = await char(pg, id, j) if j >= 0 else None
        if not c: return False, '2段落: 準備失敗：「移」が無い'
        await pg.mouse.click(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2, click_count=3); await pg.wait_for_timeout(500)
        st = await state(pg); si = await selinfo(pg, id); sx = (si.get('text') or '').strip()
        g = is_editing(st, id) and si.get('in') and sx == p2 and p1[:4] not in sx
        shown = await pg.evaluate("s=>document.querySelector('[data-el=\"'+s+'\"]').innerText", id)
        nl = 'あり' if '\n' in (shown or '') else 'なし'
        ed = 'あり' if is_editing(st, id) else 'なし'
        msg.append(f'2段落・選んでいない: 書き換え={ed} 選択={sx[:24]!r}（期待 {p2[:12]!r}…）表示の改行={nl}'); ok &= g
    finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P6
# 作業票: ヘッダーのロゴ・フッター・お品書きの帯や括りの見出し・アクセスの文字も、1回クリックで選べる（P2 と同じ扱い）
# 再現: 何も選んでいない所から、各部品の2文字目を1回押して離す（動き 0）。お品書き・アクセスは setPage で移って（準備）。
# 合格: 押した部品が、F_h0 を1回押したときと同じ扱いになる（F_h0 が書き換えに入るなら書き換え中、選ぶだけなら選んだだけ）。
#       どちらでも、押した部品が selected か editingId に入る。
# 準備の確かめ: 押す前に何も選ばれていない・部品が画面に見える・押す点が部品の上（elementFromPoint が部品の中）。
TARGETS6 = [('pg_home', 'header__logo'), ('pg_home', 'footer__fname'), ('pg_menu', 'menu__mg_mnu_tento'), ('pg_menu', 'menu__mc_cat_namagashi'),
            ('pg_contact', 'contact__cl_addr'), ('pg_contact', 'contact__ci_addr')]
async def t_P6(br, url):
    pg = await fresh(br, url)
    try:
        pt = await charcenter(pg, 'F_h0', 2); await scrollto(pg, 'F_h0'); pt = await charcenter(pg, 'F_h0', 2)
        await press_release(pg, pt, jitter=0); ref = await state(pg)
        if 'F_h0' not in ref['sel'] and ref['ed'] != 'F_h0': return False, f'準備失敗：F_h0 も1回で選べない {ref}'
        ref_edit = is_editing(ref, 'F_h0')
    finally: await pg.context.close()
    msg = []; ok = True
    for page, id in TARGETS6:
        pg = await fresh(br, url)
        try:
            if page != 'pg_home':
                await pg.evaluate(f"{P}.setPage('{page}')"); await pg.wait_for_timeout(900)
            await scrollto(pg, id)
            if await vb(pg, id) is None: ok = False; msg.append(f'{id}: 準備失敗：見えない'); continue
            st0 = await state(pg)
            if st0['sel'] or st0['ed']: ok = False; msg.append(f'{id}: 準備失敗：最初から選択 {st0}'); continue
            pt = await charcenter(pg, id, 1)
            hit = await pg.evaluate("([id,x,y])=>{const e=document.elementFromPoint(x,y);return !!(e&&e.closest('[data-el=\"'+id+'\"]'))}", [id, pt[0], pt[1]])
            if not hit: ok = False; msg.append(f'{id}: 準備失敗：押す点が部品の上でない'); continue
            await press_release(pg, pt, jitter=0); st = await state(pg)
            g = is_editing(st, id) if ref_edit else is_selected_only(st, id)
            ok &= g; msg.append(f"{id}: {'書き換え' if is_editing(st, id) else '選ぶ' if id in st['sel'] else '選べない'}")
        finally: await pg.context.close()
    return ok, f"F_h0 の1回押し={'書き換え' if ref_edit else '選ぶ'} / " + ' / '.join(msg)

# ---- P7
# 作業票: カーソルだけで Cmd+B（I・U・大きさ・色・書体も）＝次に打つ文字に効く
# 再現: F_b0 を書き換え中にして 10 文字目の前にカーソル（選択なし）→ (B) MOD+b / (I) MOD+i / (U) MOD+u /
#       (大きさ) 道具の「大きく」を押す → XY と打つ → 外を押して書き換えを終える。別々の context で。
# 合格: 描き直された表示で、打った X・Y にその見た目が付き（太字 ≥600・斜体・下線・字が大きい）、
#       カーソルの前の文字（9 文字目）と後ろの元の文字には付かない。
# 準備の確かめ: カーソルが 10 文字目に置けている。終えた後の箱の文に XY が 10 文字目から入っている（打鍵が届いた）。
#   ブラウザが contenteditable に付けた見た目（<b> など）だけでの合格を避けるため、書き換えを終えて描き直された後で見るうえ、
#   記録（textRuns）で X・Y の run に bold / italic / underline（大きさは scale>1 か size が大きい）が入り、9 文字目の run には
#   入らないこと、2 秒待って読み込み直した後も表示に見た目が残ることも条件にする。
RUNKEYS = {'B': ('bold', 'b', 'strong'), 'I': ('italic', 'i', 'em', 'it'), 'U': ('underline', 'u', 'ul')}
def run_has(lbl, run):
    if not run: return False
    if lbl == '大きさ':
        return (run.get('scale') or 1) > 1.001 or (isinstance(run.get('size'), (int, float)) and run.get('size') > 16)
    return any(run.get(k) for k in RUNKEYS[lbl]) or (lbl == 'B' and (run.get('weight') or 0) >= 600)
def run_at(runs, i):
    c = 0
    for r in runs or []:
        L = len(r.get('text', ''))
        if i < c + L: return r
        c += L
    return None
async def t_P7(br, url):
    id = 'F_b0'; k = 10; msg = []; ok = True
    for lbl, act, test in [('B', f'{MOD}+b', lambda s, n: s['w'] >= 600 and n['w'] < 600),
                           ('I', f'{MOD}+i', lambda s, n: s['it'] in ('italic', 'oblique') and n['it'] == 'normal'),
                           ('U', f'{MOD}+u', lambda s, n: s['u'] and not n['u']),
                           ('大きさ', 'grow', lambda s, n: s['fs'] > n['fs'] + 0.5)]:
        pg = await fresh(br, url)
        try:
            e = await prep_editing(pg, id, k)
            if e: return False, f'{lbl}: {e}'
            base = await textof(pg, id)
            if act == 'grow':
                b = await find_btn(pg, r'大きく|ts=grow|拡大', tb_only=True)
                if not b: ok = False; msg.append(f'{lbl}: 道具「大きく」が無い'); continue
                await pg.mouse.click(b['x'], b['y']); await pg.wait_for_timeout(300)
            else:
                await pg.keyboard.press(act); await pg.wait_for_timeout(250)
            await pg.keyboard.type('XY'); await pg.wait_for_timeout(300)
            await out(pg)
            t = await textof(pg, id)
            if not t or t[k:k + 2] != 'XY':
                ok = False; msg.append(f'{lbl}: 打った XY が 10 文字目に入らない（{(t or "")[:20]!r}。道具・キーでカーソルが外れた）'); continue
            sx, sy, sp, sa = [await style_at(pg, id, i) for i in (k, k + 1, k - 1, k + 2)]
            g = test(sx, sp) and test(sy, sa)
            runs = await pg.evaluate(f"{P}.textRuns('{id}')")
            rx, ry, rp = run_at(runs, k), run_at(runs, k + 1), run_at(runs, k - 1)
            gr = run_has(lbl, rx) and run_has(lbl, ry) and not run_has(lbl, rp)
            await pg.wait_for_timeout(2000); await pg.reload(); await pg.wait_for_timeout(1800)
            t2 = await textof(pg, id)
            if t2 and t2[k:k + 2] == 'XY':
                qx, qp = await style_at(pg, id, k), await style_at(pg, id, k - 1); gl = test(qx, qp); rl = '残る' if gl else '消える'
            else:
                gl = False; rl = f'XY が無い（{(t2 or "")[:16]!r}）'
            rxs = json.dumps(rx, ensure_ascii=False)[:60]
            g = g and gr and gl
            ok &= g; msg.append(f"{lbl}: 表示 XY に{'効く' if test(sx, sp) and test(sy, sa) else '効かない（または前後の文字にも効く）'} 記録 {'あり' if gr else 'なし'} {rxs} 読み込み直し後 {rl} (X {sx['w']},{sx['it']},{'下線' if sx['u'] else '-'},{r1(sx['fs'])} / 前 {sp['w']},{sp['it']},{'下線' if sp['u'] else '-'},{r1(sp['fs'])} / 後 {sa['w']},{r1(sa['fs'])})")
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P8
# 作業票: 道具の並びの表示（書体・大きさ・B・I・U・色・揃え）は、選んだ所（またはカーソルの所）の見た目を示す。混ざっていれば空欄
# 再現: F_b0 を書き換え中にし、0〜4 文字目をマウスでドラッグして選び、道具の B と「大きく」を押す（ここで 0〜3 文字目が太字・大きい）。
#       (1) 2 文字目の前を押してカーソル → 道具を見る。(2) 20 文字目の前を押す → 見る。(3) 2〜8 文字目をドラッグで選ぶ → 見る。
# 合格: (1) B が押された表示・大きさの欄が大きい値（18 など、元の 16 より大）。(2) B が押されていない・欄が 16。
#       (3) 大きさの欄が空・B は押されていない表示。
# 準備の確かめ: 書き換えに入れた・0〜4 が選べた・B と大きさの欄が見つかる・最後に書き換えを終えて 0 文字目が本当に太字で大きい。
async def t_P8(br, url):
    id = 'F_b0'
    pg = await fresh(br, url)
    try:
        e = await prep_editing(pg, id, 30)
        if e: return False, e
        await mdrag(pg, await boundary(pg, id, 0), await boundary(pg, id, 4), steps=10)
        si = await selinfo(pg, id)
        if not si.get('in') or si['start'] != 0 or si['end'] != 4: return False, f'準備失敗：0〜4 が選べない {si}'
        b = await bold_btn(pg); g = await find_btn(pg, r'大きく|ts=grow', tb_only=True)
        if not b or not g: return False, f'道具が無い B={bool(b)} 大きく={bool(g)}'
        await pg.mouse.click(b['x'], b['y']); await pg.wait_for_timeout(250)
        await pg.mouse.click(g['x'], g['y']); await pg.wait_for_timeout(350)
        async def look():
            bb = await bold_btn(pg); si = await size_input(pg)
            return {'B': bb['on'] if bb else None, 'size': si['v'] if si else None}
        await press_release(pg, await boundary(pg, id, 2), jitter=0); s1 = await look(); c1 = await selinfo(pg, id)
        await press_release(pg, await boundary(pg, id, 20), jitter=0); s2 = await look(); c2 = await selinfo(pg, id)
        await mdrag(pg, await boundary(pg, id, 2), await boundary(pg, id, 8), steps=8); s3 = await look(); c3 = await selinfo(pg, id)
        await out(pg)
        a0 = await style_at(pg, id, 1); a1 = await style_at(pg, id, 20)
        if not (a0['w'] >= 600 and a0['fs'] > a1['fs'] + 0.5): return False, f'準備失敗：0〜4 が太字・大きくならない {a0} {a1}'
        if not (c1.get('collapsed') and abs(c1['start'] - 2) <= 1 and c2.get('collapsed') and abs(c2['start'] - 20) <= 1 and c3.get('in') and not c3['collapsed']):
            return False, f'準備失敗：カーソル・選択が置けない {c1} {c2} {c3}'
        def num(v):
            try: return float(v)
            except Exception: return None
        g1 = s1['B'] is True and num(s1['size']) is not None and num(s1['size']) > 16.4
        g2 = s2['B'] is False and num(s2['size']) == 16
        g3 = (s3['size'] or '').strip() == '' and s3['B'] is not True
        return g1 and g2 and g3, f"太字・大きい所にカーソル: B={s1['B']} 欄={s1['size']!r} / ふつうの所: B={s2['B']} 欄={s2['size']!r} / 混ざった選択: B={s3['B']} 欄={s3['size']!r}"
    finally: await pg.context.close()

# ---- P9
# 作業票: 大きさの欄：丸めた値を欄にも出す。打った後に外を押しても当たる。数字でない値は前の値に戻す
# 再現: F_b0（16）を選んだだけにし、大きさの欄を3回クリックして中を全部選び（選べたことを確かめる）、
#       (a) 17.3 と打って Enter、(b) 22 と打って Enter を押さずにページの何もない所を押す、(c) abc と打って Enter。別々の context で。
# 合格: (a) 箱に当たった大きさ（textStyles の size）が 16 から変わり、欄の値がその大きさと同じ（17.3 のままでない）。
#       (b) 箱の大きさが 22。(c) 欄が前の値 16 に戻り、箱の大きさは 16 のまま、箱は消えていない。
# 準備の確かめ: 選んだだけにできる・欄がある・欄の中の文字を全部選べた（selectionStart=0, selectionEnd=文字数）。
async def t_P9(br, url):
    id = 'F_b0'; msg = []; ok = True
    for lbl, typed, finish in [('a', '17.3', 'Enter'), ('b', '22', 'out'), ('c', 'abc', 'Enter')]:
        pg = await fresh(br, url)
        try:
            e = await prep_selected(pg, id, 2)
            if e: return False, f'{lbl}: {e}'
            s0 = await text_size(pg, id); si = await size_input(pg)
            if not si: return False, '大きさの欄が無い'
            await pg.mouse.click(si['x'], si['y'], click_count=3); await pg.wait_for_timeout(200)
            full = await pg.evaluate("(()=>{const i=document.activeElement;return i&&i.tagName=='INPUT'?[i.selectionStart,i.selectionEnd,i.value.length]:null})()")
            if not full or full[0] != 0 or full[1] != full[2]:
                await pg.keyboard.press(f'{MOD}+a')
                full = await pg.evaluate("(()=>{const i=document.activeElement;return i&&i.tagName=='INPUT'?[i.selectionStart,i.selectionEnd,i.value.length]:null})()")
            if not full or full[0] != 0 or full[1] != full[2]: return False, f'{lbl}: 準備失敗：欄の中を全部選べない {full}'
            await pg.keyboard.type(typed); await pg.wait_for_timeout(150)
            if finish == 'Enter': await pg.keyboard.press('Enter')
            else: await out(pg)
            await pg.wait_for_timeout(400)
            s1 = await text_size(pg, id); v = (await size_input(pg) or {}).get('v')
            alive = await vb(pg, id) is not None
            if lbl == 'a':
                try: fv = float(v)
                except Exception: fv = None
                g = s1 is not None and s1 != s0 and fv is not None and abs(fv - s1) < 0.01
                msg.append(f'17.3+Enter: 箱 {s0}→{s1} 欄 {v!r}')
            elif lbl == 'b':
                g = s1 == 22; msg.append(f'22+外を押す: 箱 {s0}→{s1}')
            else:
                g = alive and s1 == s0 and v is not None and v.strip() in (str(s0), f'{s0:g}')
                msg.append(f"abc+Enter: 箱 {s0}→{s1} 欄 {v!r} 箱={'あり' if alive else 'なし'}")
            ok &= bool(g)
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P10
# 作業票: Cmd+Shift+> ／ < で大きさを一覧の次・前へ（書き換え中は選んだ所、選んでいなければ箱まるごと）
# 再現: (箱) F_b0（16）を選んだだけにし、「よく使う大きさ ▾」の一覧の数を読む（もう一度押して閉じ、選択が残るのを確かめる）→
#       MOD+Shift+> → MOD+Shift+< 。
#       (範囲) 別の context で F_b0 を書き換え中にし 0〜4 文字目をドラッグで選び MOD+Shift+> → 外を押す。
# 合格: (箱) > で箱の大きさが一覧の 16 の次の値、< で 16 に戻る。
#       (範囲) 0 文字目の表示の大きさ ÷ 20 文字目の大きさ が 一覧の次の値 ÷ 16（±3%）、20 文字目は元の大きさのまま。
# 準備の確かめ: 一覧が読める（16 を含む）・選んだだけ／0〜4 の選択ができている。
async def t_P10(br, url):
    id = 'F_b0'; msg = []; ok = True
    pg = await fresh(br, url)
    try:
        e = await prep_selected(pg, id, 2)
        if e: return False, e
        lb = await find_btn(pg, r'よく使う大きさ|size-list|大きさの一覧', tb_only=True)
        if not lb: return False, '準備失敗：大きさの一覧（▾）が無い'
        await pg.mouse.click(lb['x'], lb['y']); await pg.wait_for_timeout(300)
        nums = sorted({int(b['lab'].split()[0]) for b in await buttons(pg) if not b['tb'] and b['lab'].split() and b['lab'].split()[0].isdigit()})
        await pg.mouse.click(lb['x'], lb['y']); await pg.wait_for_timeout(300)
        if 16 not in nums: return False, f'準備失敗：一覧が読めない {nums}'
        if not is_selected_only(await state(pg), id):
            e = await prep_selected(pg, id, 2)
            if e: return False, '一覧を閉じた後 ' + e
        nxt = [n for n in nums if n > 16][0]
        s0 = await text_size(pg, id)
        await pg.keyboard.press(f'{MOD}+Shift+Period'); await pg.wait_for_timeout(400); s1 = await text_size(pg, id)
        await pg.keyboard.press(f'{MOD}+Shift+Comma'); await pg.wait_for_timeout(400); s2 = await text_size(pg, id)
        g = s0 == 16 and s1 == nxt and s2 == 16
        ok &= g; msg.append(f'箱: {s0} → > {s1}（期待 {nxt}）→ < {s2}')
    finally: await pg.context.close()
    pg = await fresh(br, url)
    try:
        e = await prep_editing(pg, id, 30)
        if e: return False, '範囲: ' + e
        f0 = (await style_at(pg, id, 20))['fs']
        await mdrag(pg, await boundary(pg, id, 0), await boundary(pg, id, 4), steps=10)
        si = await selinfo(pg, id)
        if not si.get('in') or si['start'] != 0 or si['end'] != 4: return False, f'範囲: 準備失敗：0〜4 が選べない {si}'
        await pg.keyboard.press(f'{MOD}+Shift+Period'); await pg.wait_for_timeout(400)
        await out(pg)
        a, b = await style_at(pg, id, 0), await style_at(pg, id, 20)
        rt = a['fs'] / b['fs']; want = nxt / 16
        g = abs(rt - want) / want <= 0.03 and abs(b['fs'] - f0) < 0.5
        ok &= g; msg.append(f"範囲: 0 文字目 {r1(a['fs'])}px / 20 文字目 {r1(b['fs'])}px（前 {r1(f0)}）比 {round(rt, 3)}（期待 {round(want, 3)}）")
    finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P11
# 作業票: 文字の揃え（左・中央・右・両端）を道具の並びに。Cmd+L・E・R・J。段落ごとではなく箱まるごと、両端末で共通
# 再現: (キー) F_b0 を選んだだけにして MOD+r → MOD+e → MOD+j → MOD+l。(道具) 別の context で選んだだけにして道具の並びの
#       「右揃え」を押す（無ければ「揃え」「文字」の ▾ を開いて探す。配置 ▾ は部品の整列なので使わない）。
#       (書き換え中) 別の context で書き換え中にして MOD+e → 外を押す。(両端末) キーで右にした後「スマホ」を押す。
# 合格: 箱とその中のすべての要素の text-align が right → center → justify → left（start も可）になる。キーで読み込み直さない。
#       道具の「右揃え」で right になり、箱の位置は動かない。書き換え中の MOD+e で箱まるごと center。スマホでも right。
# 準備の確かめ: 選んだだけ・書き換え中にできている。最初の揃えを読んでおく。
ALIGN = "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;return [...new Set([e,...e.querySelectorAll('*')].map(x=>getComputedStyle(x).textAlign))].join(',')}"
async def t_P11(br, url):
    id = 'F_b0'; msg = []; ok = True
    pg = await fresh(br, url)
    try:
        e = await prep_selected(pg, id, 2)
        if e: return False, 'キー: ' + e
        await pg.evaluate('window.__p11mark=1')
        a0 = await pg.evaluate(ALIGN, id); got = []
        for key, want in [('r', 'right'), ('e', 'center'), ('j', 'justify'), ('l', 'left')]:
            await pg.keyboard.press(f'{MOD}+{key}'); await pg.wait_for_timeout(400)
            v = await pg.evaluate(ALIGN, id); got.append(f'{key}→{v}')
            okv = v == want or (want == 'left' and v in ('start', 'left'))
            ok &= okv
            if key == 'r':
                # 両端末で共通：スマホに切り替えて見る
                sp = await find_btn(pg, r'スマホ', tb_only=True)
                if not sp:
                    ok = False; got.append('スマホ=「スマホ」の道具がない')
                else:
                    await pg.mouse.click(sp['x'], sp['y']); await pg.wait_for_timeout(800)
                    await scrollto(pg, id); vsp = await pg.evaluate(ALIGN, id)
                    pc = await find_btn(pg, r'(^| )PC( |$)', tb_only=True)
                    await pg.mouse.click(pc['x'], pc['y']); await pg.wait_for_timeout(800)
                    got.append(f'スマホ={vsp}'); ok &= vsp == 'right'
                    if not is_selected_only(await state(pg), id):
                        e = await prep_selected(pg, id, 2)
                        if e: return False, 'スマホから戻った後 ' + e
        rel = await pg.evaluate('window.__p11mark')
        if rel != 1: ok = False; got.append('読み込み直された')
        msg.append(f"キー: 始め {a0} " + ' '.join(got))
    finally: await pg.context.close()
    pg = await fresh(br, url)
    try:
        e = await prep_selected(pg, id, 2)
        if e: return False, '道具: ' + e
        pat = r'右揃え|右寄せ|文字を右|text-?align.?right|align.?right|揃え.?右'
        b = await find_btn(pg, pat, tb_only=False)
        if not b:
            for m in await buttons(pg):
                if m['tb'] and not m['dis'] and ('揃え' in m['lab'] or '文字' in m['lab']) and '配置' not in m['lab']:
                    await pg.mouse.click(m['x'], m['y']); await pg.wait_for_timeout(300)
                    b = await find_btn(pg, pat)
                    if b: break
                    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
                    if not is_selected_only(await state(pg), id): await prep_selected(pg, id, 2)
        if not b: ok = False; msg.append('道具: 文字の右揃えの道具が無い')
        else:
            r0 = await vb(pg, id)
            await pg.mouse.click(b['x'], b['y']); await pg.wait_for_timeout(400)
            v = await pg.evaluate(ALIGN, id); r = await vb(pg, id)
            g = v == 'right' and abs(r['x'] - r0['x']) <= 1 and abs(r['py'] - r0['py']) <= 1
            ok &= g; msg.append(f"道具「{b['lab'][:12]}」: {v} 箱の動き=({r1(r['x'] - r0['x'])},{r1(r['py'] - r0['py'])})")
    finally: await pg.context.close()
    pg = await fresh(br, url)
    try:
        e = await prep_editing(pg, id, 10)
        if e: return False, '書き換え中: ' + e
        await pg.keyboard.press(f'{MOD}+e'); await pg.wait_for_timeout(300)
        await out(pg); v = await pg.evaluate(ALIGN, id)
        ok &= v == 'center'; msg.append(f'書き換え中 MOD+e→終えた後 {v}')
    finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P12
# 作業票: 文字の箱の左右のつまみ：上の辺は動かず、下へ伸びる。手で大きさを変えた箱は、テンプレートの縦の真ん中そろえから外れる
#        （手直しとして記録）。記録と食い違う
# 再現: F_h0（1行の見出し。下に F_b0）を選び、(e) 右のつまみを 360px 左へ、(w) 別の context で左のつまみを 360px 右へドラッグ。
# 合格: F_h0 の上の辺が ±2px で動かない・下の辺が 15px 以上下へ伸びる・F_h0 の下の辺と F_b0 の上の辺の間隔が ±4px で
#       保たれる（下の部品が付いて下がる）・F_h0 と F_b0 が重ならない・手直しとして記録が増える（ops の数）。
# 準備の確かめ: つまみがある・F_h0 の幅が 200px 以上狭まった（ドラッグが効いた）・高さが増えた（折り返しが起きた）。
async def t_P12(br, url):
    msg = []; ok = True
    for h, dx in [('e', -360), ('w', 360)]:
        pg = await fresh(br, url)
        try:
            await scrollto(pg, 'F_h0')
            pt = await charcenter(pg, 'F_h0', 2); await press_release(pg, pt, jitter=0)
            hp = await handle_pt(pg, h)
            if not hp:
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); hp = await handle_pt(pg, h)
            if not hp: return False, f'準備失敗：{h} のつまみが無い {await state(pg)}'
            a0, b0 = await vb(pg, 'F_h0'), await vb(pg, 'F_b0'); n0 = await pg.evaluate(f"{P}.ops().length")
            await mdrag(pg, hp, (hp[0] + dx, hp[1]), steps=15)
            a1, b1 = await vb(pg, 'F_h0'), await vb(pg, 'F_b0')
            if a0['w'] - a1['w'] < 200: ok = False; msg.append(f'{h}: 準備失敗：幅が狭まらない {r1(a0["w"])}→{r1(a1["w"])}'); continue
            if a1['h'] - a0['h'] < 15: ok = False; msg.append(f'{h}: 準備失敗：折り返さない 高さ {r1(a0["h"])}→{r1(a1["h"])}'); continue
            top = a1['py'] - a0['py']; bot = (a1['py'] + a1['h']) - (a0['py'] + a0['h'])
            gap0 = b0['py'] - (a0['py'] + a0['h']); gap1 = b1['py'] - (a1['py'] + a1['h'])
            n1 = await pg.evaluate(f"{P}.ops().length")
            g = abs(top) <= 2 and bot >= 15 and abs(gap1 - gap0) <= 4 and gap1 >= -1 and n1 > n0
            ok &= g; msg.append(f'{h}: 記録 {n0}→{n1} 上の辺 {r1(top)} 下の辺 +{r1(bot)} 幅 {r1(a0["w"])}→{r1(a1["w"])} F_b0 との間隔 {r1(gap0)}→{r1(gap1)}（F_b0 縦 {r1(b1["py"] - b0["py"])}）')
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P13
# 作業票: 上の「テキスト」で足した箱は、空の見本の文字（薄い「テキストを入力」）で出し、何も打たずに外を押したら消える
# 再現: (a) 道具の「テキスト」を押す → 出た箱を見る → Q と打つ → 外を押す。(b) 別の context で「テキスト」を押す → 何も打たずに外を押す。
# 合格: (a) 足した箱に「テキストを入力」が見える（文字・::before/::after・placeholder 属性のどれか）。Q を打つと箱の文字が「Q」だけ
#       （見本の文字は文に入らない）。外を押した後も Q の箱が残る。(b) 外を押したら足した箱が無くなる。
# 準備の確かめ: 「テキスト」の道具がある・押すと新しい部品が1つ増える。
async def t_P13(br, url):
    msg = []; ok = True
    PH = """id=>{const e=document.querySelector('[data-el="'+id+'"]');if(!e)return null;const all=[e,...e.querySelectorAll('*')];const t=[];
      for(const x of all){t.push(x.innerText||'');for(const p of ['::before','::after']){const c=getComputedStyle(x,p).content;if(c&&c!='none'&&c!='normal')t.push(c)}
        for(const a of ['placeholder','data-placeholder','aria-placeholder'])if(x.getAttribute(a))t.push(x.getAttribute(a))}return t.join('|')}"""
    for lbl in ['a', 'b']:
        pg = await fresh(br, url)
        try:
            b = await find_btn(pg, r'^テキスト$|テキストを足す|ts=add-text', tb_only=True)
            if not b: return False, '道具「テキスト」が無い'
            before = set(await ids(pg))
            await pg.mouse.click(b['x'], b['y']); await pg.wait_for_timeout(600)
            new = [i for i in await ids(pg) if i not in before]
            if len(new) != 1: return False, f'{lbl}: 準備失敗：足した部品が1つでない {new}'
            nid = new[0]
            if lbl == 'a':
                shown = await pg.evaluate(PH, nid)
                g1 = 'テキストを入力' in (shown or '')
                await pg.keyboard.type('Q'); await pg.wait_for_timeout(300)
                t1 = (await textof(pg, nid) or '').strip()
                await out(pg); t2 = (await textof(pg, nid) or '').strip() if await vb(pg, nid) else None
                g = g1 and t1 == 'Q' and t2 == 'Q'
                msg.append(f"見本の文字={'あり' if g1 else 'なし'}（{(shown or '')[:30]!r}） Q を打つ→{t1!r} 外を押す→{t2!r}")
            else:
                await out(pg); gone = await vb(pg, nid) is None and nid not in await ids(pg)
                g = gone; msg.append(f"何も打たずに外を押す→{'消える' if gone else '残る（' + repr((await textof(pg, nid) or '')[:12]) + '）'}")
            ok &= g
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P14
# 作業票: 文字の箱まるごとにリンクを付けられる（写真と同じ）
# 再現: F_h0 を選んだだけにする → 道具の並びの押せる「リンク」（無ければ右クリックの一覧の「リンク」）を押す →
#       出た欄に https://example.com/p14 と打って Enter → 外を押す。
# 合格: 箱まるごとのリンク（elementLink('F_h0')、または F_h0 を包む／F_h0 の文全部を包む <a href>）が example.com/p14 を指す。
#       F_h0 の文字は変わらない。
# 準備の確かめ: 選んだだけにできる・リンクの道具を押すと打てる欄が出る。
async def t_P14(br, url):
    id = 'F_h0'
    pg = await fresh(br, url)
    try:
        e = await prep_selected(pg, id, 2)
        if e: return False, e
        t0 = await textof(pg, id)
        b = await find_btn(pg, r'リンク|ts=link|link', tb_only=True)
        where = '道具の並び'
        if not b:
            r = await vb(pg, id); await pg.mouse.click(r['x'] + 30, r['y'] + r['h'] / 2, button='right'); await pg.wait_for_timeout(400)
            b = await find_btn(pg, r'リンク'); where = '右クリック'
        if not b:
            dis = await find_btn(pg, r'リンク|ts=link', tb_only=True, enabled=False)
            return False, f"箱を選んだときに押せるリンクの道具が無い（道具の並び={'押せない' if dis else 'なし'}・右クリックにもなし）"
        await pg.mouse.click(b['x'], b['y']); await pg.wait_for_timeout(450)
        inp = await pg.evaluate("""(()=>{const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!='hidden'};
          const i=[...document.querySelectorAll('input[type=url],input[type=text],input:not([type])')].find(e=>vis(e)&&!e.closest('#toolbar'));if(!i)return null;const r=i.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()""")
        if not inp: return False, f'準備失敗：{where}の「リンク」を押しても打つ欄が出ない'
        await pg.mouse.click(*inp); await pg.keyboard.type('https://example.com/p14'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        await out(pg)
        el = await pg.evaluate(f"(()=>{{try{{return JSON.stringify({P}.elementLink('{id}'))}}catch(e){{return 'ERR'}}}})()")
        dom = await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');const a=e.closest('a[href]');if(a)return a.href;const as=[...e.querySelectorAll('a[href]')];if(as.length&&as.map(x=>x.textContent).join('').trim()===e.textContent.trim())return as[0].href;return null}", id)
        t1 = await textof(pg, id)
        g = (('example.com/p14' in (el or '')) or ('example.com/p14' in (dom or ''))) and t1 == t0
        return g, f'{where}の「{b["lab"][:10]}」→ elementLink={el} 包むリンク={dom} 文字 {"同じ" if t1 == t0 else "変わった"}'
    finally: await pg.context.close()

# ---- P15
# 作業票: Shift を押しながらドラッグ＝縦か横にまっすぐ。Shift+クリック（動かさない）は今までどおり選択に足す・外す
# 再現: (写真) F_p0 を選び、Shift を押しながら (150,25) ドラッグ。(文字) 別の context で何も選ばずに F_h0 を Shift を押しながら
#       (150,20) ドラッグ。(クリック) 別の context で F_p0 を押す → Shift+F_h0 を押して離す（動き 0）→ もう一度 Shift+F_h0。
# 合格: (写真・文字) 横に 150±12 動き、縦は ±3px（縦にまっすぐの場合も受け付ける：縦 ≥ 120 で横 ±3）。
#       (クリック) 1回目で F_p0 と F_h0 の両方が選ばれ、2回目で F_h0 が外れて F_p0 だけ。
# 準備の確かめ: F_p0 が選べた・文字は最初に何も選ばれていない。Shift+ドラッグで 100px 以上動かなければ NG（動かない）。
async def t_P15(br, url):
    msg = []; ok = True
    for lbl, id, d in [('写真', 'F_p0', (150, 25)), ('文字', 'F_h0', (150, 20))]:
        pg = await fresh(br, url)
        try:
            await scrollto(pg, id); r0 = await vb(pg, id)
            if lbl == '写真':
                # P15 の確かめたいこと（まっすぐ動く）に合わせて向きを変えた（判定は同じ）：写真を右へ 150px はページの右の端を越え、
                # J16（部品をページの中に収める）で止まって「150 動かない」になる。ページ（特集のセクションの枠）の中に収まる向きにする
                sec = await pg.evaluate("(()=>{const e=document.querySelector('.sec-wrap[data-sec=feature]')||document.querySelector('[data-sec=feature]');const r=e.getBoundingClientRect();return {x:r.x,r:r.right}})()")
                if r0['x'] + r0['w'] + d[0] > sec['r'] - 4 and r0['x'] - d[0] >= sec['x'] + 4: d = (-d[0], d[1])
                await press_release(pg, (r0['x'] + r0['w'] / 2, r0['y'] + r0['h'] / 2), jitter=0)
                if await sel(pg) != [id]: return False, f'準備失敗：{id} が選べない'
                pt = (r0['x'] + r0['w'] / 2, r0['y'] + r0['h'] / 2)
            else:
                if (await state(pg))['sel']: return False, '準備失敗：最初から選択'
                pt = await charcenter(pg, id, 2)
            await mdrag(pg, pt, (pt[0] + d[0], pt[1] + d[1]), steps=15, mods=['Shift'])
            r = await vb(pg, id); dx, dy = r['x'] - r0['x'], r['py'] - r0['py']
            if math.hypot(dx, dy) < 100: ok = False; msg.append(f'{lbl}: Shift+ドラッグで 100px 以上動かない ({r1(dx)},{r1(dy)})'); continue
            g = (abs(dx - d[0]) <= 12 and abs(dy) <= 3) or (abs(dx) <= 3 and dy >= 120)
            ok &= g; msg.append(f'{lbl}: Shift+ドラッグ({d[0]},{d[1]}) → ({r1(dx)},{r1(dy)})')
        finally: await pg.context.close()
    pg = await fresh(br, url)
    try:
        await scrollto(pg, 'F_p0'); r = await vb(pg, 'F_p0')
        await press_release(pg, (r['x'] + r['w'] / 2, r['y'] + r['h'] / 2), jitter=0)
        if await sel(pg) != ['F_p0']: return False, '準備失敗：F_p0 が選べない'
        pt = await charcenter(pg, 'F_h0', 2)
        await press_release(pg, pt, jitter=0, mods=['Shift']); s1 = await sel(pg)
        await press_release(pg, pt, jitter=0, mods=['Shift']); s2 = await sel(pg)
        g = sorted(s1) == ['F_h0', 'F_p0'] and s2 == ['F_p0']
        ok &= g; msg.append(f'Shift+クリック: 足す→{s1} 外す→{s2}')
    finally: await pg.context.close()
    return ok, ' / '.join(msg)

ITEMS = [('P1', t_P1), ('P2', t_P2), ('P3', t_P3), ('P4', t_P4), ('P5', t_P5), ('P6', t_P6), ('P7', t_P7), ('P8', t_P8),
         ('P9', t_P9), ('P10', t_P10), ('P11', t_P11), ('P12', t_P12), ('P13', t_P13), ('P14', t_P14), ('P15', t_P15)]

async def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    url = Path(sys.argv[1]).resolve().as_uri()
    want = [a.upper() for a in sys.argv[2:]]
    todo = [(k, f) for k, f in ITEMS if not want or k in want]
    unknown = [w for w in want if w not in dict(ITEMS)]
    if unknown: print('知らない ID:', unknown)
    nok = nng = 0; t00 = time.time()
    async with async_playwright() as p:
        br = await p.chromium.launch()
        for k, f in todo:
            t0 = time.time()
            try:
                ok, m = await asyncio.wait_for(f(br, url), timeout=120)
            except Exception as e:
                ok, m = False, '例外 ' + (str(e).splitlines()[0][:200] if str(e) else type(e).__name__)
            m = f'{m} ({time.time() - t0:.1f}s)'
            print(f"{'OK' if ok else 'NG'} {k} | {m}", flush=True)
            if ok: nok += 1
            else: nng += 1
        await br.close()
    print(f'合計 OK {nok} / NG {nng}（{time.time() - t00:.0f}秒）')
    sys.exit(nng)

if __name__ == '__main__':
    asyncio.run(main())
