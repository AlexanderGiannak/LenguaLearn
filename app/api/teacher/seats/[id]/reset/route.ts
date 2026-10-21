import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";

export async function POST(request: Request, ctx: RouteContext<"/api/teacher/seats/[id]/reset">) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) =>
    teacherScope(user.id).resetSeat(parse(z.uuid(), (await ctx.params).id)),
  );
}
