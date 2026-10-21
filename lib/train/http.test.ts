import { afterEach, describe, expect, it, vi } from "vitest";
import { trainingUserId } from "./http";

afterEach(() => vi.unstubAllEnvs());

describe("trainingUserId", () => {
  it("is the dev user only where ENABLE_DEV_USER=1", () => {
    vi.stubEnv("ENABLE_DEV_USER", "1");
    expect(trainingUserId()).toBe("dev-user");
  });

  it("lets a dev-user cookie pick a separate dev user", () => {
    vi.stubEnv("ENABLE_DEV_USER", "1");
    const req = (cookie: string) => new Request("http://x/", { headers: { cookie } });
    expect(trainingUserId(req("a=1; dev-user=phone-42"))).toBe("dev-phone-42");
    expect(trainingUserId(req("dev-user=Bad Value"))).toBe("dev-user");
  });

  it("ignores the cookie when the dev user is off", () => {
    vi.stubEnv("ENABLE_DEV_USER", "");
    expect(
      trainingUserId(new Request("http://x/", { headers: { cookie: "dev-user=x" } })),
    ).toBeNull();
  });

  it("is nobody otherwise, so production training routes answer 404", () => {
    vi.stubEnv("ENABLE_DEV_USER", "");
    expect(trainingUserId()).toBeNull();
    vi.stubEnv("ENABLE_DEV_USER", "true");
    expect(trainingUserId()).toBeNull();
  });
});
