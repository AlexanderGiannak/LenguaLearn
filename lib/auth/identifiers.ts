import { randomInt, randomUUID } from "node:crypto";

// Seat codes and student handles (spec: Class student flow).

/** No 0/O, 1/I/L: codes are read off paper and typed by students. */
export const SEAT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SEAT_CODE_LENGTH = 8;

export function generateSeatCode(): string {
  let code = "";
  for (let i = 0; i < SEAT_CODE_LENGTH; i++) {
    code += SEAT_CODE_ALPHABET[randomInt(SEAT_CODE_ALPHABET.length)];
  }
  return code;
}

export function formatSeatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Turns what a student typed into a stored code, or null if it cannot be one. */
export function normalizeSeatCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s\-–—]/g, "");
  const valid = new RegExp(`^[${SEAT_CODE_ALPHABET}]{${SEAT_CODE_LENGTH}}$`);
  return valid.test(code) ? code : null;
}

// English word lists for handles. Short, friendly and neutral.
const ADJECTIVES = (
  "quiet brave calm clever bright gentle happy lucky swift kind bold eager fancy jolly lively proud silly witty zesty sunny" +
  " misty rapid steady sharp cosy golden silver polite humble merry nimble patient quick rosy sleepy tidy vivid warm wise young"
).split(" ");
const ANIMALS = (
  "otter falcon panda tiger koala lynx heron badger dolphin eagle fox gecko hare ibis jaguar lemur moose newt owl puffin" +
  " quail raven seal toucan walrus yak zebra beaver camel donkey ferret goose hippo iguana kiwi llama marmot ocelot pelican robin"
).split(" ");

/** A random handle such as quiet-otter-42 (40 × 40 × 90 = 144,000 combinations). */
export function generateHandle(): string {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const animal = ANIMALS[randomInt(ANIMALS.length)];
  return `${adjective}-${animal}-${randomInt(10, 100)}`;
}

/**
 * Better Auth requires an email on every user. Class students get a random address at the
 * reserved .invalid domain (RFC 2606), which can never receive mail and says nothing about
 * them. The mailer refuses these addresses.
 */
export function studentPlaceholderEmail(): string {
  return `${randomUUID()}@students.invalid`;
}

/** Username-only independent learners get the same kind of placeholder. */
export function learnerPlaceholderEmail(): string {
  return `${randomUUID()}@learners.invalid`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(".invalid");
}
