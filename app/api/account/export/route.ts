import { exportUserData } from "@/lib/account/data";
import { handle } from "@/lib/http/handler";

export async function GET(request: Request) {
  return handle(request, { roles: ["student", "learner", "teacher"] }, async ({ user }) => {
    const data = await exportUserData(user.id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="lengualearn-data.json"',
        "Cache-Control": "no-store",
      },
    });
  });
}
