/**
 * M4：公開ページで動いてよいスクリプトは、ここに置いた決まったファイルだけ（店主は変えられない）。
 * 公開ページからは <script src="/_mikke/site.js" defer></script> で読む。
 * 中身はテンプレートの担当（packages/core の描画）が決めて、ここに入れる。今は空。
 */
export const SITE_SCRIPTS: Record<string, string> = {
  "site.js": "/* 芦屋みっけ 公開ページの決まったスクリプト（まだ中身なし） */\n",
};
export const SITE_SCRIPTS_VERSION = "1";
