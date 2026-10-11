import { requireScoreboardAuth } from "@/lib/auth/authorization";

export const instant = false;

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side guard enforcing session, identity, and scoreboard role.
  // Fails closed if user has no active scoreboard role grant.
  await requireScoreboardAuth();

  return <>{children}</>;
}
