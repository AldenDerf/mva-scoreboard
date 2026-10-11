# Architecture review — Phase 01C decisions

**Status:** documentation-only architecture decision, not implementation approval. MVA source was inspected read-only at local `C:/nextjs-projects/ts/mva` commit `7be8559`; its checked-in Prisma schema and queries are evidence of implementation, not confirmation of deployed production state. No scoreboard schema, API, authentication, or deployment has been implemented. Scoreboard table names below remain proposals.

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

The local MVA source confirms the schema relationships and existing `VERIFIED` public-directory filter; see the source review below. A scoreboard-specific restricted contract still needs MVA owner approval and implementation. Do not reuse a broad MVA service-role credential or expose player, payment, or audit records. At match creation, revalidate eligibility server-side and snapshot broadcast names/logos so an existing match remains stable if catalog data changes.

## Atomic scoring and realtime

Proposed command contract: stable client-generated request id, expected revision, action, and validated payload. In one transaction, lock the match or perform compare-and-swap on revision; verify status, grant, rules, and resulting state; append the event; update set/match state; increment revision; commit. A repeated request id returns its stored result without a second score change. A different request with an old revision returns a conflict and current state so the client can reconcile; do not silently replay it. Corrections and undo append compensating events referencing the original action, with legality checked against current state. Explicitly define rapid-tap UX and exact action semantics in Phase 04 before implementation.

Realtime broadcasts a match revision or change notice, not authority. Scorekeeper and overlay fetch current state on initial load, on notice, and after subscription reconnect. They should also perform a periodic reconciliation or equivalent recovery when notices are missed. A scorekeeper shows pending, saved, stale, and failed states honestly, and prevents ambiguous repeated actions while a mutation is unresolved. Overlay shows a safe loading/reconnecting state until a fresh snapshot is available; it never displays stale scores as live. Keep public reads bounded and rate limited where appropriate.

## Deployment and operational environments

Local development uses disposable/test data and credentials. Preview should use isolated services and test identities; production gets separate credentials, restricted MVA catalog access, backups, migration review, and observability. Vercel is a proposed host, not a configured deployment. Document actual environment variable names only when integration code exists; keep secrets server-only. Confirm public overlay caching behavior so snapshots are fresh and never inadvertently personalized. Set access, CORS, logo-host, and retention policies before launch.

## Decisions required before implementation

1. Confirm deployed MVA Auth project, cookie/redirect setup, and whether identity reuse is safe; select scoreboard database/project isolation.
2. MVA schema relationships are verified in source; approve tournament status/eligibility policy and an owner-approved restricted read contract.
3. Decide who may administer scoreboard grants, whether admins may score, and exact reopen/finalize policy.
4. Approve volleyball rule defaults and configuration limits, including deciding-set target, caps, and correction semantics.
5. Choose transactional mutation implementation, Realtime exposure model, public read rate limits, and retention policy.
6. Confirm deployment environments, logo allowlist, and production migration/rollback process.

## Guidelines consistency review

`AGENTS.md` and `UI_UX_GUIDELINES.md` agree on online-only scope, mobile-first scorekeeping, accessible controls, transparent read-only OBS output, restricted MVA reads, Git handoff, and separate manual/automated testing. The generated Next.js block is intact. The installed package is Next.js 16.4.0; its bundled App Router documentation is the source for future code changes. No correction to either guideline is needed in this phase.

## Phase 01B — verified MVA source contracts

### Authentication and identity

- `mva/lib/supabase/{client,server,proxy}.ts` uses `@supabase/ssr` browser/server clients with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `mva/proxy.ts` invokes session refresh with `auth.getUser()`. This confirms the code path, not the live Supabase project or cookie domain settings.
- `mva/app/admin/actions.ts` signs in with email/password, then calls `verifyAdminAuthorization`; an authenticated but unauthorized user is signed out. `mva/lib/auth/admin.ts` checks Supabase `auth.getUser()` and then `profiles.auth_user_id` → `admin_access`, requiring `is_active = true` and `role = 'ADMIN'`. The portal layout and mutation actions use `requireAdmin()`. The app-level check is essential because Auth identity alone conveys no admin rights.
- `mva/prisma/schema.prisma` has unique `profiles.auth_user_id` and one `admin_access` per profile. The scoreboard should hold its own `ADMIN` and `SCOREKEEPER` grants keyed to a verified Auth user id and its own assignments. An MVA `ADMIN` grant must **not** create a scoreboard grant implicitly.
- Identity reuse is feasible only if both apps deliberately trust the same Supabase Auth issuer/project and the scoreboard can validate sessions from its own origin. Cookies do not automatically cross separate domains. Verify Auth project ownership, cross-origin login flow, redirect allowlist, session refresh, revocation, and user-id mapping in a preview environment. If a separate Auth project is selected, use explicit invitation/provisioning or reviewed federation; equal email addresses are not identity proof. No public signup.

### Tournament and team data

`mva/prisma/schema.prisma` confirms `leagues` (name, year, status) as tournaments; `league_categories.league_id` as divisions; `registrations` with `(league_id, league_category_id, team_id, status)` as tournament entries; and reusable `teams` with `team_name` and nullable `logo_url`. The registration relation constrains the category to the same league, and `(league_id, league_category_id, team_id)` is unique. Registration status is `PENDING_PAYMENT`, `VERIFIED`, `REJECTED`, or `CANCELLED`. League status includes `DRAFT`, `OPEN_FOR_REGISTRATION`, `ADMIN_REGISTRATION_ONLY`, `REGISTRATION_CLOSED`, `ONGOING`, `COMPLETED`, and `ARCHIVED`.

`mva/lib/public/teams.ts` selects only `VERIFIED` registrations for one automatically chosen active league (`ONGOING`, `OPEN_FOR_REGISTRATION`, `REGISTRATION_CLOSED`), deduplicates by team id, and explicitly avoids private registration fields. That existing directory is **not** a multi-tournament integration API; it also exposes roster-oriented data elsewhere in the file. `mva/lib/admin/registration-create.ts` filters leagues for creating registrations, which is a different decision from scoreboard eligibility. A `VERIFIED` registration is the recommended team eligibility baseline. MVA must decide which league statuses can be scheduled/scored, including whether `ADMIN_REGISTRATION_ONLY` and `COMPLETED` are allowed for historical setup. Never infer team eligibility from payment tables or roster data in the scoreboard contract.

### Proposed narrow read contract (not present in MVA)

Use an MVA-owned authenticated server-to-server endpoint or equivalently restricted read model, versioned and scoped to this consumer. Example logical operations (paths are illustrative, not existing routes):

| Operation | Inputs | Minimum response |
| --- | --- | --- |
| List tournaments | Optional allowed status filter, bounded page cursor | `{ id: uuid, name: string, year: number|null, status: league_status }[]` |
| List divisions | `tournamentId: uuid` | `{ id: uuid, tournamentId: uuid, name: string }[]` |
| List eligible teams | `tournamentId: uuid`, `divisionId: uuid`, bounded page cursor | `{ registrationId: uuid, teamId: uuid, name: string, logoUrl: string|null }[]` |
| Validate matchup | Tournament, division, two distinct registration ids | Same minimal identities plus eligibility result, checked at match creation. |

All ids need UUID validation; division must belong to tournament, each registration must match both ids and be `VERIFIED`, and the two `teamId`s must differ. Return stable sorted/paginated results. Authenticate the calling scoreboard server with a scoped credential or signed machine identity stored only server-side; enforce authorization at MVA, rotate credentials, and log access without sensitive payloads. A cross-project direct database connection is a fallback only after least-privilege grants and review. No browser query to MVA privileged tables, and no service-role key shared with the scoreboard.

Limit responses to the fields above. Reject unapproved logo schemes/hosts; emit `null` for unusable or missing logos and render a fallback. Use a short bounded cache for browsing, with explicit invalidation/expiry; bypass stale cache for matchup validation. Distinguish 400 invalid input, 401/403 caller denial, 404 unknown tournament/division, 409 no longer eligible, and 503 upstream outage. Fail closed on create; show retry/last-known state to admin without fabricating eligibility. Confirm exact status policy, endpoint owner, credential mechanism, and cache lifetime before implementation.

## Phase 01B — scoreboard database and authorization analysis (superseded by Phase 01C defaults below)

For Phase 01C, the recommended MVP option is a shared Supabase Auth project with scoreboard tables in a separately owned schema in that project, subject to the deployment and access gates below. Store MVA UUIDs as external references and immutable broadcast snapshots. MVA remains authoritative for eligibility at match creation. Schema separation alone is insufficient: separate database privileges, RLS, service credentials, and migration ownership are required.

Proposed keys: UUID primary keys for matches, sets, events, role grants, and assignments; `matches.created_by_user_id` and event/assignment actor ids reference scoreboard identities (or immutable external Auth user ids if the Auth boundary is shared). `match_configurations.match_id` is unique and refers to `matches.id`; `match_sets` has unique `(match_id, set_number)`; `score_events` has unique `(match_id, revision)` and `(match_id, actor_user_id, idempotency_key)`, plus an index for chronological reads. Prefer a request ledger if administrative commands also need idempotency. Role grants have a unique active `(user_id, role)` index; scorekeeper assignments have a unique active `(match_id, user_id)` index and revocation timestamps. Do not cascade-delete event history. Check constraints cover nonnegative points, distinct teams, valid best-of and target ranges, bounded set numbers, and valid status values; transactional domain logic enforces cross-row outcomes. Never store MVA payment or player data.

Lifecycle proposal: `UPCOMING → LIVE → COMPLETED`, with `LIVE ↔ PAUSED` and `COMPLETED → LIVE` only through an audited admin reopen command. `CANCELLED` is an admin-only terminal state for an unplayed match; define whether cancellation after play is permitted. `ADMIN` may create/configure/assign/pause/finalize/reopen; `SCOREKEEPER` may score only actively assigned `LIVE` matches. Recheck grant, assignment, status, and expected revision in the mutation transaction. An admin's ability to score directly remains a policy decision, not an implied privilege. Public overlay receives a separate projection with no actor ids, request ids, or mutation endpoints.

## Phase 01B — scoring policy analysis (superseded by Phase 01C defaults below)

The [FIVB 2025–2028 indoor rules](https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN.pdf) specify best-of-five, first four sets to 25, deciding fifth to 15, each won by two; the rally winner scores, and the receiving team that wins a rally serves next. These are **official-rule reference values**. Best-of-three, alternate targets, a point cap, and any manual serve override are **MVA tournament-specific options**, requiring explicit approval; for best-of-three the proposed deciding third set target is 15. Default win-by-two with no cap unless approved otherwise. Configure normal/deciding targets and best-of on each match, then freeze rules at first live action.

Proposed action semantics: awarding a rally adds one point and sets serve to the rally winner. If scorekeeper input is a manual point adjustment rather than a rally result, do not infer service; require a separate `SET_SERVE` action. Choose one primary scoring interaction before Phase 04. Set win occurs only at target with a two-point lead; explicit set finalization confirms the computed winner and locks that set. At the majority of sets (2 in best-of-three, 3 in best-of-five), complete the match and reject further points. A correction/undo appends a compensating event referring to the original event, never rewrites it, and may require reopening a finalized set or match by an admin. Negative scores, duplicate undo, stale revisions, and illegal post-completion actions are rejected. Require confirmation for finalization, reset, and reopening; record reason and actor. Decide whether set completion is automatic upon winning rally or requires confirmation, how serve starts each set, whether corrections may cross set boundaries, and any tournament-specific cap.

## Phase 01B — OBS synchronization and build finding

Authorized scorekeeper → server-side Auth/grant/assignment/rules check → one atomic database commit of event and state/revision → Realtime notice → public overlay fetches a broadcast-safe snapshot. Initial load and reconnect also fetch; order snapshots by revision and ignore older notices. The overlay has no edit controls or privileged credentials. A duplicate idempotency key returns the original committed result; a different command with stale expected revision gets a conflict and current snapshot. Scorekeeper UI shows pending until server acknowledgement, then saved, conflict, or failed; after uncertainty it refetches before allowing another action. Realtime subscription alone never proves a score saved. Confirm whether a public Realtime channel can expose only opaque match id/revision; otherwise use a server-controlled notification relay.

The existing `app/layout.tsx` uses `next/font/google` for Geist and Geist Mono. Phase 01B `pnpm build` again failed fetching both stylesheets from `fonts.googleapis.com`; a separate PowerShell HEAD request to Google Fonts failed with a connection-closed error. This supports a network/connectivity cause in this host. It does not establish whether a proxy, TLS inspection, or remote endpoint is responsible, and it does not indicate a Next.js application configuration defect. Do not change the UI solely to hide the build failure.

## Phase 01C — MVP architecture decision

| Option | Security and compatibility | Complexity, cost, maintenance |
| --- | --- | --- |
| **Shared Supabase project/Auth, isolated scoreboard schema** | Reuses the same Auth issuer and stable user ids. Requires strict database grants, RLS, separate server credentials, and review of shared-project blast radius; MVA admin rights still confer no scoreboard rights. | Fewer identity flows and projects. Migration coordination with MVA is mandatory, and infrastructure failures remain coupled. |
| **Separate Supabase project** | Stronger project/database/key isolation. Existing MVA sessions and user ids cannot simply be trusted by a different Auth project; require explicit invite/provisioning or a reviewed federation/identity bridge. | More operational isolation but duplicate identity lifecycle, more credentials, possible extra project cost, and harder account deprovisioning. |

**Recommended for MVP:** shared Auth/project with a dedicated scoreboard schema, because existing MVA identities can be verified without copying passwords or equating email addresses, and the first release has fewer identity moving parts. This recommendation is **conditional** on confirming the deployed MVA Auth issuer and on the MVA owner approving namespace, migration ownership, restricted database privileges, and rollback in a nonproduction clone. If these gates fail, select a separate project with invite-only scoreboard accounts; do not improvise token sharing across projects. Independent web deployment and application ownership remain required even when persistence shares a project.

### Grant administration and session boundary

- Bootstrap exactly one initial scoreboard `ADMIN` through a reviewed, one-time, nonproduction-tested provisioning operation keyed to an existing verified Supabase Auth user id. Require an out-of-band owner approval for the production target, record the actor/ticket, and verify the grant. Do not infer it from `mva.admin_access`, email, or user metadata. No public signup or self-grant route.
- Thereafter an active scoreboard `ADMIN` may grant/revoke `ADMIN` or `SCOREKEEPER` and assign/revoke scorekeepers per match. Every change requires a fresh server-side Auth check, explicit policy check, and append-only audit entry. Prevent self-escalation and removal of the last active admin; consider two-person approval for later admin grants before production.
- `SCOREKEEPER` must have an active grant **and** active assignment to the target match for points, serve, and permitted corrections. Admins manage lifecycle and assignments; they score only if also explicitly assigned as a scorekeeper. A revoked grant or assignment takes effect at the next mutation, not only at next login. `OVERLAY_VIEWER` is a public read projection, never a persisted privilege grant.
- The scoreboard login on its own origin establishes its own cookie session against the same Auth issuer. Never rely on MVA browser cookies crossing domains. Validate the user with Supabase on each mutation and use a server-only database access path; direct browser mutation rights stay denied. Test cross-app logout and token revocation in preview.

### Tournament eligibility and historical stability

For new match creation, allow `leagues.status IN (REGISTRATION_CLOSED, ONGOING)` and require two distinct `registrations.status = VERIFIED` in the selected `league_categories` row. This is a **proposed MVA scheduling policy**, not a fact of MVA's current product. `DRAFT`, `OPEN_FOR_REGISTRATION`, and `ADMIN_REGISTRATION_ONLY` are excluded to avoid scheduling before entries settle; `COMPLETED` and `ARCHIVED` are excluded from new matches. MVA owners must approve this policy before integration release. A match created while allowed remains scoreable if the MVA tournament later changes status; do not recheck MVA for each rally. Store source UUIDs, names, division, tournament, and logo snapshot at creation. Completed historical matches and overlays read scoreboard snapshots without depending on MVA availability. New match creation fails closed if the catalog or final eligibility check is unavailable.

### Scoring and lifecycle policy locked for MVP design

The [FIVB 2025–2028 indoor rules](https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN.pdf) establish best-of-five, sets 1–4 to 25, deciding fifth to 15, win by two, and rally-winner service. The following best-of-three and operational choices are **proposed MVA application rules**, pending association approval:

- Formats: best-of-5 wins at 3 sets; best-of-3 wins at 2. Normal target 25; deciding set (set 5 or 3) target 15. All sets win by two with no point cap. Only best-of count is selectable in MVP; alternate targets/caps require later policy approval and versioned configuration.
- Setup records the initial serving team. A `RALLY_AWARDED(team)` command increments that team's point by one and makes it the serving team. `SET_SERVE(team)` is an attributed correction action with reason, never an unlogged toggle. Starting serve for a new set is entered by the scorekeeper with visible confirmation; do not infer it from previous-set winner.
- Reaching target with a two-point lead marks the set **pending finalization** and blocks further rallies. An assigned scorekeeper confirms the computed set winner. The transaction finalizes the set, opens the next set with scores zero and serve unset, or completes the match when the required number of sets is won. Confirmation is a safeguard, not a way to override the computed winner.
- A scorekeeper may undo only the latest reversible action in the current, unfinalized set, with an appended compensating event and reason. No negative score or duplicate undo. A finalized set or completed match can be changed only after an admin reopens it with a required reason and confirmation; this creates an audit event and restores `PAUSED`, then an assigned scorekeeper applies corrections before admin resumes `LIVE`. Cross-set corrections must unwind later sets in reverse order through explicit audited actions; no silent edits. Finalized match reopening never erases its prior completion record.
- State transitions: `UPCOMING → LIVE ↔ PAUSED → COMPLETED`; `COMPLETED → PAUSED` is admin-only reopen. `UPCOMING → CANCELLED` is admin-only, confirmed, and terminal. No reset/delete of matches in MVP. Server enforces legal actions for each state, expected revision, idempotency key, and active permission at commit time.

### MVA repository changes required before integration (documented only)

The existing public team directory is not the needed multi-tournament contract. An MVA-owned change should add a **server-only, authenticated, versioned read endpoint** (or equivalently restricted view/service) for the four operations above. It must apply the approved league-status and `VERIFIED` filters, validate tournament/division relationships, return only minimal identity/logo fields, and perform a fresh matchup validation for creation. Give its machine caller read-only scope, rotate its credential, rate-limit and audit access, and add contract tests proving no roster, registrant, payment, or admin data leaks. Review logo hosts and null fallback behavior. No MVA modification is authorized by this document.

### Nonproduction schema and migration proposal

The model in the table above is the schema target. In a **nonproduction clone only**, sequence migrations as: (1) create owned scoreboard schema and restricted database roles with no grants on MVA tables; (2) create identities/grants, admin audit, matches and immutable configuration/snapshots with checks/FKs; (3) create sets, append-only score events, assignment table, revision/idempotency indexes; (4) add RLS/default-deny policies and the narrow server mutation/read functions or equivalent transactional access; (5) seed only reviewed test users and synthetic matches; (6) run security and concurrency tests before preview wiring. No SQL or migration file is created in this phase.

Use UUID primary keys; MVA source ids are values with no destructive cross-schema cascade. Consider a unique partial index for active role grants and assignments, unique `(match_id, revision)` and `(match_id, actor_user_id, idempotency_key)` for events, and checks on distinct teams, nonnegative points, set bounds, rule ranges, and legal statuses. A single transaction locks the match row, checks grant/assignment/status/revision, appends event, and updates match/set projection. Freeze config once live. Explicitly verify PostgreSQL constraints that Prisma cannot represent before choosing tooling. Review database backup/restore and retention before production.

Rollback strategy: rehearse a forward migration and restore in a disposable clone. For additive steps, roll back app usage and revoke scoreboard grants before dropping only **empty** new scoreboard objects. Once real score events exist, do not drop history or blindly reverse schema; restore from verified backup or use a forward corrective migration with data preservation. Never roll back MVA schema or Auth users as a side effect. Record migration version, owner, backup point, and tested recovery time.

**Security verification checklist:** (1) anonymous and MVA-only users denied all scoreboard writes; (2) revoked roles/assignments denied immediately; (3) scorekeeper A cannot mutate match B; (4) admin cannot score absent assignment; (5) public projection contains only broadcast-safe fields; (6) direct browser database write and cross-schema MVA read denied; (7) duplicate requests return the first result, conflicting revisions cannot double-count; (8) append-only events and audit resist update/delete; (9) secrets stay server-only and logs redact credentials; (10) backup/restore and migration rollback tested in nonproduction; (11) expired/revoked sessions fail closed.

### Reproducible build validation under font network restrictions

The bundled Next.js App Router [font guide](../node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md) documents `next/font/local` for self-hosted files. First run an ordinary `pnpm build` on a network-enabled runner with access to Google Fonts and record that result. For deterministic offline CI, a later **separate code change** can vendor the licensed Geist font files and switch the same font families to `next/font/local`, preserving typography; review font license and visual equivalence first. The internal `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` hook found in bundled Next.js code is test-only and should not be treated as a supported production build path. Do not report lint/typecheck as a successful production build, and do not mask the download failure with fake CSS.

### Remaining gates

Confirm deployed Supabase issuer/project and ownership; obtain MVA owner approval for shared schema, catalog endpoint, and league-status policy; approve the proposed MVA scoring workflow and admin bootstrap; decide retention/backup period and production migration owner; validate fonts on a network-enabled runner. Until then these are documented design defaults, not deployed policy.
