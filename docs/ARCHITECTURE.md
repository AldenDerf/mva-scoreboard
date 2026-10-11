# Phase 01A architecture review

**Status:** proposal only. No application schema, API, integration, authentication, or deployment has been implemented. Names below are conceptual proposals, not verified MVA columns or existing contracts.

## Boundaries and data flow

1. A signed-in administrator uses the scoreboard server to browse a narrow MVA catalog and create a match. The catalog returns only tournament, division, eligible team identity, display name, and validated logo reference. No browser reads privileged MVA tables.
2. A signed-in, assigned scorekeeper submits an action with a request id and expected match revision. The server authenticates the user, authorizes the match, validates the action against rules, and commits the event plus updated state in one database transaction.
3. A public overlay reads a broadcast-safe projection by opaque match identifier. It has no mutation capability. Realtime prompts a refetch; a fresh server snapshot is authoritative at first load and after reconnect.

Keep scoring rules in a domain module independent of UI and storage. Put typed database and MVA access in server-only services. Validate all external input at the server boundary.

## Authentication and authorization

Supabase Auth is proposed for identity; no public self-registration. Reuse existing MVA identities only after confirming whether the same Auth project, session/cookie flow, and identity mapping can be safely shared. Scoreboard privileges must live in scoreboard-specific grants, never inferred from an MVA account or email address. `ADMIN` can create/configure matches, assign scorekeepers, and perform controlled lifecycle changes. `SCOREKEEPER` can mutate only assigned matches. `OVERLAY_VIEWER` is an anonymous read capability for a broadcast-safe projection, not a database write role.

Every mutation rechecks session and grants server-side. Database policy should be defense in depth, with direct client writes denied unless an explicitly reviewed policy is created. Service credentials stay server-only. Administrative changes need actor attribution and audit records. Add request size/rate limits or equivalent protection before release. Public overlay identifiers are unguessable but must not be treated as secrets or bearer tokens; public response data stays safe even when a link spreads.

## Proposed scoreboard data model

This is a logical model to review before migrations. Prefer a separate scoreboard PostgreSQL project unless identity/integration constraints make a shared project safer; either way, isolate scoreboard permissions.

| Entity | Proposed contents and relationships | Critical constraints and indexes |
| --- | --- | --- |
| `matches` | Opaque id, MVA tournament/division/team external ids plus immutable broadcast name/logo snapshots, status, current set, serve, revision, timestamps, creator. References rules configuration. | Distinct team ids; allowed status/serve values; unique public id; indexes on status and tournament/division; revision for optimistic concurrency. Validate logo URL host and scheme. |
| `match_configurations` | Best-of count, normal and deciding set targets, win-by-two policy, optional cap if approved. One configuration per match, snapshotted at creation. | Best-of limited to 3 or 5; positive sensible targets; consistent deciding-set settings; no rule edits after live start without explicit policy. |
| `match_sets` | Match id, set number, current/final points for each side, winner, start/end timestamps. | Unique `(match_id, set_number)`; nonnegative points; winner and completion consistent with rules; set number bounded by configuration. |
| `score_events` | Append-only ordered action history: match id, revision, actor id, action type, target side/set, request id, prior/result state metadata, optional referenced correction event, timestamp. | Unique `(match_id, revision)` and `(match_id, request_id)`; index on `(match_id, revision)`; foreign keys; no silent editing/deletion. Minimize any stored personal data. |
| `scoreboard_roles` | User id, application role, granting admin, grant/revoke timestamps. | Unique active grant per user/role; index by user and active status. Define whether admins also score by explicit policy. |
| `scorekeeper_assignments` | Match id, scorekeeper user id, assigning admin, grant/revoke timestamps. | Unique active match/user assignment; indexes on user and match. |
| `admin_audit_events` | Actor, target, lifecycle or permission action, timestamp, before/after summary. | Append-only; index by target and time. No credentials or private MVA data. |

Use database foreign keys and checked constraints where expressible, with transactional domain validation for win-by-two, set transitions, and completion. Reopening a finalized match requires an admin-only audited event. Specify deletion/retention policy before migrations; no silent cascade of score history.

## MVA catalog integration

The request identifies `leagues`, `league_categories`, `registrations`, and `teams` with `logo_url` as relevant MVA concepts. Their actual schema, eligibility statuses, API, and access model are **unverified**. First review the MVA repository and agree on a restricted server-to-server endpoint or read model. It should filter eligible registrations by selected league and category and return a minimal typed response. Authenticate the scoreboard server with least privilege, cache conservatively if needed, and validate responses and logo URLs. Do not reuse a broad MVA service-role credential or expose player, payment, or audit records. At match creation, revalidate eligibility server-side and snapshot broadcast names/logos so an existing match remains stable if catalog data changes.

## Atomic scoring and realtime

Proposed command contract: stable client-generated request id, expected revision, action, and validated payload. In one transaction, lock the match or perform compare-and-swap on revision; verify status, grant, rules, and resulting state; append the event; update set/match state; increment revision; commit. A repeated request id returns its stored result without a second score change. A different request with an old revision returns a conflict and current state so the client can reconcile; do not silently replay it. Corrections and undo append compensating events referencing the original action, with legality checked against current state. Explicitly define rapid-tap UX and exact action semantics in Phase 04 before implementation.

Realtime broadcasts a match revision or change notice, not authority. Scorekeeper and overlay fetch current state on initial load, on notice, and after subscription reconnect. They should also perform a periodic reconciliation or equivalent recovery when notices are missed. A scorekeeper shows pending, saved, stale, and failed states honestly, and prevents ambiguous repeated actions while a mutation is unresolved. Overlay shows a safe loading/reconnecting state until a fresh snapshot is available; it never displays stale scores as live. Keep public reads bounded and rate limited where appropriate.

## Deployment and operational environments

Local development uses disposable/test data and credentials. Preview should use isolated services and test identities; production gets separate credentials, restricted MVA catalog access, backups, migration review, and observability. Vercel is a proposed host, not a configured deployment. Document actual environment variable names only when integration code exists; keep secrets server-only. Confirm public overlay caching behavior so snapshots are fresh and never inadvertently personalized. Set access, CORS, logo-host, and retention policies before launch.

## Decisions required before implementation

1. Confirm MVA Auth project and whether identity reuse is safe; select scoreboard database/project isolation.
2. Verify MVA schema, eligibility status policy, and owner-approved restricted read contract.
3. Decide who may administer scoreboard grants, whether admins may score, and exact reopen/finalize policy.
4. Approve volleyball rule defaults and configuration limits, including deciding-set target, caps, and correction semantics.
5. Choose transactional mutation implementation, Realtime exposure model, public read rate limits, and retention policy.
6. Confirm deployment environments, logo allowlist, and production migration/rollback process.

## Guidelines consistency review

`AGENTS.md` and `UI_UX_GUIDELINES.md` agree on online-only scope, mobile-first scorekeeping, accessible controls, transparent read-only OBS output, restricted MVA reads, Git handoff, and separate manual/automated testing. The generated Next.js block is intact. The installed package is Next.js 16.4.0; its bundled App Router documentation is the source for future code changes. No correction to either guideline is needed in this phase.
