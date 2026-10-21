import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { MAX_SEATS, teacherScope } from "@/lib/teacher/scope";

const schema = z.strictObject({ count: z.int().min(1).max(MAX_SEATS) });

export async function POST(request: Request, ctx: RouteContext<"/api/teacher/classes/[id]/seats">) {
  return handle(request, { roles: ["teacher"] }, async ({ user, body }) => {
    const classId = parse(z.uuid(), (await ctx.params).id);
    await teacherScope(user.id).addSeats(classId, parse(schema, body).count);
    return { ok: true };
  });
}
