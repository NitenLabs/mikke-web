#!/usr/bin/env node
// 参考サイト分析キット：機械でできる照合（Claudeには結果の要約だけを見せる）
//   node tools/ref-verify.mjs terms  <置換表.md> <確認するフォルダやファイル...>   参考サイトの業種語・固有名の取り残し
//   node tools/ref-verify.mjs photos <写真リスト.txt> [写真台帳.csv]              写真URLの疎通と、台帳との重複
//   node tools/ref-verify.mjs ledger <写真リスト.txt> <写真台帳.csv> <テンプレート名>  使った写真を台帳に追記
//   node tools/ref-verify.mjs table  <差別化テーブル.md>                           差別化テーブルの空欄
// 写真リストは1行に「ラベル URL」。台帳は「photo_id,template,date」のCSV。
// 置換表は「| 参考サイトの語 | 置き換え後 |」の表（1列目を検出対象にする）。1列目が空・見出し行は無視。
// 終了コード：問題なし 0、問題あり 1
import fs from 'node:fs';
import path from 'node:path';

const [cmd, ...args] = process.argv.slice(2);
const read = f => fs.readFileSync(f, 'utf8');
const TEXT_EXT = /\.(html?|astro|mdx?|jsx?|tsx?|vue|json|css|txt|ya?ml)$/i;
const walk = p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(n => !/^(node_modules|\.git|dist)$/.test(n)).flatMap(n => walk(path.join(p, n))) : (TEXT_EXT.test(p) ? [p] : []);
const photoId = u => { const m = u.match(/photo-[\w-]+/) || u.match(/pexels\.com\/photos\/(\d+)/) || u.match(/pixabay\.com\/.*?(\d{5,})/); return m ? m[0].replace(/^.*\//, '') : u.split('?')[0]; };
const photos = f => read(f).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => { const i = l.lastIndexOf(' '); return { label: l.slice(0, i).trim() || '(ラベルなし)', url: l.slice(i + 1) }; });
let bad = 0;

if (cmd === 'terms') {
  const [table, ...targets] = args;
  const terms = read(table).split('\n').filter(l => l.trim().startsWith('|')).map(l => l.split('|')[1]?.trim()).filter(t => t && !/^[-:\s]+$/.test(t) && !/^(参考サイトの語|語|元の語)$/.test(t));
  const files = targets.flatMap(walk);
  for (const f of files) read(f).split('\n').forEach((line, i) => { for (const t of terms) if (line.toLowerCase().includes(t.toLowerCase())) { bad++; if (bad <= 30) console.log(`残り: 「${t}」 ${f}:${i + 1}`); } });
  console.log(bad ? `業種語・固有名の取り残し ${bad}件（${terms.length}語 × ${files.length}ファイルを照合）` : `取り残しなし（${terms.length}語 × ${files.length}ファイルを照合）`);
} else if (cmd === 'photos') {
  const [list, ledger] = args; const ps = photos(list);
  const used = ledger && fs.existsSync(ledger) ? new Map(read(ledger).split('\n').slice(1).filter(Boolean).map(l => { const [id, tpl] = l.split(','); return [id, tpl]; })) : new Map();
  const seen = new Set();
  const res = await Promise.all(ps.map(async p => { try { let r = await fetch(p.url, { method: 'HEAD', redirect: 'follow' }); if (r.status === 405) r = await fetch(p.url, { redirect: 'follow' }); return r.status; } catch { return 0; } }));
  ps.forEach((p, i) => { const id = photoId(p.url);
    if (res[i] !== 200) { bad++; console.log(`NG ${p.label}: HTTP ${res[i] || '接続できず'}`); }
    if (used.has(id)) { bad++; console.log(`重複 ${p.label}: ${id} はテンプレート「${used.get(id)}」で使用済み`); }
    if (seen.has(id)) { bad++; console.log(`重複 ${p.label}: ${id} がこのリスト内で2回使われています`); } seen.add(id); });
  console.log(bad ? `写真の問題 ${bad}件（${ps.length}枚を確認）` : `全${ps.length}枚 正常・重複なし`);
} else if (cmd === 'ledger') {
  const [list, ledger, tpl] = args; if (!tpl) { console.error('テンプレート名を指定してください'); process.exit(1); }
  if (!fs.existsSync(ledger)) fs.writeFileSync(ledger, 'photo_id,template,date\n');
  const today = new Date().toISOString().slice(0, 10);
  const rows = photos(list).map(p => `${photoId(p.url)},${tpl},${today}`);
  fs.appendFileSync(ledger, rows.join('\n') + '\n'); console.log(`台帳に${rows.length}件を追記しました`);
} else if (cmd === 'table') {
  const lines = read(args[0]).split('\n'); let header = null;
  lines.forEach((l, i) => { if (!l.trim().startsWith('|')) { header = null; return; } const cells = l.split('|').slice(1, -1).map(c => c.trim());
    if (cells.every(c => /^[-:\s]*$/.test(c))) return; if (!header) { header = cells; return; }
    cells.forEach((c, j) => { if (!c || /^(\?|？|TBD|未定|-)$/.test(c)) { bad++; console.log(`空欄: ${i + 1}行目「${cells[0]}」の「${header[j] || j + 1 + '列目'}」`); } }); });
  console.log(bad ? `差別化テーブルの空欄 ${bad}件` : '差別化テーブルに空欄なし');
} else {
  console.log('使い方: node tools/ref-verify.mjs terms|photos|ledger|table ...（詳細はファイル冒頭）'); process.exit(1);
}
process.exit(bad ? 1 : 0);
