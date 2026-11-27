import { describe, expect, it } from "vitest";
import {
  LemmaIndex,
  parseFrequencyList,
  rankLemmas,
  toCsv,
  type WiktionaryEntry,
} from "./word-list.ts";

// Test fixtures: hand-written entries shaped like kaikki.org's Wiktionary extract.
const own = (
  word: string,
  pos: string,
  forms: string[] = [],
  glosses: string[] = ["a meaning"],
): WiktionaryEntry => ({
  word,
  pos,
  lang_code: "es",
  senses: glosses.map((g) => ({ tags: [], glosses: [g] })),
  forms: forms.map((form) => ({ form, tags: pos === "noun" ? ["plural"] : ["feminine"] })),
});
const formOf = (word: string, ...lemmas: string[]): WiktionaryEntry => ({
  word,
  pos: "verb",
  lang_code: "es",
  senses: lemmas.map((l) => ({ form_of: [{ word: l }], tags: ["form-of"] })),
});

function index(entries: WiktionaryEntry[]): LemmaIndex {
  const idx = new LemmaIndex();
  for (const e of entries) idx.add(e);
  return idx;
}

const opts = { limit: 100, levelBandSize: 2 };

describe("parseFrequencyList", () => {
  it("reads 'form count' lines and skips blanks and junk", () => {
    expect(parseFrequencyList("de 100\n\nque 90\nbad\nx abc\n")).toEqual([
      { form: "de", count: 100 },
      { form: "que", count: 90 },
    ]);
  });

  it("NFC-normalizes forms", () => {
    const decomposed = "niño 5";
    expect(parseFrequencyList(decomposed)[0]!.form).toBe("niño");
  });
});

describe("rankLemmas", () => {
  it("adds every form's count to its lemma and ranks by the total", () => {
    const idx = index([
      own("hablar", "verb"),
      formOf("hablo", "hablar"),
      formOf("habla", "hablar"),
      own("casa", "noun", ["casas"]),
    ]);
    const { candidates } = rankLemmas(
      parseFrequencyList("casa 50\ncasas 20\nhablo 40\nhabla 40"),
      idx,
      opts,
    );
    expect(candidates.map((c) => [c.lemma, c.count, c.rank, c.level])).toEqual([
      ["hablar", 80, 1, 1],
      ["casa", 70, 2, 1],
    ]);
  });

  it("drops articles, prepositions, pronouns and conjunctions, and lists them", () => {
    const idx = index([own("de", "prep"), own("la", "article"), own("casa", "noun")]);
    const { candidates, dropped } = rankLemmas(
      parseFrequencyList("de 100\nla 90\ncasa 10"),
      idx,
      opts,
    );
    expect(candidates.map((c) => c.lemma)).toEqual(["casa"]);
    expect(dropped).toEqual([
      { lemma: "de", count: 100, reason: "prep" },
      { lemma: "la", count: 90, reason: "article" },
    ]);
  });

  it("keeps a word used mostly as a content word, and notes the dropped uses", () => {
    const idx = index([own("nada", "pron"), own("nada", "noun", [], ["nothingness", "the void"])]);
    const { candidates } = rankLemmas(parseFrequencyList("nada 100"), idx, opts);
    expect(candidates[0]).toMatchObject({ lemma: "nada", pos: ["noun"], notes: "also pron" });
  });

  it("drops a word used mostly (or equally) as a function word", () => {
    const idx = index([
      own("a", "prep", [], ["to", "by", "at", "on"]),
      own("a", "intj"),
      own("yo", "pron"),
      own("yo", "noun"),
    ]);
    const { candidates, dropped } = rankLemmas(parseFrequencyList("a 100\nyo 50"), idx, opts);
    expect(candidates).toEqual([]);
    expect(dropped.map((d) => d.lemma)).toEqual(["a", "yo"]);
  });

  it("keeps listed function words, taught as pronouns, prepositions or conjunctions", () => {
    const idx = index([
      own("alguien", "pron"),
      own("otro", "pron", [], ["another", "other", "else"]),
      own("otro", "adj"),
      own("el", "article"),
      own("yo", "pron"),
    ]);
    const { candidates, dropped } = rankLemmas(
      parseFrequencyList("alguien 30\notro 20\nel 10\nyo 5"),
      idx,
      { ...opts, keep: new Set(["alguien", "otro", "el"]) },
    );
    expect(candidates.map((c) => [c.lemma, c.pos, c.notes])).toEqual([
      ["alguien", ["pronoun"], ""],
      ["otro", ["adjective", "pronoun"], ""],
    ]);
    // Articles are never taught as cards, even when listed; unlisted pronouns still drop.
    expect(dropped.map((d) => d.lemma)).toEqual(["el", "yo"]);
  });

  it("ignores letter names, musical notes and spelling pointers", () => {
    const idx = index([
      own("de", "noun", [], ["The name of the Latin script letter D/d."]),
      own("de", "prep"),
      own("la", "noun", [], ["la (sixth note of the scale)"]),
      own("la", "article"),
      own("se", "verb", [], ["misspelling of sé"]),
      own("se", "pron"),
    ]);
    const { candidates } = rankLemmas(parseFrequencyList("de 3\nla 2\nse 1"), idx, opts);
    expect(candidates).toEqual([]);
  });

  it("leaves out vulgar and offensive senses, and words that have only those", () => {
    const tagged = (word: string, senses: string[][]): WiktionaryEntry => ({
      word,
      pos: "verb",
      lang_code: "es",
      senses: senses.map((tags) => ({ glosses: ["a meaning"], tags })),
    });
    const idx = index([
      tagged("coger", [[], ["Latin-America", "vulgar"]]),
      tagged("joder", [["vulgar"]]),
    ]);
    const { candidates, dropped } = rankLemmas(parseFrequencyList("coger 10\njoder 9"), idx, opts);
    expect(candidates[0]).toMatchObject({
      lemma: "coger",
      notes: "has vulgar or offensive senses: leave them out",
    });
    expect(dropped).toEqual([{ lemma: "joder", count: 9, reason: "unsuitable" }]);
  });

  it("does not let a vulgar-only headword take a clean word's plural", () => {
    const idx = index([
      own("huevo", "noun", ["huevos"]),
      {
        word: "huevos",
        pos: "noun",
        lang_code: "es",
        senses: [{ glosses: ["x"], tags: ["vulgar"] }],
      },
    ]);
    expect(idx.candidates("huevos")).toEqual(["huevo"]);
  });

  it("files the particle sí as an adverb", () => {
    const idx = index([own("sí", "particle")]);
    expect(rankLemmas(parseFrequencyList("sí 9"), idx, opts).candidates[0]!.pos).toEqual([
      "adverb",
    ]);
  });

  it("gives an ambiguous form's count to the function word it spells", () => {
    // "como" is mostly "as/like", rarely "I eat".
    const idx = index([own("como", "conj"), own("como", "adv"), own("comer", "verb")]);
    // Tie between conj and adv senses: "como" itself is dropped, but keeps its count.
    idx.add(formOf("como", "comer"));
    idx.add(formOf("comemos", "comer"));
    const { candidates } = rankLemmas(parseFrequencyList("como 100\ncomemos 10"), idx, opts);
    expect(candidates.map((c) => [c.lemma, c.count])).toEqual([["comer", 10]]);
  });

  it("shares other ambiguous counts by each lemma's evidence", () => {
    // "era": an age, or "it was". ser's other forms dwarf "era" itself.
    const idx = index([own("era", "noun"), own("ser", "verb")]);
    idx.add(formOf("era", "ser"));
    idx.add(formOf("es", "ser"));
    const { candidates } = rankLemmas(parseFrequencyList("es 900\nera 100"), idx, opts);
    const byLemma = Object.fromEntries(candidates.map((c) => [c.lemma, c.count]));
    // Weights: ser 900 + 1, era 0 + 100 (its own spelling) + 1.
    expect(byLemma.ser).toBe(Math.round(900 + (100 * 901) / 1002));
    expect(byLemma.era).toBe(Math.round((100 * 101) / 1002));
  });

  it("gives a headword most of its own spelling when the other reading is rarer", () => {
    // "casa": house, or "he marries"; "casas" is ambiguous too.
    const idx = index([own("casa", "noun", ["casas"]), own("casar", "verb")]);
    idx.add(formOf("casa", "casar"));
    idx.add(formOf("casas", "casar"));
    idx.add(formOf("casado", "casar"));
    const { candidates } = rankLemmas(
      parseFrequencyList("casa 100\ncasas 10\ncasado 20"),
      idx,
      opts,
    );
    expect(candidates.map((c) => c.lemma)).toEqual(["casa", "casar"]);
    expect(candidates[0]!.notes).toBe("count shared with casar");
  });

  it("counts a lemma's own ambiguous spelling as evidence in other splits", () => {
    // "cosa" (thing) is also a form of coser (to sew), and so is "cosas".
    const idx = index([own("cosa", "noun", ["cosas"]), own("coser", "verb")]);
    for (const f of ["cosa", "cosas", "cosiendo"]) idx.add(formOf(f, "coser"));
    const { candidates } = rankLemmas(
      parseFrequencyList("cosa 100\ncosas 80\ncosiendo 2"),
      idx,
      opts,
    );
    expect(candidates.map((c) => c.lemma)).toEqual(["cosa", "coser"]);
    expect(candidates[1]!.count).toBeLessThan(10);
  });

  it("folds a verb form listed as an interjection into its verb", () => {
    const idx = index([
      own("mira", "intj"),
      own("mirar", "verb"),
      own("mira", "noun"),
      own("vamos", "intj"),
      own("ir", "verb"),
    ]);
    idx.add(formOf("mira", "mirar"));
    idx.add(formOf("vamos", "ir"));
    expect(idx.candidates("vamos")).toEqual(["ir"]);
    // "mira" is also a noun (a gunsight), so it stays a word of its own.
    expect(idx.candidates("mira")).toEqual(["mira", "mirar"]);
  });

  it("links only real inflections from a headword's forms table", () => {
    const entry = (word: string, pos: string, forms: [string, string[]][]): WiktionaryEntry => ({
      word,
      pos,
      lang_code: "es",
      senses: [{ glosses: ["a meaning"] }],
      forms: forms.map(([form, tags]) => ({ form, tags })),
    });
    const idx = index([
      entry("madre", "noun", [
        ["madres", ["plural"]],
        ["padre", ["masculine"]],
      ]),
      entry("bueno", "adj", [
        ["buena", ["feminine"]],
        ["mejor", ["comparative"]],
      ]),
      entry("contravenir", "verb", [
        ["contravengo", ["first-person", "present", "singular"]],
        ["venir", ["class"]],
        ["es-conj", ["inflection-template"]],
      ]),
    ]);
    expect(idx.candidates("madres")).toEqual(["madre"]);
    expect(idx.candidates("padre")).toEqual([]);
    expect(idx.candidates("buena")).toEqual(["bueno"]);
    expect(idx.candidates("mejor")).toEqual([]);
    expect(idx.candidates("contravengo")).toEqual(["contravenir"]);
    expect(idx.candidates("venir")).toEqual([]);
  });

  it("treats alternative spellings and apocopic adjectives as forms", () => {
    const alt = (word: string, pos: string, target: string, tags: string[]): WiktionaryEntry => ({
      word,
      pos,
      lang_code: "es",
      senses: [{ glosses: [`form of ${target}`], alt_of: [{ word: target }], tags }],
    });
    const idx = index([
      own("quizá", "adv"),
      alt("quizás", "adv", "quizá", ["alt-of", "alternative"]),
      own("bueno", "adj"),
      alt("buen", "adj", "bueno", ["alt-of", "apocopic"]),
      own("mucho", "adj"),
      alt("muy", "adv", "mucho", ["alt-of", "apocopic"]),
    ]);
    expect(idx.candidates("quizás")).toEqual(["quizá"]);
    expect(idx.candidates("buen")).toEqual(["bueno"]);
    // "muy" stays a word of its own.
    expect(idx.candidates("muy")).toEqual(["muy"]);
  });

  it("skips inflected-only entries and capitalized names, and reports unknown forms", () => {
    const idx = index([own("María", "name"), formOf("fue", "ir", "ser")]);
    const { candidates, unmatched } = rankLemmas(
      parseFrequencyList("fue 10\nmaría 5\nokey 3"),
      idx,
      opts,
    );
    // ir and ser have no entries of their own in this fixture, so "fue" matches nothing.
    expect(candidates).toEqual([]);
    expect(unmatched.map((u) => u.form)).toEqual(["fue", "maría", "okey"]);
  });

  it("stops at the limit and bands levels by rank", () => {
    const idx = index(["uno", "dos", "tres", "cuatro", "cinco"].map((w) => own(w, "num")));
    const { candidates } = rankLemmas(
      parseFrequencyList("uno 5\ndos 4\ntres 3\ncuatro 2\ncinco 1"),
      idx,
      { limit: 3, levelBandSize: 2 },
    );
    expect(candidates.map((c) => [c.lemma, c.level])).toEqual([
      ["uno", 1],
      ["dos", 1],
      ["tres", 2],
    ]);
  });
});

describe("toCsv", () => {
  it("quotes fields with commas, quotes or newlines", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"']])).toBe('a,b\n"x,y","say ""hi"""\n');
  });
});
