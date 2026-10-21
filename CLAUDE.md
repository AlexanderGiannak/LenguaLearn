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

Phases 0–7 are merged (2026-10-21). In progress: a design pass in a Brilliant-like direction
(owner's choice): student screens first, owner approves screenshots, then the teacher pages.
Next: Phase 9 (content pipeline), which needs owner answers and keys (see DECISIONS open
questions); Phase 8 is after the pilot. Production (lengualearn.com) has not deployed yet: Railway
paused builds platform-wide on 2026-10-21; deploy `main` once they resume.
Stop only for blockers or privacy, grading or money choices; batch questions when stopping.

Environment notes: the repo is in iCloud-synced Documents and iCloud creates "* 2" duplicates (even
in `.git` and `drizzle/meta`). Before generating migrations or committing, delete them:
`find . -path ./node_modules -prune -o -name '* 2*' -print`. iCloud also corrupts `.next`
(the dev server then reloads pages in a loop): stop the server, `rm -rf .next`, restart. The local test database is rebuilt with
`docker compose exec -T db psql -U postgres -c 'DROP DATABASE IF EXISTS lengualearn_test'`.
