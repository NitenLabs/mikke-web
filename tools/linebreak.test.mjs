// node --test tools/linebreak.test.mjs
// 改行の規則（linebreak.mjs）のうち、ブラウザの要らない所を固定する（指示 0060）。
//   chooseKeep：最後の行をまとめた塊が箱に入らないときに keep を下げる（A）
//   hoursGroupTokens：営業時間を曜日のまとまりに分ける（B）
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseKeep, hoursGroupTokens, tokenize, tokenizeInfo, protectedRanges, KEEP_TOL } from "./lib/linebreak.mjs";

const dev = (chosen, boxW, chunkW = {}) => ({ chosen, boxW, chunkW });

test("chooseKeep：塊が両端末の箱に入れば PC・SP の大きい方（今までどおり）", () => {
  assert.deepEqual(chooseKeep({ pc: dev(0, 490, { 2: 300 }), sp: dev(2, 330, { 2: 200 }) }), { keep: 2, fixed: false });
  assert.deepEqual(chooseKeep({ pc: dev(0, 490), sp: dev(0, 330) }), { keep: 0, fixed: false });
});

test("chooseKeep：許容（2px）までの超えは変えない", () => {
  assert.equal(KEEP_TOL, 2);
  assert.deepEqual(chooseKeep({ sp: dev(2, 150, { 2: 151.22 }) }), { keep: 2, fixed: false });
});

test("chooseKeep：PC で選んだ塊がスマホの箱からはみ出すなら、両端末に入る最大の keep に下げる", () => {
  // 麓 hoursN:5 の形：PC は keep 2（塊 364px）、スマホの箱 330px
  assert.deepEqual(chooseKeep({ pc: dev(2, 490, { 2: 364, 3: 420 }), sp: dev(0, 330, { 2: 364, 3: 420 }) }), { keep: 0, fixed: true });
  // keep 4 がはみ出し、keep 3 は入る
  assert.deepEqual(chooseKeep({ pc: dev(4, 490, { 2: 100, 3: 200, 4: 400 }), sp: dev(0, 330, { 2: 100, 3: 200, 4: 400 }) }), { keep: 3, fixed: true });
});

test("hoursGroupTokens：「（」の前・「・」「／」の後で曜日のまとまりに分ける", () => {
  assert.deepEqual(hoursGroupTokens("7:30〜17:00（月曜は休み・水曜は11:00〜15:00）"), ["7:30〜17:00", "（月曜は休み・", "水曜は11:00〜15:00）"]);
  assert.deepEqual(hoursGroupTokens("17:30〜21:00（L.O. 20:30）／土曜はL.O. 21:00"), ["17:30〜21:00（L.O. 20:30）／", "土曜はL.O. 21:00"]);
  // 時間帯の「・」（曜日が続かない）では切らない
  assert.deepEqual(hoursGroupTokens("11:30〜14:00・18:00〜21:30"), ["11:30〜14:00・18:00〜21:30"]);
  assert.deepEqual(hoursGroupTokens(""), []);
});

test("tokenize：hoursGroups は営業時間の run だけに効く（ほかの run は文節のまま）", () => {
  const runs = [{ text: "9:00〜18:00（日曜は17:00まで）", fmt: "hoursShort" }, { text: "（L.O. 17:30）" }];
  const plain = tokenize(runs, true);
  const grouped = tokenize(runs, true, { hoursGroups: true });
  assert.deepEqual(grouped.slice(0, 2), ["<span>9:00〜18:00</span>", "<span>（日曜は17:00まで）</span>"]);
  assert.deepEqual(grouped.slice(2), tokenize([runs[1]], true));
  assert.notDeepEqual(plain, grouped);
});

// ---------- 守りたい塊（指示 0064）----------
test("protectedRanges：時刻の範囲・L.O.・数＋単位", () => {
  const t = "昼 11:30〜14:00（L.O. 13:30）・全8席・1,200円";
  assert.deepEqual(protectedRanges(t).map(([s, e]) => t.slice(s, e)), ["11:30〜14:00", "（L.O. 13:30）", "8席", "1,200円"]);
  assert.deepEqual(protectedRanges("季節の上生菓子"), []);
});

test("tokenize：連動の境が塊の中なら <wbr> を入れずにつなぐ（span は run ごとのまま）", () => {
  const runs = [{ text: "昼" }, { text: " " }, { text: "11:30" }, { text: "〜" }, { text: "14:00" }, { text: "（L.O. " }, { text: "13:30" }, { text: "）" }];
  const toks = tokenize(runs, true);
  assert.deepEqual(toks, ["<span>昼</span>", "<span> </span>", "<span>11:30</span><span>〜</span><span>14:00</span>", "<span>（L.O. </span><span>13:30</span><span>）</span>"]);
  assert.deepEqual(tokenize([{ text: "全" }, { text: "8" }, { text: "席" }], true), ["<span>全</span>", "<span>8</span><span>席</span>"]);
  // lb=false は今までどおり run ごと
  assert.equal(tokenize([{ text: "11:30" }, { text: "〜" }], false).length, 2);
});

test("tokenizeInfo：prot は塊だけを nowrap で包む（塊の無いトークンはそのまま）", () => {
  const i = tokenizeInfo([{ text: "8:00〜18:00（L.O. 17:30）定休日なし" }], true);
  assert.equal(i.prot.length, i.toks.length);
  assert.ok(i.prot.join("").includes('<span class="nowrap"><span>8:00〜18:00</span></span>'));
  assert.equal(tokenizeInfo([{ text: "季節の和菓子" }], true).prot, null);
});

test("chooseKeep：長い（）の塊（箱より広い）は keep 0（0050 の天ぷらの品名）", () => {
  // 「天ぷら定食（車海老・季節の野菜・ご飯・赤出汁）」：末尾の塊が 390 の箱より広い
  assert.deepEqual(chooseKeep({ pc: dev(0, 490, { 2: 300 }), sp: dev(3, 150, { 2: 140, 3: 260, 4: 300 }) }), { keep: 2, fixed: true });
  assert.deepEqual(chooseKeep({ sp: dev(2, 150, { 2: 240 }) }), { keep: 0, fixed: true });
});
