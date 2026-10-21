import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./origin";

const req = (headers: Record<string, string>) =>
  new Request("http://internal:3000/api/train/answer", { method: "POST", headers });

describe("isSameOrigin", () => {
  it("accepts a request from the app's own origin", () => {
    expect(isSameOrigin(req({ origin: "https://app.example", host: "app.example" }))).toBe(true);
  });

  it("uses the forwarded host behind a proxy", () => {
    expect(
      isSameOrigin(
        req({
          origin: "https://app.example",
          host: "internal:3000",
          "x-forwarded-host": "app.example",
        }),
      ),
    ).toBe(true);
  });

  it("refuses another site", () => {
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "app.example" }))).toBe(false);
  });

  it("refuses a lookalike host", () => {
    expect(
      isSameOrigin(req({ origin: "https://app.example.evil.example", host: "app.example" })),
    ).toBe(false);
  });

  it("refuses a request with no Origin header", () => {
    expect(isSameOrigin(req({ host: "app.example" }))).toBe(false);
  });

  it("refuses a malformed Origin", () => {
    expect(isSameOrigin(req({ origin: "null", host: "app.example" }))).toBe(false);
  });
});
