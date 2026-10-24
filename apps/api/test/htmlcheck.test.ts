import { describe, expect, it } from "vitest";
import { checkHtml, isScriptUrl } from "../src/lib/htmlcheck";

describe("M4 HTML の検査（読み方の細かいところ）", () => {
  it("M4-5 大きなふつうのページは通り、わざと重くした HTML でもすぐ終わる", () => {
    const row = '<div class="card"><img src="/media/ast_aaaaaaaaaaaa" alt="品"><p style="color:#333">芦屋最中 220円</p><a href="/menu#x">見る</a></div>\n';
    const big = "<!doctype html><html><body>" + row.repeat(Math.floor(1_500_000 / row.length)) + "</body></html>";
    let t = Date.now();
    expect(checkHtml(big)).toEqual([]);
    expect(Date.now() - t).toBeLessThan(3000);
    for (const evil of ["<a ".repeat(600_000), '<a title="' + "<b ".repeat(500_000), "<".repeat(1_500_000) + "a"]) {
      t = Date.now();
      checkHtml(evil);
      expect(Date.now() - t).toBeLessThan(3000);
    }
    expect(checkHtml("<a ".repeat(600_000)).map((p) => p.kind)).toContain("malformed");
  });

  it("M4-6 動く URL の見分け", () => {
    for (const v of ["javascript:x", " javascript:x", "JAVASCRIPT:x", "java\tscript:x", "&#x6A;avascript:x", "&#0000106avascript:x", "javascript&#58;x", "&amp;#106;avascript:x", "data:text/html,x", "vbscript:x"])
      expect(isScriptUrl(v), v).toBe(true);
    for (const v of ["/menu", "https://example.com/javascript:x", "tel:0797", "mailto:a@b", "#top", "data:image/png;base64,AA"]) expect(isScriptUrl(v), v).toBe(false);
  });
});
