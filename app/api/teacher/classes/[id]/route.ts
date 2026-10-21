import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";

const id = z.uuid();

export async function GET(request: Request, ctx: RouteContext<"/api/teacher/classes/[id]">) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => {
    const classId = parse(id, (await ctx.params).id);
    const scope = teacherScope(user.id);
    const c = await scope.getClass(classId);
    return {
      class: {
        id: c.id,
        name: c.name,
        weeklyGoalMinutes: c.weeklyGoalMinutes,
        weekResetDay: c.weekResetDay,
        weekResetTime: c.weekResetTime,
        timeZone: c.timeZone,
        sessionMinutes: c.sessionMinutes,
        focusListId: c.focusListId,
        gradeGoalWeight: c.gradeGoalWeight,
        gradeAccuracyWeight: c.gradeAccuracyWeight,
        gradeFlaggedDeduction: c.gradeFlaggedDeduction,
      },
      seats: await scope.listSeats(classId),
    };
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/teacher/classes/[id]">) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => {
    await teacherScope(user.id).deleteClass(parse(id, (await ctx.params).id));
    return { deleted: true };
  });
}

const settings = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    weeklyGoalMinutes: z.int().min(1).max(10000),
    weekResetDay: z.int().min(0).max(6),
    weekResetTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timeZone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "unknown time zone"),
    sessionMinutes: z.int().min(1).max(60),
    focusListId: z.int().positive().nullable(),
    gradeGoalWeight: z.number().min(0).max(100),
    gradeAccuracyWeight: z.number().min(0).max(100),
    gradeFlaggedDeduction: z.number().min(0).max(100),
  })
  .partial();

export async function PATCH(request: Request, ctx: RouteContext<"/api/teacher/classes/[id]">) {
  return handle(request, { roles: ["teacher"] }, async ({ user, body }) => {
    await teacherScope(user.id).updateSettings(
      parse(id, (await ctx.params).id),
      parse(settings, body),
    );
    return { ok: true };
  });
}
