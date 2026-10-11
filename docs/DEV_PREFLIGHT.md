# Phase 01F — local `mva_dev` preflight (review only)

**Decision:** do not apply a migration yet. This report describes the intended local development target and the remaining gates. The guarded [candidate SQL](../db/migrations/0001_scoreboard_foundation.mva_dev.review.sql) is a review artifact, not an executed migration. The Phase 01E rehearsal SQL remains guarded for `mva_scoreboard_rehearsal`.

## Verified without changing data

| Check | Result |
| --- | --- |
| Git baseline | `docs/phase-01a-architecture` at `c3bdc6ea2528f69acad299c2bc4c07471aee6e9c`, clean at task start. |
| Database endpoint | `.env.local` direct host is loopback, port 5432, database `mva_dev`; same endpoint/database as local MVA checkout. The actual connection reports IPv6 loopback `::1`. |
| Server identity | PostgreSQL cluster system identifier `7629597861964584196`, PostgreSQL 18; differs from the temporary Phase 01E rehearsal cluster. |
| Database objects | `public.leagues`, `public.registrations`, and `public.payments` exist; `scoreboard` schema is absent. No data rows were read or changed. |
| Connected role | `postgres` is superuser and `BYPASSRLS`; this credential is **migration-only** and unacceptable for scoreboard runtime. |
| Auth configuration | Scoreboard and MVA local env files have identical Supabase URL and anon key; the Auth settings endpoint returned HTTP 200. This confirms the configured endpoint responds, not its production/development classification or redirect allowlist. |
| Backup | PostgreSQL `pg_dump` is installed. No current restorable backup or restore rehearsal was identified; **not ready to migrate**. |
| Migration checksum | Review candidate SHA-256: `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`. Recompute before any future execution. |

The local loopback PostgreSQL connection cannot directly reach a remote production database. The configured external Supabase Auth project may still contain production identities; its ownership, environment classification, redirect allowlist, and user-provisioning policy require dashboard/owner verification before login implementation. No Auth user was read or changed in this phase.

## Candidate impact and safety gates

The candidate SQL differs from the rehearsed migration only in its header and target guard. It requires the exact `mva_dev` name, observed IPv6 loopback address `::1`, port 5432, verified cluster identifier, and existing MVA `public` tables, and rejects an existing `scoreboard` schema. It proposes a new schema, seven tables, 19 indexes, a view, append-only triggers, forced RLS with no allow policies, and two cluster-wide NOLOGIN capability roles. It has no cross-schema FK, no Supabase `auth` dependency, no data migration, and no change to MVA tables, triggers, policies, or records. The roles are cluster-wide and therefore require owner review even though they have no MVA grants.

**External gates before the separately approved migration:**

1. Owner confirms this local cluster is the intended disposable/development target, has no production workload, and approves the scoreboard schema and two NOLOGIN roles.
2. Create a secure backup and demonstrate restore to a separate database/cluster. A full `pg_dump` may contain player/payment data: choose an approved encrypted location, restrict access, set retention, and never commit it. Do not treat `pg_dump` availability as backup readiness.
3. Review the exact candidate diff against the Phase 01E migration, recompute SHA-256, and record an owner-approved checksum. Any byte change requires another review.
4. Re-run read-only identity/schema/privilege checks immediately before execution. Stop if host, port, cluster identifier, database name, MVA object inventory, connected role, or `scoreboard` absence differs.
5. Apply only under the explicit later approval, then run a **development-target-specific** read-only verification file (the current `0001_read_only.sql` is intentionally for the isolated rehearsal target). Confirm MVA object definitions and data counts by safe metadata/aggregate checks approved by MVA owner.
6. Rehearse recovery of this shared development database without deleting MVA objects. Once scoreboard data exists, use forward corrective migrations or a tested backup restore; do not blindly drop the schema.

## Runtime database identity design

Provision a new `scoreboard_runtime` LOGIN role with a generated password held only in server secrets. It must have `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`, no membership in `postgres` or MVA roles, no `CREATE` on `public`/`scoreboard`, and no USAGE or table privilege on MVA `public` data. Grant only `CONNECT` to the target database, `USAGE` on `scoreboard`, and `EXECUTE` on individually reviewed scoreboard functions once those functions exist. Do **not** grant it direct base-table SELECT/INSERT/UPDATE/DELETE. Separate an overlay-serving identity with only the projection view grant, or let a trusted server route use a narrowly scoped read function; never give browser users SQL credentials.

The Phase 01D migration currently creates `scoreboard_server` and `scoreboard_overlay_reader` as NOLOGIN groups, but grants the former schema USAGE only. A later migration must define safe transactional functions or another reviewed database boundary before runtime writes. Use a dedicated non-superuser function owner with only required scoreboard table rights; avoid a `SECURITY DEFINER` function owned by `postgres`. Fix its `search_path`, schema-qualify objects, revoke default `PUBLIC EXECUTE`, and grant only named functions. Test RLS/permissions as real login roles. Function-owner bypass behavior, `FORCE ROW LEVEL SECURITY`, and service function access must be verified in a disposable clone before changing `mva_dev`.

## Server Auth and authorization design

The scoreboard server will use the configured Supabase Auth issuer to validate the session with a verified user lookup; do not trust an unverified cookie payload, email, or user metadata. Its own origin needs approved Auth redirect URLs and cookie refresh behavior. There is no public signup. A signed-in user gains no scoreboard privilege until an active `scoreboard.role_grants` row exists for that exact Auth UUID. An `ADMIN` may manage matches and assignments; scoring still requires an active `SCOREKEEPER` grant and active assignment to that match. Every mutation rechecks Auth, grant, assignment, match status, expected revision, and idempotency in one server-controlled transaction. The public overlay uses a separate read-only projection with no Auth credentials or mutation route.

Initial admin provisioning is a separate reviewed one-time operation: owner identifies an existing Auth UUID through a trusted admin channel, records approval, inserts one scoreboard `ADMIN` grant and audit event atomically through a constrained bootstrap path, verifies it, and disables the bootstrap capability. Do not use an email comparison or copy MVA `admin_access`. No bootstrap or session code is implemented in this phase.

## Current blockers and next action

Auth project environment/redirect ownership is unverified. No tested backup/restore point exists. The non-superuser runtime role, function owner, mutation functions, and application session integration have not been created. MVA catalog API and tournament/scoring policy approvals also remain outstanding. Obtain the missing owner and backup evidence, then request separate explicit approval for the exact `mva_dev` migration candidate and checksum. Do not use the current `postgres` connection in application runtime code.
