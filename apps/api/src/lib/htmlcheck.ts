/**
 * M4：公開のときに送られた HTML に、そのまま動くスクリプトが入っていないかを確かめる。
 * CSP（script-src 'self'）でも止まるが、入口でも断る（二重の守り）。
 *
 * 断るもの
 * - <script> のうち、中身を持つもの（インライン）。ただし type="application/ld+json"（構造化データ。D5）は動かないので通す
 * - <script src> のうち、/_mikke/ の決まったファイル以外
 * - on〜 の属性（onclick・onerror…）
 * - 属性の値が javascript:・vbscript:・data:text/html などで始まるもの（文字参照・空白を混ぜたものも）
 * - srcdoc 属性、<meta http-equiv="refresh">
 */
export interface HtmlProblem {
  kind: "inline_script" | "script_src" | "event_handler" | "script_url" | "srcdoc" | "meta_refresh" | "malformed";
  detail: string;
}

const NAMED: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", lpar: "(", rpar: ")", sol: "/", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

/** 文字参照を戻す（&#106; &#x6A; &colon; など。; がないものも） */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    const v = NAMED[e.toLowerCase()];
    return v ?? m;
  });
}

const DANGEROUS_URL = /^(?:javascript:|vbscript:|livescript:|data:(?:text\/html|application\/xhtml))/;

/** 属性の値が、動く URL か（空白・制御文字を取り、小文字にしてから見る） */
export function isScriptUrl(raw: string): boolean {
  // 何重にも文字参照を重ねたものも戻す
  let v = raw;
  for (let i = 0; i < 3; i++) {
    const d = decodeEntities(v);
    if (d === v) break;
    v = d;
  }
  const compact = v.replace(/[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g, "").toLowerCase();
  return DANGEROUS_URL.test(compact);
}

interface Tag {
  name: string;
  attrs: [string, string | null][];
  end: number; // ">" の次
  closing: boolean;
}

/** < の位置から 1 つのタグを読む（引用符の中の > は飛ばす）。タグでなければ null */
function readTag(html: string, start: number): Tag | null {
  let i = start + 1;
  let closing = false;
  if (html[i] === "/") {
    closing = true;
    i++;
  }
  const nm = /^[A-Za-z][^\s/>]*/.exec(html.slice(i, i + 200));
  if (!nm) return null;
  const name = nm[0].toLowerCase();
  i += nm[0].length;
  const attrs: [string, string | null][] = [];
  const n = html.length;
  while (i < n) {
    while (i < n && /[\s/]/.test(html[i])) i++;
    if (i >= n) break;
    if (html[i] === ">") return { name, attrs, end: i + 1, closing };
    // 属性の名前
    let j = i;
    while (j < n && !/[\s/>=]/.test(html[j])) j++;
    if (j === i) j = i + 1; // 「=」などで始まるおかしな名前も 1 文字は進める
    const an = html.slice(i, j).toLowerCase();
    i = j;
    while (i < n && /\s/.test(html[i])) i++;
    let val: string | null = null;
    if (html[i] === "=") {
      i++;
      while (i < n && /\s/.test(html[i])) i++;
      const q = html[i];
      if (q === '"' || q === "'") {
        const e = html.indexOf(q, i + 1);
        const stop = e < 0 ? n : e;
        val = html.slice(i + 1, stop);
        i = stop + 1;
      } else {
        let k = i;
        while (k < n && !/[\s>]/.test(html[k])) k++;
        val = html.slice(i, k);
        i = k;
      }
    }
    attrs.push([an, val]);
  }
  return { name, attrs, end: n, closing };
}

/** 1 つのタグとして読む長さの上限（これより長いタグは、壊れた HTML として断る） */
const MAX_TAG_CHARS = 64 * 1024;
/** 読む手間の上限（HTML の長さの何倍まで読むか）。わざと重くした HTML で止まらないように */
const WORK_FACTOR = 40;

/**
 * 読み方：「<」＋英字のところは、どこにあってもタグとして読む（コメント・style・title・属性の値の中も）。
 * ブラウザの読み方とずれて（SVG の中の style など）すり抜けられないよう、わざと厳しく読む。
 * 編集画面が描く HTML は、コメントや style の中にタグの形の文字を持たない前提
 */
export function checkHtml(html: string): HtmlProblem[] {
  const out: HtmlProblem[] = [];
  const n = html.length;
  let i = 0;
  let work = 0;
  while (i < n && out.length < 20) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const tag = readTag(html, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    work += tag.end - lt;
    if (tag.end - lt > MAX_TAG_CHARS || work > WORK_FACTOR * n + 100_000) {
      out.push({ kind: "malformed", detail: "閉じていないタグか、長すぎるタグがあります" });
      break;
    }
    // タグの終わりまで飛ばさず、次の「<」から読み直す（引用符の中に隠したタグも読む）
    i = lt + 1;
    if (tag.closing) continue;
    const local = tag.name.includes(":") ? tag.name.slice(tag.name.lastIndexOf(":") + 1) : tag.name;
    const attr = (k: string) => tag.attrs.find(([a]) => a === k)?.[1] ?? null;
    for (const [a, v] of tag.attrs) {
      const an = a.includes(":") ? a.slice(a.lastIndexOf(":") + 1) : a;
      if (an.startsWith("on")) out.push({ kind: "event_handler", detail: `<${tag.name} ${a}>` });
      else if (an === "srcdoc") out.push({ kind: "srcdoc", detail: `<${tag.name} srcdoc>` });
      else if (v !== null && isScriptUrl(v)) out.push({ kind: "script_url", detail: `<${tag.name} ${a}="${v.slice(0, 40)}">` });
    }
    if (local === "meta" && (attr("http-equiv") ?? "").toLowerCase().trim() === "refresh") out.push({ kind: "meta_refresh", detail: "<meta http-equiv=refresh>" });
    if (local === "script") {
      const close = /<\/(?:[a-z0-9_-]+:)?script[\s>/]/i.exec(html.slice(tag.end));
      const body = close ? html.slice(tag.end, tag.end + close.index) : html.slice(tag.end);
      const type = (attr("type") ?? "").toLowerCase().trim();
      const src = attr("src");
      if (src !== null) {
        if (!/^\/_mikke\/[a-z0-9._-]+\.js$/.test(src.trim())) out.push({ kind: "script_src", detail: `<script src="${src.slice(0, 60)}">` });
        if (body.trim()) out.push({ kind: "inline_script", detail: "<script src> の中に文字" });
      } else if (type !== "application/ld+json" || local !== tag.name) {
        out.push({ kind: "inline_script", detail: `<${tag.name}${type ? ` type="${type}"` : ""}>` });
      }
      // 中身もタグとして読み続ける（構造化データの中のタグの形の文字も断る）
    }
  }
  return out;
}

/** sitemap.xml などの XML：スクリプトになりうるものがないか */
export function checkXml(xml: string): HtmlProblem[] {
  const out: HtmlProblem[] = [];
  if (/<(?:[a-z0-9_-]+:)?script[\s>/]/i.test(xml)) out.push({ kind: "inline_script", detail: "<script>" });
  if (/xhtml/i.test(xml) && /<(?:[a-z0-9_-]+:)?(?:iframe|object|embed)[\s>/]/i.test(xml)) out.push({ kind: "srcdoc", detail: "XHTML の埋め込み" });
  if (/\son[a-z]+\s*=/i.test(xml)) out.push({ kind: "event_handler", detail: "on〜 の属性" });
  if (/javascript:/i.test(decodeEntities(xml))) out.push({ kind: "script_url", detail: "javascript:" });
  return out;
}
