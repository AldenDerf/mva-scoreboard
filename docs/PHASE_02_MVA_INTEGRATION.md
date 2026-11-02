# Phase 02 — Secure Live MVA Integration

**Status:** Implemented and verified in `mva` (`feat/phase-02-scoreboard-catalog-api`) and `mva-scoreboard` (`feat/phase-02-mva-integration`). Official match persistence remains intentionally gated as a design/SQL proposal (`db/proposals/02/01_official_match_creation.mva_dev.review.sql`) pending separate database migration review and approval.

---

## 1. Architectural Boundary

```
Browser (Admin Match Setup UI)
  → Scoreboard Server API (/api/catalog/*, requires Supabase Auth + scoreboard ADMIN role)
    → Scoreboard Catalog Client (lib/integrations/mva-catalog-client.ts, server-only)
      → MVA Integration API (/api/integrations/scoreboard/*, Bearer machine token)
        → MVA Database (read-only Prisma queries with minimal select clauses)
```

### Security Invariants
- **No browser-to-MVA database or integration access:** `MVA_SCOREBOARD_INTEGRATION_TOKEN` and `MVA_CATALOG_BASE_URL` are strictly server-only environment variables (`no NEXT_PUBLIC_` prefix).
- **No shared unrestricted service-role key:** Authentication between `mva-scoreboard` and `mva` uses a dedicated machine-to-machine secret verified via SHA-256 digest + `crypto.timingSafeEqual`.
- **No implicit privilege inheritance:** Having an MVA `admin_access` record never grants scoreboard `ADMIN` privileges. Every `/api/catalog/*` route on `mva-scoreboard` independently enforces `requireCatalogAdmin()` against `scoreboard.active_role_for_user(uuid)`.
- **Read-only MVA access:** The MVA integration store (`lib/integrations/scoreboard-catalog-prisma.ts`) executes only `findMany`, `findUnique`, and `findFirst` with narrow `select` clauses. No registrant personal data, contact numbers, emails, notes, player rosters, payment records, or admin audit logs are selected or returned.
- **No unbounded eligibility caching:** All catalog requests use `cache: "no-store"` and return `Cache-Control: private, no-store, max-age=0`.
- **Logo URL allowlisting:** Both the MVA catalog service and the scoreboard catalog client validate `logoUrl` values against `https:`, absence of credentials, length `<= 2048`, and an approved host allowlist (`MVA_LOGO_ALLOWED_HOSTS` + the configured Supabase project hostname). Unapproved or malformed URLs are normalized to `null` and rendered with an accessible initials emblem fallback.

---

## 2. MVA Catalog API Contract (`AldenDerf/mva`)

All endpoints require:
- Header: `Authorization: Bearer <MVA_SCOREBOARD_INTEGRATION_TOKEN>`
- Fail-closed `503` if `MVA_SCOREBOARD_INTEGRATION_TOKEN` is unconfigured (`< 16` characters) on the MVA server.
- Fail-closed `401` if the header is missing or invalid.
- Explicit `405 Method Not Allowed` with `Allow` header for unsupported HTTP methods.

### Tournament & Registration Eligibility Policy
- **Tournament statuses (`SCOREBOARD_ELIGIBLE_LEAGUE_STATUSES`):** Only `REGISTRATION_CLOSED` and `ONGOING` tournaments are eligible for scoreboard selection and matchup validation. `DRAFT`, `OPEN_FOR_REGISTRATION`, `ADMIN_REGISTRATION_ONLY`, `COMPLETED`, and `ARCHIVED` are rejected (`409 Conflict` when queried directly).
- **Registration status (`SCOREBOARD_ELIGIBLE_REGISTRATION_STATUS`):** Only `VERIFIED` registrations belonging to the requested tournament and division are returned or accepted. `PENDING_PAYMENT`, `REJECTED`, and `CANCELLED` registrations are excluded (`409 Conflict` on matchup validation).

### Endpoints

| Operation | Method & Path | Query / Body Parameters | Success Response (`200 OK`) | Error Statuses |
| --- | --- | --- | --- | --- |
| **A. List Tournaments** | `GET /api/integrations/scoreboard/tournaments` | `limit` (1–100, default 50), `cursor` (optional UUID) | `CatalogPage<TournamentSummary>`: `{ items: [{ id, name, year, status }], nextCursor }` | `400`, `401`, `405`, `503` |
| **B. List Divisions** | `GET /api/integrations/scoreboard/divisions` | `tournamentId` (required UUID), `limit`, `cursor` | `CatalogPage<DivisionSummary>`: `{ items: [{ id, tournamentId, name }], nextCursor }` | `400`, `401`, `404`, `405`, `409`, `503` |
| **C. List Eligible Teams** | `GET /api/integrations/scoreboard/teams` | `tournamentId` (UUID), `divisionId` (UUID), `limit`, `cursor` | `CatalogPage<EligibleTeam>`: `{ items: [{ registrationId, teamId, name, logoUrl }], nextCursor }` | `400`, `401`, `404`, `405`, `409`, `503` |
| **D. Validate Matchup** | `POST /api/integrations/scoreboard/validate-matchup` | JSON: `{ tournamentId, divisionId, registrationAId, registrationBId }` | `ValidatedMatchup`: `{ tournament, division, teamA, teamB, validatedAt }` | `400`, `401`, `404`, `405`, `409`, `413`, `503` |

---

## 3. Environment Setup Instructions

### In `mva` (`.env.local` — never commit):
```env
# Shared machine-to-machine secret (minimum 32 random characters recommended)
MVA_SCOREBOARD_INTEGRATION_TOKEN=replace-with-at-least-32-char-random-machine-token

# Optional comma-separated HTTPS hostnames allowed for team logo URLs
# (The hostname of NEXT_PUBLIC_SUPABASE_URL is automatically included when HTTPS)
MVA_LOGO_ALLOWED_HOSTS=your-project.supabase.co
```

### In `mva-scoreboard` (`.env.local` — see `.env.example`):
```env
MVA_CATALOG_BASE_URL=http://localhost:3000
MVA_SCOREBOARD_INTEGRATION_TOKEN=replace-with-at-least-32-char-random-machine-token
MVA_LOGO_ALLOWED_HOSTS=your-project.supabase.co
```

---

## 4. Official Match Persistence — Design Only (Phase 03 Gate)

In accordance with Phase 02 scope restrictions, official match creation is **not** persisted to PostgreSQL yet. When the admin clicks **Validate official matchup** in `OfficialMatchSetup`, the scoreboard server calls MVA's `POST /api/integrations/scoreboard/validate-matchup` live and returns the authoritative `ValidatedMatchup` snapshot with `officialPersistenceEnabled: false`.

### Prepared Database & API Design for Phase 03
1. **Review-only SQL proposal:** [`db/proposals/02/01_official_match_creation.mva_dev.review.sql`](../db/proposals/02/01_official_match_creation.mva_dev.review.sql)
   - Defines `scoreboard.phase02_create_official_match(...)` owned by `scoreboard_phase04_owner` and executable by `scoreboard_runtime`.
   - Verifies `scoreboard.phase04_role(p_actor, NULL) = 'ADMIN'`.
   - Enforces non-null, distinct MVA catalog UUIDs (`mva_tournament_id`, `mva_division_id`, `mva_team_a_id <> mva_team_b_id`, `mva_registration_a_id <> mva_registration_b_id`), satisfying the `test_match_identity` table constraint with `is_test = false`.
   - Snapshots `tournament_name`, `division_name`, `team_a_name`, `team_b_name`, `team_a_logo_url`, `team_b_logo_url`, `best_of` (`3 | 5`), and `initial_serving_team` (`'A' | 'B'`).
   - Creates Set 1 (`scoreboard.match_sets`) and appends an `OFFICIAL_MATCH_CREATED` record to `scoreboard.admin_audit_events`.
2. **Server API flow (to enable after SQL approval):**
   - `POST /api/matches/official` (or extended `POST /api/matches` with a discriminated union) will:
     1. Verify `sameOrigin(request)` and `auth.role === "ADMIN"`.
     2. Call `validateMatchupWithMva({ tournamentId, divisionId, registrationAId, registrationBId })` immediately before the database write (never trusting client-submitted team names, logos, or prior validation timestamps).
     3. Pass the fresh `ValidatedMatchup` IDs and display snapshots into `scoreboard.phase02_create_official_match(...)`.
   - Existing server-authoritative scoring (`scoreboard.phase04_apply`), idempotency keys, expected-revision checks, append-only `score_events`, and `/overlay/[publicId]` work unchanged for official matches because `scoreboard.matches` already stores the snapshotted display names and logo URLs.
