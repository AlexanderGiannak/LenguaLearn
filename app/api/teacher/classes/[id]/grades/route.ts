import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";
import { weekWindow, zonedTimeToUtc } from "@/lib/teacher/week";

// Grade export (spec: Grade export). ?week=0 (this week, -1 last week...) or
// ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, in the class time zone). format=csv downloads;
// gw/aw/fd override the saved formula for the live preview.

const query = z.object({
  week: z.coerce.number().int().min(-52).max(0).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  format: z.enum(["json", "csv"]).default("json"),
  gw: z.coerce.number().min(0).max(100).optional(),
  aw: z.coerce.number().min(0).max(100).optional(),
  fd: z.coerce.number().min(0).max(100).optional(),
});

export async function GET(request: Request, ctx: RouteContext<"/api/teacher/classes/[id]/grades">) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => {
    const classId = parse(z.uuid(), (await ctx.params).id);
    const q = parse(query, Object.fromEntries(new URL(request.url).searchParams));
    const scope = teacherScope(user.id);
    const c = await scope.getClass(classId);
    let range: { start: Date; end: Date };
    let days = 7;
    if (q.from && q.to) {
      const [fy, fm, fd] = q.from.split("-").map(Number) as [number, number, number];
      const [ty, tm, td] = q.to.split("-").map(Number) as [number, number, number];
      range = {
        start: zonedTimeToUtc(fy, fm, fd, 0, 0, c.timeZone),
        end: zonedTimeToUtc(ty, tm, td + 1, 0, 0, c.timeZone),
      };
      days = (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000 + 1;
    } else {
      range = weekWindow(
        new Date(),
        { resetDay: c.weekResetDay, resetTime: c.weekResetTime, timeZone: c.timeZone },
        q.week ?? 0,
      );
    }
    const formula =
      q.gw !== undefined || q.aw !== undefined || q.fd !== undefined
        ? {
            goalWeight: q.gw ?? c.gradeGoalWeight,
            accuracyWeight: q.aw ?? c.gradeAccuracyWeight,
            flaggedDeduction: q.fd ?? c.gradeFlaggedDeduction,
          }
        : undefined;
    const result = await scope.gradeRows(classId, range, formula, days);
    if (q.format === "json")
      return {
        ...result,
        range: { start: range.start.toISOString(), end: range.end.toISOString() },
      };

    const header =
      "seat,handle,minutes,goal,percent of goal,accuracy,flagged minutes,suggested grade";
    const lines = result.rows.map((r) =>
      [
        r.seat,
        r.handle,
        r.minutes,
        r.goal,
        r.percentOfGoal,
        r.accuracy ?? "",
        r.flaggedMinutes,
        r.suggestedGrade,
      ].join(","),
    );
    const name = `${c.name.replace(/[^\w-]+/g, "_")}-grades.csv`;
    return new Response(`${[header, ...lines].join("\n")}\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
