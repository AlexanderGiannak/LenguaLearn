import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// One connection pool per server process. `next dev` re-evaluates modules on every
// edit, so the pool lives on globalThis instead of module scope to avoid leaking
// connections. Creation is lazy so `next build` never needs DATABASE_URL.
const globalForDb = globalThis as unknown as {
  sql?: postgres.Sql;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

export function getSql(): postgres.Sql {
  if (!globalForDb.sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.sql = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 5 });
  }
  return globalForDb.sql;
}

export function getDb() {
  globalForDb.db ??= drizzle(getSql(), { schema });
  return globalForDb.db;
}
