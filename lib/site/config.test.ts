import { describe, expect, it } from "vitest";
import { demoUrl, signupsOpen, tryDemoHref } from "./config";

describe("signupsOpen", () => {
  it.each([
    ["local and CI", {}, true],
    ["a Railway PR environment", { RAILWAY_ENVIRONMENT_NAME: "LenguaLearn-pr-12" }, true],
    ["the demo site", { RAILWAY_ENVIRONMENT_NAME: "demo", DEMO_SITE: "1" }, true],
    ["production before opening", { RAILWAY_ENVIRONMENT_NAME: "production" }, false],
    ["production once opened", { RAILWAY_ENVIRONMENT_NAME: "production", SIGNUPS_OPEN: "1" }, true],
    [
      "production with the switch set to anything else",
      { RAILWAY_ENVIRONMENT_NAME: "production", SIGNUPS_OPEN: "true" },
      false,
    ],
  ])("%s -> %s", (_label, env, expected) => {
    expect(signupsOpen(env)).toBe(expected);
  });
});

describe("demoUrl", () => {
  it("defaults to the demo site and can be overridden", () => {
    expect(demoUrl({})).toBe("https://try.lengualearn.com");
    expect(demoUrl({ DEMO_URL: "http://localhost:3001" })).toBe("http://localhost:3001");
  });
});

describe("tryDemoHref", () => {
  it("sends the real site to the demo, and the demo to its own landing page", () => {
    expect(tryDemoHref({ RAILWAY_ENVIRONMENT_NAME: "production" })).toBe(
      "https://try.lengualearn.com",
    );
    expect(tryDemoHref({ DEMO_SITE: "1" })).toBe("/");
  });
});
