import type { Metadata } from "next";
import { DotStrip, StackedBar, StatTile } from "../_components/charts";
import { MinutesBar } from "../_components/diagrams";
import {
  CardGrid,
  CtaBand,
  Figure,
  InfoPage,
  InlineLink,
  Section,
  Steps,
} from "../_components/marketing";
import { tryDemoHref } from "@/lib/site/config";

// A made-up class for the dashboard picture: minutes per seat this week, against the
// default goal. Status colors as on the real dashboard, always with their labels.
const GOAL = 45;
const EXAMPLE: { status: keyof typeof STATUS; minutes: number[] }[] = [
  { status: "on_track", minutes: [46, 48, 51, 52, 55, 57, 60, 62, 47, 49, 66, 71] },
  { status: "behind", minutes: [12, 18, 22, 27, 31, 35, 38, 41] },
  { status: "flagged", minutes: [24, 39] },
  { status: "not_started", minutes: [0, 0, 0] },
];
const STATUS = {
  on_track: { label: "On track", color: "var(--status-good)" },
  behind: { label: "Behind", color: "var(--status-warning)" },
  flagged: { label: "Flagged", color: "var(--status-critical)" },
  not_started: { label: "Not started", color: "var(--status-none)" },
};

function DashboardPicture() {
  const seats = EXAMPLE.flatMap((g) => g.minutes.map((m) => ({ status: g.status, minutes: m })));
  const sorted = [...seats].map((s) => s.minutes).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const onTrack = EXAMPLE[0]!.minutes.length;
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="On track" value={`${onTrack}/${seats.length}`} />
        <StatTile label="Median" value={`${median} min`} />
        <StatTile label="Goal" value={`${GOAL} min`} />
      </dl>
      <StackedBar
        label="Example class by status"
        segments={EXAMPLE.map((g) => ({
          key: g.status,
          label: STATUS[g.status].label,
          value: g.minutes.length,
          color: STATUS[g.status].color,
        }))}
      />
      <DotStrip
        label="Example class: minutes this week by student"
        unit=" min"
        goal={{ value: GOAL, label: `Goal ${GOAL} min` }}
        dots={seats.map((s, i) => ({
          key: String(i),
          value: s.minutes,
          color: STATUS[s.status].color,
          title: `Seat ${i + 1}: ${STATUS[s.status].label}`,
        }))}
      />
    </div>
  );
}

export const metadata: Metadata = {
  title: "For teachers · LenguaLearn",
  description:
    "Weekly minutes goals, a class dashboard, flagged time, insights and grade export, with no student names or emails.",
};

export default function ForTeachers() {
  return (
    <InfoPage
      tone="teal"
      eyebrow="For teachers"
      title="Five minutes a week to run it"
      intro={
        <p>
          Set a weekly goal once. Each week, check the dashboard and export grades. Students train
          on their own, at their own level, with no names or emails ever entered.
        </p>
      }
    >
      <Section n={1} title="Set up a class">
        <Steps
          items={[
            {
              title: "Create the class and its seats",
              text: "One seat per student, up to 40, and more whenever you need them. Each seat gets a single-use join code without look-alike characters.",
            },
            {
              title: "Hand out the codes",
              text: "Print cut-out cards, 8 to a page, or download the codes as a spreadsheet with a blank column for names that you fill in yourself.",
            },
            {
              title: "Students join",
              text: "A student enters their code, gets a random handle like quiet-otter-42, and sets a password. They take the level check (or you set their level), and start training.",
            },
          ]}
        />
        <p>
          Forgotten password? Click Reset on that seat for a new one-time code. Progress is kept. A
          student who changes classes keeps their history.
        </p>
      </Section>

      <Section n={2} title="Settings, once">
        <CardGrid
          items={[
            {
              title: "Weekly goal",
              text: "Minutes per week, 45 by default, resetting on the day and time you choose in your time zone.",
            },
            {
              title: "Session length",
              text: "15 minutes by default. Students can stop early; every attentive minute counts.",
            },
            {
              title: "Focus list",
              text: "Optionally put a themed list first, such as a unit's vocabulary, ahead of the usual frequency order.",
            },
            {
              title: "Starting levels",
              text: "Set by the level check, or by you for any student.",
            },
          ]}
        />
      </Section>

      <Section n={3} title="The dashboard">
        <Figure
          tone="teal"
          title="A week at a glance"
          caption="An example class of 25. Each dot is one student's attentive minutes this week, colored by status; the line is the goal. Hover or tap a dot for its seat."
        >
          <DashboardPicture />
        </Figure>
        <p>
          Below the charts, one row per student, sortable by any column, with a week picker for past
          weeks:
        </p>
        <ul className="ml-6 list-disc">
          <li>Minutes this week against the goal, counting only attentive time.</li>
          <li>Flagged minutes, shown separately.</li>
          <li>Accuracy, words learned (and gained this week), and when they last trained.</li>
          <li>
            A status for each student: <strong>On track</strong>, <strong>Behind</strong>,{" "}
            <strong>Not started</strong> or <strong>Flagged</strong>.
          </li>
        </ul>
        <p>
          Each student&apos;s page shows minutes per day for four weeks, accuracy by week, their
          level, words learned and in progress, the words they miss most, and any integrity events.
        </p>
      </Section>

      <Section n={4} title="Know what to reteach">
        <p>
          Class insights list the 15 words your class misses most over the last four weeks, each
          with the wrong answer chosen most often, which tells you exactly which confusion to
          address. There&apos;s a printable version for class.
        </p>
      </Section>

      <Section n={5} title="Minutes you can trust" id="integrity">
        <p>
          If minutes count toward a grade, they have to mean practice. Time counts only while a
          question or its feedback is on screen and the tab is visible. Each screen counts for at
          most a minute, and after two minutes without input the session pauses.
        </p>
        <p>
          Stretches that look like guessing are counted as <strong>flagged minutes</strong>: several
          answers faster than anyone could read with mostly wrong results, the same answer position
          again and again while wrong, or answering the moment the tab comes back. The student sees
          one gentle note to slow down. Choosing I don&apos;t know is never flagged.
        </p>
        <Figure tone="coral" title="An example session's minutes">
          <MinutesBar />
        </Figure>
        <p>
          Flags are patterns, not accusations. They&apos;re shown with times so you can decide. The
          server also checks each answer&apos;s timing against its own clock, which stops simple
          scripts from farming minutes.
        </p>
      </Section>

      <Section n={6} title="Grades">
        <p>
          Build a suggested grade from simple parts: a weight on percent of goal (capped at 100%), a
          weight on accuracy, and an optional deduction per flagged minute. A live preview shows the
          result for the whole class before you download the spreadsheet for a week or any date
          range.
        </p>
      </Section>

      <Section n={7} title="Student privacy">
        <p>
          Class students never give LenguaLearn a name, an email, or any other personal information,
          and they&apos;re never offered Google sign-in. If you want names next to seats on your
          dashboard, type them in: they&apos;re stored only in your browser and never sent to us.
          You can move them to another computer as a file.{" "}
          <InlineLink href="/privacy">Privacy at a glance</InlineLink>.
        </p>
      </Section>

      <Section n={8} title="Coming later">
        <p>
          Auto-graded assessments, personalized for each student from the words they have studied or
          fixed for the whole class, with the option to drop a bad question and regrade everyone.
          Also Google sign-in for teachers.
        </p>
      </Section>

      <CtaBand
        title="Open a teacher dashboard"
        text="The demo gives you a class of 25 students after a simulated week: some on track, some behind, two flagged."
        demoHref={tryDemoHref(process.env)}
      />
    </InfoPage>
  );
}
