import { requireScorekeeper } from "@/lib/auth/authorization";
import { LiveScorekeeper } from "@/components/live-scorekeeper";

export const instant = false;
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScorekeeper();
  const { id } = await params;
  return <LiveScorekeeper matchId={id} />;
}
