# Agent handoff — Phase 03I practice corrections

**Branch:** `feat/phase-03i-practice-corrections`, based on unmerged Phase 03H commit `9f9d893`. Practice only: no SQL, Auth, production data, or deployment changes.

**Scope:** Team-specific subtraction, direct point replacement, manual serve selection, completed-set correction, and a constrained current-set reconciliation are in `lib/scoring/practice.ts` and `components/practice-scorekeeper.tsx`. Confirmed results derive sets won. A current set can be moved backward only by explicitly reopening the immediately previous confirmed set while the new set is empty; other jumps are rejected and need a separate history reconciliation design. Historical corrections that make existing later sets impossible are rejected. Corrections have in-memory before/after event records and reasons; refresh clears them. The production route remains guarded by the existing development layout.

**Next action:** Review Phase 03I practice behavior with a scorekeeper, especially confirmed-set winner changes and the constrained reopen flow. Continue server-authoritative transaction design separately after production target and authorization approvals. Do not treat in-memory events as a durable audit log.

**Checks:** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (26/26), `pnpm build`, and `git diff --check` pass. Production `/dev/practice` returned HTTP 404 on the local build. Test/build worker spawning required unsandboxed execution after `spawn EPERM` in the sandbox. Browser interaction and OBS checks were not performed because no browser surface or OBS session was available.

---

**Branch:** `feat/phase-03h-practice-scoring`. **Base:** updated `main` at `f4a8436`. **Database state:** local `mva_dev` unchanged from Phase 03E; no production SQL, role, ADMIN grant, or Auth change. Two separate PostgreSQL 18 rehearsal clusters were stopped and removed after testing.

Read [Phase 03H report](PHASE_03H_REHEARSAL_AND_PRACTICE.md) for SQL rehearsal evidence, scoring rules, UI scope, Vercel inspection, test results, and online beta blockers. The deterministic engine is in `lib/scoring/practice.ts`; the only interactive scoring page is `/dev/practice`, hidden by the development layout in production. React memory in one tab is its only state. `/dev/overlay` remains static and read-only. Protected application authorization still fails closed at `ACCESS_PENDING`.

**Changed files:** scoring domain and tests; practice page/component; shared overlay component; development navigation/dashboard; `docs/PLAN.md`, this handoff, and the Phase 03H report. Foundation and Phase 03G SQL files were not modified.

**Checks:** disposable role, RLS, bootstrap, audit rollback and revocation tests passed; `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (20/20), `pnpm build`, and `git diff --check` passed. Local HTTP: development practice/overlay 200, production practice 404. Initial sandbox Node worker attempts failed with `spawn EPERM`; elevated reruns passed. Browser click-through and actual OBS/Facebook Live were not tested because no browser surface was available.

**Next action:** owner-review the production Supabase target and backup/rollback plan, then prepare production-specific scoreboard schema and restricted runtime SQL for approval. After authorization, implement server-authoritative scoring and a synchronized public overlay, deploy a separate scoreboard preview, and test from the scorekeeper/OBS machine. The Thursday online beta remains blocked until those steps pass.
