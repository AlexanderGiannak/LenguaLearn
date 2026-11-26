import { getDb } from "@/lib/db/client";
import { handle, parse } from "@/lib/http/handler";
import { reportSchema, submitReport } from "@/lib/review/reports";
import { TRAINING_ROLES } from "@/lib/train/roles";

// "Report a problem" on a question the learner was shown. Class seats send a reason only;
// other accounts' text is stored (contact details removed) for reviewers, never sent to any AI.
export async function POST(request: Request) {
  return handle(request, { roles: TRAINING_ROLES }, ({ user, body }) =>
    submitReport(getDb(), user, parse(reportSchema, body)),
  );
}
