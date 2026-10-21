import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { wordList } from "@/lib/db/schema";
import { handle } from "@/lib/http/handler";

/** Live word lists a class can use as its focus list. */
export async function GET(request: Request) {
  return handle(request, { roles: ["teacher"] }, async () => ({
    lists: await getDb()
      .select({ id: wordList.id, name: wordList.name })
      .from(wordList)
      .where(eq(wordList.status, "live"))
      .orderBy(asc(wordList.name)),
  }));
}
