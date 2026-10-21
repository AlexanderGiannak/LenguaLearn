import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/teacher/classes/[id]/insights">,
) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => ({
    words: await teacherScope(user.id).insights(parse(z.uuid(), (await ctx.params).id)),
  }));
}
