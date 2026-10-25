# -*- coding: utf-8 -*-
"""回帰の確認：部品・写真・保存・指・画面（area = parts）

使い方: python3 verify_audit_parts.py /path/to/playgroundNN_single.html [ID ...]
  ID を並べるとその項目だけ（例: J12 J25）。省略で全部。
出力: 1項目1行 `OK J12 | 説明` / `NG J12 | 実際の値`。最後に `合計 OK x / NG y`。終了コード＝NG の数。

担当: J8 J11 J12 J13 J16 J17 J18 J23 J24 J25 J26 J27 J28 J29 J30 J31 J32 J46

判定の決まり（TESTBRIEF.md）
- 問題は本物のマウス・キーボード・指（CDP の Input.dispatchTouchEvent）で起こす。
  window.__playground は状態を読むのと準備（simulateSaveError）にだけ使う。
- 期待は「事故が起きないこと」で書く。直し方が1つに決まらないものは合格の道を複数受け付ける。
- Cmd は MOD で送る（Mac は Meta、ほかは Control。Mac の Chrome では Ctrl+A などが別の意味になるため）。
- 項目ごとに browser context を作り直す（IndexedDB が項目どうしで混ざらないように）。
  J25（2つのタブ）と J28（閉じて開き直す）は、1つの context の中で複数のページを使う。
- 試験用の画像は Pillow で作り、このファイルの隣の _work/ に置く。
- 共通の部品（audit_common.py）は他の担当と同時に作られるため、このファイルは自分の中だけで完結させた。
"""
import re, asyncio, json, math, os, sys, time, traceback
from pathlib import Path
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, '_work')
P = 'window.__playground'

# Cmd の操作は MOD で送る（Mac は Meta、ほかは Control）。Mac の Chrome では Ctrl+A は「行の頭へ」、Ctrl+I は効かないため、
# Control で送ると Mac で操作が空振りし、事故が起きないまま合格になる（試験台29 の夜に起きた）。
MOD = 'Meta' if sys.platform == 'darwin' else 'Control'

# 書体を両方の OS で同じにする：Google Fonts を止め、代わりの書体で測る（閾値はこの条件で決めた）。
# Mac では止めないと本物の書体が読まれて字の寸法が変わり、また display=block で最大3秒字が隠れて揺れる。
FONT_RE = re.compile(r'https://fonts\.(googleapis|gstatic)\.com/')
async def nofonts(ctx):
    await ctx.route(FONT_RE, lambda route: route.abort())

class PrepFail(Exception):
    pass

async def active_text(pg):
    # 書き換え中の要素（contenteditable）または入力欄の今の文字
    return await pg.evaluate("(()=>{const a=document.activeElement;if(!a)return null;if('value' in a&&a.tagName!=='BUTTON')return a.value;return a.isContentEditable?a.innerText:null})()")

async def caret_end(pg):
    # 書き換え中の要素の末尾にカーソル（Mac と Linux で End 系のキーの動きが違うので、選択の API で置く）
    await pg.evaluate("(()=>{const a=document.activeElement;if(!a||!a.isContentEditable)return;const r=document.createRange();r.selectNodeContents(a);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'))})()")
    await pg.wait_for_timeout(100)
OUT = 1420, 990          # 何もない所（右下の余白）

# ---------------------------------------------------------------- 共通の小道具
def make_images():
    from PIL import Image, ImageDraw
    os.makedirs(WORK, exist_ok=True)
    out = {}
    for name, (w, h), col in [('wide', (1200, 600), (180, 120, 90)), ('tall', (600, 1000), (90, 130, 160))]:
        p = os.path.join(WORK, f'parts_{name}.png')
        if not os.path.exists(p):
            im = Image.new('RGB', (w, h), col); d = ImageDraw.Draw(im)
            for i in range(0, max(w, h), 60): d.line([(i, 0), (0, i)], fill=(240, 230, 200), width=6)
            d.rectangle([10, 10, w - 10, h - 10], outline=(30, 30, 30), width=8)
            im.save(p)
        out[name] = p
    return out

def hook(pg):
    pg._e = []; pg._dlg = []
    pg.on('pageerror', lambda e: pg._e.append('PE ' + str(e)))
    pg.on('dialog', lambda d: (pg._dlg.append(d.type + ' ' + d.message), asyncio.ensure_future(d.dismiss())))

async def newpage(ctx, url):
    pg = await ctx.new_page(); hook(pg)
    await pg.goto(url); await pg.wait_for_timeout(1500)
    return pg

async def fresh(br, url, w=1440, h=1000):
    ctx = await br.new_context(viewport={'width': w, 'height': h})
    await nofonts(ctx)
    return await newpage(ctx, url)

async def scrollto(pg, id):
    await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(e)e.scrollIntoView({block:'center'})}", id)
    await pg.wait_for_timeout(250)

async def vb(pg, id):
    """画面上の位置（なければ None）"""
    return await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const r=e.getBoundingClientRect();if(r.width==0&&r.height==0)return null;return {x:r.x,y:r.y,w:r.width,h:r.height,py:r.y+scrollY}}", id)

async def esc_if_editing(pg):
    # P2 に合わせて手順を変えた（判定は同じ）：線 A2（P2）からは文字の箱を押して離すと書き換えに入る（押した所にカーソル）。
    # 部品を「選ぶ」クリックの後、書き換えに入っていたら（editingId() が null でない）Esc を1回＝箱を選んだだけ（Esc の後も選ばれたまま）。
    # P2 の無い版（試験台28・29）では書き換えに入らないので Esc を押さない（押すと選択が外れるため）
    if await pg.evaluate("!!(window.__playground&&window.__playground.editingId&&window.__playground.editingId())"):
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)

async def click(pg, id, dx=40, dy=12, mods=(), button='left', esc=True):
    await scrollto(pg, id); r = await vb(pg, id)
    for m in mods: await pg.keyboard.down(m)
    await pg.mouse.click(r['x'] + dx, r['y'] + dy, button=button)
    for m in mods: await pg.keyboard.up(m)
    await pg.wait_for_timeout(350)
    if esc and button == 'left': await esc_if_editing(pg)   # P2 に合わせて手順を変えた（判定は同じ）
    return r

async def dbl(pg, id, dx=60, dy=12):
    await scrollto(pg, id); r = await vb(pg, id)
    await pg.mouse.dblclick(r['x'] + dx, r['y'] + dy); await pg.wait_for_timeout(450); return r

async def out(pg):
    await pg.mouse.click(*OUT); await pg.wait_for_timeout(450)

async def sel(pg): return await pg.evaluate(f"{P}.selected()")
async def nops(pg): return await pg.evaluate(f"{P}.ops().length")
async def geom(pg, id): return (await pg.evaluate(f"{P}.geometry()")).get(id)
async def ids(pg): return await pg.evaluate("[...document.querySelectorAll('[data-el]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0||r.height>0}).map(e=>e.dataset.el)")
async def text(pg, id): return await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');return e?e.innerText:null}", id)

async def notices(pg):
    """ページの知らせ。今の試験台では #pgToast（.on で出る）、#publishToast（.on）、#saveStatus（上の並びの状態文字）、
    #publishBox（公開の確認の箱）。直し方が別の要素を使っても拾えるよう role=status/alert・aria-live・.toast・dialog も見る。
    saveStatus は常に出ている状態文字なので、ここには入れない（必要な項目で別に見る）。"""
    return await pg.evaluate("""(()=>{const out=[];const vis=e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!='hidden'&&cs.display!='none'&&cs.opacity!='0'};
      for(const e of document.querySelectorAll('#pgToast,#publishToast,[role=status],[role=alert],[aria-live],.toast,.pg-toast,[class*=toast],#publishBox.on,[role=dialog],dialog[open]'))
        if(e.id!='saveStatus'&&vis(e)&&e.innerText.trim()) out.push(e.innerText.trim().replace(/\\s+/g,' ').slice(0,80));
      return [...new Set(out)]})()""")

async def addphoto(pg, path):
    async with pg.expect_file_chooser() as fc:
        await pg.locator('#toolbar button', has_text='写真').first.click()
    await (await fc.value).set_files(path); await pg.wait_for_timeout(1500)
    s = await sel(pg); return s[0] if s else None

async def menu_items(pg):
    return await pg.evaluate("[...document.querySelectorAll('#fmenu button,[role=menu] button,[role=menuitem]')].filter(b=>b.offsetParent).map(b=>b.textContent.trim()+(b.disabled?'[x]':''))")

async def mdrag(pg, a, b, steps=15, hold=0):
    await pg.mouse.move(*a); await pg.mouse.down(); await pg.mouse.move(*b, steps=steps)
    if hold: await pg.wait_for_timeout(hold)
    await pg.mouse.up(); await pg.wait_for_timeout(500)

def r1(v): return round(v, 1) if isinstance(v, (int, float)) else v

# ---------------------------------------------------------------- 指（r2_touch/tb.py と同じ送り方）
class Touch:
    async def open(self, br, url, w=390, h=844, mobile=True):
        if mobile:
            self.ctx = await br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=3, is_mobile=True, has_touch=True)
            await nofonts(self.ctx)
        else:
            self.ctx = await br.new_context(viewport={'width': w, 'height': h})
            await nofonts(self.ctx)
        self.pg = await self.ctx.new_page(); hook(self.pg)
        self.cdp = await self.ctx.new_cdp_session(self.pg)
        await self.pg.goto(url); await self.pg.wait_for_timeout(1500); return self
    async def ev(self, s, a=None): return await self.pg.evaluate(s, a) if a is not None else await self.pg.evaluate(s)
    async def T(self, kind, pts):
        o = await self.ev("[visualViewport.offsetLeft,visualViewport.offsetTop]")
        await self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x - o[0], 'y': y - o[1], 'id': i} for (i, x, y) in pts]})
    async def tap(self, x, y, hold=60):
        await self.T('touchStart', [(0, x, y)]); await self.pg.wait_for_timeout(hold); await self.T('touchEnd', []); await self.pg.wait_for_timeout(150)
    async def lp(self, x, y, ms=700):
        await self.T('touchStart', [(0, x, y)]); await self.pg.wait_for_timeout(ms); await self.T('touchEnd', []); await self.pg.wait_for_timeout(200)
    async def swipe(self, x, y, dx, dy, step=10, dt=16):
        n = max(1, int(math.hypot(dx, dy) / step))
        await self.T('touchStart', [(0, x, y)]); await self.pg.wait_for_timeout(30)
        for k in range(1, n + 1):
            await self.T('touchMove', [(0, x + dx * k / n, y + dy * k / n)]); await self.pg.wait_for_timeout(dt)
        await self.T('touchEnd', []); await self.pg.wait_for_timeout(300)
    async def rect(self, s):
        s = s if s.startswith(('#', '.', '[')) else f'[data-el="{s}"]'
        return await self.ev("s=>{const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);if(c.display=='none')return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}}", s)
    async def center(self, id):
        await self.ev(f"document.querySelector('[data-el=\"{id}\"]').scrollIntoView({{block:'center'}})"); await self.pg.wait_for_timeout(250)
        return await self.rect(id)

# ================================================================ 項目
# ---- J8
# KNOWN: 値段の箱で Backspace→品が外れる
# 合格: 品カードの値段の箱（input.pb-amt）で End→Backspace を押しても、品（card_price_c_jonama / card_name_c_jonama）が
#       ページに残っていること（Backspace は欄の中の1文字を消すだけ）。
async def t_J8(br, url, imgs):
    pg = await fresh(br, url)
    try:
        await dbl(pg, 'card_price_c_jonama', 10, 10)
        num = pg.locator('input.pb-amt:visible')
        if not await num.count(): return False, '値段の箱（input.pb-amt）が開かない'
        before = await num.first.input_value()
        if await vb(pg, 'card_name_c_jonama') is None: return False, '準備失敗：値段の箱を開いただけで品が見えない'
        await num.first.click(); await pg.keyboard.press('End'); await pg.keyboard.press('Backspace'); await pg.wait_for_timeout(400)
        price = await vb(pg, 'card_price_c_jonama'); name = await vb(pg, 'card_name_c_jonama')
        val = await num.first.input_value() if await num.count() else '(箱が閉じた)'
        ok = price is not None and name is not None
        return ok, f'Backspace 後 品の値段={"あり" if price else "なし"} 品名={"あり" if name else "なし"} 欄 {before!r}→{val!r}'
    finally: await pg.context.close()

# ---- J11
# KNOWN: 上の「写真」「テキスト」で足したものを少し動かすと約1000px 下へ飛ぶ
# 合格: 上の「写真」で足した写真を (50,30) ドラッグすると、ページ上の位置が (50,30)±15 だけ動くこと。
#       上の「テキスト」で足した文字の箱も同じくドラッグして、縦に 100px より大きく飛ばないこと。
async def t_J11(br, url, imgs):
    msg = []; ok = True
    pg = await fresh(br, url)
    try:
        nid = await addphoto(pg, imgs['wide'])
        if not nid: return False, '写真を足しても選ばれない'
        r = await vb(pg, nid); a = (r['x'] + 30, r['y'] + 30)
        await mdrag(pg, a, (a[0] + 50, a[1] + 30), steps=10)
        r2 = await vb(pg, nid); dx, dy = r2['x'] - r['x'], r2['py'] - r['py']
        good = abs(dx - 50) <= 15 and abs(dy - 30) <= 15; ok &= good
        msg.append(f'写真 {nid} 動き=({r1(dx)},{r1(dy)})')
    finally: await pg.context.close()
    pg = await fresh(br, url)
    try:
        before = set(await ids(pg))
        await pg.locator('#toolbar button', has_text='テキスト').first.click(); await pg.wait_for_timeout(500)
        await pg.keyboard.type('X'); await out(pg)
        new = [i for i in await ids(pg) if i not in before]
        if not new: msg.append('テキストが足せない'); ok = False
        else:
            tid = new[0]; await click(pg, tid, 10, 8); r = await vb(pg, tid); a = (r['x'] + 10, r['y'] + 8)
            await mdrag(pg, a, (a[0] + 50, a[1] + 30), steps=10)
            r2 = await vb(pg, tid); dy = r2['py'] - r['py']
            good = abs(dy) <= 100; ok &= good
            msg.append(f'テキスト {tid} 縦の動き={r1(dy)}')
    finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- J12
# KNOWN: Shift+クリックの複数選択でドラッグが 5px しか動かない
# 合格: F_h0 をクリック→F_b0 を Shift+クリック→F_h0 を 5px 刻みで右へ 150px ドラッグすると、
#       F_h0 と F_b0 の両方が 140px 以上右へ動くこと。
async def t_J12(br, url, imgs):
    pg = await fresh(br, url)
    try:
        await click(pg, 'F_h0', 60); await click(pg, 'F_b0', 60, mods=['Shift'])
        s = await sel(pg)
        h0, b0 = await vb(pg, 'F_h0'), await vb(pg, 'F_b0'); a = (h0['x'] + 60, h0['y'] + 12)
        await pg.mouse.move(*a); await pg.mouse.down()
        for k in range(1, 31): await pg.mouse.move(a[0] + 5 * k, a[1]); await pg.wait_for_timeout(15)
        await pg.mouse.up(); await pg.wait_for_timeout(400)
        h1, b1 = await vb(pg, 'F_h0'), await vb(pg, 'F_b0')
        dh, db = h1['x'] - h0['x'], b1['x'] - b0['x']
        return dh >= 140 and db >= 140, f'選択 {s} 150px ドラッグ → F_h0 {r1(dh)}px / F_b0 {r1(db)}px'
    finally: await pg.context.close()

# ---- J13
# KNOWN: 複数削除が戻す1回で1つしか戻らない
# 合格: F_p0 と F_h1 を Shift+クリックで選んで Delete → Ctrl+Z を1回で、両方とも戻ること。
async def t_J13(br, url, imgs):
    pg = await fresh(br, url)
    try:
        await click(pg, 'F_p0', 100, 100); await click(pg, 'F_h1', 40, 12, mods=['Shift'])
        s = await sel(pg)
        await pg.keyboard.press('Delete'); await pg.wait_for_timeout(400)
        gone = (await vb(pg, 'F_p0') is None, await vb(pg, 'F_h1') is None)
        await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(500)
        back = (await vb(pg, 'F_p0') is not None, await vb(pg, 'F_h1') is not None)
        if not all(gone): return False, f'準備失敗：選択 {s} で Delete しても消えない {gone}'
        return all(back), f'選択 {s} Delete→戻す1回: F_p0 {"戻る" if back[0] else "なし"} / F_h1 {"戻る" if back[1] else "なし"}'
    finally: await pg.context.close()

# ---- J16
# KNOWN: ページの外・ヘッダーの上へドラッグできる
# 合格: F_h0 を (a) 画面の左端の外（x=5）へ、(b) ヘッダー（y=100）へドラッグした後も、
#       F_h0 が自分のセクション（.sec-wrap[data-sec=feature]）の枠の中に収まっていること（はみ出し 4px まで）。
#       止める・押し戻す・元に戻す、どの直し方でも合格。
async def t_J16(br, url, imgs):
    msg = []; ok = True
    for label, target in [('左の外', lambda a: (5, a[1])), ('ヘッダー', lambda a: (a[0], 100))]:
        pg = await fresh(br, url)
        try:
            r = await click(pg, 'F_h0', 60); r = await vb(pg, 'F_h0'); a = (r['x'] + 60, r['y'] + 12)
            # P2 に合わせて準備の確かめを足した（判定は同じ）：線 A2 で、書き換え中の箱の中のドラッグは文字の選択になり箱が動かない。
            # その空振りで「収まっている」と合格しないよう、ドラッグの途中で部品のドラッグになっている（isDragging）か、離した後に動いたことを確かめる
            await pg.mouse.move(*a); await pg.mouse.down(); await pg.mouse.move(*target(a), steps=20)
            dragging = await pg.evaluate("(()=>{const f=window.__playground.isDragging||(typeof PG!=='undefined'&&PG.isDragging);return !!(f&&f())})()")   # isDragging は試験用 API に無い版もあるので、ページの PG も見る
            await pg.mouse.up(); await pg.wait_for_timeout(500)
            e = await vb(pg, 'F_h0')
            if not dragging and e and abs(e['x'] - r['x']) < 1 and abs(e['y'] - r['y']) < 1:
                return False, f'準備失敗：{label} へのドラッグで F_h0 が動かない（部品のドラッグにならない）'
            s = await pg.evaluate("(()=>{const e=document.querySelector('.sec-wrap[data-sec=feature]')||document.querySelector('[data-sec=feature]');const r=e.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom}})()")
            inside = e and e['x'] >= s['x'] - 4 and e['x'] + e['w'] <= s['r'] + 4 and e['y'] >= s['y'] - 4 and e['y'] + e['h'] <= s['b'] + 4
            ok &= bool(inside)
            msg.append(f"{label}: F_h0 x={r1(e['x'])} y={r1(e['y'])} 枠 x={r1(s['x'])}..{r1(s['r'])} y={r1(s['y'])}..{r1(s['b'])}" if e else f'{label}: F_h0 なし')
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- J17
# KNOWN: 下のセクションの余白へドラッグで元のセクションが伸び勝手にスクロール
# 合格: 900px スクロールして F_b1 を ITEMS の見出しの下の余白へドラッグして離した後、
#       (1) 元の特集セクションの高さが 5px より伸びていない（または F_b1 が下のセクションへ移った）
#       (2) 画面のスクロールが 300px より勝手に動いていない
#       (3) F_b1 が画面の中に見えている
async def t_J17(br, url, imgs):
    pg = await fresh(br, url)
    try:
        await pg.mouse.move(700, 500); await pg.mouse.wheel(0, 900); await pg.wait_for_timeout(400)
        await click(pg, 'F_b1', 60); await pg.mouse.move(700, 500); await pg.mouse.wheel(0, 0)
        await pg.evaluate("scrollTo(0,900)"); await pg.wait_for_timeout(300)
        r = await vb(pg, 'F_b1'); hi = await vb(pg, 'I_hg'); a = (r['x'] + 60, r['y'] + 12)
        if not hi: return False, '準備失敗：ITEMS の見出し(I_hg)が見えない'
        ty = hi['y'] + hi['h'] + 60
        fh0 = await pg.evaluate("(document.querySelector('.sec-wrap[data-sec=feature]')).getBoundingClientRect().height")
        sy0 = await pg.evaluate('scrollY')
        await pg.mouse.move(*a); await pg.mouse.down()
        for k in range(1, 21): await pg.mouse.move(a[0], a[1] + (ty - a[1]) * k / 20); await pg.wait_for_timeout(20)
        await pg.mouse.up(); await pg.wait_for_timeout(600)
        fh1 = await pg.evaluate("(document.querySelector('.sec-wrap[data-sec=feature]')).getBoundingClientRect().height")
        sy1 = await pg.evaluate('scrollY'); e = await vb(pg, 'F_b1'); sec = await pg.evaluate(f"{P}.secOf('F_b1')")
        vh = await pg.evaluate('innerHeight')
        c1 = (fh1 - fh0) <= 5 or sec != 'feature'
        c2 = abs(sy1 - sy0) <= 300
        c3 = e is not None and e['y'] + e['h'] > 0 and e['y'] < vh
        return c1 and c2 and c3, f'特集の高さ {r1(fh0)}→{r1(fh1)} 所属={sec} scrollY {sy0}→{sy1} F_b1 画面y={r1(e["y"]) if e else None}'
    finally: await pg.context.close()

# ---- J18
# KNOWN: 足した写真の右クリックに写真の操作がない
# 合格: 上の「写真」で足した写真を右クリックした一覧に、写真の操作（「写真」か「範囲」を含む項目。例：写真を差し替える・見せる範囲・写真を外す）が1つ以上あること。
async def t_J18(br, url, imgs):
    pg = await fresh(br, url)
    try:
        nid = await addphoto(pg, imgs['wide'])
        if not nid: return False, '写真を足しても選ばれない'
        r = await vb(pg, nid); await pg.mouse.click(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2, button='right'); await pg.wait_for_timeout(350)
        m = await menu_items(pg)
        photo_ops = [x for x in m if ('写真' in x or '範囲' in x) and not x.endswith('[x]')]
        return bool(photo_ops), f'{nid} の右クリック一覧 {m}'
    finally: await pg.context.close()

# ---- J23
# KNOWN: 足したテキストに打った文字が読み込み直すと「テキスト」に戻る
# 合格: 上の「テキスト」で足した箱に「新しい文」と打って外をクリック→1.5秒待って読み込み直すと、「新しい文」がページに残っていること。
async def t_J23(br, url, imgs):
    pg = await fresh(br, url)
    try:
        before = set(await ids(pg))
        await pg.locator('#toolbar button', has_text='テキスト').first.click(); await pg.wait_for_timeout(500)
        await pg.keyboard.type('新しい文'); await pg.wait_for_timeout(200); await out(pg); await pg.wait_for_timeout(1500)
        new = [i for i in await ids(pg) if i not in before]
        t0 = await text(pg, new[0]) if new else None
        await pg.reload(); await pg.wait_for_timeout(1500)
        t1 = await text(pg, new[0]) if new else None
        found = await pg.evaluate("[...document.querySelectorAll('[data-el]')].some(e=>!e.querySelector('[data-el]')&&e.innerText.includes('新しい文'))")
        return bool(found), f'足した箱 {new[:1]} 打った後={t0!r} 読み込み直し後={t1!r}'
    finally: await pg.context.close()

# ---- J24
# KNOWN: ページ上部で足した写真が読み込み直すと約1440px 下へ
# 合格: ページの一番上で上の「写真」で写真を足し、外をクリック→1.5秒待って読み込み直した後、
#       その写真のページ上の位置（x と y）が足した直後と 20px 以内で同じこと。
async def t_J24(br, url, imgs):
    pg = await fresh(br, url)
    try:
        nid = await addphoto(pg, imgs['tall'])
        if not nid: return False, '写真を足しても選ばれない'
        await out(pg); await pg.wait_for_timeout(1200)
        a = await vb(pg, nid)
        await pg.reload(); await pg.wait_for_timeout(1500)
        b = await vb(pg, nid)
        if not b: return False, f'{nid} が読み込み直すと無い'
        ok = abs(b['py'] - a['py']) <= 20 and abs(b['x'] - a['x']) <= 20
        return ok, f'{nid} ページ上 y {r1(a["py"])}→{r1(b["py"])} x {r1(a["x"])}→{r1(b["x"])}'
    finally: await pg.context.close()

# ---- J25
# KNOWN: 2タブで片方の手直し・公開版が消える
# 再現: 同じ context に A・B の2ページを開く。A で見出しに「A」を足して公開。読み込み直していない B で本文に「B」を足す。
# 合格: A を読み込み直したとき、見出しの「A」・本文の「B」・公開した版がすべて残っていること。
#       または、B が古い中身であることを B の画面で知らせた（知らせの要素・確認の箱が出た）こと。
async def t_J25(br, url, imgs):
    ctx = await br.new_context(viewport={'width': 1440, 'height': 1000})
    await nofonts(ctx)
    try:
        a = await newpage(ctx, url); b = await newpage(ctx, url)
        await a.bring_to_front()
        await dbl(a, 'F_h0', 60); await a.keyboard.press('End'); await a.keyboard.type('A'); await out(a); await a.wait_for_timeout(1200)
        await a.evaluate('scrollTo(0,0)'); await a.locator('#tPublish').click(); await a.wait_for_timeout(700)
        if await a.evaluate("!!(document.getElementById('publishBox')&&document.getElementById('publishBox').classList.contains('on'))"):
            await a.locator('#publishBox button:visible', has_text='公開').last.click(); await a.wait_for_timeout(1000)
        await a.wait_for_timeout(800)
        pub_a = [v['id'] for v in await a.evaluate(f"{P}.versions()") if v.get('kind') == 'published']
        await b.bring_to_front(); await b.wait_for_timeout(500)
        warn = list(await notices(b)) + list(b._dlg)
        await dbl(b, 'F_b0', 60); await b.keyboard.press('End'); await b.keyboard.type('B'); await out(b); await b.wait_for_timeout(1500)
        warn += [x for x in list(await notices(b)) + list(b._dlg) if x not in warn]
        await a.bring_to_front(); await a.reload(); await a.wait_for_timeout(1500)
        h0 = await text(a, 'F_h0') or ''; b0 = await text(a, 'F_b0') or ''
        pub = [v['id'] for v in await a.evaluate(f"{P}.versions()") if v.get('kind') == 'published']
        kept = h0.rstrip().endswith('A') and b0.rstrip().endswith('B') and bool(pub)
        if not pub_a: return False, '準備失敗：A で公開できない'
        ok = kept or bool(warn)
        return ok, f'A 読み込み直し: 見出し末尾={h0.rstrip()[-3:]!r} 本文末尾={b0.rstrip()[-3:]!r} 公開した版={pub}（公開直後 {pub_a}） B の知らせ={warn[:3]}'
    finally: await ctx.close()

# ---- J26
# KNOWN: 保存失敗中の公開が「公開しました」と出るが残らない
# 準備: simulateSaveError(true)。見出しを書き換えて保存失敗の状態にする。
# 合格: 公開ボタンを押したとき (a)「公開しました」と知らせない（公開を止める・失敗を知らせる）、
#       または (b) 知らせた公開が本当に残る（保存が直ってから 10 秒以内に、読み込み直しても公開した版がある）。
async def t_J26(br, url, imgs):
    pg = await fresh(br, url)
    try:
        await pg.evaluate(f"{P}.simulateSaveError(true)")
        await dbl(pg, 'F_h0', 60); await pg.keyboard.press('End'); await pg.keyboard.type('E'); await out(pg); await pg.wait_for_timeout(1200)
        st = await pg.evaluate(f"{P}.saveState().status")
        await pg.evaluate('scrollTo(0,0)'); await pg.locator('#tPublish').click(); await pg.wait_for_timeout(500)
        if await pg.evaluate("!!(document.getElementById('publishBox')&&document.getElementById('publishBox').classList.contains('on'))"):
            await pg.locator('#publishBox button:visible', has_text='公開').last.click(); await pg.wait_for_timeout(300)
        n = await notices(pg)
        claimed = any('公開しました' in x and 'でき' not in x for x in n)
        if not claimed:
            # 黙って何も起きないのは不合格：知らせが出るか、公開ボタンが押せない形になっていること
            dis = await pg.evaluate("(()=>{const b=document.getElementById('tPublish');return !!b&&(b.disabled||b.getAttribute('aria-disabled')=='true')})()")
            return bool(n) or dis, f'保存状態={st} 公開を押した後の知らせ={n} 公開ボタン押せない={dis}'
        await pg.evaluate(f"{P}.simulateSaveError(false)")
        for _ in range(20):
            await pg.wait_for_timeout(500)
            if await pg.evaluate(f"{P}.saveState().status") == 'saved': break
        await pg.wait_for_timeout(300)
        await pg.reload(); await pg.wait_for_timeout(1500)
        pub = [v['id'] for v in await pg.evaluate(f"{P}.versions()") if v.get('kind') == 'published']
        return bool(pub), f'保存状態={st} 知らせ={n} → 保存が直って読み込み直した後の公開した版={pub}'
    finally: await pg.context.close()

# ---- J27
# KNOWN: 保存失敗が直っても自動で保存し直さない
# 準備: simulateSaveError(true)。F_h0 を選んで Shift+↓（10px 下げる）→ 保存失敗。simulateSaveError(false)。
# 合格: そのあと何も操作せずに 10 秒以内に保存し直され、読み込み直しても F_h0 が 10px 下がったままであること。
async def t_J27(br, url, imgs):
    pg = await fresh(br, url)
    try:
        g0 = await geom(pg, 'F_h0')
        await pg.evaluate(f"{P}.simulateSaveError(true)")
        await click(pg, 'F_h0', 60); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(1200)
        st1 = await pg.evaluate(f"{P}.saveState().status"); g1 = await geom(pg, 'F_h0')
        await pg.evaluate(f"{P}.simulateSaveError(false)")
        st2 = st1
        for _ in range(20):
            await pg.wait_for_timeout(500); st2 = await pg.evaluate(f"{P}.saveState().status")
            if st2 == 'saved': break
        await pg.wait_for_timeout(300)
        await pg.reload(); await pg.wait_for_timeout(1500)
        g2 = await geom(pg, 'F_h0')
        if abs(g1['y'] - g0['y']) < 5: return False, f'準備失敗：Shift+↓ で動かない {g0["y"]}→{g1["y"]}'
        ok = abs(g2['y'] - g1['y']) <= 1
        return ok, f'失敗中 状態={st1}・直して最大10秒後 状態={st2}・読み込み直し後 F_h0 y {r1(g0["y"])}→{r1(g1["y"])}→{r1(g2["y"])}'
    finally: await pg.context.close()

# ---- J28
# KNOWN: 0.5秒以内に閉じると最後の手直しが消える・警告なし
# 再現: F_h0 を選んで Shift+↓ の直後（約0.1秒）にタブを閉じる（beforeunload を走らせる）。同じ context で開き直す。
# 合格: 閉じるときに警告（beforeunload の箱）が出る、または開き直した F_h0 が 10px 下がったままであること。
async def t_J28(br, url, imgs):
    ctx = await br.new_context(viewport={'width': 1440, 'height': 1000})
    await nofonts(ctx)
    try:
        pg = await newpage(ctx, url)
        g0 = await geom(pg, 'F_h0')
        await click(pg, 'F_h0', 60); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(100)
        g1 = await geom(pg, 'F_h0')
        try: await asyncio.wait_for(pg.close(run_before_unload=True), 5)
        except asyncio.TimeoutError: pass
        await asyncio.sleep(1.0)
        warned = [d for d in pg._dlg if d.startswith('beforeunload')]
        # 警告が出て閉じるのを止めた場合（＝合格の道）、ページは開いたまま残る。
        # 残ったページは片付けずに置く（閉じ直すと beforeunload の箱がまた出て止まることがあるため。context ごと閉じる）
        pg2 = await newpage(ctx, url)
        g2 = await geom(pg2, 'F_h0')
        if abs(g1['y'] - g0['y']) < 5: return False, f'準備失敗：Shift+↓ で動かない'
        kept = abs(g2['y'] - g1['y']) <= 1
        return bool(warned) or kept, f'閉じる警告={warned[:1]} 開き直した F_h0 y {r1(g0["y"])}→{r1(g1["y"])}→{r1(g2["y"])}'
    finally:
        try: await asyncio.wait_for(ctx.close(), 10)
        except Exception: pass

# ---- J29
# KNOWN: ドラッグ中 Esc の後、離すと記録される
# 合格: F_h0 を (160,90) ドラッグしている途中で Esc → マウスを離した後、F_h0 が元の位置（±2px）にあり、手直しの記録（ops）が増えていないこと。
async def t_J29(br, url, imgs):
    pg = await fresh(br, url)
    try:
        r = await click(pg, 'F_h0', 40); r = await vb(pg, 'F_h0'); n0 = await nops(pg)
        await pg.mouse.move(r['x'] + 40, r['y'] + 12); await pg.mouse.down(); await pg.mouse.move(r['x'] + 200, r['y'] + 102, steps=10)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.mouse.up(); await pg.wait_for_timeout(500)
        e = await vb(pg, 'F_h0'); n1 = await nops(pg)
        ok = abs(e['x'] - r['x']) <= 2 and abs(e['py'] - r['py']) <= 2 and n1 == n0
        return ok, f'Esc→離す: F_h0 ({r1(r["x"])},{r1(r["py"])})→({r1(e["x"])},{r1(e["py"])}) 記録 {n0}→{n1}'
    finally: await pg.context.close()

# ---- J30
# KNOWN: iPad・横向きで指のスクロールが部品を動かす
# 合格: 指（タッチ）の端末 844x390（横向きスマホ）と 1024x768（iPad 横）で、選んでいない F_b0 の上から上へ 150px 指で払うと、
#       F_b0 の位置（geometry）が 2px より動かないこと（ページがスクロールするのは構わない）。
async def t_J30(br, url, imgs):
    msg = []; ok = True
    for w, h in [(844, 390), (1024, 768)]:
        t = await Touch().open(br, url, w, h)
        try:
            r = await t.center('F_b0'); g0 = await geom(t.pg, 'F_b0'); y0 = await t.ev('scrollY')
            await t.swipe(r['cx'], r['cy'], 0, -150)
            g1 = await geom(t.pg, 'F_b0'); y1 = await t.ev('scrollY')
            good = abs(g1['y'] - g0['y']) <= 2 and abs(g1['x'] - g0['x']) <= 2; ok &= good
            msg.append(f'{w}x{h}: F_b0 y {r1(g0["y"])}→{r1(g1["y"])} scrollY {y0}→{y1}')
        finally: await t.ctx.close()
    return ok, ' / '.join(msg)

# ---- J31
# KNOWN: スマホの見せる範囲で指に付いてこない
# 再現: 390x844 タッチ。F_p0 を長押し→「見せる範囲」。拡大の棒を指で右へ（拡大）。写真の上を指で 10px 刻みで右へ 120px 動かす。
# 合格: 写真の見える位置（cropState.display.ox）が指に付いてきて 90px 以上動くこと。
async def t_J31(br, url, imgs):
    t = await Touch().open(br, url)
    try:
        r = await t.center('F_p0'); await t.lp(r['cx'], r['cy'])
        m = await t.ev("[...document.querySelectorAll('#fmenu button')].filter(b=>b.offsetParent).map(b=>{const q=b.getBoundingClientRect();return [b.textContent.trim(),q.x+q.width/2,q.y+q.height/2]})")
        b = [x for x in m if '範囲' in x[0]]
        if not b: return False, f'準備失敗：長押しの一覧に「見せる範囲」がない {[x[0] for x in m]}'
        await t.tap(b[0][1], b[0][2]); await t.pg.wait_for_timeout(400)
        sl = await t.rect('#cropzoom input')
        if sl: await t.swipe(sl['x'] + 8, sl['cy'], 60, 0)
        cs = await t.ev(f"{P}.cropState('F_p0')")
        if not cs: return False, '準備失敗：見せる範囲に入らない'
        r = await t.rect('F_p0'); ox0 = cs['display']['ox']
        await t.swipe(r['cx'], r['cy'], 120, 0, step=10, dt=16)
        cs2 = await t.ev(f"{P}.cropState('F_p0')")
        d = cs2['display']['ox'] - ox0 if cs2 else None
        return d is not None and d >= 90, f'拡大 {cs["view"]["zoom"]:.2f} 指で 120px → 写真 {r1(d)}px'
    finally: await t.ctx.close()

# ---- J32
# KNOWN: 見せる範囲の中で窓を狭めると層が残る
# 再現: 1440x1000 で F_p0 をダブルクリック（見せる範囲）。拡大の棒をクリック。窓を 800x800 に狭める。
# 合格: 見せる範囲のときに写真に重なって出ていた層（部品の外の position:fixed/absolute の要素）がすべて、
#       狭めた後に「消えている」か「写真に付いてきている（写真の左端・上端または下端からのずれが前と 8px 以内）」こと。
OVL = """(()=>{const ph=document.querySelector('[data-el=F_p0]').getBoundingClientRect();const out=[];let n=0;
  for(const e of document.querySelectorAll('body *')){if(e.closest('[data-el]')||e.closest('#toolbar'))continue;const c=getComputedStyle(e);
    if(c.position!='fixed'&&c.position!='absolute')continue;if(c.display=='none'||c.visibility=='hidden')continue;const r=e.getBoundingClientRect();if(r.width<60||r.height<10)continue;
    if(!e.dataset.__ovl){e.dataset.__ovl='o'+(n++)+'_'+Date.now()%100000}
    out.push({k:e.dataset.__ovl,n:(e.id||e.className||e.tagName).toString().slice(0,20),x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,hit:r.left<ph.right&&r.right>ph.left&&r.top<ph.bottom+60&&r.bottom>ph.top})}
  return {ph:{x:ph.x,y:ph.y,b:ph.bottom,w:ph.width},o:out}})()"""
async def t_J32(br, url, imgs):
    pg = await fresh(br, url)
    try:
        await scrollto(pg, 'F_p0'); r = await vb(pg, 'F_p0')
        await pg.mouse.dblclick(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2); await pg.wait_for_timeout(450)
        if not await pg.evaluate(f"{P}.cropState('F_p0')"): return False, '準備失敗：見せる範囲に入らない'
        sl = await pg.evaluate("(()=>{const i=document.querySelector('#cropzoom input');if(!i)return null;const r=i.getBoundingClientRect();return [r.x+r.width*0.6,r.y+r.height/2]})()")
        if sl: await pg.mouse.click(*sl); await pg.wait_for_timeout(300)
        a = await pg.evaluate(OVL)
        layers = [o for o in a['o'] if o['hit']]
        if not layers: return False, '準備失敗：見せる範囲の層が見つからない'
        await pg.set_viewport_size({'width': 800, 'height': 800}); await pg.wait_for_timeout(800)
        b = await pg.evaluate(OVL); now = {o['k']: o for o in b['o']}; vw, vh = 800, 800
        bad = []
        # 窓を狭めると画面の倍率が変わり、写真も層も同じ割合で縮む。写真からのずれは写真の縮んだ割合 k を掛けて比べる（許す幅は同じ 8px）。
        # 2026-10-25 J32：前は倍率が変わらない前提で、写真の外へはみ出す拡大した写真（dim・bright）が、正しく付いてきていても置き去りに見えていた。直す前の main（c3915d3）はこの判定でも NG（DECISIONS #10）
        k = b['ph']['w'] / a['ph']['w'] if a['ph'].get('w') else 1
        for o in layers:
            n = now.get(o['k'])
            if not n: continue   # 消えた
            if n['x'] <= 1 and n['y'] <= 1 and n['w'] >= vw - 2 and n['h'] >= vh - 2: continue   # 画面全体を覆う暗幕は写真に付いてこなくてよい
            dx_ok = abs((n['x'] - b['ph']['x']) - k * (o['x'] - a['ph']['x'])) <= 8
            dy_ok = abs((n['y'] - b['ph']['y']) - k * (o['y'] - a['ph']['y'])) <= 8 or abs((n['y'] - b['ph']['b']) - k * (o['y'] - a['ph']['b'])) <= 8
            if not (dx_ok and dy_ok): bad.append(f"{o['n']}({r1(n['x'])},{r1(n['y'])})")
        return not bad, f'写真 ({r1(a["ph"]["x"])},{r1(a["ph"]["y"])})→({r1(b["ph"]["x"])},{r1(b["ph"]["y"])}) 倍率 {k:.3f} 置き去りの層={bad}'
    finally: await pg.context.close()

# ---- J46
# KNOWN: 部品を消してからセクションを複製すると複製に消した部品が戻る
# 合格: F_b1 を選んで Delete → 特集セクションを右クリック→「複製」した後、増えた部品の中に
#       消した F_b1 の写し（id が …F_b1 で終わるもの、または F_b1 と同じ文の箱）が無いこと。
async def t_J46(br, url, imgs):
    pg = await fresh(br, url)
    try:
        tb1 = (await text(pg, 'F_b1') or '').strip()
        await click(pg, 'F_b1', 40); await pg.keyboard.press('Delete'); await pg.wait_for_timeout(400)
        if await vb(pg, 'F_b1'): return False, '準備失敗：F_b1 が消えない'
        await pg.keyboard.press('Escape')
        before = set(await ids(pg))
        await pg.evaluate('scrollTo(0,0)'); await pg.wait_for_timeout(200)
        await pg.mouse.click(300, 500, button='right'); await pg.wait_for_timeout(300)
        loc = pg.locator('[data-sec-menu="複製"]:visible')
        if not await loc.count(): return False, '準備失敗：セクションの右クリックに「複製」がない'
        await loc.first.click(); await pg.wait_for_timeout(800)
        new = [i for i in await ids(pg) if i not in before]
        if not new: return False, '準備失敗：複製しても部品が増えない'
        back = [i for i in new if i.endswith('F_b1')]
        if tb1:
            same = await pg.evaluate("([ids,t])=>ids.filter(i=>{const e=document.querySelector('[data-el=\"'+i+'\"]');return e&&!e.querySelector('[data-el]')&&e.innerText.trim()===t})", [new, tb1])
            back += [i for i in same if i not in back]
        return not back, f'複製で増えた部品 {len(new)} 個・消した F_b1 の写し={back}'
    finally: await pg.context.close()

ITEMS = [('J8', t_J8), ('J11', t_J11), ('J12', t_J12), ('J13', t_J13), ('J16', t_J16), ('J17', t_J17), ('J18', t_J18),
         ('J23', t_J23), ('J24', t_J24), ('J25', t_J25), ('J26', t_J26), ('J27', t_J27), ('J28', t_J28), ('J29', t_J29),
         ('J30', t_J30), ('J31', t_J31), ('J32', t_J32), ('J46', t_J46)]

async def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    url = Path(sys.argv[1]).resolve().as_uri()
    want = [a.upper() for a in sys.argv[2:]]
    todo = [(k, f) for k, f in ITEMS if not want or k in want]
    unknown = [w for w in want if w not in dict(ITEMS)]
    if unknown: print('知らない ID:', unknown)
    imgs = make_images()
    nok = nng = 0; t00 = time.time()
    async with async_playwright() as p:
        br = await p.chromium.launch()
        for k, f in todo:
            t0 = time.time()
            try:
                ok, m = await asyncio.wait_for(f(br, url, imgs), timeout=120)
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
