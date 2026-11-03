# Agent handoff — MVP Blockers Completed (MVA ADMIN Inheritance & Official Match Integration)

**Branches:**
- `mva-scoreboard`: `feat/phase-02-mva-integration`
- `mva`: `feat/phase-02-scoreboard-catalog-api`

**Completed Scope:**
1. **MVA ADMIN Inheritance (`AldenDerf/mva` + `AldenDerf/mva-scoreboard`):**
   - Added `POST /api/integrations/scoreboard/verify-admin` in `mva` (`app/api/integrations/scoreboard/verify-admin/route.ts`, `lib/integrations/scoreboard-catalog.ts`, `lib/integrations/scoreboard-catalog-prisma.ts`) guarded by SHA-256 + `crypto.timingSafeEqual` machine Bearer token auth and strict single-key `{ authUserId }` validation.
   - Added `verifyMvaAdminStatus` in `mva-scoreboard/lib/integrations/mva-catalog-client.ts`, `reconcileMvaAdminRole` in `lib/db/scoreboard.ts`, and `evaluateScoreboardAuthorization` in `lib/auth/evaluate-authorization.ts`.
   - Extended `db/proposals/03g/01_runtime_lookup.review.sql` with `grant_source` (`'SCOREBOARD' | 'MVA_ADMIN'`) on `scoreboard.role_grants` and `scoreboard.reconcile_mva_admin_role(uuid, boolean)` so active MVA ADMINs are reconciled into `scoreboard.role_grants` and authorized consistently by SQL-side `scoreboard.active_role_for_user` and `scoreboard.phase04_role` while preserving independent Scoreboard grants and scorekeeper match assignments across revocations.
   - Enforced fail-closed `UNAVAILABLE` (`503`) behavior on MVA verification or database outages.
2. **Official Match Creation & Overlay Logo Integration (`AldenDerf/mva-scoreboard`):**
   - Connected `components/official-match-setup.tsx` and `components/match-list.tsx` to `POST /api/matches` (`mode: "official"`).
   - Updated `lib/server/scoreboard-api.ts:handleCreateMatchRequest` to revalidate matchup eligibility with MVA (`validateMatchupWithMva`) immediately before calling `createOfficialMatch` (`scoreboard.phase02_create_official_match`), ignoring any client-supplied display names or logo URLs.
   - Updated `components/live-overlay.tsx` and `components/overlay-preview.tsx` to render snapshotted `teamALogoUrl` / `teamBLogoUrl` with automatic fallback to initials emblems on missing or broken images.
   - Preserved `isTest` distinction (`Official` vs `Test` badge) and existing scoring engine / OBS overlay behavior.
3. **Database Rehearsal & Documentation:**
   - Fixed PostgreSQL 18 `bigint` `system_identifier` comparison (`7629597861964584196`) in `04/01`, `04/02`, and `02/01` SQL proposals and column-level `SELECT` privilege usage in `reconcile_mva_admin_role`.
   - Rehearsed full migration chain (`0001` → `03g/01` → `04/01` → `04/02` → `02/01`), `tests/phase04-sql-integration.sql`, and all Node tests in a disposable PostgreSQL 18 cluster (`127.0.0.1:55446`), then destroyed the disposable cluster.
   - Documented exact local migration order, preflight/post-verification commands, rollback SQL, and runtime bootstrap steps in [docs/PHASE_02_MVA_INTEGRATION.md](PHASE_02_MVA_INTEGRATION.md).
   - Local `mva_dev` and production remain 100% untouched.

**Checks:**
- `mva`: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (9/9 passing), `pnpm build`, and `git diff --check` passed.
- `mva-scoreboard`: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (37/37 passing in disposable DB rehearsal; 36 passed / 1 DB-gated skipped without env var), `pnpm build`, and `git diff --check` passed.

**Next action to activate local MVP:**
1. Owner approval to execute the 4 SQL proposals on local `mva_dev` in the exact order documented in [docs/PHASE_02_MVA_INTEGRATION.md](PHASE_02_MVA_INTEGRATION.md#4-local-mva_dev-migration-order-verification-rollback--runtime-bootstrap).
2. Provision `scoreboard_runtime` login password and set `SCOREBOARD_DATABASE_URL`, `MVA_CATALOG_BASE_URL`, and matching `MVA_SCOREBOARD_INTEGRATION_TOKEN` in `.env.local` for both apps.
3. Start `mva` (`pnpm dev` on `:3000`) and `mva-scoreboard` (`pnpm dev` on `:3001`) and run manual browser + OBS Browser Source verification.
