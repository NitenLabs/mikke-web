#!/usr/bin/env python3
"""
B. Mac の本物の日本語入力を動かす試験（作業票 wa-01 日本語入力の確認・4章）。
試験台22 のコードは変えない。合否は決めない。数字・文字・画面の写しをそのまま出す。

安全の決まり（ユーザー指示 2026-10-09）:
  - 始める前に、呼び手（人）が「Mac に触らない」状態になっていること。開始は人の合図のあと。
  - キーを送る前に毎回、最前面のアプリが試験の Chrome か確かめる。違えばキーを送らずに止めて報告。
  - 終わったら（途中で止まった場合も含め）入力ソースを元に戻す。

使い方:
  python3 verify_ime_mac.py <playground22_single.html の絶対パス> [--out <dir>]
"""
import asyncio, sys, os, json, subprocess, time
from playwright.async_api import async_playwright

args = sys.argv[1:]
OUT = "../../refs/compare/layout/ime_check"
if "--out" in args:
    OUT = args[args.index("--out") + 1]
paths = [a for a in args if not a.startswith("--") and a != OUT]
HTML = os.path.abspath(paths[0]) if paths else os.path.abspath("../../refs/compare/layout/playground22_single.html")
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)
P = "window.__playground"

INJECT = r"""
window.__imelog = [];
for (const t of ['compositionstart','compositionupdate','compositionend','input']) {
  document.addEventListener(t, (e) => { window.__imelog.push({type:t, isComposing:!!e.isComposing, data:(e.data===undefined?null:e.data), t:Math.round(performance.now())}); }, true);
}
window.__snap = function(part){
  const el = document.querySelector('[data-el="'+part+'"]'); if(!el) return {error:'no el'};
  const host = el.closest('.host') || document.body; const parts = {};
  host.querySelectorAll('[data-el]').forEach(n=>{const r=n.getBoundingClientRect();parts[n.getAttribute('data-el')]={x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)};});
  const hr = host.getBoundingClientRect();
  return {parts, sectionH:+hr.height.toFixed(2), pageH:document.documentElement.scrollHeight, text:el.textContent};
};
"""

def osa(script):
    return subprocess.run(["osascript", "-e", script], capture_output=True, text=True)

def frontmost_name():
    return osa('tell application "System Events" to name of first application process whose frontmost is true').stdout.strip()

def selected_source():
    return subprocess.run(["defaults", "read", "com.apple.HIToolbox", "AppleSelectedInputSources"], capture_output=True, text=True).stdout.strip()

def is_japanese(src):
    return "Japanese" in src or "Kotoeri" in src or "Hiragana" in src

def key_ctrl_space():
    osa('tell application "System Events" to key code 49 using control down')  # Ctrl+Space（入力ソース切替）

def keystroke(ch):
    # 1文字をそのまま送る（ローマ字の英字・スペース・リターンは key code で）
    if ch == " ":
        osa('tell application "System Events" to key code 49')  # Space
    elif ch == "\r":
        osa('tell application "System Events" to key code 36')  # Return
    elif ch == "\x1b":
        osa('tell application "System Events" to key code 53')  # Escape
    else:
        osa(f'tell application "System Events" to keystroke "{ch}"')

out = {"html": HTML, "aborted": None, "steps": {}, "input_source_before": None, "input_source_restored": None, "frontmost_expected": None}
log = []

async def main():
    src0 = selected_source()
    out["input_source_before"] = src0[:80]
    switched = False
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 1100})
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: log.append("pageerror:" + str(e)))
        await pg.add_init_script(INJECT)
        await pg.goto("file://" + HTML)
        await pg.wait_for_function("window.__playground && document.querySelector('#stage [data-el]')")

        # 本文を書き換えの状態に（ダブルクリック）
        bb = await (await pg.query_selector('[data-el="F_b0"]')).bounding_box()
        await pg.mouse.dblclick(bb["x"] + bb["width"] / 2, bb["y"] + 8); await pg.wait_for_timeout(300)
        await pg.bring_to_front(); time.sleep(0.8)

        EXPECT = frontmost_name()
        out["frontmost_expected"] = EXPECT
        if not ("Chrom" in EXPECT or "Google Chrome" in EXPECT):
            out["aborted"] = f"最前面が試験の Chrome でない（{EXPECT}）。キーを送らずに中止。"
            await browser.close(); return finish(src0, switched)

        def require_front(where):
            fm = frontmost_name()
            if fm != EXPECT:
                out["aborted"] = f"[{where}] 最前面が {fm}（想定 {EXPECT}）に変わった。キーを送らず中止。"
                return False
            return True

        async def snap(): return await pg.evaluate('window.__snap("F_b0")')
        async def poll(n=6, gap=50):
            vals = []
            for _ in range(n):
                vals.append(await snap()); await pg.wait_for_timeout(gap)
            return vals

        # 入力ソースを日本語に（Ctrl+Space を最大4回、変わるまで）
        if not require_front("switch-ime"): await browser.close(); return finish(src0, switched)
        for _ in range(4):
            if is_japanese(selected_source()): break
            key_ctrl_space(); switched = True; time.sleep(0.6)
        out["input_source_after_switch"] = selected_source()[:80]
        await pg.screenshot(path=os.path.join(OUT, "B_after_switch.png"))

        # --- I1: kashiwo → Space → Return ---
        base = await snap()
        if not require_front("I1"): await browser.close(); return finish(src0, switched)
        for ch in "kashiwo":
            if not require_front("I1:" + ch): await browser.close(); return finish(src0, switched)
            keystroke(ch); time.sleep(0.15)
        mid = await snap()
        await pg.screenshot(path=os.path.join(OUT, "B_I1_composing.png"))
        if not require_front("I1:space"): await browser.close(); return finish(src0, switched)
        keystroke(" "); time.sleep(0.3)
        conv = await snap()
        await pg.screenshot(path=os.path.join(OUT, "B_I1_candidates.png"))
        if not require_front("I1:return"): await browser.close(); return finish(src0, switched)
        keystroke("\r"); time.sleep(0.3)
        committed = await snap()
        out["steps"]["I1"] = {"base_text": base["text"], "composing_text": mid["text"], "converted_text": conv["text"],
                               "committed_text": committed["text"], "sectionH": [base["sectionH"], mid["sectionH"], committed["sectionH"]],
                               "pageH": [base["pageH"], mid["pageH"], committed["pageH"]],
                               "model_after": await pg.evaluate(f"{P}.textRuns('F_b0').map(r=>r.text).join('')"),
                               "events": await pg.evaluate("window.__imelog")}

        def moved(a, b, thr=0.5):
            r = []
            for k, v in b.get("parts", {}).items():
                bb0 = a.get("parts", {}).get(k)
                if not bb0: continue
                for ax in ("x", "y", "w", "h"):
                    d = round(v[ax] - bb0[ax], 2)
                    if abs(d) > thr: r.append({"part": k, "axis": ax, "delta": d})
            return {"parts": r, "secΔ": round(b["sectionH"] - a["sectionH"], 2), "pageΔ": b["pageH"] - a["pageH"]}

        async def reenter():
            await pg.evaluate("window.__imelog=[]")
            bb2 = await (await pg.query_selector('[data-el="F_b0"]')).bounding_box()
            await pg.mouse.dblclick(bb2["x"] + bb2["width"] / 2, bb2["y"] + 8); await pg.wait_for_timeout(300)
            await pg.bring_to_front(); time.sleep(0.4)

        # --- I2: 長いローマ字を打って1行以上にしてから決める。各段の部品の動き ---
        await reenter()
        if not require_front("I2"): await browser.close(); return finish(src0, switched)
        b2 = await snap(); stages2 = []
        romaji2 = "harunoumiwahinemosunotarinotarikana"  # 長めのローマ字（変換前のかな）
        acc = ""
        for i, ch in enumerate(romaji2):
            if not require_front("I2:" + ch): await browser.close(); return finish(src0, switched)
            keystroke(ch); time.sleep(0.12); acc += ch
            if i in (9, 19, len(romaji2) - 1):
                s = await snap(); stages2.append({"after_chars": i + 1, "editH": s["parts"].get("F_b0", {}).get("h"), "moved": moved(b2, s)})
        await pg.screenshot(path=os.path.join(OUT, "B_I2_composing.png"))
        if not require_front("I2:space"): await browser.close(); return finish(src0, switched)
        keystroke(" "); time.sleep(0.3)
        if not require_front("I2:return"): await browser.close(); return finish(src0, switched)
        keystroke("\r"); time.sleep(0.3)
        c2 = await snap()
        out["steps"]["I2"] = {"base": {"editH": b2["parts"].get("F_b0", {}).get("h"), "sectionH": b2["sectionH"], "pageH": b2["pageH"]},
                               "stages": stages2, "committed": {"editH": c2["parts"].get("F_b0", {}).get("h"), "moved_vs_base": moved(b2, c2)},
                               "events": await pg.evaluate("window.__imelog")}
        await pg.mouse.click(4, 400); await pg.wait_for_timeout(300)

        # --- I3: 変換中に Esc、続けて別の変換を決める ---
        await reenter()
        if not require_front("I3"): await browser.close(); return finish(src0, switched)
        b3 = await snap()
        for ch in "kashi":
            if not require_front("I3:" + ch): await browser.close(); return finish(src0, switched)
            keystroke(ch); time.sleep(0.13)
        dur3 = await snap()
        if not require_front("I3:space"): await browser.close(); return finish(src0, switched)
        keystroke(" "); time.sleep(0.3)  # 変換中（候補）
        if not require_front("I3:esc"): await browser.close(); return finish(src0, switched)
        keystroke("\x1b"); time.sleep(0.3)  # Esc
        esc3 = await snap(); editing_after = await pg.evaluate(f"{P}.editingId()")
        # 続けて別の変換
        for ch in "haru":
            if not require_front("I3b:" + ch): await browser.close(); return finish(src0, switched)
            keystroke(ch); time.sleep(0.13)
        if not require_front("I3b:space"): await browser.close(); return finish(src0, switched)
        keystroke(" "); time.sleep(0.25); keystroke("\r"); time.sleep(0.3)
        after3 = await snap()
        out["steps"]["I3"] = {"base": b3["text"], "during": dur3["text"], "after_esc": esc3["text"],
                               "editing_after_esc": editing_after, "after_second": after3["text"],
                               "moved_after_esc": moved(b3, esc3), "events": await pg.evaluate("window.__imelog")}
        await pg.mouse.click(4, 400); await pg.wait_for_timeout(300)

        # --- I4（前半）：変換して決める×5、その後 Cmd+Z ×6 ---
        await reenter()
        words4 = ["haru", "natu", "aki", "huyu", "sora"]
        for w in words4:
            for ch in w:
                if not require_front("I4:" + ch): await browser.close(); return finish(src0, switched)
                keystroke(ch); time.sleep(0.12)
            if not require_front("I4:space"): await browser.close(); return finish(src0, switched)
            keystroke(" "); time.sleep(0.25); keystroke("\r"); time.sleep(0.25)
        await pg.mouse.click(4, 400); await pg.wait_for_timeout(300)
        after5 = await pg.evaluate(f"{P}.textRuns('F_b0').map(r=>r.text).join('')")
        undo4 = []
        for i in range(6):
            await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(200)
            undo4.append(await pg.evaluate(f"{P}.textRuns('F_b0').map(r=>r.text).join('')"))
        out["steps"]["I4"] = {"after_5_commits": after5, "undo_steps": undo4}

        await browser.close()
    return finish(src0, switched)

def finish(src0, switched):
    # 入力ソースを元に戻す（切り替えたぶんだけ）
    if switched:
        for _ in range(4):
            if selected_source() == src0: break
            key_ctrl_space(); time.sleep(0.6)
    out["input_source_restored"] = selected_source()[:80]
    out["restored_ok"] = (selected_source() == src0)
    out["log"] = log
    raw = os.path.join(OUT, "raw_mac_B.json")
    with open(raw, "w") as f: json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print("raw:", raw)

asyncio.run(main())
