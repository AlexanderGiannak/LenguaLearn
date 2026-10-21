# Decisions

Decisions that go beyond [SPEC.md](SPEC.md), newest last. One line of reason each.

| Date | Decision | Reason |
|---|---|---|
| 2026-10-20 | Product name is LenguaLearn (working name). "Raíz" replaced everywhere | Owner's instruction in the original spec |
| 2026-10-20 | Spec moved from CLAUDE.md to `docs/SPEC.md` with markdown restored. Text unchanged apart from the rename | CLAUDE.md is loaded into every agent session; 50 KB of spec wasted context, and the paste had flattened tables |
| 2026-10-20 | Shared agent rules live in `AGENTS.md`. `CLAUDE.md` imports it and adds Claude-only notes. The spec's "update CLAUDE.md with setup and run commands, architecture, where things live" now means AGENTS.md | One set of rules for both Claude Code and Codex |
| 2026-10-20 | Architecture diagram in SPEC.md reconstructed as Mermaid | The original embed was lost in the paste |
| 2026-10-20 | Codex (OpenAI) reviews every PR automatically using `## Code Review Rules` in AGENTS.md. Claude Code writes; the owner merges | Independent second reviewer from a different provider |
| 2026-10-20 | Work goes through PRs. Branch protection on `main` (PR + green CI) once Phase 0 adds CI | Gives CI, Railway previews and Codex a PR to attach to |
| 2026-10-20 | No `Co-Authored-By` or AI attribution in commits or PRs | Owner's preference |
| 2026-10-20 | `reference/prototype.html` does not exist. The 40-word Phase 1 seed set will be proposed in the Phase 1 plan, as marked fixtures going through the status flow | File referenced by the spec was never created |
| 2026-10-20 | Raw AI generation responses (`content/raw/`) are gitignored, kept locally for audit | The repo is public; unreviewed content shouldn't be published |
| 2026-10-20 | npm is the package manager | Already installed with Node 24; no extra tooling |
| 2026-10-20 | Code is MIT-licensed. Content license still open | Owner's choice; permissive for a free public project |
| 2026-10-20 | Passwords hashed with Argon2id (OWASP parameters: 19 MiB memory, 2 iterations, 1 lane) via `@node-rs/argon2`, plugged into Better Auth's custom hash/verify hooks. Integration verified in Phase 4 | OWASP's first recommendation; far less memory per hash than scrypt at OWASP strength, which matters when a whole class logs in at once on one small server; native code runs off the event loop; prebuilt binaries mean no build step on Railway |
| 2026-10-20 | No domain yet: use Railway's generated `*.up.railway.app` domain until one is bought | Enough for Phases 0–3 |
| 2026-10-20 | First pilot is in Nashville, TN: time zone America/Chicago. Deploys and migrations happen outside 7am–4pm CT on school days. Tennessee law (Tenn. Code 49-1-708) and the TN-NDPA take priority over Florida | Owner's pilot location |
| 2026-10-20 | Railway is managed from the CLI (`railway`, installed via Homebrew) | Owner's preference; lets the agent configure services and read logs |
| 2026-10-21 | TypeScript 5.x and ESLint 9, as pinned by `create-next-app` 16.4.2, not TypeScript 7 | Next's own template pins them; avoids tooling breakage |
| 2026-10-21 | `@types/node` 24 | Matches the Node 24 runtime; Vitest 5 requires ≥22 types |
| 2026-10-21 | Dependencies added: `drizzle-orm` + `postgres` (ORM and pure-JS driver), `zod`; dev: `drizzle-kit` (migration generator), `vitest`, `@playwright/test`, `prettier`, `eslint-config-prettier` (stops ESLint fighting Prettier), `railway` (IaC authoring SDK) | Spec defaults; the driver needs no native build |
| 2026-10-21 | `npm audit` reports 9 moderate/high issues, all in dev-only tooling (`eslint-config-next`, `drizzle-kit`); production dependencies have 0. Not "fixed" | npm's only fix is downgrading those tools by several major versions; nothing ships to users |
| 2026-10-21 | Node scripts (`scripts/*.mts`) run with plain `node`, relying on Node 24's built-in TypeScript type stripping | No `tsx` dependency |
| 2026-10-21 | Next's default Cache Components stays on. The health route calls `connection()` to stay dynamic | Next 16.4 default; documented in AGENTS.md conventions |
| 2026-10-21 | CI triggers on every push to any branch, not separately on `pull_request` | Matches "every push" in the spec without running twice per PR commit |
| 2026-10-21 | Playwright runs two projects: Chromebook (1366×768) and phone (390px wide), Chromium only | The spec's two target devices; Chromebooks run Chrome |
| 2026-10-21 | Railway config lives in `.railway/railway.ts` (IaC), not `railway.json` | `railway.json` is deprecated and stops being read on 2026-12-01 |
| 2026-10-21 | Markdown is excluded from Prettier | Keeps hand-formatted docs and SPEC.md tables from being rewritten |
| 2026-10-21 | Railway deploys a commit only after GitHub CI passes (`checkSuites: true`) | A broken build or failing test never reaches production or a preview |
| 2026-10-21 | Railway hard spending limit: $15/month for the workspace | Owner's choice; caps surprise bills (Railway stops services above it) |
| 2026-10-21 | Production uses Railway's generated `*.up.railway.app` domain until a domain is bought. Generated domains stay out of `.railway/railway.ts` | No domain yet; Railway's IaC rules say not to commit generated domains |
| 2026-10-21 | Content IDs are integers; the word page URL uses the sense ID (`/word/[id]`). Imports match rows by stable text keys (`cuenta#noun`, `cuenta#noun#2`) and children by position | IDs stay the same across re-imports, so student history never breaks; keys work across environments where IDs differ |
| 2026-10-21 | Cognate status values are `none`, `true_cognate`, `false_friend` (the spec's "none, true, or false") | `cognate === "false"` reads like a boolean bug in code |
| 2026-10-21 | Extra lemma fields beyond the spec's list: `article_override` (el agua: feminine, takes "el") and `feminine` (irregular adjective forms) | The word page must show the right article and both adjective forms |
| 2026-10-21 | An import that changes a row saves the old row in `content_revision`, bumps `version`, and puts the row back to the import's status, even if it was live. Unchanged approved or live rows keep their status. Children dropped from an import are retired, never deleted. Senses dropped from a lemma are left alone | Changed text must be reviewed again; nothing a student answered is ever deleted |
| 2026-10-21 | Status flow: draft → ai_checked → approved → live, rejections back to draft, retire from any status, retired → draft. No draft → approved | The spec's flow with no skipped steps. See the open question on human edits |
| 2026-10-21 | Admin API (import, status) uses a bearer token; the server stores only its SHA-256 in `ADMIN_API_TOKEN_HASH`. Requests with an `Origin` header are refused | Laptop scripts need a non-browser credential and accounts don't exist until Phase 4. A 32-byte random token doesn't need a slow hash. Refusing browsers outright removes cross-site risk without an origin allowlist |
| 2026-10-21 | Fixture imports (`"fixture": true`) are accepted only when `RAILWAY_ENVIRONMENT_NAME` is unset (local, CI) or ends in `-pr-<n>` | Test words can never reach production, even with the right token |
| 2026-10-21 | Relation targets are stored as sense keys, not foreign keys, and link only when the target is live | The related word can be imported later, and a link never leads to unpublished content |
| 2026-10-21 | "Under 8 words" for glosses means at most 7. Import also enforces the 20-word sentence limit and requires NFC text | Offsets are character positions; a decomposed "ñ" would shift them |
| 2026-10-21 | Seed: 40 lemmas (41 senses; la cuenta has two), AI-written fixtures with 2 examples each, one original SVG picture, no audio files | Covers every word-page feature; audio comes with Polly in Phase 9 |
| 2026-10-21 | Without a recording, the audio button uses the browser's Spanish voice and prefers on-device voices | Some browser voices send text to a cloud service. Only content text is ever spoken |
| 2026-10-21 | In production a missing or unpublished word shows the not-found page with status 200 and a `noindex` tag, not a 404 status | With Cache Components the page shell streams before the data loads. A true 404 would need a database check in Proxy on every request |
| 2026-10-21 | Database tests (`*.db.test.ts`) run against a separate `<db>_test` database, locally with `npm run test:db` and in the CI e2e job | They never touch dev data, and the fast unit job needs no Postgres |
| 2026-10-21 | No new dependencies in Phase 1 | Zod, Drizzle and Playwright cover everything |
| 2026-10-21 | Dependency: `ts-fsrs` 5.4.2 (FSRS-6), the stable release, not the 6.0 beta | The spec's scheduler; the beta is still changing |
| 2026-10-21 | FSRS short-term mode on, fuzz off, retention 0.9. Checked: three same-session "Good" answers leave stability unchanged (2.3 days); a next-day review raises it (7.3 days) | Answers the spec's question about same-day reviews; fuzz off keeps tests and the simulator repeatable |
| 2026-10-21 | Which card each question type tests: meaning, listening, cloze choice, synonym/antonym and "use it correctly" test recognition; English-to-Spanish, gender, typed meaning, typed cloze and contrast test production. "Hear a sentence, type the missing word" counts as recognition | The spec lists the types by band but not by card. The student hears the word itself, so they are not producing it from its meaning |
| 2026-10-21 | "Fast" for Easy means faster than the student's own median time for that question type; "slow" for Hard is the 80th percentile. Fixed defaults apply until a type has 10 past answers | The spec defines slow but not fast |
| 2026-10-21 | A right "I already know this" rates the recognition card Easy and also creates the production card and rates it Easy | The check is a production question, so it is evidence for both cards |
| 2026-10-21 | Answer checker details: ü counts as an accent; a meaning-changing accent on a learned word is wrong even if production stability is under 21 days; a typo is one edit (including two swapped letters), compared without accents; accepted articles are el/la/un/una; "wrong form" covers only the dictionary form | Pins down cases the spec leaves open; all in the test table |
| 2026-10-21 | A new production card counts as due at once. "Overdue" for the gate means due now, counting each card separately. The same sense is never asked twice in a row unless nothing else is available. The gate is open when there are no past answers yet | Simplest readings of the spec's session rules |
| 2026-10-21 | "Use the word correctly" misuses are other words' example sentences with this word swapped in. Contrast questions appear 10% of the time when possible | Needs no extra content; the rate is a starting value in config |
| 2026-10-21 | Guess-first applies to every true cognate and every word with a parts breakdown | Knowledge of individual parts is not tracked yet |
| 2026-10-21 | Ability and difficulty share a log-frequency-rank scale; an unfitted item's difficulty is ln(rank). Elo step size starts at 0.4 and halves every 50 answers, down to 0.05 | One scale lets the ability score drive placement and the vocabulary estimate |
| 2026-10-21 | `lib/engine` imports use `.ts` extensions, so `npm run simulate` runs under plain Node. A test enforces that the engine imports nothing outside itself and ts-fsrs | No build step or extra dependency for the simulator; keeps the spec's "pure module" rule checked |

## Open questions

- **Second-model provider for the content check (Phase 9 step 3):** OpenAI or Google. Decide at Phase 9.
- **Content license:** for word pages, examples, hooks and audio (for example CC BY-SA, or all rights reserved). Code is MIT.
- **Domain:** needed before Phase 4 finishes (SES needs SPF/DKIM on a domain for verification and reset email) and before the pilot (CloudFront audio subdomain, IT data sheet allowlist).
- **Rate limiting (Phase 4):** Better Auth's built-in limiter keys on IP and path. Per-handle, per-seat-code and per-device-cookie limits likely need custom rules or a small custom limiter; confirm before Phase 4.
- **TN-NDPA:** nothing found yet that would prevent signing. Add items here as they come up.
- **Human edits in review (Phase 9):** the status flow has no draft → approved step. When a reviewer fixes a sense that failed the AI check, should the fix re-run the AI check, or should a human edit count as the check? Decide before building the review tool.
- **Vocabulary-size estimate (Phase 2 simulator):** updating ability after every graded answer, as the spec says, overestimates a beginner's vocabulary about 7× (estimate 2,105 vs a true 279), because right answers on just-taught words look like general knowledge. Updating ability only on first exposures, placement and "I already know this" checks came within about 5%. Owner to decide.
- **New-word cap and backlog:** with two cards per sense and 8 new words per session, a beginner's review backlog keeps growing through week 9 (about 41 due at session start). Owner to review the cap sweep in `docs/simulator-report.md`.
