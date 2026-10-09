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
// §23a：ページが受け取った keydown/keyup を観測（isComposing・keyCode）。ページの処理とは別に記録するだけ。
window.__keylog = [];
for (const t of ['keydown','keyup']) {
  document.addEventListener(t, (e) => {
    window.__keylog.push({ type: t, key: e.key, keyCode: e.keyCode, isComposing: !!e.isComposing, t: Math.round(performance.now()) });
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

# ===== §23a X33：変換中のキーをページが拾わない。キーは CDP の dispatchKeyEvent（229 付き） =====
async def send229(cdp, typ, extra=None):
    d = {"type": typ, "windowsVirtualKeyCode": 229, "key": "Process"}
    if extra: d.update(extra)
    await cdp.send("Input.dispatchKeyEvent", d)

def moved2(base, cur, thr=0.5):
    res = []
    for k, v in cur.get("parts", {}).items():
        b = base.get("parts", {}).get(k)
        if not b: continue
        for ax in ("x", "y", "w", "h"):
            d = round(v[ax] - b[ax], 2)
            if abs(d) > thr: res.append({"part": k, "axis": ax, "delta": d})
    return {"parts": res, "secΔ": round(cur.get("sectionH", 0) - base.get("sectionH", 0), 2), "pageΔ": cur.get("pageH", 0) - base.get("pageH", 0)}

async def jrun(pg, cdp, part, enter=None, dev="pc"):
    res = {"part": part}
    cpos = 6 if part == "F_b0" else 1
    # J1：「かし」まで変換中 → Esc（229 付き keydown/keyup）→ imeSetComposition('') で変換をやめる
    await fresh(pg, dev); await (enter or edit_start)(pg, part); await caret_at(pg, cpos)
    await pg.evaluate("window.__keylog=[]")
    base = await snap(pg, part)
    await cdp.send("Input.imeSetComposition", {"text": "かし", "selectionStart": 2, "selectionEnd": 2}); await pg.wait_for_timeout(100)
    await send229(cdp, "keyDown"); await send229(cdp, "keyUp"); await pg.wait_for_timeout(100)
    await cdp.send("Input.imeSetComposition", {"text": "", "selectionStart": 0, "selectionEnd": 0}); await pg.wait_for_timeout(150)
    s1 = await snap(pg, part)
    res["J1"] = {"base_text": base["text"], "after_text": s1["text"], "editing": await pg.evaluate(f"{P}.editingId()"),
                 "moved": moved2(base, s1), "keylog": await pg.evaluate("window.__keylog")}
    # J2：続けて「菓子」を変換して決め、そのあと Esc（229 なし）
    await cdp.send("Input.imeSetComposition", {"text": "かし", "selectionStart": 2, "selectionEnd": 2}); await pg.wait_for_timeout(100)
    await cdp.send("Input.insertText", {"text": "菓子"}); await pg.wait_for_timeout(120)
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(150)
    s2 = await snap(pg, part)
    res["J2"] = {"after_text": s2["text"], "editing_after_esc": await pg.evaluate(f"{P}.editingId()")}
    # J3：「かし」まで変換中 → リターン（229 付き）→ insertText('菓子')
    await fresh(pg, dev); await (enter or edit_start)(pg, part); await caret_at(pg, cpos)
    await cdp.send("Input.imeSetComposition", {"text": "かし", "selectionStart": 2, "selectionEnd": 2}); await pg.wait_for_timeout(100)
    await send229(cdp, "keyDown", {"key": "Enter"}); await send229(cdp, "keyUp", {"key": "Enter"}); await pg.wait_for_timeout(80)
    await cdp.send("Input.insertText", {"text": "菓子"}); await pg.wait_for_timeout(120)
    s3 = await snap(pg, part)
    res["J3"] = {"after_text": s3["text"], "has_newline": ("\n" in s3["text"] or "\r" in s3["text"]), "editing": await pg.evaluate(f"{P}.editingId()")}
    # J4：「かし」まで変換中 → Cmd+Z（229 付き）。戻る（10.1）が動かないこと
    await fresh(pg, dev); await (enter or edit_start)(pg, part); await caret_at(pg, cpos)
    opsb = await ops_len(pg)
    await cdp.send("Input.imeSetComposition", {"text": "かし", "selectionStart": 2, "selectionEnd": 2}); await pg.wait_for_timeout(100)
    await send229(cdp, "keyDown", {"modifiers": 4}); await send229(cdp, "keyUp", {"modifiers": 4}); await pg.wait_for_timeout(120)  # modifiers 4 = Meta(Cmd)
    s4 = await snap(pg, part)
    res["J4"] = {"after_text": s4["text"], "ops_before": opsb, "ops_after": await ops_len(pg), "editing": await pg.evaluate(f"{P}.editingId()")}
    return res

async def J5(pg, cdp):
    # 前の I3 と同じ：keyboard.press('Escape')。ページが受け取った keydown の isComposing・keyCode を観測
    await fresh(pg); await edit_start(pg, "F_b0"); await caret_at(pg, 6)
    await pg.evaluate("window.__keylog=[]")
    base = await snap(pg, "F_b0")
    await cdp.send("Input.imeSetComposition", {"text": "かし", "selectionStart": 2, "selectionEnd": 2}); await pg.wait_for_timeout(100)
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(150)
    s = await snap(pg, "F_b0")
    return {"base_text": base["text"], "after_text": s["text"], "editing": await pg.evaluate(f"{P}.editingId()"),
            "keylog": await pg.evaluate("window.__keylog")}

# §3：I2/I8 の「変換前・変換の最後の段階・決めた後 500ms」の3位置（動いた部品だけ）
async def sec3(pg, cdp, enter=None, dev="pc"):
    await fresh(pg, dev); await (enter or edit_start)(pg, "F_b0"); await caret_at(pg, 6)
    base = await snap(pg, "F_b0")
    for comp in ["あ"*10, "あ"*20, "あ"*30, "あ"*40]:
        await cdp.send("Input.imeSetComposition", {"text": comp, "selectionStart": len(comp), "selectionEnd": len(comp)}); await pg.wait_for_timeout(100)
    last = await snap(pg, "F_b0")
    await cdp.send("Input.insertText", {"text": "菓"*40}); await pg.wait_for_timeout(120)
    commit = await snap(pg, "F_b0")
    await pg.wait_for_timeout(500)
    after = await snap(pg, "F_b0")
    axes = ("x", "y", "w", "h")
    out3 = {}
    for k, b in base["parts"].items():
        l = last["parts"].get(k); c = commit["parts"].get(k); a = after["parts"].get(k)
        if not (l and c and a): continue
        moved_composing = any(abs(l[ax]-b[ax]) > 0.5 for ax in axes)
        if not moved_composing: continue
        out3[k] = {"before": b, "last_composing": l, "after_commit_500ms": a,
                   "moved_again_at_commit": any(abs(c[ax]-l[ax]) > 0.5 for ax in axes)}
    return {"dev": dev, "moved_parts": out3}

# ===== §23b 書き換え中の「戻す」を細かく（記録0.6）。U1〜U6 =====
async def body(pg): return await pg.evaluate(f"{P}.textRuns('F_b0').map(r=>r.text).join('')")
async def caret_end(pg, part="F_b0"):
    L = await pg.evaluate(f"{P}.textRuns('{part}').map(r=>r.text).join('').length")
    await pg.evaluate(f"{P}.editSelect({L},{L})"); await pg.wait_for_timeout(40)
async def ime_words(pg, cdp, pairs):
    # 本物のIMEの確定は compositionend を出すが、CDP Input.insertText は出さない。確定イベントを明示的に発火して合わせる。
    for r, k in pairs:
        await cdp.send("Input.imeSetComposition", {"text": r, "selectionStart": len(r), "selectionEnd": len(r)}); await pg.wait_for_timeout(80)
        await cdp.send("Input.insertText", {"text": k}); await pg.wait_for_timeout(80)
        await pg.evaluate(f"{P}.textRuns('F_b0')")   # 確定後の文字を editing.runs に取り込ませてから確定イベント
        await pg.evaluate("(()=>{const e=document.querySelector('[contenteditable=true]'); if(e) e.dispatchEvent(new CompositionEvent('compositionend',{data:'',bubbles:true}))})()"); await pg.wait_for_timeout(100)
async def drag_part(pg, part, dx, dy):
    el = await pg.query_selector(f'[data-el="{part}"]'); bb = await el.bounding_box()
    g = await pg.evaluate(f"{P}.geometry()"); sc = bb["width"] / g[part]["w"]; cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
    await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + dx * sc, cy + dy * sc, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(150)
async def undo_seq(pg, n, tail=14, extra=None):
    steps = []
    for i in range(n):
        await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(170)
        row = {"step": i + 1, "text": (await body(pg))[-tail:], "editing": await pg.evaluate(f"{P}.editingId()")}
        if extra: row.update(await extra(pg))
        steps.append(row)
    return steps

async def U1(pg, cdp):   # 5語を変換して決める → Cmd+Z ×6
    await fresh(pg); await edit_start(pg, "F_b0"); await caret_end(pg)
    await ime_words(pg, cdp, [("haru", "春"), ("natu", "夏"), ("aki", "秋"), ("huyu", "冬"), ("sora", "空")])
    after = (await body(pg))[-14:]
    return {"after_typing": after, "undo_steps": await undo_seq(pg, 6)}
async def U2(pg, cdp):   # 「abc def」と打つ → Cmd+Z ×3
    await fresh(pg); await edit_start(pg, "F_b0"); await caret_end(pg)
    await pg.keyboard.type("abc def", delay=30); await pg.wait_for_timeout(120)
    return {"after_typing": (await body(pg))[-16:], "undo_steps": await undo_seq(pg, 3, tail=16)}
async def U3(pg, cdp):   # 5文字を Backspace で1字ずつ → Cmd+Z ×2
    await fresh(pg); await edit_start(pg, "F_b0"); await caret_end(pg)
    base = (await body(pg))[-16:]
    for _ in range(5):
        await pg.keyboard.press("Backspace"); await pg.wait_for_timeout(60)
    return {"base": base, "after_delete": (await body(pg))[-16:], "undo_steps": await undo_seq(pg, 2, tail=16)}
async def U4(pg, cdp):   # 3語→Esc→部品を動かす→Cmd+Z ×5
    await fresh(pg); await edit_start(pg, "F_b0"); await caret_end(pg)
    await ime_words(pg, cdp, [("haru", "春"), ("natu", "夏"), ("aki", "秋")])
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(150)
    base_x = (await pg.evaluate(f"{P}.geometry()"))["F_p0"]["x"]
    await drag_part(pg, "F_p0", 40, 0)
    async def extra(pg):
        g = await pg.evaluate(f"{P}.geometry()")
        return {"F_p0_dx": round(g["F_p0"]["x"] - base_x, 1)}
    return {"after_move_dx": round((await pg.evaluate(f"{P}.geometry()"))["F_p0"]["x"] - base_x, 1), "undo_steps": await undo_seq(pg, 5, extra=extra)}
async def U5(pg, cdp):   # U1 の後、Cmd+Shift+Z ×6
    await fresh(pg); await edit_start(pg, "F_b0"); await caret_end(pg)
    await ime_words(pg, cdp, [("haru", "春"), ("natu", "夏"), ("aki", "秋"), ("huyu", "冬"), ("sora", "空")])
    for _ in range(6):
        await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(130)
    steps = []
    for i in range(6):
        await pg.keyboard.press("Meta+Shift+z"); await pg.wait_for_timeout(170)
        steps.append({"step": i + 1, "text": (await body(pg))[-14:], "editing": await pg.evaluate(f"{P}.editingId()")})
    return {"after_undo6": (await body(pg))[-14:] if False else None, "redo_steps": steps}
async def U6(pg, cdp):   # 一部を太字 → 2語打つ → Cmd+Z ×3
    await fresh(pg); await edit_start(pg, "F_b0")
    await pg.evaluate(f"{P}.editSelect(0,4)"); await pg.wait_for_timeout(60)
    await pg.keyboard.press("Meta+b"); await pg.wait_for_timeout(130)
    await caret_end(pg)
    await pg.keyboard.type("xx yy", delay=30); await pg.wait_for_timeout(120)
    async def extra(pg):
        runs = await pg.evaluate(f"{P}.textRuns('F_b0')")
        return {"bold_chars": sum(len(r["text"]) for r in runs if r.get("bold"))}
    return {"undo_steps": await undo_seq(pg, 3, tail=16, extra=extra)}

# ===== §23c K1〜K7（X34：戻すものが無いときの Cmd+Z は何もしない／X35：書き換え中の「打つ以外の操作」は先にふつうに終える）=====
async def caret_pos(pg):
    return await pg.evaluate("(()=>{const s=getSelection(); if(!s||!s.rangeCount) return null; const e=document.querySelector('[contenteditable=true]'); if(!e) return null; const r=s.getRangeAt(0); if(!e.contains(r.endContainer)) return null; const pre=document.createRange(); pre.selectNodeContents(e); pre.setEnd(r.endContainer,r.endOffset); return pre.toString().length;})()")
async def selected_parts(pg):
    return await pg.evaluate("[...document.querySelectorAll('.mark-sel,.mark-anchor')].map(n=>n.getAttribute('data-el')).filter(Boolean)")
async def runs_of(pg, part="F_b0"):
    return await pg.evaluate(f"{P}.textRuns('{part}')")
async def right_click_reset(pg, part):
    # 右クリックで浮遊メニューを出し、「文字の見た目を元に戻す」を押す（本物の操作＝X35 の経路）
    el = await pg.query_selector(f'[data-el="{part}"]'); await el.scroll_into_view_if_needed()
    bb = await el.bounding_box()
    await pg.mouse.click(bb["x"] + bb["width"] / 2, bb["y"] + 8, button="right"); await pg.wait_for_timeout(200)
    found = await pg.evaluate("(()=>{const b=[...document.querySelectorAll('#fmenu button')].find(x=>x.textContent.includes('文字の見た目を元に戻す')); if(b){b.click(); return true;} return false;})()")
    await pg.wait_for_timeout(200)
    return found
async def _d10_reenter(pg, cdp):
    # 一部(0〜4文字目)を赤→書き換えを終える（D1 プリセット＝partRun＋commit）→戻す（入り直す）→やり直す（入り直す）
    await fresh(pg)
    await pg.evaluate(f"{P}.runPreset('D1')"); await pg.wait_for_timeout(200)
    after_red = await runs_of(pg)
    await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(220)
    after_undo = {"runs": await runs_of(pg), "editing": await pg.evaluate(f"{P}.editingId()")}
    await pg.keyboard.press("Meta+Shift+z"); await pg.wait_for_timeout(220)
    after_redo = {"runs": await runs_of(pg), "editing": await pg.evaluate(f"{P}.editingId()")}
    return after_red, after_undo, after_redo

async def K1(pg, cdp):   # D10 と同じ手順。やり直し直後・メニュー押下直後の runs と書き換えの状態
    after_red, after_undo, after_redo = await _d10_reenter(pg, cdp)
    found = await right_click_reset(pg, "F_b0")
    after_reset = {"runs": await runs_of(pg), "editing": await pg.evaluate(f"{P}.editingId()")}
    return {"after_red": after_red, "editing_after_undo": after_undo["editing"],
            "runs_after_redo": after_redo["runs"], "editing_after_redo": after_redo["editing"],
            "reset_btn_found": found, "runs_after_reset": after_reset["runs"], "editing_after_reset": after_reset["editing"]}

async def K2(pg, cdp):   # K1 の後、書き換えの外をクリック → Cmd+Z 1回（赤が戻るか・書き換えの状態）
    await _d10_reenter(pg, cdp)
    await right_click_reset(pg, "F_b0")
    before = {"runs": await runs_of(pg), "editing": await pg.evaluate(f"{P}.editingId()")}
    await pg.mouse.click(4, 400); await pg.wait_for_timeout(180)   # 書き換えの外をクリック（編集中でない＝何も起きない）
    await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(220)
    after = {"runs": await runs_of(pg), "editing": await pg.evaluate(f"{P}.editingId()")}
    return {"before_undo": before, "after_undo": after}

async def K3(pg, cdp):   # 春を決める→Cmd+Z(入り直す)→部品を右へ40→Cmd+Z×2（本文・位置・書き換えの状態）
    await fresh(pg); await edit_start(pg, "F_b0"); await caret_end(pg)
    await ime_words(pg, cdp, [("haru", "春")])
    base_x = (await pg.evaluate(f"{P}.geometry()"))["F_p0"]["x"]
    async def row(step):
        g = await pg.evaluate(f"{P}.geometry()")
        return {"step": step, "body": (await body(pg))[-10:], "F_p0_dx": round(g["F_p0"]["x"] - base_x, 1), "editing": await pg.evaluate(f"{P}.editingId()")}
    steps = [await row("春を決める")]
    await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(220)   # 入り直す
    steps.append(await row("Cmd+Z(入り直す)"))
    await drag_part(pg, "F_p0", 40, 0)   # 実ドラッグ＝pointerdown が先に書き換えをふつうに終える（X35）
    steps.append(await row("F_p0を右へ40"))
    for i in range(2):
        await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(220)
        steps.append(await row(f"Cmd+Z {i+1}"))
    return {"base_x": round(base_x, 1), "steps": steps}

async def K4(pg, cdp):   # 書き換え中に一部を選んで太字（道具）→外をクリック（太字が残るか＝選択の道具は書き換えの中・D系を崩さない）
    await fresh(pg); await edit_start(pg, "F_b0")
    await pg.evaluate(f"{P}.editSelect(0,4)"); await pg.wait_for_timeout(80)
    await pg.keyboard.press("Meta+b"); await pg.wait_for_timeout(180)
    editing_mid = await pg.evaluate(f"{P}.editingId()")
    await pg.mouse.click(4, 400); await pg.wait_for_timeout(220)   # 書き換えの外をクリック
    runs = await runs_of(pg)
    bold = sum(len(r["text"]) for r in runs if r.get("bold"))
    return {"editing_during_bold": editing_mid, "bold_chars_after_click_out": bold, "runs": runs, "editing_after": await pg.evaluate(f"{P}.editingId()")}

async def K5(pg, cdp):   # 春を決める→Cmd+Z×3（2・3回目は戻すものが無い）。本文・書き換えの状態・カーソルの位置
    await fresh(pg); await edit_start(pg, "F_b0"); await caret_end(pg)
    await ime_words(pg, cdp, [("haru", "春")])
    async def row(step):
        return {"step": step, "body": (await body(pg))[-10:], "editing": await pg.evaluate(f"{P}.editingId()"), "caret": await caret_pos(pg)}
    steps = [await row("春を決める")]
    for i in range(3):
        await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(220)
        steps.append(await row(f"Cmd+Z {i+1}"))
    return {"steps": steps}

async def K6(pg, cdp):   # 書き換えていない状態で、戻すものが無いところまで Cmd+Z →もう1回（本文・選んでいる部品・書き換えの状態が変わらないか）
    await fresh(pg)
    await pg.evaluate(f"{P}.select('F_h0')"); await pg.wait_for_timeout(120)
    before = {"body": (await body(pg))[-10:], "selected": await selected_parts(pg), "editing": await pg.evaluate(f"{P}.editingId()")}
    steps = []
    for i in range(2):
        await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(160)
        steps.append({"step": f"Cmd+Z {i+1}", "body": (await body(pg))[-10:], "selected": await selected_parts(pg), "editing": await pg.evaluate(f"{P}.editingId()")})
    return {"before": before, "steps": steps}

async def K7(pg, cdp):   # K5 の後、Cmd+Shift+Z×3（2・3回目はやり直すものが無い）
    await fresh(pg); await edit_start(pg, "F_b0"); await caret_end(pg)
    await ime_words(pg, cdp, [("haru", "春")])
    for _ in range(3):
        await pg.keyboard.press("Meta+z"); await pg.wait_for_timeout(200)
    steps = []
    for i in range(3):
        await pg.keyboard.press("Meta+Shift+z"); await pg.wait_for_timeout(220)
        steps.append({"step": f"Cmd+Shift+Z {i+1}", "body": (await body(pg))[-10:], "editing": await pg.evaluate(f"{P}.editingId()")})
    return {"redo_steps": steps}

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
    # §23a J1〜J5（本文）と §3（PC の位置）
    out["tests"]["J_F_b0"] = await jrun(pg, cdp, "F_b0")
    out["tests"]["J5"] = await J5(pg, cdp)
    out["tests"]["J6_card"] = await jrun(pg, cdp, "card_name_c_jonama")
    out["tests"]["J6_row"] = await jrun(pg, cdp, "row_name_t_warabi")
    out["tests"]["sec3_pc"] = await sec3(pg, cdp, dev="pc")
    # §23b U1〜U6（戻す細かさ）＝K8：そのまま走らせ直す
    for name, fn in [("U1", U1), ("U2", U2), ("U3", U3), ("U4", U4), ("U5", U5), ("U6", U6)]:
        out["tests"][name] = await fn(pg, cdp)
    # §23c K1〜K7（X34・X35）
    for name, fn in [("K1", K1), ("K2", K2), ("K3", K3), ("K4", K4), ("K5", K5), ("K6", K6), ("K7", K7)]:
        out["tests"][name] = await fn(pg, cdp)

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
        res["sec3_sp"] = await sec3(pg, cdp, enter=phone_enter, dev="sp")   # §3 スマホの3位置
        res["J_F_b0_sp"] = await jrun(pg, cdp, "F_b0", enter=phone_enter, dev="sp")   # §23a J1〜J4 スマホ
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

    # ===== §23a J 系 =====
    def show_j(tag, j):
        print(f"\n[{tag}] part={j.get('part')}")
        j1 = j["J1"]; print(f"   J1 Esc(229): base='…{j1['base_text'][-6:]}' after='…{j1['after_text'][-6:]}' editing={j1['editing']} moved={j1['moved']['parts']} keylog={j1['keylog']}")
        print(f"   J2 菓子決め→Esc(229なし): after='…{j['J2']['after_text'][-8:]}' editing_after_esc={j['J2']['editing_after_esc']}")
        print(f"   J3 Enter(229)→insertText: after='…{j['J3']['after_text'][-8:]}' has_newline={j['J3']['has_newline']} editing={j['J3']['editing']}")
        print(f"   J4 Cmd+Z(229): after='…{j['J4']['after_text'][-6:]}' ops {j['J4']['ops_before']}→{j['J4']['ops_after']} editing={j['J4']['editing']}")
    for tag in ["J_F_b0", "J6_card", "J6_row"]:
        if tag in out["tests"]: show_j(tag, out["tests"][tag])
    if "J_F_b0_sp" in out["tests"]["I8"]: show_j("J_F_b0_sp(スマホ)", out["tests"]["I8"]["J_F_b0_sp"])
    j5 = out["tests"]["J5"]
    print(f"\n[J5] keyboard.press('Escape'): base='…{j5['base_text'][-6:]}' after='…{j5['after_text'][-6:]}' editing={j5['editing']}")
    print(f"   page が受けた keydown: {j5['keylog']}")
    # ===== §3 位置（動いた部品だけ・3位置） =====
    for tag in ["sec3_pc"]:
        s3 = out["tests"].get(tag) or {}
        print(f"\n[§3 {tag}] dev={s3.get('dev')}")
        for k, v in (s3.get("moved_parts") or {}).items():
            print(f"   {k}: 変換前 y={v['before']['y']} / 変換最後 y={v['last_composing']['y']} / 決め後500ms y={v['after_commit_500ms']['y']}  決めた瞬間に再移動={v['moved_again_at_commit']}")
    s3 = out["tests"]["I8"].get("sec3_sp") or {}
    print(f"\n[§3 sec3_sp] dev={s3.get('dev')}")
    for k, v in (s3.get("moved_parts") or {}).items():
        print(f"   {k}: 変換前 y={v['before']['y']} / 変換最後 y={v['last_composing']['y']} / 決め後500ms y={v['after_commit_500ms']['y']}  決めた瞬間に再移動={v['moved_again_at_commit']}")
    # ===== §23b U 系 =====
    for name in ["U1", "U2", "U3", "U4", "U5", "U6"]:
        t = out["tests"].get(name) or {}
        print(f"\n[{name}]")
        if "after_typing" in t: print(f"   打った後='…{t['after_typing']}'")
        if "after_delete" in t: print(f"   base='…{t.get('base')}' 消した後='…{t['after_delete']}'")
        if "after_move_dx" in t: print(f"   動かした後 F_p0 dx={t['after_move_dx']}")
        for s in t.get("undo_steps", []):
            extra = "".join(f" {k}={v}" for k, v in s.items() if k not in ("step", "text", "editing"))
            print(f"   戻す{s['step']}: '…{s['text']}' 書換中={s['editing']}{extra}")
        for s in t.get("redo_steps", []):
            print(f"   やり直し{s['step']}: '…{s['text']}' 書換中={s['editing']}")

    # ===== §23c K 系（X34・X35）=====
    def rb(runs):   # runs を短く：text(6字)＋色/太字の印
        if not isinstance(runs, list):
            return str(runs)
        return [dict(t=r.get("text", "")[-6:], **({"色": r["color"]} if r.get("color") else {}), **({"太": 1} if r.get("bold") else {})) for r in runs]
    k = out["tests"]
    if "K1" in k:
        t = k["K1"]
        print("\n[K1] D10 と同じ手順（赤→終える→戻す→やり直す→メニューで元に戻す）")
        print(f"   赤を付けた直後 runs={rb(t['after_red'])}")
        print(f"   戻した直後 書換中={t['editing_after_undo']}")
        print(f"   やり直した直後 runs={rb(t['runs_after_redo'])} 書換中={t['editing_after_redo']}")
        print(f"   メニュー『文字の見た目を元に戻す』: ボタン検出={t['reset_btn_found']}")
        print(f"   押した直後 runs={rb(t['runs_after_reset'])} 書換中={t['editing_after_reset']}")
    if "K2" in k:
        t = k["K2"]
        print("\n[K2] K1 の後、外をクリック→Cmd+Z 1回")
        print(f"   クリック前 runs={rb(t['before_undo']['runs'])} 書換中={t['before_undo']['editing']}")
        print(f"   Cmd+Z 後  runs={rb(t['after_undo']['runs'])} 書換中={t['after_undo']['editing']}")
    if "K3" in k:
        t = k["K3"]
        print(f"\n[K3] 春→Cmd+Z(入り直す)→右へ40→Cmd+Z×2  base_x={t['base_x']}")
        for s in t["steps"]:
            print(f"   {s['step']:16} 本文末='…{s['body']}' F_p0_dx={s['F_p0_dx']} 書換中={s['editing']}")
    if "K4" in k:
        t = k["K4"]
        print("\n[K4] 書き換え中に一部を太字（道具）→外をクリック")
        print(f"   太字の最中 書換中={t['editing_during_bold']} / 外をクリック後 太字の文字数={t['bold_chars_after_click_out']} 書換中={t['editing_after']} runs={rb(t['runs'])}")
    if "K5" in k:
        t = k["K5"]
        print("\n[K5] 春→Cmd+Z×3（2・3回目は戻すものが無い）")
        for s in t["steps"]:
            print(f"   {s['step']:12} 本文末='…{s['body']}' 書換中={s['editing']} カーソル={s['caret']}")
    if "K6" in k:
        t = k["K6"]
        print("\n[K6] 書き換えていない状態で戻すものが無い Cmd+Z×2")
        print(f"   前: 本文末='…{t['before']['body']}' 選択={t['before']['selected']} 書換中={t['before']['editing']}")
        for s in t["steps"]:
            print(f"   {s['step']:8} 本文末='…{s['body']}' 選択={s['selected']} 書換中={s['editing']}")
    if "K7" in k:
        t = k["K7"]
        print("\n[K7] K5 の後、Cmd+Shift+Z×3（2・3回目はやり直すものが無い）")
        for s in t["redo_steps"]:
            print(f"   {s['step']:16} 本文末='…{s['body']}' 書換中={s['editing']}")

asyncio.run(main())
