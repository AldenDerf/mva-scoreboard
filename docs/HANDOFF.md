# Agent handoff — Phase 03H practice scoring

**Branch:** `feat/phase-03h-practice-scoring`. **Base:** updated `main` at `f4a8436`. **Database state:** local `mva_dev` unchanged from Phase 03E; no production SQL, role, ADMIN grant, or Auth change. Two separate PostgreSQL 18 rehearsal clusters were stopped and removed after testing.

Read [Phase 03H report](PHASE_03H_REHEARSAL_AND_PRACTICE.md) for SQL rehearsal evidence, scoring rules, UI scope, Vercel inspection, test results, and online beta blockers. The deterministic engine is in `lib/scoring/practice.ts`; the only interactive scoring page is `/dev/practice`, hidden by the development layout in production. React memory in one tab is its only state. `/dev/overlay` remains static and read-only. Protected application authorization still fails closed at `ACCESS_PENDING`.

**Changed files:** scoring domain and tests; practice page/component; shared overlay component; development navigation/dashboard; `docs/PLAN.md`, this handoff, and the Phase 03H report. Foundation and Phase 03G SQL files were not modified.

**Checks:** disposable role, RLS, bootstrap, audit rollback and revocation tests passed; `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (20/20), `pnpm build`, and `git diff --check` passed. Local HTTP: development practice/overlay 200, production practice 404. Initial sandbox Node worker attempts failed with `spawn EPERM`; elevated reruns passed. Browser click-through and actual OBS/Facebook Live were not tested because no browser surface was available.

**Next action:** owner-review the production Supabase target and backup/rollback plan, then prepare production-specific scoreboard schema and restricted runtime SQL for approval. After authorization, implement server-authoritative scoring and a synchronized public overlay, deploy a separate scoreboard preview, and test from the scorekeeper/OBS machine. The Thursday online beta remains blocked until those steps pass.
