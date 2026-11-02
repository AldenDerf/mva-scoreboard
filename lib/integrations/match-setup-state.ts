import type {
  DivisionSummary,
  EligibleTeam,
  TournamentSummary,
  ValidatedMatchup,
} from "../contracts/mva-catalog.ts";

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type ValidationStatus = "idle" | "validating" | "validated" | "error";

export interface OfficialMatchSetupState {
  tournamentId: string;
  divisionId: string;
  registrationAId: string;
  registrationBId: string;
  bestOf: 3 | 5;
  serving: "A" | "B";

  tournaments: TournamentSummary[];
  tournamentsStatus: LoadStatus;
  tournamentsError: string | null;

  divisions: DivisionSummary[];
  divisionsStatus: LoadStatus;
  divisionsError: string | null;

  teams: EligibleTeam[];
  teamsStatus: LoadStatus;
  teamsError: string | null;

  validationStatus: ValidationStatus;
  validatedMatchup: ValidatedMatchup | null;
  validationMessage: string | null;
}

export function createInitialMatchSetupState(): OfficialMatchSetupState {
  return {
    tournamentId: "",
    divisionId: "",
    registrationAId: "",
    registrationBId: "",
    bestOf: 3,
    serving: "A",

    tournaments: [],
    tournamentsStatus: "idle",
    tournamentsError: null,

    divisions: [],
    divisionsStatus: "idle",
    divisionsError: null,

    teams: [],
    teamsStatus: "idle",
    teamsError: null,

    validationStatus: "idle",
    validatedMatchup: null,
    validationMessage: null,
  };
}

/**
 * Resets division, Team A, Team B, first serve, and validation state when
 * the selected tournament changes.
 */
export function selectTournamentState(
  state: OfficialMatchSetupState,
  tournamentId: string
): OfficialMatchSetupState {
  const cleanId = tournamentId.trim();
  return {
    ...state,
    tournamentId: cleanId,
    divisionId: "",
    registrationAId: "",
    registrationBId: "",
    serving: "A",
    divisions: [],
    divisionsStatus: cleanId ? "loading" : "idle",
    divisionsError: null,
    teams: [],
    teamsStatus: "idle",
    teamsError: null,
    validationStatus: "idle",
    validatedMatchup: null,
    validationMessage: null,
  };
}

/**
 * Resets Team A, Team B, first serve, and validation state when
 * the selected division changes.
 */
export function selectDivisionState(
  state: OfficialMatchSetupState,
  divisionId: string
): OfficialMatchSetupState {
  const cleanId = divisionId.trim();
  return {
    ...state,
    divisionId: cleanId,
    registrationAId: "",
    registrationBId: "",
    serving: "A",
    teams: [],
    teamsStatus: cleanId ? "loading" : "idle",
    teamsError: null,
    validationStatus: "idle",
    validatedMatchup: null,
    validationMessage: null,
  };
}

/**
 * Returns eligible teams available for one side, excluding the team selected on the other side
 * by both registrationId and teamId.
 */
export function filterSelectableTeams(
  teams: readonly EligibleTeam[],
  excludedRegistrationId: string
): EligibleTeam[] {
  const cleanExcluded = excludedRegistrationId.trim().toLowerCase();
  if (!cleanExcluded) return [...teams];

  const excludedTeam = teams.find(
    (t) => t.registrationId.toLowerCase() === cleanExcluded
  );
  const excludedTeamId = excludedTeam?.teamId.toLowerCase();

  return teams.filter((team) => {
    if (team.registrationId.toLowerCase() === cleanExcluded) return false;
    if (excludedTeamId && team.teamId.toLowerCase() === excludedTeamId) {
      return false;
    }
    return true;
  });
}

export function selectTeamAState(
  state: OfficialMatchSetupState,
  registrationAId: string
): OfficialMatchSetupState {
  const cleanId = registrationAId.trim();
  if (!cleanId) {
    return {
      ...state,
      registrationAId: "",
      validationStatus: "idle",
      validatedMatchup: null,
      validationMessage: null,
    };
  }

  const allowedForA = filterSelectableTeams(state.teams, state.registrationBId);
  const isAllowed = allowedForA.some(
    (t) => t.registrationId.toLowerCase() === cleanId.toLowerCase()
  );

  if (!isAllowed) {
    return {
      ...state,
      validationStatus: "error",
      validatedMatchup: null,
      validationMessage: "Team A and Team B must be two different eligible teams.",
    };
  }

  return {
    ...state,
    registrationAId: cleanId,
    validationStatus: "idle",
    validatedMatchup: null,
    validationMessage: null,
  };
}

export function selectTeamBState(
  state: OfficialMatchSetupState,
  registrationBId: string
): OfficialMatchSetupState {
  const cleanId = registrationBId.trim();
  if (!cleanId) {
    return {
      ...state,
      registrationBId: "",
      validationStatus: "idle",
      validatedMatchup: null,
      validationMessage: null,
    };
  }

  const allowedForB = filterSelectableTeams(state.teams, state.registrationAId);
  const isAllowed = allowedForB.some(
    (t) => t.registrationId.toLowerCase() === cleanId.toLowerCase()
  );

  if (!isAllowed) {
    return {
      ...state,
      validationStatus: "error",
      validatedMatchup: null,
      validationMessage: "Team A and Team B must be two different eligible teams.",
    };
  }

  return {
    ...state,
    registrationBId: cleanId,
    validationStatus: "idle",
    validatedMatchup: null,
    validationMessage: null,
  };
}

export function canSubmitOfficialMatchSetup(
  state: OfficialMatchSetupState
): boolean {
  if (state.validationStatus === "validating") return false;
  if (
    state.tournamentsStatus !== "ready" ||
    state.divisionsStatus !== "ready" ||
    state.teamsStatus !== "ready"
  ) {
    return false;
  }
  if (
    !state.tournamentId ||
    !state.divisionId ||
    !state.registrationAId ||
    !state.registrationBId
  ) {
    return false;
  }
  if (
    state.registrationAId.toLowerCase() === state.registrationBId.toLowerCase()
  ) {
    return false;
  }

  const teamA = state.teams.find(
    (t) => t.registrationId.toLowerCase() === state.registrationAId.toLowerCase()
  );
  const teamB = state.teams.find(
    (t) => t.registrationId.toLowerCase() === state.registrationBId.toLowerCase()
  );
  if (!teamA || !teamB) return false;
  if (teamA.teamId.toLowerCase() === teamB.teamId.toLowerCase()) return false;

  return (
    (state.bestOf === 3 || state.bestOf === 5) &&
    (state.serving === "A" || state.serving === "B")
  );
}

export function getTeamInitials(teamName: string): string {
  const words = teamName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "MV";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
