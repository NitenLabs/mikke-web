/**
 * 写真の中身の確かめ（C2・M5）。縮小と位置情報の削除はブラウザでする前提だが、サーバーでも
 * ①種類（中身の先頭のバイト）②縦横の大きさ ③撮影データ（EXIF・XMP・IPTC。位置情報が入りうる所）
 * ④画像の終わりの後ろのデータ（別のファイルを隠せる）を見る。
 */
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
  /** 撮影データ（EXIF・XMP・IPTC など）が残っている。何が残っていたか */
  metadata: string[];
  /** 画像の終わりの後ろにデータがある */
  trailing: boolean;
}

export const ACCEPTED_MIMES: ImageMime[] = ["image/jpeg", "image/png", "image/webp"];

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + ((b[o + 3] << 24) >>> 0);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, Math.min(o + n, b.length)));

export function sniffImage(b: Uint8Array): ImageInfo | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return parseJpeg(b);
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return parsePng(b);
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return parseWebp(b);
  return null;
}

function parseJpeg(b: Uint8Array): ImageInfo | null {
  let o = 2;
  let width = 0, height = 0;
  const metadata: string[] = [];
  let sos = -1;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    let marker = b[o + 1];
    while (marker === 0xff && o + 2 < b.length) { o++; marker = b[o + 1]; }
    o += 2;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (marker === 0xd9) return null; // 中身の前に終わり
    if (o + 2 > b.length) return null;
    const len = u16be(b, o);
    if (len < 2 || o + len > b.length) return null;
    if (marker === 0xe1) {
      const head = ascii(b, o + 2, 40);
      if (head.startsWith("Exif")) metadata.push("EXIF");
      else if (head.startsWith("http://ns.adobe.com/xap/1.0/") || head.startsWith("http://ns.adobe.com/xmp/extension/")) metadata.push("XMP");
      else metadata.push("APP1");
    }
    if (marker === 0xed) metadata.push("IPTC"); // APP13（Photoshop）
    // SOF0〜SOF15（DHT・JPG・DAC を除く）
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (len < 7) return null;
      height = u16be(b, o + 3);
      width = u16be(b, o + 5);
    }
    if (marker === 0xda) {
      sos = o + len;
      break;
    }
    o += len;
  }
  if (!width || !height || sos < 0) return null;
  // 中身（エントロピー符号）の中では FF の後ろは 00 か RSTn なので、最初の FF D9 が画像の終わり
  let eoi = -1;
  for (let i = sos; i + 1 < b.length; i++) {
    if (b[i] === 0xff && b[i + 1] === 0xd9) {
      eoi = i + 2;
      break;
    }
  }
  if (eoi < 0) return null; // 終わりのない（切れた）JPEG
  return { mime: "image/jpeg", width, height, metadata, trailing: eoi < b.length };
}

function parsePng(b: Uint8Array): ImageInfo | null {
  if (b.length < 33 || ascii(b, 12, 4) !== "IHDR") return null;
  const width = u32be(b, 16), height = u32be(b, 20);
  const metadata: string[] = [];
  let o = 8;
  let end = -1;
  while (o + 12 <= b.length) {
    const len = u32be(b, o);
    const type = ascii(b, o + 4, 4);
    if (o + 12 + len > b.length) return null;
    if (type === "eXIf") metadata.push("EXIF");
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      // 名前（キーワード）は最初の 0 まで
      const kw = ascii(b, o + 8, Math.min(len, 80)).split("\0")[0].toLowerCase();
      if (kw.includes("exif") || kw.includes("xmp") || kw.includes("iptc")) metadata.push(`${type}:${kw}`);
    }
    if (type === "IEND") {
      end = o + 12 + len;
      break;
    }
    o += 12 + len;
  }
  if (!width || !height || end < 0) return null;
  return { mime: "image/png", width, height, metadata, trailing: end < b.length };
}

function parseWebp(b: Uint8Array): ImageInfo | null {
  const riffEnd = 8 + u32le(b, 4);
  if (riffEnd > b.length) return null;
  let o = 12;
  let width = 0, height = 0;
  const metadata: string[] = [];
  while (o + 8 <= riffEnd) {
    const type = ascii(b, o, 4);
    const len = u32le(b, o + 4);
    const d = o + 8;
    if (d + len > riffEnd) return null;
    if (type === "VP8X" && len >= 10) {
      if (b[d] & 0x08) metadata.push("EXIF"); // EXIF の印
      if (b[d] & 0x04) metadata.push("XMP"); // XMP の印
      width = u24le(b, d + 4) + 1;
      height = u24le(b, d + 7) + 1;
    } else if (type === "VP8 " && len >= 10 && !width) {
      if (b[d + 3] !== 0x9d || b[d + 4] !== 0x01 || b[d + 5] !== 0x2a) return null;
      width = u16le(b, d + 6) & 0x3fff;
      height = u16le(b, d + 8) & 0x3fff;
    } else if (type === "VP8L" && len >= 5 && !width) {
      if (b[d] !== 0x2f) return null;
      const bits = u32le(b, d + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (type === "EXIF") {
      metadata.push("EXIF");
    } else if (type === "XMP ") {
      metadata.push("XMP");
    }
    o = d + len + (len & 1);
  }
  if (!width || !height) return null;
  return { mime: "image/webp", width, height, metadata: [...new Set(metadata)], trailing: riffEnd < b.length };
}
