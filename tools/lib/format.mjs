// 芦屋みっけ Web制作：連動している文字の書き方（format）
//
// ①お店の情報の値を、公開サイトに出す文字にする純粋関数。ブラウザに依存しない。
// DATA_SPEC 4.4「複雑な値の書き方（format）」と 2.4「値の形の要点」に対応する。
// 期待する出力は tools/format.test.mjs で芦屋堂のデータを使って固定している。

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WD_JA = { mon: "月曜", tue: "火曜", wed: "水曜", thu: "木曜", fri: "金曜", sat: "土曜", sun: "日曜" };
const METHOD_JA = { walk: "徒歩", bus: "バス", car: "車", bicycle: "自転車" };
const CARD_JA = { visa: "Visa", mastercard: "Mastercard", jcb: "JCB", amex: "AMEX", diners: "Diners", unionpay: "銀聯" };
const EMONEY_JA = { transit: "交通系IC", id: "iD", quicpay: "QUICPay", nanaco: "nanaco", waon: "WAON", edy: "楽天Edy" };
const QR_JA = { paypay: "PayPay", rakutenpay: "楽天ペイ", dbarai: "d払い", aupay: "au PAY", merpay: "メルペイ", alipay: "Alipay", wechatpay: "WeChat Pay" };

// 時刻：HH:MM。24時以降は「翌」に。時は先頭の0を落とす（9:00）。分は2桁のまま（16:30）。
export function formatTime(t) {
  const [hRaw, m] = t.split(":");
  let h = Number(hRaw);
  let prefix = "";
  if (h >= 24) { prefix = "翌"; h -= 24; }
  return `${prefix}${h}:${m}`;
}

const periodStr = (p) => `${formatTime(p.start)}〜${formatTime(p.end)}`;
const periodsStr = (periods) => periods.map(periodStr).join("・");

// 金額に3桁区切りを入れる（1200→1,200）。
const yen = (n) => n.toLocaleString("en-US");

// 価格の選択肢ひとつを文字にする（名前は呼び出し側で付ける）。
function priceValue(p) {
  switch (p.type) {
    case "fixed": return `${yen(p.amount)}円`;
    case "from": return `${yen(p.amount)}円〜`;
    case "range": return `${yen(p.amount)}円〜${yen(p.max)}円`;
    case "market": return "時価";
    case "ask": return "応相談";
    case "free": return "無料";
    default: return "";
  }
}

// price：代表の1つ（先頭）だけを出す。
export function formatPrice(prices) {
  if (!Array.isArray(prices) || prices.length === 0) return "";
  return priceValue(prices[0]);
}

// priceAll：すべての選択肢を「名前 価格 ／ 名前 価格」で出す。空なら空文字（何も出さない）。
export function formatPriceAll(prices) {
  if (!Array.isArray(prices) || prices.length === 0) return "";
  return prices
    .map((p) => (p.name ? `${p.name} ${priceValue(p)}` : priceValue(p)))
    .join(" ／ ");
}

// hoursShort：いちばん多い時間帯を本体にし、違う曜日を括弧で添える。
//   例：「9:00〜18:00（日曜は17:00まで）」
//   servingTime のように periods を直接持つ値は、その時間帯を出す（曜日はない）。
export function formatHoursShort(hours) {
  if (!hours) return "";
  // servingTime（periods を直接持つ）
  if (!hours.weekly && Array.isArray(hours.periods)) {
    if (hours.periods.length === 0) return "";
    let s = periodsStr(hours.periods);
    const lo = hours.periods.find((p) => p.lastOrder);
    if (lo) s += `（L.O. ${formatTime(lo.lastOrder)}）`;
    return s;
  }
  const weekly = hours.weekly;
  if (!weekly) return "";
  // 開いている曜日ごとの時間帯シグネチャ
  const openDays = WEEKDAYS.filter((d) => weekly[d]?.status === "open" && weekly[d].periods);
  if (openDays.length === 0) return "";
  const sig = (d) => periodsStr(weekly[d].periods);
  // 最頻のシグネチャ（同数なら曜日の並び順で先に出たもの）
  const counts = new Map();
  for (const d of openDays) counts.set(sig(d), (counts.get(sig(d)) || 0) + 1);
  let main = null, best = -1;
  for (const d of openDays) {
    const c = counts.get(sig(d));
    if (c > best) { best = c; main = sig(d); }
  }
  const mainDays = openDays.filter((d) => sig(d) === main);
  const otherDays = openDays.filter((d) => sig(d) !== main);
  const mainStart = weekly[mainDays[0]].periods[0].start;
  // 違う曜日を「◯曜は…」でまとめる。1つの時間帯で始まりが本体と同じなら「◯曜は〜終わりまで」と縮める。
  const parts = otherDays.map((d) => {
    const ps = weekly[d].periods;
    if (ps.length === 1 && ps[0].start === mainStart) {
      return `${WD_JA[d]}は${formatTime(ps[0].end)}まで`;
    }
    return `${WD_JA[d]}は${periodsStr(ps)}`;
  });
  return parts.length ? `${main}（${parts.join("・")}）` : main;
}

// closedDays：定休日。「水曜・第3火曜・年末年始」
//   曜日の休み → 定休の規則 → 決まった期間の例外（休業）の順。
export function formatClosedDays(hours) {
  if (!hours) return "";
  const out = [];
  const weekly = hours.weekly || {};
  for (const d of WEEKDAYS) if (weekly[d]?.status === "closed") out.push(WD_JA[d]);
  for (const r of hours.closedRules || []) {
    if (r.type === "nthWeekday") out.push(`第${[...r.nth].sort((a, b) => a - b).join("・")}${WD_JA[r.weekday]}`);
    else if (r.type === "lastWeekday") out.push(`最終${WD_JA[r.weekday]}`);
    else if (r.type === "irregular") out.push("不定休");
  }
  for (const ex of Object.values(hours.exceptions || {})) {
    if (ex.status === "closed") out.push(ex.label);
  }
  return out.join("・");
}

// hoursTable：曜日ごとの表（各曜日1行）。表示の仕組みが行に分ける前提で、行を配列で返す。
export function formatHoursTable(hours) {
  if (!hours?.weekly) return [];
  return WEEKDAYS.filter((d) => hours.weekly[d]).map((d) => {
    const v = hours.weekly[d];
    let val;
    if (v.status === "open") val = periodsStr(v.periods);
    else if (v.status === "byAppointment") val = "予約のみ";
    else val = "休み";
    return { day: WD_JA[d], value: val };
  });
}

// address：全部の住所。〒・都道府県市町村・番地・建物。hideStreet なら町名まで。
export function formatAddress(loc) {
  if (!loc) return "";
  const head = loc.postalCode ? `〒${loc.postalCode} ` : "";
  const body = [loc.prefecture, loc.city, loc.town].filter(Boolean).join("");
  if (loc.hideStreet) return `${head}${body}`;
  let s = `${head}${body}${loc.street || ""}`;
  if (loc.building) s += ` ${loc.building}`;
  return s;
}

// addressShort：町名まで（フッターや一覧カード用）。
export function formatAddressShort(loc) {
  if (!loc) return "";
  return [loc.prefecture, loc.city, loc.town].filter(Boolean).join("");
}

// access：最寄り駅からの行き方。order 順に「◯◯駅から徒歩5分（補足）」を「／」でつなぐ。
export function formatAccess(access) {
  if (!access) return "";
  const rows = Object.values(access).sort((a, b) => a.order - b.order);
  return rows
    .map((a) => {
      const min = a.minutes != null ? `${a.minutes}分` : "";
      let s = `${a.station}から${METHOD_JA[a.method] || ""}${min}`;
      if (a.note) s += `（${a.note}）`;
      return s;
    })
    .join(" ／ ");
}

// phone：表示用の番号。
export function formatPhone(phone) {
  if (!phone?.display) return "";
  return phone.display;
}

// payment：支払い方法。現金／カード／電子マネー／QR を確認済みのものだけ並べる。
export function formatPayment(payment) {
  if (!payment) return "";
  const parts = [];
  if (payment.cash) parts.push("現金");
  if (payment.cards?.length) parts.push(`カード（${payment.cards.map((c) => CARD_JA[c] || c).join("・")}）`);
  if (payment.eMoney?.length) parts.push(payment.eMoney.map((e) => EMONEY_JA[e] || e).join("・"));
  if (payment.qr?.length) parts.push(payment.qr.map((q) => QR_JA[q] || q).join("・"));
  return parts.join(" ／ ");
}

// seats：席数。「全8席（テーブル8席）」
export function formatSeats(seats) {
  if (!seats || seats.total == null) return "";
  const detail = [];
  if (seats.counter) detail.push(`カウンター${seats.counter}席`);
  if (seats.table) detail.push(`テーブル${seats.table}席`);
  if (seats.privateRooms) detail.push(`個室${seats.privateRooms}`);
  if (seats.terrace) detail.push(`テラス${seats.terrace}席`);
  return `全${seats.total}席${detail.length ? `（${detail.join("・")}）` : ""}`;
}

// yearsSince：創業からの年数。基準の年（書き出す日付）を渡す。
export function formatYearsSince(foundedYear, refYear) {
  if (!foundedYear) return "";
  return `${refYear - foundedYear}年`;
}

// flag：true/false の項目。true なら「その段落を出す」信号、false・空なら「段落ごと消す」信号。
//   flag 自体は文字を出さない（段落の自由な文字を出すかどうかだけを決める）。
export function evalFlag(value) {
  return value === true;
}

// 値を format にかけて文字にする（flag は別扱い＝呼び出し側で evalFlag を使う）。
export function applyFormat(format, value, ctx = {}) {
  switch (format) {
    case "plain": return value == null ? "" : String(value);
    case "hoursShort": return formatHoursShort(value);
    case "hoursTable": return formatHoursTable(value); // 配列を返す（特別扱い）
    case "closedDays": return formatClosedDays(value);
    case "address": return formatAddress(value);
    case "addressShort": return formatAddressShort(value);
    case "access": return formatAccess(value);
    case "phone": return formatPhone(value);
    case "payment": return formatPayment(value);
    case "price": return formatPrice(value);
    case "priceAll": return formatPriceAll(value);
    case "yearsSince": return formatYearsSince(value, ctx.refYear);
    case "seats": return formatSeats(value);
    case "flag": return ""; // flag は文字を出さない
    default: return value == null ? "" : String(value);
  }
}

// JSON Pointer で値を取り出す（validate.mjs と同じ規則）。
export function getPointer(obj, ptr) {
  if (ptr === "" || ptr == null) return obj;
  let cur = obj;
  for (const raw of ptr.split("/").slice(1)) {
    const k = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur == null || typeof cur !== "object" || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}
