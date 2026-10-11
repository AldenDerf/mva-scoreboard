# Phase 01D database preflight and migration runbook

**Prepared, not applied.** `db/migrations/0001_scoreboard_foundation.sql` is review-only SQL for a disposable/nonproduction clone named `mva_dev`. It has never been executed by this task. The read-only verification file is `db/verification/0001_read_only.sql`. Never point the migration at production without a separate reviewed plan and authorization.

## Verified local environment (2026-10-11)

- Scoreboard and MVA `.env.local` have the same `DATABASE_URL`/`DIRECT_URL` host and `mva_dev` database name, and the same Supabase URL and anon key. The direct PostgreSQL host is loopback port 5432. Values and credentials were not printed.
- A `BEGIN READ ONLY` query connected to `mva_dev` as `postgres` on PostgreSQL 18.0.3 (`server_version_num` 180003). `public.leagues`, `public.league_categories`, `public.registrations`, and `public.teams` exist. `scoreboard`, `auth`, and `auth.users` do not exist. `gen_random_uuid()` is available.
- The configured `postgres` role can create schemas and `public` objects and is a superuser with `BYPASSRLS`. It is **migration/admin access only**, unsuitable for the scoreboard runtime. RLS does not constrain this connection. Current configuration proves shared local MVA PostgreSQL and matching external Supabase Auth settings, **not** that Auth identities have PostgreSQL foreign keys or that the local DB belongs to the Supabase project.
- The Supabase URL/anon key match MVA's local config. No live Auth request, user lookup, redirect-allowlist inspection, or Supabase dashboard verification was performed. User IDs are therefore external UUIDs without FK to `auth.users`.

## Prerequisites and stop conditions

1. Confirm the intended **disposable nonproduction** `mva_dev` target, backup/restore point, owner, and change window. Recheck `current_database()`, `current_user`, server identity through an approved channel, existing schema, extension/function availability, and privileges using read-only queries.
2. Obtain MVA owner approval for a new `scoreboard` schema on this shared local/database deployment. Verify no other agent or app uses the target concurrently. Review the SQL diff and a PostgreSQL 18 compatibility check in a disposable clone.
3. Stop if the target is production, if `scoreboard` already exists, if `auth`/other assumptions differ, if backup restore is untested, if MVA tables would change, or if the applied role would be exposed to the web app.
4. Provision a **distinct non-superuser runtime LOGIN role** in a later reviewed change. Do not give it ownership, `BYPASSRLS`, `CREATEROLE`, `CREATE`, or MVA table privileges. Do not wire `DATABASE_URL`/`DIRECT_URL` from the current `.env.local` into runtime server code.

## Planned order (future approved execution only)

1. Backup and record a restore point in the disposable target. Run read-only preflight; capture existing MVA object inventory without private rows.
2. Apply `0001_scoreboard_foundation.sql` as one transaction. It refuses a database other than `mva_dev` or an existing `scoreboard` schema. It creates isolated tables, indexes, default-deny RLS, append-only triggers, a minimal overlay view, and NOLOGIN capability roles. It grants no mutation path. It creates no Auth users and changes no MVA table/RLS policy.
3. Run `0001_read_only.sql`; verify schema/table inventory, RLS flags, expected grants, and MVA tables still present. Examine the migration ledger/outcome manually; this repo has no migration runner yet.
4. In a later migration, after reviewing exact server authorization and SQL transaction functions, grant a separate runtime role only `EXECUTE` on vetted functions and grant the overlay-serving role only the public view. Runtime roles must be tested without superuser privileges. No anonymous connection should receive base-table access.
5. Seed synthetic matches and test role revocation, unassigned-match denial, duplicate idempotency keys, stale revisions, audit immutability, and overlay field allowlist before any application wiring.

### Initial admin bootstrap (later approved operation)

The foundation migration inserts **no** role grants. After a non-superuser authorization path and audit-writing transaction are reviewed, an MVA/scoreboard owner selects one existing Supabase Auth user by its verified UUID, approves the target environment, and records the change ticket. A one-time, parameterized bootstrap operation inserts exactly one `ADMIN` grant and a corresponding audit event in one transaction; it must reject an existing active admin unless the owner explicitly reviews recovery. Verify the grant using a non-superuser session, then disable/remove bootstrap execution access. Do not use an email match, MVA `admin_access`, public metadata, or a client call as automatic authorization.

## Rollback and data safety

The migration is additive and transactional: a failed transaction rolls itself back. If the schema is **empty and unreferenced**, a separately reviewed rollback may revoke dependent grants and drop only `scoreboard` objects after confirming object ownership and a backup. This runbook deliberately contains no executable drop command. Once score/audit events or real matches exist, dropping the schema loses history; prefer a forward corrective migration or tested point-in-time restore. Never drop or alter `public` MVA tables, `auth` objects, or external Supabase users as part of scoreboard rollback.

## Authorization and contract verification

- Verify anonymous users and MVA-only Auth users have no scoreboard SQL privileges. Verify `scoreboard_overlay_reader` can select only `overlay_matches`, and no raw table or private event data.
- Verify `scoreboard_server` currently has schema usage only; it cannot mutate until reviewed functions exist. A future runtime role must be non-superuser and must not inherit `postgres` privileges.
- Verify external Auth user IDs through the scoreboard server before every write. Database role grants alone are not user authorization; each mutation must check active scoreboard role, assignment, match state, revision, and idempotency in one transaction.
- Confirm score events and admin audit records reject update/delete; test that corrections append compensating events. Confirm MVA fields and logo URLs are validated and that public projection contains no actor or registration IDs.
- Check that the MVA-owned catalog endpoint returns only tournaments, divisions, eligible team identities/logos, and fresh matchup validation, with no private player/payment fields.

## Environment and build notes

The current `.env.local` variables are `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; no scoreboard runtime credential or MVA catalog credential is defined. Do not invent values or commit `.env*`. A separate Google Fonts connectivity check still fails in this host; `pnpm build` must be reported independently from lint and typecheck. A network-enabled build or a separately reviewed local Geist font change is the reproducible path.
