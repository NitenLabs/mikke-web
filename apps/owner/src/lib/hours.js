// 営業時間・定休日（① の /hours/weekly）。純粋。直すたびに新しい hours を返す（元は変えない）。
import { formatHoursShort, formatClosedDays } from "../../../../tools/lib/format.mjs";

export const DAYS = [
  ["mon", "月"], ["tue", "火"], ["wed", "水"], ["thu", "木"], ["fri", "金"], ["sat", "土"], ["sun", "日"],
];
const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));

/** "8:30" → "08:30"（入力の揺れをそろえる）。形が違えばそのまま返す（判定は limits） */
export function normTime(t) {
  const m = /^\s*(\d{1,2})[:：](\d{2})\s*$/.exec(String(t ?? ""));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : String(t ?? "").trim();
}

/** 1 つの曜日を直す。status は open / closed。open のときは start・end（1 つの時間帯） */
export function setDay(hours, day, { status, start, end }) {
  const h = clone(hours);
  h.weekly = h.weekly ?? {};
  const cur = h.weekly[day] ?? {};
  const st = status ?? cur.status ?? "open";
  if (st === "closed") h.weekly[day] = { status: "closed" };
  else {
    const p0 = cur.periods?.[0] ?? { start: "09:00", end: "18:00" };
    const p = { ...p0, start: normTime(start ?? p0.start), end: normTime(end ?? p0.end) };
    h.weekly[day] = { ...cur, status: "open", periods: [p, ...(cur.periods ?? []).slice(1)] };
  }
  return h;
}

/** 開いている曜日の全部に同じ時間を入れる */
export function applyAll(hours, start, end) {
  let h = clone(hours);
  for (const [d] of DAYS) if (h.weekly?.[d]?.status === "open") h = setDay(h, d, { status: "open", start, end });
  return h;
}

/** 画面に出す 1 行（ページと同じ書き方） */
export const hoursLine = (hours) => formatHoursShort(hours);
export const closedLine = (hours) => formatClosedDays(hours) || "なし";

/** 入力欄に出す値（"08:30" → "08:30"、input[type=time] の形） */
export function dayView(hours, day) {
  const d = hours?.weekly?.[day];
  if (!d || d.status !== "open") return { status: d?.status === "byAppointment" ? "byAppointment" : "closed", start: "", end: "" };
  return { status: "open", start: d.periods?.[0]?.start ?? "", end: d.periods?.[0]?.end ?? "" };
}
