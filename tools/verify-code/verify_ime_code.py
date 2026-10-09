#!/usr/bin/env python3
"""
A. Chrome の変換の信号（CDP）で、記録 8.3 を確かめるだけのスクリプト（作業票 wa-01 日本語入力の確認・3章）。
試験台22 のコードは変えない。合否は決めない。数字・文字・画面の写しをそのまま出す。

使い方:
  python3 verify_ime_code.py <playground22_single.html の絶対パス> [--headed] [--out <dir>]

変換中は Input.imeSetComposition（text/selectionStart/selectionEnd）、決めるときは Input.insertText。
keyboard.type やスクリプトでの文字の書き換えには置き換えない。各信号の後に 100ms 待って値を取る。
"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright

args = sys.argv[1:]
HEADED = "--headed" in args
OUT = "../../refs/compare/layout/ime_check"
if "--out" in args:
    OUT = args[args.index("--out") + 1]
paths = [a for a in args if not a.startswith("--") and a != OUT]
HTML = paths[0] if paths else "../../refs/compare/layout/playground22_single.html"
HTML = os.path.abspath(HTML)
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)
MODE = "headed" if HEADED else "headless"
P = "window.__playground"

# ページに仕込む：composition/input イベントと pageerror を記録。部品の実測を取る snap。
INJECT = r"""
window.__imelog = [];
for (const t of ['compositionstart','compositionupdate','compositionend','input']) {
  document.addEventListener(t, (e) => {
    window.__imelog.push({ type: t, isComposing: !!e.isComposing, data: (e.data===undefined?null:e.data), t: Math.round(performance.now()) });
  }, true);
}
window.__snap = function(part){
  const el = document.querySelector('[data-el="'+part+'"]');
  if(!el) return { error: 'no el '+part };
  const host = el.closest('.host') || el.closest('[id^="host_"]') || document.body;
  const parts = {};
  host.querySelectorAll('[data-el]').forEach(n=>{ const r=n.getBoundingClientRect(); parts[n.getAttribute('data-el')]={x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)}; });
  const hr = host.getBoundingClientRect();
  return { host: host.id, parts, sectionH:+hr.height.toFixed(2), pageH: document.documentElement.scrollHeight, text: el.textContent };
};
"""

out = {"mode": MODE, "html": HTML, "tests": {}, "pageerror": []}

async def snap(pg, part):
    return await pg.evaluate(f"window.__snap({json.dumps(part)})")

def moved(base, cur, thr=0.5):
    """base/cur = snap(). どの部品が どの軸で 何px 動いたか。"""
    res = []
    for k, v in cur.get("parts", {}).items():
        b = base.get("parts", {}).get(k)
        if not b:
            continue
        for ax in ("x", "y", "w", "h"):
            d = round(v[ax] - b[ax], 2)
            if abs(d) > thr:
                res.append({"part": k, "axis": ax, "delta": d})
    sh = round(cur.get("sectionH", 0) - base.get("sectionH", 0), 2)
    ph = cur.get("pageH", 0) - base.get("pageH", 0)
    return {"parts": res, "sectionH_delta": sh, "pageH_delta": ph}

async def fresh(pg, dev="pc"):
    await pg.evaluate(f"{P}.reset()")
    await pg.evaluate(f"{P}.setDevice('{dev}')")
    await pg.wait_for_timeout(200)

async def edit_start(pg, part):
    el = await pg.query_selector(f'[data-el="{part}"]')
    await el.scroll_into_view_if_needed()
    bb = await el.bounding_box()
    if part.startswith("card_") or part.startswith("row_"):
        # 繰り返す部品（品・表の行）：まず1クリックで選び、ダブルクリックで書き換えへ（verify_playground の D7 と同じ入り方）
        await pg.mouse.click(bb["x"] + 5, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(250)
        await pg.mouse.dblclick(bb["x"] + 5, bb["y"] + bb["height"] / 2); await pg.wait_for_timeout(250)
    else:
        await pg.mouse.dblclick(bb["x"] + bb["width"] / 2, bb["y"] + 8); await pg.wait_for_timeout(250)

async def caret_at(pg, n):
    """文の途中（先頭から n 文字目の後ろ）にカーソルを置く。"""
    await pg.keyboard.press("Control+Home"); await pg.wait_for_timeout(60)
    for _ in range(n):
        await pg.keyboard.press("ArrowRight")
    await pg.wait_for_timeout(80)

async def runs_text(pg, part):
    return await pg.evaluate(f"{P}.textRuns('{part}').map(r=>r.text).join('')")

async def ops_len(pg):
    return await pg.evaluate(f"{P}.ops().length")

async def clear_log(pg):
    await pg.evaluate("window.__imelog = []")

async def get_log(pg):
    return await pg.evaluate("window.__imelog")

# ---------- 試験 ----------
async def I1_like(pg, cdp, part, label, caret=6, enter=None, dev="pc"):
    """I1/I5/I6：途中にカーソル、変換中を か→かし→かしを の3段階、菓子を で決める。"""
    await fresh(pg, dev)
    await (enter or edit_start)(pg, part)
    editing_id = await pg.evaluate(f"{P}.editingId()")
    await caret_at(pg, caret)
    await clear_log(pg)
    base = await snap(pg, part)
    stages = []
    for comp in ["か", "かし", "かしを"]:
        await cdp.send("Input.imeSetComposition", {"text": comp, "selectionStart": len(comp), "selectionEnd": len(comp)})
        await pg.wait_for_timeout(100)
        s = await snap(pg, part)
        stages.append({"stage": "comp:" + comp, "text": s["text"], "editH": s["parts"].get(part, {}).get("h"), "moved": moved(base, s), "ops": await ops_len(pg)})
    # 決める
    await cdp.send("Input.insertText", {"text": "菓子を"})
    await pg.wait_for_timeout(100)
    commit = await snap(pg, part)
    stages.append({"stage": "commit", "text": commit["text"], "editH": commit["parts"].get(part, {}).get("h"), "moved": moved(base, commit), "ops": await ops_len(pg)})
    await pg.wait_for_timeout(500)
    after = await snap(pg, part)
    stages.append({"stage": "commit+500ms", "text": after["text"], "editH": after["parts"].get(part, {}).get("h"), "moved": moved(base, after), "ops": await ops_len(pg)})
    model = await runs_text(pg, part)
    return {"part": part, "editing_id": editing_id, "baseline_text": base["text"], "stages": stages, "model_text_after": model, "events": await get_log(pg)}

async def I2(pg, cdp, dev="pc", enter=None):
    """変換中を少しずつ伸ばし、1行増える長さ（約40字）まで。各段で下の部品が動いたか。"""
    await fresh(pg, dev)
    part = "F_b0"
    await (enter or edit_start)(pg, part)
    await caret_at(pg, 6)
    await clear_log(pg)
    base = await snap(pg, part)
    seq = ["あ"*5, "あ"*10, "あ"*20, "あ"*30, "あ"*40]
    stages = []
    for comp in seq:
        await cdp.send("Input.imeSetComposition", {"text": comp, "selectionStart": len(comp), "selectionEnd": len(comp)})
        await pg.wait_for_timeout(100)
        s = await snap(pg, part)
        stages.append({"stage": f"comp:{len(comp)}字", "editH": s["parts"].get(part, {}).get("h"), "sectionH": s["sectionH"], "pageH": s["pageH"], "moved": moved(base, s)})
    await cdp.send("Input.insertText", {"text": "菓"*40})
    await pg.wait_for_timeout(150)
    commit = await snap(pg, part)
    stages.append({"stage": "commit", "editH": commit["parts"].get(part, {}).get("h"), "sectionH": commit["sectionH"], "pageH": commit["pageH"], "moved": moved(base, commit)})
    return {"dev": dev, "baseline": {"editH": base["parts"].get(part, {}).get("h"), "sectionH": base["sectionH"], "pageH": base["pageH"]}, "stages": stages, "events": await get_log(pg)}

async def I3(pg, cdp):
    """変換中に Esc。続けて別の変換を決める。"""
    await fresh(pg)
    part = "F_b0"
    await edit_start(pg, part)
    await caret_at(pg, 6)
    await clear_log(pg)
    base = await snap(pg, part)
    await cdp.send("Input.imeSetComposition", {"text": "かし", "selectionStart": 2, "selectionEnd": 2})
    await pg.wait_for_timeout(100)
    during = await snap(pg, part)
    await pg.keyboard.press("Escape")
    await pg.wait_for_timeout(150)
    after_esc = await snap(pg, part)
    editing_after_esc = await pg.evaluate(f"{P}.editingId()")
    # 続けて別の変換を決める
    ev_mid = await get_log(pg)
    await cdp.send("Input.imeSetComposition", {"text": "はる", "selectionStart": 2, "selectionEnd": 2})
    await pg.wait_for_timeout(100)
    await cdp.send("Input.insertText", {"text": "春"})
    await pg.wait_for_timeout(150)
    after2 = await snap(pg, part)
    return {"baseline_text": base["text"], "during_text": during["text"], "after_esc_text": after_esc["text"],
            "after_esc_moved": moved(base, after_esc), "editing_after_esc": editing_after_esc,
            "after_second_commit_text": after2["text"], "model_text": await runs_text(pg, part), "events": await get_log(pg)}

async def I4(pg, cdp):
    """変換して決める×5（毎回ちがう言葉）。その後 Cmd+Z を6回。1回ごとの本文。変換途中の文字が出る回があるか。"""
    await fresh(pg)
    part = "F_b0"
    words = [("はる", "春"), ("なつ", "夏"), ("あき", "秋"), ("ふゆ", "冬"), ("そら", "空")]
    await edit_start(pg, part)
    await caret_at(pg, 6)
    for reading, kanji in words:
        await cdp.send("Input.imeSetComposition", {"text": reading, "selectionStart": len(reading), "selectionEnd": len(reading)})
        await pg.wait_for_timeout(100)
        await cdp.send("Input.insertText", {"text": kanji})
        await pg.wait_for_timeout(120)
    # 編集を終える（取り込みの確定）
    await pg.mouse.click(4, 400); await pg.wait_for_timeout(300)
    after_commits = await runs_text(pg, part)
    undo_steps = []
    for i in range(6):
        await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(200)
        undo_steps.append({"undo": i + 1, "text": await runs_text(pg, part)})
    readings = [r for r, _ in words]
    intermediate_seen = [u for u in undo_steps if any(rd in u["text"] for rd in readings)]
    return {"after_5_commits_text": after_commits, "undo_steps": undo_steps,
            "readings": readings, "intermediate_reading_in_undo": intermediate_seen}

async def I7(pg, cdp):
    """変換中のまま自動保存（§15）を待つ。変換中に保存されたか・下書きの本文に変換前の文字が入るか。"""
    await fresh(pg)
    part = "F_b0"
    await edit_start(pg, part)
    await caret_at(pg, 6)
    before = await pg.evaluate(f"{P}.saveState()")
    await cdp.send("Input.imeSetComposition", {"text": "かしを", "selectionStart": 3, "selectionEnd": 3})
    await pg.wait_for_timeout(100)
    dom_text = (await snap(pg, part))["text"]
    model_during = await runs_text(pg, part)
    # 自動保存の debounce（500ms）を十分に越えて待つ
    await pg.wait_for_timeout(1500)
    during_save = await pg.evaluate(f"{P}.saveState()")
    model_during2 = await runs_text(pg, part)
    ops_during = await ops_len(pg)
    # そのあと決める
    await cdp.send("Input.insertText", {"text": "菓子を"})
    await pg.wait_for_timeout(700)
    after_save = await pg.evaluate(f"{P}.saveState()")
    model_after = await runs_text(pg, part)
    return {"save_before": before, "dom_text_during": dom_text, "model_text_during": model_during,
            "save_during(after_1.5s)": during_save, "model_text_during_after_wait": model_during2, "ops_during": ops_during,
            "save_after_commit": after_save, "model_text_after_commit": model_after}

async def run(pg, cdp):
    out["tests"]["I1"] = await I1_like(pg, cdp, "F_b0", "I1 特集の本文")
    await pg.screenshot(path=os.path.join(OUT, f"I1_{MODE}.png"))
    out["tests"]["I2"] = await I2(pg, cdp, "pc")
    await pg.screenshot(path=os.path.join(OUT, f"I2_{MODE}.png"))
    out["tests"]["I3"] = await I3(pg, cdp)
    out["tests"]["I4"] = await I4(pg, cdp)
    out["tests"]["I5"] = await I1_like(pg, cdp, "card_name_c_jonama", "I5 品の名前", caret=1)
    out["tests"]["I6"] = await I1_like(pg, cdp, "row_name_t_warabi", "I6 表の行の文字", caret=1)
    out["tests"]["I7"] = await I7(pg, cdp)

async def run_phone(browser):
    ctx = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, has_touch=True, is_mobile=True)
    pg = await ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.add_init_script(INJECT)
    await pg.goto("file://" + HTML)
    await pg.wait_for_function("window.__playground && document.querySelector('#stage [data-el]')")
    im = await pg.evaluate(f"{P}.inputMode()")
    cdp = await ctx.new_cdp_session(pg)
    # §0 指の操作は CDP Input.dispatchTouchEvent。書き換えに入るのはダブルタップ（間 120ms）。座標は visualViewport.offset で補正。
    async def T(kind, pts):
        o = await pg.evaluate("[visualViewport.offsetLeft,visualViewport.offsetTop]")
        await cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x - o[0], "y": y - o[1], "id": i} for (i, x, y) in pts]})
    async def phone_enter(pg_, part):
        await pg_.evaluate(f"document.querySelector('[data-el=\"{part}\"]').scrollIntoView({{block:'center'}})"); await pg_.wait_for_timeout(300)
        r = await pg_.evaluate(f"(()=>{{const e=document.querySelector('[data-el=\"{part}\"]');const b=e.getBoundingClientRect();return {{cx:b.x+b.width/2,cy:b.y+b.height/2}}}})()")
        cx, cy = r["cx"], r["cy"]   # ダブルタップは中央・verify_touch と同じ間合い（50/60/50/350ms）
        await T("touchStart", [(0, cx, cy)]); await pg_.wait_for_timeout(50); await T("touchEnd", []); await pg_.wait_for_timeout(60)
        await T("touchStart", [(0, cx, cy)]); await pg_.wait_for_timeout(50); await T("touchEnd", []); await pg_.wait_for_timeout(350)
    res = {"inputMode": im}
    if im == "phone":
        res["I1"] = await I1_like(pg, cdp, "F_b0", "I8/I1 スマホ", enter=phone_enter, dev="sp")
        await pg.screenshot(path=os.path.join(OUT, f"I8_I1_{MODE}.png"))
        res["I2"] = await I2(pg, cdp, "sp", enter=phone_enter)
        await pg.screenshot(path=os.path.join(OUT, f"I8_I2_{MODE}.png"))
    res["pageerror"] = errs
    await ctx.close()
    return res

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not HEADED)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 1100})
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: out["pageerror"].append(str(e)))
        await pg.add_init_script(INJECT)
        await pg.goto("file://" + HTML)
        await pg.wait_for_function("window.__playground && document.querySelector('#stage [data-el]')")
        cdp = await ctx.new_cdp_session(pg)
        await run(pg, cdp)
        await ctx.close()
        # I8：スマホでの編集（390×844・hasTouch）で I1・I2
        out["tests"]["I8"] = await run_phone(browser)
        await browser.close()

    raw = os.path.join(OUT, f"raw_{MODE}.json")
    with open(raw, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # 読みやすい要約を標準出力へ
    print(f"==== IME code-check ({MODE}) ====  html={HTML}")
    print(f"raw: {raw}")
    print(f"pageerror(PC): {out['pageerror']}")
    def ev_order(evs): return " ".join(f"{e['type']}{'(ic)' if e['isComposing'] else ''}" for e in evs)
    for tid in ["I1", "I5", "I6"]:
        t = out["tests"][tid]
        print(f"\n[{tid}] part={t['part']} editing_id={t.get('editing_id')}  baseline='{t['baseline_text']}'")
        for s in t["stages"]:
            print(f"   {s['stage']:14} text='{s['text']}' editH={s.get('editH')}  moved_parts={s['moved']['parts']}  secΔ={s['moved']['sectionH_delta']} pageΔ={s['moved']['pageH_delta']}  ops={s['ops']}")
        print(f"   model_after='{t['model_text_after']}'")
        print(f"   events: {ev_order(t['events'])}")
    t = out["tests"]["I2"]
    print(f"\n[I2] baseline editH={t['baseline']['editH']} sectionH={t['baseline']['sectionH']} pageH={t['baseline']['pageH']}")
    for s in t["stages"]:
        print(f"   {s['stage']:10} editH={s['editH']} sectionH={s['sectionH']} pageH={s['pageH']} moved={s['moved']['parts']} secΔ={s['moved']['sectionH_delta']} pageΔ={s['moved']['pageH_delta']}")
    print(f"   events: {ev_order(t['events'])}")
    t = out["tests"]["I3"]
    print(f"\n[I3] baseline='{t['baseline_text']}' during='{t['during_text']}' afterEsc='{t['after_esc_text']}' editingAfterEsc={t['editing_after_esc']} afterSecondCommit='{t['after_second_commit_text']}' model='{t['model_text']}'")
    print(f"   afterEsc moved={t['after_esc_moved']['parts']}  events: {ev_order(t['events'])}")
    t = out["tests"]["I4"]
    print(f"\n[I4] after5commits='{t['after_5_commits_text']}' readings={t['readings']}")
    for u in t["undo_steps"]:
        print(f"   undo{u['undo']}: '{u['text']}'")
    print(f"   intermediate_reading_in_undo: {len(t['intermediate_reading_in_undo'])} 件 {t['intermediate_reading_in_undo']}")
    t = out["tests"]["I7"]
    print(f"\n[I7] save_before={t['save_before']}")
    print(f"   dom_during='{t['dom_text_during']}' model_during='{t['model_text_during']}'")
    print(f"   save_during(1.5s)={t['save_during(after_1.5s)']} ops_during={t['ops_during']} model_during2='{t['model_text_during_after_wait']}'")
    print(f"   save_after_commit={t['save_after_commit']} model_after='{t['model_text_after_commit']}'")
    t = out["tests"]["I8"]
    print(f"\n[I8] inputMode={t['inputMode']} pageerror={t.get('pageerror')}")
    if t.get("inputMode") == "phone":
        for sub in ["I1", "I2"]:
            if sub in t:
                print(f"   [I8/{sub}] keys={list(t[sub].keys())}")
                if sub == "I1":
                    for s in t[sub]["stages"]:
                        print(f"      {s['stage']:14} text='{s['text']}' moved={s['moved']['parts']} secΔ={s['moved']['sectionH_delta']}")
                    print(f"      events: {ev_order(t[sub]['events'])}")
                else:
                    for s in t[sub]["stages"]:
                        print(f"      {s['stage']:10} editH={s['editH']} sectionH={s['sectionH']} moved={s['moved']['parts']}")

asyncio.run(main())
