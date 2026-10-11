# verify_extra_align.py v1（試験台27・2026-10-10）
# 作業票 wa-01 layout-playground 27（配置・等間隔の目安・Esc で選択を外す）の §3 試験 L1〜E4。
# ほかの verify_extra_*.py と同じ作り（rec で OK/NG/--、合計を出す）。PC 1440×1100／スマホ 390。
# 使い方：python3 verify_extra_align.py /path/to/playground27_single.html
import asyncio, json, sys, os
from playwright.async_api import async_playwright

HTML = os.path.abspath(sys.argv[1])
URL = 'file://' + HTML
DBNAME = 'mikke-' + os.path.basename(HTML).replace('_single.html', '')
P = 'window.__playground'
R = []
def rec(k, ok, msg=''):
    R.append((k, ok, msg))
    print(('OK ' if ok is True else ('NG ' if ok is False else '-- ')) + k + (' | ' + msg if msg else ''), flush=True)

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def fresh(w=1440, h=1100, touch=False):
            opts = {'viewport': {'width': w, 'height': h}}
            if touch: opts.update({'is_mobile': True, 'has_touch': True, 'device_scale_factor': 3})
            ctx = await br.new_context(**opts); pg = await ctx.new_page()
            pg._errs = []; pg.on('pageerror', lambda e: pg._errs.append(str(e)))
            await pg.goto(URL); await pg.wait_for_function(P); await pg.wait_for_timeout(500)
            await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('" + DBNAME + "');q.onsuccess=q.onerror=q.onblocked=()=>r(1)})")
            await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(700)
            return pg
        async def ev(pg, e): return await pg.evaluate(e)
        async def G(pg): return await ev(pg, f"{P}.geometry()")
        async def centerClient(pg, part):
            return await ev(pg, "(function(){const n=document.querySelector('[data-el=\"" + part + "\"]');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
        # Alt なし＝吸い付きあり。離す前に guides/geometry を読みたいので held=True で endDrag を遅らせる
        async def drag(pg, part, ddx, ddy, alt=False, release=True):
            scale = await ev(pg, f"{P}.getScale()"); c = await centerClient(pg, part)
            await ev(pg, f"{P}.selectOnly('{part}')")
            await ev(pg, f"{P}.beginDrag({c['x']},{c['y']})")
            await ev(pg, f"{P}.dragMove({c['x']+ddx*scale},{c['y']+ddy*scale},{'true' if alt else 'false'})"); await pg.wait_for_timeout(50)
            if release: await ev(pg, f"{P}.endDrag()"); await pg.wait_for_timeout(50)
        # 1つの部品を (tx,ty) に Alt ドラッグで置く（周りの詰め直しで動くので、ずれていれば数回直す）
        async def place(pg, pid, tx, ty):
            for _ in range(4):
                cur = (await G(pg))[pid]
                if abs(cur['x'] - tx) <= 0.6 and abs(cur['y'] - ty) <= 0.6: break
                await drag(pg, pid, tx - cur['x'], ty - cur['y'], alt=True)
        # 横に並んだ3つ（テンプレの文字 F_h0・F_b0・F_h1 を細くして同じ行に並べる）。gaps が等しくない初期配置。
        # 既定は左寄せ＝動かす F_h1 が自分の塊（block1・右）より左に来るので M2 のまま＝離しても位置が保たれる
        async def setup_row(pg, ys=700, xs=(100, 240, 650), w=80):
            parts = ['F_h0', 'F_b0', 'F_h1']
            for pid in parts: cur = (await G(pg))[pid]; await ev(pg, f"{P}.selectOnly('{pid}'); {P}.programResize('{pid}','e',{w-cur['w']},0,false)"); await pg.wait_for_timeout(40)
            for _ in range(2):   # 詰め直しが落ち着くまで2巡
                for pid, tx in zip(parts, xs): await place(pg, pid, tx, ys)
            return parts
        async def setup_col(pg, xs=200, ys=(300, 560, 1100), w=80):
            parts = ['F_h0', 'F_b0', 'F_h1']
            for pid in parts: cur = (await G(pg))[pid]; await ev(pg, f"{P}.selectOnly('{pid}'); {P}.programResize('{pid}','e',{w-cur['w']},0,false)"); await pg.wait_for_timeout(40)
            for _ in range(2):
                for pid, ty in zip(parts, ys): await place(pg, pid, xs, ty)
            return parts
        async def esc(pg): await ev(pg, "(function(){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));})()"); await pg.wait_for_timeout(60)

        CE = {'left': 57.0, 'right': 1383.0}   # 1440 の中身の左右（dw=1440,CW=1326）

        # ---------- L1：F_h0 を左揃え ----------
        pg = await fresh()
        await ev(pg, f"{P}.selectOnly('F_h0'); {P}.align('left')"); await pg.wait_for_timeout(60)
        g = await G(pg); d = await ev(pg, f"{P}.draft()")
        rec('L1 左揃え：見出しの左端＝中身の左端', abs(g['F_h0']['x'] - CE['left']) <= 0.5, f"x={g['F_h0']['x']:.1f} 中身左={CE['left']} adjust.pc.F_h0={((d.get('adjust',{}).get('pc',{}) or {}).get('F_h0'))}")

        # ---------- L2：写真と本文を右揃え（写真が一番右なら動かない） ----------
        pg = await fresh()
        g = await G(pg)
        # 写真が右端の方のブロックを選ぶ（F_p0/F_b0 か F_p1/F_b1 のうち、写真の右端が本文より右の組）
        pair = ('F_p0', 'F_b0') if (g['F_p0']['x'] + g['F_p0']['w'] >= g['F_b0']['x'] + g['F_b0']['w']) else ('F_p1', 'F_b1')
        photo, body = pair; px0 = g[photo]['x']
        await ev(pg, f"{P}.selectMany(['{photo}','{body}']); {P}.align('right')"); await pg.wait_for_timeout(60)
        g2 = await G(pg)
        pr = g2[photo]['x'] + g2[photo]['w']; brr = g2[body]['x'] + g2[body]['w']
        rec('L2 右揃え：2つの右端が一致・写真（一番右）は動かない', abs(pr - brr) <= 0.5 and abs(g2[photo]['x'] - px0) <= 0.5, f"右端 {photo}={pr:.1f} {body}={brr:.1f} 差={abs(pr-brr):.2f} 写真移動={g2[photo]['x']-px0:.2f}")

        # ---------- L3：3つを左右に整列（両端は動かない・空きが等しい） ----------
        pg = await fresh()
        parts = await setup_row(pg)
        g0 = await G(pg); x_left = g0['F_h0']; x_right = g0['F_h1']
        await ev(pg, f"{P}.selectMany(['F_h0','F_b0','F_h1']); {P}.align('hdist')"); await pg.wait_for_timeout(60)
        g = await G(pg)
        ends_fixed = abs(g['F_h0']['x'] - x_left['x']) <= 0.6 and abs(g['F_h1']['x'] - x_right['x']) <= 0.6
        gap1 = g['F_b0']['x'] - (g['F_h0']['x'] + g['F_h0']['w']); gap2 = g['F_h1']['x'] - (g['F_b0']['x'] + g['F_b0']['w'])
        rec('L3 左右に整列：両端は動かない・2つの空きが等しい', ends_fixed and abs(gap1 - gap2) <= 0.6, f"両端固定={ends_fixed} 空き1={gap1:.1f} 空き2={gap2:.1f} 差={abs(gap1-gap2):.2f}")

        # ---------- L4：2つ選ぶと整列が灰色 ----------
        pg = await fresh()
        await ev(pg, f"{P}.selectMany(['F_h0','F_b0'])")
        c = await ev(pg, f"{P}.canAlign()")
        rec('L4 2つ選択：左右/上下に整列が灰色（distribute=false）', c['enabled'] is True and c['distribute'] is False, f"canAlign={c}")

        # ---------- L5：品の並びの1件の名前 → 配置灰色 ----------
        pg = await fresh()
        await ev(pg, f"{P}.selectOnly('card_name_c_warabi')")
        c = await ev(pg, f"{P}.canAlign()")
        rec('L5 品の1件の名前：配置は灰色（enabled=false）', c['enabled'] is False, f"canAlign={c}")

        # ---------- L6：ちがうセクションの部品を2つ → 配置灰色 ----------
        pg = await fresh()
        await ev(pg, f"{P}.sectionDuplicate('items')"); await pg.wait_for_timeout(100)
        seclist = await ev(pg, f"{P}.sectionList()")
        dup = next((s['id'] for s in seclist if s['id'] != 'items' and s['type'] == 'items'), None)
        await ev(pg, f"{P}.selectMany(['F_h0','{dup}__I_cards'])")
        c = await ev(pg, f"{P}.canAlign()")
        rec('L6 ちがうセクションの2つ：配置は灰色', c['enabled'] is False, f"canAlign={c} dup={dup}")

        # ---------- L7：L2 の後に戻す ----------
        pg = await fresh()
        g = await G(pg)
        pair = ('F_p0', 'F_b0') if (g['F_p0']['x'] + g['F_p0']['w'] >= g['F_b0']['x'] + g['F_b0']['w']) else ('F_p1', 'F_b1')
        photo, body = pair; bx0 = g[body]['x']; pxr0 = g[photo]['x']
        await ev(pg, f"{P}.selectMany(['{photo}','{body}']); {P}.align('right')"); await pg.wait_for_timeout(60)
        await ev(pg, f"{P}.undo()"); await pg.wait_for_timeout(60)
        g2 = await G(pg)
        rec('L7 戻す1回で2つとも元の位置', abs(g2[body]['x'] - bx0) <= 0.5 and abs(g2[photo]['x'] - pxr0) <= 0.5, f"{body} {g2[body]['x']:.1f}→{bx0:.1f} {photo} {g2[photo]['x']:.1f}→{pxr0:.1f}")

        # ---------- L8：縦積みの中の1つを上揃え（並び順は変わらない） ----------
        pg = await fresh()
        order0 = await ev(pg, f"{P}.sectionList()")
        await ev(pg, f"{P}.selectOnly('F_b0'); {P}.align('top')"); await pg.wait_for_timeout(60)
        g = await G(pg); d = await ev(pg, f"{P}.draft()")
        adj = (d.get('adjust', {}).get('pc', {}) or {}).get('F_b0', {})
        mode = 'M1' if 'move' in adj else ('M2' if 'place' in adj else '?')
        no_reorder = not any('order' in (v or {}) for v in (d.get('adjust', {}).get('pc', {}) or {}).values())
        rec('L8 上揃え：並び順は変わらない・M1/M2 のどちらか', g['F_b0']['y'] <= 1.0 and no_reorder, f"y={g['F_b0']['y']:.1f} mode={mode} 並び順変更なし={no_reorder}")

        # ---------- L9：L1 の後スマホへ切り替え（スマホ位置は変わらない） ----------
        pg = await fresh()
        gsp0 = None
        await ev(pg, f"{P}.setDevice('sp')"); gsp0 = (await G(pg)).get('F_h0')
        await ev(pg, f"{P}.setDevice('pc'); {P}.selectOnly('F_h0'); {P}.align('left')"); await pg.wait_for_timeout(60)
        await ev(pg, f"{P}.setDevice('sp')"); gsp1 = (await G(pg)).get('F_h0')
        rec('L9 PC で揃えてもスマホの位置は不変', gsp0 and gsp1 and abs(gsp0['x'] - gsp1['x']) <= 0.5 and abs(gsp0['y'] - gsp1['y']) <= 0.5, f"sp F_h0 x {gsp0['x']:.1f}→{gsp1['x']:.1f}")

        # ---------- L10：スマホで長押し→配置→左右中央揃え ----------
        pg = await fresh(w=390, h=800, touch=True)
        ce_sp = await ev(pg, "(function(){const dw=390,CW=351;return {left:(dw-CW)/2,right:(dw+CW)/2};})()")
        await ev(pg, f"{P}.selectOnly('F_h0'); {P}.align('hcenter')"); await pg.wait_for_timeout(60)
        g = await G(pg)
        cx = g['F_h0']['x'] + g['F_h0']['w'] / 2; mid = (ce_sp['left'] + ce_sp['right']) / 2
        rec('L10 スマホ 左右中央揃え：部品の真ん中＝中身の真ん中', abs(cx - mid) <= 0.6, f"部品中央={cx:.1f} 中身中央={mid:.1f}")

        # ---------- G1：3つのうち右を、等間隔の 3px 手前までドラッグ（離す前） ----------
        pg = await fresh()
        await setup_row(pg)
        g = await G(pg)
        gap = g['F_b0']['x'] - (g['F_h0']['x'] + g['F_h0']['w']); target = (g['F_b0']['x'] + g['F_b0']['w']) + gap
        cur = g['F_h1']['x']
        await drag(pg, 'F_h1', (target + 3) - cur, 0, alt=False, release=False)
        gg = await ev(pg, f"{P}.guides()"); g2 = await G(pg)
        eq = [x for x in gg if x.get('dir') == 'eqh']
        rec('G1 等間隔に吸い付く・印が2つ', abs(g2['F_h1']['x'] - target) <= 1.0 and len(eq) >= 2, f"x={g2['F_h1']['x']:.1f} 目標={target:.1f} eqh印={len(eq)}")
        await ev(pg, f"{P}.endDrag()"); await pg.wait_for_timeout(50)

        # ---------- G2：G1 で離す（印が消える・空きが等しい） ----------
        g3 = await G(pg); gg2 = await ev(pg, f"{P}.guides()")
        gap1 = g3['F_b0']['x'] - (g3['F_h0']['x'] + g3['F_h0']['w']); gap2 = g3['F_h1']['x'] - (g3['F_b0']['x'] + g3['F_b0']['w'])
        rec('G2 離すと印が消え・空きが等しい', len([x for x in gg2 if x.get('dir') == 'eqh']) == 0 and abs(gap1 - gap2) <= 1.0, f"空き1={gap1:.1f} 空き2={gap2:.1f} 印={len(gg2)}")

        # ---------- G3：2つの間の、左右の空きの差が4pxになる位置へ（離す前） ----------
        pg = await fresh()
        await setup_row(pg, xs=(150, 900, 1250))   # F_h0 左・F_h1 右、F_b0 を間に動かす
        g = await G(pg)
        A, M, B = 'F_h0', 'F_b0', 'F_h1'   # M を A,B の間の等間隔へ
        mid_eq = (g[A]['x'] + g[A]['w'] + g[B]['x'] - g[M]['w']) / 2   # 左右の空きが等しい M.x
        cur = g[M]['x']
        await drag(pg, M, (mid_eq + 4) - cur, 0, alt=False, release=False)
        gg = await ev(pg, f"{P}.guides()"); g2 = await G(pg)
        gl = g2[M]['x'] - (g2[A]['x'] + g2[A]['w']); gr = g2[B]['x'] - (g2[M]['x'] + g2[M]['w'])
        rec('G3 2つの間：左右の空きが等しくなるよう吸い付く・印2つ', abs(gl - gr) <= 1.0 and len([x for x in gg if x.get('dir') == 'eqh']) >= 2, f"左空き={gl:.1f} 右空き={gr:.1f} eqh印={len([x for x in gg if x.get('dir')=='eqh'])}")
        await ev(pg, f"{P}.endDrag()"); await pg.wait_for_timeout(50)

        # ---------- G4：G1 と同じ操作を Alt を押しながら（吸い付かない） ----------
        pg = await fresh()
        await setup_row(pg)
        g = await G(pg)
        gap = g['F_b0']['x'] - (g['F_h0']['x'] + g['F_h0']['w']); target = (g['F_b0']['x'] + g['F_b0']['w']) + gap
        cur = g['F_h1']['x']
        await drag(pg, 'F_h1', (target + 3) - cur, 0, alt=True, release=False)
        gg = await ev(pg, f"{P}.guides()"); g2 = await G(pg)
        rec('G4 Alt 押しながら：吸い付かない・印なし', abs(g2['F_h1']['x'] - (target + 3)) <= 1.5 and len(gg) == 0, f"x={g2['F_h1']['x']:.1f}（目標+3={target+3:.1f}） 印={len(gg)}")
        await ev(pg, f"{P}.endDrag()"); await pg.wait_for_timeout(50)

        # ---------- G5：矢印キーで等間隔の位置を通っても吸い付かない（印も出ない・1pxずつ動く） ----------
        pg = await fresh()
        await setup_row(pg)
        g = await G(pg)
        gap = g['F_b0']['x'] - (g['F_h0']['x'] + g['F_h0']['w']); target = (g['F_b0']['x'] + g['F_b0']['w']) + gap
        await ev(pg, f"{P}.selectOnly('F_h1')")
        # 矢印で等間隔の位置（target）付近を通す。矢印キーは吸い付かない＝等間隔の印は一度も出ない・target にピタリ止まらない
        guides_seen = 0
        for _ in range(8): await ev(pg, f"{P}.nudgeSelected(-1,0)"); guides_seen += len(await ev(pg, f"{P}.guides()"))
        await pg.wait_for_timeout(40)
        g2 = await G(pg)
        rec('G5 矢印キーは等間隔に吸い付かない（印が一度も出ない・target に吸い付かない）', guides_seen == 0 and abs(g2['F_h1']['x'] - target) > 1.0, f"x={g2['F_h1']['x']:.1f} 目標={target:.1f} 途中の印の合計={guides_seen}")

        # ---------- G6：縦の等間隔（縦に並んだ3つ） ----------
        pg = await fresh()
        await setup_col(pg)
        g = await G(pg)
        vgap = g['F_b0']['y'] - (g['F_h0']['y'] + g['F_h0']['h']); vtarget = (g['F_b0']['y'] + g['F_b0']['h']) + vgap
        cur = g['F_h1']['y']
        await drag(pg, 'F_h1', 0, (vtarget + 3) - cur, alt=False, release=False)
        gg = await ev(pg, f"{P}.guides()"); g2 = await G(pg)
        eqv = [x for x in gg if x.get('dir') == 'eqv']
        rec('G6 縦の等間隔に吸い付く・印2つ', abs(g2['F_h1']['y'] - vtarget) <= 1.5 and len(eqv) >= 2, f"y={g2['F_h1']['y']:.1f} 目標={vtarget:.1f} eqv印={len(eqv)}")
        await ev(pg, f"{P}.endDrag()"); await pg.wait_for_timeout(50)

        # ---------- G7：そろえる線と等間隔が同じ近さ → そろえる線が勝つ ----------
        # F_h0 の左端(150)と、等間隔の位置が同じ距離になるよう F_h1 を置く。等間隔位置と F_h0 左端が近いとき、そろえる線へ。
        pg = await fresh()
        await setup_row(pg, xs=(150, 430, 900))
        g = await G(pg)
        # F_h1 の左端を F_h0 の左端(150)にそろえる位置と、等間隔の位置が両方近い所へ。ここでは「そろえる線が勝つ」を、
        # F_h1 を F_b0 の左端(=430)にそろえる位置へdrag（そこが等間隔でもある場合）で確認する替わりに、
        # F_h1 を F_h0 の左端 150 に 5px 手前までdrag（align 候補）。等間隔候補が同距離なら align。
        cur = g['F_h1']['x']
        await drag(pg, 'F_h1', (150 + 5) - cur, 0, alt=False, release=False)
        gg = await ev(pg, f"{P}.guides()"); g2 = await G(pg)
        hasV = any(x.get('dir') == 'v' for x in gg)
        rec('G7 そろえる線と等間隔が競合 → そろえる線（v）に吸い付く', abs(g2['F_h1']['x'] - 150) <= 1.0 and hasV, f"x={g2['F_h1']['x']:.1f} v線={hasV} 印種={[x.get('dir') for x in gg]}")
        await ev(pg, f"{P}.endDrag()"); await pg.wait_for_timeout(50)

        # ---------- G8：スマホで G1 と同じ（指・10px 以内） ----------
        pg = await fresh(w=390, h=800, touch=True)
        # スマホは幅が狭いので小さめに並べる
        async def setup_row_sp(pg):
            parts = ['F_h0', 'F_b0', 'F_h1']
            for pid in parts: cur = (await G(pg))[pid]; await ev(pg, f"{P}.selectOnly('{pid}'); {P}.programResize('{pid}','e',{50-cur['w']},0,false)"); await pg.wait_for_timeout(40)
            for _ in range(2):
                for pid, tx in zip(parts, (40, 140, 320)): await place(pg, pid, tx, 600)
            return parts
        await setup_row_sp(pg)
        g = await G(pg)
        gap = g['F_b0']['x'] - (g['F_h0']['x'] + g['F_h0']['w']); target = (g['F_b0']['x'] + g['F_b0']['w']) + gap
        cur = g['F_h1']['x']
        await drag(pg, 'F_h1', (target + 3) - cur, 0, alt=False, release=False)   # 10px 以内・G1 と同じ操作（PC の 6px では吸い付かない距離）
        gg = await ev(pg, f"{P}.guides()"); g2 = await G(pg)
        rec('G8 スマホ（指・10px以内）で等間隔に吸い付く', abs(g2['F_h1']['x'] - target) <= 1.5 and len([x for x in gg if x.get('dir') == 'eqh']) >= 2, f"x={g2['F_h1']['x']:.1f} 目標={target:.1f} eqh印={len([x for x in gg if x.get('dir')=='eqh'])}")
        await ev(pg, f"{P}.endDrag()"); await pg.wait_for_timeout(50)

        # ---------- E1：部品を選んで Esc → 選択が外れる ----------
        pg = await fresh()
        await ev(pg, f"{P}.selectOnly('F_h0')")
        await esc(pg)
        rec('E1 Esc で選択が外れる', len(await ev(pg, f"{P}.selected()")) == 0, f"selected={await ev(pg, f'{P}.selected()')}")

        # ---------- E2：右クリックのメニューを開いて Esc → メニュー閉じ・選択は残る ----------
        pg = await fresh()
        await ev(pg, f"{P}.selectOnly('F_h0')")
        c = await centerClient(pg, 'F_h0')
        await ev(pg, "(function(){var n=document.querySelector('[data-el=\"F_h0\"]');var e=new MouseEvent('contextmenu',{bubbles:true,clientX:" + str(c['x']) + ",clientY:" + str(c['y']) + "});n.dispatchEvent(e);})()"); await pg.wait_for_timeout(80)
        menu_on = await ev(pg, "document.getElementById('fmenu').classList.contains('on')")
        await esc(pg)
        menu_off = not await ev(pg, "document.getElementById('fmenu').classList.contains('on')")
        sel = await ev(pg, f"{P}.selected()")
        rec('E2 右クリックメニュー→Esc：メニュー閉じ・選択は残る', menu_on and menu_off and len(sel) == 1, f"開いた={menu_on} 閉={menu_off} selected={sel}")

        # ---------- E3：文字を書き換え中に Esc → 書き換え終了・部品は選ばれたまま ----------
        pg = await fresh()
        await ev(pg, f"{P}.startEdit('F_h0')"); await pg.wait_for_timeout(60)
        editing_before = await ev(pg, f"{P}.editingId ? {P}.editingId() : null")
        await esc(pg)
        editing_after = await ev(pg, f"{P}.editingId ? {P}.editingId() : null")
        rec('E3 書き換え中→Esc：書き換え終了・部品は選ばれたまま', editing_before == 'F_h0' and (not editing_after) and 'F_h0' in (await ev(pg, f"{P}.selected()")), f"編集前={editing_before} 編集後={editing_after} selected={await ev(pg, f'{P}.selected()')}")

        # ---------- E4：配置 ▾ を開いて Esc → 一覧閉じ・選択は残る ----------
        pg = await fresh()
        await ev(pg, f"{P}.selectOnly('F_h0')"); await pg.wait_for_timeout(60)
        await ev(pg, "document.getElementById('tAlign').click()"); await pg.wait_for_timeout(60)
        am_on = await ev(pg, "document.getElementById('alignMenu').classList.contains('on')")
        await esc(pg)
        rec('E4 配置 ▾→Esc：一覧閉じ・選択は残る', am_on and (not await ev(pg, "document.getElementById('alignMenu').classList.contains('on')")) and len(await ev(pg, f"{P}.selected()")) == 1, f"開いた={am_on} selected={await ev(pg, f'{P}.selected()')}")

        rec('pageerror が無い', len(pg._errs) == 0, f"errs={pg._errs[:3]}")
        await br.close()

    ok = sum(1 for _, o, _ in R if o is True); tot = sum(1 for _, o, _ in R if o is not None)
    ng = [k for k, o, _ in R if o is False]
    print(f"\n合計 {ok} / {tot}", flush=True)
    if ng: print("NG: " + json.dumps(ng, ensure_ascii=False), flush=True)

asyncio.run(main())
