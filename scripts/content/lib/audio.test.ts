import { describe, expect, it } from "vitest";
import { audioFileKey, estimateTtsUsd, gainDb, parseLoudnorm } from "./audio.ts";

describe("audioFileKey", () => {
  it("is a stable media path for the same text", () => {
    const a = audioFileKey("fixture sentence one");
    expect(a).toMatch(/^audio\/[0-9a-f]{24}\.mp3$/);
    expect(audioFileKey("fixture sentence one")).toBe(a);
  });

  it("changes with the text, its Unicode form aside, and with a remake", () => {
    const a = audioFileKey("fixture sentence one");
    expect(audioFileKey("fixture sentence two")).not.toBe(a);
    expect(audioFileKey("é")).toBe(audioFileKey("é"));
    expect(audioFileKey("fixture sentence one", "2026-11-25T10:00:00Z")).not.toBe(a);
  });
});

describe("estimateTtsUsd", () => {
  it("prices by length, with a pause per clip", () => {
    expect(estimateTtsUsd([])).toBe(0);
    // 720 characters at 12 a second is one minute; plus 0.6 s for the clip.
    expect(estimateTtsUsd(["x".repeat(720)])).toBeCloseTo((60.6 / 60) * 0.015, 6);
  });
});

describe("parseLoudnorm", () => {
  const stderr = (i: string, tp: string) =>
    `[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "${i}",\n\t"input_tp" : "${tp}",\n\t"input_lra" : "1.20"\n}\n`;

  it("reads the measured loudness and peak", () => {
    expect(parseLoudnorm(stderr("-23.41", "-4.02"))).toEqual({
      integrated: -23.41,
      truePeak: -4.02,
    });
  });

  it("refuses silence and missing output", () => {
    expect(() => parseLoudnorm(stderr("-inf", "-inf"))).toThrow(/silent/);
    expect(() => parseLoudnorm("no json here")).toThrow(/no loudness/);
  });
});

describe("gainDb", () => {
  it("raises a quiet clip to the target", () => {
    expect(gainDb({ integrated: -24, truePeak: -10 })).toBe(8);
  });

  it("stops short when the peak would pass the ceiling", () => {
    expect(gainDb({ integrated: -24, truePeak: -3 })).toBe(1.5);
  });

  it("lowers a loud clip", () => {
    expect(gainDb({ integrated: -12, truePeak: 0.5 })).toBe(-4);
  });
});
