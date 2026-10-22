import type { Metadata } from "next";
import { InfoPage, Section } from "../_components/marketing";

export const metadata: Metadata = {
  title: "Privacy · LenguaLearn",
  description: "What LenguaLearn stores, for how long, and what it never does with student data.",
};

const stored = [
  ["Handle and password (stored as a secure hash)", "Until the account is deleted", "Sign-in"],
  [
    "Teacher and independent learner email, if given",
    "Until the account is deleted",
    "Sign-in, confirming the address, password reset",
  ],
  ["Class membership and seat number", "Until the class is deleted", "The teacher's dashboard"],
  [
    "Answers and practice time",
    "Learners: until the account is deleted. Classes: until 30 days after the class is deleted",
    "Scheduling reviews, dashboards",
  ],
  [
    "Typed answers (at most 40 characters)",
    "90 days, then only whether each was right is kept",
    "Checking that answers are graded fairly",
  ],
  ["A random device ID in a cookie", "90 days", "Counting failed sign-ins per device"],
  ["Your IP address", "Never stored", "Used in memory only, to slow down abuse"],
];

export default function Privacy() {
  return (
    <InfoPage
      eyebrow="Privacy"
      title="Privacy at a glance"
      intro={
        <p>
          LenguaLearn is built so it doesn&apos;t need to know who students are. This page
          summarizes how. A full privacy policy, with a retention schedule, will be published before
          accounts open.
        </p>
      }
    >
      <Section title="Class students are anonymous">
        <ul className="ml-6 list-disc">
          <li>
            Students join with a code from their teacher and get a random handle. They never give a
            name, an email address, or any other personal information.
          </li>
          <li>
            Class students are never offered Google sign-in, because a school Google account would
            send us their real name and school email.
          </li>
          <li>
            Only the teacher knows which handle belongs to which student. Names a teacher types next
            to seats stay in that teacher&apos;s browser and are never sent to us.
          </li>
        </ul>
      </Section>

      <Section title="What we store">
        <p>
          These are the rules the app is built around. The scheduled clean-ups that enforce the time
          limits start when accounts open.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-base">
            <thead className="text-sm text-ink-600 dark:text-ink-400">
              <tr>
                <th className="py-2 pr-4 font-semibold">Data</th>
                <th className="py-2 pr-4 font-semibold">Kept</th>
                <th className="py-2 font-semibold">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-ink-100 dark:divide-ink-800">
              {stored.map(([data, kept, why]) => (
                <tr key={data}>
                  <td className="py-3 pr-4 font-semibold text-ink-900 dark:text-ink-100">{data}</td>
                  <td className="py-3 pr-4">{kept}</td>
                  <td className="py-3">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="What we never do">
        <ul className="ml-6 list-disc">
          <li>
            No ads, no third-party analytics, no trackers. Fonts are served from our own site.
          </li>
          <li>No selling or sharing of data, and no marketing use of class data.</li>
          <li>Student data is never sent to an AI or text-to-speech provider.</li>
          <li>No chat and no leaderboards: students never see each other.</li>
        </ul>
        <p>
          Class data is used only to run the app and, with identities removed, to improve it, for
          example to tune the review schedule or find questions that don&apos;t work.
        </p>
      </Section>

      <Section title="Your data, your choice">
        <ul className="ml-6 list-disc">
          <li>
            Any learner or student can download their data and delete their account from Settings.
          </li>
          <li>
            A teacher can delete a class. Students with no other class are deleted 30 days later.
          </li>
          <li>
            A school district can ask for one student, one class, or all its data to be deleted.
          </li>
        </ul>
      </Section>

      <Section title="Where it runs">
        <p>
          The app and its database run in one data center in the eastern United States. Independent
          learners must be 13 or older.
        </p>
      </Section>
    </InfoPage>
  );
}
