import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

// Locally, the seed step and the tests need ADMIN_API_TOKEN from .env.local.
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI sets the environment directly.
}

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  // The two classroom targets from the spec: school Chromebooks and phones.
  // The seed project loads the fixture words first; both device projects depend on it.
  projects: [
    { name: "seed", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromebook",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
      dependencies: ["seed"],
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
      dependencies: ["seed"],
    },
  ],
  webServer: {
    // CI runs the production build; locally reuse `npm run dev` if it is already up.
    command: isCI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
