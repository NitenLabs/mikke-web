// 芦屋堂（samples/ashiyado）のデータから、お店を 1 つ作る SQL を組み立てる。
// scripts/seed.mjs（wrangler で local の D1・R2 に入れる）と試験（test/seed.test.ts）の両方で使う。

/** SQL の文字列の値 */
export const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/** wa-01 の「何もしていない」下書き（src/services/drafts.ts の initialSiteDraft と同じ） */
export const WA01_INITIAL_DRAFT = {
  template: { name: "wa-01", version: 1 },
  sections: {
    pg_home: [{ id: "feature", type: "feature" }, { id: "items", type: "items" }],
    pg_menu: [{ id: "menuhdr", type: "menuHdr" }, { id: "menu", type: "menu" }],
    pg_contact: [{ id: "contacthdr", type: "contactHdr" }, { id: "contact", type: "contact" }],
  },
};

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * @param {object} p
 * @param {object} p.shop     samples/ashiyado/shop.json
 * @param {object} p.assets   samples/ashiyado/assets.json
 * @param {object} p.theme    samples/ashiyado/theme.json
 * @param {string} [p.slug]
 * @param {string} p.producerEmail
 * @param {string} p.ownerEmail
 * @param {Record<string, number>} [p.fileSizes]  素材のファイル名 → バイト数（実物の大きさ。なければ台帳の値）
 * @param {string} [p.now]
 * @returns {{ shopId: string, statements: string[], objects: {key: string, file: string, mime: string}[] }}
 */
export function buildSeed({ shop, assets, theme, slug = "ashiyado", producerEmail, ownerEmail, fileSizes = {}, now = new Date().toISOString() }) {
  const shopId = shop.shopId;
  const name = shop.basic?.name ?? slug;
  const statements = [];
  const objects = [];
  const prodId = "usr_seedproducer";
  const ownerId = `usr_seed${slug.replace(/[^a-z0-9]/g, "").slice(0, 12)}`;

  // 前に入れた同じお店は消してから入れ直す（何度流してもよい）
  for (const t of ["version_assets", "versions", "drafts", "editor_settings", "memberships", "changes", "asset_variants"]) statements.push(`DELETE FROM ${t} WHERE shop_id = ${q(shopId)};`);
  statements.push(`DELETE FROM backup_assets WHERE backup_id IN (SELECT id FROM draft_backups WHERE shop_id = ${q(shopId)});`);
  statements.push(`DELETE FROM draft_backups WHERE shop_id = ${q(shopId)};`);
  statements.push(`DELETE FROM assets WHERE shop_id = ${q(shopId)};`);
  statements.push(`DELETE FROM shops WHERE id = ${q(shopId)};`);

  statements.push(`INSERT OR IGNORE INTO users (id, email, name, role, created_at) VALUES (${q(prodId)}, ${q(producerEmail.toLowerCase())}, '制作側', 'producer', ${q(now)});`);
  statements.push(`INSERT OR IGNORE INTO users (id, email, name, role, created_at) VALUES (${q(ownerId)}, ${q(ownerEmail.toLowerCase())}, ${q(name + "の店主")}, 'owner', ${q(now)});`);
  statements.push(`INSERT INTO shops (id, slug, name, template, created_at) VALUES (${q(shopId)}, ${q(slug)}, ${q(name)}, 'wa-01', ${q(now)});`);
  statements.push(
    `INSERT INTO memberships (user_id, shop_id, created_at) SELECT id, ${q(shopId)}, ${q(now)} FROM users WHERE email = ${q(ownerEmail.toLowerCase())};`,
  );

  // ③ の recentColors は編集の設定に分ける（版に入れない。DATA_SPEC 6章）
  const { recentColors = [], ...themeBody } = theme;
  const siteDraft = { draft: WA01_INITIAL_DRAFT, theme: themeBody };
  statements.push(`INSERT INTO drafts (shop_id, kind, version, body, updated_at, updated_by) VALUES (${q(shopId)}, 'shop', 1, ${q(JSON.stringify(shop))}, ${q(now)}, ${q(prodId)});`);
  statements.push(`INSERT INTO drafts (shop_id, kind, version, body, updated_at, updated_by) VALUES (${q(shopId)}, 'site', 1, ${q(JSON.stringify(siteDraft))}, ${q(now)}, ${q(prodId)});`);
  statements.push(`INSERT INTO editor_settings (shop_id, body, updated_at) VALUES (${q(shopId)}, ${q(JSON.stringify({ recentColors }))}, ${q(now)});`);

  for (const [id, a] of Object.entries(assets.assets)) {
    const mime = a.file.mime;
    const key = `assets/${shopId}/${id}.${EXT[mime] ?? "bin"}`;
    const bytes = fileSizes[a.file.key] ?? a.file.bytes;
    const meta = { ...a, file: { ...a.file, key, bytes } };
    const trashed = a.trashedAt ?? null;
    delete meta.trashedAt;
    statements.push(
      `INSERT INTO assets (id, shop_id, r2_key, mime, bytes, width, height, meta, uploaded_at, uploaded_by, trashed_at) VALUES (${q(id)}, ${q(shopId)}, ${q(key)}, ${q(mime)}, ${bytes}, ${a.file.width}, ${a.file.height}, ${q(JSON.stringify(meta))}, ${q(a.uploadedAt)}, ${q(prodId)}, ${q(trashed)});`,
    );
    objects.push({ key, file: a.file.key, mime });
  }
  return { shopId, statements, objects };
}
