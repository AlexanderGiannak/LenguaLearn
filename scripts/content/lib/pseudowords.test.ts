import { describe, expect, it } from "vitest";
import { filterPseudowords, oneEditApart, unaccented } from "./pseudowords.ts";

// TEST FIXTURES: the Spanish words below are test data, not content.

describe("oneEditApart", () => {
  it.each([
    ["mesa", "mesta", true],
    ["mesa", "mes", true],
    ["mesa", "musa", true],
    ["mesa", "mesa", false],
    ["mesa", "masas", false],
    ["casa", "cosas", false],
  ])("%s / %s -> %s", (a, b, expected) => {
    expect(oneEditApart(a, b)).toBe(expected);
    expect(oneEditApart(b, a)).toBe(expected);
  });
});

describe("unaccented", () => {
  it("drops accents but keeps ñ apart from n only by its tilde", () => {
    expect(unaccented("canción")).toBe("cancion");
    expect(unaccented("año")).toBe("ano");
  });
});

describe("filterPseudowords", () => {
  const known = new Set(["casa", "casas", "mesa", "perro", "cantó"]);
  const common = ["casa", "mesa", "perro"];

  it("keeps plausible made-up words", () => {
    expect(filterPseudowords(["trelpo", "bormesa"], known, common)).toEqual([
      { word: "trelpo", ok: true },
      { word: "bormesa", ok: true },
    ]);
  });

  it("drops real words, including with a different accent", () => {
    const [plain, accented] = filterPseudowords(["casas", "canto"], known, common);
    expect(plain).toMatchObject({ ok: false, reason: "a real word or word form" });
    expect(accented).toMatchObject({ ok: false, reason: "a real word or word form" });
  });

  it("drops near-misses of common words a reader could mistake them for", () => {
    expect(filterPseudowords(["pérro", "mesta"], known, common)).toEqual([
      { word: "pérro", ok: false, reason: "a real word or word form" },
      { word: "mesta", ok: false, reason: 'one letter from the common word "mesa"' },
    ]);
  });

  it("drops bad shapes and repeats, and normalizes case", () => {
    expect(
      filterPseudowords(["Trelpo", "trelpo", "abc", "tre lpo", "trelpo1"], known, common).map(
        (v) => v.reason ?? "ok",
      ),
    ).toEqual([
      "ok",
      "repeated",
      "not 4–14 lowercase Spanish letters",
      "not 4–14 lowercase Spanish letters",
      "not 4–14 lowercase Spanish letters",
    ]);
  });
});
