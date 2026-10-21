import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env files itself.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No local env file (CI, Railway): use the real environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
