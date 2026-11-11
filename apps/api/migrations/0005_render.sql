-- 公開の描き方（指示 0054）：HTML を編集画面が描いて送る版（html）と、①② だけを残して手元の rebuild-shop で描き直す版（rebuild）
-- render_state：html＝今までどおり（API が R2 の HTML を配る）／pending＝描き直し待ち／ok＝描き直して出した／failed＝描き直しに失敗
-- rebuild の版は API の公開ページでは出さない（店は Pages に出る）。render_url は描き直しで出した先、render_error は失敗の理由
ALTER TABLE versions ADD COLUMN render_state TEXT NOT NULL DEFAULT 'html' CHECK (render_state IN ('html', 'pending', 'ok', 'failed'));
ALTER TABLE versions ADD COLUMN render_error TEXT;
ALTER TABLE versions ADD COLUMN render_url TEXT;
ALTER TABLE versions ADD COLUMN rendered_at TEXT;
