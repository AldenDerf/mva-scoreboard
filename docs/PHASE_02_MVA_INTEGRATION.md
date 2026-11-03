# Phase 02 — Secure Live MVA Integration, ADMIN Inheritance & Official Match Creation

**Status:** Implemented and verified in `mva` (`feat/phase-02-scoreboard-catalog-api`) and `mva-scoreboard` (`feat/phase-02-mva-integration`). All SQL proposals have been rehearsed end-to-end in an isolated disposable PostgreSQL 18 cluster. Local `mva_dev` and production remain untouched pending explicit migration execution approval.

---

## 1. Architectural Boundary

```
Browser (Admin Match Setup UI / Scorekeeper)
  → Scoreboard Server API (/api/catalog/*, /api/matches, requires Supabase Auth + scoreboard role)
    → Scoreboard Catalog Client (lib/integrations/mva-catalog-client.ts, server-only)
      → MVA Integration API (/api/integrations/scoreboard/*, Bearer machine token)
        → MVA Database (read-only Prisma queries with minimal select clauses)
```

### Security Invariants
- **No browser-to-MVA database or integration access:** `MVA_SCOREBOARD_INTEGRATION_TOKEN` and `MVA_CATALOG_BASE_URL` are strictly server-only environment variables (`no NEXT_PUBLIC_` prefix).
- **No shared unrestricted service-role key:** Authentication between `mva-scoreboard` and `mva` uses a dedicated machine-to-machine secret verified via SHA-256 digest + `crypto.timingSafeEqual`.
- **Verified MVA ADMIN Inheritance with SQL Consistency:**
  - When an authenticated user accesses `mva-scoreboard`, `evaluateScoreboardAuthorization` extracts the server-verified Supabase Auth UUID (`supabase.auth.getUser()`) — never trusting any caller-supplied boolean or UUID.
  - `mva-scoreboard` queries MVA's `POST /api/integrations/scoreboard/verify-admin` with `{ authUserId }` using the machine Bearer token.
  - MVA checks `profiles.auth_user_id` joined to `admin_access` (`is_active === true && role === 'ADMIN'`).
  - `mva-scoreboard` reconciles the result into `scoreboard.role_grants` via `scoreboard.reconcile_mva_admin_role(p_user_id, p_is_active_mva_admin)`:
    - `scoreboard.role_grants` tracks `grant_source text NOT NULL DEFAULT 'SCOREBOARD' CHECK (grant_source IN ('SCOREBOARD', 'MVA_ADMIN'))`.
    - Active MVA ADMINs receive or retain an active `ADMIN` grant (`grant_source = 'MVA_ADMIN'`), so SQL-side guards (`scoreboard.active_role_for_user` and `scoreboard.phase04_role`) authorize them consistently without bypassing database enforcement.
    - If MVA ADMIN access is inactive or revoked, only active `MVA_ADMIN`-sourced grants are revoked; independently granted `SCOREBOARD` roles (`ADMIN` or `SCOREKEEPER`) and `scoreboard.match_Red` (`scoreboard.match_assignments`) are preserved untouched.
    - If MVA verification or the database is unreachable, authorization fails closed (`UNAVAILABLE` / HTTP `503`).
- **Read-only MVA access:** The MVA integration store (`lib/integrations/scoreboard-catalog-prisma.ts`) executes only `findMany`, `findUnique`, and `findFirst` with narrow `select` clauses. No registrant personal data, contact numbers, emails, notes, player rosters, payment records, or admin audit logs are selected or returned.
- **No unbounded caching:** All catalog and admin-verification requests use `cache: "no-store"` and return `Cache-Control: private, no-store, max-age=0`.
- **Logo URL allowlisting:** Both the MVA catalog service and the scoreboard catalog client validate `logoUrl` values against `https:`, absence of credentials, length `<= 2048`, and an approved host allowlist (`MVA_LOGO_ALLOWED_HOSTS` + the configured Supabase project hostname). Unapproved or malformed URLs are normalized to `null` and rendered with an accessible initials emblem fallback in match setup, overlay preview, and `/overlay/[publicId]`.

---

## 2. MVA Integration API Contract (`AldenDerf/mva`)

All endpoints require:
- Header: `Authorization: Bearer <MVA_SCOREBOARD_INTEGRATION_TOKEN>`
- Fail-closed `503` if `MVA_SCOREBOARD_INTEGRATION_TOKEN` is unconfigured (`< 16` characters) on the MVA server.
- Fail-closed `401` if the header is missing or invalid.
- Explicit `405 Method Not Allowed` with `Allow` header for unsupported HTTP methods.

### Endpoints

| Operation | Method & Path | Query / Body Parameters | Success Response (`200 OK`) | Error Statuses |
| --- | --- | --- | --- | --- |
| **A. List Tournaments** | `GET /api/integrations/scoreboard/tournaments` | `limit` (1–100, default 50), `cursor` (optional UUID) | `CatalogPage<TournamentSummary>`: `{ items: [{ id, name, year, status }], nextCursor }` | `400`, `401`, `405`, `503` |
| **B. List Divisions** | `GET /api/integrations/scoreboard/divisions` | `tournamentId` (required UUID), `limit`, `cursor` | `CatalogPage<DivisionSummary>`: `{ items: [{ id, tournamentId, name }], nextCursor }` | `400`, `401`, `404`, `405`, `409`, `503` |
| **C. List Eligible Teams** | `GET /api/integrations/scoreboard/teams` | `tournamentId` (UUID), `divisionId` (UUID), `limit`, `cursor` | `CatalogPage<EligibleTeam>`: `{ items: [{ registrationId, teamId, name, logoUrl }], nextCursor }` | `400`, `401`, `404`, `405`, `409`, `503` |
| **D. Validate Matchup** | `POST /api/integrations/scoreboard/validate-matchup` | JSON: `{ tournamentId, divisionId, registrationAId, registrationBId }` | `ValidatedMatchup`: `{ tournament, division, teamA, teamB, validatedAt }` | `400`, `401`, `404`, `405`, `409`, `413`, `503` |
| **E. Verify MVA Admin** | `POST /api/integrations/scoreboard/verify-admin` | JSON: `{ authUserId }` (strict single-key UUID object) | `VerifyAdminStatusResponse`: `{ authUserId, isActiveAdmin, verifiedAt }` | `400`, `401`, `405`, `413`, `503` |

---

## 3. Official Match Creation Flow

1. **UI (`components/official-match-setup.tsx` & `components/match-list.tsx`):**
   - Admin selects Tournament → Division → Team A → Team B → Match format (`bestOf: 3 | 5`) → First serve (`A | B`).
   - Clicking **Create official match** submits `POST /api/matches` with `{ mode: "official", tournamentId, divisionId, registrationAId, registrationBId, bestOf, serving }`.
2. **Server API (`lib/server/scoreboard-api.ts:handleCreateMatchRequest`):**
   - Verifies `sameOrigin(request)` and `auth.role === "ADMIN"`.
   - Calls `validateMatchupWithMva({ tournamentId, divisionId, registrationAId, registrationBId })` immediately before the database write — ignoring any client-supplied team names, tournament names, or logo URLs.
   - Calls `createOfficialMatch(auth.userId, ...)` which invokes `scoreboard.phase02_create_official_match(...)`.
3. **Database Function (`db/proposals/02/01_official_match_creation.mva_dev.review.sql`):**
   - Enforces `scoreboard.phase04_role(p_actor, NULL) = 'ADMIN'`.
   - Enforces distinct MVA team and registration UUIDs and inserts into `scoreboard.matches` with `is_test = false`, snapshotting `tournament_name`, `division_name`, `team_a_name`, `team_b_name`, `team_a_logo_url`, and `team_b_logo_url`.
   - Creates Set 1 (`scoreboard.match_sets`) and appends an `OFFICIAL_MATCH_CREATED` event to `scoreboard.admin_audit_events`.
4. **Live Scoring & OBS Overlay:**
   - Reuses the existing server-authoritative scoring engine (`scoreboard.phase04_apply`), idempotency keys, revision locking, and `/overlay/[publicId]`.
   - Official matches display `Official` badge in the match list (`isTest: false`), while practice matches remain labeled `Test` (`isTest: true`).

---

## 4. Local `mva_dev` Migration Order, Verification, Rollback & Runtime Bootstrap

> **IMPORTANT:** Do not execute these commands against `mva_dev` until explicitly approved by the project owner.

### Step 1: Read-Only Preflight Verification
Verify that `mva_dev` matches expected cluster `7629597861964584196` and has the clean Phase 01 foundation:
```powershell
psql -h ::1 -p 5432 -U postgres -d mva_dev -v ON_ERROR_STOP=1 -f db/verification/0004_phase04_preflight_read_only.sql
```

### Step 2: Take a Pre-Change Backup of `scoreboard` Schema
```powershell
pg_dump -h ::1 -p 5432 -U postgres -d mva_dev -n scoreboard -F c -f mva_dev_scoreboard_pre_mvp.dump
```

### Step 3: Exact Migration Execution Order
Apply the four reviewed SQL proposals in strict dependency order:
```powershell
# 1. Phase 03g: Runtime role lookup & MVA ADMIN reconciliation (scoreboard_auth_lookup_owner + scoreboard_runtime)
psql -h ::1 -p 5432 -U postgres -d mva_dev -v ON_ERROR_STOP=1 -f db/proposals/03g/01_runtime_lookup.review.sql

# 2. Phase 04a: Live scoring schema extensions, RLS policies, and scoreboard_phase04_owner role
psql -h ::1 -p 5432 -U postgres -d mva_dev -v ON_ERROR_STOP=1 -f db/proposals/04/01_live_scoring.mva_dev.review.sql

# 3. Phase 04b: Transactional scoring commands, match creation, and overlay snapshot RPCs
psql -h ::1 -p 5432 -U postgres -d mva_dev -v ON_ERROR_STOP=1 -f db/proposals/04/02_scoring_commands.mva_dev.review.sql

# 4. Phase 02: Official match creation RPC (scoreboard.phase02_create_official_match)
psql -h ::1 -p 5432 -U postgres -d mva_dev -v ON_ERROR_STOP=1 -f db/proposals/02/01_official_match_creation.mva_dev.review.sql
```

### Step 4: Post-Migration Transactional Verification
Run the comprehensive self-rolling-back SQL integration test suite against `mva_dev`:
```powershell
psql -h ::1 -p 5432 -U postgres -d mva_dev -v ON_ERROR_STOP=1 -f tests/phase04-sql-integration.sql
```

### Step 5: Provision Restricted Runtime Login (`scoreboard_runtime`)
 Enable login on `scoreboard_runtime` with a local-only password for `SCOREBOARD_DATABASE_URL`:
```powershell
psql -h ::1 -p 5432 -U postgres -d mva_dev -v ON_ERROR_STOP=1 -c "ALTER ROLE scoreboard_runtime WITH LOGIN PASSWORD 'replace-with-local-runtime-password';"
```

### Step 6: Configure Local `.env.local` Files
1. **In `c:\nextjs-projects\ts\mva\.env.local`:**
   ```env
   MVA_SCOREBOARD_INTEGRATION_TOKEN=replace-with-at-least-32-char-random-machine-token
   MVA_LOGO_ALLOWED_HOSTS=your-project-ref.supabase.co
   ```
2. **In `c:\nextjs-projects\ts\mva-scoreboard\.env.local`:**
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_AUTH_COOKIE_NAME=sb-mva-scoreboard-auth-token
   SCOREBOARD_DATABASE_URL=postgresql://scoreboard_runtime:replace-with-local-runtime-password@localhost:5432/mva_dev
   MVA_CATALOG_BASE_URL=http://localhost:3000
   MVA_SCOREBOARD_INTEGRATION_TOKEN=replace-with-at-least-32-char-random-machine-token
   MVA_LOGO_ALLOWED_HOSTS=your-project-ref.supabase.co
   ```

### Step 7: Rollback Procedure (If Needed)
To revert `mva_dev` back to the Phase 01 baseline:
```sql
BEGIN;

DROP FUNCTION IF EXISTS scoreboard.phase02_create_official_match(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, integer, text);
DROP FUNCTION IF EXISTS scoreboard.phase04_overlay_snapshot(text);
DROP FUNCTION IF EXISTS scoreboard.phase04_apply(uuid, uuid, uuid, bigint, jsonb);
DROP FUNCTION IF EXISTS scoreboard.phase04_match_bundle(uuid, uuid);
DROP FUNCTION IF EXISTS scoreboard.phase04_create_test_match(uuid, text, text, integer, text);
DROP FUNCTION IF EXISTS scoreboard.phase04_list_matches(uuid);
DROP FUNCTION IF EXISTS scoreboard.phase04_derive_wins(uuid, integer, integer);
DROP FUNCTION IF EXISTS scoreboard.phase04_set_winner(integer, integer, integer, integer);
DROP FUNCTION IF EXISTS scoreboard.phase04_role(uuid, uuid);
DROP FUNCTION IF EXISTS scoreboard.reconcile_mva_admin_role(uuid, boolean);
DROP FUNCTION IF EXISTS scoreboard.active_role_for_user(uuid);

DROP POLICY IF EXISTS phase04_matches_all ON scoreboard.matches;
DROP POLICY IF EXISTS phase04_match_sets_all ON scoreboard.match_sets;
DROP POLICY IF EXISTS phase04_score_events_select ON scoreboard.score_events;
DROP POLICY IF EXISTS phase04_score_events_insert ON scoreboard.score_events;
DROP POLICY IF EXISTS phase04_role_grants_select ON scoreboard.role_grants;
DROP POLICY IF EXISTS phase04_match_assignments_select ON scoreboard.match_assignments;
DROP POLICY IF EXISTS phase04_admin_audit_insert ON scoreboard.admin_audit_events;
DROP POLICY IF EXISTS auth_lookup_select_active_role_grants ON scoreboard.role_grants;
DROP POLICY IF EXISTS auth_lookup_insert_mva_admin_role_grants ON scoreboard.role_grants;
DROP POLICY IF EXISTS auth_lookup_update_mva_admin_role_grants ON scoreboard.role_grants;
DROP POLICY IF EXISTS auth_lookup_insert_mva_admin_audit ON scoreboard.admin_audit_events;

REVOKE ALL ON ALL TABLES IN SCHEMA scoreboard FROM scoreboard_phase04_owner, scoreboard_auth_lookup_owner, scoreboard_runtime;
REVOKE USAGE ON SCHEMA scoreboard FROM scoreboard_phase04_owner, scoreboard_auth_lookup_owner, scoreboard_runtime;

ALTER TABLE scoreboard.matches
  DROP CONSTRAINT IF EXISTS matches_pending_set_winner_team_check,
  DROP COLUMN IF EXISTS pending_set_winner_team,
  DROP COLUMN IF EXISTS initial_serving_team;

ALTER TABLE scoreboard.role_grants
  DROP COLUMN IF EXISTS grant_source;

DROP ROLE IF EXISTS scoreboard_phase04_owner;
DROP ROLE IF EXISTS scoreboard_auth_lookup_owner;
ALTER ROLE scoreboard_runtime WITH NOLOGIN PASSWORD NULL;

COMMIT;
```
Alternatively, restore the pre-change schema dump (`pg_restore -h ::1 -p 5432 -U postgres -d mva_dev --clean mva_dev_scoreboard_pre_mvp.dump`).
