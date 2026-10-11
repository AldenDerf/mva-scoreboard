/** Proposed MVA-owned server-to-server contract. No endpoint exists yet. */
export type MvaTournamentStatus =
  | "DRAFT"
  | "OPEN_FOR_REGISTRATION"
  | "ADMIN_REGISTRATION_ONLY"
  | "REGISTRATION_CLOSED"
  | "ONGOING"
  | "COMPLETED"
  | "ARCHIVED";

export interface CatalogPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TournamentSummary {
  id: string; // UUID
  name: string;
  year: number | null;
  status: MvaTournamentStatus;
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

/** Runtime validation required at every server boundary: UUIDs, bounded strings,
 * known enum values, response size, HTTPS logo allowlist, and two distinct teams.
 * TypeScript interfaces alone do not validate untrusted MVA responses. */
