import { z } from "zod";
import { adminDeleteClass, adminDeleteStudent } from "@/lib/account/data";
import { denyAdminRequest, json, readJsonBody, zodIssues } from "@/lib/admin/route";
import { fixturesAllowed } from "@/lib/admin/auth";
import { purgeAllDemoAccounts } from "@/lib/demo/service";
import { seedDemoClass } from "@/lib/teacher/demo";
import { purgeScheduledDeletions } from "@/lib/teacher/scope";

// District deletion requests and the scheduled purge (spec: Deletion and export). Admin
// token only; every action is written to admin_action_log.

const schema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("delete_student"), id: z.string().min(1).max(64) }),
  z.strictObject({
    action: z.literal("delete_class"),
    id: z.uuid(),
    withStudents: z.boolean().default(true),
  }),
  z.strictObject({ action: z.literal("purge_scheduled") }),
  // Every demo account (demo_account), with its classes and students: for switching a
  // site's demo mode off.
  z.strictObject({ action: z.literal("purge_demo_accounts") }),
  // Demo class for local development and PR previews only (never production).
  z.strictObject({
    action: z.literal("seed_demo_class"),
    students: z.int().min(1).max(40).default(25),
    days: z.int().min(1).max(28).default(7),
  }),
]);

export async function POST(request: Request) {
  const denied = denyAdminRequest(request);
  if (denied) return denied;
  const body = await readJsonBody(request, 10_000);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success)
    return json({ error: "invalid payload", issues: zodIssues(parsed.error.issues) }, 400);
  const a = parsed.data;
  if (a.action === "delete_student") await adminDeleteStudent(a.id);
  if (a.action === "delete_class") await adminDeleteClass(a.id, a.withStudents);
  if (a.action === "purge_scheduled") return json({ purged: await purgeScheduledDeletions() });
  if (a.action === "purge_demo_accounts") return json({ purged: await purgeAllDemoAccounts() });
  if (a.action === "seed_demo_class") {
    if (!fixturesAllowed(process.env)) {
      return json({ error: "demo classes are not allowed in this environment" }, 403);
    }
    const demo = await seedDemoClass({ students: a.students, days: a.days });
    return json({
      classId: demo.classId,
      teacherEmail: demo.teacherEmail,
      teacherPassword: demo.teacherPassword,
    });
  }
  return json({ ok: true });
}
