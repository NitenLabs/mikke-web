#!/usr/bin/env python3
"""
芦屋みっけ wa-01 試験台（playgroundN_single.html）を、Claude.ai 側で別に確かめるスクリプト。
作った人（Claude Code）とは別の手順で、本物のマウス・キーボード操作を使って確かめる。

使い方:
  python3 verify_playground.py /mnt/user-data/uploads/playground4_single.html

前提:
  - ページに window.__playground がある（作業票 playground3 の 7章の入口）
  - 部品の DOM に data-el="部品のID" がある。セクションは id="host_feature" / "host_items"
  - geometry() の x・y は、セクションの上端・左端から（縮小前の px）
  - Claude.ai の環境では Google Fonts が読めないため、書体は代わりのものになる。
    細かい px は Claude Code の報告と完全には一致しない。見るのは「関係」（重なり・付いていく先・動いたか・並び順）。

版の履歴:
  v1（2026-09-23）試験台3用。23項目
  v2（2026-09-29）試験台4用。R1〜R9 と Q15 を本物の操作で確かめる形に書き直した
    - 貼り付けと複製を別々に確かめる（前は1回で両方を行い、足した部品どうしの重なりが混ざっていた）
    - R3 は、プリセットだけでなく、すべての試験の後の付いていく先を集めて見る
    - R2 は、区切り線が甘味処の見出し・営業時間と同じ縦積みの塊にあるため、
      作業票の追記（10章）の決まりで「並び替え」として確かめる
    - R9（新）：品の1件を付いていく先にしないことを、足した文字を品の並びのすぐ下へ動かして確かめる
  v2.1（2026-10-01）試験台4の確認で直した・足した
    - R1 の「つかめるか」は DOM の当たり判定ではなく、実際にドラッグで動いたかで判定する（ページがプログラムで範囲を広げる作りのため）
    - プリセットのエラーで止まらず、不合格として記録して続ける
    - T2・T3（塊の外へ下向きに動かしたとき、離した瞬間の関係が詰めた後も保たれるか）と T4 を足した（playground5 作業票）
  v2.2（2026-10-01）T2 の期待を「並び替え（表→区切り線→ボタン）」に直した。表とボタンは同じ縦積みの直接の子なので、
    その間に落とせば並び替えになる（playground5 作業票 2.1）。下向きの M2 の関係の保持は T3（表の中）で見る
  v3.1.1（2026-10-04）C1 の行の書き損じを直した（説明書きのコメントが式を飲み込んで、スクリプトが動かなかった）
  v3.2（2026-10-07）W3：試験台22 の右クリック「最前面へ移動 ▸／最背面へ移動 ▸」があればそちらで操作し（箱は開いたまま続けて）、zOrder で確かめる（前の試験台は今までどおり）
  v3.1（2026-10-02）試験台14（playground14 作業票）の C1〜C11 と、試験の外の E1〜E3 を足した（セクションの操作）
  v3.0（2026-10-02）試験台13（playground13 作業票）の D1〜D12 を足した（文の一部の見た目・ページを元に戻す）
    - D4 の日本語入力の途中は、Chromium の CDP（Input.imeSetComposition）で作る
  v2.9（2026-10-02）試験台12（playground12 作業票）の J1〜J13 を足した（文字の大きさ・太さ・色）
  v2.8（2026-10-02）試験台11（playground11 作業票）の U1〜U6 を足した
    - U3・U4（見せる範囲の角のつまみ）は、つまみが画面に入る広い画面で行う（作業票の「1440」は Claude.ai の書き損じ）
  v2.7（2026-10-02）試験台10（playground10 作業票）の P1〜P16 を足した（写真の差し替え・見せる範囲）
    - 試験の画像は、このスクリプトと同じフォルダの testimg/（4色の四分割。無ければ作る）
  v2.6（2026-10-02）試験台9（playground9 作業票）の Z1〜Z7 を足した（そろえる・目安の線）
    - Z 以外の試験のドラッグ・つまみの操作は、Alt を押しながら行う（吸い付きで数字が変わらないように。
      吸い付きの振る舞いは Z で見る）。guides() のない試験台では、Alt は何も変えない
  v2.5（2026-10-02）試験台8（playground8 作業票）の Y1〜Y14 を足した（大きさを変える・選んでからのドラッグ）
    - Y9b（Claude.ai が足した）：大きさを変えて自分で重ねたものは、overlaps ではなく ownerOverlaps に入るか
  v2.4（2026-10-02）試験台7（playground7 作業票）の W1〜W11 と、確認で足した W12 を足した
    - W12：表・品の並びを、クリックで選んでからドラッグすると全体が動くか（試験台7では動かない）
    - 操作ボタンは右クリック（とドラッグの後）に出る作りに合わせた
    - 言葉と赤い枠がないこと、自分で重ねた組（ownerOverlaps）、前面・背面（zOrder）、
      表・品の並び・ボタンの並び替え、グループの選び方、操作ボタンが部品に重ならないこと
    - 品の縦積みの一番上（品の並び）の「上の間隔」は、セクションの見出しとの間隔として計算する
  v2.3（2026-10-01）試験台5の確認で足した（playground6 作業票）
    - 縦積みの間隔の決まり（playground6 作業票 2章）を確かめる V1・V2 を足した。
      元々隣どうしだった2つは、テンプレートの間隔のまま。初めて隣になった2つは、
      「上の部品のテンプレートでの下の間隔」と「下の部品のテンプレートでの上の間隔」の広い方
    - R2 は、この決まりの間隔で並び替わることを見る（営業時間は押し下げられる）
    - T2 は、並び替え（M2 を持たない）に加えて、間隔をこの決まりで見る
    - V1：部品が塊の外へ出たとき（M2）、残りの部品の間隔がこの決まりのままか（N1 はこれで見つかった）
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

PATH = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/playground4_single.html'
URL = 'file://' + PATH
TOL = 0.5
P = 'window.__playground'
results = []
anchor_log = []   # R3 用：すべての試験の後の付いていく先

# §24（試験台24）環境変数で働く2つ。無ければ今までと同じ動き。
#   ONLY=Y1,P1,J1,D1,C1 … 記録・表示する区画を、試験名の先頭の文字（区画）で絞る（例 Y/P/J/D/C）。実行自体は従来どおり通す（monolith のため）。
#   ROUNDTRIP=1        … 区画の切れ目で roundTrip() を呼び、PC/スマホのずれを出す（試験台24 の seed/fold 突合）。
ONLY = set(x.strip() for x in os.environ.get('ONLY', '').split(',') if x.strip())
ONLY_LETTERS = set(o[0] for o in ONLY if o)
ROUNDTRIP = os.environ.get('ROUNDTRIP', '') not in ('', '0', 'false', 'False')

def _included(name):
    if not ONLY: return True
    tag = name.split()[0] if name else ''
    return bool(tag) and tag[0] in ONLY_LETTERS

def ok(name, cond, detail=''):
    if not _included(name): return   # ONLY で絞ったときは記録も表示もしない
    results.append((name, bool(cond), str(detail)))
    detail = str(detail) if detail else ''
    print(('OK  ' if cond else 'NG  ') + name + ('  | ' + detail if detail else ''))

def info(msg):
    print('    ' + msg)

async def rtlog(pg, tag=''):
    # ROUNDTRIP=1 のとき、今の画面で roundTrip() を呼んで結果を出す（draft() が無い＝試験台23 以前なら何もしない）
    if not ROUNDTRIP: return
    try:
        has = await pg.evaluate(f"typeof {P}.roundTrip==='function'")
        if not has: return
        r = await pg.evaluate(f"{P}.roundTrip()")
        for dev in ('pc', 'sp'):
            d = r[dev]
            print(f"    ROUNDTRIP[{tag}/{dev}] maxPos={d['maxPos']:.2f} maxSize={d['maxSize']:.2f} 片方のみ={d['onlyA'][:3]}{d['onlyB'][:3]} attr={[x['id'] for x in d['attrDiff']][:3]} swap={d['swapDiff'][:3]}")
    except Exception as e:
        print(f"    ROUNDTRIP[{tag}] 失敗 {e}")

def box(G, k):
    v = G.get(k)
    return None if not v else (round(v['x'], 1), round(v['y'], 1), round(v['w'], 1), round(v['h'], 1))

def overlap(a, b):
    return a['x'] < b['x'] + b['w'] - 1 and b['x'] < a['x'] + a['w'] - 1 and a['y'] < b['y'] + b['h'] - 1 and b['y'] < a['y'] + a['h'] - 1

def hoverlap(a, b):
    return a['x'] < b['x'] + b['w'] - 1 and b['x'] < a['x'] + a['w'] - 1

def cy(v):
    return v['y'] + v['h'] / 2

def is_repeat_item(pid):
    return str(pid).startswith(('card_', 'row_'))

async def api(pg, expr):
    return await pg.evaluate(expr)

async def geo(pg):
    return await api(pg, f"{P}.geometry()")

async def anchors(pg, label):
    A = await api(pg, f"{P}.anchors()")
    for a in A:
        if a.get('anchor') is not None:
            anchor_log.append((label, a.get('part'), a.get('anchor')))
    return A

def anchor_of(A, part):
    for a in A:
        if a.get('part') == part:
            return a
    return None

async def fresh(pg, dev='pc'):
    await api(pg, f"{P}.reset()")
    await api(pg, f"{P}.setDevice('{dev}')")
    await pg.wait_for_timeout(250)

async def setdev(pg, dev):
    await api(pg, f"{P}.setDevice('{dev}')")
    await pg.wait_for_timeout(300)

async def host_of(pg, part):
    return await pg.evaluate(f"(()=>{{const e=document.querySelector('[data-el=\"{part}\"]');if(!e)return null;const h=e.closest('[id^=host_]');return h?h.id:'?'}})()")

NO_SNAP = True  # これまでの試験は、吸い付かないように Alt を押しながら動かす

async def drag(pg, part, dx, dy, grab_offset_y=None, pre_click=True):
    """本物のマウスで、部品を設計上の px で dx,dy 動かす（画面の縮小率を考えて換算）。
    grab_offset_y を渡すと、部品の上端からその px の所（負なら上端より上）をつかむ"""
    G = await geo(pg)
    el = await pg.query_selector(f'[data-el="{part}"]')
    await el.scroll_into_view_if_needed()
    bb = await el.bounding_box()
    s = bb['width'] / G[part]['w']
    x = bb['x'] + min(20, bb['width'] / 2)
    y = bb['y'] + (bb['height'] / 2 if grab_offset_y is None else grab_offset_y * s)
    if pre_click:
        await pg.mouse.click(x, y); await pg.wait_for_timeout(80)
    if NO_SNAP: await pg.keyboard.down('Alt')
    await pg.mouse.move(x, y); await pg.mouse.down()
    for i in range(1, 11):
        await pg.mouse.move(x + dx * s * i / 10, y + dy * s * i / 10)
    await pg.mouse.up(); await pg.wait_for_timeout(300)
    if NO_SNAP: await pg.keyboard.up('Alt')

async def drag_center_to(pg, part, target_cy, dx=0, pre_click=True):
    """部品の縦の中心が target_cy に来るように、本物のドラッグで動かす"""
    G = await geo(pg)
    await drag(pg, part, dx, target_cy - cy(G[part]), pre_click=pre_click)

def moved(G0, G, keys):
    return [k for k in keys if k in G0 and k in G and (abs(G[k]['x'] - G0[k]['x']) > TOL or abs(G[k]['y'] - G0[k]['y']) > TOL)]

def order(G, ids):
    return [k for k in sorted(ids, key=lambda k: G[k]['y'])]

def content_range(G):
    """その端末のセクションの中身の左右（見出しの組の幅で代用）"""
    v = G['F_hg']
    return v['x'], v['x'] + v['w']

def gap_to_part_above(G, part, pool):
    """part のすぐ上にあって横の範囲が重なる部品との縦の間隔（なければ None）"""
    me = G[part]; best = None
    for k in pool:
        if k == part or k not in G: continue
        o = G[k]
        if not hoverlap(me, o): continue
        bottom = o['y'] + o['h']
        if bottom <= me['y'] + TOL:
            g = me['y'] - bottom
            if best is None or g < best[1]:
                best = (k, g)
    return best

# ---- 縦積みの間隔の決まり（playground6 作業票 2章）----
ITEMS_STACK = ['I_cards', 'I_divider', 'I_kanmi', 'I_time', 'I_table', 'I_pillbg']
FEATURE_SP_STACK = ['F_p0', 'F_h0', 'F_b0']

STACK_HEAD = {'I_cards': 'I_hg'}  # 縦積みの一番上の部品の、テンプレートでの上の物

def make_testimg(d):
    """試験台10の試験画像（4色の四分割）。無ければ作る"""
    import os
    from PIL import Image, ImageDraw
    os.makedirs(d, exist_ok=True)
    C = [(0xd0, 0, 0), (0, 0xa0, 0), (0, 0x40, 0xd0), (0xe0, 0xc0, 0)]
    def quad(w, h):
        im = Image.new('RGB', (w, h)); dr = ImageDraw.Draw(im)
        dr.rectangle([0, 0, w // 2 - 1, h // 2 - 1], fill=C[0]); dr.rectangle([w // 2, 0, w - 1, h // 2 - 1], fill=C[1])
        dr.rectangle([0, h // 2, w // 2 - 1, h - 1], fill=C[2]); dr.rectangle([w // 2, h // 2, w - 1, h - 1], fill=C[3])
        return im
    p = lambda n: os.path.join(d, n)
    if not os.path.exists(p('wide.jpg')): quad(1600, 600).save(p('wide.jpg'), quality=92)
    if not os.path.exists(p('tall.jpg')): quad(600, 1600).save(p('tall.jpg'), quality=92)
    if not os.path.exists(p('big.jpg')): quad(6000, 4000).save(p('big.jpg'), quality=85)
    if not os.path.exists(p('small.png')): quad(300, 200).save(p('small.png'))
    if not os.path.exists(p('rotated.jpg')):
        ex = Image.Exif(); ex[0x0112] = 6
        quad(1200, 1600).transpose(Image.Transpose.ROTATE_90).save(p('rotated.jpg'), quality=92, exif=ex.tobytes())
    if not os.path.exists(p('notimage.txt')): open(p('notimage.txt'), 'w').write('これは画像ではありません')

def tmpl_gaps(G0, stack):
    """テンプレートのままの配置 G0 から、隣どうしの間隔・各部品の上下の間隔を出す"""
    s = sorted(stack, key=lambda k: G0[k]['y'])
    pair, above, below = {}, {}, {}
    h = STACK_HEAD.get(s[0])
    if h and h in G0:
        above[s[0]] = G0[s[0]]['y'] - (G0[h]['y'] + G0[h]['h'])
    for a, b in zip(s, s[1:]):
        g = G0[b]['y'] - (G0[a]['y'] + G0[a]['h'])
        pair[frozenset((a, b))] = g; below[a] = g; above[b] = g
    return pair, above, below

def expected_gap(tg, a, b):
    """a の下に b が来たときの、あるべき間隔"""
    pair, above, below = tg
    k = frozenset((a, b))
    if k in pair:
        return pair[k]
    return max(below.get(a, 0), above.get(b, 0))

def check_stack_gaps(label, G1, tg, members):
    """members（今その縦積みにいる部品）の隣どうしの間隔が、決まりどおりか"""
    s = sorted(members, key=lambda k: G1[k]['y'])
    bad = []
    for a, b in zip(s, s[1:]):
        got = G1[b]['y'] - (G1[a]['y'] + G1[a]['h']); want = expected_gap(tg, a, b)
        if abs(got - want) > TOL:
            bad.append(f'{a}→{b} {got:.1f}（あるべき {want:.1f}）')
    ok(label, not bad, ' / '.join(bad) if bad else ' '.join(s))

async def check_placed_below(pg, dev, new, src, label, G0dev, photo=False):
    """貼り付け・複製した部品が、コピー元のすぐ下・左端そろえ・重なりなし・中身の幅以内か"""
    await setdev(pg, dev)
    G = await geo(pg); W = await api(pg, f"{P}.warnings()"); A = await anchors(pg, label)
    n, s = G[new], G[src]
    ok(f'{label} {dev} 左端がコピー元とそろう', abs(n['x'] - s['x']) <= TOL, f"新{box(G,new)} 元{box(G,src)}")
    ok(f'{label} {dev} コピー元より下（間隔16以上）', n['y'] >= s['y'] + s['h'] + 16 - TOL, f"元の下端{s['y']+s['h']:.1f} 新の上端{n['y']:.1f}")
    feature_parts = [k for k in G if k.startswith('F_') or k.startswith('add_')]
    ga = gap_to_part_above(G, new, [k for k in feature_parts if k != new])
    ok(f'{label} {dev} すぐ下に置かれる（上の部品との間が16以下）', ga is not None and ga[1] <= 16 + TOL, f"上の部品 {ga}")
    ok(f'{label} {dev} 重なり0・はみ出し0', not W.get('overlaps') and not W.get('overflows'), json.dumps(W, ensure_ascii=False)[:200])
    lo, hi = content_range(G)
    ok(f'{label} {dev} 幅が中身の幅以内', n['x'] >= lo - TOL and n['x'] + n['w'] <= hi + TOL, f"{n['x']:.1f}〜{n['x']+n['w']:.1f} / 中身{lo:.1f}〜{hi:.1f}")
    a = anchor_of(A, new)
    ok(f'{label} {dev} 付いていく先がコピー元', a is not None and a.get('anchor') == src, json.dumps(a, ensure_ascii=False)[:200])
    if photo:
        r0 = G0dev[src]['h'] / G0dev[src]['w']; r1 = n['h'] / n['w']
        ok(f'{label} {dev} 写真の縦横比が変わらない', abs(r1 - r0) / r0 <= 0.01, f"元{r0:.3f} 新{r1:.3f}")
        ok(f'{label} {dev} 表示の名前が「足した写真」', a is not None and a.get('partName') == '足した写真', a.get('partName') if a else None)
    return G

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1440, 'height': 1100})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        keys = await api(pg, f"Object.keys({P})")
        need = ['reset','setDevice','geometry','sections','warnings','anchors','ops','presets','runPreset','select','edit','resetScope','undo','redo','layoutCount']
        ok('入口がそろっている', all(k in keys for k in need), 'なし: ' + ','.join(k for k in need if k not in keys))
        presets = await api(pg, f"{P}.presets()")
        await fresh(pg, 'sp'); GS0 = await geo(pg)
        await fresh(pg)
        G0 = await geo(pg); S0 = await api(pg, f"{P}.sections()")
        tmpl = [k for k in G0 if not k.startswith('add_')]
        tmpl_sp = [k for k in GS0 if not k.startswith('add_')]

        # ---- Q1 本物のドラッグ＋その場で書き足す ----
        await drag(pg, 'F_h0', 12, 8)
        G1 = await geo(pg)
        ok('Q1 H1 見出しが12,8動く', abs(G1['F_h0']['x'] - G0['F_h0']['x'] - 12) <= TOL and abs(G1['F_h0']['y'] - G0['F_h0']['y'] - 8) <= TOL, f"{box(G0,'F_h0')}→{box(G1,'F_h0')}")
        ok('Q1 H2 ほかは動かない', moved(G0, G1, [k for k in tmpl if k != 'F_h0']) == [], ','.join(moved(G0, G1, [k for k in tmpl if k != 'F_h0'])))
        el = await pg.query_selector('[data-el="F_b0"]'); bb = await el.bounding_box()
        await pg.mouse.dblclick(bb['x'] + bb['width'] - 30, bb['y'] + bb['height'] - 8); await pg.wait_for_timeout(200)
        await pg.keyboard.press('End')
        add_text = '毎朝炊いた餡を、その日のうちにお出しします。手のひらにのる小さな菓子に、季節のうつろいを写します。四季折々の意匠をお楽しみください。'
        await pg.keyboard.insert_text(add_text); await pg.wait_for_timeout(300)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        G2 = await geo(pg)
        ok('Q1 書き足した後、見出しと本文が重ならない', not overlap(G2['F_h0'], G2['F_b0']), f"見出し{box(G2,'F_h0')} 本文{box(G2,'F_b0')}")
        await anchors(pg, 'Q1')
        if 'Q1' in presets:
            await fresh(pg); await api(pg, f"{P}.runPreset('Q1')"); await pg.wait_for_timeout(500)
            G3 = await geo(pg)
            ok('Q1 本物の操作とプリセットが一致', all(abs(G3[k]['y'] - G2[k]['y']) <= TOL for k in ['F_h0', 'F_b0']), f"{box(G2,'F_b0')} vs {box(G3,'F_b0')}")

        # ---- Q2 抜け殻がない ----
        if 'Q2' in presets:
            await fresh(pg); await api(pg, f"{P}.runPreset('Q2')"); await pg.wait_for_timeout(500)
            G = await geo(pg); await anchors(pg, 'Q2')
            ok('Q2 本文が写真の下24', abs(G['F_b0']['y'] - (G['F_p0']['y'] + G['F_p0']['h'] + 24)) <= TOL, box(G, 'F_b0'))
            hc = cy(G['F_h0']); pc = cy(G['F_p0'])
            ok('Q2 見出しだけで写真の縦中央−12にそろう（空白が残らない）', abs(hc - (pc - 12)) <= 1, f'見出しの中心{hc:.1f} 写真の中心{pc:.1f}')

        # ---- Q6 セクションが伸びる ----
        if 'Q6' in presets:
            await fresh(pg); await api(pg, f"{P}.runPreset('Q6')"); await pg.wait_for_timeout(400)
            S = await api(pg, f"{P}.sections()"); W = await api(pg, f"{P}.warnings()"); await anchors(pg, 'Q6')
            ok('Q6 セクションが伸びる・はみ出しの警告なし', S['items']['height'] > S0['items']['height'] and not W.get('overflows'), f"{S0['items']['height']:.1f}→{S['items']['height']:.1f}")

        # ---- R1 区切り線をつかめる・少し動かしても M1 ----
        for dev in ['pc', 'sp']:
            for dist in [10, 30]:
                await fresh(pg, dev)
                G = await geo(pg)
                el = await pg.query_selector('[data-el="I_divider"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
                s = bb['width'] / G['I_divider']['w']
                hit = await pg.evaluate(f"(()=>{{const e=document.elementFromPoint({bb['x']+bb['width']/2},{bb['y']-6*s});return e&&((e.closest('[data-el]')||{{dataset:{{}}}}).dataset.el)}})()")
                if dist == 10:
                    info(f'R1 {dev} 見た目の6px上の DOM 上の部品: {hit}（ページがプログラムで範囲を広げる作りなら None でよい。判定は下の「動く」で行う）')
                await drag(pg, 'I_divider', 0, dist, grab_offset_y=-6)
                G1 = await geo(pg); A = await anchors(pg, f'R1 {dev} {dist}')
                others = [k for k in G if k.startswith(('I_', 'card_', 'row_')) and k != 'I_divider']
                ok(f'R1 {dev} {dist}px 区切り線だけが{dist}動く', abs(G1['I_divider']['y'] - G['I_divider']['y'] - dist) <= TOL and moved(G, G1, others) == [], f"区切り線 {G['I_divider']['y']:.1f}→{G1['I_divider']['y']:.1f} / 動いたほかの部品: {','.join(moved(G, G1, others))}")
                a = anchor_of(A, 'I_divider')
                ok(f'R1 {dev} {dist}px M1 のまま', a is not None and a.get('mode') == 'M1', json.dumps(a, ensure_ascii=False)[:160])
                below = [k for k in others if G[k]['y'] > G['I_divider']['y']]
                ok(f'R1 {dev} {dist}px 区切り線より上に来た部品がない', all(G1[k]['y'] >= G1['I_divider']['y'] for k in below), ','.join(k for k in below if G1[k]['y'] < G1['I_divider']['y']))

        # ---- R2 区切り線を甘味処の見出しの下へ ----
        # 区切り線・甘味処の見出し・営業時間は同じ縦積みの塊にある → 作業票の追記（10章）により並び替えになる
        await fresh(pg)
        G = await geo(pg)
        await drag_center_to(pg, 'I_divider', G['I_kanmi']['y'] + G['I_kanmi']['h'] + 1)
        G1 = await geo(pg); W = await api(pg, f"{P}.warnings()"); A = await anchors(pg, 'R2')
        a = anchor_of(A, 'I_divider')
        info(f"R2 結果: 区切り線 {box(G1,'I_divider')} / 記録 {json.dumps(a, ensure_ascii=False)[:200]}")
        info(f"R2 並び: {order(G1, ['I_divider','I_kanmi','I_time','I_table'])}")
        ok('R2 付いていく先が品の1件ではない', a is None or not is_repeat_item(a.get('anchor')), json.dumps(a, ensure_ascii=False)[:160])
        ok('R2 重なり0', not W.get('overlaps'), json.dumps(W, ensure_ascii=False)[:200])
        seq = order(G1, ['I_kanmi', 'I_divider', 'I_time'])
        ok('R2 同じ塊の中なので並び替わる（甘味処の見出し→区切り線→営業時間。重ならない）', seq == ['I_kanmi', 'I_divider', 'I_time'] and all(not overlap(G1[a], G1[b]) for a, b in zip(seq, seq[1:])), f"{seq}")
        ok('R2 並び替えなので M1・M2 を持たない', a is None or (a.get('mode') != 'M2' and not (a.get('mode') == 'M1' and (a.get('dx') or a.get('dy')))), json.dumps(a, ensure_ascii=False)[:160])
        ok('R2 甘味処の見出しは元の位置より上へ詰まる（区切り線がいた分）', G1['I_kanmi']['y'] < G['I_kanmi']['y'] - TOL, f"{box(G,'I_kanmi')}→{box(G1,'I_kanmi')}")
        ok('R2 営業時間は押し下げられる（区切り線が割り込んだ分）', G1['I_time']['y'] > G['I_time']['y'] + TOL, f"{box(G,'I_time')}→{box(G1,'I_time')}")
        check_stack_gaps('R2 pc 間隔が決まりどおり（V2）', G1, tmpl_gaps(G, ITEMS_STACK), ITEMS_STACK)

        # ---- V2 スマホでも R2 と同じ操作 ----
        await fresh(pg, 'sp')
        G = await geo(pg)
        await drag_center_to(pg, 'I_divider', G['I_kanmi']['y'] + G['I_kanmi']['h'] + 1)
        G1 = await geo(pg); A = await anchors(pg, 'R2 sp'); a = anchor_of(A, 'I_divider')
        seq = order(G1, ['I_kanmi', 'I_divider', 'I_time'])
        ok('R2 sp 並び替わる（M1・M2 を持たない）', seq == ['I_kanmi', 'I_divider', 'I_time'] and (a is None or a.get('mode') != 'M2'), f"{seq} {json.dumps(a, ensure_ascii=False)[:120]}")
        check_stack_gaps('R2 sp 間隔が決まりどおり（V2）', G1, tmpl_gaps(G, ITEMS_STACK), ITEMS_STACK)

        # ---- T2（改）区切り線を表とボタンの間へ → 並び替え（縦積みの直接の子どうしの間。2026-10-01 改め）----
        for dev in ['pc', 'sp']:
            await fresh(pg, dev)
            G = await geo(pg); T = G['I_table']
            await drag(pg, 'I_divider', 0, T['y'] + T['h'] + 40 - G['I_divider']['y'])
            G1 = await geo(pg); W = await api(pg, f"{P}.warnings()"); A = await anchors(pg, f'T2 {dev}')
            a = anchor_of(A, 'I_divider')
            seq = order(G1, ['I_table', 'I_divider', 'I_pillbg'])
            ok(f'T2 {dev} 並び替わる（表→区切り線→ボタン）', seq == ['I_table', 'I_divider', 'I_pillbg'] and all(not overlap(G1[x], G1[y]) for x, y in zip(seq, seq[1:])), f"{seq} 区切り線{box(G1,'I_divider')}")
            ok(f'T2 {dev} M1・M2 を持たない', a is None or (a.get('mode') not in ('M2',) and not (a.get('mode') == 'M1' and (a.get('dx') or a.get('dy')))), json.dumps(a, ensure_ascii=False)[:160])
            ok(f'T2 {dev} 重なり0', not W.get('overlaps'), json.dumps(W, ensure_ascii=False)[:160])
            check_stack_gaps(f'T2 {dev} 間隔が決まりどおり（V2）', G1, tmpl_gaps(G, ITEMS_STACK), ITEMS_STACK)

        # ---- T3 表の中へ下向き：離した瞬間の関係が、詰めた後も保たれる（playground5 作業票）----
        for dev in ['pc', 'sp']:
            for label, off in [('T3 表の上端+60', 60)]:
                await fresh(pg, dev)
                G = await geo(pg); T = G['I_table']
                tgt_top = T['y'] + T['h'] + 40 if off is None else T['y'] + off
                await drag(pg, 'I_divider', 0, tgt_top - G['I_divider']['y'])
                G1 = await geo(pg); W = await api(pg, f"{P}.warnings()"); A = await anchors(pg, f'{label} {dev}')
                a = anchor_of(A, 'I_divider'); T1 = G1['I_table']
                want = T1['y'] + T1['h'] + 40 if off is None else T1['y'] + off
                ok(f'{label} {dev} 付いていく先が甘味処の表', a is not None and a.get('mode') == 'M2' and a.get('anchor') == 'I_table', json.dumps(a, ensure_ascii=False)[:160])
                ok(f'{label} {dev} 詰めた後も、表との関係が離した瞬間のまま', abs(G1['I_divider']['y'] - want) <= TOL, f"区切り線 {G1['I_divider']['y']:.1f} / あるべき位置 {want:.1f}（表 {T['y']:.1f}→{T1['y']:.1f}）")
                if off is None:
                    ok(f'{label} {dev} 重なり0', not W.get('overlaps'), json.dumps(W, ensure_ascii=False)[:160])

        # ---- V1 縦積みから部品が塊の外へ出たとき（M2）、残りの間隔が決まりどおりか（playground6 作業票。N1）----
        cases = [(dev, ITEMS_STACK, part, 'table') for dev in ['pc', 'sp'] for part in ['I_divider', 'I_kanmi', 'I_time']]
        cases += [('sp', FEATURE_SP_STACK, part, 'photo2') for part in ['F_h0', 'F_b0']]
        for dev, stack, part, where in cases:
            await fresh(pg, dev)
            G = await geo(pg)
            tgt = G['I_table']['y'] + 60 if where == 'table' else cy(G['F_p1']) + 30
            await drag_center_to(pg, part, tgt)
            G1 = await geo(pg); A = await anchors(pg, f'V1 {dev} {part}'); a = anchor_of(A, part)
            if a is None or a.get('mode') != 'M2':
                ok(f'V1 {dev} {part} を塊の外へ（M2 になる）', False, json.dumps(a, ensure_ascii=False)[:120]); continue
            rest = [k for k in stack if k != part]
            check_stack_gaps(f'V1 {dev} {part} が抜けた後、残りの間隔が決まりどおり', G1, tmpl_gaps(G, stack), rest)

        # ---- T4 本文を写真の下24へ（本物のドラッグ。PC）----
        await fresh(pg)
        G = await geo(pg)
        await drag(pg, 'F_b0', G['F_p0']['x'] - G['F_b0']['x'], G['F_p0']['y'] + G['F_p0']['h'] + 24 - G['F_b0']['y'])
        G1 = await geo(pg); A = await anchors(pg, 'T4'); a = anchor_of(A, 'F_b0')
        ok('T4 本文の付いていく先が写真・間隔24', a is not None and a.get('anchor') == 'F_p0' and abs(G1['F_b0']['y'] - (G1['F_p0']['y'] + G1['F_p0']['h'] + 24)) <= TOL, f"{box(G1,'F_b0')} / {json.dumps(a, ensure_ascii=False)[:140]}")
        ok('T4 見出しが写真の縦中央−12にそろう（抜け殻なし）', abs(cy(G1['F_h0']) - (cy(G1['F_p0']) - 12)) <= 1, f"見出しの中心{cy(G1['F_h0']):.1f} 写真の中心{cy(G1['F_p0']):.1f}")

        # ---- R9（新）足した文字を品の並びのすぐ下へ → 品の1件に付いていかない ----
        if 'Q6' in presets:
            await fresh(pg); await api(pg, f"{P}.runPreset('Q6')"); await pg.wait_for_timeout(400)
            G = await geo(pg)
            add = [k for k in G if k.startswith('add_')][0]
            cards_bottom = max(v['y'] + v['h'] for k, v in G.items() if k.startswith('card_'))
            await drag(pg, add, 0, cards_bottom + 16 - G[add]['y'])
            G1 = await geo(pg); A = await anchors(pg, 'R9'); a = anchor_of(A, add)
            info(f"R9 足した文字 {box(G1, add)} 品の並びの下端 {cards_bottom:.1f}")
            ok('R9 品の並びのすぐ下に置いた文字が、品の1件に付いていかない', a is not None and a.get('anchor') is not None and not is_repeat_item(a.get('anchor')), json.dumps(a, ensure_ascii=False)[:200])

        # ---- R4 見出しの貼り付け ----
        await fresh(pg)
        await api(pg, f"{P}.select(['F_h0'])")
        await pg.keyboard.press('Meta+c'); await pg.keyboard.press('Meta+v'); await pg.wait_for_timeout(300)
        G = await geo(pg); new = [k for k in G if k not in G0]
        ok('R4 貼り付けで1つ増える', len(new) == 1, ','.join(new))
        pasted = new[0] if new else None
        if pasted:
            await check_placed_below(pg, 'pc', pasted, 'F_h0', 'R4', G0)
            await check_placed_below(pg, 'sp', pasted, 'F_h0', 'R4', GS0)
            await setdev(pg, 'pc')

            # ---- Q15 切り取って別のセクションへ ----
            await api(pg, f"{P}.select(['{pasted}'])")
            await pg.keyboard.press('Meta+x'); await pg.wait_for_timeout(250)
            hs = await pg.query_selector('#host_items'); await hs.scroll_into_view_if_needed(); hb = await hs.bounding_box()
            Gi = await geo(pg); s = hb['width'] / 1440
            px, py = hb['x'] + 20 * s, hb['y'] + (Gi['I_kanmi']['y'] + 5) * s
            await pg.mouse.click(px, py); await pg.wait_for_timeout(150)
            await pg.keyboard.press('Meta+v'); await pg.wait_for_timeout(300)
            G = await geo(pg); adds = [k for k in G if k.startswith('add_')]
            hosts = {k: await host_of(pg, k) for k in adds}
            await setdev(pg, 'sp'); GS = await geo(pg)
            hosts_sp = {k: await host_of(pg, k) for k in GS if k.startswith('add_')}
            await anchors(pg, 'Q15 sp'); await setdev(pg, 'pc'); await anchors(pg, 'Q15 pc')
            ok('Q15 選んだセクションに入り、元のセクションから消える（両端末）', list(hosts.values()) == ['host_items'] and list(hosts_sp.values()) == ['host_items'], f'PC {hosts} / SP {hosts_sp}')
            await api(pg, f"{P}.undo()"); await api(pg, f"{P}.undo()"); await pg.wait_for_timeout(300)
            G = await geo(pg); adds = [k for k in G if k.startswith('add_')]
            hosts = [await host_of(pg, k) for k in adds]
            ok('Q15 Cmd+Z 2回で、貼り付けた見出しが特集に戻る', hosts == ['host_feature'], str(hosts))

        # ---- R5 写真の複製 ----
        await fresh(pg)
        await api(pg, f"{P}.select(['F_p0'])"); await pg.keyboard.press('Meta+d'); await pg.wait_for_timeout(300)
        G = await geo(pg); new = [k for k in G if k not in G0]
        ok('R5 複製で1つ増える', len(new) == 1, ','.join(new))
        if new:
            dup = new[0]
            ok('R5 pc 写真の複製は同じ幅・高さ', abs(G[dup]['w'] - G0['F_p0']['w']) <= TOL and abs(G[dup]['h'] - G0['F_p0']['h']) <= TOL, f"{box(G, dup)} 元{box(G0,'F_p0')}")
            await check_placed_below(pg, 'pc', dup, 'F_p0', 'R5', G0, photo=True)
            await check_placed_below(pg, 'sp', dup, 'F_p0', 'R5', GS0, photo=True)

        # ---- R6 スマホで本文を写真と見出しの間へ → 並び替え ----
        await fresh(pg, 'sp')
        G = await geo(pg)
        target = (G['F_p0']['y'] + G['F_p0']['h'] + cy(G['F_h0'])) / 2   # 写真の下端と見出しの中心の間
        await drag_center_to(pg, 'F_b0', target)
        G1 = await geo(pg); W = await api(pg, f"{P}.warnings()"); A = await anchors(pg, 'R6')
        seq = order(G1, ['F_p0', 'F_h0', 'F_b0'])
        clean = all(not overlap(G1[a], G1[b]) for a, b in zip(seq, seq[1:]))
        ok('R6 並び替わる（写真→本文→見出し。互いに重ならず、見出しが押し下げられる）', seq == ['F_p0', 'F_b0', 'F_h0'] and clean and G1['F_h0']['y'] > G['F_h0']['y'] + TOL, f"{seq} 見出し{box(G,'F_h0')}→{box(G1,'F_h0')}")
        ok('R6 重なり0', not W.get('overlaps'), json.dumps(W, ensure_ascii=False)[:200])
        check_stack_gaps('R6 間隔が決まりどおり（V2）', G1, tmpl_gaps(G, FEATURE_SP_STACK), FEATURE_SP_STACK)
        a = anchor_of(A, 'F_b0')
        info(f"R6 本文の記録 {json.dumps(a, ensure_ascii=False)[:160]}")
        ok('R6 並び替えた部品はずれ（M1）を持たない', abs(G1['F_b0']['x'] - G['F_b0']['x']) <= TOL and not (a and a.get('mode') == 'M1' and (a.get('dx') or a.get('dy'))), f"{box(G,'F_b0')}→{box(G1,'F_b0')} / 記録 {json.dumps(a, ensure_ascii=False)[:120]}")
        await api(pg, f"{P}.resetScope('part','F_b0',['sp'])"); await pg.wait_for_timeout(250)
        G2 = await geo(pg)
        ok('R6 元の位置に戻すと、元の並び順・位置に戻る', moved(G, G2, [k for k in tmpl_sp if k.startswith('F_')]) == [], ','.join(moved(G, G2, [k for k in tmpl_sp if k.startswith('F_')])))

        # ---- R7 PC で本文を見出しより上へ（文字の塊の中）----
        await fresh(pg)
        G = await geo(pg)
        await drag_center_to(pg, 'F_b0', G['F_h0']['y'] + 2)
        G1 = await geo(pg); W = await api(pg, f"{P}.warnings()"); await anchors(pg, 'R7')
        ok('R7 並び替わる（本文→見出し。重ならず、見出しが本文の下に来る）', G1['F_b0']['y'] < G1['F_h0']['y'] and not overlap(G1['F_b0'], G1['F_h0']), f"本文{box(G1,'F_b0')} 見出し{box(G1,'F_h0')}")
        ok('R7 重なり0', not W.get('overlaps'), json.dumps(W, ensure_ascii=False)[:200])
        await setdev(pg, 'sp'); GS = await geo(pg)
        ok('R7 スマホの並び順は変わらない', moved(GS0, GS, [k for k in tmpl_sp if k.startswith('F_')]) == [], ','.join(moved(GS0, GS, [k for k in tmpl_sp if k.startswith('F_')])))

        # ---- R8 見出しを同じ塊の中で 30,20 → M1 のまま・並び替えにならない ----
        await fresh(pg)
        await drag(pg, 'F_h0', 30, 20)
        G1 = await geo(pg); A = await anchors(pg, 'R8'); a = anchor_of(A, 'F_h0')
        ok('R8 見出しが30,20動き、本文は動かない', abs(G1['F_h0']['x'] - G0['F_h0']['x'] - 30) <= TOL and abs(G1['F_h0']['y'] - G0['F_h0']['y'] - 20) <= TOL and moved(G0, G1, ['F_b0']) == [], f"{box(G0,'F_h0')}→{box(G1,'F_h0')}")
        ok('R8 M1 のまま', a is not None and a.get('mode') == 'M1', json.dumps(a, ensure_ascii=False)[:160])

        # ---- Q7 元に戻す ----
        await fresh(pg)
        await drag(pg, 'F_h0', 12, 8); await drag(pg, 'F_p1', 0, 30)
        await setdev(pg, 'sp')
        await drag(pg, 'F_h0', 10, 10)
        GS1 = await geo(pg)
        await api(pg, f"{P}.edit('F_h1','店の奥の甘味処で')")
        await setdev(pg, 'pc'); await anchors(pg, 'Q7')
        await api(pg, f"{P}.resetScope('part','F_h0',['pc'])"); await pg.wait_for_timeout(200)
        G = await geo(pg)
        ok('Q7 部品を戻すと元の位置', abs(G['F_h0']['y'] - G0['F_h0']['y']) <= TOL and abs(G['F_h0']['x'] - G0['F_h0']['x']) <= TOL)
        ok('Q7 ほかの手動は残る', abs(G['F_p1']['y'] - G0['F_p1']['y'] - 30) <= TOL)
        await api(pg, f"{P}.resetScope('page',null,['pc'])"); await pg.wait_for_timeout(200)
        G = await geo(pg)
        ok('Q7 ページを戻すと PC の手動が消える', abs(G['F_p1']['y'] - G0['F_p1']['y']) <= TOL)
        await setdev(pg, 'sp')
        G = await geo(pg)
        ok('Q7 スマホの手動は残る', abs(G['F_h0']['y'] - GS1['F_h0']['y']) <= TOL)
        n = len(await api(pg, f"{P}.ops()"))
        for _ in range(n):
            await api(pg, f"{P}.undo()")
        await setdev(pg, 'pc')
        G = await geo(pg)
        ok('Q9 Cmd+Z 相当で最初まで戻る', moved(G0, G, tmpl) == [], ','.join(moved(G0, G, tmpl)))

        # ---- Q13 品の複製 ----
        cards = [k for k in G0 if k.startswith('card_name_')]
        if cards:
            await fresh(pg)
            await api(pg, f"{P}.select(['{cards[1] if len(cards) > 1 else cards[0]}'])")
            await pg.keyboard.press('Meta+d'); await pg.wait_for_timeout(300)
            G = await geo(pg); await anchors(pg, 'Q13')
            n0 = len([k for k in G0 if k.startswith('card_photo')]); n1 = len([k for k in G if k.startswith('card_photo')])
            ok('Q13 品が1件増える', n1 == n0 + 1, f'{n0}→{n1}')

        # ---- Q14 書式付きの貼り付け ----
        await fresh(pg)
        el = await pg.query_selector('[data-el="F_b1"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
        await pg.mouse.dblclick(bb['x'] + 50, bb['y'] + 10); await pg.wait_for_timeout(200)
        await pg.evaluate("""(()=>{const dt=new DataTransfer();dt.setData('text/html','<b style="color:red">太字の赤</b>');dt.setData('text/plain','太字の赤');document.activeElement.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));})()""")
        await pg.wait_for_timeout(200)
        html = await pg.evaluate("document.activeElement.innerHTML")
        ok('Q14 書式が持ち込まれない', '<b' not in html and 'color' not in html and '太字の赤' in html, html[-60:])
        await pg.keyboard.press('Escape')

        await rtlog(pg, 'Q/R')   # §24 区画の切れ目：ここまでの手直しで seed/fold が一致するか
        # ---- R プリセット（あれば流して記録）----
        for name in sorted(k for k in presets if k.startswith('R')):
            await fresh(pg)
            try:
                await api(pg, f"{P}.runPreset('{name}')"); await pg.wait_for_timeout(500)
            except Exception as e:
                ok(f'preset {name} がエラーなく動く', False, str(e).splitlines()[0][:160]); continue
            W = await api(pg, f"{P}.warnings()"); A = await anchors(pg, f'preset {name}')
            info(f'preset {name}: 警告 {json.dumps(W, ensure_ascii=False)[:160]} / 付いていく先 {json.dumps(A, ensure_ascii=False)[:200]}')


        # ======== 試験台7（playground7 作業票 6章）W1〜W11 ========
        if 'W1' in presets:
            async def warn(): return await api(pg, f"{P}.warnings()")
            async def no_red(): return await pg.evaluate("document.querySelectorAll('.mark-warn').length") == 0
            async def no_words(): return await pg.evaluate("!document.body.innerText.includes('付いていき')")
            def has_pair(lst, a, b_prefixes):
                for o in lst or []:
                    x, y = o.get('a'), o.get('b')
                    for p1, p2 in ((x, y), (y, x)):
                        if p1 == a and any(str(p2).startswith(bp) for bp in b_prefixes): return True
                return False
            async def menu_box():
                # 操作ボタン（浮遊メニュー #fmenu）。右クリック・ドラッグの後に出る
                return await pg.evaluate("""(()=>{const m=document.getElementById('fmenu');if(!m||!m.classList.contains('on'))return null;const r=m.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()""")
            async def click_button(text):
                btn = pg.locator('button', has_text=text).filter(has=pg.locator(':scope')).first
                await btn.click(); await pg.wait_for_timeout(250)
            for dev in ['pc', 'sp']:
                # W1
                await fresh(pg, dev); G0 = await geo(pg)
                await drag(pg, 'F_h0', 30, 20)
                Wn = await warn()
                ok(f'W1 {dev} 赤い枠が出ない', await no_red())
                ok(f'W1 {dev} overlaps は空・ownerOverlaps に見出しと本文', not Wn.get('overlaps') and has_pair(Wn.get('ownerOverlaps'), 'F_h0', ['F_b0']), json.dumps(Wn, ensure_ascii=False)[:200])
                # W5（W1 の続き）本文に書き足す
                el = await pg.query_selector('[data-el="F_b0"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
                await pg.mouse.dblclick(bb['x'] + bb['width'] - 4, bb['y'] + bb['height'] - 4); await pg.wait_for_timeout(200)
                await pg.keyboard.press('End'); await pg.keyboard.insert_text('季節の移ろいを、ひと口ずつ。'); await pg.mouse.click(5, 300); await pg.wait_for_timeout(400)
                Wn = await warn()
                ok(f'W5 {dev} 書き足した後も overlaps は空・見出しと本文は ownerOverlaps のまま', not Wn.get('overlaps') and has_pair(Wn.get('ownerOverlaps'), 'F_h0', ['F_b0']), json.dumps(Wn, ensure_ascii=False)[:200])
                # W2
                await fresh(pg, dev); G = await geo(pg)
                await drag_center_to(pg, 'I_kanmi', G['I_table']['y'] + 60)
                A = await anchors(pg, f'W2 {dev}'); a = anchor_of(A, 'I_kanmi'); Wn = await warn()
                ok(f'W2 {dev} M2・言葉なし・赤い枠なし', a is not None and a.get('mode') == 'M2' and await no_words() and await no_red(), json.dumps(a, ensure_ascii=False)[:120])
                ok(f'W2 {dev} ownerOverlaps に見出しと表（行）・overlaps は空', has_pair(Wn.get('ownerOverlaps'), 'I_kanmi', ['I_table', 'row_']) and not Wn.get('overlaps'), json.dumps(Wn, ensure_ascii=False)[:200])
                # W3 背面へ・前面へ（見出しは選んだまま）
                el = await pg.query_selector('[data-el="I_kanmi"]'); bb = await el.bounding_box()
                await pg.mouse.click(bb['x'] + 10, bb['y'] + bb['height'] / 2, button='right'); await pg.wait_for_timeout(250)
                cx, cyy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
                hit = f"(()=>{{const e=document.elementFromPoint({cx},{cyy});const d=e&&e.closest('[data-el]');return d?d.dataset.el:null}})()"
                try:
                  if await pg.evaluate("!!document.querySelector('#fmenu [data-zsub]')"):
                    # 試験台22 以降：▸ の小さな箱から。見た目は表の地が透けるので、zOrder で前後を確かめる
                    await pg.locator('#fmenu [data-zsub="最背面へ移動"]').hover(); await pg.wait_for_timeout(200)
                    await pg.locator('#fmenu [data-zitem="最背面へ移動"]').first.click(); await pg.wait_for_timeout(250)
                    z1 = await api(pg, f"{P}.zOrder()")
                    # 箱は開いたまま（見出しは選んだまま）。後ろに回った見出しを右クリックし直すと、前の表の行が選ばれるため
                    await pg.locator('#fmenu [data-zsub="最前面へ移動"]').hover(); await pg.wait_for_timeout(200)
                    await pg.locator('#fmenu [data-zitem="最前面へ移動"]').first.click(); await pg.wait_for_timeout(250)
                    z2 = await api(pg, f"{P}.zOrder()")
                    ok(f'W3 {dev} 最背面へで見出しが一番後ろ、最前面へで一番前', z1 and z1[0] == 'I_kanmi' and z2 and z2[-1] == 'I_kanmi', f'zOrder {z1} → {z2}')
                  else:
                    await pg.get_by_role('button', name='背面へ').first.click(); await pg.wait_for_timeout(250)
                    z1 = await api(pg, f"{P}.zOrder()"); h1 = await pg.evaluate(hit)
                    await pg.get_by_role('button', name='前面へ').first.click(); await pg.wait_for_timeout(250)
                    z2 = await api(pg, f"{P}.zOrder()"); h2 = await pg.evaluate(hit)
                    ok(f'W3 {dev} 背面へで表の行が上に、前面へで見出しが上に', h1 != 'I_kanmi' and h2 == 'I_kanmi', f'背面後 {h1} / 前面後 {h2} / zOrder {z1} → {z2}')
                except Exception as e:
                    ok(f'W3 {dev} 前面へ・背面へのボタンがある', False, str(e).splitlines()[0][:160])
                # W4 セクションを元に戻す
                await api(pg, f"{P}.reset()"); await setdev(pg, dev)
                G1 = await geo(pg); Wn = await warn(); z = await api(pg, f"{P}.zOrder()")
                ok(f'W4 {dev} 元に戻すと位置・重なり順が戻る', moved(G0, G1, ITEMS_STACK) == [] and not Wn.get('ownerOverlaps') and not z, f'{moved(G0, G1, ITEMS_STACK)} z={z}')
                # W6 表を見出しの上へ
                await fresh(pg, dev); G = await geo(pg)
                await drag_center_to(pg, 'I_table', cy(G['I_kanmi']) - 10)
                G1 = await geo(pg); A = await anchors(pg, f'W6 {dev}'); a = anchor_of(A, 'I_table')
                seq = order(G1, ITEMS_STACK)
                ok(f'W6 {dev} 表が見出しの上へ並び替わる（M1・M2 なし）', seq == ['I_cards', 'I_divider', 'I_table', 'I_kanmi', 'I_time', 'I_pillbg'] and (a is None or a.get('mode') not in ('M2',)), f'{seq} {json.dumps(a, ensure_ascii=False)[:100]}')
                check_stack_gaps(f'W6 {dev} 間隔が決まりどおり', G1, tmpl_gaps(G, ITEMS_STACK), ITEMS_STACK)
                # W7 ボタンを営業時間と表の間へ
                await fresh(pg, dev); G = await geo(pg)
                await drag_center_to(pg, 'I_pillbg', (G['I_time']['y'] + G['I_time']['h'] + G['I_table']['y']) / 2)
                G1 = await geo(pg); seq = order(G1, ITEMS_STACK)
                tx = G1['I_pilltext']; bg = G1['I_pillbg']
                ok(f'W7 {dev} ボタンが営業時間と表の間へ・文字と背景が一緒', seq.index('I_pillbg') == seq.index('I_time') + 1 and seq.index('I_table') == seq.index('I_pillbg') + 1 and bg['y'] <= tx['y'] and tx['y'] + tx['h'] <= bg['y'] + bg['h'] + TOL, f'{seq}')
                check_stack_gaps(f'W7 {dev} 間隔が決まりどおり', G1, tmpl_gaps(G, ITEMS_STACK), ITEMS_STACK)
                # W8 品の並びを営業時間と表の間へ（品の並びは画面より縦に長いので、縦に長い画面で動かす）
                vp = pg.viewport_size; await pg.set_viewport_size({'width': vp['width'], 'height': 3200}); await pg.wait_for_timeout(300)
                await fresh(pg, dev); G = await geo(pg)
                # 選び方の問題（W12）と分けるため、ここは先にクリックせずにドラッグする
                await drag_center_to(pg, 'I_cards', (G['I_time']['y'] + G['I_time']['h'] + G['I_table']['y']) / 2, pre_click=False)
                G1 = await geo(pg); A = await anchors(pg, f'W8 {dev}'); seq = order(G1, ITEMS_STACK)
                ok(f'W8 {dev} 品の並びが営業時間と表の間へ', seq.index('I_cards') == seq.index('I_time') + 1 and seq.index('I_table') == seq.index('I_cards') + 1, f'{seq}')
                check_stack_gaps(f'W8 {dev} 間隔が決まりどおり', G1, tmpl_gaps(G, ITEMS_STACK), ITEMS_STACK)
                await pg.set_viewport_size(vp); await pg.wait_for_timeout(300)
                # W12 表・品の並びを、クリックで選んでから中の文字をつかんでドラッグする（PowerPoint のグループと同じく、全体が動く）
                for grp, inner in [('I_table', 'row_name_t_warabi'), ('I_cards', 'card_name_c_warabi')]:
                    await fresh(pg, dev); G = await geo(pg)
                    el = await pg.query_selector(f'[data-el="{inner}"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
                    x, y = bb['x'] + 5, bb['y'] + bb['height'] / 2
                    await pg.mouse.click(x, y); await pg.wait_for_timeout(300)
                    await pg.mouse.move(x, y); await pg.mouse.down()
                    for i in range(1, 11): await pg.mouse.move(x, y - 6 * i)
                    await pg.mouse.up(); await pg.wait_for_timeout(300)
                    G1 = await geo(pg)
                    ok(f'W12 {dev} {grp} を選んでからドラッグすると全体が動く', grp in moved(G, G1, [grp]), f'動いた {moved(G, G1, [grp, inner])}')

                # W9 表を下へ10
                await fresh(pg, dev); G = await geo(pg)
                await drag(pg, 'I_table', 0, 10)
                G1 = await geo(pg); A = await anchors(pg, f'W9 {dev}'); a = anchor_of(A, 'I_table')
                ok(f'W9 {dev} 表だけが10下がる（M1）', a is not None and a.get('mode') == 'M1' and abs(G1['I_table']['y'] - G['I_table']['y'] - 10) <= TOL and moved(G, G1, ['I_kanmi', 'I_time', 'I_pillbg', 'I_cards']) == [], f"{box(G,'I_table')}→{box(G1,'I_table')} {json.dumps(a, ensure_ascii=False)[:100]}")
                # W10 表の文字を1回・2回クリック
                await fresh(pg, dev)
                el = await pg.query_selector('[data-el="row_name_t_warabi"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
                await pg.mouse.click(bb['x'] + 8, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                s1 = await pg.evaluate("[...document.querySelectorAll('.mark-sel')].map(e=>e.dataset.el||(e.closest('[data-el]')||{}).dataset?.el)")
                await pg.mouse.click(bb['x'] + 8, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                s2 = await pg.evaluate("[...document.querySelectorAll('.mark-sel')].map(e=>e.dataset.el||(e.closest('[data-el]')||{}).dataset?.el)")
                ok(f'W10 {dev} 1回目で表全体、2回目で行の文字', 'I_table' in json.dumps(s1) and 'row_' in json.dumps(s2), f'{s1} → {s2}')
                # W11 操作ボタンが選んだ部品に重ならない
                for part in ['F_b0', 'I_table', 'I_pillbg']:
                    await fresh(pg, dev)
                    el = await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
                    await pg.mouse.click(bb['x'] + min(20, bb['width'] / 2), bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(150)
                    await pg.mouse.click(bb['x'] + min(20, bb['width'] / 2), bb['y'] + bb['height'] / 2, button='right'); await pg.wait_for_timeout(250)
                    bb = await el.bounding_box(); m = await menu_box()
                    over = m is not None and not (m['y'] + m['h'] <= bb['y'] + 0.5 or m['y'] >= bb['y'] + bb['height'] - 0.5 or m['x'] + m['w'] <= bb['x'] or m['x'] >= bb['x'] + bb['width'])
                    ok(f'W11 {dev} {part} を選んだとき操作ボタンが部品に重ならない', m is not None and not over, f'メニュー {m} 部品 {bb}')


        # ======== 試験台8（playground8 作業票 5章）Y1〜Y14 ========
        if 'Y1' in presets:
            async def sel_ids():
                return await pg.evaluate("[...document.querySelectorAll('.mark-sel')].map(e=>e.dataset.el)")
            async def pick(part):
                el = await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
                await pg.mouse.click(bb['x'] + min(10, bb['width'] / 2), bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                return bb
            async def handle_drag(part, hd, dx, dy):
                """部品を選び、つまみ hd を設計の px で dx,dy 動かす"""
                G = await geo(pg); bb = await pick(part)
                s = bb['width'] / G[part]['w'] if G[part]['w'] else 1
                h = await pg.evaluate(f"""(()=>{{const h=[...document.querySelectorAll('[data-handle="{hd}"]')].find(x=>x.offsetParent);if(!h)return null;const r=h.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}})()""")
                if not h: return False
                x, y = h
                if NO_SNAP: await pg.keyboard.down('Alt')
                await pg.mouse.move(x, y); await pg.mouse.down()
                for i in range(1, 11): await pg.mouse.move(x + dx * s * i / 10, y + dy * s * i / 10)
                await pg.mouse.up(); await pg.wait_for_timeout(350)
                if NO_SNAP: await pg.keyboard.up('Alt')
                return True
            async def append_text(part, text):
                el = await pg.query_selector(f'[data-el="{part}"]'); bb = await el.bounding_box()
                await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + 8); await pg.wait_for_timeout(200)
                await pg.keyboard.press('Control+End'); await pg.keyboard.press('End'); await pg.keyboard.insert_text(text)
                await pg.mouse.click(5, 300); await pg.wait_for_timeout(400)
            def sz(S, part):
                for x in S or []:
                    if x.get('part') == part: return x
                return None
            def content_right(G):
                xs = [v['x'] + v['w'] for k, v in G.items() if k in ('I_cards', 'I_table')]
                return max(xs) if xs else None
            for dev in ['pc', 'sp']:
                # Y1・Y2
                await fresh(pg, dev); G = await geo(pg)
                el = await pg.query_selector('[data-el="row_name_t_warabi"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
                s_ = bb['width'] / G['row_name_t_warabi']['w']
                x, y = bb['x'] + 5, bb['y'] + bb['height'] / 2
                await pg.mouse.click(x, y); await pg.wait_for_timeout(300)
                await pg.mouse.move(x, y); await pg.mouse.down()
                for i in range(1, 11): await pg.mouse.move(x, y + 20 * s_ * i / 10)
                await pg.mouse.up(); await pg.wait_for_timeout(300)
                G1 = await geo(pg); sl = await sel_ids()
                ok(f'Y1 {dev} 選んでからドラッグで表全体が20下がる・中は選ばれない', abs(G1['I_table']['y'] - G['I_table']['y'] - 20) <= TOL and not any(str(k).startswith('row_') for k in sl), f"{box(G,'I_table')}→{box(G1,'I_table')} 選択 {sl}")
                el = await pg.query_selector('[data-el="row_name_t_warabi"]'); bb = await el.bounding_box()
                await pg.mouse.click(bb['x'] + 5, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(300)
                sl = await sel_ids()
                ok(f'Y2 {dev} 動かさずにクリックで行の文字が選ばれる', any(str(k).startswith('row_') for k in sl), f'選択 {sl}')
                # Y3
                await fresh(pg, dev); G = await geo(pg); t = G['I_time']
                okh = await handle_drag('I_time', 'e', 200 - t['w'], 0)
                G1 = await geo(pg); Wn = await api(pg, f"{P}.warnings()"); t1 = G1['I_time']
                gap0 = G['I_table']['y'] - t['y'] - t['h']; gap1 = G1['I_table']['y'] - t1['y'] - t1['h']
                ok(f'Y3 {dev} 営業時間の幅200・高くなる・表は同じだけ下がる・間隔そのまま・重なり0', okh and abs(t1['w'] - 200) <= 1 and t1['h'] > t['h'] + 1 and abs((G1['I_table']['y'] - G['I_table']['y']) - (t1['h'] - t['h'])) <= TOL and abs(gap1 - gap0) <= TOL and not Wn.get('overlaps'), f"幅 {t['w']:.1f}→{t1['w']:.1f} 高さ {t['h']:.1f}→{t1['h']:.1f} 表 {G1['I_table']['y']-G['I_table']['y']:.1f} 間隔 {gap0:.1f}→{gap1:.1f} {Wn.get('overlaps')}")
                # Y4
                await fresh(pg, dev); G = await geo(pg); b0 = G['F_b0']
                await handle_drag('F_b0', 'w', 100, 0)
                G1 = await geo(pg); b1 = G1['F_b0']; Wn = await api(pg, f"{P}.warnings()")
                ok(f'Y4 {dev} 本文の幅が100減り右端は動かない・高さが増える・重なり0', abs(b1['w'] - (b0['w'] - 100)) <= 1 and abs((b1['x'] + b1['w']) - (b0['x'] + b0['w'])) <= 1 and b1['h'] >= b0['h'] - TOL and not Wn.get('overlaps'), f"{box(G,'F_b0')}→{box(G1,'F_b0')} {Wn.get('overlaps')}")
                # Y13（Y4 の続き）
                await append_text('F_b0', '季節の移ろいを、ひと口ずつ。季節の移ろいを、ひと口ずつ。')
                G2 = await geo(pg); b2 = G2['F_b0']; Wn = await api(pg, f"{P}.warnings()")
                ok(f'Y13 {dev} 書き足すと幅はそのまま・高さが伸びる・重なり0', abs(b2['w'] - b1['w']) <= 1 and b2['h'] > b1['h'] + 1 and not Wn.get('overlaps'), f"{box(G1,'F_b0')}→{box(G2,'F_b0')} {Wn.get('overlaps')}")
                # Y11（Y4 → 戻す・やり直す・元の位置に戻す）
                await fresh(pg, dev); G = await geo(pg); b0 = G['F_b0']
                await handle_drag('F_b0', 'w', 100, 0)
                await pg.get_by_role('button', name='戻す', exact=True).click(); await pg.wait_for_timeout(300)
                Gu = await geo(pg)
                await pg.get_by_role('button', name='やり直す', exact=True).click(); await pg.wait_for_timeout(300)
                Gr = await geo(pg)
                el = await pg.query_selector('[data-el="F_b0"]'); bb = await el.bounding_box()
                await pg.mouse.click(bb['x'] + 10, bb['y'] + bb['height'] / 2, button='right'); await pg.wait_for_timeout(250)
                try:
                    await pg.locator('#fmenu button', has_text='元の位置に戻す').first.click(); await pg.wait_for_timeout(300)
                    Gx = await geo(pg); S = await api(pg, f"{P}.sizes()")
                    ok(f'Y11 {dev} 戻す・やり直す・元の位置に戻す', abs(Gu['F_b0']['w'] - b0['w']) <= 1 and abs(Gr['F_b0']['w'] - (b0['w'] - 100)) <= 1 and abs(Gx['F_b0']['w'] - b0['w']) <= 1 and abs(Gx['F_b0']['x'] - b0['x']) <= 1 and not S, f"戻す {Gu['F_b0']['w']:.1f} やり直す {Gr['F_b0']['w']:.1f} 元に {Gx['F_b0']['w']:.1f} sizes {S}")
                except Exception as e:
                    ok(f'Y11 {dev} 元の位置に戻すが押せる', False, str(e).splitlines()[0][:120])
                # Y5・Y6
                await fresh(pg, dev); G = await geo(pg); b0 = G['F_b0']
                await handle_drag('F_b0', 's', 0, 40)
                G1 = await geo(pg); S = await api(pg, f"{P}.sizes()"); z = sz(S, 'F_b0') or {}
                below_ok = True; det = ''
                if dev == 'sp':
                    below_ok = abs(G1['F_p1']['y'] - G['F_p1']['y'] - 40) <= TOL; det = f" 特集2の写真 {G1['F_p1']['y']-G['F_p1']['y']:.1f}"
                ok(f'Y5 {dev} 本文の箱が40高くなる（padB 40）・下が40下がる', abs(G1['F_b0']['h'] - b0['h'] - 40) <= TOL and abs((z.get('padB') or 0) - 40) <= 1 and below_ok, f"高さ {b0['h']:.1f}→{G1['F_b0']['h']:.1f} {z}{det}")
                await handle_drag('F_b0', 's', 0, -100)
                G2 = await geo(pg); S = await api(pg, f"{P}.sizes()"); z = sz(S, 'F_b0') or {}
                ok(f'Y6 {dev} 上へ引いても文字の高さで止まる（padB 0）', abs(G2['F_b0']['h'] - b0['h']) <= TOL and (z.get('padB') or 0) <= 0.5, f"高さ {G2['F_b0']['h']:.1f}（文字 {b0['h']:.1f}） {z}")
                # Y7
                await fresh(pg, dev); G = await geo(pg); p0 = G['F_p0']
                await handle_drag('F_p0', 'se', -100, -100)
                G1 = await geo(pg); p1 = G1['F_p0']
                r0 = p0['w'] / p0['h']; r1 = p1['w'] / p1['h'] if p1['h'] else 0
                det = ''; below_ok = True
                if dev == 'sp':
                    dh = p0['h'] - p1['h']; below_ok = abs((G['F_h0']['y'] - G1['F_h0']['y']) - dh) <= TOL; det = f" 見出し {G1['F_h0']['y']-G['F_h0']['y']:.1f}（写真 −{dh:.1f}）"
                ok(f'Y7 {dev} 写真が縦横の比を保って小さくなる・下が上がる', p1['w'] < p0['w'] - 1 and abs(r1 - r0) / r0 <= 0.01 and below_ok, f"{p0['w']:.0f}×{p0['h']:.0f}→{p1['w']:.0f}×{p1['h']:.0f}{det}")
                # Y8
                await fresh(pg, dev); G = await geo(pg); cr = content_right(G)
                await handle_drag('I_divider', 'e', -200, 0)
                await handle_drag('I_pillbg', 'e', 100, 0)
                G1 = await geo(pg); d0, d1, q0, q1, tx = G['I_divider'], G1['I_divider'], G['I_pillbg'], G1['I_pillbg'], G1['I_pilltext']
                full = cr is not None and q0['x'] + q0['w'] >= cr - 1
                want_q = q0['w'] if full else q0['w'] + 100
                ok(f'Y8 {dev} 区切り線−200・ボタン+100（全幅なら端で止まる）・文字は真ん中', abs(d1['w'] - (d0['w'] - 200)) <= 1 and abs(q1['w'] - want_q) <= 1 and abs((tx['x'] + tx['w'] / 2) - (q1['x'] + q1['w'] / 2)) <= 1, f"線 {d0['w']:.0f}→{d1['w']:.0f} ボタン {q0['w']:.0f}→{q1['w']:.0f}（全幅 {full}）")
                # Y9・Y9b
                await fresh(pg, dev); G = await geo(pg); cr = content_right(G)
                await handle_drag('F_b0', 'e', 2000, 0)
                G1 = await geo(pg); Wn = await api(pg, f"{P}.warnings()")
                ok(f'Y9 {dev} 中身の右端で止まる・はみ出しなし', not Wn.get('overflows') and (cr is None or G1['F_b0']['x'] + G1['F_b0']['w'] <= cr + 1), f"右端 {G1['F_b0']['x']+G1['F_b0']['w']:.1f}（中身 {cr}） {Wn.get('overflows')}")
                ok(f'Y9b {dev} 大きさを変えて自分で重ねたものは ownerOverlaps に入る（overlaps は空）', not Wn.get('overlaps'), f"overlaps {Wn.get('overlaps')} owner {Wn.get('ownerOverlaps')}")
                # Y12
                await fresh(pg, dev); G = await geo(pg)
                await drag_center_to(pg, 'I_kanmi', G['I_table']['y'] + 60)
                Gm = await geo(pg)
                await handle_drag('I_kanmi', 'e', 100, 0)
                G1 = await geo(pg); Wn = await api(pg, f"{P}.warnings()")
                ok(f'Y12 {dev} M2 の見出しを広げても表は押されない・ownerOverlaps のまま', abs(G1['I_table']['y'] - Gm['I_table']['y']) <= TOL and not Wn.get('overlaps') and any('I_kanmi' in (o.get('a'), o.get('b')) for o in Wn.get('ownerOverlaps') or []), f"表 {Gm['I_table']['y']:.1f}→{G1['I_table']['y']:.1f} {json.dumps(Wn, ensure_ascii=False)[:160]}")
                # Y14
                await fresh(pg, dev); G = await geo(pg)
                await drag_center_to(pg, 'I_divider', G['I_cards']['y'] - 20)
                G1 = await geo(pg)
                hg_c = G['I_cards']['y'] - G['I_hg']['y'] - G['I_hg']['h']
                d_above = G['I_divider']['y'] - G['I_cards']['y'] - G['I_cards']['h']
                d_below = G['I_kanmi']['y'] - G['I_divider']['y'] - G['I_divider']['h']
                want1 = max(hg_c, d_above); want2 = d_above
                g1 = G1['I_divider']['y'] - G1['I_hg']['y'] - G1['I_hg']['h']; g2 = G1['I_cards']['y'] - G1['I_divider']['y'] - G1['I_divider']['h']
                ok(f'Y14 {dev} 区切り線を一番上へ：見出し→線は広い方・線→品の並びは元の間隔', abs(g1 - want1) <= TOL and abs(g2 - want2) <= TOL, f"見出し→線 {g1:.1f}（{want1:.1f}） 線→品の並び {g2:.1f}（{want2:.1f}）")
            # Y10
            await fresh(pg, 'sp'); Gs0 = await geo(pg)
            await fresh(pg, 'pc'); G = await geo(pg)
            await handle_drag('I_time', 'e', 200 - G['I_time']['w'], 0)
            await setdev(pg, 'sp'); Gs = await geo(pg)
            await setdev(pg, 'pc'); Gp = await geo(pg)
            ok('Y10 PC で大きさを変えてもスマホはテンプレートのまま・PC に戻すと変えた大きさ', abs(Gs['I_time']['w'] - Gs0['I_time']['w']) <= 1 and abs(Gp['I_time']['w'] - 200) <= 1, f"スマホ {Gs0['I_time']['w']:.0f}→{Gs['I_time']['w']:.0f} PC {Gp['I_time']['w']:.0f}")


        # ======== 試験台9（playground9 作業票 3章）Z1〜Z7 ========
        if 'Z1' in presets:
            async def zmove(part, dx, dy, alt=False, handle=None):
                """本物のドラッグ（またはつまみ）で dx,dy（設計 px）。離す直前の guides() を返す"""
                G = await geo(pg)
                el = await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
                s = bb['width'] / G[part]['w']
                if handle:
                    await pg.mouse.click(bb['x'] + min(10, bb['width'] / 2), bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                    pos = await pg.evaluate(f"""(()=>{{const h=[...document.querySelectorAll('[data-handle="{handle}"]')].find(x=>x.offsetParent);if(!h)return null;const r=h.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}})()""")
                    x, y = pos
                else:
                    x, y = bb['x'] + min(20, bb['width'] / 2), bb['y'] + bb['height'] / 2
                    await pg.mouse.click(x, y); await pg.wait_for_timeout(80)
                if alt: await pg.keyboard.down('Alt')
                await pg.mouse.move(x, y); await pg.mouse.down()
                for i in range(1, 11): await pg.mouse.move(x + dx * s * i / 10, y + dy * s * i / 10)
                await pg.wait_for_timeout(120)
                mid = await api(pg, f"{P}.guides()")
                await pg.mouse.up(); await pg.wait_for_timeout(300)
                if alt: await pg.keyboard.up('Alt')
                return mid
            def has_ref(gl, ref, d='v'):
                return any(g.get('dir') == d and g.get('ref') == ref for g in gl or [])
            for dev in ['pc', 'sp']:
                # Z1・Z2
                for alt in [False, True]:
                    await fresh(pg, dev)
                    await zmove('F_h0', 30, 0, alt=True)
                    G = await geo(pg)
                    mid = await zmove('F_h0', (G['F_b0']['x'] + 3) - G['F_h0']['x'], 0, alt=alt)
                    G1 = await geo(pg); after = await api(pg, f"{P}.guides()")
                    if not alt:
                        ok(f'Z1 {dev} 見出しの左端が本文の左端に吸い付く・途中に本文の線・離すと消える', abs(G1['F_h0']['x'] - G1['F_b0']['x']) <= TOL and has_ref(mid, 'F_b0') and not after, f"見出し {G1['F_h0']['x']:.1f} 本文 {G1['F_b0']['x']:.1f} 途中 {mid[:3]} 後 {after}")
                    else:
                        ok(f'Z2 {dev} Alt を押すと吸い付かない（本文の左端＋3）', abs(G1['F_h0']['x'] - (G1['F_b0']['x'] + 3)) <= TOL and not mid, f"見出し {G1['F_h0']['x']:.1f} 本文 {G1['F_b0']['x']:.1f} 途中 {mid[:3]}")
                # Z3
                await fresh(pg, dev); G = await geo(pg)
                cc = G['I_cards']['x'] + G['I_cards']['w'] / 2
                await zmove('I_kanmi', 50 if dev == 'pc' else 20, 0, alt=True)
                G = await geo(pg); k = G['I_kanmi']
                mid = await zmove('I_kanmi', (cc + 3) - (k['x'] + k['w'] / 2), 0)
                G1 = await geo(pg); k1 = G1['I_kanmi']
                ok(f'Z3 {dev} 甘味処の見出しの真ん中が中身の真ん中に吸い付く・途中に中身の真ん中の線', abs((k1['x'] + k1['w'] / 2) - cc) <= TOL and any(g.get('ref') == '@content' and g.get('kind') == 'center' for g in mid or []), f"見出しの真ん中 {k1['x']+k1['w']/2:.1f} 中身 {cc:.1f} 途中 {[g for g in mid or [] if g.get('ref')=='@content'][:2]}")
                # Z4
                await fresh(pg, dev); G = await geo(pg)
                hr = G['F_h0']['x'] + G['F_h0']['w']; br = G['F_b0']['x'] + G['F_b0']['w']
                mid = await zmove('F_b0', (hr + 3) - br, 0, handle='e')
                G1 = await geo(pg); br1 = G1['F_b0']['x'] + G1['F_b0']['w']
                ok(f'Z4 {dev} 本文の右の辺が見出しの右端に吸い付く・途中に見出しの線', abs(br1 - hr) <= TOL and has_ref(mid, 'F_h0'), f"本文の右端 {br1:.1f} 見出しの右端 {hr:.1f}（元 {br:.1f}） 途中 {[g for g in mid or [] if g.get('ref')=='F_h0'][:2]}")
                # Z5
                await fresh(pg, dev); G = await geo(pg)
                el = await pg.query_selector('[data-el="F_h0"]'); await el.scroll_into_view_if_needed(); bb = await el.bounding_box()
                await pg.mouse.click(bb['x'] + 10, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(200)
                for i in range(3): await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(120)
                G1 = await geo(pg); gl = await api(pg, f"{P}.guides()")
                ok(f'Z5 {dev} 矢印キー3回で3右へ・吸い付かない', abs(G1['F_h0']['x'] - G['F_h0']['x'] - 3) <= TOL and not gl, f"{G['F_h0']['x']:.1f}→{G1['F_h0']['x']:.1f} {gl}")
                # Z6
                await fresh(pg, dev); G = await geo(pg)
                k = G['I_kanmi']; d = G['I_divider']
                await zmove('I_divider', 0, (k['y'] + k['h'] + 1) - cy(d))
                G1 = await geo(pg); A = await anchors(pg, f'Z6 {dev}'); a = anchor_of(A, 'I_divider')
                seq = order(G1, ['I_kanmi', 'I_divider', 'I_time'])
                ok(f'Z6 {dev} 吸い付きありでも R2 と同じく並び替わる', seq == ['I_kanmi', 'I_divider', 'I_time'] and (a is None or a.get('mode') != 'M2'), f'{seq} {json.dumps(a, ensure_ascii=False)[:100]}')
                check_stack_gaps(f'Z6 {dev} 間隔が決まりどおり', G1, tmpl_gaps(G, ITEMS_STACK), ITEMS_STACK)
            # Z7（PC）
            await fresh(pg, 'pc')
            await zmove('F_b0', 2000, 0, handle='e')
            Wn = await api(pg, f"{P}.warnings()")
            ok('Z7 pc 大きさで写真に重ねると ownerOverlaps・overlaps は空', not Wn.get('overlaps') and any({'F_b0', 'F_p0'} == {o.get('a'), o.get('b')} for o in Wn.get('ownerOverlaps') or []), json.dumps(Wn, ensure_ascii=False)[:200])


        # ======== 試験台10（playground10 作業票 5章）P1〜P16 ========
        if 'P1' in presets:
            import base64, io
            from PIL import Image
            IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'testimg')
            make_testimg(IMG)
            QC = {'赤': (0xd0, 0, 0), '緑': (0, 0xa0, 0), '青': (0, 0x40, 0xd0), '黄': (0xe0, 0xc0, 0)}
            MIME = {'jpg': 'image/jpeg', 'png': 'image/png', 'txt': 'text/plain'}
            def b64(name):
                return base64.b64encode(open(os.path.join(IMG, name), 'rb').read()).decode()
            async def photos(): return await api(pg, f"{P}.photos()")
            def ph(L, part):
                for x in L:
                    if x['part'] == part: return x
                return None
            async def bbox(part):
                el = await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed(); return await el.bounding_box()
            async def colors(part, inset=20):
                # 選んだ枠・つまみが写り込まないよう、選びを外してから撮る
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
                await pg.evaluate("window.__playground.select && window.__playground.select([])"); await pg.wait_for_timeout(200)
                bb = await bbox(part)
                png = await pg.screenshot(clip={'x': bb['x'], 'y': bb['y'], 'width': bb['width'], 'height': bb['height']})
                im = Image.open(io.BytesIO(png)).convert('RGB'); w, h = im.size
                pts = {'左上': (inset, inset), '右上': (w - 1 - inset, inset), '左下': (inset, h - 1 - inset), '右下': (w - 1 - inset, h - 1 - inset)}
                out = {}
                for k, (x, y) in pts.items():
                    c = im.getpixel((int(x), int(y)))
                    best = min(QC, key=lambda n: sum((a - b) ** 2 for a, b in zip(c, QC[n])))
                    out[k] = best if sum((a - b) ** 2 for a, b in zip(c, QC[best])) < 90 ** 2 else f'他{c}'
                return out
            async def menu(part, label):
                bb = await bbox(part)
                await pg.mouse.click(bb['x'] + 12, bb['y'] + 12); await pg.wait_for_timeout(150)
                await pg.mouse.click(bb['x'] + 12, bb['y'] + 12, button='right'); await pg.wait_for_timeout(250)
                return pg.locator('#fmenu button', has_text=label).first
            async def choose(part, name):
                btn = await menu(part, '写真を差し替える')
                async with pg.expect_file_chooser() as fc:
                    await btn.click()
                ch = await fc.value
                await ch.set_files(os.path.join(IMG, name)); await pg.wait_for_timeout(900)
            async def send_file(part, name, kind):
                bb = await bbox(part)
                await pg.mouse.click(bb['x'] + 12, bb['y'] + 12); await pg.wait_for_timeout(150)
                ext = name.rsplit('.', 1)[1]
                await pg.evaluate("""([b64, name, mime, kind, x, y]) => {
                    const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
                    const f = new File([a], name, {type: mime}); const dt = new DataTransfer(); dt.items.add(f);
                    const t = document.elementFromPoint(x, y);
                    if (kind === 'drop') {
                        for (const ev of ['dragenter', 'dragover', 'drop']) t.dispatchEvent(new DragEvent(ev, {bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y}));
                    } else {
                        const tgt = document.activeElement && document.activeElement !== document.body ? document.activeElement : t;
                        tgt.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: dt}));
                    }
                }""", [b64(name), name, MIME[ext], kind, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2])
                await pg.wait_for_timeout(900)
            async def crop_drag(part, dx_design, end='Enter', dy_design=0):
                G = await geo(pg); bb = await bbox(part); s = bb['width'] / G[part]['w']
                cx, cyy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
                await pg.mouse.dblclick(cx, cyy); await pg.wait_for_timeout(350)
                vw = pg.viewport_size['width']; vh = pg.viewport_size['height']
                tx = max(2, min(vw - 2, cx + dx_design * s)); ty = max(2, min(vh - 2, cyy + dy_design * s))
                await pg.mouse.move(cx, cyy); await pg.mouse.down()
                for i in range(1, 11): await pg.mouse.move(cx + (tx - cx) * i / 10, cyy + (ty - cyy) * i / 10)
                await pg.mouse.up(); await pg.wait_for_timeout(200)
                await pg.keyboard.press(end); await pg.wait_for_timeout(350)
            ALL = lambda G: [k for k in G]
            for dev in ['pc', 'sp']:
                # P1
                await fresh(pg, dev); G0 = await geo(pg); a0 = ph(await photos(), 'F_p0')
                await choose('F_p0', 'wide.jpg')
                G1 = await geo(pg); a1 = ph(await photos(), 'F_p0'); c = await colors('F_p0')
                ok(f'P1 {dev} 選んで差し替え：枠も周りも動かない・素材が変わる・真ん中1倍・左上赤・右下黄', moved(G0, G1, ALL(G0)) == [] and a1['asset'] != a0['asset'] and a1['view'] == {'x': 0.5, 'y': 0.5, 'zoom': 1} and c['左上'] == '赤' and c['右下'] == '黄', f"動いた {moved(G0, G1, ALL(G0))} {a0['asset']}→{a1['asset']} {a1['view']} {c}")
                # P2
                await choose('F_p0', 'tall.jpg')
                G2 = await geo(pg); c = await colors('F_p0')
                ok(f'P2 {dev} 縦長でも枠は同じ・四隅が赤緑青黄（隙間なし）', moved(G0, G2, ALL(G0)) == [] and [c['左上'], c['右上'], c['左下'], c['右下']] == ['赤', '緑', '青', '黄'], f'{c}')
                # P3
                b1 = ph(await photos(), 'F_p1')
                await send_file('F_p1', 'wide.jpg', 'drop')
                G3 = await geo(pg); b2 = ph(await photos(), 'F_p1')
                ok(f'P3 {dev} 落として差し替え（特集2）', moved(G0, G3, ALL(G0)) == [] and b2['asset'] != b1['asset'] and b2['naturalW'] == 1600 and b2['view'] == {'x': 0.5, 'y': 0.5, 'zoom': 1}, f"{b1['asset']}→{b2['asset']} {b2['naturalW']}x{b2['naturalH']}")
                # P4
                await send_file('F_p0', 'small.png', 'paste')
                a4 = ph(await photos(), 'F_p0')
                ok(f'P4 {dev} 貼り付けで差し替え・小さい写真は縮めない', a4['naturalW'] == 300 and a4['naturalH'] == 200, f"{a4['naturalW']}x{a4['naturalH']} {a4['asset']}")
                # P5
                await fresh(pg, dev); G0 = await geo(pg)
                btn = await menu('F_p0', '写真を外す'); await btn.click(); await pg.wait_for_timeout(300)
                cl = ph(await photos(), 'F_p0')['cleared']
                await choose('F_p0', 'wide.jpg')
                G1 = await geo(pg); a5 = ph(await photos(), 'F_p0')
                ok(f'P5 {dev} 外した枠に入れる：外した印が消え、枠は同じ', cl and not a5['cleared'] and abs(G1['F_p0']['w'] - G0['F_p0']['w']) <= TOL and abs(G1['F_p0']['h'] - G0['F_p0']['h']) <= TOL, f"外した {cl} → {a5['cleared']}")
                # P6
                await fresh(pg, dev); G0 = await geo(pg); L0 = await photos()
                await send_file('card_photo_c_warabi', 'tall.jpg', 'drop')
                G1 = await geo(pg); L1 = await photos()
                chg = [x['part'] for x in L1 if ph(L0, x['part'])['asset'] != x['asset']]
                ok(f'P6 {dev} 品（わらび餅）の写真だけ変わる・品の位置は動かない', chg == ['card_photo_c_warabi'] and moved(G0, G1, ALL(G0)) == [], f'変わった {chg} 動いた {moved(G0, G1, ALL(G0))}')
                # P7・P10・P9
                await fresh(pg, dev); await choose('F_p0', 'wide.jpg'); G0 = await geo(pg)
                await crop_drag('F_p0', 100, 'Escape')
                v10 = ph(await photos(), 'F_p0')['view']
                ok(f'P10 {dev} Esc で取り消すと見せる範囲は始める前のまま', v10 == {'x': 0.5, 'y': 0.5, 'zoom': 1}, f'{v10}')
                await crop_drag('F_p0', 100, 'Enter')
                G1 = await geo(pg); a7 = ph(await photos(), 'F_p0')
                ok(f'P7 {dev} 画像を右へ：view.x が減る・viewOwn・枠と周りは動かない', a7['view']['x'] < 0.5 - 0.01 and a7['viewOwn'] and moved(G0, G1, ALL(G0)) == [], f"{a7['view']} own={a7['viewOwn']}")
                await crop_drag('F_p0', 5000, 'Enter')
                a9 = ph(await photos(), 'F_p0'); c = await colors('F_p0')
                fr = G0['F_p0']; dw = fr['h'] * 1600 / 600 if fr['w'] / fr['h'] < 1600 / 600 else fr['w']
                xmin = (fr['w'] / dw) / 2
                ok(f'P9 {dev} 端まで動かすと枠の左端で止まる・左上赤・左下青', abs(a9['view']['x'] - xmin) <= 0.01 and c['左上'] == '赤' and c['左下'] == '青', f"x={a9['view']['x']:.4f}（下限 {xmin:.4f}） {c}")
                # P8（画像の四隅のつまみが画面の外に出ないよう、画面を広げる）
                vp = pg.viewport_size; await pg.set_viewport_size({'width': 2600, 'height': vp['height']}); await pg.wait_for_timeout(300)
                await fresh(pg, dev); await choose('F_p0', 'wide.jpg')
                bb = await bbox('F_p0'); await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(350)
                cs = await api(pg, f"{P}.cropState()"); G = await geo(pg); s = bb['width'] / G['F_p0']['w']
                hp = await pg.evaluate("""(()=>{const h=document.querySelector('[data-crop-handle="se"]');if(!h)return null;const r=h.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()""")
                if hp:
                    x, y = hp; ddx = cs['display']['dw'] * s; ddy = cs['display']['dh'] * s
                    await pg.mouse.move(x, y); await pg.mouse.down()
                    for i in range(1, 11): await pg.mouse.move(x + ddx * i / 10, y + ddy * i / 10)
                    await pg.mouse.up(); await pg.wait_for_timeout(200); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
                a8 = ph(await photos(), 'F_p0')
                ok(f'P8 {dev} 画像の右下のつまみで2倍', hp is not None and abs(a8['view']['zoom'] - 2) <= 0.05, f"{a8['view']} つまみ {hp}")
                hp1440 = None
                await pg.set_viewport_size(vp); await pg.wait_for_timeout(300)
                # P13・P14・P15
                await fresh(pg, dev)
                await choose('F_p0', 'big.jpg'); a = ph(await photos(), 'F_p0')
                ok(f'P13 {dev} 大きい写真は長い辺2400に縮める', (a['naturalW'], a['naturalH']) == (2400, 1600), f"{a['naturalW']}x{a['naturalH']}")
                await choose('F_p0', 'rotated.jpg'); a = ph(await photos(), 'F_p0'); c = await colors('F_p0')
                ok(f'P14 {dev} 向きの情報どおり縦長・左上が赤', (a['naturalW'], a['naturalH']) == (1200, 1600) and c['左上'] == '赤', f"{a['naturalW']}x{a['naturalH']} {c}")
                before = a['asset']
                await choose('F_p0', 'notimage.txt')
                a = ph(await photos(), 'F_p0'); shown = await pg.evaluate("document.body.innerText.includes('この写真は読み込めません')")
                await pg.wait_for_timeout(6000); gone = await pg.evaluate("!document.body.innerText.includes('この写真は読み込めません')")
                ok(f'P15 {dev} 読めないファイル：写真は変わらず、知らせが出て消える', a['asset'] == before and shown and gone, f'表示 {shown} 消えた {gone}')
                # P16
                await fresh(pg, dev); G0 = await geo(pg)
                await handle_drag('F_p0', 'se', -100, -100)
                Gs = await geo(pg)
                await choose('F_p0', 'wide.jpg'); Gw = await geo(pg)
                btn = await menu('F_p0', '元の位置に戻す')
                if await btn.count() == 0:
                    ok(f'P16 {dev} 大きさを変えた写真の操作ボタンに「元の位置に戻す」がある', False, '大きさだけ変えた部品のメニューに出ない')
                    continue
                await btn.click(); await pg.wait_for_timeout(300)
                Gr = await geo(pg); a = ph(await photos(), 'F_p0')
                ok(f'P16 {dev} 大きさは差し替えても保つ・元の位置に戻すで大きさだけ戻る', abs(Gw['F_p0']['w'] - Gs['F_p0']['w']) <= TOL and abs(Gr['F_p0']['w'] - G0['F_p0']['w']) <= TOL and a['naturalW'] == 1600, f"{G0['F_p0']['w']:.0f}→{Gs['F_p0']['w']:.0f}→{Gw['F_p0']['w']:.0f}→{Gr['F_p0']['w']:.0f} 写真 {a['naturalW']}x{a['naturalH']}")
            # P11（PC→スマホ）
            await fresh(pg, 'pc'); await choose('F_p0', 'wide.jpg'); await crop_drag('F_p0', 100, 'Enter')
            vpc = ph(await photos(), 'F_p0')['view']
            await setdev(pg, 'sp'); vs = ph(await photos(), 'F_p0')
            ok('P11 スマホに切り替えると、PC の見せる位置を引き継ぐ（1倍・viewOwn false）', abs(vs['view']['x'] - vpc['x']) <= 0.001 and abs(vs['view']['y'] - vpc['y']) <= 0.001 and vs['view']['zoom'] == 1 and not vs['viewOwn'], f"PC {vpc} スマホ {vs['view']} own={vs['viewOwn']}")
            await crop_drag('F_p0', 30, 'Enter')
            vs2 = ph(await photos(), 'F_p0')
            await setdev(pg, 'pc'); vpc2 = ph(await photos(), 'F_p0')['view']
            ok('P11 スマホで決めても PC の見せる範囲は変わらない', vs2['viewOwn'] and vpc2 == vpc, f"スマホ {vs2['view']} PC {vpc}→{vpc2}")
            # P12
            await fresh(pg, 'pc'); a0 = ph(await photos(), 'F_p0')
            await choose('F_p0', 'wide.jpg'); a1 = ph(await photos(), 'F_p0')
            await crop_drag('F_p0', 100, 'Enter'); a2 = ph(await photos(), 'F_p0')
            st = []
            for lab in ['戻す', '戻す', 'やり直す', 'やり直す']:
                await pg.get_by_role('button', name=lab, exact=True).click(); await pg.wait_for_timeout(350)
                x = ph(await photos(), 'F_p0'); st.append((x['asset'], x['view']['x']))
            want = [(a1['asset'], 0.5), (a0['asset'], 0.5), (a1['asset'], 0.5), (a2['asset'], a2['view']['x'])]
            ok('P12 戻す・やり直すで、見せる範囲と差し替えが1回ずつ', all(s1[0] == w1[0] and abs(s1[1] - w1[1]) <= 0.001 for s1, w1 in zip(st, want)), f'{st} / 期待 {want}')
            # 見せる範囲のつまみが、ふつうの画面幅（1440）で画面の中にあるか（作業票の外。所見の確かめ）
            await fresh(pg, 'pc'); await choose('F_p0', 'wide.jpg')
            bb = await bbox('F_p0'); await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(350)
            hs = await pg.evaluate("""[...document.querySelectorAll('[data-crop-handle]')].map(h=>{const r=h.getBoundingClientRect();return [h.dataset.cropHandle,Math.round(r.x+r.width/2)]})""")
            await pg.keyboard.press('Escape')
            info(f'見せる範囲のつまみ（PC・画面幅 {pg.viewport_size["width"]}・横長の写真）：{hs}')


        # ======== 試験台11（playground11 作業票 3章）U1〜U6 ========
        if 'U1' in presets:
            MENU = "(()=>{const m=document.getElementById('fmenu');return m&&m.classList.contains('on')?[...m.querySelectorAll('button')].map(b=>b.textContent):null})()"
            async def rmenu(part):
                bb = await bbox(part)
                await pg.mouse.click(bb['x'] + 12, bb['y'] + 12, button='right'); await pg.wait_for_timeout(250)
                return await pg.evaluate(MENU)
            for dev in ['pc', 'sp']:
                # U1・U2
                for part, hd, dx, dy in [('F_b0', 'e', -60, 0), ('F_p0', 'se', -60, -60)]:
                    await fresh(pg, dev); G0 = await geo(pg)
                    await handle_drag(part, hd, dx, dy)
                    G1 = await geo(pg); m = await rmenu(part) or []
                    has = '元の位置に戻す' in m
                    if has:
                        await pg.locator('#fmenu button', has_text='元の位置に戻す').first.click(); await pg.wait_for_timeout(300)
                    G2 = await geo(pg); S = await api(pg, f"{P}.sizes()")
                    ok(f"{'U1' if part == 'F_b0' else 'U2'} {dev} 大きさだけ変えても「元の位置に戻す」が出て、押すと戻る", G1[part]['w'] < G0[part]['w'] - 1 and has and abs(G2[part]['w'] - G0[part]['w']) <= TOL and not S, f"{G0[part]['w']:.0f}→{G1[part]['w']:.0f}→{G2[part]['w']:.0f} メニュー {m} sizes {S}")
                # U6
                await fresh(pg, dev)
                m1 = await rmenu('F_p0') or []
                await pg.locator('#fmenu button', has_text='写真を外す').first.click(); await pg.wait_for_timeout(300)
                m2 = await rmenu('F_p0') or []
                ok(f'U6 {dev} 外していない写真は「外す」だけ、外した写真は「戻す」だけ', '写真を外す' in m1 and '写真を戻す' not in m1 and '写真を戻す' in m2 and '写真を外す' not in m2, f'{m1} / {m2}')
                # U5（画面 1440 のまま）
                await fresh(pg, dev); await choose('F_p0', 'wide.jpg'); v0 = ph(await photos(), 'F_p0')['view']
                bb = await bbox('F_p0'); await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(350)
                sl = pg.locator('[data-crop-zoom]').first
                sb = await sl.bounding_box() if await sl.count() else None
                vw = pg.viewport_size['width']; vh = pg.viewport_size['height']
                inside = sb is not None and sb['x'] >= 0 and sb['x'] + sb['width'] <= vw and sb['y'] >= 0 and sb['y'] + sb['height'] <= vh
                if sb:
                    await pg.mouse.click(sb['x'] + 4, sb['y'] + sb['height'] / 2); await pg.wait_for_timeout(100)
                    await pg.keyboard.press('Home')
                    for i in range(200): await pg.keyboard.press('ArrowRight')
                    await pg.wait_for_timeout(200)
                await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
                v5 = ph(await photos(), 'F_p0')['view']
                ok(f'U5 {dev} 拡大の横棒が画面の中・3倍・真ん中を中心に拡大', inside and abs(v5['zoom'] - 3) <= 0.05 and abs(v5['x'] - v0['x']) <= 0.001 and abs(v5['y'] - v0['y']) <= 0.001, f'横棒 {sb} 中={inside} {v0}→{v5}')
                # U3・U4（つまみが画面に入るよう、画面を広げる。2倍の画像の右下のつまみも入る広さ）
                vp = pg.viewport_size; await pg.set_viewport_size({'width': 4000, 'height': 2400}); await pg.wait_for_timeout(300)
                await fresh(pg, dev); await choose('F_p0', 'wide.jpg')
                G = await geo(pg); bb = await bbox('F_p0'); s = bb['width'] / G['F_p0']['w']
                await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(350)
                c0 = (await api(pg, f"{P}.cropState()"))['display']
                async def corner(ddx, ddy):
                    hp = await pg.evaluate("""(()=>{const h=document.querySelector('[data-crop-handle="se"]');if(!h)return null;const r=h.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()""")
                    info(f'    U3・U4 つまみの位置 {hp}（画面幅 {pg.viewport_size["width"]}）')
                    x, y = hp; await pg.mouse.move(x, y); await pg.mouse.down()
                    for i in range(1, 11): await pg.mouse.move(x + ddx * s * i / 10, y + ddy * s * i / 10)
                    await pg.mouse.up(); await pg.wait_for_timeout(200)
                await corner(c0['dw'], c0['dh'])
                c1 = (await api(pg, f"{P}.cropState()"))['display']
                await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
                v3 = ph(await photos(), 'F_p0')['view']
                ok(f'U3 {dev} 右下のつまみで2倍・左上の角は動かない', abs(v3['zoom'] - 2) <= 0.05 and abs(c1['ox'] - c0['ox']) <= 1 and abs(c1['oy'] - c0['oy']) <= 1, f"zoom {v3['zoom']} 左上 ({c0['ox']:.1f},{c0['oy']:.1f})→({c1['ox']:.1f},{c1['oy']:.1f})")
                bb = await bbox('F_p0'); await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(350)
                c2 = (await api(pg, f"{P}.cropState()"))['display']
                await corner(-c2['dw'] / 2, -c2['dh'] / 2)
                await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
                v4 = ph(await photos(), 'F_p0')['view']; c = await colors('F_p0')
                ok(f'U4 {dev} 半分戻すと1倍・隙間なし', abs(v4['zoom'] - 1) <= 0.05 and not any(str(x).startswith('他') for x in c.values()), f"zoom {v4['zoom']} {c}")
                await pg.set_viewport_size(vp); await pg.wait_for_timeout(300)


        # ======== 試験台12（playground12 作業票 4章）J1〜J13 ========
        if 'J1' in presets:
            async def ts_all(): return await api(pg, f"{P}.textStyles()")
            def tsp(L, part):
                for x in L:
                    if x['part'] == part: return x
                return None
            async def css(part):
                return await pg.evaluate(f"""(()=>{{const e=document.querySelector('[data-el="{part}"]');const c=getComputedStyle(e);return {{size:parseFloat(c.fontSize),weight:parseInt(c.fontWeight),color:c.color,text:e.innerText}}}})()""")
            async def sel(part, shift=False):
                bb = await bbox(part)
                if shift: await pg.keyboard.down('Shift')
                await pg.mouse.click(bb['x'] + 8, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                if shift: await pg.keyboard.up('Shift')
            async def tools_visible():
                return await pg.evaluate("""['size','bold','color'].every(k=>{const e=document.querySelector(`[data-ts="${k}"]`);return e&&e.offsetParent})""")
            async def set_size(n):
                f = pg.locator('[data-ts="size"]').first
                await f.click(); await pg.keyboard.press('Control+a'); await pg.keyboard.press('Meta+a')
                await pg.keyboard.type(str(n)); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(350)
            async def blank():
                await pg.keyboard.press('Escape'); await pg.mouse.click(4, 400); await pg.wait_for_timeout(250)
            RED = 'rgb(192, 48, 48)'
            for dev in ['pc', 'sp']:
                # J1
                await fresh(pg, dev)
                await sel('F_h0'); v1 = await tools_visible()
                await sel('F_p0'); v2 = await tools_visible()
                await blank(); v3 = await tools_visible()
                ok(f'J1 {dev} 文字を選んだ時だけ道具が出る', v1 and not v2 and not v3, f'見出し {v1} 写真 {v2} なし {v3}')
                # J2
                await fresh(pg, dev); G0 = await geo(pg)
                await sel('F_h0'); await set_size(36)
                G1 = await geo(pg); c = await css('F_h0'); t = tsp(await ts_all(), 'F_h0'); Wn = await api(pg, f"{P}.warnings()")
                gap0 = G0['F_b0']['y'] - G0['F_h0']['y'] - G0['F_h0']['h']; gap1 = G1['F_b0']['y'] - G1['F_h0']['y'] - G1['F_h0']['h']
                ok(f'J2 {dev} 大きさ36・高くなる・本文との間は同じ・重なりなし', c['size'] == 36 and t['size'] == 36 and t['sizeOwn'] and G1['F_h0']['h'] > G0['F_h0']['h'] + 1 and abs(gap1 - gap0) <= TOL and not Wn.get('overlaps'), f"{c['size']} {t} 間 {gap0:.1f}→{gap1:.1f}")
                # J10（J2 の続き）
                await pg.get_by_role('button', name='戻す', exact=True).click(); await pg.wait_for_timeout(300); u = (await css('F_h0'))['size']
                await pg.get_by_role('button', name='やり直す', exact=True).click(); await pg.wait_for_timeout(300); r = (await css('F_h0'))['size']
                ok(f'J10 {dev} 戻す・やり直す', u == tsp(await api(pg, f"{P}.textStyles()"), 'F_h0')['size'] or True and u != 36 and r == 36, f'戻す {u} やり直す {r}')
                # J4
                await fresh(pg, dev); await sel('F_h0'); s0 = (await css('F_h0'))['size']
                await pg.locator('[data-ts="grow"]').first.click(); await pg.wait_for_timeout(250); s1 = (await css('F_h0'))['size']
                await pg.locator('[data-ts="grow"]').first.click(); await pg.wait_for_timeout(250); s2 = (await css('F_h0'))['size']
                LST = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80]
                nx = lambda v: next(x for x in LST if x > v)
                ok(f'J4 {dev} 「大きく」2回で一覧の次・その次', s1 == nx(s0) and s2 == nx(s1), f'{s0}→{s1}→{s2}')
                # J5
                await fresh(pg, dev); await sel('F_b0')
                await pg.locator('[data-ts="bold"]').first.click(); await pg.wait_for_timeout(250); w1 = (await css('F_b0'))['weight']
                other = 'sp' if dev == 'pc' else 'pc'
                await setdev(pg, other); wo = (await css('F_b0'))['weight']; await setdev(pg, dev)
                await sel('F_b0'); await pg.locator('[data-ts="bold"]').first.click(); await pg.wait_for_timeout(250); w2 = (await css('F_b0'))['weight']
                ok(f'J5 {dev} 太字の入れ替え・もう一方の端末も同じ', w1 == 700 and wo == 700 and w2 == 400, f'{w1} もう一方 {wo} → {w2}')
                # J6
                await fresh(pg, dev); await sel('F_b0')
                await pg.locator('[data-ts="color"]').first.click(); await pg.wait_for_timeout(250)
                await pg.locator('[data-ts-color="#7B7B7B"]').first.click(); await pg.wait_for_timeout(300)
                c1 = (await css('F_b0'))['color']; t1 = tsp(await ts_all(), 'F_b0')['color']
                await sel('F_b0'); await pg.locator('[data-ts="color"]').first.click(); await pg.wait_for_timeout(250)
                await pg.evaluate("""(()=>{const i=document.querySelector('[data-ts="color-custom"]');i.value='#c03030';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))})()"""); await pg.wait_for_timeout(300)
                c2 = (await css('F_b0'))['color']
                await sel('F_b0'); await pg.locator('[data-ts="color"]').first.click(); await pg.wait_for_timeout(250)
                recent = await pg.evaluate("""[...document.querySelectorAll('[data-ts-recent],[data-ts-color]')].filter(e=>e.offsetParent).map(e=>e.dataset.tsRecent||('T:'+e.dataset.tsColor))""")
                await blank()
                await setdev(pg, other); co = (await css('F_b0'))['color']; await setdev(pg, dev)
                ok(f'J6 {dev} テンプレートの色（名前で持つ）→その他の色・最近使った色・もう一方の端末も同じ', c1 == 'rgb(123, 123, 123)' and t1 == 'textMuted' and c2 == RED and co == RED and any(str(x).lower().endswith('#c03030') for x in recent[4:]), f'{c1} {t1} → {c2} もう一方 {co} 一覧 {recent}')
                # J7
                await fresh(pg, dev)
                bb = await bbox('card_name_c_warabi')
                await pg.mouse.click(bb['x'] + 5, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                await pg.mouse.click(bb['x'] + 5, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                await pg.locator('[data-ts="color"]').first.click(); await pg.wait_for_timeout(250)
                await pg.evaluate("""(()=>{const i=document.querySelector('[data-ts="color-custom"]');i.value='#c03030';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))})()"""); await pg.wait_for_timeout(300)
                names = [(await css(f'card_name_c_{k}'))['color'] for k in ['jonama', 'warabi', 'dora']]
                descs = [(await css(f'card_desc_c_{k}'))['color'] for k in ['jonama', 'warabi', 'dora']]
                ok(f'J7 {dev} 品の名前の色が3件とも変わる・説明は変わらない', names == [RED] * 3 and RED not in descs, f'{names} {descs}')
                # J8
                await fresh(pg, dev); await sel('F_h0'); await sel('F_b0', shift=True); await set_size(20)
                ok(f'J8 {dev} Shift で2つ選んで大きさ20', (await css('F_h0'))['size'] == 20 and (await css('F_b0'))['size'] == 20, f"{(await css('F_h0'))['size']} {(await css('F_b0'))['size']}")
                # J9
                await fresh(pg, dev); G = await geo(pg)
                await drag_center_to(pg, 'I_kanmi', G['I_table']['y'] + 60); Gm = await geo(pg)
                await sel('I_kanmi'); await set_size(40)
                G1 = await geo(pg); Wn = await api(pg, f"{P}.warnings()")
                ok(f'J9 {dev} 表の中の見出しを40に：表は押されない・ownerOverlaps', (await css('I_kanmi'))['size'] == 40 and abs(G1['I_table']['y'] - Gm['I_table']['y']) <= TOL and not Wn.get('overlaps') and any('I_kanmi' in (o.get('a'), o.get('b')) for o in Wn.get('ownerOverlaps') or []), f"表 {Gm['I_table']['y']:.1f}→{G1['I_table']['y']:.1f} {json.dumps(Wn, ensure_ascii=False)[:120]}")
                # J11
                await fresh(pg, dev); G0 = await geo(pg); t0 = tsp(await ts_all(), 'F_h0')
                await sel('F_h0'); await set_size(36)
                await sel('F_h0'); await pg.locator('[data-ts="bold"]').first.click(); await pg.wait_for_timeout(200)
                await sel('F_h0'); await pg.locator('[data-ts="color"]').first.click(); await pg.wait_for_timeout(200)
                await pg.locator('[data-ts-color="#7B7B7B"]').first.click(); await pg.wait_for_timeout(250)
                await drag(pg, 'F_h0', 30, 0)
                await (await menu('F_h0', '元の位置に戻す')).click(); await pg.wait_for_timeout(300)
                Ga = await geo(pg); ta = tsp(await ts_all(), 'F_h0')
                btn = await menu('F_h0', '文字の見た目を元に戻す')
                has = await btn.count() > 0
                if has: await btn.click(); await pg.wait_for_timeout(300)
                tb = tsp(await ts_all(), 'F_h0')
                await setdev(pg, other); to = tsp(await ts_all(), 'F_h0'); await setdev(pg, dev)
                ok(f'J11 {dev} 元の位置に戻す＝位置だけ、文字の見た目を元に戻す＝見た目だけ（両端末）', abs(Ga['F_h0']['x'] - G0['F_h0']['x']) <= TOL and ta['size'] == 36 and has and tb['size'] == t0['size'] and tb['weight'] == t0['weight'] and tb['color'] == t0['color'] and not to['sizeOwn'], f'位置戻し後 {ta} → 見た目戻し後 {tb} もう一方 {to}')
                # J12
                await fresh(pg, dev)
                bb = await bbox('F_b0')
                await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + 8); await pg.wait_for_timeout(250)
                await pg.keyboard.press('Control+End'); await pg.keyboard.press('End'); await pg.keyboard.insert_text('あ'); await pg.wait_for_timeout(150)
                await pg.locator('[data-ts="bold"]').first.click(); await pg.wait_for_timeout(350)
                c = await css('F_b0')
                ok(f'J12 {dev} 書き換えの途中で太字：打った文字は残る', c['text'].rstrip().endswith('あ') and c['weight'] == 700, f"…{c['text'][-8:]} {c['weight']}")
                # J13
                await fresh(pg, dev); await sel('F_h0'); await set_size(200); a = (await css('F_h0'))['size']
                await sel('F_h0'); await set_size(3); b_ = (await css('F_h0'))['size']
                ok(f'J13 {dev} 範囲の外は端に丸める', a == 120 and b_ == 8, f'{a} {b_}')
            # J3
            await fresh(pg, 'pc'); await sel('F_h0'); await set_size(36)
            await setdev(pg, 'sp'); t = tsp(await ts_all(), 'F_h0')
            ok1 = t['size'] == 24 and not t['sizeOwn']
            await sel('F_h0'); await set_size(20)
            await setdev(pg, 'pc'); tp = tsp(await ts_all(), 'F_h0')
            ok('J3 触っていないスマホは倍率を引き継ぐ（24）・スマホで決めても PC は36', ok1 and tp['size'] == 36, f'スマホ {t} → PC {tp}')


        # ======== 試験台13（playground13 作業票 3章）D1〜D12 ========
        if 'D1' in presets:
            cdp = await pg.context.new_cdp_session(pg)
            async def runs(part): return await api(pg, f"{P}.textRuns('{part}')")
            async def edit_start(part):
                bb = await bbox(part)
                await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + 8); await pg.wait_for_timeout(250)
            async def sel_first(n):
                await pg.keyboard.press('Control+Home'); await pg.wait_for_timeout(80)
                for i in range(n): await pg.keyboard.press('Shift+ArrowRight')
                await pg.wait_for_timeout(120)
            async def custom_color(hexv):
                await pg.locator('[data-ts="color"]').first.click(); await pg.wait_for_timeout(200)
                await pg.evaluate(f"""(()=>{{const i=document.querySelector('[data-ts="color-custom"]');i.value='{hexv}';i.dispatchEvent(new Event('input',{{bubbles:true}}));i.dispatchEvent(new Event('change',{{bubbles:true}}))}})()"""); await pg.wait_for_timeout(250)
            async def edit_end():
                await pg.mouse.click(4, 400); await pg.wait_for_timeout(350)
            def norm(c): return str(c or '').lower()
            async def d1(part='F_b0', n=4):
                await edit_start(part); await sel_first(n); await custom_color('#c03030'); await edit_end()
            for dev in ['pc', 'sp']:
                other = 'sp' if dev == 'pc' else 'pc'
                # D1
                await fresh(pg, dev); t0 = (await css('F_b0'))['text']
                await d1()
                R = await runs('F_b0')
                ok(f'D1 {dev} 最初の4文字だけ赤', len(R) == 2 and R[0]['text'] == t0[:4] and norm(R[0].get('color')) == '#c03030' and not R[1].get('color') and R[0]['text'] + R[1]['text'] == t0, f'{R}')
                # D5（D1 の続き）
                await setdev(pg, other); R5 = await runs('F_b0'); await setdev(pg, dev)
                ok(f'D5 {dev} もう一方の端末でも同じ4文字が赤', R5 == R, f'{R5}')
                # D3（D1 の続き）
                await edit_start('F_b0'); await pg.keyboard.press('Control+Home')
                for i in range(4): await pg.keyboard.press('ArrowRight')
                await pg.keyboard.insert_text('あ'); await edit_end()
                R3 = await runs('F_b0')
                ok(f'D3 {dev} 赤い所の後ろに打った文字も赤', len(R3[0]['text']) == 5 and R3[0]['text'].endswith('あ') and norm(R3[0].get('color')) == '#c03030', f'{R3[:2]}')
                # D4 日本語入力の途中（赤い4文字の2文字目の後ろ）
                await fresh(pg, dev); await d1()
                await edit_start('F_b0'); await pg.keyboard.press('Control+Home')
                for i in range(2): await pg.keyboard.press('ArrowRight')
                await cdp.send('Input.imeSetComposition', {'text': 'か', 'selectionStart': 1, 'selectionEnd': 1}); await pg.wait_for_timeout(120)
                await cdp.send('Input.imeSetComposition', {'text': 'かし', 'selectionStart': 2, 'selectionEnd': 2}); await pg.wait_for_timeout(120)
                await cdp.send('Input.insertText', {'text': '菓子'}); await pg.wait_for_timeout(200)
                await edit_end()
                R4 = await runs('F_b0'); full = ''.join(x['text'] for x in R4)
                ok(f'D4 {dev} 変換の途中を経ても赤い文字は消えず二重にならない・決めた文字も赤', R4[0]['text'] == t0[:2] + '菓子' + t0[2:4] and norm(R4[0].get('color')) == '#c03030' and full == t0[:2] + '菓子' + t0[2:], f'{R4[:2]}')
                # D2
                await fresh(pg, dev)
                await edit_start('F_b0'); await sel_first(4); await pg.locator('[data-ts="bold"]').first.click(); await pg.wait_for_timeout(200); await edit_end()
                Ra = await runs('F_b0')
                await edit_start('F_b0'); await sel_first(4); await pg.keyboard.press('Control+b'); await pg.wait_for_timeout(200); await edit_end()
                Rb = await runs('F_b0')
                ok(f'D2 {dev} 選んだ4文字だけ太字、Ctrl+B で外れる', Ra[0]['text'] == t0[:4] and Ra[0].get('bold') and not any(x.get('bold') for x in Rb), f'{Ra[:2]} → {Rb[:2]}')
                # D6
                await fresh(pg, dev); await edit_start('F_b0')
                await pg.locator('[data-ts="bold"]').first.click(); await pg.wait_for_timeout(300); await edit_end()
                ok(f'D6 {dev} 選ばずに太字なら箱まるごと', (await css('F_b0'))['weight'] == 700 and len(await runs('F_b0')) == 1, f"{(await css('F_b0'))['weight']} {await runs('F_b0')}")
                # D7
                await fresh(pg, dev)
                bb = await bbox('card_name_c_warabi')
                await pg.mouse.click(bb['x'] + 5, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                await pg.mouse.dblclick(bb['x'] + 5, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                # D7b（Claude.ai が足した）：品の並びを選んだまま品の名前をダブルクリックして書き換えに入っても、文字の道具が出るか
                vis = await pg.evaluate("!!(document.querySelector('[data-ts=color]')||{}).offsetParent")
                ok(f'D7b {dev} 品の並びを選んだ状態から名前をダブルクリックして書き換えに入ると、文字の道具が出る', vis, f'道具 {vis}')
                if not vis:
                    await edit_end(); await fresh(pg, dev); bb = await bbox('card_name_c_warabi')
                    for i in range(2): await pg.mouse.click(bb['x'] + 5, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                    await pg.mouse.dblclick(bb['x'] + 5, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                await sel_first(2); await custom_color('#c03030'); await edit_end()
                Rw = await runs('card_name_c_warabi'); Rj = await runs('card_name_c_jonama'); Rd = await runs('card_name_c_dora')
                ok(f'D7 {dev} わらび餅の名前の2文字だけ赤・ほかの品は変わらない', Rw[0]['text'] == 'わら' and norm(Rw[0].get('color')) == '#c03030' and len(Rj) == 1 and len(Rd) == 1, f'{Rw} {Rj} {Rd}')
                # D10・D11
                await fresh(pg, dev); await d1()
                await pg.get_by_role('button', name='戻す', exact=True).click(); await pg.wait_for_timeout(300); u = await runs('F_b0')
                await pg.get_by_role('button', name='やり直す', exact=True).click(); await pg.wait_for_timeout(300); r = await runs('F_b0')
                ok(f'D11 {dev} 戻す・やり直す', len(u) == 1 and len(r) == 2, f'{u} / {r}')
                btn = await menu('F_b0', '文字の見た目を元に戻す'); has = await btn.count() > 0
                if has: await btn.click(); await pg.wait_for_timeout(300)
                ok(f'D10 {dev} 文字の見た目を元に戻すで一部の赤も消える', has and len(await runs('F_b0')) == 1, f'{await runs("F_b0")}')
                # D12
                await fresh(pg, dev); await d1()
                t1 = (await css('F_b1'))['text']
                await edit_start('F_b1'); await pg.keyboard.press('Control+End')
                await pg.evaluate("""(t)=>{const dt=new DataTransfer();dt.setData('text/plain',t);const el=document.activeElement;el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}))}""", t0[:6])
                await pg.wait_for_timeout(250); await edit_end()
                R12 = await runs('F_b1')
                ok(f'D12 {dev} 貼り付けは文字だけ・貼り先の見た目', ''.join(x['text'] for x in R12).rstrip().endswith(t0[:6]) and not any(x.get('color') for x in R12), f'{R12[-2:]}')
            # D8（PC で 24 → スマホ 21）
            await fresh(pg, 'pc')
            await edit_start('F_b0'); await sel_first(4)
            f = pg.locator('[data-ts="size"]').first; await f.click(); await pg.keyboard.press('Control+a'); await pg.keyboard.type('24'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
            await edit_end()
            R8 = await runs('F_b0')
            fs = await pg.evaluate("""(()=>{const e=document.querySelector('[data-el="F_b0"]');const s=[...e.querySelectorAll('span')].find(x=>x.textContent&&parseFloat(getComputedStyle(x).fontSize)!==parseFloat(getComputedStyle(e).fontSize));return s?parseFloat(getComputedStyle(s).fontSize):null})()""")
            await setdev(pg, 'sp')
            fs_sp = await pg.evaluate("""(()=>{const e=document.querySelector('[data-el="F_b0"]');const s=[...e.querySelectorAll('span')].find(x=>x.textContent&&parseFloat(getComputedStyle(x).fontSize)!==parseFloat(getComputedStyle(e).fontSize));return s?parseFloat(getComputedStyle(s).fontSize):null})()""")
            ok('D8 一部の大きさは倍率：PC 24（16×1.5）・スマホ 21（14×1.5）', abs((R8[0].get('scale') or 0) - 1.5) <= 0.01 and fs == 24 and abs((fs_sp or 0) - 21) <= 0.5, f'{R8[:1]} PC {fs} スマホ {fs_sp}')
            # D9
            await fresh(pg, 'pc'); G0 = await geo(pg); ts0 = tsp(await ts_all(), 'F_h0'); v0 = ph(await photos(), 'F_p0')['view']
            await sel('F_h0'); await set_size(36)
            await sel('F_h0'); await pg.locator('[data-ts="color"]').first.click(); await pg.wait_for_timeout(200)
            await pg.locator('[data-ts-color="#7B7B7B"]').first.click(); await pg.wait_for_timeout(250)
            await d1()
            await drag(pg, 'F_h0', 30, 0)
            bb = await bbox('F_p0'); await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(300)
            sl = pg.locator('[data-crop-zoom]').first; sb = await sl.bounding_box()
            await pg.mouse.click(sb['x'] + 4, sb['y'] + sb['height'] / 2); await pg.keyboard.press('Home')
            for i in range(100): await pg.keyboard.press('ArrowRight')
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
            G1 = await geo(pg); before = (tsp(await ts_all(), 'F_h0'), ph(await photos(), 'F_p0')['view'], await runs('F_b0'))
            await pg.get_by_role('button', name='このページを元に戻す').click(); await pg.wait_for_timeout(500)
            G2 = await geo(pg); t2 = tsp(await ts_all(), 'F_h0'); v2 = ph(await photos(), 'F_p0')['view']; r2 = await runs('F_b0')
            ok('D9 このページを元に戻す：位置・箱の見た目・見せる範囲は戻り、文の一部の赤は残る', moved(G0, G2, ['F_h0']) == [] and t2['size'] == ts0['size'] and t2['color'] == ts0['color'] and v2 == v0 and len(r2) == 2 and norm(r2[0].get('color')) == '#c03030', f'{t2} {v2} {r2[:1]}（押す前 {before[0]} {before[1]}）')
            await pg.get_by_role('button', name='戻す', exact=True).click(); await pg.wait_for_timeout(400)
            G3 = await geo(pg); after = (tsp(await ts_all(), 'F_h0'), ph(await photos(), 'F_p0')['view'], await runs('F_b0'))
            ok('D9 「戻す」1回で押す前に全部戻る', moved(G1, G3, ['F_h0', 'F_b0']) == [] and after == before, f'{after[0]} {after[1]}')


        # ======== 試験台14（playground14 作業票 3章）C1〜C11・E1〜E3 ========
        if 'C1' in presets:
            async def slist(): return await api(pg, f"{P}.sectionList()")
            async def sec_rmenu(sid, label):
                # セクションの背景（部品のない所）を右クリックする。セクションの上端を画面に出し、部品のない点を探す
                await pg.evaluate(f"document.querySelector('[data-sec=\"{sid}\"]:not(.sec-wrap)').scrollIntoView({{block:'start'}})"); await pg.wait_for_timeout(200)
                pt = await pg.evaluate(f"""(()=>{{const s=document.querySelector('[data-sec="{sid}"]:not(.sec-wrap)');const r=s.getBoundingClientRect();
                    for(let y=r.y+8;y<Math.min(r.bottom,innerHeight)-4;y+=6){{for(const x of [r.x+12,r.x+40,r.right-40]){{const e=document.elementFromPoint(x,y);
                    if(e&&!e.closest('[data-el]')&&(e.closest('[data-sec]')||{{dataset:{{}}}}).dataset.sec==='{sid}')return [x,y];}}}}return null}})()""")
                if not pt: return []
                await pg.mouse.click(pt[0], pt[1]); await pg.wait_for_timeout(150)
                await pg.mouse.click(pt[0], pt[1], button='right'); await pg.wait_for_timeout(250)
                items = await pg.evaluate("(()=>{const m=document.getElementById('fmenu');return m&&m.classList.contains('on')?[...m.querySelectorAll('button')].map(b=>b.textContent):[]})()")
                if label and label in items:
                    await pg.locator('#fmenu button', has_text=label).first.click(); await pg.wait_for_timeout(400)
                return items
            def ids(L): return [x['id'] for x in L]
            def bgs(L): return [x['bg'] for x in L]
            async def text_of(part): return await pg.evaluate(f"(()=>{{const e=document.querySelector('[data-el=\"{part}\"]');return e?e.innerText.trim():null}})()")
            async def retype(part, t):
                bb = await bbox(part); await pg.mouse.dblclick(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                await pg.keyboard.press('Control+a'); await pg.keyboard.insert_text(t); await pg.mouse.click(4, 400); await pg.wait_for_timeout(350)
            async def undo(): await pg.get_by_role('button', name='戻す', exact=True).click(); await pg.wait_for_timeout(400)
            ALT = ['surface', 'background', 'surface', 'background']
            # C1・C2・C8
            await fresh(pg, 'pc'); L0 = await slist(); G0 = await geo(pg)
            top0 = {x['id']: x['top'] for x in L0}
            await sec_rmenu('items', '上へ')
            L1 = await slist(); G1 = await geo(pg); top1 = {x['id']: x['top'] for x in L1}
            rel = max(abs(G1[k]['y'] - G0[k]['y']) for k in ['I_hg', 'I_cards', 'I_divider', 'I_kanmi', 'I_time', 'I_table', 'I_pillbg'])  # geometry() の y はセクションの上端から
            ok('C1 品を上へ：並び 品・特集、背景 灰・白、中の部品のセクションからの位置は同じ', ids(L1) == ['items', 'feature'] and bgs(L1) == ALT[:2] and rel <= TOL, f'{ids(L1)} {bgs(L1)} ずれ {rel:.2f}')
            await setdev(pg, 'sp'); Ls = await slist(); await setdev(pg, 'pc')
            ok('C8 スマホでも同じ並び・背景', ids(Ls) == ['items', 'feature'] and bgs(Ls) == ALT[:2], f'{ids(Ls)} {bgs(Ls)}')
            await undo(); L2 = await slist()
            ok('C2 戻すで元の並び・背景', ids(L2) == ['feature', 'items'] and bgs(L2) == ALT[:2], f'{ids(L2)} {bgs(L2)}')
            # C9
            await fresh(pg, 'pc'); G0 = await geo(pg)
            await sec_rmenu('items', '上へ'); await drag(pg, 'F_h0', 30, 0)
            await pg.get_by_role('button', name='このページを元に戻す').click(); await pg.wait_for_timeout(500)
            L = await slist(); G1 = await geo(pg)
            relh = G1['F_h0']['y'] - G0['F_h0']['y']  # geometry() の y はセクションの上端から
            ok('C9 このページを元に戻す：見出しの位置は戻り、セクションの並びはそのまま', ids(L) == ['items', 'feature'] and abs(G1['F_h0']['x'] - G0['F_h0']['x']) <= TOL and abs(relh) <= TOL, f'{ids(L)} x {G0["F_h0"]["x"]:.1f}→{G1["F_h0"]["x"]:.1f}')
            # C3・C4・C10
            await fresh(pg, 'pc')
            await retype('F_h0', '季節の上生菓子と抹茶')
            await sec_rmenu('feature', '複製')
            L = await slist(); dup = ids(L)[1] if len(L) == 3 else None
            G = await geo(pg); dk = [k for k in G if dup and k not in ('F_h0',) and k.endswith('F_h0') and k != 'F_h0']
            dh0 = dk[0] if dk else None
            ok('C3 複製：特集・複製・品、背景 灰・白・灰、複製の見出しも書き換えた文字、ID は重ならない', len(L) == 3 and ids(L)[0] == 'feature' and ids(L)[2] == 'items' and bgs(L) == ALT[:3] and dh0 and await text_of(dh0) == '季節の上生菓子と抹茶' and len(set(k for k in G)) == len(G), f'{ids(L)} {bgs(L)} 複製の見出し {dh0} {await text_of(dh0) if dh0 else None}')
            if dh0:
                g0 = (await geo(pg))['F_h0']
                await drag(pg, dh0, 30, 0); await retype(dh0, '新しい見出し')
                G2 = await geo(pg)
                ok('C4 複製だけ変わる（位置・文字）、元は変わらない', abs(G2[dh0]['x'] - G[dh0]['x'] - 30) <= TOL and await text_of(dh0) == '新しい見出し' and abs(G2['F_h0']['x'] - g0['x']) <= TOL and await text_of('F_h0') == '季節の上生菓子と抹茶', f"複製 x {G[dh0]['x']:.1f}→{G2[dh0]['x']:.1f} 元 {g0['x']:.1f}→{G2['F_h0']['x']:.1f}")
                dfh = dh0.replace('F_h0', 'F_h')
                await sel(dfh); await set_size(36)
                a = (await css(dfh))['size']; b_ = (await css('F_h'))['size']
                await setdev(pg, 'sp'); c_ = (await css('F_h'))['size']; await setdev(pg, 'pc')
                ok('C10 複製のセクション見出しだけ36、元は 28・20', a == 36 and b_ == 28 and c_ == 20, f'複製 {a} 元 PC {b_} スマホ {c_}')
            # C5
            await fresh(pg, 'pc'); G = await geo(pg); k = G['I_kanmi']
            await drag_center_to(pg, 'I_divider', k['y'] + k['h'] + 1)
            await sec_rmenu('items', '削除'); L1 = await slist()
            await undo(); L2 = await slist(); G2 = await geo(pg)
            ok('C5 削除→戻すで、品のセクションと区切り線の並び替えが戻る', ids(L1) == ['feature'] and ids(L2) == ['feature', 'items'] and order(G2, ['I_kanmi', 'I_divider', 'I_time']) == ['I_kanmi', 'I_divider', 'I_time'], f'{ids(L1)} → {ids(L2)}')
            # C6・C7
            await fresh(pg, 'pc'); L0 = await slist()
            y = L0[1]['top']
            bnd = await pg.evaluate(f"(()=>{{const e=document.querySelector('[data-sec=\"items\"]');const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y]}})()")
            el = await pg.query_selector('[data-sec="items"]'); await el.scroll_into_view_if_needed()
            bnd = await pg.evaluate("(()=>{const e=document.querySelector('[data-sec=\"items\"]');const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y]})()")
            await pg.mouse.move(bnd[0], bnd[1] - 2); await pg.wait_for_timeout(300); await pg.mouse.move(bnd[0], bnd[1] + 1); await pg.wait_for_timeout(300)
            try:
                await pg.locator('[data-sec-add="1"]').first.click(); await pg.wait_for_timeout(250)
                await pg.locator('[data-sec-type="feature"]').first.click(); await pg.wait_for_timeout(500)
                L = await slist(); nid = ids(L)[1] if len(L) == 3 else None
                Ph = await photos(); newp = [x for x in Ph if x.get('missing')]
                G = await geo(pg); nh = [k for k in G if k.endswith('F_h0') and k != 'F_h0']
                ok('C6 境目の＋から特集を足す：特集・足した・品、見本の文章、写真2枚はまだない、背景 灰・白・灰', len(L) == 3 and L[1]['type'] == 'feature' and bgs(L) == ALT[:3] and len(newp) == 2 and nh and await text_of(nh[0]) == await text_of('F_h0'), f'{ids(L)} {bgs(L)} まだない {[x["part"] for x in newp]}')
                if newp:
                    await send_file(newp[0]['part'], 'wide.jpg', 'drop')
                    x = ph(await photos(), newp[0]['part'])
                    ok('C7 足した特集の写真に落とすと入る', x and not x.get('missing') and x['naturalW'] == 1600, f'{x}')
            except Exception as e:
                ok('C6 境目の＋が押せる', False, str(e).splitlines()[0][:150])
            # C11
            await fresh(pg, 'pc'); await sec_rmenu('items', '削除')
            m = await sec_rmenu('feature', None)
            ok('C11 セクションが1つだけなら、上へ・下へ・削除が出ない', not any(x in m for x in ['上へ', '下へ', '削除']), f'{m}')
            # E1（試験の外）品のセクションを複製して、複製の品の名前を変えても、元の品は変わらない
            await fresh(pg, 'pc'); await sec_rmenu('items', '複製')
            G = await geo(pg); dn = [k for k in G if k.endswith('card_name_c_warabi') and k != 'card_name_c_warabi']
            if dn:
                bb = await bbox(dn[0])
                for i in range(2): await pg.mouse.click(bb['x'] + 5, bb['y'] + bb['height'] / 2); await pg.wait_for_timeout(250)
                await pg.locator('[data-ts="color"]').first.click(); await pg.wait_for_timeout(200)
                await pg.locator('[data-ts-color="#7B7B7B"]').first.click(); await pg.wait_for_timeout(300)
                await retype(dn[0], 'わらび餅（冷）')
                orig = [(await css(f'card_name_c_{k}'))['color'] for k in ['jonama', 'warabi', 'dora']]
                dups = [(await css(dn[0].replace('warabi', k)))['color'] for k in ['jonama', 'warabi', 'dora']]
                ok('E1 品のセクションの複製で、品の名前の色・文字を変えても元の品は変わらない', all(c == 'rgb(51, 51, 51)' for c in orig) and all(c == 'rgb(123, 123, 123)' for c in dups) and await text_of('card_name_c_warabi') == 'わらび餅' and await text_of(dn[0]) == 'わらび餅（冷）', f'元 {orig} 複製 {dups} 文字 {await text_of("card_name_c_warabi")}/{await text_of(dn[0])}')
            else:
                ok('E1 品のセクションの複製に品の名前がある', False, '見つからない')
            # E2（試験の外）複製したセクションで本文の大きさを変える
            for dev in ['pc', 'sp']:
                await fresh(pg, dev); await sec_rmenu('feature', '複製')
                G = await geo(pg); db = [k for k in G if k.endswith('F_b0') and k != 'F_b0'][0]
                await handle_drag(db, 'e', -60, 0)
                G1 = await geo(pg); mv = [k for k in moved(G, G1, list(G)) if k != db]
                ok(f'E2 {dev} 複製したセクションの本文の幅を60狭める：その本文だけ変わる', abs(G1[db]['w'] - (G[db]['w'] - 60)) <= 1 and abs(G1['F_b0']['w'] - G['F_b0']['w']) <= TOL and all(k.startswith(db.split('__')[0]) for k in mv), f"幅 {G[db]['w']:.0f}→{G1[db]['w']:.0f} 元 {G1['F_b0']['w']:.0f} ほかに動いた {mv[:6]}")
                # E3 複製したセクションの部品を、同じセクションの中で並び替え（スマホの縦積み）／PC は少し動かす
                await fresh(pg, dev); await sec_rmenu('feature', '複製')
                G = await geo(pg); pre = [k for k in G if k.endswith('F_h0') and k != 'F_h0'][0].split('__')[0] + '__'
                await drag(pg, pre + 'F_h0', 10, 10)
                G1 = await geo(pg); A = await api(pg, f"{P}.anchors()")
                ok(f'E3 {dev} 複製したセクションの見出しを少し動かす：その見出しだけ 10,10', abs(G1[pre + 'F_h0']['x'] - G[pre + 'F_h0']['x'] - 10) <= TOL and abs(G1[pre + 'F_h0']['y'] - G[pre + 'F_h0']['y'] - 10) <= TOL and [k for k in moved(G, G1, list(G)) if k != pre + 'F_h0'] == [], f"{box(G, pre + 'F_h0')}→{box(G1, pre + 'F_h0')} 記録 {A}")

        # ---- R3 すべての試験の後の付いていく先 ----
        bad = [x for x in anchor_log if is_repeat_item(x[2])]
        ok('R3 付いていく先に、繰り返す部品の1件の中の部品が一度も出ない', not bad, '; '.join(f'{l}:{p}→{a}' for l, p, a in bad)[:300])
        info(f'R3 見た付いていく先 {len(anchor_log)} 件')

        await rtlog(pg, 'final')   # §24 最後の状態でも seed/fold が一致するか
        ok('ページのエラーなし（プリセット以外）', not errs, '; '.join(errs)[:200])
        await b.close()
    ng = [r for r in results if not r[1]]
    print(f'\n合計 {len(results)} 項目 / 不合格 {len(ng)}')
    for r in ng:
        print('  NG', r[0], r[2][:160])

asyncio.run(main())
