import { describe, expect, it } from "vitest";
import { guessFirst, introQuestionType } from "./intro.ts";
import { casa, casita, fixtureSense } from "./test-fixtures.ts";

describe("guessFirst", () => {
  it("applies to true cognates and words with parts", () => {
    expect(guessFirst(fixtureSense({ id: 1, cognate: "true_cognate" }))).toBe(true);
    expect(guessFirst(fixtureSense({ id: 2, hasWordParts: true }))).toBe(true);
  });
  it("does not apply to false friends or plain words", () => {
    expect(guessFirst(fixtureSense({ id: 3, cognate: "false_friend" }))).toBe(false);
    expect(guessFirst(casa)).toBe(false);
  });
});

describe("introQuestionType", () => {
  it("follows Got it with an easy recognition question", () => {
    expect(introQuestionType("got_it", casa)).toBe("meaning_choice");
  });
  it("follows I already know this with a production question", () => {
    expect(introQuestionType("already_know", casa)).toBe("cloze_typed");
    expect(introQuestionType("already_know", casita)).toBe("meaning_typed");
  });
});
