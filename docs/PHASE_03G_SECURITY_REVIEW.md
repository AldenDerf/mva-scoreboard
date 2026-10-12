# Phase 03G independent runtime security review

**Verdict:** proposal prepared; no approval to execute. Read-only PostgreSQL catalog queries confirmed local `mva_dev` at `[::1]:5432`, cluster identifier `7629597861964584196`. Exactly seven `scoreboard` base tables have RLS and FORCE RLS; there are no policies, runtime LOGIN, active ADMIN grants, or local `auth.users`. `scoreboard_server` and `scoreboard_overlay_reader` remain NOLOGIN and NOBYPASSRLS. The owner UUID was not obtained and no live Supabase Auth request was made.

## Effective permission matrix

Observed catalog state applies to `scoreboard_server` today. A new runtime role without membership, direct MVA grants, or owner privileges would inherit the same `PUBLIC` rights plus only the proposed direct grants. Check the actual runtime session after any approved creation.

| Surface | Desired runtime access | Effective through PUBLIC today | Proposed addition / residual |
| --- | --- | --- | --- |
| `mva_dev` CONNECT, CREATE, TEMP | CONNECT only | CONNECT yes; CREATE no; TEMP yes (`datacl` NULL) | Direct CONNECT. TEMP remains through PUBLIC; cannot revoke per role. Do not change global PUBLIC without MVA review. |
| `public` schema USAGE, CREATE | Neither needed | USAGE yes, CREATE no | Residual USAGE. No MVA table access. |
| `private_app` schema | None | Neither | No grant. |
| `scoreboard` schema | USAGE only | Neither | Direct USAGE; no CREATE. |
| MVA `public`/`private_app` tables | No SELECT/INSERT/UPDATE/DELETE | None across 13 tables | No grants. |
| Seven scoreboard base tables | No direct DML | None | No grants; forced RLS remains. |
| `scoreboard.overlay_matches` | No access via this runtime | None | No grant; separate overlay path remains future work. |
| Public sequence | None | None | No grant. |
| MVA functions in `public` | None preferred | EXECUTE on two invoker trigger functions | Residual through PUBLIC; neither is SECURITY DEFINER, and trigger functions are not ordinary callable data APIs. Monitor future PUBLIC functions. |
| Scoreboard functions | Lookup only | `reject_history_change()` denied | Grant EXECUTE on lookup only to runtime; explicitly revoke PUBLIC on new functions. |
| Role membership / defaults | No membership in owner/MVA/overlay roles | No scoreboard memberships; no custom default ACLs | No runtime membership proposed. PostgreSQL default PUBLIC EXECUTE on new functions requires explicit revoke in the same DDL transaction. |

The Phase 03F `REVOKE ... FROM scoreboard_runtime` statements do **not** remove privileges inherited from `PUBLIC`. This review does not propose changing shared database or `public` schema ACLs. `TEMP` and two PUBLIC EXECUTEs are residual rights. If the owner requires zero TEMP or zero MVA function EXECUTE, a separately isolated database/cluster or a separately reviewed shared ACL change is required. `has_*_privilege` catalog checks are necessary but actual login-session denial tests remain a gate.

## Function ownership decision

**A, postgres-owned SECURITY DEFINER:** simple and currently compatible with forced RLS because `postgres` bypasses it. A runtime-callable function then runs as a superuser, magnifying any future bug. Reject for the lookup.

**B, dedicated NOLOGIN owner:** recommended. `scoreboard_auth_lookup_owner` receives schema USAGE, column-limited SELECT on `role_grants`, and a SELECT RLS policy scoped to that role. It owns only `active_role_for_user(uuid)`, has no login, no BYPASSRLS, no MVA access, and no membership granted to runtime. The function uses `pg_catalog, pg_temp` search path, a schema-qualified table, fixed SQL, and explicit EXECUTE ACL. A temporary schema CREATE grant is removed before commit. The function's RLS policy permits that owner to inspect active grants, but the callable result is only an ADMIN/SCOREKEEPER/null scalar. Review the function body on every change.

**C, direct runtime SELECT under RLS:** would require a per-user identity conveyed to PostgreSQL. A caller-controlled UUID or custom GUC is forgeable with this ordinary LOGIN, and a broad SELECT policy would expose grant data. Reject until a trustworthy DB-bound session-claim mechanism exists.

The lookup UUID still comes from the Next.js server's `supabase.auth.getUser()`, never a request parameter. A stolen runtime credential can query roles for arbitrary UUIDs; network isolation, secret handling, rate limits, and narrow output mitigate this but do not bind Auth identity inside PostgreSQL. Before future mutation functions, design a stronger actor-binding boundary and transaction-local authorization. ADMIN and SCOREKEEPER grants remain separate from MVA admin records.

## Bootstrap review

The Phase 03F bootstrap is schema-compatible: `role_grants` supports self-attributed initial grant, the unique partial index rejects duplicate active `(user_id,role)`, and `admin_audit_events` accepts the audit payload. Its advisory transaction lock serializes competing bootstrap calls. A same-owner retry returns the existing grant ID without a second audit; a different active ADMIN rejects. The revised proposal additionally rejects any revoked ADMIN history, preventing reuse as a general grant path. Insert and audit occur in one function call, so audit failure rolls back the grant. Operator must execute through a bound-parameter client inside a transaction and verify one grant and one audit, then remove the bootstrap function. None of this verifies Supabase identity by itself.

Obtain the UUID privately from a server-verified Supabase Auth session and independently match the immutable ID in Supabase Auth administration. Do not add a publicly accessible diagnostic, log the UUID, infer it from email, or use MVA `admin_access`. The proposed bootstrap function is postgres-owned but never executable by the runtime; its limited lifetime and cleanup are mandatory. Revocation is an audited transaction, followed by lookup and server denial checks. Cleanup preserves grant/audit history. The revocation proposal requires a verified operator UUID and reason; operator authorization is a manual migration-owner gate until an approved admin workflow exists.

## Application integration and verification cases

Keep `getAuthenticatedUser()` as server-verified identity input. Replace the stale hardcoded `ACCESS_PENDING` in `authorization.ts` only after the restricted role is activated. A server-only data service with a non-`NEXT_PUBLIC_` secret calls the lookup with `user.id`. Validate UUID syntax and exact result (`ADMIN`, `SCOREKEEPER`, null); fail closed on malformed/ambiguous data. Report DB outage as a generic unavailable state to the user and a structured, secret-free operational error, distinct from no grant. Do not cache per-user roles across requests. Recheck on every Server Action and protected route; enforce match assignment for SCOREKEEPER mutations. Keep `/dev` under its existing development-only layout.

`signInAction` currently redirects an authenticated but unauthorized user to `/access-pending`; preserve that for missing/revoked grants. `proxy.ts` refreshes Supabase cookies, while `session.ts` calls `getUser()` on the server. `server.ts` uses a distinct scoreboard cookie name. Test both localhost ports because cookies share a host despite different ports. A successful cookie-name unit test alone does not prove live isolation, refresh, or logout behavior. Protect personalized responses from public caching. Verify the configured Supabase issuer independently, since matching local env files are not proof of live project identity.

Proposed test cases, to run on isolated mocks or a disposable PostgreSQL cluster after separate authorization: correct ADMIN UUID; a different authenticated user; no grant; revoked grant; malformed or request-forged UUID; invalid/expired session; wrong Auth issuer; missing DB secret; denied MVA and scoreboard base-table DML; forced-RLS denial for an unrelated role; function EXECUTE only for runtime; concurrent same/different-owner bootstrap calls; idempotent same-owner retry; forced audit insert failure rolling back grant; audited revoke and access removal; login/logout/refresh on ports 3000/3001 including conflicting MVA cookies. Use `db/verification/0002_runtime_acl_read_only.sql` for current catalog evidence and repeat it after approved DDL. Do not run proposed DDL or bootstrap against existing `mva_dev` as a test.

## Proposed artifacts and approval boundary

- [`01_runtime_lookup.review.sql`](../db/proposals/03g/01_runtime_lookup.review.sql): staged NOLOGIN runtime, NOLOGIN lookup owner, column grant, RLS policy, narrow lookup and ACLs. Password and LOGIN activation are separate approved operations.
- [`02_initial_admin.review.sql`](../db/proposals/03g/02_initial_admin.review.sql): temporary operator-only bootstrap function; bound UUID and reason are never stored in source.
- [`03_revoke_cleanup.review.sql`](../db/proposals/03g/03_revoke_cleanup.review.sql): audited revoke and bootstrap cleanup proposal.
- [`0002_runtime_acl_read_only.sql`](../db/verification/0002_runtime_acl_read_only.sql): repeatable read-only catalog report.
- [`0003_admin_bootstrap_read_only.sql`](../db/verification/0003_admin_bootstrap_read_only.sql): post-bootstrap aggregate and audit-link checks without printing Auth UUIDs.

Exact remaining owner approvals: the local target, current backup and DDL checksum; role creation and lookup RLS policy/function; secret provisioning plus LOGIN activation and pg_hba/network boundary; privately verified owner UUID and bootstrap execution; later revocation/cleanup; and any production or MVA ACL change. These are separate decisions. No approval is implied by account selection or this report.
