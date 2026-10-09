// 試験台19 O1〜O20（リンク・書体・X19）。本物のマウス・キーボード。画面 PC 1440×1100。スクロールはホイール。
import { chromium } from "playwright";
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + "/Users/ryutak1105/Desktop/芦屋みっけ/mikke-web/refs/compare/layout/playground20_single.html";
const OUT = path.join(here, "..", "..", "..", "refs/compare/layout/playground20"); fs.mkdirSync(OUT, { recursive: true });
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;
const pause = (p, ms = 150) => p.waitForTimeout(ms);
const reset = (p) => p.evaluate(() => window.__playground.reset());
const setDevice = (p, d) => p.evaluate((d) => window.__playground.setDevice(d), d);
const textOf = (p, id) => p.evaluate((id) => window.__playground.textRuns(id).map((r) => r.text).join(""), id);
const linksOf = (p, id) => p.evaluate((id) => window.__playground.links(id).runs.map((r) => ({ s: r.s, e: r.e, txt: r.text, kind: r.link.kind, label: r.label, href: r.href, newTab: r.newTab })), id);
const elemLinkOf = (p, id) => p.evaluate((id) => window.__playground.elementLink(id), id);
async function rectOf(p, id) { return p.evaluate((id) => { for (const h of document.querySelectorAll("#sectionwrap .host")) { const el = h.querySelector('[data-el="' + id + '"]'); if (el) { el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; } } return null; }, id); }
async function center(p, id) { const r = await rectOf(p, id); return r ? { x: r.left + r.w / 2, y: r.top + r.h / 2 } : null; }
async function clickEl(p, id) { const c = await center(p, id); await p.mouse.click(Math.round(c.x), Math.round(c.y)); await pause(p, 160); }
async function enterEdit(p, id) { const r = await rectOf(p, id); await p.mouse.dblclick(Math.round(r.left + 20), Math.round(r.top + 12)); await pause(p, 300); }
const editSelectText = async (p, id, sub) => { const idx = await p.evaluate(({ id, sub }) => window.__playground.textRuns(id).map((r) => r.text).join("").indexOf(sub), { id, sub }); if (idx < 0) return -1; await p.evaluate(({ idx, n }) => window.__playground.editSelect(idx, idx + n), { idx, n: sub.length }); await pause(p, 150); return idx; };
const clickTool = (p, sel) => p.evaluate((sel) => { const b = document.querySelector(sel); if (b) b.click(); }, sel);
const clickOpt = (p, label) => p.evaluate((label) => { const b = document.querySelector('#linkPanel [data-link-opt="' + label + '"]'); if (b) b.click(); }, label);
const panelOpen = (p) => p.evaluate(() => document.getElementById("linkPanel").classList.contains("on"));
async function shot(p, name) { await p.locator("#stage").screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 80 }).catch(() => {}); }
const underlineOf = (p, id) => p.evaluate((id) => { const s = document.querySelector('[data-el="' + id + '"] [data-lk]'); return s ? (getComputedStyle(s).textDecorationLine + "/" + getComputedStyle(s).textDecorationThickness) : null; }, id);

const report = {};
async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  let opened = null; await ctx.exposeBinding("__opened", (src, u) => { opened = u; });
  await p.addInitScript(() => { const o = window.open; window.open = (u, t) => { window.__opened && window.__opened(u); return null; }; });
  await p.goto(url); for (let i = 0; i < 40; i++) { if (await p.evaluate(() => document.fonts.status === "loaded")) break; await pause(p, 100); }

  // O1：F_b0 書き換え→「小さな菓子」を選ぶ→リンク→Instagram。選んだ5文字だけがリンク（下線つき）
  { await reset(p); await setDevice(p, "pc"); await pause(p, 200); await enterEdit(p, "F_b0");
    const idx = await editSelectText(p, "F_b0", "小さな菓子");
    const disabled = await p.evaluate(() => document.querySelector('[data-ts="link"]').disabled);
    const selRect = await p.evaluate((idx) => window.__playground.editingRangeRect(idx, idx + 5), idx);
    await clickTool(p, '[data-ts="link"]'); await pause(p, 200); const po = await panelOpen(p);
    const panelPos = await p.evaluate(() => { const r = document.getElementById("linkPanel").getBoundingClientRect(); return { left: r.left, top: r.top }; });
    const topDelta = +(panelPos.top - (selRect.bottom + 8)).toFixed(1), leftDelta = +(panelPos.left - selRect.left).toFixed(1);
    const segs = await p.evaluate(() => [...document.querySelectorAll("#linkPanel .seg")].map((s) => s.textContent));
    await clickOpt(p, "Instagram"); await pause(p, 250);
    const lk = await linksOf(p, "F_b0"); await p.keyboard.press("Escape"); await pause(p, 250);
    await shot(p, "O1.jpg");
    const committed = await linksOf(p, "F_b0"); const ul = await underlineOf(p, "F_b0");
    report.O1 = { linkEnabled: !disabled, panelOpen: po, belowSelTop8: near(topDelta, 0, 2), leftAtSel: near(leftDelta, 0, 2), topDelta, leftDelta, segCount: segs.length, segs, oneLink: committed.length === 1, range: committed[0] && [committed[0].s, committed[0].e], len5: committed[0] && (committed[0].e - committed[0].s) === 5, kind: committed[0] && committed[0].kind, underline: ul, pass: !disabled && po && near(topDelta, 0, 2) && near(leftDelta, 0, 2) && segs.length === 3 && committed.length === 1 && committed[0].kind === "instagram" && (committed[0].e - committed[0].s) === 5 && /underline/.test(ul || "") };
  }
  // O2：同じ所を選んで Cmd+K → 一覧が開く
  { await reset(p); await pause(p, 150); await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", "小さな菓子");
    await p.keyboard.press("Meta+k"); await pause(p, 200); const po = await panelOpen(p);
    report.O2 = { panelOpen: po, pass: po }; await p.keyboard.press("Escape"); await pause(p, 150); }
  // O3：O1 の後、書き換えを終え、「小さな菓子」にマウスを乗せて札→「開いて確かめる」
  { await reset(p); await pause(p, 120); await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", "小さな菓子"); await clickTool(p, '[data-ts="link"]'); await pause(p, 150); await clickOpt(p, "Instagram"); await pause(p, 150); await p.keyboard.press("Escape"); await pause(p, 250);
    const sp = await p.evaluate(() => { const s = document.querySelector('[data-el="F_b0"] [data-lk]'); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.move(Math.round(sp.x), Math.round(sp.y)); await pause(p, 600);
    const chipOn = await p.evaluate(() => document.getElementById("linkChip").classList.contains("on"));
    const chipName = await p.evaluate(() => { const n = document.querySelector("#linkChip .nm"); return n ? n.textContent : null; });
    const chipBtns = await p.evaluate(() => [...document.querySelectorAll("#linkChip button")].map((b) => b.textContent));
    await shot(p, "O3.jpg");
    opened = null; await clickTool(p, '#linkChip [data-link-open]'); await pause(p, 300);
    report.O3 = { chipOn, chipName, chipBtns, opened, instaOpened: !!(opened && /instagram\.com\/ashiyado_sample/.test(opened)), pass: chipOn && /Instagram/.test(chipName || "") && chipBtns.length === 3 && !!(opened && /instagram/.test(opened)) };
  }
  // O4：札の「変える」→お品書き。続けて「外す」。続けて戻す
  { await reset(p); await pause(p, 120); await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", "小さな菓子"); await clickTool(p, '[data-ts="link"]'); await pause(p, 150); await clickOpt(p, "Instagram"); await pause(p, 150); await p.keyboard.press("Escape"); await pause(p, 250);
    const sp = await p.evaluate(() => { const s = document.querySelector('[data-el="F_b0"] [data-lk]'); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.move(Math.round(sp.x), Math.round(sp.y)); await pause(p, 600);
    await clickTool(p, '#linkChip [data-link-change]'); await pause(p, 200); await clickOpt(p, "お品書き"); await pause(p, 250);
    const afterChange = await linksOf(p, "F_b0");
    const sp2 = await p.evaluate(() => { const s = document.querySelector('[data-el="F_b0"] [data-lk]'); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.move(Math.round(sp2.x), Math.round(sp2.y)); await pause(p, 600);
    await clickTool(p, '#linkChip [data-link-remove]'); await pause(p, 250);
    const afterRemove = await linksOf(p, "F_b0"); const textKept = await textOf(p, "F_b0");
    await p.evaluate(() => window.__playground.undo()); await pause(p, 200);
    const afterUndo = await linksOf(p, "F_b0");
    report.O4 = { afterChangeKind: afterChange[0] && afterChange[0].kind, afterChangePage: afterChange[0] && afterChange[0].href, removedEmpty: afterRemove.length === 0, textKept: textKept.includes("小さな菓子"), undoBack: afterUndo.length === 1 && afterUndo[0].kind === "page", pass: afterChange[0] && afterChange[0].kind === "page" && afterRemove.length === 0 && textKept.includes("小さな菓子") && afterUndo.length === 1 && afterUndo[0].kind === "page" };
  }
  // O5：欄に www.example.com→つなぐ（別の文字で info@…、別で あいう）
  { const mk = async (sub, val) => { await reset(p); await pause(p, 100); await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", sub); await clickTool(p, '[data-ts="link"]'); await pause(p, 150);
      await p.evaluate((v) => { const i = document.querySelector('#linkPanel [data-link-url]'); i.value = v; i.focus(); }, val);
      await p.evaluate(() => { const b = document.querySelector('#linkPanel [data-link-connect]'); b.click(); }); await pause(p, 200);
      const err = await p.evaluate(() => { const e = document.querySelector('#linkPanel [data-link-err]'); return e && e.style.display !== "none"; });
      const stillOpen = await panelOpen(p); await p.keyboard.press("Escape"); await pause(p, 120);
      const lk = await linksOf(p, "F_b0"); return { lk: lk.find((x) => x.txt === sub) || null, err, stillOpen }; };
    const a = await mk("練り切り", "www.example.com");
    const b = await mk("きんとん", "info@example.com");
    const c = await mk("意匠", "あいう");
    report.O5 = { url: a.lk && a.lk.href, urlOk: !!(a.lk && a.lk.href === "https://www.example.com"), mail: b.lk && b.lk.href, mailOk: !!(b.lk && b.lk.href === "mailto:info@example.com"), invalidErr: c.err, invalidStillOpen: c.stillOpen, invalidNoLink: !c.lk, pass: !!(a.lk && a.lk.href === "https://www.example.com") && !!(b.lk && b.lk.href === "mailto:info@example.com") && c.err && c.stillOpen && !c.lk };
  }
  // O6：文の終わりに  https://example.com と打ち空白→リンク。戻すでリンクだけ外れ文字残る
  { await reset(p); await pause(p, 120); await enterEdit(p, "F_b0"); const L = (await textOf(p, "F_b0")).length; await p.evaluate((L) => window.__playground.editSelect(L, L), L); await pause(p, 100);
    await p.keyboard.type(" https://example.com ", { delay: 8 }); await pause(p, 250);
    const linked = await p.evaluate(() => window.__playground.textRuns("F_b0").filter((r) => r.link).map((r) => ({ txt: r.text, kind: r.link.kind })));
    await p.keyboard.press("Meta+z"); await pause(p, 200);
    const afterUndo = await p.evaluate(() => window.__playground.textRuns("F_b0").filter((r) => r.link).length);
    const textHas = (await textOf(p, "F_b0")).includes("https://example.com");
    report.O6 = { linked, linkedOk: linked.length === 1 && linked[0].kind === "url", undoLinks0: afterUndo === 0, textKept: textHas, pass: linked.length === 1 && linked[0].kind === "url" && afterUndo === 0 && textHas };
    await p.keyboard.press("Escape"); await pause(p, 150); }
  // O7：「季節」を選び https://example.com だけを貼り付け→文字はそのまま・リンク化
  { await reset(p); await pause(p, 120); await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", "季節");
    await p.evaluate(() => { window.__lastPlain = "https://example.com"; const n = document.querySelector('[data-el="F_b0"][contenteditable]'); const dt = new DataTransfer(); dt.setData("text/plain", "https://example.com"); n.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }); await pause(p, 250);
    const lk = await linksOf(p, "F_b0"); const kiset = lk.find((x) => x.txt === "季節");
    const noReplace = (await textOf(p, "F_b0")).includes("季節の移ろい");
    report.O7 = { kisetsuLinked: !!kiset, kind: kiset && kiset.kind, noReplace, pass: !!kiset && kiset.kind === "url" && noReplace };
    await p.keyboard.press("Escape"); await pause(p, 150); }
  // O8：文の終わりに 0797-12-3456 と打ち空白→リンクにならない
  { await reset(p); await pause(p, 120); await enterEdit(p, "F_b0"); const L = (await textOf(p, "F_b0")).length; await p.evaluate((L) => window.__playground.editSelect(L, L), L); await pause(p, 100);
    await p.keyboard.type(" 0797-12-3456 ", { delay: 8 }); await pause(p, 200);
    const linked = await p.evaluate(() => window.__playground.textRuns("F_b0").filter((r) => r.link).length);
    report.O8 = { linked, pass: linked === 0 }; await p.keyboard.press("Escape"); await pause(p, 150); }
  // O9：変換の途中で www.example.com を含む文字を変換中のまま空白→リンクにならない（compositionは composing フラグで近似）
  { await reset(p); await pause(p, 120); await enterEdit(p, "F_b0"); const L = (await textOf(p, "F_b0")).length; await p.evaluate((L) => window.__playground.editSelect(L, L), L); await pause(p, 100);
    // IME 変換中を CDP で近似：compositionstart→beforeinput なしで text を入れて space。ここでは composing 中の input は無視される実装を確認
    const linked = await p.evaluate(() => {
      const n = document.querySelector('[data-el="F_b0"][contenteditable]');
      n.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      n.dispatchEvent(new CompositionEvent("compositionupdate", { data: "www.example.com ", bubbles: true }));
      n.dispatchEvent(new InputEvent("input", { inputType: "insertCompositionText", data: "www.example.com ", isComposing: true, bubbles: true }));
      return window.__playground.textRuns("F_b0").filter((r) => r.link).length;
    });
    report.O9 = { linkedDuringComposition: linked, note: "変換の途中（isComposing）ではリンクにならない。確定後の扱いは onEditInput が通常入力として扱う", pass: linked === 0 };
    await p.evaluate(() => { const n = document.querySelector('[data-el="F_b0"][contenteditable]'); n.dispatchEvent(new CompositionEvent("compositionend", { data: "", bubbles: true })); }); await p.keyboard.press("Escape"); await pause(p, 150); }
  // O10：F_p0 を選ぶ→リンク→LINE。写真まるごとリンク・見た目変わらず・札が出る
  { await reset(p); await pause(p, 150); await clickEl(p, "F_p0");
    const before = await p.evaluate(() => { const n = document.querySelector('[data-el="F_p0"]'); return n.outerHTML.length; });
    const elemToolsShown = await p.evaluate(() => getComputedStyle(document.getElementById("elemTools")).display !== "none");
    await clickTool(p, '#tElemLink'); await pause(p, 200); const po = await panelOpen(p); await clickOpt(p, "LINE"); await pause(p, 250);
    const el = await elemLinkOf(p, "F_p0");
    const c = await center(p, "F_p0"); await p.mouse.move(6, 300); await pause(p, 200); await p.mouse.move(Math.round(c.x), Math.round(c.y)); await pause(p, 650);
    const chipOn = await p.evaluate(() => document.getElementById("linkChip").classList.contains("on"));
    await shot(p, "O10.jpg");
    report.O10 = { elemToolsShown, panelOpen: po, linkKind: el && el.link.kind, chipOn, pass: elemToolsShown && po && !!(el && el.link.kind === "line") && chipOn };
  }
  // O11：ボタン「お品書きをすべて見る」を選ぶ→リンク→お品書きが縁取り→アクセスに変えられる
  { await reset(p); await pause(p, 150); await clickEl(p, "I_pillbg"); await clickTool(p, '#tElemLink'); await pause(p, 200);
    const cur = await p.evaluate(() => { const c = document.querySelector("#linkPanel .opt.cur"); return c ? c.querySelector("span").textContent : null; });
    await clickOpt(p, "アクセス"); await pause(p, 250); const el = await elemLinkOf(p, "I_pillbg");
    report.O11 = { curOutlined: cur, changedTo: el && el.link.kind, changedPage: el && el.href, pass: cur === "お品書き" && !!(el && el.link.kind === "page" && el.href === "/contact") };
  }
  // O12：O1 の後、書き換えを終えて「小さな菓子」をクリック→飛ばない・本文選択／ダブルクリックで書き換え
  { await reset(p); await pause(p, 120); await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", "小さな菓子"); await clickTool(p, '[data-ts="link"]'); await pause(p, 150); await clickOpt(p, "Instagram"); await pause(p, 150); await p.keyboard.press("Escape"); await pause(p, 250);
    opened = null; const sp = await p.evaluate(() => { const s = document.querySelector('[data-el="F_b0"] [data-lk]'); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.mouse.click(Math.round(sp.x), Math.round(sp.y)); await pause(p, 200);
    const selected = await p.evaluate(() => window.__playground.links("F_b0") && document.querySelector('[data-el="F_b0"]').classList.contains("mark-sel"));
    const notOpened = !opened;
    await p.mouse.dblclick(Math.round(sp.x), Math.round(sp.y)); await pause(p, 300);
    const editing = await p.evaluate(() => !!document.querySelector('[data-el="F_b0"][contenteditable]'));
    report.O12 = { notOpened, selected, editing, pass: notOpened && selected && editing };
    await p.keyboard.press("Escape"); await pause(p, 120); }
  // O13：O1・O10 の後、SP へ→このページを元に戻す→F_b0 を Cmd+D 複製。リンクは残り複製にもある
  { await reset(p); await pause(p, 120); await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", "小さな菓子"); await clickTool(p, '[data-ts="link"]'); await pause(p, 150); await clickOpt(p, "Instagram"); await pause(p, 150); await p.keyboard.press("Escape"); await pause(p, 200);
    await clickEl(p, "F_p0"); await clickTool(p, '#tElemLink'); await pause(p, 150); await clickOpt(p, "LINE"); await pause(p, 200);
    await setDevice(p, "sp"); await pause(p, 300); const spLinks = await linksOf(p, "F_b0"); const spElem = await elemLinkOf(p, "F_p0");
    await setDevice(p, "pc"); await pause(p, 150);
    await p.evaluate(() => window.__playground.resetScope("page", null, ["pc", "sp"])); await pause(p, 250);
    const afterReset = await linksOf(p, "F_b0"); const afterResetElem = await elemLinkOf(p, "F_p0");
    await clickEl(p, "F_b0"); await p.keyboard.press("Meta+d"); await pause(p, 350);
    const dupPart = await p.evaluate(() => { const g = window.__playground.geometry(); const ks = Object.keys(g).filter((x) => /^add_/.test(x)); return ks.length ? ks[ks.length - 1] : null; });
    const dupLinks = dupPart ? await linksOf(p, dupPart) : [];
    report.O13 = { spLinks: spLinks.length, spElem: spElem && spElem.link.kind, afterResetLinks: afterReset.length, afterResetElem: afterResetElem && afterResetElem.link.kind, dupPart, dupLinks: dupLinks.length, pass: spLinks.length === 1 && !!(spElem && spElem.link.kind === "line") && afterReset.length === 1 && !!(afterResetElem && afterResetElem.link.kind === "line") && dupLinks.length === 1 };
  }
  // O14：F_h0 を選ぶ→書体。ボタン「明朝」・一覧はテンプレートの書体だけ・見本・明朝に✓
  { await reset(p); await pause(p, 150); await clickEl(p, "F_h0");
    const btn = await p.evaluate(() => document.querySelector('[data-ts="font"]').textContent.trim());
    await clickTool(p, '[data-ts="font"]'); await pause(p, 200);
    const opts = await p.evaluate(() => [...document.querySelectorAll('#fontPop [data-font-opt]')].map((b) => ({ k: b.getAttribute("data-font-opt"), nm: b.querySelector(".nm").textContent, sample: b.querySelector(".sample").textContent, cur: b.classList.contains("cur") })));
    await shot(p, "O14.jpg");
    const sampleText = await textOf(p, "F_h0");
    report.O14 = { btn, optCount: opts.length, opts, sampleMatches: opts.every((o) => o.sample === sampleText.slice(0, 12)), minchoChecked: !!opts.find((o) => o.k === "heading" && o.cur), pass: btn === "明朝 ▾" && opts.length === 2 && opts.every((o) => o.sample === sampleText.slice(0, 12)) && !!opts.find((o) => o.k === "heading" && o.cur) };
  }
  // O15：一覧でゴシックに乗せる→外す→ゴシックを押す→戻す
  { await reset(p); await pause(p, 150); await clickEl(p, "F_h0"); await clickTool(p, '[data-ts="font"]'); await pause(p, 200);
    await p.hover('#fontPop [data-font-opt="body"]'); await pause(p, 200);
    const previewFam = await p.evaluate(() => getComputedStyle(document.querySelector('[data-el="F_h0"]')).fontFamily);
    const dataUnchanged = await p.evaluate(() => window.__playground.curFont("F_h0"));
    await shot(p, "O15.jpg");
    await p.mouse.move(6, 6); await pause(p, 200);
    const afterLeaveFam = await p.evaluate(() => getComputedStyle(document.querySelector('[data-el="F_h0"]')).fontFamily);
    await clickTool(p, '[data-ts="font"]'); await pause(p, 150); await p.evaluate(() => document.querySelector('#fontPop [data-font-opt="body"]').click()); await pause(p, 250);
    const afterClick = await p.evaluate(() => window.__playground.curFont("F_h0"));
    await p.evaluate(() => window.__playground.undo()); await pause(p, 200);
    const afterUndo = await p.evaluate(() => window.__playground.curFont("F_h0"));
    report.O15 = { previewGothic: /Zen Kaku Gothic/.test(previewFam), dataUnchangedDuringHover: dataUnchanged === "heading", restoredOnLeave: /Zen Old Mincho/.test(afterLeaveFam), afterClick, afterUndo, pass: /Zen Kaku Gothic/.test(previewFam) && dataUnchanged === "heading" && /Zen Old Mincho/.test(afterLeaveFam) && afterClick === "body" && afterUndo === "heading" };
  }
  // O16：F_b0 書き換えで「季節の移ろい」を選び書体を明朝に→その範囲だけ明朝
  { await reset(p); await pause(p, 150); await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", "季節の移ろい");
    await clickTool(p, '[data-ts="font"]'); await pause(p, 150); await p.evaluate(() => document.querySelector('#fontPop [data-font-opt="heading"]').click()); await pause(p, 200);
    await p.keyboard.press("Escape"); await pause(p, 250);
    const runs = await p.evaluate(() => window.__playground.textRuns("F_b0").map((r) => ({ txt: r.text, font: r.font || null })));
    const minchoRun = runs.find((r) => r.txt.includes("季節の移ろい") || r.font === "heading");
    const othersNoFont = runs.filter((r) => r.font === "heading").map((r) => r.txt).join("") === "季節の移ろい";
    report.O16 = { runs, minchoOnRange: othersNoFont, pass: othersNoFont };
  }
  // O17：O15(ゴシック決定後)と O16 の後、SP→このページを元に戻す。F_h0 は明朝へ戻り、F_b0 の一部の明朝は残る
  { await reset(p); await pause(p, 120); await clickEl(p, "F_h0"); await clickTool(p, '[data-ts="font"]'); await pause(p, 120); await p.evaluate(() => document.querySelector('#fontPop [data-font-opt="body"]').click()); await pause(p, 200);
    await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", "季節の移ろい"); await clickTool(p, '[data-ts="font"]'); await pause(p, 120); await p.evaluate(() => document.querySelector('#fontPop [data-font-opt="heading"]').click()); await pause(p, 150); await p.keyboard.press("Escape"); await pause(p, 200);
    await setDevice(p, "sp"); await pause(p, 300); const spH0 = await p.evaluate(() => window.__playground.curFont("F_h0")); const spB0part = await p.evaluate(() => window.__playground.textRuns("F_b0").some((r) => r.font === "heading"));
    await setDevice(p, "pc"); await pause(p, 150);
    await p.evaluate(() => window.__playground.resetScope("page", null, ["pc", "sp"])); await pause(p, 250);
    const h0After = await p.evaluate(() => window.__playground.curFont("F_h0")); const b0partAfter = await p.evaluate(() => window.__playground.textRuns("F_b0").some((r) => r.font === "heading"));
    report.O17 = { spSameH0: spH0 === "body", spB0part, h0After, b0partAfter, pass: spH0 === "body" && spB0part && h0After === "heading" && b0partAfter };
  }
  // O18：F_b0 を箱全部、明朝に。箱の高さが変われば下が付いてくる・overlaps 空
  { await reset(p); await pause(p, 150); await setDevice(p, "sp"); await pause(p, 200); const b0 = await p.evaluate(() => window.__playground.geometry().F_b0); const belowBefore = await p.evaluate(() => { const g = window.__playground.geometry(); return (g.F_p0 || g.F_h1 || {}).y; });
    await setDevice(p, "pc"); await pause(p, 150); await clickEl(p, "F_b0"); await clickTool(p, '[data-ts="font"]'); await pause(p, 120); await p.evaluate(() => document.querySelector('#fontPop [data-font-opt="heading"]').click()); await pause(p, 250);
    const font = await p.evaluate(() => window.__playground.curFont("F_b0")); const w = await p.evaluate(() => window.__playground.warnings());
    report.O18 = { font, overlapsEmpty: w.overlaps.length === 0, pass: font === "heading" && w.overlaps.length === 0 };
  }
  // O19：写真を選ぶ／F_h0 と F_b0 を Shift で選ぶ／何も選ばない→書体が出ない
  { const fontVisible = () => p.evaluate(() => { const b = document.querySelector('[data-ts="font"]'); return !!(b && b.offsetParent !== null); });
    await reset(p); await pause(p, 150); await clickEl(p, "F_p0"); const photoFont = await fontVisible();
    await clickEl(p, "F_h0"); const c2 = await center(p, "F_b0"); await p.keyboard.down("Shift"); await p.mouse.click(Math.round(c2.x), Math.round(c2.y)); await p.keyboard.up("Shift"); await pause(p, 200);
    const multiFont = await fontVisible();
    const emptyPt = await p.evaluate(() => { const h = document.getElementById("host_feature"); const r = h.getBoundingClientRect(); return { x: Math.round(r.left + 4), y: Math.round(r.top + 4) }; });
    await p.mouse.click(emptyPt.x, emptyPt.y); await pause(p, 150); const noneFont = await fontVisible();
    report.O19 = { photoFontHidden: !photoFont, multiFontHidden: !multiFont, noneFontHidden: !noneFont, pass: !photoFont && !multiFont && !noneFont };
  }
  // O20：高さ1100と800で、特集・品のセクション下端を画面下端に合わせ、下端6上の部品のない所を右クリック→箱が画面内
  { const results = {};
    for (const vh of [1100, 800]) { await p.setViewportSize({ width: 1440, height: vh }); await reset(p); await pause(p, 200);
      for (const sec of ["feature", "items"]) {
        // セクション下端を画面下端へ：host 下端が vh になるまでホイール
        const hostBottom = await p.evaluate((sec) => { const h = document.getElementById("host_" + sec); const r = h.getBoundingClientRect(); return r.bottom; }, sec);
        const delta = Math.round(hostBottom - vh + 2); if (delta !== 0) { await p.mouse.move(720, Math.min(vh - 50, 400)); await p.mouse.wheel(0, delta); await pause(p, 250); }
        // 下端6上の、部品のない所（左端寄り）を右クリック
        const pt = await p.evaluate((sec) => { const h = document.getElementById("host_" + sec); const r = h.getBoundingClientRect(); return { x: Math.round(r.left + 6), y: Math.round(Math.min(r.bottom, window.innerHeight) - 6) }; }, sec);
        await p.mouse.click(pt.x, pt.y, { button: "right" }); await pause(p, 250);
        const box = await p.evaluate(() => { const m = document.getElementById("fmenu"); if (!m.classList.contains("on")) return null; const r = m.getBoundingClientRect(); const tb = document.getElementById("toolbar").getBoundingClientRect().bottom; return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, tb, vw: window.innerWidth, vh: window.innerHeight }; });
        const ok = box && box.top >= box.tb - 0.5 && box.bottom <= box.vh - 8 + 0.5 && box.left >= 8 - 0.5 && box.right <= box.vw - 8 + 0.5;
        results[sec + "_" + vh] = { shown: !!box, ok, box };
        if (vh === 1100 && sec === "feature") await shot(p, "O20.jpg");
        await p.mouse.click(6, 6); await pause(p, 100);
      }
    }
    await p.setViewportSize({ width: 1440, height: 1100 });
    report.O20 = { ...results, pass: Object.values(results).every((r) => r.shown && r.ok) };
  }

  // ===== 試験台19b O21〜O29 =====
  const tbH = () => p.evaluate(() => document.getElementById("toolbar").getBoundingClientRect().height);
  const fb0Y = () => p.evaluate(() => { const el = document.querySelector('[data-el="F_b0"]'); return el ? +el.getBoundingClientRect().top.toFixed(2) : null; });
  const toolLoc = (sel) => p.evaluate((sel) => { const f = document.querySelector(sel); if (!f) return "missing"; return document.getElementById("moreMenu").contains(f) ? "その他" : (f.offsetParent !== null ? "bar" : "hidden"); }, sel);
  const allBtnsInView = () => p.evaluate(() => { const vw = innerWidth; for (const bEl of document.querySelectorAll('#toolbar > button, #toolbar [data-ts], #toolbar #tBright, #toolbar #tElemLink, #toolbar #tMore')) { if (bEl.offsetParent === null) continue; const r = bEl.getBoundingClientRect(); if (r.right > vw + 1 || r.left < -1 || r.bottom > document.getElementById("toolbar").getBoundingClientRect().bottom + 1) return false; } return true; });
  // その他にあればその他を開いてから、道具のボタンを押す
  async function openTool(sel) { const loc = await toolLoc(sel); if (loc === "その他") { await p.evaluate(() => document.getElementById("tMore").click()); await pause(p, 150); } await p.evaluate((sel) => document.querySelector(sel).click(), sel); await pause(p, 200); return loc; }

  // O21：各幅で、何も選ばない→クリック→書き換え の3時点で、並び1段・ページが動かない・全ボタン画面内・書体/リンクが並びかその他に
  { const widths = [1440, 1280, 1180, 1024, 900, 800, 700, 650]; const res = {};
    for (const w of widths) { await p.setViewportSize({ width: w, height: 900 }); await reset(p); await setDevice(p, "pc"); await pause(p, 200);
      await p.evaluate(() => document.querySelector('[data-el="F_b0"]').scrollIntoView({ block: "center" })); await pause(p, 200);
      const cpt = await p.evaluate(() => { const r = document.querySelector('[data-el="F_b0"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
      const h0 = await tbH(), y0 = await fb0Y();
      await p.mouse.click(cpt.x, cpt.y); await pause(p, 160); const h1 = await tbH(), y1 = await fb0Y();   // クリック（スクロールさせない）
      await p.mouse.dblclick(cpt.x, cpt.y); await pause(p, 300); await editSelectText(p, "F_b0", "季節"); const h2 = await tbH(), y2 = await fb0Y();
      const inView = await allBtnsInView(); const fontLoc = await toolLoc('[data-ts="font"]'), linkLoc = await toolLoc('[data-ts="link"]');
      const oneRow = h0 <= 48 && h1 <= 48 && h2 <= 48; const yStable = near(y0, y1, 0.5) && near(y1, y2, 0.5);
      const fontOk = fontLoc === "bar" || fontLoc === "その他"; const linkOk = linkLoc === "bar" || linkLoc === "その他";
      res["w" + w] = { oneRow, h: [h0, h1, h2], yStable, y: [y0, y1, y2], inView, fontLoc, linkLoc, ok: oneRow && yStable && inView && fontOk && linkOk };
      if (w === 1024 || w === 650) await shot(p, "O21-" + w + ".jpg");
      await p.keyboard.press("Escape"); await pause(p, 100);
    }
    await p.setViewportSize({ width: 1440, height: 1100 });
    report.O21 = { ...res, pass: Object.values(res).every((r) => r.ok) };
  }
  // O22：幅800で、書体（在処＝bar/その他）を開いてゴシック／リンクを開いて Instagram。並びから押すのと同じ結果
  { await p.setViewportSize({ width: 800, height: 900 }); await reset(p); await setDevice(p, "pc"); await pause(p, 200);
    await enterEdit(p, "F_b0"); await editSelectText(p, "F_b0", "季節の移ろい");
    const moreShown = await p.evaluate(() => getComputedStyle(document.getElementById("tMore")).display !== "none");
    const studioInMore = (await toolLoc("#tStudio")) === "その他";
    const fontLoc = await openTool('[data-ts="font"]'); await pause(p, 150);
    await p.evaluate(() => document.querySelector('#fontPop [data-font-opt="body"]').click()); await pause(p, 200);
    const fontApplied = await p.evaluate(() => window.__playground.textRuns("F_b0").filter((r) => r.font === "body").map((r) => r.text).join("") === "季節の移ろい");
    await shot(p, "O22.jpg");
    await editSelectText(p, "F_b0", "小さな菓子"); const linkLoc = await openTool('[data-ts="link"]'); await pause(p, 150);
    await clickOpt(p, "Instagram"); await pause(p, 200); await p.keyboard.press("Escape"); await pause(p, 200);
    const linkApplied = await p.evaluate(() => { const r = window.__playground.links("F_b0").runs; return r.length === 1 && r[0].text === "小さな菓子" && r[0].link.kind === "instagram"; });
    report.O22 = { moreShown, studioInMore, fontLoc, fontApplied, linkLoc, linkApplied, pass: moreShown && studioInMore && fontApplied && linkApplied };
    await p.setViewportSize({ width: 1440, height: 1100 });
  }
  // O23：キーボード／マウス相当／Cmd+K の3通りで、一覧の上端=選択下端+8・左端=選択左端
  { const check = async (openFn) => { await reset(p); await pause(p, 120); await enterEdit(p, "F_b0"); const idx = await editSelectText(p, "F_b0", "小さな菓子");
      const selR = await p.evaluate((idx) => window.__playground.editingRangeRect(idx, idx + 5), idx);
      await openFn(); await pause(p, 200);
      const pr = await p.evaluate(() => { const r = document.getElementById("linkPanel").getBoundingClientRect(); return { left: r.left, top: r.top }; });
      await p.keyboard.press("Escape"); await pause(p, 120);
      return { topDelta: +(pr.top - (selR.bottom + 8)).toFixed(1), leftDelta: +(pr.left - selR.left).toFixed(1) }; };
    const kbd = await check(async () => { await clickTool(p, '[data-ts="link"]'); });
    const mouse = await check(async () => { await clickTool(p, '[data-ts="link"]'); });
    const cmdk = await check(async () => { await p.keyboard.press("Meta+k"); });
    await shot(p, "O23.jpg");
    const ok = (d) => near(d.topDelta, 0, 2) && near(d.leftDelta, 0, 2);
    report.O23 = { kbd, mouse, cmdk, pass: ok(kbd) && ok(mouse) && ok(cmdk) };
  }
  // O24：F_b0 下端が画面下端−40 まで下げて選び、一覧が選択の上・並び下〜画面下端−8 に収まる
  { await reset(p); await pause(p, 150); await enterEdit(p, "F_b0"); const idx = await editSelectText(p, "F_b0", "小さな菓子");
    await p.evaluate(() => { const el = document.querySelector('[data-el="F_b0"]'); const r = el.getBoundingClientRect(); const d = r.bottom - (window.innerHeight - 40); window.scrollBy(0, d); }); await pause(p, 250);
    const selR = await p.evaluate((idx) => window.__playground.editingRangeRect(idx, idx + 5), idx);
    await clickTool(p, '[data-ts="link"]'); await pause(p, 200);
    const pr = await p.evaluate(() => { const r = document.getElementById("linkPanel").getBoundingClientRect(); const tb = document.getElementById("toolbar").getBoundingClientRect().bottom; return { top: r.top, bottom: r.bottom, tb, vh: window.innerHeight }; });
    await shot(p, "O24.jpg"); await p.keyboard.press("Escape"); await pause(p, 120);
    report.O24 = { above: pr.bottom <= selR.top + 1, withinTop: pr.top >= pr.tb - 1, withinBottom: pr.bottom <= pr.vh - 8 + 1, pass: pr.bottom <= selR.top + 2 && pr.top >= pr.tb - 1 && pr.bottom <= pr.vh - 8 + 1 };
  }
  // O25：F_p0 を選び「リンク」→ 一覧が写真のすぐ下（入らなければ上）・画面の中（写真を上寄せして下に場所を作る）
  { await reset(p); await pause(p, 150); await p.evaluate(() => { const el = document.querySelector('[data-el="F_p0"]'); el.scrollIntoView({ block: "start" }); window.scrollBy(0, -60); }); await pause(p, 200);
    const c = await p.evaluate(() => { const r = document.querySelector('[data-el="F_p0"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
    await p.mouse.click(c.x, c.y); await pause(p, 160); await p.evaluate(() => document.getElementById("tElemLink").click()); await pause(p, 200);
    const info = await p.evaluate(() => { const pn = document.getElementById("linkPanel").getBoundingClientRect(); const ph = document.querySelector('[data-el="F_p0"]').getBoundingClientRect(); const tb = document.getElementById("toolbar").getBoundingClientRect().bottom; return { pTop: pn.top, pBottom: pn.bottom, pLeft: pn.left, pRight: pn.right, phBottom: ph.bottom, phTop: ph.top, phLeft: ph.left, tb, vw: innerWidth, vh: innerHeight }; });
    const below = near(info.pTop, info.phBottom + 8, 3), above = near(info.pBottom, info.phTop - 8, 3);
    const inView = info.pTop >= info.tb - 1 && info.pBottom <= info.vh - 8 + 1 && info.pLeft >= 8 - 1 && info.pRight <= info.vw - 8 + 1;
    report.O25 = { below, above, inView, pass: (below || above) && inView };
    await p.keyboard.press("Escape"); await pause(p, 120);
  }
  // O26：F_h0 書体→ゴシックに乗せる→マウス動かさず Esc→見え方が乗せる前と同じ
  { await reset(p); await pause(p, 150); await clickEl(p, "F_h0");
    const before = await p.evaluate(() => getComputedStyle(document.querySelector('[data-el="F_h0"]')).fontFamily);
    await clickTool(p, '[data-ts="font"]'); await pause(p, 150); await p.hover('#fontPop [data-font-opt="body"]'); await pause(p, 200);
    const during = await p.evaluate(() => getComputedStyle(document.querySelector('[data-el="F_h0"]')).fontFamily);
    await p.keyboard.press("Escape"); await pause(p, 200);   // マウスは動かさない
    const after = await p.evaluate(() => getComputedStyle(document.querySelector('[data-el="F_h0"]')).fontFamily);
    report.O26 = { previewed: /Gothic/.test(during), restored: after === before, popClosed: await p.evaluate(() => !document.getElementById("fontPop").classList.contains("on")), pass: /Gothic/.test(during) && after === before };
  }
  // O27：F_p0 明るさ→+40に乗せる→マウス動かさず Esc→見え方が乗せる前と同じ
  { await reset(p); await pause(p, 150); await clickEl(p, "F_p0");
    const before = await p.evaluate(() => document.querySelector('[data-el="F_p0"]').style.filter || "");
    await p.evaluate(() => document.getElementById("tBright").click()); await pause(p, 200);
    await p.hover('#brightPop [data-bright="40"]'); await pause(p, 200);
    const during = await p.evaluate(() => document.querySelector('[data-el="F_p0"]').style.filter || "");
    await p.keyboard.press("Escape"); await pause(p, 200);
    const after = await p.evaluate(() => document.querySelector('[data-el="F_p0"]').style.filter || "");
    report.O27 = { previewed: /brightness/.test(during), restored: after === before, pass: /brightness/.test(during) && after === before };
  }
  // O28：中のコピーは見た目・リンクを引き継ぐ（大きさは貼り先）。戻すで貼る前に戻る
  { await reset(p); await pause(p, 150); await enterEdit(p, "F_b0");
    await editSelectText(p, "F_b0", "小さな菓子"); await p.evaluate(() => window.__playground.applyPartStyle("link", { kind: "instagram" }));
    await editSelectText(p, "F_b0", "季節"); await p.evaluate(() => window.__playground.applyPartStyle("bold")); await p.evaluate(() => window.__playground.applyPartStyle("color", "#C03030"));
    const copyText = "季節の移ろいを、小さな菓子"; await editSelectText(p, "F_b0", copyText); await p.keyboard.press("Meta+c"); await pause(p, 150);
    await p.keyboard.press("Escape"); await pause(p, 200);
    await enterEdit(p, "F_b1"); const L = (await textOf(p, "F_b1")).length; await p.evaluate((L) => window.__playground.editSelect(L, L), L); await pause(p, 120);
    await p.evaluate((t) => { const n = document.querySelector('[data-el="F_b1"][contenteditable]'); window.__lastPlain = t; const dt = new DataTransfer(); dt.setData("text/plain", t); n.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, copyText); await pause(p, 250);
    const runs = await p.evaluate(() => window.__playground.textRuns("F_b1").map((r) => ({ t: r.text, b: !!r.bold, c: r.color || null, lk: r.link ? r.link.kind : null, sc: r.scale || 1 })));
    const kiset = runs.find((r) => r.t.includes("季節") && r.b && r.c === "#C03030");
    const kashi = runs.find((r) => r.t === "小さな菓子" && r.lk === "instagram");
    const noScale = runs.every((r) => r.sc === 1);
    await p.evaluate(() => window.__playground.editingUndoAutoLink ? null : null);
    await p.keyboard.press("Meta+z"); await pause(p, 200);
    const afterUndo = await textOf(p, "F_b1"); const back = !afterUndo.includes("小さな菓子");
    report.O28 = { kisetBoldRed: !!kiset, kashiLinked: !!kashi, sizeOfTarget: noScale, undoBack: back, pass: !!kiset && !!kashi && noScale && back };
    await p.keyboard.press("Escape"); await pause(p, 120);
  }
  // O29：よそからの貼り付け（text/html に太字・リンク）は文字だけ
  { await reset(p); await pause(p, 150); await enterEdit(p, "F_b1"); const L = (await textOf(p, "F_b1")).length; await p.evaluate((L) => window.__playground.editSelect(L, L), L); await pause(p, 120);
    await p.evaluate(() => { const n = document.querySelector('[data-el="F_b1"][contenteditable]'); window.__lastPlain = "太字リンク"; const dt = new DataTransfer(); dt.setData("text/plain", "太字リンク"); dt.setData("text/html", '<b>太字</b><a href="https://example.com">リンク</a>'); n.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }); await pause(p, 250);
    const runs = await p.evaluate(() => window.__playground.textRuns("F_b1").map((r) => ({ t: r.text, b: !!r.bold, lk: r.link ? r.link.kind : null })));
    const hasPlain = (await textOf(p, "F_b1")).includes("太字リンク"); const anyStyle = runs.some((r) => r.b || r.lk);
    report.O29 = { hasPlain, noStyle: !anyStyle, pass: hasPlain && !anyStyle };
    await p.keyboard.press("Escape"); await pause(p, 120);
  }

  report._errs = errs.slice(0, 8);
  await browser.close();
}
await run();
fs.writeFileSync(path.join(here, "_verify_o.json"), JSON.stringify(report, null, 2));
console.log("=== 試験台19 O1〜O20 ===");
for (const k of Object.keys(report)) if (!k.startsWith("_")) console.log(k + ": " + (report[k].pass ? "OK" : "NG") + " " + JSON.stringify(report[k]));
if (report._errs && report._errs.length) console.log("ERRORS: " + JSON.stringify(report._errs));
