# Phase 03F approval report ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â runtime and first ADMIN

**Status: review only.** The Phase 03E foundation is already applied to local `mva_dev`; never replay it. No SQL, role, function, account, or grant change was executed in this phase. This proposal targets only the verified local database; production needs a separate review.

## Evidence and Auth identity

Read-only inspection of `mva_dev` on `[::1]:5432` found seven `scoreboard` tables, all owned by `postgres` with forced RLS and no policies; `scoreboard_server` and `scoreboard_overlay_reader` are `NOLOGIN`, non-superuser, `NOBYPASSRLS` roles. `scoreboard_server` has schema USAGE only. The overlay reader has schema USAGE and SELECT on `overlay_matches`. There is no runtime LOGIN, `auth.users`, role grant, or admin audit row. `postgres` owns all scoreboard objects and bypasses RLS, so its current connection strings must remain migration-only.

Both applications use the same configured Supabase issuer and `supabase.auth.getUser()` on the server. MVA additionally checks `profiles.auth_user_id` and `admin_access`; those MVA records confer **no** scoreboard access. Scoreboard uses a separate cookie name (`sb-mva-scoreboard-auth-token` by default), but localhost ports share a cookie host. The verified `user.id` returned by the scoreboard server's `getUser()` is the only identity input to scoreboard authorization. A UUID supplied in a request body, URL, or browser state is never accepted as the actor.

**Owner UUID lookup:** on a private, authorized scoreboard sign-in at `http://localhost:3001`, use a temporary server-only diagnostic that calls `getUser()` and displays the UUID only to that signed-in owner in the response with `Cache-Control: no-store`. Check the account in the Supabase Auth dashboard using its immutable user ID and confirm the issuer/project; compare the ID by a private channel before bootstrap. Remove the diagnostic before release. Do not log, screenshot, commit, email-match, or paste the UUID into tracked SQL. If the owner cannot independently confirm the account, stop. This lookup is planned, not performed; no live Auth request was made in this phase.

## Proposed database change, for separate approval

The following is the **proposed SQL** for a new reviewed migration. It is intentionally embedded as review text and has not been run. Run the DDL only as the controlled migration owner against a freshly checked, backed-up `mva_dev`; confirm existing role names, target identity and object ACLs first. The LOGIN password must be supplied through a secret channel and set separately, never committed. `scoreboard_runtime` is the application connection; `scoreboard_server` remains a capability group. No membership in `scoreboard_overlay_reader` or MVA roles is proposed.

```sql
BEGIN;
CREATE ROLE scoreboard_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  INHERIT NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON DATABASE mva_dev FROM scoreboard_runtime;
GRANT CONNECT ON DATABASE mva_dev TO scoreboard_runtime;
REVOKE ALL ON SCHEMA public FROM scoreboard_runtime;
GRANT scoreboard_server TO scoreboard_runtime;

CREATE FUNCTION scoreboard.active_role_for_user(p_user_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, scoreboard AS $$
  SELECT CASE WHEN count(*) FILTER (WHERE role = 'ADMIN') > 0 THEN 'ADMIN'
              WHEN count(*) FILTER (WHERE role = 'SCOREKEEPER') > 0 THEN 'SCOREKEEPER'
              ELSE NULL END
  FROM scoreboard.role_grants WHERE user_id = p_user_id AND revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION scoreboard.active_role_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scoreboard.active_role_for_user(uuid) TO scoreboard_server;
COMMIT;
```

The database and schema ACLs inherited through `PUBLIC` must be inspected before approval. A direct REVOKE from `scoreboard_runtime` does not remove `PUBLIC` privileges. If the cluster grants unwanted `PUBLIC` capabilities, use a scoped isolation plan; do not revoke `PUBLIC` globally without MVA impact review. The runtime connection must demonstrate no MVA table, schema CREATE, scoreboard base-table, sequence, or unauthorized function access. The function owner is currently `postgres`, which can read forced-RLS rows; this narrow privilege escalation needs fixed search path, no dynamic SQL, explicit EXECUTE ACL, and hostile-input tests. A dedicated NOLOGIN function owner with a narrow RLS policy is preferable if practical.

The active-role function alone cannot prove its UUID argument came from Auth: the server must call it only after `getUser()` succeeds. For future scoring/admin mutations, use separate narrowly scoped transaction functions that check active grant and match assignment inside the transaction, bind the server-verified actor UUID, enforce revision/idempotency, and append audit/event records. Do not grant generic INSERT/UPDATE on base tables. Because a stolen runtime credential could call any EXECUTE function with any UUID, protect it as a server secret, restrict database network access, and revisit database-bound identity assertions before exposing mutations. No mutation function is included in this phase.

## One-time ADMIN bootstrap proposal

After owner approval, an operator obtains the verified UUID privately and passes it as a bound parameter at execution time. The following function definition is the **proposed one-time bootstrap change** for the reviewed migration. Its owner must remain the migration operator (`postgres`); revoke PUBLIC EXECUTE and never grant it to `scoreboard_runtime`. Execute it only in a separately approved session after private parameter collection. It intentionally creates no grant if the same owner is already the sole active ADMIN, and rejects a different active ADMIN. The existing partial unique index also prevents a duplicate active `(user_id, role)` grant. Function execution is one transaction with the audit insert; failure rolls both back. The caller must verify the result and audit row after execution.

```sql
CREATE FUNCTION scoreboard.bootstrap_initial_admin(p_user_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, scoreboard AS $$
DECLARE v_existing uuid; v_id uuid;
BEGIN
  IF current_database() <> 'mva_dev' OR p_user_id IS NULL OR
     length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'invalid bootstrap target or parameters';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('scoreboard.initial_admin_bootstrap'));
  SELECT id INTO v_existing FROM scoreboard.role_grants
    WHERE role = 'ADMIN' AND revoked_at IS NULL AND user_id = p_user_id;
  IF EXISTS (SELECT 1 FROM scoreboard.role_grants
             WHERE role = 'ADMIN' AND revoked_at IS NULL AND user_id <> p_user_id) THEN
    RAISE EXCEPTION 'another active ADMIN exists';
  END IF;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO scoreboard.role_grants(user_id, role, granted_by_user_id)
  VALUES (p_user_id, 'ADMIN', p_user_id) RETURNING id INTO v_id;
  INSERT INTO scoreboard.admin_audit_events
    (actor_user_id, action, target_type, target_id, before_state, after_state, reason)
  VALUES (p_user_id, 'INITIAL_ADMIN_GRANTED', 'role_grant', v_id, NULL,
          jsonb_build_object('user_id', p_user_id, 'role', 'ADMIN'), p_reason);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION scoreboard.bootstrap_initial_admin(uuid,text) FROM PUBLIC;
```

The approved execution must use a transaction on the independently checked local cluster and an operator-only parameterized call, such as `SELECT scoreboard.bootstrap_initial_admin($1::uuid, $2::text)` through a client that binds parameters. The UUID and reason stay in protected operator input, never tracked files, process arguments, shell history, or logs. The operator first confirms the Auth UUID in the Supabase Auth dashboard and the signed-in server response. After verification, remove the bootstrap function in a separately reviewed cleanup migration so it cannot be called again. The local cluster identifier and pre-execution backup must be checked by the operator; this function guards the database name but cannot guard the cluster identifier by itself.
Revocation is a later, separately approved audited transaction: set `revoked_at` and `revoked_by_user_id` for the active grant, insert an `ADMIN_REVOKED` audit event with before/after state, commit, then verify `active_role_for_user` returns NULL and the next server request fails closed. Never delete historical grants or audits. Roll back the runtime DDL by first disabling the app connection, revoking EXECUTE/membership, dropping only the new function and runtime role after dependency review; preserve grant/audit history. A committed ADMIN bootstrap is reversed by audited revocation, not by restoring a database backup over intervening MVA data.

## Database objects affected

Proposed new objects: cluster role `scoreboard_runtime`; functions `scoreboard.active_role_for_user(uuid)` and `scoreboard.bootstrap_initial_admin(uuid,text)`. Proposed grant changes: `CONNECT` on `mva_dev`, membership in `scoreboard_server`, and EXECUTE on the lookup function. Approved bootstrap would insert one row each in `scoreboard.role_grants` and `scoreboard.admin_audit_events`. Existing MVA tables, users, permissions, and Supabase Auth records remain untouched.

## Application and verification plan

Replace `ACCESS_PENDING`'s stale comment and hardcoded NULL in `lib/auth/authorization.ts` with a server-only typed query to `active_role_for_user(user.id)`. An absent, revoked, malformed, ambiguous, or failed lookup returns unauthorized; database outages must fail closed and be distinguishable operationally from a missing grant. Keep `requireAdmin` and `requireScorekeeper` checks on every protected action and route; assignments need separate per-match checks. Never cache authorization across users or send runtime credentials to client code. Keep `/dev` gated by `NODE_ENV === 'development'`.

Before enabling runtime, test the correct owner, wrong user, missing and revoked grant, forged request UUID, expired/invalid session, wrong Supabase issuer, missing runtime secret, restricted role attributes, denied MVA/scoreboard base-table access, RLS default deny, function EXECUTE ACL, duplicate bootstrap, audit atomicity, and revoke. Test login/logout on localhost ports 3000 and 3001 with separate cookie names, including refresh and a stolen/invalid cookie. Run lint, TypeScript, tests, build, and diff checks again after implementation. No browser/OBS or live Auth identity test is claimed here.

## Approval boundary

Owner approval is required separately for (1) the finalized exact runtime DDL, credentials and local target; (2) the verified Auth UUID and finalized one-time ADMIN transaction; (3) any production database or Auth change. The owner-selected account is an identity choice only. This report grants no permission to execute any of those changes.
