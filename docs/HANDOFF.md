# Agent handoff — Phase 02 secure live MVA integration

**Branches:**
- `mva-scoreboard`: `feat/phase-02-mva-integration` (based on `main` at `673e27f`).
- `mva`: `feat/phase-02-scoreboard-catalog-api` (based on `main` at `7be8559`).

**Scope & Implementation:**
1. **MVA Catalog Integration API (`AldenDerf/mva`):**
   - Implemented `lib/integrations/scoreboard-catalog.ts` and `lib/integrations/scoreboard-catalog-prisma.ts` with read-only Prisma queries selecting only minimal tournament, division, registration, and team identity fields.
   - Implemented four machine-authenticated Route Handlers:
     - `GET /api/integrations/scoreboard/tournaments`
     - `GET /api/integrations/scoreboard/divisions?tournamentId={uuid}`
     - `GET /api/integrations/scoreboard/teams?tournamentId={uuid}&divisionId={uuid}`
     - `POST /api/integrations/scoreboard/validate-matchup`
   - Enforced SHA-256 + `crypto.timingSafeEqual` Bearer token verification (`MVA_SCOREBOARD_INTEGRATION_TOKEN`), strict `405 Method Not Allowed` responses, tournament eligibility policy (`REGISTRATION_CLOSED`, `ONGOING`), `VERIFIED` registration filtering, cross-tournament/division rejection, and HTTPS logo host allowlist validation.
   - Updated `mva/proxy.ts` to bypass cookie session refresh on `/api/integrations/scoreboard/*`.
2. **Scoreboard Catalog Client & Server API (`AldenDerf/mva-scoreboard`):**
   - Implemented server-only `lib/integrations/mva-catalog-client.ts` with input UUID validation, request timeouts, `cache: "no-store"`, bounded pagination (`1..100`), runtime schema/contract validation, private-field leak rejection, and logo URL host allowlisting.
   - Implemented scoreboard ADMIN-protected server routes (`/api/catalog/tournaments`, `/api/catalog/divisions`, `/api/catalog/teams`, `/api/catalog/validate-matchup`) in `lib/server/catalog-api.ts` and `app/api/catalog/*`.
3. **Match Setup UI & Official Match Persistence Design:**
   - Implemented `lib/integrations/match-setup-state.ts` and `components/official-match-setup.tsx`, integrated into `components/match-list.tsx` alongside the preserved test-match creation form.
   - Prepared review-only Phase 03 persistence SQL proposal `db/proposals/02/01_official_match_creation.mva_dev.review.sql` and full engineering report in [docs/PHASE_02_MVA_INTEGRATION.md](PHASE_02_MVA_INTEGRATION.md).
   - Zero database migrations were applied; `mva_dev`, Supabase, and Vercel remain 100% untouched.

**Checks:**
- `mva`: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (8/8 passing), `pnpm build`, and `git diff --check` passed.
- `mva-scoreboard`: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (34 passed / 1 DB-gated skipped), `pnpm build`, and `git diff --check` passed.

**Next action:**
1. Owner review and approval of `db/proposals/03g/01_runtime_lookup.review.sql`, `db/proposals/04/01_live_scoring.mva_dev.review.sql`, `db/proposals/04/02_scoring_commands.mva_dev.review.sql`, and `db/proposals/02/01_official_match_creation.mva_dev.review.sql`.
2. Provision `MVA_SCOREBOARD_INTEGRATION_TOKEN` and `MVA_CATALOG_BASE_URL` in `.env.local` on both local servers (`localhost:3000` for `mva` and `localhost:3001` for `mva-scoreboard`).
3. After database approval and backup, wire `POST /api/matches` official match creation to `validateMatchupWithMva` + `scoreboard.phase02_create_official_match` and perform manual browser and OBS Browser Source verification.

---

# Earlier handoff — Phase 04 live scoring foundation

**Branch:** `feat/phase-04-live-scoring-foundation`, based on `main` at PR #7 merge `0a7117f`.

**Takeover & Implementation:** Antigravity took over Phase 04 from Codex. Preserved all initial implementation and completed refinements:
- Restricted `pg` service in `lib/db/scoreboard.ts` with explicit connection pool lifecycle cleanup (`closeScoreboardPool`).
- Enhanced reverse proxy / Vercel `x-forwarded-proto` validation in `lib/server/scoreboard-api.ts:sameOrigin`.
- Enhanced `LiveScorekeeper` with explicit navigation back to matches (`/matches`), completed match state banner, and SSR-safe overlay URL resolution.
- Enhanced `MatchList` with dashboard navigation (`/dashboard`), clear team labels on first-serve options, and an empty state card.
- Fail-closed role lookup via `scoreboard.active_role_for_user(uuid)` with `ACCESS_PENDING` / `UNAVAILABLE` handling.
- Review-only Phase 04 SQL proposals with transactional scoring, row-level locking, expected revision checks, stable UUID action idempotency, and automatic append-only audit events without operator typed reasons.
- Public, transparent, broadcast-safe OBS overlay route (`/overlay/[publicId]`) with automatic 2.5s polling and session-proxy bypass.
See [Phase 04 report](PHASE_04_IMPLEMENTATION.md).

**Database state:**
- Read-only `mva_dev` inspection on `::1:5432` confirmed cluster `7629597861964584196`, PostgreSQL 18.3, seven scoreboard tables with FORCE RLS, zero policies, and only `reject_history_change()`. Local `mva_dev` remains 100% untouched and unchanged.
- Isolated test rehearsal executed in disposable PostgreSQL 18 clusters (`initdb` on ephemeral loopback port, e.g. 55442): applied foundation, runtime lookup, schema, and command proposals; executed `tests/phase04-sql-integration.sql` in a rollback transaction; and executed full Node.js test suite with `PHASE04_TEST_DATABASE_URL`.
- 29/29 tests passed (including `tests/live-scoring-db.test.ts`). Cluster was cleanly stopped and all temporary files removed.
- Production Supabase and Vercel remain untouched.
