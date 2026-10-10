# verify_extra_save.py v1（試験台24・2026-10-09）
# 作業票 wa-01 layout-playground 24（保存を「今の形」に変える）の §3 試験 S1〜S11。
# ほかの5本と同じ作り（rec で OK/NG/--、各段で roundTrip() の結果も出す）。
# 使い方：python3 verify_extra_save.py /path/to/playground24_single.html
# 第2引数（任意）＝試験台23 の single.html（S10 の大きさ比べ・S11 の同一文脈に使う。無ければその2段は -- で値だけ）。
import asyncio, json, sys, os
from playwright.async_api import async_playwright
URL = 'file://' + sys.argv[1]
URL23 = ('file://' + sys.argv[2]) if len(sys.argv) > 2 else None
P = 'window.__playground'
# §24c-2.4 単独で走らせられるよう、git 追跡の playground24_testimg の画像を使う（img17 は verify_extra_photo が作るもの＝未追跡）。
IMG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'refs', 'compare', 'layout', 'playground24_testimg'))
if not os.path.isdir(IMG): IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'img17')   # 後方互換
R = []
def rec(k, ok, msg=''): R.append((k, ok, msg)); print(('OK ' if ok is True else ('NG ' if ok is False else '-- ')) + k + (' | ' + msg if msg else ''), flush=True)

def rt_bad(r):
    bad = []
    for dev in ('pc', 'sp'):
        d = r[dev]
        if d['maxPos'] > 0.5 or d['maxSize'] > 0.5 or d['onlyA'] or d['onlyB'] or d['attrDiff'] or d['swapDiff']:
            bad.append((dev, {'maxPos': d['maxPos'], 'maxSize': d['maxSize'], 'onlyA': d['onlyA'][:4], 'onlyB': d['onlyB'][:4], 'attr': d['attrDiff'][:4], 'swap': d['swapDiff'][:4]}))
    return bad

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def fresh(w=1440, h=1100):
            ctx = await br.new_context(viewport={'width': w, 'height': h}); pg = await ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg._errs = errs
            await pg.goto(URL); await pg.wait_for_function(P); await pg.wait_for_timeout(1200)
            # 毎回まっさらな土台から（この文脈の IndexedDB を消して開き直す）
            await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('mikke-playground24');q.onsuccess=q.onerror=q.onblocked=()=>r(1)})")
            await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(1000)
            return pg
        async def ev(pg, e): return await pg.evaluate(e)
        async def rt(pg): return await pg.evaluate(f"{P}.roundTrip()")
        async def apply(pg, ops): await pg.evaluate(f"{P}.applyOps({json.dumps(ops, ensure_ascii=False)})"); await pg.wait_for_timeout(40)

        # ---------- S1：op 種別ごとに積み上げ、1つごとに roundTrip ----------
        pg = await fresh()
        # 写真の素材 ID をテンプレから1つ借りる（差し替え・足す写真に使う）
        photos = await ev(pg, f"{P}.photos()")
        asset = next((x.get('asset') for x in photos if x.get('asset')), None)
        asset2 = next((x.get('asset') for x in photos if x.get('asset') and x.get('asset') != asset), asset)
        S1 = [
            ('同じ塊で動かす(M1)', {'t': 'move', 'device': 'pc', 'items': [{'id': 'F_h0', 'mode': 'M1', 'dx': 12, 'dy': 8}]}),
            ('塊の外へ置く(M2)', {'t': 'move', 'device': 'pc', 'items': [{'id': 'F_b0', 'mode': 'M2', 'anchor': 'F_p0', 'gapY': 40, 'x': 120}]}),
            ('並べ替え', {'t': 'reorder', 'device': 'pc', 'key': 'Ftg1', 'id': 'F_h1', 'order': ['F_b1', 'F_h1']}),
            ('左右の入れ替え', {'t': 'swap', 'device': 'pc', 'sec': 'feature', 'block': 0, 'clearM1': []}),
            ('大きさ(左端から)', {'t': 'size', 'device': 'pc', 'id': 'F_h0', 'w': 420, 'dx': -20}),
            ('重なり順', {'t': 'zorder', 'device': 'pc', 'zs': {'F_h0': 5, 'F_p0': 1}}),
            ('列', {'t': 'cols', 'device': 'pc', 'id': 'I_cards', 'n': 3}),
            ('見せる範囲', {'t': 'view', 'device': 'pc', 'id': 'F_p0', 'x': 0.4, 'y': 0.6, 'zoom': 2}),
            ('差し替え', {'t': 'replace', 'id': 'F_p1', 'asset': asset2}),
            ('写真を外す', {'t': 'clear', 'id': 'F_p0'}),
            ('写真を戻す', {'t': 'unclear', 'id': 'F_p0'}),
            ('明るさ', {'t': 'bright', 'id': 'F_p0', 'v': 20}),
            ('本文の書き換え', {'t': 'edit', 'id': 'F_b0', 'text': '季節の意匠。毎朝炊いた餡を、その日のうちにお出しします。'}),
            ('一部を太字赤大書体リンク', {'t': 'edit', 'id': 'F_b1', 'runs': [{'text': 'こだわり'}, {'text': 'の餡', 'bold': True, 'color': '#C03030', 'scale': 1.4, 'font': 'accent', 'link': {'kind': 'tel'}}]}),
            ('箱まるごとPC', {'t': 'tstyle', 'keys': ['F_h0'], 'device': 'pc', 'weight': 700, 'color': '#204080', 'font': 'heading', 'size': 40}),
            ('箱まるごとSP', {'t': 'tstyle', 'keys': ['F_h0'], 'device': 'sp', 'size': 28}),
            ('文字の見た目を戻す', {'t': 'tstyleReset', 'keys': ['F_h0'], 'parts': ['F_h0']}),
            ('部品まるごとのリンク', {'t': 'elink', 'id': 'F_p0', 'link': {'kind': 'instagram'}}),
            ('貼り付け文字', {'t': 'add', 'id': 'add_90', 'section': 'feature', 'kind': 'text', 'styleName': 'featBody', 'w': 600, 'wOther': 351, 'text': '貼り付けた文字', 'anchor': 'F_b0', 'gap': 16, 'gapOther': 16, 'x': '@left', 'placedDevice': 'pc', 'placed': {'device': 'pc', 'anchor': 'F_b0', 'gapY': 16, 'x': 120}}),
            ('貼り付け写真', {'t': 'add', 'id': 'addp_91', 'section': 'items', 'kind': 'photo', 'asset': asset, 'w': 300, 'wOther': 351, 'h': 240, 'hOther': 280, 'text': '', 'anchor': 'I_hg', 'gap': 16, 'gapOther': 16, 'x': '@left', 'placedDevice': 'pc', 'placed': {'device': 'pc', 'anchor': 'I_hg', 'gapY': 16, 'x': 60}}),
            ('足した部品を動かす', {'t': 'move', 'device': 'pc', 'items': [{'id': 'add_90', 'mode': 'M2', 'anchor': 'F_b0', 'gapY': 60, 'x': 200}]}),
        ]
        ops = []; worst = 0.0; s1_fail = []
        for nm, op in S1:
            ops = ops + [op]
            await apply(pg, ops)
            r = await rt(pg); bad = rt_bad(r)
            mp = max(r['pc']['maxPos'], r['sp']['maxPos']); ms = max(r['pc']['maxSize'], r['sp']['maxSize']); worst = max(worst, mp, ms)
            onlys = r['pc']['onlyA'] + r['pc']['onlyB'] + r['sp']['onlyA'] + r['sp']['onlyB']
            rec('S1 ' + nm, not bad, f"roundTrip maxPos={mp:.2f} maxSize={ms:.2f} 片方のみ={onlys[:4]}" + (f" 不一致={bad}" if bad else ''))
            if bad: s1_fail.append(nm)
        # 構造の操作（セクション・品・行・削除）は本物の API 関数で（テンプレの見本の中身で正しく組む）。applyOps の上に積む。
        async def rt_step(nm):
            await pg.wait_for_timeout(60); r = await rt(pg); bad = rt_bad(r)
            rec('S1 ' + nm, not bad, f"roundTrip maxPos={max(r['pc']['maxPos'],r['sp']['maxPos']):.2f} maxSize={max(r['pc']['maxSize'],r['sp']['maxSize']):.2f}" + (f" 不一致={bad}" if bad else ''))
            if bad: s1_fail.append(nm)
        await ev(pg, f"{P}.sectionAdd('bottom','feature')"); await rt_step('セクション追加')
        await ev(pg, f"{P}.sectionDuplicate('feature')"); await rt_step('セクション複製(手直しのある特集)')
        secs = [s['id'] for s in await ev(pg, f"{P}.sectionList()")]
        if len(secs) >= 2: await ev(pg, f"{P}.sectionMove('{secs[-1]}',-1)"); await rt_step('セクション移動')
        cards = [k for k in (await ev(pg, f"{P}.geometry()")) if k.startswith('card_name_')]
        if cards: await ev(pg, f"{P}.selectOnly('{cards[0]}'); {P}.duplicate()"); await rt_step('品の複製')
        await ev(pg, f"{P}.setDevice('pc')"); await pg.wait_for_timeout(100)
        # 削除（品）。足した add_90/addp_91 は S3 で使うので消さない。
        cards2 = [k for k in (await ev(pg, f"{P}.geometry()")) if k.startswith('card_name_')]
        if cards2: await ev(pg, f"{P}.selectOnly('{cards2[-1]}'); {P}.deleteSelected()"); await rt_step('品の削除')
        rec('S1 まとめ', not s1_fail, f"最大ずれ={worst:.2f} 不一致の段={s1_fail}")

        # ---------- S2：S1 の後で開き直す ----------
        d_before = await ev(pg, f"JSON.stringify({P}.draft())")
        # applyOps は seq を進めないので、開き直し後の採番衝突を避けるため、保存する draft の seq を実データに合わせて進めておく
        await pg.wait_for_timeout(800)  # autosave 待ち（applyOps は保存を呼ばないので、最後に1操作保存を誘発）
        await ev(pg, f"{P}.publish({{force:true}})"); await pg.wait_for_timeout(800)  # 公開で保存を確実に走らせる（draft も保存される）
        gpc0 = await ev(pg, f"{P}.geometry()"); await ev(pg, f"{P}.setDevice('sp')"); await pg.wait_for_timeout(300); gsp0 = await ev(pg, f"{P}.geometry()"); await ev(pg, f"{P}.setDevice('pc')"); await pg.wait_for_timeout(200)
        await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(1200)
        opslen = await ev(pg, f"{P}.ops().length")
        d_after = await ev(pg, f"JSON.stringify({P}.draft())")
        gpc1 = await ev(pg, f"{P}.geometry()"); await ev(pg, f"{P}.setDevice('sp')"); await pg.wait_for_timeout(300); gsp1 = await ev(pg, f"{P}.setDevice('sp') || {P}.geometry()"); gsp1 = await ev(pg, f"{P}.geometry()"); await ev(pg, f"{P}.setDevice('pc')"); await pg.wait_for_timeout(200)
        def maxdiff(a, b):
            m = 0.0
            for k in set(a) | set(b):
                if k in a and k in b:
                    m = max(m, abs(a[k]['x'] - b[k]['x']), abs(a[k]['y'] - b[k]['y']), abs(a[k]['w'] - b[k]['w']), abs(a[k]['h'] - b[k]['h']))
            return m
        dpc = maxdiff(gpc0, gpc1); dsp = maxdiff(gsp0, gsp1)
        pre = await ev(pg, f"JSON.stringify({P}.draft())"); await ev(pg, f"{P}.undo()"); await pg.wait_for_timeout(200); post = await ev(pg, f"JSON.stringify({P}.draft())")
        diffkeys = ''
        if d_before != d_after:
            try:
                a = json.loads(d_before); b = json.loads(d_after)
                for k in sorted(set(a) | set(b)):
                    if json.dumps(a.get(k), ensure_ascii=False, sort_keys=True) != json.dumps(b.get(k), ensure_ascii=False, sort_keys=True):
                        if isinstance(a.get(k), dict) and isinstance(b.get(k), dict):
                            for kk in sorted(set(a[k]) | set(b[k])):
                                if json.dumps(a[k].get(kk), ensure_ascii=False, sort_keys=True) != json.dumps(b[k].get(kk), ensure_ascii=False, sort_keys=True):
                                    diffkeys += f" [{k}.{kk}] 前={json.dumps(a[k].get(kk),ensure_ascii=False)} 後={json.dumps(b[k].get(kk),ensure_ascii=False)}"
                        else:
                            diffkeys += f" [{k}] 前={json.dumps(a.get(k),ensure_ascii=False)[:160]} 後={json.dumps(b.get(k),ensure_ascii=False)[:160]}"
            except Exception as e: diffkeys = str(e)
        rec('S2 開き直し', opslen == 0 and d_before == d_after and dpc <= 0.5 and dsp <= 0.5 and pre == post,
            f"ops={opslen}（空=0）draft一致={d_before==d_after} 最大ずれ PC={dpc:.2f} SP={dsp:.2f} 直後の戻すは無変化={pre==post}{diffkeys}")

        # ---------- S3：開き直し後（土台にある部品）に効くか（§2.7）----------
        # (a) 土台にある足した写真 addp_91 を本物のドラッグで動かす（§2.7：add op は記録の列に無い＝土台にある）
        so_p = await ev(pg, f"{P}.secOf('addp_91')"); so_t = await ev(pg, f"{P}.secOf('add_90')")
        g0 = (await ev(pg, f"{P}.geometry()")); before = g0.get('addp_91')
        el = await pg.query_selector('[data-el="addp_91"]')
        moved = False
        if el:
            await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(100)
            bx = await el.bounding_box(); sc = bx['width'] / before['w'] if before and before['w'] else 1
            x = bx['x'] + min(20, bx['width'] / 2); y = bx['y'] + bx['height'] / 2
            await pg.mouse.click(x, y); await pg.wait_for_timeout(300); await pg.keyboard.down('Alt'); await pg.mouse.move(x, y); await pg.mouse.down()
            for i in range(1, 11): await pg.mouse.move(x, y + 40 * sc * i / 10); await pg.wait_for_timeout(10)
            await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.wait_for_timeout(300)
            after = (await ev(pg, f"{P}.geometry()")).get('addp_91'); moved = bool(before and after and abs(after['y'] - before['y']) >= 10)
        r = await rt(pg); bad1 = rt_bad(r)
        # (b) 土台にある足した文字 add_90 を書き換える（§2.7：ふつうの書き換えとして記録してよい）
        await ev(pg, f"{P}.edit('add_90','書き換えた足し文字')"); await pg.wait_for_timeout(200)
        t = await ev(pg, "(()=>{const e=document.querySelector('[data-el=\"add_90\"]');return e?e.innerText:null})()")
        r = await rt(pg); bad2 = rt_bad(r)
        # (c) 土台にある足した部品のセクション（items）を複製 → クローンが出る・roundTrip
        ncards0 = len([k for k in (await ev(pg, f"{P}.geometry()")) if k.startswith('card_name_')])
        await ev(pg, f"{P}.sectionDuplicate('items')"); await pg.wait_for_timeout(300)
        r = await rt(pg); bad3 = rt_bad(r)
        rec('S3 土台の足した部品に効く', so_p == 'items' and so_t == 'feature' and moved and t == '書き換えた足し文字' and not bad1 and not bad2 and not bad3,
            f"secOf(addp_91)={so_p} secOf(add_90)={so_t} 写真を動かせた={moved} 書き換え後='{t}' roundTrip={'ok' if not(bad1 or bad2 or bad3) else (bad1 or bad2 or bad3)}")

        # ---------- S4：新しい ID（使い回さない）----------
        async def sec_ids(pg): return set(s['id'] for s in await ev(pg, f"{P}.sectionList()"))
        pg = await fresh()
        s0 = await sec_ids(pg)
        await ev(pg, f"{P}.sectionAdd('bottom','feature')"); await pg.wait_for_timeout(250); s1s = await sec_ids(pg); sec1 = (s1s - s0).pop()
        await ev(pg, f"{P}.sectionAdd('bottom','feature')"); await pg.wait_for_timeout(250); s2s = await sec_ids(pg); sec2 = (s2s - s1s).pop()
        await ev(pg, f"{P}.sectionDelete('{sec2}')"); await pg.wait_for_timeout(250)             # 2つ目を消す
        await pg.wait_for_timeout(700); await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(1200)   # 保存→開き直す
        s3s = await sec_ids(pg); await ev(pg, f"{P}.sectionAdd('bottom','feature')"); await pg.wait_for_timeout(250); s4s = await sec_ids(pg); new_id = (s4s - s3s).pop()
        rec('S4 セクションの新しい ID', sec2 not in s3s and new_id not in {sec1, sec2}, f"1つ目={sec1} 2つ目={sec2}（消した）開き直し後に追加した新ID={new_id}（sec2 を使い回していない）")

        # ---------- S5：直してから元どおり → 公開中と同じです ----------
        pg = await fresh()
        orig = await ev(pg, "document.querySelector('[data-el=\"F_b0\"]').innerText")
        await ev(pg, f"{P}.publish({{force:true}})"); await pg.wait_for_timeout(800)
        await ev(pg, f"{P}.edit('F_b0', {json.dumps(orig + 'あ', ensure_ascii=False)})"); await pg.wait_for_timeout(800)
        l_mid = await ev(pg, f"{P}.saveState().label")
        await ev(pg, f"{P}.edit('F_b0', {json.dumps(orig, ensure_ascii=False)})"); await pg.wait_for_timeout(800)   # 「あ」を手で消す＝元の本文へ
        l_end = await ev(pg, f"{P}.saveState().label")
        rec('S5 直して元どおり', l_mid == 'まだ公開していない変更があります' and l_end == '公開中と同じです', f"足した後={l_mid} 戻した後={l_end}")

        # ---------- S6：写真の入れ物（足す・公開を重ねる・未公開の写真は消すと入れ物から消える）----------
        async def add_photo(pg, name):
            before = set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_'))
            async with pg.expect_file_chooser() as fc: await pg.click('#tPhoto')
            await (await fc.value).set_files(os.path.join(IMG, name)); await pg.wait_for_timeout(1000)
            after = set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_'))
            new = list(after - before)
            return new[0] if new else None
        async def assets_count(pg):
            await pg.wait_for_timeout(700)  # autosave 待ち
            return await pg.evaluate("new Promise(r=>{const q=indexedDB.open('mikke-playground24');q.onsuccess=()=>{const db=q.result;const t=db.transaction('state','readonly');const g=t.objectStore('state').get('assets');g.onsuccess=()=>{const a=g.result||{};const vals=Object.values(a);const dup=vals.length-new Set(vals).size;r({n:Object.keys(a).length,dup})};g.onerror=()=>r({n:-1,dup:-1})}})")
        # wide.jpg/tall.jpg を優先（img17 と同じ画像＝結果が変わらない）。無ければ画像ファイルを拾う（notimage.txt 等は除く）
        imgs = [f for f in ['wide.jpg', 'tall.jpg'] if os.path.exists(os.path.join(IMG, f))] or sorted(f for f in os.listdir(IMG) if f.lower().endswith(('.jpg', '.jpeg', '.png'))) if os.path.isdir(IMG) else []
        s6_ok = None; stages = []; pg6 = None
        if len(imgs) >= 2:
            pg = await fresh(); pg6 = pg
            try:
                p1 = await add_photo(pg, imgs[0]); await ev(pg, f"{P}.publish({{force:true}})"); stages.append(('公開1', await assets_count(pg)))
                p2 = await add_photo(pg, imgs[1]); await ev(pg, f"{P}.publish({{force:true}})"); stages.append(('公開2', await assets_count(pg)))
                p3 = await add_photo(pg, imgs[0])                               # 3枚目は公開しない
                stages.append(('未公開で3枚目を足す', await assets_count(pg)))
                await ev(pg, f"{P}.selectOnly('{p3}'); {P}.deleteSelected()")    # 未公開の写真を消す＝どの版も指さない→入れ物から消えるはず
                stages.append(('未公開を消す', await assets_count(pg)))
                n = [c['n'] for _, c in stages]; dup = stages[-1][1]['dup']
                # 期待：公開1=1、公開2=2、3枚目足す=3、未公開を消す=2（GC で未使用の1枚が消える）
                s6_ok = (n[0] == 1 and n[1] == 2 and n[2] == 3 and n[3] == 2)
                rec('S6 写真の入れ物', s6_ok, f"各段(名,鍵数/重複)={[(nm,c['n'],c['dup']) for nm,c in stages]}（公開1=1・公開2=2・3枚目=3・未公開を消す=2が期待。同じ画像の重複data={dup}）")
            except Exception as e:
                rec('S6 写真の入れ物', None, f"停止：{e}（stages={[(nm,c) for nm,c in stages]}）")
        else:
            rec('S6 写真の入れ物', None, f"img17 の画像が不足（{len(imgs)}枚）")

        # ---------- S7：一番古い公開版を下書きにする → 開き直す ----------
        try:
            if pg6 is not None:
                pg = pg6
                vs = await ev(pg, f"{P}.versions()"); pubs = [v for v in vs if v.get('kind') == 'published']
                if pubs:
                    oldest = pubs[-1]['id']  # versions() は新しい順＝末尾が最古（公開1＝写真1枚）
                    await ev(pg, f"{P}.restoreVersion('{oldest}')"); await pg.wait_for_timeout(600)
                    k1 = [v.get('kind') for v in await ev(pg, f"{P}.versions()")]; lbl = await ev(pg, f"{P}.saveState().label")
                    await pg.wait_for_timeout(800); await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(1200)
                    ph = [x for x in await ev(pg, f"{P}.photos()") if x.get('asset') and x['part'].startswith('addp_')]
                    br_now = 'beforeRestore' in k1
                    rec('S7 古い版を下書きに→開き直す', len(ph) >= 1 and br_now, f"開き直し後の写真(足した)={len(ph)}枚 戻す前の下書き={br_now} 状態={lbl} 履歴={k1}")
                else:
                    rec('S7 古い版を下書きに', None, '公開版なし')
            else:
                rec('S7 古い版を下書きに', None, 'S6 未実行（画像不足）')
        except Exception as e:
            rec('S7 古い版を下書きに', None, f"停止：{e}")

        # ---------- S8：下書きにする → Cmd+Z → Cmd+Z ----------
        pg = await fresh()
        await apply(pg, [{'t': 'edit', 'id': 'F_h0', 'text': 'AAA'}])
        await ev(pg, f"{P}.publish({{force:true}})"); await pg.wait_for_timeout(700)
        await apply(pg, [{'t': 'edit', 'id': 'F_h0', 'text': 'AAA'}, {'t': 'edit', 'id': 'F_b0', 'text': 'BBB'}])
        pre_restore = await ev(pg, f"JSON.stringify({P}.draft())")
        pubs = [v for v in await ev(pg, f"{P}.versions()") if v.get('kind') == 'published']
        if pubs:
            await ev(pg, f"{P}.restoreVersion('{pubs[-1]['id']}')"); await pg.wait_for_timeout(500)
            d_restored = await ev(pg, f"JSON.stringify({P}.draft())")
            await ev(pg, f"{P}.undo()"); await pg.wait_for_timeout(300)
            d_undo1 = await ev(pg, f"JSON.stringify({P}.draft())")
            back_to_pre = (d_undo1 == pre_restore)
            await ev(pg, f"{P}.undo()"); await pg.wait_for_timeout(300)
            d_undo2 = await ev(pg, f"JSON.stringify({P}.draft())")
            changed_more = (d_undo2 != d_undo1)
            rec('S8 戻す2回', back_to_pre and changed_more, f"1回目で置き換え前に戻る={back_to_pre} 2回目でさらに戻る={changed_more}")
        else:
            rec('S8 戻す2回', None, '公開版なし')

        # ---------- S9：最近使った色（編集の設定）----------
        pg = await fresh()
        l0 = await ev(pg, f"{P}.saveState().label")
        await ev(pg, f"{P}.selectOnly('F_h0'); {P}.pushRecentColor('#123456'); {P}.textSetColor && {P}.textSetColor('#123456')"); await pg.wait_for_timeout(300)
        rc1 = await ev(pg, f"{P}.recentColors()")
        l1 = await ev(pg, f"{P}.saveState().label")
        await pg.wait_for_timeout(700); await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(1000)
        rc2 = await ev(pg, f"{P}.recentColors()")
        # 新しい文脈（別 context＝別 IndexedDB ではないが deleteDatabase で空に）
        pg2 = await fresh()
        rc3 = await ev(pg2, f"{P}.recentColors()")
        rec('S9 最近使った色', '#123456' in rc1 and rc2 == rc1 and rc3 == [], f"選択後={rc1} 開き直し後={rc2} 新文脈={rc3} 状態 選択だけで変わらない={l0}→{l1}")

        # ---------- S10：200文字の draft 大きさ（pg24 vs pg23）----------
        pg = await fresh()
        big = '季節のうつろいを、手のひらにのる小さな菓子に写します。' * 8  # 約208文字
        # 少しずつ打つ（10文字ずつ edit を重ねる＝多数の op）
        acc = ''
        for i in range(0, len(big), 10):
            acc = big[:i + 10]
            await ev(pg, f"{P}.edit('F_b0', {json.dumps(acc, ensure_ascii=False)})")
        await pg.wait_for_timeout(300)
        size24 = await ev(pg, f"JSON.stringify({P}.draft()).length")
        size23 = None
        if URL23:
            ctx = await br.new_context(); p23 = await ctx.new_page(); await p23.goto(URL23); await p23.wait_for_function(P); await p23.wait_for_timeout(1200)
            for i in range(0, len(big), 10):
                await p23.evaluate(f"{P}.edit('F_b0', {json.dumps(big[:i+10], ensure_ascii=False)})")
            await p23.wait_for_timeout(300)
            size23 = await p23.evaluate(f"JSON.stringify({{ops:{P}.ops(),assets:{{}}}}).length")
            await ctx.close()
        rec('S10 draft の大きさ', None, f"pg24 draft={size24} bytes / pg23 {{ops,assets}}={size23} bytes" + (f"（pg24 は {size24*100//size23}% ）" if size23 else ''))

        # ---------- S11：試験台23 の文脈で試験台24 を開く ----------
        if URL23:
            ctx = await br.new_context(); p = await ctx.new_page()
            errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
            await p.goto(URL23); await p.wait_for_function(P); await p.wait_for_timeout(1000)
            await p.evaluate(f"{P}.edit('F_h0','23で直した')"); await p.wait_for_timeout(1200)  # pg23 は mikke-playground22 に保存
            await p.goto(URL); await p.wait_for_function(P); await p.wait_for_timeout(1200)   # 同じ context で pg24 を開く
            d = await p.evaluate(f"{P}.draft()")
            opslen = await p.evaluate(f"{P}.ops().length")
            # 初めの形＝公開前・ops 空・セクションは feature/items のみ
            secs = [s['id'] for s in await p.evaluate(f"{P}.sectionList()")]
            initial = opslen == 0 and secs == ['feature', 'items']
            rec('S11 23の文脈で24を開く', initial and not errs, f"初めの形={initial} ops={opslen} 並び={secs} pageerror={errs[:2]}")
            await ctx.close()
        else:
            rec('S11 23の文脈で24を開く', None, 'pg23 のパス未指定')

        # ===== 試験台24b（S12〜S21）=====
        _pg_keys_seen = set()
        async def dj(pg): return await ev(pg, f"JSON.stringify({P}.draft())")
        async def draft_obj(pg): return await ev(pg, f"{P}.draft()")
        async def save_reopen(pg):   # applyOps は保存を呼ばないので publish で保存を確実に走らせてから開き直す
            await ev(pg, f"{P}.publish({{force:true}})"); await pg.wait_for_timeout(800)
            await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(1200)
        async def rt_ok(pg):
            return not rt_bad(await rt(pg))

        # S12 本文を書き換える → 開き直す → 元の文字に手で書き直す（content から消える）
        pg = await fresh()
        origB = await ev(pg, "document.querySelector('[data-el=\"F_b0\"]').innerText")
        await apply(pg, [{'t': 'edit', 'id': 'F_b0', 'text': origB + 'X'}])
        d = await draft_obj(pg); has1 = 'F_b0' in (d.get('content') or {}); r1 = await rt_ok(pg); _pg_keys_seen |= set((d.get('_pg') or {}).keys())
        await save_reopen(pg)
        d = await draft_obj(pg); has2 = 'F_b0' in (d.get('content') or {})
        await apply(pg, [{'t': 'edit', 'id': 'F_b0', 'text': origB}])
        d = await draft_obj(pg); has3 = 'F_b0' in (d.get('content') or {}); r3 = await rt_ok(pg); _pg_keys_seen |= set((d.get('_pg') or {}).keys())
        rec('S12 本文の書き換えと復元', has1 and has2 and not has3 and r1 and r3, f"書き換え後 content に F_b0={has1}・開き直し後={has2}・元に戻した後={has3}（最後は無いのが正）")

        # S13 写真を差し替える → 開き直す → 元のテンプレの写真に差し替え直す（content から消える）
        pg = await fresh()
        phs = await ev(pg, f"{P}.photos()")
        tmplA = next((x['asset'] for x in phs if x['part'] == 'F_p0' and x.get('asset')), None)
        tmplB = next((x['asset'] for x in phs if x['part'] == 'F_p1' and x.get('asset')), None)
        await apply(pg, [{'t': 'replace', 'id': 'F_p0', 'asset': tmplB}])   # 別の素材に差し替え
        d = await draft_obj(pg); c1 = (d.get('content') or {}).get('F_p0'); r1 = await rt_ok(pg)
        await save_reopen(pg)
        d = await draft_obj(pg); c2 = (d.get('content') or {}).get('F_p0')
        await apply(pg, [{'t': 'replace', 'id': 'F_p0', 'asset': tmplA}])   # 元のテンプレの写真へ戻す
        d = await draft_obj(pg); c3 = (d.get('content') or {}).get('F_p0'); r3 = await rt_ok(pg); _pg_keys_seen |= set((d.get('_pg') or {}).keys())
        rec('S13 写真の差し替えと復元', c1 and c1.get('asset') == tmplB and c2 and not c3 and r1 and r3, f"差し替え後 content[F_p0]={c1}・開き直し後={c2}・テンプレに戻した後={c3}（最後は無いのが正）")

        # S14 特集を複製 → 複製側の本文書き換え・写真差し替え → 開き直す（キーは sec*__… 形・元の特集は増えない）
        pg = await fresh()
        await ev(pg, f"{P}.sectionDuplicate('feature')"); await pg.wait_for_timeout(300)
        secs = [s['id'] for s in await ev(pg, f"{P}.sectionList()")]
        dupId = next((s for s in secs if s not in ('feature', 'items')), None)
        ops0 = await ev(pg, f"{P}.ops()")
        phs = await ev(pg, f"{P}.photos()"); altA = next((x['asset'] for x in phs if x.get('asset')), None)
        await apply(pg, ops0 + [{'t': 'edit', 'id': dupId + '__F_b0', 'text': '複製の本文'}, {'t': 'replace', 'id': dupId + '__F_p0', 'asset': altA}])
        d = await draft_obj(pg); cont = d.get('content') or {}; r1 = await rt_ok(pg); _pg_keys_seen |= set((d.get('_pg') or {}).keys())
        dupKeys = [k for k in cont if k.startswith(dupId + '__')]
        origGrew = 'F_b0' in cont and cont.get('F_b0') == '複製の本文'
        rec('S14 特集の複製と編集', (dupId + '__F_b0') in cont and len(dupKeys) >= 1 and not origGrew and r1, f"複製側のキー={dupKeys[:4]} 元の F_b0={cont.get('F_b0')}（複製は sec*__ 形・元は増えない）")

        # S15 列・見せる範囲・左右の入れ替え → adjust[端末]（下書き直下に cols/view/swap が無い）
        pg = await fresh()
        await apply(pg, [{'t': 'cols', 'device': 'pc', 'id': 'I_cards', 'n': 3}, {'t': 'view', 'device': 'sp', 'id': 'F_p0', 'x': 0.4, 'y': 0.6, 'zoom': 2}, {'t': 'swap', 'device': 'pc', 'sec': 'feature', 'block': 0, 'clearM1': []}])
        d = await draft_obj(pg); apc = d.get('adjust', {}).get('pc', {}); asp = d.get('adjust', {}).get('sp', {})
        has_cols = apc.get('I_cards', {}).get('cols') == 3
        has_view = bool(asp.get('F_p0', {}).get('view'))
        has_swap = bool(apc.get('feature', {}).get('swap'))
        no_top = not any(k in d for k in ('cols', 'view', 'swap'))
        rec('S15 列・見せる範囲・左右入替は adjust へ', has_cols and has_view and has_swap and no_top, f"adjust.pc.I_cards.cols={apc.get('I_cards',{}).get('cols')} adjust.sp.F_p0.view={asp.get('F_p0',{}).get('view')} adjust.pc.feature.swap={apc.get('feature',{}).get('swap')} 直下に cols/view/swap 無し={no_top}")

        # S16 PC で写真を足して置く → SP で見せる範囲 → 開き直す → SP の位置・大きさが同じか
        pg = await fresh()
        before16 = set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_'))
        async with pg.expect_file_chooser() as fc: await pg.click('#tPhoto')
        await (await fc.value).set_files(os.path.join(IMG, imgs[0])); await pg.wait_for_timeout(1000)
        addp = list(set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_')) - before16)[0]
        ops0 = await ev(pg, f"{P}.ops()")
        await apply(pg, ops0 + [{'t': 'view', 'device': 'sp', 'id': addp, 'x': 0.3, 'y': 0.7, 'zoom': 2}])
        await ev(pg, f"{P}.setDevice('sp')"); await pg.wait_for_timeout(300); gsp_before = (await ev(pg, f"{P}.geometry()")).get(addp); await ev(pg, f"{P}.setDevice('pc')")
        d = await draft_obj(pg); in_added = any(a['id'] == addp for a in d.get('added', [])); sp_view = d.get('adjust', {}).get('sp', {}).get(addp, {}).get('view'); r1 = await rt_ok(pg); _pg_keys_seen |= set((d.get('_pg') or {}).keys())
        await save_reopen(pg)
        await ev(pg, f"{P}.setDevice('sp')"); await pg.wait_for_timeout(300); gsp_after = (await ev(pg, f"{P}.geometry()")).get(addp); await ev(pg, f"{P}.setDevice('pc')")
        same = bool(gsp_before and gsp_after and abs(gsp_before['x'] - gsp_after['x']) <= 0.5 and abs(gsp_before['y'] - gsp_after['y']) <= 0.5 and abs(gsp_before['w'] - gsp_after['w']) <= 0.5 and abs(gsp_before['h'] - gsp_after['h']) <= 0.5)
        rec('S16 足した写真＋SP見せる範囲＋開き直し', in_added and bool(sp_view) and same and r1, f"added に入る={in_added} adjust.sp[{addp}].view={sp_view} SP 位置大きさ 開き直し前後一致={same}")

        # S17 S16 の後、テンプレ写真 F_p0 を SP で大きさ変更 → 足した写真の SP 大きさは変わらない（独立・今の動き）
        await ev(pg, f"{P}.setDevice('sp')"); await pg.wait_for_timeout(300)
        a_before = (await ev(pg, f"{P}.geometry()")).get(addp)
        ops0 = await ev(pg, f"{P}.ops()")
        await apply(pg, ops0 + [{'t': 'size', 'device': 'sp', 'id': 'F_p0', 'w': 120}])
        a_after = (await ev(pg, f"{P}.geometry()")).get(addp); await ev(pg, f"{P}.setDevice('pc')")
        unchanged = bool(a_before and a_after and abs(a_before['w'] - a_after['w']) <= 0.5)
        rec('S17 コピー元の大きさ変更は足した写真に効かない', unchanged, f"足した写真の SP 幅 {a_before['w'] if a_before else '?'}→{a_after['w'] if a_after else '?'}（独立＝変わらないのが今の動き）")

        # S18 S16 の後、テンプレ写真 F_p0 を消す → 開き直す → 足した写真は出る（独立）
        pg = await fresh()
        before18 = set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_'))
        async with pg.expect_file_chooser() as fc: await pg.click('#tPhoto')
        await (await fc.value).set_files(os.path.join(IMG, imgs[0])); await pg.wait_for_timeout(1000)
        addp = list(set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_')) - before18)[0]
        await ev(pg, f"{P}.selectOnly('F_p0'); {P}.deleteSelected()"); await pg.wait_for_timeout(200)
        await save_reopen(pg)
        await ev(pg, f"{P}.setDevice('sp')"); await pg.wait_for_timeout(300); g = await ev(pg, f"{P}.geometry()"); await ev(pg, f"{P}.setDevice('pc')")
        shows = addp in g; r1 = await rt_ok(pg); _pg_keys_seen |= set(((await draft_obj(pg)).get('_pg') or {}).keys())
        rec('S18 コピー元を消しても足した写真は残る', shows, f"F_p0 削除＋開き直し後に {addp} が出る={shows} 位置={g.get(addp) if shows else None}")

        # S19 足した写真を PC で動かす → 元の位置に戻す → 開き直す → adjust.pc[id] が消える・自動の位置
        pg = await fresh()
        before19 = set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_'))
        async with pg.expect_file_chooser() as fc: await pg.click('#tPhoto')
        await (await fc.value).set_files(os.path.join(IMG, imgs[0])); await pg.wait_for_timeout(1000)
        addp = list(set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_')) - before19)[0]
        await ev(pg, f"{P}.selectOnly('{addp}'); {P}.nudge('{addp}',40,40)"); await pg.wait_for_timeout(200)
        d = await draft_obj(pg); had_place = bool(d.get('adjust', {}).get('pc', {}).get(addp, {}).get('place'))
        await ev(pg, f"{P}.resetScope('part','{addp}',['pc'])"); await pg.wait_for_timeout(200)
        await save_reopen(pg)
        d = await draft_obj(pg); gone = not (d.get('adjust', {}).get('pc', {}).get(addp, {}).get('place')); r1 = await rt_ok(pg); _pg_keys_seen |= set((d.get('_pg') or {}).keys())
        rec('S19 足した写真を元の位置に戻す', had_place and gone and r1, f"動かした後 place あり={had_place}・元に戻して開き直した後 place 無し={gone}")

        # S20 X36：足した文字・足した写真・テンプレ見出しを矢印キーで動かす（→×3 ↓×2 Shift+↓×1、Cmd+Z×6 で戻る）
        pg = await fresh()
        before20 = set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_'))
        async with pg.expect_file_chooser() as fc: await pg.click('#tPhoto')
        await (await fc.value).set_files(os.path.join(IMG, imgs[0])); await pg.wait_for_timeout(1000)
        addp = list(set(x['part'] for x in await ev(pg, f"{P}.photos()") if x['part'].startswith('addp_')) - before20)[0]
        addt = await ev(pg, f"{P}.addTextAtPoint('feature',400,300)"); await pg.wait_for_timeout(200); await ev(pg, f"if({P}.editingId()) {P}.commitEdit()"); await pg.wait_for_timeout(150)
        async def arrows(pg, pid):
            await ev(pg, f"{P}.selectOnly('{pid}')"); await pg.wait_for_timeout(100)
            g0 = (await ev(pg, f"{P}.geometry()")).get(pid)
            for _ in range(3): await pg.keyboard.press('ArrowRight')
            for _ in range(2): await pg.keyboard.press('ArrowDown')
            await pg.keyboard.press('Shift+ArrowDown'); await pg.wait_for_timeout(150)
            g1 = (await ev(pg, f"{P}.geometry()")).get(pid)
            for _ in range(6): await pg.keyboard.press('Meta+z')
            await pg.wait_for_timeout(200)
            g2 = (await ev(pg, f"{P}.geometry()")).get(pid)
            moved = bool(g0 and g1 and abs(g1['x'] - g0['x'] - 3) <= 1 and abs(g1['y'] - g0['y'] - 12) <= 1)
            back = bool(g0 and g2 and abs(g2['x'] - g0['x']) <= 1 and abs(g2['y'] - g0['y']) <= 1)
            return moved, back
        mt, bt = await arrows(pg, addt); mp, bp = await arrows(pg, addp); mh, bh = await arrows(pg, 'F_h0')
        rec('S20 矢印キー（X36 足した部品も動く）', mt and mp and mh and bt and bp and bh, f"足し文字 動いた={mt}/戻る={bt} 足し写真 動いた={mp}/戻る={bp} 見出し 動いた={mh}/戻る={bh}（→3,↓2,Shift↓1＝x+3,y+12）")

        # S21 _pg に品・表の行のほかに何か残っていないか（S1〜S20 で見た _pg のキー）
        d = await draft_obj(pg); _pg_keys_seen |= set((d.get('_pg') or {}).keys())
        only_rows = _pg_keys_seen <= {'rows'}
        rec('S21 _pg は rows だけ', only_rows, f"S1〜S20 で見た _pg のキー={sorted(_pg_keys_seen)}（rows だけが正）")

        # ===== 試験台24c（S22〜S28）=====
        def bare_feature_refs(d):   # 複製セクションの entry が、素の（元の特集の）ID を指していないか集める
            bad = []
            FEAT = {'F_h0', 'F_b0', 'F_p0', 'F_h1', 'F_b1', 'F_p1', 'F_hg', 'F_lbl', 'F_h', 'F_rule'}
            adj = d.get('adjust', {})
            for dev in ('pc', 'sp'):
                for key, e in (adj.get(dev) or {}).items():
                    if not key.startswith('sec'):
                        continue
                    if isinstance(e.get('place'), dict) and e['place'].get('after') in FEAT: bad.append(f"adjust.{dev}.{key}.place.after={e['place']['after']}")
                    if isinstance(e.get('order'), list):
                        for ch in e['order']:
                            if ch in FEAT: bad.append(f"adjust.{dev}.{key}.order⊃{ch}")
            return bad

        # S22 特集を複製 → 複製側で 塊の外へ移動・文字貼り付け・並び替え → draft() の参照がすべて sec*__…
        pg = await fresh()
        await ev(pg, f"{P}.sectionDuplicate('feature')"); await pg.wait_for_timeout(300)
        secs = [s['id'] for s in await ev(pg, f"{P}.sectionList()")]; dupId = next((s for s in secs if s not in ('feature', 'items')), None)
        ops0 = await ev(pg, f"{P}.ops()")
        extra = [
            {'t': 'move', 'device': 'pc', 'items': [{'id': dupId + '__F_b0', 'mode': 'M2', 'anchor': 'F_p0', 'gapY': 40, 'x': 120}]},
            {'t': 'add', 'id': 'add_1', 'section': dupId, 'kind': 'text', 'styleName': 'featBody', 'w': 600, 'wOther': 351, 'text': '貼り付け', 'anchor': 'F_b0', 'gap': 16, 'gapOther': 16, 'x': '@left', 'placedDevice': 'pc', 'placed': {'device': 'pc', 'anchor': 'F_b0', 'gapY': 16, 'x': 100}},
            {'t': 'reorder', 'device': 'pc', 'key': dupId + '__Ftg1', 'id': dupId + '__F_h1', 'order': [dupId + '__F_b1', dupId + '__F_h1']},
        ]
        await apply(pg, ops0 + extra)
        d = await draft_obj(pg); bad = bare_feature_refs(d); r1 = await rt_ok(pg); _pg_keys_seen |= set((d.get('_pg') or {}).keys())
        apc = (d.get('adjust', {}).get('pc') or {})
        after_ref = apc.get(dupId + '__F_b0', {}).get('place', {}).get('after')
        add1 = next((a for a in d.get('added', []) if a['id'] == 'add_1'), {})
        order_ref = apc.get(dupId + '__Ftg1', {}).get('order')
        rec('S22 複製の参照はすべて全部の ID', not bad and after_ref == dupId + '__F_p0' and add1.get('anchor') == dupId + '__F_b0' and order_ref == [dupId + '__F_b1', dupId + '__F_h1'] and r1,
            f"place.after={after_ref} add_1.anchor={add1.get('anchor')}/section={add1.get('section')} order={order_ref} 素の参照={bad}")

        # S23 S22 の後、開き直す → 位置・大きさのずれ
        await ev(pg, f"{P}.setDevice('pc')"); await pg.wait_for_timeout(100); gpc0 = await ev(pg, f"{P}.geometry()")
        await ev(pg, f"{P}.setDevice('sp')"); await pg.wait_for_timeout(200); gsp0 = await ev(pg, f"{P}.geometry()"); await ev(pg, f"{P}.setDevice('pc')")
        await save_reopen(pg)
        gpc1 = await ev(pg, f"{P}.geometry()"); await ev(pg, f"{P}.setDevice('sp')"); await pg.wait_for_timeout(200); gsp1 = await ev(pg, f"{P}.geometry()"); await ev(pg, f"{P}.setDevice('pc')")
        def maxd(a, b):
            m = 0.0
            for k in set(a) & set(b): m = max(m, abs(a[k]['x'] - b[k]['x']), abs(a[k]['y'] - b[k]['y']), abs(a[k]['w'] - b[k]['w']), abs(a[k]['h'] - b[k]['h']))
            return m
        dpc = maxd(gpc0, gpc1); dsp = maxd(gsp0, gsp1); r1 = await rt_ok(pg)
        rec('S23 複製を編集して開き直す', dpc <= 0.5 and dsp <= 0.5 and r1, f"開き直し前後の最大ずれ PC={dpc:.2f} SP={dsp:.2f} roundTrip={'ok' if r1 else 'NG'}")

        # S24 S22 の後、元の特集を消す → 開き直す → 複製側の位置が同じ
        pg = await fresh()
        await ev(pg, f"{P}.sectionDuplicate('feature')"); await pg.wait_for_timeout(300)
        secs = [s['id'] for s in await ev(pg, f"{P}.sectionList()")]; dupId = next((s for s in secs if s not in ('feature', 'items')), None)
        ops0 = await ev(pg, f"{P}.ops()")
        await apply(pg, ops0 + [{'t': 'move', 'device': 'pc', 'items': [{'id': dupId + '__F_b0', 'mode': 'M2', 'anchor': 'F_p0', 'gapY': 40, 'x': 120}]}])
        g_before = (await ev(pg, f"{P}.geometry()")).get(dupId + '__F_b0')
        await ev(pg, f"{P}.sectionDelete('feature')"); await pg.wait_for_timeout(200)
        await save_reopen(pg)
        g_after = (await ev(pg, f"{P}.geometry()")).get(dupId + '__F_b0'); r1 = await rt_ok(pg)
        same = bool(g_before and g_after and abs(g_before['x'] - g_after['x']) <= 0.5 and abs(g_before['y'] - g_after['y']) <= 0.5)
        rec('S24 元の特集を消して開き直す', same and r1, f"複製側 {dupId}__F_b0 の位置 消す前={g_before}→開き直し後={g_after} 同じ={same}")

        # S25 空の入れ物を書かない
        pg = await fresh()
        d0 = await draft_obj(pg); keys0 = sorted(d0.keys())
        await apply(pg, [{'t': 'move', 'device': 'pc', 'items': [{'id': 'F_h0', 'mode': 'M1', 'dx': 10, 'dy': 10}]}])
        d1 = await draft_obj(pg); adj = d1.get('adjust', {})
        no_empty = all(k not in d0 for k in ('content', 'added', 'removed', 'textStyle', 'adjust', '_pg', 'seq')) and ('sp' not in adj) and ('pc' in adj)
        rec('S25 空の入れ物を書かない', keys0 == ['sections', 'template'] and no_empty, f"何もしない draft のキー={keys0}／PC1つ動かした後 adjust のキー={sorted(adj.keys())}（sp 無し）")

        # S26 I_kanmi 書き換え・I_time 一部赤 → 開き直す
        pg = await fresh()
        await apply(pg, [{'t': 'edit', 'id': 'I_kanmi', 'text': '甘味処（季節）'}, {'t': 'edit', 'id': 'I_time', 'runs': [{'text': '提供時間 '}, {'text': '11:00〜17:00', 'color': '#C03030'}]}])
        k1 = await ev(pg, "(()=>{const e=document.querySelector('[data-el=\"I_kanmi\"]');return e?e.innerText:null})()")
        d = await draft_obj(pg); c_kanmi = (d.get('content') or {}).get('I_kanmi'); c_time = (d.get('content') or {}).get('I_time'); r1 = await rt_ok(pg)
        await save_reopen(pg)
        k2 = await ev(pg, "(()=>{const e=document.querySelector('[data-el=\"I_kanmi\"]');return e?e.innerText:null})()")
        d2 = await draft_obj(pg); c_kanmi2 = (d2.get('content') or {}).get('I_kanmi'); c_time2 = (d2.get('content') or {}).get('I_time')
        rec('S26 甘味処の見出し・時間（X37）', ('甘味処（季節）' in (k1 or '')) and c_kanmi == '甘味処（季節）' and isinstance(c_time, list) and k1 == k2 and c_kanmi2 == c_kanmi and c_time2 == c_time and r1,
            f"画面={k1!r}→開き直し後={k2!r} content.I_kanmi={c_kanmi!r} content.I_time={('runs' if isinstance(c_time,list) else c_time)}")

        # S27 品のセクションを複製 → 複製側の I_kanmi を書き換え（元は変わらない・キーは sec*__I_kanmi）
        pg = await fresh()
        await ev(pg, f"{P}.sectionDuplicate('items')"); await pg.wait_for_timeout(300)
        secs = [s['id'] for s in await ev(pg, f"{P}.sectionList()")]; dupI = next((s for s in secs if s not in ('feature', 'items')), None)
        ops0 = await ev(pg, f"{P}.ops()")
        await apply(pg, ops0 + [{'t': 'edit', 'id': dupI + '__I_kanmi', 'text': '複製の甘味処'}])
        d = await draft_obj(pg); cont = d.get('content') or {}; r1 = await rt_ok(pg); _pg_keys_seen |= set((d.get('_pg') or {}).keys())
        origK = await ev(pg, "(()=>{const hs=[...document.querySelectorAll('[data-el=\"I_kanmi\"]')];return hs.length?hs[0].innerText:null})()")
        rec('S27 品の複製側の甘味処', (dupI + '__I_kanmi') in cont and 'I_kanmi' not in cont and r1, f"content に {dupI}__I_kanmi={cont.get(dupI+'__I_kanmi')!r}・元の I_kanmi={cont.get('I_kanmi')}（元は content に出ない＝変えていない）")

        # S28 I_kanmi を太字 → 文字の見た目を元に戻す → 太字が消える
        pg = await fresh()
        await apply(pg, [{'t': 'tstyle', 'keys': ['I_kanmi'], 'device': 'pc', 'weight': 700}])
        d = await draft_obj(pg); w1 = (d.get('textStyle', {}).get('I_kanmi', {}) or {}).get('weight')
        await apply(pg, [{'t': 'tstyleReset', 'keys': ['I_kanmi'], 'parts': ['I_kanmi']}])
        d = await draft_obj(pg); w2 = 'I_kanmi' in (d.get('textStyle') or {}); r1 = await rt_ok(pg)
        rec('S28 甘味処の見た目を元に戻す', w1 == 700 and not w2 and r1, f"太字後 weight={w1}・戻した後 textStyle に I_kanmi={w2}（無いのが正）")

        await br.close()
        npass = sum(1 for _, o, _ in R if o is True); nng = sum(1 for _, o, _ in R if o is False)
        print(f"\n合計 {npass} / {npass + nng}（-- は値のみ={sum(1 for _,o,_ in R if o is None)}）", flush=True)
        print('NG ' + json.dumps([k for k, o, _ in R if o is False], ensure_ascii=False) if nng else 'NG: []', flush=True)
        sys.exit(0 if nng == 0 else 1)

asyncio.run(main())
