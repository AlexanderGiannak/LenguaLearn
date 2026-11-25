import type { ContentStatus } from "./constants";

// The content status flow (spec: Non-negotiables, Content pipeline):
// draft → ai_checked → approved → live, with rejections back to draft and retirement
// from anywhere. Content reaches live only from approved, and approved only from
// ai_checked. A retired row comes back as a draft and goes through the flow again.
// The admin status endpoint and the Phase 9 review tool both go through this check; only
// the review tool may approve a draft (see canTransition).
const NEXT: Record<ContentStatus, readonly ContentStatus[]> = {
  draft: ["ai_checked", "retired"],
  ai_checked: ["approved", "draft", "retired"],
  approved: ["live", "draft", "retired"],
  live: ["retired"],
  retired: ["draft"],
};

/**
 * Who is moving the row. "human-review" is the review tool, used by a signed-in reviewer or
 * admin: a person who has looked at the sense may approve a draft directly, including one
 * they just fixed (owner, 2026-11-25). The pipeline and the admin API may not.
 */
export type TransitionActor = "pipeline" | "human-review";

export function canTransition(
  from: ContentStatus,
  to: ContentStatus,
  actor: TransitionActor = "pipeline",
): boolean {
  if (actor === "human-review" && from === "draft" && to === "approved") return true;
  return NEXT[from].includes(to);
}
