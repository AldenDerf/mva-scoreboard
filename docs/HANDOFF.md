# Agent handoff — Phase 04 live scoring foundation

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

**Approvals needed:**
1. Owner review and approval of the Phase 04 SQL proposals (`01_live_scoring.mva_dev.review.sql`, `02_scoring_commands.mva_dev.review.sql`) for local `mva_dev`.
2. Fresh local backup before application.
3. Activation of `scoreboard_runtime` LOGIN credential on `mva_dev`.
4. Initial ADMIN role grant bootstrap.
5. Separate review and migrations for production Supabase and Vercel.

**Checks:**
- `pnpm lint`: passed (0 errors).
- `pnpm exec tsc --noEmit`: passed (0 errors).
- `pnpm test`: 28 passed / 1 skipped without DB; 29/29 passed when run against disposable PostgreSQL 18 runtime.
- `pnpm build`: passed (all routes compiled, partial prerender and dynamic routes verified).
- `git diff --check`: passed.

---

# Earlier handoff — Phase 03I practice corrections

**Refinement:** Correction controls no longer ask operators to type reasons. Point corrections save directly, serving switches immediately, and same-winner historical score edits save directly. Changing a confirmed-set winner, reopening the previous set, confirming a set, and starting a new practice match retain focused confirmations. In-memory correction events now include an automatic description, timestamp, affected set, and before/after values. The same progression validation and immediately-previous-set reopening restriction remain.

**Branch:** `feat/phase-03i-practice-corrections`, based on unmerged Phase 03H commit `9f9d893`. Practice only: no SQL, Auth, production data, or deployment changes.

**Scope:** Team-specific subtraction, direct point replacement, manual serve selection, completed-set correction, and a constrained current-set reconciliation are in `lib/scoring/practice.ts` and `components/practice-scorekeeper.tsx`. Confirmed results derive sets won. A current set can be moved backward only by explicitly reopening the immediately previous confirmed set while the new set is empty; other jumps are rejected and need a separate history reconciliation design. Historical corrections that make existing later sets impossible are rejected. Correction history is in memory only; refresh clears it. The production route remains guarded by the existing development layout.

**Next action:** Review Phase 03I practice behavior with a scorekeeper, especially confirmed-set winner changes and the constrained reopen flow. Continue server-authoritative transaction design separately after production target and authorization approvals. Do not treat in-memory events as a durable audit log.

**Checks:** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (26/26), `pnpm build`, and `git diff --check` pass. Production `/dev/practice` returned HTTP 404 on the local build. Test/build worker spawning required unsandboxed execution after `spawn EPERM` in the sandbox. Browser interaction and OBS checks were not performed because no browser surface or OBS session was available.

**Refinement checks:** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (28/28), `pnpm build`, and `git diff --check` passed. The test runner needed unsandboxed execution after the sandbox blocked worker spawning. No browser or OBS interaction was performed for this refinement.

---

**Branch:** `feat/phase-03h-practice-scoring`. **Base:** updated `main` at `f4a8436`. **Database state:** local `mva_dev` unchanged from Phase 03E; no production SQL, role, ADMIN grant, or Auth change. Two separate PostgreSQL 18 rehearsal clusters were stopped and removed after testing.

Read [Phase 03H report](PHASE_03H_REHEARSAL_AND_PRACTICE.md) for SQL rehearsal evidence, scoring rules, UI scope, Vercel inspection, test results, and online beta blockers. The deterministic engine is in `lib/scoring/practice.ts`; the only interactive scoring page is `/dev/practice`, hidden by the development layout in production. React memory in one tab is its only state. `/dev/overlay` remains static and read-only. Protected application authorization still fails closed at `ACCESS_PENDING`.

**Changed files:** scoring domain and tests; practice page/component; shared overlay component; development navigation/dashboard; `docs/PLAN.md`, this handoff, and the Phase 03H report. Foundation and Phase 03G SQL files were not modified.

**Checks:** disposable role, RLS, bootstrap, audit rollback and revocation tests passed; `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (20/20), `pnpm build`, and `git diff --check` passed. Local HTTP: development practice/overlay 200, production practice 404. Initial sandbox Node worker attempts failed with `spawn EPERM`; elevated reruns passed. Browser click-through and actual OBS/Facebook Live were not tested because no browser surface was available.

**Next action:** owner-review the production Supabase target and backup/rollback plan, then prepare production-specific scoreboard schema and restricted runtime SQL for approval. After authorization, implement server-authoritative scoring and a synchronized public overlay, deploy a separate scoreboard preview, and test from the scorekeeper/OBS machine. The Thursday online beta remains blocked until those steps pass.
