import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests (`*.db.test.ts`). They need Postgres, so they run in the CI job that has
// one and locally with `npm run test:db` after `npm run db:up`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["**/*.db.test.ts"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    globalSetup: ["./test/db-global-setup.ts"],
    setupFiles: ["./test/db-env.ts"],
    // Files share one database; running them one at a time keeps row counts predictable.
    fileParallelism: false,
  },
});
