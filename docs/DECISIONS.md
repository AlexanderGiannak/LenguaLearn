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

## Open questions

- **Second-model provider for the content check (Phase 9 step 3):** OpenAI or Google. Decide at Phase 9.
- **Content license:** for word pages, examples, hooks and audio (for example CC BY-SA, or all rights reserved). Code is MIT.
- **Domain:** needed before Phase 4 finishes (SES needs SPF/DKIM on a domain for verification and reset email) and before the pilot (CloudFront audio subdomain, IT data sheet allowlist).
- **Rate limiting (Phase 4):** Better Auth's built-in limiter keys on IP and path. Per-handle, per-seat-code and per-device-cookie limits likely need custom rules or a small custom limiter; confirm before Phase 4.
- **TN-NDPA:** nothing found yet that would prevent signing. Add items here as they come up.
