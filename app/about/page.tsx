import type { Metadata } from "next";
import { CtaBand, InfoPage, Section, Steps } from "../_components/marketing";
import { link } from "../_components/styles";
import { tryDemoHref } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "About · LenguaLearn",
  description: "Why LenguaLearn exists, how its words are made, and what's next.",
};

export default function About() {
  return (
    <InfoPage
      eyebrow="About"
      title="Vocabulary is the backbone of a language"
      intro={
        <p>
          You can&apos;t understand a sentence if you don&apos;t know its words. LenguaLearn exists
          to make building a Spanish vocabulary efficient, honest and free.
        </p>
      }
    >
      <Section title="What we believe">
        <ul className="ml-6 list-disc">
          <li>
            <strong>Free, with no ads and no selling data.</strong> The app is kept cheap to run so
            it can stay that way.
          </li>
          <li>
            <strong>Student privacy by design.</strong> Class students are anonymous to us, and
            student data is never sent to an AI provider.
          </li>
          <li>
            <strong>Accuracy over volume.</strong> No word reaches a student until a person has
            reviewed it.
          </li>
          <li>
            <strong>Original content.</strong> Every word page, example and memory hook is written
            for LenguaLearn.
          </li>
        </ul>
      </Section>

      <Section title="How the words are made" id="content">
        <p>
          This is the process every word follows. The app enforces the key rule already: a word is
          shown to students only after a person has approved it.
        </p>
        <Steps
          items={[
            {
              title: "Choose the words",
              text: "A frequency list from an openly licensed source puts words in the order Spanish speakers actually use them.",
            },
            {
              title: "Draft",
              text: "An AI model drafts each word page: meanings, definitions, examples with translations, related words, and a memory hook only when a good one exists.",
            },
            {
              title: "Check independently",
              text: "A second AI from a different company checks every field without seeing the first one's reasoning, and automatic checks catch problems like a word missing from its own example.",
            },
            {
              title: "Human review",
              text: "A person reviews each word as a student would see it, fixes what's wrong, and approves it. Volunteer Spanish teachers will be able to help as reviewers.",
            },
            {
              title: "Keep improving",
              text: "With launch, students get a Report a problem link on every question. A word with several reports is paused for new students until it's reviewed again, and unusual answer statistics flag words for another look.",
            },
          ]}
        />
        <p>Spanish is taught in a neutral Latin American variety, and regional words are marked.</p>
      </Section>

      <Section title="Where things stand">
        <p>
          The app is built: the learning engine, training, accounts, teacher tools and integrity
          checks. Next come the first 500 words, through the process above, and then a pilot with a
          real class. Accounts open when the words are ready.
        </p>
        <p>
          The code is open source on{" "}
          <a className={link} href="https://github.com/AlexanderGiannak/LenguaLearn">
            GitHub
          </a>
          .
        </p>
      </Section>

      <CtaBand
        title="See what's built"
        text="The demo runs the full app with 40 sample words that haven't been reviewed yet."
        demoHref={tryDemoHref(process.env)}
      />
    </InfoPage>
  );
}
