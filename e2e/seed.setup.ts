import { execFileSync } from "node:child_process";
import { test as setup } from "@playwright/test";

// Runs once before the browser projects: loads and publishes the fixture words through
// the admin API of the server Playwright started.
setup("seed fixture words", () => {
  execFileSync("node", ["scripts/seed-fixtures.mts", "http://localhost:3000"], {
    stdio: "inherit",
    env: process.env,
  });
});
