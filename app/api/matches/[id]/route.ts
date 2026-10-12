import { getMatch } from "@/lib/db/scoreboard";
import { apiAuth, apiError, validUuid } from "@/lib/server/scoreboard-api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validUuid(id)) return Response.json({ error: "Invalid match ID." }, { status: 400 });
  const auth = await apiAuth();
  if (auth instanceof Response) return auth;
  try {
    const match = await getMatch(auth.userId!, id);
    return match ? Response.json({ match }, { headers: { "Cache-Control": "private, no-store" } })
      : Response.json({ error: "Match unavailable." }, { status: 404 });
  } catch (error) { return apiError(error); }
}
