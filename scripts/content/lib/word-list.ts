// Builds the frequency-ranked lemma list (spec: Content pipeline, step 1) from two openly
// licensed sources: a word-form frequency list (counts of spelled forms such as "fue") and
// Wiktionary's Spanish entries, which say which dictionary word each form belongs to.
// Pure functions only; scripts/content/word-list.mts does the reading and writing.

/** Wiktionary parts of speech that become cards. */
const KEPT_POS = {
  noun: "noun",
  verb: "verb",
  adj: "adjective",
  adv: "adverb",
  intj: "interjection",
  num: "numeral",
  det: "determiner",
  phrase: "phrase",
  adv_phrase: "phrase",
  // Wiktionary files "sí" (yes) as a particle; Spanish grammars call it an adverb.
  particle: "adverb",
} as const;

/**
 * Function words: left out as standalone cards (spec: articles, prepositions, pronouns and
 * conjunctions; students meet them in example sentences), plus contractions such as "del".
 * Every other part of speech that is not in KEPT_POS is also left out, because it is not
 * vocabulary (names, affixes, symbols) or not a single word (proverbs).
 */
const FUNCTION_POS = new Set(["article", "prep", "prep_phrase", "pron", "conj", "contraction"]);

/**
 * Senses that are not vocabulary of their own: letter names ("de" is also the letter D),
 * musical notes ("la", "mi"), and pointers to another spelling. Without this, "de", "te"
 * and "la" would survive as nouns.
 */
const IGNORED_GLOSS =
  /^(?:the )?name of the (?:latin[- ]script )?letter|\b(?:greek|hebrew|cyrillic) letter\b|note of the (?:musical )?scale|^(?:misspelling|alternative (?:form|spelling)|obsolete (?:form|spelling)|archaic spelling|abbreviation|initialism|acronym) of\b/i;

export type KeptPos = (typeof KEPT_POS)[keyof typeof KEPT_POS];

/** The fields of a Wiktionary (kaikki.org) entry that this module reads. */
export type WiktionaryEntry = {
  word: string;
  pos: string;
  lang_code?: string;
  senses?: {
    form_of?: { word: string }[];
    alt_of?: { word: string }[];
    tags?: string[];
    glosses?: string[];
  }[];
  forms?: { form: string; tags?: string[] }[];
};

export type FormCount = { form: string; count: number };

/**
 * Senses never taught in a school app. A word with only such senses is dropped; a word
 * with some ("coger" in Latin America) is kept with a note so generation leaves them out.
 */
const UNSUITABLE_TAGS = new Set(["vulgar", "offensive", "derogatory", "slur", "pejorative"]);

const VERB_FORM_TAGS = new Set([
  "first-person",
  "second-person",
  "third-person",
  "infinitive",
  "gerund",
  "participle",
  "imperative",
  "combined-form",
]);
const NOT_AN_INFLECTION =
  /^(?:table-tags|inflection-template|class|alternative|obsolete|archaic|misspelling|nonstandard|proscribed|dated|rare|uncommon|colloquial|dialectal|abbreviation|diminutive|augmentative|comparative|superlative|canonical)$/;

/**
 * Whether a row of a headword's forms table is an inflection of that headword. The tables
 * also hold other words: a noun's other-gender word (madre lists padre), comparatives
 * (bueno lists mejor), and template notes ("conjugated like venir").
 */
function isInflection(pos: string, tags: string[]): boolean {
  if (tags.length === 0 || tags.some((t) => NOT_AN_INFLECTION.test(t))) return false;
  if (pos === "noun") return tags.length === 1 && tags[0] === "plural";
  if (pos === "adj")
    return tags.every((t) => ["feminine", "masculine", "plural", "singular"].includes(t));
  if (pos === "verb") return tags.some((t) => VERB_FORM_TAGS.has(t));
  return false;
}

export function parseFrequencyList(text: string): FormCount[] {
  const rows: FormCount[] = [];
  for (const line of text.split("\n")) {
    const [form, count] = line.trim().split(/\s+/);
    if (!form || !count) continue;
    const n = Number(count);
    if (Number.isFinite(n) && n > 0) rows.push({ form: form.normalize("NFC"), count: n });
  }
  return rows;
}

/** What Wiktionary says about one headword, across its parts of speech. */
type HeadwordInfo = {
  kept: Set<KeptPos>;
  dropped: Set<string>;
  /** Senses in kept parts of speech, and in function-word ones. */
  keptSenses: number;
  functionSenses: number;
  /** Senses left out because they are vulgar, offensive or slurs. */
  unsuitableSenses: number;
};

export class LemmaIndex {
  /** Headwords that have senses of their own (not only "inflection of ..."). */
  readonly headwords = new Map<string, HeadwordInfo>();
  /** Spelled form -> headwords it can be a form of. A headword is also a form of itself. */
  readonly formsOf = new Map<string, Set<string>>();

  add(entry: WiktionaryEntry): void {
    if (entry.lang_code && entry.lang_code !== "es") return;
    const word = entry.word.normalize("NFC");
    // Frequency lists are lowercase. Capitalized entries are names and abbreviations.
    if (word !== word.toLocaleLowerCase("es")) return;
    const senses = entry.senses ?? [];
    let ownSenses = 0;
    let unsuitable = 0;
    for (const sense of senses) {
      const tags = sense.tags ?? [];
      // An apocopic adjective is a form of the full one (buen -> bueno, gran -> grande).
      // Other apocopic words are words of their own: "muy" is not taught as "mucho".
      const altIsForm = !tags.includes("apocopic") || entry.pos === "adj";
      const targets = [...(sense.form_of ?? []), ...(altIsForm ? (sense.alt_of ?? []) : [])];
      if (targets.length > 0) {
        for (const t of targets) this.link(word, t.word.normalize("NFC"));
      } else if (tags.some((t) => UNSUITABLE_TAGS.has(t))) {
        unsuitable++;
      } else if (!IGNORED_GLOSS.test(sense.glosses?.[0] ?? "")) {
        ownSenses++;
      }
    }
    if (ownSenses === 0 && unsuitable === 0) return;

    const info = this.headwords.get(word) ?? {
      kept: new Set(),
      dropped: new Set(),
      keptSenses: 0,
      functionSenses: 0,
      unsuitableSenses: 0,
    };
    info.unsuitableSenses += unsuitable;
    this.headwords.set(word, info);
    this.link(word, word);
    if (ownSenses === 0) return;
    const kept = KEPT_POS[entry.pos as keyof typeof KEPT_POS];
    if (kept) {
      info.kept.add(kept);
      info.keptSenses += ownSenses;
    } else {
      info.dropped.add(entry.pos);
      if (FUNCTION_POS.has(entry.pos)) info.functionSenses += ownSenses;
    }
    // Plurals, adjective endings and conjugations listed on the headword's own entry.
    for (const f of entry.forms ?? []) {
      const form = f.form.normalize("NFC");
      if (/^[\p{Ll}]+$/u.test(form) && isInflection(entry.pos, f.tags ?? [])) {
        this.link(form, word);
      }
    }
  }

  private link(form: string, headword: string): void {
    const set = this.formsOf.get(form) ?? new Set<string>();
    set.add(headword);
    this.formsOf.set(form, set);
  }

  /**
   * Headwords a form belongs to, keeping only headwords with senses of their own. A
   * headword whose only senses are unsuitable gives way to a clean one with the same
   * spelling: "huevos" (vulgar) must not take the count of huevo's plural (eggs).
   */
  candidates(form: string): string[] {
    const all = [...(this.formsOf.get(form) ?? [])].filter((h) => this.headwords.has(h)).sort();
    const clean = all.filter((h) => {
      const info = this.headwords.get(h)!;
      return info.keptSenses + info.functionSenses > 0 || info.dropped.size > 0;
    });
    const pool = clean.length > 0 ? clean : all;
    // "sabes", "vamos": verb forms that Wiktionary also lists as interjections. They are
    // taught as senses of the verb, not as separate cards. Only interjection-only entries
    // fold: adverbs such as "así" (also a form of asir) are words of their own.
    const hasVerb = pool.some((h) => h !== form && this.headwords.get(h)!.kept.has("verb"));
    if (!hasVerb) return pool;
    const words = pool.filter((h) => {
      if (h !== form) return true;
      const info = this.headwords.get(h)!;
      return !(info.kept.size === 1 && info.kept.has("interjection") && info.dropped.size === 0);
    });
    return words.length > 0 ? words : pool;
  }

  isFunctionWord(headword: string): boolean {
    const info = this.headwords.get(headword);
    return !!info && [...info.dropped].some((p) => FUNCTION_POS.has(p));
  }
}

export type Candidate = {
  rank: number;
  lemma: string;
  pos: KeptPos[];
  level: number;
  count: number;
  notes: string;
};
export type Dropped = { lemma: string; count: number; reason: string };

/**
 * Turns form counts into lemma counts and ranks them. A form that belongs to one lemma
 * gives it its whole count. An ambiguous form follows two rules:
 * - If the form is itself a function word ("como", "para", "nada"), the count stays there:
 *   those uses dwarf the other readings ("I eat", "it stops", "it swims").
 * - Otherwise the count is shared in proportion to each lemma's evidence: its unambiguous
 *   count, plus the count of its own spelling when that spelling is ambiguous too. Most of
 *   "era" goes to ser (whose es, soy, eres... dwarf it), most of "casa" to the noun
 *   (casar's casado, casó... are far rarer than "casa" itself), and most of "cosas" to cosa
 *   rather than to coser, although "cosa" is itself a form of coser.
 */
export function rankLemmas(
  forms: FormCount[],
  index: LemmaIndex,
  opts: { limit: number; levelBandSize: number },
): { candidates: Candidate[]; dropped: Dropped[]; unmatched: FormCount[] } {
  const unambiguous = new Map<string, number>();
  const ambiguous: { form: string; count: number; lemmas: string[] }[] = [];
  const totals = new Map<string, number>();
  const shared = new Map<string, Set<string>>();
  const unmatched: FormCount[] = [];
  const add = (lemma: string, n: number) => totals.set(lemma, (totals.get(lemma) ?? 0) + n);

  for (const { form, count } of forms) {
    const lemmas = index.candidates(form);
    if (lemmas.length === 0) unmatched.push({ form, count });
    else if (lemmas.length === 1) {
      unambiguous.set(lemmas[0]!, (unambiguous.get(lemmas[0]!) ?? 0) + count);
      add(lemmas[0]!, count);
    } else ambiguous.push({ form, count, lemmas });
  }
  const ambiguousSpelling = new Map(ambiguous.map((a) => [a.form, a.count]));
  for (const { form, count, lemmas } of ambiguous) {
    if (lemmas.includes(form) && index.isFunctionWord(form)) {
      add(form, count);
      continue;
    }
    // +1 keeps a lemma with no other evidence from getting nothing at all.
    const weights = lemmas.map(
      (l) => (unambiguous.get(l) ?? 0) + (ambiguousSpelling.get(l) ?? 0) + 1,
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    lemmas.forEach((l, i) => {
      add(l, (count * weights[i]!) / sum);
      const others = shared.get(l) ?? new Set<string>();
      for (const o of lemmas) if (o !== l) others.add(o);
      shared.set(l, others);
    });
  }

  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const candidates: Candidate[] = [];
  const dropped: Dropped[] = [];
  for (const [lemma, count] of ordered) {
    if (candidates.length >= opts.limit) break;
    const info = index.headwords.get(lemma)!;
    const rounded = Math.round(count);
    // A word used mostly as a function word is dropped even if it has a minor content
    // use: "a" is a preposition (4 senses) and rarely an interjection (1). Ties drop too
    // ("yo", "un"). Words like "nada", "qué" and "todo" have more content senses and stay.
    if (info.kept.size === 0 || info.functionSenses >= info.keptSenses) {
      const reason = info.dropped.size > 0 ? [...info.dropped].sort().join("|") : "unsuitable";
      dropped.push({ lemma, count: rounded, reason });
      continue;
    }
    const rank = candidates.length + 1;
    const notes: string[] = [];
    if (info.dropped.size > 0) notes.push(`also ${[...info.dropped].sort().join("|")}`);
    if (info.unsuitableSenses > 0) notes.push("has vulgar or offensive senses: leave them out");
    const sharedWith = shared.get(lemma);
    if (sharedWith?.size) notes.push(`count shared with ${[...sharedWith].sort().join("|")}`);
    candidates.push({
      rank,
      lemma,
      pos: [...info.kept].sort(),
      level: Math.ceil(rank / opts.levelBandSize),
      count: rounded,
      notes: notes.join("; "),
    });
  }
  return { candidates, dropped, unmatched };
}

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(csvField).join(",")).join("\n") + "\n";
}
