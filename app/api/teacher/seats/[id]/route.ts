import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";

export async function DELETE(request: Request, ctx: RouteContext<"/api/teacher/seats/[id]">) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => {
    await teacherScope(user.id).removeSeat(parse(z.uuid(), (await ctx.params).id));
    return { deleted: true };
  });
}
