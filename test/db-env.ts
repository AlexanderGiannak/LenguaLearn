import { testDatabaseUrl } from "./db-url";

// Runs in each test worker before any test file imports the database client.
process.env.DATABASE_URL = testDatabaseUrl();
