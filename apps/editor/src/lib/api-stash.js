// 手元の一時置き場（M3b）。ApiStore（lib/api-store.js）だけが使う。LocalStore の IndexedDB（mikke-editor）とは別の箱にする
// （確認スクリプトが mikke-editor の中を見る・消すので、混ぜない）。
//   draft|<API>|<お店>        ログインが切れたときに退避した下書き {at, user, site:{draft, base}, shop:{data, base}}（base＝退避したときに持っていた版番号）
//   photo|<API>|<お店>|<ID>   まだ上げ終わっていない写真 {dataUrl, at}（上がったら消す。読み込み直したら上げ直す）
// IndexedDB が使えないブラウザ（プライベートなど）では、何もしない（読むと空）。
const DB_NAME = "mikke-api-stash", STORE = "kv";
let dbP = null;

function db() {
  if (!dbP) dbP = new Promise((res) => {
    let q; try { q = indexedDB.open(DB_NAME, 1); } catch (e) { return res(null); }
    q.onupgradeneeded = () => { const d = q.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
    q.onsuccess = () => res(q.result);
    q.onerror = () => res(null);
    q.onblocked = () => res(null);
  });
  return dbP;
}
function run(mode, fn) {
  return db().then((d) => new Promise((res) => {
    if (!d) return res(undefined);
    let t; try { t = d.transaction(STORE, mode); } catch (e) { return res(undefined); }
    let out; const r = fn(t.objectStore(STORE)); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => res(undefined); t.onabort = () => res(undefined);
  }));
}

export const stashGet = (key) => run("readonly", (s) => s.get(key));
export const stashPut = (key, val) => run("readwrite", (s) => { s.put(val, key); });
export const stashDel = (key) => run("readwrite", (s) => { s.delete(key); });
/** 鍵が prefix で始まるもの [{key, val}] */
export async function stashList(prefix) {
  const range = typeof IDBKeyRange !== "undefined" ? IDBKeyRange.bound(prefix, prefix + "￿") : undefined;
  const out = [];
  await run("readonly", (s) => { const c = s.openCursor(range); c.onsuccess = () => { const k = c.result; if (!k) return; out.push({ key: String(k.key), val: k.value }); k.continue(); }; });
  return out;
}
