import { createTestMatch, listMatches } from "@/lib/db/scoreboard";
import { apiAuth, apiError, sameOrigin } from "@/lib/server/scoreboard-api";

export async function GET() {
  const auth = await apiAuth();
  if (auth instanceof Response) return auth;
  try {
    const matches = await listMatches(auth.userId!);
    return Response.json({ matches }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const auth = await apiAuth();
  if (auth instanceof Response) return auth;
  if (auth.role !== "ADMIN") return Response.json({ error: "ADMIN required." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 4096)
    return Response.json({ error: "Request too large." }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Invalid match settings." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const teamA = typeof input.teamA === "string" ? input.teamA.trim() : "";
  const teamB = typeof input.teamB === "string" ? input.teamB.trim() : "";
  if (!teamA || !teamB || teamA.length > 80 || teamB.length > 80 ||
      teamA.toLocaleLowerCase() === teamB.toLocaleLowerCase() ||
      (input.bestOf !== 3 && input.bestOf !== 5) ||
      (input.serving !== "A" && input.serving !== "B"))
    return Response.json({ error: "Enter two different teams and valid match rules." }, { status: 400 });
  try {
    const id = await createTestMatch(auth.userId!, teamA, teamB, input.bestOf, input.serving);
    return Response.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
