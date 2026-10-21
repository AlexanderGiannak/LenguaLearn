import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";

const id = z.uuid();

export async function GET(request: Request, ctx: RouteContext<"/api/teacher/classes/[id]">) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => {
    const classId = parse(id, (await ctx.params).id);
    const scope = teacherScope(user.id);
    const c = await scope.getClass(classId);
    return { class: { id: c.id, name: c.name }, seats: await scope.listSeats(classId) };
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/teacher/classes/[id]">) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => {
    await teacherScope(user.id).deleteClass(parse(id, (await ctx.params).id));
    return { deleted: true };
  });
}
