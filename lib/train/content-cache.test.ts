import { beforeEach, describe, expect, it } from "vitest";
import { cachedTrainingContent, clearTrainingContentCache } from "./content-cache";

describe("training content cache", () => {
  beforeEach(() => clearTrainingContentCache());

  it("serves the cached copy until it expires", async () => {
    let loads = 0;
    const load = async () => ++loads;
    expect(await cachedTrainingContent(load, 60_000)).toBe(1);
    expect(await cachedTrainingContent(load, 60_000)).toBe(1);
    clearTrainingContentCache();
    expect(await cachedTrainingContent(load, 60_000)).toBe(2);
  });

  it("does not keep a copy that was loading when the cache was cleared", async () => {
    let finish!: (v: string) => void;
    const slow = cachedTrainingContent(() => new Promise<string>((r) => (finish = r)), 60_000);
    clearTrainingContentCache(); // e.g. a report paused a sense meanwhile
    finish("before the report");
    expect(await slow).toBe("before the report");
    expect(await cachedTrainingContent(async () => "after the report", 60_000)).toBe(
      "after the report",
    );
  });
});
