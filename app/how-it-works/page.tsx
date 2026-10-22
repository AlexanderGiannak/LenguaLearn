import type { Metadata } from "next";
import { CardGrid, CtaBand, InfoPage, InlineLink, Section, Steps } from "../_components/marketing";
import { tryDemoHref } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "How it works · LenguaLearn",
  description:
    "Spaced repetition, two memories per word, and questions that get harder as a word becomes known.",
};

const ladder = [
  {
    title: "New, or under 2 days",
    text: "Recognize it: see the Spanish word and pick its meaning from four options, or hear it and pick the meaning.",
  },
  {
    title: "2 to 10 days",
    text: "Choose it: pick the Spanish word for an English meaning, fill a gap in a sentence, match a synonym or opposite, or pick a noun's gender.",
  },
  {
    title: "Over 10 days",
    text: "Produce it: type the word from its meaning, type the missing word in a sentence, spot the sentence that uses it correctly, or type a word you hear.",
  },
];

export default function HowItWorks() {
  return (
    <InfoPage
      eyebrow="How it works"
      title="Built on how memory works"
      intro={
        <p>
          LenguaLearn decides what you see next, one question at a time, using a model of your
          memory for every word you study. Here is what it does and why.
        </p>
      }
    >
      <Section title="1. Find your level">
        <p>
          New learners choose &ldquo;I&apos;m a total beginner&rdquo; and start at level 1, or take
          a 3-minute level check: about 40 words, one at a time, each with a simple question: do you
          know this word?
        </p>
        <p>
          About 10 of them are made up. They look Spanish but aren&apos;t words, and saying yes to
          them lowers your score. That corrects for overclaiming, so the check works without any
          typing. The method is LexTALE-Esp, a test used in language research. Items start spread
          across all levels and narrow toward where your answers change.
        </p>
        <p>
          Words well below your level aren&apos;t taught again. They come up once as a harder
          question; get it right and the word is marked as known.
        </p>
      </Section>

      <Section title="2. Levels follow real usage">
        <p>
          Words are ordered by how often Spanish speakers actually use them. Each level is 500
          words: level 1 is the 500 most common, level 2 the next 500, and so on, with no top.
          Common words with several meanings are taught one meaning at a time, starting with the
          most common.
        </p>
      </Section>

      <Section title="3. Meeting a new word">
        <Steps
          items={[
            {
              title: "The word page",
              text: "The meaning in English and a short definition, example sentences with audio, related words, and for some concrete words a picture. A memory hook appears only when there's a good one.",
            },
            {
              title: "Got it, or I already know this",
              text: "Got it leads straight to an easy question. I already know this jumps to a harder one: get it right and the word is scheduled as known, get it wrong and you just see the page again. Trying never costs you anything.",
            },
            {
              title: "A second check",
              text: "Four to six questions later, the word comes back in a different form, before it has time to slip away.",
            },
          ]}
        />
        <p>
          For words you can probably work out, like ones that look like English, you guess the
          meaning first and then see the word page. Guessing first makes the word stick better, and
          the guess never counts against you.
        </p>
      </Section>

      <Section title="4. Spaced repetition">
        <p>
          Every word you study has a memory model behind it. LenguaLearn uses <strong>FSRS</strong>,
          an open-source scheduler and one of the most accurate available. After each answer it
          estimates how likely you are to remember the word on any later day, and the word comes
          back when that chance falls to about 90%: right before you would forget it.
        </p>
        <p>
          The next item is always the most useful one: a word you just missed, a new word&apos;s
          second check, the review you&apos;re most likely to forget, or a new word. You&apos;re
          never left with nothing to do.
        </p>
        <p>
          Reviewing a word three times in one session isn&apos;t treated as three days of practice.
          Repeats within a day are modeled as short-term memory, so the schedule stays honest.
        </p>
      </Section>

      <Section title="5. Two memories per word">
        <p>
          Understanding a word when you see it and producing it yourself are different skills.
          LenguaLearn tracks them separately: a <strong>recognition</strong> memory and a{" "}
          <strong>production</strong> memory. Production practice starts once you recognize the word
          reliably (after about three days of stability), and each question only updates the memory
          it tests.
        </p>
      </Section>

      <Section title="6. Questions that grow with you">
        <p>
          The kind of question depends on how well you know the word. The type also changes from one
          review to the next, so you never get the same type twice in a row for a word.
        </p>
        <CardGrid items={ladder} columns={3} />
        <p>
          Wrong options are chosen to be believable but never also correct: never a synonym or a
          word that&apos;s easy to confuse with the answer. Every question has an{" "}
          <strong>I don&apos;t know</strong> button, which is better than guessing and never counts
          as a mistake against your attention.
        </p>
      </Section>

      <Section title="7. Fair answer checking">
        <ul className="ml-6 list-disc">
          <li>Capital letters, extra spaces and leaving out the article don&apos;t matter.</li>
          <li>
            Accents get stricter as a word gets stronger. Early on a missing accent still counts.
            Later it counts as &ldquo;almost&rdquo;, and once the word is learned, an accent that
            changes the meaning counts as wrong. The correct spelling is always shown.
          </li>
          <li>A missing ñ counts as wrong, because it makes a different word.</li>
          <li>One typo in a longer word counts as &ldquo;almost&rdquo;, not wrong.</li>
          <li>The right word in the wrong form is marked as such, and the right form is shown.</li>
        </ul>
      </Section>

      <Section title="8. Pacing new words">
        <p>
          New words keep coming only while you&apos;re keeping up: when at least 75% of your last 10
          answers were right, fewer than 20 reviews are overdue, and you&apos;ve met fewer than 8
          new words this session. Otherwise the session focuses on review until you catch up.
          Learning more words than you can keep is the most common way vocabulary study fails.
        </p>
      </Section>

      <Section title="9. What counts as learned">
        <p>
          A word counts as learned when you&apos;ve recognized it after a gap of at least 7 days and
          the model still predicts at least an 85% chance you remember it. Your home page also
          estimates your whole vocabulary, including words you knew before you started: &ldquo;You
          know about 2,340 Spanish words.&rdquo;
        </p>
      </Section>

      <Section title="10. Minutes that mean practice">
        <p>
          Time counts only while a question or its feedback is on screen and the tab is visible.
          After two minutes without input the session pauses. Stretches that look like random
          clicking are counted separately as flagged time, with one gentle note to slow down. More
          in <InlineLink href="/for-teachers#integrity">for teachers</InlineLink>.
        </p>
      </Section>

      <CtaBand
        title="Try it yourself"
        text="The demo runs this exact engine with sample words. Take the level check and train for a few minutes."
        demoHref={tryDemoHref(process.env)}
      />
    </InfoPage>
  );
}
