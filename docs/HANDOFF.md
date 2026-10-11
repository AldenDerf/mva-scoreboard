# Agent handoff — Phase 01D foundation preparation

**Branch:** `docs/phase-01a-architecture`. **Base HEAD:** `df534c1c073acd909870f265469df693f704a235`. **Latest HEAD:** the Phase 01D commit containing this file; run `git rev-parse HEAD` for the exact SHA. **Phase:** 01D artifacts prepared, nothing applied.

## Completed

- Read the project instructions and prior architecture. Inspected the local MVA source read-only at `7be85596a3c6ea5b9af184f233f354f394e1e26e`.
- Parsed both ignored env files without printing credentials. Both point to loopback PostgreSQL `mva_dev` and the same external Supabase URL/anon key. Read-only SQL confirmed PostgreSQL 18.0.3, MVA `public` tables, no `scoreboard` or `auth` schema, and a configured `postgres` superuser with `BYPASSRLS`.
- Prepared [guarded migration](../db/migrations/0001_scoreboard_foundation.sql), [verification SQL](../db/verification/0001_read_only.sql), [database runbook](DB_RUNBOOK.md), and [catalog](../lib/contracts/mva-catalog.ts) / [scoring](../lib/contracts/scoring.ts) types. Updated architecture, plan, and README.
- No migration, Auth call, user creation, MVA change, scoring feature, or overlay was performed.

**Files changed:** `README.md`, `docs/ARCHITECTURE.md`, `docs/PLAN.md`, `docs/HANDOFF.md`, `docs/DB_RUNBOOK.md`, `db/migrations/0001_scoreboard_foundation.sql`, `db/verification/0001_read_only.sql`, `lib/contracts/mva-catalog.ts`, `lib/contracts/scoring.ts`.

**Validation:** `pnpm lint`, `pnpm exec tsc --noEmit`, and `git diff --check` passed. `pnpm build` failed while the unchanged starter layout fetched Geist and Geist Mono from Google Fonts; a separate connectivity check also failed. Database verification used only `BEGIN READ ONLY` queries. Migration SQL was **not executed or database-tested**; typed contracts have no runtime implementation.

## Critical findings and blockers

Local `mva_dev` is **not** the Supabase Auth database: `auth.users` is absent. Scoreboard grant user IDs must be treated as externally verified UUIDs; do not add an `auth.users` FK. The shared-project assumption in Phase 01C is superseded for this local target. The current `postgres` credential is superuser and bypasses RLS; never use it as the web app runtime connection. Owner approval, disposable-clone/backup designation, a non-superuser runtime identity, live Auth issuer/redirect verification, catalog API ownership, MVA policy approval, and retention remain outstanding.

The prepared SQL is guarded for `mva_dev`, but do not execute it until the [runbook](DB_RUNBOOK.md) gates pass. It creates only scoreboard objects, default-deny RLS, and NOLOGIN capability roles. It provides no scoring mutation function or runtime login. The proposed MVA catalog endpoint has not been implemented. The unchanged starter's Geist download may still block `pnpm build` on this network.

## Exact next task

Have the owner review the target and SQL, establish a disposable `mva_dev` clone plus backup, verify Supabase Auth issuer/redirect behavior, then rehearse the migration and role/RLS checks in that clone. Next, design a non-superuser server runtime path and Auth session integration before any feature UI. Do not use the current superuser connection in application code.

## Continuation rules

Inspect `git status`/recent commits and read `AGENTS.md`, `docs/UI_UX_GUIDELINES.md`, `docs/PLAN.md`, this handoff, and the runbook. Preserve uncommitted work, use focused Conventional Commits, and update this handoff after substantial work. Do not merge, push, deploy, or modify production or MVA resources without explicit direction.
