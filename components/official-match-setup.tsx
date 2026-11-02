"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import type {
  CatalogPage,
  DivisionSummary,
  EligibleTeam,
  TournamentSummary,
  ValidatedMatchup,
} from "@/lib/contracts/mva-catalog";
import {
  canSubmitOfficialMatchSetup,
  createInitialMatchSetupState,
  filterSelectableTeams,
  getTeamInitials,
  selectDivisionState,
  selectTeamAState,
  selectTeamBState,
  selectTournamentState,
  type OfficialMatchSetupState,
} from "@/lib/integrations/match-setup-state";

function TeamBadgePreview({
  label,
  team,
}: {
  label: string;
  team: EligibleTeam;
}) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const showLogo = Boolean(team.logoUrl && failedLogoUrl !== team.logoUrl);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.logoUrl!}
          alt={`${team.name} official logo`}
          className="h-11 w-11 shrink-0 rounded-lg border border-[var(--border)] bg-white object-contain p-1"
          onError={() => setFailedLogoUrl(team.logoUrl)}
        />
      ) : (
        <div
          aria-label={`${team.name} placeholder emblem`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#173e83] text-xs font-extrabold tracking-wider text-white"
        >
          {getTeamInitials(team.name)}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
          {label}
        </p>
        <p className="truncate text-sm font-bold text-[var(--ink)]">
          {team.name}
        </p>
      </div>
    </div>
  );
}

export function OfficialMatchSetup() {
  const [state, setState] = useState<OfficialMatchSetupState>(() =>
    createInitialMatchSetupState()
  );

  const loadTournaments = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      tournamentsStatus: "loading",
      tournamentsError: null,
    }));
    try {
      const response = await fetch("/api/catalog/tournaments", {
        cache: "no-store",
      });
      const body = (await response.json()) as Partial<
        CatalogPage<TournamentSummary>
      > & { error?: string };
      if (!response.ok || !Array.isArray(body.items)) {
        throw new Error(
          body.error ?? "Unable to load eligible MVA tournaments."
        );
      }
      setState((prev) => ({
        ...prev,
        tournaments: body.items!,
        tournamentsStatus: "ready",
        tournamentsError: null,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        tournaments: [],
        tournamentsStatus: "error",
        tournamentsError:
          error instanceof Error
            ? error.message
            : "Unable to load eligible MVA tournaments.",
      }));
    }
  }, []);

  const loadDivisions = useCallback(async (tournamentId: string) => {
    if (!tournamentId) return;
    setState((prev) => ({
      ...prev,
      divisionsStatus: "loading",
      divisionsError: null,
    }));
    try {
      const params = new URLSearchParams({ tournamentId });
      const response = await fetch(
        `/api/catalog/divisions?${params.toString()}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as Partial<
        CatalogPage<DivisionSummary>
      > & { error?: string };
      if (!response.ok || !Array.isArray(body.items)) {
        throw new Error(body.error ?? "Unable to load tournament divisions.");
      }
      setState((prev) =>
        prev.tournamentId === tournamentId
          ? {
              ...prev,
              divisions: body.items!,
              divisionsStatus: "ready",
              divisionsError: null,
            }
          : prev
      );
    } catch (error) {
      setState((prev) =>
        prev.tournamentId === tournamentId
          ? {
              ...prev,
              divisions: [],
              divisionsStatus: "error",
              divisionsError:
                error instanceof Error
                  ? error.message
                  : "Unable to load tournament divisions.",
            }
          : prev
      );
    }
  }, []);

  const loadTeams = useCallback(
    async (tournamentId: string, divisionId: string) => {
      if (!tournamentId || !divisionId) return;
      setState((prev) => ({
        ...prev,
        teamsStatus: "loading",
        teamsError: null,
      }));
      try {
        const params = new URLSearchParams({ tournamentId, divisionId });
        const response = await fetch(
          `/api/catalog/teams?${params.toString()}`,
          { cache: "no-store" }
        );
        const body = (await response.json()) as Partial<
          CatalogPage<EligibleTeam>
        > & { error?: string };
        if (!response.ok || !Array.isArray(body.items)) {
          throw new Error(
            body.error ?? "Unable to load verified division teams."
          );
        }
        setState((prev) =>
          prev.tournamentId === tournamentId && prev.divisionId === divisionId
            ? {
                ...prev,
                teams: body.items!,
                teamsStatus: "ready",
                teamsError: null,
              }
            : prev
        );
      } catch (error) {
        setState((prev) =>
          prev.tournamentId === tournamentId && prev.divisionId === divisionId
            ? {
                ...prev,
                teams: [],
                teamsStatus: "error",
                teamsError:
                  error instanceof Error
                    ? error.message
                    : "Unable to load verified division teams.",
              }
            : prev
        );
      }
    },
    []
  );

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  function onTournamentChange(nextTournamentId: string) {
    setState((prev) => selectTournamentState(prev, nextTournamentId));
    if (nextTournamentId.trim()) {
      void loadDivisions(nextTournamentId.trim());
    }
  }

  function onDivisionChange(nextDivisionId: string) {
    const currentTournamentId = state.tournamentId;
    setState((prev) => selectDivisionState(prev, nextDivisionId));
    if (currentTournamentId && nextDivisionId.trim()) {
      void loadTeams(currentTournamentId, nextDivisionId.trim());
    }
  }

  async function handleValidateMatchup(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmitOfficialMatchSetup(state)) return;

    setState((prev) => ({
      ...prev,
      validationStatus: "validating",
      validatedMatchup: null,
      validationMessage: "Verifying matchup eligibility with MVA…",
    }));

    try {
      const response = await fetch("/api/catalog/validate-matchup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: state.tournamentId,
          divisionId: state.divisionId,
          registrationAId: state.registrationAId,
          registrationBId: state.registrationBId,
          bestOf: state.bestOf,
          serving: state.serving,
        }),
      });
      const body = (await response.json()) as {
        matchup?: ValidatedMatchup;
        persistenceNotice?: string;
        error?: string;
      };
      if (!response.ok || !body.matchup) {
        throw new Error(
          body.error ?? "Matchup failed authoritative MVA validation."
        );
      }
      setState((prev) => ({
        ...prev,
        validationStatus: "validated",
        validatedMatchup: body.matchup!,
        validationMessage:
          body.persistenceNotice ??
          "Official matchup verified with MVA. Official match persistence is gated pending separate database approval.",
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        validationStatus: "error",
        validatedMatchup: null,
        validationMessage:
          error instanceof Error
            ? error.message
            : "Matchup failed authoritative MVA validation.",
      }));
    }
  }

  const teamAOptions = filterSelectableTeams(
    state.teams,
    state.registrationBId
  );
  const teamBOptions = filterSelectableTeams(
    state.teams,
    state.registrationAId
  );
  const selectedTeamA = state.teams.find(
    (t) => t.registrationId === state.registrationAId
  );
  const selectedTeamB = state.teams.find(
    (t) => t.registrationId === state.registrationBId
  );
  const canSubmit = canSubmitOfficialMatchSetup(state);

  return (
    <section
      aria-labelledby="official-match-setup-heading"
      className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Badge tone="blue">MVA Live Catalog</Badge>
          <h2 id="official-match-setup-heading" className="mt-2 text-xl font-bold">
            Official Match Setup
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Select an eligible MVA tournament, division, and two verified teams.
            Upstream changes automatically reset dependent selections.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={state.tournamentsStatus === "loading"}
          onClick={() => void loadTournaments()}
        >
          Reload catalog
        </Button>
      </div>

      {/* Tournament error / empty state banners */}
      {state.tournamentsStatus === "error" && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
        >
          <span>{state.tournamentsError}</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadTournaments()}
          >
            Retry tournaments
          </Button>
        </div>
      )}

      {state.tournamentsStatus === "ready" && state.tournaments.length === 0 && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-4 text-sm text-[var(--muted)]"
        >
          <span>
            No MVA tournaments are currently in an eligible scheduling status
            (REGISTRATION_CLOSED or ONGOING).
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadTournaments()}
          >
            Retry
          </Button>
        </div>
      )}

      <form onSubmit={handleValidateMatchup} className="mt-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 1. Select Tournament */}
          <SelectField
            id="official-tournament"
            label="1. Tournament"
            value={state.tournamentId}
            disabled={
              state.tournamentsStatus !== "ready" ||
              state.tournaments.length === 0
            }
            hint={
              state.tournamentsStatus === "loading"
                ? "Loading eligible MVA tournaments…"
                : "Only REGISTRATION_CLOSED and ONGOING tournaments are listed."
            }
            onChange={(event) => onTournamentChange(event.target.value)}
          >
            <option value="">
              {state.tournamentsStatus === "loading"
                ? "Loading tournaments…"
                : "Select an eligible tournament"}
            </option>
            {state.tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
                {tournament.year ? ` (${tournament.year})` : ""} ·{" "}
                {tournament.status}
              </option>
            ))}
          </SelectField>

          {/* 2. Select Division */}
          <SelectField
            id="official-division"
            label="2. Division"
            value={state.divisionId}
            disabled={
              !state.tournamentId ||
              state.divisionsStatus !== "ready" ||
              state.divisions.length === 0
            }
            hint={
              !state.tournamentId
                ? "Choose a tournament first."
                : state.divisionsStatus === "loading"
                  ? "Loading divisions…"
                  : undefined
            }
            onChange={(event) => onDivisionChange(event.target.value)}
          >
            <option value="">
              {!state.tournamentId
                ? "Select a tournament first"
                : state.divisionsStatus === "loading"
                  ? "Loading divisions…"
                  : "Select a division"}
            </option>
            {state.divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </SelectField>
        </div>

        {/* Division error / empty states */}
        {state.divisionsStatus === "error" && state.tournamentId && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
          >
            <span>{state.divisionsError}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadDivisions(state.tournamentId)}
            >
              Retry divisions
            </Button>
          </div>
        )}

        {state.divisionsStatus === "ready" &&
          state.tournamentId &&
          state.divisions.length === 0 && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-4 text-sm text-[var(--muted)]"
            >
              <span>No divisions exist for the selected tournament.</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadDivisions(state.tournamentId)}
              >
                Retry
              </Button>
            </div>
          )}

        {/* Teams error / empty states */}
        {state.teamsStatus === "error" && state.divisionId && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
          >
            <span>{state.teamsError}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void loadTeams(state.tournamentId, state.divisionId)
              }
            >
              Retry teams
            </Button>
          </div>
        )}

        {state.teamsStatus === "ready" &&
          state.divisionId &&
          state.teams.length < 2 && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-4 text-sm text-[var(--muted)]"
            >
              <span>
                At least two VERIFIED teams are required in this division to
                schedule an official match ({state.teams.length} currently
                verified).
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void loadTeams(state.tournamentId, state.divisionId)
                }
              >
                Retry teams
              </Button>
            </div>
          )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* 3. Select Team A */}
          <SelectField
            id="official-team-a"
            label="3. Team A"
            value={state.registrationAId}
            disabled={
              !state.divisionId ||
              state.teamsStatus !== "ready" ||
              state.teams.length < 2
            }
            hint={
              state.teamsStatus === "loading"
                ? "Loading verified teams…"
                : "Only VERIFIED division registrations appear."
            }
            onChange={(event) =>
              setState((prev) => selectTeamAState(prev, event.target.value))
            }
          >
            <option value="">
              {!state.divisionId
                ? "Select a division first"
                : state.teamsStatus === "loading"
                  ? "Loading teams…"
                  : "Select Team A"}
            </option>
            {teamAOptions.map((team) => (
              <option key={team.registrationId} value={team.registrationId}>
                {team.name}
              </option>
            ))}
          </SelectField>

          {/* 4. Select Team B */}
          <SelectField
            id="official-team-b"
            label="4. Team B"
            value={state.registrationBId}
            disabled={
              !state.divisionId ||
              state.teamsStatus !== "ready" ||
              state.teams.length < 2
            }
            hint={
              state.registrationAId
                ? "Team A is excluded to prevent identical-team matchups."
                : undefined
            }
            onChange={(event) =>
              setState((prev) => selectTeamBState(prev, event.target.value))
            }
          >
            <option value="">
              {!state.divisionId
                ? "Select a division first"
                : state.teamsStatus === "loading"
                  ? "Loading teams…"
                  : "Select Team B"}
            </option>
            {teamBOptions.map((team) => (
              <option key={team.registrationId} value={team.registrationId}>
                {team.name}
              </option>
            ))}
          </SelectField>

          {/* 5. Select Match Format */}
          <SelectField
            id="official-best-of"
            label="5. Match format"
            value={state.bestOf}
            hint="Regular sets to 25, deciding set to 15, win by two."
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                bestOf: Number(event.target.value) as 3 | 5,
                validationStatus: "idle",
                validatedMatchup: null,
                validationMessage: null,
              }))
            }
          >
            <option value={3}>Best of 3 sets</option>
            <option value={5}>Best of 5 sets</option>
          </SelectField>

          {/* 6. Select First Serving Team */}
          <SelectField
            id="official-serving"
            label="6. First serving team"
            value={state.serving}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                serving: event.target.value as "A" | "B",
                validationStatus: "idle",
                validatedMatchup: null,
                validationMessage: null,
              }))
            }
          >
            <option value="A">
              {selectedTeamA ? `${selectedTeamA.name} (Team A)` : "Team A"}
            </option>
            <option value="B">
              {selectedTeamB ? `${selectedTeamB.name} (Team B)` : "Team B"}
            </option>
          </SelectField>
        </div>

        {/* Selected teams visual preview with official logos / fallbacks */}
        {(selectedTeamA || selectedTeamB) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {selectedTeamA && (
              <TeamBadgePreview label="Team A" team={selectedTeamA} />
            )}
            {selectedTeamB && (
              <TeamBadgePreview label="Team B" team={selectedTeamB} />
            )}
          </div>
        )}

        {/* Validation status / result */}
        {state.validationMessage && (
          <div
            role={state.validationStatus === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`rounded-xl border p-4 text-sm ${
              state.validationStatus === "error"
                ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                : state.validationStatus === "validated"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
                  : "border-[var(--border)] bg-[var(--subtle)] text-[var(--ink)]"
            }`}
          >
            <p className="font-semibold">{state.validationMessage}</p>
            {state.validatedMatchup && (
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className=" uppercase text-[var(--muted)]">Tournament</dt>
                  <dd className="font-bold">
                    {state.validatedMatchup.tournament.name}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase text-[var(--muted)]">Division</dt>
                  <dd className="font-bold">
                    {state.validatedMatchup.division.name}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase text-[var(--muted)]">Matchup</dt>
                  <dd className="font-bold">
                    {state.validatedMatchup.teamA.name} vs{" "}
                    {state.validatedMatchup.teamB.name}
                  </dd>
                </div>
                <div>
                  <dt className="uppercase text-[var(--muted)]">
                    Format &amp; First Serve
                  </dt>
                  <dd className="font-bold">
                    Best of {state.bestOf} ·{" "}
                    {state.serving === "A"
                      ? state.validatedMatchup.teamA.name
                      : state.validatedMatchup.teamB.name}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit}>
            {state.validationStatus === "validating"
              ? "Validating matchup…"
              : "Validate official matchup"}
          </Button>
          <span className="text-xs text-[var(--muted)]">
            Official match creation persistence is gated pending separate Phase
            03 database review.
          </span>
        </div>
      </form>
    </section>
  );
}
