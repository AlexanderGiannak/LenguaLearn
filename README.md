# LenguaLearn

A free web app for learning Spanish vocabulary in short daily sessions, for independent learners and for
Spanish classes from first year through AP and college. Spaced repetition, rich word pages, and teacher
dashboards built around attentive practice time. Class students use anonymous handles, never names or emails.

## Status

Build phases 0–7 of the [spec](docs/SPEC.md) are done, plus a design pass. The app runs on Railway:

- **[lengualearn.com](https://lengualearn.com)**: the real site. The public pages are up; sign-up shows
  "Opening soon" until reviewed Spanish words and teacher email exist.
- **try.lengualearn.com**: the demo, with its own database, 40 sample words and one-click learner and
  teacher accounts that come with weeks of practice history. Its HTTPS certificate is waiting on a
  Let's Encrypt rate limit (see the open questions in [DECISIONS.md](docs/DECISIONS.md)).

What works: word pages; training sessions with FSRS reviews and question types that get harder as a word
becomes known; a level check (placement); learner home, word list and progress pages; class accounts from
seat codes; teacher dashboards with minutes, accuracy, words learned, flagged time and grades; integrity
checks; data export and account deletion.

Not yet: the content pipeline that produces reviewed Spanish words (Phase 9, next), email for teacher
verification and password resets, Google sign-in, audio recordings, and assessments (Phase 8, after the
pilot). The only words today are the 40 test fixtures, which never reach the real site.

## Running it

Needs Node 24 and Docker. Setup steps, every command and a map of the code are in
[AGENTS.md](AGENTS.md#commands). After setup, `npm run seed:demo-class` prints a teacher sign-in with a
class of 25 students and a week of practice.

## Docs

- Product spec (source of truth): [docs/SPEC.md](docs/SPEC.md)
- Decisions beyond the spec, and open questions: [docs/DECISIONS.md](docs/DECISIONS.md)
- Contributor and agent guidelines, commands and repo map: [AGENTS.md](AGENTS.md)
- How the learning engine behaves over 60 simulated days: [docs/simulator-report.md](docs/simulator-report.md)

Pull requests are reviewed by Codex and merge once CI passes.

Code is licensed under the [MIT License](LICENSE). The license for Spanish learning content is still to be decided.
