// 付録B（中身を変える試験）：芦屋堂コンテンツを変形する。両方式は同じ変形後コンテンツから組み直す。
// 追加テキストは「◯行増やす」を満たすよう長さを選ぶ（実測で行数を報告する）。
import { baseContent, clone } from "../lib/content.mjs";

const L1 = "季節の移ろいを映した意匠を、毎月あたらしく仕立てています。"; // 約1行(501/333)
const S1_ADD = "毎朝炊いた餡を、その日のうちにお出しします。手のひらにのる小さな菓子に、季節のうつろいを写します。四季折々の意匠をお楽しみください。"; // 約3行分
const S1B_ADD = ("職人が一つひとつ手で仕上げます。" + "餡は北海道産の小豆を毎朝炊きます。").repeat(7); // 約14行分

export const SCENARIOS = {
  base: (c) => c,
  S1: (c) => { c.feature.blocks[0].body += S1_ADD; return c; },
  S1b: (c) => { c.feature.blocks[0].body += S1B_ADD; return c; },
  S2: (c) => { c.feature.blocks[0].heading = "季節の上生菓子と、その月だけの特別な意匠"; return c; },
  S3: (c) => { c.items.cards[1].desc = "本わらび粉だけを使い、ご注文をいただいてから一つずつ丁寧に切り分けてお出しします。"; return c; },
  S4: (c) => { c.items.cards.push({ id: "c_sakura", photo: { asset: "ast_frmx" }, name: "桜餅", desc: "道明寺の桜餅。", price: "250円（税込）" }); return c; },
  S6b: (c) => { c.items.table = [c.items.table[0]]; return c; },
  S7: (c) => { c.items.table[0].desc = ""; return c; },
};

export function makeContent(name) {
  return SCENARIOS[name](clone(baseContent()));
}
