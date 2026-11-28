import { describe, expect, it } from "vitest";
import {
  attributionFor,
  chosenIndex,
  estimateImagesUsd,
  generatedUsd,
  imageFileKey,
  licenseName,
  searchQuery,
  toCandidate,
  USD_PER_GENERATED,
  type OpenverseImage,
} from "./images.ts";

// Test fixtures: hand-written results shaped like Openverse's image search.
const result = (over: Partial<OpenverseImage> = {}): OpenverseImage => ({
  id: "1",
  title: "Red car",
  url: "https://upload.example.org/red-car.jpg",
  foreign_landing_url: "https://commons.example.org/wiki/File:Red_car.jpg",
  creator: "A. Photographer",
  license: "by-sa",
  license_version: "4.0",
  provider: "wikimedia",
  width: 1200,
  height: 800,
  mature: false,
  ...over,
});

describe("licenseName", () => {
  it("names the allowed licenses with their version", () => {
    expect(licenseName("cc0", "1.0")).toBe("CC0 1.0");
    expect(licenseName("pdm", "1.0")).toBe("Public domain mark 1.0");
    expect(licenseName("by", "2.0")).toBe("CC BY 2.0");
    expect(licenseName("BY-SA", "4.0")).toBe("CC BY-SA 4.0");
  });

  it("refuses NonCommercial, NoDerivatives and unknown versions", () => {
    for (const l of ["by-nc", "by-nd", "by-nc-sa", "by-nc-nd", "sampling+"]) {
      expect(licenseName(l, "4.0")).toBeNull();
    }
    expect(licenseName("by", null)).toBeNull();
    expect(licenseName("by", "5.0")).toBeNull();
  });
});

describe("toCandidate", () => {
  const none = new Set<string>();

  it("keeps an allowed picture with its credit", () => {
    expect(toCandidate(result(), none)).toEqual({
      url: "https://upload.example.org/red-car.jpg",
      source: "https://commons.example.org/wiki/File:Red_car.jpg",
      license: "CC BY-SA 4.0",
      attribution: "“Red car” by A. Photographer via wikimedia",
    });
  });

  it("drops disallowed, mature, tiny, banner-shaped and rejected pictures", () => {
    expect(toCandidate(result({ license: "by-nc" }), none)).toBeNull();
    expect(toCandidate(result({ mature: true }), none)).toBeNull();
    expect(toCandidate(result({ width: 200 }), none)).toBeNull();
    expect(toCandidate(result({ width: 3000, height: 400 }), none)).toBeNull();
    expect(toCandidate(result({ url: "http://insecure.example.org/x.jpg" }), none)).toBeNull();
    const rejected = new Set(["https://commons.example.org/wiki/File:Red_car.jpg"]);
    expect(toCandidate(result(), rejected)).toBeNull();
  });
});

describe("attributionFor", () => {
  it("fits a long title into 200 characters", () => {
    const a = attributionFor(result({ title: "x".repeat(400) }));
    expect(a.length).toBeLessThanOrEqual(200);
    expect(a.endsWith("by A. Photographer via wikimedia")).toBe(true);
  });

  it("says Photo when there is no title", () => {
    expect(attributionFor(result({ title: "", provider: null, source: null }))).toBe(
      "Photo by A. Photographer",
    );
  });
});

describe("searchQuery", () => {
  it("keeps the first meaning without articles, notes or a verb's 'to'", () => {
    expect(searchQuery("the car")).toBe("car");
    expect(searchQuery("apple (fruit)")).toBe("apple");
    expect(searchQuery("path, trail")).toBe("path");
    expect(searchQuery("to dance")).toBe("dance");
  });
});

describe("chosenIndex", () => {
  it("accepts a number in range with alt text, and nothing else", () => {
    expect(chosenIndex({ choice: 2, reason: "", alt: "A red car." }, 3)).toBe(1);
    expect(chosenIndex({ choice: 0, reason: "", alt: "" }, 3)).toBeNull();
    expect(chosenIndex({ choice: 4, reason: "", alt: "A red car." }, 3)).toBeNull();
    expect(chosenIndex({ choice: 1, reason: "", alt: " " }, 3)).toBeNull();
  });
});

describe("costs", () => {
  it("prices a generated picture from its usage, or the estimate without one", () => {
    expect(generatedUsd({ input_tokens: 100_000, output_tokens: 1_000_000 })).toBeCloseTo(30.5);
    expect(generatedUsd(null)).toBe(USD_PER_GENERATED);
  });

  it("estimates a run", () => {
    const e = estimateImagesUsd(100);
    expect(e.typical).toBeCloseTo(4.5);
    expect(e.most).toBeCloseTo(15);
  });
});

describe("imageFileKey", () => {
  it("is a stable hash of the bytes", () => {
    const a = imageFileKey(new Uint8Array([1, 2, 3]));
    expect(a).toMatch(/^images\/[0-9a-f]{24}\.jpg$/);
    expect(imageFileKey(new Uint8Array([1, 2, 3]))).toBe(a);
    expect(imageFileKey(new Uint8Array([1, 2, 4]))).not.toBe(a);
  });
});
