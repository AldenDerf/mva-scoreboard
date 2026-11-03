import { listMatches } from "@/lib/db/scoreboard";
import { apiAuth, apiError, handleCreateMatchRequest } from "@/lib/server/scoreboard-api";

export async function GET() {
  const auth = await apiAuth();
  if (auth instanceof Response) return auth;
  try {
    const matches = await listMatches(auth.userId!);
    return Response.json({ matches }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  return handleCreateMatchRequest(request);
}
