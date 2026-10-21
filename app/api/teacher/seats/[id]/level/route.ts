import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";

// Teacher override of a student's starting level. No maximum level, by spec.
const schema = z.strictObject({ level: z.int().min(1).max(1000) });

export async function POST(request: Request, ctx: RouteContext<"/api/teacher/seats/[id]/level">) {
  return handle(request, { roles: ["teacher"] }, async ({ user, body }) => {
    await teacherScope(user.id).setStartLevel(
      parse(z.uuid(), (await ctx.params).id),
      parse(schema, body).level,
    );
    return { ok: true };
  });
}
