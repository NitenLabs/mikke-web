# -*- coding: utf-8 -*-
"""回帰の確認：品・お品書き・お店の情報・セクション・履歴・プレビュー・公開（area = page）

使い方: python3 verify_audit_page.py /path/to/playgroundNN_single.html [ID ...]
  ID を並べるとその項目だけ（例: J14 J53）。省略で全部。
出力: 1項目1行 `OK J14 | 説明` / `NG J14 | 実際の値`。最後に `合計 OK x / NG y`。終了コード＝NG の数。
環境変数 AUDIT_JOBS（既定 3）：同時に走らせる項目の数。1 にすると1つずつ（遅いが資源が少ない）。

判定の決まり（TESTBRIEF.md）
- 問題は本物のマウス・キーボードで起こす。window.__playground は状態を読むのと、準備（ページを移す
  setPage など）にだけ使う。
- 期待は「事故が起きないこと」で書く。直し方が1つに決まらないものは合格の道を複数受け付ける。
- 「知らせなしに消える」系：消えなければ合格。消えるなら知らせが出れば合格。
  知らせ＝ページの知らせの要素（今の試験台では #pgToast.pg-toast.on。ほかに role=status/alert/
  alertdialog・aria-live・.toast・class に toast を含むもの・開いた dialog/role=dialog）か、
  confirm/alert の箱。上の並び（#toolbar）の中の文字（保存の状態など）は知らせに数えない。
  知らせは数秒で消えるので、ページに入れた見張り（80ms ごと）が出た文字を記録する。
- 「公開の確認に出ない」系：publishCheck() の結果に、その部品についての項目が1つ以上あること。
- Cmd は MOD で送る（Mac は Meta、ほかは Control。Mac の Chrome では Ctrl+A などが別の意味になるため）。
- 項目ごとに browser context を作り直す（IndexedDB が項目どうしで混ざらないように）。
- 共通の部品（audit_common.py）は他の担当と同時に作られるため、このファイルは自分の中だけで完結させた。
"""
import re, asyncio, json, os, sys, time, traceback, pathlib
from urllib.parse import unquote
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
OUT = (1420, 990)   # 何もない所（右下の余白）

# ---------------------------------------------------------------- 知らせの見張り（ページに入れる）
NOTICE_WATCH = r"""
(()=>{ window.__auditNotices=[]; const seen=new Map();
  const SEL='#pgToast,.pg-toast,[role=status],[role=alert],[role=alertdialog],[aria-live],.toast,[class*=toast],[id*=toast],[id*=Toast],[role=dialog],dialog[open]';
  setInterval(()=>{ try{
    for(const e of document.querySelectorAll(SEL)){
      if(e.id==='publishToast') continue;                 // 「公開しました」は消える知らせでない
      if(e.closest && e.closest('#toolbar')) continue;    // 保存の状態などは知らせに数えない
      const cs=getComputedStyle(e), r=e.getBoundingClientRect(), t=(e.innerText||'').trim();
      const vis=r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.05&&t;
      if(vis){ if(seen.get(e)!==t){ seen.set(e,t); window.__auditNotices.push(t.slice(0,120)); } } else seen.delete(e);
    } }catch(_){} },80);
})();
"""

# ---------------------------------------------------------------- 共通の小道具
async def fresh(br, url, w=1440, h=1000, **kw):
    ctx = await br.new_context(viewport={'width': w, 'height': h}, **kw)
    await nofonts(ctx)
    await ctx.add_init_script(NOTICE_WATCH)
    pg = await ctx.new_page(); pg._e = []; pg._dlg = []
    pg.on('pageerror', lambda e: pg._e.append('PE ' + str(e)))
    pg.on('dialog', lambda d: (pg._dlg.append(d.type + ' ' + d.message), asyncio.ensure_future(d.dismiss())))
    await pg.goto(url); await pg.wait_for_timeout(1600)
    return pg

def ev(pg, js, *a): return pg.evaluate(js, *a)

async def bb(pg, id):
    return await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,ay:r.y+scrollY}}", id)

async def cssbb(pg, css):
    return await pg.evaluate("c=>{const e=[...document.querySelectorAll(c)].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}", css)

async def scrollto(pg, id):
    await pg.evaluate("s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');if(e)e.scrollIntoView({block:'center'})}", id)
    await pg.wait_for_timeout(250)

async def click(pg, id, dx=None, dy=None, n=1, button='left', scroll=True):
    if scroll: await scrollto(pg, id)
    r = await bb(pg, id)
    if not r: raise RuntimeError('部品が無い: ' + id)
    x = r['x'] + (dx if dx is not None else min(40, r['w'] / 2)); y = r['y'] + (dy if dy is not None else min(12, r['h'] / 2))
    await pg.mouse.click(x, y, click_count=n, button=button); await pg.wait_for_timeout(350)
    return r

async def clickcss(pg, css, wait=350):
    r = await cssbb(pg, css)
    if not r: raise RuntimeError('見つからない: ' + css)
    await pg.mouse.click(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2); await pg.wait_for_timeout(wait)

async def clicktext(pg, root_css, text, exact=True, wait=450):
    """root の中の見えているボタンを文字で探して本物のクリック"""
    r = await pg.evaluate("""([root,t,ex])=>{const R=document.querySelector(root)||document;const e=[...R.querySelectorAll('button,a,[role=button],[role=menuitem]')].find(b=>{const q=b.getBoundingClientRect();const s=b.textContent.trim();return q.width>0&&q.height>0&&getComputedStyle(b).visibility!=='hidden'&&(ex?s===t:s.includes(t))});if(!e)return null;const q=e.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2,!!e.disabled]}""", [root_css, text, exact])
    if not r: raise RuntimeError(f'ボタンが無い: {root_css} 「{text}」')
    await pg.mouse.click(r[0], r[1]); await pg.wait_for_timeout(wait)
    return r

async def selitem(pg, id):
    """品（カード・行）を選ぶ。カードは1回目で並び、2回目で品になる"""
    await click(pg, id)
    if id not in await ev(pg, f"{P}.selected()"): await click(pg, id, scroll=False)
    if id not in await ev(pg, f"{P}.selected()"): raise RuntimeError('選べない: ' + id + ' sel=' + str(await ev(pg, f"{P}.selected()")))

async def esc2(pg):
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250)

async def gopage(pg, pid):   # 準備：ページを移す（API）
    await ev(pg, f"{P}.setPage('{pid}')"); await pg.wait_for_timeout(700)

async def clear_notices(pg):
    await ev(pg, "window.__auditNotices&&(window.__auditNotices.length=0)"); pg._dlg.clear()

async def notices(pg):
    await pg.wait_for_timeout(250)
    return (await ev(pg, "window.__auditNotices||[]")) + ['[箱] ' + d for d in pg._dlg]

async def cards(pg):
    return await ev(pg, "[...document.querySelectorAll('[data-el^=\"card_name_\"]')].map(e=>e.dataset.el.replace('card_name_c_',''))")

async def table_rows(pg):
    return await ev(pg, "[...document.querySelectorAll('[data-el^=\"row_name_\"]')].map(e=>e.innerText.trim())")

async def menu_rows(pg):
    return await ev(pg, "[...document.querySelectorAll('[data-el^=\"menu__row_name\"]')].map(e=>e.innerText.trim())")

async def ops_len(pg): return len(await ev(pg, f"{P}.ops()"))

async def preview_on(pg):
    """上の並びの「プレビュー」を本物のクリックで押す（無ければ その他 の中）"""
    await ev(pg, "scrollTo(0,0)"); await pg.wait_for_timeout(150)
    if await cssbb(pg, '#tPreview'): await clickcss(pg, '#tPreview', 700)
    else:
        await clicktext(pg, '#toolbar', 'その他', exact=False); await clicktext(pg, 'body', 'プレビュー', exact=False, wait=700)
    if not await ev(pg, f"{P}.previewMode()"): raise RuntimeError('プレビューに入れない')

async def preview_off(pg):
    if await cssbb(pg, '[data-pv-back]'): await clickcss(pg, '[data-pv-back]', 500)
    else: await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)

async def pop(pg, tool):   # 品の道具（販売・出す月・ラベル・メニュー）を開く
    await clickcss(pg, '#t' + tool, 400)

async def text_edit(pg, id, txt):
    """ダブルクリックで書き換え→全部選んで置き換え→Esc で終える"""
    await click(pg, id, n=2); await pg.wait_for_timeout(200)
    if await ev(pg, f"{P}.editingId()") is None:
        await click(pg, id, n=2, scroll=False)
    await pg.keyboard.press(f'{MOD}+a')
    if txt == '': await pg.keyboard.press('Delete')
    else: await pg.keyboard.insert_text(txt)
    now = await active_text(pg)
    if now is None or now.strip() != txt:
        raise PrepFail(f'準備失敗：{id} を {txt!r} に書き換えられない（今 {now!r}）')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)

def has_any(lst): return bool([x for x in lst if x])

# ================================================================ 項目
# 各項目は (pg を作る関数) を受け取り (ok: bool, 説明: str) を返す

# J14 品の並び全体が知らせなしに消える
# 合格: 並びの部品の右クリック→「消す」の後、品が残っている。消えるなら知らせ（または確認の箱）が出る
async def t_J14(new):
    pg = await new()
    await scrollto(pg, 'card_photo_c_warabi'); n0 = len(await cards(pg))
    await click(pg, 'card_photo_c_warabi', dx=50, dy=50, button='right', scroll=False)
    await clear_notices(pg)
    b = await cssbb(pg, '#fmenu')
    try: await clicktext(pg, '#fmenu', '消す', exact=False, wait=700)
    except RuntimeError: return True, '並び全体を消すボタンが無い（消せない）'
    n1 = len(await cards(pg)); nt = await notices(pg)
    if n1 >= n0: return True, f'品が残る（{n0}→{n1}）'
    if nt: return True, f'品 {n0}→{n1} だが知らせが出た: {nt[0]}'
    return False, f'品 {n0}→{n1}、知らせなし'

# J15 品の並び全体のコピーで見えない空の部品
# 合格: 並び（1回クリックで選ぶ）を Cmd+C→Cmd+V した後、新しくできた部品に「大きさ0」や「空の文字の箱」が無い
async def t_J15(new):
    pg = await new()
    await scrollto(pg, 'card_name_c_jonama')
    await click(pg, 'card_name_c_jonama', scroll=False)
    sel = await ev(pg, f"{P}.selected()")
    before = set(await ev(pg, "[...document.querySelectorAll('[data-el]')].map(e=>e.dataset.el)"))
    await pg.keyboard.press(f'{MOD}+c'); await pg.keyboard.press(f'{MOD}+v'); await pg.wait_for_timeout(900)
    info = await ev(pg, "(b)=>[...document.querySelectorAll('[data-el]')].filter(e=>!b.includes(e.dataset.el)).map(e=>{const r=e.getBoundingClientRect();return [e.dataset.el,Math.round(r.width),Math.round(r.height),e.dataset.kind||'',(e.innerText||'').trim().length]})", list(before))
    bad = [i for i in info if i[1] < 2 or i[2] < 2 or (i[3] == 'text' and i[4] == 0)]
    if bad: return False, f'選択 {sel} を貼ると見えない/空の部品: {bad[:4]}'
    return True, f'貼り付けでできた部品 {len(info)} 個はすべて見える'

# J19 お品書きのページで値段を直せない・読み込み直すと戻る
# 合格: お品書きのページで値段を 500 に直せて、読み込み直しても 500 のまま
async def t_J19(new):
    pg = await new(); await gopage(pg, 'pg_menu')
    pid = 'menu__row_price_plc_warabi_t'
    await scrollto(pg, pid); r = await bb(pg, pid)
    x, y = r['x'] + r['w'] - 60, r['y'] + 8
    route = ''
    await pg.mouse.click(x, y); await pg.wait_for_timeout(300); await pg.mouse.dblclick(x, y); await pg.wait_for_timeout(500)
    if await cssbb(pg, '#priceBox .pb-amt'):
        route = '値段の箱'
        await clickcss(pg, '#priceBox .pb-amt', 200); await pg.keyboard.press(f'{MOD}+a'); await pg.keyboard.type('500')
        try: await clicktext(pg, '#priceBox', '決める', wait=500)
        except RuntimeError: await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
    elif await ev(pg, f"{P}.editingId()") == pid:
        route = 'ダブルクリック'
        await pg.keyboard.press(f'{MOD}+a'); await pg.keyboard.type('500円'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
    else:
        await esc2(pg); await pg.mouse.click(x, y, button='right'); await pg.wait_for_timeout(400)
        await clicktext(pg, '#fmenu', '書き換える', exact=False, wait=500); route = '右クリック→書き換える'
        if await cssbb(pg, '#priceBox .pb-amt'):
            await clickcss(pg, '#priceBox .pb-amt', 200); await pg.keyboard.press(f'{MOD}+a'); await pg.keyboard.type('500')
            await clicktext(pg, '#priceBox', '決める', wait=500)
        else:
            await pg.keyboard.press(f'{MOD}+a'); await pg.keyboard.type('500円'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
    await esc2(pg)
    shown = await ev(pg, "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');return e?e.innerText:null}", pid)
    await pg.wait_for_timeout(2500); await pg.reload(); await pg.wait_for_timeout(1800); await gopage(pg, 'pg_menu')
    after = await ev(pg, "s=>{const e=document.querySelector('[data-el=\"'+s+'\"]');return e?e.innerText:null}", pid)
    ok = bool(shown and '500' in shown and after and '500' in after)
    return ok, f'{route}: 直後「{shown}」→ 読み込み直し「{after}」'

# J20 履歴の板が「この版を下書きにする」を隠す
# 合格: 履歴で前の版を見ているとき「この版を下書きにする」の真ん中が他の物に隠されず、本物のクリックで戻せる
async def t_J20(new):
    pg = await new()
    y_init = (await bb(pg, 'F_h0'))['ay']
    await click(pg, 'F_h0'); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(1300); await pg.keyboard.press('Escape')
    y_chg = (await bb(pg, 'F_h0'))['ay']
    if await cssbb(pg, '#tHistory'): await clickcss(pg, '#tHistory', 500)
    else: await clicktext(pg, '#toolbar', 'その他', exact=False); await clicktext(pg, 'body', '履歴', exact=False, wait=500)
    await pg.get_by_text('最初の形', exact=True).click(); await pg.wait_for_timeout(700)
    go = await pg.evaluate("""(()=>{const e=document.querySelector('[data-hv-go]')||[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.includes('下書きにする'));if(!e)return null;const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const t=document.elementFromPoint(x,y);return {x,y,top:!!t&&(t===e||e.contains(t)),hit:t?(t.id||t.className||t.tagName):null}})()""")
    if not go: return False, '「この版を下書きにする」が見つからない'
    await pg.mouse.click(go['x'], go['y']); await pg.wait_for_timeout(900)
    viewing = await ev(pg, f"{P}.viewingVersion()")
    y_after = (await bb(pg, 'F_h0'))['ay']
    restored = (not viewing) and abs(y_after - y_init) < abs(y_after - y_chg)
    ok = go['top'] and restored
    return ok, f"ボタンの真ん中の一番上={go['hit']}（ボタン自身={go['top']}）、クリック後 見ている版={viewing}、F_h0 y 最初{y_init:.0f}/動かした{y_chg:.0f}/後{y_after:.0f}"

# J21 制作用の試験ボタンが書き換えを消す
# 合格: 店主が普通に使う画面（上の並び・その他）から試験ボタンに届かない、または押しても店主の手直しが消えない
async def t_J21(new):
    pg = await new()
    await text_edit(pg, 'F_h0', '季節の上生菓子テスト'); await esc2(pg); await pg.wait_for_timeout(1500)
    before = await ev(pg, "document.querySelector('[data-el=\"F_h0\"]').innerText")
    found = None
    if await ev(pg, "!![...document.querySelectorAll('#toolbar button')].find(b=>b.offsetParent&&b.textContent.includes('制作用'))"):
        await clicktext(pg, '#toolbar', '制作用', exact=False, wait=500); found = '上の並び'
    else:
        try:
            await clicktext(pg, '#toolbar', 'その他', exact=False)
            await clicktext(pg, 'body', '制作用', exact=False, wait=500); found = 'その他'
        except RuntimeError: pass
    if not found: return True, '普通の画面から「制作用」に届かない'
    q = await ev(pg, "(()=>{const b=[...document.querySelectorAll('#studio button, [id*=studio] button')].find(b=>b.offsetParent&&/^[A-Z]\\d+$/.test(b.textContent.trim()));if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();const t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return [r.x+r.width/2,r.y+r.height/2,b.textContent.trim(),!!t&&(t===b||b.contains(t))]})()")
    if q and not q[3]: return True, f'「制作用」（{found}）の試験ボタン {q[2]} は他の物に隠れて押せない'
    if not q: return True, f'「制作用」（{found}）は開くが試験ボタンが無い'
    await pg.mouse.click(q[0], q[1]); await pg.wait_for_timeout(1300)
    after = await ev(pg, "(()=>{const e=document.querySelector('[data-el=\"F_h0\"]');return e?e.innerText:null})()")
    ok = bool(after and 'テスト' in after)
    return ok, f'「制作用」（{found}）の {q[2]} を押す: 見出し「{before}」→「{after}」'

# J22 お品書き本体の削除で全品が知らせなしに消える
# 合格: お品書き本体の右クリック→削除 の後、品の行が残る。消えるなら知らせ（または確認の箱）が出る
async def t_J22(new):
    pg = await new(); await gopage(pg, 'pg_menu')
    await ev(pg, "document.getElementById('host_menu').scrollIntoView({block:'start'})"); await pg.wait_for_timeout(300)
    n0 = len(await menu_rows(pg))
    h = await cssbb(pg, '#host_menu')
    await pg.mouse.click(30, h['y'] + 300, button='right'); await pg.wait_for_timeout(400)
    await clear_notices(pg)
    if not await cssbb(pg, '[data-sec-menu="削除"]'):
        try: await clicktext(pg, 'body', '削除', exact=True, wait=700)
        except RuntimeError: return True, '本体を消すボタンが無い'
    else: await clickcss(pg, '[data-sec-menu="削除"]', 700)
    n1 = len(await menu_rows(pg)); nt = await notices(pg)
    if n1 >= n0: return True, f'行が残る（{n0}→{n1}）'
    if nt: return True, f'行 {n0}→{n1} だが知らせ: {nt[0]}'
    return False, f'行 {n0}→{n1}、知らせなし'

# J35 トップの品の「出す月」で1月を押すと即決まり、品が知らせなしに消える
# 合格: 「出す月」で今月でない月を1つ押した後、品が並びに残る。消えるなら知らせが出る
async def t_J35(new):
    pg = await new()
    month = await ev(pg, "new Date().getMonth()+1"); m = 1 if month != 1 else 7
    await selitem(pg, 'card_name_c_warabi'); await pop(pg, 'Month'); await clear_notices(pg)
    await clickcss(pg, f'#monthPop [data-month="{m}"]', 600)
    c = await cards(pg); nt = await notices(pg)
    if 'warabi' in c: return True, f'{m}月を押しても わらび餅 は残る {c}'
    if nt: return True, f'消えたが知らせ: {nt[0]}'
    return False, f'{m}月を押すと並び {c}（わらび餅が消える）、知らせなし'

# J36 販売を休む・ラベル「おすすめ」を外すとトップの品が知らせなしに消える
# 合格: (a)どら焼きを「販売▾→休む」 (b)わらび餅のラベル「おすすめ」を外す、のどちらも品が残るか知らせが出る
async def t_J36(new):
    pg = await new(); res = []
    await selitem(pg, 'card_name_c_dora'); await pop(pg, 'Sell'); await clear_notices(pg)
    await clickcss(pg, '#sellPop [data-sell-opt="paused"]', 600)
    c = await cards(pg); nt = await notices(pg); okA = ('dora' in c) or bool(nt)
    res.append(f"休む→{c} 知らせ{nt[:1]}")
    await esc2(pg)
    await selitem(pg, 'card_name_c_warabi'); await pop(pg, 'Labels'); await clear_notices(pg)
    await clickcss(pg, '#labelPop [data-label-opt="lbl_recommended"]', 600)
    c = await cards(pg); nt = await notices(pg); okB = ('warabi' in c) or bool(nt)
    res.append(f"おすすめを外す→{c} 知らせ{nt[:1]}")
    return okA and okB, ' / '.join(res)

# J37 お品書きで別の品におすすめを付けるとトップの品が知らせなしに押し出される
# 合格: お品書きのページで芦屋最中に「おすすめ」を付けた後、トップの元の3品が残る。押し出すなら知らせが出る
async def t_J37(new):
    pg = await new(); c0 = await cards(pg)
    await gopage(pg, 'pg_menu')
    await selitem(pg, 'menu__row_name_plc_monaka_t'); await pop(pg, 'Labels'); await clear_notices(pg)
    await clickcss(pg, '#labelPop [data-label-opt="lbl_recommended"]', 600)
    nt = await notices(pg); await esc2(pg)
    await gopage(pg, 'pg_home'); c1 = await cards(pg)
    lost = [x for x in c0 if x not in c1]
    if not lost: return True, f'元の品は残る {c0}→{c1}'
    if nt: return True, f'{lost} が押し出されたが知らせ: {nt[0]}'
    return False, f'トップ {c0}→{c1}（{lost} が押し出される）、知らせなし'

# J38 メニュー▾で甘味処を外すと表の行が知らせなしに消える
# 合格: わらび餅の「メニュー▾」で甘味処を外した後、表（甘味処）の行が残るか、知らせが出る
async def t_J38(new):
    pg = await new(); r0 = await table_rows(pg)
    await selitem(pg, 'card_name_c_warabi'); await pop(pg, 'Menus'); await clear_notices(pg)
    await clickcss(pg, '#menuPop [data-menu-opt="mnu_kanmi"]', 600)
    r1 = await table_rows(pg); nt = await notices(pg)
    if any('わらび' in x for x in r1): return True, f'表の行が残る {r1}'
    if nt: return True, f'行が消えたが知らせ: {nt[0]}'
    return False, f'表 {r0}→{r1}、知らせなし'

# J39 甘味処の行を店頭販売の括りへドラッグすると2行並び値段が混ざり表から消える
# 合格: 甘味処のわらび餅を店頭販売（焼き菓子の芦屋最中の上）へドラッグした後、
#       (1) 同じメニューに同じ品が2行並ばない (2) 表（甘味処）からわらび餅が消えない、または消えるなら知らせが出る
async def t_J39(new):
    pg = await new(); await gopage(pg, 'pg_menu')
    await scrollto(pg, 'menu__row_name_plc_warabi_k'); await ev(pg, "scrollBy(0,-350)"); await pg.wait_for_timeout(300)
    a = await bb(pg, 'menu__row_name_plc_warabi_k'); b = await bb(pg, 'menu__row_name_plc_monaka_t')
    await clear_notices(pg)
    await pg.mouse.move(a['x'] + 20, a['y'] + a['h'] / 2); await pg.mouse.down()
    await pg.mouse.move(b['x'] + 20, b['y'] + b['h'] / 2 - 20, steps=15); await pg.mouse.up(); await pg.wait_for_timeout(700)
    nt = await notices(pg)
    groups = await ev(pg, "(()=>{const g={};for(const r of document.querySelectorAll('.krow[data-plc]')){const m=r.dataset.menu||'?';const n=(r.querySelector('[data-el*=\"row_name\"]')||r).innerText.trim();(g[m]=g[m]||[]).push(n)}return g})()")
    dup = {m: [n for n in set(v) if v.count(n) > 1] for m, v in groups.items()}
    dup = {m: v for m, v in dup.items() if v}
    await gopage(pg, 'pg_home'); r1 = await table_rows(pg)
    tbl_ok = any('わらび' in x for x in r1) or bool(nt)
    ok = (not dup) and tbl_ok
    return ok, f'同じメニューに重なる品 {dup or "なし"}、トップの表 {r1}、知らせ {nt[:1]}'

# J40 品のない括りの見出しがプレビュー・公開に出る
# 合格: 括りを足して（品なし）プレビューにしたとき、その括りの見出しが見えない
async def t_J40(new):
    pg = await new(); await gopage(pg, 'pg_menu')
    before = set(await ev(pg, "[...document.querySelectorAll('[data-el*=\"__mc_\"]')].map(e=>e.dataset.el)"))
    await click(pg, 'menu__mc_cat_yakigashi', button='right')
    await clicktext(pg, '#fmenu', '括りを足す', exact=False, wait=600)
    await esc2(pg)
    newc = [x for x in await ev(pg, "[...document.querySelectorAll('[data-el*=\"__mc_\"]')].map(e=>e.dataset.el)") if x not in before]
    if not newc: return False, '括りを足せなかった（試せない）'
    await preview_on(pg)
    vis = await ev(pg, "ids=>ids.filter(i=>{const e=document.querySelector('[data-el=\"'+i+'\"]');if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&e.innerText.trim()})", newc)
    return (not vis), f'足した括り {newc}、プレビューで見える見出し {vis}'

# J41 名前・値段のない新しい品が公開の確認に出ず空の行が出る
# 合格: 「品を足す…→新しい品を作る」で作り名前を空にしたとき、
#       publishCheck() にその品の（写真以外の）項目がある、またはプレビューに空の品・空の行が出ない
async def t_J41(new):
    pg = await new()
    await gopage(pg, 'pg_menu'); rows0 = set(await ev(pg, "[...document.querySelectorAll('[data-el]')].map(e=>e.dataset.el)")); await gopage(pg, 'pg_home')
    home0 = set(await ev(pg, "[...document.querySelectorAll('[data-el]')].map(e=>e.dataset.el)"))
    await selitem(pg, 'card_name_c_dora')
    await clicktext(pg, '#fmenu', '品を足す', exact=False, wait=500)
    await clicktext(pg, '#pickerBox', '新しい品', exact=False, wait=400)
    await clicktext(pg, '#pickerBox', '焼き菓子', exact=False, wait=700)
    await pg.keyboard.press(f'{MOD}+a'); await pg.keyboard.press('Backspace')
    left = await active_text(pg)
    if left is None or left.strip():
        raise PrepFail(f'準備失敗：新しい品の名前を空にできない（残り {left!r}）')
    await esc2(pg); await pg.wait_for_timeout(400)
    newh = [x for x in await ev(pg, "[...document.querySelectorAll('[data-el]')].map(e=>e.dataset.el)") if x not in home0]
    await gopage(pg, 'pg_menu')
    newm = [x for x in await ev(pg, "[...document.querySelectorAll('[data-el]')].map(e=>e.dataset.el)") if x not in rows0]
    await gopage(pg, 'pg_home')
    newids = set(newh + newm)
    chk = await ev(pg, f"{P}.publishCheck()")
    rel = [i for i in chk if i.get('kind') != 'emptyPhoto' and any(p in newids or any(p.endswith(n.split('__')[-1]) for n in newids) for p in i.get('parts', []))]
    if rel: return True, f'公開の確認に出る: {rel[0].get("text")}'
    empties = []
    for pid in ['pg_home', 'pg_menu']:
        await gopage(pg, pid); await preview_on(pg)
        empties += await ev(pg, "[...document.querySelectorAll('[data-el^=\"card_name\"],[data-el*=\"row_name\"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&getComputedStyle(e).visibility!=='hidden'&&!e.innerText.trim()}).map(e=>e.dataset.el)")
        await preview_off(pg)
    if not empties: return True, f'名前のない品はプレビューに出ない（新しい部品 {sorted(newids)[:3]}）'
    return False, f'公開の確認 {[i.get("kind") for i in chk]}（品の名前・値段について無し）、プレビューに空の品 {empties}'

# J42 値段の箱の金額欄で Ctrl+A→Delete/Ctrl+X で品が外れる
# 合格: 値段の箱の金額欄で Ctrl+A→Delete、Ctrl+A→Ctrl+X のどちらでも品（どら焼き）が並びに残る
async def t_J42(new):
    res = []; ok = True
    for key in ['Delete', f'{MOD}+x']:
        pg = await new()
        await selitem(pg, 'card_price_c_dora'); await click(pg, 'card_price_c_dora', n=2, scroll=False); await pg.wait_for_timeout(300)
        if not await cssbb(pg, '#priceBox .pb-amt'): res.append(f'{key}: 値段の箱が開かない'); ok = False; await pg.context.close(); continue
        await clickcss(pg, '#priceBox .pb-amt', 200)
        await pg.keyboard.press(f'{MOD}+a'); await pg.keyboard.press(key); await pg.wait_for_timeout(400)
        c = await cards(pg); good = 'dora' in c; ok &= good
        res.append(f'{key}→並び {c}')
        await pg.context.close()
    return ok, ' / '.join(res)

# J44 アクセスの電話番号を書き換えても電話リンクは古い番号
# 合格: 電話番号を 078-111-2222 に書き換えて「電話する」リンクにしたとき、リンク先が新しい番号（古い番号でない）
async def t_J44(new):
    pg = await new(); await gopage(pg, 'pg_contact')
    await text_edit(pg, 'contact__ci_tel', '078-111-2222')
    await click(pg, 'contact__ci_tel', n=2); await pg.keyboard.press(f'{MOD}+a')
    await clickcss(pg, '[data-text-tool="link"]', 400)
    panel = await ev(pg, "(()=>{const p=document.getElementById('linkPanel');return p?p.innerText.replace(/\\n/g,'|').slice(0,120):null})()")
    await clicktext(pg, '#linkPanel', '電話する', exact=False, wait=400)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    lk = await ev(pg, f"{P}.links('contact__ci_tel')")
    hrefs = [r.get('href') or '' for r in (lk or {}).get('runs', [])]
    if lk and lk.get('element'): hrefs.append(lk['element'].get('href') or '')
    tel = [h for h in hrefs if h.startswith('tel:')]
    ok = bool(tel) and all('0781112222' in h.replace('-', '') for h in tel)
    return ok, f'リンク先 {hrefs}（つなぐ先の一覧: {panel}）'

# J45 住所を書き換えてもフッター・地図リンクは古い
# 合格: アクセスの住所を神戸市の住所に書き換えたとき、(1) フッターの住所が新しくなる（または知らせが出る）
#       (2) 「地図で見る」リンクの行き先が新しい住所（古い座標・古い住所でない）
async def t_J45(new):
    pg = await new(); await gopage(pg, 'pg_contact'); await clear_notices(pg)
    NEW = '〒650-0001 兵庫県神戸市中央区加納町1-1'
    await text_edit(pg, 'contact__ci_addr', NEW)
    nt = await notices(pg)
    foot = await ev(pg, "(()=>{const e=document.querySelector('[data-el=\"footer__faddr\"]');return e?e.innerText:null})()")
    await click(pg, 'contact__ci_addr', n=2); await pg.keyboard.press(f'{MOD}+a')
    await clickcss(pg, '[data-text-tool="link"]', 400)
    await clicktext(pg, '#linkPanel', '地図で見る', exact=False, wait=400)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    lk = await ev(pg, f"{P}.links('contact__ci_addr')")
    hrefs = [unquote(r.get('href') or '') for r in (lk or {}).get('runs', [])]
    foot_ok = bool(foot and '神戸' in foot) or bool(nt)
    map_ok = bool(hrefs) and all(('神戸' in h or '加納町' in h) and '34.728,135.305' not in h for h in hrefs)
    return foot_ok and map_ok, f'フッター「{foot}」知らせ{nt[:1]}、地図リンク {hrefs}'

# J50 プレビュー中に右クリックした部品が Delete で消え矢印で動く
# 合格: プレビュー中に見出しを右クリックして Delete・→・Shift+↓ を押しても、見出しが残り動かず、記録が増えない
async def t_J50(new):
    pg = await new(); await preview_on(pg)
    r0 = await bb(pg, 'F_h0'); n0 = await ops_len(pg)
    await pg.mouse.click(r0['x'] + 20, r0['y'] + 10, button='right'); await pg.wait_for_timeout(300)
    await pg.keyboard.press('Delete'); await pg.wait_for_timeout(300)
    await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(400)
    r1 = await bb(pg, 'F_h0'); n1 = await ops_len(pg)
    ok = r1 is not None and abs(r1['x'] - r0['x']) < 0.5 and abs(r1['ay'] - r0['ay']) < 0.5 and n1 == n0
    return ok, f'見出し {"あり" if r1 else "消えた"}' + (f" x {r0['x']:.0f}→{r1['x']:.0f} y {r0['ay']:.0f}→{r1['ay']:.0f}" if r1 else '') + f'、記録 {n0}→{n1}'

# J51 プレビューの右クリックで見えない一覧が残る
# 合格: プレビュー中に写真・セクションの余白を右クリックした後、「開いている」扱いなのに見えない一覧（#fmenu 等）が無い
async def t_J51(new):
    pg = await new(); await preview_on(pg)
    HID = "(()=>[...document.querySelectorAll('#fmenu,[id*=menu i],[class*=menu i]')].filter(e=>(e.classList.contains('on')||e.classList.contains('open')||e.getAttribute('aria-expanded')==='true')&&e.querySelector('button')).filter(e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return c.display==='none'||c.visibility==='hidden'||r.width===0||r.height===0}).map(e=>e.id||e.className))()"
    r = await bb(pg, 'F_p0')
    await pg.mouse.click(r['x'] + 50, r['y'] + 50, button='right'); await pg.wait_for_timeout(300)
    a = await ev(pg, HID)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
    if not await ev(pg, f"{P}.previewMode()"): await preview_on(pg)
    await pg.mouse.click(1300, 300, button='right'); await pg.wait_for_timeout(300)
    b = await ev(pg, HID)
    return (not a and not b), f'写真の右クリック後の見えない一覧 {a}、余白の右クリック後 {b}'

# J52 プレビュー中の Cmd+Z が手直しを戻す
# 合格: 本文を動かしてからプレビューで Cmd+Z を押しても、本文の位置と「戻せる」状態が変わらない
async def t_J52(new):
    pg = await new()
    await click(pg, 'F_b0'); await pg.keyboard.press('Shift+ArrowRight'); await pg.wait_for_timeout(300); await pg.keyboard.press('Escape')
    await preview_on(pg)
    r0 = await bb(pg, 'F_b0'); u0 = await ev(pg, f"{P}.canUndo()"); n0 = await ops_len(pg)
    await pg.keyboard.press(f'{MOD}+z'); await pg.wait_for_timeout(500)
    r1 = await bb(pg, 'F_b0'); u1 = await ev(pg, f"{P}.canUndo()"); n1 = await ops_len(pg)
    ok = abs(r1['x'] - r0['x']) < 0.5 and u1 == u0
    return ok, f"F_b0 x {r0['x']:.1f}→{r1['x']:.1f}、戻せる {u0}→{u1}、記録 {n0}→{n1}"

# J53 ページへのリンク（部品・お品書きをすべて見る）をプレビューで押すと編集画面ごと消える
# 合格: プレビューで (a)「お品書きをすべて見る」 (b) お品書きへリンクした写真 を押しても、編集の画面が残り、
#       プレビューのままお品書きのページに移る
async def t_J53(new):
    async def state(pg):
        try:
            return await ev(pg, f"typeof window.__playground==='object'?[location.href.split('/').pop().slice(0,40),{P}.previewMode(),{P}.currentPage()]:['離れた:'+location.href.slice(0,50)]")
        except Exception as e: return ['評価できない:' + str(e)[:40]]
    fname = None; res = []; ok = True
    # (a) お品書きをすべて見る
    pg = await new(); fname = pg.url.split('/')[-1][:40]
    await preview_on(pg); await scrollto(pg, 'I_pillbg'); r = await bb(pg, 'I_pillbg')
    await pg.mouse.click(r['x'] + r['w'] / 2, r['y'] + r['h'] / 2); await pg.wait_for_timeout(1300)
    s = await state(pg); good = len(s) == 3 and s[0] == fname and s[1] is True and s[2] == 'pg_menu'; ok &= good
    res.append(f'すべて見る→{s}'); await pg.context.close()
    # (b) 写真にお品書きへのリンク
    pg = await new()
    await click(pg, 'F_p0', dx=40, dy=40)
    await clickcss(pg, '#tElemLink', 400)
    await clicktext(pg, '#linkPanel', 'お品書き', exact=False, wait=400)
    await esc2(pg); await pg.wait_for_timeout(800)
    await preview_on(pg); await scrollto(pg, 'F_p0'); r = await bb(pg, 'F_p0')
    await pg.mouse.click(r['x'] + 60, r['y'] + 60); await pg.wait_for_timeout(1300)
    s = await state(pg); good = len(s) == 3 and s[0] == fname and s[1] is True and s[2] == 'pg_menu'; ok &= good
    res.append(f'写真のリンク→{s}'); await pg.context.close()
    return ok, ' / '.join(res)

# J54 ページ内リンク（#items 等）がセクションの id と合わず効かない
# 合格: 写真を「このページの『おすすめの品』」にリンクし、プレビューで押すと、おすすめの品のセクションまでスクロールする
async def t_J54(new):
    pg = await new()
    await click(pg, 'F_p0', dx=40, dy=40)
    await clickcss(pg, '#tElemLink', 400)
    await clicktext(pg, '#linkPanel', 'おすすめの品', exact=False, wait=400)
    await esc2(pg)
    await preview_on(pg); await scrollto(pg, 'F_p0'); r = await bb(pg, 'F_p0'); y0 = await ev(pg, 'scrollY')
    await pg.mouse.click(r['x'] + 100, r['y'] + 100); await pg.wait_for_timeout(1300)
    y1 = await ev(pg, 'scrollY')
    top = await ev(pg, "(()=>{const h=document.getElementById('host_items')||document.querySelector('[data-el=\"I_cards\"]');return h?h.getBoundingClientRect().top:null})()")
    ok = top is not None and -80 <= top <= 250 and y1 != y0
    return ok, f'scrollY {y0:.0f}→{y1:.0f}、おすすめの品の上端（画面上） {top if top is None else round(top)}、hash {await ev(pg, "location.hash")}'

# J55 白地に白い文字でも公開の確認に出ない
# 合格: 白地の上の「甘味処」の文字を白にしたとき、publishCheck() にその部品の項目がある
async def t_J55(new):
    pg = await new()
    await click(pg, 'I_kanmi', dx=10)
    if 'I_kanmi' not in await ev(pg, f"{P}.selected()"): await click(pg, 'I_kanmi', dx=10, scroll=False)
    await clickcss(pg, '[data-ts="color"]', 300)
    await clickcss(pg, '[data-ts-color="#FFFFFF"],[data-ts-color="#ffffff"],[data-ts-color="#fff"]', 400)
    await esc2(pg)
    col = await ev(pg, "getComputedStyle(document.querySelector('[data-el=I_kanmi]')).color")
    chk = await ev(pg, f"{P}.publishCheck()")
    rel = [i for i in chk if any('I_kanmi' in p for p in i.get('parts', []))]
    return bool(rel), f'文字色 {col}、公開の確認 {[(i.get("kind"), i.get("parts")) for i in chk][:4]}'

# J56 見出しを空にしても公開の確認に出ない
# 合格: 見出しの文字を全部消したとき、publishCheck() に見出しの項目がある（または空にならない）
async def t_J56(new):
    pg = await new()
    await text_edit(pg, 'F_h0', '')
    await pg.mouse.click(*OUT); await pg.wait_for_timeout(400)
    t = await ev(pg, "(()=>{const e=document.querySelector('[data-el=\"F_h0\"]');return e?e.innerText.trim():null})()")
    if t: return True, f'見出しは空にならない「{t}」'
    chk = await ev(pg, f"{P}.publishCheck()")
    rel = [i for i in chk if any(p == 'F_h0' or p.endswith('F_h0') for p in i.get('parts', []))]
    return bool(rel), f'見出し「{t}」、公開の確認 {[(i.get("kind"), i.get("parts")) for i in chk][:4]}'

# J57 スマホで300px 以上スクロールしてからの測り直しで、関係ない文の折り返しが変わる
# 合格: スマホ表示で一番上の折り返しを覚え、提供時間（約2700px 下）を選んで → ← で動かして戻した後、
#       ほかの文の折り返しが変わらない
LINES = """()=>{const out={};for(const n of document.querySelectorAll('#sectionwrap [data-kind=text]')){const id=n.dataset.el;if(id==='I_time')continue;const L=[];let cur='',top=null;const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t;while(t=w.nextNode()){for(let i=0;i<t.length;i++){const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+1);const b=r.getClientRects()[0];if(!b)continue;if(top!==null&&Math.abs(b.top-top)>3){L.push(cur);cur='';}top=b.top;cur+=t.data[i];}}L.push(cur);out[id]=L.join('/')}return out}"""
async def t_J57(new):
    pg = await new()
    await clickcss(pg, '#dSP', 800)
    a = await ev(pg, LINES)
    await scrollto(pg, 'I_time'); sy = await ev(pg, 'scrollY')
    await click(pg, 'I_time', dx=10, scroll=False)
    if 'I_time' not in await ev(pg, f"{P}.selected()"): return False, f'提供時間が選べない（scrollY {sy}）'
    await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(600)
    b = await ev(pg, LINES)
    diff = [(k, a[k], b.get(k)) for k in a if a[k] != b.get(k)]
    if diff: return False, f'scrollY {sy:.0f} で測り直すと {len(diff)} 個の折り返しが変わる 例 {diff[0]}'
    return True, f'scrollY {sy:.0f} で測り直しても {len(a)} 個の文の折り返しは同じ'

# ================================================================ 走らせる
TESTS = {k[2:]: v for k, v in globals().items() if k.startswith('t_J')}
ORDER = ['J14', 'J15', 'J19', 'J20', 'J21', 'J22', 'J35', 'J36', 'J37', 'J38', 'J39', 'J40', 'J41', 'J42',
         'J44', 'J45', 'J50', 'J51', 'J52', 'J53', 'J54', 'J55', 'J56', 'J57']

async def run_one(br, url, tid, sem):
    async with sem:
        made = []
        async def new(**kw):
            pg = await fresh(br, url, **kw); made.append(pg); return pg
        t0 = time.time()
        try:
            ok, msg = await asyncio.wait_for(TESTS[tid](new), timeout=120)
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
    sem = asyncio.Semaphore(int(os.environ.get('AUDIT_JOBS', '3')))
    t0 = time.time()
    async with async_playwright() as p:
        br = await p.chromium.launch()
        results = await asyncio.gather(*[run_one(br, url, i, sem) for i in ids])
        await br.close()
    nok = nng = 0
    for tid, ok, msg, dt in results:
        print(f"{'OK' if ok else 'NG'} {tid} | {msg}", flush=True)
        if ok: nok += 1
        else: nng += 1
    print(f'合計 OK {nok} / NG {nng}（{time.time() - t0:.0f}秒）')
    sys.exit(nng)

if __name__ == '__main__':
    asyncio.run(main())
