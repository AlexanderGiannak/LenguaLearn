@AGENTS.md

# Claude Code notes

- Before each task, read the relevant sections of `docs/SPEC.md`. It is long, so don't load it whole unless the
  task needs it. When a session starts a new phase, re-read that phase's row and every section it touches.
- Workflow per chunk: branch → commits → `gh pr create` → wait for CI and the Codex review → read review
  comments with `gh pr view <n> --comments` and `gh api repos/AlexanderGiannak/LenguaLearn/pulls/<n>/comments`
  → fix or reply → `gh pr merge <n> --auto --merge` (the owner asked for auto-merge on 2026-10-21).
- Plain commit messages and PR bodies: no `Co-Authored-By` trailer, no "Generated with Claude Code" line.
- Record any decision beyond the spec in `docs/DECISIONS.md` in the same PR.

## Current phase

Phases run back to back (owner, 2026-10-21). Phase 3 (training UI) in review: PR from
`phase-3/training`. Phase 4 (accounts) is next. Stop only for blockers or privacy, grading or money
choices; batch questions when stopping.
