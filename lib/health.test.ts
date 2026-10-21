import { describe, expect, it } from "vitest";
import { checkDatabase } from "./health";

describe("checkDatabase", () => {
  it("returns true when the ping succeeds", async () => {
    await expect(checkDatabase(async () => [{ "?column?": 1 }], 100)).resolves.toBe(true);
  });

  it("returns false when the ping rejects", async () => {
    await expect(
      checkDatabase(async () => {
        throw new Error("connection refused");
      }, 100),
    ).resolves.toBe(false);
  });

  it("returns false when the ping is slower than the timeout", async () => {
    const slow = () => new Promise((resolve) => setTimeout(resolve, 200));
    await expect(checkDatabase(slow, 20)).resolves.toBe(false);
  });

  it("does not leak an unhandled rejection when a late ping fails", async () => {
    const lateFailure = () =>
      new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 40));
    await expect(checkDatabase(lateFailure, 10)).resolves.toBe(false);
    // Give the late rejection time to fire; Vitest fails the run if it is unhandled.
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
});
