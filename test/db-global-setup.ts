import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { testDatabaseUrl } from "./db-url";

// Creates the test database if needed and applies all migrations to it.
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`unexpected test database name: ${name}`);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
    if (!exists) await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  } finally {
    await sql.end();
  }
}
