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

- **One phase at a time** (see "Build phases" in SPEC.md). Stop at the end of each phase with the report:
  summary, manual test steps, what was skipped or uncertain, recommended spec changes. Do not start the next
  phase until the owner says so.
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
- Codex reviews PRs automatically. Address its findings with a fix or a reply. The owner merges.

## Commands

_Filled in during Phase 0._ Planned: `npm run dev`, `npm run build`, `npm start`, `npm run lint`,
`npm run typecheck`, `npm test` (Vitest), `npm run test:e2e` (Playwright), `npm run db:generate` /
`npm run db:migrate` (Drizzle).

## Repo map

_Filled in as code lands._ Fixed locations from the spec:

| Path | What lives there |
|---|---|
| `docs/SPEC.md` | Product spec (source of truth) |
| `docs/DECISIONS.md` | Decisions beyond the spec, plus open questions |
| `lib/engine/` | Pure TypeScript learning engine. No database, UI or Next.js imports |
| `scripts/content/` | Content pipeline scripts. Run on the owner's laptop, never touch the database, upload JSON through the admin import endpoint |
| `docs/` | Privacy policy, school IT data sheet, VPAT, COPPA notice, incident plan (later phases) |

## Conventions

- TypeScript strict mode. Zod validates every API input at the boundary.
- Every teacher-facing query goes through the one shared teacher-scope helper. Never scope by hand in a route.
- Engine thresholds (accent strictness, new-word gate, integrity limits) live in config, not inline.
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
