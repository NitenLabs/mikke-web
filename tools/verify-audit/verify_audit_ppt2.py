# -*- coding: utf-8 -*-
"""回帰の確認：PowerPoint にそろえる 後半（area = ppt2）

使い方: python3 verify_audit_ppt2.py /path/to/playgroundNN_single.html [ID ...]
  ID を並べるとその項目だけ（例: P16 P26）。省略で全部。
出力: 1項目1行 `OK P16 | 説明` / `NG P16 | 実際の値`。最後に `合計 OK x / NG y（n秒）`。終了コード＝NG の数。

担当: 作業票 wa-01_layout_playground29_workorder.md §5.2 の P16〜P29（PC・マウスが対象。スマホは対象外）

判定の決まり（TESTBRIEF2.md）
- 操作は本物のマウス・キーボードで起こす。window.__playground は状態を読むのと準備（部品を重ねる・最背面へ送る）にだけ使う。
- Cmd の操作は必ず MOD で送る（Mac は Meta、ほかは Control）。Option は Alt。
  Mac の Chrome では Ctrl+A は「行の頭へ」、Ctrl+I は効かないので、Control で Cmd の意味を送ると Mac で空振りする。
- 空振りの合格を作らない：各項目で、操作が本当に起きたこと（キーがページに届いた・ドラッグが始まった・選べた）を確かめ、
  成り立たなければ `NG <ID> | 準備失敗：…` にする。
- 期待は「PowerPoint と同じ結果になること」で書く。ボタンは文字・title・aria-label・data 属性の複数の候補で探す。
  見つからないときは NG（「その道具がない」）。
- 知らせは #pgToast など＋ role=status/alert・aria-live・.toast・dialog を 80ms ごとに見張る（数秒で消える知らせも拾う）。
- 項目ごとに browser context を作り直す。1項目 120 秒で打ち切り、例外は NG。
- このファイルは自分の中だけで完結させた（ほかの担当のファイルに触らない）。
"""
import asyncio, json, math, os, re, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, '_work')   # この担当は試験用の画像を使わない（写真は試験台の元の写真で足りる）
P = 'window.__playground'

# Cmd の操作は MOD で送る（Mac は Meta、ほかは Control）
MOD = 'Meta' if sys.platform == 'darwin' else 'Control'
VW, VH = 1440, 1000

class PrepFail(Exception):
    pass

# ---------------------------------------------------------------- 見張り（ページに入れる）
WATCH = r"""
(()=>{ window.__auditNotices=[]; window.__auditKeys=[]; const seen=new Map();
  window.addEventListener('keydown',e=>{ window.__auditKeys.push({k:e.key,m:e.metaKey,c:e.ctrlKey,a:e.altKey,s:e.shiftKey}); },true);
  const SEL='#pgToast,.pg-toast,[role=status],[role=alert],[role=alertdialog],[aria-live],.toast,[class*=toast],[id*=toast],[id*=Toast],[role=dialog],dialog[open]';
  setInterval(()=>{ try{
    for(const e of document.querySelectorAll(SEL)){
      if(e.id==='publishToast') continue;
      if(e.closest && e.closest('#toolbar')) continue;    // 保存の状態などは知らせに数えない
      const cs=getComputedStyle(e), r=e.getBoundingClientRect(), t=(e.innerText||'').trim();
      const vis=r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.05&&t;
      if(vis){ if(seen.get(e)!==t){ seen.set(e,t); window.__auditNotices.push(t.slice(0,120)); } } else seen.delete(e);
    } }catch(_){} },80);
})();
"""

# ---------------------------------------------------------------- 共通の小道具
async def fresh(br, url, w=VW, h=VH):
    ctx = await br.new_context(viewport={'width': w, 'height': h})
    # Google Fonts を止める（Mac では本物の書体が読まれて字の寸法が変わり、閾値がずれるため。Linux はもともと届かない）
    await ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/'), lambda route: route.abort())
    await ctx.add_init_script(WATCH)
    pg = await ctx.new_page(); pg._e = []; pg._dlg = []
    pg.on('pageerror', lambda e: pg._e.append('PE ' + str(e)))
    pg.on('dialog', lambda d: (pg._dlg.append(d.type + ' ' + d.message), asyncio.ensure_future(d.dismiss())))
    await pg.goto(url); await pg.wait_for_timeout(1500)
    return pg

def ev(pg, js, *a): return pg.evaluate(js, *a)
def r1(v): return round(v, 1) if isinstance(v, (int, float)) else v

async def vb(pg, id):
    """画面上の位置（なければ None）。py＝ページ上の y"""
    return await ev(pg, "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const r=e.getBoundingClientRect();if(r.width==0&&r.height==0)return null;return {x:r.x,y:r.y,w:r.width,h:r.height,py:r.y+scrollY,cx:r.x+r.width/2,cy:r.y+r.height/2}}", id)

async def scrollto(pg, id):
    await ev(pg, "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(e)e.scrollIntoView({block:'center'})}", id)
    await pg.wait_for_timeout(250)

async def sel(pg): return await ev(pg, f"{P}.selected()")
async def editing(pg): return await ev(pg, f"{P}.editingId()")
async def geom(pg, id): return (await ev(pg, f"{P}.geometry()")).get(id)
async def sections(pg): return [s['id'] for s in await ev(pg, f"{P}.sectionList()")]
async def keys(pg): return await ev(pg, "window.__auditKeys||[]")
async def clear_keys(pg): await ev(pg, "window.__auditKeys&&(window.__auditKeys.length=0)")
async def clear_notices(pg): await ev(pg, "window.__auditNotices&&(window.__auditNotices.length=0)"); pg._dlg.clear()
async def notices(pg):
    await pg.wait_for_timeout(250)
    return (await ev(pg, "window.__auditNotices||[]")) + ['[箱] ' + d for d in pg._dlg]

async def visible_notice_texts(pg):
    """今見えている知らせ（見張りと同じ探し方）の文"""
    return await ev(pg, """(()=>{const SEL='#pgToast,.pg-toast,[role=status],[role=alert],[role=alertdialog],[aria-live],.toast,[class*=toast],[id*=toast],[id*=Toast],[role=dialog],dialog[open]';
      return [...document.querySelectorAll(SEL)].filter(e=>{const cs=getComputedStyle(e),r=e.getBoundingClientRect();return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.05}).map(e=>(e.innerText||'').trim().slice(0,120)).filter(t=>t)})()""")

async def leaves_with_text(pg, t):
    """その文と同じ文の、いちばん内側の部品（見えているもの）"""
    return await ev(pg, "t=>[...document.querySelectorAll('[data-el]')].filter(e=>{const r=e.getBoundingClientRect();return (r.width>0||r.height>0)&&!e.querySelector('[data-el]')&&e.innerText.trim()===t}).map(e=>e.dataset.el)", t)

async def visible_ids(pg):
    return await ev(pg, "[...document.querySelectorAll('[data-el]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0||r.height>0}).map(e=>e.dataset.el)")

async def key_reached(pg, key, mod=False, shift=None, alt=None):
    """そのキーがページ（window の keydown）に届いたか。mod=True なら Cmd/Ctrl つきで"""
    for k in await keys(pg):
        if k['k'].lower() != key.lower(): continue
        if mod and not (k['m'] if MOD == 'Meta' else k['c']): continue
        if shift is not None and k['s'] != shift: continue
        if alt is not None and k['a'] != alt: continue
        return True
    return False

async def select_part(pg, id, dx=None, dy=None):
    """部品を「書き換えずに」選んだ状態にする。
    試験台28 では1回のクリックで選べる。P2 を直した版では1回のクリックで書き換えに入るので、そのときは Esc で
    書き換えを終えて箱を選んだ状態にする（PowerPoint と同じ）。品の中の部品は1回目で並び、2回目で品の部品になる。"""
    await scrollto(pg, id)
    for _ in range(2):
        r = await vb(pg, id)
        if not r: raise PrepFail(f'{id} が見えない')
        x = r['x'] + (dx if dx is not None else min(40, r['w'] / 2)); y = r['y'] + (dy if dy is not None else min(12, r['h'] / 2))
        await pg.mouse.click(x, y); await pg.wait_for_timeout(350)
        if await editing(pg):
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        s = await sel(pg)
        if s == [id] and not await editing(pg): return r
    raise PrepFail(f'{id} を書き換えずに選べない（選択 {await sel(pg)} 書き換え中 {await editing(pg)}）')

async def blank_point(pg, sec):
    """そのセクションの中で、部品の上でない所（画面の中・上の並びより下）"""
    await ev(pg, "s=>{const e=document.querySelector('.sec-wrap[data-sec=\"'+s+'\"]')||document.querySelector('[data-sec=\"'+s+'\"]');e.scrollIntoView({block:'start'});scrollBy(0,-60)}", sec)
    await pg.wait_for_timeout(300)
    p = await ev(pg, """s=>{const tb=document.getElementById('toolbar');const top=(tb?tb.getBoundingClientRect().bottom:0)+20;
      const W=document.querySelector('.sec-wrap[data-sec="'+s+'"]')||document.querySelector('[data-sec="'+s+'"]');const R=W.getBoundingClientRect();
      // セクションの縁から 40px 内側だけを探す（セクションの札・＋のボタンを押さないように）
      for(let y=Math.max(top,R.top+40);y<Math.min(innerHeight-20,R.bottom-40);y+=23)for(let x=Math.max(30,R.left+40);x<Math.min(innerWidth-30,R.right-40);x+=37){const e=document.elementFromPoint(x,y);if(!e)continue;
        if(e.closest('[data-el]')||e.closest('#toolbar')||e.closest('button,a,input,[role=button]')||e.closest('[data-handle-for]')||e.closest('[class*=label],[class*=sec-add],[class*=secbar],[class*=menu]'))continue;
        const sc=e.closest('[data-sec]');if(sc&&sc.dataset.sec===s){
          // 周り 12px にも部品がないこと（部品の縁・つまみを押さないように）
          let ok=true;for(const [ax,ay] of [[-12,0],[12,0],[0,-12],[0,12]]){const f=document.elementFromPoint(x+ax,y+ay);if(f&&f.closest('[data-el]'))ok=false}
          if(ok)return [x,y]}}
      return null}""", sec)
    if not p: raise PrepFail(f'セクション {sec} に何もない所が見つからない')
    return p

async def find_button(pg, cands, root=None):
    """見えているボタンを文字・title・aria-label・data 属性の候補で探す。cands は (種類, 値) の並び。
    種類：id（#id）・text（文字が同じ）・title・aria（aria-label が同じ）・data（[data-…] の CSS）"""
    return await ev(pg, """([cands,root])=>{const R=root?document.querySelector(root):document;if(!R)return null;
      const vis=b=>{const q=b.getBoundingClientRect();const cs=getComputedStyle(b);return q.width>0&&q.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'};
      const all=[...R.querySelectorAll('button,[role=button],[role=menuitem],a')].filter(vis);
      for(const [k,v] of cands){let e=null;
        if(k==='id'){e=document.getElementById(v);if(e&&!vis(e))e=null}
        else if(k==='text')e=all.find(b=>b.textContent.trim().replace(/\\s+/g,'')===v);
        else if(k==='title')e=all.find(b=>(b.getAttribute('title')||'').trim()===v);
        else if(k==='aria')e=all.find(b=>(b.getAttribute('aria-label')||'').trim()===v);
        else if(k==='data')e=[...R.querySelectorAll(v)].find(vis);
        if(e){const q=e.getBoundingClientRect();const cs=getComputedStyle(e);
          return {how:k+':'+v,x:q.x+q.width/2,y:q.y+q.height/2,dis:!!e.disabled||e.getAttribute('aria-disabled')==='true',
                  color:cs.color,op:cs.opacity,cursor:cs.cursor,text:e.textContent.trim()}}}
      return null}""", [cands, root])

# 一覧を開く操作の直前に、すでに見えている浮いた箱に印を付ける（premark）。一覧の探し方は
#  (1) 決まった名前（#fmenu・role=menu・.ctx-menu など）と、
#  (2) 操作の後に新しく見えるようになった浮いた箱（position fixed/absolute、見えるボタンを2つ以上含む、部品・上の並びの外）。
#  直しで別の class の一覧を作っても (2) で拾える。
PREMARK_JS = """(()=>{window.__auditPremarked=true;for(const e of document.querySelectorAll('[data-audit-pre]'))e.removeAttribute('data-audit-pre');
  for(const e of document.querySelectorAll('body *')){const c=getComputedStyle(e);if(c.position!=='fixed'&&c.position!=='absolute')continue;
    const r=e.getBoundingClientRect();if(r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'&&parseFloat(c.opacity)>0.05)e.setAttribute('data-audit-pre','1')}})()"""
async def premark(pg): await ev(pg, PREMARK_JS)

MENU_JS = """(()=>{const vis=b=>{const q=b.getBoundingClientRect();const cs=getComputedStyle(b);return q.width>0&&q.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&parseFloat(cs.opacity)>0.05};
  const roots=[...document.querySelectorAll('#fmenu,[role=menu],.ctx-menu,.context-menu,[class*=ctxmenu],[class*=contextmenu]')].filter(vis);
  if(document.querySelector('[data-audit-pre]')||window.__auditPremarked){
    for(const e of document.querySelectorAll('body *')){if(e.hasAttribute('data-audit-pre')||roots.includes(e))continue;const c=getComputedStyle(e);
      if(c.position!=='fixed'&&c.position!=='absolute')continue;if(!vis(e))continue;
      if(e.closest('#toolbar')||e.closest('[data-el]')||e.querySelector('[data-el]'))continue;
      if(roots.some(r=>r.contains(e)||e.contains(r)))continue;
      const n=[...e.querySelectorAll('button,[role=menuitem]')].filter(vis).length;if(n>=2)roots.push(e)}}
  const out=[];const seen=new Set();
  for(const R of roots)for(const b of R.querySelectorAll('button,[role=menuitem]')){if(seen.has(b)||!vis(b))continue;seen.add(b);
    if(b.querySelector('button,[role=menuitem]'))continue;
    const q=b.getBoundingClientRect();const cs=getComputedStyle(b);
    out.push({t:b.textContent.trim().replace(/\\s+/g,''),x:q.x,y:q.y,w:q.width,h:q.height,cx:q.x+q.width/2,cy:q.y+q.height/2,
      dis:!!b.disabled||b.getAttribute('aria-disabled')==='true',color:cs.color,op:cs.opacity})}
  return out})()"""
async def menu(pg): return await ev(pg, MENU_JS)
def mnames(m): return [x['t'] + ('[x]' if x['dis'] else '') for x in m]

async def drag(pg, a, b, mods=(), steps=15, hold=0):
    for m in mods: await pg.keyboard.down(m)
    await pg.mouse.move(*a); await pg.mouse.down(); await pg.mouse.move(*b, steps=steps)
    if hold: await pg.wait_for_timeout(hold)
    await pg.mouse.up()
    for m in reversed(mods): await pg.keyboard.up(m)
    await pg.wait_for_timeout(500)

async def esc_all(pg):
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250)

async def deselect(pg):
    """何も選んでいない・書き換えていない状態にする（何もない所を押して Esc）"""
    x, y = await blank_point(pg, 'feature')
    await pg.mouse.click(x, y); await pg.wait_for_timeout(300)
    if await editing(pg): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250)

# ================================================================ 項目
# ---- P16
# 作業票: Option を押しながらドラッグ＝複製して動かす。Cmd を押しながらドラッグ＝吸い付かない（今の Option の役目を Cmd に移す）。
# 再現: (a) 選んでいない F_h0 を Option（Alt）を押しながら (+100,+150) ドラッグ。
#       (b) F_h0 を MOD（Mac は Cmd・ほかは Ctrl）を押しながら (+4,+150) ドラッグ（F_b0 の左端 x=160 に 4px 足りない所）。
# 合格: (a) 元の F_h0 が元の位置（±1px）に残り、F_h0 と同じ文の部品が1つ増え、その位置が元＋(100,150)（±12px）。
#       (b) F_h0 の x が 164（±1.5）＝吸い付かずに離した所に止まる。
# 準備の確かめ: (a) ドラッグの後に F_h0 か写しのどちらかが動いていること（ドラッグが始まった）。
#       (b) 同じドラッグを何も押さずにすると x=160 に吸い付くこと（吸い付きがある場面で試している）。
async def t_P16(br, url):
    msg = []; ok = True
    # (a) Option+ドラッグ
    pg = await fresh(br, url)
    try:
        await scrollto(pg, 'F_h0'); r = await vb(pg, 'F_h0'); g0 = await geom(pg, 'F_h0')
        txt = (await ev(pg, "document.querySelector('[data-el=F_h0]').innerText.trim()"))
        before = set(await visible_ids(pg))
        a = (r['x'] + 40, r['y'] + 12)
        await drag(pg, a, (a[0] + 100, a[1] + 150), mods=('Alt',), steps=15)
        g1 = await geom(pg, 'F_h0'); r2 = await vb(pg, 'F_h0')
        same = [i for i in await leaves_with_text(pg, txt) if i not in before]
        moved_orig = g1 is None or abs(g1['x'] - g0['x']) > 1 or abs(g1['y'] - g0['y']) > 1
        if not moved_orig and not same: raise PrepFail(f'Option+ドラッグで何も動かない・増えない（ドラッグが始まらない）')
        stay = not moved_orig
        cp = None
        if same:
            q = await vb(pg, same[0]); cp = (q['x'] - r['x'], q['py'] - r['py'])
        good = stay and len(same) == 1 and cp is not None and abs(cp[0] - 100) <= 12 and abs(cp[1] - 150) <= 12
        ok &= good
        msg.append(f"Option+ドラッグ: 元の F_h0 {'残る' if stay else '動いた'}（{r1(g0['x'])},{r1(g0['y'])}→{r1(g1['x']) if g1 else None},{r1(g1['y']) if g1 else None}） 写し={same} 写しの動き={tuple(r1(v) for v in cp) if cp else None}")
    finally: await pg.context.close()
    # (b) 何も押さずに（吸い付きがあるかの確かめ）→ MOD+ドラッグ
    res = {}
    for label, mods in [('なし', ()), ('MOD', (MOD,))]:
        pg = await fresh(br, url)
        try:
            await scrollto(pg, 'F_h0'); r = await vb(pg, 'F_h0'); g0 = await geom(pg, 'F_h0')
            a = (r['x'] + 40, r['y'] + 12)
            await drag(pg, a, (a[0] + 4, a[1] + 150), mods=mods, steps=15)
            g1 = await geom(pg, 'F_h0')
            if label == 'MOD' and not await key_reached(pg, MOD): raise PrepFail(f'{MOD} がページに届かない')
            res[label] = (g0, g1, len(await visible_ids(pg)))
        finally: await pg.context.close()
    g0, g1, _ = res['なし']
    if abs(g1['y'] - g0['y']) < 100: raise PrepFail(f'何も押さないドラッグで F_h0 が動かない y {g0["y"]}→{g1["y"]}')
    if abs(g1['x'] - 160) > 1: raise PrepFail(f'何も押さないドラッグで x=160 に吸い付かない（x={r1(g1["x"])}）＝吸い付きのない場面になっている')
    m0, m1, _ = res['MOD']
    moved = m1 and abs(m1['y'] - m0['y']) >= 100
    nosnap = moved and abs(m1['x'] - (m0['x'] + 4)) <= 1.5
    ok &= bool(nosnap)
    msg.append(f"何も押さず x {r1(g0['x'])}→{r1(g1['x'])}（吸い付く） / {MOD}+ドラッグ x {r1(m0['x'])}→{r1(m1['x']) if m1 else None} y {r1(m0['y'])}→{r1(m1['y']) if m1 else None}（期待 x={r1(m0['x'] + 4)}）")
    return ok, ' / '.join(msg)

# ---- P17
# 作業票: 書き換えていないときの Cmd+A＝今のページの部品を全部選ぶ。
# 再現: 何もない所を押して Esc（何も選ばず・書き換えていない）→ MOD+a。
# 合格: 選択に特集・品のセクションの部品（F_h0 F_b0 F_p0 F_p1 F_h1 F_b1 I_kanmi）がすべて入り、10 個以上選ばれていること。
# 準備の確かめ: MOD+a の前に書き換え中でない・入力欄にいないこと。MOD+a がページに届いたこと。
async def t_P17(br, url):
    pg = await fresh(br, url)
    try:
        await deselect(pg)
        if await editing(pg): raise PrepFail('書き換え中のまま')
        ae = await ev(pg, "(()=>{const a=document.activeElement;return a?(a.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(a.tagName)):false})()")
        if ae: raise PrepFail('入力欄にいる')
        await clear_keys(pg)
        await pg.keyboard.press(f'{MOD}+a'); await pg.wait_for_timeout(400)
        if not await key_reached(pg, 'a', mod=True): raise PrepFail(f'{MOD}+a がページに届かない')
        s = await sel(pg)
        need = ['F_h0', 'F_b0', 'F_p0', 'F_p1', 'F_h1', 'F_b1', 'I_kanmi']
        miss = [i for i in need if i not in s]
        bsel = await ev(pg, "String(getSelection()).length")
        return not miss and len(s) >= 10, f'{MOD}+a で選ばれた部品 {len(s)} 個 足りない={miss} 先頭={s[:6]} ブラウザの文字選択={bsel}字'
    finally: await pg.context.close()

# ---- P18
# 作業票: Tab／Shift+Tab＝部品を順に選ぶ（ページの上から下、同じ高さは左から）。最背面の部品にも届く（P24）。
# 準備（API）: F_h0 を写真 F_p0 の上へ動かし（nudge）、最背面へ送る（sendToBack）。F_h0 は写真に隠れてクリックでは選べない。
# 再現: F_b0 を書き換えずに選ぶ → Tab を最大 70 回押して選ばれる部品を集める。途中で Shift+Tab を1回押して1つ前に戻るかも見る。
# 合格: (1) Tab のたびに部品が1つだけ選ばれ、書き換えに入らず、上の並びのボタンへ移らない
#       (2) 隠れた F_h0 にも届く (3) F_b0 F_p1 F_h1 F_b1 F_p0 にも届く
#       (4) 順がページの上から下（同じ高さは左から。2px まで許す）で、上へ戻るのは一周したときの1回だけ
#       (5) Shift+Tab で1つ前の部品に戻る
# 準備の確かめ: F_h0 の真ん中を指す点の一番上の部品が F_p0（隠れている）こと。Tab がページに届いたこと。
async def t_P18(br, url):
    pg = await fresh(br, url)
    try:
        await ev(pg, f"(()=>{{{P}.selectOnly('F_h0');{P}.nudge('F_h0',620,-50);{P}.selectOnly('F_h0');{P}.sendToBack();{P}.clearSel()}})()")
        await pg.wait_for_timeout(400)
        await scrollto(pg, 'F_h0'); h = await vb(pg, 'F_h0')
        top = await ev(pg, "([x,y])=>{const e=document.elementFromPoint(x,y);const d=e&&e.closest('[data-el]');return d?d.dataset.el:null}", [h['cx'], h['cy']])
        if top != 'F_p0': raise PrepFail(f'F_h0 が写真に隠れない（真ん中の一番上={top}）')
        await select_part(pg, 'F_b0')
        await clear_keys(pg)
        seq = []; bad = []; back_ok = None
        start = 'F_b0'
        for i in range(70):
            await pg.keyboard.press('Tab'); await pg.wait_for_timeout(180)
            s = await sel(pg); ed = await editing(pg)
            foc = await ev(pg, "(()=>{const a=document.activeElement;return a&&a.closest&&a.closest('#toolbar')?(a.textContent||'').trim().slice(0,10):null})()")
            if len(s) != 1 or ed or foc:
                bad.append(f'{i + 1}回目 選択={s[:3]} 書き換え={ed} 並びへ={foc}'); break
            seq.append(s[0])
            if i == 2:
                await pg.keyboard.press('Shift+Tab'); await pg.wait_for_timeout(180)
                sb = await sel(pg); back_ok = (sb == [seq[-2]]);
                await pg.keyboard.press('Tab'); await pg.wait_for_timeout(180)
                if await sel(pg) != [seq[-1]]: back_ok = False
            if i == 0 and s[0] == start: bad.append('1回目の Tab で選択が変わらない'); seq.pop(); break
            if s[0] == start: break
        if not await key_reached(pg, 'Tab'): raise PrepFail('Tab がページに届かない')
        # 順の確かめ（ページ上の位置）
        pos = {}
        for i in set(seq):
            q = await vb(pg, i)
            if q: pos[i] = (q['py'], q['x'])
        drops = 0; disorder = []
        for a, b in zip(seq, seq[1:]):
            if a not in pos or b not in pos: continue
            (ya, xa), (yb, xb) = pos[a], pos[b]
            if yb < ya - 2: drops += 1; disorder.append(f'{a}→{b}')
            elif abs(yb - ya) <= 2 and xb < xa - 2: disorder.append(f'{a}→{b}(左へ)'); drops += 1
        need = ['F_h0', 'F_b0', 'F_p1', 'F_h1', 'F_b1', 'F_p0']
        miss = [i for i in need if i not in seq + [start]]
        ok = not bad and not miss and drops <= 1 and back_ok is True and len(seq) >= 5
        return ok, f'Tab {len(seq)} 回 届かない={miss} 上へ戻る={drops}回 {disorder[:3]} Shift+Tab で戻る={back_ok} 止まった={bad[:1]} 並び={seq[:12]}'
    finally: await pg.context.close()

# ---- P19
# 作業票: ドラッグ・つまみで窓の上下の端に近づいたら自動でスクロール。
# 再現: (a) F_b0 を画面の真ん中から窓の下の端（下から 4px）へドラッグして 1.5 秒止める。
#       (b) F_h1 が画面の y=750 に来るまで下へスクロールしてから F_h1 を窓の上の端（上から 3px）へドラッグして 1.5 秒止める。
#       (c) F_b0 を選び、下の辺のつまみを窓の下の端へ引いて 1.5 秒止める（前は F_p1 の右下。下の (c) のコメント）。
# 合格: 止めている間に (a)(c) は下へ、(b) は上へ 40px 以上スクロールし、部品（(c) は箱の下の辺）がスクロールに付いてくること
#       （止めている間のページ上の動きがスクロールの 7 割以上）。
#       ※試験台28 ではブラウザ自身の「文字を選びながらの自動スクロール」で画面だけが流れ、部品は置き去りになる。
#         これはブラウザの既定の動きなので合格にしない（部品が付いてくることを条件に入れたのはそのため）。
# 準備の確かめ: 止めている間に部品が付いてきている（ドラッグ・つまみが始まっている）こと。スクロールの余地があること。
async def _edge(pg, id, target_y, hold=1500):
    r = await vb(pg, id); a = (r['x'] + 40, r['y'] + min(12, r['h'] / 2))
    y0 = await ev(pg, 'scrollY')
    await pg.mouse.move(*a); await pg.mouse.down(); await pg.mouse.move(a[0] + 10, target_y, steps=20)
    mid = await vb(pg, id); ym = await ev(pg, 'scrollY')
    await pg.wait_for_timeout(hold)
    y1 = await ev(pg, 'scrollY'); after = await vb(pg, id)
    await pg.mouse.up(); await pg.wait_for_timeout(400)
    followed = mid and abs(mid['y'] - r['y']) > 50 or (after and abs(after['py'] - r['py']) > 50)
    carried = (after['py'] - mid['py']) if (after and mid) else 0   # 止めている間に部品がページ上で動いた量
    return y0, ym, y1, followed, carried

async def t_P19(br, url):
    msg = []; ok = True
    pg = await fresh(br, url)
    try:
        await scrollto(pg, 'F_b0')
        room = await ev(pg, 'document.documentElement.scrollHeight-innerHeight-scrollY')
        if room < 200: raise PrepFail(f'下へスクロールの余地がない {room}')
        y0, ym, y1, f, c = await _edge(pg, 'F_b0', VH - 4)
        if not f: raise PrepFail('F_b0 のドラッグが始まらない')
        good = y1 - ym >= 40 and c >= 0.7 * (y1 - ym); ok &= good
        msg.append(f'下の端で止める scrollY {y0}→{ym}→{y1} 部品が付いてきた {r1(c)}px')
    finally: await pg.context.close()
    pg = await fresh(br, url)
    try:
        await ev(pg, "(()=>{const r=document.querySelector('[data-el=F_h1]').getBoundingClientRect();scrollBy(0,r.y-750)})()"); await pg.wait_for_timeout(300)
        r = await vb(pg, 'F_h1')
        if not r or r['y'] < 300: raise PrepFail(f'F_h1 が画面の下寄りに出ない {r}')
        y0, ym, y1, f, c = await _edge(pg, 'F_h1', 3)
        if not f: raise PrepFail('F_h1 のドラッグが始まらない')
        good = ym - y1 >= 40 and -c >= 0.7 * (ym - y1); ok &= good
        msg.append(f'上の端で止める scrollY {y0}→{ym}→{y1} 部品が付いてきた {r1(-c)}px')
    finally: await pg.context.close()
    # (c) P19 の確かめたいこと（端で自動スクロールし、つまみが付いてくる）に合わせて、写真から文字の箱の下の辺のつまみに変えた（判定は同じ）：
    #     写真は縦横比を保つので、中身の幅で大きさが頭打ちになり、窓の端まで引いても下の辺が付いてこない（自動スクロールと関係なく止まる）。
    #     文字の箱（F_b0）の下の辺（s）のつまみは高さだけを伸ばすので、頭打ちにならずにスクロールに付いてこられる
    pg = await fresh(br, url)
    try:
        await ev(pg, "(()=>{const e=document.querySelector('[data-el=F_b0]');e.scrollIntoView({block:'center'})})()"); await pg.wait_for_timeout(300)
        room = await ev(pg, 'document.documentElement.scrollHeight-innerHeight-scrollY')
        if room < 200: raise PrepFail(f'下へスクロールの余地がない {room}')
        r = await select_part(pg, 'F_b0')   # P2：クリックで書き換えに入ったら Esc で箱を選んだだけにする
        r = await vb(pg, 'F_b0')
        hd = await ev(pg, """(()=>{const hs=[...document.querySelectorAll('[data-handle="s"]')].filter(e=>{const q=e.getBoundingClientRect();return q.width>0});
          const p=document.querySelector('[data-el=F_b0]').getBoundingClientRect();let best=null,bd=1e9;
          for(const h of hs){const q=h.getBoundingClientRect();const d=Math.hypot(q.x+q.width/2-(p.left+p.width/2),q.y+q.height/2-p.bottom);if(d<bd){bd=d;best=[q.x+q.width/2,q.y+q.height/2]}}
          return bd<16?best:null})()""")
        if not hd: raise PrepFail('F_b0 の下の辺のつまみが見つからない')
        y0 = await ev(pg, 'scrollY'); h0 = r['h']
        await pg.mouse.move(*hd); await pg.mouse.down(); await pg.mouse.move(hd[0], VH - 4, steps=20)
        mid = await vb(pg, 'F_b0'); ym = await ev(pg, 'scrollY')
        await pg.wait_for_timeout(1500); y1 = await ev(pg, 'scrollY'); aft = await vb(pg, 'F_b0')
        await pg.mouse.up(); await pg.wait_for_timeout(400)
        c = (aft['py'] + aft['h']) - (mid['py'] + mid['h']) if (aft and mid) else 0
        if not mid or abs(mid['h'] - h0) < 10: raise PrepFail(f'つまみを引いても大きさが変わらない（つまみの操作が始まらない） h {r1(h0)}→{r1(mid["h"]) if mid else None}')
        good = y1 - ym >= 40 and c >= 0.7 * (y1 - ym); ok &= good
        msg.append(f'つまみ（文字の箱の下の辺）を下の端で止める scrollY {y0}→{ym}→{y1} 下の辺が付いてきた {r1(c)}px')
    finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P20
# 作業票: 複数を選んだら、まとめた枠につまみを出し、まとめて大きさを変える（写真は縦横比を保つ）。
# 再現: 500px スクロール。F_p0 をクリック → F_p1 を Shift+クリック（2枚の写真を選ぶ）。
#       2枚をまとめた枠の右下の角にあるつまみを (-120,-120) 引く。
# 合格: (1) まとめた枠の右下（±16px）につまみがある (2) 引いた後、2枚とも幅が 5% 以上縮み、
#       それぞれ縦横比が 2% 以内で保たれ、縮み方（倍率）が2枚で 3% 以内でそろう (3) まとめた枠の左上が 4px 以内で止まる。
# 準備の確かめ: 2枚が選ばれていること。
async def t_P20(br, url):
    pg = await fresh(br, url)
    try:
        await ev(pg, 'scrollTo(0,500)'); await pg.wait_for_timeout(300)
        a = await vb(pg, 'F_p0'); await pg.mouse.click(a['x'] + 150, max(a['y'], 60) + 100); await pg.wait_for_timeout(350)
        b = await vb(pg, 'F_p1')
        await pg.keyboard.down('Shift'); await pg.mouse.click(b['x'] + 150, b['y'] + 100); await pg.keyboard.up('Shift'); await pg.wait_for_timeout(400)
        s = await sel(pg)
        if sorted(s) != ['F_p0', 'F_p1']: raise PrepFail(f'2枚を選べない 選択={s}')
        a = await vb(pg, 'F_p0'); b = await vb(pg, 'F_p1')
        U = (min(a['x'], b['x']), min(a['y'], b['y']), max(a['x'] + a['w'], b['x'] + b['w']), max(a['y'] + a['h'], b['y'] + b['h']))
        hs = await ev(pg, """(()=>[...document.querySelectorAll('[data-handle-for],.rz-handle,[data-handle],[class*=handle]')].filter(e=>{const q=e.getBoundingClientRect();const c=getComputedStyle(e);return q.width>0&&q.height>0&&q.width<40&&c.visibility!=='hidden'}).map(e=>{const q=e.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]}))()""")
        se = [h for h in hs if abs(h[0] - U[2]) <= 16 and abs(h[1] - U[3]) <= 16]
        if not se:
            return False, f'2枚を選んでも、まとめた枠の右下 ({r1(U[2])},{r1(U[3])}) につまみがない（見えているつまみ {len(hs)} 個）'
        h = se[0]
        await pg.mouse.move(*h); await pg.mouse.down(); await pg.mouse.move(h[0] - 120, h[1] - 120, steps=15); await pg.mouse.up(); await pg.wait_for_timeout(500)
        a2 = await vb(pg, 'F_p0'); b2 = await vb(pg, 'F_p1')
        fa, fb = a2['w'] / a['w'], b2['w'] / b['w']
        ra = abs((a2['w'] / a2['h']) / (a['w'] / a['h']) - 1); rb = abs((b2['w'] / b2['h']) / (b['w'] / b['h']) - 1)
        U2 = (min(a2['x'], b2['x']), min(a2['y'], b2['y']))
        ok = fa <= 0.95 and fb <= 0.95 and ra <= 0.02 and rb <= 0.02 and abs(fa - fb) <= 0.03 and abs(U2[0] - U[0]) <= 4 and abs(U2[1] - U[1]) <= 4
        return ok, f'倍率 F_p0 {fa:.3f} F_p1 {fb:.3f} 縦横比のずれ {ra:.3f}/{rb:.3f} 左上 ({r1(U[0])},{r1(U[1])})→({r1(U2[0])},{r1(U2[1])})'
    finally: await pg.context.close()

# ---- P21
# 作業票: 切り取った直後の貼り付け（同じページ・同じ端末）は元の位置に戻す。2回目からは記録 11.3 のとおり。
# 再現: F_b0 を書き換えずに選ぶ → MOD+x → MOD+v。
# 合格: 貼り付けた F_b0 と同じ文の部品が1つ出て、そのページ上の位置が切り取る前の F_b0 と 3px 以内で同じこと。
#       （2回目の貼り付けの置き方は記録 11.3 の領分なので、ここでは判定しない）
# 準備の確かめ: MOD+x の後に F_b0（とその文）が消えていること。
async def t_P21(br, url):
    pg = await fresh(br, url)
    try:
        txt = (await ev(pg, "document.querySelector('[data-el=F_b0]').innerText.trim()"))
        r = await select_part(pg, 'F_b0'); r = await vb(pg, 'F_b0')
        await pg.keyboard.press(f'{MOD}+x'); await pg.wait_for_timeout(500)
        if await vb(pg, 'F_b0') or await leaves_with_text(pg, txt): raise PrepFail(f'{MOD}+x で F_b0 が消えない')
        await pg.keyboard.press(f'{MOD}+v'); await pg.wait_for_timeout(700)
        got = await leaves_with_text(pg, txt)
        if not got: return False, f'{MOD}+v で何も出ない'
        q = await vb(pg, got[0])
        d = (q['x'] - r['x'], q['py'] - r['py'])
        ok = len(got) == 1 and abs(d[0]) <= 3 and abs(d[1]) <= 3
        return ok, f'貼り付けた {got} 切り取る前との差 ({r1(d[0])},{r1(d[1])})'
    finally: await pg.context.close()

# ---- P22
# 作業票: 戻す・やり直すの後、戻った部品を選んだ状態にする。
# 再現: (a) F_b0 を選んで Delete → MOD+z。(b) F_h0 を選んで Shift+↓ → 何もない所を押して選択を外す → MOD+z → MOD+Shift+z。
# 合格: (a) MOD+z の後、F_b0 が戻って選ばれている（選択＝[F_b0]）。
#       (b) MOD+z の後も MOD+Shift+z の後も F_h0 が選ばれている（選択＝[F_h0]）。
# 準備の確かめ: Delete で消えた・MOD+z で戻った・Shift+↓ で動いた・選択が外れた・やり直しで動き直したこと。
async def t_P22(br, url):
    msg = []; ok = True
    pg = await fresh(br, url)
    try:
        await select_part(pg, 'F_b0')
        await pg.keyboard.press('Delete'); await pg.wait_for_timeout(400)
        if await vb(pg, 'F_b0'): raise PrepFail('Delete で F_b0 が消えない')
        await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(500)
        if not await vb(pg, 'F_b0'): raise PrepFail(f'{MOD}+z で F_b0 が戻らない')
        s = await sel(pg); good = s == ['F_b0']; ok &= good
        msg.append(f'消して戻す → 選択={s}')
    finally: await pg.context.close()
    pg = await fresh(br, url)
    try:
        await select_part(pg, 'F_h0'); g0 = await geom(pg, 'F_h0')
        await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(400); g1 = await geom(pg, 'F_h0')
        if abs(g1['y'] - g0['y']) < 5: raise PrepFail('Shift+↓ で F_h0 が動かない')
        await deselect(pg)
        if await sel(pg): raise PrepFail(f'選択が外れない {await sel(pg)}')
        await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(500); g2 = await geom(pg, 'F_h0'); s1 = await sel(pg)
        if abs(g2['y'] - g0['y']) > 1: raise PrepFail(f'{MOD}+z で F_h0 が戻らない y {g0["y"]}→{g1["y"]}→{g2["y"]}')
        await pg.keyboard.press(f'{MOD}+Shift+z'); await pg.wait_for_timeout(500); g3 = await geom(pg, 'F_h0'); s2 = await sel(pg)
        if abs(g3['y'] - g1['y']) > 1: raise PrepFail(f'{MOD}+Shift+z で F_h0 が動き直さない y {g3["y"]}')
        good = s1 == ['F_h0'] and s2 == ['F_h0']; ok &= good
        msg.append(f'動かして外して 戻す → 選択={s1} / やり直す → 選択={s2}')
    finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- P23
# 作業票: 品の中の部品を選んでいるとき、別の品の同じ部品を1回で選べる。
# 再現: 品「上生菓子（jonama）」の品名 card_name_c_jonama を選ぶ（1回目で並び、2回目で品名）→ 品「わらび（warabi）」の品名を1回クリック。
# 合格: その1回のクリックで card_name_c_warabi が選ばれる（選択＝[card_name_c_warabi]。書き換えに入った場合はその部品であること）。
# 準備の確かめ: 1回目に card_name_c_jonama だけが書き換えずに選ばれていること。
async def t_P23(br, url):
    pg = await fresh(br, url)
    try:
        await select_part(pg, 'card_name_c_jonama')
        r = await vb(pg, 'card_name_c_warabi'); await pg.mouse.click(r['x'] + 40, r['y'] + min(10, r['h'] / 2)); await pg.wait_for_timeout(400)
        s = await sel(pg); ed = await editing(pg)
        ok = s == ['card_name_c_warabi'] or (ed == 'card_name_c_warabi' and s in ([], ['card_name_c_warabi']))
        return ok, f'jonama の品名を選んで warabi の品名を1回クリック → 選択={s} 書き換え={ed}'
    finally: await pg.context.close()

# ---- P24
# 作業票: 前面・背面を上の「配置 ▾」にも入れる（最前面へ・前面へ・背面へ・最背面へ）。
# 準備（API）: F_h0 を写真 F_p0 の上へ動かして重ねる（nudge）。
# 再現: F_h0 を書き換えずに選ぶ → 上の「配置 ▾」をクリック → 一覧を読む → 「最背面へ」を押す → もう一度「配置 ▾」→「前面へ」を押す。
# 合格: 一覧に 最前面へ・前面へ・背面へ・最背面へ の4つが押せる形であり、「最背面へ」で F_h0 が写真に隠れ
#       （F_h0 の真ん中の一番上が F_p0）、「前面へ」でまた見える（一番上が F_h0）こと。
# 準備の確かめ: 重ねた後に F_h0 が写真の上に見えている（真ん中の一番上が F_h0）こと。「配置 ▾」が開くこと。
async def t_P24(br, url):
    pg = await fresh(br, url)
    try:
        await ev(pg, f"(()=>{{{P}.selectOnly('F_h0');{P}.nudge('F_h0',620,-50);{P}.clearSel()}})()"); await pg.wait_for_timeout(400)
        await scrollto(pg, 'F_h0'); h = await vb(pg, 'F_h0')
        TOP = "([x,y])=>{const e=document.elementFromPoint(x,y);const d=e&&e.closest('[data-el]');return d?d.dataset.el:null}"
        if await ev(pg, TOP, [h['cx'], h['cy']]) != 'F_h0': raise PrepFail('重ねた F_h0 が写真の上に見えない')
        await select_part(pg, 'F_h0')
        async def open_arrange():
            b = await find_button(pg, [('id', 'tAlign'), ('data', '[data-align-tool]'), ('text', '配置▾'), ('text', '配置'), ('title', '配置'), ('aria', '配置')])
            if not b: raise PrepFail('上の並びに「配置 ▾」がない')
            await premark(pg)
            await pg.mouse.click(b['x'], b['y']); await pg.wait_for_timeout(400)
            return await menu(pg)
        m = await open_arrange()
        if not m: raise PrepFail('「配置 ▾」を押しても一覧が出ない')
        def pick(m, kind):
            for x in m:
                t = x['t']
                if kind == '最前面' and '最前面' in t: return x
                if kind == '前面' and '前面' in t and '最前面' not in t: return x
                if kind == '背面' and '背面' in t and '最背面' not in t: return x
                if kind == '最背面' and '最背面' in t: return x
            return None
        found = {k: pick(m, k) for k in ['最前面', '前面', '背面', '最背面']}
        miss = [k for k, v in found.items() if not v]; dis = [k for k, v in found.items() if v and v['dis']]
        if miss or dis:
            return False, f'「配置 ▾」の一覧に 足りない={miss} 押せない={dis} 一覧={mnames(m)}'
        await pg.mouse.click(found['最背面']['cx'], found['最背面']['cy']); await pg.wait_for_timeout(500)
        h = await vb(pg, 'F_h0'); t1 = await ev(pg, TOP, [h['cx'], h['cy']])
        await esc_all(pg)
        await select_part_or_keep(pg, 'F_h0')
        m = await open_arrange(); f = pick(m, '前面')
        if f and not f['dis']: await pg.mouse.click(f['cx'], f['cy']); await pg.wait_for_timeout(500)
        h = await vb(pg, 'F_h0'); t2 = await ev(pg, TOP, [h['cx'], h['cy']])
        ok = t1 == 'F_p0' and t2 == 'F_h0'
        return ok, f'一覧={mnames(m)} 最背面へ の後の一番上={t1} 前面へ の後の一番上={t2}'
    finally: await pg.context.close()

async def select_part_or_keep(pg, id):
    """最背面へ送った F_h0 は写真に隠れてクリックで選べないので、選んだままならそのまま、外れていたら API で選ぶ（準備）"""
    if await sel(pg) != [id]:
        await ev(pg, f"{P}.selectOnly('{id}')"); await pg.wait_for_timeout(250)

# ---- P25
# 作業票: セクションの余白を押したら、セクションを選んだ印（枠）を出す。Delete で消せる（知らせと戻す）。
# 再現: 特集セクションの、部品のない所をクリック → Delete → MOD+z。
# 合格: (1) クリックの後、セクションに選んだ印が出る（セクションの要素の outline・box-shadow・border が変わる、
#           またはセクションと同じ大きさ〔各辺 ±12px〕の枠の要素が新しく出る）
#       (2) Delete でセクションが1つ減る (3) 知らせが新しく出る（操作の直前に見えていた要素・文は数えず、
#           文に「消」「削除」「セクション」「戻」のどれかを含むもの） (4) MOD+z でセクションが元に戻る。
# 準備の確かめ: 押した所が特集セクションの中で、部品の上でないこと。部品が選ばれていないこと。
SEC_MARK = """s=>{const W=document.querySelector('.sec-wrap[data-sec="'+s+'"]')||document.querySelector('[data-sec="'+s+'"]');
  const inner=W.querySelector('[data-sec="'+s+'"]')||W;const R=W.getBoundingClientRect();
  const st=[W,inner].map(e=>{const c=getComputedStyle(e);return [c.outlineStyle+c.outlineWidth+c.outlineColor,c.boxShadow,c.borderTopStyle+c.borderTopWidth+c.borderTopColor,e.className].join('|')}).join('#');
  const near=(a,b)=>Math.abs(a-b)<=12;const box=[];
  for(const e of document.querySelectorAll('body *')){if(e===W||e===inner||e.closest('[data-el]'))continue;const c=getComputedStyle(e);if(c.display=='none'||c.visibility=='hidden'||parseFloat(c.opacity)<0.05)continue;
    const r=e.getBoundingClientRect();if(r.width<200)continue;
    const vis=(c.borderTopStyle!='none'&&parseFloat(c.borderTopWidth)>0)||(c.outlineStyle!='none'&&parseFloat(c.outlineWidth)>0)||c.boxShadow!='none';
    const top=Math.max(R.top,0),bot=Math.min(R.bottom,innerHeight);
    if(vis&&near(r.left,R.left)&&near(r.right,R.right)&&(near(r.top,R.top)||r.top<=top+12)&&(near(r.bottom,R.bottom)||r.bottom>=bot-12))box.push((e.id||e.className||e.tagName).toString().slice(0,30))}
  return {st,box}}"""
async def t_P25(br, url):
    pg = await fresh(br, url)
    try:
        x, y = await blank_point(pg, 'feature')
        m0 = await ev(pg, SEC_MARK, 'feature'); n0 = await sections(pg)
        await pg.mouse.click(x, y); await pg.wait_for_timeout(400)
        if await sel(pg): raise PrepFail(f'余白を押したのに部品が選ばれた {await sel(pg)}')
        m1 = await ev(pg, SEC_MARK, 'feature')
        mark = m1['st'] != m0['st'] or bool(set(m1['box']) - set(m0['box']))
        pre = set(await visible_notice_texts(pg))   # 操作の直前に見えていた知らせ・状態の文は数えない
        await clear_notices(pg); await clear_keys(pg)
        await pg.keyboard.press('Delete'); await pg.wait_for_timeout(600)
        if not await key_reached(pg, 'Delete'): raise PrepFail('Delete がページに届かない')
        n1 = await sections(pg)
        nt = [t for t in await notices(pg) if t not in pre and any(w in t for w in ('消', '削除', 'セクション', '戻'))]
        await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(600); n2 = await sections(pg)
        deleted = len(n1) == len(n0) - 1 and 'feature' not in n1
        ok = mark and deleted and bool(nt) and n2 == n0
        return ok, f'選んだ印={"あり" if mark else "なし"} Delete でセクション {n0}→{n1} 知らせ={nt[:2]} 戻す→{n2}'
    finally: await pg.context.close()

# ---- P26
# 作業票: 右クリックは縦の一覧（切り取り・コピー・貼り付け・複製・消す、区切って前面・背面、その部品の操作）。押せないものは灰色。
# 再現: 何もコピーしていない状態で F_h0 を右クリック → 一覧を読む → 「コピー」を押す → もう一度右クリック → 「貼り付け」を押す。
# 合格: (1) 一覧に 切り取り・コピー・貼り付け・複製・消す（削除）があり (2) 縦に並ぶ（左端がそろい上から下へ）
#       (3) 前面・背面の項目が 消す より後 (4) 何もコピーしていないときの「貼り付け」は disabled（または aria-disabled）で、
#       押せる項目と色か薄さが違う（灰色）。ほかの4つは押せる (5) コピーの後は「貼り付け」が押せて、押すと F_h0 と同じ文の部品が増える。
# 準備の確かめ: 右クリックで一覧が出ること。
async def t_P26(br, url):
    pg = await fresh(br, url)
    try:
        txt = (await ev(pg, "document.querySelector('[data-el=F_h0]').innerText.trim()"))
        await scrollto(pg, 'F_h0'); r = await vb(pg, 'F_h0')
        await premark(pg); await pg.mouse.click(r['x'] + 40, r['y'] + 12, button='right'); await pg.wait_for_timeout(400)
        m = await menu(pg)
        if not m: raise PrepFail('右クリックで一覧が出ない')
        def find(m, words, excl=()):
            for i, x in enumerate(m):
                if any(w in x['t'] for w in words) and not any(e in x['t'] for e in excl): return i, x
            return None, None
        want = {'切り取り': (['切り取'],), 'コピー': (['コピー'],), '貼り付け': (['貼り付'],), '複製': (['複製'],), '消す': (['消す', '削除'],)}
        got = {k: find(m, v[0]) for k, v in want.items()}
        miss = [k for k, (i, x) in got.items() if x is None]
        if miss: return False, f'右クリックの一覧に 足りない={miss} 一覧={mnames(m)}'
        xs = [x['x'] for x in m]; ys = [x['y'] for x in m]
        vertical = max(xs) - min(xs) <= 6 and all(b > a for a, b in zip(ys, ys[1:]))
        zi, _ = find(m, ['前面', '背面'])
        zafter = zi is not None and zi > got['消す'][0]
        pz = got['貼り付け'][1]; enabled = [x for k, (i, x) in got.items() if k != '貼り付け']
        grey = pz['dis'] and all((pz['color'] != e['color'] or pz['op'] != e['op']) for e in enabled)
        others = [k for k, (i, x) in got.items() if k != '貼り付け' and x['dis']]
        # コピー → 貼り付け
        c = got['コピー'][1]; await pg.mouse.click(c['cx'], c['cy']); await pg.wait_for_timeout(400)
        await esc_all(pg)
        await scrollto(pg, 'F_h0'); r = await vb(pg, 'F_h0')
        await premark(pg); await pg.mouse.click(r['x'] + 40, r['y'] + 12, button='right'); await pg.wait_for_timeout(400)
        m2 = await menu(pg); _, p2 = find(m2, ['貼り付'])
        n0 = len(await leaves_with_text(pg, txt)); pasted = None
        if p2 and not p2['dis']:
            await pg.mouse.click(p2['cx'], p2['cy']); await pg.wait_for_timeout(600)
            pasted = len(await leaves_with_text(pg, txt)) - n0
        ok = vertical and zafter and grey and not others and bool(p2) and not p2['dis'] and pasted == 1
        return ok, (f'一覧={mnames(m)} 縦={vertical} 前面・背面が消すの後={zafter} 貼り付けが灰色={grey}'
                    f'（{pz["color"]} 薄さ{pz["op"]}） 押せない他={others} コピー後の貼り付け={"押せる" if p2 and not p2["dis"] else "押せない"} 増えた={pasted}')
    finally: await pg.context.close()

# ---- P27
# 作業票: 箱を選んで（書き換えずに）Cmd+B・I・U＝箱まるごと。
# 再現: F_b0 を書き換えずに選ぶ → MOD+b → MOD+i → MOD+u。
# 合格: それぞれの後、F_b0 の文字すべて（どの文字の切れ目も）が 太字（font-weight 600 以上）／斜体／下線 になっていること。
#       書き換えていないので、ブラウザの既定の編集（contenteditable の太字など）では起きない＝ページが箱まるごとに付けたもの。
# 準備の確かめ: キーの前に F_b0 だけが選ばれ、書き換え中でないこと。もとの F_b0 が太字・斜体・下線でないこと。各キーがページに届いたこと。
STY = """s=>{const e=document.querySelector('[data-el="'+s+'"]');const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);const out={b:true,i:true,u:true,n:0};let t;
  while(t=w.nextNode()){if(!t.textContent.trim())continue;out.n++;const p=t.parentElement;const c=getComputedStyle(p);
    if(!(parseInt(c.fontWeight)>=600))out.b=false; if(c.fontStyle!=='italic'&&c.fontStyle!=='oblique')out.i=false;
    let u=false;for(let a=p;a;a=a.parentElement){if(getComputedStyle(a).textDecorationLine.includes('underline')){u=true;break}if(a===e)break}
    if(!u)out.u=false}
  return out}"""
async def t_P27(br, url):
    pg = await fresh(br, url)
    try:
        await select_part(pg, 'F_b0')
        s0 = await ev(pg, STY, 'F_b0')
        if s0['n'] == 0 or s0['b'] or s0['i'] or s0['u']: raise PrepFail(f'もとの F_b0 がすでに太字・斜体・下線 {s0}')
        res = []
        for k, name in [('b', '太字'), ('i', '斜体'), ('u', '下線')]:
            if await editing(pg) or await sel(pg) != ['F_b0']: raise PrepFail(f'{name}の前に F_b0 を書き換えずに選んでいない（選択 {await sel(pg)} 書き換え {await editing(pg)}）')
            await clear_keys(pg)
            await pg.keyboard.press(f'{MOD}+{k}'); await pg.wait_for_timeout(400)
            if not await key_reached(pg, k, mod=True): raise PrepFail(f'{MOD}+{k} がページに届かない')
            st = await ev(pg, STY, 'F_b0'); res.append((name, st[k]))
            if await editing(pg): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250)
            if await sel(pg) != ['F_b0']: await select_part(pg, 'F_b0')
        ok = all(v for _, v in res)
        return ok, ' / '.join(f'{MOD}+ {n}={"箱まるごと" if v else "付かない"}' for n, v in res)
    finally: await pg.context.close()

# ---- P28
# 作業票: 戻す・やり直すのボタンは、戻せないときは灰色で押せない。
# 再現: 開いた直後に上の「戻す」「やり直す」を読む → F_h0 を選んで Shift+↓ → 読む → 「戻す」をマウスで押す → 読む。
# 合格: 戻せないとき「戻す」が、やり直せないとき「やり直す」が disabled（または aria-disabled="true"）。
#       戻せる・やり直せるときはそれぞれ押せる（ずっと押せないのではない）。
# 準備の確かめ: 開いた直後に canUndo・canRedo が false、Shift+↓ の後に canUndo が true、戻すを押した後に canRedo が true。
async def t_P28(br, url):
    pg = await fresh(br, url)
    try:
        UNDO = [('id', 'tUndo'), ('data', '[data-action=undo],[data-cmd=undo]'), ('text', '戻す'), ('text', '元に戻す'), ('title', '戻す'), ('title', '元に戻す'), ('aria', '戻す'), ('aria', '元に戻す'), ('text', '↶')]
        REDO = [('id', 'tRedo'), ('data', '[data-action=redo],[data-cmd=redo]'), ('text', 'やり直す'), ('title', 'やり直す'), ('aria', 'やり直す'), ('text', '↷')]
        async def read():
            await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(150)
            u = await find_button(pg, UNDO, '#toolbar') or await find_button(pg, UNDO)
            r = await find_button(pg, REDO, '#toolbar') or await find_button(pg, REDO)
            return u, r
        cu, cr = await ev(pg, f"[{P}.canUndo(),{P}.canRedo()]")
        if cu or cr: raise PrepFail(f'開いた直後に戻せる状態 canUndo={cu} canRedo={cr}')
        u0, r0 = await read()
        if not u0 or not r0: return False, f'上の並びに「戻す」「やり直す」のボタンがない（戻す={bool(u0)} やり直す={bool(r0)}）'
        await select_part(pg, 'F_h0'); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(400)
        if not await ev(pg, f"{P}.canUndo()"): raise PrepFail('Shift+↓ の後も戻せる状態にならない')
        u1, r1_ = await read()
        await pg.mouse.click(u1['x'], u1['y']); await pg.wait_for_timeout(500)
        cu2, cr2 = await ev(pg, f"[{P}.canUndo(),{P}.canRedo()]")
        if not cr2 or cu2: raise PrepFail(f'「戻す」を押しても戻らない canUndo={cu2} canRedo={cr2}')
        u2, r2 = await read()
        ok = u0['dis'] and r0['dis'] and not u1['dis'] and r1_['dis'] and u2['dis'] and not r2['dis']
        f = lambda b: f"{'押せない' if b['dis'] else '押せる'}({b['color']},{b['op']})"
        return ok, f'開いた直後 戻す={f(u0)} やり直す={f(r0)} / 動かした後 戻す={f(u1)} やり直す={f(r1_)} / 戻した後 戻す={f(u2)} やり直す={f(r2)}'
    finally: await pg.context.close()

# ---- P29
# 作業票: 足した部品のあるセクションを複製したら、複製先でも元と同じ所に出す。
# 再現: ページの一番上で上の「テキスト」を押して「ZZQ」と打ち、外を押す → 特集セクションの何もない所を右クリック →「複製」。
# 合格: 複製先のセクションに「ZZQ」の部品があり、そのセクションの左上からの位置が、元の「ZZQ」の元のセクションからの位置と 3px 以内で同じ。
# 準備の確かめ: 足した「ZZQ」が特集セクションに入ったこと。複製でセクションが1つ増えたこと。
async def secdom(pg, id):
    # 部品が画面の上でどのセクションの中にあるか（DOM の .sec-wrap）。試験台28 では複製先の足した部品について
    # API の secOf が別のセクション（items）を返し、画面とずれるので、画面のほうを正とする。DOM で分からなければ secOf。
    s = await ev(pg, "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');const w=e&&(e.closest('.sec-wrap[data-sec]')||e.closest('[data-sec]'));return w?w.dataset.sec:null}", id)
    return s or await ev(pg, f"{P}.secOf('{id}')")

async def t_P29(br, url):
    pg = await fresh(br, url)
    try:
        await ev(pg, 'scrollTo(0,0)'); await pg.wait_for_timeout(200)
        b = await find_button(pg, [('id', 'tText'), ('text', 'テキスト'), ('title', 'テキスト'), ('aria', 'テキスト')], '#toolbar')
        if not b: raise PrepFail('上の並びに「テキスト」がない')
        await pg.mouse.click(b['x'], b['y']); await pg.wait_for_timeout(500)
        await pg.keyboard.type('ZZQ'); await pg.wait_for_timeout(200)
        await pg.mouse.click(1420, 990); await pg.wait_for_timeout(500)
        if await editing(pg): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        got = await leaves_with_text(pg, 'ZZQ')
        if len(got) != 1: raise PrepFail(f'「テキスト」で ZZQ の部品が1つできない {got}')
        oid = got[0]; osec = await secdom(pg, oid)
        if osec != 'feature': raise PrepFail(f'足した ZZQ が特集セクションに入らない（{osec}）')
        REL = """([id,s])=>{const e=document.querySelector('[data-el="'+id+'"]');const w=document.querySelector('.sec-wrap[data-sec="'+s+'"]')||document.querySelector('[data-sec="'+s+'"]');if(!e||!w)return null;const r=e.getBoundingClientRect(),q=w.getBoundingClientRect();return [r.x-q.x,r.y-q.y]}"""
        p0 = await ev(pg, REL, [oid, 'feature'])
        n0 = await sections(pg)
        x, y = await blank_point(pg, 'feature')
        await pg.mouse.click(x, y, button='right'); await pg.wait_for_timeout(400)
        d = await find_button(pg, [('data', '[data-sec-menu="複製"]'), ('text', '複製'), ('text', 'セクションを複製'), ('text', 'このセクションを複製'), ('title', '複製'), ('aria', '複製')])
        if not d: raise PrepFail('セクションの右クリックに「複製」がない')
        await pg.mouse.click(d['x'], d['y']); await pg.wait_for_timeout(800)
        n1 = await sections(pg); new = [s for s in n1 if s not in n0]
        if len(new) != 1: raise PrepFail(f'複製でセクションが1つ増えない {n0}→{n1}')
        ns = new[0]
        cands = [i for i in await leaves_with_text(pg, 'ZZQ') if i != oid]
        insec = []
        for i in cands:
            if await secdom(pg, i) == ns: insec.append(i)
        if not insec: return False, f'複製先 {ns} に ZZQ の部品がない（ほかの ZZQ={cands}）'
        p1 = await ev(pg, REL, [insec[0], ns])
        dd = (p1[0] - p0[0], p1[1] - p0[1])
        ok = abs(dd[0]) <= 3 and abs(dd[1]) <= 3
        return ok, f'元 {oid} セクションから ({r1(p0[0])},{r1(p0[1])}) / 複製先 {insec[0]}（{ns}） ({r1(p1[0])},{r1(p1[1])}) 差 ({r1(dd[0])},{r1(dd[1])})'
    finally: await pg.context.close()

ITEMS = [('P16', t_P16), ('P17', t_P17), ('P18', t_P18), ('P19', t_P19), ('P20', t_P20), ('P21', t_P21), ('P22', t_P22),
         ('P23', t_P23), ('P24', t_P24), ('P25', t_P25), ('P26', t_P26), ('P27', t_P27), ('P28', t_P28), ('P29', t_P29)]

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
            except PrepFail as e:
                ok, m = False, '準備失敗：' + str(e)
            except asyncio.TimeoutError:
                ok, m = False, '120秒で打ち切り'
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
