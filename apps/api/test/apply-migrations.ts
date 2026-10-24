import { applyD1Migrations, env } from "cloudflare:test";

// 試験ファイルごとに、空の D1 に最初の形を入れる（入れ済みなら何もしない）
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
