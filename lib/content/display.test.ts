import { describe, expect, it } from "vitest";
import { articleFor, partOfSpeechLabel, registerLabel, splitAtOffsets } from "./display";

// TEST FIXTURE: Spanish text below is test data, not content.

describe("articleFor", () => {
  it.each([
    [{ partOfSpeech: "noun", gender: "m", articleOverride: null }, "el"],
    [{ partOfSpeech: "noun", gender: "f", articleOverride: null }, "la"],
    [{ partOfSpeech: "noun", gender: "both", articleOverride: null }, "el/la"],
    // el agua: feminine, but takes "el" before a stressed a-
    [{ partOfSpeech: "noun", gender: "f", articleOverride: "el" }, "el"],
    [{ partOfSpeech: "verb", gender: null, articleOverride: null }, null],
  ] as const)("%j -> %s", (lemma, expected) => {
    expect(articleFor(lemma)).toBe(expected);
  });
});

describe("partOfSpeechLabel", () => {
  it.each([
    [{ partOfSpeech: "noun", gender: "m" }, "masculine noun"],
    [{ partOfSpeech: "noun", gender: "f" }, "feminine noun"],
    [{ partOfSpeech: "noun", gender: "both" }, "masculine or feminine noun"],
    [{ partOfSpeech: "verb", gender: null }, "verb"],
  ] as const)("%j -> %s", (lemma, expected) => {
    expect(partOfSpeechLabel(lemma)).toBe(expected);
  });
});

describe("registerLabel", () => {
  it("says nothing for neutral words", () => {
    expect(registerLabel("neutral", null)).toBeNull();
  });
  it("names the region for regional words", () => {
    expect(registerLabel("regional", "Mexico")).toBe("Regional: Mexico");
  });
  it("labels formal words", () => {
    expect(registerLabel("formal", null)).toBe("Formal");
  });
});

describe("splitAtOffsets", () => {
  it("splits a sentence around the target", () => {
    expect(splitAtOffsets("Mi casa es pequeña.", 3, 7)).toEqual({
      before: "Mi ",
      target: "casa",
      after: " es pequeña.",
    });
  });

  it("handles a target at the start", () => {
    expect(splitAtOffsets("Tengo dos.", 0, 5)).toEqual({
      before: "",
      target: "Tengo",
      after: " dos.",
    });
  });
});
