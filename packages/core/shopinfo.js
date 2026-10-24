// ① お店の情報（shop.json）の連絡先・場所を、編集画面と公開で同じ値として読む・書く（DATA_SPEC 3章・4.5「お店の情報を使うリンク」）。
// お店の情報は1か所（①）。アクセスの文字・フッターの住所・電話のリンク・地図のリンクは、ここで ① から作った値を見る。
const z2h = (s) => String(s == null ? "" : s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[－ー−‐―]/g, "-").replace(/＋/g, "+");
// 電話：表示の文字と、tel: に使う数字だけ（先頭の + は残す）
function phoneDigits(s) { const t = z2h(s).trim(); return (t[0] === "+" ? "+" : "") + t.replace(/[^0-9]/g, ""); }
// 電話番号らしいか（数字が 10〜11 桁。+ で始まる国際の形は 8〜15 桁。数字・ハイフン・括弧・空白のほかが無い）
function isPhoneLike(s) {
  const t = z2h(s).trim(); if (!t) return false;
  if (/[^0-9+\-()\s]/.test(t)) return false;
  const d = t.replace(/[^0-9]/g, "");
  return t[0] === "+" ? (d.length >= 8 && d.length <= 15) : (d[0] === "0" && d.length >= 10 && d.length <= 11);
}
// 住所の文字（全部＝〒郵便番号 都道府県市区町村町名番地 建物／町名まで）。hideStreet なら全部でも町名まで（DATA_SPEC 7章 Q5）
function formatAddress(loc, level) {
  if (!loc) return "";
  const head = (loc.prefecture || "") + (loc.city || "") + (loc.town || "");
  if (level === "town") return head;
  const hide = !!loc.hideStreet;
  const body = head + (hide ? "" : (loc.street || "")) + (!hide && loc.building ? " " + loc.building : "");
  return (loc.postalCode ? "〒" + loc.postalCode + " " : "") + body;
}
// 打った住所の文字を ① の場所の形に分ける（〒・都道府県・市区町村・町名・番地・建物）。分けられない所は町名に入れる
function parseAddress(text) {
  let s = z2h(text).replace(/\s+/g, " ").trim(); const out = {};
  let m = s.match(/^〒?\s*(\d{3}-?\d{4})\s*/);
  if (m) { out.postalCode = m[1].length === 7 ? m[1].slice(0, 3) + "-" + m[1].slice(3) : m[1]; s = s.slice(m[0].length); }
  m = s.match(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}?県)/); if (m) { out.prefecture = m[1]; s = s.slice(m[0].length); }
  m = s.match(/^(.+?郡.+?[町村]|.+?市.+?区|.+?[市区町村])/); if (m && /\D/.test(m[1])) { out.city = m[1]; s = s.slice(m[0].length); }
  m = s.match(/^([^0-9]*)(.*)$/); const town = (m[1] || "").trim(), rest = (m[2] || "").trim();
  if (town) out.town = town;
  if (rest) { const k = rest.match(/^([0-9][0-9\-丁目番地号の]*)\s*(.*)$/); if (k) { out.street = k[1]; if (k[2]) out.building = k[2]; } else out.street = rest; }
  return out;
}
// ① の連絡先から、リンクと表示に使う値を作る（無い値は空。STORE の固定値の代わり）
function storeOf(shop) {
  const c = (shop && shop.contact) || {}, loc = (shop && shop.location) || {}, ph = c.phone || {};
  const ext = (shop && shop.externalServices) || {};
  const svc = (kind) => { for (const k in ext) if (ext[k] && ext[k].kind === kind && ext[k].url) return ext[k].url; return ""; };
  const addr = formatAddress(loc, "full"), town = formatAddress(loc, "town");
  const sns = c.sns || {};
  return {
    tel: { display: ph.display || "", digits: ph.digits || phoneDigits(ph.display || "") },
    mail: c.email || "",
    instagram: sns.instagram || "",
    line: sns.line || "",
    order: svc("takeout") || svc("shop"),
    map: (addr || loc.geo) ? { lat: loc.geo ? loc.geo.lat : null, lng: loc.geo ? loc.geo.lng : null, addr, town } : null,
  };
}
// 地図のリンク：番地を隠すときは町名まで、緯度経度があればそれを、無ければ住所で探す（住所を直したら古い緯度経度は捨てる＝applyContactText）
function mapHref(shop) {
  const loc = (shop && shop.location) || {};
  const q = loc.hideStreet ? formatAddress(loc, "town") : (loc.geo ? loc.geo.lat + "," + loc.geo.lng : formatAddress(loc, "full").replace(/^〒\S+\s*/, ""));
  return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q).replace(/%2C/g, ",") : "";
}
// 部品の文字（アクセスの行・フッターの住所）が ① のどの値と連動しているか。連動していなければ undefined
const LINKED_ROWS = { tel: "tel", addr: "addr" };
function linkedText(shop, key) {
  if (key === "tel") return ((shop && shop.contact && shop.contact.phone) || {}).display || "";
  if (key === "addr") return formatAddress(shop && shop.location, "full");
  if (key === "footAddr") return formatAddress(shop && shop.location, "town");
  return undefined;
}
// 連動している文字を書き換えたら ① へ（電話＝表示と数字／住所＝場所を分けて入れ、場所が変われば緯度経度を捨てる）
function applyContactText(shop, key, text) {
  if (!shop) return;
  if (key === "tel") { shop.contact = shop.contact || {}; const t = String(text || "").trim(); if (!t) delete shop.contact.phone; else shop.contact.phone = { display: t, digits: phoneDigits(t) }; return; }
  if (key === "addr") {
    const old = shop.location || {}; const p = parseAddress(text); const loc = {};
    for (const k in old) if (!["postalCode", "prefecture", "city", "town", "street", "building", "geo"].includes(k)) loc[k] = old[k];
    Object.assign(loc, p);
    const same = ["postalCode", "prefecture", "city", "town", "street", "building"].every((k) => (old[k] || "") === (loc[k] || ""));
    if (same && old.geo) loc.geo = old.geo;   // 場所が同じなら緯度経度は残す
    shop.location = loc;
  }
}
// 公開前の確認（F24）：電話・住所が空か、電話でない値なら項目を返す
function contactProblems(shop) {
  const out = []; const ph = ((shop && shop.contact && shop.contact.phone) || {}).display || "";
  if (!ph.trim()) out.push({ key: "tel", msg: "お店の電話番号が空です" });
  else if (!isPhoneLike(ph)) out.push({ key: "tel", msg: "お店の電話番号「" + ph + "」が電話番号の形ではありません" });
  const loc = (shop && shop.location) || {};
  if (!((loc.prefecture || "") + (loc.city || "") + (loc.town || "") + (loc.street || "")).trim()) out.push({ key: "addr", msg: "お店の住所が空です" });
  return out;
}
export { phoneDigits, isPhoneLike, formatAddress, parseAddress, storeOf, mapHref, LINKED_ROWS, linkedText, applyContactText, contactProblems };
