/** サブドメインに使う名前（お店のスラッグ） */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
/** お店に使わせない名前。このサブドメインは公開ページにせず API に回す（app.<ドメイン> に編集画面を置けるように） */
export const RESERVED_SLUGS = new Set(["www", "app", "api", "admin", "staging", "mail", "static", "assets", "cdn", "login", "mikke"]);
