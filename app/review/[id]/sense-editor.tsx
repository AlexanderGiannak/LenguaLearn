"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, ErrorText, focusRing, link, muted } from "@/app/_components/ui";
import {
  COGNATE_STATUSES,
  CONCRETENESS,
  HOOK_KINDS,
  REGISTERS,
  RELATION_TYPES,
  type ContentStatus,
} from "@/lib/content/constants";
import type { CheckNotes } from "@/lib/content/import-schema";

// The review tool's editor for one sense. The server checks everything again on save
// (lib/review/service.ts); this page only helps the reviewer see what will be saved.

type Edit = {
  gloss: string;
  definition: string;
  register: (typeof REGISTERS)[number];
  region: string;
  cognate: (typeof COGNATE_STATUSES)[number];
  cognateEnglish: string;
  concreteness: (typeof CONCRETENESS)[number];
  imageDescription: string;
  themes: string[];
  examples: { text: string; surfaceForm: string; translation: string; distractors: string[] }[];
  hooks: { kind: (typeof HOOK_KINDS)[number]; text: string }[];
  relations: { type: (typeof RELATION_TYPES)[number]; text: string; targetKey: string }[];
  misuses: { text: string; explanation: string }[];
};

export type EditorData = {
  id: number;
  key: string;
  status: ContentStatus;
  loadedAt: string;
  level: number;
  lemma: {
    headword: string;
    partOfSpeech: string;
    gender: string | null;
    plural: string | null;
    feminine: string | null;
    formsNote: string | null;
    status: ContentStatus;
  };
  wordParts: { kind: string; text: string; meaning: string }[];
  notes: CheckNotes | null;
  edit: Edit;
  images: { fileKey: string; alt: string }[];
  log: { at: string; action: string; reason: string | null; byYou: boolean }[];
  isAdmin: boolean;
  /** The next sense in the same queue, opened after approving or rejecting this one. */
  nextId: number | null;
};

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Draft",
  ai_checked: "Passed the AI check",
  approved: "Approved",
  live: "Live",
  retired: "Retired",
};

const input = `field w-full ${focusRing}`;

async function send(url: string, body: unknown) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      issues?: { message: string; path?: (string | number)[] }[];
    };
    if (res.ok) return { ok: true as const };
    const issues = data.issues?.map((i) =>
      i.path?.length ? `${i.path.join(".")}: ${i.message}` : i.message,
    );
    return { ok: false as const, errors: issues?.length ? issues : [data.error ?? "Not saved."] };
  } catch {
    return { ok: false as const, errors: ["Can't reach the server. Try again."] };
  }
}

export function SenseEditor({ data }: { data: EditorData }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Edit>(data.edit);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const dirty = JSON.stringify(edit) !== JSON.stringify(data.edit);
  const backTo = `/review?status=${data.status === "live" ? "ai_checked" : data.status}`;
  const onward = data.nextId ? `/review/${data.nextId}` : backTo;

  const set = <K extends keyof Edit>(k: K, v: Edit[K]) => setEdit((e) => ({ ...e, [k]: v }));
  const setItem = <K extends "examples" | "hooks" | "relations" | "misuses">(
    k: K,
    i: number,
    patch: Partial<Edit[K][number]>,
  ) =>
    setEdit((e) => ({
      ...e,
      [k]: (e[k] as Edit[K][number][]).map((x, j) => (j === i ? { ...x, ...patch } : x)),
    }));
  const remove = (k: "examples" | "hooks" | "relations" | "misuses", i: number) =>
    setEdit((e) => ({ ...e, [k]: (e[k] as unknown[]).filter((_, j) => j !== i) }));

  async function run(url: string, body: unknown, after: () => void) {
    setBusy(true);
    setErrors([]);
    const r = await send(url, body);
    setBusy(false);
    if (!r.ok) return setErrors(r.errors);
    after();
  }

  const save = () =>
    run(
      `/api/review/senses/${data.id}`,
      {
        ...edit,
        loadedAt: data.loadedAt,
        region: edit.register === "regional" ? edit.region : undefined,
        cognateEnglish: edit.cognate === "none" ? undefined : edit.cognateEnglish,
        imageDescription: edit.imageDescription || undefined,
        relations: edit.relations.map((r) => ({ ...r, targetKey: r.targetKey || undefined })),
      },
      () => router.refresh(),
    );
  const approve = () =>
    run(`/api/review/senses/${data.id}/decision`, { action: "approve" }, () => router.push(onward));
  const reject = () =>
    run(`/api/review/senses/${data.id}/decision`, { action: "reject", reason }, () =>
      router.push(onward),
    );

  // Note fields are paths like "lemmas.0.senses.0.examples.2.text"; match within this sense.
  const notesFor = (prefix: string) =>
    (data.notes?.failures ?? []).filter((f) => {
      const local = f.field.replace(/^lemmas\.\d+\.senses\.\d+\./, "");
      return local === prefix || local.startsWith(`${prefix}.`);
    });
  const canDecide = data.status !== "live" && data.status !== "approved";

  // Keyboard: Ctrl/Cmd+S saves, Ctrl/Cmd+Enter approves (spec: step 4, shortcuts).
  const keys = useRef({ save, approve, dirty, canDecide, busy });
  useEffect(() => {
    keys.current = { save, approve, dirty, canDecide, busy };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = keys.current;
      if (e.key === "s") {
        e.preventDefault();
        if (k.dirty && !k.busy) void k.save();
      } else if (e.key === "Enter" && k.canDecide && !k.dirty && !k.busy) {
        e.preventDefault();
        void k.approve();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const l = data.lemma;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <Link href={backTo} className={`${link} -mb-3 self-start text-sm`}>
        ← Review queue
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">
          <span lang="es">{l.headword}</span>{" "}
          <span className={`text-xl font-semibold ${muted}`}>
            {l.partOfSpeech}
            {l.gender && ` (${l.gender})`}
          </span>
        </h1>
        <p className={muted}>
          {STATUS_LABEL[data.status]} · level {data.level} · <code>{data.key}</code>
        </p>
        {(l.plural || l.feminine || l.formsNote) && (
          <p className="text-sm">
            {l.plural && (
              <>
                Plural: <span lang="es">{l.plural}</span>.{" "}
              </>
            )}
            {l.feminine && (
              <>
                Feminine: <span lang="es">{l.feminine}</span>.{" "}
              </>
            )}
            {l.formsNote && <span lang="es">{l.formsNote}</span>}
          </p>
        )}
        {data.wordParts.length > 0 && (
          <p className="text-sm">
            Word parts:{" "}
            {data.wordParts.map((w, i) => (
              <span key={i}>
                {i > 0 && " + "}
                <span lang="es">{w.text}</span> ({w.meaning})
              </span>
            ))}
          </p>
        )}
      </header>

      {data.notes && (
        <section className="card flex flex-col gap-2 p-4" aria-labelledby="notes">
          <h2 id="notes" className="text-lg font-bold">
            What the checks found
          </h2>
          {data.notes.reviewerGloss && (
            <p>
              The reviewing model&apos;s own gloss: <strong>{data.notes.reviewerGloss}</strong>
            </p>
          )}
          {data.notes.failures.length === 0 ? (
            <p className={muted}>Nothing.</p>
          ) : (
            <ul className="list-disc pl-5">
              {data.notes.failures.map((f, i) => (
                <li key={i}>
                  <span className={`text-sm ${muted}`}>
                    {f.field.replace(/^lemmas\.\d+\.(senses\.\d+\.)?/, "")}
                  </span>{" "}
                  {f.message}
                </li>
              ))}
            </ul>
          )}
          <p className={`text-sm ${muted}`}>
            Checked {new Date(data.notes.checkedAt).toLocaleString()}
            {data.log.some((e) => e.action === "edit" && e.at > data.notes!.checkedAt) &&
              "; edited by a person since then, so some notes may be fixed already"}
            .
          </p>
        </section>
      )}

      <Section title="Meaning">
        <Text label="Gloss (under 8 words)" value={edit.gloss} onChange={(v) => set("gloss", v)} />
        <Text
          label="Definition"
          value={edit.definition}
          long
          onChange={(v) => set("definition", v)}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Register"
            value={edit.register}
            options={REGISTERS}
            onChange={(v) => set("register", v)}
          />
          <Select
            label="Cognate"
            value={edit.cognate}
            options={COGNATE_STATUSES}
            onChange={(v) => set("cognate", v)}
          />
          <Select
            label="Concreteness"
            value={edit.concreteness}
            options={CONCRETENESS}
            onChange={(v) => set("concreteness", v)}
          />
        </div>
        {edit.register === "regional" && (
          <Text label="Region" value={edit.region} onChange={(v) => set("region", v)} />
        )}
        {edit.cognate !== "none" && (
          <Text
            label="English word"
            value={edit.cognateEnglish}
            onChange={(v) => set("cognateEnglish", v)}
          />
        )}
        {edit.concreteness === "concrete" && (
          <Text
            label="What a picture would show"
            value={edit.imageDescription}
            long
            onChange={(v) => set("imageDescription", v)}
          />
        )}
        <Text
          label="Themes (comma-separated)"
          value={edit.themes.join(", ")}
          onChange={(v) =>
            set(
              "themes",
              v
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
        <Notes items={[...notesFor("gloss"), ...notesFor("definition"), ...notesFor("labels")]} />
      </Section>

      <Section title="Example sentences">
        {edit.examples.map((ex, i) => (
          <fieldset
            key={i}
            className="flex flex-col gap-2 rounded-xl border-2 border-ink-100 p-3 dark:border-ink-800"
          >
            <legend className="px-1 font-semibold">Sentence {i + 1}</legend>
            <Preview text={ex.text} word={ex.surfaceForm} />
            <Text
              lang="es"
              label="Sentence"
              value={ex.text}
              onChange={(v) => setItem("examples", i, { text: v })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Text
                lang="es"
                label="Target word as it appears"
                value={ex.surfaceForm}
                onChange={(v) => setItem("examples", i, { surfaceForm: v })}
              />
              <Text
                label="Translation"
                value={ex.translation}
                onChange={(v) => setItem("examples", i, { translation: v })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {ex.distractors.map((d, j) => (
                <Text
                  key={j}
                  lang="es"
                  label={`Wrong choice ${j + 1}`}
                  value={d}
                  onChange={(v) =>
                    setItem("examples", i, {
                      distractors: ex.distractors.map((x, k) => (k === j ? v : x)),
                    })
                  }
                />
              ))}
            </div>
            <Notes items={notesFor(`examples.${i}`)} />
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => remove("examples", i)}
            >
              Remove sentence
            </Button>
          </fieldset>
        ))}
        {edit.examples.length < 8 && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() =>
              set("examples", [
                ...edit.examples,
                { text: "", surfaceForm: "", translation: "", distractors: ["", "", ""] },
              ])
            }
          >
            Add a sentence
          </Button>
        )}
      </Section>

      <Section title="Common mistakes">
        {edit.misuses.map((m, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Text
              lang="es"
              label={`Wrong sentence ${i + 1}`}
              value={m.text}
              onChange={(v) => setItem("misuses", i, { text: v })}
            />
            <Text
              label="Why it is wrong"
              value={m.explanation}
              long
              onChange={(v) => setItem("misuses", i, { explanation: v })}
            />
            <Notes items={notesFor(`misuses.${i}`)} />
            <Button variant="secondary" className="self-start" onClick={() => remove("misuses", i)}>
              Remove mistake
            </Button>
          </div>
        ))}
        {edit.misuses.length < 6 && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => set("misuses", [...edit.misuses, { text: "", explanation: "" }])}
          >
            Add a mistake
          </Button>
        )}
      </Section>

      <Section title="Memory hooks">
        {edit.hooks.map((h, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Select
              label="Kind"
              value={h.kind}
              options={HOOK_KINDS}
              onChange={(v) => setItem("hooks", i, { kind: v })}
            />
            <Text
              label="Hook"
              value={h.text}
              long
              onChange={(v) => setItem("hooks", i, { text: v })}
            />
            <Button variant="secondary" className="self-start" onClick={() => remove("hooks", i)}>
              Remove hook
            </Button>
          </div>
        ))}
        <Notes items={notesFor("hook")} />
        {edit.hooks.length < 3 && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => set("hooks", [...edit.hooks, { kind: "mnemonic", text: "" }])}
          >
            Add a hook
          </Button>
        )}
      </Section>

      <Section title="Related words">
        {edit.relations.map((r, i) => (
          <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <Select
              label="Type"
              value={r.type}
              options={RELATION_TYPES}
              onChange={(v) => setItem("relations", i, { type: v })}
            />
            <Text
              lang="es"
              label="Text"
              value={r.text}
              onChange={(v) => setItem("relations", i, { text: v })}
            />
            <Button variant="secondary" onClick={() => remove("relations", i)}>
              Remove
            </Button>
          </div>
        ))}
        <Notes items={notesFor("relations")} />
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            set("relations", [
              ...edit.relations,
              { type: RELATION_TYPES[0], text: "", targetKey: "" },
            ])
          }
        >
          Add a related word
        </Button>
      </Section>

      {data.images.length > 0 && (
        <Section title="Pictures">
          <ul className="list-disc pl-5">
            {data.images.map((img) => (
              <li key={img.fileKey}>
                {img.alt} <code className={`text-sm ${muted}`}>{img.fileKey}</code>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <section className="card sticky bottom-4 flex flex-col gap-3 p-4">
        {errors.length > 0 && (
          <ErrorText>
            {errors.length === 1 ? (
              errors[0]
            ) : (
              <span className="flex flex-col">
                {errors.map((e) => (
                  <span key={e}>{e}</span>
                ))}
              </span>
            )}
          </ErrorText>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy || !dirty}>
            Save changes
          </Button>
          {canDecide && (
            <Button variant="secondary" onClick={approve} disabled={busy || dirty}>
              Approve
            </Button>
          )}
          {dirty && (
            <Button variant="secondary" onClick={() => setEdit(data.edit)} disabled={busy}>
              Undo changes
            </Button>
          )}
        </div>
        {dirty && canDecide && (
          <p className={`text-sm ${muted}`}>Save your changes before approving.</p>
        )}
        <p className={`text-sm ${muted}`}>
          Shortcuts: <kbd>Ctrl</kbd>+<kbd>S</kbd> saves, <kbd>Ctrl</kbd>+<kbd>Enter</kbd> approves (
          <kbd>⌘</kbd> on a Mac).
          {data.nextId ? " Approving or rejecting opens the next sense." : ""}
        </p>
        {data.status === "live" && (
          <p className={`text-sm ${muted}`}>
            This sense is live. Saving a change sends the changed parts back through review.
          </p>
        )}
        {data.status !== "live" && (
          <details>
            <summary className={`cursor-pointer font-semibold ${focusRing}`}>Reject</summary>
            <div className="mt-2 flex flex-col gap-2">
              <Text label="Why (kept with the sense)" value={reason} long onChange={setReason} />
              <Button
                variant="danger"
                className="self-start"
                onClick={reject}
                disabled={busy || reason.trim().length < 3}
              >
                Send back to draft
              </Button>
            </div>
          </details>
        )}
      </section>

      {data.log.length > 0 && (
        <Section title="History">
          <ul className="flex flex-col gap-1 text-sm">
            {data.log.map((e, i) => (
              <li key={i}>
                {new Date(e.at).toLocaleString()}: {e.action} by{" "}
                {e.byYou ? "you" : "another reviewer"}
                {e.reason && <>: {e.reason}</>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Text({
  label,
  value,
  onChange,
  long,
  lang,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  long?: boolean;
  lang?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      {long ? (
        <textarea
          lang={lang}
          rows={2}
          className={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          lang={lang}
          className={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      <select className={input} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function Notes({ items }: { items: CheckNotes["failures"] }) {
  if (items.length === 0) return null;
  return (
    <ul className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      {items.map((f, i) => (
        <li key={i}>{f.message}</li>
      ))}
    </ul>
  );
}

/** The sentence as students see it, with the target word marked where the server will place it. */
function Preview({ text, word }: { text: string; word: string }) {
  const at = word ? text.indexOf(word) : -1;
  if (at < 0) {
    return (
      <p className="text-sm text-red-800 dark:text-red-200">
        The target word is not in the sentence.
      </p>
    );
  }
  return (
    <p lang="es" className="text-lg">
      {text.slice(0, at)}
      <mark className="rounded bg-brand-100 px-0.5 dark:bg-brand-900 dark:text-white">{word}</mark>
      {text.slice(at + word.length)}
    </p>
  );
}
