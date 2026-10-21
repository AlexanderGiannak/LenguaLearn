import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { teacherScope } from "@/lib/teacher/scope";

export async function GET(request: Request, ctx: RouteContext<"/api/teacher/classes/[id]/csv">) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => {
    const classId = parse(z.uuid(), (await ctx.params).id);
    const { filename, csv } = await teacherScope(user.id).seatsCsv(classId);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
