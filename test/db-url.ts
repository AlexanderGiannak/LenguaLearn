// Database tests run against a separate "<name>_test" database next to the one in
// DATABASE_URL, so they never touch the dev database the app is using.
export function testDatabaseUrl(): string {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI sets DATABASE_URL directly.
  }
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set; database tests need a local Postgres");
  const url = new URL(base);
  if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
  return url.toString();
}
