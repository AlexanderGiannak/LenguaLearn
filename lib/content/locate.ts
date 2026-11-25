// Where a target word stands in an example sentence, as character offsets. Shared by the
// content scripts (step 3) and the review tool, so both place a word the same way.

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * The offsets of `surface` in `text` as a whole word (not inside another word), or why it
 * cannot be placed. Case must match. Offsets are UTF-16 indexes of NFC text, as JavaScript
 * and the import schema count them.
 */
export function locate(
  text: string,
  surface: string,
): { start: number; end: number } | { error: string } {
  const found: number[] = [];
  for (let i = text.indexOf(surface); i >= 0; i = text.indexOf(surface, i + 1)) {
    if (!isWordChar(text[i - 1]) && !isWordChar(text[i + surface.length])) found.push(i);
  }
  if (found.length === 0) return { error: `"${surface}" is not a word in the sentence` };
  if (found.length > 1) return { error: `"${surface}" appears ${found.length} times` };
  return { start: found[0]!, end: found[0]! + surface.length };
}
