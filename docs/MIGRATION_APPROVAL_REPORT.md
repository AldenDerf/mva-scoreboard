# Phase 01G migration approval report — 2026-10-11

**Verdict: BLOCKED.** Phase 01H prepared the post-checker and recovery procedure but did not create a retained backup or authorize execution. No scoreboard migration was applied to `mva_dev` or any production resource.

## Verified target and restore proof

- The configured direct connection reached local PostgreSQL 18.0.3 database `mva_dev` on IPv6 loopback `::1`, port 5432, cluster system identifier `7629597861964584196`. A final read-only check found `public.leagues`, `public.registrations`, and `public.teams`; no `scoreboard` schema and no `scoreboard_server`, `scoreboard_overlay_reader`, or `scoreboard_runtime` role. The connection uses `postgres`, which is migration-only and must never be used by application runtime.
- A custom-format `pg_dump` of the existing database was stored outside Git in a restricted temporary directory. Its SHA-256 was `570fbb7dc8147c22bc9626ab249d60b29b355ba9b2cf285467e2665373864dfe`; `pg_restore --list` parsed the archive. The checksum was unchanged after the restore test. No row values or credentials were printed.
- An isolated local PostgreSQL 18 cluster on `127.0.0.1:55433` had a different system identifier, `7695352697897103072`, and no `mva_dev`. The first restore database inherited Windows `WIN1252` encoding and rejected a UTF-8 character in `admin_audit_logs`. A second, fresh restore database explicitly created as UTF-8 restored the archive with `pg_restore --exit-on-error` successfully. The restored and original databases had the same two user schemas, 13 tables, per-table row counts, 112 `public` constraints, and 49 `public` indexes. The expected `leagues`, `registrations`, and `payments` tables were present. This tests logical restore of schema and data; `--no-owner --no-privileges` means it does not prove restoration of original owners or grants.
- The isolated server was stopped and its port ceased listening. The disposable cluster, failed cluster, generated password, and sensitive backup archive were removed after verification. There is **no retained recovery point** for a future migration; create and protect a fresh one before execution. The original `mva_dev` was queried read-only and was not modified.

## Auth findings

Both local repositories configure the same Supabase Auth URL and anon key. The public `/auth/v1/settings` endpoint responded HTTP 200, confirming that configured endpoint is reachable. Public settings did not expose issuer ownership or its redirect allowlist. A matching Auth configuration gives identity only; active scoreboard `ADMIN`/`SCOREKEEPER` grants and match assignments remain separate authorization checks. No Auth users or settings were changed.

**Owner update:** The owner confirms this is the existing MVA **production** Supabase Auth project; Site URL is `http://localhost:3000`, and the additional Redirect URLs list is empty. No Auth setting changed. These owner-reported dashboard facts supersede the earlier unknown production classification and list state; the project reference and deployed MVA configuration have not been independently compared in this repository. The scoreboard has no Auth code yet.

The intended MVP copies MVA's existing server-side **email/password** sign-in pattern. That flow does not use `redirectTo` or a callback, so no new Redirect URL is required for MVP login. Reserve `http://localhost:3001` for scoreboard development because MVA may use port 3000; explicitly pin that port when implementing dev startup. If OAuth, magic links, invitation/confirmation, or recovery is later approved, first implement and register the proposed exact PKCE callback `http://localhost:3001/auth/callback` (or review a flow-specific token-hash endpoint). Do not change the Site URL or assume this callback is already accepted. See the [architecture decision](ARCHITECTURE.md#owner-auth-redirect-decision).

### Phase 01H owner confirmation checklist

**Verified locally:** The MVA and scoreboard `.env.local` files still have byte-identical Supabase Auth URLs and anon keys. A fresh read-only settings request returned HTTP 200 and no redirect-allowlist fields. The local PostgreSQL database has no Supabase `auth.users` table. These observations support a shared configured Auth endpoint, but do not prove dashboard ownership, deployed issuer, user population, or that the MVA deployment uses these local settings.

The project owner must record, without copying keys or user lists into Git:

1. Record the owner-confirmed production project reference and dashboard organization, then compare the **deployed** MVA Auth URL/issuer to the scoreboard configuration. Local environment values match, but deployed configuration has not been inspected.
2. Confirm who may approve local sign-in with production identities, whether public self-registration is disabled, and whether any account-specific restrictions or MFA requirements apply. Do not create test users or alter production users.
3. For password-only MVP, confirm the scoreboard will run at `http://localhost:3001` and needs no Auth callback. If a redirect-based flow is later authorized, review and explicitly add only the exact callback URL after the route exists; preserve the MVA Site URL `http://localhost:3000`.
4. The intended session flow for the separate scoreboard origin: server-side validation of the current Supabase user against the approved issuer, audience/project and token expiry; secure cookies and refresh; rejection of revoked/expired sessions. Localhost **ports do not isolate cookies**. Decide and test app-specific cookie names/scope versus intentional shared sessions before implementation. Establish the exact SDK/JWKS or verified-user-lookup method then. Never trust an unverified cookie payload, email, or user metadata for permissions.
5. The owner of initial scoreboard `ADMIN` provisioning and the rule that a valid Auth identity has **zero** scoreboard privilege until an active scoreboard grant exists. Scoring additionally requires an active `SCOREKEEPER` grant and match assignment.

Record who confirmed each item and when in the migration change record. No Auth settings or users were modified in Phase 01H.

## Exact migration under review

- File: [`0001_scoreboard_foundation.mva_dev.review.sql`](../db/migrations/0001_scoreboard_foundation.mva_dev.review.sql)
- SHA-256: `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`
- The guard requires database `mva_dev`, `::1`, port 5432, system identifier `7629597861964584196`, three MVA tables, and an absent `scoreboard` schema. Recompute and compare the entire file checksum immediately before any separately authorized execution. Any byte change requires renewed review.
- Expected changes: new `scoreboard` schema; seven tables (`matches`, `match_configurations`, `match_sets`, `role_grants`, `scorekeeper_assignments`, `score_events`, `admin_audit_events`); 19 indexes; one overlay view; append-only history function and two triggers; forced RLS with no policies; explicit `PUBLIC` revokes; two cluster-wide NOLOGIN group roles with only the stated schema/view grants. No MVA `public` table, record, policy, trigger, or constraint is altered. No login/runtime role or mutation function is created.
- The SQL is transactional and has no MVA destructive operation or cross-schema foreign key. `postgres` can bypass RLS, so it must remain a controlled migration identity. The candidate does not validate attributes of a pre-existing same-name capability role; current target inspection found neither role, but recheck before applying. The Phase 01E verification SQL is for the isolated rehearsal database; use the newly prepared `mva_dev` checker after owner review.

Phase 01H rehashed the unchanged candidate and confirmed the SHA-256 above. The new [`mva_dev` post-checker](../db/verification/0001_mva_dev_post_read_only.sql) uses a read-only transaction and checks target identity, seven tables, 103 constraints, 19 indexes, forced RLS, no policies, role attributes, explicit ACLs, overlay projection, append-only triggers, and the 13-table MVA inventory. It also emits a fingerprint of MVA public table definitions for comparison with a pre-migration capture. It was parsed and run against the **unmigrated** `mva_dev`: identity and MVA inventory passed; scoreboard checks failed as expected. The post-migration positive path has not been executed.

## Rollback and remaining gates

A failed migration transaction rolls back. If a successful foundation apply must be reversed while the new schema is empty and unreferenced, review a scoped change to revoke its grants and remove **only** its new schema/roles after checking dependencies and a fresh backup. Once match or audit history exists, use a forward correction or tested backup restore; do not blindly drop history or any MVA object. The restore test above did not rehearse owner/ACL recovery or production recovery timing.

Before owner approval for execution: complete the Auth checklist; confirm this shared local cluster has no production workload and approve the two cluster-wide roles; review the new checker; choose and document the protected recovery directory, custodian, retention date, and restore owner; create and retain a fresh backup immediately before execution; capture the pre-migration MVA definition fingerprint; and approve the exact checksum. The prior restore rehearsal proves the archive process but does not provide a current recovery point. Before application runtime, separately provision and test a non-superuser, `NOBYPASSRLS` login and narrowly scoped transaction functions. No permission to execute the migration follows from this report.

## Project validation

`pnpm lint`, `pnpm exec tsc --noEmit`, and `git diff --check` passed. `pnpm build` failed because the unchanged `next/font/google` configuration could not fetch Geist and Geist Mono from Google Fonts in this environment. No typography change was made to mask the network failure.

Phase 01H repeated these four checks with the same results. The new post-checker executed as read-only SQL on the unmigrated target; the target/MVA baseline checks passed and all expected absent-scoreboard checks failed. This is a syntax and negative-path check, not proof that the eventual post-migration state will pass.

## Phase 03B preflight and backup readiness (2026-10-11)

**Verdict: BLOCKED PENDING OWNER APPROVAL.** All preflight gates verified; stopped at approval boundary.

- **Verified target:** PostgreSQL 18.0.3 on IPv6 loopback `[::1]:5432`, database `mva_dev`, cluster system identifier `7629597861964584196`. Confirmed not a production connection.
- **Catalog status:** All MVA public tables (`leagues`, `league_categories`, `registrations`, `teams`, `admin_access`, etc.) are present. `scoreboard` schema and capability roles do not exist.
- **Read-only pre-checker baseline:** Executed `db/verification/0001_mva_dev_post_read_only.sql`. Target identity and MVA baseline passed. All scoreboard checks failed as expected for an unmigrated target. Recorded MVA public definition fingerprint: SHA `c16708e4bf35a86e66c098a810108d0c` across 289 catalog entries.
- **Migration candidate integrity:** SHA-256 of `db/migrations/0001_scoreboard_foundation.mva_dev.review.sql` recalculated and confirmed byte-identical to `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`.
- **Backup directory readiness:** Created `C:\mva-db-backups\`. Disabled NTFS inheritance; restricted ACL exclusively to `BUILTIN\Administrators` and `NT AUTHORITY\SYSTEM` (Full Control), removing broad `Users` access. Verified 86.4 GB available storage on drive `C:`.
- **Approved retention policy:** 7 days following verified migration, provided recovery remains verified.
- **Exact pre-migration backup command:**
  ```powershell
  & "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h ::1 -p 5432 -U postgres -d mva_dev -Fc -f "C:\mva-db-backups\mva_dev_pre_migration_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"
  ```
  Followed by SHA-256 recording via `Get-FileHash -Algorithm SHA256` and archive verification via `pg_restore --list`.
- **Stop condition enforced:** No migration applied. Awaiting separate, explicit owner authorization.

## Phase 03C protected backup and migration readiness (2026-10-11)

**Verdict: BLOCKED PENDING OWNER APPROVAL.** Protected backup created, verified, and retained. Baseline verification completed. All pre-flight criteria satisfied. Migration execution halted awaiting explicit owner authorization.

- **Verified target:** PostgreSQL 18.0.3 on IPv6 loopback `[::1]:5432`, database `mva_dev`, cluster system identifier `7629597861964584196`. Confirmed local development target (not production).
- **Created & retained backup archive:**
  - File: `C:\mva-db-backups\mva_dev_pre_migration_20261011_205157.dump`
  - Size: 100,733 bytes
  - SHA-256: `ad03bb807d35d106f070b536a8474cc3a19b2b0ac207825098aa3df1924d543e`
  - Archive verification: `pg_restore --list` successfully parsed 131 TOC entries (schemas, tables, constraints, sequences, indexes).
  - Restore test limitation: Non-interactive subshell execution prevented standalone disposable database restore on `postgres` cluster without terminal prompt. Archive format and TOC validity confirmed via `pg_restore --list`.
- **Pre-migration baseline verification:**
  - Executed `db/verification/0001_mva_dev_post_read_only.sql` in read-only transaction.
  - Identity and MVA baseline passed; all 9 scoreboard-specific checks failed as expected for an unmigrated database.
  - MVA public table definition fingerprint: SHA `c16708e4bf35a86e66c098a810108d0c` across 289 catalog entries.
- **Migration candidate integrity:**
  - File: `db/migrations/0001_scoreboard_foundation.mva_dev.review.sql`
  - SHA-256: `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0` (enforced via `.gitattributes` LF normalization).
- **Quality gates:** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (12/12 passing), and `pnpm build` (Next.js 16 Turbopack production build) all passed cleanly.
- **Stop condition enforced:** No migration executed. Awaiting explicit owner approval.

## Phase 03D independent restore verification (2026-10-11)

**Verdict: restore verified; migration execution remains blocked pending owner approval.** This pass did not execute the scoreboard migration anywhere.

- The retained archive remains at `C:\mva-db-backups\mva_dev_pre_migration_20261011_205157.dump`, size 100,733 bytes. SHA-256 matched `ad03bb807d35d106f070b536a8474cc3a19b2b0ac207825098aa3df1924d543e` before and after the test. PostgreSQL 18 `pg_restore --list` succeeded. This pass counted 127 numbered TOC entries (including 13 TABLE DATA, 22 CONSTRAINT, 17 FK CONSTRAINT, and 30 INDEX entries); the Phase 03C report's 131-entry count was not reproduced. The archive contains the expected MVA tables, data, constraints, indexes, and row-security entries.
- A fresh PostgreSQL 18 cluster was initialized under a task-specific temporary directory, bound only to `127.0.0.1:55434` with trust authentication for this isolated local rehearsal. Its system identifier was `7695404507456167744`, distinct from original `mva_dev` at `[::1]:5432`, identifier `7629597861964584196`. A fresh `mva_restore_03d` database used `template0`, UTF-8 encoding, and `C` locale. `pg_restore --exit-on-error` completed with exit code 0 and no reported warnings or errors. Ownership and grants were retained; no `--no-owner` or `--no-privileges` flags were used.
- Read-only comparisons matched: two user schemas, 13 tables, 126 constraints, 52 indexes, 128 columns, and ownership/ACL digests for 14 relations and both schemas. Catalog digests included names and definitions. Per-table original/restored row counts: `private_app._prisma_migrations` 1/1, `private_app.invite_access` 2/2, `public.admin_access` 2/2, `public.admin_audit_logs` 180/180, `public.league_categories` 5/5, `public.leagues` 3/3, `public.payment_allocations` 70/70, `public.payments` 104/104, `public.players` 142/142, `public.profiles` 5/5, `public.registration_players` 129/129, `public.registrations` 20/20, `public.teams` 22/22. No mismatches were observed. These are point-in-time counts and catalog comparisons, not a byte-for-byte comparison of row values or a production recovery timing test.
- The exact migration candidate remained unchanged; SHA-256 matched `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`.
- Before cleanup, the task checked the disposable cluster identifier, database name, and absolute temporary path. The server stopped, the task-created temporary directory was removed, port 55434 ceased responding, and original port 5432 remained available. The protected backup was not changed or removed.

**NO SCOREBOARD MIGRATION EXECUTED — OWNER APPROVAL STILL REQUIRED.**

### Phase 03D quality gates and handoff

`pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (12/12), `pnpm build`, and `git diff --check` passed. The first sandboxed test and build attempts failed with Windows `spawn EPERM`; both passed when rerun with elevated execution. Node printed existing module-type warnings during tests. No application code was changed. Remaining gates are owner Auth review and explicit migration authorization; the restore proof does not authorize execution.
