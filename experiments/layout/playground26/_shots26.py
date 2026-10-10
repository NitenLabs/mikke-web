# 試験台26：報告用スクショ（値段の箱・品を選ぶ一覧・お品書きの板・知らせ・連動の知らせ・右クリックの箱）
# PC と スマホ（390）。出力は refs/compare/layout/playground26/shots/
import asyncio, os
from playwright.async_api import async_playwright
ROOT='/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web'
URL='file://'+ROOT+'/refs/compare/layout/playground26_single.html'
OUT=ROOT+'/refs/compare/layout/playground26/shots'; os.makedirs(OUT, exist_ok=True)
P='window.__playground'; U='window.__ui'
async def prep(ctx, pick=False):
    pg=await ctx.new_page(); await pg.goto(URL+('?list=pick' if pick else '')); await pg.wait_for_function(P); await pg.wait_for_timeout(500)
    await pg.evaluate("new Promise(r=>{const q=indexedDB.deleteDatabase('mikke-playground26');q.onsuccess=q.onerror=q.onblocked=()=>r(1)})")
    await pg.reload(); await pg.wait_for_function(P); await pg.wait_for_timeout(700); return pg
async def shot(pg, name): await pg.screenshot(path=OUT+'/'+name)
async def main():
    async with async_playwright() as p:
        br=await p.chromium.launch()
        for dev,w,h in (('pc',1440,1000),('sp',390,800)):
            ctx=await br.new_context(viewport={'width':w,'height':h})
            # 値段の箱（品の並びは下の方なので中央に寄せてから開く）
            pg=await prep(ctx); await pg.evaluate("document.querySelector('[data-el=\"card_price_c_warabi\"]').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200); await pg.evaluate(f"{U}.priceBox('card_price_c_warabi')"); await pg.wait_for_timeout(300); await shot(pg,f'price_box_{dev}.png'); await pg.close()
            # 品を選ぶ一覧
            pg=await prep(ctx); await pg.evaluate("document.querySelector('[data-el=\"card_name_c_warabi\"]').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200); await pg.evaluate(f"{U}.picker('card_name_c_warabi')"); await pg.wait_for_timeout(300); await shot(pg,f'item_picker_{dev}.png'); await pg.close()
            # お品書きの板（わらび餅を変えて色の帯・新しい品も見せる）
            pg=await prep(ctx); await pg.evaluate(f"{P}.applyOps([{{'t':'edit','id':'card_name_c_warabi','text':'本わらび餅'}}])"); await pg.wait_for_timeout(100); await pg.evaluate(f"{U}.addRow('row_name_t_matcha')"); await pg.wait_for_timeout(100); await pg.evaluate(f"{U}.menuPanel()"); await pg.wait_for_timeout(300); await shot(pg,f'menu_panel_{dev}.png'); await pg.close()
            # 知らせ（トースト）＝削除の知らせ
            pg=await prep(ctx); await pg.evaluate(f"{U}.fmenuFor('row_name_t_warabi')"); await pg.evaluate(f"{P}.deleteSelected()"); await pg.wait_for_timeout(300); await shot(pg,f'toast_{dev}.png'); await pg.close()
            # 連動の知らせ＋右クリックの箱（品の並び）
            pg=await prep(ctx); await pg.evaluate("document.querySelector('[data-el=\"card_name_c_warabi\"]').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200); await pg.evaluate(f"{U}.fmenuFor('card_name_c_warabi')"); await pg.wait_for_timeout(300); await shot(pg,f'fmenu_card_{dev}.png'); await pg.close()
            await ctx.close()
        await br.close()
    print('shots written to', OUT)
asyncio.run(main())
