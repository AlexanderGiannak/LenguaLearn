import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/teacher/classes/[id]/dashboard">,
) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => {
    const classId = parse(z.uuid(), (await ctx.params).id);
    const week = parse(
      z.coerce.number().int().min(-52).max(0),
      new URL(request.url).searchParams.get("week") ?? "0",
    );
    return teacherScope(user.id).dashboard(classId, week);
  });
}
