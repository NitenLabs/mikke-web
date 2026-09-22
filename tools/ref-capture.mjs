#!/usr/bin/env node
// 参考サイトの撮影と実測（芦屋みっけ：参考サイト分析キット）
// 使い方: node tools/ref-capture.mjs <URL> [出力フォルダ]
//   例:   node tools/ref-capture.mjs https://example.com refs/example
// 出力:   report.md（Claudeに読ませる要約）/ measure-pc.json・measure-sp.json（実測の全データ）
//         overview-pc.jpg・overview-sp.jpg（縮小した全体像）/ sec-pc-01.jpg …（セクションごとの切り抜き）
// 事前準備: npm i -D playwright && npx playwright install chromium
//   ブラウザの場所を指定したい場合は CHROME_PATH 環境変数を使う
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('playwright-core')); }

const url = process.argv[2];
if (!url) { console.error('使い方: node tools/ref-capture.mjs <URL> [出力フォルダ]'); process.exit(1); }
const slug = new URL(url).hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '_');
const out = process.argv[3] || path.join('refs', slug);
fs.mkdirSync(out, { recursive: true });

const VIEWPORTS = { pc: { width: 1440, height: 900 }, sp: { width: 390, height: 844 } };
const MAX_CROP_H = 1400;   // 1枚の切り抜きの最大の高さ（これを超えるセクションは上部だけ）
const OVERVIEW_W = 360;    // 全体像の縮小幅

// ---------- ブラウザ内で実行する実測（要約してから返す） ----------
const MEASURE = () => {
  const vw = innerWidth, vh = innerHeight, docH = document.documentElement.scrollHeight;
  const cs = el => getComputedStyle(el);
  const r0 = v => Math.round(parseFloat(v) || 0);
  const r2 = v => Math.round(v * 100) / 100;
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; };
  const visible = el => { const r = el.getBoundingClientRect(); const s = cs(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const inc = (map, k, v = 1) => map.set(k, (map.get(k) || 0) + v);
  const hex = c => { const m = c.match(/[\d.]+/g); if (!m) return c; const [r, g, b, a = 1] = m.map(Number); if (a < 0.05) return 'transparent'; const h = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase(); return a < 1 ? `${h}/${r2(a)}` : h; };
  const firstFont = f => f.split(',')[0].replace(/["']/g, '').trim();
  const all = [...document.querySelectorAll('body *')].filter(visible);

  // 文字：直接テキストを持つ要素を、大きさ・太さ・書体でまとめる
  const typo = new Map(), textColors = new Map();
  for (const el of all) {
    const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (t.length < 2) continue;
    const s = cs(el), size = r0(s.fontSize), lh = s.lineHeight === 'normal' ? 'normal' : r2(parseFloat(s.lineHeight) / parseFloat(s.fontSize));
    const ls = r2((parseFloat(s.letterSpacing) || 0) / parseFloat(s.fontSize));
    const key = [size, s.fontWeight, firstFont(s.fontFamily), lh, ls, s.writingMode !== 'horizontal-tb' ? 'vertical' : ''].join('|');
    const cur = typo.get(key) || { n: 0, chars: 0, tags: new Set() };
    cur.n++; cur.chars += t.length; cur.tags.add(el.tagName.toLowerCase()); typo.set(key, cur);
    inc(textColors, hex(s.color), t.length);
  }
  const typeRows = [...typo.entries()].map(([k, v]) => { const [size, weight, font, lh, ls, vert] = k.split('|'); return { size: +size, weight, font, lh, ls: +ls, vert, n: v.n, chars: v.chars, tags: [...v.tags].slice(0, 4).join(' ') }; });
  const bodyRow = typeRows.slice().sort((a, b) => b.chars - a.chars)[0];
  const typeScale = typeRows.filter(r => r.chars > 10 || r.size >= (bodyRow ? bodyRow.size * 1.2 : 20))
    .sort((a, b) => b.size - a.size).slice(0, 12)
    .map(r => ({ ...r, ratio: bodyRow ? r2(r.size / bodyRow.size) : null }));

  // 背景：幅の広いブロックの背景色を面積で集計
  const bgs = new Map();
  for (const el of all) { const s = cs(el); const b = hex(s.backgroundColor); if (b === 'transparent') continue; const r = el.getBoundingClientRect(); if (r.width < vw * 0.5) continue; inc(bgs, b, Math.round(r.width * r.height / 1000)); }

  // コンテンツ幅：左右の余白がほぼ等しいブロックの幅の最頻値
  const widths = new Map();
  for (const el of all) { const r = el.getBoundingClientRect(); if (r.height < 60 || r.width >= vw - 2 || r.width < vw * 0.4) continue; const l = r.left, rr = vw - r.right; if (Math.abs(l - rr) <= 2) inc(widths, Math.round(r.width)); }
  const containerW = top(widths, 3).map(([w, n]) => ({ w, sideMargin: Math.round((vw - w) / 2), n }));

  // グリッド：横に並ぶ子要素の列数と間隔
  const grids = new Map();
  for (const el of all) {
    const s = cs(el); if (!/grid|flex/.test(s.display)) continue;
    const kids = [...el.children].filter(visible); if (kids.length < 2) continue;
    const rs = kids.map(k => k.getBoundingClientRect()); const y0 = rs[0].top;
    const row = rs.filter(r => Math.abs(r.top - y0) < 4); if (row.length < 2) continue;
    const w = el.getBoundingClientRect().width; if (w < vw * 0.4) continue;
    const gap = Math.round(row[1].left - row[0].right); const cw = Math.round(row[0].width);
    if (gap < 0 || gap > 160 || cw < 60) continue;
    inc(grids, `${row.length}列|幅${Math.round(w)}|列幅${cw}|間隔${gap}|${s.display}`);
  }

  // セクション：全幅に近いブロックのうち、同じ階層に複数並んでいる層を採用
  const cands = all.filter(el => { const r = el.getBoundingClientRect(); return r.width >= vw * 0.9 && r.height >= 120; });
  const byParent = new Map(); cands.forEach(el => { const p = el.parentElement; byParent.set(p, (byParent.get(p) || []).concat(el)); });
  let best = []; for (const [, list] of byParent) { const h = list.reduce((a, el) => a + el.getBoundingClientRect().height, 0); if (list.length >= 3 && h > (best.h || 0)) { best = list; best.h = h; } }
  if (best.length < 3) {
    // 全幅のブロックがないページ（中央寄せの細い構成など）：単独の包みを降りて、子が3つ以上並ぶ層を使う
    let node = document.body;
    for (let d = 0; d < 12; d++) {
      const kids = [...node.children].filter(k => visible(k) && k.getBoundingClientRect().height >= 60);
      if (kids.length >= 3) { best = kids; break; }
      if (!kids.length) break;
      node = kids.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    }
  }
  const sections = best.map(el => {
    const s = cs(el), r = rect(el);
    const imgs = [...el.querySelectorAll('img,video,picture,svg')].filter(i => { const b = i.getBoundingClientRect(); return b.width > 150 && b.height > 100; });
    const bigImg = imgs.some(i => i.getBoundingClientRect().width >= vw * 0.9) || (s.backgroundImage.startsWith('url') && r.w >= vw * 0.9);
    const heading = el.querySelector('h1,h2,h3');
    const chars = (el.innerText || '').replace(/\s/g, '').length;
    return { y: Math.round(r.y), h: Math.round(r.h), bg: hex(s.backgroundColor), bgImage: s.backgroundImage.startsWith('url'), fullBleedImage: bigImg, images: imgs.length,
      pt: r0(s.paddingTop), pb: r0(s.paddingBottom), chars, heading: heading ? heading.innerText.trim().slice(0, 24) : '', tag: el.tagName.toLowerCase() };
  }).sort((a, b) => a.y - b.y);

  // 写真：比率・角丸・トリミングを集計
  const ratios = new Map(), radii = new Map();
  let fullBleed = 0;
  for (const el of all.filter(e => /^(IMG|VIDEO|PICTURE)$/.test(e.tagName) || cs(e).backgroundImage.startsWith('url'))) {
    const r = el.getBoundingClientRect(); if (r.width < 80 || r.height < 60) continue;
    const q = r.width / r.height;
    const near = [[1, '1:1'], [4 / 3, '4:3'], [3 / 4, '3:4'], [3 / 2, '3:2'], [2 / 3, '2:3'], [16 / 9, '16:9'], [9 / 16, '9:16'], [2.35, '2.35:1'], [5 / 4, '5:4'], [4 / 5, '4:5']].reduce((b, c) => Math.abs(c[0] - q) < Math.abs(b[0] - q) ? c : b);
    inc(ratios, Math.abs(near[0] - q) < 0.06 ? near[1] : `${r2(q)}:1`);
    inc(radii, cs(el).borderRadius === '0px' ? '0' : cs(el).borderRadius);
    if (r.width >= vw * 0.95) fullBleed++;
  }

  // ボタン
  const btns = new Map();
  for (const el of all.filter(e => /^(A|BUTTON)$/.test(e.tagName))) {
    const s = cs(el), r = el.getBoundingClientRect(); if (r.height < 28 || r.height > 90 || r.width < 60) continue;
    const bg = hex(s.backgroundColor), bd = r0(s.borderTopWidth) ? `${r0(s.borderTopWidth)}px ${hex(s.borderTopColor)}` : 'なし';
    if (bg === 'transparent' && bd === 'なし') continue;
    inc(btns, `高さ${Math.round(r.height)}|角丸${s.borderRadius}|背景${bg}|枠${bd}|文字${r0(s.fontSize)}px/${s.fontWeight}`);
  }

  // ヘッダー
  const hd = document.querySelector('header') || all.find(e => /fixed|sticky/.test(cs(e).position) && e.getBoundingClientRect().width > vw * 0.9 && e.getBoundingClientRect().height < 160);
  const header = hd ? (() => { const s = cs(hd); return { h: Math.round(hd.getBoundingClientRect().height), position: s.position, bg: hex(s.backgroundColor), links: hd.querySelectorAll('a').length }; })() : null;

  // 余白のリズム：兄弟要素どうしの縦の間隔
  const gaps = new Map();
  for (const el of all) { const kids = [...el.children].filter(visible); for (let i = 1; i < kids.length; i++) { const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect(); const g = Math.round(b.top - a.bottom); if (g > 0 && g < 400 && Math.abs(a.left - b.left) < 4) inc(gaps, Math.round(g / 4) * 4); } }

  // 目視で確認すべき表現（件数と代表例だけ）
  const extras = { shadows: new Map(), gradients: 0, vertical: 0, animations: 0, fixedSmall: [] };
  for (const el of all) { const s = cs(el);
    if (s.boxShadow !== 'none') inc(extras.shadows, s.boxShadow.slice(0, 60));
    if (/gradient/.test(s.backgroundImage)) extras.gradients++;
    if (s.writingMode !== 'horizontal-tb') extras.vertical++;
    if (s.animationName !== 'none') extras.animations++;
    if (s.position === 'fixed' && el.getBoundingClientRect().width < vw * 0.7 && el.getBoundingClientRect().height > 20 && extras.fixedSmall.length < 4) extras.fixedSmall.push((el.innerText || el.tagName).trim().slice(0, 16)); }

  // 品質の警告（撮影・実測が不完全な可能性）
  const flags = [];
  const notLoaded = [...document.images].filter(i => i.getBoundingClientRect().width > 80 && (!i.complete || i.naturalWidth === 0)).length;
  if (notLoaded) flags.push(`読み込まれていない写真が${notLoaded}枚あります`);
  const ghost = all.filter(el => { const s = cs(el), r = el.getBoundingClientRect(); return parseFloat(s.opacity) < 0.1 && r.width > 100 && r.height > 40 && !el.closest('[aria-hidden="true"]'); }).length;
  if (ghost) flags.push(`透明のままの要素が${ghost}個あります（スクロールで表示する演出の取り残しの可能性）`);
  const brokenCss = [...document.querySelectorAll('link[rel=stylesheet]')].filter(l => !l.sheet).length;
  if (brokenCss) flags.push(`読み込めないスタイルシートが${brokenCss}件あります（見た目が崩れた状態で実測している可能性。Chromeで確認）`);
  if (document.fonts && document.fonts.status !== 'loaded') flags.push('フォントの読み込みが完了していません');
  if (sections.length < 2) flags.push('セクションを判定できませんでした（切り抜きは全体像で代用）');
  if (docH < vh * 1.5) flags.push('ページが極端に短い（ブロック・同意画面・別ページの可能性）');
  for (let i = 1; i < sections.length; i++) { const a = sections[i - 1], b = sections[i]; if (a.fullBleedImage && b.fullBleedImage && Math.abs(a.y + a.h - b.y) < 4) flags.push(`全面写真のセクションが隣接しています（${i}と${i + 1}）`); }

  return { vw, docH, title: document.title.slice(0, 40), lang: document.documentElement.lang,
    typeScale, bodyText: bodyRow || null, textColors: top(textColors, 6), bgs: top(bgs, 8), containerW,
    grids: top(grids, 8), sections, photoRatios: top(ratios, 8), photoRadius: top(radii, 5), fullBleedPhotos: fullBleed,
    buttons: top(btns, 5), header, rhythm: top(gaps, 10),
    extras: { shadows: top(extras.shadows, 3), gradients: extras.gradients, vertical: extras.vertical, animations: extras.animations, fixedSmall: extras.fixedSmall }, flags };
};

// 同意画面など、画面を大きく覆う固定要素を撮影前に隠す（押して同意はしない）
const HIDE_OVERLAYS = () => {
  const vw = innerWidth, vh = innerHeight, hidden = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el); if (!/fixed|sticky/.test(s.position)) continue;
    const r = el.getBoundingClientRect(); const area = r.width * r.height / (vw * vh);
    const txt = (el.innerText || '').slice(0, 300);
    if (area > 0.25 && r.height > vh * 0.3 || /cookie|consent|クッキー|同意/i.test(txt) && area > 0.05) {
      el.style.setProperty('display', 'none', 'important');
      const label = txt.slice(0, 30).replace(/\s+/g, ' ').trim();
      // 文字のない覆い（全面の画像スプラッシュなど）は、隠したものが本文でないか判断できるよう、大きさと写真の有無を出す
      const hasPhoto = !!el.querySelector('img,video,picture,svg') || s.backgroundImage.startsWith('url');
      hidden.push(label || `文字なし ${Math.round(r.width)}×${Math.round(r.height)} ${hasPhoto ? '写真あり' : '写真なし'}`);
    }
  }
  document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto';
  return hidden;
};

async function slowScroll(page) {
  await page.evaluate(async () => {
    const step = innerHeight * 0.7;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise(r => setTimeout(r, 160)); }
    scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 400));
    scrollTo(0, 0); await new Promise(r => setTimeout(r, 300));
  });
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const results = {};
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: name === 'sp', hasTouch: name === 'sp', locale: 'ja-JP',
    userAgent: name === 'sp' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
  const page = await ctx.newPage();
  let status = 0;
  try { const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); status = res ? res.status() : 0; }
  catch { try { const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 }); status = res ? res.status() : 0; } catch (e) { console.error(`[${name}] 開けませんでした: ${e.message}`); await ctx.close(); continue; } }
  await page.waitForTimeout(800);
  const hidden = await page.evaluate(HIDE_OVERLAYS);
  await slowScroll(page);
  await page.evaluate(() => document.fonts ? document.fonts.ready.then(() => 1) : 1);
  await page.waitForTimeout(600);
  const m = await page.evaluate(MEASURE);
  m.status = status; m.hiddenOverlays = hidden;
  if (status >= 400) m.flags.unshift(`HTTP ${status} が返りました`);
  if (hidden.length) m.flags.push(`撮影のため覆いを${hidden.length}件隠しました（${hidden.join(' / ')}）`);

  // 全体像（ページ全体を撮り、縮小して保存）
  const full = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
  const thumb = await browser.newPage({ viewport: { width: OVERVIEW_W, height: 400 } });
  await thumb.setContent(`<body style="margin:0"><img id="i" style="width:${OVERVIEW_W}px;display:block" src="data:image/jpeg;base64,${full.toString('base64')}"></body>`);
  await thumb.waitForFunction(() => document.getElementById('i').complete);
  await thumb.screenshot({ path: path.join(out, `overview-${name}.jpg`), fullPage: true, type: 'jpeg', quality: 60 });
  await thumb.close();

  // セクションごとの切り抜き
  m.sections.forEach((s, i) => s.crop = `sec-${name}-${String(i + 1).padStart(2, '0')}.jpg`);
  for (const s of m.sections) {
    const h = Math.min(s.h, MAX_CROP_H); if (h < 20) continue;
    await page.screenshot({ path: path.join(out, s.crop), fullPage: true, type: 'jpeg', quality: 60, clip: { x: 0, y: s.y, width: vp.width, height: h } }).catch(() => { s.crop = ''; });
  }
  fs.writeFileSync(path.join(out, `measure-${name}.json`), JSON.stringify(m));
  results[name] = m;
  await ctx.close();
}
await browser.close();

// ---------- report.md（Claudeに読ませる要約） ----------
const L = [];
const kv = arr => arr.map(([k, n]) => `${k}（${n}）`).join('、') || 'なし';
L.push(`# 参考サイト実測レポート`, '', `- URL: ${url}`, `- 取得日: ${new Date().toISOString().slice(0, 10)}`, `- 注意: 見出しの文字列は対応づけのためだけに載せている。参考サイトの文章・写真・名前は制作物に使わない`, '');
for (const [name, m] of Object.entries(results)) {
  L.push(`## ${name === 'pc' ? 'PC（幅1440）' : 'スマホ（幅390）'}`, '');
  L.push(`**警告**: ${m.flags.length ? m.flags.join(' ／ ') : 'なし'}`, '');
  L.push(`- ページの高さ ${m.docH}px、セクション ${m.sections.length}個、全面写真 ${m.fullBleedPhotos}枚`);
  L.push(`- コンテンツ幅: ${m.containerW.map(c => `${c.w}px（左右${c.sideMargin}px、${c.n}箇所）`).join('、') || '判定できず'}`);
  L.push(`- ヘッダー: ${m.header ? `高さ${m.header.h}px ${m.header.position} 背景${m.header.bg} リンク${m.header.links}個` : 'なし'}`);
  L.push(`- 文字の色: ${kv(m.textColors)}`, `- 背景の色（面積順）: ${kv(m.bgs)}`);
  L.push(`- 写真の比率: ${kv(m.photoRatios)} ／ 角丸: ${kv(m.photoRadius)}`);
  L.push(`- 余白のリズム（縦の間隔px）: ${kv(m.rhythm)}`);
  L.push(`- グリッド: ${kv(m.grids)}`);
  L.push(`- ボタン: ${kv(m.buttons)}`);
  const x = m.extras; L.push(`- 目視候補: 影 ${kv(x.shadows)} ／ グラデーション${x.gradients} ／ 縦書き${x.vertical} ／ アニメーション${x.animations} ／ 固定の小要素 ${x.fixedSmall.join('、') || 'なし'}`, '');
  L.push(`### 文字の階層（本文 = ${m.bodyText ? `${m.bodyText.size}px ${m.bodyText.font} 行間${m.bodyText.lh}` : '不明'}）`, '', '| 大きさ | 本文比 | 太さ | 書体 | 行間 | 字間(em) | 量 | 要素 |', '|---|---|---|---|---|---|---|---|');
  m.typeScale.forEach(t => L.push(`| ${t.size}px${t.vert ? '（縦）' : ''} | ${t.ratio} | ${t.weight} | ${t.font} | ${t.lh} | ${t.ls} | ${t.chars}字 | ${t.tags} |`));
  L.push('', '### セクション', '', '| # | 上端 | 高さ | 背景 | 写真 | 全面 | 上/下余白 | 文字量 | 見出し | 画像 |', '|---|---|---|---|---|---|---|---|---|---|');
  m.sections.forEach((s, i) => L.push(`| ${i + 1} | ${s.y} | ${s.h} | ${s.bg}${s.bgImage ? '+画像' : ''} | ${s.images} | ${s.fullBleedImage ? '○' : ''} | ${s.pt}/${s.pb} | ${s.chars} | ${s.heading.replace(/\|/g, '')} | ${s.crop || ''} |`));
  L.push('');
}
fs.writeFileSync(path.join(out, 'report.md'), L.join('\n'));
const flagCount = Object.values(results).reduce((a, m) => a + m.flags.length, 0);
console.log(`完了: ${out}/report.md （警告 ${flagCount}件）`);
