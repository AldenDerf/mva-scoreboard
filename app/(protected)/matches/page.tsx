import { requireScorekeeper } from "@/lib/auth/authorization";
import { MatchList } from "@/components/match-list";

export const instant = false;
export default async function MatchesPage() {
  const auth = await requireScorekeeper();
  return <MatchList isAdmin={auth.role === "ADMIN"} />;
}
