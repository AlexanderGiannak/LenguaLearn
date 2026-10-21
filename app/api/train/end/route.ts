import { z } from "zod";
import { handleTraining, parse } from "@/lib/train/http";
import { endSession } from "@/lib/train/service";

const schema = z.strictObject({ sessionId: z.uuid() });

export async function POST(request: Request) {
  return handleTraining(request, (userId, body) =>
    endSession(userId, parse(schema, body).sessionId),
  );
}
