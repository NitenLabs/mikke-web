// 要素ごとの追加実測（report の集計に無い位置・飾りの値）。node refs/k-innovation-inc/measure-elements.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = 'https://k-innovation-inc.com/';
const out = 'refs/k-innovation-inc';
const VP = { pc: { width: 1440, height: 900 }, sp: { width: 390, height: 844 } };
const browser = await chromium.launch();
for (const [name, viewport] of Object.entries(VP)) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: name === 'sp', hasTouch: name === 'sp', locale: 'ja-JP' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => document.body.innerText.length > 200 && document.documentElement.scrollHeight > 2000, null, { timeout: 20000 }).catch(() => console.log('待ち切れ', name));
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 160)); }
    scrollTo(0, 0); await new Promise(r => setTimeout(r, 500));
  });
  const data = await page.evaluate(() => {
    const R = n => Math.round(n * 10) / 10;
    const hex = c => { const m = c.match(/[\d.]+/g); if (!m || (m[3] !== undefined && +m[3] === 0)) return null; return '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('').toUpperCase() + (m[3] !== undefined && +m[3] < 1 ? '@' + m[3] : ''); };
    const rows = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const before = getComputedStyle(el, '::before');
      const hasImg = el.tagName === 'IMG' || cs.backgroundImage.includes('url(') || before.backgroundImage.includes('url(');
      const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join('');
      const bg = hex(cs.backgroundColor);
      const bw = ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs['border' + s + 'Width']));
      const border = bw.some(v => v > 0) ? bw.join('/') + ' ' + hex(cs.borderTopColor || cs.borderBottomColor) : null;
      const special = ['IFRAME', 'A', 'BUTTON'].includes(el.tagName);
      if (!own && !hasImg && !bg && !border && !special) continue;
      const row = { t: el.tagName.toLowerCase(), x: R(r.left + scrollX), y: R(r.top + scrollY), w: R(r.width), h: R(r.height), pos: cs.position === 'fixed' ? 'fixed' : undefined };
      if (own) Object.assign(row, { len: own.length, jp: /[぀-ヿ一-龯]/.test(own), s: parseFloat(cs.fontSize), lh: cs.lineHeight, ls: cs.letterSpacing, wt: cs.fontWeight, f: cs.fontFamily.split(',')[0].replace(/"/g, ''), c: hex(cs.color), al: cs.textAlign, wm: cs.writingMode === 'horizontal-tb' ? undefined : cs.writingMode, tt: el.tagName === 'I' ? own : undefined });
      if (hasImg) { row.img = 1; row.fit = cs.objectFit !== 'fill' ? cs.objectFit : cs.backgroundSize; }
      if (bg) row.bg = bg;
      if (border) row.b = border;
      if (cs.borderRadius !== '0px') row.rad = cs.borderRadius;
      if (cs.opacity !== '1') row.op = cs.opacity;
      if (cs.filter !== 'none') row.fil = cs.filter;
      if (cs.animationName !== 'none') row.anim = cs.animationName + ' ' + cs.animationDuration;
      rows.push(row);
    }
    return { docH: document.documentElement.scrollHeight, rows };
  });
  fs.writeFileSync(`${out}/elements-${name}.json`, JSON.stringify(data, null, 0).replace(/\},\{/g, '},\n{'));
  console.log(name, data.docH, data.rows.length);
  await ctx.close();
}
await browser.close();
