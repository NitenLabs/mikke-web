import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            MAILER: "memory",
            AUTH_SECRET: "test-secret-0123456789abcdef-0123456789abcdef",
            PUBLIC_DOMAIN: "mikke.test",
            APP_ORIGINS: "https://app.mikke-web.test",
            COOKIE_SECURE: "true",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
