import { describe, expect, it } from "vitest";
import { parseCandidates, parseCsv } from "./candidates.ts";

// Test fixtures: tiny candidate files in the step 1 format.
const header = "rank,lemma,pos,level,count,themes,notes";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas, newlines and CRLF", () => {
    expect(parseCsv('a,"b,c","say ""hi""","x\ny"\r\n1,2,3,4\n')).toEqual([
      ["a", "b,c", 'say "hi"', "x\ny"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a,b\n\n\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("parseCandidates", () => {
  it("ranks rows by their position, so hand reordering needs no renumbering", () => {
    const rows = parseCandidates(`${header}\n9,casa,noun,1,5,,\n3,ser,verb,1,9,,\n`);
    expect(rows.map((r) => [r.rank, r.lemma])).toEqual([
      [1, "casa"],
      [2, "ser"],
    ]);
  });

  it("splits parts of speech and themes, and keeps notes", () => {
    const [row] = parseCandidates(
      `${header}\n1,bien,adverb|noun,1,5,feelings; daily-life,"also conj"\n`,
    );
    expect(row).toEqual({
      rank: 1,
      lemma: "bien",
      pos: ["adverb", "noun"],
      level: 1,
      themes: ["feelings", "daily-life"],
      notes: "also conj",
    });
  });

  it("puts rows into levels of 500 by position", () => {
    const body = Array.from({ length: 501 }, (_, i) => `${i + 1},w${i},noun,1,1,,`).join("\n");
    const rows = parseCandidates(`${header}\n${body}\n`);
    expect([rows[499]!.level, rows[500]!.level]).toEqual([1, 2]);
  });

  it("refuses a repeated lemma and a missing column", () => {
    expect(() => parseCandidates(`${header}\n1,casa,noun,1,1,,\n2,casa,noun,1,1,,\n`)).toThrow(
      /twice/,
    );
    expect(() => parseCandidates("rank,lemma\n1,casa\n")).toThrow(/no "pos" column/);
  });
});
