import { getOverlay } from "@/lib/db/scoreboard";
import { apiError, validUuid } from "@/lib/server/scoreboard-api";

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  if (!validUuid(publicId)) return Response.json({ error: "Overlay unavailable." }, { status: 404 });
  try {
    const overlay = await getOverlay(publicId);
    return overlay ? Response.json({ overlay }, { headers: { "Cache-Control": "public, no-store" } })
      : Response.json({ error: "Overlay unavailable." }, { status: 404 });
  } catch (error) { return apiError(error); }
}
