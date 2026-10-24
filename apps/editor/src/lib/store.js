// 保存先の差し替え口（ここ1か所）。pg/store-save.js は saveStore の name・open・get・put だけを使う。
//   open()            → 保存先への「つなぎ」（Promise）。get/put に渡す
//   get(h, key)       → 値（Promise。無ければ undefined）
//   put(h, key, val)  → 書き終わったら解ける Promise
//   name              → 名前（別タブの保存を知る localStorage の鍵 `${name}:seq` にも使う）
// 鍵は draft（今の形）・shop（① の下書き）・versions（版）・assets（写真）・settings（最近使った色）。
// 今は LocalStore（ブラウザの IndexedDB）。M3 で ApiStore（apps/api）を足し、下の saveStore を選び分ける。

// IndexedDB の名前は試験台30 と同じ（確認スクリプトがこの名前で中を見る）
export const LOCAL_DB_NAME = "mikke-playground30";

export function LocalStore(name = LOCAL_DB_NAME, ver = 1, storeName = "state") {
  // 中身は試験台30 の idbOpen・idbGet・idbPut のまま
  return {
    kind: "local", name,
    open() { return new Promise((res, rej) => { let q; try { q = indexedDB.open(name, ver); } catch (e) { return rej(e); } q.onupgradeneeded = () => { const db = q.result; if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    get(db, key) { return new Promise((res, rej) => { const t = db.transaction(storeName, "readonly"); const g = t.objectStore(storeName).get(key); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); }); },
    put(db, key, val) { return new Promise((res, rej) => { const t = db.transaction(storeName, "readwrite"); t.objectStore(storeName).put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
  };
}

export const saveStore = LocalStore();
