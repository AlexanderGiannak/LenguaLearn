// Licenses a picture may have (owner, 2026-11-27: CC0, CC BY and CC BY-SA, plus public
// domain), written the way content:images stores them, e.g. "CC BY-SA 4.0".

const DEEDS: [RegExp, (v: string) => string][] = [
  [/^CC0 (1\.0)$/, (v) => `https://creativecommons.org/publicdomain/zero/${v}/`],
  [/^Public domain mark (1\.0)$/, (v) => `https://creativecommons.org/publicdomain/mark/${v}/`],
  [/^CC BY ([1-4]\.0)$/, (v) => `https://creativecommons.org/licenses/by/${v}/`],
  [/^CC BY-SA ([1-4]\.0)$/, (v) => `https://creativecommons.org/licenses/by-sa/${v}/`],
];

/** The Creative Commons deed for a stored license name, or null for any other license. */
export function licenseUrl(license: string): string | null {
  for (const [pattern, url] of DEEDS) {
    const m = pattern.exec(license);
    if (m) return url(m[1]!);
  }
  return null;
}
