# Decisions

Decisions that go beyond [SPEC.md](SPEC.md), newest last. One line of reason each.

| Date | Decision | Reason |
|---|---|---|
| 2026-10-20 | Product name is LenguaLearn (working name). "Raíz" replaced everywhere | Owner's instruction in the original spec |
| 2026-10-20 | Spec moved from CLAUDE.md to `docs/SPEC.md` with markdown restored. Text unchanged apart from the rename | CLAUDE.md is loaded into every agent session; 50 KB of spec wasted context, and the paste had flattened tables |
| 2026-10-20 | Shared agent rules live in `AGENTS.md`. `CLAUDE.md` imports it and adds Claude-only notes. The spec's "update CLAUDE.md with setup and run commands, architecture, where things live" now means AGENTS.md | One set of rules for both Claude Code and Codex |
| 2026-10-20 | Architecture diagram in SPEC.md reconstructed as Mermaid | The original embed was lost in the paste |
| 2026-10-20 | Codex (OpenAI) reviews every PR automatically using `## Review guidelines` in AGENTS.md. Claude Code writes; the owner merges | Independent second reviewer from a different provider |
| 2026-10-20 | Work goes through PRs. Branch protection on `main` (PR + green CI) once Phase 0 adds CI | Gives CI, Railway previews and Codex a PR to attach to |
| 2026-10-20 | No `Co-Authored-By` or AI attribution in commits or PRs | Owner's preference |
| 2026-10-20 | `reference/prototype.html` does not exist. The 40-word Phase 1 seed set will be proposed in the Phase 1 plan, as marked fixtures going through the status flow | File referenced by the spec was never created |
| 2026-10-20 | Raw AI generation responses (`content/raw/`) are gitignored, kept locally for audit | The repo is public; unreviewed content shouldn't be published |

## Open questions

- **Second-model provider for the content check (Phase 9 step 3):** OpenAI or Google. Decide at Phase 9.
- **Domain:** needed for SES (SPF/DKIM), the CloudFront audio subdomain and the IT data sheet allowlist.
- **Railway:** account and GitHub connection needed for Phase 0's preview deploy.
- **Pilot school:** state and time zone (deploy windows; TN vs FL law emphasis).
- **Password hashing:** recommendation is to keep Better Auth's default scrypt (no native module). Argon2id would add `@node-rs/argon2`.
- **Licenses:** code license for a public repo (MIT, AGPL or none) and a separate license for content.
- **Package manager:** npm proposed (already installed, Node 24).
- **Rate limiting (Phase 4):** Better Auth's built-in limiter keys on IP and path. Per-handle, per-seat-code and per-device-cookie limits likely need custom rules or a small custom limiter; confirm before Phase 4.
- **TN-NDPA:** nothing found yet that would prevent signing. Add items here as they come up.
