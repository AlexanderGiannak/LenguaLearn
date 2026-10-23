# AGENTS.md

Shared instructions for every coding agent on this repo (Claude Code imports this file; Codex reads it directly).
The full product spec is [docs/SPEC.md](docs/SPEC.md) and it is the source of truth. Read the sections relevant
to your task before starting. Decisions beyond the spec live in [docs/DECISIONS.md](docs/DECISIONS.md).

## Project

LenguaLearn (working name) is a free web app that teaches Spanish vocabulary in short, timed daily sessions:
rich word pages, spaced-repetition reviews (FSRS, two cards per sense), and question types that get harder as a
word becomes known. Two audiences: independent learners, and teachers whose class students train against a
weekly minutes goal. Teachers see attentive minutes, accuracy, words learned and flagged time.

## Non-negotiables

- **Free, no ads, no selling data.** Hosting stays near zero at small scale.
- **Student privacy by design.** Class students never give the app a name, email or any other personal
  information. They are an anonymous handle plus a password, created from a seat code. Never offer Google
  sign-in to class students. Teacher name labels for seats live only in that browser's localStorage.
- **Original content only.** Never scrape, copy or paraphrase Membean's content, pages, images or branding.
- **Accuracy over volume.** Spanish content reaches students only after the status flow
  (draft → ai_checked → approved → live). Only `live` content is shown.
- **Student data never goes to an AI or TTS provider.** This includes agents: never connect to the production
  database or paste real answer data into prompts.

## How to work

- **One phase at a time** (see "Build phases" in SPEC.md), in order. End each phase with the report:
  summary, manual test steps, what was skipped or uncertain, recommended spec changes. The owner now
  runs phases back to back (2026-10-21): post the report, then continue unless blocked.
- **Tests first for logic.** The engine, answer checker, integrity rules, rate limits and authorization checks
  get tests before any UI is built on them. A phase with failing tests is not done.
- **Spec defaults are decisions.** If one looks wrong, say why and wait. Never quietly substitute a choice.
- **Ambiguity:** pick the simplest option consistent with the spec, record it in DECISIONS.md, mention it in the
  phase report. Anything touching **privacy, grading or money**: ask first.
- **Never weaken a privacy rule** to make something easier. If a feature seems to need personal data, stop and ask.
- **Few dependencies.** Justify each new package in one line (in the PR description and DECISIONS.md).
  Prefer the platform and small libraries.
- **No Spanish content in code.** Words, examples and hooks go through the content tables. Test fixtures are the
  only exception and must be marked as fixtures.
- **The owner wants to understand the code.** Briefly explain non-obvious design choices in phase reports.
  Comment the *why* where it isn't obvious; no comments that restate the code.
- **Keep docs current.** Update the Commands and Repo map sections below when they change.

## Git and review workflow

- `main` is protected once CI exists. Work on a short-lived branch per logical chunk
  (`phase-0/setup`, `phase-2/answer-checker`), open a PR, and let CI and the Codex review run.
- Small commits with clear, imperative messages. Never commit secrets (`.env` is ignored; `.env.example` is committed).
- **No `Co-Authored-By` trailers and no AI attribution lines** in commit messages or PR descriptions.
- Codex reviews PRs automatically. Address its findings with a fix or a reply, then turn on auto-merge
  (`gh pr merge <n> --auto --merge`): GitHub merges once the required CI checks pass. Since 2026-10-21 the
  owner has asked for phases to run back to back: finish a phase, give the report in the PR, and
  continue. Stop only for real blockers (credentials, accounts, money) or a privacy or grading choice.

## Commands

First-time setup: Node 24 (`nvm use`), Docker running, then:

```sh
npm install
cp .env.example .env.local     # local settings; never committed
npm run admin:token >> .env.local   # local admin API token pair
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env.local
npm run db:up                  # local Postgres in Docker
npm run db:migrate             # apply migrations
npx playwright install chromium
npm run dev                    # then, in another terminal:
npm run seed:fixtures          # load the 40 fixture words and publish them
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm run build` / `npm start` | Production build / serve it (what Railway runs) |
| `npm run lint` | ESLint |
| `npm run format` / `npm run format:check` | Prettier write / check |
| `npm run typecheck` | Generate Next route types, then `tsc --noEmit` |
| `npm test` | Vitest unit tests (`**/*.test.ts`, no database) |
| `npm run test:db` | Database tests (`**/*.db.test.ts`) against a separate `<db>_test` database, created and migrated automatically |
| `npm run test:e2e` | Playwright tests in `e2e/` at Chromebook (1366×768) and phone (390px) sizes |
| `npm run db:generate` | Generate a SQL migration in `drizzle/` from schema changes. Review the SQL before committing |
| `npm run db:migrate` | Apply migrations (Railway runs this as the pre-deploy step) |
| `npm run admin:token` | Print a new admin API token and its hash (`ADMIN_API_TOKEN` stays on the laptop; the hash goes to the server) |
| `npm run simulate` | Run the engine simulator (100 synthetic learners × 60 days per cohort) and rewrite `docs/simulator-report.md`. About 3 minutes |
| `npm run seed:demo-class [-- <url>]` | Create a demo teacher and a class of 25 students with a simulated week of practice (local and PR previews only); prints the sign-in |
| `npm run seed:fixtures [-- <url>]` | Import the fixture words through the admin API and publish them. Default `http://localhost:3000`; refused in production |

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck and unit tests, then, against a
throwaway Postgres, the database tests, a build, and Playwright (which seeds the fixtures first), on every push.

## Repo map

| Path | What lives there |
|---|---|
| `docs/SPEC.md` | Product spec (source of truth) |
| `docs/DECISIONS.md` | Decisions beyond the spec, plus open questions |
| `app/` | Next.js App Router pages and route handlers. `app/api/health` is the health check; `app/api/admin/` holds the import and status endpoints; `app/word/[id]` is the word page; `app/train` is the training session (client) and `app/api/train/*` its API; `app/join`, `app/student`, `app/sign-in`, `app/sign-up`, `app/teacher` and `app/settings` are the account pages; `app/placement`, `app/home`, `app/words` and `app/progress` are the learner pages; `app/_components` holds shared components (`charts.tsx`: the SVG charts, stat tiles and chart cards; `explainers.tsx` and `diagrams.tsx`: the graphs and diagrams on the public pages; `tones.ts`: their accent colors) |
| `lib/db/` | Drizzle client (`client.ts`, lazy pool) and table definitions (`schema/content.ts` for the content model) |
| `lib/content/` | Content rules shared by the API and pages: allowed values (`constants.ts`), import validation and loading, the status flow (`status.ts`), and the live-only word page query (`word-page.ts`) |
| `lib/admin/` | Admin API token check and request helpers |
| `lib/train/` | Training on the server: live content cache (`content.ts`), card storage (`store.ts`), the session flow (`service.ts`), placement (`placement.ts`), the learner's own stats (`learner.ts`), shared types, and `page-gate.ts` |
| `lib/auth/` | Better Auth setup (`auth.ts`), sign-up, sign-in and seat codes (`accounts.ts`), limits, device cookie, handles and codes, and `session.ts` (`currentUser`, `requireUser`) |
| `lib/teacher/` | `scope.ts` is the one shared teacher-scope helper: every class, seat, dashboard and grade query goes through it. Also `stats.ts` (queries it calls), `week.ts` (class weeks by time zone), `grades.ts` (grade formula and status chips), `demo.ts` (demo class) and `page-gate.ts` |
| `lib/account/` | Data export and account deletion, including district deletions |
| `lib/site/` | `explainers.ts`: data for the public pages' graphs, computed by the engine. `config.ts`: whether accounts are open (`signupsOpen`: "Opening soon" on the real site until `SIGNUPS_OPEN=1`) and where "Try the demo" goes. The public pages are `app/how-it-works`, `app/for-teachers`, `app/privacy` and `app/about`, built from `app/_components/marketing.tsx` |
| `lib/demo/` | Demo site mode (`DEMO_SITE=1`): `config.ts` (the switch, pool size, limits) and `service.ts` (one-click learner and teacher accounts, the teacher pool, cleanup). `app/api/demo/start` is its route |
| `lib/email/` | Outgoing email (console in development; SES later) |
| `lib/http/` | The Origin check and `handle()`, the wrapper every browser-facing API route uses (Origin, role, Zod, errors) |
| `lib/integrity/` | Integrity: every threshold (`config.ts`), the flag rules (`rules.ts`) and the server checks (`server.ts`: signed question tokens, timing bounds) |
| `lib/engine/` | Pure TypeScript learning engine: `config.ts` (every threshold), `cards.ts` (two FSRS cards per sense), `rating.ts`, `answer-check.ts`, `questions.ts` and `distractors.ts`, `next-item.ts` (session order and new-word gate), `ability.ts` (ability and vocabulary size), `intro.ts`, `placement.ts` (the level test), and `simulator/`. Imports only its own files (with `.ts` extensions) and ts-fsrs; `boundaries.test.ts` enforces it |
| `drizzle/` | Generated SQL migrations, committed |
| `scripts/` | Node scripts. `migrate.mts` runs migrations. `scripts/content/` (Phase 9) runs on the owner's laptop, never touches the database, and uploads JSON through the admin import endpoint |
| `e2e/` | Playwright tests. `seed.setup.ts` loads the fixture words before the browser tests |
| `fixtures/` | Test fixtures only, never production content. `fixtures/content/seed-40.json` holds the 40 AI-written seed words |
| `test/` | Setup for the database tests (`vitest.db.config.mts`) |
| `public/fixtures/` | Fixture media (the seed's one picture) |
| `.railway/railway.ts` | Railway infrastructure as code (services, database, region, health check) |
| `docs/` | Also: privacy policy, school IT data sheet, VPAT, COPPA notice, incident plan (later phases) |

## Conventions

- TypeScript strict mode. Zod validates every API input at the boundary.
- Every teacher-facing query goes through the one shared teacher-scope helper. Never scope by hand in a route.
- Student-facing content reads filter every table to `status = 'live'` (see `lib/content/word-page.ts`).
  Content rows are never deleted; they are retired.
- Engine thresholds (accent strictness, new-word gate, integrity limits) live in config, not inline.
- Next 16 runs with Cache Components on: anything that reads the database or the request at request
  time calls `await connection()` (or a request API) first, so the build never tries to prerender it.
- Spanish text in the UI is marked `lang="es"`. Fonts via `next/font`. No external scripts, analytics or trackers.

## Code Review Rules

Priorities for automated PR review. Treat every item below as at least P1, and the ones marked P0 as P0.

- **P0:** Any path that collects, stores, logs or transmits a class student's name, email or other personal
  data, or offers Google sign-in to class students.
- **P0:** IP addresses stored in the database or written to logs. They are in-memory only, for rate limiting.
- **P0:** Seat name labels (localStorage) sent to the server in any request, URL, header or log.
- **P0:** A teacher query not scoped through the shared teacher-scope helper, or an admin/reviewer route
  (including content import) without its role check.
- **P0:** Student data sent to any AI, TTS or third-party service. Secrets or credentials committed.
- API input not validated with Zod. A state-changing route without the Origin header check. Session cookies not
  HTTP-only, Secure, SameSite=Lax.
- Changes to the engine, answer checker, integrity rules, rate limits or auth without matching tests.
- Anything under `lib/engine/` importing database, UI or Next.js code.
- `answer_event` rows updated or deleted outside account deletion. Typed answer text not capped at 40 characters.
- Spanish words, examples or hooks hard-coded outside clearly marked test fixtures. Student-facing queries
  that can return non-`live` content.
- Third-party scripts, analytics, trackers or externally loaded fonts. A new dependency without a one-line
  justification.
- Hard-coded maximum level, or thresholds that the spec says belong in config written inline.
- Accessibility regressions: missing alt text, missing `lang="es"` on Spanish text, no visible focus state,
  tap targets under 44px.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
