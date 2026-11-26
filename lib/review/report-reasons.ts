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

/** Class seats (role "student") pick a reason only: they never type anything to the app
 * beyond answers (spec: Student privacy). */
export const reportTextAllowed = (role: string) => role !== "student";

const REMOVED = "[removed]";

/**
 * Takes out what looks like contact details before a report is stored: email addresses,
 * links, phone numbers and @handles. Names can't be spotted reliably; the dialog asks for
 * none, and reviewers never see who sent a report.
 */
export function scrubPersonalDetails(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, REMOVED)
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, REMOVED)
    .replace(/[\w.-]+\.(?:com|net|org|edu|io|me|us|co|app|gg)\b\S*/gi, REMOVED)
    .replace(/(^|[^\w])@\w{2,}/g, `$1${REMOVED}`)
    .replace(/\+?\(?\d[\d\s().-]{5,}\d/g, (m) => (m.replace(/\D/g, "").length >= 7 ? REMOVED : m));
}
