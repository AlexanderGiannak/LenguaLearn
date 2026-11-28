import { describe, expect, it } from "vitest";
import { licenseUrl } from "./licenses";

describe("licenseUrl", () => {
  it("links each allowed license to its deed", () => {
    expect(licenseUrl("CC0 1.0")).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
    expect(licenseUrl("Public domain mark 1.0")).toBe(
      "https://creativecommons.org/publicdomain/mark/1.0/",
    );
    expect(licenseUrl("CC BY 2.0")).toBe("https://creativecommons.org/licenses/by/2.0/");
    expect(licenseUrl("CC BY-SA 4.0")).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
  });

  it("gives no link for anything else", () => {
    expect(licenseUrl("MIT")).toBeNull();
    expect(licenseUrl("CC BY-NC 4.0")).toBeNull();
    expect(licenseUrl("CC BY 9.0")).toBeNull();
  });
});
