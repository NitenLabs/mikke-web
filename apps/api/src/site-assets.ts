/**
 * M4：公開ページで動いてよいスクリプトは、ここに置いた決まったファイルだけ（店主は変えられない）。
 * 公開ページからは <script src="/_mikke/site.js" defer></script> で読む。
 * 中身は packages/core/publish/site.js から scripts/sync-site-js.mjs で写したもの。ここを手で直さない。
 */
export const SITE_SCRIPTS: Record<string, string> = {
  "site.js": "/* 芦屋みっけ 公開ページの決まったスクリプト（/_mikke/site.js）。中身は packages/core/publish/site.js（apps/api/src/site-assets.ts に写す）。\n * 倍率（--s）はふつう CSS だけで決まる（style.css：tan(atan2(100cqw, 設計の幅))）。\n * コンテナの単位・三角関数が使えない古いブラウザ（Safari 15 まで等）だけ、ここで数を入れる。\n * PC＝min(1, 幅/1440)、スマホ＝390 を基準に 0.82〜1.15（DATA_SPEC 4.2・7章 Q6）。 */\n(function () {\n  \"use strict\";\n  var ok = false;\n  try { ok = !!(window.CSS && CSS.supports && CSS.supports(\"width\", \"calc(1px * tan(atan2(1cqw, 2px)))\")); } catch (e) { ok = false; }\n  if (ok) return;\n  function fit() {\n    var w = document.documentElement.clientWidth || window.innerWidth || 0;\n    var devs = document.querySelectorAll(\".mk-dev\");\n    for (var i = 0; i < devs.length; i++) {\n      var d = devs[i], sp = d.classList.contains(\"mk-sp\");\n      var dw = sp ? 390 : 1440, s = w / dw;\n      s = sp ? Math.max(0.82, Math.min(1.15, s)) : Math.min(1, s);\n      d.style.setProperty(\"--s\", String(s));\n    }\n  }\n  fit();\n  window.addEventListener(\"resize\", fit);\n  window.addEventListener(\"orientationchange\", fit);\n})();\n",
};
export const SITE_SCRIPTS_VERSION = "217e954c66e2";
