// The "Report a problem" menu, shared by the trainer (browser) and the server. No database
// imports here, so the browser bundle stays small.

export const REPORT_REASONS = [
  "answer_marked_wrong",
  "wrong_meaning",
  "two_answers",
  "spelling",
  "audio",
  "confusing",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  answer_marked_wrong: "My answer should count",
  wrong_meaning: "The meaning or translation is wrong",
  two_answers: "More than one answer is right",
  spelling: "There's a spelling or grammar mistake",
  audio: "The audio is wrong",
  confusing: "The question is confusing",
  other: "Something else",
};

export const REPORT_TEXT_MAX = 300;
