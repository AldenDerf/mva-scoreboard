import { applyStoredAction } from "@/lib/db/scoreboard";
import { apiAuth, apiError, parseStoredAction, sameOrigin, validUuid } from "@/lib/server/scoreboard-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const { id } = await context.params;
  if (!validUuid(id)) return Response.json({ error: "Invalid match ID." }, { status: 400 });
  const auth = await apiAuth();
  if (auth instanceof Response) return auth;
  if (Number(request.headers.get("content-length")) > 4096)
    return Response.json({ error: "Request too large." }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Invalid scoring command." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const action = parseStoredAction(input.action);
  if (!validUuid(input.actionId) || !Number.isSafeInteger(input.expectedRevision) ||
      typeof input.expectedRevision !== "number" || input.expectedRevision < 0 || !action)
    return Response.json({ error: "Invalid scoring command." }, { status: 400 });
  try {
    const result = await applyStoredAction(auth.userId!, id, input.actionId, input.expectedRevision, action);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
