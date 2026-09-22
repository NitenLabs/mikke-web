// node --test tools/reflow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { reflow } from "./reflow.mjs";

const el = (id, x, w, y, h, actualH = h, hidden = false) => ({ id, x, w, y, h, actualH, hidden });

test("何も変わらなければ、何も動かない", () => {
  const r = reflow([el("head", 6, 40, 72, 48), el("body", 6, 40, 144, 160)], 400);
  assert.deepEqual(r.y, { head: 72, body: 144 });
  assert.equal(r.sectionH, 400);
});

test("文章が伸びたら、下の要素だけ押し下げ、セクションも伸びる", () => {
  const r = reflow([el("head", 6, 40, 72, 48), el("body", 6, 40, 144, 160, 260), el("btn", 6, 22, 330, 52)], 440);
  assert.equal(r.y.btn, 430);
  assert.equal(r.sectionH, 540);
});

test("横に並んだ列は影響しない（左の文章が伸びても右の写真は動かない）", () => {
  const r = reflow([el("body", 6, 42, 156, 125, 300), el("photo", 54, 40, 88, 400), el("below", 54, 40, 520, 40)], 600);
  assert.equal(r.y.photo, 88);
  assert.equal(r.y.below, 520);
});

test("全幅の要素は、2列のうち伸びた方に合わせ、元の間隔を保って下がる", () => {
  const r = reflow([el("l", 6, 42, 100, 100, 180), el("r", 54, 40, 100, 140), el("full", 6, 88, 280, 40)], 360);
  assert.equal(r.y.full, 360); // 左の列が +80。左の列の下端との間隔80を保つ
});

test("空欄で消えた要素は、その下の余白ごと詰める", () => {
  const r = reflow([el("head", 6, 88, 0, 40), el("email", 6, 88, 64, 100, 0, true), el("next", 6, 88, 188, 40)], 260);
  assert.equal(r.y.next, 64); // 見出しの下端40＋もとの間隔24
  assert.equal(r.sectionH, 136);
});

test("箱に余白を取ってあれば、その中で伸びる分は下を動かさない", () => {
  const r = reflow([el("body", 6, 40, 100, 200, 180), el("btn", 6, 22, 320, 52)], 400);
  assert.equal(r.y.btn, 320);
});

test("写真の上に重ねた文字が伸びても、写真と重なっている間は互いに動かない", () => {
  const r = reflow([el("photo", 0, 100, 0, 600), el("title", 6, 70, 376, 83, 160), el("next", 6, 88, 640, 40)], 700);
  assert.equal(r.y.title, 376);
  assert.equal(r.y.next, 640); // 文字の下端 376+160=536 は写真の下端600の内側
});

test("写真からはみ出すほど伸びたら、はみ出した分だけ下がる", () => {
  const r = reflow([el("photo", 0, 100, 0, 600), el("title", 6, 70, 480, 83, 200), el("next", 6, 88, 640, 40)], 700);
  assert.equal(r.y.next, 720); // 文字の下端が680になり写真を80はみ出す。はみ出した分だけ下がり、間隔40を保つ
});

test("品が増えて繰り返す部品が伸びると、下の見出しとボタンがまとめて下がる", () => {
  const r = reflow([el("list", 6, 88, 120, 544, 1100), el("note", 6, 88, 700, 40), el("btn", 6, 30, 764, 52)], 900);
  assert.equal(r.y.note, 1256);
  assert.equal(r.y.btn, 1320);
  assert.equal(r.sectionH, 1456);
});

test("写真の上の見出しが伸びても、それだけでセクションは伸びない", () => {
  const r = reflow([el("photo", 0, 100, 0, 620), el("title", 6, 70, 376, 83, 160)], 620);
  assert.equal(r.sectionH, 620);
});

test("最後の要素が消えたら、セクションの下の余白ごと詰める", () => {
  const r = reflow([el("head", 6, 88, 48, 36), el("map", 6, 88, 100, 220, 0, true)], 380);
  assert.equal(r.sectionH, 100); // 地図（220）とその下の余白（60）がなくなり、見出しの下16pxでセクションが終わる
});

test("2列の片方の最後が消えても、もう片方が残っていれば下は詰めない", () => {
  const r = reflow([el("l", 6, 42, 100, 200), el("r", 54, 40, 100, 200, 0, true), el("full", 6, 88, 340, 40)], 420);
  assert.equal(r.y.full, 340);
});

test("飾り以外の要素がすべて消えたら、セクションごと表示しない（規則8）", () => {
  const bg = { ...el("bg", 0, 100, 0, 300), decorative: true };
  // 背景色の飾りだけが残り、見出しも本文も消えた → セクション非表示
  const gone = reflow([bg, el("head", 6, 88, 40, 40, 0, true), el("body", 6, 88, 100, 120, 0, true)], 300);
  assert.equal(gone.hidden, true);
  // 見出しが残っていれば表示する
  const kept = reflow([bg, el("head", 6, 88, 40, 40), el("body", 6, 88, 100, 120, 0, true)], 300);
  assert.equal(kept.hidden, false);
});
