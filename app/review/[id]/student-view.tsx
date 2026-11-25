import { WordView } from "@/app/word/[id]/word-view";
import { muted } from "@/app/_components/styles";
import type { WordPageData } from "@/lib/content/word-page";
import type { PreviewQuestion } from "@/lib/review/preview";

// What a student will see once this sense is live: its word page (the real component) and
// the questions the engine builds from it, with the right answer marked. As saved: unsaved
// edits show only after saving.

export function StudentView({
  word,
  questions,
}: {
  word: WordPageData;
  questions: PreviewQuestion[];
}) {
  return (
    <section aria-labelledby="student-view" className="card flex flex-col gap-4 p-4">
      <h2 id="student-view" className="text-lg font-bold">
        What students will see <span className={`text-sm font-normal ${muted}`}>(as saved)</span>
      </h2>
      <details open className="rounded-xl border-2 border-ink-100 p-4 dark:border-ink-800">
        <summary className="cursor-pointer font-semibold">Word page</summary>
        <div className="mt-4">
          <WordView word={word} embedded />
        </div>
      </details>
      <details open className="rounded-xl border-2 border-ink-100 p-4 dark:border-ink-800">
        <summary className="cursor-pointer font-semibold">Questions ({questions.length})</summary>
        <ol className="mt-4 flex flex-col gap-6">
          {questions.map(({ label, question: q }, i) => (
            <li key={i} className="flex flex-col gap-3">
              <p className={`text-sm ${muted}`}>{label}</p>
              <p className={`text-sm font-bold tracking-wide uppercase ${muted}`}>
                {q.instruction}
              </p>
              <p className={q.prompt.gap ? "text-xl leading-relaxed" : "text-2xl font-semibold"}>
                {q.prompt.gap ? (
                  <span lang="es">
                    {q.prompt.text.slice(0, q.prompt.gap.start)}
                    <span
                      aria-label="blank"
                      className="mx-1 inline-block w-20 border-b-2 border-current align-baseline"
                    />
                    {q.prompt.text.slice(q.prompt.gap.end)}
                  </span>
                ) : (
                  <span lang={q.prompt.lang}>{q.prompt.text}</span>
                )}
              </p>
              {q.note && <p className={muted}>{q.note}</p>}
              {q.options ? (
                <ol className="grid gap-2 sm:grid-cols-2">
                  {q.options.map((o, j) => {
                    const right = j === q.correctIndex;
                    return (
                      <li
                        key={j}
                        className={`choice min-h-12 px-4 py-2 ${right ? "border-green-600 dark:border-green-500" : ""}`}
                      >
                        <span lang={o.lang}>{o.text}</span>
                        {right && (
                          <span className="ml-auto text-sm font-semibold text-green-800 dark:text-green-300">
                            ✓ right answer
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p>
                  Typed answer: <strong lang="es">{q.expected}</strong>
                  {q.dictionaryForm && q.dictionaryForm !== q.expected && (
                    <span className={muted}>
                      {" "}
                      (from <span lang="es">{q.dictionaryForm}</span>)
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
