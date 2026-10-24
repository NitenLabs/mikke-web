/* 芦屋みっけ 公開ページの決まったスクリプト（/_mikke/site.js）。中身は packages/core/publish/site.js（apps/api/src/site-assets.ts に写す）。
 * 倍率（--s）はふつう CSS だけで決まる（style.css：tan(atan2(100cqw, 設計の幅))）。
 * コンテナの単位・三角関数が使えない古いブラウザ（Safari 15 まで等）だけ、ここで数を入れる。
 * PC＝min(1, 幅/1440)、スマホ＝390 を基準に 0.82〜1.15（DATA_SPEC 4.2・7章 Q6）。 */
(function () {
  "use strict";
  var ok = false;
  try { ok = !!(window.CSS && CSS.supports && CSS.supports("width", "calc(1px * tan(atan2(1cqw, 2px)))")); } catch (e) { ok = false; }
  if (ok) return;
  function fit() {
    var w = document.documentElement.clientWidth || window.innerWidth || 0;
    var devs = document.querySelectorAll(".mk-dev");
    for (var i = 0; i < devs.length; i++) {
      var d = devs[i], sp = d.classList.contains("mk-sp");
      var dw = sp ? 390 : 1440, s = w / dw;
      s = sp ? Math.max(0.82, Math.min(1.15, s)) : Math.min(1, s);
      d.style.setProperty("--s", String(s));
    }
  }
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", fit);
})();
