import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec: the engine is pure TypeScript with no database or UI imports, so it can be tested
// and simulated. This keeps it that way: relative imports and ts-fsrs only.

const ENGINE_DIR = new URL(".", import.meta.url).pathname;
const ALLOWED_PACKAGES = new Set(["ts-fsrs", "vitest", "node:fs", "node:path"]);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

describe("lib/engine imports", () => {
  it.each(files(ENGINE_DIR).map((f) => [f.slice(ENGINE_DIR.length), f]))(
    "%s imports only engine files and ts-fsrs",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      const specifiers = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]!);
      const bad = specifiers.filter((s) => !s.startsWith(".") && !ALLOWED_PACKAGES.has(s));
      expect(bad).toEqual([]);
    },
  );
});
