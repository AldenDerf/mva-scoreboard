# Phase 04 implementation and release gate

## Implemented locally

- Protected match list and test-match creation, protected scorekeeper, server-verified Supabase identity plus independent scoreboard role lookup, and assignment-aware database scoring.
- Server-only PostgreSQL connection through `scoreboard_runtime`; no fallback to existing `DATABASE_URL` or `DIRECT_URL`. Missing or failed runtime configuration denies access.
- Review-only SQL for test-match metadata, restricted database functions, transactional score commands, append-only events, idempotency, expected revision, and a public broadcast-safe snapshot. The command function locks the match row, rechecks grants and assignment, validates rules, updates state, and inserts the event atomically.
- Public `/overlay/[publicId]` reads only the published projection. It polls every 2.5 seconds, clears displayed scores on read failure, and reloads an authoritative snapshot. The scorekeeper reconciles every 3 seconds and blocks new actions while a save is unresolved. A failed save can be retried with the same action ID.
- Test matches use fictional names and an explicit test label. Official MVA catalog integration and official match creation are absent.

## Actual test evidence

Read-only local `mva_dev` inspection at `::1:5432` confirmed cluster `7629597861964584196`, PostgreSQL 18, seven scoreboard tables, FORCE RLS, zero policies, and only `reject_history_change()`. This remained unchanged after isolated testing.

A disposable PostgreSQL 18 cluster on `127.0.0.1:55438`, identifier `7695740017695138172`, applied the existing rehearsal foundation, an isolated copy of Phase 03G lookup, and isolated copies of the two Phase 04 proposals. SQL tests used synthetic identities and a rollback transaction. They covered unauthorized creation and snapshot denial, direct base-table denial, test-match creation, overlay read, point award/subtract, no negative point, same-ID replay, mismatched replay, stale revision, explicit set confirmation, and reopening the immediately previous empty set. A Node/pg integration test exercised the application data service against that restricted runtime, including concurrent awards at the same revision, durable reload, private-table denial, and overlay refresh after set confirmation. The cluster was stopped and its verified temporary files removed. These are isolated tests, not `mva_dev` or production authorization.

After the final pending-finalization change, a second disposable cluster (`7695744405019349316`) applied the SQL copies and passed all 29 tests. During agent takeover by Antigravity, a third disposable cluster (`7695753618853225028` on `127.0.0.1:55442`) re-applied foundation, lookup, schema, and command proposals, re-executed the rollback SQL transaction, and re-executed all 29 Node tests to 100% completion including pool shutdown and reverse-proxy protocol safety. That cluster was stopped and completely cleaned up. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, and `git diff --check` all pass cleanly. Local `mva_dev` remains 100% unmutated.

## Approval package: local `mva_dev`

Execution target is the verified local PostgreSQL 18 cluster and `mva_dev`, not production. These files are proposals only:

1. `db/proposals/03g/01_runtime_lookup.review.sql` — restricted NOLOGIN runtime and role lookup prerequisite.
2. `db/proposals/04/01_live_scoring.mva_dev.review.sql` — test-match schema changes and narrow read/create functions.
3. `db/proposals/04/02_scoring_commands.mva_dev.review.sql` — transactional scoring function.
4. `db/verification/0004_phase04_preflight_read_only.sql` — target and object inventory.

Before applying any of them, the owner must approve the exact SQL hashes, current backup and tested recovery point, target identity, new policy/function owner role, runtime LOGIN/secret activation, and network boundary. The existing Phase 03E foundation must not run again. The proposals require the existing match table to be empty, and each has a fixed local database/address/port/cluster guard. If any identity or inventory differs, stop and revise. Activation of a LOGIN and the first ADMIN grant are separate approvals.

Rollback before runtime use: disable the runtime LOGIN first, verify no match or event rows were added, then reverse only the newly introduced Phase 04 functions, policies, owner role, constraints, and columns in a reviewed transaction. If data exists, preserve it and use a forward repair or a separately approved restore; do not drop it to force a rollback. The pre-apply backup must cover ownership and ACLs, with verified hash, restore test, protected location, custodian, and retention period. Read-only post-apply verification must confirm table and policy inventory, function ACLs, no MVA table changes, and denied direct base-table access from the runtime session.

## Production and Vercel

No production database identity or schema inventory was available in this phase. The `mva` Vercel project exists; a read-only lookup did not find a separate `mva-scoreboard` project. No Vercel project or deployment was changed.

Production needs its own reviewed migration derived from actual Supabase schema inventory. Local identity guards cannot be reused. The owner must separately approve production backup/recovery, scoreboard schema and least-privilege functions, restricted connection-pooler credential and network route, verified Supabase Auth identity for initial ADMIN bootstrap, and an independent scoreboard Vercel project with server-only runtime variables. Never put the runtime URL in `NEXT_PUBLIC_` values. Connection pooling must be measured for serverless concurrency; the code caps each process pool at two connections.

## Remaining limits and Thursday readiness

- Neither `mva_dev` nor production has the runtime functions or an active scoreboard ADMIN. The protected application therefore fails closed. Its full signed-in browser flow has not been exercised.
- Production Supabase database name, schema, backup, Auth issuer, cookie/session behavior on the online URL, scorekeeper assignment provisioning, official MVA team eligibility, and deployment are unverified.
- Polling is implemented, but actual OBS Browser Source transparency, scaling, reconnect behavior, and the orientation computer are untested. A live score may be delayed by a polling interval plus network time.
- The app has no shared distributed rate limiter. Server authorization, row locking, revision checks, stable IDs, and disabled pending controls protect correctness; rate limits and capacity review remain release gates.
- The two SQL proposal files were tested only after target-guard adaptation in a disposable cluster. Review them against the real environment before any execution.

**Thursday online beta is not ready.** The shortest safe path is: approve and apply the local package with a restricted runtime; validate signed-in scoring; inspect production and prepare its exact migration; separately approve/apply production schema, credential, and ADMIN bootstrap; create a separate Vercel project and preview; then run the full browser and OBS acceptance scenario on the orientation computer. No broad approval is implied by this report.
