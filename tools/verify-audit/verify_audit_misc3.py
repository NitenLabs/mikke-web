# -*- coding: utf-8 -*-
"""回帰の確認：使いにくさ F の一部（area = misc3）

使い方: python3 verify_audit_misc3.py /path/to/playgroundNN_single.html [ID ...]
  ID を並べるとその項目だけ（例: F46 F64）。省略で全部。
出力: 1項目1行 `OK F46 | 説明` / `NG F46 | 実際の値`。最後に `合計 OK x / NG y（n秒）`。終了コード＝NG の数。

担当（作業票29 §5.3）: F44 F45 F46 F48 F49 F54 F55 F57 F59 F60 F62 F64 F65 F66 F68
  F64 と F65 は表では1行（F64・F65）だが、ここでは別の項目として出す。

判定の決まり（TESTBRIEF2.md）
- 問題は本物のマウス・キーボード・指（CDP の Input.dispatchTouchEvent）・日本語の変換
  （CDP の Input.imeSetComposition / insertText）で起こす。window.__playground は状態を読むのと
  準備（ページを移す setPage・特集のセクションを足す sectionAdd）にだけ使う。
- Cmd の操作は MOD（Mac は Meta、ほかは Control）で送る。全部選んだときは、本当に全部選べたか
  （書き換え中の文字なら getSelection の文字数、入力欄なら打った後の値）を確かめてから先へ進む。
- 操作が本当に起きたか（準備が成り立ったか）を各項目で確かめ、成り立たなければ
  `NG <ID> | 準備失敗：…` にする（空振りの合格を作らない）。
- 知らせ＝ページの知らせの要素（#pgToast など＋ role=status/alert/alertdialog・aria-live・.toast・
  class/id に toast を含むもの・開いた dialog/role=dialog）と confirm/alert の箱。数秒で消えるので、
  ページに入れた見張り（80ms ごと）が出た文字を記録する（verify_audit_page.py と同じ）。
  上の並び（#toolbar）の中の文字（保存の状態など）は知らせに数えない。
- 「出す月」の理由の文字は今の月で出る・出ないが変わるので、ページの時計を 2026年10月15日に
  ずらす（F45・F46。どの組み合わせにも10月は入らない）。
- 項目ごとに browser context を作り直す。1項目 120 秒で打ち切り、例外は NG にして次へ。
- 共通の部品は他の担当と同時に作られるため、このファイルは自分の中だけで完結させた。
"""
import asyncio, json, math, os, re, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, '_work')
P = 'window.__playground'
MOD = 'Meta' if sys.platform == 'darwin' else 'Control'
OUT = (1420, 990)   # 何もない所（右下の余白）
ID_RE = re.compile(r'(?:^|[^A-Za-z])(?:F_|I_|card_|row_|menu__|contact__|sec\d+__|plc_|itm_|lbl_)[A-Za-z0-9_]*')

# ---------------------------------------------------------------- 知らせの見張り・時計（ページに入れる）
NOTICE_WATCH = r"""
(()=>{ window.__auditNotices=[]; const seen=new Map();
  const SEL='#pgToast,.pg-toast,[role=status],[role=alert],[role=alertdialog],[aria-live],.toast,[class*=toast],[id*=toast],[id*=Toast],[role=dialog],dialog[open]';
  setInterval(()=>{ try{
    for(const e of document.querySelectorAll(SEL)){
      if(e.id==='publishToast') continue;
      if(e.closest && e.closest('#toolbar')) continue;
      const cs=getComputedStyle(e), r=e.getBoundingClientRect(), t=(e.innerText||'').trim();
      const vis=r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.05&&t;
      if(vis){ if(seen.get(e)!==t){ seen.set(e,t); window.__auditNotices.push(t.slice(0,160)); } } else seen.delete(e);
    } }catch(_){} },80);
})();
"""
# ページの時計を 2026-10-15 12:00（その場所の時刻）にずらす。経った時間はそのまま進む。
CLOCK_OCT = r"""
(()=>{ const RD=Date; const off=new RD(2026,9,15,12,0,0).getTime()-RD.now();
  class D extends RD { constructor(...a){ if(a.length===0) super(RD.now()+off); else super(...a); } static now(){ return RD.now()+off; } }
  window.Date=D; })();
"""

# ---------------------------------------------------------------- 共通の小道具
FONT_RE = re.compile(r'https://fonts\.(googleapis|gstatic)\.com/')
async def block_fonts(ctx):
    """Google Fonts を止める（Mac では本物の書体で字の寸法が変わり、判定が揺れるため）"""
    await ctx.route(FONT_RE, lambda route: route.abort())

async def fresh(br, url, w=1440, h=1000, clock=False, **kw):
    ctx = await br.new_context(viewport={'width': w, 'height': h}, **kw)
    await block_fonts(ctx)
    await ctx.add_init_script(NOTICE_WATCH)
    if clock: await ctx.add_init_script(CLOCK_OCT)
    pg = await ctx.new_page(); pg._e = []; pg._dlg = []
    pg.on('pageerror', lambda e: pg._e.append('PE ' + str(e)))
    pg.on('dialog', lambda d: (pg._dlg.append(d.type + ' ' + d.message), asyncio.ensure_future(d.dismiss())))
    await pg.goto(url); await pg.wait_for_timeout(1600)
    return pg

def ev(pg, js, *a): return pg.evaluate(js, *a)
def r1(v): return round(v, 1) if isinstance(v, (int, float)) else v

async def bb(pg, id):
    return await ev(pg, "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const c=getComputedStyle(e);const r=e.getBoundingClientRect();if((r.width==0&&r.height==0)||c.display=='none'||c.visibility=='hidden')return null;return {x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom,ay:r.y+scrollY}}", id)

async def scrollto(pg, id):
    await ev(pg, "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(e)e.scrollIntoView({block:'center'})}", id)
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
    if not r: raise RuntimeError('部品が見えない: ' + id)
    x = r['x'] + (dx if dx is not None else min(40, r['w'] / 2)); y = r['y'] + (dy if dy is not None else min(12, r['h'] / 2))
    await pg.mouse.click(x, y, click_count=n, button=button); await pg.wait_for_timeout(380)
    if esc and n == 1 and button == 'left': await esc_if_editing(pg)   # P2 に合わせて手順を変えた（判定は同じ）
    return r

async def sel(pg): return await ev(pg, f"{P}.selected()")

async def open_menu_if_closed(pg, id):
    """P23・P26 に合わせて手順を変えた（判定は同じ）：PC で品の中を左クリックで選んでも、右クリックの一覧は出さなくなった（PowerPoint と同じ）。
    一覧の項目を押す試験のために、出ていなければ選んだ部品を右クリックして開く（前は左クリックの後に出ていたのと同じ状態）"""
    if await pg.evaluate("(()=>{const m=document.getElementById('fmenu');return !!m&&m.classList.contains('on')})()"): return
    r = await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const q=e.getBoundingClientRect();return {x:q.x,y:q.y,w:q.width,h:q.height}}", id)
    if r: await pg.mouse.click(r['x'] + min(20, r['w'] / 2), r['y'] + min(8, r['h'] / 2), button='right'); await pg.wait_for_timeout(300)

async def selitem(pg, id):
    """品（カード・行）を選ぶ。カードは1回目で並び、2回目で品になる"""
    await click(pg, id, dx=20, dy=8)
    if id not in await sel(pg): await click(pg, id, dx=20, dy=8, scroll=False)
    if id in await sel(pg): await open_menu_if_closed(pg, id)
    return id in await sel(pg)

async def cssbb(pg, css):
    return await ev(pg, "c=>{const e=[...document.querySelectorAll(c)].find(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom}}", css)

async def clickcss(pg, css, wait=450):
    r = await cssbb(pg, css)
    if not r: return False
    await pg.mouse.click(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2); await pg.wait_for_timeout(wait)
    return True

async def findbtn(pg, root_css, names, exact=False):
    """root の中の見えているボタンを、文字・title・aria-label・data 属性の候補で探す → [x, y, 文字, 押せない]"""
    return await ev(pg, """([root,names,ex])=>{const R=document.querySelector(root)||document;
      const vis=b=>{const q=b.getBoundingClientRect();const s=getComputedStyle(b);return q.width>0&&q.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
      const lab=b=>[b.textContent.trim(),b.title||'',b.getAttribute('aria-label')||'',...Object.values(b.dataset||{})];
      for(const n of names){const e=[...R.querySelectorAll('button,a,[role=button],[role=menuitem]')].find(b=>vis(b)&&lab(b).some(s=>ex?s===n:s.includes(n)));
        if(e){const q=e.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2,e.textContent.trim(),!!e.disabled||e.getAttribute('aria-disabled')==='true']}}
      return null}""", [root_css, names, exact])

async def clickbtn(pg, root_css, names, exact=False, wait=450):
    b = await findbtn(pg, root_css, names, exact)
    if not b: return None
    await pg.mouse.click(b[0], b[1]); await pg.wait_for_timeout(wait)
    return b

async def clear_notices(pg):
    await ev(pg, "window.__auditNotices&&(window.__auditNotices.length=0)"); pg._dlg.clear()

async def notices(pg):
    await pg.wait_for_timeout(300)
    return list(await ev(pg, "window.__auditNotices||[]")) + ['[箱] ' + d for d in pg._dlg]

async def gopage(pg, pid):   # 準備：ページを移す（API）
    await ev(pg, f"{P}.setPage('{pid}')"); await pg.wait_for_timeout(800)

async def cards(pg):
    return await ev(pg, "[...document.querySelectorAll('[data-el^=\"card_name_\"]')].filter(e=>e.getClientRects().length).map(e=>e.dataset.el)")

async def present(pg, id):
    return await ev(pg, "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');return !!e&&e.getClientRects().length>0}", id)

# 日本語の変換（verify_audit_text.py と同じ送り方）
async def _cdp(pg):
    if not hasattr(pg, '_cdpx'): pg._cdpx = await pg.context.new_cdp_session(pg)
    return pg._cdpx
async def ime(pg, steps, final):
    """変換中の文字を steps の順に出し、final で決める"""
    c = await _cdp(pg)
    for t in steps:
        await c.send('Input.imeSetComposition', {'text': t, 'selectionStart': len(t), 'selectionEnd': len(t)}); await pg.wait_for_timeout(60)
    await c.send('Input.insertText', {'text': final}); await pg.wait_for_timeout(150)

async def select_all_edit(pg):
    """書き換え中の箱で MOD+a → 本当に全部選べたか（選んだ文字数＝箱の文字数）を返す"""
    await pg.keyboard.press(f'{MOD}+a'); await pg.wait_for_timeout(120)
    return await ev(pg, """(()=>{const a=document.activeElement;const s=getSelection().toString().replace(/\\s/g,'');const t=(a&&a.isContentEditable?a.innerText:'').replace(/\\s/g,'');return [s.length,t.length]})()""")

async def edit_text(pg, id, steps, final):
    """ダブルクリックで書き換え → MOD+a（全部選べたか確かめる）→ 日本語の変換で打つ → Esc で終える。
    戻り値：準備失敗の文（成り立てば None）"""
    await click(pg, id, n=2); await pg.wait_for_timeout(200)
    if await ev(pg, f"{P}.editingId()") != id:
        await click(pg, id, n=2, scroll=False); await pg.wait_for_timeout(200)
    if await ev(pg, f"{P}.editingId()") != id: return f'{id} の書き換えに入れない'
    s, t = await select_all_edit(pg)
    if t == 0 or s != t: return f'{MOD}+a で全部選べない（選んだ {s} 字／箱 {t} 字）'
    await ime(pg, steps, final)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(450)
    return None

async def preview_on(pg):
    """上の並びの「プレビュー」を本物のクリックで押す（窓が狭くて畳まれていれば「その他」の中）"""
    await ev(pg, "scrollTo(0,0)"); await pg.wait_for_timeout(150)
    if not await clickcss(pg, '#tPreview', 900):
        if not await clickbtn(pg, '#toolbar', ['プレビュー'], wait=900):
            await clickbtn(pg, '#toolbar', ['その他'])
            await clickbtn(pg, 'body', ['プレビュー'], wait=900)
    return bool(await ev(pg, f"{P}.previewMode()"))

# 価格の箱（値段の箱）
PB_BOX = '#priceBox, .price-box, [data-price-box]'
PB_AMT = '#priceBox .pb-amt, .price-box .pb-amt, [data-price-box] .pb-amt, #priceBox input[inputmode=numeric], .price-box input[inputmode=numeric]'
async def open_pricebox(pg, id='card_price_c_dora'):
    if not await selitem(pg, id): return False
    await click(pg, id, dx=20, dy=8, n=2, scroll=False); await pg.wait_for_timeout(350)
    return bool(await cssbb(pg, PB_AMT))

# 金額欄：id・class（PB_AMT）で探し、無ければ値段の箱の中の見えている input から数字の欄
# （type=number・inputmode=numeric・値が数字）を選ぶ。見つけた欄に data-audit-amt を付けて後で読む。
FIND_AMT = """([amt,box])=>{const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
  document.querySelectorAll('[data-audit-amt]').forEach(e=>e.removeAttribute('data-audit-amt'));
  let e=[...document.querySelectorAll(amt)].find(vis);
  if(!e){const B=[...document.querySelectorAll(box)].find(vis);if(B)e=[...B.querySelectorAll('input')].filter(vis).find(i=>i.type==='number'||i.inputMode==='numeric'||i.getAttribute('inputmode')==='numeric'||/^[0-9０-９,，]+$/.test(i.value.trim()))}
  if(!e)return null;e.setAttribute('data-audit-amt','1');const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}"""
AMT_SEL = """(()=>{const e=document.querySelector('[data-audit-amt]');if(!e)return null;const a=document.activeElement===e;let s=null,t=null;
  try{s=e.selectionStart;t=e.selectionEnd}catch(_){}
  const sel=(s===null||s===undefined)?(getSelection().toString()===e.value?[0,e.value.length]:[-1,-1]):[s,t];
  return {focus:a,value:e.value,start:sel[0],end:sel[1]}})()"""
async def amt_value(pg):
    return await ev(pg, "(()=>{const e=document.querySelector('[data-audit-amt]');return e&&e.isConnected&&e.getClientRects().length?e.value:null})()")

async def type_amount(pg, v):
    """金額欄をクリック → MOD+a →（フォーカスが入り全部選べたかを確かめて）v を打つ。
    戻り値：(準備失敗の文 or None, 打った後の欄の値)"""
    xy = await ev(pg, FIND_AMT, [PB_AMT, PB_BOX])
    if not xy: return '値段の箱に金額の欄が無い', None
    await pg.mouse.click(*xy); await pg.wait_for_timeout(200)
    await pg.keyboard.press(f'{MOD}+a'); await pg.wait_for_timeout(100)
    st = await ev(pg, AMT_SEL)
    if not st or not st['focus']: return '金額欄にフォーカスが入らない', None
    if not (st['start'] == 0 and st['end'] == len(st['value'])): return f'{MOD}+a で金額欄を全部選べない（{st}）', None
    await pg.keyboard.type(v); await pg.wait_for_timeout(200)
    return None, await amt_value(pg)

async def amounts(pg, id='card_price_c_dora'):
    p = await ev(pg, f"(s=>{{const r={P}.effPrices(s);return r?r.prices.map(x=>[x.type,x.amount]):null}})('{id}')")
    return p

def rect_dist(a, b):
    """2つの長方形のすき間（重なれば 0）"""
    dx = max(0, max(a['x'], b['x']) - min(a['r'], b['r']))
    dy = max(0, max(a['y'], b['y']) - min(a['b'], b['b']))
    return math.hypot(dx, dy)

def overlap(a, b):
    return a['x'] < b['r'] and b['x'] < a['r'] and a['y'] < b['b'] and b['y'] < a['b']

# ================================================================ 項目

# ---- F44
# 作業票: 窓の大きさが変わったら「写真を変える」と帯も付いてくる。帯が上の並びに重ならない
# 再現: 1440x1000 で特集の写真 F_p0 をクリック（「写真を変える」が写真の上に出る）→ 窓を 1024x800 に狭める。
#       別の context で F_p0 をクリック → 右クリック（写真の操作の帯 #fmenu が出る）→ 窓を 1024x800 に狭める。
#       28 では「写真を変える」が (971,482) に置き去りになり（写真は x 576〜965）、帯は y=27 で上の並び（0〜43）に重なる。
# 合格: 作業票は「付いてくる」なので、消えるのは合格にしない。狭めた後も F_p0 が選ばれたままで、
#       (a)「写真を変える」が見えていて、写真の長方形の中（±8px。狭める前に中になかったなら、前の写真とのすき間＋8px 以内）にあり、
#       上の並びに重ならない。(b) 帯が見えていて、上の並びに重ならず、写真とのすき間が狭める前のすき間＋16px（最低 16px）以内。
# 準備の確かめ: 狭める前に「写真を変える」と帯（写真の操作のボタンを持つ、部品の外の position:fixed/absolute の箱）が見えていること。
PHOTO_BTN = """(()=>{const b=[...document.querySelectorAll('button,[role=button]')].find(b=>{if(b.closest('[data-el]'))return false;const r=b.getBoundingClientRect();const s=getComputedStyle(b);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&parseFloat(s.opacity)>0.05&&(b.textContent||'').includes('写真を変える')});if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,w:r.width,h:r.height,id:b.id||''}})()"""
BAR = """(()=>{const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&parseFloat(s.opacity)>0.05};
  const cands=[...document.querySelectorAll('#fmenu,[role=menu],[role=toolbar],[class*=float],[id*=float],[class*=bar],[id*=bar]')].filter(e=>!e.closest('[data-el]')&&e.id!=='toolbar'&&!e.closest('#toolbar')&&vis(e));
  for(const e of cands){const bs=[...e.querySelectorAll('button,[role=menuitem]')].filter(vis);if(bs.length<2)continue;if(!bs.some(b=>/写真|範囲/.test(b.textContent)))continue;
    const r=e.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,w:r.width,h:r.height,id:e.id||String(e.className).slice(0,20)}}
  return null})()"""
TOOLBAR = "(()=>{const t=document.getElementById('toolbar');if(!t)return null;const r=t.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom}})()"
async def t_F44(br, url):
    msg = []; ok = True
    # (a) 写真を変える
    pg = await fresh(br, url)
    try:
        await click(pg, 'F_p0', dx=200, dy=200)
        ph0 = await bb(pg, 'F_p0'); b0 = await ev(pg, PHOTO_BTN)
        if not b0: return False, '準備失敗：写真をクリックしても「写真を変える」が出ない'
        inside0 = b0['x'] >= ph0['x'] - 8 and b0['r'] <= ph0['r'] + 8 and b0['y'] >= ph0['y'] - 8 and b0['b'] <= ph0['b'] + 8
        d0 = rect_dist(b0, ph0)
        await pg.set_viewport_size({'width': 1024, 'height': 800}); await pg.wait_for_timeout(900)
        ph1 = await bb(pg, 'F_p0'); b1 = await ev(pg, PHOTO_BTN); tb = await ev(pg, TOOLBAR)
        if not ph1: return False, '準備失敗：狭めた後に写真が見えない'
        if abs(ph1['x'] - ph0['x']) < 20: return False, f'準備失敗：狭めても写真が動かない（x {r1(ph0["x"])}→{r1(ph1["x"])}）'
        s1 = await sel(pg)
        if 'F_p0' not in s1: good = False; why = f'写真の選択が外れた {s1}'
        elif b1 is None: good = False; why = '消えた（付いてこない）'
        else:
            if inside0: near = b1['x'] >= ph1['x'] - 8 and b1['r'] <= ph1['r'] + 8 and b1['y'] >= ph1['y'] - 8 and b1['b'] <= ph1['b'] + 8
            else: near = rect_dist(b1, ph1) <= d0 + 8
            ontb = bool(tb) and overlap(b1, tb)
            good = near and not ontb; why = f'({r1(b1["x"])},{r1(b1["y"])})〜({r1(b1["r"])},{r1(b1["b"])}) 写真に付く={near} 上の並びに重なる={ontb}'
        ok &= good
        msg.append(f'写真を変える: 前 ({r1(b0["x"])},{r1(b0["y"])}) 写真 x{r1(ph0["x"])}〜{r1(ph0["r"])} → 狭めた後 {why}・写真 x{r1(ph1["x"])}〜{r1(ph1["r"])} y{r1(ph1["y"])}〜{r1(ph1["b"])}')
    finally: await pg.context.close()
    # (b) 帯
    pg = await fresh(br, url)
    try:
        await click(pg, 'F_p0', dx=200, dy=200)
        await click(pg, 'F_p0', dx=200, dy=200, button='right', scroll=False)
        ph0 = await bb(pg, 'F_p0'); f0 = await ev(pg, BAR)
        if not f0: return False, '準備失敗：写真を右クリックしても写真の操作の帯が出ない / ' + ' / '.join(msg)
        d0 = rect_dist(f0, ph0)
        await pg.set_viewport_size({'width': 1024, 'height': 800}); await pg.wait_for_timeout(900)
        ph1 = await bb(pg, 'F_p0'); f1 = await ev(pg, BAR); tb = await ev(pg, TOOLBAR)
        s1 = await sel(pg)
        if 'F_p0' not in s1: good = False; why = f'写真の選択が外れた {s1}'
        elif f1 is None: good = False; why = '消えた（付いてこない）'
        else:
            ontb = bool(tb) and overlap(f1, tb); d1 = rect_dist(f1, ph1)
            good = (not ontb) and d1 <= max(16, d0 + 16)
            why = f'{f1["id"]} y{r1(f1["y"])}〜{r1(f1["b"])} 写真とのすき間 {r1(d0)}→{r1(d1)} 上の並び(〜{r1(tb["b"]) if tb else None})に重なる={ontb}'
        ok &= good
        msg.append(f'帯: {why}')
    finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- F45
# 作業票: 品が並びから消えたら、その部品の選択を外す
# 再現: トップのどら焼きのカード（card_name_c_dora）を2回クリックして品を選ぶ →「出す月 ▾」→ 1月 を押す
#       （時計は10月）→ 品が並びから消える。28 では selected() に消えた card_name_c_dora が残る。
#       ほかの消え方（販売▾→休む、わらび餅のラベル「おすすめ」を外す）も順に試し、最初に品が消えた道で判定する。
# 合格: 品が消えた後、selected() の中に、ページに見えていない部品が1つも無いこと。
# 準備の確かめ: 選んだ品が selected() に入っていたこと、操作の後にその品のカードがページから消えたこと
#       （どの道でも消えなければ 準備失敗）。
async def t_F45(br, url):
    tried = []
    for label, cid, tool, pop, opt in [
            ('出す月→1月', 'card_name_c_dora', '#tMonth', '#monthPop', '#monthPop [data-month="1"]'),
            ('販売→休む', 'card_name_c_dora', '#tSell', '#sellPop', '#sellPop [data-sell-opt="paused"]'),
            ('ラベル おすすめを外す', 'card_name_c_warabi', '#tLabels', '#labelPop', '#labelPop [data-label-opt="lbl_recommended"]')]:
        pg = await fresh(br, url, clock=True)
        try:
            if not await selitem(pg, cid): tried.append(f'{label}: 品を選べない'); continue
            if not await clickcss(pg, tool): tried.append(f'{label}: {tool} が無い'); continue
            if not await clickcss(pg, opt, 700): tried.append(f'{label}: {opt} が無い'); continue
            await pg.wait_for_timeout(400)
            if await present(pg, cid): tried.append(f'{label}: 品は消えない'); continue
            s = await sel(pg)
            gone = [x for x in s if not await present(pg, x)]
            return (not gone), f'{label} で {cid} が並びから消えた後の選択 {s}（ページに無い部品 {gone}）'
        finally: await pg.context.close()
    return False, '準備失敗：どの道でも品が並びから消えない ' + ' / '.join(tried)

# ---- F46
# 作業票: 時季の文字を正しく（12・1・2月→「12〜2月」、3月と5月→「3月・5月」、11月だけ→「11月だけ」）
# 再現: お品書きのページでどら焼きの行を選ぶ →「出す月 ▾」→「いつでも」→ 月を順に押す（12・1・2／3・5／11）。
#       時計は10月なので行は出ない扱いになり、行に理由の文字（28 では「1〜12月だけ出ます」）が出る。
# 合格: 組み合わせごとに、その行に出る文字（名前・説明・値段以外の行の中の文字）か、その間に出た知らせに
#       期待の文字（「12〜2月」／「3月・5月」／「11月だけ」）があり、間違いの文字（「1〜12月」／「3〜5月」／「11〜11月」）が無いこと。
# 準備の確かめ: 押した後の itemCtx(...).months が組み合わせと同じであること。
ROW_EXTRA = """(id)=>{const e=document.querySelector('[data-el="'+id+'"]');if(!e)return null;const k=e.closest('.krow,[data-plc]')||e.parentElement.parentElement;
  let t=k.innerText;for(const p of k.querySelectorAll('[data-el]'))t=t.split(p.innerText).join(' ');return t.replace(/\\s+/g,' ').trim()}"""
async def t_F46(br, url):
    RID = 'menu__row_name_plc_dora_t'
    cases = [([12, 1, 2], '12〜2月', ['1〜12月', '1〜2月']), ([3, 5], '3月・5月', ['3〜5月']), ([11], '11月だけ', ['11〜11月'])]
    res = []; ok = True
    for months, want, bad in cases:
        pg = await fresh(br, url, clock=True)
        try:
            await gopage(pg, 'pg_menu')
            if not await selitem(pg, RID): return False, '準備失敗：お品書きのどら焼きの行が選べない'
            await clear_notices(pg)
            if not await clickcss(pg, '#tMonth'): return False, '準備失敗：「出す月」が無い'
            if not await clickcss(pg, '#monthPop [data-month-any]'):
                await clickbtn(pg, '#monthPop', ['いつでも'])
            for m in months:
                if not await cssbb(pg, f'#monthPop [data-month="{m}"]'):
                    await selitem(pg, RID); await clickcss(pg, '#tMonth')
                await clickcss(pg, f'#monthPop [data-month="{m}"]', 350)
            got = sorted(await ev(pg, f"{P}.itemCtx('{RID}').months"))
            if got != sorted(months): return False, f'準備失敗：月を押しても {sorted(months)} にならない（{got}）'
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
            row = await ev(pg, ROW_EXTRA, RID) or ''
            nt = await notices(pg)
            alltxt = row + ' ' + ' '.join(nt)
            good = (want in alltxt) and not any(b in alltxt for b in bad)
            ok &= good
            res.append(f'{months}: 行「{row[:40]}」知らせ{[x[:40] for x in nt[:2]]}')
        finally: await pg.context.close()
    return ok, ' / '.join(res)

# ---- F48
# 作業票: 同じ名前のラベルは作らず、既にあるラベルを付ける
# 再現: お品書きのページで芦屋最中の行を選ぶ →「ラベル ▾」→「＋ 新しいラベル」→ 日本語の変換で「おすすめ」と打って決める → Enter。
#       28 では「おすすめ」がもう1つ（lbl_x0001）できて付く。
# 合格: その品のラベルの中で名前が「おすすめ」のものが1つだけで、それが付いている（既にある lbl_recommended が付く）こと。
# 準備の確かめ: 名前の欄にフォーカスが入り、Enter の前の欄の値が「おすすめ」であること。
async def label_new(pg, steps, final):
    """ラベルの一覧を開いて「新しいラベル」に名前を打つ。戻り値：(準備失敗の文 or None, 打った後の欄の値)"""
    await gopage(pg, 'pg_menu')
    if not await selitem(pg, 'menu__row_name_plc_monaka_t'): return '芦屋最中の行が選べない', None
    if not await clickcss(pg, '#tLabels'): return '「ラベル」が無い', None
    if not await clickcss(pg, '#labelPop [data-label-add]', 300):
        if not await clickbtn(pg, '#labelPop', ['新しいラベル']): return '「＋ 新しいラベル」が無い', None
    foc = await ev(pg, "(()=>{const a=document.activeElement;return a&&a.tagName==='INPUT'})()")
    if not foc: return '名前の欄にフォーカスが入らない', None
    if steps or final: await ime(pg, steps, final)
    else: await pg.keyboard.type('   ')
    return None, await ev(pg, "document.activeElement.value")

async def t_F48(br, url):
    pg = await fresh(br, url)
    try:
        err, val = await label_new(pg, ['お', 'おす', 'おすす', 'おすすめ'], 'おすすめ')
        if err: return False, '準備失敗：' + err
        if val != 'おすすめ': return False, f'準備失敗：名前の欄の値が {val!r}'
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        if await ev(pg, "(()=>{const a=document.activeElement;return !!a&&a.tagName==='INPUT'&&a.value==='おすすめ'&&!!a.closest('#labelPop')})()"):
            await clickbtn(pg, '#labelPop', ['足す'], exact=True, wait=500)   # Enter で決まらない形の直し方なら「足す」
        labels = await ev(pg, f"{P}.itemCtx('menu__row_name_plc_monaka_t').labels")
        same = [l for l in labels if (l.get('name') or '').strip() == 'おすすめ']
        ok = len(same) == 1 and same[0].get('on') is True
        return ok, f'名前が「おすすめ」のラベル {[(l["id"], l["on"]) for l in same]}・知らせ {(await notices(pg))[:2]}'
    finally: await pg.context.close()

# ---- F49
# 作業票: ラベルの名前が空なら「名前を入れてください」と知らせる（名前を変える・消す道具は明日）
# 再現: お品書きのページで芦屋最中の行を選ぶ →「ラベル ▾」→「＋ 新しいラベル」→ 半角の空白を3つ打って Enter
#       （欄が残ったままなら「足す」も押す）。28 では何も起きず、何も知らせない。
# 合格: 「名前」を含む知らせ（知らせの要素・確認の箱、またはラベルの一覧の中に新しく出た文字）が出て、
#       名前が空のラベルができていないこと。
# 準備の確かめ: 名前の欄にフォーカスが入り、Enter の前の欄の値が空白3つであること。
async def t_F49(br, url):
    pg = await fresh(br, url)
    try:
        err, val = await label_new(pg, None, None)
        if err: return False, '準備失敗：' + err
        if val != '   ': return False, f'準備失敗：名前の欄の値が {val!r}'
        before = await ev(pg, "(document.getElementById('labelPop')||{}).innerText||''")
        await clear_notices(pg)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        nt = await notices(pg)
        if not any('名前' in x for x in nt):
            await clickbtn(pg, '#labelPop', ['足す'], exact=True, wait=500); nt = await notices(pg)
        after = await ev(pg, "(()=>{const p=document.getElementById('labelPop');return p&&p.getClientRects().length?p.innerText:''})()")
        inline = [l for l in after.split('\n') if '名前' in l and l not in before.split('\n')]
        labels = await ev(pg, f"{P}.itemCtx('menu__row_name_plc_monaka_t').labels")
        blank = [l['id'] for l in labels if not (l.get('name') or '').strip()]
        told = [x for x in nt if '名前' in x] + inline
        return bool(told) and not blank, f'知らせ {nt[:3]}・一覧の中の新しい文字 {inline[:2]}・名前が空のラベル {blank}'
    finally: await pg.context.close()

# ---- F54
# 作業票: 金額は 0 以上の整数だけ（小数・マイナス・とても大きい数は受け付けず知らせる。上限 9,999,999）
# 再現: トップのどら焼きの値段をダブルクリック（値段の箱）→ 金額欄をクリック → MOD+a → 1.5／-300／10000000 を打つ →「決める」。
#       28 では 1円・-300円・10,000,000円 になり、知らせもない。
# 合格: 変な値のそれぞれで、品の値段（effPrices）が元のまま変わらず、打った時か決めた時に新しく出た知らせ
#       （知らせの要素・確認の箱、または値段の箱の中に新しく出た注意の文字）があること。操作の前から見えていた知らせは数えない。
#       打つ時点ではじく（小数点・マイナスが入らない、8桁目が入らない）直し方でも、そのとき知らせれば合格。
#       比べるために 9999999 は受け付けて 9,999,999 になること（上限ちょうど）。
# 準備の確かめ: 値段の箱が開き、金額欄にフォーカスが入り、打つ前に MOD+a で全部選べた
#       （selectionStart=0・selectionEnd=文字数）こと。
async def t_F54(br, url):
    res = []; ok = True
    for v, good_val in [('1.5', False), ('-300', False), ('10000000', False), ('9999999', True)]:
        pg = await fresh(br, url)
        try:
            a0 = await amounts(pg)
            if not await open_pricebox(pg): return False, '準備失敗：値段の箱が開かない'
            box0 = await ev(pg, "c=>{const e=document.querySelector(c);return e?e.innerText:''}", PB_BOX)
            await pg.wait_for_timeout(200); await clear_notices(pg)
            err, val = await type_amount(pg, v)
            if err: return False, f'準備失敗：{v}: {err}'
            box_t = await ev(pg, "c=>{const e=[...document.querySelectorAll(c)].find(e=>e.getClientRects().length);return e?e.innerText:''}", PB_BOX)
            if not await clickbtn(pg, PB_BOX, ['決める', 'OK', '決定'], exact=False):
                await pg.keyboard.press('Enter'); await pg.wait_for_timeout(450)
            a1 = await amounts(pg); nt = await notices(pg)
            box1 = await ev(pg, "c=>{const e=[...document.querySelectorAll(c)].find(e=>e.getClientRects().length);return e?e.innerText:''}", PB_BOX)
            old = box0.split('\n')
            inline = [l for l in (box_t + '\n' + box1).split('\n') if l.strip() and l not in old]
            if good_val:
                g = a1 is not None and [x[1] for x in a1] == [int(v)]
            else:
                g = a1 == a0 and bool(nt or inline)
            ok &= g
            res.append(f'{v}: 欄 {val!r} 値段 {a0}→{a1} 知らせ{[x[:30] for x in nt[:1]]}{inline[:1]}')
        finally: await pg.context.close()
    return ok, ' / '.join(res)

# ---- F55
# 作業票: 値段の箱の外を押したら、打った値段を決める（PowerPoint と同じく外で確定）
# 再現: トップのどら焼きの値段をダブルクリック → 金額欄で MOD+a → 480 → 何もない所（右下の余白）をクリック。
#       28 では箱が閉じて値段は 250 のまま（打った値が捨てられる）。
# 合格: 外をクリックした後、品の値段（effPrices）が 480 になり、ページの値段の文字にも 480 が出ること。
# 準備の確かめ: 値段の箱が開き、金額欄にフォーカスが入り MOD+a で全部選べ、打った後の欄の値が 480 であること。クリックする所が部品・値段の箱の外であること。
async def t_F55(br, url):
    pg = await fresh(br, url)
    try:
        a0 = await amounts(pg)
        if not await open_pricebox(pg): return False, '準備失敗：値段の箱が開かない'
        err, val = await type_amount(pg, '480')
        if err: return False, '準備失敗：' + err
        if val != '480': return False, f'準備失敗：480 を打った後の金額欄が {val!r}'
        hit = await ev(pg, "([x,y])=>{const e=document.elementFromPoint(x,y);if(!e)return 'なし';if(e.closest('[data-el]'))return 'part:'+e.closest('[data-el]').dataset.el;if(e.closest('#priceBox,.price-box,#toolbar'))return 'box';return ''}", list(OUT))
        if hit: return False, f'準備失敗：外のクリックの所に {hit} がある'
        await pg.mouse.click(*OUT); await pg.wait_for_timeout(600)
        a1 = await amounts(pg); shown = await ev(pg, "(()=>{const e=document.querySelector('[data-el=card_price_c_dora]');return e?e.innerText:null})()")
        ok = a1 is not None and [x[1] for x in a1] == [480] and bool(shown and '480' in shown)
        return ok, f'外をクリック: 値段 {a0}→{a1}・ページの文字「{shown}」・箱 {"開いたまま" if await cssbb(pg, PB_AMT) else "閉じた"}'
    finally: await pg.context.close()

# ---- F57
# 作業票: アクセスの項目名が長いときも、値の行と上がそろう
# 判断（コーディネーター）: 28 で PC 1440・1024・スマホの表示のどれでも再現せず、画面を見て「問題ではなかった
#       （元の精査の読み違い）」と判断した。直しで壊れていないかを見るため、判定は残す（28 でも OK になる）。
# 再現: アクセスのページで「駐車場」の項目名をダブルクリック → MOD+a → 日本語の変換で
#       「駐車場・駐輪場のご案内（お車でお越しの方へ）」と打って Esc。窓 1440 と 1024 の PC の表示で、編集の画面とプレビューを見る。
#       窓 1440 で上の並びの「スマホ」を押し、スマホの表示（項目名の下に値）も見る。
# 合格: PC：項目名（contact__cl_parking）の1行目の字の上端と、値（contact__ci_parking）の1行目の字の上端の差が 4px 以内
#       （行の高さの違いで箱の上端は 3px ずれるため、字の上端で比べる。箱の上端をそろえる直し方でも 3.2px で収まる）。
#       項目名が欄からはみ出して値に重ならない（項目名の右端 ≤ 値の左端）。
#       スマホ：項目名と値の左端の差が 4px 以内で、項目名の下端が値の1行目の字の上端より上（重ならない）。
# 準備の確かめ: 項目名が書き換わり、PC で2行以上に折れていること。スマホの表示に切り替わったこと。
FIRST_GLYPH = """(id)=>{const e=document.querySelector('[data-el="'+id+'"]');if(!e)return null;const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let t;
  while(t=w.nextNode()){for(let i=0;i<t.data.length;i++){if(!t.data[i].trim())continue;const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);const b=r.getClientRects()[0];if(b)return {top:b.top,left:b.left}}}return null}"""
LINES_OF = """(id)=>{const e=document.querySelector('[data-el="'+id+'"]');if(!e)return 0;const tops=new Set();const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let t;
  while(t=w.nextNode()){for(let i=0;i<t.data.length;i++){const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);const b=r.getClientRects()[0];if(b)tops.add(Math.round(b.top/4))}}return tops.size}"""
async def f57_edit(pg):
    LONG = '駐車場・駐輪場のご案内（お車でお越しの方へ）'
    await gopage(pg, 'pg_contact')
    err = await edit_text(pg, 'contact__cl_parking', ['ちゅうしゃじょう', '駐車場'], LONG)
    if err: return err
    await pg.mouse.click(5, 300); await pg.wait_for_timeout(400)
    t = (await ev(pg, "(()=>{const e=document.querySelector('[data-el=contact__cl_parking]');return e?e.innerText.replace(/\\s/g,''):''})()"))
    if t != LONG: return f'項目名が書き換わらない（{t!r}）'
    return None

async def t_F57(br, url):
    res = []; ok = True
    for w in (1440, 1024):
        pg = await fresh(br, url, w, 900)
        try:
            err = await f57_edit(pg)
            if err: return False, '準備失敗：' + err
            nl = await ev(pg, LINES_OF, 'contact__cl_parking')
            if nl < 2: return False, f'準備失敗：窓 {w} で項目名が折れない（{nl} 行）'
            for mode in ('編集', 'プレビュー'):
                if mode == 'プレビュー':
                    if not await preview_on(pg): return False, f'準備失敗：窓 {w} でプレビューに入れない'
                await scrollto(pg, 'contact__cl_parking')
                a = await ev(pg, FIRST_GLYPH, 'contact__cl_parking'); b = await ev(pg, FIRST_GLYPH, 'contact__ci_parking')
                la = await bb(pg, 'contact__cl_parking'); lb = await bb(pg, 'contact__ci_parking')
                if not (a and b and la and lb): ok = False; res.append(f'{w} {mode}: 項目名か値が見えない'); continue
                d = b['top'] - a['top']; over = la['r'] - lb['x']
                g = abs(d) <= 4 and over <= 0.5; ok &= g
                res.append(f'{w} {mode}: 1行目の上端の差 {r1(d)}px・項目名の右端−値の左端 {r1(over)}px（項目名 {nl} 行）')
        finally: await pg.context.close()
    # スマホの表示（上の並びの「スマホ」）
    pg = await fresh(br, url)
    try:
        err = await f57_edit(pg)
        if err: return False, '準備失敗：' + err
        await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(150)
        if not await clickcss(pg, '#dSP', 900):
            if not await clickbtn(pg, '#toolbar', ['スマホ'], exact=True, wait=900): return False, '準備失敗：上の並びに「スマホ」が無い'
        await scrollto(pg, 'contact__cl_parking')
        la = await bb(pg, 'contact__cl_parking'); lb = await bb(pg, 'contact__ci_parking')
        if not (la and lb): return False, '準備失敗：スマホの表示で項目名か値が見えない'
        if la['w'] > 600: return False, f'準備失敗：スマホの表示に切り替わらない（項目名の幅 {r1(la["w"])}）'
        b = await ev(pg, FIRST_GLYPH, 'contact__ci_parking')
        dx = la['x'] - lb['x']; gap = b['top'] - la['b'] if b else None
        g = abs(dx) <= 4 and gap is not None and gap >= -0.5; ok &= g
        res.append(f'スマホ: 左端の差 {r1(dx)}px・項目名の下端→値の字の上端 {r1(gap)}px')
    finally: await pg.context.close()
    return ok, ' / '.join(res)

# ---- F59
# 作業票: お品書きで品を消したら、トップの並びからも消えたことを知らせに含める
# 再現: お品書きのページでどら焼きの行を選んで Delete。28 の知らせは「『どら焼き』をお品書きから消しました」だけで、
#       トップのおすすめの品の並びからも消えたことを言わない。
# 合格: トップの並びからどら焼きが消えたなら、消したときに出た知らせに「トップ」（または TOP）が含まれること。
#       28 と同じくトップから消えることが前提。トップに残るなら NG（作業票は知らせの直しで、消えないようにする直しではない）。
# 準備の確かめ: 始めにトップの並びにどら焼きがあること、Delete でお品書きの行が消えたこと。
async def t_F59(br, url):
    pg = await fresh(br, url)
    try:
        c0 = await cards(pg)
        if 'card_name_c_dora' not in c0: return False, f'準備失敗：トップにどら焼きが無い {c0}'
        await gopage(pg, 'pg_menu')
        if not await selitem(pg, 'menu__row_name_plc_dora_t'): return False, '準備失敗：お品書きのどら焼きの行が選べない'
        await clear_notices(pg)
        await pg.keyboard.press('Delete'); await pg.wait_for_timeout(700)
        if await present(pg, 'menu__row_name_plc_dora_t'):
            # Delete で消えない直し方なら右クリック→削除／消す
            await click(pg, 'menu__row_name_plc_dora_t', dx=20, dy=8, button='right')
            await clickbtn(pg, '#fmenu', ['削除', '消す'], wait=700)
        if await present(pg, 'menu__row_name_plc_dora_t'): return False, '準備失敗：お品書きのどら焼きの行が消えない'
        nt = await notices(pg)
        await gopage(pg, 'pg_home'); c1 = await cards(pg)
        if 'card_name_c_dora' in c1: return False, f'トップから消えない（作業票は知らせで、消えないようにする直しではない） 並び {c1}・知らせ {nt[:2]}'
        ok = any(('トップ' in x or 'TOP' in x) for x in nt)
        return ok, f'トップの並び {len(c0)}→{len(c1)}（どら焼きが消えた）・知らせ {nt[:3]}'
    finally: await pg.context.close()

# ---- F60
# 作業票: 「元の位置に戻す」で左右の入れ替えも戻るときは、そのことを知らせる
# 再現: 特集の写真 F_p0 を右クリック →「左右を入れ替える」→ 見出し F_h1 をクリックして Shift+→（10px）→
#       F_h1 を右クリック →「元の位置に戻す」。28 では左右の入れ替えまで知らせなしに戻る（F_p0 が x 149→766）。
# 合格: 入れ替えが戻った（F_p0 の x が入れ替える前に戻った）なら、そのとき出た知らせに「入れ替」か「左右」が含まれること。
#       入れ替えが戻らないなら、「元の位置に戻す」が本当に効いた（F_h1 の x が Shift+→ の前に戻った）ときだけ合格。
#       F_h1 が戻らなければ 準備失敗。
# 準備の確かめ: 左右を入れ替えて F_p0 の x が 100px 以上動いたこと、Shift+→ で F_h1 が動いたこと、
#       「元の位置に戻す」が一覧にあること。
async def t_F60(br, url):
    pg = await fresh(br, url)
    try:
        x0 = (await ev(pg, f"{P}.geometry()"))['F_p0']['x']
        await click(pg, 'F_p0', dx=100, dy=100, button='right')
        if not await clickbtn(pg, '#fmenu', ['左右を入れ替える', '入れ替え']): return False, '準備失敗：写真の右クリックに「左右を入れ替える」が無い'
        x1 = (await ev(pg, f"{P}.geometry()"))['F_p0']['x']
        if abs(x1 - x0) < 100: return False, f'準備失敗：入れ替えても F_p0 が動かない（x {x0}→{x1}）'
        await pg.keyboard.press('Escape')
        h0 = (await ev(pg, f"{P}.geometry()"))['F_h1']['x']
        await click(pg, 'F_h1', dx=40, dy=12)
        await pg.keyboard.press('Shift+ArrowRight'); await pg.wait_for_timeout(350)
        h1 = (await ev(pg, f"{P}.geometry()"))['F_h1']['x']
        if abs(h1 - h0) < 5: return False, f'準備失敗：Shift+→ で F_h1 が動かない（x {h0}→{h1}）'
        await click(pg, 'F_h1', dx=40, dy=12, button='right', scroll=False)
        await clear_notices(pg)
        if not await clickbtn(pg, '#fmenu', ['元の位置に戻す', '元の位置']): return False, '準備失敗：F_h1 の右クリックに「元の位置に戻す」が無い'
        await pg.wait_for_timeout(300)
        g = await ev(pg, f"{P}.geometry()"); x2 = g['F_p0']['x']; h2 = g['F_h1']['x']; nt = await notices(pg)
        unswapped = abs(x2 - x0) < abs(x2 - x1)
        if not unswapped:
            if abs(h2 - h0) > 1: return False, f'準備失敗：「元の位置に戻す」で F_h1 が戻らない（x {h0}→{h1}→{h2}）'
            return True, f'入れ替えは戻らない（F_p0 x {x0}→{x1}→{x2}）・F_h1 x {h0}→{h1}→{h2}・知らせ {nt[:2]}'
        ok = any(('入れ替' in x or '左右' in x) for x in nt)
        return ok, f'入れ替えも戻る（F_p0 x {x0}→{x1}→{x2}）・F_h1 x {h0}→{h1}→{h2}・知らせ {nt[:3]}'
    finally: await pg.context.close()

# ---- F62
# 作業票: 同じ名前の品ができるときは知らせる（止めない）
# 再現: トップのどら焼きのカードの名前をダブルクリック → MOD+a → 日本語の変換で「わらび餅」と打って Esc。
#       28 では「わらび餅」が2つ並び、何も知らせない。
# 合格: 名前は「わらび餅」に変わり（止めない）、そのとき出た知らせに同じ名前のことが分かる言葉
#       （同じ名前・同名・すでに・既に・ほかにも・他にも のどれか）が含まれること。
# 準備の確かめ: 書き換えに入り、MOD+a で名前を全部選べたこと。
async def t_F62(br, url):
    pg = await fresh(br, url)
    try:
        await selitem(pg, 'card_name_c_dora')
        await clear_notices(pg)
        err = await edit_text(pg, 'card_name_c_dora', ['わらびもち', 'わらび餅'], 'わらび餅')
        if err: return False, '準備失敗：' + err
        await pg.wait_for_timeout(300)
        nt = await notices(pg)
        names = await ev(pg, "[...document.querySelectorAll('[data-el^=\"card_name_\"]')].map(e=>e.innerText.trim())")
        same = names.count('わらび餅') >= 2
        told = [x for x in nt if re.search('同じ名前|同名|すでに|既に|ほかにも|他にも', x)]
        if not same: return False, f'名前が変わらない（止めた） 並び {names}・知らせ {nt[:2]}'
        return bool(told), f'並び {names}・知らせ {nt[:3]}'
    finally: await pg.context.close()

# ---- F64
# 作業票: 写真のない枠を公開で詰めるときは、元からある写真でも公開前の確認に出す
# 再現: 特集の写真 F_p0（元からある写真）を右クリック →「写真を外す」。28 の publishCheck() は空（足したセクションの
#       空の枠だけを出す）で、公開すると知らせなしに詰まる。
# 合格: publishCheck() に F_p0 についての項目があり、その文に内部の名前（F_p0 など）が出ていないこと。
# 準備の確かめ: photos() の F_p0 が cleared（または missing）になったこと。
async def t_F64(br, url):
    pg = await fresh(br, url)
    try:
        await click(pg, 'F_p0', dx=100, dy=100, button='right')
        if not await clickbtn(pg, '#fmenu', ['写真を外す']): return False, '準備失敗：右クリックに「写真を外す」が無い'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        ph = [x for x in await ev(pg, f"{P}.photos()") if x['part'] == 'F_p0']
        if not ph or not (ph[0].get('cleared') or ph[0].get('missing')): return False, f'準備失敗：写真が外れない {ph}'
        chk = await ev(pg, f"{P}.publishCheck()")
        rel = [i for i in chk if any(p == 'F_p0' for p in i.get('parts', []))]
        clean = [i for i in rel if i.get('text') and not ID_RE.search(i['text'])]
        return bool(clean), f'公開前の確認 {[(i.get("kind"), i.get("parts"), (i.get("text") or "")[:40]) for i in chk][:4]}'
    finally: await pg.context.close()

# ---- F65
# 作業票: （写真のない枠を公開で詰めるとき）詰めたときに文の左右がずれない
# 再現: 準備として特集のセクションを1つ足す（sectionAdd。写真の枠は空）→ 上の並びの「プレビュー」。
#       28 では写真が詰められ、2つ目の段の見出し・本文が x 790 から 149 へ寄り、1つ目の段（x 173）ともそろわない。
# 合格: 足したセクションの見出し・本文（F_h0・F_b0・F_h1・F_b1）が、(a) プレビューでも編集の画面と同じ x（±2px）にある、
#       または (b) プレビューで4つの x が互いにそろう（差 2px 以内）こと。
# 準備の確かめ: セクションが増えたこと、プレビューに入れたこと。
async def t_F65(br, url):
    pg = await fresh(br, url)
    try:
        before = [s['id'] for s in await ev(pg, f"{P}.sectionList()")]
        await ev(pg, f"{P}.sectionAdd({len(before)},'feature')"); await pg.wait_for_timeout(800)
        after = [s['id'] for s in await ev(pg, f"{P}.sectionList()")]
        new = [s for s in after if s not in before]
        if not new: return False, '準備失敗：特集のセクションを足せない'
        sid = new[0]; parts = [f'{sid}__{k}' for k in ('F_h0', 'F_b0', 'F_h1', 'F_b1')]
        e = {}
        for k in parts:
            await scrollto(pg, k); r = await bb(pg, k)
            if not r: return False, f'準備失敗：{k} が見えない'
            e[k] = r['x']
        if not await preview_on(pg): return False, '準備失敗：プレビューに入れない'
        v = {}
        for k in parts:
            await scrollto(pg, k); r = await bb(pg, k); v[k] = r['x'] if r else None
        if any(x is None for x in v.values()): return False, f'プレビューで見えない文 {[k for k in v if v[k] is None]}'
        same_pos = all(abs(v[k] - e[k]) <= 2 for k in parts)
        aligned = max(v.values()) - min(v.values()) <= 2
        phs = [await bb(pg, f'{sid}__F_p0'), await bb(pg, f'{sid}__F_p1')]
        return same_pos or aligned, 'x 編集→プレビュー ' + ' '.join(f'{k.split("__")[1]} {r1(e[k])}→{r1(v[k])}' for k in parts) + f'・プレビューの写真の枠 {"出ない" if not any(phs) else "出る"}'
    finally: await pg.context.close()

# ---- F66
# 作業票: 表の行の縦線を値段の脇に（§4。28 は style が left:700pxpx で効かず、表の左端に出る）
# 再現: 1440x1000 でトップの表（甘味処）の行を見る（操作は要らない）。
# 合格: 行ごとに、縦線（row_vline_*）の左端が値段の箱（row_price_*）の左端から ±24px にあること。
# 準備の確かめ: 縦線と値段の箱がどちらも見えていること（表の行が1つ以上あること）。
async def t_F66(br, url):
    pg = await fresh(br, url)
    try:
        await scrollto(pg, 'I_table')
        rows = await ev(pg, "[...document.querySelectorAll('[data-el^=\"row_vline_\"]')].map(e=>e.dataset.el.replace('row_vline_',''))")
        if not rows: return False, '準備失敗：表の行の縦線が無い'
        res = []; ok = True
        for r in rows:
            v = await bb(pg, f'row_vline_{r}'); p = await bb(pg, f'row_price_{r}')
            if not v or not p: return False, f'準備失敗：{r} の縦線か値段が見えない（縦線 {bool(v)} 値段 {bool(p)}）'
            d = v['x'] - p['x']; ok &= abs(d) <= 24
            res.append(f'{r}: 縦線 x {r1(v["x"])}・値段 x {r1(p["x"])}（差 {r1(d)}）')
        st = await ev(pg, "(()=>{const e=document.querySelector('[data-el^=\"row_vline_\"]');return e?e.getAttribute('style').match(/left:[^;]*/)?.[0]:null})()")
        return ok, ' / '.join(res) + f'・style {st}'
    finally: await pg.context.close()

# ---- F68
# 作業票: スマホではみ出したら、公開前の確認で「どの部品が・どちらへ」はみ出しているかを店主の言葉で出し、編集の画面が横にスクロールしない
# 再現: 指で触るスマホ（390x844）で特集の見出し F_h0 を指で軽く叩いて選ぶ → Shift+→ を20回（200px 右へ）。
#       28 では編集の画面の scrollWidth が 390→584 に広がって横にスクロールし、publishCheck() の文は
#       「スマホ：特集1の見出しがはみ出しています」（どちらへかが無い）。
# 合格: (1) 編集の画面（documentElement と body）の scrollWidth が、動かす前より 1px を越えて広がらない。
#       (2) publishCheck() に F_h0 についての項目があり、その文が「見出し」と向き「右」を含み、内部の名前（F_h0 など）を含まない。
# 準備の確かめ: 指で叩いて F_h0 が選ばれたこと、動かした後の F_h0 の右端（geometry）がスマホの幅を越えたこと。
class Touch:
    async def open(self, br, url, w=390, h=844):
        self.ctx = await br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=3, is_mobile=True, has_touch=True)
        await block_fonts(self.ctx)
        await self.ctx.add_init_script(NOTICE_WATCH)
        self.pg = await self.ctx.new_page(); self.pg._e = []; self.pg._dlg = []
        self.pg.on('pageerror', lambda e: self.pg._e.append('PE ' + str(e)))
        self.pg.on('dialog', lambda d: (self.pg._dlg.append(d.type + ' ' + d.message), asyncio.ensure_future(d.dismiss())))
        self.cdp = await self.ctx.new_cdp_session(self.pg)
        await self.pg.goto(url); await self.pg.wait_for_timeout(1600); return self
    async def T(self, kind, pts):
        o = await self.pg.evaluate("[visualViewport.offsetLeft,visualViewport.offsetTop]")
        await self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x - o[0], 'y': y - o[1], 'id': i} for (i, x, y) in pts]})
    async def tap(self, x, y, hold=60):
        await self.T('touchStart', [(0, x, y)]); await self.pg.wait_for_timeout(hold); await self.T('touchEnd', []); await self.pg.wait_for_timeout(350)

SW = "[document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth]"
async def t_F68(br, url):
    t = await Touch().open(br, url)
    pg = t.pg
    try:
        sw0 = await ev(pg, SW)
        await scrollto(pg, 'F_h0'); r = await bb(pg, 'F_h0')
        if not r: return False, '準備失敗：見出しが見えない'
        await t.tap(r['x'] + min(40, r['w'] / 2), r['y'] + r['h'] / 2)
        if 'F_h0' not in await sel(pg): await t.tap(r['x'] + min(40, r['w'] / 2), r['y'] + r['h'] / 2)
        if 'F_h0' not in await sel(pg): return False, f'準備失敗：指で叩いても見出しが選べない {await sel(pg)}'
        for _ in range(20): await pg.keyboard.press('Shift+ArrowRight'); await pg.wait_for_timeout(30)
        await pg.wait_for_timeout(700)
        g = (await ev(pg, f"{P}.geometry()")).get('F_h0')
        devw = await ev(pg, "(()=>{const s=document.querySelector('#sectionwrap');return s?s.getBoundingClientRect().width:390})()")
        # 2026-10-26 手順の直し（DECISIONS #14・#33。判定は同じ）：矢印キーはページの左右で止まるようになり（#33）、Shift+→ では幅を越えなくなった。
        # はみ出しは前の版の記録（外へ出した M1）を開いたときなどに今も起きるので、矢印で越えなければ、その記録と同じ手直し（M1 の dx 200）を入れてはみ出しを作る
        if g and g['x'] + g['w'] <= min(390, devw) + 1:
            await ev(pg, "PG.commit({t:'move',device:'sp',items:[{id:'F_h0',mode:'M1',dx:200,dy:0}]})"); await pg.wait_for_timeout(700)
            g = (await ev(pg, f"{P}.geometry()")).get('F_h0')
        if not g or g['x'] + g['w'] <= min(390, devw) + 1: return False, f'準備失敗：見出しがスマホの幅を越えない（geometry {g}）'
        sw1 = await ev(pg, SW)
        chk = await ev(pg, f"{P}.publishCheck()")
        rel = [i for i in chk if any(p == 'F_h0' for p in i.get('parts', []))]
        good_txt = [i for i in rel if '見出し' in (i.get('text') or '') and '右' in (i.get('text') or '') and not ID_RE.search(i.get('text') or '')]
        c1 = sw1[0] <= sw0[0] + 1 and sw1[1] <= sw0[1] + 1
        return c1 and bool(good_txt), f'scrollWidth {sw0[:2]}→{sw1[:2]}（窓 {sw0[2]}→{sw1[2]}）・見出し x {r1(g["x"])} 幅 {r1(g["w"])}・公開前の確認 {[(i.get("device"), (i.get("text") or "")[:40]) for i in rel][:3]}'
    finally: await t.ctx.close()

# ================================================================ 走らせる
ITEMS = [('F44', t_F44), ('F45', t_F45), ('F46', t_F46), ('F48', t_F48), ('F49', t_F49), ('F54', t_F54), ('F55', t_F55),
         ('F57', t_F57), ('F59', t_F59), ('F60', t_F60), ('F62', t_F62), ('F64', t_F64), ('F65', t_F65), ('F66', t_F66), ('F68', t_F68)]

async def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    url = Path(sys.argv[1]).resolve().as_uri()
    want = [a.upper() for a in sys.argv[2:]]
    unknown = [w for w in want if w not in dict(ITEMS)]
    if unknown: print('知らない ID:', unknown); sys.exit(2)
    todo = [(k, f) for k, f in ITEMS if not want or k in want]
    os.makedirs(WORK, exist_ok=True)
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
