import { describe, expect, it } from "vitest";
import { authBaseUrl } from "./base-url";

const CUSTOM = "https://lengualearn.com";

describe("authBaseUrl", () => {
  it.each([
    ["local", {}, "http://localhost:3000"],
    [
      "local with an explicit URL",
      { BETTER_AUTH_URL: "http://localhost:4000" },
      "http://localhost:4000",
    ],
    [
      "production with the custom domain",
      {
        RAILWAY_ENVIRONMENT_NAME: "production",
        RAILWAY_PUBLIC_DOMAIN: "web-production.up.railway.app",
        BETTER_AUTH_URL: CUSTOM,
      },
      CUSTOM,
    ],
    [
      "production before a custom domain",
      {
        RAILWAY_ENVIRONMENT_NAME: "production",
        RAILWAY_PUBLIC_DOMAIN: "web-production.up.railway.app",
      },
      "https://web-production.up.railway.app",
    ],
    [
      "a PR environment that inherited the custom domain",
      {
        RAILWAY_ENVIRONMENT_NAME: "LenguaLearn-pr-12",
        RAILWAY_PUBLIC_DOMAIN: "web-lengualearn-pr-12.up.railway.app",
        BETTER_AUTH_URL: CUSTOM,
      },
      "https://web-lengualearn-pr-12.up.railway.app",
    ],
  ])("%s", (_label, env, expected) => {
    expect(authBaseUrl(env)).toBe(expected);
  });
});
