import Image from "next/image";
import Link from "next/link";
import type { RelationType } from "@/lib/content/constants";
import {
  articleFor,
  mediaUrl,
  partOfSpeechLabel,
  registerLabel,
  splitAtOffsets,
} from "@/lib/content/display";
import type { WordPageData } from "@/lib/content/word-page";
import { AudioButton } from "@/app/_components/audio-button";

// Sections in the spec's order. The first five form the intro screen; the rest sit behind
// "More about this word". A section with no content is left out.

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
const muted = "text-ink-600 dark:text-ink-400";
const sectionHeading = `text-sm font-semibold uppercase tracking-wide ${muted}`;

type Relation = WordPageData["relations"][number];

function byType(relations: Relation[], type: RelationType) {
  return relations.filter((r) => r.type === type);
}

function RelatedWord({ relation, chip }: { relation: Relation; chip?: boolean }) {
  const chipClass = chip
    ? "inline-flex min-h-11 items-center rounded-full border-2 border-ink-200 px-4 font-semibold dark:border-ink-700"
    : "";
  if (relation.targetId === null) {
    return (
      <span lang="es" className={chipClass}>
        {relation.text}
      </span>
    );
  }
  return (
    <Link
      lang="es"
      href={`/word/${relation.targetId}`}
      className={`${chipClass} ${chip ? "hover:bg-ink-100 dark:hover:bg-ink-800" : "inline-flex min-h-11 items-center underline underline-offset-4"} text-brand-700 dark:text-brand-300 ${focusRing}`}
    >
      {relation.text}
    </Link>
  );
}

function ChipGroup({ title, relations }: { title: string; relations: Relation[] }) {
  if (relations.length === 0) return null;
  return (
    <div>
      <h4 className={`mb-2 text-sm ${muted}`}>{title}</h4>
      <ul className="flex flex-wrap gap-2">
        {relations.map((r, i) => (
          <li key={i}>
            <RelatedWord relation={r} chip />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WordView({ word }: { word: WordPageData }) {
  const { lemma, sense, examples, hook, image, relations, wordParts } = word;
  const article = articleFor(lemma);
  const spoken = article && article !== "el/la" ? `${article} ${lemma.headword}` : lemma.headword;

  const family = byType(relations, "family");
  const synonyms = byType(relations, "synonym");
  const antonyms = byType(relations, "antonym");
  const collocations = byType(relations, "collocation");
  const confused = byType(relations, "confused_with");
  const register = registerLabel(sense.register, sense.region);
  const usage = [
    register,
    lemma.plural,
    lemma.formsNote,
    collocations.length,
    confused.length,
  ].some(Boolean);
  const hasMore =
    sense.cognate !== "none" ||
    family.length + synonyms.length + antonyms.length > 0 ||
    wordParts.length > 0 ||
    usage;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <article className="flex flex-col gap-8">
        {/* 1. Headword with article, part of speech, audio */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 lang="es" className="text-4xl font-semibold tracking-tight break-words">
              {article && <span className={`font-normal ${muted}`}>{article} </span>}
              {lemma.headword}
              {lemma.feminine && (
                <span className="font-normal">
                  <span className={muted}> / </span>
                  {lemma.feminine}
                </span>
              )}
            </h1>
            <p className={`mt-2 ${muted}`}>
              {partOfSpeechLabel(lemma)} · Level {sense.level}
            </p>
          </div>
          <AudioButton
            src={word.lemmaAudioKey ? mediaUrl(word.lemmaAudioKey) : null}
            text={spoken}
            label={`Play pronunciation of ${lemma.headword}`}
            size="lg"
          />
        </header>

        {/* 2–3. Picture beside the gloss, never instead of it; then the definition */}
        <section aria-label="Meaning" className="flex items-center gap-5">
          {image && (
            <Image
              src={mediaUrl(image.fileKey)}
              alt={image.alt}
              width={160}
              height={128}
              className="h-24 w-28 shrink-0 rounded-lg bg-ink-50 object-contain sm:h-32 sm:w-40 dark:bg-ink-900"
            />
          )}
          <div>
            <p className="text-3xl font-medium">{sense.gloss}</p>
            <p className={`mt-2 text-lg ${muted}`}>{sense.definition}</p>
          </div>
        </section>

        {/* 4. Two example sentences with the target highlighted */}
        {examples.length > 0 && (
          <section aria-labelledby="examples-heading">
            <h2 id="examples-heading" className={sectionHeading}>
              Examples
            </h2>
            <ul className="mt-3 flex flex-col gap-4">
              {examples.slice(0, 2).map((e, i) => {
                const { before, target, after } = splitAtOffsets(
                  e.text,
                  e.startOffset,
                  e.endOffset,
                );
                return (
                  <li key={e.id} className="flex items-start gap-3">
                    <AudioButton
                      src={e.audioKey ? mediaUrl(e.audioKey) : null}
                      text={e.text}
                      label={`Play example sentence ${i + 1}`}
                    />
                    <div>
                      <p lang="es" className="text-lg">
                        {before}
                        <mark className="rounded bg-amber-100 px-0.5 font-semibold text-inherit dark:bg-amber-500/25">
                          {target}
                        </mark>
                        {after}
                      </p>
                      <p className={muted}>{e.translation}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 5. Memory hook */}
        {hook && (
          <section aria-labelledby="hook-heading">
            <h2 id="hook-heading" className={sectionHeading}>
              {hook.kind === "mnemonic" ? "Memory hook" : "Word origin"}
            </h2>
            <p className="mt-2">{hook.text}</p>
          </section>
        )}

        {hasMore && (
          <details className="card group">
            <summary
              className={`flex min-h-11 cursor-pointer items-center justify-between px-4 font-medium ${focusRing}`}
            >
              More about this word
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="h-5 w-5 transition-transform group-open:rotate-180"
                fill="currentColor"
              >
                <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
              </svg>
            </summary>
            <div className="flex flex-col gap-6 px-4 pt-2 pb-5">
              {/* 6. Cognate note */}
              {sense.cognate === "true_cognate" && (
                <section aria-label="Cognate">
                  <p>
                    Looks like English: <strong>{sense.cognateEnglish}</strong>
                  </p>
                </section>
              )}
              {sense.cognate === "false_friend" && (
                <section aria-label="False friend">
                  <p className="rounded-md bg-red-50 p-3 text-red-900 dark:bg-red-950 dark:text-red-100">
                    <strong>False friend:</strong> <span lang="es">{lemma.headword}</span> does not
                    mean “{sense.cognateEnglish}”.
                  </p>
                </section>
              )}

              {/* 7. Word family and synonyms as chips */}
              {family.length + synonyms.length + antonyms.length > 0 && (
                <section aria-labelledby="family-heading" className="flex flex-col gap-3">
                  <h3 id="family-heading" className={sectionHeading}>
                    Word family
                  </h3>
                  <ChipGroup title="Related forms" relations={family} />
                  <ChipGroup title="Similar meaning" relations={synonyms} />
                  <ChipGroup title="Opposite" relations={antonyms} />
                </section>
              )}

              {/* 8. Word ingredients */}
              {wordParts.length > 0 && (
                <section aria-labelledby="parts-heading">
                  <h3 id="parts-heading" className={sectionHeading}>
                    Word ingredients
                  </h3>
                  <ol className="mt-3 flex flex-wrap items-stretch gap-2">
                    {wordParts.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-col items-center rounded-md border border-ink-300 px-3 py-2 dark:border-ink-700"
                      >
                        <span lang="es" className="font-mono text-lg font-semibold">
                          {p.text}
                        </span>
                        <span className={`text-sm ${muted}`}>{p.meaning}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* 9. Usage notes */}
              {usage && (
                <section aria-labelledby="usage-heading">
                  <h3 id="usage-heading" className={sectionHeading}>
                    Usage notes
                  </h3>
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                    {register && <li>{register}</li>}
                    {lemma.plural && (
                      <li>
                        Plural: <span lang="es">{lemma.plural}</span>
                      </li>
                    )}
                    {lemma.formsNote && (
                      <li>
                        Key forms: <span lang="es">{lemma.formsNote}</span>
                      </li>
                    )}
                    {collocations.length > 0 && (
                      <li>
                        Common phrases:{" "}
                        {collocations.map((r, i) => (
                          <span key={i}>
                            {i > 0 && ", "}
                            <RelatedWord relation={r} />
                          </span>
                        ))}
                      </li>
                    )}
                    {confused.length > 0 && (
                      <li>
                        Not to be confused with:{" "}
                        {confused.map((r, i) => (
                          <span key={i}>
                            {i > 0 && ", "}
                            <RelatedWord relation={r} />
                          </span>
                        ))}
                      </li>
                    )}
                  </ul>
                </section>
              )}
            </div>
          </details>
        )}
      </article>
    </main>
  );
}
