import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/teacher/classes/[id]/students/[seatId]">,
) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => {
    const { id, seatId } = await ctx.params;
    return teacherScope(user.id).studentDetail(parse(z.uuid(), id), parse(z.uuid(), seatId));
  });
}
