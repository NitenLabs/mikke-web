# -*- coding: utf-8 -*-
"""回帰の確認：使いにくさ F（area = misc1）

使い方: python3 verify_audit_misc1.py /path/to/playgroundNN_single.html [ID ...]
  ID を並べるとその項目だけ（例: F2 F17）。省略で全部。
出力: 1項目1行 `OK F2 | 説明` / `NG F2 | 実際の値`。最後に `合計 OK x / NG y（n秒）`。終了コード＝NG の数。

担当（作業票29 §5.3）: F2 F3 F4 F5 F6 F7 F8 F9 F12 F13 F15 F16 F17 F63 F18 F19 F20
  （表では F17・F63 が1行だが、項目は別々に出す）

判定の決まり（TESTBRIEF2.md）
- 本物のマウス・キーボードで操作する。window.__playground は状態を読むのと準備にだけ使う。
- Cmd の操作は MOD（Mac は Meta、ほかは Control）で送る。全部選ぶ（MOD+a）の後は、本当に全部選べたかを
  確かめてから打つ。文の末尾へ移るキーも OS で違う（Mac は Meta+↓、ほかは Control+End）ので、
  移った後にカーソルが本当に末尾にあるかを確かめる。
- 各項目で「操作が本当に起きたか（準備が成り立ったか）」を確かめ、成り立たなければ `NG <ID> | 準備失敗：…`。
  道具そのものが見つからないときは準備失敗ではなく「その道具がない」の NG。
- 知らせは verify_audit_parts.py と同じ探し方（#pgToast・role=status/alert・aria-live・.toast・dialog）に、
  品の連動の知らせ（#connNotice / .conn-notice）を足したもの。数秒で消える知らせを取り逃がさないよう、
  verify_audit_page.py と同じくページに見張り（80ms ごと）を入れて出た文字を記録する。
- 期待は「PowerPoint と同じ結果」「不便が起きないこと」で書き、ボタンの名前・id に縛られすぎないよう、
  文字・title・aria-label の複数の候補で探す。
- 項目ごとに browser context を作り直す。1項目 120 秒で打ち切り、例外は NG（例外の文）。
- このファイルは自分の中だけで完結させた（ほかの担当のファイルに頼らない）。
"""
import asyncio, json, math, os, re, sys, time, traceback
from pathlib import Path
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, '_work')
P = 'window.__playground'
OUT = 1420, 990          # 何もない所（右下の余白）。ここを押すと書き換え・選択が終わる
IS_MAC = sys.platform == 'darwin'
MOD = 'Meta' if IS_MAC else 'Control'
END_DOC = 'Meta+ArrowDown' if IS_MAC else 'Control+End'   # 書き換え中の文の末尾へ（Mac の Chrome は Cmd+↓）

# ---------------------------------------------------------------- 知らせの見張り（ページに入れる）
NOTICE_WATCH = r"""
(()=>{ window.__auditNotices=[]; const seen=new Map();
  const SEL='#pgToast,.pg-toast,#connNotice,.conn-notice,[role=status],[role=alert],[role=alertdialog],[aria-live],.toast,[class*=toast],[id*=toast],[id*=Toast],[role=dialog],dialog[open]';
  setInterval(()=>{ try{
    for(const e of document.querySelectorAll(SEL)){
      if(e.id==='saveStatus') continue;
      if(e.closest && e.closest('#toolbar')) continue;    // 保存の状態などは知らせに数えない
      const cs=getComputedStyle(e), r=e.getBoundingClientRect(), t=(e.innerText||'').trim();
      const vis=r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.05&&t;
      if(vis){ if(seen.get(e)!==t){ seen.set(e,t); window.__auditNotices.push(t.replace(/\s+/g,' ').slice(0,120)); } } else seen.delete(e);
    } }catch(_){} },80);
})();
"""
# 今見えている知らせの要素の矩形（帯・箱のボタンを隠していないかを見る）
NOTICE_RECTS = r"""(()=>{const out=[];const SEL='#pgToast,.pg-toast,#connNotice,.conn-notice,[role=status],[role=alert],[role=alertdialog],[aria-live],.toast,[class*=toast],[id*=toast],[id*=Toast]';
  for(const e of document.querySelectorAll(SEL)){ if(e.id==='saveStatus'||(e.closest&&e.closest('#toolbar'))) continue;
    const cs=getComputedStyle(e), r=e.getBoundingClientRect(), t=(e.innerText||'').trim();
    if(r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.05&&t) out.push({t:t.replace(/\s+/g,' ').slice(0,60),x:r.left,y:r.top,r:r.right,b:r.bottom}); }
  return out})()"""

# 帯（部品の右クリック・選択で出る操作の箱。今の試験台では #fmenu）
BAND = r"""(()=>{const f=document.getElementById('fmenu'); if(!f) return null; const cs=getComputedStyle(f); const R=f.getBoundingClientRect();
  const vis=cs.display!=='none'&&cs.visibility!=='hidden'&&R.width>0&&R.height>0&&R.bottom>0&&R.top<innerHeight&&R.right>0&&R.left<innerWidth;
  const lines=b=>{const rg=document.createRange();rg.selectNodeContents(b);return new Set([...rg.getClientRects()].filter(q=>q.width>0.5).map(q=>Math.round(q.top))).size};
  const bs=[...f.querySelectorAll('button,[role=button],[role=menuitem]')].filter(b=>{const q=b.getBoundingClientRect();const c=getComputedStyle(b);return q.width>0&&q.height>0&&c.visibility!=='hidden'&&c.display!=='none'});
  return {vis, x:R.left, y:R.top, r:R.right, b:R.bottom,
    btns: bs.map(b=>{const q=b.getBoundingClientRect(); return {t:(b.textContent||'').trim().replace(/\s+/g,' '), dis:!!(b.disabled||b.getAttribute('aria-disabled')==='true'), lines:lines(b), op:parseFloat(getComputedStyle(b).opacity), col:getComputedStyle(b).color, x:q.left,y:q.top,r:q.right,b:q.bottom}})}})()"""

# ---------------------------------------------------------------- 共通の小道具
def hook(pg):
    pg._e = []; pg._dlg = []
    pg.on('pageerror', lambda e: pg._e.append('PE ' + str(e)))
    pg.on('dialog', lambda d: (pg._dlg.append(d.type + ' ' + d.message), asyncio.ensure_future(d.dismiss())))

async def fresh(br, url, w=1440, h=1000):
    ctx = await br.new_context(viewport={'width': w, 'height': h})
    # Google Fonts を止める（Mac では本物の書体が読まれて字の寸法が変わり、F18 の1行などの閾値がずれるため）
    await ctx.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/'), lambda route: route.abort())
    await ctx.add_init_script(NOTICE_WATCH)
    pg = await ctx.new_page(); hook(pg)
    await pg.goto(url); await pg.wait_for_timeout(1600)
    return pg

def ev(pg, js, *a): return pg.evaluate(js, *a)

async def scrollto(pg, id):
    await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(e)e.scrollIntoView({block:'center'})}", id)
    await pg.wait_for_timeout(250)

async def vb(pg, id):
    """画面上の位置（なければ None）"""
    return await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const r=e.getBoundingClientRect();if(r.width==0&&r.height==0)return null;return {x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom,py:r.y+scrollY}}", id)

async def esc_if_editing(pg):
    # P2 に合わせて手順を変えた（判定は同じ）：線 A2（P2）からは文字の箱を押して離すと書き換えに入る（押した所にカーソル）。
    # 部品を「選ぶ」クリックの後、書き換えに入っていたら（editingId() が null でない）Esc を1回＝箱を選んだだけ（Esc の後も選ばれたまま）。
    # P2 の無い版（試験台28・29）では書き換えに入らないので Esc を押さない（押すと選択が外れるため）
    if await pg.evaluate("!!(window.__playground&&window.__playground.editingId&&window.__playground.editingId())"):
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)

async def click(pg, id, dx=40, dy=12, button='left', n=1, scroll=True, esc=True):
    if scroll: await scrollto(pg, id)
    r = await vb(pg, id)
    if not r: raise RuntimeError('部品が無い: ' + id)
    await pg.mouse.click(r['x'] + min(dx, r['w'] / 2), r['y'] + min(dy, r['h'] / 2), button=button, click_count=n)
    await pg.wait_for_timeout(400)
    if esc and n == 1 and button == 'left': await esc_if_editing(pg)   # P2 に合わせて手順を変えた（判定は同じ）
    return r

async def dbl(pg, id, dx=40, dy=12):
    await scrollto(pg, id); r = await vb(pg, id)
    await pg.mouse.dblclick(r['x'] + min(dx, r['w'] / 2), r['y'] + min(dy, r['h'] / 2)); await pg.wait_for_timeout(450); return r

async def out(pg):
    await pg.mouse.click(*OUT); await pg.wait_for_timeout(450)

async def sel(pg): return await pg.evaluate(f"{P}.selected()")
async def nops(pg): return len(await pg.evaluate(f"{P}.ops()"))
async def geom(pg, id): return (await pg.evaluate(f"{P}.geometry()")).get(id)
async def ids(pg): return await pg.evaluate("[...document.querySelectorAll('[data-el]')].map(e=>e.dataset.el)")
async def editing(pg): return await pg.evaluate(f"{P}.editingId()")
async def runs_text(pg, id): return await pg.evaluate(f"(id=>({P}.textRuns(id)||[]).map(r=>r.text||'').join(''))", id)

async def clear_notices(pg):
    await ev(pg, "window.__auditNotices&&(window.__auditNotices.length=0)"); pg._dlg.clear()

async def notices(pg):
    await pg.wait_for_timeout(250)
    return (await ev(pg, "window.__auditNotices||[]")) + ['[箱] ' + d for d in pg._dlg]

async def band(pg): return await pg.evaluate(BAND)

VISIBLE_NOTICE_TEXTS = r"""(()=>{const out=[];const SEL='#pgToast,.pg-toast,#connNotice,.conn-notice,[role=status],[role=alert],[role=alertdialog],[aria-live],.toast,[class*=toast],[id*=toast],[id*=Toast],[role=dialog],dialog[open]';
  for(const e of document.querySelectorAll(SEL)){ if(e.id==='saveStatus'||(e.closest&&e.closest('#toolbar'))) continue;
    const cs=getComputedStyle(e), r=e.getBoundingClientRect(), t=(e.innerText||'').trim();
    if(r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.05&&t) out.push(t.replace(/\s+/g,' ').slice(0,120)); }
  return out})()"""
async def notices_before(pg):
    """操作の直前までに出た知らせと、今見えている知らせの文（新しく出た知らせだけを数えるため、これを除く）"""
    await pg.wait_for_timeout(250)
    return set(await ev(pg, "window.__auditNotices||[]")) | set(await ev(pg, VISIBLE_NOTICE_TEXTS))

async def selitem(pg, id, dx=10, dy=8):
    """品（カード）の中の部品を選ぶ。1回目は並び全体・2回目でその部品（P23 が直っていれば1回目で選べる）"""
    await click(pg, id, dx, dy)
    if id not in await sel(pg): await click(pg, id, dx, dy, scroll=False)
    return id in await sel(pg)

async def caret_at_end(pg):
    """書き換え中のカーソルが文の末尾にあり、何も選んでいないか"""
    return await pg.evaluate("""(()=>{const s=getSelection(); if(!s.rangeCount) return false; const r=s.getRangeAt(0); if(!r.collapsed) return false;
      const host=(r.startContainer.nodeType==1?r.startContainer:r.startContainer.parentElement).closest('[contenteditable]'); if(!host) return false;
      const t=document.createRange(); t.setStart(r.endContainer,r.endOffset); t.setEnd(host,host.childNodes.length); return t.toString().replace(/\\n/g,'')===''})()""")

def r1(v): return round(v, 1) if isinstance(v, (int, float)) else v

def overlaps(a, b, tol=1):
    return min(a['r'], b['r']) - max(a['x'], b['x']) > tol and min(a['b'], b['b']) - max(a['y'], b['y']) > tol

async def find_ctrls(pg, words, exclude_toolbar=True):
    """find_ctrl と同じ探し方で、合う物をすべて（中心の座標・文字）返す"""
    return await pg.evaluate("""([ws,ext])=>[...document.querySelectorAll('button,[role=button],[role=menuitem],a,span,div,label')].filter(e=>{const q=e.getBoundingClientRect();const s=getComputedStyle(e);
        if(!(q.width>0&&q.height>0&&s.visibility!=='hidden'&&s.display!=='none'))return false; if(ext&&e.closest('#toolbar'))return false; if(e.closest('[data-el]'))return false;
        if(q.bottom<0||q.top>innerHeight||q.right<0||q.left>innerWidth)return false;
        const txt=(e.children.length===0||e.tagName==='BUTTON')?(e.textContent||'').trim():'';
        const keys=[txt,e.title||'',e.getAttribute('aria-label')||'',...Object.values(e.dataset||{})];
        return ws.some(w=>keys.some(k=>k&&(k===w||(w.length>1&&k.includes(w)))));}).map(e=>{const q=e.getBoundingClientRect();return {x:Math.round(q.left+q.width/2),y:Math.round(q.top+q.height/2),t:(e.textContent||'').trim().slice(0,20)}})""", [words, exclude_toolbar])

async def find_ctrl(pg, words, root=None, exclude_toolbar=False):
    """見えているボタン類を文字・title・aria-label・data 属性で探す。中心の座標と disabled を返す"""
    return await pg.evaluate("""([ws,root,ext])=>{const R=root?document.querySelector(root):document; if(!R) return null;
      const c=[...R.querySelectorAll('button,[role=button],[role=menuitem],a,span,div,label')].filter(e=>{const q=e.getBoundingClientRect();const s=getComputedStyle(e);
        if(!(q.width>0&&q.height>0&&s.visibility!=='hidden'&&s.display!=='none'))return false; if(ext&&e.closest('#toolbar'))return false; if(e.closest('[data-el]'))return false;
        const txt=(e.children.length===0||e.tagName==='BUTTON')?(e.textContent||'').trim():'';
        const keys=[txt,e.title||'',e.getAttribute('aria-label')||'',...Object.values(e.dataset||{})];
        return ws.some(w=>keys.some(k=>k&&(k===w||(w.length>1&&k.includes(w)))));});
      if(!c.length) return null; const e=c[0]; const q=e.getBoundingClientRect(); return {x:q.left+q.width/2,y:q.top+q.height/2,dis:!!e.disabled,t:(e.textContent||'').trim().slice(0,20)}}""", [words, root, exclude_toolbar])

# ================================================================ 項目
# ---- F2
# 作業票: 文字の箱の幅に下限（その箱の文字の大きさで4文字分、かつ 80px 以上）
# 再現: F_b0（本文 16px）と F_h0（見出し 24px）を選び、右辺のつまみ（data-handle=e）を左へ 700px ドラッグする。
# 合格: 離した後の箱の幅（geometry の設計 px）が max(80, 文字の大きさ×4) 以上（1px の誤差まで）。
# 準備の確かめ: つまみが見つかり、ドラッグで箱の幅が 50px 以上縮んだこと（縮まなければ準備失敗）。
async def t_F2(br, url):
    msg = []; ok = True
    for id in ('F_b0', 'F_h0'):
        pg = await fresh(br, url)
        try:
            await click(pg, id, 40, 10)
            if id not in await sel(pg): return False, f'準備失敗：{id} を選べない（選択 {await sel(pg)}）'
            hs = await pg.evaluate("id=>[...document.querySelectorAll('[data-handle-for=\"'+id+'\"]')].map(h=>{const r=h.getBoundingClientRect();return [h.getAttribute('data-handle'),r.x+r.width/2,r.y+r.height/2]})", id)
            h = [x for x in hs if x[0] == 'e'] or [x for x in hs if x[0] in ('se', 'ne')]
            if not h: return False, f'準備失敗：{id} の右辺のつまみが無い {hs}'
            g0 = await geom(pg, id); fs = await pg.evaluate("s=>parseFloat(getComputedStyle(document.querySelector('[data-el=\"'+s+'\"]')).fontSize)", id)
            x, y = h[0][1], h[0][2]
            await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x - 700, y, steps=25); await pg.mouse.up(); await pg.wait_for_timeout(500)
            g1 = await geom(pg, id)
            if g0['w'] - g1['w'] < 50: return False, f'準備失敗：{id} のつまみを左へドラッグしても縮まない w {r1(g0["w"])}→{r1(g1["w"])}'
            need = max(80, fs * 4); good = g1['w'] >= need - 1; ok &= good
            msg.append(f'{id}（{r1(fs)}px）幅 {r1(g0["w"])}→{r1(g1["w"])} 下限 {r1(need)}')
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- F3
# 作業票: 空行1つは1つのまま保存される
# 再現: F_b0 をダブルクリックで書き換え→文の末尾へ→Enter・Enter（空行1つ）→「X」→外をクリック→1.5秒→読み込み直す。
# 合格: 確定後と読み込み直し後の文（textRuns をつないだもの）が「…お届けします。\n\nX」で終わる（改行2つ＝空行1つ）。
# 準備の確かめ: 書き換えに入れたこと、Enter の前にカーソルが本当に末尾にあること、X が文に入ったこと。
async def t_F3(br, url):
    pg = await fresh(br, url)
    try:
        await dbl(pg, 'F_b0', 60, 12)
        if await editing(pg) != 'F_b0': return False, f'準備失敗：F_b0 の書き換えに入れない（{await editing(pg)}）'
        t0 = await runs_text(pg, 'F_b0')
        await pg.keyboard.press(END_DOC); await pg.wait_for_timeout(150)
        if not await caret_at_end(pg): return False, f'準備失敗：{END_DOC} でカーソルが文の末尾に行かない'
        await pg.keyboard.press('Enter'); await pg.keyboard.press('Enter'); await pg.keyboard.type('X'); await pg.wait_for_timeout(200)
        await out(pg); await pg.wait_for_timeout(1500)
        t1 = await runs_text(pg, 'F_b0')
        if not t1.endswith('X'): return False, f'準備失敗：打った X が文に無い {t1[-12:]!r}'
        await pg.reload(); await pg.wait_for_timeout(1600)
        t2 = await runs_text(pg, 'F_b0')
        want = t0.rstrip('\n') + '\n\nX'
        ok = t1 == want and t2 == want
        return ok, f'確定後の末尾={t1[-8:]!r} 読み込み直し後の末尾={t2[-8:]!r}（期待 {want[-8:]!r}）'
    finally: await pg.context.close()

# ---- F4
# 作業票: 一覧（大きさ・書体・色・お品書きの ▾）は Esc で一覧だけ閉じ、選択は残る
# 再現: F_h0 を選び、上の並びの「書体 ▾」「よく使う大きさ ▾」「色」をそれぞれ押して一覧を開き Esc。
#       品の名前（card_name_c_jonama）を選び「メニュー ▾」（お品書きの並びを選ぶ一覧）を開いて Esc。
# 合格: どの一覧も Esc で閉じ（開いたときに増えた一覧の要素が見えなくなる）、選択は開く前と同じ。
# 準備の確かめ: ボタンを押して一覧（新しく見えた浮いた要素）が本当に開いたこと。
POPS = r"""(()=>{const out=[];for(const e of document.querySelectorAll('body *')){const c=getComputedStyle(e);if(c.position!=='fixed'&&c.position!=='absolute')continue;
  if(c.display==='none'||c.visibility==='hidden')continue;if(e.closest('[data-el]')||e.closest('#stage')||e.closest('#toolbar'))continue;if(e.id==='connNotice'||e.id==='fmenu'||e.id==='photoChangeBtn')continue;
  const r=e.getBoundingClientRect();if(r.width<20||r.height<20||r.right<0||r.left>innerWidth||r.bottom<0||r.top>innerHeight)continue;
  out.push((e.id||e.className||e.tagName).toString().slice(0,30))}return out})()"""
async def t_F4(br, url):
    msg = []; ok = True
    lists = [('書体', ['書体', 'font'], 'F_h0'), ('大きさ', ['よく使う大きさ', 'size-list'], 'F_h0'), ('色', ['色', '文字の色', 'color'], 'F_h0'),
             ('メニュー', ['メニュー ▾', 'メニュー', 'お品書き ▾', 'menus'], 'card_name_c_jonama')]
    for label, words, part in lists:
        pg = await fresh(br, url)
        try:
            if part.startswith('card_'):
                if not await selitem(pg, part): return False, f'準備失敗：{part} を選べない'
            else:
                await click(pg, part, 40, 10)
            s0 = await sel(pg)
            if part not in s0: return False, f'準備失敗：{part} を選べない（{s0}）'
            b = await find_ctrl(pg, words, '#toolbar')
            if not b:   # 並びに入りきらず「その他」にしまわれているとき
                m = await find_ctrl(pg, ['その他 ▾', 'その他'], '#toolbar')
                if m: await pg.mouse.click(m['x'], m['y']); await pg.wait_for_timeout(300); b = await find_ctrl(pg, words)
            if not b: ok = False; msg.append(f'{label}: その道具（ボタン）がない'); continue
            p0 = set(await pg.evaluate(POPS))
            await pg.mouse.click(b['x'], b['y']); await pg.wait_for_timeout(350)
            p1 = [x for x in await pg.evaluate(POPS) if x not in p0]
            if not p1: return False, f'準備失敗：{label} の一覧が開かない'
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(350)
            p2 = [x for x in await pg.evaluate(POPS) if x in p1]
            s1 = await sel(pg)
            good = not p2 and s1 == s0; ok &= good
            msg.append(f'{label}: 一覧 {p1} → Esc 後 残り {p2} 選択 {s0}→{s1}')
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

MARK_PICKERS = r"""(()=>{for(const i of document.querySelectorAll('input[type=color],input[type=range]')){const r=i.getBoundingClientRect();const c=getComputedStyle(i);
  if(r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight) i.dataset.auditOld='1';}})()"""
TAG_NEW_PICKER = r"""(()=>{const vis=i=>{const r=i.getBoundingClientRect();const c=getComputedStyle(i);return r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight};
  const c=[...document.querySelectorAll('input[type=color],input[type=range]')].filter(i=>!i.dataset.auditOld&&!i.closest('#cropzoom')&&vis(i));
  let pick=c.find(i=>i.type==='color')||c[0];
  // 画面の外に置いた OS の色の画面用の欄（今の試験台：「その他の色…」と同じ一覧の中で left:-9000px 付近）は「見えるようになる」ことがない。
  // そのときは「その他の色」のボタンと同じ一覧（親の要素）の中の input type=color を使う
  if(!pick){ const btn=[...document.querySelectorAll('button,[role=button],[role=menuitem]')].find(b=>/その他の色/.test(b.textContent||'')||/その他の色/.test(b.title||'')||/その他の色/.test(b.getAttribute('aria-label')||''));
    let p=btn&&btn.parentElement; for(let k=0;p&&k<3&&!pick;k++,p=p.parentElement){ pick=[...p.querySelectorAll('input[type=color]')].find(i=>!i.closest('#cropzoom'))||null; } }
  if(!pick) return null; pick.setAttribute('data-audit-picker','1'); return pick.type})()"""

# ---- F5
# 作業票: 「その他の色」でつまみを動かしている間は1つの操作。決めたときに1回だけ記録。最近使った色も1つ
# 再現: F_h0 を選び、上の並びの「色」→「その他の色…」を本物のクリックで押す。
#       色を選ぶ画面は OS の画面（input type=color）でマウスで動かせないため、その画面のつまみを動かしたときに
#       ブラウザが送るのと同じ「input を10回（色を少しずつ変える）→ change を1回」を、色の一覧を開いた後に
#       見えるようになった input type=color に送る（OS の画面の代わり。開く前から見えていた欄には送らない）。
#       画面の外に置いた欄で見えるようにならないときは、「その他の色」のボタンと同じ一覧の中の input type=color に送る。
#       色の画面がページの中に作られた（input type=range のつまみがある）ときは、そのつまみを本物のマウスで
#       10段に分けてドラッグし、「決める」「OK」があれば押す。
# 合格: (1) つまみを動かしている間の記録の増え ≤1、(2) 決めた後の記録の増え＝1、(3) 最近使った色の増え＝1、
#       (4) 文字の色が最後の色、(5) 戻す（MOD+z）1回で元の色に戻る。
# 準備の確かめ: 「その他の色」のボタンがあり、色を選ぶ物（input type=color か range）が見つかること、色が変わったこと。
async def t_F5(br, url):
    pg = await fresh(br, url)
    try:
        await click(pg, 'F_h0', 40, 10)
        if 'F_h0' not in await sel(pg): return False, '準備失敗：F_h0 を選べない'
        st0 = await pg.evaluate(f"{P}.textStyles().find(x=>x.part=='F_h0')")
        col0 = (st0 or {}).get('color'); n0 = await nops(pg); rc0 = list(await pg.evaluate(f"{P}.recentColors()"))
        b = await find_ctrl(pg, ['色', '文字の色'], '#toolbar')
        if not b: return False, '「色」のボタンがない'
        await pg.evaluate(MARK_PICKERS)   # 色の一覧を開く前から見えている色の欄・つまみに印（後で除く）
        await pg.mouse.click(b['x'], b['y']); await pg.wait_for_timeout(300)
        m = await find_ctrl(pg, ['その他の色…', 'その他の色'])
        if not m: return False, '「その他の色」がない'
        await pg.mouse.click(m['x'], m['y']); await pg.wait_for_timeout(400)
        cols = ['#%02X3030' % (0x40 + k * 16) for k in range(10)]
        kind = await pg.evaluate(TAG_NEW_PICKER)   # 「その他の色」を押した後に見えるようになった色の欄・つまみに data-audit-picker
        mid = None
        if kind == 'color':
            for c in cols:
                await pg.evaluate("v=>{const i=document.querySelector('[data-audit-picker]');i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}))}", c)
                await pg.wait_for_timeout(40)
            mid = await nops(pg)
            await pg.evaluate("()=>{const i=document.querySelector('[data-audit-picker]');i.dispatchEvent(new Event('change',{bubbles:true}))}")
            last = cols[-1]
        else:
            rg = await pg.evaluate("(()=>{const i=document.querySelector('[data-audit-picker]');if(!i)return null;const r=i.getBoundingClientRect();return [r.x+4,r.y+r.height/2,r.width-8]})()") if kind == 'range' else None
            if not rg: return False, '準備失敗：「その他の色」を押しても色を選ぶ欄（input type=color・range）が見えるようにならない'
            await pg.mouse.move(rg[0], rg[1]); await pg.mouse.down()
            for k in range(1, 11): await pg.mouse.move(rg[0] + rg[2] * k / 12, rg[1]); await pg.wait_for_timeout(40)
            mid = await nops(pg); await pg.mouse.up(); await pg.wait_for_timeout(200)
            okb = await find_ctrl(pg, ['決める', 'OK', '適用'])
            if okb: await pg.mouse.click(okb['x'], okb['y'])
            last = None
        await pg.wait_for_timeout(400)
        n2 = await nops(pg); rc = list(await pg.evaluate(f"{P}.recentColors()"))
        st1 = await pg.evaluate(f"{P}.textStyles().find(x=>x.part=='F_h0')"); col1 = (st1 or {}).get('color')
        if col1 == col0: return False, f'準備失敗：色が変わらない（{col0}）'
        added = len([c for c in rc if c not in rc0])
        await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(400)
        col2 = ((await pg.evaluate(f"{P}.textStyles().find(x=>x.part=='F_h0')")) or {}).get('color')
        c1 = mid - n0 <= 1; c2 = n2 - n0 == 1; c3 = added == 1; c4 = (last is None) or (str(col1).upper() == last.upper()); c5 = col2 == col0
        return all([c1, c2, c3, c4, c5]), (f'動かしている間の記録 +{mid - n0}・決めた後 +{n2 - n0}・最近使った色 +{added} {rc[:4]}・'
                                           f'色 {col0}→{col1}（最後 {last}）・戻す1回で {col2}')
    finally: await pg.context.close()

# ---- F6
# 作業票: 品名を直したら、お品書きにも出ていることを値段と同じ知らせで示す
# 再現: 品のカードの名前（card_name_c_jonama）をダブルクリックで書き換え→末尾に「Z」→外をクリック（確定）。
# 合格: 確定してから 3 秒の間に新しく出た知らせ（見張りで記録）で、「お品書き」を含み、かつ直した名前か
#       「反映」「出ています」「変わ」のどれかを含むものがある。品を選ぶ・書き換えに入るまでに出ていた知らせの文
#       （選ぶたびに出る常設の「お品書きと連動しています…」など）は数えない。
# 準備の確かめ: 書き換えに入れたこと、カーソルが末尾にあること、確定後の名前が「…Z」になったこと。
async def t_F6(br, url):
    pg = await fresh(br, url)
    try:
        # 先に品名を選んで、選ぶたびに出る常設の知らせ（「お品書きと連動しています…」）を「前からある知らせ」として覚える
        await selitem(pg, 'card_name_c_jonama'); await pg.wait_for_timeout(400)
        pre = await notices_before(pg)
        await dbl(pg, 'card_name_c_jonama', 10, 8)
        if await editing(pg) != 'card_name_c_jonama': await dbl(pg, 'card_name_c_jonama', 10, 8)
        if await editing(pg) != 'card_name_c_jonama': return False, f'準備失敗：品名の書き換えに入れない（{await editing(pg)}）'
        await pg.keyboard.press(END_DOC); await pg.wait_for_timeout(150)
        if not await caret_at_end(pg): return False, f'準備失敗：{END_DOC} でカーソルが末尾に行かない'
        await pg.wait_for_timeout(300); pre |= await notices_before(pg); await clear_notices(pg)
        await pg.keyboard.type('Z'); await out(pg); await pg.wait_for_timeout(2600)
        name = (await pg.evaluate("document.querySelector('[data-el=card_name_c_jonama]')?.innerText||''")).strip()
        if not name.endswith('Z'): return False, f'準備失敗：名前が直っていない {name!r}'
        n = [x for x in await notices(pg) if x not in pre]
        hit = [x for x in n if 'お品書き' in x and (name in x or re.search('反映|出ています|変わ', x))]
        return bool(hit), f'名前「{name}」に直した後に新しく出た知らせ {n[:4]}（前からあった知らせ {sorted(pre)[:2]} は除く）'
    finally: await pg.context.close()

# ---- F7
# 作業票: 値段の箱：名前の欄が打てる幅、金額欄が箱からはみ出さない、Enter で決まる、知らせがボタンを隠さない
# 再現: 品のカードの値段（card_price_c_jonama）をダブルクリックして値段の箱を開く。金額欄をクリック→MOD+a（全部選べたか確かめる）→「777」→Enter。
# 合格: (1) 名前の欄の幅 ≥ その欄の文字の大きさ×4、(2) 箱の中の入力・ボタンが箱の枠からはみ出さない（1px まで）、
#       (3) Enter で値段が 777 に決まる（effPrices）、(4) 箱を開いたとき、見えている知らせが帯・箱のボタンに重ならない。
# 準備の確かめ: 値段の箱（名前の欄と金額欄）が開くこと、MOD+a で金額欄の文字が全部選べたこと。
async def t_F7(br, url):
    pg = await fresh(br, url)
    try:
        await dbl(pg, 'card_price_c_jonama', 10, 10); await pg.wait_for_timeout(300)
        info = await pg.evaluate(r"""(()=>{const b=document.getElementById('priceBox')||document.querySelector('.price-box,[data-price-box]'); if(!b) return null; const R=b.getBoundingClientRect();
          const ctl=[...b.querySelectorAll('input,select,button')].filter(e=>e.offsetParent).map(e=>{const q=e.getBoundingClientRect();return {c:(e.className||e.tagName).toString(),tag:e.tagName,t:e.type||'',im:e.inputMode||e.getAttribute('inputmode')||'',v:e.value||'',x:q.left,y:q.top,r:q.right,b:q.bottom,w:q.width,fs:parseFloat(getComputedStyle(e).fontSize),ph:e.placeholder||''}});
          return {x:R.left,y:R.top,r:R.right,b:R.bottom,ctl}})()""")
        if not info: return False, '準備失敗：値段の箱が開かない'
        name = [c for c in info['ctl'] if 'name' in c['c'] or '名前' in c['ph']]
        amt = [c for c in info['ctl'] if 'amt' in c['c'] or c['t'] == 'number' or '金額' in c['ph']]
        # id・class 名に頼らない道：箱の中の見えている input を並べ、数字の欄（type=number・inputmode=numeric・値が数字）を金額欄、
        # それ以外の文字の欄を名前欄とする
        ins = [c for c in info['ctl'] if c['tag'] == 'INPUT' and c['t'] in ('text', 'number', 'search', 'tel', '')]
        isnum = lambda c: c['t'] == 'number' or c['im'] in ('numeric', 'decimal') or re.fullmatch(r'[0-9０-９,，]+', c['v'] or '') is not None
        if not amt: amt = [c for c in ins if isnum(c)]
        if not name: name = [c for c in ins if not isnum(c)]
        if not name or not amt: return False, f'準備失敗：名前の欄・金額欄が見つからない {[c["c"] for c in info["ctl"]]}'
        c1 = name[0]['w'] >= name[0]['fs'] * 4
        outside = [c['c'] for c in info['ctl'] if c['x'] < info['x'] - 1 or c['r'] > info['r'] + 1 or c['y'] < info['y'] - 1 or c['b'] > info['b'] + 1]
        c2 = not outside
        nr = await pg.evaluate(NOTICE_RECTS); bd = await band(pg)
        btns = [dict(x=c['x'], y=c['y'], r=c['r'], b=c['b'], t=c['c']) for c in info['ctl'] if c['t'] in ('submit', 'button') or 'pb-' in c['c']]
        if bd and bd['vis']: btns += [dict(x=b['x'], y=b['y'], r=b['r'], b=b['b'], t=b['t']) for b in bd['btns']]
        hidden = sorted({f"{n['t'][:14]}→{b['t'][:10]}" for n in nr for b in btns if overlaps(n, b)})
        c4 = not hidden
        a = amt[0]; await pg.mouse.click((a['x'] + a['r']) / 2, (a['y'] + a['b']) / 2); await pg.wait_for_timeout(150)
        await pg.keyboard.press(f'{MOD}+a'); await pg.wait_for_timeout(100)
        allsel = await pg.evaluate("(()=>{const e=document.activeElement;if(!e||e.tagName!=='INPUT')return 'no-input';const v=e.value||'';if(e.type==='number'){return getSelection().toString()===v||v===''?'ok':'sel='+getSelection().toString()}return (e.selectionStart===0&&e.selectionEnd===v.length)?'ok':'sel='+e.selectionStart+'-'+e.selectionEnd})()")
        if allsel != 'ok':
            # number 欄は selectionStart が読めないので、文字を打って全部置き換わったかでも確かめる
            pass
        await pg.keyboard.type('777'); await pg.wait_for_timeout(100)
        v = await pg.evaluate("document.activeElement&&document.activeElement.value")
        if str(v) != '777': return False, f'準備失敗：MOD+a で金額欄が全部選べない（打った後の値 {v!r}・{allsel}）'
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600)
        eff = await pg.evaluate(f"{P}.effPrices('card_price_c_jonama')")
        amts = [p.get('amount') for p in (eff or {}).get('prices', [])]
        c3 = 777 in amts
        return all([c1, c2, c3, c4]), (f'名前の欄の幅 {r1(name[0]["w"])}px（要 {r1(name[0]["fs"] * 4)}）・はみ出し {outside}・'
                                       f'Enter 後の値段 {amts}・知らせが隠すボタン {hidden}')
    finally: await pg.context.close()

# ---- F8
# 作業票: 品のカードを貼る・複製したら「お品書きに新しい品を作りました」と知らせ、新しい品を選ぶ。2回貼っても順が逆にならない
# 再現: (a) 品の名前（card_name_c_jonama）を選び MOD+c → MOD+v を2回。(b) 同じく選んで MOD+d を2回。
# 合格: 貼る（複製する）たびに、操作の直前までに出ていた・見えていた文を除いた新しい知らせで、
#       「お品書き」と「新し/作/足/増/複製/加」を含むものが出る（連動の常設の知らせは数えない）。
#       貼った後の選択が新しい品（元の c_jonama 以外の品の部品）。1回目に増えた品が2回目に増えた品より前に並ぶ。
# 準備の確かめ: 品を選べたこと、貼る・複製で品のカードが1つずつ増えたこと。
CARDS = "[...document.querySelectorAll('[data-el^=\"card_name_\"]')].map(e=>e.dataset.el)"
async def t_F8(br, url):
    msg = []; ok = True
    for how in ('paste', 'dup'):
        pg = await fresh(br, url)
        try:
            if not await selitem(pg, 'card_name_c_jonama'): return False, f'準備失敗：品の名前を選べない（{await sel(pg)}）'
            if how == 'paste': await pg.keyboard.press(f'{MOD}+c'); await pg.wait_for_timeout(200)
            order = []; sub = []
            for k in range(2):
                c0 = await pg.evaluate(CARDS); pre = await notices_before(pg); await clear_notices(pg)
                await pg.keyboard.press(f'{MOD}+v' if how == 'paste' else f'{MOD}+d'); await pg.wait_for_timeout(900)
                c1 = await pg.evaluate(CARDS); new = [c for c in c1 if c not in c0]
                if len(new) != 1: return False, f'準備失敗：{how} {k + 1}回目で品が1つ増えない（{c0}→{c1}）'
                order.append(new[0])
                n = [x for x in await notices(pg) if x not in pre and 'お品書き' in x and re.search('新し|作|足|増|複製|加', x)]
                s = await sel(pg); nid = new[0].replace('card_name_', '')
                good_n = bool(n); good_s = any(nid in x for x in s) and not any('c_jonama' in x for x in s)
                ok &= good_n and good_s
                sub.append(f'{k + 1}回目 知らせ={n[:1]} 選択={s}')
            fin = await pg.evaluate(CARDS); good_o = fin.index(order[0]) < fin.index(order[1]); ok &= good_o
            msg.append(f'{"貼る" if how == "paste" else "MOD+d"}: ' + ' '.join(sub) + f' 並び {[c.replace("card_name_c_", "") for c in fin]}')
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- F9
# 作業票: 品の写真の帯から効かない「書き換える」を外す。知らせが帯を隠さない
# 再現: 品の写真（card_photo_c_jonama）を選ぶ（1回目は並び、2回目で写真）→帯が出る。右クリックの帯も見る。
# 合格: 品の写真の帯に「書き換える」が無い。帯のボタンに、見えている知らせ（連動の知らせなど）が重ならない。
# 準備の確かめ: 品の写真を選べて、帯が出たこと（選択で出なければ右クリックで出す）。
async def t_F9(br, url):
    pg = await fresh(br, url)
    try:
        if not await selitem(pg, 'card_photo_c_jonama', 100, 100): return False, f'準備失敗：品の写真を選べない（{await sel(pg)}）'
        await pg.wait_for_timeout(300); bd = await band(pg)
        if not (bd and bd['vis']):
            r = await vb(pg, 'card_photo_c_jonama'); await pg.mouse.click(r['x'] + 100, r['y'] + 100, button='right'); await pg.wait_for_timeout(400)
            bd = await band(pg)
        if not (bd and bd['vis']): return False, '準備失敗：品の写真の帯が出ない'
        s = await sel(pg)
        if 'card_photo_c_jonama' not in s: return False, f'準備失敗：帯を出すと品の写真の選択が外れる（{s}）'
        names = [b['t'] for b in bd['btns']]
        has_edit = any('書き換える' in t for t in names)
        nr = await pg.evaluate(NOTICE_RECTS)
        hidden = sorted({f"{n['t'][:14]}→{b['t']}" for n in nr for b in bd['btns'] if overlaps(n, b)})
        return not has_edit and not hidden, f'帯 {names} 知らせが隠すボタン {hidden}'
    finally: await pg.context.close()

# ---- F12
# 作業票: 見せる範囲の「−」「＋」が効く。ページをスクロールしても重ね描きが写真からずれない（ずれるなら見せる範囲を決めて終える）
# 再現: F_p0 をダブルクリックして見せる範囲に入る。拡大の棒の「＋」を押す→「−」を押す。
#       写真の外（左の余白 x=30）にマウスを置いてホイールで 200px スクロール。
# 合格: (1)「＋」で拡大（zoom）が増え、「−」で減る。(2) スクロール後、見せる範囲が続いているなら重ね描き（#cropwrap の
#       .clip・つまみ）の写真からのずれが 2px 以内。見せる範囲が終わったなら、重ね描きが消えて、＋で決めた拡大が写真に残っている。
# 準備の確かめ: 見せる範囲に入れたこと、ホイールでページが本当にスクロールしたこと。
OVL12 = r"""(()=>{const w=document.getElementById('cropwrap'); const ph=document.querySelector('[data-el=F_p0]').getBoundingClientRect();
  const vis=w&&getComputedStyle(w).display!=='none'; const kids=vis?[...w.querySelectorAll('.clip,[data-crop-handle]')].map(e=>{const r=e.getBoundingClientRect();return {k:e.className+(e.getAttribute('data-crop-handle')||''),dx:r.left-ph.left,dy:r.top-ph.top}}):[];
  return {vis, kids, ph:{x:ph.left,y:ph.top}}})()"""
async def t_F12(br, url):
    pg = await fresh(br, url)
    try:
        await scrollto(pg, 'F_p0'); r = await vb(pg, 'F_p0')
        pre_p = await find_ctrls(pg, ['＋', '+', '拡大', '大きく']); pre_m = await find_ctrls(pg, ['−', '-', '－', '縮小', '小さく'])
        await pg.mouse.dblclick(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2); await pg.wait_for_timeout(500)
        cs0 = await pg.evaluate(f"{P}.cropState('F_p0')")
        if not cs0: return False, '準備失敗：見せる範囲に入らない'
        z0 = cs0['view']['zoom']
        # 見せる範囲に入って新しく出た物だけを候補にする（セクションを足す「＋」などと取り違えない）
        old = {(c['x'], c['y'], c['t']) for c in pre_p + pre_m}
        cp = [c for c in await find_ctrls(pg, ['＋', '+', '拡大', '大きく']) if (c['x'], c['y'], c['t']) not in old]
        cm = [c for c in await find_ctrls(pg, ['−', '-', '－', '縮小', '小さく']) if (c['x'], c['y'], c['t']) not in old]
        plus = cp[-1] if cp else None; minus = cm[-1] if cm else None
        msg = []
        if not plus or not minus: return False, f'見せる範囲の「−」「＋」がない（＋={plus} −={minus}）'
        await pg.mouse.click(plus['x'], plus['y']); await pg.wait_for_timeout(300)
        cs1 = await pg.evaluate(f"{P}.cropState('F_p0')"); z1 = cs1['view']['zoom'] if cs1 else None
        await pg.mouse.click(minus['x'], minus['y']); await pg.wait_for_timeout(300)
        cs2 = await pg.evaluate(f"{P}.cropState('F_p0')"); z2 = cs2['view']['zoom'] if cs2 else None
        c1 = z1 is not None and z1 > z0 + 0.005 and z2 is not None and z2 < z1 - 0.005
        msg.append(f'拡大 {r1(z0)}→＋ {r1(z1)}→− {r1(z2)}')
        # もう一度＋で拡大した状態でスクロールする（決めて終える道で拡大が残るかを見るため）
        if cs2: await pg.mouse.click(plus['x'], plus['y']); await pg.wait_for_timeout(300)
        cs3 = await pg.evaluate(f"{P}.cropState('F_p0')"); z3 = cs3['view']['zoom'] if cs3 else None
        a = await pg.evaluate(OVL12); y0 = await pg.evaluate('scrollY')
        await pg.mouse.move(30, 500); await pg.mouse.wheel(0, 200); await pg.wait_for_timeout(600)
        y1 = await pg.evaluate('scrollY'); b = await pg.evaluate(OVL12)
        if abs(y1 - y0) < 50: return False, f'準備失敗：ホイールでページがスクロールしない（scrollY {y0}→{y1}）'
        still = await pg.evaluate(f"{P}.cropState('F_p0')")
        if still and b['vis']:
            before = {k['k']: k for k in a['kids']}; bad = []
            for k in b['kids']:
                o = before.get(k['k'])
                if o and (abs(k['dx'] - o['dx']) > 2 or abs(k['dy'] - o['dy']) > 2): bad.append(f"{k['k']}({r1(k['dy'] - o['dy'])})")
            c2 = bool(b['kids']) and not bad
            msg.append(f'スクロール {y0}→{y1}: 見せる範囲のまま・重ね描きのずれ {bad}')
        else:
            ph = [x for x in await pg.evaluate(f"{P}.photos()") if x.get('part') == 'F_p0']
            zk = ph[0]['view']['zoom'] if ph else None
            c2 = (not b['vis'] or not b['kids']) and z3 is not None and zk is not None and abs(zk - z3) < 0.01
            msg.append(f'スクロール {y0}→{y1}: 見せる範囲が終わった・重ね描き {"残る" if b["vis"] and b["kids"] else "消えた"}・拡大 {r1(z3)}→写真 {r1(zk)}')
        return c1 and c2, ' / '.join(msg)
    finally: await pg.context.close()

# ---- F13
# 作業票: 写真を外す・戻すの後、帯がその時の状態に作り直される
# 再現: F_p0 を右クリック→帯の「写真を外す」→（帯を見る）→帯の「…戻す」→（帯を見る）。
# 合格: 外した後の帯が出ていて「戻す」（写真を戻す）があり「外す」「見せる範囲」が無い。
#       戻した後の帯が出ていて「外す」があり「写真を戻す」が無い。
# 準備の確かめ: 右クリックで帯が出て「外す」があること。押した後に写真が本当に外れた（photos の cleared）・戻ったこと。
async def t_F13(br, url):
    pg = await fresh(br, url)
    try:
        await scrollto(pg, 'F_p0'); r = await vb(pg, 'F_p0')
        await pg.mouse.click(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2 + 60, button='right'); await pg.wait_for_timeout(400)
        bd = await band(pg)
        if not (bd and bd['vis']): return False, '準備失敗：F_p0 の右クリックで帯が出ない'
        rm = [b for b in bd['btns'] if '外す' in b['t']]
        if not rm: return False, f'準備失敗：帯に「写真を外す」が無い {[b["t"] for b in bd["btns"]]}'
        await pg.mouse.click((rm[0]['x'] + rm[0]['r']) / 2, (rm[0]['y'] + rm[0]['b']) / 2); await pg.wait_for_timeout(500)
        cl = [x['cleared'] for x in await pg.evaluate(f"{P}.photos()") if x.get('part') == 'F_p0']
        if not cl or not cl[0]: return False, '準備失敗：「写真を外す」を押しても外れない'
        b1 = await band(pg); t1 = [b['t'] for b in b1['btns']] if b1 and b1['vis'] else None
        g1 = t1 is not None and any('戻す' in t and '元の位置' not in t for t in t1) and not any('外す' in t or '見せる範囲' in t for t in t1)
        back = [b for b in (b1['btns'] if b1 and b1['vis'] else []) if '戻す' in b['t'] and '元の位置' not in b['t']]
        if not back:   # 帯が古いまま・消えたときは、右クリックで帯を出し直して戻す（準備）
            r = await vb(pg, 'F_p0'); await pg.mouse.click(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2 + 60, button='right'); await pg.wait_for_timeout(400)
            bb = await band(pg); back = [b for b in (bb['btns'] if bb and bb['vis'] else []) if '戻す' in b['t'] and '元の位置' not in b['t']]
        if not back: return False, f'準備失敗：外した写真を戻すボタンが無い（外した後の帯 {t1}）'
        await pg.mouse.click((back[0]['x'] + back[0]['r']) / 2, (back[0]['y'] + back[0]['b']) / 2); await pg.wait_for_timeout(500)
        cl = [x['cleared'] for x in await pg.evaluate(f"{P}.photos()") if x.get('part') == 'F_p0']
        if not cl or cl[0]: return False, '準備失敗：「写真を戻す」を押しても戻らない'
        b2 = await band(pg); t2 = [b['t'] for b in b2['btns']] if b2 and b2['vis'] else None
        g2 = t2 is not None and any('外す' in t for t in t2) and not any('写真を戻す' in t for t in t2)
        return g1 and g2, f'外した後の帯 {t1} / 戻した後の帯 {t2}'
    finally: await pg.context.close()

# ---- F15
# 作業票: Cmd+D を重ねても、複製の書体・大きさは元と同じ
# 再現: F_h0（見出し：明朝 24px 太字）を選び MOD+d を3回（毎回、新しくできた複製が選ばれた状態で押す）。
# 合格: できた3つの複製の文字の書体・大きさ・太さ（文字の要素の computed style）が F_h0 と同じ。
# 準備の確かめ: MOD+d のたびに部品が1つ増え、その部品が選ばれること。
STY = "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const t=[...e.querySelectorAll('*')].find(x=>[...x.childNodes].some(n=>n.nodeType==3&&n.textContent.trim()))||e;const c=getComputedStyle(t);return [c.fontFamily,c.fontSize,c.fontWeight]}"
async def t_F15(br, url):
    pg = await fresh(br, url)
    try:
        await click(pg, 'F_h0', 40, 10)
        if await sel(pg) != ['F_h0']: return False, f'準備失敗：F_h0 を選べない {await sel(pg)}'
        base = await pg.evaluate(STY, 'F_h0'); got = []; bad = []
        for k in range(3):
            i0 = set(await ids(pg))
            await pg.keyboard.press(f'{MOD}+d'); await pg.wait_for_timeout(600)
            new = [i for i in await ids(pg) if i not in i0]; s = await sel(pg)
            if len(new) != 1 or s != new: return False, f'準備失敗：MOD+d {k + 1}回目で複製が1つ増えて選ばれない（増えた {new} 選択 {s}）'
            st = await pg.evaluate(STY, new[0]); got.append(st)
            if st != base: bad.append(f'{k + 1}回目 {new[0]}={st[0][:18]} {st[1]} {st[2]}')
        return not bad, f'元 {base[0][:18]} {base[1]} {base[2]} / 違う複製 {bad}'
    finally: await pg.context.close()

# ---- F16
# 作業票: 別のセクションに貼ったら、貼ったものが見える所までスクロール
# 再現: F_h0 を選んで MOD+c → おすすめの品（items）の見出しの右の空いた所をクリック（セクションを選ぶ）→ MOD+v。
# 合格: 貼った部品の高さの半分以上が、画面（上の並びの下端〜窓の下端）の中に見えている。
# 準備の確かめ: 貼った部品が1つ増え、別のセクション（items）に入ったこと。
async def t_F16(br, url):
    pg = await fresh(br, url)
    try:
        await click(pg, 'F_h0', 40, 10)
        if await sel(pg) != ['F_h0']: return False, '準備失敗：F_h0 を選べない'
        await pg.keyboard.press(f'{MOD}+c'); await pg.wait_for_timeout(200)
        await scrollto(pg, 'I_hg'); h = await vb(pg, 'I_hg')
        await pg.mouse.click(1300, h['b'] + 30); await pg.wait_for_timeout(400)
        i0 = set(await ids(pg))
        await pg.keyboard.press(f'{MOD}+v'); await pg.wait_for_timeout(1000)
        new = [i for i in await ids(pg) if i not in i0]
        if len(new) != 1: return False, f'準備失敗：貼っても部品が1つ増えない {new}'
        sec = await pg.evaluate(f"{P}.secOf('{new[0]}')")
        if sec == 'feature': return False, f'準備失敗：元と同じセクションに貼られた（{sec}）'
        r = await vb(pg, new[0]); vh = await pg.evaluate('innerHeight')
        tb = await pg.evaluate("(()=>{const t=document.getElementById('toolbar');return t?t.getBoundingClientRect().bottom:0})()")
        seen = max(0, min(r['b'], vh) - max(r['y'], tb))
        ok = r['h'] > 0 and seen >= r['h'] / 2
        return ok, f'貼った {new[0]}（{sec}）画面 y={r1(r["y"])}..{r1(r["b"])}（見える範囲 {r1(tb)}..{vh}）scrollY={await pg.evaluate("scrollY")}'
    finally: await pg.context.close()

# ---- F17
# 作業票: 帯は部品に付いてスクロールする（画面の外に出たら隠す）
# 再現: F_h0 を右クリックして帯を出す→ホイールで 200px スクロール→さらに 1500px スクロール（F_h0 が画面の上へ出る）。
# 合格: 200px のとき帯が見えていて、帯と F_h0 の縦の間が前と 4px 以内で同じ。1500px のとき帯が見えない（隠れている）。
# 準備の確かめ: 右クリックで帯が出ること、ホイールでページが本当にスクロールし、F_h0 が画面の外に出たこと。
async def t_F17(br, url):
    pg = await fresh(br, url)
    try:
        r = await click(pg, 'F_h0', 40, 12, button='right'); r = await vb(pg, 'F_h0'); b0 = await band(pg)
        if not (b0 and b0['vis']): return False, '準備失敗：F_h0 の右クリックで帯が出ない'
        d0 = b0['y'] - r['y']; y0 = await pg.evaluate('scrollY')
        await pg.mouse.move(30, 600); await pg.mouse.wheel(0, 200); await pg.wait_for_timeout(500)
        y1 = await pg.evaluate('scrollY'); r1_ = await vb(pg, 'F_h0'); b1 = await band(pg)
        if abs(y1 - y0) < 100: return False, f'準備失敗：ホイールでスクロールしない {y0}→{y1}'
        d1 = (b1['y'] - r1_['y']) if b1 and b1['vis'] else None
        g1 = d1 is not None and abs(d1 - d0) <= 4
        await pg.mouse.wheel(0, 1500); await pg.wait_for_timeout(500)
        r2 = await vb(pg, 'F_h0'); b2 = await band(pg)
        if r2 and r2['b'] > 0: return False, f'準備失敗：F_h0 が画面の外に出ない（y={r1(r2["y"])}）'
        g2 = not (b2 and b2['vis'])
        return g1 and g2, (f'帯と部品の縦の間 {r1(d0)}→200px 後 {r1(d1)}・部品が画面の外に出たとき帯 '
                           f'{"見える y=" + str(r1(b2["y"])) if b2 and b2["vis"] else "隠れた"}')
    finally: await pg.context.close()

# ---- F63
# 作業票: ドラッグの後に頼んでいない帯を出さない
# 再現: F_h0 をクリックで選ぶ（帯が出ていないことを確かめる）→ そのまま (60,30) ドラッグして離す。
# 合格: 離した後に帯が見えていない。
# 準備の確かめ: クリックで選んだ時点では帯が出ていないこと、ドラッグで F_h0 が本当に動いたこと。
async def t_F63(br, url):
    pg = await fresh(br, url)
    try:
        r = await click(pg, 'F_h0', 40, 12); r = await vb(pg, 'F_h0')
        if await sel(pg) != ['F_h0']: return False, '準備失敗：F_h0 を選べない'
        b0 = await band(pg)
        if b0 and b0['vis']: return False, '準備失敗：クリックで選んだだけで帯が出ている（ドラッグの後かどうか判定できない）'
        a = (r['x'] + 40, r['y'] + 12)
        await pg.mouse.move(*a); await pg.mouse.down(); await pg.mouse.move(a[0] + 60, a[1] + 30, steps=12); await pg.mouse.up(); await pg.wait_for_timeout(600)
        r2 = await vb(pg, 'F_h0')
        if abs(r2['x'] - r['x']) < 20: return False, f'準備失敗：ドラッグで F_h0 が動かない x {r1(r["x"])}→{r1(r2["x"])}'
        b1 = await band(pg)
        shown = bool(b1 and b1['vis'])
        return not shown, f'ドラッグ後 帯 {"出た " + str([b["t"] for b in b1["btns"]]) if shown else "出ない"}'
    finally: await pg.context.close()

# ---- F18
# 作業票: 帯のボタンの文字は折らない（入らない分は「その他」にまとめる）。押せないボタンは出さない（→ P26 を優先：灰色で出す）
# 再現: 窓の幅 1440・1024・800 で、F_p0・F_h0 を右クリックして帯を出す。品の名前（card_name_c_jonama）は選んで帯を出す
#       （選ぶだけで出なければ右クリック）。
# 合格: どの帯でも、見えているボタンの文字が1行（Range の行の数＝1）で、押せないボタンは disabled（または aria-disabled）で灰色に見える（P26）。
# 準備の確かめ: それぞれで帯が出たこと。
async def t_F18(br, url):
    bad = []; seen = 0
    for w in (1440, 1024, 800):
        for id in ('F_p0', 'F_h0', 'card_name_c_jonama'):
            pg = await fresh(br, url, w=w)
            try:
                if id.startswith('card_'):
                    await selitem(pg, id); bd = await band(pg)
                    if not (bd and bd['vis']):
                        r = await vb(pg, id); await pg.mouse.click(r['x'] + 10, r['y'] + 8, button='right'); await pg.wait_for_timeout(400); bd = await band(pg)
                else:
                    await scrollto(pg, id); r = await vb(pg, id)
                    dx, dy = (r['w'] / 2, r['h'] / 2 + 60) if id == 'F_p0' else (40, 12)
                    await pg.mouse.click(r['x'] + dx, r['y'] + dy, button='right'); await pg.wait_for_timeout(400); bd = await band(pg)
                if not (bd and bd['vis']): return False, f'準備失敗：幅 {w} の {id} で帯が出ない'
                seen += 1
                # P26 に合わせて条件を変えた（まとめ役の決め：P26＝押せないものは消さずに灰色で出す。PowerPoint と同じ）：
                # 前は「押せない（disabled）ボタンが見えていない」。今は「押せないボタンは disabled（または aria-disabled）で、灰色に見える」
                # （灰色＝透明度が 0.95 未満。#fmenu の押せないボタンは透明度 .4／.55 で出す）。文字が折れない条件はそのまま
                # 前は「押せるボタンと文字の色が違う」でも通していたが、灰色でなくても通るので外した（DECISIONS #10）
                for b in bd['btns']:
                    if b['lines'] > 1: bad.append(f'{w}:{id[:6]}「{b["t"]}」{b["lines"]}行')
                    if b['dis'] and not (b['op'] < 0.95): bad.append(f'{w}:{id[:6]}「{b["t"]}」押せないのに灰色でない')
            finally: await pg.context.close()
    return not bad, f'帯 {seen} 個を見た・問題 {len(bad)}：' + '、'.join(bad[:8])

# ---- F19
# 作業票: どの窓の幅でもページが横にはみ出さない
# 再現: 窓の幅 1440・1280・1024・800（高さ 1000）で開き、横のホイール（300px）を回す。
# 合格: どの幅でも document の scrollWidth（html・body の大きい方）が窓の幅（clientWidth と innerWidth の小さい方）を
#       超えず、横のホイールの後も scrollX が 0。
# 準備の確かめ: ページが読み込まれて部品があること。
async def t_F19(br, url):
    msg = []; ok = True
    for w in (1440, 1280, 1024, 800):
        pg = await fresh(br, url, w=w)
        try:
            if not await ids(pg): return False, f'準備失敗：幅 {w} で部品が無い'
            m = await pg.evaluate("[Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),Math.min(document.documentElement.clientWidth,innerWidth)]")
            await pg.mouse.move(w / 2, 500); await pg.mouse.wheel(300, 0); await pg.wait_for_timeout(300)
            sx = await pg.evaluate('scrollX')
            good = m[0] <= m[1] and sx == 0; ok &= good
            msg.append(f'{w}: scrollWidth {m[0]} / 窓 {m[1]} 横ホイール後 scrollX {sx}')
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

# ---- F20
# 作業票: 部品にマウスを乗せたら、動かせることが分かるカーソルと細い枠（PowerPoint と同じく選ぶ前の手がかり）
# 再現: 何も選んでいない状態で、F_h0・F_b0・F_p0・F_h1 の上にマウスを乗せる（外から動かして入る）。
# 合格: どの部品でも (1) マウスの下の要素の cursor が move・grab・grabbing・pointer・all-scroll のどれか（text の I字は不可）、(2) 乗せる前には無かった枠が出る
#       （部品やその ::before/::after の outline・box-shadow・border、または部品の矩形に ±8px で重なる枠の要素）。
# 準備の確かめ: 乗せた所の要素が本当にその部品の中であること、乗せる前に何も選ばれていないこと。
FRAMES = r"""(id=>{const p=document.querySelector('[data-el="'+id+'"]'); if(!p) return null; const P=p.getBoundingClientRect(); const out=[];
  const deco=(c)=>{const o=c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0; const s=c.boxShadow&&c.boxShadow!=='none';
    const b=['Top','Right','Bottom','Left'].some(k=>c['border'+k+'Style']!=='none'&&parseFloat(c['border'+k+'Width'])>0&&!/rgba\(.*,\s*0\)$/.test(c['border'+k+'Color'])); return (o?'o:'+c.outlineColor+c.outlineWidth:'')+(s?'s:'+c.boxShadow.slice(0,30):'')+(b?'b:'+c.borderTopColor:'')};
  for(const [el,ps] of [[p,null],[p,'::before'],[p,'::after']]){ const c=getComputedStyle(el,ps); if(ps&&(c.content==='none'||c.content==='normal')) continue; const d=deco(c); if(d) out.push('part'+(ps||'')+':'+d); }
  for(const e of document.querySelectorAll('body *')){ if(e===p) continue; const r=e.getBoundingClientRect(); if(r.width<10||r.height<10) continue;
    if(Math.abs(r.left-P.left)>8||Math.abs(r.top-P.top)>8||Math.abs(r.right-P.right)>8||Math.abs(r.bottom-P.bottom)>8) continue;
    const c=getComputedStyle(e); if(c.display==='none'||c.visibility==='hidden'||parseFloat(c.opacity)<0.05) continue; const d=deco(c); if(d) out.push((e.id||e.className||e.tagName).toString().slice(0,20)+':'+d); }
  return out})"""
async def t_F20(br, url):
    msg = []; ok = True
    for id in ('F_h0', 'F_b0', 'F_p0', 'F_h1'):
        pg = await fresh(br, url)
        try:
            await scrollto(pg, id); r = await vb(pg, id)
            if await sel(pg): return False, f'準備失敗：乗せる前に選ばれている {await sel(pg)}'
            pt = (r['x'] + min(40, r['w'] / 2), r['y'] + min(12, r['h'] / 2)) if id != 'F_p0' else (r['x'] + r['w'] / 2, r['y'] + r['h'] / 2 + 60)
            await pg.mouse.move(20, 500); await pg.wait_for_timeout(200)
            f0 = set(await pg.evaluate(FRAMES, id))
            await pg.mouse.move(pt[0] - 30, pt[1], steps=3); await pg.mouse.move(*pt, steps=5); await pg.wait_for_timeout(400)
            hit = await pg.evaluate("([x,y,id])=>{const e=document.elementFromPoint(x,y);if(!e)return null;const p=document.querySelector('[data-el=\"'+id+'\"]');return {inside:p.contains(e)||e.contains(p)&&false,cursor:getComputedStyle(e).cursor,tag:e.tagName}}", [pt[0], pt[1], id])
            if not hit or not hit['inside']:
                return False, f'準備失敗：{id} の上にマウスを乗せられない（マウスの下 {hit}）'
            f1 = [x for x in await pg.evaluate(FRAMES, id) if x not in f0]
            good = hit['cursor'] in ('move', 'grab', 'grabbing', 'pointer', 'all-scroll') and bool(f1); ok &= good
            msg.append(f'{id}: cursor={hit["cursor"]} 枠={f1[:2]}')
        finally: await pg.context.close()
    return ok, ' / '.join(msg)

ITEMS = [('F2', t_F2), ('F3', t_F3), ('F4', t_F4), ('F5', t_F5), ('F6', t_F6), ('F7', t_F7), ('F8', t_F8), ('F9', t_F9),
         ('F12', t_F12), ('F13', t_F13), ('F15', t_F15), ('F16', t_F16), ('F17', t_F17), ('F63', t_F63), ('F18', t_F18),
         ('F19', t_F19), ('F20', t_F20)]

async def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    url = Path(sys.argv[1]).resolve().as_uri()
    want = [a.upper() for a in sys.argv[2:]]
    todo = [(k, f) for k, f in ITEMS if not want or k in want]
    unknown = [w for w in want if w not in dict(ITEMS)]
    if unknown: print('知らない ID:', unknown)
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
