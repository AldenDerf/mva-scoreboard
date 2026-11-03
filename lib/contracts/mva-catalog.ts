/**
 * MVA-owned server-to-server catalog contract for MVA Live Scoreboard.
 *
 * All responses are validated at runtime in `lib/integrations/mva-catalog-client.ts`
 * before reaching application logic or UI components.
 */
export type MvaTournamentStatus =
  | "DRAFT"
  | "OPEN_FOR_REGISTRATION"
  | "ADMIN_REGISTRATION_ONLY"
  | "REGISTRATION_CLOSED"
  | "ONGOING"
  | "COMPLETED"
  | "ARCHIVED";

export const ELIGIBLE_MVA_TOURNAMENT_STATUSES = [
  "REGISTRATION_CLOSED",
  "ONGOING",
] as const;

export type EligibleMvaTournamentStatus =
  (typeof ELIGIBLE_MVA_TOURNAMENT_STATUSES)[number];

export interface CatalogPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TournamentSummary {
  id: string; // UUID
  name: string;
  year: number | null;
  status: EligibleMvaTournamentStatus;
}

export interface DivisionSummary {
  id: string; // UUID
  tournamentId: string; // UUID
  name: string;
}

export interface EligibleTeam {
  registrationId: string; // UUID
  teamId: string; // UUID
  name: string;
  logoUrl: string | null;
}

export interface ValidateMatchupRequest {
  tournamentId: string;
  divisionId: string;
  registrationAId: string;
  registrationBId: string;
}

export interface ValidatedMatchup {
  tournament: TournamentSummary;
  division: DivisionSummary;
  teamA: EligibleTeam;
  teamB: EligibleTeam;
  validatedAt: string; // ISO 8601, advisory only; create must use a fresh response
}

export interface VerifyAdminStatusResponse {
  authUserId: string;
  isActiveAdmin: boolean;
  verifiedAt: string;
}
