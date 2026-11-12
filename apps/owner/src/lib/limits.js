// 上限の判定（SPEC 3章）。判定はここだけ。純粋（DOM を使わない）。
// 上限はお店ごとの samples/<店>/edit-limits.json。level:"warn" は「目安」（保存はできる）、それ以外は保存の前に止める。
// edit-limits に無い文字の箱は「今の段落の数まで・各段落は今の最長＋2 字まで」（error）。
import { hoursShownChars, hoursExceptionDays } from "../../../../tools/lib/format.mjs";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const len = (s) => [...String(s ?? "")].length;
const paras = (s) => String(s ?? "").split("\n").map((t) => t.trim()).filter(Boolean);

/** data-edit のキーに当たる規則。item:<id>/x は item:*\/x の規則 */
export function ruleFor(limits, key) {
  const f = limits?.fields ?? {};
  if (f[key]) return f[key];
  const m = /^item:[^/]+(\/.+)$/.exec(key);
  if (m && f[`item:*${m[1]}`]) return f[`item:*${m[1]}`];
  return null;
}

/** edit-limits に無い文字の箱の既定（今の段落の数・各段落は今の最長＋2 字） */
export function defaultTextRule(currentParagraphs) {
  const ps = (currentParagraphs ?? []).map(String);
  return { maxParagraphs: Math.max(1, ps.length), maxParagraphChars: Math.max(1, ...ps.map(len)) + 2, level: "error", isDefault: true };
}

const res = () => ({ level: "ok", messages: [], remain: null });
function add(r, level, msg) {
  r.messages.push({ level, text: msg });
  if (level === "error" || (level === "warn" && r.level === "ok")) r.level = level;
}

/**
 * 文字の判定。
 * @returns {{level:"ok"|"warn"|"error", messages:{level,text}[], remain:number|null}}
 *   remain：maxChars（無ければ hardMaxChars）までの残りの字数
 */
export function checkText(value, rule, { required = false } = {}) {
  const r = res();
  const v = String(value ?? "");
  const chars = len(v.replace(/\n/g, ""));
  if (required && !v.trim()) { add(r, "error", "空にはできません"); return r; }
  if (!rule) return r;
  const soft = rule.level === "warn" ? "warn" : "error";
  const say = (lv, limitText) => add(r, lv, lv === "warn" ? `目安より長めです（${limitText}）。保存はできます` : limitText);
  if (rule.hardMaxChars != null && chars > rule.hardMaxChars) say("error", `${rule.hardMaxChars} 字までにしてください（今 ${chars} 字）`);
  else if (rule.maxChars != null && chars > rule.maxChars) say(soft, soft === "warn" ? `目安は ${rule.maxChars} 字・今 ${chars} 字` : `${rule.maxChars} 字までにしてください（今 ${chars} 字）`);
  const ps = paras(v);
  if (rule.maxParagraphs != null && ps.length > rule.maxParagraphs) say(soft, soft === "warn" ? `目安は ${rule.maxParagraphs} 段落・今 ${ps.length} 段落` : `${rule.maxParagraphs} 段落までにしてください（今 ${ps.length} 段落）`);
  if (rule.maxParagraphChars != null) {
    const over = ps.find((p) => len(p) > rule.maxParagraphChars);
    if (over) say("error", `1 行 ${rule.maxParagraphChars} 字までにしてください（今 ${len(over)} 字の行があります）`);
  }
  const lines = v.split("\n").filter((t) => t.trim());
  const maxLines = typeof rule.maxLines === "number" ? rule.maxLines : null;
  if (maxLines != null && lines.length > maxLines) say(soft, soft === "warn" ? `目安は ${maxLines} 行・今 ${lines.length} 行` : `${maxLines} 行までにしてください（今 ${lines.length} 行）`);
  if (rule.maxLineChars != null) {
    const over = lines.find((l) => len(l) > rule.maxLineChars);
    if (over) say(soft, soft === "warn" ? `1 行の目安は ${rule.maxLineChars} 字・今 ${len(over)} 字の行があります` : `1 行 ${rule.maxLineChars} 字までにしてください`);
  }
  // PC の行数（budget.pc.lineChars で折り返したときの行の合計）
  const pcLines = rule.maxLines?.pc, lc = rule.budget?.pc?.lineChars;
  if (pcLines != null && lc) {
    const rows = ps.reduce((n, p) => n + Math.ceil(len(p) / lc), 0);
    if (rows > pcLines) say(soft, soft === "warn" ? `パソコンで ${rows} 行になります・目安は ${pcLines} 行` : `パソコンで ${pcLines} 行までにしてください`);
  }
  const cap = rule.maxChars ?? rule.hardMaxChars;
  if (cap != null) r.remain = cap - chars;
  return r;
}

/** 字数の短い案内（「あと 12 字」） */
export function remainText(r) {
  return r?.remain != null && r.remain >= 0 ? `あと ${r.remain} 字` : "";
}

const TIME_RE = /^([01]\d|2[0-9]|3[0-5]):[0-5]\d$/;
const mins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

/** 基本と違う曜日の数（formatHoursShort が括弧で添える曜日）。数え方は tools/lib/format.mjs の hoursExceptionDays（共通） */
export const exceptionDays = (hours) => hoursExceptionDays(hours);

/** 営業時間の判定（shop:/hours） */
export function checkHours(hours, rule) {
  const r = res();
  const w = hours?.weekly ?? {};
  for (const d of WEEKDAYS) {
    const day = w[d];
    if (!day || day.status !== "open") continue;
    if (!day.periods?.length) { add(r, "error", "開いている日の時間を入れてください"); return r; }
    for (const p of day.periods) {
      if (!TIME_RE.test(p.start ?? "") || !TIME_RE.test(p.end ?? "")) { add(r, "error", "時刻は「8:30」のように入れてください"); return r; }
      if (mins(p.end) <= mins(p.start)) { add(r, "error", "閉める時刻は開ける時刻より後にしてください"); return r; }
    }
  }
  if (!WEEKDAYS.some((d) => w[d]?.status === "open")) add(r, "error", "開いている曜日が 1 つも無い形にはできません");
  if (!rule) return r;
  const lv = rule.level === "warn" ? "warn" : "error";
  const ex = exceptionDays(hours);
  if (rule.maxExceptionDays != null && ex > rule.maxExceptionDays)
    add(r, lv, `ほかと違う時間の曜日は ${rule.maxExceptionDays} つまでにしてください（今 ${ex} つ）`);
  const shown = hoursShownChars(hours); // 表示の字数（L.O. を出す店はその分も。共通の数え方）
  if (rule.maxRenderedChars != null && shown > rule.maxRenderedChars)
    add(r, lv, `表示が長すぎます（${rule.maxRenderedChars} 字まで・今 ${shown} 字）`);
  return r;
}

/** 値段の判定（item:*\/prices） */
export function checkPrices(prices, rule) {
  const r = res();
  const ps = prices ?? [];
  // 空（prices: []）は「値段を出さない」（DATA_SPEC 3.4。カードに値段の行が出ない）
  for (const p of ps) {
    if (["fixed", "from", "range"].includes(p.type) && !(Number.isInteger(p.amount) && p.amount >= 0)) { add(r, "error", "値段は 0 以上の数字で入れてください"); break; }
    if (p.type === "range" && !(Number.isInteger(p.max) && p.max >= 0)) { add(r, "error", "「〜」の後の値段も数字で入れてください"); break; }
    if (p.type === "range" && p.max <= p.amount) { add(r, "error", "「〜」の後の値段は、前の値段より大きくしてください"); break; }   // validate と同じ（max > amount）
  }
  if (ps.length > 1 && ps.some((p) => !String(p.name ?? "").trim())) add(r, "error", "値段が 2 つ以上のときは、それぞれに名前を付けてください");
  if (!rule) return r;
  if (Array.isArray(rule.types)) {
    const bad = ps.find((p) => !rule.types.includes(p.type));
    if (bad) add(r, "error", "この書き方は、このページでは使えません。ほかの書き方を選んでください");
  }
  if (rule.maxOptions != null && ps.length > rule.maxOptions) add(r, "error", `値段は ${rule.maxOptions} つまでにしてください`);
  if (rule.maxOptionNameChars != null) {
    const over = ps.find((p) => len(p.name) > rule.maxOptionNameChars);
    if (over) add(r, "error", `値段の名前は ${rule.maxOptionNameChars} 字までにしてください（今 ${len(over.name)} 字）`);
  }
  return r;
}

/** 品の数（lists の minItems・maxItems） */
export function checkList(count, listRule) {
  const r = res();
  if (!listRule) return r;
  if (listRule.minItems != null && count < listRule.minItems) add(r, "error", `品は ${listRule.minItems} つ以上にしてください`);
  if (listRule.maxItems != null && count > listRule.maxItems) add(r, "error", `品は ${listRule.maxItems} 品までです`);
  return r;
}
export const canAdd = (count, listRule) => listRule?.maxItems == null || count < listRule.maxItems;
export const canRemove = (count, listRule) => count > (listRule?.minItems ?? 0);

/** 写真の幅（minWidth 未満は「ぼやけるかもしれません」。保存はできる） */
export function checkPhotoWidth(width, rule) {
  const r = res();
  if (rule?.minWidth && width < rule.minWidth) add(r, "warn", "小さめの写真です。ぼやけるかもしれません（保存はできます）");
  return r;
}

/** 写真の枠の規則（photos.<元の素材> か item:*\/photos） */
export function photoRule(limits, { assetId, itemId } = {}) {
  const p = limits?.photos ?? {};
  if (itemId) return p["item:*/photos"] ?? null;
  return p[assetId] ?? null;
}

/** いくつかの判定をまとめる（error が 1 つでもあれば保存できない） */
export function worst(results) {
  let lv = "ok";
  for (const r of results) { if (r.level === "error") return "error"; if (r.level === "warn") lv = "warn"; }
  return lv;
}
