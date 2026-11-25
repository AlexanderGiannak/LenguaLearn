import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HttpError } from "@/lib/http/handler";
import { getDb } from "@/lib/db/client";
import { reviewerPage } from "@/lib/review/page-gate";
import { mediaUrl, spokenHeadword } from "@/lib/content/display";
import { getReviewWordPage } from "@/lib/content/word-page";
import { previewQuestions, toEngineSense } from "@/lib/review/preview";
import { nextInQueue, senseForReview, waitingRows } from "@/lib/review/service";
import { getTrainingContent } from "@/lib/train/content";
import { StudentView } from "./student-view";
import { SenseEditor, type EditorData } from "./sense-editor";

export const metadata: Metadata = {
  title: "Review a sense · LenguaLearn",
  robots: { index: false },
};

const MAX_ID = 2_147_483_647; // Postgres integer

export default function ReviewSensePage({ params }: PageProps<"/review/[id]">) {
  return (
    <Suspense>
      <Sense params={params} />
    </Suspense>
  );
}

async function Sense({ params }: Pick<PageProps<"/review/[id]">, "params">) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > MAX_ID) notFound();
  const reviewer = await reviewerPage(`/review/${id}`);
  let v;
  try {
    v = await senseForReview(getDb(), Number(id), reviewer.id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const data: EditorData = {
    id: v.sense.id,
    key: v.sense.key,
    status: v.sense.status,
    loadedAt: v.sense.updatedAt.toISOString(),
    level: v.sense.level,
    lemma: {
      headword: v.lemma.headword,
      partOfSpeech: v.lemma.partOfSpeech,
      gender: v.lemma.gender,
      plural: v.lemma.plural,
      feminine: v.lemma.feminine,
      formsNote: v.lemma.formsNote,
      status: v.lemma.status,
    },
    wordParts: v.wordParts.map((w) => ({ kind: w.kind, text: w.text, meaning: w.meaning })),
    notes: v.sense.checkNotes,
    edit: {
      gloss: v.sense.gloss,
      definition: v.sense.definition,
      register: v.sense.register,
      region: v.sense.region ?? "",
      cognate: v.sense.cognate,
      cognateEnglish: v.sense.cognateEnglish ?? "",
      concreteness: v.sense.concreteness,
      imageDescription: v.sense.imageDescription ?? "",
      themes: v.sense.themes,
      examples: v.examples.map((e) => ({
        text: e.text,
        surfaceForm: e.surfaceForm,
        translation: e.translation,
        distractors: e.distractors,
      })),
      hooks: v.hooks.map((h) => ({ kind: h.kind, text: h.text })),
      relations: v.relations.map((r) => ({
        type: r.type,
        text: r.text,
        targetKey: r.targetKey ?? "",
      })),
      misuses: v.misuses.map((m) => ({ text: m.text, explanation: m.explanation })),
    },
    images: v.images.map((i) => ({ fileKey: i.fileKey, alt: i.alt })),
    recordings: [
      {
        label: "Headword",
        text: spokenHeadword(v.lemma),
        url: v.recordings.headword ? mediaUrl(v.recordings.headword.fileKey) : null,
        status: v.recordings.headword?.status ?? null,
        target: { owner: "lemma" as const },
      },
      ...v.examples.map((e, i) => {
        const r = v.recordings.examples[i];
        return {
          label: `Sentence ${i + 1}`,
          text: e.text,
          url: r ? mediaUrl(r.fileKey) : null,
          status: r?.status ?? null,
          target: { owner: "example" as const, exampleId: e.id },
        };
      }),
    ],
    log: v.log.map((l) => ({ ...l, at: l.at.toISOString() })),
    isAdmin: reviewer.isAdmin,
    nextId: await nextInQueue(getDb(), v.sense),
    waiting: (await waitingRows(getDb(), v.sense)).length,
  };
  const [word, content] = await Promise.all([getReviewWordPage(v.sense.id), getTrainingContent()]);
  const studentView = word ? (
    <StudentView
      word={word}
      questions={previewQuestions(
        toEngineSense(
          word,
          v.misuses.map((m) => m.text),
        ),
        content.senses,
      )}
    />
  ) : null;
  // A new key after every save remounts the editor with the saved content.
  return <SenseEditor key={data.loadedAt} data={data} studentView={studentView} />;
}
