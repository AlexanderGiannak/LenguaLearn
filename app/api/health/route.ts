import { connection } from "next/server";
import { getSql } from "@/lib/db/client";
import { checkDatabase } from "@/lib/health";

// Used by Railway's deploy health check and the uptime monitor. Returns no user data.
export async function GET() {
  // Opt out of build-time prerendering: the database check must run per request.
  await connection();

  const ok = await checkDatabase(() => getSql()`select 1`, 2000);
  if (!ok) console.error("health: database check failed");

  return Response.json(
    { status: ok ? "ok" : "unavailable" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
