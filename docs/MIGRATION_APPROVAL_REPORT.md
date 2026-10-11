# Phase 01G migration approval report — 2026-10-11

**Verdict: BLOCKED.** This verification does not authorize execution. No scoreboard migration was applied to `mva_dev` or any production resource.

## Verified target and restore proof

- The configured direct connection reached local PostgreSQL 18.0.3 database `mva_dev` on IPv6 loopback `::1`, port 5432, cluster system identifier `7629597861964584196`. A final read-only check found `public.leagues`, `public.registrations`, and `public.teams`; no `scoreboard` schema and no `scoreboard_server`, `scoreboard_overlay_reader`, or `scoreboard_runtime` role. The connection uses `postgres`, which is migration-only and must never be used by application runtime.
- A custom-format `pg_dump` of the existing database was stored outside Git in a restricted temporary directory. Its SHA-256 was `570fbb7dc8147c22bc9626ab249d60b29b355ba9b2cf285467e2665373864dfe`; `pg_restore --list` parsed the archive. The checksum was unchanged after the restore test. No row values or credentials were printed.
- An isolated local PostgreSQL 18 cluster on `127.0.0.1:55433` had a different system identifier, `7695352697897103072`, and no `mva_dev`. The first restore database inherited Windows `WIN1252` encoding and rejected a UTF-8 character in `admin_audit_logs`. A second, fresh restore database explicitly created as UTF-8 restored the archive with `pg_restore --exit-on-error` successfully. The restored and original databases had the same two user schemas, 13 tables, per-table row counts, 112 `public` constraints, and 49 `public` indexes. The expected `leagues`, `registrations`, and `payments` tables were present. This tests logical restore of schema and data; `--no-owner --no-privileges` means it does not prove restoration of original owners or grants.
- The isolated server was stopped and its port ceased listening. The disposable cluster, failed cluster, generated password, and sensitive backup archive were removed after verification. There is **no retained recovery point** for a future migration; create and protect a fresh one before execution. The original `mva_dev` was queried read-only and was not modified.

## Auth findings

Both local repositories configure the same Supabase Auth URL and anon key. The public `/auth/v1/settings` endpoint responded HTTP 200, confirming that configured endpoint is reachable. Public settings did not expose issuer ownership, the project's production-user classification, or its redirect allowlist. The scoreboard's separate origin and refresh callback therefore remain unverified. The project owner must inspect the intended Supabase dashboard/project settings and confirm the project reference/issuer, whether production users are present, approved localhost scoreboard redirect URLs and Site URL behavior, and the no-public-signup policy. No Auth users or settings were changed. A matching Auth configuration gives identity only; active scoreboard `ADMIN`/`SCOREKEEPER` grants and match assignments remain separate authorization checks.

## Exact migration under review

- File: [`0001_scoreboard_foundation.mva_dev.review.sql`](../db/migrations/0001_scoreboard_foundation.mva_dev.review.sql)
- SHA-256: `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`
- The guard requires database `mva_dev`, `::1`, port 5432, system identifier `7629597861964584196`, three MVA tables, and an absent `scoreboard` schema. Recompute and compare the entire file checksum immediately before any separately authorized execution. Any byte change requires renewed review.
- Expected changes: new `scoreboard` schema; seven tables (`matches`, `match_configurations`, `match_sets`, `role_grants`, `scorekeeper_assignments`, `score_events`, `admin_audit_events`); 19 indexes; one overlay view; append-only history function and two triggers; forced RLS with no policies; explicit `PUBLIC` revokes; two cluster-wide NOLOGIN group roles with only the stated schema/view grants. No MVA `public` table, record, policy, trigger, or constraint is altered. No login/runtime role or mutation function is created.
- The SQL is transactional and has no MVA destructive operation or cross-schema foreign key. `postgres` can bypass RLS, so it must remain a controlled migration identity. The candidate does not validate attributes of a pre-existing same-name capability role; current target inspection found neither role, but recheck before applying. The current read-only verification SQL targets the earlier isolated rehearsal database and needs a separately reviewed `mva_dev` variant for post-apply checks.

## Rollback and remaining gates

A failed migration transaction rolls back. If a successful foundation apply must be reversed while the new schema is empty and unreferenced, review a scoped change to revoke its grants and remove **only** its new schema/roles after checking dependencies and a fresh backup. Once match or audit history exists, use a forward correction or tested backup restore; do not blindly drop history or any MVA object. The restore test above did not rehearse owner/ACL recovery or production recovery timing.

Before owner approval for execution: confirm the Auth project and redirect allowlist; confirm this shared local cluster has no production workload and approve the two cluster-wide roles; retain a fresh access-restricted backup with a tested recovery path; review a target-specific post-migration verification script; and approve the exact checksum. Before application runtime, separately provision and test a non-superuser, `NOBYPASSRLS` login and narrowly scoped transaction functions. No permission to execute the migration follows from this report.

## Project validation

`pnpm lint`, `pnpm exec tsc --noEmit`, and `git diff --check` passed. `pnpm build` failed because the unchanged `next/font/google` configuration could not fetch Geist and Geist Mono from Google Fonts in this environment. No typography change was made to mask the network failure.
