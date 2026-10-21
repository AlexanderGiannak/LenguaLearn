@AGENTS.md

# Claude Code notes

- Before each task, read the relevant sections of `docs/SPEC.md`. It is long, so don't load it whole unless the
  task needs it. When a session starts a new phase, re-read that phase's row and every section it touches.
- Workflow per chunk: branch → commits → `gh pr create` → wait for CI and the Codex review → read review
  comments with `gh pr view <n> --comments` and `gh api repos/AlexanderGiannak/LenguaLearn/pulls/<n>/comments`
  → fix or reply → the owner merges.
- Plain commit messages and PR bodies: no `Co-Authored-By` trailer, no "Generated with Claude Code" line.
- Record any decision beyond the spec in `docs/DECISIONS.md` in the same PR.

## Current phase

Phase 1 (content schema) in review: PR from `phase-1/content-schema`. Phase 2 (engine) starts after the
owner merges Phase 1 and says to continue.
