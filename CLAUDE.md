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

Phases run back to back (owner, 2026-10-21). Open stacked PRs: #8 accounts (auto-merge armed),
#9 teacher tools, #10 integrity, #11 placement and learner home (Phase 7). As each merges, its child
retargets to `main`; turn on auto-merge for it once its Codex findings are handled. Next: Phase 9
(content pipeline), which needs owner keys (see DECISIONS open questions); Phase 8 is after the pilot.
Stop only for blockers or privacy, grading or money choices; batch questions when stopping.

Environment notes: the repo is in iCloud-synced Documents and iCloud creates "* 2" duplicates (even
in `.git` and `drizzle/meta`). Before generating migrations or committing, delete them:
`find . -path ./node_modules -prune -o -name '* 2*' -print`. The local test database is rebuilt with
`docker compose exec -T db psql -U postgres -c 'DROP DATABASE IF EXISTS lengualearn_test'`.
