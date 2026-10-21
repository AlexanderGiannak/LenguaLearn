import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { MAX_SEATS, teacherScope } from "@/lib/teacher/scope";

const schema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  seats: z.int().min(1).max(MAX_SEATS),
});

export async function GET(request: Request) {
  return handle(request, { roles: ["teacher"] }, async ({ user }) => ({
    classes: await teacherScope(user.id).listClasses(),
  }));
}

export async function POST(request: Request) {
  return handle(request, { roles: ["teacher"] }, async ({ user, body }) => {
    const created = await teacherScope(user.id).createClass(parse(schema, body));
    return { id: created.id };
  });
}
