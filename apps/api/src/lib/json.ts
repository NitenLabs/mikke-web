/** 鍵を並べた JSON。「直してから元どおり」なら同じ文字列になる（DATA_SPEC 6章 状態の文字） */
export function canonJSON(x: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(norm);
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val === undefined) continue;
      o[k] = norm(val);
    }
    return o;
  };
  return JSON.stringify(norm(x));
}

export const ASSET_ID_RE = /^ast_[a-z0-9]{4,24}$/;
const ASSET_ID_IN_TEXT = /\bast_[a-z0-9]{4,24}\b/g;

/** JSON の中で ④ の ID を指している値を全部拾う（下書き・版のどこにあっても） */
export function collectAssetIds(x: unknown, out = new Set<string>()): Set<string> {
  if (typeof x === "string") {
    if (ASSET_ID_RE.test(x)) out.add(x);
  } else if (Array.isArray(x)) {
    for (const v of x) collectAssetIds(v, out);
  } else if (x && typeof x === "object") {
    for (const v of Object.values(x)) collectAssetIds(v, out);
  }
  return out;
}

/** HTML・CSS の中の ④ の ID（/media/ast_xxx など）を拾う */
export function collectAssetIdsInText(text: string, out = new Set<string>()): Set<string> {
  for (const m of text.matchAll(ASSET_ID_IN_TEXT)) out.add(m[0]);
  return out;
}

export interface PathChange {
  path: string;
  before?: unknown;
  after?: unknown;
}

const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");

/**
 * 2つの JSON の違いを「場所 → 前・後」で出す（変更の記録の要約）。
 * 深さ maxDepth までの入れ物はたどり、それより深い所・配列はまるごと1つの値として比べる。
 */
export function diffPaths(a: unknown, b: unknown, maxDepth = 3, base = ""): PathChange[] {
  const out: PathChange[] = [];
  const walk = (x: unknown, y: unknown, path: string, depth: number) => {
    const isObj = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
    if (depth < maxDepth && isObj(x) && isObj(y)) {
      const xo = x as Record<string, unknown>, yo = y as Record<string, unknown>;
      const keys = new Set([...Object.keys(xo), ...Object.keys(yo)]);
      for (const k of [...keys].sort()) walk(xo[k], yo[k], `${path}/${esc(k)}`, depth + 1);
      return;
    }
    if (canonJSON(x) !== canonJSON(y)) out.push({ path: path || "/", before: x, after: y });
  };
  walk(a, b, base, 0);
  return out;
}

/** 記録に残す値の要約（長いものは切る） */
export function summarize(v: unknown, max = 300): string | null {
  if (v === undefined) return null;
  const s = typeof v === "string" ? JSON.stringify(v) : canonJSON(v);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
