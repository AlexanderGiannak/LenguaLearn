import type { Metadata } from "next";
import { ColumnChart } from "../_components/charts";
import {
  AnswerRules,
  MinutesBar,
  PacingGates,
  QuestionLadder,
  SessionStrip,
} from "../_components/diagrams";
import { PlacementChart, ReviewCurves, TwoMemoryLanes } from "../_components/explainers";
import { CtaBand, Figure, InfoPage, InlineLink, Section, Steps } from "../_components/marketing";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import { tryDemoHref } from "@/lib/site/config";
import { placementTrace, reviewCurves, zipfCoverage } from "@/lib/site/explainers";

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
  const curves = reviewCurves(60);
  const placement = placementTrace(2_000);
  const coverage = zipfCoverage(10);
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
      <Section n={1} title="Find your level">
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
        <Figure
          tone="teal"
          title="One level check, question by question"
          caption={
            <>
              A simulated learner who knows about half the words around #
              {placement.trueRank.toLocaleString("en-US")} (#1 is the most common word) takes the
              real level check. The first questions probe fixed points from common to rare, then
              each question is picked near the current estimate, which settles as answers come in.
              This learner would start at level {placement.level}.
            </>
          }
        >
          <PlacementChart steps={placement.steps} />
        </Figure>
      </Section>

      <Section n={2} title="Levels follow real usage">
        <p>
          Words are ordered by how often Spanish speakers actually use them. Each level is{" "}
          {ENGINE_CONFIG.levelBandSize} words: level 1 is the {ENGINE_CONFIG.levelBandSize} most
          common, level 2 the next {ENGINE_CONFIG.levelBandSize}, and so on, with no top. Common
          words with several meanings are taught one meaning at a time, starting with the most
          common.
        </p>
        <Figure
          tone="coral"
          title="Share of everyday text you can read, level by level"
          caption="A model, not a count: under Zipf's law, the pattern word frequencies follow in every language, a word's frequency falls with its rank. Shown for a 50,000-word vocabulary; real texts vary. The first levels pay off the most."
        >
          <ColumnChart
            label="Share of running text covered by the words up to each level"
            unit="%"
            emphasis="1"
            data={coverage.map((c) => ({
              key: String(c.level),
              label: `L${c.level}`,
              value: Math.round(c.share * 100),
              detail: `Up to level ${c.level} (${(c.level * ENGINE_CONFIG.levelBandSize).toLocaleString("en-US")} words)`,
            }))}
          />
        </Figure>
      </Section>

      <Section n={3} title="Meeting a new word">
        <Figure
          tone="violet"
          title="A new word in a session"
          caption="The page comes first, then a quick question straight away. The word comes back once more in a different form while other reviews carry on."
        >
          <SessionStrip />
        </Figure>
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

      <Section n={4} title="Spaced repetition" id="spaced-repetition">
        <p>
          Every word you study has a memory model behind it. LenguaLearn uses <strong>FSRS</strong>,
          an open-source scheduler and one of the most accurate available. After each answer it
          estimates how likely you are to remember the word on any later day, and the word comes
          back when that chance falls to about{" "}
          {Math.round(ENGINE_CONFIG.fsrs.requestRetention * 100)}%: right before you would forget
          it.
        </p>
        <Figure
          tone="sun"
          title="One word over two months"
          caption={
            <>
              Computed by the app&apos;s own scheduler for a word answered right at each review.
              Every review makes the memory last longer, so the gaps grow:{" "}
              {curves.reviewDays
                .slice(1)
                .map((d, i) => `${d - curves.reviewDays[i]!} days`)
                .join(", then ")}
              . Without reviews, the same word fades.
            </>
          }
        >
          <ReviewCurves
            withReviews={curves.withReviews}
            withoutReviews={curves.withoutReviews}
            reviewDays={curves.reviewDays}
            target={ENGINE_CONFIG.fsrs.requestRetention}
          />
        </Figure>
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

      <Section n={5} title="Two memories per word">
        <p>
          Understanding a word when you see it and producing it yourself are different skills.
          LenguaLearn tracks them separately: a <strong>recognition</strong> memory and a{" "}
          <strong>production</strong> memory. Production practice starts once you recognize the word
          reliably (after about three days of stability), and each question only updates the memory
          it tests.
        </p>
        <Figure
          tone="sky"
          title="Two schedules for one word"
          caption={`The same word as above. Production practice starts on day ${curves.productionFromDay}, once recognition is stable enough, and then keeps its own schedule.`}
        >
          <TwoMemoryLanes
            recognition={curves.reviewDays}
            production={curves.productionReviewDays}
            productionFrom={curves.productionFromDay}
            days={60}
          />
        </Figure>
      </Section>

      <Section n={6} title="Questions that grow with you">
        <p>
          The kind of question depends on how well you know the word. The type also changes from one
          review to the next, so you never get the same type twice in a row for a word.
        </p>
        <Figure tone="violet" title="The question ladder">
          <QuestionLadder />
        </Figure>
        <dl className="flex flex-col gap-3 text-base">
          {ladder.map((l) => (
            <div key={l.title}>
              <dt className="font-bold text-ink-900 dark:text-ink-100">{l.title}</dt>
              <dd>{l.text}</dd>
            </div>
          ))}
        </dl>
        <p>
          Wrong options are chosen to be believable but never also correct: never a synonym or a
          word that&apos;s easy to confuse with the answer. Every question has an{" "}
          <strong>I don&apos;t know</strong> button, which is better than guessing and never counts
          as a mistake against your attention.
        </p>
      </Section>

      <Section n={7} title="Fair answer checking">
        <p>
          Typed answers are judged kindly at first and more strictly as a word gets stronger. The
          correct spelling is always shown, and the right word in the wrong form is marked as such,
          with the right form next to it.
        </p>
        <Figure
          tone="coral"
          title="How a typed answer is judged"
          caption="Almost still counts as remembered, but the word comes back a little sooner. Stable means the word's production memory is expected to last that long. A missing ñ makes a different word, so it is always wrong."
        >
          <AnswerRules />
        </Figure>
      </Section>

      <Section n={8} title="Pacing new words">
        <p>
          New words keep coming only while you&apos;re keeping up. Otherwise the session focuses on
          review until you catch up. Learning more words than you can keep is the most common way
          vocabulary study fails.
        </p>
        <Figure tone="teal" title="Three checks before a new word">
          <PacingGates />
        </Figure>
      </Section>

      <Section n={9} title="What counts as learned">
        <p>
          A word counts as learned when you&apos;ve recognized it after a gap of at least{" "}
          {ENGINE_CONFIG.learnedMinIntervalDays} days and the model still predicts at least an{" "}
          {Math.round(ENGINE_CONFIG.learnedMinRecall * 100)}% chance you remember it. Your home page
          also estimates your whole vocabulary, including words you knew before you started.
        </p>
        <div className="flex flex-col gap-1 rounded-3xl border-2 border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-6 dark:border-amber-900/60 dark:from-amber-950/40 dark:to-orange-950/30">
          <span className="text-sm font-bold tracking-wide text-amber-900 uppercase dark:text-amber-200">
            On your home page
          </span>
          <span className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-100">
            You know about 2,340 Spanish words.
          </span>
          <span className="text-base">
            An example of the estimate, updated after every session.
          </span>
        </div>
      </Section>

      <Section n={10} title="Minutes that mean practice">
        <p>
          Time counts only while a question or its feedback is on screen and the tab is visible.
          After two minutes without input the session pauses. Stretches that look like random
          clicking are counted separately as flagged time, with one gentle note to slow down. More
          in <InlineLink href="/for-teachers#integrity">for teachers</InlineLink>.
        </p>
        <Figure tone="sky" title="An example session's minutes">
          <MinutesBar />
        </Figure>
      </Section>

      <CtaBand
        title="Try it yourself"
        text="The demo runs this exact engine with sample words. Take the level check and train for a few minutes."
        demoHref={tryDemoHref(process.env)}
      />
    </InfoPage>
  );
}
