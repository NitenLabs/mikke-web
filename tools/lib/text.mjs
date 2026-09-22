// 芦屋みっけ Web制作：文字の箱（段落→かたまり）の解決（純粋・ブラウザ非依存）
// DATA_SPEC 4.4「文字：3種類のかたまり」と「空の扱い」に対応。
//   - 自由な文字だけの段落は消えない
//   - 連動を含む段落は、連動先がすべて空なら段落ごと消える（先頭の項目名ごと）
//   - flag：true なら段落の自由な文字だけを出し、false・空なら段落ごと消す

import { applyFormat, evalFlag, getPointer } from "./format.mjs";

// 1つの run（かたまり）を解決する。
//   種類: "free"（自由な文字／連動を外した文字）, "bind"（連動）, "flag"（フラグ）
function resolveRun(run, scopes, ctx) {
  if (run.bind) {
    const b = run.bind;
    const data = scopes[b.scope];
    const value = getPointer(data, b.path);
    if (b.format === "flag") {
      return { kind: "flag", isTrue: evalFlag(value), marks: run.marks };
    }
    return { kind: "bind", text: applyFormat(b.format || "plain", value, ctx), marks: run.marks, fmt: b.format };
  }
  // 自由な文字（連動を外した文字 detachedFrom も、表示上は固定の文字）
  return { kind: "free", text: run.text ?? "", marks: run.marks, detached: !!run.detachedFrom };
}

function resolveParagraph(paragraph, scopes, ctx) {
  const runs = paragraph.runs.map((r) => resolveRun(r, scopes, ctx));
  const flags = runs.filter((r) => r.kind === "flag");
  const binds = runs.filter((r) => r.kind === "bind");

  let visible;
  if (flags.length) {
    // フラグを含む段落：すべてのフラグが真のときだけ出す
    visible = flags.every((f) => f.isTrue);
  } else if (binds.length) {
    // 連動を含む段落：連動先がすべて空なら消える
    visible = binds.some((b) => b.text !== "");
  } else {
    // 自由な文字だけの段落は消えない
    visible = true;
  }

  // 表示する run（フラグ自体は文字を出さない）
  const outRuns = runs
    .filter((r) => r.kind !== "flag")
    .map((r) => ({ text: r.text ?? "", marks: r.marks, fmt: r.fmt }));
  return { visible, runs: outRuns };
}

// 文字要素を解決する。返り値 { visible, paragraphs:[{runs:[{text,marks}]}] }。
//   visible=false は「箱ごと消える（全段落が消えた）」。表示の仕組みは reflow の hidden として扱う。
export function resolveText(element, scopes, ctx = {}) {
  const paras = element.paragraphs
    .map((p) => resolveParagraph(p, scopes, ctx))
    .filter((p) => p.visible);
  return { visible: paras.length > 0, paragraphs: paras };
}

// 連動プレーンテキスト1つ（連動しない埋め込みの説明など）を取り出す簡便版。
export { getPointer };
