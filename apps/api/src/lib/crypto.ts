const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 推測できない合言葉（Cookie・リンク用）。32 バイト */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** 6 桁のコード。偏りが出ないよう、はみ出た値は引き直す */
export function randomCode(): string {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  for (;;) {
    const v = crypto.getRandomValues(new Uint32Array(1))[0];
    if (v < limit) return String(v % 1_000_000).padStart(6, "0");
  }
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** DATA_SPEC 2.2 の形の ID：接頭辞＋英小文字・数字（既定 12 文字） */
export function newId(prefix: string, len = 12): string {
  const out: string[] = [];
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < 252 && out.length < len) out.push(ID_ALPHABET[b % 36]);
    }
  }
  return `${prefix}_${out.join("")}`;
}

export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** 長さが同じ文字列どうしを、かかる時間が中身によらないように比べる */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
