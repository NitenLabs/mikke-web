# -*- coding: utf-8 -*-
"""回帰の確認：文字・日本語入力（area = text）

使い方: python3 verify_audit_text.py /path/to/playgroundNN_single.html [ID ...]
  ID を並べるとその項目だけ（例: J1 J43）。省略で全部。
出力: 1項目1行 `OK J1 | 説明` / `NG J1 | 実際の値`。最後に `合計 OK x / NG y`。終了コード＝NG の数。

判定の決まり（TESTBRIEF.md）
- 問題は本物のマウス・キーボード（日本語の変換は CDP の Input.imeSetComposition / insertText と
  keyCode 229 の keydown）で起こす。window.__playground は状態を読むのにだけ使う。
- 期待は「事故が起きないこと」で書く。直し方が1つに決まらないものは、合格の道を複数受け付ける。
- Cmd は MOD で送る（Mac は Meta、ほかは Control）。ただしブラウザ本来の貼り付け（J2）は
  Mac では Meta+V でしか起きないので、その確認だけは Mac なら Meta を使う。
- 項目ごとに browser context を作り直す（IndexedDB・localStorage が項目どうしで混ざらないように）。
- 共通の部品（audit_common.py）は他の担当と同時に作られるため、このファイルは自分の中だけで完結させた。
"""
import re, asyncio, json, os, sys, time, traceback
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
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
OUT = 1420, 990          # 何もない所（右下の余白）。ここをクリックすると書き換えが終わる
IS_MAC = sys.platform == 'darwin'

# ---------------------------------------------------------------- 共通の小道具
async def fresh(br, url, w=1440, h=1000, perms=None):
    ctx = await br.new_context(viewport={'width': w, 'height': h}, permissions=perms or [])
    await nofonts(ctx)
    pg = await ctx.new_page(); pg._e = []; pg._dlg = []
    pg.on('pageerror', lambda e: pg._e.append('PE ' + str(e)))
    pg.on('dialog', lambda d: (pg._dlg.append(d.type + ' ' + d.message), asyncio.ensure_future(d.dismiss())))
    await pg.goto(url); await pg.wait_for_timeout(1500)
    return pg

async def vb(pg, id):
    return await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}", id)

async def scrollto(pg, id):
    await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(e)e.scrollIntoView({block:'center'})}", id)
    await pg.wait_for_timeout(250)

async def click(pg, id, dx=40, dy=12, n=1):
    await scrollto(pg, id); r = await vb(pg, id)
    await pg.mouse.click(r['x'] + min(dx, max(1, r['w'] - 2)), r['y'] + min(dy, max(1, r['h'] / 2)), click_count=n)
    await pg.wait_for_timeout(350); return r

async def dbl(pg, id, dx=60, dy=12):
    await scrollto(pg, id); r = await vb(pg, id)
    await pg.mouse.dblclick(r['x'] + min(dx, max(1, r['w'] - 2)), r['y'] + min(dy, max(1, r['h'] / 2)))
    await pg.wait_for_timeout(450); return r

async def out(pg):
    await pg.mouse.click(*OUT); await pg.wait_for_timeout(450)

def text(pg, id):
    return pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');return e?e.innerText:null}", id)

def runs(pg, id):
    return pg.evaluate(f"{P}.textRuns('{id}')")

def ops(pg):
    return pg.evaluate(f"{P}.ops()")

async def editing(pg):
    return await pg.evaluate(f"{P}.editingId()")

async def selrange(pg, word, n=None):
    """書き換え中の要素の中で word を選ぶ（範囲の準備。マウスで正確に語を選ぶのは難しいので JS で範囲を置く）"""
    return await pg.evaluate("""([w,n])=>{const el=document.activeElement;const t=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let x,pos=0,nodes=[];while(x=t.nextNode()){nodes.push([x,pos]);pos+=x.nodeValue.length}
      const txt=nodes.map(a=>a[0].nodeValue).join('');const i=txt.indexOf(w);if(i<0)return 'nf';const j=i+(n??w.length);const r=document.createRange();
      for(const [nd,p] of nodes){if(i>=p&&i<=p+nd.nodeValue.length){r.setStart(nd,i-p);break}}for(const [nd,p] of nodes){if(j>=p&&j<=p+nd.nodeValue.length){r.setEnd(nd,j-p);break}}
      const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));return s.toString()}""", [word, n])

async def tbtn(pg, title):
    await pg.locator(f'button[title="{title}"]:visible').first.click(); await pg.wait_for_timeout(300)

async def notices(pg):
    """ページの知らせ（#pgToast.on・role=status/alert・.toast・開いている確認の箱）と confirm/alert の箱"""
    v = await pg.evaluate("""(()=>{const out=[];const vis=e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!='hidden'&&cs.display!='none'&&cs.opacity!='0'};
      for(const e of document.querySelectorAll('#pgToast,[role=status],[role=alert],[aria-live],.toast,.pg-toast,[class*=toast],#publishBox.on,[role=dialog],dialog[open]'))
        if(vis(e)&&e.innerText.trim()) out.push(e.innerText.trim().slice(0,80));
      return out})()""")
    return v + pg._dlg

# 日本語の変換（audit/r2_ime/ime.py と同じ送り方）
async def _cdp(pg):
    if not hasattr(pg, '_cdp'): pg._cdp = await pg.context.new_cdp_session(pg)
    return pg._cdp
async def comp(pg, t):
    c = await _cdp(pg); await c.send('Input.imeSetComposition', {'text': t, 'selectionStart': len(t), 'selectionEnd': len(t)}); await pg.wait_for_timeout(80)
async def commit(pg, t):
    c = await _cdp(pg); await c.send('Input.insertText', {'text': t}); await pg.wait_for_timeout(150)
async def k229(pg, key='Process'):
    """変換中のキー（isComposing・keyCode 229）。Mac の「変換を決める Enter」はこれになる"""
    c = await _cdp(pg)
    for typ in ('rawKeyDown', 'keyUp'):
        await c.send('Input.dispatchKeyEvent', {'type': typ, 'windowsVirtualKeyCode': 229, 'key': key, 'modifiers': 0})
    await pg.wait_for_timeout(80)

# ---------------------------------------------------------------- 項目
TESTS = {}
def item(id, desc):
    def deco(f): TESTS[id] = (desc, f); return f
    return deco

# J1 書き換えを終えると改行・半角スペースが表示から消える（データには残る）
# 合格: 本文の末尾に Enter → 半角スペース2つ → 「テスト」、文中に「A  B」と打って外をクリックした後も、
#       表示（innerText。&nbsp; は半角スペースと見なす）に改行と2つ続きの半角スペースが残っている。
@item('J1', '書き換えを終えても改行・続く半角スペースが表示に残る')
async def t_J1(br, url):
    pg = await fresh(br, url)
    await dbl(pg, 'F_b0'); await caret_end(pg)
    await pg.keyboard.press('Enter'); await pg.keyboard.type('  テスト'); await pg.keyboard.type('A  B')
    await pg.wait_for_timeout(200)
    during = (await text(pg, 'F_b0')).replace(' ', ' ')
    await out(pg)
    after = (await text(pg, 'F_b0')).replace(' ', ' ')
    ok = '\n  テスト' in after and 'A  B' in after
    return ok, f'書き換え中 {during[-14:]!r} → 終えた後 {after[-14:]!r}'

# J2 書き換え中の Cmd+V が今のクリップボードを貼らない
# 合格: 一度ページに paste が届いて古い文字（__lastPlain）が残った後、クリップボードを「新しいコピー」にして
#       本物のキー Cmd+V（Mac は Meta+V、ほかは Control+V）を押す →
#   (a) この環境のブラウザが本物のキーで貼れる（別ページの textarea で確かめる）なら、本文に「新しいコピー」が入り、
#       古い文字は増えない。
#   (b) 本物のキーで貼れない環境（headless の一部）なら、keydown がページで preventDefault されていない
#       （＝ブラウザ本来の paste に任せている）ことと、古い文字を勝手に入れないことで判定する。
#   試験台28 は keydown を preventDefault し、window.__lastPlain（前の貼り付け）を差し込むので NG。
@item('J2', '書き換え中の Cmd+V が今のクリップボードを貼る（前の貼り付けを使わない）')
async def t_J2(br, url):
    perms = ['clipboard-read', 'clipboard-write']
    pg = await fresh(br, url, perms=perms)
    key = 'Meta+v' if IS_MAC else f'{MOD}+v'
    # この環境で本物のキーが貼り付けになるか（ページのキー処理のない別ページで）
    os.makedirs(os.path.join(HERE, '_work'), exist_ok=True)
    blank = os.path.join(HERE, '_work', 'text_blank.html')
    with open(blank, 'w') as fh: fh.write('<!doctype html><textarea id=t></textarea>')
    sp = await pg.context.new_page(); await sp.goto('file://' + blank)   # file:// なら navigator.clipboard が使える
    await sp.evaluate("navigator.clipboard.writeText('SANITY')"); await sp.click('#t'); await sp.keyboard.press(key); await sp.wait_for_timeout(200)
    native = (await sp.evaluate("t.value")) == 'SANITY'; await sp.close()
    await pg.bring_to_front()
    # 古い貼り付け：ページに ClipboardEvent('paste') を届ける（よそからの貼り付けの経路）
    await dbl(pg, 'F_b0'); await caret_end(pg)
    await pg.evaluate("t=>{const d=new DataTransfer();d.setData('text/plain',t);document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}))}", '古い貼付')
    await pg.wait_for_timeout(200)
    t0 = await text(pg, 'F_b0'); n_old0 = t0.count('古い貼付')
    await pg.evaluate("navigator.clipboard.writeText('新しいコピー')")
    # ページのキー処理の後で defaultPrevented を読む（window の bubble に後から足す＝ページの処理の後に呼ばれる）
    await pg.evaluate("window.__kdv=[];addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v')__kdv.push(e.defaultPrevented)})")
    await pg.keyboard.press(key); await pg.wait_for_timeout(300)
    t1 = await text(pg, 'F_b0'); prevented = await pg.evaluate("__kdv")
    stale = t1.count('古い貼付') > n_old0
    if native:
        ok = '新しいコピー' in t1 and not stale
    else:
        ok = (prevented == [False]) and not stale
    return ok, f'本物のキーで貼れる環境={native} keydown の preventDefault={prevented} 古い文字を入れた={stale} 新しいコピーが入った={"新しいコピー" in t1}'

# J3 書き換え中の語のダブルクリックで固まり打鍵が捨てられる
# 合格: 書き換え中に本文の語をダブルクリックしてから「CD」と打つと、その「CD」が本文に入る
#       （語が置き換わっても、カーソルの所に入ってもよい。捨てられなければよい）。
@item('J3', '書き換え中に語をダブルクリックしても、続けて打った文字が入る')
async def t_J3(br, url):
    pg = await fresh(br, url)
    r = await dbl(pg, 'F_b0', 100)
    await pg.keyboard.type('AB'); await pg.wait_for_timeout(150)
    await pg.mouse.dblclick(r['x'] + 100, r['y'] + 12); await pg.wait_for_timeout(400)
    ce = await pg.evaluate("document.querySelector('[data-el=F_b0]').getAttribute('contenteditable')")
    await pg.keyboard.type('CD'); await pg.wait_for_timeout(200)
    t = await text(pg, 'F_b0'); ed = await editing(pg)
    await out(pg); t2 = await text(pg, 'F_b0')
    ok = 'CD' in t and 'CD' in t2
    return ok, f'2回目のダブルクリック後 contenteditable={ce} editing={ed} CD が入った={"CD" in t}（終えた後 {"CD" in t2}）'

# J4 Cmd+I/U が（書き換え中だけ効いて）終えると消える
# 合格（作業票29 §5.1：PowerPoint にそろえて斜体と下線を入れる）: 「季節の」を選んで Cmd+I・Cmd+U →
#       書き換え中・終えた後・読み込み直し後のすべてで、その文字が斜体・下線になっている。
#       （以前は「はじめから効かない」も合格にしていたが、Mac で Ctrl+I が空振りして合格になったので外した）
@item('J4', 'Cmd+I/U で斜体・下線が付き、書き換えを終えても読み込み直しても残る')
async def t_J4(br, url):
    res = []; okall = True
    for k, css in ((f'{MOD}+i', "getComputedStyle(x).fontStyle==='italic'"), (f'{MOD}+u', "getComputedStyle(x).textDecorationLine.includes('underline')")):
        pg = await fresh(br, url)
        js = "(sel)=>{const e=document.querySelector('[data-el=F_b0]');return [...e.querySelectorAll('*')].some(x=>x.textContent.includes('季')&&(" + css + "))}"
        await dbl(pg, 'F_b0'); await selrange(pg, '季節の'); await pg.keyboard.press(k); await pg.wait_for_timeout(300)
        during = await pg.evaluate(js, None)
        await out(pg); after = await pg.evaluate(js, None)
        await pg.reload(); await pg.wait_for_timeout(1500); reload = await pg.evaluate(js, None)
        ok = bool(during and after and reload); okall &= ok
        res.append(f'{k}: 書き換え中={during} 終えた後={after} 読み込み直し={reload}')
        await pg.context.close()
    return okall, ' / '.join(res)

# J5 書き換え中 Tab で＋へ（フォーカスが「＋」に移る）
# 合格: 書き換え中に Tab を押してから「XY」と打つと、その「XY」が本文に入る
#       （PowerPoint は Tab で字下げ・タブ文字。フォーカスが書き換えの外へ逃げて打鍵が捨てられなければよい）。
@item('J5', '書き換え中の Tab でフォーカスが外へ逃げず、続けて打った文字が入る')
async def t_J5(br, url):
    pg = await fresh(br, url)
    await dbl(pg, 'F_b0'); await caret_end(pg); await pg.keyboard.press('Tab'); await pg.wait_for_timeout(200)
    foc = await pg.evaluate("(()=>{const a=document.activeElement;return (a.dataset&&a.dataset.el)||(a.tagName+'.'+a.className+' '+(a.textContent||'').trim().slice(0,10))})()")
    await pg.keyboard.type('XY'); await pg.wait_for_timeout(250)
    t = await text(pg, 'F_b0')
    ok = 'XY' in t
    return ok, f'Tab の後のフォーカス={foc!r} XY が本文に入った={ok}'

# J6 大きさ欄で Backspace→部品が消える
# 合格: 箱を選んで上の大きさ欄の数字を Backspace・Delete で消しても、部品（F_b0）が残り、del の記録もない。
@item('J6', '大きさ欄で Backspace/Delete を押しても部品が消えない')
async def t_J6(br, url):
    pg = await fresh(br, url)
    await click(pg, 'F_b0')
    inp = pg.locator('[data-ts=size]:visible').first
    await inp.click(); await pg.keyboard.press('End')
    await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Delete'); await pg.wait_for_timeout(300)
    exists = await vb(pg, 'F_b0') is not None
    dels = [o for o in await ops(pg) if o.get('t') == 'del']
    ok = exists and not dels
    val = await pg.evaluate("(document.querySelector('[data-ts=size]')||{}).value")
    return ok, f'F_b0 が残る={exists} del の記録={len(dels)} 欄の値={val!r}'

# J7 大きさ欄で ←→ → 部品が動く
# 合格: 大きさ欄の中で ← ← → Shift+← を押しても、選んでいる箱の位置が変わらない（移動の記録もない）。
@item('J7', '大きさ欄の中の矢印キーで部品が動かない')
async def t_J7(br, url):
    pg = await fresh(br, url)
    r0 = await click(pg, 'F_b0'); n0 = len(await ops(pg))
    inp = pg.locator('[data-ts=size]:visible').first
    await inp.click(); await pg.keyboard.press('End')
    for k in ['ArrowLeft', 'ArrowLeft', 'ArrowRight', 'Shift+ArrowLeft']:
        await pg.keyboard.press(k); await pg.wait_for_timeout(120)
    r1 = await vb(pg, 'F_b0'); n1 = len(await ops(pg))
    moved = abs(r1['x'] - r0['x']) > 0.5 or abs(r1['y'] - r0['y']) > 0.5
    ok = not moved and n1 == n0
    return ok, f'x {r0["x"]:.1f}→{r1["x"]:.1f} y {r0["y"]:.1f}→{r1["y"]:.1f} 記録 {n0}→{n1}'

# J9 カーソルだけで B・A+ → 前の範囲に効く
# 合格: 「練り切り」をドラッグで選んで太字にし、別の所をクリックしてカーソルだけにしてから
#       Cmd+B／B ボタン／大きくボタン → 続けて「今日」と打つ。
#       「練り切り」が文に残り（前の範囲が選び直されて置き換わらない）、太字のまま・大きさも変わらない。
@item('J9', 'カーソルだけの B・Cmd+B・A+ が前に選んだ範囲に効かない')
async def t_J9(br, url):
    res = []; okall = True
    for tool in (f'{MOD}+b', 'B', 'A+'):
        pg = await fresh(br, url)
        r = await dbl(pg, 'F_b0', 100)
        await pg.mouse.move(r['x'] + 2, r['y'] + 12); await pg.mouse.down(); await pg.mouse.move(r['x'] + 60, r['y'] + 12, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
        picked = await pg.evaluate("getSelection().toString()")
        await tbtn(pg, '太字')
        await pg.mouse.click(r['x'] + r['w'] - 30, r['y'] + r['h'] - 12); await pg.wait_for_timeout(250)
        before = [x for x in await runs(pg, 'F_b0') if picked and picked in x.get('text', '')]
        if tool == f'{MOD}+b': await pg.keyboard.press(f'{MOD}+b')
        elif tool == 'B': await tbtn(pg, '太字')
        else: await tbtn(pg, '大きく')
        await pg.wait_for_timeout(200)
        await pg.keyboard.type('今日'); await pg.wait_for_timeout(200)
        t = await text(pg, 'F_b0'); await out(pg)
        rr = await runs(pg, 'F_b0'); after = [x for x in rr if picked and picked in x.get('text', '')]
        kept = bool(picked) and picked in t and '今日' in t
        style_same = bool(after) and bool(before) and after[0].get('bold') == before[0].get('bold') and after[0].get('scale') == before[0].get('scale')
        ok = kept and style_same; okall &= ok
        res.append(f'{tool}: 「{picked}」が残る={kept} 書式が同じ={style_same} 文={t[:16]!r}')
        await pg.context.close()
    return okall, ' / '.join(res)

# J10 文字を全部消すと高さ0で戻せない
# 合格: 見出し F_h0 の文字を全部消して外をクリックした後、次のどれか。
#   (a) 箱に 8px 以上の高さがあり、ダブルクリックで書き換えに入って打った文字が入る
#   (b) 空のまま終わらせず、文字が元に戻る（または残る）
#   (c) 箱がなくなるなら知らせが出て、Cmd+Z 1回で元の文字が戻る
@item('J10', '文字を全部消しても箱を見つけて書き直せる（または知らせ・戻せる）')
async def t_J10(br, url):
    pg = await fresh(br, url)
    orig = await text(pg, 'F_h0')
    await dbl(pg, 'F_h0', 60, 20); await pg.keyboard.press(f'{MOD}+a'); await pg.keyboard.press('Delete')
    left = await active_text(pg)
    if left is None or left.strip():
        raise PrepFail(f'準備失敗：全選択→Delete で見出しが空にならない（残り {left!r}）')
    await out(pg)
    r = await vb(pg, 'F_h0'); t = await text(pg, 'F_h0'); nt = await notices(pg)
    if r is None:
        await pg.keyboard.press('Escape'); await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(400)
        back = await text(pg, 'F_h0')
        ok = bool(nt) and back == orig
        return ok, f'(c) 箱がない 知らせ={nt} 戻す1回で={back!r}'
    if t and t.strip():
        return True, f'(b) 空にした後、終えると文字が戻る 文字={t!r}'
    if r['h'] < 8:
        return False, f'空の箱の高さ {r["h"]:.1f}px（幅 {r["w"]:.0f}） 知らせ={nt}'
    await pg.mouse.dblclick(r['x'] + min(20, r['w'] / 2), r['y'] + r['h'] / 2); await pg.wait_for_timeout(400)
    await pg.keyboard.type('新見出し'); await pg.wait_for_timeout(200)
    t2 = await text(pg, 'F_h0')
    ok = '新見出し' in (t2 or '')
    return ok, f'(a) 高さ {r["h"]:.1f}px ダブルクリックで打てた={ok}'

# J33 ラベルの変換確定 Enter でひらがなのラベル
# 合格: お品書きのページで品を選び「ラベル ▾」→「＋ 新しいラベル」に「きせつ」を変換中のまま Enter（229）→「季節」で確定
#       → 「きせつ」というラベルが作られていない。
@item('J33', 'ラベルの名前の変換を決める Enter で、ひらがなのラベルができない')
async def t_J33(br, url):
    pg = await fresh(br, url)
    # 準備（ページの切り替え）だけ API。品を選ぶ・ボタンを押すのは本物のクリック
    await pg.evaluate(f"{P}.setPage('pg_menu')"); await pg.wait_for_timeout(800)
    rid = await pg.evaluate("(()=>{const e=document.querySelector('[data-el$=\"row_name_plc_warabi_t\"]');return e?e.dataset.el:null})()")
    await click(pg, rid, 20, 8)
    if rid not in (await pg.evaluate(f"{P}.selected()")): await click(pg, rid, 20, 8)
    lab = pg.locator('#tLabels:visible')
    if await lab.count(): await lab.first.click()
    else: await pg.locator('button:visible', has_text='ラベル').first.click()
    await pg.wait_for_timeout(400)
    await pg.locator('[data-label-add]').first.click(); await pg.wait_for_timeout(300)
    for s in ('き', 'きせ', 'きせつ'): await comp(pg, s)
    await k229(pg, 'Enter'); await pg.wait_for_timeout(300)
    await commit(pg, '季節'); await pg.wait_for_timeout(400)
    labels = await pg.evaluate(f"JSON.stringify({P}.itemCtx('{rid}').labels.map(l=>l.name))")
    allnames = json.loads(labels)
    ok = 'きせつ' not in allnames
    return ok, f'ラベル一覧 {allnames}'

# J34 大きさ欄の全角数字
# 合格: 見出しを選び、大きさ欄に日本語入力で「２０」を確定して Enter →
#   (a) 大きさが 20 になる、または (b) 大きさは変わらないが欄の表示が今の大きさに戻る（変わったように見えない）。
@item('J34', '大きさ欄に全角の「２０」を打つと 20 になる（または欄が元に戻る）')
async def t_J34(br, url):
    pg = await fresh(br, url)
    async def sz(): return [s for s in await pg.evaluate(f"{P}.textStyles('F_h0')") if s['part'] == 'F_h0'][0]['size']
    await click(pg, 'F_h0', 30, 10); s0 = await sz()
    inp = pg.locator('[data-ts=size]:visible').first
    await inp.click(); await pg.keyboard.press(f'{MOD}+a')
    await comp(pg, '２'); await comp(pg, '２０'); await commit(pg, '２０'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
    s1 = await sz(); shown = await pg.evaluate("(document.querySelector('[data-ts=size]')||{}).value")
    ok = s1 == 20 or (s1 == s0 and str(shown).strip() == str(s0))
    return ok, f'大きさ {s0}→{s1} 欄の表示 {shown!r}'

# J43 値段の名前欄で日本語の確定順が逆になる（お茶→茶お）
# 合格: 品の値段の箱を開き、名前欄で「お」「茶」「付き」を順に変換確定 → 欄の値が「お茶付き」。
@item('J43', '値段の名前欄で日本語の確定が打った順に入る')
async def t_J43(br, url):
    pg = await fresh(br, url)
    id = 'card_price_c_dora'
    await click(pg, id, 20, 8)
    if id not in (await pg.evaluate(f"{P}.selected()")): await click(pg, id, 20, 8)
    await click(pg, id, 20, 8, n=2); await pg.wait_for_timeout(300)
    if not await pg.evaluate("!!document.getElementById('priceBox')"):
        await dbl(pg, id, 20, 8)
    nm = pg.locator('#priceBox .pb-name').first
    await nm.click(); await pg.keyboard.press(f'{MOD}+a'); await pg.keyboard.press('Delete')
    if (await nm.input_value()) != '':
        raise PrepFail(f'準備失敗：名前欄を空にできない（{await nm.input_value()!r}）')
    for reading, kanji in (('お', 'お'), ('ちゃ', '茶'), ('つき', '付き')):
        s = ''
        for ch in reading: s += ch; await comp(pg, s)
        await commit(pg, kanji)
    v = await nm.input_value()
    ok = v == 'お茶付き'
    return ok, f'名前欄の値 {v!r}'

# 書き換え→外→戻す の準備（J47・J48）
async def pre_text_undo(pg):
    await dbl(pg, 'F_b0'); await pg.keyboard.press('End'); await pg.keyboard.type('X'); await out(pg)
    await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(600)

# J47 書き換え→外→戻す の直後のダブルクリックで書き換えに見えるが打鍵が捨てられる
# 合格: 上の準備の直後に F_b0 をダブルクリック → End → 「あY」と打つと、本文に「あY」が入る。
@item('J47', '書き換えを戻した直後のダブルクリックで、打った文字が入る')
async def t_J47(br, url):
    pg = await fresh(br, url)
    await pre_text_undo(pg)
    await dbl(pg, 'F_b0')
    ce = await pg.evaluate("document.querySelector('[data-el=F_b0]').getAttribute('contenteditable')")
    await pg.keyboard.press('End'); await pg.keyboard.type('あY'); await pg.wait_for_timeout(250)
    t = await text(pg, 'F_b0'); ed = await editing(pg)
    ok = 'あY' in t
    return ok, f'editing={ed} contenteditable={ce} 本文末尾={t[-6:]!r}'

# J48 その状態で一部の書式（書体・太字・色・大きく）が箱全体に効く
# 合格: 上の準備の直後にダブルクリックし、「季節の」を選んで 太字／大きく を押す →
#       箱全体の太さ・大きさ（textStyles）は変わらない（変わるのは選んだ所だけ）。
@item('J48', '書き換えを戻した直後でも、一部の太字・大きくが箱全体に効かない')
async def t_J48(br, url):
    res = []; okall = True
    for tool in ('太字', '大きく'):
        pg = await fresh(br, url)
        async def st(): return [s for s in await pg.evaluate(f"{P}.textStyles('F_b0')") if s['part'] == 'F_b0'][0]
        s0 = await st()
        await pre_text_undo(pg)
        await dbl(pg, 'F_b0'); await selrange(pg, '季節の'); await tbtn(pg, tool); await out(pg)
        s1 = await st(); rr = await runs(pg, 'F_b0')
        whole = s1['weight'] != s0['weight'] or s1['size'] != s0['size']
        part = any('季節の' in x.get('text', '') and (x.get('bold') or x.get('scale')) for x in rr)
        ok = not whole; okall &= ok
        res.append(f'{tool}: 箱全体 太さ {s0["weight"]}→{s1["weight"]} 大きさ {s0["size"]}→{s1["size"]} 選んだ所だけに付いた={part}')
        await pg.context.close()
    return okall, ' / '.join(res)

# J49 書き換え中に「公開」を押すと打った文字が消え変な記録が残る
# 合格: 見出しを書き換え中に「途中」と打って上の「公開」を押し、外をクリックした後、
#   共通: 見出しに「途中」が残っていて、「途中」を消す記録（最後の edit が「途中」を含まない）がない。
#   (a) 公開した版が増えたなら、その版の見出しにも「途中」が入っている（viewVersion で読む）。
#   (b) 公開を止めた（版が増えない）なら、知らせ（確認の箱・トースト等）が出ている。
@item('J49', '書き換え中に「公開」を押しても打った文字が消えない（公開に入る、または止めて知らせる）')
async def t_J49(br, url):
    pg = await fresh(br, url)
    pubs0 = [v['id'] for v in await pg.evaluate(f"{P}.versions()") if v['kind'] == 'published']
    await dbl(pg, 'F_h0', 60, 20); await pg.keyboard.press('End'); await pg.keyboard.type('途中'); await pg.wait_for_timeout(200)
    await pg.evaluate('scrollTo(0,0)'); await pg.locator('#tPublish').click(); await pg.wait_for_timeout(1200)
    nt = await notices(pg)
    pubs1 = [v['id'] for v in await pg.evaluate(f"{P}.versions()") if v['kind'] == 'published']
    new = [v for v in pubs1 if v not in pubs0]
    await pg.keyboard.press('Escape'); await out(pg); await pg.wait_for_timeout(300)
    t = await text(pg, 'F_h0')
    edits = [o for o in await ops(pg) if o.get('t') == 'edit' and o.get('id') == 'F_h0']
    def optext(o): return o.get('text') if isinstance(o.get('text'), str) else ''.join(r.get('text', '') for r in (o.get('runs') or []))
    last = optext(edits[-1]) if edits else ''
    keep = '途中' in (t or '') and (not edits or '途中' in last)
    if new:
        pubtext = None
        try:
            await pg.evaluate(f"{P}.viewVersion('{new[-1]}')"); await pg.wait_for_timeout(500)
            pubtext = await text(pg, 'F_h0'); await pg.evaluate(f"{P}.exitView()")
        except Exception as e: pubtext = 'ERR ' + str(e)[:60]
        ok = keep and '途中' in (pubtext or '')
        return ok, f'(公開した) 画面の見出し={t!r} 公開した版の見出し={pubtext!r} edit の記録={[optext(o)[-8:] for o in edits]}'
    ok = keep and bool(nt)
    return ok, f'(公開しない) 画面の見出し={t!r} 知らせ={nt} edit の記録={[optext(o)[-8:] for o in edits]}'

# ---------------------------------------------------------------- 実行
async def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    path = os.path.abspath(sys.argv[1]); url = 'file://' + path
    want = sys.argv[2:] or list(TESTS)
    bad = [w for w in want if w not in TESTS]
    if bad: print('知らない ID:', bad); sys.exit(2)
    nok = nng = 0; t0 = time.time()
    async with async_playwright() as p:
        br = await p.chromium.launch()
        for id in want:
            desc, f = TESTS[id]
            try:
                ok, detail = await asyncio.wait_for(f(br, url), timeout=90)
            except Exception as e:
                ok, detail = False, '例外 ' + (str(e).splitlines() or [repr(e)])[0][:200]
            for c in list(br.contexts):
                try: await c.close()
                except Exception: pass
            if ok: nok += 1; print(f'OK {id} | {desc} | {detail}', flush=True)
            else: nng += 1; print(f'NG {id} | {detail}', flush=True)
        await br.close()
    print(f'合計 OK {nok} / NG {nng}（{time.time() - t0:.0f} 秒）')
    sys.exit(nng)

if __name__ == '__main__':
    asyncio.run(main())
