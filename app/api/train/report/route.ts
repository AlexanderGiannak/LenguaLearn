import { getDb } from "@/lib/db/client";
import { handle, parse } from "@/lib/http/handler";
import { reportSchema, submitReport } from "@/lib/review/reports";
import { TRAINING_ROLES } from "@/lib/train/roles";

// "Report a problem" on a question the learner was shown. The text is the learner's own
// words: stored for reviewers, never sent to any AI.
export async function POST(request: Request) {
  return handle(request, { roles: TRAINING_ROLES }, ({ user, body }) =>
    submitReport(getDb(), user.id, parse(reportSchema, body)),
  );
}
