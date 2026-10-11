# Agent handoff — Phase 01F development preflight

**Branch:** `docs/phase-01a-architecture`. **Base HEAD:** `c3bdc6ea2528f69acad299c2bc4c07471aee6e9c`. **Latest HEAD:** the Phase 01F commit containing this file; run `git rev-parse HEAD` for its exact SHA. **Status:** `mva_dev` not migrated; no runtime/Auth feature implemented.

## Completed

- Verified the local `.env.local` database and Auth configuration without exposing values. Read-only SQL confirmed loopback `mva_dev` on PostgreSQL 18, original cluster identifier `7629597861964584196`, MVA tables present, and `scoreboard` absent. The connected `postgres` role is superuser and bypasses RLS.
- Confirmed the scoreboard and MVA local env files use the same Supabase URL and anon key; the Auth settings endpoint returned HTTP 200. Project environment classification, owner, users, and redirect allowlist were **not** verified.
- Created a [review-only guarded `mva_dev` migration candidate](../db/migrations/0001_scoreboard_foundation.mva_dev.review.sql), keeping the isolated rehearsal migration unchanged. Its checksum, expected impact, backup gate, authorization design, and exact target checks are in [DEV_PREFLIGHT.md](DEV_PREFLIGHT.md).
- Updated [architecture](ARCHITECTURE.md), [runbook](DB_RUNBOOK.md), and [plan](PLAN.md). No MVA repository file, database object, Auth user, or application feature was changed.

**Files changed:** `db/migrations/0001_scoreboard_foundation.mva_dev.review.sql`, `docs/DEV_PREFLIGHT.md`, `docs/ARCHITECTURE.md`, `docs/DB_RUNBOOK.md`, `docs/PLAN.md`, `docs/HANDOFF.md`.

**Validation:** `pnpm lint`, `pnpm exec tsc --noEmit`, and `git diff --check` passed. `pnpm build` failed while the unchanged starter layout fetched Geist and Geist Mono from Google Fonts. Candidate comparison confirmed only the header and target guard differ from the rehearsed SQL. A final read-only query found actual server address `::1`, which was incorporated into the candidate guard and checksum. The DB queries were `BEGIN READ ONLY`; the Auth settings request was read-only. Neither migration file was executed in Phase 01F.

## Blockers

No verified secure backup/restore point exists for `mva_dev`. Auth project environment ownership and login redirects are unknown. The candidate checksum has not been owner-approved. No least-privilege runtime login or transactional function boundary exists; the current `postgres` URL must remain out of runtime code. The MVA catalog endpoint and tournament/scoring policy also need owner approval. The Google Fonts download may continue to block `pnpm build`.

## Exact next task

Obtain owner verification of the Auth project and approved redirect URLs, create and restore-test a secure development backup, then request **separate explicit approval** for applying the exact candidate migration checksum to `mva_dev`. After that approval, execute with read-only pre/post checks, then implement and test a non-superuser runtime role and server Auth boundary. Do not silently substitute the rehearsal SQL or remove the candidate identity guard.

## Continuation rules

Inspect Git status/recent commits; read `AGENTS.md`, `docs/UI_UX_GUIDELINES.md`, `docs/PLAN.md`, this handoff, and the preflight/runbook. Preserve others' changes, commit focused Conventional Commits, and do not merge, push, deploy, or modify production/MVA resources without explicit direction.
