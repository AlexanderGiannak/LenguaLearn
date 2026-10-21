// Applies pending Drizzle migrations. Runs as Railway's pre-deploy command, inside the
// private network, so the laptop never connects to the production database.
// Plain Node (24+ strips TypeScript types natively); no app imports, so no bundler needed.
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const migrationsFolder = "drizzle";
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
  console.log("No migrations yet; nothing to apply.");
  process.exit(0);
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder });
  console.log("Migrations applied.");
} finally {
  await sql.end();
}
