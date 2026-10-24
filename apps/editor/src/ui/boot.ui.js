// 起動（スマホの判定・PG.boot）
// 線：共通｜画面のつなぎ（ui/ のファイルは上から順に1つのスクリプトとして走る。並びは src/parts.mjs）
document.body.classList.toggle("pg-phone", isPhone());
if(isPhone()){ PG.setDevice("sp"); document.getElementById("dSP").classList.add("on"); document.getElementById("dPC").classList.remove("on"); }

// §22 §2 保存：IndexedDB から下書きを復元してから描く（無ければテンプレ）。復元後の「戻す」は空から
if(PG.boot) PG.boot(); else PG.render();

