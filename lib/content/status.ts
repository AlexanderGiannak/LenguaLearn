import type { ContentStatus } from "./constants";

// The content status flow (spec: Non-negotiables, Content pipeline):
// draft → ai_checked → approved → live, with rejections back to draft and retirement
// from anywhere. Content reaches live only from approved, and approved only from
// ai_checked. A retired row comes back as a draft and goes through the flow again.
// The admin status endpoint and the Phase 9 review tool both go through this check.
const NEXT: Record<ContentStatus, readonly ContentStatus[]> = {
  draft: ["ai_checked", "retired"],
  ai_checked: ["approved", "draft", "retired"],
  approved: ["live", "draft", "retired"],
  live: ["retired"],
  retired: ["draft"],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return NEXT[from].includes(to);
}
