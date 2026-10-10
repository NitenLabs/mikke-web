# verify_extra_catalog.py v1（試験台26・2026-10-10）
# 作業票 wa-01 layout-playground 26（品の並びを ① お店の情報とつなぐ）の §3 試験 M1〜M21。
# ほかの確認スクリプトと同じ作り（rec で OK/NG/--、合計を出す）。1本 290 秒以内。
# 使い方：python3 verify_extra_catalog.py /path/to/playground26_single.html
# 案A（既定）と案C（?list=pick）の両方で M10〜M16 を走らせる。① の下書きは __playground.shop() で読む。
import asyncio, json, sys, os, subprocess
from playwright.async_api import async_playwright

HTML = os.path.abspath(sys.argv[1])
URL = 'file://' + HTML
DBNAME = 'mikke-' + os.path.basename(HTML).replace('_single.html', '')   # 試験台の名前から DB 名を決める（playground26 → mikke-playground26）
NAME = os.path.basename(HTML).replace('_single.html', '')
ROOT = os.path.normpath(os.path.join(os.path.dirname(HTML), '..', '..', '..'))   # refs/compare/layout/.. → mikke-web
OUTDIR = os.path.join(ROOT, 'refs', 'compare', 'layout', NAME)
P = 'window.__playground'
U = 'window.__ui'
R = []
def rec(k, ok, msg=''):
    R.append((k, ok, msg))
    print(('OK ' if ok is True else ('NG ' if ok is False else '-- ')) + k + (' | ' + msg if msg else ''), flush=True)

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        async def fresh(pick=False, w=1440, h=1100):
            ctx = await br.new_context(viewport={'width': w, 'height': h}); pg = await ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg._errs = errs
            await pg.goto(URL + ('?list=pick' if pick else '')); await pg.wait_for_function(P); await pg.wait_for_timeout(500)
            await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('" + DBNAME + "');q.onsuccess=q.onerror=q.onblocked=()=>r(1)})")
            await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(700)
            return pg
        async def ev(pg, e): return await pg.evaluate(e)
        async def apply(pg, ops): await pg.evaluate(f"{P}.applyOps({json.dumps(ops, ensure_ascii=False)})"); await pg.wait_for_timeout(50)
        async def txt(pg, elid): return await pg.evaluate(f"(document.querySelector('[data-el=\"{elid}\"]')||{{}}).textContent")
        async def cardNames(pg, sec=''):
            geom = await ev(pg, f"{P}.geometry()")
            ks = [k for k in geom if k.startswith('card_name_') and (k.startswith(sec + '__card_name_') if sec else ('__' not in k))]
            return [await txt(pg, k) for k in ks]
        async def rowNames(pg, sec=''):
            geom = await ev(pg, f"{P}.geometry()")
            ks = [k for k in geom if k.startswith('row_name_') and (k.startswith(sec + '__row_name_') if sec else ('__' not in k))]
            return [await txt(pg, k) for k in ks]
        async def settle(pg): await pg.wait_for_timeout(650)   # 自動保存（500ms）の後で状態の文字を読む

        # ---------- M1：開く ----------
        pg = await fresh()
        cards = await cardNames(pg); rows = await rowNames(pg)
        cp = [await txt(pg, 'card_price_c_jonama'), await txt(pg, 'card_price_c_warabi'), await txt(pg, 'card_price_c_dora')]
        rp = [await txt(pg, 'row_price_t_warabi'), await txt(pg, 'row_price_t_matcha')]
        okC = cards == ['季節の上生菓子', 'わらび餅', 'どら焼き']
        okR = rows == ['わらび餅', '抹茶（上生菓子付き）']
        okP = cp == ['380円（税込）', '450円（税込）', '250円（税込）'] and rp == ['お茶付き 650円（税込）', '1,100円（税込）']
        d = await ev(pg, f"{P}.draft()")
        rec('M1 品の並び・表の中身（1.1の表）', okC and okR and okP, f"cards={cards} rows={rows} cardPrice={cp} rowPrice={rp}")
        rec('M1 draft に _pg が無い', '_pg' not in d, f"draft keys={list(d.keys())}")

        # ---------- M2：品の並びのわらび餅の名前を書き換える ----------
        pg = await fresh()
        await apply(pg, [{'t': 'edit', 'id': 'card_name_c_warabi', 'text': '本わらび餅'}])
        cN = await txt(pg, 'card_name_c_warabi'); rN = await txt(pg, 'row_name_t_warabi')
        shop = await ev(pg, f"{P}.shop()")
        await ev(pg, f"{P}.undo()"); await pg.wait_for_timeout(60)
        cN2 = await txt(pg, 'card_name_c_warabi'); shop2 = await ev(pg, f"{P}.shop()")
        rec('M2 名前の書き換えが ① と両方の並びに効く', cN == '本わらび餅' and rN == '本わらび餅' and shop['catalog']['items']['itm_warabi']['name'] == '本わらび餅', f"card={cN} row={rN} shop={shop['catalog']['items']['itm_warabi']['name']}")
        rec('M2 戻す1回で ① も戻る', cN2 == 'わらび餅' and shop2['catalog']['items']['itm_warabi']['name'] == 'わらび餅', f"card={cN2} shop={shop2['catalog']['items']['itm_warabi']['name']}")

        # ---------- M3：表のわらび餅の値段を 700 に ----------
        pg = await fresh()
        eff = await ev(pg, f"{P}.effPrices('row_price_t_warabi')")
        newp = json.loads(json.dumps(eff['prices'])); newp[0]['amount'] = 700
        await ev(pg, f"{P}.setPrices('row_price_t_warabi', {json.dumps(newp, ensure_ascii=False)})"); await pg.wait_for_timeout(60)
        shop = await ev(pg, f"{P}.shop()")
        pk = shop['catalog']['placements']['plc_warabi_k']['prices'][0]['amount']
        it = shop['catalog']['items']['itm_warabi']['prices'][0]['amount']
        rec('M3 値段は載せ方（甘味処）に効き、品の店頭価格は変わらない', pk == 700 and it == 450 and (await txt(pg, 'row_price_t_warabi')).find('700') >= 0 and (await txt(pg, 'card_price_c_warabi')) == '450円（税込）', f"placement={pk} item={it} tableP={await txt(pg,'row_price_t_warabi')} cardP={await txt(pg,'card_price_c_warabi')}")

        # ---------- M4：品の並びのどら焼きを「時価」に ----------
        pg = await fresh()
        await ev(pg, f"{P}.setPrices('card_price_c_dora', [{{'type':'market'}}])"); await pg.wait_for_timeout(60)
        shop = await ev(pg, f"{P}.shop()")
        rec('M4 値段を時価にする', shop['catalog']['items']['itm_dorayaki']['prices'][0]['type'] == 'market' and (await txt(pg, 'card_price_c_dora')) == '時価', f"prices={shop['catalog']['items']['itm_dorayaki']['prices']} disp={await txt(pg,'card_price_c_dora')}")

        # ---------- M5：表で行を足す（わらび餅の後ろ）→ 白玉ぜんざい 700 ----------
        pg = await fresh()
        r = await ev(pg, f"{U}.addRow('row_name_t_warabi')"); await pg.wait_for_timeout(80)
        # addRow は新しい行の名前の書き換えに入る。__ui.addRow は {itemId,partId} を返さないので shop から探す
        shop = await ev(pg, f"{P}.shop()")
        newItems = [k for k in shop['catalog']['items'] if k.startswith('itm_x')]
        ni = newItems[0] if newItems else None
        # 名前を白玉ぜんざいに、値段700に
        if ni:
            await ev(pg, f"{P}.commitEdit && {P}.commitEdit()")
            await apply(pg, (await ev(pg, f"{P}.ops()")) + [{'t': 'edit', 'id': 'row_name_t_' + ni, 'text': '白玉ぜんざい'}])
            await ev(pg, f"{P}.setPrices('row_name_t_{ni}', [{{'type':'fixed','amount':700}}])"); await pg.wait_for_timeout(60)
        shop = await ev(pg, f"{P}.shop()")
        plc = [v for v in shop['catalog']['placements'].values() if v['itemId'] == ni]
        rows = await rowNames(pg)
        okM5 = ni is not None and ni in shop['catalog']['items'] and len(plc) == 1 and plc[0]['menuId'] == 'mnu_kanmi' and plc[0]['categoryId'] == 'cat_kanmi' and '白玉ぜんざい' in rows
        rec('M5 表に新しい品と載せ方が増える（甘味処・甘味の括り）', okM5, f"newItem={ni} plc={plc} rows={rows}")

        # ---------- M6：表で抹茶を複製 ----------
        pg = await fresh()
        await ev(pg, f"{U}.fmenuFor('row_name_t_matcha')"); await ev(pg, f"{P}.duplicate()"); await pg.wait_for_timeout(80)
        shop = await ev(pg, f"{P}.shop()")
        dup = [k for k in shop['catalog']['items'] if k.startswith('itm_x')]
        rows = await rowNames(pg)
        okM6 = len(dup) == 1 and shop['catalog']['items'][dup[0]]['name'] == '抹茶（上生菓子付き）' and shop['catalog']['items'][dup[0]]['prices'][0]['amount'] == 1100 and rows.count('抹茶（上生菓子付き）') == 2
        rec('M6 抹茶を複製（名前・値段・ラベルを写す）', okM6, f"dup={dup} item={shop['catalog']['items'][dup[0]] if dup else None} rows={rows}")

        # ---------- M7：表でわらび餅を削除 ----------
        pg = await fresh()
        await ev(pg, f"{U}.fmenuFor('row_name_t_warabi')"); await ev(pg, f"{P}.deleteSelected()"); await pg.wait_for_timeout(80)
        shop = await ev(pg, f"{P}.shop()")
        toast = await ev(pg, "(document.getElementById('pgToast')||{}).textContent")
        rec('M7 載せ方だけ消え品は残る（店頭販売に載っている）', 'itm_warabi' in shop['catalog']['items'] and 'わらび餅' in (await cardNames(pg)) and 'わらび餅' not in (await rowNames(pg)), f"table={await rowNames(pg)} card={await cardNames(pg)} toast={toast}")

        # ---------- M8：表で抹茶を削除 ----------
        pg = await fresh()
        await ev(pg, f"{U}.fmenuFor('row_name_t_matcha')"); await ev(pg, f"{P}.deleteSelected()"); await pg.wait_for_timeout(80)
        shop = await ev(pg, f"{P}.shop()")
        toast = await ev(pg, "(document.getElementById('pgToast')||{}).textContent")
        rec('M8 どこにも無いので品も ① から消える', 'itm_matcha' not in shop['catalog']['items'] and '抹茶（上生菓子付き）' not in (await rowNames(pg)), f"table={await rowNames(pg)} toast={toast}")

        # ---------- M9：M5〜M8 の後に戻す ----------
        pg = await fresh()
        await ev(pg, f"{U}.fmenuFor('row_name_t_matcha')"); await ev(pg, f"{P}.deleteSelected()"); await pg.wait_for_timeout(70)
        before = await rowNames(pg)
        await ev(pg, f"{P}.undo()"); await pg.wait_for_timeout(70)
        shop = await ev(pg, f"{P}.shop()")
        rec('M9 戻す1回で ① と表が戻る', 'itm_matcha' in shop['catalog']['items'] and '抹茶（上生菓子付き）' in (await rowNames(pg)), f"delAfter={before} undoAfter={await rowNames(pg)}")

        # ---------- M10〜M16：案A・案C の両方 ----------
        for pick in (False, True):
            tag = 'C' if pick else 'A'
            # M10：品を足す… → 芦屋最中
            pg = await fresh(pick)
            await ev(pg, f"{P}.cardsAddExisting('I_cards','itm_monaka')"); await pg.wait_for_timeout(70)
            spec = await ev(pg, f"{P}.curSpec('I_cards')"); shop = await ev(pg, f"{P}.shop()"); cards = await cardNames(pg)
            if pick:
                ok = spec.get('pick') == ['itm_jonama', 'itm_warabi', 'itm_dorayaki', 'itm_monaka'] and 'lbl_recommended' not in shop['catalog']['items']['itm_monaka'].get('labels', []) and cards == ['季節の上生菓子', 'わらび餅', 'どら焼き', '芦屋最中']
            else:
                ok = spec.get('count') == 4 and 'lbl_recommended' in shop['catalog']['items']['itm_monaka'].get('labels', []) and cards == ['季節の上生菓子', 'わらび餅', '芦屋最中', 'どら焼き']
            rec(f'M10[{tag}] 品を足す…芦屋最中', ok, f"spec={spec} monakaLabels={shop['catalog']['items']['itm_monaka'].get('labels')} cards={cards}")

            # M11：新しい品を作る → 焼き菓子
            pg = await fresh(pick)
            r = await ev(pg, f"{P}.cardsAddNew('I_cards','cat_yakigashi')"); await pg.wait_for_timeout(70)
            ni = r['itemId']; shop = await ev(pg, f"{P}.shop()")
            plc = [v for v in shop['catalog']['placements'].values() if v['itemId'] == ni]
            lab = shop['catalog']['items'][ni].get('labels', [])
            cards = await cardNames(pg)
            if pick:
                ok = len(plc) == 1 and plc[0]['categoryId'] == 'cat_yakigashi' and 'lbl_recommended' not in lab and ni in [e for e in (await ev(pg, f"{P}.curSpec('I_cards')")).get('pick', [])]
            else:
                ok = len(plc) == 1 and plc[0]['categoryId'] == 'cat_yakigashi' and 'lbl_recommended' in lab
            rec(f'M11[{tag}] 新しい品を焼き菓子に作る', ok, f"item={ni} plc={plc} labels={lab} newInList={'新しい品' in cards}")

            # M12：わらび餅を複製
            pg = await fresh(pick)
            await ev(pg, f"{U}.fmenuFor('card_name_c_warabi')"); await ev(pg, f"{P}.duplicate()"); await pg.wait_for_timeout(70)
            shop = await ev(pg, f"{P}.shop()")
            dup = [k for k in shop['catalog']['items'] if k.startswith('itm_x')]
            cards = await cardNames(pg)
            ok = len(dup) == 1 and shop['catalog']['items'][dup[0]]['name'] == 'わらび餅' and cards.count('わらび餅') == 2
            rec(f'M12[{tag}] わらび餅を複製', ok, f"dup={dup} cards={cards}")

            # M13：季節の上生菓子を削除
            pg = await fresh(pick)
            await ev(pg, f"{U}.fmenuFor('card_name_c_jonama')"); await ev(pg, f"{P}.deleteSelected()"); await pg.wait_for_timeout(70)
            spec = await ev(pg, f"{P}.curSpec('I_cards')"); shop = await ev(pg, f"{P}.shop()"); cards = await cardNames(pg)
            jlab = shop['catalog']['items']['itm_jonama'].get('labels', [])
            toast = await ev(pg, "(document.getElementById('pgToast')||{}).textContent")
            if pick:
                ok = spec.get('pick') == ['itm_warabi', 'itm_dorayaki'] and 'lbl_recommended' in jlab and cards == ['わらび餅', 'どら焼き']
            else:
                ok = spec.get('count') == 2 and 'lbl_recommended' not in jlab and cards == ['わらび餅', 'どら焼き']
            rec(f'M13[{tag}] 季節の上生菓子を削除', ok, f"spec={spec} jonamaLabels={jlab} cards={cards} toast={toast}")

            # M14：M13 の後セクション複製 → 複製側でどら焼き削除
            pg = await fresh(pick)
            await ev(pg, f"{P}.sectionDuplicate('items')"); await pg.wait_for_timeout(100)
            seclist = await ev(pg, f"{P}.sectionList()")
            dupsec = next((s['id'] for s in seclist if s['id'] != 'items' and s['type'] == 'items'), None)
            await ev(pg, f"{P}.cardsDelete('{dupsec}__card_name_c_dora')"); await pg.wait_for_timeout(100)
            orig = await cardNames(pg, ''); copy = await cardNames(pg, dupsec)
            if pick:
                ok = orig == ['季節の上生菓子', 'わらび餅', 'どら焼き'] and 'どら焼き' not in copy
            else:
                ok = 'どら焼き' not in orig and 'どら焼き' not in copy
            rec(f'M14[{tag}] 複製側でどら焼き削除（A=元も変わる／C=元は変わらない）', ok, f"orig={orig} copy={copy}")

            # M15：桜餅（時期外）を選ぶ → 並びに出ない
            pg = await fresh(pick)
            before = await cardNames(pg)
            await ev(pg, f"{P}.cardsAddExisting('I_cards','itm_sakura')"); await pg.wait_for_timeout(70)
            after = await cardNames(pg)
            toast = await ev(pg, "(document.getElementById('pgToast')||{}).textContent")
            rec(f'M15[{tag}] 桜餅（時期外）は並びに出ない', '桜餅' not in after, f"before={before} after={after} toast={toast}")

            # M16：M10〜M13 の後に開き直す
            pg = await fresh(pick)
            await ev(pg, f"{P}.cardsAddExisting('I_cards','itm_monaka')"); await pg.wait_for_timeout(50)
            await ev(pg, f"{U}.fmenuFor('card_name_c_jonama')"); await ev(pg, f"{P}.deleteSelected()"); await pg.wait_for_timeout(50)
            await settle(pg)
            d1 = await ev(pg, f"{P}.draft()"); s1 = await ev(pg, f"{P}.shop()"); c1 = await cardNames(pg)
            await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(900)
            d2 = await ev(pg, f"{P}.draft()"); s2 = await ev(pg, f"{P}.shop()"); c2 = await cardNames(pg)
            ok = json.dumps(d1, sort_keys=True) == json.dumps(d2, sort_keys=True) and json.dumps(s1, sort_keys=True) == json.dumps(s2, sort_keys=True) and c1 == c2
            rec(f'M16[{tag}] 開き直して ① と並びが同じ（draft/shop も）', ok, f"cardsBefore={c1} cardsAfter={c2}")

        # ---------- M17：公開 → 名前を変える → 状態 ----------
        pg = await fresh()
        await ev(pg, f"{P}.publish()"); await settle(pg)
        st0 = (await ev(pg, f"{P}.saveState()"))['label']
        await apply(pg, [{'t': 'edit', 'id': 'row_name_t_warabi', 'text': '本わらび餅'}]); await settle(pg)
        st1 = (await ev(pg, f"{P}.saveState()"))['label']
        await apply(pg, [{'t': 'edit', 'id': 'row_name_t_warabi', 'text': 'わらび餅'}]); await settle(pg)
        st2 = (await ev(pg, f"{P}.saveState()"))['label']
        rec('M17 公開中と同じ→変更あり→元どおりで同じ（① も比べる）', st0 == '公開中と同じです' and st1 == 'まだ公開していない変更があります' and st2 == '公開中と同じです', f"publish={st0} rename={st1} revert={st2}")

        # ---------- M18：公開 → 行を足す → 公開 → 一番古い版を下書きにする ----------
        pg = await fresh()
        await ev(pg, f"{P}.publish()"); await pg.wait_for_timeout(60)
        await ev(pg, f"{U}.addRow('row_name_t_warabi')"); await pg.wait_for_timeout(80)
        shop = await ev(pg, f"{P}.shop()"); ni = next((k for k in shop['catalog']['items'] if k.startswith('itm_x')), None)
        await ev(pg, f"{P}.publish()"); await pg.wait_for_timeout(60)
        vs = await ev(pg, f"{P}.versions()"); pubs = [v for v in vs if v['kind'] == 'published']; oldest = pubs[-1]['id']
        await ev(pg, f"{P}.restoreVersion('{oldest}')"); await pg.wait_for_timeout(80)
        shop = await ev(pg, f"{P}.shop()"); gone = ni not in shop['catalog']['items']
        await ev(pg, f"{P}.undo()"); await pg.wait_for_timeout(80)
        shop = await ev(pg, f"{P}.shop()"); back = ni in shop['catalog']['items']
        rec('M18 一番古い版を下書きにすると新しい品が消え、戻す1回で戻る', gone and back, f"gone={gone} back={back}")

        # ---------- M19：お品書きを見る板 → 名前を変える → 色の帯・押すと選ぶ ----------
        pg = await fresh()
        await ev(pg, f"{U}.menuPanel()"); await pg.wait_for_timeout(50)
        await apply(pg, [{'t': 'edit', 'id': 'card_name_c_warabi', 'text': '本わらび餅'}]); await pg.wait_for_timeout(80)
        cls = await ev(pg, "(function(){for(const r of document.querySelectorAll('#menuPanel .mp-item')){if(r.textContent.indexOf('本わらび餅')>=0)return r.className;}return '';})()")
        await ev(pg, "(function(){for(const r of document.querySelectorAll('#menuPanel .mp-item')){if(r.textContent.indexOf('本わらび餅')>=0){r.click();break;}}})()"); await pg.wait_for_timeout(80)
        seld = await ev(pg, f"{P}.selected()")
        rec('M19 お品書きの板：変わった品に色の帯・押すと選ぶ', 'changed' in cls and any('warabi' in s for s in seld), f"class={cls} selected={seld}")

        # ---------- M20：M5〜M13 の後の shop() を書き出し、tools/validate.mjs で検査 ----------
        pg = await fresh()
        await ev(pg, f"{U}.addRow('row_name_t_warabi')"); await pg.wait_for_timeout(70)      # M5 相当
        await ev(pg, f"{U}.fmenuFor('row_name_t_matcha')"); await ev(pg, f"{P}.duplicate()"); await pg.wait_for_timeout(70)  # M6
        await ev(pg, f"{P}.cardsAddExisting('I_cards','itm_monaka')"); await pg.wait_for_timeout(70)  # M10
        await ev(pg, f"{P}.cardsAddNew('I_cards','cat_yakigashi')"); await pg.wait_for_timeout(70)    # M11
        await ev(pg, f"{U}.fmenuFor('card_name_c_jonama')"); await ev(pg, f"{P}.deleteSelected()"); await pg.wait_for_timeout(70)  # M13
        shop = await ev(pg, f"{P}.shop()")
        os.makedirs(OUTDIR, exist_ok=True)
        with open(os.path.join(OUTDIR, 'shop_after.json'), 'w', encoding='utf-8') as f:
            json.dump(shop, f, ensure_ascii=False, indent=2)
        # validate 用のフォルダ（shop は書き出したもの、site/theme/assets は見本から）
        vdir = os.path.join(OUTDIR, 'validate_m20'); os.makedirs(vdir, exist_ok=True)
        import shutil
        with open(os.path.join(vdir, 'shop.json'), 'w', encoding='utf-8') as f:
            json.dump(shop, f, ensure_ascii=False, indent=2)
        for fn in ('site.json', 'theme.json', 'assets.json'):
            shutil.copyfile(os.path.join(ROOT, 'samples', 'ashiyado', fn), os.path.join(vdir, fn))
        res = subprocess.run(['node', os.path.join(ROOT, 'tools', 'validate.mjs'), vdir], capture_output=True, text=True)
        errcount = res.stdout.count('[形]') + res.stdout.count('[空]')
        rec('M20 書き出した ① が tools/validate.mjs を通る（エラー0）', res.returncode == 0 and errcount == 0, f"rc={res.returncode} out={(res.stdout.strip().splitlines() or ['(ok)'])[-3:]}")

        # ---------- M21：スマホ（390）で表の長押し複製・削除、品の並びで品を足す ----------
        pg = await fresh(w=390, h=800)
        await ev(pg, f"{U}.fmenuFor('row_name_t_matcha')"); await ev(pg, f"{P}.duplicate()"); await pg.wait_for_timeout(70)
        shop = await ev(pg, f"{P}.shop()"); dup = [k for k in shop['catalog']['items'] if k.startswith('itm_x')]
        ok21a = len(dup) == 1
        await ev(pg, f"{U}.fmenuFor('row_name_t_warabi')"); await ev(pg, f"{P}.deleteSelected()"); await pg.wait_for_timeout(70)
        ok21b = 'わらび餅' not in (await rowNames(pg))
        # 品を選ぶ一覧・値段の箱が画面に収まるか
        await ev(pg, f"{U}.picker('card_name_c_warabi')"); await pg.wait_for_timeout(80)
        pw = await ev(pg, "(function(){const b=document.getElementById('pickerBox');if(!b)return null;const r=b.getBoundingClientRect();return {l:r.left,r:r.right,w:r.width};})()")
        fitPicker = pw is not None and pw['l'] >= -1 and pw['r'] <= 391
        await ev(pg, f"{U}.priceBox('card_price_c_warabi')"); await pg.wait_for_timeout(80)
        bw = await ev(pg, "(function(){const b=document.getElementById('priceBox');if(!b)return null;const r=b.getBoundingClientRect();return {l:r.left,r:r.right};})()")
        fitBox = bw is not None and bw['l'] >= -1 and bw['r'] <= 391
        rec('M21 スマホで複製・削除が PC と同じ／一覧・値段の箱が収まる', ok21a and ok21b and fitPicker and fitBox, f"dup={ok21a} del={ok21b} picker={pw} box={bw}")

        # ---------- pageerror まとめ ----------
        rec('pageerror が無い', len(pg._errs) == 0, f"errs={pg._errs[:3]}")
        await br.close()

    ok = sum(1 for _, o, _ in R if o is True); tot = sum(1 for _, o, _ in R if o is not None)
    ng = [k for k, o, _ in R if o is False]
    print(f"\n合計 {ok} / {tot}", flush=True)
    if ng: print("NG: " + json.dumps(ng, ensure_ascii=False), flush=True)

asyncio.run(main())
