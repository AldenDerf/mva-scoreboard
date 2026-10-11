# Agent handoff — Phase 01E isolated database rehearsal

**Branch:** `docs/phase-01a-architecture`. **Base HEAD:** `51c1abef24cc8cc972c9f3e24f7f141caab32a61`. **Latest HEAD:** the Phase 01E commit containing this file; run `git rev-parse HEAD` for the exact SHA. **Phase:** 01E rehearsal completed; no application implementation.

## Completed

- Read project instructions and reviewed the Phase 01D SQL/runbook. Changed the migration guard from `mva_dev` to `mva_scoreboard_rehearsal` so the artifact cannot run against the original database.
- Initialized a separate temporary PostgreSQL 18 cluster listening only on loopback port 55432. Its system identifier differed from the MVA server on port 5432, and it contained no MVA data. Created a fresh `mva_scoreboard_rehearsal` database there.
- Applied the migration, tested catalog structure, RLS/grants, a synthetic overlay projection, non-superuser denials, and append-only audit. Rolled back the rehearsal schema/roles, verified cleanup, and reapplied successfully. Ran the updated read-only verification SQL.
- Stopped the temporary server, verified port 55432 closed, and removed its data directory. A final read-only query confirmed original `mva_dev` still has MVA tables and no `scoreboard` schema on its unchanged system identifier.

**Files changed:** `db/migrations/0001_scoreboard_foundation.sql`, `db/verification/0001_read_only.sql`, `docs/DB_RUNBOOK.md`, `docs/PLAN.md`, `docs/HANDOFF.md`.

**Validation:** `pnpm lint`, `pnpm exec tsc --noEmit`, and `git diff --check` passed. `pnpm build` failed while the unchanged starter layout tried to download Geist and Geist Mono from Google Fonts. Database details are in [runbook](DB_RUNBOOK.md#phase-01e-isolated-rehearsal-results). No Supabase Auth session, real score mutation, Realtime, browser, OBS, or Facebook Live test was performed.

## Findings and limits

The SQL needs no Supabase-only `auth` schema, claims, extension, or foreign key. In the isolated cluster it created 7 tables, 19 indexes, forced RLS on all 7, zero allow policies, one projection view, and 2 NOLOGIN roles. Real non-superuser test logins were denied base-table reads/writes; the overlay role read only the projection. The audit trigger denied UPDATE. Rollback/reapply succeeded with synthetic data. This **does not** prove safe production rollback or validate an eventual runtime scoring function.

The migration is now guarded for the rehearsal database only. A later deployment migration must be reviewed and retargeted after owner approval; do not simply remove its guard. The current `.env.local` still points to the MVA `mva_dev` superuser and must not be used by the scoreboard runtime. MVA catalog API, live Auth issuer/redirect behavior, owner-approved league/scoring policy, non-superuser runtime credential, mutation transaction design, and retention/backups remain blockers. Google Fonts access may still prevent `pnpm build` in this environment.

## Exact next task

Implement a bounded Auth/database foundation **only after** confirming the intended nonproduction target and MVA owner approvals: establish a least-privilege runtime login and reviewed transactional mutation boundary, verify Supabase sessions against the actual issuer, then test scoreboard-specific role/assignment enforcement. Keep `mva_dev` and production untouched until separately authorized.

## Continuation rules

Inspect Git status/recent commits; read `AGENTS.md`, `docs/UI_UX_GUIDELINES.md`, `docs/PLAN.md`, this handoff, and the runbook. Preserve others' changes, commit focused Conventional Commits, and do not merge, push, deploy, or modify production/MVA resources without explicit direction.
