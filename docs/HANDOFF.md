# Agent handoff — Phase 01G final pre-migration verification

**Branch:** `docs/phase-01a-architecture`. **Base HEAD:** `2d449276756210ca88d2dad080146cb4a2e0d854`. **Latest HEAD:** the local Phase 01G commit containing this file; run `git rev-parse HEAD` for its exact SHA. **Verdict:** **BLOCKED**; no scoreboard migration applied to `mva_dev` or production.

## Verified work

- The direct target remains local PostgreSQL 18.0.3 `mva_dev` on IPv6 loopback port 5432, system identifier `7629597861964584196`. A final read-only query found expected MVA tables, no `scoreboard` schema, and no scoreboard roles. The current connection is the `postgres` superuser and must be migration-only.
- A restricted backup outside Git was restore-tested in a separate disposable PostgreSQL cluster on port 55433 with a distinct system identifier. The restore needed an explicitly UTF-8 database because Windows cluster defaults were WIN1252. It then succeeded with matching user schemas, 13 tables and row counts, 112 public constraints, and 49 public indexes. The archive, temporary cluster, and generated credential were removed; no retained recovery point exists.
- Both local repositories configure the same external Supabase URL and anon key; public Auth settings responded HTTP 200. The endpoint did not reveal project ownership, production-user classification, or allowed redirect URLs. No Auth user or setting was modified.
- The exact candidate [`0001_scoreboard_foundation.mva_dev.review.sql`](../db/migrations/0001_scoreboard_foundation.mva_dev.review.sql) was reviewed without edits. SHA-256: `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`. Its identity guard, expected schema/roles/grants, risks, rollback boundaries, and outstanding gates are in the [approval report](MIGRATION_APPROVAL_REPORT.md). The candidate creates no runtime login or scoring mutation path.

**Files changed:** `docs/MIGRATION_APPROVAL_REPORT.md`, `docs/DB_RUNBOOK.md`, `docs/PLAN.md`, `docs/HANDOFF.md`. No MVA repository file, application feature, production object, or migration SQL changed.

**Validation:** `pnpm lint`, `pnpm exec tsc --noEmit`, and `git diff --check` passed. `pnpm build` failed because the unchanged starter layout could not fetch Geist and Geist Mono from Google Fonts. Backup integrity and isolated restore checks passed; the first WIN1252 restore attempt failed before the corrected UTF-8 restore succeeded.

## Remaining gates and exact next task

The owner must confirm the intended Supabase project and whether it contains production users, approve scoreboard-local Auth redirects and refresh behavior, approve the shared local database and two cluster-wide NOLOGIN roles, and review the exact migration checksum. Prepare a `mva_dev`-specific read-only post-migration verification file and a fresh protected backup with a retained recovery point. Then request **separate explicit approval** to apply the candidate migration. Do not infer approval from this verification phase. A later bounded phase must provision/test a non-superuser runtime identity and transactional authorization functions before wiring server Auth or scoring.

On continuation, inspect Git status/recent commits and read `AGENTS.md`, UI guidelines, plan, architecture, preflight, runbook, and this handoff. Preserve other work. Do not push, merge, deploy, or touch production/MVA resources without explicit direction.
