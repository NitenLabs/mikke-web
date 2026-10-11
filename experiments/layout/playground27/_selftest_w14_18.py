import asyncio, sys
from playwright.async_api import async_playwright

HTML = sys.argv[1] if len(sys.argv) > 1 else "../../../refs/compare/layout/playground22_single.html"
P = "window.__playground"

async def new_ctx(browser):
    ctx = await browser.new_context(viewport={"width":1440,"height":1100})
    pg = await ctx.new_page()
    await pg.goto("file://" + HTML)
    await pg.wait_for_function("window.__playground && document.querySelector('#stage [data-el]')")
    return ctx, pg

async def body_text(pg):
    return await pg.evaluate(f"{P}.textRuns('F_b0').map(r=>r.text).join('')")

results = []
def rec(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("OK " if ok else "NG ") + name + (" | " + detail if detail else ""))

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # --- W14: history list = draft(current) + 2 published(newest current) + initial ---
        ctx, pg = await new_ctx(browser)
        await pg.evaluate(f"{P}.runPreset('W14')"); await pg.wait_for_timeout(300)
        vs = await pg.evaluate(f"{P}.versions()")
        kinds = [v["kind"] for v in vs]
        pubs = [v for v in vs if v["kind"]=="published"]
        draft = vs[0]
        ok = kinds[0]=="draft" and kinds[-1]=="initial" and len(pubs)==2 and draft.get("current") and pubs[0].get("current") and not pubs[1].get("current")
        rec("W14 履歴の並び（下書き・公開2・最初の形）", ok, str(kinds)+" draft.current="+str(draft.get('current'))+" pub.current="+str([x.get('current') for x in pubs]))
        # open panel via 履歴 button, count rows
        await pg.click("#tHistory"); await pg.wait_for_timeout(200)
        panel_on = await pg.evaluate("document.getElementById('historyPanel').classList.contains('on')")
        rows = await pg.evaluate("[...document.querySelectorAll('#historyPanel .hp-row')].map(r=>[r.dataset.hpKind, r.querySelector('.hp-main').textContent.trim()])")
        badge = await pg.evaluate("!!document.querySelector('#historyPanel .hp-badge')")
        rec("W14 板が開く・行数4・公開中バッジ", panel_on and len(rows)==4 and badge, f"panel={panel_on} rows={rows} badge={badge}")
        await ctx.close()

        # --- W15: view oldest published, drag doesn't move, device sp ---
        ctx, pg = await new_ctx(browser)
        await pg.evaluate(f"{P}.runPreset('W14')"); await pg.wait_for_timeout(200)
        await pg.click("#tHistory"); await pg.wait_for_timeout(150)
        # click the older published row (second published visually = last 公開した版 row)
        pubrows = await pg.evaluate("[...document.querySelectorAll('#historyPanel .hp-row')].filter(r=>r.dataset.hpKind==='published').map(r=>r.dataset.hpRow)")
        oldest = pubrows[-1]
        await pg.evaluate(f"[...document.querySelectorAll('#historyPanel .hp-row')].find(r=>r.dataset.hpRow==='{oldest}').click()"); await pg.wait_for_timeout(250)
        viewing = await pg.evaluate(f"{P}.viewingVersion()")
        band_on = await pg.evaluate("document.getElementById('historyBar').classList.contains('on')")
        ops_before = await pg.evaluate(f"{P}.ops().length")
        # try to drag F_p0
        n = await pg.query_selector('[data-el="F_p0"]')
        bb = await n.bounding_box()
        await pg.mouse.move(bb["x"]+bb["width"]/2, bb["y"]+bb["height"]/2); await pg.mouse.down(); await pg.mouse.move(bb["x"]+bb["width"]/2+80, bb["y"]+bb["height"]/2, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(200)
        ops_after = await pg.evaluate(f"{P}.ops().length")
        await pg.evaluate("(()=>{const b=document.querySelector('#historyBar [data-hv-dev=\"sp\"]');b&&b.click()})()"); await pg.wait_for_timeout(200)
        dev_sp = await pg.evaluate("document.querySelector('#historyBar [data-hv-dev=\"sp\"]').classList.contains('on')")
        rec("W15 見るだけ：帯・ドラッグ無効・スマホ切替", band_on and viewing==oldest and ops_before==ops_after==1 and dev_sp, f"band={band_on} viewing={viewing} ops {ops_before}->{ops_after} sp_on={dev_sp}")
        await ctx.close()

        # --- W16: restore oldest published → F_p0 +30 only, body reverted, beforeRestore +1, status ---
        ctx, pg = await new_ctx(browser)
        base = await pg.evaluate(f"{P}.geometry()['F_p0'].x")
        await pg.evaluate(f"{P}.runPreset('W16')"); await pg.wait_for_timeout(900)
        xp = await pg.evaluate(f"{P}.geometry()['F_p0'].x")
        bt = await body_text(pg)
        vs = await pg.evaluate(f"{P}.versions()")
        nbr = len([v for v in vs if v["kind"]=="beforeRestore"])
        label = await pg.evaluate(f"{P}.saveState().label")
        viewing = await pg.evaluate(f"{P}.viewingVersion()")
        ok = round(xp-base)==30 and ("毎朝炊いた" not in bt) and nbr==1 and label=="まだ公開していない変更があります" and not viewing
        rec("W16 この版を下書きに（+30・本文戻る・戻す前の下書き1・状態）", ok, f"dx={round(xp-base)} body_has_add={'毎朝炊いた' in bt} beforeRestore={nbr} label={label} viewing={viewing}")
        # W17: undo → body add returns, F_p0 +60
        await pg.evaluate(f"{P}.undo()"); await pg.wait_for_timeout(250)
        xp2 = await pg.evaluate(f"{P}.geometry()['F_p0'].x")
        bt2 = await body_text(pg)
        rec("W17 戻す＝置き換える前の下書きへ（+60・本文戻る）", round(xp2-base)==60 and ("毎朝炊いた" in bt2), f"dx={round(xp2-base)} body_has_add={'毎朝炊いた' in bt2}")
        await ctx.close()

        # --- W18: restore initial → geometry equals fresh ---
        ctx, pg = await new_ctx(browser)
        await pg.evaluate("document.fonts.ready")
        await pg.evaluate(f"{P}.runPreset('W21')"); await pg.wait_for_timeout(400)   # 新しい文脈の直後と同じ（reset のみ）
        fresh = await pg.evaluate(f"{P}.geometry()")
        await pg.evaluate(f"{P}.runPreset('W18')"); await pg.wait_for_timeout(400)
        after = await pg.evaluate(f"{P}.geometry()")
        maxd = 0.0
        for k in fresh:
            if k in after:
                for a in ("x","y","w","h"):
                    maxd = max(maxd, abs(fresh[k].get(a,0)-after[k].get(a,0)))
        opslen = await pg.evaluate(f"{P}.ops().length")
        rec("W18 最初の形を下書きに＝新規と同じ", maxd<=0.5 and opslen==0, f"maxdiff={maxd:.2f} ops={opslen}")
        await ctx.close()

        # --- UI full path: restore via band button ---
        ctx, pg = await new_ctx(browser)
        await pg.evaluate(f"{P}.runPreset('W14')"); await pg.wait_for_timeout(200)
        await pg.click("#tHistory"); await pg.wait_for_timeout(150)
        pubrows = await pg.evaluate("[...document.querySelectorAll('#historyPanel .hp-row')].filter(r=>r.dataset.hpKind==='published').map(r=>r.dataset.hpRow)")
        await pg.evaluate(f"[...document.querySelectorAll('#historyPanel .hp-row')].find(r=>r.dataset.hpRow==='{pubrows[-1]}').click()"); await pg.wait_for_timeout(200)
        toolbar_hidden = await pg.evaluate("getComputedStyle(document.getElementById('toolbar')).display=='none'")
        await pg.evaluate("document.querySelector('#historyBar [data-hv-go]').click()"); await pg.wait_for_timeout(300)
        panel_off = await pg.evaluate("!document.getElementById('historyPanel').classList.contains('on')")
        band_off = await pg.evaluate("!document.getElementById('historyBar').classList.contains('on')")
        viewing = await pg.evaluate(f"{P}.viewingVersion()")
        can_undo = await pg.evaluate(f"{P}.ops().length")
        rec("UI 板→版クリック→この版を下書きに（帯/板閉じ・編集復帰）", toolbar_hidden and panel_off and band_off and not viewing, f"tb_hidden={toolbar_hidden} panel_off={panel_off} band_off={band_off} viewing={viewing} ops={can_undo}")
        await ctx.close()

        await browser.close()
    ng = [r for r in results if not r[1]]
    print(f"\n合計 {len(results)} / 不合格 {len(ng)}")
    sys.exit(1 if ng else 0)

asyncio.run(main())
