# -*- coding: utf-8 -*-
"""回帰の確認：使いにくさ F のうち、セクション・お店の情報・括り・履歴・別ページ／別端末の戻す・速さ・
読み込み直し・保存失敗の文・変換中のボタン・Tab の順・キーで開く一覧・指（area = misc2）

使い方: python3 verify_audit_misc2.py /path/to/playgroundNN_single.html [ID ...]
  ID を並べるとその項目だけ（例: F22 F31）。省略で全部。
出力: 1項目1行 `OK F22 | 説明` / `NG F22 | 実際の値`。最後に `合計 OK x / NG y（n秒）`。終了コード＝NG の数。
環境変数 AUDIT_JOBS（既定 1）：同時に走らせる項目の数。F31（速さ）だけは、測りが揺れないよう、
ほかの項目が全部終わってから1つだけで走らせる。

担当（作業票 §5.3）: F22 F24 F25 F28 F29 F32 F31 F33 F34 F35 F36 F37 F38 F39 F40 F41 F43
  （表では F29・F32、F41・F43 が1行にまとまっているが、別の項目として出す）

判定の決まり（TESTBRIEF2.md）
- 本物のマウス・キーボード・指（CDP の Input.dispatchTouchEvent。audit/r2_touch/tb.py の送り方）・
  日本語の変換（CDP の Input.imeSetComposition / insertText。verify_audit_text.py の送り方）で操作する。
  window.__playground は状態を読むのと準備（セクションを40個足す・保存の失敗をまねる・ページを移す）だけ。
- Cmd の操作は MOD で送る（Mac は Meta、ほかは Control）。文字を全部選ぶときは MOD+a の後に、
  本当に全部選べたか（getSelection の文字数）を確かめる。
- 各項目で「操作が本当に起きたか（準備が成り立ったか）」を確かめ、成り立たなければ
  `NG <ID> | 準備失敗：…` にする（空振りの合格を作らない）。
- 知らせ＝#pgToast・role=status/alert/alertdialog・aria-live・.toast・class/id に toast を含むもの・
  開いた dialog/role=dialog と confirm/alert の箱。数秒で消えるので、ページに入れた見張り（80ms ごと）が
  出た文字と「戻す」ボタンの有無を記録する（verify_audit_page.py のやり方）。上の並び（#toolbar）の中は数えない。
- context を作った直後に Google Fonts（fonts.googleapis.com / fonts.gstatic.com）を止める（Mac で本物の書体が入ると字の寸法が変わり、閾値がずれるため）。
- 項目ごとに browser context を作り直す（IndexedDB・localStorage が項目どうしで混ざらないように）。
  F35（読み込み直し）は1つの context の中で読み込み直す。
- 試験用の画像は使わない（この担当の項目は写真の取り込みが要らない）。
"""
import asyncio, json, math, os, re, statistics, sys, time, pathlib
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, '_work')
P = 'window.__playground'
OUT = (1420, 990)   # 何もない所（右下の余白）

# Cmd の操作は MOD で送る（Mac は Meta、ほかは Control）。Mac の Chrome では Ctrl+A は「行の頭へ」、
# Ctrl+I は効かないため、Control で送ると Mac で操作が空振りして合格になる。
MOD = 'Meta' if sys.platform == 'darwin' else 'Control'

class PrepFail(Exception):
    pass

# ---------------------------------------------------------------- 知らせの見張り（ページに入れる）
NOTICE_WATCH = r"""
(()=>{ window.__auditNotices=[]; const seen=new Map();
  const SEL='#pgToast,.pg-toast,[role=status],[role=alert],[role=alertdialog],[aria-live],.toast,[class*=toast],[id*=toast],[id*=Toast],[role=dialog],dialog[open]';
  const vis=e=>{const cs=getComputedStyle(e), r=e.getBoundingClientRect();return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.05};
  setInterval(()=>{ try{
    for(const e of document.querySelectorAll(SEL)){
      if(e.id==='publishToast') continue;                 // 「公開しました」は消える知らせでない
      if(e.closest && e.closest('#toolbar')) continue;    // 保存の状態などは知らせに数えない
      const t=(e.innerText||'').trim();
      if(vis(e)&&t){
        const undo=[...e.querySelectorAll('button,a,[role=button]')].some(b=>vis(b)&&/戻す|取り消/.test((b.textContent||'')+(b.title||'')+(b.getAttribute('aria-label')||'')));
        const key=t+'|'+undo;
        const c=e.cloneNode(true); c.querySelectorAll('button,a,[role=button]').forEach(b=>b.remove());
        const body=(c.textContent||'').replace(/\s+/g,' ').trim().slice(0,120);   // ボタン（「戻す」など）の文字を除いた知らせの文
        if(seen.get(e)!==key){ seen.set(e,key); window.__auditNotices.push({t:t.replace(/\s+/g,' ').slice(0,120),body,undo}); }
      } else seen.delete(e);
    } }catch(_){} },80);
})();
"""
NOTICE_SEL = '#pgToast,.pg-toast,[role=status],[role=alert],[role=alertdialog],[aria-live],.toast,[class*=toast],[id*=toast],[id*=Toast],[role=dialog],dialog[open]'

# longtask を記録する（audit/r2_ime/s6.py・s8.py と同じ考え方）
# あわせて PerformanceEventTiming（入力から次の描画までの event の duration）も、使えれば window.__ev に記録する
LT_OBS = "(()=>{window.__lt=[];window.__ev=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push(Math.round(e.duration))}).observe({type:'longtask',buffered:false})}catch(e){window.__lt=null}try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__ev.push(Math.round(e.duration))}).observe({type:'event',durationThreshold:16,buffered:false})}catch(e){window.__ev=null}})()"

# ---------------------------------------------------------------- 共通の小道具
FONTS = re.compile(r'https://fonts\.(googleapis|gstatic)\.com/')
async def no_fonts(ctx):
    # Google Fonts を止める（Mac では本物の書体で字の寸法が変わり、F36 のボタンの位置などの閾値がずれるため）
    await ctx.route(FONTS, lambda route: route.abort())

def hook(pg):
    pg._e = []; pg._dlg = []
    pg.on('pageerror', lambda e: pg._e.append('PE ' + str(e)))
    pg.on('dialog', lambda d: (pg._dlg.append(d.type + ' ' + d.message), asyncio.ensure_future(d.dismiss())))

async def fresh(br, url, w=1440, h=1000, **kw):
    ctx = await br.new_context(viewport={'width': w, 'height': h}, **kw)
    await no_fonts(ctx)
    await ctx.add_init_script(NOTICE_WATCH)
    pg = await ctx.new_page(); hook(pg)
    await pg.goto(url); await pg.wait_for_timeout(1600)
    return pg

def ev(pg, js, *a): return pg.evaluate(js, *a)

async def bb(pg, id):
    return await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const r=e.getBoundingClientRect();if(r.width==0&&r.height==0)return null;return {x:r.x,y:r.y,w:r.width,h:r.height,ay:r.y+scrollY}}", id)

async def cssbb(pg, css):
    return await pg.evaluate("c=>{const e=[...document.querySelectorAll(c)].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right}}", css)

async def scrollto(pg, id):
    await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(e)e.scrollIntoView({block:'center'})}", id)
    await pg.wait_for_timeout(250)

async def esc_if_editing(pg):
    # P2 に合わせて手順を変えた（判定は同じ）：線 A2（P2）からは文字の箱を押して離すと書き換えに入る（押した所にカーソル）。
    # 部品を「選ぶ」クリックの後、書き換えに入っていたら（editingId() が null でない）Esc を1回＝箱を選んだだけ（Esc の後も選ばれたまま）。
    # P2 の無い版（試験台28・29）では書き換えに入らないので Esc を押さない（押すと選択が外れるため）
    if await pg.evaluate("!!(window.__playground&&window.__playground.editingId&&window.__playground.editingId())"):
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)

async def click(pg, id, dx=None, dy=None, n=1, button='left', scroll=True, esc=True):
    if scroll: await scrollto(pg, id)
    r = await bb(pg, id)
    if not r: raise PrepFail('準備失敗：部品が無い ' + id)
    x = r['x'] + (dx if dx is not None else min(40, r['w'] / 2)); y = r['y'] + (dy if dy is not None else min(12, r['h'] / 2))
    await pg.mouse.click(x, y, click_count=n, button=button); await pg.wait_for_timeout(350)
    if esc and n == 1 and button == 'left': await esc_if_editing(pg)   # P2 に合わせて手順を変えた（判定は同じ）
    return r

async def clickcss(pg, css, wait=350):
    r = await cssbb(pg, css)
    if not r: raise PrepFail('準備失敗：見つからない ' + css)
    await pg.mouse.click(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2); await pg.wait_for_timeout(wait)

FIND_BTN = """([root,pats])=>{const R=document.querySelector(root)||document;const vis=b=>{const q=b.getBoundingClientRect();const c=getComputedStyle(b);return q.width>0&&q.height>0&&c.visibility!=='hidden'&&c.display!=='none'};
  const all=[...R.querySelectorAll('button,a,[role=button],[role=menuitem]')].filter(vis);
  for(const p of pats){const re=new RegExp(p);const e=all.find(b=>re.test((b.textContent||'').trim())||re.test(b.title||'')||re.test(b.getAttribute('aria-label')||'')||Object.values(b.dataset||{}).some(v=>re.test(v)));
    if(e){const q=e.getBoundingClientRect();return {x:q.x+q.width/2,y:q.y+q.height/2,w:q.width,h:q.height,dis:!!e.disabled||e.getAttribute('aria-disabled')==='true',t:(e.textContent||'').trim().slice(0,30)}}}
  return null}"""

async def findbtn(pg, root, pats):
    """root の中の見えているボタンを、文字・title・aria-label・data 属性の複数の候補（正規表現）で探す"""
    return await pg.evaluate(FIND_BTN, [root, pats if isinstance(pats, list) else [pats]])

async def clickbtn(pg, root, pats, wait=450):
    r = await findbtn(pg, root, pats)
    if not r: return None
    await pg.mouse.click(r['x'], r['y']); await pg.wait_for_timeout(wait)
    return r

async def esc2(pg):
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250)

async def gopage(pg, pid):   # 準備：ページを移す（API）
    await ev(pg, f"{P}.setPage('{pid}')"); await pg.wait_for_timeout(700)

async def clear_notices(pg):
    await ev(pg, "window.__auditNotices&&(window.__auditNotices.length=0)"); pg._dlg.clear()

async def notices(pg, wait=250):
    await pg.wait_for_timeout(wait)
    return (await ev(pg, "window.__auditNotices||[]")) + [{'t': '[箱] ' + d, 'undo': False} for d in pg._dlg]

def ntext(ns): return [n['t'] for n in ns]

async def visible_notice_texts(pg):
    """今見えている知らせの文（操作の直前に取り、後で「新しい知らせ」から除く）"""
    return await ev(pg, """sel=>[...document.querySelectorAll(sel)].filter(e=>{if(e.closest('#toolbar')||e.id==='publishToast')return false;const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'&&parseFloat(c.opacity)>0.05&&(e.innerText||'').trim()}).map(e=>(e.innerText||'').trim().replace(/\\s+/g,' ').slice(0,120))""", NOTICE_SEL)

def new_notices(ns, before, word_re):
    """操作の直前に見えていた文を除いた新しい知らせのうち、ボタンを除いた文が word_re に合うもの"""
    return [n for n in ns if n['t'] not in before and re.search(word_re, n.get('body', n['t']))]

async def active_text(pg):
    return await pg.evaluate("(()=>{const a=document.activeElement;if(!a)return null;if('value' in a&&a.tagName!=='BUTTON')return a.value;return a.isContentEditable?a.innerText:null})()")

async def select_all_checked(pg):
    """書き換え中に MOD+a で全部選び、本当に全部選べたかを getSelection の文字数で確かめる"""
    await pg.keyboard.press(f'{MOD}+a'); await pg.wait_for_timeout(120)
    s = await pg.evaluate("(()=>{const a=document.activeElement;const g=getSelection();if(a&&'value' in a&&a.tagName!=='BUTTON')return [a.selectionEnd-a.selectionStart,a.value.length];const t=(a&&a.isContentEditable)?a.innerText.replace(/\\n$/,''):'';return [g.toString().replace(/\\n$/,'').length,t.length]})()")
    if s[1] == 0 or s[0] < s[1]:
        raise PrepFail(f'準備失敗：{MOD}+a で全部選べない（選択 {s[0]} / 文字 {s[1]}）')

async def text_edit(pg, id, txt):
    """ダブルクリックで書き換え→全部選んで置き換え（全部選べたか確かめる）→Esc で終える"""
    await click(pg, id, n=2); await pg.wait_for_timeout(250)
    if await ev(pg, f"{P}.editingId()") is None:
        await click(pg, id, n=2, scroll=False); await pg.wait_for_timeout(250)
    if await ev(pg, f"{P}.editingId()") is None: raise PrepFail(f'準備失敗：{id} の書き換えに入れない')
    await select_all_checked(pg)
    if txt == '': await pg.keyboard.press('Delete')
    else: await pg.keyboard.insert_text(txt)
    await pg.wait_for_timeout(150)
    now = await active_text(pg)
    if now is None or now.strip() != txt:
        raise PrepFail(f'準備失敗：{id} を {txt!r} に書き換えられない（今 {now!r}）')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)

async def navpt(pg, label):
    """ヘッダーのナビの文字の真ん中（画面の座標）"""
    return await pg.evaluate("l=>{const a=[...document.querySelectorAll('[data-el=\"header__nav\"] *')].filter(e=>e.children.length==0&&e.textContent.trim()===l&&e.getBoundingClientRect().width>0)[0];if(!a)return null;const r=a.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}", label)

async def device(pg):
    """今の表示の端末（上の並びの PC／スマホ のどちらが押されているか。読めなければ API の inputMode は使わない）"""
    return await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#toolbar button')].filter(b=>/^(PC|スマホ)$/.test(b.textContent.trim())&&(b.classList.contains('on')||b.getAttribute('aria-pressed')==='true'));return b.length?b[0].textContent.trim():null})()")

async def devclick(pg, d):
    await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(100)
    r = await findbtn(pg, '#toolbar', [f'^{d}$'])
    if not r: raise PrepFail(f'準備失敗：上の並びに「{d}」が無い')
    await pg.mouse.click(r['x'], r['y']); await pg.wait_for_timeout(900)
    if await device(pg) != d: raise PrepFail(f'準備失敗：「{d}」を押しても {d} にならない（今 {await device(pg)}）')

async def sections(pg): return [s['id'] for s in await ev(pg, f"{P}.sectionList()")]

def r1(v): return round(v, 1) if isinstance(v, (int, float)) else v

# ---------------------------------------------------------------- 指（r2_touch/tb.py と同じ送り方）
class Touch:
    async def open(self, br, url, w=390, h=844, mobile=True):
        if mobile:
            self.ctx = await br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=3, is_mobile=True, has_touch=True)
        else:
            self.ctx = await br.new_context(viewport={'width': w, 'height': h}, has_touch=True)
        await no_fonts(self.ctx)
        await self.ctx.add_init_script(NOTICE_WATCH)
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
        return await self.ev("s=>{const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);if(c.display=='none')return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,r:r.right,b:r.bottom}}", s)
    async def center(self, id):
        await self.ev(f"document.querySelector('[data-el=\"{id}\"]').scrollIntoView({{block:'center'}})"); await self.pg.wait_for_timeout(250)
        return await self.rect(id)
    async def sel(self): return await self.ev(f"{P}.selected()")

# ================================================================ 項目
# セクションの中で、部品・ボタンに当たらない所（右クリックでセクションの一覧を出す所）
SECPT = """s=>{const h=document.getElementById('host_'+s);if(!h)return null;const r=h.getBoundingClientRect();
  const y0=Math.max(r.top+4,70),y1=Math.min(r.bottom-4,innerHeight-4);
  for(let y=y0;y<y1;y+=17)for(let x=r.left+6;x<r.right-6;x+=23){const e=document.elementFromPoint(x,y);if(e&&e.closest('#sectionwrap .host')===h&&!e.closest('[data-el]')&&!e.closest('button,[data-handle]'))return [x,y]}return null}"""

async def secmenu(pg, sec):
    """セクションの何もない所を右クリックして、出た一覧（[文字, 押せるか]）を返す"""
    await ev(pg, f"document.getElementById('host_{sec}').scrollIntoView()"); await pg.wait_for_timeout(300)
    pt = await ev(pg, SECPT, sec)
    if not pt: raise PrepFail(f'準備失敗：セクション {sec} に右クリックできる何もない所が無い')
    await pg.mouse.click(*pt, button='right'); await pg.wait_for_timeout(400)
    return await ev(pg, "[...document.querySelectorAll('#fmenu button,[role=menu] button,[role=menuitem]')].filter(b=>b.offsetParent).map(b=>[b.textContent.trim(),!(b.disabled||b.getAttribute('aria-disabled')==='true')])")

async def visible_px(pg, css):
    """要素が画面（上の並びの下）に見えている高さ"""
    return await ev(pg, "c=>{const e=document.querySelector(c);if(!e)return -1;const r=e.getBoundingClientRect();const tb=document.getElementById('toolbar');const top=tb?tb.getBoundingClientRect().bottom:0;return Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,top))}", css)

async def live_undo_btn(pg):
    """今見えている知らせの中の「戻す」ボタン（無ければ None）"""
    return await ev(pg, """sel=>{const vis=e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'&&parseFloat(c.opacity)>0.05};
      for(const n of document.querySelectorAll(sel)){if(n.closest('#toolbar')||!vis(n))continue;
        const b=[...n.querySelectorAll('button,a,[role=button]')].find(b=>vis(b)&&/戻す|取り消/.test((b.textContent||'')+(b.title||'')+(b.getAttribute('aria-label')||'')));
        if(b){const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,b.textContent.trim()]}}return null}""", NOTICE_SEL)

# ---- F22
# 作業票: セクションの複製・上へ・下へ・削除で、短い知らせと「戻す」。複製・移動の後はそのセクションが見える所へ
#         スクロール。出せない操作は灰色にする（消さない）
# 再現: TOP の特集セクションの何もない所を右クリック→「複製」／「下へ」／「削除」、商品セクションで「上へ」。
#       28 では知らせが出ず、複製・移動したセクションは画面の外（下）に行ったまま。最初のセクションの一覧に
#       「上へ」が無い（消えている）。
# 合格: (1) 4つの操作それぞれで、知らせ（見張りで拾う）が出て、その知らせに「戻す」ボタンがある。その「戻す」を
#       本物のクリックで押すと、セクションの並びが操作の前に戻る。
#       (2) 複製・上へ・下へ の後、複製でできた／動いたセクションが画面に 200px 以上見えている。
#       (3) 最初のセクションの一覧に「上へ」、最後のセクションの一覧に「下へ」が、押せない（disabled）形で出ている。
#       一覧の文言は候補の並び（SECOPS）で探す。見つからないときは「その道具がない」の NG。
# 準備の確かめ: 各操作の後に sectionList() の並びが本当に変わったこと（変わらなければ準備失敗）。
SECOPS = {'複製': ['^(複製|コピーを作る)'], '上へ': ['^(上へ|上に)'], '下へ': ['^(下へ|下に)'], '削除': ['^(削除|消す)']}
async def t_F22(new):
    bad = []; msg = []
    async def op(label, sec):
        pg = await new()
        before = await sections(pg)
        m = await secmenu(pg, sec)
        names = [x[0] for x in m]
        await clear_notices(pg)
        if not await clickbtn(pg, '#fmenu,[role=menu]', SECOPS[label], 150):
            bad.append(f'{sec} の一覧に「{label}」の道具がない {names}'); msg.append(f'{label}: 道具なし'); return
        ub = await live_undo_btn(pg)
        await pg.wait_for_timeout(700)
        after = await sections(pg)
        if after == before: raise PrepFail(f'準備失敗：「{label}」を押してもセクションの並びが変わらない {before}')
        ns = await notices(pg, 0)
        has_undo = any(n['undo'] for n in ns) or bool(ub)
        part = f'{label}: 知らせ {ntext(ns)[:1] or "なし"}・戻す={"あり" if has_undo else "なし"}'
        if not ns: bad.append(f'{label}の知らせなし')
        elif not has_undo: bad.append(f'{label}の知らせに戻すなし')
        if label != '削除':
            tgt = [s for s in after if s not in before][0] if label == '複製' else sec
            vp = await visible_px(pg, f'#host_{tgt}')
            part += f'・{tgt} の見えている高さ {r1(vp)}px'
            if vp < 200: bad.append(f'{label}の後 {tgt} が見えない({r1(vp)}px)')
        ub = ub or await live_undo_btn(pg)
        if ub:
            await pg.mouse.click(ub[0], ub[1]); await pg.wait_for_timeout(700)
            back = await sections(pg)
            part += f'・知らせの戻すで {"元どおり" if back == before else back}'
            if back != before: bad.append(f'{label}の知らせの戻すで戻らない')
        msg.append(part)
    await op('複製', 'feature'); await op('下へ', 'feature'); await op('上へ', 'items'); await op('削除', 'feature')
    pg = await new()
    m1 = await secmenu(pg, 'feature'); await esc2(pg)
    m2 = await secmenu(pg, 'items'); await esc2(pg)
    def gray(m, label): return any(re.search('|'.join(SECOPS[label]), x[0]) and not x[1] for x in m)
    g = f'最初の一覧 {[x[0] + ("" if x[1] else "[灰]") for x in m1]} / 最後の一覧 {[x[0] + ("" if x[1] else "[灰]") for x in m2]}'
    if not gray(m1, '上へ'): bad.append('最初のセクションに灰色の「上へ」なし')
    if not gray(m2, '下へ'): bad.append('最後のセクションに灰色の「下へ」なし')
    msg.append(g)
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

async def publish_box_text(pg):
    """上の並びの「公開」を本物のクリックで押し、出た公開前の確認（#publishBox・dialog・confirm の箱）の文字を返す。
    確認が出ずにそのまま公開されたら ''"""
    await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(150); pg._dlg.clear()
    r = await findbtn(pg, '#toolbar', ['^公開$', '公開'])
    if not r:
        await clickbtn(pg, '#toolbar', ['その他']); r = await findbtn(pg, 'body', ['^公開$'])
    if not r: raise PrepFail('準備失敗：「公開」が見つからない')
    await pg.mouse.click(r['x'], r['y']); await pg.wait_for_timeout(900)
    t = await ev(pg, """(()=>{const vis=e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'};
      return [...document.querySelectorAll('#publishBox,[role=dialog],[role=alertdialog],dialog[open]')].filter(vis).map(e=>e.innerText.replace(/\\s+/g,' ')).join(' / ')})()""")
    return (t + ' ' + ' '.join(pg._dlg)).strip()

# ---- F24
# 作業票: お店の情報の電話・住所が空や電話でない値なら、公開前の確認に出す
# 再現: アクセスのページで、電話の値（contact__ci_tel）をダブルクリック→全部選んで「でんわ」／空 にする、
#       住所（contact__ci_addr）を空にする → 上の「公開」。28 では確認が出ず、そのまま公開される。
# 合格: 3つの場合（電話＝「でんわ」、電話＝空、住所＝空）それぞれで、「公開」を押したときの確認の箱、または
#       publishCheck() の項目に、その欄（「電話」／「住所」の語、または contact__ci_tel / contact__ci_addr）が出る。
#       ただし決まり文句で通らないよう、正しい値のまま（同じ値で書き換えて）公開を押した対照をとり、対照では出ない
#       項目（publishCheck は対照に無い文、確認の箱はその語の数が対照より多い）が出ることを条件にする。
# 準備の確かめ: 書き換えの後、その欄の表示が本当に「でんわ」／空になっていること（MOD+a で全部選べたかも確かめる）。
async def t_F24(new):
    bad = []; msg = []
    # 対照：正しい値のまま（同じ値で書き換えて）公開を押したときの確認の箱と publishCheck
    pg = await new(); await gopage(pg, 'pg_contact')
    tel0 = await ev(pg, "(document.querySelector('[data-el=contact__ci_tel]')||{}).innerText||''")
    await text_edit(pg, 'contact__ci_tel', tel0.strip()); await esc2(pg)
    ctrl_pc = {i['text'] for i in await ev(pg, f"{P}.publishCheck()")}
    ctrl_box = await publish_box_text(pg)
    msg.append(f'対照（正しい値）: 確認の箱「{ctrl_box[:40]}」 publishCheck {len(ctrl_pc)} 件')
    for fid, val, word in [('contact__ci_tel', 'でんわ', '電話'), ('contact__ci_tel', '', '電話'), ('contact__ci_addr', '', '住所')]:
        pg = await new(); await gopage(pg, 'pg_contact')
        await text_edit(pg, fid, val); await esc2(pg)
        shown = await ev(pg, "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');return e?e.innerText.trim():''}", fid)
        if shown != val: raise PrepFail(f'準備失敗：{fid} が {val!r} にならない（{shown!r}）')
        pc = await ev(pg, f"{P}.publishCheck()")
        in_pc = [i['text'] for i in pc if (fid in (i.get('parts') or []) or word in (i.get('text') or '')) and i['text'] not in ctrl_pc]
        box = await publish_box_text(pg)
        in_box = box.count(word) > ctrl_box.count(word)   # 対照では出ない「電話」「住所」が、変な値のときだけ出る
        lab = f'{word}={val or "空"}'
        msg.append(f'{lab}: 確認の箱「{box[:50]}」 publishCheck {in_pc[:1] or "なし"}')
        if not (in_box or in_pc): bad.append(f'{lab} が確認に出ない')
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

CAT_OF = "p=>{for(const m of window.__playground.menuView())for(const c of m.cats)if(c.rows.some(r=>r.id===p||r._placementId===p))return c.name;return null}"

# ---- F25
# 作業票: お品書きの行を別の括りに移したら知らせ
# 再現: お品書きのページで、焼き菓子の「どら焼き」の行（menu__row_name_plc_dora_t）を、餅菓子の「桜餅」の行の
#       上へマウスでドラッグして離す。28 では行は餅菓子へ移るが、知らせは出ない。
# 合格: 離した後に、離す直前に見えていなかった新しい知らせ（見張りで拾う。数秒で消えるものも）が出て、その文
#       （ボタンの文字を除く）に、移した先の括りの名前（餅菓子）か「移」が入っている。
# 準備の確かめ: menuView() で、どら焼きの括りが「焼き菓子」から別の括りに本当に変わったこと。
async def t_F25(new):
    pg = await new(); await gopage(pg, 'pg_menu')
    rid = 'plc_dora_t'
    c0 = await ev(pg, CAT_OF, rid)
    await scrollto(pg, 'menu__row_name_plc_dora_t')
    a = await bb(pg, 'menu__row_name_plc_dora_t'); b = await bb(pg, 'menu__row_name_plc_sakura_t')
    if not a or not b: raise PrepFail('準備失敗：どら焼き・桜餅の行が見えない')
    await clear_notices(pg); before = await visible_notice_texts(pg)
    await pg.mouse.move(a['x'] + 30, a['y'] + 10); await pg.mouse.down()
    await pg.mouse.move(b['x'] + 30, b['y'] + 2, steps=15); await pg.wait_for_timeout(200)
    await pg.mouse.up(); await pg.wait_for_timeout(900)
    c1 = await ev(pg, CAT_OF, rid)
    if c1 == c0: raise PrepFail(f'準備失敗：ドラッグしても括りが変わらない（{c0}）')
    ns = await notices(pg); hit = new_notices(ns, before, re.escape(c1) + '|移')
    return bool(hit), f'どら焼き {c0}→{c1}、新しい知らせ {ntext(ns)[:2] or "なし"}・移した先の括りの名前か「移」を含む={ntext(hit)[:1] or "なし"}'

HPANEL = """(()=>{const h=document.getElementById('historyPanel');if(!h)return null;const r=h.getBoundingClientRect();const c=getComputedStyle(h);
  return {vis:r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'&&parseFloat(c.opacity)>0.05&&r.left<innerWidth-4&&r.right>4&&r.bottom>4&&r.top<innerHeight-4,x:Math.round(r.x),w:Math.round(r.width)}})()"""

async def open_history(pg):
    await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(100)
    r = await clickbtn(pg, '#toolbar', ['^履歴$', '履歴'], 500)
    if not r:
        await clickbtn(pg, '#toolbar', ['その他']); r = await clickbtn(pg, 'body', ['^履歴$'], 500)
    if not r: raise PrepFail('準備失敗：「履歴」が見つからない')
    h = await ev(pg, HPANEL)
    if not h or not h['vis']: raise PrepFail(f'準備失敗：「履歴」を押しても履歴の板が出ない {h}')

# ---- F28
# 作業票: 履歴の板は Esc と外のクリックで閉じる。開いていても「プレビュー」「公開」が押せる
# 再現: 上の「履歴」を押して板を開く → Esc／ページの真ん中をクリック。28 では板が開いたまま。
#       板は画面の右に高さいっぱいに出て、上の並びの「プレビュー」「公開」の上にかぶり、押しても届かない。
# 合格: (1) Esc で板が閉じる（見えなくなる・画面の外へ出る）。(2) 板の外（ページの真ん中）のクリックで閉じる。
#       (3) 板を開いたまま、上の並びの「プレビュー」の真ん中を本物のクリック → プレビューに入る（previewMode()）。
#       (4) 板を開いたまま「公開」の真ん中を本物のクリック → 公開前の確認が出るか、版が1つ増える（versions()）。
# 準備の確かめ: 「履歴」を押した後に板（#historyPanel）が本当に見えていること。公開の前に F_h0 を1つ動かして手直しを作る。
async def t_F28(new):
    bad = []; msg = []
    pg = await new(); await open_history(pg)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    h = await ev(pg, HPANEL); msg.append(f'Esc 後 板={"出たまま" if h and h["vis"] else "閉じた"}')
    if h and h['vis']: bad.append('Esc で閉じない')
    pg = await new(); await open_history(pg)
    await pg.mouse.click(600, 600); await pg.wait_for_timeout(400)
    h = await ev(pg, HPANEL); msg.append(f'外のクリック後 板={"出たまま" if h and h["vis"] else "閉じた"}')
    if h and h['vis']: bad.append('外のクリックで閉じない')
    pg = await new(); await open_history(pg)
    r = await findbtn(pg, '#toolbar', ['^プレビュー$', 'プレビュー'])
    if not r: bad.append('「プレビュー」が上の並びに無い')
    else:
        await pg.mouse.click(r['x'], r['y']); await pg.wait_for_timeout(700)
        pv = await ev(pg, f"{P}.previewMode()"); msg.append(f'板を開いたままプレビュー→{"入った" if pv else "入らない"}')
        if not pv: bad.append('板があるとプレビューが押せない')
    pg = await new()
    await click(pg, 'F_h0'); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(1300); await esc2(pg)
    if await ev(pg, f"{P}.ops().length") == 0: raise PrepFail('準備失敗：F_h0 を動かしても手直しが記録されない')
    nv0 = len(await ev(pg, f"{P}.versions()"))
    await open_history(pg)
    r = await findbtn(pg, '#toolbar', ['^公開$', '^公開'])
    if not r: bad.append('「公開」が上の並びに無い')
    else:
        await pg.mouse.click(r['x'], r['y']); await pg.wait_for_timeout(900)
        box = await ev(pg, "(()=>{const b=[...document.querySelectorAll('#publishBox,[role=dialog],[role=alertdialog],dialog[open]')].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&e.id!=='historyPanel'});return b?b.innerText.slice(0,30):null})()")
        nv1 = len(await ev(pg, f"{P}.versions()"))
        done = bool(box) or nv1 > nv0 or bool(pg._dlg)
        msg.append(f'板を開いたまま公開→確認の箱 {box!r} 版 {nv0}→{nv1}')
        if not done: bad.append('板があると公開が押せない')
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

# ---- F29
# 作業票（F29・F32 の行）: 別のページ・別の端末の手直しを戻すときは、そのページ・端末に切り替えて、戻した所を選び、短く知らせる
#   ここでは「別のページ」の方（F29）
# 再現: TOP で F_h0 をクリック→Shift+↓（10px 動かす）→ヘッダーのナビ「お品書き」をクリック→ MOD+z。
#       28 では TOP に切り替わり F_h0 が選ばれるが、知らせが出ない。
# 合格: MOD+z の後、(1) 今のページが TOP、(2) F_h0 が選ばれている、(3) 押す直前に見えていなかった新しい知らせ
#       （見張りで拾う）が出て、その文（ボタンの文字を除く）に「戻」が入っている、
#       (4) F_h0 の位置が動かす前に戻っている（戻すが本当に効いた）。
# 準備の確かめ: Shift+↓ で F_h0 が本当に動いたこと、ナビのクリックで本当にお品書きのページに移ったこと。
async def t_F29(new):
    pg = await new()
    y0 = (await bb(pg, 'F_h0'))['ay']
    await click(pg, 'F_h0'); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(400)
    y1 = (await bb(pg, 'F_h0'))['ay']
    if abs(y1 - y0) < 5: raise PrepFail(f'準備失敗：Shift+↓ で F_h0 が動かない（{r1(y0)}→{r1(y1)}）')
    await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(150)
    n = await navpt(pg, 'お品書き')
    if not n: raise PrepFail('準備失敗：ナビの「お品書き」が無い')
    await pg.mouse.click(*n); await pg.wait_for_timeout(900)
    if await ev(pg, f"{P}.currentPage()") != 'pg_menu': raise PrepFail('準備失敗：ナビを押してもお品書きのページに移らない')
    await clear_notices(pg); before = await visible_notice_texts(pg)
    await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(900)
    cp = await ev(pg, f"{P}.currentPage()"); s = await ev(pg, f"{P}.selected()"); ns = new_notices(await notices(pg), before, '戻')
    b = await bb(pg, 'F_h0'); y2 = b['ay'] if b else None
    vis = bool(b) and b['y'] + b['h'] > 0 and b['y'] < 1000
    ok = cp == 'pg_home' and 'F_h0' in s and bool(ns) and y2 is not None and abs(y2 - y0) < 2
    return ok, f'お品書きで戻す → ページ {cp}・選択 {s}・知らせ {ntext(ns)[:1] or "なし"}・F_h0 y {r1(y0)}→{r1(y1)}→{r1(y2)}（画面に{"見える" if vis else "見えない"}）'

# ---- F32
# 作業票（F29・F32 の行）: 別のページ・別の端末の手直しを戻すときは、そのページ・端末に切り替えて、戻した所を選び、短く知らせる
#   ここでは「別の端末」の方（F32）
# 再現: 上の「スマホ」→ F_h0 をクリック→Shift+↓ → 上の「PC」→ MOD+z。28 では PC の表示のまま、何も選ばれず、
#       知らせも出ないまま、見えていないスマホの手直しが戻る。
# 合格: MOD+z の後、(1) 表示がスマホに切り替わっている、(2) F_h0 が選ばれている、(3) 押す直前に見えていなかった
#       新しい知らせが出て、その文（ボタンの文字を除く）に「戻」が入っている、
#       (4) スマホの F_h0 の位置が動かす前に戻っている。
# 準備の確かめ: スマホで Shift+↓ で F_h0 が本当に動いたこと、
#       上の「PC」「スマホ」で本当に表示が切り替わったこと（押されている方のボタン）。
async def t_F32(new):
    pg = await new()
    await devclick(pg, 'スマホ')
    y0 = (await bb(pg, 'F_h0'))['ay']
    await click(pg, 'F_h0'); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(400)
    y1 = (await bb(pg, 'F_h0'))['ay']
    if abs(y1 - y0) < 5: raise PrepFail(f'準備失敗：スマホで Shift+↓ しても F_h0 が動かない（{r1(y0)}→{r1(y1)}）')
    await esc2(pg); await devclick(pg, 'PC')
    p0 = (await bb(pg, 'F_h0'))['ay']
    await clear_notices(pg); before = await visible_notice_texts(pg)
    await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(900)
    d = await device(pg); s = await ev(pg, f"{P}.selected()"); ns = new_notices(await notices(pg), before, '戻')
    p1 = (await bb(pg, 'F_h0'))['ay']
    if d != 'スマホ': await devclick(pg, 'スマホ')
    y2 = (await bb(pg, 'F_h0'))['ay']
    ok = d == 'スマホ' and 'F_h0' in s and bool(ns) and abs(y2 - y0) < 2
    return ok, f'PC で戻す → 表示 {d}・選択 {s}・知らせ {ntext(ns)[:1] or "なし"}・スマホの F_h0 y {r1(y0)}→{r1(y1)}→{r1(y2)}（PC の F_h0 {r1(p0)}→{r1(p1)}）'

async def frame(pg): await pg.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")

async def lt_after(pg, act, settle=1500):
    """act() から settle ms の間に起きた longtask と event の duration の一番長いもの（ms。無ければ 0）。
    重い処理を後ろへ回しただけの直しで通らないよう、操作の後 1500ms まで見る"""
    await ev(pg, "window.__lt.length=0;if(window.__ev)window.__ev.length=0")
    await act(); await frame(pg); await pg.wait_for_timeout(settle)
    lt = (await ev(pg, "window.__lt")) + (await ev(pg, "window.__ev||[]"))
    return max(lt) if lt else 0

# ---- F31
# 作業票: セクションが 40 あっても、矢印1回・戻す1回・小さなドラッグの離しが 100ms 以内
#         （測り方は audit の r2_ime/s8 と同じ考え方）
# 再現: 準備として API（sectionAdd）で特集セクションを40個足す → F_p0 をクリックで選ぶ →
#       本物の → キー1回／MOD+z 1回／F_p0 を 12px ドラッグして離す。28 では1回ごとに長い固まり（longtask）が出る。
# 合格: 3つの操作それぞれを3回ずつ行い、1回ごとの「操作から 1500ms までの一番長い longtask、または
#       PerformanceEventTiming の event の duration（使えれば。PerformanceObserver で測る。無ければ 0ms）」の
#       3回の中央値が 100ms 以内。ドラッグは押して動かすまでを済ませてから、離す1回だけを測る。
# 準備の確かめ: sectionList() が 42 個以上になったこと、F_p0 が選ばれていること、PerformanceObserver の longtask が
#       使えること、→ で F_p0 が本当に 1px 右へ動く・MOD+z で本当に 1px 戻る・ドラッグで本当に 8px 以上動くこと。
async def t_F31(new):
    pg = await new()
    for i in range(40):
        await ev(pg, f"{P}.sectionAdd({P}.sectionList().length,'feature')")
    await frame(pg); await ev(pg, "scrollTo(0,0)"); await pg.wait_for_timeout(1500)
    ns = len(await sections(pg))
    if ns < 42: raise PrepFail(f'準備失敗：セクションが {ns} 個にしかならない')
    await ev(pg, LT_OBS)
    if await ev(pg, "window.__lt") is None: raise PrepFail('準備失敗：PerformanceObserver の longtask が使えない')
    r = await bb(pg, 'F_p0'); await pg.mouse.click(r['x'] + 50, r['y'] + 50); await pg.wait_for_timeout(500)
    if 'F_p0' not in await ev(pg, f"{P}.selected()"): raise PrepFail(f'準備失敗：F_p0 が選べない {await ev(pg, f"{P}.selected()")}')
    x = lambda: bb(pg, 'F_p0')
    res = {'矢印': [], '戻す': [], 'ドラッグの離し': []}; prep = []
    for k in range(3):
        a = (await x())['x']
        res['矢印'].append(await lt_after(pg, lambda: pg.keyboard.press('ArrowRight')))
        b = (await x())['x']
        if abs(b - a - 1) > 0.6: prep.append(f'→ で {r1(b - a)}px')
    for k in range(3):
        a = (await x())['x']
        res['戻す'].append(await lt_after(pg, lambda: pg.keyboard.press(f'{MOD}+z')))
        b = (await x())['x']
        if abs(a - b - 1) > 0.6: prep.append(f'戻すで {r1(b - a)}px')
    for k in range(3):
        r = await x(); sx, sy = r['x'] + 50, r['y'] + 50
        await pg.mouse.move(sx, sy); await pg.mouse.down()
        for j in range(1, 5): await pg.mouse.move(sx + 3 * j, sy); await pg.wait_for_timeout(30)
        await pg.wait_for_timeout(400)
        res['ドラッグの離し'].append(await lt_after(pg, lambda: pg.mouse.up()))
        b = await x()
        if b['x'] - r['x'] < 8: prep.append(f'ドラッグで {r1(b["x"] - r["x"])}px')
    if prep: raise PrepFail('準備失敗：操作が効かない ' + ' / '.join(prep))
    med = {k: statistics.median(v) for k, v in res.items()}
    ok = all(v <= 100 for v in med.values())
    return ok, f'セクション {ns} 個: ' + ' / '.join(f'{k} 中央値 {med[k]}ms {res[k]}' for k in res)

async def caret_end(pg):
    # 書き換え中の要素の末尾にカーソル（Mac と Linux で End 系のキーの動きが違うので、選択の API で置く）
    await pg.evaluate("(()=>{const a=document.activeElement;if(!a||!a.isContentEditable)return;const r=document.createRange();r.selectNodeContents(a);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'))})()")
    await pg.wait_for_timeout(100)

H0 = "(document.querySelector('[data-el=F_h0]')||{}).innerText"

async def append_h0(pg, s):
    """F_h0 をダブルクリックで書き換え、末尾に s を打って外をクリック"""
    await click(pg, 'F_h0', n=2); await pg.wait_for_timeout(250)
    if await ev(pg, f"{P}.editingId()") != 'F_h0': raise PrepFail('準備失敗：F_h0 の書き換えに入れない')
    before = await ev(pg, H0)
    await caret_end(pg); await pg.keyboard.type(s); await pg.mouse.click(*OUT); await pg.wait_for_timeout(1200)
    if await ev(pg, H0) != before + s: raise PrepFail(f'準備失敗：F_h0 に {s!r} を足せない（{await ev(pg, H0)!r}）')

async def publish_now(pg):
    """「公開」を押し、確認が出たら「このまま公開する」まで押す。版が増えたかを返す"""
    n0 = len(await ev(pg, f"{P}.versions()"))
    await publish_box_text(pg)
    if await ev(pg, f"{P}.versions().length") <= n0:
        await clickbtn(pg, '#publishBox,[role=dialog],dialog[open]', ['このまま公開', '^公開する$', '^公開$'], 1200)
    return await ev(pg, f"{P}.versions().length") > n0

# ---- F33
# 作業票: 「この版を下書きにする」を戻した後、やり直すでもう一度下書きにできる
# 再現: F_h0 に「A」を足す→公開→「B」を足す→履歴→「公開した版」→「この版を下書きにする」（F_h0＝…A）→
#       MOD+z（…AB に戻る）→ MOD+Shift+z。28・29 ではやり直すが効かず …AB のまま。
# 合格: やり直す（MOD+Shift+z。効かなければ上の並びの「やり直す」を本物のクリック）の後、F_h0 が …A（公開した版の形）に
#       なり、版を見ている状態でもない（viewingVersion() が空）。
# 準備の確かめ: 公開で版が1つ増えたこと、「この版を下書きにする」の後に F_h0 が …A で版を見ている状態が終わったこと、
#       MOD+z で …AB に戻ったこと。「この版を下書きにする」の真ん中が板に隠れて本物のクリックが届かないとき（28 の J20）は、
#       そのボタンにフォーカスを置いて Enter で押す（キーで押す道。それでも効かなければ準備失敗）。
async def t_F33(new):
    pg = await new()
    await append_h0(pg, 'A')
    if not await publish_now(pg): raise PrepFail('準備失敗：公開しても版が増えない')
    await append_h0(pg, 'B'); tAB = await ev(pg, H0); tA = tAB[:-1]
    await open_history(pg)
    loc = pg.locator('#historyPanel').get_by_text('公開した版')
    if not await loc.count(): raise PrepFail('準備失敗：履歴に「公開した版」が無い')
    await loc.first.click(); await pg.wait_for_timeout(700)
    go = await pg.evaluate("""(()=>{const e=document.querySelector('[data-hv-go]')||[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.includes('下書きにする'));if(!e)return null;const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const t=document.elementFromPoint(x,y);return {x,y,top:!!t&&(t===e||e.contains(t))}})()""")
    if not go: raise PrepFail('準備失敗：「この版を下書きにする」が無い')
    how = 'クリック'
    if go['top']: await pg.mouse.click(go['x'], go['y'])
    else:
        how = 'フォーカス＋Enter（ボタンが隠れている）'
        await pg.evaluate("(()=>{const e=document.querySelector('[data-hv-go]')||[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.includes('下書きにする'));e.focus()})()")
        await pg.keyboard.press('Enter')
    await pg.wait_for_timeout(900)
    t1 = await ev(pg, H0); v1 = await ev(pg, f"{P}.viewingVersion()")
    if t1 != tA or v1: raise PrepFail(f'準備失敗：「この版を下書きにする」（{how}）で下書きにならない（F_h0 {t1!r}・見ている版 {v1}）')
    await esc2(pg)
    await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(800)
    t2 = await ev(pg, H0)
    if t2 != tAB: raise PrepFail(f'準備失敗：MOD+z で下書きにする前に戻らない（{t2!r}）')
    await pg.keyboard.press(f'{MOD}+Shift+z'); await pg.wait_for_timeout(800)
    t3 = await ev(pg, H0); way = 'MOD+Shift+z'
    if t3 != tA:
        r = await clickbtn(pg, '#toolbar', ['^やり直す$', 'やり直'], 800)
        t3 = await ev(pg, H0); way = '上の「やり直す」' if r else 'MOD+Shift+z（「やり直す」ボタンなし）'
    v3 = await ev(pg, f"{P}.viewingVersion()")
    ok = t3 == tA and not v3
    return ok, f'下書きにする（{how}）→ {t1[-2:]!r} → 戻す {t2[-2:]!r} → やり直す（{way}）{t3[-2:]!r}・見ている版 {v3}'

async def in_crop(pg):
    return bool(await ev(pg, f"{P}.cropState('F_p0')")) or bool(await cssbb(pg, '#cropzoom'))

# ---- F34
# 作業票: 書き換え中・見せる範囲の中にナビを押したら、1回でページが移る（確定してから）
# 再現: (a) F_h0 をダブルクリックで書き換え、末尾に「X」を打つ → ヘッダーのナビ「お品書き」を1回クリック。
#       (b) F_p0 をダブルクリック（見せる範囲）→ ナビ「お品書き」を1回クリック。28 ではどちらも1回目は書き換え・
#       見せる範囲が終わるだけで、ページは TOP のまま（2回目で移る）。
# 合格: (a)(b) とも1回のクリックで今のページがお品書きになる。(a) では打った「X」が TOP の F_h0 に残っている（確定してから）。
# 準備の確かめ: (a) 書き換え中（editingId()=F_h0）で、打った X が書き換え中の文字に入っていること。
#       (b) 見せる範囲に入っていること（cropState('F_p0') か #cropzoom が出ている）。
async def t_F34(new):
    bad = []; msg = []
    pg = await new()
    await click(pg, 'F_h0', n=2); await pg.wait_for_timeout(250)
    if await ev(pg, f"{P}.editingId()") != 'F_h0': raise PrepFail('準備失敗：F_h0 の書き換えに入れない')
    await caret_end(pg); await pg.keyboard.type('X'); await pg.wait_for_timeout(150)
    if not (await active_text(pg) or '').endswith('X'): raise PrepFail('準備失敗：書き換え中に X が入らない')
    await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(200)
    n = await navpt(pg, 'お品書き')
    if not n: raise PrepFail('準備失敗：ナビの「お品書き」が無い')
    await pg.mouse.click(*n); await pg.wait_for_timeout(900)
    cp = await ev(pg, f"{P}.currentPage()")
    await gopage(pg, 'pg_home'); t = await ev(pg, H0)
    msg.append(f'書き換え中に1回 → {cp}・F_h0 {t[-3:]!r}')
    if cp != 'pg_menu': bad.append('書き換え中は1回で移らない')
    if not t.endswith('X'): bad.append('打った X が残らない')
    pg = await new()
    await click(pg, 'F_p0', dx=100, dy=100, n=2); await pg.wait_for_timeout(300)
    if not await in_crop(pg): raise PrepFail('準備失敗：F_p0 のダブルクリックで見せる範囲に入らない')
    await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(200)
    n = await navpt(pg, 'お品書き')
    await pg.mouse.click(*n); await pg.wait_for_timeout(900)
    cp = await ev(pg, f"{P}.currentPage()")
    msg.append(f'見せる範囲で1回 → {cp}')
    if cp != 'pg_menu': bad.append('見せる範囲では1回で移らない')
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

# ---- F35
# 作業票: 読み込み直したら、前に開いていたページ・端末に戻る（スクロールは一番上でよい）
# 再現: ヘッダーのナビ「お品書き」をクリック → 上の「スマホ」→ 1.5秒待って読み込み直す（ブラウザの再読み込み）。
#       28 では TOP・PC に戻る。
# 合格: 読み込み直した後、今のページがお品書き（currentPage()=pg_menu）で、表示がスマホ（上の並びで押されている方）。
#       もう1つ、TOP のまま「スマホ」だけにして読み込み直したときもスマホのまま。
# 準備の確かめ: 読み込み直す前に、本当にお品書きのページ・スマホの表示になっていること。
async def t_F35(new):
    bad = []; msg = []
    pg = await new()
    await ev(pg, 'scrollTo(0,0)'); n = await navpt(pg, 'お品書き')
    if not n: raise PrepFail('準備失敗：ナビの「お品書き」が無い')
    await pg.mouse.click(*n); await pg.wait_for_timeout(900)
    await devclick(pg, 'スマホ')
    if await ev(pg, f"{P}.currentPage()") != 'pg_menu': raise PrepFail('準備失敗：お品書きのページに移らない')
    await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(1800)
    cp = await ev(pg, f"{P}.currentPage()"); d = await device(pg)
    msg.append(f'お品書き・スマホで読み込み直す → {cp}・{d}')
    if cp != 'pg_menu': bad.append('ページが戻らない')
    if d != 'スマホ': bad.append('端末が戻らない')
    pg = await new()
    await devclick(pg, 'スマホ'); await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_timeout(1800)
    d = await device(pg); msg.append(f'TOP・スマホで読み込み直す → {d}')
    if d != 'スマホ': bad.append('TOP でスマホが戻らない')
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

TB_BTNS = "(()=>{const t=document.getElementById('toolbar');const r=t.getBoundingClientRect();return {h:Math.round(r.height),b:[...t.querySelectorAll('button')].filter(b=>{const q=b.getBoundingClientRect();return b.offsetParent&&q.width>0&&q.right<=innerWidth+1}).map(b=>{const q=b.getBoundingClientRect();return [b.textContent.trim()||b.title,Math.round(q.x),Math.round(q.y)]})}})()"
SAVE_ST = """(()=>{const s=document.getElementById('saveStatus')||[...document.querySelectorAll('#toolbar *')].find(e=>e.children.length==0&&/保存/.test(e.textContent)&&e.tagName!=='BUTTON');
  if(!s)return null;const q=s.getBoundingClientRect();return {t:s.innerText.trim(),title:s.title||s.getAttribute('aria-description')||s.getAttribute('aria-label')||'',x:q.x+q.width/2,y:q.y+q.height/2,w:Math.round(q.width)}})()"""

# ---- F36
# 作業票: 保存の失敗の文は短く（詳しくはマウスを乗せて）、上の並びを押し出さない
# 再現: 準備として simulateSaveError(true) → F_h0 をクリック→Shift+↓→1.5秒待つ→Esc。28 では上の並びに
#       「保存できませんでした。インターネットのつながりを確かめてください」（約400px）が出て、幅 1440 では「制作用」が、
#       幅 1024 では「元の配置を見る」「このページを元に戻す」が押し出される。
# 合格: 幅 1440 と 1024 のそれぞれで、(1) 上の並びに見えている失敗の文が 15 文字以内、(2) その文にマウスを乗せると
#       詳しい文（title などの説明、または乗せたときに出る要素の文字。見えている文より長い）が出る、
#       (3) 失敗の前（同じ操作をして保存できた後・何も選んでいない）に見えていた上の並びのボタンが、失敗の後も全部見えていて、
#       横の位置が 2px より動かない。上の並びの高さも変わらない。
# 準備の確かめ: 失敗の前後で saveState().status が本当に 'error' になったこと（ならなければ準備失敗）。
async def t_F36(new):
    bad = []; msg = []
    for w in [1440, 1024]:
        pg = await new(w=w)
        await click(pg, 'F_h0'); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(1500); await esc2(pg)
        await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(150)
        a = await ev(pg, TB_BTNS)
        await ev(pg, f"{P}.simulateSaveError(true)")
        await click(pg, 'F_h0'); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(1500); await esc2(pg)
        await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(150)
        stt = (await ev(pg, f"{P}.saveState()") or {}).get('status')
        if stt != 'error': raise PrepFail(f'準備失敗：保存の失敗にならない（{stt}）')
        b = await ev(pg, TB_BTNS); s = await ev(pg, SAVE_ST)
        if not s: bad.append(f'{w}: 失敗の文が上の並びに無い'); continue
        # 乗せたときの説明
        await pg.mouse.move(s['x'], s['y']); await pg.wait_for_timeout(900)
        tip = s['title'] or await ev(pg, """t=>{const vis=e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'&&parseFloat(c.opacity)>0.05};
            const c=[...document.querySelectorAll('[role=tooltip],.tooltip,[class*=tip],[id*=tip],[id*=Tip]')].filter(vis).map(e=>e.innerText.trim()).filter(x=>x&&x!==t);return c[0]||''}""", s['t'])
        moved = []
        bx = {x[0]: x for x in b['b']}
        for name, x, y in a['b']:
            if name not in bx: moved.append(f'{name}(消えた)')
            elif abs(bx[name][1] - x) > 2: moved.append(f'{name}({x}→{bx[name][1]})')
        part = f'{w}: 文「{s["t"][:40]}」{len(s["t"])}文字・乗せた説明 {tip[:30]!r}・押し出されたボタン {moved or "なし"}・高さ {a["h"]}→{b["h"]}'
        msg.append(part)
        if len(s['t']) > 15: bad.append(f'{w}: 文が長い({len(s["t"])}文字)')
        if not tip or len(tip) <= len(s['t']): bad.append(f'{w}: 乗せても詳しい文が出ない')
        if moved: bad.append(f'{w}: 上の並びが押し出される')
        if b['h'] > a['h'] + 1: bad.append(f'{w}: 上の並びが高くなる')
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

# 日本語の変換（verify_audit_text.py・audit/r2_ime/ime.py と同じ送り方）
async def _cdp(pg):
    if not hasattr(pg, '_cdp'): pg._cdp = await pg.context.new_cdp_session(pg)
    return pg._cdp
async def comp(pg, t):
    c = await _cdp(pg); await c.send('Input.imeSetComposition', {'text': t, 'selectionStart': len(t), 'selectionEnd': len(t)}); await pg.wait_for_timeout(80)

SELSUB = "([s,n])=>{const el=document.activeElement;const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let x;while(x=w.nextNode()){const i=x.nodeValue.indexOf(s);if(i>=0){const r=document.createRange();r.setStart(x,i);r.setEnd(x,i+(n??s.length));const g=getSelection();g.removeAllRanges();g.addRange(r);document.dispatchEvent(new Event('selectionchange'));return g.toString()}}return ''}"

def styled(runs, word, tool):
    """runs の中で word を含む区切りに、その道具の書式が付いているか"""
    for r in runs:
        if word in (r.get('text') or ''):
            if tool == 'B' and r.get('bold'): return True
            if tool == '大きく' and (r.get('scale') or 1) > 1.001: return True
    return False

# ---- F37
# 作業票: 変換中に B などを押したら、変換を決めて書き換えを続け、選んだ所に効く（色・大きさと同じ）
# 再現: F_b0 をダブルクリックで書き換え → 末尾にカーソル → 日本語の変換中（「かし」、CDP の imeSetComposition）に
#       上の並びの「B」（または「A」大きく）を本物のクリック。28 では書き換えが終わってしまう（「色」なら続く）。
# 合格: 次の3つの場合すべてで、(1) 書き換えが続いている（editingId()=F_b0）、(2) 変換中だった「かし」が文に残る、
#       (3) (a)(b) ではそのまま「X」を打つと F_b0 に入る（書き換えが本当に続いている）、(4) 書式が効く：
#       (a) カーソルだけで変換中に B → 「かし」か、続けて打った「X」が太字
#       (b) カーソルだけで変換中に 大きく → 「かし」か「X」が大きくなる
#       (c) 「季節」を選んでから変換（選んだ所が「かし」に置き換わる）中に B → 「かし」が太字
# 準備の確かめ: 書き換えに入れたこと、(c) で「季節」が本当に選べたこと、ボタンを押す前に書き換え中の文に「かし」が入っていること。
async def t_F37(new):
    bad = []; msg = []
    for lab, tool, selw in [('a カーソル+B', 'B', None), ('b カーソル+大きく', '大きく', None), ('c 選んで+B', 'B', '季節')]:
        pg = await new()
        await click(pg, 'F_b0', n=2); await pg.wait_for_timeout(300)
        if await ev(pg, f"{P}.editingId()") != 'F_b0': raise PrepFail('準備失敗：F_b0 の書き換えに入れない')
        if selw:
            if await ev(pg, SELSUB, [selw, None]) != selw: raise PrepFail(f'準備失敗：「{selw}」が選べない')
        else: await caret_end(pg)
        await comp(pg, 'か'); await comp(pg, 'かし')
        if 'かし' not in (await active_text(pg) or ''): raise PrepFail('準備失敗：変換中の「かし」が文に入らない')
        pats = ['^B$', '太字'] if tool == 'B' else ['^大きく$', '大きく']
        r = await findbtn(pg, '#toolbar', pats)
        if not r: bad.append(f'{lab}: 上の並びに {tool} が無い'); continue
        await pg.mouse.click(r['x'], r['y']); await pg.wait_for_timeout(400)
        ed = await ev(pg, f"{P}.editingId()")
        if not selw: await pg.keyboard.type('X'); await pg.wait_for_timeout(200)   # 選んだ所は太字の後も選ばれたままなので、打つと置き換わる（PowerPoint と同じ）。(c) では打たない
        await pg.mouse.click(*OUT); await pg.wait_for_timeout(500)
        txt = await ev(pg, "(document.querySelector('[data-el=F_b0]')||{}).innerText||''")
        runs = await ev(pg, f"{P}.textRuns('F_b0')")
        eff = styled(runs, 'かし', tool) or (not selw and styled(runs, 'X', tool))
        part = f'{lab}: 押した後の書き換え={ed}・かし={"残る" if "かし" in txt else "消えた"}' + ('' if selw else f'・X={"入った" if "X" in txt else "入らない"}') + f'・書式={"効いた" if eff else "効かない"}'
        msg.append(part)
        if ed != 'F_b0': bad.append(f'{lab}: 書き換えが終わる')
        if 'かし' not in txt: bad.append(f'{lab}: 変換中の文字が消える')
        if not selw and 'X' not in txt: bad.append(f'{lab}: 続けて打てない')
        if not eff: bad.append(f'{lab}: 書式が効かない')
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

FOCUS_INFO = """(()=>{const a=document.activeElement;if(!a||a===document.body)return null;const r=a.getBoundingClientRect();const c=getComputedStyle(a);
  const vis=r.width>=10&&r.height>=10&&c.display!=='none'&&c.visibility!=='hidden'&&parseFloat(c.opacity)>0.05&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight+scrollY+5000&&!/rect\\(0/.test(c.clip||'')&&c.clipPath!=='inset(50%)';
  return {tag:a.tagName,type:a.type||'',id:a.id,t:((a.textContent||'').trim()||a.title||a.getAttribute('aria-label')||'').slice(0,12),vis,file:a.tagName==='INPUT'&&a.type==='file'}})()"""

# ---- F38
# 作業票: 見えない写真の入力欄を Tab の順から外す
# 再現: 開いた直後に Tab を押していく。28 では 17 回目で見えない写真の入力欄（input type=file、#photoInput）に
#       フォーカスが入り、Enter でファイルを選ぶ箱が開く。
# 合格: Tab を 60 回押す間に、見えていない写真の入力欄（input type=file で、大きさ 10px 未満・透明・display:none などの
#       見えないもの）にフォーカスが一度も入らない。
# 準備の確かめ: Tab で本当にフォーカスが動いていること（違う要素に 5 個以上入る）。
async def t_F38(new):
    pg = await new()
    seen = []; hidden_file = []
    for i in range(60):
        await pg.keyboard.press('Tab'); await pg.wait_for_timeout(40)
        f = await ev(pg, FOCUS_INFO)
        if not f: continue
        key = f"{f['tag']}#{f['id']}:{f['t']}"
        if key not in seen: seen.append(key)
        if f['file'] and not f['vis']: hidden_file.append(f'{i + 1}回目 {f["tag"]}#{f["id"]}')
    if len(seen) < 5: raise PrepFail(f'準備失敗：Tab でフォーカスが動かない {seen}')
    return not hidden_file, f'Tab 60 回で {len(seen)} 個の要素に入った・見えない写真の入力欄に入った={hidden_file[:3] or "なし"}'

POPS = """(()=>{const C='#sectypes,#moreMenu,#fmenu,[role=menu],[role=listbox],[id*=enu],[class*=menu],[class*=pop],[id*=types],[id*=Types]';
  return [...document.querySelectorAll(C)].filter(e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>0&&r.height>0&&c.visibility!=='hidden'&&c.display!=='none'&&parseFloat(c.opacity)>0.05&&!e.closest('#toolbar>button')&&e.querySelector('button,[role=menuitem],[role=option],a')}).map(e=>{e.dataset.auditPop=e.dataset.auditPop||Math.random().toString(36).slice(2);return e.dataset.auditPop})})()"""
FOCUS_IN = """ks=>{const a=document.activeElement;for(const k of ks){const p=document.querySelector('[data-audit-pop=\"'+k+'\"]');if(p&&p.contains(a)){const items=[...p.querySelectorAll('button,[role=menuitem],[role=option],a')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&!b.disabled});return {inside:true,idx:items.indexOf(a),n:items.length,t:(a.textContent||'').trim().slice(0,14)}}}return {inside:false,t:a.tagName+' '+((a.textContent||'').trim().slice(0,14))}}"""

# ---- F39
# 作業票: 「＋」「その他 ▾」をキーで開いたら、一覧の最初にフォーカスが入り、上下キーで選べ、Esc で閉じる。
#         画面が勝手に一番下へスクロールしない
# 再現: 開いた直後から Tab を押して「＋」（セクションを足す）／上の並びの「その他 ▾」にフォーカスを置き、Enter。
#       28 では一覧は出るがフォーカスはボタンのまま、↓↑ でページがスクロールし、「＋」の一覧は Esc でも閉じない。
#       一覧の中へは Tab を何回も押すしかなく、そのとき画面が一番下へ飛ぶ。
# 合格: 「＋」「その他 ▾」のそれぞれで、(1) Enter の後、フォーカスが開いた一覧の最初の項目にある、(2) ↓ で一覧の中の
#       次の項目へ、↑ で前の項目へフォーカスが動く、(3) Esc で一覧が閉じる、(4) Enter から Esc までの間、ページの
#       スクロール（scrollY）が 30px より動かない。
# 準備の確かめ: Tab で本当にそのボタンにフォーカスが入ったこと（40 回までに）、Enter で一覧が本当に開いたこと
#       （Enter の前に無かった一覧の要素が見えるようになる）。
async def t_F39(new):
    bad = []; msg = []
    for target in ['＋', 'その他']:
        pg = await new()
        hit = False
        for i in range(40):
            await pg.keyboard.press('Tab'); await pg.wait_for_timeout(30)
            if (await ev(pg, "(document.activeElement.textContent||'').trim()")).startswith(target): hit = True; break
        if not hit: raise PrepFail(f'準備失敗：Tab で「{target}」にフォーカスが入らない')
        p0 = set(await ev(pg, POPS)); sy0 = await ev(pg, 'scrollY'); sys_ = []
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        p1 = [k for k in await ev(pg, POPS) if k not in p0]
        if not p1: raise PrepFail(f'準備失敗：「{target}」で Enter を押しても一覧が開かない')
        sys_.append(await ev(pg, 'scrollY'))
        f0 = await ev(pg, FOCUS_IN, p1)
        await pg.keyboard.press('ArrowDown'); await pg.wait_for_timeout(200); f1 = await ev(pg, FOCUS_IN, p1); sys_.append(await ev(pg, 'scrollY'))
        await pg.keyboard.press('ArrowUp'); await pg.wait_for_timeout(200); f2 = await ev(pg, FOCUS_IN, p1); sys_.append(await ev(pg, 'scrollY'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); sys_.append(await ev(pg, 'scrollY'))
        still = [k for k in await ev(pg, POPS) if k in p1]
        dmax = max(abs(s - sy0) for s in sys_)
        first_ok = f0['inside'] and f0.get('idx') == 0
        arrows_ok = f1['inside'] and f2['inside'] and f1.get('idx') == 1 and f2.get('idx') == 0
        msg.append(f'{target}: 開いた後のフォーカス {f0}・↓ {f1.get("idx", f1["t"])}・↑ {f2.get("idx", f2["t"])}・Esc 後 {"開いたまま" if still else "閉じた"}・スクロールの動き最大 {r1(dmax)}px')
        if not first_ok: bad.append(f'{target}: 一覧の最初にフォーカスが入らない')
        if not arrows_ok: bad.append(f'{target}: 上下キーで選べない')
        if still: bad.append(f'{target}: Esc で閉じない')
        if dmax > 30: bad.append(f'{target}: 画面がスクロールする({r1(dmax)}px)')
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

# 指の押せる範囲を、elementFromPoint で中心から上下左右に 1px ずつ測る（::before などで広げた範囲も入る。40px まで）
HIT = """sel=>{const out=[];const els=[...document.querySelectorAll(sel)].filter(e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>0&&r.height>0&&c.visibility!=='hidden'&&c.display!=='none'&&parseFloat(c.opacity)>0.05&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth});
  for(const e of els){const r=e.getBoundingClientRect();const cx=r.x+r.width/2,cy=r.y+r.height/2;const own=(x,y)=>{const t=document.elementFromPoint(x,y);return !!t&&(t===e||e.contains(t))};
    const name=(e.textContent||'').trim().slice(0,10)||(e.dataset.handle?'つまみ'+e.dataset.handle:'')||e.title||e.getAttribute('aria-label')||e.tagName;
    if(!own(cx,cy)){out.push({t:name,w:0,h:0});continue}
    let l=0,rr=0,u=0,d=0;while(l<40&&own(cx-l-1,cy))l++;while(rr<40&&own(cx+rr+1,cy))rr++;while(u<40&&own(cx,cy-u-1))u++;while(d<40&&own(cx,cy+d+1))d++;
    out.push({t:name,w:l+rr+1,h:u+d+1})}
  return out}"""
BAND_SEL = 'button:not(#toolbar button):not(#sectionwrap button):not(#pbar button)'

# ---- F40
# 作業票: 指で触る端末では、横向き・iPad の幅でも、つまみ・帯・上の並びのボタンを 44px の押せる大きさにする
# 再現: 指で触る端末（is_mobile・has_touch）で 844x390（スマホの横向き）、1024x768・768x1024（iPad）。
#       28 では PC と同じ画面になり、上の並びのボタンは高さ 30px、つまみは 14px、写真の帯「写真を変える」は高さ 36px。
# 合格: 3つの大きさそれぞれで、(1) 上の並び（#toolbar。指の画面に変わるなら下の並び #pbar も）の見えているボタン、
#       (2) F_h0 を指でタップして選んだときのつまみ、(3) F_p0 を指でタップして選んだときに出る帯のボタン（上の並び・
#       セクションの「＋」以外の見えているボタン）の、押せる範囲（elementFromPoint で測る）が縦横とも 44px 以上（1px の誤差は許す）。
# 準備の確かめ: タップで F_h0・F_p0 が本当に選ばれたこと、つまみが1つ以上見えていること、上の並びのボタンが1つ以上あること。
async def t_F40(new):
    bad = []; msg = []
    for w, h in [(844, 390), (1024, 768), (768, 1024)]:
        t = await new.touch(w=w, h=h)
        tb = await t.ev(HIT, '#toolbar button, #pbar button')
        if not tb: raise PrepFail(f'準備失敗：{w}x{h} で上の並びのボタンが見えない')
        r = await t.center('F_h0'); await t.tap(r['cx'], r['cy']); await t.pg.wait_for_timeout(300)
        if 'F_h0' not in await t.sel(): raise PrepFail(f'準備失敗：{w}x{h} で F_h0 をタップしても選ばれない {await t.sel()}')
        hd = await t.ev(HIT, '[data-handle]')
        if not hd: raise PrepFail(f'準備失敗：{w}x{h} で F_h0 のつまみが見えない')
        r = await t.center('F_p0'); await t.tap(r['cx'], r['cy']); await t.pg.wait_for_timeout(400)
        if 'F_p0' not in await t.sel(): raise PrepFail(f'準備失敗：{w}x{h} で F_p0 をタップしても選ばれない {await t.sel()}')
        bd = await t.ev(HIT, BAND_SEL)
        small = lambda L: [f"{x['t']}{x['w']}x{x['h']}" for x in L if x['w'] < 43 or x['h'] < 43]
        s1, s2, s3 = small(tb), small(hd), small(bd)
        msg.append(f'{w}x{h}: 上の並び {len(tb)} 個中小さい {s1[:4]}・つまみ {len(hd)} 個中小さい {s2[:3]}・帯 {len(bd)} 個中小さい {s3[:3]}')
        if s1: bad.append(f'{w}x{h} 上の並びが小さい')
        if s2: bad.append(f'{w}x{h} つまみが小さい')
        if s3: bad.append(f'{w}x{h} 帯が小さい')
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

# 部品の文字（字の並んでいる所）の箱。Range の getClientRects で測る
TEXT_RECTS = """ex=>{const out=[];for(const e of document.querySelectorAll('[data-el]')){if(ex.includes(e.dataset.el)||e.querySelector('[data-el]'))continue;
  const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(!n.nodeValue.trim())continue;const r=document.createRange();r.selectNodeContents(n);
    for(const q of r.getClientRects()){if(q.width>0&&q.height>0&&q.bottom>0&&q.top<innerHeight)out.push({p:e.dataset.el,x:q.left,y:q.top,r:q.right,b:q.bottom})}}}return out}"""

async def lp_menu(t):
    return await t.ev("(()=>{const m=document.getElementById('fmenu');if(!m||!m.classList.contains('on'))return [];return [...m.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>{const q=b.getBoundingClientRect();return [b.textContent.trim(),q.x+q.width/2,q.y+q.height/2]})})()")

# ---- F41
# 作業票（F41・F43 の行）: …見せる範囲の大きさのつまみは見出しに重ならない所に
# 再現: スマホ（390x844・指）で F_p0 を長押し→一覧の「見せる範囲」をタップ。28 では写真のすぐ下に出る
#       大きさのつまみ（#cropzoom、拡大の棒）が、下の見出し F_h0 の文字に重なる。
# 合格: 見せる範囲の大きさのつまみ（#cropzoom、無ければ見えている input[type=range]）の箱が、写真以外のどの部品の
#       文字（字の並んでいる所）にも重ならない。
# 準備の確かめ: 長押しの一覧に「見せる範囲」があり、タップで本当に見せる範囲に入ったこと（cropState('F_p0')）。
async def t_F41(new):
    t = await new.touch()
    r = await t.center('F_p0'); await t.lp(r['cx'], r['cy'])
    m = await lp_menu(t); b = [x for x in m if '見せる範囲' in x[0]]
    if not b: raise PrepFail(f'準備失敗：長押しの一覧に「見せる範囲」が無い {[x[0] for x in m]}')
    await t.tap(b[0][1], b[0][2]); await t.pg.wait_for_timeout(500)
    if not await t.ev(f"{P}.cropState('F_p0')"): raise PrepFail('準備失敗：見せる範囲に入らない')
    z = await t.rect('#cropzoom')
    if not z: z = await t.ev("(()=>{const i=[...document.querySelectorAll('input[type=range]')].find(i=>i.getBoundingClientRect().width>0);if(!i)return null;const r=i.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,w:r.width,h:r.height}})()")
    if not z: return False, '見せる範囲の大きさのつまみが無い'
    tr = await t.ev(TEXT_RECTS, ['F_p0'])
    hit = sorted({q['p'] for q in tr if q['x'] < z['r'] and q['r'] > z['x'] and q['y'] < z['b'] and q['b'] > z['y']})
    return not hit, f"大きさのつまみ ({r1(z['x'])},{r1(z['y'])})-({r1(z['r'])},{r1(z['b'])}) が重なる部品の文字={hit or 'なし'}"

# ---- F43
# 作業票（F41・F43 の行）: スマホのつまみの押せる範囲が、ほかの部品の文字にかぶらない（かぶる所はその部品を選べる方を優先）…
# 再現: スマホ（390x844・指）で F_h0 をタップして選ぶ。28 ではつまみの押せる範囲（44px）が下の本文 F_b0 の1行目の文字に
#       かぶり、そこをタップしても F_b0 が選べない（F_h0 のまま）。F_b0 を選んだときも同じく上の F_h0 にかぶる。
# 合格: F_h0・F_b0 のそれぞれを選んだとき、つまみの押せる範囲（elementFromPoint でつまみに当たる所）が、ほかの部品の
#       文字の箱にかぶらない。かぶる所があるなら、そのかぶる所を指でタップすると、その部品が選ばれる（選び替わる）。
# 準備の確かめ: タップで F_h0／F_b0 が本当に選ばれ、つまみが見えていること。F_h0 を選んだまま、かぶっていない所
#       （F_b0 の下の方）をタップすれば F_b0 に選び替わること（タップで選び替える仕組みが効いていること）。
COVER = """id=>{const hs=[...document.querySelectorAll('[data-handle]')].filter(e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>0&&c.visibility!=='hidden'&&c.display!=='none'});
  const out=[];const parts=[...document.querySelectorAll('[data-el]')].filter(e=>e.dataset.el!==id&&!e.querySelector('[data-el]'));
  const rects=[];for(const e of parts){const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(!n.nodeValue.trim())continue;const r=document.createRange();r.selectNodeContents(n);for(const q of r.getClientRects())if(q.width>0&&q.height>0)rects.push([e.dataset.el,q])}}
  for(const h of hs){const r=h.getBoundingClientRect();const cx=r.x+r.width/2,cy=r.y+r.height/2;
    for(const [p,q] of rects){const pts=[];
      for(let x=Math.max(q.left+1,cx-40);x<=Math.min(q.right-1,cx+40);x+=2)for(let y=Math.max(q.top+1,cy-40);y<=Math.min(q.bottom-1,cy+40);y+=2){const t=document.elementFromPoint(x,y);if(t&&(t===h||h.contains(t)))pts.push([x,y])}
      if(pts.length)out.push({h:h.dataset.handle,p,n:pts.length,pt:pts[Math.floor(pts.length/2)]})}}
  const seen=new Set();return out.filter(o=>{const k=o.h+'|'+o.p;if(seen.has(k))return false;seen.add(k);return true})}"""
async def t_F43(new):
    bad = []; msg = []
    for sid in ['F_h0', 'F_b0']:
        t = await new.touch()
        async def pick():
            r = await t.center(sid); await t.tap(r['cx'], min(r['cy'], r['y'] + 10)); await t.pg.wait_for_timeout(300)
            if await t.sel() != [sid]: raise PrepFail(f'準備失敗：{sid} をタップしても選ばれない {await t.sel()}')
        await pick()
        if not await t.ev("[...document.querySelectorAll('[data-handle]')].some(e=>e.getBoundingClientRect().width>0)"): raise PrepFail(f'準備失敗：{sid} のつまみが見えない')
        if sid == 'F_h0':
            # 準備の確かめ：かぶっていない所（F_b0 の下の方）をタップすれば、選び替わること
            b = await t.rect('F_b0'); await t.tap(b['cx'], b['b'] - 6); await t.pg.wait_for_timeout(300)
            if await t.sel() != ['F_b0']: raise PrepFail(f'準備失敗：F_h0 を選んだまま F_b0 の下の方をタップしても選び替わらない {await t.sel()}')
            await t.ev("scrollTo(0,0)"); await pick()
        cov = await t.ev(COVER, sid)
        if not cov: msg.append(f'{sid} を選ぶ: つまみはほかの部品の文字にかぶらない'); continue
        res = []
        for c in cov[:4]:
            await t.tap(c['pt'][0], c['pt'][1]); await t.pg.wait_for_timeout(300)
            s = await t.sel(); good = s == [c['p']]
            res.append(f"つまみ{c['h']}が{c['p']}にかぶる→そこをタップで選択 {s}")
            if not good: bad.append(f"{sid} のつまみ{c['h']}が {c['p']} の文字にかぶり、タップで {c['p']} を選べない")
            await t.ev("scrollTo(0,0)"); await pick()
            cov2 = await t.ev(COVER, sid)   # 選び直した後の位置で次を測る
            if len(cov2) != len(cov): break
        msg.append(f'{sid} を選ぶ: ' + ' / '.join(res))
    return not bad, ('; '.join(bad) + ' || ' if bad else '') + ' / '.join(msg)

# ================================================================ 走らせる
ORDER = ['F22', 'F24', 'F25', 'F28', 'F29', 'F32', 'F31', 'F33', 'F34', 'F35', 'F36', 'F37', 'F38', 'F39', 'F40', 'F41', 'F43']
SERIAL = {'F31'}   # 速さを測る項目は、ほかが終わってから1つだけで走らせる
TESTS = {k[2:]: v for k, v in globals().items() if k.startswith('t_F')}

async def run_one(br, url, tid, sem):
    async with sem:
        made = []
        async def new(**kw):
            pg = await fresh(br, url, **kw); made.append(pg); return pg
        async def newtouch(**kw):
            t = await Touch().open(br, url, **kw); made.append(t.pg); return t
        new.touch = newtouch
        t0 = time.time()
        try:
            ok, msg = await asyncio.wait_for(TESTS[tid](new), timeout=120)
        except PrepFail as e:
            ok, msg = False, str(e)[:300]
        except asyncio.TimeoutError:
            ok, msg = False, '120秒で打ち切り'
        except Exception as e:
            ok, msg = False, '例外 ' + (str(e).splitlines()[0] if str(e) else type(e).__name__)[:200]
        errs = []
        for pg in made:
            errs += [x for x in pg._e if x.startswith('PE')]
            try: await pg.context.close()
            except Exception: pass
        if errs: msg += f'（pageerror: {errs[0][:100]}）'
        return tid, ok, msg, time.time() - t0

async def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    url = pathlib.Path(sys.argv[1]).resolve().as_uri()
    ids = [a.upper() for a in sys.argv[2:]] or ORDER
    unknown = [i for i in ids if i not in TESTS]
    if unknown: print('知らない項目:', unknown); sys.exit(2)
    os.makedirs(WORK, exist_ok=True)
    sem = asyncio.Semaphore(int(os.environ.get('AUDIT_JOBS', '1')))
    t0 = time.time(); res = {}
    async with async_playwright() as p:
        br = await p.chromium.launch()
        for r in await asyncio.gather(*[run_one(br, url, i, sem) for i in ids if i not in SERIAL]): res[r[0]] = r
        for i in ids:
            if i in SERIAL: res[i] = await run_one(br, url, i, asyncio.Semaphore(1))
        await br.close()
    nok = nng = 0
    for i in ids:
        tid, ok, msg, dt = res[i]
        print(f"{'OK' if ok else 'NG'} {tid} | {msg} ({dt:.1f}s)", flush=True)
        if ok: nok += 1
        else: nng += 1
    print(f'合計 OK {nok} / NG {nng}（{time.time() - t0:.0f}秒）')
    sys.exit(nng)

if __name__ == '__main__':
    asyncio.run(main())
