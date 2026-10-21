import { describe, expect, it } from "vitest";
import {
  formatSeatCode,
  generateHandle,
  generateSeatCode,
  normalizeSeatCode,
  SEAT_CODE_ALPHABET,
  studentPlaceholderEmail,
} from "./identifiers";

describe("seat codes", () => {
  it("are 8 characters with no look-alike characters", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateSeatCode();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
    expect(SEAT_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("display as two groups of four", () => {
    expect(formatSeatCode("K7QM4TPX")).toBe("K7QM-4TPX");
  });

  it.each([
    ["k7qm-4tpx", "K7QM4TPX"],
    [" K7QM 4TPX ", "K7QM4TPX"],
    ["K7QM–4TPX", "K7QM4TPX"], // en dash pasted from a document
  ])("normalize %j", (input, expected) => {
    expect(normalizeSeatCode(input)).toBe(expected);
  });

  it("reject input that cannot be a code", () => {
    expect(normalizeSeatCode("K7QM-4TP")).toBeNull();
    expect(normalizeSeatCode("K7QM-4TPO")).toBeNull(); // O is not in the alphabet
  });
});

describe("handles", () => {
  it("look like quiet-otter-42", () => {
    for (let i = 0; i < 200; i++) expect(generateHandle()).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
  });

  it("are varied", () => {
    const handles = new Set(Array.from({ length: 200 }, () => generateHandle()));
    expect(handles.size).toBeGreaterThan(190);
  });
});

describe("studentPlaceholderEmail", () => {
  it("is random and at the reserved .invalid domain", () => {
    const a = studentPlaceholderEmail();
    expect(a).toMatch(/^[0-9a-f-]{36}@students\.invalid$/);
    expect(studentPlaceholderEmail()).not.toBe(a);
  });
});
