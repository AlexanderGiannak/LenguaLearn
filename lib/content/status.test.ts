import { describe, expect, it } from "vitest";
import { CONTENT_STATUSES, type ContentStatus } from "./constants";
import { canTransition } from "./status";

// Every allowed step. Any pair not listed here must be refused.
const ALLOWED: [ContentStatus, ContentStatus][] = [
  ["draft", "ai_checked"],
  ["draft", "retired"],
  ["ai_checked", "approved"],
  ["ai_checked", "draft"],
  ["ai_checked", "retired"],
  ["approved", "live"],
  ["approved", "draft"],
  ["approved", "retired"],
  ["live", "retired"],
  ["retired", "draft"],
];

describe("canTransition", () => {
  const allPairs = CONTENT_STATUSES.flatMap((from) =>
    CONTENT_STATUSES.map((to) => [from, to] as [ContentStatus, ContentStatus]),
  );

  it.each(allPairs)("%s -> %s", (from, to) => {
    const expected = ALLOWED.some(([f, t]) => f === from && t === to);
    expect(canTransition(from, to)).toBe(expected);
  });

  it("never lets content reach live without being approved first", () => {
    for (const from of CONTENT_STATUSES) {
      if (from !== "approved") expect(canTransition(from, "live")).toBe(false);
    }
  });

  it("never lets content skip the AI check on the way to approved", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("retired", "approved")).toBe(false);
  });
});
